/**
 * Stage colour palettes (AGENTS.md §3: vaporwave / night / coastal).
 * Segments only store a stripe index; colours are resolved at render time so a stage
 * can swap palettes (or pulse them on the beat) without rebuilding geometry.
 */
export interface StagePalette {
  id: 'vaporwave' | 'night' | 'coastal';
  name: string;
  skyTop: string;
  skyMid: string;
  skyHorizon: string;
  fog: string;
  sunTop: string;
  sunBottom: string;
  mountain: string;
  mountainRim: string;
  grass: readonly [string, string];
  road: readonly [string, string];
  rumble: readonly [string, string];
  lane: string;
}

export const PALETTE_SUNSET_BOULEVARD: StagePalette = {
  id: 'vaporwave',
  name: 'SUNSET BOULEVARD',
  skyTop: '#0d0221',
  skyMid: '#3b0f5f',
  skyHorizon: '#ff4f9a',
  fog: '#b8357f',
  sunTop: '#ffd319',
  sunBottom: '#ff2975',
  mountain: '#2a0d4a',
  mountainRim: '#05d9e8',
  grass: ['#1d0a3b', '#170731'],
  road: ['#2e2342', '#281e3a'],
  rumble: ['#05d9e8', '#ff2a6d'],
  lane: '#f6e7ff',
};

export const PALETTE_MIDNIGHT_WANGAN: StagePalette = {
  id: 'night',
  name: 'MIDNIGHT WANGAN',
  skyTop: '#020414',
  skyMid: '#091845',
  skyHorizon: '#05d9e8',
  fog: '#0d3b66',
  sunTop: '#e0fbfc',
  sunBottom: '#00b4d8',
  mountain: '#07112e',
  mountainRim: '#ff2a6d',
  grass: ['#061326', '#040d1c'],
  road: ['#1b2436', '#161e2e'],
  rumble: ['#ff2a6d', '#ffd319'],
  lane: '#a8f9ff',
};

export const PALETTE_COASTAL_BREEZE: StagePalette = {
  id: 'coastal',
  name: 'COASTAL BREEZE',
  skyTop: '#081c38',
  skyMid: '#1e5f74',
  skyHorizon: '#ff9e7d',
  fog: '#cc6b8e',
  sunTop: '#fff3b0',
  sunBottom: '#ff5d8f',
  mountain: '#173753',
  mountainRim: '#6fffe9',
  grass: ['#123540', '#0e2a33'],
  road: ['#2b3445', '#242c3b'],
  rumble: ['#6fffe9', '#ff5d8f'],
  lane: '#fff8e7',
};

export const STAGE_PALETTES: readonly StagePalette[] = [
  PALETTE_SUNSET_BOULEVARD,
  PALETTE_MIDNIGHT_WANGAN,
  PALETTE_COASTAL_BREEZE,
];

export function getStagePalette(stageIndex: number): StagePalette {
  const idx = ((Math.floor(stageIndex) % STAGE_PALETTES.length) + STAGE_PALETTES.length) % STAGE_PALETTES.length;
  return STAGE_PALETTES[idx] ?? PALETTE_SUNSET_BOULEVARD;
}
