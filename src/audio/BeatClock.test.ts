import { describe, expect, it } from 'vitest';
import { BeatClock } from './BeatClock';
import { DEFAULT_SYNTH_BEATMAP, FunkAudioEngine } from './FunkAudioEngine';

describe('BeatClock & FunkAudioEngine', () => {
  it('computes beat, bar, phase, and crossing edges deterministically', () => {
    const clock = new BeatClock({
      ...DEFAULT_SYNTH_BEATMAP,
      bpm: 120, // 0.5s per beat, 2.0s per bar
      firstBeatOffsetSec: 0.1,
    });

    const s0 = clock.sample(0.1);
    expect(s0.beatIndex).toBe(0);
    expect(s0.barIndex).toBe(0);
    expect(s0.beatInBar).toBe(0);
    expect(s0.beatPulse).toBeCloseTo(1, 3);
    expect(s0.justCrossedBeat).toBe(false);

    const s1 = clock.sample(0.62); // just past beat 1
    expect(s1.beatIndex).toBe(1);
    expect(s1.beatInBar).toBe(1);
    expect(s1.justCrossedBeat).toBe(true);
    expect(s1.justCrossedBar).toBe(false);

    const s4 = clock.sample(2.12); // just past bar 1 downbeat (beat 4)
    expect(s4.beatIndex).toBe(4);
    expect(s4.barIndex).toBe(1);
    expect(s4.beatInBar).toBe(0);
    expect(s4.justCrossedBeat).toBe(true);
    expect(s4.justCrossedBar).toBe(true);
  });

  it('judges beat-quantized input timestamps within PERFECT and GOOD windows', () => {
    const clock = new BeatClock({
      ...DEFAULT_SYNTH_BEATMAP,
      bpm: 120, // beats at 0.0, 0.5, 1.0, 1.5, 2.0
      firstBeatOffsetSec: 0,
    });

    const perfectDownbeat = clock.judgeTrackTime(2.03); // +30ms from beat 4 (downbeat)
    expect(perfectDownbeat.tier).toBe('PERFECT');
    expect(perfectDownbeat.isDownbeat).toBe(true);
    expect(perfectDownbeat.deltaMs).toBeCloseTo(30, 0);

    const goodBeat = clock.judgeTrackTime(0.42); // -80ms from beat 1
    expect(goodBeat.tier).toBe('GOOD');
    expect(goodBeat.isDownbeat).toBe(false);

    const offBeat = clock.judgeTrackTime(0.25); // 250ms off
    expect(offBeat.tier).toBe('OFF');
  });

  it('sweeps low-pass filter cutoff with speed & drift and dips pitch off-road', () => {
    const engine = new FunkAudioEngine();

    // Slow speed on road
    for (let i = 0; i < 60; i++) {
      engine.update(1 / 60, { speedRatio: 0.05, isDrifting: false, isOffRoad: false });
    }
    const slowCutoff = engine.cutoffHz;

    // High speed + drifting
    for (let i = 0; i < 60; i++) {
      engine.update(1 / 60, { speedRatio: 0.95, isDrifting: true, isOffRoad: false });
    }
    const fastDriftCutoff = engine.cutoffHz;
    expect(fastDriftCutoff).toBeGreaterThan(slowCutoff * 4);

    // Off-road drag dips playbackRate below 1.0 smoothly without brutal detune
    for (let i = 0; i < 30; i++) {
      engine.update(1 / 60, { speedRatio: 0.5, isDrifting: false, isOffRoad: true });
    }
    expect(engine.playbackRate).toBeLessThan(0.99);
    expect(engine.playbackRate).toBeGreaterThan(0.96);
  });
});
