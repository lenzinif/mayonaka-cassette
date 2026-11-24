import {
  getMuffledSpectralSpans,
  sectionAtBar,
  type BeatMap,
  type BeatSection,
  type SectionRole,
} from '@src/audio/BeatMap';
import { FORK_APPROACH_BARS } from '@src/config/constants';
import type { SeededRandom } from '@src/core/SeededRandom';
import type { StructureCapability } from './RoadChunks';
import type { PropBand, PropKind, SegmentEnvironment } from './RoadSegment';
import type { VignetteId } from './Vignettes';

/**
 * Environmental archetypes & stage macro-region planner (Phase B & C).
 *
 * Pure TypeScript module (AGENTS.md §2: zero React imports; zero `palette.ts` imports).
 * Stage palettes dress the canonical road geometry with coherent multi-act Japanese 80s
 * landscapes (`urbano`, `semiurbano_industriale`, `costiero`) and map muffled sections to
 * `tunnel` structures.
 */

export type EnvironmentArchetypeId = 'urbano' | 'semiurbano_industriale' | 'costiero';

export type StageRegionId =
  | 'night'
  | 'og_future_funk'
  | 'akiba_noon'
  | 'akiba_night'
  | 'vaporfunk'
  | 'weeb_funk'
  | 'vaporwave'
  | 'coastal';

export type PropPlacement =
  | 'both'
  | 'left'
  | 'right'
  | 'alternating'
  | 'outside-curve'
  | 'inside-curve';

export interface ArchetypePropRule {
  readonly kind: PropKind;
  readonly placement: PropPlacement;
  /** Beat interval or `'cadence'` (uses the active chunk's `fixtureCadenceBeats`). */
  readonly everyBeats: number | 'cadence';
  readonly offset?: number;
  readonly band: PropBand;
  readonly jitter?: {
    readonly lateral?: number;
    readonly beats?: number;
  };
  readonly cluster?: {
    readonly min: number;
    readonly max: number;
    readonly spreadBeats: number;
    readonly spreadLateral: number;
  };
  readonly rhythmic?: boolean;
  readonly scaleJitter?: number;
  /** Optional filter limiting this rule to specific musical section roles. */
  readonly roles?: readonly SectionRole[];
  /** Optional minimum bar energy required to emit this prop. */
  readonly minEnergy?: number;
  /** Maximum curve magnitude allowed (keeps roadside fixtures like jihanki on readable stretches). */
  readonly maxAbsCurve?: number;
}

export interface ArchetypeVignetteOption {
  readonly prefab: VignetteId;
  readonly chance: number;
  readonly side?: 'left' | 'right' | 'outside-curve' | 'inside-curve' | 'any';
}

export interface EnvironmentArchetype {
  readonly id: EnvironmentArchetypeId;
  readonly name: string;
  readonly bandARules: readonly ArchetypePropRule[];
  readonly bandBRules: readonly ArchetypePropRule[];
  readonly bandCRules: readonly ArchetypePropRule[];
  readonly bandDRules: readonly ArchetypePropRule[];
  readonly allowedVignettes: readonly ArchetypeVignetteOption[];
  readonly allowPowerLines: boolean;
  readonly transitionLandmark: 'gantry' | 'overpass';
}

export interface StageRegionConfig {
  readonly id: StageRegionId;
  readonly allowedArchetypes: readonly EnvironmentArchetypeId[];
  readonly elevatedStructure: 'bridge' | 'viaduct';
  readonly journeyTemplates: readonly (readonly EnvironmentArchetypeId[])[];
}

export interface MuffledSpan {
  readonly startBar: number;
  readonly endBar: number;
}

export interface ZoneTransition {
  readonly barIndex: number;
  readonly segmentIndex: number;
  readonly from: EnvironmentArchetypeId;
  readonly to: EnvironmentArchetypeId;
  readonly landmark: 'gantry' | 'overpass';
}

export interface ZonePlanChunkInput {
  readonly startBar: number;
  readonly bars: number;
  readonly role: SectionRole;
  readonly startSegment: number;
  readonly segmentCount: number;
  readonly allowedStructures: readonly StructureCapability[];
}

export interface StageZonePlan {
  readonly chunkArchetypes: EnvironmentArchetypeId[];
  readonly chunkEnvs: SegmentEnvironment[];
  readonly barArchetypes: EnvironmentArchetypeId[];
  readonly segmentEnvs: SegmentEnvironment[];
  readonly transitions: ZoneTransition[];
  readonly tunnelSpans: readonly MuffledSpan[];
}

export const ENVIRONMENT_ARCHETYPES: Readonly<Record<EnvironmentArchetypeId, EnvironmentArchetype>> = {
  urbano: {
    id: 'urbano',
    name: 'Urbano (Shuto / Akiba)',
    bandARules: [
      { kind: 'lamp', placement: 'both', everyBeats: 'cadence', band: 'A', offset: 1.22, rhythmic: true },
      { kind: 'gantry', placement: 'both', everyBeats: 16, band: 'A', offset: 0, rhythmic: true },
      { kind: 'vms', placement: 'right', everyBeats: 16, band: 'A', offset: 1.38, rhythmic: true, roles: ['build', 'groove', 'drop'] },
      { kind: 'overpass', placement: 'both', everyBeats: 24, band: 'A', offset: 0, rhythmic: true, roles: ['groove', 'drop', 'breakdown'] },
    ],
    bandBRules: [
      { kind: 'billboard', placement: 'outside-curve', everyBeats: 4, band: 'B', offset: 2.15, jitter: { lateral: 0.2, beats: 0.4 }, rhythmic: false },
      { kind: 'street-tree', placement: 'both', everyBeats: 8, band: 'B', offset: 2.65, jitter: { lateral: 0.45, beats: 0.5 }, rhythmic: false, scaleJitter: 0.2 },
      { kind: 'jihanki', placement: 'alternating', everyBeats: 12, band: 'B', offset: 2.1, jitter: { lateral: 0.15, beats: 0.6 }, rhythmic: false, scaleJitter: 0.08, maxAbsCurve: 2.5 },
    ],
    bandCRules: [
      { kind: 'building', placement: 'both', everyBeats: 4, band: 'C', offset: 4.0, jitter: { lateral: 0.55, beats: 0.6 }, rhythmic: false, scaleJitter: 0.22 },
    ],
    bandDRules: [
      { kind: 'building', placement: 'both', everyBeats: 4, band: 'D', offset: 7.8, jitter: { lateral: 1.4, beats: 0.8 }, rhythmic: false, scaleJitter: 0.28 },
    ],
    allowedVignettes: [
      { prefab: 'jihanki-corner', chance: 0.72, side: 'outside-curve' },
      { prefab: 'bus-stop', chance: 0.58, side: 'any' },
    ],
    allowPowerLines: false,
    transitionLandmark: 'overpass',
  },

  semiurbano_industriale: {
    id: 'semiurbano_industriale',
    name: 'Semiurbano Industriale (Keihin / Odaiba)',
    bandARules: [
      { kind: 'lamp', placement: 'both', everyBeats: 'cadence', band: 'A', offset: 1.24, rhythmic: true },
      { kind: 'gantry', placement: 'both', everyBeats: 16, band: 'A', offset: 0, rhythmic: true },
      { kind: 'sign', placement: 'right', everyBeats: 8, band: 'A', offset: 1.35, rhythmic: true },
      { kind: 'overpass', placement: 'both', everyBeats: 32, band: 'A', offset: 0, rhythmic: true, roles: ['groove', 'drop'] },
    ],
    bandBRules: [
      { kind: 'billboard', placement: 'alternating', everyBeats: 8, band: 'B', offset: 2.25, jitter: { lateral: 0.25, beats: 0.5 }, rhythmic: false },
      { kind: 'shrub', placement: 'both', everyBeats: 4, band: 'B', offset: 2.3, cluster: { min: 2, max: 3, spreadBeats: 1.0, spreadLateral: 0.9 }, rhythmic: false, scaleJitter: 0.28 },
      { kind: 'street-tree', placement: 'both', everyBeats: 4, band: 'B', offset: 2.75, jitter: { lateral: 0.6, beats: 0.4 }, rhythmic: false, scaleJitter: 0.25 },
      { kind: 'jihanki', placement: 'right', everyBeats: 16, band: 'B', offset: 2.15, jitter: { lateral: 0.15, beats: 0.7 }, rhythmic: false, scaleJitter: 0.08, maxAbsCurve: 2.5 },
    ],
    bandCRules: [
      { kind: 'building', placement: 'both', everyBeats: 8, band: 'C', offset: 4.5, jitter: { lateral: 0.7, beats: 0.8 }, rhythmic: false, scaleJitter: 0.22 },
      { kind: 'street-tree', placement: 'both', everyBeats: 4, band: 'C', offset: 5.2, jitter: { lateral: 1.0, beats: 0.7 }, rhythmic: false, scaleJitter: 0.28 },
    ],
    bandDRules: [
      { kind: 'building', placement: 'both', everyBeats: 8, band: 'D', offset: 9.0, jitter: { lateral: 1.8, beats: 1.0 }, rhythmic: false, scaleJitter: 0.25 },
    ],
    allowedVignettes: [
      { prefab: 'jihanki-corner', chance: 0.58, side: 'outside-curve' },
      { prefab: 'bus-stop', chance: 0.55, side: 'any' },
      { prefab: 'parking-area', chance: 0.55, side: 'outside-curve' },
    ],
    allowPowerLines: true,
    transitionLandmark: 'gantry',
  },

  costiero: {
    id: 'costiero',
    name: 'Costiero (Wangan Bay / Sunset Coast)',
    bandARules: [
      { kind: 'lamp', placement: 'alternating', everyBeats: 'cadence', band: 'A', offset: 1.24, rhythmic: true },
      { kind: 'sign', placement: 'right', everyBeats: 12, band: 'A', offset: 1.35, rhythmic: true },
    ],
    bandBRules: [
      { kind: 'palm', placement: 'both', everyBeats: 2, band: 'B', offset: 2.7, jitter: { lateral: 0.7, beats: 0.3 }, cluster: { min: 1, max: 2, spreadBeats: 0.8, spreadLateral: 0.6 }, rhythmic: false, scaleJitter: 0.25 },
      { kind: 'shrub', placement: 'both', everyBeats: 4, band: 'B', offset: 2.25, cluster: { min: 2, max: 4, spreadBeats: 1.1, spreadLateral: 0.95 }, rhythmic: false, scaleJitter: 0.3 },
      { kind: 'billboard', placement: 'outside-curve', everyBeats: 8, band: 'B', offset: 2.35, jitter: { lateral: 0.2, beats: 0.5 }, rhythmic: false },
    ],
    bandCRules: [
      { kind: 'palm', placement: 'both', everyBeats: 4, band: 'C', offset: 5.2, jitter: { lateral: 1.0, beats: 0.7 }, rhythmic: false, scaleJitter: 0.28 },
      { kind: 'shrub', placement: 'both', everyBeats: 4, band: 'C', offset: 4.8, cluster: { min: 2, max: 3, spreadBeats: 1.2, spreadLateral: 1.0 }, rhythmic: false, scaleJitter: 0.3 },
    ],
    bandDRules: [
      { kind: 'building', placement: 'both', everyBeats: 16, band: 'D', offset: 10.5, jitter: { lateral: 2.0, beats: 1.2 }, rhythmic: false, scaleJitter: 0.25 },
    ],
    allowedVignettes: [
      { prefab: 'parking-area', chance: 0.68, side: 'outside-curve' },
      { prefab: 'shrine-gate', chance: 0.65, side: 'inside-curve' },
    ],
    allowPowerLines: true,
    transitionLandmark: 'gantry',
  },
};

export const STAGE_REGION_CONFIG: Readonly<Record<StageRegionId, StageRegionConfig>> = {
  night: {
    id: 'night',
    allowedArchetypes: ['costiero', 'semiurbano_industriale', 'urbano'],
    elevatedStructure: 'bridge',
    journeyTemplates: [
      ['costiero', 'semiurbano_industriale', 'urbano'],
      ['semiurbano_industriale', 'urbano', 'costiero'],
      ['costiero', 'urbano', 'semiurbano_industriale'],
    ],
  },
  og_future_funk: {
    id: 'og_future_funk',
    allowedArchetypes: ['costiero', 'semiurbano_industriale'],
    elevatedStructure: 'bridge',
    journeyTemplates: [
      ['costiero', 'semiurbano_industriale', 'costiero'],
      ['semiurbano_industriale', 'costiero'],
    ],
  },
  akiba_night: {
    id: 'akiba_night',
    allowedArchetypes: ['urbano', 'semiurbano_industriale'],
    elevatedStructure: 'viaduct',
    journeyTemplates: [
      ['semiurbano_industriale', 'urbano'],
      ['urbano', 'semiurbano_industriale', 'urbano'],
    ],
  },
  akiba_noon: {
    id: 'akiba_noon',
    allowedArchetypes: ['urbano', 'semiurbano_industriale'],
    elevatedStructure: 'viaduct',
    journeyTemplates: [
      ['semiurbano_industriale', 'urbano'],
      ['urbano', 'semiurbano_industriale', 'urbano'],
    ],
  },
  vaporfunk: {
    id: 'vaporfunk',
    allowedArchetypes: ['costiero', 'semiurbano_industriale'],
    elevatedStructure: 'bridge',
    journeyTemplates: [
      ['costiero', 'semiurbano_industriale', 'costiero'],
    ],
  },
  weeb_funk: {
    id: 'weeb_funk',
    allowedArchetypes: ['urbano', 'semiurbano_industriale'],
    elevatedStructure: 'viaduct',
    journeyTemplates: [['urbano', 'semiurbano_industriale']],
  },
  vaporwave: {
    id: 'vaporwave',
    allowedArchetypes: ['costiero', 'semiurbano_industriale'],
    elevatedStructure: 'bridge',
    journeyTemplates: [['costiero', 'semiurbano_industriale']],
  },
  coastal: {
    id: 'coastal',
    allowedArchetypes: ['costiero', 'semiurbano_industriale'],
    elevatedStructure: 'bridge',
    journeyTemplates: [['costiero', 'semiurbano_industriale', 'costiero']],
  },
};

/**
 * Detects contiguous muffled (low-pass filtered) musical spans (`>= 4` bars).
 *
 * Uses `beatMap.spectralSpans` (`kind === 'lpf_muffled'`) as primary source when present,
 * falling back to `beatMap.barBrightness` threshold detection for legacy BeatMaps.
 * Pure deterministic function of `BeatMap`.
 */
export function detectMuffledSpans(beatMap: BeatMap, totalBars: number): MuffledSpan[] {
  if (totalBars < 4) {
    return [];
  }

  const maxTunnelEnd = Math.max(0, totalBars - FORK_APPROACH_BARS);
  if (maxTunnelEnd < 4) {
    return [];
  }

  // Primary source: orthogonal `spectralSpans` (`lpf_muffled`) from offline DSP
  if (beatMap.spectralSpans !== undefined) {
    const rawMuffled = getMuffledSpectralSpans(beatMap);
    const spans: MuffledSpan[] = [];
    for (const sp of rawMuffled) {
      let startBar = Math.max(0, sp.startBar);
      let endBar = Math.min(maxTunnelEnd, sp.endBar);
      const shiftedFromZero = startBar === 0;
      if (shiftedFromZero) {
        startBar = endBar >= 6 ? 2 : 1;
      }
      const minSpanBars = shiftedFromZero ? 3 : 4;
      for (const sec of beatMap.sections) {
        if (sec.role !== 'drop') continue;
        if (
          Math.abs(endBar - sec.startBar) <= 1 &&
          sec.startBar <= maxTunnelEnd &&
          sec.startBar - startBar >= minSpanBars
        ) {
          endBar = sec.startBar;
          break;
        }
      }
      if (endBar - startBar >= minSpanBars) {
        spans.push({ startBar, endBar });
      }
    }
    return spans;
  }

  // Legacy fallback: derive from `barBrightness` when `spectralSpans` is absent
  const brightness = beatMap.barBrightness;
  if (!brightness || brightness.length === 0) {
    return [];
  }

  const sampleCount = Math.min(totalBars, brightness.length, maxTunnelEnd);
  if (sampleCount < 4) {
    return [];
  }

  const sorted = brightness.slice(0, Math.min(totalBars, brightness.length)).sort((a, b) => a - b);
  const rawP75 = sorted[Math.floor(0.75 * (sorted.length - 1))] ?? 0;
  if (rawP75 < 0.15) {
    return [];
  }
  const p75 = Math.max(0.25, rawP75);
  const threshold = Math.min(0.42, p75 * 0.45);
  const bridgeThreshold = threshold * 1.25;

  const isMuffledBar = new Uint8Array(sampleCount);
  for (let b = 0; b < sampleCount; b++) {
    const val = brightness[b] ?? 1;
    const sec = sectionAtBar(beatMap, b);
    const energy = beatMap.barEnergy[b] ?? 0.5;
    const isOpenDropPeak = sec?.role === 'drop' && energy >= 0.65 && val >= 0.22;
    if (val < threshold && !isOpenDropPeak) {
      isMuffledBar[b] = 1;
    }
  }

  // Bridge isolated 1-bar micro-spikes inside a muffled passage
  for (let b = 1; b < sampleCount - 1; b++) {
    if (
      isMuffledBar[b] === 0 &&
      isMuffledBar[b - 1] === 1 &&
      isMuffledBar[b + 1] === 1 &&
      (brightness[b] ?? 1) < bridgeThreshold
    ) {
      isMuffledBar[b] = 1;
    }
  }

  const spans: MuffledSpan[] = [];
  let cursor = 0;
  while (cursor < sampleCount) {
    if (isMuffledBar[cursor] === 0) {
      cursor++;
      continue;
    }
    let startBar = cursor;
    while (cursor < sampleCount && isMuffledBar[cursor] === 1) {
      cursor++;
    }
    let endBar = cursor;

    // Avoid starting inside a tunnel on bar 0 so the player enters through the portal visibly.
    // A 4-bar muffled intro ([0, 4]) trims to [1, 4] (3 bars) so it isn't silently discarded.
    const shiftedFromZero = startBar === 0;
    if (shiftedFromZero) {
      startBar = endBar >= 6 ? 2 : 1;
    }
    const minSpanBars = shiftedFromZero ? 3 : 4;

    // Snap tunnel exit to an adjacent drop downbeat within ±1 bar so sky opens on impact
    for (const sec of beatMap.sections) {
      if (sec.role !== 'drop') continue;
      if (
        Math.abs(endBar - sec.startBar) <= 1 &&
        sec.startBar <= maxTunnelEnd &&
        sec.startBar - startBar >= minSpanBars
      ) {
        endBar = sec.startBar;
        break;
      }
    }

    if (endBar - startBar >= minSpanBars) {
      spans.push({ startBar, endBar });
    }
  }

  return spans;
}

/**
 * Plans a coherent 2–4 act environmental journey aligned strictly to musical sections,
 * maps elevated structures (`bridge` or `viaduct`) onto compatible chunks, and overlays
 * `tunnel` environments onto muffled spans.
 */
export function planStageZones(
  placedChunks: readonly ZonePlanChunkInput[],
  sections: readonly BeatSection[],
  stageId: StageRegionId,
  tunnelSpans: readonly MuffledSpan[],
  totalBars: number,
  segmentsPerBar: number,
  rng: SeededRandom,
  phraseBars?: readonly number[],
): StageZonePlan {
  const stageConfig = STAGE_REGION_CONFIG[stageId] ?? STAGE_REGION_CONFIG.night;
  const template = rng.pick(stageConfig.journeyTemplates);
  const maxActs = totalBars < 16 ? 1 : totalBars < 28 ? Math.min(2, template.length) : Math.min(4, template.length);

  const barArchetypes: EnvironmentArchetypeId[] = new Array<EnvironmentArchetypeId>(totalBars).fill(
    template[0] ?? stageConfig.allowedArchetypes[0]!,
  );

  // Build union of musical section starts and timbral phrase boundaries so long steady
  // `groove` tracks still progress naturally across 2-4 environmental acts.
  const boundarySet = new Set<number>([0]);
  for (const sec of sections) {
    if (sec.startBar >= 0 && sec.startBar < totalBars) {
      boundarySet.add(sec.startBar);
    }
  }
  if (phraseBars) {
    for (const pb of phraseBars) {
      if (pb > 0 && pb < totalBars) {
        boundarySet.add(pb);
      }
    }
  }
  const boundaries = Array.from(boundarySet).sort((a, b) => a - b);

  // Assign archetypes along section/phrase boundaries with minimum ~12-bar zone duration
  const minZoneBars = totalBars >= 32 ? 12 : totalBars >= 20 ? 8 : 4;
  let actIdx = 0;
  let currentActBars = 0;

  for (let bIdx = 0; bIdx < boundaries.length; bIdx++) {
    const spanStart = boundaries[bIdx]!;
    const spanEnd = bIdx + 1 < boundaries.length ? boundaries[bIdx + 1]! : totalBars;
    const remainingFromSpan = Math.max(0, totalBars - spanStart);
    if (
      bIdx > 0 &&
      actIdx + 1 < maxActs &&
      currentActBars >= minZoneBars &&
      remainingFromSpan >= minZoneBars
    ) {
      actIdx++;
      currentActBars = 0;
    }

    const arch = template[actIdx] ?? stageConfig.allowedArchetypes[0]!;
    for (let b = spanStart; b < spanEnd; b++) {
      barArchetypes[b] = arch;
    }
    currentActBars += Math.max(0, spanEnd - spanStart);
  }

  const chunkArchetypes: EnvironmentArchetypeId[] = placedChunks.map(
    (c) => barArchetypes[Math.min(totalBars - 1, Math.max(0, c.startBar))] ?? template[0]!,
  );

  const totalSegs = totalBars * segmentsPerBar;
  const segmentEnvs: SegmentEnvironment[] = new Array<SegmentEnvironment>(totalSegs).fill('standard');
  const chunkEnvs: SegmentEnvironment[] = new Array<SegmentEnvironment>(placedChunks.length).fill('standard');

  const overlapsTunnel = (startBar: number, endBar: number): boolean =>
    tunnelSpans.some((t) => startBar < t.endBar + 1 && endBar > t.startBar - 1);

  // Select 1 (or 2 on long tracks >= 80 bars) elevated stretch (`bridge` or `viaduct`)
  const forkCutoffBar = Math.max(0, totalBars - FORK_APPROACH_BARS);
  const elevatedCandidates: number[] = [];
  for (let i = 0; i < placedChunks.length; i++) {
    const c = placedChunks[i]!;
    const cEnd = c.startBar + c.bars;
    if (
      c.startBar >= 4 &&
      cEnd <= forkCutoffBar &&
      c.allowedStructures.includes('elevated') &&
      (c.role === 'build' || c.role === 'groove' || c.role === 'drop') &&
      !overlapsTunnel(c.startBar, cEnd)
    ) {
      elevatedCandidates.push(i);
    }
  }

  if (elevatedCandidates.length > 0) {
    const preferredArch: EnvironmentArchetypeId =
      stageConfig.elevatedStructure === 'viaduct' ? 'urbano' : 'costiero';
    const picked = rng.pickWeighted(elevatedCandidates, (idx) => {
      const c = placedChunks[idx]!;
      const arch = chunkArchetypes[idx]!;
      let w = c.bars >= 8 ? 1.8 : 1.0;
      if (arch === preferredArch || arch === 'semiurbano_industriale') w *= 1.5;
      if (c.role === 'drop' || c.role === 'build') w *= 1.3;
      else if (c.role === 'groove') w *= 1.15;
      return w;
    });

    const selectedIndices = [picked];
    if (totalBars >= 80 && elevatedCandidates.length > 1) {
      const firstBar = placedChunks[picked]!.startBar;
      const farCandidates = elevatedCandidates.filter(
        (idx) => Math.abs(placedChunks[idx]!.startBar - firstBar) >= 24,
      );
      if (farCandidates.length > 0) {
        selectedIndices.push(rng.pick(farCandidates));
      }
    }

    for (const cIdx of selectedIndices) {
      const c = placedChunks[cIdx]!;
      chunkEnvs[cIdx] = stageConfig.elevatedStructure;
      const segEnd = Math.min(totalSegs, c.startSegment + c.segmentCount);
      for (let s = c.startSegment; s < segEnd; s++) {
        segmentEnvs[s] = stageConfig.elevatedStructure;
      }
    }
  }

  // Apply tunnel environments 1:1 to muffled spans (tunnels override other structures)
  for (const span of tunnelSpans) {
    const segStart = Math.max(0, span.startBar * segmentsPerBar);
    const segEnd = Math.min(totalSegs, span.endBar * segmentsPerBar);
    for (let s = segStart; s < segEnd; s++) {
      segmentEnvs[s] = 'tunnel';
    }
  }

  for (let i = 0; i < placedChunks.length; i++) {
    const c = placedChunks[i]!;
    const segEnd = Math.min(totalSegs, c.startSegment + c.segmentCount);
    let hasTunnel = false;
    for (let s = c.startSegment; s < segEnd; s++) {
      if (segmentEnvs[s] === 'tunnel') {
        hasTunnel = true;
        break;
      }
    }
    if (hasTunnel) {
      chunkEnvs[i] = 'tunnel';
    }
  }

  // Record zone transitions at section boundaries where both sides are open standard road
  const transitions: ZoneTransition[] = [];
  for (let b = 1; b < totalBars; b++) {
    const prevArch = barArchetypes[b - 1]!;
    const curArch = barArchetypes[b]!;
    if (prevArch !== curArch) {
      const segIdx = b * segmentsPerBar;
      const prevEnv = segIdx > 0 ? segmentEnvs[segIdx - 1] : 'standard';
      const curEnv = segIdx < totalSegs ? segmentEnvs[segIdx] : 'standard';
      if (prevEnv === 'standard' && curEnv === 'standard') {
        transitions.push({
          barIndex: b,
          segmentIndex: segIdx,
          from: prevArch,
          to: curArch,
          landmark: ENVIRONMENT_ARCHETYPES[curArch].transitionLandmark,
        });
      }
    }
  }

  return {
    chunkArchetypes,
    chunkEnvs,
    barArchetypes,
    segmentEnvs,
    transitions,
    tunnelSpans,
  };
}
