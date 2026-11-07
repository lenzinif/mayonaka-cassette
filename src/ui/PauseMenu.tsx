import { SODA_SKIN_LABELS, type SodaSkin } from '@src/entities/MelonSoda';
import type { GrooveTier } from '@src/entities/PlayerCar';
import type { MouseEvent } from 'react';

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
  onReturnToMainMenu?: () => void;
}

function formatLapTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  const hundredths = Math.round((seconds * 100) % 100);
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${String(hundredths).padStart(2, '0')}`;
}

/**
 * Unified 1980s Future Funk Pause Menu overlay.
 * Replaces clashing low-res canvas text with a cohesive, beautifully styled synthwave modal.
 * Acts as the centralized options & tuning hub during gameplay.
 */
export function PauseMenu({
  open,
  stageNumber,
  stagePaletteName,
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
  onReturnToMainMenu,
}: PauseMenuProps) {
  if (!open) return null;

  const handleBackdropClick = (e: MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) {
      onResume();
    }
  };

  return (
    <div
      onClick={handleBackdropClick}
      className="pointer-events-auto fixed inset-0 z-50 flex items-center justify-center bg-[#060112]/94 p-4 font-mono text-white backdrop-blur-xs select-none transition-opacity duration-200"
      role="dialog"
      aria-modal="true"
      aria-label="Pause Menu"
    >
      <div className="relative w-full max-w-md max-h-[88vh] overflow-y-auto rounded-lg border-2 border-pink-500/70 bg-[#0d0221]/98 p-5 text-center shadow-[0_0_50px_rgba(255,42,109,0.4)]" style={{ colorScheme: 'dark', scrollbarColor: '#e879f9 #1a0633', scrollbarWidth: 'thin' }}>
        {/* Arcade Top Header Bar */}
        <div className="flex items-center justify-between border-b border-fuchsia-500/30 pb-2 text-[10px] tracking-[0.25em] text-cyan-300 uppercase">
          <span>OUTRUN FM 88.4</span>
          <span className="text-pink-400">GAME PAUSED</span>
        </div>

        {/* Title & Current Track Subtitle */}
        <div className="my-3 text-center">
          <div className="text-3xl font-black italic tracking-widest text-transparent bg-clip-text bg-gradient-to-r from-pink-500 via-fuchsia-400 to-cyan-300 drop-shadow-[0_0_20px_rgba(255,42,109,0.7)]">
            PAUSED
          </div>
          <div className="mt-1 truncate text-xs font-bold tracking-wider text-cyan-200">
            {trackArtist} — {trackTitle}
          </div>
          <div className="mt-0.5 text-[10px] tracking-widest text-fuchsia-300/75 uppercase">
            {bpm.toFixed(1)} BPM · {stagePaletteName}
          </div>
        </div>

        {/* Session Stats Panel */}
        <div className="my-3 grid grid-cols-3 gap-2 rounded border border-cyan-400/30 bg-[#14042d]/80 p-2.5 text-center text-[10px]">
          <div>
            <div className="text-cyan-300 tracking-wider">STAGE</div>
            <div className="mt-0.5 font-bold text-white">0{stageNumber}</div>
            <div className="text-[9px] tabular-nums text-amber-300/90">{stageScore.toLocaleString()} PTS</div>
            {bestSongGrade && bestSongScore !== null && bestSongScore !== undefined && (
              <div className="mt-0.5 text-[8px] tabular-nums text-emerald-300">
                BEST {bestSongGrade} · {bestSongScore.toLocaleString()}
              </div>
            )}
          </div>
          <div>
            <div className="text-pink-300 tracking-wider">LAP {lap}</div>
            <div className="mt-0.5 font-bold tabular-nums text-white">{formatLapTime(lapTime)}</div>
            <div className="text-[9px] text-fuchsia-300/75">
              {lastLapTime !== null && lastLapTime !== undefined
                ? `LAST ${formatLapTime(lastLapTime)}`
                : 'IN PROGRESS'}
            </div>
          </div>
          <div>
            <div className="text-amber-300 tracking-wider">GROOVE</div>
            <div className="mt-0.5 font-bold tabular-nums text-emerald-300">{groove}%</div>
            <div className="text-[9px] text-emerald-400/90">{grooveTier}</div>
          </div>
        </div>

        {/* Primary Action: Resume Drive */}
        <button
          type="button"
          onClick={onResume}
          className="group relative w-full cursor-pointer rounded border-2 border-pink-400 bg-gradient-to-r from-pink-600 via-fuchsia-600 to-cyan-600 py-2.5 text-sm font-black tracking-[0.25em] text-white uppercase shadow-[0_0_20px_rgba(255,42,109,0.6)] transition hover:scale-[1.02] hover:shadow-[0_0_30px_rgba(5,217,232,0.8)] active:scale-[0.98]"
        >
          RESUME DRIVE [P]
        </button>

        {/* Secondary Action Buttons Grid */}
        <div className="mt-2.5 grid grid-cols-2 gap-2 text-xs">
          {onRestartRun && (
            <button
              type="button"
              onClick={() => {
                onRestartRun();
                onResume();
              }}
              className="cursor-pointer rounded border border-cyan-400/40 bg-[#160530]/80 py-2 font-bold tracking-wider text-cyan-200 transition hover:border-pink-400 hover:text-pink-200 hover:shadow-[0_0_12px_rgba(255,42,109,0.3)]"
            >
              RESTART RUN
            </button>
          )}
          <button
            type="button"
            onClick={onOpenTrackLoader}
            className={`cursor-pointer rounded border border-cyan-400/40 bg-[#160530]/80 py-2 font-bold tracking-wider text-cyan-200 transition hover:border-pink-400 hover:text-pink-200 hover:shadow-[0_0_12px_rgba(255,42,109,0.3)] ${
              !onRestartRun ? 'col-span-2' : ''
            }`}
          >
            LOAD TRACK [M]
          </button>
          <button
            type="button"
            onClick={onToggleDebug}
            className="cursor-pointer rounded border border-fuchsia-400/40 bg-[#160530]/80 py-2 font-bold tracking-wider text-fuchsia-200 transition hover:border-cyan-400 hover:text-cyan-200 hover:shadow-[0_0_12px_rgba(5,217,232,0.3)]"
          >
            FEEL TUNING [F2]
          </button>
          {onReturnToMainMenu && (
            <button
              type="button"
              onClick={onReturnToMainMenu}
              className="col-span-2 cursor-pointer rounded border border-rose-500/60 bg-[#250518]/80 py-2 font-bold tracking-wider text-rose-300 transition hover:border-pink-400 hover:text-pink-100 hover:shadow-[0_0_12px_rgba(255,42,109,0.4)]"
            >
              TITLE SCREEN // MAIN MENU
            </button>
          )}
          <button
            type="button"
            onClick={onOpenInspector}
            className="cursor-pointer rounded border border-fuchsia-400/40 bg-[#160530]/80 py-2 font-bold tracking-wider text-fuchsia-200 transition hover:border-cyan-400 hover:text-cyan-200 hover:shadow-[0_0_12px_rgba(5,217,232,0.3)]"
          >
            BEATMAP INSPECTOR
          </button>
        </div>

        {/* Quick Toggles Section */}
        <div className="mt-3 border-t border-fuchsia-500/25 pt-2.5">
          <div className="text-[10px] tracking-widest text-fuchsia-300/70 uppercase">
            QUICK TOGGLES &amp; OPTIONS
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2 text-[11px]">
            {onToggleAutoShift && (
              <button
                type="button"
                onClick={onToggleAutoShift}
                className={`cursor-pointer rounded border py-1.5 px-2 font-semibold tracking-wider transition ${
                  autoShift
                    ? 'border-cyan-400 bg-cyan-950/90 text-cyan-200 shadow-[0_0_10px_rgba(5,217,232,0.4)]'
                    : 'border-cyan-400/40 bg-[#160530]/70 text-cyan-200 hover:border-cyan-300'
                }`}
              >
                GEAR: {autoShift ? 'AUTO-SHIFT' : 'MANUAL'} [G]
              </button>
            )}
            <button
              type="button"
              onClick={onToggleTofuMode}
              className={`cursor-pointer rounded border py-1.5 px-2 font-semibold tracking-wider transition ${
                tofuMode
                  ? 'border-emerald-400 bg-emerald-950/90 text-emerald-200 shadow-[0_0_10px_rgba(16,185,129,0.4)]'
                  : 'border-cyan-400/40 bg-[#160530]/70 text-cyan-200 hover:border-emerald-400'
              }`}
            >
              TOFU MODE: {tofuMode ? `ON (×2) [${sodaSpills}]` : 'OFF'} [T]
            </button>
            <button
              type="button"
              onClick={onCycleSodaSkin}
              className="cursor-pointer rounded border border-amber-400/40 bg-[#1f1209]/75 py-1.5 px-2 font-semibold tracking-wider text-amber-200 transition hover:border-amber-300"
              title="Cycle dashboard cup skin"
            >
              CUP: {SODA_SKIN_LABELS[sodaSkin]} [V]
            </button>
            <button
              type="button"
              onClick={onToggleCleanHud}
              className={`cursor-pointer rounded border py-1.5 px-2 font-semibold tracking-wider transition ${
                cleanHud
                  ? 'border-cyan-400 bg-cyan-950/90 text-cyan-200 shadow-[0_0_10px_rgba(5,217,232,0.4)]'
                  : 'border-cyan-400/40 bg-[#160530]/70 text-cyan-200 hover:border-pink-400'
              }`}
            >
              HUD: {cleanHud ? 'MINIMAL' : 'FULL'} [H]
            </button>
            <button
              type="button"
              onClick={onTogglePerfHud}
              className={`cursor-pointer rounded border py-1.5 px-2 font-semibold tracking-wider transition ${
                showPerfHud
                  ? 'border-emerald-400 bg-emerald-950/90 text-emerald-200 shadow-[0_0_10px_rgba(16,185,129,0.4)]'
                  : 'border-cyan-400/40 bg-[#160530]/70 text-cyan-200 hover:border-cyan-300'
              }`}
            >
              PERF PROFILER: {showPerfHud ? 'ON' : 'OFF'} [F3]
            </button>
            {onToggleAutopilot && (
              <button
                type="button"
                onClick={onToggleAutopilot}
                className={`col-span-2 cursor-pointer rounded border py-1.5 px-2 font-semibold tracking-wider transition ${
                  autopilotActive
                    ? 'border-emerald-400 bg-emerald-950/90 text-emerald-200 shadow-[0_0_10px_rgba(16,185,129,0.4)]'
                    : 'border-cyan-400/40 bg-[#160530]/70 text-cyan-200 hover:border-emerald-400'
                }`}
              >
                🤖 AI AUTOPILOT: {autopilotActive ? 'ACTIVE' : 'OFF'} [F4]
              </button>
            )}
          </div>
        </div>

        {/* Cockpit Controls Reference Card */}
        <div className="mt-3 border-t border-fuchsia-500/25 pt-2.5 text-left">
          <div className="mb-1.5 flex items-center justify-between text-[9px] font-bold tracking-[0.2em] text-fuchsia-400 uppercase">
            <span>COCKPIT CONTROLS</span>
            <span>KEYBOARD / GAMEPAD</span>
          </div>
          <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[10px] text-zinc-300">
            <div>
              <span className="font-bold text-cyan-300">WASD / ARROWS</span> Steer &amp; Gas
            </div>
            <div>
              <span className="font-bold text-pink-400">S / DOWN + STEER</span> Drift
            </div>
            <div>
              <span className="font-bold text-emerald-300">SPACE / SHIFT</span> Shift Up / Down
            </div>
            <div>
              <span className="font-bold text-cyan-300">C</span> Toggle Tape Widget
            </div>
            <div>
              <span className="font-bold text-amber-300">T</span> Tofu Mode (×2)
            </div>
            <div>
              <span className="font-bold text-cyan-300">H</span> Minimal HUD Mode
            </div>
            <div>
              <span className="font-bold text-emerald-300">F4</span> AI Autopilot
            </div>
            <div>
              <span className="font-bold text-pink-300">P / ESC</span> Resume / Pause
            </div>
          </div>
        </div>

        {/* Community & Feedback Link */}
        <div className="mt-3 border-t border-fuchsia-500/25 pt-2 text-center">
          <a
            href="https://github.com/lenzinif/mayonaka-cassette/discussions"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded border border-cyan-400/40 bg-[#160530]/80 px-3 py-1 text-[11px] font-bold tracking-wider text-cyan-300 transition hover:border-pink-400 hover:text-pink-200 hover:shadow-[0_0_12px_rgba(255,42,109,0.4)]"
          >
            <span>💬 COMMUNITY &amp; FEEDBACK</span>
            <span className="text-[9px] text-pink-400">↗</span>
          </a>
        </div>

        {/* Footer Reminder */}
        <div className="mt-3 text-[10px] tracking-wider text-fuchsia-300/60 uppercase">
          PRESS [P] OR [ESC] TO RESUME · CLICK OUTSIDE TO CLOSE
        </div>
      </div>
    </div>
  );
}
