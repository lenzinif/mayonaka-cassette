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
 * Player car sprite frame: pure rear-view sprite (frame 0).
 * Steering and drifting lean and banking stretch are rendered dynamically via yaw.
 */
export type CarSpriteFrame = 0;

export interface CarRearRig {
  centerX: number;
  baseY: number;
  leftTireX: number;
  rightTireX: number;
  leftExhaustX: number;
  rightExhaustX: number;
  spriteFrame: CarSpriteFrame;
}

/**
 * 4 discrete Groove tiers with hysteresis (AGENTS.md §5 M5).
 * SSS corresponds to Funky Overdrive.
 */
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

  /**
   * Temporary turbo-spool & front-end turn-in boost timer (seconds) triggered by a valid
   * manual downshift, rewarding active downshifting on climbs and corner entries.
   */
  downshiftSpoolTimer = 0;

  private prevSlope = 0;
  private prevLateralVel = 0;
  private smoothedLatDelta = 0;
  private prevBrake = false;
  private brakeDriftActive = false;
  /** Current outer asphalt edge (1.0 on normal road, up to 1.68 in Y-fork). */
  private roadOuterLimit = 1;
  /** Current inner median island half-width (0 on normal road, up to 0.52 in Y-fork). */
  private roadInnerGap = 0;
  private roadActiveLeftEdge = -1;
  private roadActiveRightEdge = 1;

  get isOffRoad(): boolean {
    if (this.roadActiveLeftEdge !== -1 || this.roadActiveRightEdge !== 1) {
      return this.x < this.roadActiveLeftEdge || this.x > this.roadActiveRightEdge;
    }
    const absX = Math.abs(this.x);
    return absX > this.roadOuterLimit || (this.roadInnerGap > 0.02 && absX < this.roadInnerGap);
  }

  /**
   * Continuous off-road penetration depth in `[0, 1]` accounting for both the outer shoulder
   * and the central V-chevron median island in the stage fork.
   */
  get offRoadDepth(): number {
    if (this.roadActiveLeftEdge !== -1 || this.roadActiveRightEdge !== 1) {
      if (this.x > this.roadActiveRightEdge) {
        return Math.max(0, Math.min(1, (this.x - this.roadActiveRightEdge) / 0.55));
      }
      if (this.x < this.roadActiveLeftEdge) {
        return Math.max(0, Math.min(1, (this.roadActiveLeftEdge - this.x) / 0.55));
      }
      return 0;
    }
    const absX = Math.abs(this.x);
    if (absX > this.roadOuterLimit) {
      return Math.max(0, Math.min(1, (absX - this.roadOuterLimit) / 0.55));
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

  /** True when in gears 2–6 on asphalt and RPM has fallen below the gear's turbo operating band. */
  get isLugging(): boolean {
    return (
      !this.isOffRoad &&
      this.speed > tuning.maxSpeed * 0.08 &&
      this.gearbox.isLugging(this.speed, tuning.maxSpeed)
    );
  }

  /** True when pushing against the rev limiter in gears 1–5 (`rpm >= 0.96`). */
  get isRedlining(): boolean {
    return this.gear < MAX_GEAR && this.rpm >= 0.96;
  }

  /** True when in 6th gear at Overdrive speeds (`SSS` Groove or downhill slipstream draft). */
  get isOverdrive(): boolean {
    return (
      this.gear === MAX_GEAR &&
      (this.speedRatio >= 0.995 || (this.grooveTier === 'SSS' && this.speedRatio >= 0.95))
    );
  }

  /**
   * Computes the dynamic top-speed ceiling in world units/s for the current gear, Groove state,
   * and road slope:
   * - Gears 1–5 are governed by mechanical gearing (`gearbox.getGearTopSpeed`).
   * - Gear 6 (Overdrive) fights aerodynamic drag: flat-road equilibrium scales with Groove
   *   from `0.92 * maxSpeed` (`LOW` Groove) up to `1.00 * maxSpeed` (`HIGH` Groove) and
   *   `1.04 * maxSpeed` in `SSS` (`FUNKY OVERDRIVE`), plus up to `+4.5%` gravity draft on steep downhills.
   */
  getEffectiveTopSpeed(maxSpeed = tuning.maxSpeed, segmentSlope = 0): number {
    const mechanicalTop = this.gearbox.getGearTopSpeed(maxSpeed, this.gear);
    if (this.gear < MAX_GEAR) {
      return mechanicalTop;
    }

    const grooveProgress = Math.max(0, Math.min(1, this.groove / 85));
    const baseAeroCeiling = 0.92 + grooveProgress * 0.08;
    const overdriveBonus =
      this.grooveTier === 'SSS' ? 0.02 + Math.max(0, (this.groove - 85) / 15) * 0.025 : 0;
    const downhillBonus =
      segmentSlope < -0.02 ? Math.min(0.045, Math.abs(segmentSlope) * 0.14) : 0;

    const topMultiplier = Math.min(1.065, baseAeroCeiling + overdriveBonus + downhillBonus);
    return mechanicalTop * topMultiplier;
  }

  /** Normalized speed (0..1.065) against `tuning.maxSpeed`. */
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

    if (direction === 'down' && result.newRpm >= 0.45 && result.newRpm <= 0.98) {
      // Downshifting into the powerband spools the turbo and sharpens front-end turn-in
      this.downshiftSpoolTimer = result.validForBonus && result.rewardTier !== 'OFF' ? 0.95 : 0.65;
    } else if (direction === 'up') {
      this.downshiftSpoolTimer = 0;
    }

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
    this.roadActiveLeftEdge = forkBounds ? forkBounds.activeLeftEdge : -1;
    this.roadActiveRightEdge = forkBounds ? forkBounds.activeRightEdge : 1;

    const maxSpeed = tuning.maxSpeed;
    const prevSpeed = this.speed;
    const gearTopSpeed = this.getEffectiveTopSpeed(maxSpeed, segmentSlope);
    const offRoadCap = maxSpeed * tuning.offRoadMaxSpeedRatio;

    if (this.downshiftSpoolTimer > 0) {
      this.downshiftSpoolTimer = Math.max(0, this.downshiftSpoolTimer - dt);
    }

    // 1. Longitudinal speed (accelerate via Gearbox torque curve / brake / coast + off-road & grade drag).
    const gearProgress = (this.gearbox.gear - 1) / (MAX_GEAR - 1);
    // Uphill climbs (`segmentSlope > 0`) load tall gears (5th/6th) moderately so 6th gear sags from top speed,
    // rewarding a downshift to 4th/5th, without stalling or dropping the car to a crawl.
    const gradeLoadFactor =
      0.26 + Math.pow(gearProgress, 1.3) * (tuning.hillClimbLoadFactor ?? 0.85);
    const slopeDragRate =
      segmentSlope > 0.01
        ? Math.min(tuning.hillClimbDragRate ?? 0.14, segmentSlope * 0.25) * gradeLoadFactor
        : segmentSlope < -0.01
          ? Math.max(-0.09, segmentSlope * 0.16)
          : 0;

    // High-speed cornering tire scrub on tight curves (`|segmentCurve| > 2.8`) when not drifting
    const absCurve = Math.abs(segmentCurve);
    const cornerScrubRate =
      this.driftDir === 0 && absCurve > 2.8 && this.speed > maxSpeed * 0.62
        ? Math.min(0.075, (absCurve - 2.8) * 0.013) *
          (this.speed / maxSpeed) *
          (0.45 + 0.75 * gearProgress)
        : 0;

    const offRoadDepth = this.offRoadDepth;
    const isOffRoad = this.isOffRoad;

    // Smooth off-road speed ceiling: scales smoothly from gearTopSpeed down to offRoadCap with penetration depth
    const offRoadTargetCap =
      gearTopSpeed - (gearTopSpeed - offRoadCap) * Math.pow(offRoadDepth, 1.1);
    const targetCap = isOffRoad ? Math.min(gearTopSpeed, offRoadTargetCap) : gearTopSpeed;

    // Progressive off-road drag: gentle resistance when grazing shoulder, firmer in deep grass/sand
    const offRoadDragRate = isOffRoad
      ? tuning.offRoadDecelRate * (0.2 + 0.8 * offRoadDepth) * offRoadDepth
      : 0;

    if (controls.brake) {
      const brakeScale =
        controls.brakeAxis !== undefined && controls.brakeAxis > 0.15
          ? controls.brakeAxis
          : 1.0;
      this.speed -=
        maxSpeed *
        (tuning.brakeRate * brakeScale + offRoadDragRate + Math.max(0, slopeDragRate)) *
        dt;
    } else if (controls.accelerate) {
      if (this.speed <= targetCap) {
        const throttleScale =
          controls.throttleAxis !== undefined && controls.throttleAxis > 0.15
            ? controls.throttleAxis
            : 1.0;
        const spoolBoost = this.downshiftSpoolTimer > 0 ? 1.18 : 1.0;
        const torque =
          this.gearbox.getTorqueFactor(this.speed, maxSpeed) * throttleScale * spoolBoost;
        // Sideways tire scrub during a drift reduces forward drive in tall gears so long drifts
        // naturally dip speed into the 3rd/4th/5th gear powerband instead of staying pinned in 6th.
        const driftDriveScale =
          this.driftDir !== 0 ? Math.max(0.14, 0.58 - gearProgress * 0.44) : 1;
        const driveScale = isOffRoad ? Math.max(0.45, 1 - offRoadDepth * 0.45) : 1;
        const netAccelRate =
          tuning.accelRate * torque * driftDriveScale * driveScale -
          slopeDragRate -
          cornerScrubRate;
        this.speed = Math.min(targetCap, this.speed + maxSpeed * netAccelRate * dt);
      } else if (isOffRoad) {
        // Carrying more speed than the shoulder/grass permits: smoothly bleed down toward targetCap
        const offRoadBleedRate =
          offRoadDragRate + tuning.coastRate * 0.6 + Math.max(0, slopeDragRate);
        this.speed = Math.max(targetCap, this.speed - maxSpeed * offRoadBleedRate * dt);
      } else if (this.gear < MAX_GEAR) {
        // Mechanical over-rev engine braking when downshifting into a lower gear above its top speed
        const overRevRatio = Math.max(0, (this.speed - targetCap) / maxSpeed);
        const engineBrakeRate =
          tuning.coastRate * 1.65 + overRevRatio * 1.35 + Math.max(0, slopeDragRate);
        this.speed = Math.max(targetCap, this.speed - maxSpeed * engineBrakeRate * dt);
      } else {
        // Smooth aerodynamic settling in 6th gear when returning from downhill draft or Overdrive
        const aeroSettleRate = tuning.coastRate * 0.75 + Math.max(0, slopeDragRate);
        this.speed = Math.max(targetCap, this.speed - maxSpeed * aeroSettleRate * dt);
      }
    } else {
      this.speed -=
        maxSpeed *
        (tuning.coastRate + offRoadDragRate + Math.max(0, slopeDragRate) + cornerScrubRate) *
        dt;
    }

    const hardMaxSpeed = maxSpeed * 1.065;
    this.speed = Math.max(0, Math.min(hardMaxSpeed, this.speed));
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
        // inviting a downshift to 3rd/4th/5th on exit to launch out of the corner.
        const highGearScrub = 0.78 + 0.72 * gearProgress;
        this.speed = Math.max(
          0,
          this.speed - maxSpeed * tuning.driftDecelRate * highGearScrub * dt,
        );
        this.gearbox.update(this.speed, maxSpeed);
      }
    }

    // 4. Lateral movement: steering authority + centrifugal pull on curves.
    const turnInBonus = this.downshiftSpoolTimer > 0 ? 1.12 : 1.0;
    const steerAuthority = Math.min(1, speedRatio * 1.35) * turnInBonus;
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
      this.deductGroove(
        tuning.grooveOffRoadDrainRate * (0.2 + 0.8 * offRoadDepth) * dt,
        onEvent,
      );
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
 * Computes the discrete sprite frame for `car`.
 * The player car uses a dedicated rear-view sprite (frame 0) with continuous arcade banking
 * and layer stretching during steering and drifting.
 */
export function getPlayerCarSpriteFrame(car?: PlayerCar): CarSpriteFrame {
  void car;
  return 0;
}

/**
 * Computes the exact projected screen-space coordinates of the player car's rear tires
 * and exhaust tip for particle anchoring (smoke, sparks, and exhaust backfires).
 */
export function computePlayerCarRearRig(
  car: PlayerCar,
  canvasWidth: number,
  canvasHeight: number,
  out: CarRearRig,
): CarRearRig {
  const cx = Math.round(canvasWidth * 0.5 + car.yaw * 5);
  const baseY = Math.round(canvasHeight - 26);
  const bank = Math.round(car.yaw * 6);
  const tireShift = Math.round(bank * 0.2);
  const exShift = Math.round(bank * 0.22);

  out.centerX = cx;
  out.baseY = baseY;
  out.leftTireX = cx - 30 + tireShift;
  out.rightTireX = cx + 30 + tireShift;
  out.leftExhaustX = cx + 18 + exShift;
  out.rightExhaustX = cx + 22 + exShift;
  out.spriteFrame = 0;
  return out;
}

/**
 * 16-bit pixel-art 1980s Honda City ("Tall-Boy" Boxy Hatchback + Motocompo) rear-view renderer
 * with progressive steering lean and banking stretch ("allungamento durante sterzate")
 * (Design Pillars 1 & 3, AGENTS.md §4.3, §4.4 & §5 M7).
 *
 * Renders the Honda City purely from behind:
 * - Tall, narrow boxy 80s Japanese subcompact silhouette with unpainted black plastic bumper,
 *   3-color boxy 80s tail lamps, and single peashooter exhaust.
 * - Large panoramic rear hatchback window revealing the driver (left) and the stowed yellow
 *   foldable Honda Motocompo mini-scooter in the trunk (right).
 * - Multi-layer arcade sprite lean & stretching during steering and drifting:
 *   each vertical station (tires -> bumper -> tailgate -> rear window -> roof) offsets
 *   proportionally to yaw along with canvas tilt, creating crisp, authentic retro raster lean.
 */
export function drawPlayerCar(
  ctx: CanvasRenderingContext2D,
  car: PlayerCar,
  canvasWidth: number,
  canvasHeight: number,
): void {
  const cx = Math.round(canvasWidth / 2 + car.yaw * 5);
  const baseY = Math.round(canvasHeight - 26);

  // Progressive banking / shear offset for authentic OutRun sprite stretch during steering:
  // Layers shift proportionally from bottom (tires ~0.2) to top (roof ~0.78)
  const bank = Math.round(car.yaw * 6);
  const treadPhase = Math.floor(car.bouncePhase * 2.5) & 1;

  ctx.save();
  ctx.translate(cx, baseY);
  ctx.rotate(car.yaw * 0.025);

  const halfW = 36;
  const roofHalfW = 30;

  // Layer banking shifts (allungamento durante sterzate)
  const tireShift = Math.round(bank * 0.2);
  const bumperShift = Math.round(bank * 0.25);
  const exShift = Math.round(bank * 0.22);
  const plateShift = Math.round(bank * 0.32);
  const tailgateShift = Math.round(bank * 0.38);
  const cabinShift = Math.round(bank * 0.6);
  const roofShift = Math.round(bank * 0.78);

  // 1. Drift tire smoke puffs (procedural fallback layer supplementing ParticleSystem)
  if (car.isDrifting) {
    const smokeDir = -car.driftDir;
    const leftSmokeX = -30 + tireShift;
    const rightSmokeX = 30 + tireShift;
    ctx.fillStyle = car.isOffRoad ? 'rgba(180, 120, 210, 0.35)' : 'rgba(5, 217, 232, 0.38)';
    for (let i = 0; i < 4; i++) {
      const phase = (car.bouncePhase * 0.7 + i * 1.7) % 4;
      const r = Math.round(3 + phase * 3);
      const ox = Math.round(smokeDir * (7 + phase * 8));
      const oy = Math.round(2 - phase * 2.5);
      ctx.fillRect(leftSmokeX + ox - r, oy - r, r * 2, r * 2);
      ctx.fillRect(rightSmokeX + ox - r, oy - r, r * 2, r * 2);
    }
  }

  // 2. Clean dark ground shadow
  ctx.fillStyle = 'rgba(8, 2, 20, 0.7)';
  ctx.fillRect(-halfW - 3 + Math.round(bumperShift * 0.5), 1, halfW * 2 + 6, 5);
  ctx.fillRect(-halfW + 2 + Math.round(bumperShift * 0.5), 6, halfW * 2 - 4, 2);

  // 3. 12-inch 80s rear tires with animated tread blocks and white steelie wheel covers
  const tireW = 12;
  const leftTireX = -halfW + 1 + tireShift;
  const rightTireX = halfW - tireW - 1 + tireShift;
  ctx.fillStyle = '#12091f';
  ctx.fillRect(leftTireX, -13, tireW, 15);
  ctx.fillRect(rightTireX, -13, tireW, 15);

  ctx.fillStyle = treadPhase === 0 ? '#2b1847' : '#1e1035';
  for (let ty = -11; ty <= -3; ty += 4) {
    ctx.fillRect(leftTireX + 2, ty + treadPhase, tireW - 4, 2);
    ctx.fillRect(rightTireX + 2, ty + treadPhase, tireW - 4, 2);
  }

  // 4. Unpainted Matte-Black 80s Plastic Rear Bumper & Single Peashooter Exhaust Pipe
  const bumperHalfW = halfW + 1;
  const bumperTopY = -12;
  ctx.fillStyle = '#1b102e';
  ctx.fillRect(-bumperHalfW + bumperShift, bumperTopY, bumperHalfW * 2, 8);
  // Bumper top step highlight & recessed impact groove
  ctx.fillStyle = '#32204f';
  ctx.fillRect(-bumperHalfW + bumperShift + 1, bumperTopY, bumperHalfW * 2 - 2, 1);
  ctx.fillStyle = '#10071f';
  ctx.fillRect(-bumperHalfW + bumperShift + 2, -8, bumperHalfW * 2 - 4, 2);

  // Single small 80s peashooter exhaust pipe under right side of rear bumper
  const exX = 20 + exShift;
  ctx.fillStyle = '#c8ddf2';
  ctx.fillRect(exX - 2, -4, 4, 4);
  ctx.fillStyle = car.isDrifting || car.rpm > 0.8 ? '#ffd319' : '#10071f';
  ctx.fillRect(exX - 1, -3, 2, 2);

  // 5. Lower Boxy Tailgate Sheetmetal (y = -12..-27)
  // Leaning trapezoid between bumperShift and tailgateShift shears the body with the turn
  ctx.fillStyle = '#ff2a6d';
  trapezoid(
    ctx,
    -halfW + bumperShift,
    bumperTopY,
    halfW * 2,
    -halfW + tailgateShift,
    -27,
    halfW * 2,
  );

  // Upper tailgate crease highlight right under the rear window
  ctx.fillStyle = '#ff70a6';
  ctx.fillRect(-halfW + tailgateShift + 1, -27, halfW * 2 - 2, 2);

  // White/silver lower two-tone stripe across the bottom of the tailgate
  ctx.fillStyle = '#eef6ff';
  ctx.fillRect(-halfW + bumperShift + 1, -14, halfW * 2 - 2, 2);

  // Matte-black 80s plastic tailgate garnish bar between the tail lamps
  const garnishHalfW = 34;
  ctx.fillStyle = '#180c29';
  ctx.fillRect(-garnishHalfW + tailgateShift, -25, garnishHalfW * 2, 10);

  // 6. Classic 80s 3-Color Boxy Tail Lamp Clusters (Red Brake / Amber Turn / White Reverse)
  const lampW = 16;
  const leftLampX = -halfW + tailgateShift + 2;
  const rightLampX = halfW + tailgateShift - lampW - 2;

  // Top Red Brake/Tail section
  ctx.fillStyle = car.braking ? '#ff0055' : '#d91b5c';
  ctx.fillRect(leftLampX, -24, lampW, 4);
  ctx.fillRect(rightLampX, -24, lampW, 4);
  ctx.fillStyle = car.braking ? '#fff3b0' : '#ff5c93';
  ctx.fillRect(leftLampX + 2, -23, lampW - 4, 2);
  ctx.fillRect(rightLampX + 2, -23, lampW - 4, 2);

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

  // 7. Center JDM Compact License Plate & "CITY" badge
  const plateW = 18;
  const plateX = -Math.round(plateW * 0.5) + plateShift;
  ctx.fillStyle = '#e0fbfc';
  ctx.fillRect(plateX, -23, plateW, 8);
  ctx.fillStyle = '#0d0221';
  ctx.fillRect(plateX + 2, -21, plateW - 4, 4);
  ctx.fillStyle = '#05d9e8';
  ctx.fillRect(plateX + 3, -20, 4, 2);
  ctx.fillRect(plateX + plateW - 7, -20, 4, 2);

  // 8. Upper Greenhouse & Panoramic Hatchback Window (y = -27..-46)
  // Leaning trapezoid between tailgateShift at beltline and roofShift at roof top:
  // produces the classic arcade sprite stretch as the car banks into curves
  ctx.fillStyle = '#ff2a6d';
  trapezoid(
    ctx,
    -halfW + tailgateShift,
    -27,
    halfW * 2,
    -roofHalfW + roofShift,
    -46,
    roofHalfW * 2,
  );

  // Flat boxy roof cap highlight & center tiny radio antenna
  ctx.fillStyle = '#ff70a6';
  ctx.fillRect(-roofHalfW + roofShift + 1, -46, roofHalfW * 2 - 2, 2);
  ctx.fillStyle = '#c8ddf2';
  ctx.fillRect(roofShift - 1, -50, 2, 4);

  // Large rear hatchback glass window with black rubber weatherstrip
  const glassBotHalfW = halfW - 4;
  const glassTopHalfW = roofHalfW - 4;
  ctx.fillStyle = '#140824';
  trapezoid(
    ctx,
    -glassBotHalfW - 1 + tailgateShift,
    -28,
    (glassBotHalfW + 1) * 2,
    -glassTopHalfW - 1 + roofShift,
    -44,
    (glassTopHalfW + 1) * 2,
  );
  ctx.fillStyle = '#180c30';
  trapezoid(
    ctx,
    -glassBotHalfW + tailgateShift,
    -29,
    glassBotHalfW * 2,
    -glassTopHalfW + roofShift,
    -43,
    glassTopHalfW * 2,
  );

  // Diagonal cyan glass reflection on the left side of the rear window
  ctx.fillStyle = 'rgba(5, 217, 232, 0.28)';
  quad(
    ctx,
    -glassBotHalfW + 2 + tailgateShift,
    -30,
    -Math.round(glassBotHalfW * 0.35) + tailgateShift,
    -30,
    -Math.round(glassTopHalfW * 0.15) + roofShift,
    -42,
    -glassTopHalfW + 2 + roofShift,
    -42,
  );

  // Driver head & headrest silhouette inside cabin (left-hand side)
  const drvX = cabinShift - 12;
  const drvW = 10;
  ctx.fillStyle = '#100520';
  ctx.fillRect(drvX - Math.floor(drvW * 0.5), -41, drvW, 11);
  ctx.fillStyle = '#05d9e8';
  ctx.fillRect(drvX - Math.floor(drvW * 0.35), -39, drvW - 3, 2);

  // Iconic Foldable Yellow HONDA MOTOCOMPO Scooter stowed inside the rear trunk!
  const motoW = 22;
  const motoX = cabinShift + 3;
  const motoY = -36;
  // Folded dark handlebar & seat top bar
  ctx.fillStyle = '#100520';
  ctx.fillRect(motoX + 1, motoY - 2, motoW - 3, 2);
  // Boxy yellow Motocompo shell
  ctx.fillStyle = '#ffd319';
  ctx.fillRect(motoX, motoY, motoW, 7);
  // White/black Honda side stripe & vents on the Motocompo box
  ctx.fillStyle = '#180c29';
  ctx.fillRect(motoX + 2, motoY + 2, motoW - 4, 2);
  ctx.fillStyle = '#eef6ff';
  ctx.fillRect(motoX + 3, motoY + 2, Math.round(motoW * 0.45), 1);
  // Tiny red tail-light on the back of the Motocompo
  ctx.fillStyle = '#ff2a6d';
  ctx.fillRect(motoX + motoW - 3, motoY + 1, 2, 2);

  // Rear window wiper blade (classic 80s hatchback detail)
  ctx.fillStyle = '#100520';
  ctx.fillRect(-14 + tailgateShift, -30, 16, 1);

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
