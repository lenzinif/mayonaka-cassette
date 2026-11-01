/**
 * Live-tunable "feel" parameters (Design Pillar 1: Feel Over Simulation).
 *
 * The engine reads `tuning` every step, so the debug panel (`?debug`) can mutate it at runtime.
 * Once a set of values feels right, export it from the panel and bake it into DEFAULT_TUNING.
 */

export const DEFAULT_TUNING = {
  // Camera & road
  fieldOfView: 100,
  cameraHeight: 1000,
  drawDistance: 300,
  fogDensity: 5,
  roadWidth: 2000,

  // Speed (rates are fractions of maxSpeed per second)
  maxSpeed: 12000,
  maxSpeedKmh: 290,
  accelRate: 0.32,
  accelTaper: 0.65,
  brakeRate: 1.0,
  coastRate: 0.18,
  offRoadDecelRate: 0.7,
  offRoadMaxSpeedRatio: 0.3,

  // Steering (lateral units are road half-widths)
  steerRate: 2.2,
  steerResponse: 9,
  centrifugal: 0.22,
  playerXLimit: 2.2,

  // Drift
  driftMinSpeedRatio: 0.45,
  driftInwardSteer: 0.55,
  driftCounterSteer: 0.6,
  driftCentrifugalReduce: 0.75,
  driftDecelRate: 0.06,
  driftCleanMinTime: 0.7,
  driftExitBoost: 0.06,
} satisfies Record<string, number>;

export type TuningKey = keyof typeof DEFAULT_TUNING;
export type Tuning = Record<TuningKey, number>;

/** The single mutable tuning instance read by the engine. */
export const tuning: Tuning = { ...DEFAULT_TUNING };

export function resetTuning(): void {
  Object.assign(tuning, DEFAULT_TUNING);
}

/** Applies a partial set of values, ignoring unknown keys and non-numeric values. */
export function applyTuning(values: Record<string, unknown>): void {
  for (const key of Object.keys(DEFAULT_TUNING) as TuningKey[]) {
    const value = values[key];
    if (typeof value === 'number' && Number.isFinite(value)) tuning[key] = value;
  }
}

/** Returns only the values that differ from the defaults. */
export function tuningDiff(): Partial<Tuning> {
  const diff: Partial<Tuning> = {};
  for (const key of Object.keys(DEFAULT_TUNING) as TuningKey[]) {
    if (tuning[key] !== DEFAULT_TUNING[key]) diff[key] = tuning[key];
  }
  return diff;
}

export interface TuningControl {
  key: TuningKey;
  label: string;
  group: string;
  min: number;
  max: number;
  step: number;
}

export const TUNING_CONTROLS: readonly TuningControl[] = [
  { group: 'Camera', key: 'fieldOfView', label: 'FOV', min: 60, max: 140, step: 1 },
  { group: 'Camera', key: 'cameraHeight', label: 'Camera height', min: 400, max: 2500, step: 10 },
  { group: 'Camera', key: 'drawDistance', label: 'Draw distance', min: 100, max: 500, step: 10 },
  { group: 'Camera', key: 'fogDensity', label: 'Fog density', min: 0, max: 20, step: 0.5 },
  { group: 'Camera', key: 'roadWidth', label: 'Road half-width', min: 1200, max: 3200, step: 50 },

  { group: 'Speed', key: 'maxSpeed', label: 'Max speed', min: 6000, max: 20000, step: 100 },
  { group: 'Speed', key: 'maxSpeedKmh', label: 'Max km/h (display)', min: 150, max: 400, step: 5 },
  { group: 'Speed', key: 'accelRate', label: 'Acceleration', min: 0.05, max: 1, step: 0.01 },
  { group: 'Speed', key: 'accelTaper', label: 'Accel taper', min: 0, max: 0.95, step: 0.01 },
  { group: 'Speed', key: 'brakeRate', label: 'Brake', min: 0.2, max: 3, step: 0.05 },
  { group: 'Speed', key: 'coastRate', label: 'Coast decel', min: 0, max: 1, step: 0.01 },
  { group: 'Speed', key: 'offRoadDecelRate', label: 'Off-road decel', min: 0, max: 2, step: 0.05 },
  {
    group: 'Speed',
    key: 'offRoadMaxSpeedRatio',
    label: 'Off-road max',
    min: 0.1,
    max: 1,
    step: 0.01,
  },

  { group: 'Steering', key: 'steerRate', label: 'Steer rate', min: 0.5, max: 5, step: 0.05 },
  { group: 'Steering', key: 'steerResponse', label: 'Steer response', min: 1, max: 30, step: 0.5 },
  { group: 'Steering', key: 'centrifugal', label: 'Centrifugal', min: 0, max: 0.6, step: 0.01 },
  { group: 'Steering', key: 'playerXLimit', label: 'Lateral limit', min: 1.2, max: 4, step: 0.05 },

  { group: 'Drift', key: 'driftMinSpeedRatio', label: 'Min speed', min: 0, max: 0.9, step: 0.01 },
  { group: 'Drift', key: 'driftInwardSteer', label: 'Inward pull', min: 0, max: 1.5, step: 0.05 },
  {
    group: 'Drift',
    key: 'driftCounterSteer',
    label: 'Steer control',
    min: 0,
    max: 1.5,
    step: 0.05,
  },
  {
    group: 'Drift',
    key: 'driftCentrifugalReduce',
    label: 'Grip vs curve',
    min: 0,
    max: 1,
    step: 0.01,
  },
  { group: 'Drift', key: 'driftDecelRate', label: 'Speed bleed', min: 0, max: 0.5, step: 0.01 },
  {
    group: 'Drift',
    key: 'driftCleanMinTime',
    label: 'Clean min time',
    min: 0.1,
    max: 3,
    step: 0.05,
  },
  { group: 'Drift', key: 'driftExitBoost', label: 'Exit boost', min: 0, max: 0.3, step: 0.01 },
];
