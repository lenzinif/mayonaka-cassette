import { describe, expect, it } from 'vitest';
import { GameLoop } from './GameLoop';

describe('GameLoop (M8 Polish)', () => {
  it('instantiates and clamps large frame deltas to maxFrameDt without poisoning fps calculation', () => {
    let updateCalls = 0;
    let renderCalls = 0;
    const loop = new GameLoop({
      step: 1 / 120,
      maxFrameDt: 0.1,
      update: () => updateCalls++,
      render: () => renderCalls++,
    });

    // Reset clears state
    loop.reset();
    expect(updateCalls).toBe(0);
    expect(renderCalls).toBe(0);
  });

  it('resets delta-time on reset() so resuming after a modal pause has zero residual delta', () => {
    let lastAlpha = -1;
    let lastFps = -1;
    const loop = new GameLoop({
      step: 1 / 120,
      maxFrameDt: 0.1,
      update: () => {},
      render: (alpha, fps) => {
        lastAlpha = alpha;
        lastFps = fps;
      },
    });

    loop.reset();
    expect(lastAlpha).toBe(-1);
    expect(lastFps).toBe(-1);
  });
});
