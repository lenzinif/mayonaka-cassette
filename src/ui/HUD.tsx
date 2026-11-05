import type { SectionRole } from '@src/audio/BeatMap';
import type { TelemetryBridge } from '@src/core/TelemetryBridge';
import type { GameEvent, TelemetrySnapshot } from '@src/engine/Game';
import { GEAR_NUMBERS, MAX_GEAR } from '@src/entities/Gearbox';
import { SODA_SKIN_LABELS, type SodaSkin } from '@src/entities/MelonSoda';
import type { GrooveTier } from '@src/entities/PlayerCar';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { PauseMenu } from './PauseMenu';

export interface HUDProps {
  bridge: TelemetryBridge<TelemetrySnapshot, GameEvent>;
  debugOpen: boolean;
  onToggleDebug: () => void;
  onOpenTrackLoader: () => void;
  onOpenInspector: () => void;
  onRestartRun?: () => void;
}

interface ToastState {
  id: number;
  text: string;
  tone?: 'pink' | 'cyan' | 'emerald' | 'amber';
}

const TACH_SEGMENTS = 18;
const TACH_SEGMENT_INDICES = Array.from({ length: TACH_SEGMENTS }, (_, i) => i);

function formatLapTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  const hundredths = Math.floor((seconds * 100) % 100);
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${String(hundredths).padStart(2, '0')}`;
}

function triggerSyntheticKey(code: string): void {
  window.dispatchEvent(new KeyboardEvent('keydown', { code, bubbles: true }));
  window.dispatchEvent(new KeyboardEvent('keyup', { code, bubbles: true }));
}

const TIER_STYLES: Readonly<
  Record<GrooveTier, { badge: string; bar: string; label: string; glow: string }>
> = {
  LOW: {
    badge: 'border-fuchsia-500/50 bg-fuchsia-950/85 text-fuchsia-200',
    bar: 'from-fuchsia-600 to-pink-500',
    label: 'LOW // WARMING UP',
    glow: 'border-cyan-400/40 shadow-[0_0_18px_rgba(5,217,232,0.16)]',
  },
  MEDIUM: {
    badge: 'border-cyan-400/75 bg-cyan-950/85 text-cyan-200',
    bar: 'from-cyan-400 via-fuchsia-500 to-pink-500',
    label: 'MEDIUM // IN THE POCKET',
    glow: 'border-cyan-400/55 shadow-[0_0_22px_rgba(5,217,232,0.24)]',
  },
  HIGH: {
    badge:
      'border-emerald-400/80 bg-emerald-950/85 text-emerald-200 shadow-[0_0_10px_rgba(16,185,129,0.4)]',
    bar: 'from-emerald-400 via-cyan-400 to-pink-500',
    label: 'HIGH // FUTURE FUNK FLOW',
    glow: 'border-emerald-400/60 shadow-[0_0_24px_rgba(16,185,129,0.28)]',
  },
  SSS: {
    badge:
      'border-amber-300 bg-amber-950/90 text-amber-200 shadow-[0_0_16px_rgba(251,191,36,0.65)]',
    bar: 'from-amber-300 via-pink-500 to-cyan-300',
    label: 'FUNKY OVERDRIVE',
    glow: 'border-amber-300/80 shadow-[0_0_28px_rgba(251,191,36,0.38)]',
  },
};

const SECTION_BADGE_STYLES: Readonly<Record<SectionRole, string>> = {
  intro: 'border-cyan-400/60 bg-cyan-950/85 text-cyan-200',
  build: 'border-amber-400/75 bg-amber-950/85 text-amber-200',
  drop: 'border-pink-400 bg-pink-600/90 text-white shadow-[0_0_10px_rgba(255,42,109,0.55)]',
  breakdown: 'border-fuchsia-400/60 bg-fuchsia-950/85 text-fuchsia-200',
  outro: 'border-emerald-400/60 bg-emerald-950/85 text-emerald-200',
};

/**
 * React HUD overlay (`z-index: 2`, `pointer-events-none`, AGENTS.md §2).
 * Re-renders at most `TELEMETRY_HZ` (15 Hz) via `useSyncExternalStore` + discrete events.
 */
export function HUD({
  bridge,
  debugOpen,
  onToggleDebug,
  onOpenTrackLoader,
  onOpenInspector,
  onRestartRun,
}: HUDProps) {
  const snap = useSyncExternalStore(bridge.subscribe, bridge.getSnapshot, bridge.getSnapshot);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [cleanHud, setCleanHud] = useState(false);
  const [showPerfHud, setShowPerfHud] = useState(false);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }
      if (e.code === 'KeyH') {
        e.preventDefault();
        setCleanHud((prev) => !prev);
      } else if (e.code === 'F3') {
        e.preventDefault();
        setShowPerfHud((prev) => !prev);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  useEffect(() => {
    let timerId = 0;
    const showToast = (
      text: string,
      ms = 1800,
      tone: ToastState['tone'] = 'pink',
    ) => {
      window.clearTimeout(timerId);
      setToast({ id: Date.now(), text, tone });
      timerId = window.setTimeout(() => setToast(null), ms);
    };

    const unsub = bridge.onEvent((event) => {
      if (event.type === 'lapCompleted') {
        showToast(`LAP ${event.lap} // ${formatLapTime(event.lapTime)}`, 2200, 'cyan');
      } else if (event.type === 'dropSync') {
        showToast(`DROP CREST SYNC! +GROOVE // BAR ${event.barIndex + 1}`, 1800, 'emerald');
      } else if (event.type === 'sectionEntered' && event.role === 'drop') {
        showToast(`DROP // BAR ${event.barIndex + 1}`, 1500, 'pink');
      } else if (event.type === 'songRoadGenerated') {
        showToast(`ROAD BUILT // ${event.totalBars} BARS (${event.chunkCount} CHUNKS)`, 2200, 'cyan');
      } else if (event.type === 'gearShift') {
        const { result, grooveGained } = event;
        const shiftLabel = result.direction === 'down' ? 'DOWNSHIFT' : 'SHIFT';
        if (result.rewardTier === 'PERFECT') {
          const db = result.judgement.isDownbeat ? 'DOWNBEAT ' : '';
          showToast(
            `${db}PERFECT ${shiftLabel}! ${result.fromGear}→${result.toGear} (+${Math.round(grooveGained)} GROOVE)`,
            1400,
            'emerald',
          );
        } else if (result.rewardTier === 'GOOD') {
          showToast(
            `GOOD ${shiftLabel} ${result.fromGear}→${result.toGear} (+${Math.round(grooveGained)} GROOVE)`,
            1200,
            'cyan',
          );
        }
      } else if (event.type === 'pauseChanged') {
        if (!event.paused) {
          showToast('GAME RESUMED', 1200, 'pink');
        }
      } else if (event.type === 'grooveTierChanged') {
        const tierName = event.tier === 'SSS' ? 'FUNKY OVERDRIVE' : event.tier;
        showToast(`GROOVE TIER // ${tierName}`, 1700, event.tier === 'SSS' ? 'emerald' : 'pink');
      } else if (event.type === 'tofuModeToggled') {
        showToast(
          event.active
            ? 'TOFU MODE ON // x2 GROOVE (KEEP IT SMOOTH)'
            : 'TOFU MODE OFF',
          2000,
          event.active ? 'emerald' : 'cyan',
        );
      } else if (event.type === 'sodaSkinChanged') {
        showToast(`CUP SKIN // ${SODA_SKIN_LABELS[event.skin]}`, 1500, 'cyan');
      } else if (event.type === 'autopilotToggled') {
        showToast(
          event.enabled
            ? `AI AUTOPILOT ON // [${event.mode.toUpperCase()}]`
            : 'MANUAL DRIVING RESTORED',
          1800,
          event.enabled ? 'emerald' : 'cyan',
        );
      } else if (event.type === 'autoShiftToggled') {
        showToast(
          event.enabled ? 'AUTO-SHIFT ASSIST // ON' : 'MANUAL BEAT-SHIFT // ON',
          1500,
          'cyan',
        );
      } else if (event.type === 'sodaSpill') {
        showToast(
          `MELON SODA SPILL! -${Math.round(event.grooveLost)} GROOVE`,
          1500,
          'amber',
        );
      } else if (event.type === 'collision') {
        if (event.outcome === 'truckKnockedOff') {
          showToast('KEI TRUCK TAKEDOWN! // DRIFT SMASH', 1300, 'cyan');
        } else if (event.outcome === 'playerShuntedOff') {
          showToast('REAR-END SHUNT! -GROOVE', 1300, 'amber');
        } else {
          showToast('ROADSIDE IMPACT! -GROOVE', 1200, 'amber');
        }
      }
    });
    return () => {
      unsub();
      window.clearTimeout(timerId);
    };
  }, [bridge]);

  const speedKmh = snap?.speedKmh ?? 0;
  const speedPct = Math.min(100, Math.round((snap?.speedRatio ?? 0) * 100));
  const isDrifting = snap?.isDrifting ?? false;
  const driftTime = snap?.driftTime ?? 0;
  const isOffRoad = snap?.isOffRoad ?? false;
  const lap = snap?.lap ?? 1;
  const lapTime = snap?.lapTime ?? 0;
  const lastLapTime = snap?.lastLapTime ?? null;
  const fps = snap?.fps ?? 0;

  const bpm = snap?.bpm ?? 122;
  const barIndex = snap?.barIndex ?? 0;
  const beatInBar = snap?.beatInBar ?? 0;
  const sectionRole: SectionRole = snap?.sectionRole ?? 'intro';
  const barEnergy = snap?.barEnergy ?? 0.5;
  const filterCutoffHz = snap?.filterCutoffHz ?? 2400;
  const trackTitle = snap?.trackTitle ?? 'Neon Horizon (Synth Fallback)';
  const trackArtist = snap?.trackArtist ?? 'OutRun FM 88.4';
  const audioUnlocked = snap?.audioUnlocked ?? false;
  const roadBarIndex = snap?.roadBarIndex ?? 0;
  const totalBars = Math.max(1, snap?.totalBars ?? 64);
  const currentChunkId = snap?.currentChunkId ?? 'intro-boulevard-cruise';

  // M5 & M6 Telemetry
  const gear = snap?.gear ?? 1;
  const rpm = snap?.rpm ?? 0;
  const rpmPct = Math.min(100, Math.round(rpm * 100));
  const displayRpm = Math.round(900 + rpm * 7100);
  const isLugging = snap?.isLugging ?? false;
  const isRedlining = snap?.isRedlining ?? false;
  const isOverdrive = snap?.isOverdrive ?? false;
  const autoShift = snap?.autoShift ?? false;
  const lastShiftTier = snap?.lastShiftTier ?? null;
  const lastShiftDeltaMs = snap?.lastShiftDeltaMs ?? null;
  const groove = snap?.groove ?? 15;
  const grooveTier: GrooveTier = snap?.grooveTier ?? 'LOW';
  const tofuMode = snap?.tofuMode ?? false;
  const sodaSkin: SodaSkin = snap?.sodaSkin ?? 'melon-soda';
  const sodaDanger = snap?.sodaDanger ?? 0;
  const sodaSpills = snap?.sodaSpills ?? 0;
  const stageNumber = snap?.stageNumber ?? 1;
  const stagePaletteName = snap?.stagePaletteName ?? 'MAYONAKA BAY';
  const playlistIndex = snap?.playlistIndex ?? 0;
  const playlistLength = snap?.playlistLength ?? 1;
  const stageScore = snap?.stageScore ?? 0;
  const bestSongScore = snap?.bestSongScore ?? null;
  const bestSongGrade = snap?.bestSongGrade ?? null;
  const isPaused = snap?.isPaused ?? false;
  const gamepadConnected = snap?.gamepadConnected ?? false;

  const tierStyle = TIER_STYLES[grooveTier];
  const sectionBadgeStyle = SECTION_BADGE_STYLES[sectionRole] ?? SECTION_BADGE_STYLES.intro;
  const shiftSweetSpot = !autoShift && gear < MAX_GEAR && rpm >= 0.72 && !isRedlining;
  const showDownshiftPrompt = !autoShift && isLugging;
  const roadProgressRatio = Math.max(0, Math.min(1, (roadBarIndex + 1) / totalBars));
  const activeTachSegments = Math.round(rpm * TACH_SEGMENTS);
  const sodaDangerPct = Math.min(100, Math.round(sodaDanger * 100));

  return (
    <div className="pointer-events-none absolute inset-0 z-2 flex flex-col justify-between p-3 font-mono text-white select-none sm:p-5">
      {/* =====================================================================
          TOP BAR: Left Instrument Modules + Right Hardware Control Matrix
         ===================================================================== */}
      <div className="flex items-start justify-between gap-2.5 sm:gap-3">
        {/* Left: Stage Chrono Deck & Mayonaka Stereo Cassette Deck */}
        <div className="flex min-w-0 flex-wrap items-stretch gap-2.5 sm:flex-nowrap">
          {/* 1. Stage, Score & Chrono Telemetry Card */}
          <div className="flex min-w-[215px] flex-col justify-between rounded border border-fuchsia-500/45 bg-[#0b011d]/92 px-3 py-2 shadow-[0_0_22px_rgba(255,42,109,0.22)] backdrop-blur-xs [contain:layout_style_paint]">
            {/* Top Header Strip */}
            <div className="flex items-center justify-between gap-3 border-b border-fuchsia-500/25 pb-1 text-[10px] tracking-[0.2em] uppercase">
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-pink-500 shadow-[0_0_6px_#ff2a6d]" />
                <span className="truncate font-bold text-cyan-300">
                  STAGE {String(stageNumber).padStart(2, '0')} // {stagePaletteName}
                </span>
              </div>
              {playlistLength > 1 && (
                <span className="shrink-0 rounded border border-fuchsia-400/40 bg-fuchsia-950/70 px-1 py-0.2 text-[9px] font-bold tabular-nums text-fuchsia-200">
                  TRK {playlistIndex + 1}/{playlistLength}
                </span>
              )}
            </div>

            {/* Score & Personal Best Row */}
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
                <span className="rounded border border-emerald-400/40 bg-emerald-950/70 px-1.5 py-0.2 text-[9px] font-bold tabular-nums text-emerald-300">
                  BEST {bestSongGrade} · {bestSongScore.toLocaleString()}
                </span>
              ) : (
                <span className="text-[9px] tracking-widest text-fuchsia-400/65 uppercase">
                  OUTRUN ARCADE 1986
                </span>
              )}
            </div>

            {/* Lap Counter & Digital Chronograph */}
            <div className="flex items-baseline justify-between gap-3 text-xs">
              <div className="flex items-baseline gap-2.5">
                <span className="rounded bg-pink-500/20 px-1.5 py-0.5 text-[10px] font-black tracking-wider text-pink-400 border border-pink-500/40">
                  LAP {lap}
                </span>
                <span className="text-sm font-bold tabular-nums tracking-tight text-fuchsia-100">
                  {formatLapTime(lapTime)}
                </span>
              </div>
              {lastLapTime !== null && (
                <span className="text-[10px] tabular-nums text-fuchsia-300/80">
                  LAST {formatLapTime(lastLapTime)}
                </span>
              )}
            </div>

            {/* Song Road Progress Bar */}
            {!cleanHud && (
              <div className="mt-1.5 border-t border-fuchsia-500/20 pt-1">
                <div className="flex items-center justify-between gap-2 text-[9px] tabular-nums text-fuchsia-300/85">
                  <span className="truncate max-w-[140px]">
                    ROAD {String(roadBarIndex + 1).padStart(2, '0')}/{totalBars} · {currentChunkId}
                  </span>
                  <span className="text-cyan-300">{Math.round(roadProgressRatio * 100)}%</span>
                </div>
                <div className="mt-0.5 h-1 w-full overflow-clip rounded-xs bg-fuchsia-950">
                  <div
                    className="h-full w-full origin-left bg-gradient-to-r from-cyan-400 via-pink-500 to-amber-300 transition-transform duration-100 ease-linear will-change-transform"
                    style={{ transform: `scaleX(${roadProgressRatio})` }}
                  />
                </div>
              </div>
            )}
          </div>

          {/* 2. Mayonaka Stereo Cassette Deck & Groove Tape Widget */}
          <div
            className={`flex min-w-[270px] max-w-md flex-col justify-between rounded border bg-[#0b011d]/92 px-3 py-2 backdrop-blur-xs transition-shadow duration-200 [contain:layout_style_paint] ${tierStyle.glow}`}
          >
            {/* Cassette Window Header: Spinning Tape Reels + Track Marquee + Section Role */}
            <div className="flex items-center justify-between gap-2.5 border-b border-cyan-400/20 pb-1 text-[10px] tracking-widest uppercase">
              <div className="flex min-w-0 items-center gap-2">
                {/* Animated Cassette Spool Window */}
                <div
                  className="flex shrink-0 items-center gap-1 rounded border border-fuchsia-500/40 bg-[#05000e] px-1.5 py-0.5 text-[9px] text-cyan-300"
                  aria-hidden="true"
                >
                  <span
                    className="inline-block transition-transform duration-150"
                    style={{ transform: `rotate(${beatInBar * 90}deg)` }}
                  >
                    ❂
                  </span>
                  <span className="h-1 w-2.5 rounded-xs bg-gradient-to-r from-pink-500/60 to-cyan-400/60" />
                  <span
                    className="inline-block transition-transform duration-150"
                    style={{ transform: `rotate(${beatInBar * 90}deg)` }}
                  >
                    ❂
                  </span>
                </div>
                <span className="min-w-0 max-w-[185px] truncate font-bold text-cyan-100">
                  {trackArtist} — {trackTitle}
                </span>
              </div>

              <div className="flex shrink-0 items-center gap-1">
                {snap?.autopilotActive && (
                  <span className="animate-pulse rounded border border-cyan-300/80 bg-cyan-950/90 px-1.5 py-0.2 text-[9px] font-bold text-cyan-300 shadow-[0_0_10px_rgba(5,217,232,0.5)]">
                    🤖 AUTO [{snap.autopilotMode?.toUpperCase() ?? 'ON'}]
                  </span>
                )}
                {tofuMode && (
                  <span className="rounded border border-emerald-300/80 bg-emerald-950/90 px-1.5 py-0.2 text-[9px] font-bold text-emerald-300 shadow-[0_0_8px_rgba(16,185,129,0.35)]">
                    TOFU ×2
                  </span>
                )}
                <span
                  className={`rounded border px-1.5 py-0.2 text-[9px] font-bold uppercase ${sectionBadgeStyle}`}
                >
                  {sectionRole}
                </span>
              </div>
            </div>

            {/* Beat Clock Sequencer & Audio Filter Readout */}
            <div className="my-1.5 flex items-center justify-between gap-3 text-xs tabular-nums">
              <div className="flex items-center gap-2.5">
                <span className="font-black text-pink-400">{bpm.toFixed(1)} BPM</span>
                <span className="rounded border border-fuchsia-500/30 bg-fuchsia-950/60 px-1.5 py-0.2 text-[10px] font-bold text-fuchsia-200">
                  BAR {String(barIndex + 1).padStart(3, '0')}.{beatInBar + 1}
                </span>
              </div>

              {/* 4-Beat Drum Machine Step Pads */}
              <div className="flex items-center gap-1" aria-hidden="true">
                {[0, 1, 2, 3].map((b) => {
                  const isActiveBeat = beatInBar === b;
                  const isDownbeat = b === 0;
                  return (
                    <span
                      key={b}
                      className={`inline-flex h-3.5 w-3.5 items-center justify-center rounded-xs border text-[8px] font-black transition-all duration-75 ${
                        isActiveBeat
                          ? isDownbeat
                            ? 'scale-110 border-pink-300 bg-pink-500 text-white shadow-[0_0_8px_#ff2a6d]'
                            : 'scale-105 border-cyan-200 bg-cyan-400 text-slate-950 shadow-[0_0_6px_#05d9e8]'
                          : 'border-fuchsia-800/60 bg-fuchsia-950/70 text-fuchsia-400/50'
                      }`}
                    >
                      {b + 1}
                    </span>
                  );
                })}
              </div>

              {!cleanHud && (
                <div className="flex items-center gap-1.5 text-[10px] text-cyan-300/85">
                  <span>LPF {filterCutoffHz}Hz</span>
                  {/* 4-Bar Mini Equalizer driven by barEnergy & filter openness */}
                  <div className="flex items-end gap-0.5 h-3" aria-hidden="true">
                    {[0.35, 0.6, 0.85, 1.0].map((factor, idx) => {
                      const heightPct = Math.max(
                        25,
                        Math.min(100, Math.round(barEnergy * factor * 100)),
                      );
                      return (
                        <span
                          key={idx}
                          className="w-1 rounded-t-xs bg-cyan-400/80"
                          style={{ height: `${heightPct}%` }}
                        />
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Segmented Cassette Groove Tape Meter */}
            <div className="border-t border-fuchsia-500/25 pt-1.5">
              <div className="flex items-center justify-between text-[10px] tracking-wider">
                <div className="flex items-center gap-1.5">
                  <span className="font-bold text-fuchsia-300">GROOVE TAPE</span>
                  <span
                    className={`rounded border px-1.5 py-0.2 text-[9px] font-bold ${tierStyle.badge}`}
                  >
                    {tierStyle.label}
                  </span>
                </div>
                <span className="text-xs font-black tabular-nums text-cyan-200">{groove}%</span>
              </div>

              <div className="relative mt-1 h-2.5 w-full overflow-clip rounded-xs border border-fuchsia-500/35 bg-[#060112]">
                {/* Tier threshold markers at 25% (MEDIUM), 55% (HIGH), 85% (SSS) */}
                <div
                  className="absolute inset-y-0 left-[25%] z-1 w-px bg-cyan-300/40"
                  title="MEDIUM Groove Threshold (25%)"
                />
                <div
                  className="absolute inset-y-0 left-[55%] z-1 w-px bg-emerald-300/45"
                  title="HIGH Groove Threshold (55%)"
                />
                <div
                  className="absolute inset-y-0 left-[85%] z-1 w-0.5 bg-amber-300/80"
                  title="SSS Overdrive Threshold (85%)"
                />
                <div
                  className={`h-full w-full origin-left bg-gradient-to-r ${tierStyle.bar} transition-transform duration-75 ease-linear will-change-transform`}
                  style={{ transform: `scaleX(${groove / 100})` }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Top-Right Action Toolbar: Tactile 5x2 Arcade Switchboard Matrix */}
        <div className="shrink-0 [contain:layout_style_paint]">
          {cleanHud ? (
            <div className="flex items-center gap-1.5">
              <div className="flex h-7 items-center gap-1.5 rounded border border-cyan-400/30 bg-[#0b011d]/85 px-2.5 text-xs font-semibold tabular-nums text-cyan-300">
                <span>{fps} FPS</span>
                {gamepadConnected && (
                  <span className="rounded border border-emerald-400/50 bg-emerald-950/90 px-1 py-0.2 text-[9px] font-black text-emerald-300">
                    GP
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={(e) => {
                  setCleanHud(false);
                  e.currentTarget.blur();
                }}
                className="pointer-events-auto cursor-pointer rounded border border-cyan-400/50 bg-[#0b011d]/90 px-3 py-1.5 text-xs font-semibold tracking-wider text-cyan-200 shadow-[0_0_12px_rgba(5,217,232,0.3)] transition hover:border-pink-400 hover:text-pink-200"
                title="Mostra HUD completa [H]"
              >
                SHOW HUD [H]
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-[auto_auto_auto_auto_auto] gap-1.5 rounded border border-fuchsia-500/30 bg-[#090118]/80 p-1.5 text-[11px] font-semibold shadow-[0_0_20px_rgba(13,2,33,0.65)] backdrop-blur-xs">
              {/* Row 1, Col 1: FPS Counter (+ optional Gamepad badge) */}
              <div
                className="flex h-7 w-full items-center justify-center gap-1.5 rounded border border-cyan-400/30 bg-[#120329]/90 px-2.5 py-0.5 tabular-nums text-cyan-300 whitespace-nowrap"
                title="Fotogrammi al secondo (FPS)"
              >
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-400" />
                <span>{fps} FPS</span>
                {gamepadConnected && (
                  <span
                    className="rounded border border-emerald-400/50 bg-emerald-950/90 px-1 py-0.2 text-[9px] font-black text-emerald-300"
                    title="Gamepad connesso"
                  >
                    GP
                  </span>
                )}
              </div>

              {/* Row 1, Col 2: Performance Profiler Ribbon Toggle */}
              <button
                type="button"
                onClick={(e) => {
                  setShowPerfHud((prev) => !prev);
                  e.currentTarget.blur();
                }}
                className={`pointer-events-auto flex h-7 w-full cursor-pointer items-center justify-center rounded border px-2.5 py-0.5 tracking-wider whitespace-nowrap transition ${
                  showPerfHud
                    ? 'border-emerald-400 bg-emerald-950/90 text-emerald-200 shadow-[0_0_10px_rgba(16,185,129,0.4)]'
                    : 'border-cyan-400/40 bg-[#120329]/85 text-cyan-200 hover:border-cyan-300'
                }`}
                title="Profiler prestazioni [F3]"
              >
                PERF [F3]
              </button>

              {/* Row 1, Col 3: Clean HUD Toggle */}
              <button
                type="button"
                onClick={(e) => {
                  setCleanHud(true);
                  e.currentTarget.blur();
                }}
                className="pointer-events-auto flex h-7 w-full cursor-pointer items-center justify-center rounded border border-cyan-400/40 bg-[#120329]/85 px-2.5 py-0.5 tracking-wider text-cyan-200 whitespace-nowrap transition hover:border-pink-400 hover:text-pink-200"
                title="Modalità HUD essenziale [H]"
              >
                CLEAN HUD [H]
              </button>

              {/* Row 1, Col 4: Load Music Tracks */}
              <button
                type="button"
                onClick={(e) => {
                  onOpenTrackLoader();
                  e.currentTarget.blur();
                }}
                className="pointer-events-auto flex h-7 w-full cursor-pointer items-center justify-center rounded border border-cyan-400/40 bg-[#120329]/85 px-2.5 py-0.5 tracking-wider text-cyan-200 whitespace-nowrap transition hover:border-pink-400 hover:text-pink-200"
                title="Gestione tracce e playlist [M]"
              >
                LOAD TRACK [M]
              </button>

              {/* Row 1, Col 5: Pause / Resume Game */}
              <button
                type="button"
                onClick={(e) => {
                  triggerSyntheticKey('KeyP');
                  e.currentTarget.blur();
                }}
                className={`pointer-events-auto flex h-7 w-full cursor-pointer items-center justify-center rounded border px-2.5 py-0.5 font-bold tracking-wider whitespace-nowrap transition ${
                  isPaused
                    ? 'animate-pulse border-pink-500 bg-pink-950/90 text-pink-200 shadow-[0_0_14px_rgba(255,42,109,0.6)]'
                    : 'border-fuchsia-400/55 bg-[#1b0538]/90 text-fuchsia-200 hover:border-pink-400 hover:text-pink-200'
                }`}
                title="Pausa [P] o [ESC]"
              >
                {isPaused ? 'RESUME [P]' : 'PAUSE [P]'}
              </button>

              {/* Row 2, Col 1: Tofu Mode Toggle (strictly aligned under FPS) */}
              <button
                type="button"
                onClick={(e) => {
                  triggerSyntheticKey('KeyT');
                  e.currentTarget.blur();
                }}
                className={`pointer-events-auto flex h-7 w-full cursor-pointer items-center justify-center rounded border px-2.5 py-0.5 tracking-wider whitespace-nowrap transition ${
                  tofuMode
                    ? 'border-emerald-400 bg-emerald-950/90 text-emerald-200 shadow-[0_0_10px_rgba(16,185,129,0.4)]'
                    : 'border-cyan-400/40 bg-[#120329]/85 text-cyan-200 hover:border-emerald-400 hover:text-emerald-300'
                }`}
                title="Modalità Tofu (Groove x2) [T]"
              >
                {tofuMode ? `TOFU ×2 (${sodaSpills}) [T]` : 'TOFU MODE [T]'}
              </button>

              {/* Row 2, Col 2: Cup Skin Cycle (strictly aligned under PERF) */}
              <button
                type="button"
                onClick={(e) => {
                  triggerSyntheticKey('KeyV');
                  e.currentTarget.blur();
                }}
                className="pointer-events-auto flex h-7 w-full cursor-pointer items-center justify-center rounded border border-cyan-400/40 bg-[#120329]/85 px-2.5 py-0.5 tracking-wider text-cyan-200 whitespace-nowrap transition hover:border-amber-300 hover:text-amber-200"
                title="Cambia bicchiere [V]"
              >
                SKIN: {SODA_SKIN_LABELS[sodaSkin]} [V]
              </button>

              {/* Row 2, Col 3: Auto-Shift Assist Toggle (strictly aligned under CLEAN HUD) */}
              <button
                type="button"
                onClick={(e) => {
                  triggerSyntheticKey('KeyG');
                  e.currentTarget.blur();
                }}
                className={`pointer-events-auto flex h-7 w-full cursor-pointer items-center justify-center rounded border px-2.5 py-0.5 tracking-wider whitespace-nowrap transition ${
                  autoShift
                    ? 'border-cyan-400 bg-cyan-950/90 text-cyan-200 shadow-[0_0_10px_rgba(5,217,232,0.4)]'
                    : 'border-cyan-400/40 bg-[#120329]/85 text-cyan-200 hover:border-cyan-300'
                }`}
                title="Cambio automatico o manuale [G]"
              >
                {autoShift ? 'AUTO-SHIFT [G]' : 'MANUAL GEAR [G]'}
              </button>

              {/* Row 2, Col 4: Feel Tuning Panel (strictly aligned under LOAD TRACK) */}
              <button
                type="button"
                onClick={(e) => {
                  onToggleDebug();
                  e.currentTarget.blur();
                }}
                className={`pointer-events-auto flex h-7 w-full cursor-pointer items-center justify-center rounded border px-2.5 py-0.5 tracking-wider whitespace-nowrap transition ${
                  debugOpen
                    ? 'border-pink-500 bg-pink-950/90 text-pink-200 shadow-[0_0_10px_rgba(255,42,109,0.4)]'
                    : 'border-cyan-400/40 bg-[#120329]/85 text-cyan-200 hover:border-cyan-300'
                }`}
                title="Regolazione parametri di guida [F2]"
              >
                {debugOpen ? 'CLOSE TUNING [F2]' : 'TUNING [F2]'}
              </button>

              {/* Row 2, Col 5: BeatMap DSP Inspector (strictly aligned under PAUSE) */}
              <button
                type="button"
                onClick={(e) => {
                  onOpenInspector();
                  e.currentTarget.blur();
                }}
                className="pointer-events-auto flex h-7 w-full cursor-pointer items-center justify-center rounded border border-cyan-400/40 bg-[#120329]/85 px-2.5 py-0.5 tracking-wider text-cyan-200 whitespace-nowrap transition hover:border-fuchsia-400 hover:text-fuchsia-200"
                title="Ispettore BeatMap (?analyze)"
              >
                ANALYZE
              </button>
            </div>
          )}
        </div>
      </div>

      {/* M8 Mini Performance Profiler Arcade Ribbon */}
      {showPerfHud && (
        <div className="pointer-events-auto mx-auto mt-1.5 flex flex-wrap items-center justify-center gap-3 rounded border border-cyan-400/50 bg-[#090117]/95 px-3 py-1 font-mono text-[10px] text-cyan-200 shadow-[0_0_15px_rgba(5,217,232,0.3)]">
          <span className="font-bold tracking-widest text-pink-400 uppercase">PERF MON</span>
          <span className="font-bold text-emerald-300">{fps} FPS</span>
          <span className="text-fuchsia-200">
            FRAME: <strong className="text-white">{snap?.frameTimeMs ?? 16.7}ms</strong>
          </span>
          <span className="text-pink-300">
            RENDER: <strong className="text-pink-200">{snap?.renderTimeMs ?? 1.2}ms</strong>
          </span>
          <span className="text-emerald-300">
            PHYS:{' '}
            <strong className="text-emerald-200">{snap?.simTimeMs ?? 0.3}ms</strong>{' '}
            (x{snap?.fixedStepsLastFrame ?? 1})
          </span>
          <span className="text-cyan-300">
            SEGS: <strong className="text-white">{snap?.drawnSegments ?? 0}</strong>
          </span>
          <span className="text-amber-300">
            PROPS: <strong className="text-amber-200">{snap?.drawnProps ?? 0}</strong>
          </span>
          <span className="text-cyan-300">
            TRUCKS: <strong className="text-cyan-200">{snap?.drawnTrucks ?? 0}</strong>
          </span>
          <span className="text-pink-300">
            PARTS: <strong className="text-pink-200">{snap?.activeParticles ?? 0}</strong>
          </span>
          {snap?.memoryMb !== null && snap?.memoryMb !== undefined && (
            <span className="text-emerald-400">
              HEAP: <strong className="text-emerald-200">{snap.memoryMb}MB</strong>
            </span>
          )}
        </div>
      )}

      {/* =====================================================================
          CENTER CALLOUT: Audio Attract Prompt & Dynamic Event Toasts
         ===================================================================== */}
      <div className="flex flex-col items-center justify-center gap-2">
        {!audioUnlocked && (
          <div className="flex items-center gap-2 rounded border border-cyan-400/60 bg-[#0b011d]/90 px-4 py-1.5 text-[11px] font-bold tracking-[0.22em] text-cyan-200 uppercase shadow-[0_0_20px_rgba(5,217,232,0.28)]">
            <span className="inline-block h-2 w-2 animate-ping rounded-full bg-pink-400" />
            <span>PRESS ANY KEY OR DRIVE TO START SYNTH AUDIO</span>
          </div>
        )}
        {toast && (
          <div
            key={toast.id}
            className={`flex items-center gap-2.5 rounded border-y border-x-4 px-4 py-1.5 text-sm font-black italic tracking-widest uppercase shadow-lg backdrop-blur-xs ${
              toast.tone === 'emerald'
                ? 'border-emerald-300 bg-emerald-950/92 text-emerald-200 shadow-emerald-500/35'
                : toast.tone === 'amber'
                  ? 'border-amber-400 bg-amber-950/92 text-amber-200 shadow-amber-500/35'
                  : toast.tone === 'cyan'
                    ? 'border-cyan-300 bg-cyan-950/92 text-cyan-200 shadow-cyan-500/35'
                    : 'border-pink-400 bg-fuchsia-950/90 text-pink-200 shadow-pink-500/35'
            }`}
          >
            <span className="text-[10px] not-italic opacity-75">◆</span>
            <span>{toast.text}</span>
            <span className="text-[10px] not-italic opacity-75">◆</span>
          </div>
        )}
      </div>

      {/* =====================================================================
          BOTTOM BAR: Left Controls/Tofu Deck + Right JDM Digital Cockpit
         ===================================================================== */}
      <div className="flex items-end justify-between gap-4">
        {/* Bottom-Left: Tofu Mode Telemetry Pill & Keycap Controls Legend
            (Offset upward via `mb-24` when Tofu Mode is active so the 120x80 canvas
             Melon Soda cup inset at bottom-left remains 100% unobstructed) */}
        <div
          className={`flex flex-col gap-1.5 transition-all duration-200 [contain:layout_style_paint] ${
            tofuMode ? 'mb-24 sm:mb-26' : ''
          }`}
        >
          {tofuMode && (
            <div className="flex items-center gap-2.5 rounded border border-emerald-400/60 bg-[#0b011d]/92 px-3 py-1.5 text-[10px] tracking-wider uppercase shadow-[0_0_16px_rgba(16,185,129,0.25)]">
              <span className="font-black text-emerald-300">TOFU CUP // ×2 GROOVE</span>
              <span className="text-cyan-200">{SODA_SKIN_LABELS[sodaSkin]}</span>
              <div className="flex items-center gap-1">
                <span className="text-fuchsia-300">SLOSH</span>
                <div className="h-1.5 w-12 overflow-clip rounded-xs bg-fuchsia-950">
                  <div
                    className={`h-full w-full origin-left transition-transform duration-75 will-change-transform ${
                      sodaDanger >= 0.9
                        ? 'bg-pink-500'
                        : sodaDanger >= 0.65
                          ? 'bg-amber-400'
                          : 'bg-emerald-400'
                    }`}
                    style={{ transform: `scaleX(${sodaDangerPct / 100})` }}
                  />
                </div>
              </div>
              <span className="font-bold tabular-nums text-amber-300">
                SPILLS: {sodaSpills}
              </span>
            </div>
          )}

          {!cleanHud && (
            <div className="hidden rounded border border-fuchsia-500/30 bg-[#0b011d]/82 px-3 py-2 text-[10px] tracking-wider text-fuchsia-200/85 backdrop-blur-xs sm:block">
              <div className="mb-1 flex items-center justify-between border-b border-fuchsia-500/20 pb-0.5 text-[9px] font-bold tracking-[0.2em] text-fuchsia-400 uppercase">
                <span>COCKPIT CONTROLS</span>
                <span>KEYBOARD / GAMEPAD</span>
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-0.5">
                <div>
                  <span className="font-bold text-cyan-300">WASD / ARROWS</span> STEER &amp; THROTTLE
                </div>
                <div>
                  <span className="font-bold text-pink-400">S + STEER (OR C)</span> DRIFT
                </div>
                <div>
                  <span className="font-bold text-emerald-300">SPACE / SHIFT</span> SHIFT UP / DOWN
                </div>
                <div>
                  <span className="font-bold text-cyan-300">G</span> AUTO-SHIFT ·{' '}
                  <span className="font-bold text-amber-300">T</span> TOFU (×2)
                </div>
                <div className="col-span-2">
                  <span className="font-bold text-amber-200">V</span> CUP SKIN ·{' '}
                  <span className="font-bold text-cyan-300">H</span> CLEAN HUD ·{' '}
                  <span className="font-bold text-fuchsia-300">M</span> MUSIC ·{' '}
                  <span className="font-bold text-emerald-300">F4</span> AUTO ·{' '}
                  <span className="font-bold text-pink-300">P</span> PAUSE
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Bottom-Right: 1980s JDM Digital Cockpit (Tachometer, 6-Speed Gearbox & Speedometer) */}
        <div className="ml-auto flex flex-col items-end gap-2 [contain:layout_style_paint]">
          {/* Tactical Driving & Rhythm Alert Strip */}
          <div className="flex flex-wrap items-center justify-end gap-1.5">
            {isOffRoad && (
              <span className="rounded border border-amber-400/85 bg-amber-950/90 px-2 py-0.5 text-xs font-bold tracking-widest text-amber-300 uppercase">
                OFF-ROAD
              </span>
            )}
            {isDrifting && (
              <span className="rounded border border-cyan-300 bg-cyan-950/92 px-2.5 py-0.5 text-xs font-bold tracking-widest text-cyan-200 uppercase shadow-[0_0_12px_rgba(5,217,232,0.5)]">
                DRIFTING {driftTime >= 0.1 ? `${driftTime.toFixed(1)}S` : ''}
              </span>
            )}
            {isOverdrive && (
              <span className="animate-pulse rounded border border-amber-300 bg-amber-950/92 px-2 py-0.5 text-xs font-bold tracking-widest text-amber-200 uppercase shadow-[0_0_12px_rgba(251,191,36,0.55)]">
                OVERDRIVE
              </span>
            )}
            {showDownshiftPrompt && (
              <span className="animate-pulse rounded border border-amber-400 bg-amber-950/92 px-2 py-0.5 text-xs font-bold tracking-widest text-amber-200 uppercase">
                BOGGING! DOWNSHIFT [SHIFT]
              </span>
            )}
            {!autoShift && isRedlining && (
              <span className="animate-pulse rounded border border-pink-400 bg-pink-950/92 px-2 py-0.5 text-xs font-bold tracking-widest text-pink-200 uppercase shadow-[0_0_10px_rgba(255,42,109,0.5)]">
                REV LIMIT! SHIFT UP [SPACE]
              </span>
            )}
            {shiftSweetSpot && (
              <span className="animate-pulse rounded border border-emerald-300 bg-emerald-950/92 px-2 py-0.5 text-xs font-bold tracking-widest text-emerald-200 uppercase shadow-[0_0_10px_rgba(16,185,129,0.4)]">
                SHIFT ON BEAT [SPACE]
              </span>
            )}
            {lastShiftTier && lastShiftTier !== 'OFF' && (
              <span
                className={`rounded border px-2 py-0.5 text-[10px] font-bold tracking-widest uppercase tabular-nums ${
                  lastShiftTier === 'PERFECT'
                    ? 'border-emerald-300 bg-emerald-950/85 text-emerald-200'
                    : 'border-cyan-300 bg-cyan-950/85 text-cyan-200'
                }`}
              >
                LAST SHIFT: {lastShiftTier}
                {lastShiftDeltaMs !== null
                  ? ` (${lastShiftDeltaMs >= 0 ? '+' : ''}${Math.round(lastShiftDeltaMs)}MS)`
                  : ''}
              </span>
            )}
          </div>

          {/* JDM Digidash Gauges Row */}
          <div className="flex items-stretch gap-2">
            {/* 6-Speed Beat-Shift Gearbox & Segmented LED Tachometer Module */}
            <div className="flex w-52 flex-col justify-between rounded border border-pink-500/45 bg-[#0b011d]/94 p-2.5 shadow-[0_0_22px_rgba(255,42,109,0.22)] backdrop-blur-xs">
              <div className="flex items-center justify-between border-b border-pink-500/20 pb-1">
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] font-bold tracking-[0.2em] text-pink-300 uppercase">
                    GEAR
                  </span>
                  <span className="text-[9px] tabular-nums text-fuchsia-300/80">
                    {displayRpm} RPM
                  </span>
                </div>
                <button
                  type="button"
                  onClick={(e) => {
                    triggerSyntheticKey('KeyG');
                    e.currentTarget.blur();
                  }}
                  className="pointer-events-auto cursor-pointer rounded border border-fuchsia-400/45 bg-fuchsia-950/80 px-1.5 py-0.2 text-[9px] font-bold text-cyan-200 transition hover:border-cyan-300"
                >
                  {autoShift ? 'AUTO [G]' : 'MAN [G]'}
                </button>
              </div>

              {/* Active Gear Readout + 6-Gate Selector Strip */}
              <div className="my-1 flex items-center justify-between">
                <div className="flex items-baseline gap-1">
                  <span className="text-3xl leading-none font-black italic tabular-nums text-pink-400 [text-shadow:0_0_10px_rgba(255,42,109,0.75)]">
                    {gear}
                  </span>
                  <span className="text-[9px] font-bold text-fuchsia-400/75 uppercase">
                    /{MAX_GEAR}
                  </span>
                </div>
                <div className="flex gap-0.5 text-[10px] font-bold">
                  {GEAR_NUMBERS.map((g) => (
                    <span
                      key={g}
                      className={`rounded-xs px-1.5 py-0.5 tabular-nums transition-colors ${
                        gear === g
                          ? 'bg-pink-500 text-white shadow-[0_0_8px_rgba(255,42,109,0.6)]'
                          : g < gear
                            ? 'bg-fuchsia-900/70 text-fuchsia-200/80'
                            : 'bg-fuchsia-950/70 text-fuchsia-400/50'
                      }`}
                    >
                      {g}
                    </span>
                  ))}
                </div>
              </div>

              {/* 18-Segment JDM LED Tachometer + Sweet-Spot Sub-Bar */}
              <div>
                <div className="mb-0.5 flex items-center justify-between text-[8px] tracking-wider uppercase">
                  <span className="text-fuchsia-300/70">TACH</span>
                  <span className="text-emerald-300/90">72–90% BEAT ZONE</span>
                </div>
                <div className="grid grid-cols-18 gap-0.5" aria-hidden="true">
                  {TACH_SEGMENT_INDICES.map((segIdx) => {
                    const segThreshold = (segIdx + 1) / TACH_SEGMENTS;
                    const isLit = segIdx < activeTachSegments;
                    const isRedZone = segThreshold > 0.9;
                    const isSweetZone = segThreshold >= 0.72 && segThreshold <= 0.9;
                    return (
                      <span
                        key={segIdx}
                        className={`h-2.5 rounded-[1px] ${
                          isLit
                            ? isRedZone
                              ? 'bg-pink-500 shadow-[0_0_5px_#ff2a6d]'
                              : isLugging
                                ? 'bg-amber-400'
                                : isSweetZone
                                  ? 'bg-emerald-400 shadow-[0_0_5px_#10b981]'
                                  : 'bg-cyan-400'
                            : isSweetZone
                              ? 'bg-emerald-950/80 border-t border-emerald-400/40'
                              : isRedZone
                                ? 'bg-pink-950/70'
                                : 'bg-fuchsia-950/80'
                        }`}
                      />
                    );
                  })}
                </div>

                {/* Precision Continuous RPM Bar with 72%-90% Beat-Shift Sweet Spot */}
                <div className="relative mt-1 h-1.5 w-full overflow-clip rounded-xs bg-fuchsia-950">
                  <div
                    className="absolute inset-y-0 left-[72%] w-[18%] bg-emerald-400/30"
                    title="Beat-Shift Sweet Spot"
                  />
                  <div
                    className={`h-full w-full origin-left transition-transform duration-75 ease-linear will-change-transform ${
                      rpm >= 0.92
                        ? 'bg-pink-500'
                        : isLugging
                          ? 'bg-amber-400'
                          : rpm >= 0.72
                            ? 'bg-emerald-400'
                            : 'bg-cyan-400'
                    }`}
                    style={{ transform: `scaleX(${rpmPct / 100})` }}
                  />
                </div>
              </div>
            </div>

            {/* JDM Digital Speedometer Module */}
            <div className="flex w-52 flex-col justify-between rounded border border-cyan-400/45 bg-[#0b011d]/94 p-2.5 shadow-[0_0_24px_rgba(5,217,232,0.22)] backdrop-blur-xs">
              <div className="flex items-center justify-between border-b border-cyan-400/20 pb-1">
                <span className="text-[10px] font-bold tracking-[0.24em] text-cyan-300 uppercase">
                  SPEED
                </span>
                <span
                  className={`rounded px-1.5 py-0.2 text-[8px] font-black tracking-widest uppercase ${
                    isOverdrive
                      ? 'bg-amber-400/25 text-amber-300 border border-amber-300/50'
                      : speedPct >= 85
                        ? 'bg-pink-500/25 text-pink-300 border border-pink-400/40'
                        : 'bg-cyan-950/80 text-cyan-300/80 border border-cyan-400/30'
                  }`}
                >
                  {isOverdrive ? 'OVERDRIVE' : speedPct >= 85 ? 'HIGH VELOCITY' : 'DIGITAL KM/H'}
                </span>
              </div>

              {/* Layered 7-Segment Style Digital Velocity Readout */}
              <div className="my-1 flex items-baseline justify-end gap-1.5">
                <div className="relative">
                  <span
                    aria-hidden="true"
                    className="text-4xl leading-none font-black italic tabular-nums tracking-tight text-fuchsia-900/35 select-none"
                  >
                    888
                  </span>
                  <span className="absolute inset-0 text-4xl leading-none font-black italic tabular-nums tracking-tight text-white [text-shadow:0_0_12px_rgba(5,217,232,0.85)]">
                    {String(speedKmh).padStart(3, '0')}
                  </span>
                </div>
                <span className="text-xs font-black tracking-wider text-pink-400">KM/H</span>
              </div>

              {/* Velocity Scale & Gradient Bar */}
              <div>
                <div className="mb-0.5 flex items-center justify-between text-[8px] tabular-nums text-cyan-300/70">
                  <span>0</span>
                  <span>100</span>
                  <span>200</span>
                  <span>MAX ({speedPct}%)</span>
                </div>
                <div className="h-2.5 w-full overflow-clip rounded-xs border border-cyan-400/30 bg-[#060112]">
                  <div
                    className="h-full w-full origin-left bg-gradient-to-r from-cyan-400 via-fuchsia-500 to-amber-300 transition-transform duration-75 ease-linear will-change-transform"
                    style={{ transform: `scaleX(${speedPct / 100})` }}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* M8 Unified Future Funk Pause Menu */}
      <PauseMenu
        open={isPaused}
        stageNumber={stageNumber}
        stagePaletteName={stagePaletteName}
        stageScore={stageScore}
        lap={lap}
        lapTime={lapTime}
        trackTitle={trackTitle}
        trackArtist={trackArtist}
        bpm={bpm}
        groove={groove}
        grooveTier={grooveTier}
        tofuMode={tofuMode}
        sodaSkin={sodaSkin}
        sodaSpills={sodaSpills}
        cleanHud={cleanHud}
        showPerfHud={showPerfHud}
        autoShift={autoShift}
        onResume={() => triggerSyntheticKey('KeyP')}
        onRestartRun={onRestartRun}
        onOpenTrackLoader={onOpenTrackLoader}
        onOpenInspector={onOpenInspector}
        onToggleDebug={onToggleDebug}
        onToggleTofuMode={() => triggerSyntheticKey('KeyT')}
        onCycleSodaSkin={() => triggerSyntheticKey('KeyV')}
        onToggleCleanHud={() => setCleanHud((prev) => !prev)}
        onTogglePerfHud={() => setShowPerfHud((prev) => !prev)}
        autopilotActive={snap?.autopilotActive ?? false}
        onToggleAutopilot={() => triggerSyntheticKey('F4')}
      />
    </div>
  );
}
