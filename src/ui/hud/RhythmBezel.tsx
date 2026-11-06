import type { GrooveTier } from '@src/entities/PlayerCar';

export interface RhythmBezelProps {
  beatPulse: number;
  beatInBar: number;
  grooveTier: GrooveTier;
}

/**
 * Ambient Rhythm Bezel (Roadmap §1).
 * Generates an ultra-subtle peripheral light pulse in sync with the downbeat
 * without distracting the driver or adding render loop overhead.
 */
export function RhythmBezel({ beatPulse, beatInBar, grooveTier }: RhythmBezelProps) {
  const isDownbeat = beatInBar === 0;
  const isSSS = grooveTier === 'SSS';

  // Base opacity: 0 when idle, pulses up to ~0.25 on downbeat (or ~0.45 in SSS overdrive)
  const maxOpacity = isSSS ? 0.35 : 0.18;
  const pulseOpacity = Math.max(0, Math.min(maxOpacity, beatPulse * (isDownbeat ? maxOpacity : maxOpacity * 0.5)));

  if (pulseOpacity < 0.02) return null;

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 z-0 transition-opacity duration-75 ease-out will-change-opacity"
      style={{
        opacity: Math.min(1, pulseOpacity / maxOpacity),
        boxShadow: isSSS
          ? 'inset 0 0 45px rgba(251, 191, 36, 0.45), inset 0 0 15px rgba(255, 42, 109, 0.35)'
          : 'inset 0 0 35px rgba(5, 217, 232, 0.30), inset 0 0 10px rgba(255, 42, 109, 0.20)',
      }}
    />
  );
}
