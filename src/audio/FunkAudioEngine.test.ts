import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetTuning, tuning } from '@src/config/tuning';
import {
  BUNDLED_WANGAN_BEATMAP,
  clearSynthLoopCache,
  DEFAULT_SYNTH_BEATMAP,
  FunkAudioEngine,
  getOrBuildSynthFallbackBuffer,
  getSynthLoopCacheStats,
  MAX_SYNTH_CACHE_ENTRIES,
} from './FunkAudioEngine';

interface MockAudioParam {
  value: number;
  calls: Array<{ method: string; args: unknown[] }>;
  setValueAtTime: (val: number, time: number) => void;
  linearRampToValueAtTime: (val: number, time: number) => void;
  exponentialRampToValueAtTime: (val: number, time: number) => void;
  cancelScheduledValues: (time: number) => void;
}

function createMockParam(initial = 0): MockAudioParam {
  const calls: Array<{ method: string; args: unknown[] }> = [];
  return {
    value: initial,
    calls,
    setValueAtTime(val: number, time: number) {
      this.value = val;
      calls.push({ method: 'setValueAtTime', args: [val, time] });
    },
    linearRampToValueAtTime(val: number, time: number) {
      this.value = val;
      calls.push({ method: 'linearRampToValueAtTime', args: [val, time] });
    },
    exponentialRampToValueAtTime(val: number, time: number) {
      this.value = val;
      calls.push({ method: 'exponentialRampToValueAtTime', args: [val, time] });
    },
    cancelScheduledValues(time: number) {
      calls.push({ method: 'cancelScheduledValues', args: [time] });
    },
  };
}

class MockAudioContext {
  state: AudioContextState = 'running';
  currentTime = 1.0;
  sampleRate = 44100;
  baseLatency = 0.01;
  outputLatency = 0.01;

  readonly gains: Array<{ gain: MockAudioParam; connect: ReturnType<typeof vi.fn>; disconnect: ReturnType<typeof vi.fn> }> = [];
  readonly filters: Array<{
    type: BiquadFilterType;
    frequency: MockAudioParam;
    Q: MockAudioParam;
    connect: ReturnType<typeof vi.fn>;
    disconnect: ReturnType<typeof vi.fn>;
  }> = [];
  readonly sources: Array<{
    buffer: AudioBuffer | null;
    loop: boolean;
    loopStart: number;
    loopEnd: number;
    playbackRate: MockAudioParam;
    onended: (() => void) | null;
    connect: ReturnType<typeof vi.fn>;
    disconnect: ReturnType<typeof vi.fn>;
    start: ReturnType<typeof vi.fn>;
    stop: ReturnType<typeof vi.fn>;
  }> = [];
  readonly oscillators: Array<{
    type: OscillatorType;
    frequency: MockAudioParam;
    onended: (() => void) | null;
    connect: ReturnType<typeof vi.fn>;
    disconnect: ReturnType<typeof vi.fn>;
    start: ReturnType<typeof vi.fn>;
    stop: ReturnType<typeof vi.fn>;
  }> = [];

  readonly destination = {};

  getOutputTimestamp() {
    return { contextTime: this.currentTime - 0.01, performanceTime: 0 };
  }

  async resume() {
    this.state = 'running';
  }

  async suspend() {
    this.state = 'suspended';
  }

  async close() {
    this.state = 'closed';
  }

  createGain() {
    const node = {
      gain: createMockParam(1),
      connect: vi.fn(),
      disconnect: vi.fn(),
    };
    this.gains.push(node);
    return node as unknown as GainNode;
  }

  createBiquadFilter() {
    const node = {
      type: 'lowpass' as BiquadFilterType,
      frequency: createMockParam(1000),
      Q: createMockParam(1),
      connect: vi.fn(),
      disconnect: vi.fn(),
    };
    this.filters.push(node);
    return node as unknown as BiquadFilterNode;
  }

  createDelay() {
    return {
      delayTime: createMockParam(0.25),
      connect: vi.fn(),
      disconnect: vi.fn(),
    } as unknown as DelayNode;
  }

  createBuffer(channels: number, length: number, sampleRate: number): AudioBuffer {
    const chData = Array.from({ length: channels }, () => new Float32Array(length));
    return {
      duration: length / sampleRate,
      length,
      numberOfChannels: channels,
      sampleRate,
      getChannelData: (idx: number) => chData[idx]!,
      copyFromChannel: vi.fn(),
      copyToChannel: vi.fn(),
    } as unknown as AudioBuffer;
  }

  createBufferSource() {
    const node = {
      buffer: null as AudioBuffer | null,
      loop: false,
      loopStart: 0,
      loopEnd: 0,
      playbackRate: createMockParam(1),
      onended: null as (() => void) | null,
      connect: vi.fn(),
      disconnect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
    };
    this.sources.push(node);
    return node as unknown as AudioBufferSourceNode;
  }

  createOscillator() {
    const node = {
      type: 'triangle' as OscillatorType,
      frequency: createMockParam(440),
      onended: null as (() => void) | null,
      connect: vi.fn(),
      disconnect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
    };
    this.oscillators.push(node);
    return node as unknown as OscillatorNode;
  }
}

describe('FunkAudioEngine — Memory LRU, Wow & Flutter, and Fork FX', () => {
  const g = globalThis as unknown as { window?: Record<string, unknown> };
  let prevWindow: Record<string, unknown> | undefined;
  let lastCreatedCtx: MockAudioContext | null = null;
  let ctxCreationCount = 0;

  beforeEach(() => {
    resetTuning();
    clearSynthLoopCache();
    lastCreatedCtx = null;
    ctxCreationCount = 0;
    prevWindow = g.window;

    const recordCreatedContext = (ctx: MockAudioContext) => {
      lastCreatedCtx = ctx;
    };

    class TrackedMockAudioContext extends MockAudioContext {
      constructor() {
        super();
        ctxCreationCount++;
        recordCreatedContext(this);
      }
    }

    g.window = {
      ...(prevWindow ?? {}),
      AudioContext: TrackedMockAudioContext,
    };
  });

  afterEach(() => {
    resetTuning();
    clearSynthLoopCache();
    g.window = prevWindow;
  });

  it('complies with Web Audio autoplay policy (no AudioContext created before unlock)', async () => {
    const engine = new FunkAudioEngine();
    expect(ctxCreationCount).toBe(0);
    expect(engine.unlocked).toBe(false);

    await engine.unlock();
    expect(ctxCreationCount).toBe(1);
    expect(engine.unlocked).toBe(true);
    engine.dispose();
  });

  it('bounds procedural synth fallback PCM and AudioBuffer caches with LRU eviction', () => {
    const mockCtx = new MockAudioContext();
    mockCtx.sampleRate = 8000;
    const ctx = mockCtx as unknown as AudioContext;
    for (let i = 0; i < MAX_SYNTH_CACHE_ENTRIES + 4; i++) {
      getOrBuildSynthFallbackBuffer(ctx, 110 + i * 2, 1);
    }
    const stats = getSynthLoopCacheStats();
    expect(stats.pcmEntries).toBe(MAX_SYNTH_CACHE_ENTRIES);
    expect(stats.audioBufferEntries).toBe(MAX_SYNTH_CACHE_ENTRIES);
  });

  it('responds immediately on collision with zero-lag pitch sag, crinkle noise, and bounded Wow & Flutter', async () => {
    const engine = new FunkAudioEngine(DEFAULT_SYNTH_BEATMAP);
    await engine.unlock();
    const ctx = lastCreatedCtx!;

    // Run clean asphalt baseline
    for (let i = 0; i < 10; i++) {
      ctx.currentTime += 1 / 60;
      engine.update(1 / 60, { speedRatio: 0.9, isDrifting: false, isOffRoad: false });
    }
    expect(engine.playbackRate).toBeCloseTo(1.0, 3);

    const oscBeforeHit = ctx.oscillators.length;
    engine.triggerPitchDip(0.12, 0.4);

    // Zero-lag reaction: playbackRate drops immediately without waiting 200ms
    expect(engine.playbackRate).toBeLessThan(0.92);
    // Mechanical pinch-roller chatter burst spawned with click-free gain ramp (starts at 0.0001)
    expect(ctx.oscillators.length).toBe(oscBeforeHit + 1);
    const crinkleGain = ctx.gains[ctx.gains.length - 1]!;
    expect(crinkleGain.gain.calls[0]?.method).toBe('setValueAtTime');
    expect(crinkleGain.gain.calls[0]?.args[0]).toBeCloseTo(0.0001, 4);

    // Sustained off-road induces organic Wow & Flutter within safe [0.65, 1.12] bounds
    const rates: number[] = [];
    for (let i = 0; i < 45; i++) {
      ctx.currentTime += 1 / 60;
      engine.update(1 / 60, {
        speedRatio: 0.55,
        isDrifting: false,
        isOffRoad: true,
        offRoadDepth: 1.0,
      });
      rates.push(engine.playbackRate);
      expect(engine.playbackRate).toBeGreaterThanOrEqual(0.65);
      expect(engine.playbackRate).toBeLessThanOrEqual(1.12);
    }
    // Verify genuine oscillation (not a flat constant rate)
    const minRate = Math.min(...rates.slice(10));
    const maxRate = Math.max(...rates.slice(10));
    expect(maxRate - minRate).toBeGreaterThan(0.008);

    // Returning to clean asphalt recovers smoothly to 1.0
    for (let i = 0; i < 120; i++) {
      ctx.currentTime += 1 / 60;
      engine.update(1 / 60, { speedRatio: 0.95, isDrifting: false, isOffRoad: false });
    }
    expect(engine.playbackRate).toBeCloseTo(1.0, 2);

    engine.dispose();
  });

  it('triggers click-free scratch and rewind procedural FX at stage forks and respects audioForkTransitionFx=0', async () => {
    const engine = new FunkAudioEngine(DEFAULT_SYNTH_BEATMAP);
    await engine.unlock();
    const ctx = lastCreatedCtx!;

    const userBuf = ctx.createBuffer(2, 44100 * 4, 44100) as unknown as AudioBuffer;
    engine.loadTrack(DEFAULT_SYNTH_BEATMAP, userBuf);
    const activeSrcBeforeFork = ctx.sources[ctx.sources.length - 1]!;

    // 1. Stage fork -> next track uses 'scratch' (spin-down on outgoing + scratch burst)
    const oscBeforeScratch = ctx.oscillators.length;
    const srcBeforeScratch = ctx.sources.length;
    const fadeSec = engine.crossfadeToTrack(BUNDLED_WANGAN_BEATMAP, userBuf, 4, false, 'scratch');
    expect(fadeSec).toBeGreaterThan(0);

    // Outgoing source spins down smoothly instead of abrupt stop
    expect(
      activeSrcBeforeFork.playbackRate.calls.some(
        (c) => c.method === 'exponentialRampToValueAtTime' && (c.args[0] as number) < 0.5,
      ),
    ).toBe(true);
    expect(ctx.oscillators.length).toBe(oscBeforeScratch + 1);
    expect(ctx.sources.length).toBeGreaterThanOrEqual(srcBeforeScratch + 2); // incoming + noise FX

    // Verify all newly created FX gains start from 0.0001 (de-clicked ramps)
    const recentFxGain = ctx.gains[ctx.gains.length - 1]!;
    expect(recentFxGain.gain.calls[0]?.method).toBe('setValueAtTime');
    expect(recentFxGain.gain.calls[0]?.args[0]).toBeCloseTo(0.0001, 4);

    // 2. Left fork / loop on synth fallback preserves seamless loop while firing 'rewind' FX
    engine.loadTrack(DEFAULT_SYNTH_BEATMAP, null);
    const oscBeforeRewind = ctx.oscillators.length;
    const loopFade = engine.crossfadeToTrack(DEFAULT_SYNTH_BEATMAP, null, 2, true, 'rewind');
    expect(loopFade).toBe(0);
    expect(ctx.oscillators.length).toBe(oscBeforeRewind + 1);

    // 3. Disabling audioForkTransitionFx = 0 skips all procedural FX nodes
    tuning.audioForkTransitionFx = 0;
    const oscBeforeMuted = ctx.oscillators.length;
    engine.crossfadeToTrack(DEFAULT_SYNTH_BEATMAP, null, 2, true, 'rewind');
    expect(ctx.oscillators.length).toBe(oscBeforeMuted);

    engine.dispose();
  });

  it('attaches on-demand hydrated AudioBuffer seamlessly when active track started on synth fallback', async () => {
    const engine = new FunkAudioEngine(DEFAULT_SYNTH_BEATMAP);
    await engine.unlock();
    engine.loadTrack(DEFAULT_SYNTH_BEATMAP, null);
    expect(engine.isUsingSynthFallback).toBe(true);

    const ctx = lastCreatedCtx!;
    ctx.currentTime += 0.5;
    engine.update(1 / 60, { speedRatio: 0.8, isDrifting: false, isOffRoad: false });

    const hydratedBuf = ctx.createBuffer(2, 44100 * 10, 44100) as unknown as AudioBuffer;
    engine.attachHydratedBuffer(DEFAULT_SYNTH_BEATMAP, hydratedBuf);

    expect(engine.isUsingSynthFallback).toBe(false);
    const latestSource = ctx.sources[ctx.sources.length - 1]!;
    expect(latestSource.buffer).toBe(hydratedBuf);

    engine.dispose();
  });

  it('snapshots gameplay state when seekPreview is called while preview is stopped and restores it on stopPreview', async () => {
    const engine = new FunkAudioEngine(DEFAULT_SYNTH_BEATMAP);
    await engine.unlock();
    const ctx = lastCreatedCtx!;
    const userBuf = ctx.createBuffer(2, 44100 * 60, 44100) as unknown as AudioBuffer;
    engine.loadTrack(DEFAULT_SYNTH_BEATMAP, userBuf);

    for (let i = 0; i < 60; i++) {
      ctx.currentTime += 0.2;
      engine.update(0.2, { speedRatio: 0.7, isDrifting: false, isOffRoad: false });
    }
    const gameplaySec = engine.samplePreview().trackTimeSec;
    expect(gameplaySec).toBeGreaterThan(5);

    expect(engine.isPreviewPlaying).toBe(false);
    engine.seekPreview(45);
    expect(engine.isPreviewPlaying).toBe(false);
    expect(engine.samplePreview().trackTimeSec).toBeCloseTo(45, 1);

    engine.stopPreview(true, true);
    expect(engine.samplePreview().trackTimeSec).toBeCloseTo(gameplaySec, 1);

    engine.dispose();
  });
});
