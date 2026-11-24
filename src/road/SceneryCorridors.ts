import { FORK_APPROACH_BARS } from '../config/constants';
import type { SeededRandom } from '../core/SeededRandom';
import { ENVIRONMENT_ARCHETYPES, type EnvironmentArchetypeId } from './EnvironmentArchetypes';
import type { RoadSegment, RoadSprite, SegmentEnvironment } from './RoadSegment';
import type { PlacedRoadChunk } from './SongRoadGenerator';

export interface BlueprintPowerLineRun {
  readonly chainId: number;
  readonly startBar: number;
  readonly endBar: number;
  readonly side: -1 | 1;
  readonly baseOffset: number;
  readonly driftTotal: number;
  readonly spacingBeats: 2 | 3;
}

export interface BlueprintPowerLineCrossing {
  readonly bar: number;
  readonly offsetMag: number;
  readonly chainId: number;
}

export interface PowerLinePlanChunkInput {
  readonly startBar: number;
  readonly bars: number;
  readonly archetype?: EnvironmentArchetypeId;
}

export interface PlannedPowerLines {
  readonly runs: BlueprintPowerLineRun[];
  readonly crossing: BlueprintPowerLineCrossing | null;
}

/**
 * Zero-GC streaming cursor for incremental pylon emission inside `HorizonAssembler`.
 */
export interface PowerLineStreamState {
  activeRunIdx: number;
  lastTowerSlot: number;
  crossingEmitted: boolean;
}

export function createPowerLineStreamState(): PowerLineStreamState {
  return {
    activeRunIdx: 0,
    lastTowerSlot: -1,
    crossingEmitted: false,
  };
}

export function resetPowerLineStreamState(
  state: PowerLineStreamState,
  runs: readonly BlueprintPowerLineRun[],
  startBar: number,
  crossing: BlueprintPowerLineCrossing | null,
): void {
  let idx = 0;
  while (idx < runs.length && runs[idx]!.endBar <= startBar) {
    idx++;
  }
  state.activeRunIdx = idx;
  state.lastTowerSlot = -1;
  state.crossingEmitted = crossing === null || startBar > crossing.bar;
}

/**
 * Pure offline planner that computes deterministic power-line corridor runs & optional road crossing
 * purely in musical bar coordinates (`SongBlueprint` compatible, zero `RoadSegment[]` dependence).
 */
export function planPowerLineRuns(
  chunks: readonly PowerLinePlanChunkInput[],
  barEnv: readonly SegmentEnvironment[],
  totalBars: number,
  rng: SeededRandom,
  opts?: PopulatePowerLinesOptions,
  barCurveAbs?: readonly number[],
): PlannedPowerLines {
  if (chunks.length === 0 || totalBars <= 0) {
    return { runs: [], crossing: null };
  }

  const coverageRatio = opts?.coverageRatio ?? 0.34;
  const maxRunChunks = opts?.maxRunChunks ?? 3;
  const forkApproachBars = opts?.forkApproachBars ?? FORK_APPROACH_BARS;
  const crossingEnabled = opts?.crossingEnabled ?? true;
  const maxBar = Math.max(0, totalBars - forkApproachBars);

  const isChunkEligibleByBar = (chunk: PowerLinePlanChunkInput): boolean => {
    if (
      chunk.archetype !== undefined &&
      !ENVIRONMENT_ARCHETYPES[chunk.archetype].allowPowerLines
    ) {
      return false;
    }
    const endB = Math.min(totalBars, chunk.startBar + chunk.bars);
    for (let b = chunk.startBar; b < endB; b++) {
      if ((barEnv[b] ?? 'standard') !== 'standard') {
        return false;
      }
    }
    return true;
  };

  const eligibleSequences: PowerLinePlanChunkInput[][] = [];
  let currentSeq: PowerLinePlanChunkInput[] = [];
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i]!;
    if (chunk.startBar >= maxBar) break;
    if (isChunkEligibleByBar(chunk)) {
      currentSeq.push(chunk);
    } else if (currentSeq.length > 0) {
      eligibleSequences.push(currentSeq);
      currentSeq = [];
    }
  }
  if (currentSeq.length > 0) eligibleSequences.push(currentSeq);
  if (eligibleSequences.length === 0) return { runs: [], crossing: null };

  let totalEligibleBars = 0;
  for (const seq of eligibleSequences) {
    for (const chunk of seq) {
      totalEligibleBars += Math.max(0, Math.min(maxBar, chunk.startBar + chunk.bars) - chunk.startBar);
    }
  }
  if (totalEligibleBars < 4) return { runs: [], crossing: null };

  const maxCeilingBars =
    totalEligibleBars < 6
      ? Math.max(2, Math.ceil(totalEligibleBars * 0.45))
      : Math.floor(totalEligibleBars * 0.42);
  const minFloorBars =
    totalEligibleBars < 6
      ? Math.min(totalEligibleBars, 2)
      : Math.ceil(totalEligibleBars * 0.2);
  const targetCoveredBars = Math.min(
    maxCeilingBars,
    Math.max(minFloorBars, Math.round(totalEligibleBars * coverageRatio)),
  );
  const maxRunBars = Math.min(12, Math.max(4, maxCeilingBars));

  interface CandidateRun {
    startBar: number;
    endBar: number;
    bars: number;
  }

  const candidates: CandidateRun[] = [];
  for (const seq of eligibleSequences) {
    let chunkIdx = 0;
    while (chunkIdx < seq.length) {
      const firstChunk = seq[chunkIdx]!;
      let runChunksCount = 1;
      let runEndBar = Math.min(maxBar, firstChunk.startBar + firstChunk.bars);
      chunkIdx++;

      while (chunkIdx < seq.length && runChunksCount < maxRunChunks) {
        const nextChunk = seq[chunkIdx]!;
        const nextEndBar = Math.min(maxBar, nextChunk.startBar + nextChunk.bars);
        if (nextEndBar - firstChunk.startBar > maxRunBars) break;
        runChunksCount++;
        runEndBar = nextEndBar;
        chunkIdx++;
      }

      const startBar = firstChunk.startBar;
      const clampedEndBar = Math.min(runEndBar, startBar + maxCeilingBars);
      const bars = clampedEndBar - startBar;
      if (bars >= 2) {
        candidates.push({ startBar, endBar: clampedEndBar, bars });
      }
    }
  }
  if (candidates.length === 0) return { runs: [], crossing: null };

  const selectedRuns: CandidateRun[] = [];
  let coveredBars = 0;
  for (const candidate of candidates) {
    const prevRun = selectedRuns[selectedRuns.length - 1];
    const hasGap = !prevRun || candidate.startBar - prevRun.endBar >= 4;
    if (hasGap && coveredBars + candidate.bars <= maxCeilingBars) {
      if (coveredBars < targetCoveredBars && rng.bool(0.62)) {
        selectedRuns.push(candidate);
        coveredBars += candidate.bars;
      }
    }
  }
  if (coveredBars < minFloorBars) {
    for (const candidate of candidates) {
      if (selectedRuns.includes(candidate)) continue;
      const room = maxCeilingBars - coveredBars;
      if (room < 2) break;
      if (candidate.bars <= room) {
        selectedRuns.push(candidate);
        coveredBars += candidate.bars;
      } else {
        const trimmedBars = Math.min(room, Math.max(2, targetCoveredBars - coveredBars));
        selectedRuns.push({
          startBar: candidate.startBar,
          endBar: candidate.startBar + trimmedBars,
          bars: trimmedBars,
        });
        coveredBars += trimmedBars;
      }
      if (coveredBars >= targetCoveredBars || coveredBars >= minFloorBars) break;
    }
  }

  selectedRuns.sort((a, b) => a.startBar - b.startBar);

  let nextChainId = 1;
  const occupiedBars = new Set<number>();
  const runs: BlueprintPowerLineRun[] = [];
  for (const run of selectedRuns) {
    const chainId = nextChainId++;
    const side: -1 | 1 = rng.bool() ? 1 : -1;
    const baseMag = rng.range(3.9, 6.1);
    const baseOffset = side * baseMag;
    const driftTotal = side * rng.range(-0.35, 0.35);
    const spacingBeats: 2 | 3 =
      opts?.spacingBeats === 2 || opts?.spacingBeats === 3
        ? opts.spacingBeats
        : rng.bool(0.65)
          ? 2
          : 3;

    runs.push({
      chainId,
      startBar: run.startBar,
      endBar: run.endBar,
      side,
      baseOffset,
      driftTotal,
      spacingBeats,
    });
    for (let b = run.startBar; b < run.endBar; b++) {
      occupiedBars.add(b);
    }
  }

  let crossing: BlueprintPowerLineCrossing | null = null;
  if (crossingEnabled && rng.bool(0.6)) {
    const candidateCrossingBars: number[] = [];
    for (let b = 4; b < maxBar - 2; b++) {
      if (occupiedBars.has(b)) continue;
      if ((barEnv[b] ?? 'standard') !== 'standard') continue;
      let archAllowed = true;
      for (let c = 0; c < chunks.length; c++) {
        const ch = chunks[c]!;
        if (b >= ch.startBar && b < ch.startBar + ch.bars) {
          archAllowed =
            ch.archetype === undefined ||
            ENVIRONMENT_ARCHETYPES[ch.archetype].allowPowerLines;
          break;
        }
      }
      if (!archAllowed) continue;
      if (barCurveAbs && (barCurveAbs[b] ?? 0) >= 1.0) continue;
      candidateCrossingBars.push(b);
    }
    if (candidateCrossingBars.length > 0) {
      crossing = {
        bar: rng.pick(candidateCrossingBars),
        offsetMag: Number(rng.range(3.8, 4.8).toFixed(3)),
        chainId: nextChainId,
      };
    }
  }

  return { runs, crossing };
}

/**
 * Incrementally emits streamed `pylon` sprites into `emitSprite` when `prevBarFloat -> nextBarFloat`
 * crosses a scheduled pylon beat inside `runs` or `crossing` (zero GC).
 */
export function emitStreamedPowerLinesForSegment(
  state: PowerLineStreamState,
  runs: readonly BlueprintPowerLineRun[],
  crossing: BlueprintPowerLineCrossing | null,
  prevBarFloat: number,
  nextBarFloat: number,
  segEnv: SegmentEnvironment,
  emitSprite: (kind: 'pylon', offset: number, variant: number, scale: number, chainId: number) => void,
): void {
  if (segEnv !== 'standard') return;

  // Advance past completed runs
  while (state.activeRunIdx < runs.length && prevBarFloat >= runs[state.activeRunIdx]!.endBar) {
    state.activeRunIdx++;
    state.lastTowerSlot = -1;
  }

  if (state.activeRunIdx < runs.length) {
    const run = runs[state.activeRunIdx]!;
    const runStartBeat = run.startBar * 4;
    const runEndBeat = run.endBar * 4 - 1; // mirror static runEndSeg = endBar - 1 beat
    const spanBeats = Math.max(1, runEndBeat - runStartBeat);
    const spanCount = Math.max(1, Math.round(spanBeats / run.spacingBeats));
    const curBeat = nextBarFloat * 4;

    if (curBeat >= runStartBeat && prevBarFloat * 4 <= runEndBeat) {
      const slotFloat = ((curBeat - runStartBeat) / spanBeats) * spanCount;
      const slot = Math.min(spanCount, Math.max(0, Math.floor(slotFloat + 1e-6)));
      if (slot > state.lastTowerSlot && curBeat >= runStartBeat + (spanBeats * slot) / spanCount - 1e-5) {
        state.lastTowerSlot = slot;
        const t = spanCount > 0 ? slot / spanCount : 0;
        const offset = Math.round((run.baseOffset + run.driftTotal * t) * 1000) / 1000;
        const variant = slot === 0 || slot === spanCount ? 1 : 0;
        emitSprite('pylon', offset, variant, 1.0, run.chainId);
      }
    }
  }

  if (crossing && !state.crossingEmitted && nextBarFloat >= crossing.bar && prevBarFloat <= crossing.bar + 0.25) {
    state.crossingEmitted = true;
    emitSprite('pylon', -crossing.offsetMag, 2, 1.0, crossing.chainId);
    emitSprite('pylon', crossing.offsetMag, 2, 1.0, crossing.chainId);
  }
}

export interface PopulatePowerLinesOptions {
  /** Target fraction of eligible non-bridge road to cover with power lines (default: 0.34). */
  coverageRatio?: number;
  /** Minimum consecutive chunks in a single run (default: 1). */
  minRunChunks?: number;
  /** Maximum consecutive chunks in a single run (default: 3). */
  maxRunChunks?: number;
  /** Reserved bars before track end for stage fork approach (default: FORK_APPROACH_BARS = 6). */
  forkApproachBars?: number;
  /** Optional explicit tower spacing in bars (overrides beat-based spacing if provided). */
  spacingBars?: number;
  /** Beats per bar for beat-subdivision spacing (default: 4). */
  beatsPerBar?: number;
  /** Optional explicit tower spacing in beats (default: 2 or 3 beats per corridor). */
  spacingBeats?: number;
  /** Whether to place a rare high-voltage road crossing (at most 1 per song, default: true). */
  crossingEnabled?: boolean;
}

/**
 * Checks if all segments belonging to a placed chunk are standard open segments
 * and its active environmental archetype supports power-line corridors.
 */
function isChunkEligible(chunk: PlacedRoadChunk, segments: readonly RoadSegment[]): boolean {
  if (
    chunk.archetype !== undefined &&
    !ENVIRONMENT_ARCHETYPES[chunk.archetype].allowPowerLines
  ) {
    return false;
  }
  const endSeg = Math.min(segments.length, chunk.startSegment + chunk.segmentCount);
  for (let i = chunk.startSegment; i < endSeg; i++) {
    if (segments[i]?.env !== 'standard') {
      return false;
    }
  }
  return true;
}

function isBarArchetypePowerLineAllowed(
  placedChunks: readonly PlacedRoadChunk[],
  bar: number,
): boolean {
  for (let i = 0; i < placedChunks.length; i++) {
    const c = placedChunks[i]!;
    if (bar >= c.startBar && bar < c.startBar + c.bars) {
      return (
        c.archetype === undefined ||
        ENVIRONMENT_ARCHETYPES[c.archetype].allowPowerLines
      );
    }
  }
  return true;
}

/**
 * Populates continuous high-voltage power lines along multi-chunk roadside corridors.
 *
 * Requirements (docs/DESIGN.md §2 Fase 3):
 * - Spans 1..N consecutive placed chunks (preferring whole musical sections).
 * - Covers ~40-60% of eligible non-bridge road overall.
 * - Stops before bridge segments and before the final stage fork approach.
 * - Downbeat-aligned tower spacing (every 2 bars, 1 bar for short runs).
 * - Fixed side per run with slow lateral drift (<= 0.3) in band C/D (offset 3.8..7.0).
 * - Distinct variant: 1 = terminal/anchor tower (first and last), 0 = suspension (mid-run).
 * - Optional rare crossing (<= 1 per song, variant 2 on both shoulders of the same segment).
 * - 100% deterministic (uses SeededRandom only).
 */
export function populatePowerLines(
  segments: RoadSegment[],
  placedChunks: readonly PlacedRoadChunk[],
  segmentsPerBar: number,
  rng: SeededRandom,
  opts?: PopulatePowerLinesOptions,
): void {
  if (segments.length === 0 || placedChunks.length === 0 || segmentsPerBar <= 0) {
    return;
  }

  const coverageRatio = opts?.coverageRatio ?? 0.34;
  const maxRunChunks = opts?.maxRunChunks ?? 3;
  const forkApproachBars = opts?.forkApproachBars ?? FORK_APPROACH_BARS;
  const crossingEnabled = opts?.crossingEnabled ?? true;
  const beatsPerBar = opts?.beatsPerBar ?? 4;
  const segmentsPerBeat = Math.max(2, Math.round(segmentsPerBar / beatsPerBar));

  const totalBars = Math.floor(segments.length / segmentsPerBar);
  const maxBar = Math.max(0, totalBars - forkApproachBars);

  // 1. Group contiguous eligible (non-bridge, pre-fork) placed chunks
  const eligibleSequences: PlacedRoadChunk[][] = [];
  let currentSeq: PlacedRoadChunk[] = [];

  for (let i = 0; i < placedChunks.length; i++) {
    const chunk = placedChunks[i]!;
    if (chunk.startBar >= maxBar) {
      break;
    }
    if (isChunkEligible(chunk, segments)) {
      currentSeq.push(chunk);
    } else {
      if (currentSeq.length > 0) {
        eligibleSequences.push(currentSeq);
        currentSeq = [];
      }
    }
  }
  if (currentSeq.length > 0) {
    eligibleSequences.push(currentSeq);
  }

  if (eligibleSequences.length === 0) {
    return;
  }

  // 2. Compute total eligible bars
  let totalEligibleBars = 0;
  for (const seq of eligibleSequences) {
    for (const chunk of seq) {
      const chunkEndBar = Math.min(maxBar, chunk.startBar + chunk.bars);
      const b = Math.max(0, chunkEndBar - chunk.startBar);
      totalEligibleBars += b;
    }
  }

  if (totalEligibleBars < 4) {
    return;
  }

  const maxCeilingBars =
    totalEligibleBars < 6
      ? Math.max(2, Math.ceil(totalEligibleBars * 0.45))
      : Math.floor(totalEligibleBars * 0.42);
  const minFloorBars =
    totalEligibleBars < 6
      ? Math.min(totalEligibleBars, 2)
      : Math.ceil(totalEligibleBars * 0.2);
  const targetCoveredBars = Math.min(
    maxCeilingBars,
    Math.max(minFloorBars, Math.round(totalEligibleBars * coverageRatio)),
  );
  const maxRunBars = Math.min(12, Math.max(4, maxCeilingBars));

  // 3. Partition eligible sequences into multi-chunk corridor candidates (spanning 1..3 chunks)
  interface CandidateRun {
    chunks: PlacedRoadChunk[];
    startBar: number;
    endBar: number;
    bars: number;
  }

  const candidates: CandidateRun[] = [];

  for (const seq of eligibleSequences) {
    let chunkIdx = 0;
    while (chunkIdx < seq.length) {
      const firstChunk = seq[chunkIdx]!;
      const runChunks: PlacedRoadChunk[] = [firstChunk];
      let runEndBar = Math.min(maxBar, firstChunk.startBar + firstChunk.bars);
      chunkIdx++;

      while (chunkIdx < seq.length && runChunks.length < maxRunChunks) {
        const nextChunk = seq[chunkIdx]!;
        const nextEndBar = Math.min(maxBar, nextChunk.startBar + nextChunk.bars);
        if (nextEndBar - firstChunk.startBar > maxRunBars) {
          break;
        }
        runChunks.push(nextChunk);
        runEndBar = nextEndBar;
        chunkIdx++;
      }

      const startBar = firstChunk.startBar;
      const clampedEndBar = Math.min(runEndBar, startBar + maxCeilingBars);
      const bars = clampedEndBar - startBar;

      if (bars >= 2) {
        candidates.push({ chunks: runChunks, startBar, endBar: clampedEndBar, bars });
      }
    }
  }

  if (candidates.length === 0) {
    return;
  }

  // 4. Select candidate corridors within [minFloorBars, maxCeilingBars] with natural open gaps
  const selectedRuns: CandidateRun[] = [];
  let coveredBars = 0;

  // Pass A: Stochastic selection preferring distinct separated corridors across chunks
  for (const candidate of candidates) {
    const prevRun = selectedRuns[selectedRuns.length - 1];
    const hasGap = !prevRun || candidate.startBar - prevRun.endBar >= 4;
    if (hasGap && coveredBars + candidate.bars <= maxCeilingBars) {
      if (coveredBars < targetCoveredBars && rng.bool(0.62)) {
        selectedRuns.push(candidate);
        coveredBars += candidate.bars;
      }
    }
  }

  // Pass B: Guarantee coverage floor without exceeding maxCeilingBars
  if (coveredBars < minFloorBars) {
    for (const candidate of candidates) {
      if (selectedRuns.includes(candidate)) continue;
      const room = maxCeilingBars - coveredBars;
      if (room < 2) break;

      if (candidate.bars <= room) {
        selectedRuns.push(candidate);
        coveredBars += candidate.bars;
      } else {
        const trimmedBars = Math.min(room, Math.max(2, targetCoveredBars - coveredBars));
        selectedRuns.push({
          chunks: candidate.chunks,
          startBar: candidate.startBar,
          endBar: candidate.startBar + trimmedBars,
          bars: trimmedBars,
        });
        coveredBars += trimmedBars;
      }

      if (coveredBars >= targetCoveredBars || coveredBars >= minFloorBars) {
        break;
      }
    }
  }

  // Sort runs chronologically along track
  selectedRuns.sort((a, b) => a.startBar - b.startBar);

  // 5. Place continuous beat-spaced power pylon sprites for each selected corridor
  let nextChainId = 1;
  const occupiedBars = new Set<number>();
  const maxAllowedSeg = maxBar * segmentsPerBar;

  for (const run of selectedRuns) {
    const chainId = nextChainId++;
    const side = rng.bool() ? 1 : -1;
    const baseMag = rng.range(3.9, 6.1);
    const baseOffset = side * baseMag;
    const driftTotal = side * rng.range(-0.35, 0.35);

    const spacingBeats = opts?.spacingBeats ?? (rng.bool(0.65) ? 2 : 3);
    const stepSegs =
      opts?.spacingBars !== undefined
        ? Math.max(4, Math.round(opts.spacingBars * segmentsPerBar))
        : Math.max(6, spacingBeats * segmentsPerBeat);

    const runStartSeg = run.startBar * segmentsPerBar;
    const runEndSeg = Math.min(maxAllowedSeg, run.endBar * segmentsPerBar - segmentsPerBeat);
    const spanSegs = runEndSeg - runStartSeg;
    if (spanSegs < 4) {
      continue;
    }

    const spanCount = Math.max(1, Math.round(spanSegs / stepSegs));
    const validSegs: number[] = [];
    for (let i = 0; i <= spanCount; i++) {
      const segIdx = Math.round(runStartSeg + (spanSegs * i) / spanCount);
      if (
        segIdx >= 0 &&
        segIdx < segments.length &&
        segIdx <= maxAllowedSeg &&
        segments[segIdx]?.env === 'standard' &&
        (validSegs.length === 0 || validSegs[validSegs.length - 1] !== segIdx)
      ) {
        validSegs.push(segIdx);
      }
    }

    if (validSegs.length < 2) {
      continue;
    }

    for (let b = run.startBar; b < run.endBar; b++) {
      occupiedBars.add(b);
    }

    const towerCount = validSegs.length;
    for (let i = 0; i < towerCount; i++) {
      const segIdx = validSegs[i]!;
      const bar = Math.floor(segIdx / segmentsPerBar);
      occupiedBars.add(bar);

      const seg = segments[segIdx]!;
      const t = towerCount > 1 ? i / (towerCount - 1) : 0;
      const offset = Number((baseOffset + driftTotal * t).toFixed(3));
      // Variant: 1 = terminal/anchor (first & last), 0 = suspension (intermediate)
      const variant = i === 0 || i === towerCount - 1 ? 1 : 0;

      const sprite: RoadSprite = {
        kind: 'pylon',
        offset,
        variant,
        chainId,
        scale: 1.0,
      };

      seg.sprites.push(sprite);
    }
  }

  // 6. Optional rare crossing (<= 1 per song): twin towers spanning both shoulders
  if (crossingEnabled && rng.bool(0.6)) {
    const candidateCrossingBars: number[] = [];
    for (let b = 4; b < maxBar - 2; b++) {
      if (occupiedBars.has(b)) continue;
      if (!isBarArchetypePowerLineAllowed(placedChunks, b)) continue;
      const segIdx = b * segmentsPerBar;
      const seg = segments[segIdx];
      if (seg && seg.env === 'standard' && Math.abs(seg.curve) < 1.0) {
        candidateCrossingBars.push(b);
      }
    }

    if (candidateCrossingBars.length > 0) {
      const crossingBar = rng.pick(candidateCrossingBars);
      const crossingChainId = nextChainId;
      const crossMag = Number(rng.range(3.8, 4.8).toFixed(3));
      const segIdx = crossingBar * segmentsPerBar;
      const seg = segments[segIdx]!;

      seg.sprites.push(
        {
          kind: 'pylon',
          offset: -crossMag,
          variant: 2,
          chainId: crossingChainId,
          scale: 1.0,
        },
        {
          kind: 'pylon',
          offset: crossMag,
          variant: 2,
          chainId: crossingChainId,
          scale: 1.0,
        },
      );
    }
  }
}
