/**
 * A point on the road centre line. World coordinates are fixed at build time;
 * camera/screen fields are mutated in place every frame (zero allocations while rendering).
 */
export interface ProjectedPoint {
  worldX: number;
  worldY: number;
  worldZ: number;
  cameraX: number;
  cameraY: number;
  cameraZ: number;
  scale: number;
  screenX: number;
  screenY: number;
  screenW: number;
}

export type PropKind = 'palm' | 'lamp' | 'billboard';

/** A roadside sprite anchored to a segment. `offset` is in road half-widths (±1 = road edge). */
export interface RoadSprite {
  kind: PropKind;
  offset: number;
  variant: number;
}

export interface RoadSegment {
  index: number;
  /** Near edge of the segment. */
  p1: ProjectedPoint;
  /** Far edge of the segment. */
  p2: ProjectedPoint;
  /** Horizontal curvature applied per segment (positive = right-hand curve). */
  curve: number;
  /** Alternating colour band (rumble strips, lane markers). */
  stripe: 0 | 1;
  sprites: RoadSprite[];
  /** Per-frame: fog factor, 1 = clear (near), → 0 = fully fogged (far). */
  fog: number;
}

export interface Track {
  segments: RoadSegment[];
  segmentLength: number;
  /** Total length in world units. */
  length: number;
}

export function createPoint(worldY: number, worldZ: number): ProjectedPoint {
  return {
    worldX: 0,
    worldY,
    worldZ,
    cameraX: 0,
    cameraY: 0,
    cameraZ: 0,
    scale: 0,
    screenX: 0,
    screenY: 0,
    screenW: 0,
  };
}

export function findSegment(track: Track, z: number): RoadSegment {
  const n = track.segments.length;
  const i = Math.floor(z / track.segmentLength) % n;
  return track.segments[i < 0 ? i + n : i]!;
}
