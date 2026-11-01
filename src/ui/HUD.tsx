import type { TelemetryBridge } from '@src/core/TelemetryBridge';
import type { GameEvent, TelemetrySnapshot } from '@src/engine/Game';
import { useEffect, useState, useSyncExternalStore } from 'react';

export interface HUDProps {
  bridge: TelemetryBridge<TelemetrySnapshot, GameEvent>;
  debugOpen: boolean;
  onToggleDebug: () => void;
}

interface ToastState {
  id: number;
  text: string;
}

function formatLapTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  const hundredths = Math.floor((seconds * 100) % 100);
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${String(hundredths).padStart(2, '0')}`;
}

/**
 * React HUD overlay (`z-index: 2`, `pointer-events-none`, AGENTS.md §2).
 * Re-renders at most `TELEMETRY_HZ` (15 Hz) via `useSyncExternalStore` + discrete events.
 */
export function HUD({ bridge, debugOpen, onToggleDebug }: HUDProps) {
  const snap = useSyncExternalStore(bridge.subscribe, bridge.getSnapshot);
  const [toast, setToast] = useState<ToastState | null>(null);

  useEffect(() => {
    let timerId = 0;
    const unsub = bridge.onEvent((event) => {
      if (event.type === 'lapCompleted') {
        window.clearTimeout(timerId);
        setToast({
          id: Date.now(),
          text: `LAP ${event.lap} // ${formatLapTime(event.lapTime)}`,
        });
        timerId = window.setTimeout(() => setToast(null), 2000);
      }
    });
    return () => {
      unsub();
      window.clearTimeout(timerId);
    };
  }, [bridge]);

  const speedKmh = snap?.speedKmh ?? 0;
  const speedPct = Math.min(100, Math.round((snap?.speedRatio ?? 0) * 100));
  const isDrifting = snap?.isDrifting ?? false;
  const isOffRoad = snap?.isOffRoad ?? false;
  const lap = snap?.lap ?? 1;
  const lapTime = snap?.lapTime ?? 0;
  const lastLapTime = snap?.lastLapTime ?? null;
  const fps = snap?.fps ?? 0;

  return (
    <div className="pointer-events-none absolute inset-0 z-2 flex flex-col justify-between p-4 font-mono text-white select-none sm:p-6">
      {/* Top Bar */}
      <div className="flex items-start justify-between gap-4">
        <div className="rounded border border-fuchsia-500/40 bg-[#0d0221]/80 px-3 py-2 shadow-[0_0_20px_rgba(255,42,109,0.25)] backdrop-blur-xs">
          <div className="text-[10px] tracking-[0.22em] text-cyan-300 uppercase">
            STAGE 01 // SUNSET BOULEVARD
          </div>
          <div className="mt-1 flex items-baseline gap-4 text-sm">
            <span className="font-bold text-pink-400">LAP {lap}</span>
            <span className="tabular-nums text-fuchsia-100">{formatLapTime(lapTime)}</span>
            {lastLapTime !== null && (
              <span className="text-xs tabular-nums text-fuchsia-300/75">
                LAST {formatLapTime(lastLapTime)}
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="rounded border border-cyan-400/30 bg-[#0d0221]/80 px-2.5 py-1 text-xs tabular-nums text-cyan-300">
            {fps} FPS
          </div>
          <button
            type="button"
            onClick={(e) => {
              onToggleDebug();
              e.currentTarget.blur();
            }}
            className="pointer-events-auto cursor-pointer rounded border border-pink-500/50 bg-[#1a0933]/85 px-2.5 py-1 text-xs font-semibold tracking-wider text-pink-300 transition hover:border-cyan-400 hover:text-cyan-200"
          >
            {debugOpen ? 'CLOSE TUNING [F2]' : 'TUNING [F2]'}
          </button>
        </div>
      </div>

      {/* Center Toast */}
      <div className="flex flex-col items-center justify-center">
        {toast && (
          <div
            key={toast.id}
            className="rounded border border-pink-400 bg-fuchsia-950/85 px-4 py-1.5 text-sm font-bold tracking-widest text-pink-200 uppercase shadow-lg shadow-pink-500/30"
          >
            {toast.text}
          </div>
        )}
      </div>

      {/* Bottom Bar */}
      <div className="flex items-end justify-between gap-4">
        {/* Controls legend */}
        <div className="hidden rounded border border-fuchsia-500/25 bg-[#0d0221]/75 px-3 py-2 text-[11px] tracking-wider text-fuchsia-200/80 sm:block">
          <div>
            <span className="text-cyan-300">WASD / ARROWS</span> STEER &amp; THROTTLE
          </div>
          <div>
            <span className="text-pink-400">SPACE / SHIFT + STEER</span> DRIFT
          </div>
        </div>

        {/* Speedometer & Status */}
        <div className="ml-auto flex flex-col items-end gap-2">
          <div className="flex items-center gap-2">
            {isOffRoad && (
              <span className="rounded border border-amber-400/80 bg-amber-950/85 px-2 py-0.5 text-xs font-bold tracking-widest text-amber-300 uppercase">
                OFF-ROAD
              </span>
            )}
            {isDrifting && (
              <span className="rounded border border-cyan-300 bg-cyan-950/90 px-2.5 py-0.5 text-xs font-bold tracking-widest text-cyan-200 uppercase shadow-[0_0_12px_rgba(5,217,232,0.5)]">
                DRIFTING
              </span>
            )}
          </div>

          <div className="w-52 rounded border border-cyan-400/40 bg-[#0d0221]/85 p-3 shadow-[0_0_24px_rgba(5,217,232,0.2)] backdrop-blur-xs">
            <div className="flex items-baseline justify-between">
              <span className="text-[10px] tracking-[0.25em] text-cyan-300 uppercase">SPEED</span>
              <div className="flex items-baseline gap-1">
                <span className="text-3xl font-black italic tabular-nums tracking-tight text-white drop-shadow-[0_0_8px_rgba(255,42,109,0.8)]">
                  {String(speedKmh).padStart(3, '0')}
                </span>
                <span className="text-xs font-bold text-pink-400">KM/H</span>
              </div>
            </div>
            <div className="mt-2 h-2 w-full overflow-hidden rounded-xs bg-fuchsia-950">
              <div
                className="h-full bg-gradient-to-r from-cyan-400 via-fuchsia-500 to-amber-300 transition-[width] duration-75 ease-linear"
                style={{ width: `${speedPct}%` }}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
