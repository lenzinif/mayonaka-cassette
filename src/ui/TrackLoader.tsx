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
import { CassetteReel, WalkmanLed, WalkmanModalFrame } from './walkman/WalkmanChrome';

export interface TrackLoaderProps {
  open: boolean;
  library: TrackLibrary;
  audio?: FunkAudioEngine;
  onSelectTrack: (item: PlaylistItem) => void;
  onUpdateBeatMap: (contentHash: string, updated: BeatMap) => void;
  onClose: () => void;
  onRemoveTrack?: (removed: PlaylistItem, newActive: PlaylistItem) => void;
  onPreviewUnlocked?: () => void;
  isInitialSelect?: boolean;
  onStartDrive?: () => void;
  onResumeDrive?: () => void;
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
 * Mayonaka Walkman Cassette Deck & Playlist Modal (`WM-86 CASSETTE DECK`).
 * Flat matte flush keys, dual-reel tape bay, and local BeatMap calibration.
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
  isInitialSelect = false,
  onStartDrive,
  onResumeDrive,
}: TrackLoaderProps) {
  const [, setVersion] = useState(0);
  const [progress, setProgress] = useState<ImportProgress | null>(null);
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [tapCount, setTapCount] = useState(0);
  const [previewPlaying, setPreviewPlaying] = useState(false);
  const [previewTimeSec, setPreviewTimeSec] = useState(0);
  const [beatInBar, setBeatInBar] = useState(0);
  const [beatPulse, setBeatPulse] = useState(0);
  const [sectionRole, setSectionRole] = useState<SectionRole>('intro');
  const [clickEnabled, setClickEnabled] = useState(() => audio?.isPreviewClickEnabled ?? false);
  const [helpOpen, setHelpOpen] = useState(false);
  const tapTimesRef = useRef<number[]>([]);
  const openRef = useRef(open);
  openRef.current = open;
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
      setTapCount(0);
      setHelpOpen(false);
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
      if (e.code === 'Enter' || e.code === 'NumpadEnter') {
        if (e.target instanceof HTMLButtonElement) return;
        e.preventDefault();
        if (isInitialSelect) {
          (onStartDrive ?? onClose)();
        } else if (onResumeDrive) {
          onResumeDrive();
        } else {
          onClose();
        }
      } else if (e.code === 'Space') {
        if (e.target instanceof HTMLButtonElement) return;
        e.preventDefault();
        void handleTogglePreview();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, isInitialSelect, onStartDrive, onResumeDrive, onClose, handleTogglePreview]);

  if (!open) return null;

  const items = library.items;
  const active = library.activeItem;
  const durationSec = Math.max(0.1, active.beatMap.durationSec);
  const totalBars = Math.max(1, active.beatMap.barEnergy.length);
  const dropTimeSec = firstDropTimeSec(active.beatMap);

  const startPreviewFromStart = async () => {
    if (!audio) return;
    await audio.startPreview(0);
    if (audio.unlocked) onPreviewUnlocked?.();
    syncPreviewState();
  };

  const ensurePreviewPlaying = () => {
    if (!previewPlaying && audio) {
      void audio.startPreview().then(() => {
        if (audio.unlocked) onPreviewUnlocked?.();
        syncPreviewState();
      });
      syncPreviewState();
    } else {
      syncPreviewState();
    }
  };

  const handleSeekPreview = (targetSec: number) => {
    if (!audio) return;
    audio.seekPreview(targetSec);
    syncPreviewState();
  };

  const handleToggleClick = () => {
    const next = !clickEnabled;
    setClickEnabled(next);
    audio?.setPreviewClickEnabled(next);
  };

  const handleFiles = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    setSelectedFileName(
      fileList.length === 1 ? fileList[0]!.name : `${fileList.length} files selected`,
    );
    setProgress({
      completed: 0,
      total: fileList.length,
      currentFile: fileList[0]!.name,
      fromCache: false,
    });
    try {
      const imported = await library.importFiles(fileList, (p) => setProgress({ ...p }));
      if (imported[0]) {
        onSelectTrack(imported[0]);
        if (openRef.current) {
          void startPreviewFromStart();
        }
      }
    } finally {
      window.setTimeout(() => setProgress(null), 900);
    }
  };

  const handleRemoveTrack = (e: React.MouseEvent, idx: number, item: PlaylistItem) => {
    e.stopPropagation();
    if (items.length <= 1) return;
    const wasActive = item.contentHash === active.contentHash;
    const removed = library.removeTrack(idx);
    if (!removed) return;
    if (wasActive) {
      onSelectTrack(library.activeItem);
      if (previewPlaying) {
        void startPreviewFromStart();
      }
    }
    onRemoveTrack?.(removed, library.activeItem);
  };

  const handleRestoreDefaults = () => {
    library.restoreDefaultPlaylist();
    onSelectTrack(library.activeItem);
    if (previewPlaying) {
      void startPreviewFromStart();
    }
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
    ensurePreviewPlaying();
  };

  const progressPct = Math.max(0, Math.min(100, (previewTimeSec / durationSec) * 100));
  const dropPct =
    dropTimeSec !== null ? Math.max(0, Math.min(100, (dropTimeSec / durationSec) * 100)) : null;
  const supplyPackScale = 0.94 - (progressPct / 100) * 0.48;
  const takeupPackScale = 0.46 + (progressPct / 100) * 0.48;

  const headerActions = (
    <div className="wm-key-bank flex items-center">
      {isInitialSelect && onStartDrive && (
        <button
          type="button"
          onClick={onStartDrive}
          className="wm-btn-well wm-btn-play ff-mono cursor-pointer px-2.5 py-1 text-[10px] font-black tracking-wider uppercase"
        >
          DRIVE [ENTER]
        </button>
      )}
      {!isInitialSelect && onResumeDrive && (
        <button
          type="button"
          onClick={onResumeDrive}
          className="wm-btn-well wm-btn-mint ff-mono cursor-pointer px-2.5 py-1 text-[10px] font-black tracking-wider uppercase"
        >
          RESUME [ENTER]
        </button>
      )}
      <button
        type="button"
        onClick={onClose}
        className="wm-btn-well ff-mono cursor-pointer px-2.5 py-1 text-[10px] font-black tracking-wider text-[var(--wm-silk)] uppercase hover:text-[var(--wm-play)]"
      >
        BACK [ESC]
      </button>
    </div>
  );

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={headingId}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="pointer-events-auto fixed inset-0 z-50 flex items-center justify-center bg-[#070911]/84 p-3 text-xs text-[var(--wm-silk)] select-none sm:p-4"
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
      <WalkmanModalFrame
        title="CASSETTE DECK"
        jpSubtitle="カセットデッキ"
        subtitle="Your music generates the road · Stays private on your device"
        modelTag="WM-86 CASSETTE DECK"
        titleId={headingId}
        headerRight={headerActions}
        maxWidthClass="max-w-[44rem]"
        maxHeightClass="max-h-[92vh]"
      >
        <div className="ff-scroll flex flex-col gap-3 overflow-y-auto p-3.5 sm:p-4">
          {/* Cassette Insertion Slot Dropzone */}
          <div
            className={`wm-lcd rounded-[2px] border border-dashed px-3.5 py-2.5 transition ${
              isDragging
                ? 'border-[var(--wm-mint)] bg-[rgba(46,226,190,0.1)]'
                : 'border-[rgba(46,226,190,0.34)] hover:border-[rgba(46,226,190,0.62)]'
            }`}
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-2.5">
                <div
                  aria-hidden="true"
                  className="wm-shell flex h-8 w-8 shrink-0 items-center justify-center text-[var(--wm-mint)]"
                >
                  <svg
                    className="h-4 w-4"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.1"
                    strokeLinecap="square"
                  >
                    <path d="M12 15V4" />
                    <path d="M7.5 8.5L12 4l4.5 4.5" />
                    <path d="M4 17v3h16v-3" />
                  </svg>
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-bold text-[var(--wm-silk)]">
                    Drop audio files to make a new road
                  </div>
                  <p className="text-[10px] text-[var(--wm-silk-dim)]">
                    MP3 · WAV · OGG · FLAC — local analysis only
                  </p>
                </div>
              </div>

              <label className="group flex shrink-0 cursor-pointer items-center gap-2.5">
                <input
                  type="file"
                  multiple
                  accept="audio/*"
                  onChange={(e) => void handleFiles(e.target.files)}
                  className="sr-only"
                />
                <span className="hidden max-w-[140px] truncate text-[10px] text-[var(--wm-silk-dim)] sm:inline">
                  {selectedFileName ?? 'No file selected'}
                </span>
                <span className="wm-btn-mint ff-mono rounded-[2px] px-3.5 py-1.5 text-[10px] font-black tracking-[0.14em] uppercase">
                  ADD TRACKS
                </span>
              </label>
            </div>

            {progress && (
              <div className="ff-mono mt-2 flex items-center justify-between gap-2 rounded-[2px] border border-[var(--wm-line)] bg-[#131622] px-2.5 py-1.5 text-[10px] text-[var(--wm-mint)]">
                <span className="truncate">
                  Analyzing ({progress.completed}/{progress.total}):{' '}
                  <strong className="text-[var(--wm-silk)]">{progress.currentFile}</strong>
                </span>
                {progress.fromCache && (
                  <span className="shrink-0 rounded-[1px] bg-[var(--wm-mint)] px-1.5 py-0.5 text-[9px] font-black text-[#090b12]">
                    CACHED
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Active Track Smoked-Acrylic Cassette Bay */}
          <div className="wm-window overflow-hidden rounded-[2px]">
            {/* Ruled Paper Cassette Label Strip */}
            <div className="wm-paper-label flex flex-wrap items-center justify-between gap-2 px-3.5 py-2 text-[#131622]">
              <div className="flex min-w-0 items-center gap-2">
                <WalkmanLed lit={previewPlaying} color={previewPlaying ? 'mint' : 'play'} />
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5 text-[9px] font-black tracking-[0.14em] uppercase">
                    <span>LOADED · SIDE A</span>
                    {active.audioBuffer === null && (
                      <span className="rounded-[1px] bg-[#131622] px-1.5 py-[1px] text-[8px] font-bold text-[var(--wm-silk)]">
                        SYNTH
                      </span>
                    )}
                    {!active.beatMap.confidence.tempoStable && (
                      <span className="rounded-[1px] bg-[var(--wm-amber)] px-1.5 py-[1px] text-[8px] font-black text-[#131622]">
                        VARIABLE TEMPO
                      </span>
                    )}
                  </div>
                  <div className="truncate text-sm font-extrabold tracking-tight text-[#131622]">
                    {active.beatMap.artist} — {active.beatMap.title}
                  </div>
                </div>
              </div>

              {/* Recessed 4-Cell LCD Telemetry */}
              <div className="wm-lcd ff-mono grid shrink-0 grid-cols-4 divide-x divide-[var(--wm-line)] rounded-[2px] text-center">
                <div className="px-2 py-1">
                  <div className="text-[8px] font-bold tracking-widest text-[var(--wm-silk-dim)] uppercase">
                    BPM
                  </div>
                  <div className="text-[11px] font-black text-[var(--wm-amber)]">
                    {active.beatMap.bpm.toFixed(2)}
                  </div>
                </div>
                <div className="px-2 py-1">
                  <div className="text-[8px] font-bold tracking-widest text-[var(--wm-silk-dim)] uppercase">
                    1ST BEAT
                  </div>
                  <div className="text-[11px] font-bold text-[var(--wm-silk)]">
                    {active.beatMap.firstBeatOffsetSec.toFixed(3)}s
                  </div>
                </div>
                <div className="px-2 py-1">
                  <div className="text-[8px] font-bold tracking-widest text-[var(--wm-silk-dim)] uppercase">
                    BARS
                  </div>
                  <div className="text-[11px] font-bold text-[var(--wm-silk)]">
                    {active.beatMap.barEnergy.length}
                  </div>
                </div>
                <div className="px-2 py-1">
                  <div className="text-[8px] font-bold tracking-widest text-[var(--wm-silk-dim)] uppercase">
                    SYNC
                  </div>
                  <div className="text-[11px] font-black text-[var(--wm-mint)]">
                    {Math.round(active.beatMap.confidence.tempo * 100)}%
                  </div>
                </div>
              </div>
            </div>
            <div className="wm-accent-strip" />

            {!active.beatMap.confidence.tempoStable && (
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[rgba(245,185,76,0.3)] bg-[rgba(245,185,76,0.08)] px-3.5 py-1.5 text-[10px] text-[var(--wm-amber)]">
                <span>
                  Variable tempo detected — turn on the beat click and adjust with{' '}
                  <strong>TAP</strong> or <strong>BEAT -1/+1</strong>.
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setClickEnabled(true);
                    audio?.setPreviewClickEnabled(true);
                    if (!previewPlaying) {
                      void startPreviewFromStart();
                    }
                  }}
                  className="wm-btn ff-mono cursor-pointer border-[var(--wm-amber)] px-2 py-0.5 font-black text-[var(--wm-amber)]"
                >
                  CALIBRATE WITH CLICK
                </button>
              </div>
            )}

            {/* Symmetrical Walkman Cassette Window: Left Reel · Center Transport · Right Reel */}
            <div className="space-y-2.5 bg-[#090b12] px-3.5 py-3">
              <div className="flex items-center gap-3">
                <div className="hidden shrink-0 sm:flex">
                  <CassetteReel
                    size={40}
                    spinning={previewPlaying}
                    packScale={supplyPackScale}
                    accentColor={previewPlaying ? '#2ee2be' : '#ff3b6b'}
                  />
                </div>

                <div className="flex min-w-0 flex-1 flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => void handleTogglePreview()}
                      className={`ff-mono inline-flex h-7 cursor-pointer items-center gap-1.5 px-3 text-[10px] font-black tracking-wider uppercase ${
                        previewPlaying ? 'wm-btn-mint' : 'wm-btn-play'
                      }`}
                    >
                      {previewPlaying ? '⏸ PAUSE' : '▶ PLAY PREVIEW'}
                    </button>

                    <div className="wm-lcd ff-mono inline-flex h-7 items-center gap-2 rounded-[2px] px-2 text-[11px] font-semibold text-[var(--wm-silk)]">
                      <span>
                        {formatPreviewTime(previewTimeSec)}
                        <span className="mx-1 text-[var(--wm-silk-dim)]">/</span>
                        <span className="text-[var(--wm-silk-dim)]">
                          {formatPreviewTime(durationSec)}
                        </span>
                      </span>
                      <span
                        className={`rounded-[1px] px-1.5 py-[1px] text-[9px] font-black tracking-wider uppercase ${SECTION_BADGE_STYLES[sectionRole]}`}
                      >
                        {sectionRole}
                      </span>
                    </div>

                    {dropTimeSec !== null && (
                      <button
                        type="button"
                        onClick={() => {
                          if (!previewPlaying && audio) {
                            void audio.startPreview(dropTimeSec).then(() => {
                              if (audio.unlocked) onPreviewUnlocked?.();
                              syncPreviewState();
                            });
                          } else {
                            handleSeekPreview(dropTimeSec);
                          }
                        }}
                        title="Jump straight to the first drop to verify BPM and beat alignment"
                        className="wm-btn ff-mono inline-flex h-7 cursor-pointer items-center border-[rgba(255,59,107,0.45)] px-2 text-[10px] font-bold text-[var(--wm-play)] hover:text-[var(--wm-silk)]"
                      >
                        SKIP TO DROP
                      </button>
                    )}
                  </div>

                  {/* 4-Beat Bar LEDs & Metronome Click Switch */}
                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-1" aria-label="4-beat bar indicator">
                      {[0, 1, 2, 3].map((beat) => {
                        const isActiveBeat = previewPlaying && beatInBar === beat;
                        const isDownbeat = beat === 0;
                        const pulseScale = isActiveBeat ? 1 + beatPulse * 0.12 : 1;
                        return (
                          <span
                            key={beat}
                            style={{ transform: `scale(${pulseScale.toFixed(3)})` }}
                            className={`ff-mono inline-flex h-6 w-6 items-center justify-center rounded-[2px] border text-[10px] font-black transition-colors ${
                              isActiveBeat
                                ? isDownbeat
                                  ? 'border-[var(--wm-play)] bg-[var(--wm-play)] text-[var(--wm-silk)]'
                                  : 'border-[var(--wm-mint)] bg-[var(--wm-mint)] text-[#090b12]'
                                : isDownbeat
                                  ? 'border-[rgba(255,59,107,0.45)] bg-[#090b12] text-[var(--wm-play)]'
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
                      onClick={handleToggleClick}
                      aria-pressed={clickEnabled}
                      title="Audible metronome click on each beat (accented on Beat 1) to verify BPM & downbeat"
                      className={`ff-mono inline-flex h-7 cursor-pointer items-center gap-1.5 px-2 text-[10px] font-bold tracking-wider uppercase ${
                        clickEnabled
                          ? 'wm-btn-mint'
                          : 'wm-btn text-[var(--wm-silk-dim)] hover:text-[var(--wm-silk)]'
                      }`}
                    >
                      <WalkmanLed lit={clickEnabled} color="mint" />
                      BEAT CLICK: {clickEnabled ? 'ON' : 'OFF'}
                    </button>
                  </div>
                </div>

                <div className="hidden shrink-0 sm:flex">
                  <CassetteReel
                    size={40}
                    spinning={previewPlaying}
                    packScale={takeupPackScale}
                    accentColor="#f5b94c"
                  />
                </div>
              </div>

              {/* Unified Interactive Section-Colored Timeline Scrubber */}
              <div>
                <div className="relative flex h-7 items-center">
                  <div className="wm-lcd pointer-events-none relative flex h-3 w-full gap-[2px] overflow-hidden rounded-[1px] p-[1px]">
                    {active.beatMap.sections.map((sec, sIdx) => (
                      <div
                        key={`${sec.startBar}-${sIdx}`}
                        style={{ width: `${(sec.bars / totalBars) * 100}%` }}
                        className={`h-full ${SECTION_BAR_COLORS[sec.role]} opacity-90`}
                      />
                    ))}
                    <div
                      className="absolute inset-y-0 right-0 bg-[#090b12]/42"
                      style={{ left: `${progressPct}%` }}
                    />
                    {dropPct !== null && (
                      <div
                        className="absolute top-0 bottom-0 w-[2px] bg-[var(--wm-silk)]/85"
                        style={{ left: `${dropPct}%` }}
                      />
                    )}
                  </div>

                  <input
                    type="range"
                    aria-label="Track preview position"
                    aria-valuetext={`${formatPreviewTime(previewTimeSec)} of ${formatPreviewTime(durationSec)}`}
                    min={0}
                    max={durationSec}
                    step={0.05}
                    value={Math.min(durationSec, previewTimeSec)}
                    onChange={(e) => handleSeekPreview(parseFloat(e.target.value))}
                    className="ff-scrubber absolute inset-x-0 top-0"
                  />
                </div>

                {/* Section Legend & Shortcut Hint */}
                <div className="ff-mono mt-1 flex flex-wrap items-center justify-between gap-2 text-[9px] text-[var(--wm-silk-dim)]">
                  <div className="flex flex-wrap items-center gap-2.5">
                    <span className="inline-flex items-center gap-1">
                      <span className="h-2 w-2 rounded-[1px] bg-[#2c365e]" />
                      INTRO/OUTRO
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <span className="h-2 w-2 rounded-[1px] bg-[#f5b94c]" />
                      BUILD
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <span className="h-2 w-2 rounded-[1px] bg-[#ff3b6b]" />
                      DROP
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <span className="h-2 w-2 rounded-[1px] bg-[#2ee2be]" />
                      BREAKDOWN
                    </span>
                  </div>
                  <span className="hidden opacity-75 sm:inline">SPACE: PLAY / PAUSE</span>
                </div>
              </div>
            </div>

            {/* Grouped Beat Calibration Micro-Key Banks */}
            <div className="ff-mono flex flex-col gap-1.5 border-t border-[var(--wm-line)] bg-[#131622] px-3.5 py-2 text-[10px] font-bold">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="w-16 shrink-0 text-[9px] font-bold tracking-widest text-[var(--wm-silk-dim)] uppercase">
                    TEMPO
                  </span>
                  <div className="wm-key-bank inline-flex">
                    <button
                      type="button"
                      title="Halve BPM (use if auto-analysis detected double tempo)"
                      onClick={() => {
                        const updated = withAdjustedBpm(active.beatMap, active.beatMap.bpm * 0.5);
                        onUpdateBeatMap(active.contentHash, updated);
                        ensurePreviewPlaying();
                      }}
                      className="wm-btn-well cursor-pointer px-2 py-1 text-[var(--wm-silk)] hover:text-[var(--wm-mint)]"
                    >
                      ÷2 BPM
                    </button>
                    <button
                      type="button"
                      title="Double BPM (use if auto-analysis detected half tempo)"
                      onClick={() => {
                        const updated = withAdjustedBpm(active.beatMap, active.beatMap.bpm * 2);
                        onUpdateBeatMap(active.contentHash, updated);
                        ensurePreviewPlaying();
                      }}
                      className="wm-btn-well cursor-pointer px-2 py-1 text-[var(--wm-silk)] hover:text-[var(--wm-mint)]"
                    >
                      ×2 BPM
                    </button>
                    <button
                      type="button"
                      title="Tap repeatedly along with the music beat to set BPM manually"
                      onClick={handleTapTempo}
                      className={`cursor-pointer px-2.5 py-1 font-black ${
                        tapCount > 0
                          ? 'wm-btn-well wm-btn-play'
                          : 'wm-btn-well text-[var(--wm-play)] hover:text-[var(--wm-silk)]'
                      }`}
                    >
                      TAP TEMPO {tapCount > 0 ? `(${tapCount})` : ''}
                    </button>
                  </div>
                </div>

                <button
                  type="button"
                  aria-expanded={helpOpen}
                  onClick={() => setHelpOpen((prev) => !prev)}
                  title="Explain what BPM, Tap Tempo, and Beat -1 / +1 do"
                  className={`wm-btn cursor-pointer px-2 py-1 text-[10px] font-black ${
                    helpOpen
                      ? 'border-[var(--wm-amber)] text-[var(--wm-amber)]'
                      : 'text-[var(--wm-silk-dim)] hover:text-[var(--wm-silk)]'
                  }`}
                >
                  ?
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <span className="w-16 shrink-0 text-[9px] font-bold tracking-widest text-[var(--wm-silk-dim)] uppercase">
                  DOWNBEAT
                </span>
                <div className="wm-key-bank inline-flex">
                  <button
                    type="button"
                    title="Shift Beat 1 (downbeat) 1 beat earlier to align bars with the music"
                    onClick={() => {
                      const updated = nudgeBeatMapDownbeat(active.beatMap, -1);
                      onUpdateBeatMap(active.contentHash, updated);
                      ensurePreviewPlaying();
                    }}
                    className="wm-btn-well cursor-pointer px-2 py-1 text-[var(--wm-silk)] hover:text-[var(--wm-mint)]"
                  >
                    BEAT -1
                  </button>
                  <button
                    type="button"
                    title="Shift Beat 1 (downbeat) 1 beat later to align bars with the music"
                    onClick={() => {
                      const updated = nudgeBeatMapDownbeat(active.beatMap, 1);
                      onUpdateBeatMap(active.contentHash, updated);
                      ensurePreviewPlaying();
                    }}
                    className="wm-btn-well cursor-pointer px-2 py-1 text-[var(--wm-silk)] hover:text-[var(--wm-mint)]"
                  >
                    BEAT +1
                  </button>
                </div>
              </div>
            </div>

            {helpOpen && (
              <div className="border-t border-[rgba(245,185,76,0.3)] bg-[#131622] px-3.5 py-2.5 text-[10px] leading-relaxed text-[var(--wm-silk)]">
                <div>
                  <strong className="text-[var(--wm-play)]">BPM (÷2 / ×2 / TAP TEMPO):</strong> Sets
                  road speed and gear-shift tempo. Turn on{' '}
                  <strong className="text-[var(--wm-mint)]">BEAT CLICK</strong>: if the ticks feel
                  twice as fast or slow as the kick, press <strong>×2</strong> or{' '}
                  <strong>÷2</strong>, or tap along to the beat.
                </div>
                <div className="mt-1">
                  <strong className="text-[var(--wm-mint)]">1st Beat (BEAT -1 / +1):</strong>{' '}
                  Shifts which beat counts as <strong className="text-[var(--wm-play)]">Beat 1</strong>{' '}
                  so hills and drops crest with the song phrases.
                </div>
              </div>
            )}
          </div>

          {/* Stage Playlist (Cassette Spine Rack) */}
          <div>
            <div className="mb-1.5 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold tracking-[0.16em] text-[var(--wm-silk-dim)] uppercase">
                  STAGE PLAYLIST ({items.length} {items.length === 1 ? 'TRACK' : 'TRACKS'})
                </span>
                <span className="hidden text-[9px] tracking-wider text-[var(--wm-silk-dim)]/65 uppercase sm:inline">
                  · DOUBLE-CLICK TO DRIVE
                </span>
              </div>
              <button
                type="button"
                onClick={handleRestoreDefaults}
                className="wm-btn ff-mono cursor-pointer px-2 py-0.5 text-[9px] font-bold tracking-wider text-[var(--wm-silk-dim)] uppercase hover:text-[var(--wm-mint)]"
                title="Restore default playlist"
              >
                RESTORE DEFAULTS
              </button>
            </div>

            <div className="ff-scroll wm-lcd max-h-[220px] divide-y divide-[var(--wm-line)] overflow-y-auto rounded-[2px]">
              {items.map((item, idx) => {
                const isSelected = item.contentHash === active.contentHash;
                const isRowPlaying = isSelected && previewPlaying;
                const best = library.getBestScore(item.contentHash);
                const canRemove = items.length > 1;
                const itemBars = Math.max(1, item.beatMap.barEnergy.length);

                return (
                  <div
                    key={item.id}
                    className={`flex w-full items-center justify-between px-3 py-2 text-left transition ${
                      isSelected
                        ? 'border-l-[3px] border-l-[var(--wm-play)] bg-[rgba(255,59,107,0.12)] text-[var(--wm-silk)]'
                        : 'border-l-[3px] border-l-transparent text-[var(--wm-silk)] hover:bg-[#171b2a]'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        library.selectTrack(idx);
                        onSelectTrack(item);
                        void startPreviewFromStart();
                      }}
                      onDoubleClick={() => {
                        library.selectTrack(idx);
                        onSelectTrack(item);
                        if (isInitialSelect) {
                          (onStartDrive ?? onClose)();
                        } else if (onResumeDrive) {
                          onResumeDrive();
                        } else {
                          onClose();
                        }
                      }}
                      className="flex min-w-0 flex-1 cursor-pointer items-center gap-2.5 text-left focus-visible:outline-1 focus-visible:outline-[var(--wm-mint)]"
                    >
                      <span
                        className={`ff-mono w-5 shrink-0 text-[10px] font-black ${
                          isSelected ? 'text-[var(--wm-play)]' : 'text-[var(--wm-silk-dim)]'
                        }`}
                      >
                        {String(idx + 1).padStart(2, '0')}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-bold leading-snug">
                          {item.beatMap.artist} — {item.beatMap.title}
                        </div>
                        <div className="mt-0.5 flex items-center gap-2 text-[10px] text-[var(--wm-silk-dim)]">
                          <span className="truncate">
                            {item.beatMap.sections.length} sections ·{' '}
                            {Math.round(item.beatMap.durationSec)}s
                            {best
                              ? ` · BEST: ${best.bestGrade} (${best.bestScore.toLocaleString()} PTS)`
                              : ''}
                          </span>
                          {/* Mini Road-Shape Section Sparkline */}
                          <span
                            aria-hidden="true"
                            className="hidden h-[3px] w-16 shrink-0 gap-[1px] overflow-hidden rounded-[1px] opacity-85 sm:inline-flex"
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

                    <div className="ff-mono flex shrink-0 items-center gap-2 pl-2 text-right">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (isSelected) {
                            void handleTogglePreview();
                          } else {
                            library.selectTrack(idx);
                            onSelectTrack(item);
                            void startPreviewFromStart();
                          }
                        }}
                        aria-label={
                          isRowPlaying
                            ? `Pause preview of ${item.beatMap.title}`
                            : `Preview ${item.beatMap.title}`
                        }
                        title={isRowPlaying ? 'Pause preview' : 'Play preview'}
                        className={`inline-flex h-6 w-7 cursor-pointer items-center justify-center text-[10px] font-bold ${
                          isRowPlaying
                            ? 'wm-btn-mint'
                            : 'wm-btn text-[var(--wm-silk)] hover:text-[var(--wm-play)]'
                        }`}
                      >
                        {isRowPlaying ? '⏸' : '▶'}
                      </button>
                      {best && (
                        <span className="rounded-[1px] bg-[var(--wm-amber)] px-1.5 py-0.5 text-[10px] font-black text-[#131622]">
                          {best.bestGrade}
                        </span>
                      )}
                      <span
                        className={`w-[4.75rem] text-right text-[11px] font-bold ${
                          isSelected ? 'text-[var(--wm-mint)]' : 'text-[var(--wm-silk-dim)]'
                        }`}
                      >
                        {item.beatMap.bpm.toFixed(1)} BPM
                      </span>
                      <button
                        type="button"
                        disabled={!canRemove}
                        onClick={(e) => handleRemoveTrack(e, idx, item)}
                        aria-label={`Remove ${item.beatMap.title} from playlist`}
                        title={
                          canRemove
                            ? `Remove "${item.beatMap.title}" from playlist`
                            : 'Cannot remove the last remaining track'
                        }
                        className={`inline-flex h-6 w-6 items-center justify-center text-[11px] font-bold ${
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
      </WalkmanModalFrame>
    </div>
  );
}
