import type { RunGrade, TrackLibrary } from '@src/audio/TrackLibrary';
import type { TelemetryBridge } from '@src/core/TelemetryBridge';
import type { GameEvent, RunSummary, TelemetrySnapshot } from '@src/engine/Game';
import { useCallback, useEffect, useId, useRef, useState, useSyncExternalStore } from 'react';
import { WalkmanLed, WalkmanModalFrame } from './walkman/WalkmanChrome';

export interface RadioSelectorProps {
  bridge: TelemetryBridge<TelemetrySnapshot, GameEvent>;
  library: TrackLibrary;
  onRestartRun: () => void;
  onOpenTrackLoader: () => void;
  onSelectForkBranch?: (branch: 'left' | 'right') => void;
}

const GRADE_BADGE_STYLES: Readonly<Record<RunGrade, string>> = {
  SSS: 'border-[var(--wm-amber)] bg-[var(--wm-amber)] text-[#131622]',
  S: 'border-[var(--wm-mint)] bg-[var(--wm-mint)] text-[#090b12]',
  A: 'border-[var(--wm-silk)] bg-[var(--wm-silk)] text-[#131622]',
  B: 'border-[var(--wm-play)] bg-[var(--wm-play)] text-[var(--wm-silk)]',
  C: 'border-[var(--wm-line)] bg-[#191d2d] text-[var(--wm-silk)]',
};

/**
 * M6 Stage Fork Radio Selector & End-of-Run Grade Screen.
 * Unified under the flat matte Sony Walkman hardware language.
 */
export function RadioSelector({
  bridge,
  library,
  onRestartRun,
  onOpenTrackLoader,
  onSelectForkBranch,
}: RadioSelectorProps) {
  const getRadioSnap = useCallback((): TelemetrySnapshot | null => {
    const s = bridge.getSnapshot();
    if (!s || !s.forkActive) return null;
    return s;
  }, [bridge]);
  const snap = useSyncExternalStore(bridge.subscribe, getRadioSnap, getRadioSnap);
  const [runSummary, setRunSummary] = useState<RunSummary | null>(null);
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const dialogTitleId = useId();

  useEffect(() => {
    const unsub = bridge.onEvent((event) => {
      if (event.type === 'runCompleted') {
        setRunSummary(event.summary);
      }
    });

    return () => {
      unsub();
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
    return () => {
      if (dialog.open && typeof dialog.close === 'function') {
        dialog.close();
      }
    };
  }, [runSummary]);

  const forkActive = snap?.forkActive ?? false;
  const forkChoice = snap?.forkChoice ?? 'right';
  const forkProgress = snap?.forkProgress ?? 0;
  const leftOpt = snap?.forkLeftOption ?? null;
  const rightOpt = snap?.forkRightOption ?? null;

  return (
    <>
      {/* 1. Stage Fork Selector Overlay */}
      {forkActive && leftOpt && rightOpt && (
        <div className="pointer-events-none absolute inset-x-0 top-20 z-10 flex justify-center px-4 select-none [contain:layout_style_paint] [transform:translateZ(0)]">
          <div className="wm-shell wm-faceplate pointer-events-auto w-full max-w-xl overflow-hidden text-[var(--wm-silk)]">
            <div className="wm-accent-strip" />
            <div className="p-3">
              <div className="flex items-center justify-between text-[10px] font-bold tracking-[0.18em] uppercase">
                <span className="flex items-center gap-1.5 text-[var(--wm-amber)]">
                  <WalkmanLed lit color="amber" />
                  NEXT STAGE — STEER OR PRESS 1 / 2
                </span>
                <span className="ff-mono text-[var(--wm-mint)]">
                  {Math.round(forkProgress * 100)}%
                </span>
              </div>

              <div className="wm-lcd mt-1.5 h-1.5 w-full overflow-hidden rounded-[1px] p-[1px]">
                <div
                  className="wm-accent-strip h-full w-full origin-left will-change-transform"
                  style={{ transform: `scaleX(${Math.max(0, Math.min(1, forkProgress))})` }}
                />
              </div>

              <div className="wm-key-bank mt-2.5 grid grid-cols-2">
                {/* Left Branch */}
                <button
                  type="button"
                  onClick={(e) => {
                    onSelectForkBranch?.('left');
                    e.currentTarget.blur();
                  }}
                  className={`wm-btn-well cursor-pointer p-2.5 text-left ${
                    forkChoice === 'left'
                      ? 'border-l-[3px] border-l-[var(--wm-mint)] bg-[#22283e]'
                      : 'border-l-[3px] border-l-transparent opacity-78 hover:opacity-100'
                  }`}
                >
                  <div className="flex items-center justify-between text-[10px] font-bold tracking-wider uppercase">
                    <span className="text-[var(--wm-mint)]">◄ LEFT LANE [1]</span>
                    {forkChoice === 'left' && (
                      <span className="ff-mono rounded-[1px] bg-[var(--wm-mint)] px-1.5 py-[1px] text-[9px] font-black text-[#090b12]">
                        LOCKED
                      </span>
                    )}
                  </div>
                  <div className="mt-1 text-[10px] font-bold tracking-widest text-[var(--wm-play)] uppercase">
                    {leftOpt.label}
                  </div>
                  <div className="truncate text-xs font-extrabold text-[var(--wm-silk)]">
                    {leftOpt.artist} — {leftOpt.title}
                  </div>
                  <div className="ff-mono mt-1 flex items-center justify-between text-[10px] text-[var(--wm-silk-dim)]">
                    <span>{leftOpt.bpm.toFixed(1)} BPM</span>
                    {leftOpt.bestScore !== null && leftOpt.bestGrade !== null ? (
                      <span className="text-[var(--wm-mint)]">
                        BEST {leftOpt.bestGrade} · {leftOpt.bestScore.toLocaleString()}
                      </span>
                    ) : (
                      <span>NO RECORD</span>
                    )}
                  </div>
                </button>

                {/* Right Branch */}
                <button
                  type="button"
                  onClick={(e) => {
                    onSelectForkBranch?.('right');
                    e.currentTarget.blur();
                  }}
                  className={`wm-btn-well cursor-pointer p-2.5 text-left ${
                    forkChoice === 'right'
                      ? 'border-r-[3px] border-r-[var(--wm-amber)] bg-[#22283e]'
                      : 'border-r-[3px] border-r-transparent opacity-78 hover:opacity-100'
                  }`}
                >
                  <div className="flex items-center justify-between text-[10px] font-bold tracking-wider uppercase">
                    {forkChoice === 'right' ? (
                      <span className="ff-mono rounded-[1px] bg-[var(--wm-amber)] px-1.5 py-[1px] text-[9px] font-black text-[#131622]">
                        LOCKED
                      </span>
                    ) : (
                      <span />
                    )}
                    <span className="text-[var(--wm-amber)]">RIGHT LANE [2] ►</span>
                  </div>
                  <div className="mt-1 text-[10px] font-bold tracking-widest text-[var(--wm-mint)] uppercase">
                    {rightOpt.label}
                  </div>
                  <div className="truncate text-xs font-extrabold text-[var(--wm-silk)]">
                    {rightOpt.mode === 'finishRun'
                      ? rightOpt.title
                      : `${rightOpt.artist} — ${rightOpt.title}`}
                  </div>
                  <div className="ff-mono mt-1 flex items-center justify-between text-[10px] text-[var(--wm-silk-dim)]">
                    <span>
                      {rightOpt.mode === 'finishRun'
                        ? rightOpt.artist
                        : `${rightOpt.bpm.toFixed(1)} BPM`}
                    </span>
                    {rightOpt.bestScore !== null && rightOpt.bestGrade !== null ? (
                      <span className="text-[var(--wm-mint)]">
                        BEST {rightOpt.bestGrade} · {rightOpt.bestScore.toLocaleString()}
                      </span>
                    ) : (
                      <span className="text-[var(--wm-amber)]">NEW STAGE</span>
                    )}
                  </div>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 2. End-of-Run Grade Screen Modal */}
      <dialog
        ref={dialogRef}
        aria-labelledby={dialogTitleId}
        onClick={(e) => {
          if (e.target === e.currentTarget) setRunSummary(null);
        }}
        onClose={() => {
          if (dialogRef.current) {
            dialogRef.current.returnValue = '';
          }
          setRunSummary(null);
        }}
        className="m-auto max-h-[90vh] w-full max-w-2xl overflow-hidden bg-transparent p-0 text-xs text-[var(--wm-silk)] open:flex"
        style={{ colorScheme: 'dark' }}
      >
        {runSummary && (
          <WalkmanModalFrame
            title="STAGE RECORDS"
            subtitle="88.4 FM · RUN COMPLETE"
            jpSubtitle="走行記録"
            modelTag="WM-86 TAPE LOG"
            titleId={dialogTitleId}
            maxWidthClass="max-w-2xl"
            maxHeightClass="max-h-[90vh]"
            headerRight={
              <div
                className={`rounded-[2px] border px-3.5 py-1 text-center ${
                  GRADE_BADGE_STYLES[runSummary.overallGrade]
                }`}
              >
                <div className="text-[8px] font-black tracking-widest uppercase">GRADE</div>
                <div className="ff-display text-xl leading-none font-black">
                  {runSummary.overallGrade}
                </div>
              </div>
            }
          >
            <div className="ff-scroll flex flex-col gap-4 overflow-y-auto p-4 sm:p-5">
              {/* Aggregate Run Metrics */}
              <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-5">
                <div className="wm-lcd rounded-[2px] p-2.5">
                  <div className="text-[10px] font-bold text-[var(--wm-silk-dim)]">SCORE</div>
                  <div className="ff-mono mt-0.5 text-base font-black text-[var(--wm-amber)]">
                    {runSummary.totalScore.toLocaleString()}
                  </div>
                </div>
                <div className="wm-lcd rounded-[2px] p-2.5">
                  <div className="text-[10px] font-bold text-[var(--wm-silk-dim)]">PEAK GROOVE</div>
                  <div className="ff-mono mt-0.5 text-base font-black text-[var(--wm-play)]">
                    {runSummary.maxGroove}%
                  </div>
                </div>
                <div className="wm-lcd rounded-[2px] p-2.5">
                  <div className="text-[10px] font-bold text-[var(--wm-silk-dim)]">
                    PERFECT SHIFTS
                  </div>
                  <div className="ff-mono mt-0.5 text-base font-black text-[var(--wm-mint)]">
                    {runSummary.totalPerfectShifts}
                  </div>
                </div>
                <div className="wm-lcd rounded-[2px] p-2.5">
                  <div className="text-[10px] font-bold text-[var(--wm-silk-dim)]">DROP SYNCS</div>
                  <div className="ff-mono mt-0.5 text-base font-black text-[var(--wm-amber)]">
                    {runSummary.totalDropSyncs}
                  </div>
                </div>
                <div className="wm-lcd col-span-2 rounded-[2px] p-2.5 sm:col-span-1">
                  <div className="text-[10px] font-bold text-[var(--wm-silk-dim)]">
                    BUMPS / SPILLS
                  </div>
                  <div className="ff-mono mt-0.5 text-base font-black text-[var(--wm-silk)]">
                    {runSummary.totalCollisions} / {runSummary.totalSodaSpills}
                  </div>
                </div>
              </div>

              {/* Per-Stage Breakdown */}
              <div>
                <div className="mb-1.5 text-[10px] font-bold tracking-[0.18em] text-[var(--wm-silk-dim)] uppercase">
                  STAGES ({runSummary.stages.length})
                </div>
                <div className="wm-lcd divide-y divide-[var(--wm-line)] rounded-[2px]">
                  {runSummary.stages.map((st, idx) => {
                    const savedBest = library.getBestScore(st.contentHash);
                    return (
                      <div
                        key={`${st.contentHash}-${idx}`}
                        className="flex flex-wrap items-center justify-between gap-2 px-3.5 py-2.5"
                      >
                        <div className="flex items-center gap-3">
                          <span className="ff-mono text-xs font-black text-[var(--wm-play)]">
                            STAGE {String(st.stageNumber).padStart(2, '0')}
                          </span>
                          <div>
                            <div className="flex items-center gap-2 font-bold text-[var(--wm-silk)]">
                              <span>
                                {st.artist} — {st.title}
                              </span>
                              {st.isNewRecord && (
                                <span className="ff-mono rounded-[1px] bg-[var(--wm-amber)] px-1.5 py-[1px] text-[9px] font-black text-[#131622]">
                                  NEW RECORD
                                </span>
                              )}
                            </div>
                            <div className="ff-mono text-[10px] text-[var(--wm-silk-dim)]">
                              AVG {st.avgGroove}% · PERFECT {st.perfectShifts} · DROP SYNCS{' '}
                              {st.dropSyncs}
                              {savedBest
                                ? ` · BEST ${savedBest.bestGrade} (${savedBest.bestScore.toLocaleString()})`
                                : ''}
                            </div>
                          </div>
                        </div>

                        <div className="ff-mono flex items-center gap-3">
                          <span className="text-sm font-bold text-[var(--wm-silk)]">
                            {st.score.toLocaleString()} PTS
                          </span>
                          <span
                            className={`rounded-[1px] border px-2 py-0.5 text-xs font-black ${
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
              <div className="flex justify-end border-t border-[var(--wm-line)] pt-3">
                <div className="wm-key-bank ff-mono grid grid-cols-3 text-xs font-bold uppercase">
                  <button
                    type="button"
                    onClick={() => {
                      setRunSummary(null);
                      onOpenTrackLoader();
                    }}
                    className="wm-btn-well cursor-pointer px-3 py-1.5 text-[var(--wm-silk)] hover:text-[var(--wm-mint)]"
                  >
                    CASSETTES [M]
                  </button>
                  <button
                    type="button"
                    autoFocus
                    onClick={() => setRunSummary(null)}
                    className="wm-btn-well cursor-pointer px-3.5 py-1.5 text-[var(--wm-mint)]"
                  >
                    KEEP DRIVING [ESC]
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setRunSummary(null);
                      onRestartRun();
                    }}
                    className="wm-btn-well wm-btn-play cursor-pointer px-4 py-1.5 font-black tracking-wider"
                  >
                    RESTART RUN
                  </button>
                </div>
              </div>
            </div>
          </WalkmanModalFrame>
        )}
      </dialog>
    </>
  );
}
