import type { PropKind } from './RoadSegment';

// ---------------------------------------------------------------------------
// Static Color Palettes (AGENTS.md §4.3: ZERO GC allocations per frame)
// ---------------------------------------------------------------------------
const PALM_TRUNK = '#3a1d5c';
const PALM_TRUNK_LIGHT = '#6c34a3';
const PALM_LEAVES = ['#14f1d9', '#ff3cac', '#7b5cff'] as const;
const PALM_LEAF_SHADE = ['#08877a', '#a31564', '#43248a'] as const;

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
): void {
  const h = 3400 * ppu;
  const lean = 420 * ppu * -side; // lean towards the road
  const trunkW = Math.max(1, 115 * ppu);
  const topX = x + lean;
  const topY = y - h;

  // Ground shadow pixel pad
  if (trunkW >= 2) {
    ctx.fillStyle = 'rgba(8, 2, 20, 0.55)';
    ctx.fillRect(Math.round(x - trunkW * 1.4), Math.round(y - 1), Math.round(trunkW * 2.8), Math.max(2, Math.round(trunkW * 0.45)));
  }

  // Segmented pixel-art curved trunk
  if (trunkW >= 2.5) {
    const rings = trunkW >= 5 ? 6 : 4;
    for (let r = 0; r < rings; r++) {
      const t0 = r / rings;
      const t1 = (r + 1) / rings;
      const rx = Math.round(x + lean * (t0 * t0));
      const ry = Math.round(y - h * t1);
      const segH = Math.max(2, Math.ceil(h / rings + 1));
      const segW = Math.max(2, Math.round(trunkW * (1.15 - t0 * 0.42)));
      ctx.fillStyle = r % 2 === 0 ? PALM_TRUNK : '#2c1447';
      ctx.fillRect(Math.round(rx - segW * 0.5), ry, segW, segH);
      if (segW >= 4) {
        ctx.fillStyle = PALM_TRUNK_LIGHT;
        const hiW = Math.max(1, Math.round(segW * 0.32));
        const hiX = side < 0 ? rx + Math.floor(segW * 0.15) : rx - Math.floor(segW * 0.45);
        ctx.fillRect(hiX, ry, hiW, Math.max(1, segH - 1));
      }
    }
  } else {
    const tw = Math.max(1, Math.round(trunkW));
    const halfH = Math.max(1, Math.round(h * 0.5));
    ctx.fillStyle = PALM_TRUNK;
    ctx.fillRect(Math.round(x - tw * 0.5), Math.round(y - halfH), tw, halfH);
    ctx.fillRect(Math.round(topX - tw * 0.5), Math.round(topY), tw, Math.max(1, Math.round(h - halfH + 1)));
  }

  // Pixel-art palm crown & fronds
  const leaf = 1320 * ppu;
  const leafColor = PALM_LEAVES[variant % PALM_LEAVES.length]!;
  const shadeColor = PALM_LEAF_SHADE[variant % PALM_LEAF_SHADE.length]!;

  if (leaf < 6) {
    const cw = Math.max(3, Math.round(leaf * 1.6));
    const ch = Math.max(2, Math.round(leaf * 0.85));
    const cx = Math.round(topX - cw * 0.5);
    const cy = Math.round(topY - ch * 0.4);
    ctx.fillStyle = shadeColor;
    ctx.fillRect(cx, cy + 1, cw, ch);
    ctx.fillStyle = leafColor;
    ctx.fillRect(cx, cy, cw, Math.max(1, ch - 1));
    return;
  }

  if (trunkW >= 3) {
    const cocoR = Math.max(2, Math.round(trunkW * 0.55));
    ctx.fillStyle = '#240b36';
    ctx.fillRect(Math.round(topX - cocoR), Math.round(topY - cocoR * 0.4), cocoR * 2, cocoR);
  }

  const steps = leaf >= 18 ? 4 : 2;
  for (let i = 0; i < 6; i++) {
    const a = -Math.PI + (i / 5) * Math.PI;
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
// 2. STREET LAMP (Highway Overpass & Urban Expressway)
// ---------------------------------------------------------------------------
function drawLamp(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  ppu: number,
  side: number,
): void {
  const h = 2800 * ppu;
  const arm = 720 * ppu * -side;
  const w = Math.max(1, Math.round(72 * ppu));
  const rx = Math.round(x);
  const ry = Math.round(y);
  const topY = Math.round(y - h);

  // Stepped steel plinth at base
  if (w >= 2) {
    const baseW = w * 2.2;
    const baseH = Math.max(2, Math.round(h * 0.1));
    ctx.fillStyle = '#241138';
    ctx.fillRect(Math.round(rx - baseW * 0.5), ry - baseH, Math.round(baseW), baseH);
  }

  // Vertical pole + neon rim highlight
  ctx.fillStyle = LAMP_POLE;
  ctx.fillRect(Math.round(rx - w * 0.5), topY, w, Math.round(h));
  if (w >= 3) {
    ctx.fillStyle = LAMP_POLE_EDGE;
    ctx.fillRect(side < 0 ? rx : Math.round(rx - w * 0.5), topY, 1, Math.round(h));
  }

  // Horizontal cantilever arm + diagonal support strut
  const armStartX = Math.round(Math.min(rx, rx + arm));
  const armW = Math.max(2, Math.round(Math.abs(arm)));
  ctx.fillStyle = LAMP_POLE;
  ctx.fillRect(armStartX, topY, armW, w);
  if (w >= 2) {
    ctx.fillRect(
      Math.round(rx + arm * 0.28),
      topY + w,
      Math.max(1, Math.round(Math.abs(arm) * 0.25)),
      w,
    );
  }

  // Lamp head fixture & pixel-stepped neon glow halo
  const lw = Math.max(2, Math.round(280 * ppu));
  const lh = Math.max(1, Math.round(75 * ppu));
  const lampX = Math.round(rx + arm - lw * 0.5);
  const lampY = topY + w;

  if (lw >= 4) {
    ctx.fillStyle = 'rgba(255, 243, 176, 0.22)';
    ctx.fillRect(lampX - Math.round(lw * 0.45), lampY - lh, Math.round(lw * 1.9), lh * 4);
    ctx.fillStyle = 'rgba(5, 217, 232, 0.25)';
    ctx.fillRect(lampX - Math.round(lw * 0.2), lampY, Math.round(lw * 1.4), lh * 2);
  }

  ctx.fillStyle = LAMP_LIGHT;
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
): void {
  const w = Math.max(4, Math.round(2600 * ppu));
  const h = Math.max(3, Math.round(1300 * ppu));
  const legH = Math.max(2, Math.round(1100 * ppu));
  const legW = Math.max(1, Math.round(95 * ppu));
  const rx = Math.round(x);
  const ry = Math.round(y);
  const top = ry - legH - h;
  const left = Math.round(rx - w * 0.5);

  const leftLegX = Math.round(rx - w * 0.3 - legW * 0.5);
  const rightLegX = Math.round(rx + w * 0.3 - legW * 0.5);
  ctx.fillStyle = BILLBOARD_FRAME;
  ctx.fillRect(leftLegX, ry - legH, legW, legH);
  ctx.fillRect(rightLegX, ry - legH, legW, legH);
  if (legH >= 6) {
    ctx.fillStyle = '#3d3358';
    ctx.fillRect(leftLegX, Math.round(ry - legH * 0.55), rightLegX - leftLegX + legW, Math.max(1, Math.round(legW * 0.45)));
  }

  ctx.fillStyle = BILLBOARD_FRAME;
  ctx.fillRect(left, top, w, h);

  if (w >= 16) {
    ctx.fillStyle = '#fff3b0';
    ctx.fillRect(Math.round(rx - w * 0.28), top - Math.max(1, Math.round(legW * 0.5)), Math.max(2, legW), Math.max(1, Math.round(legW * 0.5)));
    ctx.fillRect(Math.round(rx + w * 0.22), top - Math.max(1, Math.round(legW * 0.5)), Math.max(2, legW), Math.max(1, Math.round(legW * 0.5)));
    ctx.fillStyle = '#3a1d5c';
    ctx.fillRect(left - 1, top + h, w + 2, Math.max(1, Math.round(legW * 0.5)));
  }

  const pad = Math.max(1, Math.round(80 * ppu));
  const innerX = left + pad;
  const innerY = top + pad;
  const innerW = Math.max(2, w - pad * 2);
  const innerH = Math.max(2, h - pad * 2);

  const v = variant % BILLBOARD_FACE.length;
  ctx.fillStyle = BILLBOARD_FACE[v]!;
  ctx.fillRect(innerX, innerY, innerW, innerH);

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
function drawBuilding(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  ppu: number,
  side: number,
  variant: number,
): void {
  const archVariant = variant % 3;

  if (archVariant === 0) {
    // =========================================================================
    // ARCHITECTURE 1: Akiba Megamart & Arcade with Vertical Neon Blade Sign
    // =========================================================================
    const w = Math.max(6, Math.round(3400 * ppu));
    const h = Math.max(14, Math.round(7600 * ppu));
    const topY = Math.round(y - h);
    const rx = Math.round(x);
    const left = side < 0 ? rx - w : rx;
    const v = variant % BUILDING_BODY.length;

    // Main Facade Tower
    ctx.fillStyle = BUILDING_BODY[v]!;
    ctx.fillRect(left, topY, w, h);

    // Structural edge / pillar
    ctx.fillStyle = BUILDING_TRIM[v]!;
    const trimW = Math.max(1, Math.round(w * 0.08));
    ctx.fillRect(side < 0 ? left + w - trimW : left, topY, trimW, h);

    // Roof parapet & HVAC units
    const roofH = Math.max(2, Math.round(h * 0.06));
    ctx.fillRect(left, topY, w, roofH);

    // Distant Low LOD
    if (w < 18 || h < 35) {
      ctx.fillStyle = BUILDING_SIGN_BG[v]!;
      ctx.fillRect(left, topY, w, Math.max(1, Math.round(roofH * 0.5)));
      return;
    }

    // Ground Floor: Illuminated Shopfront / Karaoke / Arcade Awning
    const shopH = Math.max(5, Math.round(h * 0.22));
    const shopY = y - shopH;
    ctx.fillStyle = '#05030a';
    ctx.fillRect(left, shopY, w, shopH);

    // Glowing shop awning
    const awnH = Math.max(2, Math.round(shopH * 0.28));
    ctx.fillStyle = BUILDING_AWNING[v]!;
    ctx.fillRect(left, shopY, w, awnH);

    // Shop interior warm glow
    ctx.fillStyle = '#fff4cc';
    const shopWindowW = Math.max(4, w - trimW * 2 - 4);
    const shopWindowH = Math.max(3, shopH - awnH - 2);
    const shopWinX = side < 0 ? left + 2 : left + trimW + 2;
    ctx.fillRect(shopWinX, shopY + awnH + 1, shopWindowW, shopWindowH);

    // Window Matrix across Upper Floors
    const winCols = w >= 40 ? 4 : 3;
    const winRows = Math.min(8, Math.floor((h - shopH - roofH) / (12 * ppu * 40 + 6)));
    const winW = Math.max(2, Math.round(w * 0.14));
    const winH = Math.max(2, Math.round(h * 0.055));
    const winSpacingX = Math.floor((w - trimW - 4 - winCols * winW) / (winCols + 1));
    const startWinY = topY + roofH + Math.round(h * 0.04);

    for (let r = 0; r < winRows; r++) {
      const wy = startWinY + r * (winH + Math.max(2, Math.round(winH * 0.8)));
      if (wy + winH >= shopY - 2) break;
      for (let c = 0; c < winCols; c++) {
        const wx = side < 0 ? left + 2 + (c + 1) * winSpacingX + c * winW : left + trimW + 2 + c * (winW + winSpacingX);
        const isLit = (c * 3 + r * 5 + variant) % 3 !== 0;
        if (isLit) {
          ctx.fillStyle = (c + r) % 2 === 0 ? '#ffeaa7' : '#00f5d4';
          ctx.fillRect(wx, wy, winW, winH);
        }
      }
    }

    // Signature Akiba Feature: Cantilevered Vertical Neon Blade Sign
    const signW = Math.max(3, Math.round(w * 0.2));
    const signH = Math.max(10, Math.round(h * 0.48));
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
    const topY = Math.round(y - h);
    const rx = Math.round(x);
    const left = side < 0 ? rx - w : rx;

    // Dark sleek high-tech corporate body
    ctx.fillStyle = '#070a18';
    ctx.fillRect(left, topY, w, h);

    // Stepped Setback Crown (Top 26% is narrower)
    const crownH = Math.max(4, Math.round(h * 0.26));
    const setbackW = Math.max(1, Math.round(w * 0.15));
    // Trim out setbacks
    ctx.fillStyle = '#080417'; // blend into sky
    if (side < 0) {
      ctx.fillRect(left, topY, setbackW, crownH);
    } else {
      ctx.fillRect(left + w - setbackW, topY, setbackW, crownH);
    }

    // Skyscraper Structural Edge Trim (Cobalt Neon)
    ctx.fillStyle = '#19284e';
    ctx.fillRect(left, topY + crownH, Math.max(1, Math.round(w * 0.05)), h - crownH);
    ctx.fillRect(left + w - Math.max(1, Math.round(w * 0.05)), topY + crownH, Math.max(1, Math.round(w * 0.05)), h - crownH);

    // Continuous Horizontal Illuminated Ribbon Windows (Cyan & Ice Blue Bands)
    if (w >= 14 && h >= 30) {
      const bandCount = Math.min(10, Math.floor(h / (10 * ppu * 40 + 8)));
      const bandH = Math.max(2, Math.round(h * 0.04));
      const bandGap = Math.max(3, Math.round(h * 0.055));

      for (let b = 0; b < bandCount; b++) {
        const by = topY + crownH + Math.round(h * 0.05) + b * (bandH + bandGap);
        if (by + bandH >= y - Math.round(h * 0.06)) break;

        const isCyan = b % 2 === 0;
        ctx.fillStyle = isCyan ? '#00f5d4' : '#3a86ff';
        const bandLeft = left + Math.max(2, Math.round(w * 0.08));
        const bandW = w - Math.max(4, Math.round(w * 0.16));
        ctx.fillRect(bandLeft, by, bandW, bandH);

        // Subtle vertical mullion dividers
        ctx.fillStyle = '#070a18';
        for (let m = 1; m <= 3; m++) {
          ctx.fillRect(bandLeft + Math.round(bandW * (m / 4)), by, 1, bandH);
        }
      }

      // Glowing Corporate Diamond Logo on the Crown
      const logoSize = Math.max(3, Math.round(w * 0.22));
      const logoX = side < 0 ? left + w - Math.round(w * 0.5) : left + Math.round(w * 0.2);
      const logoY = topY + Math.round(crownH * 0.35);
      ctx.fillStyle = '#00f5d4';
      ctx.fillRect(logoX, logoY, logoSize, logoSize);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(logoX + 1, logoY + 1, Math.max(1, logoSize - 2), Math.max(1, logoSize - 2));
    }

    // Twin Rooftop Aviation Beacons (Red flashing)
    ctx.fillStyle = '#ff0055';
    ctx.fillRect(left + 1, topY + crownH - 2, 2, 2);
    ctx.fillRect(left + w - 3, topY + crownH - 2, 2, 2);
    // Spire
    const spireX = side < 0 ? left + w - Math.round(w * 0.4) : left + Math.round(w * 0.4);
    ctx.fillStyle = '#3a86ff';
    ctx.fillRect(spireX, topY - Math.max(3, Math.round(h * 0.12)), 1, Math.max(3, Math.round(h * 0.12)));
    ctx.fillStyle = '#ff0055';
    ctx.fillRect(spireX - 1, topY - Math.max(3, Math.round(h * 0.12)) - 1, 2, 2);

  } else {
    // =========================================================================
    // ARCHITECTURE 3: Showa Retro Commercial Block with Rooftop Kanji Billboard & Fire Escapes
    // =========================================================================
    const w = Math.max(8, Math.round(4100 * ppu));
    const h = Math.max(13, Math.round(6800 * ppu));
    const topY = Math.round(y - h);
    const rx = Math.round(x);
    const left = side < 0 ? rx - w : rx;

    // Dark brick / concrete Showa building body
    ctx.fillStyle = '#181024';
    ctx.fillRect(left, topY, w, h);

    // Weathered horizontal floor dividing sills
    ctx.fillStyle = '#2c1e40';
    for (let f = 1; f <= 4; f++) {
      ctx.fillRect(left, topY + Math.round(h * (f / 5)), w, Math.max(1, Math.round(h * 0.025)));
    }

    // Windows with protruding air-conditioner units
    if (w >= 16 && h >= 25) {
      const rows = 4;
      const cols = 3;
      const winW = Math.max(2, Math.round(w * 0.15));
      const winH = Math.max(2, Math.round(h * 0.07));
      const colSpacing = Math.round((w * 0.7) / (cols + 1));
      const baseWinX = side < 0 ? left + Math.round(w * 0.05) : left + Math.round(w * 0.25);

      for (let r = 0; r < rows; r++) {
        const wy = topY + Math.round(h * 0.14) + r * Math.round(h * 0.19);
        for (let c = 0; c < cols; c++) {
          const wx = baseWinX + c * (winW + colSpacing);
          // Warm interior amber glow
          ctx.fillStyle = (r + c) % 2 === 0 ? '#ffbe0b' : '#ff9e00';
          ctx.fillRect(wx, wy, winW, winH);

          // Protruding grey Air Conditioning box unit below window
          ctx.fillStyle = '#4a3e6b';
          ctx.fillRect(wx - 1, wy + winH, Math.max(2, Math.round(winW * 0.6)), Math.max(1, Math.round(winH * 0.4)));
        }
      }

      // External Steel Zigzag Fire Escape Stairs (on outer flank)
      const escapeX = side < 0 ? left + w - Math.round(w * 0.2) : left + 2;
      const escapeW = Math.max(3, Math.round(w * 0.18));
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
      const boardY = topY - boardH - Math.max(2, Math.round(h * 0.05));
      const boardX = left + Math.round((w - boardW) * 0.5);

      // Steel stilts
      ctx.fillStyle = '#261b3d';
      ctx.fillRect(boardX + 2, topY - Math.round(h * 0.06), 2, Math.round(h * 0.06));
      ctx.fillRect(boardX + boardW - 4, topY - Math.round(h * 0.06), 2, Math.round(h * 0.06));

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
      const ky = boardY + Math.round(boardH * 0.22);
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
): void {
  // Spans across the entire roadway
  const spanW = Math.max(20, Math.round(6800 * ppu));
  const h = Math.max(12, Math.round(4400 * ppu));
  const legW = Math.max(2, Math.round(180 * ppu));
  const leftLegX = Math.round(x - spanW * 0.5);
  const rightLegX = Math.round(x + spanW * 0.5 - legW);
  const topY = Math.round(y - h);

  // Dual Vertical Steel Lattice Towers
  ctx.fillStyle = GANTRY_STEEL;
  ctx.fillRect(leftLegX, topY, legW, h);
  ctx.fillRect(rightLegX, topY, legW, h);

  // Concrete foundation plinths at ground
  const plinthH = Math.max(2, Math.round(h * 0.08));
  ctx.fillStyle = '#120d22';
  ctx.fillRect(leftLegX - 1, y - plinthH, legW + 2, plinthH);
  ctx.fillRect(rightLegX - 1, y - plinthH, legW + 2, plinthH);

  // Overhead Horizontal Steel Truss Beam
  const beamH = Math.max(3, Math.round(520 * ppu));
  ctx.fillStyle = GANTRY_STEEL;
  ctx.fillRect(leftLegX, topY, spanW, beamH);
  ctx.fillStyle = GANTRY_STEEL_LIGHT;
  ctx.fillRect(leftLegX, topY, spanW, Math.max(1, Math.round(beamH * 0.25)));

  // Suspended Highway Overhead Directional Signs (Shuto Expressway Emerald Green)
  const signH = Math.max(4, Math.round(1350 * ppu));
  const signW = Math.max(8, Math.round(spanW * 0.38));
  const signY = topY + beamH + Math.max(1, Math.round(120 * ppu));

  // Left Sign: Destination / Expressway Route
  const leftSignX = Math.round(x - signW - spanW * 0.04);
  ctx.fillStyle = GANTRY_SIGN_BORDER;
  ctx.fillRect(leftSignX - 1, signY - 1, signW + 2, signH + 2);
  ctx.fillStyle = GANTRY_SIGN_GREEN;
  ctx.fillRect(leftSignX, signY, signW, signH);

  // Right Sign: Route Fork / Destination
  const rightSignX = Math.round(x + spanW * 0.04);
  ctx.fillStyle = GANTRY_SIGN_BORDER;
  ctx.fillRect(rightSignX - 1, signY - 1, signW + 2, signH + 2);
  ctx.fillStyle = GANTRY_SIGN_GREEN;
  ctx.fillRect(rightSignX, signY, signW, signH);

  // White directional arrows and stylized kanji glyphs
  if (signW >= 16 && signH >= 8) {
    ctx.fillStyle = '#ffffff';
    // Left Sign glyphs: ⬆ 湾岸 WANGAN
    ctx.fillRect(leftSignX + 2, signY + Math.round(signH * 0.25), Math.max(1, Math.round(signW * 0.1)), Math.max(2, Math.round(signH * 0.5)));
    ctx.fillRect(leftSignX + Math.round(signW * 0.2), signY + Math.round(signH * 0.3), Math.max(2, Math.round(signW * 0.45)), Math.max(2, Math.round(signH * 0.4)));

    // Right Sign glyphs: ⬆ 秋葉原 AKIBA
    ctx.fillRect(rightSignX + 2, signY + Math.round(signH * 0.25), Math.max(1, Math.round(signW * 0.1)), Math.max(2, Math.round(signH * 0.5)));
    ctx.fillRect(rightSignX + Math.round(signW * 0.2), signY + Math.round(signH * 0.3), Math.max(2, Math.round(signW * 0.45)), Math.max(2, Math.round(signH * 0.4)));
  }
}

// ---------------------------------------------------------------------------
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
  side: number,
  beatPulse: number,
): void {
  const w = Math.max(5, Math.round(1800 * ppu));
  const h = Math.max(4, Math.round(1100 * ppu));
  const postH = Math.max(2, Math.round(700 * ppu));
  const left = Math.round(x - w * 0.5);
  const topY = Math.round(y - postH - h);

  // Twin support posts
  ctx.fillStyle = '#26203a';
  ctx.fillRect(Math.round(left + w * 0.2), y - postH, 1, postH);
  ctx.fillRect(Math.round(left + w * 0.8), y - postH, 1, postH);

  // Black sign board
  ctx.fillStyle = CHEVRON_BG;
  ctx.fillRect(left, topY, w, h);

  // Neon trim
  ctx.fillStyle = side < 0 ? CHEVRON_CYAN : CHEVRON_MAGENTA;
  ctx.fillRect(left, topY, w, 1);
  ctx.fillRect(left, topY + h - 1, w, 1);

  // 3 Directional Chevron Arrows (<<< left turn, >>> right turn)
  const isPulse = beatPulse > 0.4;
  const arrowW = Math.max(1, Math.round(w * 0.18));
  const arrowH = Math.max(2, Math.round(h * 0.65));
  const arrowY = topY + Math.round((h - arrowH) * 0.5);

  ctx.fillStyle = isPulse ? '#ffffff' : side < 0 ? CHEVRON_CYAN : CHEVRON_MAGENTA;

  for (let c = 0; c < 3; c++) {
    const ax = left + Math.round(w * 0.15) + c * Math.round(w * 0.28);
    if (side > 0) {
      // Right Chevron: >>>
      ctx.fillRect(ax, arrowY, Math.max(1, Math.round(arrowW * 0.45)), arrowH);
      ctx.fillRect(ax + Math.round(arrowW * 0.45), arrowY + Math.round(arrowH * 0.25), Math.max(1, Math.round(arrowW * 0.45)), Math.max(1, Math.round(arrowH * 0.5)));
    } else {
      // Left Chevron: <<<
      ctx.fillRect(ax + Math.round(arrowW * 0.45), arrowY, Math.max(1, Math.round(arrowW * 0.45)), arrowH);
      ctx.fillRect(ax, arrowY + Math.round(arrowH * 0.25), Math.max(1, Math.round(arrowW * 0.45)), Math.max(1, Math.round(arrowH * 0.5)));
    }
  }
}

// ---------------------------------------------------------------------------
// 10. POWER PYLON (Japanese Delta Transmission Tower with Overhead Cables)
// ---------------------------------------------------------------------------
function drawPylon(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  ppu: number,
): void {
  const h = Math.max(20, Math.round(10200 * ppu));
  const baseW = Math.max(6, Math.round(3400 * ppu));
  const rx = Math.round(x);
  const topY = Math.round(y - h);

  // Ground concrete footings
  ctx.fillStyle = '#140d24';
  ctx.fillRect(Math.round(rx - baseW * 0.5), y - 2, baseW, 2);

  // Waist geometry (narrows at ~42% height from ground)
  const waistY = Math.round(y - h * 0.42);
  const waistW = Math.max(2, Math.round(baseW * 0.38));

  ctx.fillStyle = PYLON_STEEL;
  // Lower tapered legs (from ground to waist)
  const legThick = Math.max(1, Math.round(baseW * 0.05));
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

  // Lower leg X-bracing
  if (baseW >= 12) {
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
  if (baseW >= 14) {
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

  // --- HANGING INSULATOR STRINGS (5 attachment points) ---
  const insH = Math.max(3, Math.round(h * 0.08));
  const insAttachY = hornTipY + trussH;
  const insAttachMidY = vTopY + trussH;

  const insX1 = leftHornX + 2;
  const insX2 = Math.round(rx - vTopW * 0.52);
  const insX3 = rx;
  const insX4 = Math.round(rx + vTopW * 0.52);
  const insX5 = rightHornX - 2;

  // Draw insulator strings (porcelain mint/cyan)
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

  // --- HIGH VOLTAGE TRANSMISSION LINES (Cables spanning horizontally across the sky) ---
  ctx.strokeStyle = '#2d1c4a';
  ctx.lineWidth = 1;
  const cableSpan = Math.max(40, Math.round(baseW * 2.8));

  // Wire 1: Far left
  ctx.beginPath();
  ctx.moveTo(insX1 - cableSpan, insAttachY + insH - Math.round(h * 0.03));
  if (typeof ctx.quadraticCurveTo === 'function') {
    ctx.quadraticCurveTo(insX1 - cableSpan * 0.5, insAttachY + insH + 2, insX1, insAttachY + insH);
  } else {
    ctx.lineTo(insX1, insAttachY + insH);
  }
  ctx.stroke();

  // Wire 2: Mid left
  ctx.beginPath();
  ctx.moveTo(insX2 - cableSpan, insAttachMidY + insH - Math.round(h * 0.03));
  if (typeof ctx.quadraticCurveTo === 'function') {
    ctx.quadraticCurveTo(insX2 - cableSpan * 0.5, insAttachMidY + insH + 2, insX2, insAttachMidY + insH);
  } else {
    ctx.lineTo(insX2, insAttachMidY + insH);
  }
  ctx.stroke();

  // Wire 3: Center wire spanning through the V
  ctx.beginPath();
  ctx.moveTo(insX3 - cableSpan * 0.8, insAttachMidY + insH - Math.round(h * 0.02));
  if (typeof ctx.quadraticCurveTo === 'function') {
    ctx.quadraticCurveTo(insX3, insAttachMidY + insH + 3, insX3 + cableSpan * 0.8, insAttachMidY + insH - Math.round(h * 0.02));
  } else {
    ctx.lineTo(insX3 + cableSpan * 0.8, insAttachMidY + insH - Math.round(h * 0.02));
  }
  ctx.stroke();

  // Wire 4: Mid right
  ctx.beginPath();
  ctx.moveTo(insX4, insAttachMidY + insH);
  if (typeof ctx.quadraticCurveTo === 'function') {
    ctx.quadraticCurveTo(insX4 + cableSpan * 0.5, insAttachMidY + insH + 2, insX4 + cableSpan, insAttachMidY + insH - Math.round(h * 0.03));
  } else {
    ctx.lineTo(insX4 + cableSpan, insAttachMidY + insH - Math.round(h * 0.03));
  }
  ctx.stroke();

  // Wire 5: Far right
  ctx.beginPath();
  ctx.moveTo(insX5, insAttachY + insH);
  if (typeof ctx.quadraticCurveTo === 'function') {
    ctx.quadraticCurveTo(insX5 + cableSpan * 0.5, insAttachY + insH + 2, insX5 + cableSpan, insAttachY + insH - Math.round(h * 0.03));
  } else {
    ctx.lineTo(insX5 + cableSpan, insAttachY + insH - Math.round(h * 0.03));
  }
  ctx.stroke();

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
    ctx.fillStyle = SHRUB_SHADE[v]!;
    ctx.fillRect(left, topY + Math.round(h * 0.35), w, Math.round(h * 0.65));

    // Upper illuminated foliage domes
    ctx.fillStyle = SHRUB_BODY[v]!;
    ctx.fillRect(left + Math.round(w * 0.15), topY, Math.round(w * 0.7), Math.round(h * 0.65));
    ctx.fillRect(left, topY + Math.round(h * 0.25), Math.round(w * 0.45), Math.round(h * 0.5));
    ctx.fillRect(left + Math.round(w * 0.55), topY + Math.round(h * 0.25), Math.round(w * 0.45), Math.round(h * 0.5));

    // Top highlight rim
    ctx.fillStyle = '#ffffff';
    ctx.globalAlpha = 0.35;
    ctx.fillRect(left + Math.round(w * 0.25), topY, Math.round(w * 0.5), 1);
    ctx.globalAlpha = 1;
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
    ctx.fillStyle = SHRUB_SHADE[v]!;
    ctx.fillRect(left, lowerY + Math.round(lowerH * 0.3), lowerW, Math.round(lowerH * 0.7));
    ctx.fillStyle = SHRUB_BODY[v]!;
    ctx.fillRect(left + 1, lowerY, lowerW - 2, Math.round(lowerH * 0.6));

    // Upper Tier Foliage Pad (Right/Center side)
    const upperW = Math.max(2, Math.round(w * 0.65));
    const upperH = Math.max(2, Math.round(h * 0.42));
    const upperX = Math.round(x - w * 0.15);
    ctx.fillStyle = SHRUB_SHADE[v]!;
    ctx.fillRect(upperX, topY + Math.round(upperH * 0.3), upperW, Math.round(upperH * 0.7));
    ctx.fillStyle = SHRUB_BODY[v]!;
    ctx.fillRect(upperX + 1, topY, upperW - 2, Math.round(upperH * 0.6));

    // Vibrant flowering blossoms / synthwave highlight tips
    ctx.fillStyle = v === 0 ? '#ff007f' : v === 1 ? '#00f5d4' : '#ffd166';
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

    // Black sharp curve arrow glyph
    if (diam >= 8) {
      ctx.fillStyle = '#080414';
      const arrowH = Math.max(2, Math.round(diam * 0.45));
      const arrowW = Math.max(2, Math.round(diam * 0.35));
      const dir = side < 0 ? -1 : 1;
      const ax = rx + dir * Math.round(arrowW * 0.2);
      const ay = signCenterY - Math.round(arrowH * 0.35);

      ctx.fillRect(Math.round(ax - arrowW * 0.5), ay, arrowW, 2);
      ctx.fillRect(Math.round(ax - arrowW * 0.5), ay, 2, arrowH);
      ctx.fillRect(Math.round(ax - arrowW * 0.5), ay + arrowH - 2, arrowW, 2);
    }
  }
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
): void {
  switch (kind) {
    case 'palm':
      drawPalm(ctx, x, y, ppu, side, variant);
      break;
    case 'lamp':
      drawLamp(ctx, x, y, ppu, side);
      break;
    case 'billboard':
      drawBillboard(ctx, x, y, ppu, variant);
      break;
    case 'building':
      drawBuilding(ctx, x, y, ppu, side, variant);
      break;
    case 'jihanki':
      drawJihanki(ctx, x, y, ppu, variant);
      break;
    case 'phonebooth':
      drawPhonebooth(ctx, x, y, ppu);
      break;
    case 'gantry':
      drawGantry(ctx, x, y, ppu);
      break;
    case 'vms':
      drawVMS(ctx, x, y, ppu, variant, beatPulse);
      break;
    case 'chevron':
      drawChevron(ctx, x, y, ppu, side, beatPulse);
      break;
    case 'pylon':
      drawPylon(ctx, x, y, ppu);
      break;
    case 'shrub':
      drawShrub(ctx, x, y, ppu, variant);
      break;
    case 'sign':
      drawSign(ctx, x, y, ppu, side, variant);
      break;
  }
}
