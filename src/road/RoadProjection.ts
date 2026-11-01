import type { ProjectedPoint } from './RoadSegment';

/**
 * Perspective projection of a road point (Lou's Pseudo 3D / Jake Gordon's JavaScript Racer model).
 * Mutates `p` in place.
 *
 * `roadWidth` is the road half-width in world units, so `screenW` is the projected half-width.
 */
export function project(
  p: ProjectedPoint,
  cameraX: number,
  cameraY: number,
  cameraZ: number,
  cameraDepth: number,
  width: number,
  height: number,
  roadWidth: number,
): void {
  p.cameraX = p.worldX - cameraX;
  p.cameraY = p.worldY - cameraY;
  p.cameraZ = p.worldZ - cameraZ;
  p.scale = cameraDepth / p.cameraZ;
  const halfW = width / 2;
  p.screenX = halfW + p.scale * p.cameraX * halfW;
  p.screenY = height / 2 - p.scale * p.cameraY * (height / 2);
  p.screenW = p.scale * roadWidth * halfW;
}

/** Distance from the eye to the projection plane for a given horizontal FOV in degrees. */
export function cameraDepthFromFov(fovDeg: number): number {
  return 1 / Math.tan(((fovDeg / 2) * Math.PI) / 180);
}

/** 1 near the camera, decaying towards 0 with distance. `distance` is normalised 0..1. */
export function exponentialFog(distance: number, density: number): number {
  return 1 / Math.exp(distance * distance * density);
}

/** Fraction (0..1) of the way through the current segment. */
export function percentRemaining(z: number, segmentLength: number): number {
  const r = (z % segmentLength) / segmentLength;
  return r < 0 ? r + 1 : r;
}

export function interpolate(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function easeIn(a: number, b: number, t: number): number {
  return a + (b - a) * t * t;
}

export function easeOut(a: number, b: number, t: number): number {
  return a + (b - a) * (1 - (1 - t) * (1 - t));
}

export function easeInOut(a: number, b: number, t: number): number {
  return a + (b - a) * (-Math.cos(t * Math.PI) / 2 + 0.5);
}
