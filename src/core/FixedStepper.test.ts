import { describe, expect, it } from 'vitest';
import { FixedStepper } from './FixedStepper';

describe('FixedStepper', () => {
  it('runs exact number of fixed steps and returns residual alpha', () => {
    const stepper = new FixedStepper(0.01, 0.1);
    let steps = 0;
    const alpha = stepper.advance(0.035, (dt) => {
      expect(dt).toBe(0.01);
      steps++;
    });
    expect(steps).toBe(3);
    expect(alpha).toBeCloseTo(0.5, 5);
  });

  it('clamps large frame deltas to maxFrameDt to prevent spiral of death', () => {
    const stepper = new FixedStepper(0.01, 0.05);
    let steps = 0;
    const alpha = stepper.advance(2.5, () => {
      steps++;
    });
    expect(steps).toBe(5);
    expect(alpha).toBeCloseTo(0, 5);
  });

  it('accumulates sub-step deltas across frames', () => {
    const stepper = new FixedStepper(0.02, 0.1);
    let steps = 0;
    expect(stepper.advance(0.01, () => steps++)).toBeCloseTo(0.5, 5);
    expect(steps).toBe(0);
    expect(stepper.advance(0.015, () => steps++)).toBeCloseTo(0.25, 5);
    expect(steps).toBe(1);
  });
});
