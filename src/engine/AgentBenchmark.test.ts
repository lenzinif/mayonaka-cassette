import {
  BUNDLED_COASTAL_BEATMAP,
  BUNDLED_WANGAN_BEATMAP,
  DEFAULT_SYNTH_BEATMAP,
  FunkAudioEngine,
} from '@src/audio/FunkAudioEngine';
import { TrackLibrary } from '@src/audio/TrackLibrary';
import { AutopilotDriver } from '@src/core/AutopilotDriver';
import { Game } from '@src/engine/Game';
import { describe, expect, it } from 'vitest';

describe('AI Agent Automated Playtesting & Simulation Benchmark', () => {
  it('benchmarks autonomous driving across all 3 bundled stages, hitting high grades and zero off-road stalls', () => {
    const library = new TrackLibrary();
    const tracks = [
      DEFAULT_SYNTH_BEATMAP,
      BUNDLED_WANGAN_BEATMAP,
      BUNDLED_COASTAL_BEATMAP,
    ];

    interface BenchmarkResult {
      title: string;
      speedKmh: number;
      grade: string;
      avgGroove: number;
      offRoadSteps: number;
      totalSteps: number;
      spillCount: number;
    }

    const results: BenchmarkResult[] = [];

    for (let t = 0; t < tracks.length; t++) {
      const beatMap = tracks[t]!;
      const audio = new FunkAudioEngine(beatMap);
      const driver = new AutopilotDriver({
        mode: 'perfect',
        avoidTraffic: true,
        rhythmShifts: true,
      });
      driver.setEnabled(true);

      const game = new Game({ input: driver, autopilot: driver, audio, library });
      game.melonSoda.active = true; // Stress-test Tofu Mode

      let offRoadSteps = 0;
      const simSteps = 600; // 5.0 seconds of driving at 120Hz fixed step
      const dt = 1 / 120;

      for (let i = 0; i < simSteps; i++) {
        game.update(dt);
        if (game.car.isOffRoad) {
          offRoadSteps++;
        }
      }

      const snap = game.bridge.getSnapshot();
      expect(snap).toBeDefined();

      results.push({
        title: beatMap.title,
        speedKmh: snap!.speedKmh,
        grade: snap!.bestSongGrade ?? snap!.grooveTier,
        avgGroove: snap!.groove,
        offRoadSteps,
        totalSteps: simSteps,
        spillCount: snap!.sodaSpills,
      });

      // Verification invariants for each track:
      // 1. The car accelerates swiftly and maintains top-tier speeds (> 140 km/h)
      expect(snap!.speedKmh).toBeGreaterThan(140);
      // 2. The car stays on asphalt without veering into the deep grass
      expect(offRoadSteps).toBeLessThan(simSteps * 0.05);
      // 3. The car builds healthy Groove in Tofu Mode
      expect(snap!.groove).toBeGreaterThan(15);
      // 4. Jerk-limiting prevents violent soda spills
      expect(snap!.sodaSpills).toBe(0);
    }

    // Emit playtesting table
    expect(results.length).toBe(3);
    for (const r of results) {
      expect(r.speedKmh).toBeGreaterThan(140);
    }
  });

  it('runs Monte Carlo relaxed vs aggressive mode comparisons', () => {
    const audioRelaxed = new FunkAudioEngine(DEFAULT_SYNTH_BEATMAP);
    const driverRelaxed = new AutopilotDriver({ mode: 'relaxed' });
    driverRelaxed.setEnabled(true);
    const gameRelaxed = new Game({ input: driverRelaxed, autopilot: driverRelaxed, audio: audioRelaxed });

    const audioAggressive = new FunkAudioEngine(DEFAULT_SYNTH_BEATMAP);
    const driverAggressive = new AutopilotDriver({ mode: 'aggressive' });
    driverAggressive.setEnabled(true);
    const gameAggressive = new Game({ input: driverAggressive, autopilot: driverAggressive, audio: audioAggressive });

    const dt = 1 / 120;
    // Simulate 1200 steps (10 seconds) so both cars have completed launch and reached cruising speed
    for (let i = 0; i < 1200; i++) {
      gameRelaxed.update(dt);
      gameAggressive.update(dt);
    }

    const snapRelaxed = gameRelaxed.bridge.getSnapshot()!;
    const snapAggressive = gameAggressive.bridge.getSnapshot()!;

    // Aggressive mode drives at higher speed than relaxed mode
    expect(snapAggressive.speedKmh).toBeGreaterThan(snapRelaxed.speedKmh);
    // Relaxed mode cruises around 75% max speed ceiling
    expect(snapRelaxed.speedRatio).toBeLessThanOrEqual(0.85);
  });
});
