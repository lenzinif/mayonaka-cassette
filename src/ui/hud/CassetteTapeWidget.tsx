import type { GrooveTier } from '@src/entities/PlayerCar';
import { memo } from 'react';
import { CassetteReel } from '../walkman/WalkmanChrome';

export interface RadioPlaylistEntry {
  id: string;
  title: string;
  artist: string;
  bpm: number;
}

export interface CassetteTapeWidgetProps {
  trackTitle: string;
  barIndex: number;
  beatInBar: number;
  grooveTier: GrooveTier;
  roadBarIndex: number;
  totalBars: number;
  playlistIndex?: number;
  playlistItems?: readonly RadioPlaylistEntry[];
  stageAccentColor?: string;
  isSlack?: boolean;
  visible: boolean;
}

const TIER_TAPE_COLORS: Readonly<Record<GrooveTier, { tapeColor: string; reelAccent: string }>> = {
  LOW: { tapeColor: '#222944', reelAccent: '#8a93ad' },
  MEDIUM: { tapeColor: '#1b3545', reelAccent: '#2ee2be' },
  HIGH: { tapeColor: '#3b1e3c', reelAccent: '#ff3b6b' },
  OVERDRIVE: { tapeColor: '#4a3615', reelAccent: '#f5b94c' },
};

/**
 * Top-Left HUD Module: Minimal Cassette Window + Monochrome Theme Progress Bar + Adjacent Playlist
 * (`docs/UI.md §5.2.1`). Strictly read-only (`pointer-events-none`) with zero copy slop.
 */
export const CassetteTapeWidget = memo(function CassetteTapeWidget({
  trackTitle,
  barIndex,
  beatInBar,
  grooveTier,
  roadBarIndex,
  totalBars,
  playlistIndex = 0,
  playlistItems = [],
  stageAccentColor = '#00f0b5',
  isSlack = false,
  visible,
}: CassetteTapeWidgetProps) {
  if (!visible) return null;

  const config = TIER_TAPE_COLORS[grooveTier] ?? TIER_TAPE_COLORS.LOW;
  const songProgress = Math.max(0, Math.min(1, (roadBarIndex + 1) / Math.max(1, totalBars)));
  const leftPackScale = 0.92 - 0.48 * songProgress;
  const rightPackScale = 0.44 + 0.48 * songProgress;
  const baseRotation = (barIndex * 4 + beatInBar) * 90;

  const maxVisibleRows = 4;
  let startIdx = 0;
  if (playlistItems.length > maxVisibleRows) {
    startIdx = Math.max(
      0,
      Math.min(playlistItems.length - maxVisibleRows, playlistIndex - 1),
    );
  }
  const visibleTracks = playlistItems.slice(startIdx, startIdx + maxVisibleRows);

  return (
    <div className="pointer-events-none flex items-start gap-2.5 select-none [contain:layout_style_paint]">
      {/* Left: Compact Anodized Cassette + Monochrome Theme Progress Bar */}
      <div className="flex w-48 flex-col gap-1.5 sm:w-56">
        <div className="rounded-[3px] border border-white/20 bg-[#121622]/92 p-1.5 shadow-[0_8px_22px_rgba(3,5,12,0.7)]">
          <div className="mb-1 rounded-[1px] bg-[#1b2234] px-2 py-0.5 text-center">
            <div className="ff-mono truncate text-[10px] font-bold tracking-[0.1em] text-[#eef6ff] uppercase">
              {trackTitle}
            </div>
          </div>

          <div className="wm-window flex items-center justify-between gap-2 rounded-[2px] px-2.5 py-1.5">
            <CassetteReel
              size={34}
              angleDeg={baseRotation}
              packScale={leftPackScale}
              tapeColor={config.tapeColor}
              accentColor={config.reelAccent}
            />

            <div className="flex flex-1 flex-col items-center justify-center">
              {isSlack ? (
                <svg
                  className="h-3 w-full text-[var(--wm-play)]"
                  viewBox="0 0 100 12"
                  fill="none"
                  preserveAspectRatio="none"
                  aria-hidden="true"
                >
                  <path
                    d="M 0,6 Q 25,12 50,2 Q 75,12 100,6"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                  />
                </svg>
              ) : (
                <div className="h-3.5 w-10 rounded-[1px] border border-white/15 bg-[#0e1320]" />
              )}
            </div>

            <CassetteReel
              size={34}
              angleDeg={baseRotation}
              packScale={rightPackScale}
              tapeColor={config.tapeColor}
              accentColor={config.reelAccent}
            />
          </div>
        </div>

        {/* Strictly Monochrome Stage-Theme Progress Bar */}
        <div
          className="h-2 w-full overflow-hidden rounded-[2px] border border-white/20 bg-[#0b0e18]/92 p-[1px]"
          aria-label="Track progress"
        >
          <div
            className="h-full w-full origin-left rounded-[1px] will-change-transform"
            style={{
              backgroundColor: stageAccentColor,
              transform: `scaleX(${songProgress})`,
            }}
          />
        </div>
      </div>

      {/* Right Adjacent: Slim Read-Only Playlist */}
      {visibleTracks.length > 0 && (
        <div className="hidden w-48 rounded-[3px] border border-white/15 bg-[#0c101c]/88 px-2 py-1.5 shadow-[0_8px_22px_rgba(3,5,12,0.65)] sm:block">
          <ul className="ff-mono space-y-0.5 text-[10px]">
            {visibleTracks.map((entry, offset) => {
              const idx = startIdx + offset;
              const isActive = idx === playlistIndex;
              return (
                <li
                  key={`${entry.id}-${idx}`}
                  className="flex items-center justify-between gap-1.5 truncate px-1 py-[1px]"
                  style={{
                    color: isActive ? stageAccentColor : '#94a0c4',
                    fontWeight: isActive ? 800 : 500,
                  }}
                >
                  <span className="min-w-0 truncate uppercase">
                    {String(idx + 1).padStart(2, '0')} {entry.title}
                  </span>
                  {isActive && <span aria-hidden="true">◀</span>}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
});
