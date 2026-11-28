import type { BeatMap } from '@src/audio/BeatMap';
import type { FunkAudioEngine } from '@src/audio/FunkAudioEngine';
import type { PlaylistItem, TrackLibrary } from '@src/audio/TrackLibrary';
import type { PreloadProgress } from '@src/core/AssetPreloader';
import type { SodaSkin } from '@src/entities/MelonSoda';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  COCKPIT_PRESET_CLUTTER,
  type CockpitVisibility,
} from './cockpit/cockpitSettings';
import type { VisorPhotoItem } from './cockpit/visorPhotoStore';
import { BackGuideSheet } from './components/BackGuideSheet';
import { OptionsPanel } from './components/OptionsPanel';
import { useGamepadMenuNav } from './hooks/useGamepadMenuNav';
import { TrackLoader } from './TrackLoader';
import { CassetteReel } from './walkman/WalkmanChrome';
import './walkman/walkman.css';

export interface MainMenuProps {
  progress: PreloadProgress;
  ready: boolean;
  audioUnlocked: boolean;
  currentTrackTitle?: string;
  currentTrackBpm?: number;
  playlistCount?: number;
  activeTrackIndex?: number;
  library?: TrackLibrary;
  audio?: FunkAudioEngine;
  onSelectTrack?: (item: PlaylistItem) => void;
  onUpdateBeatMap?: (contentHash: string, updated: BeatMap) => void;
  onPreviewUnlocked?: () => void;
  onStartDrive: () => void;
  onOpenCassetteDeck?: () => void;
  onUnlockAudio: () => void;
  autoShift: boolean;
  onToggleAutoShift: () => void;
  tofuMode: boolean;
  onToggleTofuMode: () => void;
  sodaSkin: SodaSkin;
  onCycleSodaSkin: () => void;
  crtEnabled: boolean;
  onToggleCrt: () => void;
  cockpitVisibility?: CockpitVisibility;
  visorPhotos?: readonly VisorPhotoItem[];
  onToggleCockpitModule?: (key: keyof CockpitVisibility) => void;
  onApplyCockpitPreset?: (preset: CockpitVisibility) => void;
  onAddVisorPhotos?: (files: readonly File[]) => void;
  onAddVisorPhoto?: (file: File) => void;
  onRemoveVisorPhoto?: (id: string) => void;
  onClearVisorPhotos?: () => void;
}

type DeckSubPanel = 'none' | 'tapes' | 'options';
type InsertionPhase = 'idle' | 'eject' | 'insert-start' | 'insert' | 'latch';

const MENU_KEYS = [
  { id: 'play', label: 'PLAY', glyph: '▶' },
  { id: 'tapes', label: 'TAPES', glyph: '⏏' },
  { id: 'options', label: 'OPTIONS', glyph: '≡' },
  { id: 'guide', label: 'GUIDE', glyph: '↻' },
] as const;

function AnalogVuMeter({ level }: { level: number }) {
  const angleDeg = -34 + Math.max(0, Math.min(1, level)) * 52;
  return (
    <div className="deck-vu-well relative h-10 w-16 overflow-hidden rounded-[2px] sm:h-12 sm:w-20">
      <svg viewBox="0 0 80 48" className="h-full w-full" aria-hidden="true">
        <path
          d="M12 36 A32 32 0 0 1 68 36"
          fill="none"
          stroke="#3a2008"
          strokeWidth="1.4"
        />
        <path
          d="M54 22 A32 32 0 0 1 68 36"
          fill="none"
          stroke="#c82333"
          strokeWidth="2.2"
        />
        <text
          x="40"
          y="39"
          textAnchor="middle"
          fill="#2d1704"
          fontSize="7"
          fontWeight="bold"
          fontFamily="monospace"
        >
          VU
        </text>
        <g transform={`translate(40, 44) rotate(${angleDeg})`}>
          <line x1="0" y1="0" x2="0" y2="-32" stroke="#1b0d03" strokeWidth="1.5" />
        </g>
        <circle cx="40" cy="44" r="3" fill="#1b0d03" />
      </svg>
    </div>
  );
}

/**
 * Title Screen — Front-Loading Stereo Cassette Tape Deck (`docs/UI.md §3`).
 */
export function MainMenu({
  progress,
  ready,
  audioUnlocked,
  currentTrackTitle = 'Neon Horizon',
  currentTrackBpm = 122,
  playlistCount = 3,
  activeTrackIndex = 0,
  library,
  audio,
  onSelectTrack,
  onUpdateBeatMap,
  onPreviewUnlocked,
  onStartDrive,
  onOpenCassetteDeck,
  onUnlockAudio,
  autoShift,
  onToggleAutoShift,
  tofuMode,
  onToggleTofuMode,
  sodaSkin,
  onCycleSodaSkin,
  crtEnabled,
  onToggleCrt,
  cockpitVisibility = COCKPIT_PRESET_CLUTTER,
  visorPhotos = [],
  onToggleCockpitModule = () => {},
  onApplyCockpitPreset = () => {},
  onAddVisorPhotos,
  onAddVisorPhoto = () => {},
  onRemoveVisorPhoto = () => {},
  onClearVisorPhotos = () => {},
}: MainMenuProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [subPanel, setSubPanel] = useState<DeckSubPanel>('none');
  const [guideFlipped, setGuideFlipped] = useState(false);
  const [insertionPhase, setInsertionPhase] = useState<InsertionPhase>('idle');
  const navRef = useRef<HTMLElement | null>(null);
  const guideBtnRef = useRef<HTMLButtonElement | null>(null);
  const prevGuideFlippedRef = useRef(false);
  const insertTimersRef = useRef<number[]>([]);

  const clearInsertionTimers = useCallback(() => {
    for (const id of insertTimersRef.current) {
      window.clearTimeout(id);
    }
    insertTimersRef.current.length = 0;
  }, []);

  useEffect(() => {
    return () => clearInsertionTimers();
  }, [clearInsertionTimers]);

  useEffect(() => {
    if (prevGuideFlippedRef.current && !guideFlipped) {
      guideBtnRef.current?.focus();
    }
    prevGuideFlippedRef.current = guideFlipped;
  }, [guideFlipped]);

  const triggerCassetteInsertion = useCallback(() => {
    clearInsertionTimers();
    setInsertionPhase('eject');
    const t1 = window.setTimeout(() => setInsertionPhase('insert-start'), 160);
    const t2 = window.setTimeout(() => setInsertionPhase('insert'), 195);
    const t3 = window.setTimeout(() => setInsertionPhase('latch'), 480);
    const t4 = window.setTimeout(() => setInsertionPhase('idle'), 630);
    insertTimersRef.current.push(t1, t2, t3, t4);
  }, [clearInsertionTimers]);

  const unlockIfNeeded = useCallback(() => {
    if (!audioUnlocked) {
      onUnlockAudio();
    }
  }, [audioUnlocked, onUnlockAudio]);

  const closeSubPanel = useCallback(() => {
    audio?.stopPreview(false, true);
    setSubPanel('none');
  }, [audio]);

  const executeAction = useCallback(
    (index: number) => {
      unlockIfNeeded();
      switch (index) {
        case 0:
          if (ready) {
            audio?.stopPreview(false, false);
            onStartDrive();
          }
          break;
        case 1:
          if (library && onSelectTrack && onUpdateBeatMap) {
            setGuideFlipped(false);
            setSubPanel((prev) => {
              if (prev === 'tapes') {
                audio?.stopPreview(false, true);
                return 'none';
              }
              return 'tapes';
            });
          } else {
            onOpenCassetteDeck?.();
          }
          break;
        case 2:
          audio?.stopPreview(false, true);
          setGuideFlipped(false);
          setSubPanel((prev) => (prev === 'options' ? 'none' : 'options'));
          break;
        case 3:
          audio?.stopPreview(false, true);
          setSubPanel('none');
          setGuideFlipped(true);
          break;
      }
    },
    [ready, audio, onStartDrive, library, onSelectTrack, onUpdateBeatMap, onOpenCassetteDeck, unlockIfNeeded],
  );

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented || guideFlipped) return;

      if (subPanel !== 'none') {
        if (e.code === 'Escape') {
          e.preventDefault();
          e.stopImmediatePropagation();
          closeSubPanel();
        }
        return;
      }

      if (e.code !== 'Escape') {
        unlockIfNeeded();
      }

      if (e.code === 'ArrowRight' || e.code === 'ArrowDown' || e.code === 'KeyD' || e.code === 'KeyS') {
        e.preventDefault();
        setSelectedIndex((prev) => (prev + 1) % MENU_KEYS.length);
      } else if (e.code === 'ArrowLeft' || e.code === 'ArrowUp' || e.code === 'KeyA' || e.code === 'KeyW') {
        e.preventDefault();
        setSelectedIndex((prev) => (prev - 1 + MENU_KEYS.length) % MENU_KEYS.length);
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
  }, [selectedIndex, executeAction, guideFlipped, subPanel, closeSubPanel, unlockIfNeeded]);

  useGamepadMenuNav({
    enabled: !guideFlipped && subPanel === 'none',
    onPrev: () => setSelectedIndex((prev) => (prev - 1 + MENU_KEYS.length) % MENU_KEYS.length),
    onNext: () => setSelectedIndex((prev) => (prev + 1) % MENU_KEYS.length),
    onConfirm: () => executeAction(selectedIndex),
  });

  useGamepadMenuNav({
    enabled: guideFlipped || subPanel !== 'none',
    onPrev: () => {},
    onNext: () => {},
    onConfirm: () => {},
    onBack: () => {
      if (guideFlipped) setGuideFlipped(false);
      else closeSubPanel();
    },
  });

  const doorOpen =
    subPanel === 'tapes' ||
    insertionPhase === 'eject' ||
    insertionPhase === 'insert-start' ||
    insertionPhase === 'insert';
  const counterText = String(activeTrackIndex + 1).padStart(3, '0');
  const vuLevel = insertionPhase !== 'idle' ? 0.65 : ready ? 0.42 : 0.18;

  return (
    <div
      onClick={unlockIfNeeded}
      className="pointer-events-auto absolute inset-0 z-40 flex flex-col items-center justify-between overflow-hidden px-4 py-3 text-[var(--wm-silk)] select-none sm:px-6 sm:py-4"
    >
      {/* Edge scrims keeping center moon & coupe vivid */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-[36%]"
        style={{
          background:
            'linear-gradient(180deg, rgba(6,8,18,0.72) 0%, rgba(6,8,18,0.18) 70%, rgba(6,8,18,0) 100%)',
        }}
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 bottom-0 h-[34%]"
        style={{
          background:
            'linear-gradient(0deg, rgba(6,8,18,0.78) 0%, rgba(6,8,18,0.16) 72%, rgba(6,8,18,0) 100%)',
        }}
      />

      {/* Top Sky Area */}
      {!guideFlipped && (
        <div className="relative z-10 flex w-full flex-col items-center text-center">
          {!audioUnlocked && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onUnlockAudio();
              }}
              className="wm-btn ff-mono absolute top-0 right-0 flex cursor-pointer items-center gap-1.5 px-2.5 py-1 text-[10px] font-black tracking-[0.14em] text-[var(--wm-play)] uppercase"
            >
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-[var(--wm-play)]" />
              SOUND
            </button>
          )}

          <h1 className="flex items-center justify-center gap-2.5 whitespace-nowrap sm:gap-3.5">
            <span className="ff-chrome-title text-3xl font-black tracking-[0.08em] sm:text-5xl">
              真夜中
            </span>
            <span className="ff-display ff-chrome-title text-3xl font-black tracking-[0.08em] italic uppercase sm:text-5xl">
              CASSETTE
            </span>
          </h1>

          <div className="ff-brush-accent -mt-1 text-base tracking-[0.16em] uppercase sm:-mt-1.5 sm:text-xl">
            MIDNIGHT DRIVE
          </div>

          <p className="ff-mono mt-1 text-[10px] font-bold tracking-[0.2em] text-[#7ae7ff] uppercase sm:text-[11px]">
            {currentTrackTitle.toUpperCase()} · {Math.round(currentTrackBpm)} BPM · {playlistCount}{' '}
            {playlistCount === 1 ? 'TRACK' : 'TRACKS'}
          </p>
        </div>
      )}

      {/* Inline Sub-Panels */}
      {subPanel !== 'none' && !guideFlipped && (
        <div className="relative z-20 my-auto flex w-full justify-center px-2">
          {subPanel === 'options' && (
            <OptionsPanel
              autoShift={autoShift}
              onToggleAutoShift={onToggleAutoShift}
              tofuMode={tofuMode}
              onToggleTofuMode={onToggleTofuMode}
              sodaSkin={sodaSkin}
              onCycleSodaSkin={onCycleSodaSkin}
              crtEnabled={crtEnabled}
              onToggleCrt={onToggleCrt}
              cockpitVisibility={cockpitVisibility}
              onToggleCockpitModule={onToggleCockpitModule}
              onApplyCockpitPreset={onApplyCockpitPreset}
              visorPhotos={visorPhotos}
              onAddVisorPhotos={onAddVisorPhotos}
              onAddVisorPhoto={onAddVisorPhoto}
              onRemoveVisorPhoto={onRemoveVisorPhoto}
              onClearVisorPhotos={onClearVisorPhotos}
              onClose={closeSubPanel}
              maxHeightClass="max-h-[46vh]"
            />
          )}

          {subPanel === 'tapes' && library && onSelectTrack && onUpdateBeatMap && (
            <TrackLoader
              open
              presentation="deck"
              isInitialSelect
              library={library}
              audio={audio}
              onSelectTrack={onSelectTrack}
              onUpdateBeatMap={onUpdateBeatMap}
              onPreviewUnlocked={onPreviewUnlocked}
              onCassetteInserted={() => triggerCassetteInsertion()}
              onStartDrive={() => {
                audio?.stopPreview(false, false);
                onStartDrive();
              }}
              onClose={closeSubPanel}
            />
          )}
        </div>
      )}

      {/* Lower-Center Hero Object: 3D Flippable Front-Loading Stereo Cassette Tape Deck */}
      <div
        className={`hw-flip-scene relative z-10 w-full transition-[max-width] duration-300 ${
          guideFlipped ? 'my-auto max-w-[740px]' : 'max-w-[540px]'
        }`}
      >
        <div
          className="hw-flip-card relative w-full"
          data-flipped={guideFlipped ? 'true' : 'false'}
        >
          {/* FRONT FACE */}
          <div
            className={`hw-flip-face w-full overflow-hidden rounded-[6px] ${
              guideFlipped
                ? 'pointer-events-none absolute inset-x-0 bottom-0 motion-reduce:opacity-0'
                : 'relative motion-reduce:opacity-100'
            }`}
          >
            <div className="deck-brushed-silver rounded-t-[6px] px-3 pt-2.5 pb-2 text-[#161822]">
              <div className="flex items-center justify-between gap-3">
                <div className="hidden flex-col items-center gap-1.5 sm:flex">
                  <span className="h-3.5 w-3.5 rounded-[1px] border border-[#222733] bg-[#b4bcc8] shadow-inner" />
                  <span className="ff-mono text-[7px] font-black tracking-[0.2em] text-[#222733]">
                    真夜中
                  </span>
                </div>

                {/* Smoked-Acrylic Cassette Bay with overflow-hidden */}
                <button
                  type="button"
                  onClick={() => executeAction(1)}
                  aria-label="Open tapes drawer"
                  className="deck-bay-perspective group relative flex h-24 w-48 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-[3px] border-2 border-[#161922] bg-[#0a0c14] p-1.5 shadow-inner sm:h-28 sm:w-56"
                >
                  <div
                    className="cassette-insert-anim relative flex h-full w-full flex-col justify-between rounded-[3px] border border-[#2b3040] bg-[#171b24] p-1.5"
                    data-phase={insertionPhase}
                  >
                    <div className="wm-paper-label flex items-center justify-between rounded-[1px] px-1.5 py-0.5 text-[8px] font-black text-[#131622]">
                      <span className="rounded-[1px] bg-[#131622] px-1 text-[#faf3e0]">SIDE A</span>
                      <span className="max-w-[110px] truncate uppercase">{currentTrackTitle}</span>
                    </div>

                    <div className="flex items-center justify-around rounded-[2px] bg-[#0b0d14] py-1">
                      <CassetteReel size={26} spinning={ready} packScale={0.8} accentColor="#ff7b25" />
                      <div className="h-3 w-8 rounded-[1px] border border-white/10 bg-[#1a1f2e]" />
                      <CassetteReel size={26} spinning={ready} packScale={0.62} accentColor="#2ee2be" />
                    </div>
                  </div>

                  <div
                    className="deck-acrylic-door pointer-events-none absolute inset-x-0 bottom-0 h-[62%] rounded-b-[2px] border-t border-white/25 bg-gradient-to-b from-white/10 to-[#0c101b]/55"
                    data-open={doorOpen ? 'true' : 'false'}
                  />
                </button>

                <div className="flex flex-1 items-center justify-end gap-2 sm:gap-2.5">
                  <div className="hidden flex-col items-center gap-0.5 sm:flex">
                    <span className="rounded-[2px] border border-[#161922] bg-[#0c0e14] px-1.5 py-0.5 font-mono text-[10px] font-bold tracking-[0.2em] text-[#f4efe6]">
                      {counterText}
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <AnalogVuMeter level={vuLevel} />
                    <div className="hidden sm:block">
                      <AnalogVuMeter level={vuLevel * 0.92} />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Lower Dark Piano-Key Menu Bank: label + key wrapped inside clickable button */}
            <nav
              ref={navRef}
              aria-label="Main Menu"
              className="deck-lower-bank rounded-b-[6px] px-3 pt-2 pb-3"
            >
              <div className="grid grid-cols-4 gap-2">
                {MENU_KEYS.map((keyItem, index) => {
                  const isSelected = selectedIndex === index;
                  const isPlay = keyItem.id === 'play';
                  const displayLabel =
                    isPlay && !ready ? `LOAD ${progress.percent}%` : keyItem.label;
                  const isActivePanel =
                    (keyItem.id === 'tapes' && subPanel === 'tapes') ||
                    (keyItem.id === 'options' && subPanel === 'options');

                  return (
                    <button
                      key={keyItem.id}
                      ref={keyItem.id === 'guide' ? guideBtnRef : undefined}
                      type="button"
                      aria-disabled={isPlay && !ready ? true : undefined}
                      data-pressed={isSelected || isActivePanel ? 'true' : 'false'}
                      onMouseEnter={() => setSelectedIndex(index)}
                      onFocus={() => setSelectedIndex(index)}
                      onClick={() => executeAction(index)}
                      className={`group flex w-full flex-col items-center gap-1 focus-visible:outline-1 focus-visible:outline-[#2ee2be] ${
                        isPlay && !ready ? 'cursor-wait' : 'cursor-pointer'
                      }`}
                    >
                      <span
                        className={`ff-mono text-[10px] font-black tracking-[0.14em] uppercase sm:text-[11px] ${
                          isPlay
                            ? 'text-[#ff5d6c]'
                            : isSelected || isActivePanel
                              ? 'text-[#2ee2be]'
                              : 'text-[#d4dbe8] group-hover:text-white'
                        }`}
                      >
                        {keyItem.glyph} {displayLabel}
                      </span>

                      <span
                        aria-hidden="true"
                        data-pressed={isSelected || isActivePanel ? 'true' : 'false'}
                        className={`deck-piano-key block h-7 w-full ${
                          isPlay ? 'deck-piano-key-play' : ''
                        } ${isPlay && !ready ? 'opacity-75' : ''}`}
                      />
                    </button>
                  );
                })}
              </div>
            </nav>
          </div>

          {/* BACK FACE: Always mounted inside 3D flip card for smooth 480ms flip & reduced-motion crossfade */}
          <div
            className={`hw-flip-face hw-flip-back w-full ${
              !guideFlipped
                ? 'pointer-events-none absolute inset-0 motion-reduce:opacity-0'
                : 'relative motion-reduce:opacity-100'
            }`}
          >
            <BackGuideSheet
              variant="deck"
              active={guideFlipped}
              onFlipBack={() => setGuideFlipped(false)}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
