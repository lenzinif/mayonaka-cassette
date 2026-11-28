import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { MainMenu, type MainMenuProps } from './MainMenu';

describe('MainMenu (Cassette Deck Player — docs/UI.md §3)', () => {
  const defaultProps: MainMenuProps = {
    progress: { percent: 45, loaded: 9, total: 20, currentAssetId: 'sprites/car.png', failed: 0 },
    ready: false,
    audioUnlocked: false,
    currentTrackTitle: 'Neon Horizon',
    currentTrackBpm: 122,
    playlistCount: 3,
    activeTrackIndex: 0,
    onStartDrive: vi.fn(),
    onOpenCassetteDeck: vi.fn(),
    onUnlockAudio: vi.fn(),
    autoShift: false,
    onToggleAutoShift: vi.fn(),
    tofuMode: false,
    onToggleTofuMode: vi.fn(),
    sodaSkin: 'melon-soda',
    onCycleSodaSkin: vi.fn(),
    crtEnabled: true,
    onToggleCrt: vi.fn(),
  };

  it('renders vaporwave/synth title lockup, single-line summary, VU meters, and 4 deck piano keys', () => {
    const rawHtml = renderToString(createElement(MainMenu, defaultProps));
    const text = rawHtml.replace(/<!--.*?-->/g, '');

    expect(text).toContain('真夜中');
    expect(text).toContain('CASSETTE');
    expect(text).toContain('MIDNIGHT DRIVE');
    expect(text).toContain('NEON HORIZON · 122 BPM · 3 TRACKS');
    expect(text).toContain('SOUND');
    expect(text).toContain('SIDE A');
    expect(text).toContain('VU');

    expect(text).toContain('LOAD 45%');
    expect(text).toContain('TAPES');
    expect(text).toContain('OPTIONS');
    expect(text).toContain('GUIDE');

    // Zero real-world brands & zero legacy AI-slop copy
    expect(text).not.toContain('SONY');
    expect(text).not.toContain('WALKMAN');
    expect(text).not.toContain('TDK');
    expect(text).not.toContain('TRANSPORT');
    expect(text).not.toContain('88.4 FM');
    expect(text).not.toContain('C-60');
  });

  it('renders PLAY menu item cleanly when preloading completes', () => {
    const rawHtml = renderToString(
      createElement(MainMenu, {
        ...defaultProps,
        ready: true,
        progress: { percent: 100, loaded: 20, total: 20, currentAssetId: '', failed: 0 },
      }),
    );
    const text = rawHtml.replace(/<!--.*?-->/g, '');

    expect(text).toContain('PLAY');
    expect(text).not.toContain('LOAD 45%');
  });

  it('hides SOUND unlock pill when audio is already unlocked', () => {
    const rawHtml = renderToString(
      createElement(MainMenu, {
        ...defaultProps,
        audioUnlocked: true,
      }),
    );
    const text = rawHtml.replace(/<!--.*?-->/g, '');

    expect(text).not.toContain('SOUND');
    expect(text).not.toContain('STEREO');
  });
});
