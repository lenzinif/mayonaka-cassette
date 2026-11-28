import type { SodaSkin } from '@src/entities/MelonSoda';
import { useEffect } from 'react';
import {
  COCKPIT_PRESET_CLUTTER,
  type CockpitVisibility,
} from './cockpit/cockpitSettings';
import type { VisorPhotoItem } from './cockpit/visorPhotoStore';
import { OptionsPanel } from './components/OptionsPanel';

export interface QuickOptionsModalProps {
  open: boolean;
  onClose: () => void;
  autoShift: boolean;
  onToggleAutoShift: () => void;
  tofuMode: boolean;
  onToggleTofuMode: () => void;
  sodaSkin: SodaSkin;
  onCycleSodaSkin: () => void;
  crtEnabled: boolean;
  onToggleCrt: () => void;
  cockpitVisibility?: CockpitVisibility;
  visorPhotos?: readonly VisorPhotoItem[];
  onToggleCockpitModule?: (key: keyof CockpitVisibility) => void;
  onApplyCockpitPreset?: (preset: CockpitVisibility) => void;
  onAddVisorPhotos?: (files: readonly File[]) => void;
  onAddVisorPhoto?: (file: File) => void;
  onRemoveVisorPhoto?: (id: string) => void;
  onClearVisorPhotos?: () => void;
}

/**
 * Modal wrapper around the shared `OptionsPanel` (`docs/UI.md §4.3`).
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
  crtEnabled,
  onToggleCrt,
  cockpitVisibility = COCKPIT_PRESET_CLUTTER,
  visorPhotos = [],
  onToggleCockpitModule = () => {},
  onApplyCockpitPreset = () => {},
  onAddVisorPhotos,
  onAddVisorPhoto = () => {},
  onRemoveVisorPhoto = () => {},
  onClearVisorPhotos = () => {},
}: QuickOptionsModalProps) {
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;
      if (e.key === 'Escape' || e.code === 'Escape') {
        e.preventDefault();
        e.stopImmediatePropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown, { capture: true });
    return () => window.removeEventListener('keydown', onKeyDown, { capture: true });
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="pointer-events-auto fixed inset-0 z-50 flex items-center justify-center bg-[#070911]/82 p-4 select-none"
      role="dialog"
      aria-modal="true"
      aria-label="Options"
    >
      <OptionsPanel
        autoShift={autoShift}
        onToggleAutoShift={onToggleAutoShift}
        tofuMode={tofuMode}
        onToggleTofuMode={onToggleTofuMode}
        sodaSkin={sodaSkin}
        onCycleSodaSkin={onCycleSodaSkin}
        crtEnabled={crtEnabled}
        onToggleCrt={onToggleCrt}
        cockpitVisibility={cockpitVisibility}
        onToggleCockpitModule={onToggleCockpitModule}
        onApplyCockpitPreset={onApplyCockpitPreset}
        visorPhotos={visorPhotos}
        onAddVisorPhotos={onAddVisorPhotos}
        onAddVisorPhoto={onAddVisorPhoto}
        onRemoveVisorPhoto={onRemoveVisorPhoto}
        onClearVisorPhotos={onClearVisorPhotos}
        onClose={onClose}
      />
    </div>
  );
}
