import { clamp01, smoothstep } from './RoadProjection';
import {
  getPropDepthClearance,
  PROP_REGISTRY,
} from './PropRegistry';

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
  return PROP_REGISTRY[kind].isOverhead;
}

/** Returns conservative lateral half-width in road half-widths for prop de-confliction. */
export function getPropLateralHalfWidth(kind: PropKind): number {
  return PROP_REGISTRY[kind].lateralHalfWidth;
}

/** Returns overlap priority (higher wins). Curve warning diamonds (`sign` variant 2) outrank lamps/ordinary signs. */
export function getPropOverlapPriority(kind: PropKind, variant = 0): number {
  if (kind === 'sign' && variant === 2) return 80;
  return PROP_REGISTRY[kind].overlapPriority;
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

function getScaledHalfWidth(sp: RoadSprite): number {
  return getPropLateralHalfWidth(sp.kind) * Math.max(1.0, Math.min(1.5, sp.scale ?? 1));
}

function getScaledClearance(a: RoadSprite, b: RoadSprite): number {
  const baseClear = (getScaledHalfWidth(a) + getScaledHalfWidth(b)) * 0.95;
  if (a.kind === 'pylon' || b.kind === 'pylon') {
    const other = a.kind === 'pylon' ? b : a;
    return isPylonBlockedKind(other.kind) ? Math.max(1.95, baseClear) : Math.max(1.25, baseClear);
  }
  return baseClear;
}

function isSameSideOverlap(a: RoadSprite, b: RoadSprite): boolean {
  if (isOverheadProp(a.kind) || isOverheadProp(b.kind)) return false;
  if (a.offset * b.offset <= 0) return false;
  return Math.abs(a.offset - b.offset) < getScaledClearance(a, b);
}

function isDepthNeighborConflict(a: RoadSprite, b: RoadSprite, segDist: number): boolean {
  if (segDist <= 0) return isSameSideOverlap(a, b);
  if (isOverheadProp(a.kind) || isOverheadProp(b.kind)) {
    const overhead = isOverheadProp(a.kind) ? a : b;
    const other = isOverheadProp(a.kind) ? b : a;
    if (isOverheadProp(other.kind)) return segDist <= 6;
    return segDist <= Math.min(4, getPropDepthClearance(overhead.kind)) && Math.abs(other.offset) <= 1.85;
  }
  if (a.offset * b.offset <= 0) return false;
  const maxClearSegs = Math.max(getPropDepthClearance(a.kind), getPropDepthClearance(b.kind));
  if (segDist > maxClearSegs) return false;
  if (a.kind === 'lamp' && b.kind === 'lamp') {
    // Allow rhythmic road lamps every cadence, but block vignette/extra lamps near road lamps
    return Math.abs(a.offset - b.offset) < 0.75 || (Math.abs(a.offset) >= 1.5) !== (Math.abs(b.offset) >= 1.5);
  }
  return isSameSideOverlap(a, b);
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
  segDist = 0,
): boolean {
  if (!list) return false;
  for (let i = 0; i < list.length; i++) {
    if (i === skipIdx) continue;
    const other = list[i]!;
    if (segDist === 0 ? isSameSideOverlap(candidate, other) : isDepthNeighborConflict(candidate, other, segDist)) {
      return true;
    }
  }
  return false;
}

function listHasOverhead(list: readonly RoadSprite[] | undefined): boolean {
  if (!list) return false;
  for (let i = 0; i < list.length; i++) {
    if (isOverheadProp(list[i]!.kind)) return true;
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
 * Zero-GC in-place prop overlap resolver for `sprites`, optionally checking immediate
 * adjacent segments (`neighborA`, `neighborB`) and an optional extended neighbor window
 * (`extraNeighbors` at distances 3, 4, ...). Preserves `pylon`, overhead portals,
 * `chevron`, and warning diamonds while nudging or compacting out overlapping lower-priority props.
 */
export function resolveSegmentPropOverlaps(
  sprites: RoadSprite[],
  neighborA?: RoadSprite[],
  neighborB?: RoadSprite[],
  extraNeighbors?: readonly (RoadSprite[] | undefined)[],
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

  // 2. Suppress Band A / inner-B roadside fixtures colliding with overhead portal pillars
  const extraHasOverhead =
    extraNeighbors !== undefined &&
    ((extraNeighbors[0] !== undefined && listHasOverhead(extraNeighbors[0])) ||
      (extraNeighbors[1] !== undefined && listHasOverhead(extraNeighbors[1])));
  const hasNearbyOverhead =
    listHasOverhead(sprites) ||
    listHasOverhead(neighborA) ||
    listHasOverhead(neighborB) ||
    extraHasOverhead;

  if (hasNearbyOverhead) {
    let w = 0;
    for (let i = 0; i < sprites.length; i++) {
      const sp = sprites[i]!;
      if (!isOverheadProp(sp.kind) && Math.abs(sp.offset) <= 1.85) {
        continue;
      }
      sprites[w++] = sp;
    }
    sprites.length = w;
  }

  const totalExtra = extraNeighbors ? extraNeighbors.length : 0;

  // 3. Resolve intra-segment & neighbor-window overlaps in-place
  for (let i = 0; i < sprites.length; i++) {
    const cur = sprites[i]!;
    if (isOverheadProp(cur.kind)) {
      let dupOverhead = false;
      for (let j = 0; j < i; j++) {
        if (isOverheadProp(sprites[j]!.kind)) {
          dupOverhead = true;
          break;
        }
      }
      if (!dupOverhead) {
        for (let pass = 0; pass < 2 + totalExtra; pass++) {
          const segDist = pass + 1;
          if (segDist > 6) break;
          const nb = pass === 0 ? neighborA : pass === 1 ? neighborB : extraNeighbors![pass - 2];
          if (nb && listHasOverhead(nb)) {
            dupOverhead = true;
            break;
          }
        }
      }
      if (dupOverhead) {
        removeSpriteAt(sprites, i);
        i--;
      } else {
        const bandAClearSegs = Math.min(4, getPropDepthClearance(cur.kind));
        for (let pass = 0; pass < 2 + totalExtra; pass++) {
          const segDist = pass + 1;
          if (segDist > bandAClearSegs) break;
          const nb = pass === 0 ? neighborA : pass === 1 ? neighborB : extraNeighbors![pass - 2];
          if (!nb) continue;
          for (let j = 0; j < nb.length; j++) {
            const other = nb[j]!;
            if (!isOverheadProp(other.kind) && Math.abs(other.offset) <= 1.85) {
              removeSpriteAt(nb, j);
              j--;
            }
          }
        }
      }
      continue;
    }

    // Check against ancestor neighbors (distance 1 = neighborA, 2 = neighborB, 3+ = extraNeighbors)
    let removed = false;
    for (let pass = 0; pass < 2 + totalExtra && !removed; pass++) {
      const nb = pass === 0 ? neighborA : pass === 1 ? neighborB : extraNeighbors![pass - 2];
      if (!nb) continue;
      const segDist = pass + 1;
      for (let j = 0; j < nb.length; j++) {
        const other = nb[j]!;
        if (!isDepthNeighborConflict(cur, other, segDist)) continue;
        const pCur = getPropOverlapPriority(cur.kind, cur.variant);
        const pOther = getPropOverlapPriority(other.kind, other.variant);
        if (pCur <= pOther && cur.kind !== 'pylon') {
          if (segDist <= 5) {
            const absCur = Math.abs(cur.offset);
            const maxAbs = maxNudgeAbsOffset(cur.kind, absCur);
            const clear = getScaledClearance(cur, other);
            const nudgedAbs = Math.abs(other.offset) + clear + 0.15;
            if (nudgedAbs <= maxAbs) {
              const origOffset = cur.offset;
              cur.offset = (cur.offset < 0 ? -1 : 1) * nudgedAbs;
              let anyExtra = false;
              for (let e = 0; e < totalExtra; e++) {
                if (hasOverlapAgainstList(cur, extraNeighbors![e], -1, 3 + e)) {
                  anyExtra = true;
                  break;
                }
              }
              if (
                !anyExtra &&
                !hasOverlapAgainstList(cur, sprites, i, 0) &&
                !hasOverlapAgainstList(cur, neighborA, -1, 1) &&
                !hasOverlapAgainstList(cur, neighborB, -1, 2)
              ) {
                continue;
              }
              cur.offset = origOffset;
            }
          }
          removeSpriteAt(sprites, i);
          i--;
          removed = true;
          break;
        } else if (
          pCur > pOther &&
          other.kind !== 'pylon' &&
          !isOverheadProp(other.kind)
        ) {
          // Higher-priority current prop evicts lower-priority nearby ancestor in ring/track buffer
          removeSpriteAt(nb, j);
          j--;
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
        const clear = getScaledClearance(cur, prev);
        const nudgedAbs = Math.abs(cur.offset) + clear + 0.15;
        if (nudgedAbs <= maxAbs) {
          const origOffset = prev.offset;
          prev.offset = (prev.offset < 0 ? -1 : 1) * nudgedAbs;
          let anyExtra = false;
          for (let e = 0; e < totalExtra; e++) {
            if (hasOverlapAgainstList(prev, extraNeighbors![e], -1, 3 + e)) {
              anyExtra = true;
              break;
            }
          }
          if (
            !anyExtra &&
            !hasOverlapAgainstList(prev, sprites, j, 0) &&
            !hasOverlapAgainstList(prev, neighborA, -1, 1) &&
            !hasOverlapAgainstList(prev, neighborB, -1, 2)
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
        const clear = getScaledClearance(cur, prev);
        const nudgedAbs = Math.abs(prev.offset) + clear + 0.15;
        if (nudgedAbs <= maxAbs) {
          const origOffset = cur.offset;
          cur.offset = (cur.offset < 0 ? -1 : 1) * nudgedAbs;
          let anyExtra = false;
          for (let e = 0; e < totalExtra; e++) {
            if (hasOverlapAgainstList(cur, extraNeighbors![e], -1, 3 + e)) {
              anyExtra = true;
              break;
            }
          }
          if (
            !anyExtra &&
            !hasOverlapAgainstList(cur, sprites, i, 0) &&
            !hasOverlapAgainstList(cur, neighborA, -1, 1) &&
            !hasOverlapAgainstList(cur, neighborB, -1, 2)
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
  /** Absolute segment index of the oldest valid segment in the ring (streaming tracks only). */
  tailAbsSeg?: number;
  /** Absolute segment index of the next unmaterialized segment beyond the horizon (streaming tracks only). */
  headAbsSeg?: number;
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
 * Geometry bounds of the OutRun Y-fork at a given `worldZ` (attached dual carriageways).
 *
 * When `forkZoneStartZ` is active (`worldZ >= forkZoneStartZ`), the road undergoes 3 smooth phases:
 * 1. Widening (`t in [0..0.16]`): road widens smoothly from `1.0` to `1.50`.
 * 2. Attached dual carriageways (`t in [0.16..0.84]`): Left `[-1.50, 0]` and Right `[0, +1.50]`
 *    with ZERO central grass gap (`innerGap = 0`), separated only by a painted divider so the car
 *    can switch selection freely at any point.
 * 3. Smooth taper (`t in [0.84..1.0]`): road tapers symmetrically back from `1.50` to `1.0`
 *    without ever introducing off-road terrain between the lanes.
 */
/** End of Fork Phase 1 (pre-split widening zone `t in [0, 0.16]`). */
export const FORK_WIDEN_END_T = 0.16;
/** End of Fork Phase 2 (attached dual carriageways `t in [0.16, 0.84]`; Phase 3 taper is `[0.84, 1.0]`). */
export const FORK_SPLIT_END_T = 0.84;
export const FORK_TAPER_START_T = FORK_SPLIT_END_T;
/** Span of Fork Phase 2 (`0.84 - 0.16 = 0.68`). */
export const FORK_SPLIT_SPAN_T = FORK_SPLIT_END_T - FORK_WIDEN_END_T;
/** Span of Fork Phase 3 taper (`1.0 - 0.84 = 0.16`). */
export const FORK_CONVERGE_SPAN_T = 1 - FORK_SPLIT_END_T;
/** Zero central median gap: Left and Right carriageways are directly attached. */
export const FORK_PEAK_INNER_GAP = 0;
/** Peak outer asphalt half-width in road half-widths during the fork. */
export const FORK_PEAK_OUTER_LIMIT = 1.5;
/** Peak branch center X offset in road half-widths (`1.50 / 2 = 0.75`). */
export const FORK_PEAK_BRANCH_CENTER = 0.75;

export interface ForkCrossSection {
  /** Normalized progress `[0, 1]` through the fork zone (`0` outside the fork). */
  t: number;
  /** Outer asphalt edge in road half-widths (`1.0` -> `1.50` -> `1.0` at finish). */
  outerLimit: number;
  /** Half-width of central gap (`0` always — attached carriageways). */
  innerGap: number;
  /** Center X magnitude of each carriageway in road half-widths (`0.5` -> `0.75` -> `0.5`). */
  branchCenter: number;
  /** Left edge of valid driving asphalt (`-outerLimit`). */
  activeLeftEdge: number;
  /** Right edge of valid driving asphalt (`+outerLimit`). */
  activeRightEdge: number;
  /** Progress through final taper phase `[0, 1]` (`0` before taper, `1` at finish line). */
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

/** Computes outer asphalt half-width in road half-widths across `t in [0, 1]`. */
export function getForkOuterLimit(t: number): number {
  if (t <= 0 || t >= 1) return 1;
  if (t <= FORK_WIDEN_END_T) {
    return 1.0 + 0.5 * smoothstep(t / FORK_WIDEN_END_T);
  }
  if (t <= FORK_SPLIT_END_T) {
    return FORK_PEAK_OUTER_LIMIT;
  }
  const u = (t - FORK_SPLIT_END_T) / FORK_CONVERGE_SPAN_T;
  return FORK_PEAK_OUTER_LIMIT - 0.5 * smoothstep(u);
}

/**
 * Center X offset in road half-widths of the chosen carriageway at fork progress `t`.
 */
export function getChosenForkCenter(t: number, choice: 'left' | 'right' = 'right'): number {
  const sign = choice === 'left' ? -1 : 1;
  const outerLimit = getForkOuterLimit(t);
  if (t > FORK_SPLIT_END_T) {
    const ease = smoothstep((t - FORK_SPLIT_END_T) / FORK_CONVERGE_SPAN_T);
    return sign * FORK_PEAK_BRANCH_CENTER * (1 - ease);
  }
  return sign * (outerLimit * 0.5);
}

/**
 * Asphalt half-width of a single carriageway at fork progress `t`.
 */
export function getChosenForkHalfWidth(t: number): number {
  const outerLimit = getForkOuterLimit(t);
  if (t > FORK_SPLIT_END_T) {
    const ease = smoothstep((t - FORK_SPLIT_END_T) / FORK_CONVERGE_SPAN_T);
    return FORK_PEAK_BRANCH_CENTER + (1.0 - FORK_PEAK_BRANCH_CENTER) * ease;
  }
  return outerLimit * 0.5;
}

/**
 * Computes the attached dual-carriageway fork cross-section geometry at `worldZ`
 * without allocating in hot loops when `out` is provided.
 */
export function getForkCrossSection(
  worldZ: number,
  trackLength: number,
  forkZoneStartZ?: number,
  forkChoice: 'left' | 'right' = 'right',
  out: ForkCrossSection = { ...DEFAULT_FORK_CROSS_SECTION },
): ForkCrossSection {
  void forkChoice;
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
  const outerLimit = getForkOuterLimit(t);
  out.t = t;
  out.outerLimit = outerLimit;
  out.innerGap = 0;
  out.branchCenter = outerLimit * 0.5;
  out.activeLeftEdge = -outerLimit;
  out.activeRightEdge = outerLimit;
  out.recenterProgress = t > FORK_SPLIT_END_T ? (t - FORK_SPLIT_END_T) / FORK_CONVERGE_SPAN_T : 0;
  return out;
}

/**
 * Maps a stationary roadside prop offset (`sp.offset`, authored relative to `±1.0` normal road edge)
 * outward symmetrically along the widened fork edge so props stay outside the asphalt.
 */
export function getEffectivePropOffset(
  baseOffset: number,
  worldZ: number,
  trackLength: number,
  forkZoneStartZ?: number,
  forkChoice: 'left' | 'right' = 'right',
): number {
  void forkChoice;
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
  const outerShift = getForkOuterLimit(t) - 1.0;
  return baseOffset >= 0 ? baseOffset + outerShift : baseOffset - outerShift;
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
 * Maps an AI Kei Truck's cruising `laneOffset` into its assigned attached fork carriageway
 * (`[-outerLimit, 0]` or `[0, +outerLimit]`) and smoothly back into normal 3-lane offsets at `t = 1`.
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
  void forkChoice;
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
  const outerLimit = getForkOuterLimit(t);
  const branchCenter = outerLimit * 0.5;

  const cruisingBase =
    baseLaneOffset !== undefined
      ? baseLaneOffset
      : Math.abs(laneOffset) > 0.2
        ? laneOffset > 0
          ? 0.58
          : -0.58
        : 0;
  const latDelta = laneOffset - cruisingBase;
  const branchLatOffset = Math.max(-0.38, Math.min(0.38, latDelta * 0.5));

  if (t <= FORK_WIDEN_END_T) {
    const pEase = smoothstep(t / FORK_WIDEN_END_T);
    const targetX = branch * branchCenter + branchLatOffset;
    return laneOffset + (targetX - laneOffset) * pEase;
  }

  if (t <= FORK_SPLIT_END_T) {
    return branch * branchCenter + branchLatOffset;
  }

  // Phase 3 taper: both left & right trucks glide smoothly back into standard road lanes (±0.58)
  const u = (t - FORK_SPLIT_END_T) / FORK_CONVERGE_SPAN_T;
  const ease = smoothstep(u);
  const peakX = branch * FORK_PEAK_BRANCH_CENTER + branchLatOffset;
  const targetStandardX = branch * 0.58 + branchLatOffset;
  return peakX + (targetStandardX - peakX) * ease;
}
