import { tuning } from '@src/config/tuning';
import { describe, expect, it } from 'vitest';
import {
  lerpHexColor,
  PALETTE_AKIBA_NIGHT,
  PALETTE_NIGHT_FUNK,
  PALETTE_OG_FUTURE_FUNK,
  PALETTE_VAPORFUNK,
} from './palette';
import { RoadRenderer, type RoadView } from './RoadRenderer';
import { createPoint, type RoadSegment, type SegmentEnvironment, type Track } from './RoadSegment';

function createMockCanvas(): {
  ctx: CanvasRenderingContext2D;
  rectCalls: number;
  fillCalls: number;
  fills: string[];
  alphaHistory: number[];
} {
  let rectCalls = 0;
  let fillCalls = 0;
  let currentAlpha = 1;
  const fills: string[] = [];
  const alphaHistory: number[] = [];
  const noop = () => {};

  const ctx = {
    canvas: { width: 640, height: 360 },
    fillStyle: '#000',
    strokeStyle: '#000',
    lineWidth: 1,
    get globalAlpha() {
      return currentAlpha;
    },
    set globalAlpha(v: number) {
      currentAlpha = v;
      alphaHistory.push(v);
    },
    save: noop,
    restore: noop,
    beginPath: noop,
    closePath: noop,
    moveTo: noop,
    lineTo: noop,
    quadraticCurveTo: noop,
    arc: noop,
    fill: () => {
      fillCalls++;
      fills.push(ctx.fillStyle as string);
    },
    stroke: noop,
    fillRect: () => {
      rectCalls++;
      fills.push(ctx.fillStyle as string);
    },
    createLinearGradient: () => ({ addColorStop: noop }),
  } as unknown as CanvasRenderingContext2D;

  return {
    ctx,
    get rectCalls() {
      return rectCalls;
    },
    get fillCalls() {
      return fillCalls;
    },
    get fills() {
      return fills;
    },
    get alphaHistory() {
      return alphaHistory;
    },
  };
}

describe('RoadRenderer — Rendering Environments', () => {
  function createTestTrack(env: SegmentEnvironment = 'standard'): Track {
    const segments: RoadSegment[] = [];
    const segmentLength = 200;
    const n = 50;

    for (let i = 0; i < n; i++) {
      segments.push({
        index: i,
        p1: createPoint(0, i * segmentLength),
        p2: createPoint(0, (i + 1) * segmentLength),
        curve: 0,
        stripe: i % 2 === 0 ? 0 : 1,
        sprites: [],
        fog: 1,
        env,
      });
    }

    return {
      segments,
      segmentLength,
      length: n * segmentLength,
    };
  }

  const defaultView: RoadView = {
    position: 0,
    playerX: 0,
    cameraHeight: 1000,
    cameraDepth: 0.8,
    roadWidth: 2000,
    drawDistance: 30,
    fogDensity: 1,
    width: 640,
    height: 360,
  };

  it('renders standard road segments with grass ground fill and rumble strips', () => {
    const renderer = new RoadRenderer();
    const mock = createMockCanvas();
    const track = createTestTrack('standard');

    renderer.render(mock.ctx, track, defaultView, PALETTE_NIGHT_FUNK);

    expect(renderer.stats.drawnSegments).toBeGreaterThan(0);
    expect(mock.fills).toContain(PALETTE_NIGHT_FUNK.grass[0]);
    expect(mock.fills).toContain(PALETTE_NIGHT_FUNK.road[0]);
  });

  it('renders bridge segments with palette-harmonized bay water fill, 3D steel parapets, and expansion joints', () => {
    const renderer = new RoadRenderer();
    const mock = createMockCanvas();
    const track = createTestTrack('bridge');

    renderer.render(mock.ctx, track, defaultView, PALETTE_NIGHT_FUNK);

    expect(renderer.stats.drawnSegments).toBeGreaterThan(0);
    // Palette-harmonized water ground fill instead of grass or hardcoded pitch black
    expect(mock.fills).toContain(PALETTE_NIGHT_FUNK.water![0]);
    expect(mock.fills).not.toContain('#040714');
    expect(mock.fills).not.toContain('#060b1e');
    // Steel parapet & top chrome rail
    expect(mock.fills).toContain('#484160');
    expect(mock.fills).toContain('#9e95be');
    // Expansion joint
    expect(mock.fills).toContain('#5c5478');
  });

  it('uses distinct palette water colors for Sunset Boulevard and Akiba Night bridges without black bands', () => {
    const renderer = new RoadRenderer();
    const track = createTestTrack('bridge');

    for (const palette of [PALETTE_OG_FUTURE_FUNK, PALETTE_AKIBA_NIGHT]) {
      const mock = createMockCanvas();
      renderer.render(mock.ctx, track, defaultView, palette);
      expect(mock.fills).toContain(palette.water![0]);
      expect(mock.fills).not.toContain('#040714');
      expect(mock.fills).not.toContain('#060b1e');
    }
  });

  it('renders distant roadside props with a smooth alpha fade-in to eliminate horizon pop-in', () => {
    const renderer = new RoadRenderer();
    const mock = createMockCanvas();
    const track = createTestTrack('standard');
    // Extend track to 300 segments for distant LOD testing
    for (let i = 50; i < 300; i++) {
      track.segments.push({
        index: i,
        p1: createPoint(0, i * track.segmentLength),
        p2: createPoint(0, (i + 1) * track.segmentLength),
        curve: 0,
        stripe: i % 2 === 0 ? 0 : 1,
        sprites: [],
        fog: 1,
        env: 'standard',
      });
    }
    track.length = 300 * track.segmentLength;

    // Add a palm tree at segment 250 (in the distant fade-in zone 0.001..0.006 ppu)
    track.segments[250]!.sprites.push({ kind: 'palm', offset: 1.8, variant: 0 });

    const distantView: RoadView = {
      ...defaultView,
      drawDistance: 300,
    };

    renderer.render(mock.ctx, track, distantView, PALETTE_NIGHT_FUNK);

    expect(renderer.stats.drawnProps).toBe(1);
    // Verified that globalAlpha was set < 1 during render and restored to 1 afterwards
    expect(mock.alphaHistory.length).toBeGreaterThanOrEqual(2);
    const fadeAlpha = mock.alphaHistory[0]!;
    expect(fadeAlpha).toBeGreaterThan(0);
    expect(fadeAlpha).toBeLessThan(1);
    expect(mock.alphaHistory[mock.alphaHistory.length - 1]).toBe(1);
  });

  it('renders scaled depth-band props and respects horizontal culling', () => {
    const renderer = new RoadRenderer();
    const mock = createMockCanvas();
    const track = createTestTrack('standard');

    // Segment 10 has a Band C building with scale 1.5 within view
    track.segments[10]!.sprites.push({
      kind: 'building',
      offset: 3.5,
      variant: 0,
      scale: 1.5,
    });

    // Segment 10 also has a prop far outside horizontal cull bounds (offset 50)
    track.segments[10]!.sprites.push({
      kind: 'lamp',
      offset: 50.0,
      variant: 0,
    });

    renderer.render(mock.ctx, track, defaultView, PALETTE_NIGHT_FUNK);

    // Only the visible building should be drawn, the lamp at offset 50 is culled
    expect(renderer.stats.drawnProps).toBe(1);
  });

  it('clips off-screen bottom segments proportionally in X and W so lane lines stay straight', () => {
    const renderer = new RoadRenderer();
    const track = createTestTrack('standard');
    for (let i = 0; i < 12; i++) {
      track.segments[i]!.stripe = 0;
    }

    const polygons: Array<{ fillStyle: string; pts: Array<[number, number]> }> = [];
    let currentPts: Array<[number, number]> = [];
    const noop = () => {};
    const ctx = {
      canvas: { width: 640, height: 360 },
      fillStyle: '#000',
      strokeStyle: '#000',
      lineWidth: 1,
      globalAlpha: 1,
      save: noop,
      restore: noop,
      beginPath: () => {
        currentPts = [];
      },
      closePath: noop,
      moveTo: (x: number, y: number) => {
        currentPts.push([x, y]);
      },
      lineTo: (x: number, y: number) => {
        currentPts.push([x, y]);
      },
      quadraticCurveTo: noop,
      arc: noop,
      fill: () => {
        if (currentPts.length > 0) {
          polygons.push({ fillStyle: ctx.fillStyle as string, pts: currentPts });
        }
      },
      stroke: noop,
      fillRect: noop,
      createLinearGradient: () => ({ addColorStop: noop }),
    } as unknown as CanvasRenderingContext2D;

    // Position = 100 gives basePercent = 0.5, so the bottom-most visible segment straddles y = 360
    const view: RoadView = {
      ...defaultView,
      position: 100,
    };

    renderer.render(ctx, track, view, PALETTE_NIGHT_FUNK);

    const lanePolys = polygons.filter((p) => p.fillStyle === PALETTE_NIGHT_FUNK.lane);
    const bottomLanePoly = lanePolys[lanePolys.length - 1]!;
    const [bl, br] = [bottomLanePoly.pts[0]!, bottomLanePoly.pts[1]!];
    expect(bl[1]).toBe(360);
    const leftDividerCenterAtBottom = (bl[0] + br[0]) / 2;
    // True perspective at y=360: scale = (360 - 180) / (1000 * 180) = 0.001 -> screenW = 640 -> lx = 320 - 640/3
    expect(leftDividerCenterAtBottom).toBeCloseTo(320 - 640 / 3, 2);
  });

  it('renders nextTrack past track.length on right-fork lookahead and uses palette road colors for fork branches', () => {
    const renderer = new RoadRenderer();
    const mock = createMockCanvas();
    const trackA = createTestTrack('standard');
    const trackB = createTestTrack('standard');
    trackB.segments[0]!.curve = 1.5;

    const viewRight: RoadView = {
      ...defaultView,
      position: trackA.length - 400,
      drawDistance: 20,
      forkZoneStartZ: trackA.length - 1200,
      forkChoice: 'right',
      nextTrack: trackB,
    };

    renderer.render(mock.ctx, trackA, viewRight, PALETTE_NIGHT_FUNK);
    // nextTrack.segments[0] was projected ahead of trackA's finish line without negative cameraZ
    expect(trackB.segments[0]!.p1.cameraZ).toBeCloseTo(400, 3);
    // Fork branches use palette.road[stripe], never legacy hardcoded '#392858'/'#31214c'
    expect(mock.fills).not.toContain('#392858');
    expect(mock.fills).not.toContain('#31214c');
  });

  it('culls props fully hidden below hill crest without calling ctx.clip() and records subsystem timings', () => {
    const renderer = new RoadRenderer();
    const track = createTestTrack('standard');

    // Tall hill crest peaking at segments 4..5 (worldY=2200) and dropping steeply into a valley by segment 12
    for (let i = 0; i < track.segments.length; i++) {
      const seg = track.segments[i]!;
      const yOf = (idx: number) => {
        if (idx <= 5) return Math.sin((idx / 5) * Math.PI * 0.5) * 2200;
        if (idx <= 16) return 2200 - (idx - 5) * 700;
        return 2200 - 11 * 700;
      };
      seg.p1.worldY = yOf(i);
      seg.p2.worldY = yOf(i + 1);
    }

    // Place a short shrub deep inside the valley behind the crest so it stays strictly below segClipY
    track.segments[12]!.sprites.push({ kind: 'shrub', offset: 1.4, variant: 0 });

    let clipCalls = 0;
    const noop = () => {};
    const ctx = {
      canvas: { width: 640, height: 360 },
      fillStyle: '#000',
      strokeStyle: '#000',
      lineWidth: 1,
      globalAlpha: 1,
      save: noop,
      restore: noop,
      beginPath: noop,
      closePath: noop,
      moveTo: noop,
      lineTo: noop,
      quadraticCurveTo: noop,
      arc: noop,
      fill: noop,
      stroke: noop,
      fillRect: noop,
      clip: () => {
        clipCalls++;
      },
      createLinearGradient: () => ({ addColorStop: noop }),
    } as unknown as CanvasRenderingContext2D;

    renderer.render(ctx, track, defaultView, PALETTE_NIGHT_FUNK);

    expect(renderer.stats.drawnProps).toBe(0);
    expect(clipCalls).toBe(0);
    expect(renderer.stats.slicesMs).toBeGreaterThanOrEqual(0);
    expect(renderer.stats.propsMs).toBeGreaterThanOrEqual(0);
    expect(renderer.stats.trafficMs).toBeGreaterThanOrEqual(0);
  });

  it('skips redundant ctx.clip() stencil passes on non-bridge hills unless legacyRaster is enabled and counts pylon spans', () => {
    const renderer = new RoadRenderer();
    const track = createTestTrack('standard');

    // Create a gentle crest below horizon (crestTop seg 4 at worldY=300, seg 8 dips to 0)
    // and place a tall building behind crest + two linked pylons so both crest clip & wire span trigger
    for (let i = 0; i < track.segments.length; i++) {
      const seg = track.segments[i]!;
      const y = i <= 4 ? (i / 4) * 320 : i <= 8 ? 320 - (i - 4) * 160 : -320;
      const y2 = i + 1 <= 4 ? ((i + 1) / 4) * 320 : i + 1 <= 8 ? 320 - (i + 1 - 4) * 160 : -320;
      seg.p1.worldY = y;
      seg.p2.worldY = y2;
    }
    track.segments[8]!.sprites.push({ kind: 'building', offset: 2.0, variant: 0 });
    track.segments[6]!.sprites.push({ kind: 'pylon', offset: 3.2, variant: 0, chainId: 1 });
    track.segments[12]!.sprites.push({ kind: 'pylon', offset: 3.2, variant: 0, chainId: 1 });

    let clipCalls = 0;
    const noop = () => {};
    const ctx = {
      canvas: { width: 640, height: 360 },
      fillStyle: '#000',
      strokeStyle: '#000',
      lineWidth: 1,
      globalAlpha: 1,
      save: noop,
      restore: noop,
      beginPath: noop,
      closePath: noop,
      moveTo: noop,
      lineTo: noop,
      quadraticCurveTo: noop,
      arc: noop,
      fill: noop,
      stroke: noop,
      fillRect: noop,
      clip: () => {
        clipCalls++;
      },
      createLinearGradient: () => ({ addColorStop: noop }),
    } as unknown as CanvasRenderingContext2D;

    renderer.render(ctx, track, { ...defaultView, legacyRaster: false }, PALETTE_NIGHT_FUNK);
    expect(renderer.stats.crestClips).toBe(0);
    expect(clipCalls).toBe(0);
    expect(renderer.stats.drawnPylonSpans).toBeGreaterThan(0);

    renderer.render(ctx, track, { ...defaultView, legacyRaster: true }, PALETTE_NIGHT_FUNK);
    expect(renderer.stats.crestClips).toBeGreaterThan(0);
    expect(clipCalls).toBeGreaterThan(0);
  });

  it('draws full-width opaque grass terrain above horizonY on uphill segments so hills and props stay grounded', () => {
    const renderer = new RoadRenderer();
    const track = createTestTrack('standard');
    // Steep uphill climb pushing road segments well above horizonY (180)
    for (let i = 0; i < track.segments.length; i++) {
      const seg = track.segments[i]!;
      seg.p1.worldY = i * 420;
      seg.p2.worldY = (i + 1) * 420;
    }

    const grassRects: Array<{ x: number; y: number; w: number; h: number }> = [];
    const noop = () => {};
    const ctx = {
      canvas: { width: 640, height: 360 },
      fillStyle: '#000',
      strokeStyle: '#000',
      lineWidth: 1,
      globalAlpha: 1,
      save: noop,
      restore: noop,
      beginPath: noop,
      closePath: noop,
      moveTo: noop,
      lineTo: noop,
      quadraticCurveTo: noop,
      arc: noop,
      fill: noop,
      stroke: noop,
      fillRect: (x: number, y: number, w: number, h: number) => {
        if (
          ctx.fillStyle === PALETTE_NIGHT_FUNK.grass[0] ||
          ctx.fillStyle === PALETTE_NIGHT_FUNK.grass[1]
        ) {
          grassRects.push({ x, y, w, h });
        }
      },
      createLinearGradient: () => ({ addColorStop: noop }),
    } as unknown as CanvasRenderingContext2D;

    renderer.render(ctx, track, defaultView, PALETTE_NIGHT_FUNK);

    // At least several full-width grass terrain bands must rise above horizonY (180)
    const aboveHorizonGrass = grassRects.filter((r) => r.x === 0 && r.w === 640 && r.y < 160 && r.h > 0);
    expect(aboveHorizonGrass.length).toBeGreaterThan(0);
  });

  it('never draws rumble fillRect across the center asphalt on distant fast slices (no neon road stripes)', () => {
    const renderer = new RoadRenderer();
    const track = createTestTrack('standard');
    for (let i = 50; i < 120; i++) {
      track.segments.push({
        index: i,
        p1: createPoint(0, i * track.segmentLength),
        p2: createPoint(0, (i + 1) * track.segmentLength),
        curve: 0,
        stripe: Math.floor(i / 3) % 2 === 0 ? 0 : 1,
        sprites: [],
        fog: 1,
        env: 'standard',
      });
    }
    track.length = track.segments.length * track.segmentLength;

    const rumbleRects: Array<{ x: number; w: number }> = [];
    const noop = () => {};
    const ctx = {
      canvas: { width: 640, height: 360 },
      fillStyle: '#000',
      strokeStyle: '#000',
      lineWidth: 1,
      globalAlpha: 1,
      save: noop,
      restore: noop,
      beginPath: noop,
      closePath: noop,
      moveTo: noop,
      lineTo: noop,
      quadraticCurveTo: noop,
      arc: noop,
      fill: noop,
      stroke: noop,
      fillRect: (x: number, _y: number, w: number) => {
        if (
          ctx.fillStyle === PALETTE_NIGHT_FUNK.rumble[0] ||
          ctx.fillStyle === PALETTE_NIGHT_FUNK.rumble[1]
        ) {
          rumbleRects.push({ x, w });
        }
      },
      createLinearGradient: () => ({ addColorStop: noop }),
    } as unknown as CanvasRenderingContext2D;

    renderer.render(ctx, track, { ...defaultView, drawDistance: 120 }, PALETTE_NIGHT_FUNK);

    expect(rumbleRects.length).toBeGreaterThan(0);
    // Centered straight road center X = 320: no rumble fillRect may ever span across the asphalt center (x < 320 < x + w)
    const overlappingAsphaltCenter = rumbleRects.filter((r) => r.x < 320 && r.x + r.w > 320);
    expect(overlappingAsphaltCenter.length).toBe(0);
  });

  it('activates ctx.clip() when a bridge crest occludes props behind it', () => {
    const renderer = new RoadRenderer();
    const track = createTestTrack('bridge');
    // Steep bridge arch peaking at segment 5 (worldY=2200) and dropping steeply behind the crest
    for (let i = 0; i < track.segments.length; i++) {
      const seg = track.segments[i]!;
      const yOf = (idx: number) => {
        if (idx <= 5) return Math.sin((idx / 5) * Math.PI * 0.5) * 2200;
        if (idx <= 16) return 2200 - (idx - 5) * 700;
        return 2200 - 11 * 700;
      };
      seg.p1.worldY = yOf(i);
      seg.p2.worldY = yOf(i + 1);
    }
    // Tall suspension tower behind the bridge crest peeks over segClipY while its base is occluded
    track.segments[10]!.sprites.push({ kind: 'suspension-tower', offset: 0, variant: 0 });

    let clipCalls = 0;
    const noop = () => {};
    const ctx = {
      canvas: { width: 640, height: 360 },
      fillStyle: '#000',
      strokeStyle: '#000',
      lineWidth: 1,
      globalAlpha: 1,
      save: noop,
      restore: noop,
      beginPath: noop,
      closePath: noop,
      moveTo: noop,
      lineTo: noop,
      quadraticCurveTo: noop,
      arc: noop,
      fill: noop,
      stroke: noop,
      fillRect: noop,
      clip: () => {
        clipCalls++;
      },
      createLinearGradient: () => ({ addColorStop: noop }),
    } as unknown as CanvasRenderingContext2D;

    renderer.render(ctx, track, defaultView, PALETTE_NIGHT_FUNK);
    expect(renderer.stats.crestClips).toBeGreaterThan(0);
    expect(clipCalls).toBeGreaterThan(0);
  });

  describe('Fase 1 — Local Prop Category Fade-In', () => {
    function createLargeTrack(length = 220): Track {
      const segments: RoadSegment[] = [];
      const segmentLength = 200;
      for (let i = 0; i < length; i++) {
        segments.push({
          index: i,
          p1: createPoint(0, i * segmentLength),
          p2: createPoint(0, (i + 1) * segmentLength),
          curve: 0,
          stripe: i % 2 === 0 ? 0 : 1,
          sprites: [],
          fog: 1,
          env: 'standard',
        });
      }
      return { segments, segmentLength, length: length * segmentLength };
    }

    function createAlphaTrackingCtx() {
      let currentAlpha = 1;
      const drawAlphas: number[] = [];
      const noop = () => {};
      const ctx = {
        canvas: { width: 640, height: 360 },
        fillStyle: '#000',
        strokeStyle: '#000',
        lineWidth: 1,
        get globalAlpha() {
          return currentAlpha;
        },
        set globalAlpha(v: number) {
          currentAlpha = v;
        },
        save: noop,
        restore: noop,
        beginPath: noop,
        closePath: noop,
        moveTo: noop,
        lineTo: noop,
        quadraticCurveTo: noop,
        arc: noop,
        fill: () => {
          drawAlphas.push(currentAlpha);
        },
        stroke: noop,
        fillRect: () => {
          drawAlphas.push(currentAlpha);
        },
        createLinearGradient: () => ({ addColorStop: noop }),
      } as unknown as CanvasRenderingContext2D;
      return { ctx, drawAlphas };
    }

    it('fades lamp, jihanki, and Band D building smoothly inside their category thresholds and draws at alpha 1 closer up', () => {
      const drawDistance = 200;
      const baseView: RoadView = { ...defaultView, drawDistance };

      const cases: Array<{
        kind: 'lamp' | 'jihanki' | 'building';
        offset: number;
        farN: number;
        nearN: number;
      }> = [
        { kind: 'lamp', offset: 1.3, farN: Math.floor(drawDistance * 0.64), nearN: Math.floor(drawDistance * 0.4) },
        { kind: 'jihanki', offset: 1.4, farN: Math.floor(drawDistance * 0.54), nearN: Math.floor(drawDistance * 0.35) },
        { kind: 'building', offset: 7.0, farN: Math.floor(drawDistance * 0.46), nearN: Math.floor(drawDistance * 0.28) },
      ];

      for (const c of cases) {
        const renderer = new RoadRenderer();

        // Far edge just inside category cutoff -> drawn with alpha strictly in (0, 0.7)
        const farTrack = createLargeTrack(220);
        farTrack.segments[c.farN]!.sprites.push({ kind: c.kind, offset: c.offset, variant: 0 });
        const farPropTracker = createAlphaTrackingCtx();
        renderer.render(farPropTracker.ctx, farTrack, baseView, PALETTE_NIGHT_FUNK);
        const nonOneAlphas = farPropTracker.drawAlphas.filter((a) => a !== 1);
        expect(renderer.stats.drawnProps).toBe(1);
        expect(nonOneAlphas.length).toBeGreaterThan(0);
        for (const a of nonOneAlphas) {
          expect(a).toBeGreaterThan(0);
          expect(a).toBeLessThan(0.7);
        }
        expect(farPropTracker.ctx.globalAlpha).toBe(1);

        // Mid-near inside full opacity range -> drawn at alpha === 1 (never dimmed)
        const nearTrack = createLargeTrack(220);
        nearTrack.segments[c.nearN]!.sprites.push({ kind: c.kind, offset: c.offset, variant: 0 });
        const nearPropTracker = createAlphaTrackingCtx();
        renderer.render(nearPropTracker.ctx, nearTrack, baseView, PALETTE_NIGHT_FUNK);
        expect(renderer.stats.drawnProps).toBe(1);
        for (const a of nearPropTracker.drawAlphas) {
          expect(a).toBe(1);
        }
        expect(nearPropTracker.ctx.globalAlpha).toBe(1);
      }
    });
  });

  describe('Fase 2 — 4-Band Atmospheric Depth Fog', () => {
    function createFogTrack(len = 200): Track {
      const segments: RoadSegment[] = [];
      const segmentLength = 200;
      for (let i = 0; i < len; i++) {
        segments.push({
          index: i,
          p1: createPoint(0, i * segmentLength),
          p2: createPoint(0, (i + 1) * segmentLength),
          curve: 0,
          stripe: 0,
          sprites: [],
          fog: 1,
          env: 'standard',
        });
      }
      return { segments, segmentLength, length: len * segmentLength };
    }

    function hexRgbDist(hexA: string, hexB: string): number {
      const parse = (h: string) => [
        parseInt(h.slice(1, 3), 16),
        parseInt(h.slice(3, 5), 16),
        parseInt(h.slice(5, 7), 16),
      ];
      const [r1, g1, b1] = parse(hexA);
      const [r2, g2, b2] = parse(hexB);
      return Math.abs(r1! - r2!) + Math.abs(g1! - g2!) + Math.abs(b1! - b2!);
    }

    it('renders Band 0 (<25%) with pure palette colors and Band 2-3 (>60%) with fog-blended colors', () => {
      tuning.roadFogStrength = 0.65;
      const renderer = new RoadRenderer();
      const track = createFogTrack(200);
      const mock = createMockCanvas();

      renderer.render(mock.ctx, track, { ...defaultView, drawDistance: 200 }, PALETTE_OG_FUTURE_FUNK);

      expect(mock.fills).toContain(PALETTE_OG_FUTURE_FUNK.road[0]);
      expect(mock.fills).toContain(PALETTE_OG_FUTURE_FUNK.rumble[0]);
      // Distant segments inject fog-blended colors not equal to pure Band 0 road/rumble
      const uniqueFills = new Set(mock.fills);
      expect(uniqueFills.size).toBeGreaterThan(6);
    });

    it('disables depth fog across the whole track when roadFogStrength is 0', () => {
      tuning.roadFogStrength = 0;
      const renderer = new RoadRenderer();
      const track = createFogTrack(200);
      const mock = createMockCanvas();

      renderer.render(mock.ctx, track, { ...defaultView, drawDistance: 200 }, PALETTE_OG_FUTURE_FUNK);

      const allowed = new Set([
        PALETTE_OG_FUTURE_FUNK.grass[0],
        PALETTE_OG_FUTURE_FUNK.grass[1],
        PALETTE_OG_FUTURE_FUNK.rumble[0],
        PALETTE_OG_FUTURE_FUNK.rumble[1],
        PALETTE_OG_FUTURE_FUNK.road[0],
        PALETTE_OG_FUTURE_FUNK.road[1],
        PALETTE_OG_FUTURE_FUNK.lane,
        PALETTE_OG_FUTURE_FUNK.mountainRim,
        lerpHexColor(PALETTE_OG_FUTURE_FUNK.rumble[0], PALETTE_OG_FUTURE_FUNK.rumble[1], 0.5),
        lerpHexColor(PALETTE_OG_FUTURE_FUNK.road[0], PALETTE_OG_FUTURE_FUNK.road[1], 0.5),
      ]);
      for (const f of mock.fills) {
        expect(allowed.has(f)).toBe(true);
      }
      expect(mock.fills).not.toContain(PALETTE_OG_FUTURE_FUNK.fog);

      tuning.roadFogStrength = 0.65;
    });

    it('applies stronger fog blending on PALETTE_VAPORFUNK (fogDensity 1.35) than PALETTE_AKIBA_NIGHT (0.85)', () => {
      tuning.roadFogStrength = 0.65;
      const renderer = new RoadRenderer();
      const track = createFogTrack(200);

      const mockVapor = createMockCanvas();
      renderer.render(mockVapor.ctx, track, { ...defaultView, drawDistance: 200 }, PALETTE_VAPORFUNK);

      const mockAkiba = createMockCanvas();
      renderer.render(mockAkiba.ctx, track, { ...defaultView, drawDistance: 200 }, PALETTE_AKIBA_NIGHT);

      const vaporBand3Road = mockVapor.fills.find((f) => f.startsWith('#') && f !== PALETTE_VAPORFUNK.road[0] && f !== PALETTE_VAPORFUNK.grass[0] && f !== PALETTE_VAPORFUNK.rumble[0] && f !== PALETTE_VAPORFUNK.lane);
      expect(vaporBand3Road).toBeDefined();

      // Measure relative shift toward fog in Band 3 (first non-Band0 road slices painted in back-to-front order)
      const vaporBaseDist = hexRgbDist(PALETTE_VAPORFUNK.road[0], PALETTE_VAPORFUNK.fog);
      const vaporMoved = mockVapor.fills.some(
        (f) => f.startsWith('#') && f !== PALETTE_VAPORFUNK.road[0] && hexRgbDist(f, PALETTE_VAPORFUNK.fog) < vaporBaseDist * 0.45,
      );
      const akibaBaseDist = hexRgbDist(PALETTE_AKIBA_NIGHT.road[0], PALETTE_AKIBA_NIGHT.fog);
      const akibaStrongerRatio = mockAkiba.fills.some(
        (f) => f.startsWith('#') && f !== PALETTE_AKIBA_NIGHT.road[0] && hexRgbDist(f, PALETTE_AKIBA_NIGHT.fog) < akibaBaseDist * 0.35,
      );
      expect(vaporMoved).toBe(true);
      expect(akibaStrongerRatio).toBe(false);
    });
  });
});
