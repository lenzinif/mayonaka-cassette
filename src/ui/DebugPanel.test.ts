import { TelemetryBridge } from '@src/core/TelemetryBridge';
import type { GameEvent, TelemetrySnapshot } from '@src/engine/Game';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { DebugPanel, FUTURE_FUNK_THEMES } from './DebugPanel';

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
    stagePaletteId: 'night',
    stagePaletteName: 'MAYONAKA BAY',
    stageAccentColor: '#00f0b5',
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
    autopilotMode: 'perfect',
    simTimeMs: 0.35,
    renderTimeMs: 1.15,
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
    sessionAvgFps: 119.4,
    sessionMinFps: 108,
    pct60Fps: 100,
    fixedStepsLastFrame: 1,
    drawnSegments: 160,
    drawnProps: 24,
    drawnTrucks: 3,
    drawnPylonSpans: 4,
    crestClips: 2,
    memoryMb: 42.5,
    ...overrides,
  };
}

const LEGACY_CLASS_TOKENS = [
  'fuchsia-',
  'cyan-',
  'emerald-',
  'amber-',
  'pink-',
  'bg-[#0d0221]',
  'bg-[#12052b]',
  'bg-[#090117]',
  'bg-[#160730]',
  'bg-[#070114]',
  'bg-[#05010f]',
  'animate-pulse',
  'backdrop-blur',
];

const FORBIDDEN_EMOJIS = ['🤖', '⛈️', '☁️', '🕊️', '✨', '⚡'];

describe('DebugPanel (Minimalist Diagnostics UI)', () => {
  it('returns empty string when open is false', () => {
    const html = renderToString(
      createElement(DebugPanel, { open: false, onClose: vi.fn() }),
    );
    expect(html).toBe('');
  });

  it('renders minimalist Mayonaka Hi-Fi tuning tab without legacy synthwave styles or emojis', () => {
    const rawHtml = renderToString(
      createElement(DebugPanel, { open: true, onClose: vi.fn() }),
    );
    const text = rawHtml.replace(/<!--.*?-->/g, '');

    expect(text).toContain('DEV CONSOLE');
    expect(text).toContain('60 FPS');
    expect(text).toContain('COPY JSON');
    expect(text).toContain('RESET');

    expect(text).toContain('role="tablist"');
    expect(text).toContain('FEEL TUNING');
    expect(text).toContain('PERF PROFILER');
    expect(text).toContain('aria-selected="true"');

    expect(text).toContain('AUTOPILOT');
    expect(text).toContain('AUTOPILOT: OFF');
    expect(text).toContain('perfect');
    expect(text).toContain('relaxed');
    expect(text).toContain('aggressive');

    for (const theme of FUTURE_FUNK_THEMES) {
      expect(text).toContain(theme.name);
      expect(text).toContain(theme.sub);
    }

    expect(text).toContain('ENVIRONMENT');
    expect(text).toContain('RAIN');
    expect(text).toContain('CLOUDS');
    expect(text).toContain('BIRDS');
    expect(text).toContain('STARS');
    expect(text).toContain('BEAT LIGHTNING');

    expect(text).toContain('PARAMETERS');
    expect(text).toContain('<details open="" class="ff-details">');
    expect(text).toContain('Camera');
    expect(text).toContain('Speed');
    expect(text).not.toContain('Weather &amp; Sky');
    expect(text).not.toContain('Weather & Sky');

    for (const token of LEGACY_CLASS_TOKENS) {
      expect(text).not.toContain(token);
    }
    for (const emoji of FORBIDDEN_EMOJIS) {
      expect(text).not.toContain(emoji);
    }
  });

  it('renders profiler tab with all diagnostic sections, telemetry values, and perf-report-json', () => {
    const bridge = new TelemetryBridge<TelemetrySnapshot, GameEvent>(15);
    const snap = createMockSnapshot();
    bridge.publish(() => snap);

    const rawHtml = renderToString(
      createElement(DebugPanel, {
        open: true,
        onClose: vi.fn(),
        bridge,
        initialTab: 'profiler',
      }),
    );
    const text = rawHtml.replace(/<!--.*?-->/g, '');

    expect(text).toContain('120 FPS');
    expect(text).toContain('DUMP BENCHMARK');
    expect(text).toContain('SESSION SCORECARD');
    expect(text).toContain('SUBSYSTEM ISOLATION');
    expect(text).toContain('FRAME BUDGET');
    expect(text).toContain('RENDER BREAKDOWN (JS)');
    expect(text).toContain('SCENE GEOMETRY');
    expect(text).toContain('ENGINE &amp; MEMORY');
    expect(text).toContain('data-testid="perf-report-json"');

    expect(text).toContain('Plastic Love Night');
    expect(text).toContain('126 BPM');
    expect(text).toContain('Bar 15/64 (drop)');
    expect(text).toContain('119.4');
    expect(text).toContain('108');
    expect(text).toContain('100.0%');
    expect(text).toContain('42.5 MB');
    expect(text).toContain('160');
    expect(text).toContain('24');
    expect(text).toContain('3');
    expect(text).toContain('18');

    for (const token of LEGACY_CLASS_TOKENS) {
      expect(text).not.toContain(token);
    }
    for (const emoji of FORBIDDEN_EMOJIS) {
      expect(text).not.toContain(emoji);
    }
  });
});
