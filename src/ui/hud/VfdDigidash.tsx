import { GEAR_NUMBERS, MAX_GEAR } from '@src/entities/Gearbox';

export interface VfdDigidashProps {
  speedKmh: number;
  speedRatio: number;
  gear: number;
  rpm: number;
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

/**
 * 1980s Japanese Vacuum Fluorescent Display (VFD) Digital Cockpit Instrument Cluster.
 * Inspired by Toyota Soarer Z10/Z20, Subaru XT Vortex, and Nissan 300ZX Z31 digidash.
 * Integrates Tachometer, Beat-Shift Gearbox, Speedometer, and side-mounted Rhythm Judgements.
 */
export function VfdDigidash({
  speedKmh,
  speedRatio,
  gear,
  rpm,
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
      {/* Tactical Driving & Rhythm Alerts Strip (Placed on dashboard header, leaving road clear) */}
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

      {/* Main JDM VFD Instrument Pods */}
      <div className="flex items-stretch gap-2">
        {/* Module 1: Gearbox & Tachometer VFD */}
        <div className="flex w-48 flex-col justify-between rounded border border-cyan-400/40 bg-[#060b14]/94 p-2 shadow-[0_0_20px_rgba(5,217,232,0.18)] backdrop-blur-md">
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
            <div className="mb-0.5 flex items-center justify-between text-[8px] font-mono tracking-wider uppercase text-cyan-400/80">
              <span>{displayRpm} RPM</span>
              <span className="text-emerald-300">72–90% BEAT ZONE</span>
            </div>

            {/* 18-Segment VFD Bar */}
            <div className="grid grid-cols-18 gap-0.5" aria-hidden="true">
              {TACH_SEGMENT_INDICES.map((segIdx) => {
                const segThreshold = (segIdx + 1) / TACH_SEGMENTS;
                const isLit = segIdx < activeTachSegments;
                const isRedZone = segThreshold > 0.9;
                const isSweetZone = segThreshold >= 0.72 && segThreshold <= 0.9;
                return (
                  <span
                    key={segIdx}
                    className={`h-2 rounded-[1px] ${
                      isLit
                        ? isRedZone
                          ? 'bg-pink-500 shadow-[0_0_5px_#ff2a6d]'
                          : isLugging
                            ? 'bg-amber-400'
                            : isSweetZone
                              ? 'bg-emerald-400 shadow-[0_0_6px_#10b981]'
                              : 'bg-cyan-400 shadow-[0_0_4px_#05d9e8]'
                        : isSweetZone
                          ? 'bg-emerald-950/50 border-t border-emerald-400/30'
                          : isRedZone
                            ? 'bg-pink-950/40'
                            : 'bg-cyan-950/30'
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

        {/* Module 2: VFD Digital Speedometer */}
        <div className="flex w-44 flex-col justify-between rounded border border-cyan-400/40 bg-[#060b14]/94 p-2 shadow-[0_0_20px_rgba(5,217,232,0.18)] backdrop-blur-md">
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
  );
}
