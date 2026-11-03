import { TrackLibrary } from '@src/audio/TrackLibrary';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { TrackLoader } from './TrackLoader';

describe('TrackLoader (UI Layer — Playlist Management & Track Removal)', () => {
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

  it('renders stage playlist with remove buttons for each track and restore defaults button', () => {
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
    const text = html.replace(/<!--.*?-->/g, '');

    expect(text).toContain('STAGE PLAYLIST (3 TRACKS)');
    expect(text).toContain('RESTORE DEFAULTS');
    expect(text).toContain('Neon Horizon (Synth Fallback)');
    expect(text).toContain('Midnight Wangan 88 (Synth VIP)');
    expect(text).toContain('Melon Soda Sunset (Synth Mix)');

    // Remove buttons should be present with aria-labels and ✕ glyph
    expect(html).toContain('aria-label="Rimuovi Neon Horizon (Synth Fallback) dalla playlist"');
    expect(html).toContain('aria-label="Rimuovi Midnight Wangan 88 (Synth VIP) dalla playlist"');
    expect(html).toContain('aria-label="Rimuovi Melon Soda Sunset (Synth Mix) dalla playlist"');
    expect(html).toContain('title="Rimuovi &quot;Neon Horizon (Synth Fallback)&quot; dalla playlist"');
    expect(text).toContain('✕');
  });

  it('renders remove button as disabled when only 1 track remains', () => {
    const library = new TrackLibrary();
    library.removeTrack(0);
    library.removeTrack(0);
    expect(library.items.length).toBe(1);

    const html = renderToString(
      createElement(TrackLoader, {
        open: true,
        library,
        onSelectTrack: vi.fn(),
        onUpdateBeatMap: vi.fn(),
        onClose: vi.fn(),
      }),
    );
    const text = html.replace(/<!--.*?-->/g, '');

    expect(text).toContain('STAGE PLAYLIST (1 TRACK)');
    expect(html).toContain('disabled=""');
    expect(html).toContain("Impossibile rimuovere l&#x27;unica traccia rimasta");
  });
});
