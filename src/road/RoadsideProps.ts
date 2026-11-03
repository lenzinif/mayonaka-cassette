import type { PropKind } from './RoadSegment';

/**
 * 16-bit pixel-art roadside props with distance-aware LOD & procedural fallback
 * (AGENTS.md §4.3, §4.4 & §5 M7).
 *
 * All world dimensions scale via `ppu` (pixels per world unit at the segment's projected depth).
 * `side` is `-1` left of the road, `+1` right. Zero allocations during rendering.
 */

const PALM_TRUNK = '#3a1d5c';
const PALM_TRUNK_LIGHT = '#6c34a3';
const PALM_LEAVES = ['#14f1d9', '#ff3cac', '#7b5cff'] as const;
const PALM_LEAF_SHADE = ['#08877a', '#a31564', '#43248a'] as const;
const LAMP_POLE = '#3d3358';
const LAMP_POLE_EDGE = '#6e5f94';
const LAMP_LIGHT = '#fff3b0';
const BILLBOARD_FACE = ['#ff2a6d', '#05d9e8', '#ffd319'] as const;
const BILLBOARD_FRAME = '#1a0f2b';

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

  // Segmented pixel-art curved trunk (stepped bark rings when close; fast stroke when far)
  if (trunkW >= 2.5) {
    const rings = 8;
    for (let r = 0; r < rings; r++) {
      const t0 = r / rings;
      const t1 = (r + 1) / rings;
      const rx = Math.round(x + lean * (t0 * t0));
      const ry = Math.round(y - h * t1);
      const segH = Math.max(2, Math.ceil((h / rings) + 1));
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
    ctx.strokeStyle = PALM_TRUNK;
    ctx.lineWidth = trunkW;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(x, y - h * 0.6, topX, topY);
    ctx.stroke();
  }

  // Pixel-art palm crown & fronds
  const leaf = 1320 * ppu;
  const leafColor = PALM_LEAVES[variant % PALM_LEAVES.length]!;
  const shadeColor = PALM_LEAF_SHADE[variant % PALM_LEAF_SHADE.length]!;

  // Coconut cluster at crown base
  if (trunkW >= 2.5) {
    const cocoR = Math.max(2, Math.round(trunkW * 0.55));
    ctx.fillStyle = '#240b36';
    ctx.fillRect(Math.round(topX - cocoR), Math.round(topY - cocoR * 0.4), cocoR * 2, cocoR);
  }

  for (let i = 0; i < 6; i++) {
    const a = -Math.PI + (i / 5) * Math.PI;
    const tipX = topX + Math.cos(a) * leaf;
    const tipY = topY + Math.sin(a) * leaf * 0.45 + leaf * 0.35;
    const midX = topX + Math.cos(a) * leaf * 0.5;
    const midY = topY + Math.sin(a) * leaf * 0.5 - leaf * 0.12;

    if (leaf >= 10) {
      // Stepped pixel-art frond segments with dual-tone neon shading
      const steps = 5;
      for (let s = 0; s < steps; s++) {
        const u = s / (steps - 1);
        const inv = 1 - u;
        const px = Math.round(inv * inv * topX + 2 * inv * u * midX + u * u * tipX);
        const py = Math.round(inv * inv * topY + 2 * inv * u * (midY - leaf * 0.08) + u * u * tipY);
        const blockW = Math.max(2, Math.round(leaf * (0.22 - u * 0.12)));
        const blockH = Math.max(2, Math.round(leaf * (0.12 + u * 0.06)));
        ctx.fillStyle = shadeColor;
        ctx.fillRect(px - Math.floor(blockW * 0.5), py + 1, blockW, blockH);
        ctx.fillStyle = leafColor;
        ctx.fillRect(px - Math.floor(blockW * 0.5), py - 1, blockW, Math.max(1, blockH - 1));
      }
    } else {
      ctx.fillStyle = leafColor;
      ctx.beginPath();
      ctx.moveTo(topX, topY);
      ctx.quadraticCurveTo(midX, midY - leaf * 0.12, tipX, tipY);
      ctx.quadraticCurveTo(midX, midY + leaf * 0.1, topX, topY);
      ctx.fill();
    }
  }
}

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
    // Pixel-stepped warm sodium/cyan glow aura
    ctx.fillStyle = 'rgba(255, 243, 176, 0.22)';
    ctx.fillRect(lampX - Math.round(lw * 0.45), lampY - lh, Math.round(lw * 1.9), lh * 4);
    ctx.fillStyle = 'rgba(5, 217, 232, 0.25)';
    ctx.fillRect(lampX - Math.round(lw * 0.2), lampY, Math.round(lw * 1.4), lh * 2);
  }

  ctx.fillStyle = LAMP_LIGHT;
  ctx.fillRect(lampX, lampY, lw, lh);
}

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

  // Support legs + truss crossbars
  const leftLegX = Math.round(rx - w * 0.3 - legW * 0.5);
  const rightLegX = Math.round(rx + w * 0.3 - legW * 0.5);
  ctx.fillStyle = BILLBOARD_FRAME;
  ctx.fillRect(leftLegX, ry - legH, legW, legH);
  ctx.fillRect(rightLegX, ry - legH, legW, legH);
  if (legH >= 6) {
    ctx.fillStyle = '#3d3358';
    ctx.fillRect(leftLegX, Math.round(ry - legH * 0.55), rightLegX - leftLegX + legW, Math.max(1, Math.round(legW * 0.45)));
  }

  // Outer billboard casing
  ctx.fillStyle = BILLBOARD_FRAME;
  ctx.fillRect(left, top, w, h);

  // Top spotlight fixtures & lower catwalk ledge
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

  // Pixel-art ad motif inside the billboard face
  if (innerW >= 12 && innerH >= 6) {
    if (v === 0) {
      // Variant 0 (Magenta): Kissaten Melon Soda Cup icon + sunset stripes
      const cupW = Math.max(3, Math.round(innerW * 0.22));
      const cupH = Math.max(4, Math.round(innerH * 0.72));
      const cupX = innerX + Math.round(innerW * 0.1);
      const cupY = innerY + Math.round((innerH - cupH) * 0.5);
      ctx.fillStyle = '#00f59b';
      ctx.fillRect(cupX, cupY, cupW, cupH);
      ctx.fillStyle = '#fff6d6';
      ctx.fillRect(cupX, cupY, cupW, Math.max(1, Math.round(cupH * 0.28)));
      // Sunset stripes on right
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
      // Variant 1 (Cyan): OutRun FM 88.4 Cassette + Equalizer bars
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
      // Variant 2 (Amber): Wangan Turbo crimson synth sun + speed chevrons
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
    // Low-LOD distant sunset stripes
    ctx.fillStyle = BILLBOARD_FRAME;
    for (let i = 1; i <= 3; i++) {
      const sh = Math.max(1, (innerH) * 0.06 * i);
      ctx.fillRect(innerX, innerY + innerH * (0.35 + i * 0.15), innerW, sh);
    }
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
  }
}
