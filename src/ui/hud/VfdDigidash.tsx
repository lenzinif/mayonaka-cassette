import type { GrooveTier } from '@src/entities/PlayerCar';
import { memo } from 'react';
import '../cockpit/cockpit.css';

export interface VfdDigidashProps {
  speedKmh: number;
  gear: number;
  rpm: number;
  groove?: number;
  grooveTier?: GrooveTier;
  isLugging: boolean;
  stageAccentColor?: string;
}

const TACH_SEGMENTS = 20;
const TACH_SEGMENT_INDICES = Array.from({ length: TACH_SEGMENTS }, (_, i) => i);

const TIER_SHORT_LABELS: Readonly<Record<GrooveTier, string>> = {
  LOW: 'LOW',
  MEDIUM: 'MED',
  HIGH: 'HIGH',
  OVERDRIVE: 'OVERDRIVE',
};

/**
 * Bottom-Left Digital Speedometer & Tachometer (`docs/UI.md §5.2.2`).
 * Strictly read-only (`pointer-events-none`) with bare VFD telemetry + Groove tier indicator.
 */
export const VfdDigidash = memo(function VfdDigidash({
  speedKmh,
  gear,
  rpm,
  groove = 0,
  grooveTier = 'LOW',
  isLugging,
  stageAccentColor = '#38f2c8',
}: VfdDigidashProps) {
  const activeTachSegments = Math.round(rpm * TACH_SEGMENTS);
  const clampedGroove = Math.max(0, Math.min(100, groove));
  const tierLabel = TIER_SHORT_LABELS[grooveTier] ?? 'LOW';

  return (
    <div className="pointer-events-none flex origin-bottom-left scale-85 flex-col items-start select-none sm:scale-100 [contain:layout_style_paint]">
      <div className="w-64 rounded-[4px] border border-white/20 bg-[#090d16]/92 p-2.5 shadow-[0_10px_28px_rgba(3,5,12,0.82)] sm:w-72">
        {/* Top: RPM Label + Segmented Sweeping Tachometer */}
        <div className="space-y-1">
          <div className="ff-mono text-[9px] font-bold tracking-[0.18em] text-[#8fa2bf] uppercase">
            RPM
          </div>
          <div aria-hidden="true" className="flex h-3 w-full items-end gap-[2px]">
            {TACH_SEGMENT_INDICES.map((idx) => {
              const segRatio = (idx + 1) / TACH_SEGMENTS;
              const isLit = idx < activeTachSegments;
              const isSweetZone = segRatio >= 0.72 && segRatio <= 0.88;
              const isRedZone = segRatio > 0.88;
              const barColor = isRedZone
                ? '#ff4778'
                : isSweetZone || isLugging
                  ? '#ffbd4a'
                  : stageAccentColor;

              return (
                <div
                  key={idx}
                  className="flex-1 rounded-t-[1px]"
                  style={{
                    height: `${52 + Math.round(segRatio * 48)}%`,
                    backgroundColor: isLit ? barColor : '#151c29',
                  }}
                />
              );
            })}
          </div>
        </div>

        {/* Middle: Digital Speedometer + Boxed Gear Readout */}
        <div className="mt-2 flex items-end justify-between gap-3">
          <div className="flex items-baseline gap-1.5">
            <div className="relative inline-block ff-mono">
              <span
                aria-hidden="true"
                className="ff-display text-4xl leading-none font-black italic tracking-tight text-[#141b29] select-none"
              >
                888
              </span>
              <span className="ff-display absolute inset-0 text-4xl leading-none font-black italic tracking-tight text-[#8bf5ff]">
                {String(speedKmh).padStart(3, '0')}
              </span>
            </div>
            <span className="ff-mono text-[10px] font-black tracking-[0.14em] text-[#9fb2c9]">
              KM/H
            </span>
          </div>

          <div className="flex h-10 w-10 items-center justify-center rounded-[3px] border border-[#ffbd4a]/70 bg-[#121622]">
            <span className="ff-display text-2xl leading-none font-black italic text-[#ffbd4a]">
              {gear}
            </span>
          </div>
        </div>

        {/* Bottom: Slim Monochrome Groove Bar + Tier Indicator */}
        <div className="mt-2 flex items-center gap-2">
          <span className="ff-mono shrink-0 text-[9px] font-bold tracking-[0.14em] text-[#8fa2bf] uppercase">
            GROOVE
          </span>
          <div className="h-2 flex-1 overflow-hidden rounded-[1px] border border-white/15 bg-[#121722] p-[1px]">
            <div
              className="h-full w-full origin-left will-change-transform"
              style={{
                backgroundColor: stageAccentColor,
                transform: `scaleX(${clampedGroove / 100})`,
              }}
            />
          </div>
          <span
            className="ff-mono shrink-0 text-[9px] font-black tracking-[0.1em] uppercase"
            style={{ color: stageAccentColor }}
          >
            {tierLabel}
          </span>
        </div>
      </div>
    </div>
  );
});
