import { tuning } from '@src/config/tuning';
import type { StagePalette } from '@src/road/palette';

// ---------------------------------------------------------------------------
// Pre-allocated array sizes & geometry spans (AGENTS.md §4.3: ZERO GC in loop)
// ---------------------------------------------------------------------------
const MOUNTAIN_POINTS = 64;
const MOUNTAIN_SPAN = 640;
const STAR_COUNT = 56;
const SHOOTING_STAR_COUNT = 2;
const CITY_TOWERS = 32;
const CITY_SPAN = 640;
const CLOUD_COUNT = 6;
const RAIN_COUNT = 72;
const RAIN_FAR_COUNT = 40;
const BIRD_COUNT = 6;

const BOLT_MAIN_NODES = 10;
const BOLT_BRANCH_COUNT = 3;
const BOLT_BRANCH_NODES = 4;

// ---------------------------------------------------------------------------
// Vibeful Lightning Color Themes (Synthwave / OutRun / Cyberpunk)
// ---------------------------------------------------------------------------
interface LightningTheme {
  readonly skyTopWash: string;
  readonly skyHorizonWash: string;
  readonly cloudRim: string;
  readonly cloudBody: string;
  readonly boltOuter: string;
  readonly boltMid: string;
  readonly boltCore: string;
}

interface CloudPalette {
  readonly rim: string;
  readonly body: string;
  readonly shadow: string;
  readonly baseGlow: string;
}

const CLOUD_PALETTES: Record<string, CloudPalette> = {
  night: {
    rim: '#a6f8ff',      // ice cyan moonlight
    body: '#35285c',     // velvety twilight indigo/violet (not black!)
    shadow: '#221940',   // soft night shade
    baseGlow: '#00e5be', // soft turquoise horizon glow
  },
  og_future_funk: {
    rim: '#ffe885',      // warm golden crest
    body: '#b83a7a',     // luminous sunset rose-magenta
    shadow: '#7e2462',   // soft warm berry/plum (NOT dark mud!)
    baseGlow: '#ff9e42', // warm peach/amber horizon bounce
  },
  vaporfunk: {
    rim: '#fff0f5',      // soft pearl
    body: '#8e76aa',     // pastel lavender
    shadow: '#5e4c75',   // soft mauve
    baseGlow: '#e0b1cb', // pastel rose bounce
  },
  akiba_noon: {
    rim: '#ffffff',      // bright white
    body: '#e8f0fe',     // clean cloud white
    shadow: '#a4b8d1',   // summer slate
    baseGlow: '#fff4dd', // warm noon haze bounce
  },
  akiba_night: {
    rim: '#ff85c2',      // neon pink
    body: '#481e64',     // electric purple
    shadow: '#280e38',   // soft neon shadow
    baseGlow: '#00f5d4', // electric cyan glow
  },
  weeb_funk: {
    rim: '#ff85c2',
    body: '#481e64',
    shadow: '#280e38',
    baseGlow: '#00f5d4',
  },
};

interface WindowPalette {
  readonly col1: string;
  readonly col2: string;
  readonly col3: string;
}

const WINDOW_PALETTES: Record<string, WindowPalette> = {
  night: {
    col1: '#ffd166', // warm interior amber
    col2: '#80f6ff', // cool cyan neon
    col3: '#00f0b5', // mint office light
  },
  og_future_funk: {
    col1: '#ffd447', // golden amber
    col2: '#fff3c4', // butter cream
    col3: '#ff9e66', // warm peach dusk
  },
  vaporfunk: {
    col1: '#f8f9fa', // soft pearl
    col2: '#e0b1cb', // pastel rose
    col3: '#c77dff', // soft violet
  },
  akiba_noon: {
    col1: '#ffffff', // bright sun glare
    col2: '#ffeec2', // warm glass reflection
    col3: '#94a3b8', // cool slate glass
  },
  akiba_night: {
    col1: '#ffee32', // electric yellow
    col2: '#00f5d4', // cyber cyan
    col3: '#ff70b8', // neon fuchsia
  },
  weeb_funk: {
    col1: '#ffee32',
    col2: '#00f5d4',
    col3: '#ff70b8',
  },
};

const LIGHTNING_THEMES: readonly LightningTheme[] = [
  // 0: Electric Cyber Magenta
  {
    skyTopWash: '#3b0944',
    skyHorizonWash: '#ff2a85',
    cloudRim: '#ff70b8',
    cloudBody: '#691460',
    boltOuter: '#ff007f',
    boltMid: '#ff70b8',
    boltCore: '#ffe8f5',
  },
  // 1: OutRun Neon Cyan
  {
    skyTopWash: '#062c43',
    skyHorizonWash: '#00f5d4',
    cloudRim: '#72efdd',
    cloudBody: '#114b5f',
    boltOuter: '#00bbf9',
    boltMid: '#72efdd',
    boltCore: '#e8fbff',
  },
  // 2: Ultraviolet Synth Purple
  {
    skyTopWash: '#240046',
    skyHorizonWash: '#9d4edd',
    cloudRim: '#e0aaff',
    cloudBody: '#480ca8',
    boltOuter: '#7b2cbf',
    boltMid: '#c77dff',
    boltCore: '#f5e6ff',
  },
  // 3: Laser Sunset Gold & Hot Coral
  {
    skyTopWash: '#4a0e2e',
    skyHorizonWash: '#ff6d00',
    cloudRim: '#ffbe0b',
    cloudBody: '#801a4a',
    boltOuter: '#ff5400',
    boltMid: '#ffbe0b',
    boltCore: '#fff6cc',
  },
];

// Static color constants to avoid dynamic string interpolation in render()
const COLOR_WHITE = '#ffffff';
const COLOR_NIGHT_SKYLINE = '#080417';
const COLOR_BEACON_RED = '#ff2a75';
const COLOR_BEACON_CYAN = '#00f5d4';
const COLOR_RAIN_FAR = '#70b5e8';
const COLOR_RAIN_NEAR = '#a6e8ff';
const COLOR_WATER_DEEP = '#030514';

const RGBA_CACHE = new Map<string, string>();
function hexToRgba(hex: string, alpha: number): string {
  const rounded = Math.round(alpha * 50) / 50;
  const key = `${hex}_${rounded}`;
  let cached = RGBA_CACHE.get(key);
  if (cached === undefined) {
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
    cached = `rgba(${r}, ${g}, ${b}, ${rounded})`;
    if (RGBA_CACHE.size < 512) RGBA_CACHE.set(key, cached);
  }
  return cached;
}

/**
 * 3-Tier Parallax Synthwave Skybox & Atmospheric Weather System:
 * - Layer 1: Lontanissimo (~0.10x) — calm deep water sea / majestic mountain ridges & chord-clipped sun/moon
 * - Layer 2: Intermedio (~0.45x) — dense pixel-art skyline with radio antennas & breathing window matrices
 * - Layer 3: Transizione (~0.85x) — shimmering vertical water reflections (Mayonaka Bay) & seamless horizon wash
 * - Weather & Celestial — authentic 16-bit pixel-art cumulus clouds with organic curved domes,
 *   vibeful sudden forked lightning (triggered on extreme spectral events and drops),
 *   clean 2-tier diagonal rain, twinkling stars & shooting stars.
 *
 * Performance Invariant (AGENTS.md §4.3): STRICT ZERO GC ALLOCATIONS per frame.
 */
export class Background {
  // Layer 1: Mountain / distant ridge geometry
  private readonly ridgeHeights = new Float32Array(MOUNTAIN_POINTS);
  private readonly hillHeights = new Float32Array(MOUNTAIN_POINTS);
  private readonly farRidgeHeights = new Float32Array(MOUNTAIN_POINTS);

  // Layer 1: Celestial starfield
  private readonly starX = new Float32Array(STAR_COUNT);
  private readonly starY = new Float32Array(STAR_COUNT);
  private readonly starPhase = new Float32Array(STAR_COUNT);

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

  // Weather: 16-bit Pixel-Art Cumulus Clouds (organic lobes + flat base shelf)
  private readonly cloudX = new Float32Array(CLOUD_COUNT);
  private readonly cloudY = new Float32Array(CLOUD_COUNT);
  private readonly cloudWidth = new Float32Array(CLOUD_COUNT);
  private readonly cloudHeight = new Float32Array(CLOUD_COUNT);
  private readonly cloudSpeed = new Float32Array(CLOUD_COUNT);
  private readonly cloudLayer = new Uint8Array(CLOUD_COUNT); // 0 = high/far, 1 = mid/near
  private readonly cloudVariant = new Uint8Array(CLOUD_COUNT); // 0 = Grand Cumulus, 1 = Stratocumulus, 2 = Compact Puff

  // Weather: Clean 2-Tier Rain Streaks (simplified, elegant, no floating splash boxes)
  private readonly rainX = new Float32Array(RAIN_COUNT);
  private readonly rainY = new Float32Array(RAIN_COUNT);
  private readonly rainSpeed = new Float32Array(RAIN_COUNT);
  private readonly rainLength = new Float32Array(RAIN_COUNT);
  private currentWindX = -65;

  // Weather: Vibeful Sudden Lightning & Procedural Forked Bolt
  private lightningAlpha = 0;
  private lightningAge = 10;
  private lightningThemeIdx = 0;
  private lightningStrikeCount = 0;
  private readonly boltMainX = new Float32Array(BOLT_MAIN_NODES);
  private readonly boltMainY = new Float32Array(BOLT_MAIN_NODES);
  private readonly boltBranchX = new Float32Array(BOLT_BRANCH_COUNT * BOLT_BRANCH_NODES);
  private readonly boltBranchY = new Float32Array(BOLT_BRANCH_COUNT * BOLT_BRANCH_NODES);

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

  private cachedCoronaCtx: CanvasRenderingContext2D | null = null;
  private cachedCoronaPalette: StagePalette | null = null;
  private cachedCoronaSunX = -1;
  private cachedCoronaSunY = -1;
  private cachedCoronaSunR = -1;
  private cachedCoronaGrad: CanvasGradient | null = null;

  private readonly cloudCanvases: (HTMLCanvasElement | null)[] = [null, null, null, null, null, null];
  private cachedCloudPalette: StagePalette | null = null;

  constructor() {
    // 1. Layer 1: Mountain ridges & Mayonaka rolling hills
    for (let i = 0; i < MOUNTAIN_POINTS; i++) {
      const t = (i / MOUNTAIN_POINTS) * Math.PI * 2;
      const h =
        Math.sin(t * 2) * 16 + Math.sin(t * 5 + 1.1) * 10 + Math.cos(t * 11 + 0.4) * 5 + 24;
      this.ridgeHeights[i] = Math.max(6, h);

      // Rolling coastal hills for Mayonaka Bay (framing the bay at the margins: hills on flanks, open sea in center)
      let hHill: number;
      if (i <= 12) {
        // Left margin (0..120px): high rolling coastal headlands (peaks 34 to 46px)
        const u = i / 12;
        hHill = 32 + Math.sin(u * Math.PI * 1.5) * 9 + Math.cos(u * Math.PI * 3.5) * 5;
      } else if (i <= 18) {
        // Slope down towards the coastal city (130..180px)
        const u = (i - 12) / 6;
        const baseH = 32 + Math.sin(Math.PI * 1.5) * 9 + Math.cos(Math.PI * 3.5) * 5;
        hHill = (1 - u) * baseH;
      } else if (i <= 44) {
        // Center bay (190..440px): completely open to the sea and moon
        hHill = 0;
      } else if (i <= 50) {
        // Slope up from coastal city towards right margin (450..500px)
        const u = (i - 44) / 6;
        const baseH = 32 + Math.sin(0) * 9 + Math.cos(0) * 5;
        hHill = u * baseH;
      } else {
        // Right margin (510..630px): high rolling coastal headlands (peaks 34 to 46px)
        const u = (i - 50) / 13;
        hHill = 32 + Math.sin(u * Math.PI * 1.5) * 9 + Math.cos(u * Math.PI * 3.5) * 5;
      }
      this.hillHeights[i] = Math.max(0, hHill);

      const hFar = Math.sin(t * 3 + 0.7) * 22 + Math.cos(t * 7 + 1.9) * 9 + 28;
      this.farRidgeHeights[i] = Math.max(8, hFar);
    }

    // 2. Background Starfield
    for (let i = 0; i < STAR_COUNT; i++) {
      this.starX[i] = ((i * 73 + 19) % 100) / 100;
      this.starY[i] = ((i * 41 + 11) % 68) / 100;
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

    // 4. 16-Bit Cumulus Clouds (organic multi-dome shapes)
    for (let i = 0; i < CLOUD_COUNT; i++) {
      const isNear = i >= 3 ? 1 : 0;
      this.cloudLayer[i] = isNear;
      this.cloudVariant[i] = i % 2 === 0 ? 0 : 2;
      this.cloudX[i] = (i * 130 + 35) % 760;
      this.cloudY[i] = isNear ? 30 + ((i * 19 + 7) % 36) : 14 + ((i * 23 + 11) % 28);
      this.cloudWidth[i] = isNear ? 80 + ((i * 19) % 36) : 60 + ((i * 13) % 24);
      this.cloudHeight[i] = isNear ? 26 + ((i * 7) % 10) : 18 + ((i * 5) % 8);
      this.cloudSpeed[i] = isNear ? 6 + ((i * 3) % 5) : 3 + ((i * 2) % 3);
    }

    // 5. Clean 2-Tier Rain Particles (40 far, 32 near)
    for (let i = 0; i < RAIN_COUNT; i++) {
      this.rainX[i] = (i * 53 + 17) % 640;
      this.rainY[i] = (i * 37 + 11) % 360;
      if (i < RAIN_FAR_COUNT) {
        // Far fine sky streaks
        this.rainSpeed[i] = 320 + ((i * 23) % 80);
        this.rainLength[i] = 7 + ((i * 5) % 4);
      } else {
        // Near road streaks
        this.rainSpeed[i] = 520 + ((i * 31) % 110);
        this.rainLength[i] = 13 + ((i * 7) % 5);
      }
    }

    // Initialize default lightning bolt geometry
    this.rebuildLightningBolt(320, 180, 0);

    // 6. Birds / Gulls
    for (let i = 0; i < BIRD_COUNT; i++) {
      this.birdX[i] = 50 + i * 95;
      this.birdY[i] = 45 + ((i * 31) % 55);
      this.birdVx[i] = 18 + ((i * 7) % 15);
      this.birdVy[i] = (i % 2 === 0 ? 1 : -1) * 3;
      this.birdPhase[i] = i * 1.1;
      this.birdFrame[i] = i % 3;
      this.birdFlapTimer[i] = 0;
    }
  }

  /**
   * Pre-computes a jagged forked lightning bolt into pre-allocated TypedArrays (Zero GC).
   */
  private rebuildLightningBolt(originX: number, horizonY: number, seed: number): void {
    const startY = 6 + ((seed * 11) % 16);
    const endY = Math.max(startY + 45, horizonY - 4);
    const spanY = endY - startY;

    let curX = originX;
    this.boltMainX[0] = curX;
    this.boltMainY[0] = startY;

    for (let i = 1; i < BOLT_MAIN_NODES; i++) {
      const t = i / (BOLT_MAIN_NODES - 1);
      const zig = (((seed + i * 7) % 5) - 2) * 8 + (i % 2 === 0 ? 10 : -10);
      curX = Math.max(30, Math.min(610, curX + zig));
      this.boltMainX[i] = curX;
      this.boltMainY[i] = startY + t * spanY;
    }

    // 3 Forked side branches
    for (let b = 0; b < BOLT_BRANCH_COUNT; b++) {
      const rootNode = 2 + b * 2;
      const dir = (seed + b) % 2 === 0 ? 1 : -1;
      let bx = this.boltMainX[rootNode]!;
      let by = this.boltMainY[rootNode]!;
      const baseIdx = b * BOLT_BRANCH_NODES;
      this.boltBranchX[baseIdx] = bx;
      this.boltBranchY[baseIdx] = by;

      for (let n = 1; n < BOLT_BRANCH_NODES; n++) {
        bx += dir * (7 + ((seed + b * 3 + n * 5) % 9));
        by += 9 + ((seed + n * 7) % 8);
        this.boltBranchX[baseIdx + n] = bx;
        this.boltBranchY[baseIdx + n] = by;
      }
    }
  }

  /**
   * Triggers an extreme sudden lightning strike.
   * Can be called directly on musical drop sync, extreme spectral energy peak, or test button.
   */
  public triggerLightningStrike(): void {
    if (tuning.bgRain === 0 || tuning.bgLightningOnBeat === 0) return;
    this.lightningStrikeCount++;
    this.lightningAge = 0;
    this.lightningAlpha = 1.0;
    this.lightningThemeIdx = this.lightningStrikeCount % LIGHTNING_THEMES.length;

    const strikeX = 100 + ((this.lightningStrikeCount * 179 + Math.floor(this.skyTime * 93)) % 440);
    this.rebuildLightningBolt(strikeX, 180, this.lightningStrikeCount);
  }

  /**
   * Compatibility alias for legacy callers.
   */
  get scrollX(): number {
    return this.scroll1;
  }
  set scrollX(v: number) {
    this.scroll1 = v;
  }

  update(
    dt: number,
    segmentCurve: number,
    speedRatio: number,
    extremeSpectralEventOrDownbeat: boolean | number = false,
  ): void {
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
    // Weather System Updates
    // -------------------------------------------------------------------------

    // 1. 16-Bit Cumulus Clouds (depth-layered wind drift + curve parallax)
    if (tuning.bgClouds === 1) {
      for (let i = 0; i < CLOUD_COUNT; i++) {
        const parallaxFactor = this.cloudLayer[i] === 1 ? 20 : 10;
        this.cloudX[i] += (this.cloudSpeed[i]! - curveSpd * parallaxFactor) * dt;
        if (this.cloudX[i]! > 760) this.cloudX[i]! -= 900;
        else if (this.cloudX[i]! < -140) this.cloudX[i]! += 900;
      }
    }

    // 2. Clean 2-Tier Rain Physics (wind-reactive angle, no messy ground brackets)
    if (tuning.bgRain === 1) {
      const targetWindX = -60 - curveSpd * 85;
      this.currentWindX += (targetWindX - this.currentWindX) * Math.min(1, dt * 6);

      for (let i = 0; i < RAIN_COUNT; i++) {
        const isNear = i >= RAIN_FAR_COUNT;
        const layerScale = isNear ? 1.25 : 0.75;
        this.rainY[i] += this.rainSpeed[i]! * dt;
        this.rainX[i] += this.currentWindX * layerScale * dt;
        if (this.rainY[i]! > 365) {
          this.rainY[i] = -this.rainLength[i]!;
          this.rainX[i] = (this.rainX[i]! + 253) % 640;
        }
        if (this.rainX[i]! < -20) this.rainX[i]! += 680;
        else if (this.rainX[i]! > 660) this.rainX[i]! -= 680;
      }
    }

    // 3. Lightning Flash Timing & Decay
    // Only triggers on explicit extreme spectral events (drops, extreme energy bursts)
    const isExtremeTrigger =
      typeof extremeSpectralEventOrDownbeat === 'boolean'
        ? extremeSpectralEventOrDownbeat
        : extremeSpectralEventOrDownbeat > 0.85;

    if (isExtremeTrigger && tuning.bgRain === 1) {
      this.triggerLightningStrike();
    }

    if (this.lightningAlpha > 0) {
      this.lightningAge += dt;
      // Sudden double-flicker envelope:
      // 0..38ms: full sudden shock flash (1.0)
      // 38..75ms: sharp micro-dip (0.25)
      // 75..120ms: secondary re-strike (0.88)
      // >120ms: rapid synthwave afterglow decay
      if (this.lightningAge < 0.038) {
        this.lightningAlpha = 1.0;
      } else if (this.lightningAge < 0.075) {
        this.lightningAlpha = 0.25;
      } else if (this.lightningAge < 0.12) {
        this.lightningAlpha = 0.88;
      } else {
        this.lightningAlpha = Math.max(0, this.lightningAlpha - dt * 3.8);
      }
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

    // 5. Celestial Shooting Stars
    if (tuning.bgStars === 1) {
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

    const lTheme = LIGHTNING_THEMES[this.lightningThemeIdx] ?? LIGHTNING_THEMES[0]!;

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

    // 1b. Smooth Atmospheric Lightning Sky Illumination (no harsh split rectangles!)
    if (this.lightningAlpha > 0.01) {
      // Uniform atmospheric sky tint
      ctx.fillStyle = lTheme.skyHorizonWash;
      ctx.globalAlpha = this.lightningAlpha * 0.42;
      ctx.fillRect(0, 0, width, horizonY + 2);

      // Smooth radial plasma illumination around the bolt source
      const originX = this.boltMainX[0]!;
      const radGrad = ctx.createRadialGradient(originX, 10, 4, originX, 35, 240);
      radGrad.addColorStop(0, hexToRgba(lTheme.boltCore, this.lightningAlpha * 0.75));
      radGrad.addColorStop(0.4, hexToRgba(lTheme.boltMid, this.lightningAlpha * 0.38));
      radGrad.addColorStop(1, hexToRgba(lTheme.skyTopWash, 0));
      ctx.fillStyle = radGrad;
      ctx.fillRect(0, 0, width, horizonY + 2);
      ctx.globalAlpha = 1;
    }

    // -------------------------------------------------------------------------
    // 2. CELESTIAL VAULT: Twinkling Stars & Shooting Stars
    // -------------------------------------------------------------------------
    if (tuning.bgStars === 1) {
      const starScroll = this.scroll1 * 0.45;
      const starCol1 = palette.starColors ? palette.starColors[0] : palette.mountainRim;
      const starCol2 = palette.starColors ? palette.starColors[1] : '#fff3b0';

      // 2a. Twinkling Stars
      for (let i = 0; i < STAR_COUNT; i++) {
        const sx = Math.round((this.starX[i]! * width - starScroll + width * 3) % width);
        const sy = Math.round(this.starY[i]! * (horizonY - 44)) + 4;
        const twinkle = Math.sin(this.skyTime * 3.2 + this.starPhase[i]!);
        if (twinkle > -0.25) {
          ctx.fillStyle = i % 3 === 0 ? starCol1 : starCol2;
          const size = twinkle > 0.65 || pulse > 0.6 ? 2 : 1;
          ctx.fillRect(sx, sy, size, size);
        }
      }

      // 2b. Shooting Stars
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
    // 3. RETRO SYNTHWAVE SUN / MOON
    // -------------------------------------------------------------------------
    const isSunsetBoulevard = palette.id === 'og_future_funk';
    const isAkibaNight = palette.id === 'akiba_night' || palette.id === 'weeb_funk';
    const isMayonakaBay = palette.id === 'night' || (!isSunsetBoulevard && !isAkibaNight);

    const sunX = width * 0.5 - this.sunOffset;
    const sunY = isMayonakaBay ? horizonY - 30 : horizonY - 22;
    const sunR = isMayonakaBay
      ? 48 + pulse * 4.0 + downPulse * 2.0
      : 54 + pulse * 4.5 + downPulse * 2.5;

    // Atmospheric Lunar Corona / Halo for Mayonaka Bay (cached to avoid per-frame gradient allocation)
    if (isMayonakaBay && typeof ctx.createRadialGradient === 'function') {
      const haloR = sunR * 1.85;
      if (
        this.cachedCoronaCtx !== ctx ||
        this.cachedCoronaPalette !== palette ||
        Math.abs(this.cachedCoronaSunX - sunX) > 1 ||
        Math.abs(this.cachedCoronaSunY - sunY) > 1 ||
        Math.abs(this.cachedCoronaSunR - sunR) > 1 ||
        !this.cachedCoronaGrad
      ) {
        const glowGrad = ctx.createRadialGradient(sunX, sunY, sunR * 0.5, sunX, sunY, haloR);
        glowGrad.addColorStop(0, hexToRgba(palette.sunBottom, 0.28));
        glowGrad.addColorStop(0.5, hexToRgba(palette.mountainRim, 0.10));
        glowGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
        this.cachedCoronaCtx = ctx;
        this.cachedCoronaPalette = palette;
        this.cachedCoronaSunX = sunX;
        this.cachedCoronaSunY = sunY;
        this.cachedCoronaSunR = sunR;
        this.cachedCoronaGrad = glowGrad;
      }
      ctx.fillStyle = this.cachedCoronaGrad;
      ctx.beginPath();
      ctx.arc(sunX, sunY, haloR, 0, Math.PI * 2);
      ctx.fill();
    }

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
    // 3b. FORKED NEON LIGHTNING BOLT
    // -------------------------------------------------------------------------
    if (this.lightningAlpha > 0.05) {
      this.renderForkedLightningBolt(ctx, lTheme);
    }

    // -------------------------------------------------------------------------
    // 4. 16-BIT RETRO PIXEL-ART CUMULUS CLOUDS (Organic domes + flat bottom shelf)
    // -------------------------------------------------------------------------
    if (tuning.bgClouds === 1) {
      this.renderPixelArtClouds(ctx, width, palette, lTheme);
    }

    // -------------------------------------------------------------------------
    // 5. FALLBACK GROUND FILL (occludes celestial body below road horizon)
    // -------------------------------------------------------------------------
    ctx.fillStyle = palette.grass[1];
    ctx.fillRect(0, horizonY, width, height - horizonY);

    // -------------------------------------------------------------------------
    // 6. LAYER 1: LONTANISSIMO (Scroll ~0.10x)
    // -------------------------------------------------------------------------
    if (isSunsetBoulevard) {
      // Sunset Boulevard: Calm deep sea horizon
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
      ctx.fillStyle = this.lightningAlpha > 0.1 ? lTheme.boltMid : palette.mountainRim;
      ctx.globalAlpha = 0.5 + pulse * 0.25;
      ctx.fillRect(0, seaTopY, width, 1);
      ctx.globalAlpha = 1;

      // Golden setting sun reflection column on water surface directly below the sun
      const sunRefW = Math.max(16, sunR * 0.45);
      ctx.fillStyle = this.lightningAlpha > 0.2 ? lTheme.boltMid : palette.sunBottom;
      for (let dy = 0; dy < seaH; dy++) {
        const y = seaTopY + dy;
        const rip = Math.sin(this.skyTime * 4.2 + dy * 0.75) * 2.2;
        const expand = (dy / seaH) * 22;
        const refAlpha = (1 - (dy / seaH) * 0.4) * (0.45 + pulse * 0.28);
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
      // Mayonaka Bay: Central calm sea opening with moonlight reflection, framed by coastal hills at the margins
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
        wGrad.addColorStop(0.55, hexToRgba(palette.skyHorizon, 0.40));
        wGrad.addColorStop(1, hexToRgba(palette.grass[0], 0.95));
        this.cachedWaterCtx = ctx;
        this.cachedWaterHorizonY = horizonY;
        this.cachedWaterPalette = palette;
        this.cachedWaterGrad = wGrad;
      }
      ctx.fillStyle = this.cachedWaterGrad;
      ctx.fillRect(0, seaTopY, width, seaH + 2);

      // Distant calm sea horizon line across the bay
      ctx.fillStyle = this.lightningAlpha > 0.1 ? lTheme.boltMid : palette.mountainRim;
      ctx.globalAlpha = 0.55 + pulse * 0.25;
      ctx.fillRect(0, seaTopY, width, 1);
      ctx.globalAlpha = 1;

      // The Moonlight Reflection (La Scia di Luna sul Mare) cascading across the bay water directly below the moon
      // Batched as smooth outer glow trapezoid and inner silver core (replaces 52 scanline draw calls)
      const moonRefW = Math.max(16, sunR * 0.42);
      const outerTopHalfW = moonRefW * 0.5;
      const outerBotHalfW = (moonRefW + 22) * 0.5;
      const outerAlpha = Math.min(0.85, 0.55 + pulse * 0.25);
      ctx.globalAlpha = outerAlpha;
      ctx.fillStyle = palette.sunBottom;
      ctx.beginPath();
      ctx.moveTo(sunX - outerTopHalfW, seaTopY);
      ctx.lineTo(sunX + outerTopHalfW, seaTopY);
      ctx.lineTo(sunX + outerBotHalfW, seaTopY + seaH);
      ctx.lineTo(sunX - outerBotHalfW, seaTopY + seaH);
      ctx.closePath();
      ctx.fill();

      const innerHalfW = Math.max(1, moonRefW * 0.19);
      ctx.globalAlpha = Math.min(0.95, outerAlpha * 1.15);
      ctx.fillStyle = palette.sunTop;
      ctx.fillRect(sunX - innerHalfW, seaTopY, innerHalfW * 2, seaH);
      ctx.globalAlpha = 1;

      // Channel navigation buoys bobbing in the nocturnal bay waters
      const buoy1X = Math.round(sunX - 70);
      const buoy1Y = seaTopY + 8;
      const bBlink1 = Math.sin(this.skyTime * 3.5);
      ctx.fillStyle = '#060a18';
      ctx.fillRect(buoy1X - 2, buoy1Y, 4, 3);
      if (bBlink1 > 0) {
        ctx.fillStyle = COLOR_BEACON_CYAN;
        ctx.fillRect(buoy1X - 1, buoy1Y - 2, 2, 2);
        ctx.fillStyle = hexToRgba(COLOR_BEACON_CYAN, 0.45);
        ctx.fillRect(buoy1X - 1, buoy1Y + 3, 2, 3);
      }

      const buoy2X = Math.round(sunX + 75);
      const buoy2Y = seaTopY + 14;
      const bBlink2 = Math.cos(this.skyTime * 3.0);
      ctx.fillStyle = '#060a18';
      ctx.fillRect(buoy2X - 2, buoy2Y, 4, 3);
      if (bBlink2 > 0) {
        ctx.fillStyle = COLOR_BEACON_RED;
        ctx.fillRect(buoy2X - 1, buoy2Y - 2, 2, 2);
        ctx.fillStyle = hexToRgba(COLOR_BEACON_RED, 0.45);
        ctx.fillRect(buoy2X - 1, buoy2Y + 3, 2, 3);
      }

      // Subtle horizontal wave sheens across the bay water
      const sheenScroll = (this.scroll1 * 0.8 + this.skyTime * 8) % width;
      ctx.fillStyle = palette.sunTop;
      for (let s = 0; s < 4; s++) {
        const sx = Math.round((s * 160 - sheenScroll + width * 2) % width);
        const sy = seaTopY + 4 + s * 6;
        const sw = 28 + s * 8;
        ctx.globalAlpha = 0.20 + 0.10 * Math.sin(this.skyTime * 3.5 + s);
        ctx.fillRect(sx, sy, sw, 1);
      }
      ctx.globalAlpha = 1;

      // Rolling coastal hills at the margins framing the bay
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
      ctx.fillStyle = palette.mountain;
      ctx.fill();

      // Soft hill rim only where hills rise above horizon (leaves central sea horizon completely open)
      ctx.beginPath();
      let rimDrawing = false;
      for (let i = 0; i <= pointsNeeded; i++) {
        const idx = (startIdx + i) % MOUNTAIN_POINTS;
        const h = this.hillHeights[idx]!;
        const x = (i - frac) * step;
        const y = horizonY - h;
        if (h > 1) {
          if (!rimDrawing) {
            ctx.moveTo(x, y);
            rimDrawing = true;
          } else {
            ctx.lineTo(x, y);
          }
        } else {
          rimDrawing = false;
        }
      }
      ctx.strokeStyle = this.lightningAlpha > 0.1 ? lTheme.boltMid : palette.mountainRim;
      ctx.lineWidth = 1.0 + pulse * 0.8 + this.lightningAlpha * 1.5;
      ctx.stroke();
    } else {
      // Akiba Night Rush: Jagged dark mountains
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
      ctx.fillStyle = palette.mountain;
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
      ctx.strokeStyle = this.lightningAlpha > 0.1 ? lTheme.boltMid : palette.mountainRim;
      ctx.lineWidth = 1.2 + pulse * 1.1 + this.lightningAlpha * 1.6;
      ctx.stroke();
    }

    // -------------------------------------------------------------------------
    // 7. LAYER 2: INTERMEDIO — Skyline Urbano & Antenne Radio (Scroll ~0.45x)
    // -------------------------------------------------------------------------
    const towerSpacing = CITY_SPAN / CITY_TOWERS;
    const winPrimary = palette.starColors ? palette.starColors[0] : palette.mountainRim;
    const winAccent = palette.starColors && palette.starColors.length > 1 ? palette.starColors[1] : palette.mountainRim;

    const skylineBaseY = isSunsetBoulevard ? horizonY - 10 : horizonY - 4;

    for (let pass = -1; pass <= Math.ceil(width / CITY_SPAN); pass++) {
      const baseOffset = pass * CITY_SPAN - this.scroll2;
      for (let t = 0; t < CITY_TOWERS; t++) {
        const tx = Math.round(baseOffset + t * towerSpacing);
        const tw = this.towerWidths[t]!;
        if (tx + tw < -10 || tx > width + 10) continue;

        let th: number;
        let isPierBeacon = false;
        if (isSunsetBoulevard) {
          th = Math.min(14, 5 + ((t * 5 + 3) % 9));
        } else if (isAkibaNight) {
          th = 18 + ((t * 13 + 7) % 32);
        } else {
          // Mayonaka Bay: buildings strictly on the sides (ai lati), margin hills on outer edges, open sea in center
          if (t <= 5 || t >= 26) {
            // Margins (x: 0..100 and 520..620): outer coastal hills frame the edges, no buildings!
            th = 0;
          } else if (t >= 12 && t <= 19) {
            // Central bay opening (x: 240..380): open sea, no buildings!
            th = 0;
          } else if (t === 11 || t === 20) {
            // Harbor quayside pier beacons right at the bay entrance
            th = 8;
            isPierBeacon = true;
          } else if (t >= 6 && t <= 10) {
            // Left coastal city (x: 120..200): tallest near hillside (30-36px), stepping down towards harbor (16-20px)
            const flank = t - 6; // 0..4
            th = Math.round(18 + (1 - flank / 4) * 16 + ((t * 9 + 3) % 6));
          } else {
            // Right coastal city (x: 420..500): stepping up from harbor towards hillside (30-36px)
            const flank = 25 - t; // 0..4
            th = Math.round(18 + (1 - flank / 4) * 16 + ((t * 7 + 5) % 6));
          }
        }
        if (th <= 0) continue;

        const ty = skylineBaseY - th;
        const style = this.towerStyle[t]!;

        // 7a. Building silhouette (clean silhouette with lightning roof highlight)
        ctx.fillStyle = COLOR_NIGHT_SKYLINE;
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

        // Rooftop neon highlight during lightning
        if (this.lightningAlpha > 0.12 && style !== 2) {
          ctx.fillStyle = lTheme.boltMid;
          ctx.globalAlpha = this.lightningAlpha * 0.65;
          ctx.fillRect(tx, ty, tw, 1);
          ctx.globalAlpha = 1;
        }

        // 7b. Radio antenna with blinking red/cyan LED beacon
        const antH = isSunsetBoulevard
          ? 0
          : isPierBeacon
            ? 10
            : this.towerAntennaH[t]!;
        if (antH > 0) {
          const antX = tx + Math.floor(tw * 0.5);
          ctx.fillStyle = '#1e1438';
          ctx.fillRect(antX, ty - antH, 1, antH);

          // LED beacon at the tip of the antenna
          const blink = Math.sin(this.skyTime * 4.5 + this.towerBlinkPhase[t]!);
          if (blink > 0.1 || isPierBeacon) {
            ctx.fillStyle =
              t === 11
                ? COLOR_BEACON_CYAN
                : t === 20
                  ? COLOR_BEACON_RED
                  : t % 2 === 0
                    ? COLOR_BEACON_RED
                    : COLOR_BEACON_CYAN;
            ctx.fillRect(antX - 1, ty - antH - 1, 2, 2);
          }
        }

        // Waterfront quayside streetlamps for Mayonaka Bay
        if (isMayonakaBay && (t === 10 || t === 11 || t === 20 || t === 21)) {
          const lampX = t <= 11 ? tx + tw - 2 : tx + 1;
          ctx.fillStyle = '#fff3b0';
          ctx.fillRect(lampX, skylineBaseY - 2, 2, 2);
        }

        // 7c. Realistic city windows: individual apartments/offices turning on/off occasionally
        if (th >= 10) {
          const winCols = tw >= 18 ? 3 : 2;
          const winRows = Math.min(6, Math.floor(th / 5));
          const wPal = WINDOW_PALETTES[palette.id] ?? WINDOW_PALETTES.night!;

          for (let r = 0; r < winRows; r++) {
            const wy = ty + 4 + r * 5;
            if (wy >= skylineBaseY - 2) break;
            for (let c = 0; c < winCols; c++) {
              const wx = tx + 3 + c * 5;
              if (wx + 2 > tx + tw - 2) continue;

              // Unique deterministic seed per window
              const winSeed = (t * 67 + r * 31 + c * 17) % 100;
              // Occasional independent toggle cycle based on slow time (every 4-12s)
              const togglePhase = Math.sin(this.skyTime * 0.35 + winSeed * 0.73);

              // 65% always steady lit; 20% slowly toggle on/off occasionally; 15% dark
              let isLit = false;
              if (winSeed < 65) {
                isLit = true;
              } else if (winSeed < 85) {
                isLit = togglePhase > -0.15;
              }

              if (isLit) {
                const colIdx = (t + r * 2 + c * 3 + winSeed) % 3;
                ctx.fillStyle = colIdx === 0 ? wPal.col1 : colIdx === 1 ? wPal.col2 : wPal.col3;
                ctx.fillRect(wx, wy, 2, 2);
              }
            }
          }
        }
      }
    }

    // -------------------------------------------------------------------------
    // 8. LAYER 3: TRANSIZIONE (Scroll ~0.85x)
    // -------------------------------------------------------------------------
    if (isSunsetBoulevard) {
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

    const washAlpha = Math.min(
      0.85,
      0.22 + pulse * 0.36 + downPulse * 0.18 + this.lightningAlpha * 0.28,
    );
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
          ctx.fillRect(bx, by, 1, 2);
          ctx.fillRect(bx + 1, by + 1, 1, 1);
          ctx.fillRect(bx + 2, by + 2, 1, 1);
          ctx.fillRect(bx + 3, by + 1, 1, 1);
          ctx.fillRect(bx + 4, by, 1, 2);
        } else if (frame === 1) {
          ctx.fillRect(bx, by + 1, 5, 1);
          ctx.fillRect(bx + 2, by + 2, 1, 1);
        } else {
          ctx.fillRect(bx + 2, by, 1, 1);
          ctx.fillRect(bx + 1, by + 1, 1, 1);
          ctx.fillRect(bx + 3, by + 1, 1, 1);
          ctx.fillRect(bx, by + 2, 1, 2);
          ctx.fillRect(bx + 4, by + 2, 1, 2);
        }
      }
    }

    // -------------------------------------------------------------------------
    // 11. BACKGROUND SKY RAIN (Far fine mist streaks)
    // -------------------------------------------------------------------------
    if (tuning.bgRain === 1) {
      this.renderFarRain(ctx, lTheme);
    }
  }

  /**
   * Foreground weather pass called by `Game.render()` after road & car.
   * Renders the delicate near rain streaks and uniform lightning flash tint over the whole scene.
   */
  renderForegroundWeather(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
  ): void {
    const lTheme = LIGHTNING_THEMES[this.lightningThemeIdx] ?? LIGHTNING_THEMES[0]!;

    // Uniform atmospheric flash overlay over the entire screen during lightning
    if (this.lightningAlpha > 0.02) {
      ctx.fillStyle = lTheme.skyHorizonWash;
      ctx.globalAlpha = this.lightningAlpha * 0.16;
      ctx.fillRect(0, 0, width, height);
      ctx.globalAlpha = 1;
    }

    // Foreground near rain streaks over road & vehicle
    if (tuning.bgRain === 1) {
      this.renderNearRain(ctx, lTheme);
    }
  }

  /**
   * Renders the forked neon lightning bolt in 3 passes (outer electric glow, mid plasma, bright core).
   */
  private renderForkedLightningBolt(
    ctx: CanvasRenderingContext2D,
    lTheme: LightningTheme,
  ): void {
    const alpha = this.lightningAlpha;

    // Pass 1: Wide electric neon halo
    ctx.strokeStyle = lTheme.boltOuter;
    ctx.lineWidth = 4.2;
    ctx.globalAlpha = alpha * 0.52;
    this.traceLightningPaths(ctx);
    ctx.stroke();

    // Pass 2: Mid neon plasma
    ctx.strokeStyle = lTheme.boltMid;
    ctx.lineWidth = 2.0;
    ctx.globalAlpha = alpha * 0.85;
    this.traceLightningPaths(ctx);
    ctx.stroke();

    // Pass 3: Crisp incandescent core
    ctx.strokeStyle = lTheme.boltCore;
    ctx.lineWidth = 1.0;
    ctx.globalAlpha = alpha;
    this.traceLightningPaths(ctx);
    ctx.stroke();

    ctx.globalAlpha = 1;
  }

  private traceLightningPaths(ctx: CanvasRenderingContext2D): void {
    ctx.beginPath();
    ctx.moveTo(this.boltMainX[0]!, this.boltMainY[0]!);
    for (let i = 1; i < BOLT_MAIN_NODES; i++) {
      ctx.lineTo(this.boltMainX[i]!, this.boltMainY[i]!);
    }
    for (let b = 0; b < BOLT_BRANCH_COUNT; b++) {
      const baseIdx = b * BOLT_BRANCH_NODES;
      ctx.moveTo(this.boltBranchX[baseIdx]!, this.boltBranchY[baseIdx]!);
      for (let n = 1; n < BOLT_BRANCH_NODES; n++) {
        ctx.lineTo(this.boltBranchX[baseIdx + n]!, this.boltBranchY[baseIdx + n]!);
      }
    }
  }

  /**
   * Traces an authentic 16-bit pixel-art cumulus cloud silhouette:
   * Built from stacked organic circular domes with a grounded flat bottom shelf.
   * Strictly NO random rectangular slabs or front stripes.
   */
  private traceCloudSilhouette(
    ctx: CanvasRenderingContext2D,
    cx: number,
    cy: number,
    cw: number,
    ch: number,
    variant: number,
  ): void {
    const yBase = cy + ch;
    ctx.beginPath();
    ctx.moveTo(cx, yBase);

    if (variant === 0) {
      // Variant 0: Grand Cumulus (4 overlapping billowing domes)
      ctx.arc(cx + cw * 0.18, cy + ch * 0.62, cw * 0.18, Math.PI, 1.35 * Math.PI);
      ctx.arc(cx + cw * 0.44, cy + ch * 0.40, cw * 0.28, 1.2 * Math.PI, 1.85 * Math.PI);
      ctx.arc(cx + cw * 0.72, cy + ch * 0.52, cw * 0.22, 1.3 * Math.PI, 1.95 * Math.PI);
      ctx.arc(cx + cw * 0.88, cy + ch * 0.68, cw * 0.14, 1.4 * Math.PI, 0);
    } else if (variant === 1) {
      // Variant 1: Elongated Stratocumulus (3 wide rolling domes)
      ctx.arc(cx + cw * 0.22, cy + ch * 0.58, cw * 0.22, Math.PI, 1.4 * Math.PI);
      ctx.arc(cx + cw * 0.52, cy + ch * 0.44, cw * 0.26, 1.2 * Math.PI, 1.85 * Math.PI);
      ctx.arc(cx + cw * 0.82, cy + ch * 0.60, cw * 0.20, 1.35 * Math.PI, 0);
    } else {
      // Variant 2: Fluffy Compact Double-Dome
      ctx.arc(cx + cw * 0.32, cy + ch * 0.50, cw * 0.26, Math.PI, 1.6 * Math.PI);
      ctx.arc(cx + cw * 0.68, cy + ch * 0.44, cw * 0.28, 1.3 * Math.PI, 0);
    }

    ctx.lineTo(cx + cw, yBase);
    ctx.lineTo(cx, yBase);
    ctx.closePath();
  }

  /**
   * Renders 16-bit retro clouds with 3-tone shading:
   * 1. Base silhouette fill (Soft midtone)
   * 2. Clipped underside shadow band along the bottom (conforming strictly to the cloud's outline)
   * 3. Delicate top crest highlight arcs on upper domes where moonlight/sunlight hits
   */
  private ensureCloudCanvases(palette: StagePalette): void {
    if (typeof document === 'undefined' || typeof document.createElement !== 'function') return;
    if (this.cachedCloudPalette === palette && this.cloudCanvases[0] !== null) return;
    this.cachedCloudPalette = palette;

    const cPal = CLOUD_PALETTES[palette.id] ?? CLOUD_PALETTES.night!;
    for (let i = 0; i < CLOUD_COUNT; i++) {
      const cw = Math.round(this.cloudWidth[i]!);
      const ch = Math.round(this.cloudHeight[i]!);
      const variant = this.cloudVariant[i]!;

      let canvas = this.cloudCanvases[i];
      if (!canvas) {
        canvas = document.createElement('canvas');
        this.cloudCanvases[i] = canvas;
      }
      canvas.width = cw + 8;
      canvas.height = ch + 8;
      const ctx = canvas.getContext('2d');
      if (!ctx) continue;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const cx = 4;
      const cy = 2;
      const yBase = cy + ch;

      // 1. Base silhouette
      ctx.fillStyle = cPal.body;
      this.traceCloudSilhouette(ctx, cx, cy, cw, ch, variant);
      ctx.fill();

      // 2. Clipped underside shading
      ctx.save();
      this.traceCloudSilhouette(ctx, cx, cy, cw, ch, variant);
      ctx.clip();

      ctx.fillStyle = cPal.shadow;
      const shadowH = Math.max(4, Math.round(ch * 0.32));
      ctx.fillRect(cx - 5, yBase - shadowH, cw + 10, shadowH + 2);

      ctx.fillStyle = cPal.baseGlow;
      const glowH = Math.max(2, Math.round(ch * 0.12));
      ctx.fillRect(cx - 5, yBase - glowH, cw + 10, glowH + 2);
      ctx.restore();

      // 3. Top crest highlight arcs
      ctx.strokeStyle = cPal.rim;
      ctx.lineWidth = this.cloudLayer[i] === 1 ? 1.6 : 1.2;
      ctx.beginPath();
      if (variant === 0) {
        ctx.arc(cx + cw * 0.18, cy + ch * 0.62, cw * 0.18 - 0.75, 1.15 * Math.PI, 1.45 * Math.PI);
        ctx.arc(cx + cw * 0.44, cy + ch * 0.40, cw * 0.28 - 0.75, 1.20 * Math.PI, 1.80 * Math.PI);
        ctx.arc(cx + cw * 0.72, cy + ch * 0.52, cw * 0.22 - 0.75, 1.30 * Math.PI, 1.85 * Math.PI);
        ctx.arc(cx + cw * 0.88, cy + ch * 0.68, cw * 0.14 - 0.75, 1.40 * Math.PI, 1.95 * Math.PI);
      } else if (variant === 1) {
        ctx.arc(cx + cw * 0.22, cy + ch * 0.58, cw * 0.22 - 0.75, 1.15 * Math.PI, 1.50 * Math.PI);
        ctx.arc(cx + cw * 0.52, cy + ch * 0.44, cw * 0.26 - 0.75, 1.20 * Math.PI, 1.80 * Math.PI);
        ctx.arc(cx + cw * 0.82, cy + ch * 0.60, cw * 0.20 - 0.75, 1.30 * Math.PI, 1.90 * Math.PI);
      } else {
        ctx.arc(cx + cw * 0.32, cy + ch * 0.50, cw * 0.26 - 0.75, 1.15 * Math.PI, 1.65 * Math.PI);
        ctx.arc(cx + cw * 0.68, cy + ch * 0.44, cw * 0.28 - 0.75, 1.25 * Math.PI, 1.85 * Math.PI);
      }
      ctx.stroke();
    }
  }

  private renderPixelArtClouds(
    ctx: CanvasRenderingContext2D,
    width: number,
    palette: StagePalette,
    lTheme: LightningTheme,
  ): void {
    const isFlashing = this.lightningAlpha > 0.1;
    this.ensureCloudCanvases(palette);

    const cPal = CLOUD_PALETTES[palette.id] ?? CLOUD_PALETTES.night!;
    const bodyColor = isFlashing ? lTheme.cloudRim : cPal.body;
    const shadowColor = isFlashing ? lTheme.cloudBody : cPal.shadow;
    const glowColor = isFlashing ? lTheme.boltCore : cPal.baseGlow;
    const crownColor = isFlashing ? lTheme.boltCore : cPal.rim;

    for (let i = 0; i < CLOUD_COUNT; i++) {
      const cx = Math.round(this.cloudX[i]!);
      const cy = Math.round(this.cloudY[i]!);
      const cw = Math.round(this.cloudWidth[i]!);
      const ch = Math.round(this.cloudHeight[i]!);
      const isNear = this.cloudLayer[i] === 1;
      const variant = this.cloudVariant[i]!;

      if (cx + cw < -30 || cx > width + 30) continue;

      const layerAlpha = isNear ? 0.94 : 0.70;
      const offscreen = this.cloudCanvases[i];

      // Fast path: single GPU blit per cloud when pre-rendered offscreen canvas is available
      if (offscreen && !isFlashing) {
        ctx.globalAlpha = 0.88 * layerAlpha;
        ctx.drawImage(offscreen, cx - 4, cy - 2);
        ctx.globalAlpha = 1;
        continue;
      }

      const yBase = cy + ch;

      // Fallback path for lightning flashes or headless test environments
      ctx.fillStyle = bodyColor;
      ctx.globalAlpha = (isFlashing ? 0.92 : 0.88) * layerAlpha;
      this.traceCloudSilhouette(ctx, cx, cy, cw, ch, variant);
      ctx.fill();

      ctx.save();
      this.traceCloudSilhouette(ctx, cx, cy, cw, ch, variant);
      ctx.clip();

      ctx.fillStyle = shadowColor;
      ctx.globalAlpha = (isFlashing ? 0.85 : 0.48) * layerAlpha;
      const shadowH = Math.max(4, Math.round(ch * 0.32));
      ctx.fillRect(cx - 5, yBase - shadowH, cw + 10, shadowH + 2);

      ctx.fillStyle = glowColor;
      ctx.globalAlpha = (isFlashing ? 0.90 : 0.42) * layerAlpha;
      const glowH = Math.max(2, Math.round(ch * 0.12));
      ctx.fillRect(cx - 5, yBase - glowH, cw + 10, glowH + 2);

      ctx.restore();

      ctx.strokeStyle = crownColor;
      ctx.lineWidth = isNear ? 1.6 : 1.2;
      ctx.globalAlpha = (isFlashing ? 1.0 : 0.78) * layerAlpha;
      ctx.beginPath();
      if (variant === 0) {
        ctx.arc(cx + cw * 0.18, cy + ch * 0.62, cw * 0.18 - 0.75, 1.15 * Math.PI, 1.45 * Math.PI);
        ctx.arc(cx + cw * 0.44, cy + ch * 0.40, cw * 0.28 - 0.75, 1.20 * Math.PI, 1.80 * Math.PI);
        ctx.arc(cx + cw * 0.72, cy + ch * 0.52, cw * 0.22 - 0.75, 1.30 * Math.PI, 1.85 * Math.PI);
        ctx.arc(cx + cw * 0.88, cy + ch * 0.68, cw * 0.14 - 0.75, 1.40 * Math.PI, 1.95 * Math.PI);
      } else if (variant === 1) {
        ctx.arc(cx + cw * 0.22, cy + ch * 0.58, cw * 0.22 - 0.75, 1.15 * Math.PI, 1.50 * Math.PI);
        ctx.arc(cx + cw * 0.52, cy + ch * 0.44, cw * 0.26 - 0.75, 1.20 * Math.PI, 1.80 * Math.PI);
        ctx.arc(cx + cw * 0.82, cy + ch * 0.60, cw * 0.20 - 0.75, 1.30 * Math.PI, 1.90 * Math.PI);
      } else {
        ctx.arc(cx + cw * 0.32, cy + ch * 0.50, cw * 0.26 - 0.75, 1.15 * Math.PI, 1.65 * Math.PI);
        ctx.arc(cx + cw * 0.68, cy + ch * 0.44, cw * 0.28 - 0.75, 1.25 * Math.PI, 1.85 * Math.PI);
      }
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }

  /**
   * Far rain streaks rendered in the distant sky (40 fine, soft streaks).
   */
  private renderFarRain(ctx: CanvasRenderingContext2D, lTheme: LightningTheme): void {
    const isFlashing = this.lightningAlpha > 0.1;
    ctx.strokeStyle = isFlashing ? lTheme.boltMid : COLOR_RAIN_FAR;
    ctx.lineWidth = 1.0;
    ctx.globalAlpha = 0.24 + this.lightningAlpha * 0.20;
    ctx.beginPath();
    for (let i = 0; i < RAIN_FAR_COUNT; i++) {
      const rx = this.rainX[i]!;
      const ry = this.rainY[i]!;
      const len = this.rainLength[i]!;
      const dx = (this.currentWindX * 0.75 * len) / this.rainSpeed[i]!;
      ctx.moveTo(rx, ry);
      ctx.lineTo(rx + dx, ry + len);
    }
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  /**
   * Near rain streaks rendered in the foreground over the road (32 crisp streaks, no floating brackets).
   */
  private renderNearRain(ctx: CanvasRenderingContext2D, lTheme: LightningTheme): void {
    const isFlashing = this.lightningAlpha > 0.1;
    ctx.strokeStyle = isFlashing ? lTheme.boltCore : COLOR_RAIN_NEAR;
    ctx.lineWidth = 1.0;
    ctx.globalAlpha = 0.38 + this.lightningAlpha * 0.25;
    ctx.beginPath();
    for (let i = RAIN_FAR_COUNT; i < RAIN_COUNT; i++) {
      const rx = this.rainX[i]!;
      const ry = this.rainY[i]!;
      const len = this.rainLength[i]!;
      const dx = (this.currentWindX * 1.25 * len) / this.rainSpeed[i]!;
      ctx.moveTo(rx, ry);
      ctx.lineTo(rx + dx, ry + len);
    }
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
}
