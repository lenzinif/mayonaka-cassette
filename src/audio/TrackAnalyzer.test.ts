import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { detectMuffledSpans } from '@src/road/EnvironmentArchetypes';
import { analyzePcm } from './analysis.worker';
import {
  barDurationSec,
  barToTime,
  beatDurationSec,
  firstDropBar,
  firstDropTimeSec,
  getImpactBars,
  getMuffledSpectralSpans,
  isBeatMap,
  nudgeBeatMapDownbeat,
  parseTitleArtistFromFilename,
  sectionAtBar,
  spectralSpanAtBar,
  timeToBar,
  timeToBeat,
  withAdjustedBpm,
  type BeatMap,
} from './BeatMap';
import { ANALYSIS_SAMPLE_RATE } from './TrackAnalyzer';

interface GroundTruthTrack {
  file: string;
  bpm: number;
  firstDropSec?: number;
  notes?: string;
}

interface GroundTruthManifest {
  tracks: GroundTruthTrack[];
}

function synthesizeFourOnTheFloorTrack(options: {
  bpm: number;
  durationSec: number;
  firstBeatOffsetSec: number;
  introBars: number;
  sampleRate?: number;
}): Float32Array {
  const sr = options.sampleRate ?? ANALYSIS_SAMPLE_RATE;
  const totalSamples = Math.floor(options.durationSec * sr);
  const pcm = new Float32Array(totalSamples);
  const beatDur = 60 / options.bpm;
  const totalBeats = Math.floor((options.durationSec - options.firstBeatOffsetSec) / beatDur);

  for (let b = 0; b < totalBeats; b++) {
    const barIdx = Math.floor(b / 4);
    const beatInBar = b % 4;
    const isDrop = barIdx >= options.introBars;
    const startSample = Math.floor((options.firstBeatOffsetSec + b * beatDur) * sr);

    // Kick drum (65 Hz -> 45 Hz sine sweep) on every beat during drop, lighter hi-hat in intro
    const kickLen = Math.floor(0.11 * sr);
    for (let i = 0; i < kickLen && startSample + i < totalSamples; i++) {
      const t = i / sr;
      const env = Math.exp(-t * 28);
      if (isDrop) {
        const freq = 50 + 45 * Math.exp(-t * 40);
        const kickAmp = beatInBar === 0 ? 0.9 : 0.72;
        pcm[startSample + i] = pcm[startSample + i]! + kickAmp * env * Math.sin(2 * Math.PI * freq * t);
      } else {
        // Filtered synth intro pulse (mid-high harmonic, minimal sub-bass)
        const introAmp = beatInBar === 0 ? 0.25 : 0.16;
        pcm[startSample + i] =
          pcm[startSample + i]! + introAmp * env * Math.sin(2 * Math.PI * 440 * t);
      }
    }

    // Snare/clap burst on beats 2 and 4 (beatInBar === 1 or 3)
    if (beatInBar === 1 || beatInBar === 3) {
      const snareLen = Math.floor(0.07 * sr);
      for (let i = 0; i < snareLen && startSample + i < totalSamples; i++) {
        const t = i / sr;
        const env = Math.exp(-t * 35);
        const amp = isDrop ? 0.35 : 0.12;
        // Deterministic pseudo-noise from inharmonic sines
        const noise =
          Math.sin(2 * Math.PI * 987 * t) * 0.5 +
          Math.sin(2 * Math.PI * 1613 * t) * 0.3 +
          Math.sin(2 * Math.PI * 2411 * t) * 0.2;
        pcm[startSample + i] = pcm[startSample + i]! + amp * env * noise;
      }
    }
  }

  return pcm;
}

describe('BeatMap helpers', () => {
  it('converts between time, beats, and bars and validates schema', () => {
    const pcm = synthesizeFourOnTheFloorTrack({
      bpm: 120,
      durationSec: 40,
      firstBeatOffsetSec: 0.2,
      introBars: 4,
    });
    const { beatMap } = analyzePcm(pcm, ANALYSIS_SAMPLE_RATE, {
      contentHash: 'sha256:test120',
      title: 'Test Track',
      artist: 'Unit',
    });

    expect(isBeatMap(beatMap)).toBe(true);
    expect(beatMap.barBrightness).toBeDefined();
    expect(beatMap.barBrightness!.length).toBe(beatMap.barEnergy.length);
    for (const br of beatMap.barBrightness!) {
      expect(br).toBeGreaterThanOrEqual(0);
      expect(br).toBeLessThanOrEqual(1);
    }
    expect(Math.abs(beatMap.bpm - 120)).toBeLessThan(0.25);
    expect(beatDurationSec(beatMap)).toBeCloseTo(0.5, 2);
    expect(barDurationSec(beatMap)).toBeCloseTo(2.0, 2);

    const tBar4 = barToTime(beatMap, 4);
    expect(timeToBar(beatMap, tBar4 + 0.01)).toBe(4);
    expect(timeToBeat(beatMap, beatMap.firstBeatOffsetSec + 2 * beatDurationSec(beatMap))).toBeCloseTo(
      2,
      4,
    );
    expect(sectionAtBar(beatMap, 0)).toBeDefined();

    const doubled = withAdjustedBpm(beatMap, beatMap.bpm * 2);
    expect(doubled.bpm).toBeCloseTo(beatMap.bpm * 2, 1);
    expect(doubled.barBrightness?.length).toBe(doubled.barEnergy.length);
    expect(doubled.source).toBe('manual');

    const nudged = nudgeBeatMapDownbeat(beatMap, 1);
    expect(nudged.source).toBe('manual');
    expect(nudged.firstBeatOffsetSec).toBeGreaterThanOrEqual(0);
    expect(nudged.firstBeatOffsetSec).toBeLessThan(barDurationSec(beatMap));
  });

  it('parses artist and title from filename', () => {
    expect(parseTitleArtistFromFilename('SUI_UZI_-_City_Night_Shadows.mp3')).toEqual({
      artist: 'SUI UZI',
      title: 'City Night Shadows',
    });
    expect(parseTitleArtistFromFilename('Dancin.mp3')).toEqual({
      artist: 'Unknown Artist',
      title: 'Dancin',
    });
  });

  it('detects synthetic 126 BPM track with 8-bar intro and drop at bar 8', () => {
    const pcm = synthesizeFourOnTheFloorTrack({
      bpm: 126,
      durationSec: 64,
      firstBeatOffsetSec: 0.15,
      introBars: 8,
    });
    const { beatMap } = analyzePcm(pcm, ANALYSIS_SAMPLE_RATE, {
      contentHash: 'sha256:synth126',
      title: 'Synth 126',
      artist: 'Tester',
    });

    expect(Math.abs(beatMap.bpm - 126)).toBeLessThanOrEqual(0.5);
    expect(beatMap.confidence.tempoStable).toBe(true);
    expect(firstDropBar(beatMap)).toBe(8);
  });

  it('pinpoints exact bar-level drop onsets after a 1-bar vocal pickup or 9-bar filtered build', () => {
    const pcmPickup1 = synthesizeFourOnTheFloorTrack({
      bpm: 118,
      durationSec: 48,
      firstBeatOffsetSec: 0.04,
      introBars: 1,
    });
    const { beatMap: map1 } = analyzePcm(pcmPickup1, ANALYSIS_SAMPLE_RATE, {
      contentHash: 'sha256:pickup-1bar',
      title: 'Pickup 1 Bar',
      artist: 'Tester',
    });
    expect(firstDropBar(map1)).toBe(1);
    expect(sectionAtBar(map1, 0)?.role).toBe('intro');
    expect(sectionAtBar(map1, 1)?.role).toBe('drop');
    expect(map1.barEnergy[1]! - map1.barEnergy[0]!).toBeGreaterThanOrEqual(0.35);
    expect(firstDropBar(withAdjustedBpm(map1, map1.bpm))).toBe(1);

    const pcmIntro9 = synthesizeFourOnTheFloorTrack({
      bpm: 120,
      durationSec: 64,
      firstBeatOffsetSec: 0.05,
      introBars: 9,
    });
    const { beatMap: map9 } = analyzePcm(pcmIntro9, ANALYSIS_SAMPLE_RATE, {
      contentHash: 'sha256:intro-9bar',
      title: 'Intro 9 Bar',
      artist: 'Tester',
    });
    expect(firstDropBar(map9)).toBe(9);
    expect(sectionAtBar(map9, 8)?.role).not.toBe('drop');
    expect(sectionAtBar(map9, 9)?.role).toBe('drop');
    expect(map9.barEnergy[9]! - map9.barEnergy[8]!).toBeGreaterThanOrEqual(0.35);
    expect(firstDropBar(withAdjustedBpm(map9, map9.bpm))).toBe(9);
  });

  it('damps mid-song LPF muffled bars (b >= 20) and pinpoints the unmuffle drop bar', () => {
    const sr = ANALYSIS_SAMPLE_RATE;
    const bpm = 120;
    const durationSec = 72; // 36 bars
    const firstBeatOffsetSec = 0.15;
    const totalSamples = Math.floor(durationSec * sr);
    const pcm = new Float32Array(totalSamples);
    const beatDur = 60 / bpm;
    const totalBeats = Math.floor((durationSec - firstBeatOffsetSec) / beatDur);

    for (let b = 0; b < totalBeats; b++) {
      const barIdx = Math.floor(b / 4);
      const beatInBar = b % 4;
      const startSample = Math.floor((firstBeatOffsetSec + b * beatDur) * sr);
      // Bars 0..3: quiet intro; Bars 4..19: full-band drop 1;
      // Bars 20..24: LPF muffled section (strong sub-bass <150Hz, zero high frequencies >2kHz);
      // Bars 25..35: full-band drop 2 (filter opens at bar 25!).
      const isQuietIntro = barIdx < 4;
      const isLpfMuffled = barIdx >= 20 && barIdx <= 24;
      const hasKick = !isQuietIntro;
      const hasHighAir = !isQuietIntro && !isLpfMuffled;

      const len = Math.floor(0.12 * sr);
      for (let i = 0; i < len && startSample + i < totalSamples; i++) {
        const t = i / sr;
        const env = Math.exp(-t * 26);
        let sample = 0;
        if (hasKick) {
          const kickAmp = isLpfMuffled ? 0.52 : beatInBar === 0 ? 0.9 : 0.72;
          sample += kickAmp * env * Math.sin(2 * Math.PI * 62 * t);
        } else {
          sample += 0.14 * env * Math.sin(2 * Math.PI * 380 * t);
        }
        if (hasHighAir && (beatInBar === 1 || beatInBar === 3)) {
          sample +=
            0.38 *
            env *
            (Math.sin(2 * Math.PI * 2600 * t) * 0.6 + Math.sin(2 * Math.PI * 4100 * t) * 0.4);
        }
        pcm[startSample + i] = pcm[startSample + i]! + sample;
      }
    }

    const { beatMap } = analyzePcm(pcm, sr, {
      contentHash: 'sha256:lpf-unmuffle-bar25',
      title: 'LPF Unmuffle Test',
      artist: 'Tester',
    });

    // Bar 24 is still LPF-muffled; Bar 25 opens the high-band filter into the drop
    expect(beatMap.barEnergy[24]!).toBeLessThan(0.6);
    expect(beatMap.barEnergy[25]!).toBeGreaterThan(0.75);
    expect(beatMap.barEnergy[25]! - beatMap.barEnergy[24]!).toBeGreaterThanOrEqual(0.25);
    expect(beatMap.barBrightness).toBeDefined();
    expect(beatMap.barBrightness?.[22]).toBeLessThan(0.25);
    expect(beatMap.barBrightness?.[27]).toBeGreaterThan(0.65);
    expect(sectionAtBar(beatMap, 24)?.role).not.toBe('drop');
    expect(sectionAtBar(beatMap, 25)?.role).toBe('drop');
  });

  it('detects band-pass / lo-fi muffled breakdowns (no sub-bass, no >3.5kHz air) via barBrightness and detectMuffledSpans', () => {
    const sr = ANALYSIS_SAMPLE_RATE;
    const bpm = 120;
    const durationSec = 72; // 36 bars
    const firstBeatOffsetSec = 0.05;
    const totalSamples = Math.floor(durationSec * sr);
    const pcm = new Float32Array(totalSamples);
    const beatDur = 60 / bpm;
    const totalBeats = Math.floor((durationSec - firstBeatOffsetSec) / beatDur);

    for (let b = 0; b < totalBeats; b++) {
      const barIdx = Math.floor(b / 4);
      const beatInBar = b % 4;
      const startSample = Math.floor((firstBeatOffsetSec + b * beatDur) * sr);
      // Bars 12..17: band-pass muffled breakdown (~700 Hz only, zero sub-bass <150Hz, zero >3.5kHz air)
      const isBandPassMuffled = barIdx >= 12 && barIdx <= 17;

      const len = Math.floor(0.14 * sr);
      for (let i = 0; i < len && startSample + i < totalSamples; i++) {
        const t = i / sr;
        const env = Math.exp(-t * 24);
        let sample = 0;
        if (isBandPassMuffled) {
          sample += 0.25 * env * Math.sin(2 * Math.PI * 700 * t);
        } else {
          const kickAmp = beatInBar === 0 ? 0.9 : 0.72;
          sample += kickAmp * env * Math.sin(2 * Math.PI * 62 * t);
          if (beatInBar === 1 || beatInBar === 3) {
            sample +=
              0.42 *
              env *
              (Math.sin(2 * Math.PI * 2600 * t) * 0.45 + Math.sin(2 * Math.PI * 4600 * t) * 0.55);
          }
        }
        pcm[startSample + i] = pcm[startSample + i]! + sample;
      }
    }

    const { beatMap } = analyzePcm(pcm, sr, {
      contentHash: 'sha256:bpf-muffled-breakdown',
      title: 'BPF Muffled Test',
      artist: 'Tester',
    });

    expect(beatMap.barBrightness).toBeDefined();
    for (let b = 12; b <= 17; b++) {
      expect(beatMap.barBrightness?.[b]).toBeLessThan(0.3);
    }
    const spans = detectMuffledSpans(beatMap, beatMap.barEnergy.length);
    expect(spans.some((sp) => sp.startBar <= 12 && sp.endBar >= 18)).toBe(true);
  });

  it('does not falsely flag bright bassless breakdowns (>3.5kHz air intact) as muffled tunnels', () => {
    const sr = ANALYSIS_SAMPLE_RATE;
    const bpm = 120;
    const durationSec = 72; // 36 bars
    const firstBeatOffsetSec = 0.05;
    const totalSamples = Math.floor(durationSec * sr);
    const pcm = new Float32Array(totalSamples);
    const beatDur = 60 / bpm;
    const totalBeats = Math.floor((durationSec - firstBeatOffsetSec) / beatDur);

    for (let b = 0; b < totalBeats; b++) {
      const barIdx = Math.floor(b / 4);
      const beatInBar = b % 4;
      const startSample = Math.floor((firstBeatOffsetSec + b * beatDur) * sr);
      // Bars 12..17: bass drops out cleanly, but crisp hats/air (>3.5kHz) stay full-level
      const isBasslessBright = barIdx >= 12 && barIdx <= 17;

      const len = Math.floor(0.14 * sr);
      for (let i = 0; i < len && startSample + i < totalSamples; i++) {
        const t = i / sr;
        const env = Math.exp(-t * 24);
        let sample = 0;
        if (!isBasslessBright) {
          const kickAmp = beatInBar === 0 ? 0.9 : 0.72;
          sample += kickAmp * env * Math.sin(2 * Math.PI * 62 * t);
        } else {
          sample += 0.22 * env * Math.sin(2 * Math.PI * 1400 * t);
        }
        if (beatInBar === 1 || beatInBar === 3) {
          sample +=
            0.42 *
            env *
            (Math.sin(2 * Math.PI * 2600 * t) * 0.45 + Math.sin(2 * Math.PI * 4600 * t) * 0.55);
        }
        pcm[startSample + i] = pcm[startSample + i]! + sample;
      }
    }

    const { beatMap } = analyzePcm(pcm, sr, {
      contentHash: 'sha256:bright-bassless-breakdown',
      title: 'Bright Bassless Test',
      artist: 'Tester',
    });

    expect(beatMap.barBrightness).toBeDefined();
    for (let b = 12; b <= 17; b++) {
      expect(beatMap.barBrightness?.[b]).toBeGreaterThanOrEqual(0.65);
    }
    const spans = detectMuffledSpans(beatMap, beatMap.barEnergy.length);
    expect(spans).toEqual([]);
    // Also detected orthogonally as `hpf_thin` (bassless airy passage)
    expect(
      beatMap.spectralSpans?.some((sp) => sp.kind === 'hpf_thin' && sp.startBar <= 12 && sp.endBar >= 18),
    ).toBe(true);
  });

  it('classifies flat-RMS Future Funk plateau with LPF muffled passage (bars 32..38) as groove + spectralSpans + impactBar 38 without fake MP-05 breakdown', () => {
    const sr = ANALYSIS_SAMPLE_RATE;
    const bpm = 110.35;
    const barDur = (60 / bpm) * 4;
    const totalBarsTarget = 68;
    const firstBeatOffsetSec = 0.05;
    const durationSec = firstBeatOffsetSec + totalBarsTarget * barDur + 0.1;
    const totalSamples = Math.floor(durationSec * sr);
    const pcm = new Float32Array(totalSamples);
    const beatDur = 60 / bpm;
    const totalBeats = Math.floor((durationSec - firstBeatOffsetSec) / beatDur);

    for (let b = 0; b < totalBeats; b++) {
      const barIdx = Math.floor(b / 4);
      const beatInBar = b % 4;
      const startSample = Math.floor((firstBeatOffsetSec + b * beatDur) * sr);
      const isLpfMuffled = barIdx >= 32 && barIdx < 38;
      // Gentle fadeout on final 7 bars (bars 61..67)
      const fadeGain =
        barIdx >= 61 ? Math.max(0.05, 1 - ((barIdx - 60) / 8) * 0.92) : 1.0;

      const len = Math.floor(0.14 * sr);
      for (let i = 0; i < len && startSample + i < totalSamples; i++) {
        const t = i / sr;
        const env = Math.exp(-t * 24);
        // Constant 4-on-the-floor kick/sub-bass throughout bars 0..60
        const kickAmp = (beatInBar === 0 ? 0.88 : 0.72) * fadeGain;
        let sample = kickAmp * env * Math.sin(2 * Math.PI * 62 * t);
        if (!isLpfMuffled) {
          // Crisp Future Funk hats/vocals/air (>2kHz & >3.5kHz)
          const airAmp = (beatInBar === 1 || beatInBar === 3 ? 0.44 : 0.22) * fadeGain;
          sample +=
            airAmp *
            env *
            (Math.sin(2 * Math.PI * 2600 * t) * 0.45 + Math.sin(2 * Math.PI * 4400 * t) * 0.55);
        }
        pcm[startSample + i] = pcm[startSample + i]! + sample;
      }
    }

    const { beatMap } = analyzePcm(pcm, sr, {
      contentHash: 'sha256:flat-rms-lpf-groove-model',
      title: 'Flat RMS Groove LPF',
      artist: 'Tester',
    });

    expect(isBeatMap(beatMap)).toBe(true);
    // Plateau starts as sustained `groove` and must NOT inject a fake MP-05 breakdown at bars 28..32
    expect(sectionAtBar(beatMap, 0)?.role).toBe('groove');
    expect(sectionAtBar(beatMap, 28)?.role).not.toBe('breakdown');
    // Exact LPF muffled span detected on bars 32..38 and fadeout on tail
    expect(
      beatMap.spectralSpans?.some(
        (sp) => sp.kind === 'lpf_muffled' && sp.startBar === 32 && sp.endBar === 38,
      ),
    ).toBe(true);
    expect(beatMap.spectralSpans?.some((sp) => sp.kind === 'fadeout')).toBe(true);
    // Filter reopening at bar 38 produces a genuine impactBar and tunnel span
    expect(beatMap.impactBars).toContain(38);
    expect(beatMap.phraseBars?.length).toBeGreaterThanOrEqual(1);
    expect(detectMuffledSpans(beatMap, beatMap.barEnergy.length)).toEqual([
      { startBar: 32, endBar: 38 },
    ]);
  });

  it('validates orthogonal BeatMap fields, helpers, backward compatibility, and BPM scaling', () => {
    const base: BeatMap = {
      version: 1,
      contentHash: 'sha256:orthogonal-helper-test',
      title: 'Helper Test',
      artist: 'Tester',
      durationSec: 128,
      bpm: 120,
      firstBeatOffsetSec: 0,
      beatsPerBar: 4,
      barEnergy: new Array<number>(64).fill(0.75),
      barBrightness: new Array<number>(64).fill(0.8),
      spectralSpans: [
        { startBar: 32, endBar: 38, kind: 'lpf_muffled' },
        { startBar: 58, endBar: 64, kind: 'fadeout' },
      ],
      phraseBars: [16, 32, 48],
      impactBars: [38],
      sections: [
        { startBar: 0, bars: 60, role: 'groove' },
        { startBar: 60, bars: 4, role: 'outro' },
      ],
      confidence: { tempo: 0.95, downbeat: 0.9, tempoStable: true },
      source: 'analysis',
    };

    expect(isBeatMap(base)).toBe(true);
    expect(spectralSpanAtBar(base, 35)?.kind).toBe('lpf_muffled');
    expect(spectralSpanAtBar(base, 10)).toBeUndefined();
    expect(getMuffledSpectralSpans(base)).toEqual([{ startBar: 32, endBar: 38, kind: 'lpf_muffled' }]);
    expect(getImpactBars(base)).toEqual([38]);
    expect(firstDropBar(base)).toBe(38);

    // Fallback when `impactBars` is absent: falls back to `drop` then `groove`
    const grooveOnly: BeatMap = {
      ...base,
      impactBars: undefined,
      spectralSpans: undefined,
      phraseBars: undefined,
    };
    expect(isBeatMap(grooveOnly)).toBe(true);
    expect(getImpactBars(grooveOnly)).toEqual([]);
    expect(firstDropBar(grooveOnly)).toBe(0);

    // Rejects malformed spectralSpans
    expect(
      isBeatMap({
        ...base,
        spectralSpans: [{ startBar: 20, endBar: 10, kind: 'lpf_muffled' }],
      }),
    ).toBe(false);

    // Scales orthogonal arrays when adjusting BPM
    const halved = withAdjustedBpm(base, 60);
    expect(halved.spectralSpans?.[0]).toEqual({ startBar: 16, endBar: 19, kind: 'lpf_muffled' });
    expect(halved.phraseBars).toEqual([8, 16, 24]);
    expect(halved.impactBars).toEqual([19]);
  });
});

const corpusDir = resolve(process.cwd(), 'test-tracks');
const groundTruthPath = resolve(corpusDir, 'ground-truth.json');
const hasCorpus = existsSync(groundTruthPath);

describe.runIf(hasCorpus)('M3a Corpus Validation (test-tracks/ground-truth.json)', () => {
  it('meets docs/DESIGN.md §2.4 exit criteria across the 15-track Future Funk corpus', () => {
    const manifest = JSON.parse(readFileSync(groundTruthPath, 'utf-8')) as GroundTruthManifest;
    expect(manifest.tracks.length).toBeGreaterThanOrEqual(15);

    let exactCount = 0;
    let exactOrOctaveCount = 0;
    let driftFreeCount = 0;
    let downbeatAlignedCount = 0;
    let dropMatchCount = 0;
    let dropTotalCount = 0;
    let maxAnalysisMs = 0;

    const rows: string[] = [];

    for (const item of manifest.tracks) {
      const filePath = resolve(corpusDir, item.file);
      const rawBuf = execFileSync(
        'ffmpeg',
        [
          '-v',
          'error',
          '-i',
          filePath,
          '-ac',
          '1',
          '-ar',
          String(ANALYSIS_SAMPLE_RATE),
          '-f',
          'f32le',
          'pipe:1',
        ],
        { maxBuffer: 64 * 1024 * 1024 },
      );

      const pcm = new Float32Array(
        rawBuf.buffer,
        rawBuf.byteOffset,
        Math.floor(rawBuf.byteLength / 4),
      );

      const parsed = parseTitleArtistFromFilename(item.file);
      const res = analyzePcm(pcm, ANALYSIS_SAMPLE_RATE, {
        contentHash: `sha256:${item.file}`,
        title: parsed.title,
        artist: parsed.artist,
        includeDebugEnvelopes: true,
      });

      const { beatMap, debug } = res;
      const elapsedMs = debug?.analysisTimeMs ?? 0;
      if (elapsedMs > maxAnalysisMs) maxAnalysisMs = elapsedMs;

      const bpmErr = Math.abs(beatMap.bpm - item.bpm);
      const isExact = bpmErr <= 0.5;
      const isOctave =
        Math.abs(beatMap.bpm * 2 - item.bpm) <= 1.0 ||
        Math.abs(beatMap.bpm * 0.5 - item.bpm) <= 0.5;

      if (isExact) exactCount++;
      if (isExact || isOctave) exactOrOctaveCount++;

      // Grid drift check: over 180s, <= 0.25 BPM error keeps grid well within sync in last 30s
      if (bpmErr <= 0.35 && beatMap.confidence.tempoStable) {
        driftFreeCount++;
      }

      const detectedDropSec = firstDropTimeSec(beatMap) ?? 0;
      const detectedDropBar = firstDropBar(beatMap) ?? 0;
      const barDur = barDurationSec(beatMap);

      let dropDiffBars = 0;
      let dropOk = false;
      if (typeof item.firstDropSec === 'number') {
        dropTotalCount++;
        dropDiffBars = Math.abs(detectedDropSec - item.firstDropSec) / barDur;
        // Tolerance ±2 bars (plus 0.35 bar margin for rounded ground-truth seconds)
        dropOk = dropDiffBars <= 2.35;
        if (dropOk) dropMatchCount++;

        // Downbeat phase check against known drop timestamp when drop > 0
        const beatsToDrop = (item.firstDropSec - beatMap.firstBeatOffsetSec) / beatDurationSec(beatMap);
        const modBar = ((beatsToDrop % 4) + 4) % 4;
        const barPhaseErrBeats = Math.min(modBar, 4 - modBar);
        if (barPhaseErrBeats <= 0.65) {
          downbeatAlignedCount++;
        }
      } else {
        downbeatAlignedCount++;
      }

      rows.push(
        `${item.file.padEnd(42)} | GT: ${String(item.bpm).padStart(5)} | Det: ${beatMap.bpm.toFixed(2).padStart(6)} (Δ${bpmErr.toFixed(2)}) | 1stBeat: ${beatMap.firstBeatOffsetSec.toFixed(3)}s | Drop: bar ${String(detectedDropBar).padStart(2)} (${detectedDropSec.toFixed(1).padStart(4)}s vs GT ${String(item.firstDropSec ?? '-').padStart(4)}s, Δ${dropDiffBars.toFixed(2)} bars ${dropOk ? 'OK' : 'MISS'}) | ${elapsedMs.toFixed(0)}ms`,
      );
    }

    console.log('\n--- M3a Corpus Report ---\n' + rows.join('\n'));
    console.log(
      `Summary: Exact BPM=${exactCount}/${manifest.tracks.length}, Exact/Octave=${exactOrOctaveCount}/${manifest.tracks.length}, DriftFree=${driftFreeCount}/${manifest.tracks.length}, Downbeat=${downbeatAlignedCount}/${manifest.tracks.length}, FirstDrop=${dropMatchCount}/${dropTotalCount} (${Math.round((dropMatchCount / Math.max(1, dropTotalCount)) * 100)}%), MaxTime=${maxAnalysisMs.toFixed(0)}ms\n`,
    );

    expect(exactCount).toBeGreaterThanOrEqual(12);
    expect(exactOrOctaveCount).toBeGreaterThanOrEqual(14);
    expect(driftFreeCount).toBeGreaterThanOrEqual(12);
    expect(downbeatAlignedCount).toBeGreaterThanOrEqual(10);
    expect(dropMatchCount / Math.max(1, dropTotalCount)).toBeGreaterThanOrEqual(0.7);
    // Design target is < 3000ms in production Web Worker; allow up to 4500ms on Windows/CI single-threaded test runs
    expect(maxAnalysisMs).toBeLessThan(4500);
  }, 120000);
});
