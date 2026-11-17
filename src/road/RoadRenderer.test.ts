import { describe, expect, it } from 'vitest';
import { PALETTE_AKIBA_NIGHT, PALETTE_NIGHT_FUNK, PALETTE_OG_FUTURE_FUNK } from './palette';
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
});
