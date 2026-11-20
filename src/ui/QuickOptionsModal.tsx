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
 * Mayonaka Hi-Fi J-Card Settings & Options Modal.
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
      className="pointer-events-auto fixed inset-0 z-50 flex items-center justify-center bg-[#0B0E1E]/80 p-4 text-[var(--ff-cream)] select-none"
      role="dialog"
      aria-modal="true"
      aria-label="Options"
    >
      <div
        className="ff-shadow-ink relative flex w-full max-w-md overflow-hidden rounded-[2px] border-2 border-[var(--ff-cream)] bg-[var(--ff-panel)]"
        style={{ colorScheme: 'dark' }}
      >
        <div className="ff-obi-v w-2.5 shrink-0" />

        <div className="flex-1">
          {/* Cream J-Card Header */}
          <div className="flex items-center justify-between bg-[var(--ff-cream)] px-4 py-2.5 text-[var(--ff-ink)]">
            <span className="ff-display text-base font-black italic tracking-wider uppercase">
              OPTIONS
            </span>
            <button
              type="button"
              onClick={onClose}
              className="ff-mono cursor-pointer rounded-[2px] border-2 border-[var(--ff-ink)] px-2.5 py-0.5 text-[10px] font-black tracking-wider text-[var(--ff-ink)] transition hover:bg-[var(--ff-pink)] hover:text-[var(--ff-cream)]"
            >
              BACK [ESC]
            </button>
          </div>

          <div className="space-y-2 p-4 text-xs">
            <button
              type="button"
              onClick={onToggleAutoShift}
              className="flex w-full cursor-pointer items-center justify-between rounded-[2px] border border-[var(--ff-border)] bg-[var(--ff-ink)] px-3.5 py-2.5 transition hover:border-[var(--ff-mint)]"
            >
              <span className="font-bold tracking-wider uppercase">GEARBOX [G]</span>
              <span
                className={`ff-mono rounded-[2px] px-2 py-0.5 text-[10px] font-black ${
                  autoShift
                    ? 'bg-[var(--ff-gold)] text-[var(--ff-ink)]'
                    : 'bg-[var(--ff-mint)] text-[var(--ff-ink)]'
                }`}
              >
                {autoShift ? 'AUTO-SHIFT' : 'MANUAL'}
              </span>
            </button>

            <button
              type="button"
              onClick={onToggleTofuMode}
              className="flex w-full cursor-pointer items-center justify-between rounded-[2px] border border-[var(--ff-border)] bg-[var(--ff-ink)] px-3.5 py-2.5 transition hover:border-[var(--ff-mint)]"
            >
              <span className="font-bold tracking-wider uppercase">TOFU MODE [T]</span>
              <span
                className={`ff-mono rounded-[2px] px-2 py-0.5 text-[10px] font-black ${
                  tofuMode
                    ? 'bg-[var(--ff-mint)] text-[var(--ff-ink)]'
                    : 'bg-[var(--ff-panel-hi)] text-[var(--ff-muted)]'
                }`}
              >
                {tofuMode ? 'ON (×2)' : 'OFF'}
              </span>
            </button>

            <button
              type="button"
              onClick={onCycleSodaSkin}
              className="flex w-full cursor-pointer items-center justify-between rounded-[2px] border border-[var(--ff-border)] bg-[var(--ff-ink)] px-3.5 py-2.5 transition hover:border-[var(--ff-gold)]"
            >
              <span className="font-bold tracking-wider uppercase">DASHBOARD CUP [V]</span>
              <span className="ff-mono rounded-[2px] bg-[var(--ff-gold)] px-2 py-0.5 text-[10px] font-black text-[var(--ff-ink)]">
                {SODA_SKIN_LABELS[sodaSkin]}
              </span>
            </button>

            <button
              type="button"
              onClick={onToggleCleanHud}
              className="flex w-full cursor-pointer items-center justify-between rounded-[2px] border border-[var(--ff-border)] bg-[var(--ff-ink)] px-3.5 py-2.5 transition hover:border-[var(--ff-mint)]"
            >
              <span className="font-bold tracking-wider uppercase">HUD [H]</span>
              <span
                className={`ff-mono rounded-[2px] px-2 py-0.5 text-[10px] font-black ${
                  cleanHud
                    ? 'bg-[var(--ff-mint)] text-[var(--ff-ink)]'
                    : 'bg-[var(--ff-panel-hi)] text-[var(--ff-muted)]'
                }`}
              >
                {cleanHud ? 'MINIMAL' : 'FULL'}
              </span>
            </button>

            <button
              type="button"
              onClick={onToggleCrt}
              className="flex w-full cursor-pointer items-center justify-between rounded-[2px] border border-[var(--ff-border)] bg-[var(--ff-ink)] px-3.5 py-2.5 transition hover:border-[var(--ff-pink)]"
            >
              <span className="font-bold tracking-wider uppercase">CRT SCANLINES</span>
              <span
                className={`ff-mono rounded-[2px] px-2 py-0.5 text-[10px] font-black ${
                  crtEnabled
                    ? 'bg-[var(--ff-pink)] text-[var(--ff-cream)]'
                    : 'bg-[var(--ff-panel-hi)] text-[var(--ff-muted)]'
                }`}
              >
                {crtEnabled ? 'ON' : 'OFF'}
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
