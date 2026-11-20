import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { VfdDigidash } from './VfdDigidash';

function renderClean(element: React.ReactElement): string {
  return renderToString(element).replace(/<!--.*?-->/g, '');
}

describe('VfdDigidash', () => {
  const defaultProps = {
    speedKmh: 188,
    speedRatio: 0.75,
    gear: 4,
    rpm: 0.84,
    isLugging: false,
    autoShift: false,
    onToggleAutoShift: vi.fn(),
  };

  it('renders VFD speed, shift beat cue, and active gear without dynamic alert popups', () => {
    const text = renderClean(
      createElement(VfdDigidash, {
        ...defaultProps,
        rpm: 0.98,
        isLugging: true,
      }),
    );

    expect(text).toContain('188');
    expect(text).toContain('KM/H');
    expect(text).toContain('SHIFT BEAT');
    expect(text).toContain('MAN');
    expect(text).not.toContain('SHIFT ON BEAT [SPACE]');
    expect(text).not.toContain('LAST SHIFT:');
    expect(text).not.toContain('DRIFTING');
    expect(text).not.toContain('OVERDRIVE');
    expect(text).not.toContain('OFF-ROAD');
    expect(text).not.toContain('BOGGING! DOWNSHIFT');
    expect(text).not.toContain('REV LIMIT! SHIFT UP');
  });

  it('renders auto shift badge when enabled', () => {
    const text = renderClean(
      createElement(VfdDigidash, {
        ...defaultProps,
        autoShift: true,
      }),
    );

    expect(text).toContain('AUTO');
  });

  it('renders Groove meter and tier badge cleanly', () => {
    const text = renderClean(
      createElement(VfdDigidash, {
        ...defaultProps,
        groove: 88,
        grooveTier: 'HIGH',
      }),
    );

    expect(text).toContain('GROOVE');
    expect(text).toContain('88%');
    expect(text).toContain('HIGH');
    expect(text).not.toContain('GROOVE FLUX');
    expect(text).not.toContain('TIER:');
  });
});
