import { barDurationSec, type BeatMap, type BeatSection, type SectionRole } from '@src/audio/BeatMap';
import { RUMBLE_LENGTH, SEGMENT_LENGTH } from '@src/config/constants';
import { DEFAULT_TUNING, tuning } from '@src/config/tuning';
import { SeededRandom } from '@src/core/SeededRandom';
import { getChunksForRole, ROAD_CHUNKS, type RoadChunk } from './RoadChunks';
import { easeIn, easeInOut } from './RoadProjection';
import { createPoint, type RoadSegment, type Track } from './RoadSegment';
import { HILL } from './TrackBuilder';

export interface PlacedRoadChunk {
  chunkId: string;
  role: SectionRole;
  startBar: number;
  bars: number;
  startSegment: number;
  segmentCount: number;
  mirrored: boolean;
  avgEnergy: number;
}

export interface DropMarker {
  barIndex: number;
  segmentIndex: number;
  worldZ: number;
}

export interface SongTrack extends Track {
  contentHash: string;
  seed: string;
  totalBars: number;
  segmentsPerBar: number;
  /** World units per musical bar (`segmentsPerBar * segmentLength`). */
  barLengthWorld: number;
  /** Reference speed in world units/s used to lay out the track. */
  referenceSpeed: number;
  chunks: PlacedRoadChunk[];
  dropMarkers: DropMarker[];
}

export interface SongRoadOptions {
  /** Overrides `beatMap.contentHash` as the deterministic PRNG seed. */
  seed?: string;
  /** Custom chunk catalog (defaults to `ROAD_CHUNKS`). */
  catalog?: readonly RoadChunk[];
  /** Segment length in world units (defaults to `SEGMENT_LENGTH = 200`). */
  segmentLength?: number;
  /** Max car speed in world units/s (defaults to `tuning.maxSpeed`). */
  maxSpeed?: number;
  /** Reference speed ratio in `(0, 1]` (defaults to `tuning.referenceSpeedRatio`). */
  referenceSpeedRatio?: number;
  /** Curve energy scaling factor (defaults to `tuning.roadCurveEnergyScale`). */
  curveEnergyScale?: number;
  /** Hill energy scaling factor (defaults to `tuning.roadHillEnergyScale`). */
  hillEnergyScale?: number;
}

/**
 * Generates a deterministic pseudo-3D `SongTrack` from a `BeatMap` (AGENTS.md §4.6, docs/DESIGN.md §3).
 *
 * Pure function of `(beatMap, options)`: same `BeatMap` + seed always produces the exact same
 * road geometry and prop placement.
 */
export function generateSongRoad(beatMap: BeatMap, options: SongRoadOptions = {}): SongTrack {
  const seed = options.seed ?? beatMap.contentHash;
  const rng = new SeededRandom(seed);
  const catalog = options.catalog ?? ROAD_CHUNKS;
  const segmentLength = options.segmentLength ?? SEGMENT_LENGTH;

  const maxSpeed = options.maxSpeed ?? tuning.maxSpeed ?? DEFAULT_TUNING.maxSpeed;
  const refRatio =
    options.referenceSpeedRatio ?? tuning.referenceSpeedRatio ?? DEFAULT_TUNING.referenceSpeedRatio;
  const curveEnergyScale =
    options.curveEnergyScale ?? tuning.roadCurveEnergyScale ?? DEFAULT_TUNING.roadCurveEnergyScale;
  const hillEnergyScale =
    options.hillEnergyScale ?? tuning.roadHillEnergyScale ?? DEFAULT_TUNING.roadHillEnergyScale;

  const referenceSpeed = maxSpeed * refRatio;
  const barDur = barDurationSec(beatMap);
  // Keep segmentsPerBar divisible by 4 so quarter-note beat prop spacing is integer-aligned
  const rawSegmentsPerBar = Math.max(16, Math.round((referenceSpeed * barDur) / segmentLength));
  const segmentsPerBar = Math.max(16, Math.round(rawSegmentsPerBar / 4) * 4);
  const segmentsPerBeat = segmentsPerBar / 4;
  const barLengthWorld = segmentsPerBar * segmentLength;

  const sections = normalizeSections(beatMap);
  const totalBars = sections.reduce((acc, s) => acc + s.bars, 0);

  const segments: RoadSegment[] = [];
  const placedChunks: PlacedRoadChunk[] = [];
  const dropMarkers: DropMarker[] = [];

  const lastY = (): number => {
    const last = segments[segments.length - 1];
    return last ? last.p2.worldY : 0;
  };

  const appendSegment = (curve: number, worldY: number): void => {
    const n = segments.length;
    segments.push({
      index: n,
      p1: createPoint(lastY(), n * segmentLength),
      p2: createPoint(worldY, (n + 1) * segmentLength),
      curve,
      stripe: Math.floor(n / RUMBLE_LENGTH) % 2 === 0 ? 0 : 1,
      sprites: [],
      fog: 1,
    });
  };

  let lastChunkId = '';
  let lastCurveSign: -1 | 1 = 1;

  for (let secIdx = 0; secIdx < sections.length; secIdx++) {
    const sec = sections[secIdx]!;
    const nextSec = sections[secIdx + 1];
    const isLastSection = secIdx === sections.length - 1;
    const isBuildBeforeDrop = sec.role === 'build' && nextSec?.role === 'drop';

    if (sec.role === 'drop') {
      const dropSegIdx = sec.startBar * segmentsPerBar;
      dropMarkers.push({
        barIndex: sec.startBar,
        segmentIndex: dropSegIdx,
        worldZ: dropSegIdx * segmentLength,
      });
    }

    let barCursor = sec.startBar;
    const secEndBar = sec.startBar + sec.bars;

    while (barCursor < secEndBar) {
      const remainingBars = secEndBar - barCursor;
      const chunkBars: 4 | 8 = remainingBars >= 8 ? (rng.bool(0.55) ? 8 : 4) : 4;
      const actualBars = Math.min(remainingBars, chunkBars);
      const isFinalChunkOfSection = barCursor + actualBars >= secEndBar;
      const isFinalChunkOfTrack = isLastSection && isFinalChunkOfSection;

      const avgEnergy = averageBarEnergy(beatMap.barEnergy, barCursor, actualBars);
      const chunk = selectChunk(rng, catalog, sec.role, chunkBars, avgEnergy, lastChunkId);
      lastChunkId = chunk.id;

      const mirrored: boolean =
        chunk.allowMirror === false
          ? false
          : rng.bool(0.65)
            ? lastCurveSign > 0
            : rng.bool(0.5);
      const mirrorSign: -1 | 1 = mirrored ? -1 : 1;
      lastCurveSign = mirrorSign;

      const chunkStartSeg = segments.length;
      const chunkSegCount = actualBars * segmentsPerBar;

      // Energy modulation factor around 0.5 baseline energy
      const energyDelta = avgEnergy - 0.5;
      const curveScale = Math.max(0.4, 1 + energyDelta * curveEnergyScale);
      const hillScale = Math.max(0.4, 1 + energyDelta * hillEnergyScale);

      // Scale maneuver bars proportionally if `actualBars < chunk.bars` (e.g. tail of a track)
      const barScale = actualBars / chunk.bars;

      for (let mIdx = 0; mIdx < chunk.maneuvers.length; mIdx++) {
        const m = chunk.maneuvers[mIdx]!;
        const isLastManeuverInChunk = mIdx === chunk.maneuvers.length - 1;

        const mSegCount = isLastManeuverInChunk
          ? chunkStartSeg + chunkSegCount - segments.length
          : Math.max(4, Math.round(m.bars * barScale * segmentsPerBar));

        if (mSegCount <= 0) continue;

        const [enterRatio, leaveRatio] = m.easeRatio ?? [0.25, 0.25];
        const enterSegs = Math.max(1, Math.floor(mSegCount * enterRatio));
        const leaveSegs = Math.max(1, Math.floor(mSegCount * leaveRatio));
        const holdSegs = Math.max(0, mSegCount - enterSegs - leaveSegs);

        const targetCurve = m.curve * mirrorSign * curveScale;

        // Elevation calculation:
        // 1. If final maneuver of the entire track, bring elevation cleanly back to 0 so loop is seamless.
        // 2. If inside a build section leading into a drop, enforce positive climb so the crest peaks at the drop.
        const startY = lastY();
        let endY: number;
        if (isFinalChunkOfTrack && isLastManeuverInChunk) {
          endY = 0;
        } else if (isBuildBeforeDrop) {
          const minClimbUnits = isFinalChunkOfSection && isLastManeuverInChunk ? HILL.HIGH : HILL.MEDIUM * 0.6;
          const climbUnits = Math.max(minClimbUnits, Math.abs(m.elevation)) * hillScale;
          endY = startY + climbUnits * segmentLength;
        } else {
          endY = startY + m.elevation * hillScale * segmentLength;
        }

        for (let n = 0; n < mSegCount; n++) {
          let c: number;
          if (n < enterSegs) {
            c = easeIn(0, targetCurve, n / enterSegs);
          } else if (n < enterSegs + holdSegs) {
            c = targetCurve;
          } else {
            const leaveIdx = n - enterSegs - holdSegs;
            c = easeInOut(targetCurve, 0, leaveIdx / Math.max(1, leaveSegs));
          }

          // For build-to-drop cresting, keep climbing steadily right up to the final segment
          const yProgress = (n + 1) / mSegCount;
          const y =
            isBuildBeforeDrop && isFinalChunkOfSection && isLastManeuverInChunk
              ? easeIn(startY, endY, yProgress)
              : easeInOut(startY, endY, yProgress);

          appendSegment(c, y);
        }
      }

      // Populate roadside props on musical beat subdivisions
      populateChunkProps(
        segments,
        chunkStartSeg,
        chunkSegCount,
        segmentsPerBeat,
        chunk,
        mirrorSign,
        rng,
      );

      placedChunks.push({
        chunkId: chunk.id,
        role: sec.role,
        startBar: barCursor,
        bars: actualBars,
        startSegment: chunkStartSeg,
        segmentCount: chunkSegCount,
        mirrored,
        avgEnergy,
      });

      barCursor += actualBars;
    }
  }

  // Decorate drop markers with twin neon billboards framing the crest reveal
  for (const dm of dropMarkers) {
    const seg = segments[dm.segmentIndex];
    if (seg) {
      seg.sprites.push(
        { kind: 'billboard', offset: -1.65, variant: 0 },
        { kind: 'billboard', offset: 1.65, variant: 1 },
      );
    }
  }

  return {
    segments,
    segmentLength,
    length: segments.length * segmentLength,
    contentHash: beatMap.contentHash,
    seed,
    totalBars,
    segmentsPerBar,
    barLengthWorld,
    referenceSpeed,
    chunks: placedChunks,
    dropMarkers,
  };
}

/** Converts a world Z coordinate along a `SongTrack` to a 0-based bar index (`Math.floor`). */
export function worldZToBar(track: Pick<SongTrack, 'barLengthWorld'>, z: number): number {
  return Math.floor(z / track.barLengthWorld);
}

/** Converts a world Z coordinate along a `SongTrack` to a continuous 0-based beat index. */
export function worldZToBeat(track: Pick<SongTrack, 'barLengthWorld'>, z: number): number {
  return (z / track.barLengthWorld) * 4;
}

/** Converts a 0-based bar index to its starting world Z coordinate along a `SongTrack`. */
export function barToWorldZ(track: Pick<SongTrack, 'barLengthWorld'>, barIndex: number): number {
  return barIndex * track.barLengthWorld;
}

function normalizeSections(beatMap: BeatMap): BeatSection[] {
  const targetBars = Math.max(4, beatMap.barEnergy.length);
  if (beatMap.sections.length === 0) {
    return [{ startBar: 0, bars: targetBars, role: 'drop' }];
  }

  const normalized: BeatSection[] = [];
  let cursor = 0;

  for (let i = 0; i < beatMap.sections.length; i++) {
    const sec = beatMap.sections[i]!;
    if (sec.startBar > cursor) {
      normalized.push({
        startBar: cursor,
        bars: sec.startBar - cursor,
        role: i === 0 ? 'intro' : beatMap.sections[i - 1]!.role,
      });
      cursor = sec.startBar;
    }
    const bars = Math.max(1, sec.bars);
    normalized.push({
      startBar: cursor,
      bars,
      role: sec.role,
    });
    cursor += bars;
  }

  if (cursor < targetBars) {
    const lastRole = normalized[normalized.length - 1]?.role ?? 'outro';
    normalized.push({
      startBar: cursor,
      bars: targetBars - cursor,
      role: lastRole,
    });
  }

  return normalized;
}

function averageBarEnergy(barEnergy: readonly number[], startBar: number, bars: number): number {
  if (barEnergy.length === 0 || bars <= 0) return 0.5;
  let sum = 0;
  let count = 0;
  for (let b = startBar; b < startBar + bars; b++) {
    const idx = Math.min(barEnergy.length - 1, Math.max(0, b));
    sum += barEnergy[idx] ?? 0.5;
    count++;
  }
  return count > 0 ? sum / count : 0.5;
}

function selectChunk(
  rng: SeededRandom,
  catalog: readonly RoadChunk[],
  role: SectionRole,
  preferredBars: 4 | 8,
  avgEnergy: number,
  lastChunkId: string,
): RoadChunk {
  const rolePool = getChunksForRole(role, catalog);
  const pool = rolePool.length > 0 ? rolePool : catalog;

  const sizeMatches = pool.filter((c) => c.bars === preferredBars);
  const candidates = sizeMatches.length > 0 ? sizeMatches : pool;

  const nonRepeating =
    candidates.length > 1 ? candidates.filter((c) => c.id !== lastChunkId) : candidates;

  return rng.pickWeighted(nonRepeating, (chunk) => {
    const baseWeight = chunk.weight ?? 1.0;
    if (!chunk.energyRange) return baseWeight;
    const [minE, maxE] = chunk.energyRange;
    return avgEnergy >= minE && avgEnergy <= maxE ? baseWeight * 1.5 : baseWeight * 0.35;
  });
}

function populateChunkProps(
  segments: RoadSegment[],
  startSeg: number,
  segCount: number,
  segmentsPerBeat: number,
  chunk: RoadChunk,
  mirrorSign: -1 | 1,
  rng: SeededRandom,
): void {
  const totalBeats = Math.floor(segCount / Math.max(1, segmentsPerBeat));

  for (const rule of chunk.props) {
    const stepBeats = Math.max(1, Math.round(rule.everyBeats));
    const baseOffset =
      rule.offset ?? (rule.kind === 'billboard' ? 1.72 : rule.kind === 'palm' ? 1.35 : 1.22);

    let altToggle = 0;
    for (let beat = 0; beat < totalBeats; beat += stepBeats) {
      const segIdx = startSeg + Math.min(segCount - 1, Math.round(beat * segmentsPerBeat));
      const seg = segments[segIdx];
      if (!seg) continue;

      const variant = rng.rangeInt(0, 2);
      const curveSign: -1 | 1 =
        Math.abs(seg.curve) > 0.2 ? (seg.curve > 0 ? 1 : -1) : mirrorSign;

      switch (rule.placement) {
        case 'both':
          seg.sprites.push(
            { kind: rule.kind, offset: -baseOffset, variant },
            { kind: rule.kind, offset: baseOffset, variant: (variant + 1) % 3 },
          );
          break;
        case 'left':
          seg.sprites.push({ kind: rule.kind, offset: -baseOffset * mirrorSign, variant });
          break;
        case 'right':
          seg.sprites.push({ kind: rule.kind, offset: baseOffset * mirrorSign, variant });
          break;
        case 'alternating': {
          const side = altToggle % 2 === 0 ? -1 : 1;
          altToggle++;
          seg.sprites.push({ kind: rule.kind, offset: side * baseOffset, variant });
          break;
        }
        case 'outside-curve':
          // Outside of a right-hand curve (+curve) is on the left (-offset)
          seg.sprites.push({ kind: rule.kind, offset: -curveSign * baseOffset, variant });
          break;
        case 'inside-curve':
          seg.sprites.push({ kind: rule.kind, offset: curveSign * baseOffset, variant });
          break;
      }
    }
  }
}
