import {
  firstDropTimeSec,
  nudgeBeatMapDownbeat,
  withAdjustedBpm,
  type BeatMap,
  type SectionRole,
} from '@src/audio/BeatMap';
import type { FunkAudioEngine } from '@src/audio/FunkAudioEngine';
import type { ImportProgress, PlaylistItem, TrackLibrary } from '@src/audio/TrackLibrary';
import { useCallback, useEffect, useRef, useState } from 'react';

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
  drop: 'bg-[#FF3B7F]',
  breakdown: 'bg-[#2EE8C4]',
  outro: 'bg-[#2C365E]',
};

const SECTION_BADGE_STYLES: Readonly<Record<SectionRole, string>> = {
  intro: 'bg-[#2C365E] text-[#FFF5E4]',
  build: 'bg-[#FFD166] text-[#0B0E1E]',
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
      } else if (e.key === 'Escape' || e.code === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, isInitialSelect, onStartDrive, onResumeDrive, onClose]);

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

  const handleTogglePreview = async () => {
    if (!audio) return;
    await audio.togglePreview();
    if (audio.unlocked) onPreviewUnlocked?.();
    syncPreviewState();
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
        void startPreviewFromStart();
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
  };

  return (
    <div
      className="pointer-events-auto fixed inset-0 z-50 flex items-center justify-center bg-[#0B0E1E]/82 p-4 text-xs text-[var(--ff-cream)] select-none"
      style={{ colorScheme: 'dark', scrollbarColor: '#FF3B7F #0B0E1E', scrollbarWidth: 'thin' }}
      onDragOver={(e) => {
        e.preventDefault();
        setIsDragging(true);
      }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setIsDragging(false);
        void handleFiles(e.dataTransfer.files);
      }}
    >
      <div className="ff-shadow-ink flex max-h-[90vh] w-full max-w-2xl overflow-hidden rounded-[2px] border-2 border-[var(--ff-cream)] bg-[var(--ff-panel)]">
        <div className="ff-obi-v w-2.5 shrink-0" />

        <div className="flex min-w-0 flex-1 flex-col">
          {/* Cream J-Card Header */}
          <div className="flex items-center justify-between bg-[var(--ff-cream)] px-4 py-2.5 text-[var(--ff-ink)]">
            <div>
              <h2 className="ff-display text-base font-black italic tracking-wider uppercase">
                CASSETTE DECK
              </h2>
              <div className="text-[10px] font-semibold opacity-70">
                Your music generates the road · Stays private on your device
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="ff-mono cursor-pointer rounded-[2px] border-2 border-[var(--ff-ink)] px-2.5 py-0.5 text-[10px] font-black tracking-wider text-[var(--ff-ink)] transition hover:bg-[var(--ff-pink)] hover:text-[var(--ff-cream)]"
            >
              BACK [ESC]
            </button>
          </div>

          {/* Body */}
          <div className="flex flex-col gap-3.5 overflow-y-auto p-4">
            {/* Dropzone & File Picker */}
            <div
              className={`flex flex-col items-center justify-center gap-2 rounded-[2px] border border-dashed px-4 py-3 text-center transition ${
                isDragging
                  ? 'border-[var(--ff-mint)] bg-[var(--ff-panel-hi)]'
                  : 'border-[rgba(46,232,196,0.45)] bg-[var(--ff-ink)]'
              }`}
            >
              <div className="text-xs font-bold text-[var(--ff-cream)]">
                Drop audio files to make a new road
              </div>
              <p className="text-[10px] text-[var(--ff-muted)]">
                MP3 · WAV · OGG · FLAC — local analysis only
              </p>

              <label className="group mt-0.5 flex w-full cursor-pointer flex-col items-center justify-center gap-1.5 text-center">
                <input
                  type="file"
                  multiple
                  accept="audio/*"
                  onChange={(e) => void handleFiles(e.target.files)}
                  className="sr-only"
                />
                <span className="rounded-[2px] bg-[var(--ff-mint)] px-4 py-1.5 text-[10px] font-black tracking-[0.14em] text-[var(--ff-ink)] uppercase transition group-hover:brightness-110">
                  ADD TRACKS
                </span>
                <span className="text-[11px] text-[var(--ff-muted)]">
                  {selectedFileName ?? 'No file selected'}
                </span>
              </label>

              {progress && (
                <div className="ff-mono mt-1 w-full rounded-[2px] border border-[var(--ff-border)] bg-[var(--ff-panel)] px-3 py-1.5 text-[11px] text-[var(--ff-mint)]">
                  Analyzing ({progress.completed}/{progress.total}):{' '}
                  <span className="font-bold text-[var(--ff-cream)]">{progress.currentFile}</span>{' '}
                  {progress.fromCache && (
                    <span className="ml-1 rounded-[2px] bg-[var(--ff-mint)] px-1.5 py-0.5 text-[9px] font-black text-[var(--ff-ink)]">
                      CACHED
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* Active Track Preview & Calibration */}
            <div className="rounded-[2px] border border-[var(--ff-border)] bg-[var(--ff-ink)] p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <div className="flex flex-wrap items-center gap-2 text-[10px] font-bold tracking-[0.16em] text-[var(--ff-mint)] uppercase">
                    <span>LOADED · SIDE A</span>
                    {active.audioBuffer === null && (
                      <span className="rounded-[2px] bg-[var(--ff-panel-hi)] px-1.5 py-[1px] text-[9px] text-[var(--ff-muted)]">
                        SYNTH
                      </span>
                    )}
                  </div>
                  <div className="mt-0.5 text-sm font-extrabold text-[var(--ff-cream)]">
                    {active.beatMap.artist} — {active.beatMap.title}
                  </div>
                  <div className="ff-mono mt-1 flex flex-wrap items-center gap-3 text-[11px] text-[var(--ff-muted)]">
                    <span>
                      BPM: <strong className="text-[var(--ff-gold)]">{active.beatMap.bpm.toFixed(2)}</strong>
                    </span>
                    <span>
                      1st Beat:{' '}
                      <strong className="text-[var(--ff-cream)]">
                        {active.beatMap.firstBeatOffsetSec.toFixed(3)}s
                      </strong>
                    </span>
                    <span>
                      Bars: <strong className="text-[var(--ff-cream)]">{active.beatMap.barEnergy.length}</strong>
                    </span>
                    <span>
                      Sync:{' '}
                      <strong className="text-[var(--ff-mint)]">
                        {Math.round(active.beatMap.confidence.tempo * 100)}%
                      </strong>
                    </span>
                    {!active.beatMap.confidence.tempoStable && (
                      <span className="rounded-[2px] bg-[var(--ff-gold)] px-1.5 py-0.5 text-[9px] font-black text-[var(--ff-ink)]">
                        VARIABLE TEMPO
                      </span>
                    )}
                  </div>
                  {!active.beatMap.confidence.tempoStable && (
                    <div className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-[2px] border border-[rgba(255,209,102,0.5)] bg-[var(--ff-panel)] px-2.5 py-1.5 text-[10px] text-[var(--ff-gold)]">
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
                        className="cursor-pointer rounded-[2px] bg-[var(--ff-gold)] px-2 py-0.5 font-black text-[var(--ff-ink)] transition hover:brightness-110"
                      >
                        CALIBRATE WITH CLICK
                      </button>
                    </div>
                  )}
                </div>

                {/* Tempo Calibration Controls */}
                <div className="ff-mono flex flex-wrap items-center gap-1 text-[10px] font-bold">
                  <button
                    type="button"
                    title="Halve BPM (use if auto-analysis detected double tempo)"
                    onClick={() => {
                      const updated = withAdjustedBpm(active.beatMap, active.beatMap.bpm * 0.5);
                      onUpdateBeatMap(active.contentHash, updated);
                    }}
                    className="cursor-pointer rounded-[2px] border border-[var(--ff-border)] bg-[var(--ff-panel)] px-2 py-1 text-[var(--ff-cream)] transition hover:border-[var(--ff-mint)]"
                  >
                    ÷2 BPM
                  </button>
                  <button
                    type="button"
                    title="Double BPM (use if auto-analysis detected half tempo)"
                    onClick={() => {
                      const updated = withAdjustedBpm(active.beatMap, active.beatMap.bpm * 2);
                      onUpdateBeatMap(active.contentHash, updated);
                    }}
                    className="cursor-pointer rounded-[2px] border border-[var(--ff-border)] bg-[var(--ff-panel)] px-2 py-1 text-[var(--ff-cream)] transition hover:border-[var(--ff-mint)]"
                  >
                    ×2 BPM
                  </button>
                  <button
                    type="button"
                    title="Tap repeatedly along with the music beat to set BPM manually"
                    onClick={handleTapTempo}
                    className="cursor-pointer rounded-[2px] bg-[var(--ff-pink)] px-2.5 py-1 font-black text-[var(--ff-cream)] transition hover:brightness-110"
                  >
                    TAP TEMPO {tapCount > 0 ? `(${tapCount})` : ''}
                  </button>
                  <button
                    type="button"
                    title="Shift Beat 1 (downbeat) 1 beat earlier to align bars with the music"
                    onClick={() => {
                      const updated = nudgeBeatMapDownbeat(active.beatMap, -1);
                      onUpdateBeatMap(active.contentHash, updated);
                    }}
                    className="cursor-pointer rounded-[2px] border border-[var(--ff-border)] bg-[var(--ff-panel)] px-2 py-1 text-[var(--ff-cream)] transition hover:border-[var(--ff-mint)]"
                  >
                    BEAT -1
                  </button>
                  <button
                    type="button"
                    title="Shift Beat 1 (downbeat) 1 beat later to align bars with the music"
                    onClick={() => {
                      const updated = nudgeBeatMapDownbeat(active.beatMap, 1);
                      onUpdateBeatMap(active.contentHash, updated);
                    }}
                    className="cursor-pointer rounded-[2px] border border-[var(--ff-border)] bg-[var(--ff-panel)] px-2 py-1 text-[var(--ff-cream)] transition hover:border-[var(--ff-mint)]"
                  >
                    BEAT +1
                  </button>
                  <button
                    type="button"
                    aria-expanded={helpOpen}
                    onClick={() => setHelpOpen((prev) => !prev)}
                    title="Explain what BPM, Tap Tempo, and Beat -1 / +1 do"
                    className={`cursor-pointer rounded-[2px] border px-2 py-1 font-black transition ${
                      helpOpen
                        ? 'border-[var(--ff-gold)] bg-[var(--ff-gold)] text-[var(--ff-ink)]'
                        : 'border-[var(--ff-border)] bg-[var(--ff-panel)] text-[var(--ff-muted)] hover:border-[var(--ff-mint)] hover:text-[var(--ff-cream)]'
                    }`}
                  >
                    ?
                  </button>
                </div>
              </div>

              {/* Preview Transport & 4-Beat Monitor */}
              <div className="mt-3 rounded-[2px] border border-[var(--ff-border)] bg-[var(--ff-panel)] p-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => void handleTogglePreview()}
                      className={`cursor-pointer rounded-[2px] px-3 py-1 text-[10px] font-black tracking-wider uppercase transition ${
                        previewPlaying
                          ? 'bg-[var(--ff-mint)] text-[var(--ff-ink)]'
                          : 'bg-[var(--ff-pink)] text-[var(--ff-cream)] hover:brightness-110'
                      }`}
                    >
                      {previewPlaying ? '⏸ PAUSE' : '▶ PLAY PREVIEW'}
                    </button>

                    <span className="ff-mono text-[11px] font-semibold text-[var(--ff-cream)]">
                      {formatPreviewTime(previewTimeSec)} / {formatPreviewTime(durationSec)}
                    </span>

                    <span
                      className={`ff-mono rounded-[2px] px-1.5 py-0.5 text-[9px] font-black tracking-wider uppercase ${SECTION_BADGE_STYLES[sectionRole]}`}
                    >
                      {sectionRole}
                    </span>

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
                        className="cursor-pointer rounded-[2px] border border-[var(--ff-pink)] px-2 py-0.5 text-[10px] font-bold text-[var(--ff-pink)] transition hover:bg-[var(--ff-pink)] hover:text-[var(--ff-cream)]"
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
                            className={`ff-mono inline-flex h-5 w-5 items-center justify-center rounded-[2px] border text-[10px] font-black transition-colors ${
                              isActiveBeat
                                ? isDownbeat
                                  ? 'border-[var(--ff-pink)] bg-[var(--ff-pink)] text-[var(--ff-cream)]'
                                  : 'border-[var(--ff-mint)] bg-[var(--ff-mint)] text-[var(--ff-ink)]'
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
                      className={`ff-mono cursor-pointer rounded-[2px] border px-2 py-1 text-[10px] font-bold tracking-wider uppercase transition ${
                        clickEnabled
                          ? 'border-[var(--ff-mint)] bg-[var(--ff-mint)] text-[var(--ff-ink)]'
                          : 'border-[var(--ff-border)] bg-[var(--ff-ink)] text-[var(--ff-muted)] hover:border-[var(--ff-mint)] hover:text-[var(--ff-cream)]'
                      }`}
                    >
                      BEAT CLICK: {clickEnabled ? 'ON' : 'OFF'}
                    </button>
                  </div>
                </div>

                {/* Section-Colored Timeline Scrubber */}
                <div className="mt-2.5">
                  <div className="relative flex h-2 w-full gap-0.5 overflow-hidden rounded-[2px] bg-[var(--ff-ink)]">
                    {active.beatMap.sections.map((sec, sIdx) => (
                      <div
                        key={`${sec.startBar}-${sIdx}`}
                        style={{ width: `${(sec.bars / totalBars) * 100}%` }}
                        className={`h-full ${SECTION_BAR_COLORS[sec.role]}`}
                        title={`${sec.role.toUpperCase()} (${sec.bars} bars)`}
                      />
                    ))}
                    <div
                      className="pointer-events-none absolute top-0 bottom-0 w-0.5 bg-[var(--ff-cream)]"
                      style={{
                        left: `${Math.max(0, Math.min(100, (previewTimeSec / durationSec) * 100))}%`,
                      }}
                    />
                  </div>
                  <input
                    type="range"
                    aria-label="Track preview position"
                    min={0}
                    max={durationSec}
                    step={0.05}
                    value={Math.min(durationSec, previewTimeSec)}
                    onChange={(e) => handleSeekPreview(parseFloat(e.target.value))}
                    className="mt-1 h-2 w-full cursor-pointer accent-[#2EE8C4]"
                  />
                </div>

                {helpOpen && (
                  <div className="mt-2 rounded-[2px] border border-[rgba(255,209,102,0.4)] bg-[var(--ff-ink)] px-2.5 py-2 text-[10px] leading-relaxed text-[var(--ff-cream)]">
                    <div>
                      <strong className="text-[var(--ff-pink)]">BPM (÷2 / ×2 / TAP TEMPO):</strong>{' '}
                      Sets road speed and gear-shift tempo. Turn on{' '}
                      <strong className="text-[var(--ff-mint)]">BEAT CLICK</strong>: if the ticks
                      feel twice as fast or slow as the kick, press <strong>×2</strong> or{' '}
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
            </div>

            {/* Playlist */}
            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <div className="text-[10px] font-bold tracking-[0.16em] text-[var(--ff-muted)] uppercase">
                  STAGE PLAYLIST ({items.length} {items.length === 1 ? 'TRACK' : 'TRACKS'})
                </div>
                <button
                  type="button"
                  onClick={handleRestoreDefaults}
                  className="cursor-pointer text-[10px] font-bold tracking-wider text-[var(--ff-muted)] uppercase transition hover:text-[var(--ff-mint)]"
                  title="Restore default playlist"
                >
                  RESTORE DEFAULTS
                </button>
              </div>
              <div className="divide-y divide-[var(--ff-border)] overflow-hidden rounded-[2px] border border-[var(--ff-border)] bg-[var(--ff-ink)]">
                {items.map((item, idx) => {
                  const isSelected = item.contentHash === active.contentHash;
                  const isRowPlaying = isSelected && previewPlaying;
                  const best = library.getBestScore(item.contentHash);
                  const canRemove = items.length > 1;
                  return (
                    <div
                      key={item.id}
                      className={`flex w-full items-center justify-between px-3 py-2 text-left transition ${
                        isSelected
                          ? 'border-l-[3px] border-l-[var(--ff-pink)] bg-[rgba(255,59,127,0.16)] text-[var(--ff-cream)]'
                          : 'border-l-[3px] border-l-transparent text-[var(--ff-cream)] hover:bg-[var(--ff-panel)]'
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
                        className="flex min-w-0 flex-1 cursor-pointer items-center gap-2.5 text-left focus:outline-none"
                      >
                        <span
                          className={`ff-mono text-[10px] font-black ${
                            isSelected ? 'text-[var(--ff-pink)]' : 'text-[var(--ff-muted)]'
                          }`}
                        >
                          {String(idx + 1).padStart(2, '0')}
                        </span>
                        <div className="min-w-0">
                          <div className="truncate font-bold">
                            {item.beatMap.artist} — {item.beatMap.title}
                          </div>
                          <div className="truncate text-[10px] text-[var(--ff-muted)]">
                            {item.beatMap.sections.length} sections ·{' '}
                            {Math.round(item.beatMap.durationSec)}s
                            {best
                              ? ` · BEST: ${best.bestGrade} (${best.bestScore.toLocaleString()} PTS)`
                              : ''}
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
                          className={`cursor-pointer rounded-[2px] border px-2 py-0.5 text-[10px] font-bold transition ${
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
                          className={`text-[11px] font-bold ${
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
                          className={`rounded-[2px] border px-2 py-0.5 text-[11px] font-bold transition ${
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
