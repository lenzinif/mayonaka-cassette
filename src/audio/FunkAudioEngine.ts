import { tuning } from '@src/config/tuning';
import {
  BeatClock,
  type BeatClockState,
  type BeatJudgement,
} from './BeatClock';
import {
  barDurationSec,
  beatDurationSec,
  type BeatMap,
  type BeatSection,
  type SectionRole,
} from './BeatMap';

/**
 * Default procedural Future Funk BeatMap (122 BPM, 64 bars = ~125.9 s) used when
 * no external or user track is loaded (AGENTS.md §1 Pillar 4 & §4.4).
 */
export const DEFAULT_SYNTH_BEATMAP: BeatMap = createDefaultSynthBeatMap();

/**
 * Bundled Stage 2 Track BeatMap (126 BPM, 64 bars = ~121.9 s) so the default playlist
 * has a multi-stage run out of the box (AGENTS.md §1 Pillar 4 & §5 M6).
 */
export const BUNDLED_WANGAN_BEATMAP: BeatMap = createBundledTrackBeatMap({
  contentHash: 'sha256:bundled-midnight-wangan-126bpm',
  title: "Midnight Wangan '88",
  artist: 'Plastic Love FM',
  bpm: 126,
  sections: [
    { startBar: 0, bars: 8, role: 'intro' },
    { startBar: 8, bars: 8, role: 'build' },
    { startBar: 16, bars: 16, role: 'drop' },
    { startBar: 32, bars: 8, role: 'breakdown' },
    { startBar: 40, bars: 8, role: 'build' },
    { startBar: 48, bars: 12, role: 'drop' },
    { startBar: 60, bars: 4, role: 'outro' },
  ],
  muffledSpans: [[40, 48]],
});

/**
 * Bundled Stage 3 Track BeatMap (118 BPM, 64 bars = ~130.2 s) for Coastal Breeze stage.
 */
export const BUNDLED_COASTAL_BEATMAP: BeatMap = createBundledTrackBeatMap({
  contentHash: 'sha256:bundled-coastal-breeze-118bpm',
  title: 'Melon Soda Sunset',
  artist: 'Kissaten 1986',
  bpm: 118,
  sections: [
    { startBar: 0, bars: 8, role: 'intro' },
    { startBar: 8, bars: 4, role: 'build' },
    { startBar: 12, bars: 16, role: 'drop' },
    { startBar: 28, bars: 8, role: 'breakdown' },
    { startBar: 36, bars: 8, role: 'build' },
    { startBar: 44, bars: 16, role: 'drop' },
    { startBar: 60, bars: 4, role: 'outro' },
  ],
});

export const BUNDLED_BEATMAPS: readonly BeatMap[] = [
  DEFAULT_SYNTH_BEATMAP,
  BUNDLED_WANGAN_BEATMAP,
  BUNDLED_COASTAL_BEATMAP,
];

function createDefaultSynthBeatMap(): BeatMap {
  return createBundledTrackBeatMap({
    contentHash: 'sha256:bundled-neon-horizon-122bpm',
    title: 'Neon Horizon',
    artist: 'Mayonaka FM',
    bpm: 122,
    sections: [
      { startBar: 0, bars: 8, role: 'intro' },
      { startBar: 8, bars: 8, role: 'build' },
      { startBar: 16, bars: 16, role: 'drop' },
      { startBar: 32, bars: 8, role: 'breakdown' },
      { startBar: 40, bars: 4, role: 'build' },
      { startBar: 44, bars: 16, role: 'drop' },
      { startBar: 60, bars: 4, role: 'outro' },
    ],
    muffledSpans: [[40, 44]],
  });
}

function createBundledTrackBeatMap(params: {
  contentHash: string;
  title: string;
  artist: string;
  bpm: number;
  sections: BeatSection[];
  muffledSpans?: readonly (readonly [number, number])[];
}): BeatMap {
  const { contentHash, title, artist, bpm, sections, muffledSpans } = params;
  const beatsPerBar = 4;
  const totalBars = sections.reduce((sum, s) => sum + s.bars, 0);
  const durationSec = Math.round(totalBars * ((60 / bpm) * beatsPerBar) * 1000) / 1000;

  const roleEnergy: Record<BeatSection['role'], number> = {
    intro: 0.34,
    build: 0.62,
    groove: 0.72,
    drop: 0.92,
    breakdown: 0.42,
    outro: 0.3,
  };
  const roleBrightness: Record<BeatSection['role'], number> = {
    intro: 0.56,
    build: 0.66,
    groove: 0.76,
    drop: 0.88,
    breakdown: 0.55,
    outro: 0.52,
  };

  const barEnergy: number[] = new Array<number>(totalBars).fill(0.5);
  const barBrightness: number[] = new Array<number>(totalBars).fill(0.65);
  for (const sec of sections) {
    for (let i = 0; i < sec.bars; i++) {
      const b = sec.startBar + i;
      if (b < totalBars) {
        const ramp = sec.role === 'build' ? (i / Math.max(1, sec.bars - 1)) * 0.25 : 0;
        barEnergy[b] = Math.min(1, Math.round((roleEnergy[sec.role] + ramp) * 100) / 100);
        const brightRamp = sec.role === 'drop' ? 0.04 * (i % 2) : 0;
        barBrightness[b] = Math.min(
          1,
          Math.round((roleBrightness[sec.role] + brightRamp) * 100) / 100,
        );
      }
    }
  }

  if (muffledSpans) {
    for (const [startBar, endBar] of muffledSpans) {
      const lo = Math.max(0, startBar);
      const hi = Math.min(totalBars, endBar);
      for (let b = lo; b < hi; b++) {
        barBrightness[b] = 0.15;
      }
    }
  }

  return {
    version: 1,
    contentHash,
    title,
    artist,
    durationSec,
    bpm,
    firstBeatOffsetSec: 0,
    beatsPerBar,
    barEnergy,
    barBrightness,
    sections,
    confidence: {
      tempo: 0.99,
      downbeat: 0.99,
      tempoStable: true,
    },
    source: 'bundled',
  };
}

/**
 * Synthesizes an 8-bar stereo Future Funk loop (kick, slap bass, sidechained 7th chords,
 * snare/clap, and 16th hats) at the given BPM and sample rate.
 */
export function synthesizeFutureFunkLoopPcm(
  bpm: number,
  sampleRate: number,
  bars = 8,
): { left: Float32Array; right: Float32Array } {
  const beatDur = 60 / bpm;
  const barDur = beatDur * 4;
  const totalSec = bars * barDur;
  const totalSamples = Math.floor(totalSec * sampleRate);
  const left = new Float32Array(totalSamples);
  const right = new Float32Array(totalSamples);

  // Classic Future Funk / City Pop IVmaj7 -> iii7 -> ii7 -> Imaj7 progression in F Major
  const chords: readonly (readonly number[])[] = [
    [174.61, 220.0, 261.63, 329.63, 392.0], // Bbmaj9 / Fmaj7 flavour
    [164.81, 196.0, 246.94, 293.66, 392.0], // Em7
    [146.83, 174.61, 220.0, 261.63, 329.63], // Dm9
    [130.81, 164.81, 196.0, 246.94, 329.63], // Cmaj9
  ];
  const bassRoots = [87.31, 82.41, 73.42, 65.41];

  for (let i = 0; i < totalSamples; i++) {
    const t = i / sampleRate;
    const beatFloat = t / beatDur;
    const beatIdx = Math.floor(beatFloat);
    const beatPhase = beatFloat - beatIdx;
    const barIdx = Math.floor(beatIdx / 4);
    const beatInBar = beatIdx % 4;
    const chordIdx = barIdx % chords.length;
    const chord = chords[chordIdx]!;
    const bassFreq = bassRoots[chordIdx]!;

    const tInBeat = beatPhase * beatDur;

    // 1. Punchy 4-on-the-floor kick drum
    let kick = 0;
    if (tInBeat < 0.14) {
      const kEnv = Math.exp(-tInBeat * 26);
      const kFreq = 46 + 90 * Math.exp(-tInBeat * 55);
      kick = Math.sin(2 * Math.PI * kFreq * tInBeat) * kEnv * 0.62;
    }

    // 2. Sidechain pumping envelope (ducks on beat impact, swells up by off-beat)
    const sidechain = Math.min(1, 0.15 + 0.85 * (1 - Math.exp(-beatPhase * 4.5)));

    // 3. Warm detuned saw/chorus 7th chord pad
    let padL = 0;
    let padR = 0;
    for (let c = 0; c < chord.length; c++) {
      const f = chord[c]!;
      const s1 = Math.sin(2 * Math.PI * f * t + 0.3 * Math.sin(2 * Math.PI * (f * 2) * t));
      const s2 = Math.sin(2 * Math.PI * (f * 1.003) * t);
      padL += s1 * 0.055;
      padR += s2 * 0.055;
    }
    padL *= sidechain;
    padR *= sidechain;

    // 4. Syncopated octave slap bass (16th-note groove)
    const sixteenthFloat = beatFloat * 4;
    const sixteenthIdx = Math.floor(sixteenthFloat) % 4;
    const sixteenthPhase = sixteenthFloat - Math.floor(sixteenthFloat);
    const tSixteenth = sixteenthPhase * (beatDur * 0.25);
    const bassFreqActive = sixteenthIdx === 2 ? bassFreq * 2 : bassFreq;
    const bassEnv = Math.exp(-tSixteenth * 18) * (sixteenthIdx === 1 ? 0.45 : 0.85);
    const bass =
      Math.tanh(
        1.8 *
          (Math.sin(2 * Math.PI * bassFreqActive * t) +
            0.45 * Math.sin(2 * Math.PI * bassFreqActive * 2 * t)),
      ) *
      bassEnv *
      0.26 *
      (0.35 + 0.65 * sidechain);

    // 5. Crisp snare/clap on beats 2 and 4 (beatInBar === 1 or 3)
    let snare = 0;
    if ((beatInBar === 1 || beatInBar === 3) && tInBeat < 0.095) {
      const sEnv = Math.exp(-tInBeat * 34);
      const pseudoNoise =
        Math.sin(2 * Math.PI * 1117 * t + Math.sin(2 * Math.PI * 313 * t) * 4) * 0.5 +
        Math.sin(2 * Math.PI * 2341 * t + Math.cos(2 * Math.PI * 571 * t) * 5) * 0.5;
      snare = pseudoNoise * sEnv * 0.22;
    }

    // 6. Open off-beat hi-hat on the "and" of each beat
    let hat = 0;
    if (sixteenthIdx === 2 && tSixteenth < 0.065) {
      const hEnv = Math.exp(-tSixteenth * 45);
      const metallic =
        Math.sin(2 * Math.PI * 4120 * t) *
        Math.sin(2 * Math.PI * 5830 * t) *
        Math.cos(2 * Math.PI * 7310 * t);
      hat = metallic * hEnv * 0.14;
    }

    const mono = kick + bass + snare;
    left[i] = Math.max(-0.98, Math.min(0.98, mono + padL + hat * 0.9));
    right[i] = Math.max(-0.98, Math.min(0.98, mono + padR + hat * 1.1));
  }

  return { left, right };
}

/** Maximum number of synthesized fallback PCM / AudioBuffer variants retained via LRU. */
export const MAX_SYNTH_CACHE_ENTRIES = 6;

/** In-memory LRU cache of synthesized raw PCM channels keyed by `${sampleRate}:${bpm}:${bars}`. */
const synthPcmCache = new Map<string, { left: Float32Array; right: Float32Array }>();

/** In-memory LRU cache of AudioBuffer instances keyed by `${sampleRate}:${bpm}:${bars}`. */
const synthAudioBufferCache = new Map<string, AudioBuffer>();

function setBoundedLruEntry<K, V>(cache: Map<K, V>, key: K, value: V, maxEntries: number): void {
  cache.delete(key);
  cache.set(key, value);
  while (cache.size > maxEntries) {
    const oldestKey = cache.keys().next().value;
    if (oldestKey === undefined) break;
    cache.delete(oldestKey);
  }
}

/**
 * Retrieves a cached synthesized stereo loop or calculates it once deterministically.
 */
export function getOrSynthesizeFutureFunkLoopPcm(
  bpm: number,
  sampleRate: number,
  bars = 8,
): { left: Float32Array; right: Float32Array } {
  const key = `${sampleRate}:${bpm}:${bars}`;
  let cached = synthPcmCache.get(key);
  if (cached) {
    synthPcmCache.delete(key);
    synthPcmCache.set(key, cached);
    return cached;
  }
  cached = synthesizeFutureFunkLoopPcm(bpm, sampleRate, bars);
  setBoundedLruEntry(synthPcmCache, key, cached, MAX_SYNTH_CACHE_ENTRIES);
  return cached;
}

/**
 * Clears the PCM and AudioBuffer cache (used in tests or resource resets).
 */
export function clearSynthLoopCache(): void {
  synthPcmCache.clear();
  synthAudioBufferCache.clear();
}

/**
 * Diagnostic helper returning the current number of cached synth fallback entries.
 */
export function getSynthLoopCacheStats(): { pcmEntries: number; audioBufferEntries: number } {
  return {
    pcmEntries: synthPcmCache.size,
    audioBufferEntries: synthAudioBufferCache.size,
  };
}

/**
 * Retrieves or builds a cached Web Audio `AudioBuffer` for the synthesized procedural fallback.
 */
export function getOrBuildSynthFallbackBuffer(
  ctx: AudioContext,
  bpm: number,
  bars = 8,
): AudioBuffer {
  const sr = ctx.sampleRate;
  const key = `${sr}:${bpm}:${bars}`;
  let buf = synthAudioBufferCache.get(key);
  if (buf) {
    synthAudioBufferCache.delete(key);
    synthAudioBufferCache.set(key, buf);
    return buf;
  }
  const pcm = getOrSynthesizeFutureFunkLoopPcm(bpm, sr, bars);
  buf = ctx.createBuffer(2, pcm.left.length, sr);
  buf.getChannelData(0).set(pcm.left);
  buf.getChannelData(1).set(pcm.right);
  setBoundedLruEntry(synthAudioBufferCache, key, buf, MAX_SYNTH_CACHE_ENTRIES);
  return buf;
}

export type ForkTransitionAudioStyle = 'none' | 'scratch' | 'rewind';

export interface DrivingAudioParams {
  /** Current car speed ratio in [0, 1]. */
  speedRatio: number;
  /** True when the car is actively drifting. */
  isDrifting: boolean;
  /** True when the car is off the asphalt on the shoulder/grass. */
  isOffRoad: boolean;
  /** Continuous off-road penetration depth in [0, 1] for progressive filter/pitch transition. */
  offRoadDepth?: number;
  /**
   * True when the player is in the late fork approach zone of a multi-track playlist:
   * activates the Dub Tape Delay wash at native pitch/tempo if the track concludes
   * before crossing the fork.
   */
  holdOutroLoop?: boolean;
  /** True when camera/player is driving inside an enclosed `env === 'tunnel'` span. */
  inTunnel?: boolean;
}

export interface PreviewSample {
  isPlaying: boolean;
  trackTimeSec: number;
  durationSec: number;
  beatInBar: number;
  barIndex: number;
  beatPulse: number;
  downbeatPulse: number;
  sectionRole: SectionRole;
}

/**
 * Web Audio graph & master beat clock wrapper (`Source -> SourceGain -> BiquadFilter -> MasterGain -> Destination`).
 *
 * Obeys AGENTS.md §2 & §4.5:
 * - Zero React imports.
 * - Never creates or resumes `AudioContext` until `unlock()` is invoked inside a user gesture.
 * - Coupling between driving state and music: speed + clean drifts sweep the low-pass filter
 *   cutoff open; off-road drag and collisions muffle the filter and dip turntable pitch.
 * - M6: Supports 4-bar DJ crossfade between tracks and 8-bar outro hold loops.
 */
export class FunkAudioEngine {
  readonly beatClock: BeatClock;

  private ctx: AudioContext | null = null;
  private filterNode: BiquadFilterNode | null = null;
  private tapeDropoutGain: GainNode | null = null;
  private masterGain: GainNode | null = null;

  private sourceNode: AudioBufferSourceNode | null = null;
  private sourceGainNode: GainNode | null = null;
  private outgoingSourceNode: AudioBufferSourceNode | null = null;
  private outgoingGainNode: GainNode | null = null;
  private outgoingSpinDownActive = false;

  private currentBuffer: AudioBuffer | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private isSynthLoopBuffer = true;

  private isPlaying = false;
  private isPaused = false;
  private pendingTrackStart = false;
  private resumeId = 0;
  private suspendPromise: Promise<void> | null = null;
  private justResumed = false;
  private currentCutoffHz = 2400;
  private currentQ = 1.6;
  private currentBasePlaybackRate = 1.0;
  private currentPlaybackRate = 1.0;
  private lastAppliedCutoffHz = -1;
  private lastAppliedQ = -1;
  private lastAppliedPlaybackRate = -1;
  private lastAppliedDropoutGain = 1.0;
  private cachedLatencySec = 0;
  private lastLatencyCheckSec = -10;

  /** Accumulated virtual track position (seconds) accounting for variable playbackRate. */
  private virtualTrackSec = 0;
  private lastAudioTimeSec = 0;

  /** 4-bar DJ crossfade state (M6). */
  private crossfadeRemainingSec = 0;
  private crossfadeTotalSec = 0;
  private outroLoopHolding = false;
  /** Dub Tape Delay & Reverb Wash circuit for organic outro extensions (docs/OUTRO_EXTENSION_PROPOSALS.md). */
  private dubSendGain: GainNode | null = null;
  private dubDelayNode: DelayNode | null = null;
  private dubFeedbackGain: GainNode | null = null;
  private dubFilterNode: BiquadFilterNode | null = null;
  private dubWetGain: GainNode | null = null;
  private currentDubSend = 0;
  private currentDubFeedback = 0;
  private lastAppliedDubSend = 0;
  private lastAppliedDubFeedback = 0;
  private lastAppliedDubFilterHz = -1;
  private lastAppliedDubWet = 0;
  private outroSourceFaded = false;

  /** Subtle acoustic slapback resonance inside `env === 'tunnel'` spans (opens cleanly on exit). */
  private tunnelSendGain: GainNode | null = null;
  private tunnelDelayNode: DelayNode | null = null;
  private tunnelFeedbackGain: GainNode | null = null;
  private tunnelFilterNode: BiquadFilterNode | null = null;
  private currentTunnelSend = 0;
  private lastAppliedTunnelSend = 0;
  private tunnelEnvelope = 0;
  private wasInTunnel = false;

  /** Progressive attack/release envelope for turntable pitch dips (collisions/shocks). */
  private pitchDipTarget = 0;
  private pitchDipEnvelope = 0;

  /** Progressive attack/release envelope for off-road immersion [0, 1]. */
  private offRoadEnvelope = 0;

  /** Cassette wear oscillators & shock intensity for zero-lag Wow & Flutter. */
  private wowPhase = 0;
  private flutterPhase = 0;
  private tapeShockEnvelope = 0;

  /** Progressive attack/release envelope for filter muffle on collisions/spills. */
  private filterMuffleTarget = 0;
  private filterMuffleEnvelope = 0;

  /** Momentary filter blip boost (e.g. on beat-matched shifts or drops). */
  private filterBlipBoost = 0;

  /** Cassette Deck preview playback state (active independently of gameplay pause). */
  private previewMode = false;
  private previewPlaying = false;
  private previewClickEnabled = false;
  private previewStartToken = 0;
  private savedGameplayState: { contentHash: string; trackSec: number } | null = null;
  private lastPreviewSampleTimeMs = 0;
  private readonly previewSample: PreviewSample = {
    isPlaying: false,
    trackTimeSec: 0,
    durationSec: 1,
    beatInBar: 0,
    barIndex: 0,
    beatPulse: 0,
    downbeatPulse: 0,
    sectionRole: 'intro',
  };

  constructor(initialBeatMap: BeatMap = DEFAULT_SYNTH_BEATMAP) {
    this.beatClock = new BeatClock(initialBeatMap);
  }

  get unlocked(): boolean {
    return this.ctx !== null && this.ctx.state === 'running';
  }

  get beatMap(): BeatMap {
    return this.beatClock.map;
  }

  get isUsingSynthFallback(): boolean {
    return this.isSynthLoopBuffer;
  }

  get cutoffHz(): number {
    return Math.round(this.currentCutoffHz);
  }

  get playbackRate(): number {
    return this.currentPlaybackRate;
  }

  get tunnelResonance(): number {
    return this.tunnelEnvelope;
  }

  /** True while a 4-bar DJ crossfade to the next stage track is in progress (M6). */
  get isCrossfading(): boolean {
    return this.crossfadeRemainingSec > 0;
  }

  /** Progress of the active DJ crossfade in [0, 1], or 0 when not crossfading. */
  get crossfadeProgress(): number {
    if (this.crossfadeRemainingSec <= 0 || this.crossfadeTotalSec <= 0) return 0;
    return Math.max(0, Math.min(1, 1 - this.crossfadeRemainingSec / this.crossfadeTotalSec));
  }

  /** True when the DJ is looping the last 8 outro bars waiting for the player to reach the fork. */
  get isOutroLooping(): boolean {
    return this.outroLoopHolding;
  }

  get paused(): boolean {
    return this.isPaused;
  }

  get isPreviewMode(): boolean {
    return this.previewMode;
  }

  get isPreviewPlaying(): boolean {
    return this.previewPlaying;
  }

  get isPreviewClickEnabled(): boolean {
    return this.previewClickEnabled;
  }

  setPreviewClickEnabled(enabled: boolean): void {
    this.previewClickEnabled = enabled;
  }

  private suspendContext(): Promise<void> {
    if (!this.ctx || this.ctx.state !== 'running' || typeof this.ctx.suspend !== 'function') {
      return this.suspendPromise ?? Promise.resolve();
    }
    if (this.suspendPromise) {
      return this.suspendPromise;
    }
    try {
      const p = Promise.resolve(this.ctx.suspend())
        .catch(() => {
          // Ignore suspend failure in test/unsupported environments
        })
        .finally(() => {
          if (this.suspendPromise === p) {
            this.suspendPromise = null;
          }
        });
      this.suspendPromise = p;
      return p;
    } catch {
      return Promise.resolve();
    }
  }

  private async resumeContext(): Promise<void> {
    if (!this.ctx) return;
    if (this.suspendPromise) {
      await this.suspendPromise;
    }
    if (!this.ctx) return;
    if (this.isPaused && !this.previewMode) return;
    if (
      this.ctx.state !== 'running' &&
      this.ctx.state !== 'closed' &&
      typeof this.ctx.resume === 'function'
    ) {
      try {
        await this.ctx.resume();
      } catch {
        // Ignore resume failure in restricted/mock environments
      }
    }
    if (this.ctx && this.isPaused && !this.previewMode && this.ctx.state === 'running') {
      await this.suspendContext();
    }
  }

  /**
   * Freezes audio playback, suspends the Web Audio context, and halts BeatClock advancement
   * (AGENTS.md §5 M8 tab-visibility & pause handling).
   */
  async pause(): Promise<void> {
    if (this.previewPlaying) {
      this.pausePreview();
    }
    if (this.isPaused) return;
    this.isPaused = true;
    this.resumeId++;
    if (this.ctx) {
      this.lastAudioTimeSec = this.ctx.currentTime;
      await this.suspendContext();
    }
  }

  /**
   * Resumes Web Audio context and resynchronizes the clock without time drift.
   */
  async resume(): Promise<void> {
    if (!this.isPaused) return;
    this.previewMode = false;
    this.previewPlaying = false;
    this.savedGameplayState = null;
    this.isPaused = false;
    const currentResumeId = ++this.resumeId;

    await this.resumeContext();

    // If pause() was called while awaiting ctx.resume(), abort
    if (this.isPaused || this.resumeId !== currentResumeId) return;

    if (this.ctx) {
      this.lastAudioTimeSec = this.ctx.currentTime;
    }
    this.justResumed = true;

    // Start newly loaded track or resume pending playback without dropping audio
    if (this.pendingTrackStart || (!this.sourceNode && this.currentBuffer && this.isPlaying)) {
      this.startSourceNode(this.virtualTrackSec, 0);
      this.pendingTrackStart = false;
    }
  }

  /**
   * Initializes or resumes the `AudioContext` inside a user gesture (`keydown` or `click`).
   */
  async unlock(): Promise<void> {
    if (typeof window === 'undefined') return;
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;

    if (!this.ctx) {
      const ctx = new AudioCtx();
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = this.currentCutoffHz;
      filter.Q.value = 1.8;

      const gain = ctx.createGain();
      gain.gain.value = 0.82;

      filter.connect(gain);
      gain.connect(ctx.destination);

      this.ctx = ctx;
      this.filterNode = filter;
      this.masterGain = gain;
      this.noiseBuffer = this.buildCassetteNoiseBuffer(ctx);
      this.lastAudioTimeSec = ctx.currentTime;

      if (typeof ctx.createDelay === 'function') {
        const dubSend = ctx.createGain();
        dubSend.gain.value = 0;

        const dubDelay = ctx.createDelay(2.0);
        const dottedEighthSec = Math.max(0.08, Math.min(1.5, beatDurationSec(this.beatClock.map) * 0.75));
        dubDelay.delayTime.value = dottedEighthSec;

        const dubFilter = ctx.createBiquadFilter();
        dubFilter.type = 'lowpass';
        dubFilter.frequency.value = tuning.outroDubFilterHz;
        dubFilter.Q.value = 2.2;

        const dubFeedback = ctx.createGain();
        dubFeedback.gain.value = 0;

        const dubWet = ctx.createGain();
        dubWet.gain.value = 0;

        filter.connect(dubSend);
        dubSend.connect(dubDelay);
        dubDelay.connect(dubFilter);
        dubFilter.connect(dubFeedback);
        dubFeedback.connect(dubDelay); // Regenerative loop
        dubFilter.connect(dubWet);
        dubWet.connect(gain);          // Gated wet output into masterGain

        this.dubSendGain = dubSend;
        this.dubDelayNode = dubDelay;
        this.dubFilterNode = dubFilter;
        this.dubFeedbackGain = dubFeedback;
        this.dubWetGain = dubWet;

        const tunnelSend = ctx.createGain();
        tunnelSend.gain.value = 0;
        const tunnelDelay = ctx.createDelay(0.5);
        tunnelDelay.delayTime.value = 0.045;
        const tunnelFilter = ctx.createBiquadFilter();
        tunnelFilter.type = 'bandpass';
        tunnelFilter.frequency.value = 1150;
        tunnelFilter.Q.value = 0.9;
        const tunnelFeedback = ctx.createGain();
        tunnelFeedback.gain.value = 0.22;

        filter.connect(tunnelSend);
        tunnelSend.connect(tunnelDelay);
        tunnelDelay.connect(tunnelFilter);
        tunnelFilter.connect(tunnelFeedback);
        tunnelFeedback.connect(tunnelDelay);
        tunnelFilter.connect(gain);

        this.tunnelSendGain = tunnelSend;
        this.tunnelDelayNode = tunnelDelay;
        this.tunnelFilterNode = tunnelFilter;
        this.tunnelFeedbackGain = tunnelFeedback;
      }

      // Insert tapeDropoutGain after dub/tunnel sends so GainNode creation order stays deterministic
      const dropoutGain = ctx.createGain();
      dropoutGain.gain.value = 1.0;
      try {
        filter.disconnect(gain);
      } catch {
        // Ignore disconnect errors in minimal mocks
      }
      filter.connect(dropoutGain);
      dropoutGain.connect(gain);
      this.tapeDropoutGain = dropoutGain;
    }

    if (!this.isPaused || this.previewMode) {
      await this.resumeContext();
    }

    if (this.ctx) {
      this.lastAudioTimeSec = this.ctx.currentTime;
    }

    if (
      !this.isPaused &&
      !this.previewMode &&
      this.ctx.state === 'running' &&
      (this.pendingTrackStart || !this.isPlaying)
    ) {
      this.startSourceNode(this.virtualTrackSec, 0);
      this.pendingTrackStart = false;
    }
  }

  /**
   * Starts or resumes Cassette Deck preview playback at full filter clarity, even while
   * gameplay is paused (`AGENTS.md` §4.5: called inside a user click/keydown gesture).
   */
  async startPreview(offsetSec?: number): Promise<void> {
    const startToken = ++this.previewStartToken;
    if (!this.previewMode) {
      this.previewMode = true;
      this.savedGameplayState = {
        contentHash: this.beatClock.map.contentHash,
        trackSec: this.virtualTrackSec,
      };
    }

    const dur = Math.max(0.1, this.beatClock.map.durationSec);
    if (offsetSec !== undefined) {
      this.virtualTrackSec = Math.max(0, Math.min(dur - 0.02, offsetSec));
    }

    this.previewPlaying = true;
    this.lastPreviewSampleTimeMs = typeof performance !== 'undefined' ? performance.now() : 0;

    await this.unlock();
    if (!this.previewMode || !this.previewPlaying || this.previewStartToken !== startToken) {
      return;
    }

    await this.resumeContext();
    if (!this.previewMode || !this.previewPlaying || this.previewStartToken !== startToken) {
      return;
    }

    this.stopOutgoingSource();
    this.resetDubState();
    this.resetTunnelState();
    this.applyPreviewFilterAndRate();
    this.beatClock.resetCrossingState();

    if (this.ctx) {
      if (!this.currentBuffer) {
        this.currentBuffer = this.buildSynthFallbackBuffer(this.ctx, this.beatClock.map.bpm);
        this.isSynthLoopBuffer = true;
      }
      if (this.ctx.state === 'running') {
        this.startSourceNode(this.virtualTrackSec, 0.02);
        this.pendingTrackStart = false;
      }
    }

    this.lastPreviewSampleTimeMs = typeof performance !== 'undefined' ? performance.now() : 0;
  }

  /**
   * Pauses Cassette Deck preview playback while preserving the current scrub timestamp.
   */
  pausePreview(): void {
    this.previewStartToken++;
    if (!this.previewPlaying) return;
    if (this.ctx && this.ctx.state === 'running') {
      const nowAudio = this.ctx.currentTime;
      const elapsed = Math.min(0.25, Math.max(0, nowAudio - this.lastAudioTimeSec));
      this.lastAudioTimeSec = nowAudio;
      const dur = Math.max(0.1, this.beatClock.map.durationSec);
      this.virtualTrackSec = (this.virtualTrackSec + elapsed) % dur;
    }
    this.stopSourceNode();
    this.previewPlaying = false;
  }

  /**
   * Toggles Cassette Deck preview playback between playing and paused.
   */
  async togglePreview(): Promise<boolean> {
    if (this.previewPlaying) {
      this.pausePreview();
      return false;
    }
    await this.startPreview(this.virtualTrackSec);
    return this.previewPlaying;
  }

  /**
   * Seeks Cassette Deck preview playback to `timeSec` (clamped inside `[0, durationSec)`).
   */
  seekPreview(timeSec: number): void {
    if (!this.previewMode) {
      this.previewMode = true;
      this.savedGameplayState = {
        contentHash: this.beatClock.map.contentHash,
        trackSec: this.virtualTrackSec,
      };
    }
    const dur = Math.max(0.1, this.beatClock.map.durationSec);
    const clamped = Math.max(0, Math.min(dur - 0.02, timeSec));
    this.virtualTrackSec = clamped;
    this.beatClock.resetCrossingState();
    if (this.previewPlaying && this.ctx && this.ctx.state === 'running') {
      this.startSourceNode(clamped, 0.015);
    }
  }

  /**
   * Exits Cassette Deck preview mode.
   * When `restoreIfSameTrack` is true and the active track matches the track that was
   * playing before preview started, restores the saved gameplay track timestamp.
   */
  stopPreview(restoreIfSameTrack = false, suspendIfPaused = true): void {
    this.previewStartToken++;
    if (!this.previewMode) return;
    this.previewMode = false;
    this.previewPlaying = false;

    const sameTrack =
      this.savedGameplayState !== null &&
      this.savedGameplayState.contentHash === this.beatClock.map.contentHash;
    if (restoreIfSameTrack && sameTrack && this.savedGameplayState) {
      this.virtualTrackSec = this.savedGameplayState.trackSec;
    } else {
      this.virtualTrackSec = 0;
    }
    this.savedGameplayState = null;
    this.beatClock.resetCrossingState();

    if (this.isPaused) {
      this.stopOutgoingSource();
      this.stopSourceNode();
      this.pendingTrackStart = true;
      if (suspendIfPaused) {
        void this.suspendContext();
      }
    }
  }

  /**
   * Advances preview track clock & samples `BeatClock` for live 4-beat LEDs and optional
   * metronome clicks while the Cassette Deck is open. Mutates a pre-allocated struct.
   */
  samplePreview(): Readonly<PreviewSample> {
    const dur = Math.max(0.1, this.beatClock.map.durationSec);

    if (this.previewPlaying) {
      if (this.ctx && this.ctx.state === 'running') {
        const nowAudio = this.ctx.currentTime;
        const elapsed = Math.min(0.25, Math.max(0, nowAudio - this.lastAudioTimeSec));
        this.lastAudioTimeSec = nowAudio;
        this.virtualTrackSec += elapsed;
      } else {
        const nowMs =
          typeof performance !== 'undefined' ? performance.now() : this.lastPreviewSampleTimeMs;
        const elapsed =
          this.lastPreviewSampleTimeMs > 0
            ? Math.min(0.25, Math.max(0, (nowMs - this.lastPreviewSampleTimeMs) / 1000))
            : 0;
        this.lastPreviewSampleTimeMs = nowMs;
        this.virtualTrackSec += elapsed;
      }

      if (this.virtualTrackSec >= dur) {
        this.virtualTrackSec %= dur;
        this.beatClock.resetCrossingState();
      }
    }

    const latencySec = this.getOutputLatencySec();
    const audibleSec = Math.max(0, this.virtualTrackSec - latencySec);
    const clockState = this.beatClock.sample(audibleSec);

    if (this.previewPlaying && this.previewClickEnabled && clockState.justCrossedBeat) {
      this.triggerPreviewClick(clockState.beatInBar === 0);
    }

    this.previewSample.isPlaying = this.previewPlaying;
    this.previewSample.trackTimeSec = this.virtualTrackSec;
    this.previewSample.durationSec = dur;
    this.previewSample.beatInBar = clockState.beatInBar;
    this.previewSample.barIndex = Math.max(0, clockState.barIndex);
    this.previewSample.beatPulse = clockState.beatPulse;
    this.previewSample.downbeatPulse = clockState.downbeatPulse;
    this.previewSample.sectionRole = clockState.sectionRole;
    return this.previewSample;
  }

  private applyPreviewFilterAndRate(): void {
    this.currentCutoffHz = tuning.audioFilterMaxHz;
    this.currentQ = 1.6;
    this.resetTapeWearState();
    this.lastAppliedCutoffHz = -1;
    this.lastAppliedQ = -1;
    this.lastAppliedPlaybackRate = -1;
    if (this.filterNode) {
      this.filterNode.frequency.value = tuning.audioFilterMaxHz;
      this.filterNode.Q.value = 1.6;
      this.lastAppliedCutoffHz = tuning.audioFilterMaxHz;
      this.lastAppliedQ = 1.6;
    }
    if (this.sourceNode) {
      this.sourceNode.playbackRate.value = 1.0;
      this.lastAppliedPlaybackRate = 1.0;
    }
  }

  private triggerPreviewClick(isDownbeat: boolean): void {
    if (!this.ctx || !this.masterGain || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = isDownbeat ? 'triangle' : 'sine';
    osc.frequency.setValueAtTime(isDownbeat ? 1320 : 780, now);
    osc.frequency.exponentialRampToValueAtTime(isDownbeat ? 660 : 390, now + 0.035);

    gain.gain.setValueAtTime(isDownbeat ? 0.34 : 0.18, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);

    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.onended = () => {
      try {
        osc.disconnect();
        gain.disconnect();
      } catch {
        // Ignore disconnect errors in mock contexts
      }
    };
    osc.start(now);
    osc.stop(now + 0.045);
  }

  /**
   * Seeks gameplay track playback & BeatClock to `timeSec` (clamped inside `[0, durationSec)`).
   * Used by diagnostics (`seekToBar`) to inspect arbitrary musical sections rapidly.
   */
  seekTo(timeSec: number): void {
    const dur = Math.max(0.1, this.beatClock.map.durationSec);
    const clamped = Math.max(0, Math.min(dur - 0.02, timeSec));
    this.stopOutgoingSource();
    this.crossfadeRemainingSec = 0;
    this.crossfadeTotalSec = 0;
    this.resetDubState();
    this.resetTunnelState();
    this.resetTapeWearState();
    this.virtualTrackSec = clamped;
    this.beatClock.resetCrossingState();
    if (this.ctx && this.ctx.state === 'running' && !this.isPaused) {
      this.startSourceNode(clamped, 0.01);
      this.pendingTrackStart = false;
    } else {
      if (this.ctx) {
        this.lastAudioTimeSec = this.ctx.currentTime;
      }
      this.pendingTrackStart = true;
    }
  }

  /**
   * Rewinds the active track and BeatClock back to `0.0s` (beat 0, bar 0) so that
   * when the player starts driving from a standstill after browsing the main menu,
   * the audio clock and road start in phase without accumulated menu lag.
   */
  restartFromBeginning(): void {
    this.stopOutgoingSource();
    this.stopSourceNode();
    this.previewMode = false;
    this.previewPlaying = false;
    this.savedGameplayState = null;
    this.crossfadeRemainingSec = 0;
    this.crossfadeTotalSec = 0;
    this.virtualTrackSec = 0;
    this.resetTapeWearState();
    this.resetDubState();
    this.resetTunnelState();
    this.beatClock.resetCrossingState();
    if (this.ctx) {
      this.lastAudioTimeSec = this.ctx.currentTime;
    }
    if (this.ctx && this.ctx.state === 'running' && !this.isPaused) {
      this.startSourceNode(0, 0);
      this.pendingTrackStart = false;
    } else {
      this.pendingTrackStart = true;
    }
  }

  /**
   * Loads a decoded user or bundled track (`AudioBuffer` + `BeatMap`) immediately and starts
   * playback if the engine has already been unlocked by a user gesture.
   */
  loadTrack(beatMap: BeatMap, audioBuffer: AudioBuffer | null = null): void {
    this.stopOutgoingSource();
    this.stopSourceNode();
    this.crossfadeRemainingSec = 0;
    this.crossfadeTotalSec = 0;
    this.resetDubState();
    this.resetTunnelState();
    this.resetTapeWearState();
    this.beatClock.setBeatMap(beatMap);
    this.updateDubDelayTime();
    this.currentBuffer =
      audioBuffer ?? (this.ctx ? this.buildSynthFallbackBuffer(this.ctx, beatMap.bpm) : null);
    this.isSynthLoopBuffer = audioBuffer === null;
    this.virtualTrackSec = 0;

    if (
      this.ctx &&
      this.ctx.state === 'running' &&
      (!this.isPaused || (this.previewMode && this.previewPlaying))
    ) {
      if (this.previewMode) {
        this.applyPreviewFilterAndRate();
      }
      this.startSourceNode(0, this.previewMode ? 0.02 : 0);
      this.pendingTrackStart = false;
    } else {
      this.pendingTrackStart = true;
    }
  }

  /**
   * Swaps an on-demand hydrated `AudioBuffer` into the active track when it was previously
   * running on the procedural synth fallback (e.g. after LRU eviction & re-decode).
   */
  attachHydratedBuffer(beatMap: BeatMap, audioBuffer: AudioBuffer): void {
    if (this.beatClock.map.contentHash !== beatMap.contentHash || !this.isSynthLoopBuffer) {
      return;
    }
    this.currentBuffer = audioBuffer;
    this.isSynthLoopBuffer = false;
    if (
      this.ctx &&
      this.ctx.state === 'running' &&
      !this.isPaused &&
      (this.isPlaying || this.previewPlaying)
    ) {
      this.startSourceNode(this.virtualTrackSec, 0.025);
      this.pendingTrackStart = false;
    }
  }

  /**
   * Performs a crisp cassette-style cut / micro-crossfade from the currently playing track
   * into `beatMap` / `audioBuffer` so outgoing outro tails never clash with the incoming track.
   * Optionally accompanies stage forks with a procedural cassette `'scratch'` or `'rewind'` FX.
   *
   * Returns the outgoing fade duration in seconds.
   */
  crossfadeToTrack(
    beatMap: BeatMap,
    audioBuffer: AudioBuffer | null = null,
    crossfadeBars = 4,
    forceRestart = false,
    transitionStyle: ForkTransitionAudioStyle = 'none',
  ): number {
    void crossfadeBars;
    // Seamless single-track synth loop optimization:
    // If we are looping the exact same procedural synth loop, Web Audio's AudioBufferSourceNode
    // is already looping seamlessly (8-bar loop cleanly divides into 64-bar track duration).
    // Avoid tearing down the active source node or introducing clashing phase crossfades:
    // simply realign the virtual track clock and crossing states smoothly!
    if (
      this.isSynthLoopBuffer &&
      audioBuffer === null &&
      this.sourceNode &&
      this.isPlaying &&
      this.beatClock.map.contentHash === beatMap.contentHash
    ) {
      this.virtualTrackSec = 0;
      this.crossfadeRemainingSec = 0;
      this.crossfadeTotalSec = 0;
      this.resetTapeWearState();
      this.resetDubState();
      this.resetTunnelState();
      this.beatClock.resetCrossingState();
      this.triggerFilterBlip(0.5);
      if (transitionStyle !== 'none') {
        this.triggerForkTransitionFx(transitionStyle);
      }
      return 0;
    }

    // Avoid restarting an identical crossfade if already crossfading into this exact song (unless forceRestart is true)
    if (!forceRestart && this.isCrossfading && this.beatClock.map.contentHash === beatMap.contentHash) {
      return this.crossfadeTotalSec;
    }

    const outgoingFadeSec = 0.22;
    const incomingFadeSec = 0.04;
    this.crossfadeTotalSec = outgoingFadeSec;
    this.crossfadeRemainingSec = outgoingFadeSec;
    this.resetTapeWearState();
    this.resetDubState();
    this.resetTunnelState();

    this.beatClock.setBeatMap(beatMap);
    this.updateDubDelayTime();
    this.currentBuffer =
      audioBuffer ?? (this.ctx ? this.buildSynthFallbackBuffer(this.ctx, beatMap.bpm) : null);
    this.isSynthLoopBuffer = audioBuffer === null;
    this.virtualTrackSec = 0;

    if (this.ctx && this.filterNode && this.ctx.state === 'running' && !this.isPaused) {
      const now = this.ctx.currentTime;
      // Demote current active source to outgoing and cut cleanly over 220ms without looping back to 0:00
      this.stopOutgoingSource();
      if (this.sourceNode && this.sourceGainNode) {
        this.outgoingSourceNode = this.sourceNode;
        this.outgoingGainNode = this.sourceGainNode;
        this.outgoingSourceNode.loop = false;
        this.sourceNode = null;
        this.sourceGainNode = null;

        try {
          if (transitionStyle === 'scratch' && tuning.audioForkTransitionFx > 0.01) {
            this.outgoingSpinDownActive = true;
            this.outgoingSourceNode.playbackRate.cancelScheduledValues?.(now);
            this.outgoingSourceNode.playbackRate.setValueAtTime(
              Math.max(0.5, this.currentPlaybackRate),
              now,
            );
            this.outgoingSourceNode.playbackRate.exponentialRampToValueAtTime(
              0.42,
              now + outgoingFadeSec * 0.85,
            );
          }
          this.outgoingGainNode.gain.cancelScheduledValues(now);
          this.outgoingGainNode.gain.setValueAtTime(
            Math.max(0.01, this.outgoingGainNode.gain.value),
            now,
          );
          this.outgoingGainNode.gain.linearRampToValueAtTime(0.0001, now + outgoingFadeSec);
          this.outgoingSourceNode.stop(now + outgoingFadeSec + 0.03);
        } catch {
          this.stopOutgoingSource();
        }
      }

      // Start the incoming track at full musical impact with only a 40ms de-click micro-ramp
      this.startSourceNode(0, incomingFadeSec);
      this.triggerFilterBlip(0.9);
      if (transitionStyle !== 'none') {
        this.triggerForkTransitionFx(transitionStyle);
      }
      this.pendingTrackStart = false;
    } else {
      this.stopOutgoingSource();
      this.stopSourceNode();
      this.pendingTrackStart = true;
    }

    return outgoingFadeSec;
  }

  /**
   * Updates the BeatMap metadata (e.g. after user `×2`/`÷2`/nudge correction) and
   * rebuilds the procedural synth loop buffer when its BPM changes.
   */
  updateBeatMap(beatMap: BeatMap): void {
    const prevBpm = this.beatClock.map.bpm;
    this.beatClock.setBeatMap(beatMap);
    this.beatClock.resetCrossingState();
    this.updateDubDelayTime();
    if (this.isSynthLoopBuffer && this.ctx && Math.abs(beatMap.bpm - prevBpm) > 0.01) {
      this.currentBuffer = this.buildSynthFallbackBuffer(this.ctx, beatMap.bpm);
      const dur = Math.max(0.1, beatMap.durationSec);
      this.virtualTrackSec = this.virtualTrackSec % dur;
      this.beatClock.resetCrossingState();
      if ((this.isPlaying || this.previewPlaying) && this.ctx.state === 'running') {
        this.startSourceNode(this.virtualTrackSec, 0.015);
      }
    }
  }

  private updateDubDelayTime(): void {
    if (this.dubDelayNode && this.ctx) {
      const dottedEighthSec = Math.max(0.08, Math.min(1.5, beatDurationSec(this.beatClock.map) * 0.75));
      try {
        this.dubDelayNode.delayTime.setValueAtTime(dottedEighthSec, this.ctx.currentTime);
      } catch {
        this.dubDelayNode.delayTime.value = dottedEighthSec;
      }
    }
  }

  private resetDubState(): void {
    if (
      !this.outroLoopHolding &&
      !this.outroSourceFaded &&
      this.currentDubSend === 0 &&
      this.currentDubFeedback === 0 &&
      this.lastAppliedDubSend === 0 &&
      this.lastAppliedDubFeedback === 0 &&
      this.lastAppliedDubWet === 0
    ) {
      return;
    }
    this.outroLoopHolding = false;
    this.outroSourceFaded = false;
    this.currentDubSend = 0;
    this.currentDubFeedback = 0;
    this.lastAppliedDubSend = 0;
    this.lastAppliedDubFeedback = 0;
    this.lastAppliedDubWet = 0;
    if (this.ctx) {
      const now = this.ctx.currentTime;
      if (this.dubWetGain) {
        try {
          this.dubWetGain.gain.cancelScheduledValues(now);
          this.dubWetGain.gain.setValueAtTime(0, now);
        } catch {
          // Ignore scheduling errors on mocked/disposed AudioParam
        }
        this.dubWetGain.gain.value = 0;
      }
      if (this.dubSendGain) {
        try {
          this.dubSendGain.gain.cancelScheduledValues(now);
          this.dubSendGain.gain.setValueAtTime(0, now);
        } catch {
          this.dubSendGain.gain.value = 0;
        }
      }
      if (this.dubFeedbackGain) {
        try {
          this.dubFeedbackGain.gain.cancelScheduledValues(now);
          this.dubFeedbackGain.gain.setValueAtTime(0, now);
        } catch {
          this.dubFeedbackGain.gain.value = 0;
        }
      }
    }
  }

  private resetTunnelState(): void {
    this.wasInTunnel = false;
    this.tunnelEnvelope = 0;
    this.currentTunnelSend = 0;
    this.lastAppliedTunnelSend = 0;
    if (this.tunnelSendGain) {
      this.tunnelSendGain.gain.value = 0;
    }
  }

  /**
   * Triggers a zero-lag cassette pinch-roller pitch sag, filter muffle, and Wow & Flutter burst
   * (used on collisions, AGENTS.md §1 Pillar 2 & 3).
   */
  triggerPitchDip(depth = 0.14, muffle = 0.45): void {
    const clampedDepth = Math.min(0.35, Math.max(0, depth));
    const clampedMuffle = Math.min(0.75, Math.max(0, muffle));
    this.pitchDipTarget = Math.max(this.pitchDipTarget, clampedDepth);
    this.filterMuffleTarget = Math.max(this.filterMuffleTarget, clampedMuffle);

    // Immediate mechanical pinch-roller sag so collisions react in < 1 frame instead of 200ms later
    this.pitchDipEnvelope = Math.max(this.pitchDipEnvelope, clampedDepth * 0.85);
    this.filterMuffleEnvelope = Math.max(this.filterMuffleEnvelope, clampedMuffle * 0.85);
    const shockIntensity = Math.min(1, clampedDepth / 0.12);
    this.tapeShockEnvelope = Math.max(this.tapeShockEnvelope, shockIntensity);

    const immediateRate = Math.max(
      0.65,
      1.0 - this.offRoadEnvelope * tuning.audioOffRoadPitchDip - this.pitchDipEnvelope,
    );
    this.currentBasePlaybackRate = Math.min(this.currentBasePlaybackRate, immediateRate);
    this.currentPlaybackRate = this.currentBasePlaybackRate;

    if (this.ctx && this.ctx.state === 'running' && !this.isPaused) {
      if (
        this.sourceNode &&
        Math.abs(this.currentPlaybackRate - this.lastAppliedPlaybackRate) >= 0.001
      ) {
        this.sourceNode.playbackRate.value = this.currentPlaybackRate;
        this.lastAppliedPlaybackRate = this.currentPlaybackRate;
      }
      this.triggerTapeCrinkle(Math.min(1, clampedDepth / 0.1));
    }
  }

  /**
   * Triggers a brief resonant low-pass filter open blip (used on drops & perfect beat-shifts).
   */
  triggerFilterBlip(strength = 1): void {
    this.filterBlipBoost = Math.min(1.5, Math.max(this.filterBlipBoost, strength));
  }

  /**
   * Advances driving-reactive audio parameters and samples the master `BeatClock`.
   * All pitch and filter modulations use continuous progressive attack/release envelopes
   * so off-road excursions and bumps feel organic and analog rather than abrupt.
   */
  update(dt: number, driving: DrivingAudioParams): Readonly<BeatClockState> {
    if (this.isPaused) {
      if (this.ctx && this.ctx.state === 'running') {
        this.lastAudioTimeSec = this.ctx.currentTime;
      }
      const latencySec = this.getOutputLatencySec();
      const audibleTrackSec = Math.max(0, this.virtualTrackSec - latencySec);
      return this.beatClock.sample(audibleTrackSec);
    }

    if (this.crossfadeRemainingSec > 0) {
      this.crossfadeRemainingSec = Math.max(0, this.crossfadeRemainingSec - dt);
      if (this.crossfadeRemainingSec === 0) {
        this.stopOutgoingSource();
      }
    }

    // 1. Progressive off-road envelope (snappy entry when tires hit grass/gravel, smooth release back to road)
    const depthProgress = Math.max(0, Math.min(1, driving.offRoadDepth ?? 1));
    const rawOffRoadTarget = driving.isOffRoad ? depthProgress : 0;
    const offRoadRate = rawOffRoadTarget > this.offRoadEnvelope ? 14.0 : 4.5;
    this.offRoadEnvelope +=
      (rawOffRoadTarget - this.offRoadEnvelope) * (1 - Math.exp(-offRoadRate * dt));

    // 2. Progressive turntable pitch-dip & cassette shock envelopes (instant grab on impact, smooth recovery)
    this.tapeShockEnvelope *= Math.exp(-3.4 * dt);
    if (this.tapeShockEnvelope < 0.002) this.tapeShockEnvelope = 0;

    this.pitchDipTarget *= Math.exp(-3.4 * dt);
    if (this.pitchDipTarget < 0.002) this.pitchDipTarget = 0;
    const pitchEnvRate = this.pitchDipTarget > this.pitchDipEnvelope ? 40.0 : 3.2;
    this.pitchDipEnvelope +=
      (this.pitchDipTarget - this.pitchDipEnvelope) * (1 - Math.exp(-pitchEnvRate * dt));

    // 3. Progressive filter muffle, tunnel acoustic color & blip envelopes
    const inTunnel = driving.inTunnel === true;
    if (this.wasInTunnel && !inTunnel) {
      this.triggerFilterBlip(0.85);
    }
    this.wasInTunnel = inTunnel;
    const tunnelTarget = inTunnel ? 1 : 0;
    const tunnelRate = inTunnel ? 5.0 : 12.0;
    this.tunnelEnvelope += (tunnelTarget - this.tunnelEnvelope) * (1 - Math.exp(-tunnelRate * dt));
    if (!inTunnel && this.tunnelEnvelope < 0.002) {
      this.tunnelEnvelope = 0;
    }

    this.filterMuffleTarget *= Math.exp(-2.8 * dt);
    if (this.filterMuffleTarget < 0.002) this.filterMuffleTarget = 0;
    const muffleEnvRate = this.filterMuffleTarget > this.filterMuffleEnvelope ? 36.0 : 2.8;
    this.filterMuffleEnvelope +=
      (this.filterMuffleTarget - this.filterMuffleEnvelope) * (1 - Math.exp(-muffleEnvRate * dt));

    this.filterBlipBoost *= Math.exp(-4.5 * dt);

    // 4. Compute cassette Wow & Flutter + base playbackRate (1.0 on clean asphalt, immediate sag + warble on damage)
    const dur = Math.max(1, this.beatClock.map.durationSec);
    const audioSecRemaining = Math.max(0, dur - this.virtualTrackSec);
    const tapeDamage = Math.min(1, this.offRoadEnvelope * 0.85 + this.tapeShockEnvelope);
    let wowFlutterOffset = 0;
    let flutterWave = 0;
    if (tapeDamage > 0.002) {
      this.wowPhase = (this.wowPhase + dt * 2 * Math.PI * 2.35) % (Math.PI * 200);
      this.flutterPhase = (this.flutterPhase + dt * 2 * Math.PI * 18.5) % (Math.PI * 200);
      const wowWave =
        Math.sin(this.wowPhase) * 0.72 + Math.sin(this.wowPhase * 0.63 + 1.1) * 0.28;
      flutterWave =
        Math.sin(this.flutterPhase) * 0.65 + Math.sin(this.flutterPhase * 1.47 + 0.7) * 0.35;
      wowFlutterOffset =
        tapeDamage *
        (wowWave * tuning.audioTapeWowDepth + flutterWave * tuning.audioTapeFlutterDepth);
    } else {
      this.wowPhase = 0;
      this.flutterPhase = 0;
    }

    const offRoadDip = this.offRoadEnvelope * tuning.audioOffRoadPitchDip;
    const baseTargetRate = Math.max(0.65, 1.0 - offRoadDip - this.pitchDipEnvelope);
    const baseRateSpeed = baseTargetRate < this.currentBasePlaybackRate ? 28.0 : 7.5;
    this.currentBasePlaybackRate +=
      (baseTargetRate - this.currentBasePlaybackRate) * (1 - Math.exp(-baseRateSpeed * dt));
    this.currentPlaybackRate = Math.max(
      0.65,
      Math.min(1.12, this.currentBasePlaybackRate + wowFlutterOffset),
    );

    // Dub Tape Delay & Reverb Wash parameters (Stage 2, docs/OUTRO_EXTENSION_PROPOSALS.md)
    const twoBarsSec = 2 * barDurationSec(this.beatClock.map);
    const isPreOutroWindow = driving.holdOutroLoop === true && audioSecRemaining <= twoBarsSec;

    const targetDubSend = this.outroLoopHolding
      ? (this.isSynthLoopBuffer ? 0.45 : 0.0) // A traccia MP3 finita non immettiamo nuovo segnale dry: risuona la coda!
      : isPreOutroWindow
        ? 0.55 * (1 - audioSecRemaining / Math.max(0.1, twoBarsSec))
        : 0.0;

    const targetDubFeedback = this.outroLoopHolding
      ? tuning.outroDubDelayFeedback
      : isPreOutroWindow
        ? Math.min(0.68, tuning.outroDubDelayFeedback * 0.8)
        : 0.0;

    this.currentDubSend += (targetDubSend - this.currentDubSend) * (1 - Math.exp(-6.0 * dt));
    this.currentDubFeedback += (targetDubFeedback - this.currentDubFeedback) * (1 - Math.exp(-6.0 * dt));

    if (this.ctx) {
      const targetDubWet = isPreOutroWindow || this.outroLoopHolding ? 1.0 : 0.0;
      if (this.dubWetGain && this.lastAppliedDubWet !== targetDubWet) {
        this.dubWetGain.gain.value = targetDubWet;
        this.lastAppliedDubWet = targetDubWet;
      }
      if (this.dubSendGain && Math.abs(this.currentDubSend - this.lastAppliedDubSend) >= 0.002) {
        this.dubSendGain.gain.value = this.currentDubSend;
        this.lastAppliedDubSend = this.currentDubSend;
      }
      if (this.dubFeedbackGain && Math.abs(this.currentDubFeedback - this.lastAppliedDubFeedback) >= 0.002) {
        this.dubFeedbackGain.gain.value = this.currentDubFeedback;
        this.lastAppliedDubFeedback = this.currentDubFeedback;
      }
      if (this.dubFilterNode && Math.abs(tuning.outroDubFilterHz - this.lastAppliedDubFilterHz) >= 2.0) {
        this.dubFilterNode.frequency.value = tuning.outroDubFilterHz;
        this.lastAppliedDubFilterHz = tuning.outroDubFilterHz;
      }
      this.currentTunnelSend = 0.14 * this.tunnelEnvelope;
      if (
        this.tunnelSendGain &&
        (Math.abs(this.currentTunnelSend - this.lastAppliedTunnelSend) >= 0.002 ||
          (this.currentTunnelSend === 0 && this.lastAppliedTunnelSend !== 0))
      ) {
        this.tunnelSendGain.gain.value = this.currentTunnelSend;
        this.lastAppliedTunnelSend = this.currentTunnelSend;
      }
    }

    // 5. Advance track time from AudioContext clock (with output latency compensation)
    if (this.ctx && this.isPlaying && this.ctx.state === 'running') {
      const nowAudio = this.ctx.currentTime;
      const rawElapsed = Math.max(0, nowAudio - this.lastAudioTimeSec);
      // Clamp elapsed audio delta to 150ms on resume to absorb OS audio wake hitch; clamp to 350ms during steady state
      const maxElapsed = this.justResumed ? 0.15 : 0.35;
      const elapsedAudio = Math.min(rawElapsed, maxElapsed);
      this.justResumed = false;
      this.lastAudioTimeSec = nowAudio;
      this.virtualTrackSec += elapsedAudio * this.currentPlaybackRate;

      if (this.virtualTrackSec >= dur) {
        this.handleTrackEndWrap(dur, driving.holdOutroLoop === true);
      } else if (!driving.holdOutroLoop) {
        this.resetDubState();
      }
    } else {
      this.virtualTrackSec += dt * this.currentPlaybackRate;
      if (this.virtualTrackSec >= dur) {
        this.handleTrackEndWrap(dur, driving.holdOutroLoop === true);
      } else if (!driving.holdOutroLoop) {
        this.resetDubState();
      }
    }

    const latencySec = this.getOutputLatencySec();
    const audibleTrackSec = Math.max(0, this.virtualTrackSec - latencySec);
    const clockState = this.beatClock.sample(audibleTrackSec);

    // Trigger automatic filter excitement on genuine musical impact bars
    if (clockState.justCrossedBar && clockState.isImpactBar) {
      this.triggerFilterBlip(0.8);
    }

    // 6. Compute speed + drift + progressive off-road/muffle low-pass filter cutoff (Hz)
    const minHz = tuning.audioFilterMinHz;
    const maxHz = tuning.audioFilterMaxHz;
    const speedCurve = Math.pow(Math.max(0, Math.min(1, driving.speedRatio)), 1.35);
    const driftBoost = driving.isDrifting ? 0.24 : 0;
    const offRoadMuffle = -0.32 * this.offRoadEnvelope;
    const impactMuffle = -this.filterMuffleEnvelope;
    const flutterMuffle = -0.08 * tapeDamage * (0.5 + 0.5 * flutterWave);
    const tunnelMuffle = -0.07 * this.tunnelEnvelope;
    const introMuffle = clockState.sectionRole === 'intro' ? -0.18 : 0;
    const blip = this.filterBlipBoost * 0.3;

    const openness = Math.max(
      0,
      Math.min(
        1,
        speedCurve +
          driftBoost +
          offRoadMuffle +
          impactMuffle +
          flutterMuffle +
          tunnelMuffle +
          introMuffle +
          blip,
      ),
    );
    let targetCutoff = minHz * Math.pow(maxHz / Math.max(100, minHz), openness);
    if (this.outroLoopHolding) {
      targetCutoff = Math.min(targetCutoff, tuning.outroDubFilterHz * 1.35);
    }

    // Apply musical off-road / impact floor cap: ensure the filter remains stylish and never drops into brutal underwater sludge
    if (this.offRoadEnvelope > 0.001 || this.filterMuffleEnvelope > 0.001) {
      const activeFloor = Math.max(minHz, tuning.audioFilterOffRoadFloorHz);
      const muffleIntensity = Math.max(this.offRoadEnvelope, this.filterMuffleEnvelope);
      const dynamicFloor = minHz + (activeFloor - minHz) * muffleIntensity;
      targetCutoff = Math.max(dynamicFloor, targetCutoff);
    }

    const cutoffRate = targetCutoff < this.currentCutoffHz ? 16.0 : 5.5;
    this.currentCutoffHz +=
      (targetCutoff - this.currentCutoffHz) * (1 - Math.exp(-cutoffRate * dt));
    const targetQ =
      (driving.isDrifting ? tuning.audioFilterDriftQ : 1.6) + 0.85 * this.tunnelEnvelope;
    this.currentQ += (targetQ - this.currentQ) * (1 - Math.exp(-8.0 * dt));

    // 7. Apply already-smoothed parameters to Web Audio nodes via direct `.value` assignment
    // (uses perceptual delta thresholds to eliminate AudioParam IPC bus saturations during sweeps)
    if (this.ctx && this.filterNode && this.sourceNode && this.ctx.state === 'running') {
      const minCutoffDelta = Math.max(6.0, this.currentCutoffHz * 0.005);
      if (Math.abs(this.currentCutoffHz - this.lastAppliedCutoffHz) >= minCutoffDelta) {
        this.filterNode.frequency.value = this.currentCutoffHz;
        this.lastAppliedCutoffHz = this.currentCutoffHz;
      }
      if (Math.abs(this.currentQ - this.lastAppliedQ) >= 0.02) {
        this.filterNode.Q.value = this.currentQ;
        this.lastAppliedQ = this.currentQ;
      }
      if (Math.abs(this.currentPlaybackRate - this.lastAppliedPlaybackRate) >= 0.001) {
        this.sourceNode.playbackRate.value = this.currentPlaybackRate;
        if (this.outgoingSourceNode && !this.outgoingSpinDownActive) {
          this.outgoingSourceNode.playbackRate.value = this.currentPlaybackRate;
        }
        this.lastAppliedPlaybackRate = this.currentPlaybackRate;
      }
      const targetDropoutGain =
        tapeDamage > 0.01
          ? Math.max(0.76, 1.0 - tapeDamage * (0.09 + 0.07 * Math.max(0, flutterWave)))
          : 1.0;
      if (
        this.tapeDropoutGain &&
        (Math.abs(targetDropoutGain - this.lastAppliedDropoutGain) >= 0.004 ||
          (targetDropoutGain === 1.0 && this.lastAppliedDropoutGain !== 1.0))
      ) {
        this.tapeDropoutGain.gain.value = targetDropoutGain;
        this.lastAppliedDropoutGain = targetDropoutGain;
      }
    }

    return clockState;
  }

  /**
   * Maps a DOM event timestamp (`KeyboardEvent.timeStamp`, in `performance.now()` ms)
   * to the audible track clock and judges its beat alignment (AGENTS.md §4.8).
   */
  judgeInputTimestamp(eventTimeStampMs: number): BeatJudgement {
    const useWallClockAge =
      this.ctx !== null && this.isPlaying && this.ctx.state === 'running';
    const nowPerfMs = typeof performance !== 'undefined' ? performance.now() : eventTimeStampMs;
    const ageSec = useWallClockAge ? Math.max(0, (nowPerfMs - eventTimeStampMs) / 1000) : 0;
    const latencySec = this.getOutputLatencySec();
    const eventTrackSec = Math.max(
      0,
      this.virtualTrackSec - latencySec - ageSec * this.currentPlaybackRate,
    );
    return this.beatClock.judgeTrackTime(eventTrackSec, {
      perfectMs: tuning.shiftPerfectMs,
      goodMs: tuning.shiftGoodMs,
    });
  }

  dispose(): void {
    this.stopOutgoingSource();
    this.stopSourceNode();
    this.resetTunnelState();
    this.resetTapeWearState();
    if (this.tapeDropoutGain) {
      try { this.tapeDropoutGain.disconnect(); } catch { /* ignore */ }
      this.tapeDropoutGain = null;
    }
    this.noiseBuffer = null;
    if (this.dubSendGain) {
      try { this.dubSendGain.disconnect(); } catch { /* ignore */ }
      this.dubSendGain = null;
    }
    if (this.dubDelayNode) {
      try { this.dubDelayNode.disconnect(); } catch { /* ignore */ }
      this.dubDelayNode = null;
    }
    if (this.dubFilterNode) {
      try { this.dubFilterNode.disconnect(); } catch { /* ignore */ }
      this.dubFilterNode = null;
    }
    if (this.dubFeedbackGain) {
      try { this.dubFeedbackGain.disconnect(); } catch { /* ignore */ }
      this.dubFeedbackGain = null;
    }
    if (this.dubWetGain) {
      try { this.dubWetGain.disconnect(); } catch { /* ignore */ }
      this.dubWetGain = null;
    }
    if (this.tunnelSendGain) {
      try { this.tunnelSendGain.disconnect(); } catch { /* ignore */ }
      this.tunnelSendGain = null;
    }
    if (this.tunnelDelayNode) {
      try { this.tunnelDelayNode.disconnect(); } catch { /* ignore */ }
      this.tunnelDelayNode = null;
    }
    if (this.tunnelFilterNode) {
      try { this.tunnelFilterNode.disconnect(); } catch { /* ignore */ }
      this.tunnelFilterNode = null;
    }
    if (this.tunnelFeedbackGain) {
      try { this.tunnelFeedbackGain.disconnect(); } catch { /* ignore */ }
      this.tunnelFeedbackGain = null;
    }
    this.suspendPromise = null;
    if (this.ctx) {
      void this.ctx.close();
      this.ctx = null;
    }
  }

  private handleTrackEndWrap(dur: number, holdOutroLoop: boolean): void {
    if (holdOutroLoop) {
      // NESSUN SALTO INDIETRO DI 8 BATTUTE! (docs/OUTRO_EXTENSION_PROPOSALS.md)
      // Attiva lo Stadio 2 (Dub Tape Delay Hold): virtualTrackSec continua ad avanzare
      // linearmente così BeatClock mantiene il battito costante fino al bivio.
      this.outroLoopHolding = true;
      if (
        !this.outroSourceFaded &&
        !this.isSynthLoopBuffer &&
        this.ctx &&
        this.sourceGainNode &&
        this.ctx.state === 'running'
      ) {
        // Sfuma il buffer dry dell'MP3 per evitare che `src.loop = true` riparta dall'intro
        const now = this.ctx.currentTime;
        this.outroSourceFaded = true;
        try {
          this.sourceGainNode.gain.cancelScheduledValues(now);
          this.sourceGainNode.gain.setValueAtTime(
            Math.max(0.01, this.sourceGainNode.gain.value),
            now,
          );
          this.sourceGainNode.gain.linearRampToValueAtTime(0.0001, now + 0.25);
        } catch {
          // Ignore scheduling errors on disposed/mocked nodes
        }
      }
    } else {
      this.virtualTrackSec %= dur;
      this.resetDubState();
      this.beatClock.resetCrossingState();
      if (this.ctx && this.ctx.state === 'running' && !this.isSynthLoopBuffer) {
        this.startSourceNode(this.virtualTrackSec, 0.04);
      }
    }
  }

  private getOutputLatencySec(): number {
    if (!this.ctx) return 0;
    const now = this.ctx.currentTime;
    if (now - this.lastLatencyCheckSec < 0.5 && this.lastLatencyCheckSec >= 0) {
      return this.cachedLatencySec;
    }
    this.lastLatencyCheckSec = now;
    const base = (this.ctx as AudioContext & { baseLatency?: number }).baseLatency ?? 0;
    const output = (this.ctx as AudioContext & { outputLatency?: number }).outputLatency ?? 0;
    if (typeof this.ctx.getOutputTimestamp === 'function') {
      const ts = this.ctx.getOutputTimestamp();
      if (ts.contextTime && ts.contextTime > 0 && now >= ts.contextTime) {
        this.cachedLatencySec = Math.min(0.25, now - ts.contextTime + base);
        return this.cachedLatencySec;
      }
    }
    this.cachedLatencySec = Math.min(0.25, base + output);
    return this.cachedLatencySec;
  }

  private startSourceNode(offsetSec: number, fadeInSec = 0): void {
    if (!this.ctx || !this.filterNode) return;
    this.stopSourceNode();

    let buffer = this.currentBuffer;
    if (!buffer) {
      buffer = this.buildSynthFallbackBuffer(this.ctx, this.beatClock.map.bpm);
      this.currentBuffer = buffer;
      this.isSynthLoopBuffer = true;
    }

    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = this.isSynthLoopBuffer;
    if (this.isSynthLoopBuffer) {
      src.loopStart = 0;
      src.loopEnd = buffer.duration;
    }

    const srcGain = this.ctx.createGain();
    const now = this.ctx.currentTime;
    if (fadeInSec > 0) {
      srcGain.gain.setValueAtTime(0.01, now);
      srcGain.gain.linearRampToValueAtTime(1.0, now + fadeInSec);
    } else {
      srcGain.gain.setValueAtTime(1.0, now);
    }

    src.playbackRate.value = this.currentPlaybackRate;
    src.connect(srcGain);
    srcGain.connect(this.filterNode);

    const safeOffset = buffer.duration > 0 ? offsetSec % buffer.duration : 0;
    src.start(0, safeOffset);

    this.sourceNode = src;
    this.sourceGainNode = srcGain;
    this.lastAudioTimeSec = now;
    this.virtualTrackSec = offsetSec;
    this.isPlaying = true;
  }

  private stopSourceNode(): void {
    if (this.sourceNode) {
      try {
        this.sourceNode.onended = null;
        this.sourceNode.stop();
        this.sourceNode.disconnect();
      } catch {
        // Ignore if already stopped
      }
      this.sourceNode = null;
    }
    if (this.sourceGainNode) {
      try {
        this.sourceGainNode.disconnect();
      } catch {
        // Ignore
      }
      this.sourceGainNode = null;
    }
    this.isPlaying = false;
  }

  private stopOutgoingSource(): void {
    this.outgoingSpinDownActive = false;
    if (this.outgoingSourceNode) {
      try {
        this.outgoingSourceNode.onended = null;
        this.outgoingSourceNode.stop();
        this.outgoingSourceNode.disconnect();
      } catch {
        // Ignore if already stopped
      }
      this.outgoingSourceNode = null;
    }
    if (this.outgoingGainNode) {
      try {
        this.outgoingGainNode.disconnect();
      } catch {
        // Ignore
      }
      this.outgoingGainNode = null;
    }
  }

  private resetTapeWearState(): void {
    this.offRoadEnvelope = 0;
    this.pitchDipEnvelope = 0;
    this.pitchDipTarget = 0;
    this.filterMuffleEnvelope = 0;
    this.filterMuffleTarget = 0;
    this.tapeShockEnvelope = 0;
    this.wowPhase = 0;
    this.flutterPhase = 0;
    this.currentBasePlaybackRate = 1.0;
    this.currentPlaybackRate = 1.0;
    this.lastAppliedPlaybackRate = 1.0;
    this.lastAppliedDropoutGain = 1.0;
    if (this.tapeDropoutGain) {
      this.tapeDropoutGain.gain.value = 1.0;
    }
  }

  private buildCassetteNoiseBuffer(ctx: AudioContext): AudioBuffer | null {
    if (typeof ctx.createBuffer !== 'function') return null;
    try {
      const sr = Math.max(8000, ctx.sampleRate || 44100);
      const length = Math.max(512, Math.floor(sr * 0.35));
      const buf = ctx.createBuffer(1, length, sr);
      const data = buf.getChannelData(0);
      let seed = 0x5f3759df;
      for (let i = 0; i < length; i++) {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        data[i] = (seed / 0xffffffff) * 2 - 1;
      }
      return buf;
    } catch {
      return null;
    }
  }

  private triggerTapeCrinkle(intensity: number): void {
    if (
      intensity <= 0.05 ||
      !this.ctx ||
      !this.masterGain ||
      this.ctx.state !== 'running' ||
      typeof this.ctx.createOscillator !== 'function' ||
      typeof this.ctx.createBiquadFilter !== 'function'
    ) {
      return;
    }
    const now = this.ctx.currentTime;
    const peak = Math.min(0.085, 0.055 * intensity);
    try {
      const osc = this.ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(1450, now);
      osc.frequency.exponentialRampToValueAtTime(480, now + 0.075);

      const bp = this.ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.setValueAtTime(2100, now);
      bp.Q.setValueAtTime(2.6, now);

      const env = this.ctx.createGain();
      env.gain.setValueAtTime(0.0001, now);
      env.gain.linearRampToValueAtTime(peak, now + 0.006);
      env.gain.exponentialRampToValueAtTime(0.0001, now + 0.08);

      osc.connect(bp);
      bp.connect(env);
      env.connect(this.masterGain);
      osc.onended = () => {
        try {
          osc.disconnect();
          bp.disconnect();
          env.disconnect();
        } catch {
          // Ignore disconnect errors in mock contexts
        }
      };
      osc.start(now);
      osc.stop(now + 0.085);
    } catch {
      // Ignore scheduling errors in mock contexts
    }
  }

  private triggerForkTransitionFx(style: Exclude<ForkTransitionAudioStyle, 'none'>): void {
    const fxLevel = Math.max(0, Math.min(1, tuning.audioForkTransitionFx));
    if (fxLevel < 0.01 || !this.ctx || !this.masterGain || this.ctx.state !== 'running') {
      return;
    }
    const now = this.ctx.currentTime;
    const isRewind = style === 'rewind';

    if (this.noiseBuffer && typeof this.ctx.createBiquadFilter === 'function') {
      try {
        const noiseSrc = this.ctx.createBufferSource();
        noiseSrc.buffer = this.noiseBuffer;
        const bp = this.ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.Q.setValueAtTime(isRewind ? 2.4 : 3.0, now);
        if (isRewind) {
          bp.frequency.setValueAtTime(1400, now);
          bp.frequency.exponentialRampToValueAtTime(3800, now + 0.09);
          bp.frequency.exponentialRampToValueAtTime(1900, now + 0.21);
        } else {
          bp.frequency.setValueAtTime(3400, now);
          bp.frequency.exponentialRampToValueAtTime(950, now + 0.15);
        }

        const nGain = this.ctx.createGain();
        const peak = (isRewind ? 0.11 : 0.13) * fxLevel;
        const endSec = isRewind ? 0.21 : 0.15;
        nGain.gain.setValueAtTime(0.0001, now);
        nGain.gain.linearRampToValueAtTime(Math.max(0.0002, peak), now + (isRewind ? 0.012 : 0.008));
        nGain.gain.exponentialRampToValueAtTime(0.0001, now + endSec);

        noiseSrc.connect(bp);
        bp.connect(nGain);
        nGain.connect(this.masterGain);
        noiseSrc.onended = () => {
          try {
            noiseSrc.disconnect();
            bp.disconnect();
            nGain.disconnect();
          } catch {
            // Ignore disconnect errors in mock contexts
          }
        };
        noiseSrc.start(now);
        noiseSrc.stop(now + endSec + 0.015);
      } catch {
        // Ignore scheduling errors in mock contexts
      }
    }

    if (typeof this.ctx.createOscillator === 'function') {
      try {
        const osc = this.ctx.createOscillator();
        const oGain = this.ctx.createGain();
        osc.type = isRewind ? 'triangle' : 'sawtooth';
        const oscEnd = isRewind ? 0.2 : 0.14;
        if (isRewind) {
          osc.frequency.setValueAtTime(900, now);
          osc.frequency.exponentialRampToValueAtTime(2500, now + 0.085);
          osc.frequency.exponentialRampToValueAtTime(1300, now + oscEnd);
        } else {
          osc.frequency.setValueAtTime(620, now);
          osc.frequency.exponentialRampToValueAtTime(180, now + oscEnd);
        }

        const oscPeak = (isRewind ? 0.055 : 0.06) * fxLevel;
        oGain.gain.setValueAtTime(0.0001, now);
        oGain.gain.linearRampToValueAtTime(Math.max(0.0002, oscPeak), now + (isRewind ? 0.012 : 0.008));
        oGain.gain.exponentialRampToValueAtTime(0.0001, now + oscEnd);

        if (!isRewind && typeof this.ctx.createBiquadFilter === 'function') {
          const lp = this.ctx.createBiquadFilter();
          lp.type = 'lowpass';
          lp.frequency.setValueAtTime(1800, now);
          osc.connect(lp);
          lp.connect(oGain);
          oGain.connect(this.masterGain);
          osc.onended = () => {
            try {
              osc.disconnect();
              lp.disconnect();
              oGain.disconnect();
            } catch {
              // Ignore
            }
          };
        } else {
          osc.connect(oGain);
          oGain.connect(this.masterGain);
          osc.onended = () => {
            try {
              osc.disconnect();
              oGain.disconnect();
            } catch {
              // Ignore
            }
          };
        }
        osc.start(now);
        osc.stop(now + oscEnd + 0.02);
      } catch {
        // Ignore scheduling errors in mock contexts
      }
    }
  }

  private buildSynthFallbackBuffer(ctx: AudioContext, bpm: number): AudioBuffer {
    return getOrBuildSynthFallbackBuffer(ctx, bpm, 8);
  }
}

export { barDurationSec, beatDurationSec };
