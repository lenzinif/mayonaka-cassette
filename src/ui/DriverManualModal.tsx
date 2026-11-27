import { useEffect, useId, useState } from 'react';
import { WalkmanLed, WalkmanModalFrame } from './walkman/WalkmanChrome';

export interface DriverManualModalProps {
  open: boolean;
  onClose: () => void;
}

type ManualTab = 'rhythm' | 'drift' | 'tofu' | 'controls';

/**
 * Mayonaka Walkman Owner's Manual Modal (`WM-86 OWNER'S MANUAL`).
 */
export function DriverManualModal({ open, onClose }: DriverManualModalProps) {
  const [activeTab, setActiveTab] = useState<ManualTab>('rhythm');
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
        title="GUIDE"
        jpSubtitle="取扱説明書"
        modelTag="WM-86 OWNER'S MANUAL"
        titleId={titleId}
        maxWidthClass="max-w-2xl"
        maxHeightClass="max-h-[85vh]"
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
        {/* Walkman Selector Flush Key Bank */}
        <div className="border-b border-[var(--wm-line)] bg-[#131622] p-2">
          <div
            role="tablist"
            aria-label="Guide Sections"
            className="wm-key-bank ff-mono grid grid-cols-2 text-[10px] font-black tracking-[0.12em] uppercase sm:grid-cols-4"
          >
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'rhythm'}
              data-pressed={activeTab === 'rhythm' ? 'true' : 'false'}
              onClick={() => setActiveTab('rhythm')}
              className={`wm-btn-well flex cursor-pointer items-center justify-center gap-1.5 py-2 text-center ${
                activeTab === 'rhythm'
                  ? 'bg-[#22283e] text-[var(--wm-silk)]'
                  : 'text-[var(--wm-silk-dim)] hover:text-[var(--wm-silk)]'
              }`}
            >
              <WalkmanLed lit={activeTab === 'rhythm'} color="play" />
              <span>BEAT-SHIFT</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'drift'}
              data-pressed={activeTab === 'drift' ? 'true' : 'false'}
              onClick={() => setActiveTab('drift')}
              className={`wm-btn-well flex cursor-pointer items-center justify-center gap-1.5 py-2 text-center ${
                activeTab === 'drift'
                  ? 'bg-[#22283e] text-[var(--wm-silk)]'
                  : 'text-[var(--wm-silk-dim)] hover:text-[var(--wm-silk)]'
              }`}
            >
              <WalkmanLed lit={activeTab === 'drift'} color="mint" />
              <span>DRIFT</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'tofu'}
              data-pressed={activeTab === 'tofu' ? 'true' : 'false'}
              onClick={() => setActiveTab('tofu')}
              className={`wm-btn-well flex cursor-pointer items-center justify-center gap-1.5 py-2 text-center ${
                activeTab === 'tofu'
                  ? 'bg-[#22283e] text-[var(--wm-silk)]'
                  : 'text-[var(--wm-silk-dim)] hover:text-[var(--wm-silk)]'
              }`}
            >
              <WalkmanLed lit={activeTab === 'tofu'} color="amber" />
              <span>MELON SODA</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'controls'}
              data-pressed={activeTab === 'controls' ? 'true' : 'false'}
              onClick={() => setActiveTab('controls')}
              className={`wm-btn-well flex cursor-pointer items-center justify-center gap-1.5 py-2 text-center ${
                activeTab === 'controls'
                  ? 'bg-[#22283e] text-[var(--wm-silk)]'
                  : 'text-[var(--wm-silk-dim)] hover:text-[var(--wm-silk)]'
              }`}
            >
              <WalkmanLed lit={activeTab === 'controls'} color="play" />
              <span>CONTROLS</span>
            </button>
          </div>
        </div>

        {/* Manual Booklet Body */}
        <div className="ff-scroll flex-1 overflow-y-auto p-4 text-xs leading-relaxed text-[var(--wm-silk)]">
          {activeTab === 'rhythm' && (
            <div className="space-y-3">
              <div className="wm-lcd rounded-[2px] p-3">
                <div className="font-black tracking-wider text-[var(--wm-play)] uppercase">
                  6-SPEED BEAT-SHIFT
                </div>
                <p className="mt-1 text-[11px] text-[var(--wm-silk-dim)]">
                  Shift on the beat to build Groove and open up the music.
                </p>
              </div>

              <div className="grid grid-cols-1 gap-2.5 text-[11px] sm:grid-cols-2">
                <div className="wm-lcd rounded-[2px] p-3">
                  <div className="font-bold text-[var(--wm-mint)] uppercase">TIMING</div>
                  <ul className="mt-1.5 space-y-1 text-[var(--wm-silk-dim)]">
                    <li>
                      <span className="font-bold text-[var(--wm-mint)]">PERFECT:</span> Max Groove
                      boost
                    </li>
                    <li>
                      <span className="font-bold text-[var(--wm-silk)]">GOOD:</span> Steady Groove
                      gain
                    </li>
                    <li>
                      <span className="font-bold text-[var(--wm-play)]">BEAT 1:</span> 1.5× downbeat
                      bonus
                    </li>
                  </ul>
                </div>
                <div className="wm-lcd rounded-[2px] p-3">
                  <div className="font-bold text-[var(--wm-amber)] uppercase">ZERO PENALTY</div>
                  <p className="mt-1.5 text-[var(--wm-silk-dim)]">
                    Off-beat shifts never stall the car — they simply skip the bonus. Press{' '}
                    <code className="ff-mono text-[var(--wm-play)]">[G]</code> anytime for
                    auto-shift.
                  </p>
                </div>
              </div>

              <div className="wm-lcd rounded-[2px] p-3 text-[11px]">
                <div className="font-bold text-[var(--wm-silk)] uppercase">GROOVE TIERS</div>
                <p className="mt-1 text-[var(--wm-silk-dim)]">
                  <span className="font-bold text-[var(--wm-silk-dim)]">LOW</span> →{' '}
                  <span className="font-bold text-[var(--wm-mint)]">MEDIUM</span> →{' '}
                  <span className="font-bold text-[var(--wm-play)]">HIGH</span> →{' '}
                  <span className="font-bold text-[var(--wm-amber)]">OVERDRIVE</span>. Higher tiers
                  brighten the road and widen the stereo mix.
                </p>
              </div>
            </div>
          )}

          {activeTab === 'drift' && (
            <div className="space-y-3">
              <div className="wm-lcd rounded-[2px] p-3">
                <div className="font-black tracking-wider text-[var(--wm-mint)] uppercase">
                  CURVE SLIDE &amp; EXIT BOOST
                </div>
                <p className="mt-1 text-[11px] text-[var(--wm-silk-dim)]">
                  Lean into fast sweepers to hold your line without lifting off the gas.
                </p>
              </div>

              <div className="space-y-2 text-[11px]">
                <div className="wm-lcd flex gap-3 rounded-[2px] p-2.5">
                  <div className="w-24 shrink-0 font-bold text-[var(--wm-play)]">1. INITIATE</div>
                  <div className="text-[var(--wm-silk-dim)]">
                    Hold <code className="ff-mono text-[var(--wm-silk)]">[LCTRL]</code> while
                    steering, or tap <code className="ff-mono text-[var(--wm-silk)]">[S]</code> /{' '}
                    <code className="ff-mono text-[var(--wm-silk)]">[DOWN]</code> into a turn.
                  </div>
                </div>
                <div className="wm-lcd flex gap-3 rounded-[2px] p-2.5">
                  <div className="w-24 shrink-0 font-bold text-[var(--wm-mint)]">2. HOLD</div>
                  <div className="text-[var(--wm-silk-dim)]">
                    Counter-steer smoothly to keep the tail tucked through the apex.
                  </div>
                </div>
                <div className="wm-lcd flex gap-3 rounded-[2px] p-2.5">
                  <div className="w-24 shrink-0 font-bold text-[var(--wm-amber)]">3. BOOST</div>
                  <div className="text-[var(--wm-silk-dim)]">
                    Cleanly straighten out after holding a drift for a speed surge down the
                    straight.
                  </div>
                </div>
              </div>

              <div className="wm-lcd rounded-[2px] p-3 text-[11px]">
                <div className="font-bold text-[var(--wm-mint)] uppercase">KEEP MOVING</div>
                <p className="mt-1 text-[var(--wm-silk-dim)]">
                  Clipping signs or traffic dips your speed and Groove briefly, but never stops the
                  music or ends the drive.
                </p>
              </div>
            </div>
          )}

          {activeTab === 'tofu' && (
            <div className="space-y-3">
              <div className="wm-lcd rounded-[2px] p-3">
                <div className="font-black tracking-wider text-[var(--wm-amber)] uppercase">
                  DASHBOARD MELON SODA
                </div>
                <p className="mt-1 text-[11px] text-[var(--wm-silk-dim)]">
                  Smooth turns and gentle braking keep the melon soda inside the glass.
                </p>
              </div>

              <div className="grid grid-cols-1 gap-2.5 text-[11px] sm:grid-cols-2">
                <div className="wm-lcd rounded-[2px] p-3">
                  <div className="font-bold text-[var(--wm-mint)] uppercase">TOFU MODE [T]</div>
                  <p className="mt-1 text-[var(--wm-silk-dim)]">
                    Doubles all Groove earned from beat-shifts and clean corners.
                  </p>
                </div>
                <div className="wm-lcd rounded-[2px] p-3">
                  <div className="font-bold text-[var(--wm-play)] uppercase">SPILL PENALTY</div>
                  <p className="mt-1 text-[var(--wm-silk-dim)]">
                    Hard swerves or panic braking splash soda over the rim, costing 20% Groove.
                  </p>
                </div>
              </div>

              <div className="wm-lcd rounded-[2px] p-3 text-[11px]">
                <div className="font-bold text-[var(--wm-amber)] uppercase">CUP SKINS [V]</div>
                <p className="mt-1 text-[var(--wm-silk-dim)]">
                  Swap between Melon Soda, Tofu Water Cup, Pocari Sweat, and Boss Coffee.
                </p>
              </div>
            </div>
          )}

          {activeTab === 'controls' && (
            <div className="grid grid-cols-1 gap-2.5 text-[11px] sm:grid-cols-2">
              <div className="wm-lcd space-y-1.5 rounded-[2px] p-3">
                <div className="border-b border-[var(--wm-line)] pb-1 font-bold text-[var(--wm-mint)] uppercase">
                  KEYBOARD
                </div>
                <div className="flex justify-between">
                  <span className="text-[var(--wm-silk-dim)]">GAS</span>
                  <span className="ff-mono font-bold text-[var(--wm-silk)]">[W] / [UP]</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[var(--wm-silk-dim)]">BRAKE / DRIFT</span>
                  <span className="ff-mono font-bold text-[var(--wm-silk)]">[S] / [DOWN]</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[var(--wm-silk-dim)]">PURE DRIFT</span>
                  <span className="ff-mono font-bold text-[var(--wm-silk)]">[LCTRL]</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[var(--wm-silk-dim)]">STEER</span>
                  <span className="ff-mono font-bold text-[var(--wm-silk)]">[A] / [D]</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[var(--wm-silk-dim)]">SHIFT UP</span>
                  <span className="ff-mono font-bold text-[var(--wm-play)]">[SPACE]</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[var(--wm-silk-dim)]">SHIFT DOWN</span>
                  <span className="ff-mono font-bold text-[var(--wm-play)]">[SHIFT]</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[var(--wm-silk-dim)]">AUTO-SHIFT</span>
                  <span className="ff-mono font-bold text-[var(--wm-mint)]">[G]</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[var(--wm-silk-dim)]">TOFU MODE</span>
                  <span className="ff-mono font-bold text-[var(--wm-amber)]">[T]</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[var(--wm-silk-dim)]">CUP SKIN</span>
                  <span className="ff-mono font-bold text-[var(--wm-amber)]">[V]</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[var(--wm-silk-dim)]">MINIMAL HUD</span>
                  <span className="ff-mono font-bold text-[var(--wm-mint)]">[H]</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[var(--wm-silk-dim)]">PAUSE</span>
                  <span className="ff-mono font-bold text-[var(--wm-play)]">[P] / [ESC]</span>
                </div>
              </div>

              <div className="wm-lcd space-y-1.5 rounded-[2px] p-3">
                <div className="border-b border-[var(--wm-line)] pb-1 font-bold text-[var(--wm-amber)] uppercase">
                  GAMEPAD
                </div>
                <div className="flex justify-between">
                  <span className="text-[var(--wm-silk-dim)]">STEER</span>
                  <span className="ff-mono font-bold text-[var(--wm-silk)]">STICK / D-PAD</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[var(--wm-silk-dim)]">GAS</span>
                  <span className="ff-mono font-bold text-[var(--wm-silk)]">RT</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[var(--wm-silk-dim)]">BRAKE</span>
                  <span className="ff-mono font-bold text-[var(--wm-silk)]">LT</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[var(--wm-silk-dim)]">DRIFT</span>
                  <span className="ff-mono font-bold text-[var(--wm-play)]">A / CROSS</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[var(--wm-silk-dim)]">CUP SKIN</span>
                  <span className="ff-mono font-bold text-[var(--wm-amber)]">B / CIRCLE</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[var(--wm-silk-dim)]">TOFU MODE</span>
                  <span className="ff-mono font-bold text-[var(--wm-amber)]">Y / TRIANGLE</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[var(--wm-silk-dim)]">SHIFT UP / DN</span>
                  <span className="ff-mono font-bold text-[var(--wm-mint)]">RB / LB</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[var(--wm-silk-dim)]">AUTO-SHIFT</span>
                  <span className="ff-mono font-bold text-[var(--wm-mint)]">BACK</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[var(--wm-silk-dim)]">PAUSE</span>
                  <span className="ff-mono font-bold text-[var(--wm-play)]">START</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </WalkmanModalFrame>
    </div>
  );
}
