/**
 * BeatMap schema, validation, and beat/bar/section coordinate helpers (docs/DESIGN.md §2.2).
 *
 * Pure TypeScript module (AGENTS.md §2: zero React imports).
 */

export type SectionRole = 'intro' | 'build' | 'drop' | 'breakdown' | 'outro';

export interface BeatSection {
  startBar: number;
  bars: number;
  role: SectionRole;
}

export interface BeatConfidence {
  tempo: number;
  downbeat: number;
  tempoStable: boolean;
}

export type BeatMapSource = 'analysis' | 'manual' | 'bundled';

export interface BeatMap {
  version: 1;
  /** SHA-256 content hash (`sha256:...`), also used as the deterministic road seed. */
  contentHash: string;
  title: string;
  artist: string;
  durationSec: number;
  /** Refined constant tempo in beats per minute (not integer-rounded). */
  bpm: number;
  /** Time in seconds of the first downbeat (bar 0, beat 0). */
  firstBeatOffsetSec: number;
  beatsPerBar: 4;
  /** Smoothed normalised energy in [0, 1], one entry per bar. */
  barEnergy: number[];
  /** Structural sections snapped to 4-bar boundaries. */
  sections: BeatSection[];
  confidence: BeatConfidence;
  source: BeatMapSource;
}

const VALID_ROLES = new Set<SectionRole>(['intro', 'build', 'drop', 'breakdown', 'outro']);
const VALID_SOURCES = new Set<BeatMapSource>(['analysis', 'manual', 'bundled']);

export function isBeatMap(raw: unknown): raw is BeatMap {
  if (typeof raw !== 'object' || raw === null) return false;
  const obj = raw as Record<string, unknown>;
  if (obj.version !== 1) return false;
  if (typeof obj.contentHash !== 'string' || obj.contentHash.length === 0) return false;
  if (typeof obj.title !== 'string' || typeof obj.artist !== 'string') return false;
  if (typeof obj.durationSec !== 'number' || !Number.isFinite(obj.durationSec) || obj.durationSec <= 0)
    return false;
  if (typeof obj.bpm !== 'number' || !Number.isFinite(obj.bpm) || obj.bpm <= 20 || obj.bpm >= 360)
    return false;
  if (typeof obj.firstBeatOffsetSec !== 'number' || !Number.isFinite(obj.firstBeatOffsetSec))
    return false;
  if (obj.beatsPerBar !== 4) return false;
  if (!Array.isArray(obj.barEnergy) || !obj.barEnergy.every((v) => typeof v === 'number' && Number.isFinite(v)))
    return false;
  if (!Array.isArray(obj.sections)) return false;
  for (const sec of obj.sections) {
    if (typeof sec !== 'object' || sec === null) return false;
    const s = sec as Record<string, unknown>;
    if (typeof s.startBar !== 'number' || typeof s.bars !== 'number' || s.bars <= 0) return false;
    if (typeof s.role !== 'string' || !VALID_ROLES.has(s.role as SectionRole)) return false;
  }
  if (typeof obj.confidence !== 'object' || obj.confidence === null) return false;
  const conf = obj.confidence as Record<string, unknown>;
  if (
    typeof conf.tempo !== 'number' ||
    typeof conf.downbeat !== 'number' ||
    typeof conf.tempoStable !== 'boolean'
  ) {
    return false;
  }
  if (typeof obj.source !== 'string' || !VALID_SOURCES.has(obj.source as BeatMapSource)) return false;
  return true;
}

export function validateBeatMap(raw: unknown): BeatMap {
  if (!isBeatMap(raw)) {
    throw new Error('Invalid BeatMap payload');
  }
  return raw;
}

/** Duration of a single beat in seconds (`60 / bpm`). */
export function beatDurationSec(map: Pick<BeatMap, 'bpm'>): number {
  return 60 / map.bpm;
}

/** Duration of a full bar in seconds (`beatsPerBar * 60 / bpm`). */
export function barDurationSec(map: Pick<BeatMap, 'bpm' | 'beatsPerBar'>): number {
  return (60 / map.bpm) * map.beatsPerBar;
}

/** Converts a timestamp in seconds to a continuous beat index relative to `firstBeatOffsetSec`. */
export function timeToBeat(map: Pick<BeatMap, 'bpm' | 'firstBeatOffsetSec'>, timeSec: number): number {
  return (timeSec - map.firstBeatOffsetSec) / beatDurationSec(map);
}

/** Converts a beat index (0-based from first downbeat) to a timestamp in seconds. */
export function beatToTime(map: Pick<BeatMap, 'bpm' | 'firstBeatOffsetSec'>, beatIndex: number): number {
  return map.firstBeatOffsetSec + beatIndex * beatDurationSec(map);
}

/** Converts a timestamp in seconds to a 0-based bar index (`Math.floor`). */
export function timeToBar(
  map: Pick<BeatMap, 'bpm' | 'beatsPerBar' | 'firstBeatOffsetSec'>,
  timeSec: number,
): number {
  return Math.floor(timeToBeat(map, timeSec) / map.beatsPerBar);
}

/** Converts a 0-based bar index to the timestamp in seconds of its downbeat. */
export function barToTime(
  map: Pick<BeatMap, 'bpm' | 'beatsPerBar' | 'firstBeatOffsetSec'>,
  barIndex: number,
): number {
  return beatToTime(map, barIndex * map.beatsPerBar);
}

/** Returns the section covering `barIndex`, or the last section if beyond the end. */
export function sectionAtBar(
  map: Pick<BeatMap, 'sections'>,
  barIndex: number,
): BeatSection | undefined {
  if (map.sections.length === 0) return undefined;
  for (const sec of map.sections) {
    if (barIndex >= sec.startBar && barIndex < sec.startBar + sec.bars) {
      return sec;
    }
  }
  return barIndex < map.sections[0]!.startBar
    ? map.sections[0]
    : map.sections[map.sections.length - 1];
}

/** Returns the starting bar index of the first `drop` section, or `null` if none exists. */
export function firstDropBar(map: Pick<BeatMap, 'sections'>): number | null {
  const drop = map.sections.find((s) => s.role === 'drop');
  return drop ? drop.startBar : null;
}

/** Returns the timestamp in seconds of the first `drop` section, or `null` if none exists. */
export function firstDropTimeSec(
  map: Pick<BeatMap, 'sections' | 'bpm' | 'beatsPerBar' | 'firstBeatOffsetSec'>,
): number | null {
  const bar = firstDropBar(map);
  return bar !== null ? barToTime(map, bar) : null;
}

/**
 * Extracts a clean `{ artist, title }` pair from an audio filename when ID3 tags are unavailable.
 */
export function parseTitleArtistFromFilename(filename: string): { title: string; artist: string } {
  const base = filename
    .replace(/^.*[\\/]/, '')
    .replace(/\.[a-z0-9]{2,5}$/i, '')
    .replace(/_/g, ' ')
    .trim();
  const dashIdx = base.indexOf(' - ');
  if (dashIdx > 0) {
    const artist = base.slice(0, dashIdx).trim();
    const title = base.slice(dashIdx + 3).trim();
    if (artist && title) return { artist, title };
  }
  return { artist: 'Unknown Artist', title: base || 'Untitled Track' };
}

/**
 * Returns a copy of `map` with BPM scaled by `factor` (e.g. `2` or `0.5` for octave fix)
 * or replaced with an explicit `newBpm`. Marks `source: 'manual'`.
 */
export function withAdjustedBpm(map: BeatMap, newBpm: number): BeatMap {
  const clampedBpm = Math.max(40, Math.min(260, newBpm));
  const ratio = clampedBpm / map.bpm;
  const oldBars = map.barEnergy.length;
  const newBars = Math.max(4, Math.round(oldBars * ratio));

  const newBarEnergy: number[] = new Array<number>(newBars);
  for (let i = 0; i < newBars; i++) {
    const srcIdx = Math.min(oldBars - 1, Math.floor(i / ratio));
    newBarEnergy[i] = map.barEnergy[srcIdx] ?? 0.5;
  }

  const newSections: BeatSection[] = [];
  let cursor = 0;
  for (let i = 0; i < map.sections.length; i++) {
    const sec = map.sections[i]!;
    const isLast = i === map.sections.length - 1;
    const scaledBars = isLast
      ? Math.max(4, newBars - cursor)
      : Math.max(4, Math.round((sec.bars * ratio) / 4) * 4);
    if (cursor < newBars) {
      const bars = Math.min(scaledBars, newBars - cursor);
      if (bars > 0) {
        newSections.push({ startBar: cursor, bars, role: sec.role });
        cursor += bars;
      }
    }
  }
  if (newSections.length === 0) {
    newSections.push({ startBar: 0, bars: newBars, role: 'drop' });
  }

  const newBarDur = (60 / clampedBpm) * map.beatsPerBar;
  const firstBeatOffsetSec = ((map.firstBeatOffsetSec % newBarDur) + newBarDur) % newBarDur;

  return {
    ...map,
    bpm: Math.round(clampedBpm * 1000) / 1000,
    firstBeatOffsetSec: Math.round(firstBeatOffsetSec * 10000) / 10000,
    barEnergy: newBarEnergy,
    sections: newSections,
    source: 'manual',
  };
}

/**
 * Shifts the downbeat (`firstBeatOffsetSec`) by `deltaBeats` (typically `+1` or `-1` beat),
 * wrapped into `[0, barDurationSec)`. Marks `source: 'manual'`.
 */
export function nudgeBeatMapDownbeat(map: BeatMap, deltaBeats: number): BeatMap {
  const beatDur = beatDurationSec(map);
  const barDur = barDurationSec(map);
  const shifted = map.firstBeatOffsetSec + deltaBeats * beatDur;
  const wrapped = ((shifted % barDur) + barDur) % barDur;
  return {
    ...map,
    firstBeatOffsetSec: Math.round(wrapped * 10000) / 10000,
    source: 'manual',
  };
}
