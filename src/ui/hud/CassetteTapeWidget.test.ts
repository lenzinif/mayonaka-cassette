import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { CassetteTapeWidget } from './CassetteTapeWidget';

function renderClean(element: React.ReactElement): string {
  return renderToString(element).replace(/<!--.*?-->/g, '');
}

describe('CassetteTapeWidget', () => {
  const defaultProps = {
    trackArtist: 'Plastic Love Band',
    trackTitle: 'Midnight Drive',
    bpm: 124,
    barIndex: 8,
    beatInBar: 1,
    sectionRole: 'drop' as const,
    barEnergy: 0.8,
    filterCutoffHz: 12000,
    groove: 75,
    grooveTier: 'HIGH' as const,
    tofuMode: true,
    roadBarIndex: 8,
    totalBars: 32,
    speedRatio: 0.85,
    isSlack: false,
    visible: true,
    onToggleVisible: vi.fn(),
  };

  it('renders tape details, label, spools, and Dolby NR indicator when visible', () => {
    const text = renderClean(createElement(CassetteTapeWidget, defaultProps));

    expect(text).toContain('Plastic Love Band — Midnight Drive');
    expect(text).toContain('DOLBY B·NR');
    expect(text).toContain('真夜中 CASSETTE C-90');
    expect(text).toContain('TYPE IV // FUTURE FUNK FLOW');
    expect(text).toContain('GROOVE 75%');
    expect(text).toContain('124.0 BPM');
    expect(text).toContain('BAR 009.2');
    expect(text).toContain('TOFU ×2');
    expect(text).toContain('▶ PLAY');
  });

  it('renders slack animation when damaged or soda spills', () => {
    const text = renderClean(
      createElement(CassetteTapeWidget, {
        ...defaultProps,
        isSlack: true,
      }),
    );

    expect(text).toContain('⚠ TAPE SLACK!');
    expect(text).toContain('<svg');
  });

  it('renders compact toggle button when hidden', () => {
    const text = renderClean(
      createElement(CassetteTapeWidget, {
        ...defaultProps,
        visible: false,
      }),
    );

    expect(text).toContain('[C] ⏏ TAPE: Midnight Drive');
    expect(text).not.toContain('TYPE IV // FUTURE FUNK FLOW');
  });

  it('renders Master Overdrive variant on SSS tier', () => {
    const text = renderClean(
      createElement(CassetteTapeWidget, {
        ...defaultProps,
        groove: 95,
        grooveTier: 'SSS',
      }),
    );

    expect(text).toContain('SPECIAL // FUNKY OVERDRIVE');
  });

  it('renders playlist track badge when multiple tracks exist in playlist', () => {
    const text = renderClean(
      createElement(CassetteTapeWidget, {
        ...defaultProps,
        playlistIndex: 1,
        playlistLength: 4,
      }),
    );

    expect(text).toContain('[TRK 2/4]');
  });
});
