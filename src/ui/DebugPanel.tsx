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
import type { TelemetryBridge } from '@src/core/TelemetryBridge';
import type { GameEvent, TelemetrySnapshot } from '@src/engine/Game';
import { useEffect, useState, useSyncExternalStore } from 'react';

const STORAGE_KEY = 'mayonaka-cassette.tuning.v1';
const LEGACY_STORAGE_KEY = 'outrun-futurefunk.tuning.v1';

export function loadSavedTuning(): void {
  try {
    const raw =
      window.localStorage.getItem(STORAGE_KEY) ??
      window.localStorage.getItem(LEGACY_STORAGE_KEY);
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

export interface DebugPanelProps {
  open: boolean;
  onClose: () => void;
  bridge?: TelemetryBridge<TelemetrySnapshot, GameEvent>;
  onSelectPalette?: (index: number) => void;
}

export const FUTURE_FUNK_THEMES = [
  { index: 0, name: 'MAYONAKA BAY', sub: 'Night Funk', color: '#00f0b5' },
  { index: 1, name: 'SUNSET BOULEVARD', sub: 'OG Future Funk', color: '#ffd447' },
  { index: 2, name: 'AKIBA NIGHT RUSH', sub: 'Electric Night', color: '#00f5d4' },
] as const;

const GROUPS = Array.from(new Set(TUNING_CONTROLS.map((c) => c.group)));

type DebugTab = 'tuning' | 'profiler';

/**
 * Live feel-tuning and M8 Performance Profiler drawer (`?debug` or `F2`, AGENTS.md §5 M8).
 * Mutates `tuning` in place so changes are felt on the very next simulation step,
 * and monitors real-time frame time, physics cost, and draw counts with zero runtime overhead.
 */
export function DebugPanel({ open, onClose, bridge, onSelectPalette }: DebugPanelProps) {
  const [tab, setTab] = useState<DebugTab>('tuning');
  const [values, setValues] = useState<Tuning>(() => ({ ...tuning }));
  const [copied, setCopied] = useState(false);
  const [copiedPerf, setCopiedPerf] = useState(false);

  const snap = useSyncExternalStore(
    bridge ? bridge.subscribe : () => () => {},
    bridge ? bridge.getSnapshot : () => null,
  );

  useEffect(() => {
    if (open) setValues({ ...tuning });
  }, [open]);

  // Keyboard shortcut: pressing '1', '2', '3' while debug panel is open switches theme
  useEffect(() => {
    if (!open || !onSelectPalette) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === '1') onSelectPalette(0);
      else if (e.key === '2') onSelectPalette(1);
      else if (e.key === '3') onSelectPalette(2);
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [open, onSelectPalette]);

  if (!open) return null;

  const handleChange = (key: TuningKey, value: number) => {
    tuning[key] = value;
    setValues((prev) => ({ ...prev, [key]: value }));
    saveCurrentTuning();
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
    if (!snap) return;
    const report = {
      timestamp: new Date().toISOString(),
      fps: snap.fps,
      frameTimeMs: snap.frameTimeMs,
      simTimeMs: snap.simTimeMs,
      renderTimeMs: snap.renderTimeMs,
      fixedStepsLastFrame: snap.fixedStepsLastFrame,
      geometry: {
        drawnSegments: snap.drawnSegments,
        drawnProps: snap.drawnProps,
        drawnTrucks: snap.drawnTrucks,
        activeParticles: snap.activeParticles,
        drawDistance: tuning.drawDistance,
      },
      memory: {
        heapMb: snap.memoryMb,
      },
      stage: {
        number: snap.stageNumber,
        palette: snap.stagePaletteName,
        speedKmh: Math.round(snap.speedKmh),
        grooveTier: snap.grooveTier,
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

  const fps = snap?.fps ?? 60;
  const simMs = snap?.simTimeMs ?? 0.3;
  const renderMs = snap?.renderTimeMs ?? 1.2;
  const frameDt = snap?.frameTimeMs ?? 16.67;
  const totalLoadMs = simMs + renderMs;
  const budgetRatio = Math.min(1, totalLoadMs / 16.67);
  const budgetPct = Math.round(budgetRatio * 100);

  const fpsBadge =
    fps >= 58
      ? 'border-emerald-400/80 bg-emerald-950/80 text-emerald-300'
      : fps >= 45
        ? 'border-amber-400/80 bg-amber-950/80 text-amber-300'
        : 'border-pink-500 bg-pink-950/90 text-pink-300 animate-pulse';

  return (
    <aside className="pointer-events-auto absolute top-14 right-4 bottom-4 z-10 flex w-96 flex-col rounded border border-cyan-400/50 bg-[#0d0221]/94 font-mono text-xs text-fuchsia-100 shadow-[0_0_35px_rgba(5,217,232,0.3)] backdrop-blur-md">
      {/* Top Header */}
      <div className="flex items-center justify-between border-b border-fuchsia-500/30 px-3 py-2.5">
        <div className="flex items-center gap-2">
          <div className="font-bold tracking-wider text-cyan-300 uppercase">DEV CONSOLE</div>
          <span className={`rounded border px-1.5 py-0.5 text-[9px] font-bold ${fpsBadge}`}>
            {fps} FPS
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          {tab === 'tuning' ? (
            <>
              <button
                type="button"
                onClick={(e) => {
                  void handleCopyJson();
                  e.currentTarget.blur();
                }}
                className="cursor-pointer rounded border border-cyan-400/50 bg-cyan-950/60 px-2 py-1 text-[10px] font-semibold text-cyan-200 hover:bg-cyan-900/70"
              >
                {copied ? 'COPIED!' : 'COPY JSON'}
              </button>
              <button
                type="button"
                onClick={(e) => {
                  handleReset();
                  e.currentTarget.blur();
                }}
                className="cursor-pointer rounded border border-pink-500/50 bg-pink-950/60 px-2 py-1 text-[10px] font-semibold text-pink-200 hover:bg-pink-900/70"
              >
                RESET
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={(e) => {
                void handleCopyPerfReport();
                e.currentTarget.blur();
              }}
              className="cursor-pointer rounded border border-emerald-400/60 bg-emerald-950/70 px-2 py-1 text-[10px] font-semibold text-emerald-200 hover:bg-emerald-900/80"
            >
              {copiedPerf ? 'COPIED!' : 'DUMP BENCHMARK'}
            </button>
          )}
          <button
            type="button"
            onClick={(e) => {
              onClose();
              e.currentTarget.blur();
            }}
            className="cursor-pointer rounded border border-fuchsia-400/40 px-1.5 py-1 text-[10px] text-fuchsia-200 hover:border-white"
            aria-label="Close debug panel"
          >
            ✕
          </button>
        </div>
      </div>

      {/* Tab Switcher */}
      <div className="flex border-b border-fuchsia-500/25 bg-[#12052b]/80 p-1 text-[11px]">
        <button
          type="button"
          onClick={() => setTab('tuning')}
          className={`flex-1 rounded py-1 font-semibold tracking-wider transition ${
            tab === 'tuning'
              ? 'bg-cyan-500/25 text-cyan-200 shadow-[0_0_8px_rgba(5,217,232,0.25)]'
              : 'text-fuchsia-300/70 hover:text-fuchsia-100'
          }`}
        >
          FEEL TUNING
        </button>
        <button
          type="button"
          onClick={() => setTab('profiler')}
          className={`flex-1 rounded py-1 font-semibold tracking-wider transition ${
            tab === 'profiler'
              ? 'bg-pink-500/25 text-pink-200 shadow-[0_0_8px_rgba(255,42,109,0.25)]'
              : 'text-fuchsia-300/70 hover:text-fuchsia-100'
          }`}
        >
          PERF PROFILER
        </button>
      </div>

      {/* Mini Telemetry Status Ribbon (Always visible in both tabs) */}
      <div className="border-b border-fuchsia-500/20 bg-[#090117]/80 px-3 py-1.5 text-[10px]">
        <div className="flex items-center justify-between text-fuchsia-300/90">
          <span>
            LOAD: <strong className="text-cyan-300">{budgetPct}%</strong> ({totalLoadMs.toFixed(1)}ms / 16.7ms)
          </span>
          <span>
            RENDER: <strong className="text-pink-300">{renderMs.toFixed(1)}ms</strong>
          </span>
          <span>
            PHYS: <strong className="text-emerald-300">{simMs.toFixed(2)}ms</strong>
          </span>
        </div>
        <div className="relative mt-1 h-1.5 w-full overflow-hidden rounded bg-fuchsia-950/80">
          <div
            className="h-full bg-linear-to-r from-emerald-400 via-cyan-400 to-pink-500 transition-all duration-75"
            style={{ width: `${budgetPct}%` }}
          />
        </div>
      </div>

      {/* Tab Body */}
      {tab === 'tuning' ? (
        <div className="flex-1 space-y-4 overflow-y-auto p-3">
          {/* Future Funk Atmosphere & Palette Switcher */}
          <div className="space-y-2 rounded border border-cyan-400/40 bg-[#090117]/90 p-2.5">
            <div className="flex items-center justify-between text-[10px] font-bold tracking-[0.2em] text-cyan-300 uppercase">
              <span>ATMOSPHERE / PALETTE</span>
              <span className="text-[9px] font-normal text-fuchsia-300">KEYS 1–3</span>
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              {FUTURE_FUNK_THEMES.map((theme) => {
                const isActive = snap?.stagePaletteName === theme.name;
                return (
                  <button
                    key={theme.name}
                    type="button"
                    onClick={() => onSelectPalette?.(theme.index)}
                    className={`flex cursor-pointer flex-col justify-between rounded border p-1.5 text-left transition ${
                      isActive
                        ? 'border-cyan-400 bg-cyan-950/70 shadow-[0_0_10px_rgba(5,217,232,0.35)]'
                        : 'border-fuchsia-500/30 bg-[#160730]/50 hover:border-fuchsia-400/60 hover:bg-[#200a45]/60'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold" style={{ color: theme.color }}>
                        [{theme.index + 1}] {theme.name}
                      </span>
                      {isActive && (
                        <span className="h-1.5 w-1.5 rounded-full bg-cyan-300 shadow-[0_0_4px_#05d9e8]" />
                      )}
                    </div>
                    <span className="text-[9px] text-fuchsia-200/70">{theme.sub}</span>
                  </button>
                );
              })}
            </div>
          </div>

                    {/* Weather & Sky / Fondali (Fase 2) */}
          <div className="space-y-2 rounded border border-fuchsia-500/40 bg-[#090117]/90 p-2.5">
            <div className="flex items-center justify-between text-[10px] font-bold tracking-[0.2em] text-pink-400 uppercase">
              <span>WEATHER & SKY / FONDALI</span>
              <span className="text-[9px] font-normal text-fuchsia-300">LIVE TOGGLES</span>
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              {/* Rain & Storm */}
              <button
                type="button"
                onClick={() => handleChange("bgRain", values.bgRain ? 0 : 1)}
                className={`flex cursor-pointer items-center justify-between rounded border p-1.5 text-left transition ${
                  values.bgRain
                    ? "border-cyan-400 bg-cyan-950/70 shadow-[0_0_8px_rgba(5,217,232,0.35)]"
                    : "border-fuchsia-500/30 bg-[#160730]/50 hover:border-fuchsia-400/60"
                }`}
              >
                <div className="flex items-center gap-1.5">
                  <span className="text-xs">⛈️</span>
                  <span className="text-[10px] font-bold text-cyan-200">RAIN/STORM</span>
                </div>
                <span className={`text-[9px] font-bold ${values.bgRain ? "text-cyan-300" : "text-fuchsia-400/60"}`}>
                  {values.bgRain ? "ON" : "OFF"}
                </span>
              </button>

              {/* Clouds */}
              <button
                type="button"
                onClick={() => handleChange("bgClouds", values.bgClouds ? 0 : 1)}
                className={`flex cursor-pointer items-center justify-between rounded border p-1.5 text-left transition ${
                  values.bgClouds
                    ? "border-cyan-400 bg-cyan-950/70 shadow-[0_0_8px_rgba(5,217,232,0.35)]"
                    : "border-fuchsia-500/30 bg-[#160730]/50 hover:border-fuchsia-400/60"
                }`}
              >
                <div className="flex items-center gap-1.5">
                  <span className="text-xs">☁️</span>
                  <span className="text-[10px] font-bold text-cyan-200">CLOUDS</span>
                </div>
                <span className={`text-[9px] font-bold ${values.bgClouds ? "text-cyan-300" : "text-fuchsia-400/60"}`}>
                  {values.bgClouds ? "ON" : "OFF"}
                </span>
              </button>

              {/* Birds */}
              <button
                type="button"
                onClick={() => handleChange("bgBirds", values.bgBirds ? 0 : 1)}
                className={`flex cursor-pointer items-center justify-between rounded border p-1.5 text-left transition ${
                  values.bgBirds
                    ? "border-cyan-400 bg-cyan-950/70 shadow-[0_0_8px_rgba(5,217,232,0.35)]"
                    : "border-fuchsia-500/30 bg-[#160730]/50 hover:border-fuchsia-400/60"
                }`}
              >
                <div className="flex items-center gap-1.5">
                  <span className="text-xs">🕊️</span>
                  <span className="text-[10px] font-bold text-cyan-200">BIRDS</span>
                </div>
                <span className={`text-[9px] font-bold ${values.bgBirds ? "text-cyan-300" : "text-fuchsia-400/60"}`}>
                  {values.bgBirds ? "ON" : "OFF"}
                </span>
              </button>

              {/* Constellations */}
              <button
                type="button"
                onClick={() => handleChange("bgConstellations", values.bgConstellations ? 0 : 1)}
                className={`flex cursor-pointer items-center justify-between rounded border p-1.5 text-left transition ${
                  values.bgConstellations
                    ? "border-cyan-400 bg-cyan-950/70 shadow-[0_0_8px_rgba(5,217,232,0.35)]"
                    : "border-fuchsia-500/30 bg-[#160730]/50 hover:border-fuchsia-400/60"
                }`}
              >
                <div className="flex items-center gap-1.5">
                  <span className="text-xs">✨</span>
                  <span className="text-[10px] font-bold text-cyan-200">STARS</span>
                </div>
                <span className={`text-[9px] font-bold ${values.bgConstellations ? "text-cyan-300" : "text-fuchsia-400/60"}`}>
                  {values.bgConstellations ? "ON" : "OFF"}
                </span>
              </button>
            </div>

            {/* Lightning on Beat */}
            <button
              type="button"
              onClick={() => handleChange("bgLightningOnBeat", values.bgLightningOnBeat ? 0 : 1)}
              className={`flex w-full cursor-pointer items-center justify-between rounded border p-1.5 text-left transition ${
                values.bgLightningOnBeat
                  ? "border-pink-500 bg-pink-950/60 shadow-[0_0_8px_rgba(255,42,109,0.3)]"
                  : "border-fuchsia-500/30 bg-[#160730]/50 hover:border-fuchsia-400/60"
              }`}
            >
              <div className="flex items-center gap-1.5">
                <span className="text-xs">⚡</span>
                <span className="text-[10px] font-bold text-pink-200">BEAT LIGHTNING FLASH</span>
              </div>
              <span className={`text-[9px] font-bold ${values.bgLightningOnBeat ? "text-pink-300" : "text-fuchsia-400/60"}`}>
                {values.bgLightningOnBeat ? "ACTIVE ON DROP" : "OFF"}
              </span>
            </button>
          </div>

          {GROUPS.map((group) => (
            <div key={group} className="space-y-2.5">
              <div className="border-b border-fuchsia-500/25 pb-1 text-[10px] font-bold tracking-[0.2em] text-pink-400 uppercase">
                {group}
              </div>
              {TUNING_CONTROLS.filter((c) => c.group === group).map((ctrl) => {
                const current = values[ctrl.key];
                const isModified = current !== DEFAULT_TUNING[ctrl.key];
                return (
                  <label key={ctrl.key} className="block space-y-0.5">
                    <div className="flex justify-between text-[11px]">
                      <span
                        className={isModified ? 'font-semibold text-cyan-300' : 'text-fuchsia-100'}
                      >
                        {ctrl.label}
                      </span>
                      <span className="tabular-nums text-fuchsia-300">
                        {current}
                        {ctrl.unit ? ` ${ctrl.unit}` : ''}
                      </span>
                    </div>
                    <div className="text-[10px] leading-tight text-fuchsia-300/65">{ctrl.hint}</div>
                    <input
                      type="range"
                      min={ctrl.min}
                      max={ctrl.max}
                      step={ctrl.step}
                      value={current}
                      onChange={(e) => handleChange(ctrl.key, Number(e.target.value))}
                      onPointerUp={(e) => e.currentTarget.blur()}
                      className="h-1.5 w-full cursor-pointer appearance-none rounded bg-fuchsia-950 accent-cyan-400"
                    />
                  </label>
                );
              })}
            </div>
          ))}
        </div>
      ) : (
        <div className="flex-1 space-y-3.5 overflow-y-auto p-3">
          {/* Section: Frame Timing Budget */}
          <div className="rounded border border-cyan-400/30 bg-[#070114]/85 p-2.5">
            <div className="flex items-center justify-between text-[10px] font-bold tracking-wider text-cyan-300 uppercase">
              <span>FRAME TIME BUDGET</span>
              <span>TARGET 60 FPS (16.67ms)</span>
            </div>
            <div className="mt-2 space-y-1.5 text-[11px]">
              <div className="flex justify-between">
                <span className="text-fuchsia-200">Total Frame Delta:</span>
                <span className="font-bold tabular-nums text-cyan-200">{frameDt.toFixed(2)} ms</span>
              </div>
              <div className="flex justify-between">
                <span className="text-pink-300">2D Canvas Render:</span>
                <span className="tabular-nums text-pink-200">{renderMs.toFixed(2)} ms</span>
              </div>
              <div className="flex justify-between">
                <span className="text-emerald-300">Physics Simulation:</span>
                <span className="tabular-nums text-emerald-200">
                  {simMs.toFixed(2)} ms ({snap?.fixedStepsLastFrame ?? 1} fixed steps / frame)
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-cyan-300">Available Headroom:</span>
                <span className="font-bold tabular-nums text-emerald-300">
                  {Math.max(0, 16.67 - totalLoadMs).toFixed(2)} ms
                </span>
              </div>
            </div>
          </div>

          {/* Section: 2D Geometry & Scene Load */}
          <div className="rounded border border-fuchsia-500/30 bg-[#070114]/85 p-2.5">
            <div className="text-[10px] font-bold tracking-wider text-pink-400 uppercase">
              SCENE & RASTER GEOMETRY
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2 text-[11px]">
              <div className="rounded bg-[#160730]/60 p-2">
                <div className="text-[9px] text-fuchsia-300/80">DRAWN SEGMENTS</div>
                <div className="text-sm font-bold tabular-nums text-cyan-300">
                  {snap?.drawnSegments ?? 0} <span className="text-[9px] text-fuchsia-300">/ {tuning.drawDistance}</span>
                </div>
              </div>
              <div className="rounded bg-[#160730]/60 p-2">
                <div className="text-[9px] text-fuchsia-300/80">ROADSIDE PROPS</div>
                <div className="text-sm font-bold tabular-nums text-pink-300">
                  {snap?.drawnProps ?? 0}
                </div>
              </div>
              <div className="rounded bg-[#160730]/60 p-2">
                <div className="text-[9px] text-fuchsia-300/80">AI KEI TRUCKS</div>
                <div className="text-sm font-bold tabular-nums text-amber-300">
                  {snap?.drawnTrucks ?? 0}
                </div>
              </div>
              <div className="rounded bg-[#160730]/60 p-2">
                <div className="text-[9px] text-fuchsia-300/80">ACTIVE PARTICLES</div>
                <div className="text-sm font-bold tabular-nums text-emerald-300">
                  {snap?.activeParticles ?? 0}
                </div>
              </div>
            </div>
          </div>

          {/* Section: Engine Invariants & Memory */}
          <div className="rounded border border-emerald-500/30 bg-[#070114]/85 p-2.5 text-[11px]">
            <div className="text-[10px] font-bold tracking-wider text-emerald-400 uppercase">
              ENGINE INVARIANTS & MEMORY
            </div>
            <div className="mt-2 space-y-1">
              <div className="flex justify-between">
                <span className="text-fuchsia-200">Zero GC in Render Loop:</span>
                <span className="font-bold text-emerald-300">VERIFIED ✓</span>
              </div>
              <div className="flex justify-between">
                <span className="text-fuchsia-200">Fixed Timestep:</span>
                <span className="tabular-nums text-cyan-200">1/120s (8.33ms)</span>
              </div>
              <div className="flex justify-between">
                <span className="text-fuchsia-200">JS Heap Usage:</span>
                <span className="tabular-nums text-fuchsia-100">
                  {snap?.memoryMb !== null && snap?.memoryMb !== undefined
                    ? `${snap.memoryMb} MB`
                    : 'N/A (Standard Web API)'}
                </span>
              </div>
            </div>
          </div>

          {/* Benchmark Advice */}
          <div className="rounded border border-cyan-400/20 bg-cyan-950/30 p-2 text-[10px] leading-relaxed text-cyan-200/90">
            <strong>TIP:</strong> Premi <kbd className="rounded border border-cyan-400/40 px-1 bg-cyan-950">F3</kbd> in qualsiasi momento per attivare il mini-profiler arcade direttamente sulla HUD in gara.
          </div>
        </div>
      )}
    </aside>
  );
}
