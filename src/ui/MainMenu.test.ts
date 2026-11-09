import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { MainMenu, type MainMenuProps } from './MainMenu';

describe('MainMenu (UI Layer)', () => {
  const defaultProps: MainMenuProps = {
    progress: { percent: 45, loaded: 9, total: 20, currentAssetId: 'sprites/car.png', failed: 0 },
    ready: false,
    audioUnlocked: false,
    currentTrackTitle: 'Neon Horizon (Synth Fallback)',
    currentTrackBpm: 122,
    onStartDrive: vi.fn(),
    onOpenCassetteDeck: vi.fn(),
    onOpenInspector: vi.fn(),
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

  it('renders retro arcade title, Japanese calligraphy, version, and preloading status when ready is false', () => {
    const rawHtml = renderToString(createElement(MainMenu, defaultProps));
    const text = rawHtml.replace(/<!--.*?-->/g, '');

    expect(text).toContain('真夜中CASSETTE');
    expect(text).toContain('MAYONAKA CASSETTE');
    expect(text).toContain('OUTRUN FM 88.4');
    expect(text).toContain('TUNE IN AUDIO');
    expect(text).toContain('TAPE');
    expect(text).toContain('Neon Horizon');
    expect(text).toContain('122.0 BPM');

    // Clean 4-item arcade menu items
    expect(text).toContain('LOADING ASSETS... (45%)');
    expect(text).toContain('SELECT TRACK');
    expect(text).toContain('OPTIONS');
    expect(text).toContain('CONTROLS &amp; GUIDE');

    // Discrete dev button in footer
    expect(text).toContain('BEATMAP LAB [DEV]');

    // Footer navigation hint
    expect(text).toContain('[W/S] NAVIGATE');
    expect(text).toContain('[ENTER] SELECT');
  });

  it('renders ready state and flashing READY badge when preloading completes', () => {
    const rawHtml = renderToString(
      createElement(MainMenu, {
        ...defaultProps,
        ready: true,
        progress: { percent: 100, loaded: 20, total: 20, currentAssetId: '', failed: 0 },
      }),
    );
    const text = rawHtml.replace(/<!--.*?-->/g, '');

    expect(text).toContain('START DRIVE');
    expect(text).toContain('READY');
  });

  it('renders ON AIR equalizer badge when audio is unlocked', () => {
    const rawHtml = renderToString(
      createElement(MainMenu, {
        ...defaultProps,
        audioUnlocked: true,
      }),
    );
    const text = rawHtml.replace(/<!--.*?-->/g, '');

    expect(text).toContain('STEREO ON AIR');
    expect(text).not.toContain('TUNE IN AUDIO');
  });
});
