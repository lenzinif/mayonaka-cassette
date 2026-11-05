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
  road: readonly [string, string];
  rumble: readonly [string, string];
  lane: string;
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
  road: ['#161c2e', '#121724'],
  rumble: ['#00f0b5', '#e6195e'],
  lane: '#80f6ff',
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
  mountainRim: '#05d9e8',
  grass: ['#210933', '#160524'],
  road: ['#291b38', '#20152d'],
  rumble: ['#ff2a75', '#ffd319'],
  lane: '#fff2c2',
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
  road: ['#2f283d', '#272133'],
  rumble: ['#48bfe3', '#c77dff'],
  lane: '#f8f9fa',
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
  road: ['#32353b', '#1e2025'],
  rumble: ['#b83232', '#eee3cb'],
  lane: '#fffdf5',
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
  road: ['#10121a', '#0a0c12'],
  rumble: ['#ffee32', '#ff007f'],
  lane: '#00f0ff',
};

export const PALETTE_WEEB_FUNK: StagePalette = PALETTE_AKIBA_NIGHT;

/** Legacy aliases for complete backward compatibility */
export const PALETTE_SUNSET_BOULEVARD: StagePalette = PALETTE_OG_FUTURE_FUNK;
export const PALETTE_MIDNIGHT_WANGAN: StagePalette = PALETTE_NIGHT_FUNK;
export const PALETTE_COASTAL_BREEZE: StagePalette = PALETTE_VAPORFUNK;

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
