import { LANES, MAX_DRAW_DISTANCE } from '@src/config/constants';
import type { StagePalette } from './palette';
import { exponentialFog, interpolate, percentRemaining, project } from './RoadProjection';
import { findSegment, type RoadSegment, type Track } from './RoadSegment';
import { drawProp } from './RoadsideProps';

/** Per-frame camera/view parameters. The caller owns and reuses this object. */
export interface RoadView {
  position: number;
  playerX: number;
  cameraHeight: number;
  cameraDepth: number;
  roadWidth: number;
  drawDistance: number;
  fogDensity: number;
  width: number;
  height: number;
}

/**
 * Pseudo-3D road renderer.
 *
 * Pass 1 (near → far) projects segments, accumulating curvature into a horizontal offset.
 * Pass 2 (far → near) paints road and sprites with the Painter's Algorithm: nearer road slices
 * overwrite farther ones, so hill crests correctly hide whatever lies behind them, sprites included.
 */
export class RoadRenderer {
  private readonly visible: RoadSegment[] = new Array<RoadSegment>(MAX_DRAW_DISTANCE);

  render(ctx: CanvasRenderingContext2D, track: Track, view: RoadView, palette: StagePalette): void {
    const { segments, segmentLength, length: trackLength } = track;
    const { position, playerX, cameraDepth, roadWidth, width, height } = view;
    const drawDistance = Math.min(
      Math.floor(view.drawDistance),
      MAX_DRAW_DISTANCE,
      segments.length,
    );
    const playerZ = view.cameraHeight * cameraDepth;

    const base = findSegment(track, position);
    const basePercent = percentRemaining(position, segmentLength);
    const playerSeg = findSegment(track, position + playerZ);
    const playerPercent = percentRemaining(position + playerZ, segmentLength);
    const cameraY =
      interpolate(playerSeg.p1.worldY, playerSeg.p2.worldY, playerPercent) + view.cameraHeight;
    const cameraXBase = playerX * roadWidth;

    // Pass 1: projection.
    let x = 0;
    let dx = -(base.curve * basePercent);
    for (let n = 0; n < drawDistance; n++) {
      const seg = segments[(base.index + n) % segments.length]!;
      const cameraZ = position - (seg.index < base.index ? trackLength : 0);
      seg.fog = exponentialFog(n / drawDistance, view.fogDensity);
      project(seg.p1, cameraXBase - x, cameraY, cameraZ, cameraDepth, width, height, roadWidth);
      project(
        seg.p2,
        cameraXBase - x - dx,
        cameraY,
        cameraZ,
        cameraDepth,
        width,
        height,
        roadWidth,
      );
      x += dx;
      dx += seg.curve;
      this.visible[n] = seg;
    }

    // Pass 2: painter's algorithm.
    for (let n = drawDistance - 1; n >= 0; n--) {
      const seg = this.visible[n]!;
      const { p1, p2 } = seg;
      if (p1.cameraZ <= cameraDepth) continue; // behind the projection plane

      if (p2.screenY < p1.screenY) {
        this.renderSegment(ctx, width, seg, palette);
      }

      const sprites = seg.sprites;
      if (sprites.length === 0) continue;
      const ppu = (p1.scale * width) / 2;
      if (ppu < 0.0015) continue;
      ctx.globalAlpha = Math.min(1, seg.fog * 1.5);
      for (let i = 0; i < sprites.length; i++) {
        const s = sprites[i]!;
        const sx = p1.screenX + p1.screenW * s.offset;
        if (sx < -width * 0.5 || sx > width * 1.5) continue;
        drawProp(
          ctx,
          s.kind,
          sx,
          p1.screenY,
          (ppu * roadWidth) / 2000,
          s.offset < 0 ? -1 : 1,
          s.variant,
        );
      }
      ctx.globalAlpha = 1;
    }
  }

  private renderSegment(
    ctx: CanvasRenderingContext2D,
    width: number,
    seg: RoadSegment,
    palette: StagePalette,
  ): void {
    const { p1, p2, stripe } = seg;
    const x1 = p1.screenX;
    const y1 = p1.screenY;
    const w1 = p1.screenW;
    const x2 = p2.screenX;
    const y2 = p2.screenY - 1; // 1px overlap hides anti-aliasing seams between slices
    const w2 = p2.screenW;
    const r1 = w1 / Math.max(6, 2 * LANES);
    const r2 = w2 / Math.max(6, 2 * LANES);

    ctx.fillStyle = palette.grass[stripe];
    ctx.fillRect(0, y2, width, y1 - y2);

    ctx.fillStyle = palette.rumble[stripe];
    polygon(ctx, x1 - w1 - r1, y1, x1 - w1, y1, x2 - w2, y2, x2 - w2 - r2, y2);
    polygon(ctx, x1 + w1 + r1, y1, x1 + w1, y1, x2 + w2, y2, x2 + w2 + r2, y2);

    ctx.fillStyle = palette.road[stripe];
    polygon(ctx, x1 - w1, y1, x1 + w1, y1, x2 + w2, y2, x2 - w2, y2);

    if (stripe === 0) {
      const l1 = w1 / Math.max(32, 8 * LANES);
      const l2 = w2 / Math.max(32, 8 * LANES);
      const laneW1 = (w1 * 2) / LANES;
      const laneW2 = (w2 * 2) / LANES;
      let lx1 = x1 - w1 + laneW1;
      let lx2 = x2 - w2 + laneW2;
      ctx.fillStyle = palette.lane;
      for (let lane = 1; lane < LANES; lane++) {
        polygon(ctx, lx1 - l1 / 2, y1, lx1 + l1 / 2, y1, lx2 + l2 / 2, y2, lx2 - l2 / 2, y2);
        lx1 += laneW1;
        lx2 += laneW2;
      }
    }

    if (seg.fog < 1) {
      ctx.globalAlpha = 1 - seg.fog;
      ctx.fillStyle = palette.fog;
      ctx.fillRect(0, y2, width, y1 - y2);
      ctx.globalAlpha = 1;
    }
  }
}

function polygon(
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  x3: number,
  y3: number,
  x4: number,
  y4: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.lineTo(x3, y3);
  ctx.lineTo(x4, y4);
  ctx.closePath();
  ctx.fill();
}
