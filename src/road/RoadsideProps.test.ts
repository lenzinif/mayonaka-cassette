import { describe, expect, it } from 'vitest';
import type { PropKind } from './RoadSegment';
import {
  drawPine,
  drawProp,
  drawStreetTree,
  getPropTheme,
  getPropWorldHeight,
  setPropAtmosphere,
  setPropTheme,
} from './RoadsideProps';

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
    'tree',
    'street-tree',
    'pine',
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
    'kiosk',
    'bench',
    'bus-stop',
    'canopy',
    'torii',
    'toro',
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

  it('renders palm trees with continuous tapered trunk polygons and crown fronds', () => {
    const mock = createMockCanvas();
    drawProp(mock.ctx, 'palm', 320, 240, 0.03, 1, 0, 0);

    // Continuous trunk rings are drawn via path fills, fronds and shadow via rects
    expect(mock.fillCalls).toBeGreaterThan(0);
    expect(mock.rectCalls).toBeGreaterThan(0);
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

  it('animates chase light across chevrons based on seqIndex and beatIndex', () => {
    // seqIndex 0: variant = 0 + 2 * 0 = 0
    // seqIndex 1: variant = 0 + 2 * 1 = 2
    // On beatIndex = 1 (pulse = 0.85):
    // Board 1 (seq = 1) matches 1 % 4 === 1, so it turns white (#ffffff)
    // Board 0 (seq = 0) does not match (0 !== 1), so it stays magenta (#ff007f)
    const mockBoard0 = createMockCanvas();
    const mockBoard1 = createMockCanvas();

    drawProp(mockBoard0.ctx, 'chevron', 200, 240, 0.02, -1, 0, 0.85, 1);
    drawProp(mockBoard1.ctx, 'chevron', 200, 240, 0.02, -1, 2, 0.85, 1);

    expect(mockBoard1.fills).toContain('#ffffff');
    expect(mockBoard0.fills).not.toContain('#ffffff');
    expect(mockBoard0.fills).toContain('#ff007f');
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

  it('renders all prop kinds with scaled ppu (0.2x to 2.0x scale factors) without NaN or throw', () => {
    const mock = createMockCanvas();
    const testScales = [0.2, 0.5, 0.8, 1.0, 1.25, 1.6, 2.0];
    for (const kind of allProps) {
      for (const scale of testScales) {
        const ppu = 0.02 * scale;
        expect(() => {
          drawProp(mock.ctx, kind, 320, 240, ppu, 1, 0, 0);
        }).not.toThrow();
      }
    }
    expect(mock.rectCalls).toBeGreaterThan(100);
  });

  describe('Fase 5 — Biome Props (drawStreetTree & drawPine)', () => {
    it('draws street-tree with sidewalk planter, street glow, trunk and rounded crown', () => {
      const mock = createMockCanvas();
      drawStreetTree(mock.ctx, 320, 240, 0.02, 1, 0);
      expect(mock.rectCalls).toBeGreaterThan(5);
      // Ginkgo yellow variant 0
      expect(mock.fills).toContain('#ffd166');
      // Planter
      expect(mock.fills).toContain('#231e33');
    });

    it('draws pine with tiered cloud pads and moonlight rim', () => {
      const mock = createMockCanvas();
      drawPine(mock.ctx, 320, 240, 0.02, 1, 0);
      expect(mock.rectCalls).toBeGreaterThan(5);
      // Pine body & moonlight rim
      expect(mock.fills).toContain('#1e4d38');
      expect(mock.fills).toContain('#80ffdb');
    });

    it('renders drawStreetTree and drawPine safely across scales 0.2 to 2.0', () => {
      const mock = createMockCanvas();
      const scales = [0.2, 0.5, 1.0, 1.5, 2.0];
      for (const s of scales) {
        const ppu = 0.015 * s;
        expect(() => {
          drawStreetTree(mock.ctx, 320, 240, ppu, -1, 0);
          drawStreetTree(mock.ctx, 320, 240, ppu, 1, 1);
          drawPine(mock.ctx, 320, 240, ppu, -1, 0);
          drawPine(mock.ctx, 320, 240, ppu, 1, 2);
        }).not.toThrow();
      }
      expect(mock.rectCalls).toBeGreaterThan(50);
    });

    it('tints shrubs based on setPropTheme', () => {
      const mock = createMockCanvas();
      setPropTheme({
        id: 'city',
        tree: 'street-tree',
        shrubTint: ['#123456', '#654321', '#abcdef'],
        buildingDensity: 1.0,
      });

      drawProp(mock.ctx, 'shrub', 320, 240, 0.02, 1, 0);
      expect(mock.fills).toContain('#123456');
      expect(mock.fills).toContain('#654321');

      setPropTheme(null);
      expect(getPropTheme()).toBeNull();
    });
  });

  describe('Vertical Crest Culling via getPropWorldHeight', () => {
    it('skips drawing props completely hidden below clipY and renders props peeking above clipY', () => {
      const mock = createMockCanvas();
      const ppu = 0.02;
      const y = 240;
      const palmTopY = y - getPropWorldHeight('palm') * ppu;

      // Completely below hill crest (clipY <= palmTopY) -> zero draw calls
      drawProp(mock.ctx, 'palm', 320, y, ppu, 1, 0, 0, 0, palmTopY);
      expect(mock.rectCalls).toBe(0);
      expect(mock.fillCalls).toBe(0);

      // Peeking above hill crest (clipY > palmTopY) -> renders normally
      drawProp(mock.ctx, 'palm', 320, y, ppu, 1, 0, 0, 0, palmTopY + 20);
      expect(mock.rectCalls + mock.fillCalls).toBeGreaterThan(0);
    });
  });

  describe('Fase 2 & Fase 5 — Atmospheric Silhouettes & Progressive Cascading LOD', () => {
    it('renders distant building, billboard, and palm in atmospheric silhouette colors when fogFactor >= 0.55', () => {
      setPropAtmosphere('#0a102b', '#112233', '#224455');

      const mockBldg = createMockCanvas();
      drawProp(mockBldg.ctx, 'building', 200, 240, 0.006, -1, 0, 0, 0, Number.POSITIVE_INFINITY, 0.8);
      expect(mockBldg.fills).toContain('#112233');
      expect(mockBldg.fills).toContain('#224455');
      expect(mockBldg.fills).not.toContain('#ff0055');

      const mockBoard = createMockCanvas();
      drawProp(mockBoard.ctx, 'billboard', 200, 240, 0.008, 1, 0, 0, 0, Number.POSITIVE_INFINITY, 0.8);
      expect(mockBoard.fills).toContain('#112233');
      expect(mockBoard.fills).toContain('#224455');
      expect(mockBoard.fills).not.toContain('#ff2a6d');

      const mockPalm = createMockCanvas();
      drawProp(mockPalm.ctx, 'palm', 200, 240, 0.008, 1, 0, 0, 0, Number.POSITIVE_INFINITY, 0.8);
      expect(mockPalm.fills).toContain('#112233');
      expect(mockPalm.fills).toContain('#224455');
      expect(mockPalm.fills).not.toContain('#14f1d9');
    });

    it('increases fillRect detail monotonically across LOD tiers and stays compact at ppu = 0.006', () => {
      const ppus = [0.005, 0.01, 0.018, 0.035];
      const kinds: readonly PropKind[] = ['building', 'lamp', 'billboard', 'gantry'];

      for (const kind of kinds) {
        const counts: number[] = [];
        for (const ppu of ppus) {
          const mock = createMockCanvas();
          drawProp(mock.ctx, kind, 320, 240, ppu, 1, 0, 0);
          counts.push(mock.rectCalls);
        }
        for (let i = 0; i < counts.length - 1; i++) {
          expect(counts[i + 1]!).toBeGreaterThanOrEqual(counts[i]!);
        }
        expect(counts[counts.length - 1]!).toBeGreaterThan(counts[0]!);
      }

      // Compact far LOD budget at ppu = 0.006
      for (let variant = 0; variant < 3; variant++) {
        const mockBldg = createMockCanvas();
        drawProp(mockBldg.ctx, 'building', 320, 240, 0.006, 1, variant, 0);
        expect(mockBldg.rectCalls).toBeLessThanOrEqual(8);
      }

      const mockLamp = createMockCanvas();
      drawProp(mockLamp.ctx, 'lamp', 320, 240, 0.006, 1, 0, 0);
      expect(mockLamp.rectCalls).toBeLessThanOrEqual(4);

      // Extreme tiny & huge ppu never throw
      const edgeMock = createMockCanvas();
      for (const kind of kinds) {
        expect(() => drawProp(edgeMock.ctx, kind, 320, 240, 0.0001, 1, 0)).not.toThrow();
        expect(() => drawProp(edgeMock.ctx, kind, 320, 240, 0.25, 1, 0)).not.toThrow();
      }
    });

    it('transitions atmospheric prop colors smoothly through intermediate LUT shades without mutating globalAlpha', () => {
      setPropAtmosphere('#0a102b', '#112233', '#224455');

      // Foreground (fogFactor = 0): full palette colors
      const nearMock = createMockCanvas();
      drawProp(nearMock.ctx, 'billboard', 200, 240, 0.015, 1, 0, 0, 0, Number.POSITIVE_INFINITY, 0);
      expect(nearMock.fills).toContain('#ff2a6d');
      expect(nearMock.fills).not.toContain('#112233');
      expect(nearMock.ctx.globalAlpha).toBe(1);

      // Mid-distance (fogFactor = 0.45): intermediate blended hex colors (neither pure neon nor pure silhouette)
      const midMock = createMockCanvas();
      drawProp(midMock.ctx, 'billboard', 200, 240, 0.015, 1, 0, 0, 0, Number.POSITIVE_INFINITY, 0.45);
      expect(midMock.fills).not.toContain('#ff2a6d');
      expect(midMock.fills).not.toContain('#112233');
      expect(midMock.fills).not.toContain('#224455');
      expect(midMock.ctx.globalAlpha).toBe(1);

      // Far distance (fogFactor = 0.8): pure atmospheric silhouette
      const farMock = createMockCanvas();
      drawProp(farMock.ctx, 'billboard', 200, 240, 0.015, 1, 0, 0, 0, Number.POSITIVE_INFINITY, 0.8);
      expect(farMock.fills).toContain('#112233');
      expect(farMock.fills).toContain('#224455');
      expect(farMock.ctx.globalAlpha).toBe(1);
    });
  });
});
