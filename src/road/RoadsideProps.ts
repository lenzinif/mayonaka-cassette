import type { SceneryTheme } from './palette';
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

export function setPropAtmosphere(
  fogColor: string,
  silhouetteColor: string,
  accentColor: string,
): void {
  activeAtmosphereFog = fogColor;
  activeAtmosphereSilhouette = silhouetteColor;
  activeAtmosphereAccent = accentColor;
}

export function getPropAtmosphere(): PropAtmosphere {
  return {
    fogColor: activeAtmosphereFog,
    silhouetteColor: activeAtmosphereSilhouette,
    accentColor: activeAtmosphereAccent,
  };
}

// Conservative upper-bound world heights (`pixels / ppu`) for O(1) crest culling (zero GC)
const PROP_WORLD_HEIGHTS: Readonly<Record<PropKind, number>> = {
  bench: 1000,
  shrub: 1400,
  toro: 2100,
  jihanki: 2400,
  billboard: 2700,
  phonebooth: 2800,
  chevron: 2800,
  canopy: 3000,
  lamp: 3100,
  kiosk: 3100,
  'street-tree': 3200,
  'bus-stop': 3200,
  sign: 3600,
  pine: 3800,
  torii: 3800,
  vms: 4200,
  palm: 4800,
  tree: 4800,
  gantry: 5200,
  overpass: 7600,
  'suspension-tower': 10200,
  pylon: 11000,
  building: 12800,
};

/** Returns conservative upper-bound prop height in world units (`pixels / ppu`). */
export function getPropWorldHeight(kind: PropKind): number {
  return PROP_WORLD_HEIGHTS[kind] ?? 4800;
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

const VMS_FRAME = '#080414';
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
  const isAtmospheric = fogFactor >= 0.55;

  // Ground shadow pixel pad (near foreground only)
  if (ppu >= 0.018 && trunkW >= 2) {
    ctx.fillStyle = 'rgba(8, 2, 20, 0.55)';
    ctx.fillRect(Math.round(x - trunkW * 1.4), Math.round(y - 1), Math.round(trunkW * 2.8), Math.max(2, Math.round(trunkW * 0.45)));
  }

  const leaf = 1320 * ppu;
  const trunkColor = isAtmospheric ? activeAtmosphereSilhouette : PALM_TRUNK;
  const leafColor = isAtmospheric ? activeAtmosphereAccent : PALM_LEAVES[variant % PALM_LEAVES.length]!;
  const shadeColor = isAtmospheric ? activeAtmosphereSilhouette : PALM_LEAF_SHADE[variant % PALM_LEAF_SHADE.length]!;

  // Tier 0 (Distant Low LOD): rect-only trunk & compact crown
  if (leaf < 14) {
    const midY = Math.round(y - h * 0.5);
    const midX = Math.round(x + lean * 0.25);
    ctx.fillStyle = trunkColor;
    ctx.fillRect(Math.round(x - trunkW * 0.5), midY, Math.max(1, Math.round(trunkW)), Math.max(2, Math.round(h * 0.5)));
    ctx.fillRect(Math.round(midX - trunkW * 0.4), Math.round(topY), Math.max(1, Math.round(trunkW * 0.85)), Math.max(2, Math.round(midY - topY)));
    const cw = Math.max(4, Math.round(leaf * 1.5));
    const ch = Math.max(3, Math.round(leaf * 0.8));
    const cx = Math.round(topX - cw * 0.5);
    const cy = Math.round(topY - ch * 0.4);
    ctx.fillStyle = shadeColor;
    ctx.fillRect(cx, cy + 1, cw, ch);
    ctx.fillStyle = leafColor;
    ctx.fillRect(cx, cy, cw, Math.max(1, ch - 1));
    return;
  }

  // Continuous tapered curved trunk with progressive ring/frond tiers
  const isNearPalm = leaf >= 32;
  const isMidNearPalm = leaf >= 22;
  const rings = isNearPalm ? (trunkW >= 5 ? 6 : 4) : isMidNearPalm ? 3 : 2;
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
    ctx.fillStyle = isAtmospheric ? trunkColor : r % 2 === 0 ? PALM_TRUNK : '#2c1447';
    ctx.beginPath();
    ctx.moveTo(x0 - w0 * 0.5, y0);
    ctx.lineTo(x1 - w1 * 0.5, y1);
    ctx.lineTo(x1 + w1 * 0.5, y1);
    ctx.lineTo(x0 + w0 * 0.5, y0);
    ctx.closePath();
    ctx.fill();

    // Highlight ridge along inner or outer curve (near LOD only)
    if (isNearPalm && !isAtmospheric && (w0 >= 3.5 || w1 >= 3.5)) {
      ctx.fillStyle = PALM_TRUNK_LIGHT;
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
  if (isNearPalm && trunkW >= 3) {
    const cocoR = Math.max(2, Math.round(trunkW * 0.55));
    ctx.fillStyle = isAtmospheric ? trunkColor : '#240b36';
    ctx.fillRect(Math.round(topX - cocoR), Math.round(topY - cocoR * 0.4), cocoR * 2, cocoR);
  }

  const fronds = isNearPalm ? 6 : isMidNearPalm ? 5 : 4;
  const steps = isNearPalm ? 3 : 2;
  for (let i = 0; i < fronds; i++) {
    const a = -Math.PI + (i / Math.max(1, fronds - 1)) * Math.PI;
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
      ctx.fillStyle = shadeColor;
      ctx.fillRect(bx, py + 1, blockW, blockH);
      ctx.fillStyle = leafColor;
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
  const rx = Math.round(x);
  const ry = Math.round(y);
  const topY = Math.round(y - h);
  const isAtmospheric = fogFactor >= 0.55;

  const v = Math.abs(Math.floor(variant)) % STREET_TREE_CROWN_BODY.length;
  const trunkCol = isAtmospheric ? activeAtmosphereSilhouette : STREET_TREE_TRUNK;
  const crownBody = isAtmospheric ? activeAtmosphereAccent : STREET_TREE_CROWN_BODY[v]!;
  const crownShade = isAtmospheric ? activeAtmosphereSilhouette : STREET_TREE_CROWN_SHADE[v]!;
  const crownRim = isAtmospheric ? activeAtmosphereAccent : STREET_TREE_CROWN_RIM[v]!;

  // Tier 0 (Distant Low LOD): compact 3-rect silhouette for distant city verge
  if (h < 28) {
    const trunkW = 1;
    const crownW = Math.max(3, Math.round(h * 0.7));
    const crownH = Math.max(3, Math.round(h * 0.65));
    ctx.fillStyle = trunkCol;
    ctx.fillRect(rx, Math.round(y - h * 0.45), trunkW, Math.round(h * 0.45));
    ctx.fillStyle = crownShade;
    ctx.fillRect(Math.round(x - crownW * 0.5), topY + 1, crownW, crownH);
    ctx.fillStyle = crownBody;
    ctx.fillRect(Math.round(x - crownW * 0.5), topY, crownW, Math.max(1, crownH - 1));
    return;
  }

  // Tier 1 (Mid-Far LOD): trunk + layered dome (no rim highlight or planter box yet)
  if (h < 48) {
    const trunkW = Math.max(2, Math.round(110 * ppu));
    const trunkH = Math.max(4, Math.round(h * 0.42));
    ctx.fillStyle = trunkCol;
    ctx.fillRect(Math.round(x - trunkW * 0.5), ry - trunkH, trunkW, trunkH);
    const crownW = Math.max(6, Math.round(2200 * ppu));
    const crownH = Math.max(5, Math.round(1800 * ppu));
    const crownLeft = Math.round(x - crownW * 0.5);
    ctx.fillStyle = crownShade;
    ctx.fillRect(crownLeft, Math.round(topY + crownH * 0.35), crownW, Math.round(crownH * 0.65));
    ctx.fillStyle = crownBody;
    ctx.fillRect(crownLeft + 1, topY, Math.max(1, crownW - 2), Math.round(crownH * 0.65));
    return;
  }

  // Tier 2 (Mid-Near LOD): adds top canopy moonlight rim & sidewalk planter box
  if (h < 68) {
    const planterW = Math.max(4, Math.round(540 * ppu));
    const planterH = Math.max(2, Math.round(70 * ppu));
    const planterLeft = Math.round(x - planterW * 0.5);
    const planterTop = ry - planterH;
    ctx.fillStyle = STREET_TREE_PLANTER;
    ctx.fillRect(planterLeft, planterTop, planterW, planterH);
    ctx.fillStyle = STREET_TREE_PLANTER_RIM;
    ctx.fillRect(planterLeft, planterTop, planterW, 1);
    const trunkW = Math.max(2, Math.round(110 * ppu));
    const trunkH = Math.max(4, Math.round(h * 0.42));
    ctx.fillStyle = trunkCol;
    ctx.fillRect(Math.round(x - trunkW * 0.5), planterTop - trunkH, trunkW, trunkH);
    const crownW = Math.max(6, Math.round(2200 * ppu));
    const crownH = Math.max(5, Math.round(1800 * ppu));
    const crownLeft = Math.round(x - crownW * 0.5);
    ctx.fillStyle = crownShade;
    ctx.fillRect(crownLeft, Math.round(topY + crownH * 0.35), crownW, Math.round(crownH * 0.65));
    ctx.fillStyle = crownBody;
    ctx.fillRect(crownLeft + 1, topY, Math.max(1, crownW - 2), Math.round(crownH * 0.65));
    ctx.fillStyle = crownRim;
    ctx.fillRect(Math.round(x - crownW * 0.25), topY, Math.round(crownW * 0.5), 1);
    return;
  }

  // 1. Sidewalk Planter Curb & Ground Light Ring (cast by street lamps / car lights)
  const planterW = Math.max(4, Math.round(540 * ppu));
  const planterH = Math.max(2, Math.round(70 * ppu));
  const glowW = Math.round(planterW * 1.7);

  // Street ambient glow pool under tree (only in foreground ppu >= 0.018)
  if (ppu >= 0.018) {
    ctx.fillStyle = STREET_TREE_GROUND_GLOW;
    ctx.fillRect(
      Math.round(x - glowW * 0.5),
      ry - 1,
      glowW,
      Math.max(2, Math.round(planterH * 0.8)),
    );
  }

  // Planter concrete box
  const planterLeft = Math.round(x - planterW * 0.5);
  const planterTop = ry - planterH;
  ctx.fillStyle = STREET_TREE_PLANTER;
  ctx.fillRect(planterLeft, planterTop, planterW, planterH);

  // Concrete curb highlight rim
  ctx.fillStyle = STREET_TREE_PLANTER_RIM;
  ctx.fillRect(planterLeft, planterTop, planterW, 1);

  // Soil / tree grate inner inset
  if (planterW >= 8) {
    const grateW = Math.round(planterW * 0.75);
    ctx.fillStyle = '#110b1a';
    ctx.fillRect(Math.round(x - grateW * 0.5), planterTop + 1, grateW, Math.max(1, planterH - 1));
  }

  // 2. Trunk & Branch Forks
  const trunkW = Math.max(2, Math.round(110 * ppu));
  const trunkH = Math.max(4, Math.round(h * 0.42));
  const trunkX = Math.round(x - trunkW * 0.5);
  const trunkY = ry - planterH - trunkH;

  // Trunk body
  ctx.fillStyle = STREET_TREE_TRUNK;
  ctx.fillRect(trunkX, trunkY, trunkW, trunkH);

  // Trunk light edge facing the road (using `side`)
  if (trunkW >= 3) {
    ctx.fillStyle = STREET_TREE_TRUNK_LIGHT;
    const hiW = Math.max(1, Math.round(trunkW * 0.35));
    const hiX = side < 0 ? trunkX + trunkW - hiW : trunkX;
    ctx.fillRect(hiX, trunkY, hiW, trunkH);
  }

  // Branch forks into lower canopy
  if (trunkW >= 4) {
    ctx.fillStyle = STREET_TREE_TRUNK;
    const bW = Math.max(2, Math.round(trunkW * 0.6));
    const bH = Math.max(2, Math.round(trunkW * 0.8));
    ctx.fillRect(Math.round(x - trunkW * 1.2), trunkY - bH + 1, bW, bH);
    ctx.fillRect(Math.round(x + trunkW * 0.6), trunkY - bH + 1, bW, bH);
  }

  // 3. Rounded Crown (Ginkgo / Zelkova multi-dome canopy)
  const crownW = Math.max(6, Math.round(2200 * ppu));
  const crownH = Math.max(5, Math.round(1800 * ppu));
  const crownTop = ry - h;
  const crownLeft = Math.round(x - crownW * 0.5);

  // Low LOD crown (< 24px wide)
  if (crownW < 24) {
    ctx.fillStyle = crownShade;
    ctx.fillRect(crownLeft, Math.round(crownTop + crownH * 0.35), crownW, Math.round(crownH * 0.65));
    ctx.fillStyle = crownBody;
    ctx.fillRect(crownLeft + 1, crownTop, Math.max(1, crownW - 2), Math.round(crownH * 0.65));
    ctx.fillStyle = crownRim;
    ctx.fillRect(Math.round(x - crownW * 0.25), crownTop, Math.round(crownW * 0.5), 1);
    return;
  }

  // Full detailed multi-dome zelkova crown:
  // Lower deep shadow underside
  ctx.fillStyle = crownShade;
  ctx.fillRect(
    Math.round(crownLeft + crownW * 0.08),
    Math.round(crownTop + crownH * 0.45),
    Math.round(crownW * 0.84),
    Math.round(crownH * 0.55),
  );
  // Left and right lower rounded lobes (shadow)
  ctx.fillRect(
    crownLeft,
    Math.round(crownTop + crownH * 0.35),
    Math.round(crownW * 0.35),
    Math.round(crownH * 0.45),
  );
  ctx.fillRect(
    Math.round(crownLeft + crownW * 0.65),
    Math.round(crownTop + crownH * 0.35),
    Math.round(crownW * 0.35),
    Math.round(crownH * 0.45),
  );

  // Main illuminated foliage body
  ctx.fillStyle = crownBody;
  // Central dome
  ctx.fillRect(
    Math.round(crownLeft + crownW * 0.15),
    crownTop,
    Math.round(crownW * 0.7),
    Math.round(crownH * 0.7),
  );
  // Left illuminated shoulder lobe
  ctx.fillRect(
    crownLeft,
    Math.round(crownTop + crownH * 0.2),
    Math.round(crownW * 0.4),
    Math.round(crownH * 0.45),
  );
  // Right illuminated shoulder lobe
  ctx.fillRect(
    Math.round(crownLeft + crownW * 0.6),
    Math.round(crownTop + crownH * 0.2),
    Math.round(crownW * 0.4),
    Math.round(crownH * 0.45),
  );
  // Upper central rounded crest
  ctx.fillRect(
    Math.round(crownLeft + crownW * 0.28),
    crownTop - Math.max(1, Math.round(crownH * 0.08)),
    Math.round(crownW * 0.44),
    Math.round(crownH * 0.3),
  );

  // Top highlight rims catching streetlamp glow
  ctx.fillStyle = crownRim;
  ctx.fillRect(
    Math.round(crownLeft + crownW * 0.32),
    crownTop - Math.max(1, Math.round(crownH * 0.08)),
    Math.round(crownW * 0.36),
    Math.max(1, Math.round(2 * ppu)),
  );
  ctx.fillRect(
    Math.round(crownLeft + crownW * 0.08),
    Math.round(crownTop + crownH * 0.2),
    Math.round(crownW * 0.22),
    1,
  );
  ctx.fillRect(
    Math.round(crownLeft + crownW * 0.7),
    Math.round(crownTop + crownH * 0.2),
    Math.round(crownW * 0.22),
    1,
  );
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
  const rx = Math.round(x);
  const ry = Math.round(y);
  const topY = Math.round(y - h);
  const isAtmospheric = fogFactor >= 0.55;

  const v = Math.abs(Math.floor(variant)) % PINE_CROWN_BODY.length;
  const trunkCol = isAtmospheric ? activeAtmosphereSilhouette : PINE_TRUNK;
  const pineBody = isAtmospheric ? activeAtmosphereAccent : PINE_CROWN_BODY[v]!;
  const pineShade = isAtmospheric ? activeAtmosphereSilhouette : PINE_CROWN_SHADE[v]!;
  const pineRim = isAtmospheric ? activeAtmosphereAccent : PINE_CROWN_RIM[v]!;

  // Tier 0 (Distant Low LOD): stepped pagoda/triangle silhouette for far touge hillside
  if (h < 28) {
    const trunkW = 1;
    ctx.fillStyle = trunkCol;
    ctx.fillRect(rx, topY + Math.round(h * 0.5), trunkW, Math.round(h * 0.5));
    // Tier 1
    const w1 = Math.max(2, Math.round(h * 0.7));
    ctx.fillStyle = pineShade;
    ctx.fillRect(Math.round(x - w1 * 0.5), topY + Math.round(h * 0.5), w1, Math.round(h * 0.25));
    // Tier 2
    const w2 = Math.max(2, Math.round(h * 0.45));
    ctx.fillStyle = pineBody;
    ctx.fillRect(Math.round(x - w2 * 0.5), topY + Math.round(h * 0.25), w2, Math.round(h * 0.25));
    // Apex
    const w3 = Math.max(1, Math.round(h * 0.2));
    ctx.fillStyle = pineRim;
    ctx.fillRect(Math.round(x - w3 * 0.5), topY, w3, Math.round(h * 0.25));
    return;
  }

  // Tier 1 (Mid-Far LOD): rect trunk & 3 cloud tiers (no moonlight rim yet)
  if (h < 48) {
    const trunkW = Math.max(1, Math.round(110 * ppu));
    ctx.fillStyle = trunkCol;
    ctx.fillRect(Math.round(x - trunkW * 0.5), topY + Math.round(h * 0.35), trunkW, Math.round(h * 0.65));
    for (let i = 0; i < 3; i++) {
      const tier = PINE_TIERS[i]!;
      const padW = Math.max(4, Math.round(tier[1] * ppu));
      const padH = Math.max(2, Math.round(tier[2] * ppu));
      const padY = Math.round(ry - h * tier[0]);
      const padLeft = Math.round(x - padW * 0.5);
      ctx.fillStyle = pineShade;
      ctx.fillRect(padLeft, Math.round(padY - padH * 0.35), padW, Math.round(padH * 0.65));
      ctx.fillStyle = pineBody;
      ctx.fillRect(padLeft + 1, Math.round(padY - padH * 0.85), Math.max(2, padW - 2), Math.round(padH * 0.65));
    }
    return;
  }

  // Tier 2 (Mid-Near LOD): adds 4th cloud tier & moonlight rim highlight
  if (h < 68) {
    const trunkW = Math.max(1, Math.round(110 * ppu));
    ctx.fillStyle = trunkCol;
    ctx.fillRect(Math.round(x - trunkW * 0.5), topY + Math.round(h * 0.35), trunkW, Math.round(h * 0.65));
    for (let i = 0; i < PINE_TIERS.length; i++) {
      const tier = PINE_TIERS[i]!;
      const padW = Math.max(4, Math.round(tier[1] * ppu));
      const padH = Math.max(2, Math.round(tier[2] * ppu));
      const padY = Math.round(ry - h * tier[0]);
      const padLeft = Math.round(x - padW * 0.5);
      ctx.fillStyle = pineShade;
      ctx.fillRect(padLeft, Math.round(padY - padH * 0.35), padW, Math.round(padH * 0.65));
      ctx.fillStyle = pineBody;
      ctx.fillRect(padLeft + 1, Math.round(padY - padH * 0.85), Math.max(2, padW - 2), Math.round(padH * 0.65));
      ctx.fillStyle = pineRim;
      ctx.fillRect(Math.round(x - padW * 0.3), Math.round(padY - padH * 0.85), Math.max(2, Math.round(padW * 0.6)), 1);
    }
    return;
  }

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

  // 2. Gnarled / Curving Pine Trunk (windswept towards road or mountain slope)
  const leanDir = variant % 2 === 0 ? (side < 0 ? 1 : -1) : (side < 0 ? -1 : 1);
  const lean = 320 * ppu * leanDir;
  const trunkW = Math.max(2, Math.round(115 * ppu));

  // Trunk sections visible up through the tiered canopy
  const segs = 3;
  for (let s = 0; s < segs; s++) {
    const t0 = s / segs;
    const t1 = (s + 1) / segs;
    const x0 = x + lean * t0 * 0.6;
    const y0 = ry - h * 0.75 * t0;
    const x1 = x + lean * t1 * 0.6;
    const y1 = ry - h * 0.75 * t1;
    const w = Math.max(1, trunkW * (1.1 - t0 * 0.35));

    ctx.fillStyle = PINE_TRUNK;
    ctx.beginPath();
    ctx.moveTo(x0 - w * 0.5, y0);
    ctx.lineTo(x1 - w * 0.5, y1);
    ctx.lineTo(x1 + w * 0.5, y1);
    ctx.lineTo(x0 + w * 0.5, y0);
    ctx.closePath();
    ctx.fill();

    // Trunk highlight edge
    if (w >= 3) {
      ctx.fillStyle = PINE_TRUNK_LIGHT;
      const hw = Math.max(1, Math.round(w * 0.3));
      ctx.fillRect(
        side < 0 ? Math.round(x0 + w * 0.2) : Math.round(x0 - w * 0.5),
        Math.round(y1),
        hw,
        Math.max(1, Math.round(y0 - y1 + 1)),
      );
    }
  }

  // 3. 4 Tiered Horizontal Cloud Pads (Classic Japanese Niwaki Pagoda tiers)
  for (let i = 0; i < PINE_TIERS.length; i++) {
    const tier = PINE_TIERS[i]!;
    const relY = tier[0];
    const spanW = tier[1];
    const spanH = tier[2];
    const xShift = tier[3] * leanDir;

    const padW = Math.max(4, Math.round(spanW * ppu));
    const padH = Math.max(3, Math.round(spanH * ppu));
    const padX = Math.round(x + lean * relY * 0.6 + padW * xShift);
    const padY = Math.round(ry - h * relY);
    const padLeft = Math.round(padX - padW * 0.5);

    // Deep shadow underside of the cloud tier
    ctx.fillStyle = pineShade;
    ctx.fillRect(
      padLeft,
      Math.round(padY - padH * 0.35),
      padW,
      Math.round(padH * 0.65),
    );

    // Dense pine needle foliage body with stepped serrated ends
    ctx.fillStyle = pineBody;
    const bodyInsetX = Math.max(1, Math.round(padW * 0.06));
    ctx.fillRect(
      padLeft + bodyInsetX,
      Math.round(padY - padH * 0.85),
      padW - bodyInsetX * 2,
      Math.round(padH * 0.65),
    );
    // Jagged needle tufts on side edges
    if (padW >= 16) {
      const tuftW = Math.max(2, Math.round(padW * 0.12));
      const tuftH = Math.max(1, Math.round(padH * 0.3));
      ctx.fillRect(padLeft, Math.round(padY - padH * 0.5), tuftW, tuftH);
      ctx.fillRect(padLeft + padW - tuftW, Math.round(padY - padH * 0.5), tuftW, tuftH);
    }

    // Glowing synthwave moonlight rim along the top needle tips
    ctx.fillStyle = pineRim;
    const rimW = Math.max(2, Math.round(padW * 0.65));
    ctx.fillRect(
      Math.round(padX - rimW * 0.5),
      Math.round(padY - padH * 0.85),
      rimW,
      Math.max(1, Math.round(2 * ppu)),
    );
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
  const isAtmospheric = fogFactor >= 0.55;
  const poleCol = isAtmospheric ? activeAtmosphereSilhouette : LAMP_POLE;
  const lightCol = isAtmospheric ? activeAtmosphereAccent : LAMP_LIGHT;

  // Tier 0 (h < 22): 1px pole + 3x1 light point
  if (h < 22) {
    ctx.fillStyle = poleCol;
    ctx.fillRect(rx, topY, 1, Math.max(2, Math.round(h)));
    ctx.fillStyle = lightCol;
    ctx.fillRect(Math.round(rx + arm - 1), topY, 3, 1);
    return;
  }

  // Tier 1 (22 <= h < 42): scaled pole + cantilever arm + lamp head
  if (h < 42) {
    ctx.fillStyle = poleCol;
    ctx.fillRect(Math.round(rx - w * 0.5), topY, w, Math.round(h));
    const armStartX = Math.round(Math.min(rx, rx + arm));
    const armW = Math.max(2, Math.round(Math.abs(arm)));
    ctx.fillRect(armStartX, topY, armW, w);
    const lwMid = Math.max(2, Math.round(280 * ppu));
    ctx.fillStyle = lightCol;
    ctx.fillRect(Math.round(rx + arm - lwMid * 0.5), topY + w, lwMid, Math.max(1, Math.round(75 * ppu)));
    return;
  }

  // Base steel plinth (Tier 2+)
  if (w >= 2) {
    const baseW = w * 2.2;
    const baseH = Math.max(2, Math.round(h * 0.1));
    ctx.fillStyle = isAtmospheric ? activeAtmosphereSilhouette : '#241138';
    ctx.fillRect(Math.round(rx - baseW * 0.5), ry - baseH, Math.round(baseW), baseH);
  }

  // Vertical pole + neon rim highlight (Tier 2+)
  ctx.fillStyle = poleCol;
  ctx.fillRect(Math.round(rx - w * 0.5), topY, w, Math.round(h));
  if (w >= 2) {
    ctx.fillStyle = isAtmospheric ? activeAtmosphereAccent : LAMP_POLE_EDGE;
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

  // Tier 3 (h >= 64 and ppu >= 0.016): diagonal support strut & soft neon glow halos
  if (h >= 64 && ppu >= 0.016) {
    if (w >= 2) {
      ctx.fillRect(
        Math.round(rx + arm * 0.28),
        topY + w,
        Math.max(1, Math.round(Math.abs(arm) * 0.25)),
        w,
      );
    }
    if (lw >= 5) {
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
  const isAtmospheric = fogFactor >= 0.55;
  const frameCol = isAtmospheric ? activeAtmosphereSilhouette : BILLBOARD_FRAME;
  const v = variant % BILLBOARD_FACE.length;
  const faceCol = isAtmospheric ? activeAtmosphereAccent : BILLBOARD_FACE[v]!;

  const leftLegX = Math.round(rx - w * 0.3 - legW * 0.5);
  const rightLegX = Math.round(rx + w * 0.3 - legW * 0.5);
  ctx.fillStyle = frameCol;
  ctx.fillRect(leftLegX, ry - legH, legW, legH);
  ctx.fillRect(rightLegX, ry - legH, legW, legH);

  // Tier 1+ (w >= 18): leg horizontal cross-brace
  if (w >= 18 && legH >= 4) {
    ctx.fillStyle = isAtmospheric ? activeAtmosphereSilhouette : '#3d3358';
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

  // Tier 0 (w < 18): legs + frame + atmospheric/base face panel
  if (w < 18) return;

  // Tier 1 (18 <= w < 34) or atmospheric haze: simple inner accent bands (no bright full artwork)
  if (w < 34 || isAtmospheric) {
    ctx.fillStyle = frameCol;
    const bandH = Math.max(1, Math.round(innerH * 0.14));
    ctx.fillRect(innerX + 2, innerY + Math.round(innerH * 0.3), Math.max(2, Math.round(innerW * 0.6)), bandH);
    ctx.fillRect(innerX + 2, innerY + Math.round(innerH * 0.62), Math.max(2, Math.round(innerW * 0.4)), bandH);
    return;
  }

  // Tier 2 (w >= 34): top floodlights, bottom catwalk & full billboard artwork
  ctx.fillStyle = '#fff3b0';
  ctx.fillRect(Math.round(rx - w * 0.28), top - Math.max(1, Math.round(legW * 0.5)), Math.max(2, legW), Math.max(1, Math.round(legW * 0.5)));
  ctx.fillRect(Math.round(rx + w * 0.22), top - Math.max(1, Math.round(legW * 0.5)), Math.max(2, legW), Math.max(1, Math.round(legW * 0.5)));
  ctx.fillStyle = '#3a1d5c';
  ctx.fillRect(left - 1, top + h, w + 2, Math.max(1, Math.round(legW * 0.5)));

  if (innerW >= 12 && innerH >= 6) {
    if (v === 0) {
      // Melon Soda Cup
      const cupW = Math.max(3, Math.round(innerW * 0.22));
      const cupH = Math.max(4, Math.round(innerH * 0.72));
      const cupX = innerX + Math.round(innerW * 0.1);
      const cupY = innerY + Math.round((innerH - cupH) * 0.5);
      ctx.fillStyle = '#00f59b';
      ctx.fillRect(cupX, cupY, cupW, cupH);
      ctx.fillStyle = '#fff6d6';
      ctx.fillRect(cupX, cupY, cupW, Math.max(1, Math.round(cupH * 0.28)));
      ctx.fillStyle = BILLBOARD_FRAME;
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
      ctx.fillStyle = BILLBOARD_FRAME;
      const barCount = 5;
      const barW = Math.max(1, Math.floor((innerW * 0.7) / barCount) - 1);
      const barHeights = [0.45, 0.8, 0.6, 0.9, 0.5] as const;
      for (let b = 0; b < barCount; b++) {
        const bh = Math.max(2, Math.round(innerH * barHeights[b]!));
        const bx = innerX + Math.round(innerW * 0.15) + b * (barW + Math.max(1, Math.round(barW * 0.35)));
        ctx.fillRect(bx, innerY + innerH - bh, barW, bh);
      }
    } else {
      // Wangan Turbo Sun
      const sunS = Math.max(3, Math.round(innerH * 0.65));
      ctx.fillStyle = '#ff2a6d';
      ctx.fillRect(innerX + Math.round(innerW * 0.12), innerY + Math.round((innerH - sunS) * 0.5), sunS, sunS);
      ctx.fillStyle = BILLBOARD_FRAME;
      for (let i = 1; i <= 3; i++) {
        const sh = Math.max(1, Math.round(innerH * 0.07 * i));
        ctx.fillRect(innerX, innerY + Math.round(innerH * (0.35 + i * 0.15)), innerW, sh);
      }
    }
  } else {
    ctx.fillStyle = BILLBOARD_FRAME;
    for (let i = 1; i <= 3; i++) {
      const sh = Math.max(1, innerH * 0.06 * i);
      ctx.fillRect(innerX, innerY + innerH * (0.35 + i * 0.15), innerW, sh);
    }
  }
}

// ---------------------------------------------------------------------------
// 4. AKIBA URBAN CANYON FACADE & VERTICAL NEON SIGNS (3 Distinct Architectures)
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
  const isAtmospheric = fogFactor >= 0.55;

  if (archVariant === 0) {
    // =========================================================================
    // ARCHITECTURE 1: Akiba Megamart & Arcade with Vertical Neon Blade Sign
    // =========================================================================
    const w = Math.max(6, Math.round(3400 * ppu));
    const h = Math.max(14, Math.round(7600 * ppu));
    const topY = ry - h;
    const left = side < 0 ? rx - w : rx;
    const v = variant % BUILDING_BODY.length;

    // Main Facade Tower
    ctx.fillStyle = isAtmospheric ? activeAtmosphereSilhouette : BUILDING_BODY[v]!;
    ctx.fillRect(left, topY, w, h);

    // Structural edge / pillar on road side
    ctx.fillStyle = isAtmospheric ? activeAtmosphereSilhouette : BUILDING_TRIM[v]!;
    const trimW = Math.max(1, Math.round(w * 0.08));
    ctx.fillRect(side < 0 ? left + w - trimW : left, topY, trimW, h);

    // Roof parapet
    const roofH = Math.max(2, Math.round(h * 0.06));
    ctx.fillRect(left, topY, w, roofH);

    // Usable facade width between trim and outer wall
    const usableW = Math.max(4, w - trimW);
    const facadeLeft = side < 0 ? left : left + trimW;

    // Tier 0 (Far / Atmospheric): compact facade silhouette + single blade accent
    if (h < 48 || w < 26) {
      ctx.fillStyle = isAtmospheric ? activeAtmosphereAccent : BUILDING_SIGN_BG[v]!;
      ctx.fillRect(left, topY + Math.round(h * 0.2), Math.max(2, Math.round(w * 0.16)), Math.max(4, Math.round(h * 0.38)));
      return;
    }

    // Tier 1 (Mid-Far): 2 horizontal window ribbons + main sign block
    if (h < 88 || w < 42) {
      const upperH = h - roofH - Math.round(h * 0.2);
      for (let f = 0; f < 2; f++) {
        const wy = Math.round(topY + roofH + f * (upperH / 2) + upperH * 0.15);
        ctx.fillStyle = isAtmospheric ? activeAtmosphereAccent : f === 0 ? '#ffeaa7' : '#00f5d4';
        ctx.fillRect(facadeLeft + 2, wy, Math.max(2, usableW - 4), Math.max(2, Math.round(upperH * 0.14)));
      }
      ctx.fillStyle = isAtmospheric ? activeAtmosphereAccent : BUILDING_SIGN_BG[v]!;
      ctx.fillRect(left, topY + Math.round(h * 0.2), Math.max(2, Math.round(w * 0.16)), Math.max(4, Math.round(h * 0.38)));
      return;
    }

    // Tier 2 (Mid-Near): ground awning, shopfront, 3 continuous window ribbons, blade sign, rooftop beacon
    if (h < 145 || w < 64 || isAtmospheric) {
      const shopH = Math.max(5, Math.round(h * 0.22));
      const shopY = ry - shopH;
      const awnH = Math.max(2, Math.round(shopH * 0.28));
      ctx.fillStyle = isAtmospheric ? activeAtmosphereAccent : BUILDING_AWNING[v]!;
      ctx.fillRect(left, shopY, w, awnH);
      ctx.fillStyle = isAtmospheric ? activeAtmosphereAccent : '#fff4cc';
      ctx.fillRect(facadeLeft + 2, shopY + awnH + 1, Math.max(3, usableW - 4), Math.max(2, shopH - awnH - 2));

      const upperH = shopY - (topY + roofH);
      for (let f = 0; f < 3; f++) {
        const wy = Math.round(topY + roofH + f * (upperH / 3) + upperH * 0.1);
        ctx.fillStyle = isAtmospheric ? activeAtmosphereAccent : f % 2 === 0 ? '#ffeaa7' : '#00f5d4';
        ctx.fillRect(facadeLeft + 2, wy, Math.max(2, usableW - 4), Math.max(2, Math.round(upperH * 0.12)));
      }
      const signW = Math.max(3, Math.round(w * 0.18));
      const signH = Math.max(8, Math.round(h * 0.44));
      const signY = topY + Math.round(h * 0.16);
      const signX = side < 0 ? left + w - signW + 1 : left - 1;
      ctx.fillStyle = isAtmospheric ? activeAtmosphereAccent : BUILDING_SIGN_BG[v]!;
      ctx.fillRect(signX, signY, signW, signH);
      ctx.fillStyle = isAtmospheric ? activeAtmosphereAccent : '#ff0055';
      ctx.fillRect(left + Math.round(w * 0.5) - 1, topY - 3, 2, 2);
      return;
    }

    // Ground Floor: Illuminated Shopfront / Karaoke / Arcade Awning
    const shopH = Math.max(5, Math.round(h * 0.22));
    const shopY = ry - shopH;
    ctx.fillStyle = '#05030a';
    ctx.fillRect(left, shopY, w, shopH);

    // Glowing shop awning
    const awnH = Math.max(2, Math.round(shopH * 0.28));
    ctx.fillStyle = BUILDING_AWNING[v]!;
    ctx.fillRect(left, shopY, w, awnH);

    // Shop interior warm glow (centered within usable facade)
    ctx.fillStyle = '#fff4cc';
    const shopMargin = Math.max(1, Math.round(usableW * 0.04));
    const shopWindowW = Math.max(4, usableW - shopMargin * 2);
    const shopWindowH = Math.max(3, shopH - awnH - 2);
    const shopWinX = facadeLeft + shopMargin;
    ctx.fillRect(shopWinX, shopY + awnH + 1, shopWindowW, shopWindowH);

    // Window Matrix across Upper Floors (Fixed 5 floors, 3 columns: zero flickering or jumping)
    const upperH = shopY - (topY + roofH);
    const floors = 5;
    const cols = 3;
    const floorStep = upperH / floors;
    const winW = Math.max(2, Math.round(usableW * 0.18));
    const margin = Math.max(2, Math.round(usableW * 0.06));
    const colStep = (usableW - margin * 2 - winW) / (cols - 1);

    for (let f = 0; f < floors; f++) {
      const wy = Math.round(topY + roofH + f * floorStep + floorStep * 0.18);
      const winH = Math.max(2, Math.round(floorStep * 0.55));
      if (wy + winH >= shopY) break;

      for (let c = 0; c < cols; c++) {
        const wx = Math.round(facadeLeft + margin + c * colStep);
        const isLit = (c * 7 + f * 13 + variant) % 3 !== 0;
        if (isLit) {
          ctx.fillStyle = (c + f) % 2 === 0 ? '#ffeaa7' : '#00f5d4';
          ctx.fillRect(wx, wy, winW, winH);
        }
      }
    }

    // Signature Akiba Feature: Cantilevered Vertical Neon Blade Sign on road corner
    const signW = Math.max(3, Math.round(w * 0.18));
    const signH = Math.max(10, Math.round(h * 0.46));
    const signY = topY + Math.round(h * 0.16);
    const signX = side < 0 ? left + w - signW + Math.max(1, Math.round(signW * 0.2)) : left - Math.max(1, Math.round(signW * 0.2));

    ctx.fillStyle = BUILDING_SIGN_BG[v]!;
    ctx.fillRect(signX, signY, signW, signH);

    if (signW >= 5 && signH >= 16) {
      ctx.fillStyle = BUILDING_SIGN_TEXT[v]!;
      const charCount = Math.min(5, Math.floor(signH / (signW * 1.3)));
      const charH = Math.max(2, Math.round(signW * 0.9));
      for (let ch = 0; ch < charCount; ch++) {
        const cy = signY + Math.round(signW * 0.3) + ch * Math.round(signW * 1.3);
        ctx.fillRect(signX + 1, cy, signW - 2, Math.max(1, Math.round(charH * 0.35)));
        ctx.fillRect(signX + Math.floor(signW * 0.35), cy, Math.max(1, Math.round(signW * 0.3)), charH);
        ctx.fillRect(signX + 1, cy + charH - Math.max(1, Math.round(charH * 0.3)), signW - 2, Math.max(1, Math.round(charH * 0.3)));
      }
    }

    // Rooftop antenna & beacon
    const antH = Math.max(3, Math.round(h * 0.18));
    const antX = side < 0 ? left + Math.round(w * 0.3) : left + Math.round(w * 0.7);
    ctx.fillStyle = '#1b1035';
    ctx.fillRect(antX, topY - antH, 1, antH);
    ctx.fillStyle = '#ff0055';
    ctx.fillRect(antX - 1, topY - antH - 1, 2, 2);

  } else if (archVariant === 1) {
    // =========================================================================
    // ARCHITECTURE 2: Shinjuku Cyber-Glass Skyscraper (Torre Vetrata Futuristica)
    // =========================================================================
    const w = Math.max(6, Math.round(3100 * ppu));
    const h = Math.max(18, Math.round(9600 * ppu));
    const topY = ry - h;
    const left = side < 0 ? rx - w : rx;

    // Stepped Setback Crown (Top 26% is narrower)
    const crownH = Math.max(4, Math.round(h * 0.26));
    const setbackW = Math.max(1, Math.round(w * 0.15));
    const crownLeft = side < 0 ? left + setbackW : left;
    const crownW = w - setbackW;

    // Dark sleek high-tech corporate body (constructed additively with zero sky-erasing hack)
    ctx.fillStyle = isAtmospheric ? activeAtmosphereSilhouette : '#070a18';
    ctx.fillRect(left, topY + crownH, w, h - crownH); // Lower main tower body
    ctx.fillRect(crownLeft, topY, crownW, crownH);    // Upper setback crown

    // Tier 0 (Far / Atmospheric): sleek tower silhouette + crown accent (3 rects total)
    if (h < 60 || w < 24) {
      ctx.fillStyle = isAtmospheric ? activeAtmosphereAccent : '#00f5d4';
      ctx.fillRect(crownLeft + Math.round(crownW * 0.2), topY + Math.round(crownH * 0.4), Math.max(2, Math.round(crownW * 0.6)), 2);
      return;
    }

    // Skyscraper Structural Edge Trim (Cobalt Neon)
    ctx.fillStyle = isAtmospheric ? activeAtmosphereSilhouette : '#19284e';
    const trimW = Math.max(1, Math.round(w * 0.05));
    // Full-height trim on straight side
    const straightTrimX = side < 0 ? left + w - trimW : left;
    ctx.fillRect(straightTrimX, topY, trimW, h);
    // Lower body trim on setback side
    const setbackTrimX = side < 0 ? left : left + w - trimW;
    ctx.fillRect(setbackTrimX, topY + crownH, trimW, h - crownH);
    // Crown setback ledge horizontal trim
    ctx.fillRect(side < 0 ? left : left + crownW, topY + crownH, setbackW, Math.max(1, Math.round(trimW * 0.6)));

    // Tier 1 (Mid-Far): 2 continuous ribbon bands + crown bar
    if (h < 105 || w < 38) {
      const availH = h - crownH - Math.round(h * 0.1);
      const bandLeft = left + Math.max(2, Math.round(w * 0.08));
      const bandW = Math.max(2, w - Math.max(4, Math.round(w * 0.16)));
      for (let b = 0; b < 2; b++) {
        const by = Math.round(topY + crownH + Math.round(h * 0.06) + b * (availH / 2));
        ctx.fillStyle = isAtmospheric ? activeAtmosphereAccent : b === 0 ? '#00f5d4' : '#3a86ff';
        ctx.fillRect(bandLeft, by, bandW, Math.max(2, Math.round(availH * 0.14)));
      }
      return;
    }

    // Tier 2 (Mid-Near): 4 continuous ribbon bands & crown beacons (zero 18-rect vertical mullions)
    if (h < 180 || w < 60 || isAtmospheric) {
      const availH = h - crownH - Math.round(h * 0.09);
      const bandLeft = left + Math.max(2, Math.round(w * 0.08));
      const bandW = Math.max(2, w - Math.max(4, Math.round(w * 0.16)));
      for (let b = 0; b < 4; b++) {
        const by = Math.round(topY + crownH + Math.round(h * 0.04) + b * (availH / 4));
        ctx.fillStyle = isAtmospheric ? activeAtmosphereAccent : b % 2 === 0 ? '#00f5d4' : '#3a86ff';
        ctx.fillRect(bandLeft, by, bandW, Math.max(2, Math.round(availH * 0.12)));
      }
      ctx.fillStyle = isAtmospheric ? activeAtmosphereAccent : '#ff0055';
      ctx.fillRect(crownLeft + 1, topY - 2, 2, 2);
      return;
    }

    // Full LOD: 6 Continuous Horizontal Illuminated Ribbon Windows + Mullions + Logo
    {
      const bands = 6;
      const padTop = Math.round(h * 0.04);
      const padBottom = Math.round(h * 0.05);
      const availH = (h - crownH) - padTop - padBottom;
      const bandStep = availH / bands;
      const bandLeft = left + Math.max(2, Math.round(w * 0.08));
      const bandW = w - Math.max(4, Math.round(w * 0.16));

      for (let b = 0; b < bands; b++) {
        const by = Math.round(topY + crownH + padTop + b * bandStep);
        const bandH = Math.max(2, Math.round(bandStep * 0.44));
        if (by + bandH >= ry - Math.round(h * 0.04)) break;

        const isCyan = b % 2 === 0;
        ctx.fillStyle = isCyan ? '#00f5d4' : '#3a86ff';
        ctx.fillRect(bandLeft, by, bandW, bandH);

        // Subtle vertical mullion dividers
        ctx.fillStyle = '#070a18';
        for (let m = 1; m <= 3; m++) {
          ctx.fillRect(bandLeft + Math.round(bandW * (m / 4)), by, 1, bandH);
        }
      }

      // Glowing Corporate Diamond Logo on the Crown
      const logoSize = Math.max(3, Math.round(crownW * 0.24));
      const logoX = Math.round(crownLeft + (crownW - logoSize) * 0.5);
      const logoY = topY + Math.round((crownH - logoSize) * 0.45);
      ctx.fillStyle = '#00f5d4';
      ctx.fillRect(logoX, logoY, logoSize, logoSize);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(logoX + 1, logoY + 1, Math.max(1, logoSize - 2), Math.max(1, logoSize - 2));
    }

    // Twin Aviation Beacons on Crown Rooftop (Red flashing)
    ctx.fillStyle = '#ff0055';
    ctx.fillRect(crownLeft + 1, topY - 2, 2, 2);
    ctx.fillRect(crownLeft + crownW - 3, topY - 2, 2, 2);

    // Spire centered on crown
    const spireX = Math.round(crownLeft + crownW * 0.5);
    const spireH = Math.max(3, Math.round(h * 0.14));
    ctx.fillStyle = '#3a86ff';
    ctx.fillRect(spireX, topY - spireH, 1, spireH);
    ctx.fillStyle = '#ff0055';
    ctx.fillRect(spireX - 1, topY - spireH - 1, 2, 2);

  } else {
    // =========================================================================
    // ARCHITECTURE 3: Showa Retro Commercial Block with Rooftop Kanji Billboard & Fire Escapes
    // =========================================================================
    const w = Math.max(8, Math.round(4100 * ppu));
    const h = Math.max(13, Math.round(6800 * ppu));
    const topY = ry - h;
    const left = side < 0 ? rx - w : rx;

    // Dark brick / concrete Showa building body
    ctx.fillStyle = isAtmospheric ? activeAtmosphereSilhouette : '#181024';
    ctx.fillRect(left, topY, w, h);

    // Tier 0 (Far / Atmospheric): brick mass + rooftop billboard block (2-3 rects)
    if (h < 44 || w < 26) {
      const boardW = Math.max(6, Math.round(w * 0.72));
      const boardH = Math.max(4, Math.round(h * 0.25));
      ctx.fillStyle = isAtmospheric ? activeAtmosphereAccent : '#ff007f';
      ctx.fillRect(left + Math.round((w - boardW) * 0.5), topY - boardH - 1, boardW, boardH);
      return;
    }

    // Tier 1 (Mid-Far): 2 horizontal window ribbons + billboard block
    if (h < 80 || w < 46) {
      ctx.fillStyle = isAtmospheric ? activeAtmosphereAccent : '#ffbe0b';
      ctx.fillRect(left + 3, topY + Math.round(h * 0.22), Math.max(2, w - 6), Math.max(2, Math.round(h * 0.1)));
      ctx.fillRect(left + 3, topY + Math.round(h * 0.54), Math.max(2, w - 6), Math.max(2, Math.round(h * 0.1)));
      const boardW = Math.max(8, Math.round(w * 0.74));
      const boardH = Math.max(5, Math.round(h * 0.25));
      const boardX = left + Math.round((w - boardW) * 0.5);
      const boardY = topY - boardH - 2;
      ctx.fillStyle = isAtmospheric ? activeAtmosphereAccent : '#ff007f';
      ctx.fillRect(boardX, boardY, boardW, boardH);
      return;
    }

    // Tier 2 (Mid-Near): horizontal floor sills, 2 amber window strips, shopfront & inner billboard face
    if (h < 130 || w < 78 || isAtmospheric) {
      ctx.fillStyle = isAtmospheric ? activeAtmosphereSilhouette : '#2c1e40';
      ctx.fillRect(left, topY + Math.round(h * 0.35), w, Math.max(1, Math.round(h * 0.03)));
      ctx.fillRect(left, topY + Math.round(h * 0.7), w, Math.max(1, Math.round(h * 0.03)));
      ctx.fillStyle = isAtmospheric ? activeAtmosphereAccent : '#ffbe0b';
      ctx.fillRect(left + 3, topY + Math.round(h * 0.14), Math.max(2, w - 6), Math.max(2, Math.round(h * 0.09)));
      ctx.fillRect(left + 3, topY + Math.round(h * 0.48), Math.max(2, w - 6), Math.max(2, Math.round(h * 0.09)));
      ctx.fillRect(left + 2, ry - Math.max(3, Math.round(h * 0.16)), Math.max(2, w - 4), Math.max(2, Math.round(h * 0.12)));
      const boardW = Math.max(8, Math.round(w * 0.75));
      const boardH = Math.max(5, Math.round(h * 0.26));
      const boardX = left + Math.round((w - boardW) * 0.5);
      const boardY = topY - boardH - 2;
      ctx.fillStyle = isAtmospheric ? activeAtmosphereAccent : '#ff007f';
      ctx.fillRect(boardX, boardY, boardW, boardH);
      ctx.fillStyle = isAtmospheric ? activeAtmosphereSilhouette : '#ffe600';
      ctx.fillRect(boardX + 2, boardY + Math.round(boardH * 0.25), Math.max(2, boardW - 4), Math.max(2, Math.round(boardH * 0.5)));
      return;
    }

    // Weathered horizontal floor dividing sills
    ctx.fillStyle = '#2c1e40';
    for (let f = 1; f <= 4; f++) {
      ctx.fillRect(left, topY + Math.round(h * (f / 5)), w, Math.max(1, Math.round(h * 0.025)));
    }

    // Fire escape width on outer flank away from traffic
    const escapeW = Math.max(3, Math.round(w * 0.18));
    const escapeX = side < 0 ? left + 2 : left + w - escapeW - 2;

    // Full LOD: Windows, AC boxes, fire escape stairs & kanji billboard
    {
      const rows = 4;
      const cols = 3;
      const winZoneW = w - escapeW - 8;
      const winZoneLeft = side < 0 ? left + escapeW + 5 : left + 3;
      const winW = Math.max(2, Math.round(winZoneW * 0.22));
      const colStep = (winZoneW - winW) / (cols - 1);

      for (let r = 0; r < rows; r++) {
        const floorBaseY = topY + Math.round(h * (r / 5));
        const floorH = Math.round(h * 0.2);
        const winH = Math.max(2, Math.round(floorH * 0.38));
        const wy = floorBaseY + Math.round((floorH - winH) * 0.45);

        for (let c = 0; c < cols; c++) {
          const wx = Math.round(winZoneLeft + c * colStep);
          // Warm interior amber glow
          ctx.fillStyle = (r + c) % 2 === 0 ? '#ffbe0b' : '#ff9e00';
          ctx.fillRect(wx, wy, winW, winH);

          // Protruding grey Air Conditioning box unit below window
          const acW = Math.max(2, Math.round(winW * 0.65));
          const acH = Math.max(1, Math.round(winH * 0.4));
          const acX = wx + Math.round((winW - acW) * 0.5);
          ctx.fillStyle = '#4a3e6b';
          ctx.fillRect(acX, wy + winH, acW, acH);
        }
      }

      // External Steel Zigzag Fire Escape Stairs (on outer flank)
      ctx.fillStyle = '#3a2d52';
      for (let r = 0; r < rows; r++) {
        const platY = topY + Math.round(h * 0.2) + r * Math.round(h * 0.19);
        // Landing platform
        ctx.fillRect(escapeX, platY, escapeW, 2);
        // Diagonal stair rail
        if (r < rows - 1) {
          const nextPlatY = platY + Math.round(h * 0.19);
          ctx.beginPath();
          ctx.moveTo(escapeX, platY);
          ctx.lineTo(escapeX + escapeW, nextPlatY);
          ctx.strokeStyle = '#3a2d52';
          ctx.lineWidth = 1;
          ctx.stroke();
        }
      }

      // Massive Illuminated Rooftop Billboard Frame on Steel Stilts
      const boardW = Math.max(10, Math.round(w * 0.75));
      const boardH = Math.max(6, Math.round(h * 0.28));
      const boardGap = Math.max(2, Math.round(h * 0.05));
      const boardY = topY - boardH - boardGap;
      const boardX = left + Math.round((w - boardW) * 0.5);

      // Steel stilts connected seamlessly from rooftop to billboard bottom
      ctx.fillStyle = '#261b3d';
      const stiltY = topY - boardGap;
      ctx.fillRect(boardX + 2, stiltY, 2, boardGap);
      ctx.fillRect(boardX + boardW - 4, stiltY, 2, boardGap);

      // Billboard face (Vibrant Future Funk Magenta / Gold)
      ctx.fillStyle = '#ff007f';
      ctx.fillRect(boardX, boardY, boardW, boardH);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(boardX + 1, boardY + 1, boardW - 2, boardH - 2);
      ctx.fillStyle = '#ff007f';
      ctx.fillRect(boardX + 2, boardY + 2, boardW - 4, boardH - 4);

      // Japanese Kanji / Katakana stylization: "カセット" (Cassette)
      ctx.fillStyle = '#ffe600';
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
): void {
  const w = Math.max(3, Math.round(1100 * ppu));
  const h = Math.max(5, Math.round(2100 * ppu));
  const left = Math.round(x - w * 0.5);
  const topY = Math.round(y - h);
  const v = variant % JIHANKI_BODY.length;

  // Ground puddle / ambient light reflection
  if (w >= 4) {
    ctx.fillStyle = 'rgba(0, 245, 212, 0.28)';
    ctx.fillRect(left - 2, y - 1, w + 4, Math.max(2, Math.round(h * 0.08)));
  }

  // Cabinet casing
  ctx.fillStyle = JIHANKI_BODY[v]!;
  ctx.fillRect(left, topY, w, h);

  // Accent header band & coin tray base
  ctx.fillStyle = JIHANKI_TRIM[v]!;
  const trimH = Math.max(1, Math.round(h * 0.08));
  ctx.fillRect(left, topY, w, trimH);
  ctx.fillRect(left, y - trimH, w, trimH);

  // Large illuminated glass display showcase
  const winPad = Math.max(1, Math.round(w * 0.1));
  const winX = left + winPad;
  const winY = topY + trimH + winPad;
  const winW = Math.max(2, w - winPad * 2);
  const winH = Math.max(3, Math.round(h * 0.52));

  ctx.fillStyle = '#080514';
  ctx.fillRect(winX, winY, winW, winH);

  // 3-Tier Illuminated Cans (Cold Blue, Hot Red, Melon Soda Green)
  if (winW >= 6 && winH >= 10) {
    const rowH = Math.floor(winH / 3);
    const canW = Math.max(1, Math.floor(winW / 4) - 1);
    const canH = Math.max(2, Math.round(rowH * 0.65));

    // Row 0: Cold Blue Sports Drinks / Boss Iced Coffee
    ctx.fillStyle = '#00bbf9';
    for (let c = 0; c < 4; c++) {
      ctx.fillRect(winX + 1 + c * (canW + 1), winY + 1, canW, canH);
    }
    // Row 1: Hot Red Tea / Georgia Coffee
    ctx.fillStyle = '#ff0054';
    for (let c = 0; c < 4; c++) {
      ctx.fillRect(winX + 1 + c * (canW + 1), winY + rowH + 1, canW, canH);
    }
    // Row 2: Iconic Melon Soda Electric Green
    ctx.fillStyle = '#00f59b';
    for (let c = 0; c < 4; c++) {
      ctx.fillRect(winX + 1 + c * (canW + 1), winY + rowH * 2 + 1, canW, canH);
    }
  } else {
    // Low LOD: single glowing white display glass
    ctx.fillStyle = '#c7f9cc';
    ctx.fillRect(winX, winY, winW, winH);
  }

  // Dispenser flap door & coin return
  const flapW = Math.max(2, Math.round(w * 0.5));
  const flapH = Math.max(1, Math.round(h * 0.14));
  ctx.fillStyle = '#0b081a';
  ctx.fillRect(Math.round(left + (w - flapW) * 0.5), y - trimH - flapH - 1, flapW, flapH);
  ctx.fillStyle = '#ffd166';
  ctx.fillRect(Math.round(left + (w - flapW) * 0.5 + flapW * 0.7), y - trimH - flapH, Math.max(1, Math.round(flapW * 0.2)), Math.max(1, flapH - 1));
}

// ---------------------------------------------------------------------------
// 6. JAPANESE PUBLIC PHONE BOOTH (Koushuu Denwa)
// ---------------------------------------------------------------------------
function drawPhonebooth(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  ppu: number,
): void {
  const w = Math.max(3, Math.round(900 * ppu));
  const h = Math.max(5, Math.round(2500 * ppu));
  const left = Math.round(x - w * 0.5);
  const topY = Math.round(y - h);

  // Ground shadow
  ctx.fillStyle = 'rgba(8, 2, 20, 0.45)';
  ctx.fillRect(left - 1, y - 1, w + 2, Math.max(2, Math.round(h * 0.05)));

  // Metallic frame corners
  ctx.fillStyle = '#181b29';
  ctx.fillRect(left, topY, w, h);

  // Translucent mint-green illuminated glass cabin
  const glassPad = Math.max(1, Math.round(w * 0.12));
  const glassX = left + glassPad;
  const glassY = topY + Math.max(2, Math.round(h * 0.08));
  const glassW = Math.max(2, w - glassPad * 2);
  const glassH = Math.max(3, Math.round(h * 0.78));

  ctx.fillStyle = 'rgba(0, 245, 212, 0.35)';
  ctx.fillRect(glassX, glassY, glassW, glassH);

  // Interior: Emerald green NTT payphone unit on a shelf
  if (glassW >= 5 && glassH >= 12) {
    const shelfY = glassY + Math.round(glassH * 0.55);
    ctx.fillStyle = '#0a0d18';
    ctx.fillRect(glassX, shelfY, glassW, Math.max(1, Math.round(h * 0.04)));

    // Classic green telephone unit
    const phoneW = Math.max(2, Math.round(glassW * 0.55));
    const phoneH = Math.max(3, Math.round(glassH * 0.28));
    ctx.fillStyle = '#00a878';
    ctx.fillRect(Math.round(glassX + (glassW - phoneW) * 0.5), shelfY - phoneH, phoneW, phoneH);

    // Handset receiver
    ctx.fillStyle = '#024d38';
    ctx.fillRect(Math.round(glassX + (glassW - phoneW) * 0.5 - 1), shelfY - phoneH + 1, 1, phoneH - 1);

    // Interior ceiling warm lamp
    ctx.fillStyle = '#fff6cc';
    ctx.fillRect(Math.round(left + w * 0.3), glassY + 1, Math.max(2, Math.round(w * 0.4)), 1);
  }

  // Top header with illuminated 'TELEPHONE' strip
  ctx.fillStyle = '#00f5d4';
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
  // Spans across the entire roadway
  const spanW = Math.max(20, Math.round(6800 * ppu));
  const h = Math.max(12, Math.round(4400 * ppu));
  const legW = Math.max(2, Math.round(180 * ppu));
  const leftLegX = Math.round(x - spanW * 0.5);
  const rightLegX = Math.round(x + spanW * 0.5 - legW);
  const topY = Math.round(y - h);
  const isAtmospheric = fogFactor >= 0.55;
  const steelCol = isAtmospheric ? activeAtmosphereSilhouette : GANTRY_STEEL;
  const signCol = isAtmospheric ? activeAtmosphereAccent : GANTRY_SIGN_GREEN;

  // Dual Vertical Steel Lattice Towers
  ctx.fillStyle = steelCol;
  ctx.fillRect(leftLegX, topY, legW, h);
  ctx.fillRect(rightLegX, topY, legW, h);

  const beamH = Math.max(3, Math.round(520 * ppu));
  const signH = Math.max(4, Math.round(1350 * ppu));
  const signW = Math.max(8, Math.round(spanW * 0.38));
  const signY = topY + beamH + Math.max(1, Math.round(120 * ppu));
  const leftSignX = Math.round(x - signW - spanW * 0.04);
  const rightSignX = Math.round(x + spanW * 0.04);

  // Tier 0 (spanW < 55): 2 legs + beam + 2 green sign rects
  if (spanW < 55) {
    ctx.fillRect(leftLegX, topY, spanW, beamH);
    ctx.fillStyle = signCol;
    ctx.fillRect(leftSignX, signY, signW, signH);
    ctx.fillRect(rightSignX, signY, signW, signH);
    return;
  }

  // Overhead Horizontal Steel Truss Beam + top light highlight (Tier 1+)
  ctx.fillStyle = steelCol;
  ctx.fillRect(leftLegX, topY, spanW, beamH);
  ctx.fillStyle = isAtmospheric ? activeAtmosphereAccent : GANTRY_STEEL_LIGHT;
  ctx.fillRect(leftLegX, topY, spanW, Math.max(1, Math.round(beamH * 0.25)));

  // Left & Right Sign white borders + green faces (Tier 1+)
  const borderCol = isAtmospheric ? activeAtmosphereAccent : GANTRY_SIGN_BORDER;
  ctx.fillStyle = borderCol;
  ctx.fillRect(leftSignX - 1, signY - 1, signW + 2, signH + 2);
  ctx.fillRect(rightSignX - 1, signY - 1, signW + 2, signH + 2);
  ctx.fillStyle = signCol;
  ctx.fillRect(leftSignX, signY, signW, signH);
  ctx.fillRect(rightSignX, signY, signW, signH);

  // Tier 1 (55 <= spanW < 95): skip ground plinths & internal directional glyphs
  if (spanW < 95) return;

  // Tier 2 (spanW >= 95): concrete foundation plinths + white directional arrows & kanji glyphs
  const plinthH = Math.max(2, Math.round(h * 0.08));
  ctx.fillStyle = '#120d22';
  ctx.fillRect(leftLegX - 1, y - plinthH, legW + 2, plinthH);
  ctx.fillRect(rightLegX - 1, y - plinthH, legW + 2, plinthH);

  if (signW >= 16 && signH >= 8) {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(leftSignX + 2, signY + Math.round(signH * 0.25), Math.max(1, Math.round(signW * 0.1)), Math.max(2, Math.round(signH * 0.5)));
    ctx.fillRect(leftSignX + Math.round(signW * 0.2), signY + Math.round(signH * 0.3), Math.max(2, Math.round(signW * 0.45)), Math.max(2, Math.round(signH * 0.4)));
    ctx.fillRect(rightSignX + 2, signY + Math.round(signH * 0.25), Math.max(1, Math.round(signW * 0.1)), Math.max(2, Math.round(signH * 0.5)));
    ctx.fillRect(rightSignX + Math.round(signW * 0.2), signY + Math.round(signH * 0.3), Math.max(2, Math.round(signW * 0.45)), Math.max(2, Math.round(signH * 0.4)));
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
  const isAtmospheric = fogFactor >= 0.55;

  const topY = Math.round(y - totalH);
  const deckBottomY = Math.round(y - clearanceH);
  const leftPillarX = Math.round(x - spanW * 0.5);
  const rightPillarX = Math.round(x + spanW * 0.5 - pillarW);
  const deckSpanW = spanW + Math.max(4, Math.round(400 * ppu));
  const deckX = Math.round(x - deckSpanW * 0.5);
  const railingH = Math.max(2, Math.round(450 * ppu));

  // Distant Low LOD: 2 pillars + deck fascia + parapet top rail (skips shadow, hazard plinths, soffit, and truss loop)
  if (spanW < 95) {
    ctx.fillStyle = isAtmospheric ? activeAtmosphereSilhouette : OVERPASS_CONCRETE_DARK;
    ctx.fillRect(leftPillarX, deckBottomY, pillarW, clearanceH);
    ctx.fillRect(rightPillarX, deckBottomY, pillarW, clearanceH);
    ctx.fillStyle = isAtmospheric
      ? activeAtmosphereSilhouette
      : variant === 1
        ? OVERPASS_STEEL_BLUE
        : OVERPASS_CONCRETE;
    ctx.fillRect(deckX, topY, deckSpanW, deckH);
    ctx.fillStyle = isAtmospheric ? activeAtmosphereAccent : OVERPASS_RAILING;
    ctx.fillRect(deckX, topY - railingH, deckSpanW, railingH);
    return;
  }

  // 1. Asphalt Roadway Shadow underneath the overpass
  const shadowW = Math.max(16, Math.round(5200 * ppu));
  const shadowH = Math.max(2, Math.round(600 * ppu));
  ctx.fillStyle = OVERPASS_SHADOW;
  ctx.fillRect(Math.round(x - shadowW * 0.5), Math.round(y - shadowH * 0.5), shadowW, shadowH);

  // 2. Concrete Abutment Pillars (Left & Right)
  const plinthH = Math.max(2, Math.round(clearanceH * 0.14));
  const plinthW = pillarW + Math.max(2, Math.round(80 * ppu));

  // Left Pillar
  ctx.fillStyle = OVERPASS_CONCRETE_DARK;
  ctx.fillRect(leftPillarX, deckBottomY, pillarW, clearanceH);
  ctx.fillStyle = OVERPASS_CONCRETE;
  ctx.fillRect(leftPillarX + 1, deckBottomY, Math.max(1, Math.round(pillarW * 0.6)), clearanceH);

  // Left Plinth & Hazard stripes
  ctx.fillStyle = OVERPASS_HAZARD_DARK;
  ctx.fillRect(leftPillarX - 1, y - plinthH, plinthW, plinthH);
  if (plinthW >= 6 && plinthH >= 3) {
    ctx.fillStyle = OVERPASS_HAZARD_YELLOW;
    const stripeW = Math.max(2, Math.round(plinthW * 0.28));
    ctx.fillRect(leftPillarX, y - plinthH + 1, stripeW, plinthH - 2);
    ctx.fillRect(leftPillarX + stripeW * 2, y - plinthH + 1, stripeW, plinthH - 2);
  }

  // Right Pillar
  ctx.fillStyle = OVERPASS_CONCRETE_DARK;
  ctx.fillRect(rightPillarX, deckBottomY, pillarW, clearanceH);
  ctx.fillStyle = OVERPASS_CONCRETE;
  ctx.fillRect(rightPillarX + 1, deckBottomY, Math.max(1, Math.round(pillarW * 0.6)), clearanceH);

  // Right Plinth & Hazard stripes
  ctx.fillStyle = OVERPASS_HAZARD_DARK;
  ctx.fillRect(rightPillarX - 1, y - plinthH, plinthW, plinthH);
  if (plinthW >= 6 && plinthH >= 3) {
    ctx.fillStyle = OVERPASS_HAZARD_YELLOW;
    const stripeW = Math.max(2, Math.round(plinthW * 0.28));
    ctx.fillRect(rightPillarX, y - plinthH + 1, stripeW, plinthH - 2);
    ctx.fillRect(rightPillarX + stripeW * 2, y - plinthH + 1, stripeW, plinthH - 2);
  }

  // 3. Underside (Soffit) of the horizontal bridge span
  const soffitH = Math.max(1, Math.round(deckH * 0.22));

  ctx.fillStyle = OVERPASS_CONCRETE_DARK;
  ctx.fillRect(deckX, deckBottomY - soffitH, deckSpanW, soffitH);

  // 4. Horizontal Bridge Deck / Fascia
  if (variant === 1) {
    // Variant 1: Steel Truss Girder Overpass
    ctx.fillStyle = OVERPASS_STEEL_BLUE;
    ctx.fillRect(deckX, topY, deckSpanW, deckH - soffitH);

    // Diagonal steel lattice truss members
    if (deckSpanW >= 40 && deckH >= 8) {
      ctx.fillStyle = OVERPASS_STEEL_TRUSS;
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
    ctx.fillStyle = OVERPASS_CONCRETE;
    ctx.fillRect(deckX, topY, deckSpanW, deckH - soffitH);
    ctx.fillStyle = OVERPASS_CONCRETE_LIGHT;
    ctx.fillRect(deckX, topY, deckSpanW, Math.max(1, Math.round(deckH * 0.2)));

    // Vertical expansion seam lines
    if (deckSpanW >= 40) {
      ctx.fillStyle = OVERPASS_CONCRETE_DARK;
      const seamStep = deckSpanW / 4;
      for (let s = 1; s < 4; s++) {
        ctx.fillRect(Math.round(deckX + s * seamStep), topY, 1, deckH - soffitH);
      }
    }
  }

  // 5. Parapet / Guardrail on top of the bridge deck
  const railingY = topY - railingH;
  ctx.fillStyle = OVERPASS_RAILING;
  ctx.fillRect(deckX, railingY, deckSpanW, railingH);
  ctx.fillStyle = '#b4accf';
  ctx.fillRect(deckX, railingY, deckSpanW, Math.max(1, Math.round(railingH * 0.25)));

  // 6. Variant Specific Upper Deck Features
  if (variant === 0) {
    // Variant 0: Shuto Expressway Exit Sign on the bridge fascia
    const signH = Math.max(3, Math.round(deckH * 0.55));
    const signW = Math.max(10, Math.round(spanW * 0.28));
    const signY = topY + Math.round((deckH - soffitH - signH) * 0.5);
    const signX = Math.round(x - signW * 0.5);

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(signX - 1, signY - 1, signW + 2, signH + 2);
    ctx.fillStyle = OVERPASS_SIGN_GREEN;
    ctx.fillRect(signX, signY, signW, signH);

    // Kanji glyphs on sign (出口 芝浦 SHIBAURA)
    if (signW >= 16 && signH >= 6) {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(signX + 2, signY + Math.round(signH * 0.25), Math.max(1, Math.round(signW * 0.12)), Math.max(2, Math.round(signH * 0.5)));
      ctx.fillRect(signX + Math.round(signW * 0.22), signY + Math.round(signH * 0.3), Math.max(3, Math.round(signW * 0.4)), Math.max(1, Math.round(signH * 0.35)));
      ctx.fillRect(signX + Math.round(signW * 0.7), signY + Math.round(signH * 0.25), Math.max(2, Math.round(signW * 0.22)), Math.max(2, Math.round(signH * 0.5)));
    }

    // Streetlights on top of the bridge deck pointing upwards
    const lampH = Math.max(4, Math.round(900 * ppu));
    const lampPoleW = Math.max(1, Math.round(50 * ppu));
    const lampLeftX = Math.round(x - spanW * 0.25);
    const lampRightX = Math.round(x + spanW * 0.25);

    ctx.fillStyle = '#6e5f94';
    ctx.fillRect(lampLeftX, railingY - lampH, lampPoleW, lampH);
    ctx.fillRect(lampRightX, railingY - lampH, lampPoleW, lampH);
    ctx.fillStyle = OVERPASS_LAMP_GLOW;
    ctx.fillRect(lampLeftX - 1, railingY - lampH - 1, lampPoleW + 2, Math.max(2, Math.round(lampH * 0.35)));
    ctx.fillRect(lampRightX - 1, railingY - lampH - 1, lampPoleW + 2, Math.max(2, Math.round(lampH * 0.35)));
  } else if (variant === 1) {
    // Variant 1: Route shield badge + yellow reflectors
    const shieldW = Math.max(6, Math.round(600 * ppu));
    const shieldH = Math.max(5, Math.round(650 * ppu));
    const shieldX = Math.round(x - shieldW * 0.5);
    const shieldY = topY + Math.round((deckH - soffitH - shieldH) * 0.5);

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(shieldX - 1, shieldY - 1, shieldW + 2, shieldH + 2);
    ctx.fillStyle = '#0052cc'; // Japanese National Route Blue
    ctx.fillRect(shieldX, shieldY, shieldW, shieldH);
    if (shieldW >= 8 && shieldH >= 6) {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(shieldX + Math.round(shieldW * 0.35), shieldY + 1, Math.max(1, Math.round(shieldW * 0.3)), shieldH - 2);
    }
  } else {
    // Variant 2: Cyber-Glass Viaduct with Pulsing Neon Line
    const neonH = Math.max(1, Math.round(150 * ppu));
    const neonCol = beatPulse > 0.4 ? OVERPASS_NEON_PINK : OVERPASS_NEON_CYAN;
    ctx.fillStyle = neonCol;
    ctx.fillRect(deckX, railingY, deckSpanW, neonH);

    // Silhouettes of distant upper traffic lights crossing overhead
    if (deckSpanW >= 30) {
      const carW = Math.max(3, Math.round(400 * ppu));
      const carH = Math.max(2, Math.round(200 * ppu));
      const carY = railingY - carH;

      // Passing car 1 (headlight white)
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(Math.round(x - spanW * 0.18), carY, carW, carH);
      // Passing car 2 (taillight red)
      ctx.fillStyle = '#ff0055';
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
  const spanW = Math.max(24, Math.round(7800 * ppu));
  const towerH = Math.max(22, Math.round(9200 * ppu));
  const legW = Math.max(3, Math.round(440 * ppu));
  const topY = Math.round(y - towerH);
  const isAtmospheric = fogFactor >= 0.55;

  const leftX = Math.round(x - spanW * 0.5);
  const rightX = Math.round(x + spanW * 0.5 - legW);

  // Colors per variant (softened in distant fog)
  const isOrangeWhite = variant === 0;
  const isCyberTitanium = variant === 1;

  const colPrimary = isAtmospheric
    ? activeAtmosphereSilhouette
    : isOrangeWhite
      ? '#ff4800'
      : isCyberTitanium
        ? '#1e1935'
        : '#7b2cbf';
  const colSecondary = isAtmospheric
    ? activeAtmosphereAccent
    : isOrangeWhite
      ? '#f8f9fa'
      : isCyberTitanium
        ? '#00f5d4'
        : '#ff007f';
  const colTruss = isAtmospheric
    ? activeAtmosphereSilhouette
    : isOrangeWhite
      ? '#cc3700'
      : isCyberTitanium
        ? '#2c254d'
        : '#4a1572';

  // 1. Dual Vertical Tapered Towers (Left & Right legs)
  // Drawn with 5 alternating horizontal safety/aviation bands
  const bandCount = 5;
  const bandH = Math.round(towerH / bandCount);

  for (let b = 0; b < bandCount; b++) {
    const bandY = topY + b * bandH;
    const curH = b === bandCount - 1 ? y - bandY : bandH;
    ctx.fillStyle = b % 2 === 0 ? colPrimary : colSecondary;
    ctx.fillRect(leftX, bandY, legW, curH);
    ctx.fillRect(rightX, bandY, legW, curH);
  }

  // Leg inner bevel / 3D shading
  ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
  ctx.fillRect(leftX + Math.round(legW * 0.65), topY, Math.max(1, Math.round(legW * 0.35)), towerH);
  ctx.fillRect(rightX, topY, Math.max(1, Math.round(legW * 0.35)), towerH);

  // Foundation concrete plinths at water level
  const plinthH = Math.max(2, Math.round(1000 * ppu));
  ctx.fillStyle = '#0f0a1c';
  ctx.fillRect(leftX - 2, y - plinthH, legW + 4, plinthH + 4);
  ctx.fillRect(rightX - 2, y - plinthH, legW + 4, plinthH + 4);

  // 2. Horizontal Cross-Struts (Lower, Middle, Upper portal beams)
  const innerSpan = rightX - (leftX + legW);
  if (innerSpan > 10) {
    const beamThick = Math.max(2, Math.round(480 * ppu));

    // Lower portal beam (just above traffic clearance ~4400 ppu)
    const lowerBeamY = Math.round(y - 4400 * ppu);
    ctx.fillStyle = colPrimary;
    ctx.fillRect(leftX + legW, lowerBeamY, innerSpan, beamThick);

    // Middle portal cross-beam (~6600 ppu)
    const midBeamY = Math.round(y - 6600 * ppu);
    ctx.fillStyle = colSecondary;
    ctx.fillRect(leftX + legW, midBeamY, innerSpan, beamThick);

    // Upper cross-beam arch at tower crown (~8600 ppu)
    const upperBeamY = Math.round(y - 8600 * ppu);
    ctx.fillStyle = colPrimary;
    ctx.fillRect(leftX + legW, upperBeamY, innerSpan, beamThick);

    // Diagonal X-bracing truss between middle and upper beams
    if (innerSpan >= 40 && beamThick >= 3) {
      ctx.fillStyle = colTruss;
      const trussThick = Math.max(1, Math.round(100 * ppu));
      const midMidX = Math.round(x);
      ctx.fillRect(midMidX - Math.round(trussThick * 0.5), upperBeamY + beamThick, trussThick, midBeamY - (upperBeamY + beamThick));
    }
  }

  // 3. Sweeping Suspension Cables (Main catenaries & vertical suspenders)
  if (spanW >= 30) {
    const cableCol = isCyberTitanium
      ? (beatPulse > 0.4 ? '#ffffff' : '#00f5d4')
      : isOrangeWhite ? '#fff2c2' : '#ff9eec';
    const cableThick = Math.max(1, Math.round(120 * ppu));
    const leftPeakX = leftX + legW * 0.5;
    const rightPeakX = rightX + legW * 0.5;
    const outerReach = spanW * 0.72;
    const leftAnchorX = leftPeakX - outerReach;
    const rightAnchorX = rightPeakX + outerReach;
    const leftCpX = leftAnchorX + (leftPeakX - leftAnchorX) * 0.58;
    const rightCpX = rightAnchorX - (rightAnchorX - rightPeakX) * 0.58;
    const outerCpY = y - towerH * 0.14;
    const centerCpY = topY + towerH * 0.26;

    if (typeof ctx.quadraticCurveTo === 'function') {
      ctx.strokeStyle = cableCol;
      ctx.lineWidth = cableThick;
      ctx.beginPath();
      // Left outer parabolic back-stay
      ctx.moveTo(leftAnchorX, y);
      ctx.quadraticCurveTo(leftCpX, outerCpY, leftPeakX, topY);
      // Central span catenary curve between tower peaks
      ctx.quadraticCurveTo(x, centerCpY, rightPeakX, topY);
      // Right outer parabolic back-stay
      ctx.quadraticCurveTo(rightCpX, outerCpY, rightAnchorX, y);
      ctx.stroke();
    }

    // Vertical suspender droppers along both outer parabolic catenaries (zero GC)
    ctx.fillStyle = cableCol;
    const suspW = Math.max(1, Math.round(cableThick * 0.7));
    for (let i = 1; i <= 4; i++) {
      const t = i / 5;
      const omt = 1 - t;
      const omt2 = omt * omt;
      const twoT = 2 * omt * t;
      const t2 = t * t;

      const lx = Math.round(omt2 * leftAnchorX + twoT * leftCpX + t2 * leftPeakX);
      const ly = Math.round(omt2 * y + twoT * outerCpY + t2 * topY);
      if (y > ly) {
        ctx.fillRect(lx, ly, suspW, y - ly);
      }

      const rx = Math.round(omt2 * rightPeakX + twoT * rightCpX + t2 * rightAnchorX);
      const ry = Math.round(omt2 * topY + twoT * outerCpY + t2 * y);
      if (y > ry) {
        ctx.fillRect(rx, ry, suspW, y - ry);
      }
    }
  }

  // 4. Red/White Aviation Warning Beacons at Tower Peaks
  const beaconR = Math.max(2, Math.round(250 * ppu));
  const beaconCol = beatPulse > 0.3 ? '#ff0033' : '#ffffff';
  ctx.fillStyle = beaconCol;
  ctx.fillRect(leftX + Math.round(legW * 0.5 - beaconR * 0.5), topY - beaconR * 2, beaconR, beaconR * 2);
  ctx.fillRect(rightX + Math.round(legW * 0.5 - beaconR * 0.5), topY - beaconR * 2, beaconR, beaconR * 2);
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
): void {
  const w = Math.max(12, Math.round(3600 * ppu));
  const h = Math.max(5, Math.round(1600 * ppu));
  const legH = Math.max(3, Math.round(2200 * ppu));
  const legW = Math.max(1, Math.round(110 * ppu));
  const left = Math.round(x - w * 0.5);
  const topY = Math.round(y - legH - h);

  // Support posts
  ctx.fillStyle = GANTRY_STEEL;
  ctx.fillRect(Math.round(x - w * 0.35), y - legH, legW, legH);
  ctx.fillRect(Math.round(x + w * 0.35 - legW), y - legH, legW, legH);

  // Outer display casing
  ctx.fillStyle = VMS_FRAME;
  ctx.fillRect(left, topY, w, h);

  // Dim amber matrix grid
  const pad = Math.max(1, Math.round(w * 0.04));
  const innerX = left + pad;
  const innerY = topY + pad;
  const innerW = w - pad * 2;
  const innerH = h - pad * 2;
  ctx.fillStyle = '#100702';
  ctx.fillRect(innerX, innerY, innerW, innerH);

  // Flashing Twin Hazard Beacons on Top Corners (alternate blink to the beat)
  const beaconR = Math.max(2, Math.round(w * 0.05));
  const flashA = beatPulse > 0.4;
  ctx.fillStyle = flashA ? VMS_LED_BRIGHT : VMS_LED_AMBER;
  ctx.fillRect(left + 2, topY - beaconR, beaconR, beaconR);
  ctx.fillStyle = !flashA ? VMS_LED_BRIGHT : VMS_LED_AMBER;
  ctx.fillRect(left + w - beaconR - 2, topY - beaconR, beaconR, beaconR);

  // Amber LED Matrix Glyphs
  if (innerW >= 16 && innerH >= 6) {
    ctx.fillStyle = VMS_LED_AMBER;
    const v = variant % 4;
    const textH = Math.max(2, Math.round(innerH * 0.32));
    const line1Y = innerY + Math.round(innerH * 0.15);
    const line2Y = innerY + Math.round(innerH * 0.55);

    if (v === 0) {
      // --- TEST MESSAGE: MESSAGGIO DI PROVA / TEST IN CORSO ---
      if (innerW >= 32 && innerH >= 12) {
        ctx.fillStyle = flashA ? VMS_LED_BRIGHT : VMS_LED_AMBER;
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
        ctx.fillStyle = '#100702';
        ctx.fillRect(cx + 1, line1Y + 1, Math.max(1, charW - 2), Math.max(1, charH - 2));
        ctx.fillStyle = flashA ? VMS_LED_BRIGHT : VMS_LED_AMBER;
        cx += charW + charGap;
        // V
        ctx.fillRect(cx, line1Y, 1, charH);
        ctx.fillRect(cx + charW - 1, line1Y, 1, charH);
        ctx.fillRect(cx + Math.round(charW * 0.5), line1Y + charH - 1, 1, 1);
        cx += charW + charGap;
        // A
        ctx.fillRect(cx, line1Y, charW, charH);
        ctx.fillRect(cx + 1, line1Y + Math.round(charH * 0.3), Math.max(1, charW - 2), Math.max(1, charH * 0.4));
        ctx.fillStyle = '#100702';
        ctx.fillRect(cx + 1, line1Y + 1, Math.max(1, charW - 2), Math.max(1, Math.round(charH * 0.3)));
        ctx.fillStyle = flashA ? VMS_LED_BRIGHT : VMS_LED_AMBER;

        // Line 2: TEST IN CORSO
        ctx.fillStyle = VMS_LED_BRIGHT;
        const testBarW = Math.max(4, Math.round(innerW * 0.65));
        ctx.fillRect(innerX + Math.round((innerW - testBarW) * 0.5), line2Y, testBarW, textH);
      } else {
        ctx.fillRect(innerX + 3, line1Y, Math.max(4, Math.round(innerW * 0.8)), textH);
        ctx.fillStyle = VMS_LED_BRIGHT;
        ctx.fillRect(innerX + 3, line2Y, Math.max(4, Math.round(innerW * 0.55)), textH);
      }
    } else if (v === 1) {
      // GROOVE AHEAD / 120 BPM
      ctx.fillRect(innerX + 4, line1Y, Math.max(4, Math.round(innerW * 0.75)), textH);
      ctx.fillStyle = VMS_LED_BRIGHT;
      ctx.fillRect(innerX + 4, line2Y, Math.max(4, Math.round(innerW * 0.5)), textH);
    } else if (v === 2) {
      // TOFU WARNING / NO SPILL
      ctx.fillRect(innerX + 4, line1Y, Math.max(4, Math.round(innerW * 0.8)), textH);
      ctx.fillStyle = VMS_LED_BRIGHT;
      ctx.fillRect(innerX + 4, line2Y, Math.max(4, Math.round(innerW * 0.6)), textH);
    } else {
      // RADIO 88.4 / CASSETTE ON
      ctx.fillRect(innerX + 4, line1Y, Math.max(4, Math.round(innerW * 0.65)), textH);
      ctx.fillStyle = VMS_LED_BRIGHT;
      ctx.fillRect(innerX + 4, line2Y, Math.max(4, Math.round(innerW * 0.85)), textH);
    }
  } else {
    ctx.fillStyle = VMS_LED_AMBER;
    ctx.fillRect(innerX + 2, innerY + Math.round(innerH * 0.3), innerW - 4, Math.max(1, Math.round(innerH * 0.4)));
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

  // Single steel support post
  ctx.fillStyle = '#26203a';
  ctx.fillRect(Math.round(rx - postW * 0.5), y - postH, postW, postH);
  // Post footing / guardrail clamp
  ctx.fillStyle = '#140d24';
  ctx.fillRect(Math.round(rx - postW * 1.2), y - 2, Math.max(3, Math.round(postW * 2.4)), 2);

  // Black sign board
  ctx.fillStyle = CHEVRON_BG;
  ctx.fillRect(left, topY, w, h);

  // Neon trim (Cyan for Left turn, Magenta for Right turn, White if chase-lit)
  const neonColor = isChaseLit ? '#ffffff' : isLeft ? CHEVRON_CYAN : CHEVRON_MAGENTA;
  ctx.fillStyle = neonColor;
  ctx.fillRect(left, topY, w, 1);
  ctx.fillRect(left, topY + h - 1, w, 1);
  ctx.fillRect(left, topY, 1, h);
  ctx.fillRect(left + w - 1, topY, 1, h);

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
  const isAtmospheric = fogFactor >= 0.55;

  // Distant Low LOD: compact 3-rect tower silhouette
  if (h < 38) {
    ctx.fillStyle = isAtmospheric ? activeAtmosphereSilhouette : PYLON_STEEL;
    ctx.fillRect(rx - 1, topY + Math.round(h * 0.2), 2, Math.round(h * 0.8));
    ctx.fillStyle = isAtmospheric ? activeAtmosphereSilhouette : PYLON_STEEL_LIGHT;
    const armW = Math.max(6, Math.round(baseW * 1.6));
    ctx.fillRect(Math.round(rx - armW * 0.5), topY + Math.round(h * 0.2), armW, 2);
    ctx.fillStyle = isAtmospheric ? activeAtmosphereAccent : PYLON_BEACON;
    ctx.fillRect(rx - 1, topY, 2, 2);
    return;
  }

  // Ground concrete footings (heavier for terminal anchor)
  ctx.fillStyle = '#140d24';
  const footH = isTerminal ? 3 : 2;
  ctx.fillRect(Math.round(rx - baseW * 0.5), y - footH, baseW, footH);

  // Waist geometry (narrows at ~42% height from ground)
  const waistY = Math.round(y - h * 0.42);
  const waistW = Math.max(2, Math.round(baseW * (isTerminal ? 0.42 : 0.38)));

  ctx.fillStyle = PYLON_STEEL;
  // Lower tapered legs (from ground to waist) - slightly heavier for terminal/strain tower
  const legThick = Math.max(1, Math.round(baseW * (isTerminal ? 0.08 : 0.05)));
  ctx.beginPath();
  // Left leg
  ctx.moveTo(Math.round(rx - baseW * 0.5), y);
  ctx.lineTo(Math.round(rx - waistW * 0.5), waistY);
  ctx.lineTo(Math.round(rx - waistW * 0.5 + legThick), waistY);
  ctx.lineTo(Math.round(rx - baseW * 0.5 + legThick), y);
  // Right leg
  ctx.moveTo(Math.round(rx + baseW * 0.5), y);
  ctx.lineTo(Math.round(rx + waistW * 0.5), waistY);
  ctx.lineTo(Math.round(rx + waistW * 0.5 - legThick), waistY);
  ctx.lineTo(Math.round(rx + baseW * 0.5 - legThick), y);
  ctx.fill();

  // Horizontal waist strut
  ctx.fillRect(Math.round(rx - waistW * 0.5), waistY, waistW, Math.max(1, Math.round(h * 0.015)));

  // Lower leg X-bracing (near/mid LOD only)
  if (h >= 96 && baseW >= 12) {
    ctx.strokeStyle = PYLON_STEEL;
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

  // The two diagonal legs forming the V-basket
  ctx.fillStyle = PYLON_STEEL;
  ctx.beginPath();
  // Left V arm
  ctx.moveTo(Math.round(rx - waistW * 0.5), waistY);
  ctx.lineTo(Math.round(rx - vTopW * 0.5), vTopY);
  ctx.lineTo(Math.round(rx - vTopW * 0.5 + legThick), vTopY);
  ctx.lineTo(Math.round(rx - waistW * 0.5 + legThick), waistY);
  // Right V arm
  ctx.moveTo(Math.round(rx + waistW * 0.5), waistY);
  ctx.lineTo(Math.round(rx + vTopW * 0.5), vTopY);
  ctx.lineTo(Math.round(rx + vTopW * 0.5 - legThick), vTopY);
  ctx.lineTo(Math.round(rx + waistW * 0.5 - legThick), waistY);
  ctx.fill();

  // Internal V lattice cross-ties (leaving the center hollow like the photo!)
  if (h >= 96 && baseW >= 14) {
    ctx.strokeStyle = PYLON_STEEL;
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
  ctx.fillStyle = PYLON_STEEL_LIGHT;
  ctx.fillRect(Math.round(rx - vTopW * 0.5), vTopY, vTopW, trussH);

  // --- CANTILEVER OUTWARD HORNS (Left and Right Wingtips) ---
  const hornSpanW = Math.max(10, Math.round(baseW * 1.95));
  const hornTipY = Math.round(vTopY - h * 0.04);
  const leftHornX = Math.round(rx - hornSpanW * 0.5);
  const rightHornX = Math.round(rx + hornSpanW * 0.5);

  ctx.beginPath();
  // Left horn
  ctx.moveTo(Math.round(rx - vTopW * 0.5), vTopY + trussH);
  ctx.lineTo(leftHornX, hornTipY);
  ctx.lineTo(leftHornX, hornTipY + trussH);
  ctx.lineTo(Math.round(rx - vTopW * 0.5), vTopY);
  // Right horn
  ctx.moveTo(Math.round(rx + vTopW * 0.5), vTopY + trussH);
  ctx.lineTo(rightHornX, hornTipY);
  ctx.lineTo(rightHornX, hornTipY + trussH);
  ctx.lineTo(Math.round(rx + vTopW * 0.5), vTopY);
  ctx.fill();

  // --- INSULATOR STRINGS (5 attachment points) ---
  const insH = Math.max(3, Math.round(h * 0.08));
  const insAttachY = hornTipY + trussH;
  const insAttachMidY = vTopY + trussH;

  const insX1 = leftHornX + 2;
  const insX2 = Math.round(rx - vTopW * 0.52);
  const insX3 = rx;
  const insX4 = Math.round(rx + vTopW * 0.52);
  const insX5 = rightHornX - 2;

  if (isTerminal) {
    // Terminal variant (1): horizontal strain insulators (porcelain mint/cyan)
    const strainW = Math.max(3, Math.round(insH * 1.1));
    const insYOffset = Math.round(insH * 0.4);
    ctx.fillStyle = '#80f5ec';
    ctx.fillRect(insX1 - strainW, insAttachY + insYOffset, strainW, 2);
    ctx.fillRect(insX2 - strainW, insAttachMidY + insYOffset, strainW, 2);
    ctx.fillRect(insX3 - Math.round(strainW * 0.5), insAttachMidY + insYOffset, strainW, 2);
    ctx.fillRect(insX4, insAttachMidY + insYOffset, strainW, 2);
    ctx.fillRect(insX5, insAttachY + insYOffset, strainW, 2);

    // Insulator metal tension clamps
    ctx.fillStyle = '#50426b';
    ctx.fillRect(insX1 - 1, insAttachY + insYOffset, 2, 2);
    ctx.fillRect(insX2 - 1, insAttachMidY + insYOffset, 2, 2);
    ctx.fillRect(insX3 - 1, insAttachMidY + insYOffset, 2, 2);
    ctx.fillRect(insX4 - 1, insAttachMidY + insYOffset, 2, 2);
    ctx.fillRect(insX5 - 1, insAttachY + insYOffset, 2, 2);
  } else {
    // Suspension variants (0 & 2): hanging vertical insulator strings
    ctx.fillStyle = '#80f5ec';
    ctx.fillRect(insX1, insAttachY, 1, insH);
    ctx.fillRect(insX2, insAttachMidY, 1, insH);
    ctx.fillRect(insX3, insAttachMidY, 1, insH);
    ctx.fillRect(insX4, insAttachMidY, 1, insH);
    ctx.fillRect(insX5, insAttachY, 1, insH);

    // Insulator bottom metal clamps
    ctx.fillStyle = '#50426b';
    ctx.fillRect(insX1 - 1, insAttachY + insH, 3, 1);
    ctx.fillRect(insX2 - 1, insAttachMidY + insH, 3, 1);
    ctx.fillRect(insX3 - 1, insAttachMidY + insH, 3, 1);
    ctx.fillRect(insX4 - 1, insAttachMidY + insH, 3, 1);
    ctx.fillRect(insX5 - 1, insAttachY + insH, 3, 1);
  }

  // Top Pinnacle Aviation Warning Red Beacon
  ctx.fillStyle = PYLON_BEACON;
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
): void {
  const isTiered = variant % 2 === 1;
  const v = variant % SHRUB_BODY.length;

  const bodyColor = activePropTheme ? activePropTheme.shrubTint[0] : SHRUB_BODY[v]!;
  const shadeColor = activePropTheme ? activePropTheme.shrubTint[1] : SHRUB_SHADE[v]!;
  const accentColor = activePropTheme
    ? activePropTheme.shrubTint[2]
    : v === 0
      ? '#ff007f'
      : v === 1
        ? '#00f5d4'
        : '#ffd166';

  if (!isTiered) {
    // --- Silhouette A: Low Broad Roadside Hedge / Dome Bush ---
    const w = Math.max(3, Math.round(1400 * ppu));
    const h = Math.max(2, Math.round(750 * ppu));
    const left = Math.round(x - w * 0.5);
    const topY = Math.round(y - h);

    // Ground shadow
    ctx.fillStyle = 'rgba(6, 2, 16, 0.45)';
    ctx.fillRect(left - 1, y - 1, w + 2, Math.max(1, Math.round(h * 0.3)));

    // Lower deep shadow cluster
    ctx.fillStyle = shadeColor;
    ctx.fillRect(left, topY + Math.round(h * 0.35), w, Math.round(h * 0.65));

    // Upper illuminated foliage domes
    ctx.fillStyle = bodyColor;
    ctx.fillRect(left + Math.round(w * 0.15), topY, Math.round(w * 0.7), Math.round(h * 0.65));
    ctx.fillRect(left, topY + Math.round(h * 0.25), Math.round(w * 0.45), Math.round(h * 0.5));
    ctx.fillRect(left + Math.round(w * 0.55), topY + Math.round(h * 0.25), Math.round(w * 0.45), Math.round(h * 0.5));

    // Top highlight rim
    ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
    ctx.fillRect(left + Math.round(w * 0.25), topY, Math.round(w * 0.5), 1);
  } else {
    // --- Silhouette B: Sculpted Japanese Tiered Niwaki / Cloud Shrub ---
    const w = Math.max(3, Math.round(1200 * ppu));
    const h = Math.max(4, Math.round(1150 * ppu));
    const left = Math.round(x - w * 0.5);
    const topY = Math.round(y - h);

    // Ground shadow
    ctx.fillStyle = 'rgba(6, 2, 16, 0.45)';
    ctx.fillRect(left, y - 1, w, Math.max(1, Math.round(h * 0.2)));

    // Visible gnarled woody stem
    const stemW = Math.max(1, Math.round(w * 0.1));
    ctx.fillStyle = '#221528';
    ctx.fillRect(Math.round(x - stemW * 0.5), Math.round(y - h * 0.6), stemW, Math.round(h * 0.6));
    ctx.fillRect(Math.round(x - w * 0.3), Math.round(y - h * 0.45), Math.round(w * 0.3), Math.max(1, Math.round(h * 0.08)));

    // Lower Tier Foliage Pad (Left side)
    const lowerW = Math.max(2, Math.round(w * 0.55));
    const lowerH = Math.max(2, Math.round(h * 0.35));
    const lowerY = Math.round(y - h * 0.55);
    ctx.fillStyle = shadeColor;
    ctx.fillRect(left, lowerY + Math.round(lowerH * 0.3), lowerW, Math.round(lowerH * 0.7));
    ctx.fillStyle = bodyColor;
    ctx.fillRect(left + 1, lowerY, lowerW - 2, Math.round(lowerH * 0.6));

    // Upper Tier Foliage Pad (Right/Center side)
    const upperW = Math.max(2, Math.round(w * 0.65));
    const upperH = Math.max(2, Math.round(h * 0.42));
    const upperX = Math.round(x - w * 0.15);
    ctx.fillStyle = shadeColor;
    ctx.fillRect(upperX, topY + Math.round(upperH * 0.3), upperW, Math.round(upperH * 0.7));
    ctx.fillStyle = bodyColor;
    ctx.fillRect(upperX + 1, topY, upperW - 2, Math.round(upperH * 0.6));

    // Vibrant flowering blossoms / synthwave highlight tips
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
): void {
  const v = variant % 3;
  const postH = Math.max(4, Math.round(2200 * ppu));
  const postW = Math.max(1, Math.round(75 * ppu));
  const rx = Math.round(x);
  const groundY = Math.round(y);

  // Galvanized steel post
  ctx.fillStyle = '#4a3e6b';
  ctx.fillRect(Math.round(rx - postW * 0.5), groundY - postH, postW, postH);

  // Distant Low LOD: 1 post + 1 colored sign rect (skips footing, ctx.arc circles, diamonds & digits)
  if (postH < 24) {
    const sw = v === 1 ? Math.max(5, Math.round(1800 * ppu)) : Math.max(4, Math.round(1200 * ppu));
    const sh = v === 1 ? Math.max(3, Math.round(1200 * ppu)) : sw;
    ctx.fillStyle = v === 0 ? '#e63946' : v === 1 ? '#006b47' : '#ffcc00';
    ctx.fillRect(Math.round(rx - sw * 0.5), groundY - postH - sh, sw, sh);
    return;
  }

  // Post footing / guardrail clamp
  ctx.fillStyle = '#26203a';
  ctx.fillRect(Math.round(rx - postW * 1.2), groundY - 2, Math.max(3, Math.round(postW * 2.4)), 2);

  if (v === 0) {
    // --- Variant 0: Japanese Speed Limit 80 Sign (Cartello Circolare Limite 80) ---
    const diam = Math.max(4, Math.round(1150 * ppu));
    const r = Math.round(diam * 0.5);
    const signCenterY = groundY - postH - r;

    // Outer crimson red border ring
    ctx.fillStyle = '#e63946';
    ctx.beginPath();
    ctx.arc(rx, signCenterY, r, 0, Math.PI * 2);
    ctx.fill();

    // Inner pure white disc
    const innerR = Math.max(1, Math.round(r * 0.72));
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(rx, signCenterY, innerR, 0, Math.PI * 2);
    ctx.fill();

    // Blue numerals "80"
    if (diam >= 8) {
      ctx.fillStyle = '#0b1d3a';
      const numH = Math.max(2, Math.round(diam * 0.38));
      const numW = Math.max(1, Math.round(diam * 0.18));
      // Digit 8
      ctx.fillRect(Math.round(rx - numW - 1), Math.round(signCenterY - numH * 0.5), numW, numH);
      // Digit 0
      ctx.fillRect(Math.round(rx + 1), Math.round(signCenterY - numH * 0.5), numW, numH);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(Math.round(rx - numW), Math.round(signCenterY - numH * 0.25), Math.max(1, numW - 2), 1);
      ctx.fillRect(Math.round(rx + 2), Math.round(signCenterY - numH * 0.25), Math.max(1, numW - 2), Math.max(1, numH - 2));
    }

    // Lower white auxiliary sub-plate (Japanese zone indicator)
    const subW = Math.max(3, Math.round(diam * 0.75));
    const subH = Math.max(2, Math.round(diam * 0.3));
    const subY = signCenterY + r + 1;
    ctx.fillStyle = '#1b1428';
    ctx.fillRect(Math.round(rx - subW * 0.5 - 1), subY - 1, subW + 2, subH + 2);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(Math.round(rx - subW * 0.5), subY, subW, subH);
    ctx.fillStyle = '#0b1d3a';
    ctx.fillRect(Math.round(rx - subW * 0.35), subY + Math.round(subH * 0.35), Math.round(subW * 0.7), Math.max(1, Math.round(subH * 0.25)));

  } else if (v === 1) {
    // --- Variant 1: Shuto Expressway Directional Exit Sign (Cartello Verde di Uscita) ---
    const signW = Math.max(6, Math.round(1800 * ppu));
    const signH = Math.max(4, Math.round(1200 * ppu));
    const signLeft = Math.round(rx - signW * 0.5);
    const signTop = groundY - postH - signH;

    // Sign frame & green face
    ctx.fillStyle = '#080414';
    ctx.fillRect(signLeft - 1, signTop - 1, signW + 2, signH + 2);
    ctx.fillStyle = '#006b47';
    ctx.fillRect(signLeft, signTop, signW, signH);

    // White perimeter border
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(signLeft, signTop, signW, 1);
    ctx.fillRect(signLeft, signTop + signH - 1, signW, 1);
    ctx.fillRect(signLeft, signTop, 1, signH);
    ctx.fillRect(signLeft + signW - 1, signTop, 1, signH);

    if (signW >= 12 && signH >= 8) {
      // White Route shield "C1" (Shuto Inner Loop)
      const shieldW = Math.max(3, Math.round(signW * 0.3));
      const shieldH = Math.max(3, Math.round(signH * 0.42));
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(signLeft + 2, signTop + 2, shieldW, shieldH);
      ctx.fillStyle = '#006b47';
      ctx.fillRect(signLeft + 3, signTop + 3, shieldW - 2, shieldH - 2);

      // Destination text lines
      ctx.fillStyle = '#ffffff';
      const textX = signLeft + shieldW + 4;
      const textW = Math.max(2, signLeft + signW - textX - 2);
      ctx.fillRect(textX, signTop + 3, textW, Math.max(1, Math.round(signH * 0.2)));
      ctx.fillRect(textX, signTop + Math.round(signH * 0.35), Math.round(textW * 0.7), Math.max(1, Math.round(signH * 0.16)));

      // Diagonal exit arrow (↖ or ↗ based on side)
      const arrowY = signTop + Math.round(signH * 0.6);
      const arrowX = side < 0 ? signLeft + 3 : signLeft + signW - 5;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(arrowX, arrowY, 2, Math.max(2, Math.round(signH * 0.3)));
      ctx.fillRect(arrowX - (side < 0 ? 0 : 2), arrowY, 3, 1);
    }

  } else {
    // --- Variant 2: Curve Hazard Warning Diamond (Rombo Giallo Pericolo) ---
    const diam = Math.max(4, Math.round(1300 * ppu));
    const r = Math.round(diam * 0.5);
    const signCenterY = groundY - postH - r;

    // Diamond polygon (rotated square)
    ctx.fillStyle = '#080414';
    ctx.beginPath();
    ctx.moveTo(rx, signCenterY - r - 1);
    ctx.lineTo(rx + r + 1, signCenterY);
    ctx.lineTo(rx, signCenterY + r + 1);
    ctx.lineTo(rx - r - 1, signCenterY);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#ffcc00'; // Caution Yellow
    ctx.beginPath();
    ctx.moveTo(rx, signCenterY - r);
    ctx.lineTo(rx + r, signCenterY);
    ctx.lineTo(rx, signCenterY + r);
    ctx.lineTo(rx - r, signCenterY);
    ctx.closePath();
    ctx.fill();

    // Black directional curve arrow glyph (↱ for right curve when on left shoulder, ↰ for left curve)
    if (diam >= 8) {
      ctx.fillStyle = '#080414';
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
): void {
  if (ppu <= 0 || !Number.isFinite(ppu)) return;

  const w = Math.max(6, Math.round(2800 * ppu));
  const h = Math.max(8, Math.round(2600 * ppu));
  const left = Math.round(x - w * 0.5);
  const topY = Math.round(y - h);
  const v = Math.abs(variant) % 3;

  // Warm ground light pool
  if (w >= 8) {
    ctx.fillStyle = 'rgba(255, 200, 100, 0.25)';
    ctx.fillRect(left - 4, y - 2, w + 8, Math.max(2, Math.round(h * 0.1)));
  }

  // Building facade body
  ctx.fillStyle = v === 1 ? '#1c1230' : '#140c22';
  ctx.fillRect(left, topY, w, h);

  // Awning (slanted/overhanging canopy roof)
  const awH = Math.max(2, Math.round(h * 0.22));
  const awY = topY + Math.max(1, Math.round(h * 0.1));
  const awOverhang = Math.max(1, Math.round(w * 0.06));
  const awLeft = left - awOverhang;
  const awW = w + awOverhang * 2;

  // Awning body and vibrant striped accents
  ctx.fillStyle = v === 0 ? '#ff007f' : v === 1 ? '#00bbf9' : '#ffaa00';
  ctx.fillRect(awLeft, awY, awW, awH);

  if (w >= 14 && awH >= 4) {
    // White awning stripes
    ctx.fillStyle = '#ffffff';
    const stripeW = Math.max(2, Math.round(awW * 0.12));
    const stripeCount = Math.floor(awW / (stripeW * 2));
    for (let i = 0; i < stripeCount; i++) {
      ctx.fillRect(awLeft + i * (stripeW * 2), awY, stripeW, awH);
    }
  }

  // Lit service window & counter
  const winPadX = Math.max(2, Math.round(w * 0.12));
  const winW = Math.max(3, w - winPadX * 2);
  const winH = Math.max(3, Math.round(h * 0.38));
  const winY = awY + awH + Math.max(1, Math.round(h * 0.04));

  ctx.fillStyle = '#fff4cc';
  ctx.fillRect(left + winPadX, winY, winW, winH);

  // Counter shelf sill & goods
  if (winW >= 10 && winH >= 6) {
    ctx.fillStyle = '#1c0f2e';
    ctx.fillRect(left + winPadX, winY + winH - Math.max(2, Math.round(winH * 0.3)), winW, Math.max(2, Math.round(winH * 0.3)));
    // Goods on display
    ctx.fillStyle = '#ff2a6d';
    ctx.fillRect(left + winPadX + 2, winY + winH - Math.max(4, Math.round(winH * 0.6)), Math.max(2, Math.round(winW * 0.25)), Math.max(2, Math.round(winH * 0.3)));
    ctx.fillStyle = '#05d9e8';
    ctx.fillRect(left + winPadX + Math.round(winW * 0.4), winY + winH - Math.max(4, Math.round(winH * 0.5)), Math.max(2, Math.round(winW * 0.25)), Math.max(2, Math.round(winH * 0.2)));
  }

  // Top header sign plate
  const signH = Math.max(2, Math.round(h * 0.1));
  ctx.fillStyle = '#ff0055';
  ctx.fillRect(left + 2, topY, w - 4, signH);
  if (w >= 12 && signH >= 3) {
    ctx.fillStyle = '#ffffff';
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
): void {
  if (ppu <= 0 || !Number.isFinite(ppu)) return;

  const w = Math.max(4, Math.round(1300 * ppu));
  const h = Math.max(3, Math.round(750 * ppu));
  const left = Math.round(x - w * 0.5);
  const topY = Math.round(y - h);
  const v = Math.abs(variant) % 3;

  // Ground shadow
  ctx.fillStyle = 'rgba(8, 2, 20, 0.45)';
  ctx.fillRect(left - 1, y - 1, w + 2, Math.max(1, Math.round(h * 0.18)));

  // Steel legs and supports
  ctx.fillStyle = '#100d1c';
  const legW = Math.max(1, Math.round(w * 0.08));
  ctx.fillRect(left + Math.round(w * 0.12), topY, legW, h);
  ctx.fillRect(left + Math.round(w * 0.88) - legW, topY, legW, h);

  // Slats (seat + backrest)
  const slatColor = v === 1 ? '#0077b6' : v === 2 ? '#2a9d8f' : '#8d5b4c';
  ctx.fillStyle = slatColor;

  // Backrest horizontal beam
  const backH = Math.max(1, Math.round(h * 0.32));
  ctx.fillRect(left, topY, w, backH);

  // Seat horizontal slab
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
): void {
  if (ppu <= 0 || !Number.isFinite(ppu)) return;

  const w = Math.max(6, Math.round(2400 * ppu));
  const h = Math.max(8, Math.round(2800 * ppu));
  const left = Math.round(x - w * 0.5);
  const topY = Math.round(y - h);

  // Ground shadow & illuminated pool
  ctx.fillStyle = 'rgba(0, 245, 212, 0.22)';
  ctx.fillRect(left - 2, y - 2, w + 4, Math.max(2, Math.round(h * 0.08)));

  // Dark steel posts
  const postW = Math.max(1, Math.round(w * 0.05));
  ctx.fillStyle = '#151224';
  ctx.fillRect(left + Math.round(w * 0.08), topY, postW, h);
  ctx.fillRect(left + Math.round(w * 0.82) - postW, topY, postW, h);

  // Translucent glass back wall
  ctx.fillStyle = 'rgba(0, 245, 212, 0.28)';
  const glassY = topY + Math.max(2, Math.round(h * 0.12));
  const glassH = Math.max(3, Math.round(h * 0.68));
  ctx.fillRect(left + Math.round(w * 0.08), glassY, Math.round(w * 0.74), glassH);

  // Canopy roof slab
  const roofH = Math.max(2, Math.round(h * 0.1));
  ctx.fillStyle = '#221a36';
  ctx.fillRect(left, topY, Math.round(w * 0.88), roofH);

  // Neon roof trim
  const neonTrim = Math.abs(variant) % 2 === 0 ? '#ff007f' : '#00f5d4';
  ctx.fillStyle = neonTrim;
  ctx.fillRect(left, topY + Math.max(1, Math.round(roofH * 0.7)), Math.round(w * 0.88), 1);

  // Integrated small waiting bench inside
  ctx.fillStyle = '#0077b6';
  const benchY = y - Math.max(2, Math.round(h * 0.35));
  ctx.fillRect(left + Math.round(w * 0.15), benchY, Math.round(w * 0.5), Math.max(1, Math.round(h * 0.08)));

  // Bus stop pole & illuminated timetable sign (facing road edge)
  const poleX = side < 0 ? left + Math.round(w * 0.08) : left + Math.round(w * 0.92);
  const poleW = Math.max(1, Math.round(w * 0.04));
  ctx.fillStyle = '#151224';
  ctx.fillRect(poleX, topY + Math.round(h * 0.1), poleW, Math.round(h * 0.9));

  // Lit timetable board
  const boardW = Math.max(3, Math.round(w * 0.18));
  const boardH = Math.max(4, Math.round(h * 0.3));
  const boardX = poleX - Math.floor(boardW * 0.5);
  const boardY = topY + Math.round(h * 0.35);

  ctx.fillStyle = '#fff4cc';
  ctx.fillRect(boardX, boardY, boardW, boardH);

  // Timetable lines
  if (boardW >= 6 && boardH >= 6) {
    ctx.fillStyle = '#100d1c';
    ctx.fillRect(boardX + 1, boardY + 2, boardW - 2, 1);
    ctx.fillRect(boardX + 1, boardY + 4, boardW - 2, 1);
  }

  // Glowing round bus sign on top of the pole
  const discR = Math.max(2, Math.round(w * 0.08));
  const discY = topY + Math.round(h * 0.1);
  ctx.fillStyle = '#00f5d4';
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
): void {
  if (ppu <= 0 || !Number.isFinite(ppu)) return;

  const w = Math.max(12, Math.round(4800 * ppu));
  const h = Math.max(8, Math.round(2600 * ppu));
  const left = Math.round(x - w * 0.5);
  const topY = Math.round(y - h);
  const v = Math.abs(variant) % 3;

  // Illuminated bay under canopy
  ctx.fillStyle = 'rgba(255, 255, 240, 0.18)';
  ctx.fillRect(left, y - 2, w, Math.max(2, Math.round(h * 0.14)));

  const roofH = Math.max(3, Math.round(h * 0.18));

  // Steel structural pillars (3 pillars: left, center, right)
  const postW = Math.max(1, Math.round(w * 0.03));
  ctx.fillStyle = '#181326';
  ctx.fillRect(left + Math.round(w * 0.08), topY + roofH, postW, h - roofH);
  ctx.fillRect(left + Math.round(w * 0.5) - Math.floor(postW * 0.5), topY + roofH, postW, h - roofH);
  ctx.fillRect(left + Math.round(w * 0.92) - postW, topY + roofH, postW, h - roofH);

  // Roof slab body
  ctx.fillStyle = '#251c3a';
  ctx.fillRect(left, topY, w, roofH);

  // Neon edge fascia
  ctx.fillStyle = v === 0 ? '#00f5d4' : v === 1 ? '#ff007f' : '#ffd166';
  ctx.fillRect(left, topY, w, Math.max(1, Math.round(roofH * 0.35)));

  // Under-roof downlight strip
  ctx.fillStyle = '#ffffff';
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
): void {
  if (ppu <= 0 || !Number.isFinite(ppu)) return;

  const w = Math.max(6, Math.round(3000 * ppu));
  const h = Math.max(8, Math.round(3400 * ppu));
  const left = Math.round(x - w * 0.5);
  const topY = Math.round(y - h);

  // Ground shadow
  ctx.fillStyle = 'rgba(8, 2, 20, 0.45)';
  ctx.fillRect(left, y - 1, w, Math.max(2, Math.round(h * 0.08)));

  const pillarW = Math.max(1, Math.round(w * 0.08));
  const p1X = left + Math.round(w * 0.18);
  const p2X = left + Math.round(w * 0.82) - pillarW;

  // Black stone bases (Kamebara)
  const baseH = Math.max(2, Math.round(h * 0.06));
  ctx.fillStyle = '#0e0a18';
  ctx.fillRect(p1X - 1, y - baseH, pillarW + 2, baseH);
  ctx.fillRect(p2X - 1, y - baseH, pillarW + 2, baseH);

  // Vermilion red pillars (Hashira)
  const vermilion = Math.abs(variant) % 2 === 0 ? '#d90429' : '#e63946';
  ctx.fillStyle = vermilion;
  ctx.fillRect(p1X, topY + Math.round(h * 0.1), pillarW, h - baseH - Math.round(h * 0.1));
  ctx.fillRect(p2X, topY + Math.round(h * 0.1), pillarW, h - baseH - Math.round(h * 0.1));

  // Secondary crossbeam (Nuki)
  const nukiY = topY + Math.round(h * 0.24);
  const nukiH = Math.max(1, Math.round(h * 0.06));
  ctx.fillStyle = '#ba0022';
  ctx.fillRect(left + Math.round(w * 0.08), nukiY, Math.round(w * 0.84), nukiH);

  // Upper main lintel (Kasagi & Shimaki)
  const lintelH = Math.max(2, Math.round(h * 0.1));
  ctx.fillStyle = vermilion;
  ctx.fillRect(left, topY, w, lintelH);

  // Black curved roof cap
  ctx.fillStyle = '#100c1c';
  ctx.fillRect(left - 1, topY - 1, w + 2, Math.max(1, Math.round(lintelH * 0.35)));

  // Center plaque tablet (Gakuzuka)
  if (w >= 12) {
    const gakW = Math.max(2, Math.round(w * 0.06));
    ctx.fillStyle = '#ffd166';
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
): void {
  if (ppu <= 0 || !Number.isFinite(ppu)) return;

  const w = Math.max(3, Math.round(900 * ppu));
  const h = Math.max(5, Math.round(1800 * ppu));
  const left = Math.round(x - w * 0.5);

  const isSlate = Math.abs(variant) % 2 === 1;
  const stoneDark = isSlate ? '#1e1c28' : '#272233';
  const stoneMed = isSlate ? '#383247' : '#443c54';
  const stoneLight = isSlate ? '#564f69' : '#685f7d';

  // Warm candle light pool on ground
  if (w >= 4) {
    ctx.fillStyle = 'rgba(255, 190, 11, 0.22)';
    ctx.fillRect(left - 2, y - 1, w + 4, Math.max(2, Math.round(h * 0.09)));
  }

  // Stone base (Kiso)
  const baseH = Math.max(1, Math.round(h * 0.12));
  ctx.fillStyle = stoneDark;
  ctx.fillRect(left + 1, y - baseH, w - 2, baseH);

  // Post / column (Sao)
  const postW = Math.max(1, Math.round(w * 0.35));
  const postH = Math.max(2, Math.round(h * 0.34));
  ctx.fillStyle = stoneMed;
  ctx.fillRect(Math.round(left + (w - postW) * 0.5), y - baseH - postH, postW, postH);

  // Middle platform (Chudai)
  const midH = Math.max(1, Math.round(h * 0.08));
  const midY = y - baseH - postH - midH;
  ctx.fillStyle = stoneLight;
  ctx.fillRect(left, midY, w, midH);

  // Firebox light chamber (Hibukuro)
  const fireH = Math.max(2, Math.round(h * 0.2));
  const fireW = Math.max(2, Math.round(w * 0.65));
  const fireY = midY - fireH;
  const fireX = Math.round(left + (w - fireW) * 0.5);

  ctx.fillStyle = stoneDark;
  ctx.fillRect(fireX, fireY, fireW, fireH);

  // Glowing lantern window
  ctx.fillStyle = '#ffe066';
  ctx.fillRect(fireX + 1, fireY + 1, Math.max(1, fireW - 2), Math.max(1, fireH - 2));

  // Umbrella roof (Kasa)
  const roofH = Math.max(2, Math.round(h * 0.16));
  const roofY = fireY - roofH;
  ctx.fillStyle = '#685f7d';
  ctx.fillRect(left - 1, roofY + Math.round(roofH * 0.5), w + 2, Math.round(roofH * 0.5));
  ctx.fillRect(left + 1, roofY, w - 2, Math.round(roofH * 0.5));

  // Sacred jewel top (Hoju)
  const hojuSize = Math.max(1, Math.round(w * 0.25));
  ctx.fillStyle = '#443c54';
  ctx.fillRect(Math.round(left + (w - hojuSize) * 0.5), roofY - hojuSize, hojuSize, hojuSize);
}

// ---------------------------------------------------------------------------
// Main Router
// ---------------------------------------------------------------------------
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

  switch (kind) {
    case 'palm':
      drawPalm(ctx, x, y, ppu, side, variant, fogFactor);
      break;
    case 'street-tree':
      drawStreetTree(ctx, x, y, ppu, side, variant, fogFactor);
      break;
    case 'pine':
      drawPine(ctx, x, y, ppu, side, variant, fogFactor);
      break;
    case 'lamp':
      drawLamp(ctx, x, y, ppu, side, fogFactor);
      break;
    case 'billboard':
      drawBillboard(ctx, x, y, ppu, variant, fogFactor);
      break;
    case 'building':
      drawBuilding(ctx, x, y, ppu, side, variant, fogFactor);
      break;
    case 'jihanki':
      drawJihanki(ctx, x, y, ppu, variant);
      break;
    case 'phonebooth':
      drawPhonebooth(ctx, x, y, ppu);
      break;
    case 'gantry':
      drawGantry(ctx, x, y, ppu, fogFactor);
      break;
    case 'overpass':
      drawOverpass(ctx, x, y, ppu, variant, beatPulse, fogFactor);
      break;
    case 'suspension-tower':
      drawSuspensionTower(ctx, x, y, ppu, variant, beatPulse, fogFactor);
      break;
    case 'vms':
      drawVMS(ctx, x, y, ppu, variant, beatPulse);
      break;
    case 'chevron':
      drawChevron(ctx, x, y, ppu, side, variant, beatPulse, beatIndex);
      break;
    case 'pylon':
      drawPylon(ctx, x, y, ppu, variant, fogFactor);
      break;
    case 'shrub':
      drawShrub(ctx, x, y, ppu, variant);
      break;
    case 'sign':
      drawSign(ctx, x, y, ppu, side, variant);
      break;
    case 'kiosk':
      drawKiosk(ctx, x, y, ppu, side, variant);
      break;
    case 'bench':
      drawBench(ctx, x, y, ppu, variant);
      break;
    case 'bus-stop':
      drawBusStop(ctx, x, y, ppu, side, variant);
      break;
    case 'canopy':
      drawCanopy(ctx, x, y, ppu, variant);
      break;
    case 'torii':
      drawTorii(ctx, x, y, ppu, variant);
      break;
    case 'toro':
      drawToro(ctx, x, y, ppu, variant);
      break;
  }
}
