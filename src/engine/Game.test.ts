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
import type { Action, InputPressEvent, InputSource } from '@src/core/InputManager';
import { TelemetryBridge } from '@src/core/TelemetryBridge';
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

    // Pressing 'forkRight' (key [2]) locks right branch and moves car into right lane
    input.press('forkRight');
    game.update(1 / 60);
    expect(game.car.x).toBeGreaterThan(0);

    // Since roadBarIndex is in the final 2 bars while audio barIndex is still 0, early 4-bar DJ crossfade starts!
    expect(audio.isCrossfading).toBe(true);
    expect(audio.beatMap.contentHash).toBe(BUNDLED_WANGAN_BEATMAP.contentHash);

    // Cross the finish line on the Right branch -> advances to Stage 2 (Midnight Wangan)
    game.position = game.track.length - 10;
    game.car.speed = 6000;
    game.update(1 / 60);

    expect(library.currentIndex).toBe(1);
    expect(events.some((e) => e.type === 'stageCompleted')).toBe(true);
    expect(
      events.some((e) => e.type === 'stageTransition' && e.stageNumber === 2),
    ).toBe(true);

    // Advance through Stage 2 -> Stage 3
    game.position = game.track.length - 10;
    game.car.x = 0.5; // Right lane
    game.car.speed = 6000;
    game.update(1 / 60);

    expect(library.currentIndex).toBe(2);
    expect(
      events.some((e) => e.type === 'stageTransition' && e.stageNumber === 3),
    ).toBe(true);

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

  it('holds the 8-bar DJ outro loop when the song reaches the end before the player reaches the fork (docs/DESIGN.md §3)', () => {
    const engine = new FunkAudioEngine(DEFAULT_SYNTH_BEATMAP);
    const dur = DEFAULT_SYNTH_BEATMAP.durationSec;

    // Advance virtualTrackSec past durationSec while holdOutroLoop is true
    engine.update(dur + 1, {
      speedRatio: 0.4,
      isDrifting: false,
      isOffRoad: false,
      holdOutroLoop: true,
    });

    expect(engine.isOutroLooping).toBe(true);

    // Releasing holdOutroLoop clears the outro loop flag
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

    // Place car near the end of the Y-fork (where branch asphalt is [0.52, 1.68] and props are shifted outward)
    game.position = game.track.length - 800;
    // 1. Driving at x = 1.25 (center of the widened right branch) must be ON-ROAD and hit zero props!
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

    // 3. Crossing the finish line from the outer right branch (x = 1.35) recenters the car onto the new road
    //    without triggering a phantom wrap-around collision against segment 0 props.
    game.position = game.track.length - 20;
    game.car.x = 1.35;
    game.car.prevX = 1.35;
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
    expect(snap.drawnSegments).toBeGreaterThan(0);
    expect(snap.fixedStepsLastFrame).toBeGreaterThanOrEqual(1);
    expect(snap.drawnProps).toBeGreaterThanOrEqual(0);
    expect(snap.drawnTrucks).toBeGreaterThanOrEqual(0);
  });
});
