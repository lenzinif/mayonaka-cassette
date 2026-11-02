import type { FunkAudioEngine } from '@src/audio/FunkAudioEngine';
import { MAX_FRAME_DT, RENDER_HEIGHT, RENDER_WIDTH, SIM_STEP } from '@src/config/constants';
import { GameLoop } from '@src/core/GameLoop';
import { InputManager } from '@src/core/InputManager';
import type { TelemetryBridge } from '@src/core/TelemetryBridge';
import { Game, type GameEvent, type TelemetrySnapshot } from '@src/engine/Game';
import { useEffect, useRef } from 'react';

export interface CanvasStageProps {
  bridge: TelemetryBridge<TelemetrySnapshot, GameEvent>;
  audio: FunkAudioEngine;
}

/**
 * Fullscreen 2D canvas stage (`z-index: 1`, AGENTS.md §2).
 * Owns the lifecycle of `InputManager`, `Game`, and `GameLoop`.
 */
export function CanvasStage({ bridge, audio }: CanvasStageProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;

    const input = new InputManager(window);
    const game = new Game({ input, bridge, audio });
    const loop = new GameLoop({
      step: SIM_STEP,
      maxFrameDt: MAX_FRAME_DT,
      update: game.update,
      render: (alpha, fps) => game.render(ctx, alpha, fps),
    });

    const unlockOnGesture = () => {
      void audio.unlock();
    };
    window.addEventListener('keydown', unlockOnGesture, { passive: true });
    window.addEventListener('pointerdown', unlockOnGesture, { passive: true });

    loop.start();
    return () => {
      loop.stop();
      input.dispose();
      window.removeEventListener('keydown', unlockOnGesture);
      window.removeEventListener('pointerdown', unlockOnGesture);
    };
  }, [bridge, audio]);

  return (
    <canvas
      ref={canvasRef}
      width={RENDER_WIDTH}
      height={RENDER_HEIGHT}
      className="relative z-1 block h-full w-full object-contain [image-rendering:pixelated]"
    />
  );
}
