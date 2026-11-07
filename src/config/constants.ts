/**
 * Fixed engine constants. Values that affect "feel" belong in `tuning.ts` instead,
 * so they can be tweaked live from the debug panel.
 */

/** Internal canvas resolution (D4). Scaled to the viewport with `image-rendering: pixelated`. */
export const RENDER_WIDTH = 640;
export const RENDER_HEIGHT = 360;

/** Fixed simulation step in seconds. Rendering interpolates between steps. */
export const SIM_STEP = 1 / 120;
/** Max real time consumed per frame; prevents a backgrounded tab from catapulting the car. */
export const MAX_FRAME_DT = 0.1;

/** Length of a single road segment in world units. */
export const SEGMENT_LENGTH = 200;
/** Number of segments per rumble-strip colour band. */
export const RUMBLE_LENGTH = 3;
/** Number of lanes painted on the road. */
export const LANES = 3;
/** Upper bound for the `drawDistance` tunable; render buffers are pre-allocated to this size. */
export const MAX_DRAW_DISTANCE = 500;

/** Max frequency of continuous telemetry snapshots sent to React (AGENTS.md §2). */
export const TELEMETRY_HZ = 15;

/** Application release version (aligned with package.json). */
export const APP_VERSION = 'v0.2.0-alpha';

/** Number of musical bars before the end of a track where the stage fork appears. */
export const FORK_APPROACH_BARS = 6;

/** Default DJ crossfade duration in musical bars when transitioning between stages. */
export const DEFAULT_CROSSFADE_BARS = 4;
