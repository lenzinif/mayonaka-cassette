import { resetTuning, tuning } from '@src/config/tuning';
import { beforeEach, describe, expect, it } from 'vitest';
import { evaluateGrooveTier, PlayerCar, type CarEvent, type DriveControls } from './PlayerCar';

const IDLE: DriveControls = {
  left: false,
  right: false,
  accelerate: false,
  brake: false,
  drift: false,
};

describe('PlayerCar', () => {
  beforeEach(() => {
    resetTuning();
  });

  it('accelerates through all 6 gears up to maxSpeed and brakes back down', () => {
    const car = new PlayerCar();
    car.gearbox.autoShift = true;
    for (let i = 0; i < 600; i++) {
      car.update(1 / 60, { ...IDLE, accelerate: true }, 0);
    }
    expect(car.gear).toBe(6);
    expect(car.speed).toBeGreaterThan(tuning.maxSpeed * 0.9);

    for (let i = 0; i < 120; i++) {
      car.update(1 / 60, { ...IDLE, brake: true }, 0);
    }
    expect(car.speed).toBe(0);
  });

  it('bleeds RPM in 6th gear on steep uphill climbs and sustained drifts, rewarding downshifts', () => {
    const car = new PlayerCar();
    car.gearbox.gear = 6;
    car.speed = tuning.maxSpeed * 0.98;

    // 1. Steep uphill climb (`segmentSlope = 0.45`) in 6th gear sags speed below redline
    for (let i = 0; i < 90; i++) {
      car.update(1 / 60, { ...IDLE, accelerate: true }, 0, 0.45);
    }
    expect(car.speedRatio).toBeLessThan(0.92);

    // 2. Sustained on-road drift in 6th gear bleeds speed into 5th-gear downshift range (< 0.86)
    car.speed = tuning.maxSpeed * 0.96;
    for (let i = 0; i < 120; i++) {
      car.x = 0; // keep car on asphalt (simulating balanced counter-steer around a sweeper)
      car.update(1 / 60, { ...IDLE, accelerate: true, right: true, drift: true }, 3.5, 0);
    }
    expect(car.isDrifting).toBe(true);
    expect(car.speedRatio).toBeLessThan(0.86);
  });

  it('caps speed at current gear top speed in manual mode until shifted up', () => {
    const car = new PlayerCar();
    for (let i = 0; i < 240; i++) {
      car.update(1 / 60, { ...IDLE, accelerate: true }, 0);
    }
    expect(car.gear).toBe(1);
    expect(car.speed).toBeCloseTo(tuning.maxSpeed * tuning.gear1MaxRatio, 0);

    // Perform a PERFECT beat-shift into 2nd gear: rewards Groove, no speed boost
    const speedBeforeShift = car.speed;
    const grooveBefore = car.groove;
    car.shiftGear('up', {
      tier: 'PERFECT',
      deltaMs: 5,
      beatIndex: 4,
      isDownbeat: true,
    });
    expect(car.gear).toBe(2);
    expect(car.speed).toBe(speedBeforeShift);
    expect(car.groove).toBeGreaterThan(grooveBefore);
  });

  it('throws the car off-road on curves if the player does not counter-steer', () => {
    const car = new PlayerCar();
    car.gearbox.gear = 4;
    car.speed = tuning.maxSpeed;
    // Medium right-hand curve (curve = 4) for 1 second without steering
    for (let i = 0; i < 60; i++) {
      car.update(1 / 60, { ...IDLE, accelerate: true }, 4);
    }
    expect(car.x).toBeLessThan(-1);
    expect(car.isOffRoad).toBe(true);
  });

  it('bleeds speed when off-road even with throttle held, without stopping the car', () => {
    const car = new PlayerCar();
    car.x = 1.6; // off-road
    car.gearbox.gear = 4;
    car.speed = tuning.maxSpeed;
    for (let i = 0; i < 180; i++) {
      car.update(1 / 60, { ...IDLE, accelerate: true }, 0);
    }
    expect(car.speed).toBeGreaterThan(0);
    expect(car.speed).toBeLessThanOrEqual(tuning.maxSpeed * tuning.offRoadMaxSpeedRatio + 1);
  });

  it('enters and exits drift when holding drift + steer above min speed', () => {
    const car = new PlayerCar();
    car.gearbox.gear = 4;
    car.speed = tuning.maxSpeed * 0.85;
    const events: CarEvent[] = [];

    for (let i = 0; i < 60; i++) {
      car.update(0.01, { ...IDLE, accelerate: true, right: true, drift: true }, 4, 0, (e) =>
        events.push(e),
      );
    }
    expect(car.isDrifting).toBe(true);

    // Release drift
    car.update(0.01, { ...IDLE, accelerate: true }, 4, 0, (e) => events.push(e));
    expect(car.isDrifting).toBe(false);
    expect(events).toContainEqual({ type: 'driftStart', direction: 1 });
    expect(events).toContainEqual(expect.objectContaining({ type: 'driftEnd' }));
  });

  it('paces 1st-to-6th progression across musical bars (still in mid-gears at 4.5s, reaching 6th around 7-9s)', () => {
    const car = new PlayerCar();
    car.gearbox.autoShift = true;

    // After 4.5 seconds (270 steps at 60 Hz), the car should still be climbing through 4th/5th gear, not pinned in 6th
    for (let i = 0; i < 270; i++) {
      car.update(1 / 60, { ...IDLE, accelerate: true }, 0);
    }
    expect(car.gear).toBeLessThan(6);
    expect(car.speedRatio).toBeLessThan(0.8);

    // Continuing up to 10 seconds reaches 6th gear and >90% speed
    for (let i = 0; i < 330; i++) {
      car.update(1 / 60, { ...IDLE, accelerate: true }, 0);
    }
    expect(car.gear).toBe(6);
    expect(car.speedRatio).toBeGreaterThan(0.9);
  });

  it('heavily rewards downshifting from 6th gear after a speed drop (climb, drift exit, or collision)', () => {
    // Two identical cars at 56% speed (e.g. after a tight hairpin drift or collision)
    const luggingCar = new PlayerCar();
    luggingCar.gearbox.gear = 6;
    luggingCar.speed = tuning.maxSpeed * 0.56;

    const downshiftedCar = new PlayerCar();
    downshiftedCar.gearbox.gear = 6;
    downshiftedCar.speed = tuning.maxSpeed * 0.56;
    // Perform two beat-matched downshifts into 4th gear (powerband sweet spot)
    downshiftedCar.shiftGear('down', {
      tier: 'PERFECT',
      deltaMs: 4,
      beatIndex: 8,
      isDownbeat: true,
    });
    downshiftedCar.shiftGear('down', {
      tier: 'PERFECT',
      deltaMs: 4,
      beatIndex: 9,
      isDownbeat: false,
    });
    expect(downshiftedCar.gear).toBe(4);
    expect(luggingCar.isLugging).toBe(true);
    expect(downshiftedCar.isLugging).toBe(false);

    // Accelerate both cars for 2 seconds on a moderate climb (slope = 0.18)
    for (let i = 0; i < 120; i++) {
      luggingCar.update(1 / 60, { ...IDLE, accelerate: true }, 0, 0.18);
      downshiftedCar.update(1 / 60, { ...IDLE, accelerate: true }, 0, 0.18);
    }

    // The car that downshifted into 4th pulls away dramatically while 6th gear bogs down
    expect(downshiftedCar.speed).toBeGreaterThan(luggingCar.speed + tuning.maxSpeed * 0.12);
    expect(downshiftedCar.groove).toBeGreaterThan(luggingCar.groove);
  });

  it('scales 6th-gear aerodynamic ceiling with Groove tier and unlocks Overdrive on OVERDRIVE Groove + downhill plunges', () => {
    const lowGrooveCar = new PlayerCar();
    lowGrooveCar.gearbox.gear = 6;
    lowGrooveCar.groove = 10;
    lowGrooveCar.grooveTier = 'LOW';

    const overdriveCar = new PlayerCar();
    overdriveCar.gearbox.gear = 6;
    overdriveCar.groove = 95;
    overdriveCar.grooveTier = 'OVERDRIVE';

    const lowTop = lowGrooveCar.getEffectiveTopSpeed(tuning.maxSpeed, 0);
    const overdriveFlatTop = overdriveCar.getEffectiveTopSpeed(tuning.maxSpeed, 0);
    const overdriveDownhillTop = overdriveCar.getEffectiveTopSpeed(tuning.maxSpeed, -0.35);

    expect(lowTop).toBeLessThan(tuning.maxSpeed * 0.95);
    expect(overdriveFlatTop).toBeGreaterThan(tuning.maxSpeed * 1.02);
    expect(overdriveDownhillTop).toBeGreaterThan(overdriveFlatTop);
  });

  it('applies hysteresis across Groove tiers (LOW -> MEDIUM -> HIGH -> OVERDRIVE)', () => {
    expect(evaluateGrooveTier(24, 'LOW')).toBe('LOW');
    expect(evaluateGrooveTier(25, 'LOW')).toBe('MEDIUM');

    // Dropping from 25 to 21 stays in MEDIUM due to hysteresis (demotes below 19)
    expect(evaluateGrooveTier(21, 'MEDIUM')).toBe('MEDIUM');
    expect(evaluateGrooveTier(18, 'MEDIUM')).toBe('LOW');

    // OVERDRIVE promotion at 85, demotion below 79
    expect(evaluateGrooveTier(86, 'HIGH')).toBe('OVERDRIVE');
    expect(evaluateGrooveTier(81, 'OVERDRIVE')).toBe('OVERDRIVE');
    expect(evaluateGrooveTier(78, 'OVERDRIVE')).toBe('HIGH');
  });

  it('decays Groove in OVERDRIVE and HIGH tiers when idle, but preserves MEDIUM and LOW tiers', () => {
    // OVERDRIVE decay
    const overdriveCar = new PlayerCar();
    overdriveCar.groove = 90;
    overdriveCar.grooveTier = 'OVERDRIVE';
    overdriveCar.update(1.0, IDLE, 0, 0);
    expect(overdriveCar.groove).toBeCloseTo(90 - tuning.grooveOverdriveDrainRate, 1);

    // HIGH decay
    const highCar = new PlayerCar();
    highCar.groove = 65;
    highCar.grooveTier = 'HIGH';
    highCar.update(1.0, IDLE, 0, 0);
    expect(highCar.groove).toBeCloseTo(65 - tuning.grooveHighDrainRate, 1);

    // MEDIUM no decay
    const medCar = new PlayerCar();
    medCar.groove = 40;
    medCar.grooveTier = 'MEDIUM';
    medCar.update(1.0, IDLE, 0, 0);
    expect(medCar.groove).toBe(40);

    // LOW no decay
    const lowCar = new PlayerCar();
    lowCar.groove = 15;
    lowCar.grooveTier = 'LOW';
    lowCar.update(1.0, IDLE, 0, 0);
    expect(lowCar.groove).toBe(15);
  });

  it('allows drifting to overpower OVERDRIVE decay and rebuild Groove', () => {
    const car = new PlayerCar();
    car.gearbox.gear = 5;
    car.speed = tuning.maxSpeed * 0.8;
    car.groove = 88;
    car.grooveTier = 'OVERDRIVE';

    // Hold drift + right steer around curve for 1 second (60 steps)
    for (let i = 0; i < 60; i++) {
      car.x = 0; // maintain on road
      car.update(1 / 60, { ...IDLE, accelerate: true, right: true, drift: true }, 3.0, 0);
    }

    expect(car.isDrifting).toBe(true);
    // Net gain should be positive, overcoming OVERDRIVE tier decay
    expect(car.groove).toBeGreaterThan(88);
    expect(car.groove).toBeCloseTo(88 + (tuning.grooveDriftGainRate - tuning.grooveOverdriveDrainRate), 0);
  });

  it('MP-01: sustains OVERDRIVE during clean 95-100% speed cruising in 6th gear, but drains rapidly below 65%', () => {
    const fastCar = new PlayerCar();
    fastCar.gearbox.gear = 6;
    fastCar.speed = tuning.maxSpeed * 0.96;
    fastCar.groove = 95;
    fastCar.grooveTier = 'OVERDRIVE';

    for (let i = 0; i < 20 * 60; i++) {
      fastCar.update(1 / 60, { ...IDLE, accelerate: true }, 0, 0);
    }
    expect(fastCar.grooveTier).toBe('OVERDRIVE');
    expect(fastCar.groove).toBeGreaterThanOrEqual(85);

    const slowCar = new PlayerCar();
    slowCar.gearbox.gear = 6;
    slowCar.speed = tuning.maxSpeed * 0.55;
    slowCar.groove = 84;
    slowCar.grooveTier = 'OVERDRIVE';

    for (let i = 0; i < 4 * 60; i++) {
      slowCar.update(1 / 60, IDLE, 0, 0);
    }
    expect(slowCar.grooveTier).toBe('HIGH');
  });

  it('MP-02: prevents straight-road drift Groove farming and grants a clean exit speed boost after 0.6s+ curve drift', () => {
    // 1. Straight-road exploit check (curve = 0): drifting must not out-earn clean high-speed cruising
    const straightCruiser = new PlayerCar();
    straightCruiser.gearbox.gear = 6;
    straightCruiser.speed = tuning.maxSpeed * 0.95;
    straightCruiser.groove = 20;

    const straightDrifter = new PlayerCar();
    straightDrifter.gearbox.gear = 3;
    straightDrifter.speed = tuning.maxSpeed * 0.49;
    straightDrifter.groove = 20;

    for (let i = 0; i < 5 * 60; i++) {
      straightCruiser.update(1 / 60, { ...IDLE, accelerate: true }, 0, 0);
      straightDrifter.x = 0;
      straightDrifter.update(1 / 60, { ...IDLE, accelerate: true, right: true, drift: true }, 0, 0);
    }
    expect(straightDrifter.groove).toBeLessThanOrEqual(straightCruiser.groove);

    // 2. Clean drift exit boost after >= 0.6s on a real curve (|curve| = 2.0)
    const car = new PlayerCar();
    car.gearbox.gear = 5;
    car.speed = tuning.maxSpeed * 0.85;
    for (let i = 0; i < 45; i++) {
      // 0.75s drift on curve = 2.0
      car.x = 0;
      car.update(1 / 60, { ...IDLE, accelerate: true, right: true, drift: true }, 2.0, 0);
    }
    expect(car.isDrifting).toBe(true);
    expect(car.driftCurveTime).toBeGreaterThanOrEqual(0.6);

    const speedBeforeExit = car.speed;
    // Release drift and straighten on asphalt
    for (let i = 0; i < 20; i++) {
      car.update(1 / 60, { ...IDLE, accelerate: true }, 0, 0);
    }
    expect(car.isDrifting).toBe(false);
    expect(car.speed).toBeGreaterThan(speedBeforeExit);
  });

  it('MP-03: exits brake-drift promptly when releasing all keys even inside a >1.2 curve and softens S+Steer tap decel', () => {
    const car = new PlayerCar();
    car.gearbox.gear = 5;
    car.speed = 9500;

    // 1. S + D tap should not trigger full -100 straight-brake hit in a single 1/120s tick
    car.update(1 / 120, { ...IDLE, brake: true, right: true }, 1.5, 0);
    expect(car.isDrifting).toBe(true);
    expect(car.speed).toBeGreaterThan(9440);

    // 2. Release ALL keys inside a curve = 1.5 -> must exit drift within <= 0.15s
    for (let i = 0; i < 18; i++) {
      // 18 / 120 = 0.15s
      car.update(1 / 120, IDLE, 1.5, 0);
    }
    expect(car.isDrifting).toBe(false);
  });
});
