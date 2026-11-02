import {
  barDurationSec,
  beatDurationSec,
  sectionAtBar,
  type BeatMap,
  type SectionRole,
} from './BeatMap';

export interface BeatClockState {
  /** Compensated playback position within the current track (seconds). */
  trackTimeSec: number;
  /** Continuous beat index since `firstBeatOffsetSec` (can be negative before first downbeat). */
  beatFloat: number;
  /** 0-based integer beat index (`Math.floor(beatFloat)`). */
  beatIndex: number;
  /** Beat within the current bar (`0..3`). */
  beatInBar: number;
  /** 0-based bar index (`Math.floor(beatIndex / beatsPerBar)`). */
  barIndex: number;
  /** Fractional phase within the current beat `[0, 1)`. `0` is exact beat impact. */
  beatPhase: number;
  /** Exponential decay pulse `[0, 1]` peaking at `1` on each beat and decaying toward `0`. */
  beatPulse: number;
  /** Stronger pulse `[0, 1]` peaking on downbeats (beat 1 of each bar). */
  downbeatPulse: number;
  /** Current structural section role (`intro`, `build`, `drop`, `breakdown`, `outro`). */
  sectionRole: SectionRole;
  /** Current bar's normalised energy `[0, 1]` from `BeatMap.barEnergy`. */
  barEnergy: number;
  /** True when a new beat boundary was crossed since the previous `sample()` call. */
  justCrossedBeat: boolean;
  /** True when a new bar (downbeat) boundary was crossed since the previous `sample()` call. */
  justCrossedBar: boolean;
}

export type BeatJudgementTier = 'PERFECT' | 'GOOD' | 'OFF';

export interface BeatJudgement {
  tier: BeatJudgementTier;
  /** Signed timing error in milliseconds (`< 0` = early, `> 0` = late). */
  deltaMs: number;
  /** Nearest integer beat index judged against. */
  beatIndex: number;
  /** True when the judged beat is Beat 1 (downbeat) of a bar. */
  isDownbeat: boolean;
}

export interface BeatJudgementWindows {
  perfectMs?: number;
  goodMs?: number;
}

/**
 * Deterministic BPM beat/bar calculator anchored to the Web Audio clock
 * (`AudioContext.currentTime` with output-latency compensation, AGENTS.md §2 & §4.8).
 *
 * Pure TypeScript module (zero React imports).
 */
export class BeatClock {
  private beatMap: BeatMap;
  private lastBeatIndex = -999999;
  private lastBarIndex = -999999;

  private readonly state: BeatClockState = {
    trackTimeSec: 0,
    beatFloat: 0,
    beatIndex: 0,
    beatInBar: 0,
    barIndex: 0,
    beatPhase: 0,
    beatPulse: 0,
    downbeatPulse: 0,
    sectionRole: 'intro',
    barEnergy: 0.5,
    justCrossedBeat: false,
    justCrossedBar: false,
  };

  constructor(beatMap: BeatMap) {
    this.beatMap = beatMap;
  }

  get map(): BeatMap {
    return this.beatMap;
  }

  setBeatMap(beatMap: BeatMap): void {
    this.beatMap = beatMap;
    this.resetCrossingState();
  }

  resetCrossingState(): void {
    this.lastBeatIndex = -999999;
    this.lastBarIndex = -999999;
  }

  /**
   * Samples the beat grid at `trackTimeSec` (already output-latency compensated).
   * Mutates and returns a pre-allocated state struct (AGENTS.md §4.3: zero GC in hot loop).
   */
  sample(trackTimeSec: number): Readonly<BeatClockState> {
    const map = this.beatMap;
    const beatDur = beatDurationSec(map);
    const beatFloat = (trackTimeSec - map.firstBeatOffsetSec) / beatDur;
    const beatIndex = Math.floor(beatFloat);
    const beatPhase = ((beatFloat % 1) + 1) % 1;
    const barIndex = Math.floor(beatIndex / map.beatsPerBar);
    const beatInBar = ((beatIndex % map.beatsPerBar) + map.beatsPerBar) % map.beatsPerBar;

    // Crisp exponential decay envelope for visual road/sky BPM pulse
    const beatPulse = Math.exp(-beatPhase * 5.2);
    const barPhase = ((beatFloat / map.beatsPerBar) % 1 + 1) % 1;
    const downbeatPulse = Math.exp(-barPhase * 6.5);

    const justCrossedBeat =
      this.lastBeatIndex !== -999999 && beatIndex > this.lastBeatIndex && beatIndex >= 0;
    const justCrossedBar =
      this.lastBarIndex !== -999999 && barIndex > this.lastBarIndex && barIndex >= 0;

    this.lastBeatIndex = beatIndex;
    this.lastBarIndex = barIndex;

    const clampedBar = Math.max(0, Math.min(map.barEnergy.length - 1, barIndex));
    const barEnergy = map.barEnergy[clampedBar] ?? 0.5;
    const sec = sectionAtBar(map, Math.max(0, barIndex));

    this.state.trackTimeSec = trackTimeSec;
    this.state.beatFloat = beatFloat;
    this.state.beatIndex = beatIndex;
    this.state.beatInBar = beatInBar;
    this.state.barIndex = barIndex;
    this.state.beatPhase = beatPhase;
    this.state.beatPulse = beatPulse;
    this.state.downbeatPulse = downbeatPulse;
    this.state.sectionRole = sec?.role ?? 'drop';
    this.state.barEnergy = barEnergy;
    this.state.justCrossedBeat = justCrossedBeat;
    this.state.justCrossedBar = justCrossedBar;

    return this.state;
  }

  /**
   * Judges a timestamped input event (converted to track time in seconds) against the
   * nearest beat on the grid (docs/DESIGN.md §4, AGENTS.md §4.8).
   */
  judgeTrackTime(
    eventTrackTimeSec: number,
    windows: BeatJudgementWindows = {},
  ): BeatJudgement {
    const perfectMs = windows.perfectMs ?? 50;
    const goodMs = windows.goodMs ?? 100;

    const map = this.beatMap;
    if (!map.confidence.tempoStable) {
      return {
        tier: 'OFF',
        deltaMs: 0,
        beatIndex: 0,
        isDownbeat: false,
      };
    }

    const beatDur = beatDurationSec(map);
    const beatFloat = (eventTrackTimeSec - map.firstBeatOffsetSec) / beatDur;
    const nearestBeat = Math.round(beatFloat);
    const nearestBeatSec = map.firstBeatOffsetSec + nearestBeat * beatDur;
    const deltaMs = (eventTrackTimeSec - nearestBeatSec) * 1000;
    const absMs = Math.abs(deltaMs);

    const isDownbeat =
      ((nearestBeat % map.beatsPerBar) + map.beatsPerBar) % map.beatsPerBar === 0;

    let tier: BeatJudgementTier = 'OFF';
    if (absMs <= perfectMs) {
      tier = 'PERFECT';
    } else if (absMs <= goodMs) {
      tier = 'GOOD';
    }

    return {
      tier,
      deltaMs: Math.round(deltaMs * 10) / 10,
      beatIndex: nearestBeat,
      isDownbeat,
    };
  }

  /** Returns the track timestamp (in seconds) of the next 4-bar phrase boundary after `trackTimeSec`. */
  nextFourBarBoundarySec(trackTimeSec: number): number {
    const map = this.beatMap;
    const barDur = barDurationSec(map);
    const curBarFloat = (trackTimeSec - map.firstBeatOffsetSec) / barDur;
    const nextFourBar = Math.max(4, (Math.floor(curBarFloat / 4) + 1) * 4);
    return map.firstBeatOffsetSec + nextFourBar * barDur;
  }
}
