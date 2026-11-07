import type { FunkAudioEngine } from '@src/audio/FunkAudioEngine';
import type { TrackLibrary } from '@src/audio/TrackLibrary';
import { MAX_FRAME_DT, RENDER_HEIGHT, RENDER_WIDTH, SIM_STEP } from '@src/config/constants';
import type { AssetPreloader } from '@src/core/AssetPreloader';
import { AutopilotDriver } from '@src/core/AutopilotDriver';
import { GameLoop } from '@src/core/GameLoop';
import { InputManager } from '@src/core/InputManager';
import type { TelemetryBridge } from '@src/core/TelemetryBridge';
import { Game, type GameEvent, type TelemetrySnapshot } from '@src/engine/Game';
import { useEffect, useRef } from 'react';

export interface CanvasStageProps {
  bridge: TelemetryBridge<TelemetrySnapshot, GameEvent>;
  audio: FunkAudioEngine;
  library: TrackLibrary;
  preloader?: AssetPreloader;
  onGameReady?: (game: Game) => void;
}

/**
 * Fullscreen 2D canvas stage (`z-index: 1`, AGENTS.md §2).
 * Owns the lifecycle of `InputManager`, `Game`, and `GameLoop`.
 */
export function CanvasStage({
  bridge,
  audio,
  library,
  preloader,
  onGameReady,
}: CanvasStageProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const onGameReadyRef = useRef(onGameReady);
  onGameReadyRef.current = onGameReady;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;

    const humanInput = new InputManager(window);
    const autopilot = new AutopilotDriver({ fallbackInput: humanInput });
    const game = new Game({ input: autopilot, autopilot, bridge, audio, library, preloader });
    onGameReadyRef.current?.(game);

    const loop = new GameLoop({
      step: SIM_STEP,
      maxFrameDt: MAX_FRAME_DT,
      update: game.update,
      render: (alpha, fps) => game.render(ctx, alpha, fps),
    });

    game.onTimingReset = () => {
      loop.reset();
    };

    const handleVisibilityChange = () => {
      if (document.hidden || document.visibilityState === 'hidden') {
        game.setPaused(true);
      } else {
        loop.reset();
      }
    };
    const handleCanvasClick = () => {
      if (game.paused) {
        game.setPaused(false);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    canvas.addEventListener('click', handleCanvasClick);

    loop.start();
    return () => {
      loop.stop();
      humanInput.dispose();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      canvas.removeEventListener('click', handleCanvasClick);
    };
  }, [bridge, audio, library, preloader]);

  return (
    <canvas
      ref={canvasRef}
      width={RENDER_WIDTH}
      height={RENDER_HEIGHT}
      className="relative z-1 block h-full w-full object-contain [image-rendering:pixelated]"
    />
  );
}
