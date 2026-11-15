import { LANES, MAX_DRAW_DISTANCE } from '@src/config/constants';
import { tuning } from '@src/config/tuning';
import { drawKeiTruck, type TrafficManager } from '@src/entities/TrafficAndProps';
import type { StagePalette } from './palette';
import { clamp01, interpolate, percentRemaining, project, smoothstep } from './RoadProjection';
import {
  findSegment,
  FORK_CONVERGE_SPAN_T,
  FORK_PEAK_BRANCH_CENTER,
  FORK_PEAK_INNER_GAP,
  FORK_SPLIT_END_T,
  FORK_SPLIT_SPAN_T,
  FORK_WIDEN_END_T,
  getChosenForkCenter,
  getChosenForkHalfWidth,
  getEffectivePropOffset,
  getEffectiveTruckLaneOffset,
  getTruckForkBranch,
  type RoadSegment,
  type RoadSprite,
  type Track,
} from './RoadSegment';
import { drawProp, getPylonAttachmentPoints, setPropTheme } from './RoadsideProps';

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
  beatIndex?: number;
  /** World Z where the OutRun stage fork split begins (`undefined` when no fork is active). */
  forkZoneStartZ?: number;
  /** Currently selected branch at the stage fork (`'left'` = loop, `'right'` = next track). */
  forkChoice?: 'left' | 'right';
  /** Sub-frame interpolation factor in `[0, 1]` from `FixedStepper` (defaults to `1`). */
  alpha?: number;
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

  // --- Phase 3 Power Line Chain State (Zero GC) ---
  private static readonly MAX_CHAIN_SLOTS = 8;
  /** Meta per slot: [chainId, valid (0/1), variant, segIndex] */
  private readonly chainSlotMeta = new Int32Array(RoadRenderer.MAX_CHAIN_SLOTS * 4);
  /** 5 attachment points (x, y) per slot = 10 floats */
  private readonly chainSlotPoints = new Float32Array(RoadRenderer.MAX_CHAIN_SLOTS * 10);
  /** Screen position [screenX, screenY] per slot = 2 floats */
  private readonly chainSlotPos = new Float32Array(RoadRenderer.MAX_CHAIN_SLOTS * 2);
  /** Delta vector from farther tower [dx, dy] per slot = 2 floats */
  private readonly chainSlotVec = new Float32Array(RoadRenderer.MAX_CHAIN_SLOTS * 2);
  /** Scratch attachment points for current pylon = 10 floats */
  private readonly currentPylonPoints = new Float32Array(10);

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
    this.chainSlotMeta.fill(0);
    setPropTheme(palette.scenery);

    const { segments, segmentLength, length: trackLength } = track;
    const { position, playerX, cameraDepth, roadWidth, width, height } = view;
    const alpha = view.alpha ?? 1;
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
    const isCameraOnBridge = cameraSeg ? cameraSeg.env === 'bridge' : false;
    if (isCameraOnBridge) {
      // Pre-fill deep bay water surface once below the horizon (avoids ~180 full-width overdraws on bridge climbs)
      ctx.fillStyle = '#040714';
      ctx.fillRect(0, 180, width, height - 180);
    }
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
            isCameraOnBridge,
          );
        }
      }

      const ppu = (p1.scale * width) / 2;
      const scaledPpu = (ppu * roadWidth) / 2000;
      if (scaledPpu < 0.001) continue;

      const sprites = seg.sprites;
      const firstTruckIdx = traffic ? traffic.getFirstTruckOnSegment(seg.index) : -1;
      if (sprites.length === 0 && firstTruckIdx === -1) continue;

      // Skip segment sprites/traffic if occluded behind a hill crest
      if (p1.screenY - 12000 * scaledPpu >= segClipY) continue;

      // Smooth distant alpha fade-in (0.001 -> 0.006) to eliminate abrupt pop-in & flickering at the horizon
      const propAlpha = Math.min(1, Math.max(0, (scaledPpu - 0.001) / 0.005));
      const needsPropAlpha = propAlpha < 0.98;

      if (needsPropAlpha && sprites.length > 0) {
        ctx.globalAlpha = propAlpha;
      }

      // Roadside props (shifted outward along the widening Y-fork so props never sit on the asphalt)
      for (let i = 0; i < sprites.length; i++) {
        const s = sprites[i]!;

        // Optional theme exclusion
        if (palette.scenery.hideKinds?.has(s.kind)) continue;

        // Band C/D building density skip (|offset| >= 3.0; collidable A/B buildings are never skipped)
        if (
          s.kind === 'building' &&
          Math.abs(s.offset) >= 3.0 &&
          palette.scenery.buildingDensity < 1.0
        ) {
          const densityHash =
            (Math.imul(seg.index, 31) +
              Math.imul(s.variant, 17) +
              Math.round(Math.abs(s.offset) * 10)) &
            0x7fffffff;
          if ((densityHash % 1000) / 1000 >= palette.scenery.buildingDensity) {
            continue;
          }
        }

        // Biome coherence: resolve abstract slots ('tree') to concrete stage prop kinds
        const resolvedKind = s.kind === 'tree' ? palette.scenery.tree : s.kind;
        if (palette.scenery.hideKinds?.has(resolvedKind)) continue;

        const spriteScale = s.scale ?? 1;
        const propPpu = scaledPpu * spriteScale;

        // Cheap distant LOD: skip far-field (Band D) props when scaledPpu is tiny (<0.0012)
        if (Math.abs(s.offset) >= 6.0 && propPpu < 0.0012) continue;

        const effectiveOffset = getEffectivePropOffset(
          s.offset,
          p1.worldZ,
          trackLength,
          view.forkZoneStartZ,
          view.forkChoice,
        );
        const sx = p1.screenX + p1.screenW * effectiveOffset;

        // Phase 3: High-voltage continuous power line wires (drawn in Painter's order before the tower structure)
        if (resolvedKind === 'pylon' && s.chainId !== undefined) {
          const pylonW = Math.max(48, 7000 * propPpu);
          if (sx + pylonW >= -width * 0.5 && sx - pylonW <= width * 1.5) {
            this.handlePylonChainWires(
              ctx,
              s,
              sx,
              p1.screenY,
              propPpu,
              p1.screenX,
              seg.index,
            );
          }
        }

        // Approximate visual width in screen pixels for horizontal culling (widen for large offsets / large structures)
        const propW =
          resolvedKind === 'gantry' || resolvedKind === 'overpass' || resolvedKind === 'suspension-tower'
            ? p1.screenW * 2.5
            : resolvedKind === 'building'
              ? Math.max(p1.screenW * 1.2, 5000 * propPpu)
              : resolvedKind === 'pylon'
                ? Math.max(48, 7000 * propPpu)
                : Math.max(32, 2600 * propPpu);

        if (sx + propW < 0 || sx - propW > width) continue;

        drawProp(
          ctx,
          resolvedKind,
          sx,
          p1.screenY,
          propPpu,
          effectiveOffset < 0 ? -1 : 1,
          s.variant,
          beatPulse,
          view.beatIndex ?? 0,
        );
        this.stats.drawnProps++;
      }

      if (needsPropAlpha && sprites.length > 0) {
        ctx.globalAlpha = 1;
      }

      // AI Kei Trucks on this segment (diverging onto the left/right Y-fork branch)
      if (traffic && firstTruckIdx !== -1) {
        let tIdx = firstTruckIdx;
        while (tIdx !== -1) {
          const truck = traffic.trucks[tIdx]!;
          let prevTruckZ = truck.prevZ ?? truck.z;
          if (truck.z < prevTruckZ && prevTruckZ - truck.z > trackLength * 0.5) {
            prevTruckZ -= trackLength;
          } else if (truck.z > prevTruckZ && truck.z - prevTruckZ > trackLength * 0.5) {
            prevTruckZ += trackLength;
          }
          const renderTruckZ =
            alpha >= 0.999
              ? truck.z
              : (((prevTruckZ + (truck.z - prevTruckZ) * alpha) % trackLength) + trackLength) % trackLength;
          const renderLaneOffset =
            truck.prevLaneOffset !== undefined
              ? interpolate(truck.prevLaneOffset, truck.laneOffset, alpha)
              : truck.laneOffset;
          const renderTiltAngle =
            truck.prevTiltAngle !== undefined
              ? interpolate(truck.prevTiltAngle, truck.tiltAngle, alpha)
              : truck.tiltAngle;

          let relZ = renderTruckZ - seg.index * segmentLength;
          if (relZ < -trackLength * 0.5) relZ += trackLength;
          else if (relZ > trackLength * 0.5) relZ -= trackLength;
          const pct = alpha >= 0.999 ? percentRemaining(truck.z, segmentLength) : relZ / segmentLength;
          const truckScreenY = interpolate(p1.screenY, p2.screenY, pct);
          const truckScale = interpolate(p1.scale, p2.scale, pct);
          const truckPpu = ((truckScale * width) / 2) * (roadWidth / 2000);
          if (truckScreenY - 1250 * truckPpu < segClipY) {
            const effectiveLaneOffset = getEffectiveTruckLaneOffset(
              renderLaneOffset,
              truck.id,
              renderTruckZ,
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
                renderTruckZ > view.forkZoneStartZ &&
                trackLength > view.forkZoneStartZ
              ) {
                const forkSpan = Math.max(1, trackLength - view.forkZoneStartZ);
                const forkT = (renderTruckZ - view.forkZoneStartZ) / forkSpan;
                if (forkT > FORK_SPLIT_END_T) {
                  const branch = getTruckForkBranch(truck.id, truck.baseLaneOffset, truck.forkBranch);
                  const chosenSign = (view.forkChoice ?? 'right') === 'left' ? -1 : 1;
                  if (branch !== chosenSign) {
                    const u = (forkT - FORK_SPLIT_END_T) / FORK_CONVERGE_SPAN_T;
                    forkBranchAlpha = Math.max(0, 1 - u * 1.4);
                  }
                }
              }

              const truckAlpha = Math.min(propAlpha, forkBranchAlpha);
              if (truckAlpha > 0.02) {
                if (truckAlpha < 0.98) {
                  ctx.globalAlpha = truckAlpha;
                }
                const viewParallax = ((width * 0.5 - truckScreenX) / Math.max(1, width * 0.5)) * 1.4;
                const truckRoadCurve = seg.curve + viewParallax + truck.lateralVel * 1.5;
                drawKeiTruck(
                  ctx,
                  truckScreenX,
                  truckScreenY,
                  truckPpu,
                  truck.variant,
                  renderTiltAngle,
                  truck.knockedTimer > 0,
                  truckRoadCurve,
                );
                if (truckAlpha < 0.98) {
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

    // Phase 3 Edge case (b): extrapolate wires for nearest visible tower behind camera
    this.extrapolateNearestPylonWires(ctx, width, height);
  }

  private handlePylonChainWires(
    ctx: CanvasRenderingContext2D,
    sprite: RoadSprite,
    sx: number,
    sy: number,
    propPpu: number,
    vanishX: number,
    segIndex: number,
  ): void {
    const chainId = sprite.chainId!;
    const variant = sprite.variant;

    // 1. Compute 5 attachment points into pre-allocated scratch array (zero GC)
    getPylonAttachmentPoints(sx, sy, propPpu, this.currentPylonPoints, 0, variant);

    // 2. Find existing slot for this chainId
    let slot = -1;
    let emptySlot = -1;
    for (let s = 0; s < RoadRenderer.MAX_CHAIN_SLOTS; s++) {
      if (this.chainSlotMeta[s * 4 + 1] === 1) {
        if (this.chainSlotMeta[s * 4] === chainId) {
          slot = s;
          break;
        }
      } else if (emptySlot === -1) {
        emptySlot = s;
      }
    }

    if (slot !== -1) {
      // Previous (farther) tower exists in this chain!
      const farVariant = this.chainSlotMeta[slot * 4 + 2]!;
      const farSegIndex = this.chainSlotMeta[slot * 4 + 3]!;
      const isCrossing = variant === 2 && farVariant === 2;
      const segDelta = Math.abs(farSegIndex - segIndex);

      // Only draw wires if towers are reasonably connected (avoid spanning cross-track artifacts)
      if (isCrossing || segDelta <= 120) {
        ctx.strokeStyle = '#2d1c4a';
        ctx.lineWidth = 1;

        const pOffset = slot * 10;
        for (let k = 0; k < 5; k++) {
          const xNear = this.currentPylonPoints[k * 2]!;
          const yNear = this.currentPylonPoints[k * 2 + 1]!;
          const xFar = this.chainSlotPoints[pOffset + k * 2]!;
          const yFar = this.chainSlotPoints[pOffset + k * 2 + 1]!;

          const dx = xFar - xNear;
          const dy = yFar - yNear;
          const dist = Math.sqrt(dx * dx + dy * dy);

          // Sag proportional to screen span distance (~0.08–0.12, min 1.5px)
          const sagRatio = isCrossing ? 0.05 : 0.09;
          const sag = Math.max(1.5, dist * sagRatio);
          const midX = (xNear + xFar) * 0.5;
          const midY = (yNear + yFar) * 0.5 + sag;

          ctx.beginPath();
          ctx.moveTo(xNear, yNear);
          ctx.quadraticCurveTo(midX, midY, xFar, yFar);
          ctx.stroke();
        }

        // Faint neon sheen highlight if close enough to screen
        if (propPpu > 0.0035) {
          ctx.strokeStyle = 'rgba(128, 245, 236, 0.22)';
          for (let k = 0; k < 5; k++) {
            const xNear = this.currentPylonPoints[k * 2]!;
            const yNear = this.currentPylonPoints[k * 2 + 1]! - 0.75;
            const xFar = this.chainSlotPoints[pOffset + k * 2]!;
            const yFar = this.chainSlotPoints[pOffset + k * 2 + 1]! - 0.75;
            const dx = xFar - xNear;
            const dy = yFar - yNear;
            const dist = Math.sqrt(dx * dx + dy * dy);
            const sagRatio = isCrossing ? 0.05 : 0.09;
            const sag = Math.max(1.5, dist * sagRatio);
            ctx.beginPath();
            ctx.moveTo(xNear, yNear);
            ctx.quadraticCurveTo((xNear + xFar) * 0.5, (yNear + yFar) * 0.5 + sag, xFar, yFar);
            ctx.stroke();
          }
        }
      }

      if (isCrossing) {
        // Crossing is self-contained; free slot so it doesn't chain further
        this.chainSlotMeta[slot * 4 + 1] = 0;
        return;
      }

      // Record perspective delta vector for edge-case extrapolation: (near - far)
      const farSx = this.chainSlotPos[slot * 2]!;
      const farSy = this.chainSlotPos[slot * 2 + 1]!;
      this.chainSlotVec[slot * 2] = sx - farSx;
      this.chainSlotVec[slot * 2 + 1] = sy - farSy;

      // Update slot with current (nearer) tower points
      const pOffset = slot * 10;
      for (let k = 0; k < 10; k++) {
        this.chainSlotPoints[pOffset + k] = this.currentPylonPoints[k]!;
      }
      this.chainSlotPos[slot * 2] = sx;
      this.chainSlotPos[slot * 2 + 1] = sy;
      this.chainSlotMeta[slot * 4 + 2] = variant;
      this.chainSlotMeta[slot * 4 + 3] = segIndex;
    } else {
      // First visible tower for this chain (farthest visible tower in Pass 2)
      const targetSlot = emptySlot !== -1 ? emptySlot : 0;
      const pOffset = targetSlot * 10;

      // Edge case (a): if not terminal (variant !== 1) or crossing (2), run continues beyond draw distance.
      // Draw short wire stubs fading toward vanishing direction.
      if (variant !== 1 && variant !== 2) {
        ctx.strokeStyle = '#2d1c4a';
        ctx.lineWidth = 1;
        const stubLen = Math.max(10, Math.min(35, 2000 * propPpu));
        for (let k = 0; k < 5; k++) {
          const xk = this.currentPylonPoints[k * 2]!;
          const yk = this.currentPylonPoints[k * 2 + 1]!;
          const vx = vanishX - xk;
          const vy = (sy - 60) - yk;
          const vDist = Math.sqrt(vx * vx + vy * vy) || 1;
          const tx = xk + (vx / vDist) * stubLen;
          const ty = yk + (vy / vDist) * stubLen;

          ctx.beginPath();
          ctx.moveTo(xk, yk);
          ctx.lineTo(tx, ty);
          ctx.stroke();
        }
      }

      // Store current tower into target slot
      this.chainSlotMeta[targetSlot * 4] = chainId;
      this.chainSlotMeta[targetSlot * 4 + 1] = 1;
      this.chainSlotMeta[targetSlot * 4 + 2] = variant;
      this.chainSlotMeta[targetSlot * 4 + 3] = segIndex;
      this.chainSlotPos[targetSlot * 2] = sx;
      this.chainSlotPos[targetSlot * 2 + 1] = sy;
      this.chainSlotVec[targetSlot * 2] = 0;
      this.chainSlotVec[targetSlot * 2 + 1] = 0;
      for (let k = 0; k < 10; k++) {
        this.chainSlotPoints[pOffset + k] = this.currentPylonPoints[k]!;
      }
    }
  }

  private extrapolateNearestPylonWires(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
  ): void {
    ctx.strokeStyle = '#2d1c4a';
    ctx.lineWidth = 1;

    for (let s = 0; s < RoadRenderer.MAX_CHAIN_SLOTS; s++) {
      if (this.chainSlotMeta[s * 4 + 1] !== 1) continue;
      const variant = this.chainSlotMeta[s * 4 + 2];
      // Skip terminal (1) and crossing (2): lines do not continue past terminal
      if (variant === 1 || variant === 2) continue;

      let vx = this.chainSlotVec[s * 2]!;
      let vy = this.chainSlotVec[s * 2 + 1]!;

      if (vx === 0 && vy === 0) {
        // Only one tower of this chain was visible; extrapolate outward/downward from screen center
        const towerX = this.chainSlotPos[s * 2]!;
        const towerY = this.chainSlotPos[s * 2 + 1]!;
        vx = towerX - width * 0.5;
        vy = towerY - height * 0.35;
      }

      const vDist = Math.sqrt(vx * vx + vy * vy) || 1;
      let dirX = vx / vDist;
      let dirY = vy / vDist;

      // Ensure downward/outward direction toward screen edge/bottom
      if (dirY < 0.2) dirY = 0.2;
      const norm = Math.sqrt(dirX * dirX + dirY * dirY) || 1;
      dirX /= norm;
      dirY /= norm;

      const extLen = Math.max(140, height * 0.8);
      const pOffset = s * 10;

      for (let k = 0; k < 5; k++) {
        const xNear = this.chainSlotPoints[pOffset + k * 2]!;
        const yNear = this.chainSlotPoints[pOffset + k * 2 + 1]!;
        const exitX = xNear + dirX * extLen;
        const exitY = yNear + dirY * extLen;

        ctx.beginPath();
        ctx.moveTo(xNear, yNear);
        ctx.lineTo(exitX, exitY);
        ctx.stroke();
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

    // Bridge water surface or regular grass ground fill
    if (isBridge && isCameraOnBridge) {
      // Oceanic bay water surface with deep night reflection (clamped below horizon y=180;
      // #040714 base is pre-filled once before Pass 2)
      if (stripe === 0 && y1 > 180) {
        const waterY2 = Math.max(180, y2);
        ctx.fillStyle = '#060b1e';
        ctx.fillRect(0, waterY2, width, y1 - waterY2);
      }
    } else if (stripe === 0 || y2 < 180) {
      ctx.fillStyle = palette.grass[stripe];
      ctx.fillRect(0, y2, width, y1 - y2);
    }

    // OutRun physical Y-fork geometry in the final outro segments when forkZoneStartZ is active
    if (forkZoneStartZ !== undefined && p2.worldZ > forkZoneStartZ && trackLength > forkZoneStartZ) {
      this.renderForkSegment(
        ctx,
        seg,
        palette,
        x1,
        y1,
        w1,
        r1,
        x2,
        y2,
        w2,
        r2,
        forkZoneStartZ,
        trackLength,
        forkChoice ?? 'right',
      );
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

    if (isBridge && w1 >= 18) {
      this.renderBridgeParapets(ctx, seg, x1, y1, w1, r1, x2, y2, w2, r2);
    }
  }

  private renderForkSegment(
    ctx: CanvasRenderingContext2D,
    seg: RoadSegment,
    palette: StagePalette,
    x1: number,
    y1: number,
    w1: number,
    r1: number,
    x2: number,
    y2: number,
    w2: number,
    r2: number,
    forkZoneStartZ: number,
    trackLength: number,
    choice: 'left' | 'right',
  ): void {
    const { p1, p2, stripe } = seg;
    const span = Math.max(1, trackLength - forkZoneStartZ);
    const t1 = clamp01((p1.worldZ - forkZoneStartZ) / span);
    const t2 = clamp01((p2.worldZ - forkZoneStartZ) / span);

    if (t2 <= FORK_WIDEN_END_T) {
      // Phase 1: Pre-split widening zone with center chevron warning gore
      const p1Norm = t1 / FORK_WIDEN_END_T;
      const p2Norm = t2 / FORK_WIDEN_END_T;
      const pEase1 = smoothstep(p1Norm);
      const pEase2 = smoothstep(p2Norm);

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
        const leftLine1 = x1 - (1 / 3 + (0.6 - 1 / 3) * pEase1) * w1;
        const leftLine2 = x2 - (1 / 3 + (0.6 - 1 / 3) * pEase2) * w2;
        const rightLine1 = x1 + (1 / 3 + (0.6 - 1 / 3) * pEase1) * w1;
        const rightLine2 = x2 + (1 / 3 + (0.6 - 1 / 3) * pEase2) * w2;

        ctx.fillStyle = choice === 'left' ? '#05d9e8' : palette.lane;
        polygon(ctx, leftLine1 - l1, y1, leftLine1 + l1, y1, leftLine2 + l2, y2, leftLine2 - l2, y2);

        ctx.fillStyle = choice === 'right' ? '#ffd319' : palette.lane;
        polygon(ctx, rightLine1 - l1, y1, rightLine1 + l1, y1, rightLine2 + l2, y2, rightLine2 - l2, y2);
      }
    } else if (t2 <= FORK_SPLIT_END_T) {
      // Phase 2: Diverging Left & Right asphalt branches with a central V-chevron median island
      const split1 = Math.max(0, (t1 - FORK_WIDEN_END_T) / FORK_SPLIT_SPAN_T);
      const split2 = Math.max(0, (t2 - FORK_WIDEN_END_T) / FORK_SPLIT_SPAN_T);
      const splitEase1 = smoothstep(split1);
      const splitEase2 = smoothstep(split2);

      const outerW1 = w1 * (1.2 + splitEase1 * 0.48);
      const outerW2 = w2 * (1.2 + splitEase2 * 0.48);
      const gap1 = w1 * splitEase1 * FORK_PEAK_INNER_GAP;
      const gap2 = w2 * splitEase2 * FORK_PEAK_INNER_GAP;

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

        const u1 = clamp01((t1 - FORK_SPLIT_END_T) / FORK_CONVERGE_SPAN_T);
        const u2 = clamp01((t2 - FORK_SPLIT_END_T) / FORK_CONVERGE_SPAN_T);
        const ease1 = smoothstep(u1);
        const ease2 = smoothstep(u2);

        if (choice === 'right') {
          // Right branch lane line: smoothly converges from +1.10 to +1/3 (the right lane divider of normal road!)
          const rightLine1 = x1 + (FORK_PEAK_BRANCH_CENTER * (1 - ease1) + (1 / 3) * ease1) * w1;
          const rightLine2 = x2 + (FORK_PEAK_BRANCH_CENTER * (1 - ease2) + (1 / 3) * ease2) * w2;
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
          const leftLine1 = x1 - (FORK_PEAK_BRANCH_CENTER * (1 - ease1) + (1 / 3) * ease1) * w1;
          const leftLine2 = x2 - (FORK_PEAK_BRANCH_CENTER * (1 - ease2) + (1 / 3) * ease2) * w2;
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
      const u2Unchosen = (t2 - FORK_SPLIT_END_T) / FORK_CONVERGE_SPAN_T;
      const unchosenAlpha = Math.max(0, 1 - u2Unchosen * 1.4);
      if (unchosenAlpha > 0.02) {
        ctx.save();
        ctx.globalAlpha = unchosenAlpha;
        const uSign = choice === 'left' ? 1 : -1;
        const u1Unchosen = Math.max(0, (t1 - FORK_SPLIT_END_T) / FORK_CONVERGE_SPAN_T);
        const e1 = smoothstep(u1Unchosen);
        const e2 = smoothstep(u2Unchosen);

        const uCenter1 = uSign * (FORK_PEAK_BRANCH_CENTER + 0.35 * e1) * w1;
        const uCenter2 = uSign * (FORK_PEAK_BRANCH_CENTER + 0.35 * e2) * w2;
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
  }

  private renderBridgeParapets(
    ctx: CanvasRenderingContext2D,
    seg: RoadSegment,
    x1: number,
    y1: number,
    w1: number,
    r1: number,
    x2: number,
    y2: number,
    w2: number,
    r2: number,
  ): void {
    const stripe = seg.stripe;
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

    // Top chrome rails & catadioptres (LOD: closer segments w1 >= 28 using fast axis-aligned fillRects)
    if (w1 >= 28 && stripe === 0) {
      const leftRailX = Math.round(x1 - w1 - r1);
      const rightRailX = Math.round(x1 + w1 + r1);
      const railY = Math.round(y1 - parH1);
      const railW = Math.max(1, Math.round(r1 * 0.25));
      ctx.fillStyle = '#9e95be';
      ctx.fillRect(leftRailX, railY, railW, 1);
      ctx.fillRect(rightRailX - railW, railY, railW, 1);

      ctx.fillStyle = seg.index % 4 === 0 ? '#00f5d4' : '#ff9e24';
      const reflSize = Math.max(1, Math.round(parH1 * 0.35));
      ctx.fillRect(leftRailX + 1, Math.round(y1 - parH1 * 0.7), reflSize, reflSize);
      ctx.fillRect(rightRailX - reflSize - 1, Math.round(y1 - parH1 * 0.7), reflSize, reflSize);
    }

    // Expansion Joint across the asphalt every 8 segments on stripe 0
    if (stripe === 0 && seg.index % 8 === 0 && w1 >= 22) {
      ctx.fillStyle = '#5c5478';
      polygon(ctx, x1 - w1, y1, x1 + w1, y1, x2 + w2, y2, x2 - w2, y2);
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
