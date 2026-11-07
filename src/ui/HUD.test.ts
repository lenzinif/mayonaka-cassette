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
    grooveTier: 'SSS',
    tofuMode: true,
    sodaSkin: 'melon-soda',
    sodaDanger: 0.42,
    sodaSpills: 1,
    activeParticles: 18,
    stageNumber: 2,
    stagePaletteName: 'MIDNIGHT BAY',
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
    frameTimeMs: 8.3,
    fixedStepsLastFrame: 1,
    drawnSegments: 160,
    drawnProps: 24,
    drawnTrucks: 3,
    memoryMb: 42.5,
    ...overrides,
  };
}

describe('HUD (Overhauled Cockpit Overlay)', () => {
  it('renders cassette groove deck, tofu strip, and JDM digidash modules', () => {
    const bridge = new TelemetryBridge<TelemetrySnapshot, GameEvent>(15);
    const snap = createMockSnapshot();
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

    // Cassette Deck & Groove Tape module (with clean integrated playlist track)
    expect(text).toContain('Mayonaka FM — Plastic Love Night');
    expect(text).toContain('TRK 2/3');
    expect(text).toContain('126.0 BPM');
    expect(text).toContain('BAR 016.1');
    expect(text).toContain('FUNKY OVERDRIVE');
    expect(text).toContain('88%');

    // Tofu Mode strip & switchboard
    expect(text).toContain('TOFU CUP // ×2 GROOVE');
    expect(text).toContain('SPILLS: 1');
    expect(text).toContain('120 FPS');
    expect(text).toContain('GP');

    // JDM Digidash (Tachometer + Gearbox + Speedometer + Groove Flux)
    expect(text).toContain('DRIFTING 1.4S');
    expect(text).toContain('SHIFT ON BEAT [SPACE]');
    expect(text).toContain('LAST SHIFT: PERFECT (-12MS)');
    expect(text).toContain('72–90% BEAT ZONE');
    expect(text).toContain('214');
    expect(text).toContain('KM/H');
    expect(text).toContain('GROOVE FLUX');
    expect(text).toContain('TIER: SSS');
  });

  it('renders session telemetry and personal best inside PauseMenu when paused', () => {
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

    expect(text).toContain('PAUSED');
    expect(text).toContain('STAGE');
    expect(text).toContain((48200).toLocaleString());
    expect(text).toContain(`BEST S · ${(52000).toLocaleString()}`);
    expect(text).toContain('LAP 2');
    expect(text).toContain('01:03.45');
    expect(text).toContain('LAST 00:58.12');
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

    expect(text).not.toContain('GAME PAUSED');
    expect(text).not.toContain('RESUME DRIVE [P]');
  });
  it('renders null when gameStarted is false, preventing premature in-game overlay and pause menu', () => {
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
});