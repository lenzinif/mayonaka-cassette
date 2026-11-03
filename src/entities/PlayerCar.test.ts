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

  it('scales 6th-gear aerodynamic ceiling with Groove tier and unlocks Overdrive on SSS Groove + downhill plunges', () => {
    const lowGrooveCar = new PlayerCar();
    lowGrooveCar.gearbox.gear = 6;
    lowGrooveCar.groove = 10;
    lowGrooveCar.grooveTier = 'LOW';

    const overdriveCar = new PlayerCar();
    overdriveCar.gearbox.gear = 6;
    overdriveCar.groove = 95;
    overdriveCar.grooveTier = 'SSS';

    const lowTop = lowGrooveCar.getEffectiveTopSpeed(tuning.maxSpeed, 0);
    const sssFlatTop = overdriveCar.getEffectiveTopSpeed(tuning.maxSpeed, 0);
    const sssDownhillTop = overdriveCar.getEffectiveTopSpeed(tuning.maxSpeed, -0.35);

    expect(lowTop).toBeLessThan(tuning.maxSpeed * 0.95);
    expect(sssFlatTop).toBeGreaterThan(tuning.maxSpeed * 1.02);
    expect(sssDownhillTop).toBeGreaterThan(sssFlatTop);
  });

  it('applies hysteresis across Groove tiers (LOW -> MEDIUM -> HIGH -> SSS)', () => {
    expect(evaluateGrooveTier(24, 'LOW')).toBe('LOW');
    expect(evaluateGrooveTier(25, 'LOW')).toBe('MEDIUM');

    // Dropping from 25 to 21 stays in MEDIUM due to hysteresis (demotes below 19)
    expect(evaluateGrooveTier(21, 'MEDIUM')).toBe('MEDIUM');
    expect(evaluateGrooveTier(18, 'MEDIUM')).toBe('LOW');

    // SSS promotion at 85, demotion below 79
    expect(evaluateGrooveTier(86, 'HIGH')).toBe('SSS');
    expect(evaluateGrooveTier(81, 'SSS')).toBe('SSS');
    expect(evaluateGrooveTier(78, 'SSS')).toBe('HIGH');
  });
});
