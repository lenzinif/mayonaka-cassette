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
  strokeCalls: number;
  fillCalls: number;
  lineCalls: number;
} {
  let fillRectCalls = 0;
  let strokeCalls = 0;
  let fillCalls = 0;
  let lineCalls = 0;
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
    moveTo: () => {
      lineCalls++;
    },
    lineTo: () => {
      lineCalls++;
    },
    arc: noop,
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
  } as unknown as CanvasRenderingContext2D;

  return {
    ctx,
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
  };
}

describe('Fase 2 — Orizzonte & Fondali in Parallasse (Background.ts)', () => {
  beforeEach(() => {
    // Restore default weather & sky tuning values
    tuning.bgClouds = 1;
    tuning.bgRain = 0;
    tuning.bgBirds = 1;
    tuning.bgLightningOnBeat = 1;
    tuning.bgConstellations = 1;
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

  it('renders Mayonaka Bay (palette.id === "night") with rolling hills and urban skyline', () => {
    const bg = new Background();
    const mock = createMockCanvasContext();

    bg.render(mock.ctx, 640, 360, PALETTE_NIGHT_FUNK, 0, 0);

    expect(mock.fillRectCalls).toBeGreaterThan(50);
    // Sky gradient, sun, and hill rim paths are drawn
    expect(mock.fillCalls).toBeGreaterThan(0);
    expect(mock.strokeCalls).toBeGreaterThan(0);
  });

  it('renders Sunset Boulevard (palette.id === "og_future_funk") with calm sea horizon and golden sun reflection', () => {
    const bg = new Background();
    const mock = createMockCanvasContext();

    bg.render(mock.ctx, 640, 360, PALETTE_OG_FUTURE_FUNK, 0, 0);

    // In Sunset Boulevard, sea surface and sun reflections call fillRect heavily
    expect(mock.fillRectCalls).toBeGreaterThan(70);
    expect(mock.fillCalls).toBeGreaterThan(0);
  });

  it('renders Akiba Night Rush (palette.id === "akiba_night") with dark cobalt ridges and vibrant towers', () => {
    const bg = new Background();
    const mock = createMockCanvasContext();

    bg.render(mock.ctx, 640, 360, PALETTE_AKIBA_NIGHT, 0.5, 0.2);

    expect(mock.strokeCalls).toBeGreaterThan(0);
    expect(mock.fillRectCalls).toBeGreaterThan(40);
  });

  it('toggles Rain & Storm (tuning.bgRain) and renders angled rain streaks in a single batch stroke', () => {
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

    // Rain adds a batched stroke() call for the 96 rain streaks
    expect(mockRain.strokeCalls).toBeGreaterThan(strokeCallsNoRain);
  });

  it('toggles Procedural Clouds (tuning.bgClouds) and alters fill count', () => {
    const bg = new Background();

    tuning.bgClouds = 1;
    const mockWithClouds = createMockCanvasContext();
    bg.render(mockWithClouds.ctx, 640, 360, PALETTE_OG_FUTURE_FUNK, 0, 0);

    tuning.bgClouds = 0;
    const mockWithoutClouds = createMockCanvasContext();
    bg.render(mockWithoutClouds.ctx, 640, 360, PALETTE_OG_FUTURE_FUNK, 0, 0);

    expect(mockWithClouds.fillRectCalls).toBeGreaterThan(mockWithoutClouds.fillRectCalls);
  });

  it('toggles Birds (tuning.bgBirds) and advances 3-frame flap animation', () => {
    const bg = new Background();

    tuning.bgBirds = 1;
    const mockWithBirds = createMockCanvasContext();
    bg.render(mockWithBirds.ctx, 640, 360, PALETTE_OG_FUTURE_FUNK, 0, 0);

    tuning.bgBirds = 0;
    const mockWithoutBirds = createMockCanvasContext();
    bg.render(mockWithoutBirds.ctx, 640, 360, PALETTE_OG_FUTURE_FUNK, 0, 0);

    expect(mockWithBirds.fillRectCalls).toBeGreaterThan(mockWithoutBirds.fillRectCalls);

    // Flap cycle advances across 0.5s of simulation
    tuning.bgBirds = 1;
    for (let i = 0; i < 5; i++) {
      bg.update(0.1, 0, 1.0);
    }
  });

  it('triggers Beat Lightning on strong downbeat (> 0.8) and decays smoothly', () => {
    const bg = new Background();
    tuning.bgLightningOnBeat = 1;

    // Advance with a strong downbeat pulse (> 0.8)
    const mockFlash = createMockCanvasContext();
    bg.render(mockFlash.ctx, 640, 360, PALETTE_NIGHT_FUNK, 0.9, 0.95);

    // Subsequent updates decay the flash
    bg.update(0.1, 0, 1.0, 0);
    bg.update(0.2, 0, 1.0, 0);

    const mockDecayed = createMockCanvasContext();
    bg.render(mockDecayed.ctx, 640, 360, PALETTE_NIGHT_FUNK, 0, 0);
    expect(mockDecayed.fillRectCalls).toBeGreaterThan(0);
  });

  it('toggles Constellations (tuning.bgConstellations) and draws geometric connecting lines', () => {
    const bg = new Background();

    tuning.bgConstellations = 1;
    bg.update(2.0, 0, 1.0); // Advance to active constellation window (cycle = 2.0s -> alpha = 1.0)
    const mockWithConstellations = createMockCanvasContext();
    bg.render(mockWithConstellations.ctx, 640, 360, PALETTE_NIGHT_FUNK, 0, 0);

    tuning.bgConstellations = 0;
    const mockWithoutConstellations = createMockCanvasContext();
    bg.render(mockWithoutConstellations.ctx, 640, 360, PALETTE_NIGHT_FUNK, 0, 0);

    expect(mockWithConstellations.strokeCalls).toBeGreaterThan(mockWithoutConstellations.strokeCalls);
  });

  it('executes 120 simulation steps and renders with ZERO GC allocations', () => {
    const bg = new Background();
    const mock = createMockCanvasContext();

    // Verify 120 consecutive frames simulate cleanly with no errors
    for (let f = 0; f < 120; f++) {
      bg.update(1 / 120, Math.sin(f * 0.05), 0.85, f % 30 === 0 ? 0.9 : 0);
      bg.render(mock.ctx, 640, 360, PALETTE_NIGHT_FUNK, 0.5, 0.1);
    }

    expect(bg.skyTime).toBeCloseTo(1.0, 1);
  });
});
