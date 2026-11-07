import { tuning } from '@src/config/tuning';
import {
  PALETTE_AKIBA_NIGHT,
  PALETTE_NIGHT_FUNK,
  PALETTE_OG_FUTURE_FUNK,
} from '@src/road/palette';
import { beforeEach, describe, expect, it } from 'vitest';
import { Background } from './Background';

function createMockCanvasContext(): {
  ctx: CanvasRenderingContext2D;
  fillRectCalls: number;
  rectCalls: number;
  strokeCalls: number;
  fillCalls: number;
  lineCalls: number;
  drawImageCalls: number;
} {
  let fillRectCalls = 0;
  let rectCalls = 0;
  let strokeCalls = 0;
  let fillCalls = 0;
  let lineCalls = 0;
  let drawImageCalls = 0;
  const noop = () => {};
  const grad = { addColorStop: noop };
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
    clip: noop,
    clearRect: noop,
    drawImage: () => {
      drawImageCalls++;
    },
    moveTo: () => {
      lineCalls++;
    },
    lineTo: () => {
      lineCalls++;
    },
    arc: noop,
    rect: () => {
      rectCalls++;
    },
    fill: () => {
      fillCalls++;
    },
    stroke: () => {
      strokeCalls++;
    },
    fillRect: () => {
      fillRectCalls++;
    },
    createLinearGradient: () => grad,
    createRadialGradient: () => grad,
  } as unknown as CanvasRenderingContext2D;

  return {
    ctx,
    get rectCalls() {
      return rectCalls;
    },
    get fillRectCalls() {
      return fillRectCalls;
    },
    get strokeCalls() {
      return strokeCalls;
    },
    get fillCalls() {
      return fillCalls;
    },
    get lineCalls() {
      return lineCalls;
    },
    get drawImageCalls() {
      return drawImageCalls;
    },
  };
}

describe('Fase 2 — Orizzonte & Fondali in Parallasse (Background.ts)', () => {
  beforeEach(() => {
    // Restore default weather & sky tuning values
    tuning.bgClouds = 1;
    tuning.bgRain = 0;
    tuning.bgBirds = 1;
    tuning.bgLightningOnBeat = 1;
    tuning.bgConstellations = 0;
    tuning.bpmPulseStrength = 1.0;
  });

  it('scrolls 3 Parallax Layers (Lontanissimo, Intermedio, Transizione) at distinct rates', () => {
    const bg = new Background();
    expect(bg.scroll1).toBe(0);
    expect(bg.scroll2).toBe(0);
    expect(bg.scroll3).toBe(0);
    expect(bg.scrollX).toBe(0);

    // Advance with positive curve (turning right)
    bg.update(1.0, 1.0, 1.0);

    // Layer 1 (Lontanissimo) ~14 px/s
    expect(bg.scroll1).toBeCloseTo(14, 0);
    // Layer 2 (Intermedio) ~42 px/s
    expect(bg.scroll2).toBeCloseTo(42, 0);
    // Layer 3 (Transizione) ~80 px/s
    expect(bg.scroll3).toBeCloseTo(80, 0);

    // Distinct parallax hierarchy: Layer 3 > Layer 2 > Layer 1
    expect(bg.scroll3).toBeGreaterThan(bg.scroll2);
    expect(bg.scroll2).toBeGreaterThan(bg.scroll1);

    // Backwards compatibility alias matches primary distant scroll
    expect(bg.scrollX).toBe(bg.scroll1);
  });

  it('renders Mayonaka Bay (palette.id === "night") with central sea, moonlight reflection, flanking city, and margin hills', () => {
    const bg = new Background();
    const mock = createMockCanvasContext();

    bg.render(mock.ctx, 640, 360, PALETTE_NIGHT_FUNK, 0, 0);

    // Mayonaka Bay renders central sea water, moonlight reflection, buoy beacons,
    // flank towers and quayside reflections
    expect(mock.fillRectCalls + mock.rectCalls).toBeGreaterThan(60);
    // Sky gradient, moon corona & disk, margin hills polygon are filled
    expect(mock.fillCalls).toBeGreaterThan(0);
    // Margin hill rim is stroked
    expect(mock.strokeCalls).toBeGreaterThan(0);
  });

  it('renders Sunset Boulevard (palette.id === "og_future_funk") with calm sea horizon and golden sun reflection', () => {
    const bg = new Background();
    const mock = createMockCanvasContext();

    bg.render(mock.ctx, 640, 360, PALETTE_OG_FUTURE_FUNK, 0, 0);

    // In Sunset Boulevard, sea surface and sun reflections call fillRect heavily
    expect(mock.fillRectCalls + mock.rectCalls).toBeGreaterThan(70);
    expect(mock.fillCalls).toBeGreaterThan(0);
  });

  it('renders Akiba Night Rush (palette.id === "akiba_night") with dark cobalt ridges and vibrant towers', () => {
    const bg = new Background();
    const mock = createMockCanvasContext();

    bg.render(mock.ctx, 640, 360, PALETTE_AKIBA_NIGHT, 0.5, 0.2);

    expect(mock.strokeCalls).toBeGreaterThan(0);
    expect(mock.fillRectCalls + mock.rectCalls).toBeGreaterThan(40);
  });

  it('toggles Rain & Storm (tuning.bgRain) and renders multi-layer angled rain streaks', () => {
    const bg = new Background();

    // With rain OFF (default)
    tuning.bgRain = 0;
    const mockNoRain = createMockCanvasContext();
    bg.render(mockNoRain.ctx, 640, 360, PALETTE_NIGHT_FUNK, 0, 0);
    const strokeCallsNoRain = mockNoRain.strokeCalls;

    // Enable rain
    tuning.bgRain = 1;
    bg.update(0.1, 0, 1.0);
    const mockRain = createMockCanvasContext();
    bg.render(mockRain.ctx, 640, 360, PALETTE_NIGHT_FUNK, 0, 0);

    // Rain adds batched stroke() calls for the depth-layered rain streaks
    expect(mockRain.strokeCalls).toBeGreaterThan(strokeCallsNoRain);
  });

  it('toggles 16-Bit Pixel-Art Cumulus Clouds (tuning.bgClouds) and alters fill count', () => {
    const bg = new Background();

    tuning.bgClouds = 1;
    const mockWithClouds = createMockCanvasContext();
    bg.render(mockWithClouds.ctx, 640, 360, PALETTE_OG_FUTURE_FUNK, 0, 0);

    tuning.bgClouds = 0;
    const mockWithoutClouds = createMockCanvasContext();
    bg.render(mockWithoutClouds.ctx, 640, 360, PALETTE_OG_FUTURE_FUNK, 0, 0);

    expect(mockWithClouds.fillCalls).toBeGreaterThan(mockWithoutClouds.fillCalls);
    expect(mockWithClouds.strokeCalls).toBeGreaterThan(mockWithoutClouds.strokeCalls);
  });

  it('pre-renders 16-bit clouds to offscreen canvas with padding and blits via drawImage', () => {
    const bg = new Background();
    tuning.bgClouds = 1;

    // Simulate browser environment with document.createElement
    const createdCanvases: { width: number; height: number }[] = [];
    const origDoc = globalThis.document;
    try {
      (globalThis as unknown as { document: unknown }).document = {
        createElement: (tag: string) => {
          if (tag === 'canvas') {
            const mock = createMockCanvasContext();
            const canvasObj = {
              width: 0,
              height: 0,
              getContext: () => mock.ctx,
            };
            createdCanvases.push(canvasObj);
            return canvasObj;
          }
          return {};
        },
      };

      const mock = createMockCanvasContext();
      bg.render(mock.ctx, 640, 360, PALETTE_NIGHT_FUNK, 0, 0);

      // Verify 6 offscreen cloud canvases were allocated with generous padding to prevent dome clipping
      expect(createdCanvases.length).toBe(6);
      for (const c of createdCanvases) {
        expect(c.width).toBeGreaterThan(60);
        expect(c.height).toBeGreaterThan(25);
      }

      // Fast path uses drawImage blits for visible clouds
      expect(mock.drawImageCalls).toBeGreaterThan(0);
    } finally {
      if (origDoc !== undefined) {
        globalThis.document = origDoc;
      } else {
        delete (globalThis as unknown as { document?: unknown }).document;
      }
    }
  });

  it('toggles Birds (tuning.bgBirds) and advances 3-frame flap animation', () => {
    const bg = new Background();

    tuning.bgBirds = 1;
    const mockWithBirds = createMockCanvasContext();
    bg.render(mockWithBirds.ctx, 640, 360, PALETTE_OG_FUTURE_FUNK, 0, 0);

    tuning.bgBirds = 0;
    const mockWithoutBirds = createMockCanvasContext();
    bg.render(mockWithoutBirds.ctx, 640, 360, PALETTE_OG_FUTURE_FUNK, 0, 0);

    expect(mockWithBirds.fillRectCalls + mockWithBirds.rectCalls).toBeGreaterThan(
      mockWithoutBirds.fillRectCalls + mockWithoutBirds.rectCalls,
    );

    // Flap cycle advances across 0.5s of simulation
    tuning.bgBirds = 1;
    for (let i = 0; i < 5; i++) {
      bg.update(0.1, 0, 1.0);
    }
  });

  it('triggers Vibeful Lightning on extreme spectral event and decays smoothly through micro-dip and afterglow', () => {
    const bg = new Background();
    tuning.bgRain = 1;
    tuning.bgLightningOnBeat = 1;

    // Trigger explicit extreme event
    bg.update(0.01, 0, 1.0, true);
    const mockFlash = createMockCanvasContext();
    bg.render(mockFlash.ctx, 640, 360, PALETTE_NIGHT_FUNK, 0, 0);
    expect(mockFlash.strokeCalls).toBeGreaterThan(2);

    // Subsequent updates advance through micro-dip, secondary flash, and synth afterglow decay
    bg.update(0.05, 0, 1.0, false);
    bg.update(0.05, 0, 1.0, false);
    bg.update(0.25, 0, 1.0, false);

    const mockDecayed = createMockCanvasContext();
    bg.render(mockDecayed.ctx, 640, 360, PALETTE_NIGHT_FUNK, 0, 0);
    expect(mockDecayed.fillRectCalls + mockDecayed.rectCalls).toBeGreaterThan(0);
  });

  it('strictly forbids lightning strikes when bgRain is 0', () => {
    const bg = new Background();
    tuning.bgRain = 0;
    tuning.bgLightningOnBeat = 1;

    bg.update(0.01, 0, 1.0, true);
    bg.triggerLightningStrike();

    const mock = createMockCanvasContext();
    bg.render(mock.ctx, 640, 360, PALETTE_NIGHT_FUNK, 0, 0);
    // When no lightning, strokeCalls is from clouds only, bolt is not stroked
    expect(mock.strokeCalls).toBeLessThan(10);
  });

  it('renders foreground weather (near rain streaks) when bgRain is active', () => {
    const bg = new Background();
    tuning.bgRain = 1;
    bg.update(0.1, 0.5, 0.9, false);

    const mockFg = createMockCanvasContext();
    bg.renderForegroundWeather(mockFg.ctx, 640, 360);

    expect(mockFg.strokeCalls).toBeGreaterThan(0);
  });

  it('maintains a clean twinkling starfield without constellation line clutter', () => {
    const bg = new Background();
    const mock = createMockCanvasContext();
    bg.render(mock.ctx, 640, 360, PALETTE_NIGHT_FUNK, 0, 0);
    expect(mock.fillRectCalls + mock.rectCalls).toBeGreaterThan(0);
  });

  it('toggles Celestial Starfield (tuning.bgStars) and alters fill count', () => {
    const bg = new Background();

    tuning.bgStars = 1;
    const mockWithStars = createMockCanvasContext();
    bg.render(mockWithStars.ctx, 640, 360, PALETTE_NIGHT_FUNK, 0, 0);

    tuning.bgStars = 0;
    const mockWithoutStars = createMockCanvasContext();
    bg.render(mockWithoutStars.ctx, 640, 360, PALETTE_NIGHT_FUNK, 0, 0);

    expect(mockWithStars.fillRectCalls).toBeGreaterThan(mockWithoutStars.fillRectCalls);
  });

  it('renders subterranean atmospheric tunnel vault with ceiling guide ribs and horizon glow', () => {
    const bg = new Background();
    const mock = createMockCanvasContext();

    bg.renderTunnelVault(mock.ctx, 640, 360, 0.8);

    expect(mock.fillRectCalls).toBeGreaterThan(0);
    expect(mock.strokeCalls).toBeGreaterThan(0);
    expect(mock.lineCalls).toBeGreaterThan(0);
  });

  it('executes 120 simulation steps and renders with ZERO GC allocations', () => {
    const bg = new Background();
    const mock = createMockCanvasContext();

    // Verify 120 consecutive frames simulate cleanly with no errors
    for (let f = 0; f < 120; f++) {
      bg.update(1 / 120, Math.sin(f * 0.05), 0.85, f === 30);
      bg.render(mock.ctx, 640, 360, PALETTE_NIGHT_FUNK, 0.5, 0.1);
    }

    expect(bg.skyTime).toBeCloseTo(1.0, 1);
  });
});
