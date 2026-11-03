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
import type { SongTrack } from '@src/road/SongRoadGenerator';

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

function isSongTrack(track: Track): track is SongTrack {
  return 'barLengthWorld' in track && 'chunks' in track;
}

function propHitHalfWidth(kind: PropKind): number {
  switch (kind) {
    case 'billboard':
      return 0.42;
    case 'palm':
      return 0.24;
    case 'lamp':
      return 0.2;
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
    const safeStartZ = Math.min(track.length * 0.15, 32 * track.segmentLength);
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
      const stepSegs = Math.max(20, Math.round(45 / density));
      for (let segIdx = 30; segIdx < segCount - 10; segIdx += stepSegs) {
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
  ): void {
    const trackLen = track.length;
    const segLen = track.segmentLength;
    const segCount = track.segments.length;
    if (trackLen <= 0 || segCount === 0) return;

    if (this.collisionCooldown > 0) {
      this.collisionCooldown = Math.max(0, this.collisionCooldown - dt);
    }

    // 1. Advance all AI Kei Trucks (forward Z + lateral knockback recovery) and rebuild spatial index
    if (this.segmentHeads.length < segCount) {
      this.segmentHeads = new Int32Array(segCount);
    }
    this.segmentHeads.fill(-1);

    const maxSpeed = tuning.maxSpeed;
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
      } else if (Math.abs(t.laneOffset - t.baseLaneOffset) > 0.01) {
        // Smoothly steer back toward cruising lane once recovered
        const returnStep = (t.baseLaneOffset - t.laneOffset) * Math.min(1, dt * 1.8);
        t.laneOffset += returnStep;
        t.tiltAngle = -returnStep * 4;
      } else {
        t.tiltAngle = 0;
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
    const wrappedCurrZ = ((currPlayerWorldZ % trackLen) + trackLen) % trackLen;
    const wrappedPrevZ = ((prevPlayerWorldZ % trackLen) + trackLen) % trackLen;
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
          const inwardSide: -1 | 1 = effectiveOffset > 0 ? -1 : 1;
          car.x = effectiveOffset + inwardSide * (hitW + 0.06);
          car.applyImpact(inwardSide * 3.4, floorSpeed);
          this.collisionCooldown = 0.55;
          onCollision?.({
            type: 'collision',
            obstacle: 'prop',
            propKind: sp.kind,
            outcome: 'propBounce',
            side: inwardSide,
          });
          return;
        }
      }
    }
  }

  private rebuildSpatialIndex(track: Track): void {
    const segCount = track.segments.length;
    const segLen = track.segmentLength;
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
 * Procedural greybox 80s Japanese Kei Truck rear-view renderer (AGENTS.md §4.1 & §4.4).
 * Called inside `RoadRenderer` Pass 2 (back-to-front Painter's Algorithm) so hill crests
 * naturally occlude traffic. Supports tilt/yaw and hazard sparks when knocked off-road.
 */
export function drawKeiTruck(
  ctx: CanvasRenderingContext2D,
  screenX: number,
  screenY: number,
  ppu: number,
  variant: number,
  tiltAngle = 0,
  isKnocked = false,
): void {
  const w = Math.max(4, 1050 * ppu);
  const h = Math.max(4, 1180 * ppu);
  const halfW = w / 2;

  const v = variant % 3;
  const cabColor = TRUCK_CAB_COLORS[v]!;
  const bedColor = TRUCK_BED_COLORS[v]!;
  const cargoColor = TRUCK_CARGO_COLORS[v]!;

  ctx.save();
  ctx.translate(screenX, screenY);
  if (Math.abs(tiltAngle) > 0.005) {
    ctx.rotate(tiltAngle * 0.45);
  }

  // 1. Ground shadow
  ctx.fillStyle = 'rgba(8, 2, 20, 0.6)';
  ctx.fillRect(-halfW * 1.05, -Math.max(1, h * 0.06), w * 1.05, Math.max(2, h * 0.1));

  // 2. Rear tires
  const tireW = Math.max(1.5, w * 0.18);
  const tireH = Math.max(2, h * 0.22);
  ctx.fillStyle = '#12091f';
  ctx.fillRect(-halfW * 0.92, -tireH, tireW, tireH);
  ctx.fillRect(halfW * 0.92 - tireW, -tireH, tireW, tireH);

  // 3. Upper boxy cab-over roof & rear window
  const cabTop = -h;
  const cabH = h * 0.48;
  const cabW = w * 0.88;
  ctx.fillStyle = cabColor;
  ctx.fillRect(-cabW / 2, cabTop, cabW, cabH);

  // Rear cab window
  const winW = cabW * 0.68;
  const winH = cabH * 0.46;
  ctx.fillStyle = '#1a0c33';
  ctx.fillRect(-winW / 2, cabTop + cabH * 0.16, winW, winH);

  // 4. Cargo crate / Future Funk neon tarpaulin in the flatbed
  const cargoW = w * 0.82;
  const cargoH = h * 0.26;
  const cargoY = -h * 0.64;
  ctx.fillStyle = cargoColor;
  ctx.fillRect(-cargoW / 2, cargoY, cargoW, cargoH);

  // 5. Flatbed tailgate
  const bedH = h * 0.34;
  const bedY = -tireH * 0.75 - bedH;
  ctx.fillStyle = bedColor;
  ctx.fillRect(-halfW, bedY, w, bedH);

  // Dark tailgate rib
  ctx.fillStyle = '#1a0f2b';
  ctx.fillRect(-halfW * 0.92, bedY + bedH * 0.42, w * 0.92, Math.max(1, bedH * 0.14));

  // 6. Rear bumper & glowing tail lights (flash bright amber when knocked off-road)
  const tailW = Math.max(2, w * 0.22);
  const tailH = Math.max(1.5, bedH * 0.26);
  const tailY = bedY + bedH - tailH - Math.max(1, bedH * 0.08);
  ctx.fillStyle = isKnocked ? '#fff3b0' : '#ff2a6d';
  ctx.fillRect(-halfW * 0.9, tailY, tailW, tailH);
  ctx.fillRect(halfW * 0.9 - tailW, tailY, tailW, tailH);

  // Center yellow JDM kei-plate
  const plateW = Math.max(2, w * 0.18);
  ctx.fillStyle = '#ffd319';
  ctx.fillRect(-plateW / 2, tailY, plateW, tailH);

  ctx.restore();
}
