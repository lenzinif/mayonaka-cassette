import { GEAR_NUMBERS, MAX_GEAR } from '@src/entities/Gearbox';
import type { GrooveTier } from '@src/entities/PlayerCar';
import { memo } from 'react';
import '../cockpit/cockpit.css';

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
  LOW: 'bg-[#1c1a24] text-[#9e97aa]',
  MEDIUM: 'bg-[var(--ck-vfd-mint)] text-[#070b10]',
  HIGH: 'bg-[var(--ck-vfd-coral)] text-[#fff5e4]',
  OVERDRIVE: 'bg-[var(--ck-vfd-amber)] text-[#070b10]',
};

/**
 * 1980s JDM Luxury GT Hooded Leather Binnacle & VFD Digital Instrument Cluster.
 * Anchored at bottom-right (RHD driver side) with woodgrain fascia & satin brass bezel.
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
    <div className="flex origin-bottom-right scale-75 flex-col items-end gap-1.5 lg:scale-100 [contain:layout_style_paint]">
      {/* Sculpted Hooded JDM Dashboard Binnacle */}
      <div className="ck-dash-pad w-80 overflow-hidden rounded-t-[8px] rounded-b-[3px] sm:w-[360px]">
        {/* Stitched leather brow */}
        <div className="ck-stitch-top mx-2 mt-1 flex items-center justify-between pt-0.5 text-[7px] font-bold tracking-[0.22em] text-[var(--ck-brass)] uppercase">
          <span className="ff-mono opacity-80">DIGITAL COCKPIT</span>
          <span className="ff-mono opacity-80">GT-APEX · VFD</span>
        </div>

        {/* Recessed Smoked-Glass Instrument Well */}
        <div className="ck-vfd-well m-2 mt-1.5 space-y-2.5 rounded-[3px] p-2.5">
          {/* Upper Deck: Groove Meter */}
          <div className="space-y-1">
            <div className="flex items-center justify-between text-[10px] font-black tracking-[0.16em] uppercase">
              <div className="flex items-center gap-2">
                <span className="text-[#a89f96]">GROOVE</span>
                <span className="ff-mono text-xs text-[#fff5e4]">{groove}%</span>
              </div>
              <span className={`ff-mono rounded-[2px] px-1.5 py-[1px] text-[9px] font-black ${tierBadge}`}>
                {grooveTier}
              </span>
            </div>

            <div aria-hidden="true" className="flex h-2 w-full gap-0.5">
              {GROOVE_SEGMENTS.map((segIdx) => {
                const segPct = (segIdx / 24) * 100;
                const isActive = groove >= segPct;
                let activeColor = 'bg-[var(--ck-vfd-mint)]';
                if (segIdx >= 20) {
                  activeColor = 'bg-[var(--ck-vfd-amber)]';
                } else if (segIdx >= 12) {
                  activeColor = 'bg-[var(--ck-vfd-coral)]';
                }

                return (
                  <div
                    key={segIdx}
                    className={`flex-1 rounded-[1px] ${isActive ? activeColor : 'bg-[#171c26]'}`}
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
                  <span className="ff-display text-3xl leading-none font-black italic text-[var(--ck-vfd-mint)]">
                    {gear}
                  </span>
                  <span className="ff-mono text-[10px] font-bold text-[#a89f96]">
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
                            ? 'bg-[var(--ck-vfd-mint)] font-black text-[#070b10]'
                            : g < gear
                              ? 'bg-[#19202c] text-[#a89f96]'
                              : 'bg-[#11151e] text-[#6d768d]/50'
                        }`}
                      >
                        {g}
                      </span>
                    ))}
                  </div>
                  <button
                    type="button"
                    aria-pressed={autoShift}
                    aria-label="Toggle auto-shift"
                    onClick={(e) => {
                      onToggleAutoShift();
                      e.currentTarget.blur();
                    }}
                    className="ff-mono pointer-events-auto cursor-pointer rounded-[2px] border border-[rgba(217,167,92,0.38)] bg-[#19151e] px-1.5 py-0.5 text-[8px] font-bold text-[#fff5e4] transition hover:border-[var(--ck-brass)] hover:text-[var(--ck-vfd-amber)]"
                    title="Toggle Auto/Manual shifting [G]"
                  >
                    {autoShift ? 'AUTO' : 'MAN'}
                  </button>
                </div>
              </div>

              {/* Segmented Tachometer */}
              <div aria-hidden="true" className="flex h-2.5 w-full gap-0.5">
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
                            ? 'bg-[var(--ck-vfd-coral)]'
                            : isSweetZone || isLugging
                              ? 'bg-[var(--ck-vfd-amber)]'
                              : 'bg-[var(--ck-vfd-mint)]'
                          : isSweetZone
                            ? 'border-b border-[#ffbd4a]/45 bg-[#231d15]'
                            : isRedZone
                              ? 'bg-[#261423]'
                              : 'bg-[#121721]'
                      }`}
                    />
                  );
                })}
              </div>

              {/* Continuous RPM Micro-Bar */}
              <div className="relative h-1 w-full overflow-hidden rounded-[1px] bg-[#121721]">
                <div
                  className="absolute inset-y-0 left-[72%] w-[18%] bg-[#ffbd4a]/30"
                  title="Beat-Shift Sweet Spot"
                />
                <div
                  className={`h-full w-full origin-left will-change-transform ${
                    rpm >= 0.92
                      ? 'bg-[var(--ck-vfd-coral)]'
                      : isLugging || rpm >= 0.72
                        ? 'bg-[var(--ck-vfd-amber)]'
                        : 'bg-[var(--ck-vfd-mint)]'
                  }`}
                  style={{ transform: `scaleX(${rpmPct / 100})` }}
                />
              </div>

              <div className="ff-mono flex items-center justify-between text-[9px] text-[#a89f96]">
                <span>{displayRpm.toLocaleString()} RPM</span>
                <span className="font-bold text-[var(--ck-vfd-amber)]">SHIFT BEAT</span>
              </div>
            </div>

            {/* Vertical Divider */}
            <div className="h-full w-px bg-[rgba(217,167,92,0.2)]" />

            {/* Module 2: Digital Speedometer */}
            <div className="space-y-1 text-right">
              <div className="relative inline-block ff-mono">
                <span
                  aria-hidden="true"
                  className="ff-display text-4xl leading-none font-black italic tracking-tight text-[#161c28] select-none"
                >
                  888
                </span>
                <span className="ff-display absolute inset-0 text-4xl leading-none font-black italic tracking-tight text-[#fff5e4]">
                  {String(speedKmh).padStart(3, '0')}
                </span>
              </div>

              <div className="flex items-center justify-end text-[10px] font-black tracking-[0.18em] text-[var(--ck-vfd-amber)]">
                KM/H
              </div>

              <div className="h-1.5 w-full overflow-hidden rounded-[2px] bg-[#171c26]">
                <div
                  className="h-full w-full origin-left will-change-transform"
                  style={{
                    background: 'linear-gradient(90deg, #38f2c8, #ffbd4a, #ff4778)',
                    transform: `scaleX(${speedPct / 100})`,
                  }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Lower Woodgrain Fascia Trim */}
        <div className="ck-wood-trim h-[5px] w-full" />
      </div>
    </div>
  );
});
