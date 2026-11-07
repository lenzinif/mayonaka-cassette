import { useState } from 'react';

export interface DriverManualModalProps {
  open: boolean;
  onClose: () => void;
}

type ManualTab = 'rhythm' | 'drift' | 'tofu' | 'controls';

/**
 * Retro 1980s Arcade Driver's Manual (Yu Suzuki Ethos & Mechanic Specs).
 * Explains Beat-Shifting, Flow-preserving Drift physics, Melon Soda / Tofu Mode, and Controls.
 */
export function DriverManualModal({ open, onClose }: DriverManualModalProps) {
  const [activeTab, setActiveTab] = useState<ManualTab>('rhythm');

  if (!open) return null;

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="pointer-events-auto fixed inset-0 z-50 flex items-center justify-center bg-[#060112]/94 p-4 font-mono text-white backdrop-blur-xs select-none"
      role="dialog"
      aria-modal="true"
      aria-label="Driver's Manual"
    >
      <div
        className="relative flex flex-col w-full max-w-2xl max-h-[88vh] overflow-hidden rounded-lg border-2 border-pink-500/70 bg-[#0d0221]/98 shadow-[0_0_50px_rgba(255,42,109,0.4)]"
        style={{ colorScheme: 'dark' }}
      >
        {/* Header Marquee */}
        <div className="flex items-center justify-between border-b border-fuchsia-500/30 bg-[#160435] px-4 py-2.5 text-[10px] tracking-[0.25em] text-cyan-300 uppercase">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-pink-500 animate-ping" />
            <span>OUTRUN FM // DRIVER&apos;S MANUAL</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="cursor-pointer text-pink-400 hover:text-white transition"
          >
            [✕ CLOSE]
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="grid grid-cols-4 border-b border-fuchsia-500/30 bg-[#12032b] text-[11px] font-bold">
          <button
            type="button"
            onClick={() => setActiveTab('rhythm')}
            className={`cursor-pointer py-2.5 text-center tracking-wider transition ${
              activeTab === 'rhythm'
                ? 'border-b-2 border-pink-400 bg-pink-950/40 text-pink-200 shadow-[0_0_15px_rgba(255,42,109,0.3)]'
                : 'text-fuchsia-300/60 hover:text-pink-300 hover:bg-pink-950/20'
            }`}
          >
            1. BEAT-SHIFT
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('drift')}
            className={`cursor-pointer py-2.5 text-center tracking-wider transition ${
              activeTab === 'drift'
                ? 'border-b-2 border-cyan-400 bg-cyan-950/40 text-cyan-200 shadow-[0_0_15px_rgba(5,217,232,0.3)]'
                : 'text-cyan-300/60 hover:text-cyan-300 hover:bg-cyan-950/20'
            }`}
          >
            2. DRIFT &amp; FLOW
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('tofu')}
            className={`cursor-pointer py-2.5 text-center tracking-wider transition ${
              activeTab === 'tofu'
                ? 'border-b-2 border-emerald-400 bg-emerald-950/40 text-emerald-200 shadow-[0_0_15px_rgba(16,185,129,0.3)]'
                : 'text-emerald-300/60 hover:text-emerald-300 hover:bg-emerald-950/20'
            }`}
          >
            3. MELON SODA
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('controls')}
            className={`cursor-pointer py-2.5 text-center tracking-wider transition ${
              activeTab === 'controls'
                ? 'border-b-2 border-amber-400 bg-amber-950/40 text-amber-200 shadow-[0_0_15px_rgba(245,158,11,0.3)]'
                : 'text-amber-300/60 hover:text-amber-300 hover:bg-amber-950/20'
            }`}
          >
            4. CONTROLS
          </button>
        </div>

        {/* Tab Body */}
        <div
          className="flex-1 overflow-y-auto p-5 text-xs leading-relaxed text-fuchsia-100/90"
          style={{ scrollbarColor: '#e879f9 #1a0633', scrollbarWidth: 'thin' }}
        >
          {activeTab === 'rhythm' && (
            <div className="space-y-4">
              <div className="rounded border border-pink-500/40 bg-pink-950/20 p-3">
                <div className="text-sm font-black tracking-wider text-pink-300 uppercase">
                  ♪ The 6-Speed Beat-Shift Gearbox
                </div>
                <p className="mt-1 text-xs text-pink-100/80">
                  Your car has a 6-speed fake torque transmission. Unlike standard racers, shifting is a rhythm mechanic!
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3 text-[11px]">
                <div className="rounded border border-cyan-400/30 bg-[#15042e] p-3">
                  <div className="font-bold text-cyan-300 uppercase">Shift Timing Judgement</div>
                  <ul className="mt-2 space-y-1 text-cyan-100/70">
                    <li><span className="text-emerald-300 font-bold">PERFECT (±50ms):</span> Massive Groove bonus + filter blip!</li>
                    <li><span className="text-cyan-300 font-bold">GOOD (±100ms):</span> Standard Groove reward.</li>
                    <li><span className="text-pink-300 font-bold">DOWNBEAT BONUS:</span> Shift on Beat 1 of a bar for 1.5× bonus!</li>
                  </ul>
                </div>
                <div className="rounded border border-cyan-400/30 bg-[#15042e] p-3">
                  <div className="font-bold text-cyan-300 uppercase">Yu Suzuki Ethos (No Punish)</div>
                  <p className="mt-2 text-cyan-100/70">
                    Mistimed shifts or shifting at low RPM never stall or damage the engine — they simply yield no bonus.
                    Auto-shift assist can be toggled anytime with <code className="text-pink-300">[G]</code>.
                  </p>
                </div>
              </div>

              <div className="rounded border border-fuchsia-500/30 bg-[#180535] p-3 text-[11px]">
                <div className="font-bold text-fuchsia-300 uppercase">Groove Tiers &amp; Audio Filter</div>
                <p className="mt-1 text-fuchsia-200/80">
                  Building Groove advances your tier from <span className="text-pink-300 font-bold">LOW</span> → <span className="text-fuchsia-300 font-bold">MEDIUM</span> → <span className="text-cyan-300 font-bold">HIGH</span> → <span className="text-emerald-300 font-bold">SSS (FUNKY OVERDRIVE)</span>.
                  Higher Groove sweeps open the Web Audio low-pass filter, unleashing full synthwave frequencies!
                </p>
              </div>
            </div>
          )}

          {activeTab === 'drift' && (
            <div className="space-y-4">
              <div className="rounded border border-cyan-400/40 bg-cyan-950/20 p-3">
                <div className="text-sm font-black tracking-wider text-cyan-300 uppercase">
                  ★ Centrifugal Pull &amp; Clean Drifting
                </div>
                <p className="mt-1 text-xs text-cyan-100/80">
                  Curves exert centrifugal pull that scales quadratically with speed. Mastering the drift lets you carve sharp turns at full throttle.
                </p>
              </div>

              <div className="space-y-2 text-[11px]">
                <div className="flex gap-3 rounded border border-cyan-400/20 bg-[#13032b] p-3">
                  <div className="font-bold text-pink-400 w-24 shrink-0">ENTRY:</div>
                  <div className="text-cyan-100/80">
                    While steering into a curve at high speed, hold <code className="text-pink-300">[S]</code> or <code className="text-pink-300">[DOWN]</code> while steering. The rear slides out and neon tire smoke erupts.
                  </div>
                </div>
                <div className="flex gap-3 rounded border border-cyan-400/20 bg-[#13032b] p-3">
                  <div className="font-bold text-cyan-300 w-24 shrink-0">COUNTER-STEER:</div>
                  <div className="text-cyan-100/80">
                    Hold opposite steering to hold your line on the asphalt while centrifugal curve pull neutralizes.
                  </div>
                </div>
                <div className="flex gap-3 rounded border border-cyan-400/20 bg-[#13032b] p-3">
                  <div className="font-bold text-emerald-300 w-24 shrink-0">EXIT BOOST:</div>
                  <div className="text-cyan-100/80">
                    Straighten out cleanly after holding the slide for over 0.6 seconds to gain a smooth momentum kick!
                  </div>
                </div>
              </div>

              <div className="rounded border border-emerald-400/30 bg-[#092218] p-3 text-[11px]">
                <div className="font-bold text-emerald-300 uppercase">Protect the Flow State (No Dead Stops)</div>
                <p className="mt-1 text-emerald-100/80">
                  Clipping roadside props or Kei trucks will momentarily dip speed and Groove, but will NEVER cause a game-over crash or halt your momentum. You keep driving!
                </p>
              </div>
            </div>
          )}

          {activeTab === 'tofu' && (
            <div className="space-y-4">
              <div className="rounded border border-emerald-400/40 bg-emerald-950/20 p-3">
                <div className="text-sm font-black tracking-wider text-emerald-300 uppercase">
                  🥤 Dashboard Melon Soda &amp; Tofu Mode
                </div>
                <p className="mt-1 text-xs text-emerald-100/80">
                  Resting in your dashboard cup holder is an iced Melon Soda. Its liquid meniscus responds in real-time to lateral and longitudinal jerk!
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3 text-[11px]">
                <div className="rounded border border-emerald-400/30 bg-[#0d211a] p-3">
                  <div className="font-bold text-emerald-300 uppercase">Tofu Mode (2× Groove Multiplier)</div>
                  <p className="mt-2 text-emerald-100/70">
                    Toggle with <code className="text-emerald-300">[T]</code>. While active, all Groove gains from rhythm shifts and clean curves are doubled!
                  </p>
                </div>
                <div className="rounded border border-amber-400/30 bg-[#241305] p-3">
                  <div className="font-bold text-amber-300 uppercase">Spill Penalty</div>
                  <p className="mt-2 text-amber-100/70">
                    Jerky steering, sudden swerves, or panic braking will slosh the soda over the rim. Spills deduct 10% Groove and trigger cassette tape slack!
                  </p>
                </div>
              </div>

              <div className="rounded border border-fuchsia-500/30 bg-[#180535] p-3 text-[11px]">
                <div className="font-bold text-fuchsia-300 uppercase">Dashboard Cup Customization</div>
                <p className="mt-1 text-fuchsia-200/80">
                  Press <code className="text-pink-300">[V]</code> or visit Options to customize your cup: Classic Melon Soda, Ramune Blue, Sakura Pink, Electric Grape, Sunset Orange, or Diet Zero.
                </p>
              </div>
            </div>
          )}

          {activeTab === 'controls' && (
            <div className="space-y-4">
              <div className="rounded border border-amber-400/40 bg-amber-950/20 p-3">
                <div className="text-sm font-black tracking-wider text-amber-300 uppercase">
                  ⌨ Cockpit Controls Reference
                </div>
                <p className="mt-1 text-xs text-amber-100/80">
                  Full keyboard and gamepad support. Keybinds can be operated simultaneously.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3 text-[11px]">
                <div className="space-y-2 rounded border border-cyan-400/30 bg-[#12042b] p-3">
                  <div className="font-bold text-cyan-300 border-b border-cyan-400/20 pb-1">KEYBOARD MAPPINGS</div>
                  <div className="flex justify-between"><span>THROTTLE:</span><span className="text-pink-300">[W] / [UP]</span></div>
                  <div className="flex justify-between"><span>BRAKE / DRIFT:</span><span className="text-pink-300">[S] / [DOWN]</span></div>
                  <div className="flex justify-between"><span>STEER LEFT / RIGHT:</span><span className="text-pink-300">[A] / [D]</span></div>
                  <div className="flex justify-between"><span>SHIFT UP:</span><span className="text-pink-300">[SPACE] / [E]</span></div>
                  <div className="flex justify-between"><span>SHIFT DOWN:</span><span className="text-pink-300">[SHIFT] / [Q]</span></div>
                  <div className="flex justify-between"><span>PAUSE / RESUME:</span><span className="text-pink-300">[P] / [ESC]</span></div>
                  <div className="flex justify-between"><span>AUTO-SHIFT ASSIST:</span><span className="text-pink-300">[G]</span></div>
                  <div className="flex justify-between"><span>TOFU MODE:</span><span className="text-pink-300">[T]</span></div>
                  <div className="flex justify-between"><span>CYCLE CUP SKIN:</span><span className="text-pink-300">[V]</span></div>
                  <div className="flex justify-between"><span>CASSETTE TAPE HUD:</span><span className="text-pink-300">[C]</span></div>
                  <div className="flex justify-between"><span>CLEAN MINIMAL HUD:</span><span className="text-pink-300">[H]</span></div>
                  <div className="flex justify-between"><span>AI AUTOPILOT:</span><span className="text-pink-300">[F4]</span></div>
                  <div className="flex justify-between"><span>TUNING PANEL:</span><span className="text-pink-300">[F2]</span></div>
                </div>

                <div className="space-y-2 rounded border border-amber-400/30 bg-[#191004] p-3">
                  <div className="font-bold text-amber-300 border-b border-amber-400/20 pb-1">GAMEPAD (XINPUT / PS)</div>
                  <div className="flex justify-between"><span>STEERING:</span><span className="text-amber-200">LEFT ANALOG / D-PAD</span></div>
                  <div className="flex justify-between"><span>THROTTLE:</span><span className="text-amber-200">RT / R2 / [A]</span></div>
                  <div className="flex justify-between"><span>BRAKE:</span><span className="text-amber-200">LT / L2 / [X]</span></div>
                  <div className="flex justify-between"><span>DRIFT:</span><span className="text-amber-200">[B] / CIRCLE</span></div>
                  <div className="flex justify-between"><span>SHIFT UP / DOWN:</span><span className="text-amber-200">RB / LB (BUMPERS)</span></div>
                  <div className="flex justify-between"><span>PAUSE:</span><span className="text-amber-200">START / MENU</span></div>
                  <div className="flex justify-between"><span>VIBRATION:</span><span className="text-emerald-300">HAPTIC ROAD RUMBLE</span></div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer Dismiss */}
        <div className="flex items-center justify-between border-t border-fuchsia-500/30 bg-[#12032b] px-4 py-3">
          <span className="text-[10px] text-fuchsia-300/60 uppercase">
            PRESS [ESC] OR CLICK OUTSIDE TO RETURN
          </span>
          <button
            type="button"
            onClick={onClose}
            className="cursor-pointer rounded border border-pink-400/80 bg-pink-600/80 px-4 py-1.5 text-xs font-bold tracking-wider text-white uppercase transition hover:bg-pink-500 hover:shadow-[0_0_15px_rgba(255,42,109,0.5)]"
          >
            GOT IT // UNDERSTOOD
          </button>
        </div>
      </div>
    </div>
  );
}
