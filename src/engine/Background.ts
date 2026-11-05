import { tuning } from '@src/config/tuning';
import type { StagePalette } from '@src/road/palette';

// ---------------------------------------------------------------------------
// Pre-allocated array sizes & geometry spans (AGENTS.md §4.3: ZERO GC in loop)
// ---------------------------------------------------------------------------
const MOUNTAIN_POINTS = 64;
const MOUNTAIN_SPAN = 960;
const STAR_COUNT = 48;
const SHOOTING_STAR_COUNT = 2;
const CITY_TOWERS = 32;
const CITY_SPAN = 640;
const CLOUD_COUNT = 8;
const RAIN_COUNT = 96;
const BIRD_COUNT = 6;

// Statically indexed constellation groups connecting actual star nodes in the sky
const CONSTELLATION_GROUPS: readonly (readonly number[])[] = [
  // Group 0: Cassiopeia (W)
  [0, 5, 5, 11, 11, 18, 18, 24],
  // Group 1: Northern Cross / Cygnus
  [2, 8, 8, 14, 14, 22, 6, 8, 8, 16],
  // Group 2: Orion's Belt & Bow
  [3, 9, 9, 15, 15, 23, 7, 9, 15, 27],
];

// Static color constants to avoid dynamic string interpolation in render()
const COLOR_WHITE = '#ffffff';
const COLOR_NIGHT_SKYLINE = '#080417';
const COLOR_BEACON_RED = '#ff2a75';
const COLOR_BEACON_CYAN = '#00f5d4';
const COLOR_RAIN = '#90d8ff';
const COLOR_WATER_DEEP = '#030514';

function hexToRgba(hex: string, alpha: number): string {
  const clean = hex.startsWith('#') ? hex.slice(1) : hex;
  let r = 0;
  let g = 0;
  let b = 0;
  if (clean.length === 3) {
    r = parseInt(clean[0]! + clean[0]!, 16);
    g = parseInt(clean[1]! + clean[1]!, 16);
    b = parseInt(clean[2]! + clean[2]!, 16);
  } else if (clean.length >= 6) {
    r = parseInt(clean.slice(0, 2), 16);
    g = parseInt(clean.slice(2, 4), 16);
    b = parseInt(clean.slice(4, 6), 16);
  }
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/**
 * 3-Tier Parallax Synthwave Skybox & Atmospheric Weather System (Fase 2):
 * - Layer 1: Lontanissimo (~0.10x) — calm deep water sea / majestic mountain ridges & chord-clipped sun/moon
 * - Layer 2: Intermedio (~0.45x) — dense pixel-art skyline with radio antennas & breathing window matrices
 * - Layer 3: Transizione (~0.85x) — shimmering vertical water reflections (Mayonaka Bay) & seamless horizon wash
 * - Weather & Celestial — procedural stepped clouds, beat-responsive lightning, 3-frame flap birds, constellations & shooting stars
 *
 * Performance Invariant (AGENTS.md §4.3): STRICT ZERO GC ALLOCATIONS per frame.
 */
export class Background {
  // Layer 1: Mountain / distant ridge geometry
  private readonly ridgeHeights = new Float32Array(MOUNTAIN_POINTS);
  private readonly hillHeights = new Float32Array(MOUNTAIN_POINTS);
  private readonly farRidgeHeights = new Float32Array(MOUNTAIN_POINTS);

  // Layer 1: Celestial starfield & constellations
  private readonly starX = new Float32Array(STAR_COUNT);
  private readonly starY = new Float32Array(STAR_COUNT);
  private readonly starPhase = new Float32Array(STAR_COUNT);
  private constellationTimer = 0;
  private constellationAlpha = 0;
  private activeConstellationGroup = 0;

  // Layer 1: Shooting stars
  private readonly shootingStarActive = new Uint8Array(SHOOTING_STAR_COUNT);
  private readonly shootingStarX = new Float32Array(SHOOTING_STAR_COUNT);
  private readonly shootingStarY = new Float32Array(SHOOTING_STAR_COUNT);
  private readonly shootingStarVx = new Float32Array(SHOOTING_STAR_COUNT);
  private readonly shootingStarVy = new Float32Array(SHOOTING_STAR_COUNT);
  private readonly shootingStarLife = new Float32Array(SHOOTING_STAR_COUNT);
  private shootingStarTimer = 0;

  // Layer 2: Dense multi-tier skyline
  private readonly towerWidths = new Uint8Array(CITY_TOWERS);
  private readonly towerHeights = new Uint8Array(CITY_TOWERS);
  private readonly towerStyle = new Uint8Array(CITY_TOWERS); // 0=plain, 1=stepped, 2=slant, 3=matrix
  private readonly towerAntennaH = new Uint8Array(CITY_TOWERS);
  private readonly towerBlinkPhase = new Float32Array(CITY_TOWERS);

  // Weather: Procedural Clouds
  private readonly cloudX = new Float32Array(CLOUD_COUNT);
  private readonly cloudY = new Float32Array(CLOUD_COUNT);
  private readonly cloudWidth = new Float32Array(CLOUD_COUNT);
  private readonly cloudHeight = new Float32Array(CLOUD_COUNT);
  private readonly cloudSpeed = new Float32Array(CLOUD_COUNT);

  // Weather: Rain & Beat Lightning
  private readonly rainX = new Float32Array(RAIN_COUNT);
  private readonly rainY = new Float32Array(RAIN_COUNT);
  private readonly rainSpeed = new Float32Array(RAIN_COUNT);
  private readonly rainLength = new Float32Array(RAIN_COUNT);
  private lightningAlpha = 0;
  private prevDownbeatPulse = 0;

  // Weather: Birds & Gulls
  private readonly birdX = new Float32Array(BIRD_COUNT);
  private readonly birdY = new Float32Array(BIRD_COUNT);
  private readonly birdVx = new Float32Array(BIRD_COUNT);
  private readonly birdVy = new Float32Array(BIRD_COUNT);
  private readonly birdPhase = new Float32Array(BIRD_COUNT);
  private readonly birdFrame = new Uint8Array(BIRD_COUNT);
  private readonly birdFlapTimer = new Float32Array(BIRD_COUNT);

  // Independent Parallax Scroll Coordinates
  public scroll1 = 0; // Layer 1 Lontanissimo (~0.10x)
  public scroll2 = 0; // Layer 2 Intermedio (~0.45x)
  public scroll3 = 0; // Layer 3 Transizione (~0.85x)
  public sunOffset = 0;
  public skyTime = 0;

  // Cached gradients to guarantee ZERO per-frame garbage collection allocations
  private cachedSkyCtx: CanvasRenderingContext2D | null = null;
  private cachedSkyHorizonY = -1;
  private cachedSkyPalette: StagePalette | null = null;
  private cachedSkyGrad: CanvasGradient | null = null;

  private cachedSunCtx: CanvasRenderingContext2D | null = null;
  private cachedSunHorizonY = -1;
  private cachedSunPalette: StagePalette | null = null;
  private cachedSunGrad: CanvasGradient | null = null;

  private cachedGlowCtx: CanvasRenderingContext2D | null = null;
  private cachedGlowHorizonY = -1;
  private cachedGlowPalette: StagePalette | null = null;
  private cachedGlowGrad: CanvasGradient | null = null;

  private cachedWaterCtx: CanvasRenderingContext2D | null = null;
  private cachedWaterHorizonY = -1;
  private cachedWaterPalette: StagePalette | null = null;
  private cachedWaterGrad: CanvasGradient | null = null;

  constructor() {
    // 1. Layer 1: Mountain ridges & Mayonaka rolling hills
    for (let i = 0; i < MOUNTAIN_POINTS; i++) {
      const t = (i / MOUNTAIN_POINTS) * Math.PI * 2;
      const h = Math.sin(t * 2) * 16 + Math.sin(t * 5 + 1.1) * 10 + Math.cos(t * 11 + 0.4) * 5 + 24;
      this.ridgeHeights[i] = Math.max(6, h);

      // Rolling hills for Mayonaka Bay
      const hHill = Math.sin(t * 1.5) * 11 + Math.sin(t * 3.5 + 0.4) * 5 + 16;
      this.hillHeights[i] = Math.max(6, hHill);

      const hFar = Math.sin(t * 3 + 0.7) * 22 + Math.cos(t * 7 + 1.9) * 9 + 28;
      this.farRidgeHeights[i] = Math.max(8, hFar);
    }

    // 2. Starfield & Constellation nodes
    for (let i = 0; i < STAR_COUNT; i++) {
      this.starX[i] = ((i * 73 + 19) % 100) / 100;
      this.starY[i] = ((i * 41 + 11) % 65) / 100;
      this.starPhase[i] = (i * 1.37) % (Math.PI * 2);
    }

    // 3. Layer 2: City Towers with varying architecture and antenna spikes
    for (let i = 0; i < CITY_TOWERS; i++) {
      this.towerWidths[i] = 12 + ((i * 7 + 3) % 12);
      this.towerHeights[i] = 10 + ((i * 13 + 7) % 26);
      this.towerStyle[i] = i % 4; // 0=plain, 1=stepped, 2=slant, 3=matrix
      this.towerAntennaH[i] = i % 3 === 0 ? 8 + ((i * 5) % 10) : 0;
      this.towerBlinkPhase[i] = ((i * 1.7) % 4) * Math.PI;
    }

    // 4. Procedural Clouds
    for (let i = 0; i < CLOUD_COUNT; i++) {
      this.cloudX[i] = (i * 110 + 35) % 700;
      this.cloudY[i] = 14 + ((i * 23 + 7) % 65);
      this.cloudWidth[i] = 48 + ((i * 17) % 36);
      this.cloudHeight[i] = 10 + ((i * 5) % 6);
      this.cloudSpeed[i] = 5 + ((i * 3) % 8);
    }

    // 5. Rain particles
    for (let i = 0; i < RAIN_COUNT; i++) {
      this.rainX[i] = ((i * 47 + 13) % 640);
      this.rainY[i] = ((i * 29 + 17) % 360);
      this.rainSpeed[i] = 380 + ((i * 31) % 180);
      this.rainLength[i] = 8 + ((i * 7) % 8);
    }

    // 6. Birds / Gulls
    for (let i = 0; i < BIRD_COUNT; i++) {
      this.birdX[i] = 50 + i * 95;
      this.birdY[i] = 45 + ((i * 31) % 55);
      this.birdVx[i] = 18 + ((i * 7) % 15);
      this.birdVy[i] = ((i % 2 === 0 ? 1 : -1) * 3);
      this.birdPhase[i] = i * 1.1;
      this.birdFrame[i] = i % 3;
      this.birdFlapTimer[i] = 0;
    }
  }

  /**
   * Compatibility alias for legacy tests and external callers.
   * Mirrors the primary distant layer scroll position.
   */
  get scrollX(): number {
    return this.scroll1;
  }
  set scrollX(v: number) {
    this.scroll1 = v;
  }

  update(dt: number, segmentCurve: number, speedRatio: number, downbeatPulse = 0): void {
    this.skyTime += dt;

    // -------------------------------------------------------------------------
    // 3 Parallax Layers (AGENTS.md §5 & Design Spec):
    // - Layer 1 Lontanissimo: scroll rate ~0.12x
    // - Layer 2 Intermedio: scroll rate ~0.45x
    // - Layer 3 Transizione: scroll rate ~0.85x
    // -------------------------------------------------------------------------
    const curveSpd = segmentCurve * speedRatio;

    this.scroll1 = (this.scroll1 + curveSpd * 14 * dt) % MOUNTAIN_SPAN;
    if (this.scroll1 < 0) this.scroll1 += MOUNTAIN_SPAN;

    this.scroll2 = (this.scroll2 + curveSpd * 42 * dt) % CITY_SPAN;
    if (this.scroll2 < 0) this.scroll2 += CITY_SPAN;

    this.scroll3 = (this.scroll3 + curveSpd * 80 * dt) % CITY_SPAN;
    if (this.scroll3 < 0) this.scroll3 += CITY_SPAN;

    // Celestial body offset (gently recenters on straights)
    this.sunOffset += curveSpd * 22 * dt;
    this.sunOffset *= Math.exp(-0.6 * dt);
    this.sunOffset = Math.max(-140, Math.min(140, this.sunOffset));

    // -------------------------------------------------------------------------
    // Weather System Updates (Zero GC: mutate pre-allocated TypedArrays)
    // -------------------------------------------------------------------------

    // 1. Procedural Clouds (slow wind drift + curve parallax)
    if (tuning.bgClouds === 1) {
      for (let i = 0; i < CLOUD_COUNT; i++) {
        this.cloudX[i] += (this.cloudSpeed[i]! - curveSpd * 18) * dt;
        if (this.cloudX[i]! > 760) this.cloudX[i]! -= 860;
        else if (this.cloudX[i]! < -100) this.cloudX[i]! += 860;
      }
    }

    // 2. Rain & Storm Physics
    if (tuning.bgRain === 1) {
      const windX = -65 - curveSpd * 85;
      for (let i = 0; i < RAIN_COUNT; i++) {
        this.rainY[i] += this.rainSpeed[i]! * dt;
        this.rainX[i] += windX * dt;
        if (this.rainY[i]! > 365) {
          this.rainY[i] = -this.rainLength[i]!;
          this.rainX[i] = (this.rainX[i]! + 260) % 640;
        }
        if (this.rainX[i]! < -10) this.rainX[i]! += 660;
        else if (this.rainX[i]! > 650) this.rainX[i]! -= 660;
      }
    }

    // 3. Lightning Flash (beat-responsive on strong downbeats or drops)
    if (tuning.bgLightningOnBeat === 1 && downbeatPulse > 0.8 && this.prevDownbeatPulse <= 0.8) {
      this.lightningAlpha = 0.95;
    }
    this.prevDownbeatPulse = downbeatPulse;

    if (this.lightningAlpha > 0) {
      this.lightningAlpha = Math.max(0, this.lightningAlpha - dt * 5.5);
    }

    // 4. Birds & Gulls
    if (tuning.bgBirds === 1) {
      for (let i = 0; i < BIRD_COUNT; i++) {
        this.birdX[i] += (this.birdVx[i]! - curveSpd * 32) * dt;
        this.birdY[i] += (this.birdVy[i]! + Math.sin(this.birdPhase[i]!) * 3.5) * dt;
        this.birdPhase[i] += dt * 2.8;

        if (this.birdX[i]! > 700) this.birdX[i]! -= 760;
        else if (this.birdX[i]! < -60) this.birdX[i]! += 760;

        this.birdFlapTimer[i] += dt;
        if (this.birdFlapTimer[i]! > 0.15) {
          this.birdFlapTimer[i] = 0;
          this.birdFrame[i] = (this.birdFrame[i]! + 1) % 3;
        }
      }
    }

    // 5. Constellations & Shooting Stars
    if (tuning.bgConstellations === 1) {
      this.constellationTimer += dt;
      const cycle = this.constellationTimer % 14;
      if (cycle < 1.2) {
        this.constellationAlpha = cycle / 1.2;
      } else if (cycle < 4.8) {
        this.constellationAlpha = 1.0;
      } else if (cycle < 6.0) {
        this.constellationAlpha = (6.0 - cycle) / 1.2;
      } else {
        this.constellationAlpha = 0;
        this.activeConstellationGroup =
          Math.floor(this.constellationTimer / 14) % CONSTELLATION_GROUPS.length;
      }

      this.shootingStarTimer += dt;
      if (this.shootingStarTimer > 6.5) {
        this.shootingStarTimer = 0;
        for (let s = 0; s < SHOOTING_STAR_COUNT; s++) {
          if (this.shootingStarActive[s] === 0) {
            this.shootingStarActive[s] = 1;
            this.shootingStarX[s] = 160 + ((s * 193 + Math.floor(this.skyTime * 70)) % 360);
            this.shootingStarY[s] = 12 + ((s * 41 + Math.floor(this.skyTime * 30)) % 45);
            this.shootingStarVx[s] = -330;
            this.shootingStarVy[s] = 190;
            this.shootingStarLife[s] = 0.45;
            break;
          }
        }
      }

      for (let s = 0; s < SHOOTING_STAR_COUNT; s++) {
        if (this.shootingStarActive[s] === 1) {
          this.shootingStarX[s] += this.shootingStarVx[s]! * dt;
          this.shootingStarY[s] += this.shootingStarVy[s]! * dt;
          this.shootingStarLife[s] -= dt;
          if (this.shootingStarLife[s]! <= 0) {
            this.shootingStarActive[s] = 0;
          }
        }
      }
    } else {
      this.constellationAlpha = 0;
    }
  }

  render(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    palette: StagePalette,
    beatPulse = 0,
    downbeatPulse = 0,
  ): void {
    const horizonY = Math.floor(height * 0.5);
    const pulse = beatPulse * tuning.bpmPulseStrength;
    const downPulse = downbeatPulse * tuning.bpmPulseStrength;

    // Check for downbeat lightning trigger if called via render
    if (tuning.bgLightningOnBeat === 1 && downbeatPulse > 0.8 && this.prevDownbeatPulse <= 0.8) {
      this.lightningAlpha = 0.95;
    }
    this.prevDownbeatPulse = downbeatPulse;

    // -------------------------------------------------------------------------
    // 1. SKY GRADIENT (Cached across frames unless palette or height changes)
    // -------------------------------------------------------------------------
    if (
      this.cachedSkyCtx !== ctx ||
      this.cachedSkyHorizonY !== horizonY ||
      this.cachedSkyPalette !== palette ||
      !this.cachedSkyGrad
    ) {
      const grad = ctx.createLinearGradient(0, 0, 0, horizonY);
      grad.addColorStop(0, palette.skyTop);
      grad.addColorStop(0.62, palette.skyMid);
      grad.addColorStop(1, palette.skyHorizon);
      this.cachedSkyCtx = ctx;
      this.cachedSkyHorizonY = horizonY;
      this.cachedSkyPalette = palette;
      this.cachedSkyGrad = grad;
    }
    ctx.fillStyle = this.cachedSkyGrad;
    ctx.fillRect(0, 0, width, horizonY + 2);

    // 1b. Beat Lightning Sky Flash (if active)
    if (this.lightningAlpha > 0.01) {
      ctx.fillStyle = COLOR_WHITE;
      ctx.globalAlpha = this.lightningAlpha * 0.65;
      ctx.fillRect(0, 0, width, horizonY + 2);
      ctx.globalAlpha = 1;
    }

    // -------------------------------------------------------------------------
    // 2. CELESTIAL VAULT: Stars, Constellations & Shooting Stars
    // -------------------------------------------------------------------------
    const starScroll = this.scroll1 * 0.45;
    const starCol1 = palette.starColors ? palette.starColors[0] : palette.mountainRim;
    const starCol2 = palette.starColors ? palette.starColors[1] : '#fff3b0';

    // 2a. Twinkling Stars
    for (let i = 0; i < STAR_COUNT; i++) {
      const sx = Math.round((this.starX[i]! * width - starScroll + width * 3) % width);
      const sy = Math.round(this.starY[i]! * (horizonY - 42)) + 4;
      const twinkle = Math.sin(this.skyTime * 3.2 + this.starPhase[i]!);
      if (twinkle > -0.25) {
        ctx.fillStyle = i % 3 === 0 ? starCol1 : starCol2;
        const size = twinkle > 0.65 || pulse > 0.6 ? 2 : 1;
        ctx.fillRect(sx, sy, size, size);
      }
    }

    // 2b. Constellations connecting existing star dots occasionally
    if (tuning.bgConstellations === 1) {
      if (this.constellationAlpha > 0.01) {
        const group =
          CONSTELLATION_GROUPS[this.activeConstellationGroup] ?? CONSTELLATION_GROUPS[0]!;
        const edgeCount = group.length;

        ctx.strokeStyle = starCol1;
        ctx.lineWidth = 1;
        ctx.globalAlpha = this.constellationAlpha * (0.32 + pulse * 0.38);
        ctx.beginPath();
        for (let e = 0; e < edgeCount; e += 2) {
          const idxA = group[e]!;
          const idxB = group[e + 1]!;
          const ax = Math.round((this.starX[idxA]! * width - starScroll + width * 3) % width);
          const ay = Math.round(this.starY[idxA]! * (horizonY - 42)) + 4;
          const bx = Math.round((this.starX[idxB]! * width - starScroll + width * 3) % width);
          const by = Math.round(this.starY[idxB]! * (horizonY - 42)) + 4;

          if (Math.abs(ax - bx) < width * 0.35) {
            ctx.moveTo(ax, ay);
            ctx.lineTo(bx, by);
          }
        }
        ctx.stroke();

        // Subtle diamond accent on the active constellation star nodes
        ctx.fillStyle = starCol2;
        for (let e = 0; e < edgeCount; e += 2) {
          const idxA = group[e]!;
          const ax = Math.round((this.starX[idxA]! * width - starScroll + width * 3) % width);
          const ay = Math.round(this.starY[idxA]! * (horizonY - 42)) + 4;
          ctx.fillRect(ax - 1, ay - 1, 3, 3);
        }
        ctx.globalAlpha = 1;
      }

      // 2c. Shooting Stars
      for (let s = 0; s < SHOOTING_STAR_COUNT; s++) {
        if (this.shootingStarActive[s] === 1) {
          const sx = this.shootingStarX[s]!;
          const sy = this.shootingStarY[s]!;
          const lifeAlpha = Math.min(1, this.shootingStarLife[s]! * 2.6);
          ctx.strokeStyle = COLOR_WHITE;
          ctx.lineWidth = 1.5;
          ctx.globalAlpha = lifeAlpha;
          ctx.beginPath();
          ctx.moveTo(sx, sy);
          ctx.lineTo(sx - this.shootingStarVx[s]! * 0.04, sy - this.shootingStarVy[s]! * 0.04);
          ctx.stroke();
          ctx.globalAlpha = 1;
        }
      }
    }

    // -------------------------------------------------------------------------
    // 3. PROCEDURAL CLOUDS (stepped pixel-art dithering)
    // -------------------------------------------------------------------------
    if (tuning.bgClouds === 1) {
      for (let i = 0; i < CLOUD_COUNT; i++) {
        const cx = Math.round(this.cloudX[i]!);
        const cy = Math.round(this.cloudY[i]!);
        const cw = Math.round(this.cloudWidth[i]!);
        const ch = Math.round(this.cloudHeight[i]!);

        if (cx + cw < -20 || cx > width + 20) continue;

        // Cloud base fill
        ctx.fillStyle = this.lightningAlpha > 0.1 ? COLOR_WHITE : palette.skyMid;
        ctx.globalAlpha = this.lightningAlpha > 0.1 ? 0.75 : 0.40;
        ctx.fillRect(cx + 6, cy, cw - 12, ch);
        ctx.fillRect(cx, cy + 3, cw, ch - 5);

        // Stepped pixel-art bottom rim
        ctx.fillStyle = this.lightningAlpha > 0.1 ? COLOR_WHITE : palette.skyHorizon;
        ctx.globalAlpha = this.lightningAlpha > 0.1 ? 0.90 : 0.48;
        ctx.fillRect(cx + 4, cy + ch - 2, cw - 8, 2);
      }
      ctx.globalAlpha = 1;
    }

    // -------------------------------------------------------------------------
    // 4. RETRO SYNTHWAVE SUN / MOON (in Layer 1)
    // -------------------------------------------------------------------------
    const sunX = width * 0.5 - this.sunOffset;
    const sunY = horizonY - 22;
    const sunR = 54 + pulse * 4.5 + downPulse * 2.5;

    if (
      this.cachedSunCtx !== ctx ||
      this.cachedSunHorizonY !== horizonY ||
      this.cachedSunPalette !== palette ||
      !this.cachedSunGrad
    ) {
      const maxR = 64;
      const sunGrad = ctx.createLinearGradient(0, horizonY - 22 - maxR, 0, horizonY - 22 + maxR);
      sunGrad.addColorStop(0, palette.sunTop);
      sunGrad.addColorStop(1, palette.sunBottom);
      this.cachedSunCtx = ctx;
      this.cachedSunHorizonY = horizonY;
      this.cachedSunPalette = palette;
      this.cachedSunGrad = sunGrad;
    }

    ctx.beginPath();
    ctx.arc(sunX, sunY, sunR, 0, Math.PI * 2);
    ctx.fillStyle = this.cachedSunGrad;
    ctx.fill();

    // Horizontal scanline cutouts across the lower half (chord-clipped analytically)
    ctx.fillStyle = palette.skyMid;
    const sunRSq = sunR * sunR;
    for (let i = 0; i < 6; i++) {
      const bandY = sunY + 4 + i * 9;
      if (bandY >= horizonY) break;
      const bandH = Math.min(1.5 + i * 0.9, horizonY - bandY);
      const dy = bandY + bandH * 0.5 - sunY;
      const dySq = dy * dy;
      if (dySq < sunRSq) {
        const halfChord = Math.sqrt(sunRSq - dySq);
        ctx.fillRect(sunX - halfChord - 0.5, bandY, halfChord * 2 + 1, bandH);
      }
    }

    // -------------------------------------------------------------------------
    // 5. FALLBACK GROUND FILL (occludes celestial body below road horizon)
    // -------------------------------------------------------------------------
    ctx.fillStyle = palette.grass[1];
    ctx.fillRect(0, horizonY, width, height - horizonY);

    // -------------------------------------------------------------------------
    // 6. LAYER 1: LONTANISSIMO (Scroll ~0.10x)
    // -------------------------------------------------------------------------
    const isSunsetBoulevard = palette.id === 'og_future_funk';
    const isAkibaNight = palette.id === 'akiba_night' || palette.id === 'weeb_funk';
    const isMayonakaBay = !isSunsetBoulevard && !isAkibaNight;

    if (isSunsetBoulevard) {
      // Sunset Boulevard: Calm deep sea horizon with tranquil water gradient & shimmering sun reflection
      const seaTopY = horizonY - 26;
      const seaH = horizonY - seaTopY;

      if (
        this.cachedWaterCtx !== ctx ||
        this.cachedWaterHorizonY !== horizonY ||
        this.cachedWaterPalette !== palette ||
        !this.cachedWaterGrad
      ) {
        const wGrad = ctx.createLinearGradient(0, seaTopY, 0, horizonY);
        wGrad.addColorStop(0, COLOR_WATER_DEEP);
        wGrad.addColorStop(0.55, hexToRgba(palette.skyHorizon, 0.45));
        wGrad.addColorStop(1, hexToRgba(palette.grass[0], 0.95));
        this.cachedWaterCtx = ctx;
        this.cachedWaterHorizonY = horizonY;
        this.cachedWaterPalette = palette;
        this.cachedWaterGrad = wGrad;
      }
      ctx.fillStyle = this.cachedWaterGrad;
      ctx.fillRect(0, seaTopY, width, seaH + 2);

      // Distant calm sea horizon line
      ctx.fillStyle = palette.mountainRim;
      ctx.globalAlpha = 0.50 + pulse * 0.25;
      ctx.fillRect(0, seaTopY, width, 1);
      ctx.globalAlpha = 1;

      // Golden setting sun reflection column on water surface directly below the sun
      const sunRefW = Math.max(16, sunR * 0.45);
      for (let dy = 0; dy < seaH; dy++) {
        const y = seaTopY + dy;
        const rip = Math.sin(this.skyTime * 4.2 + dy * 0.75) * 2.2;
        const expand = (dy / seaH) * 22;
        const refAlpha = (1 - (dy / seaH) * 0.40) * (0.45 + pulse * 0.28);
        ctx.fillStyle = palette.sunBottom;
        ctx.globalAlpha = Math.min(0.85, refAlpha);
        ctx.fillRect(sunX - (sunRefW + expand) * 0.5 + rip, y, sunRefW + expand, 1);
      }
      ctx.globalAlpha = 1;

      // Subtle horizontal wave sheens
      const sheenScroll = (this.scroll1 * 0.8 + this.skyTime * 8) % width;
      ctx.fillStyle = palette.sunTop;
      for (let s = 0; s < 4; s++) {
        const sx = Math.round((s * 160 - sheenScroll + width * 2) % width);
        const sy = seaTopY + 4 + s * 6;
        const sw = 28 + s * 8;
        ctx.globalAlpha = 0.22 + 0.12 * Math.sin(this.skyTime * 3.5 + s);
        ctx.fillRect(sx, sy, sw, 1);
      }
      ctx.globalAlpha = 1;
    } else if (isMayonakaBay) {
      // Mayonaka Bay: Rolling soft hills (colli)
      const step = MOUNTAIN_SPAN / MOUNTAIN_POINTS;
      const startIdx = Math.floor(this.scroll1 / step);
      const frac = (this.scroll1 % step) / step;
      const pointsNeeded = Math.ceil(width / step) + 2;

      ctx.beginPath();
      ctx.moveTo(0, horizonY + 2);
      for (let i = 0; i <= pointsNeeded; i++) {
        const idx = (startIdx + i) % MOUNTAIN_POINTS;
        const x = (i - frac) * step;
        const y = horizonY - this.hillHeights[idx]!;
        ctx.lineTo(x, y);
      }
      ctx.lineTo(width, horizonY + 2);
      ctx.closePath();
      ctx.fillStyle = this.lightningAlpha > 0.05 ? '#000000' : palette.mountain;
      ctx.fill();

      // Soft hill rim
      ctx.beginPath();
      for (let i = 0; i <= pointsNeeded; i++) {
        const idx = (startIdx + i) % MOUNTAIN_POINTS;
        const x = (i - frac) * step;
        const y = horizonY - this.hillHeights[idx]!;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = palette.mountainRim;
      ctx.lineWidth = 1.0 + pulse * 0.8;
      ctx.stroke();
    } else {
      // Akiba Night Rush: Jagged dark mountains enclosing the metropolis
      const step = MOUNTAIN_SPAN / MOUNTAIN_POINTS;
      const startIdx = Math.floor(this.scroll1 / step);
      const frac = (this.scroll1 % step) / step;
      const pointsNeeded = Math.ceil(width / step) + 2;

      ctx.beginPath();
      ctx.moveTo(0, horizonY + 2);
      for (let i = 0; i <= pointsNeeded; i++) {
        const idx = (startIdx + i) % MOUNTAIN_POINTS;
        const x = (i - frac) * step;
        const y = horizonY - this.ridgeHeights[idx]!;
        ctx.lineTo(x, y);
      }
      ctx.lineTo(width, horizonY + 2);
      ctx.closePath();
      ctx.fillStyle = this.lightningAlpha > 0.05 ? '#000000' : palette.mountain;
      ctx.fill();

      // Glowing neon mountain ridge rim
      ctx.beginPath();
      for (let i = 0; i <= pointsNeeded; i++) {
        const idx = (startIdx + i) % MOUNTAIN_POINTS;
        const x = (i - frac) * step;
        const y = horizonY - this.ridgeHeights[idx]!;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = palette.mountainRim;
      ctx.lineWidth = 1.2 + pulse * 1.1;
      ctx.stroke();
    }

    // -------------------------------------------------------------------------
    // 7. LAYER 2: INTERMEDIO — Skyline Urbano & Antenne Radio (Scroll ~0.45x)
    // -------------------------------------------------------------------------
    const towerSpacing = CITY_SPAN / CITY_TOWERS;
    const winPrimary = palette.starColors ? palette.starColors[0] : palette.mountainRim;
    const winSecondary = palette.sunTop;
    const winAccent = palette.starColors ? palette.starColors[1] : palette.mountainRim;

    // Tailored baseline per theme
    const skylineBaseY = isSunsetBoulevard ? horizonY - 10 : horizonY - 4;

    for (let pass = -1; pass <= Math.ceil(width / CITY_SPAN); pass++) {
      const baseOffset = pass * CITY_SPAN - this.scroll2;
      for (let t = 0; t < CITY_TOWERS; t++) {
        const tx = Math.round(baseOffset + t * towerSpacing);
        const tw = this.towerWidths[t]!;
        if (tx + tw < -10 || tx > width + 10) continue;

        // Tailor building heights per theme:
        // - Sunset Boulevard: palazzi bassi (2-4 piani: 6..14px)
        // - Akiba Night: palazzi alti (18..48px)
        // - Mayonaka Bay: palazzi medio-alti (12..28px)
        const th = isSunsetBoulevard
          ? Math.min(14, 5 + ((t * 5 + 3) % 9))
          : isAkibaNight
            ? 18 + ((t * 13 + 7) % 32)
            : 12 + ((t * 9 + 5) % 18);

        const ty = skylineBaseY - th;
        const style = this.towerStyle[t]!;

        // 7a. Building silhouette (pure black on lightning flash for reverse silhouette)
        ctx.fillStyle = this.lightningAlpha > 0.05 ? '#000000' : COLOR_NIGHT_SKYLINE;
        if (style === 1) {
          // Stepped art-deco tower
          const stepW = Math.max(4, Math.floor(tw * 0.65));
          const stepH = Math.floor(th * 0.45);
          ctx.fillRect(tx, ty + stepH, tw, th - stepH + (horizonY - skylineBaseY));
          ctx.fillRect(tx + Math.floor((tw - stepW) * 0.5), ty, stepW, stepH);
        } else if (style === 2) {
          // Slanted rooftop tower
          ctx.beginPath();
          ctx.moveTo(tx, ty + 6);
          ctx.lineTo(tx + tw, ty);
          ctx.lineTo(tx + tw, skylineBaseY + (horizonY - skylineBaseY));
          ctx.lineTo(tx, skylineBaseY + (horizonY - skylineBaseY));
          ctx.closePath();
          ctx.fill();
        } else {
          // Classic high-rise
          ctx.fillRect(tx, ty, tw, th + (horizonY - skylineBaseY));
        }

        // 7b. Radio antenna with blinking red/cyan LED beacon
        const antH = isSunsetBoulevard ? 0 : this.towerAntennaH[t]!;
        if (antH > 0) {
          const antX = tx + Math.floor(tw * 0.5);
          ctx.fillStyle = this.lightningAlpha > 0.05 ? '#000000' : '#1e1438';
          ctx.fillRect(antX, ty - antH, 1, antH);

          // LED beacon at the tip of the antenna
          const blink = Math.sin(this.skyTime * 4.5 + this.towerBlinkPhase[t]!);
          if (blink > 0.1 || downPulse > 0.6) {
            ctx.fillStyle = t % 2 === 0 ? COLOR_BEACON_RED : COLOR_BEACON_CYAN;
            ctx.fillRect(antX - 1, ty - antH - 1, 2, 2);
          }
        }

        // 7c. Glowing window matrices breathing with the beat
        if (th >= 10) {
          const winCols = tw >= 18 ? 3 : 2;
          const winRows = Math.min(6, Math.floor(th / 5));
          for (let r = 0; r < winRows; r++) {
            const wy = ty + 4 + r * 5;
            if (wy >= skylineBaseY - 2) break;
            for (let c = 0; c < winCols; c++) {
              const wx = tx + 3 + c * 5;
              if (wx + 2 > tx + tw - 2) continue;

              const lit = (t * 7 + r * 3 + c * 5) % 3 !== 0 || pulse > 0.45;
              if (lit) {
                ctx.fillStyle = (r + c) % 2 === 0 ? winPrimary : winSecondary;
                ctx.fillRect(wx, wy, 2, 2);
              }
            }
          }
        }
      }
    }

    // -------------------------------------------------------------------------
    // 8. LAYER 3: TRANSIZIONE (Scroll ~0.85x)
    // Vertical Water Reflections for Sunset Boulevard Coast & Breakwater Wash
    // -------------------------------------------------------------------------
    if (isSunsetBoulevard) {
      // Vertical Water Reflections directly beneath the skyline towers
      const waterTopY = skylineBaseY;
      const waterH = horizonY - waterTopY;

      for (let pass = -1; pass <= Math.ceil(width / CITY_SPAN); pass++) {
        const baseOffset = pass * CITY_SPAN - this.scroll3;
        for (let t = 0; t < CITY_TOWERS; t++) {
          const tx = Math.round(baseOffset + t * towerSpacing);
          const tw = this.towerWidths[t]!;
          if (tx + tw < -5 || tx > width + 5) continue;

          const th = this.towerHeights[t]!;
          if (th < 12) continue;

          // Shimmering vertical light columns stretching down across the water
          const colColor = t % 2 === 0 ? winPrimary : winAccent;
          ctx.fillStyle = colColor;
          const refW = Math.max(3, tw - 4);

          for (let dy = 0; dy < waterH; dy++) {
            const y = waterTopY + dy;
            const rip = Math.round(Math.sin(this.skyTime * 5.5 + dy * 0.9 + t * 1.3) * 1.8);
            const fade = (1 - dy / waterH) * (0.32 + pulse * 0.28);
            ctx.globalAlpha = Math.max(0, Math.min(1, fade));
            ctx.fillRect(tx + 2 + rip, y, refW, 1);
          }
        }
      }
      ctx.globalAlpha = 1;
    }

    // -------------------------------------------------------------------------
    // 9. ATMOSPHERIC BREAKWATER HORIZON WASH
    // Seamlessly merges distant elements and road fog into the horizon line
    // -------------------------------------------------------------------------
    const glowH = 24;
    const glowColor = palette.horizonGlow ?? palette.skyHorizon;
    if (
      this.cachedGlowCtx !== ctx ||
      this.cachedGlowHorizonY !== horizonY ||
      this.cachedGlowPalette !== palette ||
      !this.cachedGlowGrad
    ) {
      const grad = ctx.createLinearGradient(0, horizonY - glowH, 0, horizonY);
      grad.addColorStop(0, hexToRgba(glowColor, 0));
      grad.addColorStop(0.4, hexToRgba(glowColor, 0.35));
      grad.addColorStop(1, hexToRgba(glowColor, 0.95));
      this.cachedGlowCtx = ctx;
      this.cachedGlowHorizonY = horizonY;
      this.cachedGlowPalette = palette;
      this.cachedGlowGrad = grad;
    }

    const washAlpha = Math.min(0.78, 0.22 + pulse * 0.36 + downPulse * 0.18);
    ctx.globalAlpha = washAlpha;
    ctx.fillStyle = this.cachedGlowGrad;
    ctx.fillRect(0, horizonY - glowH, width, glowH);
    ctx.globalAlpha = 1;

    // -------------------------------------------------------------------------
    // 10. RONDINI & GABBIANI (3-frame flap animation)
    // -------------------------------------------------------------------------
    if (tuning.bgBirds === 1) {
      ctx.fillStyle = COLOR_NIGHT_SKYLINE;
      for (let i = 0; i < BIRD_COUNT; i++) {
        const bx = Math.round(this.birdX[i]!);
        const by = Math.round(this.birdY[i]!);
        if (bx < -10 || bx > width + 10) continue;

        const frame = this.birdFrame[i]!;
        if (frame === 0) {
          // Wings up: \_/
          ctx.fillRect(bx, by, 1, 2);
          ctx.fillRect(bx + 1, by + 1, 1, 1);
          ctx.fillRect(bx + 2, by + 2, 1, 1);
          ctx.fillRect(bx + 3, by + 1, 1, 1);
          ctx.fillRect(bx + 4, by, 1, 2);
        } else if (frame === 1) {
          // Wings flat: ---
          ctx.fillRect(bx, by + 1, 5, 1);
          ctx.fillRect(bx + 2, by + 2, 1, 1);
        } else {
          // Wings down: /-\
          ctx.fillRect(bx + 2, by, 1, 1);
          ctx.fillRect(bx + 1, by + 1, 1, 1);
          ctx.fillRect(bx + 3, by + 1, 1, 1);
          ctx.fillRect(bx, by + 2, 1, 2);
          ctx.fillRect(bx + 4, by + 2, 1, 2);
        }
      }
    }

    // -------------------------------------------------------------------------
    // 11. PIOGGIA & TEMPESTA (fast angled rain streaks, single batch stroke)
    // -------------------------------------------------------------------------
    if (tuning.bgRain === 1) {
      ctx.strokeStyle = COLOR_RAIN;
      ctx.lineWidth = 1;
      ctx.globalAlpha = 0.52;
      ctx.beginPath();
      for (let i = 0; i < RAIN_COUNT; i++) {
        const rx = this.rainX[i]!;
        const ry = this.rainY[i]!;
        const len = this.rainLength[i]!;
        ctx.moveTo(rx, ry);
        ctx.lineTo(rx - 3, ry + len);
      }
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }
}
