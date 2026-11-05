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

  it('renders box-shadow glow when pulse is active on downbeat', () => {
    const html = renderToString(
      createElement(RhythmBezel, {
        beatPulse: 0.9,
        beatInBar: 0,
        grooveTier: 'HIGH',
      }),
    );

    expect(html).toContain('box-shadow');
    expect(html).toContain('rgba(5, 217, 232');
  });

  it('renders amber overdrive glow when SSS groove tier is active', () => {
    const html = renderToString(
      createElement(RhythmBezel, {
        beatPulse: 0.8,
        beatInBar: 0,
        grooveTier: 'SSS',
      }),
    );

    expect(html).toContain('rgba(251, 191, 36');
  });
});
