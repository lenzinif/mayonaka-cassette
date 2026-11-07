import { APP_VERSION } from '@src/config/constants';
import type { PreloadProgress } from '@src/core/AssetPreloader';
import type { SodaSkin } from '@src/entities/MelonSoda';
import { useCallback, useEffect, useState } from 'react';
import { DriverManualModal } from './DriverManualModal';
import { QuickOptionsModal } from './QuickOptionsModal';

export interface MainMenuProps {
  progress: PreloadProgress;
  ready: boolean;
  audioUnlocked: boolean;
  currentTrackTitle?: string;
  currentTrackBpm?: number;
  onStartDrive: () => void;
  onOpenCassetteDeck: () => void;
  onOpenInspector: () => void;
  onUnlockAudio: () => void;
  // Quick options state & toggles
  autoShift: boolean;
  onToggleAutoShift: () => void;
  tofuMode: boolean;
  onToggleTofuMode: () => void;
  sodaSkin: SodaSkin;
  onCycleSodaSkin: () => void;
  cleanHud: boolean;
  onToggleCleanHud: () => void;
  crtEnabled: boolean;
  onToggleCrt: () => void;
}

const MENU_ITEMS = [
  { id: 'drive', label: 'START DRIVE // INSERT COIN', hint: 'Jump behind the wheel with current cassette' },
  { id: 'cassette', label: 'CASSETTE TAPE SELECT', hint: 'Pick bundled tape or import custom MP3/WAV' },
  { id: 'manual', label: 'HOW TO PLAY // MANUAL', hint: 'Beat-shifting, drifting, Tofu Mode, and controls' },
  { id: 'options', label: 'AUDIO & GAMEPLAY OPTIONS', hint: 'Auto-shift assist, cup skins, and CRT filter' },
  { id: 'lab', label: 'BEATMAP LAB [DEV]', hint: 'Inspect audio waveform, tempo confidence, and DSP' },
] as const;

/**
 * Authentic 1980s Retro Arcade Main Menu for Mayonaka Cassette (AGENTS.md §5 M8).
 * Replaces barebones loading strip with a fully featured Future Funk title screen.
 * Handles keyboard/mouse/gamepad navigation, manual modal, quick options, and Invariant 5 audio unlock.
 */
export function MainMenu({
  progress,
  ready,
  audioUnlocked,
  currentTrackTitle = 'Neon Horizon (Synth Fallback)',
  currentTrackBpm = 122,
  onStartDrive,
  onOpenCassetteDeck,
  onOpenInspector,
  onUnlockAudio,
  autoShift,
  onToggleAutoShift,
  tofuMode,
  onToggleTofuMode,
  sodaSkin,
  onCycleSodaSkin,
  cleanHud,
  onToggleCleanHud,
  crtEnabled,
  onToggleCrt,
}: MainMenuProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [manualOpen, setManualOpen] = useState(false);
  const [optionsOpen, setOptionsOpen] = useState(false);

  const executeAction = useCallback(
    (index: number) => {
      onUnlockAudio();
      switch (index) {
        case 0:
          if (ready) onStartDrive();
          break;
        case 1:
          onOpenCassetteDeck();
          break;
        case 2:
          setManualOpen(true);
          break;
        case 3:
          setOptionsOpen(true);
          break;
        case 4:
          onOpenInspector();
          break;
      }
    },
    [ready, onStartDrive, onOpenCassetteDeck, onOpenInspector, onUnlockAudio],
  );

  // Keyboard navigation
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      onUnlockAudio();

      if (manualOpen || optionsOpen) {
        if (e.code === 'Escape') {
          setManualOpen(false);
          setOptionsOpen(false);
        }
        return;
      }

      if (e.code === 'ArrowDown' || e.code === 'KeyS') {
        e.preventDefault();
        setSelectedIndex((prev) => (prev + 1) % MENU_ITEMS.length);
      } else if (e.code === 'ArrowUp' || e.code === 'KeyW') {
        e.preventDefault();
        setSelectedIndex((prev) => (prev - 1 + MENU_ITEMS.length) % MENU_ITEMS.length);
      } else if (e.code === 'Enter' || e.code === 'Space') {
        e.preventDefault();
        executeAction(selectedIndex);
      } else if (e.code === 'Digit1') {
        e.preventDefault();
        setSelectedIndex(0);
        executeAction(0);
      } else if (e.code === 'Digit2') {
        e.preventDefault();
        setSelectedIndex(1);
        executeAction(1);
      } else if (e.code === 'Digit3') {
        e.preventDefault();
        setSelectedIndex(2);
        executeAction(2);
      } else if (e.code === 'Digit4') {
        e.preventDefault();
        setSelectedIndex(3);
        executeAction(3);
      } else if (e.code === 'Digit5') {
        e.preventDefault();
        setSelectedIndex(4);
        executeAction(4);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [selectedIndex, executeAction, manualOpen, optionsOpen, onUnlockAudio]);

  return (
    <>
      <div
        onClick={onUnlockAudio}
        className="pointer-events-auto fixed inset-0 z-40 flex flex-col justify-between overflow-y-auto p-4 sm:p-6 md:p-8 font-mono text-white select-none bg-[#070114]/94 backdrop-blur-md transition-opacity duration-300"
      >
        {/* Background Synthwave Radial Glow */}
        <div className="pointer-events-none absolute inset-0 opacity-20 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-fuchsia-600 via-purple-950 to-transparent" />

        {/* Top Marquee Header Bar */}
        <header className="relative z-10 flex w-full flex-wrap items-center justify-between border-b border-fuchsia-500/30 pb-3 text-[11px] tracking-[0.2em] uppercase">
          <div className="flex items-center gap-2 text-cyan-300">
            <span className="inline-block h-2.5 w-2.5 rounded-full bg-cyan-400 animate-pulse" />
            <span>OUTRUN FM 88.4 // TOKYO HIGHWAY STEREO</span>
          </div>

          {/* Audio Unlocked Status Pill */}
          <div className="my-1 sm:my-0">
            {!audioUnlocked ? (
              <button
                type="button"
                onClick={onUnlockAudio}
                className="cursor-pointer rounded border border-pink-400 bg-pink-950/60 px-3 py-1 text-[10px] font-bold text-pink-300 tracking-wider transition hover:bg-pink-900/80 animate-pulse"
              >
                [ CLICK TO TUNE IN AUDIO ]
              </button>
            ) : (
              <div className="flex items-center gap-1.5 rounded border border-emerald-400/40 bg-emerald-950/40 px-3 py-1 text-[10px] font-bold text-emerald-300">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                <span>STEREO ON AIR</span>
                <span className="ml-1 inline-flex gap-0.5 items-end h-3">
                  <span className="w-0.5 bg-emerald-400 h-2 animate-[pulse_0.4s_infinite]" />
                  <span className="w-0.5 bg-cyan-400 h-3 animate-[pulse_0.6s_infinite]" />
                  <span className="w-0.5 bg-pink-400 h-1.5 animate-[pulse_0.5s_infinite]" />
                  <span className="w-0.5 bg-emerald-400 h-2.5 animate-[pulse_0.7s_infinite]" />
                </span>
              </div>
            )}
          </div>

          <div className="text-pink-400/80">
            <span>{APP_VERSION}</span>
          </div>
        </header>

        {/* Center Hero & Arcade Menu */}
        <main className="relative z-10 my-auto flex flex-col items-center text-center py-6">
          {/* Neon Logo Titles */}
          <div className="relative group">
            <h1 className="text-4xl font-black italic tracking-widest text-transparent sm:text-6xl md:text-7xl bg-clip-text bg-gradient-to-r from-pink-500 via-fuchsia-400 to-cyan-300 drop-shadow-[0_0_35px_rgba(255,42,109,0.7)] animate-pulse">
              真夜中CASSETTE
            </h1>
            <div className="mt-1 text-sm font-bold tracking-[0.55em] text-cyan-200 uppercase sm:text-xl md:text-2xl drop-shadow-[0_0_18px_rgba(5,217,232,0.6)]">
              MAYONAKA CASSETTE
            </div>
            <div className="mt-2 text-[10px] tracking-[0.3em] text-fuchsia-300/70 uppercase sm:text-xs">
              AN EMOTIONAL RETRO-FUTURISTIC HIGHWAY FLOW STATE
            </div>
          </div>

          {/* Current Tape Badge */}
          <div className="mt-4 flex items-center gap-2 rounded-full border border-fuchsia-500/30 bg-[#160530]/80 px-4 py-1.5 text-[11px] text-fuchsia-200">
            <span className="text-pink-400 font-bold">CURRENT TAPE:</span>
            <span className="truncate max-w-[220px] sm:max-w-xs text-white font-semibold">
              {currentTrackTitle}
            </span>
            <span className="text-cyan-300 tabular-nums">
              ({currentTrackBpm.toFixed(1)} BPM)
            </span>
          </div>

          {/* Vertical Arcade Menu Options */}
          <nav aria-label="Main Menu" className="mt-8 w-full max-w-md space-y-2.5">
            {MENU_ITEMS.map((item, index) => {
              const isSelected = selectedIndex === index;
              const isDriveItem = item.id === 'drive';

              return (
                <button
                  key={item.id}
                  type="button"
                  onMouseEnter={() => setSelectedIndex(index)}
                  onClick={() => executeAction(index)}
                  className={`group relative flex w-full cursor-pointer flex-col rounded-lg border-2 p-3 text-left transition-all duration-150 ${
                    isSelected
                      ? 'scale-102 border-pink-400 bg-gradient-to-r from-pink-950/90 via-fuchsia-950/90 to-cyan-950/90 shadow-[0_0_25px_rgba(255,42,109,0.5)]'
                      : 'border-fuchsia-500/30 bg-[#12032b]/80 hover:border-cyan-400/60 hover:bg-[#180538]/90'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <span
                        className={`text-xs font-black transition ${
                          isSelected ? 'text-pink-400 translate-x-0.5' : 'text-fuchsia-400/50'
                        }`}
                      >
                        {isSelected ? '▶' : `[${index + 1}]`}
                      </span>
                      <span
                        className={`text-xs sm:text-sm font-black tracking-wider uppercase transition ${
                          isSelected ? 'text-white drop-shadow-[0_0_10px_rgba(255,255,255,0.7)]' : 'text-fuchsia-200'
                        }`}
                      >
                        {isDriveItem && !ready ? `PRELOADING ASSETS... (${progress.percent}%)` : item.label}
                      </span>
                    </div>

                    {isDriveItem && ready && (
                      <span className="rounded bg-pink-500/30 px-2 py-0.5 text-[9px] font-bold tracking-wider text-pink-300 border border-pink-400/40 animate-pulse">
                        READY
                      </span>
                    )}
                  </div>

                  {/* Preloader progress bar under Drive button if still preloading */}
                  {isDriveItem && !ready ? (
                    <div className="mt-2 relative h-2 w-full overflow-hidden rounded border border-cyan-400/40 bg-[#140624]">
                      <div
                        className="h-full bg-gradient-to-r from-pink-500 via-fuchsia-500 to-cyan-400 transition-all duration-150"
                        style={{ width: `${progress.percent}%` }}
                      />
                    </div>
                  ) : (
                    <div
                      className={`mt-1 pl-5 text-[10px] tracking-wide transition ${
                        isSelected ? 'text-cyan-200/90' : 'text-fuchsia-300/50'
                      }`}
                    >
                      {item.hint}
                    </div>
                  )}
                </button>
              );
            })}
          </nav>
        </main>

        {/* Footer Bar */}
        <footer className="relative z-10 flex w-full flex-wrap items-center justify-between border-t border-fuchsia-500/30 pt-3 text-[10px] tracking-wider text-fuchsia-300/60">
          <div className="flex items-center gap-3">
            <span>[W/S / ARROWS] NAVIGATE</span>
            <span>·</span>
            <span>[ENTER / SPACE] SELECT</span>
            <span>·</span>
            <span>[1-5] QUICK JUMP</span>
          </div>

          <div className="my-1 sm:my-0 text-cyan-300/80">
            <span>100% LOCAL DSP · ZERO CLOUD UPLOADS</span>
          </div>

          <div>
            <span>INSPIRED BY YU SUZUKI &amp; 80s FUTURE FUNK</span>
          </div>
        </footer>
      </div>

      {/* Driver's Manual Modal */}
      <DriverManualModal open={manualOpen} onClose={() => setManualOpen(false)} />

      {/* Quick Options Modal */}
      <QuickOptionsModal
        open={optionsOpen}
        onClose={() => setOptionsOpen(false)}
        autoShift={autoShift}
        onToggleAutoShift={onToggleAutoShift}
        tofuMode={tofuMode}
        onToggleTofuMode={onToggleTofuMode}
        sodaSkin={sodaSkin}
        onCycleSodaSkin={onCycleSodaSkin}
        cleanHud={cleanHud}
        onToggleCleanHud={onToggleCleanHud}
        crtEnabled={crtEnabled}
        onToggleCrt={onToggleCrt}
      />
    </>
  );
}
