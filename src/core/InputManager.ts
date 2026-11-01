export type Action = 'left' | 'right' | 'accelerate' | 'brake' | 'drift';

/** Default keyboard bindings (D3). Multiple physical keys may map to the same action. */
const KEY_BINDINGS: Readonly<Record<string, Action>> = {
  ArrowLeft: 'left',
  KeyA: 'left',
  ArrowRight: 'right',
  KeyD: 'right',
  ArrowUp: 'accelerate',
  KeyW: 'accelerate',
  ArrowDown: 'brake',
  KeyS: 'brake',
  Space: 'drift',
  ShiftLeft: 'drift',
  ShiftRight: 'drift',
};

/** Read-only view of input used by the engine; lets tests inject a fake. */
export interface InputSource {
  isDown(action: Action): boolean;
}

/**
 * Polling input state. DOM events only update a set of pressed keys;
 * the engine queries `isDown()` during its fixed update, never reacting to events directly.
 */
export class InputManager implements InputSource {
  private readonly pressed = new Set<string>();
  private readonly actionCounts: Record<Action, number> = {
    left: 0,
    right: 0,
    accelerate: 0,
    brake: 0,
    drift: 0,
  };

  constructor(private readonly target: Window = window) {
    target.addEventListener('keydown', this.onKeyDown);
    target.addEventListener('keyup', this.onKeyUp);
    target.addEventListener('blur', this.onBlur);
  }

  isDown(action: Action): boolean {
    return this.actionCounts[action] > 0;
  }

  dispose(): void {
    this.target.removeEventListener('keydown', this.onKeyDown);
    this.target.removeEventListener('keyup', this.onKeyUp);
    this.target.removeEventListener('blur', this.onBlur);
    this.onBlur();
  }

  private readonly onKeyDown = (e: KeyboardEvent): void => {
    const action = KEY_BINDINGS[e.code];
    if (!action) return;
    e.preventDefault();
    if (this.pressed.has(e.code)) return;
    this.pressed.add(e.code);
    this.actionCounts[action]++;
  };

  private readonly onKeyUp = (e: KeyboardEvent): void => {
    const action = KEY_BINDINGS[e.code];
    if (!action || !this.pressed.delete(e.code)) return;
    this.actionCounts[action] = Math.max(0, this.actionCounts[action] - 1);
  };

  /** Losing focus would otherwise leave keys "stuck" down. */
  private readonly onBlur = (): void => {
    this.pressed.clear();
    for (const key of Object.keys(this.actionCounts) as Action[]) this.actionCounts[key] = 0;
  };
}
