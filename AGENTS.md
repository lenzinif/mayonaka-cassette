# Future Funk OutRun — Architecture & Agent Rules

## 1. Project Vision & Design Pillars (The Yu Suzuki Ethos)

This is a **driving game** (emotional fantasy and flow state), not a hardcore racing simulation. Every implementation decision must obey three core design pillars:

1. **Feel Over Simulation:** All physics (centrifugal curve pull, drift slide, hill cresting) are faked via simple tunable formulas. Never introduce rigid-body physics engines.
2. **Music Drives State, Driving Manipulates Music:** The soundtrack and road rendering are tightly coupled. High speeds and clean drifts open the Web Audio low-pass filter; slow speeds and collisions muffle the track and trigger turntable pitch dips.
3. **Protect the Flow State:** Collisions with roadside props or traffic must never cause a game-over explosion or dead stop. They deduct Groove, momentarily dip speed, muffle the audio filter, and keep the player moving.

---

## 2. Tech Stack & Strict Layer Separation

- **Bundler & Language:** Vite + TypeScript (strict mode).
- **Game View (`z-index: 1`):** Fullscreen HTML5 2D `<canvas>` (`CanvasRenderingContext2D`, internal resolution `640×360` scaled with `image-rendering: pixelated`). Do NOT install PixiJS, Three.js, or Phaser.
- **HUD & Overlays (`z-index: 2`):** React + Tailwind CSS layered above the canvas (`pointer-events-none` on HUD containers; `pointer-events-auto` only on interactive menus).
- **Audio:** Native browser `Web Audio API` (`AudioContext`, `BiquadFilterNode`, `GainNode`).

### Architectural Boundaries (CRITICAL INVARIANTS)

- **`@src/config/`, `@src/core/`, `@src/engine/`, `@src/road/`, `@src/audio/`, `@src/entities/` (Pure TypeScript Core):** Must have **ZERO React imports** (enforced via ESLint `no-restricted-imports`). Treat the engine like a standalone backend state machine that exposes `.update(dt)` and `.render(ctx, alpha, fps)`.
- **`@src/audio/` (Web Audio & Beat Clock):** Wraps `AudioContext`. Reads static companion JSON metadata (`bpm`, `firstBeatOffsetSec`, `stageBars`) rather than running expensive real-time FFT beat detection.
- **`@src/ui/` (React Overlay):** Subscribes to engine telemetry via a throttled pub/sub bridge (`TELEMETRY_HZ = 15` Hz updates or discrete state changes like Groove milestones/stage forks). **NEVER trigger React state updates on every `requestAnimationFrame` tick.**

---

## 3. Canonical Directory Structure

```text
/
├── public/
│   ├── audio/                 # .mp3 tracks + companion .json beat configs
│   └── sprites/               # Sprite sheets (cars, roadside props, parallax layers)
├── src/
│   ├── config/
│   │   ├── constants.ts       # Fixed resolution, fixed step (1/120s), segment length
│   │   └── tuning.ts          # Live-tunable feel parameters & DebugPanel metadata
│   ├── core/
│   │   ├── FixedStepper.ts    # Accumulator-based fixed-timestep stepper
│   │   ├── GameLoop.ts        # requestAnimationFrame loop with deltaTime clamping
│   │   ├── InputManager.ts    # Keyboard/Gamepad polling state (no per-frame DOM events)
│   │   └── TelemetryBridge.ts # Throttled event emitter syncing Engine -> React HUD
│   ├── engine/
│   │   ├── Background.ts      # Procedural synthwave sky, striped sun, parallax mountains
│   │   └── Game.ts            # Pure TS game orchestrator (.update(dt) & .render(ctx))
│   ├── road/
│   │   ├── palette.ts         # Stage colour palettes (vaporwave / night / coastal)
│   │   ├── RoadSegment.ts     # Segment types (curve, y-elevation, stripe, sprites[])
│   │   ├── RoadProjection.ts  # 3D-to-2D camera projection & easing helpers
│   │   ├── RoadRenderer.ts    # Two-pass projection + Painter's Algorithm renderer
│   │   ├── RoadsideProps.ts   # Procedural greybox roadside props (palms, lamps, billboards)
│   │   └── TrackBuilder.ts    # Declarative builders for straight, hill, curve, fork
│   ├── audio/
│   │   ├── FunkAudioEngine.ts # Web Audio graph (Source -> BiquadFilter -> Gain -> Destination)
│   │   └── BeatClock.ts       # Deterministic BPM beat/bar calculator
│   ├── entities/
│   │   ├── PlayerCar.ts       # Speed, X-offset, drift state, Groove meter math & car renderer
│   │   └── TrafficAndProps.ts # Roadside obstacle collisions & AI kei trucks
│   ├── ui/
│   │   ├── CanvasStage.tsx    # Mounts 640x360 canvas and manages GameLoop lifecycle
│   │   ├── DebugPanel.tsx     # Live feel-tuning sliders (?debug / F2) & JSON export
│   │   ├── HUD.tsx            # Speedometer, Groove cassette bar, 90s anime passenger cam
│   │   ├── RadioSelector.tsx  # Stage fork station prompt & track title toast
│   │   └── CRTOverlay.tsx     # Pure CSS scanline / VHS vignette overlay
│   ├── App.tsx                # Mounts <CanvasStage/>, <HUD/>, and <DebugPanel/>
│   └── main.tsx
└── AGENTS.md
```

---

## 4. Implementation Guardrails & Invariants

1. **Pseudo-3D Math Standard:** Follow Jake Gordon's _JavaScript Racer_ / Lou's _Pseudo-3D_ raster model:
   - The road is a flat 1D array of `RoadSegment` objects (`index`, `p1`, `p2`, `curve`, `stripe`, `sprites`).
   - Pass 1 (front-to-back) projects segments and accumulates horizontal curve offset; Pass 2 (back-to-front, Painter's Algorithm) renders road slices and roadside sprites/traffic so hill crests naturally occlude geometry behind them.
2. **Frame-Rate Independence:** Advance simulation in fixed increments (`SIM_STEP = 1 / 120` s) via `FixedStepper` and clamp frame delta time to `MAX_FRAME_DT = 0.1` s inside `@src/core/FixedStepper.ts` so backgrounded browser tabs never catapult the player off-track. Interpolate camera and player positions during `render()`.
3. **Zero Garbage Collection in Render Loop:** Do not allocate new objects, arrays, or closures inside `render()` or `project()`. Mutate pre-allocated screen-coordinate structs on each `RoadSegment`.
4. **Greybox-First Rendering:** Every sprite, car, or background layer must implement a procedural Canvas polygon fallback (neon magenta/cyan trapezoids, vector grid lines, colored bounding boxes) and audio must include a procedural synth fallback. The game must be 100% playable and visually legible with zero external assets loaded.
5. **Web Audio Autoplay Compliance:** Never instantiate or resume `AudioContext` on page load. Always initialize/resume inside the user's first keydown or "Press Start" click handler.

---

## 5. Phased Development Milestones

- **M0 (Foundations):** Vite + React + TS strict + Tailwind v4, ESLint layer boundaries, `FixedStepper`, `GameLoop`, `TelemetryBridge`, `CanvasStage`.
- **M1 (Pseudo-3D Road):** `RoadSegment`, `RoadProjection`, `TrackBuilder`, `RoadRenderer`, `RoadsideProps`, `Background`, looping test track.
- **M2 (Driving Feel):** `PlayerCar` (tapered acceleration, speed-dependent steering, centrifugal pull, drift with clean exit boost), `DebugPanel` live tuning sliders (`?debug` / `F2`).
- **M3 (Reactive Audio):** `FunkAudioEngine`, `BeatClock`, synthesized fallback loop + royalty-free track JSON, speed-linked low-pass filter sweep, beat-quantized drops, turntable pitch dip, BPM road/sky pulse.
- **M4 (Groove, Collisions & HUD):** 4 Groove tiers (`LOW`, `MEDIUM`, `HIGH`, `SSS`) with hysteresis, roadside & kei-truck collisions (flow-preserving), cassette Groove HUD, `CRTOverlay`.
- **M5 (Game Loop & Stage Forks):** Bar-based stage progression (`stageBars`), branching highway forks with `RadioSelector` and 4-bar DJ crossfade, end-of-run grade screen.
- **M6 (Art & Atmosphere):** Pixel-art sprites for car, props, traffic, passenger cam reactions, drift/collision particles.
- **M7 (Polish & Release):** Gamepad polling, asset preloader, tab-visibility pause, performance profiling, static deployment.
