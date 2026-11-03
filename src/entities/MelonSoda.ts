import { tuning } from '@src/config/tuning';

export type SodaSkin = 'melon-soda' | 'tofu-cup' | 'pocari' | 'boss-coffee';

export const SODA_SKINS: readonly SodaSkin[] = [
  'melon-soda',
  'tofu-cup',
  'pocari',
  'boss-coffee',
] as const;

export const SODA_SKIN_LABELS: Readonly<Record<SodaSkin, string>> = {
  'melon-soda': 'MELON SODA',
  'tofu-cup': 'TOFU WATER CUP',
  pocari: 'POCARI SWEAT',
  'boss-coffee': 'BOSS COFFEE',
};

export type SodaSloshState = 'CALM' | 'SLOSHING' | 'CRESTING' | 'SPILLING';

interface SplashDroplet {
  active: boolean;
  prevX: number;
  prevY: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
}

const MAX_DROPLETS = 28;

export interface SodaMotionInput {
  /** Normalized lateral acceleration (includes centrifugal curve G + steering). */
  lateralAccel: number;
  /** Normalized longitudinal acceleration (throttle, brake, gear shifts). */
  longitudinalAccel: number;
  /** Normalized vertical acceleration (hill crests/dips). */
  verticalAccel: number;
  /** True when the car is bouncing off-road on the shoulder/grass. */
  isOffRoad: boolean;
  /** Normalized forward speed (0..1). */
  speedRatio: number;
}

/**
 * Multi-modal Dashboard Melon Cream Soda physics & Tofu Mode state machine
 * (AGENTS.md §3, §4.3, §4.9 & docs/DESIGN.md §5).
 *
 * Pure TypeScript module (zero React imports, zero GC allocations in hot loop).
 * Everything related to the Melon Soda cup (physics, splashes, Groove x2, canvas inset)
 * is active ONLY while `active` (Tofu Mode) is true.
 *
 * Simulated degrees of freedom (all interpolated with `alpha` at render time):
 * 1. `theta` — Fundamental pendulum slosh mode (driven by sustained cornering G + lateral jerk).
 * 2. `crestWave` — Second-harmonic S-wave surface curl (driven by rapid steering/shift jerk).
 * 3. `heaveY` — Vertical liquid heave (driven by hill crests/dips and off-road bounce).
 * 4. `floatY` & `floatTilt` — Independent buoyant spring-damper for the vanilla ice-cream float & ice cubes.
 * 5. `wetLeft` / `wetRight` & `trayLevel` — Persistent glass wall wetness & saucer puddle accumulation.
 */
export class MelonSoda {
  /** True when Tofu Mode is enabled. */
  active = false;
  /** Cosmetic cup skin (docs/DESIGN.md §5.2). */
  skin: SodaSkin = 'melon-soda';

  /** Explicit qualitative slosh state for HUD and visual feedback. */
  sloshState: SodaSloshState = 'CALM';

  /** Mode 1: Fundamental meniscus tilt angle (spill at `|effectiveTilt| > spillThreshold`). */
  theta = 0;
  prevTheta = 0;
  thetaVel = 0;

  /** Mode 2: Secondary S-wave surface curl amplitude. */
  crestWave = 0;
  prevCrestWave = 0;
  crestVel = 0;

  /** Mode 3: Vertical heave offset (pixels). */
  heaveY = 0;
  prevHeaveY = 0;
  heaveVel = 0;

  /** Buoyant ice-cream scoop + cherry vertical & rotational state. */
  floatY = 0;
  prevFloatY = 0;
  floatVel = 0;
  floatTilt = 0;
  prevFloatTilt = 0;
  floatTiltVel = 0;

  /** High-water wet trail on left/right inner glass walls `[0, 1]`. */
  wetLeft = 0;
  wetRight = 0;

  /** Accumulated spilled soda level on the dashboard saucer tray `[0, 1]`. */
  trayLevel = 0;

  /** Total spills during the current Tofu Mode streak. */
  spillCount = 0;
  /** Visual flash timer `[0, 1]` after a spill. */
  spillFlash = 0;

  private prevLatAccel = 0;
  private prevLonAccel = 0;
  private prevVertAccel = 0;
  private smoothedJerkLat = 0;
  private smoothedJerkLon = 0;
  private spillCooldown = 0;
  private dripCooldown = 0;
  private graceTimer = 0;
  private bubblePhase = 0;
  private prevBubblePhase = 0;

  /** Pre-allocated droplet pool (AGENTS.md §4.3: zero allocations during update/render). */
  readonly droplets: readonly SplashDroplet[] = Array.from({ length: MAX_DROPLETS }, () => ({
    active: false,
    prevX: 0,
    prevY: 0,
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    life: 0,
    maxLife: 0.5,
    size: 2,
  }));

  /** Toggles Tofu Mode on or off and returns the new `active` state. */
  toggle(): boolean {
    this.setActive(!this.active);
    return this.active;
  }

  /** Cycles through the 4 unlockable cosmetic drink skins (docs/DESIGN.md §5.2). */
  cycleSkin(): SodaSkin {
    const idx = SODA_SKINS.indexOf(this.skin);
    this.skin = SODA_SKINS[(idx + 1) % SODA_SKINS.length]!;
    return this.skin;
  }

  /** Explicitly sets Tofu Mode state. */
  setActive(nextActive: boolean): void {
    if (this.active === nextActive) return;
    this.active = nextActive;
    this.resetPhysicsState();
    if (nextActive) {
      this.spillCount = 0;
      this.trayLevel = 0;
      this.graceTimer = 0.25;
    }
  }

  resetPhysicsState(): void {
    this.sloshState = 'CALM';
    this.theta = 0;
    this.prevTheta = 0;
    this.thetaVel = 0;
    this.crestWave = 0;
    this.prevCrestWave = 0;
    this.crestVel = 0;
    this.heaveY = 0;
    this.prevHeaveY = 0;
    this.heaveVel = 0;
    this.floatY = 0;
    this.prevFloatY = 0;
    this.floatVel = 0;
    this.floatTilt = 0;
    this.prevFloatTilt = 0;
    this.floatTiltVel = 0;
    this.wetLeft = 0;
    this.wetRight = 0;
    this.prevLatAccel = 0;
    this.prevLonAccel = 0;
    this.prevVertAccel = 0;
    this.smoothedJerkLat = 0;
    this.smoothedJerkLon = 0;
    this.spillCooldown = 0;
    this.dripCooldown = 0;
    this.spillFlash = 0;
    for (let i = 0; i < this.droplets.length; i++) {
      this.droplets[i]!.active = false;
    }
  }

  /** Effective peak wave height combining Mode 1 tilt, Mode 2 S-crest, and vertical heave. */
  get effectivePeakAngle(): number {
    return Math.abs(this.theta) + Math.abs(this.crestWave) * 0.45 + Math.max(0, -this.heaveY) * 0.03;
  }

  /** Normalized danger ratio `[0, 1.5]` comparing peak wave height against `tuning.sodaSpillThreshold`. */
  get dangerRatio(): number {
    if (!this.active) return 0;
    return this.effectivePeakAngle / Math.max(0.1, tuning.sodaSpillThreshold);
  }

  /**
   * Injects an instantaneous jerk impulse (e.g. from a gear shift or obstacle collision).
   * Ignored when Tofu Mode is off.
   */
  applyImpulse(impulse: number): void {
    if (!this.active || this.graceTimer > 0) return;
    const g = tuning.sodaSensitivity;
    this.thetaVel += impulse * g * 1.35;
    this.crestVel += impulse * g * 2.4;
    this.heaveVel -= Math.abs(impulse) * 18;
  }

  /**
   * Advances multi-mode liquid dynamics by fixed step `dt`.
   * Does nothing when Tofu Mode (`this.active`) is false.
   */
  update(dt: number, motion: SodaMotionInput, onSpill?: () => void): void {
    if (!this.active) return;

    // Save previous step state for smooth render interpolation
    this.prevTheta = this.theta;
    this.prevCrestWave = this.crestWave;
    this.prevHeaveY = this.heaveY;
    this.prevFloatY = this.floatY;
    this.prevFloatTilt = this.floatTilt;
    this.prevBubblePhase = this.bubblePhase;

    const safeDt = Math.max(1e-4, dt);
    this.bubblePhase += dt * (2.2 + motion.speedRatio * 3.8);

    if (this.graceTimer > 0) {
      this.graceTimer = Math.max(0, this.graceTimer - dt);
      this.prevLatAccel = motion.lateralAccel;
      this.prevLonAccel = motion.longitudinalAccel;
      this.prevVertAccel = motion.verticalAccel;
    }

    if (this.spillCooldown > 0) {
      this.spillCooldown = Math.max(0, this.spillCooldown - dt);
    }
    if (this.dripCooldown > 0) {
      this.dripCooldown = Math.max(0, this.dripCooldown - dt);
    }
    if (this.spillFlash > 0) {
      this.spillFlash = Math.max(0, this.spillFlash - dt * 2.2);
    }

    // 1. Differentiate acceleration -> jerk j
    const jLat = (motion.lateralAccel - this.prevLatAccel) / safeDt;
    const jLon = (motion.longitudinalAccel - this.prevLonAccel) / safeDt;
    const jVert = (motion.verticalAccel - this.prevVertAccel) / safeDt;
    this.prevLatAccel = motion.lateralAccel;
    this.prevLonAccel = motion.longitudinalAccel;
    this.prevVertAccel = motion.verticalAccel;

    // Asymmetric jerk: Unloading (releasing steer towards 0 / easing out of a turn)
    // is a relaxing recovery, not a violent impact. Heavily attenuate unloading jerk
    // so corner exit glides the liquid smoothly to rest without whipping over the opposite rim.
    const isUnloadingLat = motion.lateralAccel * jLat < 0;
    const effectiveJLat = isUnloadingLat ? jLat * 0.15 : jLat;

    const jerkBlend = 1 - Math.exp(-28 * dt);
    const clampedJLat = this.graceTimer > 0 ? 0 : Math.max(-30, Math.min(30, effectiveJLat));
    const clampedJLon = this.graceTimer > 0 ? 0 : Math.max(-30, Math.min(30, jLon));
    this.smoothedJerkLat += (clampedJLat - this.smoothedJerkLat) * jerkBlend;
    this.smoothedJerkLon += (clampedJLon - this.smoothedJerkLon) * jerkBlend;

    // Off-road kerb & grass vibration excites both slosh and vertical heave.
    // Scaled realistically so grazing the rumble strip creates a palpable buzz
    // without instantly blowing the cup rim.
    const offRoadWave = motion.isOffRoad
      ? Math.sin(this.bubblePhase * 7.5) * (0.2 + motion.speedRatio * 0.8) * 5.0
      : 0;

    // 2. Mode 1: Fundamental pendulum slosh (driven by BOTH sustained G-force AND jerk!)
    // Sustained cornering/braking tilts the equilibrium surface; jerk excites oscillation.
    const k1 = tuning.sodaStiffness;
    const c1 = tuning.sodaDamping;
    const g = tuning.sodaSensitivity;

    // Gentle progressive tilt during cornering/braking: committed turns tilt the liquid
    // by ~25-40% of the cup, leaving ample headroom so corner exit never spills.
    const sustainedDrive =
      (motion.lateralAccel * 2.8 + motion.longitudinalAccel * 2.6) * g;
    const jerkDrive =
      (this.smoothedJerkLat * 0.50 + this.smoothedJerkLon * 0.35 + offRoadWave) * g;

    const thetaAccel = -k1 * this.theta - c1 * this.thetaVel + sustainedDrive + jerkDrive;
    this.thetaVel += thetaAccel * dt;
    this.theta += this.thetaVel * dt;
    this.theta = Math.max(-1.5, Math.min(1.5, this.theta));

    // 3. Mode 2: Second-harmonic S-wave crest (faster surface curl driven by jerk + mode coupling)
    const k2 = k1 * 2.5;
    const c2 = c1 * 1.35;
    // Damped mode coupling: pendulum return-to-center does NOT curl waves over the opposite rim.
    const thetaCoupling =
      Math.abs(this.theta) > 0.4 ? -this.thetaVel * 0.85 : -this.thetaVel * 0.35;
    const crestDrive =
      (this.smoothedJerkLat * 0.65 + thetaCoupling + offRoadWave * 0.7) * g;
    const crestAccel = -k2 * this.crestWave - c2 * this.crestVel + crestDrive;
    this.crestVel += crestAccel * dt;
    this.crestWave += this.crestVel * dt;
    this.crestWave = Math.max(-1.2, Math.min(1.2, this.crestWave));

    // 4. Mode 3: Vertical liquid heave (hill crests/dips + off-road bounce)
    const heaveDrive =
      (motion.verticalAccel * 38 + jVert * 1.8) * g +
      (motion.isOffRoad ? Math.cos(this.bubblePhase * 11) * 45 * motion.speedRatio : 0);
    const heaveAccel = -48 * this.heaveY - 5.5 * this.heaveVel + heaveDrive;
    this.heaveVel += heaveAccel * dt;
    this.heaveY += this.heaveVel * dt;
    this.heaveY = Math.max(-6, Math.min(6, this.heaveY));

    // 5. Buoyant Vanilla Ice-Cream Float & Cherry (follows surface heave & tilt with inertia)
    const targetFloatY = this.heaveY - Math.abs(this.theta) * 2.2;
    const floatAccel = -36 * (this.floatY - targetFloatY) - 4.2 * this.floatVel;
    this.floatVel += floatAccel * dt;
    this.floatY += this.floatVel * dt;

    const targetFloatTilt = this.theta * 0.85 + this.crestWave * 0.4;
    const floatTiltAccel = -32 * (this.floatTilt - targetFloatTilt) - 3.8 * this.floatTiltVel;
    this.floatTiltVel += floatTiltAccel * dt;
    this.floatTilt += this.floatTiltVel * dt;

    // 6. Update inner glass wall high-water wetness trails
    const leftClimb = Math.max(0, -this.theta - this.crestWave * 0.35);
    const rightClimb = Math.max(0, this.theta + this.crestWave * 0.35);
    const threshold = Math.max(0.1, tuning.sodaSpillThreshold);
    this.wetLeft = Math.max(this.wetLeft * Math.exp(-0.6 * dt), Math.min(1, leftClimb / threshold));
    this.wetRight = Math.max(
      this.wetRight * Math.exp(-0.6 * dt),
      Math.min(1, rightClimb / threshold),
    );

    // 7. Evaluate qualitative slosh state & trigger rim overflow / spill events
    const danger = this.dangerRatio;
    const spillSide: -1 | 1 = this.theta + this.crestWave * 0.3 >= 0 ? 1 : -1;

    if (danger >= 1.0 && this.graceTimer <= 0) {
      this.sloshState = 'SPILLING';
      // Continuous overflow stream while above the rim
      if (this.dripCooldown <= 0) {
        this.spawnSplashDroplets(spillSide, 3, danger);
        this.dripCooldown = 0.06;
      }
      if (this.spillCooldown <= 0) {
        this.spillCount++;
        this.spillCooldown = 0.65;
        this.spillFlash = 1.0;
        this.trayLevel = Math.min(1, this.trayLevel + 0.25);
        this.thetaVel *= 0.72;
        this.spawnSplashDroplets(spillSide, 9, danger);
        onSpill?.();
      }
    } else if (danger >= 0.72) {
      this.sloshState = 'CRESTING';
      // Occasional warning rim droplet when cresting right on the lip
      if (danger > 0.86 && this.dripCooldown <= 0) {
        this.spawnSplashDroplets(spillSide, 1, danger * 0.7);
        this.dripCooldown = 0.16;
      }
    } else if (danger >= 0.32) {
      this.sloshState = 'SLOSHING';
    } else {
      this.sloshState = 'CALM';
    }

    // 8. Advance active splash droplets with interpolation history
    for (let i = 0; i < this.droplets.length; i++) {
      const d = this.droplets[i]!;
      if (!d.active) continue;
      d.prevX = d.x;
      d.prevY = d.y;
      d.life += dt;
      if (d.life >= d.maxLife) {
        d.active = false;
        continue;
      }
      d.x += d.vx * dt;
      d.y += d.vy * dt;
      d.vy += 165 * dt; // gravity onto dashboard saucer tray
      // Bounce/settle on saucer tray at y = 20
      if (d.y >= 20 && d.vy > 0) {
        d.y = 20;
        d.vy = -d.vy * 0.25;
        d.vx *= 0.6;
      }
    }
  }

  private spawnSplashDroplets(side: -1 | 1, count: number, intensity = 1): void {
    let spawned = 0;
    for (let i = 0; i < this.droplets.length && spawned < count; i++) {
      const d = this.droplets[i]!;
      if (d.active) continue;
      const idx = spawned + 1;
      const startX = side * (16 + (idx % 3) * 2);
      const startY = -18 + (idx % 2) * 2;
      d.active = true;
      d.prevX = startX;
      d.prevY = startY;
      d.x = startX;
      d.y = startY;
      d.vx = side * (16 + idx * 6.5) * Math.min(1.5, intensity);
      d.vy = -(22 + (idx % 4) * 10) * Math.min(1.4, intensity);
      d.life = 0;
      d.maxLife = 0.48 + (idx % 3) * 0.1;
      d.size = idx % 2 === 0 ? 3 : 2;
      spawned++;
    }
  }

  /** Interpolated bubble animation phase for smooth 60/144Hz rendering. */
  getInterpolatedBubblePhase(alpha: number): number {
    return this.prevBubblePhase + (this.bubblePhase - this.prevBubblePhase) * alpha;
  }
}

/**
 * Renders the 120×80 px dashboard Melon Cream Soda inset at bottom-left of the `<canvas>`
 * ONLY when Tofu Mode (`soda.active`) is enabled (AGENTS.md §4.9, docs/DESIGN.md §5).
 *
 * Uses multi-mode wave interpolation (`theta`, `crestWave`, `heaveY`, `floatY`, `floatTilt`)
 * so the liquid surface, foam crest, ice cubes, vanilla float, and droplets animate at full
 * display refresh rate.
 */
export function drawMelonSodaInset(
  ctx: CanvasRenderingContext2D,
  soda: MelonSoda,
  canvasHeight: number,
  alpha = 1,
): void {
  if (!soda.active) return;

  const boxW = 120;
  const boxH = 80;
  const boxX = 14;
  const boxY = canvasHeight - boxH - 14;

  // Interpolate all physical degrees of freedom
  const theta = soda.prevTheta + (soda.theta - soda.prevTheta) * alpha;
  const crest = soda.prevCrestWave + (soda.crestWave - soda.prevCrestWave) * alpha;
  const heave = soda.prevHeaveY + (soda.heaveY - soda.prevHeaveY) * alpha;
  const floatY = soda.prevFloatY + (soda.floatY - soda.prevFloatY) * alpha;
  const floatTilt = soda.prevFloatTilt + (soda.floatTilt - soda.prevFloatTilt) * alpha;
  const phase = soda.getInterpolatedBubblePhase(alpha);

  const threshold = Math.max(0.1, tuning.sodaSpillThreshold);
  const peakAngle = Math.abs(theta) + Math.abs(crest) * 0.45 + Math.max(0, -heave) * 0.03;
  const danger = Math.min(1.25, peakAngle / threshold);
  const isSpilling = soda.spillFlash > 0.05 || soda.sloshState === 'SPILLING';
  const isCresting = soda.sloshState === 'CRESTING';

  ctx.save();
  ctx.translate(boxX, boxY);

  // 1. Dashboard inset panel background & reactive neon border
  ctx.fillStyle = isSpilling
    ? 'rgba(46, 6, 36, 0.94)'
    : isCresting
      ? 'rgba(28, 10, 44, 0.92)'
      : 'rgba(13, 2, 33, 0.9)';
  ctx.fillRect(0, 0, boxW, boxH);

  ctx.strokeStyle = isSpilling ? '#ff2a6d' : isCresting ? '#ffd319' : '#14f1d9';
  ctx.lineWidth = isSpilling || isCresting ? 1.5 : 1;
  ctx.strokeRect(0.5, 0.5, boxW - 1, boxH - 1);

  // Header strip with live state label ("CALM", "SLOSH", "CREST!", "SPILL!") + skin short label
  ctx.fillStyle = isSpilling ? '#ff2a6d' : isCresting ? '#522608' : '#1b0938';
  ctx.fillRect(1, 1, boxW - 2, 13);

  ctx.fillStyle = isSpilling ? '#ffffff' : isCresting ? '#ffd319' : '#14f1d9';
  ctx.font = 'bold 8px monospace';
  const skinShort =
    soda.skin === 'tofu-cup'
      ? 'TOFU CUP'
      : soda.skin === 'pocari'
        ? 'POCARI'
        : soda.skin === 'boss-coffee'
          ? 'BOSS CAN'
          : 'SODA';
  const headerText = isSpilling
    ? 'SPILL! -GROOVE'
    : isCresting
      ? `CREST! ${skinShort}`
      : soda.sloshState === 'SLOSHING'
        ? `SLOSH // ${skinShort}`
        : `${skinShort} // x2`;
  ctx.fillText(headerText, 5, 10);

  // Danger meter bar on right side of header
  const meterW = 24;
  ctx.fillStyle = '#090117';
  ctx.fillRect(boxW - meterW - 4, 4, meterW, 6);
  ctx.fillStyle = danger >= 0.95 ? '#ff2a6d' : danger >= 0.7 ? '#ffd319' : '#00f59b';
  ctx.fillRect(
    boxW - meterW - 4,
    4,
    Math.min(meterW, Math.round(meterW * Math.min(1, danger))),
    6,
  );

  // 2. Cup-holder saucer tray & pixel-art pedestal base at bottom center
  const cx = Math.floor(boxW / 2);
  const cy = 48;

  ctx.fillStyle = '#241138';
  ctx.fillRect(cx - 36, 70, 72, 5);
  ctx.strokeStyle = '#5b2d86';
  ctx.lineWidth = 1;
  ctx.strokeRect(cx - 36.5, 70.5, 73, 5);

  const liquidColor =
    soda.skin === 'tofu-cup'
      ? '#7ce8ff'
      : soda.skin === 'pocari'
        ? '#45d9ff'
        : soda.skin === 'boss-coffee'
          ? '#a85c28'
          : '#00f59b';
  const liquidDeepColor =
    soda.skin === 'tofu-cup'
      ? '#38b6ff'
      : soda.skin === 'boss-coffee'
        ? '#6e3611'
        : '#00b874';
  const liquidHighlight =
    soda.skin === 'tofu-cup'
      ? '#d8f8ff'
      : soda.skin === 'boss-coffee'
        ? '#e8a870'
        : '#9effdc';

  if (soda.trayLevel > 0.01) {
    // Persistent spilled puddle on the saucer tray that grows with each spill
    const puddleW = Math.round(22 + soda.trayLevel * 44);
    ctx.fillStyle = liquidColor;
    ctx.globalAlpha = 0.78;
    ctx.fillRect(cx - Math.floor(puddleW / 2), 68, puddleW, 3);
    ctx.globalAlpha = 1;
  }

  // 3. Draw container exterior/pedestal, interior clip & multi-mode wave surface around (cx, cy)
  ctx.save();
  ctx.translate(cx, cy);

  const isCan = soda.skin === 'pocari' || soda.skin === 'boss-coffee';
  const topHalfW = isCan ? 16 : 19;
  const botHalfW = isCan ? 16 : 12;

  // If Melon Soda kissaten pedestal glass, draw pixel-art glass stem & foot + striped bendy straw
  if (soda.skin === 'melon-soda') {
    // Glass pedestal stem & foot
    ctx.fillStyle = '#9bd4e8';
    ctx.fillRect(-4, 18, 8, 3);
    ctx.fillRect(-11, 20, 22, 2);
    // Red-and-white striped retro bendy straw emerging from the left rim
    for (let sy = -31; sy < -16; sy += 2) {
      ctx.fillStyle = (sy & 2) === 0 ? '#ff2a6d' : '#ffffff';
      ctx.fillRect(-15, sy, 3, 2);
    }
    ctx.fillStyle = '#ff2a6d';
    ctx.fillRect(-20, -31, 6, 2);
  } else if (soda.skin === 'tofu-cup') {
    // Initial D pleated white paper cup exterior silhouette & rolled rim
    ctx.fillStyle = '#e8eef5';
    ctx.beginPath();
    ctx.moveTo(-20, -22);
    ctx.lineTo(20, -22);
    ctx.lineTo(13, 21);
    ctx.lineTo(-13, 21);
    ctx.closePath();
    ctx.fill();
    // Rolled white paper cup lip
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(-21, -24, 42, 3);
  } else if (isCan) {
    // Aluminum drink can body (Pocari blue or Boss Coffee gold/navy)
    ctx.fillStyle = soda.skin === 'pocari' ? '#0066cc' : '#c88a2b';
    ctx.fillRect(-17, -21, 34, 42);
    // Metallic silver top & bottom can rims + pull tab
    ctx.fillStyle = '#d8e4f0';
    ctx.fillRect(-16, -23, 32, 2);
    ctx.fillRect(-16, 20, 32, 2);
    ctx.fillRect(-3, -25, 6, 2);
    // Decorative top band / wave strip above cutaway window
    if (soda.skin === 'pocari') {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(-16, -18, 32, 2);
    } else {
      ctx.fillStyle = '#1b0938';
      ctx.fillRect(-16, -19, 32, 3);
      ctx.fillStyle = '#ffd319';
      ctx.fillRect(-3, -19, 6, 3);
    }
  }

  // Clip interior of the glass trapezoid (or cutaway sight-window on cans)
  ctx.save();
  ctx.beginPath();
  if (isCan) {
    ctx.rect(-14, -15, 28, 33);
  } else {
    ctx.moveTo(-topHalfW, -22);
    ctx.lineTo(topHalfW, -22);
    ctx.lineTo(botHalfW, 18);
    ctx.lineTo(-botHalfW, 18);
    ctx.closePath();
  }
  ctx.clip();

  // Interior dark backdrop
  ctx.fillStyle =
    soda.skin === 'tofu-cup' ? 'rgba(28, 36, 58, 0.88)' : 'rgba(18, 10, 38, 0.84)';
  ctx.fillRect(-24, -26, 48, 50);

  // Wet condensation trails on left/right inner glass walls from recent sloshes
  if (soda.wetLeft > 0.05) {
    ctx.fillStyle = liquidColor;
    ctx.globalAlpha = 0.28 * soda.wetLeft;
    const hLeft = soda.wetLeft * 15;
    ctx.fillRect(-topHalfW, -7 - hLeft, 3, hLeft + 4);
    ctx.globalAlpha = 1;
  }
  if (soda.wetRight > 0.05) {
    ctx.fillStyle = liquidColor;
    ctx.globalAlpha = 0.28 * soda.wetRight;
    const hRight = soda.wetRight * 15;
    ctx.fillRect(topHalfW - 3, -7 - hRight, 3, hRight + 4);
    ctx.globalAlpha = 1;
  }

  // Compute multi-point curved wave meniscus across x in [-22, +22]
  // Base resting level is y = -7 (15 px below the rim at y = -22).
  // At `theta = threshold`, the wave edge reaches right up to the rim (`y = -22`)!
  const baseLevelY = -7 + heave * 0.85;
  const slopeScale = 14 / threshold;
  const waveYAt = (xNorm: number): number => {
    const linearTilt = xNorm * theta * slopeScale;
    const sWave = Math.sin(xNorm * Math.PI) * crest * (6.5 / threshold);
    const ripple =
      Math.sin(xNorm * 4.5 + phase * 3.2) * Math.min(2.2, (Math.abs(theta) + Math.abs(crest)) * 2.5);
    return baseLevelY - linearTilt - sWave + ripple;
  };

  // Draw lower deep liquid gradient layer
  ctx.fillStyle = liquidDeepColor;
  ctx.beginPath();
  ctx.moveTo(-22, 24);
  for (let s = 0; s <= 8; s++) {
    const xNorm = -1 + (s / 8) * 2;
    ctx.lineTo(xNorm * 22, waveYAt(xNorm) + 4);
  }
  ctx.lineTo(22, 24);
  ctx.closePath();
  ctx.fill();

  // Draw upper liquid body following the curved wave
  ctx.fillStyle = liquidColor;
  ctx.beginPath();
  ctx.moveTo(-22, 10);
  for (let s = 0; s <= 12; s++) {
    const xNorm = -1 + (s / 12) * 2;
    ctx.lineTo(xNorm * 22, waveYAt(xNorm));
  }
  ctx.lineTo(22, 10);
  ctx.closePath();
  ctx.fill();

  // Draw bright foam meniscus crest along the wave top
  ctx.strokeStyle = liquidHighlight;
  ctx.lineWidth = danger > 0.65 ? 2.5 : 1.8;
  ctx.beginPath();
  for (let s = 0; s <= 12; s++) {
    const xNorm = -1 + (s / 12) * 2;
    const wx = xNorm * 22;
    const wy = waveYAt(xNorm);
    if (s === 0) ctx.moveTo(wx, wy);
    else ctx.lineTo(wx, wy);
  }
  ctx.stroke();

  if (soda.skin === 'melon-soda') {
    // Fluted kissaten vertical glass rib highlights
    ctx.fillStyle = 'rgba(255, 255, 255, 0.14)';
    ctx.fillRect(-10, -20, 2, 36);
    ctx.fillRect(0, -20, 2, 36);
    ctx.fillRect(9, -20, 2, 36);

    // Rising carbonation fizz bubbles
    ctx.fillStyle = '#e0fff0';
    for (let b = 0; b < 6; b++) {
      const bx = -11 + b * 4.4 + Math.sin(phase * 2 + b) * 1.2;
      const topLimit = waveYAt(bx / 22) + 2;
      const by = 16 - ((phase * 14 + b * 6.5) % Math.max(4, 16 - topLimit));
      if (by > topLimit) {
        ctx.fillRect(Math.round(bx), Math.round(by), 2, 2);
      }
    }

    // Two independent buoyant pixel-art ice cubes riding the local wave height
    const icePositions = [-8, 7] as const;
    for (let i = 0; i < icePositions.length; i++) {
      const ix = Math.round(icePositions[i]! + floatTilt * 2.5);
      const iy = Math.round(waveYAt(ix / 22) + 2);
      ctx.save();
      ctx.translate(ix, iy);
      ctx.rotate(floatTilt * 0.4 + (i === 0 ? -0.12 : 0.15));
      ctx.fillStyle = 'rgba(225, 255, 252, 0.62)';
      ctx.fillRect(-3, -3, 6, 5);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(-3, -3, 5, 1);
      ctx.fillRect(-3, -3, 1, 4);
      ctx.restore();
    }

    // Buoyant pixel-art Vanilla Ice Cream Scoop + Maraschino Cherry bobbing & tilting on the wave
    const scoopX = Math.round(floatTilt * 3.8);
    const scoopY = Math.round(waveYAt(scoopX / 22) + 1 + floatY * 0.35);
    ctx.save();
    ctx.translate(scoopX, scoopY);
    ctx.rotate(floatTilt * 0.55);

    // Pixel-stepped dome for vanilla scoop
    ctx.fillStyle = '#fff6d6';
    ctx.fillRect(-6, -4, 12, 4);
    ctx.fillRect(-5, -6, 10, 2);
    ctx.fillRect(-3, -7, 6, 1);
    // Scalloped cream base
    ctx.fillStyle = '#ffebb3';
    ctx.fillRect(-7, -1, 14, 2);

    // Pixel-art Maraschino cherry + highlight + stem
    ctx.fillStyle = '#ff2a6d';
    ctx.fillRect(-1, -10, 5, 4);
    ctx.fillRect(0, -11, 3, 6);
    ctx.fillStyle = '#ff9ebb';
    ctx.fillRect(0, -10, 1, 1);

    ctx.strokeStyle = '#ff5c93';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(1, -11);
    ctx.quadraticCurveTo(4, -15, 6, -16);
    ctx.stroke();

    ctx.restore();
  } else if (soda.skin === 'tofu-cup') {
    // Subtle water surface specular glint in the Initial D paper cup
    const glintX = Math.round(floatTilt * 4);
    const glintY = Math.round(waveYAt(glintX / 22) + 2);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(glintX - 5, glintY, 10, 1);
  }

  ctx.restore(); // end interior clip

  // 4. Container rim & outline
  ctx.strokeStyle = isSpilling ? '#ff2a6d' : isCresting ? '#ffd319' : '#c8f6ff';
  ctx.lineWidth = 1.5;
  if (isCan) {
    ctx.strokeRect(-14.5, -15.5, 29, 34);
  } else {
    ctx.beginPath();
    ctx.moveTo(-topHalfW, -22);
    ctx.lineTo(-botHalfW, 18);
    ctx.lineTo(botHalfW, 18);
    ctx.lineTo(topHalfW, -22);
    ctx.stroke();
  }

  // Spill threshold warning ticks at the lip
  ctx.fillStyle = isSpilling || isCresting ? '#ff2a6d' : '#14f1d9';
  ctx.fillRect(-topHalfW - 3, -21, 3, 2);
  ctx.fillRect(topHalfW, -21, 3, 2);

  // 5. Render interpolated splash droplets arcing over the rim onto the saucer tray
  ctx.fillStyle = liquidColor;
  for (let i = 0; i < soda.droplets.length; i++) {
    const d = soda.droplets[i]!;
    if (!d.active) continue;
    const dx = d.prevX + (d.x - d.prevX) * alpha;
    const dy = d.prevY + (d.y - d.prevY) * alpha;
    ctx.fillRect(Math.round(dx), Math.round(dy), d.size, d.size);
  }

  ctx.restore();
  ctx.restore();
}
