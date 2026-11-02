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

  it('computes per-gear top speeds and soft-limits torque at redline', () => {
    const gb = new Gearbox();
    const maxSpeed = tuning.maxSpeed;

    expect(gb.getGearTopSpeed(maxSpeed, 1)).toBeCloseTo(maxSpeed * 0.35);
    expect(gb.getGearTopSpeed(maxSpeed, 4)).toBeCloseTo(maxSpeed * 1.0);

    // At 70% of 1st gear top speed, torque is near its peak (> 1.0)
    const sweetSpotSpeed = maxSpeed * 0.35 * 0.7;
    expect(gb.getTorqueFactor(sweetSpotSpeed, maxSpeed)).toBeGreaterThan(1.0);

    // At 100% of 1st gear top speed (redline), torque drops to 0 (soft limiter)
    const redlineSpeed = maxSpeed * 0.35;
    expect(gb.getTorqueFactor(redlineSpeed, maxSpeed)).toBe(0);
  });

  it('awards beat bonus on upshift at >= 0.72 RPM and prevents spamming on the same beat', () => {
    const gb = new Gearbox();
    const maxSpeed = tuning.maxSpeed;
    const shiftSpeed = maxSpeed * 0.35 * 0.82; // 82% RPM in 1st gear

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
    const earlyShift = gb.shift('up', maxSpeed * 0.35 * 0.3, maxSpeed, {
      ...PERFECT_BEAT,
      beatIndex: 20,
    });
    expect(earlyShift?.toGear).toBe(2);
    expect(earlyShift?.validForBonus).toBe(false);
    expect(earlyShift?.rewardTier).toBe('OFF');

    // Off-beat upshift at optimal RPM: changes gear, no bonus
    const offBeatShift = gb.shift('up', maxSpeed * 0.6 * 0.85, maxSpeed, OFF_BEAT);
    expect(offBeatShift?.toGear).toBe(3);
    expect(offBeatShift?.rewardTier).toBe('OFF');
  });

  it('auto-shifts at optimal RPM when autoShift assist is enabled and prevents stalling in manual mode', () => {
    const gb = new Gearbox();
    const maxSpeed = tuning.maxSpeed;
    gb.autoShift = true;

    gb.update(maxSpeed * 0.35 * 0.92, maxSpeed);
    expect(gb.gear).toBe(2);

    // Switch back to manual and slow to a near-stop: automatically drops to 1st gear
    gb.autoShift = false;
    gb.gear = 4;
    gb.update(maxSpeed * 0.05, maxSpeed);
    expect(gb.gear).toBe(1);
  });
});
