import { SODA_SKIN_LABELS, type SodaSkin } from '@src/entities/MelonSoda';
import type { GrooveTier } from '@src/entities/PlayerCar';
import { useEffect, useId, useState, type MouseEvent } from 'react';
import { WalkmanLed, WalkmanModalFrame, WalkmanSwitchRow } from './walkman/WalkmanChrome';

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
  const totalHundredths = Math.max(0, Math.round(seconds * 100));
  const mins = Math.floor(totalHundredths / 6000);
  const secs = Math.floor((totalHundredths % 6000) / 100);
  const hundredths = totalHundredths % 100;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${String(hundredths).padStart(2, '0')}`;
}

/**
 * Mayonaka Walkman Pause Menu modal (`WM-86 TAPE HOLD`).
 * Flat flush keys and rigid 4-column service grid.
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
  const titleId = useId();

  useEffect(() => {
    if (!open) {
      setView(initialView);
    }
  }, [open, initialView]);

  useEffect(() => {
    if (!open || view === 'main') return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.code === 'Escape') {
        e.preventDefault();
        e.stopImmediatePropagation();
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
      className="pointer-events-auto fixed inset-0 z-50 flex items-center justify-center bg-[#070911]/82 p-4 text-[var(--wm-silk)] select-none"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      <WalkmanModalFrame
        title="PAUSED"
        jpSubtitle="一時停止"
        modelTag="WM-86 TAPE HOLD"
        titleId={titleId}
        maxWidthClass="max-w-md"
        maxHeightClass="max-h-[90vh]"
        headerRight={
          <span className="wm-lcd ff-mono inline-flex items-center gap-1.5 rounded-[2px] px-2.5 py-1 text-[10px] font-black text-[var(--wm-silk)] uppercase">
            <WalkmanLed lit color="amber" />
            STAGE {String(stageNumber).padStart(2, '0')} · {bpm.toFixed(1)} BPM
          </span>
        }
      >
        <div className="ff-scroll overflow-y-auto">
          {/* VIEW: MAIN */}
          {view === 'main' && (
            <div className="space-y-3 p-4">
              {/* Recessed LCD Session Readout */}
              <div className="wm-lcd rounded-[2px] px-3 py-2.5 text-[11px]">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate font-bold text-[var(--wm-silk)]">
                    {trackArtist} — {trackTitle}
                  </span>
                  <span className="ff-mono shrink-0 font-bold text-[var(--wm-mint)]">
                    GROOVE {groove}% · {grooveTier}
                  </span>
                </div>
                <div className="ff-mono mt-1 flex items-center justify-between text-[10px] text-[var(--wm-silk-dim)]">
                  <span>
                    <strong className="text-[var(--wm-amber)]">
                      {stageScore.toLocaleString()} PTS
                    </strong>
                    {bestSongGrade && bestSongScore != null && (
                      <span className="text-[var(--wm-mint)]">
                        {' '}
                        · BEST {bestSongGrade} · {bestSongScore.toLocaleString()}
                      </span>
                    )}
                  </span>
                  <span>
                    LAP {lap} · {formatLapTime(lapTime)}
                    {lastLapTime != null && (
                      <span className="text-[var(--wm-silk)]/75">
                        {' '}
                        (LAST {formatLapTime(lastLapTime)})
                      </span>
                    )}
                  </span>
                </div>
              </div>

              {/* Flat Flush Walkman Transport Key Bank */}
              <div className="wm-key-bank flex flex-col">
                <button
                  type="button"
                  onClick={onResume}
                  className="wm-btn-well wm-btn-play ff-mono w-full cursor-pointer py-2.5 text-xs font-black tracking-[0.2em] uppercase"
                >
                  ▶ RESUME [P]
                </button>

                <div className="grid grid-cols-2 gap-[1px] text-[11px] font-bold tracking-[0.12em] uppercase">
                  <button
                    type="button"
                    onClick={() => {
                      onRestartRun?.();
                      onResume();
                    }}
                    className="wm-btn-well ff-mono cursor-pointer py-2 text-[var(--wm-silk)] hover:text-[var(--wm-mint)]"
                  >
                    ↺ RESTART
                  </button>
                  <button
                    type="button"
                    onClick={onOpenTrackLoader}
                    className="wm-btn-well ff-mono cursor-pointer py-2 text-[var(--wm-silk)] hover:text-[var(--wm-mint)]"
                  >
                    ⏏ CASSETTES [M]
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-[1px] text-[11px] font-bold tracking-[0.12em] uppercase">
                  <button
                    type="button"
                    onClick={() => setView('options')}
                    className="wm-btn-well ff-mono cursor-pointer py-2 text-[var(--wm-silk)] hover:text-[var(--wm-amber)]"
                  >
                    ≡ OPTIONS
                  </button>
                  <button
                    type="button"
                    onClick={() => setView('controls')}
                    className="wm-btn-well ff-mono cursor-pointer py-2 text-[var(--wm-silk)] hover:text-[var(--wm-amber)]"
                  >
                    ⌨ CONTROLS
                  </button>
                </div>

                {onReturnToMainMenu && (
                  <button
                    type="button"
                    onClick={onReturnToMainMenu}
                    className="wm-btn-well ff-mono w-full cursor-pointer py-2 text-[11px] font-bold tracking-[0.14em] text-[#ff8aa9] uppercase hover:text-[var(--wm-silk)]"
                  >
                    ■ EXIT TO TITLE
                  </button>
                )}
              </div>

              {/* Rigid 4-Column Hardware Service / DEV Block */}
              <div className="wm-lcd rounded-[2px] p-1.5">
                <div className="ff-mono mb-1 flex items-center justify-between px-1 text-[9px] font-bold tracking-[0.2em] text-[var(--wm-silk-dim)] uppercase">
                  <span>DEV</span>
                  <span className="opacity-65">SERVICE BUS</span>
                </div>
                <div className="wm-key-bank ff-mono grid grid-cols-4 text-[9px] font-bold">
                  <button
                    type="button"
                    onClick={onToggleDebug}
                    className="wm-btn-well cursor-pointer px-1 py-1.5 text-center whitespace-nowrap text-[var(--wm-silk-dim)] hover:text-[var(--wm-silk)]"
                  >
                    [F2] TUNING
                  </button>
                  <button
                    type="button"
                    aria-pressed={showPerfHud}
                    onClick={onTogglePerfHud}
                    className={`wm-btn-well cursor-pointer px-1 py-1.5 text-center whitespace-nowrap ${
                      showPerfHud
                        ? 'text-[var(--wm-mint)]'
                        : 'text-[var(--wm-silk-dim)] hover:text-[var(--wm-silk)]'
                    }`}
                  >
                    [F3] PERF: {showPerfHud ? 'ON' : 'OFF'}
                  </button>
                  <button
                    type="button"
                    aria-pressed={autopilotActive}
                    onClick={() => onToggleAutopilot?.()}
                    className={`wm-btn-well cursor-pointer px-1 py-1.5 text-center whitespace-nowrap ${
                      autopilotActive
                        ? 'text-[var(--wm-mint)]'
                        : 'text-[var(--wm-silk-dim)] hover:text-[var(--wm-silk)]'
                    }`}
                  >
                    [F4] AUTO: {autopilotActive ? 'ON' : 'OFF'}
                  </button>
                  <button
                    type="button"
                    onClick={onOpenInspector}
                    className="wm-btn-well cursor-pointer px-1 py-1.5 text-center whitespace-nowrap text-[var(--wm-silk-dim)] hover:text-[var(--wm-silk)]"
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
              <div className="mb-3 flex items-center justify-between border-b border-[var(--wm-line)] pb-2">
                <span className="flex items-center gap-2 text-xs font-bold tracking-[0.16em] text-[var(--wm-amber)] uppercase">
                  <WalkmanLed lit color="amber" />
                  OPTIONS
                </span>
                <button
                  type="button"
                  onClick={() => setView('main')}
                  className="wm-btn ff-mono cursor-pointer px-2.5 py-1 text-[10px] font-black tracking-wider text-[var(--wm-silk)] uppercase hover:text-[var(--wm-play)]"
                >
                  BACK [ESC]
                </button>
              </div>

              <div className="wm-key-bank flex flex-col text-xs">
                {onToggleAutoShift && (
                  <WalkmanSwitchRow
                    label="GEARBOX [G]"
                    valueLabel={autoShift ? 'AUTO-SHIFT' : 'MANUAL'}
                    active
                    accent={autoShift ? 'amber' : 'mint'}
                    onClick={onToggleAutoShift}
                  />
                )}

                <WalkmanSwitchRow
                  label="TOFU MODE [T]"
                  valueLabel={tofuMode ? `ON (×2) [${sodaSpills}]` : 'OFF'}
                  active={tofuMode}
                  accent="mint"
                  onClick={onToggleTofuMode}
                />

                <WalkmanSwitchRow
                  label="DASHBOARD CUP [V]"
                  valueLabel={SODA_SKIN_LABELS[sodaSkin]}
                  active
                  accent="amber"
                  variant="cycle"
                  onClick={onCycleSodaSkin}
                />

                <WalkmanSwitchRow
                  label="HUD [H]"
                  valueLabel={cleanHud ? 'MINIMAL' : 'FULL'}
                  active={cleanHud}
                  accent="mint"
                  onClick={onToggleCleanHud}
                />

                {onToggleCrt && (
                  <WalkmanSwitchRow
                    label="CRT SCANLINES"
                    valueLabel={crtEnabled ? 'ON' : 'OFF'}
                    active={crtEnabled}
                    accent="play"
                    onClick={onToggleCrt}
                  />
                )}
              </div>
            </div>
          )}

          {/* VIEW: CONTROLS */}
          {view === 'controls' && (
            <div className="p-4">
              <div className="mb-3 flex items-center justify-between border-b border-[var(--wm-line)] pb-2">
                <span className="flex items-center gap-2 text-xs font-bold tracking-[0.16em] text-[var(--wm-amber)] uppercase">
                  <WalkmanLed lit color="amber" />
                  CONTROLS
                </span>
                <button
                  type="button"
                  onClick={() => setView('main')}
                  className="wm-btn ff-mono cursor-pointer px-2.5 py-1 text-[10px] font-black tracking-wider text-[var(--wm-silk)] uppercase hover:text-[var(--wm-play)]"
                >
                  BACK [ESC]
                </button>
              </div>

              <div className="wm-lcd grid grid-cols-2 gap-x-3 gap-y-2 rounded-[2px] p-3 text-[11px] text-[var(--wm-silk)]">
                <div>
                  <span className="ff-mono font-bold text-[var(--wm-mint)]">WASD / ARROWS</span>{' '}
                  <span className="text-[var(--wm-silk-dim)]">Steer &amp; Gas</span>
                </div>
                <div>
                  <span className="ff-mono font-bold text-[var(--wm-play)]">S / DOWN + STEER</span>{' '}
                  <span className="text-[var(--wm-silk-dim)]">Drift</span>
                </div>
                <div>
                  <span className="ff-mono font-bold text-[var(--wm-amber)]">SPACE / SHIFT</span>{' '}
                  <span className="text-[var(--wm-silk-dim)]">Shift Up/Down</span>
                </div>
                <div>
                  <span className="ff-mono font-bold text-[var(--wm-mint)]">G</span>{' '}
                  <span className="text-[var(--wm-silk-dim)]">Auto-Shift</span>
                </div>
                <div>
                  <span className="ff-mono font-bold text-[var(--wm-amber)]">T</span>{' '}
                  <span className="text-[var(--wm-silk-dim)]">Tofu Mode</span>
                </div>
                <div>
                  <span className="ff-mono font-bold text-[var(--wm-amber)]">V</span>{' '}
                  <span className="text-[var(--wm-silk-dim)]">Cup Skin</span>
                </div>
                <div>
                  <span className="ff-mono font-bold text-[var(--wm-mint)]">C</span>{' '}
                  <span className="text-[var(--wm-silk-dim)]">Tape Widget</span>
                </div>
                <div>
                  <span className="ff-mono font-bold text-[var(--wm-mint)]">H</span>{' '}
                  <span className="text-[var(--wm-silk-dim)]">Minimal HUD</span>
                </div>
                <div className="col-span-2 border-t border-[var(--wm-line)] pt-1.5 text-center text-[10px]">
                  <span className="ff-mono font-bold text-[var(--wm-play)]">P / ESC</span>{' '}
                  <span className="text-[var(--wm-silk-dim)]">Pause / Resume</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </WalkmanModalFrame>
    </div>
  );
}
