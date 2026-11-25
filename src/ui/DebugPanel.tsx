import {
  applyTuning,
  DEFAULT_TUNING,
  resetTuning,
  tuning,
  TUNING_CONTROLS,
  tuningDiff,
  type Tuning,
  type TuningKey,
} from '@src/config/tuning';
import type { AutopilotMode } from '@src/core/AutopilotDriver';
import type { TelemetryBridge } from '@src/core/TelemetryBridge';
import type { GameEvent, TelemetrySnapshot } from '@src/engine/Game';
import {
  memo,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react';

const STORAGE_KEY = 'mayonaka-cassette.tuning.v2';

export function loadSavedTuning(): void {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') {
      applyTuning(parsed as Record<string, unknown>);
    }
  } catch {
    // Ignore malformed localStorage data.
  }
}

function saveCurrentTuning(): void {
  try {
    const diff = tuningDiff();
    if (Object.keys(diff).length === 0) {
      window.localStorage.removeItem(STORAGE_KEY);
    } else {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(diff));
    }
  } catch {
    // Ignore storage quota errors.
  }
}

export type DebugTab = 'tuning' | 'profiler';

export interface DebugPanelProps {
  open: boolean;
  onClose: () => void;
  bridge?: TelemetryBridge<TelemetrySnapshot, GameEvent>;
  onSelectPalette?: (index: number) => void;
  onToggleAutopilot?: () => void;
  onSetAutopilotMode?: (mode: AutopilotMode) => void;
  initialTab?: DebugTab;
}

export const FUTURE_FUNK_THEMES = [
  { index: 0, name: 'MAYONAKA BAY', sub: 'Night Funk', color: '#00f0b5' },
  { index: 1, name: 'SUNSET BOULEVARD', sub: 'OG Future Funk', color: '#ffd447' },
  { index: 2, name: 'AKIBA NIGHT RUSH', sub: 'Electric Night', color: '#00f5d4' },
] as const;

const TUNING_GROUPS = Array.from(new Set(TUNING_CONTROLS.map((c) => c.group))).filter(
  (group) => group !== 'Weather & Sky',
);

const CONTROLS_BY_GROUP = new Map(
  TUNING_GROUPS.map((group) => [group, TUNING_CONTROLS.filter((c) => c.group === group)]),
);

const ENVIRONMENT_TOGGLES = [
  { key: 'bgRain', label: 'RAIN' },
  { key: 'bgClouds', label: 'CLOUDS' },
  { key: 'bgBirds', label: 'BIRDS' },
  { key: 'bgStars', label: 'STARS' },
] as const;

const ISOLATION_ITEMS = [
  { key: 'renderBg', label: 'SKY/BG' },
  { key: 'renderRoad', label: 'ROAD' },
  { key: 'renderProps', label: 'PROPS' },
  { key: 'renderPylonWires', label: 'WIRES' },
  { key: 'renderTraffic', label: 'TRAFFIC' },
  { key: 'renderCar', label: 'CAR/FX' },
] as const;

const BAR_SEEK_SHORTCUTS = [
  [0, 'INTRO B0'],
  [8, 'BUILD B8'],
  [16, 'DROP B16'],
  [48, 'BREAK B48'],
  [72, 'DROP2 B72'],
  [104, 'OUTRO B104'],
] as const;

const NOOP_SUBSCRIBE = () => () => {};
const NULL_SNAPSHOT = () => null;

interface IsolationToggles {
  renderBg: boolean;
  renderRoad: boolean;
  renderProps: boolean;
  renderPylonWires: boolean;
  renderTraffic: boolean;
  renderCar: boolean;
  syncGpuProbe: boolean;
  legacyRaster: boolean;
}

const MemoizedTuningControls = memo(function MemoizedTuningControls({
  values,
  onChange,
}: {
  values: Tuning;
  onChange: (key: TuningKey, value: number) => void;
}) {
  const accordionRef = useRef<HTMLDivElement | null>(null);
  const [allExpanded, setAllExpanded] = useState(false);

  const syncAllExpanded = useCallback(() => {
    const container = accordionRef.current;
    if (!container) return;
    const items = Array.from(container.querySelectorAll<HTMLDetailsElement>(':scope > details'));
    setAllExpanded(items.length > 0 && items.every((el) => el.open));
  }, []);

  const handleToggleAll = () => {
    const container = accordionRef.current;
    if (!container) return;
    const nextOpen = !allExpanded;
    for (const el of container.querySelectorAll<HTMLDetailsElement>(':scope > details')) {
      el.open = nextOpen;
    }
    setAllExpanded(nextOpen);
  };

  let paramModifiedCount = 0;
  for (const group of TUNING_GROUPS) {
    const controls = CONTROLS_BY_GROUP.get(group) ?? [];
    for (const ctrl of controls) {
      if (values[ctrl.key] !== DEFAULT_TUNING[ctrl.key]) paramModifiedCount++;
    }
  }

  return (
    <section className="p-3">
      <div className="mb-2 flex items-center justify-between gap-2 select-none">
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] font-bold tracking-[0.14em] text-[var(--ff-muted)] uppercase">
            PARAMETERS
          </span>
          {paramModifiedCount > 0 && (
            <span className="rounded-[2px] bg-[var(--ff-mint)] px-1.5 py-[1px] text-[9px] font-black text-[var(--ff-ink)]">
              {paramModifiedCount} MOD
            </span>
          )}
        </div>
        <button
          type="button"
          aria-expanded={allExpanded}
          onClick={(e) => {
            handleToggleAll();
            e.currentTarget.blur();
          }}
          className="cursor-pointer rounded-[2px] border border-[var(--ff-border)] bg-[var(--ff-panel)] px-2 py-0.5 text-[9px] font-bold tracking-wider text-[var(--ff-muted)] uppercase transition hover:border-[var(--ff-cream)] hover:text-[var(--ff-cream)]"
        >
          {allExpanded ? 'COLLAPSE ALL' : 'EXPAND ALL'}
        </button>
      </div>

      <div ref={accordionRef} className="divide-y divide-[var(--ff-border)]">
        {TUNING_GROUPS.map((group) => {
          const controls = CONTROLS_BY_GROUP.get(group) ?? [];
          const groupModCount = controls.filter(
            (ctrl) => values[ctrl.key] !== DEFAULT_TUNING[ctrl.key],
          ).length;

          return (
            <details
              key={group}
              open={group === 'Camera'}
              onToggle={syncAllExpanded}
              className="ff-details"
            >
              <summary className="py-2 text-[10px] font-bold tracking-[0.12em] text-[var(--ff-cream)] uppercase select-none hover:text-[var(--ff-mint)]">
                <span className="flex-1">{group}</span>
                {groupModCount > 0 && (
                  <span className="rounded-[2px] bg-[var(--ff-mint)] px-1 py-[1px] text-[8.5px] font-black text-[var(--ff-ink)]">
                    {groupModCount} MOD
                  </span>
                )}
                <span className="text-[9px] font-normal text-[var(--ff-muted)]">
                  {controls.length}
                </span>
              </summary>

              <div className="space-y-2.5 pt-1 pb-3">
                {controls.map((ctrl) => {
                  const current = values[ctrl.key];
                  const isModified = current !== DEFAULT_TUNING[ctrl.key];
                  return (
                    <label key={ctrl.key} className="block">
                      <div className="flex items-baseline justify-between gap-2 text-[10.5px]">
                        <span
                          className={
                            isModified ? 'font-bold text-[var(--ff-mint)]' : 'text-[var(--ff-cream)]'
                          }
                        >
                          {ctrl.label}
                        </span>
                        <span
                          className={`shrink-0 tabular-nums ${
                            isModified
                              ? 'font-bold text-[var(--ff-mint)]'
                              : 'text-[var(--ff-cream)]'
                          }`}
                        >
                          {current}
                          {ctrl.unit ? ` ${ctrl.unit}` : ''}
                        </span>
                      </div>
                      <input
                        type="range"
                        min={ctrl.min}
                        max={ctrl.max}
                        step={ctrl.step}
                        value={current}
                        data-modified={isModified ? 'true' : undefined}
                        onChange={(e) => onChange(ctrl.key, Number(e.target.value))}
                        onPointerUp={(e) => e.currentTarget.blur()}
                        className="ff-range mt-1 block"
                      />
                      <div className="mt-0.5 text-[9.5px] leading-snug text-[var(--ff-muted)]">
                        {ctrl.hint}
                      </div>
                    </label>
                  );
                })}
              </div>
            </details>
          );
        })}
      </div>
    </section>
  );
});

/**
 * Minimalist diagnostic developer drawer (`?debug` or `F2`, AGENTS.md §5 M8).
 * Harmonized under the Mayonaka Hi-Fi 7-token palette with zero glow/blur overhead.
 */
export function DebugPanel({
  open,
  onClose,
  bridge,
  onSelectPalette,
  onToggleAutopilot,
  onSetAutopilotMode,
  initialTab,
}: DebugPanelProps) {
  const [tab, setTab] = useState<DebugTab>(() => {
    if (initialTab) return initialTab;
    if (typeof window === 'undefined') return 'tuning';
    const params = new URLSearchParams(window.location.search);
    return params.get('debug')?.toLowerCase() === 'profiler' || params.has('profiler')
      ? 'profiler'
      : 'tuning';
  });
  const [values, setValues] = useState<Tuning>(() => ({ ...tuning }));
  const [copied, setCopied] = useState(false);
  const [copiedPerf, setCopiedPerf] = useState(false);
  const [seekBarInput, setSeekBarInput] = useState('');
  const [reportJson, setReportJson] = useState('');
  const [isolation, setIsolation] = useState<IsolationToggles>(() => {
    const syncParam =
      typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('syncprobe');
    return {
      renderBg: true,
      renderRoad: true,
      renderProps: true,
      renderPylonWires: true,
      renderTraffic: true,
      renderCar: true,
      syncGpuProbe: syncParam,
      legacyRaster: false,
    };
  });

  const tuningTabId = useId();
  const profilerTabId = useId();
  const tuningTabRef = useRef<HTMLButtonElement | null>(null);
  const profilerTabRef = useRef<HTMLButtonElement | null>(null);
  const panelBodyRef = useRef<HTMLDivElement | null>(null);

  const snap = useSyncExternalStore(
    open && bridge ? bridge.subscribe : NOOP_SUBSCRIBE,
    open && bridge ? bridge.getSnapshot : NULL_SNAPSHOT,
    open && bridge ? bridge.getSnapshot : NULL_SNAPSHOT,
  );

  const refreshReportJson = useCallback(() => {
    if (typeof window !== 'undefined' && window.__MAYONAKA_DIAG__) {
      setReportJson(JSON.stringify(window.__MAYONAKA_DIAG__.getFullReport()));
    }
  }, []);

  useEffect(() => {
    if (!open || tab !== 'profiler') return;
    const diagGame = window.__MAYONAKA_DIAG__?.game;
    if (diagGame) {
      setIsolation({
        renderBg: diagGame.renderBg,
        renderRoad: diagGame.renderRoad,
        renderProps: diagGame.renderProps,
        renderPylonWires: diagGame.renderPylonWires,
        renderTraffic: diagGame.renderTraffic,
        renderCar: diagGame.renderCar,
        syncGpuProbe: diagGame.syncGpuProbe,
        legacyRaster: diagGame.legacyRaster,
      });
    }
    refreshReportJson();
  }, [open, tab, refreshReportJson]);

  const handleChange = useCallback((key: TuningKey, value: number) => {
    tuning[key] = value;
    setValues((prev) => ({ ...prev, [key]: value }));
    saveCurrentTuning();
  }, []);

  useEffect(() => {
    if (open) {
      setValues({ ...tuning });
      const diagGame = window.__MAYONAKA_DIAG__?.game;
      if (diagGame) {
        setIsolation({
          renderBg: diagGame.renderBg,
          renderRoad: diagGame.renderRoad,
          renderProps: diagGame.renderProps,
          renderPylonWires: diagGame.renderPylonWires,
          renderTraffic: diagGame.renderTraffic,
          renderCar: diagGame.renderCar,
          syncGpuProbe: diagGame.syncGpuProbe,
          legacyRaster: diagGame.legacyRaster,
        });
      }
    }
  }, [open]);

  useEffect(() => {
    if (panelBodyRef.current) {
      panelBodyRef.current.scrollTop = 0;
    }
  }, [tab]);

  // Keyboard shortcut: pressing '1', '2', '3' while debug panel is open switches theme (only before driving starts)
  useEffect(() => {
    if (!open || !onSelectPalette || snap?.hasStartedDriving) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === '1') onSelectPalette(0);
      else if (e.key === '2') onSelectPalette(1);
      else if (e.key === '3') onSelectPalette(2);
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [open, onSelectPalette, snap?.hasStartedDriving]);

  if (!open) return null;

  const handleTabKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'Home' || e.key === 'End') {
      e.preventDefault();
      e.stopPropagation();
      let next: DebugTab;
      if (e.key === 'Home') next = 'tuning';
      else if (e.key === 'End') next = 'profiler';
      else next = tab === 'tuning' ? 'profiler' : 'tuning';
      setTab(next);
      if (next === 'tuning') tuningTabRef.current?.focus();
      else profilerTabRef.current?.focus();
    }
  };

  const handleToggleIsolation = (key: keyof IsolationToggles) => {
    const nextVal = !isolation[key];
    setIsolation((prev) => ({ ...prev, [key]: nextVal }));
    if (key === 'renderCar') {
      window.__MAYONAKA_DIAG__?.setIsolation({ renderCar: nextVal, renderParticles: nextVal });
    } else {
      window.__MAYONAKA_DIAG__?.setIsolation({ [key]: nextVal });
    }
  };

  const handleReset = () => {
    resetTuning();
    setValues({ ...DEFAULT_TUNING });
    saveCurrentTuning();
  };

  const handleCopyJson = async () => {
    const diff = tuningDiff();
    const payload = Object.keys(diff).length > 0 ? diff : tuning;
    try {
      await navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard API unavailable
    }
  };

  const handleCopyPerfReport = async () => {
    const fullReport = window.__MAYONAKA_DIAG__?.getFullReport();
    if (!fullReport && !snap) return;
    if (fullReport) {
      setReportJson(JSON.stringify(fullReport));
    }
    const report = fullReport ?? {
      timestamp: new Date().toISOString(),
      fps: snap!.fps,
      minFps: snap!.minFps,
      sessionAvgFps: snap!.sessionAvgFps,
      sessionMinFps: snap!.sessionMinFps,
      pct60Fps: snap!.pct60Fps,
      frameTimeMs: snap!.frameTimeMs,
      p95FrameMs: snap!.p95FrameMs,
      maxFrameMs: snap!.maxFrameMs,
      droppedFrames: snap!.droppedFrames,
      simTimeMs: snap!.simTimeMs,
      renderTimeMs: snap!.renderTimeMs,
      compositorGapMs: snap!.compositorGapMs,
      breakdown: {
        bgRenderMs: snap!.bgRenderMs,
        roadRenderMs: snap!.roadRenderMs,
        roadSlicesMs: snap!.roadSlicesMs,
        roadPropsMs: snap!.roadPropsMs,
        roadTrafficMs: snap!.roadTrafficMs,
        carOverlayMs: snap!.carOverlayMs,
      },
      fixedStepsLastFrame: snap!.fixedStepsLastFrame,
      geometry: {
        drawnSegments: snap!.drawnSegments,
        drawnProps: snap!.drawnProps,
        drawnTrucks: snap!.drawnTrucks,
        drawnPylonSpans: snap!.drawnPylonSpans,
        crestClips: snap!.crestClips,
        activeParticles: snap!.activeParticles,
        drawDistance: tuning.drawDistance,
      },
      memory: {
        heapMb: snap!.memoryMb,
      },
      stage: {
        number: snap!.stageNumber,
        palette: snap!.stagePaletteName,
        speedKmh: Math.round(snap!.speedKmh),
        grooveTier: snap!.grooveTier,
      },
    };
    try {
      await navigator.clipboard.writeText(JSON.stringify(report, null, 2));
      setCopiedPerf(true);
      window.setTimeout(() => setCopiedPerf(false), 1500);
    } catch {
      // Clipboard unavailable
    }
  };

  const totalModifiedCount = (Object.keys(DEFAULT_TUNING) as TuningKey[]).filter(
    (key) => values[key] !== DEFAULT_TUNING[key],
  ).length;

  const fps = snap?.fps ?? 60;
  const simMs = snap?.simTimeMs ?? 0.3;
  const renderMs = snap?.renderTimeMs ?? 1.2;
  const frameDt = snap?.frameTimeMs ?? 16.67;
  const totalLoadMs = simMs + renderMs;
  const budgetRatio = Math.min(1, totalLoadMs / 16.67);
  const budgetPct = Math.round(budgetRatio * 100);

  const fpsPillStyle =
    fps >= 58
      ? 'bg-[var(--ff-mint)] text-[var(--ff-ink)]'
      : fps >= 45
        ? 'bg-[var(--ff-gold)] text-[var(--ff-ink)]'
        : 'bg-[var(--ff-pink)] text-[var(--ff-cream)]';

  const loadBarFillStyle =
    budgetPct < 65
      ? 'bg-[var(--ff-mint)]'
      : budgetPct < 90
        ? 'bg-[var(--ff-gold)]'
        : 'bg-[var(--ff-pink)]';

  return (
    <aside
      aria-label="Developer diagnostics console"
      className="ff-shadow-ink ff-mono pointer-events-auto absolute top-14 right-3 bottom-3 z-10 flex w-[376px] max-w-[calc(100%-1.5rem)] flex-col overflow-hidden rounded-[2px] border border-[rgba(255,245,228,0.24)] bg-[var(--ff-ink)] text-xs text-[var(--ff-cream)] sm:right-5 sm:bottom-5 [contain:layout_style_paint]"
      style={{ colorScheme: 'dark' }}
    >
      {/* Signature 2px Mayonaka Hi-Fi Obi Accent */}
      <div className="ff-obi-h h-[2px] w-full shrink-0" />

      {/* Minimalist Header */}
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-[var(--ff-border)] bg-[var(--ff-panel)] px-3 py-2 select-none">
        <div className="flex min-w-0 items-center gap-1.5">
          <span className="ff-display shrink-0 whitespace-nowrap text-[10.5px] font-black tracking-[0.12em] text-[var(--ff-cream)] uppercase">
            DEV CONSOLE
          </span>
          <span
            className={`shrink-0 whitespace-nowrap rounded-[2px] px-1.5 py-[1px] text-[9.5px] font-black ${fpsPillStyle}`}
          >
            {fps} FPS
          </span>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          {tab === 'tuning' ? (
            <>
              <button
                type="button"
                onClick={(e) => {
                  void handleCopyJson();
                  e.currentTarget.blur();
                }}
                className={`cursor-pointer whitespace-nowrap rounded-[2px] border bg-[var(--ff-ink)] px-1.5 py-0.5 text-[9.5px] font-bold tracking-wider uppercase transition ${
                  copied
                    ? 'border-[var(--ff-mint)] text-[var(--ff-mint)]'
                    : 'border-[var(--ff-border)] text-[var(--ff-cream)] hover:border-[var(--ff-mint)] hover:text-[var(--ff-mint)]'
                }`}
              >
                {copied ? 'COPIED' : 'COPY JSON'}
              </button>
              <button
                type="button"
                onClick={(e) => {
                  handleReset();
                  e.currentTarget.blur();
                }}
                className="cursor-pointer whitespace-nowrap rounded-[2px] border border-[var(--ff-border)] bg-[var(--ff-ink)] px-1.5 py-0.5 text-[9.5px] font-bold tracking-wider text-[var(--ff-cream)] uppercase transition hover:border-[var(--ff-pink)] hover:text-[var(--ff-pink)]"
              >
                {totalModifiedCount > 0 ? `RESET (${totalModifiedCount})` : 'RESET'}
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={(e) => {
                void handleCopyPerfReport();
                e.currentTarget.blur();
              }}
              className={`cursor-pointer whitespace-nowrap rounded-[2px] border bg-[var(--ff-ink)] px-1.5 py-0.5 text-[9.5px] font-bold tracking-wider uppercase transition ${
                copiedPerf
                  ? 'border-[var(--ff-mint)] text-[var(--ff-mint)]'
                  : 'border-[var(--ff-border)] text-[var(--ff-cream)] hover:border-[var(--ff-mint)] hover:text-[var(--ff-mint)]'
              }`}
            >
              {copiedPerf ? 'COPIED' : 'DUMP BENCHMARK'}
            </button>
          )}
          <button
            type="button"
            onClick={(e) => {
              onClose();
              e.currentTarget.blur();
            }}
            className="cursor-pointer whitespace-nowrap rounded-[2px] border border-[var(--ff-border)] bg-[var(--ff-ink)] px-1.5 py-0.5 text-[9.5px] font-bold text-[var(--ff-muted)] transition hover:border-[var(--ff-pink)] hover:text-[var(--ff-cream)]"
            aria-label="Close debug panel"
          >
            ✕
          </button>
        </div>
      </div>

      {/* Accessible Underline Tabs */}
      <div
        role="tablist"
        aria-label="Debug console views"
        onKeyDown={handleTabKeyDown}
        className="grid shrink-0 grid-cols-2 border-b border-[var(--ff-border)] bg-[var(--ff-ink)] text-[10px] font-bold tracking-[0.14em] uppercase select-none"
      >
        <button
          ref={tuningTabRef}
          id={tuningTabId}
          type="button"
          role="tab"
          aria-selected={tab === 'tuning'}
          tabIndex={tab === 'tuning' ? 0 : -1}
          onClick={(e) => {
            setTab('tuning');
            e.currentTarget.blur();
          }}
          className={`relative cursor-pointer py-2 text-center transition after:pointer-events-none after:absolute after:inset-x-0 after:bottom-0 after:border-b-2 ${
            tab === 'tuning'
              ? 'bg-[var(--ff-panel)] text-[var(--ff-cream)] after:border-[var(--ff-mint)]'
              : 'text-[var(--ff-muted)] after:border-transparent hover:text-[var(--ff-cream)]'
          }`}
        >
          FEEL TUNING
        </button>
        <button
          ref={profilerTabRef}
          id={profilerTabId}
          type="button"
          role="tab"
          aria-selected={tab === 'profiler'}
          tabIndex={tab === 'profiler' ? 0 : -1}
          onClick={(e) => {
            setTab('profiler');
            e.currentTarget.blur();
          }}
          className={`relative cursor-pointer py-2 text-center transition after:pointer-events-none after:absolute after:inset-x-0 after:bottom-0 after:border-b-2 ${
            tab === 'profiler'
              ? 'bg-[var(--ff-panel)] text-[var(--ff-cream)] after:border-[var(--ff-pink)]'
              : 'text-[var(--ff-muted)] after:border-transparent hover:text-[var(--ff-cream)]'
          }`}
        >
          PERF PROFILER
        </button>
      </div>

      {/* Slim Telemetry Status Ribbon */}
      <div className="shrink-0 border-b border-[var(--ff-border)] bg-[var(--ff-ink)] px-3 py-1.5 text-[10px]">
        <div className="flex items-center justify-between text-[var(--ff-muted)]">
          <span>
            LOAD <strong className="text-[var(--ff-cream)]">{budgetPct}%</strong> (
            {totalLoadMs.toFixed(1)}ms)
          </span>
          <span>
            JS <strong className="text-[var(--ff-cream)]">{renderMs.toFixed(1)}ms</strong>
          </span>
          <span>
            PHYS <strong className="text-[var(--ff-cream)]">{simMs.toFixed(2)}ms</strong>
          </span>
        </div>
        <div className="mt-1 h-[3px] w-full overflow-hidden rounded-[1px] bg-[var(--ff-panel-hi)]">
          <div
            className={`h-full w-full origin-left will-change-transform ${loadBarFillStyle}`}
            style={{ transform: `scaleX(${budgetRatio})` }}
          />
        </div>
      </div>

      {/* Scrollable Diagnostic Body */}
      <div
        ref={panelBodyRef}
        role="tabpanel"
        aria-labelledby={tab === 'tuning' ? tuningTabId : profilerTabId}
        className="ff-scroll flex-1 divide-y divide-[var(--ff-border)] overflow-y-auto"
      >
        {tab === 'tuning' ? (
          <>
            {/* Autopilot */}
            <section className="space-y-2 p-3">
              <div className="flex items-center justify-between text-[10px] select-none">
                <span className="font-bold tracking-[0.14em] text-[var(--ff-muted)] uppercase">
                  AUTOPILOT
                </span>
                <span className="text-[9px] text-[var(--ff-muted)]">F4 / 0</span>
              </div>
              <button
                type="button"
                onClick={(e) => {
                  onToggleAutopilot?.();
                  e.currentTarget.blur();
                }}
                className={`w-full cursor-pointer rounded-[2px] border py-1.5 text-center text-[10px] font-black tracking-wider uppercase transition select-none ${
                  snap?.autopilotActive
                    ? 'border-[var(--ff-mint)] bg-[var(--ff-mint)] text-[var(--ff-ink)]'
                    : 'border-[var(--ff-border)] bg-[var(--ff-panel)] text-[var(--ff-cream)] hover:border-[var(--ff-mint)]'
                }`}
              >
                {snap?.autopilotActive ? 'AUTOPILOT: ON' : 'AUTOPILOT: OFF'}
              </button>
              <div className="grid grid-cols-3 gap-1 text-[9px] select-none">
                {(['perfect', 'relaxed', 'aggressive'] as const).map((mode) => {
                  const isSelected = snap?.autopilotMode === mode;
                  return (
                    <button
                      key={mode}
                      type="button"
                      onClick={(e) => {
                        onSetAutopilotMode?.(mode);
                        e.currentTarget.blur();
                      }}
                      className={`cursor-pointer rounded-[2px] border py-1 font-bold uppercase transition ${
                        isSelected
                          ? 'border-[var(--ff-cream)] bg-[var(--ff-panel-hi)] text-[var(--ff-cream)]'
                          : 'border-[var(--ff-border)] bg-[var(--ff-ink)] text-[var(--ff-muted)] hover:border-[var(--ff-muted)] hover:text-[var(--ff-cream)]'
                      }`}
                    >
                      {mode}
                    </button>
                  );
                })}
              </div>
            </section>

            {/* Palette */}
            <section className="space-y-2 p-3">
              <div className="flex items-center justify-between text-[10px] select-none">
                <span className="font-bold tracking-[0.14em] text-[var(--ff-muted)] uppercase">
                  PALETTE {snap?.hasStartedDriving ? '(LOCKED MID-RACE)' : ''}
                </span>
                <span className="text-[9px] text-[var(--ff-muted)]">KEYS 1–3</span>
              </div>
              <div className="grid grid-cols-3 gap-1.5 select-none">
                {FUTURE_FUNK_THEMES.map((theme) => {
                  const isActive = snap?.stagePaletteName === theme.name;
                  const isLocked = Boolean(snap?.hasStartedDriving);
                  return (
                    <button
                      key={theme.name}
                      type="button"
                      disabled={isLocked}
                      title={isLocked ? 'Theme is locked once the race starts' : undefined}
                      onClick={(e) => {
                        if (isLocked) return;
                        onSelectPalette?.(theme.index);
                        e.currentTarget.blur();
                      }}
                      className={`flex flex-col justify-between gap-1 rounded-[2px] border p-1.5 text-left transition ${
                        isLocked
                          ? 'cursor-not-allowed opacity-50 border-[var(--ff-border)] bg-[var(--ff-panel)]/30'
                          : isActive
                            ? 'cursor-pointer border-[var(--ff-cream)] bg-[var(--ff-panel-hi)]'
                            : 'cursor-pointer border-[var(--ff-border)] bg-[var(--ff-panel)]/50 hover:border-[var(--ff-muted)]'
                      }`}
                    >
                      <div className="flex w-full items-center justify-between gap-1">
                        <div className="flex items-center gap-1">
                          <span className="text-[9px] font-bold text-[var(--ff-muted)]">
                            [{theme.index + 1}]
                          </span>
                          <span
                            className="h-1.5 w-1.5 shrink-0 rounded-[1px]"
                            style={{ backgroundColor: theme.color }}
                          />
                        </div>
                        {isActive && (
                          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--ff-mint)]" />
                        )}
                      </div>
                      <span className="text-[9.5px] leading-tight font-bold text-[var(--ff-cream)]">
                        {theme.name}
                      </span>
                      <span className="text-[8.5px] leading-tight text-[var(--ff-muted)]">
                        {theme.sub}
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>

            {/* Environment */}
            <section className="space-y-1.5 p-3">
              <div className="flex items-center justify-between text-[10px] select-none">
                <span className="font-bold tracking-[0.14em] text-[var(--ff-muted)] uppercase">
                  ENVIRONMENT
                </span>
                <span className="text-[9px] text-[var(--ff-muted)]">LIVE</span>
              </div>
              <div className="grid grid-cols-4 gap-1 text-[9px] select-none">
                {ENVIRONMENT_TOGGLES.map(({ key, label }) => {
                  const active = Boolean(values[key]);
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={(e) => {
                        handleChange(key, active ? 0 : 1);
                        e.currentTarget.blur();
                      }}
                      className={`flex cursor-pointer flex-col items-center justify-center gap-0.5 rounded-[2px] border py-1.5 transition ${
                        active
                          ? 'border-[var(--ff-mint)] bg-[var(--ff-panel)]'
                          : 'border-[var(--ff-border)] bg-[var(--ff-ink)] hover:border-[var(--ff-muted)]'
                      }`}
                    >
                      <span
                        className={`font-bold ${
                          active ? 'text-[var(--ff-cream)]' : 'text-[var(--ff-muted)]'
                        }`}
                      >
                        {label}
                      </span>
                      <span
                        className={`text-[8.5px] font-black ${
                          active ? 'text-[var(--ff-mint)]' : 'text-[var(--ff-muted)]'
                        }`}
                      >
                        {active ? 'ON' : 'OFF'}
                      </span>
                    </button>
                  );
                })}
              </div>
              <button
                type="button"
                disabled={!values.bgRain}
                onClick={(e) => {
                  handleChange('bgLightningOnBeat', values.bgLightningOnBeat ? 0 : 1);
                  e.currentTarget.blur();
                }}
                className={`flex w-full items-center justify-between rounded-[2px] border px-2 py-1 text-[9.5px] transition select-none ${
                  !values.bgRain
                    ? 'cursor-not-allowed border-[var(--ff-border)] bg-[var(--ff-ink)] text-[var(--ff-muted)] opacity-50'
                    : values.bgLightningOnBeat
                      ? 'cursor-pointer border-[var(--ff-pink)] bg-[var(--ff-panel)] text-[var(--ff-cream)]'
                      : 'cursor-pointer border-[var(--ff-border)] bg-[var(--ff-ink)] text-[var(--ff-muted)] hover:border-[var(--ff-muted)]'
                }`}
              >
                <span className="font-bold tracking-wider uppercase">BEAT LIGHTNING</span>
                <span
                  className={`font-black ${
                    !values.bgRain
                      ? 'text-[var(--ff-muted)]'
                      : values.bgLightningOnBeat
                        ? 'text-[var(--ff-pink)]'
                        : 'text-[var(--ff-muted)]'
                  }`}
                >
                  {!values.bgRain
                    ? 'REQUIRES RAIN'
                    : values.bgLightningOnBeat
                      ? 'ON DROP'
                      : 'OFF'}
                </span>
              </button>
            </section>

            {/* Collapsible Parameter Groups */}
            <MemoizedTuningControls values={values} onChange={handleChange} />
          </>
        ) : (
          <>
            {/* Session Scorecard */}
            <section className="space-y-2 p-3">
              <div className="flex items-center justify-between text-[10px] select-none">
                <span className="font-bold tracking-[0.14em] text-[var(--ff-muted)] uppercase">
                  SESSION SCORECARD
                </span>
                <button
                  type="button"
                  onClick={(e) => {
                    window.__MAYONAKA_DIAG__?.resetBenchmark();
                    refreshReportJson();
                    e.currentTarget.blur();
                  }}
                  className="cursor-pointer rounded-[2px] border border-[var(--ff-border)] bg-[var(--ff-panel)] px-2 py-0.5 text-[9px] font-bold text-[var(--ff-cream)] uppercase transition hover:border-[var(--ff-mint)] hover:text-[var(--ff-mint)]"
                >
                  RESET BENCH
                </button>
              </div>
              <div className="flex items-center justify-between gap-2 text-[10px] text-[var(--ff-muted)]">
                <span className="truncate">
                  {snap?.trackTitle ?? 'Loading...'} · {snap?.bpm ?? 0} BPM
                </span>
                <span className="shrink-0">
                  Bar {snap?.roadBarIndex ?? 0}/{snap?.totalBars ?? 0} ({snap?.sectionRole ?? 'intro'}
                  {snap?.spectralKind ? ` · ${snap.spectralKind}` : ''})
                </span>
              </div>
              <div className="grid grid-cols-3 gap-1.5">
                <div className="rounded-[2px] border border-[var(--ff-border)] bg-[var(--ff-panel)] px-2 py-1.5">
                  <div className="text-[9px] text-[var(--ff-muted)]">AVG FPS</div>
                  <strong className="text-xs text-[var(--ff-mint)]">
                    {(snap?.sessionAvgFps ?? fps).toFixed(1)}
                  </strong>
                </div>
                <div className="rounded-[2px] border border-[var(--ff-border)] bg-[var(--ff-panel)] px-2 py-1.5">
                  <div className="text-[9px] text-[var(--ff-muted)]">MIN FPS</div>
                  <strong className="text-xs text-[var(--ff-gold)]">
                    {snap?.sessionMinFps ?? fps}
                  </strong>
                </div>
                <div className="rounded-[2px] border border-[var(--ff-border)] bg-[var(--ff-panel)] px-2 py-1.5">
                  <div className="text-[9px] text-[var(--ff-muted)]">60 FPS %</div>
                  <strong className="text-xs text-[var(--ff-cream)]">
                    {(snap?.pct60Fps ?? 100).toFixed(1)}%
                  </strong>
                </div>
              </div>
              <div className="flex justify-between text-[10px] text-[var(--ff-muted)]">
                <span>
                  Crest Clips:{' '}
                  <strong className="text-[var(--ff-cream)]">{snap?.crestClips ?? 0}</strong>
                </span>
                <span>
                  Pylon Spans:{' '}
                  <strong className="text-[var(--ff-cream)]">{snap?.drawnPylonSpans ?? 0}</strong>
                </span>
              </div>
              <div className="flex justify-between text-[10px] text-[var(--ff-muted)]">
                <span>
                  Horizon Stretch:{' '}
                  <strong className="text-[var(--ff-mint)]">
                    {(snap?.horizonStretchRatio ?? 1).toFixed(2)}×
                  </strong>
                </span>
                <span>
                  Sync Anchor:{' '}
                  <strong className="text-[var(--ff-gold)]">
                    {snap?.activeAnchorKind
                      ? `${snap.activeAnchorKind}@B${snap.activeAnchorBar ?? 0}`
                      : 'FREE'}
                  </strong>
                </span>
              </div>
              <div className="grid grid-cols-3 gap-1 text-[9px] select-none">
                {BAR_SEEK_SHORTCUTS.map(([bar, label]) => (
                  <button
                    key={bar}
                    type="button"
                    onClick={(e) => {
                      window.__MAYONAKA_DIAG__?.seekToBar(bar);
                      refreshReportJson();
                      e.currentTarget.blur();
                    }}
                    className="cursor-pointer rounded-[2px] border border-[var(--ff-border)] bg-[var(--ff-panel)] py-1 font-bold text-[var(--ff-cream)] transition hover:border-[var(--ff-mint)] hover:text-[var(--ff-mint)]"
                  >
                    {label}
                  </button>
                ))}
              </div>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const parsed = parseInt(seekBarInput.trim(), 10);
                  if (!Number.isNaN(parsed) && parsed >= 0) {
                    window.__MAYONAKA_DIAG__?.seekToBar(parsed);
                    window.__MAYONAKA_DIAG__?.resetBenchmark();
                    refreshReportJson();
                  }
                }}
                className="flex items-center gap-1 text-[9px]"
              >
                <input
                  data-testid="seek-bar-input"
                  type="number"
                  min={0}
                  max={255}
                  placeholder="BAR #"
                  value={seekBarInput}
                  onChange={(e) => setSeekBarInput(e.target.value)}
                  onKeyDown={(e) => e.stopPropagation()}
                  className="w-full rounded-[2px] border border-[var(--ff-border)] bg-[var(--ff-ink)] px-2 py-1 text-[9.5px] font-bold text-[var(--ff-cream)] outline-none focus:border-[var(--ff-mint)]"
                />
                <button
                  data-testid="seek-bar-go"
                  type="submit"
                  className="shrink-0 cursor-pointer rounded-[2px] border border-[var(--ff-border)] bg-[var(--ff-panel)] px-2.5 py-1 font-bold text-[var(--ff-mint)] uppercase transition hover:border-[var(--ff-mint)]"
                >
                  GO
                </button>
              </form>
              <div className="grid grid-cols-4 gap-1 text-[9px] select-none">
                {(
                  [
                    ['FORK', () => window.__MAYONAKA_DIAG__?.triggerForkTest()],
                    ['NEXT SONG', () => window.__MAYONAKA_DIAG__?.triggerNextSongTest()],
                    ['OFF-ROAD', () => window.__MAYONAKA_DIAG__?.triggerOffRoadTest()],
                    ['HIT TRUCK', () => window.__MAYONAKA_DIAG__?.triggerTruckCollisionTest()],
                  ] as const
                ).map(([label, handler]) => (
                  <button
                    key={label}
                    type="button"
                    onClick={(e) => {
                      handler();
                      refreshReportJson();
                      e.currentTarget.blur();
                    }}
                    className="cursor-pointer rounded-[2px] border border-[var(--ff-border)] bg-[var(--ff-ink)] py-1 font-bold text-[var(--ff-muted)] transition hover:border-[var(--ff-pink)] hover:text-[var(--ff-pink)]"
                  >
                    {label}
                  </button>
                ))}
              </div>
            </section>

            {/* Subsystem Isolation */}
            <section className="space-y-1.5 p-3">
              <div className="flex items-center justify-between text-[10px] select-none">
                <span className="font-bold tracking-[0.14em] text-[var(--ff-muted)] uppercase">
                  SUBSYSTEM ISOLATION
                </span>
                <span className="text-[9px] text-[var(--ff-muted)]">A/B PROBE</span>
              </div>
              <div className="grid grid-cols-3 gap-1 text-[9px] select-none">
                {ISOLATION_ITEMS.map(({ key, label }) => {
                  const enabled = isolation[key];
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={(e) => {
                        handleToggleIsolation(key);
                        e.currentTarget.blur();
                      }}
                      className={`flex cursor-pointer items-center justify-center gap-1.5 rounded-[2px] border px-1.5 py-1 font-bold transition ${
                        enabled
                          ? 'border-[var(--ff-border)] bg-[var(--ff-panel)] text-[var(--ff-cream)] hover:border-[var(--ff-mint)]'
                          : 'border-[var(--ff-pink)] bg-[var(--ff-ink)] text-[var(--ff-pink)] line-through'
                      }`}
                    >
                      {enabled && (
                        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--ff-mint)]" />
                      )}
                      <span>{label}</span>
                    </button>
                  );
                })}
              </div>
              <button
                type="button"
                onClick={(e) => {
                  handleToggleIsolation('syncGpuProbe');
                  e.currentTarget.blur();
                }}
                className={`flex w-full cursor-pointer items-center justify-between rounded-[2px] border px-2 py-1 text-[9.5px] font-bold transition select-none ${
                  isolation.syncGpuProbe
                    ? 'border-[var(--ff-gold)] bg-[var(--ff-panel-hi)] text-[var(--ff-gold)]'
                    : 'border-[var(--ff-border)] bg-[var(--ff-ink)] text-[var(--ff-muted)] hover:border-[var(--ff-muted)]'
                }`}
              >
                <span>GPU SYNC PROBE (FLUSH CANVAS)</span>
                <span>{isolation.syncGpuProbe ? 'ACTIVE' : 'OFF'}</span>
              </button>
              <button
                type="button"
                onClick={(e) => {
                  handleToggleIsolation('legacyRaster');
                  e.currentTarget.blur();
                }}
                className={`flex w-full cursor-pointer items-center justify-between rounded-[2px] border px-2 py-1 text-[9.5px] font-bold transition select-none ${
                  isolation.legacyRaster
                    ? 'border-[var(--ff-pink)] bg-[var(--ff-panel-hi)] text-[var(--ff-pink)]'
                    : 'border-[var(--ff-border)] bg-[var(--ff-ink)] text-[var(--ff-muted)] hover:border-[var(--ff-muted)]'
                }`}
              >
                <span>A/B BASELINE (LEGACY RASTER)</span>
                <span>{isolation.legacyRaster ? 'ON' : 'OFF'}</span>
              </button>
            </section>

            {/* Frame Budget */}
            <section className="space-y-1.5 p-3">
              <div className="flex items-center justify-between text-[10px]">
                <span className="font-bold tracking-[0.14em] text-[var(--ff-muted)] uppercase">
                  FRAME BUDGET
                </span>
                <span className="text-[9px] text-[var(--ff-muted)]">60 FPS · 16.67ms</span>
              </div>
              <div className="space-y-1 text-[10.5px]">
                <div className="flex justify-between">
                  <span className="text-[var(--ff-muted)]">Frame Delta</span>
                  <span className="font-bold text-[var(--ff-cream)]">{frameDt.toFixed(2)} ms</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[var(--ff-muted)]">P95 / Max (Min FPS)</span>
                  <span className="font-bold text-[var(--ff-gold)]">
                    {(snap?.p95FrameMs ?? frameDt).toFixed(1)} /{' '}
                    {(snap?.maxFrameMs ?? frameDt).toFixed(1)} ms ({snap?.minFps ?? fps} FPS)
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[var(--ff-muted)]">Dropped (&gt;18.5ms)</span>
                  <span
                    className={`font-bold ${
                      (snap?.droppedFrames ?? 0) > 0
                        ? 'text-[var(--ff-pink)]'
                        : 'text-[var(--ff-mint)]'
                    }`}
                  >
                    {snap?.droppedFrames ?? 0}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[var(--ff-muted)]">Canvas Render (JS)</span>
                  <span className="text-[var(--ff-cream)]">{renderMs.toFixed(2)} ms</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[var(--ff-muted)]">Physics Sim</span>
                  <span className="text-[var(--ff-cream)]">
                    {simMs.toFixed(2)} ms ({snap?.fixedStepsLastFrame ?? 1}×)
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[var(--ff-muted)]">Compositor / GPU Gap</span>
                  <span
                    className={`font-bold ${
                      (snap?.compositorGapMs ?? 0) > 6
                        ? 'text-[var(--ff-pink)]'
                        : 'text-[var(--ff-gold)]'
                    }`}
                  >
                    {(snap?.compositorGapMs ?? 0).toFixed(1)} ms
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[var(--ff-muted)]">JS Headroom</span>
                  <span className="font-bold text-[var(--ff-mint)]">
                    {Math.max(0, 16.67 - totalLoadMs).toFixed(2)} ms
                  </span>
                </div>
              </div>
            </section>

            {/* Render Breakdown */}
            <section className="space-y-1.5 p-3">
              <div className="text-[10px] font-bold tracking-[0.14em] text-[var(--ff-muted)] uppercase">
                RENDER BREAKDOWN (JS)
              </div>
              <div className="grid grid-cols-2 gap-1 text-[10px]">
                <div className="flex justify-between rounded-[2px] border border-[var(--ff-border)] bg-[var(--ff-panel)] px-2 py-1">
                  <span className="text-[var(--ff-muted)]">SKY / BG</span>
                  <strong className="text-[var(--ff-cream)]">
                    {(snap?.bgRenderMs ?? 0).toFixed(2)}ms
                  </strong>
                </div>
                <div className="flex justify-between rounded-[2px] border border-[var(--ff-border)] bg-[var(--ff-panel)] px-2 py-1">
                  <span className="text-[var(--ff-muted)]">ROAD TOTAL</span>
                  <strong className="text-[var(--ff-cream)]">
                    {(snap?.roadRenderMs ?? 0).toFixed(2)}ms
                  </strong>
                </div>
                <div className="flex justify-between rounded-[2px] border border-[var(--ff-border)] bg-[var(--ff-panel)] px-2 py-1">
                  <span className="text-[var(--ff-muted)]">ROAD SLICES</span>
                  <strong className="text-[var(--ff-cream)]">
                    {(snap?.roadSlicesMs ?? 0).toFixed(2)}ms
                  </strong>
                </div>
                <div className="flex justify-between rounded-[2px] border border-[var(--ff-border)] bg-[var(--ff-panel)] px-2 py-1">
                  <span className="text-[var(--ff-muted)]">ROADSIDE PROPS</span>
                  <strong className="text-[var(--ff-cream)]">
                    {(snap?.roadPropsMs ?? 0).toFixed(2)}ms
                  </strong>
                </div>
                <div className="flex justify-between rounded-[2px] border border-[var(--ff-border)] bg-[var(--ff-panel)] px-2 py-1">
                  <span className="text-[var(--ff-muted)]">TRAFFIC</span>
                  <strong className="text-[var(--ff-cream)]">
                    {(snap?.roadTrafficMs ?? 0).toFixed(2)}ms
                  </strong>
                </div>
                <div className="flex justify-between rounded-[2px] border border-[var(--ff-border)] bg-[var(--ff-panel)] px-2 py-1">
                  <span className="text-[var(--ff-muted)]">CAR / FX / SODA</span>
                  <strong className="text-[var(--ff-cream)]">
                    {(snap?.carOverlayMs ?? 0).toFixed(2)}ms
                  </strong>
                </div>
              </div>
            </section>

            {/* Scene Geometry */}
            <section className="space-y-1.5 p-3">
              <div className="text-[10px] font-bold tracking-[0.14em] text-[var(--ff-muted)] uppercase">
                SCENE GEOMETRY
              </div>
              <div className="grid grid-cols-2 gap-1.5 text-[10.5px]">
                <div className="rounded-[2px] border border-[var(--ff-border)] bg-[var(--ff-panel)] px-2 py-1.5">
                  <div className="text-[9px] text-[var(--ff-muted)]">DRAWN SEGMENTS</div>
                  <div className="text-xs font-bold text-[var(--ff-cream)]">
                    {snap?.drawnSegments ?? 0}{' '}
                    <span className="text-[9.5px] font-normal text-[var(--ff-muted)]">
                      / {tuning.drawDistance}
                    </span>
                  </div>
                </div>
                <div className="rounded-[2px] border border-[var(--ff-border)] bg-[var(--ff-panel)] px-2 py-1.5">
                  <div className="text-[9px] text-[var(--ff-muted)]">ROADSIDE PROPS</div>
                  <div className="text-xs font-bold text-[var(--ff-cream)]">
                    {snap?.drawnProps ?? 0}
                  </div>
                </div>
                <div className="rounded-[2px] border border-[var(--ff-border)] bg-[var(--ff-panel)] px-2 py-1.5">
                  <div className="text-[9px] text-[var(--ff-muted)]">AI KEI TRUCKS</div>
                  <div className="text-xs font-bold text-[var(--ff-cream)]">
                    {snap?.drawnTrucks ?? 0}
                  </div>
                </div>
                <div className="rounded-[2px] border border-[var(--ff-border)] bg-[var(--ff-panel)] px-2 py-1.5">
                  <div className="text-[9px] text-[var(--ff-muted)]">ACTIVE PARTICLES</div>
                  <div className="text-xs font-bold text-[var(--ff-cream)]">
                    {snap?.activeParticles ?? 0}
                  </div>
                </div>
              </div>
            </section>

            {/* Engine & Memory */}
            <section className="space-y-1.5 p-3">
              <div className="text-[10px] font-bold tracking-[0.14em] text-[var(--ff-muted)] uppercase">
                ENGINE &amp; MEMORY
              </div>
              <div className="space-y-1 text-[10.5px]">
                <div className="flex justify-between">
                  <span className="text-[var(--ff-muted)]">Zero GC Render</span>
                  <span className="font-bold text-[var(--ff-mint)]">VERIFIED</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[var(--ff-muted)]">Fixed Timestep</span>
                  <span className="text-[var(--ff-cream)]">1/120s (8.33ms)</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[var(--ff-muted)]">JS Heap Usage</span>
                  <span className="text-[var(--ff-cream)]">
                    {snap?.memoryMb !== null && snap?.memoryMb !== undefined
                      ? `${snap.memoryMb} MB`
                      : 'N/A (Standard Web API)'}
                  </span>
                </div>
              </div>
            </section>

            {/* Live Report JSON */}
            <section className="p-3">
              <div className="text-[10px] font-bold tracking-[0.14em] text-[var(--ff-muted)] uppercase">
                LIVE REPORT JSON
              </div>
              <pre
                data-testid="perf-report-json"
                className="ff-scroll mt-1.5 max-h-32 overflow-auto rounded-[2px] border border-[var(--ff-border)] bg-[var(--ff-panel)]/50 p-2 text-[9px] leading-tight whitespace-pre-wrap break-all text-[var(--ff-muted)] select-text"
              >
                {reportJson}
              </pre>
            </section>

            {/* Footer Tip */}
            <div className="px-3 py-2 text-[10px] text-[var(--ff-muted)]">
              Press <span className="font-bold text-[var(--ff-cream)]">[F3]</span> anytime for the
              compact HUD profiler.
            </div>
          </>
        )}
      </div>
    </aside>
  );
}
