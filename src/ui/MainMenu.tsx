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
  { id: 'drive', label: 'START DRIVE' },
  { id: 'cassette', label: 'SELECT TRACK' },
  { id: 'options', label: 'OPTIONS' },
  { id: 'manual', label: 'CONTROLS & GUIDE' },
] as const;

/**
 * Authentic 1980s Retro Arcade Main Menu for Mayonaka Cassette.
 * Attract-mode title screen revealing the live 3D synthwave road in the background.
 * Handles keyboard/mouse navigation, manual modal, quick options, and Invariant 5 audio unlock.
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
          setOptionsOpen(true);
          break;
        case 3:
          setManualOpen(true);
          break;
      }
    },
    [ready, onStartDrive, onOpenCassetteDeck, onUnlockAudio],
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
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [selectedIndex, executeAction, manualOpen, optionsOpen, onUnlockAudio]);

  return (
    <>
      <div
        onClick={onUnlockAudio}
        className="pointer-events-auto fixed inset-0 z-40 flex flex-col justify-between overflow-y-auto p-4 sm:p-6 md:p-8 font-mono text-white select-none bg-gradient-to-b from-[#060112]/80 via-[#060112]/40 to-[#060112]/88 transition-opacity duration-300"
      >
        {/* Top Header Bar */}
        <header className="relative z-10 flex w-full flex-wrap items-center justify-between border-b border-fuchsia-500/30 pb-3 text-[11px] tracking-[0.2em] uppercase">
          <div className="flex items-center gap-2 text-cyan-300">
            <span className="inline-block h-2.5 w-2.5 rounded-full bg-cyan-400 animate-pulse" />
            <span>OUTRUN FM 88.4</span>
          </div>

          {/* Audio Unlocked Status Pill + Version */}
          <div className="my-1 sm:my-0 flex items-center gap-3">
            {!audioUnlocked ? (
              <button
                type="button"
                onClick={onUnlockAudio}
                className="cursor-pointer rounded border border-pink-400 bg-pink-950/60 px-3 py-1 text-[10px] font-bold text-pink-300 tracking-wider transition hover:bg-pink-900/80 animate-pulse"
              >
                [ TUNE IN AUDIO ]
              </button>
            ) : (
              <div className="flex items-center gap-1.5 rounded border border-emerald-400/40 bg-emerald-950/40 px-2.5 py-0.5 text-[10px] font-bold text-emerald-300">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                <span>STEREO ON AIR</span>
              </div>
            )}
            <div className="text-pink-400/80 text-[10px] tracking-wider">
              <span>{APP_VERSION}</span>
            </div>
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
          </div>

          {/* Interactive Cassette Slot Button */}
          <button
            type="button"
            onClick={() => {
              onUnlockAudio();
              onOpenCassetteDeck();
            }}
            className="mt-4 flex cursor-pointer items-center gap-2 rounded-full border border-fuchsia-500/30 bg-[#160530]/80 px-4 py-1.5 text-[11px] text-fuchsia-200 transition hover:border-pink-400 hover:bg-[#200840] hover:text-white"
          >
            <span className="rounded bg-pink-500/20 px-1.5 py-0.5 text-[9px] font-bold text-pink-300 border border-pink-400/40">
              TAPE
            </span>
            <span className="truncate max-w-[200px] sm:max-w-xs text-white font-semibold">
              {currentTrackTitle}
            </span>
            <span className="text-cyan-300 tabular-nums">
              {currentTrackBpm.toFixed(1)} BPM
            </span>
            <span className="text-[10px] text-fuchsia-400 font-bold ml-1">
              [CHANGE ▸]
            </span>
          </button>

          {/* Vertical 4-Item Arcade Menu */}
          <nav aria-label="Main Menu" className="mt-8 w-full max-w-sm space-y-2">
            {MENU_ITEMS.map((item, index) => {
              const isSelected = selectedIndex === index;
              const isDriveItem = item.id === 'drive';

              return (
                <button
                  key={item.id}
                  type="button"
                  onMouseEnter={() => setSelectedIndex(index)}
                  onClick={() => executeAction(index)}
                  className={`group relative flex w-full cursor-pointer flex-col rounded border-2 px-3.5 py-2.5 text-left transition-all duration-150 ${
                    isSelected
                      ? 'scale-102 border-pink-400 bg-gradient-to-r from-pink-950/90 via-fuchsia-950/90 to-cyan-950/90 shadow-[0_0_20px_rgba(255,42,109,0.4)]'
                      : 'border-fuchsia-500/30 bg-[#12032b]/80 hover:border-cyan-400/60 hover:bg-[#180538]/90'
                  }`}
                >
                  <div className="flex w-full items-center justify-between">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span
                        className={`text-xs font-black transition ${
                          isSelected ? 'text-pink-400 translate-x-0.5' : 'text-fuchsia-400/40'
                        }`}
                      >
                        {isSelected ? '▶' : `[${index + 1}]`}
                      </span>
                      <span
                        className={`text-xs sm:text-sm font-black tracking-wider uppercase truncate transition ${
                          isSelected ? 'text-white drop-shadow-[0_0_8px_rgba(255,255,255,0.7)]' : 'text-fuchsia-200'
                        }`}
                      >
                        {isDriveItem && !ready ? `LOADING ASSETS... (${progress.percent}%)` : item.label}
                      </span>
                    </div>

                    {isDriveItem && ready && (
                      <span className="rounded bg-pink-500/30 px-2 py-0.5 text-[9px] font-bold tracking-wider text-pink-300 border border-pink-400/40 animate-pulse">
                        READY
                      </span>
                    )}
                  </div>

                  {/* Slim progress bar under Drive button if preloading */}
                  {isDriveItem && !ready && (
                    <div className="mt-2 h-1.5 w-full overflow-hidden rounded bg-[#140624] border border-cyan-400/30">
                      <div
                        className="h-full bg-gradient-to-r from-pink-500 via-fuchsia-500 to-cyan-400 transition-all duration-150"
                        style={{ width: `${progress.percent}%` }}
                      />
                    </div>
                  )}
                </button>
              );
            })}
          </nav>
        </main>

        {/* Footer Bar */}
        <footer className="relative z-10 flex w-full flex-wrap items-center justify-between border-t border-fuchsia-500/30 pt-3 text-[10px] tracking-wider text-fuchsia-300/60">
          <div className="flex items-center gap-2 sm:gap-3">
            <span>[W/S] NAVIGATE</span>
            <span>·</span>
            <span>[ENTER] SELECT</span>
          </div>

          <div>
            <button
              type="button"
              onClick={onOpenInspector}
              className="cursor-pointer text-[10px] tracking-wider text-fuchsia-400/60 hover:text-cyan-300 transition uppercase"
            >
              BEATMAP LAB [DEV]
            </button>
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
