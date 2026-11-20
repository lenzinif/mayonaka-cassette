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
  currentTrackArtist?: string;
  currentTrackBpm?: number;
  onStartDrive: () => void;
  onOpenCassetteDeck: () => void;
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
  { id: 'drive', label: 'DRIVE' },
  { id: 'cassette', label: 'CASSETTES' },
  { id: 'options', label: 'OPTIONS' },
  { id: 'manual', label: 'GUIDE' },
] as const;

/**
 * Mayonaka Hi-Fi (Future Funk 1986) Attract-Mode Title Screen.
 * Keeps the live pixel-art sky, moon, skyline, and cruising car unobstructed in the center.
 */
export function MainMenu({
  progress,
  ready,
  audioUnlocked,
  currentTrackTitle = 'Neon Horizon',
  currentTrackArtist = 'Mayonaka FM',
  currentTrackBpm = 122,
  onStartDrive,
  onOpenCassetteDeck,
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
        className="pointer-events-auto fixed inset-0 z-40 flex flex-col justify-between overflow-hidden p-5 sm:p-7 text-[var(--ff-cream)] select-none"
      >
        {/* Targeted edge-only framing gradients so moon, skyline & car stay vivid */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 h-[34%]"
          style={{
            background:
              'linear-gradient(180deg, rgba(11,14,30,0.62) 0%, rgba(11,14,30,0.18) 65%, rgba(11,14,30,0) 100%)',
          }}
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 bottom-0 h-[28%]"
          style={{
            background:
              'linear-gradient(0deg, rgba(11,14,30,0.72) 0%, rgba(11,14,30,0.18) 65%, rgba(11,14,30,0) 100%)',
          }}
        />

        {/* Top Bar: Minimalist Broadcast Header */}
        <header className="relative z-10 flex w-full items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-[11px] font-bold tracking-[0.22em] uppercase text-[var(--ff-cream)]">
            <span
              className="inline-block h-2 w-2 rounded-full bg-[var(--ff-mint)]"
              style={{ boxShadow: '0 0 8px rgba(46, 232, 196, 0.75)' }}
            />
            <span className="ff-mono">88.4 FM</span>
            <span className="opacity-45">·</span>
            <span className="text-[10px] tracking-[0.18em] opacity-75">TOKYO BAY</span>
          </div>

          {!audioUnlocked ? (
            <button
              type="button"
              onClick={onUnlockAudio}
              className="flex cursor-pointer items-center gap-2 rounded-[2px] border border-[rgba(255,245,228,0.24)] bg-[#12172E]/85 px-2.5 py-1 text-[11px] font-bold tracking-[0.14em] text-[var(--ff-cream)] uppercase transition hover:border-[var(--ff-pink)]"
            >
              <svg
                aria-hidden="true"
                className="h-3.5 w-3.5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#FF3B7F"
                strokeWidth="2.2"
                strokeLinecap="square"
              >
                <path d="M11 5L6 9H2v6h4l5 4V5z" />
                <path d="M22 9l-6 6M16 9l6 6" />
              </svg>
              <span className="ff-mono text-[10px]">SOUND</span>
            </button>
          ) : (
            <div className="flex items-center gap-2 rounded-[2px] border border-[rgba(255,245,228,0.24)] bg-[#12172E]/85 px-2.5 py-1 text-[11px] font-bold tracking-[0.14em] text-[var(--ff-cream)] uppercase">
              <svg
                aria-hidden="true"
                className="h-3.5 w-3.5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#2EE8C4"
                strokeWidth="2.2"
                strokeLinecap="square"
              >
                <path d="M11 5L6 9H2v6h4l5 4V5z" />
                <path d="M15.5 8.5a5 5 0 010 7" />
                <path d="M18.8 5.2a9.5 9.5 0 010 13.6" />
              </svg>
              <span className="ff-mono text-[10px]">STEREO</span>
            </div>
          )}
        </header>

        {/* Upper-Sky Hero Logo Lockup */}
        <div className="relative z-10 mt-1 flex flex-col items-center text-center">
          <div className="mb-1 text-[10px] font-bold tracking-[0.42em] text-[var(--ff-gold)]">
            マヨナカ・カセット
          </div>

          <div className="relative inline-flex items-baseline gap-2.5 sm:gap-3.5">
            <span
              aria-hidden="true"
              className="ff-display pointer-events-none absolute top-[4px] left-[4px] flex items-baseline gap-2.5 whitespace-nowrap text-[var(--ff-pink)] sm:gap-3.5"
            >
              <span className="text-4xl font-black tracking-tight sm:text-5xl md:text-6xl">
                真夜中
              </span>
              <span className="text-4xl font-black italic tracking-wider sm:text-5xl md:text-6xl">
                CASSETTE
              </span>
            </span>

            <h1
              className="ff-display relative flex items-baseline gap-2.5 whitespace-nowrap sm:gap-3.5"
              style={{
                background:
                  'linear-gradient(180deg, #FFF5E4 0%, #FFF5E4 48%, #FFD166 78%, #2EE8C4 100%)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                filter: 'drop-shadow(0 2px 0 rgba(11,14,30,0.9))',
              }}
            >
              <span className="text-4xl font-black tracking-tight sm:text-5xl md:text-6xl">
                真夜中
              </span>
              <span className="text-4xl font-black italic tracking-wider sm:text-5xl md:text-6xl">
                CASSETTE
              </span>
            </h1>
          </div>

          <div className="mt-2 flex items-center gap-3">
            <span className="ff-obi-h block h-[3px] w-14 sm:w-20" />
            <span
              className="text-[11px] font-extrabold tracking-[0.45em] text-[var(--ff-cream)] uppercase sm:text-xs"
              style={{ textShadow: '0 2px 6px rgba(11,14,30,0.95)' }}
            >
              MAYONAKA CASSETTE
            </span>
            <span className="ff-obi-h block h-[3px] w-14 sm:w-20" />
          </div>
        </div>

        {/* Open Middle Spacer: Moon, Skyline, Highway & Car remain unobstructed */}
        <div className="flex-1" />

        {/* Bottom Asymmetric Stage: Left Obi Menu Rail + Whisper Key Hints + Right Mini J-Card */}
        <div className="relative z-10 flex items-end justify-between gap-4">
          {/* Bottom-Left Menu along 3-Stripe Vertical Obi Rail */}
          <div className="flex items-stretch gap-3.5">
            <div className="ff-obi-v ff-shadow-ink w-1.5 shrink-0 rounded-[2px]" />
            <nav aria-label="Main Menu" className="flex flex-col items-start gap-1.5">
              {MENU_ITEMS.map((item, index) => {
                const isSelected = selectedIndex === index;
                const isDriveItem = item.id === 'drive';
                const labelText =
                  isDriveItem && !ready ? `LOADING (${progress.percent}%)` : item.label;

                return (
                  <button
                    key={item.id}
                    type="button"
                    onMouseEnter={() => setSelectedIndex(index)}
                    onClick={() => executeAction(index)}
                    className="group cursor-pointer text-left focus:outline-none"
                  >
                    <span
                      className={`ff-skew inline-flex items-center gap-2.5 transition-all duration-120 ${
                        isSelected
                          ? 'ff-shadow-ink bg-[var(--ff-pink)] px-4 py-1.5 text-[var(--ff-cream)]'
                          : 'bg-transparent px-3 py-1 text-[#FFF5E4]/82 hover:text-[var(--ff-cream)]'
                      }`}
                    >
                      <span
                        className={`ff-unskew text-xs font-black ${
                          isSelected ? 'opacity-100' : 'opacity-0'
                        }`}
                      >
                        ▶
                      </span>
                      <span
                        className="ff-unskew ff-display text-sm font-black tracking-[0.16em] uppercase sm:text-base"
                        style={
                          isSelected
                            ? undefined
                            : { textShadow: '0 2px 8px rgba(11,14,30,0.95)' }
                        }
                      >
                        {labelText}
                      </span>
                    </span>

                    {isDriveItem && !ready && (
                      <div className="mt-1 h-[3px] w-32 overflow-hidden rounded-[2px] bg-[var(--ff-panel)]">
                        <div
                          className="ff-obi-h h-full transition-all duration-150"
                          style={{ width: `${progress.percent}%` }}
                        />
                      </div>
                    )}
                  </button>
                );
              })}
            </nav>
          </div>

          {/* Center Whisper Hint */}
          <div className="hidden items-center gap-2 pb-1 text-[10px] font-semibold tracking-[0.16em] text-[#FFF5E4]/60 uppercase md:flex">
            <span className="ff-mono rounded-[2px] border border-[rgba(255,245,228,0.22)] bg-[#0B0E1E]/65 px-1.5 py-0.5">
              ↑↓
            </span>
            <span>MOVE</span>
            <span className="opacity-40">·</span>
            <span className="ff-mono rounded-[2px] border border-[rgba(255,245,228,0.22)] bg-[#0B0E1E]/65 px-1.5 py-0.5">
              ENTER
            </span>
            <span>SELECT</span>
          </div>

          {/* Bottom-Right Tactile Mini Cassette J-Card */}
          <button
            type="button"
            onClick={() => {
              onUnlockAudio();
              onOpenCassetteDeck();
            }}
            className="ff-shadow-ink group w-56 shrink-0 cursor-pointer overflow-hidden rounded-[2px] border-2 border-[rgba(255,245,228,0.28)] bg-[#12172E]/94 text-left transition hover:-translate-y-0.5 sm:w-64"
          >
            <div className="flex items-center justify-between bg-[var(--ff-cream)] px-2.5 py-1 text-[10px] font-black tracking-[0.16em] text-[var(--ff-ink)] uppercase">
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-[var(--ff-pink)]" />
                SIDE A
              </span>
              <span className="ff-mono font-bold">{Math.round(currentTrackBpm)} BPM</span>
            </div>
            <div className="ff-obi-h h-[3px] w-full" />
            <div className="flex items-center justify-between gap-2.5 px-3 py-2.5">
              <div className="min-w-0">
                <div className="truncate text-xs font-extrabold tracking-tight text-[var(--ff-cream)] sm:text-sm">
                  {currentTrackTitle}
                </div>
                <div className="truncate text-[10px] font-medium text-[var(--ff-muted)]">
                  {currentTrackArtist}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <svg aria-hidden="true" className="ff-spin-slow h-6 w-6" viewBox="0 0 24 24" fill="none">
                  <circle
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="rgba(255,245,228,0.25)"
                    strokeWidth="2"
                    fill="#0B0E1E"
                  />
                  <circle cx="12" cy="12" r="4.5" stroke="#2EE8C4" strokeWidth="1.8" />
                  <path
                    d="M12 7.5V10M12 14V16.5M7.5 12H10M14 12H16.5"
                    stroke="#FFF5E4"
                    strokeWidth="1.5"
                  />
                </svg>
                <span className="text-[10px] font-black tracking-wider text-[var(--ff-mint)] uppercase group-hover:underline">
                  ⏏
                </span>
              </div>
            </div>
          </button>
        </div>
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
