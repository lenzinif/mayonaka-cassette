import type { BeatMap, SectionRole } from '@src/audio/BeatMap';
import { FORK_APPROACH_BARS } from '@src/config/constants';
import { tuning } from '@src/config/tuning';
import type { TrafficManager } from '@src/entities/TrafficAndProps';
import type { SegmentEnvironment, Track } from '@src/road/RoadSegment';
import {
  getSectionPaceFactor,
  isSongTrack,
  stitchHorizonToTargetZ,
  worldZToBar,
  worldZToBeat,
  type SyncAnchorKind,
} from '@src/road/SongRoadGenerator';

/**
 * Maps physical car speed into longitudinal world advancement base speed (Model D).
 * Below `referenceSpeed`, mapping is 1:1 (braking, collisions, low gears feel 100% honest).
 * Above `referenceSpeed` (6th gear / Overdrive / downhill draft), excess dZ/dt is softly compressed
 * while speedometer km/h, FOV, centrifugal pull, audio cutoff, and Groove remain full-strength.
 */
export function mapCarSpeedToWorldBaseSpeed(carSpeed: number): number {
  const cruiseSpeed = tuning.maxSpeed * tuning.referenceSpeedRatio;
  if (carSpeed <= cruiseSpeed) return carSpeed;
  const compression = Math.max(0, Math.min(0.85, tuning.overdriveWorldSpeedCompression));
  return cruiseSpeed + (carSpeed - cruiseSpeed) * (1 - compression);
}

/**
 * Manages Spacetime Hybrid Sync (Micro Level A1 elastic speed + Macro Level A2 bidirectional horizon stitch),
 * unified structural SyncAnchor convergence (drop/impact, tunnelEntry, tunnelExit, fork),
 * and song-road bar/chunk telemetry (AGENTS.md §2, §4.3, §4.6).
 *
 * Pure TypeScript module (zero React imports, zero GC allocations in `update`).
 */
export class SongRoadSyncController {
  roadBarIndex = 0;
  totalBars = 64;
  currentChunkId = 'custom-track';
  syncDeltaBeats = 0;
  activeAnchorKind: SyncAnchorKind | null = null;
  activeAnchorBar = -1;

  /**
   * Zero-GC anchor crossing flags indexed by `track.syncAnchors[i]`:
   * 0 = uncrossed, 1 = crossed (non-rewarded), 2 = crossed & SYNC bonus awarded.
   */
  private readonly crossedAnchorFlags = new Uint8Array(256);
  horizonStitchCooldown = 0;
  private rollingStart = false;
  private smoothedScale = 1.0;

  private readonly anchorScratch = {
    distRemaining: 0,
    beatsRemaining: 0,
    isStructuralAnchor: false,
    kind: 'fork' as SyncAnchorKind,
    barIndex: -1,
  };

  get lastSmoothedScale(): number {
    return this.smoothedScale;
  }

  resetForTrack(
    resetCooldown = false,
    rollingStart = false,
    minCooldownSec = 0,
  ): void {
    this.crossedAnchorFlags.fill(0);
    this.rollingStart = rollingStart;
    this.smoothedScale = 1.0;
    this.activeAnchorKind = null;
    this.activeAnchorBar = -1;
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
   * Computes the elastic road advancement speed (Micro Level A1 + Model D cruise mapping),
   * modulating dZ/dt within `[1 - syncMaxSlowdown, 1 + syncMaxSpeedup]` to converge on upcoming
   * structural anchors (`drop`, `impact`, `tunnelEntry`, `tunnelExit`, `fork`).
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
      this.activeAnchorKind = null;
      this.activeAnchorBar = -1;
      return carSpeed;
    }

    const worldBaseSpeed = mapCarSpeedToWorldBaseSpeed(carSpeed);

    const roadBarFloat =
      track.barLengthWorld > 0 ? position / track.barLengthWorld : this.roadBarIndex;
    const paceFactor = getSectionPaceFactor(
      track,
      roadBarFloat,
      sectionRole,
      this.rollingStart,
    );

    // 1. Convergence on next uncrossed structural anchor (drop/impact, tunnelEntry, tunnelExit, fork)
    let hasNextAnchor = false;
    this.anchorScratch.isStructuralAnchor = false;
    this.anchorScratch.barIndex = -1;

    const anchors = track.syncAnchors;
    const maxFlags = this.crossedAnchorFlags.length;
    for (let i = 0; i < anchors.length; i++) {
      const anchor = anchors[i]!;
      if (i < maxFlags && this.crossedAnchorFlags[i]! !== 0) continue;
      // Avoid braking a rolling-start car right after a stage fork for ultra-early 1-2 bar pickups
      if (this.rollingStart && anchor.barIndex < 3) continue;
      if (anchor.worldZ > position) {
        const anchorBeat = anchor.barIndex * 4;
        const beatsRemaining = anchorBeat - audioBeatIndex;
        const distRemaining = anchor.worldZ - position;
        if (anchor.kind === 'fork') {
          const barsRemaining = beatsRemaining / 4;
          if (barsRemaining <= FORK_APPROACH_BARS + 2 && beatsRemaining > 0.4 && distRemaining > 0) {
            this.anchorScratch.distRemaining = distRemaining;
            this.anchorScratch.beatsRemaining = beatsRemaining;
            this.anchorScratch.isStructuralAnchor = false;
            this.anchorScratch.kind = 'fork';
            this.anchorScratch.barIndex = anchor.barIndex;
            hasNextAnchor = true;
            break;
          }
        } else if (beatsRemaining > 0.02 && beatsRemaining <= 32 && distRemaining > 0) {
          this.anchorScratch.distRemaining = distRemaining;
          this.anchorScratch.beatsRemaining = beatsRemaining;
          this.anchorScratch.isStructuralAnchor = true;
          this.anchorScratch.kind = anchor.kind;
          this.anchorScratch.barIndex = anchor.barIndex;
          hasNextAnchor = true;
          break;
        }
      }
    }

    this.activeAnchorKind = hasNextAnchor ? this.anchorScratch.kind : null;
    this.activeAnchorBar = hasNextAnchor ? this.anchorScratch.barIndex : -1;

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
        const ratio = targetSpeed / Math.max(1, worldBaseSpeed);
        let minScale = baseMinScale;
        let maxScale = baseMaxScale;
        // Gently expand structural anchor authority inside the final 16-beat approach without
        // dropping below 78% of worldBaseSpeed or exceeding 142% (keeps relaxed 4th-gear cruisers on-beat).
        if (this.anchorScratch.isStructuralAnchor && this.anchorScratch.beatsRemaining <= 16) {
          const lockProximity = Math.max(
            0,
            Math.min(1, (16 - this.anchorScratch.beatsRemaining) / 10),
          );
          minScale = baseMinScale * (1 - lockProximity) + 0.78 * lockProximity;
          maxScale = baseMaxScale * (1 - lockProximity) + 1.42 * lockProximity;
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
    return worldBaseSpeed * this.smoothedScale;
  }

  /**
   * Evaluates macro lag/lead between audio clock and road position (Macro Level A2).
   * Supports bidirectional stitching (forward on lag, backward on lead) on homogeneous
   * `'standard'` or `'tunnel'` windows whenever no structural anchor is in the near view.
   * Returns signed `deltaZ` applied to camera `position` (`0` if no stitch occurred).
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

    // Do not stitch if any uncrossed structural anchor is already visible in the near window
    const drawDistSegs = Math.floor(tuning.drawDistance);
    const safeAheadWorldZ = Math.floor(drawDistSegs * 0.75) * track.segmentLength;
    const anchors = track.syncAnchors;
    const maxFlags = this.crossedAnchorFlags.length;
    for (let i = 0; i < anchors.length; i++) {
      const anchor = anchors[i]!;
      if (
        (i >= maxFlags || this.crossedAnchorFlags[i]! === 0) &&
        anchor.worldZ >= position &&
        anchor.worldZ <= position + safeAheadWorldZ
      ) {
        return 0;
      }
    }

    // Require homogeneous environment (`standard` or `tunnel`) across the visible window
    // so monumental bridge towers, viaduct joints, and tunnel portals never cut mid-span.
    const curSegIdx = Math.floor(position / track.segmentLength);
    const baseEnv: SegmentEnvironment = track.segments[curSegIdx]?.env ?? 'standard';
    if (baseEnv !== 'standard' && baseEnv !== 'tunnel') {
      return 0;
    }
    const nearEndSeg = Math.min(
      track.segments.length,
      curSegIdx + Math.max(1, drawDistSegs),
    );
    for (let s = Math.max(0, curSegIdx); s < nearEndSeg; s++) {
      if ((track.segments[s]!.env ?? 'standard') !== baseEnv) {
        return 0;
      }
    }

    const audioBarFloat = audioBeatIndex / 4;
    const roadBarFloat = position / track.barLengthWorld;
    const lagBars = audioBarFloat - roadBarFloat;

    // Guard against false lag if the road wrapped early in single-track loop mode
    if (Math.abs(lagBars) > this.totalBars * 0.5) return 0;

    // Pre-anchor horizon alignment: just before an upcoming structural anchor enters drawDistance,
    // tighten the stitch threshold to 0.65 bars so the portal/crest materializes on-beat.
    const drawWorldSpan = drawDistSegs * track.segmentLength;
    let isPreAnchorApproach = false;
    for (let i = 0; i < anchors.length; i++) {
      const anchor = anchors[i]!;
      if (anchor.kind === 'fork') continue;
      if (i < maxFlags && this.crossedAnchorFlags[i]! !== 0) continue;
      const distAhead = anchor.worldZ - position;
      if (distAhead > drawWorldSpan && distAhead <= drawWorldSpan + 2.5 * track.barLengthWorld) {
        isPreAnchorApproach = true;
        break;
      }
    }

    const effectiveLagThreshold = isPreAnchorApproach
      ? Math.min(tuning.syncHorizonStitchBars, 0.65)
      : tuning.syncHorizonStitchBars;
    const effectiveLeadThreshold = isPreAnchorApproach
      ? Math.min(tuning.syncHorizonStitchLeadBars, 0.65)
      : tuning.syncHorizonStitchLeadBars;

    const isForkTailApproach =
      audioBarFloat >= this.totalBars - (FORK_APPROACH_BARS + 2) &&
      this.totalBars - roadBarFloat > FORK_APPROACH_BARS + 2.5;

    let targetZ: number | null = null;
    if (lagBars >= effectiveLagThreshold || isForkTailApproach) {
      targetZ = Math.min(
        track.length - (FORK_APPROACH_BARS + 1) * track.barLengthWorld,
        audioBarFloat * track.barLengthWorld,
      );
    } else if (lagBars <= -effectiveLeadThreshold) {
      // Cap each backward stitch to 2.0 bars so lead compensation stays subtle and non-repetitive
      const clampedLeadShift = Math.min(Math.abs(lagBars), 2.0);
      targetZ = Math.max(0, (roadBarFloat - clampedLeadShift) * track.barLengthWorld);
    }

    if (targetZ !== null) {
      const res = stitchHorizonToTargetZ(
        track,
        position,
        targetZ,
        drawDistSegs,
      );
      if (res !== null) {
        traffic.shiftVisibleWindowTrucks(
          track,
          position,
          res.deltaZ,
          res.copiedWindowSegs * track.segmentLength,
        );
        // Reset non-rewarded anchor flags ahead of the new position after backward stitches
        const newPos = position + res.deltaZ;
        for (let i = 0; i < anchors.length && i < maxFlags; i++) {
          if (anchors[i]!.worldZ > newPos && this.crossedAnchorFlags[i]! === 1) {
            this.crossedAnchorFlags[i] = 0;
          }
        }
        this.horizonStitchCooldown = 1.5;
        return res.deltaZ;
      } else {
        // Avoid retrying failed stitches at 120 Hz when near track or structure boundaries
        this.horizonStitchCooldown = 1.0;
      }
    }
    return 0;
  }

  /**
   * Checks whether the car just crossed a structural anchor (`drop`, `impact`, `tunnelEntry`, `tunnelExit`)
   * and triggers `onDropSync` when a reward-eligible anchor is crossed on beat (`|deltaBeats| <= 1.25`).
   */
  checkDropSync(
    track: Track,
    prevPosition: number,
    position: number,
    audioBeatIndex: number,
    onDropSync: (barIndex: number, deltaBeats: number) => void,
  ): void {
    if (!isSongTrack(track)) return;
    const anchors = track.syncAnchors;
    const maxFlags = this.crossedAnchorFlags.length;
    for (let i = 0; i < anchors.length; i++) {
      const anchor = anchors[i]!;
      if (i < maxFlags && this.crossedAnchorFlags[i]! !== 0) continue;
      if (prevPosition <= anchor.worldZ && position >= anchor.worldZ) {
        const anchorBeat = anchor.barIndex * 4;
        const deltaBeats = audioBeatIndex - anchorBeat;
        if (anchor.rewardsSyncBonus && Math.abs(deltaBeats) <= 1.25) {
          if (i < maxFlags) this.crossedAnchorFlags[i] = 2;
          onDropSync(anchor.barIndex, deltaBeats);
        } else {
          if (i < maxFlags) this.crossedAnchorFlags[i] = 1;
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
