import {
  BUNDLED_COASTAL_BEATMAP,
  BUNDLED_WANGAN_BEATMAP,
  DEFAULT_SYNTH_BEATMAP,
  FunkAudioEngine,
} from '@src/audio/FunkAudioEngine';
import {
  computeOverallRunGrade,
  computeStageGrade,
  TrackLibrary,
  type StageScoreSummary,
} from '@src/audio/TrackLibrary';
import { tuning } from '@src/config/tuning';
import type { Action, InputPressEvent, InputSource } from '@src/core/InputManager';
import { TelemetryBridge } from '@src/core/TelemetryBridge';
import { cameraDepthFromFov } from '@src/road/RoadProjection';
import { getChosenForkCenter } from '@src/road/RoadSegment';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Game, type GameEvent, type TelemetrySnapshot } from './Game';

class FakeInput implements InputSource {
  private readonly held = new Set<Action>();
  private readonly queue: InputPressEvent[] = [];

  setDown(action: Action, down: boolean): void {
    if (down) this.held.add(action);
    else this.held.delete(action);
  }

  press(action: Action, timeStamp = 100): void {
    this.queue.push({ action, timeStamp });
  }

  isDown(action: Action): boolean {
    return this.held.has(action);
  }

  consumePresses(): readonly InputPressEvent[] {
    const copy = [...this.queue];
    this.queue.length = 0;
    return copy;
  }
}

describe('M6 — TrackLibrary, Grades & Best Scores', () => {
  beforeEach(() => {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.clear();
    }
  });

  it('starts with the 3-stage bundled Future Funk playlist and advances sequentially', () => {
    const lib = new TrackLibrary();
    expect(lib.hasMultipleTracks).toBe(true);
    expect(lib.items.length).toBe(3);
    expect(lib.currentIndex).toBe(0);
    expect(lib.activeItem.contentHash).toBe(DEFAULT_SYNTH_BEATMAP.contentHash);
    expect(lib.hasNextTrack).toBe(true);
    expect(lib.nextTrackItem?.contentHash).toBe(BUNDLED_WANGAN_BEATMAP.contentHash);

    const second = lib.advanceToNextTrack();
    expect(second?.contentHash).toBe(BUNDLED_WANGAN_BEATMAP.contentHash);
    expect(lib.currentIndex).toBe(1);

    const third = lib.advanceToNextTrack();
    expect(third?.contentHash).toBe(BUNDLED_COASTAL_BEATMAP.contentHash);
    expect(lib.currentIndex).toBe(2);
    expect(lib.hasNextTrack).toBe(false);
    expect(lib.advanceToNextTrack()).toBeNull();
  });

  it('computes stage and overall run grades and persists local per-song best scores by contentHash', () => {
    expect(computeStageGrade(9500, 88, 0, 0)).toBe('SSS');
    expect(computeStageGrade(7500, 68, 1, 2)).toBe('S');
    expect(computeStageGrade(9500, 88, 6, 4)).not.toBe('S');
    expect(computeStageGrade(9500, 88, 6, 4)).not.toBe('SSS');
    expect(computeStageGrade(5000, 50, 1, 1)).toBe('A');
    expect(computeStageGrade(2800, 30, 2, 3)).toBe('B');
    expect(computeStageGrade(800, 15, 3, 4)).toBe('C');

    const lib = new TrackLibrary();
    const hash = DEFAULT_SYNTH_BEATMAP.contentHash;
    expect(lib.getBestScore(hash)).toBeNull();

    const firstAttempt: StageScoreSummary = {
      stageNumber: 1,
      contentHash: hash,
      title: DEFAULT_SYNTH_BEATMAP.title,
      artist: DEFAULT_SYNTH_BEATMAP.artist,
      bpm: DEFAULT_SYNTH_BEATMAP.bpm,
      score: 4800,
      grade: 'A',
      avgGroove: 54,
      maxGroove: 70,
      perfectShifts: 3,
      goodShifts: 2,
      dropSyncs: 1,
      collisions: 1,
      sodaSpills: 0,
      tofuModeUsed: false,
      durationSec: 120,
    };

    const res1 = lib.recordStageResult(firstAttempt);
    expect(res1.isNewRecord).toBe(true);
    expect(res1.best.bestScore).toBe(4800);
    expect(res1.best.bestGrade).toBe('A');

    // Lower score does not overwrite bestScore or bestGrade
    const lowerAttempt: StageScoreSummary = {
      ...firstAttempt,
      score: 3100,
      grade: 'B',
      durationSec: 130,
    };
    const res2 = lib.recordStageResult(lowerAttempt);
    expect(res2.isNewRecord).toBe(false);
    expect(lib.getBestScore(hash)?.bestScore).toBe(4800);
    expect(lib.getBestScore(hash)?.bestGrade).toBe('A');

    // Higher score sets a new record
    const recordAttempt: StageScoreSummary = {
      ...firstAttempt,
      score: 9600,
      grade: 'SSS',
      avgGroove: 90,
      maxGroove: 100,
      durationSec: 112,
    };
    const res3 = lib.recordStageResult(recordAttempt);
    expect(res3.isNewRecord).toBe(true);
    expect(lib.getBestScore(hash)?.bestScore).toBe(9600);
    expect(lib.getBestScore(hash)?.bestGrade).toBe('SSS');
    expect(lib.getBestScore(hash)?.bestTimeSec).toBe(112);

    expect(computeOverallRunGrade([firstAttempt, recordAttempt])).toBe('S');
  });
});

describe('M6 — Stage Forks, 4-Bar DJ Crossfade, Outro Hold Loop & Run Completion', () => {
  it('activates stage fork in the final bars, follows lane/input choice, and transitions through all stages to runCompleted', () => {
    const input = new FakeInput();
    const bridge = new TelemetryBridge<TelemetrySnapshot, GameEvent>(15);
    const audio = new FunkAudioEngine();
    const library = new TrackLibrary();
    const game = new Game({ input, bridge, audio, library });

    const events: GameEvent[] = [];
    bridge.onEvent((ev) => events.push(ev));

    // Move car into the fork approach zone of Stage 1 (last 4 bars)
    game.position = game.track.length - 2000;
    game.car.x = -0.5; // Left lane -> 'left' branch (loop current track)
    game.update(1 / 60);

    let snap = bridge.getSnapshot()!;
    expect(snap.forkActive).toBe(true);
    expect(snap.forkChoice).toBe('left');
    expect(snap.forkLeftOption?.mode).toBe('loop');
    expect(snap.forkRightOption?.mode).toBe('nextTrack');

    // Pressing 'forkRight' (key [2]) locks right branch and moves car into right lane,
    // while keeping Stage 1's active BeatClock undisturbed until crossing the finish gate.
    input.press('forkRight');
    game.update(1 / 60);
    expect(game.car.x).toBeGreaterThan(0);
    expect(audio.beatMap.contentHash).toBe(DEFAULT_SYNTH_BEATMAP.contentHash);

    // Cross the finish line on the Right branch -> advances to Stage 2 (Midnight Wangan)
    // and initiates the 4-bar DJ crossfade cleanly aligned with Bar 0 of Stage 2.
    game.position = game.track.length - 10;
    game.car.speed = 6000;
    game.update(1 / 60);

    expect(library.currentIndex).toBe(1);
    expect(audio.isCrossfading).toBe(true);
    expect(audio.beatMap.contentHash).toBe(BUNDLED_WANGAN_BEATMAP.contentHash);
    expect(events.some((e) => e.type === 'stageCompleted')).toBe(true);
    expect(
      events.some((e) => e.type === 'stageTransition' && e.stageNumber === 2),
    ).toBe(true);
    // Flow State: Car must smoothly carry over its momentum into Stage 2 without stopping!
    expect(game.car.speed).toBeGreaterThan(5000);
    expect(game.hasStartedDriving).toBe(true);

    // Advance through Stage 2 -> Stage 3 with preserved speed
    game.position = game.track.length - 10;
    game.car.x = 0.5; // Right lane
    game.update(1 / 60);

    expect(library.currentIndex).toBe(2);
    expect(
      events.some((e) => e.type === 'stageTransition' && e.stageNumber === 3),
    ).toBe(true);
    expect(game.car.speed).toBeGreaterThan(5000);
    expect(game.hasStartedDriving).toBe(true);

    // In Stage 3 (final track), the Right fork option is 'finishRun'
    game.position = game.track.length - 1500;
    game.car.x = 0.5;
    game.update(1 / 60);
    snap = bridge.getSnapshot()!;
    expect(snap.forkRightOption?.mode).toBe('finishRun');

    // Cross finish line of Stage 3 -> emits 'runCompleted' with 3 completed stages!
    game.position = game.track.length - 10;
    game.car.speed = 6000;
    game.update(1 / 60);

    const runCompleted = events.find((e) => e.type === 'runCompleted');
    expect(runCompleted).toBeDefined();
    if (runCompleted && runCompleted.type === 'runCompleted') {
      expect(runCompleted.summary.stages.length).toBe(3);
      expect(runCompleted.summary.overallGrade).toBeDefined();
    }

    // Restarting playlist run resets back to Stage 1
    game.restartPlaylistRun();
    expect(library.currentIndex).toBe(0);
  });

  it('holds Dub Tape Delay wash at native playbackRate without rewinding 8 bars', () => {
    const engine = new FunkAudioEngine(DEFAULT_SYNTH_BEATMAP);
    const dur = DEFAULT_SYNTH_BEATMAP.durationSec;

    // Late outro approach: song maintains native 1.0x pitch and tempo (zero Tape Drag slowdown)
    (engine as unknown as { virtualTrackSec: number }).virtualTrackSec = dur - 4; // ~8 beats remaining
    for (let i = 0; i < 30; i++) {
      engine.update(1 / 60, {
        speedRatio: 0.8,
        isDrifting: false,
        isOffRoad: false,
        holdOutroLoop: true,
      });
    }
    expect(engine.playbackRate).toBe(1.0);

    // Stage 2: Advance virtualTrackSec past durationSec while holdOutroLoop is true
    const clockState = engine.update(dur + 1, {
      speedRatio: 0.4,
      isDrifting: false,
      isOffRoad: false,
      holdOutroLoop: true,
    });

    expect(engine.isOutroLooping).toBe(true);
    expect(engine.playbackRate).toBe(1.0);
    // ZERO REWIND: virtualTrackSec does NOT jump backward by 8 bars!
    expect((engine as unknown as { virtualTrackSec: number }).virtualTrackSec).toBeGreaterThanOrEqual(dur);
    // Clock continues sampling valid, monotonic beat values
    expect(clockState.beatFloat).toBeGreaterThan(0);

    // Releasing holdOutroLoop clears the outro loop flag and resets dub state
    engine.update(0.1, {
      speedRatio: 0.8,
      isDrifting: false,
      isOffRoad: false,
      holdOutroLoop: false,
    });
    expect(engine.isOutroLooping).toBe(false);
  });

  it('aligns fork asphalt bounds, central V-island off-road, prop offsets, and post-fork recentering', () => {
    const input = new FakeInput();
    const bridge = new TelemetryBridge<TelemetrySnapshot, GameEvent>(15);
    const audio = new FunkAudioEngine();
    const library = new TrackLibrary();
    const game = new Game({ input, bridge, audio, library });

    const collisions: GameEvent[] = [];
    bridge.onEvent((ev) => {
      if (ev.type === 'collision') collisions.push(ev);
    });

    // 1. In Phase 2 of the Y-fork (where branch asphalt is [0.52, 1.68] and props are shifted outward),
    // driving at x = 1.25 (center of the widened right branch) must be ON-ROAD and hit zero props!
    const forkStartZ = game.getForkZoneStartZ()!;
    const span = game.track.length - forkStartZ;
    game.position = forkStartZ + span * 0.45;
    game.car.x = 1.25;
    game.car.prevX = 1.25;
    game.car.speed = 6000;
    game.update(1 / 120);
    expect(game.car.isOffRoad).toBe(false);
    expect(collisions.length).toBe(0);

    // 2. Driving across x = 0.0 inside the attached dual-carriageway body must stay ON-ROAD
    //    (zero central grass island blocking lane changes), while x = 1.65 outside outerLimit is OFF-ROAD.
    game.car.x = 0.0;
    game.car.prevX = 0.0;
    game.update(1 / 120);
    expect(game.car.isOffRoad).toBe(false);

    game.car.x = 1.65;
    game.car.prevX = 1.65;
    game.update(1 / 120);
    expect(game.car.isOffRoad).toBe(true);
    expect(game.car.offRoadDepth).toBeGreaterThan(0.1);

    // 3. Switching across x = 0 remains free even at late fork progress (t = 0.85),
    //    and in the final taper (t = 0.88) wide lateral positions are softly bounded inward.
    game.position = forkStartZ + span * 0.85;
    game.car.x = -0.65;
    game.car.prevX = -0.65;
    game.update(1 / 120);
    expect(game.forkChoice).toBe('left');
    game.car.x = 0.65;
    game.car.prevX = 0.65;
    game.update(1 / 120);
    expect(game.forkChoice).toBe('right');

    game.position = forkStartZ + span * 0.88;
    game.car.x = 1.42;
    game.car.prevX = 1.42;
    const prevX = game.car.x;
    for (let i = 0; i < 30; i++) {
      game.update(1 / 120);
    }
    expect(game.car.x).toBeLessThan(prevX);
    expect(game.car.isOffRoad).toBe(false);

    // 4. Crossing the finish line recenters/safely bounds the car onto the new road
    //    without triggering a phantom wrap-around collision against segment 0 props.
    game.position = game.track.length - 20;
    game.car.x = 0.5;
    game.car.prevX = 0.5;
    game.car.speed = 6000;
    game.update(1 / 60);

    expect(Math.abs(game.car.x)).toBeLessThanOrEqual(0.85);
    expect(collisions.length).toBe(0);
  });
});

describe('Spacetime Hybrid Sync (A1 + A2)', () => {
  it('modulates world advancement within [1 - slowdown, 1 + speedup] bounds', () => {
    const input = new FakeInput();
    const bridge = new TelemetryBridge<TelemetrySnapshot, GameEvent>(15);
    const audio = new FunkAudioEngine();
    const game = new Game({ input, bridge, audio });

    // Car cruising at 60% speed
    game.car.speed = 7200;
    const startPos = 10 * game.track.segmentLength;
    game.position = startPos;

    // Simulate 1 step (1/60s)
    game.update(1 / 60);

    const advancedDist = game.position - startPos;
    const baseDist = 7200 * (1 / 60);

    // Advanced distance should be scaled by A1 paceFactor / elastic factor
    expect(advancedDist).toBeGreaterThan(0);
    expect(advancedDist / baseDist).toBeGreaterThanOrEqual(1 - tuning.syncMaxSlowdown - 0.01);
    expect(advancedDist / baseDist).toBeLessThanOrEqual(1 + tuning.syncMaxSpeedup + 0.01);
  });

  it('synchronizes relaxed driving (65% speed) with drop crest and reaches stage fork without being trapped in outro loop', () => {
    const input = new FakeInput();
    const bridge = new TelemetryBridge<TelemetrySnapshot, GameEvent>(15);
    const audio = new FunkAudioEngine();
    const library = new TrackLibrary();
    const game = new Game({ input, bridge, audio, library });

    const dropSyncs: { barIndex: number; deltaBeats: number }[] = [];
    bridge.onEvent((ev) => {
      if (ev.type === 'dropSync') {
        dropSyncs.push({ barIndex: ev.barIndex, deltaBeats: ev.deltaBeats });
      }
    });

    // Simulate relaxed driving at ~68% maxSpeed (approx 8160 world units/s, well below old 0.85 baseline of 10200)
    // Run simulation through the first drop (bar 16) and beyond
    const dt = 1 / 60;
    const totalSimTime = 55; // 55 seconds (song has bar 16 drop at ~31.5s)
    const steps = Math.floor(totalSimTime / dt);

    for (let step = 0; step < steps; step++) {
      // Simulate player maintaining 3rd-4th gear cruising speed (~8100)
      game.car.speed = 8100;
      game.update(dt);
    }

    // Must have crossed the first drop (bar 16) with dropSync trigger (|deltaBeats| <= 1.25)
    expect(dropSyncs.length).toBeGreaterThanOrEqual(1);
    const firstDrop = dropSyncs.find((d) => d.barIndex === 16);
    expect(firstDrop).toBeDefined();
    if (firstDrop) {
      expect(Math.abs(firstDrop.deltaBeats)).toBeLessThanOrEqual(1.25);
    }

    // Continue simulation until near the end of the 64-bar song (~125s)
    const remainingTime = 72; // total ~127s
    const remainingSteps = Math.floor(remainingTime / dt);
    for (let step = 0; step < remainingSteps; step++) {
      game.car.speed = 8100;
      game.update(dt);
    }

    // Car should have reached the stage fork or completed the stage, and DJ should NOT be stuck in holdOutroLoop
    expect(audio.isOutroLooping).toBe(false);
  });

  it('pauses and resumes simulation, audio clock, and renders pause overlay (M8 Polish)', () => {
    const input = new FakeInput();
    const bridge = new TelemetryBridge<TelemetrySnapshot, GameEvent>(15);
    const audio = new FunkAudioEngine();
    const library = new TrackLibrary();
    const game = new Game({ input, bridge, audio, library });

    const pauseEvents: boolean[] = [];
    bridge.onEvent((ev) => {
      if (ev.type === 'pauseChanged') {
        pauseEvents.push(ev.paused);
      }
    });

    expect(game.paused).toBe(false);

    // Initial tick to publish first telemetry snapshot
    game.update(1 / 60);
    expect(bridge.getSnapshot()?.isPaused).toBe(false);

    // 1. Trigger Pause via togglePause() or action 'pause'
    input.press('pause');
    game.update(1 / 60);

    expect(game.paused).toBe(true);
    expect(pauseEvents).toEqual([true]);
    expect(bridge.getSnapshot()?.isPaused).toBe(true);

    const posAtPause = game.position;
    const speedAtPause = game.car.speed;

    // 2. Advancing update while paused should NOT advance simulation
    input.setDown('accelerate', true);
    game.update(0.5);
    expect(game.position).toBe(posAtPause);
    expect(game.car.speed).toBe(speedAtPause);

    // 3. Resume via explicit pause toggle (driving keys must NOT unpause while in Pause/Menus)
    input.press('pause');
    game.update(1 / 60);
    expect(game.paused).toBe(false);
    expect(pauseEvents).toEqual([true, false]);
    expect(bridge.getSnapshot()?.isPaused).toBe(false);

    // 4. Render pause overlay when paused
    game.setPaused(true);
    const fillRectCalls: unknown[][] = [];
    const fillTextCalls: unknown[][] = [];
    const mockCtx = {
      canvas: { width: 640, height: 360 },
      save: () => {},
      restore: () => {},
      fillRect: (...args: unknown[]) => fillRectCalls.push(args),
      strokeRect: () => {},
      fillText: (...args: unknown[]) => fillTextCalls.push(args),
      beginPath: () => {},
      closePath: () => {},
      moveTo: () => {},
      lineTo: () => {},
      quadraticCurveTo: () => {},
      arc: () => {},
      ellipse: () => {},
      rect: () => {},
      clip: () => {},
      fill: () => {},
      stroke: () => {},
      translate: () => {},
      rotate: () => {},
      scale: () => {},
      setTransform: () => {},
      setLineDash: () => {},
      createLinearGradient: () => ({ addColorStop: () => {} }),
      createRadialGradient: () => ({ addColorStop: () => {} }),
      drawImage: () => {},
    } as unknown as CanvasRenderingContext2D;

    game.render(mockCtx, 1, 60);
    expect(fillRectCalls.length).toBeGreaterThan(0);
    // Pause UI is owned by the React Mayonaka Hi-Fi PauseMenu, not a legacy canvas box
    expect(fillTextCalls.some((c) => c[0] === 'PAUSED')).toBe(false);
  });

  it('locks gameplay input while menus/modals are active so WASD cannot unpause or drive', () => {
    const input = new FakeInput();
    const bridge = new TelemetryBridge<TelemetrySnapshot, GameEvent>(60);
    const game = new Game({ input, bridge });

    game.setPaused(true);
    game.setInputLocked(true);

    // Pressing accelerate, brake, shiftUp, or pause while locked must not unpause or drive
    input.setDown('accelerate', true);
    input.press('accelerate');
    input.press('brake');
    input.press('shiftUp');
    input.press('pause');
    game.update(1 / 60);

    expect(game.paused).toBe(true);
    expect(game.hasStartedDriving).toBe(false);
    expect(game.car.speed).toBe(0);
    expect(game.position).toBe(0);

    // Unlocking input does not replay stale queued presses from menu navigation
    input.setDown('accelerate', false);
    game.setInputLocked(false);
    game.update(1 / 60);
    expect(game.paused).toBe(true);
    expect(game.hasStartedDriving).toBe(false);
  });

  it('measures real-time physics and render profiling metrics for M8 Performance Profiler', () => {
    const input = new FakeInput();
    const bridge = new TelemetryBridge<TelemetrySnapshot, GameEvent>(60);
    const game = new Game({ input, bridge });

    const mockCtx = {
      canvas: { width: 640, height: 360 },
      save: () => {},
      restore: () => {},
      fillRect: () => {},
      strokeRect: () => {},
      fillText: () => {},
      beginPath: () => {},
      closePath: () => {},
      moveTo: () => {},
      lineTo: () => {},
      quadraticCurveTo: () => {},
      arc: () => {},
      ellipse: () => {},
      rect: () => {},
      clip: () => {},
      fill: () => {},
      stroke: () => {},
      translate: () => {},
      rotate: () => {},
      scale: () => {},
      setTransform: () => {},
      setLineDash: () => {},
      createLinearGradient: () => ({ addColorStop: () => {} }),
      createRadialGradient: () => ({ addColorStop: () => {} }),
      drawImage: () => {},
    } as unknown as CanvasRenderingContext2D;

    // Run 3 simulation steps and 1 render pass
    game.update(1 / 120);
    game.update(1 / 120);
    game.render(mockCtx, 1, 60);
    game.update(1 / 120);

    const snap = bridge.getSnapshot();
    expect(snap).toBeDefined();
    if (!snap) return;

    expect(snap.fps).toBe(60);
    expect(snap.frameTimeMs).toBeGreaterThan(0);
    expect(snap.simTimeMs).toBeGreaterThanOrEqual(0);
    expect(snap.renderTimeMs).toBeGreaterThanOrEqual(0);
    expect(snap.bgRenderMs).toBeGreaterThanOrEqual(0);
    expect(snap.roadRenderMs).toBeGreaterThanOrEqual(0);
    expect(snap.roadSlicesMs).toBeGreaterThanOrEqual(0);
    expect(snap.roadPropsMs).toBeGreaterThanOrEqual(0);
    expect(snap.roadTrafficMs).toBeGreaterThanOrEqual(0);
    expect(snap.carOverlayMs).toBeGreaterThanOrEqual(0);
    expect(snap.compositorGapMs).toBeGreaterThanOrEqual(0);
    expect(snap.p95FrameMs).toBeGreaterThan(0);
    expect(snap.maxFrameMs).toBeGreaterThan(0);
    expect(snap.minFps).toBeGreaterThan(0);
    expect(snap.droppedFrames).toBeGreaterThanOrEqual(0);
    expect(snap.drawnSegments).toBeGreaterThan(0);
    expect(snap.fixedStepsLastFrame).toBeGreaterThanOrEqual(1);
    expect(snap.drawnProps).toBeGreaterThanOrEqual(0);
    expect(snap.drawnTrucks).toBeGreaterThanOrEqual(0);
  });

  it('keeps hasStartedDriving = false, lapTime = 0, and traffic idle until player drives', () => {
    const input = new FakeInput();
    const game = new Game({ input });
    const firstTruck = game.traffic.trucks[0]!;
    const initialTruckZ = firstTruck.z;

    expect(game.hasStartedDriving).toBe(false);

    // Simulate 30 frames while sitting idle at the start line (selecting music, skins, etc.)
    for (let i = 0; i < 30; i++) {
      game.update(1 / 60);
    }

    expect(game.hasStartedDriving).toBe(false);
    expect(firstTruck.z).toBe(initialTruckZ);

    // Now player begins driving (presses accelerate)
    input.setDown('accelerate', true);
    game.update(1 / 60);

    expect(game.hasStartedDriving).toBe(true);

    // Simulate more frames: car accelerates and traffic advances
    for (let i = 0; i < 30; i++) {
      game.update(1 / 60);
    }
    expect(firstTruck.z).toBeGreaterThan(initialTruckZ);

    // Restarting run resets hasStartedDriving back to false
    game.restartPlaylistRun();
    expect(game.hasStartedDriving).toBe(false);
  });

  it('correctly resets audio on lap 2 loop and does not trap stopped car in outro loop', () => {
    const input = new FakeInput();
    const bridge = new TelemetryBridge<TelemetrySnapshot, GameEvent>(15);
    const audio = new FunkAudioEngine();
    const library = new TrackLibrary();
    const game = new Game({ input, bridge, audio, library });
    const gameAcc = game as unknown as {
      position: number;
      car: { x: number };
      forkChoice: 'left' | 'right';
      lap: number;
      roadBarIndex: number;
      sectionRole: string;
      drivingAudioParams: { holdOutroLoop?: boolean };
    };

    const dt = 1 / 60;
    input.setDown('accelerate', true);
    for (let i = 0; i < 60; i++) game.update(dt);

    // Fast-forward into fork approach zone
    const forkStart = game.getForkZoneStartZ()!;
    gameAcc.position = forkStart + 20;
    gameAcc.car.x = -0.6;
    game.update(dt);
    expect(gameAcc.forkChoice).toBe('left');

    // Simulate audio reaching outro near end of lap 1
    (audio as unknown as { virtualTrackSec: number }).virtualTrackSec = 110;

    // Cross finish line into lap 2
    gameAcc.position = game.track.length - 10;
    game.update(dt);

    expect(gameAcc.lap).toBe(2);
    // Road is at start of track
    expect(gameAcc.roadBarIndex).toBeLessThanOrEqual(1);

    // Audio MUST be reset/crossfaded to the start of the track (intro)
    expect((audio as unknown as { virtualTrackSec: number }).virtualTrackSec).toBeLessThan(1.0);
    expect(gameAcc.sectionRole).toBe('intro');

    // Drive 5 seconds into Lap 2
    for (let i = 0; i < 300; i++) game.update(dt);
    expect(gameAcc.roadBarIndex).toBeLessThan(10);

    // Stop the car on Lap 2
    input.setDown('accelerate', false);
    input.setDown('brake', true);
    for (let i = 0; i < 180; i++) game.update(dt);

    expect(game.car.speed).toBe(0);
    // Stopped at the beginning of the road -> holdOutroLoop MUST NOT BE TRUE!
    // (A stopped car at bar 2 is not falling behind the fork; it is at the start!)
    expect(gameAcc.drivingAudioParams.holdOutroLoop).toBe(false);
    expect(audio.isOutroLooping).toBe(false);

    // Advancing time past song duration while car is stopped:
    // Audio should wrap back to intro and NEVER get trapped in an outro loop!
    const dur = audio.beatMap.durationSec;
    for (let sec = 0; sec < dur + 10; sec += 1) {
      for (let i = 0; i < 60; i++) game.update(dt);
    }
    expect(audio.isOutroLooping).toBe(false);
  });

  it('transitions continuously across stage forks with zero frame-0 teleport, zero speed snap, and synchronized DJ crossfade', () => {
    const input = new FakeInput();
    const bridge = new TelemetryBridge<TelemetrySnapshot, GameEvent>(15);
    const audio = new FunkAudioEngine();
    const library = new TrackLibrary();
    const game = new Game({ input, bridge, audio, library });
    const gameAcc = game as unknown as {
      position: number;
      renderPalette: { id: string; skyTop: string };
      activeNextTrackLookahead?: { length: number; segments: unknown[] };
    };

    const mockCtx = {
      canvas: { width: 640, height: 360 },
      save: () => {},
      restore: () => {},
      fillRect: () => {},
      strokeRect: () => {},
      fillText: () => {},
      beginPath: () => {},
      closePath: () => {},
      moveTo: () => {},
      lineTo: () => {},
      quadraticCurveTo: () => {},
      arc: () => {},
      ellipse: () => {},
      rect: () => {},
      clip: () => {},
      fill: () => {},
      stroke: () => {},
      translate: () => {},
      rotate: () => {},
      scale: () => {},
      setTransform: () => {},
      setLineDash: () => {},
      createLinearGradient: () => ({ addColorStop: () => {} }),
      createRadialGradient: () => ({ addColorStop: () => {} }),
      drawImage: () => {},
    } as unknown as CanvasRenderingContext2D;

    const transitions: GameEvent[] = [];
    bridge.onEvent((ev) => {
      if (ev.type === 'stageTransition') transitions.push(ev);
    });

    const dt = 1 / 60;
    const cruiseSpeed = 9500;
    input.setDown('accelerate', true);

    // Start driving first so audio & traffic clocks initialize before seeking near finish
    game.update(dt);

    // Seek player & audio clock 4 bars before Stage 1's finish line, then run 1 settle tick so
    // FunkAudioEngine's sampled beat clock & SongRoadSyncController pick up the new song position.
    const stage1Length = game.track.length;
    const barLengthWorld = (game.track as { barLengthWorld?: number }).barLengthWorld ?? 0;
    expect(barLengthWorld).toBeGreaterThan(0);
    const startApproachZ = stage1Length - 4 * barLengthWorld;
    game.position = startApproachZ;
    game.car.x = 0.95;
    game.car.speed = cruiseSpeed;
    game.car.gearbox.gear = 5;
    const approachRatio = startApproachZ / Math.max(1, game.track.length);
    (audio as unknown as { virtualTrackSec: number }).virtualTrackSec =
      audio.beatMap.durationSec * approachRatio;
    game.update(dt);
    game.position = startApproachZ;
    game.car.speed = cruiseSpeed;
    game.car.gearbox.gear = 5;

    let enteredStage2 = false;
    let prevPosBeforeFinish = game.position;
    let prevAudioSecInStage2 = -1;

    // Drive continuously for ~12 seconds across the final 4 bars of Stage 1 and first ~4 bars of Stage 2
    for (let step = 0; step < 720; step++) {
      // Hold steady highway cruise speed (5th gear matches 9500 cruise) & Right carriageway
      game.car.speed = cruiseSpeed;
      if (game.car.gear < 5) game.car.gearbox.gear = 5;
      if (library.currentIndex === 0) {
        game.car.x = 0.75;
      }
      const beforeStage = library.currentIndex;
      const beforePos = game.position;
      game.update(dt);
      game.render(mockCtx, 1, 60);

      if (beforeStage === 0 && library.currentIndex === 0) {
        // While still on Stage 1, position must never stall/warp or run off Stage 1's BeatClock
        const delta = game.position - beforePos;
        expect(delta).toBeGreaterThan(cruiseSpeed * dt * 0.9);
        expect(audio.beatMap.contentHash).toBe(DEFAULT_SYNTH_BEATMAP.contentHash);
        prevPosBeforeFinish = game.position;

        // Approaching the horizon boundary pre-warms Stage 2's blueprint into the streaming assembler
        if (game.position >= game.track.length - 25000) {
          expect(
            (game.track as { nextBlueprint?: { contentHash: string } | null }).nextBlueprint
              ?.contentHash,
          ).toBe(BUNDLED_WANGAN_BEATMAP.contentHash);
        }
      } else if (beforeStage === 0 && library.currentIndex === 1) {
        enteredStage2 = true;
        const stage2EntryPos = game.position;
        // CRITICAL: crossing into Stage 2 enters near bar 0 (<= 1 frame overshoot), NEVER teleported ~2 bars ahead!
        expect(stage2EntryPos).toBeGreaterThanOrEqual(0);
        expect(stage2EntryPos).toBeLessThan(260);
        // Audio starts 4-bar crossfade at Stage 2 Beat 0 in tight phase alignment with Segment 0
        expect(audio.isCrossfading).toBe(true);
        expect(audio.beatMap.contentHash).toBe(BUNDLED_WANGAN_BEATMAP.contentHash);
        const audioSec = (audio as unknown as { virtualTrackSec: number }).virtualTrackSec;
        expect(audioSec).toBeLessThan(0.15);
        prevAudioSecInStage2 = audioSec;
        // Frame 0 of Stage 2 starts palette blend continuously from Stage 1's colors (no abrupt cut)
        expect(gameAcc.renderPalette.skyTop).not.toBe(game.palette.skyTop);
        expect(prevPosBeforeFinish).toBeLessThan(stage1Length);
      } else if (enteredStage2) {
        // Every subsequent frame in Stage 2 advances monotonically without stitch teleports or audio rewind
        const delta = game.position - beforePos;
        expect(delta).toBeGreaterThan(0);
        expect(delta).toBeLessThan(cruiseSpeed * dt * 1.3);
        const audioSec = (audio as unknown as { virtualTrackSec: number }).virtualTrackSec;
        expect(audioSec).toBeGreaterThan(prevAudioSecInStage2);
        prevAudioSecInStage2 = audioSec;
      }
    }

    expect(enteredStage2).toBe(true);
    expect(transitions.length).toBe(1);
    // After 2.5+ seconds in Stage 2, palette crossfade finishes smoothly on Stage 2's target palette
    expect(gameAcc.renderPalette.skyTop).toBe(game.palette.skyTop);
  });

  it('does not trigger false Tape Drag or phantom fork reset when cruising an 80-bar track in 5th/6th gear', () => {
    const prevTraffic = tuning.trafficDensity;
    tuning.trafficDensity = 0;
    try {
      const input = new FakeInput();
      input.setDown('accelerate', true);
      const bridge = new TelemetryBridge<TelemetrySnapshot, GameEvent>(15);
      const library = new TrackLibrary();
      const bpm = 117;
      const totalBars = 80;
      const barDur = (60 / bpm) * 4;
      const longMap = {
        ...DEFAULT_SYNTH_BEATMAP,
        contentHash: 'sha256:alarming-temps-80bar-test',
        title: 'Alarming Temperatures Test',
        bpm,
        durationSec: totalBars * barDur,
        barEnergy: Array.from({ length: totalBars }, (_, b) => (b < 8 ? 0.35 : b < 16 ? 0.6 : 0.85)),
        barBrightness: new Array<number>(totalBars).fill(0.8),
        sections: [
          { startBar: 0, bars: 8, role: 'intro' as const },
          { startBar: 8, bars: 8, role: 'build' as const },
          { startBar: 16, bars: 56, role: 'drop' as const },
          { startBar: 72, bars: 8, role: 'outro' as const },
        ],
      };
      void library.updateBeatMap(library.activeItem.contentHash, longMap);
      const audio = new FunkAudioEngine(longMap);
      const game = new Game({ input, bridge, audio, library });
      const asm = (game as unknown as { horizonAssembler: { resetAtBar: (...args: unknown[]) => void } }).horizonAssembler;
      const resetSpy = vi.spyOn(asm, 'resetAtBar');

      const dt = 1 / 60;
      const maxSteps = Math.ceil((totalBars * barDur + 12) / dt);
      let sawForkActive = false;
      let forkResetAfterActivation = false;
      let minLatePlaybackRate = 1.0;
      let transitionedToStage2 = false;

      for (let step = 0; step < maxSteps; step++) {
        game.hasStartedDriving = true;
        game.car.speed = tuning.maxSpeed * 0.96;
        game.car.gearbox.gear = 6;
        game.car.x = game.forkActive ? getChosenForkCenter(game.forkProgress, 'right') : 0;
        game.car.prevX = game.car.x;
        game.update(dt);

        if (library.currentIndex === 0) {
          if (game.forkActive) {
            sawForkActive = true;
          } else if (sawForkActive) {
            forkResetAfterActivation = true;
          }
          if (game.roadBarIndex >= totalBars - 10 && game.forkProgress < 0.98) {
            minLatePlaybackRate = Math.min(minLatePlaybackRate, audio.playbackRate);
          }
        } else if (library.currentIndex === 1) {
          transitionedToStage2 = true;
          break;
        }
      }

      expect(sawForkActive).toBe(true);
      expect(forkResetAfterActivation).toBe(false);
      expect(minLatePlaybackRate).toBeGreaterThanOrEqual(0.99);
      expect(transitionedToStage2).toBe(true);
      expect(resetSpy).not.toHaveBeenCalled();
      expect(audio.beatMap.contentHash).toBe(BUNDLED_WANGAN_BEATMAP.contentHash);
    } finally {
      tuning.trafficDensity = prevTraffic;
    }
  });

  it('prevents false Tape Drag on a 104-bar 117 BPM track after mid-song Overdrive drops to 5th gear', () => {
    const prevTraffic = tuning.trafficDensity;
    tuning.trafficDensity = 0;
    try {
      const input = new FakeInput();
      input.setDown('accelerate', true);
      const bridge = new TelemetryBridge<TelemetrySnapshot, GameEvent>(15);
      const library = new TrackLibrary();
      const bpm = 117;
      const totalBars = 104;
      const barDur = (60 / bpm) * 4;
      const longMap = {
        ...DEFAULT_SYNTH_BEATMAP,
        contentHash: 'sha256:alarming-temps-104bar-variable-speed',
        title: 'Alarming Temperatures 104-Bar Test',
        bpm,
        durationSec: totalBars * barDur,
        barEnergy: Array.from({ length: totalBars }, (_, b) => (b < 8 ? 0.35 : b < 16 ? 0.6 : 0.85)),
        barBrightness: new Array<number>(totalBars).fill(0.8),
        sections: [
          { startBar: 0, bars: 8, role: 'intro' as const },
          { startBar: 8, bars: 8, role: 'build' as const },
          { startBar: 16, bars: 80, role: 'drop' as const },
          { startBar: 96, bars: 8, role: 'outro' as const },
        ],
      };
      void library.updateBeatMap(library.activeItem.contentHash, longMap);
      const audio = new FunkAudioEngine(longMap);
      const game = new Game({ input, bridge, audio, library });
      const asm = (game as unknown as { horizonAssembler: { resetAtBar: (...args: unknown[]) => void } }).horizonAssembler;
      const resetSpy = vi.spyOn(asm, 'resetAtBar');

      const dt = 1 / 60;
      const maxSteps = Math.ceil((totalBars * barDur + 16) / dt);
      let sawForkActive = false;
      let forkResetAfterActivation = false;
      let minLatePlaybackRate = 1.0;
      let transitionedToStage2 = false;

      for (let step = 0; step < maxSteps; step++) {
        game.hasStartedDriving = true;
        // Mid-song 6th-gear Overdrive peak (bars 20..55), then 5th gear + curve/hill dips (bars 56..104)
        const bar = game.roadBarIndex;
        if (bar >= 20 && bar <= 55) {
          game.car.speed = tuning.maxSpeed * 1.04;
          game.car.gearbox.gear = 6;
        } else if (bar >= 56 && bar <= 90) {
          game.car.speed = tuning.maxSpeed * 0.91;
          game.car.gearbox.gear = 5;
        } else {
          game.car.speed = tuning.maxSpeed * (bar % 4 === 0 ? 0.86 : 0.91);
          game.car.gearbox.gear = 5;
        }
        game.car.x = game.forkActive ? getChosenForkCenter(game.forkProgress, 'right') : 0;
        game.car.prevX = game.car.x;
        game.update(dt);

        if (library.currentIndex === 0) {
          if (game.forkActive) {
            sawForkActive = true;
          } else if (sawForkActive) {
            forkResetAfterActivation = true;
          }
          if (game.roadBarIndex >= totalBars - 12 && game.forkProgress < 0.98) {
            minLatePlaybackRate = Math.min(minLatePlaybackRate, audio.playbackRate);
          }
        } else if (library.currentIndex === 1) {
          transitionedToStage2 = true;
          break;
        }
      }

      expect(sawForkActive).toBe(true);
      expect(forkResetAfterActivation).toBe(false);
      expect(minLatePlaybackRate).toBeGreaterThanOrEqual(0.99);
      expect(transitionedToStage2).toBe(true);
      expect(resetSpy).not.toHaveBeenCalled();
      expect(audio.beatMap.contentHash).toBe(BUNDLED_WANGAN_BEATMAP.contentHash);
    } finally {
      tuning.trafficDensity = prevTraffic;
    }
  });

  it('updates horizonAssembler.nextBlueprint when TrackLibrary playlist mutates after track load and unsubscribes on dispose()', () => {
    const input = new FakeInput();
    const library = new TrackLibrary();
    library.removeTrack(2);
    library.removeTrack(1);
    const audio = new FunkAudioEngine(library.activeItem.beatMap);
    const game = new Game({ input, audio, library });

    expect((game.track as { nextBlueprint?: { contentHash: string } | null }).nextBlueprint).toBeNull();

    library.restoreDefaultPlaylist();
    expect(
      (game.track as { nextBlueprint?: { contentHash: string } | null }).nextBlueprint?.contentHash,
    ).toBe(BUNDLED_WANGAN_BEATMAP.contentHash);

    game.dispose();
    library.removeTrack(2);
    library.removeTrack(1);
    // Listener was unsubscribed on dispose(), so track.nextBlueprint is untouched
    expect(
      (game.track as { nextBlueprint?: { contentHash: string } | null }).nextBlueprint?.contentHash,
    ).toBe(BUNDLED_WANGAN_BEATMAP.contentHash);
  });
});

describe('MP-10 — Single-Track End-of-Run Fork', () => {
  it('opens the stage fork in single-track mode and emits runCompleted on Right branch while looping on Left branch', () => {
    const library = new TrackLibrary();
    library.removeTrack(2);
    library.removeTrack(1);
    expect(library.hasMultipleTracks).toBe(false);

    const inputRight = new FakeInput();
    inputRight.setDown('accelerate', true);
    const gameRight = new Game({
      input: inputRight,
      audio: new FunkAudioEngine(library.activeItem.beatMap),
      library,
    });

    const forkStartZ = gameRight.getForkZoneStartZ();
    expect(forkStartZ).toBeDefined();

    const rightEvents: GameEvent['type'][] = [];
    gameRight.bridge.onEvent((e) => rightEvents.push(e.type));

    gameRight.position = gameRight.track.length - 120;
    gameRight.car.x = 0.5;
    gameRight.car.speed = 12000;
    gameRight.forkChoice = 'right';

    for (let i = 0; i < 60 && !rightEvents.includes('runCompleted'); i++) {
      gameRight.update(1 / 120);
    }

    expect(rightEvents).toContain('stageCompleted');
    expect(rightEvents).toContain('runCompleted');

    // Left branch on single-track playlist still loops to Lap 2
    const inputLeft = new FakeInput();
    inputLeft.setDown('accelerate', true);
    const gameLeft = new Game({
      input: inputLeft,
      audio: new FunkAudioEngine(library.activeItem.beatMap),
      library,
    });
    const leftEvents: GameEvent['type'][] = [];
    gameLeft.bridge.onEvent((e) => leftEvents.push(e.type));

    gameLeft.position = gameLeft.track.length - 120;
    gameLeft.car.x = -0.5;
    gameLeft.car.speed = 12000;
    gameLeft.forkChoice = 'left';

    for (let i = 0; i < 60 && !leftEvents.includes('lapCompleted'); i++) {
      gameLeft.update(1 / 120);
    }

    expect(leftEvents).toContain('stageCompleted');
    expect(leftEvents).toContain('lapCompleted');
    expect(leftEvents).not.toContain('runCompleted');
  });

  it('tracks full-song session benchmark report, section breakdown, seekToBar, and resetPerfBenchmark', () => {
    const input = new FakeInput();
    const bridge = new TelemetryBridge<TelemetrySnapshot, GameEvent>(60);
    const game = new Game({ input, bridge });

    const noop = () => {};
    const mockCtx = {
      canvas: { width: 640, height: 360 },
      save: noop,
      restore: noop,
      fillRect: noop,
      strokeRect: noop,
      fillText: noop,
      beginPath: noop,
      closePath: noop,
      moveTo: noop,
      lineTo: noop,
      quadraticCurveTo: noop,
      arc: noop,
      ellipse: noop,
      rect: noop,
      clip: noop,
      fill: noop,
      stroke: noop,
      translate: noop,
      rotate: noop,
      scale: noop,
      setTransform: noop,
      setLineDash: noop,
      createLinearGradient: () => ({ addColorStop: noop }),
      createRadialGradient: () => ({ addColorStop: noop }),
      drawImage: noop,
    } as unknown as CanvasRenderingContext2D;

    game.render(mockCtx, 1, 60);
    game.update(1 / 120);
    game.render(mockCtx, 1, 60);
    game.render(mockCtx, 1, 60);
    game.render(mockCtx, 1, 60);
    game.seekToBar(8);
    expect(game.roadBarIndex).toBe(8);
    game.render(mockCtx, 1, 60);
    game.render(mockCtx, 1, 60);
    game.render(mockCtx, 1, 60);
    game.render(mockCtx, 1, 60);

    const report = game.getBenchmarkReport();
    expect(report.session.frames).toBeGreaterThanOrEqual(2);
    expect(report.session.avgFps).toBeGreaterThan(0);
    expect(report.session.pct60Fps).toBeGreaterThanOrEqual(0);
    expect(report.sections.length).toBeGreaterThan(0);

    const snap = bridge.getSnapshot();
    expect(snap).not.toBeNull();
    expect(snap!.sessionAvgFps).toBeGreaterThan(0);
    expect(snap!.pct60Fps).toBeGreaterThanOrEqual(0);

    game.resetPerfBenchmark();
    const resetReport = game.getBenchmarkReport();
    expect(resetReport.session.frames).toBe(0);
    expect(resetReport.session.droppedFrames).toBe(0);
    expect(resetReport.sections.length).toBe(0);
  });

  it('exercises fork rendering, off-road gravel particles, truck collisions, and stage transition with zero errors', () => {
    const input = new FakeInput();
    input.setDown('accelerate', true);
    const bridge = new TelemetryBridge<TelemetrySnapshot, GameEvent>(60);
    const game = new Game({ input, bridge });
    const events: GameEvent['type'][] = [];
    bridge.onEvent((e) => events.push(e.type));

    const noop = () => {};
    const mockCtx = {
      canvas: { width: 640, height: 360 },
      save: noop,
      restore: noop,
      fillRect: noop,
      strokeRect: noop,
      fillText: noop,
      beginPath: noop,
      closePath: noop,
      moveTo: noop,
      lineTo: noop,
      quadraticCurveTo: noop,
      arc: noop,
      ellipse: noop,
      rect: noop,
      clip: noop,
      fill: noop,
      stroke: noop,
      translate: noop,
      rotate: noop,
      scale: noop,
      setTransform: noop,
      setLineDash: noop,
      createLinearGradient: () => ({ addColorStop: noop }),
      createRadialGradient: () => ({ addColorStop: noop }),
      drawImage: noop,
    } as unknown as CanvasRenderingContext2D;

    // 1. Fork trigger + render
    game.triggerForkTest();
    expect(game.forkActive).toBe(true);
    game.render(mockCtx, 1, 60);

    // 2. Off-road gravel particle emission
    game.triggerOffRoadTest();
    for (let i = 0; i < 12; i++) {
      game.update(1 / 120);
    }
    expect(game.car.isOffRoad).toBe(true);
    expect(game.particles.activeCount).toBeGreaterThan(0);
    game.render(mockCtx, 1, 60);

    // 3. Truck collision & burst
    game.car.x = 0;
    game.car.prevX = 0;
    game.triggerTruckCollisionTest();
    for (let i = 0; i < 4; i++) {
      game.update(1 / 120);
    }
    expect(events).toContain('collision');
    expect(game.particles.activeCount).toBeGreaterThan(0);
    game.render(mockCtx, 1, 60);

    // 4. Stage transition (Next Song)
    game.triggerNextSongTest();
    for (let i = 0; i < 20; i++) {
      game.update(1 / 120);
    }
    expect(events).toContain('stageTransition');
    expect(game.traffic.trucks.length).toBeGreaterThan(0);
    game.render(mockCtx, 1, 60);
  });

  function createSimpleMockCtx(): CanvasRenderingContext2D {
    const noop = () => {};
    return {
      canvas: { width: 640, height: 360 },
      save: noop,
      restore: noop,
      fillRect: noop,
      strokeRect: noop,
      fillText: noop,
      beginPath: noop,
      closePath: noop,
      moveTo: noop,
      lineTo: noop,
      quadraticCurveTo: noop,
      arc: noop,
      ellipse: noop,
      rect: noop,
      clip: noop,
      fill: noop,
      stroke: noop,
      translate: noop,
      rotate: noop,
      scale: noop,
      setTransform: noop,
      setLineDash: noop,
      createLinearGradient: () => ({ addColorStop: noop }),
      createRadialGradient: () => ({ addColorStop: noop }),
      drawImage: noop,
    } as unknown as CanvasRenderingContext2D;
  }

  describe('Fase 6 — Micro-FOV Dinamico', () => {

    it('keeps rendered FOV equal to tuning.fieldOfView at rest (speed = 0, LOW groove)', () => {
      tuning.fieldOfView = 100;
      tuning.dynamicFovSpeedBonus = 4.0;
      tuning.dynamicFovOverdriveBonus = 3.5;
      tuning.dynamicFovBoostKick = 3.0;

      const game = new Game({ input: new FakeInput() });
      const ctx = createSimpleMockCtx();
      for (let i = 0; i < 30; i++) game.update(1 / 60);
      game.render(ctx, 1, 60);

      expect(game.currentFov).toBeCloseTo(100, 4);
      expect(game.currentCameraDepth).toBeCloseTo(cameraDepthFromFov(100), 6);
    });

    it('widens FOV and lowers cameraDepth at high speed + OVERDRIVE within the 122 deg safety cap', () => {
      tuning.fieldOfView = 100;
      tuning.dynamicFovSpeedBonus = 4.0;
      tuning.dynamicFovOverdriveBonus = 3.5;
      tuning.dynamicFovBoostKick = 3.0;

      const input = new FakeInput();
      input.setDown('accelerate', true);
      const game = new Game({ input });
      const ctx = createSimpleMockCtx();

      game.car.speed = tuning.maxSpeed;
      game.car.groove = 95;
      game.car.addGroove(0, false);

      for (let i = 0; i < 120; i++) {
        game.car.speed = tuning.maxSpeed;
        game.car.groove = 95;
        game.update(1 / 60);
      }
      game.render(ctx, 1, 60);

      expect(game.car.grooveTier).toBe('OVERDRIVE');
      expect(game.currentFov).toBeGreaterThan(106.5);
      expect(game.currentFov).toBeLessThanOrEqual(122);
      expect(game.currentCameraDepth).toBeLessThan(cameraDepthFromFov(100));

      // Verify 122 degree safety cap even with extreme bonuses
      tuning.fieldOfView = 118;
      tuning.dynamicFovSpeedBonus = 10;
      for (let i = 0; i < 120; i++) {
        game.car.speed = tuning.maxSpeed;
        game.car.groove = 95;
        game.update(1 / 60);
      }
      game.render(ctx, 1, 60);
      expect(game.currentFov).toBeLessThanOrEqual(122);

      // Restore defaults
      tuning.fieldOfView = 100;
      tuning.dynamicFovSpeedBonus = 4.0;
    });

    it('spikes FOV temporarily on PERFECT beat-shift and smoothly decays back', () => {
      tuning.fieldOfView = 100;
      tuning.dynamicFovSpeedBonus = 0;
      tuning.dynamicFovOverdriveBonus = 0;
      tuning.dynamicFovBoostKick = 3.0;

      const input = new FakeInput();
      const game = new Game({ input });
      game.car.speed = tuning.maxSpeed * tuning.gear1MaxRatio * 0.85;
      game.audio.judgeInputTimestamp = () => ({
        tier: 'PERFECT',
        deltaMs: 0,
        beatIndex: 0,
        isDownbeat: true,
      });

      input.press('shiftUp', 100);
      for (let i = 0; i < 15; i++) game.update(1 / 60);
      const peakFov = game.currentFov;
      expect(peakFov).toBeGreaterThan(100.5);

      for (let i = 0; i < 120; i++) game.update(1 / 60);
      expect(game.currentFov).toBeLessThan(peakFov);
      expect(game.currentFov).toBeCloseTo(100, 1);

      tuning.dynamicFovSpeedBonus = 4.0;
      tuning.dynamicFovOverdriveBonus = 3.5;
    });

    it('locks rendered FOV to tuning.fieldOfView when all 3 dynamic FOV bonuses are 0', () => {
      tuning.fieldOfView = 100;
      tuning.dynamicFovSpeedBonus = 0;
      tuning.dynamicFovOverdriveBonus = 0;
      tuning.dynamicFovBoostKick = 0;

      const game = new Game({ input: new FakeInput() });
      const ctx = createSimpleMockCtx();
      game.car.speed = tuning.maxSpeed;
      game.car.groove = 95;
      game.car.addGroove(0, false);

      for (let i = 0; i < 60; i++) {
        game.car.speed = tuning.maxSpeed;
        game.car.groove = 95;
        game.update(1 / 60);
      }
      game.render(ctx, 1, 60);

      expect(game.currentFov).toBe(100);
      expect(game.currentCameraDepth).toBeCloseTo(cameraDepthFromFov(100), 6);

      tuning.dynamicFovSpeedBonus = 4.0;
      tuning.dynamicFovOverdriveBonus = 3.5;
      tuning.dynamicFovBoostKick = 3.0;
    });
  });

  describe('Frame pacing & lookahead prewarming', () => {
    it('prewarms the next-track blueprint on init and reuses it in the streaming assembler without mid-stage regeneration', () => {
      const library = new TrackLibrary();
      const game = new Game({ input: new FakeInput(), library });
      const gameAcc = game as unknown as {
        position: number;
        nextBlueprintCache: { contentHash: string; blueprint: unknown } | null;
      };

      expect(gameAcc.nextBlueprintCache).not.toBeNull();
      expect(gameAcc.nextBlueprintCache!.contentHash).toBe(
        library.nextTrackItem!.beatMap.contentHash,
      );
      const prewarmedBp = gameAcc.nextBlueprintCache!.blueprint;

      gameAcc.position = game.track.length - 10000;
      game.update(1 / 60);
      expect((game.track as { nextBlueprint?: unknown }).nextBlueprint).toBe(prewarmedBp);
    });

    it('uses rafNow timestamps, skips resume warmup frames, and normalizes 59.94 Hz avgFps to 60', () => {
      const game = new Game({ input: new FakeInput() });
      const ctx = createSimpleMockCtx();
      const step5994Ms = 1000 / (60000 / 1001);

      // Initial timestamp establishment + 5 frames at 59.94 Hz (16.6833 ms)
      let t = 1000;
      game.render(ctx, 1, 60, t);
      for (let i = 0; i < 5; i++) {
        t += step5994Ms;
        game.render(ctx, 1, 60, t);
      }

      const initialReport = game.getBenchmarkReport();
      expect(initialReport.session.frames).toBe(5);
      expect(initialReport.session.avgFps).toBe(60);

      // Pausing and resuming must discard the resume gap + 2 warmup frames
      game.setPaused(true);
      game.setPaused(false);
      game.render(ctx, 1, 60, 5000);
      game.render(ctx, 1, 60, 5050);
      game.render(ctx, 1, 60, 5100);
      game.render(ctx, 1, 60, 5100 + step5994Ms);

      const postResumeReport = game.getBenchmarkReport();
      expect(postResumeReport.session.frames).toBe(6);
      expect(postResumeReport.session.maxFrameMs).toBeLessThan(18);
      expect(postResumeReport.session.avgFps).toBe(60);

      // Genuine sub-60 frame rates remain faithfully reported (reset sets 2 warmup frames)
      game.resetPerfBenchmark();
      game.render(ctx, 1, 48, 6000);
      game.render(ctx, 1, 48, 6020.83);
      game.render(ctx, 1, 48, 6041.66);
      game.render(ctx, 1, 48, 6062.49);

      const dropReport = game.getBenchmarkReport();
      expect(dropReport.session.frames).toBe(1);
      expect(dropReport.session.avgFps).toBeCloseTo(48, 1);
    });
  });
});

describe('Drop Onset & Climax Lightning Sync', () => {
  it('triggers lightning once on a post-pickup drop climax surge and enforces refractory cooldown afterward', () => {
    const prevRain = tuning.bgRain;
    const prevLightning = tuning.bgLightningOnBeat;
    tuning.bgRain = 1;
    tuning.bgLightningOnBeat = 1;
    try {
      const customMap = {
        ...DEFAULT_SYNTH_BEATMAP,
        contentHash: 'sha256:delayed-drop-climax-test',
        bpm: 120,
        firstBeatOffsetSec: 0,
        barEnergy: [0.18, 0.22, 0.24, 0.20, 0.31, 0.74, 0.38, 0.78],
        sections: [
          { startBar: 0, bars: 4, role: 'build' as const },
          { startBar: 4, bars: 4, role: 'drop' as const },
        ],
      };
      const audio = new FunkAudioEngine(customMap);
      const game = new Game({ input: new FakeInput(), audio });
      const bgAcc = (game as unknown as { background: { lightningStrikeCount: number } }).background;

      // Advance across bar 4 (drop entry with low energy 0.31) -> strike 1
      (audio as unknown as { virtualTrackSec: number }).virtualTrackSec = 7.95;
      game.update(0.02);
      (audio as unknown as { virtualTrackSec: number }).virtualTrackSec = 8.05;
      game.update(0.02);
      const strikesAtBar4 = bgAcc.lightningStrikeCount;
      expect(strikesAtBar4).toBeGreaterThanOrEqual(1);

      // Advance across bar 5 (1 bar later: energy surges from 0.31 -> 0.74, Δ+0.43) -> fires climax strike!
      (audio as unknown as { virtualTrackSec: number }).virtualTrackSec = 10.05;
      game.update(0.02);
      expect(bgAcc.lightningStrikeCount).toBe(strikesAtBar4 + 1);

      // Advance across bar 6 (dip to 0.38) and bar 7 (rebound to 0.78, Δ+0.40):
      // Post-pickup exception was consumed at bar 5, so 8-bar refractory cooldown blocks bar 7!
      (audio as unknown as { virtualTrackSec: number }).virtualTrackSec = 12.05;
      game.update(0.02);
      (audio as unknown as { virtualTrackSec: number }).virtualTrackSec = 14.05;
      game.update(0.02);
      expect(bgAcc.lightningStrikeCount).toBe(strikesAtBar4 + 1);
    } finally {
      tuning.bgRain = prevRain;
      tuning.bgLightningOnBeat = prevLightning;
    }
  });

  it('suppresses lightning on flat artificial breakdown->drop transitions and low-contrast percentile peaks', () => {
    const prevRain = tuning.bgRain;
    const prevLightning = tuning.bgLightningOnBeat;
    tuning.bgRain = 1;
    tuning.bgLightningOnBeat = 1;
    try {
      const flatMap = {
        ...DEFAULT_SYNTH_BEATMAP,
        contentHash: 'sha256:flat-track-no-anonymous-lightning',
        bpm: 120,
        firstBeatOffsetSec: 0,
        // Flat groove (0.74..0.92 with tiny bar-to-bar deltas) + one genuine +0.34 surge at bar 14
        barEnergy: [
          0.75, 0.76, 0.75, 0.74, // breakdown (bars 0..3)
          0.73, 0.76, 0.77, 0.78, // artificial breakdown->drop at bar 4 (dE = -0.01)
          0.79, 0.80, 0.82, 0.85, // steady ramp
          0.91, 0.52, 0.86, 0.82, // bar 12: flat peak 0.85->0.91 (dE=0.06, suppressed); bar 14: real +0.34 surge!
        ],
        sections: [
          { startBar: 0, bars: 4, role: 'breakdown' as const },
          { startBar: 4, bars: 12, role: 'drop' as const },
        ],
      };
      const audio = new FunkAudioEngine(flatMap);
      const game = new Game({ input: new FakeInput(), audio });
      const bgAcc = (game as unknown as { background: { lightningStrikeCount: number } }).background;

      // Step through bars 1..13 (includes flat breakdown->drop at bar 4 and flat 0.85->0.91 peak at bar 12)
      for (let bar = 1; bar <= 13; bar++) {
        (audio as unknown as { virtualTrackSec: number }).virtualTrackSec = bar * 2.0 + 0.05;
        game.update(0.02);
      }
      expect(bgAcc.lightningStrikeCount).toBe(0);

      // Bar 14 has a genuine +0.34 spectral surge (0.52 -> 0.86) -> fires once
      (audio as unknown as { virtualTrackSec: number }).virtualTrackSec = 14 * 2.0 + 0.05;
      game.update(0.02);
      expect(bgAcc.lightningStrikeCount).toBe(1);
    } finally {
      tuning.bgRain = prevRain;
      tuning.bgLightningOnBeat = prevLightning;
    }
  });

  it('keeps elastic sync smooth (>= 0.76 scale, no slingshot jumps) on rolling-start 1-bar pickup tracks', () => {
    const pickupMap = {
      ...DEFAULT_SYNTH_BEATMAP,
      contentHash: 'sha256:rolling-start-1bar-pickup-sync',
      bpm: 134,
      firstBeatOffsetSec: 0,
      barEnergy: [0.2, ...new Array<number>(19).fill(0.8)],
      sections: [
        { startBar: 0, bars: 1, role: 'intro' as const },
        { startBar: 1, bars: 11, role: 'drop' as const },
        { startBar: 12, bars: 4, role: 'breakdown' as const },
        { startBar: 16, bars: 4, role: 'drop' as const },
      ],
    };
    const input = new FakeInput();
    input.setDown('accelerate', true);
    const audio = new FunkAudioEngine(pickupMap);
    const game = new Game({ input, audio });

    // Simulate rolling start at Overdrive top speed
    game.hasStartedDriving = true;
    game.car.speed = tuning.maxSpeed * 1.02;
    game.car.gearbox.gear = 6;
    game.car.gearbox.update(game.car.speed, tuning.maxSpeed);
    game.syncController.resetForTrack(true, true, 2.0);

    const dt = 1 / 120;
    let prevScale = 1.0;
    let maxStepJump = 0;
    let minScale = Infinity;
    for (let step = 0; step < 120 * 28; step++) {
      game.car.x = 0;
      game.car.prevX = 0;
      const prevPos = game.position;
      game.update(dt);
      const effSpeed = (game.position - prevPos) / dt;
      if (game.car.speed > 1000 && effSpeed > 0) {
        const scale = effSpeed / game.car.speed;
        minScale = Math.min(minScale, scale);
        maxStepJump = Math.max(maxStepJump, Math.abs(scale - prevScale));
        prevScale = scale;
      }
    }
    expect(minScale).toBeGreaterThanOrEqual(0.75);
    expect(maxStepJump).toBeLessThan(0.05);
  });

  it('prevents double lightning strikes on simultaneous dropSync + bar downbeat and ignores rain-off dropSyncs', () => {
    const prevRain = tuning.bgRain;
    const prevLightning = tuning.bgLightningOnBeat;
    try {
      tuning.bgRain = 1;
      tuning.bgLightningOnBeat = 1;
      const syncMap = {
        ...DEFAULT_SYNTH_BEATMAP,
        contentHash: 'sha256:drop-sync-no-double-lightning',
        bpm: 120,
        firstBeatOffsetSec: 0,
        barEnergy: [0.22, 0.24, 0.25, 0.26, 0.85, 0.82, 0.80, 0.78],
        sections: [
          { startBar: 0, bars: 4, role: 'build' as const },
          { startBar: 4, bars: 4, role: 'drop' as const },
        ],
      };
      const audio = new FunkAudioEngine(syncMap);
      const game = new Game({ input: new FakeInput(), audio });
      const bgAcc = (game as unknown as { background: { lightningStrikeCount: number } }).background;
      const gamePriv = game as unknown as {
        barsSinceLastLightning: number;
        handleDropSync: (barIndex: number, deltaBeats: number) => void;
      };

      // Approach bar 4 downbeat and fire dropSync on the same frame as justCrossedBar
      (audio as unknown as { virtualTrackSec: number }).virtualTrackSec = 7.95;
      game.update(0.02);
      const beforeStrikes = bgAcc.lightningStrikeCount;

      gamePriv.handleDropSync(4, 0.1);
      (audio as unknown as { virtualTrackSec: number }).virtualTrackSec = 8.05;
      game.update(0.02);
      expect(bgAcc.lightningStrikeCount).toBe(beforeStrikes + 1);

      // With bgRain off, handleDropSync must neither strike nor reset cooldown
      tuning.bgRain = 0;
      gamePriv.barsSinceLastLightning = 7;
      gamePriv.handleDropSync(4, 0);
      expect(bgAcc.lightningStrikeCount).toBe(beforeStrikes + 1);
      expect(gamePriv.barsSinceLastLightning).toBe(7);
    } finally {
      tuning.bgRain = prevRain;
      tuning.bgLightningOnBeat = prevLightning;
    }
  });
});

describe('M5 — Live Stage Re-dressing Integrity (setStagePaletteIndex)', () => {
  it('preserves track.length, car position, and transitions cleanly to akiba_night viaducts even after tuning.maxSpeed changes', () => {
    const prevMaxSpeed = tuning.maxSpeed;
    try {
      const game = new Game({ input: new FakeInput(), audio: new FunkAudioEngine(DEFAULT_SYNTH_BEATMAP) });
      const initialLength = game.track.length;
      const targetPos = initialLength * 0.45;
      game.position = targetPos;
      (game as unknown as { prevPosition: number }).prevPosition = targetPos;

      // Simulate user altering maxSpeed tuning live via DebugPanel before switching stage
      tuning.maxSpeed = prevMaxSpeed * 1.4;
      game.setStagePaletteIndex(2); // AKIBA NIGHT RUSH -> viaducts

      expect(game.palette.id).toBe('akiba_night');
      expect(game.track.length).toBe(initialLength);
      expect(game.position).toBeCloseTo(targetPos, 5);
      expect(game.position).toBeLessThan(game.track.length);
      expect(game.bridge.getSnapshot()?.lap).toBe(1);

      const bp = (game.track as { blueprint?: { barEnv: readonly string[] } }).blueprint;
      const envs = new Set(bp ? bp.barEnv : game.track.segments.map((s) => s.env));
      expect(envs.has('viaduct')).toBe(true);
      expect(envs.has('bridge')).toBe(false);

      // No kei truck may spawn on top of or immediately beside the player after a mid-run theme switch
      const minSafeZ = targetPos + 90 * game.track.segmentLength;
      for (const truck of game.traffic.trucks) {
        expect(truck.z).toBeGreaterThanOrEqual(minSafeZ);
      }
    } finally {
      tuning.maxSpeed = prevMaxSpeed;
    }
  });
});

describe('Configuration Lock & Pause Input Isolation', () => {
  it('stays paused when driving inputs arrive while paused and emits updates when toggling Tofu / soda skin', () => {
    const input = new FakeInput();
    const game = new Game({ input, audio: new FunkAudioEngine(DEFAULT_SYNTH_BEATMAP) });
    game.setPaused(true);
    expect(game.paused).toBe(true);

    input.setDown('accelerate', true);
    input.setDown('brake', true);
    input.setDown('drift', true);
    input.press('accelerate', 100);
    input.press('brake', 110);
    input.press('drift', 120);
    input.press('shiftUp', 130);

    game.update(1 / 60);
    expect(game.paused).toBe(true);

    const initialTofu = game.melonSoda.active;
    const initialSkin = game.melonSoda.skin;
    game.toggleTofuMode();
    game.cycleSodaSkin();

    expect(game.melonSoda.active).toBe(!initialTofu);
    expect(game.melonSoda.skin).not.toBe(initialSkin);
    expect(game.paused).toBe(true);
  });
});
