import { tuning } from '@src/config/tuning';

export interface DriveControls {
  left: boolean;
  right: boolean;
  accelerate: boolean;
  brake: boolean;
  drift: boolean;
}

export type DriftDirection = -1 | 0 | 1;

export type CarEvent =
  | { type: 'driftStart'; direction: -1 | 1 }
  | { type: 'driftEnd'; clean: boolean; duration: number };

/**
 * Fake arcade car physics (Design Pillar 1: Feel Over Simulation).
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
  /** True if the car touched off-road during the current drift (disqualifies clean exit boost). */
  driftDirty = false;
  /** Temporary speed ceiling bonus after a clean drift exit (decays back to 0). */
  boostBonus = 0;

  /** True while braking Input is active. */
  braking = false;

  private prevSlope = 0;

  get isOffRoad(): boolean {
    return Math.abs(this.x) > 1;
  }

  get isDrifting(): boolean {
    return this.driftDir !== 0;
  }

  /** Normalized speed (0..1+) against base `tuning.maxSpeed`. */
  get speedRatio(): number {
    return tuning.maxSpeed > 0 ? this.speed / tuning.maxSpeed : 0;
  }

  /** Displayed speed in km/h. */
  get speedKmh(): number {
    return Math.round(this.speedRatio * tuning.maxSpeedKmh);
  }

  /**
   * Advances car state by one fixed step `dt`.
   * @param dt Fixed simulation step in seconds.
   * @param controls Current polled input state.
   * @param segmentCurve Curvature of the road segment under the car.
   * @param segmentSlope Vertical slope `(p2.worldY - p1.worldY) / segmentLength` under the car.
   * @param onEvent Optional callback for discrete drift events.
   */
  update(
    dt: number,
    controls: DriveControls,
    segmentCurve: number,
    segmentSlope = 0,
    onEvent?: (event: CarEvent) => void,
  ): void {
    this.prevX = this.x;
    this.braking = controls.brake;

    // 1. Decay any active exit-boost ceiling bonus.
    if (this.boostBonus > 0) {
      this.boostBonus = Math.max(0, this.boostBonus - dt * 0.08);
    }

    const maxSpeed = tuning.maxSpeed * (1 + this.boostBonus);
    const baseSpeedRatio = Math.min(1, this.speed / Math.max(1, tuning.maxSpeed));

    // 2. Longitudinal speed (accelerate / brake / coast).
    if (controls.brake) {
      this.speed -= tuning.maxSpeed * tuning.brakeRate * dt;
    } else if (controls.accelerate) {
      // Non-linear taper: punchy off the line, gradually tapers near top gear.
      const taper = 1 - tuning.accelTaper * Math.pow(baseSpeedRatio, 1.4);
      this.speed += tuning.maxSpeed * tuning.accelRate * Math.max(0.1, taper) * dt;
    } else {
      this.speed -= tuning.maxSpeed * tuning.coastRate * dt;
    }

    // 3. Off-road speed bleed (Design Pillar 3: slows down toward offRoadMaxSpeedRatio, never stops).
    if (this.isOffRoad) {
      const offRoadCap = tuning.maxSpeed * tuning.offRoadMaxSpeedRatio;
      if (this.speed > offRoadCap) {
        this.speed = Math.max(
          offRoadCap,
          this.speed - tuning.maxSpeed * tuning.offRoadDecelRate * dt,
        );
      }
    }

    this.speed = Math.max(0, Math.min(maxSpeed, this.speed));

    const speedRatio = this.speedRatio;

    // 4. Smooth steering input.
    const rawSteer = (controls.right ? 1 : 0) - (controls.left ? 1 : 0);
    const steerBlend = 1 - Math.exp(-tuning.steerResponse * dt);
    this.steer += (rawSteer - this.steer) * steerBlend;
    if (Math.abs(this.steer) < 0.001 && rawSteer === 0) {
      this.steer = 0;
    }

    // 5. Drift state machine.
    const canSustainDrift = controls.drift && speedRatio >= tuning.driftMinSpeedRatio;
    if (this.driftDir === 0) {
      if (canSustainDrift && rawSteer !== 0) {
        this.driftDir = rawSteer > 0 ? 1 : -1;
        this.driftTime = 0;
        this.driftDirty = this.isOffRoad;
        onEvent?.({ type: 'driftStart', direction: this.driftDir });
      }
    } else {
      if (!canSustainDrift) {
        const clean = !this.driftDirty && this.driftTime >= tuning.driftCleanMinTime;
        const duration = this.driftTime;
        this.driftDir = 0;
        this.driftTime = 0;
        this.driftDirty = false;
        if (clean) {
          this.boostBonus = tuning.driftExitBoost;
          this.speed = Math.min(
            tuning.maxSpeed * (1 + this.boostBonus),
            this.speed + tuning.maxSpeed * tuning.driftExitBoost,
          );
        }
        onEvent?.({ type: 'driftEnd', clean, duration });
      } else {
        this.driftTime += dt;
        if (this.isOffRoad) this.driftDirty = true;
        // Mild speed bleed while sliding sideways.
        this.speed = Math.max(0, this.speed - tuning.maxSpeed * tuning.driftDecelRate * dt);
      }
    }

    // 6. Lateral movement: steering authority + centrifugal pull on curves.
    // Steering requires forward motion so the car cannot slide sideways when parked.
    const steerAuthority = Math.min(1, speedRatio * 1.35);
    let lateralVel: number;
    if (this.driftDir !== 0) {
      // Locked drift commits inward toward driftDir, modulated by counter-steer.
      const inward = this.driftDir * tuning.driftInwardSteer;
      const counter = this.steer * tuning.driftCounterSteer;
      lateralVel = (inward + counter) * tuning.steerRate * steerAuthority;
    } else {
      lateralVel = this.steer * tuning.steerRate * steerAuthority;
    }

    const gripFactor = this.driftDir !== 0 ? 1 - tuning.driftCentrifugalReduce : 1;
    const centrifugalPush =
      segmentCurve * (speedRatio * speedRatio) * tuning.centrifugal * gripFactor;

    this.x += (lateralVel - centrifugalPush) * dt;
    this.x = Math.max(-tuning.playerXLimit, Math.min(tuning.playerXLimit, this.x));

    // 7. Visual feel: yaw, crest pitch, and road bounce.
    const targetYaw =
      this.driftDir !== 0 ? this.driftDir * 0.65 + this.steer * 0.35 : this.steer * 0.45;
    this.yaw += (targetYaw - this.yaw) * (1 - Math.exp(-12 * dt));

    const slopeDelta = segmentSlope - this.prevSlope;
    this.prevSlope = segmentSlope;
    const targetPitch = Math.max(-1, Math.min(1, -segmentSlope * 3.5 - slopeDelta * 12));
    this.pitch += (targetPitch - this.pitch) * (1 - Math.exp(-10 * dt));

    const bounceFreq = this.isOffRoad ? 38 : 18;
    this.bouncePhase += dt * bounceFreq * (0.2 + speedRatio * 0.8);
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
  const speedRatio = Math.min(1.2, car.speedRatio);
  const bounceAmp = car.isOffRoad ? 3.2 * speedRatio : 0.8 * speedRatio;
  const bounceY = Math.sin(car.bouncePhase) * bounceAmp;
  const pitchY = car.pitch * 6;

  const cx = canvasWidth / 2 + car.yaw * 10;
  const baseY = canvasHeight - 26 + bounceY + pitchY;
  const skew = car.yaw * 14;

  ctx.save();
  ctx.translate(cx, baseY);
  ctx.rotate(car.yaw * 0.08);

  // Drift tire smoke puffs
  if (car.isDrifting) {
    const dir = -car.driftDir;
    ctx.fillStyle = car.driftDirty ? 'rgba(180, 120, 210, 0.38)' : 'rgba(5, 217, 232, 0.42)';
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
