export interface CockpitVisibility {
  showInstrumentCluster: boolean;
  showRadioConsole: boolean;
  showSunVisor: boolean;
  showCassetteWidget: boolean;
}

export const COCKPIT_STORAGE_KEY = 'mayonaka-cassette-cockpit-v1';

export const COCKPIT_PRESET_LUXURY: CockpitVisibility = {
  showInstrumentCluster: true,
  showRadioConsole: true,
  showSunVisor: true,
  showCassetteWidget: true,
};

export const COCKPIT_PRESET_CLUTTER: CockpitVisibility = COCKPIT_PRESET_LUXURY;

export const COCKPIT_PRESET_CLEAN: CockpitVisibility = {
  showInstrumentCluster: true,
  showRadioConsole: false,
  showSunVisor: false,
  showCassetteWidget: false,
};

function sanitizeCockpitVisibility(raw: unknown): CockpitVisibility {
  if (!raw || typeof raw !== 'object') {
    return { ...COCKPIT_PRESET_LUXURY };
  }
  const obj = raw as Record<string, unknown>;
  return {
    showInstrumentCluster:
      typeof obj.showInstrumentCluster === 'boolean'
        ? obj.showInstrumentCluster
        : COCKPIT_PRESET_LUXURY.showInstrumentCluster,
    showRadioConsole:
      typeof obj.showRadioConsole === 'boolean'
        ? obj.showRadioConsole
        : COCKPIT_PRESET_LUXURY.showRadioConsole,
    showSunVisor:
      typeof obj.showSunVisor === 'boolean'
        ? obj.showSunVisor
        : COCKPIT_PRESET_LUXURY.showSunVisor,
    showCassetteWidget:
      typeof obj.showCassetteWidget === 'boolean'
        ? obj.showCassetteWidget
        : COCKPIT_PRESET_LUXURY.showCassetteWidget,
  };
}

export function loadCockpitVisibility(): CockpitVisibility {
  try {
    if (typeof window === 'undefined' || !window.localStorage) {
      return { ...COCKPIT_PRESET_LUXURY };
    }
    const raw = window.localStorage.getItem(COCKPIT_STORAGE_KEY);
    if (!raw) {
      return { ...COCKPIT_PRESET_LUXURY };
    }
    return sanitizeCockpitVisibility(JSON.parse(raw));
  } catch {
    return { ...COCKPIT_PRESET_LUXURY };
  }
}

export function saveCockpitVisibility(visibility: CockpitVisibility): void {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return;
    window.localStorage.setItem(COCKPIT_STORAGE_KEY, JSON.stringify(visibility));
  } catch {
    // Ignore storage quota or private browsing failures
  }
}

export function isLuxuryPreset(v: CockpitVisibility): boolean {
  return (
    v.showInstrumentCluster === COCKPIT_PRESET_LUXURY.showInstrumentCluster &&
    v.showSunVisor === COCKPIT_PRESET_LUXURY.showSunVisor &&
    v.showCassetteWidget === COCKPIT_PRESET_LUXURY.showCassetteWidget
  );
}

export function isCleanPreset(v: CockpitVisibility): boolean {
  return (
    v.showInstrumentCluster === COCKPIT_PRESET_CLEAN.showInstrumentCluster &&
    v.showSunVisor === COCKPIT_PRESET_CLEAN.showSunVisor &&
    v.showCassetteWidget === COCKPIT_PRESET_CLEAN.showCassetteWidget
  );
}
