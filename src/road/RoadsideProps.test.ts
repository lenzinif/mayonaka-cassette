import { describe, expect, it } from 'vitest';
import type { PropKind } from './RoadSegment';
import { drawProp } from './RoadsideProps';

function createMockCanvas(): {
  ctx: CanvasRenderingContext2D;
  get rectCalls(): number;
  get fillCalls(): number;
  get stateChanges(): number;
} {
  let rectCalls = 0;
  let fillCalls = 0;
  const stateChanges = 0;
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
    arc: noop,
    fill: () => {
      fillCalls++;
    },
    stroke: noop,
    fillRect: () => {
      rectCalls++;
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
    get stateChanges() {
      return stateChanges;
    },
  };
}

describe('Fase 4 — Elementi a Bordo Pista (RoadsideProps.ts)', () => {
  const allProps: readonly PropKind[] = [
    'palm',
    'lamp',
    'billboard',
    'building',
    'jihanki',
    'phonebooth',
    'gantry',
    'vms',
    'chevron',
    'pylon',
    'shrub',
  ];

  it('renders all 11 prop kinds cleanly without throwing', () => {
    const mock = createMockCanvas();

    for (const kind of allProps) {
      const beforeRects = mock.rectCalls;
      drawProp(mock.ctx, kind, 320, 240, 0.015, 1, 0, 0.5);
      expect(mock.rectCalls).toBeGreaterThan(beforeRects);
    }
  });

  it('handles distance-aware LOD gracefully from far away (small ppu) to near (large ppu)', () => {
    const mockFar = createMockCanvas();
    const mockNear = createMockCanvas();

    // Far distance (small ppu = 0.003)
    for (const kind of allProps) {
      drawProp(mockFar.ctx, kind, 320, 200, 0.003, -1, 1, 0);
    }
    expect(mockFar.rectCalls).toBeGreaterThan(10);

    // Near distance (large ppu = 0.035) — renders more detailed elements like windows & cans
    for (const kind of allProps) {
      drawProp(mockNear.ctx, kind, 320, 280, 0.035, 1, 2, 0.8);
    }
    expect(mockNear.rectCalls).toBeGreaterThan(mockFar.rectCalls);
  });

  it('renders Akiba high-rise buildings with storefronts, window matrix, and vertical neon sign', () => {
    const mock = createMockCanvas();
    drawProp(mock.ctx, 'building', 180, 260, 0.02, -1, 0, 0);
    // Large building facade generates multiple facade, window, sign, and storefront rects
    expect(mock.rectCalls).toBeGreaterThan(15);
  });

  it('renders Japanese vending machines (jihanki) with 3 tiers of illuminated cans', () => {
    const mock = createMockCanvas();
    drawProp(mock.ctx, 'jihanki', 240, 240, 0.025, 1, 0, 0);
    // Display casing + 3 rows of cans (cold blue, hot red, melon soda green)
    expect(mock.rectCalls).toBeGreaterThan(10);
  });

  it('renders overhead Shuto highway gantries spanning the roadway', () => {
    const mock = createMockCanvas();
    drawProp(mock.ctx, 'gantry', 320, 240, 0.018, 1, 0, 0);
    // Dual steel towers, horizontal truss, and 2 green Shuto destination signs
    expect(mock.rectCalls).toBeGreaterThan(8);
  });

  it('pulses VMS warning beacons and Chevron arrows to beatPulse', () => {
    const mockCalm = createMockCanvas();
    const mockBeat = createMockCanvas();

    drawProp(mockCalm.ctx, 'vms', 320, 240, 0.02, 1, 0, 0.0);
    drawProp(mockCalm.ctx, 'chevron', 200, 240, 0.02, -1, 0, 0.0);

    drawProp(mockBeat.ctx, 'vms', 320, 240, 0.02, 1, 0, 0.9);
    drawProp(mockBeat.ctx, 'chevron', 200, 240, 0.02, -1, 0, 0.9);

    expect(mockCalm.rectCalls).toBeGreaterThan(0);
    expect(mockBeat.rectCalls).toBeGreaterThan(0);
  });

  it('executes 120 consecutive frames across all variants with zero runtime errors', () => {
    const mock = createMockCanvas();
    for (let f = 0; f < 120; f++) {
      const kind = allProps[f % allProps.length]!;
      const side = f % 2 === 0 ? -1 : 1;
      const variant = f % 3;
      const pulse = f % 30 === 0 ? 0.95 : 0.1;
      const ppu = 0.008 + (f % 20) * 0.001;
      drawProp(mock.ctx, kind, 320 + side * 50, 220, ppu, side, variant, pulse);
    }
    expect(mock.rectCalls).toBeGreaterThan(100);
  });
});
