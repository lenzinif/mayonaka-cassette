import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { DriverManualModal } from './DriverManualModal';

describe('DriverManualModal (UI Layer)', () => {
  it('renders null when open is false', () => {
    const html = renderToString(createElement(DriverManualModal, { open: false, onClose: vi.fn() }));
    expect(html).toBe('');
  });

  it('renders J-Card guide header with single BACK [ESC] button and player-facing copy', () => {
    const rawHtml = renderToString(createElement(DriverManualModal, { open: true, onClose: vi.fn() }));
    const text = rawHtml.replace(/<!--.*?-->/g, '');

    expect(text).toContain('GUIDE');
    expect(text).toContain('BACK [ESC]');
    expect(text).toContain('BEAT-SHIFT');
    expect(text).toContain('DRIFT');
    expect(text).toContain('MELON SODA');
    expect(text).toContain('CONTROLS');
    expect(text).not.toContain('Web Audio low-pass filter');
    expect(text).not.toContain('[ESC] CLOSE');
    expect(text).not.toContain('[ESC · BACK]');
    const matches = text.match(/BACK/g);
    expect(matches).toHaveLength(1);
  });
});
