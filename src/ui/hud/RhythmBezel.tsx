import type { GrooveTier } from '@src/entities/PlayerCar';
import { memo } from 'react';

export interface RhythmBezelProps {
  beatPulse: number;
  beatInBar: number;
  grooveTier: GrooveTier;
  /** Keep DOM/compositor layer mounted at opacity 0 between beats during active gameplay. */
  alwaysMount?: boolean;
}

/**
 * Ambient Rhythm Bezel (Roadmap §1).
 * Generates an ultra-subtle peripheral light pulse in sync with the downbeat
 * without distracting the driver or adding render loop overhead.
 */
export const RhythmBezel = memo(function RhythmBezel({
  beatPulse,
  beatInBar,
  grooveTier,
  alwaysMount = false,
}: RhythmBezelProps) {
  const isDownbeat = beatInBar === 0;
  const isOverdrive = grooveTier === 'OVERDRIVE';

  // Return null only when requested (tests / completely stopped) unless alwaysMount keeps the GPU layer warm.
  if (beatPulse <= 0 && !alwaysMount) return null;

  const maxOpacity = isOverdrive ? 0.35 : 0.18;
  const pulseOpacity = Math.max(0, Math.min(maxOpacity, beatPulse * (isDownbeat ? maxOpacity : maxOpacity * 0.5)));
  const effectiveOpacity = pulseOpacity < 0.02 ? 0 : Math.min(1, pulseOpacity / maxOpacity);

  // Keep layer composited without blur-heavy fullscreen inset box-shadow passes.
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 z-0 will-change-opacity [contain:strict]"
      style={{ opacity: effectiveOpacity }}
    >
      <div
        className="absolute inset-x-0 top-0 h-8"
        style={{
          backgroundImage: isOverdrive
            ? 'linear-gradient(to bottom, rgba(251, 191, 36, 0.34), rgba(255, 42, 109, 0.14), rgba(0, 0, 0, 0))'
            : 'linear-gradient(to bottom, rgba(5, 217, 232, 0.24), rgba(255, 42, 109, 0.08), rgba(0, 0, 0, 0))',
        }}
      />
      <div
        className="absolute inset-x-0 bottom-0 h-8"
        style={{
          backgroundImage: isOverdrive
            ? 'linear-gradient(to top, rgba(251, 191, 36, 0.34), rgba(255, 42, 109, 0.14), rgba(0, 0, 0, 0))'
            : 'linear-gradient(to top, rgba(5, 217, 232, 0.24), rgba(255, 42, 109, 0.08), rgba(0, 0, 0, 0))',
        }}
      />
      <div
        className="absolute inset-y-0 left-0 w-8"
        style={{
          backgroundImage: isOverdrive
            ? 'linear-gradient(to right, rgba(251, 191, 36, 0.34), rgba(255, 42, 109, 0.14), rgba(0, 0, 0, 0))'
            : 'linear-gradient(to right, rgba(5, 217, 232, 0.24), rgba(255, 42, 109, 0.08), rgba(0, 0, 0, 0))',
        }}
      />
      <div
        className="absolute inset-y-0 right-0 w-8"
        style={{
          backgroundImage: isOverdrive
            ? 'linear-gradient(to left, rgba(251, 191, 36, 0.34), rgba(255, 42, 109, 0.14), rgba(0, 0, 0, 0))'
            : 'linear-gradient(to left, rgba(5, 217, 232, 0.24), rgba(255, 42, 109, 0.08), rgba(0, 0, 0, 0))',
        }}
      />
    </div>
  );
});
