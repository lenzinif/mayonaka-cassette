import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
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
    autopilotActive: false,
    crtEnabled: true,
    onResume: vi.fn(),
    onRestartRun: vi.fn(),
    onOpenTrackLoader: vi.fn(),
    onOpenInspector: vi.fn(),
    onToggleDebug: vi.fn(),
    onToggleTofuMode: vi.fn(),
    onCycleSodaSkin: vi.fn(),
    onToggleCleanHud: vi.fn(),
    onTogglePerfHud: vi.fn(),
    onToggleAutoShift: vi.fn(),
    onToggleAutopilot: vi.fn(),
    onToggleCrt: vi.fn(),
  };

  it('renders null when open is false', () => {
    const html = renderToString(createElement(PauseMenu, { ...defaultProps, open: false }));
    expect(html).toBe('');
  });

  it('renders clean arcade pause menu with header, VFD session strip, symmetric actions, and dev bar', () => {
    const rawHtml = renderToString(createElement(PauseMenu, defaultProps));
    const text = rawHtml.replace(/<!--.*?-->/g, '');

    // Header bar
    expect(text).toContain('PAUSED');
    expect(text).toContain('STAGE 01');
    expect(text).toContain('122.0 BPM');

    // VFD Session Strip
    expect(text).toContain('Neon Horizon');
    expect(text).toContain('OutRun FM 88.4 — Neon Horizon');
    expect(text).toContain('GROOVE 75%');
    expect(text).toContain('HIGH');
    expect(text).toContain((12500).toLocaleString());
    expect(text).toContain('PTS');
    expect(text).toContain('LAP 2');
    expect(text).toContain('00:45.67');

    // 5 Symmetric Arcade Actions
    expect(text).toContain('RESUME DRIVE [P]');
    expect(text).toContain('RESTART RUN');
    expect(text).toContain('CHANGE TRACK [M]');
    expect(text).toContain('OPTIONS');
    expect(text).toContain('CONTROLS');

    // Discrete Dev Footer Bar
    expect(text).toContain('DEV');
    expect(text).toContain('[F2] TUNING');
    expect(text).toContain('[F3] PERF: OFF');
    expect(text).toContain('[F4] AUTO: OFF');
    expect(text).toContain('BEATMAP LAB');
  });

  it('renders personal best and last lap time when available in session stats', () => {
    const rawHtml = renderToString(
      createElement(PauseMenu, {
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

  it('renders return to main menu button when onReturnToMainMenu is provided', () => {
    const onReturn = vi.fn();
    const rawHtml = renderToString(
      createElement(PauseMenu, { ...defaultProps, onReturnToMainMenu: onReturn }),
    );
    expect(rawHtml).toContain('QUIT TO TITLE');
  });

  it('renders options sub-view with key-value toggle rows and back button', () => {
    const rawHtml = renderToString(
      createElement(PauseMenu, {
        ...defaultProps,
        initialView: 'options',
        tofuMode: true,
        sodaSpills: 3,
        autoShift: true,
        cleanHud: true,
        crtEnabled: true,
      }),
    );
    const text = rawHtml.replace(/<!--.*?-->/g, '');

    expect(text).toContain('OPTIONS');
    expect(text).toContain('BACK [ESC]');
    expect(text).toContain('GEAR SHIFT [G]');
    expect(text).toContain('AUTO-SHIFT');
    expect(text).toContain('TOFU MODE [T]');
    expect(text).toContain('ON (×2) [3]');
    expect(text).toContain('DASHBOARD CUP [V]');
    expect(text).toContain('MELON SODA');
    expect(text).toContain('HUD MODE [H]');
    expect(text).toContain('MINIMAL');
    expect(text).toContain('CRT SCANLINES');
    expect(text).toContain('ON');
    expect(text).not.toContain('BACK TO PAUSE');
  });

  it('renders controls sub-view with 2-column reference card', () => {
    const rawHtml = renderToString(
      createElement(PauseMenu, {
        ...defaultProps,
        initialView: 'controls',
      }),
    );
    const text = rawHtml.replace(/<!--.*?-->/g, '');

    expect(text).toContain('COCKPIT CONTROLS');
    expect(text).toContain('BACK [ESC]');
    expect(text).toContain('WASD / ARROWS');
    expect(text).toContain('Steer &amp; Gas');
    expect(text).toContain('S / DOWN + STEER');
    expect(text).toContain('Drift');
    expect(text).toContain('SPACE / SHIFT');
    expect(text).toContain('Shift Up/Down');
    expect(text).toContain('Auto-Shift');
    expect(text).toContain('Tofu Mode');
    expect(text).toContain('Cup Skin');
    expect(text).toContain('Tape Widget');
    expect(text).toContain('Minimal HUD');
    expect(text).not.toContain('BACK TO PAUSE');
  });
});
