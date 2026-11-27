import { memo, useState } from 'react';
import './cockpit.css';

export interface RadioPlaylistEntry {
  id: string;
  title: string;
  artist: string;
  bpm: number;
}

export interface RadioConsoleProps {
  items: readonly RadioPlaylistEntry[];
  activeIndex: number;
  trackTitle: string;
  trackArtist: string;
  bpm: number;
  tofuMode: boolean;
  onPrevTrack?: () => void;
  onNextTrack?: () => void;
  onSelectIndex?: (index: number) => void;
  onOpenDeck: () => void;
}

/**
 * Diegetic 80s JDM Luxury GT 1.5-DIN Playlist Autoradio Console.
 * Sits on the lower-left dashboard fascia and shifts clear of the Tofu cup shelf when active.
 */
export const RadioConsole = memo(function RadioConsole({
  items,
  activeIndex,
  trackTitle,
  trackArtist,
  bpm,
  tofuMode,
  onPrevTrack,
  onNextTrack,
  onSelectIndex,
  onOpenDeck,
}: RadioConsoleProps) {
  const [queueOpen, setQueueOpen] = useState(true);
  const total = Math.max(1, items.length);
  const safeIndex = Math.max(0, Math.min(total - 1, activeIndex));
  const nextEntry = items.length > 1 ? items[(safeIndex + 1) % items.length] : undefined;

  return (
    <div
      className={`pointer-events-none flex origin-bottom-left scale-75 flex-col lg:scale-100 [contain:layout_style_paint] [transform:translateZ(0)] ${
        tofuMode ? 'mb-24 ml-0 md:absolute md:bottom-0 md:left-[21.5%] md:mb-0' : ''
      }`}
    >
      <div className="ck-din-shell w-56 overflow-hidden rounded-t-[4px] rounded-b-[2px] text-[#f4ead8] lg:w-60">
        {/* Warm woodgrain + satin brass upper trim */}
        <div className="ck-wood-trim flex items-center justify-between px-2.5 py-0.5">
          <div className="flex items-center gap-1.5">
            <span
              aria-hidden="true"
              className="inline-block h-1.5 w-1.5 rounded-full bg-[var(--ck-vfd-amber)] shadow-[0_0_5px_rgba(255,189,74,0.8)]"
            />
            <span className="ff-mono text-[8px] font-black tracking-[0.2em] text-[#f6dec0] uppercase">
              88.4 FM · DIN TUNER
            </span>
          </div>
          <span className="ff-mono text-[8px] font-bold text-[var(--ck-brass)]">
            CH {String(safeIndex + 1).padStart(2, '0')}/{String(total).padStart(2, '0')}
          </span>
        </div>

        <div className="space-y-1.5 p-2">
          {/* Recessed Amber/Mint VFD Head-Unit Display */}
          <div className="ck-vfd-well rounded-[2px] px-2 py-1.5">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0 truncate text-[10px] font-extrabold tracking-tight text-[var(--ck-vfd-amber)]">
                {trackArtist} — {trackTitle}
              </div>
              <span className="ff-mono shrink-0 text-[9px] font-bold text-[var(--ck-vfd-mint)]">
                {bpm.toFixed(0)} BPM
              </span>
            </div>

            <div className="ff-mono mt-0.5 flex items-center justify-between gap-2 text-[8px] text-[#9fb2b8]">
              <span className="truncate">
                {nextEntry ? `NEXT: ${nextEntry.title}` : 'SINGLE CASSETTE'}
              </span>
              <span className="shrink-0 text-[var(--ck-brass)]">STEREO</span>
            </div>
          </div>

          {/* Compact Scrollable Playlist Strip */}
          {queueOpen && items.length > 0 && (
            <div
              role="region"
              aria-label="Playlist tracks"
              className="ck-vfd-well ff-scroll pointer-events-auto max-h-[54px] divide-y divide-[rgba(217,167,92,0.12)] overflow-y-auto rounded-[2px]"
            >
              {items.map((entry, idx) => {
                const isActive = idx === safeIndex;
                return (
                  <button
                    key={`${entry.id}-${idx}`}
                    type="button"
                    aria-current={isActive ? 'true' : undefined}
                    onClick={(e) => {
                      if (!isActive) {
                        onSelectIndex?.(idx);
                      }
                      e.currentTarget.blur();
                    }}
                    className={`ff-mono flex w-full cursor-pointer items-center justify-between gap-1.5 px-2 py-[3px] text-left text-[9px] transition-colors ${
                      isActive
                        ? 'bg-[rgba(56,242,200,0.12)] font-bold text-[var(--ck-vfd-mint)]'
                        : 'text-[#bfb7ac] hover:bg-[rgba(217,167,92,0.1)] hover:text-[#f4ead8]'
                    }`}
                  >
                    <span className="min-w-0 truncate">
                      {isActive ? '▶ ' : `${String(idx + 1).padStart(2, '0')} `}
                      {entry.title}
                    </span>
                    <span className="shrink-0 text-[8px] opacity-75">
                      {Math.round(entry.bpm)}
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          {/* Tactile Physical DIN Faceplate Buttons */}
          <div className="pointer-events-auto grid grid-cols-4 gap-1">
            <button
              type="button"
              disabled={items.length <= 1}
              aria-label="Previous track"
              onClick={(e) => {
                onPrevTrack?.();
                e.currentTarget.blur();
              }}
              className="ck-din-btn ff-mono cursor-pointer py-1 text-[9px] font-black disabled:cursor-default disabled:opacity-40"
              title="Previous track in playlist"
            >
              <span aria-hidden="true">⏮ </span>PREV
            </button>
            <button
              type="button"
              disabled={items.length <= 1}
              aria-label="Next track"
              onClick={(e) => {
                onNextTrack?.();
                e.currentTarget.blur();
              }}
              className="ck-din-btn ff-mono cursor-pointer py-1 text-[9px] font-black disabled:cursor-default disabled:opacity-40"
              title="Next track in playlist"
            >
              NEXT<span aria-hidden="true"> ⏭</span>
            </button>
            <button
              type="button"
              aria-expanded={queueOpen}
              aria-label="Toggle playlist drawer"
              onClick={(e) => {
                setQueueOpen((prev) => !prev);
                e.currentTarget.blur();
              }}
              className="ck-din-btn ff-mono cursor-pointer py-1 text-[9px] font-bold uppercase"
              title="Toggle playlist drawer"
            >
              <span aria-hidden="true">{queueOpen ? '▾ ' : '▸ '}</span>LIST
            </button>
            <button
              type="button"
              aria-label="Open Cassette Deck"
              onClick={(e) => {
                onOpenDeck();
                e.currentTarget.blur();
              }}
              className="ck-din-btn ff-mono cursor-pointer py-1 text-[9px] font-black text-[var(--ck-vfd-amber)] uppercase"
              title="Open Cassette Deck [M]"
            >
              <span aria-hidden="true">⏏ </span>[M]
            </button>
          </div>
        </div>
      </div>
    </div>
  );
});
