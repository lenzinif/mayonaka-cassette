import {
  nudgeBeatMapDownbeat,
  withAdjustedBpm,
  type BeatMap,
} from '@src/audio/BeatMap';
import type { ImportProgress, PlaylistItem, TrackLibrary } from '@src/audio/TrackLibrary';
import { useEffect, useRef, useState } from 'react';

export interface TrackLoaderProps {
  open: boolean;
  library: TrackLibrary;
  onSelectTrack: (item: PlaylistItem) => void;
  onUpdateBeatMap: (contentHash: string, updated: BeatMap) => void;
  onClose: () => void;
  onRemoveTrack?: (removed: PlaylistItem, newActive: PlaylistItem) => void;
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
  onSelectTrack,
  onUpdateBeatMap,
  onClose,
  onRemoveTrack,
}: TrackLoaderProps) {
  const [, setVersion] = useState(0);
  const [progress, setProgress] = useState<ImportProgress | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [tapCount, setTapCount] = useState(0);
  const tapTimesRef = useRef<number[]>([]);

  useEffect(() => {
    return library.subscribe(() => setVersion((v) => v + 1));
  }, [library]);

  if (!open) return null;

  const items = library.items;
  const active = library.activeItem;

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
        onSelectTrack(imported[0]);
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
    }
    onRemoveTrack?.(removed, library.activeItem);
  };

  const handleRestoreDefaults = () => {
    library.restoreDefaultPlaylist();
    onSelectTrack(library.activeItem);
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
      className="pointer-events-auto absolute inset-0 z-20 flex items-center justify-center bg-[#05010d]/85 p-4 font-mono text-xs text-white backdrop-blur-xs"
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
            <div className="text-[10px] tracking-[0.25em] text-cyan-300 uppercase">
              CASSETTE DECK // STAGE SOUNDTRACK
            </div>
            <h2 className="text-sm font-bold tracking-wider text-white uppercase">
              Load Your Music (Local MP3 / WAV / OGG / FLAC)
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="cursor-pointer rounded border border-pink-500/50 bg-pink-950/70 px-2.5 py-1 text-xs font-bold text-pink-200 hover:border-cyan-400 hover:text-cyan-200"
          >
            CLOSE [ESC]
          </button>
        </div>

        {/* Body */}
        <div className="flex flex-col gap-4 overflow-y-auto p-4">
          {/* Dropzone & Native File Input styled with ::file-selector-button */}
          <div
            className={`flex flex-col items-center justify-center gap-2 rounded border-2 border-dashed p-4 text-center transition ${
              isDragging
                ? 'border-cyan-300 bg-cyan-950/40'
                : 'border-fuchsia-500/40 bg-[#13042b]/70'
            }`}
          >
            <div className="text-xs font-semibold text-cyan-200">
              DRAG &amp; DROP AUDIO FILES HERE — OR PICK FROM DISK
            </div>
            <p className="text-[11px] text-fuchsia-300/75">
              Decoded &amp; analysed 100% locally in a Web Worker. Cached by SHA-256 hash in
              IndexedDB.
            </p>
            <input
              type="file"
              multiple
              accept="audio/*"
              onChange={(e) => void handleFiles(e.target.files)}
              className="mt-1 cursor-pointer text-[11px] text-fuchsia-200 file:mr-3 file:cursor-pointer file:rounded file:border file:border-cyan-400/60 file:bg-cyan-950/80 file:px-3 file:py-1 file:font-mono file:text-xs file:font-bold file:text-cyan-200 hover:file:bg-cyan-900"
            />

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

          {/* Active Track BeatMap Controls */}
          <div className="rounded border border-cyan-400/35 bg-[#13042b] p-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <div className="text-[10px] tracking-widest text-cyan-300 uppercase">
                  ACTIVE TRACK // {active.beatMap.source.toUpperCase()} GRID
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
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
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
                  onClick={handleTapTempo}
                  className="cursor-pointer rounded border border-pink-500/60 bg-pink-950/80 px-2.5 py-1 text-[11px] font-bold text-pink-200 hover:bg-pink-900"
                >
                  TAP TEMPO {tapCount > 0 ? `(${tapCount})` : ''}
                </button>
                <button
                  type="button"
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
                  onClick={() => {
                    const updated = nudgeBeatMapDownbeat(active.beatMap, 1);
                    onUpdateBeatMap(active.contentHash, updated);
                  }}
                  className="cursor-pointer rounded border border-cyan-500/40 bg-cyan-950/70 px-2 py-1 text-[11px] hover:border-cyan-300"
                >
                  BEAT +1
                </button>
              </div>
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
                title="Ripristina la playlist con le 3 tracce Future Funk predefinite"
              >
                RESTORE DEFAULTS
              </button>
            </div>
            <div className="divide-y divide-fuchsia-500/20 rounded border border-fuchsia-500/30 bg-[#090117]">
              {items.map((item, idx) => {
                const isSelected = item.contentHash === active.contentHash;
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
                          {item.beatMap.sections.length} sections //{' '}
                          {Math.round(item.beatMap.durationSec)}s // {item.beatMap.source}
                          {best
                            ? ` // BEST: ${best.bestGrade} (${best.bestScore.toLocaleString()} PTS)`
                            : ''}
                        </div>
                      </div>
                    </button>

                    <div className="flex shrink-0 items-center gap-2 text-right tabular-nums pl-2">
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
