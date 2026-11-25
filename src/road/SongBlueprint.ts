import { barDurationSec, type BeatMap, type BeatSection, type SectionRole } from '@src/audio/BeatMap';
import { FORK_APPROACH_BARS, SEGMENT_LENGTH } from '@src/config/constants';
import { DEFAULT_TUNING, tuning } from '@src/config/tuning';
import { SeededRandom } from '@src/core/SeededRandom';
import {
  ENVIRONMENT_ARCHETYPES,
  planStageZones,
  type EnvironmentArchetypeId,
  type MuffledSpan,
  type StageRegionId,
  type ZonePlanChunkInput,
  type ZoneTransition,
} from './EnvironmentArchetypes';
import {
  getChunksForRole,
  ROAD_CHUNKS,
  type RoadChunk,
  type StructureCapability,
  type TrafficProfile,
} from './RoadChunks';
import { easeIn, easeInOut } from './RoadProjection';
import type { SegmentEnvironment } from './RoadSegment';
import {
  planPowerLineRuns,
  type BlueprintPowerLineCrossing,
  type BlueprintPowerLineRun,
} from './SceneryCorridors';
import {
  buildSyncAnchors,
  computeTrackDna,
  resolveMuffledSpansCompat,
  type DropMarker,
  type SongRoadOptions,
  type SyncAnchor,
  type TrackDna,
} from './SongRoadGenerator';
import { CURVE, HILL } from './TrackBuilder';
import { VIGNETTE_PREFABS, type VignetteId } from './Vignettes';

/**
 * Pure TypeScript offline SongBlueprint compiler (Tranche 2 — Model D + Model A).
 *
 * Compiles a `BeatMap` + `contentHash` into a bar-indexed deterministic blueprint containing
 * pure road choreography (curves, hills, crests), environmental acts, tunnel/bridge spans,
 * unified `SyncAnchor`s, power-line runs, and vignette placements.
 * Zero React imports; zero runtime segment array allocations required until materialized
 * on the `HorizonAssembler` ring buffer.
 */

export interface BlueprintManeuver {
  /** Bar offset relative to the owning chunk's `startBar`. */
  readonly startBarOffset: number;
  /** Duration in musical bars (already scaled by `actualBars / chunk.bars`). */
  readonly bars: number;
  /** Raw maneuver curve magnitude (0 = straight; non-zero already carries mirrorSign). */
  readonly rawCurve: number;
  /** Upper curve magnitude cap enforced on steep uphill / pre-drop climbs (`Infinity` if uncapped). */
  readonly uphillCurveCap: number;
  /** Whether the previous maneuver blends continuously into this one (`C1`). */
  readonly prevBlends: boolean;
  /** Whether this maneuver blends continuously into the next one (`C1`). */
  readonly nextBlends: boolean;
  /** Entry curve value when `prevBlends === true`. */
  readonly startCurve: number;
  /** Exit curve value when `nextBlends === true`. */
  readonly endCurve: number;
  /** `[enterRatio, leaveRatio]` easing proportions within the maneuver. */
  readonly easeRatio: readonly [number, number];
  /** Planned nominal worldY at maneuver start. */
  readonly startY: number;
  /** Planned nominal worldY at maneuver end. */
  readonly endY: number;
  /** Planned elevation delta (`endY - startY`). */
  readonly targetDeltaY: number;
  /** True when this maneuver is the final uphill crest landing on a drop boundary. */
  readonly isFinalCrest: boolean;
  /** Physical maximum average vertical grade (`dY / dZ`) allowed during streaming compression. */
  readonly maxAvgGrade: number;
}

export interface BlueprintVignettePlacement {
  readonly prefab: VignetteId;
  /** Musical bar coordinate where the vignette center anchors. */
  readonly barFloat: number;
  readonly side: -1 | 1;
  readonly baseOffset: number;
  readonly variantSeed: number;
}

export interface BlueprintChunk {
  readonly chunkIndex: number;
  readonly chunkId: string;
  readonly role: SectionRole;
  readonly startBar: number;
  readonly bars: number;
  readonly mirrored: boolean;
  readonly mirrorSign: -1 | 1;
  readonly avgEnergy: number;
  readonly trafficProfile: TrafficProfile;
  readonly allowedStructures: readonly StructureCapability[];
  readonly fixtureCadenceBeats: 1 | 2 | 4;
  readonly archetype: EnvironmentArchetypeId;
  readonly env: SegmentEnvironment;
  readonly maneuvers: readonly BlueprintManeuver[];
  readonly vignettes: readonly BlueprintVignettePlacement[];
}

export interface SongBlueprint {
  readonly contentHash: string;
  readonly seed: string;
  readonly stageId: StageRegionId;
  readonly beatMap: BeatMap;
  readonly trackDna: TrackDna;
  readonly totalBars: number;
  readonly nominalSegmentsPerBar: number;
  readonly segmentsPerBeat: number;
  readonly segmentLength: number;
  readonly barLengthWorld: number;
  readonly referenceSpeed: number;
  readonly curveEnergyScale: number;
  readonly chunks: readonly BlueprintChunk[];
  /** Per-bar environment (`standard | bridge | viaduct | tunnel`), length = `totalBars`. */
  readonly barEnv: readonly SegmentEnvironment[];
  /** Per-bar archetype, length = `totalBars`. */
  readonly barArchetypes: readonly EnvironmentArchetypeId[];
  readonly dropMarkers: readonly DropMarker[];
  readonly syncAnchors: readonly SyncAnchor[];
  readonly tunnelSpans: readonly MuffledSpan[];
  readonly zoneTransitions: readonly ZoneTransition[];
  readonly powerLineRuns: readonly BlueprintPowerLineRun[];
  readonly powerLineCrossing: BlueprintPowerLineCrossing | null;
  readonly forkStartBar: number;
  readonly tailStartBar: number;
}

/** Pre-allocated scratch struct populated by `sampleBlueprintAtBar` (zero GC). */
export interface BlueprintSample {
  chunkIndex: number;
  maneuverIndex: number;
  curve: number;
  /** Instantaneous nominal vertical slope `dY / dBar` (world units per musical bar). */
  slopePerBar: number;
  maxAvgGrade: number;
  env: SegmentEnvironment;
  archetype: EnvironmentArchetypeId;
  role: SectionRole;
}

export function createBlueprintSample(): BlueprintSample {
  return {
    chunkIndex: 0,
    maneuverIndex: 0,
    curve: 0,
    slopePerBar: 0,
    maxAvgGrade: 0.28,
    env: 'standard',
    archetype: 'costiero',
    role: 'intro',
  };
}

function normalizeBlueprintSections(beatMap: BeatMap): BeatSection[] {
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
    normalized.push({ startBar: cursor, bars, role: sec.role });
    cursor += bars;
  }
  if (cursor < targetBars) {
    const lastRole = normalized[normalized.length - 1]?.role ?? 'outro';
    normalized.push({ startBar: cursor, bars: targetBars - cursor, role: lastRole });
  }
  return normalized;
}

function averageEnergy(barEnergy: readonly number[], startBar: number, bars: number): number {
  if (barEnergy.length === 0 || bars <= 0) return 0.5;
  let sum = 0;
  for (let b = startBar; b < startBar + bars; b++) {
    const idx = Math.min(barEnergy.length - 1, Math.max(0, b));
    sum += barEnergy[idx] ?? 0.5;
  }
  return sum / bars;
}

export function sampleSmoothEnergy(barEnergy: readonly number[], barFloat: number): number {
  if (barEnergy.length === 0) return 0.5;
  const clamped = Math.max(0, Math.min(barEnergy.length - 1, barFloat));
  const lo = Math.floor(clamped);
  const hi = Math.min(barEnergy.length - 1, lo + 1);
  const frac = clamped - lo;
  return (barEnergy[lo] ?? 0.5) * (1 - frac) + (barEnergy[hi] ?? 0.5) * frac;
}

export function computeBlueprintCurveScale(
  role: SectionRole,
  energy: number,
  curveEnergyScale: number,
): number {
  if (role === 'breakdown') {
    return Math.max(
      0.92,
      Math.min(1.28, 0.95 + Math.max(0, energy - 0.35) * curveEnergyScale * 0.45),
    );
  }
  if (role === 'intro' || role === 'outro') {
    return Math.max(0.65, Math.min(1.15, 1 + (energy - 0.5) * curveEnergyScale * 0.7));
  }
  return Math.max(0.72, Math.min(1.35, 1 + (energy - 0.5) * curveEnergyScale));
}

function computeBlueprintHillScale(energy: number, hillEnergyScale: number): number {
  return Math.max(0.5, Math.min(1.35, 1 + (energy - 0.5) * hillEnergyScale));
}

function selectBlueprintChunk(
  rng: SeededRandom,
  catalog: readonly RoadChunk[],
  role: SectionRole,
  preferredBars: 4 | 8,
  avgEnergy: number,
  recentChunkIds: readonly string[],
  chunkUsageCounts: ReadonlyMap<string, number>,
  currentY: number,
  trackDna: TrackDna,
  requiresPreDropCrest: boolean,
  requiresPostCrestReveal: boolean,
  chunkIsMuffled: boolean,
  isPreDropSection: boolean,
): RoadChunk {
  const rolePool = getChunksForRole(role, catalog);
  const pool = rolePool.length > 0 ? rolePool : catalog;

  const sizeMatches = pool.filter((c) => c.bars === preferredBars);
  let candidates = sizeMatches.length > 0 ? sizeMatches : pool;

  if (chunkIsMuffled) {
    const tunnelSized = candidates.filter((c) => c.allowedStructures.includes('tunnel'));
    if (tunnelSized.length > 0) {
      candidates = tunnelSized;
    } else {
      const tunnelRole = pool.filter((c) => c.allowedStructures.includes('tunnel'));
      if (tunnelRole.length > 0) {
        candidates = tunnelRole;
      } else {
        const tunnelCatalog = catalog.filter((c) => c.allowedStructures.includes('tunnel'));
        if (tunnelCatalog.length > 0) {
          candidates = tunnelCatalog;
        }
      }
    }
  }

  if (requiresPreDropCrest) {
    const crestMatches = candidates.filter(
      (c) => c.elevationIntent === 'crest' || c.elevationIntent === 'climb',
    );
    if (crestMatches.length > 0) {
      candidates = crestMatches;
    } else {
      const gentlerExitMatches = candidates.filter((c) => {
        const lastM = c.maneuvers[c.maneuvers.length - 1];
        return !lastM || Math.abs(lastM.curve) <= CURVE.MEDIUM;
      });
      if (gentlerExitMatches.length > 0) {
        candidates = gentlerExitMatches;
      }
    }
  }

  if (requiresPostCrestReveal) {
    const revealMatches = candidates.filter((c) => c.postCrestReveal === true);
    if (revealMatches.length > 0) {
      candidates = revealMatches;
    }
  }

  const lastChunkId = recentChunkIds.length > 0 ? recentChunkIds[recentChunkIds.length - 1]! : '';
  const nonImmediate =
    candidates.length > 1 ? candidates.filter((c) => c.id !== lastChunkId) : candidates;
  const nonRecent = nonImmediate.filter((c) => !recentChunkIds.includes(c.id));
  const selectionPool = nonRecent.length > 0 ? nonRecent : nonImmediate;

  return rng.pickWeighted(selectionPool, (chunk) => {
    const baseWeight = chunk.weight ?? 1.0;
    let energyWeight = baseWeight;
    if (chunk.energyRange) {
      const [minE, maxE] = chunk.energyRange;
      energyWeight =
        avgEnergy >= minE && avgEnergy <= maxE ? baseWeight * 1.5 : baseWeight * 0.4;
    }
    const usedCount = chunkUsageCounts.get(chunk.id) ?? 0;
    const noveltyWeight = 1 / (1 + usedCount * 0.75);

    let dnaSum = 0;
    for (let i = 0; i < chunk.styleTags.length; i++) {
      dnaSum += trackDna.styleWeights[chunk.styleTags[i]!] ?? 1.0;
    }
    const dnaWeight = chunk.styleTags.length > 0 ? dnaSum / chunk.styleTags.length : 1.0;

    let elevationBias = 1.0;
    if (!isPreDropSection && Math.abs(currentY) > 6500) {
      let netElev = 0;
      for (let i = 0; i < chunk.maneuvers.length; i++) {
        netElev += chunk.maneuvers[i]!.elevation;
      }
      if (netElev !== 0) {
        elevationBias = netElev * currentY < 0 ? 1.75 : 0.55;
      }
    }

    const muffleBias =
      chunkIsMuffled && chunk.allowedStructures.includes('tunnel')
        ? 1.65
        : chunkIsMuffled
          ? 0.65
          : 1.0;

    return energyWeight * noveltyWeight * dnaWeight * elevationBias * muffleBias;
  });
}

/**
 * Compiles a deterministic, bar-indexed `SongBlueprint` offline from `(beatMap, options)`.
 * Pure function of `(beatMap, seed, stageId)`: Layer 2 geometry has zero `stageId` dependence.
 */
export function compileSongBlueprint(
  beatMap: BeatMap,
  options: SongRoadOptions = {},
): SongBlueprint {
  const seed = options.seed ?? beatMap.contentHash;
  const stageId: StageRegionId = options.stageId ?? 'night';
  const geoRng = new SeededRandom(`${seed}:geometry`);
  const sceneryRng = new SeededRandom(`${seed}:scenery:${stageId}`);
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
  const rawSegmentsPerBar = Math.max(16, Math.round((referenceSpeed * barDur) / segmentLength));
  const nominalSegmentsPerBar = Math.max(16, Math.round(rawSegmentsPerBar / 4) * 4);
  const segmentsPerBeat = nominalSegmentsPerBar / 4;
  const barLengthWorld = nominalSegmentsPerBar * segmentLength;

  const sections = normalizeBlueprintSections(beatMap);
  const totalBars = sections.reduce((acc, s) => acc + s.bars, 0);
  const forkBars = Math.min(FORK_APPROACH_BARS, Math.floor(totalBars * 0.25));
  const forkStartBar = Math.max(0, totalBars - forkBars);

  // Layer 1: Track DNA & muffled spans
  const trackDna = computeTrackDna(beatMap);
  const tunnelSpans = resolveMuffledSpansCompat(beatMap, totalBars);
  const isRangeMuffled = (startBar: number, endBar: number): boolean => {
    for (let i = 0; i < tunnelSpans.length; i++) {
      const sp = tunnelSpans[i]!;
      if (startBar < sp.endBar && endBar > sp.startBar) return true;
    }
    return false;
  };

  // Layer 2: Pure Geometry Compiler (geoRng ONLY)
  interface DraftBlueprintChunk extends ZonePlanChunkInput {
    readonly chunk: RoadChunk;
    readonly mirrored: boolean;
    readonly mirrorSign: -1 | 1;
    readonly avgEnergy: number;
    readonly maneuvers: BlueprintManeuver[];
  }

  const draftChunks: DraftBlueprintChunk[] = [];
  const dropMarkers: DropMarker[] = [];
  const recentChunkIds: string[] = [];
  const chunkUsageCounts = new Map<string, number>();
  let lastCurveSign: -1 | 1 = 1;
  let curY = 0;

  let lastBuildBeforeDropEndBar = 0;
  for (let i = 0; i < sections.length - 1; i++) {
    const s = sections[i]!;
    const ns = sections[i + 1]!;
    if (s.role !== 'drop' && ns.role === 'drop') {
      lastBuildBeforeDropEndBar = s.startBar + s.bars;
    }
  }
  const lastSection = sections[sections.length - 1];
  const desiredTailBars =
    lastSection?.role === 'outro' ? Math.max(8, lastSection.bars) : 6;
  const rawTailStartBar =
    totalBars <= 4
      ? Math.floor(totalBars / 2)
      : Math.max(lastBuildBeforeDropEndBar, totalBars - desiredTailBars);
  const tailStartBar =
    sections.length === 1 && totalBars <= 4 && lastSection?.role !== 'outro'
      ? Math.max(0, totalBars - 1)
      : Math.min(totalBars - 1, Math.max(0, rawTailStartBar));

  let prevSectionCrested = false;
  let segCursor = 0;

  for (let secIdx = 0; secIdx < sections.length; secIdx++) {
    const sec = sections[secIdx]!;
    const nextSec = sections[secIdx + 1];
    const isPreDropSection = sec.role !== 'drop' && nextSec?.role === 'drop';
    let justCrestedIntoDrop = sec.role === 'drop' && prevSectionCrested;

    if (sec.role === 'drop') {
      const dropSegIdx = sec.startBar * nominalSegmentsPerBar;
      dropMarkers.push({
        barIndex: sec.startBar,
        segmentIndex: dropSegIdx,
        worldZ: dropSegIdx * segmentLength,
      });
    }

    let barCursor = sec.startBar;
    const secEndBar = sec.startBar + sec.bars;
    let sectionEndedWithCrest = false;

    while (barCursor < secEndBar) {
      const remainingBars = secEndBar - barCursor;
      const chunkBars: 4 | 8 = remainingBars >= 8 ? (geoRng.bool(0.55) ? 8 : 4) : 4;
      const actualBars = Math.min(remainingBars, chunkBars);
      const isFinalChunkOfSection = barCursor + actualBars >= secEndBar;
      const chunkIsMuffled = isRangeMuffled(barCursor, barCursor + actualBars);

      const requiresPreDropCrest = isPreDropSection && isFinalChunkOfSection && !chunkIsMuffled;
      const requiresPostCrestReveal = sec.role === 'drop' && justCrestedIntoDrop;
      justCrestedIntoDrop = false;

      const avgEnergy = averageEnergy(beatMap.barEnergy, barCursor, actualBars);
      const chunk = selectBlueprintChunk(
        geoRng,
        catalog,
        sec.role,
        chunkBars,
        avgEnergy,
        recentChunkIds,
        chunkUsageCounts,
        curY,
        trackDna,
        requiresPreDropCrest,
        requiresPostCrestReveal,
        chunkIsMuffled,
        isPreDropSection,
      );
      recentChunkIds.push(chunk.id);
      if (recentChunkIds.length > 3) recentChunkIds.shift();
      chunkUsageCounts.set(chunk.id, (chunkUsageCounts.get(chunk.id) ?? 0) + 1);

      const mirrored: boolean =
        chunk.allowMirror === false
          ? false
          : geoRng.bool(0.65)
            ? lastCurveSign > 0
            : geoRng.bool(0.5);
      const mirrorSign: -1 | 1 = mirrored ? -1 : 1;
      lastCurveSign = mirrorSign;

      const chunkStartSeg = segCursor;
      const chunkSegCount = actualBars * nominalSegmentsPerBar;
      const barScale = actualBars / chunk.bars;

      const maneuverCount = chunk.maneuvers.length;
      const maneuverStartOffsets: number[] = new Array<number>(maneuverCount);
      const maneuverScaledBars: number[] = new Array<number>(maneuverCount);
      const maneuverTargetCurves: number[] = new Array<number>(maneuverCount);
      let mBarOff = 0;
      for (let mIdx = 0; mIdx < maneuverCount; mIdx++) {
        const m = chunk.maneuvers[mIdx]!;
        maneuverStartOffsets[mIdx] = mBarOff;
        const mBars =
          mIdx === maneuverCount - 1 ? Math.max(0.25, actualBars - mBarOff) : m.bars * barScale;
        maneuverScaledBars[mIdx] = mBars;
        const midEnergy = sampleSmoothEnergy(beatMap.barEnergy, barCursor + mBarOff + mBars * 0.5);
        const cScale = computeBlueprintCurveScale(sec.role, midEnergy, curveEnergyScale);
        maneuverTargetCurves[mIdx] = m.curve === 0 ? 0 : m.curve * mirrorSign * cScale;
        mBarOff += mBars;
      }

      const maneuvers: BlueprintManeuver[] = [];
      for (let mIdx = 0; mIdx < maneuverCount; mIdx++) {
        const m = chunk.maneuvers[mIdx]!;
        const isLastManeuver = mIdx === maneuverCount - 1;
        const mBars = maneuverScaledBars[mIdx]!;
        const mStartOff = maneuverStartOffsets[mIdx]!;
        const prevBlends = mIdx > 0 && chunk.maneuvers[mIdx - 1]!.blendToNext === true;
        const nextBlends = m.blendToNext === true && mIdx < maneuverCount - 1;
        const startCurveRaw = prevBlends
          ? (maneuverTargetCurves[mIdx - 1]! + maneuverTargetCurves[mIdx]!) * 0.5
          : 0;
        const endCurveRaw = nextBlends
          ? (maneuverTargetCurves[mIdx]! + maneuverTargetCurves[mIdx + 1]!) * 0.5
          : 0;

        const mMidEnergy = sampleSmoothEnergy(
          beatMap.barEnergy,
          barCursor + mStartOff + mBars * 0.5,
        );
        const hillScale = computeBlueprintHillScale(mMidEnergy, hillEnergyScale);
        const startY = curY;

        const applyBuildClimb =
          isPreDropSection &&
          !chunkIsMuffled &&
          (sec.role === 'build' || isFinalChunkOfSection);
        const isFinalCrest = applyBuildClimb && isFinalChunkOfSection && isLastManeuver;
        const maneuverWorldLen = Math.max(segmentLength, mBars * barLengthWorld);
        const maxAvgGrade = isFinalCrest ? 0.22 : 0.28;
        const maxAbsDeltaY = maneuverWorldLen * maxAvgGrade;

        let endY: number;
        if (applyBuildClimb) {
          const minClimbUnits = isFinalCrest ? HILL.HIGH : HILL.MEDIUM * 0.65;
          const climbUnits = Math.max(minClimbUnits, Math.abs(m.elevation)) * hillScale * barScale;
          const clampedDeltaY = Math.min(maxAbsDeltaY, climbUnits * segmentLength);
          endY = Math.min(16500, startY + clampedDeltaY);
          if (isFinalCrest) sectionEndedWithCrest = true;
        } else if (isPreDropSection && chunkIsMuffled) {
          const gentleDelta = m.elevation * 0.3 * hillScale * barScale * segmentLength;
          const clampedDeltaY = Math.max(-maxAbsDeltaY, Math.min(maxAbsDeltaY, gentleDelta));
          endY = Math.max(-4500, Math.min(6000, startY + clampedDeltaY));
        } else {
          let rawDeltaY = m.elevation * hillScale * barScale * segmentLength;
          if (Math.abs(startY) > 7500 && rawDeltaY * startY > 0) {
            rawDeltaY *= 0.35;
          }
          const clampedDeltaY = Math.max(-maxAbsDeltaY, Math.min(maxAbsDeltaY, rawDeltaY));
          endY = Math.max(-12000, Math.min(16500, startY + clampedDeltaY));
        }

        const avgUphillGrade = (endY - startY) / maneuverWorldLen;
        let uphillCurveCap = Infinity;
        if (applyBuildClimb && sec.role !== 'build') {
          uphillCurveCap = isFinalCrest ? CURVE.EASY * 0.75 : CURVE.EASY * 1.15;
        } else if (avgUphillGrade > 0.14) {
          uphillCurveCap = 3.2;
        }
        const clampCurve = (v: number): number =>
          uphillCurveCap < Infinity ? Math.max(-uphillCurveCap, Math.min(uphillCurveCap, v)) : v;

        maneuvers.push({
          startBarOffset: mStartOff,
          bars: mBars,
          rawCurve: m.curve === 0 ? 0 : m.curve * mirrorSign,
          uphillCurveCap,
          prevBlends,
          nextBlends,
          startCurve: clampCurve(startCurveRaw),
          endCurve: clampCurve(endCurveRaw),
          easeRatio: m.easeRatio ?? [0.25, 0.25],
          startY,
          endY,
          targetDeltaY: endY - startY,
          isFinalCrest,
          maxAvgGrade,
        });
        curY = endY;
      }

      draftChunks.push({
        chunk,
        role: sec.role,
        startBar: barCursor,
        bars: actualBars,
        startSegment: chunkStartSeg,
        segmentCount: chunkSegCount,
        mirrored,
        mirrorSign,
        avgEnergy,
        allowedStructures: chunk.allowedStructures,
        maneuvers,
      });
      segCursor += chunkSegCount;
      barCursor += actualBars;
    }
    prevSectionCrested = sectionEndedWithCrest;
  }

  // Layer 3: Zone & Structure Planner (sceneryRng)
  const zonePlan = planStageZones(
    draftChunks,
    sections,
    stageId,
    tunnelSpans,
    totalBars,
    nominalSegmentsPerBar,
    sceneryRng,
    beatMap.phraseBars,
  );

  // Compress per-segment env plan cleanly to per-bar env (1 entry per bar)
  const barEnv: SegmentEnvironment[] = new Array<SegmentEnvironment>(totalBars);
  for (let b = 0; b < totalBars; b++) {
    const segIdx = Math.min(zonePlan.segmentEnvs.length - 1, b * nominalSegmentsPerBar);
    barEnv[b] = zonePlan.segmentEnvs[segIdx] ?? 'standard';
  }

  // Plan power-line corridors purely in bar coordinates
  const barCurveAbs = new Float64Array(totalBars);
  for (let cIdx = 0; cIdx < draftChunks.length; cIdx++) {
    const d = draftChunks[cIdx]!;
    for (let mIdx = 0; mIdx < d.maneuvers.length; mIdx++) {
      const m = d.maneuvers[mIdx]!;
      const bStart = Math.max(0, Math.floor(d.startBar + m.startBarOffset));
      const bEnd = Math.min(totalBars, Math.ceil(d.startBar + m.startBarOffset + m.bars));
      const absC = Math.abs(m.rawCurve);
      for (let b = bStart; b < bEnd; b++) {
        if (absC > barCurveAbs[b]!) barCurveAbs[b] = absC;
      }
    }
  }

  const powerLineChunks = draftChunks.map((d, idx) => ({
    startBar: d.startBar,
    bars: d.bars,
    archetype: zonePlan.chunkArchetypes[idx]!,
  }));
  const powerLines = planPowerLineRuns(
    powerLineChunks,
    barEnv,
    totalBars,
    sceneryRng,
    undefined,
    Array.from(barCurveAbs),
  );

  // Plan deterministic vignette placements per eligible chunk (avoiding pylon side conflicts)
  const chunkVignettes: BlueprintVignettePlacement[][] = draftChunks.map(() => []);
  let lastVignetteChunkIdx = -1;
  let lastVignetteBar = -999;

  for (let cIdx = 0; cIdx < draftChunks.length; cIdx++) {
    const draft = draftChunks[cIdx]!;
    const archId = zonePlan.chunkArchetypes[cIdx]!;
    const cEnv = zonePlan.chunkEnvs[cIdx]!;
    if (lastVignetteChunkIdx !== -1 && cIdx === lastVignetteChunkIdx + 1) continue;
    if (lastVignetteBar !== -999 && draft.startBar - lastVignetteBar < 12) continue;
    if (draft.startBar >= forkStartBar || draft.startBar + draft.bars > forkStartBar) continue;
    if (cEnv !== 'standard') continue;

    let allBarsStandard = true;
    for (let b = draft.startBar; b < draft.startBar + draft.bars; b++) {
      if (barEnv[b] !== 'standard') {
        allBarsStandard = false;
        break;
      }
    }
    if (!allBarsStandard) continue;

    const archetype = ENVIRONMENT_ARCHETYPES[archId];
    if (!archetype || archetype.allowedVignettes.length === 0) continue;

    const startOffset = sceneryRng.rangeInt(0, archetype.allowedVignettes.length - 1);
    for (let vIdx = 0; vIdx < archetype.allowedVignettes.length; vIdx++) {
      const slot =
        archetype.allowedVignettes[(startOffset + vIdx) % archetype.allowedVignettes.length]!;
      if (sceneryRng.range(0, 1) >= slot.chance) continue;
      const prefab = VIGNETTE_PREFABS[slot.prefab];
      if (!prefab) continue;

      const anchorBar = draft.startBar + draft.bars * 0.5;
      // Pick non-conflicting side vs power-line runs
      let preferredSide: -1 | 1 =
        slot.side === 'left'
          ? (-1 * draft.mirrorSign) as -1 | 1
          : slot.side === 'right'
            ? (1 * draft.mirrorSign) as -1 | 1
            : sceneryRng.bool()
              ? 1
              : -1;
      for (let r = 0; r < powerLines.runs.length; r++) {
        const run = powerLines.runs[r]!;
        if (anchorBar >= run.startBar - 0.5 && anchorBar <= run.endBar + 0.5 && run.side === preferredSide) {
          preferredSide = (-preferredSide) as -1 | 1;
          break;
        }
      }

      chunkVignettes[cIdx]!.push({
        prefab: slot.prefab,
        barFloat: anchorBar,
        side: preferredSide,
        baseOffset: prefab.baseOffset,
        variantSeed: sceneryRng.rangeInt(1, 0x7fffffff),
      });
      lastVignetteChunkIdx = cIdx;
      lastVignetteBar = draft.startBar;
      break;
    }
  }

  const chunks: BlueprintChunk[] = draftChunks.map((draft, idx) => ({
    chunkIndex: idx,
    chunkId: draft.chunk.id,
    role: draft.role,
    startBar: draft.startBar,
    bars: draft.bars,
    mirrored: draft.mirrored,
    mirrorSign: draft.mirrorSign,
    avgEnergy: draft.avgEnergy,
    trafficProfile: draft.chunk.trafficProfile,
    allowedStructures: draft.chunk.allowedStructures,
    fixtureCadenceBeats: draft.chunk.fixtureCadenceBeats,
    archetype: zonePlan.chunkArchetypes[idx]!,
    env: zonePlan.chunkEnvs[idx]!,
    maneuvers: draft.maneuvers,
    vignettes: chunkVignettes[idx]!,
  }));

  const syncAnchors = buildSyncAnchors(
    beatMap,
    dropMarkers,
    tunnelSpans,
    totalBars,
    nominalSegmentsPerBar,
    segmentLength,
  );

  return {
    contentHash: beatMap.contentHash,
    seed,
    stageId,
    beatMap,
    trackDna,
    totalBars,
    nominalSegmentsPerBar,
    segmentsPerBeat,
    segmentLength,
    barLengthWorld,
    referenceSpeed,
    curveEnergyScale,
    chunks,
    barEnv,
    barArchetypes: zonePlan.barArchetypes,
    dropMarkers,
    syncAnchors,
    tunnelSpans,
    zoneTransitions: zonePlan.transitions,
    powerLineRuns: powerLines.runs,
    powerLineCrossing: powerLines.crossing,
    forkStartBar,
    tailStartBar,
  };
}

/**
 * Samples curve, nominal elevation slope (`dY / dBar`), environment, and archetype at continuous `barFloat`
 * into pre-allocated `out` (zero GC).
 */
export function sampleBlueprintAtBar(
  blueprint: SongBlueprint,
  rawBarFloat: number,
  out: BlueprintSample,
): BlueprintSample {
  const clampedBar = Math.max(0, Math.min(blueprint.totalBars - 1e-4, rawBarFloat));
  const barIdx = Math.min(blueprint.totalBars - 1, Math.floor(clampedBar));

  // Locate owning chunk (small array ~8-24 chunks; linear scan is O(1) cache-friendly)
  let cIdx = blueprint.chunks.length - 1;
  for (let i = 0; i < blueprint.chunks.length; i++) {
    const ch = blueprint.chunks[i]!;
    if (clampedBar >= ch.startBar && clampedBar < ch.startBar + ch.bars) {
      cIdx = i;
      break;
    }
  }
  const chunk = blueprint.chunks[Math.max(0, cIdx)]!;
  const localBar = Math.max(0, clampedBar - chunk.startBar);

  let mIdx = chunk.maneuvers.length - 1;
  for (let i = 0; i < chunk.maneuvers.length; i++) {
    const m = chunk.maneuvers[i]!;
    if (localBar >= m.startBarOffset && localBar < m.startBarOffset + m.bars) {
      mIdx = i;
      break;
    }
  }
  const m = chunk.maneuvers[Math.max(0, mIdx)]!;
  const u = Math.max(0, Math.min(1, (localBar - m.startBarOffset) / Math.max(1e-4, m.bars)));

  // Curvature with enter/hold/leave easing
  let curve = 0;
  if (m.rawCurve !== 0 || m.prevBlends || m.nextBlends) {
    const segEnergy = sampleSmoothEnergy(blueprint.beatMap.barEnergy, clampedBar);
    const cScale = computeBlueprintCurveScale(chunk.role, segEnergy, blueprint.curveEnergyScale);
    const rawTarget = m.rawCurve === 0 ? 0 : m.rawCurve * cScale;
    const localTarget =
      m.uphillCurveCap < Infinity
        ? Math.max(-m.uphillCurveCap, Math.min(m.uphillCurveCap, rawTarget))
        : rawTarget;

    const enterR = m.easeRatio[0];
    const leaveR = m.easeRatio[1];
    const holdEnd = Math.max(enterR, 1 - leaveR);

    if (u < enterR && enterR > 1e-4) {
      const t = u / enterR;
      curve = m.prevBlends ? easeInOut(m.startCurve, localTarget, t) : easeIn(0, localTarget, t);
    } else if (u <= holdEnd) {
      curve = localTarget;
    } else {
      const t = (u - holdEnd) / Math.max(1e-4, 1 - holdEnd);
      curve = easeInOut(localTarget, m.endCurve, t);
    }
  }

  // Analytical derivative of elevation easing (`dY / dBar`)
  // For easeIn(a, b, u) = a + (b - a) * u^2 -> dy/du = 2*(b-a)*u
  // For easeInOut(a, b, u) = a + (b - a) * (0.5 - 0.5*cos(pi*u)) -> dy/du = 0.5*pi*(b-a)*sin(pi*u)
  const safeBars = Math.max(0.25, m.bars);
  const slopePerBar = m.isFinalCrest
    ? (2 * m.targetDeltaY * u) / safeBars
    : (0.5 * Math.PI * m.targetDeltaY * Math.sin(Math.PI * u)) / safeBars;

  out.chunkIndex = chunk.chunkIndex;
  out.maneuverIndex = Math.max(0, mIdx);
  out.curve = curve;
  out.slopePerBar = slopePerBar;
  out.maxAvgGrade = m.maxAvgGrade;
  out.env = blueprint.barEnv[barIdx] ?? chunk.env;
  out.archetype = blueprint.barArchetypes[barIdx] ?? chunk.archetype;
  out.role = chunk.role;
  return out;
}
