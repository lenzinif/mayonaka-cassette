export type Action =
  | 'left'
  | 'right'
  | 'accelerate'
  | 'brake'
  | 'drift'
  | 'shiftUp'
  | 'shiftDown'
  | 'tofuMode'
  | 'cycleSodaSkin'
  | 'autoShift'
  | 'forkLeft'
  | 'forkRight';

export interface InputPressEvent {
  action: Action;
  /** High-resolution timestamp (`KeyboardEvent.timeStamp` / `performance.now()` in ms). */
  timeStamp: number;
}

/**
 * Keyboard bindings:
 * - `Space` = Shift Up (`shiftUp`)
 * - `ShiftLeft` / `ShiftRight` = Shift Down (`shiftDown`)
 * - `KeyC` / `ControlLeft` = Drift hold (`drift`), plus OutRun-style Brake+Steer drift in `PlayerCar`
 * - `KeyE` / `KeyQ` removed per user feedback.
 */
const KEY_BINDINGS: Readonly<Record<string, Action>> = {
  ArrowLeft: 'left',
  KeyA: 'left',
  ArrowRight: 'right',
  KeyD: 'right',
  ArrowUp: 'accelerate',
  KeyW: 'accelerate',
  ArrowDown: 'brake',
  KeyS: 'brake',
  Space: 'shiftUp',
  ShiftLeft: 'shiftDown',
  ShiftRight: 'shiftDown',
  KeyC: 'drift',
  ControlLeft: 'drift',
  KeyT: 'tofuMode',
  KeyV: 'cycleSodaSkin',
  KeyG: 'autoShift',
  Digit1: 'forkLeft',
  Numpad1: 'forkLeft',
  Digit2: 'forkRight',
  Numpad2: 'forkRight',
};

/** Read-only view of input used by the engine; lets tests inject a fake. */
export interface InputSource {
  isDown(action: Action): boolean;
  /** Drains any discrete key-press edges recorded since the previous call (AGENTS.md §4.8). */
  consumePresses?(): readonly InputPressEvent[];
}

/**
 * Polling input state + timestamped press edge queue (AGENTS.md §3 & §4.8).
 *
 * DOM events update held-key counts and push non-repeating press edges with `event.timeStamp`
 * so beat-quantized actions (`Space` = shiftUp, `Shift` = shiftDown) are judged against the exact
 * keydown moment rather than the fixed-step polling tick.
 */
export class InputManager implements InputSource {
  private readonly pressed = new Set<string>();
  private readonly actionCounts: Record<Action, number> = {
    left: 0,
    right: 0,
    accelerate: 0,
    brake: 0,
    drift: 0,
    shiftUp: 0,
    shiftDown: 0,
    tofuMode: 0,
    cycleSodaSkin: 0,
    autoShift: 0,
    forkLeft: 0,
    forkRight: 0,
  };
  private readonly pressQueue: InputPressEvent[] = [];
  private readonly drainedPresses: InputPressEvent[] = [];

  constructor(private readonly target: Window = window) {
    target.addEventListener('keydown', this.onKeyDown);
    target.addEventListener('keyup', this.onKeyUp);
    target.addEventListener('blur', this.onBlur);
  }

  isDown(action: Action): boolean {
    return this.actionCounts[action] > 0;
  }

  /**
   * Returns and clears all queued press-edge events since the last drain.
   * Reuses an internal buffer to avoid allocations when empty.
   */
  consumePresses(): readonly InputPressEvent[] {
    this.drainedPresses.length = 0;
    if (this.pressQueue.length === 0) return this.drainedPresses;
    for (let i = 0; i < this.pressQueue.length; i++) {
      this.drainedPresses.push(this.pressQueue[i]!);
    }
    this.pressQueue.length = 0;
    return this.drainedPresses;
  }

  /**
   * Enqueues a synthetic action press (e.g. from HUD buttons for Tofu Mode or Auto-Shift).
   */
  triggerAction(
    action: Action,
    timeStamp = typeof performance !== 'undefined' ? performance.now() : 0,
  ): void {
    this.pressQueue.push({ action, timeStamp });
  }

  dispose(): void {
    this.target.removeEventListener('keydown', this.onKeyDown);
    this.target.removeEventListener('keyup', this.onKeyUp);
    this.target.removeEventListener('blur', this.onBlur);
    this.onBlur();
  }

  private readonly onKeyDown = (e: KeyboardEvent): void => {
    const tag = (e.target as HTMLElement | null)?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

    const action = KEY_BINDINGS[e.code];
    if (!action) return;
    e.preventDefault();
    if (this.pressed.has(e.code)) return;

    this.pressed.add(e.code);
    this.actionCounts[action]++;
    this.pressQueue.push({
      action,
      timeStamp:
        e.timeStamp > 0
          ? e.timeStamp
          : typeof performance !== 'undefined'
            ? performance.now()
            : 0,
    });
  };

  private readonly onKeyUp = (e: KeyboardEvent): void => {
    const action = KEY_BINDINGS[e.code];
    if (!action || !this.pressed.delete(e.code)) return;
    this.actionCounts[action] = Math.max(0, this.actionCounts[action] - 1);
  };

  /** Losing focus would otherwise leave keys "stuck" down. */
  private readonly onBlur = (): void => {
    this.pressed.clear();
    this.pressQueue.length = 0;
    for (const key of Object.keys(this.actionCounts) as Action[]) this.actionCounts[key] = 0;
  };
}
