import { TrackLibrary } from '@src/audio/TrackLibrary';
import { TelemetryBridge } from '@src/core/TelemetryBridge';
import type { GameEvent, TelemetrySnapshot } from '@src/engine/Game';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { RadioSelector } from './RadioSelector';

function createForkSnapshot(overrides: Partial<TelemetrySnapshot> = {}): TelemetrySnapshot {
  return {
    speedKmh: 200,
    speedRatio: 0.72,
    playerX: 0,
    isDrifting: false,
    driftDirection: 0,
    driftTime: 0,
    isOffRoad: false,
    hasStartedDriving: true,
    lap: 1,
    lapTime: 50,
    lastLapTime: null,
    fps: 60,
    bpm: 122,
    barIndex: 20,
    beatInBar: 0,
    beatPulse: 0.5,
    sectionRole: 'outro',
    barEnergy: 0.4,
    filterCutoffHz: 4200,
    trackTitle: 'Neon Horizon',
    trackArtist: 'Mayonaka FM',
    audioUnlocked: true,
    roadBarIndex: 20,
    totalBars: 32,
    currentChunkId: 'outro-fork',
    syncDeltaBeats: 0,
    gear: 5,
    rpm: 0.8,
    isLugging: false,
    isRedlining: false,
    isOverdrive: false,
    autoShift: false,
    lastShiftTier: null,
    lastShiftDeltaMs: null,
    groove: 70,
    grooveTier: 'HIGH',
    tofuMode: false,
    sodaSkin: 'melon-soda',
    sodaDanger: 0,
    sodaSpills: 0,
    activeParticles: 0,
    stageNumber: 1,
    stagePaletteId: 'night',
    stagePaletteName: 'MAYONAKA BAY',
    stageAccentColor: '#00f0b5',
    playlistIndex: 0,
    playlistLength: 2,
    stageScore: 12000,
    bestSongScore: null,
    bestSongGrade: null,
    isCrossfading: false,
    crossfadeProgress: 0,
    isOutroLooping: false,
    forkActive: false,
    forkChoice: 'right',
    forkProgress: 0,
    forkLeftOption: null,
    forkRightOption: null,
    isPaused: false,
    gamepadConnected: false,
    autopilotActive: false,
    autopilotMode: null,
    simTimeMs: 0.2,
    renderTimeMs: 1.0,
    bgRenderMs: 0.2,
    roadRenderMs: 0.5,
    roadSlicesMs: 0.2,
    roadPropsMs: 0.2,
    roadTrafficMs: 0.1,
    carOverlayMs: 0.2,
    compositorGapMs: 2.0,
    frameTimeMs: 16.6,
    p95FrameMs: 16.6,
    maxFrameMs: 16.7,
    minFps: 60,
    droppedFrames: 0,
    sessionAvgFps: 60,
    sessionMinFps: 60,
    pct60Fps: 100,
    fixedStepsLastFrame: 1,
    drawnSegments: 160,
    drawnProps: 10,
    drawnTrucks: 1,
    drawnPylonSpans: 0,
    crestClips: 0,
    memoryMb: null,
    ...overrides,
  };
}

describe('RadioSelector (Stage Fork & End-of-Run)', () => {
  it('suppresses stage transition toast even during active crossfade when fork is inactive', () => {
    const bridge = new TelemetryBridge<TelemetrySnapshot, GameEvent>(15);
    bridge.publish(() =>
      createForkSnapshot({
        isCrossfading: true,
        crossfadeProgress: 0.5,
        forkActive: false,
      }),
    );

    const html = renderToString(
      createElement(RadioSelector, {
        bridge,
        library: new TrackLibrary(),
        onRestartRun: vi.fn(),
        onOpenTrackLoader: vi.fn(),
      }),
    );
    const text = html.replace(/<!--.*?-->/g, '');

    expect(text).not.toContain('4-BAR DJ CROSSFADE');
    expect(text).not.toContain('STAGE 01');
  });

  it('still renders the interactive stage fork selector when forkActive is true', () => {
    const bridge = new TelemetryBridge<TelemetrySnapshot, GameEvent>(15);
    bridge.publish(() =>
      createForkSnapshot({
        forkActive: true,
        forkProgress: 0.4,
        forkLeftOption: {
          branch: 'left',
          mode: 'loop',
          label: 'LOOP TRACK',
          title: 'Neon Horizon',
          artist: 'Mayonaka FM',
          bpm: 122,
          contentHash: 'sha256:left',
          bestScore: null,
          bestGrade: null,
        },
        forkRightOption: {
          branch: 'right',
          mode: 'nextTrack',
          label: 'NEXT STAGE',
          title: 'Wangan Midnight',
          artist: 'Plastic Love FM',
          bpm: 126,
          contentHash: 'sha256:right',
          bestScore: 42000,
          bestGrade: 'S',
        },
      }),
    );

    const html = renderToString(
      createElement(RadioSelector, {
        bridge,
        library: new TrackLibrary(),
        onRestartRun: vi.fn(),
        onOpenTrackLoader: vi.fn(),
      }),
    );
    const text = html.replace(/<!--.*?-->/g, '');

    expect(text).toContain('NEXT STAGE');
    expect(text).toContain('Neon Horizon');
    expect(text).toContain('Wangan Midnight');
  });
});
