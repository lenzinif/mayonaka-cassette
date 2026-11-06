import type { SectionRole } from '@src/audio/BeatMap';
import type { GrooveTier } from '@src/entities/PlayerCar';

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
      shellBg: string;
      shellGlow: string;
      typeLabel: string;
      typeBadge: string;
      tapeColor: string;
      accentColor: string;
      labelColor: string;
    }
  >
> = {
  LOW: {
    shellBorder: 'border-zinc-700/80',
    shellBg: 'bg-[#0c0914]/95',
    shellGlow: 'shadow-[0_0_15px_rgba(100,100,120,0.15)]',
    typeLabel: 'TYPE I // NORMAL WARMUP',
    typeBadge: 'border-zinc-600 bg-zinc-900/90 text-zinc-300',
    tapeColor: '#3a2e26',
    accentColor: 'text-zinc-400',
    labelColor: 'bg-zinc-200 text-zinc-900',
  },
  MEDIUM: {
    shellBorder: 'border-cyan-500/60',
    shellBg: 'bg-[#080d1a]/95',
    shellGlow: 'shadow-[0_0_20px_rgba(5,217,232,0.22)]',
    typeLabel: 'TYPE II // IN THE POCKET (CrO₂)',
    typeBadge: 'border-cyan-400/80 bg-cyan-950/90 text-cyan-200',
    tapeColor: '#1a3038',
    accentColor: 'text-cyan-400',
    labelColor: 'bg-cyan-100 text-slate-950',
  },
  HIGH: {
    shellBorder: 'border-fuchsia-500/70',
    shellBg: 'bg-[#150422]/95',
    shellGlow: 'shadow-[0_0_25px_rgba(255,42,109,0.28)]',
    typeLabel: 'TYPE IV // FUTURE FUNK FLOW',
    typeBadge: 'border-fuchsia-400/80 bg-fuchsia-950/90 text-fuchsia-200',
    tapeColor: '#42122c',
    accentColor: 'text-pink-400',
    labelColor: 'bg-fuchsia-100 text-slate-950',
  },
  SSS: {
    shellBorder: 'border-amber-400/90',
    shellBg: 'bg-[#1c1204]/96',
    shellGlow: 'shadow-[0_0_30px_rgba(251,191,36,0.38)]',
    typeLabel: 'SPECIAL // FUNKY OVERDRIVE',
    typeBadge: 'border-amber-300 bg-amber-950/90 text-amber-200 animate-pulse',
    tapeColor: '#523805',
    accentColor: 'text-amber-300',
    labelColor: 'bg-amber-100 text-amber-950',
  },
};

const SECTION_BADGE_STYLES: Readonly<Record<SectionRole, string>> = {
  intro: 'border-cyan-400/60 bg-cyan-950/85 text-cyan-200',
  build: 'border-amber-400/75 bg-amber-950/85 text-amber-200',
  drop: 'border-pink-400 bg-pink-600/90 text-white shadow-[0_0_10px_rgba(255,42,109,0.55)]',
  breakdown: 'border-fuchsia-400/60 bg-fuchsia-950/85 text-fuchsia-200',
  outro: 'border-emerald-400/60 bg-emerald-950/85 text-emerald-200',
};

/**
 * Authentic 1980s Japanese Compact Cassette Tape Widget (Groove & Music Telemetry).
 * Togglable via hotkey [C] or button click to ensure an unobstructed view of the road.
 */
export function CassetteTapeWidget({
  trackArtist,
  trackTitle,
  bpm,
  barIndex,
  beatInBar,
  sectionRole,
  barEnergy,
  filterCutoffHz,
  groove,
  grooveTier,
  tofuMode,
  roadBarIndex,
  totalBars,
  speedRatio,
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

  // Rotation angles for spools: derived from bar & beat + speed
  const baseRotation = (barIndex * 4 + beatInBar) * 90;

  if (!visible) {
    return (
      <div className="pointer-events-auto flex items-center gap-1.5 [contain:layout_style_paint]">
        <button
          type="button"
          onClick={onToggleVisible}
          className="cursor-pointer rounded border border-cyan-400/50 bg-[#0b011d]/90 px-2.5 py-1 text-[10px] font-bold tracking-widest text-cyan-200 shadow-[0_0_12px_rgba(5,217,232,0.25)] transition hover:border-pink-400 hover:text-pink-200"
          title="Mostra Cassette Tape [C]"
        >
          [C] ⏏ TAPE: {trackTitle.slice(0, 16)}…
        </button>
      </div>
    );
  }

  return (
    <div
      className={`pointer-events-auto relative flex w-[310px] sm:w-[340px] flex-col justify-between rounded-md border-2 ${config.shellBorder} ${config.shellBg} p-2 text-white shadow-xl transition-all duration-200 select-none [contain:layout_style_paint] ${config.shellGlow}`}
    >
      {/* Top Screws & Header Ribbon */}
      <div className="flex items-center justify-between border-b border-white/10 pb-1 text-[9px] tracking-wider uppercase">
        <div className="flex items-center gap-1.5 min-w-0">
          {/* Philips screw top-left */}
          <span className="inline-block h-2 w-2 rounded-full border border-zinc-500/70 bg-zinc-800 text-[6px] text-center leading-[8px] text-zinc-400">
            +
          </span>
          <span className="truncate font-black tracking-widest text-cyan-300">
            真夜中 CASSETTE C-90
          </span>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <span
            className={`rounded px-1.5 py-0.2 text-[8px] font-bold uppercase ${sectionBadgeStyle}`}
          >
            {sectionRole}
          </span>
          {tofuMode && (
            <span className="rounded border border-emerald-400/80 bg-emerald-950/90 px-1 py-0.2 text-[8px] font-bold text-emerald-300">
              TOFU ×2
            </span>
          )}
          <button
            type="button"
            onClick={onToggleVisible}
            className="cursor-pointer rounded border border-white/20 bg-black/40 px-1 py-0.2 text-[8px] text-zinc-300 transition hover:border-pink-400 hover:text-pink-200"
            title="Nascondi Cassetta [C]"
          >
            [C] ⏏
          </button>
        </div>
      </div>

      {/* Cassette Shell Body & Adhesive Paper Label */}
      <div className="relative my-1 rounded border border-white/15 bg-[#070212]/90 p-1.5">
        {/* Vintage Paper Label Stripe */}
        <div
          className={`flex items-center justify-between rounded-t-xs px-2 py-0.5 text-[9px] font-bold shadow-inner ${config.labelColor}`}
        >
          <div className="truncate font-mono">
            A ▷ {trackArtist} — {trackTitle}
            {playlistLength !== undefined && playlistLength > 1 && (
              <span className="ml-1.5 opacity-80 font-semibold tracking-tight">
                [TRK {playlistIndex !== undefined ? playlistIndex + 1 : 1}/{playlistLength}]
              </span>
            )}
          </div>
          <span className="shrink-0 text-[8px] font-mono tracking-tighter">
            DOLBY B·NR
          </span>
        </div>

        {/* Acrylic Tape Window (Clear Center Well) */}
        <div className="relative my-1.5 flex h-14 w-full items-center justify-between overflow-hidden rounded border border-zinc-700/80 bg-[#040108]/95 px-3">
          {/* Groove Status Watermark */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-15">
            <span className="text-[28px] font-black italic tracking-tighter text-white">
              MAYONAKA
            </span>
          </div>

          {/* Left Spool: Supply Reel */}
          <div className="relative z-1 flex flex-col items-center">
            {/* Dark magnetic tape pack ring around reel */}
            <div
              className="flex items-center justify-center rounded-full transition-all duration-100"
              style={{
                width: `${leftPackRadius * 2}px`,
                height: `${leftPackRadius * 2}px`,
                backgroundColor: config.tapeColor,
                boxShadow: 'inset 0 0 6px rgba(0,0,0,0.8)',
              }}
            >
              {/* White plastic 6-tooth reel hub */}
              <div
                className="flex h-5 w-5 items-center justify-center rounded-full border-2 border-zinc-200 bg-zinc-100 text-zinc-800 transition-transform duration-100"
                style={{ transform: `rotate(${baseRotation}deg)` }}
              >
                <div className="h-2 w-2 rounded-full border border-zinc-600 bg-zinc-300" />
              </div>
            </div>
          </div>

          {/* Center Tape Window Graticule & Groove Level Bar */}
          <div className="relative z-1 flex flex-1 flex-col items-center justify-center px-2">
            {/* Tape scale ticks (100 - 50 - 0) */}
            <div className="flex w-full justify-between text-[7px] font-mono text-zinc-500">
              <span>0</span>
              <span>50</span>
              <span>100</span>
            </div>

            {/* Magnetic Tape Ribbon or Slack Wave */}
            <div className="relative my-1 h-3 w-full">
              {isSlack ? (
                /* Animated Slack / Crinkled Tape when damaged or spilling */
                <svg
                  className="h-full w-full animate-bounce text-pink-500 drop-shadow-[0_0_6px_#ff2a6d]"
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
              ) : (
                /* Taut magnetic tape ribbon */
                <div className="relative h-full w-full flex items-center">
                  <div
                    className="h-1.5 w-full rounded-xs shadow-inner"
                    style={{ backgroundColor: config.tapeColor }}
                  />
                  {/* Glowing Groove flux bar inside the tape ribbon */}
                  <div
                    className="absolute inset-y-0.5 left-0 rounded-xs bg-gradient-to-r from-cyan-400 via-pink-500 to-amber-300 opacity-90 transition-all duration-100"
                    style={{ width: `${groove}%` }}
                  />
                </div>
              )}
            </div>

            {/* Groove Reading & State */}
            <div className="flex w-full items-center justify-between text-[8px] font-bold">
              <span className={`tabular-nums ${config.accentColor}`}>
                {isSlack ? '⚠ TAPE SLACK!' : `GROOVE ${groove}%`}
              </span>
              <span className="font-mono text-zinc-400">
                {bpm.toFixed(1)} BPM
              </span>
            </div>
          </div>

          {/* Right Spool: Take-up Reel */}
          <div className="relative z-1 flex flex-col items-center">
            {/* Dark magnetic tape pack ring around reel */}
            <div
              className="flex items-center justify-center rounded-full transition-all duration-100"
              style={{
                width: `${rightPackRadius * 2}px`,
                height: `${rightPackRadius * 2}px`,
                backgroundColor: config.tapeColor,
                boxShadow: 'inset 0 0 6px rgba(0,0,0,0.8)',
              }}
            >
              {/* White plastic 6-tooth reel hub */}
              <div
                className="flex h-5 w-5 items-center justify-center rounded-full border-2 border-zinc-200 bg-zinc-100 text-zinc-800 transition-transform duration-100"
                style={{ transform: `rotate(${baseRotation}deg)` }}
              >
                <div className="h-2 w-2 rounded-full border border-zinc-600 bg-zinc-300" />
              </div>
            </div>
          </div>
        </div>

        {/* Bottom Trapezoid: Tape Head Indentation & Guide Rollers */}
        <div className="flex items-center justify-between px-3 text-[8px] text-zinc-400 font-mono">
          <div className="flex items-center gap-1.5">
            {/* Tape Type Classification Badge */}
            <span
              className={`rounded border px-1 py-0.2 font-black tracking-wider ${config.typeBadge}`}
            >
              {config.typeLabel}
            </span>
          </div>

          {/* Audio Playback State */}
          <div className="flex items-center gap-1.5">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_4px_#10b981]" />
            <span className="font-bold text-emerald-300">
              {speedRatio > 0.05 ? '▶ PLAY' : '⏸ IDLE'}
            </span>
            <span className="text-zinc-500">|</span>
            <span className="text-cyan-300 tabular-nums">
              LPF {filterCutoffHz}Hz
            </span>
          </div>
        </div>
      </div>

      {/* Cassette Footer Strip: Bar Sequencer & Energy VU Meter */}
      <div className="mt-0.5 flex items-center justify-between border-t border-white/10 pt-1 text-[8px]">
        {/* 4-Step Beat Indicator */}
        <div className="flex items-center gap-1">
          <span className="text-zinc-400 font-bold">BEAT:</span>
          {[0, 1, 2, 3].map((b) => (
            <span
              key={b}
              className={`inline-block h-2 w-2 rounded-xs border text-[6px] font-bold text-center leading-[8px] ${
                beatInBar === b
                  ? b === 0
                    ? 'border-pink-300 bg-pink-500 text-white shadow-[0_0_6px_#ff2a6d]'
                    : 'border-cyan-200 bg-cyan-400 text-slate-950 shadow-[0_0_4px_#05d9e8]'
                  : 'border-zinc-700 bg-zinc-900 text-zinc-500'
              }`}
            >
              {b + 1}
            </span>
          ))}
          <span className="ml-1 text-zinc-400 font-mono">
            BAR {String(barIndex + 1).padStart(3, '0')}.{beatInBar + 1}
          </span>
        </div>

        {/* Mini 4-Bar VU Meter */}
        <div className="flex items-end gap-0.5 h-2.5" title="Tape Level VU Meter">
          {[0.3, 0.55, 0.8, 1.0].map((factor, idx) => {
            const heightPct = Math.max(
              20,
              Math.min(100, Math.round(barEnergy * factor * 100)),
            );
            const isPeak = idx === 3 && heightPct > 75;
            return (
              <span
                key={idx}
                className={`w-1 rounded-t-xs transition-all duration-75 ${
                  isPeak ? 'bg-pink-500 shadow-[0_0_4px_#ff2a6d]' : 'bg-cyan-400'
                }`}
                style={{ height: `${heightPct}%` }}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}
