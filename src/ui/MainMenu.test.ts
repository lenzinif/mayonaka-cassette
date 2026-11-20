import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { MainMenu, type MainMenuProps } from './MainMenu';

describe('MainMenu (UI Layer)', () => {
  const defaultProps: MainMenuProps = {
    progress: { percent: 45, loaded: 9, total: 20, currentAssetId: 'sprites/car.png', failed: 0 },
    ready: false,
    audioUnlocked: false,
    currentTrackTitle: 'Neon Horizon',
    currentTrackArtist: 'Mayonaka FM',
    currentTrackBpm: 122,
    onStartDrive: vi.fn(),
    onOpenCassetteDeck: vi.fn(),
    onUnlockAudio: vi.fn(),
    autoShift: false,
    onToggleAutoShift: vi.fn(),
    tofuMode: false,
    onToggleTofuMode: vi.fn(),
    sodaSkin: 'melon-soda',
    onCycleSodaSkin: vi.fn(),
    cleanHud: false,
    onToggleCleanHud: vi.fn(),
    crtEnabled: true,
    onToggleCrt: vi.fn(),
  };

  it('renders Future Funk logo, broadcast bar, cassette J-card, and preloading status when ready is false', () => {
    const rawHtml = renderToString(createElement(MainMenu, defaultProps));
    const text = rawHtml.replace(/<!--.*?-->/g, '');

    expect(text).toContain('真夜中');
    expect(text).toContain('CASSETTE');
    expect(text).toContain('MAYONAKA CASSETTE');
    expect(text).toContain('88.4 FM');
    expect(text).toContain('TOKYO BAY');
    expect(text).toContain('SOUND');
    expect(text).toContain('SIDE A');
    expect(text).toContain('Neon Horizon');
    expect(text).toContain('Mayonaka FM');
    expect(text).toContain('122 BPM');

    expect(text).toContain('LOADING (45%)');
    expect(text).toContain('CASSETTES');
    expect(text).toContain('OPTIONS');
    expect(text).toContain('GUIDE');

    expect(text).not.toContain('OUTRUN FM');
    expect(text).not.toContain('BEATMAP LAB');
    expect(text).not.toContain('(Synth Fallback)');
    expect(text).not.toContain('READY');
    expect(text).not.toContain('TUNE IN AUDIO');
  });

  it('renders DRIVE menu item cleanly when preloading completes', () => {
    const rawHtml = renderToString(
      createElement(MainMenu, {
        ...defaultProps,
        ready: true,
        progress: { percent: 100, loaded: 20, total: 20, currentAssetId: '', failed: 0 },
      }),
    );
    const text = rawHtml.replace(/<!--.*?-->/g, '');

    expect(text).toContain('DRIVE');
    expect(text).not.toContain('LOADING');
  });

  it('renders STEREO indicator when audio is unlocked', () => {
    const rawHtml = renderToString(
      createElement(MainMenu, {
        ...defaultProps,
        audioUnlocked: true,
      }),
    );
    const text = rawHtml.replace(/<!--.*?-->/g, '');

    expect(text).toContain('STEREO');
    expect(text).not.toContain('SOUND');
  });
});
