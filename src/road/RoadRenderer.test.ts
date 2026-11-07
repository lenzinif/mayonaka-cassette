import { describe, expect, it } from 'vitest';
import { PALETTE_NIGHT_FUNK } from './palette';
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

  it('renders bridge segments with bay water fill, 3D steel parapets, and expansion joints', () => {
    const renderer = new RoadRenderer();
    const mock = createMockCanvas();
    const track = createTestTrack('bridge');

    renderer.render(mock.ctx, track, defaultView, PALETTE_NIGHT_FUNK);

    expect(renderer.stats.drawnSegments).toBeGreaterThan(0);
    // Water ground fill instead of grass
    expect(mock.fills).toContain('#060b1e');
    // Steel parapet & top chrome rail
    expect(mock.fills).toContain('#484160');
    expect(mock.fills).toContain('#9e95be');
    // Expansion joint
    expect(mock.fills).toContain('#5c5478');
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
});
