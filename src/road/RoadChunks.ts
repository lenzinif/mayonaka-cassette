import type { SectionRole } from '@src/audio/BeatMap';
import { CURVE, HILL } from './TrackBuilder';

/**
 * Pure choreography & geometry `RoadChunk` vocabulary (decoupled from scenery & stage themes).
 *
 * Pure TypeScript module (AGENTS.md §2: zero React imports; zero palette/scenery imports).
 *
 * Each `RoadChunk` spans 4 or 8 musical bars and defines only driving maneuvers, cadence,
 * structural capabilities, and traffic profile. Visual dressing is applied downstream by
 * `EnvironmentArchetypes` and `SongRoadGenerator`'s Scenery Dresser.
 */

export type TrafficProfile = 'weaving' | 'normal' | 'sparse' | 'clear';
export type ElevationIntent = 'flat' | 'climb' | 'crest' | 'plunge' | 'rolling';
export type StructureCapability = 'standard' | 'elevated' | 'tunnel';
export type DrivingStyleTag = 'cruise' | 'wangan' | 'technical' | 'scenic';

export interface ChunkManeuver {
  /** Duration of this maneuver in musical bars (sum must equal `chunk.bars`). */
  bars: number;
  /** Peak/target horizontal curvature (+right / -left). */
  curve: number;
  /**
   * If true, curvature blends directly into the next maneuver without resetting to 0
   * (enables double-apexes, tightening/opening-radius curves, and fluid S-bends).
   * Defaults to false (returns smoothly to 0).
   */
  blendToNext?: boolean;
  /** Elevation change over this maneuver (+uphill / -downhill in HILL units). */
  elevation: number;
  /**
   * Optional `[enterRatio, leaveRatio]` in `[0, 0.5]` controlling how much of the maneuver eases
   * into and out of `curve` (controls jerk for Tofu Mode). Defaults to `[0.25, 0.25]`.
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
  /** Vertical choreography role of this chunk. */
  elevationIntent: ElevationIntent;
  /** Preferred immediately after a pre-drop crest (panoramic plunge / reveal). */
  postCrestReveal?: boolean;
  /** Road structures compatible with this geometry (e.g. tight hairpins never go on elevated spans). */
  allowedStructures: readonly StructureCapability[];
  /** Driving personality tags matched against Track DNA. */
  styleTags: readonly DrivingStyleTag[];
  /** Base rhythmic cadence in beats for Band A fixtures (street lamps / tunnel lights). */
  fixtureCadenceBeats: 1 | 2 | 4;
  /** Traffic density & weaving profile for TrafficManager. */
  trafficProfile: TrafficProfile;
  /** Ordered sequence of road maneuvers whose `bars` sum to `chunk.bars`. */
  maneuvers: readonly ChunkManeuver[];
}

/** Validates that a `RoadChunk` definition has consistent bar counts and valid choreography contracts. */
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
  if (!chunk.allowedStructures || chunk.allowedStructures.length === 0) {
    throw new Error(`RoadChunk "${chunk.id}" must declare at least one allowedStructure`);
  }
  if (!chunk.styleTags || chunk.styleTags.length === 0) {
    throw new Error(`RoadChunk "${chunk.id}" must declare at least one styleTag`);
  }
  if (
    chunk.fixtureCadenceBeats !== 1 &&
    chunk.fixtureCadenceBeats !== 2 &&
    chunk.fixtureCadenceBeats !== 4
  ) {
    throw new Error(
      `RoadChunk "${chunk.id}" fixtureCadenceBeats must be 1, 2, or 4 (got ${String(chunk.fixtureCadenceBeats)})`,
    );
  }
  let sumBars = 0;
  for (const m of chunk.maneuvers) {
    if (m.bars <= 0 || !Number.isFinite(m.bars)) {
      throw new Error(`RoadChunk "${chunk.id}" has invalid maneuver bars: ${String(m.bars)}`);
    }
    if (m.easeRatio) {
      const [enterR, leaveR] = m.easeRatio;
      if (
        !Number.isFinite(enterR) ||
        !Number.isFinite(leaveR) ||
        enterR < 0 ||
        enterR > 0.5 ||
        leaveR < 0 ||
        leaveR > 0.5
      ) {
        throw new Error(`RoadChunk "${chunk.id}" has invalid easeRatio: [${enterR}, ${leaveR}]`);
      }
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
 * Canonical vocabulary of pure-choreography `RoadChunks`.
 */
export const ROAD_CHUNKS: readonly RoadChunk[] = [
  // ============================================================================
  // INTRO — Gentle straights, wide sweepers, rhythmic warming up
  // ============================================================================
  defineChunk({
    id: 'intro-boulevard-cruise',
    description: 'Rettilineo panoramico con brezza finale in leggera ascesa',
    role: 'intro',
    bars: 4,
    weight: 1.2,
    energyRange: [0.0, 0.55],
    elevationIntent: 'rolling',
    allowedStructures: ['standard', 'elevated', 'tunnel'],
    styleTags: ['cruise', 'scenic'],
    fixtureCadenceBeats: 4,
    trafficProfile: 'sparse',
    maneuvers: [
      { bars: 2, curve: 0, elevation: 0 },
      { bars: 2, curve: CURVE.EASY * 0.75, elevation: HILL.LOW * 0.4 },
    ],
  }),

  defineChunk({
    id: 'intro-sunset-sweeper',
    description: 'Ampio curvone continuo a 8 battute con ondina dolce e raccordo fluido',
    role: 'intro',
    bars: 8,
    weight: 1.15,
    energyRange: [0.15, 0.65],
    elevationIntent: 'rolling',
    allowedStructures: ['standard', 'elevated'],
    styleTags: ['scenic', 'cruise'],
    fixtureCadenceBeats: 4,
    trafficProfile: 'sparse',
    maneuvers: [
      { bars: 2, curve: 0, elevation: HILL.LOW * 0.5 },
      { bars: 4, curve: CURVE.EASY, blendToNext: true, elevation: -HILL.LOW * 0.5, easeRatio: [0.25, 0.25] },
      { bars: 2, curve: -CURVE.EASY * 0.5, elevation: 0, easeRatio: [0.25, 0.25] },
    ],
  }),

  defineChunk({
    id: 'intro-neon-gateway',
    description: 'Ingresso veloce a doppia curva morbida raccordata in flusso continuo',
    role: 'intro',
    bars: 4,
    weight: 1.0,
    energyRange: [0.25, 0.75],
    elevationIntent: 'flat',
    allowedStructures: ['standard', 'tunnel'],
    styleTags: ['cruise', 'technical'],
    fixtureCadenceBeats: 2,
    trafficProfile: 'normal',
    maneuvers: [
      { bars: 2, curve: CURVE.EASY, blendToNext: true, elevation: 0, easeRatio: [0.25, 0.25] },
      { bars: 2, curve: -CURVE.EASY, elevation: 0, easeRatio: [0.25, 0.25] },
    ],
  }),

  defineChunk({
    id: 'intro-ocean-promenade-8',
    description: 'Lungomare ondulato a 8 battute con ampie curve scorrevoli',
    role: 'intro',
    bars: 8,
    weight: 1.05,
    energyRange: [0.0, 0.5],
    elevationIntent: 'rolling',
    allowedStructures: ['standard', 'elevated'],
    styleTags: ['scenic', 'cruise'],
    fixtureCadenceBeats: 4,
    trafficProfile: 'sparse',
    maneuvers: [
      { bars: 3, curve: CURVE.EASY * 0.6, elevation: HILL.LOW * 0.6 },
      { bars: 2, curve: 0, elevation: -HILL.LOW * 0.6 },
      { bars: 3, curve: -CURVE.EASY * 0.8, elevation: 0 },
    ],
  }),

  // ============================================================================
  // BUILD — Climbs that crest cleanly onto the following drop
  // ============================================================================
  defineChunk({
    id: 'build-skyward-crest-4',
    description: 'Rampa dritta in salita progressiva (4 bar) che scollina esattamente sul drop',
    role: 'build',
    bars: 4,
    weight: 1.3,
    elevationIntent: 'crest',
    allowedStructures: ['standard', 'elevated', 'tunnel'],
    styleTags: ['wangan', 'cruise'],
    fixtureCadenceBeats: 1,
    trafficProfile: 'clear',
    maneuvers: [
      { bars: 2, curve: 0, elevation: HILL.MEDIUM * 0.65 },
      { bars: 2, curve: 0, elevation: HILL.HIGH * 0.85, easeRatio: [0.15, 0.15] },
    ],
  }),

  defineChunk({
    id: 'build-overpass-spiral-8',
    description: 'Lunga ascesa a 8 battute con raccordi fluidi che raddrizza in cima al crest',
    role: 'build',
    bars: 8,
    weight: 1.25,
    elevationIntent: 'crest',
    allowedStructures: ['standard', 'elevated'],
    styleTags: ['wangan', 'technical'],
    fixtureCadenceBeats: 1,
    trafficProfile: 'sparse',
    maneuvers: [
      { bars: 3, curve: CURVE.MEDIUM * 0.75, blendToNext: true, elevation: HILL.MEDIUM * 0.6 },
      { bars: 3, curve: -CURVE.EASY * 0.6, blendToNext: true, elevation: HILL.MEDIUM * 0.8 },
      { bars: 2, curve: 0, elevation: HILL.HIGH, easeRatio: [0.15, 0.1] },
    ],
  }),

  defineChunk({
    id: 'build-horizon-riser-4',
    description: 'Salita rapida con curva d’ingresso che lancia dritto verso la cresta',
    role: 'build',
    bars: 4,
    weight: 1.05,
    elevationIntent: 'crest',
    allowedStructures: ['standard', 'elevated', 'tunnel'],
    styleTags: ['wangan'],
    fixtureCadenceBeats: 1,
    trafficProfile: 'clear',
    maneuvers: [
      { bars: 2, curve: CURVE.MEDIUM * 0.6, blendToNext: true, elevation: HILL.MEDIUM * 0.7 },
      { bars: 2, curve: 0, elevation: HILL.HIGH * 0.9, easeRatio: [0.15, 0.15] },
    ],
  }),

  defineChunk({
    id: 'build-bay-bridge-ascent-8',
    description: 'Ascesa monumentale dritta a due stadi di pendenza verso l’orizzonte',
    role: 'build',
    bars: 8,
    weight: 1.15,
    elevationIntent: 'climb',
    allowedStructures: ['standard', 'elevated', 'tunnel'],
    styleTags: ['wangan', 'scenic'],
    fixtureCadenceBeats: 2,
    trafficProfile: 'clear',
    maneuvers: [
      { bars: 2, curve: 0, elevation: HILL.MEDIUM * 0.5 },
      { bars: 4, curve: 0, elevation: HILL.MEDIUM * 0.9 },
      { bars: 2, curve: 0, elevation: HILL.HIGH, easeRatio: [0.15, 0.15] },
    ],
  }),

  defineChunk({
    id: 'build-mountain-pass-4',
    description: 'Salita in cresta che scavalca il passo aprendosi in uscita verso il drop',
    role: 'build',
    bars: 4,
    weight: 1.1,
    elevationIntent: 'crest',
    allowedStructures: ['standard', 'tunnel'],
    styleTags: ['technical', 'scenic'],
    fixtureCadenceBeats: 2,
    trafficProfile: 'sparse',
    maneuvers: [
      { bars: 2, curve: CURVE.EASY * 0.5, blendToNext: true, elevation: HILL.MEDIUM * 0.7 },
      { bars: 2, curve: 0, elevation: HILL.HIGH * 0.8, easeRatio: [0.15, 0.15] },
    ],
  }),

  defineChunk({
    id: 'build-tightening-climb-4',
    description: 'Salita in appoggio a raggio decrescente prima dello scatto rettilineo in cresta',
    role: 'build',
    bars: 4,
    weight: 1.0,
    elevationIntent: 'climb',
    allowedStructures: ['standard', 'tunnel'],
    styleTags: ['technical'],
    fixtureCadenceBeats: 2,
    trafficProfile: 'clear',
    maneuvers: [
      { bars: 1.5, curve: CURVE.EASY * 0.7, blendToNext: true, elevation: HILL.MEDIUM * 0.5, easeRatio: [0.25, 0.2] },
      { bars: 1.5, curve: CURVE.MEDIUM * 0.95, blendToNext: true, elevation: HILL.MEDIUM * 0.75, easeRatio: [0.2, 0.25] },
      { bars: 1, curve: 0, elevation: HILL.HIGH * 0.75, easeRatio: [0.25, 0.15] },
    ],
  }),

  // ============================================================================
  // DROP — High-speed expressways, double-apex sweepers, post-crest plunges
  // ============================================================================
  defineChunk({
    id: 'drop-expressway-rush-8',
    description: 'Rettilineo ad altissima velocità con tuffo iniziale e ampio curvone veloce da slalom',
    role: 'drop',
    bars: 8,
    weight: 1.25,
    energyRange: [0.45, 1.0],
    elevationIntent: 'plunge',
    postCrestReveal: true,
    allowedStructures: ['standard', 'elevated'],
    styleTags: ['wangan', 'cruise'],
    fixtureCadenceBeats: 2,
    trafficProfile: 'weaving',
    maneuvers: [
      { bars: 3, curve: 0, elevation: -HILL.LOW * 0.5 },
      { bars: 3, curve: CURVE.EASY * 0.65, blendToNext: true, elevation: 0 },
      { bars: 2, curve: 0, elevation: 0 },
    ],
  }),

  defineChunk({
    id: 'drop-wangan-double-apex-8',
    description: 'Doppio apice Wangan continuo sullo stesso lato senza ritorno a zero tra i due vertici',
    role: 'drop',
    bars: 8,
    weight: 1.2,
    energyRange: [0.5, 1.0],
    elevationIntent: 'flat',
    allowedStructures: ['standard', 'elevated'],
    styleTags: ['wangan'],
    fixtureCadenceBeats: 1,
    trafficProfile: 'weaving',
    maneuvers: [
      { bars: 2, curve: CURVE.EASY * 0.85, blendToNext: true, elevation: 0, easeRatio: [0.25, 0.2] },
      { bars: 3, curve: CURVE.MEDIUM * 0.95, blendToNext: true, elevation: -HILL.LOW * 0.35, easeRatio: [0.2, 0.2] },
      { bars: 3, curve: CURVE.EASY * 0.6, elevation: HILL.LOW * 0.2, easeRatio: [0.2, 0.3] },
    ],
  }),

  defineChunk({
    id: 'drop-midnight-plunge',
    description: 'Tuffo giù dal crest ad altissima velocità con curvone fluido da quarta piena',
    role: 'drop',
    bars: 4,
    weight: 1.3,
    energyRange: [0.4, 1.0],
    elevationIntent: 'plunge',
    postCrestReveal: true,
    allowedStructures: ['standard'],
    styleTags: ['wangan', 'technical'],
    fixtureCadenceBeats: 2,
    trafficProfile: 'weaving',
    maneuvers: [
      { bars: 2, curve: 0, elevation: -HILL.HIGH * 0.75 },
      { bars: 2, curve: CURVE.MEDIUM, elevation: 0, easeRatio: [0.25, 0.25] },
    ],
  }),

  defineChunk({
    id: 'drop-crest-plunge-reveal-8',
    description: 'Picchiata panoramica post-cresta che apre progressivamente il raggio in piena accelerazione',
    role: 'drop',
    bars: 8,
    weight: 1.25,
    energyRange: [0.45, 1.0],
    elevationIntent: 'plunge',
    postCrestReveal: true,
    allowedStructures: ['standard', 'elevated'],
    styleTags: ['wangan', 'scenic'],
    fixtureCadenceBeats: 2,
    trafficProfile: 'weaving',
    maneuvers: [
      { bars: 2, curve: 0, elevation: -HILL.HIGH * 0.8 },
      { bars: 3, curve: CURVE.MEDIUM * 1.05, blendToNext: true, elevation: -HILL.LOW * 0.4, easeRatio: [0.2, 0.25] },
      { bars: 3, curve: CURVE.EASY * 0.75, elevation: 0, easeRatio: [0.2, 0.3] },
    ],
  }),

  defineChunk({
    id: 'drop-wangan-hyper-sweeper',
    description: 'Pendolo veloce stile Wangan a 8 battute con transizione continua tra i due curvoni',
    role: 'drop',
    bars: 8,
    weight: 1.3,
    energyRange: [0.55, 1.0],
    elevationIntent: 'rolling',
    allowedStructures: ['standard', 'elevated'],
    styleTags: ['wangan'],
    fixtureCadenceBeats: 1,
    trafficProfile: 'weaving',
    maneuvers: [
      { bars: 3, curve: CURVE.MEDIUM, blendToNext: true, elevation: -HILL.LOW * 0.6, easeRatio: [0.22, 0.22] },
      { bars: 2, curve: 0, blendToNext: true, elevation: HILL.LOW * 0.5, easeRatio: [0.25, 0.25] },
      { bars: 3, curve: -CURVE.MEDIUM * 1.1, elevation: -HILL.LOW * 0.4, easeRatio: [0.22, 0.25] },
    ],
  }),

  defineChunk({
    id: 'drop-rollercoaster-sprint',
    description: 'Sprint veloce con dossi ritmici e piega ad apertura continua',
    role: 'drop',
    bars: 4,
    weight: 1.05,
    energyRange: [0.35, 0.85],
    elevationIntent: 'rolling',
    allowedStructures: ['standard'],
    styleTags: ['wangan', 'cruise'],
    fixtureCadenceBeats: 2,
    trafficProfile: 'normal',
    maneuvers: [
      { bars: 1, curve: 0, elevation: -HILL.MEDIUM * 0.5 },
      { bars: 1, curve: CURVE.EASY, blendToNext: true, elevation: HILL.LOW * 0.6 },
      { bars: 2, curve: CURVE.MEDIUM * 0.85, elevation: -HILL.LOW * 0.4 },
    ],
  }),

  defineChunk({
    id: 'drop-shibuya-express-8',
    description: 'Discesa esplosiva seguita da doppio apex veloce in flusso continuo tra neon e cavalcavia',
    role: 'drop',
    bars: 8,
    weight: 1.2,
    energyRange: [0.6, 1.0],
    elevationIntent: 'plunge',
    postCrestReveal: true,
    allowedStructures: ['standard'],
    styleTags: ['wangan', 'technical'],
    fixtureCadenceBeats: 1,
    trafficProfile: 'weaving',
    maneuvers: [
      { bars: 2, curve: CURVE.EASY * 0.6, blendToNext: true, elevation: -HILL.HIGH * 0.7 },
      { bars: 3, curve: CURVE.MEDIUM * 1.15, blendToNext: true, elevation: 0, easeRatio: [0.22, 0.22] },
      { bars: 3, curve: -CURVE.MEDIUM * 0.95, elevation: HILL.LOW * 0.4, easeRatio: [0.22, 0.25] },
    ],
  }),

  defineChunk({
    id: 'drop-pacific-slingshot-4',
    description: 'Curva fionda in discesa ad apertura progressiva con uscita lanciata a tutto gas',
    role: 'drop',
    bars: 4,
    weight: 1.05,
    energyRange: [0.45, 0.95],
    elevationIntent: 'plunge',
    postCrestReveal: true,
    allowedStructures: ['standard', 'elevated'],
    styleTags: ['wangan', 'scenic'],
    fixtureCadenceBeats: 2,
    trafficProfile: 'weaving',
    maneuvers: [
      { bars: 2, curve: CURVE.MEDIUM * 1.1, blendToNext: true, elevation: -HILL.MEDIUM * 0.6, easeRatio: [0.22, 0.22] },
      { bars: 2, curve: CURVE.EASY * 0.4, elevation: 0, easeRatio: [0.2, 0.35] },
    ],
  }),

  // ============================================================================
  // BREAKDOWN — Technical S-bends, hairpins (drift showcases), tightening apexes
  // ============================================================================
  defineChunk({
    id: 'breakdown-touge-s-bends',
    description: 'Chicane tecnica a S continua con cambio di pendenza, disegnata per concatenare due derapate',
    role: 'breakdown',
    bars: 4,
    weight: 1.25,
    energyRange: [0.2, 0.9],
    elevationIntent: 'rolling',
    allowedStructures: ['standard'],
    styleTags: ['technical'],
    fixtureCadenceBeats: 2,
    trafficProfile: 'sparse',
    maneuvers: [
      { bars: 2, curve: CURVE.HARD * 0.85, blendToNext: true, elevation: -HILL.LOW * 0.6, easeRatio: [0.22, 0.22] },
      { bars: 2, curve: -CURVE.HARD * 0.85, elevation: HILL.LOW * 0.4, easeRatio: [0.22, 0.22] },
    ],
  }),

  defineChunk({
    id: 'breakdown-canyon-hairpin-8',
    description: 'Tornante lungo da drift prolungato raccordato a controcurva e rientro fluido',
    role: 'breakdown',
    bars: 8,
    weight: 1.2,
    energyRange: [0.25, 1.0],
    elevationIntent: 'rolling',
    allowedStructures: ['standard'],
    styleTags: ['technical', 'scenic'],
    fixtureCadenceBeats: 2,
    trafficProfile: 'sparse',
    maneuvers: [
      { bars: 3, curve: CURVE.HARD, blendToNext: true, elevation: -HILL.MEDIUM * 0.6, easeRatio: [0.22, 0.22] },
      { bars: 2, curve: -CURVE.MEDIUM, blendToNext: true, elevation: 0, easeRatio: [0.22, 0.22] },
      { bars: 3, curve: CURVE.HARD * 0.9, elevation: HILL.LOW * 0.5, easeRatio: [0.22, 0.25] },
    ],
  }),

  defineChunk({
    id: 'breakdown-shuto-curves-8',
    description: 'Pendolo continuo tra curve medio-chiuse della tangenziale metropolitana C1',
    role: 'breakdown',
    bars: 8,
    weight: 1.15,
    energyRange: [0.2, 0.85],
    elevationIntent: 'rolling',
    allowedStructures: ['standard', 'elevated'],
    styleTags: ['technical', 'wangan'],
    fixtureCadenceBeats: 2,
    trafficProfile: 'normal',
    maneuvers: [
      { bars: 2, curve: CURVE.MEDIUM * 0.85, blendToNext: true, elevation: 0, easeRatio: [0.22, 0.22] },
      { bars: 2, curve: -CURVE.MEDIUM * 0.85, blendToNext: true, elevation: -HILL.LOW * 0.4, easeRatio: [0.22, 0.22] },
      { bars: 2, curve: CURVE.HARD * 0.75, blendToNext: true, elevation: 0, easeRatio: [0.22, 0.22] },
      { bars: 2, curve: 0, elevation: HILL.LOW * 0.4 },
    ],
  }),

  defineChunk({
    id: 'breakdown-neon-chicane',
    description: 'Avvallamento con doppia piega tecnica concatenata senza reset centrale',
    role: 'breakdown',
    bars: 4,
    weight: 1.05,
    energyRange: [0.15, 0.75],
    elevationIntent: 'rolling',
    allowedStructures: ['standard', 'tunnel'],
    styleTags: ['technical'],
    fixtureCadenceBeats: 2,
    trafficProfile: 'sparse',
    maneuvers: [
      { bars: 1, curve: -CURVE.MEDIUM, blendToNext: true, elevation: -HILL.LOW * 0.5, easeRatio: [0.25, 0.25] },
      { bars: 2, curve: CURVE.HARD * 0.9, blendToNext: true, elevation: 0, easeRatio: [0.22, 0.22] },
      { bars: 1, curve: -CURVE.EASY, elevation: HILL.LOW * 0.5, easeRatio: [0.25, 0.25] },
    ],
  }),

  defineChunk({
    id: 'breakdown-akina-switchback-8',
    description: 'Triplo pendolo continuo da passo di montagna (Destra -> Sinistra -> Destra) per veri drifter',
    role: 'breakdown',
    bars: 8,
    weight: 1.15,
    energyRange: [0.3, 1.0],
    elevationIntent: 'rolling',
    allowedStructures: ['standard'],
    styleTags: ['technical'],
    fixtureCadenceBeats: 1,
    trafficProfile: 'sparse',
    maneuvers: [
      { bars: 3, curve: CURVE.HARD * 0.95, blendToNext: true, elevation: -HILL.LOW * 0.7, easeRatio: [0.22, 0.22] },
      { bars: 3, curve: -CURVE.HARD * 0.95, blendToNext: true, elevation: -HILL.LOW * 0.5, easeRatio: [0.22, 0.22] },
      { bars: 2, curve: CURVE.MEDIUM * 1.1, elevation: HILL.LOW * 0.8, easeRatio: [0.22, 0.25] },
    ],
  }),

  defineChunk({
    id: 'breakdown-tightening-apex-4',
    description: 'Curva a raggio decrescente (ingresso ampio che chiude progressivamente sull’apice)',
    role: 'breakdown',
    bars: 4,
    weight: 1.15,
    energyRange: [0.2, 0.85],
    elevationIntent: 'flat',
    allowedStructures: ['standard', 'tunnel'],
    styleTags: ['technical'],
    fixtureCadenceBeats: 2,
    trafficProfile: 'sparse',
    maneuvers: [
      { bars: 2, curve: CURVE.EASY * 1.1, blendToNext: true, elevation: -HILL.LOW * 0.25, easeRatio: [0.25, 0.2] },
      { bars: 2, curve: CURVE.HARD * 0.85, elevation: HILL.LOW * 0.25, easeRatio: [0.2, 0.28] },
    ],
  }),

  defineChunk({
    id: 'breakdown-underground-sweep-8',
    description: 'Lungo curvone scorrevole in galleria a doppia corda fluida e altitudine controllata',
    role: 'breakdown',
    bars: 8,
    weight: 1.1,
    energyRange: [0.15, 0.85],
    elevationIntent: 'flat',
    allowedStructures: ['standard', 'tunnel'],
    styleTags: ['wangan', 'technical'],
    fixtureCadenceBeats: 2,
    trafficProfile: 'sparse',
    maneuvers: [
      { bars: 3, curve: CURVE.MEDIUM * 0.85, blendToNext: true, elevation: 0, easeRatio: [0.24, 0.22] },
      { bars: 2, curve: -CURVE.EASY * 1.1, blendToNext: true, elevation: -HILL.LOW * 0.2, easeRatio: [0.22, 0.22] },
      { bars: 3, curve: CURVE.MEDIUM * 0.9, elevation: HILL.LOW * 0.2, easeRatio: [0.22, 0.26] },
    ],
  }),

  // ============================================================================
  // OUTRO — Wind-down sweepers ending calmly at the stage fork / finish line
  // ============================================================================
  defineChunk({
    id: 'outro-coastal-winddown',
    description: 'Curvoni rilassati di fine brano che riportano dolcemente al livello zero',
    role: 'outro',
    bars: 4,
    weight: 1.2,
    elevationIntent: 'plunge',
    allowedStructures: ['standard', 'elevated'],
    styleTags: ['cruise', 'scenic'],
    fixtureCadenceBeats: 4,
    trafficProfile: 'sparse',
    maneuvers: [
      { bars: 2, curve: CURVE.EASY, elevation: -HILL.LOW * 0.4 },
      { bars: 2, curve: 0, elevation: 0 },
    ],
  }),

  defineChunk({
    id: 'outro-skyline-emergence-4',
    description: 'Tratto finale scorrevole verso la luce dello skyline e del bivio finale',
    role: 'outro',
    bars: 4,
    weight: 1.1,
    elevationIntent: 'rolling',
    allowedStructures: ['standard'],
    styleTags: ['cruise'],
    fixtureCadenceBeats: 2,
    trafficProfile: 'normal',
    maneuvers: [
      { bars: 2, curve: 0, elevation: HILL.LOW * 0.4 },
      { bars: 2, curve: CURVE.EASY * 0.6, elevation: 0 },
    ],
  }),

  defineChunk({
    id: 'outro-horizon-victory-8',
    description: 'Lungo viale d’arrivo a 8 battute con S dolce raccordata verso il traguardo',
    role: 'outro',
    bars: 8,
    weight: 1.1,
    elevationIntent: 'rolling',
    allowedStructures: ['standard', 'elevated'],
    styleTags: ['scenic', 'cruise'],
    fixtureCadenceBeats: 2,
    trafficProfile: 'sparse',
    maneuvers: [
      { bars: 3, curve: CURVE.EASY * 0.8, blendToNext: true, elevation: -HILL.LOW * 0.5 },
      { bars: 3, curve: -CURVE.EASY * 0.8, blendToNext: true, elevation: 0 },
      { bars: 2, curve: 0, elevation: 0 },
    ],
  }),

  defineChunk({
    id: 'outro-opening-cruise-8',
    description: 'Curva ampia ad apertura progressiva verso l’allineamento orizzontale del bivio',
    role: 'outro',
    bars: 8,
    weight: 1.05,
    elevationIntent: 'flat',
    allowedStructures: ['standard', 'elevated'],
    styleTags: ['cruise', 'scenic'],
    fixtureCadenceBeats: 4,
    trafficProfile: 'sparse',
    maneuvers: [
      { bars: 3, curve: CURVE.MEDIUM * 0.8, blendToNext: true, elevation: 0, easeRatio: [0.25, 0.2] },
      { bars: 3, curve: CURVE.EASY * 0.65, blendToNext: true, elevation: 0, easeRatio: [0.2, 0.25] },
      { bars: 2, curve: 0, elevation: 0 },
    ],
  }),

  defineChunk({
    id: 'outro-starlight-glide-4',
    description: 'Planata morbida finale sotto i lampioni verso il bivio radio',
    role: 'outro',
    bars: 4,
    weight: 1.0,
    elevationIntent: 'plunge',
    allowedStructures: ['standard', 'elevated'],
    styleTags: ['cruise'],
    fixtureCadenceBeats: 2,
    trafficProfile: 'sparse',
    maneuvers: [
      { bars: 2, curve: -CURVE.EASY * 0.7, elevation: -HILL.LOW * 0.3 },
      { bars: 2, curve: 0, elevation: 0 },
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
