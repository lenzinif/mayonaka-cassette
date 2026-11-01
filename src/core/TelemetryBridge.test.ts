import { describe, expect, it, vi } from 'vitest';
import { TelemetryBridge } from './TelemetryBridge';

describe('TelemetryBridge', () => {
  it('throttles continuous snapshots to the configured frequency', () => {
    const bridge = new TelemetryBridge<{ v: number }, string>(10); // interval = 0.1s
    const listener = vi.fn();
    bridge.subscribe(listener);

    bridge.offer(0, () => ({ v: 1 }));
    expect(bridge.getSnapshot()).toEqual({ v: 1 });
    expect(listener).toHaveBeenCalledTimes(1);

    // Too soon: should not build or broadcast
    bridge.offer(0.05, () => ({ v: 2 }));
    expect(bridge.getSnapshot()).toEqual({ v: 1 });
    expect(listener).toHaveBeenCalledTimes(1);

    // Interval elapsed: publishes new snapshot
    bridge.offer(0.11, () => ({ v: 3 }));
    expect(bridge.getSnapshot()).toEqual({ v: 3 });
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('delivers discrete events immediately without throttling', () => {
    const bridge = new TelemetryBridge<number, string>(10);
    const events: string[] = [];
    const unsub = bridge.onEvent((e) => events.push(e));

    bridge.emit('driftStart');
    bridge.emit('driftEnd');
    unsub();
    bridge.emit('ignored');

    expect(events).toEqual(['driftStart', 'driftEnd']);
  });
});
