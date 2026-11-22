import { barDurationSec, type BeatMap, type BeatSection, type SectionRole } from '@src/audio/BeatMap';
import { FORK_APPROACH_BARS, RUMBLE_LENGTH, SEGMENT_LENGTH } from '@src/config/constants';
import { DEFAULT_TUNING, tuning } from '@src/config/tuning';
import { SeededRandom } from '@src/core/SeededRandom';
import {
  detectMuffledSpans,
  ENVIRONMENT_ARCHETYPES,
  planStageZones,
  type ArchetypePropRule,
  type EnvironmentArchetypeId,
  type MuffledSpan,
  type StageRegionId,
  type ZonePlanChunkInput,
  type ZoneTransition,
} from './EnvironmentArchetypes';
import {
  getChunksForRole,
  ROAD_CHUNKS,
  type DrivingStyleTag,
  type RoadChunk,
  type StructureCapability,
  type TrafficProfile,
} from './RoadChunks';
import { easeIn, easeInOut } from './RoadProjection';
import {
  createPoint,
  isOverheadProp,
  PROP_BAND_RANGES,
  sortSegmentSprites,
  type RoadSegment,
  type RoadSprite,
  type SegmentEnvironment,
  type Track,
} from './RoadSegment';
import { populatePowerLines } from './SceneryCorridors';
import { CURVE, HILL } from './TrackBuilder';
import { placeVignette, VIGNETTE_PREFABS } from './Vignettes';

export interface CanonicalSegmentData {
  /** Curvatura originale di ciascun segmento (lunghezza = segments.length). */
  readonly curve: Float64Array;
  /** Quota worldY di p1 per ciascun segmento (lunghezza = segments.length). */
  readonly p1WorldY: Float64Array;
  /** Quota worldY di p2 per ciascun segmento (lunghezza = segments.length). */
  readonly p2WorldY: Float64Array;
  /** Copia immutabile delle liste di sprite originali per segmento. */
  readonly sprites: readonly (readonly RoadSprite[])[];
  /** Ambiente originale (`'standard'` | `'bridge'` | `'viaduct'` | `'tunnel'`) di ciascun segmento. */
  readonly env: readonly SegmentEnvironment[];
}

export interface TrackDna {
  readonly bpm: number;
  readonly meanEnergy: number;
  readonly energyVariance: number;
  readonly styleWeights: Readonly<Record<DrivingStyleTag, number>>;
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
  trafficProfile: TrafficProfile;
  allowedStructures: readonly StructureCapability[];
  fixtureCadenceBeats: 1 | 2 | 4;
  archetype: EnvironmentArchetypeId;
  env: SegmentEnvironment;
}

export interface DropMarker {
  barIndex: number;
  segmentIndex: number;
  worldZ: number;
}

export interface SongTrack extends Track {
  contentHash: string;
  seed: string;
  stageId: StageRegionId;
  trackDna: TrackDna;
  totalBars: number;
  segmentsPerBar: number;
  /** World units per musical bar (`segmentsPerBar * segmentLength`). */
  barLengthWorld: number;
  /** Reference speed in world units/s used to lay out the track. */
  referenceSpeed: number;
  chunks: PlacedRoadChunk[];
  dropMarkers: DropMarker[];
  tunnelSpans: readonly MuffledSpan[];
  zoneTransitions: readonly ZoneTransition[];
  readonly canonical: CanonicalSegmentData;
  /** Inclusive/exclusive segment index bounds `[start, end)` dirtied by the last horizon stitch. */
  dirtyStitchRange?: { start: number; end: number };
}

export interface SongRoadOptions {
  /** Overrides `beatMap.contentHash` as the deterministic PRNG seed. */
  seed?: string;
  /** Stage macro-region ID used solely by the Zone Planner & Scenery Dresser (default `'night'`). */
  stageId?: StageRegionId;
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

interface GeometryChunkDraft extends ZonePlanChunkInput {
  chunk: RoadChunk;
  mirrored: boolean;
  mirrorSign: -1 | 1;
  avgEnergy: number;
}

/**
 * Layer 1: Computes deterministic Track DNA (driving personality weights) from BPM and energy profile.
 */
export function computeTrackDna(beatMap: BeatMap): TrackDna {
  const n = beatMap.barEnergy.length;
  let sum = 0;
  for (let i = 0; i < n; i++) {
    sum += beatMap.barEnergy[i] ?? 0.5;
  }
  const meanEnergy = n > 0 ? sum / n : 0.5;

  let sqDiff = 0;
  for (let i = 0; i < n; i++) {
    const d = (beatMap.barEnergy[i] ?? 0.5) - meanEnergy;
    sqDiff += d * d;
  }
  const energyVariance = n > 0 ? Math.sqrt(sqDiff / n) : 0;

  let breakdownBars = 0;
  const totalSecBars = Math.max(
    1,
    beatMap.sections.reduce((acc, s) => acc + s.bars, 0),
  );
  for (const sec of beatMap.sections) {
    if (sec.role === 'breakdown') breakdownBars += sec.bars;
  }
  const breakdownRatio = breakdownBars / totalSecBars;

  const bpm = beatMap.bpm;
  const clampW = (v: number): number => Math.round(Math.max(0.65, Math.min(1.75, v)) * 1000) / 1000;

  // Chill / mid-tempo tracks favor scenic cruises; high-BPM/high-energy tracks favor Wangan expressways;
  // high dynamic contrast or strong breakdown presence boosts technical touge/switchback chunks.
  const wangan = clampW(
    1.0 + (bpm >= 124 ? (bpm - 122) * 0.03 : -0.15) + (meanEnergy - 0.52) * 0.9,
  );
  const cruise = clampW(
    1.0 + (bpm <= 118 ? (120 - bpm) * 0.035 : -0.1) + (0.55 - meanEnergy) * 0.8,
  );
  const scenic = clampW(
    1.0 + (0.58 - meanEnergy) * 0.65 + (bpm <= 122 ? 0.15 : -0.05),
  );
  const technical = clampW(
    1.0 + Math.max(0, energyVariance - 0.15) * 1.8 + breakdownRatio * 0.9,
  );

  return {
    bpm,
    meanEnergy: Math.round(meanEnergy * 1000) / 1000,
    energyVariance: Math.round(energyVariance * 1000) / 1000,
    styleWeights: {
      cruise,
      wangan,
      technical,
      scenic,
    },
  };
}

/**
 * Generates a deterministic pseudo-3D `SongTrack` from a `BeatMap` using the 4-layer pipeline:
 * 1. Track DNA & Blueprint (`computeTrackDna`)
 * 2. Pure Geometry Compiler (`${seed}:geometry`) — identical curves/elevations regardless of `stageId`
 * 3. Zone & Structure Planner (`${seed}:scenery:${stageId}`) — macro-region acts, elevated, tunnels
 * 4. Scenery & Landmark Dresser — archetype Band A/B/C/D props, jihanki, powerlines, vignettes
 */
export function generateSongRoad(beatMap: BeatMap, options: SongRoadOptions = {}): SongTrack {
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
  // Keep segmentsPerBar divisible by 4 so quarter-note beat prop spacing is integer-aligned
  const rawSegmentsPerBar = Math.max(16, Math.round((referenceSpeed * barDur) / segmentLength));
  const segmentsPerBar = Math.max(16, Math.round(rawSegmentsPerBar / 4) * 4);
  const segmentsPerBeat = segmentsPerBar / 4;
  const barLengthWorld = segmentsPerBar * segmentLength;

  const sections = normalizeSections(beatMap);
  const totalBars = sections.reduce((acc, s) => acc + s.bars, 0);

  // ==========================================================================
  // LAYER 1: Track DNA & Muffled Span Blueprint (pure function of BeatMap)
  // ==========================================================================
  const trackDna = computeTrackDna(beatMap);
  const tunnelSpans = detectMuffledSpans(beatMap, totalBars);

  const isRangeMuffled = (startBar: number, endBar: number): boolean => {
    for (let i = 0; i < tunnelSpans.length; i++) {
      const sp = tunnelSpans[i]!;
      if (startBar < sp.endBar && endBar > sp.startBar) return true;
    }
    return false;
  };

  // ==========================================================================
  // LAYER 2: Pure Geometry Compiler (`geoRng` ONLY — zero stageId dependence)
  // ==========================================================================
  const segments: RoadSegment[] = [];
  const draftChunks: GeometryChunkDraft[] = [];
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
      env: 'standard',
    });
  };

  const recentChunkIds: string[] = [];
  const chunkUsageCounts = new Map<string, number>();
  let lastCurveSign: -1 | 1 = 1;

  // Tail window where elevation returns smoothly to worldY = 0 without cutting an active build->drop crest
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

  for (let secIdx = 0; secIdx < sections.length; secIdx++) {
    const sec = sections[secIdx]!;
    const nextSec = sections[secIdx + 1];
    const isPreDropSection = sec.role !== 'drop' && nextSec?.role === 'drop';
    let justCrestedIntoDrop = sec.role === 'drop' && prevSectionCrested;

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

      const avgEnergy = averageBarEnergy(beatMap.barEnergy, barCursor, actualBars);
      const chunk = selectChunk(
        geoRng,
        catalog,
        sec.role,
        chunkBars,
        avgEnergy,
        recentChunkIds,
        chunkUsageCounts,
        lastY(),
        trackDna,
        requiresPreDropCrest,
        requiresPostCrestReveal,
        chunkIsMuffled,
        isPreDropSection,
      );
      recentChunkIds.push(chunk.id);
      if (recentChunkIds.length > 3) {
        recentChunkIds.shift();
      }
      chunkUsageCounts.set(chunk.id, (chunkUsageCounts.get(chunk.id) ?? 0) + 1);

      const mirrored: boolean =
        chunk.allowMirror === false
          ? false
          : geoRng.bool(0.65)
            ? lastCurveSign > 0
            : geoRng.bool(0.5);
      const mirrorSign: -1 | 1 = mirrored ? -1 : 1;
      lastCurveSign = mirrorSign;

      const chunkStartSeg = segments.length;
      const chunkSegCount = actualBars * segmentsPerBar;
      const barScale = actualBars / chunk.bars;

      // Pre-compute maneuver endpoints & per-maneuver bar cursor for seamless `blendToNext` transitions
      const maneuverCount = chunk.maneuvers.length;
      const maneuverStartBars: number[] = new Array<number>(maneuverCount);
      const maneuverTargetCurves: number[] = new Array<number>(maneuverCount);
      let mBarAcc = barCursor;
      for (let mIdx = 0; mIdx < maneuverCount; mIdx++) {
        const m = chunk.maneuvers[mIdx]!;
        maneuverStartBars[mIdx] = mBarAcc;
        const mBarsScaled = m.bars * barScale;
        const midEnergy = sampleSmoothBarEnergy(beatMap.barEnergy, mBarAcc + mBarsScaled * 0.5);
        const cScale = computeRoleAwareCurveScale(sec.role, midEnergy, curveEnergyScale);
        maneuverTargetCurves[mIdx] = m.curve === 0 ? 0 : m.curve * mirrorSign * cScale;
        mBarAcc += mBarsScaled;
      }

      for (let mIdx = 0; mIdx < maneuverCount; mIdx++) {
        const m = chunk.maneuvers[mIdx]!;
        const isLastManeuverInChunk = mIdx === maneuverCount - 1;

        const mSegCount = isLastManeuverInChunk
          ? chunkStartSeg + chunkSegCount - segments.length
          : Math.max(4, Math.round(m.bars * barScale * segmentsPerBar));

        if (mSegCount <= 0) continue;

        const [enterRatio, leaveRatio] = m.easeRatio ?? [0.25, 0.25];
        const enterSegs = Math.max(1, Math.floor(mSegCount * enterRatio));
        const leaveSegs = Math.max(1, Math.floor(mSegCount * leaveRatio));
        const holdSegs = Math.max(0, mSegCount - enterSegs - leaveSegs);

        const prevBlends = mIdx > 0 && chunk.maneuvers[mIdx - 1]!.blendToNext === true;
        const nextBlends = m.blendToNext === true && mIdx < maneuverCount - 1;
        const startCurve = prevBlends
          ? (maneuverTargetCurves[mIdx - 1]! + maneuverTargetCurves[mIdx]!) * 0.5
          : 0;
        const endCurve = nextBlends
          ? (maneuverTargetCurves[mIdx]! + maneuverTargetCurves[mIdx + 1]!) * 0.5
          : 0;

        const mMidEnergy = sampleSmoothBarEnergy(
          beatMap.barEnergy,
          maneuverStartBars[mIdx]! + m.bars * barScale * 0.5,
        );
        const hillScale = computeHillScale(mMidEnergy, hillEnergyScale);

        // Planned elevation budget:
        // 1. Pre-drop non-muffled sections: climb steadily to crest at the exact drop boundary.
        //    (`build -> drop` climbs across the build; `intro/breakdown -> drop` climbs on final chunk)
        // 2. Pre-drop muffled tunnel: keep gentle level grade inside tunnel so exit reveals sky cleanly.
        // 3. Regular chunks: preserve authorial hill delta with soft outer altitude bounds only.
        const startY = lastY();
        let endY: number;
        const applyBuildClimb =
          isPreDropSection &&
          !chunkIsMuffled &&
          (sec.role === 'build' || isFinalChunkOfSection);

        if (applyBuildClimb) {
          const minClimbUnits =
            isFinalChunkOfSection && isLastManeuverInChunk ? HILL.HIGH : HILL.MEDIUM * 0.65;
          const climbUnits = Math.max(minClimbUnits, Math.abs(m.elevation)) * hillScale;
          endY = Math.min(16500, startY + climbUnits * segmentLength);
          if (isFinalChunkOfSection && isLastManeuverInChunk) {
            sectionEndedWithCrest = true;
          }
        } else if (isPreDropSection && chunkIsMuffled) {
          const gentleDelta = m.elevation * 0.3 * hillScale * segmentLength;
          endY = Math.max(-4500, Math.min(6000, startY + gentleDelta));
        } else {
          let rawDeltaY = m.elevation * hillScale * segmentLength;
          // Planned vertical boundary guard: damp only excursions that push further past ±7500
          if (Math.abs(startY) > 7500 && rawDeltaY * startY > 0) {
            rawDeltaY *= 0.35;
          }
          const maxAlt = 16500;
          const minAlt = -12000;
          endY = Math.max(minAlt, Math.min(maxAlt, startY + rawDeltaY));
        }

        const isFinalCrestManeuver =
          applyBuildClimb && isFinalChunkOfSection && isLastManeuverInChunk;

        for (let n = 0; n < mSegCount; n++) {
          let c: number;
          if (m.curve === 0 && !prevBlends && !nextBlends) {
            c = 0;
          } else {
            const segBarFloat = barCursor + (segments.length - chunkStartSeg) / segmentsPerBar;
            const segEnergy = sampleSmoothBarEnergy(beatMap.barEnergy, segBarFloat);
            const segCurveScale = computeRoleAwareCurveScale(sec.role, segEnergy, curveEnergyScale);
            const localTargetCurve = m.curve === 0 ? 0 : m.curve * mirrorSign * segCurveScale;

            if (n < enterSegs) {
              const t = n / enterSegs;
              c = prevBlends
                ? easeInOut(startCurve, localTargetCurve, t)
                : easeIn(0, localTargetCurve, t);
            } else if (n < enterSegs + holdSegs) {
              c = localTargetCurve;
            } else {
              const leaveIdx = n - enterSegs - holdSegs;
              const t = leaveIdx / Math.max(1, leaveSegs);
              c = easeInOut(localTargetCurve, endCurve, t);
            }
          }

          const yProgress = (n + 1) / mSegCount;
          const y = isFinalCrestManeuver
            ? easeIn(startY, endY, yProgress)
            : easeInOut(startY, endY, yProgress);

          appendSegment(c, y);
        }
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
      });

      barCursor += actualBars;
    }

    prevSectionCrested = sectionEndedWithCrest;
  }

  // Planned section-level tail elevation: distribute the return-to-zero offset additively across
  // the safe tail window so authorial outro hills/dips remain expressive while closing smoothly at worldY = 0.
  const tailStartSeg = Math.max(0, Math.min(segments.length - 1, tailStartBar * segmentsPerBar));
  const tailCount = segments.length - tailStartSeg;
  if (tailCount > 0) {
    const endY = segments[segments.length - 1]!.p2.worldY;
    if (Math.abs(endY) > 1e-6) {
      let prevDelta = 0;
      for (let k = 0; k < tailCount; k++) {
        const seg = segments[tailStartSeg + k]!;
        const progress = (k + 1) / tailCount;
        const nextDelta = k === tailCount - 1 ? -endY : easeInOut(0, -endY, progress);
        seg.p1.worldY += prevDelta;
        seg.p2.worldY = k === tailCount - 1 ? 0 : seg.p2.worldY + nextDelta;
        prevDelta = nextDelta;
      }
    } else {
      segments[segments.length - 1]!.p2.worldY = 0;
    }
  }

  // ==========================================================================
  // LAYER 3: Zone & Structure Planner (`sceneryRng`)
  // ==========================================================================
  const zonePlan = planStageZones(
    draftChunks,
    sections,
    stageId,
    tunnelSpans,
    totalBars,
    segmentsPerBar,
    sceneryRng,
  );

  for (let i = 0; i < segments.length; i++) {
    segments[i]!.env = zonePlan.segmentEnvs[i] ?? 'standard';
  }

  const placedChunks: PlacedRoadChunk[] = draftChunks.map((draft, idx) => ({
    chunkId: draft.chunk.id,
    role: draft.role,
    startBar: draft.startBar,
    bars: draft.bars,
    startSegment: draft.startSegment,
    segmentCount: draft.segmentCount,
    mirrored: draft.mirrored,
    avgEnergy: draft.avgEnergy,
    trafficProfile: draft.chunk.trafficProfile,
    allowedStructures: draft.chunk.allowedStructures,
    fixtureCadenceBeats: draft.chunk.fixtureCadenceBeats,
    archetype: zonePlan.chunkArchetypes[idx]!,
    env: zonePlan.chunkEnvs[idx]!,
  }));

  // ==========================================================================
  // LAYER 4: Scenery & Landmark Dresser (`sceneryRng`)
  // ==========================================================================
  for (let cIdx = 0; cIdx < draftChunks.length; cIdx++) {
    const draft = draftChunks[cIdx]!;
    const pChunk = placedChunks[cIdx]!;
    const chunkEndSeg = draft.startSegment + draft.segmentCount;

    let hasStandard = false;
    let hasTunnel = false;
    let hasBridge = false;
    let hasViaduct = false;
    for (let s = draft.startSegment; s < chunkEndSeg; s++) {
      const env = segments[s]?.env ?? 'standard';
      if (env === 'tunnel') hasTunnel = true;
      else if (env === 'bridge') hasBridge = true;
      else if (env === 'viaduct') hasViaduct = true;
      else hasStandard = true;
    }

    if (hasTunnel) {
      const lightStride = Math.max(4, Math.round(segmentsPerBeat * pChunk.fixtureCadenceBeats));
      for (let s = draft.startSegment; s < chunkEndSeg; s++) {
        if (segments[s]?.env === 'tunnel' && (s - draft.startSegment) % lightStride === 0) {
          segments[s]!.tunnelLight = true;
        }
      }
    }

    if (hasBridge && !hasStandard && !hasTunnel && !hasViaduct) {
      dressBridgeChunk(segments, draft, segmentsPerBeat, sceneryRng);
    } else if (hasViaduct && !hasStandard && !hasTunnel && !hasBridge) {
      dressViaductChunk(segments, draft, segmentsPerBeat, sceneryRng);
      populateChunkChevrons(
        segments,
        draft.startSegment,
        draft.segmentCount,
        segmentsPerBeat,
        1.24,
        false,
      );
    } else {
      if (hasStandard) {
        dressStandardChunk(
          segments,
          draft,
          pChunk,
          segmentsPerBeat,
          segmentsPerBar,
          zonePlan.transitions,
          sceneryRng,
        );
      }
      if (hasBridge) {
        dressBridgeChunk(segments, draft, segmentsPerBeat, sceneryRng);
      }
      if (hasViaduct) {
        dressViaductChunk(segments, draft, segmentsPerBeat, sceneryRng);
      }

      let subStart = draft.startSegment;
      while (subStart < chunkEndSeg) {
        const subEnv = segments[subStart]?.env ?? 'standard';
        let subEnd = subStart + 1;
        while (subEnd < chunkEndSeg && (segments[subEnd]?.env ?? 'standard') === subEnv) {
          subEnd++;
        }
        const subCount = subEnd - subStart;
        if (subEnv === 'tunnel') {
          populateChunkChevrons(segments, subStart, subCount, segmentsPerBeat, 1.18, true);
        } else if (subEnv === 'viaduct') {
          populateChunkChevrons(segments, subStart, subCount, segmentsPerBeat, 1.24, false);
        } else if (subEnv === 'standard') {
          populateChunkChevrons(segments, subStart, subCount, segmentsPerBeat, 1.3, false);
        }
        subStart = subEnd;
      }
    }
  }

  // Place threshold landmarks (gantry / overpass) cleanly at zone transitions
  const landmarkClearSegs = Math.max(6, Math.round(segmentsPerBeat * 2));
  for (const trans of zonePlan.transitions) {
    const seg = segments[trans.segmentIndex];
    if (!seg || seg.env !== 'standard') continue;
    let hasNearbyOverhead = false;
    const lo = Math.max(0, trans.segmentIndex - landmarkClearSegs);
    const hi = Math.min(segments.length - 1, trans.segmentIndex + landmarkClearSegs);
    for (let s = lo; s <= hi; s++) {
      if (segments[s]?.sprites.some((sp) => isOverheadProp(sp.kind))) {
        hasNearbyOverhead = true;
        break;
      }
    }
    if (!hasNearbyOverhead) {
      seg.sprites.push({
        kind: trans.landmark,
        offset: 0,
        variant: 0,
        scale: 1,
      });
    }
  }

  // Decorate open-sky drop markers with twin neon billboards framing the crest reveal
  for (const dm of dropMarkers) {
    const seg = segments[dm.segmentIndex];
    if (seg && seg.env === 'standard') {
      seg.sprites.push(
        { kind: 'billboard', offset: -1.65, variant: 0 },
        { kind: 'billboard', offset: 1.65, variant: 1 },
      );
    }
  }

  // Populate continuous roadside power-line corridors (only on standard segments of eligible archetypes)
  populatePowerLines(segments, placedChunks, segmentsPerBar, sceneryRng);

  // Populate composite roadside vignettes selected from each chunk's active archetype
  populateSongRoadVignettes(
    segments,
    placedChunks,
    segmentsPerBeat,
    totalBars,
    sceneryRng,
  );

  // Static lateral intra-segment ordering (Band D -> C -> B -> A, overhead portals last)
  sortSegmentSprites(segments);

  // Pre-allocate immutable canonical blueprint for zero-GC runtime restoration & horizon stitching
  const count = segments.length;
  const canonicalCurve = new Float64Array(count);
  const canonicalP1WorldY = new Float64Array(count);
  const canonicalP2WorldY = new Float64Array(count);
  const canonicalSprites: (readonly RoadSprite[])[] = new Array(count);
  const canonicalEnv: SegmentEnvironment[] = new Array(count);

  for (let i = 0; i < count; i++) {
    const s = segments[i]!;
    canonicalCurve[i] = s.curve;
    canonicalP1WorldY[i] = s.p1.worldY;
    canonicalP2WorldY[i] = s.p2.worldY;
    canonicalSprites[i] = s.sprites.slice();
    canonicalEnv[i] = s.env ?? 'standard';
  }

  const canonical: CanonicalSegmentData = {
    curve: canonicalCurve,
    p1WorldY: canonicalP1WorldY,
    p2WorldY: canonicalP2WorldY,
    sprites: canonicalSprites,
    env: canonicalEnv,
  };

  return {
    segments,
    segmentLength,
    length: segments.length * segmentLength,
    contentHash: beatMap.contentHash,
    seed,
    stageId,
    trackDna,
    totalBars,
    segmentsPerBar,
    barLengthWorld,
    referenceSpeed,
    chunks: placedChunks,
    dropMarkers,
    tunnelSpans,
    zoneTransitions: zonePlan.transitions,
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
 */
export function getSectionPaceFactor(
  _track: SongTrack,
  barIndex: number,
  sectionRole: SectionRole,
  isRollingStart = false,
): number {
  if (barIndex < 4) {
    if (isRollingStart) {
      return 1.0;
    }
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

  if (deltaSegs < 12) return null;

  const toSegIndex = fromSegIndex + deltaSegs;
  if (fromSegIndex < 0 || toSegIndex + drawDistance + 16 >= segCount) {
    return null;
  }

  const copyCount = Math.max(1, drawDistance - 24);

  // Never stitch across or onto any special structure (`bridge`, `viaduct`, or `tunnel`),
  // including the 24-segment horizon blend zone so portals and ramps never warp.
  for (let n = 0; n < drawDistance; n++) {
    const srcEnv = track.segments[fromSegIndex + n]?.env ?? 'standard';
    const destEnv = track.canonical.env[toSegIndex + n] ?? 'standard';
    if (srcEnv !== 'standard' || destEnv !== 'standard') {
      return null;
    }
  }

  const deltaY =
    track.canonical.p1WorldY[toSegIndex]! - track.segments[fromSegIndex]!.p1.worldY;

  for (let n = copyCount - 1; n >= 0; n--) {
    const srcSeg = track.segments[fromSegIndex + n]!;
    const destSeg = track.segments[toSegIndex + n]!;

    destSeg.curve = srcSeg.curve;
    destSeg.p1.worldY = srcSeg.p1.worldY + deltaY;
    destSeg.p2.worldY = srcSeg.p2.worldY + deltaY;
    destSeg.env = srcSeg.env;

    const isDestDropMarker = isDropMarkerSegment(track.dropMarkers, toSegIndex + n);
    if (isDestDropMarker) {
      destSeg.sprites = track.canonical.sprites[toSegIndex + n] as RoadSprite[];
    } else {
      destSeg.sprites = srcSeg.sprites;
    }
  }

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

    seg.sprites = track.canonical.sprites[segIdx] as RoadSprite[];
    seg.env = track.canonical.env[segIdx]!;
  }

  const newStart = toSegIndex;
  const newEnd = toSegIndex + drawDistance;
  if (track.dirtyStitchRange) {
    const prevStart = Math.max(0, track.dirtyStitchRange.start);
    const prevEnd = Math.min(segCount, track.dirtyStitchRange.end);
    const beforeEnd = Math.min(prevEnd, newStart);
    for (let i = prevStart; i < beforeEnd; i++) {
      const seg = track.segments[i]!;
      seg.curve = track.canonical.curve[i]!;
      seg.p1.worldY = track.canonical.p1WorldY[i]!;
      seg.p2.worldY = track.canonical.p2WorldY[i]!;
      seg.sprites = track.canonical.sprites[i] as RoadSprite[];
      seg.env = track.canonical.env[i]!;
    }
    const afterStart = Math.max(prevStart, newEnd);
    for (let i = afterStart; i < prevEnd; i++) {
      const seg = track.segments[i]!;
      seg.curve = track.canonical.curve[i]!;
      seg.p1.worldY = track.canonical.p1WorldY[i]!;
      seg.p2.worldY = track.canonical.p2WorldY[i]!;
      seg.sprites = track.canonical.sprites[i] as RoadSprite[];
      seg.env = track.canonical.env[i]!;
    }
  }
  track.dirtyStitchRange = { start: newStart, end: newEnd };

  return {
    deltaZ: deltaSegs * segLen,
    fromSegIndex,
    toSegIndex,
    copiedWindowSegs: copyCount,
  };
}

function isDropMarkerSegment(dropMarkers: readonly DropMarker[], segmentIndex: number): boolean {
  for (let i = 0; i < dropMarkers.length; i++) {
    if (dropMarkers[i]!.segmentIndex === segmentIndex) return true;
  }
  return false;
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
    s.sprites = canonical.sprites[i] as RoadSprite[];
    s.env = canonical.env[i]!;
  }
  track.dirtyStitchRange = undefined;
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

function sampleSmoothBarEnergy(barEnergy: readonly number[], barFloat: number): number {
  if (barEnergy.length === 0) return 0.5;
  const clamped = Math.max(0, Math.min(barEnergy.length - 1, barFloat));
  const lo = Math.floor(clamped);
  const hi = Math.min(barEnergy.length - 1, lo + 1);
  const frac = clamped - lo;
  return (barEnergy[lo] ?? 0.5) * (1 - frac) + (barEnergy[hi] ?? 0.5) * frac;
}

function computeRoleAwareCurveScale(
  role: SectionRole,
  energy: number,
  curveEnergyScale: number,
): number {
  if (role === 'breakdown') {
    // Breakdowns stay crisp & drift-worthy even when sub-bass/energy dips!
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

function computeHillScale(energy: number, hillEnergyScale: number): number {
  return Math.max(0.5, Math.min(1.35, 1 + (energy - 0.5) * hillEnergyScale));
}

function selectChunk(
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

    // Track DNA personality weighting
    let dnaSum = 0;
    for (let i = 0; i < chunk.styleTags.length; i++) {
      dnaSum += trackDna.styleWeights[chunk.styleTags[i]!] ?? 1.0;
    }
    const dnaWeight = chunk.styleTags.length > 0 ? dnaSum / chunk.styleTags.length : 1.0;

    // Elevation homeostasis: bias compensating chunks when cumulative worldY drifts past ±6500
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

    // Muffled sections prefer tunnel-compatible choreography
    const muffleBias =
      chunkIsMuffled && chunk.allowedStructures.includes('tunnel') ? 1.65 : chunkIsMuffled ? 0.65 : 1.0;

    return energyWeight * noveltyWeight * dnaWeight * elevationBias * muffleBias;
  });
}

// ============================================================================
// LAYER 4: Scenery Dresser Helpers
// ============================================================================

const BRIDGE_RULES: readonly ArchetypePropRule[] = [
  { kind: 'suspension-tower', placement: 'both', everyBeats: 16, band: 'A', offset: 0, rhythmic: true },
  { kind: 'lamp', placement: 'both', everyBeats: 2, band: 'A', offset: 1.18, rhythmic: true },
];

const VIADUCT_RULES: readonly ArchetypePropRule[] = [
  { kind: 'lamp', placement: 'both', everyBeats: 2, band: 'A', offset: 1.18, rhythmic: true },
  { kind: 'gantry', placement: 'both', everyBeats: 16, band: 'A', offset: 0, rhythmic: true },
  { kind: 'vms', placement: 'right', everyBeats: 16, band: 'A', offset: 1.32, rhythmic: true },
  { kind: 'building', placement: 'both', everyBeats: 4, band: 'D', offset: 8.2, jitter: { lateral: 1.4, beats: 0.8 }, rhythmic: false, scaleJitter: 0.25 },
];

function dressBridgeChunk(
  segments: RoadSegment[],
  draft: GeometryChunkDraft,
  segmentsPerBeat: number,
  rng: SeededRandom,
): void {
  emitPropRules(
    segments,
    draft.startSegment,
    draft.segmentCount,
    segmentsPerBeat,
    BRIDGE_RULES,
    draft.chunk.fixtureCadenceBeats,
    draft.role,
    draft.avgEnergy,
    draft.mirrorSign,
    rng,
    2.8,
  );
}

function dressViaductChunk(
  segments: RoadSegment[],
  draft: GeometryChunkDraft,
  segmentsPerBeat: number,
  rng: SeededRandom,
): void {
  emitPropRules(
    segments,
    draft.startSegment,
    draft.segmentCount,
    segmentsPerBeat,
    VIADUCT_RULES,
    draft.chunk.fixtureCadenceBeats,
    draft.role,
    draft.avgEnergy,
    draft.mirrorSign,
    rng,
  );
}

function dressStandardChunk(
  segments: RoadSegment[],
  draft: GeometryChunkDraft,
  pChunk: PlacedRoadChunk,
  segmentsPerBeat: number,
  segmentsPerBar: number,
  transitions: readonly ZoneTransition[],
  rng: SeededRandom,
): void {
  const arch = ENVIRONMENT_ARCHETYPES[pChunk.archetype];
  const cadence = pChunk.fixtureCadenceBeats;

  // Band A (rhythmic fixtures)
  emitPropRules(
    segments,
    draft.startSegment,
    draft.segmentCount,
    segmentsPerBeat,
    arch.bandARules,
    cadence,
    draft.role,
    draft.avgEnergy,
    draft.mirrorSign,
    rng,
  );

  // Band B (verge)
  emitPropRules(
    segments,
    draft.startSegment,
    draft.segmentCount,
    segmentsPerBeat,
    arch.bandBRules,
    cadence,
    draft.role,
    draft.avgEnergy,
    draft.mirrorSign,
    rng,
  );

  // Band C & D (with smooth boundary density fade & horizon preview near zone transitions)
  const blendSegs = Math.max(8, Math.round(segmentsPerBar * 1.5));
  const chunkEnd = draft.startSegment + draft.segmentCount;
  let activeOutgoingTransition: ZoneTransition | undefined;
  for (let i = 0; i < transitions.length; i++) {
    const t = transitions[i]!;
    if (t.segmentIndex > draft.startSegment && t.segmentIndex <= chunkEnd) {
      activeOutgoingTransition = t;
      break;
    }
  }

  const getTransitionKeepProb = (segIdx: number): { keepOutgoing: number; previewIncoming: number; nextArch?: EnvironmentArchetypeId } => {
    if (!activeOutgoingTransition) {
      return { keepOutgoing: 1, previewIncoming: 0 };
    }
    const distBefore = activeOutgoingTransition.segmentIndex - segIdx;
    if (distBefore >= 0 && distBefore < blendSegs) {
      const progress = 1 - distBefore / blendSegs; // 0 -> 1 approaching transition
      return {
        keepOutgoing: 1 - progress * 0.72,
        previewIncoming: progress * 0.75,
        nextArch: activeOutgoingTransition.to,
      };
    }
    return { keepOutgoing: 1, previewIncoming: 0 };
  };

  emitPropRules(
    segments,
    draft.startSegment,
    draft.segmentCount,
    segmentsPerBeat,
    arch.bandCRules,
    cadence,
    draft.role,
    draft.avgEnergy,
    draft.mirrorSign,
    rng,
    undefined,
    (segIdx) => getTransitionKeepProb(segIdx).keepOutgoing,
  );

  emitPropRules(
    segments,
    draft.startSegment,
    draft.segmentCount,
    segmentsPerBeat,
    arch.bandDRules,
    cadence,
    draft.role,
    draft.avgEnergy,
    draft.mirrorSign,
    rng,
    undefined,
    (segIdx) => getTransitionKeepProb(segIdx).keepOutgoing,
  );

  // Seed incoming Band D backdrop ahead of zone transitions so new district skyline emerges first
  if (activeOutgoingTransition) {
    const nextArch = ENVIRONMENT_ARCHETYPES[activeOutgoingTransition.to];
    const previewStart = Math.max(draft.startSegment, activeOutgoingTransition.segmentIndex - blendSegs);
    const previewCount = activeOutgoingTransition.segmentIndex - previewStart;
    if (previewCount > 0) {
      emitPropRules(
        segments,
        previewStart,
        previewCount,
        segmentsPerBeat,
        nextArch.bandDRules,
        cadence,
        draft.role,
        draft.avgEnergy,
        draft.mirrorSign,
        rng,
        undefined,
        (segIdx) => getTransitionKeepProb(segIdx).previewIncoming,
      );
    }
  }
}

function emitPropRules(
  segments: RoadSegment[],
  startSeg: number,
  segCount: number,
  segmentsPerBeat: number,
  rules: readonly ArchetypePropRule[],
  cadenceBeats: 1 | 2 | 4,
  role: SectionRole,
  avgEnergy: number,
  mirrorSign: -1 | 1,
  rng: SeededRandom,
  maxLateralClamp?: number,
  keepProbabilityFn?: (segIdx: number) => number,
): void {
  const totalBeats = Math.floor(segCount / Math.max(1, segmentsPerBeat));

  for (const rule of rules) {
    if (rule.roles && !rule.roles.includes(role)) continue;
    if (rule.minEnergy !== undefined && avgEnergy < rule.minEnergy) continue;

    const band = rule.band;
    const isRhythmic = rule.rhythmic ?? band === 'A';
    const rawStep = rule.everyBeats === 'cadence' ? cadenceBeats : rule.everyBeats;
    const stepBeats = Math.max(1, Math.round(rawStep));
    const defaultScaleJitter = isRhythmic ? 0 : 0.2;
    const scaleJitter = rule.scaleJitter ?? defaultScaleJitter;

    let altToggle = 0;
    for (let beat = 0; beat < totalBeats; beat += stepBeats) {
      const beatJitter =
        !isRhythmic && rule.jitter?.beats ? rng.range(-rule.jitter.beats, rule.jitter.beats) : 0;
      const anchorBeat = Math.max(0, Math.min(totalBeats - 0.001, beat + beatJitter));

      let baseOffset: number;
      if (rule.offset !== undefined) {
        baseOffset = rule.offset;
      } else {
        const range = PROP_BAND_RANGES[band];
        baseOffset = rng.range(range.min, range.max);
      }

      const latJitter =
        rule.jitter?.lateral ? rng.range(-rule.jitter.lateral, rule.jitter.lateral) : 0;
      let anchorOffset = baseOffset === 0 ? 0 : baseOffset + latJitter;

      if (baseOffset !== 0) {
        const range = PROP_BAND_RANGES[band];
        anchorOffset = Math.max(range.min, Math.min(range.max, anchorOffset));
      }
      if (rule.kind === 'shrub') {
        anchorOffset = Math.max(1.85, anchorOffset);
      }
      if (maxLateralClamp !== undefined && anchorOffset !== 0) {
        anchorOffset = Math.min(maxLateralClamp, anchorOffset);
      }

      const memberCount = rule.cluster ? rng.rangeInt(rule.cluster.min, rule.cluster.max) : 1;
      const altSide = altToggle % 2 === 0 ? -1 : 1;
      altToggle++;

      for (let m = 0; m < memberCount; m++) {
        let mBeat = anchorBeat;
        let mOffset = anchorOffset;

        if (rule.cluster && m > 0) {
          mBeat = Math.max(
            0,
            Math.min(
              totalBeats - 0.001,
              anchorBeat + rng.range(-rule.cluster.spreadBeats * 0.5, rule.cluster.spreadBeats * 0.5),
            ),
          );
          mOffset =
            anchorOffset +
            rng.range(-rule.cluster.spreadLateral * 0.5, rule.cluster.spreadLateral * 0.5);
          if (baseOffset !== 0) {
            const range = PROP_BAND_RANGES[band];
            mOffset = Math.max(range.min, Math.min(range.max, mOffset));
          }
          if (rule.kind === 'shrub') {
            mOffset = Math.max(1.85, mOffset);
          }
          if (maxLateralClamp !== undefined && mOffset !== 0) {
            mOffset = Math.min(maxLateralClamp, mOffset);
          }
        }

        const segIdx =
          startSeg + Math.min(segCount - 1, Math.max(0, Math.round(mBeat * segmentsPerBeat)));
        const seg = segments[segIdx];
        if (!seg || seg.env === 'tunnel') continue;
        if (rule.maxAbsCurve !== undefined && Math.abs(seg.curve) > rule.maxAbsCurve) continue;
        if (keepProbabilityFn) {
          const p = keepProbabilityFn(segIdx);
          if (p < 1 && rng.next() >= p) continue;
        }

        const variant = rule.kind === 'sign' ? rng.rangeInt(0, 1) : rng.rangeInt(0, 2);
        const scale = scaleJitter > 0 ? Math.max(0.2, 1 + rng.range(-scaleJitter, scaleJitter)) : 1;
        const curveSign: -1 | 1 =
          Math.abs(seg.curve) > 0.2 ? (seg.curve > 0 ? 1 : -1) : mirrorSign;

        switch (rule.placement) {
          case 'both':
            if (baseOffset === 0) {
              seg.sprites.push({ kind: rule.kind, offset: 0, variant, scale });
            } else {
              const rightScale =
                scaleJitter > 0 ? Math.max(0.2, 1 + rng.range(-scaleJitter, scaleJitter)) : scale;
              seg.sprites.push(
                { kind: rule.kind, offset: -mOffset, variant, scale },
                { kind: rule.kind, offset: mOffset, variant: (variant + 1) % 3, scale: rightScale },
              );
            }
            break;
          case 'left':
            seg.sprites.push({ kind: rule.kind, offset: -mOffset * mirrorSign, variant, scale });
            break;
          case 'right':
            seg.sprites.push({ kind: rule.kind, offset: mOffset * mirrorSign, variant, scale });
            break;
          case 'alternating':
            seg.sprites.push({ kind: rule.kind, offset: altSide * mOffset, variant, scale });
            break;
          case 'outside-curve':
            seg.sprites.push({ kind: rule.kind, offset: -curveSign * mOffset, variant, scale });
            break;
          case 'inside-curve':
            seg.sprites.push({ kind: rule.kind, offset: curveSign * mOffset, variant, scale });
            break;
        }
      }
    }
  }
}

/**
 * Searches backward from `fromSegIdx` for a straight open road segment (`|curve| <= 0.15`)
 * to place a single curve hazard diamond warning sign (`sign` variant 2) ahead of a bend.
 */
function tryPlaceWarningSign(
  segments: RoadSegment[],
  fromSegIdx: number,
  minSearchSegIdx: number,
  minClearSegs: number,
  offset: number,
): void {
  const start = Math.min(segments.length - 1, fromSegIdx);
  const stop = Math.max(0, minSearchSegIdx);

  for (let s = start; s >= stop; s--) {
    const seg = segments[s];
    if (!seg || seg.env === 'bridge' || seg.env === 'tunnel') continue;
    if (Math.abs(seg.curve) > 0.15) continue;

    let hasNearby = false;
    const scanA = Math.max(0, s - minClearSegs);
    const scanB = Math.min(segments.length - 1, s + minClearSegs);
    for (let k = scanA; k <= scanB; k++) {
      const checkSeg = segments[k];
      if (checkSeg?.sprites.some((sp) => sp.kind === 'sign' || sp.kind === 'chevron')) {
        hasNearby = true;
        break;
      }
    }
    if (hasNearby) continue;

    seg.sprites.push({ kind: 'sign', offset, variant: 2 });
    return;
  }
}

/**
 * Geometry-driven Japanese-style curve signage & directional delineators (矢羽根).
 */
function populateChunkChevrons(
  segments: RoadSegment[],
  startSeg: number,
  segCount: number,
  segmentsPerBeat: number,
  baseOffset = 1.3,
  insideTunnelOnly = false,
): void {
  const endSeg = Math.min(segments.length, startSeg + segCount);
  const segmentsPerBar = Math.max(4, Math.round(segmentsPerBeat * 4));
  const leadSegs = Math.max(6, Math.round(segmentsPerBeat * 1.8));
  const signClearSegs = Math.max(4, Math.round(segmentsPerBeat * 1.5));

  const mediumThreshold = CURVE.MEDIUM * 0.85;
  const hardThreshold = CURVE.HARD * 0.8;
  const easyMinThreshold = 1.5;

  let cursor = startSeg;
  while (cursor < endSeg) {
    const startSample = segments[cursor];
    if (!startSample || Math.abs(startSample.curve) < 1.0) {
      cursor++;
      continue;
    }

    const curveSign: -1 | 1 = startSample.curve > 0 ? 1 : -1;
    const lobeStart = cursor;
    let lobePeak = 0;
    let lobeEnd = cursor;

    while (cursor < endSeg) {
      const s = segments[cursor];
      if (!s || Math.abs(s.curve) < 1.0 || (s.curve > 0 ? 1 : -1) !== curveSign) {
        break;
      }
      const absC = Math.abs(s.curve);
      if (absC > lobePeak) lobePeak = absC;
      lobeEnd = cursor;
      cursor++;
    }

    if (lobePeak < easyMinThreshold) {
      continue;
    }

    const isRight = curveSign > 0;
    const outsideOffset = isRight ? -baseOffset : baseOffset;
    const bodyThreshold = 0.6 * lobePeak;

    let bodyStart = -1;
    let bodyEnd = -1;
    for (let s = lobeStart; s <= lobeEnd; s++) {
      const seg = segments[s];
      if (seg && Math.abs(seg.curve) >= bodyThreshold) {
        if (bodyStart === -1) bodyStart = s;
        bodyEnd = s;
      }
    }

    if (bodyStart === -1) {
      continue;
    }

    if (!insideTunnelOnly) {
      const preferredWarnSeg = bodyStart - leadSegs;
      const minSearchSeg = Math.max(
        startSeg > 0 ? startSeg - Math.round(segmentsPerBar * 0.5) : 0,
        bodyStart - segmentsPerBar,
      );
      tryPlaceWarningSign(segments, preferredWarnSeg, minSearchSeg, signClearSegs, outsideOffset);
    }

    if (lobePeak < mediumThreshold) {
      continue;
    }

    const isHard = lobePeak >= hardThreshold;
    const stepSegs = Math.max(4, Math.round(segmentsPerBeat * (isHard ? 0.5 : 1.0)));
    const dir = isRight ? 0 : 1;
    let seqIndex = 0;

    for (let sIdx = bodyStart; sIdx <= bodyEnd; sIdx += stepSegs) {
      const seg = segments[sIdx];
      if (
        !seg ||
        (insideTunnelOnly
          ? seg.env !== 'tunnel'
          : seg.env === 'bridge' || seg.env === 'tunnel')
      ) {
        continue;
      }
      if (!seg.sprites.some((sp) => sp.kind === 'chevron')) {
        const variant = dir + 2 * seqIndex;
        seg.sprites.push({ kind: 'chevron', offset: outsideOffset, variant });
        seqIndex++;
      }
    }
  }
}

/**
 * Populates composite roadside vignettes from the active archetype of each placed chunk.
 */
export function populateSongRoadVignettes(
  segments: RoadSegment[],
  placedChunks: readonly PlacedRoadChunk[],
  segmentsPerBeat: number,
  totalBars: number,
  rng: SeededRandom,
): void {
  if (segments.length === 0 || placedChunks.length === 0 || segmentsPerBeat <= 0) {
    return;
  }

  const forkApproachStartBar = totalBars - FORK_APPROACH_BARS;
  let lastVignetteChunkIdx = -1;
  let lastVignetteBar = -999;

  for (let cIdx = 0; cIdx < placedChunks.length; cIdx++) {
    const pChunk = placedChunks[cIdx]!;

    if (lastVignetteChunkIdx !== -1 && cIdx === lastVignetteChunkIdx + 1) {
      continue;
    }
    if (lastVignetteBar !== -999 && pChunk.startBar - lastVignetteBar < 12) {
      continue;
    }
    if (
      pChunk.startBar >= forkApproachStartBar ||
      pChunk.startBar + pChunk.bars > forkApproachStartBar
    ) {
      continue;
    }

    // Only place vignettes on standard open-ground chunks
    if (pChunk.env !== 'standard') {
      continue;
    }
    let hasNonStandardSeg = false;
    for (let s = pChunk.startSegment; s < pChunk.startSegment + pChunk.segmentCount; s++) {
      if (segments[s]?.env !== 'standard') {
        hasNonStandardSeg = true;
        break;
      }
    }
    if (hasNonStandardSeg) continue;

    const archetype = ENVIRONMENT_ARCHETYPES[pChunk.archetype];
    if (!archetype || archetype.allowedVignettes.length === 0) {
      continue;
    }

    const startOffset = rng.rangeInt(0, archetype.allowedVignettes.length - 1);
    for (let vIdx = 0; vIdx < archetype.allowedVignettes.length; vIdx++) {
      const slot = archetype.allowedVignettes[(startOffset + vIdx) % archetype.allowedVignettes.length]!;
      if (rng.range(0, 1) >= slot.chance) {
        continue;
      }

      const prefab = VIGNETTE_PREFABS[slot.prefab];
      if (!prefab) continue;

      let minDSeg = 0;
      let maxDSeg = 0;
      for (const m of prefab.members) {
        if (m.dSeg < minDSeg) minDSeg = m.dSeg;
        if (m.dSeg > maxDSeg) maxDSeg = m.dSeg;
      }

      const startBeat = 2;
      const endBeat = Math.max(startBeat, pChunk.bars * 4 - 3);

      interface AnchorCandidate {
        segIdx: number;
        curveAbs: number;
        curve: number;
      }

      const candidates: AnchorCandidate[] = [];
      for (let b = startBeat; b <= endBeat; b += 2) {
        const segIdx = pChunk.startSegment + Math.round(b * segmentsPerBeat);
        if (segIdx < 0 || segIdx >= segments.length) continue;
        const curve = segments[segIdx]!.curve;
        candidates.push({
          segIdx,
          curveAbs: Math.abs(curve),
          curve,
        });
      }

      candidates.sort((a, b) => a.curveAbs - b.curveAbs);

      let placed = false;
      const chunkSegEnd = pChunk.startSegment + pChunk.segmentCount;
      for (const cand of candidates) {
        if (cand.segIdx + minDSeg < pChunk.startSegment || cand.segIdx + maxDSeg >= chunkSegEnd) {
          continue;
        }
        let spanAllStandard = true;
        for (let s = cand.segIdx + minDSeg; s <= cand.segIdx + maxDSeg; s++) {
          if (segments[s]?.env !== 'standard') {
            spanAllStandard = false;
            break;
          }
        }
        if (!spanAllStandard) continue;

        const sidesToTest: (-1 | 1)[] = [];
        const mirrorFactor = pChunk.mirrored ? -1 : 1;

        if (slot.side === 'left') {
          sidesToTest.push((-1 * mirrorFactor) as -1 | 1);
        } else if (slot.side === 'right') {
          sidesToTest.push((1 * mirrorFactor) as -1 | 1);
        } else if (slot.side === 'outside-curve') {
          const outside: -1 | 1 =
            cand.curve > 0.05 ? -1 : cand.curve < -0.05 ? 1 : rng.bool() ? 1 : -1;
          sidesToTest.push(outside);
        } else if (slot.side === 'inside-curve') {
          const inside: -1 | 1 =
            cand.curve > 0.05 ? 1 : cand.curve < -0.05 ? -1 : rng.bool() ? 1 : -1;
          sidesToTest.push(inside);
        } else {
          const firstSide: -1 | 1 = rng.bool() ? 1 : -1;
          sidesToTest.push(firstSide, (-firstSide) as -1 | 1);
        }

        for (const testSide of sidesToTest) {
          let pylonConflict = false;
          const checkStart = Math.max(0, cand.segIdx + minDSeg - 2);
          const checkEnd = Math.min(segments.length - 1, cand.segIdx + maxDSeg + 2);

          for (let s = checkStart; s <= checkEnd; s++) {
            const seg = segments[s];
            if (!seg) continue;
            for (let spIdx = 0; spIdx < seg.sprites.length; spIdx++) {
              const sp = seg.sprites[spIdx]!;
              if (sp.kind === 'pylon' && sp.offset * testSide > 0) {
                pylonConflict = true;
                break;
              }
            }
            if (pylonConflict) break;
          }

          if (pylonConflict) continue;

          placeVignette(
            segments,
            cand.segIdx,
            testSide,
            prefab.baseOffset,
            prefab,
            rng,
            segmentsPerBeat,
          );

          lastVignetteChunkIdx = cIdx;
          lastVignetteBar = pChunk.startBar;
          placed = true;
          break;
        }

        if (placed) break;
      }

      if (placed) {
        break;
      }
    }
  }
}
