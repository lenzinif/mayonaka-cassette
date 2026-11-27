import type { PreloadProgress } from '@src/core/AssetPreloader';
import type { SodaSkin } from '@src/entities/MelonSoda';
import { useCallback, useEffect, useRef, useState } from 'react';
import { DriverManualModal } from './DriverManualModal';
import { QuickOptionsModal } from './QuickOptionsModal';
import { CassetteReel, WalkmanLed, WalkmanScrew } from './walkman/WalkmanChrome';

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
  { id: 'drive', label: 'DRIVE', glyph: '▶', code: '01' },
  { id: 'cassette', label: 'CASSETTES', glyph: '⏏', code: '02' },
  { id: 'options', label: 'OPTIONS', glyph: '≡', code: '03' },
  { id: 'manual', label: 'GUIDE', glyph: '?', code: '04' },
] as const;

/**
 * Mayonaka Walkman Title & Transport Stage (City Pop Sleeve × Flat Matte Walkman).
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
  const navRef = useRef<HTMLElement | null>(null);

  const unlockIfNeeded = useCallback(() => {
    if (!audioUnlocked) {
      onUnlockAudio();
    }
  }, [audioUnlocked, onUnlockAudio]);

  const executeAction = useCallback(
    (index: number) => {
      unlockIfNeeded();
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
    [ready, onStartDrive, onOpenCassetteDeck, unlockIfNeeded],
  );

  // Keyboard navigation
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code !== 'Escape') {
        unlockIfNeeded();
      }

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
        const target = e.target;
        if (
          target instanceof HTMLButtonElement &&
          navRef.current &&
          !navRef.current.contains(target)
        ) {
          return;
        }
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
  }, [selectedIndex, executeAction, manualOpen, optionsOpen, unlockIfNeeded]);

  return (
    <>
      <div
        onClick={unlockIfNeeded}
        className="pointer-events-auto absolute inset-0 z-40 flex flex-col justify-between overflow-hidden px-4 py-3.5 text-[var(--wm-silk)] select-none sm:px-6 sm:py-5"
      >
        {/* Targeted edge-only framing gradients so moon, skyline & car stay vivid */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 h-[34%]"
          style={{
            background:
              'linear-gradient(180deg, rgba(9,11,18,0.74) 0%, rgba(9,11,18,0.22) 68%, rgba(9,11,18,0) 100%)',
          }}
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 bottom-0 h-[30%]"
          style={{
            background:
              'linear-gradient(0deg, rgba(9,11,18,0.82) 0%, rgba(9,11,18,0.24) 68%, rgba(9,11,18,0) 100%)',
          }}
        />

        {/* Top Editorial Hairline Tuner Bar */}
        <header className="relative z-10 flex w-full items-center gap-3 border-b border-[var(--wm-line)] pb-2">
          <div className="flex shrink-0 items-center gap-2 text-[10px] font-bold tracking-[0.2em] uppercase">
            <WalkmanLed lit color="mint" />
            <span className="ff-mono text-[var(--wm-silk)]">88.4 FM</span>
            <span className="text-[var(--wm-silk-dim)]">· TOKYO BAY</span>
          </div>

          <div
            aria-hidden="true"
            className="hidden min-w-0 flex-1 items-center gap-2 opacity-60 sm:flex"
          >
            <span className="h-[1px] flex-1 bg-[var(--wm-line)]" />
            <span className="ff-mono text-[9px] tracking-[0.24em] text-[var(--wm-silk-dim)] uppercase">
              C-60 · CrO₂
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-[1px] bg-[var(--wm-silk-dim)]" />
              <span className="h-1 w-[1px] bg-[var(--wm-silk-dim)]" />
              <span className="h-2.5 w-[1.5px] bg-[var(--wm-amber)]" />
              <span className="h-1 w-[1px] bg-[var(--wm-silk-dim)]" />
              <span className="h-2 w-[1px] bg-[var(--wm-silk-dim)]" />
            </span>
            <span className="h-[1px] flex-1 bg-[var(--wm-line)]" />
          </div>

          {!audioUnlocked ? (
            <button
              type="button"
              onClick={onUnlockAudio}
              className="wm-btn ml-auto flex shrink-0 cursor-pointer items-center gap-2 px-2.5 py-1 text-[10px] font-bold tracking-[0.16em] text-[var(--wm-silk)] uppercase sm:ml-0"
            >
              <WalkmanLed lit={false} color="play" />
              <svg
                aria-hidden="true"
                className="h-3 w-3"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#ff3b6b"
                strokeWidth="2.2"
                strokeLinecap="square"
              >
                <path d="M11 5L6 9H2v6h4l5 4V5z" />
                <path d="M22 9l-6 6M16 9l6 6" />
              </svg>
              <span className="ff-mono">SOUND</span>
            </button>
          ) : (
            <div className="wm-lcd ml-auto flex shrink-0 items-center gap-2 rounded-[2px] px-2.5 py-1 text-[10px] font-bold tracking-[0.16em] uppercase sm:ml-0">
              <WalkmanLed lit color="mint" />
              <svg
                aria-hidden="true"
                className="h-3 w-3"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#2ee2be"
                strokeWidth="2.2"
                strokeLinecap="square"
              >
                <path d="M11 5L6 9H2v6h4l5 4V5z" />
                <path d="M15.5 8.5a5 5 0 010 7" />
                <path d="M18.8 5.2a9.5 9.5 0 010 13.6" />
              </svg>
              <span className="ff-mono text-[var(--wm-mint)]">STEREO</span>
            </div>
          )}
        </header>

        {/* City Pop Sleeve Hero Title Lockup (Flat Ivory Silkscreen + Single Coral Accent) */}
        <div className="relative z-10 mt-2 flex flex-col items-center text-center">
          <h1
            className="flex items-center gap-3 whitespace-nowrap sm:gap-4"
            style={{ textShadow: '0 2px 0 #090b12' }}
          >
            <span className="text-3xl font-black tracking-[0.12em] text-[var(--wm-silk)] sm:text-4xl md:text-5xl">
              真夜中
            </span>
            <span
              aria-hidden="true"
              className="inline-block h-6 w-[2px] bg-[var(--wm-play)] sm:h-8 md:h-10"
            />
            <span className="ff-display text-3xl font-black tracking-[0.14em] text-[var(--wm-silk)] uppercase sm:text-4xl md:text-5xl">
              CASSETTE
            </span>
          </h1>
        </div>

        {/* Open Middle Spacer: Moon, Skyline, Highway & Car remain unobstructed */}
        <div className="flex-1" />

        {/* Bottom Asymmetric Walkman Control Deck */}
        <div className="relative z-10 flex items-end justify-between gap-4">
          {/* Bottom-Left: Flat Flush Walkman Membrane Transport Bank */}
          <div className="wm-shell wm-faceplate w-52 shrink-0 p-2 sm:w-56">
            <div className="mb-1.5 flex items-center justify-between border-b border-[var(--wm-line)] pb-1">
              <div className="flex items-center gap-1.5">
                <WalkmanScrew />
                <span className="ff-mono text-[8px] font-bold tracking-[0.22em] text-[var(--wm-silk-dim)] uppercase">
                  TRANSPORT
                </span>
              </div>
              <WalkmanLed lit={ready} color={ready ? 'mint' : 'amber'} />
            </div>

            <nav ref={navRef} aria-label="Main Menu" className="wm-key-bank flex flex-col">
              {MENU_ITEMS.map((item, index) => {
                const isSelected = selectedIndex === index;
                const isDriveItem = item.id === 'drive';
                const labelText =
                  isDriveItem && !ready ? `LOADING (${progress.percent}%)` : item.label;

                return (
                  <button
                    key={item.id}
                    type="button"
                    aria-disabled={isDriveItem && !ready ? true : undefined}
                    data-pressed={isSelected ? 'true' : 'false'}
                    onMouseEnter={() => setSelectedIndex(index)}
                    onFocus={() => setSelectedIndex(index)}
                    onClick={() => executeAction(index)}
                    className={`flex w-full items-center justify-between gap-2 px-2.5 py-1.5 text-left ${
                      isDriveItem && !ready ? 'cursor-wait' : 'cursor-pointer'
                    } ${
                      isDriveItem && isSelected
                        ? 'wm-btn-well wm-btn-play border-0'
                        : isSelected
                          ? 'wm-btn-well border-l-[3px] border-l-[var(--wm-mint)] bg-[#22283e] text-[var(--wm-silk)]'
                          : 'wm-btn-well border-l-[3px] border-l-transparent text-[var(--wm-silk-dim)] hover:text-[var(--wm-silk)]'
                    }`}
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <span
                        className={`ff-mono text-[10px] font-black ${
                          isSelected
                            ? isDriveItem
                              ? 'text-[var(--wm-silk)]'
                              : 'text-[var(--wm-mint)]'
                            : 'opacity-50'
                        }`}
                      >
                        {item.glyph}
                      </span>
                      <span className="ff-mono truncate text-[11px] font-bold tracking-[0.14em] uppercase sm:text-xs">
                        {labelText}
                      </span>
                    </span>

                    <span className="flex shrink-0 items-center gap-1.5">
                      <span className="ff-mono text-[9px] opacity-55">{item.code}</span>
                      <WalkmanLed
                        lit={isSelected}
                        color={isDriveItem ? 'amber' : 'mint'}
                      />
                    </span>
                  </button>
                );
              })}
            </nav>

            {!ready && (
              <div className="wm-lcd mt-1.5 h-1.5 w-full overflow-hidden rounded-[1px] p-[1px]">
                <div
                  className="wm-accent-strip h-full transition-all duration-150"
                  style={{ width: `${progress.percent}%` }}
                />
              </div>
            )}
          </div>

          {/* Center Whisper Hint */}
          <div className="hidden items-center gap-2 pb-1 text-[10px] font-semibold tracking-[0.16em] text-[#f4efe6]/65 uppercase md:flex">
            <span className="wm-lcd ff-mono rounded-[1px] px-1.5 py-0.5 text-[var(--wm-silk)]">
              ↑↓
            </span>
            <span>MOVE</span>
            <span className="opacity-40">·</span>
            <span className="wm-lcd ff-mono rounded-[1px] px-1.5 py-0.5 text-[var(--wm-silk)]">
              ENTER
            </span>
            <span>SELECT</span>
          </div>

          {/* Bottom-Right: TDK/Sony-Style Walkman Cassette Door Preview */}
          <button
            type="button"
            onClick={() => {
              unlockIfNeeded();
              onOpenCassetteDeck();
            }}
            className="wm-shell wm-faceplate group w-60 shrink-0 cursor-pointer overflow-hidden text-left transition hover:border-[var(--wm-line-hi)] focus-visible:outline-1 focus-visible:outline-[var(--wm-mint)] sm:w-72"
          >
            {/* Ruled Paper Tape Label Top Strip */}
            <div className="wm-paper-label flex items-center justify-between px-2.5 py-1 text-[10px] font-black tracking-[0.14em] text-[#131622] uppercase">
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-[var(--wm-play)]" />
                SIDE A
              </span>
              <div className="flex items-center gap-2">
                <span className="ff-mono font-bold">{Math.round(currentTrackBpm)} BPM</span>
                <span className="text-[10px] font-black text-[#131622] transition group-hover:text-[var(--wm-play)]">
                  ⏏
                </span>
              </div>
            </div>
            <div className="wm-accent-strip" />

            {/* Smoked-Acrylic Cassette Window */}
            <div className="p-2">
              <div className="wm-window flex items-center justify-between gap-2.5 rounded-[2px] px-2.5 py-2">
                <CassetteReel size={30} spinning packScale={0.82} accentColor="#2ee2be" />

                <div className="min-w-0 flex-1 text-center">
                  <div className="truncate text-xs font-extrabold tracking-tight text-[var(--wm-silk)]">
                    {currentTrackTitle}
                  </div>
                  <div className="truncate text-[10px] font-medium text-[var(--wm-silk-dim)]">
                    {currentTrackArtist}
                  </div>
                  <div
                    aria-hidden="true"
                    className="ff-mono mt-1 flex items-center justify-center gap-3 text-[7px] tracking-widest text-[var(--wm-silk-dim)]/65"
                  >
                    <span>0</span>
                    <span>·</span>
                    <span>50</span>
                    <span>·</span>
                    <span>100</span>
                  </div>
                </div>

                <CassetteReel size={30} spinning packScale={0.58} accentColor="#f5b94c" />
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
