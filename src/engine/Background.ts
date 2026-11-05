import { tuning } from '@src/config/tuning';
import type { StagePalette } from '@src/road/palette';

// ---------------------------------------------------------------------------
// Pre-allocated array sizes & geometry spans (AGENTS.md §4.3: ZERO GC in loop)
// ---------------------------------------------------------------------------
const MOUNTAIN_POINTS = 64;
const MOUNTAIN_SPAN = 960;
const STAR_COUNT = 56;
const SHOOTING_STAR_COUNT = 2;
const CITY_TOWERS = 32;
const CITY_SPAN = 640;
const CLOUD_COUNT = 9;
const LOBES_PER_CLOUD = 6;
const RAIN_COUNT = 120;
const SPLASH_COUNT = 28;
const BIRD_COUNT = 6;

const BOLT_MAIN_NODES = 10;
const BOLT_BRANCH_COUNT = 3;
const BOLT_BRANCH_NODES = 4;

// ---------------------------------------------------------------------------
// Real Astronomical Constellations (accurate relative coordinates & magnitudes)
// ---------------------------------------------------------------------------
interface ConstellationStar {
  readonly dx: number;
  readonly dy: number;
  /** 2 = alpha/bright principal star (cross flare), 1 = standard star */
  readonly mag: 1 | 2;
  /** Optional spectral tint override (e.g. Betelgeuse / Antares warm supergiant) */
  readonly color?: string;
}

interface RealConstellation {
  readonly name: string;
  readonly anchorX: number;
  readonly anchorY: number;
  readonly stars: readonly ConstellationStar[];
  /** Flat pairs of indices [a0, b0, a1, b1, ...] connecting stars in `stars` */
  readonly edges: readonly number[];
}

const REAL_CONSTELLATIONS: readonly RealConstellation[] = [
  // 0. Ursa Major (Orsa Maggiore / Grande Carro — Big Dipper)
  {
    name: 'Ursa Major',
    anchorX: 76,
    anchorY: 28,
    stars: [
      { dx: -28, dy: -9, mag: 2 }, // 0: Dubhe (α)
      { dx: -25, dy: 6, mag: 2 }, // 1: Merak (β)
      { dx: -8, dy: 8, mag: 1 }, // 2: Phecda (γ)
      { dx: -6, dy: -4, mag: 1 }, // 3: Megrez (δ)
      { dx: 8, dy: -6, mag: 2 }, // 4: Alioth (ε)
      { dx: 20, dy: -5, mag: 2 }, // 5: Mizar (ζ)
      { dx: 33, dy: 3, mag: 2 }, // 6: Alkaid (η)
    ],
    edges: [0, 1, 1, 2, 2, 3, 3, 0, 3, 4, 4, 5, 5, 6],
  },
  // 1. Cassiopeia (La Regina — Iconic Asymmetric 'W')
  {
    name: 'Cassiopeia',
    anchorX: 204,
    anchorY: 22,
    stars: [
      { dx: -24, dy: -6, mag: 2 }, // 0: Caph (β)
      { dx: -12, dy: 8, mag: 2, color: '#ffd6a5' }, // 1: Shedir (α)
      { dx: 0, dy: -3, mag: 2 }, // 2: Gamma Cas / Navi (γ)
      { dx: 13, dy: 9, mag: 1 }, // 3: Ruchbah (δ)
      { dx: 26, dy: -5, mag: 1 }, // 4: Segin (ε)
    ],
    edges: [0, 1, 1, 2, 2, 3, 3, 4],
  },
  // 2. Orion (Orione — Hourglass, 3-Star Belt, Sword & Hunter's Bow)
  {
    name: 'Orion',
    anchorX: 336,
    anchorY: 32,
    stars: [
      { dx: 0, dy: -21, mag: 1 }, // 0: Meissa (λ - Head)
      { dx: -15, dy: -12, mag: 2, color: '#ff9e5e' }, // 1: Betelgeuse (α - Red Supergiant)
      { dx: 13, dy: -10, mag: 2, color: '#caf0f8' }, // 2: Bellatrix (γ)
      { dx: -5, dy: 1, mag: 2 }, // 3: Alnitak (ζ - Belt Left)
      { dx: 0, dy: 0, mag: 2 }, // 4: Alnilam (ε - Belt Center)
      { dx: 5, dy: -1, mag: 2 }, // 5: Mintaka (δ - Belt Right)
      { dx: -12, dy: 17, mag: 1 }, // 6: Saiph (κ - Left Foot)
      { dx: 15, dy: 15, mag: 2, color: '#90e0ef' }, // 7: Rigel (β - Blue Supergiant)
      { dx: -1, dy: 8, mag: 1, color: '#ff85c0' }, // 8: Orion Nebula M42 (Sword)
      { dx: 25, dy: -8, mag: 1 }, // 9: Pi3 Orionis (Bow Center)
      { dx: 22, dy: -16, mag: 1 }, // 10: Pi1 Orionis (Bow Top)
      { dx: 22, dy: 1, mag: 1 }, // 11: Pi6 Orionis (Bow Bottom)
    ],
    edges: [
      1, 0, 0, 2, 1, 2, 1, 3, 2, 5, 3, 4, 4, 5, 3, 6, 5, 7, 6, 7, 4, 8, 2, 9, 10, 9, 9, 11,
    ],
  },
  // 3. Cygnus (Il Cigno — Northern Cross)
  {
    name: 'Cygnus',
    anchorX: 468,
    anchorY: 25,
    stars: [
      { dx: 0, dy: -16, mag: 2, color: '#e0fbfc' }, // 0: Deneb (α - Tail)
      { dx: 0, dy: -3, mag: 2 }, // 1: Sadr (γ - Chest)
      { dx: 0, dy: 16, mag: 2, color: '#ffd166' }, // 2: Albireo (β - Beak)
      { dx: -17, dy: -1, mag: 1 }, // 3: Gienah (ε - Left Wing)
      { dx: 17, dy: -1, mag: 1 }, // 4: Delta Cygni (δ - Right Wing)
      { dx: -28, dy: 5, mag: 1 }, // 5: Aljanah (Left Wingtip)
      { dx: 28, dy: 5, mag: 1 }, // 6: Fawaris (Right Wingtip)
    ],
    edges: [0, 1, 1, 2, 5, 3, 3, 1, 1, 4, 4, 6],
  },
  // 4. Scorpius (Lo Scorpione — Claws, Antares & Hooked Stinger Tail)
  {
    name: 'Scorpius',
    anchorX: 588,
    anchorY: 30,
    stars: [
      { dx: -20, dy: -14, mag: 1 }, // 0: Acrab (β - Top Claw)
      { dx: -23, dy: -5, mag: 2 }, // 1: Dschubba (δ - Mid Claw)
      { dx: -19, dy: 3, mag: 1 }, // 2: Pi Scorpii (π - Bottom Claw)
      { dx: -9, dy: -3, mag: 2, color: '#ff6b6b' }, // 3: Antares (α - Red Heart)
      { dx: -2, dy: 3, mag: 1 }, // 4: Tau Scorpii (τ)
      { dx: 5, dy: 12, mag: 1 }, // 5: Epsilon Scorpii (ε)
      { dx: 14, dy: 17, mag: 2 }, // 6: Sargas (θ - Tail Loop)
      { dx: 23, dy: 14, mag: 1 }, // 7: Kappa Scorpii (κ)
      { dx: 25, dy: 6, mag: 2 }, // 8: Shaula (λ - Stinger)
    ],
    edges: [0, 1, 2, 1, 1, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8],
  },
];

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
    boltCore: '#e8RSff'.replace('RS', 'fb'),
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
const COLOR_RAIN_FAR = '#72b8f0';
const COLOR_RAIN_MID = '#a2dcff';
const COLOR_RAIN_NEAR = '#dcf3ff';
const COLOR_WATER_DEEP = '#030514';

// Relative template for the 6 volumetric puff lobes of a cumulus cloud
// Normalized to cloudWidth (dx, rx) and cloudHeight (dy, ry)
const CLOUD_LOBE_DX = new Float32Array([-0.32, -0.14, 0.06, 0.28, -0.06, 0.16]);
const CLOUD_LOBE_DY = new Float32Array([0.18, -0.08, -0.22, 0.14, 0.22, 0.04]);
const CLOUD_LOBE_RX = new Float32Array([0.22, 0.26, 0.28, 0.22, 0.30, 0.25]);
const CLOUD_LOBE_RY = new Float32Array([0.46, 0.62, 0.72, 0.48, 0.44, 0.56]);

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
 * - Weather & Celestial — volumetric cumulus clouds, vibeful neon forked lightning, 3-depth rain + splashes,
 *   3-frame flap birds, real astronomical constellations & shooting stars.
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

  // Weather: Volumetric Cumulus Clouds
  private readonly cloudX = new Float32Array(CLOUD_COUNT);
  private readonly cloudY = new Float32Array(CLOUD_COUNT);
  private readonly cloudWidth = new Float32Array(CLOUD_COUNT);
  private readonly cloudHeight = new Float32Array(CLOUD_COUNT);
  private readonly cloudSpeed = new Float32Array(CLOUD_COUNT);
  private readonly cloudLayer = new Uint8Array(CLOUD_COUNT); // 0 = high/far, 1 = mid/near
  private readonly cloudVariant = new Uint8Array(CLOUD_COUNT);

  // Weather: 3-Layer Rain & Water Splashes
  private readonly rainX = new Float32Array(RAIN_COUNT);
  private readonly rainY = new Float32Array(RAIN_COUNT);
  private readonly rainSpeed = new Float32Array(RAIN_COUNT);
  private readonly rainLength = new Float32Array(RAIN_COUNT);
  private readonly rainLayer = new Uint8Array(RAIN_COUNT); // 0 = far, 1 = mid, 2 = near
  private currentWindX = -65;

  private readonly splashX = new Float32Array(SPLASH_COUNT);
  private readonly splashY = new Float32Array(SPLASH_COUNT);
  private readonly splashPhase = new Float32Array(SPLASH_COUNT);
  private readonly splashSpeed = new Float32Array(SPLASH_COUNT);

  // Weather: Vibeful Sudden Lightning & Procedural Forked Bolt
  private lightningAlpha = 0;
  private lightningAge = 10;
  private lightningThemeIdx = 0;
  private lightningStrikeCount = 0;
  private prevDownbeatPulse = 0;
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

  constructor() {
    // 1. Layer 1: Mountain ridges & Mayonaka rolling hills
    for (let i = 0; i < MOUNTAIN_POINTS; i++) {
      const t = (i / MOUNTAIN_POINTS) * Math.PI * 2;
      const h =
        Math.sin(t * 2) * 16 + Math.sin(t * 5 + 1.1) * 10 + Math.cos(t * 11 + 0.4) * 5 + 24;
      this.ridgeHeights[i] = Math.max(6, h);

      // Rolling hills for Mayonaka Bay
      const hHill = Math.sin(t * 1.5) * 11 + Math.sin(t * 3.5 + 0.4) * 5 + 16;
      this.hillHeights[i] = Math.max(6, hHill);

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

    // 4. Volumetric Cumulus Clouds (2 depth layers)
    for (let i = 0; i < CLOUD_COUNT; i++) {
      const isNear = i >= 4 ? 1 : 0;
      this.cloudLayer[i] = isNear;
      this.cloudVariant[i] = i % 3;
      this.cloudX[i] = (i * 98 + 25) % 760;
      this.cloudY[i] = isNear ? 34 + ((i * 19 + 5) % 42) : 18 + ((i * 23 + 11) % 34);
      this.cloudWidth[i] = isNear ? 76 + ((i * 19) % 44) : 54 + ((i * 13) % 30);
      this.cloudHeight[i] = isNear ? 22 + ((i * 7) % 12) : 14 + ((i * 5) % 8);
      this.cloudSpeed[i] = isNear ? 7 + ((i * 3) % 6) : 3.5 + ((i * 2) % 4);
    }

    // 5. 3-Layer Rain particles & surface splashes
    for (let i = 0; i < RAIN_COUNT; i++) {
      const layer = i < 45 ? 0 : i < 90 ? 1 : 2;
      this.rainLayer[i] = layer;
      this.rainX[i] = (i * 53 + 17) % 640;
      this.rainY[i] = (i * 37 + 11) % 360;
      if (layer === 0) {
        this.rainSpeed[i] = 310 + ((i * 19) % 70);
        this.rainLength[i] = 7 + ((i * 5) % 5);
      } else if (layer === 1) {
        this.rainSpeed[i] = 450 + ((i * 29) % 110);
        this.rainLength[i] = 13 + ((i * 7) % 7);
      } else {
        this.rainSpeed[i] = 630 + ((i * 31) % 140);
        this.rainLength[i] = 20 + ((i * 9) % 9);
      }
    }

    for (let s = 0; s < SPLASH_COUNT; s++) {
      this.splashX[s] = (s * 67 + 23) % 620 + 10;
      this.splashY[s] = 172 + ((s * 43 + 19) % 180);
      this.splashPhase[s] = (s * 0.37) % 1.0;
      this.splashSpeed[s] = 2.6 + ((s * 7) % 5) * 0.35;
    }

    // Initialize default bolt geometry
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
    const startY = 8 + ((seed * 13) % 20);
    const endY = Math.max(startY + 40, horizonY - 6);
    const spanY = endY - startY;

    let curX = originX;
    this.boltMainX[0] = curX;
    this.boltMainY[0] = startY;

    for (let i = 1; i < BOLT_MAIN_NODES; i++) {
      const t = i / (BOLT_MAIN_NODES - 1);
      const zig = (((seed + i * 7) % 5) - 2) * 9 + (i % 2 === 0 ? 11 : -11);
      curX = Math.max(24, Math.min(616, curX + zig));
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
        bx += dir * (8 + ((seed + b * 3 + n * 5) % 9));
        by += 10 + ((seed + n * 7) % 8);
        this.boltBranchX[baseIdx + n] = bx;
        this.boltBranchY[baseIdx + n] = by;
      }
    }
  }

  private triggerLightningStrike(): void {
    this.lightningStrikeCount++;
    this.lightningAge = 0;
    this.lightningAlpha = 1.0;
    this.lightningThemeIdx = this.lightningStrikeCount % LIGHTNING_THEMES.length;

    const strikeX = 90 + ((this.lightningStrikeCount * 173 + Math.floor(this.skyTime * 97)) % 460);
    this.rebuildLightningBolt(strikeX, 180, this.lightningStrikeCount);
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

    // 1. Volumetric Clouds (depth-layered wind drift + curve parallax)
    if (tuning.bgClouds === 1) {
      for (let i = 0; i < CLOUD_COUNT; i++) {
        const parallaxFactor = this.cloudLayer[i] === 1 ? 22 : 12;
        this.cloudX[i] += (this.cloudSpeed[i]! - curveSpd * parallaxFactor) * dt;
        if (this.cloudX[i]! > 780) this.cloudX[i]! -= 920;
        else if (this.cloudX[i]! < -140) this.cloudX[i]! += 920;
      }
    }

    // 2. Rain & Storm Physics (3 depth tiers + surface splashes)
    if (tuning.bgRain === 1) {
      const targetWindX = -72 - curveSpd * 95;
      this.currentWindX += (targetWindX - this.currentWindX) * Math.min(1, dt * 8);

      for (let i = 0; i < RAIN_COUNT; i++) {
        const layerScale = this.rainLayer[i] === 0 ? 0.65 : this.rainLayer[i] === 1 ? 1.0 : 1.35;
        this.rainY[i] += this.rainSpeed[i]! * dt;
        this.rainX[i] += this.currentWindX * layerScale * dt;
        if (this.rainY[i]! > 368) {
          this.rainY[i] = -this.rainLength[i]!;
          this.rainX[i] = (this.rainX[i]! + 257) % 640;
        }
        if (this.rainX[i]! < -20) this.rainX[i]! += 680;
        else if (this.rainX[i]! > 660) this.rainX[i]! -= 680;
      }

      for (let s = 0; s < SPLASH_COUNT; s++) {
        this.splashPhase[s] += this.splashSpeed[s]! * dt;
        if (this.splashPhase[s]! >= 1.0) {
          this.splashPhase[s]! -= 1.0;
          this.splashX[s] = (this.splashX[s]! + 173) % 620 + 10;
        }
      }
    }

    // 3. Sudden Vibeful Lightning Flash (multi-flicker envelope on strong downbeats)
    const threshold = tuning.bgRain === 1 ? 0.72 : 0.8;
    if (
      tuning.bgLightningOnBeat === 1 &&
      downbeatPulse > threshold &&
      this.prevDownbeatPulse <= threshold
    ) {
      this.triggerLightningStrike();
    }
    this.prevDownbeatPulse = downbeatPulse;

    if (this.lightningAlpha > 0) {
      this.lightningAge += dt;
      // Sudden double-flicker envelope:
      // 0..42ms: full sudden flash (1.0)
      // 42..80ms: sharp micro-dip (0.28)
      // 80..135ms: secondary re-strike (0.92)
      // >135ms: rapid synthwave afterglow decay
      if (this.lightningAge < 0.042) {
        this.lightningAlpha = 1.0;
      } else if (this.lightningAge < 0.08) {
        this.lightningAlpha = 0.28;
      } else if (this.lightningAge < 0.135) {
        this.lightningAlpha = 0.92;
      } else {
        this.lightningAlpha = Math.max(0, this.lightningAlpha - dt * 4.2);
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

    // 5. Real Constellations & Shooting Stars
    if (tuning.bgConstellations === 1) {
      this.constellationTimer += dt;
      const cycle = this.constellationTimer % 12;
      if (cycle < 1.2) {
        this.constellationAlpha = 0.35 + (cycle / 1.2) * 0.65;
      } else if (cycle < 8.5) {
        this.constellationAlpha = 1.0;
      } else if (cycle < 10.5) {
        this.constellationAlpha = 0.35 + ((10.5 - cycle) / 2.0) * 0.65;
      } else {
        this.constellationAlpha = 0.35;
      }
      this.activeConstellationGroup =
        Math.floor(this.constellationTimer / 12) % REAL_CONSTELLATIONS.length;

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

    // Check for downbeat lightning trigger if called directly via render
    const threshold = tuning.bgRain === 1 ? 0.72 : 0.8;
    if (
      tuning.bgLightningOnBeat === 1 &&
      downbeatPulse > threshold &&
      this.prevDownbeatPulse <= threshold
    ) {
      this.triggerLightningStrike();
    }
    this.prevDownbeatPulse = downbeatPulse;

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

    // 1b. Vibeful Sudden Lightning Sky Wash & Forked Neon Bolt (if active)
    if (this.lightningAlpha > 0.01) {
      const upperH = Math.floor(horizonY * 0.58);
      // Upper sky deep electric wash
      ctx.fillStyle = lTheme.skyTopWash;
      ctx.globalAlpha = this.lightningAlpha * 0.72;
      ctx.fillRect(0, 0, width, upperH);

      // Lower horizon vibrant neon flash
      ctx.fillStyle = lTheme.skyHorizonWash;
      ctx.globalAlpha = this.lightningAlpha * 0.62;
      ctx.fillRect(0, upperH, width, horizonY - upperH + 2);

      // Intense localized plasma glow around the lightning origin
      const originX = this.boltMainX[0]!;
      ctx.fillStyle = lTheme.boltMid;
      ctx.globalAlpha = this.lightningAlpha * 0.38;
      ctx.fillRect(Math.max(0, originX - 90), 0, 180, horizonY);
      ctx.fillStyle = lTheme.boltCore;
      ctx.globalAlpha = this.lightningAlpha * 0.25;
      ctx.fillRect(Math.max(0, originX - 42), 0, 84, Math.floor(horizonY * 0.75));
      ctx.globalAlpha = 1;
    }

    // -------------------------------------------------------------------------
    // 2. CELESTIAL VAULT: Twinkling Stars, Real Constellations & Shooting Stars
    // -------------------------------------------------------------------------
    const starScroll = this.scroll1 * 0.45;
    const starCol1 = palette.starColors ? palette.starColors[0] : palette.mountainRim;
    const starCol2 = palette.starColors ? palette.starColors[1] : '#fff3b0';

    // 2a. Background Twinkling Stars
    for (let i = 0; i < STAR_COUNT; i++) {
      const sx = Math.round((this.starX[i]! * width - starScroll + width * 3) % width);
      const sy = Math.round(this.starY[i]! * (horizonY - 46)) + 4;
      const twinkle = Math.sin(this.skyTime * 3.2 + this.starPhase[i]!);
      if (twinkle > -0.25) {
        ctx.fillStyle = i % 3 === 0 ? starCol1 : starCol2;
        const size = twinkle > 0.65 || pulse > 0.6 ? 2 : 1;
        ctx.fillRect(sx, sy, size, size);
      }
    }

    // 2b. Real Astronomical Constellations (Ursa Major, Cassiopeia, Orion, Cygnus, Scorpius)
    if (tuning.bgConstellations === 1) {
      const activeAlpha = Math.max(0.32, this.constellationAlpha);
      for (let cIdx = 0; cIdx < REAL_CONSTELLATIONS.length; cIdx++) {
        const c = REAL_CONSTELLATIONS[cIdx]!;
        const isSpotlight = cIdx === this.activeConstellationGroup;
        const cAlpha = isSpotlight
          ? activeAlpha * (0.52 + pulse * 0.35)
          : 0.24 + pulse * 0.14;

        // Rigid constellation anchor so stars never split across screen wrap
        const anchorX = ((c.anchorX - starScroll) % width + width) % width;
        const anchorY = c.anchorY;

        // Soft astronomical chart connecting lines
        ctx.strokeStyle = isSpotlight ? starCol1 : starCol2;
        ctx.lineWidth = isSpotlight ? 1.15 : 0.75;
        ctx.globalAlpha = Math.min(0.92, cAlpha);
        ctx.beginPath();
        const edges = c.edges;
        for (let e = 0; e < edges.length; e += 2) {
          const sA = c.stars[edges[e]!]!;
          const sB = c.stars[edges[e + 1]!]!;
          ctx.moveTo(anchorX + sA.dx, anchorY + sA.dy);
          ctx.lineTo(anchorX + sB.dx, anchorY + sB.dy);
        }
        ctx.stroke();

        // Render true constellation stars & cross-flares on magnitude-2 alpha stars
        for (let s = 0; s < c.stars.length; s++) {
          const st = c.stars[s]!;
          const sx = Math.round(anchorX + st.dx);
          const sy = Math.round(anchorY + st.dy);
          if (sx < -8 || sx > width + 8) continue;

          ctx.fillStyle = st.color ?? (st.mag === 2 ? starCol2 : starCol1);
          if (st.mag === 2) {
            ctx.globalAlpha = isSpotlight ? Math.min(1, activeAlpha + 0.25) : 0.75;
            ctx.fillRect(sx - 1, sy - 1, 3, 3);
            if (isSpotlight) {
              // 4-point celestial cross flare on principal stars
              ctx.globalAlpha = activeAlpha * (0.45 + pulse * 0.35);
              ctx.fillRect(sx - 3, sy, 7, 1);
              ctx.fillRect(sx, sy - 3, 1, 7);
            }
          } else {
            ctx.globalAlpha = isSpotlight ? 0.85 : 0.55;
            ctx.fillRect(sx, sy, 2, 2);
          }
        }
      }
      ctx.globalAlpha = 1;

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
    // 3. RETRO SYNTHWAVE SUN / MOON (in Layer 1, behind near clouds)
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
    // 3b. VOLUMETRIC CUMULUS CLOUDS & FORKED NEON LIGHTNING BOLT
    // -------------------------------------------------------------------------
    if (this.lightningAlpha > 0.05) {
      this.renderForkedLightningBolt(ctx, lTheme);
    }

    if (tuning.bgClouds === 1) {
      this.renderVolumetricClouds(ctx, width, sunX, palette, lTheme);
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
      ctx.fillStyle = this.lightningAlpha > 0.08 ? '#04020a' : palette.mountain;
      ctx.fill();

      // Soft hill rim (flashes with electric lightning rim on strike)
      ctx.beginPath();
      for (let i = 0; i <= pointsNeeded; i++) {
        const idx = (startIdx + i) % MOUNTAIN_POINTS;
        const x = (i - frac) * step;
        const y = horizonY - this.hillHeights[idx]!;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = this.lightningAlpha > 0.1 ? lTheme.boltMid : palette.mountainRim;
      ctx.lineWidth = 1.0 + pulse * 0.8 + this.lightningAlpha * 1.2;
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
      ctx.fillStyle = this.lightningAlpha > 0.08 ? '#04020a' : palette.mountain;
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
      ctx.lineWidth = 1.2 + pulse * 1.1 + this.lightningAlpha * 1.4;
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

        const th = isSunsetBoulevard
          ? Math.min(14, 5 + ((t * 5 + 3) % 9))
          : isAkibaNight
            ? 18 + ((t * 13 + 7) % 32)
            : 12 + ((t * 9 + 5) % 18);

        const ty = skylineBaseY - th;
        const style = this.towerStyle[t]!;

        // 7a. Building silhouette (deep contrast on lightning flash)
        ctx.fillStyle = this.lightningAlpha > 0.08 ? '#030108' : COLOR_NIGHT_SKYLINE;
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

        // Rooftop neon rim highlight during lightning
        if (this.lightningAlpha > 0.12 && style !== 2) {
          ctx.fillStyle = lTheme.boltMid;
          ctx.globalAlpha = this.lightningAlpha * 0.7;
          ctx.fillRect(tx, ty, tw, 1);
          ctx.globalAlpha = 1;
        }

        // 7b. Radio antenna with blinking red/cyan LED beacon
        const antH = isSunsetBoulevard ? 0 : this.towerAntennaH[t]!;
        if (antH > 0) {
          const antX = tx + Math.floor(tw * 0.5);
          ctx.fillStyle = this.lightningAlpha > 0.08 ? '#030108' : '#1e1438';
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
    // 11. MULTI-LAYER ATMOSPHERIC RAIN (Far & Mid sky tiers + specular streaks)
    // -------------------------------------------------------------------------
    if (tuning.bgRain === 1) {
      this.renderRainLayers(ctx, palette, lTheme, false);
    }
  }

  /**
   * Optional foreground weather pass called by `Game.render()` after road & car
   * so near-camera raindrops and wet road splashes appear in front of the asphalt.
   */
  renderForegroundWeather(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    palette: StagePalette,
  ): void {
    const lTheme = LIGHTNING_THEMES[this.lightningThemeIdx] ?? LIGHTNING_THEMES[0]!;

    // Subtle atmospheric neon wash on road/car during a lightning strike
    if (this.lightningAlpha > 0.02) {
      const horizonY = Math.floor(height * 0.5);
      ctx.fillStyle = lTheme.skyHorizonWash;
      ctx.globalAlpha = this.lightningAlpha * 0.16;
      ctx.fillRect(0, horizonY, width, height - horizonY);
      ctx.globalAlpha = 1;
    }

    if (tuning.bgRain === 1) {
      this.renderRainLayers(ctx, palette, lTheme, true);
    }
  }

  /**
   * Renders the forked neon lightning bolt in 3 passes (outer neon glow, mid plasma, bright core).
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
    ctx.lineWidth = 2.2;
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
   * Renders true multi-lobed volumetric cumulus clouds with 4-tone shading:
   * 1. Sun/Moon upper crown rim highlight
   * 2. Billowing puff domes (arc lobes + sculpted pixel-art volume steps)
   * 3. Deep atmospheric shadow belly
   * 4. Horizon neon under-glow rim
   */
  private renderVolumetricClouds(
    ctx: CanvasRenderingContext2D,
    width: number,
    sunX: number,
    palette: StagePalette,
    lTheme: LightningTheme,
  ): void {
    const isFlashing = this.lightningAlpha > 0.1;
    const crownColor = isFlashing ? lTheme.boltCore : palette.sunTop;
    const bodyColor = isFlashing ? lTheme.cloudBody : palette.skyMid;
    const bellyShadowColor = palette.skyTop;
    const underRimColor = isFlashing ? lTheme.cloudRim : palette.skyHorizon;

    for (let i = 0; i < CLOUD_COUNT; i++) {
      const cx = Math.round(this.cloudX[i]!);
      const cy = Math.round(this.cloudY[i]!);
      const cw = Math.round(this.cloudWidth[i]!);
      const ch = Math.round(this.cloudHeight[i]!);
      const isNear = this.cloudLayer[i] === 1;
      const variant = this.cloudVariant[i]!;

      if (cx + cw < -40 || cx - cw > width + 40) continue;

      const centerX = cx + cw * 0.5;
      const centerY = cy + ch * 0.55;
      const sunDir = centerX < sunX ? 1.5 : -1.5;
      const layerAlpha = isNear ? 0.86 : 0.58;

      // 1. Upper Sunlit / Moonlit Crown Highlight Lobes (offset toward sun & top)
      ctx.fillStyle = crownColor;
      ctx.globalAlpha = (isFlashing ? 0.88 : 0.52) * layerAlpha;
      ctx.beginPath();
      for (let l = 0; l < LOBES_PER_CLOUD; l++) {
        const flip = variant === 1 ? -1 : 1;
        const lx = centerX + CLOUD_LOBE_DX[l]! * cw * flip + sunDir;
        const ly = centerY + CLOUD_LOBE_DY[l]! * ch - 2.2;
        const r = Math.max(5, (CLOUD_LOBE_RX[l]! * cw + CLOUD_LOBE_RY[l]! * ch) * 0.32);
        ctx.moveTo(lx + r, ly);
        ctx.arc(lx, ly, r, 0, Math.PI * 2);
      }
      ctx.fill();

      // 2. Main Billowing Cumulus Puff Body (overlapping volumetric domes + pixel-art terrace)
      ctx.fillStyle = bodyColor;
      ctx.globalAlpha = (isFlashing ? 0.85 : 0.78) * layerAlpha;
      ctx.beginPath();
      for (let l = 0; l < LOBES_PER_CLOUD; l++) {
        const flip = variant === 1 ? -1 : 1;
        const lx = centerX + CLOUD_LOBE_DX[l]! * cw * flip;
        const ly = centerY + CLOUD_LOBE_DY[l]! * ch;
        const r = Math.max(5, (CLOUD_LOBE_RX[l]! * cw + CLOUD_LOBE_RY[l]! * ch) * 0.34);
        ctx.moveTo(lx + r, ly);
        ctx.arc(lx, ly, r, 0, Math.PI * 2);
      }
      ctx.fill();

      // Sculpted volumetric core & flat condensation base
      const baseTopY = Math.round(centerY - ch * 0.12);
      const baseH = Math.max(5, Math.round(ch * 0.52));
      ctx.fillRect(Math.round(cx + cw * 0.14), baseTopY, Math.round(cw * 0.72), baseH);
      ctx.fillRect(
        Math.round(cx + cw * 0.24),
        Math.round(centerY - ch * 0.36),
        Math.round(cw * 0.48),
        Math.max(4, Math.round(ch * 0.32)),
      );

      // 3. Internal Deep Shadow Belly (gives 3D weight & depth to the lower cloud mass)
      ctx.fillStyle = bellyShadowColor;
      ctx.globalAlpha = (isFlashing ? 0.65 : 0.56) * layerAlpha;
      const bellyY = baseTopY + Math.floor(baseH * 0.45);
      const bellyH = Math.max(3, Math.ceil(baseH * 0.55));
      ctx.fillRect(Math.round(cx + cw * 0.12), bellyY, Math.round(cw * 0.76), bellyH);

      // 4. Warm / Neon Horizon Under-Glow Rim along the condensation base
      ctx.fillStyle = underRimColor;
      ctx.globalAlpha = (isFlashing ? 0.95 : 0.62) * layerAlpha;
      ctx.fillRect(Math.round(cx + cw * 0.16), bellyY + bellyH - 1, Math.round(cw * 0.68), 2);
    }
    ctx.globalAlpha = 1;
  }

  /**
   * Renders depth-layered angled rain streaks aligned with the dynamic wind vector
   * and shimmering ground/horizon water splashes.
   */
  private renderRainLayers(
    ctx: CanvasRenderingContext2D,
    palette: StagePalette,
    lTheme: LightningTheme,
    foregroundOnly: boolean,
  ): void {
    const isFlashing = this.lightningAlpha > 0.1;

    if (!foregroundOnly) {
      // Tier 0: Far Fine Mist Streaks (45 drops)
      ctx.strokeStyle = isFlashing ? lTheme.boltMid : palette.skyHorizon || COLOR_RAIN_FAR;
      ctx.lineWidth = 0.75;
      ctx.globalAlpha = 0.28 + this.lightningAlpha * 0.22;
      ctx.beginPath();
      for (let i = 0; i < 45; i++) {
        const rx = this.rainX[i]!;
        const ry = this.rainY[i]!;
        const len = this.rainLength[i]!;
        const dx = (this.currentWindX * 0.65 * len) / this.rainSpeed[i]!;
        ctx.moveTo(rx, ry);
        ctx.lineTo(rx + dx, ry + len);
      }
      ctx.stroke();

      // Tier 1: Mid-Ground Crisp Rain Streaks (45 drops)
      ctx.strokeStyle = isFlashing ? lTheme.boltCore : COLOR_RAIN_MID;
      ctx.lineWidth = 1.0;
      ctx.globalAlpha = 0.48 + this.lightningAlpha * 0.26;
      ctx.beginPath();
      for (let i = 45; i < 90; i++) {
        const rx = this.rainX[i]!;
        const ry = this.rainY[i]!;
        const len = this.rainLength[i]!;
        const dx = (this.currentWindX * len) / this.rainSpeed[i]!;
        ctx.moveTo(rx, ry);
        ctx.lineTo(rx + dx, ry + len);
      }
      ctx.stroke();
      ctx.globalAlpha = 1;
    } else {
      // Tier 2: Near-Camera Specular Rain Streaks (30 fast drops over road & car)
      ctx.strokeStyle = isFlashing ? lTheme.boltCore : COLOR_RAIN_NEAR;
      ctx.lineWidth = 1.3;
      ctx.globalAlpha = 0.62 + this.lightningAlpha * 0.28;
      ctx.beginPath();
      for (let i = 90; i < RAIN_COUNT; i++) {
        const rx = this.rainX[i]!;
        const ry = this.rainY[i]!;
        const len = this.rainLength[i]!;
        const dx = (this.currentWindX * 1.35 * len) / this.rainSpeed[i]!;
        ctx.moveTo(rx, ry);
        ctx.lineTo(rx + dx, ry + len);
      }
      ctx.stroke();

      // Shimmering Wet Ground / Horizon Micro-Splashes & Ripples
      ctx.fillStyle = isFlashing ? lTheme.boltCore : COLOR_RAIN_NEAR;
      for (let s = 0; s < SPLASH_COUNT; s++) {
        const phase = this.splashPhase[s]!;
        const sx = Math.round(this.splashX[s]!);
        const sy = Math.round(this.splashY[s]!);
        const radius = Math.round(2 + phase * 6);
        const fade = (1 - phase) * 0.55;
        ctx.globalAlpha = fade;
        // Expanding horizontal ripple ring
        ctx.fillRect(sx - radius, sy, radius * 2, 1);
        if (phase < 0.38) {
          // Tiny crown droplets bouncing up on impact
          ctx.fillRect(sx - 2, sy - 2, 1, 2);
          ctx.fillRect(sx + 2, sy - 2, 1, 2);
        }
      }
      ctx.globalAlpha = 1;
    }
  }
}
