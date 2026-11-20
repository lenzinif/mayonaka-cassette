import { useEffect, useState } from 'react';

export interface DriverManualModalProps {
  open: boolean;
  onClose: () => void;
}

type ManualTab = 'rhythm' | 'drift' | 'tofu' | 'controls';

/**
 * Mayonaka Hi-Fi Driver's Guide Modal.
 * Crisp player-facing instructions for Beat-Shifting, Drift, Melon Soda / Tofu Mode, and Controls.
 */
export function DriverManualModal({ open, onClose }: DriverManualModalProps) {
  const [activeTab, setActiveTab] = useState<ManualTab>('rhythm');

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
      aria-label="Guide"
    >
      <div
        className="ff-shadow-ink relative flex max-h-[85vh] w-full max-w-2xl overflow-hidden rounded-[2px] border-2 border-[var(--ff-cream)] bg-[var(--ff-panel)]"
        style={{ colorScheme: 'dark' }}
      >
        <div className="ff-obi-v w-2.5 shrink-0" />

        <div className="flex min-w-0 flex-1 flex-col">
          {/* Cream J-Card Header */}
          <div className="flex items-center justify-between bg-[var(--ff-cream)] px-4 py-2.5 text-[var(--ff-ink)]">
            <span className="ff-display text-base font-black italic tracking-wider uppercase">
              GUIDE
            </span>
            <button
              type="button"
              onClick={onClose}
              className="ff-mono cursor-pointer rounded-[2px] border-2 border-[var(--ff-ink)] px-2.5 py-0.5 text-[10px] font-black tracking-wider text-[var(--ff-ink)] transition hover:bg-[var(--ff-pink)] hover:text-[var(--ff-cream)]"
            >
              BACK [ESC]
            </button>
          </div>

          {/* Navigation Tabs */}
          <div className="grid grid-cols-4 border-b border-[var(--ff-border)] bg-[var(--ff-ink)] text-[10px] font-black tracking-[0.14em] uppercase">
            <button
              type="button"
              onClick={() => setActiveTab('rhythm')}
              className={`cursor-pointer border-b-2 py-2.5 text-center transition ${
                activeTab === 'rhythm'
                  ? 'border-[var(--ff-pink)] bg-[var(--ff-panel)] text-[var(--ff-cream)]'
                  : 'border-transparent text-[var(--ff-muted)] hover:text-[var(--ff-cream)]'
              }`}
            >
              BEAT-SHIFT
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('drift')}
              className={`cursor-pointer border-b-2 py-2.5 text-center transition ${
                activeTab === 'drift'
                  ? 'border-[var(--ff-mint)] bg-[var(--ff-panel)] text-[var(--ff-cream)]'
                  : 'border-transparent text-[var(--ff-muted)] hover:text-[var(--ff-cream)]'
              }`}
            >
              DRIFT
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('tofu')}
              className={`cursor-pointer border-b-2 py-2.5 text-center transition ${
                activeTab === 'tofu'
                  ? 'border-[var(--ff-gold)] bg-[var(--ff-panel)] text-[var(--ff-cream)]'
                  : 'border-transparent text-[var(--ff-muted)] hover:text-[var(--ff-cream)]'
              }`}
            >
              MELON SODA
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('controls')}
              className={`cursor-pointer border-b-2 py-2.5 text-center transition ${
                activeTab === 'controls'
                  ? 'border-[var(--ff-pink)] bg-[var(--ff-panel)] text-[var(--ff-cream)]'
                  : 'border-transparent text-[var(--ff-muted)] hover:text-[var(--ff-cream)]'
              }`}
            >
              CONTROLS
            </button>
          </div>

          {/* Tab Body */}
          <div
            className="flex-1 overflow-y-auto p-4 text-xs leading-relaxed text-[var(--ff-cream)]"
            style={{ scrollbarColor: '#FF3B7F #0B0E1E', scrollbarWidth: 'thin' }}
          >
            {activeTab === 'rhythm' && (
              <div className="space-y-3">
                <div className="rounded-[2px] border border-[var(--ff-border)] bg-[var(--ff-ink)] p-3">
                  <div className="font-black tracking-wider text-[var(--ff-pink)] uppercase">
                    6-SPEED BEAT-SHIFT
                  </div>
                  <p className="mt-1 text-[11px] text-[var(--ff-muted)]">
                    Shift on the beat to build Groove and open up the music.
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-2.5 text-[11px]">
                  <div className="rounded-[2px] border border-[var(--ff-border)] bg-[var(--ff-ink)] p-3">
                    <div className="font-bold text-[var(--ff-mint)] uppercase">TIMING</div>
                    <ul className="mt-1.5 space-y-1 text-[var(--ff-muted)]">
                      <li>
                        <span className="font-bold text-[var(--ff-mint)]">PERFECT:</span> Max Groove
                        boost
                      </li>
                      <li>
                        <span className="font-bold text-[var(--ff-cream)]">GOOD:</span> Steady
                        Groove gain
                      </li>
                      <li>
                        <span className="font-bold text-[var(--ff-pink)]">BEAT 1:</span> 1.5×
                        downbeat bonus
                      </li>
                    </ul>
                  </div>
                  <div className="rounded-[2px] border border-[var(--ff-border)] bg-[var(--ff-ink)] p-3">
                    <div className="font-bold text-[var(--ff-gold)] uppercase">ZERO PENALTY</div>
                    <p className="mt-1.5 text-[var(--ff-muted)]">
                      Off-beat shifts never stall the car — they simply skip the bonus. Press{' '}
                      <code className="ff-mono text-[var(--ff-pink)]">[G]</code> anytime for
                      auto-shift.
                    </p>
                  </div>
                </div>

                <div className="rounded-[2px] border border-[var(--ff-border)] bg-[var(--ff-ink)] p-3 text-[11px]">
                  <div className="font-bold text-[var(--ff-cream)] uppercase">GROOVE TIERS</div>
                  <p className="mt-1 text-[var(--ff-muted)]">
                    <span className="font-bold text-[var(--ff-muted)]">LOW</span> →{' '}
                    <span className="font-bold text-[var(--ff-mint)]">MEDIUM</span> →{' '}
                    <span className="font-bold text-[var(--ff-pink)]">HIGH</span> →{' '}
                    <span className="font-bold text-[var(--ff-gold)]">OVERDRIVE</span>. Higher
                    tiers brighten the road and widen the stereo mix.
                  </p>
                </div>
              </div>
            )}

            {activeTab === 'drift' && (
              <div className="space-y-3">
                <div className="rounded-[2px] border border-[var(--ff-border)] bg-[var(--ff-ink)] p-3">
                  <div className="font-black tracking-wider text-[var(--ff-mint)] uppercase">
                    CURVE SLIDE &amp; EXIT BOOST
                  </div>
                  <p className="mt-1 text-[11px] text-[var(--ff-muted)]">
                    Lean into fast sweepers to hold your line without lifting off the gas.
                  </p>
                </div>

                <div className="space-y-2 text-[11px]">
                  <div className="flex gap-3 rounded-[2px] border border-[var(--ff-border)] bg-[var(--ff-ink)] p-2.5">
                    <div className="w-24 shrink-0 font-bold text-[var(--ff-pink)]">1. INITIATE</div>
                    <div className="text-[var(--ff-muted)]">
                      Hold <code className="ff-mono text-[var(--ff-cream)]">[LCTRL]</code> while
                      steering, or tap <code className="ff-mono text-[var(--ff-cream)]">[S]</code>{' '}
                      / <code className="ff-mono text-[var(--ff-cream)]">[DOWN]</code> into a turn.
                    </div>
                  </div>
                  <div className="flex gap-3 rounded-[2px] border border-[var(--ff-border)] bg-[var(--ff-ink)] p-2.5">
                    <div className="w-24 shrink-0 font-bold text-[var(--ff-mint)]">2. HOLD</div>
                    <div className="text-[var(--ff-muted)]">
                      Counter-steer smoothly to keep the tail tucked through the apex.
                    </div>
                  </div>
                  <div className="flex gap-3 rounded-[2px] border border-[var(--ff-border)] bg-[var(--ff-ink)] p-2.5">
                    <div className="w-24 shrink-0 font-bold text-[var(--ff-gold)]">3. BOOST</div>
                    <div className="text-[var(--ff-muted)]">
                      Cleanly straighten out after holding a drift for a speed surge down the
                      straight.
                    </div>
                  </div>
                </div>

                <div className="rounded-[2px] border border-[var(--ff-border)] bg-[var(--ff-ink)] p-3 text-[11px]">
                  <div className="font-bold text-[var(--ff-mint)] uppercase">KEEP MOVING</div>
                  <p className="mt-1 text-[var(--ff-muted)]">
                    Clipping signs or traffic dips your speed and Groove briefly, but never stops
                    the music or ends the drive.
                  </p>
                </div>
              </div>
            )}

            {activeTab === 'tofu' && (
              <div className="space-y-3">
                <div className="rounded-[2px] border border-[var(--ff-border)] bg-[var(--ff-ink)] p-3">
                  <div className="font-black tracking-wider text-[var(--ff-gold)] uppercase">
                    DASHBOARD MELON SODA
                  </div>
                  <p className="mt-1 text-[11px] text-[var(--ff-muted)]">
                    Smooth turns and gentle braking keep the melon soda inside the glass.
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-2.5 text-[11px]">
                  <div className="rounded-[2px] border border-[var(--ff-border)] bg-[var(--ff-ink)] p-3">
                    <div className="font-bold text-[var(--ff-mint)] uppercase">TOFU MODE [T]</div>
                    <p className="mt-1 text-[var(--ff-muted)]">
                      Doubles all Groove earned from beat-shifts and clean corners.
                    </p>
                  </div>
                  <div className="rounded-[2px] border border-[var(--ff-border)] bg-[var(--ff-ink)] p-3">
                    <div className="font-bold text-[var(--ff-pink)] uppercase">SPILL PENALTY</div>
                    <p className="mt-1 text-[var(--ff-muted)]">
                      Hard swerves or panic braking splash soda over the rim, costing 20% Groove.
                    </p>
                  </div>
                </div>

                <div className="rounded-[2px] border border-[var(--ff-border)] bg-[var(--ff-ink)] p-3 text-[11px]">
                  <div className="font-bold text-[var(--ff-gold)] uppercase">CUP SKINS [V]</div>
                  <p className="mt-1 text-[var(--ff-muted)]">
                    Swap between Melon Soda, Tofu Water Cup, Pocari Sweat, and Boss Coffee.
                  </p>
                </div>
              </div>
            )}

            {activeTab === 'controls' && (
              <div className="grid grid-cols-2 gap-2.5 text-[11px]">
                <div className="space-y-1.5 rounded-[2px] border border-[var(--ff-border)] bg-[var(--ff-ink)] p-3">
                  <div className="border-b border-[var(--ff-border)] pb-1 font-bold text-[var(--ff-mint)] uppercase">
                    KEYBOARD
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[var(--ff-muted)]">GAS</span>
                    <span className="ff-mono font-bold text-[var(--ff-cream)]">[W] / [UP]</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[var(--ff-muted)]">BRAKE / DRIFT</span>
                    <span className="ff-mono font-bold text-[var(--ff-cream)]">[S] / [DOWN]</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[var(--ff-muted)]">PURE DRIFT</span>
                    <span className="ff-mono font-bold text-[var(--ff-cream)]">[LCTRL]</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[var(--ff-muted)]">STEER</span>
                    <span className="ff-mono font-bold text-[var(--ff-cream)]">[A] / [D]</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[var(--ff-muted)]">SHIFT UP</span>
                    <span className="ff-mono font-bold text-[var(--ff-pink)]">[SPACE]</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[var(--ff-muted)]">SHIFT DOWN</span>
                    <span className="ff-mono font-bold text-[var(--ff-pink)]">[SHIFT]</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[var(--ff-muted)]">AUTO-SHIFT</span>
                    <span className="ff-mono font-bold text-[var(--ff-mint)]">[G]</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[var(--ff-muted)]">TOFU MODE</span>
                    <span className="ff-mono font-bold text-[var(--ff-gold)]">[T]</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[var(--ff-muted)]">CUP SKIN</span>
                    <span className="ff-mono font-bold text-[var(--ff-gold)]">[V]</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[var(--ff-muted)]">MINIMAL HUD</span>
                    <span className="ff-mono font-bold text-[var(--ff-mint)]">[H]</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[var(--ff-muted)]">PAUSE</span>
                    <span className="ff-mono font-bold text-[var(--ff-pink)]">[P] / [ESC]</span>
                  </div>
                </div>

                <div className="space-y-1.5 rounded-[2px] border border-[var(--ff-border)] bg-[var(--ff-ink)] p-3">
                  <div className="border-b border-[var(--ff-border)] pb-1 font-bold text-[var(--ff-gold)] uppercase">
                    GAMEPAD
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[var(--ff-muted)]">STEER</span>
                    <span className="ff-mono font-bold text-[var(--ff-cream)]">STICK / D-PAD</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[var(--ff-muted)]">GAS</span>
                    <span className="ff-mono font-bold text-[var(--ff-cream)]">RT</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[var(--ff-muted)]">BRAKE</span>
                    <span className="ff-mono font-bold text-[var(--ff-cream)]">LT</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[var(--ff-muted)]">DRIFT</span>
                    <span className="ff-mono font-bold text-[var(--ff-pink)]">A / CROSS</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[var(--ff-muted)]">CUP SKIN</span>
                    <span className="ff-mono font-bold text-[var(--ff-gold)]">B / CIRCLE</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[var(--ff-muted)]">TOFU MODE</span>
                    <span className="ff-mono font-bold text-[var(--ff-gold)]">Y / TRIANGLE</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[var(--ff-muted)]">SHIFT UP / DN</span>
                    <span className="ff-mono font-bold text-[var(--ff-mint)]">RB / LB</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[var(--ff-muted)]">AUTO-SHIFT</span>
                    <span className="ff-mono font-bold text-[var(--ff-mint)]">BACK</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[var(--ff-muted)]">PAUSE</span>
                    <span className="ff-mono font-bold text-[var(--ff-pink)]">START</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
