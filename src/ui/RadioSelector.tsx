import type { RunGrade, TrackLibrary } from '@src/audio/TrackLibrary';
import type { TelemetryBridge } from '@src/core/TelemetryBridge';
import type { GameEvent, RunSummary, TelemetrySnapshot } from '@src/engine/Game';
import { useEffect, useId, useRef, useState, useSyncExternalStore } from 'react';

export interface RadioSelectorProps {
  bridge: TelemetryBridge<TelemetrySnapshot, GameEvent>;
  library: TrackLibrary;
  onRestartRun: () => void;
  onOpenTrackLoader: () => void;
}

interface StageToastInfo {
  id: number;
  stageNumber: number;
  paletteName: string;
  trackTitle: string;
  trackArtist: string;
  bpm: number;
  bestScore: number | null;
  bestGrade: RunGrade | null;
}

const GRADE_BADGE_STYLES: Readonly<Record<RunGrade, string>> = {
  SSS: 'border-amber-300 bg-amber-950/95 text-amber-200 shadow-[0_0_20px_rgba(251,191,36,0.75)]',
  S: 'border-emerald-300 bg-emerald-950/90 text-emerald-200 shadow-[0_0_16px_rgba(16,185,129,0.55)]',
  A: 'border-cyan-300 bg-cyan-950/90 text-cyan-200 shadow-[0_0_12px_rgba(5,217,232,0.45)]',
  B: 'border-pink-400 bg-pink-950/90 text-pink-200',
  C: 'border-fuchsia-400/70 bg-fuchsia-950/85 text-fuchsia-200',
};

function triggerForkKey(code: 'Digit1' | 'Digit2'): void {
  window.dispatchEvent(new KeyboardEvent('keydown', { code, bubbles: true }));
  window.dispatchEvent(new KeyboardEvent('keyup', { code, bubbles: true }));
}

/**
 * M6 Stage Fork Radio Selector, Stage Title Toast & End-of-Run Grade Screen
 * (`AGENTS.md` §3 & §5 M6, `docs/DESIGN.md` §1 & §3).
 */
export function RadioSelector({
  bridge,
  library,
  onRestartRun,
  onOpenTrackLoader,
}: RadioSelectorProps) {
  const snap = useSyncExternalStore(bridge.subscribe, bridge.getSnapshot);
  const [stageToast, setStageToast] = useState<StageToastInfo | null>(null);
  const [runSummary, setRunSummary] = useState<RunSummary | null>(null);
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const dialogTitleId = useId();

  useEffect(() => {
    let timerId = 0;
    const unsub = bridge.onEvent((event) => {
      if (event.type === 'stageTransition') {
        window.clearTimeout(timerId);
        setStageToast({
          id: Date.now(),
          stageNumber: event.stageNumber,
          paletteName: event.paletteName,
          trackTitle: event.trackTitle,
          trackArtist: event.trackArtist,
          bpm: event.bpm,
          bestScore: event.bestScore,
          bestGrade: event.bestGrade,
        });
        timerId = window.setTimeout(() => setStageToast(null), 3800);
      } else if (event.type === 'runCompleted') {
        setRunSummary(event.summary);
      }
    });

    return () => {
      unsub();
      window.clearTimeout(timerId);
    };
  }, [bridge]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (runSummary) {
      if (!dialog.open && typeof dialog.showModal === 'function') {
        dialog.showModal();
      }
    } else if (dialog.open && typeof dialog.close === 'function') {
      dialog.close();
    }
  }, [runSummary]);

  const forkActive = snap?.forkActive ?? false;
  const forkChoice = snap?.forkChoice ?? 'right';
  const forkProgress = snap?.forkProgress ?? 0;
  const leftOpt = snap?.forkLeftOption ?? null;
  const rightOpt = snap?.forkRightOption ?? null;
  const isCrossfading = snap?.isCrossfading ?? false;
  const crossfadePct = Math.round((snap?.crossfadeProgress ?? 0) * 100);

  return (
    <>
      {/* 1. Stage Fork Selector Overlay (active in the final outro bars of a multi-track playlist) */}
      {forkActive && leftOpt && rightOpt && (
        <div className="pointer-events-none absolute inset-x-0 top-20 z-10 flex justify-center px-4 font-mono select-none">
          <div className="pointer-events-auto w-full max-w-xl rounded border border-pink-400/70 bg-[#0d0221]/95 p-3 text-white shadow-[0_0_32px_rgba(255,42,109,0.45)]">
            <div className="flex items-center justify-between text-[10px] tracking-[0.2em] uppercase">
              <span className="font-bold text-amber-300">
                STAGE FORK AHEAD // STEER LANE OR PRESS [1] / [2]
              </span>
              <span className="tabular-nums text-cyan-300">
                SPLIT {Math.round(forkProgress * 100)}%
              </span>
            </div>

            <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-xs bg-fuchsia-950">
              <div
                className="h-full w-full origin-left bg-gradient-to-r from-cyan-400 via-pink-500 to-amber-300 transition-transform duration-75 will-change-transform"
                style={{ transform: `scaleX(${Math.max(0, Math.min(1, forkProgress))})` }}
              />
            </div>

            <div className="mt-2.5 grid grid-cols-2 gap-2.5">
              {/* Left Branch: Loop Current Track */}
              <button
                type="button"
                onClick={(e) => {
                  triggerForkKey('Digit1');
                  e.currentTarget.blur();
                }}
                className={`cursor-pointer rounded border p-2.5 text-left transition ${
                  forkChoice === 'left'
                    ? 'border-cyan-300 bg-cyan-950/85 shadow-[0_0_16px_rgba(5,217,232,0.5)]'
                    : 'border-fuchsia-500/35 bg-[#160530]/75 opacity-75 hover:border-cyan-400/60 hover:opacity-100'
                }`}
              >
                <div className="flex items-center justify-between text-[10px] font-bold tracking-wider uppercase">
                  <span className="text-cyan-300">◄ LEFT LANE [1]</span>
                  {forkChoice === 'left' && (
                    <span className="rounded bg-cyan-400 px-1.5 py-0.2 text-[9px] font-black text-slate-950">
                      LOCKED IN
                    </span>
                  )}
                </div>
                <div className="mt-1 text-[10px] font-bold tracking-widest text-pink-300 uppercase">
                  {leftOpt.label}
                </div>
                <div className="truncate text-xs font-bold text-white">
                  {leftOpt.artist} — {leftOpt.title}
                </div>
                <div className="mt-1 flex items-center justify-between text-[10px] text-fuchsia-200/85">
                  <span>{leftOpt.bpm.toFixed(1)} BPM</span>
                  {leftOpt.bestScore !== null && leftOpt.bestGrade !== null ? (
                    <span className="text-emerald-300">
                      BEST: {leftOpt.bestGrade} · {leftOpt.bestScore.toLocaleString()}
                    </span>
                  ) : (
                    <span className="text-fuchsia-400/70">NO RECORD YET</span>
                  )}
                </div>
              </button>

              {/* Right Branch: Next Track or Finish Run */}
              <button
                type="button"
                onClick={(e) => {
                  triggerForkKey('Digit2');
                  e.currentTarget.blur();
                }}
                className={`cursor-pointer rounded border p-2.5 text-left transition ${
                  forkChoice === 'right'
                    ? 'border-amber-300 bg-amber-950/80 shadow-[0_0_16px_rgba(251,191,36,0.5)]'
                    : 'border-fuchsia-500/35 bg-[#160530]/75 opacity-75 hover:border-amber-300/60 hover:opacity-100'
                }`}
              >
                <div className="flex items-center justify-between text-[10px] font-bold tracking-wider uppercase">
                  {forkChoice === 'right' ? (
                    <span className="rounded bg-amber-300 px-1.5 py-0.2 text-[9px] font-black text-slate-950">
                      LOCKED IN
                    </span>
                  ) : (
                    <span />
                  )}
                  <span className="text-amber-300">RIGHT LANE [2] ►</span>
                </div>
                <div className="mt-1 text-[10px] font-bold tracking-widest text-emerald-300 uppercase">
                  {rightOpt.label}
                </div>
                <div className="truncate text-xs font-bold text-white">
                  {rightOpt.mode === 'finishRun'
                    ? rightOpt.title
                    : `${rightOpt.artist} — ${rightOpt.title}`}
                </div>
                <div className="mt-1 flex items-center justify-between text-[10px] text-fuchsia-200/85">
                  <span>
                    {rightOpt.mode === 'finishRun'
                      ? rightOpt.artist
                      : `${rightOpt.bpm.toFixed(1)} BPM`}
                  </span>
                  {rightOpt.bestScore !== null && rightOpt.bestGrade !== null ? (
                    <span className="text-emerald-300">
                      BEST: {rightOpt.bestGrade} · {rightOpt.bestScore.toLocaleString()}
                    </span>
                  ) : (
                    <span className="text-cyan-300/80">NEW STAGE</span>
                  )}
                </div>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 2. Stage Title & DJ Crossfade Toast */}
      {stageToast && !forkActive && (
        <div
          key={stageToast.id}
          className="pointer-events-none absolute inset-x-0 top-20 z-10 flex justify-center px-4 font-mono select-none"
        >
          <div className="rounded border border-cyan-300/80 bg-[#0d0221]/95 px-5 py-3 text-center text-white shadow-[0_0_28px_rgba(5,217,232,0.45)]">
            <div className="text-[10px] font-bold tracking-[0.26em] text-pink-400 uppercase">
              STAGE {String(stageToast.stageNumber).padStart(2, '0')} // {stageToast.paletteName}
              {isCrossfading ? ` · 4-BAR DJ CROSSFADE (${crossfadePct}%)` : ''}
            </div>
            <div className="mt-1 text-base font-black tracking-wide text-cyan-200">
              {stageToast.trackArtist} — {stageToast.trackTitle}
            </div>
            <div className="mt-1 flex items-center justify-center gap-3 text-[11px] text-fuchsia-200">
              <span className="font-bold text-amber-300">{stageToast.bpm.toFixed(1)} BPM</span>
              {stageToast.bestScore !== null && stageToast.bestGrade !== null && (
                <span className="rounded border border-emerald-400/50 bg-emerald-950/70 px-2 py-0.2 text-[10px] font-bold text-emerald-300">
                  BEST: {stageToast.bestGrade} · {stageToast.bestScore.toLocaleString()} PTS
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 3. End-of-Run Grade Screen Modal (<dialog> opened with showModal()) */}
      <dialog
        ref={dialogRef}
        aria-labelledby={dialogTitleId}
        onClose={() => {
          if (dialogRef.current) {
            dialogRef.current.returnValue = '';
          }
          setRunSummary(null);
        }}
        className="m-auto max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded border border-pink-500/70 bg-[#0d0221] p-0 font-mono text-xs text-white shadow-[0_0_50px_rgba(255,42,109,0.5)] open:flex open:flex-col"
        style={{ colorScheme: 'dark', scrollbarColor: '#e879f9 #1a0633', scrollbarWidth: 'thin' }}
      >
        {runSummary && (
          <>
            <div className="flex items-center justify-between border-b border-fuchsia-500/40 bg-[#180538] px-5 py-3.5">
              <div>
                <div className="text-[10px] tracking-[0.25em] text-cyan-300 uppercase">
                  OUTRUN FM 88.4 // PLAYLIST RUN COMPLETE
                </div>
                <h2
                  id={dialogTitleId}
                  className="text-base font-black tracking-wider text-white uppercase"
                >
                  End-of-Run Grade &amp; Stage Records
                </h2>
              </div>
              <div
                className={`rounded border-2 px-4 py-1.5 text-center ${
                  GRADE_BADGE_STYLES[runSummary.overallGrade]
                }`}
              >
                <div className="text-[9px] tracking-widest uppercase">OVERALL GRADE</div>
                <div className="text-2xl font-black italic">{runSummary.overallGrade}</div>
              </div>
            </div>

            <div className="flex flex-col gap-4 p-5">
              {/* Aggregate Run Metrics */}
              <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-5">
                <div className="rounded border border-cyan-400/35 bg-[#14042d] p-2.5">
                  <div className="text-[10px] text-cyan-300">TOTAL SCORE</div>
                  <div className="mt-0.5 text-base font-black tabular-nums text-white">
                    {runSummary.totalScore.toLocaleString()}
                  </div>
                </div>
                <div className="rounded border border-pink-400/35 bg-[#14042d] p-2.5">
                  <div className="text-[10px] text-pink-300">PEAK GROOVE</div>
                  <div className="mt-0.5 text-base font-black tabular-nums text-white">
                    {runSummary.maxGroove}%
                  </div>
                </div>
                <div className="rounded border border-emerald-400/35 bg-[#14042d] p-2.5">
                  <div className="text-[10px] text-emerald-300">PERFECT SHIFTS</div>
                  <div className="mt-0.5 text-base font-black tabular-nums text-white">
                    {runSummary.totalPerfectShifts}
                  </div>
                </div>
                <div className="rounded border border-amber-400/35 bg-[#14042d] p-2.5">
                  <div className="text-[10px] text-amber-300">DROP SYNCS</div>
                  <div className="mt-0.5 text-base font-black tabular-nums text-white">
                    {runSummary.totalDropSyncs}
                  </div>
                </div>
                <div className="rounded border border-fuchsia-400/35 bg-[#14042d] p-2.5">
                  <div className="text-[10px] text-fuchsia-300">BUMPS / SPILLS</div>
                  <div className="mt-0.5 text-base font-black tabular-nums text-white">
                    {runSummary.totalCollisions} / {runSummary.totalSodaSpills}
                  </div>
                </div>
              </div>

              {/* Per-Stage Breakdown */}
              <div>
                <div className="mb-1.5 text-[10px] tracking-widest text-fuchsia-300 uppercase">
                  STAGE BREAKDOWN &amp; LOCAL PERSONAL BESTS ({runSummary.stages.length} STAGES)
                </div>
                <div className="divide-y divide-fuchsia-500/20 rounded border border-fuchsia-500/35 bg-[#080114]">
                  {runSummary.stages.map((st, idx) => {
                    const savedBest = library.getBestScore(st.contentHash);
                    return (
                      <div
                        key={`${st.contentHash}-${idx}`}
                        className="flex flex-wrap items-center justify-between gap-2 px-3.5 py-2.5"
                      >
                        <div className="flex items-center gap-3">
                          <span className="text-xs font-bold text-pink-400">
                            STAGE {String(st.stageNumber).padStart(2, '0')}
                          </span>
                          <div>
                            <div className="flex items-center gap-2 font-bold text-white">
                              <span>
                                {st.artist} — {st.title}
                              </span>
                              {st.isNewRecord && (
                                <span className="rounded bg-amber-300 px-1.5 py-0.2 text-[9px] font-black text-slate-950">
                                  NEW RECORD!
                                </span>
                              )}
                            </div>
                            <div className="text-[10px] text-fuchsia-300/80">
                              AVG GROOVE {st.avgGroove}% · PERFECT SHIFTS {st.perfectShifts} · DROP
                              SYNCS {st.dropSyncs}
                              {savedBest
                                ? ` · ALL-TIME BEST: ${savedBest.bestGrade} (${savedBest.bestScore.toLocaleString()})`
                                : ''}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-3 tabular-nums">
                          <span className="text-sm font-bold text-cyan-200">
                            {st.score.toLocaleString()} PTS
                          </span>
                          <span
                            className={`rounded border px-2 py-0.5 text-xs font-black ${
                              GRADE_BADGE_STYLES[st.grade]
                            }`}
                          >
                            {st.grade}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Modal Actions */}
              <div className="flex flex-wrap items-center justify-end gap-2.5 border-t border-fuchsia-500/30 pt-3">
                <button
                  type="button"
                  onClick={() => {
                    setRunSummary(null);
                    onOpenTrackLoader();
                  }}
                  className="cursor-pointer rounded border border-fuchsia-400/50 bg-fuchsia-950/80 px-3 py-1.5 text-xs font-bold text-fuchsia-200 hover:border-cyan-300 hover:text-cyan-200"
                >
                  MANAGE PLAYLIST [M]
                </button>
                <button
                  type="button"
                  autoFocus
                  onClick={() => setRunSummary(null)}
                  className="cursor-pointer rounded border border-cyan-400/60 bg-cyan-950/85 px-3.5 py-1.5 text-xs font-bold text-cyan-200 hover:bg-cyan-900"
                >
                  KEEP DRIVING (LOOP) [ESC]
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setRunSummary(null);
                    onRestartRun();
                  }}
                  className="cursor-pointer rounded border border-pink-400 bg-pink-600/90 px-4 py-1.5 text-xs font-black tracking-wider text-white shadow-[0_0_16px_rgba(255,42,109,0.5)] hover:bg-pink-500"
                >
                  RESTART PLAYLIST RUN
                </button>
              </div>
            </div>
          </>
        )}
      </dialog>
    </>
  );
}
