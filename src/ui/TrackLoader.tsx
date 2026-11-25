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
  intro: 'bg-[#2C365E]',
  build: 'bg-[#FFD166]',
  groove: 'bg-[#05D9E8]',
  drop: 'bg-[#FF3B7F]',
  breakdown: 'bg-[#2EE8C4]',
  outro: 'bg-[#2C365E]',
};

const SECTION_BADGE_STYLES: Readonly<Record<SectionRole, string>> = {
  intro: 'bg-[#2C365E] text-[#FFF5E4]',
  build: 'bg-[#FFD166] text-[#0B0E1E]',
  groove: 'bg-[#05D9E8] text-[#0B0E1E]',
  drop: 'bg-[#FF3B7F] text-[#FFF5E4]',
  breakdown: 'bg-[#2EE8C4] text-[#0B0E1E]',
  outro: 'bg-[#2C365E] text-[#FFF5E4]',
};

function formatPreviewTime(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

/**
 * Mayonaka Hi-Fi Cassette Deck & Playlist Modal.
 * Local audio import, preview transport, Tap Tempo / ÷2 / ×2 / Beat nudge calibration.
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
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      ) {
        return;
      }
      if (e.code === 'Enter' || e.code === 'NumpadEnter') {
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
      } else if (e.key === 'Escape' || e.code === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
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

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={headingId}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="pointer-events-auto fixed inset-0 z-50 flex items-center justify-center bg-[#0B0E1E]/84 p-3 text-xs text-[var(--ff-cream)] select-none sm:p-4"
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
      <div className="ff-shadow-ink flex max-h-[92vh] w-full max-w-[44rem] overflow-hidden rounded-[2px] border-2 border-[var(--ff-cream)] bg-[var(--ff-panel)]">
        {/* Vertical 3-Stripe Obi Spine */}
        <div className="ff-obi-v w-2.5 shrink-0" />

        <div className="flex min-w-0 flex-1 flex-col">
          {/* Cream J-Card Header */}
          <div className="flex items-center justify-between gap-2 bg-[var(--ff-cream)] px-4 py-2.5 text-[var(--ff-ink)]">
            <div className="min-w-0">
              <div className="flex items-baseline gap-2">
                <h2
                  id={headingId}
                  className="ff-display text-base font-black italic tracking-wider uppercase"
                >
                  CASSETTE DECK
                </h2>
                <span className="hidden text-[10px] font-bold tracking-[0.18em] opacity-60 sm:inline">
                  カセットデッキ
                </span>
              </div>
              <div className="truncate text-[10px] font-semibold opacity-75">
                Your music generates the road · Stays private on your device
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              {isInitialSelect && onStartDrive && (
                <button
                  type="button"
                  onClick={onStartDrive}
                  className="ff-mono cursor-pointer rounded-[2px] border-2 border-[var(--ff-ink)] bg-[var(--ff-pink)] px-2.5 py-1 text-[10px] font-black tracking-wider text-[var(--ff-cream)] transition hover:brightness-110 active:translate-y-[1px]"
                >
                  DRIVE [ENTER]
                </button>
              )}
              {!isInitialSelect && onResumeDrive && (
                <button
                  type="button"
                  onClick={onResumeDrive}
                  className="ff-mono cursor-pointer rounded-[2px] border-2 border-[var(--ff-ink)] bg-[var(--ff-mint)] px-2.5 py-1 text-[10px] font-black tracking-wider text-[var(--ff-ink)] transition hover:brightness-110 active:translate-y-[1px]"
                >
                  RESUME [ENTER]
                </button>
              )}
              <button
                type="button"
                onClick={onClose}
                className="ff-mono cursor-pointer rounded-[2px] border-2 border-[var(--ff-ink)] px-2.5 py-1 text-[10px] font-black tracking-wider text-[var(--ff-ink)] transition hover:bg-[var(--ff-pink)] hover:text-[var(--ff-cream)]"
              >
                BACK [ESC]
              </button>
            </div>
          </div>
          <div className="ff-obi-h h-[2px] w-full shrink-0" />

          {/* Body */}
          <div className="ff-scroll flex flex-col gap-3 overflow-y-auto p-3.5 sm:p-4">
            {/* Compact Horizontal Dropzone & File Picker Strip */}
            <div
              className={`rounded-[2px] border border-dashed px-3.5 py-2.5 transition ${
                isDragging
                  ? 'border-[var(--ff-mint)] bg-[rgba(46,232,196,0.12)]'
                  : 'border-[rgba(46,232,196,0.38)] bg-[var(--ff-ink)]/90 hover:border-[rgba(46,232,196,0.65)]'
              }`}
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-2.5">
                  <div
                    aria-hidden="true"
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[2px] border border-[rgba(46,232,196,0.35)] bg-[var(--ff-panel)] text-[var(--ff-mint)]"
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
                    <div className="text-xs font-bold text-[var(--ff-cream)]">
                      Drop audio files to make a new road
                    </div>
                    <p className="text-[10px] text-[var(--ff-muted)]">
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
                  <span className="hidden max-w-[140px] truncate text-[10px] text-[var(--ff-muted)] sm:inline">
                    {selectedFileName ?? 'No file selected'}
                  </span>
                  <span className="ff-mono rounded-[2px] bg-[var(--ff-mint)] px-3.5 py-1.5 text-[10px] font-black tracking-[0.14em] text-[var(--ff-ink)] uppercase transition group-hover:brightness-110 active:translate-y-[1px]">
                    ADD TRACKS
                  </span>
                </label>
              </div>

              {progress && (
                <div className="ff-mono mt-2 flex items-center justify-between gap-2 rounded-[2px] border border-[var(--ff-border)] bg-[var(--ff-panel)] px-2.5 py-1.5 text-[10px] text-[var(--ff-mint)]">
                  <span className="truncate">
                    Analyzing ({progress.completed}/{progress.total}):{' '}
                    <strong className="text-[var(--ff-cream)]">{progress.currentFile}</strong>
                  </span>
                  {progress.fromCache && (
                    <span className="shrink-0 rounded-[2px] bg-[var(--ff-mint)] px-1.5 py-0.5 text-[9px] font-black text-[var(--ff-ink)]">
                      CACHED
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* Active Track Deck Bay */}
            <div className="overflow-hidden rounded-[2px] border border-[var(--ff-border)] bg-[var(--ff-ink)]">
              {/* Deck Header: Spinning Reel + Track Identity + VFD Telemetry */}
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--ff-border)] px-3.5 py-2.5">
                <div className="flex min-w-0 items-center gap-3">
                  {/* Tactile Cassette Reel Indicator */}
                  <div
                    aria-hidden="true"
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[2px] border border-[var(--ff-border)] bg-[var(--ff-panel)]"
                  >
                    <svg
                      className={`h-7 w-7 ${previewPlaying ? 'ff-spin-slow' : ''}`}
                      viewBox="0 0 24 24"
                      fill="none"
                    >
                      <circle
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="rgba(255,245,228,0.22)"
                        strokeWidth="1.8"
                        fill="#0B0E1E"
                      />
                      <circle
                        cx="12"
                        cy="12"
                        r="4.5"
                        stroke={previewPlaying ? '#2EE8C4' : '#FF3B7F'}
                        strokeWidth="1.8"
                      />
                      <path
                        d="M12 7.5V10M12 14V16.5M7.5 12H10M14 12H16.5"
                        stroke="#FFF5E4"
                        strokeWidth="1.5"
                      />
                    </svg>
                  </div>

                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5 text-[9px] font-bold tracking-[0.16em] text-[var(--ff-mint)] uppercase">
                      <span
                        className={`inline-block h-1.5 w-1.5 rounded-full ${
                          previewPlaying
                            ? 'bg-[var(--ff-mint)] shadow-[0_0_6px_rgba(46,232,196,0.85)]'
                            : 'bg-[var(--ff-pink)]'
                        }`}
                      />
                      <span>LOADED · SIDE A</span>
                      {active.audioBuffer === null && (
                        <span className="rounded-[2px] border border-[var(--ff-border)] bg-[var(--ff-panel-hi)] px-1.5 py-[1px] text-[9px] text-[var(--ff-muted)]">
                          SYNTH
                        </span>
                      )}
                      {!active.beatMap.confidence.tempoStable && (
                        <span className="rounded-[2px] bg-[var(--ff-gold)] px-1.5 py-[1px] text-[9px] font-black text-[var(--ff-ink)]">
                          VARIABLE TEMPO
                        </span>
                      )}
                    </div>
                    <div className="mt-0.5 truncate text-sm font-extrabold tracking-tight text-[var(--ff-cream)]">
                      {active.beatMap.artist} — {active.beatMap.title}
                    </div>
                  </div>
                </div>

                {/* VFD 4-Cell Telemetry Readout */}
                <div className="ff-mono grid shrink-0 grid-cols-4 divide-x divide-[var(--ff-border)] rounded-[2px] border border-[var(--ff-border)] bg-[var(--ff-panel)] text-center">
                  <div className="px-2.5 py-1">
                    <div className="text-[8px] font-bold tracking-widest text-[var(--ff-muted)] uppercase">
                      BPM
                    </div>
                    <div className="text-[11px] font-black text-[var(--ff-gold)]">
                      {active.beatMap.bpm.toFixed(2)}
                    </div>
                  </div>
                  <div className="px-2.5 py-1">
                    <div className="text-[8px] font-bold tracking-widest text-[var(--ff-muted)] uppercase">
                      1ST BEAT
                    </div>
                    <div className="text-[11px] font-bold text-[var(--ff-cream)]">
                      {active.beatMap.firstBeatOffsetSec.toFixed(3)}s
                    </div>
                  </div>
                  <div className="px-2.5 py-1">
                    <div className="text-[8px] font-bold tracking-widest text-[var(--ff-muted)] uppercase">
                      BARS
                    </div>
                    <div className="text-[11px] font-bold text-[var(--ff-cream)]">
                      {active.beatMap.barEnergy.length}
                    </div>
                  </div>
                  <div className="px-2.5 py-1">
                    <div className="text-[8px] font-bold tracking-widest text-[var(--ff-muted)] uppercase">
                      SYNC
                    </div>
                    <div className="text-[11px] font-black text-[var(--ff-mint)]">
                      {Math.round(active.beatMap.confidence.tempo * 100)}%
                    </div>
                  </div>
                </div>
              </div>

              {!active.beatMap.confidence.tempoStable && (
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[rgba(255,209,102,0.35)] bg-[rgba(255,209,102,0.08)] px-3.5 py-1.5 text-[10px] text-[var(--ff-gold)]">
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
                    className="ff-mono cursor-pointer rounded-[2px] bg-[var(--ff-gold)] px-2 py-0.5 font-black text-[var(--ff-ink)] transition hover:brightness-110"
                  >
                    CALIBRATE WITH CLICK
                  </button>
                </div>
              )}

              {/* Preview Transport, 4-Beat Monitor & Unified Section Timeline */}
              <div className="bg-[var(--ff-panel)]/55 px-3.5 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => void handleTogglePreview()}
                      className={`ff-mono inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-[2px] px-3 text-[10px] font-black tracking-wider uppercase transition active:translate-y-[1px] ${
                        previewPlaying
                          ? 'bg-[var(--ff-mint)] text-[var(--ff-ink)] hover:brightness-110'
                          : 'bg-[var(--ff-pink)] text-[var(--ff-cream)] hover:brightness-110'
                      }`}
                    >
                      {previewPlaying ? '⏸ PAUSE' : '▶ PLAY PREVIEW'}
                    </button>

                    <div className="ff-mono inline-flex h-7 items-center gap-2 rounded-[2px] border border-[var(--ff-border)] bg-[var(--ff-ink)] px-2 text-[11px] font-semibold text-[var(--ff-cream)]">
                      <span>
                        {formatPreviewTime(previewTimeSec)}
                        <span className="mx-1 text-[var(--ff-muted)]">/</span>
                        <span className="text-[var(--ff-muted)]">
                          {formatPreviewTime(durationSec)}
                        </span>
                      </span>
                      <span
                        className={`rounded-[2px] px-1.5 py-[1px] text-[9px] font-black tracking-wider uppercase ${SECTION_BADGE_STYLES[sectionRole]}`}
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
                        className="ff-mono inline-flex h-7 cursor-pointer items-center rounded-[2px] border border-[rgba(255,59,127,0.6)] bg-[rgba(255,59,127,0.08)] px-2 text-[10px] font-bold text-[var(--ff-pink)] transition hover:border-[var(--ff-pink)] hover:bg-[var(--ff-pink)] hover:text-[var(--ff-cream)]"
                      >
                        SKIP TO DROP
                      </button>
                    )}
                  </div>

                  {/* 4-Beat Bar LEDs & Metronome Click Toggle */}
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
                                  ? 'border-[var(--ff-pink)] bg-[var(--ff-pink)] text-[var(--ff-cream)] shadow-[0_0_8px_rgba(255,59,127,0.7)]'
                                  : 'border-[var(--ff-mint)] bg-[var(--ff-mint)] text-[var(--ff-ink)] shadow-[0_0_8px_rgba(46,232,196,0.6)]'
                                : isDownbeat
                                  ? 'border-[rgba(255,59,127,0.45)] bg-[var(--ff-ink)] text-[var(--ff-pink)]'
                                  : 'border-[var(--ff-border)] bg-[var(--ff-ink)] text-[var(--ff-muted)]'
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
                      className={`ff-mono inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-[2px] border px-2 text-[10px] font-bold tracking-wider uppercase transition ${
                        clickEnabled
                          ? 'border-[var(--ff-mint)] bg-[var(--ff-mint)] text-[var(--ff-ink)]'
                          : 'border-[var(--ff-border)] bg-[var(--ff-ink)] text-[var(--ff-muted)] hover:border-[var(--ff-mint)] hover:text-[var(--ff-cream)]'
                      }`}
                    >
                      <span
                        aria-hidden="true"
                        className={`h-1.5 w-1.5 rounded-full ${
                          clickEnabled ? 'bg-[var(--ff-ink)]' : 'bg-[var(--ff-muted)]/60'
                        }`}
                      />
                      BEAT CLICK: {clickEnabled ? 'ON' : 'OFF'}
                    </button>
                  </div>
                </div>

                {/* Unified Interactive Section-Colored Timeline Scrubber */}
                <div className="mt-2.5">
                  <div className="relative flex h-7 items-center">
                    {/* Visual Section Track Backdrop */}
                    <div className="pointer-events-none relative flex h-3 w-full gap-[2px] overflow-hidden rounded-[2px] bg-[var(--ff-ink)] p-[1px] ring-1 ring-[var(--ff-border)]">
                      {active.beatMap.sections.map((sec, sIdx) => (
                        <div
                          key={`${sec.startBar}-${sIdx}`}
                          style={{ width: `${(sec.bars / totalBars) * 100}%` }}
                          className={`h-full ${SECTION_BAR_COLORS[sec.role]} opacity-90`}
                        />
                      ))}
                      {/* Subtle unplayed dimming veil after playhead */}
                      <div
                        className="absolute inset-y-0 right-0 bg-[#0B0E1E]/38"
                        style={{ left: `${progressPct}%` }}
                      />
                      {/* First Drop Marker */}
                      {dropPct !== null && (
                        <div
                          className="absolute top-0 bottom-0 w-[2px] bg-[var(--ff-cream)]/80"
                          style={{ left: `${dropPct}%` }}
                        />
                      )}
                    </div>

                    {/* Native Accessible Range Input Overlaid Directly on the Timeline */}
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
                  <div className="ff-mono mt-1 flex flex-wrap items-center justify-between gap-2 text-[9px] text-[var(--ff-muted)]">
                    <div className="flex flex-wrap items-center gap-2.5">
                      <span className="inline-flex items-center gap-1">
                        <span className="h-2 w-2 rounded-[1px] bg-[#2C365E]" />
                        INTRO/OUTRO
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <span className="h-2 w-2 rounded-[1px] bg-[#FFD166]" />
                        BUILD
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <span className="h-2 w-2 rounded-[1px] bg-[#FF3B7F]" />
                        DROP
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <span className="h-2 w-2 rounded-[1px] bg-[#2EE8C4]" />
                        BREAKDOWN
                      </span>
                    </div>
                    <span className="hidden opacity-75 sm:inline">SPACE: PLAY / PAUSE</span>
                  </div>
                </div>
              </div>

              {/* Grouped Beat Calibration Bar */}
              <div className="ff-mono flex flex-col gap-1.5 border-t border-[var(--ff-border)] bg-[var(--ff-ink)] px-3.5 py-2 text-[10px] font-bold">
                {/* Row 1: Tempo Group + Help Toggle */}
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="w-16 shrink-0 text-[9px] font-bold tracking-widest text-[var(--ff-muted)] uppercase">
                      TEMPO
                    </span>
                    <div className="inline-flex overflow-hidden rounded-[2px] border border-[var(--ff-border)]">
                      <button
                        type="button"
                        title="Halve BPM (use if auto-analysis detected double tempo)"
                        onClick={() => {
                          const updated = withAdjustedBpm(active.beatMap, active.beatMap.bpm * 0.5);
                          onUpdateBeatMap(active.contentHash, updated);
                          ensurePreviewPlaying();
                        }}
                        className="cursor-pointer bg-[var(--ff-panel)] px-2 py-1 text-[var(--ff-cream)] transition hover:bg-[var(--ff-panel-hi)] hover:text-[var(--ff-mint)]"
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
                        className="cursor-pointer border-l border-[var(--ff-border)] bg-[var(--ff-panel)] px-2 py-1 text-[var(--ff-cream)] transition hover:bg-[var(--ff-panel-hi)] hover:text-[var(--ff-mint)]"
                      >
                        ×2 BPM
                      </button>
                    </div>
                    <button
                      type="button"
                      title="Tap repeatedly along with the music beat to set BPM manually"
                      onClick={handleTapTempo}
                      className={`cursor-pointer rounded-[2px] border px-2.5 py-1 font-black transition active:scale-[0.98] ${
                        tapCount > 0
                          ? 'border-[var(--ff-pink)] bg-[var(--ff-pink)] text-[var(--ff-cream)]'
                          : 'border-[rgba(255,59,127,0.65)] bg-[rgba(255,59,127,0.14)] text-[var(--ff-cream)] hover:bg-[var(--ff-pink)]'
                      }`}
                    >
                      TAP TEMPO {tapCount > 0 ? `(${tapCount})` : ''}
                    </button>
                  </div>

                  <button
                    type="button"
                    aria-expanded={helpOpen}
                    onClick={() => setHelpOpen((prev) => !prev)}
                    title="Explain what BPM, Tap Tempo, and Beat -1 / +1 do"
                    className={`cursor-pointer rounded-[2px] border px-2 py-1 text-[10px] font-black transition ${
                      helpOpen
                        ? 'border-[var(--ff-gold)] bg-[var(--ff-gold)] text-[var(--ff-ink)]'
                        : 'border-[var(--ff-border)] bg-[var(--ff-panel)] text-[var(--ff-muted)] hover:border-[var(--ff-mint)] hover:text-[var(--ff-cream)]'
                    }`}
                  >
                    ?
                  </button>
                </div>

                {/* Row 2: Downbeat Group */}
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="w-16 shrink-0 text-[9px] font-bold tracking-widest text-[var(--ff-muted)] uppercase">
                    DOWNBEAT
                  </span>
                  <div className="inline-flex overflow-hidden rounded-[2px] border border-[var(--ff-border)]">
                    <button
                      type="button"
                      title="Shift Beat 1 (downbeat) 1 beat earlier to align bars with the music"
                      onClick={() => {
                        const updated = nudgeBeatMapDownbeat(active.beatMap, -1);
                        onUpdateBeatMap(active.contentHash, updated);
                        ensurePreviewPlaying();
                      }}
                      className="cursor-pointer bg-[var(--ff-panel)] px-2 py-1 text-[var(--ff-cream)] transition hover:bg-[var(--ff-panel-hi)] hover:text-[var(--ff-mint)]"
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
                      className="cursor-pointer border-l border-[var(--ff-border)] bg-[var(--ff-panel)] px-2 py-1 text-[var(--ff-cream)] transition hover:bg-[var(--ff-panel-hi)] hover:text-[var(--ff-mint)]"
                    >
                      BEAT +1
                    </button>
                  </div>
                </div>
              </div>

              {helpOpen && (
                <div className="border-t border-[rgba(255,209,102,0.35)] bg-[var(--ff-panel)]/90 px-3.5 py-2.5 text-[10px] leading-relaxed text-[var(--ff-cream)]">
                  <div>
                    <strong className="text-[var(--ff-pink)]">BPM (÷2 / ×2 / TAP TEMPO):</strong>{' '}
                    Sets road speed and gear-shift tempo. Turn on{' '}
                    <strong className="text-[var(--ff-mint)]">BEAT CLICK</strong>: if the ticks feel
                    twice as fast or slow as the kick, press <strong>×2</strong> or{' '}
                    <strong>÷2</strong>, or tap along to the beat.
                  </div>
                  <div className="mt-1">
                    <strong className="text-[var(--ff-mint)]">1st Beat (BEAT -1 / +1):</strong>{' '}
                    Shifts which beat counts as{' '}
                    <strong className="text-[var(--ff-pink)]">Beat 1</strong> so hills and drops
                    crest with the song phrases.
                  </div>
                </div>
              )}
            </div>

            {/* Stage Playlist */}
            <div>
              <div className="mb-1.5 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-bold tracking-[0.16em] text-[var(--ff-muted)] uppercase">
                    STAGE PLAYLIST ({items.length} {items.length === 1 ? 'TRACK' : 'TRACKS'})
                  </span>
                  <span className="hidden text-[9px] tracking-wider text-[var(--ff-muted)]/60 uppercase sm:inline">
                    · DOUBLE-CLICK TO DRIVE
                  </span>
                </div>
                <button
                  type="button"
                  onClick={handleRestoreDefaults}
                  className="ff-mono cursor-pointer rounded-[2px] border border-[var(--ff-border)] bg-[var(--ff-ink)] px-2 py-0.5 text-[9px] font-bold tracking-wider text-[var(--ff-muted)] uppercase transition hover:border-[var(--ff-mint)] hover:text-[var(--ff-mint)]"
                  title="Restore default playlist"
                >
                  RESTORE DEFAULTS
                </button>
              </div>

              <div className="ff-scroll max-h-[220px] divide-y divide-[var(--ff-border)] overflow-y-auto rounded-[2px] border border-[var(--ff-border)] bg-[var(--ff-ink)]">
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
                          ? 'border-l-[3px] border-l-[var(--ff-pink)] bg-gradient-to-r from-[rgba(255,59,127,0.2)] via-[rgba(255,59,127,0.08)] to-transparent text-[var(--ff-cream)]'
                          : 'border-l-[3px] border-l-transparent text-[var(--ff-cream)] hover:bg-[var(--ff-panel)]/85'
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
                        className="flex min-w-0 flex-1 cursor-pointer items-center gap-2.5 text-left focus-visible:outline-1 focus-visible:outline-[var(--ff-mint)]"
                      >
                        <span
                          className={`ff-mono w-5 shrink-0 text-[10px] font-black ${
                            isSelected ? 'text-[var(--ff-pink)]' : 'text-[var(--ff-muted)]'
                          }`}
                        >
                          {String(idx + 1).padStart(2, '0')}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="truncate font-bold leading-snug">
                            {item.beatMap.artist} — {item.beatMap.title}
                          </div>
                          <div className="mt-0.5 flex items-center gap-2 text-[10px] text-[var(--ff-muted)]">
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
                              className="hidden h-[3px] w-16 shrink-0 gap-[1px] overflow-hidden rounded-[1px] opacity-80 sm:inline-flex"
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
                          className={`inline-flex h-6 w-7 cursor-pointer items-center justify-center rounded-[2px] border text-[10px] font-bold transition ${
                            isRowPlaying
                              ? 'border-[var(--ff-mint)] bg-[var(--ff-mint)] text-[var(--ff-ink)]'
                              : 'border-[var(--ff-border)] bg-[var(--ff-panel)] text-[var(--ff-cream)] hover:border-[var(--ff-pink)] hover:text-[var(--ff-pink)]'
                          }`}
                        >
                          {isRowPlaying ? '⏸' : '▶'}
                        </button>
                        {best && (
                          <span className="rounded-[2px] bg-[var(--ff-gold)] px-1.5 py-0.5 text-[10px] font-black text-[var(--ff-ink)]">
                            {best.bestGrade}
                          </span>
                        )}
                        <span
                          className={`w-[4.75rem] text-right text-[11px] font-bold ${
                            isSelected ? 'text-[var(--ff-mint)]' : 'text-[var(--ff-muted)]'
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
                          className={`inline-flex h-6 w-6 items-center justify-center rounded-[2px] border text-[11px] font-bold transition ${
                            canRemove
                              ? 'cursor-pointer border-[var(--ff-border)] bg-[var(--ff-panel)] text-[var(--ff-muted)] hover:border-[var(--ff-pink)] hover:bg-[var(--ff-pink)] hover:text-[var(--ff-cream)]'
                              : 'cursor-not-allowed border-[var(--ff-border)] bg-[var(--ff-panel)] text-[var(--ff-muted)] opacity-35'
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
      </div>
    </div>
  );
}
