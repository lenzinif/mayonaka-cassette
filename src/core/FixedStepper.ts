/**
 * Accumulator-based fixed timestep. Pure logic, no DOM: unit-testable.
 *
 * Simulation always advances in `step`-sized increments so the driving feel is identical
 * at 60 Hz and 144 Hz. The returned alpha (0..1) lets the renderer interpolate between steps.
 */
export class FixedStepper {
  private accumulator = 0;

  constructor(
    readonly step: number,
    private readonly maxFrameDt: number,
  ) {}

  /** Consumes real elapsed time, runs zero or more fixed updates, returns interpolation alpha. */
  advance(frameDt: number, update: (dt: number) => void): number {
    const dt = Math.min(Math.max(frameDt, 0), this.maxFrameDt);
    this.accumulator += dt;
    while (this.accumulator + 1e-9 >= this.step) {
      update(this.step);
      this.accumulator = Math.max(0, this.accumulator - this.step);
    }
    return this.accumulator / this.step;
  }

  reset(): void {
    this.accumulator = 0;
  }
}
