import type { PropKind } from '@src/road/RoadSegment';
import type { GrooveTier, PlayerCar } from './PlayerCar';
import type { CollisionEvent } from './TrafficAndProps';

export type ParticleKind = 'smoke' | 'spark' | 'debris' | 'flame';

export interface Particle {
  active: boolean;
  kind: ParticleKind;
  prevX: number;
  prevY: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  life: number;
  maxLife: number;
  color: string;
  secondaryColor: string;
  gravity: number;
}

const MAX_PARTICLES = 140;

const PROP_DEBRIS_COLORS: Readonly<Record<PropKind, readonly [string, string, string]>> = {
  palm: ['#14f1d9', '#ff3cac', '#5b2d86'],
  lamp: ['#fff3b0', '#ffd319', '#05d9e8'],
  billboard: ['#ff2a6d', '#05d9e8', '#ffd319'],
};

/**
 * Zero-GC pixel-art particle system for drift tire smoke, charged drift sparks,
 * beat-shift exhaust flames, off-road dust kickup, and collision debris (AGENTS.md §4.3 & §5 M7).
 *
 * Pure TypeScript module (zero React imports). Mutates a fixed pre-allocated pool of
 * `MAX_PARTICLES` structs in `update(dt)` and interpolates screen positions with `alpha` in `render()`.
 */
export class ParticleSystem {
  readonly pool: readonly Particle[] = Array.from({ length: MAX_PARTICLES }, () => ({
    active: false,
    kind: 'smoke',
    prevX: 0,
    prevY: 0,
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    size: 3,
    life: 0,
    maxLife: 0.4,
    color: '#05d9e8',
    secondaryColor: '#ffffff',
    gravity: 0,
  }));

  private writeCursor = 0;
  private smokeAccum = 0;
  private sparkAccum = 0;
  private prngState = 0x5f3759df;

  /** Counts currently active particles (useful for telemetry & unit tests). */
  get activeCount(): number {
    let count = 0;
    for (let i = 0; i < this.pool.length; i++) {
      if (this.pool[i]!.active) count++;
    }
    return count;
  }

  /** Clears all active particles. */
  reset(): void {
    this.smokeAccum = 0;
    this.sparkAccum = 0;
    for (let i = 0; i < this.pool.length; i++) {
      this.pool[i]!.active = false;
    }
  }

  /** Fast deterministic LCG float in `[0, 1)` so particle emission never allocates or calls Math.random. */
  private nextUnit(): number {
    this.prngState = (Math.imul(this.prngState, 1664525) + 1013904223) >>> 0;
    return this.prngState / 0x100000000;
  }

  private nextRange(min: number, max: number): number {
    return min + this.nextUnit() * (max - min);
  }

  private allocate(): Particle {
    for (let n = 0; n < this.pool.length; n++) {
      const idx = (this.writeCursor + n) % this.pool.length;
      const p = this.pool[idx]!;
      if (!p.active) {
        this.writeCursor = (idx + 1) % this.pool.length;
        return p;
      }
    }
    const p = this.pool[this.writeCursor]!;
    this.writeCursor = (this.writeCursor + 1) % this.pool.length;
    return p;
  }

  /**
   * Advances active particles and spawns continuous tire smoke / sparks / off-road dust
   * from the player car's rear wheels.
   */
  update(
    dt: number,
    car: PlayerCar,
    canvasWidth: number,
    canvasHeight: number,
    grooveTier: GrooveTier = car.grooveTier,
  ): void {
    // 1. Advance existing particles
    for (let i = 0; i < this.pool.length; i++) {
      const p = this.pool[i]!;
      if (!p.active) continue;
      p.prevX = p.x;
      p.prevY = p.y;
      p.life += dt;
      if (p.life >= p.maxLife) {
        p.active = false;
        continue;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += p.gravity * dt;

      if (p.kind === 'smoke') {
        p.vx *= Math.exp(-2.8 * dt);
      } else if (p.kind === 'spark' || p.kind === 'debris') {
        // Bounce sparks/debris off the asphalt plane near bottom of screen
        const groundY = canvasHeight - 14;
        if (p.y >= groundY && p.vy > 0) {
          p.y = groundY;
          p.vy = -p.vy * 0.42;
          p.vx *= 0.78;
        }
      }
    }

    // 2. Continuous emission from rear tires when drifting or driving off-road
    const speedRatio = Math.min(1, car.speedRatio);
    if (speedRatio < 0.18) return;

    const bounceAmp = car.isOffRoad ? 3.2 * speedRatio : 0.8 * speedRatio;
    const bounceY = Math.sin(car.bouncePhase) * bounceAmp;
    const pitchY = car.pitch * 6;
    const carCx = canvasWidth * 0.5 + car.yaw * 5;
    const carBaseY = canvasHeight - 26 + bounceY + pitchY;

    if (car.isDrifting) {
      const smokeRate = 48 * (0.5 + speedRatio * 0.6);
      this.smokeAccum += dt * smokeRate;
      const slideDir = -car.driftDir; // smoke trails opposite to drift nose direction
      const isChargedDrift = car.driftTime >= 0.75 || grooveTier === 'SSS';

      while (this.smokeAccum >= 1) {
        this.smokeAccum -= 1;
        const tireSide = this.nextUnit() < 0.5 ? -1 : 1;
        const p = this.allocate();
        const startX = carCx + tireSide * 41 + this.nextRange(-4, 4);
        const startY = carBaseY - 2 + this.nextRange(-2, 2);
        p.active = true;
        p.kind = 'smoke';
        p.prevX = startX;
        p.prevY = startY;
        p.x = startX;
        p.y = startY;
        p.vx = slideDir * this.nextRange(28, 76) + tireSide * this.nextRange(4, 16);
        p.vy = this.nextRange(-26, -8);
        p.size = this.nextUnit() < 0.45 ? 4 : 3;
        p.life = 0;
        p.maxLife = this.nextRange(0.24, 0.44);
        p.gravity = -18;
        if (car.isOffRoad) {
          p.color = '#b478d2';
          p.secondaryColor = '#5b2d86';
        } else if (isChargedDrift) {
          p.color = this.nextUnit() < 0.55 ? '#05d9e8' : '#ff4f9a';
          p.secondaryColor = '#d8f8ff';
        } else {
          p.color = '#05d9e8';
          p.secondaryColor = '#e0fbfc';
        }
      }

      // Charged drift tire sparks
      if (isChargedDrift && !car.isOffRoad) {
        this.sparkAccum += dt * 36;
        while (this.sparkAccum >= 1) {
          this.sparkAccum -= 1;
          const p = this.allocate();
          const tireSide = car.driftDir > 0 ? -1 : 1; // outside loaded tire throws sparks
          const startX = carCx + tireSide * 43 + this.nextRange(-3, 3);
          const startY = carBaseY - 1;
          p.active = true;
          p.kind = 'spark';
          p.prevX = startX;
          p.prevY = startY;
          p.x = startX;
          p.y = startY;
          p.vx = slideDir * this.nextRange(55, 130) + this.nextRange(-20, 20);
          p.vy = this.nextRange(-68, -22);
          p.size = 2;
          p.life = 0;
          p.maxLife = this.nextRange(0.18, 0.34);
          p.color = this.nextUnit() < 0.5 ? '#ffd319' : '#ff2a6d';
          p.secondaryColor = '#ffffff';
          p.gravity = 210;
        }
      }
    } else if (car.isOffRoad) {
      // Off-road shoulder grass/gravel kickup
      this.smokeAccum += dt * 26 * speedRatio;
      while (this.smokeAccum >= 1) {
        this.smokeAccum -= 1;
        const tireSide = this.nextUnit() < 0.5 ? -1 : 1;
        const p = this.allocate();
        const startX = carCx + tireSide * 42 + this.nextRange(-3, 3);
        const startY = carBaseY - 1;
        p.active = true;
        p.kind = 'debris';
        p.prevX = startX;
        p.prevY = startY;
        p.x = startX;
        p.y = startY;
        p.vx = tireSide * this.nextRange(12, 48) - car.steer * 35;
        p.vy = this.nextRange(-52, -20);
        p.size = this.nextUnit() < 0.5 ? 3 : 2;
        p.life = 0;
        p.maxLife = this.nextRange(0.2, 0.36);
        p.color = this.nextUnit() < 0.5 ? '#14f1d9' : '#9d4edd';
        p.secondaryColor = '#3a1d5c';
        p.gravity = 190;
      }
    }
  }

  /**
   * Emits a celebratory burst of exhaust flames and neon sparks on a clean drift exit
   * or a beat-synced gear shift (`PERFECT` / `GOOD`).
   */
  emitBoostOrShiftBurst(
    car: PlayerCar,
    canvasWidth: number,
    canvasHeight: number,
    tier: 'PERFECT' | 'GOOD' | 'DRIFT_EXIT',
  ): void {
    const carCx = canvasWidth * 0.5 + car.yaw * 5;
    const carBaseY = canvasHeight - 26 + car.pitch * 6;
    const count = tier === 'PERFECT' ? 16 : tier === 'DRIFT_EXIT' ? 14 : 8;

    for (let i = 0; i < count; i++) {
      const p = this.allocate();
      const exhaustSide = i % 2 === 0 ? -1 : 1;
      const startX = carCx + exhaustSide * 23 + this.nextRange(-2, 2);
      const startY = carBaseY - 6 + this.nextRange(-1, 2);
      p.active = true;
      p.kind = i % 3 === 0 ? 'spark' : 'flame';
      p.prevX = startX;
      p.prevY = startY;
      p.x = startX;
      p.y = startY;
      p.vx = exhaustSide * this.nextRange(6, 42) + this.nextRange(-18, 18);
      p.vy = this.nextRange(12, 54);
      p.size = p.kind === 'flame' ? 3 : 2;
      p.life = 0;
      p.maxLife = this.nextRange(0.16, 0.32);
      p.gravity = p.kind === 'spark' ? 120 : -30;
      if (tier === 'PERFECT') {
        p.color = i % 2 === 0 ? '#00f59b' : '#ffd319';
        p.secondaryColor = '#ffffff';
      } else if (tier === 'DRIFT_EXIT') {
        p.color = i % 2 === 0 ? '#05d9e8' : '#ff2a6d';
        p.secondaryColor = '#fff3b0';
      } else {
        p.color = '#05d9e8';
        p.secondaryColor = '#d8f8ff';
      }
    }
  }

  /**
   * Emits a dramatic directional burst of pixel-art sparks and obstacle debris when the player
   * sideswipes a Kei Truck, rear-ends traffic, or clips a roadside palm/lamp/billboard.
   */
  emitCollisionBurst(
    event: CollisionEvent,
    car: PlayerCar,
    canvasWidth: number,
    canvasHeight: number,
  ): void {
    const carCx = canvasWidth * 0.5 + car.yaw * 5;
    const carBaseY = canvasHeight - 28 + car.pitch * 6;
    const impactSide = -event.side; // side of the car that made contact
    const originX = carCx + impactSide * 34;
    const originY = carBaseY - 16;

    const count = event.outcome === 'truckKnockedOff' ? 26 : 22;
    for (let i = 0; i < count; i++) {
      const p = this.allocate();
      const isDebris = i % 3 === 0;
      p.active = true;
      p.kind = isDebris ? 'debris' : 'spark';
      p.prevX = originX;
      p.prevY = originY;
      p.x = originX + this.nextRange(-8, 8);
      p.y = originY + this.nextRange(-6, 6);

      const dirSpread = event.side * this.nextRange(25, 145) + this.nextRange(-65, 65);
      p.vx = dirSpread;
      p.vy = this.nextRange(-125, -25);
      p.size = isDebris ? 3 : 2;
      p.life = 0;
      p.maxLife = this.nextRange(0.28, 0.58);
      p.gravity = 240;

      if (event.obstacle === 'prop') {
        const palette = PROP_DEBRIS_COLORS[event.propKind];
        p.color = palette[i % palette.length]!;
        p.secondaryColor = '#ffffff';
      } else if (event.outcome === 'truckKnockedOff') {
        p.color = i % 2 === 0 ? '#05d9e8' : '#ffd319';
        p.secondaryColor = '#ff2a6d';
      } else {
        p.color = i % 2 === 0 ? '#ff2a6d' : '#ffd319';
        p.secondaryColor = '#fff3b0';
      }
    }
  }

  /**
   * Renders all active particles using interpolated coordinates and integer pixel snapping.
   * Zero allocations in `render()` (AGENTS.md §4.3).
   */
  render(ctx: CanvasRenderingContext2D, alpha = 1): void {
    ctx.save();
    for (let i = 0; i < this.pool.length; i++) {
      const p = this.pool[i]!;
      if (!p.active) continue;

      const t = Math.max(0, Math.min(1, p.life / Math.max(0.01, p.maxLife)));
      const px = Math.round(p.prevX + (p.x - p.prevX) * alpha);
      const py = Math.round(p.prevY + (p.y - p.prevY) * alpha);

      if (p.kind === 'smoke') {
        // Pixel-stepped expanding puff with dithered core
        const puffSize = Math.round(p.size + t * 5);
        const half = Math.floor(puffSize * 0.5);
        ctx.globalAlpha = Math.max(0, (1 - t) * 0.68);
        ctx.fillStyle = p.color;
        ctx.fillRect(px - half, py - half, puffSize, puffSize);
        if (t < 0.45) {
          ctx.fillStyle = p.secondaryColor;
          ctx.fillRect(px - 1, py - 1, 2, 2);
        }
      } else if (p.kind === 'flame') {
        const flameSize = Math.max(1, Math.round(p.size * (1 - t * 0.5)));
        ctx.globalAlpha = Math.max(0, 1 - t * 0.85);
        ctx.fillStyle = t < 0.35 ? p.secondaryColor : p.color;
        ctx.fillRect(px - 1, py - 1, flameSize + 1, flameSize);
      } else if (p.kind === 'spark') {
        ctx.globalAlpha = Math.max(0, 1 - t * 0.75);
        // Pixel streak along velocity vector
        const tailX = Math.round(px - p.vx * 0.018);
        const tailY = Math.round(py - p.vy * 0.018);
        ctx.fillStyle = p.color;
        ctx.fillRect(tailX, tailY, p.size, p.size);
        ctx.fillStyle = p.secondaryColor;
        ctx.fillRect(px, py, Math.max(1, p.size - 1), Math.max(1, p.size - 1));
      } else {
        // Pixel debris chip
        ctx.globalAlpha = Math.max(0, 1 - t * 0.7);
        ctx.fillStyle = p.color;
        ctx.fillRect(px - 1, py - 1, p.size, p.size);
        ctx.fillStyle = p.secondaryColor;
        ctx.fillRect(px, py, 1, 1);
      }
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  }
}
