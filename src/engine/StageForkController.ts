import type { BeatMap } from '@src/audio/BeatMap';
import type { RunGrade, TrackLibrary } from '@src/audio/TrackLibrary';
import { FORK_APPROACH_BARS } from '@src/config/constants';
import type { PlayerCar } from '@src/entities/PlayerCar';
import {
  FORK_SPLIT_END_T,
  getChosenForkCenter,
  getChosenForkHalfWidth,
  getForkCrossSection,
  type ForkCrossSection,
  type Track,
} from '@src/road/RoadSegment';
import { isSongTrack } from '@src/road/SongRoadGenerator';

export interface ForkOptionInfo {
  branch: 'left' | 'right';
  mode: 'loop' | 'nextTrack' | 'finishRun';
  label: string;
  title: string;
  artist: string;
  bpm: number;
  contentHash: string;
  bestScore: number | null;
  bestGrade: RunGrade | null;
}

/**
 * Manages the OutRun physical Y-fork state machine, branch selection (lane steering + manual lock),
 * Phase 3 smooth convergence alignment, post-fork recentering, and HUD `ForkOptionInfo` builders
 * (AGENTS.md §2, §4.3, §5 M6).
 *
 * Pure TypeScript module (zero React imports, zero GC allocations in hot path).
 */
export class StageForkController {
  forkActive = false;
  forkChoice: 'left' | 'right' = 'right';
  forkManualLock: 'left' | 'right' | null = null;
  forkLastSign = 0;
  forkProgress = 0;
  earlyCrossfadeStarted = false;

  readonly forkBoundsScratch: ForkCrossSection = {
    t: 0,
    outerLimit: 1,
    innerGap: 0,
    branchCenter: 0.5,
    activeLeftEdge: -1,
    activeRightEdge: 1,
    recenterProgress: 0,
  };

  resetForNewRoad(): void {
    this.earlyCrossfadeStarted = false;
    this.forkManualLock = null;
  }

  resetForStageTransition(): void {
    this.earlyCrossfadeStarted = false;
    this.forkManualLock = null;
    this.forkActive = false;
    this.forkProgress = 0;
    this.forkLastSign = 0;
  }

  getForkZoneStartZ(
    track: Track,
    hasMultipleTracks: boolean,
    hasCustomTrack: boolean,
  ): number | undefined {
    if (!hasMultipleTracks || hasCustomTrack || !isSongTrack(track)) {
      return undefined;
    }
    const forkBars = Math.min(FORK_APPROACH_BARS, Math.floor(track.totalBars * 0.25));
    return Math.max(0, track.length - forkBars * track.barLengthWorld);
  }

  getCrossSection(
    position: number,
    trackLength: number,
    forkZoneStartZ: number | undefined,
  ): ForkCrossSection {
    return getForkCrossSection(
      position,
      trackLength,
      forkZoneStartZ,
      this.forkChoice,
      this.forkBoundsScratch,
    );
  }

  /**
   * Smoothly aligns `car.x` with the chosen fork branch as it converges back to center in Phase 3.
   */
  alignCarInConvergence(
    car: PlayerCar,
    position: number,
    nextPos: number,
    trackLength: number,
    forkZoneStartZ: number | undefined,
    dt: number,
  ): void {
    if (
      forkZoneStartZ === undefined ||
      position < forkZoneStartZ ||
      trackLength <= forkZoneStartZ
    ) {
      return;
    }
    const span = Math.max(1, trackLength - forkZoneStartZ);
    const tPrev = Math.max(0, Math.min(1, (position - forkZoneStartZ) / span));
    const tNext = Math.max(0, Math.min(1, (nextPos - forkZoneStartZ) / span));
    if (tNext > FORK_SPLIT_END_T) {
      const centerPrev = getChosenForkCenter(tPrev, this.forkChoice);
      const centerNext = getChosenForkCenter(tNext, this.forkChoice);
      const deltaCenter = centerNext - centerPrev;
      car.x += deltaCenter;
      car.prevX += deltaCenter;

      const halfW = getChosenForkHalfWidth(tNext);
      const maxOffset = halfW * 0.85;
      const relX = car.x - centerNext;
      if (Math.abs(relX) > maxOffset) {
        const pull = (Math.sign(relX) * maxOffset - relX) * Math.min(1, dt * 5.0);
        car.x += pull;
        car.prevX += pull;
      }
    }
  }

  /**
   * Re-centers/safely bounds the player's lateral offset `car.x` when crossing the finish line.
   */
  recenterCarAfterFork(car: PlayerCar): void {
    if (Math.abs(car.x) > 0.85) {
      car.x = Math.sign(car.x) * 0.85;
      car.prevX = car.x;
    }
    car.bumpVx = 0;
    car.steer *= 0.3;
  }

  setManualChoice(
    choice: 'left' | 'right',
    car: PlayerCar,
    position: number,
    trackLength: number,
    forkZoneStartZ: number | undefined,
    onChoiceChanged: (choice: 'left' | 'right', source: 'lane' | 'input') => void,
  ): void {
    this.forkManualLock = choice;
    this.forkChoice = choice;
    this.forkLastSign = choice === 'left' ? -1 : 1;
    const bounds = getForkCrossSection(
      position,
      trackLength,
      forkZoneStartZ,
      choice,
      this.forkBoundsScratch,
    );
    const targetX = choice === 'left' ? -bounds.branchCenter : bounds.branchCenter;
    if (choice === 'left' && car.x > -bounds.innerGap - 0.1) {
      car.x = targetX;
      car.prevX = targetX;
    } else if (choice === 'right' && car.x < bounds.innerGap + 0.1) {
      car.x = targetX;
      car.prevX = targetX;
    }
    onChoiceChanged(choice, 'input');
  }

  updateState(
    position: number,
    trackLength: number,
    carX: number,
    forkStartZ: number | undefined,
    hasNextTrack: boolean,
    roadBarIndex: number,
    totalBars: number,
    audioBarIndex: number,
    onChoiceChanged: (choice: 'left' | 'right', source: 'lane' | 'input') => void,
    onStartEarlyCrossfade: () => void,
  ): void {
    if (forkStartZ === undefined) {
      this.forkActive = false;
      this.forkProgress = 0;
      this.forkManualLock = null;
      return;
    }

    if (position >= forkStartZ) {
      this.forkActive = true;
      this.forkProgress = Math.max(
        0,
        Math.min(1, (position - forkStartZ) / Math.max(1, trackLength - forkStartZ)),
      );

      if (this.forkProgress < FORK_SPLIT_END_T || this.forkLastSign === 0) {
        if (this.forkManualLock === 'left' && carX > 0.3) {
          this.forkManualLock = null;
        } else if (this.forkManualLock === 'right' && carX < -0.3) {
          this.forkManualLock = null;
        }

        const nextChoice: 'left' | 'right' =
          this.forkManualLock ??
          (this.forkLastSign > 0
            ? carX < -0.1
              ? 'left'
              : 'right'
            : this.forkLastSign < 0
              ? carX > 0.1
                ? 'right'
                : 'left'
              : carX < 0
                ? 'left'
                : 'right');
        const nextSign = nextChoice === 'left' ? -1 : 1;
        if (nextSign !== this.forkLastSign) {
          this.forkLastSign = nextSign;
          this.forkChoice = nextChoice;
          onChoiceChanged(nextChoice, 'lane');
        } else {
          this.forkChoice = nextChoice;
        }
      }

      if (
        !this.earlyCrossfadeStarted &&
        this.forkChoice === 'right' &&
        hasNextTrack &&
        roadBarIndex >= totalBars - 2 &&
        audioBarIndex < totalBars - 2
      ) {
        this.earlyCrossfadeStarted = true;
        onStartEarlyCrossfade();
      }
    } else {
      this.forkActive = false;
      this.forkProgress = 0;
      this.forkManualLock = null;
      this.forkLastSign = 0;
    }
  }

  buildLeftOption(activeRoadBeatMap: BeatMap, library: TrackLibrary): ForkOptionInfo | null {
    if (!this.forkActive) return null;
    const best = library.getBestScore(activeRoadBeatMap.contentHash);
    return {
      branch: 'left',
      mode: 'loop',
      label: 'LOOP CURRENT TRACK',
      title: activeRoadBeatMap.title,
      artist: activeRoadBeatMap.artist,
      bpm: activeRoadBeatMap.bpm,
      contentHash: activeRoadBeatMap.contentHash,
      bestScore: best?.bestScore ?? null,
      bestGrade: best?.bestGrade ?? null,
    };
  }

  buildRightOption(
    activeRoadBeatMap: BeatMap,
    library: TrackLibrary,
    completedStagesCount: number,
  ): ForkOptionInfo | null {
    if (!this.forkActive) return null;
    const next = library.nextTrackItem;
    if (next) {
      const best = library.getBestScore(next.contentHash);
      return {
        branch: 'right',
        mode: 'nextTrack',
        label: `NEXT STAGE (${library.currentIndex + 2}/${library.items.length})`,
        title: next.beatMap.title,
        artist: next.beatMap.artist,
        bpm: next.beatMap.bpm,
        contentHash: next.contentHash,
        bestScore: best?.bestScore ?? null,
        bestGrade: best?.bestGrade ?? null,
      };
    }
    const best = library.getBestScore(activeRoadBeatMap.contentHash);
    return {
      branch: 'right',
      mode: 'finishRun',
      label: 'FINISH PLAYLIST RUN',
      title: 'FINAL GRADE & SCORE SUMMARY',
      artist: `${completedStagesCount + 1} STAGES COMPLETED`,
      bpm: activeRoadBeatMap.bpm,
      contentHash: activeRoadBeatMap.contentHash,
      bestScore: best?.bestScore ?? null,
      bestGrade: best?.bestGrade ?? null,
    };
  }
}
