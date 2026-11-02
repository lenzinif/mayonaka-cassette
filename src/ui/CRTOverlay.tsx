export interface CRTOverlayProps {
  enabled?: boolean;
}

/**
 * Pure CSS scanline, VHS phosphor grille, and vignette overlay (AGENTS.md §3 & §5).
 * `pointer-events-none` ensures zero interference with underlying HUD buttons or canvas.
 */
export function CRTOverlay({ enabled = true }: CRTOverlayProps) {
  if (!enabled) return null;

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 z-[3] overflow-hidden select-none"
    >
      {/* Horizontal CRT scanlines */}
      <div
        className="absolute inset-0 opacity-22"
        style={{
          backgroundImage:
            'repeating-linear-gradient(to bottom, rgba(0, 0, 0, 0) 0px, rgba(0, 0, 0, 0) 2px, rgba(8, 2, 20, 0.65) 3px, rgba(8, 2, 20, 0.65) 4px)',
        }}
      />
      {/* Subtle VHS edge vignette & magenta/cyan chromatic tint */}
      <div
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(circle at 50% 50%, rgba(13, 2, 33, 0) 64%, rgba(6, 1, 18, 0.52) 100%)',
        }}
      />
    </div>
  );
}
