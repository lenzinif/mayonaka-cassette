import { tuning } from '@src/config/tuning';
import { BeatClock, type BeatClockState, type BeatJudgement } from './BeatClock';
import { barDurationSec, beatDurationSec, type BeatMap, type BeatSection } from './BeatMap';

/**
 * Default procedural Future Funk BeatMap (122 BPM, 64 bars = ~125.9 s) used when
 * no external or user track is loaded (AGENTS.md §1 Pillar 4 & §4.4).
 */
export const DEFAULT_SYNTH_BEATMAP: BeatMap = createDefaultSynthBeatMap();

function createDefaultSynthBeatMap(): BeatMap {
  const bpm = 122;
  const beatsPerBar = 4;
  const totalBars = 64;
  const durationSec = Math.round(totalBars * ((60 / bpm) * beatsPerBar) * 1000) / 1000;

  const sections: BeatSection[] = [
    { startBar: 0, bars: 8, role: 'intro' },
    { startBar: 8, bars: 8, role: 'build' },
    { startBar: 16, bars: 16, role: 'drop' },
    { startBar: 32, bars: 8, role: 'breakdown' },
    { startBar: 40, bars: 4, role: 'build' },
    { startBar: 44, bars: 16, role: 'drop' },
    { startBar: 60, bars: 4, role: 'outro' },
  ];

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
    contentHash: 'sha256:bundled-neon-horizon-122bpm',
    title: 'Neon Horizon (Synth Fallback)',
    artist: 'OutRun FM 88.4',
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
}

/**
 * Web Audio graph & master beat clock wrapper (`Source -> BiquadFilter -> Gain -> Destination`).
 *
 * Obeys AGENTS.md §2 & §4.5:
 * - Zero React imports.
 * - Never creates or resumes `AudioContext` until `unlock()` is invoked inside a user gesture.
 * - Coupling between driving state and music: speed + clean drifts sweep the low-pass filter
 *   cutoff open; off-road drag and collisions muffle the filter and dip turntable pitch.
 */
export class FunkAudioEngine {
  readonly beatClock: BeatClock;

  private ctx: AudioContext | null = null;
  private filterNode: BiquadFilterNode | null = null;
  private masterGain: GainNode | null = null;
  private sourceNode: AudioBufferSourceNode | null = null;
  private currentBuffer: AudioBuffer | null = null;
  private isSynthLoopBuffer = true;

  private isPlaying = false;
  private currentCutoffHz = 2400;
  private currentPlaybackRate = 1.0;

  /** Accumulated virtual track position (seconds) accounting for variable playbackRate. */
  private virtualTrackSec = 0;
  private lastAudioTimeSec = 0;

  /** Momentary pitch dip state (triggered by collisions or sudden shocks). */
  private pitchDipAmount = 0;
  private pitchDipTimer = 0;

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

  setVolume(volume: number): void {
    const clamped = Math.max(0, Math.min(1, volume));
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(clamped, this.ctx.currentTime, 0.02);
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
    }

    if (this.ctx.state === 'suspended') {
      await this.ctx.resume();
    }

    if (!this.isPlaying && this.ctx.state === 'running') {
      this.startSourceNode(0);
    }
  }

  /**
   * Loads a decoded user or bundled track (`AudioBuffer` + `BeatMap`) and starts playback
   * if the engine has already been unlocked by a user gesture.
   */
  loadTrack(beatMap: BeatMap, audioBuffer: AudioBuffer | null = null): void {
    this.beatClock.setBeatMap(beatMap);
    this.currentBuffer = audioBuffer;
    this.isSynthLoopBuffer = audioBuffer === null;
    this.virtualTrackSec = 0;

    if (this.ctx && this.ctx.state === 'running') {
      this.startSourceNode(0);
    }
  }

  /**
   * Updates the BeatMap metadata (e.g. after user `×2`/`÷2`/nudge correction) without
   * restarting the audio buffer playback.
   */
  updateBeatMap(beatMap: BeatMap): void {
    this.beatClock.setBeatMap(beatMap);
  }

  /**
   * Triggers a brief turntable pitch dip and filter muffle (used on collisions, AGENTS.md §1 Pillar 2 & 3).
   */
  triggerPitchDip(depth = 0.16, durationSec = 0.35): void {
    this.pitchDipAmount = Math.max(this.pitchDipAmount, Math.min(0.45, depth));
    this.pitchDipTimer = Math.max(this.pitchDipTimer, durationSec);
  }

  /**
   * Triggers a brief resonant low-pass filter open blip (used on drops & perfect beat-shifts).
   */
  triggerFilterBlip(strength = 1): void {
    this.filterBlipBoost = Math.min(1.5, Math.max(this.filterBlipBoost, strength));
  }

  /**
   * Advances driving-reactive audio parameters and samples the master `BeatClock`.
   * When the Web Audio context is not yet unlocked, advances on `dt` so the BPM pulse
   * and greybox road animations still function before the first key press.
   */
  update(dt: number, driving: DrivingAudioParams): Readonly<BeatClockState> {
    // 1. Decay transient modifiers
    if (this.pitchDipTimer > 0) {
      this.pitchDipTimer = Math.max(0, this.pitchDipTimer - dt);
      if (this.pitchDipTimer === 0) this.pitchDipAmount = 0;
    }
    this.filterBlipBoost *= Math.exp(-5.5 * dt);

    // 2. Compute target turntable playbackRate (1.0 on asphalt, slight drag dip off-road)
    const offRoadDip = driving.isOffRoad ? tuning.audioOffRoadPitchDip : 0;
    const targetRate = Math.max(0.55, 1.0 - offRoadDip - this.pitchDipAmount);
    this.currentPlaybackRate += (targetRate - this.currentPlaybackRate) * Math.min(1, dt * 14);

    // 3. Advance track time from AudioContext clock (with output latency compensation)
    if (this.ctx && this.isPlaying && this.ctx.state === 'running') {
      const nowAudio = this.ctx.currentTime;
      const elapsedAudio = Math.max(0, nowAudio - this.lastAudioTimeSec);
      this.lastAudioTimeSec = nowAudio;
      this.virtualTrackSec += elapsedAudio * this.currentPlaybackRate;

      const dur = this.beatClock.map.durationSec;
      if (dur > 0 && this.virtualTrackSec >= dur) {
        this.virtualTrackSec %= dur;
        this.beatClock.resetCrossingState();
      }
    } else {
      this.virtualTrackSec =
        (this.virtualTrackSec + dt * this.currentPlaybackRate) %
        Math.max(1, this.beatClock.map.durationSec);
    }

    const latencySec = this.getOutputLatencySec();
    const audibleTrackSec = Math.max(0, this.virtualTrackSec - latencySec);
    const clockState = this.beatClock.sample(audibleTrackSec);

    // Trigger automatic filter excitement when crossing into a drop bar
    if (clockState.justCrossedBar && clockState.sectionRole === 'drop') {
      this.triggerFilterBlip(0.8);
    }

    // 4. Compute speed + drift + section reactive low-pass filter cutoff (Hz)
    const minHz = tuning.audioFilterMinHz;
    const maxHz = tuning.audioFilterMaxHz;
    // Exponential frequency mapping feels musical across octaves
    const speedCurve = Math.pow(Math.max(0, Math.min(1, driving.speedRatio)), 1.35);
    const driftBoost = driving.isDrifting ? 0.24 : 0;
    const offRoadMuffle = driving.isOffRoad ? -0.38 : 0;
    const introMuffle = clockState.sectionRole === 'intro' ? -0.18 : 0;
    const blip = this.filterBlipBoost * 0.3;

    const openness = Math.max(
      0,
      Math.min(1, speedCurve + driftBoost + offRoadMuffle + introMuffle + blip),
    );
    const targetCutoff = minHz * Math.pow(maxHz / Math.max(100, minHz), openness);
    this.currentCutoffHz += (targetCutoff - this.currentCutoffHz) * Math.min(1, dt * 10);

    // 5. Apply smoothed parameters to Web Audio nodes
    if (this.ctx && this.filterNode && this.sourceNode && this.ctx.state === 'running') {
      const now = this.ctx.currentTime;
      this.filterNode.frequency.setTargetAtTime(this.currentCutoffHz, now, 0.025);
      const targetQ = driving.isDrifting ? tuning.audioFilterDriftQ : 1.6;
      this.filterNode.Q.setTargetAtTime(targetQ, now, 0.03);
      this.sourceNode.playbackRate.setTargetAtTime(this.currentPlaybackRate, now, 0.02);
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
    return this.beatClock.judgeTrackTime(eventTrackSec);
  }

  dispose(): void {
    this.stopSourceNode();
    if (this.ctx) {
      void this.ctx.close();
      this.ctx = null;
    }
  }

  private getOutputLatencySec(): number {
    if (!this.ctx) return 0;
    const base = (this.ctx as AudioContext & { baseLatency?: number }).baseLatency ?? 0;
    const output = (this.ctx as AudioContext & { outputLatency?: number }).outputLatency ?? 0;
    if (typeof this.ctx.getOutputTimestamp === 'function') {
      const ts = this.ctx.getOutputTimestamp();
      if (ts.contextTime && ts.contextTime > 0 && this.ctx.currentTime >= ts.contextTime) {
        return Math.min(0.25, this.ctx.currentTime - ts.contextTime + base);
      }
    }
    return Math.min(0.25, base + output);
  }

  private startSourceNode(offsetSec: number): void {
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
    src.playbackRate.value = this.currentPlaybackRate;
    src.connect(this.filterNode);

    const safeOffset = buffer.duration > 0 ? offsetSec % buffer.duration : 0;
    src.start(0, safeOffset);

    this.sourceNode = src;
    this.lastAudioTimeSec = this.ctx.currentTime;
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
    this.isPlaying = false;
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
