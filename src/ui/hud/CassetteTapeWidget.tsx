import type { SectionRole } from '@src/audio/BeatMap';
import type { GrooveTier } from '@src/entities/PlayerCar';
import { memo } from 'react';

export interface CassetteTapeWidgetProps {
  trackArtist: string;
  trackTitle: string;
  bpm: number;
  barIndex: number;
  beatInBar: number;
  sectionRole: SectionRole;
  barEnergy: number;
  filterCutoffHz: number;
  groove: number;
  grooveTier: GrooveTier;
  tofuMode: boolean;
  roadBarIndex: number;
  totalBars: number;
  speedRatio: number;
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
    }
  >
> = {
  LOW: {
    shellBorder: 'border-[rgba(255,245,228,0.26)]',
    typeLabel: 'NORMAL · TYPE I',
    gradeColor: 'text-[var(--ff-muted)]',
    tapeColor: '#252C4D',
  },
  MEDIUM: {
    shellBorder: 'border-[rgba(46,232,196,0.55)]',
    typeLabel: 'CHROME · CrO₂',
    gradeColor: 'text-[var(--ff-mint)]',
    tapeColor: '#1C3645',
  },
  HIGH: {
    shellBorder: 'border-[rgba(255,59,127,0.6)]',
    typeLabel: 'METAL · TYPE IV',
    gradeColor: 'text-[var(--ff-pink)]',
    tapeColor: '#3B1E3C',
  },
  OVERDRIVE: {
    shellBorder: 'border-[var(--ff-gold)]',
    typeLabel: 'GOLD · OVERDRIVE',
    gradeColor: 'text-[var(--ff-gold)]',
    tapeColor: '#4A3615',
  },
};

const SECTION_BADGE_STYLES: Readonly<Record<SectionRole, string>> = {
  intro: 'bg-[#0B0E1E] text-[#FFF5E4]',
  build: 'bg-[#FFD166] text-[#0B0E1E]',
  groove: 'bg-[#05D9E8] text-[#0B0E1E]',
  drop: 'bg-[#FF3B7F] text-[#FFF5E4]',
  breakdown: 'bg-[#2EE8C4] text-[#0B0E1E]',
  outro: 'bg-[#1A2140] text-[#FFF5E4]',
};

/**
 * Compact Japanese Compact Cassette Widget (Mayonaka Hi-Fi Palette).
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

  // Song tape progress: ratio [0..1]
  const songProgress = Math.max(0, Math.min(1, (roadBarIndex + 1) / Math.max(1, totalBars)));

  // Left spool tape pack decreases from 24px down to 8px; Right spool increases from 8px to 24px
  const minPackRadius = 8;
  const maxPackRadius = 24;
  const leftPackRadius = maxPackRadius - (maxPackRadius - minPackRadius) * songProgress;
  const rightPackRadius = minPackRadius + (maxPackRadius - minPackRadius) * songProgress;

  // Rotation angles for spools: derived from bar & beat
  const baseRotation = (barIndex * 4 + beatInBar) * 90;

  if (!visible) {
    return (
      <div className="pointer-events-auto flex items-center gap-1.5 [contain:layout_style_paint]">
        <button
          type="button"
          onClick={onToggleVisible}
          className="ff-shadow-ink ff-mono cursor-pointer rounded-[2px] border border-[rgba(255,245,228,0.26)] bg-[#12172E]/92 px-2.5 py-1 text-[10px] font-bold tracking-wider text-[var(--ff-cream)] uppercase transition hover:border-[var(--ff-mint)] hover:text-[var(--ff-mint)]"
          title="Show cassette [C]"
        >
          ⏏ {trackTitle.slice(0, 18)} [C]
        </button>
      </div>
    );
  }

  return (
    <div
      className={`ff-shadow-ink pointer-events-auto relative flex w-72 origin-top-left scale-85 flex-col overflow-hidden rounded-[2px] border-2 bg-[#12172E]/94 text-[var(--ff-cream)] select-none sm:w-80 sm:scale-100 [contain:layout_style_paint] ${config.shellBorder}`}
    >
      {/* Cream J-Card Adhesive Top Label */}
      <div className="flex items-center justify-between gap-2 bg-[var(--ff-cream)] px-2.5 py-1 text-[10px] font-black text-[var(--ff-ink)]">
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
            <span className="rounded-[2px] bg-[#0B0E1E] px-1.5 py-[1px] text-[8px] font-black text-[var(--ff-mint)] uppercase">
              TOFU ×2
            </span>
          )}
          <span
            className={`ff-mono rounded-[2px] px-1.5 py-[1px] text-[8px] font-black uppercase ${sectionBadgeStyle}`}
          >
            {sectionRole}
          </span>
          <button
            type="button"
            onClick={onToggleVisible}
            className="cursor-pointer rounded-[2px] border border-[#0B0E1E]/30 px-1 py-[1px] text-[9px] font-black text-[var(--ff-ink)] transition hover:bg-[var(--ff-pink)] hover:text-[var(--ff-cream)]"
            title="Hide cassette [C]"
          >
            ⏏
          </button>
        </div>
      </div>

      {/* 3-Stripe Obi Divider */}
      <div className="ff-obi-h h-[3px] w-full" />

      {/* Acrylic Tape Window */}
      <div className="flex items-center justify-between gap-2.5 bg-[#0B0E1E]/90 px-3 py-2">
        {/* Left Spool: Supply Reel */}
        <div className="relative flex h-10 w-10 shrink-0 items-center justify-center">
          <div
            className="absolute inset-0 rounded-full border border-[rgba(255,245,228,0.2)] will-change-transform"
            style={{
              backgroundColor: config.tapeColor,
              transform: `scale(${(leftPackRadius * 2) / 48})`,
            }}
          />
          <div
            className="relative z-1 flex h-5 w-5 items-center justify-center rounded-full border-2 border-[var(--ff-cream)] bg-[var(--ff-cream)] will-change-transform"
            style={{ transform: `rotate(${baseRotation}deg)` }}
          >
            <div className="h-2 w-2 rounded-full bg-[var(--ff-ink)]" />
          </div>
        </div>

        {/* Center Tape Progress & Beat Sequencer */}
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="ff-mono flex items-center justify-between text-[9px] font-bold">
            <span className={`truncate ${config.gradeColor}`}>{config.typeLabel}</span>
            <span className="shrink-0 text-[var(--ff-muted)]">{bpm.toFixed(1)} BPM</span>
          </div>

          {isSlack ? (
            <div className="flex items-center gap-1.5">
              <svg
                className="h-2.5 flex-1 text-[var(--ff-pink)]"
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
              <span className="ff-mono shrink-0 text-[8px] font-black text-[var(--ff-pink)] uppercase">
                TAPE SLACK
              </span>
            </div>
          ) : (
            <div className="relative h-2 w-full overflow-hidden rounded-[2px] bg-[var(--ff-panel-hi)]">
              <div
                className="ff-obi-h h-full w-full origin-left will-change-transform"
                style={{ transform: `scaleX(${songProgress})` }}
              />
            </div>
          )}

          {/* 4-Beat Pips, Bar Counter, Mini VU */}
          <div className="ff-mono flex items-center justify-between gap-2 text-[9px]">
            <div className="flex items-center gap-1">
              {[0, 1, 2, 3].map((b) => (
                <span
                  key={b}
                  className={`inline-block h-2 w-3 rounded-[2px] ${
                    beatInBar === b
                      ? b === 0
                        ? 'bg-[var(--ff-pink)]'
                        : 'bg-[var(--ff-mint)]'
                      : 'bg-[#1E2749]'
                  }`}
                />
              ))}
            </div>

            <div className="flex items-center gap-2">
              <span className="font-bold text-[var(--ff-cream)]">
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
                        isPeak ? 'bg-[var(--ff-pink)]' : 'bg-[var(--ff-mint)]'
                      }`}
                      style={{ transform: `scaleY(${ratio})` }}
                    />
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* Right Spool: Take-up Reel */}
        <div className="relative flex h-10 w-10 shrink-0 items-center justify-center">
          <div
            className="absolute inset-0 rounded-full border border-[rgba(255,245,228,0.2)] will-change-transform"
            style={{
              backgroundColor: config.tapeColor,
              transform: `scale(${(rightPackRadius * 2) / 48})`,
            }}
          />
          <div
            className="relative z-1 flex h-5 w-5 items-center justify-center rounded-full border-2 border-[var(--ff-cream)] bg-[var(--ff-cream)] will-change-transform"
            style={{ transform: `rotate(${baseRotation}deg)` }}
          >
            <div className="h-2 w-2 rounded-full bg-[var(--ff-ink)]" />
          </div>
        </div>
      </div>
    </div>
  );
});
