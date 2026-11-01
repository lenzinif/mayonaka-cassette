type Listener<T> = (value: T) => void;

/**
 * Engine → React bridge (AGENTS.md §2).
 *
 * - Continuous telemetry is throttled: `offer()` may be called every simulation step, but a new
 *   snapshot is built and broadcast at most `hz` times per (simulated) second.
 * - Discrete events (drift end, groove tier change, stage fork...) are delivered immediately.
 *
 * `subscribe` + `getSnapshot` match React's `useSyncExternalStore` contract.
 */
export class TelemetryBridge<Snapshot, Event> {
  private snapshot: Snapshot | null = null;
  private lastPublish = Number.NEGATIVE_INFINITY;
  private readonly snapshotListeners = new Set<() => void>();
  private readonly eventListeners = new Set<Listener<Event>>();
  private readonly interval: number;

  constructor(hz: number) {
    this.interval = 1 / hz;
  }

  /** Builds and publishes a snapshot only if the throttle interval has elapsed. */
  offer(time: number, build: () => Snapshot): void {
    if (time - this.lastPublish < this.interval) return;
    this.lastPublish = time;
    this.snapshot = build();
    for (const listener of this.snapshotListeners) listener();
  }

  emit(event: Event): void {
    for (const listener of this.eventListeners) listener(event);
  }

  readonly subscribe = (listener: () => void): (() => void) => {
    this.snapshotListeners.add(listener);
    return () => this.snapshotListeners.delete(listener);
  };

  readonly getSnapshot = (): Snapshot | null => this.snapshot;

  onEvent(listener: Listener<Event>): () => void {
    this.eventListeners.add(listener);
    return () => this.eventListeners.delete(listener);
  }
}
