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

export type PropKind = 'palm' | 'lamp' | 'billboard';

/** A roadside sprite anchored to a segment. `offset` is in road half-widths (±1 = road edge). */
export interface RoadSprite {
  kind: PropKind;
  offset: number;
  variant: number;
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
}

export interface Track {
  segments: RoadSegment[];
  segmentLength: number;
  /** Total length in world units. */
  length: number;
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
  const n = track.segments.length;
  const i = Math.floor(z / track.segmentLength) % n;
  return track.segments[i < 0 ? i + n : i]!;
}

/**
 * Geometry bounds of the OutRun Y-fork at a given `worldZ` (AGENTS.md §5 M6).
 *
 * When `forkZoneStartZ` is active (`worldZ >= forkZoneStartZ`), the road widens linearly
 * from `outerLimit = 1.0` to `1.68` road half-widths, and after `t > 0.2` splits into
 * Left (`[-outerLimit, -innerGap]`) and Right (`[+innerGap, +outerLimit]`) asphalt branches
 * separated by a central V-chevron median island (`[-innerGap, +innerGap]`).
 */
export interface ForkCrossSection {
  /** Normalized progress `[0, 1]` through the fork zone (`0` outside the fork). */
  t: number;
  /** Outer asphalt edge in road half-widths (`1.0` normal road -> `1.68` at end of fork). */
  outerLimit: number;
  /** Half-width of the central median V-island in road half-widths (`0` before split -> `0.52` at end). */
  innerGap: number;
  /** Center X of the right branch (and `-branchCenter` for the left branch) in road half-widths. */
  branchCenter: number;
}

const DEFAULT_FORK_CROSS_SECTION: ForkCrossSection = {
  t: 0,
  outerLimit: 1,
  innerGap: 0,
  branchCenter: 0.5,
};

/**
 * Computes the Y-fork cross-section geometry at `worldZ` without allocating in hot loops
 * when `out` is provided.
 */
export function getForkCrossSection(
  worldZ: number,
  trackLength: number,
  forkZoneStartZ?: number,
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
    return out;
  }

  const span = Math.max(1, trackLength - forkZoneStartZ);
  const t = Math.max(0, Math.min(1, (worldZ - forkZoneStartZ) / span));
  const outerLimit = 1 + t * 0.68;
  const split = t > 0.2 ? (t - 0.2) / 0.8 : 0;
  const innerGap = split * 0.52;

  out.t = t;
  out.outerLimit = outerLimit;
  out.innerGap = innerGap;
  out.branchCenter = (outerLimit + innerGap) * 0.5;
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
): number {
  if (
    forkZoneStartZ === undefined ||
    trackLength <= forkZoneStartZ ||
    worldZ <= forkZoneStartZ ||
    worldZ > trackLength
  ) {
    return baseOffset;
  }
  const span = Math.max(1, trackLength - forkZoneStartZ);
  const t = Math.max(0, Math.min(1, (worldZ - forkZoneStartZ) / span));
  const outerShift = t * 0.68;
  return baseOffset >= 0 ? baseOffset + outerShift : baseOffset - outerShift;
}

/**
 * Maps an AI Kei Truck's cruising `laneOffset` out of the central V-median island in the Y-fork
 * so trucks smoothly diverge onto the left or right branch instead of driving through the grass island.
 */
export function getEffectiveTruckLaneOffset(
  laneOffset: number,
  truckId: number,
  worldZ: number,
  trackLength: number,
  forkZoneStartZ?: number,
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
  const t = Math.max(0, Math.min(1, (worldZ - forkZoneStartZ) / span));
  const outerLimit = 1 + t * 0.68;
  const split = t > 0.2 ? (t - 0.2) / 0.8 : 0;
  const innerGap = split * 0.52;
  const branchCenter = (outerLimit + innerGap) * 0.5; // 0.5 -> 1.10

  // Determine which branch the truck takes (left if laneOffset < 0, right if > 0, deterministic by id if 0)
  const sign: -1 | 1 =
    Math.abs(laneOffset) > 0.05 ? (laneOffset > 0 ? 1 : -1) : truckId % 2 === 0 ? 1 : -1;
  const targetBranchX = sign * branchCenter;
  return laneOffset + (targetBranchX - laneOffset) * t;
}
