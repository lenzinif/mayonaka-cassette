import { FixedStepper } from './FixedStepper';

export interface GameLoopOptions {
  step: number;
  maxFrameDt: number;
  update: (dt: number) => void;
  render: (alpha: number, fps: number) => void;
}

/**
 * requestAnimationFrame driver around a FixedStepper.
 * The rAF callback is created once, so the loop itself allocates nothing per frame.
 */
export class GameLoop {
  private readonly stepper: FixedStepper;
  private rafId = 0;
  private lastTime = -1;
  private running = false;

  private fpsFrames = 0;
  private fpsTimer = 0;
  private fps = 0;

  constructor(private readonly options: GameLoopOptions) {
    this.stepper = new FixedStepper(options.step, options.maxFrameDt);
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.lastTime = -1;
    this.stepper.reset();
    this.rafId = requestAnimationFrame(this.tick);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.rafId);
  }

  /**
   * Resets delta-time and fixed stepper accumulation on unpause or window refocus
   * so modal pauses or heavy file operations don't cause delta-time catch-up spirals or poison the FPS counter.
   */
  reset(): void {
    this.lastTime = -1;
    this.stepper.reset();
    this.fpsFrames = 0;
    this.fpsTimer = 0;
  }

  private readonly tick = (now: number): void => {
    if (!this.running) return;
    const rawDt = this.lastTime < 0 ? 0 : (now - this.lastTime) / 1000;
    this.lastTime = now;
    const frameDt = Math.min(rawDt, this.options.maxFrameDt);

    this.fpsFrames++;
    this.fpsTimer += frameDt;
    if (this.fpsTimer >= 0.5) {
      this.fps = Math.round(this.fpsFrames / this.fpsTimer);
      this.fpsFrames = 0;
      this.fpsTimer = 0;
    }

    const alpha = this.stepper.advance(frameDt, this.options.update);
    this.options.render(alpha, this.fps);
    this.rafId = requestAnimationFrame(this.tick);
  };
}
