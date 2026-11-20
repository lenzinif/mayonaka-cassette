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
 * Mayonaka Hi-Fi Japanese Cassette J-Card Pause Menu modal.
 * Zero-scroll layout with Main, Options, and Controls views.
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
      className="pointer-events-auto fixed inset-0 z-50 flex items-center justify-center bg-[#0B0E1E]/80 p-4 text-[var(--ff-cream)] select-none"
      role="dialog"
      aria-modal="true"
      aria-label="Pause Menu"
    >
      <div className="ff-shadow-pink relative flex w-full max-w-md overflow-hidden rounded-[2px] border-2 border-[var(--ff-cream)] bg-[var(--ff-panel)] text-left">
        {/* Vertical 3-Stripe Obi Spine */}
        <div className="ff-obi-v w-2.5 shrink-0" />

        <div className="min-w-0 flex-1">
          {/* Cream J-Card Header */}
          <div className="flex items-center justify-between bg-[var(--ff-cream)] px-4 py-2.5 text-[var(--ff-ink)]">
            <div className="flex items-baseline gap-2">
              <span className="ff-display text-xl font-black italic tracking-wider">PAUSED</span>
              <span className="text-[10px] font-bold tracking-[0.18em] opacity-65">一時停止</span>
            </div>
            <span className="ff-mono text-[11px] font-black uppercase">
              STAGE 0{stageNumber} · {bpm.toFixed(1)} BPM
            </span>
          </div>

          {/* VIEW: MAIN */}
          {view === 'main' && (
            <div className="space-y-3 p-4">
              {/* Session Strip */}
              <div className="rounded-[2px] border border-[var(--ff-border)] bg-[var(--ff-ink)] px-3 py-2 text-[11px]">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate font-bold text-[var(--ff-cream)]">
                    {trackArtist} — {trackTitle}
                  </span>
                  <span className="ff-mono shrink-0 font-bold text-[var(--ff-mint)]">
                    GROOVE {groove}% · {grooveTier}
                  </span>
                </div>
                <div className="ff-mono mt-1 flex items-center justify-between text-[10px] text-[var(--ff-muted)]">
                  <span>
                    <strong className="text-[var(--ff-gold)]">
                      {stageScore.toLocaleString()} PTS
                    </strong>
                    {bestSongGrade && bestSongScore != null && (
                      <span className="text-[var(--ff-mint)]">
                        {' '}
                        · BEST {bestSongGrade} · {bestSongScore.toLocaleString()}
                      </span>
                    )}
                  </span>
                  <span>
                    LAP {lap} · {formatLapTime(lapTime)}
                    {lastLapTime != null && (
                      <span className="text-[var(--ff-cream)]/75">
                        {' '}
                        (LAST {formatLapTime(lastLapTime)})
                      </span>
                    )}
                  </span>
                </div>
              </div>

              {/* Primary + Symmetric Actions */}
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={onResume}
                  className="ff-shadow-ink ff-display w-full cursor-pointer rounded-[2px] bg-[var(--ff-pink)] py-2.5 text-sm font-black tracking-[0.2em] text-[var(--ff-cream)] uppercase transition hover:brightness-110 active:translate-y-[1px]"
                >
                  RESUME [P]
                </button>

                <div className="grid grid-cols-2 gap-2 text-xs font-bold tracking-[0.12em] uppercase">
                  <button
                    type="button"
                    onClick={() => {
                      onRestartRun?.();
                      onResume();
                    }}
                    className="cursor-pointer rounded-[2px] border border-[var(--ff-border)] bg-[var(--ff-panel-hi)] py-2 text-[var(--ff-cream)] transition hover:border-[var(--ff-mint)] hover:text-[var(--ff-mint)]"
                  >
                    RESTART
                  </button>
                  <button
                    type="button"
                    onClick={onOpenTrackLoader}
                    className="cursor-pointer rounded-[2px] border border-[var(--ff-border)] bg-[var(--ff-panel-hi)] py-2 text-[var(--ff-cream)] transition hover:border-[var(--ff-mint)] hover:text-[var(--ff-mint)]"
                  >
                    CASSETTES [M]
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs font-bold tracking-[0.12em] uppercase">
                  <button
                    type="button"
                    onClick={() => setView('options')}
                    className="cursor-pointer rounded-[2px] border border-[var(--ff-border)] bg-[var(--ff-panel-hi)] py-2 text-[var(--ff-cream)] transition hover:border-[var(--ff-gold)] hover:text-[var(--ff-gold)]"
                  >
                    OPTIONS
                  </button>
                  <button
                    type="button"
                    onClick={() => setView('controls')}
                    className="cursor-pointer rounded-[2px] border border-[var(--ff-border)] bg-[var(--ff-panel-hi)] py-2 text-[var(--ff-cream)] transition hover:border-[var(--ff-gold)] hover:text-[var(--ff-gold)]"
                  >
                    CONTROLS
                  </button>
                </div>

                {onReturnToMainMenu && (
                  <button
                    type="button"
                    onClick={onReturnToMainMenu}
                    className="w-full cursor-pointer rounded-[2px] border border-[rgba(255,59,127,0.45)] bg-transparent py-2 text-xs font-bold tracking-[0.14em] text-[#FF7DA8] uppercase transition hover:border-[var(--ff-pink)] hover:bg-[rgba(255,59,127,0.12)] hover:text-[var(--ff-cream)]"
                  >
                    EXIT TO TITLE
                  </button>
                )}
              </div>

              {/* Discrete Dev Footer Bar */}
              <div className="ff-mono flex items-center justify-between border-t border-[var(--ff-border)] pt-2.5 text-[10px] text-[var(--ff-muted)]">
                <span className="font-bold tracking-widest uppercase">DEV</span>
                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    onClick={onToggleDebug}
                    className="cursor-pointer rounded-[2px] border border-[var(--ff-border)] bg-[var(--ff-ink)] px-2 py-0.5 font-semibold text-[var(--ff-muted)] transition hover:border-[var(--ff-mint)] hover:text-[var(--ff-cream)]"
                  >
                    [F2] TUNING
                  </button>
                  <button
                    type="button"
                    onClick={onTogglePerfHud}
                    className="cursor-pointer rounded-[2px] border border-[var(--ff-border)] bg-[var(--ff-ink)] px-2 py-0.5 font-semibold text-[var(--ff-muted)] transition hover:border-[var(--ff-mint)] hover:text-[var(--ff-cream)]"
                  >
                    [F3] PERF: {showPerfHud ? 'ON' : 'OFF'}
                  </button>
                  <button
                    type="button"
                    onClick={() => onToggleAutopilot?.()}
                    className="cursor-pointer rounded-[2px] border border-[var(--ff-border)] bg-[var(--ff-ink)] px-2 py-0.5 font-semibold text-[var(--ff-muted)] transition hover:border-[var(--ff-mint)] hover:text-[var(--ff-cream)]"
                  >
                    [F4] AUTO: {autopilotActive ? 'ON' : 'OFF'}
                  </button>
                  <button
                    type="button"
                    onClick={onOpenInspector}
                    className="cursor-pointer rounded-[2px] border border-[var(--ff-border)] bg-[var(--ff-ink)] px-2 py-0.5 font-semibold text-[var(--ff-muted)] transition hover:border-[var(--ff-mint)] hover:text-[var(--ff-cream)]"
                  >
                    BEATMAP LAB
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* VIEW: OPTIONS */}
          {view === 'options' && (
            <div className="p-4">
              <div className="mb-3 flex items-center justify-between border-b border-[var(--ff-border)] pb-2">
                <span className="text-xs font-bold tracking-[0.16em] text-[var(--ff-gold)] uppercase">
                  OPTIONS
                </span>
                <button
                  type="button"
                  onClick={() => setView('main')}
                  className="ff-mono cursor-pointer rounded-[2px] border border-[var(--ff-border)] bg-[var(--ff-ink)] px-2.5 py-1 text-[11px] font-bold tracking-wider text-[var(--ff-cream)] transition hover:border-[var(--ff-pink)] hover:text-[var(--ff-pink)]"
                >
                  BACK [ESC]
                </button>
              </div>

              <div className="space-y-2 text-xs">
                {onToggleAutoShift && (
                  <button
                    type="button"
                    onClick={onToggleAutoShift}
                    className="flex w-full cursor-pointer items-center justify-between rounded-[2px] border border-[var(--ff-border)] bg-[var(--ff-ink)] px-3 py-2 font-semibold transition hover:border-[var(--ff-mint)]"
                  >
                    <span className="tracking-wider uppercase">GEARBOX [G]</span>
                    <span
                      className={`ff-mono rounded-[2px] px-2 py-0.5 text-[10px] font-black ${
                        autoShift
                          ? 'bg-[var(--ff-gold)] text-[var(--ff-ink)]'
                          : 'bg-[var(--ff-mint)] text-[var(--ff-ink)]'
                      }`}
                    >
                      {autoShift ? 'AUTO-SHIFT' : 'MANUAL'}
                    </span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={onToggleTofuMode}
                  className="flex w-full cursor-pointer items-center justify-between rounded-[2px] border border-[var(--ff-border)] bg-[var(--ff-ink)] px-3 py-2 font-semibold transition hover:border-[var(--ff-mint)]"
                >
                  <span className="tracking-wider uppercase">TOFU MODE [T]</span>
                  <span
                    className={`ff-mono rounded-[2px] px-2 py-0.5 text-[10px] font-black ${
                      tofuMode
                        ? 'bg-[var(--ff-mint)] text-[var(--ff-ink)]'
                        : 'bg-[var(--ff-panel-hi)] text-[var(--ff-muted)]'
                    }`}
                  >
                    {tofuMode ? `ON (×2) [${sodaSpills}]` : 'OFF'}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={onCycleSodaSkin}
                  className="flex w-full cursor-pointer items-center justify-between rounded-[2px] border border-[var(--ff-border)] bg-[var(--ff-ink)] px-3 py-2 font-semibold transition hover:border-[var(--ff-gold)]"
                >
                  <span className="tracking-wider uppercase">DASHBOARD CUP [V]</span>
                  <span className="ff-mono rounded-[2px] bg-[var(--ff-gold)] px-2 py-0.5 text-[10px] font-black text-[var(--ff-ink)]">
                    {SODA_SKIN_LABELS[sodaSkin]}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={onToggleCleanHud}
                  className="flex w-full cursor-pointer items-center justify-between rounded-[2px] border border-[var(--ff-border)] bg-[var(--ff-ink)] px-3 py-2 font-semibold transition hover:border-[var(--ff-mint)]"
                >
                  <span className="tracking-wider uppercase">HUD [H]</span>
                  <span
                    className={`ff-mono rounded-[2px] px-2 py-0.5 text-[10px] font-black ${
                      cleanHud
                        ? 'bg-[var(--ff-mint)] text-[var(--ff-ink)]'
                        : 'bg-[var(--ff-panel-hi)] text-[var(--ff-muted)]'
                    }`}
                  >
                    {cleanHud ? 'MINIMAL' : 'FULL'}
                  </span>
                </button>

                {onToggleCrt && (
                  <button
                    type="button"
                    onClick={onToggleCrt}
                    className="flex w-full cursor-pointer items-center justify-between rounded-[2px] border border-[var(--ff-border)] bg-[var(--ff-ink)] px-3 py-2 font-semibold transition hover:border-[var(--ff-pink)]"
                  >
                    <span className="tracking-wider uppercase">CRT SCANLINES</span>
                    <span
                      className={`ff-mono rounded-[2px] px-2 py-0.5 text-[10px] font-black ${
                        crtEnabled
                          ? 'bg-[var(--ff-pink)] text-[var(--ff-cream)]'
                          : 'bg-[var(--ff-panel-hi)] text-[var(--ff-muted)]'
                      }`}
                    >
                      {crtEnabled ? 'ON' : 'OFF'}
                    </span>
                  </button>
                )}
              </div>
            </div>
          )}

          {/* VIEW: CONTROLS */}
          {view === 'controls' && (
            <div className="p-4">
              <div className="mb-3 flex items-center justify-between border-b border-[var(--ff-border)] pb-2">
                <span className="text-xs font-bold tracking-[0.16em] text-[var(--ff-gold)] uppercase">
                  CONTROLS
                </span>
                <button
                  type="button"
                  onClick={() => setView('main')}
                  className="ff-mono cursor-pointer rounded-[2px] border border-[var(--ff-border)] bg-[var(--ff-ink)] px-2.5 py-1 text-[11px] font-bold tracking-wider text-[var(--ff-cream)] transition hover:border-[var(--ff-pink)] hover:text-[var(--ff-pink)]"
                >
                  BACK [ESC]
                </button>
              </div>

              <div className="grid grid-cols-2 gap-x-3 gap-y-2 rounded-[2px] border border-[var(--ff-border)] bg-[var(--ff-ink)] p-3 text-[11px] text-[var(--ff-cream)]">
                <div>
                  <span className="ff-mono font-bold text-[var(--ff-mint)]">WASD / ARROWS</span>{' '}
                  <span className="text-[var(--ff-muted)]">Steer &amp; Gas</span>
                </div>
                <div>
                  <span className="ff-mono font-bold text-[var(--ff-pink)]">S / DOWN + STEER</span>{' '}
                  <span className="text-[var(--ff-muted)]">Drift</span>
                </div>
                <div>
                  <span className="ff-mono font-bold text-[var(--ff-gold)]">SPACE / SHIFT</span>{' '}
                  <span className="text-[var(--ff-muted)]">Shift Up/Down</span>
                </div>
                <div>
                  <span className="ff-mono font-bold text-[var(--ff-mint)]">G</span>{' '}
                  <span className="text-[var(--ff-muted)]">Auto-Shift</span>
                </div>
                <div>
                  <span className="ff-mono font-bold text-[var(--ff-gold)]">T</span>{' '}
                  <span className="text-[var(--ff-muted)]">Tofu Mode</span>
                </div>
                <div>
                  <span className="ff-mono font-bold text-[var(--ff-gold)]">V</span>{' '}
                  <span className="text-[var(--ff-muted)]">Cup Skin</span>
                </div>
                <div>
                  <span className="ff-mono font-bold text-[var(--ff-mint)]">C</span>{' '}
                  <span className="text-[var(--ff-muted)]">Tape Widget</span>
                </div>
                <div>
                  <span className="ff-mono font-bold text-[var(--ff-mint)]">H</span>{' '}
                  <span className="text-[var(--ff-muted)]">Minimal HUD</span>
                </div>
                <div className="col-span-2 border-t border-[var(--ff-border)] pt-1.5 text-center text-[10px]">
                  <span className="ff-mono font-bold text-[var(--ff-pink)]">P / ESC</span>{' '}
                  <span className="text-[var(--ff-muted)]">Pause / Resume</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
