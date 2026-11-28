import { lerpHexColor, type SceneryTheme } from './palette';
import { getPropWorldHeightFromRegistry } from './PropRegistry';
import type { PropKind } from './RoadSegment';

// ---------------------------------------------------------------------------
// Biome Scenery Theme State (Fase 5, zero GC)
// ---------------------------------------------------------------------------
let activePropTheme: SceneryTheme | null = null;

export function setPropTheme(theme?: SceneryTheme | null): void {
  activePropTheme = theme ?? null;
}

export function getPropTheme(): SceneryTheme | null {
  return activePropTheme;
}

// ---------------------------------------------------------------------------
// Atmospheric Silhouette State (Depth & Atmosphere Overhaul Phase 2, zero GC)
// ---------------------------------------------------------------------------
export interface PropAtmosphere {
  fogColor: string;
  silhouetteColor: string;
  accentColor: string;
}

let activeAtmosphereFog = '#0a102b';
let activeAtmosphereSilhouette = '#070b20';
let activeAtmosphereAccent = '#056e68';
const propFogSilCache = new Map<string, readonly string[]>();
const propFogAccCache = new Map<string, readonly string[]>();
const detailBlendCache = new Map<string, Map<string, readonly string[]>>();

export function setPropAtmosphere(
  fogColor: string,
  silhouetteColor: string,
  accentColor: string,
): void {
  activeAtmosphereFog = fogColor;
  let cleared = false;
  if (activeAtmosphereSilhouette !== silhouetteColor) {
    activeAtmosphereSilhouette = silhouetteColor;
    propFogSilCache.clear();
    cleared = true;
  }
  if (activeAtmosphereAccent !== accentColor) {
    activeAtmosphereAccent = accentColor;
    propFogAccCache.clear();
    cleared = true;
  }
  if (cleared) {
    detailBlendCache.clear();
  }
}

export function getPropAtmosphere(): PropAtmosphere {
  return {
    fogColor: activeAtmosphereFog,
    silhouetteColor: activeAtmosphereSilhouette,
    accentColor: activeAtmosphereAccent,
  };
}

/** Returns conservative upper-bound prop height in world units (`pixels / ppu`). */
export function getPropWorldHeight(kind: PropKind): number {
  return getPropWorldHeightFromRegistry(kind);
}

const ATMOSPHERE_SILHOUETTE_ONLY = 0.72;
const ATMOSPHERE_COLOR_START = 0.15;

/** Zero-GC 5-step LUT lerp between base color and atmospheric silhouette/accent. */
function fogColor(baseHex: string, fogFactor: number, useAccent = false): string {
  if (fogFactor <= ATMOSPHERE_COLOR_START) return baseHex;
  const target = useAccent ? activeAtmosphereAccent : activeAtmosphereSilhouette;
  if (fogFactor >= ATMOSPHERE_SILHOUETTE_ONLY) return target;
  const cache = useAccent ? propFogAccCache : propFogSilCache;
  let steps = cache.get(baseHex);
  if (!steps) {
    steps = [
      baseHex,
      lerpHexColor(baseHex, target, 0.25),
      lerpHexColor(baseHex, target, 0.5),
      lerpHexColor(baseHex, target, 0.75),
      target,
    ];
    cache.set(baseHex, steps);
  }
  const t =
    (fogFactor - ATMOSPHERE_COLOR_START) / (ATMOSPHERE_SILHOUETTE_ONLY - ATMOSPHERE_COLOR_START);
  const band = Math.min(3, Math.max(1, Math.round(t * 4)));
  return steps[band]!;
}

/** Smoothstep LOD factor in `[0, 1]` as projected pixel size crosses `[startPx, fullPx]`. */
function detailFactor(sizePx: number, startPx: number, fullPx: number): number {
  if (sizePx <= startPx) return 0;
  if (sizePx >= fullPx) return 1;
  const t = (sizePx - startPx) / (fullPx - startPx);
  return t * t * (3 - 2 * t);
}

/**
 * Zero-GC 7-step LUT color blend from `baseHex` (t=0) to `detailHex` (t=1).
 * Uses nested Maps (`baseHex -> detailHex`) so warm lookups allocate zero strings per frame.
 */
function blendDetail(baseHex: string, detailHex: string, t: number): string {
  if (t <= 0.04 || baseHex === detailHex) return baseHex;
  if (t >= 0.96) return detailHex;
  if (!baseHex.startsWith('#') || !detailHex.startsWith('#')) {
    return t >= 0.5 ? detailHex : baseHex;
  }
  let inner = detailBlendCache.get(baseHex);
  if (!inner) {
    if (detailBlendCache.size >= 256) {
      const oldestKey = detailBlendCache.keys().next().value;
      if (oldestKey !== undefined) detailBlendCache.delete(oldestKey);
    }
    inner = new Map<string, readonly string[]>();
    detailBlendCache.set(baseHex, inner);
  }
  let steps = inner.get(detailHex);
  if (!steps) {
    steps = [
      baseHex,
      lerpHexColor(baseHex, detailHex, 1 / 6),
      lerpHexColor(baseHex, detailHex, 2 / 6),
      lerpHexColor(baseHex, detailHex, 3 / 6),
      lerpHexColor(baseHex, detailHex, 4 / 6),
      lerpHexColor(baseHex, detailHex, 5 / 6),
      detailHex,
    ];
    inner.set(detailHex, steps);
  }
  const band = Math.min(5, Math.max(1, Math.round(t * 6)));
  return steps[band]!;
}

// ---------------------------------------------------------------------------
// Static Color Palettes (AGENTS.md §4.3: ZERO GC allocations per frame)
// ---------------------------------------------------------------------------
const PALM_TRUNK = '#3a1d5c';
const PALM_TRUNK_LIGHT = '#6c34a3';
const PALM_LEAVES = ['#14f1d9', '#ff3cac', '#7b5cff'] as const;
const PALM_LEAF_SHADE = ['#08877a', '#a31564', '#43248a'] as const;

// Japanese City Street Tree (Ginkgo / Zelkova)
const STREET_TREE_PLANTER = '#231e33';
const STREET_TREE_PLANTER_RIM = '#42395c';
const STREET_TREE_GROUND_GLOW = 'rgba(255, 235, 150, 0.22)';
const STREET_TREE_TRUNK = '#2a1e38';
const STREET_TREE_TRUNK_LIGHT = '#4c3963';
const STREET_TREE_CROWN_BODY = ['#ffd166', '#06d6a0', '#ff3cac'] as const;
const STREET_TREE_CROWN_SHADE = ['#9e5f0d', '#085f52', '#6b0f44'] as const;
const STREET_TREE_CROWN_RIM = ['#fff3b0', '#bbf7d0', '#ffc2e2'] as const;

// Japanese Mountain Pine / Cedar (Kuromatsu / Touge Pine)
const PINE_TRUNK = '#1b1226';
const PINE_TRUNK_LIGHT = '#38284d';
const PINE_CROWN_BODY = ['#1e4d38', '#16384c', '#2d472c'] as const;
const PINE_CROWN_SHADE = ['#0a1f16', '#091824', '#0f2111'] as const;
const PINE_CROWN_RIM = ['#80ffdb', '#e0fbfc', '#ffd166'] as const;

const PINE_TIERS = [
  [0.42, 2300, 420, 0.25],
  [0.6, 1950, 390, -0.22],
  [0.76, 1500, 350, 0.15],
  [0.93, 1000, 320, 0.05],
] as const;

const LAMP_POLE = '#3d3358';
const LAMP_POLE_EDGE = '#6e5f94';
const LAMP_LIGHT = '#fff3b0';

const BILLBOARD_FACE = ['#ff2a6d', '#05d9e8', '#ffd319'] as const;
const BILLBOARD_FRAME = '#1a0f2b';
const BILLBOARD_EQ_HEIGHTS = [0.45, 0.8, 0.6, 0.9, 0.5] as const;

// Akiba Urban Canyon Facades & Neon Signs
const BUILDING_BODY = ['#0a0618', '#0e0922', '#080514'] as const;
const BUILDING_TRIM = ['#241542', '#311d57', '#1b1035'] as const;
const BUILDING_SIGN_BG = ['#ff0055', '#00f5d4', '#ffd166'] as const;
const BUILDING_SIGN_TEXT = ['#ffffff', '#080417', '#120224'] as const;
const BUILDING_AWNING = ['#ff2a85', '#00bbf9', '#ffbe0b'] as const;

// Japanese Vending Machine (Jihanki)
const JIHANKI_BODY = ['#f0f3f8', '#140e2b'] as const;
const JIHANKI_TRIM = ['#d90429', '#ff007f'] as const;

// Shuto Highway Overhead Gantry & VMS
const GANTRY_STEEL = '#26203a';
const GANTRY_STEEL_LIGHT = '#4a3e6b';
const GANTRY_SIGN_GREEN = '#005f3e';
const GANTRY_SIGN_BORDER = '#f8f9fa';

// Highway Overpass & Viaduct (Ponte A)
const OVERPASS_CONCRETE = '#3a344d';
const OVERPASS_CONCRETE_LIGHT = '#5c5478';
const OVERPASS_CONCRETE_DARK = '#1f1b2c';
const OVERPASS_SHADOW = 'rgba(10, 6, 20, 0.55)';
const OVERPASS_RAILING = '#7c739e';
const OVERPASS_SIGN_GREEN = '#005f3e';
const OVERPASS_HAZARD_YELLOW = '#ffd166';
const OVERPASS_HAZARD_DARK = '#1a1429';
const OVERPASS_LAMP_GLOW = '#ffe066';
const OVERPASS_STEEL_BLUE = '#262a40';
const OVERPASS_STEEL_TRUSS = '#3d4668';
const OVERPASS_NEON_CYAN = '#00f5d4';
const OVERPASS_NEON_PINK = '#ff007f';

const VMS_FRAME = '#160b29';
const VMS_LED_AMBER = '#ffaa00';
const VMS_LED_BRIGHT = '#ffe066';

// Curving Rhythm Chevrons
const CHEVRON_BG = '#090514';
const CHEVRON_MAGENTA = '#ff007f';
const CHEVRON_CYAN = '#00f5d4';

// Power Pylon & Shrub
const PYLON_STEEL = '#281e45';
const PYLON_STEEL_LIGHT = '#4a3b75';
const PYLON_BEACON = '#ff0055';

const SHRUB_BODY = ['#06d6a0', '#ff3cac', '#4cc9f0'] as const;
const SHRUB_SHADE = ['#063b36', '#4a0e4e', '#133c55'] as const;

// ---------------------------------------------------------------------------
// 1. PALM TREE (Synthwave & Sunset Coastal Highway)
// ---------------------------------------------------------------------------
function drawPalm(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  ppu: number,
  side: number,
  variant: number,
  fogFactor = 0,
): void {
  const h = 3400 * ppu;
  const lean = 420 * ppu * -side; // lean towards the road
  const trunkW = Math.max(1, 115 * ppu);
  const topX = x + lean;
  const topY = y - h;
  const isAtmospheric = fogFactor >= ATMOSPHERE_SILHOUETTE_ONLY;

  // Ground shadow pixel pad (near foreground only, suppressed in fog)
  if (ppu >= 0.018 && trunkW >= 2 && fogFactor < 0.55) {
    ctx.fillStyle = 'rgba(8, 2, 20, 0.55)';
    ctx.fillRect(Math.round(x - trunkW * 1.4), Math.round(y - 1), Math.round(trunkW * 2.8), Math.max(2, Math.round(trunkW * 0.45)));
  }

  const leaf = 1320 * ppu;
  const trunkColor = fogColor(PALM_TRUNK, fogFactor, false);
  const trunkBandColor = fogColor('#2c1447', fogFactor, false);
  const trunkLightColor = fogColor(PALM_TRUNK_LIGHT, fogFactor, false);
  const leafColor = fogColor(PALM_LEAVES[variant % PALM_LEAVES.length]!, fogFactor, true);
  const shadeColor = fogColor(PALM_LEAF_SHADE[variant % PALM_LEAF_SHADE.length]!, fogFactor, false);
  const cocoColor = isAtmospheric ? trunkColor : fogColor('#240b36', fogFactor, false);

  // Far LOD (leaf < 10): 2-segment curved trunk & splayed 4-frond silhouette matching full fan shape
  if (leaf < 10) {
    const midY = Math.round(y - h * 0.5);
    const midX = Math.round(x + lean * 0.25);
    ctx.fillStyle = trunkColor;
    ctx.fillRect(Math.round(x - trunkW * 0.5), midY, Math.max(1, Math.round(trunkW)), Math.max(2, Math.round(h * 0.5)));
    ctx.fillRect(Math.round(midX - trunkW * 0.4), Math.round(topY), Math.max(1, Math.round(trunkW * 0.85)), Math.max(2, Math.round(midY - topY)));
    const cw = Math.max(3, Math.round(leaf * 0.48));
    const ch = Math.max(2, Math.round(leaf * 0.28));
    ctx.fillStyle = shadeColor;
    ctx.fillRect(Math.round(topX - leaf * 0.9), Math.round(topY + leaf * 0.08), cw, ch);
    ctx.fillRect(Math.round(topX + leaf * 0.9 - cw), Math.round(topY + leaf * 0.08), cw, ch);
    ctx.fillStyle = leafColor;
    ctx.fillRect(Math.round(topX - leaf * 0.52), Math.round(topY - ch * 0.65), cw, ch);
    ctx.fillRect(Math.round(topX + leaf * 0.52 - cw), Math.round(topY - ch * 0.65), cw, ch);
    ctx.fillRect(Math.round(topX - cw * 0.5), Math.round(topY - ch * 0.9), cw, ch);
    return;
  }

  // Continuous tapered curved trunk with progressive ring/frond emergence (no abrupt LOD jumps)
  const tNear = detailFactor(leaf, 18, 34);
  const tSecFrond = detailFactor(leaf, 10, 22);
  const rings = leaf >= 28 ? (trunkW >= 5 ? 6 : 4) : leaf >= 16 ? 3 : 2;
  const bandCol = blendDetail(trunkColor, trunkBandColor, tNear);
  const hiCol = blendDetail(trunkColor, trunkLightColor, tNear);

  for (let r = 0; r < rings; r++) {
    const t0 = r / rings;
    const t1 = (r + 1) / rings;
    const x0 = x + lean * (t0 * t0);
    const y0 = y - h * t0;
    const w0 = Math.max(1, trunkW * (1.15 - t0 * 0.42));

    const x1 = x + lean * (t1 * t1);
    const y1 = y - h * t1;
    const w1 = Math.max(1, trunkW * (1.15 - t1 * 0.42));

    // Outer trunk segment
    ctx.fillStyle = isAtmospheric ? trunkColor : r % 2 === 0 ? trunkColor : bandCol;
    ctx.beginPath();
    ctx.moveTo(x0 - w0 * 0.5, y0);
    ctx.lineTo(x1 - w1 * 0.5, y1);
    ctx.lineTo(x1 + w1 * 0.5, y1);
    ctx.lineTo(x0 + w0 * 0.5, y0);
    ctx.closePath();
    ctx.fill();

    // Highlight ridge along inner or outer curve (progressive)
    if (tNear > 0.04 && !isAtmospheric && (w0 >= 3.5 || w1 >= 3.5)) {
      ctx.fillStyle = hiCol;
      const hiW0 = Math.max(1, w0 * 0.32);
      const hiW1 = Math.max(1, w1 * 0.32);
      const hiX0 = side < 0 ? x0 + w0 * 0.15 : x0 - w0 * 0.47;
      const hiX1 = side < 0 ? x1 + w1 * 0.15 : x1 - w1 * 0.47;
      ctx.beginPath();
      ctx.moveTo(hiX0, y0);
      ctx.lineTo(hiX1, y1);
      ctx.lineTo(hiX1 + hiW1, y1);
      ctx.lineTo(hiX0 + hiW0, y0);
      ctx.closePath();
      ctx.fill();
    }
  }

  // Pixel-art palm crown & fronds
  if (tNear > 0.04 && trunkW >= 3) {
    const cocoR = Math.max(2, Math.round(trunkW * 0.55));
    ctx.fillStyle = blendDetail(trunkColor, cocoColor, tNear);
    ctx.fillRect(Math.round(topX - cocoR), Math.round(topY - cocoR * 0.4), cocoR * 2, cocoR);
  }

  const fronds = 6;
  const steps = leaf >= 24 ? 3 : 2;
  for (let i = 0; i < fronds; i++) {
    // Alternate intermediate fronds fade in continuously from far 3-4 fronds to full 6-frond fan
    const isSecondary = i === 1 || i === 4;
    if (isSecondary && tSecFrond <= 0.04) continue;
    const fShade = isSecondary ? blendDetail(trunkColor, shadeColor, tSecFrond) : shadeColor;
    const fLeaf = isSecondary ? blendDetail(shadeColor, leafColor, tSecFrond) : leafColor;

    const a = -Math.PI + (i / (fronds - 1)) * Math.PI;
    const cosA = Math.cos(a);
    const sinA = Math.sin(a);
    const tipX = topX + cosA * leaf;
    const tipY = topY + sinA * leaf * 0.45 + leaf * 0.35;
    const midX = topX + cosA * leaf * 0.5;
    const midY = topY + sinA * leaf * 0.5 - leaf * 0.2;

    for (let s = 0; s < steps; s++) {
      const u = s / Math.max(1, steps - 1);
      const inv = 1 - u;
      const px = Math.round(inv * inv * topX + 2 * inv * u * midX + u * u * tipX);
      const py = Math.round(inv * inv * topY + 2 * inv * u * midY + u * u * tipY);
      const blockW = Math.max(2, Math.round(leaf * (0.24 - u * 0.11)));
      const blockH = Math.max(2, Math.round(leaf * (0.13 + u * 0.06)));
      const bx = px - (blockW >> 1);
      ctx.fillStyle = fShade;
      ctx.fillRect(bx, py + 1, blockW, blockH);
      ctx.fillStyle = fLeaf;
      ctx.fillRect(bx, py - 1, blockW, Math.max(1, blockH - 1));
    }
  }
}

// ---------------------------------------------------------------------------
// 1b. JAPANESE CITY STREET TREE (Ginkgo / Zelkova with Sidewalk Planter & Street Glow)
// ---------------------------------------------------------------------------
export function drawStreetTree(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  ppu: number,
  side: number,
  variant: number,
  fogFactor = 0,
): void {
  if (ppu <= 0 || !Number.isFinite(ppu)) return;

  const h = 2800 * ppu;
  const ry = Math.round(y);
  const v = Math.abs(Math.floor(variant)) % STREET_TREE_CROWN_BODY.length;
  const trunkCol = fogColor(STREET_TREE_TRUNK, fogFactor, false);
  const trunkLightCol = fogColor(STREET_TREE_TRUNK_LIGHT, fogFactor, false);
  const crownBody = fogColor(STREET_TREE_CROWN_BODY[v]!, fogFactor, true);
  const crownShade = fogColor(STREET_TREE_CROWN_SHADE[v]!, fogFactor, false);
  const crownRim = fogColor(STREET_TREE_CROWN_RIM[v]!, fogFactor, true);
  const planterCol = fogColor(STREET_TREE_PLANTER, fogFactor, false);
  const planterRimCol = fogColor(STREET_TREE_PLANTER_RIM, fogFactor, false);

  const tPlanter = detailFactor(h, 24, 46);
  const tLobes = detailFactor(h, 28, 52);
  const tRim = detailFactor(h, 36, 54);
  const tNear = detailFactor(h, 58, 82);

  // 1. Sidewalk Planter Curb & Ground Light Ring (unified base height across all distances)
  const planterW = Math.max(4, Math.round(540 * ppu));
  const planterH = Math.max(2, Math.round(70 * ppu));
  const planterLeft = Math.round(x - planterW * 0.5);
  const planterTop = ry - planterH;

  if (ppu >= 0.018 && tNear > 0.04) {
    const glowW = Math.round(planterW * 1.7);
    ctx.fillStyle = STREET_TREE_GROUND_GLOW;
    ctx.fillRect(
      Math.round(x - glowW * 0.5),
      ry - 1,
      glowW,
      Math.max(2, Math.round(planterH * 0.8)),
    );
  }

  if (tPlanter > 0.04) {
    ctx.fillStyle = blendDetail(trunkCol, planterCol, tPlanter);
    ctx.fillRect(planterLeft, planterTop, planterW, planterH);
    ctx.fillStyle = blendDetail(trunkCol, planterRimCol, tPlanter);
    ctx.fillRect(planterLeft, planterTop, planterW, 1);

    if (tNear > 0.04 && planterW >= 8) {
      const grateW = Math.round(planterW * 0.75);
      ctx.fillStyle = blendDetail(planterCol, fogColor('#110b1a', fogFactor, false), tNear);
      ctx.fillRect(Math.round(x - grateW * 0.5), planterTop + 1, grateW, Math.max(1, planterH - 1));
    }
  }

  // 2. Trunk & Branch Forks (consistent position across distances)
  const trunkW = Math.max(1, Math.round(110 * ppu));
  const trunkH = Math.max(4, Math.round(h * 0.42));
  const trunkX = Math.round(x - trunkW * 0.5);
  const trunkBaseY = tPlanter > 0.04 ? planterTop : ry;
  const trunkY = trunkBaseY - trunkH;

  ctx.fillStyle = trunkCol;
  ctx.fillRect(trunkX, trunkY, trunkW, trunkH);

  if (tNear > 0.04 && trunkW >= 3) {
    ctx.fillStyle = blendDetail(trunkCol, trunkLightCol, tNear);
    const hiW = Math.max(1, Math.round(trunkW * 0.35));
    const hiX = side < 0 ? trunkX + trunkW - hiW : trunkX;
    ctx.fillRect(hiX, trunkY, hiW, trunkH);
  }

  if (tNear > 0.04 && trunkW >= 4) {
    ctx.fillStyle = trunkCol;
    const bW = Math.max(2, Math.round(trunkW * 0.6));
    const bH = Math.max(2, Math.round(trunkW * 0.8));
    ctx.fillRect(Math.round(x - trunkW * 1.2), trunkY - bH + 1, bW, bH);
    ctx.fillRect(Math.round(x + trunkW * 0.6), trunkY - bH + 1, bW, bH);
  }

  // 3. Rounded Crown (coherent silhouette from far to near; lobes & rim emerge continuously)
  const crownW = Math.max(4, Math.round(2200 * ppu));
  const crownH = Math.max(4, Math.round(1800 * ppu));
  const crownTop = ry - Math.round(h);
  const crownLeft = Math.round(x - crownW * 0.5);

  // Underside shadow core (always present)
  ctx.fillStyle = crownShade;
  ctx.fillRect(
    Math.round(crownLeft + crownW * 0.08),
    Math.round(crownTop + crownH * 0.45),
    Math.max(2, Math.round(crownW * 0.84)),
    Math.max(2, Math.round(crownH * 0.55)),
  );

  // Side shadow lobes (fade out smoothly at long range)
  if (tLobes > 0.04) {
    ctx.fillStyle = blendDetail(crownBody, crownShade, tLobes);
    ctx.fillRect(
      crownLeft,
      Math.round(crownTop + crownH * 0.35),
      Math.max(1, Math.round(crownW * 0.35)),
      Math.max(1, Math.round(crownH * 0.45)),
    );
    ctx.fillRect(
      Math.round(crownLeft + crownW * 0.65),
      Math.round(crownTop + crownH * 0.35),
      Math.max(1, Math.round(crownW * 0.35)),
      Math.max(1, Math.round(crownH * 0.45)),
    );
  }

  // Main central dome (always present)
  ctx.fillStyle = crownBody;
  ctx.fillRect(
    Math.round(crownLeft + crownW * 0.14),
    crownTop,
    Math.max(2, Math.round(crownW * 0.72)),
    Math.max(2, Math.round(crownH * 0.7)),
  );

  // Shoulder domes & upper crest (progressive emergence)
  if (tLobes > 0.04) {
    ctx.fillStyle = blendDetail(crownShade, crownBody, tLobes);
    ctx.fillRect(
      crownLeft,
      Math.round(crownTop + crownH * 0.2),
      Math.max(1, Math.round(crownW * 0.4)),
      Math.max(1, Math.round(crownH * 0.45)),
    );
    ctx.fillRect(
      Math.round(crownLeft + crownW * 0.6),
      Math.round(crownTop + crownH * 0.2),
      Math.max(1, Math.round(crownW * 0.4)),
      Math.max(1, Math.round(crownH * 0.45)),
    );
    ctx.fillRect(
      Math.round(crownLeft + crownW * 0.28),
      crownTop - Math.max(1, Math.round(crownH * 0.08)),
      Math.max(2, Math.round(crownW * 0.44)),
      Math.max(1, Math.round(crownH * 0.3)),
    );
  }

  // Top highlight rims catching streetlamp glow (progressive)
  if (tRim > 0.04) {
    ctx.fillStyle = blendDetail(crownBody, crownRim, tRim);
    ctx.fillRect(
      Math.round(crownLeft + crownW * 0.32),
      crownTop - Math.max(1, Math.round(crownH * 0.08)),
      Math.max(2, Math.round(crownW * 0.36)),
      Math.max(1, Math.round(2 * ppu)),
    );
    if (tNear > 0.04) {
      ctx.fillStyle = blendDetail(crownBody, crownRim, tNear);
      ctx.fillRect(
        Math.round(crownLeft + crownW * 0.08),
        Math.round(crownTop + crownH * 0.2),
        Math.max(1, Math.round(crownW * 0.22)),
        1,
      );
      ctx.fillRect(
        Math.round(crownLeft + crownW * 0.7),
        Math.round(crownTop + crownH * 0.2),
        Math.max(1, Math.round(crownW * 0.22)),
        1,
      );
    }
  }
}

// ---------------------------------------------------------------------------
// 1c. JAPANESE MOUNTAIN PINE / CEDAR (Kuromatsu with Tiered Cloud Pads & Moonlight Rim)
// ---------------------------------------------------------------------------
export function drawPine(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  ppu: number,
  side: number,
  variant: number,
  fogFactor = 0,
): void {
  if (ppu <= 0 || !Number.isFinite(ppu)) return;

  const h = 3200 * ppu;
  const ry = Math.round(y);
  const v = Math.abs(Math.floor(variant)) % PINE_CROWN_BODY.length;
  const trunkCol = fogColor(PINE_TRUNK, fogFactor, false);
  const trunkLightCol = fogColor(PINE_TRUNK_LIGHT, fogFactor, false);
  const pineBody = fogColor(PINE_CROWN_BODY[v]!, fogFactor, true);
  const pineShade = fogColor(PINE_CROWN_SHADE[v]!, fogFactor, false);
  const pineRim = fogColor(PINE_CROWN_RIM[v]!, fogFactor, true);

  const tRim = detailFactor(h, 24, 54);
  const tTufts = detailFactor(h, 54, 82);

  // Consistent lean direction & tiered pad layout across all distances (no shape snap)
  const leanDir = variant % 2 === 0 ? (side < 0 ? 1 : -1) : (side < 0 ? -1 : 1);
  const lean = 320 * ppu * leanDir;
  const trunkW = Math.max(1, Math.round(115 * ppu));

  // 1. Root flare base & rocky ground shadow (near foreground only)
  if (ppu >= 0.018) {
    const rootW = Math.max(3, Math.round(280 * ppu));
    ctx.fillStyle = 'rgba(8, 3, 18, 0.55)';
    ctx.fillRect(
      Math.round(x - rootW * 0.7),
      ry - 1,
      Math.round(rootW * 1.4),
      Math.max(1, Math.round(rootW * 0.22)),
    );
  }

  // 2. Gnarled / Curving Pine Trunk
  if (h < 32) {
    ctx.fillStyle = trunkCol;
    ctx.fillRect(
      Math.round(x + lean * 0.3 - trunkW * 0.5),
      Math.round(ry - h * 0.72),
      trunkW,
      Math.max(2, Math.round(h * 0.72)),
    );
  } else {
    const segs = 3;
    for (let s = 0; s < segs; s++) {
      const t0 = s / segs;
      const t1 = (s + 1) / segs;
      const x0 = x + lean * t0 * 0.6;
      const y0 = ry - h * 0.75 * t0;
      const x1 = x + lean * t1 * 0.6;
      const y1 = ry - h * 0.75 * t1;
      const w = Math.max(1, trunkW * (1.1 - t0 * 0.35));

      ctx.fillStyle = trunkCol;
      ctx.beginPath();
      ctx.moveTo(x0 - w * 0.5, y0);
      ctx.lineTo(x1 - w * 0.5, y1);
      ctx.lineTo(x1 + w * 0.5, y1);
      ctx.lineTo(x0 + w * 0.5, y0);
      ctx.closePath();
      ctx.fill();

      if (tTufts > 0.04 && w >= 3) {
        ctx.fillStyle = blendDetail(trunkCol, trunkLightCol, tTufts);
        const hw = Math.max(1, Math.round(w * 0.3));
        ctx.fillRect(
          side < 0 ? Math.round(x0 + w * 0.2) : Math.round(x0 - w * 0.5),
          Math.round(y1),
          hw,
          Math.max(1, Math.round(y0 - y1 + 1)),
        );
      }
    }
  }

  // 3. 4 Tiered Horizontal Cloud Pads (consistent layout at all distances)
  for (let i = 0; i < PINE_TIERS.length; i++) {
    const tier = PINE_TIERS[i]!;
    const relY = tier[0];
    const spanW = tier[1];
    const spanH = tier[2];
    const xShift = tier[3] * leanDir;

    const padW = Math.max(2, Math.round(spanW * ppu));
    const padH = Math.max(2, Math.round(spanH * ppu));
    const padX = Math.round(x + lean * relY * 0.6 + padW * xShift);
    const padY = Math.round(ry - h * relY);
    const padLeft = Math.round(padX - padW * 0.5);

    ctx.fillStyle = pineShade;
    ctx.fillRect(
      padLeft,
      Math.round(padY - padH * 0.35),
      padW,
      Math.max(1, Math.round(padH * 0.65)),
    );

    ctx.fillStyle = pineBody;
    const bodyInsetX = padW >= 6 ? Math.max(1, Math.round(padW * 0.06)) : 0;
    ctx.fillRect(
      padLeft + bodyInsetX,
      Math.round(padY - padH * 0.85),
      Math.max(1, padW - bodyInsetX * 2),
      Math.max(1, Math.round(padH * 0.65)),
    );

    if (tTufts > 0.04 && padW >= 16) {
      ctx.fillStyle = blendDetail(pineShade, pineBody, tTufts);
      const tuftW = Math.max(2, Math.round(padW * 0.12));
      const tuftH = Math.max(1, Math.round(padH * 0.3));
      ctx.fillRect(padLeft, Math.round(padY - padH * 0.5), tuftW, tuftH);
      ctx.fillRect(padLeft + padW - tuftW, Math.round(padY - padH * 0.5), tuftW, tuftH);
    }

    if (tRim > 0.04) {
      ctx.fillStyle = blendDetail(pineBody, pineRim, tRim);
      const rimW = Math.max(2, Math.round(padW * 0.65));
      ctx.fillRect(
        Math.round(padX - rimW * 0.5),
        Math.round(padY - padH * 0.85),
        rimW,
        Math.max(1, Math.round(2 * ppu)),
      );
    }
  }
}

// ---------------------------------------------------------------------------
// 2. STREET LAMP (Highway Overpass & Urban Expressway)
// ---------------------------------------------------------------------------
function drawLamp(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  ppu: number,
  side: number,
  fogFactor = 0,
): void {
  const h = 2800 * ppu;
  const arm = 720 * ppu * -side;
  const w = Math.max(1, Math.round(72 * ppu));
  const rx = Math.round(x);
  const ry = Math.round(y);
  const topY = Math.round(y - h);
  const poleCol = fogColor(LAMP_POLE, fogFactor, false);
  const lightCol = fogColor(LAMP_LIGHT, fogFactor, true);

  // Far LOD (h < 22, e.g. ppu = 0.006 -> h = 16.8): compact <= 4 rect silhouette
  if (h < 22) {
    ctx.fillStyle = poleCol;
    ctx.fillRect(rx, topY, 1, Math.max(2, Math.round(h)));
    const armStartX = Math.round(Math.min(rx, rx + arm));
    ctx.fillRect(armStartX, topY, Math.max(2, Math.round(Math.abs(arm))), 1);
    ctx.fillStyle = lightCol;
    ctx.fillRect(Math.round(rx + arm - 1), topY + 1, 3, 1);
    return;
  }

  const tMid = detailFactor(h, 22, 48);
  const tNear = detailFactor(h, 48, 76);

  // Base steel plinth (emerges smoothly)
  if (w >= 2 && tMid > 0.04) {
    const baseW = w * 2.2;
    const baseH = Math.max(2, Math.round(h * 0.1));
    ctx.fillStyle = blendDetail(poleCol, fogColor('#241138', fogFactor, false), tMid);
    ctx.fillRect(Math.round(rx - baseW * 0.5), ry - baseH, Math.round(baseW), baseH);
  }

  // Vertical pole + neon rim highlight
  ctx.fillStyle = poleCol;
  ctx.fillRect(Math.round(rx - w * 0.5), topY, w, Math.round(h));
  if (w >= 2 && tMid > 0.04) {
    ctx.fillStyle = blendDetail(poleCol, fogColor(LAMP_POLE_EDGE, fogFactor, true), tMid);
    ctx.fillRect(side < 0 ? rx : Math.round(rx - w * 0.5), topY, 1, Math.round(h));
  }

  // Horizontal cantilever arm
  const armStartX = Math.round(Math.min(rx, rx + arm));
  const armW = Math.max(2, Math.round(Math.abs(arm)));
  ctx.fillStyle = poleCol;
  ctx.fillRect(armStartX, topY, armW, w);

  const lw = Math.max(2, Math.round(280 * ppu));
  const lh = Math.max(1, Math.round(75 * ppu));
  const lampX = Math.round(rx + arm - lw * 0.5);
  const lampY = topY + w;

  // Near details: diagonal support strut & soft neon glow halos
  if (tNear > 0.04 && ppu >= 0.016) {
    if (w >= 2) {
      ctx.fillStyle = poleCol;
      ctx.fillRect(
        Math.round(rx + arm * 0.28),
        topY + w,
        Math.max(1, Math.round(Math.abs(arm) * 0.25)),
        w,
      );
    }
    if (lw >= 5 && tNear > 0.45 && fogFactor < 0.55) {
      ctx.fillStyle = 'rgba(255, 243, 176, 0.22)';
      ctx.fillRect(lampX - Math.round(lw * 0.45), lampY - lh, Math.round(lw * 1.9), lh * 4);
      ctx.fillStyle = 'rgba(5, 217, 232, 0.25)';
      ctx.fillRect(lampX - Math.round(lw * 0.2), lampY, Math.round(lw * 1.4), lh * 2);
    }
  }

  ctx.fillStyle = lightCol;
  ctx.fillRect(lampX, lampY, lw, lh);
}

// ---------------------------------------------------------------------------
// 3. RETRO BILLBOARD (Future Funk Advertisements)
// ---------------------------------------------------------------------------
function drawBillboard(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  ppu: number,
  variant: number,
  fogFactor = 0,
): void {
  const w = Math.max(4, Math.round(2600 * ppu));
  const h = Math.max(3, Math.round(1300 * ppu));
  const legH = Math.max(2, Math.round(1100 * ppu));
  const legW = Math.max(1, Math.round(95 * ppu));
  const rx = Math.round(x);
  const ry = Math.round(y);
  const top = ry - legH - h;
  const left = Math.round(rx - w * 0.5);
  const isAtmospheric = fogFactor >= ATMOSPHERE_SILHOUETTE_ONLY;
  const frameCol = fogColor(BILLBOARD_FRAME, fogFactor, false);
  const v = variant % BILLBOARD_FACE.length;
  const faceCol = fogColor(BILLBOARD_FACE[v]!, fogFactor, true);

  const leftLegX = Math.round(rx - w * 0.3 - legW * 0.5);
  const rightLegX = Math.round(rx + w * 0.3 - legW * 0.5);
  ctx.fillStyle = frameCol;
  ctx.fillRect(leftLegX, ry - legH, legW, legH);
  ctx.fillRect(rightLegX, ry - legH, legW, legH);

  const tBrace = detailFactor(w, 16, 30);
  if (tBrace > 0.04 && legH >= 4) {
    ctx.fillStyle = blendDetail(frameCol, fogColor('#3d3358', fogFactor, false), tBrace);
    ctx.fillRect(leftLegX, Math.round(ry - legH * 0.55), rightLegX - leftLegX + legW, Math.max(1, Math.round(legW * 0.45)));
  }

  ctx.fillStyle = frameCol;
  ctx.fillRect(left, top, w, h);

  const pad = Math.max(1, Math.round(80 * ppu));
  const innerX = left + pad;
  const innerY = top + pad;
  const innerW = Math.max(2, w - pad * 2);
  const innerH = Math.max(2, h - pad * 2);

  ctx.fillStyle = faceCol;
  ctx.fillRect(innerX, innerY, innerW, innerH);

  const tArt = detailFactor(w, 24, 42);
  if (tArt <= 0.04) return;

  if (isAtmospheric) {
    ctx.fillStyle = blendDetail(faceCol, frameCol, tArt);
    const bandH = Math.max(1, Math.round(innerH * 0.14));
    ctx.fillRect(innerX + 2, innerY + Math.round(innerH * 0.3), Math.max(2, Math.round(innerW * 0.6)), bandH);
    ctx.fillRect(innerX + 2, innerY + Math.round(innerH * 0.62), Math.max(2, Math.round(innerW * 0.4)), bandH);
    return;
  }

  // Progressive floodlights & catwalk
  ctx.fillStyle = blendDetail(frameCol, fogColor('#fff3b0', fogFactor, true), tArt);
  ctx.fillRect(Math.round(rx - w * 0.28), top - Math.max(1, Math.round(legW * 0.5)), Math.max(2, legW), Math.max(1, Math.round(legW * 0.5)));
  ctx.fillRect(Math.round(rx + w * 0.22), top - Math.max(1, Math.round(legW * 0.5)), Math.max(2, legW), Math.max(1, Math.round(legW * 0.5)));
  ctx.fillStyle = blendDetail(frameCol, fogColor('#3a1d5c', fogFactor, false), tArt);
  ctx.fillRect(left - 1, top + h, w + 2, Math.max(1, Math.round(legW * 0.5)));

  const artFrameCol = blendDetail(faceCol, frameCol, tArt);
  if (innerW >= 12 && innerH >= 6) {
    if (v === 0) {
      // Melon Soda Cup
      const cupW = Math.max(3, Math.round(innerW * 0.22));
      const cupH = Math.max(4, Math.round(innerH * 0.72));
      const cupX = innerX + Math.round(innerW * 0.1);
      const cupY = innerY + Math.round((innerH - cupH) * 0.5);
      ctx.fillStyle = blendDetail(faceCol, fogColor('#00f59b', fogFactor, true), tArt);
      ctx.fillRect(cupX, cupY, cupW, cupH);
      ctx.fillStyle = blendDetail(faceCol, fogColor('#fff6d6', fogFactor, true), tArt);
      ctx.fillRect(cupX, cupY, cupW, Math.max(1, Math.round(cupH * 0.28)));
      ctx.fillStyle = artFrameCol;
      for (let i = 1; i <= 3; i++) {
        const sh = Math.max(1, Math.round(innerH * 0.08 * i));
        ctx.fillRect(
          cupX + cupW + Math.round(innerW * 0.08),
          innerY + Math.round(innerH * (0.28 + i * 0.17)),
          Math.round(innerW * 0.5),
          sh,
        );
      }
    } else if (v === 1) {
      // Cassette EQ Bars
      ctx.fillStyle = artFrameCol;
      const barCount = 5;
      const barW = Math.max(1, Math.floor((innerW * 0.7) / barCount) - 1);
      for (let b = 0; b < barCount; b++) {
        const bh = Math.max(2, Math.round(innerH * BILLBOARD_EQ_HEIGHTS[b]!));
        const bx = innerX + Math.round(innerW * 0.15) + b * (barW + Math.max(1, Math.round(barW * 0.35)));
        ctx.fillRect(bx, innerY + innerH - bh, barW, bh);
      }
    } else {
      // Wangan Turbo Sun
      const sunS = Math.max(3, Math.round(innerH * 0.65));
      ctx.fillStyle = blendDetail(faceCol, fogColor('#ff2a6d', fogFactor, true), tArt);
      ctx.fillRect(innerX + Math.round(innerW * 0.12), innerY + Math.round((innerH - sunS) * 0.5), sunS, sunS);
      ctx.fillStyle = artFrameCol;
      for (let i = 1; i <= 3; i++) {
        const sh = Math.max(1, Math.round(innerH * 0.07 * i));
        ctx.fillRect(innerX, innerY + Math.round(innerH * (0.35 + i * 0.15)), innerW, sh);
      }
    }
  } else {
    ctx.fillStyle = artFrameCol;
    for (let i = 1; i <= 3; i++) {
      const sh = Math.max(1, innerH * 0.06 * i);
      ctx.fillRect(innerX, innerY + innerH * (0.35 + i * 0.15), innerW, sh);
    }
  }
}

// ---------------------------------------------------------------------------
// 4. AKIBA URBAN CANYON FACADE & VERTICAL NEON SIGNS (3 Distinct Architectures)
// ---------------------------------------------------------------------------
function drawBuilding(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  ppu: number,
  side: number,
  variant: number,
  fogFactor = 0,
): void {
  const rx = Math.round(x);
  const ry = Math.round(y);
  const archVariant = variant % 3;
  const isAtmospheric = fogFactor >= ATMOSPHERE_SILHOUETTE_ONLY;

  if (archVariant === 0) {
    // =========================================================================
    // ARCHITECTURE 1: Akiba Megamart & Arcade with Vertical Neon Blade Sign
    // =========================================================================
    const w = Math.max(6, Math.round(3400 * ppu));
    const h = Math.max(14, Math.round(7600 * ppu));
    const topY = ry - h;
    const left = side < 0 ? rx - w : rx;
    const v = variant % BUILDING_BODY.length;

    const facadeCol = fogColor(BUILDING_BODY[v]!, fogFactor, false);
    const trimCol = fogColor(BUILDING_TRIM[v]!, fogFactor, false);
    const bladeBg = fogColor(BUILDING_SIGN_BG[v]!, fogFactor, true);
    const winColorA = fogColor('#ffeaa7', fogFactor, true);
    const winColorB = fogColor('#00f5d4', fogFactor, true);

    // Main Facade Tower
    ctx.fillStyle = facadeCol;
    ctx.fillRect(left, topY, w, h);

    // Structural edge / pillar on road side + roof parapet
    ctx.fillStyle = trimCol;
    const trimW = Math.max(1, Math.round(w * 0.08));
    ctx.fillRect(side < 0 ? left + w - trimW : left, topY, trimW, h);
    const roofH = Math.max(2, Math.round(h * 0.06));
    ctx.fillRect(left, topY, w, roofH);

    // Road-corner Vertical Neon Blade Sign (consistent position from far to near)
    const signW = Math.max(2, Math.round(w * 0.18));
    const signH = Math.max(4, Math.round(h * 0.44));
    const signY = topY + Math.round(h * 0.16);
    const signX = side < 0 ? left + w - signW : left;
    ctx.fillStyle = bladeBg;
    ctx.fillRect(signX, signY, signW, signH);

    const tWin = detailFactor(h, 48, 88);
    if (tWin <= 0.04) return;

    const usableW = Math.max(4, w - trimW);
    const facadeLeft = side < 0 ? left : left + trimW;
    const shopH = Math.max(5, Math.round(h * 0.22));
    const shopY = ry - shopH;
    const upperH = shopY - (topY + roofH);
    const floors = 5;
    const floorStep = upperH / floors;

    const tCols = isAtmospheric ? 0 : detailFactor(h, 96, 134);
    const tShop = detailFactor(h, 64, 104);
    const tFine = isAtmospheric ? 0 : detailFactor(h, 114, 150);

    // Upper floor windows: continuous floor bands at mid-range, smoothly splitting into columns near-up
    const winBlendA = blendDetail(facadeCol, winColorA, tWin);
    const winBlendB = blendDetail(facadeCol, winColorB, tWin);
    if (tCols <= 0.04) {
      const stripLeft = facadeLeft + 2;
      const stripW = Math.max(2, usableW - 4);
      for (let f = 0; f < floors; f++) {
        const wy = Math.round(topY + roofH + f * floorStep + floorStep * 0.18);
        const winH = Math.max(1, Math.round(floorStep * 0.48));
        if (wy + winH >= shopY) break;
        ctx.fillStyle = f % 2 === 0 ? winBlendA : winBlendB;
        ctx.fillRect(stripLeft, wy, stripW, winH);
      }
    } else {
      const cols = 3;
      const winW = Math.max(2, Math.round(usableW * 0.18));
      const margin = Math.max(2, Math.round(usableW * 0.06));
      const colStep = (usableW - margin * 2 - winW) / (cols - 1);
      const gapBridgeA = blendDetail(winBlendA, facadeCol, tCols);
      const gapBridgeB = blendDetail(winBlendB, facadeCol, tCols);
      if (tCols < 0.96) {
        const stripLeft = facadeLeft + 2;
        const stripW = Math.max(2, usableW - 4);
        for (let f = 0; f < floors; f++) {
          const wy = Math.round(topY + roofH + f * floorStep + floorStep * 0.18);
          const winH = Math.max(2, Math.round(floorStep * 0.48));
          if (wy + winH >= shopY) break;
          ctx.fillStyle = f % 2 === 0 ? gapBridgeA : gapBridgeB;
          ctx.fillRect(stripLeft, wy, stripW, winH);
        }
      }
      for (let f = 0; f < floors; f++) {
        const wy = Math.round(topY + roofH + f * floorStep + floorStep * 0.18);
        const winH = Math.max(2, Math.round(floorStep * 0.55));
        if (wy + winH >= shopY) break;
        for (let c = 0; c < cols; c++) {
          const isLit = (c * 7 + f * 13 + variant) % 3 !== 0;
          if (isLit) {
            const wx = Math.round(facadeLeft + margin + c * colStep);
            ctx.fillStyle = (c + f) % 2 === 0 ? winBlendA : winBlendB;
            ctx.fillRect(wx, wy, winW, winH);
          }
        }
      }
    }

    // Ground Floor Shopfront / Awning (progressive)
    if (tShop > 0.04) {
      const awnH = Math.max(2, Math.round(shopH * 0.28));
      ctx.fillStyle = blendDetail(facadeCol, fogColor('#05030a', fogFactor, false), tShop);
      ctx.fillRect(left, shopY, w, shopH);
      ctx.fillStyle = blendDetail(facadeCol, fogColor(BUILDING_AWNING[v]!, fogFactor, true), tShop);
      ctx.fillRect(left, shopY, w, awnH);

      const shopMargin = Math.max(1, Math.round(usableW * 0.04));
      const shopWindowW = Math.max(4, usableW - shopMargin * 2);
      const shopWindowH = Math.max(2, shopH - awnH - 2);
      ctx.fillStyle = blendDetail(facadeCol, fogColor('#fff4cc', fogFactor, true), tShop);
      ctx.fillRect(facadeLeft + shopMargin, shopY + awnH + 1, shopWindowW, shopWindowH);
    }

    // Fine Near Details: Kanji blade sign glyphs + rooftop antenna & beacon
    if (tFine > 0.04) {
      if (signW >= 5 && signH >= 16) {
        ctx.fillStyle = blendDetail(bladeBg, fogColor(BUILDING_SIGN_TEXT[v]!, fogFactor, true), tFine);
        const charCount = Math.min(5, Math.floor(signH / (signW * 1.3)));
        const charH = Math.max(2, Math.round(signW * 0.9));
        for (let ch = 0; ch < charCount; ch++) {
          const cy = signY + Math.round(signW * 0.3) + ch * Math.round(signW * 1.3);
          ctx.fillRect(signX + 1, cy, signW - 2, Math.max(1, Math.round(charH * 0.35)));
          ctx.fillRect(signX + Math.floor(signW * 0.35), cy, Math.max(1, Math.round(signW * 0.3)), charH);
          ctx.fillRect(signX + 1, cy + charH - Math.max(1, Math.round(charH * 0.3)), signW - 2, Math.max(1, Math.round(charH * 0.3)));
        }
      }

      const antH = Math.max(3, Math.round(h * 0.18));
      const antX = side < 0 ? left + Math.round(w * 0.3) : left + Math.round(w * 0.7);
      ctx.fillStyle = blendDetail(facadeCol, fogColor('#1b1035', fogFactor, false), tFine);
      ctx.fillRect(antX, topY - antH, 1, antH);
      ctx.fillStyle = blendDetail(facadeCol, fogColor('#ff0055', fogFactor, true), tFine);
      ctx.fillRect(antX - 1, topY - antH - 1, 2, 2);
    }
  } else if (archVariant === 1) {
    // =========================================================================
    // ARCHITECTURE 2: Shinjuku Cyber-Glass Skyscraper (Torre Vetrata Futuristica)
    // =========================================================================
    const w = Math.max(6, Math.round(3100 * ppu));
    const h = Math.max(18, Math.round(9600 * ppu));
    const topY = ry - h;
    const left = side < 0 ? rx - w : rx;

    const crownH = Math.max(4, Math.round(h * 0.26));
    const setbackW = Math.max(1, Math.round(w * 0.15));
    const crownLeft = side < 0 ? left + setbackW : left;
    const crownW = w - setbackW;
    const glassBodyCol = fogColor('#070a18', fogFactor, false);
    const glassCyan = fogColor('#00f5d4', fogFactor, true);
    const glassBlue = fogColor('#3a86ff', fogFactor, true);
    const beaconRed = fogColor('#ff0055', fogFactor, true);

    // Main dark corporate tower + crown accent (3 rects at far distance: ppu=0.006 -> h=58)
    ctx.fillStyle = glassBodyCol;
    ctx.fillRect(left, topY + crownH, w, h - crownH);
    ctx.fillRect(crownLeft, topY, crownW, crownH);
    ctx.fillStyle = glassCyan;
    ctx.fillRect(crownLeft + Math.round(crownW * 0.2), topY + Math.round(crownH * 0.4), Math.max(2, Math.round(crownW * 0.6)), 2);

    const tBands = detailFactor(h, 59, 102);
    if (tBands <= 0.04) return;

    // Structural Edge Trim (Cobalt Neon)
    const trimCol = blendDetail(glassBodyCol, fogColor('#19284e', fogFactor, false), tBands);
    ctx.fillStyle = trimCol;
    const trimW = Math.max(1, Math.round(w * 0.05));
    const straightTrimX = side < 0 ? left + w - trimW : left;
    ctx.fillRect(straightTrimX, topY, trimW, h);
    const setbackTrimX = side < 0 ? left : left + w - trimW;
    ctx.fillRect(setbackTrimX, topY + crownH, trimW, h - crownH);
    ctx.fillRect(side < 0 ? left : left + crownW, topY + crownH, setbackW, Math.max(1, Math.round(trimW * 0.6)));

    // 6 Continuous Horizontal Illuminated Ribbon Windows (consistent vertical positions)
    const bands = 6;
    const padTop = Math.round(h * 0.04);
    const padBottom = Math.round(h * 0.05);
    const availH = h - crownH - padTop - padBottom;
    const bandStep = availH / bands;
    const bandLeft = left + Math.max(2, Math.round(w * 0.08));
    const bandW = Math.max(2, w - Math.max(4, Math.round(w * 0.16)));
    const tFine = isAtmospheric ? 0 : detailFactor(h, 118, 165);

    const bandColA = blendDetail(glassBodyCol, glassCyan, tBands);
    const bandColB = blendDetail(glassBodyCol, glassBlue, tBands);
    const mullionCol = tFine > 0.04 ? blendDetail(bandColA, glassBodyCol, tFine) : glassBodyCol;

    for (let b = 0; b < bands; b++) {
      const by = Math.round(topY + crownH + padTop + b * bandStep);
      const bandH = Math.max(2, Math.round(bandStep * 0.44));
      if (by + bandH >= ry - Math.round(h * 0.04)) break;

      ctx.fillStyle = b % 2 === 0 ? bandColA : bandColB;
      ctx.fillRect(bandLeft, by, bandW, bandH);

      if (tFine > 0.04) {
        ctx.fillStyle = mullionCol;
        for (let m = 1; m <= 3; m++) {
          ctx.fillRect(bandLeft + Math.round(bandW * (m / 4)), by, 1, bandH);
        }
      }
    }

    // Crown logo, beacons & spire
    if (tFine > 0.04) {
      const logoSize = Math.max(3, Math.round(crownW * 0.24));
      const logoX = Math.round(crownLeft + (crownW - logoSize) * 0.5);
      const logoY = topY + Math.round((crownH - logoSize) * 0.45);
      ctx.fillStyle = blendDetail(glassBodyCol, glassCyan, tFine);
      ctx.fillRect(logoX, logoY, logoSize, logoSize);
      ctx.fillStyle = blendDetail(glassCyan, fogColor('#ffffff', fogFactor, true), tFine);
      ctx.fillRect(logoX + 1, logoY + 1, Math.max(1, logoSize - 2), Math.max(1, logoSize - 2));

      ctx.fillStyle = blendDetail(glassBodyCol, beaconRed, tFine);
      ctx.fillRect(crownLeft + 1, topY - 2, 2, 2);
      ctx.fillRect(crownLeft + crownW - 3, topY - 2, 2, 2);

      const spireX = Math.round(crownLeft + crownW * 0.5);
      const spireH = Math.max(3, Math.round(h * 0.14));
      ctx.fillStyle = blendDetail(glassBodyCol, glassBlue, tFine);
      ctx.fillRect(spireX, topY - spireH, 1, spireH);
      ctx.fillStyle = blendDetail(glassBodyCol, beaconRed, tFine);
      ctx.fillRect(spireX - 1, topY - spireH - 1, 2, 2);
    }
  } else {
    // =========================================================================
    // ARCHITECTURE 3: Showa Retro Commercial Block with Rooftop Kanji Billboard & Fire Escapes
    // =========================================================================
    const w = Math.max(8, Math.round(4100 * ppu));
    const h = Math.max(13, Math.round(6800 * ppu));
    const topY = ry - h;
    const left = side < 0 ? rx - w : rx;
    const bodyCol = fogColor('#181024', fogFactor, false);
    const amberCol = fogColor('#ffbe0b', fogFactor, true);
    const amberAltCol = fogColor('#ff9e00', fogFactor, true);
    const neonPink = fogColor('#ff007f', fogFactor, true);
    const sillCol = fogColor('#2c1e40', fogFactor, false);

    // Dark brick / concrete Showa building body + rooftop billboard block (consistent positions)
    ctx.fillStyle = bodyCol;
    ctx.fillRect(left, topY, w, h);

    const boardW = Math.max(6, Math.round(w * 0.75));
    const boardH = Math.max(4, Math.round(h * 0.28));
    const boardGap = Math.max(2, Math.round(h * 0.05));
    const boardY = topY - boardH - boardGap;
    const boardX = left + Math.round((w - boardW) * 0.5);
    ctx.fillStyle = neonPink;
    ctx.fillRect(boardX, boardY, boardW, boardH);

    const tWin = detailFactor(h, 43, 84);
    if (tWin <= 0.04) return;

    // Horizontal floor dividing sills (progressive)
    ctx.fillStyle = blendDetail(bodyCol, sillCol, tWin);
    for (let f = 1; f <= 4; f++) {
      ctx.fillRect(left, topY + Math.round(h * (f / 5)), w, Math.max(1, Math.round(h * 0.025)));
    }

    const escapeW = Math.max(3, Math.round(w * 0.18));
    const escapeX = side < 0 ? left + 2 : left + w - escapeW - 2;
    const winZoneW = Math.max(4, w - escapeW - 8);
    const winZoneLeft = side < 0 ? left + escapeW + 5 : left + 3;
    const rows = 4;

    const tCols = isAtmospheric ? 0 : detailFactor(h, 88, 124);
    const tFine = isAtmospheric ? 0 : detailFactor(h, 108, 136);
    const winMain = blendDetail(bodyCol, amberCol, tWin);
    const winAlt = blendDetail(bodyCol, amberAltCol, tWin);

    if (tCols <= 0.04) {
      for (let r = 0; r < rows; r++) {
        const floorBaseY = topY + Math.round(h * (r / 5));
        const floorH = Math.round(h * 0.2);
        const winH = Math.max(2, Math.round(floorH * 0.38));
        const wy = floorBaseY + Math.round((floorH - winH) * 0.45);
        ctx.fillStyle = r % 2 === 0 ? winMain : winAlt;
        ctx.fillRect(winZoneLeft, wy, winZoneW, winH);
      }
    } else {
      const cols = 3;
      const winW = Math.max(2, Math.round(winZoneW * 0.22));
      const colStep = (winZoneW - winW) / (cols - 1);
      const acCol = tFine > 0.04 ? blendDetail(bodyCol, fogColor('#4a3e6b', fogFactor, false), tFine) : bodyCol;

      if (tCols < 0.96) {
        const stripColA = blendDetail(winMain, bodyCol, tCols);
        const stripColB = blendDetail(winAlt, bodyCol, tCols);
        for (let r = 0; r < rows; r++) {
          const floorBaseY = topY + Math.round(h * (r / 5));
          const floorH = Math.round(h * 0.2);
          const winH = Math.max(2, Math.round(floorH * 0.38));
          const wy = floorBaseY + Math.round((floorH - winH) * 0.45);
          ctx.fillStyle = r % 2 === 0 ? stripColA : stripColB;
          ctx.fillRect(winZoneLeft, wy, winZoneW, winH);
        }
      }

      for (let r = 0; r < rows; r++) {
        const floorBaseY = topY + Math.round(h * (r / 5));
        const floorH = Math.round(h * 0.2);
        const winH = Math.max(2, Math.round(floorH * 0.38));
        const wy = floorBaseY + Math.round((floorH - winH) * 0.45);

        for (let c = 0; c < cols; c++) {
          const wx = Math.round(winZoneLeft + c * colStep);
          ctx.fillStyle = (r + c) % 2 === 0 ? winMain : winAlt;
          ctx.fillRect(wx, wy, winW, winH);

          if (tFine > 0.04) {
            const acW = Math.max(2, Math.round(winW * 0.65));
            const acH = Math.max(1, Math.round(winH * 0.4));
            const acX = wx + Math.round((winW - acW) * 0.5);
            ctx.fillStyle = acCol;
            ctx.fillRect(acX, wy + winH, acW, acH);
          }
        }
      }
    }

    // Billboard inner face & glyphs + stilts + fire escape stairs
    const tBoardInner = detailFactor(h, 68, 118);
    if (tBoardInner > 0.04) {
      if (tFine > 0.04) {
        const stairCol = blendDetail(bodyCol, fogColor('#3a2d52', fogFactor, false), tFine);
        ctx.fillStyle = stairCol;
        for (let r = 0; r < rows; r++) {
          const platY = topY + Math.round(h * 0.2) + r * Math.round(h * 0.19);
          ctx.fillRect(escapeX, platY, escapeW, 2);
          if (r < rows - 1) {
            const nextPlatY = platY + Math.round(h * 0.19);
            ctx.beginPath();
            ctx.moveTo(escapeX, platY);
            ctx.lineTo(escapeX + escapeW, nextPlatY);
            ctx.strokeStyle = stairCol;
            ctx.lineWidth = 1;
            ctx.stroke();
          }
        }

        ctx.fillStyle = blendDetail(bodyCol, fogColor('#261b3d', fogFactor, false), tFine);
        const stiltY = topY - boardGap;
        ctx.fillRect(boardX + 2, stiltY, 2, boardGap);
        ctx.fillRect(boardX + boardW - 4, stiltY, 2, boardGap);

        ctx.fillStyle = blendDetail(neonPink, fogColor('#ffffff', fogFactor, true), tFine);
        ctx.fillRect(boardX + 1, boardY + 1, boardW - 2, boardH - 2);
        ctx.fillStyle = neonPink;
        ctx.fillRect(boardX + 2, boardY + 2, boardW - 4, boardH - 4);
      }

      ctx.fillStyle = blendDetail(neonPink, fogColor('#ffe600', fogFactor, true), tBoardInner);
      const kH = Math.max(2, Math.round(boardH * 0.55));
      const ky = boardY + Math.round((boardH - kH) * 0.5);
      ctx.fillRect(boardX + Math.round(boardW * 0.12), ky, Math.round(boardW * 0.16), kH);
      ctx.fillRect(boardX + Math.round(boardW * 0.38), ky, Math.round(boardW * 0.22), kH);
      ctx.fillRect(boardX + Math.round(boardW * 0.68), ky, Math.round(boardW * 0.18), kH);
    }
  }
}

// ---------------------------------------------------------------------------
// 5. JAPANESE ROADSIDE VENDING MACHINE (Jihanki)
// ---------------------------------------------------------------------------
function drawJihanki(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  ppu: number,
  variant: number,
  fogFactor = 0,
): void {
  const w = Math.max(3, Math.round(1100 * ppu));
  const h = Math.max(5, Math.round(2100 * ppu));
  const left = Math.round(x - w * 0.5);
  const topY = Math.round(y - h);
  const v = variant % JIHANKI_BODY.length;
  const bodyCol = fogColor(JIHANKI_BODY[v]!, fogFactor, false);
  const trimCol = fogColor(JIHANKI_TRIM[v]!, fogFactor, true);
  const darkCol = fogColor('#080514', fogFactor, false);
  const isAtmospheric = fogFactor >= ATMOSPHERE_SILHOUETTE_ONLY;
  const tDetail = isAtmospheric ? 0 : detailFactor(w, 6, 14);

  // Ground puddle / ambient light reflection
  if (w >= 4 && !isAtmospheric) {
    ctx.fillStyle = 'rgba(0, 245, 212, 0.28)';
    ctx.fillRect(left - 2, y - 1, w + 4, Math.max(2, Math.round(h * 0.08)));
  }

  // Cabinet casing
  ctx.fillStyle = bodyCol;
  ctx.fillRect(left, topY, w, h);

  // Accent header band & coin tray base
  ctx.fillStyle = trimCol;
  const trimH = Math.max(1, Math.round(h * 0.08));
  ctx.fillRect(left, topY, w, trimH);
  ctx.fillRect(left, y - trimH, w, trimH);

  // Large illuminated glass display showcase
  const winPad = Math.max(1, Math.round(w * 0.1));
  const winX = left + winPad;
  const winY = topY + trimH + winPad;
  const winW = Math.max(2, w - winPad * 2);
  const winH = Math.max(3, Math.round(h * 0.52));

  // Showcase interior glass transitions smoothly from emissive glow to dark glass behind cans
  const glowGlassCol = fogColor('#c7f9cc', fogFactor, true);
  if (tDetail > 0.04 && winW >= 6 && winH >= 10) {
    ctx.fillStyle = blendDetail(glowGlassCol, darkCol, tDetail);
    ctx.fillRect(winX, winY, winW, winH);
    const rowH = Math.floor(winH / 3);
    const canW = Math.max(1, Math.floor(winW / 4) - 1);
    const canH = Math.max(2, Math.round(rowH * 0.65));

    ctx.fillStyle = blendDetail(glowGlassCol, fogColor('#00bbf9', fogFactor, true), tDetail);
    for (let c = 0; c < 4; c++) {
      ctx.fillRect(winX + 1 + c * (canW + 1), winY + 1, canW, canH);
    }
    ctx.fillStyle = blendDetail(glowGlassCol, fogColor('#ff0054', fogFactor, true), tDetail);
    for (let c = 0; c < 4; c++) {
      ctx.fillRect(winX + 1 + c * (canW + 1), winY + rowH + 1, canW, canH);
    }
    ctx.fillStyle = blendDetail(glowGlassCol, fogColor('#00f59b', fogFactor, true), tDetail);
    for (let c = 0; c < 4; c++) {
      ctx.fillRect(winX + 1 + c * (canW + 1), winY + rowH * 2 + 1, canW, canH);
    }
  } else {
    ctx.fillStyle = glowGlassCol;
    ctx.fillRect(winX, winY, winW, winH);
  }

  // Dispenser flap door & coin return
  const flapW = Math.max(2, Math.round(w * 0.5));
  const flapH = Math.max(1, Math.round(h * 0.14));
  ctx.fillStyle = fogColor('#0b081a', fogFactor, false);
  ctx.fillRect(Math.round(left + (w - flapW) * 0.5), y - trimH - flapH - 1, flapW, flapH);
  if (tDetail > 0.04) {
    ctx.fillStyle = blendDetail(bodyCol, fogColor('#ffd166', fogFactor, true), tDetail);
    ctx.fillRect(Math.round(left + (w - flapW) * 0.5 + flapW * 0.7), y - trimH - flapH, Math.max(1, Math.round(flapW * 0.2)), Math.max(1, flapH - 1));
  }
}

// ---------------------------------------------------------------------------
// 6. JAPANESE PUBLIC PHONE BOOTH (Koushuu Denwa)
// ---------------------------------------------------------------------------
function drawPhonebooth(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  ppu: number,
  fogFactor = 0,
): void {
  const w = Math.max(3, Math.round(900 * ppu));
  const h = Math.max(5, Math.round(2500 * ppu));
  const left = Math.round(x - w * 0.5);
  const topY = Math.round(y - h);
  const frameCol = fogColor('#181b29', fogFactor, false);
  const headerCol = fogColor('#00f5d4', fogFactor, true);
  const isAtmospheric = fogFactor >= ATMOSPHERE_SILHOUETTE_ONLY;
  const tNear = isAtmospheric ? 0 : detailFactor(ppu, 0.0085, 0.017);

  if (tNear > 0.35 && fogFactor < 0.5) {
    ctx.fillStyle = 'rgba(8, 2, 20, 0.45)';
    ctx.fillRect(left - 1, y - 1, w + 2, Math.max(2, Math.round(h * 0.05)));
  }

  ctx.fillStyle = frameCol;
  ctx.fillRect(left, topY, w, h);

  const glassPad = Math.max(1, Math.round(w * 0.12));
  const glassX = left + glassPad;
  const glassY = topY + Math.max(2, Math.round(h * 0.08));
  const glassW = Math.max(2, w - glassPad * 2);
  const glassH = Math.max(3, Math.round(h * 0.78));

  ctx.fillStyle = isAtmospheric
    ? headerCol
    : fogFactor > 0.35
      ? blendDetail(frameCol, headerCol, 0.45)
      : 'rgba(0, 245, 212, 0.35)';
  ctx.fillRect(glassX, glassY, glassW, glassH);

  if (tNear > 0.04 && glassW >= 5 && glassH >= 12) {
    const shelfY = glassY + Math.round(glassH * 0.55);
    ctx.fillStyle = blendDetail(frameCol, fogColor('#0a0d18', fogFactor, false), tNear);
    ctx.fillRect(glassX, shelfY, glassW, Math.max(1, Math.round(h * 0.04)));

    const phoneW = Math.max(2, Math.round(glassW * 0.55));
    const phoneH = Math.max(3, Math.round(glassH * 0.28));
    ctx.fillStyle = blendDetail(frameCol, fogColor('#00a878', fogFactor, true), tNear);
    ctx.fillRect(Math.round(glassX + (glassW - phoneW) * 0.5), shelfY - phoneH, phoneW, phoneH);

    ctx.fillStyle = blendDetail(frameCol, fogColor('#024d38', fogFactor, false), tNear);
    ctx.fillRect(Math.round(glassX + (glassW - phoneW) * 0.5 - 1), shelfY - phoneH + 1, 1, phoneH - 1);

    ctx.fillStyle = blendDetail(headerCol, fogColor('#fff6cc', fogFactor, true), tNear);
    ctx.fillRect(Math.round(left + w * 0.3), glassY + 1, Math.max(2, Math.round(w * 0.4)), 1);
  }

  ctx.fillStyle = headerCol;
  ctx.fillRect(left + 1, topY + 1, w - 2, Math.max(1, Math.round(h * 0.05)));
}

// ---------------------------------------------------------------------------
// 7. OVERHEAD HIGHWAY GANTRY (Shuto Expressway Signs Portal)
// ---------------------------------------------------------------------------
function drawGantry(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  ppu: number,
  fogFactor = 0,
): void {
  const spanW = Math.max(20, Math.round(6800 * ppu));
  const h = Math.max(12, Math.round(4400 * ppu));
  const legW = Math.max(2, Math.round(180 * ppu));
  const leftLegX = Math.round(x - spanW * 0.5);
  const rightLegX = Math.round(x + spanW * 0.5 - legW);
  const topY = Math.round(y - h);
  const steelCol = fogColor(GANTRY_STEEL, fogFactor, false);
  const signCol = fogColor(GANTRY_SIGN_GREEN, fogFactor, true);
  const borderCol = fogColor(GANTRY_SIGN_BORDER, fogFactor, true);

  // Dual Vertical Steel Lattice Towers + horizontal beam
  ctx.fillStyle = steelCol;
  ctx.fillRect(leftLegX, topY, legW, h);
  ctx.fillRect(rightLegX, topY, legW, h);

  const beamH = Math.max(3, Math.round(520 * ppu));
  const signH = Math.max(4, Math.round(1350 * ppu));
  const signW = Math.max(8, Math.round(spanW * 0.38));
  const signY = topY + beamH + Math.max(1, Math.round(120 * ppu));
  const leftSignX = Math.round(x - signW - spanW * 0.04);
  const rightSignX = Math.round(x + spanW * 0.04);

  ctx.fillRect(leftLegX, topY, spanW, beamH);

  const tMid = detailFactor(spanW, 46, 76);
  const tNear = detailFactor(spanW, 82, 112);

  if (tMid > 0.04) {
    ctx.fillStyle = blendDetail(steelCol, fogColor(GANTRY_STEEL_LIGHT, fogFactor, true), tMid);
    ctx.fillRect(leftLegX, topY, spanW, Math.max(1, Math.round(beamH * 0.25)));

    ctx.fillStyle = blendDetail(signCol, borderCol, tMid);
    ctx.fillRect(leftSignX - 1, signY - 1, signW + 2, signH + 2);
    ctx.fillRect(rightSignX - 1, signY - 1, signW + 2, signH + 2);
  }

  ctx.fillStyle = signCol;
  ctx.fillRect(leftSignX, signY, signW, signH);
  ctx.fillRect(rightSignX, signY, signW, signH);

  if (tNear > 0.04) {
    const plinthH = Math.max(2, Math.round(h * 0.08));
    ctx.fillStyle = blendDetail(steelCol, fogColor('#120d22', fogFactor, false), tNear);
    ctx.fillRect(leftLegX - 1, y - plinthH, legW + 2, plinthH);
    ctx.fillRect(rightLegX - 1, y - plinthH, legW + 2, plinthH);

    if (signW >= 16 && signH >= 8) {
      ctx.fillStyle = blendDetail(signCol, fogColor('#ffffff', fogFactor, true), tNear);
      ctx.fillRect(leftSignX + 2, signY + Math.round(signH * 0.25), Math.max(1, Math.round(signW * 0.1)), Math.max(2, Math.round(signH * 0.5)));
      ctx.fillRect(leftSignX + Math.round(signW * 0.2), signY + Math.round(signH * 0.3), Math.max(2, Math.round(signW * 0.45)), Math.max(2, Math.round(signH * 0.4)));
      ctx.fillRect(rightSignX + 2, signY + Math.round(signH * 0.25), Math.max(1, Math.round(signW * 0.1)), Math.max(2, Math.round(signH * 0.5)));
      ctx.fillRect(rightSignX + Math.round(signW * 0.2), signY + Math.round(signH * 0.3), Math.max(2, Math.round(signW * 0.45)), Math.max(2, Math.round(signH * 0.4)));
    }
  }
}

// ---------------------------------------------------------------------------
// 7b. HIGHWAY OVERPASS / SCROLLING CAVALCAVIA (Ponte A)
// ---------------------------------------------------------------------------
function drawOverpass(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  ppu: number,
  variant: number,
  beatPulse: number,
  fogFactor = 0,
): void {
  // Spans across the entire roadway and clearance shoulders
  const spanW = Math.max(24, Math.round(7400 * ppu));
  const clearanceH = Math.max(14, Math.round(4400 * ppu));
  const deckH = Math.max(6, Math.round(1600 * ppu));
  const pillarW = Math.max(3, Math.round(360 * ppu));
  const totalH = clearanceH + deckH;
  const topY = Math.round(y - totalH);
  const deckBottomY = Math.round(y - clearanceH);
  const leftPillarX = Math.round(x - spanW * 0.5);
  const rightPillarX = Math.round(x + spanW * 0.5 - pillarW);
  const deckSpanW = spanW + Math.max(4, Math.round(400 * ppu));
  const deckX = Math.round(x - deckSpanW * 0.5);
  const railingH = Math.max(2, Math.round(450 * ppu));

  // Progressive fog-aware emergence of upper overpass details (eliminates abrupt spanW = 95 pop)
  const isAtmospheric = fogFactor >= ATMOSPHERE_SILHOUETTE_ONLY;
  const tDetail = isAtmospheric ? 0 : detailFactor(spanW, 74, 128);
  const concreteDark = fogColor(OVERPASS_CONCRETE_DARK, fogFactor, false);
  const concreteCol = fogColor(OVERPASS_CONCRETE, fogFactor, false);
  const concreteLight = fogColor(OVERPASS_CONCRETE_LIGHT, fogFactor, false);
  const steelBlue = fogColor(OVERPASS_STEEL_BLUE, fogFactor, false);
  const steelTruss = fogColor(OVERPASS_STEEL_TRUSS, fogFactor, false);
  const railingCol = fogColor(OVERPASS_RAILING, fogFactor, true);

  const footDeep = Math.max(1, Math.round(520 * ppu));
  if (tDetail <= 0.04) {
    ctx.fillStyle = concreteDark;
    ctx.fillRect(leftPillarX, deckBottomY, pillarW, clearanceH + footDeep);
    ctx.fillRect(rightPillarX, deckBottomY, pillarW, clearanceH + footDeep);
    ctx.fillStyle = variant === 1 ? steelBlue : concreteCol;
    ctx.fillRect(deckX, topY, deckSpanW, deckH);
    ctx.fillStyle = railingCol;
    ctx.fillRect(deckX, topY - railingH, deckSpanW, railingH);
    return;
  }

  // 1. Asphalt Roadway Shadow underneath the overpass
  if (fogFactor < 0.7 && tDetail > 0.35) {
    const shadowW = Math.max(16, Math.round(5200 * ppu));
    const shadowH = Math.max(2, Math.round(600 * ppu));
    ctx.fillStyle = OVERPASS_SHADOW;
    ctx.fillRect(Math.round(x - shadowW * 0.5), Math.round(y - shadowH * 0.5), shadowW, shadowH);
  }

  // 2. Concrete Abutment Pillars (Left & Right, extended below grade to avoid terrain float)
  const plinthH = Math.max(2, Math.round(clearanceH * 0.14));
  const plinthW = pillarW + Math.max(2, Math.round(80 * ppu));
  const plinthDark = blendDetail(concreteDark, fogColor(OVERPASS_HAZARD_DARK, fogFactor, false), tDetail);
  const hazardYellow = blendDetail(plinthDark, fogColor(OVERPASS_HAZARD_YELLOW, fogFactor, true), tDetail);

  // Left Pillar
  ctx.fillStyle = concreteDark;
  ctx.fillRect(leftPillarX, deckBottomY, pillarW, clearanceH + footDeep);
  ctx.fillStyle = concreteCol;
  ctx.fillRect(leftPillarX + 1, deckBottomY, Math.max(1, Math.round(pillarW * 0.6)), clearanceH);

  // Left Plinth & Hazard stripes
  ctx.fillStyle = plinthDark;
  ctx.fillRect(leftPillarX - 1, y - plinthH, plinthW, plinthH + footDeep);
  if (plinthW >= 6 && plinthH >= 3 && tDetail > 0.25) {
    ctx.fillStyle = hazardYellow;
    const stripeW = Math.max(2, Math.round(plinthW * 0.28));
    ctx.fillRect(leftPillarX, y - plinthH + 1, stripeW, plinthH - 2);
    ctx.fillRect(leftPillarX + stripeW * 2, y - plinthH + 1, stripeW, plinthH - 2);
  }

  // Right Pillar
  ctx.fillStyle = concreteDark;
  ctx.fillRect(rightPillarX, deckBottomY, pillarW, clearanceH + footDeep);
  ctx.fillStyle = concreteCol;
  ctx.fillRect(rightPillarX + 1, deckBottomY, Math.max(1, Math.round(pillarW * 0.6)), clearanceH);

  // Right Plinth & Hazard stripes
  ctx.fillStyle = plinthDark;
  ctx.fillRect(rightPillarX - 1, y - plinthH, plinthW, plinthH + footDeep);
  if (plinthW >= 6 && plinthH >= 3 && tDetail > 0.25) {
    ctx.fillStyle = hazardYellow;
    const stripeW = Math.max(2, Math.round(plinthW * 0.28));
    ctx.fillRect(rightPillarX, y - plinthH + 1, stripeW, plinthH - 2);
    ctx.fillRect(rightPillarX + stripeW * 2, y - plinthH + 1, stripeW, plinthH - 2);
  }

  // 3. Underside (Soffit) of the horizontal bridge span
  const soffitH = Math.max(1, Math.round(deckH * 0.22));

  ctx.fillStyle = concreteDark;
  ctx.fillRect(deckX, deckBottomY - soffitH, deckSpanW, soffitH);

  // 4. Horizontal Bridge Deck / Fascia
  if (variant === 1) {
    // Variant 1: Steel Truss Girder Overpass
    ctx.fillStyle = steelBlue;
    ctx.fillRect(deckX, topY, deckSpanW, deckH - soffitH);

    // Diagonal steel lattice truss members
    if (deckSpanW >= 40 && deckH >= 8) {
      ctx.fillStyle = blendDetail(steelBlue, steelTruss, tDetail);
      const bayCount = 8;
      const bayW = deckSpanW / bayCount;
      const trussThick = Math.max(1, Math.round(60 * ppu));
      for (let b = 0; b < bayCount; b++) {
        const bx = deckX + b * bayW;
        ctx.fillRect(Math.round(bx), topY, trussThick, deckH - soffitH);
        ctx.fillRect(Math.round(bx + bayW * 0.5), topY + Math.round(deckH * 0.25), trussThick, Math.round(deckH * 0.5));
      }
    }
  } else {
    // Variant 0 & 2: Heavy Reinforced Concrete Box Girder
    ctx.fillStyle = concreteCol;
    ctx.fillRect(deckX, topY, deckSpanW, deckH - soffitH);
    ctx.fillStyle = blendDetail(concreteCol, concreteLight, tDetail);
    ctx.fillRect(deckX, topY, deckSpanW, Math.max(1, Math.round(deckH * 0.2)));

    // Vertical expansion seam lines
    if (deckSpanW >= 40) {
      ctx.fillStyle = blendDetail(concreteCol, concreteDark, tDetail);
      const seamStep = deckSpanW / 4;
      for (let s = 1; s < 4; s++) {
        ctx.fillRect(Math.round(deckX + s * seamStep), topY, 1, deckH - soffitH);
      }
    }
  }

  // 5. Parapet / Guardrail on top of the bridge deck
  const railingY = topY - railingH;
  ctx.fillStyle = railingCol;
  ctx.fillRect(deckX, railingY, deckSpanW, railingH);
  ctx.fillStyle = blendDetail(railingCol, fogColor('#b4accf', fogFactor, false), tDetail);
  ctx.fillRect(deckX, railingY, deckSpanW, Math.max(1, Math.round(railingH * 0.25)));

  // 6. Variant Specific Upper Deck Features
  const whiteCol = fogColor('#ffffff', fogFactor, true);
  if (variant === 0) {
    // Variant 0: Shuto Expressway Exit Sign on the bridge fascia
    const signH = Math.max(3, Math.round(deckH * 0.55));
    const signW = Math.max(10, Math.round(spanW * 0.28));
    const signY = topY + Math.round((deckH - soffitH - signH) * 0.5);
    const signX = Math.round(x - signW * 0.5);

    ctx.fillStyle = blendDetail(concreteCol, whiteCol, tDetail);
    ctx.fillRect(signX - 1, signY - 1, signW + 2, signH + 2);
    const signGreen = blendDetail(concreteCol, fogColor(OVERPASS_SIGN_GREEN, fogFactor, true), tDetail);
    ctx.fillStyle = signGreen;
    ctx.fillRect(signX, signY, signW, signH);

    // Kanji glyphs on sign (出口 芝浦 SHIBAURA)
    if (signW >= 16 && signH >= 6) {
      ctx.fillStyle = blendDetail(signGreen, whiteCol, tDetail);
      ctx.fillRect(signX + 2, signY + Math.round(signH * 0.25), Math.max(1, Math.round(signW * 0.12)), Math.max(2, Math.round(signH * 0.5)));
      ctx.fillRect(signX + Math.round(signW * 0.22), signY + Math.round(signH * 0.3), Math.max(3, Math.round(signW * 0.4)), Math.max(1, Math.round(signH * 0.35)));
      ctx.fillRect(signX + Math.round(signW * 0.7), signY + Math.round(signH * 0.25), Math.max(2, Math.round(signW * 0.22)), Math.max(2, Math.round(signH * 0.5)));
    }

    // Streetlights on top of the bridge deck pointing upwards
    const lampH = Math.max(4, Math.round(900 * ppu));
    const lampPoleW = Math.max(1, Math.round(50 * ppu));
    const lampLeftX = Math.round(x - spanW * 0.25);
    const lampRightX = Math.round(x + spanW * 0.25);

    ctx.fillStyle = blendDetail(railingCol, fogColor('#6e5f94', fogFactor, false), tDetail);
    ctx.fillRect(lampLeftX, railingY - lampH, lampPoleW, lampH);
    ctx.fillRect(lampRightX, railingY - lampH, lampPoleW, lampH);
    ctx.fillStyle = blendDetail(railingCol, fogColor(OVERPASS_LAMP_GLOW, fogFactor, true), tDetail);
    ctx.fillRect(lampLeftX - 1, railingY - lampH - 1, lampPoleW + 2, Math.max(2, Math.round(lampH * 0.35)));
    ctx.fillRect(lampRightX - 1, railingY - lampH - 1, lampPoleW + 2, Math.max(2, Math.round(lampH * 0.35)));
  } else if (variant === 1) {
    // Variant 1: Route shield badge + yellow reflectors
    const shieldW = Math.max(6, Math.round(600 * ppu));
    const shieldH = Math.max(5, Math.round(650 * ppu));
    const shieldX = Math.round(x - shieldW * 0.5);
    const shieldY = topY + Math.round((deckH - soffitH - shieldH) * 0.5);

    ctx.fillStyle = blendDetail(steelBlue, whiteCol, tDetail);
    ctx.fillRect(shieldX - 1, shieldY - 1, shieldW + 2, shieldH + 2);
    const shieldBlue = blendDetail(steelBlue, fogColor('#0052cc', fogFactor, true), tDetail);
    ctx.fillStyle = shieldBlue; // Japanese National Route Blue
    ctx.fillRect(shieldX, shieldY, shieldW, shieldH);
    if (shieldW >= 8 && shieldH >= 6) {
      ctx.fillStyle = blendDetail(shieldBlue, whiteCol, tDetail);
      ctx.fillRect(shieldX + Math.round(shieldW * 0.35), shieldY + 1, Math.max(1, Math.round(shieldW * 0.3)), shieldH - 2);
    }
  } else {
    // Variant 2: Cyber-Glass Viaduct with Pulsing Neon Line
    const neonH = Math.max(1, Math.round(150 * ppu));
    const neonCol = blendDetail(
      railingCol,
      fogColor(beatPulse > 0.4 ? OVERPASS_NEON_PINK : OVERPASS_NEON_CYAN, fogFactor, true),
      tDetail,
    );
    ctx.fillStyle = neonCol;
    ctx.fillRect(deckX, railingY, deckSpanW, neonH);

    // Silhouettes of distant upper traffic lights crossing overhead
    if (deckSpanW >= 30) {
      const carW = Math.max(3, Math.round(400 * ppu));
      const carH = Math.max(2, Math.round(200 * ppu));
      const carY = railingY - carH;

      // Passing car 1 (headlight white)
      ctx.fillStyle = blendDetail(railingCol, whiteCol, tDetail);
      ctx.fillRect(Math.round(x - spanW * 0.18), carY, carW, carH);
      // Passing car 2 (taillight red)
      ctx.fillStyle = blendDetail(railingCol, fogColor('#ff0055', fogFactor, true), tDetail);
      ctx.fillRect(Math.round(x + spanW * 0.15), carY, carW, carH);
    }
  }
}

// ---------------------------------------------------------------------------
// 7c. MONUMENTAL SUSPENSION BRIDGE TOWER (Ponte B: Rainbow Bridge)
// ---------------------------------------------------------------------------
function drawSuspensionTower(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  ppu: number,
  variant: number,
  beatPulse: number,
  fogFactor = 0,
): void {
  // Align portal tower legs directly onto bridge deck outer parapets (~4667 ppu outer span)
  const spanW = Math.max(18, Math.round(5000 * ppu));
  const towerH = Math.max(22, Math.round(9200 * ppu));
  const legW = Math.max(3, Math.round(420 * ppu));
  const topY = Math.round(y - towerH);

  const leftX = Math.round(x - spanW * 0.5);
  const rightX = Math.round(x + spanW * 0.5 - legW);

  // Colors per variant (smoothly blended toward atmospheric haze)
  const isOrangeWhite = variant === 0;
  const isCyberTitanium = variant === 1;

  const colPrimary = fogColor(
    isOrangeWhite ? '#ff4800' : isCyberTitanium ? '#1e1935' : '#7b2cbf',
    fogFactor,
    false,
  );
  const colSecondary = fogColor(
    isOrangeWhite ? '#f8f9fa' : isCyberTitanium ? '#00f5d4' : '#ff007f',
    fogFactor,
    true,
  );
  const colTruss = fogColor(
    isOrangeWhite ? '#cc3700' : isCyberTitanium ? '#2c254d' : '#4a1572',
    fogFactor,
    false,
  );

  // Progressive fog-aware emergence for monumental suspension tower (grounded directly on bridge parapets)
  const isAtmospheric = fogFactor >= ATMOSPHERE_SILHOUETTE_ONLY;
  const tTowerDetail = isAtmospheric ? 0 : detailFactor(spanW, 54, 92);
  const tCable = isAtmospheric ? 0 : detailFactor(spanW, 24, 60);
  const cableBaseCol = isCyberTitanium
    ? (beatPulse > 0.4 ? '#ffffff' : '#00f5d4')
    : isOrangeWhite ? '#fff2c2' : '#ff9eec';
  const cableCol = blendDetail(colPrimary, fogColor(cableBaseCol, fogFactor, true), tCable);
  const beaconCol = fogColor(beatPulse > 0.3 ? '#ff0033' : '#ffffff', fogFactor, true);

  if (tTowerDetail <= 0.04) {
    const farFoot = Math.max(2, Math.round(800 * ppu));
    ctx.fillStyle = colPrimary;
    ctx.fillRect(leftX, topY, legW, towerH + farFoot);
    ctx.fillRect(rightX, topY, legW, towerH + farFoot);
    ctx.fillStyle = colTruss;
    const beamH = Math.max(1, Math.round(towerH * 0.08));
    ctx.fillRect(leftX, topY + Math.round(towerH * 0.14), spanW, beamH);
    ctx.fillRect(leftX, topY + Math.round(towerH * 0.5), spanW, beamH);
    if (tCable > 0.04 && y > 0 && typeof ctx.quadraticCurveTo === 'function') {
      const leftPeakX = leftX + legW * 0.5;
      const rightPeakX = rightX + legW * 0.5;
      const centerCpY = topY + towerH * 0.14;
      ctx.strokeStyle = cableCol;
      ctx.lineWidth = Math.max(1, Math.round(120 * ppu));
      ctx.beginPath();
      ctx.moveTo(leftPeakX, topY);
      ctx.quadraticCurveTo(x, centerCpY, rightPeakX, topY);
      ctx.stroke();
    }
    ctx.fillStyle = beaconCol;
    ctx.fillRect(leftX, topY, Math.max(2, legW), 2);
    ctx.fillRect(rightX, topY, Math.max(2, legW), 2);
    return;
  }

  const canvasW = ctx.canvas?.width ?? 640;
  const canvasH = ctx.canvas?.height ?? 360;
  const drawLeftLeg = leftX + legW >= -2 && leftX <= canvasW + 2;
  const drawRightLeg = rightX + legW >= -2 && rightX <= canvasW + 2;

  // 1. Dual Vertical Tapered Towers (Left & Right legs)
  // Drawn with 5 alternating horizontal safety/aviation bands
  const bandCount = 5;
  const bandH = Math.round(towerH / bandCount);
  const altBandCol = blendDetail(colPrimary, colSecondary, tTowerDetail);

  if (drawLeftLeg || drawRightLeg) {
    for (let b = 0; b < bandCount; b++) {
      const bandY = topY + b * bandH;
      const curH = b === bandCount - 1 ? y - bandY : bandH;
      if (bandY + curH < 0 || bandY > canvasH) continue;
      ctx.fillStyle = b % 2 === 0 ? colPrimary : altBandCol;
      if (drawLeftLeg) ctx.fillRect(leftX, bandY, legW, curH);
      if (drawRightLeg) ctx.fillRect(rightX, bandY, legW, curH);
    }

    // Leg inner bevel / 3D shading (clamped to viewport Y)
    const visTopY = Math.max(0, topY);
    const visTowerH = Math.min(canvasH, y) - visTopY;
    if (visTowerH > 0 && tTowerDetail > 0.35 && fogFactor < 0.7) {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
      if (drawLeftLeg) {
        ctx.fillRect(leftX + Math.round(legW * 0.65), visTopY, Math.max(1, Math.round(legW * 0.35)), visTowerH);
      }
      if (drawRightLeg) {
        ctx.fillRect(rightX, visTopY, Math.max(1, Math.round(legW * 0.35)), visTowerH);
      }
    }

    // Foundation concrete plinths anchored downward into the bay water beneath the bridge parapets
    const plinthH = Math.max(2, Math.round(1000 * ppu));
    if (y >= 0 && y - plinthH <= canvasH) {
      const plinthTopY = Math.round(y - plinthH * 0.35);
      const plinthTotalH = Math.max(4, Math.round(plinthH * 1.45));
      ctx.fillStyle = fogColor('#0f0a1c', fogFactor, false);
      if (drawLeftLeg) ctx.fillRect(leftX - 2, plinthTopY, legW + 4, plinthTotalH);
      if (drawRightLeg) ctx.fillRect(rightX - 2, plinthTopY, legW + 4, plinthTotalH);
    }
  }

  // 2. Horizontal Cross-Struts (Lower, Middle, Upper portal beams)
  const innerSpan = rightX - (leftX + legW);
  if (innerSpan > 10) {
    const beamX = Math.max(-2, leftX + legW);
    const beamEnd = Math.min(canvasW + 2, leftX + legW + innerSpan);
    const visBeamW = beamEnd - beamX;
    if (visBeamW > 0) {
      const beamThick = Math.max(2, Math.round(480 * ppu));

      // Lower portal beam (just above traffic clearance ~4400 ppu)
      const lowerBeamY = Math.round(y - 4400 * ppu);
      if (lowerBeamY + beamThick >= 0 && lowerBeamY <= canvasH) {
        ctx.fillStyle = colPrimary;
        ctx.fillRect(beamX, lowerBeamY, visBeamW, beamThick);
      }

      // Middle portal cross-beam (~6600 ppu)
      const midBeamY = Math.round(y - 6600 * ppu);
      if (midBeamY + beamThick >= 0 && midBeamY <= canvasH) {
        ctx.fillStyle = altBandCol;
        ctx.fillRect(beamX, midBeamY, visBeamW, beamThick);
      }

      // Upper cross-beam arch at tower crown (~8600 ppu)
      const upperBeamY = Math.round(y - 8600 * ppu);
      if (upperBeamY + beamThick >= 0 && upperBeamY <= canvasH) {
        ctx.fillStyle = colPrimary;
        ctx.fillRect(beamX, upperBeamY, visBeamW, beamThick);
      }

      // Diagonal X-bracing truss between middle and upper beams
      if (innerSpan >= 40 && beamThick >= 3 && midBeamY >= 0 && upperBeamY + beamThick <= canvasH) {
        ctx.fillStyle = blendDetail(colPrimary, colTruss, tTowerDetail);
        const trussThick = Math.max(1, Math.round(100 * ppu));
        const midMidX = Math.round(x);
        if (midMidX + trussThick >= 0 && midMidX - trussThick <= canvasW) {
          ctx.fillRect(
            midMidX - Math.round(trussThick * 0.5),
            upperBeamY + beamThick,
            trussThick,
            midBeamY - (upperBeamY + beamThick),
          );
        }
      }
    }
  }

  // 3. Central Portal Suspension Catenary & Portal Suspenders (longitudinal bridge cables are rendered in RoadRenderer)
  if (spanW >= 18 && y > 0) {
    const cableThick = Math.min(8, Math.max(1, Math.round(120 * ppu)));
    const leftPeakX = leftX + legW * 0.5;
    const rightPeakX = rightX + legW * 0.5;
    const centerCpY = topY + towerH * 0.14;
    const upperBeamY = Math.round(y - 8600 * ppu);

    const cablesAboveViewport = topY < -40 && centerCpY < 0;
    if (!cablesAboveViewport && typeof ctx.quadraticCurveTo === 'function') {
      ctx.strokeStyle = cableCol;
      ctx.lineWidth = cableThick;
      ctx.beginPath();
      ctx.moveTo(leftPeakX, topY);
      ctx.quadraticCurveTo(x, centerCpY, rightPeakX, topY);
      ctx.stroke();
    }

    // Internal vertical portal suspenders anchored onto the upper steel cross-beam (never floating in water)
    if (upperBeamY > topY && upperBeamY <= canvasH) {
      ctx.fillStyle = cableCol;
      const suspW = Math.min(5, Math.max(1, Math.round(cableThick * 0.65)));
      const visBottom = Math.min(canvasH, upperBeamY);
      for (let i = 1; i <= 3; i++) {
        const t = i / 4;
        const omt = 1 - t;
        const sx = Math.round(omt * omt * leftPeakX + 2 * omt * t * x + t * t * rightPeakX);
        if (sx + suspW >= 0 && sx <= canvasW) {
          const sy = Math.max(0, Math.round(omt * omt * topY + 2 * omt * t * centerCpY + t * t * topY));
          if (visBottom > sy) {
            ctx.fillRect(sx, sy, suspW, visBottom - sy);
          }
        }
      }
    }
  }

  // 4. Red/White Aviation Warning Beacons at Tower Peaks
  const beaconR = Math.max(2, Math.round(250 * ppu));
  if (topY >= 0 && topY - beaconR * 2 <= canvasH) {
    ctx.fillStyle = beaconCol;
    if (drawLeftLeg) {
      ctx.fillRect(leftX + Math.round(legW * 0.5 - beaconR * 0.5), topY - beaconR * 2, beaconR, beaconR * 2);
    }
    if (drawRightLeg) {
      ctx.fillRect(rightX + Math.round(legW * 0.5 - beaconR * 0.5), topY - beaconR * 2, beaconR, beaconR * 2);
    }
  }
}

// ---------------------------------------------------------------------------
// 8. VARIABLE MESSAGE SIGN (Amber LED Matrix with Test Message & Advisories)
// ---------------------------------------------------------------------------
function drawVMS(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  ppu: number,
  variant: number,
  beatPulse: number,
  fogFactor = 0,
): void {
  const w = Math.max(12, Math.round(3600 * ppu));
  const h = Math.max(5, Math.round(1600 * ppu));
  const legH = Math.max(3, Math.round(2200 * ppu));
  const legW = Math.max(1, Math.round(110 * ppu));
  const left = Math.round(x - w * 0.5);
  const topY = Math.round(y - legH - h);

  const steelCol = fogColor(GANTRY_STEEL, fogFactor, false);
  const frameCol = fogColor(VMS_FRAME, fogFactor, false);
  const darkScreen = fogColor('#1c0905', fogFactor, false);
  const amberFace = fogColor(VMS_LED_AMBER, fogFactor, true);
  const brightFace = fogColor(VMS_LED_BRIGHT, fogFactor, true);

  // Support posts
  ctx.fillStyle = steelCol;
  ctx.fillRect(Math.round(x - w * 0.35), y - legH, legW, legH);
  ctx.fillRect(Math.round(x + w * 0.35 - legW), y - legH, legW, legH);

  // Outer display casing
  ctx.fillStyle = frameCol;
  ctx.fillRect(left, topY, w, h);

  // Dim amber matrix grid
  const pad = Math.max(1, Math.round(w * 0.04));
  const innerX = left + pad;
  const innerY = topY + pad;
  const innerW = w - pad * 2;
  const innerH = h - pad * 2;
  ctx.fillStyle = darkScreen;
  ctx.fillRect(innerX, innerY, innerW, innerH);

  const isAtmospheric = fogFactor >= ATMOSPHERE_SILHOUETTE_ONLY;
  const tDetail = isAtmospheric ? 0 : detailFactor(innerW, 9, 26);
  const tBeacon = isAtmospheric ? 0 : detailFactor(w, 16, 28);
  const tLine2 = isAtmospheric ? 0 : detailFactor(innerW, 13, 28);
  if (tDetail <= 0.04) {
    ctx.fillStyle = amberFace;
    ctx.fillRect(
      innerX + 2,
      innerY + Math.round(innerH * 0.25),
      Math.max(2, innerW - 4),
      Math.max(1, Math.round(innerH * 0.42)),
    );
    return;
  }

  const ledAmber = amberFace;
  const ledBright = blendDetail(amberFace, brightFace, tDetail);
  const flashA = beatPulse > 0.4;

  // Progressive twin hazard beacons on top corners (smooth emergence from frame casing)
  if (tBeacon > 0.04) {
    const beaconR = Math.max(2, Math.round(w * 0.05));
    ctx.fillStyle = blendDetail(frameCol, flashA ? ledBright : ledAmber, tBeacon);
    ctx.fillRect(left + 2, topY - beaconR, beaconR, beaconR);
    ctx.fillStyle = blendDetail(frameCol, !flashA ? ledBright : ledAmber, tBeacon);
    ctx.fillRect(left + w - beaconR - 2, topY - beaconR, beaconR, beaconR);
  }

  // Amber LED Matrix Glyphs
  const textH = Math.max(2, Math.round(innerH * 0.32));
  const line1Y = innerY + Math.round(innerH * 0.16);
  const line2Y = innerY + Math.round(innerH * 0.55);
  const line2Color = blendDetail(darkScreen, ledBright, tLine2);

  if (innerW >= 16 && innerH >= 6) {
    ctx.fillStyle = ledAmber;
    const v = variant % 4;

    if (v === 0) {
      // --- TEST MESSAGE: MESSAGGIO DI PROVA / TEST IN CORSO ---
      if (innerW >= 32 && innerH >= 12) {
        ctx.fillStyle = flashA ? ledBright : ledAmber;
        // Pixel matrix letters: P R O V A
        const charW = Math.max(2, Math.round(innerW * 0.08));
        const charH = textH;
        const charGap = Math.max(1, Math.round(charW * 0.4));
        const totalW = 5 * charW + 4 * charGap;
        let cx = innerX + Math.round((innerW - totalW) * 0.5);

        // P
        ctx.fillRect(cx, line1Y, charW, charH);
        ctx.fillRect(cx, line1Y, charW, Math.max(1, Math.round(charH * 0.3)));
        ctx.fillRect(cx, line1Y + Math.round(charH * 0.4), charW, Math.max(1, Math.round(charH * 0.25)));
        cx += charW + charGap;
        // R
        ctx.fillRect(cx, line1Y, charW, charH);
        ctx.fillRect(cx, line1Y, charW, Math.max(1, Math.round(charH * 0.3)));
        ctx.fillRect(cx, line1Y + Math.round(charH * 0.4), charW, Math.max(1, Math.round(charH * 0.25)));
        cx += charW + charGap;
        // O
        ctx.fillRect(cx, line1Y, charW, charH);
        ctx.fillStyle = darkScreen;
        ctx.fillRect(cx + 1, line1Y + 1, Math.max(1, charW - 2), Math.max(1, charH - 2));
        ctx.fillStyle = flashA ? ledBright : ledAmber;
        cx += charW + charGap;
        // V
        ctx.fillRect(cx, line1Y, 1, charH);
        ctx.fillRect(cx + charW - 1, line1Y, 1, charH);
        ctx.fillRect(cx + Math.round(charW * 0.5), line1Y + charH - 1, 1, 1);
        cx += charW + charGap;
        // A
        ctx.fillRect(cx, line1Y, charW, charH);
        ctx.fillRect(cx + 1, line1Y + Math.round(charH * 0.3), Math.max(1, charW - 2), Math.max(1, charH * 0.4));
        ctx.fillStyle = darkScreen;
        ctx.fillRect(cx + 1, line1Y + 1, Math.max(1, charW - 2), Math.max(1, Math.round(charH * 0.3)));
        ctx.fillStyle = flashA ? ledBright : ledAmber;

        // Line 2: TEST IN CORSO
        ctx.fillStyle = line2Color;
        const testBarW = Math.max(4, Math.round(innerW * 0.65));
        ctx.fillRect(innerX + Math.round((innerW - testBarW) * 0.5), line2Y, testBarW, textH);
      } else {
        ctx.fillRect(innerX + 2, line1Y, Math.max(4, Math.round(innerW * 0.82)), textH);
        if (tLine2 > 0.04) {
          ctx.fillStyle = line2Color;
          ctx.fillRect(innerX + 3, line2Y, Math.max(4, Math.round(innerW * 0.55)), textH);
        }
      }
    } else if (v === 1) {
      // GROOVE AHEAD / 120 BPM
      ctx.fillRect(innerX + 3, line1Y, Math.max(4, Math.round(innerW * 0.75)), textH);
      if (tLine2 > 0.04) {
        ctx.fillStyle = line2Color;
        ctx.fillRect(innerX + 4, line2Y, Math.max(4, Math.round(innerW * 0.5)), textH);
      }
    } else if (v === 2) {
      // TOFU WARNING / NO SPILL
      ctx.fillRect(innerX + 3, line1Y, Math.max(4, Math.round(innerW * 0.8)), textH);
      if (tLine2 > 0.04) {
        ctx.fillStyle = line2Color;
        ctx.fillRect(innerX + 4, line2Y, Math.max(4, Math.round(innerW * 0.6)), textH);
      }
    } else {
      // RADIO 88.4 / CASSETTE ON
      ctx.fillRect(innerX + 3, line1Y, Math.max(4, Math.round(innerW * 0.65)), textH);
      if (tLine2 > 0.04) {
        ctx.fillStyle = line2Color;
        ctx.fillRect(innerX + 4, line2Y, Math.max(4, Math.round(innerW * 0.85)), textH);
      }
    }
  } else {
    ctx.fillStyle = ledAmber;
    ctx.fillRect(
      innerX + 2,
      innerY + Math.round(innerH * 0.25),
      Math.max(2, innerW - 4),
      Math.max(1, Math.round(innerH * 0.42)),
    );
    if (tLine2 > 0.04) {
      ctx.fillStyle = line2Color;
      ctx.fillRect(innerX + 3, line2Y, Math.max(2, Math.round(innerW * 0.55)), Math.max(1, Math.round(innerH * 0.25)));
    }
  }
}

// ---------------------------------------------------------------------------
// 9. CURVE RHYTHM CHEVRONS (Pulsing Directional Arrows)
// ---------------------------------------------------------------------------
function drawChevron(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  ppu: number,
  _side: number,
  variant = 0,
  beatPulse = 0,
  beatIndex = 0,
  fogFactor = 0,
): void {
  const isLeft = variant % 2 === 1;
  const seq = Math.floor(variant / 2);
  const k = ((beatIndex % 4) + 4) % 4;
  const isChaseLit = seq % 4 === k && beatPulse > 0.15;

  // Japanese-style delineator board (矢羽根): tall-ish single-arrow board on single post
  const w = Math.max(5, Math.round(950 * ppu));
  const h = Math.max(6, Math.round(1350 * ppu));
  const postH = Math.max(3, Math.round(1200 * ppu));
  const postW = Math.max(1, Math.round(75 * ppu));
  const rx = Math.round(x);
  const left = Math.round(rx - w * 0.5);
  const topY = Math.round(y - postH - h);

  // Neon trim (Cyan for Left turn, Magenta for Right turn, White if chase-lit)
  const neonColor = fogColor(isChaseLit ? '#ffffff' : isLeft ? CHEVRON_CYAN : CHEVRON_MAGENTA, fogFactor, true);
  const bgCol = fogColor(CHEVRON_BG, fogFactor, false);

  // Single steel support post & black sign board
  ctx.fillStyle = fogColor('#26203a', fogFactor, false);
  ctx.fillRect(Math.round(rx - postW * 0.5), y - postH, postW, postH);
  ctx.fillStyle = bgCol;
  ctx.fillRect(left, topY, w, h);

  // Smooth transition from compact center mark to bordered arrow
  const tArrow = detailFactor(w, 9, 16);
  if (tArrow <= 0.04) {
    ctx.fillStyle = neonColor;
    const markW = Math.max(2, Math.round(w * 0.55));
    const markH = Math.max(2, Math.round(h * 0.45));
    ctx.fillRect(Math.round(rx - markW * 0.5), topY + Math.round((h - markH) * 0.5), markW, markH);
    return;
  }

  // Post footing / guardrail clamp
  if (tArrow > 0.45) {
    ctx.fillStyle = blendDetail(bgCol, fogColor('#140d24', fogFactor, false), tArrow);
    ctx.fillRect(Math.round(rx - postW * 1.2), y - 2, Math.max(3, Math.round(postW * 2.4)), 2);
  }

  ctx.fillStyle = blendDetail(bgCol, neonColor, tArrow);
  ctx.fillRect(left, topY, w, 1);
  ctx.fillRect(left, topY + h - 1, w, 1);
  ctx.fillRect(left, topY, 1, h);
  ctx.fillRect(left + w - 1, topY, 1, h);

  ctx.fillStyle = neonColor;

  // Big Single Japanese-style Chevron Arrow (矢羽根)
  const arrowPadX = Math.max(1, Math.round(w * 0.16));
  const arrowPadY = Math.max(1, Math.round(h * 0.18));
  const thick = Math.max(1, Math.round(w * 0.28));
  const cy = topY + Math.round(h * 0.5);

  ctx.beginPath();
  if (!isLeft) {
    // Arrow pointing RIGHT (>)
    const tipX = left + w - arrowPadX;
    const baseOuterX = left + arrowPadX;
    const baseInnerX = baseOuterX + thick;
    const innerTipX = tipX - thick;

    ctx.moveTo(baseOuterX, topY + arrowPadY);
    ctx.lineTo(baseInnerX, topY + arrowPadY);
    ctx.lineTo(tipX, cy);
    ctx.lineTo(baseInnerX, topY + h - arrowPadY);
    ctx.lineTo(baseOuterX, topY + h - arrowPadY);
    ctx.lineTo(innerTipX, cy);
  } else {
    // Arrow pointing LEFT (<)
    const tipX = left + arrowPadX;
    const baseOuterX = left + w - arrowPadX;
    const baseInnerX = baseOuterX - thick;
    const innerTipX = tipX + thick;

    ctx.moveTo(baseOuterX, topY + arrowPadY);
    ctx.lineTo(baseInnerX, topY + arrowPadY);
    ctx.lineTo(tipX, cy);
    ctx.lineTo(baseInnerX, topY + h - arrowPadY);
    ctx.lineTo(baseOuterX, topY + h - arrowPadY);
    ctx.lineTo(innerTipX, cy);
  }
  ctx.closePath();
  ctx.fill();
}

// ---------------------------------------------------------------------------
// 10. POWER PYLON (Japanese Delta Transmission Tower with Continuous Lines)
// ---------------------------------------------------------------------------
/**
 * Computes the 5 insulator cable attachment points (x, y) for a power pylon in screen coordinates.
 * Writes 10 values (x0, y0, ... x4, y4) into the provided Float32Array at `outOffset` (zero GC).
 */
export function getPylonAttachmentPoints(
  x: number,
  y: number,
  ppu: number,
  out: Float32Array,
  outOffset = 0,
  variant = 0,
): void {
  const isTerminal = variant === 1;
  const h = Math.max(20, Math.round(10200 * ppu));
  const baseW = Math.max(6, Math.round((isTerminal ? 3800 : 3400) * ppu));
  const rx = Math.round(x);
  const topY = Math.round(y - h);

  const vTopY = Math.round(topY + h * 0.18);
  const vTopW = Math.max(6, Math.round(baseW * 1.35));
  const trussH = Math.max(2, Math.round(h * 0.04));
  const hornSpanW = Math.max(10, Math.round(baseW * 1.95));
  const hornTipY = Math.round(vTopY - h * 0.04);
  const leftHornX = Math.round(rx - hornSpanW * 0.5);
  const rightHornX = Math.round(rx + hornSpanW * 0.5);

  const insH = Math.max(3, Math.round(h * 0.08));
  const insAttachY = hornTipY + trussH;
  const insAttachMidY = vTopY + trussH;

  const insX1 = leftHornX + 2;
  const insX2 = Math.round(rx - vTopW * 0.52);
  const insX3 = rx;
  const insX4 = Math.round(rx + vTopW * 0.52);
  const insX5 = rightHornX - 2;

  // Variant 1 (terminal/strain tower) has tensioned horizontal insulators; variant 0/2 hangs vertically
  const yOffset = isTerminal ? Math.round(insH * 0.4) : insH;

  out[outOffset] = insX1;
  out[outOffset + 1] = insAttachY + yOffset;
  out[outOffset + 2] = insX2;
  out[outOffset + 3] = insAttachMidY + yOffset;
  out[outOffset + 4] = insX3;
  out[outOffset + 5] = insAttachMidY + yOffset;
  out[outOffset + 6] = insX4;
  out[outOffset + 7] = insAttachMidY + yOffset;
  out[outOffset + 8] = insX5;
  out[outOffset + 9] = insAttachY + yOffset;
}

function drawPylon(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  ppu: number,
  variant = 0,
  fogFactor = 0,
): void {
  const isTerminal = variant === 1;
  const h = Math.max(20, Math.round(10200 * ppu));
  const baseW = Math.max(6, Math.round((isTerminal ? 3800 : 3400) * ppu));
  const rx = Math.round(x);
  const topY = Math.round(y - h);
  const steelCol = fogColor(PYLON_STEEL, fogFactor, false);
  const steelLightCol = fogColor(PYLON_STEEL_LIGHT, fogFactor, false);
  const beaconCol = fogColor(PYLON_BEACON, fogFactor, true);
  const footingCol = fogColor('#140d24', fogFactor, false);

  const isAtmospheric = fogFactor >= ATMOSPHERE_SILHOUETTE_ONLY;
  const tLattice = isAtmospheric ? 0 : detailFactor(h, 46, 98);

  if (h < 46) {
    ctx.fillStyle = steelCol;
    ctx.fillRect(rx - 1, topY + Math.round(h * 0.18), 2, Math.round(h * 0.82));
    ctx.fillStyle = steelLightCol;
    const armW = Math.max(6, Math.round(baseW * 1.6));
    ctx.fillRect(Math.round(rx - armW * 0.5), topY + Math.round(h * 0.2), armW, 2);
    ctx.fillRect(Math.round(rx - armW * 0.36), topY + Math.round(h * 0.36), Math.max(4, Math.round(armW * 0.72)), 1);
    ctx.fillStyle = beaconCol;
    ctx.fillRect(rx - 1, topY, 2, 2);
    return;
  }

  // Ground concrete footings (heavier for terminal anchor)
  ctx.fillStyle = footingCol;
  const footH = isTerminal ? 3 : 2;
  ctx.fillRect(Math.round(rx - baseW * 0.5), y - footH, baseW, footH);

  // Waist geometry (narrows at ~42% height from ground)
  const waistY = Math.round(y - h * 0.42);
  const waistW = Math.max(2, Math.round(baseW * (isTerminal ? 0.42 : 0.38)));

  ctx.fillStyle = steelCol;
  const legThick = Math.max(1, Math.round(baseW * (isTerminal ? 0.08 : 0.05)));
  ctx.beginPath();
  ctx.moveTo(Math.round(rx - baseW * 0.5), y);
  ctx.lineTo(Math.round(rx - waistW * 0.5), waistY);
  ctx.lineTo(Math.round(rx - waistW * 0.5 + legThick), waistY);
  ctx.lineTo(Math.round(rx - baseW * 0.5 + legThick), y);
  ctx.moveTo(Math.round(rx + baseW * 0.5), y);
  ctx.lineTo(Math.round(rx + waistW * 0.5), waistY);
  ctx.lineTo(Math.round(rx + waistW * 0.5 - legThick), waistY);
  ctx.lineTo(Math.round(rx + baseW * 0.5 - legThick), y);
  ctx.fill();

  ctx.fillRect(Math.round(rx - waistW * 0.5), waistY, waistW, Math.max(1, Math.round(h * 0.015)));

  if (tLattice > 0.25 && baseW >= 10) {
    ctx.strokeStyle = blendDetail(footingCol, steelCol, tLattice);
    ctx.lineWidth = 1;
    const midLegY = Math.round((y + waistY) * 0.5);
    const midLegW = Math.round((baseW + waistW) * 0.25);
    ctx.beginPath();
    ctx.moveTo(Math.round(rx - midLegW), midLegY);
    ctx.lineTo(Math.round(rx + midLegW), midLegY);
    ctx.moveTo(Math.round(rx - baseW * 0.45), y);
    ctx.lineTo(Math.round(rx + waistW * 0.45), waistY);
    ctx.moveTo(Math.round(rx + baseW * 0.45), y);
    ctx.lineTo(Math.round(rx - waistW * 0.45), waistY);
    ctx.stroke();
  }

  // --- DELTA V-BASKET (Upper flared body) ---
  const vTopY = Math.round(topY + h * 0.18);
  const vTopW = Math.max(6, Math.round(baseW * 1.35));

  ctx.fillStyle = steelCol;
  ctx.beginPath();
  ctx.moveTo(Math.round(rx - waistW * 0.5), waistY);
  ctx.lineTo(Math.round(rx - vTopW * 0.5), vTopY);
  ctx.lineTo(Math.round(rx - vTopW * 0.5 + legThick), vTopY);
  ctx.lineTo(Math.round(rx - waistW * 0.5 + legThick), waistY);
  ctx.moveTo(Math.round(rx + waistW * 0.5), waistY);
  ctx.lineTo(Math.round(rx + vTopW * 0.5), vTopY);
  ctx.lineTo(Math.round(rx + vTopW * 0.5 - legThick), vTopY);
  ctx.lineTo(Math.round(rx + waistW * 0.5 - legThick), waistY);
  ctx.fill();

  if (tLattice > 0.25 && baseW >= 12) {
    ctx.strokeStyle = blendDetail(footingCol, steelCol, tLattice);
    ctx.lineWidth = 1;
    const vMidY = Math.round((waistY + vTopY) * 0.5);
    const vMidW = Math.round((waistW + vTopW) * 0.25);
    ctx.beginPath();
    ctx.moveTo(Math.round(rx - vMidW), vMidY);
    ctx.lineTo(Math.round(rx + vMidW), vMidY);
    ctx.stroke();
  }

  // --- HORIZONTAL TRUSS CROSSARM (Bridging the top of the V) ---
  const trussH = Math.max(2, Math.round(h * 0.04));
  ctx.fillStyle = steelLightCol;
  ctx.fillRect(Math.round(rx - vTopW * 0.5), vTopY, vTopW, trussH);

  // --- CANTILEVER OUTWARD HORNS ---
  const hornSpanW = Math.max(10, Math.round(baseW * 1.95));
  const hornTipY = Math.round(vTopY - h * 0.04);
  const leftHornX = Math.round(rx - hornSpanW * 0.5);
  const rightHornX = Math.round(rx + hornSpanW * 0.5);

  ctx.beginPath();
  ctx.moveTo(Math.round(rx - vTopW * 0.5), vTopY + trussH);
  ctx.lineTo(leftHornX, hornTipY);
  ctx.lineTo(leftHornX, hornTipY + trussH);
  ctx.lineTo(Math.round(rx - vTopW * 0.5), vTopY);
  ctx.moveTo(Math.round(rx + vTopW * 0.5), vTopY + trussH);
  ctx.lineTo(rightHornX, hornTipY);
  ctx.lineTo(rightHornX, hornTipY + trussH);
  ctx.lineTo(Math.round(rx + vTopW * 0.5), vTopY);
  ctx.fill();

  // Mid-LOD: smooth emergence of fine insulator strings & clamps (no snap at h=85)
  const isPylonAtmospheric = fogFactor >= ATMOSPHERE_SILHOUETTE_ONLY;
  const tIns = isPylonAtmospheric ? 0 : detailFactor(h, 68, 108);
  if (tIns <= 0.04) {
    ctx.fillStyle = beaconCol;
    ctx.fillRect(rx - 1, topY, 2, 2);
    ctx.fillRect(leftHornX - 1, hornTipY - 1, 2, 2);
    ctx.fillRect(rightHornX - 1, hornTipY - 1, 2, 2);
    return;
  }

  // --- INSULATOR STRINGS (5 attachment points) ---
  const insH = Math.max(3, Math.round(h * 0.08));
  const insAttachY = hornTipY + trussH;
  const insAttachMidY = vTopY + trussH;
  const insCol = blendDetail(steelCol, fogColor('#80f5ec', fogFactor, true), tIns);

  const insX1 = leftHornX + 2;
  const insX2 = Math.round(rx - vTopW * 0.52);
  const insX3 = rx;
  const insX4 = Math.round(rx + vTopW * 0.52);
  const insX5 = rightHornX - 2;

  if (isTerminal) {
    // Terminal variant (1): horizontal strain insulators (porcelain mint/cyan)
    const strainW = Math.max(3, Math.round(insH * 1.1));
    const insYOffset = Math.round(insH * 0.4);
    ctx.fillStyle = insCol;
    ctx.fillRect(insX1 - strainW, insAttachY + insYOffset, strainW, 2);
    ctx.fillRect(insX2 - strainW, insAttachMidY + insYOffset, strainW, 2);
    ctx.fillRect(insX3 - Math.round(strainW * 0.5), insAttachMidY + insYOffset, strainW, 2);
    ctx.fillRect(insX4, insAttachMidY + insYOffset, strainW, 2);
    ctx.fillRect(insX5, insAttachY + insYOffset, strainW, 2);

    // Insulator metal tension clamps
    if (tIns > 0.35) {
      ctx.fillStyle = steelCol;
      ctx.fillRect(insX1 - 1, insAttachY + insYOffset, 2, 2);
      ctx.fillRect(insX2 - 1, insAttachMidY + insYOffset, 2, 2);
      ctx.fillRect(insX3 - 1, insAttachMidY + insYOffset, 2, 2);
      ctx.fillRect(insX4 - 1, insAttachMidY + insYOffset, 2, 2);
      ctx.fillRect(insX5 - 1, insAttachY + insYOffset, 2, 2);
    }
  } else {
    // Suspension variants (0 & 2): hanging vertical insulator strings
    ctx.fillStyle = insCol;
    ctx.fillRect(insX1, insAttachY, 1, insH);
    ctx.fillRect(insX2, insAttachMidY, 1, insH);
    ctx.fillRect(insX3, insAttachMidY, 1, insH);
    ctx.fillRect(insX4, insAttachMidY, 1, insH);
    ctx.fillRect(insX5, insAttachY, 1, insH);

    // Insulator bottom metal clamps
    if (tIns > 0.35) {
      ctx.fillStyle = steelCol;
      ctx.fillRect(insX1 - 1, insAttachY + insH, 3, 1);
      ctx.fillRect(insX2 - 1, insAttachMidY + insH, 3, 1);
      ctx.fillRect(insX3 - 1, insAttachMidY + insH, 3, 1);
      ctx.fillRect(insX4 - 1, insAttachMidY + insH, 3, 1);
      ctx.fillRect(insX5 - 1, insAttachY + insH, 3, 1);
    }
  }

  // Top Pinnacle Aviation Warning Red Beacon
  ctx.fillStyle = beaconCol;
  ctx.fillRect(rx - 1, topY, 2, 2);
  ctx.fillRect(leftHornX - 1, hornTipY - 1, 2, 2);
  ctx.fillRect(rightHornX - 1, hornTipY - 1, 2, 2);
}

// ---------------------------------------------------------------------------
// 11. ROADSIDE SHRUB (Two Distinct Silhouette Variants: Dome Hedge vs Niwaki)
// ---------------------------------------------------------------------------
function drawShrub(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  ppu: number,
  variant: number,
  fogFactor = 0,
): void {
  const isTiered = variant % 2 === 1;
  const v = variant % SHRUB_BODY.length;

  const rawBody = activePropTheme ? activePropTheme.shrubTint[0] : SHRUB_BODY[v]!;
  const rawShade = activePropTheme ? activePropTheme.shrubTint[1] : SHRUB_SHADE[v]!;
  const rawAccent = activePropTheme
    ? activePropTheme.shrubTint[2]
    : v === 0
      ? '#ff007f'
      : v === 1
        ? '#00f5d4'
        : '#ffd166';

  const bodyColor = fogColor(rawBody, fogFactor, true);
  const shadeColor = fogColor(rawShade, fogFactor, false);
  const accentColor = fogColor(rawAccent, fogFactor, true);
  const isAtmospheric = fogFactor >= ATMOSPHERE_SILHOUETTE_ONLY;

  if (!isTiered) {
    // --- Silhouette A: Low Broad Roadside Hedge / Dome Bush ---
    const w = Math.max(3, Math.round(1400 * ppu));
    const h = Math.max(2, Math.round(750 * ppu));
    const left = Math.round(x - w * 0.5);
    const topY = Math.round(y - h);

    if (fogFactor < 0.55 && w >= 6) {
      ctx.fillStyle = 'rgba(6, 2, 16, 0.45)';
      ctx.fillRect(left - 1, y - 1, w + 2, Math.max(1, Math.round(h * 0.3)));
    }

    ctx.fillStyle = shadeColor;
    ctx.fillRect(left, topY + Math.round(h * 0.35), w, Math.round(h * 0.65));

    ctx.fillStyle = bodyColor;
    ctx.fillRect(left + Math.round(w * 0.15), topY, Math.round(w * 0.7), Math.round(h * 0.65));
    ctx.fillRect(left, topY + Math.round(h * 0.25), Math.round(w * 0.45), Math.round(h * 0.5));
    ctx.fillRect(left + Math.round(w * 0.55), topY + Math.round(h * 0.25), Math.round(w * 0.45), Math.round(h * 0.5));

    if (!isAtmospheric && w >= 8) {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
      ctx.fillRect(left + Math.round(w * 0.25), topY, Math.round(w * 0.5), 1);
    }
  } else {
    // --- Silhouette B: Sculpted Japanese Tiered Niwaki / Cloud Shrub ---
    const w = Math.max(3, Math.round(1200 * ppu));
    const h = Math.max(4, Math.round(1150 * ppu));
    const left = Math.round(x - w * 0.5);
    const topY = Math.round(y - h);

    if (fogFactor < 0.55 && w >= 6) {
      ctx.fillStyle = 'rgba(6, 2, 16, 0.45)';
      ctx.fillRect(left, y - 1, w, Math.max(1, Math.round(h * 0.2)));
    }

    const stemW = Math.max(1, Math.round(w * 0.1));
    ctx.fillStyle = fogColor('#221528', fogFactor, false);
    ctx.fillRect(Math.round(x - stemW * 0.5), Math.round(y - h * 0.6), stemW, Math.round(h * 0.6));
    ctx.fillRect(Math.round(x - w * 0.3), Math.round(y - h * 0.45), Math.round(w * 0.3), Math.max(1, Math.round(h * 0.08)));

    const lowerW = Math.max(2, Math.round(w * 0.55));
    const lowerH = Math.max(2, Math.round(h * 0.35));
    const lowerY = Math.round(y - h * 0.55);
    ctx.fillStyle = shadeColor;
    ctx.fillRect(left, lowerY + Math.round(lowerH * 0.3), lowerW, Math.round(lowerH * 0.7));
    ctx.fillStyle = bodyColor;
    ctx.fillRect(left + 1, lowerY, Math.max(1, lowerW - 2), Math.round(lowerH * 0.6));

    const upperW = Math.max(2, Math.round(w * 0.65));
    const upperH = Math.max(2, Math.round(h * 0.42));
    const upperX = Math.round(x - w * 0.15);
    ctx.fillStyle = shadeColor;
    ctx.fillRect(upperX, topY + Math.round(upperH * 0.3), upperW, Math.round(upperH * 0.7));
    ctx.fillStyle = bodyColor;
    ctx.fillRect(upperX + 1, topY, Math.max(1, upperW - 2), Math.round(upperH * 0.6));

    ctx.fillStyle = accentColor;
    ctx.fillRect(upperX + Math.round(upperW * 0.3), topY, Math.max(1, Math.round(upperW * 0.35)), 1);
    ctx.fillRect(left + Math.round(lowerW * 0.3), lowerY, Math.max(1, Math.round(lowerW * 0.35)), 1);
  }
}

// ---------------------------------------------------------------------------
// 12. NORMAL JAPANESE ROAD SIGNS (Segnaletica Stradale Giapponese)
// ---------------------------------------------------------------------------
function drawSign(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  ppu: number,
  side: number,
  variant: number,
  fogFactor = 0,
): void {
  const v = variant % 3;
  const postH = Math.max(4, Math.round(2200 * ppu));
  const postW = Math.max(1, Math.round(75 * ppu));
  const rx = Math.round(x);
  const groundY = Math.round(y);
  const isAtmospheric = fogFactor >= ATMOSPHERE_SILHOUETTE_ONLY;

  // Galvanized steel post
  ctx.fillStyle = fogColor('#4a3e6b', fogFactor, false);
  ctx.fillRect(Math.round(rx - postW * 0.5), groundY - postH, postW, postH);

  // Smooth fog-aware detail progression for internal sign glyphs & subplates
  const postCol = fogColor('#4a3e6b', fogFactor, false);
  const redFace = fogColor('#e63946', fogFactor, true);
  const greenFace = fogColor('#006b47', fogFactor, true);
  const yellowFace = fogColor('#ffcc00', fogFactor, true);
  const whiteCol = fogColor('#ffffff', fogFactor, true);
  const darkInk = fogColor('#080414', fogFactor, false);
  const navyInk = fogColor('#0b1d3a', fogFactor, false);
  const subDark = fogColor('#1b1428', fogFactor, false);

  const tSignDetail = isAtmospheric ? 0 : detailFactor(postH, 18, 36);
  const tGlyphDetail = isAtmospheric ? 0 : detailFactor(postH, 24, 42);
  if (tSignDetail <= 0.04) {
    const sw = v === 1 ? Math.max(5, Math.round(1800 * ppu)) : Math.max(4, Math.round(1200 * ppu));
    const sh = v === 1 ? Math.max(3, Math.round(1200 * ppu)) : sw;
    ctx.fillStyle = v === 0 ? redFace : v === 1 ? greenFace : yellowFace;
    ctx.fillRect(Math.round(rx - sw * 0.5), groundY - postH - sh, sw, sh);
    return;
  }

  // Post footing / guardrail clamp
  if (tSignDetail > 0.35) {
    ctx.fillStyle = fogColor('#26203a', fogFactor, false);
    ctx.fillRect(Math.round(rx - postW * 1.2), groundY - 2, Math.max(3, Math.round(postW * 2.4)), 2);
  }

  if (v === 0) {
    // --- Variant 0: Japanese Speed Limit 80 Sign (Cartello Circolare Limite 80) ---
    const diam = Math.max(4, Math.round(1150 * ppu));
    const r = Math.round(diam * 0.5);
    const signCenterY = groundY - postH - r;

    // Outer crimson red border ring
    ctx.fillStyle = redFace;
    ctx.beginPath();
    ctx.arc(rx, signCenterY, r, 0, Math.PI * 2);
    ctx.fill();

    // Inner pure white disc
    const innerR = Math.max(1, Math.round(r * 0.72));
    const innerWhite = blendDetail(redFace, whiteCol, tSignDetail);
    ctx.fillStyle = innerWhite;
    ctx.beginPath();
    ctx.arc(rx, signCenterY, innerR, 0, Math.PI * 2);
    ctx.fill();

    // Blue numerals "80"
    if (diam >= 8 && tGlyphDetail > 0.04) {
      ctx.fillStyle = blendDetail(innerWhite, navyInk, tGlyphDetail);
      const numH = Math.max(2, Math.round(diam * 0.38));
      const numW = Math.max(1, Math.round(diam * 0.18));
      // Digit 8
      ctx.fillRect(Math.round(rx - numW - 1), Math.round(signCenterY - numH * 0.5), numW, numH);
      // Digit 0
      ctx.fillRect(Math.round(rx + 1), Math.round(signCenterY - numH * 0.5), numW, numH);
      ctx.fillStyle = innerWhite;
      ctx.fillRect(Math.round(rx - numW), Math.round(signCenterY - numH * 0.25), Math.max(1, numW - 2), 1);
      ctx.fillRect(Math.round(rx + 2), Math.round(signCenterY - numH * 0.25), Math.max(1, numW - 2), Math.max(1, numH - 2));
    }

    // Lower white auxiliary sub-plate (Japanese zone indicator)
    if (tSignDetail > 0.2) {
      const subW = Math.max(3, Math.round(diam * 0.75));
      const subH = Math.max(2, Math.round(diam * 0.3));
      const subY = signCenterY + r + 1;
      const subWhite = blendDetail(postCol, whiteCol, tSignDetail);
      ctx.fillStyle = blendDetail(postCol, subDark, tSignDetail);
      ctx.fillRect(Math.round(rx - subW * 0.5 - 1), subY - 1, subW + 2, subH + 2);
      ctx.fillStyle = subWhite;
      ctx.fillRect(Math.round(rx - subW * 0.5), subY, subW, subH);
      if (tGlyphDetail > 0.04) {
        ctx.fillStyle = blendDetail(subWhite, navyInk, tGlyphDetail);
        ctx.fillRect(Math.round(rx - subW * 0.35), subY + Math.round(subH * 0.35), Math.round(subW * 0.7), Math.max(1, Math.round(subH * 0.25)));
      }
    }

  } else if (v === 1) {
    // --- Variant 1: Shuto Expressway Directional Exit Sign (Cartello Verde di Uscita) ---
    const signW = Math.max(6, Math.round(1800 * ppu));
    const signH = Math.max(4, Math.round(1200 * ppu));
    const signLeft = Math.round(rx - signW * 0.5);
    const signTop = groundY - postH - signH;

    // Sign frame & green face
    ctx.fillStyle = blendDetail(greenFace, darkInk, tSignDetail);
    ctx.fillRect(signLeft - 1, signTop - 1, signW + 2, signH + 2);
    ctx.fillStyle = greenFace;
    ctx.fillRect(signLeft, signTop, signW, signH);

    // White perimeter border
    const borderCol = blendDetail(greenFace, whiteCol, tSignDetail);
    ctx.fillStyle = borderCol;
    ctx.fillRect(signLeft, signTop, signW, 1);
    ctx.fillRect(signLeft, signTop + signH - 1, signW, 1);
    ctx.fillRect(signLeft, signTop, 1, signH);
    ctx.fillRect(signLeft + signW - 1, signTop, 1, signH);

    if (signW >= 12 && signH >= 8 && tGlyphDetail > 0.04) {
      const glyphCol = blendDetail(greenFace, whiteCol, tGlyphDetail);
      // White Route shield "C1" (Shuto Inner Loop)
      const shieldW = Math.max(3, Math.round(signW * 0.3));
      const shieldH = Math.max(3, Math.round(signH * 0.42));
      ctx.fillStyle = glyphCol;
      ctx.fillRect(signLeft + 2, signTop + 2, shieldW, shieldH);
      ctx.fillStyle = greenFace;
      ctx.fillRect(signLeft + 3, signTop + 3, shieldW - 2, shieldH - 2);

      // Destination text lines
      ctx.fillStyle = glyphCol;
      const textX = signLeft + shieldW + 4;
      const textW = Math.max(2, signLeft + signW - textX - 2);
      ctx.fillRect(textX, signTop + 3, textW, Math.max(1, Math.round(signH * 0.2)));
      ctx.fillRect(textX, signTop + Math.round(signH * 0.35), Math.round(textW * 0.7), Math.max(1, Math.round(signH * 0.16)));

      // Diagonal exit arrow (↖ or ↗ based on side)
      const arrowY = signTop + Math.round(signH * 0.6);
      const arrowX = side < 0 ? signLeft + 3 : signLeft + signW - 5;
      ctx.fillRect(arrowX, arrowY, 2, Math.max(2, Math.round(signH * 0.3)));
      ctx.fillRect(arrowX - (side < 0 ? 0 : 2), arrowY, 3, 1);
    }

  } else {
    // --- Variant 2: Curve Hazard Warning Diamond (Rombo Giallo Pericolo) ---
    const diam = Math.max(4, Math.round(1300 * ppu));
    const r = Math.round(diam * 0.5);
    const signCenterY = groundY - postH - r;

    // Diamond polygon (rotated square)
    ctx.fillStyle = blendDetail(yellowFace, darkInk, tSignDetail);
    ctx.beginPath();
    ctx.moveTo(rx, signCenterY - r - 1);
    ctx.lineTo(rx + r + 1, signCenterY);
    ctx.lineTo(rx, signCenterY + r + 1);
    ctx.lineTo(rx - r - 1, signCenterY);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = yellowFace; // Caution Yellow
    ctx.beginPath();
    ctx.moveTo(rx, signCenterY - r);
    ctx.lineTo(rx + r, signCenterY);
    ctx.lineTo(rx, signCenterY + r);
    ctx.lineTo(rx - r, signCenterY);
    ctx.closePath();
    ctx.fill();

    // Black directional curve arrow glyph (↱ for right curve when on left shoulder, ↰ for left curve)
    if (diam >= 8 && tGlyphDetail > 0.04) {
      ctx.fillStyle = blendDetail(yellowFace, darkInk, tGlyphDetail);
      const turnDir = side < 0 ? 1 : -1;
      const stemW = Math.max(2, Math.round(diam * 0.14));
      const stemX = Math.round(rx - turnDir * diam * 0.08 - stemW * 0.5);
      const stemTopY = Math.round(signCenterY - r * 0.26);
      const stemBotY = Math.round(signCenterY + r * 0.48);

      // Vertical entry shaft
      ctx.fillRect(stemX, stemTopY, stemW, Math.max(2, stemBotY - stemTopY));

      // Horizontal turn arm bending into the upcoming curve direction
      const bendW = Math.max(2, Math.round(r * 0.42));
      const bendX = turnDir > 0 ? stemX : Math.round(stemX + stemW - bendW);
      ctx.fillRect(bendX, stemTopY, bendW, stemW);

      // Triangular arrowhead pointing in turnDir
      const headBaseX = turnDir > 0 ? bendX + bendW - 1 : bendX + 1;
      const headTipX = headBaseX + turnDir * Math.max(3, Math.round(r * 0.34));
      const headCenterY = stemTopY + Math.round(stemW * 0.5);
      const headHalfH = Math.max(2, Math.round(r * 0.24));
      ctx.beginPath();
      ctx.moveTo(headBaseX, headCenterY - headHalfH);
      ctx.lineTo(headTipX, headCenterY);
      ctx.lineTo(headBaseX, headCenterY + headHalfH);
      ctx.closePath();
      ctx.fill();
    }
  }
}

// ---------------------------------------------------------------------------
// 15. ROADSIDE SHOP KIOSK (Baiten / Kiosk)
// ---------------------------------------------------------------------------
function drawKiosk(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  ppu: number,
  _side: number,
  variant: number,
  fogFactor = 0,
): void {
  if (ppu <= 0 || !Number.isFinite(ppu)) return;

  const w = Math.max(6, Math.round(2800 * ppu));
  const h = Math.max(8, Math.round(2600 * ppu));
  const left = Math.round(x - w * 0.5);
  const topY = Math.round(y - h);
  const v = Math.abs(variant) % 3;
  const bodyCol = fogColor(v === 1 ? '#1c1230' : '#140c22', fogFactor, false);
  const awnCol = fogColor(v === 0 ? '#ff007f' : v === 1 ? '#00bbf9' : '#ffaa00', fogFactor, true);
  const isAtmospheric = fogFactor >= ATMOSPHERE_SILHOUETTE_ONLY;
  const tDetail = isAtmospheric ? 0 : detailFactor(ppu, 0.0085, 0.017);

  if (tDetail <= 0.04) {
    ctx.fillStyle = bodyCol;
    ctx.fillRect(left, topY, w, h);
    ctx.fillStyle = awnCol;
    ctx.fillRect(left, topY, w, Math.max(2, Math.round(h * 0.28)));
    return;
  }

  if (w >= 8 && tDetail > 0.45 && fogFactor < 0.5) {
    ctx.fillStyle = 'rgba(255, 200, 100, 0.25)';
    ctx.fillRect(left - 4, y - 2, w + 8, Math.max(2, Math.round(h * 0.1)));
  }

  ctx.fillStyle = bodyCol;
  ctx.fillRect(left, topY, w, h);

  const awH = Math.max(2, Math.round(h * 0.22));
  const awY = topY + Math.max(1, Math.round(h * 0.1));
  const awOverhang = Math.max(1, Math.round(w * 0.06));
  const awLeft = left - awOverhang;
  const awW = w + awOverhang * 2;

  ctx.fillStyle = awnCol;
  ctx.fillRect(awLeft, awY, awW, awH);

  if (w >= 14 && awH >= 4 && tDetail > 0.35) {
    ctx.fillStyle = blendDetail(awnCol, fogColor('#ffffff', fogFactor, true), tDetail);
    const stripeW = Math.max(2, Math.round(awW * 0.12));
    const stripeCount = Math.floor(awW / (stripeW * 2));
    for (let i = 0; i < stripeCount; i++) {
      ctx.fillRect(awLeft + i * (stripeW * 2), awY, stripeW, awH);
    }
  }

  const winPadX = Math.max(2, Math.round(w * 0.12));
  const winW = Math.max(3, w - winPadX * 2);
  const winH = Math.max(3, Math.round(h * 0.38));
  const winY = awY + awH + Math.max(1, Math.round(h * 0.04));

  ctx.fillStyle = blendDetail(bodyCol, fogColor('#fff4cc', fogFactor, true), tDetail);
  ctx.fillRect(left + winPadX, winY, winW, winH);

  if (winW >= 10 && winH >= 6 && tDetail > 0.45) {
    ctx.fillStyle = fogColor('#1c0f2e', fogFactor, false);
    ctx.fillRect(left + winPadX, winY + winH - Math.max(2, Math.round(winH * 0.3)), winW, Math.max(2, Math.round(winH * 0.3)));
    ctx.fillStyle = fogColor('#ff2a6d', fogFactor, true);
    ctx.fillRect(left + winPadX + 2, winY + winH - Math.max(4, Math.round(winH * 0.6)), Math.max(2, Math.round(winW * 0.25)), Math.max(2, Math.round(winH * 0.3)));
    ctx.fillStyle = fogColor('#05d9e8', fogFactor, true);
    ctx.fillRect(left + winPadX + Math.round(winW * 0.4), winY + winH - Math.max(4, Math.round(winH * 0.5)), Math.max(2, Math.round(winW * 0.25)), Math.max(2, Math.round(winH * 0.2)));
  }

  const signH = Math.max(2, Math.round(h * 0.1));
  const headerCol = fogColor('#ff0055', fogFactor, true);
  ctx.fillStyle = blendDetail(bodyCol, headerCol, tDetail);
  ctx.fillRect(left + 2, topY, w - 4, signH);
  if (w >= 12 && signH >= 3 && tDetail > 0.45) {
    ctx.fillStyle = blendDetail(headerCol, fogColor('#ffffff', fogFactor, true), tDetail);
    ctx.fillRect(left + 4, topY + 1, w - 8, Math.max(1, signH - 2));
  }
}

// ---------------------------------------------------------------------------
// 16. ROADSIDE BENCH
// ---------------------------------------------------------------------------
function drawBench(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  ppu: number,
  variant: number,
  fogFactor = 0,
): void {
  if (ppu <= 0 || !Number.isFinite(ppu)) return;

  const w = Math.max(4, Math.round(1300 * ppu));
  const h = Math.max(3, Math.round(750 * ppu));
  const left = Math.round(x - w * 0.5);
  const topY = Math.round(y - h);
  const v = Math.abs(variant) % 3;
  const slatColor = fogColor(v === 1 ? '#0077b6' : v === 2 ? '#2a9d8f' : '#8d5b4c', fogFactor, true);
  const legColor = fogColor('#100d1c', fogFactor, false);

  const tBench = fogFactor >= ATMOSPHERE_SILHOUETTE_ONLY ? 0 : detailFactor(ppu, 0.0055, 0.011);
  if (tBench <= 0.04) {
    ctx.fillStyle = slatColor;
    ctx.fillRect(left, topY, w, h);
    ctx.fillStyle = legColor;
    ctx.fillRect(left + 1, y - 1, Math.max(1, w - 2), 1);
    return;
  }

  if (fogFactor < 0.55 && tBench > 0.35) {
    ctx.fillStyle = 'rgba(8, 2, 20, 0.45)';
    ctx.fillRect(left - 1, y - 1, w + 2, Math.max(1, Math.round(h * 0.18)));
  }

  ctx.fillStyle = legColor;
  const legW = Math.max(1, Math.round(w * 0.08));
  ctx.fillRect(left + Math.round(w * 0.12), topY, legW, h);
  ctx.fillRect(left + Math.round(w * 0.88) - legW, topY, legW, h);

  ctx.fillStyle = slatColor;
  const backH = Math.max(1, Math.round(h * 0.32));
  ctx.fillRect(left, topY, w, backH);

  const seatH = Math.max(1, Math.round(h * 0.22));
  const seatY = y - Math.max(2, Math.round(h * 0.48));
  ctx.fillRect(left, seatY, w, seatH);
}

// ---------------------------------------------------------------------------
// 17. SUBURBAN BUS STOP SHELTER
// ---------------------------------------------------------------------------
function drawBusStop(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  ppu: number,
  side: number,
  variant: number,
  fogFactor = 0,
): void {
  if (ppu <= 0 || !Number.isFinite(ppu)) return;

  const w = Math.max(6, Math.round(2400 * ppu));
  const h = Math.max(8, Math.round(2800 * ppu));
  const left = Math.round(x - w * 0.5);
  const topY = Math.round(y - h);
  const postCol = fogColor('#151224', fogFactor, false);
  const roofCol = fogColor('#221a36', fogFactor, false);
  const neonTrim = fogColor(Math.abs(variant) % 2 === 0 ? '#ff007f' : '#00f5d4', fogFactor, true);
  const isAtmospheric = fogFactor >= ATMOSPHERE_SILHOUETTE_ONLY;
  const tDetail = isAtmospheric ? 0 : detailFactor(ppu, 0.0085, 0.017);

  if (tDetail <= 0.04) {
    ctx.fillStyle = postCol;
    ctx.fillRect(left, topY, w, h);
    ctx.fillStyle = neonTrim;
    ctx.fillRect(left, topY, w, Math.max(2, Math.round(h * 0.16)));
    return;
  }

  if (tDetail > 0.4 && fogFactor < 0.5) {
    ctx.fillStyle = 'rgba(0, 245, 212, 0.22)';
    ctx.fillRect(left - 2, y - 2, w + 4, Math.max(2, Math.round(h * 0.08)));
  }

  const postW = Math.max(1, Math.round(w * 0.05));
  ctx.fillStyle = postCol;
  ctx.fillRect(left + Math.round(w * 0.08), topY, postW, h);
  ctx.fillRect(left + Math.round(w * 0.82) - postW, topY, postW, h);

  ctx.fillStyle = fogFactor > 0.35
    ? blendDetail(postCol, neonTrim, 0.35)
    : 'rgba(0, 245, 212, 0.28)';
  const glassY = topY + Math.max(2, Math.round(h * 0.12));
  const glassH = Math.max(3, Math.round(h * 0.68));
  ctx.fillRect(left + Math.round(w * 0.08), glassY, Math.round(w * 0.74), glassH);

  const roofH = Math.max(2, Math.round(h * 0.1));
  ctx.fillStyle = roofCol;
  ctx.fillRect(left, topY, Math.round(w * 0.88), roofH);

  ctx.fillStyle = neonTrim;
  ctx.fillRect(left, topY + Math.max(1, Math.round(roofH * 0.7)), Math.round(w * 0.88), 1);

  ctx.fillStyle = blendDetail(postCol, fogColor('#0077b6', fogFactor, true), tDetail);
  const benchY = y - Math.max(2, Math.round(h * 0.35));
  ctx.fillRect(left + Math.round(w * 0.15), benchY, Math.round(w * 0.5), Math.max(1, Math.round(h * 0.08)));

  const poleX = side < 0 ? left + Math.round(w * 0.08) : left + Math.round(w * 0.92);
  const poleW = Math.max(1, Math.round(w * 0.04));
  ctx.fillStyle = postCol;
  ctx.fillRect(poleX, topY + Math.round(h * 0.1), poleW, Math.round(h * 0.9));

  const boardW = Math.max(3, Math.round(w * 0.18));
  const boardH = Math.max(4, Math.round(h * 0.3));
  const boardX = poleX - Math.floor(boardW * 0.5);
  const boardY = topY + Math.round(h * 0.35);

  ctx.fillStyle = blendDetail(postCol, fogColor('#fff4cc', fogFactor, true), tDetail);
  ctx.fillRect(boardX, boardY, boardW, boardH);

  if (boardW >= 6 && boardH >= 6 && tDetail > 0.45) {
    ctx.fillStyle = fogColor('#100d1c', fogFactor, false);
    ctx.fillRect(boardX + 1, boardY + 2, boardW - 2, 1);
    ctx.fillRect(boardX + 1, boardY + 4, boardW - 2, 1);
  }

  const discR = Math.max(2, Math.round(w * 0.08));
  const discY = topY + Math.round(h * 0.1);
  ctx.fillStyle = fogColor('#00f5d4', fogFactor, true);
  ctx.fillRect(poleX - discR + Math.floor(poleW * 0.5), discY - discR, discR * 2, discR * 2);
}

// ---------------------------------------------------------------------------
// 18. HIGHWAY PARKING AREA CANOPY (PA Shelter)
// ---------------------------------------------------------------------------
function drawCanopy(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  ppu: number,
  variant: number,
  fogFactor = 0,
): void {
  if (ppu <= 0 || !Number.isFinite(ppu)) return;

  const w = Math.max(12, Math.round(4800 * ppu));
  const h = Math.max(8, Math.round(2600 * ppu));
  const left = Math.round(x - w * 0.5);
  const topY = Math.round(y - h);
  const v = Math.abs(variant) % 3;
  const roofBodyCol = fogColor('#251c3a', fogFactor, false);
  const postCol = fogColor('#181326', fogFactor, false);
  const neonCol = fogColor(v === 0 ? '#00f5d4' : v === 1 ? '#ff007f' : '#ffd166', fogFactor, true);
  const isAtmospheric = fogFactor >= ATMOSPHERE_SILHOUETTE_ONLY;
  const tDetail = isAtmospheric ? 0 : detailFactor(ppu, 0.0085, 0.017);

  if (tDetail <= 0.04) {
    const roofH = Math.max(3, Math.round(h * 0.22));
    ctx.fillStyle = roofBodyCol;
    ctx.fillRect(left, topY, w, roofH);
    ctx.fillStyle = neonCol;
    ctx.fillRect(left, topY, w, Math.max(1, Math.round(roofH * 0.45)));
    ctx.fillStyle = postCol;
    ctx.fillRect(left + Math.round(w * 0.12), topY + roofH, Math.max(1, Math.round(w * 0.05)), h - roofH);
    ctx.fillRect(left + Math.round(w * 0.83), topY + roofH, Math.max(1, Math.round(w * 0.05)), h - roofH);
    return;
  }

  if (tDetail > 0.45 && fogFactor < 0.5) {
    ctx.fillStyle = 'rgba(255, 255, 240, 0.18)';
    ctx.fillRect(left, y - 2, w, Math.max(2, Math.round(h * 0.14)));
  }

  const roofH = Math.max(3, Math.round(h * 0.18));
  const postW = Math.max(1, Math.round(w * 0.03));
  ctx.fillStyle = postCol;
  ctx.fillRect(left + Math.round(w * 0.08), topY + roofH, postW, h - roofH);
  ctx.fillRect(left + Math.round(w * 0.5) - Math.floor(postW * 0.5), topY + roofH, postW, h - roofH);
  ctx.fillRect(left + Math.round(w * 0.92) - postW, topY + roofH, postW, h - roofH);

  ctx.fillStyle = roofBodyCol;
  ctx.fillRect(left, topY, w, roofH);

  ctx.fillStyle = neonCol;
  ctx.fillRect(left, topY, w, Math.max(1, Math.round(roofH * 0.35)));

  ctx.fillStyle = blendDetail(roofBodyCol, fogColor('#ffffff', fogFactor, true), tDetail);
  ctx.fillRect(left + Math.round(w * 0.06), topY + roofH - 1, Math.round(w * 0.88), 1);
}

// ---------------------------------------------------------------------------
// 19. SHINTO SHRINE TORII GATE (Torii)
// ---------------------------------------------------------------------------
function drawTorii(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  ppu: number,
  variant: number,
  fogFactor = 0,
): void {
  if (ppu <= 0 || !Number.isFinite(ppu)) return;

  const w = Math.max(6, Math.round(3000 * ppu));
  const h = Math.max(8, Math.round(3400 * ppu));
  const left = Math.round(x - w * 0.5);
  const topY = Math.round(y - h);
  const vermilion = fogColor(Math.abs(variant) % 2 === 0 ? '#d90429' : '#e63946', fogFactor, true);
  const isAtmospheric = fogFactor >= ATMOSPHERE_SILHOUETTE_ONLY;
  const tDetail = isAtmospheric ? 0 : detailFactor(ppu, 0.0085, 0.017);
  const pillarW = Math.max(1, Math.round(w * 0.08));

  if (tDetail <= 0.04) {
    ctx.fillStyle = vermilion;
    ctx.fillRect(left, topY, w, Math.max(2, Math.round(h * 0.14)));
    ctx.fillRect(left + Math.round(w * 0.18), topY + 1, pillarW, h - 1);
    ctx.fillRect(left + Math.round(w * 0.82) - pillarW, topY + 1, pillarW, h - 1);
    return;
  }

  if (tDetail > 0.45 && fogFactor < 0.5) {
    ctx.fillStyle = 'rgba(8, 2, 20, 0.45)';
    ctx.fillRect(left, y - 1, w, Math.max(2, Math.round(h * 0.08)));
  }

  const p1X = left + Math.round(w * 0.18);
  const p2X = left + Math.round(w * 0.82) - pillarW;

  const baseH = Math.max(2, Math.round(h * 0.06));
  ctx.fillStyle = blendDetail(vermilion, fogColor('#0e0a18', fogFactor, false), tDetail);
  ctx.fillRect(p1X - 1, y - baseH, pillarW + 2, baseH);
  ctx.fillRect(p2X - 1, y - baseH, pillarW + 2, baseH);

  ctx.fillStyle = vermilion;
  ctx.fillRect(p1X, topY + Math.round(h * 0.1), pillarW, h - baseH - Math.round(h * 0.1));
  ctx.fillRect(p2X, topY + Math.round(h * 0.1), pillarW, h - baseH - Math.round(h * 0.1));

  const nukiY = topY + Math.round(h * 0.24);
  const nukiH = Math.max(1, Math.round(h * 0.06));
  ctx.fillStyle = blendDetail(vermilion, fogColor('#ba0022', fogFactor, false), tDetail);
  ctx.fillRect(left + Math.round(w * 0.08), nukiY, Math.round(w * 0.84), nukiH);

  const lintelH = Math.max(2, Math.round(h * 0.1));
  ctx.fillStyle = vermilion;
  ctx.fillRect(left, topY, w, lintelH);

  ctx.fillStyle = blendDetail(vermilion, fogColor('#100c1c', fogFactor, false), tDetail);
  ctx.fillRect(left - 1, topY - 1, w + 2, Math.max(1, Math.round(lintelH * 0.35)));

  if (w >= 12 && tDetail > 0.35) {
    const gakW = Math.max(2, Math.round(w * 0.06));
    ctx.fillStyle = blendDetail(vermilion, fogColor('#ffd166', fogFactor, true), tDetail);
    ctx.fillRect(Math.round(left + (w - gakW) * 0.5), topY + lintelH, gakW, nukiY - (topY + lintelH));
  }
}

// ---------------------------------------------------------------------------
// 20. SHINTO STONE LANTERN (Toro / Ishi-doro)
// ---------------------------------------------------------------------------
function drawToro(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  ppu: number,
  variant: number,
  fogFactor = 0,
): void {
  if (ppu <= 0 || !Number.isFinite(ppu)) return;

  const w = Math.max(3, Math.round(900 * ppu));
  const h = Math.max(5, Math.round(1800 * ppu));
  const left = Math.round(x - w * 0.5);

  const isSlate = Math.abs(variant) % 2 === 1;
  const stoneDark = fogColor(isSlate ? '#1e1c28' : '#272233', fogFactor, false);
  const stoneMed = fogColor(isSlate ? '#383247' : '#443c54', fogFactor, false);
  const stoneLight = fogColor(isSlate ? '#564f69' : '#685f7d', fogFactor, false);
  const isAtmospheric = fogFactor >= ATMOSPHERE_SILHOUETTE_ONLY;
  const tDetail = isAtmospheric ? 0 : detailFactor(ppu, 0.0085, 0.017);

  if (tDetail <= 0.04) {
    ctx.fillStyle = stoneMed;
    ctx.fillRect(left, y - h, w, h);
    ctx.fillStyle = fogColor('#ffbe0b', fogFactor, true);
    ctx.fillRect(
      left + Math.floor(w * 0.25),
      y - Math.round(h * 0.72),
      Math.max(1, Math.round(w * 0.5)),
      Math.max(1, Math.round(h * 0.22)),
    );
    return;
  }

  if (w >= 4 && tDetail > 0.45 && fogFactor < 0.5) {
    ctx.fillStyle = 'rgba(255, 190, 11, 0.22)';
    ctx.fillRect(left - 2, y - 1, w + 4, Math.max(2, Math.round(h * 0.09)));
  }

  const baseH = Math.max(1, Math.round(h * 0.12));
  ctx.fillStyle = stoneDark;
  ctx.fillRect(left + 1, y - baseH, w - 2, baseH);

  const postW = Math.max(1, Math.round(w * 0.35));
  const postH = Math.max(2, Math.round(h * 0.34));
  ctx.fillStyle = stoneMed;
  ctx.fillRect(Math.round(left + (w - postW) * 0.5), y - baseH - postH, postW, postH);

  const midH = Math.max(1, Math.round(h * 0.08));
  const midY = y - baseH - postH - midH;
  ctx.fillStyle = stoneLight;
  ctx.fillRect(left, midY, w, midH);

  const fireH = Math.max(2, Math.round(h * 0.2));
  const fireW = Math.max(2, Math.round(w * 0.65));
  const fireY = midY - fireH;
  const fireX = Math.round(left + (w - fireW) * 0.5);

  ctx.fillStyle = stoneDark;
  ctx.fillRect(fireX, fireY, fireW, fireH);

  ctx.fillStyle = fogColor('#ffe066', fogFactor, true);
  ctx.fillRect(fireX + 1, fireY + 1, Math.max(1, fireW - 2), Math.max(1, fireH - 2));

  const roofH = Math.max(2, Math.round(h * 0.16));
  const roofY = fireY - roofH;
  ctx.fillStyle = stoneLight;
  ctx.fillRect(left - 1, roofY + Math.round(roofH * 0.5), w + 2, Math.round(roofH * 0.5));
  ctx.fillRect(left + 1, roofY, w - 2, Math.round(roofH * 0.5));

  const hojuSize = Math.max(1, Math.round(w * 0.25));
  ctx.fillStyle = stoneMed;
  ctx.fillRect(Math.round(left + (w - hojuSize) * 0.5), roofY - hojuSize, hojuSize, hojuSize);
}

// ---------------------------------------------------------------------------
// Main Router
// ---------------------------------------------------------------------------
function drawFogAwareProp(
  ctx: CanvasRenderingContext2D,
  kind: PropKind,
  x: number,
  y: number,
  ppu: number,
  side: number,
  variant: number,
  beatPulse: number,
  fogFactor: number,
): boolean {
  switch (kind) {
    case 'palm':
      drawPalm(ctx, x, y, ppu, side, variant, fogFactor);
      return true;
    case 'street-tree':
      drawStreetTree(ctx, x, y, ppu, side, variant, fogFactor);
      return true;
    case 'pine':
      drawPine(ctx, x, y, ppu, side, variant, fogFactor);
      return true;
    case 'lamp':
      drawLamp(ctx, x, y, ppu, side, fogFactor);
      return true;
    case 'billboard':
      drawBillboard(ctx, x, y, ppu, variant, fogFactor);
      return true;
    case 'building':
      drawBuilding(ctx, x, y, ppu, side, variant, fogFactor);
      return true;
    case 'gantry':
      drawGantry(ctx, x, y, ppu, fogFactor);
      return true;
    case 'overpass':
      drawOverpass(ctx, x, y, ppu, variant, beatPulse, fogFactor);
      return true;
    case 'suspension-tower':
      drawSuspensionTower(ctx, x, y, ppu, variant, beatPulse, fogFactor);
      return true;
    case 'pylon':
      drawPylon(ctx, x, y, ppu, variant, fogFactor);
      return true;
    default:
      return false;
  }
}

export function drawProp(
  ctx: CanvasRenderingContext2D,
  kind: PropKind,
  x: number,
  y: number,
  ppu: number,
  side: number,
  variant: number,
  beatPulse = 0,
  beatIndex = 0,
  clipY = Number.POSITIVE_INFINITY,
  fogFactor = 0,
): void {
  // Abstract kinds fallback resolution if called directly without upstream resolution
  if (kind === 'tree') {
    kind = activePropTheme ? activePropTheme.tree : 'palm';
  }
  if (ppu <= 0 || !Number.isFinite(ppu)) return;
  if (y - getPropWorldHeight(kind) * ppu >= clipY) return;

  if (drawFogAwareProp(ctx, kind, x, y, ppu, side, variant, beatPulse, fogFactor)) {
    return;
  }

  switch (kind) {
    case 'jihanki':
      drawJihanki(ctx, x, y, ppu, variant, fogFactor);
      break;
    case 'phonebooth':
      drawPhonebooth(ctx, x, y, ppu, fogFactor);
      break;
    case 'vms':
      drawVMS(ctx, x, y, ppu, variant, beatPulse, fogFactor);
      break;
    case 'chevron':
      drawChevron(ctx, x, y, ppu, side, variant, beatPulse, beatIndex, fogFactor);
      break;
    case 'shrub':
      drawShrub(ctx, x, y, ppu, variant, fogFactor);
      break;
    case 'sign':
      drawSign(ctx, x, y, ppu, side, variant, fogFactor);
      break;
    case 'kiosk':
      drawKiosk(ctx, x, y, ppu, side, variant, fogFactor);
      break;
    case 'bench':
      drawBench(ctx, x, y, ppu, variant, fogFactor);
      break;
    case 'bus-stop':
      drawBusStop(ctx, x, y, ppu, side, variant, fogFactor);
      break;
    case 'canopy':
      drawCanopy(ctx, x, y, ppu, variant, fogFactor);
      break;
    case 'torii':
      drawTorii(ctx, x, y, ppu, variant, fogFactor);
      break;
    case 'toro':
      drawToro(ctx, x, y, ppu, variant, fogFactor);
      break;
  }
}
