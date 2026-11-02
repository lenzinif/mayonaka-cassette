import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { analyzePcm } from './analysis.worker';
import {
  barDurationSec,
  barToTime,
  beatDurationSec,
  firstDropBar,
  firstDropTimeSec,
  isBeatMap,
  nudgeBeatMapDownbeat,
  parseTitleArtistFromFilename,
  sectionAtBar,
  timeToBar,
  timeToBeat,
  withAdjustedBpm,
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
    expect(maxAnalysisMs).toBeLessThan(3000);
  }, 120000);
});
