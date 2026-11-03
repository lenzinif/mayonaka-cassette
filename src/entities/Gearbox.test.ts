import type { BeatJudgement } from '@src/audio/BeatClock';
import { resetTuning, tuning } from '@src/config/tuning';
import { beforeEach, describe, expect, it } from 'vitest';
import { Gearbox } from './Gearbox';

const PERFECT_BEAT: BeatJudgement = {
  tier: 'PERFECT',
  deltaMs: 8,
  beatIndex: 12,
  isDownbeat: true,
};

const OFF_BEAT: BeatJudgement = {
  tier: 'OFF',
  deltaMs: 180,
  beatIndex: 13,
  isDownbeat: false,
};

describe('Gearbox (M5 Beat-Shift)', () => {
  beforeEach(() => {
    resetTuning();
  });

  it('computes per-gear top speeds across 6 gears and soft-limits torque at redline', () => {
    const gb = new Gearbox();
    const maxSpeed = tuning.maxSpeed;

    expect(gb.getGearTopSpeed(maxSpeed, 1)).toBeCloseTo(maxSpeed * tuning.gear1MaxRatio);
    expect(gb.getGearTopSpeed(maxSpeed, 4)).toBeCloseTo(maxSpeed * tuning.gear4MaxRatio);
    expect(gb.getGearTopSpeed(maxSpeed, 6)).toBeCloseTo(maxSpeed * tuning.gear6MaxRatio);

    // At 74% of 1st gear top speed, torque is near its peak (> 1.0)
    const sweetSpotSpeed = maxSpeed * tuning.gear1MaxRatio * 0.74;
    expect(gb.getTorqueFactor(sweetSpotSpeed, maxSpeed)).toBeGreaterThan(1.0);

    // Higher gears apply progressive accelTaper and stronger low-RPM lugging
    gb.gear = 6;
    const lugSpeed6th = maxSpeed * 0.45;
    const lugTorque6th = gb.getTorqueFactor(lugSpeed6th, maxSpeed);
    gb.gear = 3;
    const powerbandTorque3rd = gb.getTorqueFactor(lugSpeed6th, maxSpeed);
    expect(powerbandTorque3rd).toBeGreaterThan(lugTorque6th * 1.5);

    // At 100% of current gear top speed (redline), torque drops to 0 (soft limiter)
    gb.gear = 1;
    const redlineSpeed = maxSpeed * tuning.gear1MaxRatio;
    expect(gb.getTorqueFactor(redlineSpeed, maxSpeed)).toBe(0);
  });

  it('awards beat bonus on upshift at >= 0.72 RPM and prevents spamming on the same beat', () => {
    const gb = new Gearbox();
    const maxSpeed = tuning.maxSpeed;
    const shiftSpeed = maxSpeed * tuning.gear1MaxRatio * 0.82; // 82% RPM in 1st gear

    const res = gb.shift('up', shiftSpeed, maxSpeed, PERFECT_BEAT);
    expect(res).not.toBeNull();
    expect(res?.toGear).toBe(2);
    expect(res?.validForBonus).toBe(true);
    expect(res?.rewardTier).toBe('PERFECT');

    // Shifting again on the exact same beatIndex (12) cannot farm another bonus
    const downRes = gb.shift('down', shiftSpeed, maxSpeed, PERFECT_BEAT);
    expect(downRes?.validForBonus).toBe(false);
    expect(downRes?.rewardTier).toBe('OFF');
  });

  it('shifts normally without penalty or bonus when off-beat or below optimal RPM (Pillar 3)', () => {
    const gb = new Gearbox();
    const maxSpeed = tuning.maxSpeed;

    // Early upshift at low RPM (30% of 1st gear): still changes gear, no bonus
    const earlyShift = gb.shift('up', maxSpeed * tuning.gear1MaxRatio * 0.3, maxSpeed, {
      ...PERFECT_BEAT,
      beatIndex: 20,
    });
    expect(earlyShift?.toGear).toBe(2);
    expect(earlyShift?.validForBonus).toBe(false);
    expect(earlyShift?.rewardTier).toBe('OFF');

    // Off-beat upshift at optimal RPM: changes gear, no bonus
    const offBeatShift = gb.shift('up', maxSpeed * tuning.gear2MaxRatio * 0.85, maxSpeed, OFF_BEAT);
    expect(offBeatShift?.toGear).toBe(3);
    expect(offBeatShift?.rewardTier).toBe('OFF');
  });

  it('auto-shifts at optimal RPM when autoShift assist is enabled and prevents stalling in manual mode', () => {
    const gb = new Gearbox();
    const maxSpeed = tuning.maxSpeed;
    gb.autoShift = true;

    gb.update(maxSpeed * tuning.gear1MaxRatio * 0.92, maxSpeed);
    expect(gb.gear).toBe(2);

    // Switch back to manual and slow to a near-stop: automatically drops to 1st gear
    gb.autoShift = false;
    gb.gear = 6;
    gb.update(maxSpeed * 0.05, maxSpeed);
    expect(gb.gear).toBe(1);
  });
});
