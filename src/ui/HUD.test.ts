import { TelemetryBridge } from '@src/core/TelemetryBridge';
import type { GameEvent, TelemetrySnapshot } from '@src/engine/Game';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { HUD } from './HUD';

function createMockSnapshot(overrides: Partial<TelemetrySnapshot> = {}): TelemetrySnapshot {
  return {
    speedKmh: 214,
    speedRatio: 0.76,
    playerX: 0,
    isDrifting: true,
    driftDirection: 1,
    driftTime: 1.4,
    isOffRoad: false,
    hasStartedDriving: true,
    lap: 2,
    lapTime: 63.45,
    lastLapTime: 58.12,
    fps: 120,
    bpm: 126,
    barIndex: 15,
    beatInBar: 0,
    beatPulse: 1,
    sectionRole: 'drop',
    barEnergy: 0.85,
    filterCutoffHz: 9800,
    trackTitle: 'Plastic Love Night',
    trackArtist: 'Mayonaka FM',
    audioUnlocked: true,
    roadBarIndex: 15,
    totalBars: 64,
    currentChunkId: 'drop-neon-sweeper',
    syncDeltaBeats: 0,
    gear: 5,
    rpm: 0.82,
    isLugging: false,
    isRedlining: false,
    isOverdrive: false,
    autoShift: false,
    lastShiftTier: 'PERFECT',
    lastShiftDeltaMs: -12,
    groove: 88,
    grooveTier: 'OVERDRIVE',
    tofuMode: true,
    sodaSkin: 'melon-soda',
    sodaDanger: 0.42,
    sodaSpills: 1,
    activeParticles: 18,
    stageNumber: 2,
    stagePaletteId: 'og_future_funk',
    stagePaletteName: 'SUNSET BOULEVARD',
    stageAccentColor: '#ff7b25',
    playlistIndex: 1,
    playlistLength: 3,
    stageScore: 48200,
    bestSongScore: 52000,
    bestSongGrade: 'S',
    isCrossfading: false,
    crossfadeProgress: 0,
    isOutroLooping: false,
    forkActive: false,
    forkChoice: 'right',
    forkProgress: 0,
    forkLeftOption: null,
    forkRightOption: null,
    isPaused: false,
    gamepadConnected: true,
    autopilotActive: false,
    autopilotMode: null,
    simTimeMs: 0.3,
    renderTimeMs: 1.1,
    bgRenderMs: 0.3,
    roadRenderMs: 0.6,
    roadSlicesMs: 0.25,
    roadPropsMs: 0.3,
    roadTrafficMs: 0.05,
    carOverlayMs: 0.2,
    compositorGapMs: 6.9,
    frameTimeMs: 8.3,
    p95FrameMs: 8.5,
    maxFrameMs: 9.1,
    minFps: 110,
    droppedFrames: 0,
    sessionAvgFps: 120,
    sessionMinFps: 110,
    pct60Fps: 100,
    fixedStepsLastFrame: 1,
    drawnSegments: 160,
    drawnProps: 24,
    drawnTrucks: 3,
    drawnPylonSpans: 0,
    crestClips: 0,
    memoryMb: 42.5,
    ...overrides,
  };
}

describe('HUD (4-Quadrant Luxurious Clutter — docs/UI.md §5)', () => {
  it('renders 4-quadrant clutter HUD with monochrome accent, bottom-left VFD, top-right visor, and zero interactive buttons', () => {
    const bridge = new TelemetryBridge<TelemetrySnapshot, GameEvent>(15);
    const snap = createMockSnapshot({ gear: 4, rpm: 0.92 });
    bridge.publish(() => snap);

    const rawHtml = renderToString(
      createElement(HUD, {
        bridge,
        debugOpen: false,
        playlistItems: [
          { id: '1', title: 'Neon Horizon', artist: 'Mayonaka FM', bpm: 122 },
          { id: '2', title: 'Plastic Love Night', artist: 'Mayonaka FM', bpm: 126 },
        ],
        onToggleDebug: vi.fn(),
        onOpenTrackLoader: vi.fn(),
        onOpenInspector: vi.fn(),
        onRestartRun: vi.fn(),
      }),
    );
    const text = rawHtml.replace(/<!--.*?-->/g, '');

    // Top-left cassette + adjacent playlist + monochrome theme accent
    expect(text).toContain('Plastic Love Night');
    expect(text).toContain('01 Neon Horizon');
    expect(text).toContain('02 Plastic Love Night');
    expect(rawHtml).toContain('background-color:#ff7b25');

    // Bottom-left VFD speedometer & tachometer
    expect(text).toContain('214');
    expect(text).toContain('KM/H');
    expect(text).toContain('RPM');
    expect(text).toContain('GROOVE');
    expect(text).toContain('4');

    // Top-right Sun Visor
    expect(rawHtml).toContain('Default retro manga Tokyo night postcard');

    // Strictly zero interactive buttons & zero AI-slop copy during driving
    expect(rawHtml).not.toContain('<button');
    expect(text).not.toContain('DIGITAL COCKPIT');
    expect(text).not.toContain('GT-APEX');
    expect(text).not.toContain('SHIFT BEAT');
    expect(text).not.toContain('WM-86');
    expect(text).not.toContain('88.4 FM');
    expect(text).not.toContain('SUN VISOR');
    expect(text).not.toContain('HUD H');
  });

  it('renders right-edge MAYONAKA PauseMenu when paused', () => {
    const bridge = new TelemetryBridge<TelemetrySnapshot, GameEvent>(15);
    const snap = createMockSnapshot({ isPaused: true });
    bridge.publish(() => snap);

    const rawHtml = renderToString(
      createElement(HUD, {
        bridge,
        debugOpen: false,
        onToggleDebug: vi.fn(),
        onOpenTrackLoader: vi.fn(),
        onOpenInspector: vi.fn(),
        onRestartRun: vi.fn(),
      }),
    );
    const text = rawHtml.replace(/<!--.*?-->/g, '');

    expect(text).toContain('MAYONAKA');
    expect(text).toContain('RESUME');
    expect(text).toContain('RESTART');
    expect(text).toContain('OPTIONS');
    expect(text).toContain('GUIDE');
    expect(text).toContain('EXIT TO TITLE');
  });

  it('does not render PauseMenu when trackLoaderOpen is true even if isPaused is true', () => {
    const bridge = new TelemetryBridge<TelemetrySnapshot, GameEvent>(15);
    const snap = createMockSnapshot({ isPaused: true });
    bridge.publish(() => snap);

    const rawHtml = renderToString(
      createElement(HUD, {
        bridge,
        debugOpen: false,
        trackLoaderOpen: true,
        onToggleDebug: vi.fn(),
        onOpenTrackLoader: vi.fn(),
        onOpenInspector: vi.fn(),
        onRestartRun: vi.fn(),
      }),
    );
    const text = rawHtml.replace(/<!--.*?-->/g, '');

    expect(text).not.toContain('EXIT TO TITLE');
  });

  it('renders null when gameStarted is false', () => {
    const bridge = new TelemetryBridge<TelemetrySnapshot, GameEvent>(15);
    const snap = createMockSnapshot({ isPaused: true });
    bridge.publish(() => snap);

    const rawHtml = renderToString(
      createElement(HUD, {
        bridge,
        gameStarted: false,
        debugOpen: false,
        onToggleDebug: vi.fn(),
        onOpenTrackLoader: vi.fn(),
        onOpenInspector: vi.fn(),
        onRestartRun: vi.fn(),
      }),
    );

    expect(rawHtml).toBe('');
  });

  it('respects individual cockpitVisibility toggles for modular cockpit stripping', () => {
    const bridge = new TelemetryBridge<TelemetrySnapshot, GameEvent>(15);
    const snap = createMockSnapshot();
    bridge.publish(() => snap);

    const rawHtml = renderToString(
      createElement(HUD, {
        bridge,
        debugOpen: false,
        cockpitVisibility: {
          showInstrumentCluster: false,
          showRadioConsole: false,
          showSunVisor: false,
          showCassetteWidget: true,
        },
        onToggleDebug: vi.fn(),
        onOpenTrackLoader: vi.fn(),
        onOpenInspector: vi.fn(),
        onRestartRun: vi.fn(),
      }),
    );
    const text = rawHtml.replace(/<!--.*?-->/g, '');

    expect(text).toContain('Plastic Love Night');
    expect(rawHtml).not.toContain('Default retro manga Tokyo night postcard');
    expect(text).not.toContain('KM/H');
  });
});
