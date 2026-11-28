import { describe, expect, it } from 'vitest';
import type { BeatMap } from '@src/audio/BeatMap';
import { DEFAULT_TUNING } from '@src/config/tuning';
import {
  DEFAULT_SYNTH_BEATMAP,
  BUNDLED_WANGAN_BEATMAP,
  BUNDLED_COASTAL_BEATMAP,
} from '@src/audio/FunkAudioEngine';
import { ALL_PROP_KINDS } from './PropRegistry';
import { auditPropRegistry, auditTrackProps } from './PropAuditor';
import { compileSongBlueprint } from './SongBlueprint';
import { HorizonAssembler } from './HorizonAssembler';
import { createPoint, type RoadSegment, type Track } from './RoadSegment';
import { generateSongRoad } from './SongRoadGenerator';
import { drawProp } from './RoadsideProps';

function createMuffledAndBridgeBeatMap(seedTag: string): BeatMap {
  const bpm = 124;
  const totalBars = 48;
  const barDur = (60 / bpm) * 4;
  const barEnergy = new Array<number>(totalBars);
  const barBrightness = new Array<number>(totalBars);
  for (let b = 0; b < totalBars; b++) {
    barEnergy[b] = b < 8 ? 0.35 : b < 16 ? 0.62 : b < 32 ? 0.88 : b < 40 ? 0.42 : 0.78;
    // Create a clear muffled tunnel passage in bars 32..38
    barBrightness[b] = b >= 32 && b < 38 ? 0.14 : 0.82;
  }
  return {
    ...DEFAULT_SYNTH_BEATMAP,
    contentHash: `sha256:audit-${seedTag}`,
    title: `Audit Track (${seedTag})`,
    bpm,
    durationSec: totalBars * barDur,
    barEnergy,
    barBrightness,
    spectralSpans: [{ startBar: 32, endBar: 38, kind: 'lpf_muffled' }],
    sections: [
      { startBar: 0, bars: 8, role: 'intro' },
      { startBar: 8, bars: 8, role: 'build' },
      { startBar: 16, bars: 16, role: 'drop' },
      { startBar: 32, bars: 8, role: 'breakdown' },
      { startBar: 40, bars: 8, role: 'outro' },
    ],
  };
}

describe('Prop Consistency Audit Suite (audit:props)', () => {
  it('verifies exhaustive PROP_REGISTRY contracts for every PropKind', () => {
    const violations = auditPropRegistry();
    expect(violations).toEqual([]);
  });

  it('guarantees zero prop violations across static roads (SongRoadGenerator) in all palettes/archetypes', () => {
    const maps = [
      DEFAULT_SYNTH_BEATMAP,
      BUNDLED_WANGAN_BEATMAP,
      BUNDLED_COASTAL_BEATMAP,
      createMuffledAndBridgeBeatMap('static'),
    ];
    const palettes = ['night', 'akiba_night', 'og_future_funk'] as const;

    for (const beatMap of maps) {
      for (const stageId of palettes) {
        const road = generateSongRoad(beatMap, { stageId });
        const report = auditTrackProps(road, { checkDiversity: true });
        expect(report.inspectedSegments).toBeGreaterThan(100);
        expect(report.errors).toEqual([]);
      }
    }
  });

  it('guarantees zero prop violations across streamed roads (HorizonAssembler) over full runs', () => {
    const beatMap = createMuffledAndBridgeBeatMap('streaming');
    const stageIds = ['night', 'akiba_night', 'vaporfunk'] as const;

    for (const stageId of stageIds) {
      const bp = compileSongBlueprint(beatMap, { stageId });
      const assembler = new HorizonAssembler(bp, null);
      const stepWorld = 2400; // 12 segments per step
      for (let step = 0; step < 65; step++) {
        const pos = step * stepWorld;
        const approxBar = Math.min(bp.totalBars - 0.1, (step / 65) * bp.totalBars);
        assembler.advance(pos, approxBar, bp.referenceSpeed, DEFAULT_TUNING.drawDistance, 1 / 12);
        const report = auditTrackProps(assembler.track, { checkDiversity: true });
        expect(report.errors).toEqual([]);
      }
    }
  });

  it('rebases pendingClusters and suspension-tower margins across promoteNextStage, rebaseOrigin, and 2.5x compression', () => {
    const beatMap = createMuffledAndBridgeBeatMap('multi-stage');
    const bp1 = compileSongBlueprint(beatMap, { stageId: 'og_future_funk' });
    const bp2 = compileSongBlueprint(BUNDLED_WANGAN_BEATMAP, { stageId: 'night' });
    const assembler = new HorizonAssembler(bp1, bp2);

    // Drive slowly (~0.38x reference speed) across a bridge span to engage heavy segment compression
    let pos = 0;
    const slowSpeed = bp1.referenceSpeed * 0.38;
    for (let step = 0; step < 45; step++) {
      const approxBar = (step / 45) * bp1.totalBars;
      assembler.advance(pos, approxBar, slowSpeed, DEFAULT_TUNING.drawDistance, 1 / 10);
      const report = auditTrackProps(assembler.track, { checkDiversity: false });
      expect(report.errors).toEqual([]);
      pos += slowSpeed * (1 / 10);
    }

    // Advance into end-of-stage lookahead then promote Stage 2 and exercise rebaseOrigin
    assembler.resetAtBar(bp1.totalBars - 2, 0, bp1, bp2, DEFAULT_TUNING.drawDistance);
    const finishZ = assembler.track.stageFinishWorldZ ?? assembler.track.length;
    assembler.advance(finishZ - 400, bp1.totalBars - 0.2, bp1.referenceSpeed, DEFAULT_TUNING.drawDistance, 1 / 12);
    assembler.promoteNextStage(bp2, bp1, finishZ + 200, DEFAULT_TUNING.drawDistance);
    expect(auditTrackProps(assembler.track, { checkDiversity: false }).errors).toEqual([]);

    // Advance past segment 3088 and verify rebaseOrigin shifts cleanly with zero orphan props
    for (let seg = 1; seg <= 280; seg++) {
      const p = seg * 2400;
      assembler.advance(p, ((p / bp2.barLengthWorld) % bp2.totalBars), bp2.referenceSpeed, DEFAULT_TUNING.drawDistance, 1 / 12);
    }
    const preRebaseHead = assembler.track.headAbsSeg;
    const shiftedZ = assembler.rebaseOrigin(preRebaseHead - 20);
    expect(shiftedZ).toBeGreaterThan(0);
    assembler.advance(
      Math.max(0, (preRebaseHead - 20) * bp2.segmentLength - shiftedZ),
      4,
      bp2.referenceSpeed,
      DEFAULT_TUNING.drawDistance,
      1 / 12,
    );
    expect(auditTrackProps(assembler.track, { checkDiversity: false }).errors).toEqual([]);
  });

  it('catches synthetic placement regressions symmetrically in auditTrackProps', () => {
    const mkSeg = (index: number, env: RoadSegment['env'] = 'standard'): RoadSegment => ({
      index,
      p1: createPoint(0, index * 200),
      p2: createPoint(0, (index + 1) * 200),
      curve: 0,
      stripe: 0,
      sprites: [],
      fog: 1,
      env,
    });
    const segs = Array.from({ length: 40 }, (_, i) => mkSeg(i, i >= 12 && i <= 20 ? 'tunnel' : i >= 24 && i <= 36 ? 'bridge' : 'standard'));
    // 1) Duplicate overhead <= 6 segs
    segs[1]!.sprites.push({ kind: 'gantry', offset: 0, variant: 0 });
    segs[5]!.sprites.push({ kind: 'overpass', offset: 0, variant: 0 });
    // 2) Band-A ahead of overhead
    segs[7]!.sprites.push({ kind: 'lamp', offset: -1.3, variant: 0 });
    segs[9]!.sprites.push({ kind: 'gantry', offset: 0, variant: 0 });
    // 3) Asymmetric lamp vs sign conflict in both directions
    segs[2]!.sprites.push({ kind: 'lamp', offset: 1.3, variant: 0 });
    segs[3]!.sprites.push({ kind: 'sign', offset: 1.4, variant: 0 });
    // 4) Tunnel portal prop at ±8 distance (seg 12 - 8 = seg 4)
    segs[4]!.sprites.push({ kind: 'lamp', offset: -1.3, variant: 0 });
    // 5) Suspension tower within 12 segs of bridge edge
    segs[26]!.sprites.push({ kind: 'suspension-tower', offset: 0, variant: 0 });

    const track: Track = { segments: segs, segmentLength: 200, length: segs.length * 200 };
    const report = auditTrackProps(track);
    const rules = new Set(report.errors.map((e) => e.rule));
    expect(rules.has('overlap-overhead')).toBe(true);
    expect(rules.has('overlap-depth')).toBe(true);
    expect(rules.has('tunnel-portal')).toBe(true);
    expect(rules.has('bridge-tower-edge')).toBe(true);
  });

  it('smoke-renders all 23 PropKinds cleanly across distances and fog levels with finite geometry', () => {
    const badCalls: string[] = [];
    const noop = () => {};
    const checkFinite = (label: string, vals: number[]) => {
      for (const v of vals) {
        if (!Number.isFinite(v)) badCalls.push(`${label}:${v}`);
      }
    };
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
      moveTo: (x: number, y: number) => checkFinite('moveTo', [x, y]),
      lineTo: (x: number, y: number) => checkFinite('lineTo', [x, y]),
      quadraticCurveTo: (cx: number, cy: number, x: number, y: number) =>
        checkFinite('quad', [cx, cy, x, y]),
      arc: noop,
      fill: noop,
      stroke: noop,
      fillRect: (x: number, y: number, w: number, h: number) =>
        checkFinite('fillRect', [x, y, w, h]),
    } as unknown as CanvasRenderingContext2D;

    const ppus = [0.0025, 0.005, 0.01, 0.02, 0.04];
    const fogs = [0, 0.4, 0.8];

    for (const kind of ALL_PROP_KINDS) {
      for (const ppu of ppus) {
        for (const fog of fogs) {
          drawProp(ctx, kind, 320, 260, ppu, -1, 0, 0.5, 4, 300, fog);
        }
      }
    }
    expect(badCalls).toEqual([]);
  });
});
