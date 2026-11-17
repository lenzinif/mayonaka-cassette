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
  intro: 'bg-indigo-500/65',
  build: 'bg-amber-400/75',
  drop: 'bg-pink-500/85',
  breakdown: 'bg-cyan-400/65',
  outro: 'bg-purple-500/65',
};

const SECTION_BADGE_STYLES: Readonly<Record<SectionRole, string>> = {
  intro: 'border-indigo-400/50 bg-indigo-950/70 text-indigo-200',
  build: 'border-amber-400/60 bg-amber-950/75 text-amber-200',
  drop: 'border-pink-400/70 bg-pink-950/80 text-pink-200',
  breakdown: 'border-cyan-400/50 bg-cyan-950/70 text-cyan-200',
  outro: 'border-purple-400/50 bg-purple-950/70 text-purple-200',
};

function formatPreviewTime(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

/**
 * M3b Track Loader & Playlist Modal (`docs/DESIGN.md` §2.1, `AGENTS.md` §3).
 *
 * Supports drag-and-drop / file picker audio import, displays worker analysis progress
 * and IndexedDB cache hits, and provides one-click `÷2`, `×2`, Tap Tempo, and downbeat
 * phase nudge adjustments.
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
      fileList.length === 1 ? fileList[0]!.name : `${fileList.length} file selezionati`,
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
      className="pointer-events-auto absolute inset-0 z-50 flex items-center justify-center bg-[#05010d]/90 p-4 font-mono text-xs text-white backdrop-blur-xs select-none"
      style={{ colorScheme: 'dark', scrollbarColor: '#e879f9 #1a0633', scrollbarWidth: 'thin' }}
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
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded border border-pink-500/60 bg-[#0e0224] shadow-[0_0_40px_rgba(255,42,109,0.35)]">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-fuchsia-500/40 bg-[#180538] px-4 py-3">
          <div>
            <h2 className="text-sm font-bold tracking-wider text-white uppercase">
              CASSETTE DECK
            </h2>
            <div className="text-[10px] tracking-wider text-cyan-300 uppercase">
              SELECT OR IMPORT AUDIO (MP3 / WAV / OGG / FLAC)
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="cursor-pointer rounded border border-fuchsia-400/40 bg-[#1a0636] px-2.5 py-1 text-[11px] font-bold tracking-wider text-fuchsia-200 transition hover:border-pink-400 hover:bg-pink-950/60 hover:text-white"
          >
            BACK [ESC]
          </button>
        </div>

        {/* Body */}
        <div className="flex flex-col gap-4 overflow-y-auto p-4">
          {/* Dropzone & File Picker */}
          <div
            className={`flex flex-col items-center justify-center gap-2 rounded border-2 border-dashed p-4 text-center transition ${
              isDragging
                ? 'border-cyan-300 bg-cyan-950/40'
                : 'border-fuchsia-500/40 bg-[#13042b]/70'
            }`}
          >
            <div className="text-xs font-semibold text-cyan-200">
              DRAG &amp; DROP AUDIO FILES HERE, OR PICK FROM DISK
            </div>
            <p className="text-[11px] text-fuchsia-300/75">
              Decoded and analysed locally in a Web Worker, cached in IndexedDB.
            </p>

            <label className="group mt-1 flex w-full cursor-pointer flex-col items-center justify-center gap-1.5 text-center">
              <input
                type="file"
                multiple
                accept="audio/*"
                onChange={(e) => void handleFiles(e.target.files)}
                className="sr-only"
              />
              <span className="rounded border border-cyan-400/60 bg-cyan-950/80 px-4 py-1.5 font-mono text-xs font-bold text-cyan-200 shadow-[0_0_10px_rgba(5,217,232,0.2)] transition group-hover:border-cyan-300 group-hover:bg-cyan-900 group-hover:shadow-[0_0_15px_rgba(5,217,232,0.4)]">
                SCEGLI FILE
              </span>
              <span className="text-[11px] text-fuchsia-200/70 text-center">
                {selectedFileName ?? 'Nessun file selezionato'}
              </span>
            </label>

            {progress && (
              <div className="mt-2 w-full rounded border border-cyan-400/40 bg-[#090117] px-3 py-1.5 text-[11px] text-cyan-200">
                Analyzing ({progress.completed}/{progress.total}):{' '}
                <span className="font-bold text-white">{progress.currentFile}</span>{' '}
                {progress.fromCache && (
                  <span className="ml-1 rounded bg-emerald-800/80 px-1.5 py-0.5 text-[10px] text-emerald-200">
                    IDB CACHE HIT
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Active Track BeatMap & Preview Controls */}
          <div className="rounded border border-cyan-400/35 bg-[#13042b] p-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <div className="flex flex-wrap items-center gap-2 text-[10px] tracking-widest text-cyan-300 uppercase">
                  <span>ACTIVE TRACK · {active.beatMap.source.toUpperCase()} GRID</span>
                  {active.audioBuffer === null && (
                    <span className="rounded border border-fuchsia-400/40 bg-fuchsia-950/70 px-1.5 py-0.2 text-[9px] text-fuchsia-200">
                      SYNTH PREVIEW
                    </span>
                  )}
                </div>
                <div className="text-sm font-bold text-white">
                  {active.beatMap.artist} — {active.beatMap.title}
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-3 text-[11px] text-fuchsia-200">
                  <span>
                    BPM: <strong className="text-pink-400">{active.beatMap.bpm.toFixed(2)}</strong>
                  </span>
                  <span>
                    1st Beat:{' '}
                    <strong className="text-cyan-300">
                      {active.beatMap.firstBeatOffsetSec.toFixed(3)}s
                    </strong>
                  </span>
                  <span>
                    Bars: <strong>{active.beatMap.barEnergy.length}</strong>
                  </span>
                  <span>
                    Confidence:{' '}
                    <strong className="text-emerald-300">
                      {Math.round(active.beatMap.confidence.tempo * 100)}%
                    </strong>
                  </span>
                  {!active.beatMap.confidence.tempoStable && (
                    <span className="rounded border border-amber-400/70 bg-amber-950/80 px-1.5 py-0.5 text-[10px] font-bold text-amber-300">
                      UNSTABLE TEMPO (ENERGY-ONLY MODE)
                    </span>
                  )}
                </div>
                {!active.beatMap.confidence.tempoStable && (
                  <div className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded border border-amber-400/50 bg-amber-950/50 px-2.5 py-1.5 text-[10px] text-amber-200">
                    <span>
                      ⚠ Tempo variabile rilevato: il beat può slittare. Attiva il click e calibra con{' '}
                      <strong>TAP TEMPO</strong> / <strong>BEAT -1/+1</strong>.
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
                      className="cursor-pointer rounded border border-amber-300/70 bg-amber-900/80 px-2 py-0.5 font-bold text-amber-100 hover:bg-amber-800"
                    >
                      CALIBRA CON CLICK
                    </button>
                  </div>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  title="Halve BPM (use if auto-analysis detected double tempo)"
                  onClick={() => {
                    const updated = withAdjustedBpm(active.beatMap, active.beatMap.bpm * 0.5);
                    onUpdateBeatMap(active.contentHash, updated);
                  }}
                  className="cursor-pointer rounded border border-fuchsia-500/50 bg-fuchsia-950/80 px-2 py-1 text-[11px] font-semibold hover:border-cyan-400"
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
                  className="cursor-pointer rounded border border-fuchsia-500/50 bg-fuchsia-950/80 px-2 py-1 text-[11px] font-semibold hover:border-cyan-400"
                >
                  ×2 BPM
                </button>
                <button
                  type="button"
                  title="Tap repeatedly along with the music beat to set BPM manually"
                  onClick={handleTapTempo}
                  className="cursor-pointer rounded border border-pink-500/60 bg-pink-950/80 px-2.5 py-1 text-[11px] font-bold text-pink-200 hover:bg-pink-900"
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
                  className="cursor-pointer rounded border border-cyan-500/40 bg-cyan-950/70 px-2 py-1 text-[11px] hover:border-cyan-300"
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
                  className="cursor-pointer rounded border border-cyan-500/40 bg-cyan-950/70 px-2 py-1 text-[11px] hover:border-cyan-300"
                >
                  BEAT +1
                </button>
                <button
                  type="button"
                  aria-expanded={helpOpen}
                  onClick={() => setHelpOpen((prev) => !prev)}
                  title="Explain what BPM, Tap Tempo, and Beat -1 / +1 do"
                  className={`cursor-pointer rounded border px-2 py-1 text-[11px] font-bold transition ${
                    helpOpen
                      ? 'border-amber-300 bg-amber-950/80 text-amber-200'
                      : 'border-fuchsia-500/40 bg-[#1a0636] text-fuchsia-300 hover:border-cyan-400 hover:text-cyan-200'
                  }`}
                >
                  ?
                </button>
              </div>
            </div>

            {/* Cassette Preview Transport & 4-Beat Monitor */}
            <div className="mt-3 rounded border border-fuchsia-500/30 bg-[#0b021a] p-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void handleTogglePreview()}
                    className={`cursor-pointer rounded border px-3 py-1 text-[11px] font-bold tracking-wider uppercase transition ${
                      previewPlaying
                        ? 'border-cyan-300 bg-cyan-950/85 text-cyan-200 shadow-[0_0_12px_rgba(5,217,232,0.4)] hover:bg-cyan-900'
                        : 'border-pink-400/70 bg-pink-950/80 text-pink-200 shadow-[0_0_12px_rgba(255,42,109,0.3)] hover:border-pink-300 hover:bg-pink-900 hover:text-white'
                    }`}
                  >
                    {previewPlaying ? '⏸ PAUSE' : '▶ PLAY PREVIEW'}
                  </button>

                  <span className="tabular-nums text-[11px] font-semibold text-cyan-200">
                    {formatPreviewTime(previewTimeSec)} / {formatPreviewTime(durationSec)}
                  </span>

                  <span
                    className={`rounded border px-1.5 py-0.5 text-[9px] font-bold tracking-wider uppercase ${SECTION_BADGE_STYLES[sectionRole]}`}
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
                      className="cursor-pointer rounded border border-pink-500/40 bg-pink-950/50 px-2 py-0.5 text-[10px] font-bold text-pink-300 transition hover:border-pink-400 hover:bg-pink-900/70 hover:text-white"
                    >
                      SKIP TO DROP
                    </button>
                  )}
                </div>

                {/* 4-Beat Bar LEDs & Metronome Click Toggle */}
                <div className="flex items-center gap-2">
                  <div
                    className="flex items-center gap-1"
                    aria-label="4-beat bar indicator"
                  >
                    {[0, 1, 2, 3].map((beat) => {
                      const isActiveBeat = previewPlaying && beatInBar === beat;
                      const isDownbeat = beat === 0;
                      const pulseScale = isActiveBeat ? 1 + beatPulse * 0.12 : 1;
                      return (
                        <span
                          key={beat}
                          style={{ transform: `scale(${pulseScale.toFixed(3)})` }}
                          className={`inline-flex h-5 w-5 items-center justify-center rounded border text-[10px] font-black transition-colors ${
                            isActiveBeat
                              ? isDownbeat
                                ? 'border-pink-300 bg-pink-500 text-white shadow-[0_0_10px_rgba(255,42,109,0.85)]'
                                : 'border-cyan-200 bg-cyan-400 text-slate-950 shadow-[0_0_10px_rgba(5,217,232,0.8)]'
                              : isDownbeat
                                ? 'border-pink-500/45 bg-pink-950/50 text-pink-300/80'
                                : 'border-fuchsia-500/25 bg-[#120426] text-fuchsia-400/50'
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
                    className={`cursor-pointer rounded border px-2 py-1 text-[10px] font-bold tracking-wider uppercase transition ${
                      clickEnabled
                        ? 'border-emerald-400/80 bg-emerald-950/80 text-emerald-200 shadow-[0_0_10px_rgba(16,185,129,0.35)]'
                        : 'border-fuchsia-500/35 bg-[#15052e] text-fuchsia-300/80 hover:border-cyan-400/60 hover:text-cyan-200'
                    }`}
                  >
                    BEAT CLICK: {clickEnabled ? 'ON' : 'OFF'}
                  </button>
                </div>
              </div>

              {/* Section-Colored Timeline Scrubber */}
              <div className="mt-2.5">
                <div className="relative flex h-2 w-full overflow-hidden rounded bg-[#180736]">
                  {active.beatMap.sections.map((sec, sIdx) => (
                    <div
                      key={`${sec.startBar}-${sIdx}`}
                      style={{ width: `${(sec.bars / totalBars) * 100}%` }}
                      className={`h-full border-r border-[#0b021a]/60 last:border-r-0 ${SECTION_BAR_COLORS[sec.role]}`}
                      title={`${sec.role.toUpperCase()} (${sec.bars} bars)`}
                    />
                  ))}
                  <div
                    className="pointer-events-none absolute top-0 bottom-0 w-0.5 bg-white shadow-[0_0_6px_#ffffff]"
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
                  className="mt-1 h-2 w-full cursor-pointer accent-cyan-400"
                />
              </div>

              {helpOpen && (
                <div className="mt-2 rounded border border-amber-400/35 bg-amber-950/25 px-2.5 py-2 text-[10px] leading-relaxed text-fuchsia-100">
                  <div>
                    <strong className="text-pink-300">BPM (÷2 / ×2 / TAP TEMPO):</strong> Tempo of the song
                    (beats per minute) — drives road pace and gear-shift timing. Enable{' '}
                    <strong className="text-emerald-300">BEAT CLICK</strong> while listening: if ticks are twice
                    as fast or slow as the groove, press <strong className="text-white">×2</strong> or{' '}
                    <strong className="text-white">÷2</strong>, or tap along to the kick drum.
                  </div>
                  <div className="mt-1">
                    <strong className="text-cyan-300">1st Beat (BEAT -1 / +1):</strong> Moves which beat
                    counts as <strong className="text-pink-300">Beat #1</strong> (the pink LED &amp; louder click)
                    so hills and drops align cleanly with the musical phrases.
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Playlist */}
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <div className="text-[10px] tracking-widest text-fuchsia-300 uppercase">
                STAGE PLAYLIST ({items.length} {items.length === 1 ? 'TRACK' : 'TRACKS'})
              </div>
              <button
                type="button"
                onClick={handleRestoreDefaults}
                className="cursor-pointer text-[10px] tracking-wider text-fuchsia-400/80 hover:text-cyan-300 transition uppercase"
                title="Ripristina le tracce predefinite della playlist"
              >
                RESTORE DEFAULTS
              </button>
            </div>
            <div className="divide-y divide-fuchsia-500/20 rounded border border-fuchsia-500/30 bg-[#090117]">
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
                        ? 'bg-fuchsia-900/50 text-white'
                        : 'hover:bg-fuchsia-950/40 text-fuchsia-100'
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
                      className="flex min-w-0 flex-1 cursor-pointer items-center gap-2.5 text-left focus:outline-hidden"
                    >
                      <span className="text-[10px] font-bold text-pink-400">
                        {String(idx + 1).padStart(2, '0')}
                      </span>
                      <div className="min-w-0">
                        <div className="truncate font-semibold">
                          {item.beatMap.artist} — {item.beatMap.title}
                        </div>
                        <div className="truncate text-[10px] text-fuchsia-300/70">
                          {item.beatMap.sections.length} sections ·{' '}
                          {Math.round(item.beatMap.durationSec)}s · {item.beatMap.source}
                          {best
                            ? ` · BEST: ${best.bestGrade} (${best.bestScore.toLocaleString()} PTS)`
                            : ''}
                        </div>
                      </div>
                    </button>

                    <div className="flex shrink-0 items-center gap-2 text-right tabular-nums pl-2">
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
                        className={`cursor-pointer rounded border px-2 py-0.5 text-[10px] font-bold transition ${
                          isRowPlaying
                            ? 'border-cyan-300 bg-cyan-950/85 text-cyan-200 shadow-[0_0_8px_rgba(5,217,232,0.45)]'
                            : 'border-pink-500/45 bg-pink-950/60 text-pink-200 hover:border-pink-400 hover:bg-pink-900 hover:text-white'
                        }`}
                      >
                        {isRowPlaying ? '⏸' : '▶'}
                      </button>
                      {best && (
                        <span className="rounded border border-emerald-400/50 bg-emerald-950/75 px-1.5 py-0.5 text-[10px] font-black text-emerald-300">
                          {best.bestGrade}
                        </span>
                      )}
                      <span className="rounded border border-cyan-400/40 bg-cyan-950/60 px-2 py-0.5 text-[11px] font-bold text-cyan-300">
                        {item.beatMap.bpm.toFixed(1)} BPM
                      </span>
                      <button
                        type="button"
                        disabled={!canRemove}
                        onClick={(e) => handleRemoveTrack(e, idx, item)}
                        aria-label={`Rimuovi ${item.beatMap.title} dalla playlist`}
                        title={
                          canRemove
                            ? `Rimuovi "${item.beatMap.title}" dalla playlist`
                            : "Impossibile rimuovere l'unica traccia rimasta"
                        }
                        className={`rounded border px-2 py-0.5 text-[11px] font-bold transition ${
                          canRemove
                            ? 'cursor-pointer border-rose-500/40 bg-rose-950/60 text-rose-300 hover:border-rose-400 hover:bg-rose-900 hover:text-white shadow-[0_0_8px_rgba(244,63,94,0.25)]'
                            : 'cursor-not-allowed border-zinc-700/50 bg-zinc-900/40 text-zinc-600 opacity-40'
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
  );
}
