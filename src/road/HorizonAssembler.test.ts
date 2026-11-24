import { barDurationSec, type BeatMap } from '@src/audio/BeatMap';
import { BUNDLED_WANGAN_BEATMAP, DEFAULT_SYNTH_BEATMAP } from '@src/audio/FunkAudioEngine';
import { resetTuning, tuning } from '@src/config/tuning';
import { mapCarSpeedToWorldBaseSpeed, SongRoadSyncController } from '@src/engine/SongRoadSyncController';
import { TrafficManager } from '@src/entities/TrafficAndProps';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  HorizonAssembler,
  SPRITE_POOL_SIZE,
  STREAMING_RING_MASK,
  STREAMING_RING_SIZE,
} from './HorizonAssembler';
import { compileSongBlueprint } from './SongBlueprint';

function createCantStopMockBeatMap(): BeatMap & {
  impactBars: number[];
  spectralSpans: { startBar: number; endBar: number; kind: string }[];
} {
  const bpm = 110.35;
  const totalBars = 68;
  const barDur = (60 / bpm) * 4;
  return {
    ...DEFAULT_SYNTH_BEATMAP,
    contentHash: 'sha256:cant-stop-loving-u-streaming',
    title: 'Cant Stop Loving U',
    artist: 'Haruko Akagi',
    bpm,
    firstBeatOffsetSec: 0,
    durationSec: totalBars * barDur,
    barEnergy: new Array<number>(totalBars).fill(0.76),
    barBrightness: Array.from({ length: totalBars }, (_, b) => (b >= 32 && b < 38 ? 0.14 : 0.82)),
    sections: [
      { startBar: 0, bars: 60, role: 'drop' },
      { startBar: 60, bars: 8, role: 'outro' },
    ],
    spectralSpans: [{ startBar: 32, endBar: 38, kind: 'lpf_muffled' }],
    impactBars: [38],
  };
}

describe('HorizonAssembler & SongBlueprint — Tranche 2 (Hybrid D+A Ring Buffer)', () => {
  beforeEach(() => {
    resetTuning();
  });

  it('produces 100% deterministic blueprints and identical 1:1 streamed segments for the same BeatMap & seed', () => {
    const bpA = compileSongBlueprint(DEFAULT_SYNTH_BEATMAP, { stageId: 'night' });
    const bpB = compileSongBlueprint(DEFAULT_SYNTH_BEATMAP, { stageId: 'night' });
    expect(bpA.chunks).toEqual(bpB.chunks);
    expect(bpA.syncAnchors).toEqual(bpB.syncAnchors);
    expect(bpA.powerLineRuns).toEqual(bpB.powerLineRuns);

    const asmA = new HorizonAssembler(bpA);
    const asmB = new HorizonAssembler(bpB);

    const dt = 1 / 60;
    const barDur = barDurationSec(DEFAULT_SYNTH_BEATMAP);
    let pos = 0;
    for (let step = 0; step < 300; step++) {
      const audioBar = (step * dt) / barDur;
      pos += bpA.referenceSpeed * dt;
      asmA.advance(pos, audioBar, bpA.referenceSpeed, 200, dt);
      asmB.advance(pos, audioBar, bpB.referenceSpeed, 200, dt);
    }

    expect(asmA.track.headAbsSeg).toBe(asmB.track.headAbsSeg);
    for (let s = asmA.track.tailAbsSeg; s < asmA.track.headAbsSeg; s++) {
      const segA = asmA.track.segments[s & STREAMING_RING_MASK]!;
      const segB = asmB.track.segments[s & STREAMING_RING_MASK]!;
      expect(segA.curve).toBe(segB.curve);
      expect(segA.p1.worldY).toBe(segB.p1.worldY);
      expect(segA.p2.worldY).toBe(segB.p2.worldY);
      expect(segA.env).toBe(segB.env);
      expect(segA.tunnelLight).toBe(segB.tunnelLight);
      expect(segA.sprites.map((sp) => ({ k: sp.kind, o: sp.offset, v: sp.variant }))).toEqual(
        segB.sprites.map((sp) => ({ k: sp.kind, o: sp.offset, v: sp.variant })),
      );
    }
  });

  it('keeps Cant_Stop_Loving_U synced across 4 stress regimes with zero chunk repetition and C1/grade bounds', () => {
    const beatMap = createCantStopMockBeatMap();
    const bp = compileSongBlueprint(beatMap, { stageId: 'night' });
    const barDur = barDurationSec(beatMap);
    const dt = 1 / 60;

    const regimes: Array<{
      name: string;
      speedAt: (audioBar: number, elapsedSec: number) => number;
    }> = [
      {
        name: '1. Constant Overdrive (1.06x)',
        speedAt: (audioBar) =>
          audioBar < 1.5 ? tuning.maxSpeed * (0.45 + audioBar * 0.4) : tuning.maxSpeed * 1.06,
      },
      {
        name: '2. Clean 6th gear (0.96x)',
        speedAt: (audioBar) =>
          audioBar < 1.5 ? tuning.maxSpeed * (0.45 + audioBar * 0.34) : tuning.maxSpeed * 0.96,
      },
      {
        name: '3. Cautious Tofu 4th gear (0.72x)',
        speedAt: () => tuning.maxSpeed * 0.72,
      },
      {
        name: '4. Full stop 6s at bar 12 + 3 collisions (bar 20, 34, 50) + recovery',
        speedAt: (audioBar, elapsedSec) => {
          const stopStartSec = 12 * barDur;
          if (elapsedSec >= stopStartSec && elapsedSec < stopStartSec + 6.0) return 0;
          if (audioBar >= 20 && audioBar < 21.2) return tuning.maxSpeed * 0.42;
          if (audioBar >= 34 && audioBar < 35.2) return tuning.maxSpeed * 0.45;
          if (audioBar >= 50 && audioBar < 51.2) return tuning.maxSpeed * 0.42;
          return tuning.maxSpeed * 0.96;
        },
      },
    ];

    for (const regime of regimes) {
      const asm = new HorizonAssembler(bp);
      const sync = new SongRoadSyncController();
      sync.resetForTrack(true, false, 0);

      let position = 0;
      let elapsedSec = 0;
      let prevInTunnel = false;
      let entryAudioBar: number | null = null;
      let exitAudioBar: number | null = null;
      let forkAudioBar: number | null = null;
      let maxAbsGrade = 0;
      let maxAbsCurveDelta = 0;
      let lastCheckedSeg = 0;
      let prevCheckedBar = -1;
      let prevCheckedCurve = 0;

      const maxSteps = Math.ceil((67 * barDur) / dt);
      for (let step = 0; step < maxSteps; step++) {
        elapsedSec += dt;
        const audioBar = elapsedSec / barDur;
        const audioBeat = audioBar * 4;
        const carSpeed = regime.speedAt(audioBar, elapsedSec);
        const speedRatio = carSpeed / tuning.maxSpeed;
        const worldBaseSpeed = mapCarSpeedToWorldBaseSpeed(carSpeed);

        asm.advance(position, audioBar, worldBaseSpeed, 200, dt);

        // Verify monotonicity (zero chunk repetition), C1 curve derivative, and grade <= 0.30
        const scanEnd = asm.track.headAbsSeg;
        const finishAbsSeg =
          asm.track.stageFinishWorldZ !== undefined
            ? Math.floor(asm.track.stageFinishWorldZ / asm.track.segmentLength)
            : Number.POSITIVE_INFINITY;
        for (let s = lastCheckedSeg; s < scanEnd; s++) {
          const slot = s & STREAMING_RING_MASK;
          const seg = asm.track.segments[slot]!;
          const segBar = asm.track.slotBarFloat[slot]!;
          if (s > 0 && s < finishAbsSeg && prevCheckedBar >= 0) {
            expect(segBar, `${regime.name}: monotonic bar at seg ${s}`).toBeGreaterThanOrEqual(
              prevCheckedBar - 1e-6,
            );
          }
          const grade = Math.abs(seg.p2.worldY - seg.p1.worldY) / asm.track.segmentLength;
          if (grade > maxAbsGrade) maxAbsGrade = grade;
          if (s > 0 && s < finishAbsSeg) {
            const dCurve = Math.abs(seg.curve - prevCheckedCurve);
            if (dCurve > maxAbsCurveDelta) maxAbsCurveDelta = dCurve;
          }
          if (s < finishAbsSeg) {
            prevCheckedBar = segBar;
            prevCheckedCurve = seg.curve;
          }
        }
        lastCheckedSeg = scanEnd;

        const effSpeed = sync.computeElasticWorldSpeed(
          asm.track,
          false,
          carSpeed,
          speedRatio,
          position,
          audioBeat,
          beatMap.bpm,
          'drop',
          dt,
        );
        const prevPos = position;
        position += effSpeed * dt;
        sync.checkDropSync(asm.track, prevPos, position, audioBeat, () => {});

        const camSeg = asm.track.segments[Math.floor(position / asm.track.segmentLength) & STREAMING_RING_MASK]!;
        const inTunnel = camSeg.env === 'tunnel';
        if (inTunnel && !prevInTunnel && entryAudioBar === null) {
          entryAudioBar = audioBar;
        } else if (!inTunnel && prevInTunnel && exitAudioBar === null) {
          exitAudioBar = audioBar;
        }
        prevInTunnel = inTunnel;

        if (
          forkAudioBar === null &&
          asm.track.forkZoneStartZ !== undefined &&
          position >= asm.track.forkZoneStartZ
        ) {
          forkAudioBar = audioBar;
        }
      }

      expect(entryAudioBar, `${regime.name}: tunnel entry detected`).not.toBeNull();
      expect(exitAudioBar, `${regime.name}: tunnel exit detected`).not.toBeNull();
      expect(forkAudioBar, `${regime.name}: fork approach detected`).not.toBeNull();

      expect(Math.abs(entryAudioBar! - 32), `${regime.name}: entryAudioBar=${entryAudioBar}`).toBeLessThanOrEqual(0.25);
      expect(Math.abs(exitAudioBar! - 38), `${regime.name}: exitAudioBar=${exitAudioBar}`).toBeLessThanOrEqual(0.25);
      expect(Math.abs(forkAudioBar! - 62), `${regime.name}: forkAudioBar=${forkAudioBar}`).toBeLessThanOrEqual(0.30);
      expect(maxAbsGrade, `${regime.name}: max grade`).toBeLessThanOrEqual(0.30);
      expect(maxAbsCurveDelta, `${regime.name}: C1 curve step`).toBeLessThanOrEqual(0.50);
    }
  });

  it('maintains strict zero-GC ring buffer & sprite pool invariants across 5000 streamed segments', () => {
    const bp = compileSongBlueprint(DEFAULT_SYNTH_BEATMAP, { stageId: 'night' });
    const asm = new HorizonAssembler(bp);
    const traffic = new TrafficManager();
    traffic.resetForStreaming(asm.track, bp.contentHash);
    asm.onHorizonBarMaterialized = (b, seg, blueprint, st) => {
      traffic.onHorizonBarMaterialized(b, seg, blueprint, st);
    };

    const segRefs = asm.track.segments.slice();
    const spriteArrayRefs = asm.track.segments.map((s) => s.sprites);
    const poolRefs = asm.spritePool.slice();

    const barDur = barDurationSec(DEFAULT_SYNTH_BEATMAP);
    let pos = 0;
    let t = 0;
    const dt = 1 / 60;
    while (asm.track.headAbsSeg < 5000) {
      t += dt;
      pos += bp.referenceSpeed * dt;
      asm.advance(pos, t / barDur, bp.referenceSpeed, 200, dt);
    }

    expect(asm.track.segments.length).toBe(STREAMING_RING_SIZE);
    expect(asm.spritePool.length).toBe(SPRITE_POOL_SIZE);
    for (let i = 0; i < STREAMING_RING_SIZE; i++) {
      expect(asm.track.segments[i]).toBe(segRefs[i]);
      expect(asm.track.segments[i]!.sprites).toBe(spriteArrayRefs[i]);
    }
    for (let i = 0; i < SPRITE_POOL_SIZE; i++) {
      expect(asm.spritePool[i]).toBe(poolRefs[i]);
    }
  });

  it('supports seekToBar (including inside tunnel & fork), rebaseOrigin, late fork switch, and stage promotion cleanly', () => {
    const bp1 = compileSongBlueprint(createCantStopMockBeatMap(), { stageId: 'night' });
    const bp2 = compileSongBlueprint(BUNDLED_WANGAN_BEATMAP, { stageId: 'akiba_night' });
    const asm = new HorizonAssembler(bp1, bp2);

    // 1. Seek inside tunnel (bar 35)
    asm.resetAtBar(35, 0, bp1, bp2, 200, 'right');
    expect(asm.track.segments[0]!.env).toBe('tunnel');
    expect(asm.track.segments[0]!.sprites).toEqual([]);

    // 2. Seek inside fork (bar 63)
    asm.resetAtBar(63, 0, bp1, bp2, 200, 'right');
    expect(asm.track.forkZoneStartZ).toBeDefined();
    expect(asm.track.stageFinishWorldZ).toBeDefined();
    expect(asm.track.stageFinishWorldZ!).toBeGreaterThan(asm.track.forkZoneStartZ!);

    // 3. Advance across stageFinishWorldZ and test late fork switch before promotion
    const finishZ = asm.track.stageFinishWorldZ!;
    const preFinishPos = Math.max(0, finishZ - 4000);
    asm.advance(preFinishPos, 66.5, bp1.referenceSpeed, 200, 1 / 60);
    asm.updateForkChoice('left', preFinishPos, 200);
    asm.updateForkChoice('right', preFinishPos, 200);

    // 4. Promote to Stage 2 seamlessly without NaN or vertical cliffs
    asm.promoteNextStage(bp2, null, finishZ + 50, 200);
    expect(asm.track.blueprint.contentHash).toBe(bp2.contentHash);
    const curSeg = asm.track.segments[Math.floor((finishZ + 50) / bp2.segmentLength) & STREAMING_RING_MASK]!;
    expect(Number.isFinite(curSeg.p1.worldY)).toBe(true);
    expect(Number.isFinite(curSeg.curve)).toBe(true);

    // 5. Atomic origin rebase after marathon distance preserves stripe parity & finite coordinates
    asm.resetAtBar(0, 7000, bp2, null, 200, 'right');
    const stripeBefore = asm.track.segments[7000 & STREAMING_RING_MASK]!.stripe;
    const shiftZ = asm.rebaseOrigin(7000);
    expect(shiftZ).toBeGreaterThan(0);
    const newIdx = 7000 - shiftZ / bp2.segmentLength;
    expect(asm.track.segments[newIdx & STREAMING_RING_MASK]!.stripe).toBe(stripeBefore);
    expect(asm.track.segments[newIdx & STREAMING_RING_MASK]!.index).toBe(newIdx);
  });
});
