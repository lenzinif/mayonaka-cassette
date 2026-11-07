import { SODA_SKIN_LABELS, type SodaSkin } from '@src/entities/MelonSoda';

export interface QuickOptionsModalProps {
  open: boolean;
  onClose: () => void;
  autoShift: boolean;
  onToggleAutoShift: () => void;
  tofuMode: boolean;
  onToggleTofuMode: () => void;
  sodaSkin: SodaSkin;
  onCycleSodaSkin: () => void;
  cleanHud: boolean;
  onToggleCleanHud: () => void;
  crtEnabled: boolean;
  onToggleCrt: () => void;
}

/**
 * 1980s Retro Arcade Settings & Options Modal.
 * Allows live configuration of rhythm driving assist, Tofu Mode, Melon Soda skin, and visual filters.
 */
export function QuickOptionsModal({
  open,
  onClose,
  autoShift,
  onToggleAutoShift,
  tofuMode,
  onToggleTofuMode,
  sodaSkin,
  onCycleSodaSkin,
  cleanHud,
  onToggleCleanHud,
  crtEnabled,
  onToggleCrt,
}: QuickOptionsModalProps) {
  if (!open) return null;

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="pointer-events-auto fixed inset-0 z-50 flex items-center justify-center bg-[#060112]/94 p-4 font-mono text-white backdrop-blur-xs select-none"
      role="dialog"
      aria-modal="true"
      aria-label="Options &amp; Settings"
    >
      <div
        className="relative flex flex-col w-full max-w-md max-h-[88vh] overflow-hidden rounded-lg border-2 border-pink-500/70 bg-[#0d0221]/98 shadow-[0_0_50px_rgba(255,42,109,0.4)]"
        style={{ colorScheme: 'dark' }}
      >
        {/* Top Header Marquee */}
        <div className="flex items-center justify-between border-b border-fuchsia-500/30 bg-[#160435] px-4 py-2.5 text-[10px] tracking-[0.25em] text-cyan-300 uppercase">
          <span>OUTRUN FM // SYSTEM SETTINGS</span>
          <button
            type="button"
            onClick={onClose}
            className="cursor-pointer text-pink-400 hover:text-white transition"
          >
            [✕ CLOSE]
          </button>
        </div>

        {/* Options Body */}
        <div
          className="flex-1 overflow-y-auto p-5 space-y-4 text-xs"
          style={{ scrollbarColor: '#e879f9 #1a0633', scrollbarWidth: 'thin' }}
        >
          {/* Audio & Rhythm Driving */}
          <div>
            <div className="text-[10px] font-bold tracking-widest text-fuchsia-300/80 uppercase">
              RHYTHM &amp; DRIVING ASSIST
            </div>
            <div className="mt-2 space-y-2">
              <button
                type="button"
                onClick={onToggleAutoShift}
                className={`flex w-full cursor-pointer items-center justify-between rounded border p-2.5 transition ${
                  autoShift
                    ? 'border-cyan-400 bg-cyan-950/50 text-cyan-200 shadow-[0_0_12px_rgba(5,217,232,0.3)]'
                    : 'border-fuchsia-500/30 bg-[#160530]/60 text-fuchsia-200 hover:border-cyan-400'
                }`}
              >
                <div className="text-left">
                  <div className="font-bold">AUTO-SHIFT ASSIST [G]</div>
                  <div className="text-[10px] text-fuchsia-300/60">
                    {autoShift ? 'Automatic gear shifts timed to downbeats' : 'Manual shifts via [Q]/[E] or bumpers'}
                  </div>
                </div>
                <div className={`font-bold px-2 py-0.5 rounded text-[10px] ${autoShift ? 'bg-cyan-400 text-black' : 'bg-[#250840] text-fuchsia-300'}`}>
                  {autoShift ? 'ENABLED' : 'MANUAL'}
                </div>
              </button>

              <button
                type="button"
                onClick={onToggleTofuMode}
                className={`flex w-full cursor-pointer items-center justify-between rounded border p-2.5 transition ${
                  tofuMode
                    ? 'border-emerald-400 bg-emerald-950/50 text-emerald-200 shadow-[0_0_12px_rgba(16,185,129,0.3)]'
                    : 'border-fuchsia-500/30 bg-[#160530]/60 text-fuchsia-200 hover:border-emerald-400'
                }`}
              >
                <div className="text-left">
                  <div className="font-bold">TOFU MODE (×2 GROOVE) [T]</div>
                  <div className="text-[10px] text-fuchsia-300/60">
                    {tofuMode ? 'Active: Double Groove, but jerky driving spills soda' : 'Disabled: Relaxed driving physics'}
                  </div>
                </div>
                <div className={`font-bold px-2 py-0.5 rounded text-[10px] ${tofuMode ? 'bg-emerald-400 text-black' : 'bg-[#250840] text-fuchsia-300'}`}>
                  {tofuMode ? 'ON (×2)' : 'OFF'}
                </div>
              </button>
            </div>
          </div>

          {/* Dashboard Customization */}
          <div className="border-t border-fuchsia-500/25 pt-3">
            <div className="text-[10px] font-bold tracking-widest text-fuchsia-300/80 uppercase">
              DASHBOARD CUSTOMIZATION
            </div>
            <div className="mt-2 space-y-2">
              <button
                type="button"
                onClick={onCycleSodaSkin}
                className="flex w-full cursor-pointer items-center justify-between rounded border border-amber-400/40 bg-[#1a0f05]/60 p-2.5 transition hover:border-amber-300"
              >
                <div className="text-left">
                  <div className="font-bold text-amber-200">CUP HOLDER SKIN [V]</div>
                  <div className="text-[10px] text-amber-300/60">
                    Click to cycle soda varieties
                  </div>
                </div>
                <div className="font-bold px-2 py-0.5 rounded text-[10px] bg-amber-400/20 text-amber-300 border border-amber-400/40">
                  {SODA_SKIN_LABELS[sodaSkin]}
                </div>
              </button>
            </div>
          </div>

          {/* Visual Presentation */}
          <div className="border-t border-fuchsia-500/25 pt-3">
            <div className="text-[10px] font-bold tracking-widest text-fuchsia-300/80 uppercase">
              DISPLAY &amp; HUD
            </div>
            <div className="mt-2 space-y-2">
              <button
                type="button"
                onClick={onToggleCrt}
                className={`flex w-full cursor-pointer items-center justify-between rounded border p-2.5 transition ${
                  crtEnabled
                    ? 'border-pink-400 bg-pink-950/50 text-pink-200 shadow-[0_0_12px_rgba(255,42,109,0.3)]'
                    : 'border-fuchsia-500/30 bg-[#160530]/60 text-fuchsia-200 hover:border-pink-400'
                }`}
              >
                <div className="text-left">
                  <div className="font-bold">CRT SCANLINES &amp; VHS VIGNETTE</div>
                  <div className="text-[10px] text-fuchsia-300/60">
                    Phosphor scanline overlay
                  </div>
                </div>
                <div className={`font-bold px-2 py-0.5 rounded text-[10px] ${crtEnabled ? 'bg-pink-500 text-white' : 'bg-[#250840] text-fuchsia-300'}`}>
                  {crtEnabled ? 'ON' : 'OFF'}
                </div>
              </button>

              <button
                type="button"
                onClick={onToggleCleanHud}
                className={`flex w-full cursor-pointer items-center justify-between rounded border p-2.5 transition ${
                  cleanHud
                    ? 'border-cyan-400 bg-cyan-950/50 text-cyan-200 shadow-[0_0_12px_rgba(5,217,232,0.3)]'
                    : 'border-fuchsia-500/30 bg-[#160530]/60 text-fuchsia-200 hover:border-cyan-400'
                }`}
              >
                <div className="text-left">
                  <div className="font-bold">MINIMAL CLEAN HUD [H]</div>
                  <div className="text-[10px] text-fuchsia-300/60">
                    Hide instruments for pure cinematic view
                  </div>
                </div>
                <div className={`font-bold px-2 py-0.5 rounded text-[10px] ${cleanHud ? 'bg-cyan-400 text-black' : 'bg-[#250840] text-fuchsia-300'}`}>
                  {cleanHud ? 'MINIMAL' : 'FULL'}
                </div>
              </button>
            </div>
          </div>
        </div>

        {/* Footer Dismiss */}
        <div className="flex items-center justify-between border-t border-fuchsia-500/30 bg-[#12032b] px-4 py-3">
          <span className="text-[10px] text-fuchsia-300/60 uppercase">
            SETTINGS SAVED AUTOMATICALLY
          </span>
          <button
            type="button"
            onClick={onClose}
            className="cursor-pointer rounded border border-pink-400/80 bg-pink-600/80 px-4 py-1.5 text-xs font-bold tracking-wider text-white uppercase transition hover:bg-pink-500 hover:shadow-[0_0_15px_rgba(255,42,109,0.5)]"
          >
            CONFIRM // RETURN
          </button>
        </div>
      </div>
    </div>
  );
}
