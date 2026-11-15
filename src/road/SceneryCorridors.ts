import { FORK_APPROACH_BARS } from '../config/constants';
import type { SeededRandom } from '../core/SeededRandom';
import type { RoadSegment, RoadSprite } from './RoadSegment';
import type { PlacedRoadChunk } from './SongRoadGenerator';

export interface PopulatePowerLinesOptions {
  /** Target fraction of eligible non-bridge road to cover with power lines (default: 0.50). */
  coverageRatio?: number;
  /** Minimum consecutive chunks in a single run (default: 1). */
  minRunChunks?: number;
  /** Maximum consecutive chunks in a single run (default: 4). */
  maxRunChunks?: number;
  /** Reserved bars before track end for stage fork approach (default: FORK_APPROACH_BARS = 6). */
  forkApproachBars?: number;
  /** Tower spacing in bars for runs >= 4 bars (default: 2). */
  spacingBars?: number;
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

  const coverageRatio = opts?.coverageRatio ?? 0.5;
  const maxRunChunks = opts?.maxRunChunks ?? 4;
  const forkApproachBars = opts?.forkApproachBars ?? FORK_APPROACH_BARS;
  const crossingEnabled = opts?.crossingEnabled ?? true;

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

  const targetCoveredBars = Math.round(totalEligibleBars * coverageRatio);

  // 3. Partition eligible sequences into section-aligned candidate runs (1..N chunks)
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
      const role = firstChunk.role;

      // Group consecutive chunks sharing the same musical role within maxRunChunks
      const runChunks: PlacedRoadChunk[] = [firstChunk];
      chunkIdx++;

      while (
        chunkIdx < seq.length &&
        seq[chunkIdx]!.role === role &&
        runChunks.length < maxRunChunks
      ) {
        runChunks.push(seq[chunkIdx]!);
        chunkIdx++;
      }

      const startBar = runChunks[0]!.startBar;
      const lastChunk = runChunks[runChunks.length - 1]!;
      const endBar = Math.min(maxBar, lastChunk.startBar + lastChunk.bars);
      const bars = endBar - startBar;

      if (bars >= 2) {
        candidates.push({ chunks: runChunks, startBar, endBar, bars });
      }
    }
  }

  if (candidates.length === 0) {
    return;
  }

  // 4. Select candidate runs to satisfy ~40-60% coverage target
  const selectedRuns: CandidateRun[] = [];
  let coveredBars = 0;

  // Pass A: Stochastic selection with ~55% pick rate per section block
  for (const candidate of candidates) {
    if (coveredBars + candidate.bars <= targetCoveredBars * 1.2) {
      if (rng.bool(0.55)) {
        selectedRuns.push(candidate);
        coveredBars += candidate.bars;
      }
    }
  }

  // Pass B: If coverage is below 40% floor, add remaining candidate runs until target is reached
  if (coveredBars / totalEligibleBars < 0.4) {
    for (const candidate of candidates) {
      if (!selectedRuns.includes(candidate)) {
        selectedRuns.push(candidate);
        coveredBars += candidate.bars;
        if (coveredBars / totalEligibleBars >= 0.42) {
          break;
        }
      }
    }
  }

  // 5. Place power pylon sprites for each selected run
  let nextChainId = 1;
  const occupiedBars = new Set<number>();

  for (const run of selectedRuns) {
    const chainId = nextChainId++;
    const side = rng.bool() ? 1 : -1;
    const baseMag = rng.range(3.8, 6.2);
    const baseOffset = side * baseMag;
    const driftTotal = side * rng.range(-0.3, 0.3);

    const spacingBars = run.bars <= 3 ? 1 : (opts?.spacingBars ?? 2);
    const towerBars: number[] = [];

    for (let b = run.startBar; b <= run.endBar; b += spacingBars) {
      towerBars.push(b);
    }

    // Ensure the terminal anchor lands at or near the run end
    if (towerBars.length >= 2) {
      const lastB = towerBars[towerBars.length - 1]!;
      if (run.endBar - lastB >= 1) {
        towerBars.push(run.endBar);
      }
    }

    // Filter down to valid road segments (non-bridge and within track bounds)
    const validBars: number[] = [];
    for (const b of towerBars) {
      const segIdx = b * segmentsPerBar;
      if (segIdx >= 0 && segIdx < segments.length && segments[segIdx]?.env !== 'bridge') {
        validBars.push(b);
      }
    }

    if (validBars.length < 2) {
      continue;
    }

    const towerCount = validBars.length;
    for (let i = 0; i < towerCount; i++) {
      const bar = validBars[i]!;
      occupiedBars.add(bar);

      const segIdx = bar * segmentsPerBar;
      const seg = segments[segIdx]!;

      const t = towerCount > 1 ? i / (towerCount - 1) : 0;
      const offset = Number((baseOffset + driftTotal * t).toFixed(3));
      // Variant: 1 = terminal/anchor (first & last), 0 = suspension (intermediate)
      const variant = (i === 0 || i === towerCount - 1) ? 1 : 0;

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
