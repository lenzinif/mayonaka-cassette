import { describe, expect, it, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
import { PauseMenu } from './PauseMenu';

describe('PauseMenu (UI Layer)', () => {
  const defaultProps = {
    open: true,
    stageNumber: 1,
    stagePaletteName: 'SUNSET BOULEVARD',
    stageScore: 12500,
    lap: 2,
    lapTime: 45.67,
    trackTitle: 'Neon Horizon',
    trackArtist: 'OutRun FM 88.4',
    bpm: 122,
    groove: 75,
    grooveTier: 'HIGH' as const,
    tofuMode: false,
    sodaSkin: 'melon-soda' as const,
    sodaSpills: 0,
    cleanHud: false,
    showPerfHud: false,
    autoShift: false,
    onResume: vi.fn(),
    onRestartRun: vi.fn(),
    onOpenTrackLoader: vi.fn(),
    onOpenInspector: vi.fn(),
    onToggleDebug: vi.fn(),
    onToggleTofuMode: vi.fn(),
    onCycleSodaSkin: vi.fn(),
    onToggleCleanHud: vi.fn(),
    onTogglePerfHud: vi.fn(),
  };

  it('renders null when open is false', () => {
    const html = renderToString(PauseMenu({ ...defaultProps, open: false }));
    expect(html).toBe('');
  });

  it('renders complete pause menu with stats, actions and quick toggles when open is true', () => {
    const rawHtml = renderToString(PauseMenu(defaultProps));
    // Strip React SSR comment markers to test visible text content
    const text = rawHtml.replace(/<!--.*?-->/g, '');

    expect(text).toContain('PAUSED');
    expect(text).toContain('OUTRUN FM 88.4');
    expect(text).toContain('Neon Horizon');
    expect(text).toContain('122.0 BPM');
    expect(text).toContain('STAGE');
    expect(text).toContain('PTS');
    expect(text).toContain('LAP 2');
    expect(text).toContain('00:45.67');
    expect(text).toContain('75%');
    expect(text).toContain('HIGH');

    // Primary action
    expect(text).toContain('RESUME DRIVE [P]');

    // Secondary actions
    expect(text).toContain('RESTART RUN');
    expect(text).toContain('LOAD TRACK [M]');
    expect(text).toContain('FEEL TUNING [F2]');
    expect(text).toContain('BEATMAP INSPECTOR');

    // Quick toggles
    expect(text).toContain('TOFU MODE: OFF [T]');
    expect(text).toContain('CUP: MELON SODA [V]');
    expect(text).toContain('HUD: FULL [H]');
    expect(text).toContain('PERF PROFILER: OFF [F3]');

    // Community feedback link
    expect(text).toContain('COMMUNITY &amp; FEEDBACK');
    expect(rawHtml).toContain('https://github.com/lenzinif/mayonaka-cassette/discussions');
  });

  it('reflects active Tofu Mode in the quick toggle badge', () => {
    const rawHtml = renderToString(
      PauseMenu({
        ...defaultProps,
        tofuMode: true,
        sodaSpills: 2,
      }),
    );
    const text = rawHtml.replace(/<!--.*?-->/g, '');
    expect(text).toContain('TOFU MODE: ON (×2) [2] [T]');
  });

  it('renders personal best and last lap time when available in session stats', () => {
    const rawHtml = renderToString(
      PauseMenu({
        ...defaultProps,
        bestSongGrade: 'S',
        bestSongScore: 54000,
        lastLapTime: 42.15,
      }),
    );
    const text = rawHtml.replace(/<!--.*?-->/g, '');
    expect(text).toContain(`BEST S · ${(54000).toLocaleString()}`);
    expect(text).toContain('LAST 00:42.15');
  });
});
