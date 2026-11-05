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
import {
  AutopilotDriver,
  type AutopilotForkPerception,
  type AutopilotMode,
  type AutopilotPerception,
} from '@src/core/AutopilotDriver';
import type { InputSource } from '@src/core/InputManager';
import type { AssetPreloader } from '@src/core/AssetPreloader';
import { TelemetryBridge } from '@src/core/TelemetryBridge';
import type { GearNumber } from '@src/entities/Gearbox';
import { drawMelonSodaInset, MelonSoda, type SodaSkin } from '@src/entities/MelonSoda';
import { ParticleSystem } from '@src/entities/Particles';
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
  PALETTE_NIGHT_FUNK,
  type StagePalette,
} from '@src/road/palette';
import { cameraDepthFromFov, interpolate } from '@src/road/RoadProjection';
import { RoadRenderer, type RoadView } from '@src/road/RoadRenderer';
import {
  findSegment,
  getChosenForkCenter,
  getChosenForkHalfWidth,
  getForkCrossSection,
  type ForkCrossSection,
  type Track,
} from '@src/road/RoadSegment';
import {
  generateSongRoad,
  getSectionPaceFactor,
  isSongTrack,
  restoreCanonicalTrack,
  stitchHorizonToTargetZ,
  worldZToBar,
  worldZToBeat,
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
  hasStartedDriving: boolean;
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
  isLugging: boolean;
  isRedlining: boolean;
  isOverdrive: boolean;
  autoShift: boolean;
  lastShiftTier: BeatJudgementTier | null;
  lastShiftDeltaMs: number | null;
  groove: number;
  grooveTier: GrooveTier;
  tofuMode: boolean;
  sodaSkin: SodaSkin;
  sodaDanger: number;
  sodaSpills: number;
  // M7 Art & Atmosphere telemetry
  activeParticles: number;
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
  // M8 Polish & Lifecycle telemetry
  isPaused: boolean;
  gamepadConnected: boolean;
  autopilotActive: boolean;
  autopilotMode: AutopilotMode | null;
  // M8 Performance Profiler telemetry
  simTimeMs: number;
  renderTimeMs: number;
  frameTimeMs: number;
  fixedStepsLastFrame: number;
  drawnSegments: number;
  drawnProps: number;
  drawnTrucks: number;
  memoryMb: number | null;
}

function queryMemoryUsageMb(): number | null {
  const perfMem = (performance as unknown as { memory?: { usedJSHeapSize?: number } }).memory;
  if (perfMem?.usedJSHeapSize) {
    return Math.round((perfMem.usedJSHeapSize / (1024 * 1024)) * 10) / 10;
  }
  if (typeof process !== 'undefined' && typeof process.memoryUsage === 'function') {
    return Math.round((process.memoryUsage().heapUsed / (1024 * 1024)) * 10) / 10;
  }
  return null;
}

export type GameEvent =
  | CarEvent
  | CollisionEvent
  | { type: 'pauseChanged'; paused: boolean }
  | { type: 'lapCompleted'; lap: number; lapTime: number }
  | { type: 'sectionEntered'; role: SectionRole; barIndex: number }
  | { type: 'dropSync'; barIndex: number; deltaBeats: number }
  | { type: 'songRoadGenerated'; title: string; totalBars: number; chunkCount: number }
  | { type: 'tofuModeToggled'; active: boolean }
  | { type: 'sodaSkinChanged'; skin: SodaSkin }
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
  | { type: 'runCompleted'; summary: RunSummary }
  | { type: 'autopilotToggled'; enabled: boolean; mode: AutopilotMode };

export interface GameOptions {
  input: InputSource;
  bridge?: TelemetryBridge<TelemetrySnapshot, GameEvent>;
  track?: Track;
  palette?: StagePalette;
  audio?: FunkAudioEngine;
  library?: TrackLibrary;
  preloader?: AssetPreloader;
  autopilot?: AutopilotDriver;
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
  readonly particles = new ParticleSystem();
  readonly traffic: TrafficManager;
  readonly preloader?: AssetPreloader;
  readonly autopilot?: AutopilotDriver;
  readonly bridge: TelemetryBridge<TelemetrySnapshot, GameEvent>;
  readonly audio: FunkAudioEngine;
  readonly library: TrackLibrary;
  palette: StagePalette;

  /** Camera Z position along the track, in world units [0, track.length). */
  position = 0;
  private prevPosition = 0;

  /**
   * Whether the player has initiated driving on the current track/stage.
   * True only after the player accelerates, gives throttle, or shifts gear to drive forward.
   * False at startup, and reset to false when loading a new track or restarting a playlist run.
   */
  hasStartedDriving = false;

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
  private horizonStitchCooldown = 0;

  private isPaused = false;
  private renderDirty = true;
  private lastRenderCtx: CanvasRenderingContext2D | null = null;
  onTimingReset?: () => void;
  private readonly input: InputSource;
  private readonly roadRenderer = new RoadRenderer();
  private readonly background = new Background();

  // M8 Performance Profiler metrics
  private simTimeMs = 0;
  private simTimeAccumMs = 0;
  private simStepsSinceLastFrame = 0;
  private fixedStepsLastFrame = 0;
  private renderTimeMs = 0;
  private frameTimeMs = 16.67;
  private lastRenderTimestamp = 0;
  private memoryMb: number | null = null;
  private memoryCheckFrames = 0;

  private readonly controls: DriveControls = {
    left: false,
    right: false,
    accelerate: false,
    brake: false,
    drift: false,
  };

  get paused(): boolean {
    return this.isPaused;
  }

  setPaused(paused: boolean): void {
    if (this.isPaused === paused) return;
    this.isPaused = paused;
    this.renderDirty = true;
    if (paused) {
      void this.audio.pause();
    } else {
      void this.audio.resume();
      this.lastRenderTimestamp = performance.now();
      this.onTimingReset?.();
    }
    this.bridge.publish?.(this.buildSnapshot);
    this.bridge.emit({ type: 'pauseChanged', paused });
  }

  togglePause(): void {
    this.setPaused(!this.isPaused);
  }

  private readonly drivingAudioParams: DrivingAudioParams = {
    speedRatio: 0,
    isDrifting: false,
    isOffRoad: false,
    offRoadDepth: 0,
    holdOutroLoop: false,
  };

  private collisionShake = 0;
  private readonly forkBoundsScratch: ForkCrossSection = {
    t: 0,
    outerLimit: 1,
    innerGap: 0,
    branchCenter: 0.5,
    activeLeftEdge: -1,
    activeRightEdge: 1,
    recenterProgress: 0,
  };

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
    this.palette = options.palette ?? PALETTE_NIGHT_FUNK;
    this.hasCustomTrack = options.track !== undefined;
    this.activeRoadBeatMap = this.audio.beatMap;
    this.track = options.track ?? generateSongRoad(this.audio.beatMap);
    this.traffic = new TrafficManager(this.track, this.audio.beatMap.contentHash);
    this.preloader = options.preloader;
    this.autopilot = options.autopilot;
    if (this.autopilot) {
      this.autopilot.setPerception(this.buildAutopilotPerception());
    }
    this.updateRoadProgressTelemetry();
  }

  get isAutopilotActive(): boolean {
    return this.autopilot?.enabled ?? false;
  }

  toggleAutopilot(): boolean {
    if (!this.autopilot) return false;
    const active = this.autopilot.toggle();
    this.bridge.publish(this.buildSnapshot);
    this.bridge.emit({
      type: 'autopilotToggled',
      enabled: active,
      mode: this.autopilot.mode,
    });
    return active;
  }

  setAutopilotMode(mode: AutopilotMode): void {
    if (!this.autopilot) return;
    this.autopilot.mode = mode;
    this.bridge.publish(this.buildSnapshot);
  }

  buildAutopilotPerception(): AutopilotPerception {
    return {
      getCarState: () => ({
        x: this.car.x,
        speed: this.car.speed,
        speedRatio: this.car.speedRatio,
        gear: this.car.gear,
        rpm: this.car.rpm,
        isDrifting: this.car.isDrifting,
        steer: this.car.steer,
        isLugging: this.car.isLugging,
        isRedlining: this.car.isRedlining,
        isOffRoad: this.car.isOffRoad,
      }),
      getRoadAhead: (lookaheadDistance: number) => {
        const cameraDepth = cameraDepthFromFov(tuning.fieldOfView);
        const playerZ = this.position + tuning.cameraHeight * cameraDepth;
        const currSeg = findSegment(this.track, playerZ);
        const aheadSeg = findSegment(this.track, playerZ + lookaheadDistance);
        return {
          currentCurve: currSeg.curve,
          aheadCurve: aheadSeg.curve,
          slope: (currSeg.p2.worldY - currSeg.p1.worldY) / this.track.segmentLength,
        };
      },
      getUpcomingTraffic: (lookaheadDistance: number) => {
        const cameraDepth = cameraDepthFromFov(tuning.fieldOfView);
        const playerZ = this.position + tuning.cameraHeight * cameraDepth;
        const trucks = this.traffic.trucks;
        const result = [];
        const trackLen = this.track.length;
        for (let i = 0; i < trucks.length; i++) {
          const t = trucks[i]!;
          const dz = (t.z - playerZ + trackLen) % trackLen;
          if (dz > 0 && dz < lookaheadDistance) {
            result.push({ z: dz, laneOffset: t.laneOffset, speedRatio: t.speedRatio });
          }
        }
        return result;
      },
      getForkInfo: (): AutopilotForkPerception | undefined => {
        if (!this.forkActive) return undefined;
        const forkZoneStartZ = this.getForkZoneStartZ();
        let branchCenter = this.forkChoice === 'left' ? -0.5 : 0.5;
        if (forkZoneStartZ !== undefined && this.track.length > forkZoneStartZ) {
          const span = Math.max(1, this.track.length - forkZoneStartZ);
          const t = Math.max(0, Math.min(1, (this.position - forkZoneStartZ) / span));
          branchCenter = getChosenForkCenter(t, this.forkChoice);
        }
        return {
          active: true,
          choice: this.forkChoice,
          branchCenter,
        };
      },
      getAudioBeatState: () => {
        const now = typeof performance !== 'undefined' ? performance.now() : 0;
        const judgement = this.audio.judgeInputTimestamp(now);
        const clock = this.audio.beatClock.getState();
        return {
          beatPhase: clock.beatPhase,
          deltaMsToNearestBeat: judgement.deltaMs,
          nearestBeatIndex: judgement.beatIndex,
          isDownbeat: judgement.isDownbeat,
        };
      },
      isTofuModeActive: () => this.melonSoda.active,
    };
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
      this.hasStartedDriving = false;
      this.position = 0;
      this.prevPosition = 0;
      this.car.speed = 0;
      this.car.gearbox.gear = 1;
      this.car.x = 0;
      this.car.prevX = 0;
      this.lap = 1;
      this.lapTime = 0;
      this.resetStageMetrics();
    } else if (prevLength > 0) {
      const ratio = this.position / prevLength;
      this.position = (ratio * songTrack.length) % songTrack.length;
      this.prevPosition = this.position;
      this.horizonStitchCooldown = 0;
    }

    this.renderDirty = true;
    this.updateRoadProgressTelemetry();
    this.bridge.emit({
      type: 'songRoadGenerated',
      title: beatMap.title,
      totalBars: songTrack.totalBars,
      chunkCount: songTrack.chunks.length,
    });
  }

  /**
   * Advances seamlessly into the next stage of the playlist without stopping the car.
   * Preserves vehicle momentum (speed, gear, RPM, groove) while updating road, palette, and traffic.
   */
  private transitionToNextStage(beatMap: BeatMap, nextPos: number): void {
    const prevLength = this.track.length;
    const overshoot = Math.max(0, nextPos - prevLength);
    const songTrack = generateSongRoad(beatMap);
    this.track = songTrack;
    this.activeRoadBeatMap = beatMap;
    this.crossedDropBars.clear();
    this.earlyCrossfadeStarted = false;
    this.forkManualLock = null;
    this.forkActive = false;
    this.forkProgress = 0;
    this.forkLastSign = 0;
    this.horizonStitchCooldown = 0;
    this.traffic.spawnForTrack(songTrack, beatMap.contentHash);

    // Flow State (AGENTS.md Pillar 3): preserve vehicle momentum and continuous driving state
    this.hasStartedDriving = true;
    this.position = overshoot % songTrack.length;
    this.prevPosition = this.position;
    // this.car.speed, this.car.gearbox.gear, this.car.gearbox.rpm, this.car.groove are preserved!
    this.lap = 1;
    this.lapTime = 0;
    this.resetStageMetrics();

    this.renderDirty = true;
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
    this.hasStartedDriving = false;
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

  /**
   * Directly sets the active stage palette by index and notifies HUD and DebugPanel immediately.
   */
  setStagePaletteIndex(index: number): void {
    this.palette = getStagePalette(index);
    this.renderDirty = true;
    this.bridge.publish(this.buildSnapshot);
  }

  update = (dt: number): void => {
    const t0 = performance.now();

    // 0. Poll hardware controllers (Gamepad API & input state)
    this.input.poll?.();

    // 1. Process timestamped discrete key presses (Beat-Shift, Tofu Mode, Auto-Shift, Fork Choice, Pause)
    const presses = this.input.consumePresses?.();
    if (presses && presses.length > 0) {
      for (let i = 0; i < presses.length; i++) {
        const p = presses[i]!;
        if (p.action === 'pause') {
          this.togglePause();
          continue;
        }

        // When paused, pressing primary action buttons unpauses the game seamlessly
        if (this.isPaused) {
          if (
            p.action === 'accelerate' ||
            p.action === 'drift' ||
            p.action === 'shiftUp' ||
            p.action === 'brake'
          ) {
            this.setPaused(false);
          }
          continue;
        }

        if (p.action === 'shiftUp' || p.action === 'shiftDown') {
          this.hasStartedDriving = true;
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
              this.particles.emitBoostOrShiftBurst(
                this.car,
                RENDER_WIDTH,
                RENDER_HEIGHT,
                'PERFECT',
              );
            } else if (shiftRes.rewardTier === 'GOOD') {
              this.stageGoodShifts++;
              this.stageScore += 150;
              this.particles.emitBoostOrShiftBurst(this.car, RENDER_WIDTH, RENDER_HEIGHT, 'GOOD');
            }
          }
        } else if (p.action === 'tofuMode') {
          const active = this.melonSoda.toggle();
          if (active) this.stageTofuUsed = true;
          this.bridge.emit({ type: 'tofuModeToggled', active });
        } else if (p.action === 'cycleSodaSkin') {
          const skin = this.melonSoda.cycleSkin();
          this.bridge.emit({ type: 'sodaSkinChanged', skin });
        } else if (p.action === 'autoShift') {
          this.car.gearbox.autoShift = !this.car.gearbox.autoShift;
          this.bridge.emit({ type: 'autoShiftToggled', enabled: this.car.gearbox.autoShift });
        } else if (p.action === 'forkLeft' && this.forkActive) {
          this.setForkManualChoice('left');
        } else if (p.action === 'forkRight' && this.forkActive) {
          this.setForkManualChoice('right');
        } else if (p.action === 'toggleAutopilot') {
          this.toggleAutopilot();
        }
      }
    }

    // When paused, do not advance simulation clock, vehicle physics, road, or particles
    if (this.isPaused) {
      this.bridge.offer(this.simTime, this.buildSnapshot);
      const elapsed = performance.now() - t0;
      this.simStepsSinceLastFrame++;
      this.simTimeAccumMs += elapsed;
      return;
    }

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
    if (this.horizonStitchCooldown > 0) {
      this.horizonStitchCooldown = Math.max(0, this.horizonStitchCooldown - dt);
    }

    // 2. Poll continuous driving controls (digital buttons + analog Gamepad axes)
    this.controls.left = this.input.isDown('left');
    this.controls.right = this.input.isDown('right');
    this.controls.accelerate = this.input.isDown('accelerate');
    this.controls.brake = this.input.isDown('brake');
    this.controls.drift = this.input.isDown('drift');
    this.controls.steerAxis = this.input.getSteerAxis?.();
    this.controls.throttleAxis = this.input.getThrottleAxis?.();
    this.controls.brakeAxis = this.input.getBrakeAxis?.();

    if (!this.hasStartedDriving) {
      const throttleInput =
        this.controls.accelerate ||
        (this.controls.throttleAxis !== undefined && this.controls.throttleAxis > 0.05);
      const isMoving = this.car.speed > 0.5 || this.position > 1;
      if (throttleInput || isMoving) {
        this.hasStartedDriving = true;
      }
    }

    const cameraDepth = cameraDepthFromFov(tuning.fieldOfView);
    const playerZOffset = tuning.cameraHeight * cameraDepth;
    const prevPlayerWorldZ = this.position + playerZOffset;
    const playerSeg = findSegment(this.track, prevPlayerWorldZ);
    const slope = (playerSeg.p2.worldY - playerSeg.p1.worldY) / this.track.segmentLength;

    const forkZoneStartZ = this.getForkZoneStartZ();
    // Use `this.position` (matching `updateForkState` and `RoadRenderer` bottom-of-screen slice)
    // so `prevPlayerWorldZ` never wraps around `track.length` while the camera is still inside the fork!
    const forkBounds = getForkCrossSection(
      this.position,
      this.track.length,
      forkZoneStartZ,
      this.forkChoice,
      this.forkBoundsScratch,
    );

    this.car.update(
      dt,
      this.controls,
      playerSeg.curve,
      slope,
      this.handleCarEvent,
      this.melonSoda.active,
      forkBounds,
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

    const effectiveSpeed = this.computeElasticWorldSpeed();
    const nextPos = this.position + effectiveSpeed * dt;

    // Smoothly align car.x with the chosen fork branch as it converges back to center
    if (
      forkZoneStartZ !== undefined &&
      this.position >= forkZoneStartZ &&
      this.track.length > forkZoneStartZ
    ) {
      const span = Math.max(1, this.track.length - forkZoneStartZ);
      const tPrev = Math.max(0, Math.min(1, (this.position - forkZoneStartZ) / span));
      const tNext = Math.max(0, Math.min(1, (nextPos - forkZoneStartZ) / span));
      if (tNext > 0.65) {
        const centerPrev = getChosenForkCenter(tPrev, this.forkChoice);
        const centerNext = getChosenForkCenter(tNext, this.forkChoice);
        const deltaCenter = centerNext - centerPrev;
        this.car.x += deltaCenter;
        this.car.prevX += deltaCenter;

        const halfW = getChosenForkHalfWidth(tNext);
        const maxOffset = halfW * 0.85;
        const relX = this.car.x - centerNext;
        if (Math.abs(relX) > maxOffset) {
          const pull = (Math.sign(relX) * maxOffset - relX) * Math.min(1, dt * 5.0);
          this.car.x += pull;
          this.car.prevX += pull;
        }
      }
    }

    const wrappedAcrossStageEnd = nextPos >= this.track.length;
    if (wrappedAcrossStageEnd) {
      this.handleStageOrLapEnd(nextPos);
    } else {
      this.position = nextPos;
    }

    // 3. Advance AI Kei Trucks & resolve flow-preserving obstacle/traffic collisions.
    //    Clamp Z within `[0, track.length - 1]` while `this.position` is still before the finish line
    //    so `playerZOffset` (~866 world units ahead of the camera) never wraps into segment 0 props
    //    during the final 4 segments of the stage fork!
    const maxStageZ = Math.max(0, this.track.length - 1);
    const currPlayerWorldZ = wrappedAcrossStageEnd
      ? this.position + playerZOffset
      : Math.min(maxStageZ, this.position + playerZOffset);
    const safePrevPlayerWorldZ = wrappedAcrossStageEnd
      ? currPlayerWorldZ
      : Math.min(maxStageZ, prevPlayerWorldZ);
    const activeForkZoneStartZ = this.getForkZoneStartZ();
    this.traffic.update(
      dt,
      this.track,
      this.car,
      safePrevPlayerWorldZ,
      currPlayerWorldZ,
      this.handleCollision,
      activeForkZoneStartZ,
      this.hasStartedDriving,
      this.forkChoice,
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
    if (this.hasStartedDriving) {
      this.lapTime += dt;
    }
    if (this.collisionShake > 0) {
      this.collisionShake = Math.max(0, this.collisionShake - dt * 3.2);
    }

    this.updateRoadProgressTelemetry();
    this.updateForkState();

    // 5. Update reactive Web Audio filter/pitch and sample BeatClock
    this.drivingAudioParams.speedRatio = this.car.speedRatio;
    this.drivingAudioParams.isDrifting = this.car.isDrifting;
    this.drivingAudioParams.isOffRoad = this.car.isOffRoad;
    this.drivingAudioParams.offRoadDepth = this.car.offRoadDepth;
    // If multi-track playlist is active and the player is in the late approach to the stage fork
    // but hasn't reached the finish line yet (docs/OUTRO_EXTENSION_PROPOSALS.md), instruct the
    // audio engine to apply progressive Tape Drag and hold the Dub Tape Delay wash if the track concludes.
    // If the player is in early/mid stage (e.g. at the start of a lap or stopped),
    // the song wraps naturally to the intro rather than skipping to the outro.
    const forkApproachWindowBars = Math.max(
      4,
      Math.min(FORK_APPROACH_BARS + 4, Math.floor(this.totalBars * 0.5)),
    );
    const holdOutro =
      this.library.hasMultipleTracks &&
      !this.hasCustomTrack &&
      this.roadBarIndex >= this.totalBars - forkApproachWindowBars &&
      this.position < this.track.length;

    this.drivingAudioParams.holdOutroLoop = holdOutro;
    if (holdOutro && isSongTrack(this.track)) {
      const totalRoadBeats = this.track.totalBars * 4;
      const currentRoadBeat = worldZToBeat(this.track, this.position);
      this.drivingAudioParams.roadBeatsRemaining = Math.max(0, totalRoadBeats - currentRoadBeat);
    } else {
      this.drivingAudioParams.roadBeatsRemaining = undefined;
    }

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

    this.maybeStitchHorizonToMusic();
    this.checkDropSync();

    // 6. Advance M7 ParticleSystem
    this.particles.update(dt, this.car, RENDER_WIDTH, RENDER_HEIGHT, this.car.grooveTier);

    this.background.update(dt, playerSeg.curve, this.car.speedRatio, this.downbeatPulse);
    this.bridge.offer(this.simTime, this.buildSnapshot);

    const elapsed = performance.now() - t0;
    this.simStepsSinceLastFrame++;
    this.simTimeAccumMs += elapsed;
  };

  render = (ctx: CanvasRenderingContext2D, alpha = 1, fps = 0): void => {
    const t0 = performance.now();
    this.lastFps = fps;
    if (this.lastRenderTimestamp > 0) {
      const dt = Math.min(t0 - this.lastRenderTimestamp, 100);
      this.frameTimeMs = this.frameTimeMs * 0.85 + dt * 0.15;
    } else if (fps > 0) {
      this.frameTimeMs = 1000 / fps;
    }
    this.lastRenderTimestamp = t0;

    // While paused, render once to paint the frozen scene + pause overlay, then skip redundant redraws
    if (this.isPaused && !this.renderDirty && this.lastRenderCtx === ctx) {
      return;
    }
    this.lastRenderCtx = ctx;
    this.renderDirty = false;

    this.fixedStepsLastFrame = this.simStepsSinceLastFrame;
    this.simTimeMs = this.simTimeMs * 0.85 + this.simTimeAccumMs * 0.15;
    this.simStepsSinceLastFrame = 0;
    this.simTimeAccumMs = 0;

    this.memoryCheckFrames++;
    if (this.memoryCheckFrames >= 45) {
      this.memoryCheckFrames = 0;
      this.memoryMb = queryMemoryUsageMb();
    }

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

    const forkZoneStartZ = this.getForkZoneStartZ();
    this.view.forkZoneStartZ = forkZoneStartZ;
    this.view.forkChoice = forkZoneStartZ !== undefined ? this.forkChoice : undefined;

    this.background.render(ctx, width, height, this.palette, this.beatPulse, this.downbeatPulse);
    this.roadRenderer.render(ctx, this.track, this.view, this.palette, this.traffic);
    drawPlayerCar(ctx, this.car, width, height);
    this.particles.render(ctx, alpha);
    drawMelonSodaInset(ctx, this.melonSoda, height, alpha);

    if (this.isPaused) {
      drawPauseOverlay(ctx, width, height);
    }

    const renderElapsed = performance.now() - t0;
    this.renderTimeMs = this.renderTimeMs * 0.85 + renderElapsed * 0.15;
  };

  getForkZoneStartZ(): number | undefined {
    if (!this.library.hasMultipleTracks || this.hasCustomTrack || !isSongTrack(this.track)) {
      return undefined;
    }
    const forkBars = Math.min(FORK_APPROACH_BARS, Math.floor(this.track.totalBars * 0.25));
    return Math.max(0, this.track.length - forkBars * this.track.barLengthWorld);
  }

  private setForkManualChoice(choice: 'left' | 'right'): void {
    this.forkManualLock = choice;
    this.forkChoice = choice;
    this.forkLastSign = choice === 'left' ? -1 : 1;
    const forkZoneStartZ = this.getForkZoneStartZ();
    const bounds = getForkCrossSection(
      this.position,
      this.track.length,
      forkZoneStartZ,
      choice,
      this.forkBoundsScratch,
    );
    const targetX = choice === 'left' ? -bounds.branchCenter : bounds.branchCenter;
    // Gently position the car on the chosen branch center so physical lane, median island, and UI match
    if (choice === 'left' && this.car.x > -bounds.innerGap - 0.1) {
      this.car.x = targetX;
      this.car.prevX = targetX;
    } else if (choice === 'right' && this.car.x < bounds.innerGap + 0.1) {
      this.car.x = targetX;
      this.car.prevX = targetX;
    }
    this.bridge.emit({ type: 'forkChoiceChanged', choice, source: 'input' });
  }

  private updateForkState(): void {
    const forkStartZ = this.getForkZoneStartZ();
    if (forkStartZ === undefined) {
      this.forkActive = false;
      this.forkProgress = 0;
      this.forkManualLock = null;
      return;
    }

    if (this.position >= forkStartZ) {
      this.forkActive = true;
      this.forkProgress = Math.max(
        0,
        Math.min(1, (this.position - forkStartZ) / Math.max(1, this.track.length - forkStartZ)),
      );

      // Physical OutRun lane steering determines branch choice; if the player manually pressed 1/2,
      // steering across the center line (>0.3) releases the lock and follows the car.
      // Once convergence begins (forkProgress >= 0.65), the choice is committed and locked.
      if (this.forkProgress < 0.65 || this.forkLastSign === 0) {
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

    // Re-center the car from the widened Y-fork branch (`[-1.68..-0.52]` or `[+0.52..+1.68]`)
    // back onto the normal `[-0.85, +0.85]` road width so the player does not start the next
    // stage/lap in the off-road grass hitting segment-0 palm trees!
    this.recenterCarAfterFork();

    // Single-track playlist OR player chose Left branch (LOOP CURRENT TRACK):
    if (!this.library.hasMultipleTracks || this.hasCustomTrack || this.forkChoice === 'left') {
      const currentItem = this.library.activeItem;
      this.audio.crossfadeToTrack(currentItem.beatMap, currentItem.audioBuffer, 2, true);
      this.earlyCrossfadeStarted = false;
      if (isSongTrack(this.track)) {
        restoreCanonicalTrack(this.track);
      }
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
      this.transitionToNextStage(nextItem.beatMap, nextPos);

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
      if (isSongTrack(this.track)) {
        restoreCanonicalTrack(this.track);
      }
      this.position = nextPos % this.track.length;
      this.lastLapTime = this.lapTime;
      this.crossedDropBars.clear();
      this.lap++;
      this.lapTime = 0;
      this.resetStageMetrics();
      const currentItem = this.library.activeItem;
      this.audio.crossfadeToTrack(currentItem.beatMap, currentItem.audioBuffer, 2, true);
    }
  }

  /**
   * Re-centers/safely bounds the player's lateral offset `car.x` when crossing the finish line.
   * Because Phase 3 of the fork (t in [0.65, 1.0]) smoothly converges the chosen branch back
   * to center (0.0) and standard width (1.0), the car is already near standard road center.
   * This provides a gentle safety clamp to [-0.85, +0.85], resets bump velocity, and damps
   * residual steering so the player starts the next stage smoothly in flow state.
   */
  private recenterCarAfterFork(): void {
    if (Math.abs(this.car.x) > 0.85) {
      this.car.x = Math.sign(this.car.x) * 0.85;
      this.car.prevX = this.car.x;
    }
    this.car.bumpVx = 0;
    this.car.steer *= 0.3;
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

  /**
   * Computes the elastic road advancement speed (Micro Level A1), modulating dZ/dt within
   * [1 - syncMaxSlowdown, 1 + syncMaxSpeedup] to converge on upcoming drop crests and stage forks.
   */
  private computeElasticWorldSpeed(): number {
    if (!isSongTrack(this.track) || this.hasCustomTrack || this.car.speedRatio < 0.05) {
      return this.car.speed;
    }

    const paceFactor = getSectionPaceFactor(this.track, this.roadBarIndex, this.sectionRole);

    // 1. Convergence on visible upcoming anchor (next uncrossed drop marker or stage fork)
    let nextAnchor: { distRemaining: number; beatsRemaining: number } | null = null;

    for (const dm of this.track.dropMarkers) {
      if (this.crossedDropBars.has(dm.barIndex)) continue;
      if (dm.worldZ > this.position) {
        const dropBeat = dm.barIndex * 4;
        const beatsRemaining = dropBeat - this.audioBeatIndex;
        const distRemaining = dm.worldZ - this.position;
        if (beatsRemaining > 0.4 && beatsRemaining <= 32 && distRemaining > 0) {
          nextAnchor = { distRemaining, beatsRemaining };
          break;
        }
      }
    }

    if (!nextAnchor) {
      const totalBeats = this.track.totalBars * 4;
      const beatsRemaining = totalBeats - this.audioBeatIndex;
      const barsRemaining = beatsRemaining / 4;
      if (barsRemaining <= FORK_APPROACH_BARS + 2 && beatsRemaining > 0.4) {
        const distRemaining = this.track.length - this.position;
        if (distRemaining > 0) {
          nextAnchor = { distRemaining, beatsRemaining };
        }
      }
    }

    const minScale = 1 - tuning.syncMaxSlowdown;
    const maxScale = 1 + tuning.syncMaxSpeedup;

    if (nextAnchor) {
      const bpm = this.audio.beatMap.bpm > 0 ? this.audio.beatMap.bpm : 120;
      const timeRemainingSec = nextAnchor.beatsRemaining * (60 / bpm);
      if (timeRemainingSec > 0.01) {
        const targetSpeed = nextAnchor.distRemaining / timeRemainingSec;
        const ratio = targetSpeed / Math.max(1, this.car.speed);
        const scale = Math.max(minScale, Math.min(maxScale, ratio));
        return this.car.speed * scale;
      }
    }

    // 2. Continuous alignment between anchors
    const roadBeat = worldZToBeat(this.track, this.position);
    const lagBeats = this.audioBeatIndex - roadBeat;
    const paceInv = paceFactor > 0 ? 1 / paceFactor : 1;
    const rawScale = paceInv + lagBeats * tuning.syncElasticGain;
    const scale = Math.max(minScale, Math.min(maxScale, rawScale));

    return this.car.speed * scale;
  }

  /**
   * Evaluates macro lag between audio clock and road position (Macro Level A2).
   * If lag exceeds tuning.syncHorizonStitchBars and no drop marker is in the near view,
   * executes a seamless horizon phase stitch and shifts visible Kei Trucks.
   */
  private maybeStitchHorizonToMusic(): void {
    if (!isSongTrack(this.track) || this.hasCustomTrack) return;
    if (this.car.speedRatio < 0.12) return;
    if (this.forkActive) return;
    if (this.horizonStitchCooldown > 0) return;

    // Do not stitch if an upcoming drop marker is already visible in front of the car
    const safeAheadWorldZ = Math.floor(tuning.drawDistance * 0.75) * this.track.segmentLength;
    const hasImminentDrop = this.track.dropMarkers.some(
      (dm) =>
        !this.crossedDropBars.has(dm.barIndex) &&
        dm.worldZ >= this.position &&
        dm.worldZ <= this.position + safeAheadWorldZ,
    );
    if (hasImminentDrop) return;

    const audioBarFloat = this.audioBeatIndex / 4;
    const roadBarFloat = this.position / this.track.barLengthWorld;
    const lagBars = audioBarFloat - roadBarFloat;

    // Guard against false lag if the road wrapped early in single-track loop mode
    if (lagBars > this.totalBars * 0.5) return;

    const isForkTailApproach =
      audioBarFloat >= this.totalBars - (FORK_APPROACH_BARS + 2) &&
      this.totalBars - roadBarFloat > FORK_APPROACH_BARS + 2.5;

    if (lagBars >= tuning.syncHorizonStitchBars || isForkTailApproach) {
      const targetZ = Math.min(
        this.track.length - (FORK_APPROACH_BARS + 1) * this.track.barLengthWorld,
        audioBarFloat * this.track.barLengthWorld,
      );
      const res = stitchHorizonToTargetZ(
        this.track,
        this.position,
        targetZ,
        Math.floor(tuning.drawDistance),
      );
      if (res !== null) {
        this.traffic.shiftVisibleWindowTrucks(
          this.track,
          this.position,
          res.deltaZ,
          res.copiedWindowSegs * this.track.segmentLength,
        );
        this.position += res.deltaZ;
        this.prevPosition += res.deltaZ;
        this.horizonStitchCooldown = 1.5;
        this.updateRoadProgressTelemetry();
        this.updateForkState();
      } else {
        // Avoid retrying failed stitches at 120 Hz when near track boundaries
        this.horizonStitchCooldown = 1.0;
      }
    }
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
          this.particles.emitBoostOrShiftBurst(this.car, RENDER_WIDTH, RENDER_HEIGHT, 'PERFECT');
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
      this.particles.emitBoostOrShiftBurst(this.car, RENDER_WIDTH, RENDER_HEIGHT, 'DRIFT_EXIT');
    }
    this.bridge.emit(event);
  };

  private readonly handleCollision = (event: CollisionEvent): void => {
    this.particles.emitCollisionBurst(event, this.car, RENDER_WIDTH, RENDER_HEIGHT);
    if (event.outcome === 'truckKnockedOff') {
      // Sideswiping a Kei Truck off-road in a high-speed drift feels empowering: milder shake & impulse
      this.collisionShake = Math.max(this.collisionShake, 0.55);
      this.melonSoda.applyImpulse(event.side * 3.8);
      this.audio.triggerCollisionSound('traffic');
      this.stageScore += 400;
    } else if (event.outcome === 'propBounce') {
      // Roadside prop scrape: gentle arcade rub and clean flow retention
      this.stageCollisions++;
      this.collisionShake = Math.max(this.collisionShake, 0.35);
      this.car.deductGroove(tuning.grooveCollisionPenalty * 0.6, this.handleCarEvent);
      this.melonSoda.applyImpulse(event.side * 2.8);
      this.audio.triggerCollisionSound('prop');
    } else {
      this.stageCollisions++;
      this.collisionShake = Math.max(this.collisionShake, 0.85);
      this.car.deductGroove(tuning.grooveCollisionPenalty, this.handleCarEvent);
      this.melonSoda.applyImpulse(event.side * 6.5);
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
      hasStartedDriving: this.hasStartedDriving,
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
      isLugging: this.car.isLugging,
      isRedlining: this.car.isRedlining,
      isOverdrive: this.car.isOverdrive,
      autoShift: this.car.gearbox.autoShift,
      lastShiftTier: this.car.gearbox.lastShift?.rewardTier ?? null,
      lastShiftDeltaMs: this.car.gearbox.lastShift?.judgement.deltaMs ?? null,
      groove: Math.round(this.car.groove),
      grooveTier: this.car.grooveTier,
      tofuMode: this.melonSoda.active,
      sodaSkin: this.melonSoda.skin,
      sodaDanger: this.melonSoda.dangerRatio,
      sodaSpills: this.melonSoda.spillCount,
      activeParticles: this.particles.activeCount,
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
      isPaused: this.isPaused,
      gamepadConnected: this.input.isGamepadConnected?.() ?? false,
      autopilotActive: this.isAutopilotActive,
      autopilotMode: this.autopilot?.mode ?? null,
      // M8 Performance Profiler telemetry
      simTimeMs: Math.round(this.simTimeMs * 100) / 100,
      renderTimeMs: Math.round(this.renderTimeMs * 100) / 100,
      frameTimeMs: Math.round(this.frameTimeMs * 10) / 10,
      fixedStepsLastFrame: this.fixedStepsLastFrame,
      drawnSegments: this.roadRenderer.stats.drawnSegments,
      drawnProps: this.roadRenderer.stats.drawnProps,
      drawnTrucks: this.roadRenderer.stats.drawnTrucks,
      memoryMb: this.memoryMb,
    };
  };
}

/**
 * 80s arcade pause overlay drawn directly on the Canvas (AGENTS.md §4.9 & §5 M8).
 */
export function drawPauseOverlay(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
): void {
  ctx.save();
  ctx.fillStyle = 'rgba(6, 1, 18, 0.78)';
  ctx.fillRect(0, 0, width, height);

  const boxW = 260;
  const boxH = 88;
  const boxX = Math.round((width - boxW) * 0.5);
  const boxY = Math.round((height - boxH) * 0.5 - 12);

  ctx.fillStyle = 'rgba(13, 2, 33, 0.96)';
  const roundRectSupported = typeof (ctx as unknown as { roundRect?: unknown }).roundRect === 'function';
  if (roundRectSupported) {
    ctx.beginPath();
    (ctx as unknown as { roundRect: (x: number, y: number, w: number, h: number, r: number) => void }).roundRect(
      boxX,
      boxY,
      boxW,
      boxH,
      6,
    );
    ctx.fill();
    ctx.strokeStyle = '#05d9e8';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.beginPath();
    (ctx as unknown as { roundRect: (x: number, y: number, w: number, h: number, r: number) => void }).roundRect(
      boxX + 3,
      boxY + 3,
      boxW - 6,
      boxH - 6,
      4,
    );
    ctx.strokeStyle = '#ff2a6d';
    ctx.lineWidth = 1;
    ctx.stroke();
  } else {
    ctx.fillRect(boxX, boxY, boxW, boxH);
    ctx.strokeStyle = '#05d9e8';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(boxX, boxY, boxW, boxH);

    ctx.strokeStyle = '#ff2a6d';
    ctx.lineWidth = 1;
    ctx.strokeRect(boxX + 3, boxY + 3, boxW - 6, boxH - 6);
  }

  ctx.fillStyle = '#ff2a6d';
  ctx.font = '900 20px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('PAUSED', Math.round(width * 0.5), boxY + 28);

  ctx.fillStyle = '#05d9e8';
  ctx.font = '700 9px monospace';
  ctx.fillText('PRESS [P], [ESC] OR GAMEPAD [START]', Math.round(width * 0.5), boxY + 52);

  ctx.fillStyle = '#f472b6';
  ctx.font = '700 8px monospace';
  ctx.fillText('CLICK ANYWHERE TO RESUME', Math.round(width * 0.5), boxY + 68);

  ctx.restore();
}
