import type { ReactNode } from 'react';
import './walkman.css';

export function WalkmanScrew({ className = '' }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={`h-2 w-2 shrink-0 text-[var(--wm-silk-dim)] opacity-45 ${className}`}
      viewBox="0 0 10 10"
      fill="none"
    >
      <circle cx="5" cy="5" r="4.1" fill="#090b12" stroke="currentColor" strokeWidth="0.9" />
      <path d="M2.6 5H7.4" stroke="currentColor" strokeWidth="1" strokeLinecap="square" />
    </svg>
  );
}

export interface WalkmanLedProps {
  lit: boolean;
  color?: 'mint' | 'amber' | 'play';
  className?: string;
}

export function WalkmanLed({ lit, color = 'mint', className = '' }: WalkmanLedProps) {
  return (
    <span
      aria-hidden="true"
      data-lit={lit ? 'true' : 'false'}
      data-color={color}
      className={`wm-led shrink-0 ${className}`}
    />
  );
}

export interface CassetteReelProps {
  size?: number;
  spinning?: boolean;
  angleDeg?: number;
  packScale?: number;
  tapeColor?: string;
  accentColor?: string;
}

/**
 * 6-tooth notched Walkman cassette hub inside a dynamically scaled magnetic tape pack ring.
 */
export function CassetteReel({
  size = 40,
  spinning = false,
  angleDeg,
  packScale = 0.72,
  tapeColor = '#252c4d',
  accentColor = '#2ee2be',
}: CassetteReelProps) {
  const clampedScale = Math.max(0.32, Math.min(1, packScale));
  const hubStyle =
    angleDeg !== undefined ? { transform: `rotate(${angleDeg}deg)` } : undefined;

  return (
    <div
      aria-hidden="true"
      className="relative flex shrink-0 items-center justify-center"
      style={{ width: size, height: size }}
    >
      <div
        className="absolute inset-0 rounded-full border border-[rgba(244,239,230,0.2)] will-change-transform"
        style={{
          backgroundColor: tapeColor,
          transform: `scale(${clampedScale.toFixed(3)})`,
          boxShadow: 'inset 0 0 0 2px rgba(9, 11, 18, 0.55)',
        }}
      />

      <svg
        viewBox="0 0 24 24"
        className={`relative z-1 h-[54%] w-[54%] will-change-transform ${
          spinning && angleDeg === undefined ? 'wm-spin-slow' : ''
        }`}
        style={hubStyle}
        fill="none"
      >
        <circle cx="12" cy="12" r="10.5" fill="#f4efe6" stroke="#090b12" strokeWidth="1.2" />
        <circle cx="12" cy="12" r="7.2" fill="#131622" stroke={accentColor} strokeWidth="1.1" />
        <path
          d="M12 4.6V7.4M12 16.6V19.4M5.6 8.3L8 9.7M16 14.3L18.4 15.7M18.4 8.3L16 9.7M8 14.3L5.6 15.7"
          stroke="#f4efe6"
          strokeWidth="1.5"
          strokeLinecap="square"
        />
        <circle cx="12" cy="12" r="3" fill="#090b12" />
      </svg>
    </div>
  );
}

export interface WalkmanModalFrameProps {
  title: string;
  subtitle?: string;
  jpSubtitle?: string;
  modelTag?: string;
  titleId?: string;
  headerRight?: ReactNode;
  maxWidthClass?: string;
  maxHeightClass?: string;
  children: ReactNode;
}

/**
 * Shared flat matte anodized Sony Walkman chassis for all secondary screens & modals.
 */
export function WalkmanModalFrame({
  title,
  subtitle,
  jpSubtitle,
  modelTag = 'WM-86 AUTO REVERSE',
  titleId,
  headerRight,
  maxWidthClass = 'max-w-md',
  maxHeightClass = '',
  children,
}: WalkmanModalFrameProps) {
  return (
    <div
      className={`wm-shell wm-faceplate wm-modal-seat relative flex w-full flex-col overflow-hidden text-left text-[var(--wm-silk)] ${maxWidthClass} ${maxHeightClass}`}
      style={{ colorScheme: 'dark' }}
    >
      {/* Top Anodized Faceplate Header */}
      <div className="border-b border-[var(--wm-line)] bg-[#171b2a] px-4 py-2.5">
        <div className="mb-1.5 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <WalkmanScrew />
            <span className="ff-mono text-[9px] font-bold tracking-[0.22em] text-[var(--wm-silk-dim)] uppercase">
              {modelTag}
            </span>
          </div>
          <WalkmanScrew />
        </div>

        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-baseline gap-2">
              <h2
                id={titleId}
                className="ff-display truncate text-base font-black tracking-[0.12em] text-[var(--wm-silk)] uppercase sm:text-lg"
              >
                {title}
              </h2>
              {jpSubtitle && (
                <span className="hidden text-[10px] font-bold tracking-[0.2em] text-[var(--wm-amber)] sm:inline">
                  {jpSubtitle}
                </span>
              )}
            </div>
            {subtitle && (
              <div className="mt-0.5 truncate text-[10px] font-medium text-[var(--wm-silk-dim)]">
                {subtitle}
              </div>
            )}
          </div>

          {headerRight && <div className="flex shrink-0 items-center gap-1.5">{headerRight}</div>}
        </div>
      </div>

      <div className="wm-accent-strip shrink-0" />

      <div className="flex min-h-0 flex-1 flex-col">{children}</div>

      {/* Bottom Chassis Lip with Corner Screws */}
      <div className="flex items-center justify-between border-t border-[var(--wm-line)] bg-[#0e111b] px-3 py-1">
        <WalkmanScrew />
        <span className="ff-mono text-[8px] font-bold tracking-[0.26em] text-[var(--wm-silk-dim)]/75 uppercase">
          STEREO CASSETTE PLAYER · 88.4 FM
        </span>
        <WalkmanScrew />
      </div>
    </div>
  );
}

export interface WalkmanSwitchRowProps {
  label: string;
  valueLabel: string;
  active: boolean;
  accent?: 'mint' | 'amber' | 'play';
  variant?: 'toggle' | 'cycle';
  onClick: () => void;
}

/**
 * Flat matte Walkman DIP-switch or stepped selector row for options menus.
 */
export function WalkmanSwitchRow({
  label,
  valueLabel,
  active,
  accent = 'mint',
  variant = 'toggle',
  onClick,
}: WalkmanSwitchRowProps) {
  const valueTextClass = !active
    ? 'text-[var(--wm-silk-dim)]'
    : accent === 'amber'
      ? 'text-[var(--wm-amber)]'
      : accent === 'play'
        ? 'text-[var(--wm-play)]'
        : 'text-[var(--wm-mint)]';

  return (
    <button
      type="button"
      aria-pressed={variant === 'toggle' ? active : undefined}
      onClick={onClick}
      className="wm-btn-well flex w-full cursor-pointer items-center justify-between gap-3 px-3.5 py-2.5 text-left"
    >
      <div className="flex min-w-0 items-center gap-2.5">
        <WalkmanLed lit={active} color={accent} />
        <span className="truncate text-[11px] font-bold tracking-[0.12em] text-[var(--wm-silk)] uppercase">
          {label}
        </span>
      </div>

      <div className="flex shrink-0 items-center gap-2.5">
        <span
          className={`wm-lcd ff-mono rounded-[1px] px-2 py-0.5 text-[10px] font-black tracking-wider ${valueTextClass}`}
        >
          {valueLabel}
        </span>

        {variant === 'toggle' ? (
          <span
            aria-hidden="true"
            className="wm-switch-track"
            data-on={active ? 'true' : 'false'}
            data-accent={accent}
          >
            <span className="wm-switch-thumb" />
          </span>
        ) : (
          <span
            aria-hidden="true"
            className="wm-lcd ff-mono inline-flex h-[14px] items-center rounded-[1px] px-1.5 text-[9px] font-black text-[var(--wm-amber)]"
          >
            ↻
          </span>
        )}
      </div>
    </button>
  );
}
