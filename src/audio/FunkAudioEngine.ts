import { tuning } from '@src/config/tuning';
import {
  BeatClock,
  type BeatClockState,
  type BeatJudgement,
  type BeatJudgementTier,
} from './BeatClock';
import { barDurationSec, beatDurationSec, type BeatMap, type BeatSection } from './BeatMap';

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
  title: 'Midnight Wangan 88 (Synth VIP)',
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
});

/**
 * Bundled Stage 3 Track BeatMap (118 BPM, 64 bars = ~130.2 s) for Coastal Breeze stage.
 */
export const BUNDLED_COASTAL_BEATMAP: BeatMap = createBundledTrackBeatMap({
  contentHash: 'sha256:bundled-coastal-breeze-118bpm',
  title: 'Melon Soda Sunset (Synth Mix)',
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
    title: 'Neon Horizon (Synth Fallback)',
    artist: 'OutRun FM 88.4',
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
  });
}

function createBundledTrackBeatMap(params: {
  contentHash: string;
  title: string;
  artist: string;
  bpm: number;
  sections: BeatSection[];
}): BeatMap {
  const { contentHash, title, artist, bpm, sections } = params;
  const beatsPerBar = 4;
  const totalBars = sections.reduce((sum, s) => sum + s.bars, 0);
  const durationSec = Math.round(totalBars * ((60 / bpm) * beatsPerBar) * 1000) / 1000;

  const roleEnergy: Record<BeatSection['role'], number> = {
    intro: 0.34,
    build: 0.62,
    drop: 0.92,
    breakdown: 0.42,
    outro: 0.3,
  };

  const barEnergy: number[] = new Array<number>(totalBars).fill(0.5);
  for (const sec of sections) {
    for (let i = 0; i < sec.bars; i++) {
      const b = sec.startBar + i;
      if (b < totalBars) {
        const ramp = sec.role === 'build' ? (i / Math.max(1, sec.bars - 1)) * 0.25 : 0;
        barEnergy[b] = Math.min(1, Math.round((roleEnergy[sec.role] + ramp) * 100) / 100);
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
   * True when the player has fallen behind the song on a multi-track stage so the DJ
   * loops the final 8 outro bars until the player reaches the fork (docs/DESIGN.md §3).
   */
  holdOutroLoop?: boolean;
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
  private masterGain: GainNode | null = null;

  private sourceNode: AudioBufferSourceNode | null = null;
  private sourceGainNode: GainNode | null = null;
  private outgoingSourceNode: AudioBufferSourceNode | null = null;
  private outgoingGainNode: GainNode | null = null;

  private currentBuffer: AudioBuffer | null = null;
  private isSynthLoopBuffer = true;

  private isPlaying = false;
  private isPaused = false;
  private pendingTrackStart = false;
  private resumeId = 0;
  private justResumed = false;
  private currentCutoffHz = 2400;
  private currentQ = 1.6;
  private currentPlaybackRate = 1.0;
  private lastAppliedCutoffHz = -1;
  private lastAppliedQ = -1;
  private lastAppliedPlaybackRate = -1;
  private cachedLatencySec = 0;
  private lastLatencyCheckSec = -10;

  /** Accumulated virtual track position (seconds) accounting for variable playbackRate. */
  private virtualTrackSec = 0;
  private lastAudioTimeSec = 0;

  /** 4-bar DJ crossfade state (M6). */
  private crossfadeRemainingSec = 0;
  private crossfadeTotalSec = 0;
  private outroLoopHolding = false;

  /** Progressive attack/release envelope for turntable pitch dips (collisions/shocks). */
  private pitchDipTarget = 0;
  private pitchDipEnvelope = 0;

  /** Progressive attack/release envelope for off-road immersion [0, 1]. */
  private offRoadEnvelope = 0;

  /** Progressive attack/release envelope for filter muffle on collisions/spills. */
  private filterMuffleTarget = 0;
  private filterMuffleEnvelope = 0;

  /** Momentary filter blip boost (e.g. on beat-matched shifts or drops). */
  private filterBlipBoost = 0;

  constructor(initialBeatMap: BeatMap = DEFAULT_SYNTH_BEATMAP) {
    this.beatClock = new BeatClock(initialBeatMap);
  }

  get unlocked(): boolean {
    return this.ctx !== null && this.ctx.state === 'running';
  }

  get beatMap(): BeatMap {
    return this.beatClock.map;
  }

  get cutoffHz(): number {
    return Math.round(this.currentCutoffHz);
  }

  get playbackRate(): number {
    return this.currentPlaybackRate;
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

  setVolume(volume: number): void {
    const clamped = Math.max(0, Math.min(1, volume));
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(clamped, this.ctx.currentTime, 0.02);
    }
  }

  get paused(): boolean {
    return this.isPaused;
  }

  /**
   * Freezes audio playback, suspends the Web Audio context, and halts BeatClock advancement
   * (AGENTS.md §5 M8 tab-visibility & pause handling).
   */
  async pause(): Promise<void> {
    if (this.isPaused) return;
    this.isPaused = true;
    this.resumeId++;
    if (this.ctx) {
      this.lastAudioTimeSec = this.ctx.currentTime;
      if (this.ctx.state === 'running') {
        try {
          await this.ctx.suspend();
        } catch {
          // Ignore suspend failure in test/unsupported environments
        }
      }
    }
  }

  /**
   * Resumes Web Audio context and resynchronizes the clock without time drift.
   */
  async resume(): Promise<void> {
    if (!this.isPaused) return;
    this.isPaused = false;
    const currentResumeId = ++this.resumeId;

    if (this.ctx && this.ctx.state === 'suspended') {
      try {
        await this.ctx.resume();
      } catch {
        // Ignore resume failure
      }
    }

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
      this.lastAudioTimeSec = ctx.currentTime;
    }

    if (this.ctx.state === 'suspended') {
      await this.ctx.resume();
    }

    if (this.ctx) {
      this.lastAudioTimeSec = this.ctx.currentTime;
    }

    if (!this.isPaused && (this.pendingTrackStart || (!this.isPlaying && this.ctx.state === 'running'))) {
      this.startSourceNode(this.virtualTrackSec, 0);
      this.pendingTrackStart = false;
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
    this.outroLoopHolding = false;
    this.beatClock.setBeatMap(beatMap);
    this.currentBuffer = audioBuffer;
    this.isSynthLoopBuffer = audioBuffer === null;
    this.virtualTrackSec = 0;

    if (this.ctx && this.ctx.state === 'running' && !this.isPaused) {
      this.startSourceNode(0, 0);
      this.pendingTrackStart = false;
    } else {
      this.pendingTrackStart = true;
    }
  }

  /**
   * Performs a 4-bar DJ crossfade from the currently playing track into `beatMap` / `audioBuffer`
   * (docs/DESIGN.md §3, AGENTS.md §5 M6).
   *
   * Returns the crossfade duration in seconds.
   */
  crossfadeToTrack(
    beatMap: BeatMap,
    audioBuffer: AudioBuffer | null = null,
    crossfadeBars = 4,
    forceRestart = false,
  ): number {
    // Avoid restarting an identical crossfade if already crossfading into this exact song (unless forceRestart is true)
    if (!forceRestart && this.isCrossfading && this.beatClock.map.contentHash === beatMap.contentHash) {
      return this.crossfadeTotalSec;
    }

    const fadeDurSec = Math.max(2.0, Math.min(10.0, crossfadeBars * barDurationSec(beatMap)));
    this.crossfadeTotalSec = fadeDurSec;
    this.crossfadeRemainingSec = fadeDurSec;
    this.outroLoopHolding = false;

    this.beatClock.setBeatMap(beatMap);
    this.currentBuffer = audioBuffer;
    this.isSynthLoopBuffer = audioBuffer === null;
    this.virtualTrackSec = 0;

    if (this.ctx && this.filterNode && this.ctx.state === 'running' && !this.isPaused) {
      const now = this.ctx.currentTime;
      // Demote current active source to outgoing and ramp its gain down over 4 bars
      this.stopOutgoingSource();
      if (this.sourceNode && this.sourceGainNode) {
        this.outgoingSourceNode = this.sourceNode;
        this.outgoingGainNode = this.sourceGainNode;
        this.sourceNode = null;
        this.sourceGainNode = null;

        try {
          this.outgoingGainNode.gain.cancelScheduledValues(now);
          this.outgoingGainNode.gain.setValueAtTime(
            Math.max(0.01, this.outgoingGainNode.gain.value),
            now,
          );
          this.outgoingGainNode.gain.linearRampToValueAtTime(0.0001, now + fadeDurSec);
          this.outgoingSourceNode.stop(now + fadeDurSec + 0.05);
        } catch {
          this.stopOutgoingSource();
        }
      }

      // Start the incoming track ramping from 0 -> 1 over `fadeDurSec`
      this.startSourceNode(0, fadeDurSec);
      this.triggerFilterBlip(0.9);
      this.pendingTrackStart = false;
    } else {
      this.stopOutgoingSource();
      this.stopSourceNode();
      this.pendingTrackStart = true;
    }

    return fadeDurSec;
  }

  /**
   * Updates the BeatMap metadata (e.g. after user `×2`/`÷2`/nudge correction) without
   * restarting the audio buffer playback.
   */
  updateBeatMap(beatMap: BeatMap): void {
    this.beatClock.setBeatMap(beatMap);
  }

  /**
   * Triggers a progressive turntable pitch sag and filter muffle (used on collisions, AGENTS.md §1 Pillar 2 & 3).
   */
  triggerPitchDip(depth = 0.14, muffle = 0.45): void {
    this.pitchDipTarget = Math.max(this.pitchDipTarget, Math.min(0.35, depth));
    this.filterMuffleTarget = Math.max(this.filterMuffleTarget, Math.min(0.75, muffle));
  }

  /**
   * Triggers a brief resonant low-pass filter open blip (used on drops & perfect beat-shifts).
   */
  triggerFilterBlip(strength = 1): void {
    this.filterBlipBoost = Math.min(1.5, Math.max(this.filterBlipBoost, strength));
  }

  /**
   * Plays a synthesized gear-shift cue and opens the filter on beat-matched shifts (M5).
   */
  triggerShiftSound(tier: BeatJudgementTier, isDownbeat: boolean): void {
    if (tier === 'PERFECT') {
      this.triggerFilterBlip(isDownbeat ? 1.15 : 0.85);
    } else if (tier === 'GOOD') {
      this.triggerFilterBlip(0.5);
    }

    if (!this.ctx || !this.masterGain || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = tier === 'OFF' ? 'triangle' : 'sine';

    const baseFreq = tier === 'PERFECT' ? (isDownbeat ? 880 : 659.25) : tier === 'GOOD' ? 523.25 : 220;
    osc.frequency.setValueAtTime(baseFreq, now);
    osc.frequency.exponentialRampToValueAtTime(baseFreq * (tier === 'OFF' ? 0.85 : 1.5), now + 0.09);

    gain.gain.setValueAtTime(tier === 'OFF' ? 0.05 : 0.12, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.11);

    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.12);
  }

  /**
   * Plays a synthesized fizzy soda splash + ice-cube glass `clink!` and smooth filter duck
   * when Melon Soda spills in Tofu Mode (docs/DESIGN.md §5.1).
   */
  triggerSodaSpillSound(): void {
    this.filterMuffleTarget = Math.max(this.filterMuffleTarget, 0.38);
    if (!this.ctx || !this.masterGain || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;

    // High metallic glass + ice cube "clink!" (dual sine ping)
    const freqs = [2350, 3120];
    for (let i = 0; i < freqs.length; i++) {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      const t0 = now + i * 0.045;
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freqs[i]!, t0);
      osc.frequency.exponentialRampToValueAtTime(freqs[i]! * 1.12, t0 + 0.08);
      gain.gain.setValueAtTime(0.14, t0);
      gain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.09);
      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(t0);
      osc.stop(t0 + 0.1);
    }
  }

  /**
   * Plays a synthesized retro thud and triggers a progressive turntable pitch sag on obstacle/traffic bump.
   */
  triggerCollisionSound(obstacle: 'prop' | 'traffic'): void {
    this.triggerPitchDip(
      obstacle === 'traffic' ? 0.08 : 0.025,
      obstacle === 'traffic' ? 0.35 : 0.18,
    );

    if (!this.ctx || !this.masterGain || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(obstacle === 'traffic' ? 120 : 90, now);
    osc.frequency.exponentialRampToValueAtTime(36, now + 0.12);

    gain.gain.setValueAtTime(obstacle === 'traffic' ? 0.12 : 0.07, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.13);

    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.14);
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

    // 1. Progressive off-road envelope (smooth ramp-in as car enters grass, smooth release back to road)
    const depthProgress = Math.max(0, Math.min(1, driving.offRoadDepth ?? 1));
    const rawOffRoadTarget = driving.isOffRoad ? depthProgress : 0;
    const offRoadRate = rawOffRoadTarget > this.offRoadEnvelope ? 2.6 : 2.0;
    this.offRoadEnvelope +=
      (rawOffRoadTarget - this.offRoadEnvelope) * (1 - Math.exp(-offRoadRate * dt));

    // 2. Progressive turntable pitch-dip envelope (smooth sag on impact, vinyl torque recovery)
    this.pitchDipTarget *= Math.exp(-2.8 * dt);
    if (this.pitchDipTarget < 0.002) this.pitchDipTarget = 0;
    const pitchEnvRate = this.pitchDipTarget > this.pitchDipEnvelope ? 7.5 : 2.8;
    this.pitchDipEnvelope +=
      (this.pitchDipTarget - this.pitchDipEnvelope) * (1 - Math.exp(-pitchEnvRate * dt));

    // 3. Progressive filter muffle & blip envelopes
    this.filterMuffleTarget *= Math.exp(-2.5 * dt);
    if (this.filterMuffleTarget < 0.002) this.filterMuffleTarget = 0;
    const muffleEnvRate = this.filterMuffleTarget > this.filterMuffleEnvelope ? 6.5 : 2.4;
    this.filterMuffleEnvelope +=
      (this.filterMuffleTarget - this.filterMuffleEnvelope) * (1 - Math.exp(-muffleEnvRate * dt));

    this.filterBlipBoost *= Math.exp(-4.5 * dt);

    // 4. Compute target turntable playbackRate (1.0 on asphalt, progressive sag off-road or on bump)
    const offRoadDip = this.offRoadEnvelope * tuning.audioOffRoadPitchDip;
    const targetRate = Math.max(0.65, 1.0 - offRoadDip - this.pitchDipEnvelope);
    this.currentPlaybackRate +=
      (targetRate - this.currentPlaybackRate) * (1 - Math.exp(-6.5 * dt));

    // 5. Advance track time from AudioContext clock (with output latency compensation)
    const dur = Math.max(1, this.beatClock.map.durationSec);
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
        this.outroLoopHolding = false;
      }
    } else {
      this.virtualTrackSec += dt * this.currentPlaybackRate;
      if (this.virtualTrackSec >= dur) {
        this.handleTrackEndWrap(dur, driving.holdOutroLoop === true);
      } else if (!driving.holdOutroLoop) {
        this.outroLoopHolding = false;
      }
    }

    const latencySec = this.getOutputLatencySec();
    const audibleTrackSec = Math.max(0, this.virtualTrackSec - latencySec);
    const clockState = this.beatClock.sample(audibleTrackSec);

    // Trigger automatic filter excitement when crossing into a drop bar
    if (clockState.justCrossedBar && clockState.sectionRole === 'drop') {
      this.triggerFilterBlip(0.8);
    }

    // 6. Compute speed + drift + progressive off-road/muffle low-pass filter cutoff (Hz)
    const minHz = tuning.audioFilterMinHz;
    const maxHz = tuning.audioFilterMaxHz;
    const speedCurve = Math.pow(Math.max(0, Math.min(1, driving.speedRatio)), 1.35);
    const driftBoost = driving.isDrifting ? 0.24 : 0;
    const offRoadMuffle = -0.32 * this.offRoadEnvelope;
    const impactMuffle = -this.filterMuffleEnvelope;
    const introMuffle = clockState.sectionRole === 'intro' ? -0.18 : 0;
    const blip = this.filterBlipBoost * 0.3;

    const openness = Math.max(
      0,
      Math.min(1, speedCurve + driftBoost + offRoadMuffle + impactMuffle + introMuffle + blip),
    );
    let targetCutoff = minHz * Math.pow(maxHz / Math.max(100, minHz), openness);

    // Apply musical off-road / impact floor cap: ensure the filter remains stylish and never drops into brutal underwater sludge
    if (this.offRoadEnvelope > 0.001 || this.filterMuffleEnvelope > 0.001) {
      const activeFloor = Math.max(minHz, tuning.audioFilterOffRoadFloorHz);
      const muffleIntensity = Math.max(this.offRoadEnvelope, this.filterMuffleEnvelope);
      const dynamicFloor = minHz + (activeFloor - minHz) * muffleIntensity;
      targetCutoff = Math.max(dynamicFloor, targetCutoff);
    }

    this.currentCutoffHz +=
      (targetCutoff - this.currentCutoffHz) * (1 - Math.exp(-5.5 * dt));
    const targetQ = driving.isDrifting ? tuning.audioFilterDriftQ : 1.6;
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
        if (this.outgoingSourceNode) {
          this.outgoingSourceNode.playbackRate.value = this.currentPlaybackRate;
        }
        this.lastAppliedPlaybackRate = this.currentPlaybackRate;
      }
    }

    return clockState;
  }

  /**
   * Maps a DOM event timestamp (`KeyboardEvent.timeStamp`, in `performance.now()` ms)
   * to the audible track clock and judges its beat alignment (AGENTS.md §4.8).
   */
  judgeInputTimestamp(eventTimeStampMs: number): BeatJudgement {
    const nowPerfMs = typeof performance !== 'undefined' ? performance.now() : eventTimeStampMs;
    const ageSec = Math.max(0, (nowPerfMs - eventTimeStampMs) / 1000);
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
    if (this.ctx) {
      void this.ctx.close();
      this.ctx = null;
    }
  }

  private handleTrackEndWrap(dur: number, holdOutroLoop: boolean): void {
    if (holdOutroLoop) {
      // DJ loops the last 8 outro bars until the player reaches the fork (docs/DESIGN.md §3)
      const eightBarsSec = Math.min(dur * 0.5, 8 * barDurationSec(this.beatClock.map));
      const loopStartSec = Math.max(0, dur - eightBarsSec);
      this.virtualTrackSec = loopStartSec + ((this.virtualTrackSec - loopStartSec) % Math.max(1, eightBarsSec));
      this.outroLoopHolding = true;
      this.beatClock.resetCrossingState();
      if (this.ctx && this.ctx.state === 'running' && !this.isSynthLoopBuffer) {
        this.startSourceNode(this.virtualTrackSec, 0.08);
      }
    } else {
      const wasHoldingOutro = this.outroLoopHolding;
      this.virtualTrackSec %= dur;
      this.outroLoopHolding = false;
      this.beatClock.resetCrossingState();
      if (wasHoldingOutro && this.ctx && this.ctx.state === 'running' && !this.isSynthLoopBuffer) {
        this.startSourceNode(this.virtualTrackSec, 0.08);
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
    src.loop = true;
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

  private buildSynthFallbackBuffer(ctx: AudioContext, bpm: number): AudioBuffer {
    const sr = ctx.sampleRate;
    const { left, right } = synthesizeFutureFunkLoopPcm(bpm, sr, 8);
    const buf = ctx.createBuffer(2, left.length, sr);
    buf.getChannelData(0).set(left);
    buf.getChannelData(1).set(right);
    return buf;
  }
}

export { barDurationSec, beatDurationSec };
