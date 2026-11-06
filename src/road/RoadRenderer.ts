import { LANES, MAX_DRAW_DISTANCE } from '@src/config/constants';
import { tuning } from '@src/config/tuning';
import { drawKeiTruck, type TrafficManager } from '@src/entities/TrafficAndProps';
import type { StagePalette } from './palette';
import { interpolate, percentRemaining, project } from './RoadProjection';
import {
  findSegment,
  getChosenForkCenter,
  getChosenForkHalfWidth,
  getEffectivePropOffset,
  getEffectiveTruckLaneOffset,
  getTruckForkBranch,
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
    beatPulse = 0,
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
      seg.fog = 1;
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
    const cameraSeg = findSegment(track, view.position);
    const isCameraInTunnel = cameraSeg
      ? cameraSeg.env === 'tunnel' || cameraSeg.env === 'tunnel-entry' || cameraSeg.env === 'tunnel-exit'
      : false;
    const isCameraOnBridge = cameraSeg ? cameraSeg.env === 'bridge' : false;
    for (let n = drawDistance - 1; n >= 0; n--) {
      const seg = this.visible[n]!;
      const { p1, p2 } = seg;
      if (p1.cameraZ <= cameraDepth) continue; // behind the projection plane

      const segClipY = this.clipY[n]!;
      // Skip segments occluded behind a hill crest
      if (p2.screenY < p1.screenY && p2.screenY < segClipY) {
        // Distant LOD: cull degenerate sub-pixel road slices near vanishing point
        const dy = p1.screenY - p2.screenY;
        if (
          dy >= 0.15 ||
          p1.screenW >= 8 ||
          seg.sprites.length > 0 ||
          (traffic && traffic.getFirstTruckOnSegment(seg.index) !== -1)
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
            isCameraInTunnel,
            isCameraOnBridge,
          );
        }
      }

      const ppu = (p1.scale * width) / 2;
      const scaledPpu = (ppu * roadWidth) / 2000;
      if (scaledPpu < 0.0055) continue;

      const sprites = seg.sprites;
      const firstTruckIdx = traffic ? traffic.getFirstTruckOnSegment(seg.index) : -1;
      if (sprites.length === 0 && firstTruckIdx === -1) continue;

      // Skip segment sprites/traffic if occluded behind a hill crest
      if (p1.screenY - 12000 * scaledPpu >= segClipY) continue;

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
          beatPulse,
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
              truck.forkBranch,
              truck.baseLaneOffset,
            );
            const truckScreenX =
              interpolate(p1.screenX, p2.screenX, pct) +
              interpolate(p1.screenW, p2.screenW, pct) * effectiveLaneOffset;
            if (truckScreenX >= -width * 0.25 && truckScreenX <= width * 1.25) {
              // Fade out trucks on the unchosen branch in Phase 3 of the stage fork
              let forkBranchAlpha = 1;
              if (
                view.forkZoneStartZ !== undefined &&
                truck.z > view.forkZoneStartZ &&
                trackLength > view.forkZoneStartZ
              ) {
                const forkSpan = Math.max(1, trackLength - view.forkZoneStartZ);
                const forkT = (truck.z - view.forkZoneStartZ) / forkSpan;
                if (forkT > 0.65) {
                  const branch = getTruckForkBranch(truck.id, truck.baseLaneOffset, truck.forkBranch);
                  const chosenSign = (view.forkChoice ?? 'right') === 'left' ? -1 : 1;
                  if (branch !== chosenSign) {
                    const u = (forkT - 0.65) / 0.35;
                    forkBranchAlpha = Math.max(0, 1 - u * 1.4);
                  }
                }
              }

              if (forkBranchAlpha > 0.02) {
                if (forkBranchAlpha < 0.98) {
                  ctx.globalAlpha = forkBranchAlpha;
                }
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
                if (forkBranchAlpha < 0.98) {
                  ctx.globalAlpha = 1;
                }
                this.stats.drawnTrucks++;
              }
            }
          }
          tIdx = truck.nextInSegment;
        }
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
    isCameraInTunnel = false,
    isCameraOnBridge = false,
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

const isBridge = seg.env === 'bridge';
    const isTunnel = seg.env === 'tunnel' || seg.env === 'tunnel-entry' || seg.env === 'tunnel-exit';

    // Bridge water surface, tunnel subterranean ground, or regular grass ground fill
    if (isBridge && isCameraOnBridge) {
      // Oceanic bay water surface with deep night reflection
      ctx.fillStyle = stripe === 0 ? '#060b1e' : '#040714';
      if (stripe === 0 || y2 < 180) ctx.fillRect(0, y2, width, y1 - y2);
    } else if (isTunnel && isCameraInTunnel) {
      // Subterranean dark rock ground outside the tunnel walls
      ctx.fillStyle = stripe === 0 ? '#0c0817' : '#080510';
      if (stripe === 0 || y2 < 180) ctx.fillRect(0, y2, width, y1 - y2);
    } else if (stripe === 0 || y2 < 180) {
      ctx.fillStyle = palette.grass[stripe];
      if (stripe === 0 || y2 < 180) ctx.fillRect(0, y2, width, y1 - y2);
    }

    // OutRun physical Y-fork geometry in the final outro segments when forkZoneStartZ is active
    if (forkZoneStartZ !== undefined && p2.worldZ > forkZoneStartZ && trackLength > forkZoneStartZ) {
      const span = Math.max(1, trackLength - forkZoneStartZ);
      const t1 = Math.max(0, Math.min(1, (p1.worldZ - forkZoneStartZ) / span));
      const t2 = Math.max(0, Math.min(1, (p2.worldZ - forkZoneStartZ) / span));
      const choice: 'left' | 'right' = forkChoice ?? 'right';

      if (t2 <= 0.18) {
        // Phase 1: Pre-split widening zone with center chevron warning gore
        const p1 = t1 / 0.18;
        const p2 = t2 / 0.18;
        const pEase1 = p1 * p1 * (3 - 2 * p1);
        const pEase2 = p2 * p2 * (3 - 2 * p2);

        const outerW1 = w1 * (1 + pEase1 * 0.2);
        const outerW2 = w2 * (1 + pEase2 * 0.2);

        // Outer rumble strips (batched pair)
        ctx.fillStyle = palette.rumble[stripe];
        drawRumblePair(ctx, x1, y1, x2, y2, outerW1, outerW2, r1, r2);

        // Asphalt road surface
        ctx.fillStyle = palette.road[stripe];
        polygon(ctx, x1 - outerW1, y1, x1 + outerW1, y1, x2 + outerW2, y2, x2 - outerW2, y2);

        // Central median gore chevron / triangle (widens smoothly from width 0 at t=0 to ir at t=0.18)
        const ir1 = r1 * 0.7;
        const ir2 = r2 * 0.7;
        const c1 = ir1 * pEase1;
        const c2 = ir2 * pEase2;
        if (c2 > 0.5) {
          ctx.fillStyle = stripe === 0 ? (choice === 'right' ? '#ffd319' : '#05d9e8') : palette.rumble[stripe];
          polygon(ctx, x1 - c1, y1, x1 + c1, y1, x2 + c2, y2, x2 - c2, y2);
        }

        // Continuous lane lines (seamlessly diverging from ±1/3 normal road into ±0.60 branch centers)
        if (stripe === 0 && w1 >= 6) {
          const l1 = Math.max(1, w1 / 32);
          const l2 = Math.max(1, w2 / 32);
          const leftLine1 = x1 - (1 / 3 + (0.60 - 1 / 3) * pEase1) * w1;
          const leftLine2 = x2 - (1 / 3 + (0.60 - 1 / 3) * pEase2) * w2;
          const rightLine1 = x1 + (1 / 3 + (0.60 - 1 / 3) * pEase1) * w1;
          const rightLine2 = x2 + (1 / 3 + (0.60 - 1 / 3) * pEase2) * w2;

          ctx.fillStyle = choice === 'left' ? '#05d9e8' : palette.lane;
          polygon(ctx, leftLine1 - l1, y1, leftLine1 + l1, y1, leftLine2 + l2, y2, leftLine2 - l2, y2);

          ctx.fillStyle = choice === 'right' ? '#ffd319' : palette.lane;
          polygon(ctx, rightLine1 - l1, y1, rightLine1 + l1, y1, rightLine2 + l2, y2, rightLine2 - l2, y2);
        }
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

        // Outer rumble strips (batched pair)
        ctx.fillStyle = palette.rumble[stripe];
        drawRumblePair(ctx, x1, y1, x2, y2, outerW1, outerW2, r1, r2);

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

        // Center guide lines down each branch (from ±0.60 at t=0.18 to ±1.10 at t=0.65)
        if (stripe === 0 && w1 >= 6) {
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

        // Chosen branch outer rumble strips (batched pair)
        ctx.fillStyle = palette.rumble[stripe];
        drawRumblePairSplit(ctx, cLeft1, cRight1, y1, cLeft2, cRight2, y2, r1, r2);

        // Chosen branch asphalt
        ctx.fillStyle = stripe === 0 ? '#392858' : '#31214c';
        polygon(ctx, cLeft1, y1, cRight1, y1, cRight2, y2, cLeft2, y2);

        // Seamless lane lines converging into standard 3-lane highway dividers (±1/3)
        if (stripe === 0 && w1 >= 6) {
          const l1 = Math.max(1, w1 / 32);
          const l2 = Math.max(1, w2 / 32);

          const u1 = Math.max(0, Math.min(1, (t1 - 0.65) / 0.35));
          const u2 = Math.max(0, Math.min(1, (t2 - 0.65) / 0.35));
          const ease1 = u1 * u1 * (3 - 2 * u1);
          const ease2 = u2 * u2 * (3 - 2 * u2);

          if (choice === 'right') {
            // Right branch lane line: smoothly converges from +1.10 to +1/3 (the right lane divider of normal road!)
            const rightLine1 = x1 + (1.10 * (1 - ease1) + (1 / 3) * ease1) * w1;
            const rightLine2 = x2 + (1.10 * (1 - ease2) + (1 / 3) * ease2) * w2;
            ctx.fillStyle = ease1 < 0.85 ? '#ffd319' : palette.lane;
            polygon(ctx, rightLine1 - l1, y1, rightLine1 + l1, y1, rightLine2 + l2, y2, rightLine2 - l2, y2);

            // Left highway divider (-1/3) smoothly emerges as road widens past the median
            const leftLine1 = x1 - (1 / 3) * w1;
            const leftLine2 = x2 - (1 / 3) * w2;
            if (leftLine1 > cLeft1 + l1 * 2) {
              const alpha = Math.min(1, (leftLine1 - cLeft1) / (w1 * 0.25));
              ctx.save();
              ctx.globalAlpha = (ctx.globalAlpha || 1) * alpha;
              ctx.fillStyle = palette.lane;
              polygon(ctx, leftLine1 - l1, y1, leftLine1 + l1, y1, leftLine2 + l2, y2, leftLine2 - l2, y2);
              ctx.restore();
            }
          } else {
            // Left branch lane line: smoothly converges from -1.10 to -1/3 (the left lane divider of normal road!)
            const leftLine1 = x1 - (1.10 * (1 - ease1) + (1 / 3) * ease1) * w1;
            const leftLine2 = x2 - (1.10 * (1 - ease2) + (1 / 3) * ease2) * w2;
            ctx.fillStyle = ease1 < 0.85 ? '#05d9e8' : palette.lane;
            polygon(ctx, leftLine1 - l1, y1, leftLine1 + l1, y1, leftLine2 + l2, y2, leftLine2 - l2, y2);

            // Right highway divider (+1/3) smoothly emerges as road widens past the median
            const rightLine1 = x1 + (1 / 3) * w1;
            const rightLine2 = x2 + (1 / 3) * w2;
            if (rightLine1 < cRight1 - l1 * 2) {
              const alpha = Math.min(1, (cRight1 - rightLine1) / (w1 * 0.25));
              ctx.save();
              ctx.globalAlpha = (ctx.globalAlpha || 1) * alpha;
              ctx.fillStyle = palette.lane;
              polygon(ctx, rightLine1 - l1, y1, rightLine1 + l1, y1, rightLine2 + l2, y2, rightLine2 - l2, y2);
              ctx.restore();
            }
          }
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


      return;
    }

    ctx.fillStyle = palette.rumble[stripe];
    drawRumblePair(ctx, x1, y1, x2, y2, w1, w2, r1, r2);

    ctx.fillStyle = palette.road[stripe];
    polygon(ctx, x1 - w1, y1, x1 + w1, y1, x2 + w2, y2, x2 - w2, y2);

    if (stripe === 0 && w1 >= 6) {
      ctx.fillStyle = palette.lane;
      drawLanes(ctx, x1, y1, x2, y2, w1, w2);
    }

    if (isBridge && w1 >= 14) {
      const parH1 = Math.max(2, Math.round(w1 * 0.16));
      const parH2 = Math.max(1, Math.round(w2 * 0.16));

      // Continuous steel bridge parapets (Left & Right batched in 1 path)
      ctx.fillStyle = stripe === 0 ? '#484160' : '#39334d';
      ctx.beginPath();
      ctx.moveTo(x1 - w1 - r1, y1);
      ctx.lineTo(x1 - w1 - r1, y1 - parH1);
      ctx.lineTo(x2 - w2 - r2, y2 - parH2);
      ctx.lineTo(x2 - w2 - r2, y2);
      ctx.closePath();
      ctx.moveTo(x1 + w1 + r1, y1);
      ctx.lineTo(x1 + w1 + r1, y1 - parH1);
      ctx.lineTo(x2 + w2 + r2, y2 - parH2);
      ctx.lineTo(x2 + w2 + r2, y2);
      ctx.closePath();
      ctx.fill();

      // Top chrome rails & catadioptres (LOD: closer segments w1 >= 28)
      if (w1 >= 28) {
        ctx.fillStyle = '#9e95be';
        ctx.beginPath();
        ctx.moveTo(x1 - w1 - r1, y1 - parH1);
        ctx.lineTo(x1 - w1 - r1 + 1, y1 - parH1);
        ctx.lineTo(x2 - w2 - r2 + 1, y2 - parH2);
        ctx.lineTo(x2 - w2 - r2, y2 - parH2);
        ctx.closePath();
        ctx.moveTo(x1 + w1 + r1, y1 - parH1);
        ctx.lineTo(x1 + w1 + r1 - 1, y1 - parH1);
        ctx.lineTo(x2 + w2 + r2 - 1, y2 - parH2);
        ctx.lineTo(x2 + w2 + r2, y2 - parH2);
        ctx.closePath();
        ctx.fill();

        if (stripe === 0) {
          ctx.fillStyle = seg.index % 4 === 0 ? '#00f5d4' : '#ff9e24';
          const reflSize = Math.max(1, Math.round(parH1 * 0.35));
          ctx.fillRect(Math.round(x1 - w1 - r1 + 1), Math.round(y1 - parH1 * 0.7), reflSize, reflSize);
          ctx.fillRect(Math.round(x1 + w1 + r1 - reflSize - 1), Math.round(y1 - parH1 * 0.7), reflSize, reflSize);
        }
      }

      // Expansion Joint across the asphalt every 8 segments on stripe 0
      if (stripe === 0 && seg.index % 8 === 0) {
        ctx.fillStyle = '#5c5478';
        polygon(ctx, x1 - w1, y1, x1 + w1, y1, x2 + w2, y2, x2 - w2, y2);
        ctx.fillStyle = '#1e1a2b';
        polygon(ctx, x1 - w1, y1, x1 + w1, y1, x1 + w1, y1 - 1, x1 - w1, y1 - 1);
      }
    } else if (isTunnel && w1 >= 4) {
      const wallH1 = Math.max(4, Math.round(w1 * 1.35));
      const wallH2 = Math.max(3, Math.round(w2 * 1.35));
      const wallSpread1 = w1 + r1 * 1.2;
      const wallSpread2 = w2 + r2 * 1.2;

      const leftBaseX1 = x1 - wallSpread1;
      const leftBaseX2 = x2 - wallSpread2;
      const rightBaseX1 = x1 + wallSpread1;
      const rightBaseX2 = x2 + wallSpread2;

      const ceilY1 = y1 - wallH1;
      const ceilY2 = y2 - wallH2;

      // 1. Vertical Tiled Walls (Left & Right batched in a single path)
      ctx.fillStyle = stripe === 0 ? '#272038' : '#1e182c';
      ctx.beginPath();
      ctx.moveTo(leftBaseX1, y1);
      ctx.lineTo(leftBaseX1, ceilY1);
      ctx.lineTo(leftBaseX2, ceilY2);
      ctx.lineTo(leftBaseX2, y2);
      ctx.closePath();
      ctx.moveTo(rightBaseX1, y1);
      ctx.lineTo(rightBaseX1, ceilY1);
      ctx.lineTo(rightBaseX2, ceilY2);
      ctx.lineTo(rightBaseX2, y2);
      ctx.closePath();
      ctx.fill();

      // Plinth & Retro Sodium Reflector Line (LOD: closer segments w1 >= 24)
      if (w1 >= 24) {
        const plinthH1 = Math.max(1, Math.round(wallH1 * 0.15));
        const plinthH2 = Math.max(1, Math.round(wallH2 * 0.15));
        ctx.fillStyle = '#120d1c';
        ctx.beginPath();
        ctx.moveTo(leftBaseX1, y1);
        ctx.lineTo(leftBaseX1, y1 - plinthH1);
        ctx.lineTo(leftBaseX2, y2 - plinthH2);
        ctx.lineTo(leftBaseX2, y2);
        ctx.closePath();
        ctx.moveTo(rightBaseX1, y1);
        ctx.lineTo(rightBaseX1, y1 - plinthH1);
        ctx.lineTo(rightBaseX2, y2 - plinthH2);
        ctx.lineTo(rightBaseX2, y2);
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = '#ffd166'; // Retro sodium yellow reflector line
        const reflY1 = y1 - Math.round(wallH1 * 0.45);
        const reflY2 = y2 - Math.round(wallH2 * 0.45);
        const reflThick1 = Math.max(1, Math.round(wallH1 * 0.05));
        const reflThick2 = Math.max(1, Math.round(wallH2 * 0.05));
        ctx.beginPath();
        ctx.moveTo(leftBaseX1, reflY1);
        ctx.lineTo(leftBaseX1, reflY1 - reflThick1);
        ctx.lineTo(leftBaseX2, reflY2 - reflThick2);
        ctx.lineTo(leftBaseX2, reflY2);
        ctx.closePath();
        ctx.moveTo(rightBaseX1, reflY1);
        ctx.lineTo(rightBaseX1, reflY1 - reflThick1);
        ctx.lineTo(rightBaseX2, reflY2 - reflThick2);
        ctx.lineTo(rightBaseX2, reflY2);
        ctx.closePath();
        ctx.fill();
      }

      // 3. Curved Concrete Ceiling Arch connecting left and right walls
      ctx.fillStyle = stripe === 0 ? '#151122' : '#100c1a';
      polygon(ctx, leftBaseX1, ceilY1, rightBaseX1, ceilY1, rightBaseX2, ceilY2, leftBaseX2, ceilY2);



      // 4. Overhead Perspective Fluorescent Neon Tube Strips
      if (w1 >= 6) {
        const neonW1 = Math.max(1, Math.round(w1 / 20));
        const neonW2 = Math.max(1, Math.round(w2 / 20));
        const neonY1 = ceilY1 + Math.max(1, Math.round(wallH1 * 0.08));
        const neonY2 = ceilY2 + Math.max(1, Math.round(wallH2 * 0.08));

        // Center Dual Neon Line
        const neonCol = beatPulse > 0.6 ? '#ffe875' : '#ff9e24';
        ctx.fillStyle = neonCol;
        polygon(ctx, x1 - neonW1, neonY1, x1 + neonW1, neonY1, x2 + neonW2, neonY2, x2 - neonW2, neonY2);

        // Bright white core (LOD: closer segments w1 >= 14)
        if (w1 >= 14) {
          ctx.fillStyle = '#ffffff';
          const coreW1 = Math.max(1, Math.round(neonW1 * 0.4));
          const coreW2 = Math.max(1, Math.round(neonW2 * 0.4));
          polygon(ctx, x1 - coreW1, neonY1, x1 + coreW1, neonY1, x2 + coreW2, neonY2, x2 - coreW2, neonY2);
        }
      }
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


function drawRumblePair(
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  w1: number,
  w2: number,
  r1: number,
  r2: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x1 - w1 - r1, y1);
  ctx.lineTo(x1 - w1, y1);
  ctx.lineTo(x2 - w2, y2);
  ctx.lineTo(x2 - w2 - r2, y2);
  ctx.closePath();
  ctx.moveTo(x1 + w1 + r1, y1);
  ctx.lineTo(x1 + w1, y1);
  ctx.lineTo(x2 + w2, y2);
  ctx.lineTo(x2 + w2 + r2, y2);
  ctx.closePath();
  ctx.fill();
}

function drawRumblePairSplit(
  ctx: CanvasRenderingContext2D,
  left1: number,
  right1: number,
  y1: number,
  left2: number,
  right2: number,
  y2: number,
  r1: number,
  r2: number,
): void {
  ctx.beginPath();
  ctx.moveTo(left1 - r1, y1);
  ctx.lineTo(left1, y1);
  ctx.lineTo(left2, y2);
  ctx.lineTo(left2 - r2, y2);
  ctx.closePath();
  ctx.moveTo(right1, y1);
  ctx.lineTo(right1 + r1, y1);
  ctx.lineTo(right2 + r2, y2);
  ctx.lineTo(right2, y2);
  ctx.closePath();
  ctx.fill();
}

function drawLanes(
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  w1: number,
  w2: number,
): void {
  const l1 = w1 / Math.max(32, 8 * LANES);
  const l2 = w2 / Math.max(32, 8 * LANES);
  const laneW1 = (w1 * 2) / LANES;
  const laneW2 = (w2 * 2) / LANES;
  let lx1 = x1 - w1 + laneW1;
  let lx2 = x2 - w2 + laneW2;

  ctx.beginPath();
  for (let lane = 1; lane < LANES; lane++) {
    ctx.moveTo(lx1 - l1 * 0.5, y1);
    ctx.lineTo(lx1 + l1 * 0.5, y1);
    ctx.lineTo(lx2 + l2 * 0.5, y2);
    ctx.lineTo(lx2 - l2 * 0.5, y2);
    ctx.closePath();
    lx1 += laneW1;
    lx2 += laneW2;
  }
  ctx.fill();
}
