import type { BeatJudgement } from '@src/audio/BeatClock';
import { tuning } from '@src/config/tuning';
import type { ForkCrossSection } from '@src/road/RoadSegment';
import { Gearbox, MAX_GEAR, type GearNumber, type ShiftResult } from './Gearbox';

export interface DriveControls {
  left: boolean;
  right: boolean;
  accelerate: boolean;
  brake: boolean;
  drift: boolean;
  steerAxis?: number;
  throttleAxis?: number;
  brakeAxis?: number;
}

export type DriftDirection = -1 | 0 | 1;

/**
 * Discrete OutRun-style 3-state sprite frame index for the player car:
 * - `0`: straight rear view & small steering adjustments
 * - `±1`: light / medium cornering turn (~18° 3/4 rear-side view)
 * - `±2`: heavy turn / drift powerslide (~36° wide 3/4 side-rear view)
 */
export type CarSpriteFrame = -2 | -1 | 0 | 1 | 2;

export interface CarRearRig {
  centerX: number;
  baseY: number;
  leftTireX: number;
  rightTireX: number;
  leftExhaustX: number;
  rightExhaustX: number;
  spriteFrame: CarSpriteFrame;
}

export type GrooveTier = 'LOW' | 'MEDIUM' | 'HIGH' | 'SSS';

export type CarEvent =
  | { type: 'driftStart'; direction: -1 | 1 }
  | { type: 'driftEnd'; duration: number }
  | { type: 'gearShift'; result: ShiftResult; grooveGained: number }
  | { type: 'grooveTierChanged'; tier: GrooveTier; prevTier: GrooveTier; groove: number };

/** Promotion thresholds for moving UP a Groove tier. */
export const GROOVE_PROMOTE_THRESHOLDS: Readonly<Record<Exclude<GrooveTier, 'LOW'>, number>> = {
  MEDIUM: 25,
  HIGH: 55,
  SSS: 85,
};

/** Demotion thresholds (with 6-point hysteresis band) for dropping DOWN a Groove tier. */
export const GROOVE_DEMOTE_THRESHOLDS: Readonly<Record<Exclude<GrooveTier, 'LOW'>, number>> = {
  MEDIUM: 19,
  HIGH: 49,
  SSS: 79,
};

const TIER_ORDER: readonly GrooveTier[] = ['LOW', 'MEDIUM', 'HIGH', 'SSS'];

/**
 * Evaluates the Groove tier for `groove` (`0..100`) given `currentTier`, applying hysteresis
 * so hovering near a boundary never flickers between tiers (AGENTS.md §5).
 */
export function evaluateGrooveTier(groove: number, currentTier: GrooveTier): GrooveTier {
  let idx = TIER_ORDER.indexOf(currentTier);

  // Check promotions (can jump multiple tiers if a large bonus lands)
  while (idx < TIER_ORDER.length - 1) {
    const nextTier = TIER_ORDER[idx + 1] as Exclude<GrooveTier, 'LOW'>;
    if (groove >= GROOVE_PROMOTE_THRESHOLDS[nextTier]) {
      idx++;
    } else {
      break;
    }
  }

  // Check demotions with hysteresis
  while (idx > 0) {
    const cur = TIER_ORDER[idx] as Exclude<GrooveTier, 'LOW'>;
    if (groove < GROOVE_DEMOTE_THRESHOLDS[cur]) {
      idx--;
    } else {
      break;
    }
  }

  return TIER_ORDER[idx]!;
}

/**
 * Fake arcade car physics, 4-speed gearbox integration, and Groove meter math
 * (Design Pillar 1: Feel Over Simulation; Pillar 3: Protect the Flow State).
 *
 * All lateral positions (`x`, `prevX`) are in road half-widths:
 *   0 = road centre, ±1 = outer edge of asphalt, >1 = off-road grass/shoulder.
 */
export class PlayerCar {
  /** Current lateral offset in road half-widths. */
  x = 0;
  /** Previous step lateral offset for render interpolation. */
  prevX = 0;

  /** Forward speed in world units per second. */
  speed = 0;

  /** Smoothed steering input (-1..1). */
  steer = 0;
  /** Visual yaw angle (-1..1) used to tilt/skew the car sprite on screen. */
  yaw = 0;
  /** Visual pitch offset from road slope changes (hill crests/dips). */
  pitch = 0;
  /** Accumulated phase for road vibration / off-road bounce. */
  bouncePhase = 0;

  /** Current drift direction: -1 (left), 0 (not drifting), +1 (right). */
  driftDir: DriftDirection = 0;
  /** How long the current drift has been held, in seconds. */
  driftTime = 0;

  /** True while braking input is active. */
  braking = false;

  /** 4-speed beat-shift gearbox (M5). */
  readonly gearbox = new Gearbox();

  /** Groove meter in `[0, 100]` and hysteresis-stabilised Groove tier (M5). */
  groove = 15;
  grooveTier: GrooveTier = 'LOW';

  /** Instantaneous normalized accelerations used by `MelonSoda` to compute slosh & jerk. */
  longitudinalAccel = 0;
  lateralAccel = 0;
  verticalAccel = 0;

  /** Lateral knockback velocity (in road half-widths/s) from obstacle or traffic collisions. */
  bumpVx = 0;

  private prevSlope = 0;
  private prevLateralVel = 0;
  private smoothedLatDelta = 0;
  private prevBrake = false;
  private brakeDriftActive = false;
  /** Current outer asphalt edge (1.0 on normal road, up to 1.68 in Y-fork). */
  private roadOuterLimit = 1;
  /** Current inner median island half-width (0 on normal road, up to 0.52 in Y-fork). */
  private roadInnerGap = 0;

  get isOffRoad(): boolean {
    const absX = Math.abs(this.x);
    return absX > this.roadOuterLimit || (this.roadInnerGap > 0.02 && absX < this.roadInnerGap);
  }

  /**
   * Continuous off-road penetration depth in `[0, 1]` accounting for both the outer shoulder
   * and the central V-chevron median island in the stage fork.
   */
  get offRoadDepth(): number {
    const absX = Math.abs(this.x);
    if (absX > this.roadOuterLimit) {
      return Math.max(0, Math.min(1, (absX - this.roadOuterLimit) / 0.65));
    }
    if (this.roadInnerGap > 0.02 && absX < this.roadInnerGap) {
      return Math.max(
        0,
        Math.min(1, (this.roadInnerGap - absX) / Math.max(0.12, this.roadInnerGap)),
      );
    }
    return 0;
  }

  get isDrifting(): boolean {
    return this.driftDir !== 0;
  }

  /**
   * Current discrete OutRun multi-angle sprite frame (`-4..+4`).
   */
  get spriteFrame(): CarSpriteFrame {
    return getPlayerCarSpriteFrame(this);
  }

  get gear(): GearNumber {
    return this.gearbox.gear;
  }

  get rpm(): number {
    return this.gearbox.rpm;
  }

  /** Normalized speed (0..1) against `tuning.maxSpeed`. */
  get speedRatio(): number {
    return tuning.maxSpeed > 0 ? this.speed / tuning.maxSpeed : 0;
  }

  /** Displayed speed in km/h. */
  get speedKmh(): number {
    return Math.round(this.speedRatio * tuning.maxSpeedKmh);
  }

  /**
   * Adds Groove points (multiplied by `tuning.tofuGrooveMultiplier` when `tofuActive` is true)
   * and emits `grooveTierChanged` if a tier promotion occurs.
   */
  addGroove(
    basePoints: number,
    tofuActive = false,
    onEvent?: (event: CarEvent) => void,
  ): number {
    if (basePoints <= 0) return 0;
    const mult = tofuActive ? tuning.tofuGrooveMultiplier : 1;
    const gained = basePoints * mult;
    this.groove = Math.max(0, Math.min(100, this.groove + gained));
    this.syncGrooveTier(onEvent);
    return gained;
  }

  /**
   * Deducts Groove points (e.g. off-road drain or collision penalty) and updates tier with hysteresis.
   */
  deductGroove(points: number, onEvent?: (event: CarEvent) => void): void {
    if (points <= 0) return;
    this.groove = Math.max(0, Math.min(100, this.groove - points));
    this.syncGrooveTier(onEvent);
  }

  /**
   * Deducts a fraction (`pct`, e.g. `0.10` = 10%) of the current Groove tier span (used on Tofu Mode spill).
   */
  deductTierProgressPct(pct: number, onEvent?: (event: CarEvent) => void): number {
    const tierSpan = 30;
    const loss = Math.max(1, tierSpan * Math.max(0, Math.min(1, pct)));
    this.deductGroove(loss, onEvent);
    return loss;
  }

  /**
   * Applies a physical lateral knockback impulse and speed retention on collision
   * (Design Pillar 3: dramatic physical shunt without a dead stop).
   */
  applyImpact(lateralVelocityImpulse: number, minSpeedFloor: number): void {
    this.speed = Math.max(minSpeedFloor, this.speed * tuning.collisionSpeedRetention);
    this.bumpVx = Math.max(-5.5, Math.min(5.5, this.bumpVx + lateralVelocityImpulse));
    const yawImpulse = Math.min(0.24, Math.abs(lateralVelocityImpulse) * 0.16);
    this.yaw = Math.max(-1.2, Math.min(1.2, this.yaw + Math.sign(lateralVelocityImpulse) * yawImpulse));
    if (Math.abs(lateralVelocityImpulse) > 2.4) {
      // Heavy shunt breaks an active drift
      this.driftDir = 0;
      this.driftTime = 0;
    }
  }

  /**
   * Handles a manual gear shift (`up` or `down`) judged against the beat clock.
   * No speed boost is applied; valid beat-matched shifts reward Groove only.
   */
  shiftGear(
    direction: 'up' | 'down',
    judgement: BeatJudgement,
    tofuActive = false,
    onEvent?: (event: CarEvent) => void,
  ): ShiftResult | null {
    const result = this.gearbox.shift(direction, this.speed, tuning.maxSpeed, judgement);
    if (!result) return null;

    let grooveGained = 0;
    if (result.validForBonus) {
      const downbeatMult = judgement.isDownbeat ? 1.35 : 1.0;
      if (result.rewardTier === 'PERFECT') {
        grooveGained = this.addGroove(
          tuning.grooveShiftPerfectGain * downbeatMult,
          tofuActive,
          onEvent,
        );
      } else if (result.rewardTier === 'GOOD') {
        grooveGained = this.addGroove(
          tuning.grooveShiftGoodGain * downbeatMult,
          tofuActive,
          onEvent,
        );
      }
    }

    onEvent?.({ type: 'gearShift', result, grooveGained });
    return result;
  }

  /**
   * Advances car state by one fixed step `dt`.
   * @param dt Fixed simulation step in seconds.
   * @param controls Current polled input state.
   * @param segmentCurve Curvature of the road segment under the car.
   * @param segmentSlope Vertical slope `(p2.worldY - p1.worldY) / segmentLength` under the car.
   * @param onEvent Optional callback for discrete car/groove events.
   * @param tofuActive True when Tofu Mode is active (`×2` Groove gain).
   * @param forkBounds Optional Y-fork cross-section geometry at the car's world Z.
   */
  update(
    dt: number,
    controls: DriveControls,
    segmentCurve: number,
    segmentSlope = 0,
    onEvent?: (event: CarEvent) => void,
    tofuActive = false,
    forkBounds?: ForkCrossSection,
  ): void {
    this.prevX = this.x;
    this.braking = controls.brake;
    this.roadOuterLimit = forkBounds ? forkBounds.outerLimit : 1;
    this.roadInnerGap = forkBounds ? forkBounds.innerGap : 0;

    const maxSpeed = tuning.maxSpeed;
    const prevSpeed = this.speed;
    const gearTopSpeed = this.gearbox.getGearTopSpeed(maxSpeed);
    const offRoadCap = maxSpeed * tuning.offRoadMaxSpeedRatio;

    // 1. Longitudinal speed (accelerate via Gearbox torque curve / brake / coast + off-road & grade drag).
    const gearProgress = (this.gearbox.gear - 1) / (MAX_GEAR - 1);
    // Uphill climbs (`segmentSlope > 0`) load tall gears more heavily, encouraging downshifts on `build`
    // ramps and beat-matched upshifts on the drop crest; downhill slopes provide a mild gravity assist.
    const gradeLoadFactor = 0.45 + gearProgress * 0.95;
    const slopeDragRate =
      segmentSlope > 0.01
        ? Math.min(0.22, segmentSlope * 0.34) * gradeLoadFactor
        : segmentSlope < -0.01
          ? Math.max(-0.07, segmentSlope * 0.12)
          : 0;

    if (controls.brake) {
      const brakeScale =
        controls.brakeAxis !== undefined && controls.brakeAxis > 0.15
          ? controls.brakeAxis
          : 1.0;
      this.speed -= maxSpeed * (tuning.brakeRate * brakeScale + Math.max(0, slopeDragRate)) * dt;
    } else if (this.isOffRoad && this.speed > offRoadCap) {
      // Off-road grass drags speed down toward offRoadCap even if throttle is held
      // (Design Pillar 3: slows down noticeably, never forces a dead stop).
      this.speed = Math.max(offRoadCap, this.speed - maxSpeed * tuning.offRoadDecelRate * dt);
    } else if (controls.accelerate) {
      const targetCap = this.isOffRoad ? Math.min(offRoadCap, gearTopSpeed) : gearTopSpeed;
      if (this.speed <= targetCap) {
        const throttleScale =
          controls.throttleAxis !== undefined && controls.throttleAxis > 0.15
            ? controls.throttleAxis
            : 1.0;
        const torque = this.gearbox.getTorqueFactor(this.speed, maxSpeed) * throttleScale;
        // Sideways tire scrub during a drift reduces forward drive in tall gears so long drifts
        // naturally dip speed into the 4th/5th gear powerband instead of staying pinned at redline.
        const driftDriveScale = this.driftDir !== 0 ? Math.max(0.2, 0.62 - gearProgress * 0.42) : 1;
        const netAccelRate = tuning.accelRate * torque * driftDriveScale - slopeDragRate;
        this.speed = Math.min(targetCap, this.speed + maxSpeed * netAccelRate * dt);
      } else {
        // Gentle engine-braking decel if above current gear's top speed (e.g. after downshift)
        this.speed = Math.max(
          targetCap,
          this.speed - maxSpeed * (tuning.coastRate * 1.4 + Math.max(0, slopeDragRate)) * dt,
        );
      }
    } else {
      this.speed -= maxSpeed * (tuning.coastRate + Math.max(0, slopeDragRate)) * dt;
    }

    this.speed = Math.max(0, Math.min(maxSpeed, this.speed));
    this.gearbox.update(this.speed, maxSpeed);

    const speedRatio = this.speedRatio;

    // 2. Smooth steering input (supports analog steerAxis from Gamepad or digital left/right keys).
    const rawSteer =
      controls.steerAxis !== undefined && Math.abs(controls.steerAxis) > 0.05
        ? Math.max(-1, Math.min(1, controls.steerAxis))
        : (controls.right ? 1 : 0) - (controls.left ? 1 : 0);
    const steerBlend = 1 - Math.exp(-tuning.steerResponse * dt);
    this.steer += (rawSteer - this.steer) * steerBlend;
    if (Math.abs(this.steer) < 0.001 && rawSteer === 0) {
      this.steer = 0;
    }

    // 3. Drift state machine (supports dedicated Drift key C/Ctrl OR OutRun-style S+Steer tap).
    const brakeJustPressed = controls.brake && !this.prevBrake;
    this.prevBrake = controls.brake;

    const aboveMinSpeed = speedRatio >= tuning.driftMinSpeedRatio;
    if (this.driftDir === 0) {
      if (aboveMinSpeed && rawSteer !== 0 && (controls.drift || brakeJustPressed)) {
        this.driftDir = rawSteer > 0 ? 1 : -1;
        this.driftTime = 0;
        this.brakeDriftActive = !controls.drift && brakeJustPressed;
        onEvent?.({ type: 'driftStart', direction: this.driftDir });
      }
    } else {
      const canSustain = this.brakeDriftActive
        ? aboveMinSpeed && (rawSteer !== 0 || Math.abs(segmentCurve) > 1.2)
        : controls.drift && aboveMinSpeed;
      if (!canSustain) {
        const duration = this.driftTime;
        this.driftDir = 0;
        this.driftTime = 0;
        this.brakeDriftActive = false;
        onEvent?.({ type: 'driftEnd', duration });
      } else {
        this.driftTime += dt;
        // Lateral tire scrub bleeds speed (more pronounced in higher gears / high entry speeds),
        // inviting a downshift to 4th/5th on exit to launch out of the corner.
        const highGearScrub = 0.75 + 0.55 * gearProgress;
        this.speed = Math.max(
          0,
          this.speed - maxSpeed * tuning.driftDecelRate * highGearScrub * dt,
        );
        this.gearbox.update(this.speed, maxSpeed);
      }
    }

    // 4. Lateral movement: steering authority + centrifugal pull on curves.
    const steerAuthority = Math.min(1, speedRatio * 1.35);
    let lateralVel: number;
    if (this.driftDir !== 0) {
      const inward = this.driftDir * tuning.driftInwardSteer;
      const counter = this.steer * tuning.driftCounterSteer;
      lateralVel = (inward + counter) * tuning.steerRate * steerAuthority;
    } else {
      lateralVel = this.steer * tuning.steerRate * steerAuthority;
    }

    const gripFactor = this.driftDir !== 0 ? 1 - tuning.driftCentrifugalReduce : 1;
    const centrifugalPush =
      segmentCurve * (speedRatio * speedRatio) * tuning.centrifugal * gripFactor;

    const netLateralVel = lateralVel - centrifugalPush + this.bumpVx;
    this.x += netLateralVel * dt;
    const xLimit = tuning.playerXLimit + (this.roadOuterLimit - 1);
    this.x = Math.max(-xLimit, Math.min(xLimit, this.x));

    // Decay collision knockback velocity with tire friction
    if (Math.abs(this.bumpVx) > 0.001) {
      this.bumpVx *= Math.exp(-5.2 * dt);
      if (Math.abs(this.bumpVx) < 0.01) this.bumpVx = 0;
    }

    // 5. Continuous Groove meter update (cruise, drift, off-road drain).
    if (this.isOffRoad) {
      this.deductGroove(tuning.grooveOffRoadDrainRate * dt, onEvent);
    } else {
      if (this.driftDir !== 0) {
        this.addGroove(tuning.grooveDriftGainRate * dt, tofuActive, onEvent);
      } else if (speedRatio >= 0.55) {
        const cruiseFactor = (speedRatio - 0.5) / 0.5;
        this.addGroove(tuning.grooveCruiseGainRate * cruiseFactor * dt, tofuActive, onEvent);
      }
    }

    // 6. Compute instantaneous normalized accelerations for MelonSoda physics.
    // Includes both lateral velocity change (steering/counter-steering snap) and sustained curve G-load.
    const safeDt = Math.max(1e-4, dt);
    this.longitudinalAccel = (this.speed - prevSpeed) / (maxSpeed * safeDt);
    const rawLatDelta = (netLateralVel - this.prevLateralVel) / (tuning.steerRate * safeDt);
    const latDeltaBlend = 1 - Math.exp(-28 * dt);
    this.smoothedLatDelta += (rawLatDelta - this.smoothedLatDelta) * latDeltaBlend;
    const curveG = segmentCurve * (speedRatio * speedRatio) * 0.28;
    this.lateralAccel = this.smoothedLatDelta * 0.45 + netLateralVel * 0.65 - curveG;
    this.prevLateralVel = netLateralVel;

    const slopeDelta = segmentSlope - this.prevSlope;
    this.prevSlope = segmentSlope;
    this.verticalAccel = (slopeDelta / safeDt) * 0.25;

    // 7. Visual feel: yaw, crest pitch, and road bounce.
    const targetYaw =
      this.driftDir !== 0 ? this.driftDir * 0.65 + this.steer * 0.35 : this.steer * 0.45;
    this.yaw += (targetYaw - this.yaw) * (1 - Math.exp(-12 * dt));

    const targetPitch = Math.max(-1, Math.min(1, -segmentSlope * 3.5 - slopeDelta * 12));
    this.pitch += (targetPitch - this.pitch) * (1 - Math.exp(-10 * dt));

    const bounceFreq = this.isOffRoad ? 38 : 18;
    this.bouncePhase += dt * bounceFreq * (0.2 + speedRatio * 0.8);
  }

  private syncGrooveTier(onEvent?: (event: CarEvent) => void): void {
    const nextTier = evaluateGrooveTier(this.groove, this.grooveTier);
    if (nextTier !== this.grooveTier) {
      const prevTier = this.grooveTier;
      this.grooveTier = nextTier;
      onEvent?.({
        type: 'grooveTierChanged',
        tier: nextTier,
        prevTier,
        groove: this.groove,
      });
    }
  }
}

/**
 * Discrete OutRun 3-state sprite projection tables indexed by `absFrame = Math.abs(frame)` (`0..2`):
 * - `0`: Straight rear view & small steering adjustments (0°)
 * - `1`: Light / medium cornering turn (~18° 3/4 rear-side view)
 * - `2`: Heavy turn / drift powerslide (~34° wide 3/4 side-rear view)
 */
const CAR_REAR_COS = [1.0, 0.9, 0.78] as const;
const CAR_TAIL_SHIFT = [0, 8, 16] as const;
const CAR_SIDE_SPAN = [0, 18, 34] as const;
const CAR_NOSE_LIFT = [0, 6, 12] as const;

/**
 * Computes the discrete 3-state OutRun sprite frame (`-2..+2`) for `car`:
 * - `0`: Straight & small steering adjustments (`|turnSignal| < 0.24` when not drifting).
 * - `±1`: Light/normal cornering turn (`|turnSignal| >= 0.24`).
 * - `±2`: Heavy turn / drift powerslide (`car.driftDir !== 0` or heavy collision yaw).
 */
export function getPlayerCarSpriteFrame(car: PlayerCar): CarSpriteFrame {
  if (car.driftDir !== 0) {
    return (car.driftDir * 2) as CarSpriteFrame;
  }

  const turnSignal = car.yaw * 0.85 + car.steer * 0.2;
  const absSignal = Math.abs(turnSignal);
  if (absSignal < 0.24) return 0;
  const dir = turnSignal > 0 ? 1 : -1;
  if (absSignal < 0.65) return (dir * 1) as CarSpriteFrame;
  return (dir * 2) as CarSpriteFrame;
}

/**
 * Computes the exact projected screen-space coordinates of the player car's rear tires
 * and exhaust tips for the current multi-angle sprite frame (zero allocations).
 */
export function computePlayerCarRearRig(
  car: PlayerCar,
  canvasWidth: number,
  canvasHeight: number,
  out: CarRearRig,
): CarRearRig {
  const speedRatio = Math.min(1, car.speedRatio);
  const bounceAmp = car.isOffRoad ? 3.2 * speedRatio : 0.8 * speedRatio;
  const bounceY = Math.round(Math.sin(car.bouncePhase) * bounceAmp);
  const pitchY = Math.round(car.pitch * 6);

  const frame = getPlayerCarSpriteFrame(car);
  const absFrame = Math.abs(frame);
  const dir = Math.sign(frame);
  const rearCos = CAR_REAR_COS[absFrame]!;
  const tailShift = CAR_TAIL_SHIFT[absFrame]!;

  const cx = Math.round(canvasWidth * 0.5 + car.yaw * 5);
  const baseY = Math.round(canvasHeight - 26 + bounceY + pitchY);
  const rearCenterShift = -dir * tailShift;

  out.centerX = cx + rearCenterShift;
  out.baseY = baseY;
  out.leftTireX = cx + rearCenterShift + Math.round(-30 * rearCos);
  out.rightTireX = cx + rearCenterShift + Math.round(30 * rearCos);
  out.leftExhaustX = cx + rearCenterShift + Math.round(-20 * rearCos);
  out.rightExhaustX = cx + rearCenterShift + Math.round(20 * rearCos);
  out.spriteFrame = frame;
  return out;
}

/**
 * 16-bit pixel-art 1980s Honda City ("Tall-Boy" Boxy Hatchback + Motocompo) multi-angle renderer
 * (AGENTS.md §4.3, §4.4 & §5 M7).
 *
 * Uses a unified 3-station 3D box projection (`Station A` rear tailgate, `Station B` A-pillar cowl,
 * `Station C` stubby front nose) across 3 discrete states per side (`0`, `±1`, `±2`):
 * - Tall, narrow boxy 80s Japanese subcompact silhouette with unpainted black plastic bumpers,
 *   3-color vertical/rectangular 80s tail lamps, single peashooter exhaust, and 12-inch white
 *   turbo-fan steelie wheels.
 * - Large panoramic rear hatchback window revealing the driver and a stowed yellow foldable
 *   Honda Motocompo mini-scooter in the trunk.
 */
export function drawPlayerCar(
  ctx: CanvasRenderingContext2D,
  car: PlayerCar,
  canvasWidth: number,
  canvasHeight: number,
): void {
  const speedRatio = Math.min(1, car.speedRatio);
  const bounceAmp = car.isOffRoad ? 3.2 * speedRatio : 0.8 * speedRatio;
  const bounceY = Math.round(Math.sin(car.bouncePhase) * bounceAmp);
  const pitchY = Math.round(car.pitch * 6);

  const frame = getPlayerCarSpriteFrame(car);
  const absFrame = Math.abs(frame);
  const dir = Math.sign(frame);

  const rearCos = CAR_REAR_COS[absFrame]!;
  const tailShift = CAR_TAIL_SHIFT[absFrame]!;
  const sideSpan = CAR_SIDE_SPAN[absFrame]!;
  const noseLift = CAR_NOSE_LIFT[absFrame]!;

  const cx = Math.round(canvasWidth / 2 + car.yaw * 5);
  const baseY = Math.round(canvasHeight - 26 + bounceY + pitchY);
  const treadPhase = Math.floor(car.bouncePhase * 2.5) & 1;

  ctx.save();
  ctx.translate(cx, baseY);

  // Unified 3-Station 3D Box Geometry for the "Tall-Boy" 80s Hatchback:
  // - Station A (v = 0.00): Rear bumper, tailgate & rear roof header
  // - Station B (v = 0.68): Front A-pillar & windshield cowl
  // - Station C (v = 1.00): Stubby boxy front nose & round/square headlights
  const halfW = Math.round(36 * rearCos);
  const roofHalfW = Math.round(30 * rearCos);
  const noseHalfW = Math.round(33 * rearCos);

  const xA = -dir * tailShift;
  const yA = 0;
  const xB = xA + dir * Math.round(sideSpan * 0.7);
  const yB = -Math.round(noseLift * 0.7);
  const xC = xA + dir * sideSpan;
  const yC = -noseLift;

  const xA_left = xA - halfW;
  const xA_right = xA + halfW;
  const xA_roofLeft = xA - roofHalfW;
  const xA_roofRight = xA + roofHalfW;

  const xA_outer = xA + dir * halfW;
  const xA_inner = xA - dir * halfW;
  const xA_roofOuter = xA + dir * roofHalfW;
  const xA_roofInner = xA - dir * roofHalfW;

  const xB_outer = xB + dir * halfW;
  const xB_roofOuter = xB + dir * roofHalfW;
  const xB_roofInner = xB - dir * roofHalfW;

  const xC_outer = xC + dir * noseHalfW;
  const xC_inner = xC - dir * noseHalfW;

  // Vertical stations (relative to ground at y=0)
  const chassisBotY = -4;
  const bumperTopY = -12;
  const beltlineY = -27;
  const roofTopY = -46;
  const noseTopY = -20;

  // 1. Drift tire smoke puffs (procedural fallback layer supplementing ParticleSystem)
  if (car.isDrifting) {
    const smokeDir = -car.driftDir;
    const leftRearTireX = xA - Math.round(30 * rearCos);
    const rightRearTireX = xA + Math.round(30 * rearCos);
    ctx.fillStyle = car.isOffRoad ? 'rgba(180, 120, 210, 0.35)' : 'rgba(5, 217, 232, 0.38)';
    for (let i = 0; i < 4; i++) {
      const phase = (car.bouncePhase * 0.7 + i * 1.7) % 4;
      const r = Math.round(3 + phase * 3);
      const ox = Math.round(smokeDir * (7 + phase * 8));
      const oy = Math.round(2 - phase * 2.5);
      ctx.fillRect(leftRearTireX + ox - r, oy - r, r * 2, r * 2);
      ctx.fillRect(rightRearTireX + ox - r, oy - r, r * 2, r * 2);
    }
  }

  // 2. Clean dark ground shadow (no orange/yellow lines)
  ctx.fillStyle = 'rgba(8, 2, 20, 0.7)';
  if (absFrame === 0) {
    ctx.fillRect(xA_left - 3, 1, halfW * 2 + 6, 5);
    ctx.fillRect(xA_left + 2, 6, halfW * 2 - 4, 2);
  } else {
    quad(
      ctx,
      xA_inner - dir * 2,
      5,
      xA_outer + dir * 3,
      5,
      xC_outer + dir * 2,
      yC + 3,
      xC_inner,
      yC + 3,
    );
  }

  // 3. Narrow 12-inch 80s rear tires (drawn before side flank so exposed side wheel sits cleanly on top)
  const tireW = Math.max(9, Math.round(12 * rearCos));
  const leftTireX = xA_left + 1;
  const rightTireX = xA_right - tireW - 1;
  ctx.fillStyle = '#12091f';
  ctx.fillRect(leftTireX, -13, tireW, 15);
  ctx.fillRect(rightTireX, -13, tireW, 15);

  ctx.fillStyle = treadPhase === 0 ? '#2b1847' : '#1e1035';
  const treadW = Math.max(4, tireW - 4);
  for (let ty = -11; ty <= -3; ty += 4) {
    ctx.fillRect(leftTireX + 2, ty + treadPhase, treadW, 2);
    ctx.fillRect(rightTireX + 2, ty + treadPhase, treadW, 2);
  }

  // 4. 3/4 Perspective Front Hood, Roof Top & Tall Side Panel (when turning or drifting: absFrame >= 1)
  if (absFrame >= 1) {
    // 4a. Stubby sloped Honda City front hood (Station B beltline -> Station C nose)
    ctx.fillStyle = '#e01e60';
    quad(
      ctx,
      xB - dir * Math.round(halfW * 0.7),
      yB + beltlineY,
      xB_outer,
      yB + beltlineY,
      xC_outer,
      yC + noseTopY,
      xC_inner + dir * Math.round(noseHalfW * 0.35),
      yC + noseTopY,
    );

    // Iconic Honda City asymmetrical hood air scoop / louver bulge
    const scoopX1 = Math.round((xB_outer + xC_outer) * 0.5) - dir * Math.round(8 * rearCos);
    const scoopY1 = Math.round((yB + beltlineY + yC + noseTopY) * 0.5) - 1;
    ctx.fillStyle = '#180a2e';
    ctx.fillRect(
      Math.min(scoopX1, scoopX1 + dir * 7),
      scoopY1,
      Math.max(4, Math.abs(dir * 7)),
      3,
    );

    // 4b. 3D Boxy Roof Top Quad (Station A roof -> Station B windshield header)
    ctx.fillStyle = '#ff5c93';
    quad(
      ctx,
      xA_roofInner,
      yA + roofTopY,
      xA_roofOuter,
      yA + roofTopY,
      xB_roofOuter,
      yB + roofTopY + 1,
      xB_roofInner,
      yB + roofTopY + 1,
    );
    // Black rubber roof drip-rail molding along outer roof edge
    ctx.fillStyle = '#180a2e';
    quad(
      ctx,
      xA_roofOuter - dir,
      yA + roofTopY,
      xA_roofOuter,
      yA + roofTopY,
      xB_roofOuter,
      yB + roofTopY + 1,
      xB_roofOuter - dir,
      yB + roofTopY + 1,
    );

    // 4c. Tall Side Greenhouse Frame (Station A beltline..roof -> Station B beltline..roof)
    ctx.fillStyle = '#d91b5c';
    quad(
      ctx,
      xA_outer,
      yA + beltlineY,
      xA_roofOuter,
      yA + roofTopY,
      xB_roofOuter,
      yB + roofTopY + 1,
      xB_outer,
      yB + beltlineY,
    );

    // Two tall 80s side windows (Rear quarter window + Front door window separated by B-pillar)
    const winRearBotX1 = Math.round(xA_outer + (xB_outer - xA_outer) * 0.1);
    const winRearBotY1 = Math.round(yA + beltlineY - 2 + (yB - yA) * 0.1);
    const winRearBotX2 = Math.round(xA_outer + (xB_outer - xA_outer) * 0.46);
    const winRearBotY2 = Math.round(yA + beltlineY - 2 + (yB - yA) * 0.46);
    const winRearTopX2 = Math.round(xA_roofOuter + (xB_roofOuter - xA_roofOuter) * 0.46);
    const winRearTopY2 = Math.round(yA + roofTopY + 3 + (yB - yA) * 0.46);
    const winRearTopX1 = Math.round(xA_roofOuter + (xB_roofOuter - xA_roofOuter) * 0.12);
    const winRearTopY1 = Math.round(yA + roofTopY + 3 + (yB - yA) * 0.12);

    ctx.fillStyle = '#160a2c';
    quad(
      ctx,
      winRearBotX1,
      winRearBotY1,
      winRearBotX2,
      winRearBotY2,
      winRearTopX2,
      winRearTopY2,
      winRearTopX1,
      winRearTopY1,
    );

    const winFrontBotX1 = Math.round(xA_outer + (xB_outer - xA_outer) * 0.54);
    const winFrontBotY1 = Math.round(yA + beltlineY - 2 + (yB - yA) * 0.54);
    const winFrontBotX2 = Math.round(xA_outer + (xB_outer - xA_outer) * 0.9);
    const winFrontBotY2 = Math.round(yA + beltlineY - 2 + (yB - yA) * 0.9);
    const winFrontTopX2 = Math.round(xA_roofOuter + (xB_roofOuter - xA_roofOuter) * 0.88);
    const winFrontTopY2 = Math.round(yA + roofTopY + 3 + (yB - yA) * 0.88);
    const winFrontTopX1 = Math.round(xA_roofOuter + (xB_roofOuter - xA_roofOuter) * 0.54);
    const winFrontTopY1 = Math.round(yA + roofTopY + 3 + (yB - yA) * 0.54);

    quad(
      ctx,
      winFrontBotX1,
      winFrontBotY1,
      winFrontBotX2,
      winFrontBotY2,
      winFrontTopX2,
      winFrontTopY2,
      winFrontTopX1,
      winFrontTopY1,
    );

    // Cyan sky reflection bar at top of both side windows
    ctx.fillStyle = '#05d9e8';
    quad(
      ctx,
      winRearTopX1,
      winRearTopY1,
      winRearTopX2,
      winRearTopY2,
      winRearTopX2,
      winRearTopY2 + 2,
      winRearTopX1,
      winRearTopY1 + 2,
    );
    quad(
      ctx,
      winFrontTopX1,
      winFrontTopY1,
      winFrontTopX2,
      winFrontTopY2,
      winFrontTopX2,
      winFrontTopY2 + 2,
      winFrontTopX1,
      winFrontTopY1 + 2,
    );

    // 4d. Lower Side Doors & Front Fender Panel (Station A -> Station B -> Station C)
    ctx.fillStyle = '#e01e60';
    ctx.beginPath();
    ctx.moveTo(xA_outer, yA + chassisBotY);
    ctx.lineTo(xA_outer, yA + beltlineY);
    ctx.lineTo(xB_outer, yB + beltlineY);
    ctx.lineTo(xC_outer, yC + noseTopY);
    ctx.lineTo(xC_outer, yC + chassisBotY);
    ctx.closePath();
    ctx.fill();

    // Crisp beltline shoulder highlight along exposed side
    ctx.fillStyle = '#ff70a6';
    quad(
      ctx,
      xA_outer,
      yA + beltlineY,
      xB_outer,
      yB + beltlineY,
      xB_outer,
      yB + beltlineY + 2,
      xA_outer,
      yA + beltlineY + 2,
    );

    // White/silver 80s lower door decal stripe ("CITY R" two-tone accent)
    ctx.fillStyle = '#eef6ff';
    quad(
      ctx,
      xA_outer,
      yA - 13,
      xC_outer,
      yC - 13,
      xC_outer,
      yC - 10,
      xA_outer,
      yA - 10,
    );

    // Unpainted matte-black 80s plastic side rub-strip & wrap-around bumper ends
    ctx.fillStyle = '#180c29';
    quad(
      ctx,
      xA_outer,
      yA - 17,
      xC_outer,
      yC - 16,
      xC_outer,
      yC - 13,
      xA_outer,
      yA - 14,
    );
    // Lower black rocker sill & front bumper wrap
    quad(
      ctx,
      xA_outer,
      yA + chassisBotY,
      xC_outer,
      yC + chassisBotY,
      xC_outer,
      yC - 9,
      xA_outer,
      yA - 9,
    );

    // Amber front corner blinker & bright round headlight on nose tip (Station C)
    const lampX = dir > 0 ? xC_outer - 3 : xC_outer;
    ctx.fillStyle = '#e0fbfc';
    ctx.fillRect(lampX, yC + noseTopY + 2, 3, 4);
    ctx.fillStyle = '#ff9e00';
    ctx.fillRect(lampX, yC + noseTopY + 6, 3, 3);

    // Boxy black plastic 80s door mirror at A-pillar (Station B)
    const mirrorX = dir > 0 ? xB_outer - 2 : xB_outer - 3;
    ctx.fillStyle = '#180c29';
    ctx.fillRect(mirrorX, yB + beltlineY - 4, 5, 4);
    ctx.fillStyle = '#05d9e8';
    ctx.fillRect(mirrorX + 1, yB + beltlineY - 3, 3, 2);

    // 4e. Small 12-inch Side Wheels with iconic white 80s 4-lug turbo-fan / steelie covers
    const wheelW = Math.max(6, Math.round(5 + absFrame * 2.5));
    const rearWheelX = Math.round(xA_outer + (xC_outer - xA_outer) * 0.18);
    const rearWheelY = Math.round(yA - 6 + (yC - yA) * 0.18);
    const steerShift = Math.round(car.steer * 2);
    const frontWheelX = Math.round(xA_outer + (xC_outer - xA_outer) * 0.8) + steerShift;
    const frontWheelY = Math.round(yA - 6 + (yC - yA) * 0.8);

    // Rear side wheel arch & white 80s wheel cover
    ctx.fillStyle = '#12091f';
    ctx.fillRect(rearWheelX - Math.floor(wheelW * 0.5), rearWheelY - 7, wheelW, 14);
    ctx.fillStyle = treadPhase === 0 ? '#eef6ff' : '#c8ddf2';
    ctx.fillRect(
      rearWheelX - Math.max(1, Math.floor(wheelW * 0.32)),
      rearWheelY - 4,
      Math.max(2, Math.round(wheelW * 0.64)),
      8,
    );
    ctx.fillStyle = '#180c29';
    ctx.fillRect(rearWheelX - 1, rearWheelY - 1 + treadPhase, 2, 2);

    // Front side wheel arch & white 80s wheel cover
    const frontW = Math.max(5, wheelW - 1);
    ctx.fillStyle = '#12091f';
    ctx.fillRect(frontWheelX - Math.floor(frontW * 0.5), frontWheelY - 6, frontW, 12);
    ctx.fillStyle = treadPhase === 0 ? '#c8ddf2' : '#eef6ff';
    ctx.fillRect(
      frontWheelX - Math.max(1, Math.floor(frontW * 0.32)),
      frontWheelY - 3,
      Math.max(2, Math.round(frontW * 0.64)),
      6,
    );
  }

  // 5. Rear Face — Tall Greenhouse & Panoramic Hatchback Window (Station A: y = -27..-46)
  ctx.fillStyle = '#ff2a6d';
  trapezoid(
    ctx,
    xA_left,
    beltlineY,
    halfW * 2,
    xA_roofLeft,
    roofTopY,
    roofHalfW * 2,
  );

  // Flat boxy roof cap highlight & center tiny radio antenna
  ctx.fillStyle = '#ff70a6';
  ctx.fillRect(xA_roofLeft + 1, roofTopY, roofHalfW * 2 - 2, 2);
  ctx.fillStyle = '#c8ddf2';
  ctx.fillRect(xA - 1, roofTopY - 4, 2, 4);

  // Large rear hatchback glass window with black rubber weatherstrip
  const glassBotHalfW = Math.max(10, halfW - 4);
  const glassTopHalfW = Math.max(8, roofHalfW - 4);
  ctx.fillStyle = '#140824';
  trapezoid(
    ctx,
    xA - glassBotHalfW - 1,
    beltlineY - 1,
    (glassBotHalfW + 1) * 2,
    xA - glassTopHalfW - 1,
    roofTopY + 2,
    (glassTopHalfW + 1) * 2,
  );
  ctx.fillStyle = '#180c30';
  trapezoid(
    ctx,
    xA - glassBotHalfW,
    beltlineY - 2,
    glassBotHalfW * 2,
    xA - glassTopHalfW,
    roofTopY + 3,
    glassTopHalfW * 2,
  );

  // Diagonal cyan glass reflection on the left side of the rear window
  ctx.fillStyle = 'rgba(5, 217, 232, 0.28)';
  quad(
    ctx,
    xA - glassBotHalfW + 2,
    beltlineY - 3,
    xA - Math.round(glassBotHalfW * 0.35),
    beltlineY - 3,
    xA - Math.round(glassTopHalfW * 0.15),
    roofTopY + 4,
    xA - glassTopHalfW + 2,
    roofTopY + 4,
  );

  // Driver head & headrest silhouette inside cabin (left-hand side)
  const drvX = xA - Math.round(12 * rearCos);
  const drvW = Math.max(6, Math.round(10 * rearCos));
  ctx.fillStyle = '#100520';
  ctx.fillRect(drvX - Math.floor(drvW * 0.5), -41, drvW, 11);
  ctx.fillStyle = '#05d9e8';
  ctx.fillRect(drvX - Math.max(2, Math.floor(drvW * 0.35)), -39, Math.max(4, drvW - 3), 2);

  // Iconic Foldable Yellow HONDA MOTOCOMPO Scooter stowed inside the rear trunk!
  const motoW = Math.max(10, Math.round(22 * rearCos));
  const motoX = xA + Math.round(3 * rearCos);
  const motoY = -36;
  // Folded dark handlebar & seat top bar
  ctx.fillStyle = '#100520';
  ctx.fillRect(motoX + 1, motoY - 2, Math.max(6, motoW - 3), 2);
  // Boxy yellow Motocompo shell
  ctx.fillStyle = '#ffd319';
  ctx.fillRect(motoX, motoY, motoW, 7);
  // White/black Honda side stripe & vents on the Motocompo box
  ctx.fillStyle = '#180c29';
  ctx.fillRect(motoX + 2, motoY + 2, Math.max(6, motoW - 4), 2);
  ctx.fillStyle = '#eef6ff';
  ctx.fillRect(motoX + 3, motoY + 2, Math.max(3, Math.round(motoW * 0.45)), 1);
  // Tiny red tail-light on the back of the Motocompo
  ctx.fillStyle = '#ff2a6d';
  ctx.fillRect(motoX + motoW - 3, motoY + 1, 2, 2);

  // Rear window wiper blade (classic 80s hatchback detail)
  ctx.fillStyle = '#100520';
  ctx.fillRect(xA - Math.round(14 * rearCos), beltlineY - 3, Math.round(16 * rearCos), 1);

  // 6. Rear Face — Lower Boxy Tailgate Sheetmetal (Station A: y = -12..-27)
  ctx.fillStyle = '#ff2a6d';
  ctx.fillRect(xA_left, beltlineY, halfW * 2, beltlineY ? 15 : 15);

  // Upper tailgate crease highlight right under the rear window
  ctx.fillStyle = '#ff70a6';
  ctx.fillRect(xA_left + 1, beltlineY, halfW * 2 - 2, 2);

  // White/silver lower two-tone stripe across the bottom of the tailgate
  ctx.fillStyle = '#eef6ff';
  ctx.fillRect(xA_left + 1, -14, halfW * 2 - 2, 2);

  // Matte-black 80s plastic tailgate garnish bar between the tail lamps
  const garnishW = Math.round(68 * rearCos);
  ctx.fillStyle = '#180c29';
  ctx.fillRect(xA - Math.round(garnishW * 0.5), -25, garnishW, 10);

  // 7. Classic 80s 3-Color Boxy Tail Lamp Clusters (Red Brake / Amber Turn / White Reverse)
  const lampW = Math.max(9, Math.round(16 * rearCos));
  const leftLampX = xA_left + 2;
  const rightLampX = xA_right - lampW - 2;

  // Top Red Brake/Tail section
  ctx.fillStyle = car.braking ? '#ff0055' : '#d91b5c';
  ctx.fillRect(leftLampX, -24, lampW, 4);
  ctx.fillRect(rightLampX, -24, lampW, 4);
  ctx.fillStyle = car.braking ? '#fff3b0' : '#ff5c93';
  ctx.fillRect(leftLampX + 2, -23, Math.max(4, lampW - 4), 2);
  ctx.fillRect(rightLampX + 2, -23, Math.max(4, lampW - 4), 2);

  // Middle Amber 80s Turn-Signal strip
  ctx.fillStyle = '#ff9e00';
  ctx.fillRect(leftLampX, -20, lampW, 2);
  ctx.fillRect(rightLampX, -20, lampW, 2);

  // Bottom Crisp White Reverse lamp strip
  ctx.fillStyle = '#e0fbfc';
  ctx.fillRect(leftLampX, -18, lampW, 2);
  ctx.fillRect(rightLampX, -18, lampW, 2);

  // Brake light bloom halo when braking
  if (car.braking) {
    ctx.fillStyle = 'rgba(255, 42, 109, 0.38)';
    ctx.fillRect(leftLampX - 2, -26, lampW + 4, 11);
    ctx.fillRect(rightLampX - 2, -26, lampW + 4, 11);
  }

  // 8. Center JDM Compact License Plate & "CITY" pixel badge in the tailgate recess
  const plateW = Math.max(11, Math.round(18 * rearCos));
  const plateX = xA - Math.round(plateW * 0.5);
  ctx.fillStyle = '#e0fbfc';
  ctx.fillRect(plateX, -23, plateW, 8);
  ctx.fillStyle = '#0d0221';
  ctx.fillRect(plateX + 2, -21, Math.max(7, plateW - 4), 4);
  ctx.fillStyle = '#05d9e8';
  ctx.fillRect(plateX + 3, -20, Math.max(2, Math.round(4 * rearCos)), 2);
  ctx.fillRect(
    plateX + plateW - Math.max(2, Math.round(4 * rearCos)) - 3,
    -20,
    Math.max(2, Math.round(4 * rearCos)),
    2,
  );

  // 9. Unpainted Matte-Black 80s Plastic Rear Bumper & Single Peashooter Exhaust Pipe
  const bumperHalfW = halfW + 1;
  ctx.fillStyle = '#1b102e';
  ctx.fillRect(xA - bumperHalfW, bumperTopY, bumperHalfW * 2, 8);
  // Bumper top step highlight & recessed impact groove
  ctx.fillStyle = '#32204f';
  ctx.fillRect(xA - bumperHalfW + 1, bumperTopY, bumperHalfW * 2 - 2, 1);
  ctx.fillStyle = '#10071f';
  ctx.fillRect(xA - bumperHalfW + 2, -8, bumperHalfW * 2 - 4, 2);

  // Single small 80s peashooter exhaust pipe under right side of rear bumper
  const exX = xA + Math.round(20 * rearCos);
  ctx.fillStyle = '#c8ddf2';
  ctx.fillRect(exX - 2, -4, 4, 4);
  ctx.fillStyle = '#10071f';
  ctx.fillRect(exX - 1, -3, 2, 2);

  ctx.restore();
}

function trapezoid(
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  w1: number,
  x2: number,
  y2: number,
  w2: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x1 + w1, y1);
  ctx.lineTo(x2 + w2, y2);
  ctx.lineTo(x2, y2);
  ctx.closePath();
  ctx.fill();
}

function quad(
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  x3: number,
  y3: number,
  x4: number,
  y4: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.lineTo(x3, y3);
  ctx.lineTo(x4, y4);
  ctx.closePath();
  ctx.fill();
}
