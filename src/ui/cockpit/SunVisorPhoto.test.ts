import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { SunVisorPhoto } from './SunVisorPhoto';

function renderClean(element: React.ReactElement): string {
  return renderToString(element).replace(/<!--.*?-->/g, '');
}

describe('SunVisorPhoto (Cockpit Module)', () => {
  it('renders default retro manga Tokyo postcard when photoUrl is null', () => {
    const text = renderClean(
      createElement(SunVisorPhoto, {
        photoUrl: null,
        onUploadPhoto: vi.fn(),
        onClearPhoto: vi.fn(),
      }),
    );

    expect(text).toContain('SUN VISOR');
    expect(text).toContain('TOKYO 86');
    expect(text).toContain('PIN PHOTO');
    expect(text).toContain('Default retro manga Tokyo night postcard');
    expect(text).not.toContain('CUSTOM CLIP');
  });

  it('renders custom pinned photo and reset button when photoUrl is provided', () => {
    const text = renderClean(
      createElement(SunVisorPhoto, {
        photoUrl: 'data:image/webp;base64,AAAA',
        onUploadPhoto: vi.fn(),
        onClearPhoto: vi.fn(),
      }),
    );

    expect(text).toContain('CUSTOM CLIP');
    expect(text).toContain('data:image/webp;base64,AAAA');
    expect(text).toContain('Pinned sun visor photo');
    expect(text).toContain('✕');
  });
});
