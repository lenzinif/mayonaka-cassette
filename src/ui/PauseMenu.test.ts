import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { PauseMenu } from './PauseMenu';

describe('PauseMenu (Right-Edge Portable Player — docs/UI.md §4)', () => {
  const defaultProps = {
    open: true,
    trackTitle: 'Neon Horizon',
    trackArtist: 'Mayonaka FM',
    bpm: 122,
    tofuMode: false,
    sodaSkin: 'melon-soda' as const,
    showPerfHud: false,
    autoShift: false,
    autopilotActive: false,
    crtEnabled: true,
    onResume: vi.fn(),
    onRestartRun: vi.fn(),
    onOpenTrackLoader: vi.fn(),
    onOpenInspector: vi.fn(),
    onToggleDebug: vi.fn(),
    onToggleTofuMode: vi.fn(),
    onCycleSodaSkin: vi.fn(),
    onTogglePerfHud: vi.fn(),
    onToggleAutoShift: vi.fn(),
    onToggleAutopilot: vi.fn(),
    onToggleCrt: vi.fn(),
    onReturnToMainMenu: vi.fn(),
  };

  it('renders null when open is false', () => {
    const html = renderToString(createElement(PauseMenu, { ...defaultProps, open: false }));
    expect(html).toBe('');
  });

  it('renders MAYONAKA portable player with strictly 5 side menu items and zero real-world brands', () => {
    const rawHtml = renderToString(createElement(PauseMenu, defaultProps));
    const text = rawHtml.replace(/<!--.*?-->/g, '').replace(/&#x27;/g, "'");

    expect(text).toContain('MAYONAKA');
    expect(text).toContain('Neon Horizon');
    expect(text).toContain('RESUME');
    expect(text).toContain('RESTART');
    expect(text).toContain('OPTIONS');
    expect(text).toContain('GUIDE');
    expect(text).toContain('EXIT TO TITLE');

    expect(text).not.toContain('SONY');
    expect(text).not.toContain('WALKMAN');
    expect(text).not.toContain('WM-86');
    expect(text).not.toContain('SERVICE BUS');
  });

  it('renders shared OptionsPanel docked left when initialView is options', () => {
    const rawHtml = renderToString(
      createElement(PauseMenu, {
        ...defaultProps,
        initialView: 'options',
        tofuMode: true,
        autoShift: true,
        sodaSkin: 'pocari',
      }),
    );
    const text = rawHtml.replace(/<!--.*?-->/g, '').replace(/&#x27;/g, "'");

    expect(text).toContain('GEARBOX');
    expect(text).toContain('AUTO');
    expect(text).toContain('TOFU CUP');
    expect(text).toContain('DRINK');
    expect(text).toContain('ION DRINK');
    expect(text).toContain('CRT');
    expect(text).toContain('DASH');
    expect(text).toContain('TAPE + LIST');
    expect(text).toContain('VISOR (0/5)');
    expect(text).toContain('+ LOAD CASSETTE');
    expect(text).not.toContain('POCARI');
    expect(text).not.toContain('GEARBOX [G]');
    expect(text).not.toContain('TOFU MODE [T]');
  });

  it('renders handwritten BackGuideSheet when initialView is guide', () => {
    const rawHtml = renderToString(
      createElement(PauseMenu, {
        ...defaultProps,
        initialView: 'guide',
      }),
    );
    const text = rawHtml.replace(/<!--.*?-->/g, '').replace(/&#x27;/g, "'");

    expect(text).toContain("DRIVER'S");
    expect(text).toContain('GUIDE');
    expect(text).toContain('BEAT-SHIFT');
    expect(text).toContain('DRIFT');
    expect(text).toContain('TOFU CUP');
    expect(text).toContain('CONTROLS');
    expect(text).toContain('BACK [ESC]');
  });
});
