import { describe, expect, it } from 'vitest';
import { InputManager } from './InputManager';

interface MockGamepadButton {
  pressed: boolean;
  value: number;
}

interface MockGamepad {
  id: string;
  connected: boolean;
  buttons: MockGamepadButton[];
  axes: number[];
}

function createMockGamepad(options: {
  id?: string;
  connected?: boolean;
  buttons?: Partial<Record<number, { pressed?: boolean; value?: number }>>;
  axes?: number[];
}): MockGamepad {
  const btns: MockGamepadButton[] = [];
  for (let i = 0; i < 16; i++) {
    const override = options.buttons?.[i];
    btns.push({
      pressed: override?.pressed ?? (override?.value ? override.value > 0.5 : false),
      value: override?.value ?? (override?.pressed ? 1 : 0),
    });
  }
  return {
    id: options.id ?? 'Xbox Wireless Controller',
    connected: options.connected ?? true,
    buttons: btns,
    axes: options.axes ?? [0, 0, 0, 0],
  };
}

class MockEventTarget {
  private readonly listeners: Record<string, ((e: Event) => void)[]> = {};

  addEventListener(type: string, listener: (e: Event) => void): void {
    if (!this.listeners[type]) this.listeners[type] = [];
    this.listeners[type]!.push(listener);
  }

  removeEventListener(type: string, listener: (e: Event) => void): void {
    if (!this.listeners[type]) return;
    this.listeners[type] = this.listeners[type]!.filter((l) => l !== listener);
  }

  dispatchEvent(event: Event): boolean {
    const handlers = this.listeners[event.type] ?? [];
    for (const h of handlers) h(event);
    return true;
  }
}

describe('InputManager (Keyboard + Gamepad API M8)', () => {
  it('tracks keyboard down states and records timestamped press edges', () => {
    const target = new MockEventTarget() as unknown as Window;
    const input = new InputManager(target);

    expect(input.isDown('accelerate')).toBe(false);

    // Keydown ArrowUp
    target.dispatchEvent({
      type: 'keydown',
      code: 'ArrowUp',
      timeStamp: 100,
      preventDefault: () => {},
    } as unknown as Event);
    expect(input.isDown('accelerate')).toBe(true);

    // Repeat keydown ArrowUp does not enqueue second press edge
    target.dispatchEvent({
      type: 'keydown',
      code: 'ArrowUp',
      timeStamp: 110,
      preventDefault: () => {},
    } as unknown as Event);

    const presses = input.consumePresses();
    expect(presses).toHaveLength(1);
    expect(presses[0]).toEqual({ action: 'accelerate', timeStamp: 100 });

    // KeyUp ArrowUp
    target.dispatchEvent({
      type: 'keyup',
      code: 'ArrowUp',
      timeStamp: 120,
    } as unknown as Event);
    expect(input.isDown('accelerate')).toBe(false);

    input.dispose();
  });

  it('binds KeyP and Escape to pause toggle', () => {
    const target = new MockEventTarget() as unknown as Window;
    const input = new InputManager(target);

    target.dispatchEvent({
      type: 'keydown',
      code: 'KeyP',
      timeStamp: 500,
      preventDefault: () => {},
    } as unknown as Event);
    expect(input.isDown('pause')).toBe(true);

    const presses = input.consumePresses();
    expect(presses).toContainEqual({ action: 'pause', timeStamp: 500 });

    input.dispose();
  });

  it('ignores keyboard events when defaultPrevented is true (modal Escape close)', () => {
    const target = new MockEventTarget() as unknown as Window;
    const input = new InputManager(target);

    target.dispatchEvent({
      type: 'keydown',
      code: 'Escape',
      defaultPrevented: true,
      timeStamp: 600,
      preventDefault: () => {},
    } as unknown as Event);

    expect(input.isDown('pause')).toBe(false);
    expect(input.consumePresses()).toHaveLength(0);

    input.dispose();
  });

  it('polls Gamepad buttons with rising-edge detection and analog triggers/sticks', () => {
    let mockGp: MockGamepad | null = null;
    const getGamepads = () => [mockGp as unknown as Gamepad];
    const target = new MockEventTarget() as unknown as Window;
    const input = new InputManager(target, getGamepads);

    // Initial state: no gamepad
    input.poll();
    expect(input.isGamepadConnected()).toBe(false);

    // 1. Connect gamepad with Right Trigger (RT = button 7) pulled halfway (0.65)
    mockGp = createMockGamepad({
      buttons: {
        7: { pressed: true, value: 0.65 }, // RT Accelerate
      },
      axes: [0.75, 0], // Left Stick X turned right
    });

    input.poll();
    expect(input.isGamepadConnected()).toBe(true);
    expect(input.isDown('accelerate')).toBe(true);
    expect(input.getThrottleAxis()).toBeCloseTo(0.65, 2);
    expect(input.isDown('right')).toBe(true);
    expect(input.getSteerAxis()).toBeGreaterThan(0.5);

    // 2. Press Right Bumper (RB = button 5) for Shift Up
    mockGp = createMockGamepad({
      buttons: {
        5: { pressed: true, value: 1.0 }, // RB Shift Up
        7: { pressed: true, value: 0.8 },
      },
      axes: [0, 0],
    });

    input.poll();
    expect(input.isDown('shiftUp')).toBe(true);
    const shiftPresses = input.consumePresses();
    expect(shiftPresses.some((p) => p.action === 'shiftUp')).toBe(true);

    // Holding RB in next poll should NOT enqueue another press edge
    input.poll();
    const secondPresses = input.consumePresses();
    expect(secondPresses.some((p) => p.action === 'shiftUp')).toBe(false);

    // 3. Press Start (button 9) for Pause
    mockGp = createMockGamepad({
      buttons: {
        9: { pressed: true, value: 1.0 }, // Start
      },
      axes: [0, 0],
    });
    input.poll();
    expect(input.isDown('pause')).toBe(true);
    const pausePresses = input.consumePresses();
    expect(pausePresses.some((p) => p.action === 'pause')).toBe(true);

    // 4. Disconnect gamepad
    mockGp = null;
    input.poll();
    expect(input.isGamepadConnected()).toBe(false);
    expect(input.isDown('pause')).toBe(false);
    expect(input.isDown('accelerate')).toBe(false);

    input.dispose();
  });
});
