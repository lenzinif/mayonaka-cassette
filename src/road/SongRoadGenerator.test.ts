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

    it('propagates bridge environment and places suspension towers on bridge chunks', () => {
    const bridgeChunk = ROAD_CHUNKS.find((c) => c.id === 'build-bay-bridge-ascent-8')!;
    expect(bridgeChunk.env).toBe('bridge');

    const road = generateSongRoad(DEFAULT_SYNTH_BEATMAP, { catalog: [bridgeChunk] });
    const bridgeSegments = road.segments.filter((s) => s.env === 'bridge');
    expect(bridgeSegments.length).toBeGreaterThan(0);

    const hasTower = bridgeSegments.some((s) => s.sprites.some((sp) => sp.kind === 'suspension-tower'));
    expect(hasTower).toBe(true);
  });

  it('guarantees straight-ramp build chunks have zero curvature (zero lateral displacement)', () => {
    const straightBuildChunkIds = ['build-skyward-crest-4', 'build-bay-bridge-ascent-8'] as const;
    for (const chunkId of straightBuildChunkIds) {
      const chunk = ROAD_CHUNKS.find((c) => c.id === chunkId)!;
      expect(chunk).toBeDefined();
      expect(chunk.maneuvers.every((m) => m.curve === 0)).toBe(true);

      const road = generateSongRoad(DEFAULT_SYNTH_BEATMAP, { catalog: [chunk] });
      expect(road.segments.every((s) => s.curve === 0)).toBe(true);
      const maxY = Math.max(...road.segments.map((s) => s.p2.worldY));
      expect(maxY).toBeGreaterThan(0);
    }
  });

  describe('Macro A2 Horizon Stitching & Canonical Restoration', () => {
    it('executes zero-pop-in horizon stitching with quantized rumble steps and C1 continuity', () => {
      const road = generateSongRoad(DEFAULT_SYNTH_BEATMAP);
      const drawDistance = 200;
      const rumbleStep = 2 * RUMBLE_LENGTH;
      const copyCount = drawDistance - 24;
      let stitchBar = -1;
      for (let b = 0; b < road.totalBars; b++) {
        const fromIdx = Math.floor((b * road.barLengthWorld) / road.segmentLength);
        const rawDeltaSegs = Math.floor((3.8 * road.barLengthWorld) / road.segmentLength);
        const deltaSegs = rumbleStep * Math.round(rawDeltaSegs / rumbleStep);
        const toIdx = fromIdx + deltaSegs;
        if (deltaSegs < 12 || toIdx + drawDistance + 16 >= road.segments.length) continue;
        let windowValid = true;
        for (let n = 0; n < copyCount; n++) {
          const srcEnv = road.segments[fromIdx + n]?.env ?? 'standard';
          const destEnv = road.canonical.env[toIdx + n] ?? 'standard';
          if (srcEnv === 'bridge' || destEnv === 'bridge' || srcEnv !== destEnv) {
            windowValid = false;
            break;
          }
        }
        if (windowValid) {
          stitchBar = b;
          break;
        }
      }
      expect(stitchBar).toBeGreaterThanOrEqual(0);
      const currentZ = stitchBar * road.barLengthWorld;
      const rawTargetZ = currentZ + 3.8 * road.barLengthWorld;

      const fromSegIndex = Math.floor(currentZ / road.segmentLength);
      // Record visible window geometry before stitch
      const preCurve: number[] = [];
      const preStripe: number[] = [];
      const preDeltaY: number[] = [];
      const preEnv: (string | undefined)[] = [];
      for (let n = 0; n < copyCount; n++) {
        const seg = road.segments[fromSegIndex + n]!;
        preCurve.push(seg.curve);
        preStripe.push(seg.stripe);
        preDeltaY.push(seg.p2.worldY - seg.p1.worldY);
        preEnv.push(seg.env);
      }

      const res = stitchHorizonToTargetZ(road, currentZ, rawTargetZ, drawDistance);
      expect(res).not.toBeNull();
      if (!res) return;

      // 1. deltaZ must be an exact multiple of 2 * RUMBLE_LENGTH * segmentLength (6 * 200 = 1200)
      const rumbleCycleWorld = 2 * RUMBLE_LENGTH * SEGMENT_LENGTH;
      expect(res.deltaZ % rumbleCycleWorld).toBe(0);
      expect(res.copiedWindowSegs).toBe(copyCount);

      // 2. Visible segments match 100% in curve, stripe parity, environment, and relative elevation slope
      for (let n = 0; n < res.copiedWindowSegs; n++) {
        const destSeg = road.segments[res.toSegIndex + n]!;
        expect(destSeg.curve).toBe(preCurve[n]);
        expect(destSeg.stripe).toBe(preStripe[n]);
        expect(destSeg.env).toBe(preEnv[n]);
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
        expect(s.env).toBe(road.canonical.env[i]);
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

      // Rejects stitching when either source or destination visible window overlaps a bridge
      const bridgeSegIdx = road.segments.findIndex((s) => s.env === 'bridge');
      if (bridgeSegIdx >= 0) {
        const onBridgeZ = bridgeSegIdx * road.segmentLength;
        const bridgeRes = stitchHorizonToTargetZ(
          road,
          onBridgeZ,
          onBridgeZ + 2 * road.barLengthWorld,
          drawDistance,
        );
        expect(bridgeRes).toBeNull();
      }
    });
  });

  describe('Curve Warning Chevrons & Delineators (Phase 2)', () => {
    it('places chevrons strictly inside real curves on the outside shoulder, and a diamond warning sign ~1 bar before', () => {
      const testChunkRight: RoadChunk = defineChunk({
        id: 'test-chevron-right-chunk',
        description: 'Test chunk for right curve chevrons and warning sign',
        role: 'drop',
        bars: 4,
        allowMirror: false,
        maneuvers: [
          { bars: 1, curve: 0, elevation: 0 },
          { bars: 3, curve: CURVE.MEDIUM, elevation: 0 },
        ],
        props: [
          { kind: 'chevron', placement: 'outside-curve', everyBeats: 2, band: 'A', offset: 1.3, rhythmic: true },
        ],
      });

      const testChunkLeft: RoadChunk = defineChunk({
        id: 'test-chevron-left-chunk',
        description: 'Test chunk for left curve chevrons and warning sign',
        role: 'drop',
        bars: 4,
        allowMirror: false,
        maneuvers: [
          { bars: 1, curve: 0, elevation: 0 },
          { bars: 3, curve: -CURVE.MEDIUM, elevation: 0 },
        ],
        props: [
          { kind: 'chevron', placement: 'outside-curve', everyBeats: 2, band: 'A', offset: 1.3, rhythmic: true },
        ],
      });

      const customMap: BeatMap = {
        ...DEFAULT_SYNTH_BEATMAP,
        contentHash: 'sha256:chevron-phase2-track',
        barEnergy: new Array<number>(4).fill(0.5), // energy 0.5 => curveScale = 1.0
        sections: [{ startBar: 0, bars: 4, role: 'drop' }],
      };

      // 1. Test Right Turn:
      const roadRight = generateSongRoad(customMap, { catalog: [testChunkRight] });
      const rightChevrons = roadRight.segments.flatMap((s, idx) =>
        s.sprites.filter((sp) => sp.kind === 'chevron').map((sp) => ({ segIndex: idx, curve: s.curve, ...sp })),
      );
      const rightSigns = roadRight.segments.flatMap((s, idx) =>
        s.sprites.filter((sp) => sp.kind === 'sign' && sp.variant === 2).map((sp) => ({ segIndex: idx, curve: s.curve, ...sp })),
      );

      expect(rightChevrons.length).toBeGreaterThanOrEqual(3);
      expect(rightSigns.length).toBe(1);

      // Warning sign ~1 bar before curve start on outside (left) shoulder
      expect(rightSigns[0]?.offset).toBeCloseTo(-1.3, 2);
      expect(Math.abs(rightSigns[0]!.curve)).toBeLessThanOrEqual(0.15);

      // All chevrons must be strictly inside the curve (|curve| >= 0.3 * targetCurve)
      const minThreshold = 0.3 * CURVE.MEDIUM;
      let prevSeq = -1;
      for (const c of rightChevrons) {
        expect(Math.abs(c.curve)).toBeGreaterThanOrEqual(minThreshold);
        expect(c.variant % 2).toBe(0); // Right arrow (0)
        expect(c.offset).toBeCloseTo(-1.3, 2); // Left shoulder (outside)
        const seq = Math.floor(c.variant / 2);
        expect(seq).toBeGreaterThan(prevSeq);
        prevSeq = seq;
      }

      // 2. Test Left Turn:
      const roadLeft = generateSongRoad(customMap, { catalog: [testChunkLeft] });
      const leftChevrons = roadLeft.segments.flatMap((s, idx) =>
        s.sprites.filter((sp) => sp.kind === 'chevron').map((sp) => ({ segIndex: idx, curve: s.curve, ...sp })),
      );
      const leftSigns = roadLeft.segments.flatMap((s, idx) =>
        s.sprites.filter((sp) => sp.kind === 'sign' && sp.variant === 2).map((sp) => ({ segIndex: idx, curve: s.curve, ...sp })),
      );

      expect(leftChevrons.length).toBeGreaterThanOrEqual(3);
      expect(leftSigns.length).toBe(1);

      // Warning sign on outside (right) shoulder
      expect(leftSigns[0]?.offset).toBeCloseTo(1.3, 2);
      expect(Math.abs(leftSigns[0]!.curve)).toBeLessThanOrEqual(0.15);

      prevSeq = -1;
      for (const c of leftChevrons) {
        expect(Math.abs(c.curve)).toBeGreaterThanOrEqual(minThreshold);
        expect(c.variant % 2).toBe(1); // Left arrow (1)
        expect(c.offset).toBeCloseTo(1.3, 2); // Right shoulder (outside)
        const seq = Math.floor(c.variant / 2);
        expect(seq).toBeGreaterThan(prevSeq);
        prevSeq = seq;
      }
    });

    it('places NO chevrons for EASY-only chunks, but places at most one diamond warning sign', () => {
      const easyChunk: RoadChunk = defineChunk({
        id: 'test-easy-chunk',
        description: 'Test chunk with only EASY curves',
        role: 'drop',
        bars: 4,
        allowMirror: false,
        maneuvers: [
          { bars: 1, curve: 0, elevation: 0 },
          { bars: 3, curve: CURVE.EASY, elevation: 0 }, // 2.0 < 4 * 0.85 = 3.4
        ],
        props: [
          { kind: 'chevron', placement: 'outside-curve', everyBeats: 2, band: 'A', offset: 1.3, rhythmic: true },
        ],
      });

      const customMap: BeatMap = {
        ...DEFAULT_SYNTH_BEATMAP,
        contentHash: 'sha256:easy-chunk-track',
        barEnergy: new Array<number>(4).fill(0.5),
        sections: [{ startBar: 0, bars: 4, role: 'drop' }],
      };

      const road = generateSongRoad(customMap, { catalog: [easyChunk] });

      const chevrons = road.segments.flatMap((s) => s.sprites.filter((sp) => sp.kind === 'chevron'));
      const signs = road.segments.flatMap((s) => s.sprites.filter((sp) => sp.kind === 'sign' && sp.variant === 2));

      // Absolutely zero chevrons for EASY curves
      expect(chevrons.length).toBe(0);
      // Exactly 1 diamond warning sign ~1 bar before the curve
      expect(signs.length).toBe(1);
      expect(signs[0]?.offset).toBeCloseTo(-1.3, 2); // Outside shoulder for right curve
    });

    it('places neither signs nor chevrons for very gentle curves (< 1.5)', () => {
      const gentleChunk: RoadChunk = defineChunk({
        id: 'test-gentle-chunk',
        description: 'Test chunk with gentle curve below 1.5',
        role: 'drop',
        bars: 4,
        maneuvers: [
          { bars: 2, curve: 0, elevation: 0 },
          { bars: 2, curve: 1.0, elevation: 0 }, // 1.0 < 1.5
        ],
        props: [
          { kind: 'chevron', placement: 'outside-curve', everyBeats: 2, band: 'A', offset: 1.3, rhythmic: true },
        ],
      });

      const customMap: BeatMap = {
        ...DEFAULT_SYNTH_BEATMAP,
        contentHash: 'sha256:gentle-chunk-track',
        barEnergy: new Array<number>(4).fill(0.5),
        sections: [{ startBar: 0, bars: 4, role: 'drop' }],
      };

      const road = generateSongRoad(customMap, { catalog: [gentleChunk] });

      const chevrons = road.segments.flatMap((s) => s.sprites.filter((sp) => sp.kind === 'chevron'));
      const signs = road.segments.flatMap((s) => s.sprites.filter((sp) => sp.kind === 'sign' && sp.variant === 2));

      expect(chevrons.length).toBe(0);
      expect(signs.length).toBe(0);
    });

    it('scales chevron density between HARD (half-beat) and MEDIUM (1-beat)', () => {
      const medChunk: RoadChunk = defineChunk({
        id: 'test-med-chunk',
        description: 'MEDIUM curve chunk',
        role: 'drop',
        bars: 4,
        maneuvers: [{ bars: 4, curve: CURVE.MEDIUM, elevation: 0 }],
        props: [{ kind: 'chevron', placement: 'outside-curve', everyBeats: 2, band: 'A', offset: 1.3, rhythmic: true }],
      });
      const hardChunk: RoadChunk = defineChunk({
        id: 'test-hard-chunk',
        description: 'HARD curve chunk',
        role: 'drop',
        bars: 4,
        maneuvers: [{ bars: 4, curve: CURVE.HARD, elevation: 0 }],
        props: [{ kind: 'chevron', placement: 'outside-curve', everyBeats: 2, band: 'A', offset: 1.3, rhythmic: true }],
      });

      const customMap: BeatMap = {
        ...DEFAULT_SYNTH_BEATMAP,
        contentHash: 'sha256:density-scale-track',
        barEnergy: new Array<number>(4).fill(0.5),
        sections: [{ startBar: 0, bars: 4, role: 'drop' }],
      };

      const roadMed = generateSongRoad(customMap, { catalog: [medChunk] });
      const roadHard = generateSongRoad(customMap, { catalog: [hardChunk] });

      const chevronsMed = roadMed.segments.flatMap((s) => s.sprites.filter((sp) => sp.kind === 'chevron'));
      const chevronsHard = roadHard.segments.flatMap((s) => s.sprites.filter((sp) => sp.kind === 'chevron'));

      expect(chevronsMed.length).toBeGreaterThan(0);
      // Hard curve (half-beat spacing) has significantly more chevrons than Medium (1-beat spacing)
      expect(chevronsHard.length).toBeGreaterThanOrEqual(chevronsMed.length * 1.5);
    });

    it('scales chevron count with curve duration', () => {
      const shortChunk: RoadChunk = defineChunk({
        id: 'test-short-chunk',
        description: '2-bar curve chunk',
        role: 'drop',
        bars: 4,
        maneuvers: [
          { bars: 2, curve: 0, elevation: 0 },
          { bars: 2, curve: CURVE.MEDIUM, elevation: 0 },
        ],
        props: [{ kind: 'chevron', placement: 'outside-curve', everyBeats: 2, band: 'A', offset: 1.3, rhythmic: true }],
      });
      const longChunk: RoadChunk = defineChunk({
        id: 'test-long-chunk',
        description: '4-bar curve chunk',
        role: 'drop',
        bars: 4,
        maneuvers: [{ bars: 4, curve: CURVE.MEDIUM, elevation: 0 }],
        props: [{ kind: 'chevron', placement: 'outside-curve', everyBeats: 2, band: 'A', offset: 1.3, rhythmic: true }],
      });

      const customMap: BeatMap = {
        ...DEFAULT_SYNTH_BEATMAP,
        contentHash: 'sha256:duration-scale-track',
        barEnergy: new Array<number>(4).fill(0.5),
        sections: [{ startBar: 0, bars: 4, role: 'drop' }],
      };

      const roadShort = generateSongRoad(customMap, { catalog: [shortChunk] });
      const roadLong = generateSongRoad(customMap, { catalog: [longChunk] });

      const chevronsShort = roadShort.segments.flatMap((s) => s.sprites.filter((sp) => sp.kind === 'chevron'));
      const chevronsLong = roadLong.segments.flatMap((s) => s.sprites.filter((sp) => sp.kind === 'chevron'));

      expect(chevronsLong.length).toBeGreaterThan(chevronsShort.length);
    });
  });

  describe('Depth-Band Placement Model (Phase 1)', () => {
    it('is 100% deterministic with jitter and scale variance for the same seed', () => {
      const customMap: BeatMap = {
        ...DEFAULT_SYNTH_BEATMAP,
        contentHash: 'sha256:depth-band-determinism-seed',
      };

      const roadA = generateSongRoad(customMap);
      const roadB = generateSongRoad(customMap);

      expect(roadA.segments.length).toBe(roadB.segments.length);

      let totalSpritesA = 0;
      let scaledSpriteCount = 0;
      for (let i = 0; i < roadA.segments.length; i++) {
        const segA = roadA.segments[i]!;
        const segB = roadB.segments[i]!;

        expect(segA.sprites).toEqual(segB.sprites);
        totalSpritesA += segA.sprites.length;
        for (const s of segA.sprites) {
          if (s.scale !== undefined && s.scale !== 1) {
            scaledSpriteCount++;
          }
        }
      }

      expect(totalSpritesA).toBeGreaterThan(50);
      expect(scaledSpriteCount).toBeGreaterThan(10);
    });

    it('guarantees no shrub ever has |offset| < 1.6 across all canonical chunks', () => {
      for (const chunk of ROAD_CHUNKS) {
        const customMap: BeatMap = {
          ...DEFAULT_SYNTH_BEATMAP,
          contentHash: `sha256:shrub-test-${chunk.id}`,
          barEnergy: new Array<number>(chunk.bars).fill(0.7),
          sections: [{ startBar: 0, bars: chunk.bars, role: chunk.role }],
        };

        const road = generateSongRoad(customMap, { catalog: [chunk] });
        for (const seg of road.segments) {
          for (const s of seg.sprites) {
            if (s.kind === 'shrub') {
              expect(Math.abs(s.offset)).toBeGreaterThanOrEqual(1.6);
            }
          }
        }
      }
    });

    it('generates multiple sprites for cluster rules', () => {
      const clusterChunk = defineChunk({
        id: 'test-cluster-chunk',
        description: 'Test chunk for cluster generation',
        role: 'intro',
        bars: 4,
        maneuvers: [{ bars: 4, curve: 0, elevation: 0 }],
        props: [
          {
            kind: 'shrub',
            placement: 'right',
            everyBeats: 4,
            band: 'B',
            offset: 1.8,
            cluster: { min: 3, max: 5, spreadBeats: 1.0, spreadLateral: 0.3 },
            rhythmic: false,
          },
        ],
      });

      const customMap: BeatMap = {
        ...DEFAULT_SYNTH_BEATMAP,
        contentHash: 'sha256:cluster-test-seed',
        barEnergy: new Array<number>(4).fill(0.5),
        sections: [{ startBar: 0, bars: 4, role: 'intro' }],
      };

      const road = generateSongRoad(customMap, { catalog: [clusterChunk] });
      const shrubs = road.segments.flatMap((seg) => seg.sprites.filter((s) => s.kind === 'shrub'));

      // 4 bars = 16 beats. With everyBeats: 4, there are 4 anchors.
      // With cluster min: 3, max: 5, total shrubs must be between 12 and 20.
      expect(shrubs.length).toBeGreaterThanOrEqual(12);
      expect(shrubs.length).toBeLessThanOrEqual(20);
      for (const sh of shrubs) {
        expect(Math.abs(sh.offset)).toBeGreaterThanOrEqual(1.6);
      }
    });

    it('emits ZERO pylon or jihanki sprites from all canonical chunks', () => {
      for (const chunk of ROAD_CHUNKS) {
        const customMap: BeatMap = {
          ...DEFAULT_SYNTH_BEATMAP,
          contentHash: `sha256:no-pylon-jihanki-${chunk.id}`,
          barEnergy: new Array<number>(chunk.bars).fill(0.7),
          sections: [{ startBar: 0, bars: chunk.bars, role: chunk.role }],
        };

        const road = generateSongRoad(customMap, { catalog: [chunk] });
        for (const seg of road.segments) {
          for (const s of seg.sprites) {
            expect(s.kind).not.toBe('pylon');
            expect(s.kind).not.toBe('jihanki');
          }
        }
      }
    });

    it('keeps bridge chunks free of Band C and Band D props', () => {
      const bridgeChunks = ROAD_CHUNKS.filter((c) => c.env === 'bridge');
      expect(bridgeChunks.length).toBeGreaterThanOrEqual(2);

      for (const chunk of bridgeChunks) {
        const customMap: BeatMap = {
          ...DEFAULT_SYNTH_BEATMAP,
          contentHash: `sha256:bridge-depth-${chunk.id}`,
          barEnergy: new Array<number>(chunk.bars).fill(0.7),
          sections: [{ startBar: 0, bars: chunk.bars, role: chunk.role }],
        };

        const road = generateSongRoad(customMap, { catalog: [chunk] });
        for (const seg of road.segments) {
          for (const s of seg.sprites) {
            // Bridge must be free of Band C and Band D props (|offset| >= 3.0)
            expect(Math.abs(s.offset)).toBeLessThan(3.0);
          }
        }
      }
    });
  });
});
