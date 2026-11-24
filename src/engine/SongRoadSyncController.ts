import type { BeatMap, SectionRole } from '@src/audio/BeatMap';
import { FORK_APPROACH_BARS } from '@src/config/constants';
import { tuning } from '@src/config/tuning';
import type { TrafficManager } from '@src/entities/TrafficAndProps';
import type { Track } from '@src/road/RoadSegment';
import {
  getSectionPaceFactor,
  isSongTrack,
  stitchHorizonToTargetZ,
  worldZToBar,
  worldZToBeat,
} from '@src/road/SongRoadGenerator';

/**
 * Manages Spacetime Hybrid Sync (Micro Level A1 elastic speed + Macro Level A2 horizon phase stitch),
 * musical Drop Sync detection, and song-road bar/chunk telemetry (AGENTS.md §2, §4.3, §4.6).
 *
 * Pure TypeScript module (zero React imports, zero GC allocations in `update`).
 */
export class SongRoadSyncController {
  roadBarIndex = 0;
  totalBars = 64;
  currentChunkId = 'custom-track';
  syncDeltaBeats = 0;

  readonly crossedDropBars = new Set<number>();
  horizonStitchCooldown = 0;
  private rollingStart = false;
  private smoothedScale = 1.0;

  private readonly anchorScratch = { distRemaining: 0, beatsRemaining: 0, isDropAnchor: false };

  resetForTrack(
    resetCooldown = false,
    rollingStart = false,
    minCooldownSec = 0,
  ): void {
    this.crossedDropBars.clear();
    this.rollingStart = rollingStart;
    this.smoothedScale = 1.0;
    if (resetCooldown) {
      this.horizonStitchCooldown = minCooldownSec;
    } else if (minCooldownSec > 0) {
      this.horizonStitchCooldown = Math.max(this.horizonStitchCooldown, minCooldownSec);
    }
  }

  tickCooldown(dt: number): void {
    if (this.horizonStitchCooldown > 0) {
      this.horizonStitchCooldown = Math.max(0, this.horizonStitchCooldown - dt);
    }
  }

  /**
   * Computes the elastic road advancement speed (Micro Level A1), modulating dZ/dt within
   * `[1 - syncMaxSlowdown, 1 + syncMaxSpeedup]` to converge on upcoming drop crests and stage forks.
   */
  computeElasticWorldSpeed(
    track: Track,
    hasCustomTrack: boolean,
    carSpeed: number,
    carSpeedRatio: number,
    position: number,
    audioBeatIndex: number,
    bpm: number,
    sectionRole: SectionRole,
    dt = 1 / 120,
  ): number {
    if (!isSongTrack(track) || hasCustomTrack || carSpeedRatio < 0.05) {
      this.smoothedScale = 1.0;
      return carSpeed;
    }

    const roadBarFloat =
      track.barLengthWorld > 0 ? position / track.barLengthWorld : this.roadBarIndex;
    const paceFactor = getSectionPaceFactor(
      track,
      roadBarFloat,
      sectionRole,
      this.rollingStart,
    );

    // 1. Convergence on visible upcoming anchor (next uncrossed drop marker or stage fork)
    let hasNextAnchor = false;
    this.anchorScratch.isDropAnchor = false;

    for (let i = 0; i < track.dropMarkers.length; i++) {
      const dm = track.dropMarkers[i]!;
      if (this.crossedDropBars.has(dm.barIndex)) continue;
      // Avoid braking a rolling-start car right after a stage fork for ultra-early 1-2 bar pickups
      if (this.rollingStart && dm.barIndex < 3) continue;
      if (dm.worldZ > position) {
        const dropBeat = dm.barIndex * 4;
        const beatsRemaining = dropBeat - audioBeatIndex;
        const distRemaining = dm.worldZ - position;
        if (beatsRemaining > 0.02 && beatsRemaining <= 32 && distRemaining > 0) {
          this.anchorScratch.distRemaining = distRemaining;
          this.anchorScratch.beatsRemaining = beatsRemaining;
          this.anchorScratch.isDropAnchor = true;
          hasNextAnchor = true;
          break;
        }
      }
    }

    if (!hasNextAnchor) {
      const totalBeats = track.totalBars * 4;
      const beatsRemaining = totalBeats - audioBeatIndex;
      const barsRemaining = beatsRemaining / 4;
      if (barsRemaining <= FORK_APPROACH_BARS + 2 && beatsRemaining > 0.4) {
        const distRemaining = track.length - position;
        if (distRemaining > 0) {
          this.anchorScratch.distRemaining = distRemaining;
          this.anchorScratch.beatsRemaining = beatsRemaining;
          this.anchorScratch.isDropAnchor = false;
          hasNextAnchor = true;
        }
      }
    }

    const baseMinScale = 1 - tuning.syncMaxSlowdown;
    const baseMaxScale = 1 + tuning.syncMaxSpeedup;
    const roadBeat = worldZToBeat(track, position);
    const lagBeats = audioBeatIndex - roadBeat;
    const paceInv = paceFactor > 0 ? 1 / paceFactor : 1;
    const rawScale = paceInv + lagBeats * tuning.syncElasticGain;
    const continuousScale = Math.max(baseMinScale, Math.min(baseMaxScale, rawScale));

    let targetScale = continuousScale;

    if (hasNextAnchor) {
      const safeBpm = bpm > 0 ? bpm : 120;
      const timeRemainingSec = this.anchorScratch.beatsRemaining * (60 / safeBpm);
      if (timeRemainingSec > 0.01) {
        const targetSpeed = this.anchorScratch.distRemaining / timeRemainingSec;
        const ratio = targetSpeed / Math.max(1, carSpeed);
        let minScale = baseMinScale;
        let maxScale = baseMaxScale;
        // Gently expand drop-crest authority inside the final 16-beat approach without ever
        // braking the world speed below 76% of the speedometer.
        if (this.anchorScratch.isDropAnchor && this.anchorScratch.beatsRemaining <= 16) {
          const lockProximity = Math.max(
            0,
            Math.min(1, (16 - this.anchorScratch.beatsRemaining) / 10),
          );
          minScale = baseMinScale * (1 - lockProximity) + 0.76 * lockProximity;
          maxScale = baseMaxScale * (1 - lockProximity) + 1.32 * lockProximity;
        }
        const anchorScale = Math.max(minScale, Math.min(maxScale, ratio));
        if (this.anchorScratch.beatsRemaining > 28) {
          const blend = Math.max(0, Math.min(1, (32 - this.anchorScratch.beatsRemaining) / 4));
          targetScale = continuousScale * (1 - blend) + anchorScale * blend;
        } else {
          targetScale = anchorScale;
        }
      }
    }

    // 2. Smooth scale transitions so anchor engagement/release never causes a slingshot jump
    const blendRate = 1 - Math.exp(-3.5 * Math.max(0, dt));
    this.smoothedScale += (targetScale - this.smoothedScale) * blendRate;
    return carSpeed * this.smoothedScale;
  }

  /**
   * Evaluates macro lag between audio clock and road position (Macro Level A2).
   * If lag exceeds `tuning.syncHorizonStitchBars` and no drop marker is in the near view,
   * executes a seamless horizon phase stitch and shifts visible Kei Trucks.
   * Returns `deltaZ` applied to camera `position` (`0` if no stitch occurred).
   */
  maybeStitchHorizonToMusic(
    track: Track,
    hasCustomTrack: boolean,
    carSpeedRatio: number,
    forkActive: boolean,
    position: number,
    audioBeatIndex: number,
    traffic: TrafficManager,
  ): number {
    if (!isSongTrack(track) || hasCustomTrack) return 0;
    if (carSpeedRatio < 0.12) return 0;
    if (forkActive) return 0;
    if (this.horizonStitchCooldown > 0) return 0;

    // Do not stitch if an upcoming drop marker is already visible in front of the car
    const drawDistSegs = Math.floor(tuning.drawDistance);
    const safeAheadWorldZ = Math.floor(drawDistSegs * 0.75) * track.segmentLength;
    for (let i = 0; i < track.dropMarkers.length; i++) {
      const dm = track.dropMarkers[i]!;
      if (
        !this.crossedDropBars.has(dm.barIndex) &&
        dm.worldZ >= position &&
        dm.worldZ <= position + safeAheadWorldZ
      ) {
        return 0;
      }
    }

    // Do not stitch while the camera or near visible window is on a special structure
    // (`bridge`, `viaduct`, or `tunnel`) so monumental towers, cables, and portals never cut mid-span.
    const curSegIdx = Math.floor(position / track.segmentLength);
    const nearSpecialSegs = Math.min(
      track.segments.length,
      curSegIdx + Math.max(1, drawDistSegs),
    );
    for (let s = Math.max(0, curSegIdx); s < nearSpecialSegs; s++) {
      if ((track.segments[s]!.env ?? 'standard') !== 'standard') {
        return 0;
      }
    }

    const audioBarFloat = audioBeatIndex / 4;
    const roadBarFloat = position / track.barLengthWorld;
    const lagBars = audioBarFloat - roadBarFloat;

    // Guard against false lag if the road wrapped early in single-track loop mode
    if (lagBars > this.totalBars * 0.5) return 0;

    const isForkTailApproach =
      audioBarFloat >= this.totalBars - (FORK_APPROACH_BARS + 2) &&
      this.totalBars - roadBarFloat > FORK_APPROACH_BARS + 2.5;

    if (lagBars >= tuning.syncHorizonStitchBars || isForkTailApproach) {
      const targetZ = Math.min(
        track.length - (FORK_APPROACH_BARS + 1) * track.barLengthWorld,
        audioBarFloat * track.barLengthWorld,
      );
      const res = stitchHorizonToTargetZ(
        track,
        position,
        targetZ,
        Math.floor(tuning.drawDistance),
      );
      if (res !== null) {
        traffic.shiftVisibleWindowTrucks(
          track,
          position,
          res.deltaZ,
          res.copiedWindowSegs * track.segmentLength,
        );
        this.horizonStitchCooldown = 1.5;
        return res.deltaZ;
      } else {
        // Avoid retrying failed stitches at 120 Hz when near track boundaries
        this.horizonStitchCooldown = 1.0;
      }
    }
    return 0;
  }

  /**
   * Checks whether the car just crossed a musical Drop crest on beat (`|deltaBeats| <= 1.25`).
   */
  checkDropSync(
    track: Track,
    prevPosition: number,
    position: number,
    audioBeatIndex: number,
    onDropSync: (barIndex: number, deltaBeats: number) => void,
  ): void {
    if (!isSongTrack(track)) return;
    for (let i = 0; i < track.dropMarkers.length; i++) {
      const dm = track.dropMarkers[i]!;
      if (this.crossedDropBars.has(dm.barIndex)) continue;
      if (prevPosition <= dm.worldZ && position >= dm.worldZ) {
        this.crossedDropBars.add(dm.barIndex);
        const dropBeat = dm.barIndex * 4;
        const deltaBeats = audioBeatIndex - dropBeat;
        if (Math.abs(deltaBeats) <= 1.25) {
          onDropSync(dm.barIndex, deltaBeats);
        }
      }
    }
  }

  updateTelemetry(
    track: Track,
    activeRoadBeatMap: BeatMap,
    position: number,
    audioBeatIndex: number,
  ): void {
    if (!isSongTrack(track)) {
      this.roadBarIndex = 0;
      this.totalBars = activeRoadBeatMap.barEnergy.length;
      this.currentChunkId = 'test-track';
      this.syncDeltaBeats = 0;
      return;
    }

    const bar = Math.max(
      0,
      Math.min(track.totalBars - 1, worldZToBar(track, position)),
    );
    this.roadBarIndex = bar;
    this.totalBars = track.totalBars;

    const roadBeat = worldZToBeat(track, position);
    this.syncDeltaBeats = Math.round((roadBeat - audioBeatIndex) * 10) / 10;

    for (let i = 0; i < track.chunks.length; i++) {
      const chunk = track.chunks[i]!;
      if (bar >= chunk.startBar && bar < chunk.startBar + chunk.bars) {
        this.currentChunkId = chunk.chunkId;
        break;
      }
    }
  }
}
