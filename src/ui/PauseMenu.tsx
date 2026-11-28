import type { BeatMap } from '@src/audio/BeatMap';
import type { FunkAudioEngine } from '@src/audio/FunkAudioEngine';
import type { PlaylistItem, TrackLibrary } from '@src/audio/TrackLibrary';
import type { SodaSkin } from '@src/entities/MelonSoda';
import { useCallback, useEffect, useId, useRef, useState, type MouseEvent } from 'react';
import {
  COCKPIT_PRESET_CLUTTER,
  type CockpitVisibility,
} from './cockpit/cockpitSettings';
import type { VisorPhotoItem } from './cockpit/visorPhotoStore';
import { BackGuideSheet } from './components/BackGuideSheet';
import { OptionsPanel } from './components/OptionsPanel';
import { useGamepadMenuNav } from './hooks/useGamepadMenuNav';
import { TrackLoader } from './TrackLoader';
import { CassetteReel, WalkmanLed } from './walkman/WalkmanChrome';
import './walkman/walkman.css';

export interface PauseMenuProps {
  open: boolean;
  trackTitle: string;
  tofuMode: boolean;
  sodaSkin: SodaSkin;
  showPerfHud: boolean;
  autoShift: boolean;
  autopilotActive?: boolean;
  crtEnabled?: boolean;
  cockpitVisibility?: CockpitVisibility;
  visorPhotos?: readonly VisorPhotoItem[];
  library?: TrackLibrary;
  audio?: FunkAudioEngine;
  onSelectTrack?: (item: PlaylistItem) => void;
  onUpdateBeatMap?: (contentHash: string, updated: BeatMap) => void;
  onPreviewUnlocked?: () => void;
  onToggleCockpitModule?: (key: keyof CockpitVisibility) => void;
  onApplyCockpitPreset?: (preset: CockpitVisibility) => void;
  onAddVisorPhotos?: (files: readonly File[]) => void;
  onAddVisorPhoto?: (file: File) => void;
  onRemoveVisorPhoto?: (id: string) => void;
  onClearVisorPhotos?: () => void;
  initialView?: 'main' | 'options' | 'tapes' | 'guide';
  onResume: () => void;
  onRestartRun?: () => void;
  onOpenTrackLoader: () => void;
  onOpenInspector: () => void;
  onToggleDebug: () => void;
  onToggleTofuMode?: () => void;
  onCycleSodaSkin?: () => void;
  onTogglePerfHud: () => void;
  onToggleAutoShift?: () => void;
  onToggleAutopilot?: () => void;
  onToggleCrt?: () => void;
  onReturnToMainMenu?: () => void;
}

type PauseView = 'main' | 'options' | 'tapes' | 'guide';
type InsertionPhase = 'idle' | 'eject' | 'insert-start' | 'insert' | 'latch';

const PAUSE_ITEMS = [
  { id: 'resume', label: 'RESUME', hasFlip: false },
  { id: 'restart', label: 'RESTART', hasFlip: false },
  { id: 'options', label: 'OPTIONS', hasFlip: false },
  { id: 'guide', label: 'GUIDE', hasFlip: true },
  { id: 'exit', label: 'EXIT TO TITLE', hasFlip: false },
] as const;

/**
 * Right-Edge Portable Cassette Player Pause Menu (`docs/UI.md §4`).
 */
export function PauseMenu({
  open,
  trackTitle,
  tofuMode,
  sodaSkin,
  showPerfHud,
  autoShift,
  autopilotActive = false,
  crtEnabled = true,
  cockpitVisibility = COCKPIT_PRESET_CLUTTER,
  visorPhotos = [],
  library,
  audio,
  onSelectTrack,
  onUpdateBeatMap,
  onPreviewUnlocked,
  onToggleCockpitModule = () => {},
  onApplyCockpitPreset = () => {},
  onAddVisorPhotos,
  onAddVisorPhoto = () => {},
  onRemoveVisorPhoto = () => {},
  onClearVisorPhotos = () => {},
  initialView = 'main',
  onResume,
  onRestartRun,
  onOpenTrackLoader,
  onOpenInspector,
  onToggleDebug,
  onToggleTofuMode = () => {},
  onCycleSodaSkin = () => {},
  onTogglePerfHud,
  onToggleAutoShift = () => {},
  onToggleAutopilot,
  onToggleCrt = () => {},
  onReturnToMainMenu,
}: PauseMenuProps) {
  const [view, setView] = useState<PauseView>(initialView);
  const [selectedIndex, setSelectedIndex] = useState(() => (initialView === 'options' ? 2 : 0));
  const [insertionPhase, setInsertionPhase] = useState<InsertionPhase>('idle');
  const [devOpen, setDevOpen] = useState(false);
  const titleId = useId();
  const insertTimersRef = useRef<number[]>([]);
  const guideBtnRef = useRef<HTMLButtonElement | null>(null);
  const prevViewRef = useRef<PauseView>(initialView);

  const clearTimers = useCallback(() => {
    for (const id of insertTimersRef.current) {
      window.clearTimeout(id);
    }
    insertTimersRef.current.length = 0;
  }, []);

  useEffect(() => {
    return () => clearTimers();
  }, [clearTimers]);

  useEffect(() => {
    if (prevViewRef.current === 'guide' && view === 'main') {
      guideBtnRef.current?.focus();
    }
    prevViewRef.current = view;
  }, [view]);

  const triggerPortableInsertion = useCallback(() => {
    clearTimers();
    setInsertionPhase('eject');
    const t1 = window.setTimeout(() => setInsertionPhase('insert-start'), 160);
    const t2 = window.setTimeout(() => setInsertionPhase('insert'), 195);
    const t3 = window.setTimeout(() => setInsertionPhase('latch'), 480);
    const t4 = window.setTimeout(() => setInsertionPhase('idle'), 630);
    insertTimersRef.current.push(t1, t2, t3, t4);
  }, [clearTimers]);

  useEffect(() => {
    if (!open) {
      audio?.stopPreview(true, false);
      setView(initialView);
      setSelectedIndex(initialView === 'options' ? 2 : 0);
      setDevOpen(false);
    }
  }, [open, initialView, audio]);

  const openTapesDrawer = useCallback(() => {
    if (library && onSelectTrack && onUpdateBeatMap) {
      setView('tapes');
    } else {
      onOpenTrackLoader();
    }
  }, [library, onSelectTrack, onUpdateBeatMap, onOpenTrackLoader]);

  const executeItem = useCallback(
    (index: number) => {
      switch (index) {
        case 0:
          audio?.stopPreview(true, false);
          onResume();
          break;
        case 1:
          audio?.stopPreview(false, false);
          onRestartRun?.();
          onResume();
          break;
        case 2:
          audio?.stopPreview(true, true);
          setView((prev) => (prev === 'options' ? 'main' : 'options'));
          break;
        case 3:
          audio?.stopPreview(true, true);
          setView('guide');
          break;
        case 4:
          audio?.stopPreview(false, true);
          onReturnToMainMenu?.();
          break;
      }
    },
    [audio, onResume, onRestartRun, onReturnToMainMenu],
  );

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;

      if (view === 'guide' || view === 'tapes') {
        if (e.code === 'KeyP') {
          e.preventDefault();
          e.stopImmediatePropagation();
          audio?.stopPreview(true, true);
          setView('main');
        }
        return;
      }

      if (view === 'options') {
        if (e.code === 'Escape' || e.code === 'KeyP') {
          e.preventDefault();
          e.stopImmediatePropagation();
          audio?.stopPreview(true, true);
          setView('main');
        }
        return;
      }

      // Root Pause view (`view === 'main'`)
      if (e.code === 'Escape' || e.code === 'KeyP') {
        e.preventDefault();
        e.stopImmediatePropagation();
        audio?.stopPreview(true, false);
        onResume();
        return;
      }

      if (e.code === 'ArrowDown' || e.code === 'KeyS') {
        e.preventDefault();
        setSelectedIndex((prev) => (prev + 1) % PAUSE_ITEMS.length);
      } else if (e.code === 'ArrowUp' || e.code === 'KeyW') {
        e.preventDefault();
        setSelectedIndex((prev) => (prev - 1 + PAUSE_ITEMS.length) % PAUSE_ITEMS.length);
      } else if (e.code === 'Enter' || e.code === 'Space') {
        if (e.target instanceof HTMLButtonElement || e.target instanceof HTMLInputElement) return;
        e.preventDefault();
        executeItem(selectedIndex);
      }
    };
    window.addEventListener('keydown', onKeyDown, { capture: true });
    return () => window.removeEventListener('keydown', onKeyDown, { capture: true });
  }, [open, view, selectedIndex, executeItem, audio, onResume]);

  useGamepadMenuNav({
    enabled: open,
    onPrev: () => {
      if (view === 'main') {
        setSelectedIndex((prev) => (prev - 1 + PAUSE_ITEMS.length) % PAUSE_ITEMS.length);
      }
    },
    onNext: () => {
      if (view === 'main') {
        setSelectedIndex((prev) => (prev + 1) % PAUSE_ITEMS.length);
      }
    },
    onConfirm: () => {
      if (view === 'main') {
        executeItem(selectedIndex);
      }
    },
    onBack: () => {
      if (view !== 'main') {
        audio?.stopPreview(true, true);
        setView('main');
      } else {
        onResume();
      }
    },
    onStart: () => {
      if (view !== 'main') {
        audio?.stopPreview(true, true);
        setView('main');
      } else {
        onResume();
      }
    },
  });

  if (!open) return null;

  const handleBackdropClick = (e: MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) {
      if (view !== 'main') {
        audio?.stopPreview(true, true);
        setView('main');
      } else {
        onResume();
      }
    }
  };

  const isGuide = view === 'guide';
  const doorOpen =
    view === 'tapes' ||
    insertionPhase === 'eject' ||
    insertionPhase === 'insert-start' ||
    insertionPhase === 'insert';

  return (
    <div
      onClick={handleBackdropClick}
      className="pointer-events-auto fixed inset-0 z-50 flex items-center justify-end overflow-hidden bg-[#070911]/78 p-4 text-[var(--wm-silk)] select-none sm:p-8"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      <h2 id={titleId} className="sr-only">
        Paused
      </h2>

      {/* Left-Docked Sub-Panels (Shared Options or Cassette Tapes) */}
      {!isGuide && (
        <div className="mr-auto flex w-full max-w-[30rem] items-center justify-start pr-4">
          {view === 'options' && (
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
              onOpenCassettes={openTapesDrawer}
              maxHeightClass="max-h-[82vh]"
            />
          )}

          {view === 'tapes' && library && onSelectTrack && onUpdateBeatMap && (
            <TrackLoader
              open
              presentation="portable"
              library={library}
              audio={audio}
              onSelectTrack={onSelectTrack}
              onUpdateBeatMap={onUpdateBeatMap}
              onPreviewUnlocked={onPreviewUnlocked}
              onCassetteInserted={() => triggerPortableInsertion()}
              onResumeDrive={() => {
                audio?.stopPreview(true, false);
                onResume();
              }}
              onClose={() => {
                audio?.stopPreview(true, true);
                setView('main');
              }}
            />
          )}
        </div>
      )}

      {/* Persistent 3D Flippable Container: Front = Right-Edge Portable Player, Back = Handwritten Guide */}
      <div
        className={`hw-flip-scene relative flex shrink-0 items-center transition-all duration-300 ${
          isGuide ? 'mx-auto w-full max-w-[720px] justify-center' : ''
        }`}
      >
        <div
          className="hw-flip-card relative flex w-full items-center justify-center"
          data-flipped={isGuide ? 'true' : 'false'}
        >
          {/* FRONT FACE: Right-Edge Portable Cassette Player + 5 Side Keys */}
          <div
            className={`hw-flip-face flex shrink-0 items-center ${
              isGuide
                ? 'pointer-events-none absolute right-0 motion-reduce:opacity-0'
                : 'relative motion-reduce:opacity-100'
            }`}
          >
            {/* 5 Left-Adjacent Menu Labels + Mechanical Rail Buttons */}
            <nav
              aria-label="Pause Menu"
              className="flex flex-col items-end gap-4 pr-1 sm:gap-5"
            >
              {PAUSE_ITEMS.map((item, idx) => {
                const isSelected = selectedIndex === idx;
                const isActiveSub = item.id === 'options' && view === 'options';
                const lit = isSelected || isActiveSub;
                const isExit = item.id === 'exit';

                return (
                  <div key={item.id} className="flex items-center gap-2.5 sm:gap-3">
                    <button
                      ref={item.id === 'guide' ? guideBtnRef : undefined}
                      type="button"
                      onMouseEnter={() => setSelectedIndex(idx)}
                      onFocus={() => setSelectedIndex(idx)}
                      onClick={() => {
                        setSelectedIndex(idx);
                        executeItem(idx);
                      }}
                      className={`ff-display flex cursor-pointer items-center gap-2 text-right text-sm font-black tracking-[0.14em] uppercase transition sm:text-lg ${
                        lit
                          ? 'text-[#2ee2be] drop-shadow-[0_0_10px_rgba(46,226,190,0.65)]'
                          : isExit
                            ? 'text-[#f4efe6]/85 hover:text-[#ff3b6b]'
                            : 'text-[#f4efe6]/85 hover:text-[#f4efe6]'
                      }`}
                    >
                      {lit && <span aria-hidden="true">▸</span>}
                      <span>
                        {item.label}
                        {item.hasFlip ? ' ↻' : ''}
                      </span>
                      <WalkmanLed lit={lit} color="mint" />
                    </button>

                    <span
                      aria-hidden="true"
                      className={`h-[1.5px] w-4 transition sm:w-6 ${
                        lit ? 'bg-[#2ee2be]' : 'bg-[#f4efe6]/45'
                      }`}
                    />

                    <button
                      type="button"
                      aria-hidden="true"
                      tabIndex={-1}
                      data-selected={lit ? 'true' : 'false'}
                      onClick={() => {
                        setSelectedIndex(idx);
                        executeItem(idx);
                      }}
                      className="portable-side-key h-7 w-4 cursor-pointer sm:h-8 sm:w-5"
                    />
                  </div>
                );
              })}
            </nav>

            {/* Vertical Cobalt-Blue & Brushed-Silver Portable Cassette Player */}
            <div className="relative flex h-[290px] w-[184px] overflow-visible rounded-[5px] sm:h-[326px] sm:w-[208px]">
              <span
                aria-hidden="true"
                className="absolute -top-2.5 left-9 h-2.5 w-7 rounded-t-[2px] border border-[#703005] bg-[#ff7b25]"
              />
              <svg
                aria-hidden="true"
                className="pointer-events-none absolute -top-12 right-6 h-12 w-12 overflow-visible"
                viewBox="0 0 48 48"
                fill="none"
              >
                <rect x="20" y="34" width="6" height="14" rx="1" fill="#181c26" stroke="#454d61" />
                <path
                  d="M23 34 C23 16, 42 10, 44 0"
                  stroke="#121620"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                />
              </svg>

              {/* Left Brushed-Silver Rail */}
              <div className="portable-silver-rail flex w-7 shrink-0 flex-col items-center justify-between rounded-l-[5px] py-4 sm:w-8">
                <div className="flex flex-col items-center gap-1" aria-hidden="true">
                  <span className="h-1 w-3 rounded-[1px] bg-[#3b4252]" />
                  <span className="h-1 w-3 rounded-[1px] bg-[#3b4252]" />
                  <span className="h-1 w-3 rounded-[1px] bg-[#3b4252]" />
                </div>
                <span className="h-16 w-2 rounded-[1px] border border-[#3b4252] bg-[#667082]" />
                <span className="h-2.5 w-2.5 rounded-full border border-[#222733] bg-[#161a24]" />
              </div>

              {/* Cobalt-Blue Anodized Main Chassis (Original MAYONAKA Silkscreen) */}
              <div className="portable-blue-body flex flex-1 flex-col justify-between rounded-r-[5px] p-3 sm:p-3.5">
                <div>
                  <div className="ff-display text-sm font-black tracking-[0.16em] text-[#f4efe6] uppercase sm:text-base">
                    MAYONAKA
                  </div>
                  <div className="ff-mono text-[8px] font-bold tracking-[0.2em] text-[#b4d0f5] uppercase">
                    STEREO PLAYER
                  </div>
                </div>

                {/* Clickable Vertical Cassette Bay with Separate Hinged Acrylic Door */}
                <button
                  type="button"
                  onClick={openTapesDrawer}
                  aria-label="Load cassette"
                  title="Load or switch cassette"
                  className="group relative flex h-40 w-full cursor-pointer items-center justify-between gap-2 overflow-hidden rounded-[3px] border border-white/25 bg-[#090d16] p-2 text-left shadow-inner transition hover:border-[#2ee2be] sm:h-44"
                >
                  <div
                    className="cassette-insert-anim flex h-full w-full items-center justify-between gap-1.5"
                    data-phase={insertionPhase}
                  >
                    <div className="flex h-full flex-col items-center justify-around">
                      <CassetteReel size={26} spinning packScale={0.78} accentColor="#2ee2be" />
                      <div className="h-8 w-3 rounded-[1px] border border-white/15 bg-[#1a2234]" />
                      <CassetteReel size={26} spinning packScale={0.58} accentColor="#f5b94c" />
                    </div>

                    <div className="wm-paper-label flex h-full w-7 items-center justify-center rounded-[1px] py-2">
                      <span className="ff-mono max-h-32 truncate text-[9px] font-black tracking-wider text-[#131622] uppercase [writing-mode:vertical-rl]">
                        {trackTitle}
                      </span>
                    </div>
                  </div>

                  {/* Sibling Hinged Vertical Acrylic Door Overlay */}
                  <div
                    className="portable-door-vertical pointer-events-none absolute inset-0 rounded-[2px] border border-white/15 bg-gradient-to-tr from-white/8 via-transparent to-white/10"
                    data-open={doorOpen ? 'true' : 'false'}
                  />
                </button>

                <div className="flex items-center justify-between text-[9px] font-bold tracking-[0.18em] text-[#b4d0f5]">
                  <span className="ff-mono">⇧ TAPE</span>
                  <span className="h-2 w-2 rounded-full border border-white/30 bg-[#8fa8cb]" />
                </div>
              </div>
            </div>
          </div>

          {/* BACK FACE: Rear Casing + Handwritten Funky Guide */}
          <div
            className={`hw-flip-face hw-flip-back w-full ${
              !isGuide
                ? 'pointer-events-none absolute inset-0 motion-reduce:opacity-0'
                : 'relative motion-reduce:opacity-100'
            }`}
          >
            <BackGuideSheet
              variant="portable"
              active={isGuide}
              onFlipBack={() => setView('main')}
            />
          </div>
        </div>
      </div>

      {/* Subtle Bottom-Left Developer Diagnostic Corner */}
      {!isGuide && (
        <div className="fixed bottom-3 left-3 z-50 flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setDevOpen((prev) => !prev)}
            className="wm-btn ff-mono cursor-pointer px-2 py-0.5 text-[9px] font-bold text-[var(--wm-silk-dim)] opacity-55 hover:opacity-100"
          >
            DEV
          </button>
          {devOpen && (
            <div className="wm-key-bank ff-mono flex items-center text-[9px] font-bold">
              <button
                type="button"
                onClick={onToggleDebug}
                className="wm-btn-well cursor-pointer px-2 py-0.5 text-[var(--wm-silk-dim)] hover:text-[var(--wm-silk)]"
              >
                [F2] TUNING
              </button>
              <button
                type="button"
                aria-pressed={showPerfHud}
                onClick={onTogglePerfHud}
                className={`wm-btn-well cursor-pointer px-2 py-0.5 ${
                  showPerfHud ? 'text-[#2ee2be]' : 'text-[var(--wm-silk-dim)]'
                }`}
              >
                [F3] PERF
              </button>
              <button
                type="button"
                aria-pressed={autopilotActive}
                onClick={() => onToggleAutopilot?.()}
                className={`wm-btn-well cursor-pointer px-2 py-0.5 ${
                  autopilotActive ? 'text-[#2ee2be]' : 'text-[var(--wm-silk-dim)]'
                }`}
              >
                [F4] AUTO
              </button>
              <button
                type="button"
                onClick={onOpenInspector}
                className="wm-btn-well cursor-pointer px-2 py-0.5 text-[var(--wm-silk-dim)] hover:text-[var(--wm-silk)]"
              >
                BEATMAP
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
