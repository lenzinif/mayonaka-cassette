import { resetTuning, tuning } from '@src/config/tuning';
import { beforeEach, describe, expect, it } from 'vitest';
import { MelonSoda } from './MelonSoda';

describe('MelonSoda & Tofu Mode (M5)', () => {
  beforeEach(() => {
    resetTuning();
  });

  it('remains completely dormant and never spills when Tofu Mode is off', () => {
    const soda = new MelonSoda();
    expect(soda.active).toBe(false);

    let spills = 0;
    for (let i = 0; i < 60; i++) {
      soda.update(
        1 / 60,
        {
          lateralAccel: i % 2 === 0 ? 5 : -5,
          longitudinalAccel: 3,
          verticalAccel: 2,
          isOffRoad: true,
          speedRatio: 1,
        },
        () => spills++,
      );
    }

    expect(soda.theta).toBe(0);
    expect(spills).toBe(0);
    expect(soda.spillCount).toBe(0);
  });

  it('transitions through CALM -> SLOSHING without spilling under gentle smooth cornering', () => {
    const soda = new MelonSoda();
    soda.toggle();
    expect(soda.active).toBe(true);

    let spills = 0;
    for (let i = 0; i < 120; i++) {
      soda.update(
        1 / 120,
        {
          lateralAccel: 0.45,
          longitudinalAccel: 0.1,
          verticalAccel: 0,
          isOffRoad: false,
          speedRatio: 0.8,
        },
        () => spills++,
      );
    }

    expect(spills).toBe(0);
    expect(soda.effectivePeakAngle).toBeLessThan(tuning.sodaSpillThreshold);
  });

  it('reaches SPILLING state and spawns droplets under aggressive cornering + jerk in Tofu Mode', () => {
    const soda = new MelonSoda();
    soda.setActive(true);

    // Wait out brief activation grace timer (0.25s)
    for (let i = 0; i < 35; i++) {
      soda.update(1 / 120, {
        lateralAccel: 0,
        longitudinalAccel: 0,
        verticalAccel: 0,
        isOffRoad: false,
        speedRatio: 0.8,
      });
    }

    let spills = 0;
    soda.applyImpulse(6);
    for (let i = 0; i < 25; i++) {
      soda.update(
        1 / 120,
        {
          lateralAccel: 2.2,
          longitudinalAccel: -1.5,
          verticalAccel: 0.5,
          isOffRoad: false,
          speedRatio: 0.9,
        },
        () => spills++,
      );
    }

    expect(spills).toBeGreaterThanOrEqual(1);
    expect(soda.spillCount).toBeGreaterThanOrEqual(1);
    expect(soda.trayLevel).toBeGreaterThan(0);
    expect(soda.droplets.some((d) => d.active)).toBe(true);

    // Turning Tofu Mode off resets everything cleanly
    soda.toggle();
    expect(soda.active).toBe(false);
    expect(soda.theta).toBe(0);
    expect(soda.droplets.some((d) => d.active)).toBe(false);
  });

  it('gracefully handles high-speed corner exit and steering release without spilling (asymmetric unloading)', () => {
    const soda = new MelonSoda();
    soda.setActive(true);

    // Warm-up grace period
    for (let i = 0; i < 35; i++) {
      soda.update(1 / 120, {
        lateralAccel: 0,
        longitudinalAccel: 0,
        verticalAccel: 0,
        isOffRoad: false,
        speedRatio: 0.9,
      });
    }

    let spills = 0;
    // Sustained high-speed cornering (say holding A in a medium-sharp curve)
    for (let i = 0; i < 120; i++) {
      soda.update(
        1 / 120,
        {
          lateralAccel: -0.65,
          longitudinalAccel: 0.1,
          verticalAccel: 0,
          isOffRoad: false,
          speedRatio: 0.95,
        },
        () => spills++,
      );
    }
    expect(spills).toBe(0);
    expect(soda.effectivePeakAngle).toBeLessThan(tuning.sodaSpillThreshold);

    // Release steering to center (unloading back to 0)
    for (let i = 0; i < 60; i++) {
      // Lateral accel decays from -0.65 back to 0
      const decel = -0.65 * Math.exp(-9 * (i / 120));
      soda.update(
        1 / 120,
        {
          lateralAccel: decel,
          longitudinalAccel: 0.05,
          verticalAccel: 0,
          isOffRoad: false,
          speedRatio: 0.95,
        },
        () => spills++,
      );
    }

    expect(spills).toBe(0);
    expect(soda.effectivePeakAngle).toBeLessThan(tuning.sodaSpillThreshold);
  });
});
