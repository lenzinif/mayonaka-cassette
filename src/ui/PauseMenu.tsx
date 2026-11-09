import { SODA_SKIN_LABELS, type SodaSkin } from '@src/entities/MelonSoda';
import type { GrooveTier } from '@src/entities/PlayerCar';
import { useEffect, useState, type MouseEvent } from 'react';

export interface PauseMenuProps {
  open: boolean;
  stageNumber: number;
  stagePaletteName: string;
  stageScore: number;
  bestSongGrade?: string | null;
  bestSongScore?: number | null;
  lap: number;
  lapTime: number;
  lastLapTime?: number | null;
  trackTitle: string;
  trackArtist: string;
  bpm: number;
  groove: number;
  grooveTier: GrooveTier;
  tofuMode: boolean;
  sodaSkin: SodaSkin;
  sodaSpills: number;
  cleanHud: boolean;
  showPerfHud: boolean;
  autoShift: boolean;
  autopilotActive?: boolean;
  crtEnabled?: boolean;
  initialView?: 'main' | 'options' | 'controls';
  onResume: () => void;
  onRestartRun?: () => void;
  onOpenTrackLoader: () => void;
  onOpenInspector: () => void;
  onToggleDebug: () => void;
  onToggleTofuMode: () => void;
  onCycleSodaSkin: () => void;
  onToggleCleanHud: () => void;
  onTogglePerfHud: () => void;
  onToggleAutoShift?: () => void;
  onToggleAutopilot?: () => void;
  onToggleCrt?: () => void;
  onReturnToMainMenu?: () => void;
}

function formatLapTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  const hundredths = Math.round((seconds * 100) % 100);
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${String(hundredths).padStart(2, '0')}`;
}

/**
 * Clean, compact, zero-scroll 1980s Japanese Arcade Pause Menu modal.
 * Internal view switching for Main, Options, and Controls tabs.
 */
export function PauseMenu({
  open,
  stageNumber,
  stageScore,
  bestSongGrade,
  bestSongScore,
  lap,
  lapTime,
  lastLapTime,
  trackTitle,
  trackArtist,
  bpm,
  groove,
  grooveTier,
  tofuMode,
  sodaSkin,
  sodaSpills,
  cleanHud,
  showPerfHud,
  autoShift,
  autopilotActive = false,
  crtEnabled = true,
  initialView = 'main',
  onResume,
  onRestartRun,
  onOpenTrackLoader,
  onOpenInspector,
  onToggleDebug,
  onToggleTofuMode,
  onCycleSodaSkin,
  onToggleCleanHud,
  onTogglePerfHud,
  onToggleAutoShift,
  onToggleAutopilot,
  onToggleCrt,
  onReturnToMainMenu,
}: PauseMenuProps) {
  const [view, setView] = useState<'main' | 'options' | 'controls'>(initialView);

  useEffect(() => {
    if (!open || view === 'main') return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.code === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        setView('main');
      }
    };
    window.addEventListener('keydown', onKeyDown, { capture: true });
    return () => window.removeEventListener('keydown', onKeyDown, { capture: true });
  }, [open, view]);

  if (!open) return null;

  const handleBackdropClick = (e: MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) {
      onResume();
    }
  };

  return (
    <div
      onClick={handleBackdropClick}
      className="pointer-events-auto fixed inset-0 z-50 flex items-center justify-center bg-[#060112]/94 p-4 font-mono text-white backdrop-blur-xs select-none"
      role="dialog"
      aria-modal="true"
      aria-label="Pause Menu"
    >
      <div className="relative w-full max-w-md rounded-lg border-2 border-pink-500/70 bg-[#0d0221]/98 p-5 text-center shadow-[0_0_50px_rgba(255,42,109,0.4)]">
        {/* Top Header Bar (always visible) */}
        <div className="flex items-center justify-between border-b border-fuchsia-500/30 pb-2">
          <span className="text-2xl font-black italic tracking-widest text-transparent bg-clip-text bg-gradient-to-r from-pink-500 via-fuchsia-400 to-cyan-300 drop-shadow-[0_0_15px_rgba(255,42,109,0.7)]">
            PAUSED
          </span>
          <span className="text-xs font-bold tracking-wider text-cyan-300 uppercase">
            STAGE 0{stageNumber} · {bpm.toFixed(1)} BPM
          </span>
        </div>

        {/* =====================================================================
            VIEW: MAIN
           ===================================================================== */}
        {view === 'main' && (
          <>
            {/* Compact VFD Session Strip */}
            <div className="my-3 rounded border border-fuchsia-500/30 bg-[#14042d]/90 px-3 py-2 text-[11px]">
              <div className="flex items-center justify-between gap-2">
                <span className="truncate font-bold text-cyan-200">
                  {trackArtist} — {trackTitle}
                </span>
                <span className="shrink-0 font-bold text-emerald-300">
                  GROOVE {groove}% · {grooveTier}
                </span>
              </div>
              <div className="mt-1 flex items-center justify-between text-[10px] tabular-nums text-fuchsia-200/80">
                <span>
                  <strong className="text-amber-300">{stageScore.toLocaleString()} PTS</strong>
                  {bestSongGrade && bestSongScore != null && (
                    <span className="text-emerald-300">
                      {' '}· BEST {bestSongGrade} · {bestSongScore.toLocaleString()}
                    </span>
                  )}
                </span>
                <span>
                  LAP {lap} · {formatLapTime(lapTime)}
                  {lastLapTime != null && (
                    <span className="text-cyan-300/80"> (LAST {formatLapTime(lastLapTime)})</span>
                  )}
                </span>
              </div>
            </div>

            {/* 5 Symmetric Arcade Actions */}
            <div className="space-y-2">
              {/* Primary full-width button */}
              <button
                type="button"
                onClick={onResume}
                className="group relative w-full cursor-pointer rounded border-2 border-pink-400 bg-gradient-to-r from-pink-600 via-fuchsia-600 to-cyan-600 py-2.5 text-sm font-black tracking-[0.25em] text-white uppercase shadow-[0_0_20px_rgba(255,42,109,0.6)] transition hover:scale-[1.01] hover:shadow-[0_0_30px_rgba(5,217,232,0.8)] active:scale-[0.99]"
              >
                RESUME DRIVE [P]
              </button>

              {/* 2-col row 1 */}
              <div className="grid grid-cols-2 gap-2 text-xs">
                <button
                  type="button"
                  onClick={() => {
                    onRestartRun?.();
                    onResume();
                  }}
                  className="cursor-pointer rounded border border-cyan-400/40 bg-[#160530]/80 py-2 font-bold tracking-wider text-cyan-200 transition hover:border-pink-400 hover:text-pink-200 hover:shadow-[0_0_12px_rgba(255,42,109,0.3)]"
                >
                  RESTART RUN
                </button>
                <button
                  type="button"
                  onClick={onOpenTrackLoader}
                  className="cursor-pointer rounded border border-cyan-400/40 bg-[#160530]/80 py-2 font-bold tracking-wider text-cyan-200 transition hover:border-pink-400 hover:text-pink-200 hover:shadow-[0_0_12px_rgba(255,42,109,0.3)]"
                >
                  CHANGE TRACK [M]
                </button>
              </div>

              {/* 2-col row 2 */}
              <div className="grid grid-cols-2 gap-2 text-xs">
                <button
                  type="button"
                  onClick={() => setView('options')}
                  className="cursor-pointer rounded border border-fuchsia-400/40 bg-[#160530]/80 py-2 font-bold tracking-wider text-fuchsia-200 transition hover:border-cyan-400 hover:text-cyan-200 hover:shadow-[0_0_12px_rgba(5,217,232,0.3)]"
                >
                  OPTIONS
                </button>
                <button
                  type="button"
                  onClick={() => setView('controls')}
                  className="cursor-pointer rounded border border-fuchsia-400/40 bg-[#160530]/80 py-2 font-bold tracking-wider text-fuchsia-200 transition hover:border-cyan-400 hover:text-cyan-200 hover:shadow-[0_0_12px_rgba(5,217,232,0.3)]"
                >
                  CONTROLS
                </button>
              </div>

              {/* Full-width bottom button when onReturnToMainMenu is provided */}
              {onReturnToMainMenu && (
                <button
                  type="button"
                  onClick={onReturnToMainMenu}
                  className="w-full cursor-pointer rounded border border-rose-500/50 bg-[#250518]/80 py-2 text-xs font-bold tracking-wider text-rose-300 transition hover:border-rose-400 hover:text-rose-100 hover:shadow-[0_0_12px_rgba(244,63,94,0.3)]"
                >
                  QUIT TO TITLE
                </button>
              )}
            </div>

            {/* Discrete Dev Footer Bar */}
            <div className="mt-4 flex items-center justify-between border-t border-fuchsia-500/20 pt-2.5 text-[10px] text-fuchsia-300/60">
              <span className="font-bold tracking-widest uppercase">DEV</span>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={onToggleDebug}
                  className="cursor-pointer rounded border border-fuchsia-500/30 bg-[#14042d]/80 px-2 py-0.5 font-semibold text-fuchsia-300 transition hover:border-cyan-400 hover:text-cyan-200"
                >
                  [F2] TUNING
                </button>
                <button
                  type="button"
                  onClick={onTogglePerfHud}
                  className="cursor-pointer rounded border border-fuchsia-500/30 bg-[#14042d]/80 px-2 py-0.5 font-semibold text-fuchsia-300 transition hover:border-cyan-400 hover:text-cyan-200"
                >
                  [F3] PERF: {showPerfHud ? 'ON' : 'OFF'}
                </button>
                <button
                  type="button"
                  onClick={() => onToggleAutopilot?.()}
                  className="cursor-pointer rounded border border-fuchsia-500/30 bg-[#14042d]/80 px-2 py-0.5 font-semibold text-fuchsia-300 transition hover:border-cyan-400 hover:text-cyan-200"
                >
                  [F4] AUTO: {autopilotActive ? 'ON' : 'OFF'}
                </button>
                <button
                  type="button"
                  onClick={onOpenInspector}
                  className="cursor-pointer rounded border border-fuchsia-500/30 bg-[#14042d]/80 px-2 py-0.5 font-semibold text-fuchsia-300 transition hover:border-cyan-400 hover:text-cyan-200"
                >
                  BEATMAP LAB
                </button>
              </div>
            </div>
          </>
        )}

        {/* =====================================================================
            VIEW: OPTIONS
           ===================================================================== */}
        {view === 'options' && (
          <div className="my-3 text-left">
            <div className="mb-3 flex items-center justify-between border-b border-fuchsia-500/20 pb-2">
              <span className="text-xs font-bold tracking-widest text-fuchsia-300 uppercase">
                OPTIONS
              </span>
              <button
                type="button"
                onClick={() => setView('main')}
                className="cursor-pointer rounded border border-fuchsia-400/40 bg-[#1a0636] px-2.5 py-1 text-[11px] font-bold tracking-wider text-fuchsia-200 transition hover:border-pink-400 hover:bg-pink-950/60 hover:text-white"
              >
                BACK [ESC]
              </button>
            </div>

            <div className="space-y-1.5 text-xs">
              {onToggleAutoShift && (
                <button
                  type="button"
                  onClick={onToggleAutoShift}
                  className="flex w-full cursor-pointer items-center justify-between rounded border border-cyan-400/30 bg-[#14042d]/80 px-3 py-2 font-semibold transition hover:border-cyan-400 hover:bg-[#1a063b]"
                >
                  <span className="text-fuchsia-200">GEAR SHIFT [G]</span>
                  <span className={autoShift ? 'font-bold text-cyan-300' : 'text-zinc-400'}>
                    {autoShift ? 'AUTO-SHIFT' : 'MANUAL'}
                  </span>
                </button>
              )}
              <button
                type="button"
                onClick={onToggleTofuMode}
                className="flex w-full cursor-pointer items-center justify-between rounded border border-cyan-400/30 bg-[#14042d]/80 px-3 py-2 font-semibold transition hover:border-emerald-400 hover:bg-[#1a063b]"
              >
                <span className="text-fuchsia-200">TOFU MODE [T]</span>
                <span className={tofuMode ? 'font-bold text-emerald-300' : 'text-zinc-400'}>
                  {tofuMode ? `ON (×2) [${sodaSpills}]` : 'OFF'}
                </span>
              </button>
              <button
                type="button"
                onClick={onCycleSodaSkin}
                className="flex w-full cursor-pointer items-center justify-between rounded border border-cyan-400/30 bg-[#14042d]/80 px-3 py-2 font-semibold transition hover:border-amber-400 hover:bg-[#1a063b]"
              >
                <span className="text-fuchsia-200">DASHBOARD CUP [V]</span>
                <span className="font-bold text-amber-300">{SODA_SKIN_LABELS[sodaSkin]}</span>
              </button>
              <button
                type="button"
                onClick={onToggleCleanHud}
                className="flex w-full cursor-pointer items-center justify-between rounded border border-cyan-400/30 bg-[#14042d]/80 px-3 py-2 font-semibold transition hover:border-pink-400 hover:bg-[#1a063b]"
              >
                <span className="text-fuchsia-200">HUD MODE [H]</span>
                <span className={cleanHud ? 'font-bold text-cyan-300' : 'text-zinc-400'}>
                  {cleanHud ? 'MINIMAL' : 'FULL'}
                </span>
              </button>
              {onToggleCrt && (
                <button
                  type="button"
                  onClick={onToggleCrt}
                  className="flex w-full cursor-pointer items-center justify-between rounded border border-cyan-400/30 bg-[#14042d]/80 px-3 py-2 font-semibold transition hover:border-emerald-400 hover:bg-[#1a063b]"
                >
                  <span className="text-fuchsia-200">CRT SCANLINES</span>
                  <span className={crtEnabled ? 'font-bold text-emerald-300' : 'text-zinc-400'}>
                    {crtEnabled ? 'ON' : 'OFF'}
                  </span>
                </button>
              )}
            </div>
          </div>
        )}

        {/* =====================================================================
            VIEW: CONTROLS
           ===================================================================== */}
        {view === 'controls' && (
          <div className="my-3 text-left">
            <div className="mb-3 flex items-center justify-between border-b border-fuchsia-500/20 pb-2">
              <span className="text-xs font-bold tracking-widest text-fuchsia-300 uppercase">
                COCKPIT CONTROLS
              </span>
              <button
                type="button"
                onClick={() => setView('main')}
                className="cursor-pointer rounded border border-fuchsia-400/40 bg-[#1a0636] px-2.5 py-1 text-[11px] font-bold tracking-wider text-fuchsia-200 transition hover:border-pink-400 hover:bg-pink-950/60 hover:text-white"
              >
                BACK [ESC]
              </button>
            </div>

            <div className="grid grid-cols-2 gap-x-3 gap-y-2 rounded border border-fuchsia-500/30 bg-[#14042d]/90 p-3 text-[11px] text-zinc-300">
              <div>
                <span className="font-bold text-cyan-300">WASD / ARROWS</span> Steer &amp; Gas
              </div>
              <div>
                <span className="font-bold text-pink-400">S / DOWN + STEER</span> Drift
              </div>
              <div>
                <span className="font-bold text-emerald-300">SPACE / SHIFT</span> Shift Up/Down
              </div>
              <div>
                <span className="font-bold text-cyan-300">G</span> Auto-Shift
              </div>
              <div>
                <span className="font-bold text-amber-300">T</span> Tofu Mode
              </div>
              <div>
                <span className="font-bold text-amber-300">V</span> Cup Skin
              </div>
              <div>
                <span className="font-bold text-cyan-300">C</span> Tape Widget
              </div>
              <div>
                <span className="font-bold text-cyan-300">H</span> Minimal HUD
              </div>
              <div className="col-span-2 border-t border-fuchsia-500/20 pt-1.5 text-center text-[10px]">
                <span className="font-bold text-pink-300">P / ESC</span> Pause / Resume
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
