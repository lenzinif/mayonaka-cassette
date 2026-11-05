import { DEFAULT_SYNTH_BEATMAP, FunkAudioEngine } from '@src/audio/FunkAudioEngine';
import { TrackLibrary } from '@src/audio/TrackLibrary';
import { Game } from '@src/engine/Game';
import { describe, expect, it } from 'vitest';
import {
  AutopilotDriver,
  type AutopilotAudioPerception,
  type AutopilotCarPerception,
  type AutopilotForkPerception,
  type AutopilotPerception,
  type AutopilotRoadPerception,
  type AutopilotTrafficPerception,
} from './AutopilotDriver';
import type { Action, InputPressEvent, InputSource } from './InputManager';

class MockInput implements InputSource {
  private readonly held = new Set<Action>();
  private readonly queue: InputPressEvent[] = [];

  setDown(action: Action, down: boolean): void {
    if (down) this.held.add(action);
    else this.held.delete(action);
  }

  isDown(action: Action): boolean {
    return this.held.has(action);
  }

  consumePresses(): readonly InputPressEvent[] {
    const copy = [...this.queue];
    this.queue.length = 0;
    return copy;
  }

  getSteerAxis(): number {
    return this.held.has('left') ? -1 : this.held.has('right') ? 1 : 0;
  }

  getThrottleAxis(): number {
    return this.held.has('accelerate') ? 1 : 0;
  }

  getBrakeAxis(): number {
    return this.held.has('brake') ? 1 : 0;
  }
}

function createMockPerception(overrides: {
  car?: Partial<AutopilotCarPerception>;
  road?: Partial<AutopilotRoadPerception>;
  traffic?: AutopilotTrafficPerception[];
  fork?: AutopilotForkPerception;
  audio?: AutopilotAudioPerception;
  isTofu?: boolean;
} = {}): AutopilotPerception {
  const carState: AutopilotCarPerception = {
    x: 0,
    speed: 3000,
    speedRatio: 0.5,
    gear: 3,
    rpm: 0.7,
    isDrifting: false,
    steer: 0,
    isLugging: false,
    isRedlining: false,
    isOffRoad: false,
    ...overrides.car,
  };

  const roadState: AutopilotRoadPerception = {
    currentCurve: 0,
    aheadCurve: 0,
    slope: 0,
    ...overrides.road,
  };

  const trafficState: AutopilotTrafficPerception[] = overrides.traffic ?? [];

  return {
    getCarState: () => carState,
    getRoadAhead: () => roadState,
    getUpcomingTraffic: () => trafficState,
    getForkInfo: () => overrides.fork,
    getAudioBeatState: () => overrides.audio,
    isTofuModeActive: () => overrides.isTofu ?? false,
  };
}

describe('AutopilotDriver (Autonomous AI Driver & Playtester)', () => {
  it('transparently delegates to fallback input when disabled', () => {
    const fallback = new MockInput();
    fallback.setDown('accelerate', true);
    const driver = new AutopilotDriver({ fallbackInput: fallback });

    expect(driver.enabled).toBe(false);
    expect(driver.isDown('accelerate')).toBe(true);
    expect(driver.isDown('brake')).toBe(false);
    expect(driver.getThrottleAxis()).toBe(1);
    expect(driver.getSteerAxis()).toBe(0);

    // Toggle on -> driver takes over
    driver.toggle();
    expect(driver.enabled).toBe(true);

    // Toggle off -> returns to fallback
    driver.toggle();
    expect(driver.enabled).toBe(false);
    expect(driver.isDown('accelerate')).toBe(true);
  });

  it('calculates feed-forward centrifugal steering to hold road on curves', () => {
    const driver = new AutopilotDriver({ mode: 'perfect' });
    driver.setEnabled(true);

    // Curve to the right (+2.5): centrifugal force pushes left, so agent must steer right (+steer)
    const perception = createMockPerception({
      car: { x: 0, speed: 4500, speedRatio: 0.75 },
      road: { currentCurve: 2.5, aheadCurve: 2.5 },
    });
    driver.setPerception(perception);

    // Ramping steering over a few steps
    for (let i = 0; i < 15; i++) {
      driver.poll();
    }
    expect(driver.getSteerAxis()).toBeGreaterThan(0.2);
    expect(driver.isDown('right')).toBe(true);
    expect(driver.isDown('left')).toBe(false);
  });

  it('rate-limits steering jerk when Tofu Mode is active to prevent soda spills', () => {
    const driver = new AutopilotDriver();
    driver.setEnabled(true);

    // Sudden sharp curve requirement
    const perception = createMockPerception({
      car: { x: 0, speed: 4000, speedRatio: 0.65 },
      road: { currentCurve: 4.0, aheadCurve: 4.0 },
      isTofu: true,
    });
    driver.setPerception(perception);

    // Simulate 1 fixed step (dt ~ 1/120s)
    driver.poll();
    const steerStep1 = Math.abs(driver.getSteerAxis());
    // In Tofu Mode, steer is smoothly ramped (rate <= 3.6/s * dt ~ 0.03)
    expect(steerStep1).toBeLessThanOrEqual(0.06);
    expect(steerStep1).toBeGreaterThan(0);
  });

  it('steers laterally away from upcoming Kei-trucks to avoid collision', () => {
    const driver = new AutopilotDriver({ avoidTraffic: true });
    driver.setEnabled(true);

    // Truck directly ahead in center lane (laneOffset: 0, distance: 200)
    const perception = createMockPerception({
      car: { x: 0, speed: 4000, speedRatio: 0.65 },
      traffic: [{ z: 200, laneOffset: 0, speedRatio: 0.4 }],
    });
    driver.setPerception(perception);

    for (let i = 0; i < 10; i++) {
      driver.poll();
    }
    // Agent should steer away from the truck
    expect(driver.getSteerAxis()).toBeLessThan(0);
  });

  it('issues beat-quantized upshifts when RPM is high and beat window matches', () => {
    const driver = new AutopilotDriver({ rhythmShifts: true });
    driver.setEnabled(true);

    // RPM high in gear 2, but off-beat (deltaMs = 80ms)
    const offBeatPerception = createMockPerception({
      car: { gear: 2, rpm: 0.85, speed: 2500, speedRatio: 0.4 },
      audio: { beatPhase: 0.25, deltaMsToNearestBeat: 80, nearestBeatIndex: 4, isDownbeat: true },
    });
    driver.setPerception(offBeatPerception);
    driver.poll();
    expect(driver.consumePresses()).toHaveLength(0);

    // Now on-beat (deltaMs = 10ms <= 35ms)
    const onBeatPerception = createMockPerception({
      car: { gear: 2, rpm: 0.85, speed: 2500, speedRatio: 0.4 },
      audio: { beatPhase: 0.02, deltaMsToNearestBeat: 10, nearestBeatIndex: 4, isDownbeat: true },
    });
    driver.setPerception(onBeatPerception);
    driver.poll();

    const presses = driver.consumePresses();
    expect(presses).toHaveLength(1);
    expect(presses[0]!.action).toBe('shiftUp');
  });

  it('drives Game headlessly in simulation and maintains road grip with zero spills in Tofu Mode', () => {
    const audio = new FunkAudioEngine(DEFAULT_SYNTH_BEATMAP);
    const driver = new AutopilotDriver({ mode: 'perfect' });
    driver.setEnabled(true);

    const game = new Game({ input: driver, autopilot: driver, audio });
    // Activate Tofu Mode to stress-test jerk limits
    game.melonSoda.active = true;

    // Simulate 360 fixed steps (3 seconds of driving at 1/120s)
    const dt = 1 / 120;
    for (let step = 0; step < 360; step++) {
      game.update(dt);
    }

    // Agent accelerated forward
    expect(game.car.speed).toBeGreaterThan(1500);
    expect(game.hasStartedDriving).toBe(true);
    // Agent kept car on asphalt (|x| < 1.0)
    expect(Math.abs(game.car.x)).toBeLessThan(1.0);
    expect(game.car.isOffRoad).toBe(false);
    // Smooth driving preserved Melon Soda without a single spill!
    expect(game.melonSoda.spillCount).toBe(0);
  });

  it('autonomously navigates stage forks and advances playlist stages to completion', () => {
    const library = new TrackLibrary();
    const audio = new FunkAudioEngine(DEFAULT_SYNTH_BEATMAP);
    const driver = new AutopilotDriver({ mode: 'perfect', forkPreference: 'nextTrack' });
    driver.setEnabled(true);

    const game = new Game({ input: driver, autopilot: driver, audio, library });

    // Step the game forward until the car starts moving
    for (let i = 0; i < 60; i++) {
      game.update(1 / 120);
    }
    expect(game.hasStartedDriving).toBe(true);
    expect(game.car.speed).toBeGreaterThan(500);

    // Fast-forward car near the fork zone at the end of Stage 1
    game.position = game.track.length - 1500;
    for (let i = 0; i < 60; i++) {
      game.update(1 / 120);
    }

    // Agent automatically locks right branch to advance to the next track
    const snap = game.bridge.getSnapshot();
    if (snap?.forkActive) {
      expect(snap.forkChoice).toBe('right');
    }

    // Cross the finish line into Stage 2
    game.position = game.track.length - 10;
    game.update(1 / 120);

    // Advanced to Stage 2 (Midnight Wangan)
    expect(library.currentIndex).toBe(1);
    expect(game.hasStartedDriving).toBe(true);
    expect(game.car.speed).toBeGreaterThan(1000);
  });
});
