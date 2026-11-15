import { FORK_APPROACH_BARS } from '../config/constants';
import type { SeededRandom } from '../core/SeededRandom';
import type { RoadSegment, RoadSprite } from './RoadSegment';
import type { PlacedRoadChunk } from './SongRoadGenerator';

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
 * Checks if all segments belonging to a placed chunk are non-bridge segments.
 */
function isChunkEligible(chunk: PlacedRoadChunk, segments: readonly RoadSegment[]): boolean {
  const endSeg = Math.min(segments.length, chunk.startSegment + chunk.segmentCount);
  for (let i = chunk.startSegment; i < endSeg; i++) {
    if (segments[i]?.env === 'bridge') {
      return false;
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
        segments[segIdx]?.env !== 'bridge' &&
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
      const segIdx = b * segmentsPerBar;
      const seg = segments[segIdx];
      if (seg && seg.env !== 'bridge' && Math.abs(seg.curve) < 1.0) {
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
