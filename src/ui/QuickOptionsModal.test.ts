import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { QuickOptionsModal } from './QuickOptionsModal';

describe('QuickOptionsModal / Shared OptionsPanel (docs/UI.md §4.3)', () => {
  const defaultProps = {
    open: true,
    onClose: vi.fn(),
    autoShift: false,
    onToggleAutoShift: vi.fn(),
    tofuMode: false,
    onToggleTofuMode: vi.fn(),
    sodaSkin: 'melon-soda' as const,
    onCycleSodaSkin: vi.fn(),
    crtEnabled: true,
    onToggleCrt: vi.fn(),
  };

  it('renders null when open is false', () => {
    const html = renderToString(createElement(QuickOptionsModal, { ...defaultProps, open: false }));
    expect(html).toBe('');
  });

  it('renders brand-free shared options without live shortcut hints or AI-slop headers', () => {
    const rawHtml = renderToString(createElement(QuickOptionsModal, defaultProps));
    const text = rawHtml.replace(/<!--.*?-->/g, '');

    expect(text).toContain('OPTIONS');
    expect(text).toContain('BACK [ESC]');
    expect(text).toContain('GEARBOX');
    expect(text).toContain('MANUAL');
    expect(text).toContain('TOFU CUP');
    expect(text).toContain('DRINK');
    expect(text).toContain('MELON SODA');
    expect(text).toContain('CRT');
    expect(text).toContain('HUD');
    expect(text).toContain('DASH');
    expect(text).toContain('TAPE + LIST');
    expect(text).toContain('VISOR (0/5)');

    expect(text).not.toContain('WM-86');
    expect(text).not.toContain('[G]');
    expect(text).not.toContain('[T]');
    expect(text).not.toContain('[V]');
    expect(text).not.toContain('[H]');
    expect(text).not.toContain('[C]');
  });
});
