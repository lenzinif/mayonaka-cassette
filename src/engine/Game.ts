import type { BeatJudgementTier } from '@src/audio/BeatClock';
import {
  barToTime,
  sectionAtBar,
  type BeatMap,
  type SectionRole,
} from '@src/audio/BeatMap';
import {
  FunkAudioEngine,
  type DrivingAudioParams,
} from '@src/audio/FunkAudioEngine';
import { TrackLibrary, type RunGrade, type StageScoreSummary } from '@src/audio/TrackLibrary';
import {
  DEFAULT_CROSSFADE_BARS,
  FORK_APPROACH_BARS,
  RENDER_HEIGHT,
  RENDER_WIDTH,
  TELEMETRY_HZ,
} from '@src/config/constants';
import { DEFAULT_TUNING, tuning } from '@src/config/tuning';
import {
  AutopilotDriver,
  type AutopilotForkPerception,
  type AutopilotMode,
  type AutopilotPerception,
} from '@src/core/AutopilotDriver';
import type { InputSource } from '@src/core/InputManager';
import type { AssetPreloader } from '@src/core/AssetPreloader';
import { TelemetryBridge } from '@src/core/TelemetryBridge';
import { Gearbox, type GearNumber } from '@src/entities/Gearbox';
import {
  drawMelonSodaInset,
  MelonSoda,
  type MelonSodaMotion,
  type SodaSkin,
} from '@src/entities/MelonSoda';
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
  blendStagePalette,
  createMutablePaletteClone,
  getStagePalette,
  PALETTE_NIGHT_FUNK,
  type StagePalette,
} from '@src/road/palette';
import { cameraDepthFromFov, interpolate } from '@src/road/RoadProjection';
import { RoadRenderer, type RoadView } from '@src/road/RoadRenderer';
import { findSegment, getChosenForkCenter, type Track } from '@src/road/RoadSegment';
import {
  generateSongRoad,
  isSongTrack,
  restoreCanonicalTrack,
  worldZToBeat,
  type SongTrack,
} from '@src/road/SongRoadGenerator';
import { Background } from './Background';
import { PlaylistRunManager, type RunSummary } from './PlaylistRunManager';
import { SongRoadSyncController } from './SongRoadSyncController';
import { StageForkController, type ForkOptionInfo } from './StageForkController';

export type { ForkOptionInfo, RunSummary };

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
  bgRenderMs: number;
  roadRenderMs: number;
  roadSlicesMs: number;
  roadPropsMs: number;
  roadTrafficMs: number;
  carOverlayMs: number;
  compositorGapMs: number;
  frameTimeMs: number;
  p95FrameMs: number;
  maxFrameMs: number;
  minFps: number;
  droppedFrames: number;
  sessionAvgFps: number;
  sessionMinFps: number;
  pct60Fps: number;
  fixedStepsLastFrame: number;
  drawnSegments: number;
  drawnProps: number;
  drawnTrucks: number;
  drawnPylonSpans: number;
  crestClips: number;
  memoryMb: number | null;
}

export interface BenchmarkSectionSummary {
  role: SectionRole;
  bars: number;
  frames: number;
  avgFps: number;
  avgFrameMs: number;
  maxFrameMs: number;
  avgProps: number;
}

export interface BenchmarkBarSummary {
  barIndex: number;
  role: SectionRole;
  frames: number;
  avgFps: number;
  avgFrameMs: number;
  maxFrameMs: number;
  avgProps: number;
}

export interface PerfBenchmarkReport {
  timestamp: string;
  trackTitle: string;
  trackArtist: string;
  bpm: number;
  totalBars: number;
  roadBarIndex: number;
  stagePaletteName: string;
  isolation: {
    renderBg: boolean;
    renderRoad: boolean;
    renderProps: boolean;
    renderPylonWires: boolean;
    renderTraffic: boolean;
    renderCar: boolean;
    renderParticles: boolean;
    syncGpuProbe: boolean;
    legacyRaster?: boolean;
  };
  session: {
    frames: number;
    durationSec: number;
    avgFps: number;
    minFps: number;
    avgFrameMs: number;
    p95FrameMs: number;
    maxFrameMs: number;
    pct60Fps: number;
    droppedFrames: number;
    histogram: {
      fps60: number;
      fps45to59: number;
      fps30to44: number;
      fpsBelow30: number;
    };
  };
  latestFrame: {
    fps: number;
    frameTimeMs: number;
    simTimeMs: number;
    renderTimeMs: number;
    compositorGapMs: number;
    bgRenderMs: number;
    roadRenderMs: number;
    roadSlicesMs: number;
    roadPropsMs: number;
    roadTrafficMs: number;
    carOverlayMs: number;
    drawnSegments: number;
    drawnProps: number;
    drawnTrucks: number;
    drawnPylonSpans: number;
    crestClips: number;
    activeParticles: number;
    heapMb: number | null;
  };
  sections: BenchmarkSectionSummary[];
  heaviestBars: BenchmarkBarSummary[];
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

function flushCanvasGpu(ctx: CanvasRenderingContext2D): void {
  if (typeof ctx.getImageData === 'function') {
    try {
      ctx.getImageData(0, 0, 1, 1);
    } catch {
      // Ignore if canvas is tainted or context forbids pixel readback
    }
  }
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
  private renderPalette: StagePalette;
  private readonly blendedPalette: StagePalette;
  private readonly paletteTransitionSnapshot: StagePalette;
  private paletteTransitionFrom: StagePalette | null = null;
  private paletteBlendElapsed = 0;
  private readonly paletteBlendDurationSec = 2.5;
  private lastPaletteBlendStep = -1;
  private nextTrackCache: { contentHash: string; track: SongTrack } | null = null;
  private activeNextTrackLookahead: SongTrack | undefined = undefined;
  private cachedForkLeftOption: ForkOptionInfo | null = null;
  private cachedForkRightOption: ForkOptionInfo | null = null;
  private cachedForkContentHash = '';
  private cachedForkRightContentHash = '';
  private cachedForkLibIndex = -1;
  private cachedForkLibLength = -1;
  private cachedForkCompletedStages = -1;
  private cachedForkBestLeftScore: number | null | undefined = undefined;
  private cachedForkBestRightScore: number | null | undefined = undefined;

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
  private barsSinceLastLightning = 99;

  readonly syncController = new SongRoadSyncController();
  readonly forkController = new StageForkController();
  readonly runManager = new PlaylistRunManager();

  get roadBarIndex(): number {
    return this.syncController.roadBarIndex;
  }
  get totalBars(): number {
    return this.syncController.totalBars;
  }
  get currentChunkId(): string {
    return this.syncController.currentChunkId;
  }
  get syncDeltaBeats(): number {
    return this.syncController.syncDeltaBeats;
  }
  get forkActive(): boolean {
    return this.forkController.forkActive;
  }
  get forkChoice(): 'left' | 'right' {
    return this.forkController.forkChoice;
  }
  set forkChoice(v: 'left' | 'right') {
    this.forkController.forkChoice = v;
  }
  get forkProgress(): number {
    return this.forkController.forkProgress;
  }

  private readonly hasCustomTrack: boolean;
  private activeRoadBeatMap: BeatMap;

  private isPaused = false;
  private renderDirty = true;
  private lastRenderCtx: CanvasRenderingContext2D | null = null;
  renderBg = true;
  renderRoad = true;
  renderProps = true;
  renderPylonWires = true;
  renderTraffic = true;
  renderCar = true;
  renderParticles = true;
  syncGpuProbe = false;
  legacyRaster = false;
  onTimingReset?: () => void;
  private readonly input: InputSource;
  private readonly roadRenderer = new RoadRenderer();
  private readonly background = new Background();

  // M8 Performance Profiler metrics (zero GC ring buffer & full-song accumulators)
  private static readonly MAX_BENCH_BARS = 256;
  private simTimeMs = 0;
  private simTimeAccumMs = 0;
  private simStepsSinceLastFrame = 0;
  private fixedStepsLastFrame = 0;
  private renderTimeMs = 0;
  private bgRenderMs = 0;
  private roadRenderMs = 0;
  private carOverlayMs = 0;
  private frameTimeMs = 16.67;
  private lastRenderTimestamp = 0;
  private droppedFrames = 0;
  private sessionFrames = 0;
  private sessionElapsedMs = 0;
  private sessionMaxFrameMs = 0;
  private sessionMinWindowFps = 60;
  private frames60 = 0;
  private frames45to60 = 0;
  private frames30to45 = 0;
  private framesBelow30 = 0;
  private readonly barFrameCounts = new Uint32Array(Game.MAX_BENCH_BARS);
  private readonly barFrameMsSum = new Float32Array(Game.MAX_BENCH_BARS);
  private readonly barMaxFrameMs = new Float32Array(Game.MAX_BENCH_BARS);
  private readonly barPropsSum = new Uint32Array(Game.MAX_BENCH_BARS);
  private readonly frameDtHistory = new Float32Array(120);
  private readonly frameDtScratch = new Float32Array(120);
  private frameDtCursor = 0;
  private frameDtCount = 0;
  private lastBridgeJointSegment = -1;
  private dynamicFov = DEFAULT_TUNING.fieldOfView;
  private prevDynamicFov = DEFAULT_TUNING.fieldOfView;
  private fovBoostPulse = 0;
  private memoryMb: number | null = null;
  private memoryCheckFrames = 0;
  private benchmarkWarmupFrames = 0;

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

  get currentFov(): number {
    return this.dynamicFov;
  }

  get currentCameraDepth(): number {
    return this.view.cameraDepth;
  }

  setPaused(paused: boolean): void {
    if (this.isPaused === paused) return;
    this.isPaused = paused;
    this.renderDirty = true;
    if (paused) {
      void this.audio.pause();
    } else {
      void this.audio.resume();
      this.benchmarkWarmupFrames = Math.max(this.benchmarkWarmupFrames, 2);
      this.lastRenderTimestamp = 0;
      this.onTimingReset?.();
    }
    this.bridge.publish?.(this.buildSnapshot);
    this.bridge.emit({ type: 'pauseChanged', paused });
  }

  togglePause(): void {
    this.setPaused(!this.isPaused);
  }

  /**
   * Resets full-song & rolling-window performance accumulators cleanly (zero GC).
   */
  resetPerfBenchmark(): void {
    this.droppedFrames = 0;
    this.sessionFrames = 0;
    this.sessionElapsedMs = 0;
    this.sessionMaxFrameMs = 0;
    this.sessionMinWindowFps = 60;
    this.frames60 = 0;
    this.frames45to60 = 0;
    this.frames30to45 = 0;
    this.framesBelow30 = 0;
    this.frameDtHistory.fill(0);
    this.frameDtCursor = 0;
    this.frameDtCount = 0;
    this.barFrameCounts.fill(0);
    this.barFrameMsSum.fill(0);
    this.barMaxFrameMs.fill(0);
    this.barPropsSum.fill(0);
    this.lastRenderTimestamp = 0;
    this.benchmarkWarmupFrames = 2;
    this.onTimingReset?.();
  }

  /**
   * Jumps car position and audio clock to `barIndex` so diagnostics can sample any song section directly.
   */
  seekToBar(barIndex: number): void {
    const maxBars = isSongTrack(this.track)
      ? Math.max(1, this.track.totalBars)
      : Math.max(1, this.activeRoadBeatMap.barEnergy.length);
    const clampedBar = Math.max(0, Math.min(maxBars - 1, Math.floor(barIndex)));
    if (isSongTrack(this.track)) {
      const targetZ = clampedBar * this.track.barLengthWorld;
      this.position = targetZ % this.track.length;
      this.prevPosition = this.position;
    }
    this.car.x = 0;
    this.car.prevX = 0;
    const targetSec = Math.max(0, barToTime(this.activeRoadBeatMap, clampedBar));
    this.audio.seekTo(targetSec);
    this.syncController.resetForTrack(true, this.car.speedRatio > 0.25, 2.0);
    this.updateRoadProgressTelemetry();
    this.updateForkState();
    this.benchmarkWarmupFrames = 2;
    this.renderDirty = true;
    this.bridge.publish(this.buildSnapshot);
  }

  /**
   * Jumps immediately into the stage fork approach with highway speed so fork rendering and UI can be stress-tested.
   */
  triggerForkTest(): void {
    this.hasStartedDriving = true;
    this.seekToBar(Math.max(0, this.totalBars - 5));
    this.car.speed = tuning.maxSpeed * 0.85;
    this.car.gearbox.update(this.car.speed, tuning.maxSpeed);
    this.updateRoadProgressTelemetry();
    this.updateForkState();
    this.bridge.publish(this.buildSnapshot);
  }

  /**
   * Positions the car just ahead of the stage transition line on the right fork so next-song loading/crossfade triggers immediately.
   */
  triggerNextSongTest(): void {
    this.hasStartedDriving = true;
    this.forkChoice = 'right';
    this.car.x = 0.5;
    this.car.prevX = 0.5;
    this.position = Math.max(0, this.track.length - this.track.segmentLength * 3);
    this.prevPosition = this.position;
    this.car.speed = tuning.maxSpeed * 0.85;
    this.car.gearbox.update(this.car.speed, tuning.maxSpeed);
    this.updateRoadProgressTelemetry();
    this.updateForkState();
    this.benchmarkWarmupFrames = 2;
    this.renderDirty = true;
    this.bridge.publish(this.buildSnapshot);
  }

  /**
   * Moves the car onto the off-road shoulder at high speed to stress-test gravel particles, audio muffle, and HUD updates.
   */
  triggerOffRoadTest(): void {
    this.hasStartedDriving = true;
    this.car.x = 1.45;
    this.car.prevX = 1.45;
    this.car.speed = tuning.maxSpeed * 0.85;
    this.car.gearbox.update(this.car.speed, tuning.maxSpeed);
    this.renderDirty = true;
    this.bridge.publish(this.buildSnapshot);
  }

  /**
   * Places a Kei Truck directly ahead of the car bumper at highway speed to trigger a collision & particle burst on the next step.
   */
  triggerTruckCollisionTest(): void {
    this.hasStartedDriving = true;
    if (this.forkActive) {
      this.seekToBar(Math.min(16, Math.max(0, Math.floor(this.totalBars * 0.2))));
    }
    this.car.bumpVx = 0;
    this.car.speed = tuning.maxSpeed * 0.9;
    this.car.gearbox.update(this.car.speed, tuning.maxSpeed);
    const playerZOffset = tuning.cameraHeight * cameraDepthFromFov(tuning.fieldOfView);
    const playerWorldZ = this.position + playerZOffset;
    this.traffic.placeTruckAheadForTest(playerWorldZ, this.car.x, this.track.length);
    this.renderDirty = true;
    this.bridge.publish(this.buildSnapshot);
  }

  /**
   * Returns a complete JSON-serializable breakdown of full-song framerate, section timing, and active frame telemetry.
   */
  getBenchmarkReport(): PerfBenchmarkReport {
    const stats = this.computeSessionStats();
    const roleTotals = new Map<
      SectionRole,
      { bars: number; frames: number; msSum: number; maxMs: number; propsSum: number }
    >();
    const barSummaries: BenchmarkBarSummary[] = [];
    const maxTrackedBars = Math.min(
      Game.MAX_BENCH_BARS,
      isSongTrack(this.track) ? this.track.totalBars : Game.MAX_BENCH_BARS,
    );

    for (let i = 0; i < maxTrackedBars; i++) {
      const count = this.barFrameCounts[i] ?? 0;
      if (count <= 0) continue;
      const msSum = this.barFrameMsSum[i] ?? 0;
      const maxMs = this.barMaxFrameMs[i] ?? 0;
      const propsSum = this.barPropsSum[i] ?? 0;
      const avgMs = msSum / count;
      const avgFps = avgMs > 0 ? Math.round((1000 / avgMs) * 10) / 10 : 0;
      const role: SectionRole = sectionAtBar(this.activeRoadBeatMap, i)?.role ?? 'drop';

      barSummaries.push({
        barIndex: i,
        role,
        frames: count,
        avgFps,
        avgFrameMs: Math.round(avgMs * 100) / 100,
        maxFrameMs: Math.round(maxMs * 100) / 100,
        avgProps: Math.round((propsSum / count) * 10) / 10,
      });

      const prev = roleTotals.get(role) ?? {
        bars: 0,
        frames: 0,
        msSum: 0,
        maxMs: 0,
        propsSum: 0,
      };
      prev.bars++;
      prev.frames += count;
      prev.msSum += msSum;
      if (maxMs > prev.maxMs) prev.maxMs = maxMs;
      prev.propsSum += propsSum;
      roleTotals.set(role, prev);
    }

    const sections: BenchmarkSectionSummary[] = [];
    for (const [role, agg] of roleTotals.entries()) {
      const avgMs = agg.frames > 0 ? agg.msSum / agg.frames : 0;
      sections.push({
        role,
        bars: agg.bars,
        frames: agg.frames,
        avgFps: avgMs > 0 ? Math.round((1000 / avgMs) * 10) / 10 : 0,
        avgFrameMs: Math.round(avgMs * 100) / 100,
        maxFrameMs: Math.round(agg.maxMs * 100) / 100,
        avgProps: agg.frames > 0 ? Math.round((agg.propsSum / agg.frames) * 10) / 10 : 0,
      });
    }

    barSummaries.sort((a, b) => b.avgFrameMs - a.avgFrameMs);
    const windowStats = this.computeFrameWindowStats();

    return {
      timestamp: new Date().toISOString(),
      trackTitle: this.activeRoadBeatMap.title,
      trackArtist: this.activeRoadBeatMap.artist,
      bpm: this.activeRoadBeatMap.bpm,
      totalBars: this.totalBars,
      roadBarIndex: this.roadBarIndex,
      stagePaletteName: this.palette.name,
      isolation: {
        renderBg: this.renderBg,
        renderRoad: this.renderRoad,
        renderProps: this.renderProps,
        renderPylonWires: this.renderPylonWires,
        renderTraffic: this.renderTraffic,
        renderCar: this.renderCar,
        renderParticles: this.renderParticles,
        syncGpuProbe: this.syncGpuProbe,
        legacyRaster: this.legacyRaster,
      },
      session: {
        frames: this.sessionFrames,
        durationSec: Math.round((this.sessionElapsedMs / 1000) * 10) / 10,
        avgFps: stats.sessionAvgFps,
        minFps: stats.sessionMinFps,
        avgFrameMs: Math.round(stats.sessionAvgFrameMs * 100) / 100,
        p95FrameMs: windowStats.p95FrameMs,
        maxFrameMs: Math.round(this.sessionMaxFrameMs * 10) / 10,
        pct60Fps: stats.pct60Fps,
        droppedFrames: this.droppedFrames,
        histogram: {
          fps60: this.frames60,
          fps45to59: this.frames45to60,
          fps30to44: this.frames30to45,
          fpsBelow30: this.framesBelow30,
        },
      },
      latestFrame: {
        fps: this.lastFps,
        frameTimeMs: Math.round(this.frameTimeMs * 10) / 10,
        simTimeMs: Math.round(this.simTimeMs * 100) / 100,
        renderTimeMs: Math.round(this.renderTimeMs * 100) / 100,
        compositorGapMs:
          Math.round(Math.max(0, this.frameTimeMs - this.simTimeMs - this.renderTimeMs) * 10) / 10,
        bgRenderMs: Math.round(this.bgRenderMs * 100) / 100,
        roadRenderMs: Math.round(this.roadRenderMs * 100) / 100,
        roadSlicesMs: Math.round(this.roadRenderer.stats.slicesMs * 100) / 100,
        roadPropsMs: Math.round(this.roadRenderer.stats.propsMs * 100) / 100,
        roadTrafficMs: Math.round(this.roadRenderer.stats.trafficMs * 100) / 100,
        carOverlayMs: Math.round(this.carOverlayMs * 100) / 100,
        drawnSegments: this.roadRenderer.stats.drawnSegments,
        drawnProps: this.roadRenderer.stats.drawnProps,
        drawnTrucks: this.roadRenderer.stats.drawnTrucks,
        drawnPylonSpans: this.roadRenderer.stats.drawnPylonSpans,
        crestClips: this.roadRenderer.stats.crestClips,
        activeParticles: this.particles.activeCount,
        heapMb: this.memoryMb,
      },
      sections,
      heaviestBars: barSummaries.slice(0, 12),
    };
  }

  private readonly drivingAudioParams: DrivingAudioParams = {
    speedRatio: 0,
    isDrifting: false,
    isOffRoad: false,
    offRoadDepth: 0,
    holdOutroLoop: false,
  };

  private collisionShake = 0;
  private prevCollisionShake = 0;
  private readonly melonSodaMotion: MelonSodaMotion = {
    lateralAccel: 0,
    longitudinalAccel: 0,
    verticalAccel: 0,
    isOffRoad: false,
    speedRatio: 0,
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
    this.library = options.library ?? new TrackLibrary(options.preloader);
    this.palette = options.palette ?? PALETTE_NIGHT_FUNK;
    this.renderPalette = this.palette;
    this.blendedPalette = createMutablePaletteClone(this.palette);
    this.paletteTransitionSnapshot = createMutablePaletteClone(this.palette);
    this.hasCustomTrack = options.track !== undefined;
    this.activeRoadBeatMap = this.audio.beatMap;
    this.track = options.track ?? generateSongRoad(this.audio.beatMap);
    this.traffic = new TrafficManager(this.track, this.audio.beatMap.contentHash);
    this.preloader = options.preloader;
    this.autopilot = options.autopilot;
    if (this.autopilot) {
      this.autopilot.setPerception(this.buildAutopilotPerception());
    }
    for (let i = 0; i < 3; i++) {
      this.background.prewarmPalette(getStagePalette(i));
    }
    this.prewarmNextLookaheadTrack();
    this.updateRoadProgressTelemetry();
  }

  get isAutopilotActive(): boolean {
    return this.autopilot?.enabled ?? false;
  }

  get gearbox(): Gearbox {
    return this.car.gearbox;
  }

  toggleTofuMode(): boolean {
    const next = !this.melonSoda.active;
    this.melonSoda.setActive(next);
    if (next) this.runManager.stageTofuUsed = true;
    this.bridge.emit({ type: 'tofuModeToggled', active: next });
    this.bridge.publish(this.buildSnapshot);
    return next;
  }

  cycleSodaSkin(): SodaSkin {
    const nextSkin = this.melonSoda.cycleSkin();
    this.bridge.emit({ type: 'sodaSkinChanged', skin: nextSkin });
    this.bridge.publish(this.buildSnapshot);
    return nextSkin;
  }

  toggleAutoShift(): boolean {
    this.gearbox.autoShift = !this.gearbox.autoShift;
    this.bridge.emit({ type: 'autoShiftToggled', enabled: this.gearbox.autoShift });
    this.bridge.publish(this.buildSnapshot);
    return this.gearbox.autoShift;
  }

  selectForkBranch(choice: 'left' | 'right'): void {
    this.setForkManualChoice(choice);
    this.bridge.publish(this.buildSnapshot);
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
        return {
          beatPhase: this.beatPulse,
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
    this.nextTrackCache = null;
    this.activeNextTrackLookahead = undefined;
    this.syncController.resetForTrack(
      !resetPosition && prevLength > 0,
      !resetPosition && this.car.speedRatio > 0.25,
    );
    this.forkController.resetForNewRoad();
    this.lastBridgeJointSegment = -1;
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
      this.dynamicFov = tuning.fieldOfView;
      this.prevDynamicFov = tuning.fieldOfView;
      this.fovBoostPulse = 0;
      this.runManager.resetStageMetrics(this.car.groove, this.melonSoda.active);
      this.resetPerfBenchmark();
    } else if (prevLength > 0) {
      const ratio = this.position / prevLength;
      this.position = (ratio * songTrack.length) % songTrack.length;
      this.prevPosition = this.position;
    }

    this.renderDirty = true;
    this.prewarmNextLookaheadTrack();
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
    const songTrack =
      this.nextTrackCache && this.nextTrackCache.contentHash === beatMap.contentHash
        ? this.nextTrackCache.track
        : generateSongRoad(beatMap);
    this.nextTrackCache = null;
    this.activeNextTrackLookahead = undefined;
    this.track = songTrack;
    this.activeRoadBeatMap = beatMap;
    this.syncController.resetForTrack(true, true, 2.0);
    this.forkController.resetForStageTransition();
    this.lastBridgeJointSegment = -1;
    this.traffic.spawnForTrack(songTrack, beatMap.contentHash);

    // Flow State (AGENTS.md Pillar 3): preserve vehicle momentum and continuous driving state
    this.hasStartedDriving = true;
    this.position = overshoot % songTrack.length;
    this.prevPosition = this.position;
    // this.car.speed, this.car.gearbox.gear, this.car.gearbox.rpm, this.car.groove are preserved!
    this.lap = 1;
    this.lapTime = 0;
    this.runManager.resetStageMetrics(this.car.groove, this.melonSoda.active);

    this.benchmarkWarmupFrames = 2;
    this.lastRenderTimestamp = 0;
    this.renderDirty = true;
    this.prewarmNextLookaheadTrack();
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
    this.runManager.restartRun(this.car.groove, this.melonSoda.active);
    this.palette = getStagePalette(0);
    this.renderPalette = this.palette;
    this.paletteTransitionFrom = null;
    this.nextTrackCache = null;
    this.activeNextTrackLookahead = undefined;
    this.hasStartedDriving = false;
    this.dynamicFov = tuning.fieldOfView;
    this.prevDynamicFov = tuning.fieldOfView;
    this.fovBoostPulse = 0;
    this.resetPerfBenchmark();
    const first = this.library.selectTrack(0);
    this.audio.loadTrack(first.beatMap, first.audioBuffer);
    this.loadBeatMapRoad(first.beatMap, true);
    const best = this.library.getBestScore(first.contentHash);
    this.bridge.emit({
      type: 'stageTransition',
      stageNumber: this.runManager.stageNumber,
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
    this.renderPalette = this.palette;
    this.paletteTransitionFrom = null;
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
            this.runManager.recordShift(shiftRes.rewardTier, judgement.isDownbeat);
            if (shiftRes.rewardTier === 'PERFECT') {
              this.fovBoostPulse = 1.0;
            }
          }
        } else if (p.action === 'tofuMode') {
          this.toggleTofuMode();
        } else if (p.action === 'cycleSodaSkin') {
          this.cycleSodaSkin();
        } else if (p.action === 'autoShift') {
          this.toggleAutoShift();
        } else if (p.action === 'forkLeft' && this.forkActive) {
          this.selectForkBranch('left');
        } else if (p.action === 'forkRight' && this.forkActive) {
          this.selectForkBranch('right');
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

    // Detect BeatMap switch or manual BPM adjustment from TrackLoader
    if (
      !this.hasCustomTrack &&
      this.audio.beatMap !== this.activeRoadBeatMap
    ) {
      const isNewSong = this.audio.beatMap.contentHash !== this.activeRoadBeatMap.contentHash;
      this.loadBeatMapRoad(this.audio.beatMap, isNewSong);
    }

    this.prevPosition = this.position;
    this.syncController.tickCooldown(dt);

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
    const forkBounds = this.forkController.getCrossSection(
      this.position,
      this.track.length,
      forkZoneStartZ,
    );

    const prevAutoShift = this.car.gearbox.autoShift;
    if (this.isAutopilotActive && this.autopilot?.rhythmShifts) {
      this.car.gearbox.autoShift = false;
    }
    this.car.update(
      dt,
      this.controls,
      playerSeg.curve,
      slope,
      this.handleCarEvent,
      this.melonSoda.active,
      forkBounds,
    );
    this.car.gearbox.autoShift = prevAutoShift;

    // Accumulate continuous driving score & groove stats
    this.runManager.accumulateDrivingStep(dt, this.car, this.melonSoda.active);

    const effectiveSpeed = this.syncController.computeElasticWorldSpeed(
      this.track,
      this.hasCustomTrack,
      this.car.speed,
      this.car.speedRatio,
      this.position,
      this.audioBeatIndex,
      this.audio.beatMap.bpm,
      this.sectionRole,
    );
    const nextPos = this.position + effectiveSpeed * dt;

    // Smoothly align car.x with the chosen fork branch as it converges back to center
    this.forkController.alignCarInConvergence(
      this.car,
      this.position,
      nextPos,
      this.track.length,
      forkZoneStartZ,
      dt,
    );

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
    this.melonSodaMotion.lateralAccel = this.car.lateralAccel;
    this.melonSodaMotion.longitudinalAccel = this.car.longitudinalAccel;
    this.melonSodaMotion.verticalAccel = this.car.verticalAccel;
    this.melonSodaMotion.isOffRoad = this.car.isOffRoad;
    this.melonSodaMotion.speedRatio = this.car.speedRatio;

    this.melonSoda.update(
      dt,
      this.melonSodaMotion,
      this.handleSodaSpill,
    );

    this.simTime += dt;
    if (this.hasStartedDriving) {
      this.lapTime += dt;
    }
    this.prevCollisionShake = this.collisionShake;
    if (this.collisionShake > 0) {
      this.collisionShake = Math.max(0, this.collisionShake - dt * 3.2);
    }

    this.updateRoadProgressTelemetry();
    this.updateForkState();

    // 5. Update reactive Web Audio filter/pitch and sample BeatClock
    if (this.melonSoda.active) {
      const playerWorldZ = this.position + playerZOffset;
      const currentSeg = findSegment(this.track, playerWorldZ);
      if (
        currentSeg &&
        currentSeg.env === 'bridge' &&
        currentSeg.stripe === 0 &&
        currentSeg.index % 8 === 0 &&
        this.lastBridgeJointSegment !== currentSeg.index
      ) {
        this.lastBridgeJointSegment = currentSeg.index;
        this.melonSoda.applyVerticalImpulse(0.04);
      }
    }

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
    const prevBarEnergy = this.barEnergy;
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

    const stitchDeltaZ = this.syncController.maybeStitchHorizonToMusic(
      this.track,
      this.hasCustomTrack,
      this.car.speedRatio,
      this.forkActive,
      this.position,
      this.audioBeatIndex,
      this.traffic,
    );
    if (stitchDeltaZ !== 0) {
      this.position += stitchDeltaZ;
      this.prevPosition += stitchDeltaZ;
      this.updateRoadProgressTelemetry();
      this.updateForkState();
    }
    this.syncController.checkDropSync(
      this.track,
      this.prevPosition,
      this.position,
      this.audioBeatIndex,
      this.handleDropSync,
    );

    // 6. Advance M7 ParticleSystem
    this.particles.update(dt, this.car, RENDER_WIDTH, RENDER_HEIGHT, this.car.grooveTier);

    let triggerExtremeLightning = false;
    if (clockState.justCrossedBar && tuning.bgRain === 1) {
      this.barsSinceLastLightning++;

      // Extreme Case 1: Entering the Drop section (maximum musical tension release)
      const isDropEntry = this.sectionRole === 'drop' && prevRole !== 'drop';
      // Extreme Case 2: Peak spectral energy bar (top 10% highest energy) with refractory period
      const isExtremeSpectralPeak =
        this.sectionRole !== 'intro' &&
        this.barEnergy >= 0.88 &&
        this.barsSinceLastLightning >= 12;
      // Extreme Case 3: Sudden massive spectral novelty surge (+0.28 in a single bar),
      // or a delayed post-pickup drop climax when the drop section started 1-2 bars earlier on a low-energy bar
      const isSpectralSurge =
        this.barEnergy - prevBarEnergy >= 0.28 &&
        (this.barsSinceLastLightning >= 8 ||
          (this.sectionRole === 'drop' &&
            this.barsSinceLastLightning <= 2 &&
            prevBarEnergy < 0.48 &&
            this.barEnergy >= 0.60));

      if (isDropEntry || isExtremeSpectralPeak || isSpectralSurge) {
        triggerExtremeLightning = true;
        this.barsSinceLastLightning = 0;
      }
    }

    if (this.paletteTransitionFrom !== null) {
      this.paletteBlendElapsed += dt;
      const rawT = Math.min(1, this.paletteBlendElapsed / this.paletteBlendDurationSec);
      if (rawT >= 1) {
        this.paletteTransitionFrom = null;
        this.renderPalette = this.palette;
      } else {
        const smoothT = rawT * rawT * (3 - 2 * rawT);
        const step = Math.round(smoothT * 16);
        if (step !== this.lastPaletteBlendStep) {
          this.lastPaletteBlendStep = step;
          blendStagePalette(
            this.paletteTransitionFrom,
            this.palette,
            smoothT,
            this.blendedPalette,
          );
          this.renderPalette = this.blendedPalette;
        }
      }
    }

    const lookahead = this.getNextLookaheadTrack();
    this.activeNextTrackLookahead = this.forkChoice === 'right' ? lookahead : undefined;

    this.prevDynamicFov = this.dynamicFov;
    this.fovBoostPulse = Math.max(0, this.fovBoostPulse - dt * 2.8);
    const fovSpeedRatio = Math.max(0, Math.min(1, this.car.speed / Math.max(1, tuning.maxSpeed)));
    const overdriveFactor = this.car.grooveTier === 'OVERDRIVE' ? 1 : 0;
    const targetFov = Math.min(
      122,
      tuning.fieldOfView +
        fovSpeedRatio * fovSpeedRatio * tuning.dynamicFovSpeedBonus +
        overdriveFactor * tuning.dynamicFovOverdriveBonus +
        this.fovBoostPulse * tuning.dynamicFovBoostKick,
    );
    const fovRate = targetFov > this.dynamicFov ? 6.5 : 3.2;
    this.dynamicFov += (targetFov - this.dynamicFov) * Math.min(1, dt * fovRate);

    this.background.update(dt, playerSeg.curve, this.car.speedRatio, triggerExtremeLightning, slope);
    if (this.lastRenderTimestamp === 0) {
      this.bridge.offer(this.simTime, this.buildSnapshot);
    }

    const elapsed = performance.now() - t0;
    this.simStepsSinceLastFrame++;
    this.simTimeAccumMs += elapsed;
  };

  render = (ctx: CanvasRenderingContext2D, alpha = 1, fps = 0, rafNow?: number): void => {
    const t0 = performance.now();
    const frameStamp = rafNow !== undefined && rafNow > 0 ? rafNow : t0;
    const isFirstRender = this.lastRenderTimestamp <= 0;
    this.lastFps = fps;
    if (!this.isPaused && this.lastRenderTimestamp > 0) {
      if (this.benchmarkWarmupFrames > 0) {
        this.benchmarkWarmupFrames--;
        this.frameTimeMs = 16.67;
      } else {
        const dt = Math.max(0, Math.min(frameStamp - this.lastRenderTimestamp, 100));
        this.frameTimeMs = this.frameTimeMs * 0.85 + dt * 0.15;
        this.frameDtHistory[this.frameDtCursor] = dt;
        this.frameDtCursor = (this.frameDtCursor + 1) % this.frameDtHistory.length;
        if (this.frameDtCount < this.frameDtHistory.length) {
          this.frameDtCount++;
        }
        if (dt > 18.5) {
          this.droppedFrames++;
        }
        this.sessionFrames++;
        this.sessionElapsedMs += dt;
        if (dt > this.sessionMaxFrameMs) {
          this.sessionMaxFrameMs = dt;
        }
        if (dt <= 18.5) {
          this.frames60++;
        } else if (dt <= 22.5) {
          this.frames45to60++;
        } else if (dt <= 34.0) {
          this.frames30to45++;
        } else {
          this.framesBelow30++;
        }
        if (fps > 0 && this.sessionFrames > 30 && fps < this.sessionMinWindowFps) {
          this.sessionMinWindowFps = fps;
        }
        const benchBar = Math.min(Game.MAX_BENCH_BARS - 1, Math.max(0, this.roadBarIndex));
        this.barFrameCounts[benchBar] = (this.barFrameCounts[benchBar] ?? 0) + 1;
        this.barFrameMsSum[benchBar] = (this.barFrameMsSum[benchBar] ?? 0) + dt;
        if (dt > (this.barMaxFrameMs[benchBar] ?? 0)) {
          this.barMaxFrameMs[benchBar] = dt;
        }
        this.barPropsSum[benchBar] =
          (this.barPropsSum[benchBar] ?? 0) + this.roadRenderer.stats.drawnProps;
      }
    } else if (fps > 0 && this.lastRenderTimestamp <= 0) {
      this.frameTimeMs = 1000 / fps;
    }
    this.lastRenderTimestamp = frameStamp;

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

    const renderShake = interpolate(this.prevCollisionShake, this.collisionShake, alpha);
    const shakeOffset =
      renderShake > 0.01
        ? Math.sin(this.simTime * 58) * renderShake * 55
        : 0;

    this.view.position = renderPos;
    this.view.playerX = renderX;
    this.view.cameraHeight = tuning.cameraHeight + shakeOffset;
    const hasDynamicFov =
      tuning.dynamicFovSpeedBonus > 0 ||
      tuning.dynamicFovOverdriveBonus > 0 ||
      tuning.dynamicFovBoostKick > 0;
    const renderFov = hasDynamicFov
      ? interpolate(this.prevDynamicFov, this.dynamicFov, alpha)
      : tuning.fieldOfView;
    this.view.cameraDepth = cameraDepthFromFov(renderFov);
    this.view.roadWidth = tuning.roadWidth;
    this.view.drawDistance = tuning.drawDistance;
    this.view.fogDensity = tuning.fogDensity;
    this.view.width = width;
    this.view.height = height;
    const baseTierIntensity =
      this.car.grooveTier === 'OVERDRIVE'
        ? 1.0
        : this.car.grooveTier === 'HIGH'
          ? 0.8
          : this.car.grooveTier === 'MEDIUM'
            ? 0.52
            : 0.24;
    const grooveIntensity = Math.max(
      0.2,
      Math.min(1.15, baseTierIntensity * 0.65 + (this.car.groove / 100) * 0.5),
    );

    this.view.beatPulse = this.beatPulse;
    this.view.beatIndex = Math.floor(this.audioBeatIndex);
    this.view.grooveIntensity = grooveIntensity;
    this.view.alpha = alpha;

    const forkZoneStartZ = this.getForkZoneStartZ();
    this.view.forkZoneStartZ = forkZoneStartZ;
    this.view.forkChoice = forkZoneStartZ !== undefined ? this.forkChoice : undefined;
    this.view.nextTrack =
      this.forkChoice === 'right' ? this.activeNextTrackLookahead : undefined;

    const tBg0 = performance.now();
    if (this.renderBg) {
      this.background.render(
        ctx,
        width,
        height,
        this.renderPalette,
        this.beatPulse,
        this.downbeatPulse,
        alpha,
        grooveIntensity,
      );
    } else {
      ctx.fillStyle = this.renderPalette.skyTop;
      ctx.fillRect(0, 0, width, height);
    }
    if (this.syncGpuProbe) flushCanvasGpu(ctx);
    const tRoad0 = performance.now();
    this.view.skipProps = !this.renderProps;
    this.view.skipPylonWires = !this.renderPylonWires;
    this.view.skipTraffic = !this.renderTraffic;
    this.view.syncGpuProbe = this.syncGpuProbe;
    this.view.legacyRaster = this.legacyRaster;
    if (this.renderRoad) {
      this.roadRenderer.render(
        ctx,
        this.track,
        this.view,
        this.renderPalette,
        this.traffic,
        this.beatPulse,
      );
    }
    if (this.syncGpuProbe) flushCanvasGpu(ctx);
    const tCar0 = performance.now();
    if (this.renderCar) {
      drawPlayerCar(ctx, this.car, width, height, alpha);
    }
    const tFgWeather0 = performance.now();
    if (this.renderBg) {
      this.background.renderForegroundWeather(ctx, width, height);
    }
    const tParts0 = performance.now();
    if (this.renderParticles) {
      this.particles.render(ctx, alpha);
    }
    if (this.renderCar) {
      drawMelonSodaInset(ctx, this.melonSoda, height, alpha);
    }

    if (this.isPaused && this.hasStartedDriving) {
      drawPauseOverlay(ctx, width, height);
    }
    if (this.syncGpuProbe) flushCanvasGpu(ctx);

    const tEnd = performance.now();
    const bgElapsed = tRoad0 - tBg0 + (tParts0 - tFgWeather0);
    const roadElapsed = tCar0 - tRoad0;
    const carOverlayElapsed = tFgWeather0 - tCar0 + (tEnd - tParts0);
    const renderElapsed = tEnd - t0;

    this.bgRenderMs = this.bgRenderMs * 0.85 + bgElapsed * 0.15;
    this.roadRenderMs = this.roadRenderMs * 0.85 + roadElapsed * 0.15;
    this.carOverlayMs = this.carOverlayMs * 0.85 + carOverlayElapsed * 0.15;
    this.renderTimeMs = this.renderTimeMs * 0.85 + renderElapsed * 0.15;

    if (isFirstRender) {
      this.bridge.publish(this.buildSnapshot);
    } else {
      this.bridge.offer(this.simTime, this.buildSnapshot);
    }
  };

  getForkZoneStartZ(): number | undefined {
    return this.forkController.getForkZoneStartZ(
      this.track,
      this.library.hasMultipleTracks,
      this.hasCustomTrack,
    );
  }

  private setForkManualChoice(choice: 'left' | 'right'): void {
    this.forkController.setManualChoice(
      choice,
      this.car,
      this.position,
      this.track.length,
      this.getForkZoneStartZ(),
      this.handleForkChoiceChanged,
    );
  }

  private readonly handleForkChoiceChanged = (
    choice: 'left' | 'right',
    source: 'lane' | 'input',
  ): void => {
    this.bridge.emit({ type: 'forkChoiceChanged', choice, source });
  };

  private prewarmNextLookaheadTrack(): void {
    if (
      this.hasCustomTrack ||
      !this.library.hasNextTrack ||
      !isSongTrack(this.track)
    ) {
      return;
    }
    const nextItem = this.library.nextTrackItem;
    if (!nextItem) return;
    if (!this.nextTrackCache || this.nextTrackCache.contentHash !== nextItem.beatMap.contentHash) {
      const nextTrack = generateSongRoad(nextItem.beatMap);
      this.nextTrackCache = { contentHash: nextItem.beatMap.contentHash, track: nextTrack };
      const nextPalette = getStagePalette(this.runManager.stageNumber);
      this.background.prewarmPalette(nextPalette);
    }
  }

  private getNextLookaheadTrack(): SongTrack | undefined {
    if (
      this.hasCustomTrack ||
      !this.library.hasNextTrack ||
      !isSongTrack(this.track)
    ) {
      return undefined;
    }
    const nextItem = this.library.nextTrackItem;
    if (!nextItem) return undefined;

    const lookaheadThreshold = Math.max(
      0,
      this.track.length - (tuning.drawDistance + 140) * this.track.segmentLength,
    );
    if (this.position < lookaheadThreshold) {
      return undefined;
    }

    if (!this.nextTrackCache || this.nextTrackCache.contentHash !== nextItem.beatMap.contentHash) {
      this.prewarmNextLookaheadTrack();
    }
    return this.nextTrackCache?.contentHash === nextItem.beatMap.contentHash
      ? this.nextTrackCache.track
      : undefined;
  }

  private updateForkState(): void {
    this.forkController.updateState(
      this.position,
      this.track.length,
      this.car.x,
      this.getForkZoneStartZ(),
      this.handleForkChoiceChanged,
    );
  }

  private handleStageOrLapEnd(nextPos: number): void {
    const { summary, isNewRecord } = this.runManager.finalizeStageSummary(
      this.activeRoadBeatMap,
      this.car.groove,
      this.lapTime,
      this.library,
    );
    this.bridge.emit({ type: 'stageCompleted', summary, isNewRecord });

    this.forkController.recenterCarAfterFork(this.car);

    // Custom-track loop OR player chose Left branch (LOOP CURRENT TRACK):
    if (this.hasCustomTrack || this.forkChoice === 'left') {
      const currentItem = this.library.activeItem;
      this.audio.crossfadeToTrack(currentItem.beatMap, currentItem.audioBuffer, 2, true);
      if (isSongTrack(this.track)) {
        restoreCanonicalTrack(this.track);
      }
      this.position = nextPos % this.track.length;
      this.lastLapTime = this.lapTime;
      this.syncController.resetForTrack(false, this.car.speedRatio > 0.25);
      this.bridge.emit({ type: 'lapCompleted', lap: this.lap, lapTime: this.lapTime });
      this.lap++;
      this.lapTime = 0;
      this.runManager.resetStageMetrics(this.car.groove, this.melonSoda.active);
      return;
    }

    // Multi-track playlist AND player chose Right branch:
    this.runManager.completedStages.push(summary);

    if (this.library.hasNextTrack) {
      const prevRenderPalette =
        this.renderPalette === this.blendedPalette
          ? blendStagePalette(
              this.renderPalette,
              this.renderPalette,
              0,
              this.paletteTransitionSnapshot,
            )
          : this.renderPalette;
      const nextItem = this.library.advanceToNextTrack()!;
      this.runManager.stageNumber++;
      this.palette = getStagePalette(this.runManager.stageNumber - 1);
      this.paletteTransitionFrom = prevRenderPalette;
      this.paletteBlendElapsed = 0;
      this.lastPaletteBlendStep = -1;
      blendStagePalette(prevRenderPalette, this.palette, 0, this.blendedPalette);
      this.renderPalette = this.blendedPalette;
      this.audio.crossfadeToTrack(nextItem.beatMap, nextItem.audioBuffer, DEFAULT_CROSSFADE_BARS);
      this.transitionToNextStage(nextItem.beatMap, nextPos);

      const best = this.library.getBestScore(nextItem.contentHash);
      this.bridge.emit({
        type: 'stageTransition',
        stageNumber: this.runManager.stageNumber,
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
      const runSummary = this.runManager.buildRunSummary();
      this.bridge.emit({ type: 'runCompleted', summary: runSummary });
      if (isSongTrack(this.track)) {
        restoreCanonicalTrack(this.track);
      }
      this.position = nextPos % this.track.length;
      this.lastLapTime = this.lapTime;
      this.syncController.resetForTrack(false, this.car.speedRatio > 0.25);
      this.lap++;
      this.lapTime = 0;
      this.runManager.resetStageMetrics(this.car.groove, this.melonSoda.active);
      const currentItem = this.library.activeItem;
      this.audio.crossfadeToTrack(currentItem.beatMap, currentItem.audioBuffer, 2, true);
    }
  }

  private readonly handleDropSync = (barIndex: number, deltaBeats: number): void => {
    this.runManager.recordDropSync();
    this.car.addGroove(
      tuning.grooveDropSyncGain,
      this.melonSoda.active,
      this.handleCarEvent,
    );
    this.audio.triggerFilterBlip(1.0);
    this.background.triggerLightningStrike();
    this.bridge.emit({
      type: 'dropSync',
      barIndex,
      deltaBeats,
    });
  };

  private updateRoadProgressTelemetry(): void {
    this.syncController.updateTelemetry(
      this.track,
      this.activeRoadBeatMap,
      this.position,
      this.audioBeatIndex,
    );
  }

  private readonly handleCarEvent = (event: CarEvent): void => {
    if (event.type === 'driftEnd' && event.duration >= 0.4) {
      this.audio.triggerFilterBlip(0.65);
      this.particles.emitBoostOrShiftBurst(this.car, RENDER_WIDTH, RENDER_HEIGHT, 'DRIFT_EXIT');
      if (event.duration >= tuning.driftBoostMinTime) {
        this.fovBoostPulse = 1.0;
      }
    }
    this.bridge.emit(event);
  };

  private readonly handleCollision = (event: CollisionEvent): void => {
    this.particles.emitCollisionBurst(event, this.car, RENDER_WIDTH, RENDER_HEIGHT);
    if (event.outcome === 'truckKnockedOff') {
      // Sideswiping a Kei Truck off-road in a high-speed drift feels empowering: milder shake & impulse
      this.collisionShake = Math.max(this.collisionShake, 0.55);
      this.prevCollisionShake = this.collisionShake;
      this.melonSoda.applyImpulse(event.side * 3.8);
      this.audio.triggerPitchDip(0.08, 0.35);
      this.runManager.recordTruckKnockedOff();
    } else if (event.outcome === 'propBounce') {
      // Roadside prop scrape: gentle arcade rub and clean flow retention
      this.runManager.recordCollision();
      this.collisionShake = Math.max(this.collisionShake, 0.35);
      this.prevCollisionShake = this.collisionShake;
      this.car.deductGroove(tuning.grooveCollisionPenalty * 0.6, this.handleCarEvent);
      this.melonSoda.applyImpulse(event.side * 2.8);
      this.audio.triggerPitchDip(0.025, 0.18);
    } else {
      this.runManager.recordCollision();
      this.collisionShake = Math.max(this.collisionShake, 0.85);
      this.prevCollisionShake = this.collisionShake;
      this.car.deductGroove(tuning.grooveCollisionPenalty, this.handleCarEvent);
      this.melonSoda.applyImpulse(event.side * 6.5);
      const isTraffic = event.obstacle === 'traffic';
      this.audio.triggerPitchDip(isTraffic ? 0.08 : 0.025, isTraffic ? 0.35 : 0.18);
    }
    this.bridge.emit(event);
  };

  private readonly handleSodaSpill = (): void => {
    this.runManager.recordSodaSpill();
    const grooveLost = this.car.deductTierProgressPct(
      tuning.tofuSpillGroovePenaltyPct,
      this.handleCarEvent,
    );
    this.bridge.emit({
      type: 'sodaSpill',
      spillCount: this.melonSoda.spillCount,
      grooveLost,
    });
  };

  private readonly buildSnapshot = (): TelemetrySnapshot => {
    const activeHash = this.activeRoadBeatMap.contentHash;
    const curBest = this.library.getBestScore(activeHash);
    const sessionStats = this.computeSessionStats();
    let forkLeftOption: ForkOptionInfo | null = null;
    let forkRightOption: ForkOptionInfo | null = null;
    if (this.forkActive) {
      const libIndex = this.library.currentIndex;
      const libLength = this.library.items.length;
      const completedStages = this.runManager.completedStages.length;
      const nextItem = this.library.nextTrackItem;
      const rightHash = nextItem?.contentHash ?? '';
      const leftBestScore = curBest?.bestScore ?? null;
      const rightBestScore = nextItem
        ? (this.library.getBestScore(rightHash)?.bestScore ?? null)
        : leftBestScore;

      if (
        !this.cachedForkLeftOption ||
        !this.cachedForkRightOption ||
        activeHash !== this.cachedForkContentHash ||
        rightHash !== this.cachedForkRightContentHash ||
        libIndex !== this.cachedForkLibIndex ||
        libLength !== this.cachedForkLibLength ||
        completedStages !== this.cachedForkCompletedStages ||
        leftBestScore !== this.cachedForkBestLeftScore ||
        rightBestScore !== this.cachedForkBestRightScore
      ) {
        this.cachedForkLeftOption = this.forkController.buildLeftOption(
          this.activeRoadBeatMap,
          this.library,
        );
        this.cachedForkRightOption = this.forkController.buildRightOption(
          this.activeRoadBeatMap,
          this.library,
          completedStages,
        );
        this.cachedForkContentHash = activeHash;
        this.cachedForkRightContentHash = rightHash;
        this.cachedForkLibIndex = libIndex;
        this.cachedForkLibLength = libLength;
        this.cachedForkCompletedStages = completedStages;
        this.cachedForkBestLeftScore = leftBestScore;
        this.cachedForkBestRightScore = rightBestScore;
      }
      forkLeftOption = this.cachedForkLeftOption;
      forkRightOption = this.cachedForkRightOption;
    }

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
      stageNumber: this.runManager.stageNumber,
      stagePaletteName: this.palette.name,
      playlistIndex: this.library.currentIndex,
      playlistLength: this.library.items.length,
      stageScore: Math.round(this.runManager.stageScore),
      bestSongScore: curBest?.bestScore ?? null,
      bestSongGrade: curBest?.bestGrade ?? null,
      isCrossfading: this.audio.isCrossfading,
      crossfadeProgress: this.audio.crossfadeProgress,
      isOutroLooping: this.audio.isOutroLooping,
      forkActive: this.forkActive,
      forkChoice: this.forkChoice,
      forkProgress: this.forkProgress,
      forkLeftOption,
      forkRightOption,
      isPaused: this.isPaused,
      gamepadConnected: this.input.isGamepadConnected?.() ?? false,
      autopilotActive: this.isAutopilotActive,
      autopilotMode: this.autopilot?.mode ?? null,
      // M8 Performance Profiler telemetry
      simTimeMs: Math.round(this.simTimeMs * 100) / 100,
      renderTimeMs: Math.round(this.renderTimeMs * 100) / 100,
      bgRenderMs: Math.round(this.bgRenderMs * 100) / 100,
      roadRenderMs: Math.round(this.roadRenderMs * 100) / 100,
      roadSlicesMs: Math.round(this.roadRenderer.stats.slicesMs * 100) / 100,
      roadPropsMs: Math.round(this.roadRenderer.stats.propsMs * 100) / 100,
      roadTrafficMs: Math.round(this.roadRenderer.stats.trafficMs * 100) / 100,
      carOverlayMs: Math.round(this.carOverlayMs * 100) / 100,
      compositorGapMs:
        Math.round(Math.max(0, this.frameTimeMs - this.simTimeMs - this.renderTimeMs) * 10) / 10,
      frameTimeMs: Math.round(this.frameTimeMs * 10) / 10,
      ...this.computeFrameWindowStats(),
      droppedFrames: this.droppedFrames,
      sessionAvgFps: sessionStats.sessionAvgFps,
      sessionMinFps: sessionStats.sessionMinFps,
      pct60Fps: sessionStats.pct60Fps,
      fixedStepsLastFrame: this.fixedStepsLastFrame,
      drawnSegments: this.roadRenderer.stats.drawnSegments,
      drawnProps: this.roadRenderer.stats.drawnProps,
      drawnTrucks: this.roadRenderer.stats.drawnTrucks,
      drawnPylonSpans: this.roadRenderer.stats.drawnPylonSpans,
      crestClips: this.roadRenderer.stats.crestClips,
      memoryMb: this.memoryMb,
    };
  };

  private computeSessionStats(): {
    sessionAvgFps: number;
    sessionMinFps: number;
    sessionAvgFrameMs: number;
    pct60Fps: number;
  } {
    if (this.sessionFrames > 0 && this.sessionElapsedMs > 0) {
      const avgMs = this.sessionElapsedMs / this.sessionFrames;
      const rawFps = 1000 / avgMs;
      return {
        sessionAvgFps:
          rawFps >= 59.85 && rawFps <= 60.15 ? 60 : Math.round(rawFps * 10) / 10,
        sessionMinFps:
          this.sessionFrames > 30 ? Math.round(this.sessionMinWindowFps) : this.lastFps || 60,
        sessionAvgFrameMs: avgMs,
        pct60Fps: Math.round((this.frames60 / this.sessionFrames) * 1000) / 10,
      };
    }
    return {
      sessionAvgFps: this.lastFps,
      sessionMinFps: this.lastFps,
      sessionAvgFrameMs: this.frameTimeMs,
      pct60Fps: this.frameTimeMs <= 18.5 ? 100 : 0,
    };
  }

  private computeFrameWindowStats(): {
    p95FrameMs: number;
    maxFrameMs: number;
    minFps: number;
  } {
    const nFrames = this.frameDtCount;
    if (nFrames === 0) {
      return {
        p95FrameMs: Math.round(this.frameTimeMs * 10) / 10,
        maxFrameMs: Math.round(this.frameTimeMs * 10) / 10,
        minFps: this.lastFps,
      };
    }
    let maxVal = 0;
    for (let i = 0; i < nFrames; i++) {
      const v = this.frameDtHistory[i]!;
      this.frameDtScratch[i] = v;
      if (v > maxVal) maxVal = v;
    }
    for (let i = 1; i < nFrames; i++) {
      const key = this.frameDtScratch[i]!;
      let j = i - 1;
      while (j >= 0 && this.frameDtScratch[j]! > key) {
        this.frameDtScratch[j + 1] = this.frameDtScratch[j]!;
        j--;
      }
      this.frameDtScratch[j + 1] = key;
    }
    const p95Idx = Math.min(nFrames - 1, Math.floor(nFrames * 0.95));
    const p95FrameMs = Math.round(this.frameDtScratch[p95Idx]! * 10) / 10;
    const maxFrameMs = Math.round(maxVal * 10) / 10;
    const minFps = maxVal > 0 ? Math.round(1000 / maxVal) : this.lastFps;
    return { p95FrameMs, maxFrameMs, minFps };
  }
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
