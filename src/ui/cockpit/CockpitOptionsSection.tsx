import { useRef, type ChangeEvent } from 'react';
import { WalkmanLed, WalkmanSwitchRow } from '../walkman/WalkmanChrome';
import {
  COCKPIT_PRESET_CLEAN,
  COCKPIT_PRESET_LUXURY,
  isCleanPreset,
  isLuxuryPreset,
  type CockpitVisibility,
} from './cockpitSettings';

export interface CockpitOptionsSectionProps {
  visibility: CockpitVisibility;
  onToggleModule: (key: keyof CockpitVisibility) => void;
  onApplyPreset: (preset: CockpitVisibility) => void;
  visorPhotoUrl: string | null;
  onUploadVisorPhoto?: (file: File) => void;
  onClearVisorPhoto?: () => void;
}

/**
 * Shared Walkman-styled Cockpit Module switches, presets, and Sun Visor photo controls
 * embedded inside `PauseMenu` (Options) and `QuickOptionsModal`.
 */
export function CockpitOptionsSection({
  visibility,
  onToggleModule,
  onApplyPreset,
  visorPhotoUrl,
  onUploadVisorPhoto,
  onClearVisorPhoto,
}: CockpitOptionsSectionProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const luxuryActive = isLuxuryPreset(visibility);
  const cleanActive = isCleanPreset(visibility);

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (file) {
      onUploadVisorPhoto?.(file);
    }
  };

  return (
    <div className="mt-3 space-y-2 border-t border-[var(--wm-line)] pt-3">
      <div className="flex items-center justify-between gap-2">
        <span className="ff-mono flex items-center gap-2 text-[10px] font-bold tracking-[0.18em] text-[var(--wm-amber)] uppercase">
          <WalkmanLed lit color="amber" />
          COCKPIT MODULES
        </span>

        <div className="wm-key-bank ff-mono flex items-center text-[9px] font-bold uppercase">
          <button
            type="button"
            aria-pressed={luxuryActive}
            onClick={() => onApplyPreset(COCKPIT_PRESET_LUXURY)}
            className={`wm-btn-well flex cursor-pointer items-center gap-1.5 px-2 py-1 ${
              luxuryActive
                ? 'text-[var(--wm-amber)]'
                : 'text-[var(--wm-silk-dim)] hover:text-[var(--wm-silk)]'
            }`}
          >
            <WalkmanLed lit={luxuryActive} color="amber" />
            LUXURY FULL
          </button>
          <button
            type="button"
            aria-pressed={cleanActive}
            onClick={() => onApplyPreset(COCKPIT_PRESET_CLEAN)}
            className={`wm-btn-well flex cursor-pointer items-center gap-1.5 px-2 py-1 ${
              cleanActive
                ? 'text-[var(--wm-mint)]'
                : 'text-[var(--wm-silk-dim)] hover:text-[var(--wm-silk)]'
            }`}
          >
            <WalkmanLed lit={cleanActive} color="mint" />
            CLEAN DRIVE
          </button>
        </div>
      </div>

      <div className="wm-key-bank flex flex-col text-xs">
        <WalkmanSwitchRow
          label="INSTRUMENTS (VFD)"
          valueLabel={visibility.showInstrumentCluster ? 'ON' : 'OFF'}
          active={visibility.showInstrumentCluster}
          accent="mint"
          onClick={() => onToggleModule('showInstrumentCluster')}
        />

        <WalkmanSwitchRow
          label="AUTORADIO PLAYLIST"
          valueLabel={visibility.showRadioConsole ? 'ON' : 'OFF'}
          active={visibility.showRadioConsole}
          accent="amber"
          onClick={() => onToggleModule('showRadioConsole')}
        />

        <WalkmanSwitchRow
          label="SUN VISOR PHOTO"
          valueLabel={visibility.showSunVisor ? 'ON' : 'OFF'}
          active={visibility.showSunVisor}
          accent="amber"
          onClick={() => onToggleModule('showSunVisor')}
        />

        <WalkmanSwitchRow
          label="CASSETTE DECK [C]"
          valueLabel={visibility.showCassetteWidget ? 'ON' : 'OFF'}
          active={visibility.showCassetteWidget}
          accent="mint"
          onClick={() => onToggleModule('showCassetteWidget')}
        />

        {/* Sun Visor Local Image Upload Row */}
        <div className="wm-btn-well flex items-center justify-between gap-3 px-3.5 py-2">
          <div className="flex min-w-0 items-center gap-2.5">
            <WalkmanLed lit={Boolean(visorPhotoUrl)} color="play" />
            <span className="truncate text-[11px] font-bold tracking-[0.12em] text-[var(--wm-silk)] uppercase">
              VISOR PHOTO
            </span>
          </div>

          <div className="flex shrink-0 items-center gap-1.5">
            {visorPhotoUrl && (
              <img
                src={visorPhotoUrl}
                alt="Sun visor preview"
                className="h-5 w-8 rounded-[1px] border border-[var(--wm-line-hi)] object-cover"
              />
            )}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="wm-btn ff-mono cursor-pointer px-2 py-0.5 text-[9px] font-bold tracking-wider text-[var(--wm-mint)] uppercase"
            >
              {visorPhotoUrl ? 'CHANGE' : 'UPLOAD'}
            </button>
            {visorPhotoUrl && onClearVisorPhoto && (
              <button
                type="button"
                onClick={onClearVisorPhoto}
                className="wm-btn ff-mono cursor-pointer px-2 py-0.5 text-[9px] font-bold tracking-wider text-[var(--wm-play)] uppercase"
              >
                RESET
              </button>
            )}
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleFileChange}
            className="hidden"
            aria-hidden="true"
            tabIndex={-1}
          />
        </div>
      </div>
    </div>
  );
}
