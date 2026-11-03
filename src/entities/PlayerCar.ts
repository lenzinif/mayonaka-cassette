import type { BeatJudgement } from '@src/audio/BeatClock';
import { tuning } from '@src/config/tuning';
import type { ForkCrossSection } from '@src/road/RoadSegment';
import { Gearbox, type GearNumber, type ShiftResult } from './Gearbox';

export interface DriveControls {
  left: boolean;
  right: boolean;
  accelerate: boolean;
  brake: boolean;
  drift: boolean;
}

export type DriftDirection = -1 | 0 | 1;

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

    // 1. Longitudinal speed (accelerate via Gearbox torque curve / brake / coast + off-road drag).
    if (controls.brake) {
      this.speed -= maxSpeed * tuning.brakeRate * dt;
    } else if (this.isOffRoad && this.speed > offRoadCap) {
      // Off-road grass drags speed down toward offRoadCap even if throttle is held
      // (Design Pillar 3: slows down noticeably, never forces a dead stop).
      this.speed = Math.max(offRoadCap, this.speed - maxSpeed * tuning.offRoadDecelRate * dt);
    } else if (controls.accelerate) {
      const targetCap = this.isOffRoad ? Math.min(offRoadCap, gearTopSpeed) : gearTopSpeed;
      if (this.speed <= targetCap) {
        const torque = this.gearbox.getTorqueFactor(this.speed, maxSpeed);
        this.speed = Math.min(targetCap, this.speed + maxSpeed * tuning.accelRate * torque * dt);
      } else {
        // Gentle engine-braking decel if above current gear's top speed (e.g. after downshift)
        this.speed = Math.max(targetCap, this.speed - maxSpeed * tuning.coastRate * 1.4 * dt);
      }
    } else {
      this.speed -= maxSpeed * tuning.coastRate * dt;
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
        // Mild speed bleed while sliding sideways.
        this.speed = Math.max(0, this.speed - maxSpeed * tuning.driftDecelRate * dt);
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
 * Procedural greybox 80s JDM / Testarossa rear-view car renderer (AGENTS.md §4).
 */
export function drawPlayerCar(
  ctx: CanvasRenderingContext2D,
  car: PlayerCar,
  canvasWidth: number,
  canvasHeight: number,
): void {
  const speedRatio = Math.min(1, car.speedRatio);
  const bounceAmp = car.isOffRoad ? 3.2 * speedRatio : 0.8 * speedRatio;
  const bounceY = Math.sin(car.bouncePhase) * bounceAmp;
  const pitchY = car.pitch * 6;

  const cx = canvasWidth / 2 + car.yaw * 5;
  const baseY = canvasHeight - 26 + bounceY + pitchY;
  // Subtle perspective shift instead of heavy cartoon shear
  const skew = car.yaw * 4.5;

  ctx.save();
  ctx.translate(cx, baseY);
  ctx.rotate(car.yaw * 0.025);

  // Drift tire smoke puffs
  if (car.isDrifting) {
    const dir = -car.driftDir;
    ctx.fillStyle = car.isOffRoad ? 'rgba(180, 120, 210, 0.38)' : 'rgba(5, 217, 232, 0.42)';
    for (let i = 0; i < 4; i++) {
      const phase = (car.bouncePhase * 0.7 + i * 1.7) % 4;
      const r = 4 + phase * 3.5;
      const ox = dir * (8 + phase * 9);
      const oy = 2 - phase * 2.5;
      ctx.beginPath();
      ctx.arc(-38 + ox, oy, r, 0, Math.PI * 2);
      ctx.arc(38 + ox, oy, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Ground shadow
  ctx.fillStyle = 'rgba(8, 2, 20, 0.65)';
  ctx.beginPath();
  ctx.ellipse(0, 4, 56, 8, 0, 0, Math.PI * 2);
  ctx.fill();

  // Rear tires
  ctx.fillStyle = '#12091f';
  ctx.fillRect(-50 + skew * 0.15, -14, 16, 16);
  ctx.fillRect(34 + skew * 0.15, -14, 16, 16);

  // Lower chassis / diffuser
  ctx.fillStyle = '#241138';
  trapezoid(ctx, -48 + skew * 0.2, -4, 96, -44 + skew * 0.3, -12, 88);

  // Main rear body (Testarossa wedge)
  ctx.fillStyle = '#ff2a6d';
  trapezoid(ctx, -50 + skew * 0.25, -10, 100, -44 + skew * 0.45, -28, 88);

  // Side strakes (Testarossa ribs)
  ctx.fillStyle = '#b81d52';
  ctx.fillRect(-46 + skew * 0.35, -22, 92, 2);
  ctx.fillRect(-47 + skew * 0.3, -18, 94, 2);

  // Upper deck & cabin
  ctx.fillStyle = '#d91b5c';
  trapezoid(ctx, -44 + skew * 0.45, -28, 88, -30 + skew * 0.75, -42, 60);

  // Rear windshield (cyan/violet reflection)
  ctx.fillStyle = '#1a0c33';
  trapezoid(ctx, -34 + skew * 0.55, -29, 68, -24 + skew * 0.8, -40, 48);
  ctx.fillStyle = '#05d9e8';
  ctx.globalAlpha = 0.55;
  trapezoid(ctx, -30 + skew * 0.6, -30, 26, -21 + skew * 0.82, -39, 18);
  ctx.globalAlpha = 1;

  // Tail-light visor bar
  ctx.fillStyle = '#160826';
  ctx.fillRect(-44 + skew * 0.35, -24, 88, 7);

  // Tail lights (glow brighter when braking)
  const lightColor = car.braking ? '#fff3b0' : '#ff4f9a';
  const glowColor = car.braking ? '#ff2a6d' : '#ff2975';
  ctx.fillStyle = glowColor;
  ctx.fillRect(-42 + skew * 0.35, -23, 26, 5);
  ctx.fillRect(16 + skew * 0.35, -23, 26, 5);
  ctx.fillStyle = lightColor;
  ctx.fillRect(-40 + skew * 0.35, -22, 22, 3);
  ctx.fillRect(18 + skew * 0.35, -22, 22, 3);

  // Center neon license plate
  ctx.fillStyle = '#05d9e8';
  ctx.fillRect(-9 + skew * 0.3, -16, 18, 7);
  ctx.fillStyle = '#0d0221';
  ctx.fillRect(-7 + skew * 0.3, -14, 14, 3);

  // Dual exhaust tips
  ctx.fillStyle = '#f6e7ff';
  ctx.fillRect(-26 + skew * 0.2, -7, 6, 3);
  ctx.fillRect(20 + skew * 0.2, -7, 6, 3);

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
