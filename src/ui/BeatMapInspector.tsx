import type { AnalysisDebugData } from '@src/audio/analysis.worker';
import {
  barDurationSec,
  beatDurationSec,
  firstDropBar,
  firstDropTimeSec,
  nudgeBeatMapDownbeat,
  parseTitleArtistFromFilename,
  timeToBar,
  timeToBeat,
  withAdjustedBpm,
  type BeatMap,
  type SectionRole,
} from '@src/audio/BeatMap';
import { TrackAnalyzer } from '@src/audio/TrackAnalyzer';
import { useCallback, useEffect, useRef, useState } from 'react';

interface GroundTruthEntry {
  file: string;
  bpm: number;
  firstDropSec?: number;
  notes?: string;
}

interface GroundTruthManifest {
  tracks: GroundTruthEntry[];
}

interface CorpusTrackItem {
  id: string;
  file: string;
  groundTruth?: GroundTruthEntry;
  status: 'idle' | 'loading' | 'done' | 'error';
  error?: string;
  beatMap?: BeatMap;
  debug?: AnalysisDebugData;
  audioBuffer?: AudioBuffer;
  driftVerified: boolean;
  downbeatVerified: boolean;
}

const ROLE_COLORS: Record<SectionRole, { fill: string; border: string; text: string }> = {
  intro: { fill: 'rgba(5, 217, 232, 0.16)', border: '#05d9e8', text: '#67e8f9' },
  build: { fill: 'rgba(245, 158, 11, 0.20)', border: '#f59e0b', text: '#fcd34d' },
  drop: { fill: 'rgba(255, 42, 109, 0.25)', border: '#ff2a6d', text: '#f472b6' },
  breakdown: { fill: 'rgba(168, 85, 247, 0.20)', border: '#a855f7', text: '#d8b4fe' },
  outro: { fill: 'rgba(148, 163, 184, 0.16)', border: '#94a3b8', text: '#cbd5e1' },
};

function formatSec(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec - m * 60;
  return `${m}:${s.toFixed(1).padStart(4, '0')}`;
}

export interface BeatMapInspectorProps {
  onClose?: () => void;
}

/**
 * M3a Dev Tool (`?analyze`, docs/DESIGN.md §2.4).
 *
 * Analyses the local `test-tracks/` corpus (or user-dropped audio files), compares
 * detected BeatMaps against `ground-truth.json`, plots onset/kick envelopes, per-bar
 * energy and 4-bar sections, and plays tracks with a synthesized downbeat click track.
 */
export function BeatMapInspector({ onClose }: BeatMapInspectorProps) {
  const [items, setItems] = useState<CorpusTrackItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isRunningBatch, setIsRunningBatch] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [clickEnabled, setClickEnabled] = useState(true);
  const [playheadSec, setPlayheadSec] = useState(0);

  const analyzerRef = useRef<TrackAnalyzer | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const sourceNodeRef = useRef<AudioBufferSourceNode | null>(null);
  const playStartCtxTimeRef = useRef(0);
  const playStartOffsetSecRef = useRef(0);
  const lastScheduledBeatRef = useRef<number>(-9999);
  const rafRef = useRef<number>(0);
  const plotCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const selectedItem = items.find((it) => it.id === selectedId) ?? items[0] ?? null;

  const stopPlayback = useCallback(() => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
    }
    if (sourceNodeRef.current) {
      try {
        sourceNodeRef.current.onended = null;
        sourceNodeRef.current.stop();
        sourceNodeRef.current.disconnect();
      } catch {
        // Ignore if already stopped
      }
      sourceNodeRef.current = null;
    }
    setIsPlaying(false);
  }, []);

  useEffect(() => {
    const analyzer = new TrackAnalyzer();
    analyzerRef.current = analyzer;
    return () => {
      stopPlayback();
      analyzer.dispose();
      if (audioCtxRef.current) {
        void audioCtxRef.current.close();
        audioCtxRef.current = null;
      }
    };
  }, [stopPlayback]);

  const evaluateInitialVerification = (
    beatMap: BeatMap,
    gt?: GroundTruthEntry,
  ): { driftVerified: boolean; downbeatVerified: boolean } => {
    if (!gt) {
      return {
        driftVerified: beatMap.confidence.tempoStable,
        downbeatVerified: beatMap.confidence.downbeat >= 0.6,
      };
    }
    const bpmErr = Math.abs(beatMap.bpm - gt.bpm);
    const driftVerified = bpmErr <= 0.35 && beatMap.confidence.tempoStable;
    let downbeatVerified = beatMap.confidence.downbeat >= 0.6;
    if (typeof gt.firstDropSec === 'number') {
      const beatsToDrop =
        (gt.firstDropSec - beatMap.firstBeatOffsetSec) / beatDurationSec(beatMap);
      const modBar = ((beatsToDrop % 4) + 4) % 4;
      const errBeats = Math.min(modBar, 4 - modBar);
      downbeatVerified = errBeats <= 0.65;
    }
    return { driftVerified, downbeatVerified };
  };

  const analyzeCorpusList = useCallback(async (initialItems: CorpusTrackItem[]) => {
    const analyzer = analyzerRef.current;
    if (!analyzer) return;
    setIsRunningBatch(true);

    for (const item of initialItems) {
      setItems((prev) =>
        prev.map((it) => (it.id === item.id ? { ...it, status: 'loading', error: undefined } : it)),
      );
      try {
        const url = `/test-tracks/${encodeURIComponent(item.file)}`;
        const resp = await fetch(url);
        if (!resp.ok) throw new Error(`HTTP ${resp.status} loading ${item.file}`);
        const bytes = await resp.arrayBuffer();
        const parsed = parseTitleArtistFromFilename(item.file);
        const { result, audioBuffer } = await analyzer.analyzeAudioBytes(bytes, {
          filename: item.file,
          title: parsed.title,
          artist: parsed.artist,
          includeDebugEnvelopes: true,
        });

        const { driftVerified, downbeatVerified } = evaluateInitialVerification(
          result.beatMap,
          item.groundTruth,
        );

        setItems((prev) =>
          prev.map((it) =>
            it.id === item.id
              ? {
                  ...it,
                  status: 'done',
                  beatMap: result.beatMap,
                  debug: result.debug,
                  audioBuffer,
                  driftVerified,
                  downbeatVerified,
                }
              : it,
          ),
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        setItems((prev) =>
          prev.map((it) => (it.id === item.id ? { ...it, status: 'error', error: message } : it)),
        );
      }
    }

    setIsRunningBatch(false);
  }, []);

  // Load ground-truth.json on mount and trigger corpus analysis
  useEffect(() => {
    let cancelled = false;
    async function loadManifest() {
      try {
        const res = await fetch('/test-tracks/ground-truth.json');
        if (!res.ok) return;
        const manifest = (await res.json()) as GroundTruthManifest;
        if (cancelled || !Array.isArray(manifest.tracks)) return;
        const loaded: CorpusTrackItem[] = manifest.tracks.map((gt) => ({
          id: gt.file,
          file: gt.file,
          groundTruth: gt,
          status: 'idle',
          driftVerified: false,
          downbeatVerified: false,
        }));
        setItems(loaded);
        if (loaded[0]) setSelectedId(loaded[0].id);
        void analyzeCorpusList(loaded);
      } catch {
        // Corpus folder not present; user can still drop files manually
      }
    }
    void loadManifest();
    return () => {
      cancelled = true;
    };
  }, [analyzeCorpusList]);

  const handleFilesSelected = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0 || !analyzerRef.current) return;
    const files = Array.from(fileList);
    for (const file of files) {
      const id = `local:${file.name}:${file.size}`;
      const existingGt = items.find((it) => it.file === file.name)?.groundTruth;
      setItems((prev) => {
        const exists = prev.some((it) => it.id === id || it.file === file.name);
        if (exists) {
          return prev.map((it) =>
            it.id === id || it.file === file.name ? { ...it, status: 'loading' } : it,
          );
        }
        return [
          ...prev,
          {
            id,
            file: file.name,
            groundTruth: existingGt,
            status: 'loading',
            driftVerified: false,
            downbeatVerified: false,
          },
        ];
      });
      setSelectedId((prev) => prev ?? id);

      try {
        const { beatMap, result, audioBuffer } = await analyzerRef.current.analyzeFile(file, {
          includeDebugEnvelopes: true,
        });
        const { driftVerified, downbeatVerified } = evaluateInitialVerification(
          beatMap,
          existingGt,
        );
        setItems((prev) =>
          prev.map((it) =>
            it.id === id || it.file === file.name
              ? {
                  ...it,
                  status: 'done',
                  beatMap,
                  debug: result.debug,
                  audioBuffer,
                  driftVerified,
                  downbeatVerified,
                }
              : it,
          ),
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        setItems((prev) =>
          prev.map((it) =>
            it.id === id || it.file === file.name
              ? { ...it, status: 'error', error: message }
              : it,
          ),
        );
      }
    }
  };

  // Schedule synthesized woodblock/beep click on beat crossings
  const triggerClickSound = useCallback((ctx: AudioContext, when: number, isDownbeat: boolean) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = isDownbeat ? 'triangle' : 'sine';
    osc.frequency.setValueAtTime(isDownbeat ? 1320 : 780, when);
    osc.frequency.exponentialRampToValueAtTime(isDownbeat ? 660 : 390, when + 0.035);

    gain.gain.setValueAtTime(isDownbeat ? 0.42 : 0.22, when);
    gain.gain.exponentialRampToValueAtTime(0.001, when + 0.04);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(when);
    osc.stop(when + 0.045);
  }, []);

  const startPlaybackAt = useCallback(
    async (offsetSec: number) => {
      if (!selectedItem?.audioBuffer || !selectedItem.beatMap) return;
      stopPlayback();

      // Lazy AudioContext creation inside user interaction handler (AGENTS.md §4.5)
      if (!audioCtxRef.current) {
        audioCtxRef.current = new AudioContext();
      }
      const ctx = audioCtxRef.current;
      if (ctx.state === 'suspended') {
        await ctx.resume();
      }

      const clampedOffset = Math.max(
        0,
        Math.min(selectedItem.audioBuffer.duration - 0.1, offsetSec),
      );
      const src = ctx.createBufferSource();
      src.buffer = selectedItem.audioBuffer;
      src.connect(ctx.destination);

      const startAt = ctx.currentTime + 0.02;
      src.start(startAt, clampedOffset);
      sourceNodeRef.current = src;
      playStartCtxTimeRef.current = startAt;
      playStartOffsetSecRef.current = clampedOffset;

      const initialBeat = Math.floor(timeToBeat(selectedItem.beatMap, clampedOffset));
      lastScheduledBeatRef.current = initialBeat;
      setPlayheadSec(clampedOffset);
      setIsPlaying(true);

      src.onended = () => {
        setIsPlaying(false);
      };
    },
    [selectedItem, stopPlayback],
  );

  // Animation loop updating playhead and scheduling click track
  useEffect(() => {
    if (!isPlaying || !selectedItem?.beatMap || !audioCtxRef.current) return;
    const beatMap = selectedItem.beatMap;
    const ctx = audioCtxRef.current;

    const tick = () => {
      const curSec = playStartOffsetSecRef.current + Math.max(0, ctx.currentTime - playStartCtxTimeRef.current);
      setPlayheadSec(curSec);

      if (clickEnabled) {
        // Look ahead 45 ms to schedule sample-accurate click beeps
        const lookaheadSec = curSec + 0.045;
        const beatFloat = timeToBeat(beatMap, lookaheadSec);
        const beatIdx = Math.floor(beatFloat);
        if (beatIdx > lastScheduledBeatRef.current && beatIdx >= 0) {
          for (let b = lastScheduledBeatRef.current + 1; b <= beatIdx; b++) {
            const beatTimeInSong = beatMap.firstBeatOffsetSec + b * beatDurationSec(beatMap);
            const audioWhen =
              playStartCtxTimeRef.current + (beatTimeInSong - playStartOffsetSecRef.current);
            if (audioWhen >= ctx.currentTime - 0.01) {
              const isDownbeat = ((b % 4) + 4) % 4 === 0;
              triggerClickSound(ctx, Math.max(ctx.currentTime, audioWhen), isDownbeat);
            }
          }
          lastScheduledBeatRef.current = beatIdx;
        }
      }

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [isPlaying, selectedItem, clickEnabled, triggerClickSound]);

  // Draw timeline canvas (sections, barEnergy, onset/kick envelopes, ground-truth drop, playhead)
  useEffect(() => {
    const canvas = plotCanvasRef.current;
    if (!canvas || !selectedItem?.beatMap) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { beatMap, debug, groundTruth } = selectedItem;
    const w = canvas.width;
    const h = canvas.height;
    const dur = Math.max(1, beatMap.durationSec);

    ctx.fillStyle = '#090117';
    ctx.fillRect(0, 0, w, h);

    // 1. Section background blocks
    for (const sec of beatMap.sections) {
      const t0 = beatMap.firstBeatOffsetSec + sec.startBar * barDurationSec(beatMap);
      const t1 = t0 + sec.bars * barDurationSec(beatMap);
      const x0 = (t0 / dur) * w;
      const x1 = (t1 / dur) * w;
      const style = ROLE_COLORS[sec.role];

      ctx.fillStyle = style.fill;
      ctx.fillRect(x0, 0, Math.max(1, x1 - x0), h);

      ctx.strokeStyle = style.border;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x0, 0);
      ctx.lineTo(x0, h);
      ctx.stroke();

      if (x1 - x0 > 34) {
        ctx.fillStyle = style.text;
        ctx.font = 'bold 10px monospace';
        ctx.fillText(`${sec.role.toUpperCase()} (${sec.startBar})`, x0 + 4, 13);
      }
    }

    // 2. Bar energy bars (lower 65% of canvas)
    const barDur = barDurationSec(beatMap);
    for (let b = 0; b < beatMap.barEnergy.length; b++) {
      const e = beatMap.barEnergy[b]!;
      const t0 = beatMap.firstBeatOffsetSec + b * barDur;
      const x0 = (t0 / dur) * w;
      const bw = Math.max(1, (barDur / dur) * w - 1);
      const bh = e * (h * 0.58);
      ctx.fillStyle = 'rgba(217, 70, 239, 0.38)';
      ctx.fillRect(x0, h - bh, bw, bh);
    }

    // 3. Onset & Kick envelopes
    if (debug) {
      const drawCurve = (arr: Float32Array, color: string, yBase: number, ampH: number) => {
        if (arr.length === 0) return;
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        for (let i = 0; i < arr.length; i++) {
          const x = (i / (arr.length - 1)) * w;
          const y = yBase - arr[i]! * ampH;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      };
      drawCurve(debug.onsetPreview, 'rgba(5, 217, 232, 0.75)', h - 2, h * 0.42);
      drawCurve(debug.kickPreview, 'rgba(250, 204, 21, 0.75)', h - 2, h * 0.35);
    }

    // 4. Detected first drop line (solid magenta) & Ground Truth firstDropSec (dashed green)
    const detDropSec = firstDropTimeSec(beatMap);
    if (detDropSec !== null) {
      const x = (detDropSec / dur) * w;
      ctx.strokeStyle = '#ff2a6d';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }

    if (typeof groundTruth?.firstDropSec === 'number') {
      const x = (groundTruth.firstDropSec / dur) * w;
      ctx.save();
      ctx.strokeStyle = '#4ade80';
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
      ctx.fillStyle = '#4ade80';
      ctx.font = 'bold 10px monospace';
      ctx.fillText(`GT DROP ${groundTruth.firstDropSec}s`, Math.min(w - 95, x + 4), h - 8);
      ctx.restore();
    }

    // 5. Playhead cursor
    const px = (playheadSec / dur) * w;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(px, 0);
    ctx.lineTo(px, h);
    ctx.stroke();
  }, [selectedItem, playheadSec]);

  const updateSelectedBeatMap = (updater: (map: BeatMap) => BeatMap) => {
    if (!selectedItem?.beatMap) return;
    const updated = updater(selectedItem.beatMap);
    const { driftVerified, downbeatVerified } = evaluateInitialVerification(
      updated,
      selectedItem.groundTruth,
    );
    setItems((prev) =>
      prev.map((it) =>
        it.id === selectedItem.id
          ? { ...it, beatMap: updated, driftVerified, downbeatVerified }
          : it,
      ),
    );
  };

  // Compute corpus scorecard metrics (docs/DESIGN.md §2.4)
  const completedWithGt = items.filter((it) => it.status === 'done' && it.beatMap && it.groundTruth);
  const totalGt = completedWithGt.length;

  let exactCount = 0;
  let octaveOrExactCount = 0;
  let driftOkCount = 0;
  let downbeatOkCount = 0;
  let dropOkCount = 0;
  let dropTotal = 0;
  let maxAnalysisMs = 0;

  for (const it of completedWithGt) {
    const bm = it.beatMap!;
    const gt = it.groundTruth!;
    const err = Math.abs(bm.bpm - gt.bpm);
    const exact = err <= 0.5;
    const octave =
      Math.abs(bm.bpm * 2 - gt.bpm) <= 1.0 || Math.abs(bm.bpm * 0.5 - gt.bpm) <= 0.5;
    if (exact) exactCount++;
    if (exact || octave) octaveOrExactCount++;
    if (it.driftVerified) driftOkCount++;
    if (it.downbeatVerified) downbeatOkCount++;

    if (typeof gt.firstDropSec === 'number') {
      dropTotal++;
      const detSec = firstDropTimeSec(bm) ?? 0;
      const diffBars = Math.abs(detSec - gt.firstDropSec) / barDurationSec(bm);
      if (diffBars <= 2.35) dropOkCount++;
    }
    const ms = it.debug?.analysisTimeMs ?? 0;
    if (ms > maxAnalysisMs) maxAnalysisMs = ms;
  }

  const dropPct = dropTotal > 0 ? Math.round((dropOkCount / dropTotal) * 100) : 100;

  return (
    <div
      className="pointer-events-auto absolute inset-0 z-30 flex flex-col overflow-hidden bg-[#070112]/95 font-mono text-xs text-fuchsia-100 backdrop-blur-md"
      style={{ colorScheme: 'dark', scrollbarColor: '#e879f9 #1a0633', scrollbarWidth: 'thin' }}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        void handleFilesSelected(e.dataTransfer.files);
      }}
    >
      {/* Header */}
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-fuchsia-500/40 bg-[#120329] px-4 py-2.5">
        <div className="flex items-center gap-3">
          <span className="rounded bg-pink-600 px-2 py-0.5 text-[11px] font-bold tracking-widest text-white uppercase">
            M3A GATE
          </span>
          <h1 className="text-sm font-bold tracking-wider text-cyan-300 uppercase">
            BeatMap Inspector // Corpus &amp; DSP Validation
          </h1>
        </div>

        <div className="flex items-center gap-2">
          <label className="cursor-pointer rounded border border-cyan-400/50 bg-cyan-950/60 px-2.5 py-1 text-[11px] font-semibold text-cyan-200 transition hover:bg-cyan-900/70">
            + LOAD AUDIO FILES
            <input
              type="file"
              multiple
              accept="audio/*"
              className="hidden"
              onChange={(e) => void handleFilesSelected(e.target.files)}
            />
          </label>
          <button
            type="button"
            disabled={isRunningBatch || items.length === 0}
            onClick={() => void analyzeCorpusList(items)}
            className="cursor-pointer rounded border border-fuchsia-400/50 bg-fuchsia-950/70 px-2.5 py-1 text-[11px] font-semibold text-fuchsia-200 transition hover:bg-fuchsia-900/80 disabled:opacity-50"
          >
            {isRunningBatch ? 'ANALYZING CORPUS…' : 'RE-RUN CORPUS'}
          </button>
          {onClose && (
            <button
              type="button"
              onClick={() => {
                stopPlayback();
                onClose();
              }}
              className="cursor-pointer rounded border border-pink-500/60 bg-pink-950/80 px-2.5 py-1 text-[11px] font-bold text-pink-200 hover:bg-pink-900"
            >
              BACK TO GAME
            </button>
          )}
        </div>
      </header>

      {/* Exit Criteria Scorecard (docs/DESIGN.md §2.4) */}
      <div className="grid grid-cols-2 gap-2 border-b border-fuchsia-500/30 bg-[#0d0221] px-4 py-2 sm:grid-cols-6">
        <ScoreCard
          label="Exact BPM (±0.5)"
          value={`${exactCount} / ${totalGt || 15}`}
          target="≥ 12 / 15"
          pass={totalGt >= 12 && exactCount >= 12}
        />
        <ScoreCard
          label="Exact or ×2/÷2"
          value={`${octaveOrExactCount} / ${totalGt || 15}`}
          target="≥ 14 / 15"
          pass={totalGt >= 14 && octaveOrExactCount >= 14}
        />
        <ScoreCard
          label="Last 30s Sync"
          value={`${driftOkCount} / ${totalGt || 15}`}
          target="≥ 12 / 15"
          pass={totalGt >= 12 && driftOkCount >= 12}
        />
        <ScoreCard
          label="Downbeat on '1'"
          value={`${downbeatOkCount} / ${totalGt || 15}`}
          target="≥ 10 / 15"
          pass={totalGt >= 10 && downbeatOkCount >= 10}
        />
        <ScoreCard
          label="1st Drop (±2 bars)"
          value={`${dropPct}% (${dropOkCount}/${dropTotal})`}
          target="≥ 70%"
          pass={dropTotal > 0 && dropPct >= 70}
        />
        <ScoreCard
          label="Max DSP Time"
          value={`${maxAnalysisMs.toFixed(0)} ms`}
          target="< 3000 ms"
          pass={maxAnalysisMs > 0 && maxAnalysisMs < 3000}
        />
      </div>

      {/* Main Split View: Track Table + Selected Track Detail */}
      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-12">
        {/* Left: Corpus Table */}
        <div className="overflow-y-auto border-b border-fuchsia-500/30 lg:col-span-5 lg:border-r lg:border-b-0">
          <table className="w-full border-collapse text-left text-[11px]">
            <thead className="sticky top-0 bg-[#160530] text-[10px] tracking-wider text-cyan-300 uppercase">
              <tr>
                <th className="px-3 py-2">Track</th>
                <th className="px-2 py-2 text-right">GT</th>
                <th className="px-2 py-2 text-right">Det BPM</th>
                <th className="px-2 py-2 text-right">1st Drop</th>
                <th className="px-2 py-2 text-center">Time</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-fuchsia-500/15">
              {items.map((it) => {
                const isSelected = it.id === selectedItem?.id;
                const bm = it.beatMap;
                const gt = it.groundTruth;
                const bpmErr = bm && gt ? Math.abs(bm.bpm - gt.bpm) : null;
                const isExact = bpmErr !== null && bpmErr <= 0.5;
                const detDropSec = bm ? (firstDropTimeSec(bm) ?? 0) : null;
                const dropDiffBars =
                  bm && typeof gt?.firstDropSec === 'number' && detDropSec !== null
                    ? Math.abs(detDropSec - gt.firstDropSec) / barDurationSec(bm)
                    : null;
                const dropPass = dropDiffBars !== null && dropDiffBars <= 2.35;

                return (
                  <tr
                    key={it.id}
                    onClick={() => {
                      stopPlayback();
                      setSelectedId(it.id);
                      setPlayheadSec(0);
                    }}
                    className={`cursor-pointer transition ${
                      isSelected ? 'bg-fuchsia-900/45' : 'hover:bg-fuchsia-950/40'
                    }`}
                  >
                    <td className="max-w-[180px] truncate px-3 py-1.5 font-medium text-white">
                      {it.file}
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums text-fuchsia-300">
                      {gt ? gt.bpm : '—'}
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums">
                      {it.status === 'loading' && (
                        <span className="text-amber-300">analyzing…</span>
                      )}
                      {it.status === 'error' && <span className="text-rose-400">ERR</span>}
                      {bm && (
                        <span
                          className={
                            bpmErr === null
                              ? 'text-cyan-300'
                              : isExact
                                ? 'font-bold text-emerald-400'
                                : 'text-amber-300'
                          }
                        >
                          {bm.bpm.toFixed(2)}
                        </span>
                      )}
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums">
                      {bm && detDropSec !== null ? (
                        <span
                          className={
                            dropDiffBars === null
                              ? 'text-cyan-200'
                              : dropPass
                                ? 'text-emerald-400'
                                : 'text-amber-300'
                          }
                        >
                          {detDropSec.toFixed(1)}s
                          {gt?.firstDropSec !== undefined ? ` / ${gt.firstDropSec}s` : ''}
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="px-2 py-1.5 text-center tabular-nums text-fuchsia-300/75">
                      {it.debug ? `${it.debug.analysisTimeMs.toFixed(0)}ms` : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Right: Selected Track Inspector & Click-Track Player */}
        <div className="flex flex-col justify-between gap-3 overflow-y-auto p-4 lg:col-span-7">
          {selectedItem?.beatMap ? (
            <>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="text-[10px] tracking-widest text-cyan-300 uppercase">
                    {selectedItem.beatMap.artist} // {selectedItem.beatMap.contentHash.slice(0, 19)}…
                  </div>
                  <h2 className="text-base font-bold text-white">{selectedItem.beatMap.title}</h2>
                  {selectedItem.groundTruth?.notes && (
                    <p className="mt-0.5 text-[11px] text-fuchsia-300/80">
                      {selectedItem.groundTruth.notes}
                    </p>
                  )}
                </div>

                {/* BPM & Downbeat Nudge Controls */}
                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() =>
                      updateSelectedBeatMap((m) => withAdjustedBpm(m, m.bpm * 0.5))
                    }
                    className="cursor-pointer rounded border border-fuchsia-500/40 bg-fuchsia-950/70 px-2 py-1 text-[11px] hover:border-cyan-400"
                  >
                    ÷2 BPM
                  </button>
                  <button
                    type="button"
                    onClick={() => updateSelectedBeatMap((m) => withAdjustedBpm(m, m.bpm * 2))}
                    className="cursor-pointer rounded border border-fuchsia-500/40 bg-fuchsia-950/70 px-2 py-1 text-[11px] hover:border-cyan-400"
                  >
                    ×2 BPM
                  </button>
                  <button
                    type="button"
                    onClick={() => updateSelectedBeatMap((m) => nudgeBeatMapDownbeat(m, -1))}
                    className="cursor-pointer rounded border border-cyan-500/40 bg-cyan-950/60 px-2 py-1 text-[11px] hover:border-cyan-300"
                  >
                    BEAT -1
                  </button>
                  <button
                    type="button"
                    onClick={() => updateSelectedBeatMap((m) => nudgeBeatMapDownbeat(m, 1))}
                    className="cursor-pointer rounded border border-cyan-500/40 bg-cyan-950/60 px-2 py-1 text-[11px] hover:border-cyan-300"
                  >
                    BEAT +1
                  </button>
                </div>
              </div>

              {/* Telemetry Stats Row */}
              <div className="grid grid-cols-2 gap-2 rounded border border-fuchsia-500/30 bg-[#120329]/80 p-2.5 sm:grid-cols-5">
                <div>
                  <div className="text-[10px] text-fuchsia-300/70 uppercase">Detected BPM</div>
                  <div className="text-sm font-bold text-cyan-300">
                    {selectedItem.beatMap.bpm.toFixed(2)}
                    {selectedItem.groundTruth && (
                      <span className="ml-1 text-[11px] text-fuchsia-300">
                        (GT {selectedItem.groundTruth.bpm})
                      </span>
                    )}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] text-fuchsia-300/70 uppercase">1st Downbeat</div>
                  <div className="text-sm font-bold text-white">
                    {selectedItem.beatMap.firstBeatOffsetSec.toFixed(3)} s
                  </div>
                </div>
                <div>
                  <div className="text-[10px] text-fuchsia-300/70 uppercase">1st Drop</div>
                  <div className="text-sm font-bold text-pink-400">
                    Bar {firstDropBar(selectedItem.beatMap) ?? 0} (
                    {(firstDropTimeSec(selectedItem.beatMap) ?? 0).toFixed(1)}s)
                  </div>
                </div>
                <div>
                  <div className="text-[10px] text-fuchsia-300/70 uppercase">Confidence</div>
                  <div className="text-sm font-bold text-emerald-300">
                    T:{Math.round(selectedItem.beatMap.confidence.tempo * 100)}% D:
                    {Math.round(selectedItem.beatMap.confidence.downbeat * 100)}%
                  </div>
                </div>
                <div>
                  <div className="text-[10px] text-fuchsia-300/70 uppercase">Grid Stability</div>
                  <div className="text-sm font-bold">
                    {selectedItem.beatMap.confidence.tempoStable ? (
                      <span className="text-emerald-400">STABLE</span>
                    ) : (
                      <span className="text-amber-400">UNSTABLE</span>
                    )}
                  </div>
                </div>
              </div>

              {/* Interactive Timeline Canvas */}
              <div className="flex flex-col gap-1">
                <div className="flex items-center justify-between text-[10px] text-fuchsia-300/80">
                  <span>
                    TIMELINE (CLICK TO SEEK) — <span className="text-cyan-300">CYAN: ONSET</span> /{' '}
                    <span className="text-yellow-300">YELLOW: &lt;150Hz KICK</span> /{' '}
                    <span className="text-fuchsia-400">BARS: ENERGY</span> /{' '}
                    <span className="text-emerald-400">DASHED: GT DROP</span>
                  </span>
                  <span className="tabular-nums text-white">
                    {formatSec(playheadSec)} / {formatSec(selectedItem.beatMap.durationSec)} (Bar{' '}
                    {Math.max(0, timeToBar(selectedItem.beatMap, playheadSec))})
                  </span>
                </div>
                <canvas
                  ref={plotCanvasRef}
                  width={760}
                  height={190}
                  onClick={(e) => {
                    const rect = e.currentTarget.getBoundingClientRect();
                    const ratio = Math.max(
                      0,
                      Math.min(1, (e.clientX - rect.left) / Math.max(1, rect.width)),
                    );
                    const targetSec = ratio * selectedItem.beatMap!.durationSec;
                    void startPlaybackAt(targetSec);
                  }}
                  className="h-44 w-full cursor-crosshair rounded border border-fuchsia-500/40 bg-[#090117]"
                />
              </div>

              {/* Playback & Listening Test Controls */}
              <div className="flex flex-wrap items-center justify-between gap-2 rounded border border-cyan-500/30 bg-[#0d0221] p-2.5">
                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      if (isPlaying) stopPlayback();
                      else void startPlaybackAt(playheadSec);
                    }}
                    className="cursor-pointer rounded bg-pink-600 px-3 py-1.5 font-bold text-white shadow hover:bg-pink-500"
                  >
                    {isPlaying ? 'PAUSE' : 'PLAY WITH CLICK'}
                  </button>
                  <button
                    type="button"
                    onClick={() => void startPlaybackAt(0)}
                    className="cursor-pointer rounded border border-fuchsia-500/40 bg-fuchsia-950/70 px-2.5 py-1.5 hover:border-cyan-400"
                  >
                    0:00
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      void startPlaybackAt(
                        Math.max(0, (firstDropTimeSec(selectedItem.beatMap!) ?? 0) - 2),
                      )
                    }
                    className="cursor-pointer rounded border border-fuchsia-500/40 bg-fuchsia-950/70 px-2.5 py-1.5 hover:border-cyan-400"
                  >
                    JUMP TO 1ST DROP
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      void startPlaybackAt(Math.max(0, selectedItem.beatMap!.durationSec - 30))
                    }
                    className="cursor-pointer rounded border border-cyan-400/50 bg-cyan-950/70 px-2.5 py-1.5 text-cyan-200 hover:border-cyan-300"
                  >
                    LAST 30S (DRIFT TEST)
                  </button>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <label className="flex cursor-pointer items-center gap-1.5 text-[11px] text-cyan-200">
                    <input
                      type="checkbox"
                      checked={clickEnabled}
                      onChange={(e) => setClickEnabled(e.target.checked)}
                      className="accent-pink-500"
                    />
                    METRONOME CLICK
                  </label>
                  <label className="flex cursor-pointer items-center gap-1.5 text-[11px] text-emerald-300">
                    <input
                      type="checkbox"
                      checked={selectedItem.driftVerified}
                      onChange={(e) => {
                        const checked = e.target.checked;
                        setItems((prev) =>
                          prev.map((it) =>
                            it.id === selectedItem.id ? { ...it, driftVerified: checked } : it,
                          ),
                        );
                      }}
                      className="accent-emerald-400"
                    />
                    30s Sync OK
                  </label>
                  <label className="flex cursor-pointer items-center gap-1.5 text-[11px] text-emerald-300">
                    <input
                      type="checkbox"
                      checked={selectedItem.downbeatVerified}
                      onChange={(e) => {
                        const checked = e.target.checked;
                        setItems((prev) =>
                          prev.map((it) =>
                            it.id === selectedItem.id ? { ...it, downbeatVerified: checked } : it,
                          ),
                        );
                      }}
                      className="accent-emerald-400"
                    />
                    Beat 1 OK
                  </label>
                </div>
              </div>
            </>
          ) : (
            <div className="flex h-full items-center justify-center text-fuchsia-300/60">
              {isRunningBatch
                ? 'Analyzing corpus tracks in Web Worker…'
                : 'Select a track or drop audio files to inspect BeatMap.'}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ScoreCard({
  label,
  value,
  target,
  pass,
}: {
  label: string;
  value: string;
  target: string;
  pass: boolean;
}) {
  return (
    <div
      className={`rounded border px-2.5 py-1.5 ${
        pass
          ? 'border-emerald-500/40 bg-emerald-950/30'
          : 'border-amber-500/40 bg-amber-950/25'
      }`}
    >
      <div className="flex items-center justify-between text-[10px] text-fuchsia-200/80">
        <span>{label}</span>
        <span className={pass ? 'font-bold text-emerald-400' : 'text-amber-300'}>
          {pass ? 'PASS' : `TARGET ${target}`}
        </span>
      </div>
      <div className="mt-0.5 text-sm font-bold tabular-nums text-white">{value}</div>
    </div>
  );
}
