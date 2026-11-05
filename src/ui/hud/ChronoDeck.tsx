export interface ChronoDeckProps {
  stageNumber: number;
  stagePaletteName: string;
  stageScore: number;
  bestSongGrade: string | null;
  bestSongScore: number | null;
  lap: number;
  lapTime: number;
  lastLapTime: number | null;
  roadBarIndex: number;
  totalBars: number;
  currentChunkId: string;
  playlistIndex: number;
  playlistLength: number;
  cleanHud: boolean;
}

function formatLapTime(seconds: number): string {
  const totalHundredths = Math.round(seconds * 100);
  const hundredths = totalHundredths % 100;
  const totalSecs = Math.floor(totalHundredths / 100);
  const secs = totalSecs % 60;
  const mins = Math.floor(totalSecs / 60);
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${String(hundredths).padStart(2, '0')}`;
}

/**
 * 1980s Retro Chronograph & Stage Telemetry Deck.
 * Inspired by mechanical rolling odometers and arcade race chronos.
 */
export function ChronoDeck({
  stageNumber,
  stagePaletteName,
  stageScore,
  bestSongGrade,
  bestSongScore,
  lap,
  lapTime,
  lastLapTime,
  roadBarIndex,
  totalBars,
  currentChunkId,
  playlistIndex,
  playlistLength,
  cleanHud,
}: ChronoDeckProps) {
  const roadProgressRatio = Math.max(0, Math.min(1, (roadBarIndex + 1) / Math.max(1, totalBars)));

  return (
    <div className="flex min-w-[200px] flex-col justify-between rounded border border-fuchsia-500/40 bg-[#090217]/92 px-3 py-2 shadow-[0_0_20px_rgba(255,42,109,0.18)] backdrop-blur-md select-none [contain:layout_style_paint]">
      {/* Top Header Strip: Stage & Playlist track */}
      <div className="flex items-center justify-between gap-2 border-b border-fuchsia-500/25 pb-1 text-[9px] tracking-[0.2em] uppercase">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-pink-500 shadow-[0_0_6px_#ff2a6d]" />
          <span className="truncate font-bold text-cyan-300">
            STAGE {String(stageNumber).padStart(2, '0')} // {stagePaletteName}
          </span>
        </div>
        {playlistLength > 1 && (
          <span className="shrink-0 rounded border border-fuchsia-400/40 bg-fuchsia-950/70 px-1 py-0.2 text-[8px] font-bold tabular-nums text-fuchsia-200">
            TRK {playlistIndex + 1}/{playlistLength}
          </span>
        )}
      </div>

      {/* Score & PB Row */}
      <div className="my-1 flex items-baseline justify-between gap-3">
        <div className="flex items-baseline gap-1.5">
          <span className="text-[9px] tracking-widest text-fuchsia-300/75 uppercase">
            SCORE
          </span>
          <span className="text-base font-black tabular-nums tracking-tight text-amber-300 [text-shadow:0_0_10px_rgba(251,191,36,0.45)]">
            {stageScore.toLocaleString()}
          </span>
          <span className="text-[9px] font-bold text-amber-300/80">PTS</span>
        </div>
        {bestSongGrade && bestSongScore !== null ? (
          <span className="rounded border border-emerald-400/40 bg-emerald-950/70 px-1.5 py-0.2 text-[8px] font-bold tabular-nums text-emerald-300">
            BEST {bestSongGrade} · {bestSongScore.toLocaleString()}
          </span>
        ) : (
          <span className="text-[8px] tracking-widest text-fuchsia-400/60 uppercase">
            OUTRUN ARCADE
          </span>
        )}
      </div>

      {/* Lap Counter & Rolling Chronograph */}
      <div className="flex items-baseline justify-between gap-3 text-xs">
        <div className="flex items-baseline gap-2">
          <span className="rounded bg-pink-500/20 px-1.5 py-0.5 text-[9px] font-black tracking-wider text-pink-400 border border-pink-500/40">
            LAP {lap}
          </span>
          <span className="text-sm font-bold tabular-nums tracking-tight text-fuchsia-100">
            {formatLapTime(lapTime)}
          </span>
        </div>
        {lastLapTime !== null && (
          <span className="text-[9px] tabular-nums text-fuchsia-300/80">
            LAST {formatLapTime(lastLapTime)}
          </span>
        )}
      </div>

      {/* Song Road Progress Bar */}
      {!cleanHud && (
        <div className="mt-1 border-t border-fuchsia-500/20 pt-1">
          <div className="flex items-center justify-between gap-2 text-[8px] tabular-nums text-fuchsia-300/80">
            <span className="truncate max-w-[130px]">
              ROAD {String(roadBarIndex + 1).padStart(2, '0')}/{totalBars} · {currentChunkId}
            </span>
            <span className="text-cyan-300">{Math.round(roadProgressRatio * 100)}%</span>
          </div>
          <div className="mt-0.5 h-1 w-full overflow-hidden rounded-xs bg-[#060112]">
            <div
              className="h-full w-full origin-left bg-gradient-to-r from-cyan-400 via-pink-500 to-amber-300 transition-transform duration-100 ease-linear will-change-transform"
              style={{ transform: `scaleX(${roadProgressRatio})` }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
