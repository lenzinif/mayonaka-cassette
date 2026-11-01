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

  it('throws the car off-road on curves if the player does not counter-steer', () => {
    const car = new PlayerCar();
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
    car.speed = tuning.maxSpeed;
    for (let i = 0; i < 180; i++) {
      car.update(1 / 60, { ...IDLE, accelerate: true }, 0);
    }
    expect(car.speed).toBeGreaterThan(0);
    expect(car.speed).toBeLessThanOrEqual(tuning.maxSpeed * tuning.offRoadMaxSpeedRatio + 1);
  });

  it('enters and exits drift when holding drift + steer above min speed', () => {
    const car = new PlayerCar();
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
    expect(events).toEqual([
      { type: 'driftStart', direction: 1 },
      expect.objectContaining({ type: 'driftEnd' }),
    ]);
  });
});
