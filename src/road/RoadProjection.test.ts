import { describe, expect, it } from 'vitest';
import {
  cameraDepthFromFov,
  easeIn,
  easeInOut,
  easeOut,
  exponentialFog,
  percentRemaining,
  project,
} from './RoadProjection';
import { createPoint } from './RoadSegment';

describe('RoadProjection', () => {
  it('projects a centered point onto the horizontal screen midpoint', () => {
    const p = createPoint(0, 1000);
    const depth = cameraDepthFromFov(90); // tan(45°) = 1 -> depth = 1
    project(p, 0, 1000, 0, depth, 640, 360, 2000);

    expect(p.screenX).toBeCloseTo(320, 5);
    // Camera is at y=1000 above worldY=0, so point lies below the horizon (screenY > 180)
    expect(p.screenY).toBeGreaterThan(180);
    expect(p.screenW).toBeCloseTo((1 / 1000) * 2000 * 320, 5);
  });

  it('shrinks projected road width proportionally with distance Z', () => {
    const near = createPoint(0, 500);
    const far = createPoint(0, 1000);
    project(near, 0, 1000, 0, 1, 640, 360, 2000);
    project(far, 0, 1000, 0, 1, 640, 360, 2000);

    expect(near.screenW).toBeCloseTo(far.screenW * 2, 5);
  });

  it('computes exponential fog in [0, 1] and easing boundary values', () => {
    expect(exponentialFog(0, 5)).toBe(1);
    expect(exponentialFog(1, 5)).toBeLessThan(0.01);
    expect(percentRemaining(250, 200)).toBeCloseTo(0.25, 5);
    expect(easeIn(10, 20, 0)).toBe(10);
    expect(easeOut(10, 20, 1)).toBe(20);
    expect(easeInOut(10, 20, 0.5)).toBeCloseTo(15, 5);
  });
});
