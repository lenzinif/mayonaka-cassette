import { describe, expect, it } from 'vitest';
import { BeatClock } from './BeatClock';
import {
  clearSynthLoopCache,
  DEFAULT_SYNTH_BEATMAP,
  FunkAudioEngine,
  getOrBuildSynthFallbackBuffer,
  getOrSynthesizeFutureFunkLoopPcm,
} from './FunkAudioEngine';

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

  it('handles pause, resume, and loadTrack while paused without desync or dropping audio', async () => {
    const engine = new FunkAudioEngine();
    expect(engine.paused).toBe(false);

    // 1. Pause
    await engine.pause();
    expect(engine.paused).toBe(true);

    // 2. Load a new track while paused
    const newMap = {
      ...DEFAULT_SYNTH_BEATMAP,
      title: 'Paused New Song',
      contentHash: 'hash-paused-test',
    };
    engine.loadTrack(newMap, null);
    expect(engine.beatMap.title).toBe('Paused New Song');

    // 3. Advancing update while paused should not advance track time
    const pausedState = engine.update(1 / 60, { speedRatio: 0, isDrifting: false, isOffRoad: false });
    expect(pausedState.trackTimeSec).toBe(0);

    // 4. Resume
    await engine.resume();
    expect(engine.paused).toBe(false);

    // 5. Subsequent update advances cleanly from 0 without lag jumps
    const activeState = engine.update(1 / 60, { speedRatio: 0, isDrifting: false, isOffRoad: false });
    expect(activeState.trackTimeSec).toBeGreaterThan(0);
    expect(activeState.trackTimeSec).toBeLessThan(0.05);

    engine.dispose();
  });

  it('caches synthesized fallback PCM and AudioBuffers for zero-lag subsequent access', () => {
    clearSynthLoopCache();

    // 1. First call calculates and caches PCM
    const t0 = performance.now();
    const pcm1 = getOrSynthesizeFutureFunkLoopPcm(122, 48000, 8);
    const dur1 = performance.now() - t0;

    // 2. Second call returns the exact same cached reference in < 1ms
    const t1 = performance.now();
    const pcm2 = getOrSynthesizeFutureFunkLoopPcm(122, 48000, 8);
    const dur2 = performance.now() - t1;

    expect(pcm1).toBe(pcm2);
    expect(pcm1.left.length).toBeGreaterThan(1000);
    expect(dur2).toBeLessThan(10);
    expect(dur1).toBeGreaterThanOrEqual(dur2);

    // Mock AudioContext to test getOrBuildSynthFallbackBuffer caching
    const mockCtx = {
      sampleRate: 48000,
      createBuffer: (channels: number, length: number, sampleRate: number) => ({
        numberOfChannels: channels,
        length,
        sampleRate,
        duration: length / sampleRate,
        getChannelData: () => new Float32Array(length),
      }),
    } as unknown as AudioContext;

    const buf1 = getOrBuildSynthFallbackBuffer(mockCtx, 122, 8);
    const buf2 = getOrBuildSynthFallbackBuffer(mockCtx, 122, 8);
    expect(buf1).toBe(buf2);
  });

  it('loops the same procedural synth track seamlessly without creating redundant nodes or lag', () => {
    const engine = new FunkAudioEngine(DEFAULT_SYNTH_BEATMAP);
    // Simulate active playing state
    (engine as unknown as { isPlaying: boolean; sourceNode: unknown; virtualTrackSec: number }).isPlaying = true;
    (engine as unknown as { sourceNode: unknown }).sourceNode = {};
    (engine as unknown as { virtualTrackSec: number }).virtualTrackSec = 60;

    // Looping the exact same synth track should execute seamlessly: duration 0, virtualTrackSec reset to 0
    const fadeDur = engine.crossfadeToTrack(DEFAULT_SYNTH_BEATMAP, null, 2, true);
    expect(fadeDur).toBe(0);
    expect((engine as unknown as { virtualTrackSec: number }).virtualTrackSec).toBe(0);
    expect(engine.isCrossfading).toBe(false);

    engine.dispose();
  });
});
