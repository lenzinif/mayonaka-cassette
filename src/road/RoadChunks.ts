import type { SectionRole } from '@src/audio/BeatMap';
import type { PropKind, SegmentEnvironment } from './RoadSegment';
import { CURVE, HILL } from './TrackBuilder';

/**
 * Hand-authored bar-length road "chunks" tagged by musical section role (docs/DESIGN.md §3).
 *
 * Pure TypeScript module (AGENTS.md §2: zero React imports).
 *
 * Each `RoadChunk` spans 4 or 8 musical bars (16 or 32 beats — roughly 8 to 16 seconds of driving
 * at 120 BPM) and is composed of sequential `maneuvers` whose `bars` sum to `chunk.bars`.
 */

export type PropPlacement =
  | 'both'
  | 'left'
  | 'right'
  | 'alternating'
  | 'outside-curve'
  | 'inside-curve';

export interface ChunkPropRule {
  kind: PropKind;
  placement: PropPlacement;
  /** Spacing in musical beats (1 = every beat, 2 = every 2 beats, 4 = once per bar). */
  everyBeats: number;
  /** Lateral distance from road centre in road half-widths (default: 1.35 for palm/lamp, 1.75 for billboard). */
  offset?: number;
}

export interface ChunkManeuver {
  /** Duration of this maneuver in musical bars (can be 1, 2, 4, etc.; must sum to `chunk.bars`). */
  bars: number;
  /** Peak horizontal curvature (+right / -left). Scaled by `barEnergy` during generation. */
  curve: number;
  /** Elevation change over this maneuver (+uphill / -downhill in HILL units). */
  elevation: number;
  /**
   * Optional `[enterRatio, leaveRatio]` in `[0, 0.5]` controlling how much of the maneuver eases
   * into and out of `curve`. Defaults to `[0.25, 0.25]`.
   */
  easeRatio?: readonly [number, number];
}

export interface RoadChunk {
  /** Unique kebab-case identifier (used in telemetry, tests, and debug views). */
  id: string;
  /** Human-readable designer description of the driving feel. */
  description: string;
  /** Musical section role this chunk belongs to. */
  role: SectionRole;
  /** Total length of the chunk in bars (`4` or `8`). Must equal the sum of `maneuvers[].bars`. */
  bars: 4 | 8;
  /** Whether `SongRoadGenerator` can mirror (`curve * -1`) this chunk (default `true`). */
  allowMirror?: boolean;
  /** Selection probability weight within the role pool (default `1.0`). */
  weight?: number;
  /** Preferred `[minEnergy, maxEnergy]` in `[0, 1]` (default `[0, 1]`). */
  energyRange?: readonly [number, number];
  /**
   * When `true` (used on `build` chunks), guarantees the elevation climbs continuously to a
   * horizon-occluding crest at the exact end of the chunk so the road reveals on the drop.
   */
  crestOnExit?: boolean;
  env?: SegmentEnvironment;
  /** Ordered sequence of road maneuvers whose `bars` sum to `chunk.bars`. */
  maneuvers: readonly ChunkManeuver[];
  /** Roadside prop rhythm rules for this chunk. */
  props: readonly ChunkPropRule[];
}

/** Validates that a `RoadChunk` definition has consistent bar counts and valid parameters. */
export function validateRoadChunk(chunk: RoadChunk): RoadChunk {
  if (!chunk.id || typeof chunk.id !== 'string') {
    throw new Error('RoadChunk must have a non-empty string id');
  }
  if (chunk.bars !== 4 && chunk.bars !== 8) {
    throw new Error(`RoadChunk "${chunk.id}" bars must be 4 or 8 (got ${String(chunk.bars)})`);
  }
  if (chunk.maneuvers.length === 0) {
    throw new Error(`RoadChunk "${chunk.id}" must contain at least one maneuver`);
  }
  let sumBars = 0;
  for (const m of chunk.maneuvers) {
    if (m.bars <= 0 || !Number.isFinite(m.bars)) {
      throw new Error(`RoadChunk "${chunk.id}" has invalid maneuver bars: ${String(m.bars)}`);
    }
    sumBars += m.bars;
  }
  if (Math.abs(sumBars - chunk.bars) > 1e-6) {
    throw new Error(
      `RoadChunk "${chunk.id}" maneuvers sum to ${sumBars} bars, expected ${chunk.bars}`,
    );
  }
  return chunk;
}

/** Helper for defining and immediately validating a `RoadChunk`. */
export function defineChunk(chunk: RoadChunk): RoadChunk {
  return validateRoadChunk(chunk);
}

/**
 * Canonical vocabulary of hand-authored `RoadChunks` (docs/DESIGN.md §3).
 */
export const ROAD_CHUNKS: readonly RoadChunk[] = [
  // ============================================================================
  // INTRO — Gentle straights, wide sweepers, scenery establishing
  // ============================================================================
  defineChunk({
    id: 'intro-boulevard-cruise',
    description: 'Rettilineo panoramico con palme cadenzate ogni mezza battuta e leggera brezza finale',
    role: 'intro',
    bars: 4,
    weight: 1.2,
    energyRange: [0.0, 0.55],
    maneuvers: [
      { bars: 2, curve: 0, elevation: 0 },
      { bars: 2, curve: CURVE.EASY * 0.75, elevation: HILL.LOW * 0.4 },
    ],
    props: [
      { kind: 'palm', placement: 'both', everyBeats: 2, offset: 1.35 },
      { kind: 'lamp', placement: 'alternating', everyBeats: 4, offset: 1.2 },
    ],
  }),

  defineChunk({
    id: 'intro-sunset-sweeper',
    description: 'Ampio curvone dolce a 8 battute con ondina costiera per scaldare le gomme',
    role: 'intro',
    bars: 8,
    weight: 1.1,
    energyRange: [0.15, 0.65],
    maneuvers: [
      { bars: 2, curve: 0, elevation: HILL.LOW * 0.5 },
      { bars: 4, curve: CURVE.EASY, elevation: -HILL.LOW * 0.5 },
      { bars: 2, curve: -CURVE.EASY * 0.5, elevation: 0 },
    ],
    props: [
      { kind: 'palm', placement: 'outside-curve', everyBeats: 2, offset: 1.4 },
      { kind: 'billboard', placement: 'inside-curve', everyBeats: 8, offset: 1.75 },
    ],
  }),

  defineChunk({
    id: 'intro-neon-gateway',
    description: 'Ingresso cittadino con lampioni simmetrici e doppia curva morbida',
    role: 'intro',
    bars: 4,
    weight: 1.0,
    energyRange: [0.25, 0.75],
    maneuvers: [
      { bars: 2, curve: CURVE.EASY, elevation: 0 },
      { bars: 2, curve: -CURVE.EASY, elevation: 0 },
    ],
    props: [
      { kind: 'lamp', placement: 'both', everyBeats: 2, offset: 1.25 },
      { kind: 'gantry', placement: 'both', everyBeats: 8, offset: 0 },
      { kind: 'building', placement: 'both', everyBeats: 4, offset: 2.35 },
      { kind: 'jihanki', placement: 'alternating', everyBeats: 4, offset: 1.42 },
    ],
  }),

  defineChunk({
    id: 'intro-ocean-promenade-8',
    description: 'Lungomare ondulato a 8 battute con vista aperta sul sole synthwave',
    role: 'intro',
    bars: 8,
    weight: 1.0,
    energyRange: [0.0, 0.5],
    maneuvers: [
      { bars: 3, curve: CURVE.EASY * 0.6, elevation: HILL.LOW * 0.6 },
      { bars: 2, curve: 0, elevation: -HILL.LOW * 0.6 },
      { bars: 3, curve: -CURVE.EASY * 0.8, elevation: 0 },
    ],
    props: [
      { kind: 'palm', placement: 'both', everyBeats: 2, offset: 1.38 },
      { kind: 'lamp', placement: 'both', everyBeats: 4, offset: 1.22 },
    ],
  }),

  // ============================================================================
  // BUILD — Climbs that crest on the first bar of the following drop
  // ============================================================================
  defineChunk({
    id: 'build-skyward-crest-4',
    description: 'Rampa dritta in salita progressiva (4 bar) che scollina esattamente sul drop',
    role: 'build',
    bars: 4,
    crestOnExit: true,
    weight: 1.3,
    maneuvers: [
      { bars: 2, curve: CURVE.EASY * 0.5, elevation: HILL.MEDIUM * 0.65 },
      { bars: 2, curve: 0, elevation: HILL.HIGH * 0.85, easeRatio: [0.15, 0.15] },
    ],
    props: [
      { kind: 'lamp', placement: 'both', everyBeats: 1, offset: 1.22 },
      { kind: 'billboard', placement: 'both', everyBeats: 4, offset: 1.75 },
    ],
  }),

  defineChunk({
    id: 'build-overpass-spiral-8',
    description: 'Lunga ascesa autostradale a 8 battute con curva in appoggio che raddrizza in cima al crest',
    role: 'build',
    bars: 8,
    crestOnExit: true,
    weight: 1.25,
    maneuvers: [
      { bars: 3, curve: CURVE.MEDIUM * 0.75, elevation: HILL.MEDIUM * 0.6 },
      { bars: 3, curve: -CURVE.EASY * 0.6, elevation: HILL.MEDIUM * 0.8 },
      { bars: 2, curve: 0, elevation: HILL.HIGH, easeRatio: [0.15, 0.1] },
    ],
    props: [
      { kind: 'lamp', placement: 'both', everyBeats: 1, offset: 1.2 },
      { kind: 'gantry', placement: 'both', everyBeats: 8, offset: 0 },
      { kind: 'vms', placement: 'right', everyBeats: 8, offset: 1.8 },
      { kind: 'building', placement: 'both', everyBeats: 4, offset: 2.35 },
    ],
  }),

  defineChunk({
    id: 'build-horizon-riser-4',
    description: 'Salita rapida con curva d’ingresso e fari ravvicinati ad alta tensione ritmica',
    role: 'build',
    bars: 4,
    crestOnExit: true,
    weight: 1.0,
    maneuvers: [
      { bars: 2, curve: CURVE.MEDIUM * 0.6, elevation: HILL.MEDIUM * 0.7 },
      { bars: 2, curve: 0, elevation: HILL.HIGH * 0.9, easeRatio: [0.1, 0.1] },
    ],
    props: [{ kind: 'lamp', placement: 'both', everyBeats: 1, offset: 1.2 }],
  }),

  defineChunk({
    id: 'build-bay-bridge-ascent-8',
    description: 'Sospensione sul ponte a due stadi di pendenza con allineamento dritto verso il cielo',
    role: 'build',
    bars: 8,
    crestOnExit: true,
    env: 'bridge',
    weight: 1.1,
    maneuvers: [
      { bars: 2, curve: 0, elevation: HILL.MEDIUM * 0.5 },
      { bars: 4, curve: CURVE.EASY * 0.8, elevation: HILL.MEDIUM * 0.9 },
      { bars: 2, curve: 0, elevation: HILL.HIGH, easeRatio: [0.1, 0.1] },
    ],
    props: [
      { kind: 'suspension-tower', placement: 'both', everyBeats: 16, offset: 0 },
      { kind: 'lamp', placement: 'both', everyBeats: 2, offset: 1.18 },
    ],
  }),

  defineChunk({
    id: 'build-mountain-pass-4',
    description: 'Salita in cresta che scavalca il passo di montagna con guardrail e lampioni panoramici',
    role: 'build',
    bars: 4,
    crestOnExit: true,
    weight: 1.1,
    maneuvers: [
      { bars: 2, curve: CURVE.EASY * 0.5, elevation: HILL.MEDIUM * 0.7 },
      { bars: 2, curve: 0, elevation: HILL.HIGH * 0.8, easeRatio: [0.1, 0.1] },
    ],
    props: [
      { kind: 'lamp', placement: 'both', everyBeats: 2, offset: 1.25 },
      { kind: 'gantry', placement: 'both', everyBeats: 8, offset: 0 },
    ],
  }),

  // ============================================================================
  // DROP — Long fast straights, high-speed sweepers, adrenaline flow
  // ============================================================================
    defineChunk({
    id: 'drop-rainbow-expressway-8',
    description: 'Rettilineo ad altissima velocità su ponte sospeso panoramico sul mare con torri monumentali',
    role: 'drop',
    bars: 8,
    env: 'bridge',
    weight: 1.2,
    energyRange: [0.45, 1.0],
    maneuvers: [
      { bars: 3, curve: 0, elevation: -HILL.LOW * 0.5 },
      { bars: 3, curve: CURVE.EASY * 0.6, elevation: 0 },
      { bars: 2, curve: 0, elevation: 0 },
    ],
    props: [
      { kind: 'suspension-tower', placement: 'both', everyBeats: 16, offset: 0 },
      { kind: 'lamp', placement: 'both', everyBeats: 2, offset: 1.18 },
    ],
  }),

  defineChunk({
    id: 'drop-expressway-rush-8',
    description: 'Rettilineo ad altissima velocità su autostrada metropolitana con file di lampioni e cartelloni',
    role: 'drop',
    bars: 8,
    weight: 1.15,
    energyRange: [0.45, 1.0],
    maneuvers: [
      { bars: 3, curve: 0, elevation: -HILL.LOW * 0.5 },
      { bars: 3, curve: CURVE.EASY * 0.5, elevation: 0 },
      { bars: 2, curve: 0, elevation: 0 },
    ],
    props: [
      { kind: 'lamp', placement: 'both', everyBeats: 2, offset: 1.25 },
      { kind: 'building', placement: 'both', everyBeats: 4, offset: 2.35 },
    ],
  }),
defineChunk({
    id: 'drop-midnight-plunge',
    description: 'Tuffo giù dal crest ad altissima velocità con curvone da quarta piena',
    role: 'drop',
    bars: 4,
    weight: 1.3,
    energyRange: [0.4, 1.0],
    maneuvers: [
      { bars: 2, curve: 0, elevation: -HILL.HIGH * 0.75 },
      { bars: 2, curve: CURVE.MEDIUM, elevation: 0 },
    ],
    props: [
      { kind: 'palm', placement: 'both', everyBeats: 1, offset: 1.35 },
      { kind: 'billboard', placement: 'outside-curve', everyBeats: 4, offset: 1.75 },
    ],
  }),

  defineChunk({
    id: 'drop-wangan-hyper-sweeper',
    description: '8 battute in stile Wangan: doppia curva veloce da percorrere in pieno o in drift lungo',
    role: 'drop',
    bars: 8,
    weight: 1.3,
    energyRange: [0.55, 1.0],
    maneuvers: [
      { bars: 3, curve: CURVE.MEDIUM, elevation: -HILL.LOW * 0.6 },
      { bars: 2, curve: 0, elevation: HILL.LOW * 0.5 },
      { bars: 3, curve: -CURVE.MEDIUM * 1.1, elevation: -HILL.LOW * 0.4 },
    ],
    props: [
      { kind: 'lamp', placement: 'both', everyBeats: 1, offset: 1.25 },
      { kind: 'building', placement: 'both', everyBeats: 4, offset: 2.35 },
      { kind: 'gantry', placement: 'both', everyBeats: 8, offset: 0 },
      { kind: 'chevron', placement: 'outside-curve', everyBeats: 2, offset: 1.35 },
      { kind: 'vms', placement: 'right', everyBeats: 8, offset: 1.8 },
    ],
  }),

  defineChunk({
    id: 'drop-rollercoaster-sprint',
    description: 'Rettilineo velocissimo con dossi ritmici e piega veloce finale',
    role: 'drop',
    bars: 4,
    weight: 1.05,
    energyRange: [0.35, 0.85],
    maneuvers: [
      { bars: 1, curve: 0, elevation: -HILL.MEDIUM * 0.5 },
      { bars: 1, curve: CURVE.EASY, elevation: HILL.LOW * 0.6 },
      { bars: 2, curve: CURVE.MEDIUM * 0.85, elevation: -HILL.LOW * 0.4 },
    ],
    props: [
      { kind: 'palm', placement: 'both', everyBeats: 1, offset: 1.35 },
      { kind: 'lamp', placement: 'alternating', everyBeats: 2, offset: 1.2 },
    ],
  }),

  defineChunk({
    id: 'drop-shibuya-express-8',
    description: 'Discesa mozzafiato seguita da doppio apex veloce tra corridoio di lampioni e insegne',
    role: 'drop',
    bars: 8,
    weight: 1.2,
    energyRange: [0.65, 1.0],
    maneuvers: [
      { bars: 2, curve: CURVE.EASY * 0.6, elevation: -HILL.HIGH * 0.7 },
      { bars: 3, curve: CURVE.MEDIUM * 1.15, elevation: 0, easeRatio: [0.2, 0.2] },
      { bars: 3, curve: -CURVE.MEDIUM * 0.95, elevation: HILL.LOW * 0.4, easeRatio: [0.2, 0.2] },
    ],
    props: [
      { kind: 'chevron', placement: 'outside-curve', everyBeats: 2, offset: 1.35 },
      { kind: 'lamp', placement: 'both', everyBeats: 1, offset: 1.22 },
      { kind: 'billboard', placement: 'outside-curve', everyBeats: 2, offset: 1.72 },
    ],
  }),

  defineChunk({
    id: 'drop-pacific-slingshot-4',
    description: 'Curva fionda in discesa con uscita dritta a tutto gas',
    role: 'drop',
    bars: 4,
    weight: 1.0,
    energyRange: [0.45, 0.95],
    maneuvers: [
      { bars: 2, curve: CURVE.MEDIUM * 1.1, elevation: -HILL.MEDIUM * 0.6 },
      { bars: 2, curve: 0, elevation: 0 },
    ],
    props: [
      { kind: 'palm', placement: 'both', everyBeats: 1, offset: 1.36 },
      { kind: 'billboard', placement: 'both', everyBeats: 4, offset: 1.78 },
    ],
  }),

  // ============================================================================
  // BREAKDOWN — Technical S-bends, hairpins (drift showcases), dips
  // ============================================================================
  defineChunk({
    id: 'breakdown-touge-s-bends',
    description: 'Chicane tecnica a S con cambio di pendenza, disegnata per concatenare due derapate',
    role: 'breakdown',
    bars: 4,
    weight: 1.25,
    energyRange: [0.3, 0.85],
    maneuvers: [
      { bars: 2, curve: CURVE.HARD * 0.85, elevation: -HILL.LOW * 0.6, easeRatio: [0.2, 0.2] },
      { bars: 2, curve: -CURVE.HARD * 0.85, elevation: HILL.LOW * 0.4, easeRatio: [0.2, 0.2] },
    ],
    props: [
      { kind: 'chevron', placement: 'outside-curve', everyBeats: 2, offset: 1.35 },
      { kind: 'pylon', placement: 'alternating', everyBeats: 4, offset: 2.6 },
      { kind: 'shrub', placement: 'both', everyBeats: 2, offset: 1.35 },
    ],
  }),

  defineChunk({
    id: 'breakdown-canyon-hairpin-8',
    description: 'Tornante lungo da drift prolungato seguito da controcurva in avvallamento',
    role: 'breakdown',
    bars: 8,
    weight: 1.2,
    energyRange: [0.4, 1.0],
    maneuvers: [
      { bars: 3, curve: CURVE.HARD, elevation: -HILL.MEDIUM * 0.6, easeRatio: [0.2, 0.2] },
      { bars: 2, curve: -CURVE.MEDIUM, elevation: 0 },
      { bars: 3, curve: CURVE.HARD * 0.9, elevation: HILL.LOW * 0.5, easeRatio: [0.2, 0.2] },
    ],
    props: [
      { kind: 'chevron', placement: 'outside-curve', everyBeats: 2, offset: 1.35 },
      { kind: 'billboard', placement: 'outside-curve', everyBeats: 2, offset: 1.68 },
      { kind: 'palm', placement: 'inside-curve', everyBeats: 2, offset: 1.35 },
    ],
  }),

  defineChunk({
    id: 'breakdown-shuto-curves-8',
    description: 'S-bends tecnici tra le barriere autostradali della tangenziale Shuto C1',
    role: 'breakdown',
    bars: 8,
    weight: 1.1,
    energyRange: [0.3, 0.85],
    maneuvers: [
      { bars: 2, curve: CURVE.MEDIUM * 0.8, elevation: 0 },
      { bars: 2, curve: -CURVE.MEDIUM * 0.8, elevation: -HILL.LOW * 0.4 },
      { bars: 2, curve: CURVE.HARD * 0.75, elevation: 0 },
      { bars: 2, curve: 0, elevation: HILL.LOW * 0.4 },
    ],
    props: [
      { kind: 'chevron', placement: 'outside-curve', everyBeats: 2, offset: 1.35 },
      { kind: 'lamp', placement: 'both', everyBeats: 2, offset: 1.22 },
    ],
  }),

  defineChunk({
    id: 'breakdown-neon-chicane',
    description: 'Avvallamento con doppia piega tecnica tra i cartelloni al neon',
    role: 'breakdown',
    bars: 4,
    weight: 1.0,
    energyRange: [0.2, 0.7],
    maneuvers: [
      { bars: 1, curve: -CURVE.MEDIUM, elevation: -HILL.LOW * 0.5 },
      { bars: 2, curve: CURVE.HARD * 0.9, elevation: 0 },
      { bars: 1, curve: -CURVE.EASY, elevation: HILL.LOW * 0.5 },
    ],
    props: [{ kind: 'sign', placement: 'alternating', everyBeats: 2, offset: 1.38 }],
  }),

  defineChunk({
    id: 'breakdown-akina-switchback-8',
    description: 'Triplo pendolo da passo di montagna (Destra -> Sinistra -> Destra) per veri drifter',
    role: 'breakdown',
    bars: 8,
    weight: 1.15,
    energyRange: [0.45, 1.0],
    maneuvers: [
      { bars: 3, curve: CURVE.HARD * 0.95, elevation: -HILL.LOW * 0.7, easeRatio: [0.18, 0.18] },
      { bars: 3, curve: -CURVE.HARD * 0.95, elevation: -HILL.LOW * 0.5, easeRatio: [0.18, 0.18] },
      { bars: 2, curve: CURVE.MEDIUM * 1.1, elevation: HILL.LOW * 0.8, easeRatio: [0.2, 0.2] },
    ],
    props: [
      { kind: 'chevron', placement: 'outside-curve', everyBeats: 2, offset: 1.35 },
      { kind: 'billboard', placement: 'outside-curve', everyBeats: 2, offset: 1.66 },
      { kind: 'lamp', placement: 'inside-curve', everyBeats: 1, offset: 1.22 },
    ],
  }),

  // ============================================================================
  // OUTRO — Wind-down sweepers ending at the stage fork / finish line
  // ============================================================================
  defineChunk({
    id: 'outro-coastal-winddown',
    description: 'Curvoni rilassati di fine brano che riportano dolcemente al livello del mare',
    role: 'outro',
    bars: 4,
    weight: 1.2,
    maneuvers: [
      { bars: 2, curve: CURVE.EASY, elevation: -HILL.LOW * 0.4 },
      { bars: 2, curve: 0, elevation: 0 },
    ],
    props: [
      { kind: 'palm', placement: 'both', everyBeats: 2, offset: 1.35 },
      { kind: 'lamp', placement: 'both', everyBeats: 4, offset: 1.22 },
    ],
  }),

  defineChunk({
    id: 'outro-skyline-emergence-4',
    description: 'Tratto finale verso la luce dello skyline e del bivio finale',
    role: 'outro',
    bars: 4,
    weight: 1.1,
    maneuvers: [
      { bars: 2, curve: 0, elevation: HILL.LOW * 0.4 },
      { bars: 2, curve: CURVE.EASY * 0.6, elevation: 0 },
    ],
    props: [
      { kind: 'gantry', placement: 'both', everyBeats: 8, offset: 0 },
      { kind: 'lamp', placement: 'both', everyBeats: 2, offset: 1.25 },
    ],
  }),

  defineChunk({
    id: 'outro-horizon-victory-8',
    description: 'Lungo viale d’arrivo a 8 battute con palme e portali luminosi verso il traguardo',
    role: 'outro',
    bars: 8,
    weight: 1.1,
    maneuvers: [
      { bars: 3, curve: CURVE.EASY * 0.8, elevation: -HILL.LOW * 0.5 },
      { bars: 3, curve: -CURVE.EASY * 0.8, elevation: 0 },
      { bars: 2, curve: 0, elevation: 0 },
    ],
    props: [
      { kind: 'palm', placement: 'both', everyBeats: 2, offset: 1.38 },
      { kind: 'billboard', placement: 'both', everyBeats: 8, offset: 1.75 },
    ],
  }),

  defineChunk({
    id: 'outro-starlight-glide-4',
    description: 'Planata morbida finale sotto i lampioni verso il bivio radio',
    role: 'outro',
    bars: 4,
    weight: 1.0,
    maneuvers: [
      { bars: 2, curve: -CURVE.EASY * 0.7, elevation: -HILL.LOW * 0.3 },
      { bars: 2, curve: 0, elevation: 0 },
    ],
    props: [
      { kind: 'lamp', placement: 'both', everyBeats: 2, offset: 1.25 },
      { kind: 'gantry', placement: 'both', everyBeats: 8, offset: 0 },
      { kind: 'building', placement: 'both', everyBeats: 4, offset: 2.35 },
      { kind: 'jihanki', placement: 'alternating', everyBeats: 4, offset: 1.42 },
    ],
  }),
];

/** Returns all chunks matching `role` from a chunk catalog. */
export function getChunksForRole(
  role: SectionRole,
  catalog: readonly RoadChunk[] = ROAD_CHUNKS,
): readonly RoadChunk[] {
  return catalog.filter((c) => c.role === role);
}
