import { clamp01, smoothstep } from './RoadProjection';

/**
 * A point on the road centre line. World coordinates are fixed at build time;
 * camera/screen fields are mutated in place every frame (zero allocations while rendering).
 */
export interface ProjectedPoint {
  worldX: number;
  worldY: number;
  worldZ: number;
  cameraX: number;
  cameraY: number;
  cameraZ: number;
  scale: number;
  screenX: number;
  screenY: number;
  screenW: number;
}

export type PropKind =
  | 'palm'
  | 'tree'
  | 'street-tree'
  | 'pine'
  | 'lamp'
  | 'billboard'
  | 'building'
  | 'jihanki'
  | 'phonebooth'
  | 'gantry'
  | 'vms'
  | 'chevron'
  | 'pylon'
  | 'shrub'
  | 'sign'
  | 'overpass'
  | 'suspension-tower'
  | 'kiosk'
  | 'bench'
  | 'bus-stop'
  | 'canopy'
  | 'torii'
  | 'toro';

export type SegmentEnvironment =
  | 'standard'
  | 'bridge'
  | 'viaduct'
  | 'tunnel';

/**
 * Depth bands for roadside props (docs/DESIGN.md §2 Fase 1):
 * - A: Shoulder (1.15–1.45) — rhythmic functional fixtures (lamps, signs, gantries, chevrons), collidable.
 * - B: Verge (1.85–3.8) — organic greenery & billboards (shrubs, trees, billboards), collidable within <3.0.
 * - C: Near field (3.5–8.5) — groves, low buildings & power pylons, organic, non-collidable.
 * - D: Far field (6.0–14.0) — tall city skyline towers & backdrops, dense organic, non-collidable.
 */
export type PropBand = 'A' | 'B' | 'C' | 'D';

export interface PropBandRange {
  readonly min: number;
  readonly max: number;
}

export const PROP_BAND_RANGES: Record<PropBand, PropBandRange> = {
  A: { min: 1.15, max: 1.45 },
  B: { min: 1.85, max: 3.8 },
  C: { min: 3.5, max: 8.5 },
  D: { min: 6.0, max: 14.0 },
} as const;

/** A roadside sprite anchored to a segment. `offset` is in road half-widths (±1 = road edge). */
export interface RoadSprite {
  kind: PropKind;
  offset: number;
  variant: number;
  scale?: number;
  /** Optional chain identifier (run id >= 1) grouping consecutive sprites (e.g. power pylons). */
  chainId?: number;
}

export function isOverheadProp(kind: PropKind): boolean {
  return kind === 'gantry' || kind === 'overpass' || kind === 'suspension-tower';
}

const PROP_LATERAL_HALF_WIDTH: Readonly<Record<PropKind, number>> = {
  lamp: 0.24,
  chevron: 0.34,
  sign: 0.42,
  jihanki: 0.34,
  phonebooth: 0.34,
  bench: 0.34,
  toro: 0.34,
  shrub: 0.38,
  palm: 0.55,
  'street-tree': 0.55,
  pine: 0.55,
  tree: 0.55,
  billboard: 0.68,
  kiosk: 0.65,
  'bus-stop': 0.65,
  torii: 0.65,
  vms: 0.72,
  canopy: 0.95,
  building: 1.05,
  pylon: 1.15,
  gantry: 0,
  overpass: 0,
  'suspension-tower': 0,
};

const PROP_OVERLAP_PRIORITY: Readonly<Record<PropKind, number>> = {
  gantry: 100,
  overpass: 100,
  'suspension-tower': 100,
  pylon: 95,
  chevron: 85,
  kiosk: 70,
  'bus-stop': 70,
  canopy: 70,
  torii: 70,
  toro: 70,
  jihanki: 70,
  phonebooth: 70,
  bench: 70,
  vms: 65,
  lamp: 60,
  sign: 55,
  billboard: 75,
  building: 40,
  palm: 30,
  'street-tree': 30,
  pine: 30,
  tree: 30,
  shrub: 20,
};

/** Returns conservative lateral half-width in road half-widths for prop de-confliction. */
export function getPropLateralHalfWidth(kind: PropKind): number {
  return PROP_LATERAL_HALF_WIDTH[kind] ?? 0.5;
}

/** Returns overlap priority (higher wins). Curve warning diamonds (`sign` variant 2) outrank lamps/ordinary signs. */
export function getPropOverlapPriority(kind: PropKind, variant = 0): number {
  if (kind === 'sign' && variant === 2) return 80;
  return PROP_OVERLAP_PRIORITY[kind] ?? 30;
}

function isPylonBlockedKind(kind: PropKind): boolean {
  return (
    kind === 'building' ||
    kind === 'billboard' ||
    kind === 'palm' ||
    kind === 'street-tree' ||
    kind === 'pine' ||
    kind === 'tree'
  );
}

function isSameSideOverlap(a: RoadSprite, b: RoadSprite): boolean {
  if (isOverheadProp(a.kind) || isOverheadProp(b.kind)) return false;
  if (a.offset * b.offset <= 0) return false;
  const dist = Math.abs(a.offset - b.offset);
  if (a.kind === 'pylon' || b.kind === 'pylon') {
    const other = a.kind === 'pylon' ? b : a;
    return isPylonBlockedKind(other.kind) ? dist < 1.9 : dist < 1.1;
  }
  const minClear = (getPropLateralHalfWidth(a.kind) + getPropLateralHalfWidth(b.kind)) * 0.85;
  return dist < minClear;
}

function maxNudgeAbsOffset(kind: PropKind, absOff: number): number {
  if (kind === 'building' || absOff >= 3.5) return 13.8;
  if (kind === 'palm' || kind === 'street-tree' || kind === 'pine' || kind === 'tree') return 7.5;
  if (kind === 'shrub') return 3.7;
  return absOff; // Shoulder/Band A fixtures & billboards do not nudge sideways into other bands
}

function hasOverlapAgainstList(
  candidate: RoadSprite,
  list: readonly RoadSprite[] | undefined,
  skipIdx = -1,
): boolean {
  if (!list) return false;
  for (let i = 0; i < list.length; i++) {
    if (i === skipIdx) continue;
    const other = list[i]!;
    if (isSameSideOverlap(candidate, other)) return true;
  }
  return false;
}

function removeSpriteAt(sprites: RoadSprite[], idx: number): void {
  const last = sprites.length - 1;
  for (let k = idx; k < last; k++) {
    sprites[k] = sprites[k + 1]!;
  }
  sprites.length = last;
}

/**
 * Zero-GC in-place prop overlap resolver for `sprites`, optionally checking up to two
 * adjacent segments (`neighborA`, `neighborB`). Preserves `pylon`, overhead portals,
 * `chevron`, and warning diamonds while nudging or compacting out overlapping lower-priority props.
 */
export function resolveSegmentPropOverlaps(
  sprites: RoadSprite[],
  neighborA?: readonly RoadSprite[],
  neighborB?: readonly RoadSprite[],
): void {
  if (sprites.length === 0) return;

  // 1. Suppress ordinary signs/VMS on any side that has a curve chevron in this or adjacent segments
  let chevronSides = 0; // bit 0 = left (< 0), bit 1 = right (> 0)
  for (let i = 0; i < sprites.length; i++) {
    const sp = sprites[i]!;
    if (sp.kind === 'chevron') {
      chevronSides |= sp.offset < 0 ? 1 : 2;
    }
  }
  if (neighborA) {
    for (let i = 0; i < neighborA.length; i++) {
      const sp = neighborA[i]!;
      if (sp.kind === 'chevron') chevronSides |= sp.offset < 0 ? 1 : 2;
    }
  }
  if (neighborB) {
    for (let i = 0; i < neighborB.length; i++) {
      const sp = neighborB[i]!;
      if (sp.kind === 'chevron') chevronSides |= sp.offset < 0 ? 1 : 2;
    }
  }

  if (chevronSides !== 0) {
    let w = 0;
    for (let i = 0; i < sprites.length; i++) {
      const sp = sprites[i]!;
      const sideBit = sp.offset < 0 ? 1 : 2;
      const isOrdinarySign = sp.kind === 'sign' && sp.variant !== 2;
      if ((chevronSides & sideBit) !== 0 && (isOrdinarySign || sp.kind === 'vms')) {
        continue;
      }
      sprites[w++] = sp;
    }
    sprites.length = w;
  }

  // 2. Resolve intra-segment & immediate-neighbor overlaps in-place
  for (let i = 0; i < sprites.length; i++) {
    const cur = sprites[i]!;
    if (isOverheadProp(cur.kind)) continue;

    // Check against read-only neighbors first
    let removed = false;
    for (let pass = 0; pass < 2 && !removed; pass++) {
      const nb = pass === 0 ? neighborA : neighborB;
      if (!nb) continue;
      for (let j = 0; j < nb.length; j++) {
        const other = nb[j]!;
        if (!isSameSideOverlap(cur, other)) continue;
        const pCur = getPropOverlapPriority(cur.kind, cur.variant);
        const pOther = getPropOverlapPriority(other.kind, other.variant);
        if (pCur <= pOther && cur.kind !== 'pylon') {
          const absCur = Math.abs(cur.offset);
          const maxAbs = maxNudgeAbsOffset(cur.kind, absCur);
          const clear =
            other.kind === 'pylon'
              ? 1.95
              : (getPropLateralHalfWidth(cur.kind) + getPropLateralHalfWidth(other.kind)) * 0.9;
          const nudgedAbs = Math.abs(other.offset) + clear + 0.15;
          if (nudgedAbs <= maxAbs) {
            const origOffset = cur.offset;
            cur.offset = (cur.offset < 0 ? -1 : 1) * nudgedAbs;
            if (
              hasOverlapAgainstList(cur, sprites, i) ||
              hasOverlapAgainstList(cur, neighborA) ||
              hasOverlapAgainstList(cur, neighborB)
            ) {
              cur.offset = origOffset;
              removeSpriteAt(sprites, i);
              i--;
              removed = true;
              break;
            }
          } else {
            removeSpriteAt(sprites, i);
            i--;
            removed = true;
            break;
          }
        }
      }
    }
    if (removed) continue;

    // Check against earlier kept props on the same segment
    for (let j = 0; j < i; j++) {
      const prev = sprites[j]!;
      if (!isSameSideOverlap(cur, prev)) continue;
      const pCur = getPropOverlapPriority(cur.kind, cur.variant);
      const pPrev = getPropOverlapPriority(prev.kind, prev.variant);

      // Winner is higher priority (on tie, earlier/inner sprite wins)
      if (pCur > pPrev && prev.kind !== 'pylon') {
        const absPrev = Math.abs(prev.offset);
        const maxAbs = maxNudgeAbsOffset(prev.kind, absPrev);
        const clear =
          cur.kind === 'pylon'
            ? 1.95
            : (getPropLateralHalfWidth(cur.kind) + getPropLateralHalfWidth(prev.kind)) * 0.9;
        const nudgedAbs = Math.abs(cur.offset) + clear + 0.15;
        if (nudgedAbs <= maxAbs) {
          const origOffset = prev.offset;
          prev.offset = (prev.offset < 0 ? -1 : 1) * nudgedAbs;
          if (
            !hasOverlapAgainstList(prev, sprites, j) &&
            !hasOverlapAgainstList(prev, neighborA) &&
            !hasOverlapAgainstList(prev, neighborB)
          ) {
            continue;
          }
          prev.offset = origOffset;
        }
        removeSpriteAt(sprites, j);
        i--;
        j--;
      } else if (cur.kind !== 'pylon') {
        const absCur = Math.abs(cur.offset);
        const maxAbs = maxNudgeAbsOffset(cur.kind, absCur);
        const clear =
          prev.kind === 'pylon'
            ? 1.95
            : (getPropLateralHalfWidth(cur.kind) + getPropLateralHalfWidth(prev.kind)) * 0.9;
        const nudgedAbs = Math.abs(prev.offset) + clear + 0.15;
        if (nudgedAbs <= maxAbs) {
          const origOffset = cur.offset;
          cur.offset = (cur.offset < 0 ? -1 : 1) * nudgedAbs;
          if (
            !hasOverlapAgainstList(cur, sprites, i) &&
            !hasOverlapAgainstList(cur, neighborA) &&
            !hasOverlapAgainstList(cur, neighborB)
          ) {
            continue;
          }
          cur.offset = origOffset;
        }
        removeSpriteAt(sprites, i);
        i--;
        break;
      }
    }
  }
}

/**
 * Zero-GC in-place insertion sort for a single segment's sprite list (Band D -> C -> B -> A,
 * overhead portals last). Ideal for small lists (0..10 sprites) inside the horizon assembler.
 */
export function sortSingleSegmentSprites(sprites: RoadSprite[]): void {
  const len = sprites.length;
  if (len <= 1) return;
  for (let i = 1; i < len; i++) {
    const key = sprites[i]!;
    const keyOver = isOverheadProp(key.kind) ? 1 : 0;
    const keyAbs = Math.abs(key.offset);
    let j = i - 1;
    while (j >= 0) {
      const cur = sprites[j]!;
      const curOver = isOverheadProp(cur.kind) ? 1 : 0;
      let moveRight: boolean;
      if (curOver !== keyOver) {
        moveRight = curOver > keyOver;
      } else {
        const diff = keyAbs - Math.abs(cur.offset);
        if (Math.abs(diff) > 1e-6) {
          moveRight = diff > 0;
        } else {
          moveRight = cur.offset > key.offset;
        }
      }
      if (!moveRight) break;
      sprites[j + 1] = cur;
      j--;
    }
    sprites[j + 1] = key;
  }
}

/**
 * Deterministically orders each segment's sprites by descending `|offset|` (Band D -> C -> B -> A)
 * so closer-to-road roadside props render over farther ones, with overhead portals always last.
 */
export function sortSegmentSprites(segments: readonly RoadSegment[]): void {
  for (let i = 0; i < segments.length; i++) {
    const sprites = segments[i]!.sprites;
    if (sprites.length > 1) {
      sortSingleSegmentSprites(sprites);
    }
  }
}

export interface RoadSegment {
  index: number;
  /** Near edge of the segment. */
  p1: ProjectedPoint;
  /** Far edge of the segment. */
  p2: ProjectedPoint;
  /** Horizontal curvature applied per segment (positive = right-hand curve). */
  curve: number;
  /** Alternating colour band (rumble strips, lane markers). */
  stripe: 0 | 1;
  sprites: RoadSprite[];
  /** Per-frame: fog factor, 1 = clear (near), → 0 = fully fogged (far). */
  fog: number;
  env?: SegmentEnvironment;
  /** Beat-synced ceiling fluorescent light bar inside `env === 'tunnel'` spans (S1). */
  tunnelLight?: boolean;
}

export interface Track {
  segments: RoadSegment[];
  segmentLength: number;
  /** Total length in world units (for StreamingTrack, tracks nominal or materialized stage finish Z). */
  length: number;
  /** True when `segments` is a circular zero-GC power-of-two ring buffer driven by `HorizonAssembler`. */
  readonly isStreaming?: boolean;
  /** Bitmask (`segments.length - 1`) for O(1) ring slot lookup when `isStreaming === true`. */
  readonly ringMask?: number;
}

/** Type guard checking whether `track` is backed by a circular streaming ring buffer. */
export function isStreamingTrackBase(
  track: Track,
): track is Track & { readonly isStreaming: true; readonly ringMask: number } {
  return track.isStreaming === true && track.ringMask !== undefined;
}

export function createPoint(worldY: number, worldZ: number): ProjectedPoint {
  return {
    worldX: 0,
    worldY,
    worldZ,
    cameraX: 0,
    cameraY: 0,
    cameraZ: 0,
    scale: 0,
    screenX: 0,
    screenY: 0,
    screenW: 0,
  };
}

export function findSegment(track: Track, z: number): RoadSegment {
  const absIdx = Math.floor(z / track.segmentLength);
  if (track.isStreaming && track.ringMask !== undefined) {
    return track.segments[absIdx & track.ringMask]!;
  }
  const n = track.segments.length;
  const i = absIdx % n;
  return track.segments[i < 0 ? i + n : i]!;
}

/**
 * Geometry bounds of the OutRun Y-fork at a given `worldZ` (AGENTS.md §5 M6).
 *
 * When `forkZoneStartZ` is active (`worldZ >= forkZoneStartZ`), the road undergoes 3 phases:
 * 1. Widening (`t in [0..0.18]`): road widens from `1.0` to `1.20` with central warning chevron.
 * 2. Full split (`t in [0.18..0.65]`): splits into Left (`[-outerLimit, -innerGap]`) and Right
 *    (`[+innerGap, +outerLimit]`) asphalt branches with central V-island (`innerGap = 0.52`).
 * 3. Smooth convergence (`t in [0.65..1.0]`): the chosen branch smoothly glides back to center
 *    (`0.0`) and full road width (`1.0`), while the unchosen branch curves away and fades out.
 *    At `t = 1.0` (finish line), the road is 100% centered with zero discontinuity or push.
 */
/** End of Fork Phase 1 (pre-split widening zone `t in [0, 0.18]`). */
export const FORK_WIDEN_END_T = 0.18;
/** End of Fork Phase 2 (diverging carriageways `t in [0.18, 0.65]`; Phase 3 convergence is `[0.65, 1.0]`). */
export const FORK_SPLIT_END_T = 0.65;
/** Span of Fork Phase 2 (`0.65 - 0.18 = 0.47`). */
export const FORK_SPLIT_SPAN_T = FORK_SPLIT_END_T - FORK_WIDEN_END_T;
/** Span of Fork Phase 3 convergence (`1.0 - 0.65 = 0.35`). */
export const FORK_CONVERGE_SPAN_T = 1 - FORK_SPLIT_END_T;
/** Peak inner median V-island half-width at `t = FORK_SPLIT_END_T`. */
export const FORK_PEAK_INNER_GAP = 0.52;
/** Peak branch center X offset in road half-widths at `t = FORK_SPLIT_END_T` (`(1.68 + 0.52) / 2 = 1.10`). */
export const FORK_PEAK_BRANCH_CENTER = 1.1;

export interface ForkCrossSection {
  /** Normalized progress `[0, 1]` through the fork zone (`0` outside the fork). */
  t: number;
  /** Outer asphalt edge in road half-widths (`1.0` normal road -> `1.68` at peak fork -> `1.0` at end). */
  outerLimit: number;
  /** Half-width of the central median V-island in road half-widths (`0` before split -> `0.52` at peak -> `0` at end). */
  innerGap: number;
  /** Center X of the chosen branch in road half-widths (`0.5` -> `±1.10` -> `0.0` at end). */
  branchCenter: number;
  /** Left edge of valid driving asphalt for the active/chosen branch in road half-widths. */
  activeLeftEdge: number;
  /** Right edge of valid driving asphalt for the active/chosen branch in road half-widths. */
  activeRightEdge: number;
  /** Progress through convergence phase `[0, 1]` (`0` before convergence, `1` at finish line). */
  recenterProgress: number;
}

const DEFAULT_FORK_CROSS_SECTION: ForkCrossSection = {
  t: 0,
  outerLimit: 1,
  innerGap: 0,
  branchCenter: 0.5,
  activeLeftEdge: -1,
  activeRightEdge: 1,
  recenterProgress: 0,
};

/**
 * Center X offset in road half-widths of the chosen branch at fork progress `t`.
 */
export function getChosenForkCenter(t: number, choice: 'left' | 'right' = 'right'): number {
  const sign = choice === 'left' ? -1 : 1;
  if (t <= FORK_WIDEN_END_T) {
    const pEase = smoothstep(t / FORK_WIDEN_END_T);
    return sign * (0.58 + (0.60 - 0.58) * pEase);
  }
  if (t <= FORK_SPLIT_END_T) {
    const splitEase = smoothstep((t - FORK_WIDEN_END_T) / FORK_SPLIT_SPAN_T);
    return sign * (0.60 + 0.50 * splitEase);
  }
  // Phase 3: Smooth convergence from ±1.10 down to 0.00 at finish line
  const ease = smoothstep((t - FORK_SPLIT_END_T) / FORK_CONVERGE_SPAN_T);
  return sign * FORK_PEAK_BRANCH_CENTER * (1 - ease);
}

/**
 * Asphalt half-width of the chosen branch at fork progress `t`.
 */
export function getChosenForkHalfWidth(t: number): number {
  if (t <= FORK_WIDEN_END_T) {
    const pEase = smoothstep(t / FORK_WIDEN_END_T);
    return 0.58 + (0.60 - 0.58) * pEase;
  }
  if (t <= FORK_SPLIT_END_T) {
    const splitEase = smoothstep((t - FORK_WIDEN_END_T) / FORK_SPLIT_SPAN_T);
    return 0.60 - 0.02 * splitEase;
  }
  // Phase 3: Smoothly expands from 0.58 back to standard road half-width 1.00
  const ease = smoothstep((t - FORK_SPLIT_END_T) / FORK_CONVERGE_SPAN_T);
  return 0.58 + (1.0 - 0.58) * ease;
}

/**
 * Computes the Y-fork cross-section geometry at `worldZ` without allocating in hot loops
 * when `out` is provided.
 */
export function getForkCrossSection(
  worldZ: number,
  trackLength: number,
  forkZoneStartZ?: number,
  forkChoice: 'left' | 'right' = 'right',
  out: ForkCrossSection = { ...DEFAULT_FORK_CROSS_SECTION },
): ForkCrossSection {
  if (
    forkZoneStartZ === undefined ||
    trackLength <= forkZoneStartZ ||
    worldZ <= forkZoneStartZ ||
    worldZ > trackLength
  ) {
    out.t = 0;
    out.outerLimit = 1;
    out.innerGap = 0;
    out.branchCenter = 0.5;
    out.activeLeftEdge = -1;
    out.activeRightEdge = 1;
    out.recenterProgress = 0;
    return out;
  }

  const span = Math.max(1, trackLength - forkZoneStartZ);
  const t = clamp01((worldZ - forkZoneStartZ) / span);
  out.t = t;

  if (t <= FORK_WIDEN_END_T) {
    const outerLimit = 1.0 + (t / FORK_WIDEN_END_T) * 0.2;
    out.outerLimit = outerLimit;
    out.innerGap = 0;
    out.branchCenter = Math.abs(getChosenForkCenter(t, forkChoice));
    out.activeLeftEdge = -outerLimit;
    out.activeRightEdge = outerLimit;
    out.recenterProgress = 0;
    return out;
  }

  if (t <= FORK_SPLIT_END_T) {
    const splitEase = smoothstep((t - FORK_WIDEN_END_T) / FORK_SPLIT_SPAN_T);
    const innerGap = splitEase * FORK_PEAK_INNER_GAP;
    const outerLimit = 1.2 + splitEase * 0.48;
    const branchCenter = (outerLimit + innerGap) * 0.5;

    out.innerGap = innerGap;
    out.outerLimit = outerLimit;
    out.branchCenter = branchCenter;
    out.recenterProgress = 0;

    if (forkChoice === 'left') {
      out.activeLeftEdge = -outerLimit;
      out.activeRightEdge = -innerGap;
    } else {
      out.activeLeftEdge = innerGap;
      out.activeRightEdge = outerLimit;
    }
    return out;
  }

  // Phase 3: Smooth convergence
  const u = (t - FORK_SPLIT_END_T) / FORK_CONVERGE_SPAN_T;
  const ease = smoothstep(u);
  const chosenCenter = getChosenForkCenter(t, forkChoice);
  const halfW = getChosenForkHalfWidth(t);

  out.innerGap = FORK_PEAK_INNER_GAP * (1 - ease);
  out.outerLimit = Math.max(1.0, Math.abs(chosenCenter) + halfW);
  out.branchCenter = Math.abs(chosenCenter);
  out.activeLeftEdge = chosenCenter - halfW;
  out.activeRightEdge = chosenCenter + halfW;
  out.recenterProgress = u;
  return out;
}

/**
 * Maps a stationary roadside prop offset (`sp.offset`, authored relative to `±1.0` normal road edge)
 * outward along the widening Y-fork outer edge so palms, lamps, and billboards stay outside
 * the widened asphalt branches instead of sitting in the middle of the road.
 */
export function getEffectivePropOffset(
  baseOffset: number,
  worldZ: number,
  trackLength: number,
  forkZoneStartZ?: number,
  forkChoice: 'left' | 'right' = 'right',
): number {
  if (baseOffset === 0) return 0;
  if (
    forkZoneStartZ === undefined ||
    trackLength <= forkZoneStartZ ||
    worldZ <= forkZoneStartZ ||
    worldZ > trackLength
  ) {
    return baseOffset;
  }
  const span = Math.max(1, trackLength - forkZoneStartZ);
  const t = clamp01((worldZ - forkZoneStartZ) / span);

  if (t <= FORK_SPLIT_END_T) {
    const splitEase = t > FORK_WIDEN_END_T ? smoothstep((t - FORK_WIDEN_END_T) / FORK_SPLIT_SPAN_T) : 0;
    const outerShift = t <= FORK_WIDEN_END_T ? (t / FORK_WIDEN_END_T) * 0.2 : 0.2 + splitEase * 0.48;
    return baseOffset >= 0 ? baseOffset + outerShift : baseOffset - outerShift;
  }

  // Phase 3: Smooth convergence
  const u = (t - FORK_SPLIT_END_T) / FORK_CONVERGE_SPAN_T;
  const ease = smoothstep(u);
  const isChosenSide =
    (forkChoice === 'right' && baseOffset >= 0) || (forkChoice === 'left' && baseOffset < 0);

  if (isChosenSide) {
    // Chosen branch outer edge smoothly converges back to normal road width
    const outerShift = 0.68 * (1 - ease);
    return baseOffset >= 0 ? baseOffset + outerShift : baseOffset - outerShift;
  } else {
    // Unchosen branch outer edge peels away outward
    const outerShift = 0.68 + 0.35 * ease;
    return baseOffset >= 0 ? baseOffset + outerShift : baseOffset - outerShift;
  }
}

/**
 * Deterministically assigns an AI Kei Truck to the Left (-1) or Right (+1) carriageway branch
 * at a stage fork based on its initial lane and truck ID.
 */
export function getTruckForkBranch(
  truckId: number,
  baseLaneOffset = 0,
  forkBranch?: -1 | 1,
): -1 | 1 {
  if (forkBranch !== undefined) return forkBranch;
  if (baseLaneOffset < -0.2) return -1;
  if (baseLaneOffset > 0.2) return 1;
  return truckId % 2 === 0 ? 1 : -1;
}

/**
 * Maps an AI Kei Truck's cruising `laneOffset` into its chosen fork branch (Left or Right carriageway)
 * so trucks smoothly choose and follow one of the two branches instead of driving down the middle
 * through the central V-median grass island.
 */
export function getEffectiveTruckLaneOffset(
  laneOffset: number,
  truckId: number,
  worldZ: number,
  trackLength: number,
  forkZoneStartZ?: number,
  forkChoice: 'left' | 'right' = 'right',
  forkBranch?: -1 | 1,
  baseLaneOffset?: number,
): number {
  if (
    forkZoneStartZ === undefined ||
    trackLength <= forkZoneStartZ ||
    worldZ <= forkZoneStartZ ||
    worldZ > trackLength
  ) {
    return laneOffset;
  }
  const span = Math.max(1, trackLength - forkZoneStartZ);
  const t = clamp01((worldZ - forkZoneStartZ) / span);

  const branch: -1 | 1 = getTruckForkBranch(truckId, baseLaneOffset ?? laneOffset, forkBranch);
  const chosenSign: -1 | 1 = forkChoice === 'left' ? -1 : 1;

  // Relative lateral perturbation (from evasion or knockback) within the chosen branch
  const cruisingBase =
    baseLaneOffset !== undefined
      ? baseLaneOffset
      : Math.abs(laneOffset) > 0.2
        ? laneOffset > 0
          ? 0.58
          : -0.58
        : 0;
  const latDelta = laneOffset - cruisingBase;
  const branchLatOffset = Math.max(-0.35, Math.min(0.35, latDelta * 0.5));

  // Phase 1: Widening & approach zone (t in [0..0.18])
  // Smoothly diverge onto the chosen carriageway before the road physically splits!
  if (t <= FORK_WIDEN_END_T) {
    const pEase = smoothstep(t / FORK_WIDEN_END_T);
    const targetSplitX = branch * 0.6 + branchLatOffset;
    return laneOffset + (targetSplitX - laneOffset) * pEase;
  }

  // Phase 2: Diverging Left & Right asphalt branches (t in [0.18..0.65])
  // Trucks drive centered on their chosen carriageway [-outerLimit, -innerGap] or [+innerGap, +outerLimit]
  if (t <= FORK_SPLIT_END_T) {
    const splitEase = smoothstep((t - FORK_WIDEN_END_T) / FORK_SPLIT_SPAN_T);
    const outerLimit = 1.2 + splitEase * 0.48;
    const innerGap = splitEase * FORK_PEAK_INNER_GAP;
    const branchCenter = (outerLimit + innerGap) * 0.5; // 0.60 at t=0.18 -> 1.10 at t=0.65
    return branch * branchCenter + branchLatOffset;
  }

  // Phase 3: Smooth convergence (t in [0.65..1.0])
  const u = (t - FORK_SPLIT_END_T) / FORK_CONVERGE_SPAN_T;
  const ease = smoothstep(u);

  if (branch === chosenSign) {
    // Truck chose the same branch as the player: smoothly converges back to road center (0.0)
    const cCenter = branch * FORK_PEAK_BRANCH_CENTER * (1 - ease);
    return cCenter + branchLatOffset * (1 - ease);
  } else {
    // Truck chose the other branch: curves away outward with the unchosen branch
    const unchosenCenter = branch * (FORK_PEAK_BRANCH_CENTER + 0.5 * u);
    return unchosenCenter + branchLatOffset;
  }
}
