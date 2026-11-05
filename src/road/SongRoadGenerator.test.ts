import type { BeatMap, SectionRole } from '@src/audio/BeatMap';
import { DEFAULT_SYNTH_BEATMAP } from '@src/audio/FunkAudioEngine';
import { RUMBLE_LENGTH, SEGMENT_LENGTH } from '@src/config/constants';
import { describe, expect, it } from 'vitest';
import { defineChunk, getChunksForRole, ROAD_CHUNKS, type RoadChunk, validateRoadChunk } from './RoadChunks';
import { CURVE } from './TrackBuilder';
import {
  barToWorldZ,
  generateSongRoad,
  getSectionPaceFactor,
  restoreCanonicalTrack,
  stitchHorizonToTargetZ,
  worldZToBar,
  worldZToBeat,
} from './SongRoadGenerator';

describe('RoadChunks catalog', () => {
  it('validates all canonical chunks and covers every section role', () => {
    expect(ROAD_CHUNKS.length).toBeGreaterThanOrEqual(10);
    for (const chunk of ROAD_CHUNKS) {
      expect(() => validateRoadChunk(chunk)).not.toThrow();
    }

    const roles: SectionRole[] = ['intro', 'build', 'drop', 'breakdown', 'outro'];
    for (const role of roles) {
      expect(getChunksForRole(role).length).toBeGreaterThan(0);
    }
  });
});

describe('SongRoadGenerator', () => {
  it('is 100% deterministic for a given BeatMap and contentHash seed', () => {
    const roadA = generateSongRoad(DEFAULT_SYNTH_BEATMAP);
    const roadB = generateSongRoad(DEFAULT_SYNTH_BEATMAP);

    expect(roadA.segments.length).toBe(roadB.segments.length);
    expect(roadA.chunks).toEqual(roadB.chunks);
    expect(roadA.dropMarkers).toEqual(roadB.dropMarkers);

    for (let i = 0; i < roadA.segments.length; i++) {
      const sA = roadA.segments[i]!;
      const sB = roadB.segments[i]!;
      expect(sA.curve).toBe(sB.curve);
      expect(sA.p1.worldY).toBe(sB.p1.worldY);
      expect(sA.p2.worldY).toBe(sB.p2.worldY);
      expect(sA.sprites).toEqual(sB.sprites);
    }

    const roadC = generateSongRoad({
      ...DEFAULT_SYNTH_BEATMAP,
      contentHash: 'sha256:different-song-hash',
    });
    expect(roadC.chunks).not.toEqual(roadA.chunks);
  });

  it('matches road length in bars to song length in bars and closes loop seamlessly', () => {
    const road = generateSongRoad(DEFAULT_SYNTH_BEATMAP);

    expect(road.totalBars).toBe(DEFAULT_SYNTH_BEATMAP.barEnergy.length);
    expect(road.segments.length).toBe(road.totalBars * road.segmentsPerBar);
    expect(road.segmentsPerBar % 4).toBe(0);

    // Every segment connects without vertical kinks
    for (let i = 1; i < road.segments.length; i++) {
      expect(road.segments[i]!.p1.worldY).toBeCloseTo(road.segments[i - 1]!.p2.worldY, 5);
    }

    // Loop seam closes back at elevation 0
    const lastSeg = road.segments[road.segments.length - 1]!;
    expect(lastSeg.p2.worldY).toBeCloseTo(0, 5);
    expect(road.segments[0]!.p1.worldY).toBe(0);

    // Coordinate conversion helpers
    const zAtBar16 = barToWorldZ(road, 16);
    expect(worldZToBar(road, zAtBar16 + 1)).toBe(16);
    expect(worldZToBeat(road, zAtBar16)).toBeCloseTo(64, 5);
  });

  it('builds a climb that crests at the first bar of the following drop (DESIGN.md §3)', () => {
    const customMap: BeatMap = {
      ...DEFAULT_SYNTH_BEATMAP,
      contentHash: 'sha256:crest-test-track',
      barEnergy: new Array<number>(24).fill(0.75),
      sections: [
        { startBar: 0, bars: 4, role: 'intro' },
        { startBar: 4, bars: 8, role: 'build' },
        { startBar: 12, bars: 8, role: 'drop' },
        { startBar: 20, bars: 4, role: 'outro' },
      ],
    };

    const road = generateSongRoad(customMap);
    expect(road.dropMarkers.length).toBe(1);

    const dropMarker = road.dropMarkers[0]!;
    expect(dropMarker.barIndex).toBe(12);

    const buildStartSeg = 4 * road.segmentsPerBar;
    const dropStartSeg = dropMarker.segmentIndex;

    const yAtBuildStart = road.segments[buildStartSeg]!.p1.worldY;
    const yAtDropCrest = road.segments[dropStartSeg - 1]!.p2.worldY;

    // The build section must climb substantially up to the drop boundary crest
    expect(yAtDropCrest).toBeGreaterThan(yAtBuildStart + 8000);
    // And the drop marker segment is decorated with twin billboards
    expect(road.segments[dropStartSeg]!.sprites.some((s) => s.kind === 'billboard')).toBe(true);
  });

  it('calculates section pace factor across intro launch, breakdown, and build/drop', () => {
    const road = generateSongRoad(DEFAULT_SYNTH_BEATMAP);
    // First 4 bars: ramp from 0.55 to 0.85
    expect(getSectionPaceFactor(road, 0, 'intro')).toBeCloseTo(0.55, 3);
    expect(getSectionPaceFactor(road, 2, 'intro')).toBeCloseTo(0.70, 3);
    expect(getSectionPaceFactor(road, 4, 'intro')).toBeCloseTo(0.92, 3);

    expect(getSectionPaceFactor(road, 8, 'breakdown')).toBe(0.86);
    expect(getSectionPaceFactor(road, 12, 'outro')).toBe(0.92);
    expect(getSectionPaceFactor(road, 16, 'build')).toBe(1.0);
    expect(getSectionPaceFactor(road, 20, 'drop')).toBe(1.0);
  });

  describe('Macro A2 Horizon Stitching & Canonical Restoration', () => {
    it('executes zero-pop-in horizon stitching with quantized rumble steps and C1 continuity', () => {
      const road = generateSongRoad(DEFAULT_SYNTH_BEATMAP);
      const drawDistance = 200;
      const currentZ = 20 * road.barLengthWorld;
      const rawTargetZ = currentZ + 3.8 * road.barLengthWorld;

      const fromSegIndex = Math.floor(currentZ / road.segmentLength);
      // Record visible window geometry before stitch
      const copyCount = drawDistance - 24;
      const preCurve: number[] = [];
      const preStripe: number[] = [];
      const preDeltaY: number[] = [];
      for (let n = 0; n < copyCount; n++) {
        const seg = road.segments[fromSegIndex + n]!;
        preCurve.push(seg.curve);
        preStripe.push(seg.stripe);
        preDeltaY.push(seg.p2.worldY - seg.p1.worldY);
      }

      const res = stitchHorizonToTargetZ(road, currentZ, rawTargetZ, drawDistance);
      expect(res).not.toBeNull();
      if (!res) return;

      // 1. deltaZ must be an exact multiple of 2 * RUMBLE_LENGTH * segmentLength (6 * 200 = 1200)
      const rumbleCycleWorld = 2 * RUMBLE_LENGTH * SEGMENT_LENGTH;
      expect(res.deltaZ % rumbleCycleWorld).toBe(0);
      expect(res.copiedWindowSegs).toBe(copyCount);

      // 2. Visible segments match 100% in curve, stripe parity, and relative elevation slope
      for (let n = 0; n < res.copiedWindowSegs; n++) {
        const destSeg = road.segments[res.toSegIndex + n]!;
        expect(destSeg.curve).toBe(preCurve[n]);
        expect(destSeg.stripe).toBe(preStripe[n]);
        expect(destSeg.p2.worldY - destSeg.p1.worldY).toBeCloseTo(preDeltaY[n]!, 5);
      }

      // 3. The entire track must maintain zero vertical gap: seg[i].p1.worldY === seg[i - 1].p2.worldY
      for (let i = 1; i < road.segments.length; i++) {
        expect(road.segments[i]!.p1.worldY).toBeCloseTo(road.segments[i - 1]!.p2.worldY, 5);
      }

      // 4. restoreCanonicalTrack resets every segment back to its initial canonical state
      restoreCanonicalTrack(road);
      for (let i = 0; i < road.segments.length; i++) {
        const s = road.segments[i]!;
        expect(s.curve).toBe(road.canonical.curve[i]);
        expect(s.p1.worldY).toBe(road.canonical.p1WorldY[i]);
        expect(s.p2.worldY).toBe(road.canonical.p2WorldY[i]);
      }
    });

    it('rejects stitching when delta is below minimum 12 segments or extends beyond track bounds', () => {
      const road = generateSongRoad(DEFAULT_SYNTH_BEATMAP);
      const drawDistance = 200;

      // Too small delta (< 12 segments)
      const smallRes = stitchHorizonToTargetZ(road, 1000, 1500, drawDistance);
      expect(smallRes).toBeNull();

      // Near the very end of the track
      const nearEndZ = road.length - (drawDistance + 5) * road.segmentLength;
      const endRes = stitchHorizonToTargetZ(road, nearEndZ, nearEndZ + 4000, drawDistance);
      expect(endRes).toBeNull();
    });
  });

  describe('Curve Warning Chevrons', () => {
    it('places chevrons ONLY before curves and signals the correct direction (right: >>>, left: <<<)', () => {
      const testChunk: RoadChunk = defineChunk({
        id: 'test-chevron-chunk',
        description: 'Test chunk for chevron direction and placement',
        role: 'drop',
        bars: 8,
        maneuvers: [
          { bars: 3, curve: CURVE.MEDIUM, elevation: 0 },
          { bars: 2, curve: 0, elevation: 0 },
          { bars: 3, curve: -CURVE.MEDIUM, elevation: 0 },
        ],
        props: [
          { kind: 'chevron', placement: 'outside-curve', everyBeats: 2, offset: 1.35 },
        ],
      });

      const customMap: BeatMap = {
        ...DEFAULT_SYNTH_BEATMAP,
        contentHash: 'sha256:chevron-test-track',
        barEnergy: new Array<number>(8).fill(0.8),
        sections: [{ startBar: 0, bars: 8, role: 'drop' }],
      };

      const road = generateSongRoad(customMap, {
        catalog: [testChunk],
      });

      interface ChevronInfo {
        segIndex: number;
        barIndex: number;
        offset: number;
        variant: number;
        curve: number;
      }
      const chevrons: ChevronInfo[] = [];

      for (let i = 0; i < road.segments.length; i++) {
        const seg = road.segments[i]!;
        for (const s of seg.sprites) {
          if (s.kind === 'chevron') {
            chevrons.push({
              segIndex: i,
              barIndex: Math.floor(i / road.segmentsPerBar),
              offset: s.offset,
              variant: s.variant,
              curve: seg.curve,
            });
          }
        }
      }

      expect(chevrons.length).toBeGreaterThan(0);

      // 1. Right turn chevrons (preceding maneuver 0):
      // Must be on outside (left shoulder: offset < 0), point right (variant: 0)
      const rightTurnChevrons = chevrons.filter((c) => c.barIndex < 2);
      expect(rightTurnChevrons.length).toBeGreaterThanOrEqual(2);
      for (const c of rightTurnChevrons) {
        expect(c.variant).toBe(0); // Right: >>>
        expect(c.offset).toBeLessThan(0); // Left shoulder
      }

      // 2. Middle straight section (bars 3 to 4, maneuver 1):
      // Must contain ZERO chevrons! Chevrons must never appear on straights.
      const middleStraightChevrons = chevrons.filter(
        (c) => c.segIndex >= 3.5 * road.segmentsPerBar && c.segIndex < 4.4 * road.segmentsPerBar,
      );
      expect(middleStraightChevrons.length).toBe(0);

      // 3. Left turn chevrons (preceding maneuver 2):
      // Must be on outside (right shoulder: offset > 0), point left (variant: 1)
      const leftTurnChevrons = chevrons.filter((c) => c.barIndex >= 4.5);
      expect(leftTurnChevrons.length).toBeGreaterThanOrEqual(2);
      for (const c of leftTurnChevrons) {
        expect(c.variant).toBe(1); // Left: <<<
        expect(c.offset).toBeGreaterThan(0); // Right shoulder
      }
    });
  });
});
