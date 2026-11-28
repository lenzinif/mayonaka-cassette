import {
  firstDropTimeSec,
  nudgeBeatMapDownbeat,
  withAdjustedBpm,
  type BeatMap,
  type SectionRole,
} from '@src/audio/BeatMap';
import type { FunkAudioEngine } from '@src/audio/FunkAudioEngine';
import type { ImportProgress, PlaylistItem, TrackLibrary } from '@src/audio/TrackLibrary';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { WalkmanLed } from './walkman/WalkmanChrome';
import './walkman/walkman.css';

export interface TrackLoaderProps {
  open: boolean;
  library: TrackLibrary;
  audio?: FunkAudioEngine;
  onSelectTrack: (item: PlaylistItem) => void;
  onUpdateBeatMap: (contentHash: string, updated: BeatMap) => void;
  onClose: () => void;
  onRemoveTrack?: (removed: PlaylistItem, newActive: PlaylistItem) => void;
  onPreviewUnlocked?: () => void;
  onCassetteInserted?: (title: string) => void;
  isInitialSelect?: boolean;
  onStartDrive?: () => void;
  onResumeDrive?: () => void;
  /** `'modal'` centers with backdrop; `'deck'`/`'portable'` renders inline beside hardware. */
  presentation?: 'modal' | 'deck' | 'portable';
}

const SECTION_BAR_COLORS: Readonly<Record<SectionRole, string>> = {
  intro: 'bg-[#2c365e]',
  build: 'bg-[#f5b94c]',
  groove: 'bg-[#05d9e8]',
  drop: 'bg-[#ff3b6b]',
  breakdown: 'bg-[#2ee2be]',
  outro: 'bg-[#2c365e]',
};

const SECTION_BADGE_STYLES: Readonly<Record<SectionRole, string>> = {
  intro: 'bg-[#2c365e] text-[#f4efe6]',
  build: 'bg-[#f5b94c] text-[#090b12]',
  groove: 'bg-[#05d9e8] text-[#090b12]',
  drop: 'bg-[#ff3b6b] text-[#f4efe6]',
  breakdown: 'bg-[#2ee2be] text-[#090b12]',
  outro: 'bg-[#2c365e] text-[#f4efe6]',
};

function formatPreviewTime(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

/**
 * Cassette Loader, Playlist & Optional Mix Panel (`docs/UI.md §3.2–3.4 & §4.4`).
 * - NEVER auto-plays audio preview on open, import, or track click.
 * - Optional `MIX` calibration tools start collapsed by default.
 * - Mix changes sync live if preview is playing and remain silent if stopped.
 */
export function TrackLoader({
  open,
  library,
  audio,
  onSelectTrack,
  onUpdateBeatMap,
  onClose,
  onRemoveTrack,
  onPreviewUnlocked,
  onCassetteInserted,
  isInitialSelect = false,
  onStartDrive,
  onResumeDrive,
  presentation = 'modal',
}: TrackLoaderProps) {
  const [, setVersion] = useState(0);
  const [progress, setProgress] = useState<ImportProgress | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [mixOpen, setMixOpen] = useState(false);
  const [tapCount, setTapCount] = useState(0);
  const [previewPlaying, setPreviewPlaying] = useState(false);
  const [previewTimeSec, setPreviewTimeSec] = useState(0);
  const [beatInBar, setBeatInBar] = useState(0);
  const [beatPulse, setBeatPulse] = useState(0);
  const [sectionRole, setSectionRole] = useState<SectionRole>('intro');
  const [clickEnabled, setClickEnabled] = useState(() => audio?.isPreviewClickEnabled ?? false);
  const tapTimesRef = useRef<number[]>([]);
  const headingId = useId();

  useEffect(() => {
    return library.subscribe(() => setVersion((v) => v + 1));
  }, [library]);

  const syncPreviewState = useCallback(() => {
    if (!audio) return;
    const sample = audio.samplePreview();
    setPreviewPlaying(sample.isPlaying);
    setPreviewTimeSec(sample.trackTimeSec);
    setBeatInBar(sample.beatInBar);
    setBeatPulse(sample.beatPulse);
    setSectionRole(sample.sectionRole);
  }, [audio]);

  const handleTogglePreview = useCallback(async () => {
    if (!audio) return;
    await audio.togglePreview();
    if (audio.unlocked) onPreviewUnlocked?.();
    syncPreviewState();
  }, [audio, onPreviewUnlocked, syncPreviewState]);

  useEffect(() => {
    if (!open) {
      setPreviewPlaying(false);
      setIsDragging(false);
      setMixOpen(false);
      setTapCount(0);
      tapTimesRef.current.length = 0;
      return;
    }
    syncPreviewState();
  }, [open, syncPreviewState]);

  useEffect(() => {
    if (!open || !audio || !previewPlaying) return;
    let rafId = 0;
    const tick = () => {
      syncPreviewState();
      if (audio.isPreviewPlaying) {
        rafId = requestAnimationFrame(tick);
      }
    };
    rafId = requestAnimationFrame(tick);
    return () => {
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, [open, audio, previewPlaying, syncPreviewState]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;
      if (e.key === 'Escape' || e.code === 'Escape') {
        e.preventDefault();
        e.stopImmediatePropagation();
        onClose();
        return;
      }
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      ) {
        return;
      }
      if (e.code === 'Space') {
        if (e.target instanceof HTMLButtonElement) return;
        e.preventDefault();
        void handleTogglePreview();
      }
    };
    window.addEventListener('keydown', onKeyDown, { capture: true });
    return () => window.removeEventListener('keydown', onKeyDown, { capture: true });
  }, [open, onClose, handleTogglePreview]);

  // Defensive unmount cleanup so preview audio can never orphan on panel unmount
  useEffect(() => {
    return () => {
      audio?.pausePreview();
    };
  }, [audio]);

  if (!open) return null;

  const items = library.items;
  const active = library.activeItem;
  const durationSec = Math.max(0.1, active.beatMap.durationSec);
  const totalBars = Math.max(1, active.beatMap.barEnergy.length);
  const dropTimeSec = firstDropTimeSec(active.beatMap);

  const handleSeekPreview = (targetSec: number) => {
    if (!audio) return;
    audio.seekPreview(targetSec);
    syncPreviewState();
  };

  const handleToggleClick = () => {
    const next = !clickEnabled;
    setClickEnabled(next);
    audio?.setPreviewClickEnabled(next);
    syncPreviewState();
  };

  const handleFiles = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    setProgress({
      completed: 0,
      total: fileList.length,
      currentFile: fileList[0]!.name,
      fromCache: false,
    });
    try {
      const imported = await library.importFiles(fileList, (p) => setProgress({ ...p }));
      if (imported[0]) {
        audio?.pausePreview();
        onSelectTrack(imported[0]);
        onCassetteInserted?.(imported[0].beatMap.title);
        syncPreviewState();
      }
    } finally {
      window.setTimeout(() => setProgress(null), 900);
    }
  };

  const handleSelectRow = (idx: number, item: PlaylistItem) => {
    if (item.contentHash === active.contentHash) return;
    audio?.pausePreview();
    library.selectTrack(idx);
    onSelectTrack(item);
    onCassetteInserted?.(item.beatMap.title);
    syncPreviewState();
  };

  const handleRemoveTrack = (e: React.MouseEvent, idx: number, item: PlaylistItem) => {
    e.stopPropagation();
    if (items.length <= 1) return;
    const wasActive = item.contentHash === active.contentHash;
    const removed = library.removeTrack(idx);
    if (!removed) return;
    if (wasActive) {
      audio?.pausePreview();
      onSelectTrack(library.activeItem);
      onCassetteInserted?.(library.activeItem.beatMap.title);
      syncPreviewState();
    }
    onRemoveTrack?.(removed, library.activeItem);
  };

  const handleRestoreDefaults = () => {
    audio?.pausePreview();
    library.restoreDefaultPlaylist();
    onSelectTrack(library.activeItem);
    onCassetteInserted?.(library.activeItem.beatMap.title);
    syncPreviewState();
  };

  const handleTapTempo = () => {
    const now = performance.now();
    const taps = tapTimesRef.current;
    if (taps.length > 0 && now - taps[taps.length - 1]! > 2200) {
      taps.length = 0;
    }
    taps.push(now);
    if (taps.length > 8) taps.shift();
    setTapCount(taps.length);

    if (taps.length >= 3) {
      let sumIntervals = 0;
      for (let i = 1; i < taps.length; i++) {
        sumIntervals += taps[i]! - taps[i - 1]!;
      }
      const meanIntervalMs = sumIntervals / (taps.length - 1);
      if (meanIntervalMs > 200 && meanIntervalMs < 1500) {
        const tappedBpm = Math.round((60000 / meanIntervalMs) * 10) / 10;
        const updated = withAdjustedBpm(active.beatMap, tappedBpm);
        onUpdateBeatMap(active.contentHash, updated);
      }
    }
    syncPreviewState();
  };

  const progressPct = Math.max(0, Math.min(100, (previewTimeSec / durationSec) * 100));
  const dropPct =
    dropTimeSec !== null ? Math.max(0, Math.min(100, (dropTimeSec / durationSec) * 100)) : null;

  const panelContent = (
    <div
      className={`pointer-events-auto flex w-full flex-col overflow-hidden rounded-[4px] border border-[#2ee2be]/55 bg-[#0c101c]/95 text-xs text-[var(--wm-silk)] shadow-[0_16px_40px_rgba(3,5,12,0.88)] select-none ${
        presentation === 'modal'
          ? 'max-h-[90vh] max-w-[40rem]'
          : presentation === 'portable'
            ? 'max-h-[78vh] max-w-[30rem]'
            : 'max-h-[44vh] max-w-[36rem]'
      }`}
      style={{ colorScheme: 'dark' }}
      onDragOver={(e) => {
        e.preventDefault();
        setIsDragging(true);
      }}
      onDragLeave={(e) => {
        if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
        setIsDragging(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setIsDragging(false);
        void handleFiles(e.dataTransfer.files);
      }}
    >
      {/* Crisp Minimal Header */}
      <div className="flex items-center justify-between gap-2 border-b border-[var(--wm-line)] bg-[#131828] px-3.5 py-2">
        <div className="flex items-center gap-2">
          <WalkmanLed lit={previewPlaying} color={previewPlaying ? 'mint' : 'amber'} />
          <h2
            id={headingId}
            className="ff-mono text-xs font-black tracking-[0.18em] text-[#f4efe6] uppercase"
          >
            TAPES
          </h2>
          <span className="ff-mono text-[10px] text-[var(--wm-silk-dim)]">
            ({items.length})
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          {isInitialSelect && onStartDrive && (
            <button
              type="button"
              onClick={onStartDrive}
              className="wm-btn-play ff-mono cursor-pointer px-2.5 py-1 text-[10px] font-black tracking-wider uppercase"
            >
              ▶ PLAY
            </button>
          )}
          {!isInitialSelect && onResumeDrive && (
            <button
              type="button"
              onClick={onResumeDrive}
              className="wm-btn-mint ff-mono cursor-pointer px-2.5 py-1 text-[10px] font-black tracking-wider uppercase"
            >
              ▶ RESUME
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="wm-btn ff-mono cursor-pointer px-2.5 py-1 text-[10px] font-black tracking-wider text-[var(--wm-silk)] uppercase hover:text-[var(--wm-play)]"
          >
            BACK [ESC]
          </button>
        </div>
      </div>

      <div className="ff-scroll flex flex-col gap-2.5 overflow-y-auto p-3">
        {/* Dropzone + File Picker + Active Transport Row */}
        <div
          className={`wm-lcd flex flex-wrap items-center justify-between gap-2 rounded-[2px] border border-dashed px-3 py-2 transition ${
            isDragging
              ? 'border-[#2ee2be] bg-[#2ee2be]/10'
              : 'border-[#2ee2be]/35 hover:border-[#2ee2be]/65'
          }`}
        >
          <label className="flex cursor-pointer items-center gap-2 rounded-[2px] focus-within:outline-1 focus-within:outline-[#2ee2be]">
            <input
              type="file"
              multiple
              accept="audio/*"
              onChange={(e) => void handleFiles(e.target.files)}
              className="sr-only"
            />
            <span className="wm-btn-mint ff-mono rounded-[2px] px-3 py-1 text-[10px] font-black tracking-[0.14em] uppercase">
              + ADD TRACKS
            </span>
            <span className="ff-mono text-[9px] text-[var(--wm-silk-dim)] uppercase">
              MP3 · WAV · OGG · FLAC
            </span>
          </label>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => void handleTogglePreview()}
              className={`ff-mono inline-flex h-7 cursor-pointer items-center gap-1.5 px-2.5 text-[10px] font-black tracking-wider uppercase ${
                previewPlaying ? 'wm-btn-mint' : 'wm-btn-play'
              }`}
            >
              {previewPlaying ? '⏸ PAUSE' : '▶ PREVIEW'}
            </button>

            <button
              type="button"
              aria-expanded={mixOpen}
              onClick={() => setMixOpen((prev) => !prev)}
              className={`wm-btn ff-mono inline-flex h-7 cursor-pointer items-center gap-1.5 px-2.5 text-[10px] font-black tracking-wider uppercase ${
                mixOpen
                  ? 'border-[#2ee2be] text-[#2ee2be]'
                  : 'text-[var(--wm-silk-dim)] hover:text-[var(--wm-silk)]'
              }`}
            >
              {!active.beatMap.confidence.tempoStable && (
                <span
                  aria-label="Variable tempo"
                  className="inline-block h-1.5 w-1.5 rounded-full bg-[var(--wm-amber)]"
                />
              )}
              MIX
            </button>
          </div>
        </div>

        {progress && (
          <div className="ff-mono flex items-center justify-between gap-2 rounded-[2px] border border-[var(--wm-line)] bg-[#131622] px-2.5 py-1 text-[10px] text-[#2ee2be]">
            <span className="truncate">
              {progress.completed}/{progress.total}: {progress.currentFile}
            </span>
            {progress.fromCache && (
              <span className="rounded-[1px] bg-[#2ee2be] px-1.5 py-0.5 text-[9px] font-black text-[#090b12]">
                CACHED
              </span>
            )}
          </div>
        )}

        {/* Active Tape Readout */}
        <div className="wm-lcd flex items-center justify-between gap-2 rounded-[2px] px-3 py-1.5">
          <div className="min-w-0">
            <div className="truncate text-xs font-extrabold text-[var(--wm-silk)]">
              {active.beatMap.artist} — {active.beatMap.title}
            </div>
            <div className="ff-mono text-[10px] text-[var(--wm-silk-dim)]">
              {active.beatMap.bpm.toFixed(2)} BPM · {formatPreviewTime(previewTimeSec)} /{' '}
              {formatPreviewTime(durationSec)}
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-1.5">
            {active.audioBuffer === null && (
              <span className="ff-mono rounded-[1px] bg-[#1a2033] px-1.5 py-0.5 text-[9px] font-bold text-[var(--wm-silk-dim)]">
                SYNTH
              </span>
            )}
            <span
              className={`ff-mono rounded-[1px] px-1.5 py-0.5 text-[9px] font-black uppercase ${SECTION_BADGE_STYLES[sectionRole]}`}
            >
              {sectionRole}
            </span>
          </div>
        </div>

        {/* Optional Mixing & Calibration Drawer (Collapsed by Default) */}
        {mixOpen && (
          <div className="wm-lcd space-y-2 rounded-[2px] border border-[#2ee2be]/35 p-2.5">
            {/* Scrubber & Skip to Drop */}
            <div className="flex items-center gap-2">
              <div className="relative flex h-6 flex-1 items-center">
                <div className="pointer-events-none relative flex h-2.5 w-full gap-[2px] overflow-hidden rounded-[1px] bg-[#090b12]">
                  {active.beatMap.sections.map((sec, sIdx) => (
                    <div
                      key={`${sec.startBar}-${sIdx}`}
                      style={{ width: `${(sec.bars / totalBars) * 100}%` }}
                      className={`h-full ${SECTION_BAR_COLORS[sec.role]} opacity-90`}
                    />
                  ))}
                  <div
                    className="absolute inset-y-0 right-0 bg-[#090b12]/48"
                    style={{ left: `${progressPct}%` }}
                  />
                  {dropPct !== null && (
                    <div
                      className="absolute inset-y-0 w-[2px] bg-[var(--wm-silk)]"
                      style={{ left: `${dropPct}%` }}
                    />
                  )}
                </div>

                <input
                  type="range"
                  aria-label="Track preview position"
                  min={0}
                  max={durationSec}
                  step={0.05}
                  value={Math.min(durationSec, previewTimeSec)}
                  onChange={(e) => handleSeekPreview(parseFloat(e.target.value))}
                  className="ff-scrubber absolute inset-x-0 top-0"
                />
              </div>

              {dropTimeSec !== null && (
                <button
                  type="button"
                  onClick={() => handleSeekPreview(dropTimeSec)}
                  className="wm-btn ff-mono h-6 shrink-0 cursor-pointer px-2 text-[9px] font-bold text-[var(--wm-play)] uppercase"
                >
                  DROP
                </button>
              )}
            </div>

            {/* Tempo & Downbeat Controls (Coordinate silently or live with preview) */}
            <div className="ff-mono flex flex-wrap items-center justify-between gap-2 text-[10px] font-bold">
              <div className="wm-key-bank inline-flex">
                <button
                  type="button"
                  onClick={() => {
                    onUpdateBeatMap(
                      active.contentHash,
                      withAdjustedBpm(active.beatMap, active.beatMap.bpm * 0.5),
                    );
                    syncPreviewState();
                  }}
                  className="wm-btn-well cursor-pointer px-2 py-1 text-[var(--wm-silk)] hover:text-[#2ee2be]"
                >
                  ÷2
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onUpdateBeatMap(
                      active.contentHash,
                      withAdjustedBpm(active.beatMap, active.beatMap.bpm * 2),
                    );
                    syncPreviewState();
                  }}
                  className="wm-btn-well cursor-pointer px-2 py-1 text-[var(--wm-silk)] hover:text-[#2ee2be]"
                >
                  ×2
                </button>
                <button
                  type="button"
                  onClick={handleTapTempo}
                  className={`cursor-pointer px-2 py-1 font-black ${
                    tapCount > 0 ? 'wm-btn-well wm-btn-play' : 'wm-btn-well text-[var(--wm-play)]'
                  }`}
                >
                  TAP {tapCount > 0 ? `(${tapCount})` : ''}
                </button>
              </div>

              <div className="wm-key-bank inline-flex">
                <button
                  type="button"
                  onClick={() => {
                    onUpdateBeatMap(
                      active.contentHash,
                      nudgeBeatMapDownbeat(active.beatMap, -1),
                    );
                    syncPreviewState();
                  }}
                  className="wm-btn-well cursor-pointer px-2 py-1 text-[var(--wm-silk)] hover:text-[#2ee2be]"
                >
                  BEAT -1
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onUpdateBeatMap(
                      active.contentHash,
                      nudgeBeatMapDownbeat(active.beatMap, 1),
                    );
                    syncPreviewState();
                  }}
                  className="wm-btn-well cursor-pointer px-2 py-1 text-[var(--wm-silk)] hover:text-[#2ee2be]"
                >
                  BEAT +1
                </button>
              </div>

              <div className="flex items-center gap-1.5">
                <div className="flex items-center gap-1" aria-label="4-beat bar indicator">
                  {[0, 1, 2, 3].map((beat) => {
                    const isActiveBeat = previewPlaying && beatInBar === beat;
                    const scale = isActiveBeat ? 1 + beatPulse * 0.12 : 1;
                    return (
                      <span
                        key={beat}
                        style={{ transform: `scale(${scale.toFixed(3)})` }}
                        className={`inline-flex h-5 w-5 items-center justify-center rounded-[2px] border text-[9px] font-black ${
                          isActiveBeat
                            ? beat === 0
                              ? 'border-[var(--wm-play)] bg-[var(--wm-play)] text-[#fff]'
                              : 'border-[#2ee2be] bg-[#2ee2be] text-[#090b12]'
                            : 'border-[var(--wm-line)] bg-[#090b12] text-[var(--wm-silk-dim)]'
                        }`}
                      >
                        {beat + 1}
                      </span>
                    );
                  })}
                </div>
                <button
                  type="button"
                  aria-pressed={clickEnabled}
                  onClick={handleToggleClick}
                  className={`inline-flex h-6 cursor-pointer items-center gap-1 px-2 text-[9px] font-black uppercase ${
                    clickEnabled ? 'wm-btn-mint' : 'wm-btn text-[var(--wm-silk-dim)]'
                  }`}
                >
                  CLICK: {clickEnabled ? 'ON' : 'OFF'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Playlist */}
        <div>
          <div className="mb-1 flex items-center justify-between">
            <span className="ff-mono text-[9px] font-bold tracking-[0.16em] text-[var(--wm-silk-dim)] uppercase">
              PLAYLIST
            </span>
            <button
              type="button"
              onClick={handleRestoreDefaults}
              className="wm-btn ff-mono cursor-pointer px-2 py-0.5 text-[9px] font-bold text-[var(--wm-silk-dim)] uppercase hover:text-[#2ee2be]"
            >
              RESET
            </button>
          </div>

          <div className="ff-scroll wm-lcd max-h-[168px] divide-y divide-[var(--wm-line)] overflow-y-auto rounded-[2px]">
            {items.map((item, idx) => {
              const isSelected = item.contentHash === active.contentHash;
              const isRowPlaying = isSelected && previewPlaying;
              const best = library.getBestScore(item.contentHash);
              const canRemove = items.length > 1;
              const itemBars = Math.max(1, item.beatMap.barEnergy.length);

              return (
                <div
                  key={item.id}
                  className={`flex w-full items-center justify-between px-2.5 py-1.5 transition ${
                    isSelected
                      ? 'border-l-[3px] border-l-[#2ee2be] bg-[#2ee2be]/10'
                      : 'border-l-[3px] border-l-transparent hover:bg-[#171b2a]'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => handleSelectRow(idx, item)}
                    className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 text-left"
                  >
                    <span
                      className={`ff-mono w-5 shrink-0 text-[10px] font-black ${
                        isSelected ? 'text-[#2ee2be]' : 'text-[var(--wm-silk-dim)]'
                      }`}
                    >
                      {String(idx + 1).padStart(2, '0')}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[11px] font-bold text-[var(--wm-silk)]">
                        {item.beatMap.artist} — {item.beatMap.title}
                      </div>
                      <div className="mt-0.5 flex items-center gap-2 text-[9px] text-[var(--wm-silk-dim)]">
                        <span>{Math.round(item.beatMap.durationSec)}s</span>
                        {best && (
                          <span className="text-[var(--wm-amber)]">
                            {best.bestGrade} · {best.bestScore.toLocaleString()}
                          </span>
                        )}
                        <span
                          aria-hidden="true"
                          className="hidden h-[3px] w-14 shrink-0 gap-[1px] overflow-hidden rounded-[1px] opacity-85 sm:inline-flex"
                        >
                          {item.beatMap.sections.map((sec, sIdx) => (
                            <span
                              key={`${sec.startBar}-${sIdx}`}
                              style={{ width: `${(sec.bars / itemBars) * 100}%` }}
                              className={`h-full ${SECTION_BAR_COLORS[sec.role]}`}
                            />
                          ))}
                        </span>
                      </div>
                    </div>
                  </button>

                  <div className="ff-mono flex shrink-0 items-center gap-1.5 pl-2">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (isSelected) {
                          void handleTogglePreview();
                        } else {
                          audio?.pausePreview();
                          library.selectTrack(idx);
                          onSelectTrack(item);
                          onCassetteInserted?.(item.beatMap.title);
                          void audio?.startPreview(0).then(() => {
                            if (audio.unlocked) onPreviewUnlocked?.();
                            syncPreviewState();
                          });
                        }
                      }}
                      aria-label={
                        isRowPlaying
                          ? `Pause preview of ${item.beatMap.title}`
                          : `Preview ${item.beatMap.title}`
                      }
                      className={`inline-flex h-6 w-6 cursor-pointer items-center justify-center text-[10px] font-bold ${
                        isRowPlaying
                          ? 'wm-btn-mint'
                          : 'wm-btn text-[var(--wm-silk)] hover:text-[#2ee2be]'
                      }`}
                    >
                      {isRowPlaying ? '⏸' : '▶'}
                    </button>
                    <span className="w-[3.75rem] text-right text-[10px] font-bold text-[var(--wm-silk-dim)]">
                      {item.beatMap.bpm.toFixed(0)} BPM
                    </span>
                    <button
                      type="button"
                      disabled={!canRemove}
                      onClick={(e) => handleRemoveTrack(e, idx, item)}
                      aria-label={`Remove ${item.beatMap.title} from playlist`}
                      title={
                        canRemove
                          ? `Remove "${item.beatMap.title}"`
                          : 'Cannot remove the last track'
                      }
                      className={`inline-flex h-6 w-6 items-center justify-center text-[10px] font-bold ${
                        canRemove
                          ? 'wm-btn cursor-pointer text-[var(--wm-silk-dim)] hover:text-[var(--wm-play)]'
                          : 'cursor-not-allowed border border-[var(--wm-line)] bg-[#131622] text-[var(--wm-silk-dim)] opacity-35'
                      }`}
                    >
                      ✕
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );

  if (presentation !== 'modal') {
    return panelContent;
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={headingId}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="pointer-events-auto fixed inset-0 z-50 flex items-center justify-center bg-[#070911]/82 p-3 select-none sm:p-4"
    >
      {panelContent}
    </div>
  );
}
