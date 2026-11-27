import { SODA_SKIN_LABELS, type SodaSkin } from '@src/entities/MelonSoda';
import { useEffect, useId } from 'react';
import { WalkmanModalFrame, WalkmanSwitchRow } from './walkman/WalkmanChrome';

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
 * Mayonaka Walkman Hardware DIP Switches & Settings Modal (`WM-86 DIP SWITCHES`).
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
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.code === 'Escape') {
        e.preventDefault();
        e.stopImmediatePropagation();
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
      className="pointer-events-auto fixed inset-0 z-50 flex items-center justify-center bg-[#070911]/82 p-4 text-[var(--wm-silk)] select-none"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      <WalkmanModalFrame
        title="OPTIONS"
        jpSubtitle="設定スイッチ"
        modelTag="WM-86 DIP SWITCHES"
        titleId={titleId}
        maxWidthClass="max-w-md"
        maxHeightClass="max-h-[90vh]"
        headerRight={
          <button
            type="button"
            onClick={onClose}
            className="wm-btn ff-mono cursor-pointer px-2.5 py-1 text-[10px] font-black tracking-wider text-[var(--wm-silk)] uppercase hover:text-[var(--wm-play)]"
          >
            BACK [ESC]
          </button>
        }
      >
        <div className="ff-scroll overflow-y-auto p-4">
          <div className="wm-key-bank flex flex-col text-xs">
            <WalkmanSwitchRow
              label="GEARBOX [G]"
              valueLabel={autoShift ? 'AUTO-SHIFT' : 'MANUAL'}
              active
              accent={autoShift ? 'amber' : 'mint'}
              onClick={onToggleAutoShift}
            />

            <WalkmanSwitchRow
              label="TOFU MODE [T]"
              valueLabel={tofuMode ? 'ON (×2)' : 'OFF'}
              active={tofuMode}
              accent="mint"
              onClick={onToggleTofuMode}
            />

            <WalkmanSwitchRow
              label="DASHBOARD CUP [V]"
              valueLabel={SODA_SKIN_LABELS[sodaSkin]}
              active
              accent="amber"
              variant="cycle"
              onClick={onCycleSodaSkin}
            />

            <WalkmanSwitchRow
              label="HUD [H]"
              valueLabel={cleanHud ? 'MINIMAL' : 'FULL'}
              active={cleanHud}
              accent="mint"
              onClick={onToggleCleanHud}
            />

            <WalkmanSwitchRow
              label="CRT SCANLINES"
              valueLabel={crtEnabled ? 'ON' : 'OFF'}
              active={crtEnabled}
              accent="play"
              onClick={onToggleCrt}
            />
          </div>
        </div>
      </WalkmanModalFrame>
    </div>
  );
}
