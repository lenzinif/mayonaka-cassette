import type { TelemetryBridge } from '@src/core/TelemetryBridge';
import type { GameEvent, TelemetrySnapshot } from '@src/engine/Game';
import { GEAR_NUMBERS, MAX_GEAR } from '@src/entities/Gearbox';
import { SODA_SKIN_LABELS, type SodaSkin } from '@src/entities/MelonSoda';
import type { GrooveTier } from '@src/entities/PlayerCar';
import { useEffect, useState, useSyncExternalStore } from 'react';

export interface HUDProps {
  bridge: TelemetryBridge<TelemetrySnapshot, GameEvent>;
  debugOpen: boolean;
  onToggleDebug: () => void;
  onOpenTrackLoader: () => void;
  onOpenInspector: () => void;
}

interface ToastState {
  id: number;
  text: string;
  tone?: 'pink' | 'cyan' | 'emerald' | 'amber';
}

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

const TIER_STYLES: Readonly<Record<GrooveTier, { badge: string; bar: string; label: string }>> = {
  LOW: {
    badge: 'border-fuchsia-500/50 bg-fuchsia-950/80 text-fuchsia-200',
    bar: 'from-fuchsia-600 to-pink-500',
    label: 'LOW // WARMING UP',
  },
  MEDIUM: {
    badge: 'border-cyan-400/70 bg-cyan-950/85 text-cyan-200',
    bar: 'from-cyan-400 via-fuchsia-500 to-pink-500',
    label: 'MEDIUM // IN THE POCKET',
  },
  HIGH: {
    badge: 'border-emerald-400/80 bg-emerald-950/85 text-emerald-200 shadow-[0_0_10px_rgba(16,185,129,0.4)]',
    bar: 'from-emerald-400 via-cyan-400 to-pink-500',
    label: 'HIGH // FUTURE FUNK FLOW',
  },
  SSS: {
    badge: 'border-amber-300 bg-amber-950/90 text-amber-200 shadow-[0_0_16px_rgba(251,191,36,0.65)]',
    bar: 'from-amber-300 via-pink-500 to-cyan-300',
    label: 'SSS // EUPHORIC OVERDRIVE',
  },
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
}: HUDProps) {
  const snap = useSyncExternalStore(bridge.subscribe, bridge.getSnapshot);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [cleanHud, setCleanHud] = useState(false);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }
      if (e.code === 'KeyH') {
        e.preventDefault();
        setCleanHud((prev) => !prev);
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
        if (result.rewardTier === 'PERFECT') {
          const db = result.judgement.isDownbeat ? 'DOWNBEAT ' : '';
          showToast(
            `${db}PERFECT SHIFT! ${result.fromGear}→${result.toGear} (+${Math.round(grooveGained)} GROOVE)`,
            1400,
            'emerald',
          );
        } else if (result.rewardTier === 'GOOD') {
          showToast(
            `GOOD SHIFT ${result.fromGear}→${result.toGear} (+${Math.round(grooveGained)} GROOVE)`,
            1200,
            'cyan',
          );
        }
      } else if (event.type === 'pauseChanged') {
        showToast(event.paused ? 'GAME PAUSED' : 'GAME RESUMED', 1200, 'pink');
      } else if (event.type === 'grooveTierChanged') {
        showToast(`GROOVE TIER // ${event.tier}`, 1700, event.tier === 'SSS' ? 'emerald' : 'pink');
      } else if (event.type === 'tofuModeToggled') {
        showToast(
          event.active
            ? 'TOFU MODE ON // x2 GROOVE — KEEP IT SMOOTH!'
            : 'TOFU MODE OFF',
          2000,
          event.active ? 'emerald' : 'cyan',
        );
      } else if (event.type === 'sodaSkinChanged') {
        showToast(`CUP SKIN // ${SODA_SKIN_LABELS[event.skin]}`, 1500, 'cyan');
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
  const isOffRoad = snap?.isOffRoad ?? false;
  const lap = snap?.lap ?? 1;
  const lapTime = snap?.lapTime ?? 0;
  const lastLapTime = snap?.lastLapTime ?? null;
  const fps = snap?.fps ?? 0;

  const bpm = snap?.bpm ?? 122;
  const barIndex = snap?.barIndex ?? 0;
  const beatInBar = snap?.beatInBar ?? 0;
  const sectionRole = snap?.sectionRole ?? 'intro';
  const filterCutoffHz = snap?.filterCutoffHz ?? 2400;
  const trackTitle = snap?.trackTitle ?? 'Neon Horizon (Synth Fallback)';
  const trackArtist = snap?.trackArtist ?? 'OutRun FM 88.4';
  const audioUnlocked = snap?.audioUnlocked ?? false;
  const roadBarIndex = snap?.roadBarIndex ?? 0;
  const totalBars = snap?.totalBars ?? 64;
  const currentChunkId = snap?.currentChunkId ?? 'intro-boulevard-cruise';

  // M5 & M6 Telemetry
  const gear = snap?.gear ?? 1;
  const rpm = snap?.rpm ?? 0;
  const rpmPct = Math.min(100, Math.round(rpm * 100));
  const autoShift = snap?.autoShift ?? false;
  const lastShiftTier = snap?.lastShiftTier ?? null;
  const groove = snap?.groove ?? 15;
  const grooveTier: GrooveTier = snap?.grooveTier ?? 'LOW';
  const tofuMode = snap?.tofuMode ?? false;
  const sodaSkin: SodaSkin = snap?.sodaSkin ?? 'melon-soda';
  const sodaSpills = snap?.sodaSpills ?? 0;
  const stageNumber = snap?.stageNumber ?? 1;
  const stagePaletteName = snap?.stagePaletteName ?? 'SUNSET BOULEVARD';
  const stageScore = snap?.stageScore ?? 0;
  const isPaused = snap?.isPaused ?? false;
  const gamepadConnected = snap?.gamepadConnected ?? false;

  const tierStyle = TIER_STYLES[grooveTier];
  const shiftSweetSpot = !autoShift && gear < MAX_GEAR && rpm >= 0.72;

  return (
    <div className="pointer-events-none absolute inset-0 z-2 flex flex-col justify-between p-4 font-mono text-white select-none sm:p-6">
      {/* Top Bar */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-wrap items-start gap-3">
          <div className="rounded border border-fuchsia-500/40 bg-[#0d0221]/80 px-3 py-2 shadow-[0_0_20px_rgba(255,42,109,0.25)] backdrop-blur-xs">
            <div className="flex items-center justify-between gap-3 text-[10px] tracking-[0.22em] uppercase">
              <span className="text-cyan-300">
                STAGE {String(stageNumber).padStart(2, '0')} // {stagePaletteName}
              </span>
              <span className="font-bold tabular-nums text-amber-300">
                {stageScore.toLocaleString()} PTS
              </span>
            </div>
            <div className="mt-1 flex items-baseline gap-4 text-sm">
              <span className="font-bold text-pink-400">LAP {lap}</span>
              <span className="tabular-nums text-fuchsia-100">{formatLapTime(lapTime)}</span>
              {lastLapTime !== null && (
                <span className="text-xs tabular-nums text-fuchsia-300/75">
                  LAST {formatLapTime(lastLapTime)}
                </span>
              )}
            </div>
          </div>

          {/* Cassette Beat Clock & Groove Meter Widget */}
          <div className="rounded border border-cyan-400/40 bg-[#0d0221]/85 px-3 py-2 shadow-[0_0_18px_rgba(5,217,232,0.18)] backdrop-blur-xs">
            <div className="flex items-center justify-between gap-3 text-[10px] tracking-widest text-fuchsia-300 uppercase">
              <span className="max-w-[190px] truncate text-cyan-200">
                {trackArtist} — {trackTitle}
              </span>
              <div className="flex items-center gap-1.5">
                {tofuMode && (
                  <span className="rounded border border-emerald-300/80 bg-emerald-950/90 px-1.5 py-0.2 text-[9px] font-bold text-emerald-300">
                    TOFU ×2
                  </span>
                )}
                <span className="rounded bg-pink-600/80 px-1.5 py-0.2 text-[9px] font-bold text-white uppercase">
                  {sectionRole}
                </span>
              </div>
            </div>

            <div className="mt-1 flex items-center gap-3 text-xs tabular-nums">
              <span className="font-bold text-pink-400">{bpm.toFixed(1)} BPM</span>
              <span className="text-fuchsia-200">
                BAR {String(barIndex + 1).padStart(3, '0')}.{beatInBar + 1}
              </span>
              <div className="flex items-center gap-1" aria-hidden="true">
                {[0, 1, 2, 3].map((b) => (
                  <span
                    key={b}
                    className={`inline-block h-2 w-2 rounded-full transition ${
                      beatInBar === b
                        ? b === 0
                          ? 'scale-125 bg-pink-400 shadow-[0_0_8px_#ff2a6d]'
                          : 'bg-cyan-300 shadow-[0_0_6px_#05d9e8]'
                        : 'bg-fuchsia-900/70'
                    }`}
                  />
                ))}
              </div>
              {!cleanHud && (
                <>
                  <span className="text-[10px] text-cyan-300/80">LPF {filterCutoffHz}Hz</span>
                  <span className="text-[10px] text-fuchsia-300/90">
                    ROAD {String(roadBarIndex + 1).padStart(2, '0')}/{totalBars} · {currentChunkId}
                  </span>
                </>
              )}
            </div>

            {/* Cassette Groove Bar */}
            <div className="mt-2 border-t border-fuchsia-500/25 pt-1.5">
              <div className="flex items-center justify-between text-[10px] tracking-wider">
                <div className="flex items-center gap-1.5">
                  <span className="text-fuchsia-300">GROOVE TAPE</span>
                  <span className={`rounded border px-1.5 py-0.2 text-[9px] font-bold ${tierStyle.badge}`}>
                    {tierStyle.label}
                  </span>
                </div>
                <span className="font-bold tabular-nums text-cyan-200">{groove}%</span>
              </div>
              <div className="relative mt-1 h-2 w-full overflow-hidden rounded-xs bg-fuchsia-950/90">
                {/* Tier markers at 25%, 55%, 85% */}
                <div className="absolute inset-y-0 left-[25%] z-1 w-px bg-white/25" />
                <div className="absolute inset-y-0 left-[55%] z-1 w-px bg-white/25" />
                <div className="absolute inset-y-0 left-[85%] z-1 w-px bg-amber-300/60" />
                <div
                  className={`h-full bg-gradient-to-r ${tierStyle.bar} transition-[width] duration-75 ease-linear`}
                  style={{ width: `${groove}%` }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Top-Right Action Buttons */}
        <div className="flex flex-wrap items-center justify-end gap-2">
          {cleanHud ? (
            <button
              type="button"
              onClick={(e) => {
                setCleanHud(false);
                e.currentTarget.blur();
              }}
              className="pointer-events-auto cursor-pointer rounded border border-cyan-400/50 bg-[#0d0221]/75 px-2.5 py-1 text-xs font-semibold tracking-wider text-cyan-200 backdrop-blur-xs transition hover:border-pink-400 hover:text-pink-200"
              title="Mostra HUD completa [H]"
            >
              SHOW HUD [H]
            </button>
          ) : (
            <>
              <div className="rounded border border-cyan-400/30 bg-[#0d0221]/80 px-2.5 py-1 text-xs tabular-nums text-cyan-300">
                {fps} FPS
              </div>
              {gamepadConnected && (
                <div
                  className="rounded border border-emerald-400/60 bg-emerald-950/80 px-2 py-1 text-xs font-bold text-emerald-200 shadow-[0_0_8px_rgba(16,185,129,0.35)]"
                  title="Controller Gamepad connesso e attivo"
                >
                  GP [ON]
                </div>
              )}
              <button
                type="button"
                onClick={(e) => {
                  triggerSyntheticKey('KeyP');
                  e.currentTarget.blur();
                }}
                className={`pointer-events-auto cursor-pointer rounded border px-2.5 py-1 text-xs font-semibold tracking-wider transition ${
                  isPaused
                    ? 'border-pink-500 bg-pink-950/90 text-pink-200 shadow-[0_0_12px_rgba(255,42,109,0.5)] animate-pulse'
                    : 'border-fuchsia-400/45 bg-[#1a0933]/85 text-fuchsia-200 hover:border-cyan-300'
                }`}
                title="Metti in pausa o riprendi la guida [P] / [ESC]"
              >
                {isPaused ? 'RESUME [P]' : 'PAUSE [P]'}
              </button>
              <button
                type="button"
                onClick={(e) => {
                  setCleanHud(true);
                  e.currentTarget.blur();
                }}
                className="pointer-events-auto cursor-pointer rounded border border-cyan-400/50 bg-[#0e1b38]/85 px-2.5 py-1 text-xs font-semibold tracking-wider text-cyan-200 transition hover:border-pink-400 hover:text-pink-200"
                title="Nascondi i menu e i tasti non necessari durante la corsa [H]"
              >
                CLEAN HUD [H]
              </button>
              <button
                type="button"
                onClick={(e) => {
                  triggerSyntheticKey('KeyT');
                  e.currentTarget.blur();
                }}
                className={`pointer-events-auto cursor-pointer rounded border px-2.5 py-1 text-xs font-semibold tracking-wider transition ${
                  tofuMode
                    ? 'border-emerald-400 bg-emerald-950/90 text-emerald-200 shadow-[0_0_12px_rgba(16,185,129,0.4)]'
                    : 'border-emerald-500/45 bg-[#0d1f26]/85 text-emerald-300/90 hover:border-emerald-300'
                }`}
              >
                {tofuMode ? `TOFU ON (${sodaSpills} SPILLS) [T]` : 'TOFU MODE [T]'}
              </button>
              <button
                type="button"
                onClick={(e) => {
                  triggerSyntheticKey('KeyV');
                  e.currentTarget.blur();
                }}
                className="pointer-events-auto cursor-pointer rounded border border-amber-400/50 bg-[#1f1209]/85 px-2.5 py-1 text-xs font-semibold tracking-wider text-amber-200 transition hover:border-amber-300"
                title="Cycle Dashboard Cup Skin (Melon Soda / Tofu Cup / Pocari / Boss Coffee)"
              >
                SKIN: {SODA_SKIN_LABELS[sodaSkin]} [V]
              </button>
              <button
                type="button"
                onClick={(e) => {
                  onOpenTrackLoader();
                  e.currentTarget.blur();
                }}
                className="pointer-events-auto cursor-pointer rounded border border-cyan-400/55 bg-[#0e1b38]/85 px-2.5 py-1 text-xs font-semibold tracking-wider text-cyan-200 transition hover:border-pink-400 hover:text-pink-200"
              >
                LOAD TRACK [M]
              </button>
              <button
                type="button"
                onClick={(e) => {
                  onOpenInspector();
                  e.currentTarget.blur();
                }}
                className="pointer-events-auto cursor-pointer rounded border border-fuchsia-400/45 bg-[#1a0933]/85 px-2.5 py-1 text-xs font-semibold tracking-wider text-fuchsia-200 transition hover:border-cyan-400 hover:text-cyan-200"
              >
                ANALYZE
              </button>
              <button
                type="button"
                onClick={(e) => {
                  onToggleDebug();
                  e.currentTarget.blur();
                }}
                className="pointer-events-auto cursor-pointer rounded border border-pink-500/50 bg-[#1a0933]/85 px-2.5 py-1 text-xs font-semibold tracking-wider text-pink-300 transition hover:border-cyan-400 hover:text-cyan-200"
              >
                {debugOpen ? 'CLOSE TUNING [F2]' : 'TUNING [F2]'}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Center Toast / Audio Unlock Prompt */}
      <div className="flex flex-col items-center justify-center gap-2">
        {!audioUnlocked && (
          <div className="rounded border border-cyan-400/50 bg-[#0d0221]/85 px-3.5 py-1 text-[11px] tracking-widest text-cyan-200 uppercase shadow">
            PRESS ANY KEY OR DRIVE TO START SYNTH AUDIO
          </div>
        )}
        {toast && (
          <div
            key={toast.id}
            className={`rounded border px-4 py-1.5 text-sm font-bold tracking-widest uppercase shadow-lg ${
              toast.tone === 'emerald'
                ? 'border-emerald-300 bg-emerald-950/90 text-emerald-200 shadow-emerald-500/30'
                : toast.tone === 'amber'
                  ? 'border-amber-400 bg-amber-950/90 text-amber-200 shadow-amber-500/30'
                  : toast.tone === 'cyan'
                    ? 'border-cyan-300 bg-cyan-950/90 text-cyan-200 shadow-cyan-500/30'
                    : 'border-pink-400 bg-fuchsia-950/85 text-pink-200 shadow-pink-500/30'
            }`}
          >
            {toast.text}
          </div>
        )}
      </div>

      {/* Bottom Bar */}
      <div className="flex items-end justify-between gap-4">
        {/* Controls legend — offset upward when Tofu Mode is active, hidden when Clean HUD is active */}
        {!cleanHud && (
          <div
            className={`hidden rounded border border-fuchsia-500/25 bg-[#0d0221]/75 px-3 py-2 text-[11px] tracking-wider text-fuchsia-200/80 transition-all sm:block ${
              tofuMode ? 'mb-24' : ''
            }`}
          >
            <div>
              <span className="text-cyan-300">WASD / ARROWS</span> STEER &amp; THROTTLE
            </div>
            <div>
              <span className="text-pink-400">S + STEER (OR C)</span> DRIFT
            </div>
            <div>
              <span className="text-emerald-300">SPACE / SHIFT</span> SHIFT UP / DOWN ·{' '}
              <span className="text-cyan-300">G</span> AUTO-SHIFT
            </div>
            <div>
              <span className="text-amber-300">T</span> TOFU MODE (×2) ·{' '}
              <span className="text-amber-200">V</span> CUP SKIN ·{' '}
              <span className="text-cyan-300">H</span> CLEAN HUD ·{' '}
              <span className="text-fuchsia-300">M</span> LOAD MUSIC
            </div>
          </div>
        )}

        {/* Gearbox, RPM & Speedometer */}
        <div className="ml-auto flex flex-col items-end gap-2">
          <div className="flex flex-wrap items-center justify-end gap-2">
            {isOffRoad && (
              <span className="rounded border border-amber-400/80 bg-amber-950/85 px-2 py-0.5 text-xs font-bold tracking-widest text-amber-300 uppercase">
                OFF-ROAD
              </span>
            )}
            {isDrifting && (
              <span className="rounded border border-cyan-300 bg-cyan-950/90 px-2.5 py-0.5 text-xs font-bold tracking-widest text-cyan-200 uppercase shadow-[0_0_12px_rgba(5,217,232,0.5)]">
                DRIFTING
              </span>
            )}
            {shiftSweetSpot && (
              <span className="animate-pulse rounded border border-emerald-300 bg-emerald-950/90 px-2 py-0.5 text-xs font-bold tracking-widest text-emerald-200 uppercase">
                SHIFT ON BEAT [SPACE]
              </span>
            )}
            {lastShiftTier && lastShiftTier !== 'OFF' && (
              <span
                className={`rounded border px-2 py-0.5 text-[10px] font-bold tracking-widest uppercase ${
                  lastShiftTier === 'PERFECT'
                    ? 'border-emerald-300 bg-emerald-950/85 text-emerald-200'
                    : 'border-cyan-300 bg-cyan-950/85 text-cyan-200'
                }`}
              >
                LAST SHIFT: {lastShiftTier}
              </span>
            )}
          </div>

          <div className="flex items-stretch gap-2">
            {/* 6-Speed Gearbox & RPM Module */}
            <div className="flex w-44 flex-col justify-between rounded border border-pink-500/40 bg-[#0d0221]/85 p-2.5 shadow-[0_0_20px_rgba(255,42,109,0.2)] backdrop-blur-xs">
              <div className="flex items-center justify-between">
                <span className="text-[10px] tracking-[0.2em] text-pink-300 uppercase">GEAR</span>
                <button
                  type="button"
                  onClick={(e) => {
                    triggerSyntheticKey('KeyG');
                    e.currentTarget.blur();
                  }}
                  className="pointer-events-auto cursor-pointer rounded border border-fuchsia-400/40 bg-fuchsia-950/70 px-1.5 py-0.2 text-[9px] font-bold text-cyan-200 hover:border-cyan-300"
                >
                  {autoShift ? 'AUTO [G]' : 'MAN [G]'}
                </button>
              </div>

              <div className="my-0.5 flex items-baseline justify-between">
                <span className="text-3xl font-black italic tabular-nums text-pink-400 drop-shadow-[0_0_8px_rgba(255,42,109,0.7)]">
                  {gear}
                </span>
                <div className="flex gap-0.5 text-[10px] font-bold">
                  {GEAR_NUMBERS.map((g) => (
                    <span
                      key={g}
                      className={`px-1 rounded-xs ${
                        gear === g
                          ? 'bg-pink-500 text-white'
                          : 'bg-fuchsia-950/70 text-fuchsia-400/60'
                      }`}
                    >
                      {g}
                    </span>
                  ))}
                </div>
              </div>

              {/* RPM Bar with 72%-90% beat-shift sweet spot */}
              <div className="relative h-2 w-full overflow-hidden rounded-xs bg-fuchsia-950">
                <div
                  className="absolute inset-y-0 left-[72%] w-[18%] bg-emerald-400/25"
                  title="Beat-Shift Sweet Spot"
                />
                <div
                  className={`h-full transition-[width] duration-75 ease-linear ${
                    rpm >= 0.92
                      ? 'bg-pink-500'
                      : rpm >= 0.72
                        ? 'bg-emerald-400'
                        : 'bg-cyan-400'
                  }`}
                  style={{ width: `${rpmPct}%` }}
                />
              </div>
            </div>

            {/* Speedometer Module */}
            <div className="w-48 rounded border border-cyan-400/40 bg-[#0d0221]/85 p-3 shadow-[0_0_24px_rgba(5,217,232,0.2)] backdrop-blur-xs">
              <div className="flex items-baseline justify-between">
                <span className="text-[10px] tracking-[0.25em] text-cyan-300 uppercase">SPEED</span>
                <div className="flex items-baseline gap-1">
                  <span className="text-3xl font-black italic tabular-nums tracking-tight text-white drop-shadow-[0_0_8px_rgba(255,42,109,0.8)]">
                    {String(speedKmh).padStart(3, '0')}
                  </span>
                  <span className="text-xs font-bold text-pink-400">KM/H</span>
                </div>
              </div>
              <div className="mt-2 h-2 w-full overflow-hidden rounded-xs bg-fuchsia-950">
                <div
                  className="h-full bg-gradient-to-r from-cyan-400 via-fuchsia-500 to-amber-300 transition-[width] duration-75 ease-linear"
                  style={{ width: `${speedPct}%` }}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
