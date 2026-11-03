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
 * 16-bit pixel-art 80s Testarossa Spider convertible rear-view car renderer
 * with procedural polygon/pixel fallback (AGENTS.md §4.3, §4.4 & §5 M7).
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

  const cx = Math.round(canvasWidth / 2 + car.yaw * 5);
  const baseY = Math.round(canvasHeight - 26 + bounceY + pitchY);
  // Discrete arcade sprite banking offset (-6..+6 px) for crisp pixel-art stepping
  const bank = Math.round(car.yaw * 5);
  const treadPhase = Math.floor(car.bouncePhase * 2.5) & 1;

  ctx.save();
  ctx.translate(cx, baseY);
  ctx.rotate(car.yaw * 0.025);

  // 1. Drift tire smoke puffs (procedural fallback layer supplementing ParticleSystem)
  if (car.isDrifting) {
    const dir = -car.driftDir;
    ctx.fillStyle = car.isOffRoad ? 'rgba(180, 120, 210, 0.35)' : 'rgba(5, 217, 232, 0.38)';
    for (let i = 0; i < 4; i++) {
      const phase = (car.bouncePhase * 0.7 + i * 1.7) % 4;
      const r = Math.round(3 + phase * 3);
      const ox = Math.round(dir * (8 + phase * 9));
      const oy = Math.round(2 - phase * 2.5);
      ctx.fillRect(-40 + ox - r, oy - r, r * 2, r * 2);
      ctx.fillRect(36 + ox - r, oy - r, r * 2, r * 2);
    }
  }

  // 2. Pixel-stepped ground shadow + HIGH/SSS Groove neon underglow
  ctx.fillStyle = 'rgba(8, 2, 20, 0.7)';
  ctx.fillRect(-54, 1, 108, 6);
  ctx.fillRect(-48, 7, 96, 3);
  if (car.grooveTier === 'SSS' || car.grooveTier === 'HIGH') {
    ctx.fillStyle =
      car.grooveTier === 'SSS' ? 'rgba(255, 211, 25, 0.42)' : 'rgba(5, 217, 232, 0.34)';
    ctx.fillRect(-44, 2, 88, 4);
  }

  // 3. Wide rear tires with animated pixel tread blocks
  const leftTireX = -51 + Math.round(bank * 0.2);
  const rightTireX = 33 + Math.round(bank * 0.2);
  ctx.fillStyle = '#12091f';
  ctx.fillRect(leftTireX, -15, 18, 17);
  ctx.fillRect(rightTireX, -15, 18, 17);

  ctx.fillStyle = treadPhase === 0 ? '#2b1847' : '#1e1035';
  for (let ty = -13; ty <= -3; ty += 4) {
    ctx.fillRect(leftTireX + 2, ty + treadPhase, 14, 2);
    ctx.fillRect(rightTireX + 2, ty + treadPhase, 14, 2);
  }

  // 4. Lower aerodynamic diffuser & undertray fins
  ctx.fillStyle = '#1f0d33';
  trapezoid(ctx, -48 + bank * 0.2, -3, 96, -45 + bank * 0.3, -12, 90);
  ctx.fillStyle = '#381a5c';
  for (let fx = -32; fx <= 32; fx += 16) {
    ctx.fillRect(fx + Math.round(bank * 0.25) - 1, -10, 2, 7);
  }

  // 5. Main rear body (Testarossa wide-body wedge) + pixel fender highlights
  ctx.fillStyle = '#ff2a6d';
  trapezoid(ctx, -50 + bank * 0.25, -10, 100, -44 + bank * 0.45, -28, 88);

  // Upper fender shoulder highlights
  ctx.fillStyle = '#ff70a6';
  ctx.fillRect(-45 + Math.round(bank * 0.42), -28, 18, 2);
  ctx.fillRect(27 + Math.round(bank * 0.42), -28, 18, 2);

  // Iconic Pininfarina side strakes & rear cooling louvers
  ctx.fillStyle = '#9e1446';
  ctx.fillRect(-47 + Math.round(bank * 0.35), -22, 94, 2);
  ctx.fillRect(-48 + Math.round(bank * 0.3), -18, 96, 2);
  ctx.fillRect(-49 + Math.round(bank * 0.26), -14, 98, 2);

  // 6. Upper engine deck & convertible tonneau cover
  ctx.fillStyle = '#d91b5c';
  trapezoid(ctx, -44 + bank * 0.45, -28, 88, -32 + bank * 0.72, -41, 64);

  // Mid-engine cooling vents on rear deck
  ctx.fillStyle = '#240b36';
  for (let vy = -38; vy <= -31; vy += 3) {
    ctx.fillRect(-14 + Math.round(bank * 0.6), vy, 28, 2);
  }

  // 7. Open-top Spider cockpit: Driver (left) + 90s Anime Co-Pilot (right) + windshield frame
  const cabinShift = Math.round(bank * 0.78);
  // Windshield frame & cyan glass reflection
  ctx.fillStyle = '#180a2e';
  trapezoid(ctx, -34 + cabinShift, -32, 68, -26 + cabinShift, -44, 52);
  ctx.fillStyle = '#05d9e8';
  ctx.fillRect(-25 + cabinShift, -44, 50, 2);
  ctx.globalAlpha = 0.45;
  trapezoid(ctx, -30 + cabinShift, -33, 24, -23 + cabinShift, -42, 16);
  ctx.globalAlpha = 1;

  // Driver silhouette (left seat) with retro visor shades
  ctx.fillStyle = '#120624';
  ctx.fillRect(-20 + cabinShift, -39, 10, 8);
  ctx.fillStyle = '#05d9e8';
  ctx.fillRect(-18 + cabinShift, -36, 6, 2);

  // 90s Anime Passenger silhouette (right seat) with wind-blown magenta/violet pixel hair
  const hairWave = treadPhase === 0 ? 1 : -1;
  ctx.fillStyle = '#7b2cbf';
  ctx.fillRect(8 + cabinShift, -40, 11, 9);
  ctx.fillStyle = '#ff4f9a';
  ctx.fillRect(10 + cabinShift + hairWave, -41, 9, 3);
  ctx.fillRect(16 + cabinShift + hairWave, -37, 5, 4);
  // Passenger cyan jacket shoulder
  ctx.fillStyle = '#05d9e8';
  ctx.fillRect(7 + cabinShift, -32, 12, 3);

  // Center rear-view mirror
  ctx.fillStyle = '#f6e7ff';
  ctx.fillRect(-3 + cabinShift, -41, 6, 2);

  // 8. Recessed black tail-light louver bar & twin slotted neon tail lamps
  const tailShift = Math.round(bank * 0.35);
  ctx.fillStyle = '#140624';
  ctx.fillRect(-45 + tailShift, -25, 90, 8);

  const outerTailColor = car.braking ? '#ff2a6d' : '#d91b5c';
  const innerTailColor = car.braking ? '#fff3b0' : '#ff5c93';
  ctx.fillStyle = outerTailColor;
  ctx.fillRect(-43 + tailShift, -24, 27, 6);
  ctx.fillRect(16 + tailShift, -24, 27, 6);
  ctx.fillStyle = innerTailColor;
  ctx.fillRect(-41 + tailShift, -23, 10, 4);
  ctx.fillRect(-28 + tailShift, -23, 10, 4);
  ctx.fillRect(18 + tailShift, -23, 10, 4);
  ctx.fillRect(31 + tailShift, -23, 10, 4);

  // Tail-light horizontal black louver slits
  ctx.fillStyle = '#140624';
  ctx.fillRect(-43 + tailShift, -21, 27, 1);
  ctx.fillRect(16 + tailShift, -21, 27, 1);

  // Brake light bloom halo when braking
  if (car.braking) {
    ctx.fillStyle = 'rgba(255, 42, 109, 0.38)';
    ctx.fillRect(-46 + tailShift, -27, 33, 12);
    ctx.fillRect(13 + tailShift, -27, 33, 12);
  }

  // 9. Center JDM neon license plate ("FUNK-88")
  const plateShift = Math.round(bank * 0.3);
  ctx.fillStyle = '#05d9e8';
  ctx.fillRect(-10 + plateShift, -17, 20, 8);
  ctx.fillStyle = '#0d0221';
  ctx.fillRect(-8 + plateShift, -15, 16, 4);
  ctx.fillStyle = '#ffd319';
  ctx.fillRect(-6 + plateShift, -14, 5, 2);
  ctx.fillRect(1 + plateShift, -14, 5, 2);

  // 10. Quad pixel-art chrome exhaust tips + high-RPM / drift backfire glow
  const exShift = Math.round(bank * 0.2);
  ctx.fillStyle = '#e0fbfc';
  ctx.fillRect(-30 + exShift, -8, 4, 4);
  ctx.fillRect(-24 + exShift, -8, 4, 4);
  ctx.fillRect(20 + exShift, -8, 4, 4);
  ctx.fillRect(26 + exShift, -8, 4, 4);

  ctx.fillStyle = car.isDrifting || car.rpm > 0.8 ? '#ffd319' : '#241138';
  ctx.fillRect(-29 + exShift, -7, 2, 2);
  ctx.fillRect(-23 + exShift, -7, 2, 2);
  ctx.fillRect(21 + exShift, -7, 2, 2);
  ctx.fillRect(27 + exShift, -7, 2, 2);

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
