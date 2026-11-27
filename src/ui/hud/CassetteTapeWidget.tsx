import type { SectionRole } from '@src/audio/BeatMap';
import type { GrooveTier } from '@src/entities/PlayerCar';
import { memo } from 'react';
import { CassetteReel, WalkmanLed, WalkmanScrew } from '../walkman/WalkmanChrome';

export interface CassetteTapeWidgetProps {
  trackArtist: string;
  trackTitle: string;
  bpm: number;
  barIndex: number;
  beatInBar: number;
  sectionRole: SectionRole;
  barEnergy: number;
  grooveTier: GrooveTier;
  tofuMode: boolean;
  roadBarIndex: number;
  totalBars: number;
  playlistIndex?: number;
  playlistLength?: number;
  isSlack?: boolean;
  visible: boolean;
  onToggleVisible: () => void;
}

const TIER_CASSETTE_CONFIG: Readonly<
  Record<
    GrooveTier,
    {
      shellBorder: string;
      typeLabel: string;
      gradeColor: string;
      tapeColor: string;
      reelAccent: string;
    }
  >
> = {
  LOW: {
    shellBorder: 'border-[rgba(244,239,230,0.2)]',
    typeLabel: 'NORMAL · TYPE I',
    gradeColor: 'text-[var(--wm-silk-dim)]',
    tapeColor: '#252c4d',
    reelAccent: '#8a93ad',
  },
  MEDIUM: {
    shellBorder: 'border-[rgba(46,226,190,0.52)]',
    typeLabel: 'CHROME · CrO₂',
    gradeColor: 'text-[var(--wm-mint)]',
    tapeColor: '#1c3645',
    reelAccent: '#2ee2be',
  },
  HIGH: {
    shellBorder: 'border-[rgba(255,59,107,0.6)]',
    typeLabel: 'METAL · TYPE IV',
    gradeColor: 'text-[var(--wm-play)]',
    tapeColor: '#3b1e3c',
    reelAccent: '#ff3b6b',
  },
  OVERDRIVE: {
    shellBorder: 'border-[var(--wm-amber)]',
    typeLabel: 'GOLD · OVERDRIVE',
    gradeColor: 'text-[var(--wm-amber)]',
    tapeColor: '#4a3615',
    reelAccent: '#f5b94c',
  },
};

const SECTION_BADGE_STYLES: Readonly<Record<SectionRole, string>> = {
  intro: 'bg-[#131622] text-[#f4efe6]',
  build: 'bg-[#f5b94c] text-[#131622]',
  groove: 'bg-[#05d9e8] text-[#090b12]',
  drop: 'bg-[#ff3b6b] text-[#f4efe6]',
  breakdown: 'bg-[#2ee2be] text-[#090b12]',
  outro: 'bg-[#1f2436] text-[#f4efe6]',
};

/**
 * Compact Flat Matte Walkman Cassette Door Widget.
 * Togglable via hotkey [C] or button click for an unobstructed road view.
 */
export const CassetteTapeWidget = memo(function CassetteTapeWidget({
  trackArtist,
  trackTitle,
  bpm,
  barIndex,
  beatInBar,
  sectionRole,
  barEnergy,
  grooveTier,
  tofuMode,
  roadBarIndex,
  totalBars,
  playlistIndex,
  playlistLength,
  isSlack = false,
  visible,
  onToggleVisible,
}: CassetteTapeWidgetProps) {
  const config = TIER_CASSETTE_CONFIG[grooveTier] ?? TIER_CASSETTE_CONFIG.LOW;
  const sectionBadgeStyle = SECTION_BADGE_STYLES[sectionRole] ?? SECTION_BADGE_STYLES.intro;

  const songProgress = Math.max(0, Math.min(1, (roadBarIndex + 1) / Math.max(1, totalBars)));

  const minPackRadius = 8;
  const maxPackRadius = 24;
  const leftPackRadius = maxPackRadius - (maxPackRadius - minPackRadius) * songProgress;
  const rightPackRadius = minPackRadius + (maxPackRadius - minPackRadius) * songProgress;

  const baseRotation = (barIndex * 4 + beatInBar) * 90;

  if (!visible) {
    return (
      <div className="pointer-events-auto flex items-center gap-1.5 [contain:layout_style_paint]">
        <button
          type="button"
          onClick={(e) => {
            onToggleVisible();
            e.currentTarget.blur();
          }}
          className="wm-btn ff-mono flex cursor-pointer items-center gap-2 px-2.5 py-1 text-[10px] font-bold tracking-wider text-[var(--wm-silk)] uppercase hover:text-[var(--wm-mint)]"
          title="Show cassette [C]"
        >
          <WalkmanLed lit color="mint" />
          <span>⏏ {trackTitle.slice(0, 18)} [C]</span>
        </button>
      </div>
    );
  }

  return (
    <div
      className={`wm-shell wm-faceplate pointer-events-none relative flex w-72 origin-top-left scale-85 flex-col overflow-hidden text-[var(--wm-silk)] select-none sm:w-80 sm:scale-100 [contain:layout_style_paint] ${config.shellBorder}`}
    >
      {/* Micro Anodized Bezel Strip */}
      <div className="flex items-center justify-between bg-[#171b2a] px-2 py-0.5">
        <WalkmanScrew />
        <span className="ff-mono text-[7px] font-bold tracking-[0.26em] text-[var(--wm-silk-dim)] uppercase">
          WM-86 · STEREO CASSETTE
        </span>
        <WalkmanScrew />
      </div>

      {/* Ruled Paper Cassette Label */}
      <div className="wm-paper-label flex items-center justify-between gap-2 px-2.5 py-1 text-[10px] font-black text-[#131622]">
        <div className="min-w-0 truncate">
          <span>
            A ▷ {trackArtist} — {trackTitle}
          </span>
          {playlistLength !== undefined && playlistLength > 1 && (
            <span className="ff-mono ml-1.5 text-[9px] font-bold opacity-75">
              [{playlistIndex !== undefined ? playlistIndex + 1 : 1}/{playlistLength}]
            </span>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-1">
          {tofuMode && (
            <span className="rounded-[1px] bg-[#131622] px-1.5 py-[1px] text-[8px] font-black text-[var(--wm-mint)] uppercase">
              TOFU ×2
            </span>
          )}
          <span
            className={`ff-mono rounded-[1px] px-1.5 py-[1px] text-[8px] font-black uppercase ${sectionBadgeStyle}`}
          >
            {sectionRole}
          </span>
          <button
            type="button"
            onClick={(e) => {
              onToggleVisible();
              e.currentTarget.blur();
            }}
            aria-label="Hide cassette"
            className="pointer-events-auto cursor-pointer rounded-[1px] border border-[#131622]/35 px-1 py-[1px] text-[9px] font-black text-[#131622] transition hover:bg-[var(--wm-play)] hover:text-[var(--wm-silk)]"
            title="Hide cassette [C]"
          >
            ⏏
          </button>
        </div>
      </div>

      <div className="wm-accent-strip" />

      {/* Smoked-Acrylic Cassette Window */}
      <div className="p-1.5">
        <div className="wm-window flex items-center justify-between gap-2 rounded-[2px] px-2.5 py-2">
          <CassetteReel
            size={38}
            angleDeg={baseRotation}
            packScale={(leftPackRadius * 2) / 48}
            tapeColor={config.tapeColor}
            accentColor={config.reelAccent}
          />

          <div className="min-w-0 flex-1 space-y-1.5">
            <div className="ff-mono flex items-center justify-between text-[9px] font-bold">
              <span className={`truncate ${config.gradeColor}`}>{config.typeLabel}</span>
              <span className="shrink-0 text-[var(--wm-silk-dim)]">{bpm.toFixed(1)} BPM</span>
            </div>

            {isSlack ? (
              <div className="flex items-center gap-1.5">
                <svg
                  className="h-2.5 flex-1 text-[var(--wm-play)]"
                  viewBox="0 0 100 12"
                  fill="none"
                  preserveAspectRatio="none"
                >
                  <path
                    d="M 0,6 Q 25,12 50,2 Q 75,12 100,6"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                  />
                </svg>
                <span className="ff-mono shrink-0 text-[8px] font-black text-[var(--wm-play)] uppercase">
                  TAPE SLACK
                </span>
              </div>
            ) : (
              <div className="wm-lcd relative h-2 w-full overflow-hidden rounded-[1px] p-[1px]">
                <div
                  className="wm-accent-strip h-full w-full origin-left will-change-transform"
                  style={{ transform: `scaleX(${songProgress})` }}
                />
              </div>
            )}

            {/* 4-Beat Pips, Bar Counter, Mini VU */}
            <div className="wm-lcd ff-mono flex items-center justify-between gap-2 rounded-[1px] px-1.5 py-0.5 text-[9px]">
              <div className="flex items-center gap-1">
                {[0, 1, 2, 3].map((b) => (
                  <span
                    key={b}
                    className={`inline-block h-1.5 w-2.5 rounded-[1px] ${
                      beatInBar === b
                        ? b === 0
                          ? 'bg-[var(--wm-play)]'
                          : 'bg-[var(--wm-mint)]'
                        : 'bg-[#1e253d]'
                    }`}
                  />
                ))}
              </div>

              <div className="flex items-center gap-1.5">
                <span className="font-bold text-[var(--wm-silk)]">
                  BAR {String(barIndex + 1).padStart(3, '0')}.{beatInBar + 1}
                </span>
                <div className="flex h-2.5 items-end gap-0.5" title="Tape level">
                  {[0.3, 0.55, 0.8, 1.0].map((factor, idx) => {
                    const ratio = Math.max(0.2, Math.min(1, barEnergy * factor));
                    const isPeak = idx === 3 && ratio > 0.75;
                    return (
                      <span
                        key={idx}
                        className={`h-full w-1 origin-bottom rounded-t-[1px] will-change-transform ${
                          isPeak ? 'bg-[var(--wm-play)]' : 'bg-[var(--wm-mint)]'
                        }`}
                        style={{ transform: `scaleY(${ratio})` }}
                      />
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          <CassetteReel
            size={38}
            angleDeg={baseRotation}
            packScale={(rightPackRadius * 2) / 48}
            tapeColor={config.tapeColor}
            accentColor={config.reelAccent}
          />
        </div>
      </div>
    </div>
  );
});
