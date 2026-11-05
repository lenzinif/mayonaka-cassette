import { SIM_STEP } from '@src/config/constants';
import { tuning } from '@src/config/tuning';
import type { Action, InputPressEvent, InputSource } from './InputManager';

export type AutopilotMode = 'perfect' | 'relaxed' | 'aggressive';

export interface AutopilotCarPerception {
  x: number;
  speed: number;
  speedRatio: number;
  gear: number;
  rpm: number;
  isDrifting: boolean;
  steer: number;
  isLugging: boolean;
  isRedlining: boolean;
  isOffRoad: boolean;
}

export interface AutopilotRoadPerception {
  currentCurve: number;
  aheadCurve: number;
  slope: number;
}

export interface AutopilotTrafficPerception {
  z: number;
  laneOffset: number;
  speedRatio: number;
}

export interface AutopilotForkPerception {
  active: boolean;
  choice: 'left' | 'right';
  branchCenter: number;
}

export interface AutopilotAudioPerception {
  beatPhase: number;
  deltaMsToNearestBeat: number;
  nearestBeatIndex: number;
  isDownbeat: boolean;
}

export interface AutopilotPerception {
  getCarState(): AutopilotCarPerception;
  getRoadAhead(lookaheadDistance: number): AutopilotRoadPerception;
  getUpcomingTraffic(lookaheadDistance: number): readonly AutopilotTrafficPerception[];
  getForkInfo?(): AutopilotForkPerception | undefined;
  getAudioBeatState?(): AutopilotAudioPerception | undefined;
  isTofuModeActive?(): boolean;
}

export interface AutopilotOptions {
  fallbackInput?: InputSource;
  mode?: AutopilotMode;
  disengageOnManualInput?: boolean;
  targetSpeedRatio?: number;
  avoidTraffic?: boolean;
  rhythmShifts?: boolean;
  forkPreference?: 'loop' | 'nextTrack';
}

/**
 * Autonomous AI driver and simulation playtester (AGENTS.md §2: Pure TS Core, zero React).
 *
 * Implements `InputSource` so it can drive `Game` directly either:
 * 1. Headless in test suites/benchmarks running 1000x real-time speed.
 * 2. In-browser as an arcade Attract / Demo Mode, wrapping human `InputManager`.
 *
 * Uses feed-forward centrifugal compensation + PD steering, rhythm beat-shifting,
 * Kei-truck collision evasion, and jerk-limiting to preserve Melon Soda in Tofu Mode.
 */
export class AutopilotDriver implements InputSource {
  enabled = false;
  mode: AutopilotMode;
  avoidTraffic: boolean;
  rhythmShifts: boolean;
  forkPreference: 'loop' | 'nextTrack';
  disengageOnManualInput: boolean;
  customTargetSpeedRatio?: number;

  private fallbackInput?: InputSource;
  private perception?: AutopilotPerception;

  // Internal control outputs
  private isAccelerating = false;
  private isBraking = false;
  private isDrifting = false;
  private steerAxis = 0;
  private smoothedSteer = 0;

  // Shift & fork edge queue
  private readonly pressQueue: InputPressEvent[] = [];
  private readonly drainedPresses: InputPressEvent[] = [];
  private lastShiftBeatIndex = -999999;
  private lastForkChoiceSent: 'left' | 'right' | null = null;
  private lastPollTime = 0;

  constructor(options: AutopilotOptions = {}) {
    this.fallbackInput = options.fallbackInput;
    this.mode = options.mode ?? 'perfect';
    this.avoidTraffic = options.avoidTraffic ?? true;
    this.rhythmShifts = options.rhythmShifts ?? true;
    this.forkPreference = options.forkPreference ?? 'nextTrack';
    this.disengageOnManualInput = options.disengageOnManualInput ?? false;
    this.customTargetSpeedRatio = options.targetSpeedRatio;
  }

  setPerception(perception: AutopilotPerception): void {
    this.perception = perception;
  }

  setFallbackInput(fallback: InputSource): void {
    this.fallbackInput = fallback;
  }

  toggle(): boolean {
    this.enabled = !this.enabled;
    if (!this.enabled) {
      this.resetOutputs();
    }
    return this.enabled;
  }

  setEnabled(enabled: boolean): void {
    if (this.enabled === enabled) return;
    this.enabled = enabled;
    if (!enabled) {
      this.resetOutputs();
    }
  }

  private resetOutputs(): void {
    this.isAccelerating = false;
    this.isBraking = false;
    this.isDrifting = false;
    this.steerAxis = 0;
    this.smoothedSteer = 0;
    this.pressQueue.length = 0;
  }

  // --- InputSource Implementation ---

  poll(): void {
    const now = typeof performance !== 'undefined' ? performance.now() : 0;
    let dt = this.lastPollTime > 0 ? (now - this.lastPollTime) / 1000 : SIM_STEP;
    if (dt <= 0 || dt > 0.1) dt = SIM_STEP;
    this.lastPollTime = now;

    // Poll fallback human input first if available
    this.fallbackInput?.poll?.();

    if (!this.enabled) {
      return;
    }

    // Check if human pressed controls while autopilot was active
    if (this.disengageOnManualInput && this.fallbackInput) {
      if (
        this.fallbackInput.isDown('accelerate') ||
        this.fallbackInput.isDown('brake') ||
        this.fallbackInput.isDown('left') ||
        this.fallbackInput.isDown('right') ||
        this.fallbackInput.isDown('drift')
      ) {
        this.enabled = false;
        this.resetOutputs();
        return;
      }
    }

    if (!this.perception) {
      return;
    }

    this.computeControls(dt, now);
  }

  private computeControls(dt: number, nowMs: number): void {
    if (!this.perception) return;

    const car = this.perception.getCarState();
    const isTofu = this.perception.isTofuModeActive?.() ?? false;

    // 1. Lookahead & Road Perception
    const lookaheadDistance = Math.max(160, car.speed * 0.35);
    const road = this.perception.getRoadAhead(lookaheadDistance);
    const fork = this.perception.getForkInfo?.();

    // 2. Fork Navigation
    let targetX = 0;
    if (fork && fork.active) {
      targetX = fork.branchCenter;
      const desiredChoice = this.forkPreference === 'loop' ? 'left' : 'right';
      if (this.lastForkChoiceSent !== desiredChoice && fork.choice !== desiredChoice) {
        this.pressQueue.push({
          action: desiredChoice === 'left' ? 'forkLeft' : 'forkRight',
          timeStamp: nowMs,
        });
        this.lastForkChoiceSent = desiredChoice;
      }
    } else {
      this.lastForkChoiceSent = null;
    }

    // 3. Traffic Evasion (Kei-Trucks)
    if (this.avoidTraffic) {
      const traffic = this.perception.getUpcomingTraffic(lookaheadDistance * 1.3);
      for (let i = 0; i < traffic.length; i++) {
        const truck = traffic[i]!;
        // Only consider trucks in front within danger distance
        if (truck.z > 0 && truck.z < lookaheadDistance) {
          const latDiff = car.x - truck.laneOffset;
          if (Math.abs(latDiff) < 0.42) {
            // Evasion offset: steer away from the truck's lane
            if (truck.laneOffset >= 0) {
              targetX = Math.max(-0.7, truck.laneOffset - 0.55);
            } else {
              targetX = Math.min(0.7, truck.laneOffset + 0.55);
            }
            break;
          }
        }
      }
    }

    // 4. Centrifugal Feed-Forward & PD Steering
    // Blend current segment curve and upcoming lookahead curve
    const effectiveCurve = road.currentCurve * 0.65 + road.aheadCurve * 0.35;
    const speedRatio = car.speedRatio;
    const gripFactor = car.isDrifting ? 1 - tuning.driftCentrifugalReduce : 1;
    const centrifugalPush =
      effectiveCurve * (speedRatio * speedRatio) * tuning.centrifugal * gripFactor;
    const steerAuthority = Math.min(1, speedRatio * 1.35);

    const Kp = 3.2;
    const Kd = 0.25;
    const lateralError = targetX - car.x;
    const desiredLateralVel = lateralError * Kp - car.steer * Kd;

    // Required steer to achieve desired lateral velocity while overcoming centrifugal push
    const requiredSteer =
      (desiredLateralVel + centrifugalPush) / Math.max(0.1, tuning.steerRate * steerAuthority);
    const clampedSteer = Math.max(-1, Math.min(1, requiredSteer));

    // Jerk limitation: smooth steering changes to protect Melon Soda from sloshing in Tofu Mode
    const maxSteerRate = isTofu ? 3.6 : this.mode === 'relaxed' ? 4.5 : 7.5;
    const maxDelta = maxSteerRate * dt;
    this.smoothedSteer += Math.max(-maxDelta, Math.min(maxDelta, clampedSteer - this.smoothedSteer));
    this.steerAxis = Math.max(-1, Math.min(1, this.smoothedSteer));

    // 5. Target Speed, Throttle & Braking
    let targetSpeed =
      this.customTargetSpeedRatio ??
      (this.mode === 'relaxed' ? 0.75 : this.mode === 'aggressive' ? 1.05 : 0.98);

    // Ease off throttle slightly on tight unbanked hairpins in relaxed mode
    if (this.mode === 'relaxed' && Math.abs(road.aheadCurve) > 2.8) {
      targetSpeed = 0.62;
    }

    this.isAccelerating = car.speedRatio < targetSpeed;
    this.isBraking = car.speedRatio > targetSpeed + 0.08;

    // 6. Drift Triggering on Tight Corners
    if (this.mode !== 'relaxed') {
      const tightCorner = Math.abs(road.aheadCurve) > 2.2 || Math.abs(road.currentCurve) > 2.4;
      if (tightCorner && car.speedRatio >= tuning.driftMinSpeedRatio) {
        this.isDrifting = true;
      } else if (Math.abs(road.aheadCurve) < 1.2 && Math.abs(road.currentCurve) < 1.2) {
        this.isDrifting = false;
      }
    } else {
      this.isDrifting = false;
    }

    // 7. Beat-Quantized Rhythm Shifting (docs/DESIGN.md §4)
    if (this.rhythmShifts) {
      const audio = this.perception.getAudioBeatState?.();
      if (audio) {
        const canShift = Math.abs(audio.deltaMsToNearestBeat) <= 35;
        const isFreshBeat = audio.nearestBeatIndex !== this.lastShiftBeatIndex;

        // Upshift condition: high RPM in gears 1..5
        if (car.gear < 6 && car.rpm >= 0.74 && !car.isOffRoad) {
          if (canShift && isFreshBeat) {
            this.pressQueue.push({ action: 'shiftUp', timeStamp: nowMs });
            this.lastShiftBeatIndex = audio.nearestBeatIndex;
          }
        }
        // Downshift condition: engine bogging/lugging or low speed in tall gear
        else if (car.gear > 1 && (car.isLugging || (car.speedRatio < 0.22 && car.gear > 2))) {
          if (canShift && isFreshBeat) {
            this.pressQueue.push({ action: 'shiftDown', timeStamp: nowMs });
            this.lastShiftBeatIndex = audio.nearestBeatIndex;
          }
        }
      }
    }
  }

  isDown(action: Action): boolean {
    if (!this.enabled) {
      return this.fallbackInput?.isDown(action) ?? false;
    }

    switch (action) {
      case 'accelerate':
        return this.isAccelerating;
      case 'brake':
        return this.isBraking;
      case 'left':
        return this.steerAxis < -0.15;
      case 'right':
        return this.steerAxis > 0.15;
      case 'drift':
        return this.isDrifting;
      default:
        return this.fallbackInput?.isDown(action) ?? false;
    }
  }

  consumePresses(): readonly InputPressEvent[] {
    this.drainedPresses.length = 0;

    // Drain queued autonomous actions (shifts, forks)
    if (this.enabled && this.pressQueue.length > 0) {
      for (let i = 0; i < this.pressQueue.length; i++) {
        this.drainedPresses.push(this.pressQueue[i]!);
      }
      this.pressQueue.length = 0;
    }

    // Also forward any discrete presses from fallback input (e.g. pause, toggleAutopilot, tofuMode)
    const fallbackPresses = this.fallbackInput?.consumePresses?.();
    if (fallbackPresses && fallbackPresses.length > 0) {
      for (let i = 0; i < fallbackPresses.length; i++) {
        const p = fallbackPresses[i]!;
        // Always pass through toggle, pause, tofuMode, sodaSkin
        if (
          !this.enabled ||
          p.action === 'toggleAutopilot' ||
          p.action === 'pause' ||
          p.action === 'tofuMode' ||
          p.action === 'cycleSodaSkin'
        ) {
          this.drainedPresses.push(p);
        }
      }
    }

    return this.drainedPresses;
  }

  getSteerAxis(): number {
    if (!this.enabled) {
      return this.fallbackInput?.getSteerAxis?.() ?? 0;
    }
    return this.steerAxis;
  }

  getThrottleAxis(): number {
    if (!this.enabled) {
      return this.fallbackInput?.getThrottleAxis?.() ?? 0;
    }
    return this.isAccelerating ? 1 : 0;
  }

  getBrakeAxis(): number {
    if (!this.enabled) {
      return this.fallbackInput?.getBrakeAxis?.() ?? 0;
    }
    return this.isBraking ? 1 : 0;
  }

  isGamepadConnected(): boolean {
    return this.fallbackInput?.isGamepadConnected?.() ?? false;
  }
}
