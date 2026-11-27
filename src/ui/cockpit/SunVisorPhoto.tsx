import { memo, useId, useRef, type ChangeEvent } from 'react';
import './cockpit.css';

export interface SunVisorPhotoProps {
  photoUrl: string | null;
  onUploadPhoto?: (file: File) => void;
  onClearPhoto?: () => void;
}

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
      {/* Retro manga moon */}
      <circle cx="88" cy="24" r="14" fill="#ffe18c" />
      <rect x="74" y="25" width="28" height="2" fill="#5c1b4c" opacity="0.55" />
      <rect x="74" y="29" width="28" height="2" fill="#5c1b4c" opacity="0.7" />
      <rect x="74" y="33" width="28" height="2.5" fill="#5c1b4c" opacity="0.85" />
      {/* Tokyo skyline silhouette */}
      <path
        d="M0 54 L0 38 L10 38 L10 44 L18 44 L18 30 L27 30 L27 42 L35 42 L35 22 L38 15 L41 22 L41 44 L54 44 L54 34 L66 34 L66 46 L78 46 L78 39 L94 39 L94 45 L106 45 L106 32 L116 32 L116 44 L120 44 L120 54 Z"
        fill="#130b1e"
      />
      {/* Highway deck & coupe silhouette */}
      <rect x="0" y="54" width="120" height="20" fill="#0d0816" />
      <line x1="0" y1="55" x2="120" y2="55" stroke="#38f2c8" strokeWidth="1" opacity="0.75" />
      <path d="M16 67 L22 60 L37 59 L46 63 L50 67 Z" fill="#f4ead8" />
      <circle cx="24" cy="67" r="2.6" fill="#0d0816" />
      <circle cx="42" cy="67" r="2.6" fill="#0d0816" />
      <rect x="46" y="64" width="3" height="1.6" fill="#ff4778" />
      {/* Manga ink stamp */}
      <text
        x="7"
        y="13"
        fill="#fff5e4"
        fontSize="7"
        fontWeight="bold"
        fontFamily="monospace"
        letterSpacing="1"
      >
        真夜中
      </text>
    </svg>
  );
}

/**
 * Diegetic 80s JDM driver-side folded leather sun visor with a clipped photo slot.
 * Supports local image upload persisted client-side in IndexedDB.
 */
export const SunVisorPhoto = memo(function SunVisorPhoto({
  photoUrl,
  onUploadPhoto,
  onClearPhoto,
}: SunVisorPhotoProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (file) {
      onUploadPhoto?.(file);
    }
  };

  return (
    <div className="group pointer-events-none relative flex origin-top scale-90 flex-col items-center sm:scale-100 [contain:layout_style_paint] [transform:translateZ(0)]">
      {/* Dual roof visor hinge brackets */}
      <div className="flex w-64 justify-between px-6">
        <span className="h-2 w-5 rounded-b-[1px] border-x border-b border-[rgba(217,167,92,0.45)] bg-[#231d29]" />
        <span className="h-2 w-5 rounded-b-[1px] border-x border-b border-[rgba(217,167,92,0.45)] bg-[#231d29]" />
      </div>

      {/* Folded dark-leather visor flap */}
      <div className="ck-visor-shell relative flex items-center gap-3.5 rounded-b-[8px] px-4 pt-2.5 pb-3">
        {/* Decorative warm saddle stitch */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-3 bottom-1.5 h-0 border-b border-dashed border-[rgba(214,174,114,0.28)]"
        />

        {/* Pinned photo tucked under elastic strap */}
        <div className="relative -rotate-1 rounded-[3px] border-2 border-[#efe7d6]/90 bg-[#efe7d6] p-[4px] shadow-[0_4px_12px_rgba(0,0,0,0.7)]">
          {/* Elastic visor strap & brass clip */}
          <span
            aria-hidden="true"
            className="pointer-events-none absolute -top-1.5 left-1/2 h-3 w-10 -translate-x-1/2 rounded-[1px] border border-[rgba(217,167,92,0.8)] bg-[#2b221e]"
          />

          <div className="h-[104px] w-[168px] overflow-hidden bg-[#110c19] xl:h-[120px] xl:w-[194px]">
            {photoUrl ? (
              <img
                src={photoUrl}
                alt="Pinned sun visor photo"
                className="h-full w-full object-cover"
              />
            ) : (
              <DefaultVisorPostcard />
            )}
          </div>
        </div>

        {/* Visor nameplate & subtle hover/focus upload controls */}
        <div className="flex flex-col items-start gap-1.5 pr-1">
          <span className="ff-mono text-[9px] font-bold tracking-[0.18em] text-[var(--ck-brass)] uppercase">
            SUN VISOR
          </span>
          <span className="ff-mono text-[8px] tracking-wider text-[#b6a997] uppercase">
            {photoUrl ? 'CUSTOM CLIP' : 'TOKYO 86'}
          </span>

          {(onUploadPhoto || onClearPhoto) && (
            <div className="pointer-events-auto flex items-center gap-1 opacity-80 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
              {onUploadPhoto && (
                <button
                  type="button"
                  onClick={(e) => {
                    inputRef.current?.click();
                    e.currentTarget.blur();
                  }}
                  className="ck-din-btn ff-mono cursor-pointer px-2 py-0.5 text-[9px] font-bold tracking-wider uppercase"
                  title="Pin local manga/anime image onto sun visor"
                >
                  PIN PHOTO
                </button>
              )}
              {photoUrl && onClearPhoto && (
                <button
                  type="button"
                  aria-label="Reset sun visor photo"
                  onClick={(e) => {
                    onClearPhoto();
                    e.currentTarget.blur();
                  }}
                  className="ck-din-btn ff-mono cursor-pointer px-1.5 py-0.5 text-[9px] font-bold text-[#ff8aa9] uppercase"
                  title="Reset to default postcard"
                >
                  ✕
                </button>
              )}
            </div>
          )}
        </div>

        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          onChange={handleFileChange}
          className="hidden"
          aria-hidden="true"
          tabIndex={-1}
        />
      </div>
    </div>
  );
});
