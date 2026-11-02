import type { BeatMap, SectionRole } from '@src/audio/BeatMap';
import { FunkAudioEngine, type DrivingAudioParams } from '@src/audio/FunkAudioEngine';
import { RENDER_HEIGHT, RENDER_WIDTH, TELEMETRY_HZ } from '@src/config/constants';
import { tuning } from '@src/config/tuning';
import type { InputSource } from '@src/core/InputManager';
import { TelemetryBridge } from '@src/core/TelemetryBridge';
import {
  drawPlayerCar,
  PlayerCar,
  type CarEvent,
  type DriveControls,
} from '@src/entities/PlayerCar';
import { PALETTE_SUNSET_BOULEVARD, type StagePalette } from '@src/road/palette';
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
}

export type GameEvent =
  | CarEvent
  | { type: 'lapCompleted'; lap: number; lapTime: number }
  | { type: 'sectionEntered'; role: SectionRole; barIndex: number }
  | { type: 'dropSync'; barIndex: number; deltaBeats: number }
  | { type: 'songRoadGenerated'; title: string; totalBars: number; chunkCount: number };

export interface GameOptions {
  input: InputSource;
  bridge?: TelemetryBridge<TelemetrySnapshot, GameEvent>;
  track?: Track;
  palette?: StagePalette;
  audio?: FunkAudioEngine;
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
  readonly bridge: TelemetryBridge<TelemetrySnapshot, GameEvent>;
  readonly audio: FunkAudioEngine;
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

  private readonly hasCustomTrack: boolean;
  private activeBeatMapRef: BeatMap;
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
    this.palette = options.palette ?? PALETTE_SUNSET_BOULEVARD;
    this.hasCustomTrack = options.track !== undefined;
    this.activeBeatMapRef = this.audio.beatMap;
    this.track = options.track ?? generateSongRoad(this.audio.beatMap);
    this.updateRoadProgressTelemetry();
  }

  /** Regenerates the road from `beatMap` and resets run state when switching songs. */
  loadBeatMapRoad(beatMap: BeatMap, resetPosition = true): void {
    const prevLength = this.track.length;
    const songTrack = generateSongRoad(beatMap);
    this.track = songTrack;
    this.activeBeatMapRef = beatMap;
    this.crossedDropBars.clear();

    if (resetPosition) {
      this.position = 0;
      this.prevPosition = 0;
      this.lap = 1;
      this.lapTime = 0;
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

  update = (dt: number): void => {
    // Detect BeatMap switch or manual BPM adjustment from TrackLoader
    if (!this.hasCustomTrack && this.audio.beatMap !== this.activeBeatMapRef) {
      const isNewSong = this.audio.beatMap.contentHash !== this.activeBeatMapRef.contentHash;
      this.loadBeatMapRoad(this.audio.beatMap, isNewSong);
    }

    this.prevPosition = this.position;

    this.controls.left = this.input.isDown('left');
    this.controls.right = this.input.isDown('right');
    this.controls.accelerate = this.input.isDown('accelerate');
    this.controls.brake = this.input.isDown('brake');
    this.controls.drift = this.input.isDown('drift');

    const cameraDepth = cameraDepthFromFov(tuning.fieldOfView);
    const playerZ = tuning.cameraHeight * cameraDepth;
    const playerSeg = findSegment(this.track, this.position + playerZ);
    const slope = (playerSeg.p2.worldY - playerSeg.p1.worldY) / this.track.segmentLength;

    this.car.update(dt, this.controls, playerSeg.curve, slope, this.handleCarEvent);

    const nextPos = this.position + this.car.speed * dt;
    if (nextPos >= this.track.length) {
      this.position = nextPos % this.track.length;
      this.lastLapTime = this.lapTime;
      this.crossedDropBars.clear();
      this.bridge.emit({ type: 'lapCompleted', lap: this.lap, lapTime: this.lapTime });
      this.lap++;
      this.lapTime = 0;
    } else {
      this.position = nextPos;
    }

    this.simTime += dt;
    this.lapTime += dt;

    // Update reactive Web Audio filter/pitch and sample BeatClock
    this.drivingAudioParams.speedRatio = this.car.speedRatio;
    this.drivingAudioParams.isDrifting = this.car.isDrifting;
    this.drivingAudioParams.isOffRoad = this.car.isOffRoad;

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
    this.updateRoadProgressTelemetry();

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

    this.view.position = renderPos;
    this.view.playerX = renderX;
    this.view.cameraHeight = tuning.cameraHeight;
    this.view.cameraDepth = cameraDepthFromFov(tuning.fieldOfView);
    this.view.roadWidth = tuning.roadWidth;
    this.view.drawDistance = tuning.drawDistance;
    this.view.fogDensity = tuning.fogDensity;
    this.view.width = width;
    this.view.height = height;
    this.view.beatPulse = this.beatPulse;

    this.background.render(ctx, width, height, this.palette, this.beatPulse, this.downbeatPulse);
    this.roadRenderer.render(ctx, this.track, this.view, this.palette);
    drawPlayerCar(ctx, this.car, width, height);
  };

  private checkDropSync(): void {
    if (!isSongTrack(this.track)) return;
    for (const dm of this.track.dropMarkers) {
      if (this.crossedDropBars.has(dm.barIndex)) continue;
      if (this.prevPosition <= dm.worldZ && this.position >= dm.worldZ) {
        this.crossedDropBars.add(dm.barIndex);
        const dropBeat = dm.barIndex * 4;
        const deltaBeats = this.audioBeatIndex - dropBeat;
        if (Math.abs(deltaBeats) <= 1.25) {
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
      this.totalBars = this.audio.beatMap.barEnergy.length;
      this.currentChunkId = 'test-track';
      this.syncDeltaBeats = 0;
      return;
    }

    const bar = Math.max(0, Math.min(this.track.totalBars - 1, worldZToBar(this.track, this.position)));
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

  private readonly buildSnapshot = (): TelemetrySnapshot => ({
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
    bpm: this.audio.beatMap.bpm,
    barIndex: this.barIndex,
    beatInBar: this.beatInBar,
    beatPulse: this.beatPulse,
    sectionRole: this.sectionRole,
    barEnergy: this.barEnergy,
    filterCutoffHz: this.audio.cutoffHz,
    trackTitle: this.audio.beatMap.title,
    trackArtist: this.audio.beatMap.artist,
    audioUnlocked: this.audio.unlocked,
    roadBarIndex: this.roadBarIndex,
    totalBars: this.totalBars,
    currentChunkId: this.currentChunkId,
    syncDeltaBeats: this.syncDeltaBeats,
  });
}
