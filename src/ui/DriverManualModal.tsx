import { BackGuideSheet } from './components/BackGuideSheet';

export interface DriverManualModalProps {
  open: boolean;
  onClose: () => void;
}

/**
 * Standalone modal wrapper around `BackGuideSheet` (used when invoked outside hardware flip).
 */
export function DriverManualModal({ open, onClose }: DriverManualModalProps) {
  if (!open) return null;

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="pointer-events-auto fixed inset-0 z-50 flex items-center justify-center bg-[#070911]/82 p-4 select-none"
      role="dialog"
      aria-modal="true"
      aria-label="Driver's Guide"
    >
      <BackGuideSheet variant="deck" onFlipBack={onClose} />
    </div>
  );
}
