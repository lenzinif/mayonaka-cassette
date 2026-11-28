import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { VfdDigidash } from './VfdDigidash';

function renderClean(element: React.ReactElement): string {
  return renderToString(element).replace(/<!--.*?-->/g, '');
}

describe('VfdDigidash (Bottom-Left Speedometer & Tachometer — docs/UI.md §5.2.2)', () => {
  const defaultProps = {
    speedKmh: 188,
    gear: 4,
    rpm: 0.84,
    groove: 72,
    grooveTier: 'HIGH' as const,
    isLugging: false,
    stageAccentColor: '#00f0b5',
  };

  it('renders bare VFD speed, gear, RPM, and GROOVE bar without AI-slop labels or interactive buttons', () => {
    const html = renderToString(createElement(VfdDigidash, defaultProps));
    const text = html.replace(/<!--.*?-->/g, '');

    expect(text).toContain('188');
    expect(text).toContain('KM/H');
    expect(text).toContain('4');
    expect(text).toContain('RPM');
    expect(text).toContain('GROOVE');
    expect(text).toContain('HIGH');
    expect(html).toContain('origin-bottom-left');
    expect(html).not.toContain('<button');

    expect(text).not.toContain('DIGITAL COCKPIT');
    expect(text).not.toContain('GT-APEX');
    expect(text).not.toContain('SHIFT BEAT');
    expect(text).not.toContain('AUTO');
    expect(text).not.toContain('MAN');
  });

  it('renders cleanly at lugging/high-RPM states', () => {
    const text = renderClean(
      createElement(VfdDigidash, {
        ...defaultProps,
        rpm: 0.98,
        isLugging: true,
      }),
    );

    expect(text).toContain('188');
    expect(text).toContain('4');

    const lowText = renderClean(
      createElement(VfdDigidash, { ...defaultProps, groove: 15, grooveTier: 'LOW' }),
    );
    expect(lowText).toContain('LOW');
    const overdriveText = renderClean(
      createElement(VfdDigidash, { ...defaultProps, groove: 92, grooveTier: 'OVERDRIVE' }),
    );
    expect(overdriveText).toContain('OVERDRIVE');
  });
});
