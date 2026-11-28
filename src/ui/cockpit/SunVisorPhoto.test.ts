import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { SunVisorPhoto } from './SunVisorPhoto';

describe('SunVisorPhoto (Top-Right Cascading Clutter — docs/UI.md §5.2.4)', () => {
  it('renders default retro Tokyo postcard with zero HUD text or interactive buttons when empty', () => {
    const html = renderToString(createElement(SunVisorPhoto, { photos: [] }));
    const text = html.replace(/<!--.*?-->/g, '');

    expect(html).toContain('Default retro manga Tokyo night postcard');
    expect(html).toContain('origin-top-right');
    expect(html).not.toContain('<button');
    expect(text).not.toContain('SUN VISOR');
    expect(text).not.toContain('TOKYO 86');
    expect(text).not.toContain('PIN PHOTO');
  });

  it('renders up to 5 cascading clipped/taped Polaroid photos capped at MAX_VISOR_PHOTOS', () => {
    const photos = Array.from({ length: 7 }, (_, i) => ({
      id: `p-${i}`,
      dataUrl: `data:image/webp;base64,IMG${i}`,
    }));
    const html = renderToString(createElement(SunVisorPhoto, { photos }));

    expect(html).toContain('Pinned visor photo 1');
    expect(html).toContain('Pinned visor photo 5');
    expect(html).not.toContain('Pinned visor photo 6');
    expect(html).toContain('-mt-[2.1cqh]');
    expect(html).toContain('translateX(3.4cqh) rotate(0.5deg)');
    expect(html).toContain('translateX(-0.8cqh) rotate(7.5deg)');
    expect(html).toContain('max-h-[18.6cqh] max-w-[31cqh]');
    expect(html).not.toContain('object-cover');
    expect(html).not.toContain('<button');
  });
});
