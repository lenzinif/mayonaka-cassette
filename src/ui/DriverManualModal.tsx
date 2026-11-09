import { useEffect, useState } from 'react';

export interface DriverManualModalProps {
  open: boolean;
  onClose: () => void;
}

type ManualTab = 'rhythm' | 'drift' | 'tofu' | 'controls';

/**
 * 1980s Retro Arcade Driver's Manual.
 * Concise guide to Beat-Shifting, Flow-preserving Drift physics, Melon Soda / Tofu Mode, and Controls.
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
      className="pointer-events-auto fixed inset-0 z-50 flex items-center justify-center bg-[#060112]/85 p-4 font-mono text-white select-none"
      role="dialog"
      aria-modal="true"
      aria-label="Controls &amp; Guide"
    >
      <div
        className="relative flex flex-col w-full max-w-2xl max-h-[85vh] overflow-hidden rounded-lg border-2 border-pink-500/70 bg-[#0d0221]/98 shadow-[0_0_40px_rgba(255,42,109,0.35)]"
        style={{ colorScheme: 'dark' }}
      >
        {/* Header: CONTROLS & GUIDE on left, BACK [ESC] on right */}
        <div className="flex items-center justify-between border-b border-fuchsia-500/30 bg-[#160435] px-4 py-2.5 text-xs font-black tracking-widest text-cyan-300 uppercase">
          <span>CONTROLS &amp; GUIDE</span>
          <button
            type="button"
            onClick={onClose}
            className="cursor-pointer rounded border border-fuchsia-400/40 bg-[#1a0636] px-2.5 py-1 text-[11px] font-bold tracking-wider text-fuchsia-200 transition hover:border-pink-400 hover:bg-pink-950/60 hover:text-white"
          >
            BACK [ESC]
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="grid grid-cols-4 border-b border-fuchsia-500/30 bg-[#12032b] text-[11px] font-bold">
          <button
            type="button"
            onClick={() => setActiveTab('rhythm')}
            className={`cursor-pointer py-2 text-center tracking-wider transition ${
              activeTab === 'rhythm'
                ? 'border-b-2 border-pink-400 bg-pink-950/40 text-pink-200'
                : 'text-fuchsia-300/60 hover:text-pink-300 hover:bg-pink-950/20'
            }`}
          >
            1. BEAT-SHIFT
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('drift')}
            className={`cursor-pointer py-2 text-center tracking-wider transition ${
              activeTab === 'drift'
                ? 'border-b-2 border-cyan-400 bg-cyan-950/40 text-cyan-200'
                : 'text-cyan-300/60 hover:text-cyan-300 hover:bg-cyan-950/20'
            }`}
          >
            2. DRIFT &amp; FLOW
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('tofu')}
            className={`cursor-pointer py-2 text-center tracking-wider transition ${
              activeTab === 'tofu'
                ? 'border-b-2 border-emerald-400 bg-emerald-950/40 text-emerald-200'
                : 'text-emerald-300/60 hover:text-emerald-300 hover:bg-emerald-950/20'
            }`}
          >
            3. MELON SODA
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('controls')}
            className={`cursor-pointer py-2 text-center tracking-wider transition ${
              activeTab === 'controls'
                ? 'border-b-2 border-amber-400 bg-amber-950/40 text-amber-200'
                : 'text-amber-300/60 hover:text-amber-300 hover:bg-amber-950/20'
            }`}
          >
            4. CONTROLS
          </button>
        </div>

        {/* Tab Body */}
        <div
          className="flex-1 overflow-y-auto p-4 text-xs leading-relaxed text-fuchsia-100/90"
          style={{ scrollbarColor: '#e879f9 #1a0633', scrollbarWidth: 'thin' }}
        >
          {activeTab === 'rhythm' && (
            <div className="space-y-3">
              <div className="rounded border border-pink-500/40 bg-pink-950/20 p-2.5">
                <div className="text-xs font-black tracking-wider text-pink-300 uppercase">
                  6-SPEED BEAT-SHIFT GEARBOX
                </div>
                <p className="mt-1 text-[11px] text-pink-100/80">
                  Shift gears on the musical beat to build Groove and sweep open the Web Audio low-pass filter.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-2.5 text-[11px]">
                <div className="rounded border border-cyan-400/30 bg-[#15042e] p-2.5">
                  <div className="font-bold text-cyan-300 uppercase">TIMING JUDGEMENT</div>
                  <ul className="mt-1.5 space-y-1 text-cyan-100/75">
                    <li><span className="text-emerald-300 font-bold">PERFECT (±50ms):</span> Max Groove + filter blip</li>
                    <li><span className="text-cyan-300 font-bold">GOOD (±100ms):</span> Standard Groove</li>
                    <li><span className="text-pink-300 font-bold">DOWNBEAT:</span> Beat 1 yields 1.5× bonus</li>
                  </ul>
                </div>
                <div className="rounded border border-cyan-400/30 bg-[#15042e] p-2.5">
                  <div className="font-bold text-cyan-300 uppercase">FLOW FIRST (NO PUNISH)</div>
                  <p className="mt-1.5 text-cyan-100/75">
                    Mistimed shifts never stall or damage the engine — they simply yield no bonus. Toggle auto-shift assist anytime with <code className="text-pink-300">[G]</code>.
                  </p>
                </div>
              </div>

              <div className="rounded border border-fuchsia-500/30 bg-[#180535] p-2.5 text-[11px]">
                <div className="font-bold text-fuchsia-300 uppercase">GROOVE TIERS</div>
                <p className="mt-1 text-fuchsia-200/80">
                  <span className="text-pink-300 font-bold">LOW</span> → <span className="text-fuchsia-300 font-bold">MEDIUM</span> → <span className="text-cyan-300 font-bold">HIGH</span> → <span className="text-emerald-300 font-bold">SSS OVERDRIVE</span>.
                  Higher tiers unlock full synthwave frequencies and road glow.
                </p>
              </div>
            </div>
          )}

          {activeTab === 'drift' && (
            <div className="space-y-3">
              <div className="rounded border border-cyan-400/40 bg-cyan-950/20 p-2.5">
                <div className="text-xs font-black tracking-wider text-cyan-300 uppercase">
                  CENTRIFUGAL PULL &amp; DRIFT
                </div>
                <p className="mt-1 text-[11px] text-cyan-100/80">
                  Curves exert centrifugal pull scaling with speed. Initiate slide to carve turns without letting off the throttle.
                </p>
              </div>

              <div className="space-y-2 text-[11px]">
                <div className="flex gap-3 rounded border border-cyan-400/20 bg-[#13032b] p-2.5">
                  <div className="font-bold text-pink-400 w-24 shrink-0">1. INITIATE:</div>
                  <div className="text-cyan-100/80">
                    Hold <code className="text-pink-300">[S]</code> / <code className="text-pink-300">[DOWN]</code> while steering into a curve at high speed.
                  </div>
                </div>
                <div className="flex gap-3 rounded border border-cyan-400/20 bg-[#13032b] p-2.5">
                  <div className="font-bold text-cyan-300 w-24 shrink-0">2. COUNTER:</div>
                  <div className="text-cyan-100/80">
                    Steer opposite to stabilize your line while centrifugal curve pull neutralizes.
                  </div>
                </div>
                <div className="flex gap-3 rounded border border-cyan-400/20 bg-[#13032b] p-2.5">
                  <div className="font-bold text-emerald-300 w-24 shrink-0">3. BOOST:</div>
                  <div className="text-cyan-100/80">
                    Straighten out cleanly after 0.6s+ of slide for a forward momentum kick.
                  </div>
                </div>
              </div>

              <div className="rounded border border-emerald-400/30 bg-[#092218] p-2.5 text-[11px]">
                <div className="font-bold text-emerald-300 uppercase">NO DEAD STOPS</div>
                <p className="mt-1 text-emerald-100/80">
                  Clipping roadside props or Kei trucks dips speed and Groove momentarily, but never halts momentum. The flow never breaks.
                </p>
              </div>
            </div>
          )}

          {activeTab === 'tofu' && (
            <div className="space-y-3">
              <div className="rounded border border-emerald-400/40 bg-emerald-950/20 p-2.5">
                <div className="text-xs font-black tracking-wider text-emerald-300 uppercase">
                  DASHBOARD MELON SODA &amp; TOFU MODE
                </div>
                <p className="mt-1 text-[11px] text-emerald-100/80">
                  Liquid meniscus sloshes in real-time with lateral and longitudinal jerk.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-2.5 text-[11px]">
                <div className="rounded border border-emerald-400/30 bg-[#0d211a] p-2.5">
                  <div className="font-bold text-emerald-300 uppercase">TOFU MODE [T]</div>
                  <p className="mt-1 text-emerald-100/75">
                    Toggle anytime. Doubles all Groove rewards from rhythm shifts and clean cornering.
                  </p>
                </div>
                <div className="rounded border border-amber-400/30 bg-[#241305] p-2.5">
                  <div className="font-bold text-amber-300 uppercase">SPILL PENALTY</div>
                  <p className="mt-1 text-amber-100/75">
                    Panic braking or jerky swerves slosh soda over the rim, deducting 10% Groove and adding tape slack.
                  </p>
                </div>
              </div>

              <div className="rounded border border-fuchsia-500/30 bg-[#180535] p-2.5 text-[11px]">
                <div className="font-bold text-fuchsia-300 uppercase">CUP SKINS [V]</div>
                <p className="mt-1 text-fuchsia-200/80">
                  Cycle classic Melon Soda, Ramune Blue, Sakura Pink, Electric Grape, Sunset Orange, or Diet Zero.
                </p>
              </div>
            </div>
          )}

          {activeTab === 'controls' && (
            <div className="grid grid-cols-2 gap-2.5 text-[11px]">
              <div className="space-y-1.5 rounded border border-cyan-400/30 bg-[#12042b] p-2.5">
                <div className="font-bold text-cyan-300 border-b border-cyan-400/20 pb-1 uppercase">KEYBOARD</div>
                <div className="flex justify-between"><span>THROTTLE:</span><span className="text-pink-300 font-bold">[W] / [UP]</span></div>
                <div className="flex justify-between"><span>BRAKE / DRIFT:</span><span className="text-pink-300 font-bold">[S] / [DOWN]</span></div>
                <div className="flex justify-between"><span>STEER:</span><span className="text-pink-300 font-bold">[A] / [D]</span></div>
                <div className="flex justify-between"><span>SHIFT UP:</span><span className="text-pink-300 font-bold">[SPACE] / [E]</span></div>
                <div className="flex justify-between"><span>SHIFT DOWN:</span><span className="text-pink-300 font-bold">[SHIFT] / [Q]</span></div>
                <div className="flex justify-between"><span>AUTO-SHIFT:</span><span className="text-pink-300 font-bold">[G]</span></div>
                <div className="flex justify-between"><span>TOFU MODE:</span><span className="text-pink-300 font-bold">[T]</span></div>
                <div className="flex justify-between"><span>CUP SKIN:</span><span className="text-pink-300 font-bold">[V]</span></div>
                <div className="flex justify-between"><span>CLEAN HUD:</span><span className="text-pink-300 font-bold">[H]</span></div>
                <div className="flex justify-between"><span>PAUSE:</span><span className="text-pink-300 font-bold">[P] / [ESC]</span></div>
              </div>

              <div className="space-y-1.5 rounded border border-amber-400/30 bg-[#191004] p-2.5">
                <div className="font-bold text-amber-300 border-b border-amber-400/20 pb-1 uppercase">GAMEPAD</div>
                <div className="flex justify-between"><span>STEERING:</span><span className="text-amber-200 font-bold">LEFT STICK / D-PAD</span></div>
                <div className="flex justify-between"><span>THROTTLE:</span><span className="text-amber-200 font-bold">RT / R2 / [A]</span></div>
                <div className="flex justify-between"><span>BRAKE:</span><span className="text-amber-200 font-bold">LT / L2 / [X]</span></div>
                <div className="flex justify-between"><span>DRIFT:</span><span className="text-amber-200 font-bold">[B] / CIRCLE</span></div>
                <div className="flex justify-between"><span>SHIFT UP/DN:</span><span className="text-amber-200 font-bold">RB / LB</span></div>
                <div className="flex justify-between"><span>PAUSE:</span><span className="text-amber-200 font-bold">START / MENU</span></div>
                <div className="flex justify-between"><span>RUMBLE:</span><span className="text-emerald-300 font-bold">ROAD HAPTICS</span></div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
