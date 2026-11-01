import { resetTuning, tuning } from '@src/config/tuning';
import { beforeEach, describe, expect, it } from 'vitest';
import { PlayerCar, type CarEvent, type DriveControls } from './PlayerCar';

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

  it('accelerates smoothly up to maxSpeed and brakes back down', () => {
    const car = new PlayerCar();
    for (let i = 0; i < 600; i++) {
      car.update(1 / 60, { ...IDLE, accelerate: true }, 0);
    }
    expect(car.speed).toBeCloseTo(tuning.maxSpeed, 0);

    for (let i = 0; i < 120; i++) {
      car.update(1 / 60, { ...IDLE, brake: true }, 0);
    }
    expect(car.speed).toBe(0);
  });

  it('applies centrifugal force outward on curves at speed', () => {
    const car = new PlayerCar();
    car.speed = tuning.maxSpeed * 0.8;
    // Right-hand curve (positive curve) pushes the car toward the left shoulder (negative x)
    car.update(0.1, { ...IDLE, accelerate: true }, 4);
    expect(car.x).toBeLessThan(0);
  });

  it('bleeds speed when off-road without stopping the car (Design Pillar 3)', () => {
    const car = new PlayerCar();
    car.x = 1.6; // off-road
    car.speed = tuning.maxSpeed;
    for (let i = 0; i < 300; i++) {
      car.update(1 / 60, { ...IDLE, accelerate: true }, 0);
    }
    expect(car.speed).toBeGreaterThan(0);
    expect(car.speed).toBeLessThanOrEqual(tuning.maxSpeed * tuning.offRoadMaxSpeedRatio + 1);
  });

  it('triggers a clean drift exit boost when held on-road past driftCleanMinTime', () => {
    const car = new PlayerCar();
    car.speed = tuning.maxSpeed * 0.85;
    const events: CarEvent[] = [];

    // Hold drift + right steer for 0.9s on-road
    for (let i = 0; i < 90; i++) {
      car.x = 0; // keep well on-road for test determinism
      car.update(0.01, { ...IDLE, accelerate: true, right: true, drift: true }, 2, 0, (e) =>
        events.push(e),
      );
    }
    expect(car.isDrifting).toBe(true);

    const speedBeforeExit = car.speed;
    // Release drift
    car.update(0.01, { ...IDLE, accelerate: true }, 2, 0, (e) => events.push(e));
    expect(car.isDrifting).toBe(false);
    expect(car.speed).toBeGreaterThan(speedBeforeExit);
    expect(events).toEqual([
      { type: 'driftStart', direction: 1 },
      expect.objectContaining({ type: 'driftEnd', clean: true }),
    ]);
  });
});
