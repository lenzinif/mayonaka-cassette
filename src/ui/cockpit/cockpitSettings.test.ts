import { afterEach, describe, expect, it } from 'vitest';
import {
  COCKPIT_PRESET_CLEAN,
  COCKPIT_PRESET_LUXURY,
  COCKPIT_STORAGE_KEY,
  isCleanPreset,
  isLuxuryPreset,
  loadCockpitVisibility,
  saveCockpitVisibility,
} from './cockpitSettings';

describe('cockpitSettings', () => {
  const originalWindow = globalThis.window;

  afterEach(() => {
    if (originalWindow === undefined) {
      delete (globalThis as { window?: unknown }).window;
    } else {
      globalThis.window = originalWindow;
    }
  });

  it('defaults to COCKPIT_PRESET_LUXURY when localStorage is unavailable or empty', () => {
    expect(loadCockpitVisibility()).toEqual(COCKPIT_PRESET_LUXURY);
    expect(isLuxuryPreset(COCKPIT_PRESET_LUXURY)).toBe(true);
    expect(isCleanPreset(COCKPIT_PRESET_CLEAN)).toBe(true);
    expect(isLuxuryPreset(COCKPIT_PRESET_CLEAN)).toBe(false);
  });

  it('persists and sanitizes visibility toggles in localStorage', () => {
    const store = new Map<string, string>();
    (globalThis as { window?: unknown }).window = {
      localStorage: {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => {
          store.set(k, v);
        },
      },
    };

    saveCockpitVisibility(COCKPIT_PRESET_CLEAN);
    expect(loadCockpitVisibility()).toEqual(COCKPIT_PRESET_CLEAN);

    // Corrupted partial JSON falls back cleanly per field
    store.set(COCKPIT_STORAGE_KEY, '{"showRadioConsole":false,"showSunVisor":"bad"}');
    expect(loadCockpitVisibility()).toEqual({
      showInstrumentCluster: true,
      showRadioConsole: false,
      showSunVisor: true,
      showCassetteWidget: true,
    });

    // Invalid JSON falls back to full luxury default
    store.set(COCKPIT_STORAGE_KEY, '{not-json');
    expect(loadCockpitVisibility()).toEqual(COCKPIT_PRESET_LUXURY);

    // Non-object JSON values fall back cleanly
    store.set(COCKPIT_STORAGE_KEY, 'null');
    expect(loadCockpitVisibility()).toEqual(COCKPIT_PRESET_LUXURY);
    store.set(COCKPIT_STORAGE_KEY, '[]');
    expect(loadCockpitVisibility()).toEqual(COCKPIT_PRESET_LUXURY);
  });

  it('ignores throwing localStorage implementations gracefully', () => {
    (globalThis as { window?: unknown }).window = {
      localStorage: {
        getItem: () => {
          throw new Error('SecurityError');
        },
        setItem: () => {
          throw new Error('QuotaExceededError');
        },
      },
    };

    expect(loadCockpitVisibility()).toEqual(COCKPIT_PRESET_LUXURY);
    expect(() => saveCockpitVisibility(COCKPIT_PRESET_CLEAN)).not.toThrow();
  });
});
