import { DEFAULT_TUNING, TUNING_CONTROLS } from '@src/config/tuning';
import { describe, expect, it, vi } from 'vitest';
import { BeatClock } from './BeatClock';
import { withAdjustedBpm } from './BeatMap';
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

  it('supports Cassette Deck preview playback while paused and restores gameplay timestamp when staying on same track', async () => {
    const engine = new FunkAudioEngine(DEFAULT_SYNTH_BEATMAP);

    // Advance gameplay position to 42.5s, then pause
    (engine as unknown as { virtualTrackSec: number }).virtualTrackSec = 42.5;
    await engine.pause();
    expect(engine.paused).toBe(true);

    // Start preview at 10s, seek to 25s, toggle beat click
    await engine.startPreview(10);
    expect(engine.isPreviewMode).toBe(true);
    expect(engine.isPreviewPlaying).toBe(true);
    expect(engine.cutoffHz).toBeGreaterThanOrEqual(15000);

    engine.seekPreview(25);
    const sample = engine.samplePreview();
    expect(sample.trackTimeSec).toBeCloseTo(25, 1);
    expect(sample.isPlaying).toBe(true);

    engine.setPreviewClickEnabled(true);
    expect(engine.isPreviewClickEnabled).toBe(true);

    // Pause preview retains current scrub time
    engine.pausePreview();
    expect(engine.isPreviewPlaying).toBe(false);
    expect(engine.samplePreview().trackTimeSec).toBeCloseTo(25, 1);

    // Stopping preview with restoreIfSameTrack=true restores original 42.5s gameplay timestamp
    engine.stopPreview(true);
    expect(engine.isPreviewMode).toBe(false);
    expect((engine as unknown as { virtualTrackSec: number }).virtualTrackSec).toBeCloseTo(42.5, 2);

    // Switching to another track during preview resets gameplay timestamp to 0 on exit
    await engine.startPreview(0);
    engine.loadTrack(
      {
        ...DEFAULT_SYNTH_BEATMAP,
        contentHash: 'sha256:other-preview-track',
        title: 'Other Track',
      },
      null,
    );
    engine.seekPreview(18);
    engine.stopPreview(true);
    expect((engine as unknown as { virtualTrackSec: number }).virtualTrackSec).toBe(0);

    engine.dispose();
  });

  it('removes synthesized in-game SFX methods, warm-up oscillator, and bridgeJointVolume tuning', async () => {
    const engine = new FunkAudioEngine(DEFAULT_SYNTH_BEATMAP);

    expect('playBridgeJoint' in engine).toBe(false);
    expect('triggerCollisionSound' in engine).toBe(false);
    expect('bridgeJointVolume' in DEFAULT_TUNING).toBe(false);
    expect(TUNING_CONTROLS.some((c) => (c.key as string) === 'bridgeJointVolume')).toBe(false);

    const createOscillator = vi.fn();
    const fakeParam = () => ({
      value: 0,
      setValueAtTime: vi.fn(),
      linearRampToValueAtTime: vi.fn(),
      exponentialRampToValueAtTime: vi.fn(),
      cancelScheduledValues: vi.fn(),
    });
    const fakeNode = () => ({
      gain: fakeParam(),
      frequency: fakeParam(),
      Q: fakeParam(),
      delayTime: fakeParam(),
      type: 'lowpass',
      connect: vi.fn(),
      disconnect: vi.fn(),
    });
    const mockCtx = {
      state: 'running',
      currentTime: 0,
      sampleRate: 44100,
      destination: {},
      createBiquadFilter: vi.fn(fakeNode),
      createGain: vi.fn(fakeNode),
      createDelay: vi.fn(fakeNode),
      createOscillator,
      createBuffer: vi.fn((_c: number, length: number, sampleRate: number) => ({
        length,
        sampleRate,
        duration: length / sampleRate,
        getChannelData: () => new Float32Array(length),
      })),
      createBufferSource: vi.fn(() => ({
        buffer: null,
        loop: false,
        playbackRate: fakeParam(),
        connect: vi.fn(),
        disconnect: vi.fn(),
        start: vi.fn(),
        stop: vi.fn(),
      })),
      resume: vi.fn(async () => {}),
      close: vi.fn(async () => {}),
    };

    const g = globalThis as unknown as { window?: unknown; AudioContext?: unknown };
    const prevWindow = g.window;
    const prevAudioCtx = g.AudioContext;
    const AudioCtxCtor = vi.fn(function () {
      return mockCtx;
    });
    g.window = { AudioContext: AudioCtxCtor };
    g.AudioContext = AudioCtxCtor;

    try {
      await engine.unlock();
      expect(createOscillator).not.toHaveBeenCalled();
    } finally {
      g.window = prevWindow;
      g.AudioContext = prevAudioCtx;
      engine.dispose();
    }
  });

  it('rebuilds synth loop buffer and restarts preview source when BPM changes via updateBeatMap', async () => {
    const engine = new FunkAudioEngine(DEFAULT_SYNTH_BEATMAP);

    const createdSources: Array<{ buffer: AudioBuffer | null; start: ReturnType<typeof vi.fn>; stop: ReturnType<typeof vi.fn> }> = [];
    const fakeParam = () => ({
      value: 0,
      setValueAtTime: vi.fn(),
      linearRampToValueAtTime: vi.fn(),
      exponentialRampToValueAtTime: vi.fn(),
      cancelScheduledValues: vi.fn(),
    });
    const fakeNode = () => ({
      gain: fakeParam(),
      frequency: fakeParam(),
      Q: fakeParam(),
      delayTime: fakeParam(),
      type: 'lowpass',
      connect: vi.fn(),
      disconnect: vi.fn(),
    });
    const mockCtx = {
      state: 'running',
      currentTime: 0,
      sampleRate: 44100,
      destination: {},
      createBiquadFilter: vi.fn(fakeNode),
      createGain: vi.fn(fakeNode),
      createDelay: vi.fn(fakeNode),
      createBuffer: vi.fn((_c: number, length: number, sampleRate: number) => ({
        length,
        sampleRate,
        duration: length / sampleRate,
        getChannelData: () => new Float32Array(length),
      })),
      createBufferSource: vi.fn(() => {
        const src = {
          buffer: null as AudioBuffer | null,
          loop: false,
          loopStart: 0,
          loopEnd: 0,
          playbackRate: fakeParam(),
          connect: vi.fn(),
          disconnect: vi.fn(),
          start: vi.fn(),
          stop: vi.fn(),
          onended: null,
        };
        createdSources.push(src);
        return src;
      }),
      resume: vi.fn(async () => {}),
      close: vi.fn(async () => {}),
    };

    const g = globalThis as unknown as { window?: unknown; AudioContext?: unknown };
    const prevWindow = g.window;
    const prevAudioCtx = g.AudioContext;
    const AudioCtxCtor = vi.fn(function () {
      return mockCtx;
    });
    g.window = { AudioContext: AudioCtxCtor };
    g.AudioContext = AudioCtxCtor;

    try {
      await engine.startPreview(0);
      expect(engine.isPreviewPlaying).toBe(true);
      expect(createdSources.length).toBe(1);
      const initialBuffer = createdSources[0]!.buffer;

      const doubled = withAdjustedBpm(engine.beatMap, engine.beatMap.bpm * 2);
      engine.updateBeatMap(doubled);

      expect(engine.beatMap.bpm).toBeCloseTo(244, 1);
      expect(engine.isPreviewPlaying).toBe(true);
      expect(createdSources.length).toBe(2);
      expect(createdSources[1]!.buffer).not.toBe(initialBuffer);
      expect(createdSources[0]!.stop).toHaveBeenCalledTimes(1);
      expect(createdSources[1]!.start).toHaveBeenCalledTimes(1);
    } finally {
      g.window = prevWindow;
      g.AudioContext = prevAudioCtx;
      engine.dispose();
    }
  });

  it('applies subtle tunnel resonance inside env === "tunnel" and triggers an exit filter blip on portal exit', () => {
    const engine = new FunkAudioEngine(DEFAULT_SYNTH_BEATMAP);

    for (let i = 0; i < 20; i++) {
      engine.update(1 / 60, {
        speedRatio: 0.85,
        isDrifting: false,
        isOffRoad: false,
        inTunnel: true,
      });
    }
    expect(engine.tunnelResonance).toBeGreaterThan(0.7);
    const inTunnelCutoff = engine.cutoffHz;

    for (let i = 0; i < 15; i++) {
      engine.update(1 / 60, {
        speedRatio: 0.85,
        isDrifting: false,
        isOffRoad: false,
        inTunnel: false,
      });
    }
    expect(engine.tunnelResonance).toBeLessThan(0.15);
    expect(engine.cutoffHz).toBeGreaterThan(inTunnelCutoff);

    engine.dispose();
  });

  it('resets tunnel resonance and wet send cleanly on seek/load/preview/crossfade/dispose without spurious exit blips', async () => {
    const engine = new FunkAudioEngine(DEFAULT_SYNTH_BEATMAP);
    const createdGains: Array<{ gain: { value: number } }> = [];
    const fakeParam = (initial = 1) => ({
      value: initial,
      setValueAtTime: vi.fn(),
      linearRampToValueAtTime: vi.fn(),
      exponentialRampToValueAtTime: vi.fn(),
      cancelScheduledValues: vi.fn(),
    });
    const mockCtx = {
      state: 'running',
      currentTime: 0,
      destination: {},
      createGain: vi.fn(() => {
        const g = { gain: fakeParam(1), connect: vi.fn(), disconnect: vi.fn() };
        createdGains.push(g);
        return g;
      }),
      createBiquadFilter: vi.fn(() => ({
        type: 'lowpass',
        frequency: fakeParam(16000),
        Q: fakeParam(1.8),
        connect: vi.fn(),
        disconnect: vi.fn(),
      })),
      createDelay: vi.fn(() => ({
        delayTime: fakeParam(0.1),
        connect: vi.fn(),
        disconnect: vi.fn(),
      })),
      createBuffer: vi.fn((_c: number, len: number, sr: number) => ({
        numberOfChannels: 2,
        length: len,
        sampleRate: sr,
        duration: len / sr,
        getChannelData: () => new Float32Array(len),
      })),
      createBufferSource: vi.fn(() => ({
        buffer: null,
        loop: false,
        loopStart: 0,
        loopEnd: 0,
        playbackRate: fakeParam(),
        connect: vi.fn(),
        disconnect: vi.fn(),
        start: vi.fn(),
        stop: vi.fn(),
        onended: null,
      })),
      resume: vi.fn(async () => {}),
      close: vi.fn(async () => {}),
    };

    const g = globalThis as unknown as { window?: unknown; AudioContext?: unknown };
    const prevWindow = g.window;
    const prevAudioCtx = g.AudioContext;
    const AudioCtxCtor = vi.fn(function () {
      return mockCtx;
    });
    g.window = { AudioContext: AudioCtxCtor };
    g.AudioContext = AudioCtxCtor;

    try {
      await engine.unlock();
      // Tunnel send gain is the 4th gain node created during unlock() (master, dubSend, dubFeedback, tunnelSend)
      const tunnelSendGain = createdGains[3]!;
      expect(tunnelSendGain.gain.value).toBe(0);

      // Drive inside tunnel -> wet send rises
      for (let i = 0; i < 20; i++) {
        engine.update(1 / 60, { speedRatio: 0.85, isDrifting: false, isOffRoad: false, inTunnel: true });
      }
      expect(engine.tunnelResonance).toBeGreaterThan(0.7);
      expect(tunnelSendGain.gain.value).toBeGreaterThan(0.05);

      // seekTo resets tunnel state and avoids triggering exit filter blip on next update
      engine.seekTo(0);
      expect(engine.tunnelResonance).toBe(0);
      expect(tunnelSendGain.gain.value).toBe(0);
      engine.update(1 / 60, { speedRatio: 0.5, isDrifting: false, isOffRoad: false, inTunnel: false });
      expect((engine as unknown as { filterBlipBoost: number }).filterBlipBoost).toBe(0);

      // Enter tunnel again -> startPreview must clear wet send for clean preview playback
      for (let i = 0; i < 15; i++) {
        engine.update(1 / 60, { speedRatio: 0.85, isDrifting: false, isOffRoad: false, inTunnel: true });
      }
      expect(tunnelSendGain.gain.value).toBeGreaterThan(0.05);
      await engine.startPreview(0);
      expect(engine.tunnelResonance).toBe(0);
      expect(tunnelSendGain.gain.value).toBe(0);
      engine.stopPreview(false);

      // Enter tunnel again -> exit normally -> tunnelSendGain must converge to exact 0 (no deadband leak)
      for (let i = 0; i < 15; i++) {
        engine.update(1 / 60, { speedRatio: 0.85, isDrifting: false, isOffRoad: false, inTunnel: true });
      }
      for (let i = 0; i < 120; i++) {
        engine.update(1 / 60, { speedRatio: 0.85, isDrifting: false, isOffRoad: false, inTunnel: false });
      }
      expect(engine.tunnelResonance).toBe(0);
      expect(tunnelSendGain.gain.value).toBe(0);

      // loadTrack & crossfadeToTrack also clear active tunnel state cleanly
      for (let i = 0; i < 15; i++) {
        engine.update(1 / 60, { speedRatio: 0.85, isDrifting: false, isOffRoad: false, inTunnel: true });
      }
      engine.loadTrack(DEFAULT_SYNTH_BEATMAP, null);
      expect(engine.tunnelResonance).toBe(0);
      expect(tunnelSendGain.gain.value).toBe(0);

      for (let i = 0; i < 15; i++) {
        engine.update(1 / 60, { speedRatio: 0.85, isDrifting: false, isOffRoad: false, inTunnel: true });
      }
      engine.crossfadeToTrack(DEFAULT_SYNTH_BEATMAP, null, 2, true);
      expect(engine.tunnelResonance).toBe(0);
      expect(tunnelSendGain.gain.value).toBe(0);
    } finally {
      g.window = prevWindow;
      g.AudioContext = prevAudioCtx;
      engine.dispose();
      expect(engine.tunnelResonance).toBe(0);
    }
  });
});
