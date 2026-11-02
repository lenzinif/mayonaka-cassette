import type { BeatMap, SectionRole } from '@src/audio/BeatMap';
import { DEFAULT_SYNTH_BEATMAP } from '@src/audio/FunkAudioEngine';
import { describe, expect, it } from 'vitest';
import { getChunksForRole, ROAD_CHUNKS, validateRoadChunk } from './RoadChunks';
import {
  barToWorldZ,
  generateSongRoad,
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
});
