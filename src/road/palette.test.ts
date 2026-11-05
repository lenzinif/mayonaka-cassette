import { describe, expect, it } from 'vitest';
import {
  getStagePalette,
  PALETTE_AKIBA_NIGHT,
  PALETTE_AKIBA_NOON,
  PALETTE_COASTAL_BREEZE,
  PALETTE_MIDNIGHT_WANGAN,
  PALETTE_NIGHT_FUNK,
  PALETTE_OG_FUTURE_FUNK,
  PALETTE_SUNSET_BOULEVARD,
  PALETTE_VAPORFUNK,
  PALETTE_WEEB_FUNK,
  STAGE_PALETTES,
  type StagePalette,
} from './palette';

const HEX_COLOR_REGEX = /^#[0-9a-fA-F]{6}$/;

function validatePalette(palette: StagePalette): void {
  expect(palette.name.length).toBeGreaterThan(0);
  expect(palette.skyTop).toMatch(HEX_COLOR_REGEX);
  expect(palette.skyMid).toMatch(HEX_COLOR_REGEX);
  expect(palette.skyHorizon).toMatch(HEX_COLOR_REGEX);
  expect(palette.fog).toMatch(HEX_COLOR_REGEX);
  expect(palette.sunTop).toMatch(HEX_COLOR_REGEX);
  expect(palette.sunBottom).toMatch(HEX_COLOR_REGEX);
  expect(palette.mountain).toMatch(HEX_COLOR_REGEX);
  expect(palette.mountainRim).toMatch(HEX_COLOR_REGEX);
  expect(palette.lane).toMatch(HEX_COLOR_REGEX);

  expect(palette.grass).toHaveLength(2);
  expect(palette.grass[0]).toMatch(HEX_COLOR_REGEX);
  expect(palette.grass[1]).toMatch(HEX_COLOR_REGEX);

  expect(palette.road).toHaveLength(2);
  expect(palette.road[0]).toMatch(HEX_COLOR_REGEX);
  expect(palette.road[1]).toMatch(HEX_COLOR_REGEX);

  expect(palette.rumble).toHaveLength(2);
  expect(palette.rumble[0]).toMatch(HEX_COLOR_REGEX);
  expect(palette.rumble[1]).toMatch(HEX_COLOR_REGEX);

  if (palette.horizonGlow !== undefined) {
    expect(palette.horizonGlow).toMatch(HEX_COLOR_REGEX);
  }
  if (palette.fogDensity !== undefined) {
    expect(palette.fogDensity).toBeGreaterThan(0);
    expect(Number.isFinite(palette.fogDensity)).toBe(true);
  }
  if (palette.starColors !== undefined) {
    expect(palette.starColors).toHaveLength(2);
    expect(palette.starColors[0]).toMatch(HEX_COLOR_REGEX);
    expect(palette.starColors[1]).toMatch(HEX_COLOR_REGEX);
  }
}

describe('StagePalettes (Future Funk Presets)', () => {
  it('defines 3 distinct authentic Future Funk palettes in STAGE_PALETTES', () => {
    expect(STAGE_PALETTES).toHaveLength(3);
    expect(STAGE_PALETTES[0]).toBe(PALETTE_NIGHT_FUNK);
    expect(STAGE_PALETTES[1]).toBe(PALETTE_OG_FUTURE_FUNK);
    expect(STAGE_PALETTES[2]).toBe(PALETTE_AKIBA_NIGHT);
  });

  it('validates PALETTE_NIGHT_FUNK structure and attributes (Mayonaka Bay)', () => {
    expect(PALETTE_NIGHT_FUNK.id).toBe('night');
    expect(PALETTE_NIGHT_FUNK.name).toBe('MAYONAKA BAY');
    expect(PALETTE_NIGHT_FUNK.road).toEqual(['#161c2e', '#121724']);
    expect(PALETTE_NIGHT_FUNK.rumble).toEqual(['#00f0b5', '#e6195e']);
    expect(PALETTE_NIGHT_FUNK.lane).toBe('#80f6ff');
    expect(PALETTE_NIGHT_FUNK.horizonGlow).toBe('#00f0b5');
    validatePalette(PALETTE_NIGHT_FUNK);
  });

  it('validates PALETTE_OG_FUTURE_FUNK structure and attributes (Sunset Boulevard)', () => {
    expect(PALETTE_OG_FUTURE_FUNK.id).toBe('og_future_funk');
    expect(PALETTE_OG_FUTURE_FUNK.name).toBe('SUNSET BOULEVARD');
    expect(PALETTE_OG_FUTURE_FUNK.road).toEqual(['#291b38', '#20152d']);
    expect(PALETTE_OG_FUTURE_FUNK.rumble).toEqual(['#ff2a75', '#ffd319']);
    expect(PALETTE_OG_FUTURE_FUNK.lane).toBe('#fff2c2');
    expect(PALETTE_OG_FUTURE_FUNK.horizonGlow).toBe('#ffd447');
    validatePalette(PALETTE_OG_FUTURE_FUNK);
  });

  it('validates PALETTE_AKIBA_NOON structure and attributes (Akiba Noon Rush)', () => {
    expect(PALETTE_AKIBA_NOON.id).toBe('akiba_noon');
    expect(PALETTE_AKIBA_NOON.name).toBe('AKIBA NOON RUSH');
    expect(PALETTE_AKIBA_NOON.fogDensity).toBe(1.05);
    expect(PALETTE_AKIBA_NOON.road).toEqual(['#32353b', '#1e2025']);
    expect(PALETTE_AKIBA_NOON.rumble).toEqual(['#b83232', '#eee3cb']);
    expect(PALETTE_AKIBA_NOON.lane).toBe('#fffdf5');
    expect(PALETTE_AKIBA_NOON.horizonGlow).toBe('#ffeec2');
    validatePalette(PALETTE_AKIBA_NOON);
  });

  it('validates PALETTE_AKIBA_NIGHT structure and attributes (Akiba Night Rush)', () => {
    expect(PALETTE_AKIBA_NIGHT.id).toBe('akiba_night');
    expect(PALETTE_AKIBA_NIGHT.name).toBe('AKIBA NIGHT RUSH');
    expect(PALETTE_AKIBA_NIGHT.fogDensity).toBe(0.85);
    expect(PALETTE_AKIBA_NIGHT.road).toEqual(['#10121a', '#0a0c12']);
    expect(PALETTE_AKIBA_NIGHT.rumble).toEqual(['#ffee32', '#ff007f']);
    expect(PALETTE_AKIBA_NIGHT.lane).toBe('#00f0ff');
    validatePalette(PALETTE_AKIBA_NIGHT);
  });

  it('preserves legacy aliases for backward compatibility', () => {
    expect(PALETTE_SUNSET_BOULEVARD).toBe(PALETTE_OG_FUTURE_FUNK);
    expect(PALETTE_MIDNIGHT_WANGAN).toBe(PALETTE_NIGHT_FUNK);
    expect(PALETTE_COASTAL_BREEZE).toBe(PALETTE_VAPORFUNK);
    expect(PALETTE_WEEB_FUNK).toBe(PALETTE_AKIBA_NIGHT);
    validatePalette(PALETTE_VAPORFUNK);
  });

  describe('getStagePalette rotation', () => {
    it('cycles sequentially across stages 0 to 2', () => {
      expect(getStagePalette(0)).toBe(PALETTE_NIGHT_FUNK);
      expect(getStagePalette(1)).toBe(PALETTE_OG_FUTURE_FUNK);
      expect(getStagePalette(2)).toBe(PALETTE_AKIBA_NIGHT);
    });

    it('wraps cleanly on stage 3 and higher', () => {
      expect(getStagePalette(3)).toBe(PALETTE_NIGHT_FUNK);
      expect(getStagePalette(4)).toBe(PALETTE_OG_FUTURE_FUNK);
      expect(getStagePalette(5)).toBe(PALETTE_AKIBA_NIGHT);
      expect(getStagePalette(99)).toBe(PALETTE_NIGHT_FUNK);
      expect(getStagePalette(100)).toBe(PALETTE_OG_FUTURE_FUNK);
    });

    it('handles negative indices cleanly without out-of-bounds errors', () => {
      expect(getStagePalette(-1)).toBe(PALETTE_AKIBA_NIGHT);
      expect(getStagePalette(-2)).toBe(PALETTE_OG_FUTURE_FUNK);
      expect(getStagePalette(-3)).toBe(PALETTE_NIGHT_FUNK);
      expect(getStagePalette(-4)).toBe(PALETTE_AKIBA_NIGHT);
    });

    it('floors fractional stage indices safely', () => {
      expect(getStagePalette(0.8)).toBe(PALETTE_NIGHT_FUNK);
      expect(getStagePalette(1.2)).toBe(PALETTE_OG_FUTURE_FUNK);
      expect(getStagePalette(2.99)).toBe(PALETTE_AKIBA_NIGHT);
    });
  });
});
