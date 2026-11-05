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
// 4. AKIBA URBAN CANYON FACADE & VERTICAL NEON SIGNS
// ---------------------------------------------------------------------------
function drawBuilding(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  ppu: number,
  side: number,
  variant: number,
): void {
  const w = Math.max(6, Math.round(3400 * ppu));
  const h = Math.max(14, Math.round(7600 * ppu));
  const topY = Math.round(y - h);
  const rx = Math.round(x);
  // Anchor building so its inner wall borders the sidewalk
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

  // Distant Low LOD: solid tower with single neon roof edge
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

  // Neon sign body
  ctx.fillStyle = BUILDING_SIGN_BG[v]!;
  ctx.fillRect(signX, signY, signW, signH);

  // Glowing pixel glyphs inside the blade sign
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

  // Rooftop communication antenna & blinking aviation beacon
  const antH = Math.max(3, Math.round(h * 0.18));
  const antX = side < 0 ? left + Math.round(w * 0.3) : left + Math.round(w * 0.7);
  ctx.fillStyle = '#1b1035';
  ctx.fillRect(antX, topY - antH, 1, antH);
  ctx.fillStyle = '#ff0055';
  ctx.fillRect(antX - 1, topY - antH - 1, 2, 2);
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
// 8. VARIABLE MESSAGE SIGN (Amber LED Matrix with Future Funk Advisories)
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
      // GROOVE AHEAD / 120 BPM
      ctx.fillRect(innerX + 4, line1Y, Math.max(4, Math.round(innerW * 0.75)), textH);
      ctx.fillStyle = VMS_LED_BRIGHT;
      ctx.fillRect(innerX + 4, line2Y, Math.max(4, Math.round(innerW * 0.5)), textH);
    } else if (v === 1) {
      // TOFU WARNING / NO SPILL
      ctx.fillRect(innerX + 4, line1Y, Math.max(4, Math.round(innerW * 0.8)), textH);
      ctx.fillStyle = VMS_LED_BRIGHT;
      ctx.fillRect(innerX + 4, line2Y, Math.max(4, Math.round(innerW * 0.6)), textH);
    } else if (v === 2) {
      // SPEED CHECK / RADAR 180
      ctx.fillRect(innerX + 4, line1Y, Math.max(4, Math.round(innerW * 0.7)), textH);
      ctx.fillStyle = VMS_LED_BRIGHT;
      ctx.fillRect(innerX + 4, line2Y, Math.max(4, Math.round(innerW * 0.65)), textH);
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
// 10. POWER PYLON (Japanese Electrical Transmission Tower)
// ---------------------------------------------------------------------------
function drawPylon(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  ppu: number,
): void {
  const h = Math.max(16, Math.round(9200 * ppu));
  const baseW = Math.max(4, Math.round(2400 * ppu));
  const rx = Math.round(x);
  const topY = Math.round(y - h);

  // Ground concrete pads
  ctx.fillStyle = '#140d24';
  ctx.fillRect(Math.round(rx - baseW * 0.5), y - 2, baseW, 2);

  // Tapered lattice legs
  ctx.fillStyle = PYLON_STEEL;
  ctx.fillRect(Math.round(rx - baseW * 0.5), y - Math.round(h * 0.4), Math.max(1, Math.round(baseW * 0.08)), Math.round(h * 0.4));
  ctx.fillRect(Math.round(rx + baseW * 0.5 - baseW * 0.08), y - Math.round(h * 0.4), Math.max(1, Math.round(baseW * 0.08)), Math.round(h * 0.4));

  // Upper tapered pylon body
  const bodyW = Math.max(2, Math.round(baseW * 0.45));
  ctx.fillRect(Math.round(rx - bodyW * 0.5), topY, bodyW, Math.round(h * 0.65));

  // 3 Cantilever Cross-Arms holding electrical cables
  const armWidths = [1.8, 1.5, 1.2] as const;
  const armHeights = [0.32, 0.48, 0.64] as const;
  ctx.fillStyle = PYLON_STEEL_LIGHT;

  for (let a = 0; a < 3; a++) {
    const aw = Math.max(4, Math.round(baseW * armWidths[a]!));
    const ay = topY + Math.round(h * armHeights[a]!);
    ctx.fillRect(Math.round(rx - aw * 0.5), ay, aw, Math.max(1, Math.round(h * 0.025)));
    // Hanging insulator bells
    ctx.fillStyle = '#00f5d4';
    ctx.fillRect(Math.round(rx - aw * 0.5), ay + 1, 1, Math.max(2, Math.round(h * 0.04)));
    ctx.fillRect(Math.round(rx + aw * 0.5 - 1), ay + 1, 1, Math.max(2, Math.round(h * 0.04)));
    ctx.fillStyle = PYLON_STEEL_LIGHT;
  }

  // Red Aviation Warning Pinnacle Beacon
  ctx.fillStyle = PYLON_BEACON;
  ctx.fillRect(rx - 1, topY - 2, 2, 2);
}

// ---------------------------------------------------------------------------
// 11. ROADSIDE SHRUB (Foliage & Hedges)
// ---------------------------------------------------------------------------
function drawShrub(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  ppu: number,
  variant: number,
): void {
  const w = Math.max(3, Math.round(1400 * ppu));
  const h = Math.max(2, Math.round(750 * ppu));
  const left = Math.round(x - w * 0.5);
  const topY = Math.round(y - h);
  const v = variant % SHRUB_BODY.length;

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
  }
}
