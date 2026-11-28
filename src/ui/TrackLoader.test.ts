import { TrackLibrary } from '@src/audio/TrackLibrary';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { TrackLoader } from './TrackLoader';

describe('TrackLoader (Tapes Drawer & Optional Mixing — docs/UI.md §3.3–3.4)', () => {
  it('renders null when open is false', () => {
    const library = new TrackLibrary();
    const html = renderToString(
      createElement(TrackLoader, {
        open: false,
        library,
        onSelectTrack: vi.fn(),
        onUpdateBeatMap: vi.fn(),
        onClose: vi.fn(),
      }),
    );
    expect(html).toBe('');
  });

  it('renders crisp TAPES header, + ADD TRACKS, manual PREVIEW, and collapsed MIX toggle by default', () => {
    const library = new TrackLibrary();
    const html = renderToString(
      createElement(TrackLoader, {
        open: true,
        library,
        onSelectTrack: vi.fn(),
        onUpdateBeatMap: vi.fn(),
        onClose: vi.fn(),
      }),
    );
    const text = html.replace(/<!--.*?-->/g, '').replace(/&amp;/g, '&').replace(/&#x27;/g, "'");

    expect(text).toContain('TAPES');
    expect(text).toContain('+ ADD TRACKS');
    expect(text).toContain('PREVIEW');
    expect(text).toContain('MIX');
    expect(text).toContain('PLAYLIST');
    expect(text).toContain('Neon Horizon');
    expect(text).toContain("Midnight Wangan '88");
    expect(text).toContain('Melon Soda Sunset');

    // MIX controls are hidden by default until user toggles MIX
    expect(text).not.toContain('BEAT -1');
    expect(text).not.toContain('BEAT +1');
    expect(text).not.toContain('CLICK: OFF');

    // Forbidden AI-slop copy purged
    expect(text).not.toContain('WM-86');
    expect(text).not.toContain('Your music generates the road');
    expect(text).not.toContain('Drop audio files to make a new road');
    expect(text).not.toContain('DOUBLE-CLICK TO DRIVE');
  });

  it('disables remove button when only 1 track remains', () => {
    const library = new TrackLibrary();
    library.removeTrack(0);
    library.removeTrack(0);

    const html = renderToString(
      createElement(TrackLoader, {
        open: true,
        library,
        onSelectTrack: vi.fn(),
        onUpdateBeatMap: vi.fn(),
        onClose: vi.fn(),
      }),
    );
    expect(html).toContain('disabled=""');
    expect(html).toContain('Cannot remove the last track');
  });

  it('renders ▶ PLAY when isInitialSelect is true and ▶ RESUME when mid-run', () => {
    const library = new TrackLibrary();
    const initHtml = renderToString(
      createElement(TrackLoader, {
        open: true,
        library,
        isInitialSelect: true,
        onStartDrive: vi.fn(),
        onSelectTrack: vi.fn(),
        onUpdateBeatMap: vi.fn(),
        onClose: vi.fn(),
      }),
    );
    expect(initHtml).toContain('▶ PLAY');

    const midRunHtml = renderToString(
      createElement(TrackLoader, {
        open: true,
        library,
        isInitialSelect: false,
        onResumeDrive: vi.fn(),
        onSelectTrack: vi.fn(),
        onUpdateBeatMap: vi.fn(),
        onClose: vi.fn(),
      }),
    );
    expect(midRunHtml).toContain('▶ RESUME');
  });
});
