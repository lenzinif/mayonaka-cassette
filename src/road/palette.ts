/**
 * Stage colour palettes (D7 vaporwave). Segments only store a stripe index; colours are resolved
 * at render time so a stage can swap palettes (or pulse them on the beat) without rebuilding.
 */
export interface StagePalette {
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
