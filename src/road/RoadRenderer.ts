import { LANES, MAX_DRAW_DISTANCE } from '@src/config/constants';
import { tuning } from '@src/config/tuning';

const EMPTY_SPRITES: readonly RoadSprite[] = [];
import { drawKeiTruck, type TrafficManager } from '@src/entities/TrafficAndProps';
import { lerpHexColor, type StagePalette } from './palette';
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
import {
  drawProp,
  getPropWorldHeight,
  getPylonAttachmentPoints,
  setPropAtmosphere,
  setPropTheme,
} from './RoadsideProps';

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
  /** Normalized Groove/OVERDRIVE visual intensity (`~0.2..1.15`) driving road pulse and curb neon glow. */
  grooveIntensity?: number;
  /** World Z where the OutRun stage fork split begins (`undefined` when no fork is active). */
  forkZoneStartZ?: number;
  /** Currently selected branch at the stage fork (`'left'` = loop, `'right'` = next track). */
  forkChoice?: 'left' | 'right';
  /** Pre-generated next-stage track rendered seamlessly past `track.length` on right-fork lookahead. */
  nextTrack?: Track;
  /** Sub-frame interpolation factor in `[0, 1]` from `FixedStepper` (defaults to `1`). */
  alpha?: number;
  /** Diagnostic toggle to isolate road slices vs roadside props rasterization cost. */
  skipProps?: boolean;
  /** Diagnostic toggle to disable catenary power-line wire strokes. */
  skipPylonWires?: boolean;
  /** Diagnostic toggle to disable AI Kei Truck rendering. */
  skipTraffic?: boolean;
  /** Diagnostic flag enabling synchronous subsystem measurement. */
  syncGpuProbe?: boolean;
  /** Diagnostic A/B toggle reverting to unoptimized raster path when true. */
  legacyRaster?: boolean;
}

/**
 * Diagnostics & performance statistics gathered during road rendering (M8 Performance Profiler).
 */
export interface RoadRenderStats {
  drawnSegments: number;
  drawnProps: number;
  drawnTrucks: number;
  drawnPylonSpans: number;
  crestClips: number;
  slicesMs: number;
  propsMs: number;
  trafficMs: number;
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
  private readonly clipY = new Float64Array(MAX_DRAW_DISTANCE);
  /** 1 when the occluding horizon crest at index `n` is a bridge segment (requiring stencil clip behind crests). */
  private readonly clipNeedsStencil = new Uint8Array(MAX_DRAW_DISTANCE);

  // --- Phase 3 Power Line Chain State (Zero GC) ---
  private static readonly MAX_CHAIN_SLOTS = 8;
  /** Meta per slot: [chainId, valid (0/1), variant, segIndex, wiredCount] */
  private readonly chainSlotMeta = new Int32Array(RoadRenderer.MAX_CHAIN_SLOTS * 5);
  /** 5 attachment points (x, y) per slot = 10 floats */
  private readonly chainSlotPoints = new Float32Array(RoadRenderer.MAX_CHAIN_SLOTS * 10);
  /** Screen position [screenX, screenY] per slot = 2 floats */
  private readonly chainSlotPos = new Float32Array(RoadRenderer.MAX_CHAIN_SLOTS * 2);
  /** Delta vector from farther tower [dx, dy] per slot = 2 floats */
  private readonly chainSlotVec = new Float32Array(RoadRenderer.MAX_CHAIN_SLOTS * 2);
  /** Scratch attachment points for current pylon = 10 floats */
  private readonly currentPylonPoints = new Float32Array(10);

  // Cached bridge bay water gradient to maintain zero per-frame GC allocations
  private cachedBridgeWaterCtx: CanvasRenderingContext2D | null = null;
  private cachedBridgeWaterHeight = -1;
  private cachedBridgeWaterFog = '';
  private cachedBridgeWater0 = '';
  private cachedBridgeWater1 = '';
  private cachedBridgeWaterGrad: CanvasGradient | null = null;

  // Cached Nyquist-filtered far-horizon colors for coalesced sub-pixel slices (Zero GC)
  private cachedHorizonCurbColor = '#4a4a6a';
  private cachedHorizonRoadColor = '#141928';

  // Zero-GC state for minimal single-frame tunnel aperture surround masking & bore bounds
  private tunnelMaskEmitted = false;
  private boreBoundsInit = false;
  private boreMinX = 0;
  private boreMaxX = 0;
  private boreMinY = 0;
  private boreMaxY = 0;

  // Pre-allocated 4-band depth fog palette (Phase 2, Zero GC)
  private static readonly FOG_BAND_T = [0, 0.22, 0.48, 0.72] as const;
  private readonly fogGrass0 = ['', '', '', ''];
  private readonly fogGrass1 = ['', '', '', ''];
  private readonly fogRoad0 = ['', '', '', ''];
  private readonly fogRoad1 = ['', '', '', ''];
  private readonly fogRumble0 = ['', '', '', ''];
  private readonly fogRumble1 = ['', '', '', ''];
  private readonly fogLane = ['', '', '', ''];
  private cachedFogColor = '';
  private cachedFogGrass0 = '';
  private cachedFogGrass1 = '';
  private cachedFogRoad0 = '';
  private cachedFogRoad1 = '';
  private cachedFogRumble0 = '';
  private cachedFogRumble1 = '';
  private cachedFogLane = '';
  private cachedFogMountain = '';
  private cachedFogMountainRim = '';
  private cachedFogStrength = -1;
  private cachedFogPaletteDensity = -1;
  private cachedPropSilhouette = '#070b20';
  private cachedPropAccent = '#056e68';

  private profileTick = 0;

  /** Pre-allocated rendering statistics updated every frame without GC allocations (AGENTS.md §4.3). */
  readonly stats: RoadRenderStats = {
    drawnSegments: 0,
    drawnProps: 0,
    drawnTrucks: 0,
    drawnPylonSpans: 0,
    crestClips: 0,
    slicesMs: 0,
    propsMs: 0,
    trafficMs: 0,
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
    this.stats.drawnPylonSpans = 0;
    this.stats.crestClips = 0;
    const legacy = Boolean(view.legacyRaster);
    const sampleSubsystems = Boolean(view.syncGpuProbe || legacy) && (view.syncGpuProbe || (this.profileTick++ & 7) === 0);
    let sampleSlicesMs = 0;
    let samplePropsMs = 0;
    let sampleTrafficMs = 0;
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

    const hasNextTrackLookahead =
      view.nextTrack !== undefined &&
      view.forkChoice === 'right' &&
      base.index + drawDistance > segments.length &&
      view.nextTrack.segments.length > 0;
    const nextTrackStartPassIdx = segments.length - base.index;

    // Refresh 4-band depth fog & Nyquist far-horizon caches only on palette/tuning change (Zero GC)
    const fogStrength = Math.max(0, Math.min(1, tuning.roadFogStrength));
    const fogDensity = palette.fogDensity ?? 1.0;
    if (
      this.cachedFogColor !== palette.fog ||
      this.cachedFogGrass0 !== palette.grass[0] ||
      this.cachedFogGrass1 !== palette.grass[1] ||
      this.cachedFogRoad0 !== palette.road[0] ||
      this.cachedFogRoad1 !== palette.road[1] ||
      this.cachedFogRumble0 !== palette.rumble[0] ||
      this.cachedFogRumble1 !== palette.rumble[1] ||
      this.cachedFogLane !== palette.lane ||
      this.cachedFogMountain !== palette.mountain ||
      this.cachedFogMountainRim !== palette.mountainRim ||
      this.cachedFogStrength !== fogStrength ||
      this.cachedFogPaletteDensity !== fogDensity
    ) {
      this.cachedFogColor = palette.fog;
      this.cachedFogGrass0 = palette.grass[0];
      this.cachedFogGrass1 = palette.grass[1];
      this.cachedFogRoad0 = palette.road[0];
      this.cachedFogRoad1 = palette.road[1];
      this.cachedFogRumble0 = palette.rumble[0];
      this.cachedFogRumble1 = palette.rumble[1];
      this.cachedFogLane = palette.lane;
      this.cachedFogMountain = palette.mountain;
      this.cachedFogMountainRim = palette.mountainRim;
      this.cachedFogStrength = fogStrength;
      this.cachedFogPaletteDensity = fogDensity;

      this.cachedPropSilhouette = lerpHexColor(palette.mountain, palette.fog, 0.45);
      this.cachedPropAccent = lerpHexColor(palette.mountainRim, palette.fog, 0.55);

      for (let b = 0; b < 4; b++) {
        const tFog =
          b === 0 || fogStrength <= 0
            ? 0
            : Math.max(0, Math.min(0.88, RoadRenderer.FOG_BAND_T[b]! * fogStrength * fogDensity));
        this.fogGrass0[b] =
          tFog <= 0 ? palette.grass[0] : lerpHexColor(palette.grass[0], palette.fog, tFog);
        this.fogGrass1[b] =
          tFog <= 0 ? palette.grass[1] : lerpHexColor(palette.grass[1], palette.fog, tFog);
        this.fogRoad0[b] =
          tFog <= 0 ? palette.road[0] : lerpHexColor(palette.road[0], palette.fog, tFog);
        this.fogRoad1[b] =
          tFog <= 0 ? palette.road[1] : lerpHexColor(palette.road[1], palette.fog, tFog);
        this.fogRumble0[b] =
          tFog <= 0 ? palette.rumble[0] : lerpHexColor(palette.rumble[0], palette.fog, tFog);
        this.fogRumble1[b] =
          tFog <= 0 ? palette.rumble[1] : lerpHexColor(palette.rumble[1], palette.fog, tFog);
        this.fogLane[b] = tFog <= 0 ? palette.lane : lerpHexColor(palette.lane, palette.fog, tFog);
      }

      const farRumbleMid = lerpHexColor(this.fogRumble0[3]!, this.fogRumble1[3]!, 0.5);
      this.cachedHorizonCurbColor =
        fogStrength <= 0 ? farRumbleMid : lerpHexColor(farRumbleMid, palette.fog, 0.25);
      this.cachedHorizonRoadColor = lerpHexColor(this.fogRoad0[3]!, this.fogRoad1[3]!, 0.5);
    }
    setPropAtmosphere(palette.fog, this.cachedPropSilhouette, this.cachedPropAccent);

    const horizonY = Math.floor(height * 0.5);
    const cameraSeg = findSegment(track, view.position);
    const isCameraOnBridge = cameraSeg ? cameraSeg.env === 'bridge' : false;
    const isCameraInTunnel = cameraSeg ? cameraSeg.env === 'tunnel' : false;

    // Pass 1: front-to-back projection & hill-crest occlusion horizon (maxy).
    let x = 0;
    let dx = -(base.curve * basePercent);
    let maxy = height;
    let crestIsBridge = isCameraOnBridge;
    let cameraTunnelEndN = -1;
    let leftCameraTunnel = false;
    for (let n = 0; n < drawDistance; n++) {
      const isNextSeg = hasNextTrackLookahead && n >= nextTrackStartPassIdx;
      const seg = isNextSeg
        ? view.nextTrack!.segments[(n - nextTrackStartPassIdx) % view.nextTrack!.segments.length]!
        : segments[(base.index + n) % segments.length]!;
      const cameraZ = isNextSeg
        ? position - trackLength
        : position - (seg.index < base.index ? trackLength : 0);
      const nRatio = drawDistance > 0 ? n / drawDistance : 0;
      seg.fog = legacy || fogStrength <= 0 ? 1 : clamp01(1 - nRatio * fogStrength);
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
      this.clipNeedsStencil[n] = crestIsBridge ? 1 : 0;

      if (isCameraInTunnel && !leftCameraTunnel) {
        if (seg.env === 'tunnel') {
          cameraTunnelEndN = n;
        } else {
          leftCameraTunnel = true;
        }
      }

      if (
        seg.p1.cameraZ > cameraDepth &&
        seg.p2.screenY < seg.p1.screenY &&
        seg.p2.screenY < maxy
      ) {
        maxy = seg.p2.screenY;
        crestIsBridge = seg.env === 'bridge';
      }
    }

    let isTunnelExitVisible = false;
    if (isCameraInTunnel && leftCameraTunnel && cameraTunnelEndN >= 0) {
      const endSeg = this.visible[cameraTunnelEndN]!;
      if (cameraTunnelEndN === 0 || endSeg.p1.cameraZ <= cameraDepth) {
        isTunnelExitVisible = true;
      } else {
        const endCeilY2 = endSeg.p2.screenY - Math.max(3, endSeg.p2.screenW * 1.16);
        isTunnelExitVisible = endCeilY2 < this.clipY[cameraTunnelEndN]!;
      }
    }

    this.tunnelMaskEmitted = false;
    this.boreBoundsInit = false;
    this.boreMinX = 0;
    this.boreMaxX = width;
    this.boreMinY = 0;
    this.boreMaxY = height;

    // Pass 2: painter's algorithm (back-to-front).
    let pass2StartN = drawDistance - 1;
    if (isCameraInTunnel && !isTunnelExitVisible) {
      ctx.fillStyle = '#070510';
      ctx.fillRect(0, 0, width, height);
      this.tunnelMaskEmitted = true;
      if (cameraTunnelEndN >= 0) {
        pass2StartN = Math.min(drawDistance - 1, cameraTunnelEndN);
      }
    } else if (isCameraOnBridge) {
      // Pre-fill palette-harmonized bay water surface once below the horizon (avoids ~180 full-width overdraws on bridge climbs)
      const waterColors = palette.water ?? palette.grass;
      if (typeof ctx.createLinearGradient === 'function') {
        if (
          this.cachedBridgeWaterCtx !== ctx ||
          this.cachedBridgeWaterHeight !== height ||
          this.cachedBridgeWaterFog !== palette.fog ||
          this.cachedBridgeWater0 !== waterColors[0] ||
          this.cachedBridgeWater1 !== waterColors[1] ||
          !this.cachedBridgeWaterGrad
        ) {
          const wGrad = ctx.createLinearGradient(0, horizonY, 0, height);
          wGrad.addColorStop(0, palette.fog);
          wGrad.addColorStop(0.10, waterColors[0]);
          wGrad.addColorStop(0.28, waterColors[1]);
          wGrad.addColorStop(1, waterColors[1]);
          this.cachedBridgeWaterCtx = ctx;
          this.cachedBridgeWaterHeight = height;
          this.cachedBridgeWaterFog = palette.fog;
          this.cachedBridgeWater0 = waterColors[0];
          this.cachedBridgeWater1 = waterColors[1];
          this.cachedBridgeWaterGrad = wGrad;
        }
        ctx.fillStyle = this.cachedBridgeWaterGrad;
      } else {
        ctx.fillStyle = waterColors[1];
      }
      ctx.fillRect(0, horizonY, width, height - horizonY);
    }

    // Zero-gap distant slice coalescing state (prevents sky slits on distant hills while keeping low draw counts)
    let coalesceTopY = Number.POSITIVE_INFINITY;
    let coalesceEnv: RoadSegment['env'] | null = null;
    let coalesceCount = 0;
    let coalesceFarSeg: RoadSegment | null = null;

    for (let n = pass2StartN; n >= 0; n--) {
      const isNextSeg = hasNextTrackLookahead && n >= nextTrackStartPassIdx;
      const seg = this.visible[n]!;
      const { p1, p2 } = seg;
      if (p1.cameraZ <= cameraDepth) {
        coalesceTopY = Number.POSITIVE_INFINITY;
        coalesceEnv = null;
        coalesceCount = 0;
        coalesceFarSeg = null;
        continue; // behind the projection plane
      }

      const isInCurrentTunnel = isCameraInTunnel && n <= cameraTunnelEndN;
      const isTunnelSeg = seg.env === 'tunnel';
      const firstTruckIdx = !isNextSeg && traffic ? traffic.getFirstTruckOnSegment(seg.index) : -1;
      const segClipY = this.clipY[n]!;
      const segForkZoneStartZ = isNextSeg ? undefined : view.forkZoneStartZ;
      const roadVisible = p2.screenY < p1.screenY && p2.screenY < segClipY;
      const tunnelWallVisible =
        isTunnelSeg && !roadVisible && p2.screenY - Math.max(3, p2.screenW * 1.16) < segClipY;

      // Skip segments occluded behind a hill crest (tunnel walls/ceiling remain visible above crest/sag)
      if (roadVisible || tunnelWallVisible) {
        if (coalesceEnv !== seg.env || p2.screenY < coalesceTopY - 0.5) {
          coalesceTopY = Number.POSITIVE_INFINITY;
          coalesceCount = 0;
          coalesceFarSeg = null;
        }
        const effectiveTopY = Math.min(p2.screenY, coalesceTopY);
        const clampedBottomY = Math.min(p1.screenY, segClipY);
        const combinedDy = clampedBottomY - effectiveTopY;

        const segArr = isNextSeg ? view.nextTrack!.segments : segments;
        const segArrLen = segArr.length;
        const prevEnv =
          segArrLen > 0
            ? (segArr[(seg.index - 1 + segArrLen) % segArrLen]?.env ?? 'standard')
            : 'standard';
        const nextEnv =
          segArrLen > 0 ? (segArr[(seg.index + 1) % segArrLen]?.env ?? 'standard') : 'standard';

        let shouldDeferSlice = false;
        if (legacy) {
          const dy = p1.screenY - p2.screenY;
          shouldDeferSlice = !(dy >= 0.15 || p1.screenW >= 8 || seg.sprites.length > 0 || firstTruckIdx !== -1);
        } else if (
          (seg.env ?? 'standard') === 'standard' &&
          n > 60 &&
          combinedDy < 0.75 &&
          seg.sprites.length === 0 &&
          firstTruckIdx === -1 &&
          !(segForkZoneStartZ !== undefined && p2.worldZ > segForkZoneStartZ && trackLength > segForkZoneStartZ)
        ) {
          const nextSeg = this.visible[n - 1];
          const nextClipY = this.clipY[n - 1]!;
          if (
            nextSeg &&
            nextSeg.p1.cameraZ > cameraDepth &&
            nextSeg.env === seg.env &&
            nextSeg.p2.screenY < nextSeg.p1.screenY &&
            nextSeg.p2.screenY < nextClipY &&
            Math.abs(nextSeg.p2.screenY - p1.screenY) <= 1.0
          ) {
            shouldDeferSlice = true;
          }
        } else if (
          isTunnelSeg &&
          p1.screenW < 64 &&
          roadVisible &&
          coalesceCount < 6 &&
          combinedDy < 1.8 &&
          !(seg.tunnelLight !== undefined ? seg.tunnelLight : seg.index % 16 === 0) &&
          !(
            p1.screenW >= 28 &&
            (seg.index % 12 === 0 || (Math.abs(seg.curve) >= 2.2 && seg.index % 8 === 0))
          ) &&
          firstTruckIdx === -1 &&
          prevEnv === 'tunnel' &&
          nextEnv === 'tunnel'
        ) {
          const nextSeg = this.visible[n - 1];
          const nextClipY = this.clipY[n - 1]!;
          const farAnchor = coalesceFarSeg ?? seg;
          if (
            nextSeg &&
            nextSeg.p1.cameraZ > cameraDepth &&
            nextSeg.env === 'tunnel' &&
            nextSeg.p2.screenY < nextSeg.p1.screenY &&
            nextSeg.p2.screenY < nextClipY &&
            Math.abs(nextSeg.p2.screenY - p1.screenY) <= 1.0 &&
            Math.abs(nextSeg.curve - seg.curve) <= 0.45 &&
            Math.abs(farAnchor.p2.screenX - nextSeg.p1.screenX) <= 14.0 &&
            Math.abs(farAnchor.p2.screenW - nextSeg.p1.screenW) <= 8.0
          ) {
            shouldDeferSlice = true;
          }
        }

        if (shouldDeferSlice) {
          if (!legacy) {
            if (isTunnelSeg && coalesceFarSeg === null) {
              coalesceFarSeg = seg;
            }
            coalesceTopY = effectiveTopY;
            coalesceEnv = seg.env;
            coalesceCount++;
          }
        } else {
          this.stats.drawnSegments++;
          const nRatio = drawDistance > 0 ? n / drawDistance : 0;
          const fogBand =
            legacy || fogStrength <= 0
              ? 0
              : nRatio < 0.25
                ? 0
                : nRatio < 0.5
                  ? 1
                  : nRatio < 0.75
                    ? 2
                    : 3;
          const tSeg0 = sampleSubsystems ? performance.now() : 0;
          const farP2 = coalesceCount > 0 && isTunnelSeg && coalesceFarSeg ? coalesceFarSeg.p2 : undefined;
          this.renderSegment(
            ctx,
            width,
            height,
            seg,
            palette,
            view.beatPulse ?? 0,
            segForkZoneStartZ,
            trackLength,
            view.forkChoice,
            segClipY,
            isCameraOnBridge,
            isInCurrentTunnel,
            prevEnv,
            nextEnv,
            horizonY,
            view.grooveIntensity ?? 0.5,
            legacy,
            coalesceCount > 0 ? effectiveTopY : undefined,
            coalesceCount > 0,
            fogBand,
            roadVisible,
            farP2?.screenX,
            farP2?.screenW,
          );
          if (sampleSubsystems) {
            sampleSlicesMs += performance.now() - tSeg0;
          }
          coalesceTopY = Number.POSITIVE_INFINITY;
          coalesceEnv = null;
          coalesceCount = 0;
          coalesceFarSeg = null;
        }
      } else {
        coalesceTopY = Number.POSITIVE_INFINITY;
        coalesceEnv = null;
        coalesceCount = 0;
        coalesceFarSeg = null;
      }

      const ppu = (p1.scale * width) / 2;
      const scaledPpu = (ppu * roadWidth) / 2000;
      const refPpu = scaledPpu * (640 / Math.max(1, width));
      if (refPpu < (legacy ? 0.001 : 0.004)) continue;

      const sprites = view.skipProps || isInCurrentTunnel ? EMPTY_SPRITES : seg.sprites;
      if (sprites.length === 0 && firstTruckIdx === -1) continue;

      // Skip segment sprites/traffic if occluded behind a hill crest
      if (p1.screenY - 12000 * scaledPpu >= segClipY) continue;

      // Smooth distant alpha fade-in over far ~18% of drawDistance + low refPpu horizon band
      const nRatio = drawDistance > 0 ? n / drawDistance : 0;
      const distAlpha =
        !legacy && drawDistance > 0 && n > drawDistance * 0.82
          ? Math.max(0.05, Math.min(1, (1 - nRatio) / 0.18))
          : 1;
      const ppuAlpha = Math.min(1, Math.max(0, (refPpu - 0.001) / 0.005));
      const propAlpha = legacy ? ppuAlpha : Math.min(distAlpha, ppuAlpha);
      const needsPropAlpha = propAlpha < 0.98;
      const needsStencilClip = legacy || this.clipNeedsStencil[n] === 1;
      let crestClipActive = false;
      let activeAlpha = 1;

      if (legacy && needsPropAlpha && sprites.length > 0) {
        ctx.globalAlpha = propAlpha;
        activeAlpha = propAlpha;
      }

      // Roadside props (shifted outward along the widening Y-fork so props never sit on the asphalt)
      const tProps0 = sampleSubsystems && sprites.length > 0 ? performance.now() : 0;
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
        const propRefPpu = propPpu * (640 / Math.max(1, width));

        // Phase 1: Per-category local distance & PPU fade-in (eliminates mid-distance pop-in)
        let propFogFactor = 0;
        let targetAlpha = propAlpha;
        if (!legacy) {
          const absOff = Math.abs(s.offset);
          let maxRatio = 1.0;
          let fadeRatioSpan = 0.18;
          let minRefPpu = 0.004;
          let fadePpuSpan = 0.003;

          if (absOff >= 6.0) {
            maxRatio = 0.5;
            fadeRatioSpan = 0.12;
            minRefPpu = 0.0095;
            fadePpuSpan = 0.004;
          } else if (
            resolvedKind === 'shrub' ||
            resolvedKind === 'bench' ||
            resolvedKind === 'chevron' ||
            resolvedKind === 'jihanki' ||
            resolvedKind === 'phonebooth' ||
            resolvedKind === 'bus-stop'
          ) {
            maxRatio = 0.58;
            fadeRatioSpan = 0.12;
            minRefPpu = 0.0095;
            fadePpuSpan = 0.004;
          } else if (resolvedKind === 'building' && absOff >= 3.0 && absOff < 6.0) {
            maxRatio = 0.78;
            fadeRatioSpan = 0.14;
            minRefPpu = 0.0055;
            fadePpuSpan = 0.003;
          } else if (
            resolvedKind === 'sign' ||
            resolvedKind === 'lamp' ||
            resolvedKind === 'toro' ||
            resolvedKind === 'kiosk' ||
            resolvedKind === 'canopy' ||
            (absOff >= 3.0 && resolvedKind !== 'building' && resolvedKind !== 'pylon')
          ) {
            maxRatio = 0.68;
            fadeRatioSpan = 0.12;
            minRefPpu = 0.0085;
            fadePpuSpan = 0.0035;
          }

          if (nRatio >= maxRatio || propRefPpu <= minRefPpu) {
            continue;
          }

          const localDistAlpha =
            nRatio > maxRatio - fadeRatioSpan
              ? clamp01((maxRatio - nRatio) / fadeRatioSpan)
              : 1;
          const localPpuAlpha =
            propRefPpu < minRefPpu + fadePpuSpan
              ? clamp01((propRefPpu - minRefPpu) / fadePpuSpan)
              : 1;
          const effectiveAlpha = Math.min(propAlpha, localDistAlpha, localPpuAlpha);
          if (effectiveAlpha < 0.04) continue;

          targetAlpha = effectiveAlpha >= 0.98 ? 1 : effectiveAlpha;

          const relDepth = clamp01(nRatio / Math.max(0.1, maxRatio));
          if (relDepth > 0.35 && tuning.propAtmosphereFog > 0) {
            propFogFactor = clamp01(((relDepth - 0.35) / 0.45) * tuning.propAtmosphereFog);
          }
        } else if (Math.abs(s.offset) >= 6.0 && propPpu < 0.0012) {
          continue;
        }

        const effectiveOffset = getEffectivePropOffset(
          s.offset,
          p1.worldZ,
          trackLength,
          segForkZoneStartZ,
          view.forkChoice,
        );
        const sx = p1.screenX + p1.screenW * effectiveOffset;

        // Phase 3: Always register every visible pylon in the longitudinal wire chain regardless of lateral cull,
        // so catenary spans never pop off when the near tower slides past the viewport edge.
        if (resolvedKind === 'pylon' && s.chainId !== undefined && !view.skipPylonWires) {
          if (!legacy && activeAlpha !== 1) {
            ctx.globalAlpha = 1;
            activeAlpha = 1;
          }
          this.handlePylonChainWires(
            ctx,
            s,
            sx,
            p1.screenY,
            propPpu,
            seg.index,
            isNextSeg ? view.nextTrack!.segments.length : segments.length,
            legacy,
          );
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

        // Per-prop vertical crest culling using actual world height
        if (p1.screenY - getPropWorldHeight(resolvedKind) * propPpu >= segClipY) continue;

        if (!legacy) {
          if (
            (targetAlpha === 1 && activeAlpha !== 1) ||
            Math.abs(targetAlpha - activeAlpha) > 0.02
          ) {
            ctx.globalAlpha = targetAlpha;
            activeAlpha = targetAlpha;
          }
        }

        if (
          !crestClipActive &&
          segClipY < height &&
          p1.screenY > segClipY + 0.5 &&
          needsStencilClip &&
          typeof ctx.clip === 'function'
        ) {
          ctx.save();
          ctx.beginPath();
          ctx.moveTo(0, 0);
          ctx.lineTo(width, 0);
          ctx.lineTo(width, segClipY);
          ctx.lineTo(0, segClipY);
          ctx.closePath();
          ctx.clip();
          crestClipActive = true;
          this.stats.crestClips++;
        }

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
          segClipY,
          propFogFactor,
        );
        this.stats.drawnProps++;
      }

      if (crestClipActive) {
        ctx.restore();
      }
      if (activeAlpha !== 1) {
        ctx.globalAlpha = 1;
      }
      if (sampleSubsystems && sprites.length > 0) {
        samplePropsMs += performance.now() - tProps0;
      }

      // AI Kei Trucks on this segment (diverging onto the left/right Y-fork branch)
      if (traffic && firstTruckIdx !== -1 && !view.skipTraffic) {
        const tTraffic0 = sampleSubsystems ? performance.now() : 0;
        let truckClipActive = false;
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
                if (
                  !truckClipActive &&
                  needsStencilClip &&
                  segClipY < height &&
                  truckScreenY > segClipY + 0.5 &&
                  typeof ctx.clip === 'function'
                ) {
                  ctx.save();
                  ctx.beginPath();
                  ctx.moveTo(0, 0);
                  ctx.lineTo(width, 0);
                  ctx.lineTo(width, segClipY);
                  ctx.lineTo(0, segClipY);
                  ctx.closePath();
                  ctx.clip();
                  truckClipActive = true;
                  this.stats.crestClips++;
                }
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
        if (truckClipActive) {
          ctx.restore();
        }
        if (sampleSubsystems) {
          sampleTrafficMs += performance.now() - tTraffic0;
        }
      }
    }

    // Phase 3 Edge case (b): extrapolate wires for nearest visible tower behind camera
    const tWires0 = sampleSubsystems ? performance.now() : 0;
    if (!view.skipPylonWires && !view.skipProps && !isCameraInTunnel) {
      this.extrapolateNearestPylonWires(ctx, width, height, legacy);
    }
    if (sampleSubsystems) {
      samplePropsMs += performance.now() - tWires0;
      this.stats.slicesMs = this.stats.slicesMs * 0.75 + sampleSlicesMs * 0.25;
      this.stats.propsMs = this.stats.propsMs * 0.75 + samplePropsMs * 0.25;
      this.stats.trafficMs = this.stats.trafficMs * 0.75 + sampleTrafficMs * 0.25;
    }
  }

  private handlePylonChainWires(
    ctx: CanvasRenderingContext2D,
    sprite: RoadSprite,
    sx: number,
    sy: number,
    propPpu: number,
    segIndex: number,
    trackSegCount: number,
    legacy = false,
  ): void {
    const chainId = sprite.chainId!;
    const variant = sprite.variant;

    // 1. Compute 5 attachment points into pre-allocated scratch array (zero GC)
    getPylonAttachmentPoints(sx, sy, propPpu, this.currentPylonPoints, 0, variant);

    // 2. Find existing slot for this chainId
    let slot = -1;
    let emptySlot = -1;
    for (let s = 0; s < RoadRenderer.MAX_CHAIN_SLOTS; s++) {
      if (this.chainSlotMeta[s * 5 + 1] === 1) {
        if (this.chainSlotMeta[s * 5] === chainId) {
          slot = s;
          break;
        }
      } else if (emptySlot === -1) {
        emptySlot = s;
      }
    }

    if (slot !== -1) {
      // Previous (farther) tower exists in this chain!
      const farVariant = this.chainSlotMeta[slot * 5 + 2]!;
      const farSegIndex = this.chainSlotMeta[slot * 5 + 3]!;
      const isCrossing = variant === 2 && farVariant === 2;
      const rawDelta = Math.abs(farSegIndex - segIndex);
      const segDelta =
        trackSegCount > 0 ? Math.min(rawDelta, trackSegCount - rawDelta) : rawDelta;

      // Connect all consecutive towers belonging to the same corridor run
      if (isCrossing || segDelta <= 200) {
        if (legacy || propPpu >= 0.0055) {
          ctx.strokeStyle = '#2d1c4a';
          ctx.lineWidth = 1;

          const pOffset = slot * 10;
          let drewAnyWire = false;
          if (legacy) {
            for (let k = 0; k < 5; k++) {
              const xNear = this.currentPylonPoints[k * 2]!;
              const yNear = this.currentPylonPoints[k * 2 + 1]!;
              const xFar = this.chainSlotPoints[pOffset + k * 2]!;
              const yFar = this.chainSlotPoints[pOffset + k * 2 + 1]!;

              drewAnyWire = true;
              const dx = xFar - xNear;
              const dy = yFar - yNear;
              const dist = Math.sqrt(dx * dx + dy * dy);

              const sagRatio = isCrossing ? 0.05 : 0.09;
              const sag = Math.max(1.5, dist * sagRatio);
              const midX = (xNear + xFar) * 0.5;
              const midY = (yNear + yFar) * 0.5 + sag;

              ctx.beginPath();
              ctx.moveTo(xNear, yNear);
              ctx.quadraticCurveTo(midX, midY, xFar, yFar);
              ctx.stroke();
            }

            if (drewAnyWire) {
              this.stats.drawnPylonSpans++;
            }

            if (drewAnyWire && propPpu > 0.0035) {
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
          } else {
            // Batched catenary wire draw: 1 beginPath + 5 quadratic curves + 1 stroke
            ctx.beginPath();
            for (let k = 0; k < 5; k++) {
              const xNear = this.currentPylonPoints[k * 2]!;
              const yNear = this.currentPylonPoints[k * 2 + 1]!;
              const xFar = this.chainSlotPoints[pOffset + k * 2]!;
              const yFar = this.chainSlotPoints[pOffset + k * 2 + 1]!;

              const dx = xFar - xNear;
              const dy = yFar - yNear;
              const dist = Math.sqrt(dx * dx + dy * dy);
              const sagRatio = isCrossing ? 0.05 : 0.09;
              const sag = Math.max(1.5, dist * sagRatio);
              const midX = (xNear + xFar) * 0.5;
              const midY = (yNear + yFar) * 0.5 + sag;

              ctx.moveTo(xNear, yNear);
              ctx.quadraticCurveTo(midX, midY, xFar, yFar);
            }
            ctx.stroke();
            this.stats.drawnPylonSpans++;

            if (propPpu > 0.018) {
              ctx.strokeStyle = 'rgba(128, 245, 236, 0.22)';
              ctx.beginPath();
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
                ctx.moveTo(xNear, yNear);
                ctx.quadraticCurveTo((xNear + xFar) * 0.5, (yNear + yFar) * 0.5 + sag, xFar, yFar);
              }
              ctx.stroke();
            }
          }
        }

        this.chainSlotMeta[slot * 5 + 4] = this.chainSlotMeta[slot * 5 + 4]! + 1;
      }

      if (isCrossing) {
        // Crossing is self-contained; free slot so it doesn't chain further
        this.chainSlotMeta[slot * 5 + 1] = 0;
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
      this.chainSlotMeta[slot * 5 + 2] = variant;
      this.chainSlotMeta[slot * 5 + 3] = segIndex;
    } else {
      // First visible tower for this chain (farthest visible tower in Pass 2).
      // Never draw cut-off horizon stubs: upcoming nearer towers in Pass 2 will connect to it.
      const targetSlot = emptySlot !== -1 ? emptySlot : 0;
      const pOffset = targetSlot * 10;

      // Store current tower into target slot
      this.chainSlotMeta[targetSlot * 5] = chainId;
      this.chainSlotMeta[targetSlot * 5 + 1] = 1;
      this.chainSlotMeta[targetSlot * 5 + 2] = variant;
      this.chainSlotMeta[targetSlot * 5 + 3] = segIndex;
      this.chainSlotMeta[targetSlot * 5 + 4] = 0;
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
    legacy = false,
  ): void {
    ctx.strokeStyle = '#2d1c4a';
    ctx.lineWidth = 1;

    for (let s = 0; s < RoadRenderer.MAX_CHAIN_SLOTS; s++) {
      if (this.chainSlotMeta[s * 5 + 1] !== 1) continue;
      const variant = this.chainSlotMeta[s * 5 + 2];
      // Skip terminal (1) and crossing (2): lines do not continue past terminal
      if (variant === 1 || variant === 2) continue;

      const wiredCount = this.chainSlotMeta[s * 5 + 4]!;
      const towerX = this.chainSlotPos[s * 2]!;
      const towerY = this.chainSlotPos[s * 2 + 1]!;

      // Do not shoot extrapolated wires from a lone distant tower peeking over the horizon
      if (wiredCount === 0 && towerY < height * 0.6) continue;

      let vx = this.chainSlotVec[s * 2]!;
      let vy = this.chainSlotVec[s * 2 + 1]!;

      if (vx === 0 && vy === 0) {
        // Only one tower of this chain was visible near the camera; extrapolate outward/downward
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

      // Skip if the nearest tower is already off-screen pointing outward
      if (
        (towerX < -80 && dirX <= 0) ||
        (towerX > width + 80 && dirX >= 0) ||
        towerY > height + 80
      ) {
        continue;
      }

      // Compute exit length so extrapolated cables always extend beyond the viewport border
      let tx = 1e6;
      if (dirX > 0.001) tx = (width + 24 - towerX) / dirX;
      else if (dirX < -0.001) tx = (-24 - towerX) / dirX;
      const ty = dirY > 0.001 ? (height + 24 - towerY) / dirY : 1e6;
      const extLen = Math.max(140, Math.min(width + height, Math.min(tx, ty) + 40));

      const pOffset = s * 10;

      if (legacy) {
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
      } else {
        ctx.beginPath();
        for (let k = 0; k < 5; k++) {
          const xNear = this.chainSlotPoints[pOffset + k * 2]!;
          const yNear = this.chainSlotPoints[pOffset + k * 2 + 1]!;
          ctx.moveTo(xNear, yNear);
          ctx.lineTo(xNear + dirX * extLen, yNear + dirY * extLen);
        }
        ctx.stroke();
      }
    }
  }

  private renderSegment(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    seg: RoadSegment,
    palette: StagePalette,
    beatPulse = 0,
    forkZoneStartZ?: number,
    trackLength = 1,
    forkChoice?: 'left' | 'right',
    segClipY = Number.POSITIVE_INFINITY,
    isCameraOnBridge = false,
    isCameraInTunnel = false,
    prevEnv: RoadSegment['env'] = 'standard',
    nextEnv: RoadSegment['env'] = 'standard',
    horizonY = 180,
    grooveIntensity = 0.5,
    legacy = false,
    overrideTopY?: number,
    isCoalesced = false,
    fogBand = 0,
    drawRoadFloor = true,
    overrideFarX2?: number,
    overrideFarW2?: number,
  ): void {
    const { p1, p2, stripe } = seg;
    const grassColor = stripe === 0 ? this.fogGrass0[fogBand]! : this.fogGrass1[fogBand]!;
    const roadColor = stripe === 0 ? this.fogRoad0[fogBand]! : this.fogRoad1[fogBand]!;
    const rumbleColor = stripe === 0 ? this.fogRumble0[fogBand]! : this.fogRumble1[fogBand]!;
    const laneColor = this.fogLane[fogBand]!;
    let x1 = p1.screenX;
    let y1 = p1.screenY;
    let w1 = p1.screenW;
    const x2 = overrideFarX2 !== undefined ? overrideFarX2 : p2.screenX;
    const topScreenY = overrideTopY !== undefined ? overrideTopY : p2.screenY;
    const y2 = topScreenY - 1; // 1px overlap hides anti-aliasing seams between slices
    const w2 = overrideFarW2 !== undefined ? overrideFarW2 : p2.screenW;

    const isTunnel = seg.env === 'tunnel';

    // Clip near edge to segClipY (screen bottom or hill crest) along the projected edge so
    // lane lines, rumble strips, and road edges stay straight instead of flaring into a funnel.
    // Tunnel geometry receives unclipped p1 (with floor-only clipping inside renderTunnelSegment)
    // so steering near edges and straddling crests never collapse or tear 3D tunnel walls.
    let clipT = 1;
    if (!isTunnel && y1 > segClipY) {
      const spanY = p1.screenY - p2.screenY;
      if (spanY > 0.0001) {
        clipT = clamp01((segClipY - p2.screenY) / spanY);
        x1 = x2 + (p1.screenX - x2) * clipT;
        w1 = w2 + (p1.screenW - w2) * clipT;
      }
      y1 = segClipY;
    }

    const clampedGroove = Math.max(0, Math.min(1.15, grooveIntensity));
    const pulseScale = 1 + beatPulse * tuning.bpmPulseStrength * 0.28 * (0.75 + clampedGroove * 0.55);
    const r1 = (w1 / Math.max(6, 2 * LANES)) * pulseScale;
    const r2 = (w2 / Math.max(6, 2 * LANES)) * pulseScale;

    const isBridge = seg.env === 'bridge';
    const isViaduct = seg.env === 'viaduct';

    if (isTunnel) {
      this.renderTunnelSegment(
        ctx,
        width,
        height,
        seg,
        palette,
        grassColor,
        roadColor,
        rumbleColor,
        laneColor,
        x1,
        y1,
        w1,
        r1,
        x2,
        y2,
        w2,
        r2,
        beatPulse,
        isCameraInTunnel,
        prevEnv !== 'tunnel',
        nextEnv !== 'tunnel',
        segClipY,
        drawRoadFloor,
        isCoalesced,
      );
      return;
    }

    // Bridge bay water surface vs viaduct/terrain ground fill.
    // Viaducts NEVER draw bay water; non-bridge terrain fills [y2, y1] for natural hill-crest occlusion.
    if (isBridge && isCameraOnBridge) {
      if (stripe === 0 && y1 > horizonY) {
        const waterColors = palette.water ?? palette.grass;
        const waterY2 = Math.max(horizonY, y2);
        ctx.fillStyle = waterColors[0];
        ctx.fillRect(0, waterY2, width, y1 - waterY2);
      }
    } else if (isBridge) {
      const baseY2 = Math.max(horizonY, y2);
      if (y1 > baseY2) {
        ctx.fillStyle = grassColor;
        ctx.fillRect(0, baseY2, width, y1 - baseY2);
      }
    } else {
      ctx.fillStyle = isCoalesced ? this.fogGrass1[3]! : grassColor;
      ctx.fillRect(0, y2, width, y1 - y2);
    }

    // OutRun physical Y-fork geometry in the final outro segments when forkZoneStartZ is active
    if (forkZoneStartZ !== undefined && p2.worldZ > forkZoneStartZ && trackLength > forkZoneStartZ) {
      this.renderForkSegment(
        ctx,
        seg,
        rumbleColor,
        roadColor,
        laneColor,
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
        legacy,
        clipT,
      );
      return;
    }

    const sliceH = y1 - y2;
    const rawDy = p1.screenY - p2.screenY;
    const useFastSliceRect =
      !isBridge &&
      !isViaduct &&
      (legacy
        ? w1 < 20 && rawDy < 2.2
        : isCoalesced || (rawDy <= 1.6 && Math.abs(w1 - w2) <= 4.5 && Math.abs(x1 - x2) <= 3.5));
    if (useFastSliceRect) {
      // Distant thin-slice fast path: separate non-overlapping curb & asphalt fillRects avoid both
      // path tessellation and sub-pixel rumble color bleed across the asphalt surface.
      const mx = (x1 + x2) * 0.5;
      const mw = (w1 + w2) * 0.5;
      const mr = (r1 + r2) * 0.5;
      const roadLeft = Math.round(mx - mw);
      const roadRight = Math.round(mx + mw);
      const roadSpan = Math.max(1, roadRight - roadLeft);
      const curbW = Math.max(1, Math.round(mr));

      ctx.fillStyle = isCoalesced ? this.cachedHorizonCurbColor : rumbleColor;
      ctx.fillRect(roadLeft - curbW, y2, curbW, sliceH);
      ctx.fillRect(roadRight, y2, curbW, sliceH);

      ctx.fillStyle = isCoalesced ? this.cachedHorizonRoadColor : roadColor;
      ctx.fillRect(roadLeft, y2, roadSpan, sliceH);

      if (!isCoalesced && stripe === 0 && w1 >= 6) {
        ctx.fillStyle = laneColor;
        const lw = Math.max(1, mw / Math.max(32, 8 * LANES));
        const laneStep = roadSpan / LANES;
        let lx = roadLeft + laneStep;
        for (let lane = 1; lane < LANES; lane++) {
          ctx.fillRect(lx - lw * 0.5, y2, lw, sliceH);
          lx += laneStep;
        }
      }
    } else {
      ctx.fillStyle = rumbleColor;
      drawRumblePair(ctx, x1, y1, x2, y2, w1, w2, r1, r2);

      ctx.fillStyle = roadColor;
      polygon(ctx, x1 - w1, y1, x1 + w1, y1, x2 + w2, y2, x2 - w2, y2);

      if (stripe === 0 && w1 >= 6) {
        ctx.fillStyle = laneColor;
        drawLanes(ctx, x1, y1, x2, y2, w1, w2);
      }

      // Zero-GC high-Groove / OVERDRIVE outer curb neon edge rails (dash fillRects without stroke/globalAlpha churn)
      if (clampedGroove >= 0.85 && stripe === 0 && !isBridge && !isViaduct && w1 >= 24) {
        const mx = (x1 + x2) * 0.5;
        const mw = (w1 + w2) * 0.5;
        const mr = (r1 + r2) * 0.5;
        ctx.fillStyle = palette.mountainRim;
        ctx.fillRect(mx - mw - mr, y2, 1.5, sliceH);
        ctx.fillRect(mx + mw + mr - 1.5, y2, 1.5, sliceH);
      }
    }

    if (isBridge && w1 >= 18) {
      this.renderBridgeParapets(ctx, seg, x1, y1, w1, r1, x2, y2, w2, r2);
    } else if (isViaduct && w1 >= 18) {
      this.renderViaductParapets(ctx, seg, palette, x1, y1, w1, r1, x2, y2, w2, r2);
    }
  }

  private renderForkSegment(
    ctx: CanvasRenderingContext2D,
    seg: RoadSegment,
    rumbleColor: string,
    roadColor: string,
    laneColor: string,
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
    legacy = false,
    clipT = 1,
  ): void {
    const { p1, p2, stripe } = seg;
    const span = Math.max(1, trackLength - forkZoneStartZ);
    const z1 = clipT < 1 ? p2.worldZ + (p1.worldZ - p2.worldZ) * clipT : p1.worldZ;
    const t1 = clamp01((z1 - forkZoneStartZ) / span);
    const t2 = clamp01((p2.worldZ - forkZoneStartZ) / span);
    const rawDy = p1.screenY - p2.screenY;
    const useFastForkRect =
      !legacy && rawDy <= 1.6 && Math.abs(w1 - w2) <= 4.5 && Math.abs(x1 - x2) <= 3.5;
    const sliceH = y1 - y2;
    const baseLaneStep = Math.max(32, 8 * LANES);

    if (t2 <= FORK_WIDEN_END_T) {
      // Phase 1: Pre-split widening zone with center chevron warning gore
      const p1Norm = t1 / FORK_WIDEN_END_T;
      const p2Norm = t2 / FORK_WIDEN_END_T;
      const pEase1 = smoothstep(p1Norm);
      const pEase2 = smoothstep(p2Norm);

      const outerW1 = w1 * (1 + pEase1 * 0.2);
      const outerW2 = w2 * (1 + pEase2 * 0.2);
      const ir1 = r1 * 0.7;
      const ir2 = r2 * 0.7;
      const c1 = ir1 * pEase1;
      const c2 = ir2 * pEase2;

      const leftLine1 = x1 - (1 / 3 + (0.6 - 1 / 3) * pEase1) * w1;
      const leftLine2 = x2 - (1 / 3 + (0.6 - 1 / 3) * pEase2) * w2;
      const rightLine1 = x1 + (1 / 3 + (0.6 - 1 / 3) * pEase1) * w1;
      const rightLine2 = x2 + (1 / 3 + (0.6 - 1 / 3) * pEase2) * w2;

      if (useFastForkRect) {
        const mx = (x1 + x2) * 0.5;
        const ow = (outerW1 + outerW2) * 0.5;
        const mr = (r1 + r2) * 0.5;
        const roadLeft = Math.round(mx - ow);
        const roadRight = Math.round(mx + ow);
        const curbW = Math.max(1, Math.round(mr));
        ctx.fillStyle = rumbleColor;
        ctx.fillRect(roadLeft - curbW, y2, curbW, sliceH);
        ctx.fillRect(roadRight, y2, curbW, sliceH);
        ctx.fillStyle = roadColor;
        ctx.fillRect(roadLeft, y2, Math.max(1, roadRight - roadLeft), sliceH);
        if (c2 > 0.5) {
          const mc = (c1 + c2) * 0.5;
          ctx.fillStyle =
            stripe === 0 ? (choice === 'right' ? '#ffd319' : '#05d9e8') : rumbleColor;
          ctx.fillRect(mx - mc, y2, mc * 2, sliceH);
        }
        if (stripe === 0 && w1 >= 6) {
          const mw = (w1 + w2) * 0.5;
          const pEaseMid = (pEase1 + pEase2) * 0.5;
          const baseLw = Math.max(1, mw / baseLaneStep);
          const chosenLw = baseLw * (1 + pEaseMid);
          const leftMid = (leftLine1 + leftLine2) * 0.5;
          const rightMid = (rightLine1 + rightLine2) * 0.5;
          ctx.fillStyle = choice === 'left' ? '#05d9e8' : laneColor;
          const lW = choice === 'left' ? chosenLw : baseLw;
          ctx.fillRect(leftMid - lW * 0.5, y2, lW, sliceH);
          ctx.fillStyle = choice === 'right' ? '#ffd319' : laneColor;
          const rW = choice === 'right' ? chosenLw : baseLw;
          ctx.fillRect(rightMid - rW * 0.5, y2, rW, sliceH);
        }
        return;
      }

      // Outer rumble strips (batched pair)
      ctx.fillStyle = rumbleColor;
      drawRumblePair(ctx, x1, y1, x2, y2, outerW1, outerW2, r1, r2);

      // Asphalt road surface
      ctx.fillStyle = roadColor;
      polygon(ctx, x1 - outerW1, y1, x1 + outerW1, y1, x2 + outerW2, y2, x2 - outerW2, y2);

      // Central median gore chevron / triangle (widens smoothly from width 0 at t=0 to ir at t=0.18)
      if (c2 > 0.5) {
        ctx.fillStyle = stripe === 0 ? (choice === 'right' ? '#ffd319' : '#05d9e8') : rumbleColor;
        polygon(ctx, x1 - c1, y1, x1 + c1, y1, x2 + c2, y2, x2 - c2, y2);
      }

      // Continuous lane lines (seamlessly diverging from ±1/3 normal road into ±0.60 branch centers)
      if (stripe === 0 && w1 >= 6) {
        const baseHalf1 = Math.max(0.5, w1 / (baseLaneStep * 2));
        const baseHalf2 = Math.max(0.5, w2 / (baseLaneStep * 2));
        const chosenHalf1 = baseHalf1 * (1 + pEase1);
        const chosenHalf2 = baseHalf2 * (1 + pEase2);

        const lHalf1 = choice === 'left' ? chosenHalf1 : baseHalf1;
        const lHalf2 = choice === 'left' ? chosenHalf2 : baseHalf2;
        ctx.fillStyle = choice === 'left' ? '#05d9e8' : laneColor;
        polygon(ctx, leftLine1 - lHalf1, y1, leftLine1 + lHalf1, y1, leftLine2 + lHalf2, y2, leftLine2 - lHalf2, y2);

        const rHalf1 = choice === 'right' ? chosenHalf1 : baseHalf1;
        const rHalf2 = choice === 'right' ? chosenHalf2 : baseHalf2;
        ctx.fillStyle = choice === 'right' ? '#ffd319' : laneColor;
        polygon(ctx, rightLine1 - rHalf1, y1, rightLine1 + rHalf1, y1, rightLine2 + rHalf2, y2, rightLine2 - rHalf2, y2);
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
      const ir1 = r1 * 0.7;
      const ir2 = r2 * 0.7;

      // Inner curbs transition smoothly from [-ir, 0] / [0, +ir] at t=0.18
      // to median-side [-gap, -gap + r] / [+gap - r, +gap] at t=0.65 so Phase 2->3 is flush.
      const leftInnerL1 = x1 - gap1 - ir1 * (1 - splitEase1);
      const leftInnerR1 = x1 - gap1 + r1 * splitEase1;
      const leftInnerL2 = x2 - gap2 - ir2 * (1 - splitEase2);
      const leftInnerR2 = x2 - gap2 + r2 * splitEase2;

      const rightInnerL1 = x1 + gap1 - r1 * splitEase1;
      const rightInnerR1 = x1 + gap1 + ir1 * (1 - splitEase1);
      const rightInnerL2 = x2 + gap2 - r2 * splitEase2;
      const rightInnerR2 = x2 + gap2 + ir2 * (1 - splitEase2);

      const leftMid1 = x1 - (outerW1 + gap1) * 0.5;
      const leftMid2 = x2 - (outerW2 + gap2) * 0.5;
      const rightMid1 = x1 + (outerW1 + gap1) * 0.5;
      const rightMid2 = x2 + (outerW2 + gap2) * 0.5;

      if (useFastForkRect) {
        const mx = (x1 + x2) * 0.5;
        const ow = (outerW1 + outerW2) * 0.5;
        const gap = (gap1 + gap2) * 0.5;
        const mr = (r1 + r2) * 0.5;
        const leftOuter = Math.round(mx - ow);
        const leftAsphaltInner = Math.round(mx - gap);
        const rightAsphaltInner = Math.round(mx + gap);
        const rightOuter = Math.round(mx + ow);
        const curbW = Math.max(1, Math.round(mr));

        const lInL = Math.round((leftInnerL1 + leftInnerL2) * 0.5);
        const lInR = Math.round((leftInnerR1 + leftInnerR2) * 0.5);
        const rInL = Math.round((rightInnerL1 + rightInnerL2) * 0.5);
        const rInR = Math.round((rightInnerR1 + rightInnerR2) * 0.5);

        ctx.fillStyle = rumbleColor;
        ctx.fillRect(leftOuter - curbW, y2, curbW, sliceH);
        ctx.fillRect(rightOuter, y2, curbW, sliceH);
        ctx.fillStyle = roadColor;
        ctx.fillRect(leftOuter, y2, Math.max(1, leftAsphaltInner - leftOuter), sliceH);
        ctx.fillRect(rightAsphaltInner, y2, Math.max(1, rightOuter - rightAsphaltInner), sliceH);
        ctx.fillStyle = choice === 'left' ? '#05d9e8' : rumbleColor;
        ctx.fillRect(lInL, y2, Math.max(1, lInR - lInL), sliceH);
        ctx.fillStyle = choice === 'right' ? '#ffd319' : rumbleColor;
        ctx.fillRect(rInL, y2, Math.max(1, rInR - rInL), sliceH);

        if (stripe === 0 && w1 >= 6) {
          const mw = (w1 + w2) * 0.5;
          const baseLw = Math.max(1, mw / baseLaneStep);
          const chosenLw = baseLw * 2;
          const leftMid = (leftMid1 + leftMid2) * 0.5;
          const rightMid = (rightMid1 + rightMid2) * 0.5;
          ctx.fillStyle = choice === 'left' ? '#05d9e8' : laneColor;
          const lW = choice === 'left' ? chosenLw : baseLw;
          ctx.fillRect(leftMid - lW * 0.5, y2, lW, sliceH);
          ctx.fillStyle = choice === 'right' ? '#ffd319' : laneColor;
          const rW = choice === 'right' ? chosenLw : baseLw;
          ctx.fillRect(rightMid - rW * 0.5, y2, rW, sliceH);
        }
        return;
      }

      // Outer rumble strips (batched pair)
      ctx.fillStyle = rumbleColor;
      drawRumblePair(ctx, x1, y1, x2, y2, outerW1, outerW2, r1, r2);

      // Left branch asphalt
      ctx.fillStyle = roadColor;
      polygon(ctx, x1 - outerW1, y1, x1 - gap1, y1, x2 - gap2, y2, x2 - outerW2, y2);

      // Right branch asphalt
      ctx.fillStyle = roadColor;
      polygon(ctx, x1 + gap1, y1, x1 + outerW1, y1, x2 + outerW2, y2, x2 + gap2, y2);

      // Inner median V-curbs
      ctx.fillStyle = choice === 'left' ? '#05d9e8' : rumbleColor;
      polygon(ctx, leftInnerL1, y1, leftInnerR1, y1, leftInnerR2, y2, leftInnerL2, y2);

      ctx.fillStyle = choice === 'right' ? '#ffd319' : rumbleColor;
      polygon(ctx, rightInnerL1, y1, rightInnerR1, y1, rightInnerR2, y2, rightInnerL2, y2);

      // Center guide lines down each branch (from ±0.60 at t=0.18 to ±1.10 at t=0.65)
      if (stripe === 0 && w1 >= 6) {
        const baseHalf1 = Math.max(0.5, w1 / (baseLaneStep * 2));
        const baseHalf2 = Math.max(0.5, w2 / (baseLaneStep * 2));
        const chosenHalf1 = baseHalf1 * 2;
        const chosenHalf2 = baseHalf2 * 2;

        const lHalf1 = choice === 'left' ? chosenHalf1 : baseHalf1;
        const lHalf2 = choice === 'left' ? chosenHalf2 : baseHalf2;
        ctx.fillStyle = choice === 'left' ? '#05d9e8' : laneColor;
        polygon(ctx, leftMid1 - lHalf1, y1, leftMid1 + lHalf1, y1, leftMid2 + lHalf2, y2, leftMid2 - lHalf2, y2);

        const rHalf1 = choice === 'right' ? chosenHalf1 : baseHalf1;
        const rHalf2 = choice === 'right' ? chosenHalf2 : baseHalf2;
        ctx.fillStyle = choice === 'right' ? '#ffd319' : laneColor;
        polygon(ctx, rightMid1 - rHalf1, y1, rightMid1 + rHalf1, y1, rightMid2 + rHalf2, y2, rightMid2 - rHalf2, y2);
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

      const u1 = clamp01((t1 - FORK_SPLIT_END_T) / FORK_CONVERGE_SPAN_T);
      const u2 = clamp01((t2 - FORK_SPLIT_END_T) / FORK_CONVERGE_SPAN_T);
      const ease1 = smoothstep(u1);
      const ease2 = smoothstep(u2);

      const branchStart1 = t1 <= FORK_SPLIT_END_T ? Math.abs(getChosenForkCenter(t1, choice)) : FORK_PEAK_BRANCH_CENTER;
      const branchStart2 = FORK_PEAK_BRANCH_CENTER;

      if (useFastForkRect) {
        const cLeft = Math.round((cLeft1 + cLeft2) * 0.5);
        const cRight = Math.round((cRight1 + cRight2) * 0.5);
        const curbW = Math.max(1, Math.round((r1 + r2) * 0.5));
        ctx.fillStyle = rumbleColor;
        ctx.fillRect(cLeft - curbW, y2, curbW, sliceH);
        ctx.fillRect(cRight, y2, curbW, sliceH);
        ctx.fillStyle = roadColor;
        ctx.fillRect(cLeft, y2, Math.max(1, cRight - cLeft), sliceH);

        if (stripe === 0 && w1 >= 6) {
          const mw = (w1 + w2) * 0.5;
          const easeMid = (ease1 + ease2) * 0.5;
          const baseLw = Math.max(1, mw / baseLaneStep);
          const convLw = baseLw * (2 - easeMid);
          if (choice === 'right') {
            const rightLine1 = x1 + (branchStart1 * (1 - ease1) + (1 / 3) * ease1) * w1;
            const rightLine2 = x2 + (branchStart2 * (1 - ease2) + (1 / 3) * ease2) * w2;
            ctx.fillStyle = easeMid < 0.85 ? '#ffd319' : laneColor;
            ctx.fillRect((rightLine1 + rightLine2) * 0.5 - convLw * 0.5, y2, convLw, sliceH);

            const leftLineMid = (x1 + x2) * 0.5 - (1 / 3) * mw;
            if (leftLineMid > cLeft + baseLw) {
              const alpha = Math.min(1, (leftLineMid - cLeft) / (mw * 0.25));
              const prevAlpha = ctx.globalAlpha;
              ctx.globalAlpha = prevAlpha * alpha;
              ctx.fillStyle = laneColor;
              ctx.fillRect(leftLineMid - baseLw * 0.5, y2, baseLw, sliceH);
              ctx.globalAlpha = prevAlpha;
            }
          } else {
            const leftLine1 = x1 - (branchStart1 * (1 - ease1) + (1 / 3) * ease1) * w1;
            const leftLine2 = x2 - (branchStart2 * (1 - ease2) + (1 / 3) * ease2) * w2;
            ctx.fillStyle = easeMid < 0.85 ? '#05d9e8' : laneColor;
            ctx.fillRect((leftLine1 + leftLine2) * 0.5 - convLw * 0.5, y2, convLw, sliceH);

            const rightLineMid = (x1 + x2) * 0.5 + (1 / 3) * mw;
            if (rightLineMid < cRight - baseLw) {
              const alpha = Math.min(1, (cRight - rightLineMid) / (mw * 0.25));
              const prevAlpha = ctx.globalAlpha;
              ctx.globalAlpha = prevAlpha * alpha;
              ctx.fillStyle = laneColor;
              ctx.fillRect(rightLineMid - baseLw * 0.5, y2, baseLw, sliceH);
              ctx.globalAlpha = prevAlpha;
            }
          }
        }

        const u2Unchosen = (t2 - FORK_SPLIT_END_T) / FORK_CONVERGE_SPAN_T;
        const unchosenAlpha = Math.max(0, 1 - u2Unchosen * 1.4);
        if (unchosenAlpha > 0.08) {
          const prevAlpha = ctx.globalAlpha;
          ctx.globalAlpha = prevAlpha * unchosenAlpha;
          const uSign = choice === 'left' ? 1 : -1;
          const u1Unchosen = Math.max(0, (t1 - FORK_SPLIT_END_T) / FORK_CONVERGE_SPAN_T);
          const eMid = smoothstep((u1Unchosen + Math.max(0, u2Unchosen)) * 0.5);
          const uCenter = uSign * (FORK_PEAK_BRANCH_CENTER + 0.35 * eMid) * ((w1 + w2) * 0.5);
          const uHalfW = 0.58 * (1 - 0.2 * eMid) * ((w1 + w2) * 0.5);
          const uLeft = Math.round((x1 + x2) * 0.5 + uCenter - uHalfW);
          const uRight = Math.round((x1 + x2) * 0.5 + uCenter + uHalfW);
          ctx.fillStyle = rumbleColor;
          ctx.fillRect(uLeft - curbW, y2, curbW, sliceH);
          ctx.fillRect(uRight, y2, curbW, sliceH);
          ctx.fillStyle = roadColor;
          ctx.fillRect(uLeft, y2, Math.max(1, uRight - uLeft), sliceH);
          ctx.globalAlpha = prevAlpha;
        }
        return;
      }

      // Chosen branch outer rumble strips (batched pair)
      ctx.fillStyle = rumbleColor;
      drawRumblePairSplit(ctx, cLeft1, cRight1, y1, cLeft2, cRight2, y2, r1, r2);

      // Chosen branch asphalt
      ctx.fillStyle = roadColor;
      polygon(ctx, cLeft1, y1, cRight1, y1, cRight2, y2, cLeft2, y2);

      // Seamless lane lines converging into standard 3-lane highway dividers (±1/3)
      if (stripe === 0 && w1 >= 6) {
        const baseHalf1 = Math.max(0.5, w1 / (baseLaneStep * 2));
        const baseHalf2 = Math.max(0.5, w2 / (baseLaneStep * 2));
        const convHalf1 = baseHalf1 * (2 - ease1);
        const convHalf2 = baseHalf2 * (2 - ease2);

        if (choice === 'right') {
          // Right branch lane line: smoothly converges from +1.10 to +1/3 (the right lane divider of normal road!)
          const rightLine1 = x1 + (branchStart1 * (1 - ease1) + (1 / 3) * ease1) * w1;
          const rightLine2 = x2 + (branchStart2 * (1 - ease2) + (1 / 3) * ease2) * w2;
          ctx.fillStyle = ease1 < 0.85 ? '#ffd319' : laneColor;
          polygon(ctx, rightLine1 - convHalf1, y1, rightLine1 + convHalf1, y1, rightLine2 + convHalf2, y2, rightLine2 - convHalf2, y2);

          // Left highway divider (-1/3) smoothly emerges as road widens past the median
          const leftLine1 = x1 - (1 / 3) * w1;
          const leftLine2 = x2 - (1 / 3) * w2;
          if (leftLine1 > cLeft1 + baseHalf1 * 2) {
            const alpha = Math.min(1, (leftLine1 - cLeft1) / (w1 * 0.25));
            const prevAlpha = ctx.globalAlpha;
            ctx.globalAlpha = prevAlpha * alpha;
            ctx.fillStyle = laneColor;
            polygon(ctx, leftLine1 - baseHalf1, y1, leftLine1 + baseHalf1, y1, leftLine2 + baseHalf2, y2, leftLine2 - baseHalf2, y2);
            ctx.globalAlpha = prevAlpha;
          }
        } else {
          // Left branch lane line: smoothly converges from -1.10 to -1/3 (the left lane divider of normal road!)
          const leftLine1 = x1 - (branchStart1 * (1 - ease1) + (1 / 3) * ease1) * w1;
          const leftLine2 = x2 - (branchStart2 * (1 - ease2) + (1 / 3) * ease2) * w2;
          ctx.fillStyle = ease1 < 0.85 ? '#05d9e8' : laneColor;
          polygon(ctx, leftLine1 - convHalf1, y1, leftLine1 + convHalf1, y1, leftLine2 + convHalf2, y2, leftLine2 - convHalf2, y2);

          // Right highway divider (+1/3) smoothly emerges as road widens past the median
          const rightLine1 = x1 + (1 / 3) * w1;
          const rightLine2 = x2 + (1 / 3) * w2;
          if (rightLine1 < cRight1 - baseHalf1 * 2) {
            const alpha = Math.min(1, (cRight1 - rightLine1) / (w1 * 0.25));
            const prevAlpha = ctx.globalAlpha;
            ctx.globalAlpha = prevAlpha * alpha;
            ctx.fillStyle = laneColor;
            polygon(ctx, rightLine1 - baseHalf1, y1, rightLine1 + baseHalf1, y1, rightLine2 + baseHalf2, y2, rightLine2 - baseHalf2, y2);
            ctx.globalAlpha = prevAlpha;
          }
        }
      }

      // Unchosen branch curves outward and fades away into distance
      const u2Unchosen = (t2 - FORK_SPLIT_END_T) / FORK_CONVERGE_SPAN_T;
      const unchosenAlpha = Math.max(0, 1 - u2Unchosen * 1.4);
      if (unchosenAlpha > 0.02) {
        const prevAlpha = ctx.globalAlpha;
        ctx.globalAlpha = prevAlpha * unchosenAlpha;
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

        ctx.fillStyle = rumbleColor;
        polygon(ctx, uLeft1 - r1, y1, uLeft1, y1, uLeft2, y2, uLeft2 - r2, y2);
        polygon(ctx, uRight1, y1, uRight1 + r1, y1, uRight2 + r2, y2, uRight2, y2);

        ctx.fillStyle = roadColor;
        polygon(ctx, uLeft1, y1, uRight1, y1, uRight2, y2, uLeft2, y2);
        ctx.globalAlpha = prevAlpha;
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

  private renderViaductParapets(
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
  ): void {
    const stripe = seg.stripe;
    const parH1 = Math.max(2, Math.round(w1 * 0.22));
    const parH2 = Math.max(1, Math.round(w2 * 0.22));

    // Shuto C1 elevated expressway concrete sound-barrier walls (Left & Right batched in 1 path)
    ctx.fillStyle = stripe === 0 ? '#2c2740' : '#211c32';
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

    // Neon accent guide rail & amber reflectors (closer segments)
    if (w1 >= 24 && stripe === 0) {
      const leftWallX = Math.round(x1 - w1 - r1);
      const rightWallX = Math.round(x1 + w1 + r1);
      const railY = Math.round(y1 - parH1);
      const railW = Math.max(2, Math.round(r1 * 0.3));

      ctx.fillStyle = palette.mountainRim;
      ctx.fillRect(leftWallX, railY, railW, 1);
      ctx.fillRect(rightWallX - railW, railY, railW, 1);

      ctx.fillStyle = seg.index % 4 === 0 ? '#ffaa00' : palette.rumble[1];
      const reflSize = Math.max(1, Math.round(parH1 * 0.28));
      ctx.fillRect(leftWallX + 1, Math.round(y1 - parH1 * 0.58), reflSize, reflSize);
      ctx.fillRect(rightWallX - reflSize - 1, Math.round(y1 - parH1 * 0.58), reflSize, reflSize);
    }

    // Concrete viaduct expansion joint every 8 segments
    if (stripe === 0 && seg.index % 8 === 0 && w1 >= 22) {
      ctx.fillStyle = '#474063';
      polygon(ctx, x1 - w1, y1, x1 + w1, y1, x2 + w2, y2, x2 - w2, y2);
    }
  }

  private renderTunnelSegment(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    seg: RoadSegment,
    palette: StagePalette,
    grassColor: string,
    roadColor: string,
    rumbleColor: string,
    laneColor: string,
    x1: number,
    y1: number,
    w1: number,
    r1: number,
    x2: number,
    y2: number,
    w2: number,
    r2: number,
    beatPulse: number,
    isCameraInTunnel: boolean,
    isTunnelEntry: boolean,
    isTunnelExit: boolean,
    segClipY = Number.POSITIVE_INFINITY,
    drawRoadFloor = true,
    isCoalesced = false,
  ): void {
    const stripe = seg.stripe;
    // Beat-stable tunnel walls (anchored strictly to road width, independent of beatPulse)
    const wallL1 = x1 - w1 * 1.24;
    const wallR1 = x1 + w1 * 1.24;
    const wallL2 = x2 - w2 * 1.24;
    const wallR2 = x2 + w2 * 1.24;

    const tunnelH1 = Math.max(4, w1 * 1.16);
    const tunnelH2 = Math.max(3, w2 * 1.16);
    const wallBot1 = Math.min(y1, segClipY);
    const wallBot2 = Math.min(y2, segClipY);
    const rawCeilY1 = y1 - tunnelH1;
    const rawCeilY2 = y2 - tunnelH2;
    const rawDadoY1 = y1 - tunnelH1 * 0.3;
    const rawDadoY2 = y2 - tunnelH2 * 0.3;
    const rawHaunchY1 = y1 - tunnelH1 * 0.76;
    const rawHaunchY2 = y2 - tunnelH2 * 0.76;
    const ceilY1 = Math.min(rawCeilY1, wallBot1);
    const ceilY2 = Math.min(rawCeilY2, wallBot2);
    const dadoY1 = Math.min(rawDadoY1, wallBot1);
    const dadoY2 = Math.min(rawDadoY2, wallBot2);
    const haunchY1 = Math.min(rawHaunchY1, wallBot1);
    const haunchY2 = Math.min(rawHaunchY2, wallBot2);
    const crownL1 = wallL1 + w1 * 0.24;
    const crownR1 = wallR1 - w1 * 0.24;
    const crownL2 = wallL2 + w2 * 0.24;
    const crownR2 = wallR2 - w2 * 0.24;

    if (
      isCameraInTunnel &&
      !isTunnelExit &&
      this.tunnelMaskEmitted &&
      wallL2 + w2 * 0.06 <= 0 &&
      wallR2 - w2 * 0.06 >= width &&
      haunchY2 + w2 * 0.06 <= 0 &&
      wallBot2 >= height &&
      wallL1 + w1 * 0.06 <= 0 &&
      wallR1 - w1 * 0.06 >= width &&
      haunchY1 + w1 * 0.06 <= 0 &&
      wallBot1 >= height
    ) {
      this.boreMinX = 0;
      this.boreMaxX = width;
      this.boreMinY = 0;
      this.boreMaxY = height;
      this.boreBoundsInit = true;
      return;
    }

    const outerPad1 = Math.max(2, w1 * 0.26);
    const outerPad2 = Math.max(1, w2 * 0.26);
    const outerL1 = wallL1 - outerPad1;
    const outerR1 = wallR1 + outerPad1;
    const outerL2 = wallL2 - outerPad2;
    const outerR2 = wallR2 + outerPad2;
    const outerCeilY1 = Math.min(rawCeilY1 - outerPad1 * 0.85, wallBot1);
    const outerCeilY2 = Math.min(rawCeilY2 - outerPad2 * 0.85, wallBot2);

    // Clip near floor edge along p2 -> p1 to segClipY without distorting upper 3D wall/ceiling geometry
    const topFloorY = y2 + 1;
    const hasFloorClip = y1 > segClipY && topFloorY < segClipY && y1 - topFloorY > 0.0001;
    let roadX1 = x1;
    let roadW1 = w1;
    let roadR1 = r1;
    let roadY1 = Math.min(y1, segClipY);
    let roadWallL1 = wallL1;
    let roadWallR1 = wallR1;
    if (hasFloorClip) {
      const floorClipT = clamp01((segClipY - topFloorY) / (y1 - topFloorY));
      roadX1 = x2 + (x1 - x2) * floorClipT;
      roadW1 = w2 + (w1 - w2) * floorClipT;
      roadR1 = r2 + (r1 - r2) * floorClipT;
      roadY1 = segClipY;
      roadWallL1 = roadX1 - roadW1 * 1.24;
      roadWallR1 = roadX1 + roadW1 * 1.24;
    }

    // 1. Exterior surround / approach terrain + zero-leak curve/crest occlusion (zero ctx.clip)
    if (isCameraInTunnel) {
      let darkFillSet = false;
      if (!this.tunnelMaskEmitted) {
        ctx.fillStyle = '#070510';
        darkFillSet = true;
        // Emit the full-viewport surround mask once per frame on the farthest visible slice of
        // the current tunnel so outdoor sky/horizon stay visible strictly through the octagonal exit mouth.
        const topH = Math.max(0, Math.min(height, ceilY2));
        if (topH > 0) {
          ctx.fillRect(0, 0, width, topH);
        }
        const botY = Math.max(topH, Math.min(height, wallBot2));
        const spanY = botY - topH;
        const leftW = Math.max(0, Math.min(width, wallL2));
        if (leftW > 0 && spanY > 0) {
          ctx.fillRect(0, topH, leftW, spanY);
        }
        const rightX = Math.max(0, Math.min(width, wallR2));
        if (rightX < width && spanY > 0) {
          ctx.fillRect(rightX, topH, width - rightX, spanY);
        }
        if (botY < height) {
          ctx.fillRect(0, botY, width, height - botY);
        }
        // Chamfered corner spandrels framing the octagonal exit mouth
        if (w2 >= 4) {
          ctx.beginPath();
          ctx.moveTo(wallL2, ceilY2);
          ctx.lineTo(crownL2, ceilY2);
          ctx.lineTo(wallL2, haunchY2);
          ctx.closePath();
          ctx.moveTo(crownR2, ceilY2);
          ctx.lineTo(wallR2, ceilY2);
          ctx.lineTo(wallR2, haunchY2);
          ctx.closePath();
          ctx.fill();
        }
        this.tunnelMaskEmitted = true;
      }

      const exitRimPad =
        isTunnelExit && w2 >= 6 && rawCeilY2 < wallBot2 ? Math.max(1, Math.round(w2 * 0.065)) : 0;
      const occludeL = Math.max(0, Math.min(width, Math.min(wallL1, wallL2 - exitRimPad)));
      const occludeR = Math.max(0, Math.min(width, Math.max(wallR1, wallR2 + exitRimPad)));
      const occludeTop = Math.max(0, Math.min(height, Math.min(ceilY1, ceilY2 - exitRimPad)));
      const occludeBot = Math.max(0, Math.min(height, Math.max(wallBot1, wallBot2)));

      if (!this.boreBoundsInit) {
        this.boreMinX = occludeL;
        this.boreMaxX = occludeR;
        this.boreMinY = occludeTop;
        this.boreMaxY = occludeBot;
        this.boreBoundsInit = true;
      } else {
        // Occlude farther curved/crest bore pixels that swing outside this nearer slice's rock walls
        let tightened = false;
        if (occludeL > this.boreMinX && this.boreMaxY > this.boreMinY) {
          const fillW = Math.min(this.boreMaxX, occludeL) - this.boreMinX;
          if (fillW > 0) {
            if (!darkFillSet) {
              ctx.fillStyle = '#070510';
              darkFillSet = true;
            }
            ctx.fillRect(
              this.boreMinX,
              this.boreMinY,
              fillW,
              this.boreMaxY - this.boreMinY,
            );
            tightened = true;
          }
          this.boreMinX = Math.min(this.boreMaxX, occludeL);
        }
        if (occludeR < this.boreMaxX && this.boreMaxY > this.boreMinY) {
          const startX = Math.max(this.boreMinX, occludeR);
          const fillW = this.boreMaxX - startX;
          if (fillW > 0) {
            if (!darkFillSet) {
              ctx.fillStyle = '#070510';
              darkFillSet = true;
            }
            ctx.fillRect(
              startX,
              this.boreMinY,
              fillW,
              this.boreMaxY - this.boreMinY,
            );
            tightened = true;
          }
          this.boreMaxX = Math.max(this.boreMinX, occludeR);
        }
        if (occludeTop > this.boreMinY && this.boreMaxX > this.boreMinX) {
          const fillH = Math.min(this.boreMaxY, occludeTop) - this.boreMinY;
          if (fillH > 0) {
            if (!darkFillSet) {
              ctx.fillStyle = '#070510';
              darkFillSet = true;
            }
            ctx.fillRect(
              this.boreMinX,
              this.boreMinY,
              this.boreMaxX - this.boreMinX,
              fillH,
            );
            tightened = true;
          }
          this.boreMinY = Math.min(this.boreMaxY, occludeTop);
        }
        if (occludeBot < this.boreMaxY && this.boreMaxX > this.boreMinX) {
          const startY = Math.max(this.boreMinY, occludeBot);
          const fillH = this.boreMaxY - startY;
          if (fillH > 0) {
            if (!darkFillSet) {
              ctx.fillStyle = '#070510';
              darkFillSet = true;
            }
            ctx.fillRect(
              this.boreMinX,
              startY,
              this.boreMaxX - this.boreMinX,
              fillH,
            );
            tightened = true;
          }
          this.boreMaxY = Math.max(this.boreMinY, occludeBot);
        }
        if (tightened && w1 >= 14) {
          if (!darkFillSet) {
            ctx.fillStyle = '#070510';
          }
          const spandrelTopY = Math.min(ceilY1, ceilY2);
          ctx.beginPath();
          ctx.moveTo(wallL2, spandrelTopY);
          ctx.lineTo(crownL2, spandrelTopY);
          ctx.lineTo(wallL2, haunchY2);
          ctx.closePath();
          ctx.moveTo(crownR2, spandrelTopY);
          ctx.lineTo(wallR2, spandrelTopY);
          ctx.lineTo(wallR2, haunchY2);
          ctx.closePath();
          ctx.fill();
        }
        if (occludeL < this.boreMinX) this.boreMinX = occludeL;
        if (occludeR > this.boreMaxX) this.boreMaxX = occludeR;
        if (occludeTop < this.boreMinY) this.boreMinY = occludeTop;
        if (occludeBot > this.boreMaxY) this.boreMaxY = occludeBot;
      }
    } else {
      // Approaching from outside: ground terrain below horizon + gapless concrete exterior shell
      if (drawRoadFloor && wallBot1 > wallBot2) {
        ctx.fillStyle = grassColor;
        ctx.fillRect(0, wallBot2, width, wallBot1 - wallBot2);
      }

      ctx.fillStyle = stripe === 0 ? '#1b162e' : '#151126';
      ctx.beginPath();
      // Left outer casing flank (reaches inner wall at p2 so curves never leak sky)
      ctx.moveTo(outerL1, wallBot1);
      ctx.lineTo(outerL1, outerCeilY1);
      ctx.lineTo(outerL2, outerCeilY2);
      ctx.lineTo(crownL2, ceilY2);
      ctx.lineTo(wallL2, haunchY2);
      ctx.lineTo(wallL2, wallBot2);
      if (hasFloorClip) ctx.lineTo(roadWallL1, wallBot1);
      ctx.closePath();
      // Right outer casing flank
      ctx.moveTo(outerR1, wallBot1);
      ctx.lineTo(outerR1, outerCeilY1);
      ctx.lineTo(outerR2, outerCeilY2);
      ctx.lineTo(crownR2, ceilY2);
      ctx.lineTo(wallR2, haunchY2);
      ctx.lineTo(wallR2, wallBot2);
      if (hasFloorClip) ctx.lineTo(roadWallR1, wallBot1);
      ctx.closePath();
      // Top outer roof slab
      ctx.moveTo(outerL1, outerCeilY1);
      ctx.lineTo(outerR1, outerCeilY1);
      ctx.lineTo(outerR2, outerCeilY2);
      ctx.lineTo(outerL2, outerCeilY2);
      ctx.closePath();
      ctx.fill();
    }

    // 2. Interior octagonal vaulted surfaces (LOD-tiered for 60 FPS)
    const isRibSeg = seg.index % 12 === 0;
    if (w1 < 68) {
      // Far LOD: 1 batched wall+haunch path + ceiling crown (slashes GPU path tessellations by ~75%)
      ctx.fillStyle = '#181429';
      ctx.beginPath();
      ctx.moveTo(wallL1, wallBot1);
      ctx.lineTo(wallL1, haunchY1);
      ctx.lineTo(crownL1, ceilY1);
      ctx.lineTo(crownL2, ceilY2);
      ctx.lineTo(wallL2, haunchY2);
      ctx.lineTo(wallL2, wallBot2);
      if (hasFloorClip) ctx.lineTo(roadWallL1, wallBot1);
      ctx.closePath();
      ctx.moveTo(wallR1, wallBot1);
      ctx.lineTo(wallR1, haunchY1);
      ctx.lineTo(crownR1, ceilY1);
      ctx.lineTo(crownR2, ceilY2);
      ctx.lineTo(wallR2, haunchY2);
      ctx.lineTo(wallR2, wallBot2);
      if (hasFloorClip) ctx.lineTo(roadWallR1, wallBot1);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = '#0d0a1a';
      polygon(ctx, crownL1, ceilY1, crownR1, ceilY1, crownR2, ceilY2, crownL2, ceilY2);
    } else {
      // Mid/Near LOD: subtle lower tiled dado + matte upper wall/haunch + recessed crown
      ctx.fillStyle = isRibSeg ? '#1f1a33' : stripe === 0 ? '#231e38' : '#1e1a30';
      ctx.beginPath();
      ctx.moveTo(wallL1, wallBot1);
      ctx.lineTo(wallL1, dadoY1);
      ctx.lineTo(wallL2, dadoY2);
      ctx.lineTo(wallL2, wallBot2);
      if (hasFloorClip) ctx.lineTo(roadWallL1, wallBot1);
      ctx.closePath();
      ctx.moveTo(wallR1, wallBot1);
      ctx.lineTo(wallR1, dadoY1);
      ctx.lineTo(wallR2, dadoY2);
      ctx.lineTo(wallR2, wallBot2);
      if (hasFloorClip) ctx.lineTo(roadWallR1, wallBot1);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = isRibSeg ? '#120e20' : stripe === 0 ? '#161226' : '#130f21';
      ctx.beginPath();
      ctx.moveTo(wallL1, dadoY1);
      ctx.lineTo(wallL1, haunchY1);
      ctx.lineTo(crownL1, ceilY1);
      ctx.lineTo(crownL2, ceilY2);
      ctx.lineTo(wallL2, haunchY2);
      ctx.lineTo(wallL2, dadoY2);
      ctx.closePath();
      ctx.moveTo(wallR1, dadoY1);
      ctx.lineTo(wallR1, haunchY1);
      ctx.lineTo(crownR1, ceilY1);
      ctx.lineTo(crownR2, ceilY2);
      ctx.lineTo(wallR2, haunchY2);
      ctx.lineTo(wallR2, dadoY2);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = isRibSeg ? '#090713' : stripe === 0 ? '#0c0918' : '#090714';
      polygon(ctx, crownL1, ceilY1, crownR1, ceilY1, crownR2, ceilY2, crownL2, ceilY2);

      // Safety dado handrail & flush wall-mounted cat's-eye reflectors (clear of rumble curbs and crests)
      if (stripe === 0 && (rawDadoY1 < wallBot1 || rawDadoY2 < wallBot2)) {
        const railH1 = Math.max(1, w1 * 0.024);
        const railH2 = Math.max(1, w2 * 0.024);
        const railTop1 = rawDadoY1 < wallBot1 ? dadoY1 - railH1 : wallBot1;
        const railTop2 = rawDadoY2 < wallBot2 ? dadoY2 - railH2 : wallBot2;
        ctx.fillStyle = '#383058';
        ctx.beginPath();
        ctx.moveTo(wallL1, dadoY1);
        ctx.lineTo(wallL1, railTop1);
        ctx.lineTo(wallL2, railTop2);
        ctx.lineTo(wallL2, dadoY2);
        ctx.closePath();
        ctx.moveTo(wallR1, dadoY1);
        ctx.lineTo(wallR1, railTop1);
        ctx.lineTo(wallR2, railTop2);
        ctx.lineTo(wallR2, dadoY2);
        ctx.closePath();
        ctx.fill();

        const reflW = Math.max(2, Math.round(w1 * 0.032));
        const reflH = Math.max(1, Math.round(w1 * 0.026));
        if (rawDadoY1 < wallBot1 && rawDadoY2 < wallBot2 && wallBot1 - dadoY1 >= reflH) {
          const reflY = Math.round((dadoY1 + wallBot1 + dadoY2 + wallBot2) * 0.25 - reflH * 0.5);
          if (reflY + reflH <= segClipY) {
            const midWallL = (wallL1 + wallL2) * 0.5;
            const midWallR = (wallR1 + wallR2) * 0.5;
            ctx.fillStyle = '#ffaa00';
            ctx.fillRect(Math.round(midWallL + 1), reflY, reflW, reflH);
            ctx.fillRect(Math.round(midWallR - reflW - 1), reflY, reflW, reflH);
          }
        }
      }
    }

    // 3. Flush wall-mounted curve chevron panels on outer tunnel walls (zero freestanding poles)
    if (Math.abs(seg.curve) >= 2.2 && seg.index % 8 === 0 && w1 >= 30) {
      const isRightTurn = seg.curve > 0;
      const wNearX = isRightTurn ? wallL1 : wallR1;
      const wFarX = isRightTurn ? wallL2 : wallR2;
      const topNearY = Math.min(y1 - tunnelH1 * 0.68, wallBot1);
      const botNearY = Math.min(y1 - tunnelH1 * 0.36, wallBot1);
      const topFarY = Math.min(y2 - tunnelH2 * 0.68, wallBot2);
      const botFarY = Math.min(y2 - tunnelH2 * 0.36, wallBot2);

      const qx0 = wNearX + (wFarX - wNearX) * 0.15;
      const qx1 = wNearX + (wFarX - wNearX) * 0.85;
      const qt0 = topNearY + (topFarY - topNearY) * 0.15;
      const qb0 = botNearY + (botFarY - botNearY) * 0.15;
      const qt1 = topNearY + (topFarY - topNearY) * 0.85;
      const qb1 = botNearY + (botFarY - botNearY) * 0.85;

      if (Math.abs(qx1 - qx0) >= 4 && qb0 - qt0 >= 7 && qb1 - qt1 >= 2) {
        ctx.fillStyle = '#0b0816';
        polygon(ctx, qx0, qt0, qx1, qt1, qx1, qb1, qx0, qb0);

        const dxQ = qx1 - qx0;
        const dtQ = qt1 - qt0;
        const dbQ = qb1 - qb0;
        const xA = qx0 + dxQ * 0.22;
        const xB = qx0 + dxQ * 0.48;
        const xC = qx0 + dxQ * 0.82;
        const xD = qx0 + dxQ * 0.56;
        const tA = qt0 + dtQ * 0.22;
        const bA = qb0 + dbQ * 0.22;
        const tB = qt0 + dtQ * 0.48;
        const bB = qb0 + dbQ * 0.48;
        const tC = qt0 + dtQ * 0.82;
        const bC = qb0 + dbQ * 0.82;
        const tD = qt0 + dtQ * 0.56;
        const bD = qb0 + dbQ * 0.56;

        ctx.fillStyle = '#00f5d4';
        ctx.beginPath();
        ctx.moveTo(xA, tA + (bA - tA) * 0.18);
        ctx.lineTo(xB, tB + (bB - tB) * 0.18);
        ctx.lineTo(xC, (tC + bC) * 0.5);
        ctx.lineTo(xB, tB + (bB - tB) * 0.82);
        ctx.lineTo(xA, tA + (bA - tA) * 0.82);
        ctx.lineTo(xD, (tD + bD) * 0.5);
        ctx.closePath();
        ctx.fill();
      }
    }

    // 4. Mitered 3D perspective concrete arch ribs (flush with chamfered bore, zero overlap on curbs)
    if (isRibSeg && w1 >= 32) {
      const rib = Math.max(2, w1 * 0.055);
      const inWallL1 = wallL1 + rib;
      const inWallR1 = wallR1 - rib;
      const inCeilY1 = Math.min(rawCeilY1 + rib * 0.85, wallBot1);
      const inHaunchY1 = Math.min(rawHaunchY1 + rib * 0.35, wallBot1);
      const inCrownL1 = crownL1 + rib * 0.45;
      const inCrownR1 = crownR1 - rib * 0.45;

      ctx.fillStyle = '#2e274b';
      ctx.beginPath();
      ctx.moveTo(wallL1, wallBot1);
      ctx.lineTo(wallL1, haunchY1);
      ctx.lineTo(crownL1, ceilY1);
      ctx.lineTo(crownR1, ceilY1);
      ctx.lineTo(wallR1, haunchY1);
      ctx.lineTo(wallR1, wallBot1);
      ctx.lineTo(inWallR1, wallBot1);
      ctx.lineTo(inWallR1, inHaunchY1);
      ctx.lineTo(inCrownR1, inCeilY1);
      ctx.lineTo(inCrownL1, inCeilY1);
      ctx.lineTo(inWallL1, inHaunchY1);
      ctx.lineTo(inWallL1, wallBot1);
      ctx.closePath();
      ctx.fill();
    }

    // 5. Roadway surface & concrete shoulder gutter inside bore (floor-clipped cleanly at segClipY)
    if (drawRoadFloor && roadY1 > y2) {
      const tunR1 = Math.min(roadR1, roadW1 * 0.21);
      const tunR2 = Math.min(r2, w2 * 0.21);
      const sliceH = roadY1 - y2;
      const rawDy = seg.p1.screenY - seg.p2.screenY;
      const useFastTunnelRoad =
        roadW1 < 68 &&
        Math.abs(roadW1 - w2) <= 6.5 &&
        Math.abs(roadX1 - x2) <= 4.5 &&
        (isCoalesced || rawDy <= 2.4);

      if (useFastTunnelRoad) {
        const mx = (roadX1 + x2) * 0.5;
        const mw = (roadW1 + w2) * 0.5;
        const mr = (tunR1 + tunR2) * 0.5;
        const roadLeft = Math.round(mx - mw);
        const roadRight = Math.round(mx + mw);
        const roadSpan = Math.max(1, roadRight - roadLeft);
        const curbW = Math.max(1, Math.round(mr));

        ctx.fillStyle = isCoalesced ? this.cachedHorizonCurbColor : rumbleColor;
        ctx.fillRect(roadLeft - curbW, y2, curbW, sliceH);
        ctx.fillRect(roadRight, y2, curbW, sliceH);

        ctx.fillStyle = isCoalesced ? this.cachedHorizonRoadColor : roadColor;
        ctx.fillRect(roadLeft, y2, roadSpan, sliceH);

        if (!isCoalesced && stripe === 0 && roadW1 >= 24) {
          ctx.fillStyle = laneColor;
          const lw = Math.max(1, mw / Math.max(32, 8 * LANES));
          const laneStep = roadSpan / LANES;
          let lx = roadLeft + laneStep;
          for (let lane = 1; lane < LANES; lane++) {
            ctx.fillRect(lx - lw * 0.5, y2, lw, sliceH);
            lx += laneStep;
          }
        }
      } else {
        if (roadW1 >= 68) {
          const gutterL1 = roadX1 - roadW1 - tunR1;
          const gutterR1 = roadX1 + roadW1 + tunR1;
          const gutterL2 = x2 - w2 - tunR2;
          const gutterR2 = x2 + w2 + tunR2;
          if (gutterL1 > roadWallL1 + 0.5 || roadWallR1 > gutterR1 + 0.5) {
            ctx.fillStyle = '#1b162e';
            ctx.beginPath();
            ctx.moveTo(roadWallL1, roadY1);
            ctx.lineTo(gutterL1, roadY1);
            ctx.lineTo(gutterL2, y2);
            ctx.lineTo(wallL2, y2);
            ctx.closePath();
            ctx.moveTo(gutterR1, roadY1);
            ctx.lineTo(roadWallR1, roadY1);
            ctx.lineTo(wallR2, y2);
            ctx.lineTo(gutterR2, y2);
            ctx.closePath();
            ctx.fill();
          }
        }

        ctx.fillStyle = rumbleColor;
        drawRumblePair(ctx, roadX1, roadY1, x2, y2, roadW1, w2, tunR1, tunR2);

        ctx.fillStyle = roadColor;
        polygon(
          ctx,
          roadX1 - roadW1,
          roadY1,
          roadX1 + roadW1,
          roadY1,
          x2 + w2,
          y2,
          x2 - w2,
          y2,
        );

        if (stripe === 0 && roadW1 >= 24) {
          ctx.fillStyle = laneColor;
          drawLanes(ctx, roadX1, roadY1, x2, y2, roadW1, w2);
        }
      }
    }

    // 6. Perspective ceiling light fixtures along crown
    const hasCeilingLight = seg.tunnelLight !== undefined ? seg.tunnelLight : seg.index % 16 === 0;
    if (hasCeilingLight && w1 >= 6 && (rawCeilY1 < wallBot1 || rawCeilY2 < wallBot2)) {
      const lightScale = 0.32 + beatPulse * 0.04;
      if (w1 < 18) {
        const glowW = Math.max(3, (w1 + w2) * lightScale);
        const barH = Math.max(1, Math.min(3, Math.abs(ceilY2 - ceilY1) * 0.55));
        const midCeilX = (x1 + x2) * 0.5;
        const midCeilY = Math.min(ceilY1, ceilY2) + Math.abs(ceilY2 - ceilY1) * 0.2;
        if (midCeilY + barH <= segClipY) {
          ctx.fillStyle = palette.horizonGlow ?? '#fff3cc';
          ctx.fillRect(
            Math.round(midCeilX - glowW * 0.5),
            Math.round(midCeilY),
            Math.round(glowW),
            Math.round(barH),
          );
        }
      } else {
        const halfW1 = w1 * lightScale;
        const halfW2 = w2 * lightScale;
        const ceilSpanY = ceilY2 - ceilY1;
        const absCeilSpan = Math.abs(ceilSpanY);
        const t0 = 0.22;
        const t1 =
          absCeilSpan > 1.5
            ? Math.min(0.68, t0 + Math.max(1.5, Math.min(6, absCeilSpan * 0.45)) / absCeilSpan)
            : 0.68;
        const cyA = Math.min(wallBot1, ceilY1 + ceilSpanY * t0);
        const cyB = Math.min(
          wallBot2,
          absCeilSpan > 1.5
            ? ceilY1 + ceilSpanY * t1
            : cyA + (ceilSpanY >= 0 ? 1 : -1) * Math.max(1.5, Math.min(3, w1 * 0.02)),
        );
        const cxA = x1 + (x2 - x1) * t0;
        const cxB = x1 + (x2 - x1) * t1;
        const hwA = halfW1 + (halfW2 - halfW1) * t0;
        const hwB = halfW1 + (halfW2 - halfW1) * t1;

        if (cyA <= segClipY && cyB <= segClipY) {
          ctx.fillStyle = palette.horizonGlow ?? '#fff3cc';
          polygon(ctx, cxA - hwA, cyA, cxA + hwA, cyA, cxB + hwB, cyB, cxB - hwB, cyB);

          if (w1 >= 20) {
            const tMid = (t0 + t1) * 0.5;
            const tHalf = (t1 - t0) * 0.34;
            const tCoreA = tMid - tHalf;
            const tCoreB = tMid + tHalf;
            const coreA = (halfW1 + (halfW2 - halfW1) * tCoreA) * 0.68;
            const coreB = (halfW1 + (halfW2 - halfW1) * tCoreB) * 0.68;
            const cyCoreA = Math.min(
              wallBot1,
              absCeilSpan > 1.5 ? ceilY1 + ceilSpanY * tCoreA : cyA + (cyB - cyA) * 0.16,
            );
            const cyCoreB = Math.min(
              wallBot2,
              absCeilSpan > 1.5 ? ceilY1 + ceilSpanY * tCoreB : cyA + (cyB - cyA) * 0.84,
            );
            const cxCoreA = x1 + (x2 - x1) * tCoreA;
            const cxCoreB = x1 + (x2 - x1) * tCoreB;
            ctx.fillStyle = '#ffffff';
            polygon(
              ctx,
              cxCoreA - coreA,
              cyCoreA,
              cxCoreA + coreA,
              cyCoreA,
              cxCoreB + coreB,
              cyCoreB,
              cxCoreB - coreB,
              cyCoreB,
            );
          }
        }
      }
    }

    // 7. Monumental Entrance Portal & Chamfered Exit Rim
    if (
      isTunnelEntry &&
      !isCameraInTunnel &&
      w1 >= 8 &&
      rawCeilY1 - outerPad1 * 0.85 < wallBot1
    ) {
      const portalTop = outerCeilY1;
      const portalBot = wallBot1;
      const lintelH = Math.max(2, ceilY1 - outerCeilY1);

      // Sloped concrete wing-walls grounding entrance into roadside terrain
      if (w1 >= 14 && rawDadoY1 < wallBot1) {
        const wingPad = outerPad1 * 0.9;
        ctx.fillStyle = '#1f1a36';
        ctx.beginPath();
        ctx.moveTo(outerL1 - wingPad, portalBot);
        ctx.lineTo(outerL1, dadoY1);
        ctx.lineTo(outerL1, portalBot);
        ctx.closePath();
        ctx.moveTo(outerR1 + wingPad, portalBot);
        ctx.lineTo(outerR1, dadoY1);
        ctx.lineTo(outerR1, portalBot);
        ctx.closePath();
        ctx.fill();
      }

      // Chamfered concrete portal fascia around octagonal bore
      ctx.fillStyle = '#2d2645';
      ctx.beginPath();
      ctx.moveTo(outerL1, portalBot);
      ctx.lineTo(outerL1, portalTop);
      ctx.lineTo(outerR1, portalTop);
      ctx.lineTo(outerR1, portalBot);
      ctx.lineTo(wallR1, portalBot);
      ctx.lineTo(wallR1, haunchY1);
      ctx.lineTo(crownR1, ceilY1);
      ctx.lineTo(crownL1, ceilY1);
      ctx.lineTo(wallL1, haunchY1);
      ctx.lineTo(wallL1, portalBot);
      ctx.closePath();
      ctx.fill();

      // Hazard warning stripe & illuminated green lane status beacons above bore
      if (w1 >= 18 && rawCeilY1 < wallBot1) {
        const stripeH = Math.max(1, Math.round(lintelH * 0.16));
        const stripeY = Math.round(ceilY1 - Math.max(2, lintelH * 0.25));
        if (stripeY + stripeH <= wallBot1) {
          ctx.fillStyle = '#ffd166';
          ctx.fillRect(
            Math.round(crownL1),
            stripeY,
            Math.round(crownR1 - crownL1),
            stripeH,
          );
        }

        const beaconSize = Math.max(2, Math.round(lintelH * 0.26));
        const beaconY = Math.round(portalTop + lintelH * 0.32);
        if (beaconY + beaconSize <= wallBot1) {
          ctx.fillStyle = '#00f5d4';
          ctx.fillRect(Math.round(x1 - w1 * 0.45 - beaconSize * 0.5), beaconY, beaconSize, beaconSize);
          ctx.fillRect(Math.round(x1 + w1 * 0.45 - beaconSize * 0.5), beaconY, beaconSize, beaconSize);
        }
      }
    }

    if (isTunnelExit && w2 >= 6 && rawCeilY2 < wallBot2) {
      // Bright backlit chamfered portal arch rim framing the sky opening at the end of the tunnel
      const rimThick = Math.max(1, Math.round(w2 * 0.065));
      ctx.fillStyle = palette.horizonGlow ?? palette.skyHorizon;
      ctx.beginPath();
      ctx.moveTo(wallL2 - rimThick, wallBot2);
      ctx.lineTo(wallL2 - rimThick, haunchY2 - rimThick * 0.4);
      ctx.lineTo(crownL2 - rimThick * 0.5, ceilY2 - rimThick);
      ctx.lineTo(crownR2 + rimThick * 0.5, ceilY2 - rimThick);
      ctx.lineTo(wallR2 + rimThick, haunchY2 - rimThick * 0.4);
      ctx.lineTo(wallR2 + rimThick, wallBot2);
      ctx.lineTo(wallR2, wallBot2);
      ctx.lineTo(wallR2, haunchY2);
      ctx.lineTo(crownR2, ceilY2);
      ctx.lineTo(crownL2, ceilY2);
      ctx.lineTo(wallL2, haunchY2);
      ctx.lineTo(wallL2, wallBot2);
      ctx.closePath();
      ctx.fill();
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
