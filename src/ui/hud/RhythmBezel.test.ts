import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { RhythmBezel } from './RhythmBezel';

describe('RhythmBezel', () => {
  it('returns null when pulse is negligible', () => {
    const html = renderToString(
      createElement(RhythmBezel, {
        beatPulse: 0,
        beatInBar: 1,
        grooveTier: 'LOW',
      }),
    );

    expect(html).toBe('');
  });

  it('renders cyan edge glow strips when pulse is active on downbeat', () => {
    const html = renderToString(
      createElement(RhythmBezel, {
        beatPulse: 0.9,
        beatInBar: 0,
        grooveTier: 'HIGH',
      }),
    );

    expect(html).toContain('linear-gradient');
    expect(html).toContain('rgba(5, 217, 232');
  });

  it('renders amber overdrive edge glow when OVERDRIVE groove tier is active', () => {
    const html = renderToString(
      createElement(RhythmBezel, {
        beatPulse: 0.8,
        beatInBar: 0,
        grooveTier: 'OVERDRIVE',
      }),
    );

    expect(html).toContain('rgba(251, 191, 36');
  });
});
