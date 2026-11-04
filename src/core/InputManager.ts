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
  | 'forkRight'
  | 'pause';

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
 * - `KeyP` / `Escape` = Pause toggle (`pause`)
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
  KeyP: 'pause',
  Escape: 'pause',
};

/**
 * Standard Gamepad button mappings (W3C standard layout, docs/DESIGN.md §6 & AGENTS.md §5 M8).
 * - Button 0 (A / Cross): Drift
 * - Button 1 (B / Circle): Cycle Soda Skin
 * - Button 2 (X / Square): Drift (alt)
 * - Button 3 (Y / Triangle): Tofu Mode
 * - Button 4 (LB / Left Bumper): Shift Down
 * - Button 5 (RB / Right Bumper): Shift Up
 * - Button 6 (LT / Left Trigger): Brake
 * - Button 7 (RT / Right Trigger): Accelerate
 * - Button 8 (Select / Back / Share): Auto-Shift assist
 * - Button 9 (Start / Options): Pause
 * - Button 12 (D-Pad Up): Accelerate
 * - Button 13 (D-Pad Down): Brake
 * - Button 14 (D-Pad Left): Left / Fork Left
 * - Button 15 (D-Pad Right): Right / Fork Right
 */
const GAMEPAD_BUTTON_ACTIONS: Readonly<Record<number, Action>> = {
  0: 'drift',
  1: 'cycleSodaSkin',
  2: 'drift',
  3: 'tofuMode',
  4: 'shiftDown',
  5: 'shiftUp',
  8: 'autoShift',
  9: 'pause',
  14: 'forkLeft',
  15: 'forkRight',
};

const ALL_ACTIONS: readonly Action[] = [
  'left',
  'right',
  'accelerate',
  'brake',
  'drift',
  'shiftUp',
  'shiftDown',
  'tofuMode',
  'cycleSodaSkin',
  'autoShift',
  'forkLeft',
  'forkRight',
  'pause',
];

/** Read-only view of input used by the engine; lets tests inject a fake. */
export interface InputSource {
  isDown(action: Action): boolean;
  /** Drains any discrete key-press edges recorded since the previous call (AGENTS.md §4.8). */
  consumePresses?(): readonly InputPressEvent[];
  getSteerAxis?(): number;
  getThrottleAxis?(): number;
  getBrakeAxis?(): number;
  isGamepadConnected?(): boolean;
  poll?(): void;
}

export interface GamepadSnapshot {
  connected: boolean;
  id: string;
  steerAxis: number;
  throttleAxis: number;
  brakeAxis: number;
}

/**
 * Polling input state + timestamped press edge queue (AGENTS.md §3, §4.8 & §5 M8).
 *
 * DOM keyboard events + Gamepad API polling update held-action counts, analog axes,
 * and push non-repeating press edges with precise timestamps (`event.timeStamp` / `performance.now()`)
 * so beat-quantized actions (`Space` / `RB` = shiftUp, `Shift` / `LB` = shiftDown) are judged against
 * the exact press moment rather than the fixed-step polling tick.
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
    pause: 0,
  };
  private readonly gamepadActions: Record<Action, boolean> = {
    left: false,
    right: false,
    accelerate: false,
    brake: false,
    drift: false,
    shiftUp: false,
    shiftDown: false,
    tofuMode: false,
    cycleSodaSkin: false,
    autoShift: false,
    forkLeft: false,
    forkRight: false,
    pause: false,
  };

  private readonly prevGamepadButtons: boolean[] = [];
  private readonly connectedScratch: Gamepad[] = [];
  private lastDisconnectedPollMs = -1000;
  private gamepadConnected = false;
  private gamepadId = '';
  private steerAxis = 0;
  private throttleAxis = 0;
  private brakeAxis = 0;

  private readonly pressQueue: InputPressEvent[] = [];
  private readonly drainedPresses: InputPressEvent[] = [];

  constructor(
    private readonly target: Window = window,
    private readonly getGamepadsFn?: () => (Gamepad | null)[],
  ) {
    target.addEventListener('keydown', this.onKeyDown);
    target.addEventListener('keyup', this.onKeyUp);
    target.addEventListener('blur', this.onBlur);
    target.addEventListener('gamepadconnected', this.onGamepadConnected);
    target.addEventListener('gamepaddisconnected', this.onGamepadDisconnected);
  }

  isDown(action: Action): boolean {
    return this.actionCounts[action] > 0 || this.gamepadActions[action] === true;
  }

  getSteerAxis(): number {
    return this.steerAxis;
  }

  getThrottleAxis(): number {
    return this.throttleAxis;
  }

  getBrakeAxis(): number {
    return this.brakeAxis;
  }

  isGamepadConnected(): boolean {
    return this.gamepadConnected;
  }

  getGamepadSnapshot(): GamepadSnapshot {
    return {
      connected: this.gamepadConnected,
      id: this.gamepadId,
      steerAxis: this.steerAxis,
      throttleAxis: this.throttleAxis,
      brakeAxis: this.brakeAxis,
    };
  }

  /**
   * Polls the Gamepad API (`navigator.getGamepads()`), updates analog axes,
   * continuous button states, and enqueues high-resolution timestamped rising-edge events.
   */
  poll = (): void => {
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    if (
      !this.gamepadConnected &&
      !this.getGamepadsFn &&
      now - this.lastDisconnectedPollMs < 250
    ) {
      return;
    }

    const gamepads = this.getConnectedGamepads();
    if (gamepads.length === 0) {
      this.lastDisconnectedPollMs = now;
      if (this.gamepadConnected) {
        this.gamepadConnected = false;
        this.gamepadId = '';
        this.resetGamepadState();
      }
      return;
    }

    const gp = gamepads[0]!;
    this.gamepadConnected = true;
    this.gamepadId = gp.id || 'Standard Gamepad';

    // 1. Reset continuous gamepad actions
    for (let i = 0; i < ALL_ACTIONS.length; i++) {
      this.gamepadActions[ALL_ACTIONS[i]!] = false;
    }

    // 2. Poll Buttons (Standard Layout)
    const btns = gp.buttons;
    const btnCount = Math.max(btns.length, this.prevGamepadButtons.length);

    for (let i = 0; i < btnCount; i++) {
      const btn = btns[i];
      const isPressed = btn ? btn.pressed || btn.value > 0.5 : false;
      const wasPressed = this.prevGamepadButtons[i] ?? false;

      if (isPressed && !wasPressed) {
        // Rising edge detection
        const action = GAMEPAD_BUTTON_ACTIONS[i];
        if (action) {
          this.pressQueue.push({ action, timeStamp: now });
        }
      }

      this.prevGamepadButtons[i] = isPressed;

      // Continuous button states
      if (isPressed) {
        if (i === 0 || i === 2) this.gamepadActions.drift = true;
        if (i === 1) this.gamepadActions.cycleSodaSkin = true;
        if (i === 3) this.gamepadActions.tofuMode = true;
        if (i === 4) this.gamepadActions.shiftDown = true;
        if (i === 5) this.gamepadActions.shiftUp = true;
        if (i === 6) this.gamepadActions.brake = true;
        if (i === 7) this.gamepadActions.accelerate = true;
        if (i === 8) this.gamepadActions.autoShift = true;
        if (i === 9) this.gamepadActions.pause = true;
        if (i === 12) this.gamepadActions.accelerate = true;
        if (i === 13) this.gamepadActions.brake = true;
        if (i === 14) {
          this.gamepadActions.left = true;
          this.gamepadActions.forkLeft = true;
        }
        if (i === 15) {
          this.gamepadActions.right = true;
          this.gamepadActions.forkRight = true;
        }
      }
    }

    // 3. Analog Triggers (LT = index 6, RT = index 7)
    const ltVal = btns[6]?.value ?? (btns[6]?.pressed ? 1 : 0);
    const rtVal = btns[7]?.value ?? (btns[7]?.pressed ? 1 : 0);
    this.brakeAxis = ltVal > 0.08 ? ltVal : 0;
    this.throttleAxis = rtVal > 0.08 ? rtVal : 0;

    if (this.brakeAxis > 0.12) this.gamepadActions.brake = true;
    if (this.throttleAxis > 0.12) this.gamepadActions.accelerate = true;

    // 4. Analog Left Stick (axes[0] = X, axes[1] = Y)
    const axisX = gp.axes[0] ?? 0;
    const axisY = gp.axes[1] ?? 0;
    const stickDeadzoneX = 0.15;
    const stickDeadzoneY = 0.25;

    if (Math.abs(axisX) > stickDeadzoneX) {
      const normX =
        (Math.abs(axisX) - stickDeadzoneX) / (1 - stickDeadzoneX) * Math.sign(axisX);
      this.steerAxis = Math.max(-1, Math.min(1, normX));
      if (this.steerAxis < -0.15) this.gamepadActions.left = true;
      if (this.steerAxis > 0.15) this.gamepadActions.right = true;
    } else {
      if (btns[14]?.pressed) {
        this.steerAxis = -1;
      } else if (btns[15]?.pressed) {
        this.steerAxis = 1;
      } else {
        this.steerAxis = 0;
      }
    }

    if (axisY < -stickDeadzoneY) {
      this.gamepadActions.accelerate = true;
    } else if (axisY > stickDeadzoneY) {
      this.gamepadActions.brake = true;
    }
  };

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
   * Enqueues a synthetic action press (e.g. from HUD buttons for Tofu Mode, Pause or Auto-Shift).
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
    this.target.removeEventListener('gamepadconnected', this.onGamepadConnected);
    this.target.removeEventListener('gamepaddisconnected', this.onGamepadDisconnected);
    this.onBlur();
  }

  private getConnectedGamepads(): readonly Gamepad[] {
    this.connectedScratch.length = 0;

    if (this.getGamepadsFn) {
      const gps = this.getGamepadsFn();
      for (let i = 0; i < gps.length; i++) {
        const gp = gps[i];
        if (gp && gp.connected !== false) this.connectedScratch.push(gp);
      }
      return this.connectedScratch;
    }

    if (typeof navigator === 'undefined' || typeof navigator.getGamepads !== 'function') {
      return this.connectedScratch;
    }

    try {
      const gps = navigator.getGamepads();
      for (let i = 0; i < gps.length; i++) {
        const gp = gps[i];
        if (gp && gp.connected !== false) this.connectedScratch.push(gp);
      }
      return this.connectedScratch;
    } catch {
      return this.connectedScratch;
    }
  }

  private resetGamepadState(): void {
    for (let i = 0; i < ALL_ACTIONS.length; i++) {
      this.gamepadActions[ALL_ACTIONS[i]!] = false;
    }
    this.steerAxis = 0;
    this.throttleAxis = 0;
    this.brakeAxis = 0;
    this.prevGamepadButtons.length = 0;
  }

  private readonly onKeyDown = (e: KeyboardEvent): void => {
    if (e.defaultPrevented) return;
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

  private readonly onGamepadConnected = (e: Event): void => {
    const gp = (e as unknown as { gamepad?: Gamepad }).gamepad;
    this.gamepadConnected = true;
    this.gamepadId = gp?.id ?? 'Standard Gamepad';
  };

  private readonly onGamepadDisconnected = (): void => {
    const gamepads = this.getConnectedGamepads();
    if (gamepads.length === 0) {
      this.gamepadConnected = false;
      this.gamepadId = '';
      this.resetGamepadState();
    }
  };

  /** Losing focus would otherwise leave keys "stuck" down. */
  private readonly onBlur = (): void => {
    this.pressed.clear();
    this.pressQueue.length = 0;
    for (let i = 0; i < ALL_ACTIONS.length; i++) {
      this.actionCounts[ALL_ACTIONS[i]!] = 0;
    }
    this.resetGamepadState();
  };
}
