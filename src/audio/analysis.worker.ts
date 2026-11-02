import type { BeatMap, BeatSection, SectionRole } from './BeatMap';

/**
 * Offline DSP worker & pure PCM analyzer (docs/DESIGN.md §2.3, AGENTS.md §4.7).
 *
 * Receives mono PCM (`Float32Array`, target 22 050 Hz) decoded on the main thread,
 * computes log-magnitude spectral flux + low-band (<150 Hz) kick flux, coarse tempo
 * autocorrelation with a 120 BPM log-Gaussian prior, whole-track constant-tempo grid
 * refinement (±0.5 BPM in 0.005 steps + phase), 8-bar stability check, downbeat phase
 * selection, per-bar energy, and 4-bar-snapped structural sections.
 */

export interface AnalysisMetadata {
  contentHash: string;
  title: string;
  artist: string;
  durationSec?: number;
  includeDebugEnvelopes?: boolean;
}

export interface AnalysisDebugData {
  /** Downsampled onset flux envelope in [0, 1] for inspector plotting. */
  onsetPreview: Float32Array;
  /** Downsampled low-band (<150 Hz) kick envelope in [0, 1] for inspector plotting. */
  kickPreview: Float32Array;
  /** Coarse autocorrelation curve sampled at integer BPMs from 70..180. */
  tempoCurveBpm: Float32Array;
  tempoCurveScore: Float32Array;
  analysisTimeMs: number;
}

export interface AnalysisResult {
  beatMap: BeatMap;
  debug?: AnalysisDebugData;
}

export interface AnalysisWorkerRequest {
  id: number;
  pcm: Float32Array;
  sampleRate: number;
  meta: AnalysisMetadata;
}

export type AnalysisWorkerResponse =
  | { id: number; ok: true; result: AnalysisResult }
  | { id: number; ok: false; error: string };

const FFT_SIZE = 1024;
const HOP_SIZE = 128; // ~5.805 ms at 22 050 Hz
const MIN_BPM = 70;
const MAX_BPM = 180;
const PRIOR_CENTER_BPM = 120;
const PRIOR_SIGMA_OCTAVE = 0.34;
const BEATS_PER_BAR = 4;

// Precomputed radix-2 FFT tables for FFT_SIZE = 1024
const HANN_WINDOW = new Float32Array(FFT_SIZE);
const BIT_REV = new Uint16Array(FFT_SIZE);
const COS_TABLE = new Float32Array(FFT_SIZE / 2);
const SIN_TABLE = new Float32Array(FFT_SIZE / 2);

(function initFftTables() {
  for (let i = 0; i < FFT_SIZE; i++) {
    HANN_WINDOW[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (FFT_SIZE - 1)));
  }
  const bits = Math.round(Math.log2(FFT_SIZE));
  for (let i = 0; i < FFT_SIZE; i++) {
    let rev = 0;
    let val = i;
    for (let b = 0; b < bits; b++) {
      rev = (rev << 1) | (val & 1);
      val >>= 1;
    }
    BIT_REV[i] = rev;
  }
  for (let k = 0; k < FFT_SIZE / 2; k++) {
    const angle = (-2 * Math.PI * k) / FFT_SIZE;
    COS_TABLE[k] = Math.cos(angle);
    SIN_TABLE[k] = Math.sin(angle);
  }
})();

function fftInPlace(re: Float32Array, im: Float32Array): void {
  for (let i = 0; i < FFT_SIZE; i++) {
    const j = BIT_REV[i]!;
    if (j > i) {
      const tr = re[i]!;
      re[i] = re[j]!;
      re[j] = tr;
      const ti = im[i]!;
      im[i] = im[j]!;
      im[j] = ti;
    }
  }

  for (let size = 2; size <= FFT_SIZE; size <<= 1) {
    const half = size >> 1;
    const step = FFT_SIZE / size;
    for (let i = 0; i < FFT_SIZE; i += size) {
      let k = 0;
      for (let j = i; j < i + half; j++) {
        const wRe = COS_TABLE[k]!;
        const wIm = SIN_TABLE[k]!;
        k += step;
        const m = j + half;
        const tRe = wRe * re[m]! - wIm * im[m]!;
        const tIm = wRe * im[m]! + wIm * re[m]!;
        re[m] = re[j]! - tRe;
        im[m] = im[j]! - tIm;
        re[j] = re[j]! + tRe;
        im[j] = im[j]! + tIm;
      }
    }
  }
}

interface SpectralFeatures {
  onsetEnv: Float32Array;
  kickEnv: Float32Array;
  rhythmEnv: Float32Array;
  frameRms: Float32Array;
  frameLowEnergy: Float32Array;
  frameMidHighEnergy: Float32Array;
  frameCentroid: Float32Array;
  fps: number;
  numFrames: number;
}

/**
 * Step 1: Compute log-magnitude spectral flux, low-band (<150 Hz) kick flux,
 * and per-frame energy/centroid features using packed 2-frames-per-complex-FFT.
 */
function extractSpectralFeatures(pcm: Float32Array, sampleRate: number): SpectralFeatures {
  const numFrames = Math.max(1, Math.floor((pcm.length - FFT_SIZE) / HOP_SIZE) + 1);
  const fps = sampleRate / HOP_SIZE;

  const onsetEnv = new Float32Array(numFrames);
  const kickEnv = new Float32Array(numFrames);
  const frameRms = new Float32Array(numFrames);
  const frameLowEnergy = new Float32Array(numFrames);
  const frameMidHighEnergy = new Float32Array(numFrames);
  const frameCentroid = new Float32Array(numFrames);

  const halfN = FFT_SIZE >> 1;
  const binHz = sampleRate / FFT_SIZE;
  const lowMaxBin = Math.max(2, Math.min(halfN - 1, Math.ceil(150 / binHz)));
  const fluxMaxBin = Math.min(halfN - 1, Math.floor(8000 / binHz));

  const re = new Float32Array(FFT_SIZE);
  const im = new Float32Array(FFT_SIZE);
  const prevLogMag = new Float32Array(halfN);
  const curLogMag0 = new Float32Array(halfN);
  const curLogMag1 = new Float32Array(halfN);
  const mag0 = new Float32Array(halfN);
  const mag1 = new Float32Array(halfN);

  const logGamma = 12;

  const processSpectrum = (
    frameIdx: number,
    mag: Float32Array,
    curLogMag: Float32Array,
    rmsVal: number,
  ) => {
    let fullFlux = 0;
    let lowFlux = 0;
    let lowE = 0;
    let midHighE = 0;
    let weightedBinSum = 0;
    let magSum = 0;

    for (let k = 1; k <= fluxMaxBin; k++) {
      const m = mag[k]!;
      const lm = curLogMag[k]!;
      const diff = lm - prevLogMag[k]!;
      prevLogMag[k] = lm;

      if (diff > 0) {
        fullFlux += diff;
        if (k <= lowMaxBin) {
          lowFlux += diff;
        }
      }
      if (k <= lowMaxBin) {
        lowE += m * m;
      } else {
        midHighE += m * m;
      }
      weightedBinSum += k * m;
      magSum += m;
    }

    if (frameIdx > 0) {
      onsetEnv[frameIdx] = fullFlux;
      kickEnv[frameIdx] = lowFlux;
    }
    frameRms[frameIdx] = rmsVal;
    frameLowEnergy[frameIdx] = Math.sqrt(lowE / lowMaxBin);
    frameMidHighEnergy[frameIdx] = Math.sqrt(midHighE / Math.max(1, fluxMaxBin - lowMaxBin));
    frameCentroid[frameIdx] = magSum > 1e-6 ? (weightedBinSum / magSum) * binHz : 0;
  };

  // Process two real frames per complex FFT: z[n] = x0[n] + i * x1[n]
  for (let f = 0; f < numFrames; f += 2) {
    const offset0 = f * HOP_SIZE;
    const hasSecond = f + 1 < numFrames;
    const offset1 = (f + 1) * HOP_SIZE;

    let sumSq0 = 0;
    let sumSq1 = 0;

    if (hasSecond) {
      for (let n = 0; n < FFT_SIZE; n++) {
        const w = HANN_WINDOW[n]!;
        const s0 = pcm[offset0 + n]!;
        const s1 = pcm[offset1 + n]!;
        sumSq0 += s0 * s0;
        sumSq1 += s1 * s1;
        re[n] = s0 * w;
        im[n] = s1 * w;
      }
    } else {
      for (let n = 0; n < FFT_SIZE; n++) {
        const w = HANN_WINDOW[n]!;
        const s0 = pcm[offset0 + n] ?? 0;
        sumSq0 += s0 * s0;
        re[n] = s0 * w;
        im[n] = 0;
      }
    }

    fftInPlace(re, im);

    // Unpack X0[k] and X1[k] for k = 1 .. fluxMaxBin using conjugate symmetry
    for (let k = 1; k <= fluxMaxBin; k++) {
      const nk = FFT_SIZE - k;
      const rK = re[k]!;
      const iK = im[k]!;
      const rNK = re[nk]!;
      const iNK = im[nk]!;

      const x0Re = 0.5 * (rK + rNK);
      const x0Im = 0.5 * (iK - iNK);
      const m0 = Math.hypot(x0Re, x0Im) / halfN;
      mag0[k] = m0;
      curLogMag0[k] = Math.log1p(logGamma * m0);

      if (hasSecond) {
        const x1Re = 0.5 * (iK + iNK);
        const x1Im = 0.5 * (rNK - rK);
        const m1 = Math.hypot(x1Re, x1Im) / halfN;
        mag1[k] = m1;
        curLogMag1[k] = Math.log1p(logGamma * m1);
      }
    }

    processSpectrum(f, mag0, curLogMag0, Math.sqrt(sumSq0 / FFT_SIZE));
    if (hasSecond) {
      processSpectrum(f + 1, mag1, curLogMag1, Math.sqrt(sumSq1 / FFT_SIZE));
    }
  }

  normalizeEnvelopeWithLocalMean(onsetEnv, Math.round(0.45 * fps));
  normalizeEnvelopeWithLocalMean(kickEnv, Math.round(0.45 * fps));

  const rhythmEnv = new Float32Array(numFrames);
  for (let i = 0; i < numFrames; i++) {
    rhythmEnv[i] = 0.52 * onsetEnv[i]! + 0.48 * kickEnv[i]!;
  }

  return {
    onsetEnv,
    kickEnv,
    rhythmEnv,
    frameRms,
    frameLowEnergy,
    frameMidHighEnergy,
    frameCentroid,
    fps,
    numFrames,
  };
}

/**
 * Subtracts a sliding local mean (half-wave rectified) so quiet and loud sections
 * contribute crisp transients equally, then normalizes to [0, 1].
 */
function normalizeEnvelopeWithLocalMean(env: Float32Array, halfWin: number): void {
  const n = env.length;
  if (n === 0) return;

  const prefix = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) {
    prefix[i + 1] = prefix[i]! + env[i]!;
  }

  let maxVal = 0;
  for (let i = 0; i < n; i++) {
    const lo = Math.max(0, i - halfWin);
    const hi = Math.min(n - 1, i + halfWin);
    const localMean = (prefix[hi + 1]! - prefix[lo]!) / (hi - lo + 1);
    const v = Math.max(0, env[i]! - localMean * 0.9);
    env[i] = v;
    if (v > maxVal) maxVal = v;
  }

  if (maxVal > 1e-8) {
    const inv = 1 / maxVal;
    for (let i = 0; i < n; i++) {
      env[i] = env[i]! * inv;
    }
  }
}

function logGaussianPrior(bpm: number): number {
  const octDiff = Math.log2(bpm / PRIOR_CENTER_BPM);
  return Math.exp(-0.5 * (octDiff / PRIOR_SIGMA_OCTAVE) * (octDiff / PRIOR_SIGMA_OCTAVE));
}

interface CoarseTempoResult {
  candidates: number[];
  curveBpm: Float32Array;
  curveScore: Float32Array;
  tempoConfidence: number;
}

/**
 * Step 2: Coarse tempo estimation via multi-harmonic autocorrelation over 70..180 BPM
 * weighted by a log-Gaussian prior centred at 120 BPM.
 */
function estimateCoarseTempo(rhythmEnv: Float32Array, fps: number): CoarseTempoResult {
  const n = rhythmEnv.length;
  // Decimate by 2 (~86.13 Hz) for fast autocorrelation across up to 4-beat lags
  const dec = 2;
  const m = Math.floor(n / dec);
  const envDec = new Float32Array(m);
  let mean = 0;
  for (let i = 0; i < m; i++) {
    const v = 0.5 * (rhythmEnv[i * 2]! + (rhythmEnv[i * 2 + 1] ?? rhythmEnv[i * 2]!));
    envDec[i] = v;
    mean += v;
  }
  mean /= Math.max(1, m);
  for (let i = 0; i < m; i++) {
    envDec[i] = Math.max(0, envDec[i]! - mean * 0.5);
  }

  const decFps = fps / dec;
  const maxLag = Math.min(m - 1, Math.ceil(((60 / MIN_BPM) * decFps) * 4) + 4);
  const minLag = Math.max(4, Math.floor(((60 / MAX_BPM) * decFps) * 0.5) - 2);

  const acf = new Float32Array(maxLag + 1);
  let zeroLag = 0;
  for (let i = 0; i < m; i++) {
    zeroLag += envDec[i]! * envDec[i]!;
  }
  const norm = zeroLag > 1e-8 ? 1 / zeroLag : 1;

  for (let lag = minLag; lag <= maxLag; lag++) {
    let sum = 0;
    const limit = m - lag;
    for (let i = 0; i < limit; i++) {
      sum += envDec[i]! * envDec[i + lag]!;
    }
    acf[lag] = (sum * (m / Math.max(1, limit))) * norm;
  }

  const interpAcf = (lagFloat: number): number => {
    const idx = Math.floor(lagFloat);
    if (idx < minLag || idx + 1 > maxLag) return 0;
    const frac = lagFloat - idx;
    return acf[idx]! * (1 - frac) + acf[idx + 1]! * frac;
  };

  const stepBpm = 0.25;
  const numSteps = Math.round((MAX_BPM - MIN_BPM) / stepBpm) + 1;
  const bpms = new Float32Array(numSteps);
  const rawScores = new Float32Array(numSteps);
  const weightedScores = new Float32Array(numSteps);

  let maxWeighted = 0;
  for (let s = 0; s < numSteps; s++) {
    const bpm = MIN_BPM + s * stepBpm;
    bpms[s] = bpm;
    const beatLag = (60 / bpm) * decFps;
    const r1 = interpAcf(beatLag);
    const r2 = interpAcf(beatLag * 2);
    const r4 = interpAcf(beatLag * 4);
    const rHalf = interpAcf(beatLag * 0.5);

    const raw = Math.max(0, 1.0 * r1 + 0.55 * r2 + 0.35 * r4 + 0.22 * rHalf);
    rawScores[s] = raw;
    const w = raw * logGaussianPrior(bpm);
    weightedScores[s] = w;
    if (w > maxWeighted) maxWeighted = w;
  }

  // Extract top local peaks separated by at least 2.5 BPM
  const peaks: { bpm: number; score: number; raw: number }[] = [];
  for (let s = 1; s < numSteps - 1; s++) {
    const w = weightedScores[s]!;
    if (w >= weightedScores[s - 1]! && w >= weightedScores[s + 1]!) {
      peaks.push({ bpm: bpms[s]!, score: w, raw: rawScores[s]! });
    }
  }
  peaks.sort((a, b) => b.score - a.score);

  const candidates: number[] = [];
  for (const p of peaks) {
    if (candidates.every((c) => Math.abs(c - p.bpm) >= 2.5)) {
      candidates.push(p.bpm);
      if (candidates.length >= 4) break;
    }
  }
  if (candidates.length === 0) {
    candidates.push(120);
  }

  // Downsample curve to integer BPMs 70..180 for debug visualization
  const intCount = MAX_BPM - MIN_BPM + 1;
  const curveBpm = new Float32Array(intCount);
  const curveScore = new Float32Array(intCount);
  const invMax = maxWeighted > 1e-8 ? 1 / maxWeighted : 1;
  for (let i = 0; i < intCount; i++) {
    const bpm = MIN_BPM + i;
    curveBpm[i] = bpm;
    const idx = Math.round((bpm - MIN_BPM) / stepBpm);
    curveScore[i] = (weightedScores[idx] ?? 0) * invMax;
  }

  const bestScore = peaks[0]?.score ?? 0;
  // Find best competing peak outside ±4 BPM of bestBpm (including octave competitors)
  const bestBpm = candidates[0]!;
  let runnerUp = 0;
  for (const p of peaks) {
    if (Math.abs(p.bpm - bestBpm) > 4) {
      runnerUp = p.score;
      break;
    }
  }
  const dominance = bestScore > 1e-6 ? (bestScore - runnerUp * 0.65) / bestScore : 0.5;
  const tempoConfidence = Math.max(0.1, Math.min(0.99, dominance));

  return { candidates, curveBpm, curveScore, tempoConfidence };
}

interface PeakEvent {
  timeSec: number;
  weight: number;
  kickWeight: number;
}

function extractOnsetPeaks(
  rhythmEnv: Float32Array,
  kickEnv: Float32Array,
  fps: number,
): PeakEvent[] {
  const peaks: PeakEvent[] = [];
  const n = rhythmEnv.length;
  for (let i = 1; i < n - 1; i++) {
    const v = rhythmEnv[i]!;
    if (v > 0.05 && v >= rhythmEnv[i - 1]! && v >= rhythmEnv[i + 1]!) {
      peaks.push({
        timeSec: i / fps,
        weight: v,
        kickWeight: kickEnv[i]!,
      });
    }
  }
  return peaks;
}

interface GridFitResult {
  bpm: number;
  beatPhaseOffsetSec: number;
  alignmentScore: number;
}

/**
 * Step 3: Fine constant-tempo grid search over the whole track (±0.8 BPM in 0.005 BPM steps
 * around each coarse candidate), maximising phase-folded pulse train sharpness.
 */
function refineConstantTempoGrid(
  coarseCandidates: number[],
  peaks: PeakEvent[],
): GridFitResult {
  const BINS = 64;
  const hist = new Float64Array(BINS);
  const kickHist = new Float64Array(BINS);
  const smoothed = new Float64Array(BINS);

  let bestBpm = coarseCandidates[0] ?? 120;
  let bestPhaseBin = 0;
  let bestScore = -1;

  let totalWeight = 0;
  for (let i = 0; i < peaks.length; i++) {
    totalWeight += peaks[i]!.weight + 0.5 * peaks[i]!.kickWeight;
  }
  if (totalWeight <= 1e-8 || peaks.length === 0) {
    return { bpm: bestBpm, beatPhaseOffsetSec: 0, alignmentScore: 0 };
  }

  for (let cIdx = 0; cIdx < coarseCandidates.length; cIdx++) {
    const centerBpm = coarseCandidates[cIdx]!;
    const minTest = Math.max(MIN_BPM, centerBpm - 0.85);
    const maxTest = Math.min(MAX_BPM, centerBpm + 0.85);
    const candidatePenalty = cIdx === 0 ? 1.0 : 0.94;

    for (let bpm = minTest; bpm <= maxTest + 1e-6; bpm += 0.005) {
      const freq = bpm / 60;
      hist.fill(0);
      kickHist.fill(0);

      for (let i = 0; i < peaks.length; i++) {
        const p = peaks[i]!;
        const phase = (p.timeSec * freq) % 1;
        const bin = Math.floor(phase * BINS) & (BINS - 1);
        hist[bin] = hist[bin]! + p.weight;
        kickHist[bin] = kickHist[bin]! + p.kickWeight;
      }

      // Smooth with 5-tap kernel [0.15, 0.5, 1.0, 0.5, 0.15] (~±12 ms window)
      let maxBinScore = 0;
      let maxBin = 0;
      let sumSmoothed = 0;

      for (let b = 0; b < BINS; b++) {
        const bm2 = (b - 2 + BINS) & (BINS - 1);
        const bm1 = (b - 1 + BINS) & (BINS - 1);
        const bp1 = (b + 1) & (BINS - 1);
        const bp2 = (b + 2) & (BINS - 1);

        const s =
          1.0 * (hist[b]! + 0.65 * kickHist[b]!) +
          0.55 * (hist[bm1]! + hist[bp1]! + 0.65 * (kickHist[bm1]! + kickHist[bp1]!)) +
          0.18 * (hist[bm2]! + hist[bp2]!);
        smoothed[b] = s;
        sumSmoothed += s;
      }

      const meanSmoothed = sumSmoothed / BINS;
      const halfBins = BINS >> 1;

      for (let b = 0; b < BINS; b++) {
        // Combine fundamental beat alignment + 8th-note sub-beat reinforcement
        const offBeat = smoothed[(b + halfBins) & (BINS - 1)]!;
        const score = (smoothed[b]! - meanSmoothed) + 0.22 * Math.max(0, offBeat - meanSmoothed);
        if (score > maxBinScore) {
          maxBinScore = score;
          maxBin = b;
        }
      }

      const weighted = maxBinScore * logGaussianPrior(bpm) * candidatePenalty;
      if (weighted > bestScore) {
        bestScore = weighted;
        bestBpm = Math.round(bpm * 1000) / 1000;
        bestPhaseBin = maxBin;
      }
    }
  }

  // Sub-bin parabolic interpolation around bestPhaseBin at bestBpm
  const freq = bestBpm / 60;
  hist.fill(0);
  for (let i = 0; i < peaks.length; i++) {
    const p = peaks[i]!;
    const phase = (p.timeSec * freq) % 1;
    const bin = Math.floor(phase * BINS) & (BINS - 1);
    hist[bin] = hist[bin]! + p.weight + 0.65 * p.kickWeight;
  }
  const bm1 = (bestPhaseBin - 1 + BINS) & (BINS - 1);
  const bp1 = (bestPhaseBin + 1) & (BINS - 1);
  const y0 = hist[bm1]!;
  const y1 = hist[bestPhaseBin]!;
  const y2 = hist[bp1]!;
  const denom = 2 * (2 * y1 - y0 - y2);
  const delta = Math.abs(denom) > 1e-6 ? Math.max(-0.5, Math.min(0.5, (y2 - y0) / denom)) : 0;

  const phaseNorm = ((bestPhaseBin + 0.5 + delta) / BINS + 1) % 1;
  const beatPeriod = 60 / bestBpm;
  const beatPhaseOffsetSec = phaseNorm * beatPeriod;
  const alignmentScore = Math.min(1, bestScore / (totalWeight * 0.35));

  return { bpm: bestBpm, beatPhaseOffsetSec, alignmentScore };
}

/**
 * Step 4: Evaluate tempo stability across 8-bar (32-beat) windows.
 */
function checkTempoStability(
  bpm: number,
  beatPhaseOffsetSec: number,
  rhythmEnv: Float32Array,
  frameRms: Float32Array,
  fps: number,
): boolean {
  const beatPeriod = 60 / bpm;
  const totalSec = rhythmEnv.length / fps;
  const windowBeats = 32; // 8 bars
  const windowSec = windowBeats * beatPeriod;
  if (totalSec < windowSec * 1.5) return true;

  // Compute global RMS reference to skip near-silent intro/outro windows
  let meanRms = 0;
  for (let i = 0; i < frameRms.length; i++) meanRms += frameRms[i]!;
  meanRms /= Math.max(1, frameRms.length);

  let activeWindows = 0;
  let alignedWindows = 0;
  const toleranceFrames = Math.max(2, Math.round(0.045 * fps)); // ±45 ms around beat

  for (let startSec = beatPhaseOffsetSec; startSec + windowSec <= totalSec; startSec += windowSec) {
    const startFrame = Math.max(0, Math.floor(startSec * fps));
    const endFrame = Math.min(rhythmEnv.length - 1, Math.floor((startSec + windowSec) * fps));

    let winRms = 0;
    let winEnvSum = 0;
    for (let f = startFrame; f <= endFrame; f++) {
      winRms += frameRms[f]!;
      winEnvSum += rhythmEnv[f]!;
    }
    const count = Math.max(1, endFrame - startFrame + 1);
    winRms /= count;
    const winEnvMean = winEnvSum / count;

    if (winRms < meanRms * 0.18 || winEnvMean < 1e-4) continue;
    activeWindows++;

    let onBeatSum = 0;
    let onBeatSamples = 0;
    for (let b = 0; b < windowBeats; b++) {
      const beatSec = startSec + b * beatPeriod;
      const centerF = Math.round(beatSec * fps);
      const lo = Math.max(startFrame, centerF - toleranceFrames);
      const hi = Math.min(endFrame, centerF + toleranceFrames);
      for (let f = lo; f <= hi; f++) {
        onBeatSum += rhythmEnv[f]!;
        onBeatSamples++;
      }
    }
    const onBeatMean = onBeatSamples > 0 ? onBeatSum / onBeatSamples : 0;
    if (onBeatMean > winEnvMean * 1.12) {
      alignedWindows++;
    }
  }

  if (activeWindows === 0) return true;
  return alignedWindows / activeWindows >= 0.6;
}

/**
 * Step 5: Choose the downbeat phase (0, 1, 2, or 3 beats after `beatPhaseOffsetSec`)
 * that best aligns Beat 1 with structural 4-bar phrase transitions, bass/kick entry,
 * kick-over-snare dominance, and initial track start.
 */
function selectDownbeatOffset(
  bpm: number,
  beatPhaseOffsetSec: number,
  features: SpectralFeatures,
): { firstBeatOffsetSec: number; downbeatConfidence: number } {
  const { kickEnv, onsetEnv, frameLowEnergy, frameMidHighEnergy, frameRms, fps, numFrames } =
    features;
  const beatPeriod = 60 / bpm;
  const totalBeats = Math.floor((numFrames / fps - beatPhaseOffsetSec) / beatPeriod);
  if (totalBeats < 8) {
    return { firstBeatOffsetSec: beatPhaseOffsetSec, downbeatConfidence: 0.5 };
  }

  // Per-beat aggregated descriptors
  const beatLow = new Float32Array(totalBeats);
  const beatMidHigh = new Float32Array(totalBeats);
  const beatRms = new Float32Array(totalBeats);
  const beatKick = new Float32Array(totalBeats);
  const beatOnset = new Float32Array(totalBeats);

  const attackRadius = Math.max(1, Math.round(0.035 * fps));
  const beatFrames = Math.max(1, Math.round(beatPeriod * fps));

  for (let b = 0; b < totalBeats; b++) {
    const tSec = beatPhaseOffsetSec + b * beatPeriod;
    const fCenter = Math.round(tSec * fps);
    const aLo = Math.max(0, fCenter - attackRadius);
    const aHi = Math.min(numFrames - 1, fCenter + attackRadius);
    let maxK = 0;
    let maxO = 0;
    for (let f = aLo; f <= aHi; f++) {
      if (kickEnv[f]! > maxK) maxK = kickEnv[f]!;
      if (onsetEnv[f]! > maxO) maxO = onsetEnv[f]!;
    }
    beatKick[b] = maxK;
    beatOnset[b] = maxO;

    const bEnd = Math.min(numFrames - 1, fCenter + beatFrames);
    let sumL = 0;
    let sumMH = 0;
    let sumR = 0;
    let cnt = 0;
    for (let f = Math.max(0, fCenter); f <= bEnd; f++) {
      sumL += frameLowEnergy[f]!;
      sumMH += frameMidHighEnergy[f]!;
      sumR += frameRms[f]!;
      cnt++;
    }
    if (cnt > 0) {
      beatLow[b] = sumL / cnt;
      beatMidHigh[b] = sumMH / cnt;
      beatRms[b] = sumR / cnt;
    }
  }

  // Find the first audible beat (where RMS exceeds 1% of peak beat RMS — catches quiet vinyl/ambient intros)
  let maxBeatRms = 0;
  for (let b = 0; b < totalBeats; b++) {
    if (beatRms[b]! > maxBeatRms) maxBeatRms = beatRms[b]!;
  }
  let firstAudibleBeat = 0;
  for (let b = 0; b < Math.min(totalBeats, 16); b++) {
    if (beatRms[b]! > maxBeatRms * 0.012 || beatOnset[b]! > 0.04) {
      firstAudibleBeat = b;
      break;
    }
  }

  const phaseScores = new Float64Array(BEATS_PER_BAR);

  for (let p = 0; p < BEATS_PER_BAR; p++) {
    let phraseTransitionScore = 0;
    let barNoveltyScore = 0;
    let kickVsSnareScore = 0;
    let barCount = 0;

    for (let b = p; b + 4 < totalBeats; b += BEATS_PER_BAR) {
      barCount++;
      // 1. Kick on 1 & 3 vs Snare/Clap (mid-high) on 2 & 4
      const low13 = beatLow[b]! + beatLow[b + 2]!;
      const low24 = beatLow[b + 1]! + beatLow[b + 3]!;
      const mh24 = beatMidHigh[b + 1]! + beatMidHigh[b + 3]!;
      const mh13 = beatMidHigh[b]! + beatMidHigh[b + 2]!;
      kickVsSnareScore += (low13 - low24) * 0.8 + (mh24 - mh13) * 0.4 + beatKick[b]! * 0.25;

      // 2. Bar-boundary spectral & bass change at beat `b` vs previous beat `b - 1`
      if (b >= 4) {
        const prevBarLow =
          0.25 * (beatLow[b - 4]! + beatLow[b - 3]! + beatLow[b - 2]! + beatLow[b - 1]!);
        const curBarLow =
          0.25 * (beatLow[b]! + beatLow[b + 1]! + beatLow[b + 2]! + beatLow[b + 3]!);
        const prevBarRms =
          0.25 * (beatRms[b - 4]! + beatRms[b - 3]! + beatRms[b - 2]! + beatRms[b - 1]!);
        const curBarRms =
          0.25 * (beatRms[b]! + beatRms[b + 1]! + beatRms[b + 2]! + beatRms[b + 3]!);

        const stepLow = Math.abs(curBarLow - prevBarLow);
        const stepRms = Math.abs(curBarRms - prevBarRms);
        const jumpOnBeat1 =
          Math.max(0, beatLow[b]! - beatLow[b - 1]!) + Math.max(0, beatRms[b]! - beatRms[b - 1]!);
        barNoveltyScore += stepLow * 1.2 + stepRms * 0.9 + jumpOnBeat1 * 1.1;
      }

      // 3. Major 4-bar / 8-bar structural drop transition alignment
      if (b >= 16 && b + 16 <= totalBeats) {
        let prev16Low = 0;
        let next16Low = 0;
        for (let k = 0; k < 16; k++) {
          prev16Low += beatLow[b - 16 + k]!;
          next16Low += beatLow[b + k]!;
        }
        const jump = Math.max(0, next16Low - prev16Low) / 16;
        const localEdge = Math.max(
          0,
          beatLow[b]! + beatRms[b]! - (beatLow[b - 1]! + beatRms[b - 1]!),
        );
        phraseTransitionScore += jump * localEdge * 6.0;
      }
    }

    const norm = Math.max(1, barCount);
    let total =
      (kickVsSnareScore / norm) * 1.0 +
      (barNoveltyScore / norm) * 1.8 +
      (phraseTransitionScore / norm) * 2.5;

    // Studio tracks exported from DAWs overwhelmingly begin on Beat 1 of Bar 0
    if (p === firstAudibleBeat % BEATS_PER_BAR) {
      total = Math.max(total, 1e-4) * 2.2 + 0.15;
    }

    phaseScores[p] = total;
  }

  let bestP = 0;
  let bestVal = -Infinity;
  let secondVal = -Infinity;
  for (let p = 0; p < BEATS_PER_BAR; p++) {
    const v = phaseScores[p]!;
    if (v > bestVal) {
      secondVal = bestVal;
      bestVal = v;
      bestP = p;
    } else if (v > secondVal) {
      secondVal = v;
    }
  }

  const firstBeatOffsetSec = beatPhaseOffsetSec + bestP * beatPeriod;
  const margin = bestVal > 1e-6 ? Math.max(0, (bestVal - secondVal) / bestVal) : 0.25;
  const downbeatConfidence = Math.max(0.35, Math.min(0.98, 0.5 + margin * 1.4));

  return {
    firstBeatOffsetSec: Math.round(firstBeatOffsetSec * 10000) / 10000,
    downbeatConfidence: Math.round(downbeatConfidence * 100) / 100,
  };
}

function percentile(sorted: Float32Array, q: number): number {
  if (sorted.length === 0) return 0;
  const pos = Math.max(0, Math.min(sorted.length - 1, q * (sorted.length - 1)));
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo]! * (1 - (pos - lo)) + sorted[hi]! * (pos - lo);
}

function normalizeFeatureByPercentile(arr: Float32Array): Float32Array {
  const n = arr.length;
  const sorted = new Float32Array(arr);
  sorted.sort();
  const p5 = percentile(sorted, 0.05);
  const p95 = percentile(sorted, 0.95);
  const span = Math.max(1e-6, p95 - p5);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    out[i] = Math.max(0, Math.min(1, (arr[i]! - p5) / span));
  }
  return out;
}

/**
 * Steps 6 & 7: Compute per-bar smoothed energy (`barEnergy[]`) and 4-bar-snapped
 * structural `sections[]` (`intro`, `build`, `drop`, `breakdown`, `outro`).
 */
function computeBarEnergyAndSections(
  bpm: number,
  firstBeatOffsetSec: number,
  durationSec: number,
  features: SpectralFeatures,
): { barEnergy: number[]; sections: BeatSection[] } {
  const { frameRms, frameLowEnergy, rhythmEnv, frameCentroid, fps, numFrames } = features;
  const barDur = (60 / bpm) * BEATS_PER_BAR;
  const totalBars = Math.max(4, Math.floor((durationSec - firstBeatOffsetSec) / barDur));

  const rawRms = new Float32Array(totalBars);
  const rawLow = new Float32Array(totalBars);
  const rawFlux = new Float32Array(totalBars);
  const rawCentroid = new Float32Array(totalBars);

  for (let b = 0; b < totalBars; b++) {
    const startSec = firstBeatOffsetSec + b * barDur;
    const endSec = startSec + barDur;
    const fStart = Math.max(0, Math.floor(startSec * fps));
    const fEnd = Math.min(numFrames - 1, Math.ceil(endSec * fps));

    let sRms = 0;
    let sLow = 0;
    let sFlux = 0;
    let sCent = 0;
    let cnt = 0;
    for (let f = fStart; f <= fEnd; f++) {
      sRms += frameRms[f]!;
      sLow += frameLowEnergy[f]!;
      sFlux += rhythmEnv[f]!;
      sCent += frameCentroid[f]!;
      cnt++;
    }
    if (cnt > 0) {
      rawRms[b] = sRms / cnt;
      rawLow[b] = sLow / cnt;
      rawFlux[b] = sFlux / cnt;
      rawCentroid[b] = sCent / cnt;
    }
  }

  const normRms = normalizeFeatureByPercentile(rawRms);
  const normLow = normalizeFeatureByPercentile(rawLow);
  const normFlux = normalizeFeatureByPercentile(rawFlux);
  const normCent = normalizeFeatureByPercentile(rawCentroid);

  // Unsmoothed composite per-bar energy (low-band bass/kick heavily weighted for Future Funk filter drops)
  const unsmoothedEnergy = new Float32Array(totalBars);
  for (let b = 0; b < totalBars; b++) {
    unsmoothedEnergy[b] =
      0.34 * normRms[b]! + 0.46 * normLow[b]! + 0.15 * normFlux[b]! + 0.05 * normCent[b]!;
  }

  // Smooth lightly for `barEnergy` output (3-bar kernel [0.2, 0.6, 0.2])
  const barEnergy: number[] = new Array<number>(totalBars);
  for (let b = 0; b < totalBars; b++) {
    const prev = unsmoothedEnergy[Math.max(0, b - 1)]!;
    const cur = unsmoothedEnergy[b]!;
    const next = unsmoothedEnergy[Math.min(totalBars - 1, b + 1)]!;
    const val = Math.max(0, Math.min(1, 0.2 * prev + 0.6 * cur + 0.2 * next));
    barEnergy[b] = Math.round(val * 1000) / 1000;
  }

  // Partition into 4-bar blocks for section segmentation
  const numBlocks = Math.max(1, Math.ceil(totalBars / 4));
  const blockEnergy = new Float32Array(numBlocks);
  const blockLow = new Float32Array(numBlocks);

  for (let k = 0; k < numBlocks; k++) {
    const bStart = k * 4;
    const bEnd = Math.min(totalBars, bStart + 4);
    const len = Math.max(1, bEnd - bStart);

    let sumE = 0;
    let sumL = 0;
    for (let b = bStart; b < bEnd; b++) {
      sumE += unsmoothedEnergy[b]!;
      sumL += normLow[b]!;
    }
    blockEnergy[k] = sumE / len;
    blockLow[k] = sumL / len;
  }

  // Reference high-tier energy across the song
  const sortedBarE = new Float32Array(unsmoothedEnergy).sort();
  const sortedBarL = new Float32Array(normLow).sort();
  const highEnergyRef = Math.max(0.42, percentile(sortedBarE, 0.72));
  const highLowRef = Math.max(0.42, percentile(sortedBarL, 0.72));

  const winAvg = (arr: Float32Array, start: number, count: number): number => {
    const lo = Math.max(0, start);
    const hi = Math.min(arr.length, start + count);
    if (hi <= lo) return 0;
    let s = 0;
    for (let i = lo; i < hi; i++) s += arr[i]!;
    return s / (hi - lo);
  };

  // Check if the first 4-bar block (bars 0..3, or bars 1..3 after a 1-bar pickup) is already in the drop
  const start3E = Math.max(winAvg(unsmoothedEnergy, 0, 4), winAvg(unsmoothedEnergy, 1, 3));
  const start3L = Math.max(winAvg(normLow, 0, 4), winAvg(normLow, 1, 3));

  // Evaluate bar-level novelty curve over the first 18 bars, then snap first drop to 4-bar boundary
  const maxSearchBar = Math.min(totalBars - 4, 18);
  let bestDropBar = 0;
  let bestNovelty = -Infinity;

  for (let b = 1; b <= maxSearchBar; b++) {
    const postE = winAvg(unsmoothedEnergy, b, 4);
    const postL = winAvg(normLow, b, 4);
    const preLocalLen = Math.min(4, b);
    const preLocalE = winAvg(unsmoothedEnergy, b - preLocalLen, preLocalLen);
    const preLocalL = winAvg(normLow, b - preLocalLen, preLocalLen);
    const preAllE = winAvg(unsmoothedEnergy, 0, b);
    const preAllL = winAvg(normLow, 0, b);

    // If the 4 bars immediately preceding `b` were ALREADY in a drop, `b` is not the first drop
    if (preLocalE >= highEnergyRef * 0.65 && preLocalL >= highLowRef * 0.55 && b >= 4) {
      continue;
    }

    const stepLocal = 0.55 * (postL - preLocalL) + 0.45 * (postE - preLocalE);
    const stepIntro = 0.55 * (postL - preAllL) + 0.45 * (postE - preAllE);
    const edge =
      0.55 * Math.max(0, normLow[b]! - normLow[b - 1]!) +
      0.45 * Math.max(0, unsmoothedEnergy[b]! - unsmoothedEnergy[b - 1]!);

    const reachesDrop =
      postE >= highEnergyRef * 0.62 && postL >= highLowRef * 0.48 ? 1.0 : 0.35;
    // Slight preference for canonical 4-bar / 8-bar / 16-bar boundaries and earlier first drops
    const gridBonus = b % 4 === 0 ? 1.14 : 1.0;
    const earlyPrior = 1.0 - b * 0.008;
    const score =
      (stepLocal * 0.45 + stepIntro * 0.35 + edge * 0.2) * reachesDrop * gridBonus * earlyPrior;

    if (score > bestNovelty) {
      bestNovelty = score;
      bestDropBar = b;
    }
  }

  const immediateGroove =
    start3E >= highEnergyRef * 0.58 &&
    start3L >= highLowRef * 0.48 &&
    bestNovelty < 0.34;

  const firstDropBlock = immediateGroove
    ? 0
    : Math.min(numBlocks - 1, Math.max(0, Math.round(bestDropBar / 4)));

  // Assign a role to each 4-bar block
  const blockRoles: SectionRole[] = new Array<SectionRole>(numBlocks);
  for (let k = 0; k < numBlocks; k++) {
    if (k < firstDropBlock) {
      // Split pre-drop into intro vs build: if energy/flux is rising toward the drop, mark as build
      if (firstDropBlock >= 2 && k >= Math.floor(firstDropBlock / 2)) {
        blockRoles[k] = 'build';
      } else {
        blockRoles[k] = 'intro';
      }
    } else if (k === firstDropBlock) {
      blockRoles[k] = 'drop';
    } else if (k >= numBlocks - 2 && blockEnergy[k]! < highEnergyRef * 0.68) {
      blockRoles[k] = 'outro';
    } else {
      const e = blockEnergy[k]!;
      const l = blockLow[k]!;
      const nextE = k + 1 < numBlocks ? blockEnergy[k + 1]! : e;
      if (e >= highEnergyRef * 0.72 && l >= highLowRef * 0.58) {
        blockRoles[k] = 'drop';
      } else if (nextE > e + 0.14 && k + 1 < numBlocks) {
        blockRoles[k] = 'build';
      } else {
        blockRoles[k] = 'breakdown';
      }
    }
  }

  // Merge consecutive 4-bar blocks with identical roles into `sections[]`
  const sections: BeatSection[] = [];
  for (let k = 0; k < numBlocks; k++) {
    const role = blockRoles[k]!;
    const startBar = k * 4;
    const bars = Math.min(4, totalBars - startBar);
    if (bars <= 0) continue;

    const last = sections[sections.length - 1];
    if (last && last.role === role) {
      last.bars += bars;
    } else {
      sections.push({ startBar, bars, role });
    }
  }

  if (sections.length === 0) {
    sections.push({ startBar: 0, bars: totalBars, role: 'drop' });
  }

  return { barEnergy, sections };
}

function downsampleEnvelope(env: Float32Array, targetPoints: number): Float32Array {
  if (env.length <= targetPoints) return new Float32Array(env);
  const out = new Float32Array(targetPoints);
  const ratio = env.length / targetPoints;
  for (let i = 0; i < targetPoints; i++) {
    const start = Math.floor(i * ratio);
    const end = Math.min(env.length, Math.ceil((i + 1) * ratio));
    let maxVal = 0;
    for (let j = start; j < end; j++) {
      if (env[j]! > maxVal) maxVal = env[j]!;
    }
    out[i] = maxVal;
  }
  return out;
}

/**
 * Pure synchronous DSP entrypoint. Safe to run in a Web Worker or directly in Node/Vitest.
 */
export function analyzePcm(
  pcm: Float32Array,
  sampleRate: number,
  meta: AnalysisMetadata,
): AnalysisResult {
  const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const durationSec =
    meta.durationSec ?? Math.round((pcm.length / Math.max(1, sampleRate)) * 1000) / 1000;

  const features = extractSpectralFeatures(pcm, sampleRate);
  const coarse = estimateCoarseTempo(features.rhythmEnv, features.fps);
  const peaks = extractOnsetPeaks(features.rhythmEnv, features.kickEnv, features.fps);
  const grid = refineConstantTempoGrid(coarse.candidates, peaks);

  const tempoStable = checkTempoStability(
    grid.bpm,
    grid.beatPhaseOffsetSec,
    features.rhythmEnv,
    features.frameRms,
    features.fps,
  );

  const downbeat = selectDownbeatOffset(grid.bpm, grid.beatPhaseOffsetSec, features);
  const { barEnergy, sections } = computeBarEnergyAndSections(
    grid.bpm,
    downbeat.firstBeatOffsetSec,
    durationSec,
    features,
  );

  const tempoConf = Math.round(
    Math.max(0.1, Math.min(0.99, 0.55 * coarse.tempoConfidence + 0.45 * grid.alignmentScore)) * 100,
  ) / 100;

  const beatMap: BeatMap = {
    version: 1,
    contentHash: meta.contentHash,
    title: meta.title,
    artist: meta.artist,
    durationSec,
    bpm: grid.bpm,
    firstBeatOffsetSec: downbeat.firstBeatOffsetSec,
    beatsPerBar: BEATS_PER_BAR,
    barEnergy,
    sections,
    confidence: {
      tempo: tempoConf,
      downbeat: downbeat.downbeatConfidence,
      tempoStable,
    },
    source: 'analysis',
  };

  const t1 = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const analysisTimeMs = Math.round((t1 - t0) * 10) / 10;

  if (meta.includeDebugEnvelopes) {
    return {
      beatMap,
      debug: {
        onsetPreview: downsampleEnvelope(features.onsetEnv, 900),
        kickPreview: downsampleEnvelope(features.kickEnv, 900),
        tempoCurveBpm: coarse.curveBpm,
        tempoCurveScore: coarse.curveScore,
        analysisTimeMs,
      },
    };
  }

  return { beatMap };
}

// Attach Web Worker message listener only when executing inside a dedicated worker context
const isWorkerScope =
  typeof self !== 'undefined' &&
  typeof window === 'undefined' &&
  typeof (self as { postMessage?: unknown }).postMessage === 'function' &&
  typeof (globalThis as { process?: unknown }).process === 'undefined';

if (isWorkerScope) {
  const workerSelf = self as unknown as {
    onmessage: ((e: MessageEvent<AnalysisWorkerRequest>) => void) | null;
    postMessage: (msg: AnalysisWorkerResponse, transfer?: Transferable[]) => void;
  };

  workerSelf.onmessage = (e: MessageEvent<AnalysisWorkerRequest>) => {
    const { id, pcm, sampleRate, meta } = e.data;
    try {
      const result = analyzePcm(pcm, sampleRate, meta);
      const transfers: Transferable[] = [];
      if (result.debug) {
        transfers.push(
          result.debug.onsetPreview.buffer,
          result.debug.kickPreview.buffer,
          result.debug.tempoCurveBpm.buffer,
          result.debug.tempoCurveScore.buffer,
        );
      }
      workerSelf.postMessage({ id, ok: true, result }, transfers);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      workerSelf.postMessage({ id, ok: false, error: message });
    }
  };
}
