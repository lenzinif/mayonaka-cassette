import type { SeededRandom } from '@src/core/SeededRandom';
import type { PropBand, PropKind, RoadSegment, RoadSprite } from './RoadSegment';

/**
 * Composite roadside vignettes (docs/DESIGN.md §2 Fase 4).
 *
 * A vignette is a coherent roadside vignette prefab (e.g. Japanese vending machine corner,
 * bus stop shelter, small highway parking area, or rural roadside shrine) that groups multiple
 * props naturally into a living scene rather than isolated billboards on the shoulder.
 *
 * Pure TypeScript module (AGENTS.md §2: zero React imports).
 */

export type VignetteId =
  | 'jihanki-corner'
  | 'bus-stop'
  | 'parking-area'
  | 'shrine-gate';

export interface VignetteMember {
  readonly kind: PropKind;
  /** Segment offset relative to the vignette anchor segment. */
  readonly dSeg: number;
  /** Lateral half-width offset relative to baseOffset (outward positive). */
  readonly dOffset: number;
  /** Optional visual variant (0..2). If omitted, picked deterministically via RNG. */
  readonly variant?: number;
  /** Optional visual scale override. If omitted, default 1.0 ± 0.05. */
  readonly scale?: number;
}

export interface VignettePrefab {
  readonly id: VignetteId;
  readonly description: string;
  readonly band: PropBand;
  /** Default base lateral offset from the road edge in half-widths. */
  readonly baseOffset: number;
  readonly members: readonly VignetteMember[];
}

/**
 * Slot configuration declared by a RoadChunk specifying which vignettes may spawn and their probability.
 */
export interface RoadChunkVignetteSlot {
  readonly prefab: VignetteId;
  /** Spawn probability in [0, 1]. */
  readonly chance: number;
  /** Side preference (default: 'any'). */
  readonly side?: 'left' | 'right' | 'outside-curve' | 'inside-curve' | 'any';
}

/**
 * Canonical prefab definitions for composite vignettes.
 */
export const VIGNETTE_PREFABS: Record<VignetteId, VignettePrefab> = {
  /**
   * Roadside convenience corner (rest area without jihanki, awaiting future chunk environment archetypes):
   * Low lit shop kiosk facade set back with an NTT phone booth, wooden bench, streetlamp, and foliage.
   */
  'jihanki-corner': {
    id: 'jihanki-corner',
    description: 'Angolo sosta con chiosco illuminato, cabina telefonica, panchina, lampione e arbusti',
    band: 'B',
    baseOffset: 2.6,
    members: [
      { kind: 'lamp', dSeg: -10, dOffset: -0.7 },
      { kind: 'phonebooth', dSeg: -5, dOffset: 0.1 },
      { kind: 'kiosk', dSeg: 0, dOffset: 0.55 },
      { kind: 'bench', dSeg: 6, dOffset: 0.15 },
      { kind: 'shrub', dSeg: 12, dOffset: 0.4 },
    ],
  },

  /**
   * Suburban bus stop shelter:
   * Glass-backed shelter with bench, illuminated timetable sign, NTT phone booth,
   * streetlamp, and decorative greenery spaced cleanly in depth.
   */
  'bus-stop': {
    id: 'bus-stop',
    description: 'Pensilina fermata autobus con panca, cabina telefonica, lampione e verde dedicato',
    band: 'B',
    baseOffset: 2.3,
    members: [
      { kind: 'lamp', dSeg: -10, dOffset: -0.6 },
      { kind: 'bus-stop', dSeg: -3, dOffset: 0.0 },
      { kind: 'bench', dSeg: 2, dOffset: 0.2 },
      { kind: 'phonebooth', dSeg: 7, dOffset: 0.1 },
      { kind: 'shrub', dSeg: 12, dOffset: 0.45 },
    ],
  },

  /**
   * Highway Parking Area (PA):
   * Illuminated roof canopy over rest bays, kiosk shop, phone booth, bench, shrubs, and twin light poles.
   */
  'parking-area': {
    id: 'parking-area',
    description: 'Piccola area di sosta autostradale (PA) con pensilina illuminata, chiosco, cabina e panchina',
    band: 'C',
    baseOffset: 3.8,
    members: [
      { kind: 'lamp', dSeg: -10, dOffset: -1.1 },
      { kind: 'shrub', dSeg: -7, dOffset: 0.5 },
      { kind: 'bench', dSeg: -4, dOffset: 0.15 },
      { kind: 'canopy', dSeg: 0, dOffset: 0.4 },
      { kind: 'kiosk', dSeg: 5, dOffset: 0.6 },
      { kind: 'phonebooth', dSeg: 9, dOffset: 0.2 },
      { kind: 'shrub', dSeg: 12, dOffset: 0.5 },
      { kind: 'lamp', dSeg: 14, dOffset: -1.1 },
    ],
  },

  /**
   * Roadside Shinto Shrine Gate (Torii):
   * Traditional vermilion torii set back in Band C flanked by twin glowing stone lanterns (toro),
   * evergreen shrubs, and biome trees spaced to frame the approach.
   */
  'shrine-gate': {
    id: 'shrine-gate',
    description: 'Santuario con torii rosso vermiglio arretrato tra lanterne di pietra e vegetazione',
    band: 'C',
    baseOffset: 4.1,
    members: [
      { kind: 'tree', dSeg: -10, dOffset: 0.7 },
      { kind: 'shrub', dSeg: -7, dOffset: 0.35 },
      { kind: 'toro', dSeg: -4, dOffset: 0.0 },
      { kind: 'torii', dSeg: 0, dOffset: 0.55 },
      { kind: 'toro', dSeg: 4, dOffset: 0.0 },
      { kind: 'shrub', dSeg: 8, dOffset: 0.35 },
      { kind: 'tree', dSeg: 12, dOffset: 0.7 },
    ],
  },
};

/**
 * Returns true if a sprite is an organic/generic non-rhythmic Band B/C prop that may collide
 * or visually conflict with the vignette members on the same side.
 *
 * Functional rhythmic roadside fixtures (lamps, chevrons, signs, gantries, pylons, bridges)
 * are NEVER removed.
 */
export function isConflictingVignetteProp(sp: RoadSprite, sideSign: -1 | 1): boolean {
  // Only check props on the same side
  if (sp.offset * sideSign <= 0) return false;

  // Never remove functional rhythmic infrastructure
  if (
    sp.kind === 'lamp' ||
    sp.kind === 'chevron' ||
    sp.kind === 'sign' ||
    sp.kind === 'gantry' ||
    sp.kind === 'vms' ||
    sp.kind === 'pylon' ||
    sp.kind === 'overpass' ||
    sp.kind === 'suspension-tower'
  ) {
    return false;
  }

  // Non-rhythmic background greenery or buildings in bands B/C (|offset| >= 1.5)
  return Math.abs(sp.offset) >= 1.5;
}

/**
 * Places a composite vignette prefab at `anchorSeg` on `side`.
 *
 * - Mirrors `dOffset` laterally: outward is always positive relative to road edge.
 * - Clears conflicting non-rhythmic Band B/C props on that side within the vignette window.
 * - 100% deterministic (uses `rng` for missing variants/scales).
 */
export function placeVignette(
  segments: RoadSegment[],
  anchorSeg: number,
  side: -1 | 1 | 'left' | 'right',
  baseOffset: number,
  prefab: VignettePrefab,
  rng: SeededRandom,
  segmentsPerBeat?: number,
): void {
  const sideSign: -1 | 1 = side === 'left' || side === -1 ? -1 : 1;

  // 1. Calculate vignette segment span
  let minDSeg = 0;
  let maxDSeg = 0;
  for (let i = 0; i < prefab.members.length; i++) {
    const d = prefab.members[i]!.dSeg;
    if (d < minDSeg) minDSeg = d;
    if (d > maxDSeg) maxDSeg = d;
  }

  const startWin = Math.max(0, anchorSeg + minDSeg - 1);
  const endWin = Math.min(segments.length - 1, anchorSeg + maxDSeg + 1);

  // 2. Remove conflicting non-rhythmic B/C sprites on that side within the segment window
  for (let s = startWin; s <= endWin; s++) {
    const seg = segments[s];
    if (!seg || seg.sprites.length === 0) continue;
    seg.sprites = seg.sprites.filter((sp) => !isConflictingVignetteProp(sp, sideSign));
  }

  // 3. Write deterministic member sprites
  for (let i = 0; i < prefab.members.length; i++) {
    const m = prefab.members[i]!;
    // If dSeg is fractional and segmentsPerBeat is given, scale accordingly; otherwise use dSeg directly
    const segOffset =
      segmentsPerBeat !== undefined && Math.abs(m.dSeg % 1) > 0.001
        ? Math.round(m.dSeg * segmentsPerBeat)
        : Math.round(m.dSeg);

    const targetSegIdx = anchorSeg + segOffset;
    if (targetSegIdx < 0 || targetSegIdx >= segments.length) continue;

    const seg = segments[targetSegIdx]!;
    const latOffset = sideSign * (baseOffset + m.dOffset);
    const variant = m.variant !== undefined ? m.variant : rng.rangeInt(0, 2);
    const scale =
      m.scale !== undefined
        ? m.scale
        : Math.round((1.0 + rng.range(-0.06, 0.06)) * 100) / 100;

    seg.sprites.push({
      kind: m.kind,
      offset: latOffset,
      variant,
      scale,
    });
  }
}
