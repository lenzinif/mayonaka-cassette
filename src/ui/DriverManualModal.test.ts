import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { DriverManualModal } from './DriverManualModal';

describe('DriverManualModal / BackGuideSheet (docs/UI.md §3.5)', () => {
  it('renders null when open is false', () => {
    const html = renderToString(createElement(DriverManualModal, { open: false, onClose: vi.fn() }));
    expect(html).toBe('');
  });

  it('renders handwritten zine guide with 4 visual callouts, anime doodles, and zero real-world brands', () => {
    const rawHtml = renderToString(createElement(DriverManualModal, { open: true, onClose: vi.fn() }));
    const text = rawHtml.replace(/<!--.*?-->/g, '').replace(/&#x27;/g, "'");

    expect(text).toContain("DRIVER'S");
    expect(text).toContain('GUIDE');
    expect(text).toContain('BEAT-SHIFT');
    expect(text).toContain('DRIFT');
    expect(text).toContain('TOFU CUP');
    expect(text).toContain('NO SPILL!');
    expect(text).toContain('CONTROLS');
    expect(text).toContain('BACK [ESC]');
    expect(rawHtml).toContain('<svg');

    expect(text).not.toContain('WM-86');
    expect(text).not.toContain('AE86');
    expect(text).not.toContain('SONY');
  });
});
