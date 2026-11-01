import {
  applyTuning,
  DEFAULT_TUNING,
  resetTuning,
  tuning,
  TUNING_CONTROLS,
  tuningDiff,
  type Tuning,
  type TuningKey,
} from '@src/config/tuning';
import { useEffect, useState } from 'react';

const STORAGE_KEY = 'outrun-futurefunk.tuning.v1';

export function loadSavedTuning(): void {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') {
      applyTuning(parsed as Record<string, unknown>);
    }
  } catch {
    // Ignore malformed localStorage data.
  }
}

function saveCurrentTuning(): void {
  try {
    const diff = tuningDiff();
    if (Object.keys(diff).length === 0) {
      window.localStorage.removeItem(STORAGE_KEY);
    } else {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(diff));
    }
  } catch {
    // Ignore storage quota errors.
  }
}

export interface DebugPanelProps {
  open: boolean;
  onClose: () => void;
}

const GROUPS = Array.from(new Set(TUNING_CONTROLS.map((c) => c.group)));

/**
 * Live feel-tuning drawer (`?debug` or `F2`, Design Pillar 1).
 * Mutates `tuning` in place so changes are felt on the very next simulation step.
 */
export function DebugPanel({ open, onClose }: DebugPanelProps) {
  const [values, setValues] = useState<Tuning>(() => ({ ...tuning }));
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (open) setValues({ ...tuning });
  }, [open]);

  if (!open) return null;

  const handleChange = (key: TuningKey, value: number) => {
    tuning[key] = value;
    setValues((prev) => ({ ...prev, [key]: value }));
    saveCurrentTuning();
  };

  const handleReset = () => {
    resetTuning();
    setValues({ ...DEFAULT_TUNING });
    saveCurrentTuning();
  };

  const handleCopyJson = async () => {
    const diff = tuningDiff();
    const payload = Object.keys(diff).length > 0 ? diff : tuning;
    try {
      await navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard API unavailable
    }
  };

  return (
    <aside className="pointer-events-auto absolute top-14 right-4 bottom-4 z-10 flex w-84 flex-col rounded border border-cyan-400/50 bg-[#0d0221]/92 font-mono text-xs text-fuchsia-100 shadow-[0_0_30px_rgba(5,217,232,0.25)] backdrop-blur-md">
      <div className="flex items-center justify-between border-b border-fuchsia-500/30 px-3 py-2.5">
        <div>
          <div className="font-bold tracking-wider text-cyan-300 uppercase">FEEL TUNING</div>
          <div className="text-[10px] text-fuchsia-300/70">Parametri live (effetto immediato)</div>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={(e) => {
              void handleCopyJson();
              e.currentTarget.blur();
            }}
            className="cursor-pointer rounded border border-cyan-400/50 bg-cyan-950/60 px-2 py-1 text-[10px] font-semibold text-cyan-200 hover:bg-cyan-900/70"
          >
            {copied ? 'COPIED!' : 'COPY JSON'}
          </button>
          <button
            type="button"
            onClick={(e) => {
              handleReset();
              e.currentTarget.blur();
            }}
            className="cursor-pointer rounded border border-pink-500/50 bg-pink-950/60 px-2 py-1 text-[10px] font-semibold text-pink-200 hover:bg-pink-900/70"
          >
            RESET
          </button>
          <button
            type="button"
            onClick={(e) => {
              onClose();
              e.currentTarget.blur();
            }}
            className="cursor-pointer rounded border border-fuchsia-400/40 px-1.5 py-1 text-[10px] text-fuchsia-200 hover:border-white"
            aria-label="Close tuning panel"
          >
            ✕
          </button>
        </div>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto p-3">
        {GROUPS.map((group) => (
          <div key={group} className="space-y-2.5">
            <div className="border-b border-fuchsia-500/25 pb-1 text-[10px] font-bold tracking-[0.2em] text-pink-400 uppercase">
              {group}
            </div>
            {TUNING_CONTROLS.filter((c) => c.group === group).map((ctrl) => {
              const current = values[ctrl.key];
              const isModified = current !== DEFAULT_TUNING[ctrl.key];
              return (
                <label key={ctrl.key} className="block space-y-0.5">
                  <div className="flex justify-between text-[11px]">
                    <span
                      className={isModified ? 'font-semibold text-cyan-300' : 'text-fuchsia-100'}
                    >
                      {ctrl.label}
                    </span>
                    <span className="tabular-nums text-fuchsia-300">
                      {current}
                      {ctrl.unit ? ` ${ctrl.unit}` : ''}
                    </span>
                  </div>
                  <div className="text-[10px] leading-tight text-fuchsia-300/65">{ctrl.hint}</div>
                  <input
                    type="range"
                    min={ctrl.min}
                    max={ctrl.max}
                    step={ctrl.step}
                    value={current}
                    onChange={(e) => handleChange(ctrl.key, Number(e.target.value))}
                    onPointerUp={(e) => e.currentTarget.blur()}
                    className="h-1.5 w-full cursor-pointer appearance-none rounded bg-fuchsia-950 accent-cyan-400"
                  />
                </label>
              );
            })}
          </div>
        ))}
      </div>
    </aside>
  );
}
