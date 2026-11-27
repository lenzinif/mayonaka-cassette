import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { QuickOptionsModal } from './QuickOptionsModal';

describe('QuickOptionsModal (UI Layer)', () => {
  const defaultProps = {
    open: true,
    onClose: vi.fn(),
    autoShift: false,
    onToggleAutoShift: vi.fn(),
    tofuMode: false,
    onToggleTofuMode: vi.fn(),
    sodaSkin: 'melon-soda' as const,
    onCycleSodaSkin: vi.fn(),
    cleanHud: false,
    onToggleCleanHud: vi.fn(),
    crtEnabled: true,
    onToggleCrt: vi.fn(),
  };

  it('renders null when open is false', () => {
    const html = renderToString(createElement(QuickOptionsModal, { ...defaultProps, open: false }));
    expect(html).toBe('');
  });

  it('renders J-Card header with single BACK [ESC] button and clean toggle rows', () => {
    const rawHtml = renderToString(createElement(QuickOptionsModal, defaultProps));
    const text = rawHtml.replace(/<!--.*?-->/g, '');

    expect(text).toContain('OPTIONS');
    expect(text).toContain('BACK [ESC]');
    expect(text).toContain('GEARBOX [G]');
    expect(text).toContain('TOFU MODE [T]');
    expect(text).toContain('DASHBOARD CUP [V]');
    expect(text).toContain('HUD [H]');
    expect(text).toContain('CRT SCANLINES');
    expect(text).not.toContain('[ESC · BACK]');
    const matches = text.match(/BACK/g);
    expect(matches).toHaveLength(1);
  });

  it('renders cockpit module toggles and preserves single BACK button when cockpit handlers are provided', () => {
    const rawHtml = renderToString(
      createElement(QuickOptionsModal, {
        ...defaultProps,
        onToggleCockpitModule: vi.fn(),
        onApplyCockpitPreset: vi.fn(),
      }),
    );
    const text = rawHtml.replace(/<!--.*?-->/g, '');

    expect(text).toContain('COCKPIT MODULES');
    expect(text).toContain('LUXURY FULL');
    expect(text).toContain('CLEAN DRIVE');
    expect(text).toContain('AUTORADIO PLAYLIST');
    expect(text).toContain('SUN VISOR PHOTO');
    const matches = text.match(/BACK/g);
    expect(matches).toHaveLength(1);
  });
});
