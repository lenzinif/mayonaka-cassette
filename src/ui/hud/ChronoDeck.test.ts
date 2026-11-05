import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ChronoDeck } from './ChronoDeck';

function renderClean(element: React.ReactElement): string {
  return renderToString(element).replace(/<!--.*?-->/g, '');
}

describe('ChronoDeck', () => {
  const defaultProps = {
    stageNumber: 3,
    stagePaletteName: 'SUNSET STRIP',
    stageScore: 64200,
    bestSongGrade: 'SSS',
    bestSongScore: 71000,
    lap: 2,
    lapTime: 72.4,
    lastLapTime: 68.1,
    roadBarIndex: 12,
    totalBars: 48,
    currentChunkId: 'build-coastal-crest',
    playlistIndex: 2,
    playlistLength: 4,
    cleanHud: false,
  };

  it('renders stage info, score, lap times, and road chunk progress', () => {
    const text = renderClean(createElement(ChronoDeck, defaultProps));

    expect(text).toContain('STAGE 03 // SUNSET STRIP');
    expect(text).toContain('TRK 3/4');
    expect(text).toContain((64200).toLocaleString());
    expect(text).toContain(`BEST SSS · ${(71000).toLocaleString()}`);
    expect(text).toContain('LAP 2');
    expect(text).toContain('01:12.40');
    expect(text).toContain('LAST 01:08.10');
    expect(text).toContain('ROAD 13/48 · build-coastal-crest');
  });

  it('hides road bar progress when cleanHud is true', () => {
    const text = renderClean(
      createElement(ChronoDeck, {
        ...defaultProps,
        cleanHud: true,
      }),
    );

    expect(text).not.toContain('ROAD 13/48');
  });
});
