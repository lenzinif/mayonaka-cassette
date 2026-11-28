import { SODA_SKINS, SODA_SKIN_LABELS, type SodaSkin } from '@src/entities/MelonSoda';
import { useEffect, useRef, type ChangeEvent } from 'react';
import {
  COCKPIT_PRESET_CLEAN,
  COCKPIT_PRESET_CLUTTER,
  isCleanPreset,
  isLuxuryPreset,
  type CockpitVisibility,
} from '../cockpit/cockpitSettings';
import { MAX_VISOR_PHOTOS, type VisorPhotoItem } from '../cockpit/visorPhotoStore';
import '../walkman/walkman.css';

export interface OptionsPanelProps {
  autoShift: boolean;
  onToggleAutoShift: () => void;
  tofuMode: boolean;
  onToggleTofuMode: () => void;
  sodaSkin: SodaSkin;
  onCycleSodaSkin: () => void;
  crtEnabled: boolean;
  onToggleCrt: () => void;
  cockpitVisibility: CockpitVisibility;
  onToggleCockpitModule: (key: keyof CockpitVisibility) => void;
  onApplyCockpitPreset: (preset: CockpitVisibility) => void;
  visorPhotos: readonly VisorPhotoItem[];
  onAddVisorPhotos?: (files: readonly File[]) => void;
  onAddVisorPhoto?: (file: File) => void;
  onRemoveVisorPhoto: (id: string) => void;
  onClearVisorPhotos: () => void;
  onOpenCassettes?: () => void;
  onClose?: () => void;
  maxHeightClass?: string;
}

/**
 * Shared Configuration Panel reused identically across Title Screen and Pause Menu
 * (`docs/UI.md §4.3`). Zero live gameplay shortcut hints; zero real-world brands.
 */
export function OptionsPanel({
  autoShift,
  onToggleAutoShift,
  tofuMode,
  onToggleTofuMode,
  sodaSkin,
  onCycleSodaSkin,
  crtEnabled,
  onToggleCrt,
  cockpitVisibility,
  onToggleCockpitModule,
  onApplyCockpitPreset,
  visorPhotos,
  onAddVisorPhotos,
  onAddVisorPhoto,
  onRemoveVisorPhoto,
  onClearVisorPhotos,
  onOpenCassettes,
  onClose,
  maxHeightClass = 'max-h-[82vh]',
}: OptionsPanelProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const firstFocusRef = useRef<HTMLButtonElement | null>(null);
  const clutterActive = isLuxuryPreset(cockpitVisibility);
  const cleanActive = isCleanPreset(cockpitVisibility);

  useEffect(() => {
    firstFocusRef.current?.focus();
  }, []);

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files ? Array.from(e.target.files) : [];
    if (files.length > 0) {
      if (onAddVisorPhotos) {
        onAddVisorPhotos(files);
      } else if (onAddVisorPhoto) {
        const remaining = Math.max(0, MAX_VISOR_PHOTOS - visorPhotos.length);
        for (let i = 0; i < Math.min(files.length, remaining); i++) {
          const f = files[i];
          if (f) onAddVisorPhoto(f);
        }
      }
    }
    e.target.value = '';
  };

  const safeSkinLabel =
    SODA_SKIN_LABELS[SODA_SKINS.includes(sodaSkin) ? sodaSkin : 'melon-soda'] ?? 'MELON SODA';

  return (
    <div
      className={`ff-scroll pointer-events-auto w-full max-w-[360px] overflow-y-auto rounded-[4px] border border-[#2ee2be]/65 bg-[#0c101c]/95 p-3 text-[var(--wm-silk)] shadow-[0_14px_36px_rgba(3,5,12,0.85)] select-none ${maxHeightClass}`}
      style={{ colorScheme: 'dark' }}
    >
      {onClose && (
        <div className="mb-2 flex items-center justify-between border-b border-[var(--wm-line)] pb-1.5">
          <span className="ff-mono text-[11px] font-black tracking-[0.18em] text-[#2ee2be] uppercase">
            OPTIONS
          </span>
          <button
            type="button"
            onClick={onClose}
            className="wm-btn ff-mono cursor-pointer px-2 py-0.5 text-[10px] font-black tracking-wider text-[var(--wm-silk)] uppercase hover:text-[var(--wm-play)]"
          >
            BACK [ESC]
          </button>
        </div>
      )}

      <div className="divide-y divide-[var(--wm-line)] text-[11px]">
        {/* GEARBOX */}
        <div className="flex items-center justify-between py-2">
          <span className="ff-mono font-bold tracking-[0.14em] uppercase">GEARBOX</span>
          <button
            ref={firstFocusRef}
            type="button"
            aria-label={`Gearbox mode: ${autoShift ? 'AUTO' : 'MANUAL'}`}
            aria-pressed={autoShift}
            onClick={onToggleAutoShift}
            className="wm-lcd ff-mono flex cursor-pointer items-center gap-1.5 rounded-[2px] px-2.5 py-1 text-[10px] font-black tracking-wider uppercase"
          >
            <span className={!autoShift ? 'text-[#2ee2be]' : 'text-[var(--wm-silk-dim)]'}>
              MANUAL
            </span>
            <span className="text-[var(--wm-silk-dim)]">|</span>
            <span className={autoShift ? 'text-[var(--wm-amber)]' : 'text-[var(--wm-silk-dim)]'}>
              AUTO
            </span>
          </button>
        </div>

        {/* TOFU CUP */}
        <div className="flex items-center justify-between py-2">
          <span className="ff-mono font-bold tracking-[0.14em] uppercase">TOFU CUP</span>
          <button
            type="button"
            aria-label={`Tofu cup: ${tofuMode ? 'ON' : 'OFF'}`}
            aria-pressed={tofuMode}
            onClick={onToggleTofuMode}
            className="wm-lcd ff-mono flex cursor-pointer items-center gap-1.5 rounded-[2px] px-2.5 py-1 text-[10px] font-black tracking-wider uppercase"
          >
            <span className={tofuMode ? 'text-[#2ee2be]' : 'text-[var(--wm-silk-dim)]'}>ON</span>
            <span className="text-[var(--wm-silk-dim)]">|</span>
            <span className={!tofuMode ? 'text-[var(--wm-silk)]' : 'text-[var(--wm-silk-dim)]'}>
              OFF
            </span>
          </button>
        </div>

        {/* DRINK */}
        <div className="flex items-center justify-between py-2">
          <span className="ff-mono font-bold tracking-[0.14em] uppercase">DRINK</span>
          <button
            type="button"
            aria-label={`Drink style: ${safeSkinLabel}`}
            onClick={onCycleSodaSkin}
            className="wm-lcd ff-mono cursor-pointer rounded-[2px] px-2.5 py-1 text-[10px] font-black tracking-wider text-[#2ee2be] uppercase hover:text-[var(--wm-amber)]"
          >
            {safeSkinLabel} ↻
          </button>
        </div>

        {/* CRT */}
        <div className="flex items-center justify-between py-2">
          <span className="ff-mono font-bold tracking-[0.14em] uppercase">CRT</span>
          <button
            type="button"
            aria-label={`CRT scanlines: ${crtEnabled ? 'ON' : 'OFF'}`}
            aria-pressed={crtEnabled}
            onClick={onToggleCrt}
            className="wm-lcd ff-mono flex cursor-pointer items-center gap-1.5 rounded-[2px] px-2.5 py-1 text-[10px] font-black tracking-wider uppercase"
          >
            <span className={crtEnabled ? 'text-[#2ee2be]' : 'text-[var(--wm-silk-dim)]'}>ON</span>
            <span className="text-[var(--wm-silk-dim)]">|</span>
            <span className={!crtEnabled ? 'text-[var(--wm-silk)]' : 'text-[var(--wm-silk-dim)]'}>
              OFF
            </span>
          </button>
        </div>

        {/* HUD CLUTTER MODULES */}
        <div className="space-y-2 py-2.5">
          <div className="flex items-center justify-between gap-2">
            <span className="ff-mono font-bold tracking-[0.14em] uppercase">HUD</span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                aria-pressed={cleanActive}
                onClick={() => onApplyCockpitPreset(COCKPIT_PRESET_CLEAN)}
                className={`ff-mono cursor-pointer rounded-[2px] border px-2 py-0.5 text-[9px] font-black uppercase ${
                  cleanActive
                    ? 'border-[#2ee2be] bg-[#2ee2be]/15 text-[#2ee2be]'
                    : 'border-[var(--wm-line)] text-[var(--wm-silk-dim)] hover:text-[var(--wm-silk)]'
                }`}
              >
                CLEAN
              </button>
              <button
                type="button"
                aria-pressed={clutterActive}
                onClick={() => onApplyCockpitPreset(COCKPIT_PRESET_CLUTTER)}
                className={`ff-mono cursor-pointer rounded-[2px] border px-2 py-0.5 text-[9px] font-black uppercase ${
                  clutterActive
                    ? 'border-[var(--wm-amber)] bg-[var(--wm-amber)]/15 text-[var(--wm-amber)]'
                    : 'border-[var(--wm-line)] text-[var(--wm-silk-dim)] hover:text-[var(--wm-silk)]'
                }`}
              >
                CLUTTER
              </button>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-1.5">
            <button
              type="button"
              aria-pressed={cockpitVisibility.showInstrumentCluster}
              onClick={() => onToggleCockpitModule('showInstrumentCluster')}
              className={`ff-mono cursor-pointer rounded-[2px] border px-1.5 py-1 text-[9px] font-black tracking-wider uppercase ${
                cockpitVisibility.showInstrumentCluster
                  ? 'border-[#2ee2be] bg-[#2ee2be]/15 text-[#2ee2be]'
                  : 'border-[var(--wm-line)] text-[var(--wm-silk-dim)] hover:text-[var(--wm-silk)]'
              }`}
            >
              DASH
            </button>
            <button
              type="button"
              aria-pressed={cockpitVisibility.showCassetteWidget}
              onClick={() => onToggleCockpitModule('showCassetteWidget')}
              className={`ff-mono cursor-pointer rounded-[2px] border px-1.5 py-1 text-[9px] font-black tracking-wider uppercase ${
                cockpitVisibility.showCassetteWidget
                  ? 'border-[#2ee2be] bg-[#2ee2be]/15 text-[#2ee2be]'
                  : 'border-[var(--wm-line)] text-[var(--wm-silk-dim)] hover:text-[var(--wm-silk)]'
              }`}
            >
              TAPE + LIST
            </button>
            <button
              type="button"
              aria-pressed={cockpitVisibility.showSunVisor}
              onClick={() => onToggleCockpitModule('showSunVisor')}
              className={`ff-mono cursor-pointer rounded-[2px] border px-1.5 py-1 text-[9px] font-black tracking-wider uppercase ${
                cockpitVisibility.showSunVisor
                  ? 'border-[#2ee2be] bg-[#2ee2be]/15 text-[#2ee2be]'
                  : 'border-[var(--wm-line)] text-[var(--wm-silk-dim)] hover:text-[var(--wm-silk)]'
              }`}
            >
              VISOR ({visorPhotos.length}/{MAX_VISOR_PHOTOS})
            </button>
          </div>

          {/* Sun Visor Photo Stack Manager (0..5) */}
          <div className="wm-lcd flex flex-wrap items-center justify-between gap-1.5 rounded-[2px] px-2 py-1.5">
            <div className="flex flex-wrap items-center gap-1">
              {visorPhotos.length === 0 ? (
                <span className="ff-mono text-[9px] text-[var(--wm-silk-dim)] uppercase">
                  DEFAULT CARD
                </span>
              ) : (
                visorPhotos.map((photo, idx) => (
                  <div
                    key={photo.id}
                    className="group relative h-6 w-7 overflow-hidden rounded-[1px] border border-[var(--wm-line-hi)]"
                  >
                    <img
                      src={photo.dataUrl}
                      alt={`Visor ${idx + 1}`}
                      className="h-full w-full object-cover"
                    />
                    <button
                      type="button"
                      aria-label={`Remove visor photo ${idx + 1}`}
                      onClick={() => onRemoveVisorPhoto(photo.id)}
                      className="absolute inset-0 flex cursor-pointer items-center justify-center bg-[#090b12]/72 text-[9px] font-black text-[var(--wm-play)] opacity-85 transition-opacity sm:opacity-0 sm:group-hover:opacity-100 focus-visible:opacity-100"
                    >
                      ✕
                    </button>
                  </div>
                ))
              )}
            </div>

            <div className="flex items-center gap-1">
              <button
                type="button"
                disabled={visorPhotos.length >= MAX_VISOR_PHOTOS}
                onClick={() => fileInputRef.current?.click()}
                className="wm-btn ff-mono cursor-pointer px-2 py-0.5 text-[9px] font-black text-[#2ee2be] uppercase disabled:cursor-not-allowed disabled:opacity-40"
              >
                + ADD
              </button>
              {visorPhotos.length > 0 && (
                <button
                  type="button"
                  onClick={onClearVisorPhotos}
                  className="wm-btn ff-mono cursor-pointer px-1.5 py-0.5 text-[9px] font-black text-[var(--wm-play)] uppercase"
                >
                  CLEAR
                </button>
              )}
            </div>

            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="image/*"
              onChange={handleFileChange}
              className="hidden"
              aria-hidden="true"
              tabIndex={-1}
            />
          </div>
        </div>
      </div>

      {onOpenCassettes && (
        <button
          type="button"
          onClick={onOpenCassettes}
          className="mt-2 flex w-full cursor-pointer items-center justify-between rounded-[2px] border border-[#2ee2be]/50 bg-[#141a2b] px-3 py-2 text-[11px] font-black tracking-[0.14em] text-[#f4efe6] uppercase transition hover:border-[#2ee2be] hover:text-[#2ee2be]"
        >
          <span className="ff-mono">+ LOAD CASSETTE</span>
          <svg
            aria-hidden="true"
            className="h-4 w-5 text-[#2ee2be]"
            viewBox="0 0 24 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
          >
            <rect x="1" y="1" width="22" height="14" rx="1.5" />
            <circle cx="8" cy="8" r="2.2" />
            <circle cx="16" cy="8" r="2.2" />
            <line x1="6" y1="13" x2="18" y2="13" />
          </svg>
        </button>
      )}
    </div>
  );
}
