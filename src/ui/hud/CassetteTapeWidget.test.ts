import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { CassetteTapeWidget } from './CassetteTapeWidget';

function renderClean(element: React.ReactElement): string {
  return renderToString(element).replace(/<!--.*?-->/g, '');
}

describe('CassetteTapeWidget (Top-Left Cassette + Adjacent Playlist — docs/UI.md §5.2.1)', () => {
  const defaultProps = {
    trackTitle: 'Midnight Drive',
    barIndex: 8,
    beatInBar: 1,
    grooveTier: 'HIGH' as const,
    roadBarIndex: 8,
    totalBars: 32,
    playlistIndex: 1,
    playlistItems: [
      { id: '1', title: 'Neon Horizon', artist: 'Mayonaka FM', bpm: 122 },
      { id: '2', title: 'Midnight Drive', artist: 'Plastic Love', bpm: 124 },
      { id: '3', title: 'Melon Sunset', artist: 'Kissaten', bpm: 118 },
    ],
    stageAccentColor: '#ff7b25',
    isSlack: false,
    visible: true,
  };

  it('renders track title, monochrome theme progress bar, and adjacent read-only playlist without AI-slop copy', () => {
    const html = renderToString(createElement(CassetteTapeWidget, defaultProps));
    const text = html.replace(/<!--.*?-->/g, '');

    expect(text).toContain('Midnight Drive');
    expect(text).toContain('01 Neon Horizon');
    expect(text).toContain('02 Midnight Drive');
    expect(text).toContain('03 Melon Sunset');
    expect(html).toContain('background-color:#ff7b25');

    expect(text).not.toContain('WM-86');
    expect(text).not.toContain('METAL · TYPE IV');
    expect(text).not.toContain('TOFU ×2');
    expect(text).not.toContain('BAR ');
    expect(text).not.toContain('BPM');
    expect(html).not.toContain('<button');
  });

  it('renders wavy tape slack ribbon when damaged or spilled', () => {
    const html = renderClean(
      createElement(CassetteTapeWidget, {
        ...defaultProps,
        isSlack: true,
      }),
    );

    expect(html).toContain('<path d="M 0,6 Q 25,12 50,2 Q 75,12 100,6"');
  });

  it('returns null when hidden (configuration locked during driving)', () => {
    const html = renderToString(
      createElement(CassetteTapeWidget, {
        ...defaultProps,
        visible: false,
      }),
    );

    expect(html).toBe('');
  });
});
