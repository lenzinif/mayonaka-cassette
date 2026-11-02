import type { BeatJudgementTier } from '@src/audio/BeatClock';
import type { BeatMap, SectionRole } from '@src/audio/BeatMap';
import { FunkAudioEngine, type DrivingAudioParams } from '@src/audio/FunkAudioEngine';
import {
  computeOverallRunGrade,
  computeStageGrade,
  TrackLibrary,
  type RunGrade,
  type StageScoreSummary,
} from '@src/audio/TrackLibrary';
import { RENDER_HEIGHT, RENDER_WIDTH, TELEMETRY_HZ } from '@src/config/constants';
import { tuning } from '@src/config/tuning';
import type { InputSource } from '@src/core/InputManager';
import { TelemetryBridge } from '@src/core/TelemetryBridge';
import type { GearNumber } from '@src/entities/Gearbox';
import { drawMelonSodaInset, MelonSoda } from '@src/entities/MelonSoda';
import {
  drawPlayerCar,
  PlayerCar,
  type CarEvent,
  type DriveControls,
  type GrooveTier,
} from '@src/entities/PlayerCar';
import { TrafficManager, type CollisionEvent } from '@src/entities/TrafficAndProps';
import {
  getStagePalette,
  PALETTE_SUNSET_BOULEVARD,
  type StagePalette,
} from '@src/road/palette';
import { cameraDepthFromFov, interpolate } from '@src/road/RoadProjection';
import { RoadRenderer, type RoadView } from '@src/road/RoadRenderer';
import { findSegment, type Track } from '@src/road/RoadSegment';
import {
  generateSongRoad,
  worldZToBar,
  worldZToBeat,
  type SongTrack,
} from '@src/road/SongRoadGenerator';
import { Background } from './Background';

/** Number of musical bars before the end of a track where the stage fork appears. */
const FORK_APPROACH_BARS = 6;

export interface ForkOptionInfo {
  branch: 'left' | 'right';
  mode: 'loop' | 'nextTrack' | 'finishRun';
  label: string;
  title: string;
  artist: string;
  bpm: number;
  contentHash: string;
  bestScore: number | null;
  bestGrade: RunGrade | null;
}

export interface RunSummary {
  totalScore: number;
  overallGrade: RunGrade;
  stages: readonly StageScoreSummary[];
  maxGroove: number;
  totalPerfectShifts: number;
  totalDropSyncs: number;
  totalCollisions: number;
  totalSodaSpills: number;
}

export interface TelemetrySnapshot {
  speedKmh: number;
  speedRatio: number;
  playerX: number;
  isDrifting: boolean;
  driftDirection: -1 | 0 | 1;
  driftTime: number;
  isOffRoad: boolean;
  lap: number;
  lapTime: number;
  lastLapTime: number | null;
  fps: number;
  // M3 Audio & Beat Clock telemetry
  bpm: number;
  barIndex: number;
  beatInBar: number;
  beatPulse: number;
  sectionRole: SectionRole;
  barEnergy: number;
  filterCutoffHz: number;
  trackTitle: string;
  trackArtist: string;
  audioUnlocked: boolean;
  // M4 Song-Driven Road telemetry
  roadBarIndex: number;
  totalBars: number;
  currentChunkId: string;
  syncDeltaBeats: number;
  // M5 Groove, Gearbox & Tofu Mode telemetry
  gear: GearNumber;
  rpm: number;
  autoShift: boolean;
  lastShiftTier: BeatJudgementTier | null;
  lastShiftDeltaMs: number | null;
  groove: number;
  grooveTier: GrooveTier;
  tofuMode: boolean;
  sodaDanger: number;
  sodaSpills: number;
  // M6 Playlist Run, Stage Fork & Scoring telemetry
  stageNumber: number;
  stagePaletteName: string;
  playlistIndex: number;
  playlistLength: number;
  stageScore: number;
  bestSongScore: number | null;
  bestSongGrade: RunGrade | null;
  isCrossfading: boolean;
  crossfadeProgress: number;
  isOutroLooping: boolean;
  forkActive: boolean;
  forkChoice: 'left' | 'right';
  forkProgress: number;
  forkLeftOption: ForkOptionInfo | null;
  forkRightOption: ForkOptionInfo | null;
}

export type GameEvent =
  | CarEvent
  | CollisionEvent
  | { type: 'lapCompleted'; lap: number; lapTime: number }
  | { type: 'sectionEntered'; role: SectionRole; barIndex: number }
  | { type: 'dropSync'; barIndex: number; deltaBeats: number }
  | { type: 'songRoadGenerated'; title: string; totalBars: number; chunkCount: number }
  | { type: 'tofuModeToggled'; active: boolean }
  | { type: 'autoShiftToggled'; enabled: boolean }
  | { type: 'sodaSpill'; spillCount: number; grooveLost: number }
  | { type: 'forkChoiceChanged'; choice: 'left' | 'right'; source: 'lane' | 'input' }
  | { type: 'stageCompleted'; summary: StageScoreSummary; isNewRecord: boolean }
  | {
      type: 'stageTransition';
      stageNumber: number;
      paletteName: string;
      trackTitle: string;
      trackArtist: string;
      bpm: number;
      contentHash: string;
      bestScore: number | null;
      bestGrade: RunGrade | null;
    }
  | { type: 'runCompleted'; summary: RunSummary };

export interface GameOptions {
  input: InputSource;
  bridge?: TelemetryBridge<TelemetrySnapshot, GameEvent>;
  track?: Track;
  palette?: StagePalette;
  audio?: FunkAudioEngine;
  library?: TrackLibrary;
}

function isSongTrack(track: Track): track is SongTrack {
  return 'barLengthWorld' in track && 'chunks' in track;
}

/**
 * Pure TypeScript game orchestrator (AGENTS.md §2: zero React imports).
 *
 * Advances simulation in fixed steps via `update(dt)` and renders interpolated state in
 * `render(ctx, alpha, fps)`.
 */
export class Game {
  track: Track;
  readonly car = new PlayerCar();
  readonly melonSoda = new MelonSoda();
  readonly traffic: TrafficManager;
  readonly bridge: TelemetryBridge<TelemetrySnapshot, GameEvent>;
  readonly audio: FunkAudioEngine;
  readonly library: TrackLibrary;
  palette: StagePalette;

  /** Camera Z position along the track, in world units [0, track.length). */
  position = 0;
  private prevPosition = 0;

  private simTime = 0;
  private lap = 1;
  private lapTime = 0;
  private lastLapTime: number | null = null;
  private lastFps = 0;

  private beatPulse = 0;
  private downbeatPulse = 0;
  private barIndex = 0;
  private beatInBar = 0;
  private audioBeatIndex = 0;
  private sectionRole: SectionRole = 'intro';
  private barEnergy = 0.5;

  private roadBarIndex = 0;
  private totalBars = 64;
  private currentChunkId = 'custom-track';
  private syncDeltaBeats = 0;

  // M6 Stage, Fork & Run state
  private stageNumber = 1;
  private stageScore = 0;
  private stagePerfectShifts = 0;
  private stageGoodShifts = 0;
  private stageDropSyncs = 0;
  private stageCollisions = 0;
  private stageSpills = 0;
  private stageGrooveTimeSum = 0;
  private stageGrooveTimeWeight = 0;
  private stageMaxGroove = 15;
  private stageTofuUsed = false;

  private forkActive = false;
  private forkChoice: 'left' | 'right' = 'right';
  private forkManualLock: 'left' | 'right' | null = null;
  private forkLastSign = 0;
  private forkProgress = 0;
  private earlyCrossfadeStarted = false;
  private readonly completedStages: StageScoreSummary[] = [];

  private readonly hasCustomTrack: boolean;
  private activeRoadBeatMap: BeatMap;
  private readonly crossedDropBars = new Set<number>();

  private readonly input: InputSource;
  private readonly roadRenderer = new RoadRenderer();
  private readonly background = new Background();

  private readonly controls: DriveControls = {
    left: false,
    right: false,
    accelerate: false,
    brake: false,
    drift: false,
  };

  private readonly drivingAudioParams: DrivingAudioParams = {
    speedRatio: 0,
    isDrifting: false,
    isOffRoad: false,
    offRoadDepth: 0,
    holdOutroLoop: false,
  };

  private collisionShake = 0;

  private readonly view: RoadView = {
    position: 0,
    playerX: 0,
    cameraHeight: tuning.cameraHeight,
    cameraDepth: cameraDepthFromFov(tuning.fieldOfView),
    roadWidth: tuning.roadWidth,
    drawDistance: tuning.drawDistance,
    fogDensity: tuning.fogDensity,
    width: RENDER_WIDTH,
    height: RENDER_HEIGHT,
    beatPulse: 0,
  };

  constructor(options: GameOptions) {
    this.input = options.input;
    this.bridge = options.bridge ?? new TelemetryBridge<TelemetrySnapshot, GameEvent>(TELEMETRY_HZ);
    this.audio = options.audio ?? new FunkAudioEngine();
    this.library = options.library ?? new TrackLibrary();
    this.palette = options.palette ?? PALETTE_SUNSET_BOULEVARD;
    this.hasCustomTrack = options.track !== undefined;
    this.activeRoadBeatMap = this.audio.beatMap;
    this.track = options.track ?? generateSongRoad(this.audio.beatMap);
    this.traffic = new TrafficManager(this.track, this.audio.beatMap.contentHash);
    this.updateRoadProgressTelemetry();
  }

  /** Regenerates the road and traffic from `beatMap` and resets run state when switching songs. */
  loadBeatMapRoad(beatMap: BeatMap, resetPosition = true): void {
    const prevLength = this.track.length;
    const songTrack = generateSongRoad(beatMap);
    this.track = songTrack;
    this.activeRoadBeatMap = beatMap;
    this.crossedDropBars.clear();
    this.earlyCrossfadeStarted = false;
    this.forkManualLock = null;
    this.traffic.spawnForTrack(songTrack, beatMap.contentHash);

    if (resetPosition) {
      this.position = 0;
      this.prevPosition = 0;
      this.lap = 1;
      this.lapTime = 0;
      this.resetStageMetrics();
    } else if (prevLength > 0) {
      const ratio = this.position / prevLength;
      this.position = (ratio * songTrack.length) % songTrack.length;
      this.prevPosition = this.position;
    }

    this.updateRoadProgressTelemetry();
    this.bridge.emit({
      type: 'songRoadGenerated',
      title: beatMap.title,
      totalBars: songTrack.totalBars,
      chunkCount: songTrack.chunks.length,
    });
  }

  /**
   * Restarts the playlist run from the first track (`index = 0`), resetting stage counters and scores.
   */
  restartPlaylistRun(): void {
    this.completedStages.length = 0;
    this.stageNumber = 1;
    this.palette = getStagePalette(0);
    const first = this.library.selectTrack(0);
    this.audio.loadTrack(first.beatMap, first.audioBuffer);
    this.loadBeatMapRoad(first.beatMap, true);
    const best = this.library.getBestScore(first.contentHash);
    this.bridge.emit({
      type: 'stageTransition',
      stageNumber: this.stageNumber,
      paletteName: this.palette.name,
      trackTitle: first.beatMap.title,
      trackArtist: first.beatMap.artist,
      bpm: first.beatMap.bpm,
      contentHash: first.contentHash,
      bestScore: best?.bestScore ?? null,
      bestGrade: best?.bestGrade ?? null,
    });
  }

  update = (dt: number): void => {
    // Detect BeatMap switch or manual BPM adjustment from TrackLoader (skip if early DJ crossfade is active)
    if (
      !this.hasCustomTrack &&
      !this.earlyCrossfadeStarted &&
      this.audio.beatMap !== this.activeRoadBeatMap
    ) {
      const isNewSong = this.audio.beatMap.contentHash !== this.activeRoadBeatMap.contentHash;
      this.loadBeatMapRoad(this.audio.beatMap, isNewSong);
    }

    this.prevPosition = this.position;

    // 1. Process timestamped discrete key presses (Beat-Shift, Tofu Mode, Auto-Shift, Fork Choice)
    const presses = this.input.consumePresses?.();
    if (presses && presses.length > 0) {
      for (let i = 0; i < presses.length; i++) {
        const p = presses[i]!;
        if (p.action === 'shiftUp' || p.action === 'shiftDown') {
          const dir = p.action === 'shiftUp' ? 'up' : 'down';
          const judgement = this.audio.judgeInputTimestamp(p.timeStamp);
          const shiftRes = this.car.shiftGear(
            dir,
            judgement,
            this.melonSoda.active,
            this.handleCarEvent,
          );
          if (shiftRes) {
            this.melonSoda.applyImpulse(shiftRes.shiftJerk);
            this.audio.triggerShiftSound(shiftRes.rewardTier, judgement.isDownbeat);
            if (shiftRes.rewardTier === 'PERFECT') {
              this.stagePerfectShifts++;
              this.stageScore += judgement.isDownbeat ? 500 : 350;
            } else if (shiftRes.rewardTier === 'GOOD') {
              this.stageGoodShifts++;
              this.stageScore += 150;
            }
          }
        } else if (p.action === 'tofuMode') {
          const active = this.melonSoda.toggle();
          if (active) this.stageTofuUsed = true;
          this.bridge.emit({ type: 'tofuModeToggled', active });
        } else if (p.action === 'autoShift') {
          this.car.gearbox.autoShift = !this.car.gearbox.autoShift;
          this.bridge.emit({ type: 'autoShiftToggled', enabled: this.car.gearbox.autoShift });
        } else if (p.action === 'forkLeft' && this.forkActive) {
          this.setForkManualChoice('left');
        } else if (p.action === 'forkRight' && this.forkActive) {
          this.setForkManualChoice('right');
        }
      }
    }

    // 2. Poll continuous driving controls
    this.controls.left = this.input.isDown('left');
    this.controls.right = this.input.isDown('right');
    this.controls.accelerate = this.input.isDown('accelerate');
    this.controls.brake = this.input.isDown('brake');
    this.controls.drift = this.input.isDown('drift');

    const cameraDepth = cameraDepthFromFov(tuning.fieldOfView);
    const playerZOffset = tuning.cameraHeight * cameraDepth;
    const prevPlayerWorldZ = this.position + playerZOffset;
    const playerSeg = findSegment(this.track, prevPlayerWorldZ);
    const slope = (playerSeg.p2.worldY - playerSeg.p1.worldY) / this.track.segmentLength;

    this.car.update(
      dt,
      this.controls,
      playerSeg.curve,
      slope,
      this.handleCarEvent,
      this.melonSoda.active,
    );

    // Accumulate continuous driving score & groove stats
    if (!this.car.isOffRoad && this.car.speedRatio > 0.2) {
      const tofuMult = this.melonSoda.active ? tuning.tofuGrooveMultiplier : 1;
      const driftMult = this.car.isDrifting ? 1.35 : 1.0;
      this.stageScore +=
        this.car.speedRatio * (22 + this.car.groove * 0.78) * tofuMult * driftMult * dt;
    }
    if (this.melonSoda.active) {
      this.stageTofuUsed = true;
    }
    this.stageGrooveTimeSum += this.car.groove * dt;
    this.stageGrooveTimeWeight += dt;
    if (this.car.groove > this.stageMaxGroove) {
      this.stageMaxGroove = Math.round(this.car.groove);
    }

    const nextPos = this.position + this.car.speed * dt;
    if (nextPos >= this.track.length) {
      this.handleStageOrLapEnd(nextPos);
    } else {
      this.position = nextPos;
    }

    const currPlayerWorldZ = this.position + playerZOffset;

    // 3. Advance AI Kei Trucks & resolve flow-preserving obstacle/traffic collisions
    this.traffic.update(
      dt,
      this.track,
      this.car,
      prevPlayerWorldZ,
      currPlayerWorldZ,
      this.handleCollision,
    );

    // 4. Advance Melon Soda liquid physics (only active when Tofu Mode is ON)
    this.melonSoda.update(
      dt,
      {
        lateralAccel: this.car.lateralAccel,
        longitudinalAccel: this.car.longitudinalAccel,
        verticalAccel: this.car.verticalAccel,
        isOffRoad: this.car.isOffRoad,
        speedRatio: this.car.speedRatio,
      },
      this.handleSodaSpill,
    );

    this.simTime += dt;
    this.lapTime += dt;
    if (this.collisionShake > 0) {
      this.collisionShake = Math.max(0, this.collisionShake - dt * 3.2);
    }

    this.updateRoadProgressTelemetry();
    this.updateForkState();

    // 5. Update reactive Web Audio filter/pitch and sample BeatClock
    this.drivingAudioParams.speedRatio = this.car.speedRatio;
    this.drivingAudioParams.isDrifting = this.car.isDrifting;
    this.drivingAudioParams.isOffRoad = this.car.isOffRoad;
    this.drivingAudioParams.offRoadDepth = this.car.isOffRoad
      ? Math.max(0, Math.min(1, (Math.abs(this.car.x) - 1.0) / 0.65))
      : 0;
    // If multi-track playlist is active and the player hasn't reached the final 2 bars yet,
    // instruct the DJ to loop the last 8 outro bars if the song finishes early (docs/DESIGN.md §3).
    this.drivingAudioParams.holdOutroLoop =
      this.library.hasMultipleTracks &&
      !this.hasCustomTrack &&
      this.roadBarIndex < Math.max(1, this.totalBars - 2);

    const prevRole = this.sectionRole;
    const clockState = this.audio.update(dt, this.drivingAudioParams);
    this.beatPulse = clockState.beatPulse;
    this.downbeatPulse = clockState.downbeatPulse;
    this.barIndex = Math.max(0, clockState.barIndex);
    this.beatInBar = clockState.beatInBar;
    this.audioBeatIndex = Math.max(0, clockState.beatFloat);
    this.sectionRole = clockState.sectionRole;
    this.barEnergy = clockState.barEnergy;

    if (clockState.justCrossedBar && this.sectionRole !== prevRole) {
      this.bridge.emit({
        type: 'sectionEntered',
        role: this.sectionRole,
        barIndex: this.barIndex,
      });
    }

    this.checkDropSync();

    this.background.update(dt, playerSeg.curve, this.car.speedRatio);
    this.bridge.offer(this.simTime, this.buildSnapshot);
  };

  render = (ctx: CanvasRenderingContext2D, alpha = 1, fps = 0): void => {
    this.lastFps = fps;
    const width = ctx.canvas.width || RENDER_WIDTH;
    const height = ctx.canvas.height || RENDER_HEIGHT;

    // Handle wrap-around across the start/finish line when interpolating position.
    let prevPos = this.prevPosition;
    if (this.position < prevPos) {
      prevPos -= this.track.length;
    }
    const renderPos =
      ((interpolate(prevPos, this.position, alpha) % this.track.length) + this.track.length) %
      this.track.length;
    const renderX = interpolate(this.car.prevX, this.car.x, alpha);

    const shakeOffset =
      this.collisionShake > 0.01
        ? Math.sin(this.simTime * 58) * this.collisionShake * 55
        : 0;

    this.view.position = renderPos;
    this.view.playerX = renderX;
    this.view.cameraHeight = tuning.cameraHeight + shakeOffset;
    this.view.cameraDepth = cameraDepthFromFov(tuning.fieldOfView);
    this.view.roadWidth = tuning.roadWidth;
    this.view.drawDistance = tuning.drawDistance;
    this.view.fogDensity = tuning.fogDensity;
    this.view.width = width;
    this.view.height = height;
    this.view.beatPulse = this.beatPulse;

    if (this.library.hasMultipleTracks && !this.hasCustomTrack && isSongTrack(this.track)) {
      const forkBars = Math.min(FORK_APPROACH_BARS, Math.floor(this.track.totalBars * 0.25));
      this.view.forkZoneStartZ = Math.max(
        0,
        this.track.length - forkBars * this.track.barLengthWorld,
      );
      this.view.forkChoice = this.forkChoice;
    } else {
      this.view.forkZoneStartZ = undefined;
      this.view.forkChoice = undefined;
    }

    this.background.render(ctx, width, height, this.palette, this.beatPulse, this.downbeatPulse);
    this.roadRenderer.render(ctx, this.track, this.view, this.palette, this.traffic);
    drawPlayerCar(ctx, this.car, width, height);
    drawMelonSodaInset(ctx, this.melonSoda, height, alpha);
  };

  private setForkManualChoice(choice: 'left' | 'right'): void {
    this.forkManualLock = choice;
    this.forkChoice = choice;
    // Gently position the car on the chosen branch side so physical lane and UI match
    if (choice === 'left' && this.car.x >= -0.15) {
      this.car.x = -0.45;
      this.car.prevX = -0.45;
    } else if (choice === 'right' && this.car.x <= 0.15) {
      this.car.x = 0.45;
      this.car.prevX = 0.45;
    }
    this.bridge.emit({ type: 'forkChoiceChanged', choice, source: 'input' });
  }

  private updateForkState(): void {
    if (!this.library.hasMultipleTracks || this.hasCustomTrack || !isSongTrack(this.track)) {
      this.forkActive = false;
      this.forkProgress = 0;
      this.forkManualLock = null;
      return;
    }

    const forkBars = Math.min(FORK_APPROACH_BARS, Math.floor(this.track.totalBars * 0.25));
    const forkStartZ = Math.max(0, this.track.length - forkBars * this.track.barLengthWorld);

    if (this.position >= forkStartZ) {
      this.forkActive = true;
      this.forkProgress = Math.max(
        0,
        Math.min(1, (this.position - forkStartZ) / Math.max(1, this.track.length - forkStartZ)),
      );

      // Physical OutRun lane steering determines branch choice; if the player manually pressed 1/2,
      // steering across the center line (>0.3) releases the lock and follows the car.
      if (this.forkManualLock === 'left' && this.car.x > 0.3) {
        this.forkManualLock = null;
      } else if (this.forkManualLock === 'right' && this.car.x < -0.3) {
        this.forkManualLock = null;
      }

      const nextChoice: 'left' | 'right' =
        this.forkManualLock ?? (this.car.x < 0 ? 'left' : 'right');
      const nextSign = nextChoice === 'left' ? -1 : 1;
      if (nextSign !== this.forkLastSign) {
        this.forkLastSign = nextSign;
        this.forkChoice = nextChoice;
        this.bridge.emit({ type: 'forkChoiceChanged', choice: nextChoice, source: 'lane' });
      } else {
        this.forkChoice = nextChoice;
      }

      // Running ahead (docs/DESIGN.md §3): reaching the final 2 bars before the fork early
      // while aligned with NEXT TRACK starts the 4-bar DJ crossfade early!
      if (
        !this.earlyCrossfadeStarted &&
        this.forkChoice === 'right' &&
        this.library.hasNextTrack &&
        this.roadBarIndex >= this.totalBars - 2 &&
        this.barIndex < this.totalBars - 2
      ) {
        const nextItem = this.library.nextTrackItem;
        if (nextItem) {
          this.earlyCrossfadeStarted = true;
          this.audio.crossfadeToTrack(nextItem.beatMap, nextItem.audioBuffer, 4);
        }
      }
    } else {
      this.forkActive = false;
      this.forkProgress = 0;
      this.forkManualLock = null;
      this.forkLastSign = 0;
    }
  }

  private handleStageOrLapEnd(nextPos: number): void {
    const completedBeatMap = this.activeRoadBeatMap;
    const avgGroove =
      this.stageGrooveTimeWeight > 0
        ? Math.round(this.stageGrooveTimeSum / this.stageGrooveTimeWeight)
        : Math.round(this.car.groove);
    const finalScore = Math.max(0, Math.round(this.stageScore));
    const grade = computeStageGrade(
      finalScore,
      avgGroove,
      this.stageSpills,
      this.stageCollisions,
    );

    const summary: StageScoreSummary = {
      stageNumber: this.stageNumber,
      contentHash: completedBeatMap.contentHash,
      title: completedBeatMap.title,
      artist: completedBeatMap.artist,
      bpm: completedBeatMap.bpm,
      score: finalScore,
      grade,
      avgGroove,
      maxGroove: this.stageMaxGroove,
      perfectShifts: this.stagePerfectShifts,
      goodShifts: this.stageGoodShifts,
      dropSyncs: this.stageDropSyncs,
      collisions: this.stageCollisions,
      sodaSpills: this.stageSpills,
      tofuModeUsed: this.stageTofuUsed,
      durationSec: Math.round(this.lapTime * 100) / 100,
    };

    const { isNewRecord } = this.library.recordStageResult(summary);
    summary.isNewRecord = isNewRecord;
    this.bridge.emit({ type: 'stageCompleted', summary, isNewRecord });

    // Single-track playlist OR player chose Left branch (LOOP CURRENT TRACK):
    if (!this.library.hasMultipleTracks || this.hasCustomTrack || this.forkChoice === 'left') {
      if (
        this.earlyCrossfadeStarted &&
        this.audio.beatMap.contentHash !== completedBeatMap.contentHash
      ) {
        const currentItem = this.library.activeItem;
        this.audio.crossfadeToTrack(currentItem.beatMap, currentItem.audioBuffer, 2);
      }
      this.earlyCrossfadeStarted = false;
      this.position = nextPos % this.track.length;
      this.lastLapTime = this.lapTime;
      this.crossedDropBars.clear();
      this.bridge.emit({ type: 'lapCompleted', lap: this.lap, lapTime: this.lapTime });
      this.lap++;
      this.lapTime = 0;
      this.resetStageMetrics();
      return;
    }

    // Multi-track playlist AND player chose Right branch:
    this.completedStages.push(summary);

    if (this.library.hasNextTrack) {
      const nextItem = this.library.advanceToNextTrack()!;
      this.stageNumber++;
      this.palette = getStagePalette(this.stageNumber - 1);
      this.audio.crossfadeToTrack(nextItem.beatMap, nextItem.audioBuffer, 4);
      this.loadBeatMapRoad(nextItem.beatMap, true);

      const best = this.library.getBestScore(nextItem.contentHash);
      this.bridge.emit({
        type: 'stageTransition',
        stageNumber: this.stageNumber,
        paletteName: this.palette.name,
        trackTitle: nextItem.beatMap.title,
        trackArtist: nextItem.beatMap.artist,
        bpm: nextItem.beatMap.bpm,
        contentHash: nextItem.contentHash,
        bestScore: best?.bestScore ?? null,
        bestGrade: best?.bestGrade ?? null,
      });
    } else {
      // Completed the final track of the playlist -> emit End-of-Run Grade Screen summary!
      const runSummary = this.buildRunSummary();
      this.bridge.emit({ type: 'runCompleted', summary: runSummary });
      this.position = nextPos % this.track.length;
      this.lastLapTime = this.lapTime;
      this.crossedDropBars.clear();
      this.lap++;
      this.lapTime = 0;
      this.resetStageMetrics();
    }
  }

  private buildRunSummary(): RunSummary {
    const stages =
      this.completedStages.length > 0 ? [...this.completedStages] : [];
    let totalScore = 0;
    let maxGroove = 0;
    let totalPerfectShifts = 0;
    let totalDropSyncs = 0;
    let totalCollisions = 0;
    let totalSodaSpills = 0;

    for (const s of stages) {
      totalScore += s.score;
      if (s.maxGroove > maxGroove) maxGroove = s.maxGroove;
      totalPerfectShifts += s.perfectShifts;
      totalDropSyncs += s.dropSyncs;
      totalCollisions += s.collisions;
      totalSodaSpills += s.sodaSpills;
    }

    return {
      totalScore,
      overallGrade: computeOverallRunGrade(stages),
      stages,
      maxGroove,
      totalPerfectShifts,
      totalDropSyncs,
      totalCollisions,
      totalSodaSpills,
    };
  }

  private resetStageMetrics(): void {
    this.stageScore = 0;
    this.stagePerfectShifts = 0;
    this.stageGoodShifts = 0;
    this.stageDropSyncs = 0;
    this.stageCollisions = 0;
    this.stageSpills = 0;
    this.stageGrooveTimeSum = 0;
    this.stageGrooveTimeWeight = 0;
    this.stageMaxGroove = Math.round(this.car.groove);
    this.stageTofuUsed = this.melonSoda.active;
  }

  private checkDropSync(): void {
    if (!isSongTrack(this.track)) return;
    for (const dm of this.track.dropMarkers) {
      if (this.crossedDropBars.has(dm.barIndex)) continue;
      if (this.prevPosition <= dm.worldZ && this.position >= dm.worldZ) {
        this.crossedDropBars.add(dm.barIndex);
        const dropBeat = dm.barIndex * 4;
        const deltaBeats = this.audioBeatIndex - dropBeat;
        if (Math.abs(deltaBeats) <= 1.25) {
          this.stageDropSyncs++;
          this.stageScore += 800;
          this.car.addGroove(
            tuning.grooveDropSyncGain,
            this.melonSoda.active,
            this.handleCarEvent,
          );
          this.audio.triggerFilterBlip(1.0);
          this.bridge.emit({
            type: 'dropSync',
            barIndex: dm.barIndex,
            deltaBeats,
          });
        }
      }
    }
  }

  private updateRoadProgressTelemetry(): void {
    if (!isSongTrack(this.track)) {
      this.roadBarIndex = 0;
      this.totalBars = this.activeRoadBeatMap.barEnergy.length;
      this.currentChunkId = 'test-track';
      this.syncDeltaBeats = 0;
      return;
    }

    const bar = Math.max(
      0,
      Math.min(this.track.totalBars - 1, worldZToBar(this.track, this.position)),
    );
    this.roadBarIndex = bar;
    this.totalBars = this.track.totalBars;

    const roadBeat = worldZToBeat(this.track, this.position);
    this.syncDeltaBeats = Math.round((roadBeat - this.audioBeatIndex) * 10) / 10;

    for (const chunk of this.track.chunks) {
      if (bar >= chunk.startBar && bar < chunk.startBar + chunk.bars) {
        this.currentChunkId = chunk.chunkId;
        break;
      }
    }
  }

  private readonly handleCarEvent = (event: CarEvent): void => {
    if (event.type === 'driftEnd' && event.duration >= 0.4) {
      this.audio.triggerFilterBlip(0.65);
    }
    this.bridge.emit(event);
  };

  private readonly handleCollision = (event: CollisionEvent): void => {
    if (event.outcome === 'truckKnockedOff') {
      // Sideswiping a Kei Truck off-road in a high-speed drift feels empowering: milder shake & impulse
      this.collisionShake = Math.max(this.collisionShake, 0.55);
      this.melonSoda.applyImpulse(event.side * 3.8);
      this.audio.triggerCollisionSound('traffic');
      this.stageScore += 400;
    } else {
      this.stageCollisions++;
      this.collisionShake = Math.max(this.collisionShake, 0.95);
      this.car.deductGroove(tuning.grooveCollisionPenalty, this.handleCarEvent);
      this.melonSoda.applyImpulse(event.side * 7.2);
      this.audio.triggerCollisionSound(event.obstacle);
    }
    this.bridge.emit(event);
  };

  private readonly handleSodaSpill = (): void => {
    this.stageSpills++;
    const grooveLost = this.car.deductTierProgressPct(
      tuning.tofuSpillGroovePenaltyPct,
      this.handleCarEvent,
    );
    this.audio.triggerSodaSpillSound();
    this.bridge.emit({
      type: 'sodaSpill',
      spillCount: this.melonSoda.spillCount,
      grooveLost,
    });
  };

  private buildForkLeftOption(): ForkOptionInfo | null {
    if (!this.forkActive) return null;
    const cur = this.activeRoadBeatMap;
    const best = this.library.getBestScore(cur.contentHash);
    return {
      branch: 'left',
      mode: 'loop',
      label: 'LOOP CURRENT TRACK',
      title: cur.title,
      artist: cur.artist,
      bpm: cur.bpm,
      contentHash: cur.contentHash,
      bestScore: best?.bestScore ?? null,
      bestGrade: best?.bestGrade ?? null,
    };
  }

  private buildForkRightOption(): ForkOptionInfo | null {
    if (!this.forkActive) return null;
    const next = this.library.nextTrackItem;
    if (next) {
      const best = this.library.getBestScore(next.contentHash);
      return {
        branch: 'right',
        mode: 'nextTrack',
        label: `NEXT STAGE (${this.library.currentIndex + 2}/${this.library.items.length})`,
        title: next.beatMap.title,
        artist: next.beatMap.artist,
        bpm: next.beatMap.bpm,
        contentHash: next.contentHash,
        bestScore: best?.bestScore ?? null,
        bestGrade: best?.bestGrade ?? null,
      };
    }
    const cur = this.activeRoadBeatMap;
    const best = this.library.getBestScore(cur.contentHash);
    return {
      branch: 'right',
      mode: 'finishRun',
      label: 'FINISH PLAYLIST RUN',
      title: 'FINAL GRADE & SCORE SUMMARY',
      artist: `${this.completedStages.length + 1} STAGES COMPLETED`,
      bpm: cur.bpm,
      contentHash: cur.contentHash,
      bestScore: best?.bestScore ?? null,
      bestGrade: best?.bestGrade ?? null,
    };
  }

  private readonly buildSnapshot = (): TelemetrySnapshot => {
    const curBest = this.library.getBestScore(this.activeRoadBeatMap.contentHash);
    return {
      speedKmh: this.car.speedKmh,
      speedRatio: this.car.speedRatio,
      playerX: this.car.x,
      isDrifting: this.car.isDrifting,
      driftDirection: this.car.driftDir,
      driftTime: this.car.driftTime,
      isOffRoad: this.car.isOffRoad,
      lap: this.lap,
      lapTime: this.lapTime,
      lastLapTime: this.lastLapTime,
      fps: this.lastFps,
      bpm: this.activeRoadBeatMap.bpm,
      barIndex: this.barIndex,
      beatInBar: this.beatInBar,
      beatPulse: this.beatPulse,
      sectionRole: this.sectionRole,
      barEnergy: this.barEnergy,
      filterCutoffHz: this.audio.cutoffHz,
      trackTitle: this.activeRoadBeatMap.title,
      trackArtist: this.activeRoadBeatMap.artist,
      audioUnlocked: this.audio.unlocked,
      roadBarIndex: this.roadBarIndex,
      totalBars: this.totalBars,
      currentChunkId: this.currentChunkId,
      syncDeltaBeats: this.syncDeltaBeats,
      gear: this.car.gear,
      rpm: this.car.rpm,
      autoShift: this.car.gearbox.autoShift,
      lastShiftTier: this.car.gearbox.lastShift?.rewardTier ?? null,
      lastShiftDeltaMs: this.car.gearbox.lastShift?.judgement.deltaMs ?? null,
      groove: Math.round(this.car.groove),
      grooveTier: this.car.grooveTier,
      tofuMode: this.melonSoda.active,
      sodaDanger: this.melonSoda.dangerRatio,
      sodaSpills: this.melonSoda.spillCount,
      stageNumber: this.stageNumber,
      stagePaletteName: this.palette.name,
      playlistIndex: this.library.currentIndex,
      playlistLength: this.library.items.length,
      stageScore: Math.round(this.stageScore),
      bestSongScore: curBest?.bestScore ?? null,
      bestSongGrade: curBest?.bestGrade ?? null,
      isCrossfading: this.audio.isCrossfading,
      crossfadeProgress: this.audio.crossfadeProgress,
      isOutroLooping: this.audio.isOutroLooping,
      forkActive: this.forkActive,
      forkChoice: this.forkChoice,
      forkProgress: this.forkProgress,
      forkLeftOption: this.buildForkLeftOption(),
      forkRightOption: this.buildForkRightOption(),
    };
  };
}
