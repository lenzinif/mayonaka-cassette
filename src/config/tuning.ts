/**
 * Live-tunable "feel" parameters (Design Pillar 1: Feel Over Simulation).
 *
 * The engine reads `tuning` every step, so the debug panel (`?debug` or `F2`) can mutate it at runtime.
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
  offRoadDecelRate: 0.85,
  offRoadMaxSpeedRatio: 0.3,

  // Steering (lateral units are road half-widths: 0 = center, ±1 = asphalt edge)
  steerRate: 2.2,
  steerResponse: 9,
  centrifugal: 0.55,
  playerXLimit: 2.4,

  // Drift
  driftMinSpeedRatio: 0.45,
  driftInwardSteer: 0.55,
  driftCounterSteer: 0.6,
  driftCentrifugalReduce: 0.55,
  driftDecelRate: 0.08,

  // Audio & Beat Pulse (M3)
  audioFilterMinHz: 420,
  audioFilterMaxHz: 18000,
  audioFilterDriftQ: 3.2,
  audioOffRoadPitchDip: 0.09,
  bpmPulseStrength: 1.0,
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
  hint: string;
  unit?: string;
  group: string;
  min: number;
  max: number;
  step: number;
}

export const TUNING_CONTROLS: readonly TuningControl[] = [
  {
    group: 'Camera',
    key: 'fieldOfView',
    label: 'FOV',
    hint: 'Ampiezza visiva: più alto aumenta il senso di velocità',
    unit: '°',
    min: 60,
    max: 140,
    step: 1,
  },
  {
    group: 'Camera',
    key: 'cameraHeight',
    label: 'Camera height',
    hint: 'Altezza visuale sulla strada (più bassa = più radente)',
    min: 400,
    max: 2500,
    step: 10,
  },
  {
    group: 'Camera',
    key: 'drawDistance',
    label: 'Draw distance',
    hint: 'Quanti segmenti di strada disegnare in profondità',
    unit: 'seg',
    min: 100,
    max: 500,
    step: 10,
  },
  {
    group: 'Camera',
    key: 'fogDensity',
    label: 'Fog density',
    hint: 'Intensità della foschia/sfumatura all’orizzonte',
    min: 0,
    max: 20,
    step: 0.5,
  },
  {
    group: 'Camera',
    key: 'roadWidth',
    label: 'Road half-width',
    hint: 'Semilarghezza della carreggiata (1000 stretto, 3000 autostrada)',
    min: 1200,
    max: 3200,
    step: 50,
  },

  {
    group: 'Speed',
    key: 'maxSpeed',
    label: 'Max speed (world)',
    hint: 'Velocità fisica reale lungo i segmenti della pista',
    min: 6000,
    max: 20000,
    step: 100,
  },
  {
    group: 'Speed',
    key: 'maxSpeedKmh',
    label: 'Max km/h (HUD)',
    hint: 'Numero mostrato sul tachimetro alla velocità massima',
    unit: 'km/h',
    min: 150,
    max: 400,
    step: 5,
  },
  {
    group: 'Speed',
    key: 'accelRate',
    label: 'Acceleration',
    hint: 'Spinta del motore (frazione di vel. max guadagnata al secondo)',
    unit: '/s',
    min: 0.05,
    max: 1,
    step: 0.01,
  },
  {
    group: 'Speed',
    key: 'accelTaper',
    label: 'Accel taper',
    hint: 'Calo di spinta alle alte velocità (0 = lineare, 0.8 = marce alte lunghe)',
    min: 0,
    max: 0.95,
    step: 0.01,
  },
  {
    group: 'Speed',
    key: 'brakeRate',
    label: 'Brake',
    hint: 'Potenza della frenata (1.0 = ferma da top speed in 1s)',
    unit: '/s',
    min: 0.2,
    max: 3,
    step: 0.05,
  },
  {
    group: 'Speed',
    key: 'coastRate',
    label: 'Coast decel',
    hint: 'Freno motore quando rilasci l’acceleratore senza frenare',
    unit: '/s',
    min: 0,
    max: 1,
    step: 0.01,
  },
  {
    group: 'Speed',
    key: 'offRoadDecelRate',
    label: 'Off-road decel',
    hint: 'Quanto rapidamente l’erba fuori strada ti frena',
    unit: '/s',
    min: 0,
    max: 2,
    step: 0.05,
  },
  {
    group: 'Speed',
    key: 'offRoadMaxSpeedRatio',
    label: 'Off-road max',
    hint: 'Velocità massima raggiungibile sull’erba (0.3 = 30% del top speed)',
    min: 0.1,
    max: 1,
    step: 0.01,
  },

  {
    group: 'Steering',
    key: 'steerRate',
    label: 'Steer rate',
    hint: 'Velocità di spostamento laterale quando sterzi (1 = metà carreggiata/s)',
    unit: '/s',
    min: 0.5,
    max: 5,
    step: 0.05,
  },
  {
    group: 'Steering',
    key: 'steerResponse',
    label: 'Steer response',
    hint: 'Reattività del volante (basso = morbido/pesante, alto = istantaneo)',
    min: 1,
    max: 30,
    step: 0.5,
  },
  {
    group: 'Steering',
    key: 'centrifugal',
    label: 'Centrifugal pull',
    hint: 'Forza che ti butta fuori strada in curva: più è alta più devi sterzare/frenare',
    min: 0,
    max: 1.2,
    step: 0.01,
  },
  {
    group: 'Steering',
    key: 'playerXLimit',
    label: 'Lateral limit',
    hint: 'Distanza massima oltre il bordo strada (±1 è il cordolo)',
    min: 1.2,
    max: 4,
    step: 0.05,
  },

  {
    group: 'Drift',
    key: 'driftMinSpeedRatio',
    label: 'Min speed',
    hint: 'Velocità minima richiesta per innescare il drift (0.45 = 45%)',
    min: 0,
    max: 0.9,
    step: 0.01,
  },
  {
    group: 'Drift',
    key: 'driftInwardSteer',
    label: 'Inward pull',
    hint: 'Quanto il drift tira l’auto verso l’interno della curva scelta',
    min: 0,
    max: 1.5,
    step: 0.05,
  },
  {
    group: 'Drift',
    key: 'driftCounterSteer',
    label: 'Steer control',
    hint: 'Quanto puoi correggere la traiettoria col volante durante il drift',
    min: 0,
    max: 1.5,
    step: 0.05,
  },
  {
    group: 'Drift',
    key: 'driftCentrifugalReduce',
    label: 'Grip vs curve',
    hint: 'Frazione di forza centrifuga annullata mentre sei in drift',
    min: 0,
    max: 1,
    step: 0.01,
  },
  {
    group: 'Drift',
    key: 'driftDecelRate',
    label: 'Speed bleed',
    hint: 'Attrito laterale: quanta velocità perdi al secondo mentre derapi',
    unit: '/s',
    min: 0,
    max: 0.5,
    step: 0.01,
  },

  {
    group: 'Audio',
    key: 'audioFilterMinHz',
    label: 'Filter min cutoff',
    hint: 'Frequenza passa-basso a bassa velocità o fuori strada (suono ovattato)',
    unit: 'Hz',
    min: 150,
    max: 2500,
    step: 20,
  },
  {
    group: 'Audio',
    key: 'audioFilterMaxHz',
    label: 'Filter max cutoff',
    hint: 'Frequenza passa-basso ad alta velocità e in drift (suono aperto)',
    unit: 'Hz',
    min: 4000,
    max: 20000,
    step: 250,
  },
  {
    group: 'Audio',
    key: 'audioFilterDriftQ',
    label: 'Drift filter Q',
    hint: 'Risonanza del filtro French House mentre sei in drift',
    min: 0.7,
    max: 8,
    step: 0.1,
  },
  {
    group: 'Audio',
    key: 'audioOffRoadPitchDip',
    label: 'Off-road pitch dip',
    hint: 'Rallentamento del vinile quando finisci fuori strada sull’erba',
    min: 0,
    max: 0.3,
    step: 0.01,
  },
  {
    group: 'Audio',
    key: 'bpmPulseStrength',
    label: 'BPM visual pulse',
    hint: 'Intensità della pulsazione a tempo di musica su sole, montagne e cordoli',
    min: 0,
    max: 2,
    step: 0.05,
  },
];
