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
    expect(car.bumpVx).toBeCloseTo(-tuning.propBounceImpulse, 1);
  });

  it('translates visible trucks by deltaZ without pop-in during an A2 horizon stitch', () => {
    const track = buildTestTrack();
    const tm = new TrafficManager();
    // Manually add 3 trucks:
    // Truck 1: in source window (visible to player at fromZ = 2000)
    // Truck 2: in destination window (not visible before, but would be in view after +4000 shift)
    // Truck 3: far ahead (beyond both windows)
    tm.trucks.push(
      {
        id: 1,
        z: 2500, // 500 units ahead of player
        baseLaneOffset: 0,
        laneOffset: 0,
        lateralVel: 0,
        tiltAngle: 0,
        knockedTimer: 0,
        speedRatio: 0.45,
        variant: 0,
        segmentIndex: 12,
        nextInSegment: -1,
      },
      {
        id: 2,
        z: 6300, // In destination window [6000, 8000)
        baseLaneOffset: 0.58,
        laneOffset: 0.58,
        lateralVel: 0,
        tiltAngle: 0,
        knockedTimer: 0,
        speedRatio: 0.45,
        variant: 1,
        segmentIndex: 31,
        nextInSegment: -1,
      },
      {
        id: 3,
        z: 14000, // Far away
        baseLaneOffset: -0.58,
        laneOffset: -0.58,
        lateralVel: 0,
        tiltAngle: 0,
        knockedTimer: 0,
        speedRatio: 0.45,
        variant: 2,
        segmentIndex: 70,
        nextInSegment: -1,
      },
    );

    const fromZ = 2000;
    const deltaZ = 4000;
    const windowWorldSpan = 2000;

    tm.shiftVisibleWindowTrucks(track, fromZ, deltaZ, windowWorldSpan);

    const t1 = tm.trucks.find((t) => t.id === 1)!;
    const t2 = tm.trucks.find((t) => t.id === 2)!;
    const t3 = tm.trucks.find((t) => t.id === 3)!;

    // Truck 1 was at 2500 (relative offset +500 from player at 2000).
    // After player jumps to 6000, truck 1 must be at 6500 (relative offset +500).
    expect(t1.z).toBe(6500);
    // Truck 2 was in the destination window [6000, 8000), so it was pushed beyond 8000
    expect(t2.z).toBeGreaterThanOrEqual(8000);
    // Truck 3 was untouched
    expect(t3.z).toBe(14000);
  });
});
