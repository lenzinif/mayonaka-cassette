import { useEffect, useRef } from 'react';
import '../walkman/walkman.css';

export interface BackGuideSheetProps {
  variant?: 'deck' | 'portable';
  onFlipBack: () => void;
  active?: boolean;
}

function ChibiDriverDoodle() {
  return (
    <svg viewBox="0 0 96 108" className="w-16 sm:w-20" fill="none" aria-hidden="true">
      {/* Hair & head */}
      <path
        d="M28 38 C24 22, 36 12, 52 14 C66 15, 72 26, 68 40 L66 36 L60 40 L52 30 L42 36 L34 32 Z"
        fill="#faf3e0"
        stroke="#161822"
        strokeWidth="2.2"
        strokeLinejoin="round"
      />
      <path
        d="M29 38 C28 54, 37 64, 49 64 C61 64, 68 54, 67 40"
        fill="#faf3e0"
        stroke="#161822"
        strokeWidth="2.2"
      />
      {/* Hair spikes */}
      <path
        d="M27 32 L21 26 L29 25 M54 14 L58 7 L61 15 M67 27 L75 23 L69 32"
        stroke="#161822"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Sunglasses */}
      <rect x="33" y="40" width="14" height="9" rx="2" fill="#161822" />
      <rect x="50" y="40" width="14" height="9" rx="2" fill="#161822" />
      <line x1="47" y1="43" x2="50" y2="43" stroke="#161822" strokeWidth="2.2" />
      <line x1="35" y1="42" x2="40" y2="47" stroke="#faf3e0" strokeWidth="1.3" strokeLinecap="round" />
      <line x1="52" y1="42" x2="57" y2="47" stroke="#faf3e0" strokeWidth="1.3" strokeLinecap="round" />
      {/* Smirk */}
      <path d="M44 55 Q49 59 55 54" stroke="#161822" strokeWidth="2" strokeLinecap="round" />
      {/* Jacket & collar */}
      <path
        d="M27 86 L31 67 L42 64 L49 71 L56 64 L66 67 L70 86"
        fill="#faf3e0"
        stroke="#161822"
        strokeWidth="2.2"
        strokeLinejoin="round"
      />
      <path d="M42 64 L49 84 L56 64" stroke="#161822" strokeWidth="1.8" />
      {/* Peace sign hand */}
      <path
        d="M68 74 L74 58 C75 56, 78 57, 77 60 L74 69 L81 58 C82 56, 85 57, 84 60 L78 72 C82 73, 83 78, 79 82 L71 84 Z"
        fill="#faf3e0"
        stroke="#161822"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      {/* Sparkles */}
      <path d="M16 18 L18 12 L20 18 L26 20 L20 22 L18 28 L16 22 L10 20 Z" stroke="#161822" strokeWidth="1.4" />
      <path d="M78 24 L79.5 20 L81 24 L85 25.5 L81 27 L79.5 31 L78 27 L74 25.5 Z" stroke="#161822" strokeWidth="1.3" />
    </svg>
  );
}

function SodaMarginDoodle() {
  return (
    <svg viewBox="0 0 88 108" className="w-14 sm:w-16" fill="none" aria-hidden="true">
      {/* Striped bendy straw */}
      <path d="M51 35 L60 12 L72 15" stroke="#161822" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M51 35 L60 12 L72 15" stroke="#ff5c93" strokeWidth="2" strokeDasharray="3 3" strokeLinecap="round" />
      {/* Ice cream scoop + cherry */}
      <circle cx="42" cy="28" r="10" fill="#fff6d6" stroke="#161822" strokeWidth="2" />
      <circle cx="42" cy="16" r="4" fill="#ff3b6b" stroke="#161822" strokeWidth="1.8" />
      <path d="M44 13 Q48 8 53 9" stroke="#161822" strokeWidth="1.5" strokeLinecap="round" />
      {/* Fluted diner glass */}
      <path
        d="M24 34 L60 34 L53 74 L31 74 Z"
        fill="#7ef7c7"
        fillOpacity="0.65"
        stroke="#161822"
        strokeWidth="2.2"
        strokeLinejoin="round"
      />
      {/* Ice cubes & bubbles */}
      <rect x="33" y="42" width="9" height="8" rx="1.5" transform="rotate(-10 33 42)" stroke="#161822" strokeWidth="1.5" fill="#e6fff6" />
      <rect x="44" y="48" width="8" height="8" rx="1.5" transform="rotate(12 44 48)" stroke="#161822" strokeWidth="1.5" fill="#e6fff6" />
      <circle cx="38" cy="62" r="1.8" fill="#161822" />
      <circle cx="47" cy="65" r="1.5" fill="#161822" />
      {/* Stem & foot */}
      <rect x="39" y="74" width="6" height="12" fill="#faf3e0" stroke="#161822" strokeWidth="2" />
      <ellipse cx="42" cy="88" rx="14" ry="4" fill="#faf3e0" stroke="#161822" strokeWidth="2" />
      {/* Sparkles */}
      <path d="M14 48 L15.5 43 L17 48 L22 49.5 L17 51 L15.5 56 L14 51 L9 49.5 Z" stroke="#161822" strokeWidth="1.3" />
      <path d="M68 62 L69.5 58 L71 62 L75 63.5 L71 65 L69.5 69 L68 65 L64 63.5 Z" stroke="#161822" strokeWidth="1.3" />
    </svg>
  );
}

function CassetteStackDoodle() {
  return (
    <svg viewBox="0 0 96 108" className="w-16 sm:w-20" fill="none" aria-hidden="true">
      {/* Top tilted cassette */}
      <g transform="translate(14,8) rotate(14)">
        <rect x="0" y="0" width="56" height="34" rx="2.5" fill="#faf3e0" stroke="#161822" strokeWidth="2" />
        <rect x="5" y="5" width="46" height="19" rx="1.5" stroke="#161822" strokeWidth="1.5" />
        <circle cx="18" cy="14.5" r="4" stroke="#161822" strokeWidth="1.5" />
        <circle cx="38" cy="14.5" r="4" stroke="#161822" strokeWidth="1.5" />
        <rect x="24" y="12" width="8" height="5" stroke="#161822" strokeWidth="1.2" />
        <path d="M12 34 L15 28 L41 28 L44 34" stroke="#161822" strokeWidth="1.4" />
      </g>
      {/* Bottom tilted cassette */}
      <g transform="translate(22,56) rotate(-12)">
        <rect x="0" y="0" width="58" height="35" rx="2.5" fill="#faf3e0" stroke="#161822" strokeWidth="2" />
        <rect x="5" y="5" width="48" height="20" rx="1.5" stroke="#161822" strokeWidth="1.5" />
        <circle cx="19" cy="15" r="4" stroke="#161822" strokeWidth="1.5" />
        <circle cx="39" cy="15" r="4" stroke="#161822" strokeWidth="1.5" />
        <rect x="25" y="12.5" width="8" height="5" stroke="#161822" strokeWidth="1.2" />
      </g>
      {/* Sparkles */}
      <path d="M80 42 L81.5 37 L83 42 L88 43.5 L83 45 L81.5 50 L80 45 L75 43.5 Z" stroke="#161822" strokeWidth="1.4" />
    </svg>
  );
}

function DriftingCoupeDoodle() {
  return (
    <svg viewBox="0 0 110 88" className="w-20 sm:w-24" fill="none" aria-hidden="true">
      {/* Comic speed lines */}
      <line x1="6" y1="30" x2="34" y2="24" stroke="#161822" strokeWidth="1.6" strokeLinecap="round" />
      <line x1="4" y1="40" x2="28" y2="35" stroke="#161822" strokeWidth="1.6" strokeLinecap="round" />
      <line x1="8" y1="50" x2="26" y2="46" stroke="#161822" strokeWidth="1.6" strokeLinecap="round" />
      {/* 80s JDM hatchback coupe silhouette (zero real-world brands) */}
      <g transform="translate(18,16) rotate(-8)">
        <path
          d="M8 38 L14 26 L36 22 L58 14 L76 16 L84 28 L86 42 L10 46 Z"
          fill="#faf3e0"
          stroke="#161822"
          strokeWidth="2.2"
          strokeLinejoin="round"
        />
        {/* Side windows & hatch */}
        <path d="M38 23 L56 17 L73 18 L78 27 L38 27 Z" fill="#dff8f2" stroke="#161822" strokeWidth="1.6" />
        {/* Side stripe */}
        <line x1="12" y1="36" x2="82" y2="33" stroke="#161822" strokeWidth="1.8" />
        {/* Pop-up headlight & bumper */}
        <rect x="10" y="29" width="8" height="4" stroke="#161822" strokeWidth="1.5" fill="#fff6d6" />
        {/* Wheels */}
        <circle cx="28" cy="46" r="8" fill="#161822" />
        <circle cx="28" cy="46" r="3.5" fill="#faf3e0" />
        <circle cx="71" cy="43" r="8" fill="#161822" />
        <circle cx="71" cy="43" r="3.5" fill="#faf3e0" />
      </g>
      {/* Skid smoke puffs */}
      <path d="M72 68 Q82 64 90 69 Q96 65 102 70" stroke="#161822" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

/**
 * Rear hardware chassis & funky handwritten Driver's Guide zine sheet (`docs/UI.md §3.5 & §4.5`).
 * Shared between Title Cassette Deck back-flip and Pause Portable Player back-flip.
 */
export function BackGuideSheet({
  variant = 'deck',
  onFlipBack,
  active = true,
}: BackGuideSheetProps) {
  const sheetRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!active) return;
    const focusTimer = window.setTimeout(() => sheetRef.current?.focus(), 60);
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;
      if (e.key === 'Escape' || e.code === 'Escape') {
        e.preventDefault();
        e.stopImmediatePropagation();
        onFlipBack();
      }
    };
    window.addEventListener('keydown', onKeyDown, { capture: true });
    return () => {
      window.clearTimeout(focusTimer);
      window.removeEventListener('keydown', onKeyDown, { capture: true });
    };
  }, [active, onFlipBack]);

  return (
    <div
      ref={sheetRef}
      tabIndex={-1}
      className={`deck-brushed-silver relative w-full overflow-hidden rounded-[6px] p-2.5 outline-none sm:p-3.5 ${
        variant === 'portable' ? 'max-w-[700px]' : 'max-w-[740px]'
      }`}
    >
      {/* Top & bottom ventilation slots + corner Phillips screws */}
      <div className="mb-1.5 flex items-center justify-between px-1">
        <span className="h-2.5 w-2.5 rounded-full border border-[#222733] bg-[#5f6775] shadow-inner" />
        <div className="flex gap-1" aria-hidden="true">
          {Array.from({ length: 16 }).map((_, i) => (
            <span key={i} className="h-2 w-[3px] rounded-[1px] bg-[#1b202b]" />
          ))}
        </div>
        <span className="h-2.5 w-2.5 rounded-full border border-[#222733] bg-[#5f6775] shadow-inner" />
      </div>

      {/* Dark recessed rear metal housing */}
      <div className="relative rounded-[4px] border border-[#0c0e14] bg-[#1a1e29] p-2.5 sm:p-3.5">
        {/* Rear RCA/Aux ports hint along right edge */}
        <div
          aria-hidden="true"
          className="absolute top-1/2 right-1.5 hidden -translate-y-1/2 flex-col gap-2 sm:flex"
        >
          <span className="h-2.5 w-2.5 rounded-full border border-black bg-[#ff3b6b]" />
          <span className="h-2.5 w-2.5 rounded-full border border-black bg-[#f4efe6]" />
          <span className="h-2.5 w-2.5 rounded-full border border-black bg-[#2ee2be]" />
        </div>

        {/* Washi / Masking Tape Corners */}
        <span
          aria-hidden="true"
          className="pointer-events-none absolute top-2 left-3 z-20 h-4 w-14 -rotate-36 bg-[#f7b2c4]/85 shadow-sm"
        />
        <span
          aria-hidden="true"
          className="pointer-events-none absolute top-2 right-3 z-20 h-4 w-14 rotate-36 bg-[#8bf0d8]/85 shadow-sm"
        />
        <span
          aria-hidden="true"
          className="pointer-events-none absolute bottom-2 left-3 z-20 h-4 w-14 rotate-36 bg-[#f7b2c4]/85 shadow-sm"
        />
        <span
          aria-hidden="true"
          className="pointer-events-none absolute right-3 bottom-2 z-20 h-4 w-14 -rotate-36 bg-[#8bf0d8]/85 shadow-sm"
        />

        {/* Cream Paper Fanzine Sheet */}
        <div className="guide-zine-paper relative rounded-[2px] border border-[#161822]/25 px-3 py-2.5 sm:px-4 sm:py-3">
          {/* Funky Handwritten Title with Pastel Highlighter Streaks */}
          <div className="mb-2 flex items-center justify-center">
            <h2 className="guide-hand-title relative inline-flex items-center gap-2 text-xl font-black tracking-wider text-[#161822] uppercase sm:text-2xl">
              <span className="relative px-1.5">
                <span
                  aria-hidden="true"
                  className="absolute inset-x-0 bottom-0.5 h-3.5 -rotate-1 bg-[#ff6da6]/75"
                />
                <span className="relative">DRIVER&apos;S</span>
              </span>
              <span className="relative px-1.5">
                <span
                  aria-hidden="true"
                  className="absolute inset-x-0 bottom-0.5 h-3.5 rotate-1 bg-[#75f2d4]/80"
                />
                <span className="relative">GUIDE</span>
              </span>
            </h2>
          </div>

          {/* 3-Column Zine Layout: Left Anime Doodles · Center 2x2 Callouts · Right Anime Doodles */}
          <div className="grid grid-cols-1 items-center gap-3 md:grid-cols-[auto_1fr_auto]">
            {/* Left Margin Doodles */}
            <div className="hidden flex-col items-center justify-between gap-2 md:flex">
              <ChibiDriverDoodle />
              <SodaMarginDoodle />
            </div>

            {/* Center 2x2 Handwritten Callouts */}
            <div className="guide-hand-body grid grid-cols-1 gap-2.5 text-sm sm:grid-cols-2">
              {/* 1. BEAT-SHIFT */}
              <div className="relative rounded-[3px] border-2 border-[#161822] bg-[#faf3e0] px-3 py-2">
                <span className="guide-hand-title -mt-4 inline-block bg-[#faf3e0] px-1.5 text-xs font-black text-[#161822]">
                  BEAT-SHIFT
                </span>
                <div className="mt-1 flex items-center justify-between gap-2">
                  <div className="space-y-1 text-xs font-bold">
                    <div>
                      <span className="rounded-[2px] border border-[#161822] bg-[#fff] px-1.5 py-0.5 font-mono text-[10px]">
                        SPACE
                      </span>{' '}
                      UP
                    </div>
                    <div>
                      <span className="rounded-[2px] border border-[#161822] bg-[#fff] px-1.5 py-0.5 font-mono text-[10px]">
                        SHIFT
                      </span>{' '}
                      DOWN
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-mono text-[11px] font-black">1 - 2 - 3 - 4</div>
                    <div className="mt-0.5 inline-block rounded-[2px] bg-[#75f2d4]/85 px-1.5 py-0.5 text-xs font-black">
                      ♪ ♫ GROOVE +
                    </div>
                    <div className="mt-0.5 block rounded-[2px] bg-[#ff85b3]/75 px-1.5 py-0.5 text-[11px] font-bold">
                      NO MISS PENALTY
                    </div>
                  </div>
                </div>
              </div>

              {/* 2. DRIFT */}
              <div className="relative rounded-[3px] border-2 border-[#161822] bg-[#faf3e0] px-3 py-2">
                <span className="guide-hand-title -mt-4 inline-block bg-[#faf3e0] px-1.5 text-xs font-black text-[#161822]">
                  DRIFT
                </span>
                <div className="mt-0.5 flex flex-col items-center text-center">
                  <svg viewBox="0 0 110 38" className="h-9 w-28" fill="none" aria-hidden="true">
                    <path d="M10 32 C24 8, 72 6, 94 22" stroke="#161822" strokeWidth="1.6" />
                    <path d="M22 36 C34 18, 66 16, 86 28" stroke="#161822" strokeWidth="1.6" />
                    <path
                      d="M36 24 C46 14, 62 12, 76 16"
                      stroke="#161822"
                      strokeWidth="2.4"
                      strokeLinecap="round"
                    />
                    <path d="M71 12 L78 16 L71 20" stroke="#161822" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                    <rect
                      x="22"
                      y="20"
                      width="14"
                      height="7"
                      rx="1.5"
                      transform="rotate(-38 22 20)"
                      fill="#ff6da6"
                      stroke="#161822"
                      strokeWidth="1.6"
                    />
                  </svg>
                  <div className="mt-0.5 font-mono text-[11px] font-black">
                    [S] / [↓] + STEER · [LCTRL]
                  </div>
                </div>
              </div>

              {/* 3. TOFU CUP */}
              <div className="relative rounded-[3px] border-2 border-[#161822] bg-[#faf3e0] px-3 py-2">
                <span className="guide-hand-title -mt-4 inline-block bg-[#faf3e0] px-1.5 text-xs font-black text-[#161822]">
                  TOFU CUP
                </span>
                <div className="mt-1 flex items-center justify-around gap-2">
                  <svg viewBox="0 0 60 44" className="h-10 w-14" fill="none" aria-hidden="true">
                    <g transform="translate(14,4) rotate(-14)">
                      <path d="M4 10 L26 10 L22 34 L8 34 Z" fill="#7ef7c7" stroke="#161822" strokeWidth="2" />
                      <path d="M2 8 L9 2" stroke="#161822" strokeWidth="2" strokeLinecap="round" />
                    </g>
                  </svg>
                  <div className="text-center">
                    <span className="inline-block rounded-full border-2 border-[#161822] bg-[#fff] px-2.5 py-0.5 text-xs font-black">
                      NO SPILL!
                    </span>
                    <div className="mt-1 rounded-[2px] bg-[#ffd875]/85 px-1.5 py-0.5 text-[11px] font-black">
                      SMOOTH = GROOVE ×2
                    </div>
                  </div>
                </div>
              </div>

              {/* 4. CONTROLS */}
              <div className="relative rounded-[3px] border-2 border-[#161822] bg-[#faf3e0] px-3 py-2">
                <span className="guide-hand-title -mt-4 inline-block bg-[#faf3e0] px-1.5 text-xs font-black text-[#161822]">
                  CONTROLS
                </span>
                <div className="mt-1 flex items-center justify-between gap-2 text-[11px] font-black">
                  <div className="flex flex-col items-center gap-0.5 font-mono">
                    <span className="rounded-[2px] border border-[#161822] bg-[#fff] px-1.5 py-0.5">
                      W / ↑
                    </span>
                    <div className="flex gap-0.5">
                      <span className="rounded-[2px] border border-[#161822] bg-[#fff] px-1.5 py-0.5">
                        A
                      </span>
                      <span className="rounded-[2px] border border-[#161822] bg-[#fff] px-1.5 py-0.5">
                        S
                      </span>
                      <span className="rounded-[2px] border border-[#161822] bg-[#fff] px-1.5 py-0.5">
                        D
                      </span>
                    </div>
                    <span className="text-[9px] text-[#454a5c]">OR ARROWS</span>
                  </div>

                  <div className="space-y-1 text-right font-mono text-[10px]">
                    <div>
                      <span className="rounded-[2px] border border-[#161822] bg-[#fff] px-1.5 py-0.5">
                        P / ESC
                      </span>{' '}
                      PAUSE
                    </div>
                    <div className="text-[9px] text-[#454a5c]">PAD: RT/LT · RB/LB · START</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Right Margin Doodles */}
            <div className="hidden flex-col items-center justify-between gap-2 md:flex">
              <CassetteStackDoodle />
              <DriftingCoupeDoodle />
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Chassis Lip + Flip Back Pill */}
      <div className="mt-2 flex items-center justify-between px-1">
        <span className="h-2.5 w-2.5 rounded-full border border-[#222733] bg-[#5f6775] shadow-inner" />
        <button
          type="button"
          onClick={onFlipBack}
          className="ff-mono cursor-pointer rounded-full border border-[#2ee2be] bg-[#0c1424] px-3.5 py-1 text-[11px] font-black tracking-wider text-[#f4efe6] uppercase shadow transition hover:bg-[#17243d] hover:text-[#2ee2be] focus-visible:outline-2 focus-visible:outline-[#2ee2be]"
        >
          ↺ BACK [ESC]
        </button>
      </div>
    </div>
  );
}
