import type { PropKind } from './RoadSegment';

/**
 * Procedural greybox props (AGENTS.md §4: every sprite must have a polygon fallback, so the game
 * is fully playable with zero image assets). All sizes are in world units; `ppu` converts world
 * units to screen pixels at the sprite's depth. `side` is -1 left of the road, +1 right.
 */

const PALM_TRUNK = '#3a1d5c';
const PALM_TRUNK_LIGHT = '#5b2d86';
const PALM_LEAVES = ['#14f1d9', '#ff3cac', '#7b5cff'] as const;
const LAMP_POLE = '#3d3358';
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
  const trunkW = Math.max(1, 110 * ppu);
  const topX = x + lean;
  const topY = y - h;

  ctx.strokeStyle = PALM_TRUNK;
  ctx.lineWidth = trunkW;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.quadraticCurveTo(x, y - h * 0.6, topX, topY);
  ctx.stroke();
  if (trunkW > 3) {
    ctx.strokeStyle = PALM_TRUNK_LIGHT;
    ctx.lineWidth = trunkW * 0.35;
    ctx.stroke();
  }

  const leaf = 1300 * ppu;
  ctx.fillStyle = PALM_LEAVES[variant % PALM_LEAVES.length]!;
  for (let i = 0; i < 6; i++) {
    const a = -Math.PI + (i / 5) * Math.PI; // fan from left to right across the top
    const tipX = topX + Math.cos(a) * leaf;
    const tipY = topY + Math.sin(a) * leaf * 0.45 + leaf * 0.35;
    const midX = topX + Math.cos(a) * leaf * 0.5;
    const midY = topY + Math.sin(a) * leaf * 0.5 - leaf * 0.12;
    ctx.beginPath();
    ctx.moveTo(topX, topY);
    ctx.quadraticCurveTo(midX, midY - leaf * 0.12, tipX, tipY);
    ctx.quadraticCurveTo(midX, midY + leaf * 0.1, topX, topY);
    ctx.fill();
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
  const arm = 700 * ppu * -side;
  const w = Math.max(1, 70 * ppu);
  ctx.fillStyle = LAMP_POLE;
  ctx.fillRect(x - w / 2, y - h, w, h);
  ctx.fillRect(Math.min(x, x + arm), y - h, Math.abs(arm), w);
  const lw = 260 * ppu;
  const lh = Math.max(1, 70 * ppu);
  ctx.fillStyle = LAMP_LIGHT;
  ctx.fillRect(x + arm - lw / 2, y - h + w, lw, lh);
}

function drawBillboard(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  ppu: number,
  variant: number,
): void {
  const w = 2600 * ppu;
  const h = 1300 * ppu;
  const legH = 1100 * ppu;
  const legW = Math.max(1, 90 * ppu);
  ctx.fillStyle = BILLBOARD_FRAME;
  ctx.fillRect(x - w * 0.3 - legW / 2, y - legH, legW, legH);
  ctx.fillRect(x + w * 0.3 - legW / 2, y - legH, legW, legH);
  const top = y - legH - h;
  ctx.fillRect(x - w / 2, top, w, h);
  const pad = Math.max(1, 80 * ppu);
  ctx.fillStyle = BILLBOARD_FACE[variant % BILLBOARD_FACE.length]!;
  ctx.fillRect(x - w / 2 + pad, top + pad, w - pad * 2, h - pad * 2);
  // Retro "sunset" stripes as a stand-in for billboard art.
  ctx.fillStyle = BILLBOARD_FRAME;
  for (let i = 1; i <= 3; i++) {
    const sh = (h - pad * 2) * 0.06 * i;
    ctx.fillRect(x - w / 2 + pad, top + pad + (h - pad * 2) * (0.35 + i * 0.15), w - pad * 2, sh);
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
