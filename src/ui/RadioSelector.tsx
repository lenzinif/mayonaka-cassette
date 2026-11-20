import type { RunGrade, TrackLibrary } from '@src/audio/TrackLibrary';
import type { TelemetryBridge } from '@src/core/TelemetryBridge';
import type { GameEvent, RunSummary, TelemetrySnapshot } from '@src/engine/Game';
import { useCallback, useEffect, useId, useRef, useState, useSyncExternalStore } from 'react';

export interface RadioSelectorProps {
  bridge: TelemetryBridge<TelemetrySnapshot, GameEvent>;
  library: TrackLibrary;
  onRestartRun: () => void;
  onOpenTrackLoader: () => void;
  onSelectForkBranch?: (branch: 'left' | 'right') => void;
}

const GRADE_BADGE_STYLES: Readonly<Record<RunGrade, string>> = {
  SSS: 'border-[var(--ff-gold)] bg-[var(--ff-gold)] text-[var(--ff-ink)]',
  S: 'border-[var(--ff-mint)] bg-[var(--ff-mint)] text-[var(--ff-ink)]',
  A: 'border-[var(--ff-cream)] bg-[var(--ff-cream)] text-[var(--ff-ink)]',
  B: 'border-[var(--ff-pink)] bg-[var(--ff-pink)] text-[var(--ff-cream)]',
  C: 'border-[var(--ff-muted)] bg-[var(--ff-panel-hi)] text-[var(--ff-cream)]',
};

/**
 * M6 Stage Fork Radio Selector & End-of-Run Grade Screen
 * Harmonized under the Mayonaka Hi-Fi J-Card design system.
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
          <div className="ff-shadow-ink pointer-events-auto w-full max-w-xl overflow-hidden rounded-[2px] border-2 border-[var(--ff-cream)] bg-[#12172E]/95 text-[var(--ff-cream)]">
            <div className="ff-obi-h h-[3px] w-full" />
            <div className="p-3">
              <div className="flex items-center justify-between text-[10px] font-bold tracking-[0.18em] uppercase">
                <span className="text-[var(--ff-gold)]">
                  NEXT STAGE — STEER OR PRESS 1 / 2
                </span>
                <span className="ff-mono text-[var(--ff-mint)]">
                  {Math.round(forkProgress * 100)}%
                </span>
              </div>

              <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-[2px] bg-[var(--ff-ink)]">
                <div
                  className="ff-obi-h h-full w-full origin-left will-change-transform"
                  style={{ transform: `scaleX(${Math.max(0, Math.min(1, forkProgress))})` }}
                />
              </div>

              <div className="mt-2.5 grid grid-cols-2 gap-2.5">
                {/* Left Branch */}
                <button
                  type="button"
                  onClick={(e) => {
                    onSelectForkBranch?.('left');
                    e.currentTarget.blur();
                  }}
                  className={`cursor-pointer rounded-[2px] border-2 p-2.5 text-left transition ${
                    forkChoice === 'left'
                      ? 'border-[var(--ff-mint)] bg-[var(--ff-ink)]'
                      : 'border-[var(--ff-border)] bg-[var(--ff-ink)]/70 opacity-75 hover:border-[var(--ff-mint)] hover:opacity-100'
                  }`}
                >
                  <div className="flex items-center justify-between text-[10px] font-bold tracking-wider uppercase">
                    <span className="text-[var(--ff-mint)]">◄ LEFT LANE [1]</span>
                    {forkChoice === 'left' && (
                      <span className="ff-mono rounded-[2px] bg-[var(--ff-mint)] px-1.5 py-[1px] text-[9px] font-black text-[var(--ff-ink)]">
                        LOCKED
                      </span>
                    )}
                  </div>
                  <div className="mt-1 text-[10px] font-bold tracking-widest text-[var(--ff-pink)] uppercase">
                    {leftOpt.label}
                  </div>
                  <div className="truncate text-xs font-extrabold text-[var(--ff-cream)]">
                    {leftOpt.artist} — {leftOpt.title}
                  </div>
                  <div className="ff-mono mt-1 flex items-center justify-between text-[10px] text-[var(--ff-muted)]">
                    <span>{leftOpt.bpm.toFixed(1)} BPM</span>
                    {leftOpt.bestScore !== null && leftOpt.bestGrade !== null ? (
                      <span className="text-[var(--ff-mint)]">
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
                  className={`cursor-pointer rounded-[2px] border-2 p-2.5 text-left transition ${
                    forkChoice === 'right'
                      ? 'border-[var(--ff-gold)] bg-[var(--ff-ink)]'
                      : 'border-[var(--ff-border)] bg-[var(--ff-ink)]/70 opacity-75 hover:border-[var(--ff-gold)] hover:opacity-100'
                  }`}
                >
                  <div className="flex items-center justify-between text-[10px] font-bold tracking-wider uppercase">
                    {forkChoice === 'right' ? (
                      <span className="ff-mono rounded-[2px] bg-[var(--ff-gold)] px-1.5 py-[1px] text-[9px] font-black text-[var(--ff-ink)]">
                        LOCKED
                      </span>
                    ) : (
                      <span />
                    )}
                    <span className="text-[var(--ff-gold)]">RIGHT LANE [2] ►</span>
                  </div>
                  <div className="mt-1 text-[10px] font-bold tracking-widest text-[var(--ff-mint)] uppercase">
                    {rightOpt.label}
                  </div>
                  <div className="truncate text-xs font-extrabold text-[var(--ff-cream)]">
                    {rightOpt.mode === 'finishRun'
                      ? rightOpt.title
                      : `${rightOpt.artist} — ${rightOpt.title}`}
                  </div>
                  <div className="ff-mono mt-1 flex items-center justify-between text-[10px] text-[var(--ff-muted)]">
                    <span>
                      {rightOpt.mode === 'finishRun'
                        ? rightOpt.artist
                        : `${rightOpt.bpm.toFixed(1)} BPM`}
                    </span>
                    {rightOpt.bestScore !== null && rightOpt.bestGrade !== null ? (
                      <span className="text-[var(--ff-mint)]">
                        BEST {rightOpt.bestGrade} · {rightOpt.bestScore.toLocaleString()}
                      </span>
                    ) : (
                      <span className="text-[var(--ff-gold)]">NEW STAGE</span>
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
        onClose={() => {
          if (dialogRef.current) {
            dialogRef.current.returnValue = '';
          }
          setRunSummary(null);
        }}
        className="ff-shadow-pink m-auto max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-[2px] border-2 border-[var(--ff-cream)] bg-[var(--ff-panel)] p-0 text-xs text-[var(--ff-cream)] open:flex"
        style={{ colorScheme: 'dark', scrollbarColor: '#FF3B7F #0B0E1E', scrollbarWidth: 'thin' }}
      >
        {runSummary && (
          <div className="flex w-full">
            <div className="ff-obi-v w-2.5 shrink-0" />

            <div className="flex min-w-0 flex-1 flex-col">
              {/* Cream J-Card Header */}
              <div className="flex items-center justify-between bg-[var(--ff-cream)] px-5 py-3 text-[var(--ff-ink)]">
                <div>
                  <div className="ff-mono text-[10px] font-bold tracking-[0.2em] uppercase opacity-70">
                    88.4 FM · RUN COMPLETE
                  </div>
                  <h2
                    id={dialogTitleId}
                    className="ff-display text-lg font-black italic tracking-wider uppercase"
                  >
                    STAGE RECORDS
                  </h2>
                </div>
                <div
                  className={`rounded-[2px] border-2 px-4 py-1 text-center ${
                    GRADE_BADGE_STYLES[runSummary.overallGrade]
                  }`}
                >
                  <div className="text-[8px] font-black tracking-widest uppercase">GRADE</div>
                  <div className="ff-display text-2xl leading-none font-black italic">
                    {runSummary.overallGrade}
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-4 p-5">
                {/* Aggregate Run Metrics */}
                <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-5">
                  <div className="rounded-[2px] border border-[var(--ff-border)] bg-[var(--ff-ink)] p-2.5">
                    <div className="text-[10px] font-bold text-[var(--ff-muted)]">SCORE</div>
                    <div className="ff-mono mt-0.5 text-base font-black text-[var(--ff-gold)]">
                      {runSummary.totalScore.toLocaleString()}
                    </div>
                  </div>
                  <div className="rounded-[2px] border border-[var(--ff-border)] bg-[var(--ff-ink)] p-2.5">
                    <div className="text-[10px] font-bold text-[var(--ff-muted)]">PEAK GROOVE</div>
                    <div className="ff-mono mt-0.5 text-base font-black text-[var(--ff-pink)]">
                      {runSummary.maxGroove}%
                    </div>
                  </div>
                  <div className="rounded-[2px] border border-[var(--ff-border)] bg-[var(--ff-ink)] p-2.5">
                    <div className="text-[10px] font-bold text-[var(--ff-muted)]">
                      PERFECT SHIFTS
                    </div>
                    <div className="ff-mono mt-0.5 text-base font-black text-[var(--ff-mint)]">
                      {runSummary.totalPerfectShifts}
                    </div>
                  </div>
                  <div className="rounded-[2px] border border-[var(--ff-border)] bg-[var(--ff-ink)] p-2.5">
                    <div className="text-[10px] font-bold text-[var(--ff-muted)]">DROP SYNCS</div>
                    <div className="ff-mono mt-0.5 text-base font-black text-[var(--ff-gold)]">
                      {runSummary.totalDropSyncs}
                    </div>
                  </div>
                  <div className="rounded-[2px] border border-[var(--ff-border)] bg-[var(--ff-ink)] p-2.5">
                    <div className="text-[10px] font-bold text-[var(--ff-muted)]">
                      BUMPS / SPILLS
                    </div>
                    <div className="ff-mono mt-0.5 text-base font-black text-[var(--ff-cream)]">
                      {runSummary.totalCollisions} / {runSummary.totalSodaSpills}
                    </div>
                  </div>
                </div>

                {/* Per-Stage Breakdown */}
                <div>
                  <div className="mb-1.5 text-[10px] font-bold tracking-[0.18em] text-[var(--ff-muted)] uppercase">
                    STAGES ({runSummary.stages.length})
                  </div>
                  <div className="divide-y divide-[var(--ff-border)] rounded-[2px] border border-[var(--ff-border)] bg-[var(--ff-ink)]">
                    {runSummary.stages.map((st, idx) => {
                      const savedBest = library.getBestScore(st.contentHash);
                      return (
                        <div
                          key={`${st.contentHash}-${idx}`}
                          className="flex flex-wrap items-center justify-between gap-2 px-3.5 py-2.5"
                        >
                          <div className="flex items-center gap-3">
                            <span className="ff-mono text-xs font-black text-[var(--ff-pink)]">
                              STAGE {String(st.stageNumber).padStart(2, '0')}
                            </span>
                            <div>
                              <div className="flex items-center gap-2 font-bold text-[var(--ff-cream)]">
                                <span>
                                  {st.artist} — {st.title}
                                </span>
                                {st.isNewRecord && (
                                  <span className="ff-mono rounded-[2px] bg-[var(--ff-gold)] px-1.5 py-[1px] text-[9px] font-black text-[var(--ff-ink)]">
                                    NEW RECORD
                                  </span>
                                )}
                              </div>
                              <div className="ff-mono text-[10px] text-[var(--ff-muted)]">
                                AVG {st.avgGroove}% · PERFECT {st.perfectShifts} · DROP SYNCS{' '}
                                {st.dropSyncs}
                                {savedBest
                                  ? ` · BEST ${savedBest.bestGrade} (${savedBest.bestScore.toLocaleString()})`
                                  : ''}
                              </div>
                            </div>
                          </div>

                          <div className="ff-mono flex items-center gap-3">
                            <span className="text-sm font-bold text-[var(--ff-cream)]">
                              {st.score.toLocaleString()} PTS
                            </span>
                            <span
                              className={`rounded-[2px] border px-2 py-0.5 text-xs font-black ${
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
                <div className="flex flex-wrap items-center justify-end gap-2.5 border-t border-[var(--ff-border)] pt-3">
                  <button
                    type="button"
                    onClick={() => {
                      setRunSummary(null);
                      onOpenTrackLoader();
                    }}
                    className="cursor-pointer rounded-[2px] border border-[var(--ff-border)] bg-[var(--ff-panel-hi)] px-3 py-1.5 text-xs font-bold text-[var(--ff-cream)] uppercase transition hover:border-[var(--ff-mint)] hover:text-[var(--ff-mint)]"
                  >
                    CASSETTES [M]
                  </button>
                  <button
                    type="button"
                    autoFocus
                    onClick={() => setRunSummary(null)}
                    className="cursor-pointer rounded-[2px] border border-[var(--ff-mint)] bg-[var(--ff-ink)] px-3.5 py-1.5 text-xs font-bold text-[var(--ff-mint)] uppercase transition hover:bg-[var(--ff-mint)] hover:text-[var(--ff-ink)]"
                  >
                    KEEP DRIVING [ESC]
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setRunSummary(null);
                      onRestartRun();
                    }}
                    className="ff-shadow-ink cursor-pointer rounded-[2px] bg-[var(--ff-pink)] px-4 py-1.5 text-xs font-black tracking-wider text-[var(--ff-cream)] uppercase transition hover:brightness-110"
                  >
                    RESTART RUN
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </dialog>
    </>
  );
}
