import { APP_VERSION } from '@src/config/constants';
import type { PreloadProgress } from '@src/core/AssetPreloader';
import { useCallback, useEffect, useState } from 'react';

export interface LoadingScreenProps {
  progress: PreloadProgress;
  ready: boolean;
  onStart: () => void;
}

/**
 * 1980s Future Funk Arcade loading and splash screen (AGENTS.md §5 M8).
 * Satisfies Web Audio Autoplay Policy (Invariant 5) by unlocking audio on user's first input.
 */
export function LoadingScreen({ progress, ready, onStart }: LoadingScreenProps) {
  const [started, setStarted] = useState(false);

  const handleStart = useCallback(() => {
    if (!ready || started) return;
    setStarted(true);
    onStart();
  }, [ready, started, onStart]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (ready && !started) {
        e.preventDefault();
        handleStart();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [ready, started, handleStart]);

  if (started) return null;

  return (
    <div
      onClick={handleStart}
      className="pointer-events-auto absolute inset-0 z-50 flex flex-col items-center justify-between overflow-hidden bg-[#070114]/96 p-6 font-mono text-white select-none backdrop-blur-md transition-opacity duration-500"
    >
      {/* Background synthwave grid decoration */}
      <div className="pointer-events-none absolute inset-0 opacity-15 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-fuchsia-600 via-transparent to-transparent" />

      {/* Top Header Arcade Strip */}
      <div className="flex w-full max-w-xl items-center justify-center border-b border-fuchsia-500/40 pb-2 text-[11px] tracking-[0.25em] text-pink-400 uppercase">
        <span>{APP_VERSION}</span>
      </div>

      {/* Center Hero: Retro Neon Title & Visuals */}
      <div className="relative my-auto flex flex-col items-center text-center">
        <div className="text-4xl font-black tracking-widest text-transparent italic sm:text-6xl bg-clip-text bg-linear-to-r from-pink-500 via-fuchsia-400 to-cyan-300 drop-shadow-[0_0_25px_rgba(255,42,109,0.7)]">
          真夜中CASSETTE
        </div>
        <div className="mt-1 text-base font-bold tracking-[0.45em] text-cyan-200 uppercase sm:text-xl drop-shadow-[0_0_15px_rgba(5,217,232,0.6)]">
          MAYONAKA CASSETTE
        </div>

        {/* Loading Progress / Start Prompt */}
        <div className="mt-10 w-72 sm:w-88">
          {!ready ? (
            <div className="space-y-2">
              <div className="flex justify-between text-[11px] text-fuchsia-200">
                <span className="tracking-widest uppercase">PRELOADING ASSETS</span>
                <span className="font-bold tabular-nums text-cyan-300">{progress.percent}%</span>
              </div>
              <div className="relative h-3 w-full overflow-hidden rounded border border-cyan-400/50 bg-[#140624]">
                <div
                  className="h-full bg-linear-to-r from-pink-500 via-fuchsia-500 to-cyan-400 transition-all duration-150"
                  style={{ width: `${progress.percent}%` }}
                />
              </div>
              <div className="truncate text-left text-[9px] text-fuchsia-300/60 uppercase">
                {progress.currentAssetId ? `FETCHING: ${progress.currentAssetId}` : 'INITIALIZING...'}
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <button
                type="button"
                onClick={handleStart}
                className="group relative w-full cursor-pointer rounded border-2 border-pink-400 bg-linear-to-r from-pink-600/90 via-fuchsia-600/90 to-cyan-600/90 py-3 text-sm font-black tracking-[0.25em] text-white uppercase shadow-[0_0_25px_rgba(255,42,109,0.6)] transition hover:scale-102 hover:shadow-[0_0_35px_rgba(5,217,232,0.8)] active:scale-98 animate-pulse"
              >
                INSERT COIN // START GAME
              </button>
              <div className="text-[10px] tracking-widest text-cyan-300/90 uppercase">
                [ PRESS ANY KEY OR CLICK TO DRIVE ]
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Bottom Footer Info */}
      <div className="w-full max-w-xl border-t border-fuchsia-500/30 pt-2 text-center text-[10px] tracking-wider text-fuchsia-300/60">
        Vibecoded while listening to future funk
      </div>
    </div>
  );
}
