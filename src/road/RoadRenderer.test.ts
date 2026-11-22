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

    // Create a genuine crest below horizon peaking across segs 4..5 (worldY=420) and dipping behind it to seg 8 (-480)
    // and place a tall building behind crest + two linked pylons so both crest clip & wire span trigger
    const yAt = (idx: number) =>
      idx <= 4 ? (idx / 4) * 420 : idx === 5 ? 420 : idx <= 8 ? 420 - (idx - 5) * 300 : -480;
    for (let i = 0; i < track.segments.length; i++) {
      const seg = track.segments[i]!;
      seg.p1.worldY = yAt(i);
      seg.p2.worldY = yAt(i + 1);
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

  it('skips ctx.clip() on a continuous rising bridge ramp without an occluding crest', () => {
    const renderer = new RoadRenderer();
    const track = createTestTrack('bridge');
    for (let i = 0; i < track.segments.length; i++) {
      const seg = track.segments[i]!;
      seg.p1.worldY = i * 250;
      seg.p2.worldY = (i + 1) * 250;
    }
    track.segments[15]!.sprites.push({ kind: 'suspension-tower', offset: 0, variant: 0 });

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
    expect(renderer.stats.crestClips).toBe(0);
    expect(clipCalls).toBe(0);
  });

  it('skips ctx.clip() when a standard ground hill crest precedes lower bridge segments', () => {
    const renderer = new RoadRenderer();
    const track = createTestTrack('standard');
    for (let i = 0; i < track.segments.length; i++) {
      const seg = track.segments[i]!;
      seg.env = i >= 6 ? 'bridge' : 'standard';
      const yOf = (idx: number) => {
        if (idx <= 5) return Math.sin((idx / 5) * Math.PI * 0.5) * 2200;
        if (idx <= 16) return 2200 - (idx - 5) * 700;
        return 2200 - 11 * 700;
      };
      seg.p1.worldY = yOf(i);
      seg.p2.worldY = yOf(i + 1);
    }
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
    expect(renderer.stats.crestClips).toBe(0);
    expect(clipCalls).toBe(0);
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

  describe('Fork delimiter alignment & distant lane lines', () => {
    it('aligns Phase 2 inner median curbs seamlessly with Phase 3 curbs at t = 0.65 for both right and left choices', () => {
      const renderer = new RoadRenderer();
      const segLen = 200;
      const totalSegs = 200;
      const segments: RoadSegment[] = [];
      for (let i = 0; i < totalSegs; i++) {
        segments.push({
          index: i,
          p1: createPoint(0, i * segLen),
          p2: createPoint(0, (i + 1) * segLen),
          curve: 0,
          stripe: Math.floor(i / 3) % 2 === 0 ? 0 : 1,
          sprites: [],
          fog: 1,
        });
      }
      const track: Track = { segments, segmentLength: segLen, length: totalSegs * segLen };
      const forkZoneStartZ = (totalSegs - 100) * segLen; // fork span = 100 segs -> seg 164 ends at t=0.65

      for (const forkChoice of ['right', 'left'] as const) {
        const polygons: { fillStyle: string; pts: [number, number][] }[] = [];
        let currentPts: [number, number][] = [];
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
          moveTo: (x: number, y: number) => currentPts.push([x, y]),
          lineTo: (x: number, y: number) => currentPts.push([x, y]),
          quadraticCurveTo: noop,
          arc: noop,
          fill: () => {
            if (currentPts.length > 0) {
              polygons.push({ fillStyle: ctx.fillStyle as string, pts: [...currentPts] });
            }
          },
          stroke: noop,
          fillRect: noop,
          createLinearGradient: () => ({ addColorStop: noop }),
        } as unknown as CanvasRenderingContext2D;

        const accentColor = forkChoice === 'right' ? '#ffd319' : '#05d9e8';
        // Position camera so t = 0.65 (seg 64->65) sits comfortably in mid-screen (y ≈ 252, w ≈ 256)
        renderer.render(
          ctx,
          track,
          {
            ...defaultView,
            position: forkZoneStartZ + 55 * segLen,
            drawDistance: 25,
            forkZoneStartZ,
            forkChoice,
          },
          PALETTE_NIGHT_FUNK,
        );

        // Find the last Phase 2 accent inner curb polygon (curb width r = w/6 >> lane width w/32)
        const accentCurbs = polygons.filter(
          (p) => p.fillStyle === accentColor && p.pts.length === 4 && Math.abs(p.pts[1]![0] - p.pts[0]![0]) > 25,
        );
        expect(accentCurbs.length).toBeGreaterThan(0);
        // Back-to-front order means the FIRST matching accent curb in Phase 2 is the farthest one (closest to t = 0.65)
        const phase2TopCurb = accentCurbs[0]!;
        const topY = phase2TopCurb.pts[2]![1]; // y2 of that slice
        const phase2TopRightX = Math.max(phase2TopCurb.pts[2]![0], phase2TopCurb.pts[3]![0]);
        const phase2TopLeftX = Math.min(phase2TopCurb.pts[2]![0], phase2TopCurb.pts[3]![0]);

        // Find the Phase 3 rumble pair polygon immediately adjacent above (whose near edge y1 === topY + 1)
        const phase3Rumble = polygons.find(
          (p) =>
            p.pts.length === 8 &&
            Math.abs(p.pts[0]![1] - (topY + 1)) < 0.01,
        );
        expect(phase3Rumble).toBeDefined();

        // In drawRumblePairSplit: pts[0..3] is left curb [cLeft-r, cLeft], pts[4..7] is right curb [cRight, cRight+r]
        if (forkChoice === 'right') {
          const phase3LeftCurbOuter = phase3Rumble!.pts[0]![0];
          const phase3LeftCurbInner = phase3Rumble!.pts[1]![0];
          expect(phase2TopLeftX).toBeCloseTo(phase3LeftCurbOuter, 1);
          expect(phase2TopRightX).toBeCloseTo(phase3LeftCurbInner, 1);
        } else {
          const phase3RightCurbInner = phase3Rumble!.pts[4]![0];
          const phase3RightCurbOuter = phase3Rumble!.pts[5]![0];
          expect(phase2TopLeftX).toBeCloseTo(phase3RightCurbInner, 1);
          expect(phase2TopRightX).toBeCloseTo(phase3RightCurbOuter, 1);
        }
      }
    });

    it('renders lane guide lines in useFastForkRect across distant fork slices', () => {
      const renderer = new RoadRenderer();
      const segLen = 200;
      const totalSegs = 220;
      const segments: RoadSegment[] = [];
      for (let i = 0; i < totalSegs; i++) {
        segments.push({
          index: i,
          p1: createPoint(0, i * segLen),
          p2: createPoint(0, (i + 1) * segLen),
          curve: 0,
          stripe: Math.floor(i / 3) % 2 === 0 ? 0 : 1,
          sprites: [],
          fog: 1,
        });
      }
      const track: Track = { segments, segmentLength: segLen, length: totalSegs * segLen };
      const forkZoneStartZ = 40 * segLen;

      const rects: { fillStyle: string; x: number; y: number; w: number; h: number }[] = [];
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
          rects.push({ fillStyle: ctx.fillStyle as string, x, y, w, h });
        },
        createLinearGradient: () => ({ addColorStop: noop }),
      } as unknown as CanvasRenderingContext2D;

      renderer.render(
        ctx,
        track,
        {
          ...defaultView,
          position: forkZoneStartZ + 10 * segLen,
          drawDistance: 160,
          forkZoneStartZ,
          forkChoice: 'right',
        },
        PALETTE_NIGHT_FUNK,
      );

      // Distant Phase 2/3 fast-rect slices must still draw the golden lane guide (#ffd319) as thin rects
      const thinGoldLaneRects = rects.filter((r) => r.fillStyle === '#ffd319' && r.w > 0 && r.w <= 6);
      expect(thinGoldLaneRects.length).toBeGreaterThan(5);
    });
  });

  describe('Phase B & Phase C — Viaduct & Tunnel Zero-GC Rendering', () => {
    it('renders viaduct segments with Shuto sound-barrier parapets and zero bay water fill', () => {
      const renderer = new RoadRenderer();
      const mock = createMockCanvas();
      const track = createTestTrack('viaduct');

      renderer.render(mock.ctx, track, defaultView, PALETTE_AKIBA_NIGHT);

      expect(renderer.stats.drawnSegments).toBeGreaterThan(0);
      expect(mock.fills).not.toContain(PALETTE_AKIBA_NIGHT.water![0]);
      expect(mock.fills).toContain('#2c2740'); // Shuto sound-barrier concrete
      expect(mock.fills).toContain('#474063'); // Viaduct expansion joint
    });

    it('renders tunnel entrance portal, interior bore, ceiling lights, and exit aperture with zero ctx.clip()', () => {
      const renderer = new RoadRenderer();
      let clipCalls = 0;
      const fills: string[] = [];
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
        clip: () => {
          clipCalls++;
        },
        fill: () => {
          fills.push(ctx.fillStyle as string);
        },
        stroke: noop,
        fillRect: () => {
          fills.push(ctx.fillStyle as string);
        },
        createLinearGradient: () => ({ addColorStop: noop }),
      } as unknown as CanvasRenderingContext2D;

      const segmentLength = 200;
      const segments: RoadSegment[] = [];
      for (let i = 0; i < 80; i++) {
        segments.push({
          index: i,
          p1: createPoint(0, i * segmentLength),
          p2: createPoint(0, (i + 1) * segmentLength),
          curve: 0,
          stripe: i % 2 === 0 ? 0 : 1,
          sprites: [],
          fog: 1,
          env: i >= 12 && i < 40 ? 'tunnel' : 'standard',
        });
      }
      const track: Track = { segments, segmentLength, length: segments.length * segmentLength };

      // 1. Approaching tunnel from outside (position = 0): draws entrance portal & bore walls
      renderer.render(ctx, track, { ...defaultView, position: 0, drawDistance: 60 }, PALETTE_NIGHT_FUNK);
      expect(clipCalls).toBe(0);
      expect(fills).toContain('#1b172c'); // Tunnel interior wall
      expect(fills).toContain('#100c1e'); // Tunnel ceiling vault
      expect(fills).toContain('#2d2645'); // Entrance portal concrete arch
      expect(fills).toContain('#ffd166'); // Portal hazard chevron bar

      // 2. Driving inside tunnel (position = 16 * segmentLength): masks surround without ctx.clip()
      fills.length = 0;
      renderer.render(
        ctx,
        track,
        { ...defaultView, position: 16 * segmentLength, drawDistance: 60, beatPulse: 0.7 },
        PALETTE_NIGHT_FUNK,
      );
      expect(clipCalls).toBe(0);
      expect(fills).toContain('#070510'); // Dark surround outside exit aperture
      expect(fills).toContain(PALETTE_NIGHT_FUNK.horizonGlow!); // Exit portal sky rim
    });

    it('bounds inside-tunnel surround masks to <= 8 rects/frame, smooths exterior casing, uses seg.tunnelLight, and preserves multi-tunnel gaps', () => {
      const renderer = new RoadRenderer();
      let clipCalls = 0;
      const darkMaskRects: Array<{ x: number; y: number; w: number; h: number }> = [];
      const ceilingLightRects: Array<{ x: number; y: number; w: number; h: number }> = [];
      const outerPathVertices: Array<{ x: number; y: number }> = [];
      const noop = () => {};

      let inPath = false;
      let currentPts: Array<{ x: number; y: number }> = [];
      const ctx = {
        canvas: { width: 640, height: 360 },
        fillStyle: '#000',
        strokeStyle: '#000',
        lineWidth: 1,
        globalAlpha: 1,
        save: noop,
        restore: noop,
        beginPath: () => {
          inPath = true;
          currentPts = [];
        },
        closePath: noop,
        moveTo: (x: number, y: number) => {
          if (inPath) currentPts.push({ x, y });
        },
        lineTo: (x: number, y: number) => {
          if (inPath) currentPts.push({ x, y });
        },
        quadraticCurveTo: noop,
        arc: noop,
        clip: () => {
          clipCalls++;
        },
        fill: () => {
          if (ctx.fillStyle === '#1b162e' || ctx.fillStyle === '#151126') {
            outerPathVertices.push(...currentPts);
          }
          inPath = false;
        },
        stroke: noop,
        fillRect: (x: number, y: number, w: number, h: number) => {
          if (ctx.fillStyle === '#070510') {
            darkMaskRects.push({ x, y, w, h });
          } else if (ctx.fillStyle === '#ffffff') {
            ceilingLightRects.push({ x, y, w, h });
          }
        },
        createLinearGradient: () => ({ addColorStop: noop }),
      } as unknown as CanvasRenderingContext2D;

      // Two tunnels: Tunnel 1 at [2..25] (straight/curved), open gap [25..45], Tunnel 2 at [45..70]
      const segmentLength = 200;
      const segments: RoadSegment[] = [];
      for (let i = 0; i < 120; i++) {
        const inT1 = i >= 6 && i < 25;
        const inT2 = i >= 45 && i < 70;
        segments.push({
          index: i,
          p1: createPoint(0, i * segmentLength),
          p2: createPoint(0, (i + 1) * segmentLength),
          curve: inT1 ? 2.5 : 0,
          stripe: i % 2 === 0 ? 0 : 1,
          sprites: [],
          fog: 1,
          env: inT1 || inT2 ? 'tunnel' : 'standard',
          tunnelLight: (inT1 || inT2) && i % 16 === 0,
        });
      }
      const track: Track = { segments, segmentLength, length: segments.length * segmentLength };

      // A. Exterior approach (position = 0 -> approaching Tunnel 1 at seg 6):
      // Verify outer casing vertices stay outside inner bore (non-pinching C2: roof & flank spans)
      renderer.render(ctx, track, { ...defaultView, position: 0, drawDistance: 40 }, PALETTE_NIGHT_FUNK);
      const outerSpanWidths: number[] = [];
      for (let i = 0; i + 3 < outerPathVertices.length; i += 4) {
        const p0 = outerPathVertices[i]!;
        const p2 = outerPathVertices[i + 2]!;
        const p3 = outerPathVertices[i + 3]!;
        outerSpanWidths.push(Math.abs(p2.x - p3.x) + Math.abs(p0.x - p3.x));
      }
      expect(clipCalls).toBe(0);
      expect(outerPathVertices.length).toBeGreaterThanOrEqual(12); // Left flank, right flank, top roof quads
      expect(outerSpanWidths.some((w) => w > 10)).toBe(true);

      // B. Straight single tunnel interior -> at most 4-8 dark surround fillRects total (down from ~800)
      // plus beat-synced ceiling lights only where seg.tunnelLight === true (not % 4)
      for (const s of segments) s.curve = 0;
      darkMaskRects.length = 0;
      ceilingLightRects.length = 0;
      renderer.render(
        ctx,
        track,
        { ...defaultView, position: 8 * segmentLength, drawDistance: 80, beatPulse: 0.8 },
        PALETTE_NIGHT_FUNK,
      );
      expect(clipCalls).toBe(0);
      // 4 initial surround rects + at most 0..2 tightening rects (far below 200*4=800), AND ceiling lights only on tunnelLight segments (segs 16 in T1, 48 & 64 in T2)
      expect(darkMaskRects.length).toBeLessThanOrEqual(8);
      expect(darkMaskRects.length).toBeGreaterThanOrEqual(3);
      expect(ceilingLightRects.length).toBe(3);

      // Specifically check Tunnel 2 (at n >= 37 while Tunnel 1 ends at n = 16) did NOT re-paint full-screen #070510 over the open sky gap!
      const secondFullTopMasks = darkMaskRects.filter((r) => r.x === 0 && r.y === 0 && r.w === 640);
      expect(secondFullTopMasks.length).toBe(1);
    });
  });
});
