import { RENDER_HEIGHT, RENDER_WIDTH, TELEMETRY_HZ } from '@src/config/constants';
import { tuning } from '@src/config/tuning';
import type { InputSource } from '@src/core/InputManager';
import { TelemetryBridge } from '@src/core/TelemetryBridge';
import {
  drawPlayerCar,
  PlayerCar,
  type CarEvent,
  type DriveControls,
} from '@src/entities/PlayerCar';
import { PALETTE_SUNSET_BOULEVARD, type StagePalette } from '@src/road/palette';
import { cameraDepthFromFov, interpolate } from '@src/road/RoadProjection';
import { RoadRenderer, type RoadView } from '@src/road/RoadRenderer';
import { findSegment, type Track } from '@src/road/RoadSegment';
import { buildTestTrack } from '@src/road/TrackBuilder';
import { Background } from './Background';

export interface TelemetrySnapshot {
  speedKmh: number;
  speedRatio: number;
  playerX: number;
  isDrifting: boolean;
  driftDirection: -1 | 0 | 1;
  driftTime: number;
  isOffRoad: boolean;
  lap: number;
  lapTime: number;
  lastLapTime: number | null;
  fps: number;
}

export type GameEvent = CarEvent | { type: 'lapCompleted'; lap: number; lapTime: number };

export interface GameOptions {
  input: InputSource;
  bridge?: TelemetryBridge<TelemetrySnapshot, GameEvent>;
  track?: Track;
  palette?: StagePalette;
}

/**
 * Pure TypeScript game orchestrator (AGENTS.md §2: zero React imports).
 *
 * Advances simulation in fixed steps via `update(dt)` and renders interpolated state in
 * `render(ctx, alpha, fps)`.
 */
export class Game {
  readonly track: Track;
  readonly car = new PlayerCar();
  readonly bridge: TelemetryBridge<TelemetrySnapshot, GameEvent>;
  palette: StagePalette;

  /** Camera Z position along the track, in world units [0, track.length). */
  position = 0;
  private prevPosition = 0;

  private simTime = 0;
  private lap = 1;
  private lapTime = 0;
  private lastLapTime: number | null = null;
  private lastFps = 0;

  private readonly input: InputSource;
  private readonly roadRenderer = new RoadRenderer();
  private readonly background = new Background();

  private readonly controls: DriveControls = {
    left: false,
    right: false,
    accelerate: false,
    brake: false,
    drift: false,
  };

  private readonly view: RoadView = {
    position: 0,
    playerX: 0,
    cameraHeight: tuning.cameraHeight,
    cameraDepth: cameraDepthFromFov(tuning.fieldOfView),
    roadWidth: tuning.roadWidth,
    drawDistance: tuning.drawDistance,
    fogDensity: tuning.fogDensity,
    width: RENDER_WIDTH,
    height: RENDER_HEIGHT,
  };

  constructor(options: GameOptions) {
    this.input = options.input;
    this.bridge = options.bridge ?? new TelemetryBridge<TelemetrySnapshot, GameEvent>(TELEMETRY_HZ);
    this.track = options.track ?? buildTestTrack();
    this.palette = options.palette ?? PALETTE_SUNSET_BOULEVARD;
  }

  update = (dt: number): void => {
    this.prevPosition = this.position;

    this.controls.left = this.input.isDown('left');
    this.controls.right = this.input.isDown('right');
    this.controls.accelerate = this.input.isDown('accelerate');
    this.controls.brake = this.input.isDown('brake');
    this.controls.drift = this.input.isDown('drift');

    const cameraDepth = cameraDepthFromFov(tuning.fieldOfView);
    const playerZ = tuning.cameraHeight * cameraDepth;
    const playerSeg = findSegment(this.track, this.position + playerZ);
    const slope = (playerSeg.p2.worldY - playerSeg.p1.worldY) / this.track.segmentLength;

    this.car.update(dt, this.controls, playerSeg.curve, slope, this.handleCarEvent);

    const nextPos = this.position + this.car.speed * dt;
    if (nextPos >= this.track.length) {
      this.position = nextPos % this.track.length;
      this.lastLapTime = this.lapTime;
      this.bridge.emit({ type: 'lapCompleted', lap: this.lap, lapTime: this.lapTime });
      this.lap++;
      this.lapTime = 0;
    } else {
      this.position = nextPos;
    }

    this.simTime += dt;
    this.lapTime += dt;

    this.background.update(dt, playerSeg.curve, this.car.speedRatio);
    this.bridge.offer(this.simTime, this.buildSnapshot);
  };

  render = (ctx: CanvasRenderingContext2D, alpha = 1, fps = 0): void => {
    this.lastFps = fps;
    const width = ctx.canvas.width || RENDER_WIDTH;
    const height = ctx.canvas.height || RENDER_HEIGHT;

    // Handle wrap-around across the start/finish line when interpolating position.
    let prevPos = this.prevPosition;
    if (this.position < prevPos) {
      prevPos -= this.track.length;
    }
    const renderPos =
      ((interpolate(prevPos, this.position, alpha) % this.track.length) + this.track.length) %
      this.track.length;
    const renderX = interpolate(this.car.prevX, this.car.x, alpha);

    this.view.position = renderPos;
    this.view.playerX = renderX;
    this.view.cameraHeight = tuning.cameraHeight;
    this.view.cameraDepth = cameraDepthFromFov(tuning.fieldOfView);
    this.view.roadWidth = tuning.roadWidth;
    this.view.drawDistance = tuning.drawDistance;
    this.view.fogDensity = tuning.fogDensity;
    this.view.width = width;
    this.view.height = height;

    this.background.render(ctx, width, height, this.palette);
    this.roadRenderer.render(ctx, this.track, this.view, this.palette);
    drawPlayerCar(ctx, this.car, width, height);
  };

  private readonly handleCarEvent = (event: CarEvent): void => {
    this.bridge.emit(event);
  };

  private readonly buildSnapshot = (): TelemetrySnapshot => ({
    speedKmh: this.car.speedKmh,
    speedRatio: this.car.speedRatio,
    playerX: this.car.x,
    isDrifting: this.car.isDrifting,
    driftDirection: this.car.driftDir,
    driftTime: this.car.driftTime,
    isOffRoad: this.car.isOffRoad,
    lap: this.lap,
    lapTime: this.lapTime,
    lastLapTime: this.lastLapTime,
    fps: this.lastFps,
  });
}
