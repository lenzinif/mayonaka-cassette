import { FunkAudioEngine } from '@src/audio/FunkAudioEngine';
import { TrackLibrary } from '@src/audio/TrackLibrary';
import type { Action, InputPressEvent, InputSource } from '@src/core/InputManager';
import { TelemetryBridge } from '@src/core/TelemetryBridge';
import { Game, type GameEvent, type TelemetrySnapshot } from '@src/engine/Game';
import { describe, expect, it } from 'vitest';
import { drawMelonSodaInset, MelonSoda, SODA_SKINS } from './MelonSoda';
import { ParticleSystem } from './Particles';
import { drawPassengerCamInset, PassengerCam } from './PassengerCam';
import { drawPlayerCar, PlayerCar } from './PlayerCar';
import { drawKeiTruck } from './TrafficAndProps';

class FakeInput implements InputSource {
  private readonly held = new Set<Action>();
  private readonly queue: InputPressEvent[] = [];

  setDown(action: Action, down: boolean): void {
    if (down) this.held.add(action);
    else this.held.delete(action);
  }

  press(action: Action, timeStamp = 100): void {
    this.queue.push({ action, timeStamp });
  }

  isDown(action: Action): boolean {
    return this.held.has(action);
  }

  consumePresses(): readonly InputPressEvent[] {
    const copy = [...this.queue];
    this.queue.length = 0;
    return copy;
  }
}

function createMockCanvasContext(): {
  ctx: CanvasRenderingContext2D;
  fillRectCalls: number;
} {
  let fillRectCalls = 0;
  const noop = () => {};
  const grad = { addColorStop: noop };
  const ctx = {
    canvas: { width: 640, height: 360 },
    fillStyle: '#000',
    strokeStyle: '#000',
    lineWidth: 1,
    globalAlpha: 1,
    font: '8px monospace',
    save: noop,
    restore: noop,
    translate: noop,
    rotate: noop,
    beginPath: noop,
    closePath: noop,
    moveTo: noop,
    lineTo: noop,
    quadraticCurveTo: noop,
    arc: noop,
    ellipse: noop,
    rect: noop,
    clip: noop,
    fill: noop,
    stroke: noop,
    fillText: noop,
    strokeRect: noop,
    fillRect: () => {
      fillRectCalls++;
    },
    createLinearGradient: () => grad,
  } as unknown as CanvasRenderingContext2D;

  return {
    ctx,
    get fillRectCalls() {
      return fillRectCalls;
    },
  };
}

describe('M7 — Drift & Collision Particles, Passenger Cam Reactions & Pixel-Art Sprites', () => {
  it('spawns continuous drift tire smoke + charged sparks and directional collision bursts in ParticleSystem', () => {
    const particles = new ParticleSystem();
    const car = new PlayerCar();
    car.speed = 10000;
    car.driftDir = 1;
    car.driftTime = 1.1; // charged drift (> 0.75s)
    car.grooveTier = 'SSS';

    for (let i = 0; i < 15; i++) {
      particles.update(1 / 60, car, 640, 360, car.grooveTier);
    }

    expect(particles.activeCount).toBeGreaterThan(5);
    expect(particles.pool.some((p) => p.active && p.kind === 'smoke')).toBe(true);
    expect(particles.pool.some((p) => p.active && p.kind === 'spark')).toBe(true);

    // Emit collision debris burst for a roadside palm tree
    const beforeBurst = particles.activeCount;
    particles.emitCollisionBurst(
      {
        type: 'collision',
        obstacle: 'prop',
        propKind: 'palm',
        outcome: 'propBounce',
        side: -1,
      },
      car,
      640,
      360,
    );
    expect(particles.activeCount).toBeGreaterThan(beforeBurst);
    expect(particles.pool.some((p) => p.active && p.kind === 'debris')).toBe(true);

    const mock = createMockCanvasContext();
    particles.render(mock.ctx, 0.5);
    expect(mock.fillRectCalls).toBeGreaterThan(10);
  });

  it('transitions PassengerCam across VIBING, HYPED, NERVOUS, and SHOCKED states', () => {
    const cam = new PassengerCam();
    expect(cam.mood).toBe('VIBING');

    // 1. Drifting or SSS Groove transitions to HYPED
    cam.update(1 / 60, {
      speedRatio: 0.85,
      steer: 0.5,
      isDrifting: true,
      driftDir: 1,
      isOffRoad: false,
      grooveTier: 'HIGH',
      sectionRole: 'drop',
      beatPulse: 0.9,
      downbeatPulse: 0.5,
      tofuActive: false,
      sodaDanger: 0,
    });
    expect(cam.mood).toBe('HYPED');

    // 2. High Melon Soda danger in Tofu Mode transitions to NERVOUS
    cam.update(1 / 60, {
      speedRatio: 0.85,
      steer: 0.2,
      isDrifting: false,
      driftDir: 0,
      isOffRoad: false,
      grooveTier: 'MEDIUM',
      sectionRole: 'intro',
      beatPulse: 0.2,
      downbeatPulse: 0,
      tofuActive: true,
      sodaDanger: 0.82,
    });
    expect(cam.mood).toBe('NERVOUS');

    // 3. Collision or spill triggers SHOCKED which takes top priority until timer expires
    cam.triggerShock(0.5);
    cam.update(1 / 60, {
      speedRatio: 0.8,
      steer: 0,
      isDrifting: true,
      driftDir: 1,
      isOffRoad: false,
      grooveTier: 'SSS',
      sectionRole: 'drop',
      beatPulse: 1,
      downbeatPulse: 1,
      tofuActive: true,
      sodaDanger: 0.9,
    });
    expect(cam.mood).toBe('SHOCKED');

    const mock = createMockCanvasContext();
    drawPassengerCamInset(mock.ctx, cam, 640, 0.5);
    expect(mock.fillRectCalls).toBeGreaterThan(15);
  });

  it('cycles through all 4 unlockable Melon Soda cup skins (docs/DESIGN.md §5.2) and renders pixel-art insets', () => {
    const soda = new MelonSoda();
    soda.setActive(true);
    expect(soda.skin).toBe('melon-soda');

    const visited: string[] = [soda.skin];
    for (let i = 0; i < SODA_SKINS.length - 1; i++) {
      visited.push(soda.cycleSkin());
    }
    expect(visited).toEqual(['melon-soda', 'tofu-cup', 'pocari', 'boss-coffee']);
    expect(soda.cycleSkin()).toBe('melon-soda');

    const mock = createMockCanvasContext();
    for (const skin of SODA_SKINS) {
      soda.skin = skin;
      drawMelonSodaInset(mock.ctx, soda, 360, 0.5);
    }
    expect(mock.fillRectCalls).toBeGreaterThan(40);
  });

  it('integrates M7 particles, passenger reactions, skin cycling, and full canvas render in Game', () => {
    const input = new FakeInput();
    const bridge = new TelemetryBridge<TelemetrySnapshot, GameEvent>(15);
    const audio = new FunkAudioEngine();
    const library = new TrackLibrary();
    const game = new Game({ input, bridge, audio, library });

    const events: GameEvent[] = [];
    bridge.onEvent((ev) => events.push(ev));

    // Press 'cycleSodaSkin' (KeyV) -> cycles skin and emits event
    input.press('cycleSodaSkin');
    game.update(1 / 60);
    expect(game.melonSoda.skin).toBe('tofu-cup');
    expect(events).toContainEqual({ type: 'sodaSkinChanged', skin: 'tofu-cup' });

    // Render full scene (Background + Road + Props + Kei Trucks + PlayerCar + Particles + MelonSoda + PassengerCam)
    const mock = createMockCanvasContext();
    drawPlayerCar(mock.ctx, game.car, 640, 360);
    drawKeiTruck(mock.ctx, 320, 220, 0.04, 0, 0.1, true);
    game.render(mock.ctx, 0.5, 60);
    expect(mock.fillRectCalls).toBeGreaterThan(80);
  });
});
