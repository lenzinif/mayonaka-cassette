import type { BeatMap, SectionRole } from '@src/audio/BeatMap';
import {
  BUNDLED_COASTAL_BEATMAP,
  BUNDLED_WANGAN_BEATMAP,
  DEFAULT_SYNTH_BEATMAP,
} from '@src/audio/FunkAudioEngine';
import { RUMBLE_LENGTH, SEGMENT_LENGTH } from '@src/config/constants';
import { describe, expect, it } from 'vitest';
import { detectMuffledSpans } from './EnvironmentArchetypes';
import { defineChunk, getChunksForRole, ROAD_CHUNKS, type RoadChunk, validateRoadChunk } from './RoadChunks';
import { isOverheadProp } from './RoadSegment';
import { CURVE, HILL } from './TrackBuilder';
import {
  barToWorldZ,
  computeTrackDna,
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

  it('maps elevated stretches to bridge on night/coastal stages and viaduct on akiba_night', () => {
    const bridgeRoad = generateSongRoad(DEFAULT_SYNTH_BEATMAP, { stageId: 'night' });
    const bridgeSegments = bridgeRoad.segments.filter((s) => s.env === 'bridge');
    expect(bridgeSegments.length).toBeGreaterThan(0);

    const hasTower = bridgeSegments.some((s) =>
      s.sprites.some((sp) => sp.kind === 'suspension-tower'),
    );
    expect(hasTower).toBe(true);

    const akibaRoad = generateSongRoad(DEFAULT_SYNTH_BEATMAP, { stageId: 'akiba_night' });
    expect(akibaRoad.segments.some((s) => s.env === 'bridge')).toBe(false);
    expect(akibaRoad.segments.some((s) => s.env === 'viaduct')).toBe(true);
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
        for (let n = 0; n < drawDistance; n++) {
          const srcEnv = road.segments[fromIdx + n]?.env ?? 'standard';
          const destEnv = road.canonical.env[toIdx + n] ?? 'standard';
          if (srcEnv !== 'standard' || destEnv !== 'standard') {
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

    it('preserves exact geometry during overlapping 1.75-bar horizon stitches (deltaSegs < copyCount)', () => {
      const road = generateSongRoad(DEFAULT_SYNTH_BEATMAP);
      const drawDistance = 200;
      const copyCount = drawDistance - 24; // 176

      // Find a standard open-sky window where a 1.75-bar forward stitch (< 176 segments) overlaps its own source
      let stitchBar = -1;
      for (let b = 4; b < road.totalBars - 10; b++) {
        const startSeg = b * road.segmentsPerBar;
        let hasSpecial = false;
        for (let s = 0; s < Math.ceil(1.75 * road.segmentsPerBar) + drawDistance + 16; s++) {
          if ((road.segments[startSeg + s]?.env ?? 'standard') !== 'standard') {
            hasSpecial = true;
            break;
          }
        }
        if (!hasSpecial) {
          stitchBar = b;
          break;
        }
      }

      expect(stitchBar).toBeGreaterThanOrEqual(0);
      const currentZ = stitchBar * road.barLengthWorld;
      const rawTargetZ = currentZ + 1.75 * road.barLengthWorld;

      const preCurve: number[] = [];
      const preDeltaY: number[] = [];
      const preEnv: string[] = [];
      const fromSegIdx = Math.floor(currentZ / road.segmentLength);
      for (let n = 0; n < copyCount; n++) {
        const seg = road.segments[fromSegIdx + n]!;
        preCurve.push(seg.curve);
        preDeltaY.push(seg.p2.worldY - seg.p1.worldY);
        preEnv.push(seg.env ?? 'standard');
      }

      const res = stitchHorizonToTargetZ(road, currentZ, rawTargetZ, drawDistance);
      expect(res).not.toBeNull();
      if (!res) return;

      // Ensure test truly exercises overlapping memmove (deltaSegs < copyCount)
      const deltaSegs = res.toSegIndex - res.fromSegIndex;
      expect(deltaSegs).toBeLessThan(copyCount);
      expect(res.copiedWindowSegs).toBe(copyCount);

      for (let n = 0; n < copyCount; n++) {
        const destSeg = road.segments[res.toSegIndex + n]!;
        expect(destSeg.curve).toBe(preCurve[n]);
        expect(destSeg.env).toBe(preEnv[n]);
        expect(destSeg.p2.worldY - destSeg.p1.worldY).toBeCloseTo(preDeltaY[n]!, 5);
      }

      for (let i = 1; i < road.segments.length; i++) {
        expect(road.segments[i]!.p1.worldY).toBeCloseTo(road.segments[i - 1]!.p2.worldY, 5);
      }
    });

    it('keeps outro tail elevation gentle and returns cleanly to worldY = 0 across all bundled tracks', () => {
      for (const map of [
        DEFAULT_SYNTH_BEATMAP,
        BUNDLED_WANGAN_BEATMAP,
        BUNDLED_COASTAL_BEATMAP,
      ]) {
        const road = generateSongRoad(map);
        const segs = road.segments;
        expect(segs[segs.length - 1]!.p2.worldY).toBeCloseTo(0, 5);

        // Final 2 bars leading into the next stage must have gentle highway grade (no vertical wall climb)
        const finalTwoBarsStart = Math.max(0, segs.length - road.segmentsPerBar * 2);
        for (let i = finalTwoBarsStart; i < segs.length; i++) {
          const slopeUnits = Math.abs(segs[i]!.p2.worldY - segs[i]!.p1.worldY);
          expect(slopeUnits).toBeLessThanOrEqual(60);
        }
        // Very last segments arriving at the portal must level flat into the horizon
        const lastSlope = Math.abs(
          segs[segs.length - 1]!.p2.worldY - segs[segs.length - 1]!.p1.worldY,
        );
        expect(lastSlope).toBeLessThan(5);
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
        elevationIntent: 'flat',
        allowedStructures: ['standard'],
        styleTags: ['wangan'],
        fixtureCadenceBeats: 2,
        trafficProfile: 'normal',
        maneuvers: [
          { bars: 1, curve: 0, elevation: 0 },
          { bars: 3, curve: CURVE.MEDIUM, elevation: 0 },
        ],
      });

      const testChunkLeft: RoadChunk = defineChunk({
        id: 'test-chevron-left-chunk',
        description: 'Test chunk for left curve chevrons and warning sign',
        role: 'drop',
        bars: 4,
        allowMirror: false,
        elevationIntent: 'flat',
        allowedStructures: ['standard'],
        styleTags: ['wangan'],
        fixtureCadenceBeats: 2,
        trafficProfile: 'normal',
        maneuvers: [
          { bars: 1, curve: 0, elevation: 0 },
          { bars: 3, curve: -CURVE.MEDIUM, elevation: 0 },
        ],
      });

      const customMap: BeatMap = {
        ...DEFAULT_SYNTH_BEATMAP,
        contentHash: 'sha256:chevron-phase2-track',
        barEnergy: new Array<number>(4).fill(0.5), // energy 0.5 => curveScale = 1.0
        barBrightness: new Array<number>(4).fill(0.8),
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
        elevationIntent: 'flat',
        allowedStructures: ['standard'],
        styleTags: ['cruise'],
        fixtureCadenceBeats: 2,
        trafficProfile: 'sparse',
        maneuvers: [
          { bars: 1, curve: 0, elevation: 0 },
          { bars: 3, curve: CURVE.EASY, elevation: 0 }, // 2.0 < 4 * 0.85 = 3.4
        ],
      });

      const customMap: BeatMap = {
        ...DEFAULT_SYNTH_BEATMAP,
        contentHash: 'sha256:easy-chunk-track',
        barEnergy: new Array<number>(4).fill(0.5),
        barBrightness: new Array<number>(4).fill(0.8),
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
        elevationIntent: 'flat',
        allowedStructures: ['standard'],
        styleTags: ['cruise'],
        fixtureCadenceBeats: 2,
        trafficProfile: 'sparse',
        maneuvers: [
          { bars: 2, curve: 0, elevation: 0 },
          { bars: 2, curve: 1.0, elevation: 0 }, // 1.0 < 1.5
        ],
      });

      const customMap: BeatMap = {
        ...DEFAULT_SYNTH_BEATMAP,
        contentHash: 'sha256:gentle-chunk-track',
        barEnergy: new Array<number>(4).fill(0.5),
        barBrightness: new Array<number>(4).fill(0.8),
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
        elevationIntent: 'flat',
        allowedStructures: ['standard'],
        styleTags: ['technical'],
        fixtureCadenceBeats: 2,
        trafficProfile: 'sparse',
        maneuvers: [{ bars: 4, curve: CURVE.MEDIUM, elevation: 0 }],
      });
      const hardChunk: RoadChunk = defineChunk({
        id: 'test-hard-chunk',
        description: 'HARD curve chunk',
        role: 'drop',
        bars: 4,
        elevationIntent: 'flat',
        allowedStructures: ['standard'],
        styleTags: ['technical'],
        fixtureCadenceBeats: 2,
        trafficProfile: 'sparse',
        maneuvers: [{ bars: 4, curve: CURVE.HARD, elevation: 0 }],
      });

      const customMap: BeatMap = {
        ...DEFAULT_SYNTH_BEATMAP,
        contentHash: 'sha256:density-scale-track',
        barEnergy: new Array<number>(4).fill(0.5),
        barBrightness: new Array<number>(4).fill(0.8),
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
        elevationIntent: 'flat',
        allowedStructures: ['standard'],
        styleTags: ['wangan'],
        fixtureCadenceBeats: 2,
        trafficProfile: 'normal',
        maneuvers: [
          { bars: 2, curve: 0, elevation: 0 },
          { bars: 2, curve: CURVE.MEDIUM, elevation: 0 },
        ],
      });
      const longChunk: RoadChunk = defineChunk({
        id: 'test-long-chunk',
        description: '4-bar curve chunk',
        role: 'drop',
        bars: 4,
        elevationIntent: 'flat',
        allowedStructures: ['standard'],
        styleTags: ['wangan'],
        fixtureCadenceBeats: 2,
        trafficProfile: 'normal',
        maneuvers: [{ bars: 4, curve: CURVE.MEDIUM, elevation: 0 }],
      });

      const customMap: BeatMap = {
        ...DEFAULT_SYNTH_BEATMAP,
        contentHash: 'sha256:duration-scale-track',
        barEnergy: new Array<number>(4).fill(0.5),
        barBrightness: new Array<number>(4).fill(0.8),
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

    it('generates organic multi-sprite shrub clusters on coastal & semiurban roads', () => {
      const road = generateSongRoad(BUNDLED_COASTAL_BEATMAP, {
        seed: 'cluster-test-seed',
        stageId: 'og_future_funk',
      });
      const shrubs = road.segments.flatMap((seg) => seg.sprites.filter((s) => s.kind === 'shrub'));

      expect(shrubs.length).toBeGreaterThan(10);
      for (const sh of shrubs) {
        expect(Math.abs(sh.offset)).toBeGreaterThanOrEqual(1.6);
      }
    });

    it('keeps RoadChunk definitions strictly pure choreography with zero props, vignettes, or env fields', () => {
      for (const chunk of ROAD_CHUNKS) {
        expect('props' in chunk).toBe(false);
        expect('vignettes' in chunk).toBe(false);
        expect('env' in chunk).toBe(false);
        expect(chunk.allowedStructures.length).toBeGreaterThan(0);
        expect(chunk.styleTags.length).toBeGreaterThan(0);
      }
    });

    it('keeps bridge segments free of Band C and Band D props', () => {
      for (const stageId of ['night', 'og_future_funk'] as const) {
        const road = generateSongRoad(DEFAULT_SYNTH_BEATMAP, { stageId });
        const bridgeSegs = road.segments.filter((s) => s.env === 'bridge');
        expect(bridgeSegs.length).toBeGreaterThan(0);
        for (const seg of bridgeSegs) {
          for (const s of seg.sprites) {
            expect(Math.abs(s.offset)).toBeLessThan(3.0);
          }
        }
      }
    });
  });

  describe('Phase A & Phase C — Continuous Curves, Contracts, Track DNA, and Muffled Tunnels', () => {
    it('maintains C0/C1 continuity across blendToNext double-apex and tightening curves without resetting to 0', () => {
      const doubleApexChunk = ROAD_CHUNKS.find((c) => c.id === 'drop-wangan-double-apex-8')!;
      expect(doubleApexChunk).toBeDefined();

      const customMap: BeatMap = {
        ...DEFAULT_SYNTH_BEATMAP,
        contentHash: 'sha256:blend-to-next-test',
        barEnergy: new Array<number>(8).fill(0.75),
        barBrightness: new Array<number>(8).fill(0.85),
        sections: [{ startBar: 0, bars: 8, role: 'drop' }],
      };

      const road = generateSongRoad(customMap, { catalog: [doubleApexChunk] });
      // Between maneuver 0 (2 bars) and maneuver 1 (3 bars), curvature stays strictly non-zero in same direction
      const seamSegIdx = Math.round(2 * road.segmentsPerBar);
      const windowCurves = road.segments
        .slice(seamSegIdx - 3, seamSegIdx + 4)
        .map((s) => Math.abs(s.curve));
      for (const c of windowCurves) {
        expect(c).toBeGreaterThan(1.0);
      }

      // Smooth C1 derivative: no abrupt curve step > 1.5 between consecutive segments anywhere
      for (let i = 1; i < road.segments.length; i++) {
        expect(Math.abs(road.segments[i]!.curve - road.segments[i - 1]!.curve)).toBeLessThan(1.5);
      }
    });

    it('keeps breakdown technical curves responsive even at low barEnergy (role-aware modulation)', () => {
      const breakdownChunk = ROAD_CHUNKS.find((c) => c.id === 'breakdown-touge-s-bends')!;
      const lowEnergyMap: BeatMap = {
        ...DEFAULT_SYNTH_BEATMAP,
        contentHash: 'sha256:breakdown-low-energy',
        barEnergy: new Array<number>(8).fill(0.15),
        barBrightness: new Array<number>(8).fill(0.7),
        sections: [{ startBar: 0, bars: 8, role: 'breakdown' }],
      };
      const midEnergyMap: BeatMap = {
        ...lowEnergyMap,
        barEnergy: new Array<number>(8).fill(0.55),
      };

      const roadLow = generateSongRoad(lowEnergyMap, { catalog: [breakdownChunk] });
      const roadMid = generateSongRoad(midEnergyMap, { catalog: [breakdownChunk] });

      const peakLow = Math.max(...roadLow.segments.map((s) => Math.abs(s.curve)));
      const peakMid = Math.max(...roadMid.segments.map((s) => Math.abs(s.curve)));

      // At low breakdown energy (0.15), curves remain >= 85% of mid-energy strength (never flattened to 0.4x!)
      expect(peakLow).toBeGreaterThanOrEqual(peakMid * 0.85);
    });

    it('enforces pre-drop crest contracts on intro->drop and breakdown->drop transitions and selects postCrestReveal', () => {
      const map: BeatMap = {
        ...DEFAULT_SYNTH_BEATMAP,
        contentHash: 'sha256:intro-to-drop-crest',
        barEnergy: [
          ...new Array<number>(8).fill(0.35), // intro
          ...new Array<number>(12).fill(0.85), // drop 1
          ...new Array<number>(8).fill(0.35), // breakdown
          ...new Array<number>(12).fill(0.9), // drop 2
          ...new Array<number>(4).fill(0.3), // outro
        ],
        barBrightness: new Array<number>(44).fill(0.82),
        sections: [
          { startBar: 0, bars: 8, role: 'intro' },
          { startBar: 8, bars: 12, role: 'drop' },
          { startBar: 20, bars: 8, role: 'breakdown' },
          { startBar: 28, bars: 12, role: 'drop' },
          { startBar: 40, bars: 4, role: 'outro' },
        ],
      };

      const road = generateSongRoad(map);
      // Both drop entries at bar 8 and bar 28 must have climbed onto a crest beforehand
      for (const dropBar of [8, 28]) {
        const dropSeg = dropBar * road.segmentsPerBar;
        const yBefore = road.segments[(dropBar - 4) * road.segmentsPerBar]!.p1.worldY;
        const yAtCrest = road.segments[dropSeg - 1]!.p2.worldY;
        expect(yAtCrest).toBeGreaterThan(yBefore + 3000);

        const firstDropChunk = road.chunks.find((c) => c.startBar === dropBar)!;
        const chunkDef = ROAD_CHUNKS.find((c) => c.id === firstDropChunk.chunkId)!;
        expect(chunkDef.postCrestReveal).toBe(true);
      }
    });

    it('computes deterministic Track DNA prioritizing cruise/scenic for chill tracks and wangan for fast tracks', () => {
      const chillMap: BeatMap = {
        ...DEFAULT_SYNTH_BEATMAP,
        bpm: 102,
        barEnergy: new Array<number>(32).fill(0.32),
      };
      const fastMap: BeatMap = {
        ...DEFAULT_SYNTH_BEATMAP,
        bpm: 136,
        barEnergy: new Array<number>(32).fill(0.84),
      };

      const chillDna = computeTrackDna(chillMap);
      const fastDna = computeTrackDna(fastMap);

      expect(chillDna.styleWeights.cruise).toBeGreaterThan(chillDna.styleWeights.wangan);
      expect(fastDna.styleWeights.wangan).toBeGreaterThan(fastDna.styleWeights.cruise);
    });

    it('maps muffled spans (>= 4 bars) to env === "tunnel" aligned with drop downbeat and blocks horizon stitch across tunnels/viaducts', () => {
      const road = generateSongRoad(DEFAULT_SYNTH_BEATMAP, { stageId: 'night' });
      // Neon Horizon has muffledSpans: [[40, 44]] before Drop 2 at bar 44
      expect(road.tunnelSpans).toEqual([{ startBar: 40, endBar: 44 }]);

      const tunnelStartSeg = 40 * road.segmentsPerBar;
      const tunnelEndSeg = 44 * road.segmentsPerBar;
      for (let s = tunnelStartSeg; s < tunnelEndSeg; s++) {
        const seg = road.segments[s]!;
        expect(seg.env).toBe('tunnel');
        // Zero freestanding props inside tunnel bores (curve guidance is rendered flush on tunnel walls)
        expect(seg.sprites).toEqual([]);
      }
      // Portal approach/exit clearance: 2 open segments before entrance & 1 after exit have no Band A/B or overhead props
      for (const adjIdx of [tunnelStartSeg - 2, tunnelStartSeg - 1, tunnelEndSeg]) {
        const adj = road.segments[adjIdx]!;
        expect(adj.env).not.toBe('tunnel');
        for (const sp of adj.sprites) {
          expect(isOverheadProp(sp.kind)).toBe(false);
          expect(Math.abs(sp.offset)).toBeGreaterThanOrEqual(3.0);
        }
      }
      // Drop entry segment right after tunnel exit is back to open sky!
      expect(road.segments[tunnelEndSeg]!.env).not.toBe('tunnel');

      // Horizon stitch guard blocks stitching while on tunnel or viaduct
      const tunnelZ = tunnelStartSeg * road.segmentLength;
      expect(
        stitchHorizonToTargetZ(road, tunnelZ, tunnelZ + 2 * road.barLengthWorld, 200),
      ).toBeNull();

      const akibaRoad = generateSongRoad(DEFAULT_SYNTH_BEATMAP, { stageId: 'akiba_night' });
      const viaductSeg = akibaRoad.segments.findIndex((s) => s.env === 'viaduct');
      expect(viaductSeg).toBeGreaterThanOrEqual(0);
      expect(
        stitchHorizonToTargetZ(
          akibaRoad,
          viaductSeg * akibaRoad.segmentLength,
          (viaductSeg + 2 * akibaRoad.segmentsPerBar) * akibaRoad.segmentLength,
          200,
        ),
      ).toBeNull();
    });
  });

  it('prevents cumulative elevation runaway and clamps build heights across multi-drop tracks (MP-04)', () => {
    const longMultiDropMap: BeatMap = {
      version: 1,
      contentHash: 'sha256:mp04-long-elevation-test',
      title: 'Long Multi-Drop Endurance',
      artist: 'Test',
      bpm: 124,
      beatsPerBar: 4,
      firstBeatOffsetSec: 0,
      durationSec: (128 * 4 * 60) / 124,
      source: 'bundled',
      confidence: { tempo: 1, downbeat: 1, tempoStable: true },
      barEnergy: Array.from({ length: 128 }, () => 0.8),
      sections: [
        { startBar: 0, bars: 8, role: 'intro' },
        { startBar: 8, bars: 16, role: 'build' },
        { startBar: 24, bars: 20, role: 'drop' },
        { startBar: 44, bars: 4, role: 'breakdown' },
        { startBar: 48, bars: 16, role: 'build' },
        { startBar: 64, bars: 20, role: 'drop' },
        { startBar: 84, bars: 4, role: 'breakdown' },
        { startBar: 88, bars: 16, role: 'build' },
        { startBar: 104, bars: 16, role: 'drop' },
        { startBar: 120, bars: 8, role: 'outro' },
      ],
    };

    const road = generateSongRoad(longMultiDropMap);
    let maxAbsY = 0;
    for (const seg of road.segments) {
      maxAbsY = Math.max(maxAbsY, Math.abs(seg.p2.worldY));
    }
    expect(maxAbsY).toBeLessThan(20000);
    expect(Math.abs(road.segments[road.segments.length - 1]!.p2.worldY)).toBeCloseTo(0, 3);

    for (const map of [DEFAULT_SYNTH_BEATMAP, BUNDLED_WANGAN_BEATMAP, BUNDLED_COASTAL_BEATMAP]) {
      const r = generateSongRoad(map);
      const peakY = Math.max(...r.segments.map((s) => Math.abs(s.p2.worldY)));
      expect(peakY).toBeLessThan(20000);
    }
  });

  it('sorts segment sprites statically by descending |offset| with overhead portals last and preserves canonical order (Phase 4)', () => {
    for (const map of [DEFAULT_SYNTH_BEATMAP, BUNDLED_WANGAN_BEATMAP, BUNDLED_COASTAL_BEATMAP]) {
      const roadA = generateSongRoad(map, { seed: 'phase4-order-seed' });
      const roadB = generateSongRoad(map, { seed: 'phase4-order-seed' });

      let checkedMultiSpriteSegs = 0;
      for (let i = 0; i < roadA.segments.length; i++) {
        const sprites = roadA.segments[i]!.sprites;
        expect(sprites).toEqual(roadB.segments[i]!.sprites);
        expect(sprites).toEqual(roadA.canonical.sprites[i]);

        if (sprites.length > 1) {
          checkedMultiSpriteSegs++;
          for (let k = 0; k < sprites.length - 1; k++) {
            const curr = sprites[k]!;
            const next = sprites[k + 1]!;
            const currOver = isOverheadProp(curr.kind);
            const nextOver = isOverheadProp(next.kind);
            if (!currOver && !nextOver) {
              expect(Math.abs(curr.offset)).toBeGreaterThanOrEqual(Math.abs(next.offset) - 1e-6);
            }
            if (currOver) {
              expect(nextOver).toBe(true);
            }
          }
        }
      }
      expect(checkedMultiSpriteSegs).toBeGreaterThan(0);
    }
  });

  describe('Code Review Regression Invariants (C1, M3, M6, M7, M8, S1, S2)', () => {
    it('C1 & S1: preserves open-sky scenery in mixed chunks with partial tunnels and stamps beat-synced tunnelLight markers', () => {
      // Muffled span at bars [12, 16] while 8-bar breakdown spans [8, 16] (bars 8..12 open, 12..16 tunnel)
      const bright = new Array<number>(36).fill(0.82);
      for (let b = 12; b < 16; b++) bright[b] = 0.1;

      const map: BeatMap = {
        ...DEFAULT_SYNTH_BEATMAP,
        contentHash: 'sha256:partial-tunnel-chunk-c1',
        barEnergy: new Array<number>(36).fill(0.45),
        barBrightness: bright,
        sections: [
          { startBar: 0, bars: 8, role: 'intro' },
          { startBar: 8, bars: 8, role: 'breakdown' },
          { startBar: 16, bars: 12, role: 'drop' },
          { startBar: 28, bars: 8, role: 'outro' },
        ],
      };

      const road = generateSongRoad(map, { stageId: 'night' });
      expect(road.tunnelSpans).toEqual([{ startBar: 12, endBar: 16 }]);

      // Even if a chunk straddles bar 8..16 (partial tunnel on [12, 16]), open bars [8, 12) must still receive Band A/B/C/D props!
      const openSegStart = 8 * road.segmentsPerBar;
      const openSegEnd = 12 * road.segmentsPerBar;
      let openSceneryCount = 0;
      for (let s = openSegStart; s < openSegEnd; s++) {
        expect(road.segments[s]!.env).toBe('standard');
        openSceneryCount += road.segments[s]!.sprites.filter((sp) => sp.kind !== 'chevron').length;
      }
      expect(openSceneryCount).toBeGreaterThan(5);

      // Inside tunnel [12, 16), zero freestanding props, and tunnelLight marks appear cleanly at beat/cadence stride
      const tunStart = 12 * road.segmentsPerBar;
      const tunEnd = 16 * road.segmentsPerBar;
      let tunnelLightCount = 0;
      for (let s = tunStart; s < tunEnd; s++) {
        const seg = road.segments[s]!;
        expect(seg.env).toBe('tunnel');
        expect(seg.sprites).toEqual([]);
        if (seg.tunnelLight) tunnelLightCount++;
      }
      // 4 bars = 16 beats; with cadence 1 or 2 beats, expect 8..16 beat-synced lights (far fewer than % 4's ~88)
      expect(tunnelLightCount).toBeGreaterThanOrEqual(4);
      expect(tunnelLightCount).toBeLessThanOrEqual(20);
    });

    it('M3: blocks stitchHorizonToTargetZ when a special structure falls inside the 24-segment blend zone', () => {
      const road = generateSongRoad(DEFAULT_SYNTH_BEATMAP, { stageId: 'night' });
      const drawDistance = 200;
      const rumbleStep = 2 * RUMBLE_LENGTH;
      // Neon Horizon has tunnel at bar 40 (`40 * segmentsPerBar`)
      const tunnelSeg = 40 * road.segmentsPerBar;
      // Pick toIdx so tunnelSeg lands strictly inside [toIdx + (drawDistance - 24), toIdx + drawDistance - 1]
      const targetToSeg = tunnelSeg - (drawDistance - 12);
      const rawDelta = Math.max(rumbleStep * 3, 2 * road.segmentsPerBar);
      const alignedDelta = rumbleStep * Math.round(rawDelta / rumbleStep);
      const fromSeg = targetToSeg - alignedDelta;
      expect(fromSeg).toBeGreaterThanOrEqual(0);
      // Confirm source window itself is all standard
      let fromAllStandard = true;
      for (let n = 0; n < drawDistance; n++) {
        if ((road.segments[fromSeg + n]?.env ?? 'standard') !== 'standard') {
          fromAllStandard = false;
          break;
        }
      }
      if (fromAllStandard) {
        const currentZ = fromSeg * road.segmentLength;
        const targetZ = (fromSeg + alignedDelta) * road.segmentLength;
        expect(stitchHorizonToTargetZ(road, currentZ, targetZ, drawDistance)).toBeNull();
      }
    });

    it('M6 & Minor#3: detectMuffledSpans rejects all-zero brightness and trims 4-bar muffled intro [0, 4] to [1, 4]', () => {
      const zeroMap: BeatMap = {
        ...DEFAULT_SYNTH_BEATMAP,
        barBrightness: new Array<number>(32).fill(0),
        sections: [{ startBar: 0, bars: 32, role: 'drop' }],
      };
      expect(detectMuffledSpans(zeroMap, 32)).toEqual([]);

      const uniformBrightMap: BeatMap = {
        ...DEFAULT_SYNTH_BEATMAP,
        barBrightness: new Array<number>(32).fill(0.9),
      };
      expect(detectMuffledSpans(uniformBrightMap, 32)).toEqual([]);

      const introMuffledMap: BeatMap = {
        ...DEFAULT_SYNTH_BEATMAP,
        barBrightness: [0.1, 0.12, 0.12, 0.15, ...new Array<number>(28).fill(0.85)],
        sections: [
          { startBar: 0, bars: 4, role: 'intro' },
          { startBar: 4, bars: 28, role: 'drop' },
        ],
      };
      expect(detectMuffledSpans(introMuffledMap, 32)).toEqual([{ startBar: 1, endBar: 4 }]);
    });

    it('M7: muffled breakdowns strictly select tunnel-compatible chunks', () => {
      const bright = new Array<number>(48).fill(0.85);
      for (let b = 16; b < 28; b++) bright[b] = 0.12;
      const map: BeatMap = {
        ...DEFAULT_SYNTH_BEATMAP,
        contentHash: 'sha256:muffled-breakdown-strict-m7',
        barEnergy: new Array<number>(48).fill(0.45),
        barBrightness: bright,
        sections: [
          { startBar: 0, bars: 8, role: 'intro' },
          { startBar: 8, bars: 8, role: 'drop' },
          { startBar: 16, bars: 12, role: 'breakdown' },
          { startBar: 28, bars: 12, role: 'drop' },
          { startBar: 40, bars: 8, role: 'outro' },
        ],
      };

      const road = generateSongRoad(map, { stageId: 'night' });
      const breakdownChunks = road.chunks.filter((c) => c.role === 'breakdown');
      expect(breakdownChunks.length).toBeGreaterThan(0);
      for (const c of breakdownChunks) {
        expect(c.allowedStructures).toContain('tunnel');
      }
    });

    it('M8: never places drop-marker billboards on bridge or viaduct segments', () => {
      for (const stageId of ['night', 'akiba_night'] as const) {
        for (const map of [DEFAULT_SYNTH_BEATMAP, BUNDLED_WANGAN_BEATMAP, BUNDLED_COASTAL_BEATMAP]) {
          const road = generateSongRoad(map, { stageId });
          for (const dm of road.dropMarkers) {
            const seg = road.segments[dm.segmentIndex]!;
            if (seg.env !== 'standard') {
              const hasBillboard = seg.sprites.some((sp) => sp.kind === 'billboard');
              expect(hasBillboard).toBe(false);
            }
          }
        }
      }
    });

    it('S2: outro retains authorial elevation contour before fork approach and finishes cleanly at worldY = 0', () => {
      const hillyOutroChunk: RoadChunk = defineChunk({
        id: 'outro-hilly-test-8',
        description: 'Outro con dosso espressivo pre-bivio',
        role: 'outro',
        bars: 8,
        elevationIntent: 'rolling',
        allowedStructures: ['standard'],
        styleTags: ['scenic'],
        fixtureCadenceBeats: 4,
        trafficProfile: 'sparse',
        maneuvers: [
          { bars: 2, curve: 0, elevation: HILL.HIGH },
          { bars: 2, curve: CURVE.EASY, elevation: -HILL.HIGH },
          { bars: 4, curve: 0, elevation: 0 },
        ],
      });

      const customMap: BeatMap = {
        ...DEFAULT_SYNTH_BEATMAP,
        contentHash: 'sha256:s2-outro-hills',
        barEnergy: new Array<number>(16).fill(0.5),
        barBrightness: new Array<number>(16).fill(0.8),
        sections: [
          { startBar: 0, bars: 8, role: 'drop' },
          { startBar: 8, bars: 8, role: 'outro' },
        ],
      };

      const dropHillyChunk: RoadChunk = defineChunk({
        id: 'drop-flat-test-8',
        description: 'Flat drop before outro',
        role: 'drop',
        bars: 8,
        elevationIntent: 'flat',
        allowedStructures: ['standard'],
        styleTags: ['cruise'],
        fixtureCadenceBeats: 2,
        trafficProfile: 'sparse',
        maneuvers: [{ bars: 8, curve: 0, elevation: 0 }],
      });

      const road = generateSongRoad(customMap, { catalog: [dropHillyChunk, hillyOutroChunk] });
      const outroStartSeg = 8 * road.segmentsPerBar;
      const forkStartSeg = 12 * road.segmentsPerBar;
      let peakPreForkY = 0;
      for (let s = outroStartSeg; s < forkStartSeg; s++) {
        peakPreForkY = Math.max(peakPreForkY, road.segments[s]!.p2.worldY);
      }
      // Additive tail steering preserves the authorial HILL.HIGH outro bump (~12000) before fork
      expect(peakPreForkY).toBeGreaterThan(8000);
      expect(road.segments[road.segments.length - 1]!.p2.worldY).toBeCloseTo(0, 3);
    });

    it('caps slope and attenuates CURVE.HARD on compressed 1-3 bar pre-drop climbs and breakdown->drop transitions', () => {
      const customMap: BeatMap = {
        ...DEFAULT_SYNTH_BEATMAP,
        contentHash: 'sha256:compressed-pre-drop-slope-and-curve-safety',
        bpm: 134,
        barEnergy: new Array<number>(28).fill(0.8),
        barBrightness: new Array<number>(28).fill(0.8),
        sections: [
          { startBar: 0, bars: 1, role: 'intro' },      // 1-bar compressed intro -> drop
          { startBar: 1, bars: 11, role: 'drop' },
          { startBar: 12, bars: 5, role: 'breakdown' }, // 4-bar + 1-bar compressed tail -> drop
          { startBar: 17, bars: 4, role: 'drop' },
          { startBar: 21, bars: 3, role: 'breakdown' }, // 3-bar compressed breakdown -> drop
          { startBar: 24, bars: 4, role: 'drop' },
        ],
      };

      const road = generateSongRoad(customMap);

      let maxAbsSlope = 0;
      for (let i = 0; i < road.segments.length; i++) {
        const seg = road.segments[i]!;
        const slope = (seg.p2.worldY - seg.p1.worldY) / road.segmentLength;
        maxAbsSlope = Math.max(maxAbsSlope, Math.abs(slope));
      }
      // Physical grade ceiling keeps every segment <= 0.50 even on 1-bar compressed pre-drop chunks
      expect(maxAbsSlope).toBeLessThanOrEqual(0.5);

      // Breakdown->drop pre-drop climb chunks must never apply CURVE.HARD (> 2.4) on uphill crests
      for (const ch of road.chunks) {
        if (ch.role !== 'breakdown') continue;
        const nextBar = ch.startBar + ch.bars;
        const isPreDrop = road.dropMarkers.some((dm) => dm.barIndex === nextBar);
        if (!isPreDrop) continue;
        let maxUphillCurve = 0;
        for (let s = ch.startSegment; s < ch.startSegment + ch.segmentCount; s++) {
          maxUphillCurve = Math.max(maxUphillCurve, Math.abs(road.segments[s]!.curve));
        }
        expect(maxUphillCurve).toBeLessThanOrEqual(2.4);
      }
    });
  });
});
