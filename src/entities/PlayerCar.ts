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
}

export type DriftDirection = -1 | 0 | 1;

/**
 * Discrete OutRun-style multi-angle sprite frame index for the player car:
 * - `0`: dead-on symmetric rear view
 * - `±1`: slight cornering turn (~12° 3/4 rear view)
 * - `±2`: hard cornering turn (~24° 3/4 rear-side view exposing side strakes & front wheel)
 * - `±3`: drift powerslide (~36° wide 3/4 side-rear view)
 * - `±4`: deep / charged drift powerslide (~44° extreme OutRun 2 slide)
 */
export type CarSpriteFrame = -4 | -3 | -2 | -1 | 0 | 1 | 2 | 3 | 4;

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
    this.yaw = Math.max(-1.2, Math.min(1.2, this.yaw + Math.sign(lateralVelocityImpulse) * 0.55));
    if (Math.abs(lateralVelocityImpulse) > 2.0) {
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
      this.speed -= maxSpeed * (tuning.brakeRate + Math.max(0, slopeDragRate)) * dt;
    } else if (this.isOffRoad && this.speed > offRoadCap) {
      // Off-road grass drags speed down toward offRoadCap even if throttle is held
      // (Design Pillar 3: slows down noticeably, never forces a dead stop).
      this.speed = Math.max(offRoadCap, this.speed - maxSpeed * tuning.offRoadDecelRate * dt);
    } else if (controls.accelerate) {
      const targetCap = this.isOffRoad ? Math.min(offRoadCap, gearTopSpeed) : gearTopSpeed;
      if (this.speed <= targetCap) {
        const torque = this.gearbox.getTorqueFactor(this.speed, maxSpeed);
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

    // 2. Smooth steering input.
    const rawSteer = (controls.right ? 1 : 0) - (controls.left ? 1 : 0);
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
    const latVelDelta = (netLateralVel - this.prevLateralVel) / (tuning.steerRate * safeDt);
    const curveG = segmentCurve * (speedRatio * speedRatio) * 0.28;
    this.lateralAccel = latVelDelta * 0.45 + netLateralVel * 0.65 - curveG;
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
 * Discrete OutRun sprite projection tables indexed by `absFrame = Math.abs(frame)` (`0..4`):
 * - `0`: Straight rear view (0°)
 * - `1`: Slight turn (~12° 3/4 rear)
 * - `2`: Hard turn (~24° 3/4 rear-side exposing side strakes, front wheel & hood)
 * - `3`: Drift powerslide (~36° wide 3/4 side-rear view)
 * - `4`: Extreme / charged drift (~44° full OutRun 2 sideways slide)
 */
const CAR_REAR_COS = [1.0, 0.95, 0.86, 0.75, 0.66] as const;
const CAR_TAIL_SHIFT = [0, 5, 11, 18, 24] as const;
const CAR_SIDE_SPAN = [0, 11, 24, 38, 48] as const;
const CAR_NOSE_LIFT = [0, 4, 9, 14, 18] as const;
const CAR_REAR_TILT_Y = [0, 1, 2, 3, 4] as const;

/**
 * Computes the discrete OutRun sprite frame (`-4..+4`) for `car` based on steering, yaw,
 * and active drift state.
 *
 * - Normal steering selects frames `-2..+2` (or `±3` on heavy collision yaw).
 * - Drifting immediately enters frame `±3` (wide powerslide) and steps up to `±4`
 *   on sustained/charged drifts (`driftTime >= 0.35s`) or inward drift steer.
 */
export function getPlayerCarSpriteFrame(car: PlayerCar): CarSpriteFrame {
  if (car.driftDir !== 0) {
    const dir = car.driftDir;
    const deepDrift = car.driftTime >= 0.35 || car.steer * dir >= 0.22;
    return (dir * (deepDrift ? 4 : 3)) as CarSpriteFrame;
  }

  const turnSignal = car.yaw * 0.85 + car.steer * 0.25;
  const absSignal = Math.abs(turnSignal);
  if (absSignal < 0.07) return 0;
  const dir = turnSignal > 0 ? 1 : -1;
  if (absSignal < 0.24) return (dir * 1) as CarSpriteFrame;
  if (absSignal < 0.72) return (dir * 2) as CarSpriteFrame;
  return (dir * 3) as CarSpriteFrame;
}

/**
 * Computes the exact projected screen-space coordinates of the player car's rear tires
 * and quad exhaust tips for the current multi-angle sprite frame (zero allocations).
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
  out.leftTireX = cx + rearCenterShift + Math.round(-42 * rearCos);
  out.rightTireX = cx + rearCenterShift + Math.round(42 * rearCos);
  out.leftExhaustX = cx + rearCenterShift + Math.round(-26 * rearCos);
  out.rightExhaustX = cx + rearCenterShift + Math.round(26 * rearCos);
  out.spriteFrame = frame;
  return out;
}

function projCarX(
  u: number,
  v: number,
  rearCos: number,
  tailShift: number,
  sideSpan: number,
  dir: number,
): number {
  const halfW = (50 - v * 8) * rearCos;
  const centerShift = dir * (-tailShift + v * (tailShift + sideSpan + 8 * rearCos));
  return Math.round(u * halfW + centerShift);
}

function projCarY(
  u: number,
  ly: number,
  v: number,
  noseLift: number,
  rearTiltY: number,
  dir: number,
): number {
  const perspScale = 1 - v * 0.16;
  const tilt = u * dir * rearTiltY * (1 - v * 0.45);
  return Math.round(ly * perspScale - v * noseLift - tilt);
}

/**
 * 16-bit pixel-art 80s Testarossa Spider convertible multi-angle renderer
 * (AGENTS.md §4.3, §4.4 & §5 M7).
 *
 * Switches across 9 discrete OutRun perspective sprite frames (`-4..+4`) as the player
 * steers or drifts, exposing the full 3/4 side flank, Pininfarina side door strakes,
 * front & rear alloy wheels, wedge nose hood, and foreshortened rear panel.
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
  const rearTiltY = CAR_REAR_TILT_Y[absFrame]!;

  const cx = Math.round(canvasWidth / 2 + car.yaw * 5);
  const baseY = Math.round(canvasHeight - 26 + bounceY + pitchY);
  const treadPhase = Math.floor(car.bouncePhase * 2.5) & 1;

  ctx.save();
  ctx.translate(cx, baseY);
  ctx.rotate(car.yaw * 0.02);

  // Rear face helper coordinates at v = 0
  const rearShift = -dir * tailShift;
  const rearHalfW = Math.round(50 * rearCos);

  // 1. Drift tire smoke puffs (procedural fallback layer supplementing ParticleSystem)
  if (car.isDrifting) {
    const smokeDir = -car.driftDir;
    const leftRearTireX = rearShift - Math.round(41 * rearCos);
    const rightRearTireX = rearShift + Math.round(41 * rearCos);
    ctx.fillStyle = car.isOffRoad ? 'rgba(180, 120, 210, 0.35)' : 'rgba(5, 217, 232, 0.38)';
    for (let i = 0; i < 4; i++) {
      const phase = (car.bouncePhase * 0.7 + i * 1.7) % 4;
      const r = Math.round(3 + phase * 3);
      const ox = Math.round(smokeDir * (8 + phase * 9));
      const oy = Math.round(2 - phase * 2.5);
      ctx.fillRect(leftRearTireX + ox - r, oy - r, r * 2, r * 2);
      ctx.fillRect(rightRearTireX + ox - r, oy - r, r * 2, r * 2);
    }
  }

  // 2. Multi-angle ground shadow + HIGH/SSS Groove neon underglow
  ctx.fillStyle = 'rgba(8, 2, 20, 0.7)';
  if (absFrame === 0) {
    ctx.fillRect(-54, 1, 108, 6);
    ctx.fillRect(-48, 7, 96, 3);
  } else {
    quad(
      ctx,
      projCarX(-1.06, 0, rearCos, tailShift, sideSpan, dir),
      projCarY(-1.06, 6, 0, noseLift, rearTiltY, dir),
      projCarX(1.06, 0, rearCos, tailShift, sideSpan, dir),
      projCarY(1.06, 6, 0, noseLift, rearTiltY, dir),
      projCarX(1.04, 0.94, rearCos, tailShift, sideSpan, dir),
      projCarY(1.04, 3, 0.94, noseLift, rearTiltY, dir),
      projCarX(-1.04, 0.94, rearCos, tailShift, sideSpan, dir),
      projCarY(-1.04, 3, 0.94, noseLift, rearTiltY, dir),
    );
  }

  if (car.grooveTier === 'SSS' || car.grooveTier === 'HIGH') {
    ctx.fillStyle =
      car.grooveTier === 'SSS' ? 'rgba(255, 211, 25, 0.44)' : 'rgba(5, 217, 232, 0.36)';
    ctx.fillRect(rearShift - Math.round(44 * rearCos), 2, Math.round(88 * rearCos), 4);
    if (absFrame >= 1) {
      // Side-skirt neon underglow strip along the exposed flank
      quad(
        ctx,
        projCarX(dir * 0.98, 0.05, rearCos, tailShift, sideSpan, dir),
        projCarY(dir * 0.98, 2, 0.05, noseLift, rearTiltY, dir),
        projCarX(dir * 1.05, 0.05, rearCos, tailShift, sideSpan, dir),
        projCarY(dir * 1.05, 4, 0.05, noseLift, rearTiltY, dir),
        projCarX(dir * 1.05, 0.9, rearCos, tailShift, sideSpan, dir),
        projCarY(dir * 1.05, 3, 0.9, noseLift, rearTiltY, dir),
        projCarX(dir * 0.98, 0.9, rearCos, tailShift, sideSpan, dir),
        projCarY(dir * 0.98, 1, 0.9, noseLift, rearTiltY, dir),
      );
    }
  }

  // 3. Wedge front hood & pop-up headlights (visible in 3/4 cornering & drift frames ±1..±4)
  if (absFrame >= 1) {
    // Sloped Pininfarina front hood
    ctx.fillStyle = '#e01e60';
    quad(
      ctx,
      projCarX(-0.78, 0.52, rearCos, tailShift, sideSpan, dir),
      projCarY(-0.78, -32, 0.52, noseLift, rearTiltY, dir),
      projCarX(0.78, 0.52, rearCos, tailShift, sideSpan, dir),
      projCarY(0.78, -32, 0.52, noseLift, rearTiltY, dir),
      projCarX(0.92, 0.96, rearCos, tailShift, sideSpan, dir),
      projCarY(0.92, -15, 0.96, noseLift, rearTiltY, dir),
      projCarX(-0.92, 0.96, rearCos, tailShift, sideSpan, dir),
      projCarY(-0.92, -15, 0.96, noseLift, rearTiltY, dir),
    );

    // Center hood recessed vent & pop-up headlight seam on exposed nose corner
    ctx.fillStyle = '#9e1446';
    quad(
      ctx,
      projCarX(-0.35, 0.62, rearCos, tailShift, sideSpan, dir),
      projCarY(-0.35, -27, 0.62, noseLift, rearTiltY, dir),
      projCarX(0.35, 0.62, rearCos, tailShift, sideSpan, dir),
      projCarY(0.35, -27, 0.62, noseLift, rearTiltY, dir),
      projCarX(0.35, 0.86, rearCos, tailShift, sideSpan, dir),
      projCarY(0.35, -18, 0.86, noseLift, rearTiltY, dir),
      projCarX(-0.35, 0.86, rearCos, tailShift, sideSpan, dir),
      projCarY(-0.35, -18, 0.86, noseLift, rearTiltY, dir),
    );
  }

  // 4. Open-top Spider cockpit: wrap-around windshield + Driver (always in left seat)
  const wsBaseLeftX = projCarX(-0.68, 0.34, rearCos, tailShift, sideSpan, dir);
  const wsBaseLeftY = projCarY(-0.68, -32, 0.34, noseLift, rearTiltY, dir);
  const wsBaseRightX = projCarX(0.68, 0.34, rearCos, tailShift, sideSpan, dir);
  const wsBaseRightY = projCarY(0.68, -32, 0.34, noseLift, rearTiltY, dir);
  const wsTopLeftX = projCarX(-0.54, 0.5, rearCos, tailShift, sideSpan, dir);
  const wsTopLeftY = projCarY(-0.54, -44, 0.5, noseLift, rearTiltY, dir);
  const wsTopRightX = projCarX(0.54, 0.5, rearCos, tailShift, sideSpan, dir);
  const wsTopRightY = projCarY(0.54, -44, 0.5, noseLift, rearTiltY, dir);

  ctx.fillStyle = '#180a2e';
  quad(
    ctx,
    wsBaseLeftX,
    wsBaseLeftY,
    wsBaseRightX,
    wsBaseRightY,
    wsTopRightX,
    wsTopRightY,
    wsTopLeftX,
    wsTopLeftY,
  );

  // Cyan top windshield header & glass glare
  ctx.fillStyle = '#05d9e8';
  quad(
    ctx,
    wsTopLeftX + 1,
    wsTopLeftY,
    wsTopRightX - 1,
    wsTopRightY,
    wsTopRightX - 1,
    wsTopRightY + 2,
    wsTopLeftX + 1,
    wsTopLeftY + 2,
  );
  ctx.globalAlpha = 0.45;
  quad(
    ctx,
    wsBaseLeftX + 4,
    wsBaseLeftY - 1,
    Math.round((wsBaseLeftX + wsBaseRightX) * 0.5),
    wsBaseRightY - 1,
    Math.round((wsTopLeftX + wsTopRightX) * 0.46),
    wsTopRightY + 2,
    wsTopLeftX + 3,
    wsTopLeftY + 2,
  );
  ctx.globalAlpha = 1;

  // Driver silhouette in left-hand seat (u = -0.36, v = 0.32) with retro cyan visor shades
  const drvX = projCarX(-0.36, 0.32, rearCos, tailShift, sideSpan, dir);
  const drvY = projCarY(-0.36, -39, 0.32, noseLift, rearTiltY, dir);
  ctx.fillStyle = '#120624';
  ctx.fillRect(drvX - 5, drvY, 10, 8);
  ctx.fillStyle = '#05d9e8';
  ctx.fillRect(drvX - 3, drvY + 3, 6, 2);

  // Center rear-view mirror
  const mirX = projCarX(0, 0.44, rearCos, tailShift, sideSpan, dir);
  const mirY = projCarY(0, -41, 0.44, noseLift, rearTiltY, dir);
  ctx.fillStyle = '#f6e7ff';
  ctx.fillRect(mirX - 3, mirY, 6, 2);

  // 5. Upper engine deck & convertible tonneau cover (v = 0.0..0.34)
  const deckRearLeftX = projCarX(-0.88, 0, rearCos, tailShift, sideSpan, dir);
  const deckRearLeftY = projCarY(-0.88, -28, 0, noseLift, rearTiltY, dir);
  const deckRearRightX = projCarX(0.88, 0, rearCos, tailShift, sideSpan, dir);
  const deckRearRightY = projCarY(0.88, -28, 0, noseLift, rearTiltY, dir);
  const deckFrontLeftX = projCarX(-0.66, 0.34, rearCos, tailShift, sideSpan, dir);
  const deckFrontLeftY = projCarY(-0.66, -40, 0.34, noseLift, rearTiltY, dir);
  const deckFrontRightX = projCarX(0.66, 0.34, rearCos, tailShift, sideSpan, dir);
  const deckFrontRightY = projCarY(0.66, -40, 0.34, noseLift, rearTiltY, dir);

  ctx.fillStyle = '#d91b5c';
  quad(
    ctx,
    deckRearLeftX,
    deckRearLeftY,
    deckRearRightX,
    deckRearRightY,
    deckFrontRightX,
    deckFrontRightY,
    deckFrontLeftX,
    deckFrontLeftY,
  );

  // Mid-engine cooling vents on rear deck
  ctx.fillStyle = '#240b36';
  for (let i = 0; i < 3; i++) {
    const v = 0.08 + i * 0.08;
    const ly = -31 - i * 3;
    const vx1 = projCarX(-0.28, v, rearCos, tailShift, sideSpan, dir);
    const vx2 = projCarX(0.28, v, rearCos, tailShift, sideSpan, dir);
    const vy = projCarY(0, ly, v, noseLift, rearTiltY, dir);
    ctx.fillRect(Math.min(vx1, vx2), vy, Math.max(4, Math.abs(vx2 - vx1)), 2);
  }

  // 6. Exposed 3/4 Side Flank (drawn when turning or drifting: absFrame >= 1)
  if (absFrame >= 1) {
    const sideU = dir;
    const sRearBotX = projCarX(sideU, 0, rearCos, tailShift, sideSpan, dir);
    const sRearBotY = projCarY(sideU, -4, 0, noseLift, rearTiltY, dir);
    const sRearTopX = projCarX(sideU * 0.88, 0, rearCos, tailShift, sideSpan, dir);
    const sRearTopY = projCarY(sideU * 0.88, -28, 0, noseLift, rearTiltY, dir);
    const sMidTopX = projCarX(sideU * 0.86, 0.52, rearCos, tailShift, sideSpan, dir);
    const sMidTopY = projCarY(sideU * 0.86, -31, 0.52, noseLift, rearTiltY, dir);
    const sNoseTopX = projCarX(sideU * 0.92, 0.96, rearCos, tailShift, sideSpan, dir);
    const sNoseTopY = projCarY(sideU * 0.92, -15, 0.96, noseLift, rearTiltY, dir);
    const sNoseBotX = projCarX(sideU * 0.94, 0.96, rearCos, tailShift, sideSpan, dir);
    const sNoseBotY = projCarY(sideU * 0.94, -5, 0.96, noseLift, rearTiltY, dir);

    // Main side body flank (rear quarter + door + front fender wedge)
    ctx.fillStyle = '#e01e60';
    ctx.beginPath();
    ctx.moveTo(sRearBotX, sRearBotY);
    ctx.lineTo(sRearTopX, sRearTopY);
    ctx.lineTo(sMidTopX, sMidTopY);
    ctx.lineTo(sNoseTopX, sNoseTopY);
    ctx.lineTo(sNoseBotX, sNoseBotY);
    ctx.closePath();
    ctx.fill();

    // Upper fender crest highlight along the exposed flank
    ctx.fillStyle = '#ff70a6';
    quad(
      ctx,
      sRearTopX,
      sRearTopY,
      sMidTopX,
      sMidTopY,
      sMidTopX,
      sMidTopY + 2,
      sRearTopX,
      sRearTopY + 2,
    );

    // Lower black aerodynamic side skirt
    ctx.fillStyle = '#1f0d33';
    quad(
      ctx,
      sRearBotX,
      sRearBotY,
      sNoseBotX,
      sNoseBotY,
      projCarX(sideU * 0.94, 0.96, rearCos, tailShift, sideSpan, dir),
      projCarY(sideU * 0.94, -9, 0.96, noseLift, rearTiltY, dir),
      projCarX(sideU, 0, rearCos, tailShift, sideSpan, dir),
      projCarY(sideU, -10, 0, noseLift, rearTiltY, dir),
    );

    // Iconic Pininfarina side air intake recess & horizontal door strakes ("cheese graters")
    ctx.fillStyle = '#240b36';
    quad(
      ctx,
      projCarX(sideU * 0.94, 0.2, rearCos, tailShift, sideSpan, dir),
      projCarY(sideU * 0.94, -12, 0.2, noseLift, rearTiltY, dir),
      projCarX(sideU * 0.9, 0.2, rearCos, tailShift, sideSpan, dir),
      projCarY(sideU * 0.9, -25, 0.2, noseLift, rearTiltY, dir),
      projCarX(sideU * 0.88, 0.62, rearCos, tailShift, sideSpan, dir),
      projCarY(sideU * 0.88, -24, 0.62, noseLift, rearTiltY, dir),
      projCarX(sideU * 0.92, 0.62, rearCos, tailShift, sideSpan, dir),
      projCarY(sideU * 0.92, -12, 0.62, noseLift, rearTiltY, dir),
    );

    // 3 horizontal Pininfarina side strake blades across the side intake
    ctx.fillStyle = '#ff2a6d';
    for (let s = 0; s < 3; s++) {
      const bladeLy = -15 - s * 4;
      quad(
        ctx,
        projCarX(sideU * 0.93, 0.16, rearCos, tailShift, sideSpan, dir),
        projCarY(sideU * 0.93, bladeLy, 0.16, noseLift, rearTiltY, dir),
        projCarX(sideU * 0.93, 0.16, rearCos, tailShift, sideSpan, dir),
        projCarY(sideU * 0.93, bladeLy - 2, 0.16, noseLift, rearTiltY, dir),
        projCarX(sideU * 0.9, 0.64, rearCos, tailShift, sideSpan, dir),
        projCarY(sideU * 0.9, bladeLy - 2, 0.64, noseLift, rearTiltY, dir),
        projCarX(sideU * 0.9, 0.64, rearCos, tailShift, sideSpan, dir),
        projCarY(sideU * 0.9, bladeLy, 0.64, noseLift, rearTiltY, dir),
      );
    }

    // Side wing-mirror on exposed door shoulder
    const wingX = projCarX(sideU * 0.95, 0.48, rearCos, tailShift, sideSpan, dir);
    const wingY = projCarY(sideU * 0.95, -34, 0.48, noseLift, rearTiltY, dir);
    ctx.fillStyle = '#ff2a6d';
    ctx.fillRect(wingX - 2, wingY, 5, 3);

    // Amber front side-marker lamp near the nose
    const markerX = projCarX(sideU * 0.93, 0.88, rearCos, tailShift, sideSpan, dir);
    const markerY = projCarY(sideU * 0.93, -12, 0.88, noseLift, rearTiltY, dir);
    ctx.fillStyle = '#ffd319';
    ctx.fillRect(markerX - 1, markerY, 3, 2);

    // Exposed Side Wheels (Rear Wheel at v=0.14 + Front Wheel at v=0.76) with 5-spoke star rims
    const wheelW = Math.max(5, Math.round(4 + absFrame * 2.2));
    const rearWheelX = projCarX(sideU * 0.98, 0.14, rearCos, tailShift, sideSpan, dir);
    const rearWheelY = projCarY(sideU * 0.98, -8, 0.14, noseLift, rearTiltY, dir);
    // Front wheel shifts with steering/counter-steering angle!
    const steerWheelShift = Math.round(car.steer * 2.5);
    const frontWheelX =
      projCarX(sideU * 0.96, 0.76, rearCos, tailShift, sideSpan, dir) + steerWheelShift;
    const frontWheelY = projCarY(sideU * 0.96, -8, 0.76, noseLift, rearTiltY, dir);

    // Rear side wheel arch & alloy rim
    ctx.fillStyle = '#12091f';
    ctx.fillRect(rearWheelX - Math.floor(wheelW * 0.5), rearWheelY - 8, wheelW, 15);
    ctx.fillStyle = treadPhase === 0 ? '#e0fbfc' : '#05d9e8';
    ctx.fillRect(
      rearWheelX - Math.max(1, Math.floor(wheelW * 0.3)),
      rearWheelY - 5,
      Math.max(2, Math.round(wheelW * 0.6)),
      9,
    );
    ctx.fillStyle = '#240b36';
    ctx.fillRect(rearWheelX - 1, rearWheelY - 2 + treadPhase, 2, 3);

    // Front side wheel arch & alloy rim
    const frontW = Math.max(4, wheelW - 1);
    ctx.fillStyle = '#12091f';
    ctx.fillRect(frontWheelX - Math.floor(frontW * 0.5), frontWheelY - 7, frontW, 13);
    ctx.fillStyle = treadPhase === 0 ? '#05d9e8' : '#e0fbfc';
    ctx.fillRect(
      frontWheelX - Math.max(1, Math.floor(frontW * 0.3)),
      frontWheelY - 4,
      Math.max(2, Math.round(frontW * 0.6)),
      7,
    );
  }

  // 7. Wide rear tires with animated pixel tread blocks (foreshortened & shifted on Rear Face)
  const tireW = Math.max(12, Math.round(18 * rearCos));
  const leftTireX = rearShift - rearHalfW - 1;
  const rightTireX = rearShift + rearHalfW - tireW + 1;
  ctx.fillStyle = '#12091f';
  ctx.fillRect(leftTireX, -15, tireW, 17);
  ctx.fillRect(rightTireX, -15, tireW, 17);

  ctx.fillStyle = treadPhase === 0 ? '#2b1847' : '#1e1035';
  const treadW = Math.max(6, tireW - 4);
  for (let ty = -13; ty <= -3; ty += 4) {
    ctx.fillRect(leftTireX + 2, ty + treadPhase, treadW, 2);
    ctx.fillRect(rightTireX + 2, ty + treadPhase, treadW, 2);
  }

  // 8. Lower aerodynamic diffuser & undertray fins on Rear Face
  const diffBotW = Math.round(96 * rearCos);
  const diffTopW = Math.round(90 * rearCos);
  ctx.fillStyle = '#1f0d33';
  trapezoid(
    ctx,
    rearShift - Math.round(diffBotW * 0.5),
    -3,
    diffBotW,
    rearShift - Math.round(diffTopW * 0.5),
    -12,
    diffTopW,
  );
  ctx.fillStyle = '#381a5c';
  for (let fx = -32; fx <= 32; fx += 16) {
    ctx.fillRect(rearShift + Math.round(fx * rearCos) - 1, -10, 2, 7);
  }

  // 9. Main rear body (Testarossa wide-body wedge) + pixel fender highlights
  const bodyBotW = rearHalfW * 2;
  const bodyTopW = Math.round(88 * rearCos);
  const bodyTopShift = rearShift + Math.round(dir * absFrame * 1.5);
  ctx.fillStyle = '#ff2a6d';
  trapezoid(
    ctx,
    rearShift - rearHalfW,
    -10,
    bodyBotW,
    bodyTopShift - Math.round(bodyTopW * 0.5),
    -28,
    bodyTopW,
  );

  // Upper fender shoulder highlights
  const hiW = Math.max(8, Math.round(18 * rearCos));
  ctx.fillStyle = '#ff70a6';
  ctx.fillRect(bodyTopShift - Math.round(45 * rearCos), -28, hiW, 2);
  ctx.fillRect(bodyTopShift + Math.round(45 * rearCos) - hiW, -28, hiW, 2);

  // Iconic Pininfarina rear cooling louvers
  ctx.fillStyle = '#9e1446';
  ctx.fillRect(rearShift - Math.round(47 * rearCos), -22, Math.round(94 * rearCos), 2);
  ctx.fillRect(rearShift - Math.round(48 * rearCos), -18, Math.round(96 * rearCos), 2);
  ctx.fillRect(rearShift - Math.round(49 * rearCos), -14, Math.round(98 * rearCos), 2);

  // 10. Recessed black tail-light louver bar & twin slotted neon tail lamps
  const tailBarW = Math.round(90 * rearCos);
  const tailBarX = rearShift - Math.round(tailBarW * 0.5);
  ctx.fillStyle = '#140624';
  ctx.fillRect(tailBarX, -25, tailBarW, 8);

  const outerTailColor = car.braking ? '#ff2a6d' : '#d91b5c';
  const innerTailColor = car.braking ? '#fff3b0' : '#ff5c93';
  const lampW = Math.max(14, Math.round(27 * rearCos));
  const leftLampX = rearShift - Math.round(43 * rearCos);
  const rightLampX = rearShift + Math.round(43 * rearCos) - lampW;
  ctx.fillStyle = outerTailColor;
  ctx.fillRect(leftLampX, -24, lampW, 6);
  ctx.fillRect(rightLampX, -24, lampW, 6);

  const innerSegW = Math.max(4, Math.round(10 * rearCos));
  ctx.fillStyle = innerTailColor;
  ctx.fillRect(leftLampX + 2, -23, innerSegW, 4);
  ctx.fillRect(leftLampX + lampW - innerSegW - 2, -23, innerSegW, 4);
  ctx.fillRect(rightLampX + 2, -23, innerSegW, 4);
  ctx.fillRect(rightLampX + lampW - innerSegW - 2, -23, innerSegW, 4);

  // Tail-light horizontal black louver slits
  ctx.fillStyle = '#140624';
  ctx.fillRect(leftLampX, -21, lampW, 1);
  ctx.fillRect(rightLampX, -21, lampW, 1);

  // Brake light bloom halo when braking
  if (car.braking) {
    ctx.fillStyle = 'rgba(255, 42, 109, 0.38)';
    ctx.fillRect(leftLampX - 3, -27, lampW + 6, 12);
    ctx.fillRect(rightLampX - 3, -27, lampW + 6, 12);
  }

  // 11. Center JDM neon license plate ("FUNK-88")
  const plateW = Math.max(12, Math.round(20 * rearCos));
  const plateX = rearShift - Math.round(plateW * 0.5);
  ctx.fillStyle = '#05d9e8';
  ctx.fillRect(plateX, -17, plateW, 8);
  ctx.fillStyle = '#0d0221';
  ctx.fillRect(plateX + 2, -15, Math.max(8, plateW - 4), 4);
  ctx.fillStyle = '#ffd319';
  ctx.fillRect(plateX + 3, -14, Math.max(3, Math.round(5 * rearCos)), 2);
  ctx.fillRect(
    plateX + plateW - Math.max(3, Math.round(5 * rearCos)) - 3,
    -14,
    Math.max(3, Math.round(5 * rearCos)),
    2,
  );

  // 12. Quad pixel-art chrome exhaust tips + high-RPM / drift backfire glow
  const ex1X = rearShift + Math.round(-30 * rearCos);
  const ex2X = rearShift + Math.round(-24 * rearCos);
  const ex3X = rearShift + Math.round(20 * rearCos);
  const ex4X = rearShift + Math.round(26 * rearCos);
  ctx.fillStyle = '#e0fbfc';
  ctx.fillRect(ex1X, -8, 4, 4);
  ctx.fillRect(ex2X, -8, 4, 4);
  ctx.fillRect(ex3X, -8, 4, 4);
  ctx.fillRect(ex4X, -8, 4, 4);

  ctx.fillStyle = car.isDrifting || car.rpm > 0.8 ? '#ffd319' : '#241138';
  ctx.fillRect(ex1X + 1, -7, 2, 2);
  ctx.fillRect(ex2X + 1, -7, 2, 2);
  ctx.fillRect(ex3X + 1, -7, 2, 2);
  ctx.fillRect(ex4X + 1, -7, 2, 2);

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
