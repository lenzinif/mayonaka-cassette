import { resetTuning, tuning } from '@src/config/tuning';
import { PlayerCar } from '@src/entities/PlayerCar';
import { buildTestTrack } from '@src/road/TrackBuilder';
import { beforeEach, describe, expect, it } from 'vitest';
import { TrafficManager, type CollisionEvent } from './TrafficAndProps';

describe('TrafficManager & Dynamic Flow-Preserving Collisions (M5)', () => {
  beforeEach(() => {
    resetTuning();
  });

  it('spawns deterministic AI Kei Trucks for the same track and seed', () => {
    const track = buildTestTrack();
    const tm1 = new TrafficManager(track, 'seed-alpha');
    const tm2 = new TrafficManager(track, 'seed-alpha');

    expect(tm1.trucks.length).toBeGreaterThan(0);
    expect(tm1.trucks.map((t) => ({ z: t.z, lane: t.laneOffset }))).toEqual(
      tm2.trucks.map((t) => ({ z: t.z, lane: t.laneOffset })),
    );
  });

  it('shunts the player car laterally toward off-road when rear-ending a Kei Truck head-on', () => {
    const track = buildTestTrack();
    const tm = new TrafficManager(track, 'seed-beta');
    const truck = tm.trucks[0]!;

    const car = new PlayerCar();
    car.x = truck.laneOffset;
    car.speed = tuning.maxSpeed * 0.9;

    const events: CollisionEvent[] = [];
    tm.update(1 / 120, track, car, truck.z - 50, truck.z, (e) => events.push(e));

    expect(events).toHaveLength(1);
    expect(events[0]?.obstacle).toBe('traffic');
    expect(events[0]?.outcome).toBe('playerShuntedOff');
    expect(Math.abs(car.bumpVx)).toBeGreaterThan(3.5);
    expect(car.speed).toBeGreaterThan(tuning.maxSpeed * 0.35);
  });

  it('knocks the Kei Truck off-road when sideswiped while drifting at high speed', () => {
    const track = buildTestTrack();
    const tm = new TrafficManager(track, 'seed-gamma');
    const truck = tm.trucks[0]!;

    const car = new PlayerCar();
    car.x = truck.laneOffset - 0.18;
    car.driftDir = 1;
    car.speed = tuning.maxSpeed * 0.88;

    const events: CollisionEvent[] = [];
    tm.update(1 / 120, track, car, truck.z - 50, truck.z, (e) => events.push(e));

    expect(events).toHaveLength(1);
    expect(events[0]?.outcome).toBe('truckKnockedOff');
    expect(Math.abs(truck.lateralVel)).toBeGreaterThan(4.5);

    // Advance a few frames: truck physically careens off-road (|laneOffset| > 1)
    for (let i = 0; i < 45; i++) {
      tm.update(1 / 60, track, car, 0, 0);
    }
    expect(Math.abs(truck.laneOffset)).toBeGreaterThan(1.0);
  });

  it('resolves roadside prop collisions when off-road with lateral knockback without stopping the car', () => {
    const track = buildTestTrack();
    const seg = track.segments[10]!;
    seg.sprites = [{ kind: 'palm', offset: 1.35, variant: 0 }];

    const tm = new TrafficManager();
    const car = new PlayerCar();
    car.x = 1.32;
    car.speed = tuning.maxSpeed * 0.8;

    const events: CollisionEvent[] = [];
    const z = 10 * track.segmentLength;
    tm.update(1 / 120, track, car, z - 100, z + 10, (e) => events.push(e));

    expect(events).toHaveLength(1);
    expect(events[0]).toEqual({
      type: 'collision',
      obstacle: 'prop',
      propKind: 'palm',
      outcome: 'propBounce',
      side: -1,
    });
    expect(car.speed).toBeGreaterThan(tuning.maxSpeed * 0.2);
    expect(car.bumpVx).toBeLessThan(-2.5);
  });
});
