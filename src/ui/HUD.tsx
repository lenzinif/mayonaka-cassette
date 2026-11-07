import type { SectionRole } from '@src/audio/BeatMap';
import type { TelemetryBridge } from '@src/core/TelemetryBridge';
import type { GameEvent, TelemetrySnapshot } from '@src/engine/Game';
import { SODA_SKIN_LABELS, type SodaSkin } from '@src/entities/MelonSoda';
import type { GrooveTier } from '@src/entities/PlayerCar';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { CassetteTapeWidget } from './hud/CassetteTapeWidget';
import { RhythmBezel } from './hud/RhythmBezel';
import { VfdDigidash } from './hud/VfdDigidash';
import { PauseMenu } from './PauseMenu';

export interface HUDProps {
  bridge: TelemetryBridge<TelemetrySnapshot, GameEvent>;
  debugOpen: boolean;
  trackLoaderOpen?: boolean;
  inspectorOpen?: boolean;
  onToggleDebug: () => void;
  onOpenTrackLoader: () => void;
  onOpenInspector: () => void;
  gameStarted?: boolean;
  onRestartRun?: () => void;
  onReturnToMainMenu?: () => void;
}

interface ToastState {
  id: number;
  text: string;
  tone?: 'pink' | 'cyan' | 'emerald' | 'amber';
}

function formatLapTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  const hundredths = Math.round((seconds * 100) % 100);
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${String(hundredths).padStart(2, '0')}`;
}

function triggerSyntheticKey(code: string): void {
  window.dispatchEvent(new KeyboardEvent('keydown', { code, bubbles: true }));
  window.dispatchEvent(new KeyboardEvent('keyup', { code, bubbles: true }));
}

/**
 * React HUD overlay (`z-index: 2`, `pointer-events-none`, AGENTS.md §2).
 * Re-renders at most `TELEMETRY_HZ` (15 Hz) via `useSyncExternalStore` + discrete events.
 *
 * Fully overhauled to 1980s Cassette Deck & VFD Digidash architecture with clean UX:
 * - Zero in-game clutter: 5x2 grid removed, settings accessible in Pause Menu.
 * - Togglable Cassette Tape Groove Widget [C].
 * - Fullscreen Clean Mode [H].
 * - Integrated Autonomous Autopilot [F4].
 */
export function HUD({
  bridge,
  trackLoaderOpen = false,
  inspectorOpen = false,
  onToggleDebug,
  onOpenTrackLoader,
  gameStarted = true,
  onOpenInspector,
  onRestartRun,
  onReturnToMainMenu,
}: HUDProps) {
  const snap = useSyncExternalStore(bridge.subscribe, bridge.getSnapshot, bridge.getSnapshot);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [cleanHud, setCleanHud] = useState(false);
  const [showPerfHud, setShowPerfHud] = useState(false);
  const [showCassetteDeck, setShowCassetteDeck] = useState(true);
  const [isTapeSlack, setIsTapeSlack] = useState(false);

  // Keyboard shortcut listeners
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }
      if (e.code === 'KeyH') {
        e.preventDefault();
        setCleanHud((prev) => !prev);
      } else if (e.code === 'KeyC') {
        e.preventDefault();
        setShowCassetteDeck((prev) => !prev);
      } else if (e.code === 'F3') {
        e.preventDefault();
        setShowPerfHud((prev) => !prev);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  // Telemetry event listeners & tape slack triggers
  useEffect(() => {
    let timerId = 0;
    let slackTimerId = 0;

    const showToast = (
      text: string,
      ms = 1800,
      tone: ToastState['tone'] = 'pink',
    ) => {
      window.clearTimeout(timerId);
      setToast({ id: Date.now(), text, tone });
      timerId = window.setTimeout(() => setToast(null), ms);
    };

    const triggerSlackAnimation = () => {
      window.clearTimeout(slackTimerId);
      setIsTapeSlack(true);
      slackTimerId = window.setTimeout(() => setIsTapeSlack(false), 1500);
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
        triggerSlackAnimation();
        showToast(
          `MELON SODA SPILL! -${Math.round(event.grooveLost)} GROOVE`,
          1500,
          'amber',
        );
      } else if (event.type === 'collision') {
        if (event.outcome === 'truckKnockedOff') {
          showToast('KEI TRUCK TAKEDOWN! // DRIFT SMASH', 1300, 'cyan');
        } else {
          triggerSlackAnimation();
          showToast(
            event.outcome === 'playerShuntedOff'
              ? 'REAR-END SHUNT! -GROOVE'
              : 'ROADSIDE IMPACT! -GROOVE',
            1200,
            'amber',
          );
        }
      }
    });

    return () => {
      unsub();
      window.clearTimeout(timerId);
      window.clearTimeout(slackTimerId);
    };
  }, [bridge]);

  // Telemetry values
  const speedKmh = snap?.speedKmh ?? 0;
  const speedRatio = snap?.speedRatio ?? 0;
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
  const beatPulse = snap?.beatPulse ?? 0;
  const sectionRole: SectionRole = snap?.sectionRole ?? 'intro';
  const barEnergy = snap?.barEnergy ?? 0.5;
  const filterCutoffHz = snap?.filterCutoffHz ?? 2400;
  const trackTitle = snap?.trackTitle ?? 'Neon Horizon (Synth Fallback)';
  const trackArtist = snap?.trackArtist ?? 'OutRun FM 88.4';
  const audioUnlocked = snap?.audioUnlocked ?? false;
  const roadBarIndex = snap?.roadBarIndex ?? 0;
  const totalBars = Math.max(1, snap?.totalBars ?? 64);

  // M5 & M6 Telemetry
  const gear = snap?.gear ?? 1;
  const rpm = snap?.rpm ?? 0;
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

  const sodaDangerPct = Math.min(100, Math.round(sodaDanger * 100));

  if (!gameStarted) return null;

  return (
    <div className="pointer-events-none absolute inset-0 z-2 flex flex-col justify-between p-3 font-mono text-white select-none sm:p-5">
      {/* Downbeat Rhythm Bezel light pulse */}
      <RhythmBezel
        beatPulse={beatPulse}
        beatInBar={beatInBar}
        grooveTier={grooveTier}
      />

      {/* =====================================================================
          TOP BAR: Left Cassette Tape Deck + Right Minimalist Pause & Status Pill
         ===================================================================== */}
      <div className="relative z-1 flex items-start justify-between gap-2.5 sm:gap-3">
        {/* Left: Cassette Tape Groove Deck (Togglable via [C] or button) */}
        <div className="flex min-w-0 items-start">
          <CassetteTapeWidget
            trackArtist={trackArtist}
            trackTitle={trackTitle}
            bpm={bpm}
            barIndex={barIndex}
            beatInBar={beatInBar}
            sectionRole={sectionRole}
            barEnergy={barEnergy}
            filterCutoffHz={filterCutoffHz}
            groove={groove}
            grooveTier={grooveTier}
            tofuMode={tofuMode}
            roadBarIndex={roadBarIndex}
            totalBars={totalBars}
            speedRatio={speedRatio}
            playlistIndex={playlistIndex}
            playlistLength={playlistLength}
            isSlack={isTapeSlack}
            visible={showCassetteDeck && !cleanHud}
            onToggleVisible={() => setShowCassetteDeck((prev) => !prev)}
          />
        </div>

        {/* Right: Minimalist Status Pill (Replaces old 5x2 grid, freeing up the view) */}
        <div className="pointer-events-auto flex items-center gap-1.5 [contain:layout_style_paint]">
          {/* Autopilot Active Indicator */}
          {snap?.autopilotActive && (
            <span className="animate-pulse rounded border border-cyan-300/80 bg-cyan-950/90 px-2 py-1 text-[10px] font-bold text-cyan-300 shadow-[0_0_10px_rgba(5,217,232,0.5)]">
              🤖 AUTO [{snap.autopilotMode?.toUpperCase() ?? 'ON'}]
            </span>
          )}

          <div
            className="flex h-7 items-center justify-center gap-1.5 rounded border border-cyan-400/30 bg-[#090217]/90 px-2.5 py-0.5 text-xs font-semibold tabular-nums text-cyan-300"
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

          {/* Clean HUD quick toggle */}
          <button
            type="button"
            onClick={(e) => {
              setCleanHud((prev) => !prev);
              e.currentTarget.blur();
            }}
            className={`flex h-7 cursor-pointer items-center justify-center rounded border px-2 text-xs font-semibold tracking-wider transition ${
              cleanHud
                ? 'border-pink-500 bg-pink-950/90 text-pink-200'
                : 'border-cyan-400/40 bg-[#090217]/85 text-cyan-200 hover:border-pink-400 hover:text-pink-200'
            }`}
            title="Modalità HUD essenziale [H]"
          >
            {cleanHud ? 'FULL HUD [H]' : 'CLEAN [H]'}
          </button>

          {/* Pause Drive Button */}
          <button
            type="button"
            onClick={(e) => {
              triggerSyntheticKey('KeyP');
              e.currentTarget.blur();
            }}
            className={`flex h-7 cursor-pointer items-center justify-center rounded border px-3 text-xs font-bold tracking-wider transition ${
              isPaused
                ? 'animate-pulse border-pink-500 bg-pink-950/90 text-pink-200 shadow-[0_0_12px_rgba(255,42,109,0.6)]'
                : 'border-fuchsia-400/55 bg-[#16042d]/90 text-fuchsia-200 hover:border-pink-400 hover:text-pink-200 shadow-[0_0_10px_rgba(255,42,109,0.25)]'
            }`}
            title="Pausa di gioco [ESC] o [P]"
          >
            {isPaused ? 'RESUME [P]' : 'PAUSE [ESC]'}
          </button>
        </div>
      </div>

      {/* M8 Mini Performance Profiler Ribbon (Activated on demand via F3 or Pause Menu) */}
      {showPerfHud && (
        <div className="pointer-events-auto relative z-1 mx-auto mt-1.5 flex flex-wrap items-center justify-center gap-3 rounded border border-cyan-400/50 bg-[#090117]/95 px-3 py-1 font-mono text-[10px] text-cyan-200 shadow-[0_0_15px_rgba(5,217,232,0.3)]">
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
      <div className="relative z-1 flex flex-col items-center justify-center gap-2">
        {!audioUnlocked && (
          <div className="flex items-center gap-2 rounded border border-cyan-400/60 bg-[#0b011d]/90 px-4 py-1.5 text-[11px] font-bold tracking-[0.22em] text-cyan-200 uppercase shadow-[0_0_20px_rgba(5,217,232,0.28)]">
            <span className="inline-block h-2 w-2 animate-ping rounded-full bg-pink-400" />
            <span>PRESS ANY KEY OR DRIVE TO START SYNTH AUDIO</span>
          </div>
        )}
        {toast && (
          <div
            key={toast.id}
            className={`flex items-center gap-2.5 rounded border-y border-x-4 px-4 py-1.5 text-sm font-black italic tracking-widest uppercase shadow-lg ${
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
          BOTTOM BAR: Left Controls/Tofu Deck + Right JDM VFD Digidash
         ===================================================================== */}
      <div className="relative z-1 flex items-end justify-between gap-4">
        {/* Bottom-Left: Tofu Mode Telemetry Pill (when active)
            (Offset upward via `mb-24` so the 120x80 canvas Melon Soda cup inset
             at bottom-left remains 100% unobstructed) */}
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
                <div className="h-1.5 w-12 overflow-hidden rounded-xs bg-fuchsia-950">
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
        </div>

        {/* Bottom-Right: 1980s JDM VFD Digital Cockpit Binnacle (Tachometer, Gearbox, Speedometer, Groove Flux) */}
        <VfdDigidash
          speedKmh={speedKmh}
          speedRatio={speedRatio}
          gear={gear}
          rpm={rpm}
          groove={groove}
          grooveTier={grooveTier}
          isLugging={isLugging}
          isRedlining={isRedlining}
          isOverdrive={isOverdrive}
          autoShift={autoShift}
          lastShiftTier={lastShiftTier}
          lastShiftDeltaMs={lastShiftDeltaMs}
          isDrifting={isDrifting}
          driftTime={driftTime}
          isOffRoad={isOffRoad}
          onToggleAutoShift={() => triggerSyntheticKey('KeyG')}
        />
      </div>

      {/* M8 Centralized Future Funk Pause Menu (Hub for all in-game options & tuning) */}
      <PauseMenu
        open={gameStarted && isPaused && !trackLoaderOpen && !inspectorOpen}
        stageNumber={stageNumber}
        stagePaletteName={stagePaletteName}
        stageScore={stageScore}
        bestSongGrade={bestSongGrade}
        bestSongScore={bestSongScore}
        lap={lap}
        lapTime={lapTime}
        lastLapTime={lastLapTime}
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
        autopilotActive={snap?.autopilotActive ?? false}
        onResume={() => triggerSyntheticKey('KeyP')}
        onRestartRun={onRestartRun}
        onOpenTrackLoader={onOpenTrackLoader}
        onOpenInspector={onOpenInspector}
        onToggleDebug={onToggleDebug}
        onToggleTofuMode={() => triggerSyntheticKey('KeyT')}
        onCycleSodaSkin={() => triggerSyntheticKey('KeyV')}
        onToggleCleanHud={() => setCleanHud((prev) => !prev)}
        onTogglePerfHud={() => setShowPerfHud((prev) => !prev)}
        onToggleAutoShift={() => triggerSyntheticKey('KeyG')}
        onToggleAutopilot={() => triggerSyntheticKey('F4')}
        onReturnToMainMenu={onReturnToMainMenu}
      />
    </div>
  );
}
