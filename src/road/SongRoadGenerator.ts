import { barDurationSec, type BeatMap, type BeatSection, type SectionRole } from '@src/audio/BeatMap';
import { RUMBLE_LENGTH, SEGMENT_LENGTH } from '@src/config/constants';
import { DEFAULT_TUNING, tuning } from '@src/config/tuning';
import { SeededRandom } from '@src/core/SeededRandom';
import { getChunksForRole, ROAD_CHUNKS, type RoadChunk } from './RoadChunks';
import { easeIn, easeInOut } from './RoadProjection';
import { createPoint, type RoadSegment, type RoadSprite, type Track } from './RoadSegment';
import { HILL } from './TrackBuilder';

export interface CanonicalSegmentData {
  /** Curvatura originale di ciascun segmento (lunghezza = segments.length). */
  readonly curve: Float32Array;
  /** Quota worldY di p1 per ciascun segmento (lunghezza = segments.length). */
  readonly p1WorldY: Float32Array;
  /** Quota worldY di p2 per ciascun segmento (lunghezza = segments.length). */
  readonly p2WorldY: Float32Array;
  /** Copia immutabile delle liste di sprite originali per segmento. */
  readonly sprites: readonly (readonly RoadSprite[])[];
}

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
  readonly canonical: CanonicalSegmentData;
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

  // Pre-allocate immutable canonical blueprint for zero-GC runtime restoration & horizon stitching
  const count = segments.length;
  const canonicalCurve = new Float32Array(count);
  const canonicalP1WorldY = new Float32Array(count);
  const canonicalP2WorldY = new Float32Array(count);
  const canonicalSprites: (readonly RoadSprite[])[] = new Array(count);

  for (let i = 0; i < count; i++) {
    const s = segments[i]!;
    canonicalCurve[i] = s.curve;
    canonicalP1WorldY[i] = s.p1.worldY;
    canonicalP2WorldY[i] = s.p2.worldY;
    canonicalSprites[i] = s.sprites.slice();
  }

  const canonical: CanonicalSegmentData = {
    curve: canonicalCurve,
    p1WorldY: canonicalP1WorldY,
    p2WorldY: canonicalP2WorldY,
    sprites: canonicalSprites,
  };

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
    canonical,
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

/** Type guard checking if a track is a generated `SongTrack` with canonical blueprint. */
export function isSongTrack(track: Track): track is SongTrack {
  return 'barLengthWorld' in track && 'chunks' in track && 'canonical' in track;
}

/**
 * Returns the section pace factor based on the bar index and section role.
 * - First 4 bars of track (barIndex < 4): linear ramp from 0.55 to 0.85 (launch from 0 km/h).
 * - breakdown (sharp hairpin curves): 0.86.
 * - intro (after bar 4) and outro: 0.92.
 * - build and drop: 1.00.
 */
export function getSectionPaceFactor(
  _track: SongTrack,
  barIndex: number,
  sectionRole: SectionRole,
): number {
  if (barIndex < 4) {
    const clampedBar = Math.max(0, barIndex);
    return 0.55 + (clampedBar / 4) * (0.85 - 0.55);
  }
  switch (sectionRole) {
    case 'breakdown':
      return 0.86;
    case 'intro':
    case 'outro':
      return 0.92;
    case 'build':
    case 'drop':
    default:
      return 1.0;
  }
}

export interface HorizonStitchResult {
  /** Delta Z (in world units, exact multiple of 2 * RUMBLE_LENGTH * segmentLength) applied to position. */
  deltaZ: number;
  /** Segment index before stitch. */
  fromSegIndex: number;
  /** Segment index after stitch. */
  toSegIndex: number;
  /** Number of visible segments copied in-place. */
  copiedWindowSegs: number;
}

/**
 * Executes a zero-pop-in macro phase realignment (A2) to sync the road with the audio clock.
 *
 * Copies the visible window [0..drawDistance - 24] in-place with vertical deltaY offset,
 * blends the final 24 segments in the horizon fog, and quantizes deltaZ to exact rumble-strip
 * cycles (2 * RUMBLE_LENGTH * segmentLength) so striping and visual pixels are 100% continuous.
 */
export function stitchHorizonToTargetZ(
  track: SongTrack,
  currentZ: number,
  rawTargetZ: number,
  drawDistance: number,
): HorizonStitchResult | null {
  const segLen = track.segmentLength;
  const segCount = track.segments.length;
  if (segCount === 0 || segLen <= 0) return null;

  const fromSegIndex = Math.floor(currentZ / segLen);
  const rawDeltaSegs = Math.floor((rawTargetZ - currentZ) / segLen);

  const rumbleStep = 2 * RUMBLE_LENGTH; // 6 segments
  const deltaSegs = rumbleStep * Math.round(rawDeltaSegs / rumbleStep);

  // Safety checks: minimum 12 segments forward, and ensure enough room before track end
  if (deltaSegs < 12) return null;

  const toSegIndex = fromSegIndex + deltaSegs;
  if (fromSegIndex < 0 || toSegIndex + drawDistance + 16 >= segCount) {
    return null;
  }

  // Zone 1: Solid visible window (0 .. copyCount - 1), where copyCount = drawDistance - 24
  const copyCount = Math.max(1, drawDistance - 24);
  const deltaY =
    track.canonical.p1WorldY[toSegIndex]! - track.segments[fromSegIndex]!.p1.worldY;

  for (let n = 0; n < copyCount; n++) {
    const srcSeg = track.segments[fromSegIndex + n]!;
    const destSeg = track.segments[toSegIndex + n]!;

    destSeg.curve = srcSeg.curve;
    destSeg.p1.worldY = srcSeg.p1.worldY + deltaY;
    destSeg.p2.worldY = srcSeg.p2.worldY + deltaY;

    // Preserve drop marker neon billboards if the destination segment is a drop marker
    const isDestDropMarker = track.dropMarkers.some(
      (dm) => dm.segmentIndex === toSegIndex + n,
    );
    if (isDestDropMarker) {
      const dropBillboards = track.canonical.sprites[toSegIndex + n]!.filter(
        (s) => s.kind === 'billboard',
      );
      destSeg.sprites = [
        ...srcSeg.sprites.filter((s) => s.kind !== 'billboard'),
        ...dropBillboards,
      ];
    } else {
      destSeg.sprites = srcSeg.sprites.slice();
    }
  }

  // Zone 2: Horizon fog transition zone (copyCount .. drawDistance - 1, 24 segments)
  const blendCount = drawDistance - copyCount;
  const lastCopied = track.segments[toSegIndex + copyCount - 1]!;
  const startY = lastCopied.p2.worldY;
  const startCurve = lastCopied.curve;

  const targetY = track.canonical.p1WorldY[toSegIndex + drawDistance]!;
  const targetCurve = track.canonical.curve[toSegIndex + drawDistance]!;

  let prevY = startY;
  for (let k = 0; k < blendCount; k++) {
    const segIdx = toSegIndex + copyCount + k;
    const seg = track.segments[segIdx]!;
    const t = (k + 1) / blendCount;
    const segCurve = easeInOut(startCurve, targetCurve, t);
    const nextY = easeInOut(startY, targetY, t);

    seg.curve = segCurve;
    seg.p1.worldY = prevY;
    seg.p2.worldY = nextY;
    prevY = nextY;

    // Restore canonical sprites in the horizon fog
    seg.sprites = track.canonical.sprites[segIdx]!.slice();
  }

  // Restore canonical geometry for segments outside the active window
  for (let i = 0; i < toSegIndex; i++) {
    const seg = track.segments[i]!;
    seg.curve = track.canonical.curve[i]!;
    seg.p1.worldY = track.canonical.p1WorldY[i]!;
    seg.p2.worldY = track.canonical.p2WorldY[i]!;
    seg.sprites = track.canonical.sprites[i]!.slice();
  }
  for (let i = toSegIndex + drawDistance; i < segCount; i++) {
    const seg = track.segments[i]!;
    seg.curve = track.canonical.curve[i]!;
    seg.p1.worldY = track.canonical.p1WorldY[i]!;
    seg.p2.worldY = track.canonical.p2WorldY[i]!;
    seg.sprites = track.canonical.sprites[i]!.slice();
  }

  return {
    deltaZ: deltaSegs * segLen,
    fromSegIndex,
    toSegIndex,
    copiedWindowSegs: copyCount,
  };
}

/**
 * Resets all segments of a `SongTrack` to their initial canonical geometry and sprite lists (zero GC).
 */
export function restoreCanonicalTrack(track: SongTrack): void {
  const { segments, canonical } = track;
  const count = segments.length;
  for (let i = 0; i < count; i++) {
    const s = segments[i]!;
    s.curve = canonical.curve[i]!;
    s.p1.worldY = canonical.p1WorldY[i]!;
    s.p2.worldY = canonical.p2WorldY[i]!;
    s.sprites = canonical.sprites[i]!.slice();
  }
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
    const baseOffset = Math.max(
      1.4,
      rule.offset ?? (rule.kind === 'billboard' ? 1.85 : rule.kind === 'palm' ? 1.48 : 1.42),
    );

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
