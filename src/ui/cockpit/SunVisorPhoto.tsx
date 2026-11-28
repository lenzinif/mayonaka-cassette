import { memo, useId } from 'react';
import { MAX_VISOR_PHOTOS, type VisorPhotoItem } from './visorPhotoStore';
import './cockpit.css';

export interface SunVisorPhotoProps {
  photos?: readonly VisorPhotoItem[];
  /** Legacy prop fallback for single-photo callers */
  photoUrl?: string | null;
}

interface ChainSlotConfig {
  offsetX: string;
  tiltDeg: string;
  origin: string;
  fastener: 'double-tape' | 'tape' | 'paperclip';
  fastenerPosClass: string;
  fastenerRotateDeg: number;
  secondaryPosClass?: string;
  secondaryRotateDeg?: number;
}

/**
 * Physically-coupled attachment progression (`docs/UI.md §5.2.4`):
 * - Slot 0 sits neatly pinned with two corner masking-tape strips (shifted slightly right).
 * - Subsequent slots hang from single off-center paperclips or single tape strips,
 *   growing progressively more crooked (`0.5° -> -2.5° -> +4.5° -> -6° -> +7.5°`).
 */
const CHAIN_SLOTS: readonly ChainSlotConfig[] = [
  {
    offsetX: '3.4cqh',
    tiltDeg: '0.5deg',
    origin: '50% 0%',
    fastener: 'double-tape',
    fastenerPosClass: 'left-[6%]',
    fastenerRotateDeg: -26,
    secondaryPosClass: 'right-[6%]',
    secondaryRotateDeg: 22,
  },
  {
    offsetX: '1.2cqh',
    tiltDeg: '-2.5deg',
    origin: '62% 0%',
    fastener: 'paperclip',
    fastenerPosClass: 'left-[62%]',
    fastenerRotateDeg: 3,
  },
  {
    offsetX: '-1.6cqh',
    tiltDeg: '4.5deg',
    origin: '16% 0%',
    fastener: 'tape',
    fastenerPosClass: 'left-[10%]',
    fastenerRotateDeg: -26,
  },
  {
    offsetX: '-2.6cqh',
    tiltDeg: '-6deg',
    origin: '72% 0%',
    fastener: 'paperclip',
    fastenerPosClass: 'left-[72%]',
    fastenerRotateDeg: -5,
  },
  {
    offsetX: '-0.8cqh',
    tiltDeg: '7.5deg',
    origin: '18% 0%',
    fastener: 'tape',
    fastenerPosClass: 'left-[12%]',
    fastenerRotateDeg: -31,
  },
] as const;

function DefaultVisorPostcard() {
  const skyGradId = useId();
  return (
    <svg
      viewBox="0 0 120 74"
      className="h-full w-full"
      role="img"
      aria-label="Default retro manga Tokyo night postcard"
    >
      <defs>
        <linearGradient id={skyGradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#1b0d2e" />
          <stop offset="55%" stopColor="#5c1b4c" />
          <stop offset="100%" stopColor="#e86f68" />
        </linearGradient>
      </defs>
      <rect width="120" height="74" fill={`url(#${skyGradId})`} />
      <circle cx="88" cy="24" r="14" fill="#ffe18c" />
      <rect x="74" y="25" width="28" height="2" fill="#5c1b4c" opacity="0.55" />
      <rect x="74" y="29" width="28" height="2" fill="#5c1b4c" opacity="0.7" />
      <rect x="74" y="33" width="28" height="2.5" fill="#5c1b4c" opacity="0.85" />
      <path
        d="M0 54 L0 38 L10 38 L10 44 L18 44 L18 30 L27 30 L27 42 L35 42 L35 22 L38 15 L41 22 L41 44 L54 44 L54 34 L66 34 L66 46 L78 46 L78 39 L94 39 L94 45 L106 45 L106 32 L116 32 L116 44 L120 44 L120 54 Z"
        fill="#130b1e"
      />
      <rect x="0" y="54" width="120" height="20" fill="#0d0816" />
      <line x1="0" y1="55" x2="120" y2="55" stroke="#38f2c8" strokeWidth="1" opacity="0.75" />
      <path d="M16 67 L22 60 L37 59 L46 63 L50 67 Z" fill="#f4ead8" />
      <circle cx="24" cy="67" r="2.6" fill="#0d0816" />
      <circle cx="42" cy="67" r="2.6" fill="#0d0816" />
      <rect x="46" y="64" width="3" height="1.6" fill="#ff4778" />
    </svg>
  );
}

function MaskingTapeStrip({ rotateDeg }: { rotateDeg: number }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 64 20"
      style={{ transform: `rotate(${rotateDeg}deg)` }}
      className="pointer-events-none h-[2.0cqh] w-[6.4cqh] drop-shadow-[0_2px_3px_rgba(0,0,0,0.45)]"
      preserveAspectRatio="none"
    >
      <path
        d="M2 2 L14 1 L32 2 L50 1 L62 2.5 L60 7 L63 12 L61 18.5 L44 17.5 L22 19 L3 17.5 L1 12 L3 7 Z"
        fill="rgba(243, 227, 174, 0.84)"
      />
      <path
        d="M3 4.5 L60 4.8"
        stroke="rgba(255, 250, 232, 0.45)"
        strokeWidth="1.1"
      />
      <path
        d="M2 16.5 L61 16.2"
        stroke="rgba(168, 138, 72, 0.28)"
        strokeWidth="1"
      />
    </svg>
  );
}

function PaperclipGlyph({ rotateDeg = 0 }: { rotateDeg?: number }) {
  return (
    <svg
      aria-hidden="true"
      style={{ transform: `rotate(${rotateDeg}deg)` }}
      className="pointer-events-none h-[4.2cqh] w-[2.4cqh] drop-shadow-[0_2px_2px_rgba(0,0,0,0.68)]"
      viewBox="0 0 18 32"
      fill="none"
    >
      <path
        d="M5 18 V7 C5 3.5, 13 3.5, 13 7 V25 C13 29, 4.5 29, 4.5 25 V11.5 C4.5 9, 10 9, 10 11.5 V22.5"
        stroke="#3b4252"
        strokeWidth="3.0"
        strokeLinecap="round"
      />
      <path
        d="M5 18 V7 C5 3.5, 13 3.5, 13 7 V25 C13 29, 4.5 29, 4.5 25 V11.5 C4.5 9, 10 9, 10 11.5 V22.5"
        stroke="#d8dee9"
        strokeWidth="1.9"
        strokeLinecap="round"
      />
      <path
        d="M5.4 16 V7.4 C5.4 4.8, 12.2 4.8, 12.2 7.4 V24.5"
        stroke="#ffffff"
        strokeWidth="0.65"
        strokeLinecap="round"
        opacity="0.7"
      />
    </svg>
  );
}

/**
 * Top-Right Oversized Sun Visor with Cascading Clipped & Taped Photo Chain
 * (`docs/UI.md §5.2.4`). Max 5 photos; zero HUD text or interactive controls.
 */
export const SunVisorPhoto = memo(function SunVisorPhoto({
  photos,
  photoUrl,
}: SunVisorPhotoProps) {
  const effectivePhotos: readonly VisorPhotoItem[] =
    photos && photos.length > 0
      ? photos.slice(0, MAX_VISOR_PHOTOS)
      : photoUrl
        ? [{ id: 'legacy-single', dataUrl: photoUrl }]
        : [];

  return (
    <div className="pointer-events-none relative flex origin-top-right flex-col items-center select-none [contain:layout]">
      {/* Dual roof visor hinge brackets */}
      <div className="flex w-[52cqh] justify-between px-[6cqh]">
        <span className="h-[1.6cqh] w-[4.4cqh] rounded-b-[1px] border-x border-b border-[rgba(217,167,92,0.45)] bg-[#231d29]" />
        <span className="h-[1.6cqh] w-[4.4cqh] rounded-b-[1px] border-x border-b border-[rgba(217,167,92,0.45)] bg-[#231d29]" />
      </div>

      {/* Oversized folded dark-leather sun visor flap */}
      <div className="ck-visor-shell relative h-[12.5cqh] w-[52cqh] rounded-b-[1.6cqh]">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-[2.5cqh] bottom-[1.4cqh] h-0 border-b border-dashed border-[rgba(214,174,114,0.3)]"
        />
      </div>

      {/* Cascading Polaroid / Postcard Stack hanging sloppily from visor */}
      <div className="-mt-[5.6cqh] flex flex-col items-center">
        {effectivePhotos.length === 0 ? (
          <div
            style={{
              transform: 'translateX(3.2cqh) rotate(0.5deg)',
              transformOrigin: '50% 0%',
            }}
            className="relative rounded-[2px] border-[0.55cqh] border-b-[1.6cqh] border-[#f1ead9] bg-[#f1ead9] shadow-[0_8px_18px_rgba(0,0,0,0.75)]"
          >
            <div className="absolute -top-[1.4cqh] left-[6%] z-20">
              <MaskingTapeStrip rotateDeg={-26} />
            </div>
            <div className="absolute -top-[1.4cqh] right-[6%] z-20">
              <MaskingTapeStrip rotateDeg={22} />
            </div>
            <div className="h-[17cqh] w-[27.5cqh] overflow-hidden bg-[#110c19] shadow-[inset_0_0_2px_rgba(0,0,0,0.45)]">
              <DefaultVisorPostcard />
            </div>
          </div>
        ) : (
          effectivePhotos.map((item, idx) => {
            const slot = CHAIN_SLOTS[idx % CHAIN_SLOTS.length]!;

            return (
              <div
                key={item.id}
                style={{
                  transform: `translateX(${slot.offsetX}) rotate(${slot.tiltDeg})`,
                  transformOrigin: slot.origin,
                }}
                className={`relative rounded-[2px] border-[0.55cqh] border-b-[1.6cqh] border-[#f1ead9] bg-[#f1ead9] shadow-[0_8px_18px_rgba(0,0,0,0.78)] ${
                  idx === 0 ? '' : '-mt-[2.1cqh]'
                }`}
              >
                {slot.fastener === 'paperclip' ? (
                  <div
                    className={`absolute -top-[2.4cqh] z-30 -translate-x-1/2 ${slot.fastenerPosClass}`}
                  >
                    <PaperclipGlyph rotateDeg={slot.fastenerRotateDeg} />
                  </div>
                ) : (
                  <>
                    <div className={`absolute -top-[1.5cqh] z-20 ${slot.fastenerPosClass}`}>
                      <MaskingTapeStrip rotateDeg={slot.fastenerRotateDeg} />
                    </div>
                    {slot.fastener === 'double-tape' && slot.secondaryPosClass && (
                      <div className={`absolute -top-[1.5cqh] z-20 ${slot.secondaryPosClass}`}>
                        <MaskingTapeStrip rotateDeg={slot.secondaryRotateDeg ?? 20} />
                      </div>
                    )}
                  </>
                )}

                <div className="inline-block overflow-hidden bg-[#110c19] shadow-[inset_0_0_2px_rgba(0,0,0,0.45)]">
                  <img
                    src={item.dataUrl}
                    alt={`Pinned visor photo ${idx + 1}`}
                    className="block h-auto w-auto max-h-[18.6cqh] max-w-[31cqh]"
                  />
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
});
