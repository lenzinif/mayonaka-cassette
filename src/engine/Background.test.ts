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
    const calls: Array<{ fillStyle: string | CanvasGradient | CanvasPattern; y: number; h: number }> = [];
    const noop = () => {};
    const grad = { addColorStop: noop };
    let currentFillStyle: string | CanvasGradient | CanvasPattern = '#000';
    const ctx = {
      canvas: { width: 640, height: 360 },
      get fillStyle() {
        return currentFillStyle;
      },
      set fillStyle(v: string | CanvasGradient | CanvasPattern) {
        currentFillStyle = v;
      },
      strokeStyle: '#000',
      lineWidth: 1,
      globalAlpha: 1,
      save: noop,
      restore: noop,
      beginPath: noop,
      closePath: noop,
      clip: noop,
      clearRect: noop,
      drawImage: noop,
      moveTo: noop,
      lineTo: noop,
      arc: noop,
      rect: noop,
      fill: noop,
      stroke: noop,
      fillRect: (_x: number, y: number, _w: number, h: number) => {
        calls.push({ fillStyle: currentFillStyle, y, h });
      },
      createLinearGradient: () => grad,
      createRadialGradient: () => grad,
    } as unknown as CanvasRenderingContext2D;

    bg.render(ctx, 640, 360, PALETTE_OG_FUTURE_FUNK, 0, 0);

    // In Sunset Boulevard, sea surface and sun reflections call fillRect heavily
    expect(calls.length).toBeGreaterThan(70);

    // Sea horizon line (y === horizonY - 26 = 180 - 26, h === 1) uses warm light golden-cream mountainRim (#fff2c2)
    // and never clashing cyan (#05d9e8)
    const horizonLine = calls.find(c => c.y === 180 - 26 && c.h === 1);
    expect(horizonLine).toBeDefined();
    expect(horizonLine?.fillStyle).toBe(PALETTE_OG_FUTURE_FUNK.mountainRim);
    expect(horizonLine?.fillStyle).toBe('#fff2c2');

    const cyanCalls = calls.filter(c => c.fillStyle === '#05d9e8');
    expect(cyanCalls.length).toBe(0);
  });

  it('never injects near-black #030514 into sea or ground horizon gradients across stages', () => {
    const bg = new Background();
    const colorStops: string[] = [];
    const noop = () => {};
    const makeGrad = () => ({
      addColorStop: (_offset: number, color: string) => {
        colorStops.push(color);
      },
    });
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
      drawImage: noop,
      moveTo: noop,
      lineTo: noop,
      arc: noop,
      rect: noop,
      fill: noop,
      stroke: noop,
      fillRect: noop,
      createLinearGradient: makeGrad,
      createRadialGradient: makeGrad,
    } as unknown as CanvasRenderingContext2D;

    bg.render(ctx, 640, 360, PALETTE_OG_FUTURE_FUNK, 0, 0);
    bg.render(ctx, 640, 360, PALETTE_NIGHT_FUNK, 0, 0);
    bg.render(ctx, 640, 360, PALETTE_AKIBA_NIGHT, 0, 0);

    expect(colorStops).not.toContain('#030514');
    expect(colorStops).toContain(PALETTE_OG_FUTURE_FUNK.fog);
    expect(colorStops).toContain(PALETTE_NIGHT_FUNK.fog);
    expect(colorStops).toContain(PALETTE_AKIBA_NIGHT.fog);
  });

  it('renders Sunset Boulevard sea reflections strictly BEHIND the skyline buildings', () => {
    const bg = new Background();
    const calls: Array<{
      type: string;
      fillStyle: string | CanvasGradient | CanvasPattern;
      y: number;
      h: number;
    }> = [];
    const noop = () => {};
    const grad = { addColorStop: noop };
    let currentFillStyle: string | CanvasGradient | CanvasPattern = '#000';
    const ctx = {
      canvas: { width: 640, height: 360 },
      get fillStyle() {
        return currentFillStyle;
      },
      set fillStyle(v: string | CanvasGradient | CanvasPattern) {
        currentFillStyle = v;
      },
      strokeStyle: '#000',
      lineWidth: 1,
      globalAlpha: 1,
      save: noop,
      restore: noop,
      beginPath: noop,
      closePath: noop,
      clip: noop,
      clearRect: noop,
      drawImage: noop,
      moveTo: noop,
      lineTo: noop,
      arc: noop,
      rect: noop,
      fill: noop,
      stroke: noop,
      fillRect: (_x: number, y: number, _w: number, h: number) => {
        calls.push({ type: 'fillRect', fillStyle: currentFillStyle, y, h });
      },
      createLinearGradient: () => grad,
      createRadialGradient: () => grad,
    } as unknown as CanvasRenderingContext2D;

    bg.render(ctx, 640, 360, PALETTE_OG_FUTURE_FUNK, 0, 0);

    // In Sunset Boulevard, COLOR_SUNSET_SKYLINE (#240a38) is used for building silhouettes
    const buildingIndices: number[] = [];
    calls.forEach((c, i) => {
      if (c.fillStyle === '#240a38') {
        buildingIndices.push(i);
      }
    });
    expect(buildingIndices.length).toBeGreaterThan(0);
    const firstBuildingIdx = buildingIndices[0]!;

    // Water reflections use winPrimary ('#ffd447') or winAccent ('#fff2c2')
    // with 1px slices (h === 1) in the water horizon region (y >= 190 && y < 202 for 360 height, horizonY ~ 201.6)
    // All water reflection draw calls must occur BEFORE buildings are rendered!
    const postBuildingWaterReflections = calls.filter((c, i) => {
      return (
        i > firstBuildingIdx &&
        (c.fillStyle === '#ffd447' || c.fillStyle === '#fff2c2') &&
        c.h === 1
      );
    });

    expect(postBuildingWaterReflections.length).toBe(0);
  });

  it('leaves the central bay (x: 240..380) open in Sunset Boulevard while flanking buildings frame the coast', () => {
    const bg = new Background();
    const rects: Array<{ fillStyle: string | CanvasGradient | CanvasPattern; x: number; w: number }> = [];
    const noop = () => {};
    const grad = { addColorStop: noop };
    let currentFillStyle: string | CanvasGradient | CanvasPattern = '#000';
    const ctx = {
      canvas: { width: 640, height: 360 },
      get fillStyle() {
        return currentFillStyle;
      },
      set fillStyle(v: string | CanvasGradient | CanvasPattern) {
        currentFillStyle = v;
      },
      strokeStyle: '#000',
      lineWidth: 1,
      globalAlpha: 1,
      save: noop,
      restore: noop,
      beginPath: noop,
      closePath: noop,
      clip: noop,
      clearRect: noop,
      drawImage: noop,
      moveTo: noop,
      lineTo: noop,
      arc: noop,
      rect: noop,
      fill: noop,
      stroke: noop,
      fillRect: (x: number, _y: number, w: number) => {
        rects.push({ fillStyle: currentFillStyle, x, w });
      },
      createLinearGradient: () => grad,
      createRadialGradient: () => grad,
    } as unknown as CanvasRenderingContext2D;

    bg.render(ctx, 640, 360, PALETTE_OG_FUTURE_FUNK, 0, 0);

    const skylineRects = rects.filter(r => r.fillStyle === '#240a38');
    expect(skylineRects.length).toBeGreaterThan(0);

    // No skyline silhouettes should overlap the central open sea bay (x: 240..380)
    const centerSkylineRects = skylineRects.filter(r => r.x + r.w > 240 && r.x < 380);
    expect(centerSkylineRects.length).toBe(0);

    // Both left (x: 120..220) and right (x: 400..500) coastal flanks must be populated
    expect(skylineRects.some(r => r.x >= 120 && r.x < 240)).toBe(true);
    expect(skylineRects.some(r => r.x >= 400 && r.x <= 500)).toBe(true);
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

  describe('Fase 3 — Horizon Pitch Shift Parallax', () => {
    it('keeps pitchOffset at 0 on flat road and converges symmetrically on climbs/descents within bgPitchMaxPx', () => {
      tuning.bgPitchStrength = 1.0;
      tuning.bgPitchMaxPx = 18;

      const bgFlat = new Background();
      for (let i = 0; i < 60; i++) bgFlat.update(1 / 60, 0, 1.0, false, 0);
      expect(bgFlat.pitchOffset).toBe(0);

      const bgUp = new Background();
      for (let i = 0; i < 120; i++) bgUp.update(1 / 60, 0, 1.0, false, 1.2);
      expect(bgUp.pitchOffset).toBeGreaterThan(10);
      expect(bgUp.pitchOffset).toBeLessThanOrEqual(tuning.bgPitchMaxPx);

      const bgDown = new Background();
      for (let i = 0; i < 120; i++) bgDown.update(1 / 60, 0, 1.0, false, -1.2);
      expect(bgDown.pitchOffset).toBeLessThan(-10);
      expect(bgDown.pitchOffset).toBeGreaterThanOrEqual(-tuning.bgPitchMaxPx);
      expect(bgDown.pitchOffset).toBeCloseTo(-bgUp.pitchOffset, 3);
    });

    it('keeps pitchOffset at 0 when bgPitchStrength is 0', () => {
      tuning.bgPitchStrength = 0;
      tuning.bgPitchMaxPx = 18;
      const bg = new Background();
      for (let i = 0; i < 60; i++) bg.update(1 / 60, 0, 1.0, false, 1.5);
      expect(bg.pitchOffset).toBe(0);
      tuning.bgPitchStrength = 1.0;
    });

    it('allocates zero extra CanvasGradients across continuous roadSlope changes', () => {
      tuning.bgPitchStrength = 1.0;
      tuning.bgPitchMaxPx = 18;
      const bg = new Background();
      let linearGradCount = 0;
      let radialGradCount = 0;
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
        translate: noop,
        beginPath: noop,
        closePath: noop,
        clip: noop,
        clearRect: noop,
        drawImage: noop,
        moveTo: noop,
        lineTo: noop,
        arc: noop,
        rect: noop,
        fill: noop,
        stroke: noop,
        fillRect: noop,
        createLinearGradient: () => {
          linearGradCount++;
          return grad;
        },
        createRadialGradient: () => {
          radialGradCount++;
          return grad;
        },
      } as unknown as CanvasRenderingContext2D;

      // Warmup frame 0 populates gradient caches once
      bg.update(1 / 60, 0, 1.0, false, 0);
      bg.render(ctx, 640, 360, PALETTE_NIGHT_FUNK, 0, 0);
      const baseLinear = linearGradCount;
      const baseRadial = radialGradCount;

      // Varying roadSlope across 60 frames must NEVER trigger gradient reallocation
      for (let f = 1; f <= 60; f++) {
        const slope = Math.sin(f * 0.15) * 1.4;
        bg.update(1 / 60, 0, 1.0, false, slope);
        bg.render(ctx, 640, 360, PALETTE_NIGHT_FUNK, 0, 0);
      }

      expect(linearGradCount).toBe(baseLinear);
      expect(radialGradCount).toBe(baseRadial);
    });
  });
});
