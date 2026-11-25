import type { SectionRole } from '@src/audio/BeatMap';
import type { TelemetryBridge } from '@src/core/TelemetryBridge';
import type { GameEvent, TelemetrySnapshot } from '@src/engine/Game';
import { SODA_SKIN_LABELS, type SodaSkin } from '@src/entities/MelonSoda';
import type { GrooveTier } from '@src/entities/PlayerCar';
import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
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
  cleanHud?: boolean;
  onToggleCleanHud?: () => void;
  onTogglePause?: () => void;
  onToggleAutoShift?: () => void;
  onToggleTofuMode?: () => void;
  onCycleSodaSkin?: () => void;
  onToggleAutopilot?: () => void;
  crtEnabled?: boolean;
  onToggleCrt?: () => void;
  hideBezel?: boolean;
  minimalPerfOnly?: boolean;
  hideCassette?: boolean;
  hideVfd?: boolean;
}

/**
 * React HUD overlay (`z-index: 2`, `pointer-events-none`, AGENTS.md §2).
 * Re-renders at most `TELEMETRY_HZ` (15 Hz) via `useSyncExternalStore` + discrete events.
 * Harmonized under the 7-token Mayonaka Hi-Fi palette with zero GPU blur overhead.
 */
export function HUD({
  bridge,
  debugOpen,
  trackLoaderOpen = false,
  inspectorOpen = false,
  onToggleDebug,
  onOpenTrackLoader,
  gameStarted = true,
  onOpenInspector,
  onRestartRun,
  onReturnToMainMenu,
  cleanHud,
  onToggleCleanHud,
  onTogglePause,
  onToggleAutoShift,
  onToggleTofuMode,
  onCycleSodaSkin,
  onToggleAutopilot,
  crtEnabled = true,
  onToggleCrt,
  hideBezel = false,
  minimalPerfOnly = false,
  hideCassette = false,
  hideVfd = false,
}: HUDProps) {
  const snap = useSyncExternalStore(bridge.subscribe, bridge.getSnapshot, bridge.getSnapshot);
  const [internalCleanHud, setInternalCleanHud] = useState(false);
  const [showPerfHud, setShowPerfHud] = useState(false);
  const [showCassetteDeck, setShowCassetteDeck] = useState(true);
  const [isTapeSlack, setIsTapeSlack] = useState(false);

  const effectiveCleanHud = cleanHud ?? internalCleanHud;
  const handleToggleCleanHud = useCallback(() => {
    if (onToggleCleanHud) onToggleCleanHud();
    else setInternalCleanHud((prev) => !prev);
  }, [onToggleCleanHud]);
  const handleToggleCassetteDeck = useCallback(
    () => setShowCassetteDeck((prev) => !prev),
    [],
  );
  const handleToggleAutoShift = useCallback(() => {
    onToggleAutoShift?.();
  }, [onToggleAutoShift]);

  // Keyboard shortcut listeners
  useEffect(() => {
    if (!gameStarted) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }
      if (e.code === 'KeyH') {
        e.preventDefault();
        handleToggleCleanHud();
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
  }, [gameStarted, handleToggleCleanHud]);

  // Telemetry event listeners & tape slack triggers
  useEffect(() => {
    let slackTimerId = 0;

    const triggerSlackAnimation = () => {
      window.clearTimeout(slackTimerId);
      setIsTapeSlack(true);
      slackTimerId = window.setTimeout(() => setIsTapeSlack(false), 1500);
    };

    const unsub = bridge.onEvent((event) => {
      if (event.type === 'sodaSpill') {
        triggerSlackAnimation();
      } else if (event.type === 'collision' && event.outcome !== 'truckKnockedOff') {
        triggerSlackAnimation();
      }
    });

    return () => {
      unsub();
      window.clearTimeout(slackTimerId);
    };
  }, [bridge]);

  // Telemetry values (quantize high-frequency continuous floats to avoid 15 Hz React.memo churn)
  const speedKmh = snap?.speedKmh ?? 0;
  const speedRatio = Math.round((snap?.speedRatio ?? 0) * 100) / 100;
  const lap = snap?.lap ?? 1;
  const lapTime = snap?.lapTime ?? 0;
  const lastLapTime = snap?.lastLapTime ?? null;
  const fps = snap?.fps ?? 0;

  const bpm = snap?.bpm ?? 122;
  const barIndex = snap?.barIndex ?? 0;
  const beatInBar = snap?.beatInBar ?? 0;
  const beatPulse = snap?.beatPulse ?? 0;
  const sectionRole: SectionRole = snap?.sectionRole ?? 'intro';
  const barEnergy = Math.round((snap?.barEnergy ?? 0.5) * 50) / 50;
  const filterCutoffHz = Math.round((snap?.filterCutoffHz ?? 2400) / 20) * 20;
  const trackTitle = snap?.trackTitle ?? 'Neon Horizon';
  const trackArtist = snap?.trackArtist ?? 'Mayonaka FM';
  const roadBarIndex = snap?.roadBarIndex ?? 0;
  const totalBars = Math.max(1, snap?.totalBars ?? 64);

  // M5 & M6 Telemetry
  const gear = snap?.gear ?? 1;
  const rpm = Math.round((snap?.rpm ?? 0) * 100) / 100;
  const isLugging = snap?.isLugging ?? false;
  const autoShift = snap?.autoShift ?? false;
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
  const cassetteVisible = !hideCassette && showCassetteDeck && !effectiveCleanHud;

  if (!gameStarted) return null;

  if (minimalPerfOnly) {
    return (
      <div className="ff-mono pointer-events-none absolute top-2 left-2 z-2 bg-[#0B0E1E]/85 px-2 py-1 text-[10px] text-[var(--ff-cream)]">
        PERF {fps} FPS | MIN {snap?.minFps ?? fps} | FR {snap?.frameTimeMs ?? 16.7}ms | P95{' '}
        {snap?.p95FrameMs ?? 16.7}ms | JS {snap?.renderTimeMs ?? 0}ms | GAP{' '}
        {snap?.compositorGapMs ?? 0}ms | DRP {snap?.droppedFrames ?? 0} | SEG{' '}
        {snap?.drawnSegments ?? 0} | PRP {snap?.drawnProps ?? 0}
      </div>
    );
  }

  return (
    <div className="pointer-events-none absolute inset-0 z-2 flex flex-col justify-between p-3 text-[var(--ff-cream)] select-none sm:p-5">
      {/* Downbeat Rhythm Bezel light pulse */}
      {!hideBezel && (
        <RhythmBezel
          beatPulse={beatPulse}
          beatInBar={beatInBar}
          grooveTier={grooveTier}
          alwaysMount
        />
      )}

      {/* TOP BAR: Left Cassette Tape Deck + Right Minimalist Controls */}
      <div className="relative z-1 flex items-start justify-between gap-2.5 sm:gap-3">
        <div className="flex min-w-0 items-start [contain:layout_style_paint] [transform:translateZ(0)]">
          {!hideCassette && (
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
              visible={showCassetteDeck && !effectiveCleanHud}
              onToggleVisible={handleToggleCassetteDeck}
            />
          )}
        </div>

        {/* Right: Minimalist Status & Action Controls */}
        <div className="pointer-events-auto flex items-center gap-1.5 [contain:layout_style_paint] [transform:translateZ(0)]">
          {snap?.autopilotActive && (
            <span
              className="ff-mono rounded-[2px] border border-[var(--ff-mint)] bg-[#12172E]/90 px-2 py-1 text-[10px] font-bold tracking-wider text-[var(--ff-mint)] uppercase"
              title={`Autopilot: ${snap.autopilotMode?.toUpperCase() ?? 'ON'}`}
            >
              AUTO
            </span>
          )}

          {gamepadConnected && (
            <span
              className="ff-mono rounded-[2px] border border-[rgba(46,232,196,0.5)] bg-[#12172E]/90 px-2 py-1 text-[10px] font-black text-[var(--ff-mint)]"
              title="Gamepad connected"
            >
              GP
            </span>
          )}

          <button
            type="button"
            onClick={(e) => {
              handleToggleCleanHud();
              e.currentTarget.blur();
            }}
            className={`flex h-7 cursor-pointer items-center justify-center rounded-[2px] border px-2.5 text-[10px] font-bold tracking-[0.14em] uppercase transition ${
              effectiveCleanHud
                ? 'border-[var(--ff-pink)] bg-[var(--ff-panel)] text-[var(--ff-pink)]'
                : 'border-[rgba(255,245,228,0.22)] bg-[#12172E]/88 text-[var(--ff-cream)] hover:border-[var(--ff-mint)] hover:text-[var(--ff-mint)]'
            }`}
            title="Toggle minimal HUD [H]"
          >
            {effectiveCleanHud ? 'FULL H' : 'HUD H'}
          </button>

          <button
            type="button"
            onClick={(e) => {
              onTogglePause?.();
              e.currentTarget.blur();
            }}
            className="flex h-7 cursor-pointer items-center justify-center rounded-[2px] border border-[var(--ff-pink)] bg-[var(--ff-pink)] px-2.5 text-[10px] font-black tracking-[0.14em] text-[var(--ff-cream)] uppercase transition hover:brightness-110"
            style={{ boxShadow: '2px 2px 0 #0B0E1E' }}
            title="Pause [ESC] or [P]"
          >
            {isPaused ? 'RESUME' : 'PAUSE'}
          </button>
        </div>
      </div>

      {/* On-Demand Performance Profiler Ribbon (F3) */}
      {showPerfHud && (
        <div
          className={`ff-mono pointer-events-auto absolute top-11 z-2 flex flex-wrap items-center justify-end gap-2.5 rounded-[2px] border border-[rgba(255,245,228,0.25)] bg-[#0B0E1E]/95 px-3 py-1 text-[10px] text-[var(--ff-cream)] sm:top-13 [contain:layout_style_paint] [transform:translateZ(0)] ${
            debugOpen
              ? cassetteVisible
                ? 'right-[calc(376px+1.25rem)] max-w-[calc(100%-376px-2.5rem)] sm:right-[calc(376px+1.75rem)] lg:max-w-[min(46rem,calc(100%-760px))]'
                : 'right-[calc(376px+1.25rem)] max-w-[min(46rem,calc(100%-376px-2.5rem))] sm:right-[calc(376px+1.75rem)]'
              : 'right-3 max-w-[min(46rem,calc(100%-1.5rem))] sm:right-5'
          }`}
        >
          <span className="font-bold tracking-widest text-[var(--ff-pink)] uppercase">PERF MON</span>
          <span className="font-bold text-[var(--ff-mint)]">
            {fps} FPS (MIN {snap?.minFps ?? fps})
          </span>
          <span className="text-[var(--ff-muted)]">
            FRAME: <strong className="text-[var(--ff-cream)]">{snap?.frameTimeMs ?? 16.7}ms</strong> (P95{' '}
            {snap?.p95FrameMs ?? 16.7})
          </span>
          <span className="text-[var(--ff-pink)]">
            JS: <strong className="text-[var(--ff-cream)]">{snap?.renderTimeMs ?? 1.2}ms</strong>{' '}
            [BG {snap?.bgRenderMs ?? 0} / SL {snap?.roadSlicesMs ?? 0} / PR {snap?.roadPropsMs ?? 0} / CAR{' '}
            {snap?.carOverlayMs ?? 0}]
          </span>
          <span className="text-[var(--ff-gold)]">
            GAP: <strong className="text-[var(--ff-cream)]">{snap?.compositorGapMs ?? 0}ms</strong>
          </span>
          <span className="text-[var(--ff-pink)]">
            DROPS: <strong className="text-[var(--ff-cream)]">{snap?.droppedFrames ?? 0}</strong>
          </span>
          <span className="text-[var(--ff-mint)]">
            PHYS: <strong className="text-[var(--ff-cream)]">{snap?.simTimeMs ?? 0.3}ms</strong> (x
            {snap?.fixedStepsLastFrame ?? 1})
          </span>
          <span className="text-[var(--ff-muted)]">
            SEGS: <strong className="text-[var(--ff-cream)]">{snap?.drawnSegments ?? 0}</strong>
          </span>
          <span className="text-[var(--ff-gold)]">
            PROPS: <strong className="text-[var(--ff-cream)]">{snap?.drawnProps ?? 0}</strong>
          </span>
          <span className="text-[var(--ff-muted)]">
            TRUCKS: <strong className="text-[var(--ff-cream)]">{snap?.drawnTrucks ?? 0}</strong>
          </span>
          <span className="text-[var(--ff-pink)]">
            PARTS: <strong className="text-[var(--ff-cream)]">{snap?.activeParticles ?? 0}</strong>
          </span>
          {snap?.memoryMb !== null && snap?.memoryMb !== undefined && (
            <span className="text-[var(--ff-mint)]">
              HEAP: <strong className="text-[var(--ff-cream)]">{snap.memoryMb}MB</strong>
            </span>
          )}
        </div>
      )}

      {/* BOTTOM BAR: Left Tofu Cup Strip + Right JDM VFD Digidash */}
      <div className="relative z-1 flex items-end justify-between gap-4">
        {/* Bottom-Left: Offset above the 120x80 canvas Melon Soda cup inset */}
        <div
          className={`flex flex-col gap-1.5 [contain:layout_style_paint] [transform:translateZ(0)] ${
            tofuMode ? 'mb-24 sm:mb-26' : ''
          }`}
        >
          {tofuMode && (
            <div className="ff-shadow-ink flex items-center gap-2.5 rounded-[2px] border-2 border-[rgba(46,232,196,0.55)] bg-[#12172E]/92 px-3 py-1.5 text-[10px] tracking-wider uppercase">
              <span className="font-black text-[var(--ff-mint)]">TOFU ×2</span>
              <span className="text-[var(--ff-muted)]">{SODA_SKIN_LABELS[sodaSkin]}</span>
              <div className="flex items-center gap-1.5">
                <div className="h-1.5 w-14 overflow-hidden rounded-[2px] bg-[var(--ff-ink)]">
                  <div
                    className={`h-full w-full origin-left ${
                      sodaDanger >= 0.9
                        ? 'bg-[var(--ff-pink)]'
                        : sodaDanger >= 0.65
                          ? 'bg-[var(--ff-gold)]'
                          : 'bg-[var(--ff-mint)]'
                    }`}
                    style={{ transform: `scaleX(${sodaDangerPct / 100})` }}
                  />
                </div>
              </div>
              <span className="ff-mono font-bold text-[var(--ff-gold)]">
                {sodaSpills} {sodaSpills === 1 ? 'SPILL' : 'SPILLS'}
              </span>
            </div>
          )}
        </div>

        {/* Bottom-Right: Harmonized Future Funk VFD Digidash */}
        {!hideVfd && (
          <div className="[contain:layout_style_paint] [transform:translateZ(0)]">
            <VfdDigidash
              speedKmh={speedKmh}
              speedRatio={speedRatio}
              gear={gear}
              rpm={rpm}
              groove={groove}
              grooveTier={grooveTier}
              isLugging={isLugging}
              autoShift={autoShift}
              onToggleAutoShift={handleToggleAutoShift}
            />
          </div>
        )}
      </div>

      {/* Pause Menu Hub */}
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
        cleanHud={effectiveCleanHud}
        showPerfHud={showPerfHud}
        autoShift={autoShift}
        autopilotActive={snap?.autopilotActive ?? false}
        crtEnabled={crtEnabled}
        onResume={() => onTogglePause?.()}
        onRestartRun={onRestartRun}
        onOpenTrackLoader={onOpenTrackLoader}
        onOpenInspector={onOpenInspector}
        onToggleDebug={onToggleDebug}
        onToggleTofuMode={() => onToggleTofuMode?.()}
        onCycleSodaSkin={() => onCycleSodaSkin?.()}
        onToggleCleanHud={handleToggleCleanHud}
        onTogglePerfHud={() => setShowPerfHud((prev) => !prev)}
        onToggleAutoShift={() => onToggleAutoShift?.()}
        onToggleAutopilot={() => onToggleAutopilot?.()}
        onToggleCrt={onToggleCrt}
        onReturnToMainMenu={onReturnToMainMenu}
      />
    </div>
  );
}
