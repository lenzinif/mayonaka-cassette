import { SODA_SKIN_LABELS, type SodaSkin } from '@src/entities/MelonSoda';
import { useEffect } from 'react';

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
 * Live configuration of rhythm driving assist, Tofu Mode, Melon Soda skin, and visual filters.
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
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="pointer-events-auto fixed inset-0 z-50 flex items-center justify-center bg-[#060112]/85 p-4 font-mono text-white select-none"
      role="dialog"
      aria-modal="true"
      aria-label="Options"
    >
      <div
        className="relative flex flex-col w-full max-w-md overflow-hidden rounded-lg border-2 border-pink-500/70 bg-[#0d0221]/98 shadow-[0_0_40px_rgba(255,42,109,0.35)]"
        style={{ colorScheme: 'dark' }}
      >
        {/* Header: OPTIONS on left, BACK [ESC] on right */}
        <div className="flex items-center justify-between border-b border-fuchsia-500/30 bg-[#160435] px-4 py-2.5 text-xs font-black tracking-widest text-cyan-300 uppercase">
          <span>OPTIONS</span>
          <button
            type="button"
            onClick={onClose}
            className="cursor-pointer rounded border border-fuchsia-400/40 bg-[#1a0636] px-2.5 py-1 text-[11px] font-bold tracking-wider text-fuchsia-200 transition hover:border-pink-400 hover:bg-pink-950/60 hover:text-white"
          >
            BACK [ESC]
          </button>
        </div>

        {/* Body: 5 Key-Value toggle buttons */}
        <div className="p-4 space-y-2.5">
          {/* 1. Transmission */}
          <button
            type="button"
            onClick={onToggleAutoShift}
            className={`flex w-full cursor-pointer items-center justify-between rounded border px-3.5 py-2.5 text-xs transition ${
              autoShift
                ? 'border-cyan-400 bg-cyan-950/40 text-cyan-200 shadow-[0_0_12px_rgba(5,217,232,0.25)]'
                : 'border-fuchsia-500/30 bg-[#160530]/60 text-fuchsia-200 hover:border-cyan-400/60'
            }`}
          >
            <span className="font-bold">TRANSMISSION [G]</span>
            <span
              className={`font-bold px-2 py-0.5 rounded text-[10px] ${
                autoShift ? 'bg-cyan-400 text-black' : 'bg-[#250840] text-fuchsia-300'
              }`}
            >
              {autoShift ? 'AUTO-SHIFT' : 'MANUAL'}
            </span>
          </button>

          {/* 2. Tofu Mode */}
          <button
            type="button"
            onClick={onToggleTofuMode}
            className={`flex w-full cursor-pointer items-center justify-between rounded border px-3.5 py-2.5 text-xs transition ${
              tofuMode
                ? 'border-emerald-400 bg-emerald-950/40 text-emerald-200 shadow-[0_0_12px_rgba(16,185,129,0.25)]'
                : 'border-fuchsia-500/30 bg-[#160530]/60 text-fuchsia-200 hover:border-emerald-400/60'
            }`}
          >
            <span className="font-bold">TOFU MODE [T]</span>
            <span
              className={`font-bold px-2 py-0.5 rounded text-[10px] ${
                tofuMode ? 'bg-emerald-400 text-black' : 'bg-[#250840] text-fuchsia-300'
              }`}
            >
              {tofuMode ? 'ON (×2 GROOVE)' : 'OFF'}
            </span>
          </button>

          {/* 3. Dashboard Cup */}
          <button
            type="button"
            onClick={onCycleSodaSkin}
            className="flex w-full cursor-pointer items-center justify-between rounded border border-amber-400/40 bg-[#1a0f05]/60 px-3.5 py-2.5 text-xs text-amber-200 transition hover:border-amber-300"
          >
            <span className="font-bold">DASHBOARD CUP [V]</span>
            <span className="font-bold px-2 py-0.5 rounded text-[10px] bg-amber-400/20 text-amber-300 border border-amber-400/40">
              {SODA_SKIN_LABELS[sodaSkin]}
            </span>
          </button>

          {/* 4. HUD Display */}
          <button
            type="button"
            onClick={onToggleCleanHud}
            className={`flex w-full cursor-pointer items-center justify-between rounded border px-3.5 py-2.5 text-xs transition ${
              cleanHud
                ? 'border-cyan-400 bg-cyan-950/40 text-cyan-200 shadow-[0_0_12px_rgba(5,217,232,0.25)]'
                : 'border-fuchsia-500/30 bg-[#160530]/60 text-fuchsia-200 hover:border-cyan-400/60'
            }`}
          >
            <span className="font-bold">HUD DISPLAY [H]</span>
            <span
              className={`font-bold px-2 py-0.5 rounded text-[10px] ${
                cleanHud ? 'bg-cyan-400 text-black' : 'bg-[#250840] text-fuchsia-300'
              }`}
            >
              {cleanHud ? 'MINIMAL' : 'FULL'}
            </span>
          </button>

          {/* 5. CRT Scanlines */}
          <button
            type="button"
            onClick={onToggleCrt}
            className={`flex w-full cursor-pointer items-center justify-between rounded border px-3.5 py-2.5 text-xs transition ${
              crtEnabled
                ? 'border-pink-400 bg-pink-950/40 text-pink-200 shadow-[0_0_12px_rgba(255,42,109,0.25)]'
                : 'border-fuchsia-500/30 bg-[#160530]/60 text-fuchsia-200 hover:border-pink-400/60'
            }`}
          >
            <span className="font-bold">CRT SCANLINES</span>
            <span
              className={`font-bold px-2 py-0.5 rounded text-[10px] ${
                crtEnabled ? 'bg-pink-500 text-white' : 'bg-[#250840] text-fuchsia-300'
              }`}
            >
              {crtEnabled ? 'ON' : 'OFF'}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
