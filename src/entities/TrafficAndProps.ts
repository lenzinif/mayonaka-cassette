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

          this.trucks.push({
            id: nextId++,
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
          });
        }
      }
    } else {
      const startSeg = Math.max(30, Math.floor(safeStartZ / track.segmentLength));
      const stepSegs = Math.max(20, Math.round(45 / density));
      for (let segIdx = startSeg; segIdx < segCount - 10; segIdx += stepSegs) {
        const laneIdx = rng.rangeInt(0, LANE_OFFSETS.length - 1);
        const laneOffset = LANE_OFFSETS[laneIdx]!;
        this.trucks.push({
          id: nextId++,
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
        );
        const playerAheadClose = deltaZToPlayer > 0 && deltaZToPlayer < 750;
        const inSameLane = Math.abs(truckEffectiveX - car.x) < 0.42;

        if (playerAheadClose && inSameLane) {
          // Player is ahead in this truck's lane: steer to an open lane
          const evadeDir: -1 | 1 = car.x >= 0 ? -1 : 1;
          t.baseLaneOffset = evadeDir * 0.58;
          const evadeStep = evadeDir * Math.min(1.0, dt * 2.5);
          t.laneOffset = Math.max(-0.85, Math.min(0.85, t.laneOffset + evadeStep));
          t.tiltAngle = -evadeStep * 3;
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
const TRUCK_CAB_SIDE_COLORS = ['#c2dfef', '#d62b74', '#b680ed'] as const;
const TRUCK_CAB_ROOF_COLORS = ['#ffffff', '#ff85b8', '#edd6ff'] as const;
const TRUCK_BED_COLORS = ['#b8d8eb', '#c81d66', '#9d65c9'] as const;
const TRUCK_BED_SIDE_COLORS = ['#94bcd4', '#9e1350', '#7e4ba8'] as const;
const TRUCK_CARGO_COLORS = ['#05d9e8', '#ffd319', '#00f59b'] as const;
const TRUCK_CARGO_TOP_COLORS = ['#7af0f7', '#ffe675', '#6bffc3'] as const;
const TRUCK_CARGO_SIDE_COLORS = ['#039ba8', '#cc9f08', '#00b874'] as const;

/**
 * Discrete OutRun-style 3-state sprite frame index for AI Kei Trucks (`-2..+2`):
 * - `0`: straight rear view & small adjustments
 * - `±1`: light / medium curve turn
 * - `±2`: heavy curve turn / knocked-off sideways slide
 */
export type TruckSpriteFrame = -2 | -1 | 0 | 1 | 2;

const TRUCK_REAR_COS = [1.0, 0.9, 0.78] as const;
const TRUCK_SIDE_RATIO = [0, 0.28, 0.48] as const;
const TRUCK_NOSE_LIFT = [0, 0.09, 0.16] as const;

/**
 * Maps an effective visual turn/curve angle to a discrete 3-state OutRun traffic sprite frame (`-2..+2`).
 */
export function getKeiTruckSpriteFrame(turnAngle: number): TruckSpriteFrame {
  const abs = Math.abs(turnAngle);
  if (abs < 0.2) return 0;
  const dir = turnAngle > 0 ? 1 : -1;
  if (abs < 0.44) return (dir * 1) as TruckSpriteFrame;
  return (dir * 2) as TruckSpriteFrame;
}

/**
 * 16-bit pixel-art 80s Japanese Kei Truck 3-state multi-angle renderer
 * (AGENTS.md §4.1, §4.3, §4.4 & §5 M7).
 *
 * Uses a unified 3-station 3D box projection (`v = 0` rear tailgate, `v = 0.62` cab back / cargo front,
 * `v = 1.0` cab front nose) so the rear tailgate, 3D cargo volume (top + side + rear faces), flatbed
 * drop-side panel, and forward cab-over driver cabin share exact vertices with zero gaps.
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
  const cabSideColor = TRUCK_CAB_SIDE_COLORS[v]!;
  const cabRoofColor = TRUCK_CAB_ROOF_COLORS[v]!;
  const bedColor = TRUCK_BED_COLORS[v]!;
  const bedSideColor = TRUCK_BED_SIDE_COLORS[v]!;
  const cargoColor = TRUCK_CARGO_COLORS[v]!;
  const cargoTopColor = TRUCK_CARGO_TOP_COLORS[v]!;
  const cargoSideColor = TRUCK_CARGO_SIDE_COLORS[v]!;

  // Distant low-LOD silhouette (<10px wide): 5 crisp pixel rects, zero save/restore/quad overhead
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

  const effectiveTurn = tiltAngle * 1.4 + roadCurve * 0.085;
  const frame = getKeiTruckSpriteFrame(effectiveTurn);
  const absFrame = Math.abs(frame);
  const dir = Math.sign(frame);

  const rearCos = TRUCK_REAR_COS[absFrame]!;
  const rearW = Math.max(4, Math.round(w * rearCos));
  const halfW = Math.max(2, Math.round(rearW * 0.5));
  const sideSpan = Math.round(w * TRUCK_SIDE_RATIO[absFrame]!);
  const noseLift = Math.round(h * TRUCK_NOSE_LIFT[absFrame]!);

  // 3 longitudinal stations along the truck:
  // Station A (v = 0.00): Rear tailgate & back of cargo
  // Station B (v = 0.62): Front of flatbed/cargo & back wall of cab-over cabin
  // Station C (v = 1.00): Front bumper/nose of cab-over cabin
  const xA = -dir * Math.round(sideSpan * 0.35);
  const yA = 0;
  const xB = xA + dir * Math.round(sideSpan * 0.62);
  const yB = -Math.round(noseLift * 0.62);
  const xC = xA + dir * sideSpan;
  const yC = -noseLift;

  const seamRearX = xA + dir * halfW;
  const seamMidX = xB + dir * halfW;
  const seamFrontX = xC + dir * halfW;

  ctx.save();
  ctx.translate(Math.round(screenX), Math.round(screenY));
  if (Math.abs(tiltAngle) > 0.005) {
    ctx.rotate(tiltAngle * (isKnocked ? 0.38 : 0.16));
  }

  const tireW = Math.max(2, Math.round(rearW * 0.2));
  const tireH = Math.max(2, Math.round(h * 0.23));
  const bedH = Math.round(h * 0.34);
  const bedBot = -Math.round(tireH * 0.72);
  const bedTop = bedBot - bedH;
  const cargoH = Math.round(h * 0.26);
  const cargoTop = bedTop - cargoH;
  const cabTop = -h;
  const cabH = bedTop - cabTop;

  // 1. Ground shadow footprint under all 3 stations
  ctx.fillStyle = 'rgba(8, 2, 20, 0.65)';
  if (absFrame === 0) {
    ctx.fillRect(-halfW - 2, -Math.max(1, Math.round(h * 0.06)), rearW + 4, Math.max(2, Math.round(h * 0.1)));
  } else {
    truckQuad(
      ctx,
      'rgba(8, 2, 20, 0.65)',
      xA - halfW - 2,
      2,
      xA + halfW + 2,
      2,
      xC + halfW + 2,
      2 + yC,
      xC - halfW - 2,
      2 + yC,
    );
  }

  // 2. Side wheels on the exposed flank (when turning: absFrame >= 1)
  if (absFrame >= 1 && sideSpan >= 3) {
    const sideWheelW = Math.max(2, Math.round(sideSpan * 0.26));
    const rearSideWheelX =
      xA + dir * (halfW + Math.round(sideSpan * 0.18)) - Math.floor(sideWheelW * 0.5);
    const rearSideWheelY = -tireH + Math.round(yB * 0.28);
    const frontSideWheelX =
      xA + dir * (halfW + Math.round(sideSpan * 0.78)) - Math.floor(sideWheelW * 0.5);
    const frontSideWheelY = -tireH + Math.round(yC * 0.82);

    ctx.fillStyle = '#12091f';
    ctx.fillRect(rearSideWheelX, rearSideWheelY, sideWheelW, tireH);
    ctx.fillRect(frontSideWheelX, frontSideWheelY, sideWheelW, tireH);
    if (w >= 14 && sideWheelW >= 3) {
      ctx.fillStyle = '#e0fbfc';
      ctx.fillRect(
        rearSideWheelX + 1,
        rearSideWheelY + Math.round(tireH * 0.25),
        Math.max(1, sideWheelW - 2),
        Math.max(1, Math.round(tireH * 0.45)),
      );
      ctx.fillRect(
        frontSideWheelX + 1,
        frontSideWheelY + Math.round(tireH * 0.25),
        Math.max(1, sideWheelW - 2),
        Math.max(1, Math.round(tireH * 0.45)),
      );
    }
  }

  // 3. Forward Cab-Over Driver Cabin (Station B v=0.62 to Station C v=1.00)
  if (absFrame >= 1 && sideSpan >= 2) {
    // 3a. Cab 3D Roof Top Quad connecting Station B roof to Station C roof
    truckQuad(
      ctx,
      cabRoofColor,
      xB - halfW,
      cabTop + yB,
      xB + halfW,
      cabTop + yB,
      xC + halfW,
      cabTop + yC,
      xC - halfW,
      cabTop + yC,
    );

    // 3b. Cab Exposed Side Door & Pillar (from seamMidX at v=0.62 to seamFrontX at v=1.00)
    truckQuad(
      ctx,
      cabSideColor,
      seamMidX,
      bedBot + yB,
      seamFrontX,
      bedBot + yC,
      seamFrontX,
      cabTop + yC,
      seamMidX,
      cabTop + yB,
    );

    // Side cab window + front amber corner blinker on the exposed cab side
    if (w >= 12 && Math.abs(seamFrontX - seamMidX) >= 3) {
      const winX1 = seamMidX + dir * Math.max(1, Math.round(Math.abs(seamFrontX - seamMidX) * 0.16));
      const winX2 = seamFrontX - dir * Math.max(1, Math.round(Math.abs(seamFrontX - seamMidX) * 0.14));
      const winTopB = cabTop + Math.round(cabH * 0.16) + yB;
      const winTopC = cabTop + Math.round(cabH * 0.16) + yC;
      const winBotB = cabTop + Math.round(cabH * 0.62) + yB;
      const winBotC = cabTop + Math.round(cabH * 0.62) + yC;
      truckQuad(ctx, '#1a0c33', winX1, winBotB, winX2, winBotC, winX2, winTopC, winX1, winTopB);

      // Front amber headlight/blinker at the leading corner of the cab
      ctx.fillStyle = '#ffd319';
      ctx.fillRect(
        dir > 0 ? seamFrontX - 2 : seamFrontX,
        bedBot - Math.max(2, Math.round(bedH * 0.55)) + yC,
        2,
        Math.max(2, Math.round(bedH * 0.35)),
      );
    }
  }

  // 3c. Cab Rear Wall at Station B (centered at xB, yB — seamlessly joined to Cargo Front & Cab Side!)
  ctx.fillStyle = cabColor;
  ctx.fillRect(xB - halfW, cabTop + yB, halfW * 2, cabH + Math.round(bedH * 0.25));
  if (w >= 12) {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(
      xB - halfW + 1,
      cabTop + yB,
      Math.max(1, halfW * 2 - 2),
      Math.max(1, Math.round(h * 0.03)),
    );
  }

  // Rear cab window + driver head silhouette at Station B
  const winW = Math.round(halfW * 2 * 0.7);
  const winH = Math.max(2, Math.round(cabH * 0.48));
  const winX = xB - Math.round(winW * 0.5);
  const winY = cabTop + yB + Math.round(cabH * 0.18);
  ctx.fillStyle = '#1a0c33';
  ctx.fillRect(winX, winY, winW, winH);
  if (winW >= 6 && winH >= 4) {
    const headS = Math.max(2, Math.round(winH * 0.55));
    ctx.fillStyle = '#381a5c';
    ctx.fillRect(
      winX + winW - headS - Math.max(1, Math.round(winW * 0.12)),
      winY + winH - headS,
      headS,
      headS,
    );
    ctx.fillStyle = '#05d9e8';
    ctx.fillRect(winX + 1, winY + 1, Math.max(1, Math.round(winW * 0.25)), Math.max(1, winH - 2));
  }

  // 4. 3D Cargo Box (spanning Station A v=0.00 to Station B v=0.62, flush with the Cab Rear Wall & Side!)
  const cargoHalfW = halfW;
  if (absFrame >= 1 && sideSpan >= 2) {
    // 4a. Cargo 3D Top Face connecting Station A top to Station B top (gives true 3D depth!)
    truckQuad(
      ctx,
      cargoTopColor,
      xA - cargoHalfW,
      cargoTop + yA,
      xA + cargoHalfW,
      cargoTop + yA,
      xB + cargoHalfW,
      cargoTop + yB,
      xB - cargoHalfW,
      cargoTop + yB,
    );

    // 4b. Cargo 3D Exposed Side Face connecting Station A side to Station B cab back
    truckQuad(
      ctx,
      cargoSideColor,
      seamRearX,
      bedTop + yA,
      seamMidX,
      bedTop + yB,
      seamMidX,
      cargoTop + yB,
      seamRearX,
      cargoTop + yA,
    );

    // Side-face cargo detail stripe so the 3D depth reads clearly
    if (w >= 14 && cargoH >= 4) {
      const stripeY1 = cargoTop + Math.round(cargoH * 0.42);
      const stripeY2 = cargoTop + Math.round(cargoH * 0.62);
      truckQuad(
        ctx,
        v === 2 ? '#fff3b0' : '#140624',
        seamRearX,
        stripeY2 + yA,
        seamMidX,
        stripeY2 + yB,
        seamMidX,
        stripeY1 + yB,
        seamRearX,
        stripeY1 + yA,
      );
    }
  }

  // 4c. Cargo Rear Face at Station A (centered at xA, yA)
  const cargoW = cargoHalfW * 2;
  const cargoX = xA - cargoHalfW;
  const cargoY = cargoTop + yA;
  ctx.fillStyle = cargoColor;
  ctx.fillRect(cargoX, cargoY, cargoW, cargoH);

  if (w >= 14 && cargoH >= 4) {
    if (v === 0) {
      // Variant 0: Stacked Melon Soda bottle crates with neon green bottle caps
      ctx.fillStyle = '#0d0221';
      ctx.fillRect(
        cargoX,
        cargoY + Math.round(cargoH * 0.48),
        cargoW,
        Math.max(1, Math.round(cargoH * 0.12)),
      );
      ctx.fillStyle = '#00f59b';
      const step = Math.max(2, Math.round(cargoW * 0.22));
      for (let bx = cargoX + 2; bx < cargoX + cargoW - 2; bx += step) {
        const capW = Math.max(1, Math.min(step - 1, cargoX + cargoW - 2 - bx));
        ctx.fillRect(
          bx,
          cargoY - Math.max(1, Math.round(cargoH * 0.14)),
          capW,
          Math.max(1, Math.round(cargoH * 0.18)),
        );
      }
    } else if (v === 1) {
      // Variant 1: Retro synth boombox / speaker cabinet stack
      ctx.fillStyle = '#1a0933';
      const spkR = Math.max(2, Math.round(cargoH * 0.55));
      ctx.fillRect(cargoX + Math.round(cargoW * 0.14), cargoY + Math.round(cargoH * 0.2), spkR, spkR);
      ctx.fillRect(
        cargoX + cargoW - Math.round(cargoW * 0.14) - spkR,
        cargoY + Math.round(cargoH * 0.2),
        spkR,
        spkR,
      );
      ctx.fillStyle = '#ff2a6d';
      ctx.fillRect(
        xA - Math.max(1, Math.round(cargoW * 0.12)),
        cargoY + Math.round(cargoH * 0.25),
        Math.max(2, Math.round(cargoW * 0.24)),
        Math.max(2, Math.round(cargoH * 0.45)),
      );
    } else {
      // Variant 2: Kissaten / Fujiwara striped canvas tarpaulin canopy
      ctx.fillStyle = '#140624';
      ctx.fillRect(
        cargoX,
        cargoY + Math.round(cargoH * 0.36),
        cargoW,
        Math.max(1, Math.round(cargoH * 0.26)),
      );
      ctx.fillStyle = '#fff3b0';
      ctx.fillRect(
        cargoX + Math.round(cargoW * 0.2),
        cargoY + Math.round(cargoH * 0.42),
        Math.round(cargoW * 0.6),
        Math.max(1, Math.round(cargoH * 0.12)),
      );
    }
  }

  // 5. Flatbed Drop-Side Panel (Station A v=0.00 to Station B v=0.62)
  if (absFrame >= 1 && sideSpan >= 2) {
    truckQuad(
      ctx,
      bedSideColor,
      seamRearX,
      bedBot + yA,
      seamMidX,
      bedBot + yB,
      seamMidX,
      bedTop + yB,
      seamRearX,
      bedTop + yA,
    );
    // White top rim along flatbed side panel
    const rimH = Math.max(1, Math.round(bedH * 0.1));
    truckQuad(
      ctx,
      '#ffffff',
      seamRearX,
      bedTop + rimH + yA,
      seamMidX,
      bedTop + rimH + yB,
      seamMidX,
      bedTop + yB,
      seamRearX,
      bedTop + yA,
    );
  }

  // 6. Rear Tires & Mudflaps at Station A (v=0.00)
  const leftTireX = xA + Math.round(-halfW * 0.94);
  const rightTireX = xA + Math.round(halfW * 0.94 - tireW);
  ctx.fillStyle = '#12091f';
  ctx.fillRect(leftTireX, -tireH, tireW, tireH);
  ctx.fillRect(rightTireX, -tireH, tireW, tireH);

  if (w >= 14) {
    ctx.fillStyle = '#241138';
    ctx.fillRect(
      leftTireX + tireW,
      -Math.round(tireH * 0.65),
      Math.max(1, rightTireX - (leftTireX + tireW)),
      Math.max(1, Math.round(tireH * 0.28)),
    );
    ctx.fillStyle = '#f6e7ff';
    ctx.fillRect(
      leftTireX,
      -Math.max(2, Math.round(tireH * 0.28)),
      tireW,
      Math.max(1, Math.round(tireH * 0.14)),
    );
    ctx.fillRect(
      rightTireX,
      -Math.max(2, Math.round(tireH * 0.28)),
      tireW,
      Math.max(1, Math.round(tireH * 0.14)),
    );
  }

  // 7. Flatbed Corrugated Rear Tailgate at Station A (v=0.00, flush with seamRearX!)
  ctx.fillStyle = bedColor;
  ctx.fillRect(xA - halfW, bedTop, halfW * 2, bedH);

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(xA - halfW, bedTop, halfW * 2, Math.max(1, Math.round(bedH * 0.09)));
  ctx.fillStyle = '#1a0f2b';
  ctx.fillRect(
    xA + Math.round(-halfW * 0.92),
    bedTop + Math.round(bedH * 0.35),
    Math.round(halfW * 2 * 0.92),
    Math.max(1, Math.round(bedH * 0.12)),
  );
  ctx.fillRect(
    xA + Math.round(-halfW * 0.92),
    bedTop + Math.round(bedH * 0.58),
    Math.round(halfW * 2 * 0.92),
    Math.max(1, Math.round(bedH * 0.12)),
  );

  // 8. Rear Bumper, JDM Yellow Kei-Plate & Tail/Hazard Lights at Station A
  const tailW = Math.max(2, Math.round(halfW * 2 * 0.22));
  const tailH = Math.max(2, Math.round(bedH * 0.26));
  const tailY = bedBot - tailH - Math.max(1, Math.round(bedH * 0.08));
  ctx.fillStyle = isKnocked ? '#fff3b0' : '#ff2a6d';
  ctx.fillRect(xA + Math.round(-halfW * 0.9), tailY, tailW, tailH);
  ctx.fillRect(xA + Math.round(halfW * 0.9 - tailW), tailY, tailW, tailH);

  if (tailW >= 4) {
    ctx.fillStyle = '#ffd319';
    const sigW = Math.max(1, Math.round(tailW * 0.35));
    ctx.fillRect(xA + Math.round(-halfW * 0.9), tailY, sigW, tailH);
    ctx.fillRect(xA + Math.round(halfW * 0.9 - sigW), tailY, sigW, tailH);
  }

  const plateW = Math.max(2, Math.round(halfW * 2 * 0.18));
  ctx.fillStyle = '#ffd319';
  ctx.fillRect(xA - Math.round(plateW * 0.5), tailY, plateW, tailH);
  if (plateW >= 5 && tailH >= 3) {
    ctx.fillStyle = '#12091f';
    ctx.fillRect(
      xA - Math.round(plateW * 0.3),
      tailY + 1,
      Math.max(2, Math.round(plateW * 0.6)),
      Math.max(1, tailH - 2),
    );
  }

  if (isKnocked && w >= 10) {
    ctx.fillStyle = '#ffd319';
    ctx.fillRect(
      xB - 2,
      cabTop + yB - Math.max(4, Math.round(h * 0.18)),
      4,
      Math.max(3, Math.round(h * 0.12)),
    );
  }

  ctx.restore();
}

function truckQuad(
  ctx: CanvasRenderingContext2D,
  color: string,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  x3: number,
  y3: number,
  x4: number,
  y4: number,
): void {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.lineTo(x3, y3);
  ctx.lineTo(x4, y4);
  ctx.closePath();
  ctx.fill();
}
