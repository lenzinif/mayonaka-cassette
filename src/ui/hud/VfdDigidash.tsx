import { GEAR_NUMBERS, MAX_GEAR } from '@src/entities/Gearbox';
import type { GrooveTier } from '@src/entities/PlayerCar';

export interface VfdDigidashProps {
  speedKmh: number;
  speedRatio: number;
  gear: number;
  rpm: number;
  groove?: number;
  grooveTier?: GrooveTier;
  isLugging: boolean;
  isRedlining: boolean;
  isOverdrive: boolean;
  autoShift: boolean;
  lastShiftTier: string | null;
  lastShiftDeltaMs: number | null;
  isDrifting: boolean;
  driftTime: number;
  isOffRoad: boolean;
  onToggleAutoShift: () => void;
}

const TACH_SEGMENTS = 18;
const TACH_SEGMENT_INDICES = Array.from({ length: TACH_SEGMENTS }, (_, i) => i);
const GROOVE_SEGMENTS = Array.from({ length: 24 }, (_, i) => i);

/**
 * 1980s Japanese Vacuum Fluorescent Display (VFD) Digital Cockpit Instrument Cluster.
 * Inspired by Toyota Soarer Z10/Z20, Subaru XT Vortex, and Nissan 300ZX Z31 digidash.
 * Integrates Tachometer, Beat-Shift Gearbox, Speedometer, Groove Flux, and Tactical Judgements.
 */
export function VfdDigidash({
  speedKmh,
  speedRatio,
  gear,
  rpm,
  groove = 0,
  grooveTier = 'LOW',
  isLugging,
  isRedlining,
  isOverdrive,
  autoShift,
  lastShiftTier,
  lastShiftDeltaMs,
  isDrifting,
  driftTime,
  isOffRoad,
  onToggleAutoShift,
}: VfdDigidashProps) {
  const speedPct = Math.min(100, Math.round(speedRatio * 100));
  const rpmPct = Math.min(100, Math.round(rpm * 100));
  const displayRpm = Math.round(900 + rpm * 7100);
  const activeTachSegments = Math.round(rpm * TACH_SEGMENTS);

  const shiftSweetSpot = !autoShift && gear < MAX_GEAR && rpm >= 0.72 && !isRedlining;
  const showDownshiftPrompt = !autoShift && isLugging;

  return (
    <div className="flex flex-col items-end gap-1.5 [contain:layout_style_paint]">
      {/* Tactical Driving & Rhythm Alerts Strip (Placed above dashboard binnacle) */}
      <div className="flex flex-wrap items-center justify-end gap-1 text-[10px] font-bold tracking-wider uppercase">
        {isOffRoad && (
          <span className="rounded border border-amber-400 bg-amber-950/90 px-2 py-0.5 text-amber-300">
            OFF-ROAD
          </span>
        )}
        {isDrifting && (
          <span className="rounded border border-cyan-300 bg-cyan-950/92 px-2 py-0.5 text-cyan-200 shadow-[0_0_10px_rgba(5,217,232,0.5)]">
            DRIFTING {driftTime >= 0.1 ? `${driftTime.toFixed(1)}S` : ''}
          </span>
        )}
        {isOverdrive && (
          <span className="animate-pulse rounded border border-amber-300 bg-amber-950/92 px-2 py-0.5 text-amber-200 shadow-[0_0_12px_rgba(251,191,36,0.55)]">
            OVERDRIVE
          </span>
        )}
        {showDownshiftPrompt && (
          <span className="animate-pulse rounded border border-amber-400 bg-amber-950/92 px-2 py-0.5 text-amber-200">
            BOGGING! DOWNSHIFT
          </span>
        )}
        {!autoShift && isRedlining && (
          <span className="animate-pulse rounded border border-pink-400 bg-pink-950/92 px-2 py-0.5 text-pink-200 shadow-[0_0_10px_rgba(255,42,109,0.5)]">
            REV LIMIT! SHIFT UP
          </span>
        )}
        {shiftSweetSpot && (
          <span className="animate-pulse rounded border border-emerald-300 bg-emerald-950/92 px-2 py-0.5 text-emerald-200 shadow-[0_0_10px_rgba(16,185,129,0.4)]">
            SHIFT ON BEAT [SPACE]
          </span>
        )}
        {lastShiftTier && lastShiftTier !== 'OFF' && (
          <span
            className={`rounded border px-1.5 py-0.5 text-[9px] font-bold tabular-nums ${
              lastShiftTier === 'PERFECT'
                ? 'border-emerald-300 bg-emerald-950/90 text-emerald-200 shadow-[0_0_8px_rgba(16,185,129,0.4)]'
                : 'border-cyan-300 bg-cyan-950/90 text-cyan-200'
            }`}
          >
            LAST SHIFT: {lastShiftTier}
            {lastShiftDeltaMs !== null
              ? ` (${lastShiftDeltaMs >= 0 ? '+' : ''}${Math.round(lastShiftDeltaMs)}MS)`
              : ''}
          </span>
        )}
      </div>

      {/* Unified JDM VFD Instrument Cluster Binnacle */}
      <div className="flex flex-col gap-2 rounded-lg border-2 border-cyan-400/50 bg-[#060b14]/96 p-2.5 shadow-[0_0_25px_rgba(5,217,232,0.22)] backdrop-blur-md">
        {/* Upper Deck: VFD Groove Flux Meter with Tier Zones */}
        <div className="flex flex-col gap-1 rounded border border-cyan-500/20 bg-[#040811]/85 px-2.5 py-1.5">
          <div className="flex items-center justify-between text-[9px] font-bold tracking-widest uppercase">
            <div className="flex items-center gap-2">
              <span className="text-cyan-300">GROOVE FLUX</span>
              <span className="text-xs font-black tabular-nums text-white [text-shadow:0_0_8px_#05d9e8]">
                {groove}%
              </span>
            </div>
            <div className="flex items-center gap-1">
              <span
                className={`rounded px-1.5 py-0.2 text-[8px] font-black tracking-wider transition-all duration-150 ${
                  grooveTier === 'SSS'
                    ? 'border border-amber-300 bg-amber-950/90 text-amber-200 shadow-[0_0_10px_rgba(251,191,36,0.6)] animate-pulse'
                    : grooveTier === 'HIGH'
                      ? 'border border-pink-400 bg-pink-950/90 text-pink-200 shadow-[0_0_8px_rgba(255,42,109,0.5)]'
                      : grooveTier === 'MEDIUM'
                        ? 'border border-cyan-400 bg-cyan-950/90 text-cyan-200'
                        : 'border border-zinc-700 bg-zinc-900/90 text-zinc-400'
                }`}
              >
                TIER: {grooveTier}
              </span>
            </div>
          </div>

          {/* 24-Segment VFD Groove Flux Bar with Tier Indicators */}
          <div className="relative">
            <div className="flex gap-0.5 h-2 w-full">
              {GROOVE_SEGMENTS.map((segIdx) => {
                const segPct = (segIdx / 24) * 100;
                const isActive = groove >= segPct;
                let activeColor = 'bg-cyan-400 shadow-[0_0_4px_#05d9e8]';
                if (segIdx >= 21) {
                  activeColor = 'bg-amber-300 shadow-[0_0_6px_#fbbf24]';
                } else if (segIdx >= 16) {
                  activeColor = 'bg-pink-500 shadow-[0_0_5px_#ff2a6d]';
                }

                return (
                  <div
                    key={segIdx}
                    className={`flex-1 rounded-xs transition-colors duration-75 ${
                      isActive ? activeColor : 'bg-[#02050a] border border-cyan-950/40'
                    }`}
                  />
                );
              })}
            </div>

            {/* Tier Marker Labels beneath the bar */}
            <div className="mt-0.5 flex justify-between text-[6px] font-mono tracking-tighter text-zinc-500 uppercase">
              <span>LOW</span>
              <span className="text-cyan-500/70">MED</span>
              <span className="text-pink-500/70">HIGH</span>
              <span className="text-amber-400/80 font-bold">SSS</span>
            </div>
          </div>
        </div>

        {/* Lower Deck: Side-by-Side Instrument Gauges (Gearbox/Tach + Speedometer) */}
        <div className="flex items-stretch gap-3">
          {/* Module 1: Gearbox & Tachometer VFD */}
          <div className="flex w-46 flex-col justify-between">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-cyan-400/20 pb-0.5 text-[9px] font-bold tracking-widest text-cyan-300 uppercase">
              <span>GEAR &amp; RPM</span>
              <button
                type="button"
                onClick={onToggleAutoShift}
                className="pointer-events-auto cursor-pointer rounded border border-cyan-400/30 bg-cyan-950/70 px-1 py-0.2 text-[8px] text-cyan-200 hover:border-pink-400"
                title="Cambia cambio Automatico/Manuale [G]"
              >
                {autoShift ? 'AUTO' : 'MAN'}
              </button>
            </div>

            {/* Active Gear Display + Gate */}
            <div className="my-1 flex items-center justify-between">
              <div className="flex items-baseline gap-1">
                <span className="text-3xl font-black italic text-cyan-300 [text-shadow:0_0_12px_#05d9e8]">
                  {gear}
                </span>
                <span className="text-[9px] font-bold text-cyan-500/70">
                  /{MAX_GEAR}
                </span>
              </div>

              {/* Gear Selector Gate */}
              <div className="flex gap-0.5 text-[9px] font-bold">
                {GEAR_NUMBERS.map((g) => (
                  <span
                    key={g}
                    className={`rounded-xs px-1 py-0.5 tabular-nums transition-colors ${
                      gear === g
                        ? 'bg-cyan-400 text-slate-950 shadow-[0_0_8px_#05d9e8]'
                        : g < gear
                          ? 'bg-cyan-950/70 text-cyan-300/80 border border-cyan-500/30'
                          : 'bg-[#03070d] text-cyan-800'
                    }`}
                  >
                    {g}
                  </span>
                ))}
              </div>
            </div>

            {/* Segmented VFD Tachometer */}
            <div>
              <div className="mb-0.5 flex items-center justify-between text-[7px] tabular-nums text-cyan-400/70 font-mono">
                <span>TACH</span>
                <span className="font-bold text-cyan-200">
                  {displayRpm.toLocaleString()} RPM
                </span>
                <span className="text-emerald-400">72–90% BEAT ZONE</span>
              </div>

              {/* Segmented Tach Bar */}
              <div className="flex gap-0.5 h-2.5 w-full">
                {TACH_SEGMENT_INDICES.map((idx) => {
                  const segRatio = (idx + 1) / TACH_SEGMENTS;
                  const isLit = idx < activeTachSegments;
                  const isSweetZone = segRatio >= 0.72 && segRatio <= 0.9;
                  const isRedZone = segRatio > 0.9;

                  return (
                    <div
                      key={idx}
                      className={`flex-1 rounded-xs transition-colors duration-75 ${
                        isLit
                          ? isRedZone
                            ? 'bg-pink-500 shadow-[0_0_6px_#ff2a6d]'
                            : isSweetZone
                              ? 'bg-emerald-400 shadow-[0_0_6px_#10b981]'
                              : isLugging
                                ? 'bg-amber-400'
                                : 'bg-cyan-400 shadow-[0_0_4px_#05d9e8]'
                          : isSweetZone
                            ? 'bg-emerald-950/40 border-b border-emerald-500/40'
                            : isRedZone
                              ? 'bg-pink-950/40'
                              : 'bg-[#03070d]'
                      }`}
                    />
                  );
                })}
              </div>

              {/* Continuous RPM Micro-Bar */}
              <div className="relative mt-1 h-1 w-full overflow-hidden rounded-xs bg-[#03070d]">
                <div
                  className="absolute inset-y-0 left-[72%] w-[18%] bg-emerald-400/30"
                  title="Beat-Shift Sweet Spot"
                />
                <div
                  className={`h-full w-full origin-left transition-transform duration-75 will-change-transform ${
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

          {/* Vertical Divider */}
          <div className="w-px bg-cyan-400/20" />

          {/* Module 2: VFD Digital Speedometer */}
          <div className="flex w-40 flex-col justify-between">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-cyan-400/20 pb-0.5 text-[9px] font-bold tracking-widest text-cyan-300 uppercase">
              <span>VELOCITY</span>
              <span className="text-[8px] text-cyan-400/80">VFD KM/H</span>
            </div>

            {/* 7-Segment Digital Speed Display with Off-Ghosting */}
            <div className="my-1 flex items-baseline justify-end gap-1">
              <div className="relative font-mono">
                {/* Ghosted off segments */}
                <span
                  aria-hidden="true"
                  className="text-4xl font-black italic tabular-nums tracking-tight text-cyan-950/40 select-none"
                >
                  888
                </span>
                {/* Lit segments */}
                <span className="absolute inset-0 text-4xl font-black italic tabular-nums tracking-tight text-cyan-200 [text-shadow:0_0_14px_#05d9e8]">
                  {String(speedKmh).padStart(3, '0')}
                </span>
              </div>
              <span className="text-xs font-black text-pink-400">KM/H</span>
            </div>

            {/* Velocity Progress Bar */}
            <div>
              <div className="mb-0.5 flex items-center justify-between text-[7px] tabular-nums text-cyan-400/70 font-mono">
                <span>0</span>
                <span>100</span>
                <span>200</span>
                <span>MAX</span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-xs border border-cyan-400/30 bg-[#03070d]">
                <div
                  className="h-full w-full origin-left bg-gradient-to-r from-cyan-400 via-fuchsia-500 to-amber-300 transition-transform duration-75 will-change-transform"
                  style={{ transform: `scaleX(${speedPct / 100})` }}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
