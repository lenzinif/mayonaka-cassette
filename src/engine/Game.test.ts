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
import { beforeEach, describe, expect, it } from 'vitest';
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

  it('holds Dub Tape Delay wash and applies Tape Drag without rewinding 8 bars (docs/OUTRO_EXTENSION_PROPOSALS.md)', () => {
    const engine = new FunkAudioEngine(DEFAULT_SYNTH_BEATMAP);
    const dur = DEFAULT_SYNTH_BEATMAP.durationSec;

    // Stage 1: Tape Drag when roadBeatsRemaining > audioBeatsRemaining
    (engine as unknown as { virtualTrackSec: number }).virtualTrackSec = dur - 4; // ~8 beats remaining
    for (let i = 0; i < 30; i++) {
      engine.update(1 / 60, {
        speedRatio: 0.8,
        isDrifting: false,
        isOffRoad: false,
        holdOutroLoop: true,
        roadBeatsRemaining: 16, // player needs 16 beats to reach fork
      });
    }
    // Playback rate dips smoothly towards outroTapeDragMinRate (0.85)
    expect(engine.playbackRate).toBeLessThan(0.98);
    expect(engine.playbackRate).toBeGreaterThanOrEqual(0.85);

    // Stage 2: Advance virtualTrackSec past durationSec while holdOutroLoop is true
    const clockState = engine.update(dur + 1, {
      speedRatio: 0.4,
      isDrifting: false,
      isOffRoad: false,
      holdOutroLoop: true,
    });

    expect(engine.isOutroLooping).toBe(true);
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

    // 2. Driving at x = 0.0 (inside the central V-chevron median island) must be OFF-ROAD!
    game.car.x = 0.0;
    game.car.prevX = 0.0;
    game.update(1 / 120);
    expect(game.car.isOffRoad).toBe(true);
    expect(game.car.offRoadDepth).toBeGreaterThan(0.5);

    // 3. In Phase 3 (t > 0.65), as the player drives forward, the chosen branch converges
    //    smoothly back towards center (0.0). Car is smoothly guided inward.
    game.position = forkStartZ + span * 0.70;
    game.car.x = 1.05;
    game.car.prevX = 1.05;
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
    expect(advancedDist / baseDist).toBeGreaterThanOrEqual(1 - 0.16 - 0.01);
    expect(advancedDist / baseDist).toBeLessThanOrEqual(1 + 0.25 + 0.01);
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

    // 3. Resume via unpause press or setPaused(false)
    input.press('accelerate');
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
    expect(fillTextCalls.some((c) => c[0] === 'PAUSED')).toBe(true);
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
      // Hold steady highway cruise speed (5th gear matches 9500 cruise) & Right lane entry
      game.car.speed = cruiseSpeed;
      if (game.car.gear < 5) game.car.gearbox.gear = 5;
      if (library.currentIndex === 0 && game.forkProgress < 0.65) {
        game.car.x = 0.95;
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

        // Approaching the horizon boundary pre-generates Stage 2's lookahead road
        if (game.position >= game.track.length - 25000) {
          expect(gameAcc.activeNextTrackLookahead).toBeDefined();
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

  describe('Fase 6 — Micro-FOV Dinamico', () => {
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
});
