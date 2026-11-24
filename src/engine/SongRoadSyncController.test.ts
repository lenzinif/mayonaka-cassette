import { barDurationSec, type BeatMap } from '@src/audio/BeatMap';
import { DEFAULT_SYNTH_BEATMAP } from '@src/audio/FunkAudioEngine';
import { resetTuning, tuning } from '@src/config/tuning';
import { TrafficManager } from '@src/entities/TrafficAndProps';
import { generateSongRoad } from '@src/road/SongRoadGenerator';
import { beforeEach, describe, expect, it } from 'vitest';
import { mapCarSpeedToWorldBaseSpeed, SongRoadSyncController } from './SongRoadSyncController';

function createCantStopMockBeatMap(): BeatMap & {
  impactBars: number[];
  spectralSpans: { startBar: number; endBar: number; kind: string }[];
} {
  const bpm = 110.35;
  const totalBars = 68;
  const barDur = (60 / bpm) * 4;
  return {
    ...DEFAULT_SYNTH_BEATMAP,
    contentHash: 'sha256:cant-stop-loving-u-mock',
    title: 'Cant Stop Loving U (Mock)',
    artist: 'Haruko Akagi',
    bpm,
    firstBeatOffsetSec: 0,
    durationSec: totalBars * barDur,
    barEnergy: new Array<number>(totalBars).fill(0.78),
    barBrightness: Array.from({ length: totalBars }, (_, b) => (b >= 32 && b < 38 ? 0.14 : 0.82)),
    sections: [
      { startBar: 0, bars: 60, role: 'drop' },
      { startBar: 60, bars: 8, role: 'outro' },
    ],
    spectralSpans: [{ startBar: 32, endBar: 38, kind: 'lpf_muffled' }],
    impactBars: [38],
  };
}

describe('SongRoadSyncController — Tranche 1 (Model D + Bidirectional A2 + SyncAnchors)', () => {
  beforeEach(() => {
    resetTuning();
  });

  it('maps car speed 1:1 below referenceSpeed and compresses excess Overdrive dZ/dt softly above it', () => {
    const cruiseSpeed = tuning.maxSpeed * tuning.referenceSpeedRatio; // 11040
    expect(mapCarSpeedToWorldBaseSpeed(0)).toBe(0);
    expect(mapCarSpeedToWorldBaseSpeed(6000)).toBe(6000);
    expect(mapCarSpeedToWorldBaseSpeed(cruiseSpeed)).toBe(cruiseSpeed);

    // 6th gear HIGH (12000) -> 11040 + 960 * 0.65 = 11664
    expect(mapCarSpeedToWorldBaseSpeed(12000)).toBeCloseTo(
      cruiseSpeed + (12000 - cruiseSpeed) * (1 - tuning.overdriveWorldSpeedCompression),
      3,
    );
    // 6th gear OVERDRIVE (12540) -> well within elastic [0.82, 1.25] authority
    const odBase = mapCarSpeedToWorldBaseSpeed(12540);
    expect(odBase / cruiseSpeed).toBeLessThan(1.12);
    expect(odBase).toBeGreaterThan(cruiseSpeed);
  });

  it('keeps Cant_Stop_Loving_U tunnel entry (bar 32) and exit (bar 38) synced across Overdrive, slow 4th gear, and collision regimes', () => {
    const beatMap = createCantStopMockBeatMap();
    const barDur = barDurationSec(beatMap);
    const dt = 1 / 60;

    const regimes = [
      {
        name: '6th + Overdrive (1.045x)',
        speedAt: (audioBar: number) =>
          audioBar < 2 ? tuning.maxSpeed * (0.45 + audioBar * 0.28) : tuning.maxSpeed * 1.045,
        checkNonSaturated: true,
      },
      {
        name: '4th gear slow cruise (0.72x)',
        speedAt: () => tuning.maxSpeed * 0.72,
        checkNonSaturated: false,
      },
      {
        name: 'Clean 6th with 2 collisions at bar 20 & bar 34',
        speedAt: (audioBar: number) => {
          if (audioBar >= 20 && audioBar < 21.5) return tuning.maxSpeed * 0.45;
          if (audioBar >= 34 && audioBar < 35.5) return tuning.maxSpeed * 0.48;
          return tuning.maxSpeed * 0.98;
        },
        checkNonSaturated: false,
      },
    ];

    for (const regime of regimes) {
      const track = generateSongRoad(beatMap);
      const traffic = new TrafficManager(track, beatMap.contentHash);
      const sync = new SongRoadSyncController();
      sync.resetForTrack(true, false, 0);

      let position = 0;
      let elapsedSec = 0;
      let tunnelEntryAudioBar: number | null = null;
      let tunnelExitAudioBar: number | null = null;
      let exitSyncAwarded = false;
      let minScaleAfterLaunch = Infinity;
      let prevInTunnel = false;

      const totalSteps = Math.ceil((44 * barDur) / dt);
      for (let step = 0; step < totalSteps; step++) {
        elapsedSec += dt;
        const audioBar = elapsedSec / barDur;
        const audioBeat = audioBar * 4;
        const carSpeed = regime.speedAt(audioBar);
        const speedRatio = carSpeed / tuning.maxSpeed;

        sync.tickCooldown(dt);
        const effSpeed = sync.computeElasticWorldSpeed(
          track,
          false,
          carSpeed,
          speedRatio,
          position,
          audioBeat,
          beatMap.bpm,
          'drop',
          dt,
        );
        if (audioBar >= 8 && audioBar < 30) {
          minScaleAfterLaunch = Math.min(minScaleAfterLaunch, sync.lastSmoothedScale);
        }

        const prevPos = position;
        position = Math.min(track.length - 1, position + effSpeed * dt);

        const stitchDeltaZ = sync.maybeStitchHorizonToMusic(
          track,
          false,
          speedRatio,
          false,
          position,
          audioBeat,
          traffic,
        );
        if (stitchDeltaZ !== 0) {
          position = Math.max(0, Math.min(track.length - 1, position + stitchDeltaZ));
        }

        sync.checkDropSync(track, prevPos, position, audioBeat, (barIdx) => {
          if (barIdx === 38) exitSyncAwarded = true;
        });

        const segIdx = Math.min(track.segments.length - 1, Math.floor(position / track.segmentLength));
        const inTunnel = track.segments[segIdx]?.env === 'tunnel';
        if (inTunnel && !prevInTunnel && tunnelEntryAudioBar === null) {
          tunnelEntryAudioBar = audioBar;
        } else if (!inTunnel && prevInTunnel && tunnelExitAudioBar === null) {
          tunnelExitAudioBar = audioBar;
        }
        prevInTunnel = inTunnel;
      }

      expect(tunnelEntryAudioBar, `${regime.name}: tunnel entry`).not.toBeNull();
      expect(tunnelExitAudioBar, `${regime.name}: tunnel exit`).not.toBeNull();
      expect(Math.abs(tunnelEntryAudioBar! - 32), `${regime.name}: entry error`).toBeLessThanOrEqual(0.35);
      expect(Math.abs(tunnelExitAudioBar! - 38), `${regime.name}: exit error`).toBeLessThanOrEqual(0.35);
      expect(exitSyncAwarded, `${regime.name}: tunnelExit impact SYNC bonus`).toBe(true);

      if (regime.checkNonSaturated) {
        // In 6th + Overdrive, A1 must stay comfortably above the hard slowdown clamp (0.82)
        expect(minScaleAfterLaunch).toBeGreaterThan(0.86);
      }
    }
  });
});
