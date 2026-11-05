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
  | 'sign';

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
 * When `forkZoneStartZ` is active (`worldZ >= forkZoneStartZ`), the road undergoes 3 phases:
 * 1. Widening (`t in [0..0.18]`): road widens from `1.0` to `1.20` with central warning chevron.
 * 2. Full split (`t in [0.18..0.65]`): splits into Left (`[-outerLimit, -innerGap]`) and Right
 *    (`[+innerGap, +outerLimit]`) asphalt branches with central V-island (`innerGap = 0.52`).
 * 3. Smooth convergence (`t in [0.65..1.0]`): the chosen branch smoothly glides back to center
 *    (`0.0`) and full road width (`1.0`), while the unchosen branch curves away and fades out.
 *    At `t = 1.0` (finish line), the road is 100% centered with zero discontinuity or push.
 */
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
  if (t <= 0.18) {
    const p = t / 0.18;
    const pEase = p * p * (3 - 2 * p);
    return sign * (0.58 + (0.60 - 0.58) * pEase);
  }
  if (t <= 0.65) {
    const split = (t - 0.18) / (0.65 - 0.18);
    const splitEase = split * split * (3 - 2 * split);
    return sign * (0.60 + 0.50 * splitEase);
  }
  // Phase 3: Smooth convergence from ±1.10 down to 0.00 at finish line
  const u = (t - 0.65) / 0.35;
  const ease = u * u * (3 - 2 * u);
  return sign * 1.1 * (1 - ease);
}

/**
 * Asphalt half-width of the chosen branch at fork progress `t`.
 */
export function getChosenForkHalfWidth(t: number): number {
  if (t <= 0.18) {
    const p = t / 0.18;
    const pEase = p * p * (3 - 2 * p);
    return 0.58 + (0.60 - 0.58) * pEase;
  }
  if (t <= 0.65) {
    const split = (t - 0.18) / (0.65 - 0.18);
    const splitEase = split * split * (3 - 2 * split);
    return 0.60 - 0.02 * splitEase;
  }
  // Phase 3: Smoothly expands from 0.58 back to standard road half-width 1.00
  const u = (t - 0.65) / 0.35;
  const ease = u * u * (3 - 2 * u);
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
  const t = Math.max(0, Math.min(1, (worldZ - forkZoneStartZ) / span));
  out.t = t;

  if (t <= 0.18) {
    const outerLimit = 1.0 + (t / 0.18) * 0.2;
    out.outerLimit = outerLimit;
    out.innerGap = 0;
    out.branchCenter = Math.abs(getChosenForkCenter(t, forkChoice));
    out.activeLeftEdge = -outerLimit;
    out.activeRightEdge = outerLimit;
    out.recenterProgress = 0;
    return out;
  }

  if (t <= 0.65) {
    const split = (t - 0.18) / (0.65 - 0.18);
    const splitEase = split * split * (3 - 2 * split);
    const innerGap = splitEase * 0.52;
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
  const u = (t - 0.65) / 0.35;
  const ease = u * u * (3 - 2 * u);
  const chosenCenter = getChosenForkCenter(t, forkChoice);
  const halfW = getChosenForkHalfWidth(t);

  out.innerGap = 0.52 * (1 - ease);
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

  if (t <= 0.65) {
    const split = t > 0.18 ? (t - 0.18) / (0.65 - 0.18) : 0;
    const splitEase = split * split * (3 - 2 * split);
    const outerShift = t <= 0.18 ? (t / 0.18) * 0.2 : 0.2 + splitEase * 0.48;
    return baseOffset >= 0 ? baseOffset + outerShift : baseOffset - outerShift;
  }

  // Phase 3: Smooth convergence
  const u = (t - 0.65) / 0.35;
  const ease = u * u * (3 - 2 * u);
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
  const t = Math.max(0, Math.min(1, (worldZ - forkZoneStartZ) / span));

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
  if (t <= 0.18) {
    const p = t / 0.18;
    const pEase = p * p * (3 - 2 * p);
    const targetSplitX = branch * 0.6 + branchLatOffset;
    return laneOffset + (targetSplitX - laneOffset) * pEase;
  }

  // Phase 2: Diverging Left & Right asphalt branches (t in [0.18..0.65])
  // Trucks drive centered on their chosen carriageway [-outerLimit, -innerGap] or [+innerGap, +outerLimit]
  if (t <= 0.65) {
    const split = (t - 0.18) / (0.65 - 0.18);
    const splitEase = split * split * (3 - 2 * split);
    const outerLimit = 1.2 + splitEase * 0.48;
    const innerGap = splitEase * 0.52;
    const branchCenter = (outerLimit + innerGap) * 0.5; // 0.60 at t=0.18 -> 1.10 at t=0.65
    return branch * branchCenter + branchLatOffset;
  }

  // Phase 3: Smooth convergence (t in [0.65..1.0])
  const u = (t - 0.65) / 0.35;
  const ease = u * u * (3 - 2 * u);

  if (branch === chosenSign) {
    // Truck chose the same branch as the player: smoothly converges back to road center (0.0)
    const cCenter = branch * 1.1 * (1 - ease);
    return cCenter + branchLatOffset * (1 - ease);
  } else {
    // Truck chose the other branch: curves away outward with the unchosen branch
    const unchosenCenter = branch * (1.1 + 0.5 * u);
    return unchosenCenter + branchLatOffset;
  }
}
