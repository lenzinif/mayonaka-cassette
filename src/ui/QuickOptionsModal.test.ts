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

  it('renders unified header with single BACK [ESC] button and no footer', () => {
    const rawHtml = renderToString(createElement(QuickOptionsModal, defaultProps));
    const text = rawHtml.replace(/<!--.*?-->/g, '');

    expect(text).toContain('OPTIONS');
    expect(text).toContain('BACK [ESC]');
    expect(text).not.toContain('[ESC · BACK]');
    const matches = text.match(/BACK/g);
    expect(matches).toHaveLength(1);
  });
});
