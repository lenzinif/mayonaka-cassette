import { describe, expect, it } from 'vitest';
import { findSegment } from './RoadSegment';
import { buildTestTrack, CURVE, HILL, LENGTH, TrackBuilder } from './TrackBuilder';

describe('TrackBuilder', () => {
  it('builds continuous segments and returns to elevation 0 with downhillToEnd', () => {
    const track = new TrackBuilder(200)
      .straight(LENGTH.SHORT)
      .curve(LENGTH.SHORT, CURVE.MEDIUM, HILL.LOW)
      .downhillToEnd(LENGTH.SHORT)
      .build();

    expect(track.segments.length).toBeGreaterThan(0);
    expect(track.length).toBe(track.segments.length * 200);

    // Every segment's p1 must match the previous segment's p2 in elevation and Z
    for (let i = 1; i < track.segments.length; i++) {
      const prev = track.segments[i - 1]!;
      const curr = track.segments[i]!;
      expect(curr.p1.worldY).toBeCloseTo(prev.p2.worldY, 5);
      expect(curr.p1.worldZ).toBe(prev.p2.worldZ);
    }

    const last = track.segments[track.segments.length - 1]!;
    expect(last.p2.worldY).toBeCloseTo(0, 5);
  });

  it('wraps findSegment cleanly for both positive and negative Z', () => {
    const track = buildTestTrack();
    expect(findSegment(track, 0).index).toBe(0);
    expect(findSegment(track, track.length).index).toBe(0);
    expect(findSegment(track, -1).index).toBe(track.segments.length - 1);
  });
});
