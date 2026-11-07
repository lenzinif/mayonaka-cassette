import { describe, expect, it } from 'vitest';
import { PALETTE_NIGHT_FUNK } from './palette';
import { RoadRenderer, type RoadView } from './RoadRenderer';
import { createPoint, type RoadSegment, type SegmentEnvironment, type Track } from './RoadSegment';

function createMockCanvas(): {
  ctx: CanvasRenderingContext2D;
  rectCalls: number;
  fillCalls: number;
  fills: string[];
} {
  let rectCalls = 0;
  let fillCalls = 0;
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
});
