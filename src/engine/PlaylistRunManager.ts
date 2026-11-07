import type { BeatJudgementTier } from '@src/audio/BeatClock';
import type { BeatMap } from '@src/audio/BeatMap';
import {
  computeOverallRunGrade,
  computeStageGrade,
  type RunGrade,
  type StageScoreSummary,
  type TrackLibrary,
} from '@src/audio/TrackLibrary';
import { tuning } from '@src/config/tuning';
import type { PlayerCar } from '@src/entities/PlayerCar';

export interface RunSummary {
  totalScore: number;
  overallGrade: RunGrade;
  stages: readonly StageScoreSummary[];
  maxGroove: number;
  totalPerfectShifts: number;
  totalDropSyncs: number;
  totalCollisions: number;
  totalSodaSpills: number;
}

/**
 * Tracks per-stage and full-playlist scoring, Groove statistics, shift counts,
 * and end-of-stage / end-of-run grade summaries (AGENTS.md §2, §5 M6).
 *
 * Pure TypeScript module (zero React imports).
 */
export class PlaylistRunManager {
  stageNumber = 1;
  stageScore = 0;
  stagePerfectShifts = 0;
  stageGoodShifts = 0;
  stageDropSyncs = 0;
  stageCollisions = 0;
  stageSpills = 0;
  stageGrooveTimeSum = 0;
  stageGrooveTimeWeight = 0;
  stageMaxGroove = 15;
  stageTofuUsed = false;

  readonly completedStages: StageScoreSummary[] = [];

  resetStageMetrics(currentGroove: number, tofuActive: boolean): void {
    this.stageScore = 0;
    this.stagePerfectShifts = 0;
    this.stageGoodShifts = 0;
    this.stageDropSyncs = 0;
    this.stageCollisions = 0;
    this.stageSpills = 0;
    this.stageGrooveTimeSum = 0;
    this.stageGrooveTimeWeight = 0;
    this.stageMaxGroove = Math.round(currentGroove);
    this.stageTofuUsed = tofuActive;
  }

  restartRun(currentGroove: number, tofuActive: boolean): void {
    this.completedStages.length = 0;
    this.stageNumber = 1;
    this.resetStageMetrics(currentGroove, tofuActive);
  }

  accumulateDrivingStep(dt: number, car: PlayerCar, tofuActive: boolean): void {
    if (!car.isOffRoad && car.speedRatio > 0.2) {
      const tofuMult = tofuActive ? tuning.tofuGrooveMultiplier : 1;
      const driftMult = car.isDrifting ? 1.35 : 1.0;
      this.stageScore +=
        car.speedRatio * (22 + car.groove * 0.78) * tofuMult * driftMult * dt;
    }
    if (tofuActive) {
      this.stageTofuUsed = true;
    }
    this.stageGrooveTimeSum += car.groove * dt;
    this.stageGrooveTimeWeight += dt;
    if (car.groove > this.stageMaxGroove) {
      this.stageMaxGroove = Math.round(car.groove);
    }
  }

  recordShift(rewardTier: BeatJudgementTier, isDownbeat: boolean): void {
    if (rewardTier === 'PERFECT') {
      this.stagePerfectShifts++;
      this.stageScore += isDownbeat ? 500 : 350;
    } else if (rewardTier === 'GOOD') {
      this.stageGoodShifts++;
      this.stageScore += 150;
    }
  }

  recordDropSync(): void {
    this.stageDropSyncs++;
    this.stageScore += 800;
  }

  recordTruckKnockedOff(): void {
    this.stageScore += 400;
  }

  recordCollision(): void {
    this.stageCollisions++;
  }

  recordSodaSpill(): void {
    this.stageSpills++;
  }

  finalizeStageSummary(
    completedBeatMap: BeatMap,
    currentGroove: number,
    lapTime: number,
    library: TrackLibrary,
  ): { summary: StageScoreSummary; isNewRecord: boolean } {
    const avgGroove =
      this.stageGrooveTimeWeight > 0
        ? Math.round(this.stageGrooveTimeSum / this.stageGrooveTimeWeight)
        : Math.round(currentGroove);
    const finalScore = Math.max(0, Math.round(this.stageScore));
    const grade = computeStageGrade(
      finalScore,
      avgGroove,
      this.stageSpills,
      this.stageCollisions,
    );

    const summary: StageScoreSummary = {
      stageNumber: this.stageNumber,
      contentHash: completedBeatMap.contentHash,
      title: completedBeatMap.title,
      artist: completedBeatMap.artist,
      bpm: completedBeatMap.bpm,
      score: finalScore,
      grade,
      avgGroove,
      maxGroove: this.stageMaxGroove,
      perfectShifts: this.stagePerfectShifts,
      goodShifts: this.stageGoodShifts,
      dropSyncs: this.stageDropSyncs,
      collisions: this.stageCollisions,
      sodaSpills: this.stageSpills,
      tofuModeUsed: this.stageTofuUsed,
      durationSec: Math.round(lapTime * 100) / 100,
    };

    const { isNewRecord } = library.recordStageResult(summary);
    summary.isNewRecord = isNewRecord;
    return { summary, isNewRecord };
  }

  buildRunSummary(): RunSummary {
    const stages = this.completedStages.length > 0 ? [...this.completedStages] : [];
    let totalScore = 0;
    let maxGroove = 0;
    let totalPerfectShifts = 0;
    let totalDropSyncs = 0;
    let totalCollisions = 0;
    let totalSodaSpills = 0;

    for (let i = 0; i < stages.length; i++) {
      const s = stages[i]!;
      totalScore += s.score;
      if (s.maxGroove > maxGroove) maxGroove = s.maxGroove;
      totalPerfectShifts += s.perfectShifts;
      totalDropSyncs += s.dropSyncs;
      totalCollisions += s.collisions;
      totalSodaSpills += s.sodaSpills;
    }

    return {
      totalScore,
      overallGrade: computeOverallRunGrade(stages),
      stages,
      maxGroove,
      totalPerfectShifts,
      totalDropSyncs,
      totalCollisions,
      totalSodaSpills,
    };
  }
}
