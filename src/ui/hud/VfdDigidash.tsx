import { GEAR_NUMBERS, MAX_GEAR } from '@src/entities/Gearbox';
import type { GrooveTier } from '@src/entities/PlayerCar';
import { memo } from 'react';

export interface VfdDigidashProps {
  speedKmh: number;
  speedRatio: number;
  gear: number;
  rpm: number;
  groove?: number;
  grooveTier?: GrooveTier;
  isLugging: boolean;
  autoShift: boolean;
  onToggleAutoShift: () => void;
}

const TACH_SEGMENTS = 18;
const TACH_SEGMENT_INDICES = Array.from({ length: TACH_SEGMENTS }, (_, i) => i);
const GROOVE_SEGMENTS = Array.from({ length: 24 }, (_, i) => i);

const TIER_BADGE_COLORS: Readonly<Record<GrooveTier, string>> = {
  LOW: 'bg-[var(--ff-panel-hi)] text-[var(--ff-muted)]',
  MEDIUM: 'bg-[var(--ff-mint)] text-[var(--ff-ink)]',
  HIGH: 'bg-[var(--ff-pink)] text-[var(--ff-cream)]',
  OVERDRIVE: 'bg-[var(--ff-gold)] text-[var(--ff-ink)]',
};

/**
 * 1980s Japanese Vacuum Fluorescent Display (VFD) Digital Cockpit Instrument Cluster.
 * Harmonized under the Mayonaka Hi-Fi 7-token palette.
 */
export const VfdDigidash = memo(function VfdDigidash({
  speedKmh,
  speedRatio,
  gear,
  rpm,
  groove = 0,
  grooveTier = 'LOW',
  isLugging,
  autoShift,
  onToggleAutoShift,
}: VfdDigidashProps) {
  const speedPct = Math.min(100, Math.round(speedRatio * 100));
  const rpmPct = Math.min(100, Math.round(rpm * 100));
  const displayRpm = Math.round(900 + rpm * 7100);
  const activeTachSegments = Math.round(rpm * TACH_SEGMENTS);
  const tierBadge = TIER_BADGE_COLORS[grooveTier] ?? TIER_BADGE_COLORS.LOW;

  return (
    <div className="flex origin-bottom-right scale-75 flex-col items-end gap-1.5 sm:scale-100 [contain:layout_style_paint]">
      <div className="ff-shadow-ink w-80 overflow-hidden rounded-[2px] border-2 border-[rgba(255,245,228,0.26)] bg-[#0B0E1E]/94 sm:w-[360px]">
        <div className="ff-obi-h h-[3px] w-full" />

        <div className="space-y-2.5 p-3">
          {/* Upper Deck: Groove Meter */}
          <div className="space-y-1">
            <div className="flex items-center justify-between text-[10px] font-black tracking-[0.16em] uppercase">
              <div className="flex items-center gap-2">
                <span className="text-[var(--ff-muted)]">GROOVE</span>
                <span className="ff-mono text-xs text-[var(--ff-cream)]">{groove}%</span>
              </div>
              <span className={`ff-mono rounded-[2px] px-1.5 py-[1px] text-[9px] font-black ${tierBadge}`}>
                {grooveTier}
              </span>
            </div>

            <div className="flex h-2 w-full gap-0.5">
              {GROOVE_SEGMENTS.map((segIdx) => {
                const segPct = (segIdx / 24) * 100;
                const isActive = groove >= segPct;
                let activeColor = 'bg-[var(--ff-mint)]';
                if (segIdx >= 20) {
                  activeColor = 'bg-[var(--ff-gold)]';
                } else if (segIdx >= 12) {
                  activeColor = 'bg-[var(--ff-pink)]';
                }

                return (
                  <div
                    key={segIdx}
                    className={`flex-1 rounded-[1px] ${isActive ? activeColor : 'bg-[var(--ff-panel-hi)]'}`}
                  />
                );
              })}
            </div>
          </div>

          {/* Lower Deck: Gearbox + Tachometer | Speedometer */}
          <div className="grid grid-cols-[1.15fr_1px_0.85fr] items-end gap-3 pt-0.5">
            {/* Module 1: Gearbox & Tachometer */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <div className="flex items-baseline gap-1">
                  <span className="ff-display text-3xl leading-none font-black italic text-[var(--ff-mint)]">
                    {gear}
                  </span>
                  <span className="ff-mono text-[10px] font-bold text-[var(--ff-muted)]">
                    /{MAX_GEAR}
                  </span>
                </div>

                <div className="flex items-center gap-1">
                  <div className="ff-mono flex items-center gap-0.5 text-[9px] font-bold">
                    {GEAR_NUMBERS.map((g) => (
                      <span
                        key={g}
                        className={`rounded-[2px] px-1 py-0.5 ${
                          gear === g
                            ? 'bg-[var(--ff-mint)] font-black text-[var(--ff-ink)]'
                            : g < gear
                              ? 'bg-[var(--ff-panel-hi)] text-[var(--ff-muted)]'
                              : 'bg-[var(--ff-panel)] text-[#94A0C4]/35'
                        }`}
                      >
                        {g}
                      </span>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={onToggleAutoShift}
                    className="ff-mono pointer-events-auto cursor-pointer rounded-[2px] border border-[rgba(255,245,228,0.22)] bg-[var(--ff-panel)] px-1.5 py-0.5 text-[8px] font-bold text-[var(--ff-cream)] transition hover:border-[var(--ff-pink)]"
                    title="Toggle Auto/Manual shifting [G]"
                  >
                    {autoShift ? 'AUTO' : 'MAN'}
                  </button>
                </div>
              </div>

              {/* Segmented Tachometer */}
              <div className="flex h-2.5 w-full gap-0.5">
                {TACH_SEGMENT_INDICES.map((idx) => {
                  const segRatio = (idx + 1) / TACH_SEGMENTS;
                  const isLit = idx < activeTachSegments;
                  const isSweetZone = segRatio >= 0.72 && segRatio <= 0.9;
                  const isRedZone = segRatio > 0.9;

                  return (
                    <div
                      key={idx}
                      className={`flex-1 rounded-[1px] ${
                        isLit
                          ? isRedZone
                            ? 'bg-[var(--ff-pink)]'
                            : isSweetZone || isLugging
                              ? 'bg-[var(--ff-gold)]'
                              : 'bg-[var(--ff-mint)]'
                          : isSweetZone
                            ? 'border-b border-[#FFD166]/45 bg-[#241E19]'
                            : isRedZone
                              ? 'bg-[#2A1630]'
                              : 'bg-[var(--ff-panel)]'
                      }`}
                    />
                  );
                })}
              </div>

              {/* Continuous RPM Micro-Bar */}
              <div className="relative h-1 w-full overflow-hidden rounded-[1px] bg-[var(--ff-panel)]">
                <div
                  className="absolute inset-y-0 left-[72%] w-[18%] bg-[#FFD166]/30"
                  title="Beat-Shift Sweet Spot"
                />
                <div
                  className={`h-full w-full origin-left will-change-transform ${
                    rpm >= 0.92
                      ? 'bg-[var(--ff-pink)]'
                      : isLugging || rpm >= 0.72
                        ? 'bg-[var(--ff-gold)]'
                        : 'bg-[var(--ff-mint)]'
                  }`}
                  style={{ transform: `scaleX(${rpmPct / 100})` }}
                />
              </div>

              <div className="ff-mono flex items-center justify-between text-[9px] text-[var(--ff-muted)]">
                <span>{displayRpm.toLocaleString()} RPM</span>
                <span className="font-bold text-[var(--ff-gold)]">SHIFT BEAT</span>
              </div>
            </div>

            {/* Vertical Divider */}
            <div className="h-full w-px bg-[rgba(255,245,228,0.14)]" />

            {/* Module 2: Digital Speedometer */}
            <div className="space-y-1 text-right">
              <div className="relative inline-block ff-mono">
                <span
                  aria-hidden="true"
                  className="ff-display text-4xl leading-none font-black italic tracking-tight text-[#1A2140] select-none"
                >
                  888
                </span>
                <span className="ff-display absolute inset-0 text-4xl leading-none font-black italic tracking-tight text-[var(--ff-cream)]">
                  {String(speedKmh).padStart(3, '0')}
                </span>
              </div>

              <div className="flex items-center justify-end text-[10px] font-black tracking-[0.18em] text-[var(--ff-pink)]">
                KM/H
              </div>

              <div className="h-1.5 w-full overflow-hidden rounded-[2px] bg-[var(--ff-panel-hi)]">
                <div
                  className="h-full w-full origin-left will-change-transform"
                  style={{
                    background: 'linear-gradient(90deg, #2EE8C4, #FFD166, #FF3B7F)',
                    transform: `scaleX(${speedPct / 100})`,
                  }}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
});
