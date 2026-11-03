import { LANES, MAX_DRAW_DISTANCE } from '@src/config/constants';
import { tuning } from '@src/config/tuning';
import { drawKeiTruck, type TrafficManager } from '@src/entities/TrafficAndProps';
import type { StagePalette } from './palette';
import { exponentialFog, interpolate, percentRemaining, project } from './RoadProjection';
import {
  findSegment,
  getChosenForkCenter,
  getChosenForkHalfWidth,
  getEffectivePropOffset,
  getEffectiveTruckLaneOffset,
  type RoadSegment,
  type Track,
} from './RoadSegment';
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
  beatPulse?: number;
  /** World Z where the OutRun stage fork split begins (`undefined` when no fork is active). */
  forkZoneStartZ?: number;
  /** Currently selected branch at the stage fork (`'left'` = loop, `'right'` = next track). */
  forkChoice?: 'left' | 'right';
}

/**
 * Diagnostics & performance statistics gathered during road rendering (M8 Performance Profiler).
 */
export interface RoadRenderStats {
  drawnSegments: number;
  drawnProps: number;
  drawnTrucks: number;
}

/**
 * Pseudo-3D road renderer.
 *
 * Pass 1 (near → far) projects segments, accumulating curvature into a horizontal offset.
 * Pass 2 (far → near) paints road, roadside props, and AI Kei Truck traffic with the Painter's
 * Algorithm: nearer road slices overwrite farther ones, so hill crests naturally occlude geometry
 * and traffic behind them.
 */
export class RoadRenderer {
  private readonly visible: RoadSegment[] = new Array<RoadSegment>(MAX_DRAW_DISTANCE);
  private readonly clipY = new Float32Array(MAX_DRAW_DISTANCE);

  /** Pre-allocated rendering statistics updated every frame without GC allocations (AGENTS.md §4.3). */
  readonly stats: RoadRenderStats = {
    drawnSegments: 0,
    drawnProps: 0,
    drawnTrucks: 0,
  };

  render(
    ctx: CanvasRenderingContext2D,
    track: Track,
    view: RoadView,
    palette: StagePalette,
    traffic?: TrafficManager,
  ): void {
    this.stats.drawnSegments = 0;
    this.stats.drawnProps = 0;
    this.stats.drawnTrucks = 0;

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

    // Pass 1: front-to-back projection & hill-crest occlusion horizon (maxy).
    let x = 0;
    let dx = -(base.curve * basePercent);
    let maxy = height;
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
      this.clipY[n] = maxy;

      if (
        seg.p1.cameraZ > cameraDepth &&
        seg.p2.screenY < seg.p1.screenY &&
        seg.p2.screenY < maxy
      ) {
        maxy = seg.p2.screenY;
      }
    }

    // Pass 2: painter's algorithm (back-to-front).
    for (let n = drawDistance - 1; n >= 0; n--) {
      const seg = this.visible[n]!;
      const { p1, p2 } = seg;
      if (p1.cameraZ <= cameraDepth) continue; // behind the projection plane

      const segClipY = this.clipY[n]!;
      // Skip segments occluded behind a hill crest or collapsed onto the same sub-pixel horizon line
      if (
        p2.screenY < p1.screenY &&
        p2.screenY < segClipY &&
        (n < 90 || Math.floor(p2.screenY) < Math.floor(segClipY))
      ) {
        this.stats.drawnSegments++;
        this.renderSegment(
          ctx,
          width,
          seg,
          palette,
          view.beatPulse ?? 0,
          view.forkZoneStartZ,
          trackLength,
          view.forkChoice,
          segClipY,
        );
      }

      if (seg.fog < 0.035) continue;
      const ppu = (p1.scale * width) / 2;
      const scaledPpu = (ppu * roadWidth) / 2000;
      if (scaledPpu < 0.0055) continue;

      const sprites = seg.sprites;
      const firstTruckIdx = traffic ? traffic.getFirstTruckOnSegment(seg.index) : -1;
      if (sprites.length === 0 && firstTruckIdx === -1) continue;

      // Skip segment sprites/traffic if even the tallest palm tree crown is occluded behind a hill crest
      if (p1.screenY - 3500 * scaledPpu >= segClipY) continue;

      const targetAlpha = Math.min(1, seg.fog * 1.5);
      if (targetAlpha < 0.98) {
        ctx.globalAlpha = targetAlpha;
      }

      // Roadside props (shifted outward along the widening Y-fork so props never sit on the asphalt)
      for (let i = 0; i < sprites.length; i++) {
        const s = sprites[i]!;
        const effectiveOffset = getEffectivePropOffset(
          s.offset,
          p1.worldZ,
          trackLength,
          view.forkZoneStartZ,
          view.forkChoice,
        );
        const sx = p1.screenX + p1.screenW * effectiveOffset;
        if (sx < -width * 0.35 || sx > width * 1.35) continue;
        drawProp(
          ctx,
          s.kind,
          sx,
          p1.screenY,
          scaledPpu,
          effectiveOffset < 0 ? -1 : 1,
          s.variant,
        );
        this.stats.drawnProps++;
      }

      // AI Kei Trucks on this segment (diverging onto the left/right Y-fork branch)
      if (traffic && firstTruckIdx !== -1) {
        let tIdx = firstTruckIdx;
        while (tIdx !== -1) {
          const truck = traffic.trucks[tIdx]!;
          const pct = percentRemaining(truck.z, segmentLength);
          const truckScreenY = interpolate(p1.screenY, p2.screenY, pct);
          const truckScale = interpolate(p1.scale, p2.scale, pct);
          const truckPpu = ((truckScale * width) / 2) * (roadWidth / 2000);
          if (truckScreenY - 1250 * truckPpu < segClipY) {
            const effectiveLaneOffset = getEffectiveTruckLaneOffset(
              truck.laneOffset,
              truck.id,
              truck.z,
              trackLength,
              view.forkZoneStartZ,
              view.forkChoice,
            );
            const truckScreenX =
              interpolate(p1.screenX, p2.screenX, pct) +
              interpolate(p1.screenW, p2.screenW, pct) * effectiveLaneOffset;
            if (truckScreenX >= -width * 0.25 && truckScreenX <= width * 1.25) {
              const viewParallax = ((width * 0.5 - truckScreenX) / Math.max(1, width * 0.5)) * 1.4;
              const truckRoadCurve = seg.curve + viewParallax + truck.lateralVel * 1.5;
              drawKeiTruck(
                ctx,
                truckScreenX,
                truckScreenY,
                truckPpu,
                truck.variant,
                truck.tiltAngle,
                truck.knockedTimer > 0,
                truckRoadCurve,
              );
              this.stats.drawnTrucks++;
            }
          }
          tIdx = truck.nextInSegment;
        }
      }

      if (targetAlpha < 0.98) {
        ctx.globalAlpha = 1;
      }
    }
  }

  private renderSegment(
    ctx: CanvasRenderingContext2D,
    width: number,
    seg: RoadSegment,
    palette: StagePalette,
    beatPulse = 0,
    forkZoneStartZ?: number,
    trackLength = 1,
    forkChoice?: 'left' | 'right',
    segClipY = Number.POSITIVE_INFINITY,
  ): void {
    const { p1, p2, stripe } = seg;
    const x1 = p1.screenX;
    const y1 = Math.min(p1.screenY, segClipY);
    const w1 = p1.screenW;
    const x2 = p2.screenX;
    const y2 = p2.screenY - 1; // 1px overlap hides anti-aliasing seams between slices
    const w2 = p2.screenW;
    const pulseScale = 1 + beatPulse * tuning.bpmPulseStrength * 0.28;
    const r1 = (w1 / Math.max(6, 2 * LANES)) * pulseScale;
    const r2 = (w2 / Math.max(6, 2 * LANES)) * pulseScale;

    ctx.fillStyle = palette.grass[stripe];
    ctx.fillRect(0, y2, width, y1 - y2);

    // OutRun physical Y-fork geometry in the final outro segments when forkZoneStartZ is active
    if (forkZoneStartZ !== undefined && p2.worldZ > forkZoneStartZ && trackLength > forkZoneStartZ) {
      const span = Math.max(1, trackLength - forkZoneStartZ);
      const t1 = Math.max(0, Math.min(1, (p1.worldZ - forkZoneStartZ) / span));
      const t2 = Math.max(0, Math.min(1, (p2.worldZ - forkZoneStartZ) / span));
      const choice: 'left' | 'right' = forkChoice ?? 'right';

      if (t2 <= 0.18) {
        // Phase 1: Pre-split widening zone with center chevron warning strip
        const outerW1 = w1 * (1 + (t1 / 0.18) * 0.2);
        const outerW2 = w2 * (1 + (t2 / 0.18) * 0.2);

        ctx.fillStyle = palette.rumble[stripe];
        polygon(ctx, x1 - outerW1 - r1, y1, x1 - outerW1, y1, x2 - outerW2, y2, x2 - outerW2 - r2, y2);
        polygon(ctx, x1 + outerW1 + r1, y1, x1 + outerW1, y1, x2 + outerW2, y2, x2 + outerW2 + r2, y2);

        ctx.fillStyle = palette.road[stripe];
        polygon(ctx, x1 - outerW1, y1, x1 + outerW1, y1, x2 + outerW2, y2, x2 - outerW2, y2);
        const c1 = r1 * 0.65;
        const c2 = r2 * 0.65;
        ctx.fillStyle = stripe === 0 ? '#ffd319' : '#ff2a6d';
        polygon(ctx, x1 - c1, y1, x1 + c1, y1, x2 + c2, y2, x2 - c2, y2);
      } else if (t2 <= 0.65) {
        // Phase 2: Diverging Left & Right asphalt branches with a central V-chevron median island
        const split1 = Math.max(0, (t1 - 0.18) / (0.65 - 0.18));
        const split2 = Math.max(0, (t2 - 0.18) / (0.65 - 0.18));
        const splitEase1 = split1 * split1 * (3 - 2 * split1);
        const splitEase2 = split2 * split2 * (3 - 2 * split2);

        const outerW1 = w1 * (1.2 + splitEase1 * 0.48);
        const outerW2 = w2 * (1.2 + splitEase2 * 0.48);
        const gap1 = w1 * splitEase1 * 0.52;
        const gap2 = w2 * splitEase2 * 0.52;

        // Outer rumble strips
        ctx.fillStyle = palette.rumble[stripe];
        polygon(ctx, x1 - outerW1 - r1, y1, x1 - outerW1, y1, x2 - outerW2, y2, x2 - outerW2 - r2, y2);
        polygon(ctx, x1 + outerW1 + r1, y1, x1 + outerW1, y1, x2 + outerW2, y2, x2 + outerW2 + r2, y2);

        // Left branch asphalt
        ctx.fillStyle =
          choice === 'left'
            ? stripe === 0
              ? '#392858'
              : '#31214c'
            : palette.road[stripe];
        polygon(ctx, x1 - outerW1, y1, x1 - gap1, y1, x2 - gap2, y2, x2 - outerW2, y2);

        // Right branch asphalt
        ctx.fillStyle =
          choice === 'right'
            ? stripe === 0
              ? '#392858'
              : '#31214c'
            : palette.road[stripe];
        polygon(ctx, x1 + gap1, y1, x1 + outerW1, y1, x2 + outerW2, y2, x2 + gap2, y2);

        // Inner median V-curbs
        const ir1 = r1 * 0.7;
        const ir2 = r2 * 0.7;
        ctx.fillStyle = choice === 'left' ? '#05d9e8' : palette.rumble[stripe];
        polygon(ctx, x1 - gap1 - ir1, y1, x1 - gap1, y1, x2 - gap2, y2, x2 - gap2 - ir2, y2);

        ctx.fillStyle = choice === 'right' ? '#ffd319' : palette.rumble[stripe];
        polygon(ctx, x1 + gap1, y1, x1 + gap1 + ir1, y1, x2 + gap2 + ir2, y2, x2 + gap2, y2);

        // Center guide lines down each branch
        if (stripe === 0) {
          const l1 = Math.max(1, w1 / 32);
          const l2 = Math.max(1, w2 / 32);
          const leftMid1 = x1 - (outerW1 + gap1) * 0.5;
          const leftMid2 = x2 - (outerW2 + gap2) * 0.5;
          const rightMid1 = x1 + (outerW1 + gap1) * 0.5;
          const rightMid2 = x2 + (outerW2 + gap2) * 0.5;

          ctx.fillStyle = choice === 'left' ? '#05d9e8' : palette.lane;
          polygon(ctx, leftMid1 - l1, y1, leftMid1 + l1, y1, leftMid2 + l2, y2, leftMid2 - l2, y2);

          ctx.fillStyle = choice === 'right' ? '#ffd319' : palette.lane;
          polygon(ctx, rightMid1 - l1, y1, rightMid1 + l1, y1, rightMid2 + l2, y2, rightMid2 - l2, y2);
        }
      } else {
        // Phase 3: Seamless convergence of the chosen branch back to the center road!
        const cCenter1 = getChosenForkCenter(t1, choice) * w1;
        const cCenter2 = getChosenForkCenter(t2, choice) * w2;
        const cHalfW1 = getChosenForkHalfWidth(t1) * w1;
        const cHalfW2 = getChosenForkHalfWidth(t2) * w2;

        const cLeft1 = x1 + cCenter1 - cHalfW1;
        const cRight1 = x1 + cCenter1 + cHalfW1;
        const cLeft2 = x2 + cCenter2 - cHalfW2;
        const cRight2 = x2 + cCenter2 + cHalfW2;

        // Chosen branch outer rumble strips
        ctx.fillStyle = palette.rumble[stripe];
        polygon(ctx, cLeft1 - r1, y1, cLeft1, y1, cLeft2, y2, cLeft2 - r2, y2);
        polygon(ctx, cRight1, y1, cRight1 + r1, y1, cRight2 + r2, y2, cRight2, y2);

        // Chosen branch asphalt
        ctx.fillStyle = stripe === 0 ? '#392858' : '#31214c';
        polygon(ctx, cLeft1, y1, cRight1, y1, cRight2, y2, cLeft2, y2);

        // Chosen branch center guide line (smoothly merges to normal road center line)
        if (stripe === 0) {
          const l1 = Math.max(1, w1 / 32);
          const l2 = Math.max(1, w2 / 32);
          const mid1 = x1 + cCenter1;
          const mid2 = x2 + cCenter2;
          ctx.fillStyle = choice === 'left' ? '#05d9e8' : '#ffd319';
          polygon(ctx, mid1 - l1, y1, mid1 + l1, y1, mid2 + l2, y2, mid2 - l2, y2);
        }

        // Unchosen branch curves outward and fades away into distance
        const u2 = (t2 - 0.65) / 0.35;
        const unchosenAlpha = Math.max(0, 1 - u2 * 1.4);
        if (unchosenAlpha > 0.02) {
          ctx.save();
          ctx.globalAlpha = unchosenAlpha;
          const uSign = choice === 'left' ? 1 : -1;
          const u1 = Math.max(0, (t1 - 0.65) / 0.35);
          const e1 = u1 * u1 * (3 - 2 * u1);
          const e2 = u2 * u2 * (3 - 2 * u2);

          const uCenter1 = uSign * (1.1 + 0.35 * e1) * w1;
          const uCenter2 = uSign * (1.1 + 0.35 * e2) * w2;
          const uHalfW1 = 0.58 * (1 - 0.2 * e1) * w1;
          const uHalfW2 = 0.58 * (1 - 0.2 * e2) * w2;

          const uLeft1 = x1 + uCenter1 - uHalfW1;
          const uRight1 = x1 + uCenter1 + uHalfW1;
          const uLeft2 = x2 + uCenter2 - uHalfW2;
          const uRight2 = x2 + uCenter2 + uHalfW2;

          ctx.fillStyle = palette.rumble[stripe];
          polygon(ctx, uLeft1 - r1, y1, uLeft1, y1, uLeft2, y2, uLeft2 - r2, y2);
          polygon(ctx, uRight1, y1, uRight1 + r1, y1, uRight2 + r2, y2, uRight2, y2);

          ctx.fillStyle = palette.road[stripe];
          polygon(ctx, uLeft1, y1, uRight1, y1, uRight2, y2, uLeft2, y2);
          ctx.restore();
        }
      }

      if (seg.fog < 0.975) {
        ctx.globalAlpha = 1 - seg.fog;
        ctx.fillStyle = palette.fog;
        ctx.fillRect(0, y2, width, y1 - y2);
        ctx.globalAlpha = 1;
      }
      return;
    }

    ctx.fillStyle = palette.rumble[stripe];
    polygon(ctx, x1 - w1 - r1, y1, x1 - w1, y1, x2 - w2, y2, x2 - w2 - r2, y2);
    polygon(ctx, x1 + w1 + r1, y1, x1 + w1, y1, x2 + w2, y2, x2 + w2 + r2, y2);

    ctx.fillStyle = palette.road[stripe];
    polygon(ctx, x1 - w1, y1, x1 + w1, y1, x2 + w2, y2, x2 - w2, y2);

    if (stripe === 0 && w1 >= 6) {
      const l1 = w1 / Math.max(32, 8 * LANES);
      const l2 = w2 / Math.max(32, 8 * LANES);
      const laneW1 = (w1 * 2) / LANES;
      const laneW2 = (w2 * 2) / LANES;
      let lx1 = x1 - w1 + laneW1;
      let lx2 = x2 - w2 + laneW2;
      ctx.fillStyle = palette.lane;
      for (let lane = 1; lane < LANES; lane++) {
        polygon(ctx, lx1 - l1 / 2, y1, lx1 + l1 / 2, y1, x2 !== undefined ? lx2 + l2 / 2 : 0, y2, lx2 - l2 / 2, y2);
        lx1 += laneW1;
        lx2 += laneW2;
      }
    }

    if (seg.fog < 0.975) {
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
