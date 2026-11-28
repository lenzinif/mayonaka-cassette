import { memo, useId } from 'react';
import { MAX_VISOR_PHOTOS, type VisorPhotoItem } from './visorPhotoStore';
import './cockpit.css';

export interface SunVisorPhotoProps {
  photos?: readonly VisorPhotoItem[];
  /** Legacy prop fallback for single-photo callers */
  photoUrl?: string | null;
}

const CHAIN_TILTS = ['-3.5deg', '3deg', '-2deg', '4deg', '-2.5deg'] as const;
const CHAIN_OFFSETS = ['-4px', '6px', '-6px', '7px', '-2px'] as const;

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

function PaperclipGlyph() {
  return (
    <svg
      aria-hidden="true"
      className="pointer-events-none h-7 w-4 drop-shadow-[0_2px_2px_rgba(0,0,0,0.65)]"
      viewBox="0 0 18 32"
      fill="none"
    >
      <path
        d="M5 24 V8 C5 4, 13 4, 13 8 V25 C13 29, 4 29, 4 24 V10 C4 7.5, 10 7.5, 10 10 V22"
        stroke="#d8dee9"
        strokeWidth="2.1"
        strokeLinecap="round"
      />
      <path
        d="M5 24 V8 C5 4, 13 4, 13 8 V25 C13 29, 4 29, 4 24 V10 C4 7.5, 10 7.5, 10 10 V22"
        stroke="#4c566a"
        strokeWidth="0.6"
        strokeLinecap="round"
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
    <div className="pointer-events-none relative flex origin-top-right scale-90 flex-col items-end select-none sm:scale-100 [contain:layout]">
      {/* Dual roof visor hinge brackets */}
      <div className="flex w-52 justify-between px-6 sm:w-64">
        <span className="h-2 w-6 rounded-b-[1px] border-x border-b border-[rgba(217,167,92,0.45)] bg-[#231d29]" />
        <span className="h-2 w-6 rounded-b-[1px] border-x border-b border-[rgba(217,167,92,0.45)] bg-[#231d29]" />
      </div>

      {/* Oversized folded dark-leather sun visor flap */}
      <div className="ck-visor-shell relative h-12 w-52 rounded-b-[10px] sm:h-14 sm:w-64">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-4 bottom-2 h-0 border-b border-dashed border-[rgba(214,174,114,0.3)]"
        />
      </div>

      {/* Cascading Polaroid / Postcard Stack hanging along far-right windshield edge */}
      <div className="-mt-6 mr-1 flex flex-col items-center sm:mr-2">
        {effectivePhotos.length === 0 ? (
          <div className="relative -rotate-2 rounded-[2px] border-[4px] border-b-[12px] border-[#efe7d6] bg-[#efe7d6] shadow-[0_6px_16px_rgba(0,0,0,0.72)]">
            <span
              aria-hidden="true"
              className="absolute -top-2 -left-3 z-20 h-3 w-10 -rotate-30 bg-[#f5e7b8]/85 shadow-sm"
            />
            <div className="h-[80px] w-[128px] overflow-hidden bg-[#110c19] sm:h-[88px] sm:w-[140px]">
              <DefaultVisorPostcard />
            </div>
          </div>
        ) : (
          effectivePhotos.map((item, idx) => {
            const tilt = CHAIN_TILTS[idx % CHAIN_TILTS.length]!;
            const offset = CHAIN_OFFSETS[idx % CHAIN_OFFSETS.length]!;
            const usePaperclip = idx % 2 === 1;

            return (
              <div
                key={item.id}
                style={{ transform: `translateX(${offset}) rotate(${tilt})` }}
                className={`relative rounded-[2px] border-[4px] border-b-[12px] border-[#efe7d6] bg-[#efe7d6] shadow-[0_6px_16px_rgba(0,0,0,0.75)] ${
                  idx === 0 ? '' : '-mt-2.5'
                }`}
              >
                {usePaperclip ? (
                  <div className="absolute -top-4 left-1/2 z-30 -translate-x-1/2">
                    <PaperclipGlyph />
                  </div>
                ) : (
                  <span
                    aria-hidden="true"
                    className={`absolute -top-2 z-20 h-3 w-9 bg-[#f5e7b8]/85 shadow-sm ${
                      idx % 4 === 0 ? '-left-3 -rotate-28' : '-right-3 rotate-28'
                    }`}
                  />
                )}

                <div className="h-[76px] w-[94px] overflow-hidden bg-[#110c19] sm:h-[84px] sm:w-[106px]">
                  <img
                    src={item.dataUrl}
                    alt={`Pinned visor photo ${idx + 1}`}
                    className="h-full w-full object-cover"
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
