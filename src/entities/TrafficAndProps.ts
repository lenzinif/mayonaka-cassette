import { tuning } from '@src/config/tuning';
import { SeededRandom } from '@src/core/SeededRandom';
import type { PlayerCar } from '@src/entities/PlayerCar';
import {
  getEffectivePropOffset,
  getEffectiveTruckLaneOffset,
  getForkCrossSection,
  type ForkCrossSection,
  type PropKind,
  type Track,
} from '@src/road/RoadSegment';
import { isSongTrack } from '@src/road/SongRoadGenerator';

export interface KeiTruck {
  id: number;
  /** World Z position along the track `[0, track.length)`. */
  z: number;
  /** Default cruising lane offset (`-0.58`, `0`, `+0.58`). */
  baseLaneOffset: number;
  /** Current lateral offset in road half-widths (can exceed `±1` when knocked off-road). */
  laneOffset: number;
  /** Lateral velocity in road half-widths/s (non-zero when knocked sideways). */
  lateralVel: number;
  /** Visual roll/yaw angle when shunted or careening off-road. */
  tiltAngle: number;
  /** Recovery timer (seconds) after being knocked off-road. */
  knockedTimer: number;
  /** Forward speed as a fraction of `tuning.maxSpeed` (`0.36..0.54`). */
  speedRatio: number;
  /** Visual colour/cargo variant (`0..2`). */
  variant: number;
  /** Current segment index (`Math.floor(z / segmentLength) % segments.length`). */
  segmentIndex: number;
  /** Pointer to the next truck on the same segment index (`-1` if none) for zero-GC bucket lookup. */
  nextInSegment: number;
  /** Deterministic fork carriageway assignment (-1 left carriageway, +1 right carriageway). */
  forkBranch?: -1 | 1;
}

export type CollisionOutcome = 'truckKnockedOff' | 'playerShuntedOff' | 'propBounce';

export type CollisionEvent =
  | {
      type: 'collision';
      obstacle: 'prop';
      propKind: PropKind;
      outcome: 'propBounce';
      /** Signed direction (-1 left, +1 right) of the impact for jerk/camera shake feedback. */
      side: -1 | 1;
    }
  | {
      type: 'collision';
      obstacle: 'traffic';
      truckId: number;
      outcome: 'truckKnockedOff' | 'playerShuntedOff';
      side: -1 | 1;
    };

const LANE_OFFSETS = [-0.58, 0, 0.58] as const;

function propHitHalfWidth(kind: PropKind): number {
  switch (kind) {
    case 'billboard':
      return 0.35;
    case 'palm':
      return 0.16;
    case 'lamp':
      return 0.14;
    case 'building':
      return 0.8;
    case 'jihanki':
      return 0.2;
    case 'phonebooth':
      return 0.18;
    case 'gantry':
    case 'vms':
      // Overhead gantry / signs span across the roadway; player drives right under
      return 0;
    case 'chevron':
      return 0.22;
    case 'pylon':
      return 0.4;
    case 'shrub':
      return 0.16;
    case 'sign':
      return 0.18;
  }
}

/**
 * Manages AI Kei Truck traffic and dynamic flow-preserving collisions with roadside props & traffic
 * (AGENTS.md §1 Pillar 3, §3, §4.3, §4.6).
 *
 * Pure TypeScript module (zero React imports, zero GC allocations in `update` or `render`).
 */
export class TrafficManager {
  readonly trucks: KeiTruck[] = [];
  /**
   * Per-segment head index into `this.trucks` (`-1` when no truck is on that segment).
   * Rebuilt in-place every `update()` so `RoadRenderer` can draw trucks in Pass 2 with O(1) lookup and zero allocations.
   */
  private segmentHeads: Int32Array = new Int32Array(0);
  private collisionCooldown = 0;
  private readonly forkBoundsScratch: ForkCrossSection = {
    t: 0,
    outerLimit: 1,
    innerGap: 0,
    branchCenter: 0.5,
    activeLeftEdge: -1,
    activeRightEdge: 1,
    recenterProgress: 0,
  };

  constructor(track?: Track, seed = 'default-traffic') {
    if (track) {
      this.spawnForTrack(track, seed);
    }
  }

  /**
   * Deterministically populates AI Kei Trucks along `track` using `SeededRandom`.
   */
  spawnForTrack(track: Track, seed = 'default-traffic'): void {
    this.trucks.length = 0;
    this.collisionCooldown = 0;
    const segCount = track.segments.length;
    if (this.segmentHeads.length < segCount) {
      this.segmentHeads = new Int32Array(segCount);
    }
    this.segmentHeads.fill(-1);

    const density = Math.max(0, tuning.trafficDensity);
    if (density <= 0 || segCount < 40) return;

    const rng = new SeededRandom(`${seed}:kei-traffic`);
    const minSafeSegments = Math.min(Math.floor(segCount * 0.35), 64);
    const songClearSegments = isSongTrack(track)
      ? Math.max(minSafeSegments, Math.round(track.segmentsPerBar * 3.5))
      : minSafeSegments;
    const safeStartZ = Math.min(track.length * 0.3, songClearSegments * track.segmentLength);
    let nextId = 1;

    if (isSongTrack(track)) {
      for (const chunk of track.chunks) {
        const roleBase =
          chunk.role === 'drop'
            ? 2.2
            : chunk.role === 'build' || chunk.role === 'breakdown'
              ? 1.3
              : 0.7;
        const expected = roleBase * (0.65 + chunk.avgEnergy * 0.7) * density * (chunk.bars / 8);
        const count = Math.floor(expected + (rng.next() < expected % 1 ? 1 : 0));

        for (let i = 0; i < count; i++) {
          const frac = (i + rng.range(0.15, 0.85)) / Math.max(1, count);
          const segIdx =
            (chunk.startSegment + Math.floor(frac * chunk.segmentCount)) % segCount;
          const z = segIdx * track.segmentLength;
          if (z < safeStartZ) continue;

          const laneIdx = rng.rangeInt(0, LANE_OFFSETS.length - 1);
          const laneOffset = LANE_OFFSETS[laneIdx]!;
          const speedRatio = rng.range(0.36, 0.52);
          const variant = rng.rangeInt(0, 2);
          const truckId = nextId++;
          const forkBranch: -1 | 1 =
            laneOffset < -0.2 ? -1 : laneOffset > 0.2 ? 1 : truckId % 2 === 0 ? 1 : -1;

          this.trucks.push({
            id: truckId,
            z,
            baseLaneOffset: laneOffset,
            laneOffset,
            lateralVel: 0,
            tiltAngle: 0,
            knockedTimer: 0,
            speedRatio,
            variant,
            segmentIndex: segIdx,
            nextInSegment: -1,
            forkBranch,
          });
        }
      }
    } else {
      const startSeg = Math.max(30, Math.floor(safeStartZ / track.segmentLength));
      const stepSegs = Math.max(20, Math.round(45 / density));
      for (let segIdx = startSeg; segIdx < segCount - 10; segIdx += stepSegs) {
        const laneIdx = rng.rangeInt(0, LANE_OFFSETS.length - 1);
        const laneOffset = LANE_OFFSETS[laneIdx]!;
        const truckId = nextId++;
        const forkBranch: -1 | 1 =
          laneOffset < -0.2 ? -1 : laneOffset > 0.2 ? 1 : truckId % 2 === 0 ? 1 : -1;
        this.trucks.push({
          id: truckId,
          z: segIdx * track.segmentLength,
          baseLaneOffset: laneOffset,
          laneOffset,
          lateralVel: 0,
          tiltAngle: 0,
          knockedTimer: 0,
          speedRatio: rng.range(0.38, 0.5),
          variant: rng.rangeInt(0, 2),
          segmentIndex: segIdx,
          nextInSegment: -1,
          forkBranch,
        });
      }
    }

    this.rebuildSpatialIndex(track);
  }

  /**
   * Returns the index into `this.trucks` of the first truck on `segmentIndex`, or `-1` if none.
   */
  getFirstTruckOnSegment(segmentIndex: number): number {
    if (segmentIndex < 0 || segmentIndex >= this.segmentHeads.length) return -1;
    return this.segmentHeads[segmentIndex]!;
  }

  /**
   * Translates Kei Trucks during an A2 horizon phase stitch so trucks in the player's
   * visible window stay at the exact same distance (0 pop-in), while trucks residing
   * in the destination window are displaced beyond the horizon.
   */
  shiftVisibleWindowTrucks(
    track: Track,
    fromZ: number,
    deltaZ: number,
    windowWorldSpan: number,
  ): void {
    const trackLen = track.length;
    if (trackLen <= 0 || this.trucks.length === 0) return;

    const srcStart = fromZ;
    const srcEnd = fromZ + windowWorldSpan;
    const destStart = fromZ + deltaZ;
    const destEnd = fromZ + deltaZ + windowWorldSpan;

    for (let i = 0; i < this.trucks.length; i++) {
      const t = this.trucks[i]!;
      const isVisibleInSrc = t.z >= srcStart && t.z < srcEnd;
      if (isVisibleInSrc) {
        // Truck was visible on screen: preserve its relative distance to the player
        t.z = (t.z + deltaZ) % trackLen;
      } else if (t.z >= destStart && t.z < destEnd) {
        // Truck was not visible, but sits in the destination window: push it past the horizon
        t.z = (destEnd + (t.z - destStart) + 400) % trackLen;
      }
    }

    this.rebuildSpatialIndex(track);
  }

  /**
   * Advances AI Kei Trucks (including lateral knockback physics when rammed) and resolves
   * dynamic collisions with the player car:
   * - Sideswiping a Kei Truck while drifting or steering aggressively knocks the Kei Truck off-road!
   * - Rear-ending a Kei Truck head-on shunts the player car hard toward the off-road shoulder!
   */
  update(
    dt: number,
    track: Track,
    car: PlayerCar,
    prevPlayerWorldZ: number,
    currPlayerWorldZ: number,
    onCollision?: (event: CollisionEvent) => void,
    forkZoneStartZ?: number,
    hasStartedDriving = true,
    forkChoice: 'left' | 'right' = 'right',
  ): void {
    const trackLen = track.length;
    const segLen = track.segmentLength;
    const segCount = track.segments.length;
    if (trackLen <= 0 || segCount === 0) return;

    // When the player has not yet started driving (e.g. initial start, selecting music/skins,
    // or waiting at the starting grid), keep all AI traffic stationary and skip player collisions.
    if (!hasStartedDriving) {
      this.rebuildSpatialIndex(track);
      return;
    }

    if (this.collisionCooldown > 0) {
      this.collisionCooldown = Math.max(0, this.collisionCooldown - dt);
    }

    // 1. Advance all AI Kei Trucks (forward Z + lateral knockback recovery) and rebuild spatial index
    if (this.segmentHeads.length < segCount) {
      this.segmentHeads = new Int32Array(segCount);
    }
    this.segmentHeads.fill(-1);

    const maxSpeed = tuning.maxSpeed;
    const wrappedCurrZ = ((currPlayerWorldZ % trackLen) + trackLen) % trackLen;
    const wrappedPrevZ = ((prevPlayerWorldZ % trackLen) + trackLen) % trackLen;

    for (let i = 0; i < this.trucks.length; i++) {
      const t = this.trucks[i]!;
      const speedPenalty = t.knockedTimer > 0 && Math.abs(t.laneOffset) > 1 ? 0.65 : 1.0;
      t.z = (t.z + t.speedRatio * speedPenalty * maxSpeed * dt) % trackLen;
      if (t.z < 0) t.z += trackLen;

      // Lateral knockback & recovery dynamics
      if (Math.abs(t.lateralVel) > 0.001) {
        t.laneOffset += t.lateralVel * dt;
        t.laneOffset = Math.max(-2.1, Math.min(2.1, t.laneOffset));
        t.lateralVel *= Math.exp(-3.0 * dt);
        if (Math.abs(t.lateralVel) < 0.02) t.lateralVel = 0;
      }

      if (t.knockedTimer > 0) {
        t.knockedTimer = Math.max(0, t.knockedTimer - dt);
        t.tiltAngle *= Math.exp(-3.2 * dt);
      } else {
        // AI Truck evasive steering: if the player is ahead in the same lane and slower/stopped, steer away smoothly
        let deltaZToPlayer = wrappedCurrZ - t.z;
        if (deltaZToPlayer > trackLen * 0.5) deltaZToPlayer -= trackLen;
        if (deltaZToPlayer < -trackLen * 0.5) deltaZToPlayer += trackLen;

        const truckEffectiveX = getEffectiveTruckLaneOffset(
          t.laneOffset,
          t.id,
          t.z,
          trackLen,
          forkZoneStartZ,
          forkChoice,
          t.forkBranch,
          t.baseLaneOffset,
        );
        const playerAheadClose = deltaZToPlayer > 0 && deltaZToPlayer < 750;
        const inSameLane = Math.abs(truckEffectiveX - car.x) < 0.42;

        const isInFork =
          forkZoneStartZ !== undefined && t.z >= forkZoneStartZ && trackLen > forkZoneStartZ;

        if (playerAheadClose && inSameLane) {
          if (isInFork) {
            // In a fork, stay on the chosen carriageway but nudge laterally away from player
            const evadeDir: -1 | 1 = car.x >= truckEffectiveX ? -1 : 1;
            const evadeStep = evadeDir * Math.min(0.5, dt * 1.5);
            t.laneOffset = Math.max(
              t.baseLaneOffset - 0.25,
              Math.min(t.baseLaneOffset + 0.25, t.laneOffset + evadeStep),
            );
            t.tiltAngle = -evadeStep * 3;
          } else {
            // Player is ahead in this truck's lane: steer to an open lane
            const evadeDir: -1 | 1 = car.x >= 0 ? -1 : 1;
            t.baseLaneOffset = evadeDir * 0.58;
            const evadeStep = evadeDir * Math.min(1.0, dt * 2.5);
            t.laneOffset = Math.max(-0.85, Math.min(0.85, t.laneOffset + evadeStep));
            t.tiltAngle = -evadeStep * 3;
          }
        } else if (Math.abs(t.laneOffset - t.baseLaneOffset) > 0.01) {
          // Smoothly steer back toward cruising lane once recovered
          const returnStep = (t.baseLaneOffset - t.laneOffset) * Math.min(1, dt * 1.8);
          t.laneOffset += returnStep;
          t.tiltAngle = -returnStep * 4;
        } else {
          t.tiltAngle = 0;
        }
      }

      const segIdx = Math.floor(t.z / segLen) % segCount;
      t.segmentIndex = segIdx;
      t.nextInSegment = this.segmentHeads[segIdx]!;
      this.segmentHeads[segIdx] = i;
    }

    if (this.collisionCooldown > 0) return;

    // 2. Check Kei Truck collisions using swept 2D (Z, X) bounding boxes at the car's visual depth.
    //    - Combined longitudinal half-extent: COMBINED_HALF_Z = 185 world units (~0.92 segments).
    //    - Combined lateral half-extent: COMBINED_HALF_X = 0.34 road half-widths.
    const COMBINED_HALF_Z = 185;
    const COMBINED_HALF_X = 0.34;
    const playerSegIdx = Math.floor(wrappedCurrZ / segLen);

    for (let offset = -1; offset <= 1; offset++) {
      const checkSeg = (playerSegIdx + offset + segCount) % segCount;
      let tIdx = this.segmentHeads[checkSeg]!;
      while (tIdx !== -1) {
        const truck = this.trucks[tIdx]!;
        if (truck.knockedTimer > 2.4) {
          tIdx = truck.nextInSegment;
          continue;
        }

        // Shortest signed longitudinal distance on the looping track (playerZ - truckZ)
        let currDeltaZ = wrappedCurrZ - truck.z;
        if (currDeltaZ > trackLen * 0.5) currDeltaZ -= trackLen;
        if (currDeltaZ < -trackLen * 0.5) currDeltaZ += trackLen;

        let prevDeltaZ = wrappedPrevZ - truck.z;
        if (prevDeltaZ > trackLen * 0.5) prevDeltaZ -= trackLen;
        if (prevDeltaZ < -trackLen * 0.5) prevDeltaZ += trackLen;

        const truckEffectiveX = getEffectiveTruckLaneOffset(
          truck.laneOffset,
          truck.id,
          truck.z,
          trackLen,
          forkZoneStartZ,
          forkChoice,
          truck.forkBranch,
          truck.baseLaneOffset,
        );
        const signedLatDiff = car.x - truckEffectiveX;
        const prevSignedLatDiff = car.prevX - truckEffectiveX;
        const lateralDist = Math.abs(signedLatDiff);
        const prevLateralDist = Math.abs(prevSignedLatDiff);

        // Check if longitudinal (Z) and lateral (X) bounding boxes overlap this step
        const zOverlapsNow =
          Math.abs(currDeltaZ) < COMBINED_HALF_Z ||
          (prevDeltaZ < 0 && currDeltaZ >= 0);
        if (zOverlapsNow && lateralDist < COMBINED_HALF_X) {
          // Determine if the truck is "accanto" (side-by-side / sideswipe) vs "davanti" (rear-end):
          // 1. Was already overlapping in Z on the previous step and moved laterally into the truck, OR
          // 2. Contact is on the outer flank (|signedLatDiff| >= 0.16) while drifting or steering into the truck.
          const wasAlongsideInZ = Math.abs(prevDeltaZ) < COMBINED_HALF_Z * 0.9;
          const enteredFromSide =
            wasAlongsideInZ &&
            prevLateralDist >= COMBINED_HALF_X * 0.85 &&
            prevLateralDist > lateralDist + 0.001;
          const steeringIntoTruck =
            (car.x - car.prevX) * -signedLatDiff > 0 ||
            (car.driftDir !== 0 && car.driftDir * -signedLatDiff >= 0);
          const isFlankSideswipe =
            lateralDist >= 0.16 && (car.isDrifting || (Math.abs(car.steer) >= 0.25 && steeringIntoTruck));

          const isAlongsideSideswipe = enteredFromSide || isFlankSideswipe;

          if (isAlongsideSideswipe) {
            // Dynamic Outcome A ("Accanto"): Player sideswipes/drift-rams the Kei Truck off the road!
            const truckPushDir: -1 | 1 =
              Math.abs(signedLatDiff) > 0.03
                ? signedLatDiff > 0
                  ? -1
                  : 1
                : car.driftDir !== 0
                  ? car.driftDir
                  : truckEffectiveX >= 0
                    ? 1
                    : -1;

            truck.lateralVel = truckPushDir * 5.8;
            truck.tiltAngle = truckPushDir * 0.52;
            truck.knockedTimer = 3.2;

            const minKeepSpeed = truck.speedRatio * maxSpeed * 1.05;
            car.applyImpact(-truckPushDir * 1.25, minKeepSpeed);
            this.collisionCooldown = 0.5;
            onCollision?.({
              type: 'collision',
              obstacle: 'traffic',
              truckId: truck.id,
              outcome: 'truckKnockedOff',
              side: -truckPushDir as -1 | 1,
            });
            return;
          } else {
            // Dynamic Outcome B ("Da dietro"): Rear-ending head-on shunts the player hard toward off-road!
            // Only trigger if player was actually driving faster than the truck and closing in from behind.
            const truckForwardSpeed = truck.speedRatio * maxSpeed;
            const playerClosingFromBehind =
              car.speed > 50 &&
              car.speed > truckForwardSpeed * 0.8 &&
              (prevDeltaZ <= 0 || prevDeltaZ < currDeltaZ);
            if (!playerClosingFromBehind) {
              // The truck is overtaking the player from behind: do not penalize or shunt the player!
              tIdx = truck.nextInSegment;
              continue;
            }

            const playerPushDir: -1 | 1 =
              Math.abs(signedLatDiff) > 0.04
                ? signedLatDiff > 0
                  ? 1
                  : -1
                : car.x >= 0
                  ? 1
                  : -1;

            const minKeepSpeed = truck.speedRatio * maxSpeed * 0.85;
            car.applyImpact(playerPushDir * 4.4, minKeepSpeed);

            // Truck jolts forward and wobbles slightly
            truck.z = (truck.z + segLen * 1.6) % trackLen;
            truck.lateralVel = -playerPushDir * 1.1;
            truck.tiltAngle = -playerPushDir * 0.2;
            truck.knockedTimer = 1.0;

            this.collisionCooldown = 0.6;
            onCollision?.({
              type: 'collision',
              obstacle: 'traffic',
              truckId: truck.id,
              outcome: 'playerShuntedOff',
              side: playerPushDir,
            });
            return;
          }
        }
        tIdx = truck.nextInSegment;
      }
    }

    // 3. Check roadside prop collisions when the car is outside the active outer asphalt edge.
    //    Use `Math.min(prevPlayerWorldZ, currPlayerWorldZ)` without wrapping across trackLen when
    //    checking the fork zone so crossing the finish line never wraps back into segment 0!
    const forkBounds = getForkCrossSection(
      wrappedCurrZ,
      trackLen,
      forkZoneStartZ,
      forkChoice,
      this.forkBoundsScratch,
    );
    if (Math.abs(car.x) <= forkBounds.outerLimit + 0.02) return;

    const prevSegIdx = Math.floor(wrappedPrevZ / segLen);
    // Avoid sweeping across the finish-line seam if the stage just wrapped around
    const rawSegDiff = playerSegIdx - prevSegIdx;
    const steps =
      rawSegDiff >= 0 && rawSegDiff < 8 ? Math.min(4, rawSegDiff + 1) : 1;

    for (let s = 0; s < steps; s++) {
      const seg = track.segments[(prevSegIdx + s) % segCount]!;
      for (let i = 0; i < seg.sprites.length; i++) {
        const sp = seg.sprites[i]!;
        const effectiveOffset = getEffectivePropOffset(
          sp.offset,
          seg.p1.worldZ,
          trackLen,
          forkZoneStartZ,
          forkChoice,
        );
        const hitW = propHitHalfWidth(sp.kind);
        if (Math.abs(car.x - effectiveOffset) < hitW) {
          const floorSpeed = maxSpeed * 0.25;
          const signedDiff = car.x - effectiveOffset;
          // Softly resolve collision away from the obstacle pole/trunk without teleporting onto the asphalt
          const resolveDir: -1 | 1 = signedDiff >= 0 ? 1 : -1;
          car.x = effectiveOffset + resolveDir * (hitW + 0.02);
          car.applyImpact(resolveDir * tuning.propBounceImpulse, floorSpeed);
          this.collisionCooldown = 0.45;
          onCollision?.({
            type: 'collision',
            obstacle: 'prop',
            propKind: sp.kind,
            outcome: 'propBounce',
            side: resolveDir,
          });
          return;
        }
      }
    }
  }

  private rebuildSpatialIndex(track: Track): void {
    const segCount = track.segments.length;
    const segLen = track.segmentLength;
    if (this.segmentHeads.length < segCount) {
      this.segmentHeads = new Int32Array(segCount);
    }
    this.segmentHeads.fill(-1);
    for (let i = 0; i < this.trucks.length; i++) {
      const t = this.trucks[i]!;
      const segIdx = Math.floor(t.z / segLen) % segCount;
      t.segmentIndex = segIdx;
      t.nextInSegment = this.segmentHeads[segIdx]!;
      this.segmentHeads[segIdx] = i;
    }
  }
}

const TRUCK_CAB_COLORS = ['#e8f7ff', '#ff4f9a', '#d8b4fe'] as const;
const TRUCK_BED_COLORS = ['#b8d8eb', '#c81d66', '#9d65c9'] as const;
const TRUCK_CARGO_COLORS = ['#05d9e8', '#ffd319', '#00f59b'] as const;

/**
 * Discrete OutRun-style sprite frame index for AI Kei Trucks:
 * Pure rear view (0).
 */
export type TruckSpriteFrame = 0;

/**
 * Kei truck sprite frame (reverted to pure rear view 0).
 */
export function getKeiTruckSpriteFrame(turnAngle?: number): TruckSpriteFrame {
  void turnAngle;
  return 0;
}

/**
 * 16-bit pixel-art 80s Japanese Kei Truck renderer (AGENTS.md §4.1, §4.3, §4.4 & §5 M7).
 *
 * Renders an authentic Daihatsu Hijet / Honda Acty style cab-over kei truck with:
 * - Pure rear-view perspective (zero 3/4 lateral distortion or side panels)
 * - 3 distinct cargo variants (Melon soda crates, Synth boombox, Fujiwara canopy)
 * - JDM yellow license plate, mudflaps, corrugated tailgate, driver silhouette
 * - Dynamic tilt on curve/shunt and hazard light flash when knocked off-road.
 * - Rock-solid vertical stability (no up/down wobble or nose lift).
 */
export function drawKeiTruck(
  ctx: CanvasRenderingContext2D,
  screenX: number,
  screenY: number,
  ppu: number,
  variant: number,
  tiltAngle = 0,
  isKnocked = false,
  roadCurve = 0,
): void {
  const w = Math.max(4, Math.round(1050 * ppu));
  const h = Math.max(4, Math.round(1180 * ppu));

  const v = variant % 3;
  const cabColor = TRUCK_CAB_COLORS[v]!;
  const bedColor = TRUCK_BED_COLORS[v]!;
  const cargoColor = TRUCK_CARGO_COLORS[v]!;

  // Distant low-LOD silhouette (<10px wide): 5 crisp pixel rects, zero save/restore overhead
  if (w < 10) {
    const sx = Math.round(screenX - w * 0.5);
    const sy = Math.round(screenY);
    const cabH = Math.max(2, Math.round(h * 0.42));
    const cargoH = Math.max(1, Math.round(h * 0.24));
    const bedH = Math.max(1, h - cabH - cargoH);
    ctx.fillStyle = cabColor;
    ctx.fillRect(sx, sy - h, w, cabH);
    ctx.fillStyle = cargoColor;
    ctx.fillRect(sx, sy - bedH - cargoH, w, cargoH);
    ctx.fillStyle = bedColor;
    ctx.fillRect(sx, sy - bedH, w, bedH);
    ctx.fillStyle = '#ff0055';
    ctx.fillRect(sx, sy - Math.max(2, bedH), 1, 1);
    ctx.fillRect(sx + w - 1, sy - Math.max(2, bedH), 1, 1);
    return;
  }

  const halfW = Math.max(2, Math.round(w * 0.5));

  ctx.save();
  ctx.translate(Math.round(screenX), Math.round(screenY));
  const effectiveTilt =
    tiltAngle * 0.45 + (roadCurve ? Math.max(-0.15, Math.min(0.15, roadCurve * 0.015)) : 0);
  if (Math.abs(effectiveTilt) > 0.005) {
    ctx.rotate(effectiveTilt * (isKnocked ? 0.75 : 1.0));
  }

  // 1. Ground shadow footprint - clean dark rectangular shadow, no stripe or wobble
  ctx.fillStyle = 'rgba(8, 2, 20, 0.65)';
  ctx.fillRect(-halfW - 2, -Math.max(1, Math.round(h * 0.06)), w + 4, Math.max(2, Math.round(h * 0.1)));

  // 2. Rear tires & mudflaps
  const tireW = Math.max(2, Math.round(w * 0.2));
  const tireH = Math.max(2, Math.round(h * 0.23));
  const leftTireX = Math.round(-halfW * 0.94);
  const rightTireX = Math.round(halfW * 0.94 - tireW);
  ctx.fillStyle = '#12091f';
  ctx.fillRect(leftTireX, -tireH, tireW, tireH);
  ctx.fillRect(rightTireX, -tireH, tireW, tireH);

  // Mudflap brackets & white tire tread highlights
  if (w >= 14) {
    ctx.fillStyle = '#241138';
    ctx.fillRect(
      leftTireX + tireW,
      -Math.round(tireH * 0.65),
      Math.max(1, rightTireX - (leftTireX + tireW)),
      Math.max(1, Math.round(tireH * 0.28)),
    );
    ctx.fillStyle = '#f6e7ff';
    ctx.fillRect(leftTireX, -Math.max(2, Math.round(tireH * 0.28)), tireW, Math.max(1, Math.round(tireH * 0.14)));
    ctx.fillRect(rightTireX, -Math.max(2, Math.round(tireH * 0.28)), tireW, Math.max(1, Math.round(tireH * 0.14)));
  }

  // 3. Forward cab-over driver cabin
  const cabW = Math.round(w * 0.88);
  const cabH = Math.round(h * 0.44);
  const cabTop = -h;
  const cabLeft = -Math.round(cabW * 0.5);
  ctx.fillStyle = cabColor;
  ctx.fillRect(cabLeft, cabTop, cabW, cabH);

  // Roof highlight & rack rail
  if (w >= 12) {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(cabLeft + 1, cabTop, cabW - 2, Math.max(1, Math.round(h * 0.03)));
  }

  // Rear cab window + driver head silhouette
  const winW = Math.round(cabW * 0.68);
  const winH = Math.round(cabH * 0.46);
  const winX = -Math.round(winW * 0.5);
  const winY = cabTop + Math.round(cabH * 0.16);
  ctx.fillStyle = '#1a0c33';
  ctx.fillRect(winX, winY, winW, winH);
  if (winW >= 6 && winH >= 4) {
    // Driver silhouette on right-hand JDM side + cyan glass glare on left
    const headS = Math.max(2, Math.round(winH * 0.55));
    ctx.fillStyle = '#381a5c';
    ctx.fillRect(winX + winW - headS - Math.max(1, Math.round(winW * 0.12)), winY + winH - headS, headS, headS);
    ctx.fillStyle = '#05d9e8';
    ctx.fillRect(winX + 1, winY + 1, Math.max(1, Math.round(winW * 0.25)), Math.max(1, winH - 2));
  }

  // 4. Variant-specific pixel-art cargo in the flatbed
  const cargoW = Math.round(w * 0.82);
  const cargoH = Math.round(h * 0.27);
  const cargoX = -Math.round(cargoW * 0.5);
  const cargoY = -Math.round(h * 0.65);
  ctx.fillStyle = cargoColor;
  ctx.fillRect(cargoX, cargoY, cargoW, cargoH);

  if (w >= 14 && cargoH >= 4) {
    if (v === 0) {
      // Variant 0: Stacked Melon Soda bottle crates with neon green bottle caps
      ctx.fillStyle = '#0d0221';
      ctx.fillRect(cargoX, cargoY + Math.round(cargoH * 0.48), cargoW, Math.max(1, Math.round(cargoH * 0.12)));
      ctx.fillStyle = '#00f59b';
      const step = Math.max(2, Math.round(cargoW * 0.22));
      for (let bx = cargoX + 2; bx < cargoX + cargoW - 2; bx += step) {
        ctx.fillRect(bx, cargoY - Math.max(1, Math.round(cargoH * 0.16)), Math.max(1, step - 1), Math.max(1, Math.round(cargoH * 0.2)));
      }
    } else if (v === 1) {
      // Variant 1: Retro synth boombox / speaker cabinet stack
      ctx.fillStyle = '#1a0933';
      const spkR = Math.max(2, Math.round(cargoH * 0.55));
      ctx.fillRect(cargoX + Math.round(cargoW * 0.14), cargoY + Math.round(cargoH * 0.2), spkR, spkR);
      ctx.fillRect(cargoX + cargoW - Math.round(cargoW * 0.14) - spkR, cargoY + Math.round(cargoH * 0.2), spkR, spkR);
      ctx.fillStyle = '#ff2a6d';
      ctx.fillRect(-Math.max(1, Math.round(cargoW * 0.12)), cargoY + Math.round(cargoH * 0.25), Math.max(2, Math.round(cargoW * 0.24)), Math.max(2, Math.round(cargoH * 0.45)));
    } else {
      // Variant 2: Kissaten / Fujiwara striped canvas tarpaulin canopy
      ctx.fillStyle = '#140624';
      ctx.fillRect(cargoX, cargoY + Math.round(cargoH * 0.36), cargoW, Math.max(1, Math.round(cargoH * 0.26)));
      ctx.fillStyle = '#fff3b0';
      ctx.fillRect(cargoX + Math.round(cargoW * 0.2), cargoY + Math.round(cargoH * 0.42), Math.round(cargoW * 0.6), Math.max(1, Math.round(cargoH * 0.12)));
    }
  }

  // 5. Flatbed corrugated tailgate & side latches
  const bedH = Math.round(h * 0.34);
  const bedY = Math.round(-tireH * 0.75 - bedH);
  ctx.fillStyle = bedColor;
  ctx.fillRect(-halfW, bedY, w, bedH);

  // Top tailgate rim & corrugated horizontal ribs
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(-halfW, bedY, w, Math.max(1, Math.round(bedH * 0.09)));
  ctx.fillStyle = '#1a0f2b';
  ctx.fillRect(Math.round(-halfW * 0.92), bedY + Math.round(bedH * 0.35), Math.round(w * 0.92), Math.max(1, Math.round(bedH * 0.12)));
  ctx.fillRect(Math.round(-halfW * 0.92), bedY + Math.round(bedH * 0.58), Math.round(w * 0.92), Math.max(1, Math.round(bedH * 0.12)));

  // 6. Rear bumper, JDM yellow kei-plate & tail/hazard lights
  const tailW = Math.max(2, Math.round(w * 0.22));
  const tailH = Math.max(2, Math.round(bedH * 0.26));
  const tailY = bedY + bedH - tailH - Math.max(1, Math.round(bedH * 0.08));
  ctx.fillStyle = isKnocked ? '#fff3b0' : '#ff2a6d';
  ctx.fillRect(Math.round(-halfW * 0.9), tailY, tailW, tailH);
  ctx.fillRect(Math.round(halfW * 0.9 - tailW), tailY, tailW, tailH);

  // Inner amber turn-signal pixel on tail lamps
  if (tailW >= 4) {
    ctx.fillStyle = '#ffd319';
    const sigW = Math.max(1, Math.round(tailW * 0.35));
    ctx.fillRect(Math.round(-halfW * 0.9), tailY, sigW, tailH);
    ctx.fillRect(Math.round(halfW * 0.9 - sigW), tailY, sigW, tailH);
  }

  // Center yellow JDM kei-plate
  const plateW = Math.max(2, Math.round(w * 0.18));
  ctx.fillStyle = '#ffd319';
  ctx.fillRect(-Math.round(plateW * 0.5), tailY, plateW, tailH);
  if (plateW >= 5 && tailH >= 3) {
    ctx.fillStyle = '#12091f';
    ctx.fillRect(-Math.round(plateW * 0.3), tailY + 1, Math.max(2, Math.round(plateW * 0.6)), Math.max(1, tailH - 2));
  }

  // Knocked-off hazard flash & pixel impact burst icon above cab
  if (isKnocked && w >= 10) {
    ctx.fillStyle = '#ffd319';
    ctx.fillRect(-2, cabTop - Math.max(4, Math.round(h * 0.18)), 4, Math.max(3, Math.round(h * 0.12)));
  }

  ctx.restore();
}
