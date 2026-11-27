import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { RadioConsole } from './RadioConsole';

function renderClean(element: React.ReactElement): string {
  return renderToString(element).replace(/<!--.*?-->/g, '');
}

describe('RadioConsole (Cockpit DIN Playlist Unit)', () => {
  const items = [
    { id: 't1', title: 'Neon Horizon', artist: 'Mayonaka FM', bpm: 122 },
    { id: 't2', title: 'Midnight Wangan', artist: 'City Runner', bpm: 128 },
    { id: 't3', title: 'Melon Soda Sunset', artist: 'Kissaten 86', bpm: 118 },
  ];

  it('renders active track, next track preview, playlist drawer, and DIN transport buttons', () => {
    const text = renderClean(
      createElement(RadioConsole, {
        items,
        activeIndex: 1,
        trackTitle: 'Midnight Wangan',
        trackArtist: 'City Runner',
        bpm: 128,
        tofuMode: false,
        onPrevTrack: vi.fn(),
        onNextTrack: vi.fn(),
        onSelectIndex: vi.fn(),
        onOpenDeck: vi.fn(),
      }),
    );

    expect(text).toContain('88.4 FM · DIN TUNER');
    expect(text).toContain('CH 02/03');
    expect(text).toContain('City Runner — Midnight Wangan');
    expect(text).toContain('128 BPM');
    expect(text).toContain('NEXT: Melon Soda Sunset');
    expect(text).toContain('Neon Horizon');
    expect(text).toContain('PREV');
    expect(text).toContain('NEXT');
    expect(text).toContain('[M]');
    expect(text).toContain('Open Cassette Deck');
  });

  it('shifts clear of the bottom-left Tofu shelf when tofuMode is enabled', () => {
    const html = renderToString(
      createElement(RadioConsole, {
        items,
        activeIndex: 0,
        trackTitle: 'Neon Horizon',
        trackArtist: 'Mayonaka FM',
        bpm: 122,
        tofuMode: true,
        onOpenDeck: vi.fn(),
      }),
    );

    expect(html).toContain('md:left-[21.5%]');
  });

  it('handles single-track playlists, disabled skip buttons, and clamps out-of-bounds activeIndex', () => {
    const html = renderToString(
      createElement(RadioConsole, {
        items: [items[0]!],
        activeIndex: 99,
        trackTitle: 'Neon Horizon',
        trackArtist: 'Mayonaka FM',
        bpm: 122,
        tofuMode: false,
        onOpenDeck: vi.fn(),
      }),
    );
    const text = html.replace(/<!--.*?-->/g, '');

    expect(text).toContain('CH 01/01');
    expect(text).toContain('SINGLE CASSETTE');
    expect(html).toContain('disabled=""');
  });
});
