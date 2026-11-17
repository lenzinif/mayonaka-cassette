import type { PropKind } from './RoadSegment';

export type SceneryThemeId = 'coastal' | 'city' | 'touge';

/**
 * Stage scenery theme configuration (biome coherence, docs/DESIGN.md §2 Fase 5).
 * Resolved at render time so road generation remains a pure deterministic function of (BeatMap, seed).
 */
export interface SceneryTheme {
  readonly id: SceneryThemeId;
  readonly tree: 'palm' | 'street-tree' | 'pine';
  readonly shrubTint: readonly [string, string, string];
  readonly buildingDensity: number;
  readonly hideKinds?: ReadonlySet<PropKind>;
}

export const SCENERY_CITY_NIGHT: SceneryTheme = {
  id: 'city',
  tree: 'street-tree',
  shrubTint: ['#00e5be', '#0a3a40', '#e6195e'],
  buildingDensity: 1.0,
};

export const SCENERY_COASTAL_SUNSET: SceneryTheme = {
  id: 'coastal',
  tree: 'palm',
  shrubTint: ['#06d6a0', '#0a4235', '#ff2a75'],
  buildingDensity: 0.35,
};

export const SCENERY_COASTAL_PASTEL: SceneryTheme = {
  id: 'coastal',
  tree: 'palm',
  shrubTint: ['#70a9a1', '#2f283d', '#ffb5a7'],
  buildingDensity: 0.25,
};

export const SCENERY_CITY_NOON: SceneryTheme = {
  id: 'city',
  tree: 'street-tree',
  shrubTint: ['#4d5e2e', '#232c12', '#ffda6b'],
  buildingDensity: 1.0,
};

export const SCENERY_CITY_AKIBANIGHT: SceneryTheme = {
  id: 'city',
  tree: 'street-tree',
  shrubTint: ['#00f5d4', '#0d2830', '#ff007f'],
  buildingDensity: 1.0,
};

export const SCENERY_TOUGE: SceneryTheme = {
  id: 'touge',
  tree: 'pine',
  shrubTint: ['#2d6a4f', '#143626', '#e76f51'],
  buildingDensity: 0.05,
};

/**
 * Stage colour palettes (Future Funk aesthetics: night / og_future_funk / vaporfunk / weeb_funk).
 * Segments only store a stripe index; colours are resolved at render time so a stage
 * can swap palettes (or pulse them on the beat) without rebuilding geometry.
 */
export interface StagePalette {
  id:
    | 'night'
    | 'og_future_funk'
    | 'akiba_noon'
    | 'akiba_night'
    | 'vaporfunk'
    | 'weeb_funk'
    | 'vaporwave'
    | 'coastal';
  name: string;
  skyTop: string;
  skyMid: string;
  skyHorizon: string;
  horizonGlow?: string;
  fog: string;
  fogDensity?: number;
  starColors?: readonly [string, string];
  sunTop: string;
  sunBottom: string;
  mountain: string;
  mountainRim: string;
  grass: readonly [string, string];
  water?: readonly [string, string];
  road: readonly [string, string];
  rumble: readonly [string, string];
  lane: string;
  scenery: SceneryTheme;
}

/**
 * Preset 1: Night Funk (MAYONAKA BAY)
 * Matching reference image: midnight urban bay, sensual electronic beats, stylish solitary drive.
 * Deep indigo/royal purple sky, turquoise water horizon glow, deep indigo-teal fog,
 * graphite-blue wet asphalt, mint and ruby rumble, ice cyan lanes.
 */
export const PALETTE_NIGHT_FUNK: StagePalette = {
  id: 'night',
  name: 'MAYONAKA BAY',
  skyTop: '#06071b',
  skyMid: '#120e2e',
  skyHorizon: '#00e5be',
  horizonGlow: '#00f0b5',
  fog: '#0a102b',
  fogDensity: 1.0,
  starColors: ['#80f6ff', '#e0fbfc'],
  sunTop: '#e0fbfc',
  sunBottom: '#00b4d8',
  mountain: '#050716',
  mountainRim: '#00f0b5',
  grass: ['#080c1d', '#050713'],
  water: ['#0d1b3e', '#09132e'],
  road: ['#161c2e', '#121724'],
  rumble: ['#00f0b5', '#e6195e'],
  lane: '#80f6ff',
  scenery: SCENERY_CITY_NIGHT,
};

/**
 * Preset 2: OG Future Funk (SUNSET BOULEVARD)
 * Matching classic City Pop / Plastic Love golden hour decadent 80s:
 * Twilight violet to hot coral to tangerine to gold, warm peach/magenta fog,
 * warm plum asphalt, bubblegum and gold rumble, butter cream lanes.
 */
export const PALETTE_OG_FUTURE_FUNK: StagePalette = {
  id: 'og_future_funk',
  name: 'SUNSET BOULEVARD',
  skyTop: '#120224',
  skyMid: '#d82b7d',
  skyHorizon: '#ff7b25',
  horizonGlow: '#ffd447',
  fog: '#b02868',
  fogDensity: 1.0,
  starColors: ['#ffd447', '#fff2c2'],
  sunTop: '#ffd447',
  sunBottom: '#ff2a75',
  mountain: '#240a38',
  mountainRim: '#fff2c2',
  grass: ['#210933', '#160524'],
  water: ['#3c1354', '#2c0d42'],
  road: ['#291b38', '#20152d'],
  rumble: ['#ff2a75', '#ffd319'],
  lane: '#fff2c2',
  scenery: SCENERY_COASTAL_SUNSET,
};

/**
 * Preset 3: Vaporfunk (PASTEL MIRAGE)
 * Matching dreamy hazy mood:
 * Lavender to mauve to blush pink/sage, dense lilac opalescent fog (fogDensity: 1.35),
 * matte mauve asphalt, muted teal and lilac rumble, soft pearl lanes.
 */
export const PALETTE_VAPORFUNK: StagePalette = {
  id: 'vaporfunk',
  name: 'PASTEL MIRAGE',
  skyTop: '#231942',
  skyMid: '#5e548e',
  skyHorizon: '#e0b1cb',
  horizonGlow: '#e0b1cb',
  fog: '#7b6b9e',
  fogDensity: 1.35,
  starColors: ['#e0b1cb', '#f8f9fa'],
  sunTop: '#f8f9fa',
  sunBottom: '#c77dff',
  mountain: '#352952',
  mountainRim: '#48bfe3',
  grass: ['#2a203f', '#1e162e'],
  water: ['#433266', '#332552'],
  road: ['#2f283d', '#272133'],
  rumble: ['#48bfe3', '#c77dff'],
  lane: '#f8f9fa',
  scenery: SCENERY_COASTAL_PASTEL,
};

/**
 * Preset 3: Akiba Noon Rush (AKIBA NOON RUSH)
 * A torrid, sweltering summer midday: bright, weary, sun-drenched with heavy stark shadows.
 * Bleached summer cobalt sky, hazy heat-white horizon, sultry dusty cream fog (fogDensity: 1.05),
 * sun-baked dark tarmac with harsh shadow contrast, sun-scorched crimson & bone rumble strips.
 */
export const PALETTE_AKIBA_NOON: StagePalette = {
  id: 'akiba_noon',
  name: 'AKIBA NOON RUSH',
  skyTop: '#397cc8',
  skyMid: '#b0d8ea',
  skyHorizon: '#fff4dd',
  horizonGlow: '#ffeec2',
  fog: '#e4dac5',
  fogDensity: 1.05,
  starColors: ['#ffffff', '#fff4dd'],
  sunTop: '#ffffff',
  sunBottom: '#ffda6b',
  mountain: '#2f3542',
  mountainRim: '#ffffff',
  grass: ['#4d5e2e', '#3a4721'],
  water: ['#2c6ca3', '#23598a'],
  road: ['#32353b', '#1e2025'],
  rumble: ['#b83232', '#eee3cb'],
  lane: '#fffdf5',
  scenery: SCENERY_CITY_NOON,
};

/**
 * Preset 4: Akiba Night Rush (AKIBA NIGHT RUSH)
 * High-BPM electric night:
 * Electric cobalt to electric magenta to neon cyan, crisp clear fog (fogDensity: 0.85),
 * jet black asphalt, fluorescent yellow and hot fuchsia rumble, neon cyan lanes.
 */
export const PALETTE_AKIBA_NIGHT: StagePalette = {
  id: 'akiba_night',
  name: 'AKIBA NIGHT RUSH',
  skyTop: '#040827',
  skyMid: '#490b4d',
  skyHorizon: '#00f5d4',
  horizonGlow: '#00f5d4',
  fog: '#0c1033',
  fogDensity: 0.85,
  starColors: ['#00f5d4', '#ffee32'],
  sunTop: '#ffee32',
  sunBottom: '#ff007f',
  mountain: '#090d29',
  mountainRim: '#00f5d4',
  grass: ['#080a1c', '#04050e'],
  water: ['#101a4d', '#0b1238'],
  road: ['#10121a', '#0a0c12'],
  rumble: ['#ffee32', '#ff007f'],
  lane: '#00f0ff',
  scenery: SCENERY_CITY_AKIBANIGHT,
};

export const STAGE_PALETTES: readonly StagePalette[] = [
  PALETTE_NIGHT_FUNK,
  PALETTE_OG_FUTURE_FUNK,
  PALETTE_AKIBA_NIGHT,
];

export function getStagePalette(stageIndex: number): StagePalette {
  const len = STAGE_PALETTES.length;
  const idx = ((Math.floor(stageIndex) % len) + len) % len;
  return STAGE_PALETTES[idx] ?? PALETTE_NIGHT_FUNK;
}

interface MutableStagePalette {
  id: StagePalette['id'];
  name: string;
  skyTop: string;
  skyMid: string;
  skyHorizon: string;
  horizonGlow?: string;
  fog: string;
  fogDensity?: number;
  starColors?: [string, string];
  sunTop: string;
  sunBottom: string;
  mountain: string;
  mountainRim: string;
  grass: [string, string];
  water?: [string, string];
  road: [string, string];
  rumble: [string, string];
  lane: string;
  scenery: SceneryTheme;
}

function parseHexChannel(hex: string, offset: number): number {
  const h = hex.startsWith('#') ? hex.slice(1) : hex;
  if (h.length === 3) {
    const ch = h.charAt(offset >> 1);
    const nib = Number.parseInt(ch, 16);
    return Number.isNaN(nib) ? 0 : nib * 17;
  }
  const v = Number.parseInt(h.slice(offset, offset + 2), 16);
  return Number.isNaN(v) ? 0 : v;
}

function toHex2(v: number): string {
  const clamped = Math.max(0, Math.min(255, Math.round(v)));
  return clamped < 16 ? `0${clamped.toString(16)}` : clamped.toString(16);
}

/**
 * Linearly interpolates between two `#rrggbb` colors, always returning a canonical `#rrggbb` string.
 */
export function lerpHexColor(hexA: string, hexB: string, t: number): string {
  const clampedT = Math.max(0, Math.min(1, t));
  if (clampedT <= 0.001) return hexA;
  if (clampedT >= 0.999) return hexB;
  const rA = parseHexChannel(hexA, 0);
  const gA = parseHexChannel(hexA, 2);
  const bA = parseHexChannel(hexA, 4);
  const rB = parseHexChannel(hexB, 0);
  const gB = parseHexChannel(hexB, 2);
  const bB = parseHexChannel(hexB, 4);
  return `#${toHex2(rA + (rB - rA) * clampedT)}${toHex2(gA + (gB - gA) * clampedT)}${toHex2(bA + (bB - bA) * clampedT)}`;
}

/**
 * Allocates a reusable mutable clone of a `StagePalette` for smooth zero-GC crossfades.
 */
export function createMutablePaletteClone(base: StagePalette): StagePalette {
  const clone: MutableStagePalette = {
    id: base.id,
    name: base.name,
    skyTop: base.skyTop,
    skyMid: base.skyMid,
    skyHorizon: base.skyHorizon,
    horizonGlow: base.horizonGlow ?? base.skyHorizon,
    fog: base.fog,
    fogDensity: base.fogDensity ?? 1.0,
    starColors: [
      base.starColors?.[0] ?? base.mountainRim,
      base.starColors?.[1] ?? base.sunTop,
    ],
    sunTop: base.sunTop,
    sunBottom: base.sunBottom,
    mountain: base.mountain,
    mountainRim: base.mountainRim,
    grass: [base.grass[0], base.grass[1]],
    water: [
      base.water?.[0] ?? base.grass[0],
      base.water?.[1] ?? base.grass[1],
    ],
    road: [base.road[0], base.road[1]],
    rumble: [base.rumble[0], base.rumble[1]],
    lane: base.lane,
    scenery: base.scenery,
  };
  return clone;
}

/**
 * Smoothly blends `from` into `to` at progress `t in [0, 1]`, mutating pre-allocated `out` in-place
 * without allocating objects or tuples (safe for fixed-step transitions).
 */
export function blendStagePalette(
  from: StagePalette,
  to: StagePalette,
  t: number,
  out: StagePalette,
): StagePalette {
  const clampedT = Math.max(0, Math.min(1, t));
  const m = out as MutableStagePalette;
  const active = clampedT >= 0.5 ? to : from;

  m.id = active.id;
  m.name = to.name;
  m.scenery = active.scenery;

  m.skyTop = lerpHexColor(from.skyTop, to.skyTop, clampedT);
  m.skyMid = lerpHexColor(from.skyMid, to.skyMid, clampedT);
  m.skyHorizon = lerpHexColor(from.skyHorizon, to.skyHorizon, clampedT);
  m.horizonGlow = lerpHexColor(
    from.horizonGlow ?? from.skyHorizon,
    to.horizonGlow ?? to.skyHorizon,
    clampedT,
  );
  m.fog = lerpHexColor(from.fog, to.fog, clampedT);

  const fromDensity = from.fogDensity ?? 1.0;
  const toDensity = to.fogDensity ?? 1.0;
  m.fogDensity = fromDensity + (toDensity - fromDensity) * clampedT;

  const fromStar0 = from.starColors?.[0] ?? from.mountainRim;
  const toStar0 = to.starColors?.[0] ?? to.mountainRim;
  const fromStar1 = from.starColors?.[1] ?? from.sunTop;
  const toStar1 = to.starColors?.[1] ?? to.sunTop;
  if (!m.starColors) {
    m.starColors = [fromStar0, fromStar1];
  }
  m.starColors[0] = lerpHexColor(fromStar0, toStar0, clampedT);
  m.starColors[1] = lerpHexColor(fromStar1, toStar1, clampedT);

  m.sunTop = lerpHexColor(from.sunTop, to.sunTop, clampedT);
  m.sunBottom = lerpHexColor(from.sunBottom, to.sunBottom, clampedT);
  m.mountain = lerpHexColor(from.mountain, to.mountain, clampedT);
  m.mountainRim = lerpHexColor(from.mountainRim, to.mountainRim, clampedT);

  m.grass[0] = lerpHexColor(from.grass[0], to.grass[0], clampedT);
  m.grass[1] = lerpHexColor(from.grass[1], to.grass[1], clampedT);

  const fromWater0 = from.water?.[0] ?? from.grass[0];
  const toWater0 = to.water?.[0] ?? to.grass[0];
  const fromWater1 = from.water?.[1] ?? from.grass[1];
  const toWater1 = to.water?.[1] ?? to.grass[1];
  if (!m.water) {
    m.water = [fromWater0, fromWater1];
  }
  m.water[0] = lerpHexColor(fromWater0, toWater0, clampedT);
  m.water[1] = lerpHexColor(fromWater1, toWater1, clampedT);

  m.road[0] = lerpHexColor(from.road[0], to.road[0], clampedT);
  m.road[1] = lerpHexColor(from.road[1], to.road[1], clampedT);
  m.rumble[0] = lerpHexColor(from.rumble[0], to.rumble[0], clampedT);
  m.rumble[1] = lerpHexColor(from.rumble[1], to.rumble[1], clampedT);
  m.lane = lerpHexColor(from.lane, to.lane, clampedT);

  return out;
}
