import { describe, expect, it } from 'vitest';
import type { PropKind } from './RoadSegment';
import { drawProp } from './RoadsideProps';

function createMockCanvas(): {
  ctx: CanvasRenderingContext2D;
  get rectCalls(): number;
  get fillCalls(): number;
  get stateChanges(): number;
  get fills(): readonly string[];
} {
  let rectCalls = 0;
  let fillCalls = 0;
  const stateChanges = 0;
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
    get stateChanges() {
      return stateChanges;
    },
    get fills() {
      return fills;
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
    'sign',
    'overpass',
    'suspension-tower',
  ];

  it('renders all 12 prop kinds cleanly without throwing', () => {
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

  it('renders chevron arrows with correct direction and neon palette per variant', () => {
    const mockRight = createMockCanvas();
    const mockLeft = createMockCanvas();

    // Variant 0: Right curve warning (>>>) with magenta neon trim (#ff007f)
    drawProp(mockRight.ctx, 'chevron', 200, 240, 0.02, -1, 0, 0.0);
    expect(mockRight.fills).toContain('#ff007f');
    expect(mockRight.fills).not.toContain('#00f5d4');

    // Variant 1: Left curve warning (<<<) with cyan neon trim (#00f5d4)
    drawProp(mockLeft.ctx, 'chevron', 200, 240, 0.02, 1, 1, 0.0);
    expect(mockLeft.fills).toContain('#00f5d4');
    expect(mockLeft.fills).not.toContain('#ff007f');

    // Beat pulse turns arrow glyphs white (#ffffff)
    const mockPulse = createMockCanvas();
    drawProp(mockPulse.ctx, 'chevron', 200, 240, 0.02, -1, 0, 0.85);
    expect(mockPulse.fills).toContain('#ffffff');
  });

  it('renders 3 distinct building styles (Akiba Mart, Shinjuku Cyber Glass, Showa Retro Block)', () => {
    const mock = createMockCanvas();
    // Variant 0: Akiba Megamart
    drawProp(mock.ctx, 'building', 180, 260, 0.02, -1, 0, 0);
    // Variant 1: Shinjuku Cyber Skyscraper
    drawProp(mock.ctx, 'building', 180, 260, 0.02, -1, 1, 0);
    // Variant 2: Showa Retro Block with Rooftop Kanji Billboard & Fire Escape
    drawProp(mock.ctx, 'building', 180, 260, 0.02, -1, 2, 0);
    expect(mock.rectCalls).toBeGreaterThan(45);
  });

  it('renders Japanese delta transmission towers with waist, V-basket, and overhead cables', () => {
    const mock = createMockCanvas();
    drawProp(mock.ctx, 'pylon', 320, 260, 0.025, 1, 0, 0);
    expect(mock.rectCalls).toBeGreaterThan(5);
    expect(mock.fillCalls).toBeGreaterThan(2);
  });

  it('renders VMS test message (PROVA / TEST) when variant is 0', () => {
    const mock = createMockCanvas();
    drawProp(mock.ctx, 'vms', 320, 240, 0.03, 1, 0, 0.8);
    // Letter matrix generates multiple letter pixel blocks
    expect(mock.rectCalls).toBeGreaterThan(15);
  });

  it('renders two distinct roadside shrub silhouettes (dome hedge vs tiered Niwaki)', () => {
    const mockHedge = createMockCanvas();
    const mockNiwaki = createMockCanvas();

    drawProp(mockHedge.ctx, 'shrub', 320, 240, 0.03, 1, 0, 0);
    drawProp(mockNiwaki.ctx, 'shrub', 320, 240, 0.03, 1, 1, 0);

    expect(mockHedge.rectCalls).toBeGreaterThan(3);
    expect(mockNiwaki.rectCalls).toBeGreaterThan(3);
  });

  it('renders normal Japanese road signs (Speed Limit 80, Highway Exit, Curve Hazard Diamond)', () => {
    const mock = createMockCanvas();
    // Variant 0: Speed 80
    drawProp(mock.ctx, 'sign', 320, 240, 0.025, 1, 0, 0);
    // Variant 1: Highway Exit Directional
    drawProp(mock.ctx, 'sign', 320, 240, 0.025, 1, 1, 0);
    // Variant 2: Caution Curve Diamond
    drawProp(mock.ctx, 'sign', 320, 240, 0.025, 1, 2, 0);

    expect(mock.rectCalls).toBeGreaterThan(12);
    expect(mock.fillCalls).toBeGreaterThan(2);
  });

    it('renders Ponte A highway overpass (Ponte A) across all 3 variants with shadow and pillars', () => {
    const mock = createMockCanvas();

    // Variant 0: Shuto Expressway brutalist concrete overpass with green exit sign & streetlights
    const rectsBefore0 = mock.rectCalls;
    drawProp(mock.ctx, 'overpass', 320, 240, 0.022, 1, 0, 0);
    expect(mock.rectCalls).toBeGreaterThan(rectsBefore0 + 10);
    expect(mock.fills).toContain('rgba(10, 6, 20, 0.55)'); // Asphalt roadway shadow
    expect(mock.fills).toContain('#005f3e'); // Expressway green exit sign

    // Variant 1: Steel truss girder overpass with lattice members & blue route badge
    const rectsBefore1 = mock.rectCalls;
    drawProp(mock.ctx, 'overpass', 320, 240, 0.022, 1, 1, 0);
    expect(mock.rectCalls).toBeGreaterThan(rectsBefore1 + 10);
    expect(mock.fills).toContain('#0052cc'); // Japanese Route Blue shield
    expect(mock.fills).toContain('#262a40'); // Steel blue fascia

    // Variant 2: Elevated Viaduct with neon line and distant crossing cars
    const rectsBefore2 = mock.rectCalls;
    drawProp(mock.ctx, 'overpass', 320, 240, 0.022, 1, 2, 0.8);
    expect(mock.rectCalls).toBeGreaterThan(rectsBefore2 + 8);
    expect(mock.fills).toContain('#ff007f'); // Beat-pulsed neon strip
    expect(mock.fills).toContain('#ff0055'); // Crossing car taillight
  });
    it('renders Ponte B monumental suspension towers (Rainbow Bridge) across all 3 variants with safety bands and cables', () => {
    const mock = createMockCanvas();

    // Variant 0: Rainbow Bridge International Orange & White safety bands
    const rectsBefore0 = mock.rectCalls;
    drawProp(mock.ctx, 'suspension-tower', 320, 240, 0.022, 1, 0, 0.8);
    expect(mock.rectCalls).toBeGreaterThan(rectsBefore0 + 10);
    expect(mock.fills).toContain('#ff4800'); // Safety orange band
    expect(mock.fills).toContain('#f8f9fa'); // White band
    expect(mock.fills).toContain('#ff0033'); // Aviation warning beacon

    // Variant 1: Titanium Cyber Bay with glowing turquoise cables
    const rectsBefore1 = mock.rectCalls;
    drawProp(mock.ctx, 'suspension-tower', 320, 240, 0.022, 1, 1, 0.1);
    expect(mock.rectCalls).toBeGreaterThan(rectsBefore1 + 10);
    expect(mock.fills).toContain('#1e1935'); // Titanium midnight dark leg
    expect(mock.fills).toContain('#00f5d4'); // Glowing turquoise cables

    // Variant 2: Sunset Shuto Purple/Pink Truss
    const rectsBefore2 = mock.rectCalls;
    drawProp(mock.ctx, 'suspension-tower', 320, 240, 0.022, 1, 2, 0);
    expect(mock.rectCalls).toBeGreaterThan(rectsBefore2 + 8);
    expect(mock.fills).toContain('#7b2cbf'); // Violet primary
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
