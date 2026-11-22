import { TrackLibrary } from '@src/audio/TrackLibrary';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { TrackLoader } from './TrackLoader';

describe('TrackLoader (UI Layer — Cassette Deck & Playlist)', () => {
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

  it('renders stage playlist with English remove buttons and restore defaults button', () => {
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

    expect(text).toContain('STAGE PLAYLIST (3 TRACKS)');
    expect(text).toContain('RESTORE DEFAULTS');
    expect(text).toContain('Neon Horizon');
    expect(text).toContain("Midnight Wangan '88");
    expect(text).toContain('Melon Soda Sunset');
    expect(text).not.toContain('(Synth Fallback)');
    expect(text).not.toContain('(Synth VIP)');
    expect(text).not.toContain('(Synth Mix)');

    expect(html).toContain('aria-label="Remove Neon Horizon from playlist"');
    expect(html).toContain('aria-label="Remove Midnight Wangan &#x27;88 from playlist"');
    expect(html).toContain('aria-label="Remove Melon Soda Sunset from playlist"');
    expect(html).toContain('title="Remove &quot;Neon Horizon&quot; from playlist"');
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
    const text = html.replace(/<!--.*?-->/g, '').replace(/&amp;/g, '&').replace(/&#x27;/g, "'");

    expect(text).toContain('STAGE PLAYLIST (1 TRACK)');
    expect(html).toContain('disabled=""');
    expect(html).toContain('Cannot remove the last remaining track');
  });

  it('renders initial soundtrack selection mode without bottom slop footer', () => {
    const library = new TrackLibrary();
    const onStartDrive = vi.fn();
    const html = renderToString(
      createElement(TrackLoader, {
        open: true,
        library,
        isInitialSelect: true,
        onStartDrive,
        onSelectTrack: vi.fn(),
        onUpdateBeatMap: vi.fn(),
        onClose: vi.fn(),
      }),
    );
    const text = html.replace(/<!--.*?-->/g, '').replace(/&amp;/g, '&').replace(/&#x27;/g, "'");

    expect(text).toContain('CASSETTE DECK');
    expect(text).toContain('Your music generates the road');
    expect(text).toContain('DRIVE [ENTER]');
    expect(text).toContain('BACK [ESC]');
    expect(text).not.toContain('START DRIVE [ENTER]');
    expect(text).not.toContain('Selected Tape:');
  });

  it('renders RESUME [ENTER] alongside BACK [ESC] when opened mid-run with onResumeDrive', () => {
    const library = new TrackLibrary();
    const html = renderToString(
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
    const text = html.replace(/<!--.*?-->/g, '').replace(/&amp;/g, '&').replace(/&#x27;/g, "'");

    expect(text).toContain('CASSETTE DECK');
    expect(text).toContain('RESUME [ENTER]');
    expect(text).toContain('BACK [ESC]');
    expect(text).not.toContain('RESUME DRIVE [ENTER]');
  });

  it('renders unified BACK [ESC] button in header and no bottom slop footer when isInitialSelect is false', () => {
    const library = new TrackLibrary();
    const html = renderToString(
      createElement(TrackLoader, {
        open: true,
        library,
        isInitialSelect: false,
        onSelectTrack: vi.fn(),
        onUpdateBeatMap: vi.fn(),
        onClose: vi.fn(),
      }),
    );
    const text = html.replace(/<!--.*?-->/g, '').replace(/&amp;/g, '&').replace(/&#x27;/g, "'");

    expect(text).toContain('CASSETTE DECK');
    expect(text).toContain('BACK [ESC]');
    expect(text).not.toContain('RESUME DRIVE [ENTER]');
    expect(text).not.toContain('CLOSE [ESC]');
    expect(text).not.toContain('Selected Tape:');
  });

  it('renders clean English ADD TRACKS button and "No file selected" status', () => {
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

    expect(text).toContain('ADD TRACKS');
    expect(text).toContain('No file selected');
    expect(text).not.toContain('SCEGLI FILE');
    expect(text).not.toContain('Nessun file');
    expect(text).not.toContain('Rimuovi');
    expect(text).not.toContain('IDB CACHE HIT');
    expect(html).toContain('type="file"');
    expect(html).toContain('class="sr-only"');
  });

  it('renders Cassette Deck preview transport, 4-beat LEDs, beat click toggle, scrubber, and row preview buttons', () => {
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

    expect(text).toContain('PLAY PREVIEW');
    expect(text).toContain('SKIP TO DROP');
    expect(text).toContain('BEAT CLICK: OFF');
    expect(text).toContain('SYNTH');
    expect(html).toContain('aria-label="4-beat bar indicator"');
    expect(html).toContain('aria-label="Track preview position"');
    expect(html).toContain('aria-label="Preview Neon Horizon"');
    expect(html).toContain('aria-label="Preview Midnight Wangan &#x27;88"');
    expect(html).toContain('title="Explain what BPM, Tap Tempo, and Beat -1 / +1 do"');
  });
});
