import type { TelemetryBridge } from '@src/core/TelemetryBridge';
import type { GameEvent, TelemetrySnapshot } from '@src/engine/Game';
import { useEffect, useState, useSyncExternalStore } from 'react';

export interface HUDProps {
  bridge: TelemetryBridge<TelemetrySnapshot, GameEvent>;
  debugOpen: boolean;
  onToggleDebug: () => void;
  onOpenTrackLoader: () => void;
  onOpenInspector: () => void;
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
export function HUD({
  bridge,
  debugOpen,
  onToggleDebug,
  onOpenTrackLoader,
  onOpenInspector,
}: HUDProps) {
  const snap = useSyncExternalStore(bridge.subscribe, bridge.getSnapshot);
  const [toast, setToast] = useState<ToastState | null>(null);

  useEffect(() => {
    let timerId = 0;
    const showToast = (text: string, ms = 2000) => {
      window.clearTimeout(timerId);
      setToast({ id: Date.now(), text });
      timerId = window.setTimeout(() => setToast(null), ms);
    };

    const unsub = bridge.onEvent((event) => {
      if (event.type === 'lapCompleted') {
        showToast(`LAP ${event.lap} // ${formatLapTime(event.lapTime)}`, 2200);
      } else if (event.type === 'dropSync') {
        showToast(`DROP CREST SYNC! // BAR ${event.barIndex + 1}`, 1800);
      } else if (event.type === 'sectionEntered' && event.role === 'drop') {
        showToast(`DROP // BAR ${event.barIndex + 1}`, 1500);
      } else if (event.type === 'songRoadGenerated') {
        showToast(`ROAD BUILT // ${event.totalBars} BARS (${event.chunkCount} CHUNKS)`, 2200);
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

  const bpm = snap?.bpm ?? 122;
  const barIndex = snap?.barIndex ?? 0;
  const beatInBar = snap?.beatInBar ?? 0;
  const sectionRole = snap?.sectionRole ?? 'intro';
  const filterCutoffHz = snap?.filterCutoffHz ?? 2400;
  const trackTitle = snap?.trackTitle ?? 'Neon Horizon (Synth Fallback)';
  const trackArtist = snap?.trackArtist ?? 'OutRun FM 88.4';
  const audioUnlocked = snap?.audioUnlocked ?? false;
  const roadBarIndex = snap?.roadBarIndex ?? 0;
  const totalBars = snap?.totalBars ?? 64;
  const currentChunkId = snap?.currentChunkId ?? 'intro-boulevard-cruise';

  return (
    <div className="pointer-events-none absolute inset-0 z-2 flex flex-col justify-between p-4 font-mono text-white select-none sm:p-6">
      {/* Top Bar */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-wrap items-start gap-3">
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

          {/* Cassette / Beat Clock Widget */}
          <div className="rounded border border-cyan-400/40 bg-[#0d0221]/85 px-3 py-2 shadow-[0_0_18px_rgba(5,217,232,0.18)] backdrop-blur-xs">
            <div className="flex items-center gap-2 text-[10px] tracking-widest text-fuchsia-300 uppercase">
              <span className="max-w-[200px] truncate text-cyan-200">
                {trackArtist} — {trackTitle}
              </span>
              <span className="rounded bg-pink-600/80 px-1.5 py-0.2 text-[9px] font-bold text-white uppercase">
                {sectionRole}
              </span>
            </div>
            <div className="mt-1 flex items-center gap-3 text-xs tabular-nums">
              <span className="font-bold text-pink-400">{bpm.toFixed(1)} BPM</span>
              <span className="text-fuchsia-200">
                BAR {String(barIndex + 1).padStart(3, '0')}.{beatInBar + 1}
              </span>
              <div className="flex items-center gap-1" aria-hidden="true">
                {[0, 1, 2, 3].map((b) => (
                  <span
                    key={b}
                    className={`inline-block h-2 w-2 rounded-full transition ${
                      beatInBar === b
                        ? b === 0
                          ? 'scale-125 bg-pink-400 shadow-[0_0_8px_#ff2a6d]'
                          : 'bg-cyan-300 shadow-[0_0_6px_#05d9e8]'
                        : 'bg-fuchsia-900/70'
                    }`}
                  />
                ))}
              </div>
              <span className="text-[10px] text-cyan-300/80">LPF {filterCutoffHz}Hz</span>
              <span className="text-[10px] text-fuchsia-300/90">
                ROAD {String(roadBarIndex + 1).padStart(2, '0')}/{totalBars} · {currentChunkId}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="rounded border border-cyan-400/30 bg-[#0d0221]/80 px-2.5 py-1 text-xs tabular-nums text-cyan-300">
            {fps} FPS
          </div>
          <button
            type="button"
            onClick={(e) => {
              onOpenTrackLoader();
              e.currentTarget.blur();
            }}
            className="pointer-events-auto cursor-pointer rounded border border-cyan-400/55 bg-[#0e1b38]/85 px-2.5 py-1 text-xs font-semibold tracking-wider text-cyan-200 transition hover:border-pink-400 hover:text-pink-200"
          >
            LOAD TRACK [M]
          </button>
          <button
            type="button"
            onClick={(e) => {
              onOpenInspector();
              e.currentTarget.blur();
            }}
            className="pointer-events-auto cursor-pointer rounded border border-fuchsia-400/45 bg-[#1a0933]/85 px-2.5 py-1 text-xs font-semibold tracking-wider text-fuchsia-200 transition hover:border-cyan-400 hover:text-cyan-200"
          >
            ANALYZE
          </button>
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

      {/* Center Toast / Audio Unlock Prompt */}
      <div className="flex flex-col items-center justify-center gap-2">
        {!audioUnlocked && (
          <div className="rounded border border-cyan-400/50 bg-[#0d0221]/85 px-3.5 py-1 text-[11px] tracking-widest text-cyan-200 uppercase shadow">
            PRESS ANY KEY OR DRIVE TO START SYNTH AUDIO
          </div>
        )}
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
          <div>
            <span className="text-fuchsia-300">M</span> LOAD YOUR MUSIC
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
