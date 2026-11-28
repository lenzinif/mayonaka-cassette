import { useEffect, useRef } from 'react';

export interface GamepadMenuNavCallbacks {
  enabled: boolean;
  onPrev: () => void;
  onNext: () => void;
  onConfirm: () => void;
  onBack?: () => void;
  onStart?: () => void;
}

/**
 * Lightweight rising-edge Gamepad navigation hook for Title Deck and Pause Menu (`docs/UI.md §3.1 & §4.2`).
 * Polls `navigator.getGamepads()` only while `enabled` is true.
 */
export function useGamepadMenuNav({
  enabled,
  onPrev,
  onNext,
  onConfirm,
  onBack,
  onStart,
}: GamepadMenuNavCallbacks): void {
  const callbacksRef = useRef({ onPrev, onNext, onConfirm, onBack, onStart });
  callbacksRef.current = { onPrev, onNext, onConfirm, onBack, onStart };

  useEffect(() => {
    if (!enabled || typeof navigator === 'undefined' || typeof navigator.getGamepads !== 'function') {
      return;
    }

    let rafId = 0;
    let prevUp = false;
    let prevDown = false;
    let prevLeft = false;
    let prevRight = false;
    let prevA = false;
    let prevB = false;
    let prevStart = false;
    let initialized = false;

    const poll = () => {
      let gp: Gamepad | null = null;
      try {
        const pads = navigator.getGamepads();
        for (let i = 0; i < pads.length; i++) {
          if (pads[i] && pads[i]!.connected !== false) {
            gp = pads[i]!;
            break;
          }
        }
      } catch {
        gp = null;
      }

      if (gp) {
        const btns = gp.buttons;
        const axisX = gp.axes[0] ?? 0;
        const axisY = gp.axes[1] ?? 0;

        const up = Boolean(btns[12]?.pressed) || axisY < -0.55;
        const down = Boolean(btns[13]?.pressed) || axisY > 0.55;
        const left = Boolean(btns[14]?.pressed) || axisX < -0.55;
        const right = Boolean(btns[15]?.pressed) || axisX > 0.55;
        const a = Boolean(btns[0]?.pressed);
        const b = Boolean(btns[1]?.pressed);
        const start = Boolean(btns[9]?.pressed);

        // First frame captures held states from gameplay so entering Pause doesn't re-fire Start/A
        if (initialized) {
          if ((up && !prevUp) || (left && !prevLeft)) {
            callbacksRef.current.onPrev();
          } else if ((down && !prevDown) || (right && !prevRight)) {
            callbacksRef.current.onNext();
          } else if (a && !prevA) {
            callbacksRef.current.onConfirm();
          } else if (b && !prevB) {
            callbacksRef.current.onBack?.();
          } else if (start && !prevStart) {
            callbacksRef.current.onStart?.();
          }
        }

        prevUp = up;
        prevDown = down;
        prevLeft = left;
        prevRight = right;
        prevA = a;
        prevB = b;
        prevStart = start;
        initialized = true;
      } else {
        initialized = false;
      }

      rafId = requestAnimationFrame(poll);
    };

    rafId = requestAnimationFrame(poll);
    return () => cancelAnimationFrame(rafId);
  }, [enabled]);
}
