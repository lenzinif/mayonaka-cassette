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
    isRedlining: false,
    isOverdrive: false,
    autoShift: false,
    lastShiftTier: 'PERFECT',
    lastShiftDeltaMs: 14,
    isDrifting: true,
    driftTime: 1.8,
    isOffRoad: false,
    onToggleAutoShift: vi.fn(),
  };

  it('renders VFD speed, tachometer sweet-spot, active gear, and drift alert', () => {
    const text = renderClean(createElement(VfdDigidash, defaultProps));

    expect(text).toContain('188');
    expect(text).toContain('KM/H');
    expect(text).toContain('72–90% BEAT ZONE');
    expect(text).toContain('DRIFTING 1.8S');
    expect(text).toContain('LAST SHIFT: PERFECT (+14MS)');
    expect(text).toContain('SHIFT ON BEAT [SPACE]');
    expect(text).toContain('MAN');
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

  it('renders Groove Flux VFD meter and tier badge', () => {
    const text = renderClean(
      createElement(VfdDigidash, {
        ...defaultProps,
        groove: 88,
        grooveTier: 'HIGH',
      }),
    );

    expect(text).toContain('GROOVE FLUX');
    expect(text).toContain('88%');
    expect(text).toContain('TIER: HIGH');
  });
});
