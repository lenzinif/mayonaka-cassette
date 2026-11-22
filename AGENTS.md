# 真夜中Cassette (Mayonaka Cassette) — Architecture & Agent Rules

## 1. Project Vision & Design Pillars (The Yu Suzuki Ethos)

This is a **driving game** (emotional fantasy and flow state), not a hardcore racing simulation. Every implementation decision must obey four core design pillars:

1. **Feel Over Simulation:** All physics (centrifugal curve pull, drift slide, hill cresting, gearbox torque, dashboard melon soda slosh) are faked via simple tunable formulas. Never introduce rigid-body physics engines.
2. **Music Drives State, Driving Manipulates Music:** The soundtrack and road rendering are tightly coupled. High speeds and clean drifts open the Web Audio low-pass filter; slow speeds and collisions muffle the track and trigger tape pitch dips; jerky driving makes the dashboard melon soda splash over the cup rim.
3. **Protect the Flow State:** Collisions with roadside props or traffic must never cause a game-over explosion or dead stop. They deduct Groove, momentarily dip speed, muffle the audio filter, and keep the player moving. Mistimed inputs (off-beat gear shifts) are never punished; they simply earn no bonus.
4. **Your Music Is the Level (Core Feature):** Players load their own local tracks or playlists. Each song is analysed once and **generates its own deterministic road** (same file → same road), so a song can be learned and mastered. A bundled default soundtrack (synth fallback + royalty-free tracks) must always exist for players who load nothing.

> Full mechanic specs (song-driven road, beat-shift gearbox, dashboard melon soda & Tofu Mode, analysis validation): see `docs/DESIGN.md`.

---

## 2. Tech Stack & Strict Layer Separation

- **Bundler & Language:** Vite + TypeScript (strict mode).
- **Game View (`z-index: 1`):** Fullscreen HTML5 2D `<canvas>` (`CanvasRenderingContext2D`, internal resolution `640×360` scaled with `image-rendering: pixelated`). Do NOT install PixiJS, Three.js, or Phaser.
- **HUD & Overlays (`z-index: 2`):** React + Tailwind CSS layered above the canvas (`pointer-events-none` on HUD containers; `pointer-events-auto` only on interactive menus).
- **Audio:** Native browser `Web Audio API` (`AudioContext`, `BiquadFilterNode`, `GainNode`).

### Architectural Boundaries (CRITICAL INVARIANTS)

- **`@src/config/`, `@src/core/`, `@src/engine/`, `@src/road/`, `@src/audio/`, `@src/entities/` (Pure TypeScript Core):** Must have **ZERO React imports** (enforced via ESLint `no-restricted-imports`). Treat the engine like a standalone backend state machine that exposes `.update(dt)` and `.render(ctx, alpha, fps)`.
- **`@src/audio/` (Web Audio & Beat Clock):** Wraps `AudioContext`. All rhythm logic reads a `BeatMap` (`bpm`, `firstBeatOffsetSec`, per-bar `energy[]`, `sections[]`, `durationSec`). A `BeatMap` comes either from a static companion JSON (bundled tracks) or from a **one-time offline analysis** of a user-loaded file (`TrackAnalyzer`), cached in IndexedDB keyed by the file's content hash. **Real-time FFT/beat detection during gameplay is forbidden.** `AudioContext.currentTime` (with output-latency compensation) is the single master clock for beats.
- **User Audio Privacy:** User-loaded files are decoded and analysed entirely client-side. They are never uploaded, sent over the network, or bundled. No streaming-service integrations (Spotify, YouTube, Apple Music) — DRM and ToS make them out of scope.
- **`@src/ui/` (React Overlay):** Subscribes to engine telemetry via a throttled pub/sub bridge (`TELEMETRY_HZ = 15` Hz updates or discrete state changes like Groove milestones/stage forks). **NEVER trigger React state updates on every `requestAnimationFrame` tick.**

### Git Branching & CI/CD Strategy (CRITICAL INVARIANTS)

- **`main` (Production / Static Deploy):** Represents live production (`https://lenzinif.github.io/mayonaka-cassette/`). Merging `develop` into `main` is the **ONLY** trigger that redeploys the static GitHub Pages site (`.github/workflows/deploy.yml`). Direct commits or premature pushes to `main` are strictly forbidden.
- **`develop` (Primary Development & Integration):** The default branch of the repository. All feature branches branch from and merge back into `develop`. Every push or PR targeting `develop` triggers quality verification CI (`.github/workflows/ci.yml`: lint, Vitest unit tests, build), but **NEVER deploys**.
- **Cohesive Feature / Batch Branches (`<feature>` or `feat/<name>`):**
  - **One branch per feature or batch of connected features** (e.g., `graphics-overhaul`).
  - Even if a feature or overhaul consists of multiple phases (e.g. palette rework, road shaders, sprite rendering, debug controls), **all related phases must reside on the same branch** so the entire cohesive system can be tested, balanced, and verified as a whole before integrating into `develop`.
  - Interdependent sub-phases must never be fragmented into piecemeal branches that cannot be tested together.

---

## 3. Canonical Directory Structure

```text
/
├── docs/
│   ├── DESIGN.md              # Mechanic specs & design decisions (source of truth for gameplay)
│   ├── ROADMAP.md             # Development roadmap and task checklists
│   └── MECHANICS_POLISH_AUDIT.md # Gameplay & mechanics polish audit work packages
├── public/
│   ├── audio/                 # Companion BeatMap .json (audio uses procedural synth fallback or user files)
│   └── sprites/               # Sprite sheets and SVG atlases
├── test-tracks/               # GITIGNORED local analysis corpus (+ ground-truth.json). Never commit audio.
├── src/
│   ├── config/
│   │   ├── constants.ts       # Fixed resolution, fixed step (1/120s), segment length
│   │   └── tuning.ts          # Live-tunable feel parameters & DebugPanel metadata
│   ├── core/
│   │   ├── AssetPreloader.ts  # Manifest preloader with procedural greybox fallbacks
│   │   ├── AutopilotDriver.ts # AI demonstration driver for attract mode & test automation
│   │   ├── FixedStepper.ts    # Accumulator-based fixed-timestep stepper
│   │   ├── GameLoop.ts        # requestAnimationFrame loop with deltaTime clamping
│   │   ├── InputManager.ts    # Keyboard/Gamepad polling state + timestamped press edges
│   │   ├── SeededRandom.ts    # Deterministic PRNG (seeded from track content hash)
│   │   └── TelemetryBridge.ts # Throttled event emitter syncing Engine -> React HUD
│   ├── engine/
│   │   ├── Background.ts      # Procedural synthwave sky, striped sun, parallax mountains
│   │   ├── Game.ts            # Pure TS game orchestrator (.update(dt) & .render(ctx))
│   │   ├── PlaylistRunManager.ts # Stage sequencing, score tracking, lap timing
│   │   ├── SongRoadSyncController.ts # Hybrid Spacetime Sync (A1 micro-elastic pace + A2 horizon stitching)
│   │   └── StageForkController.ts # Stage fork approach, crossfade trigger, branch selection
│   ├── road/
│   │   ├── palette.ts         # Stage colour palettes (night / og_future_funk / akiba_night / vaporfunk)
│   │   ├── RoadSegment.ts     # Segment types (curve, y-elevation, stripe, sprites[])
│   │   ├── RoadProjection.ts  # 3D-to-2D camera projection & easing helpers
│   │   ├── RoadRenderer.ts    # Two-pass projection + Painter's Algorithm renderer
│   │   ├── RoadsideProps.ts   # Procedural roadside props (palms, lamps, signs, bridges, jihanki)
│   │   ├── TrackBuilder.ts    # Declarative builders for straight, hill, curve, fork
│   │   ├── RoadChunks.ts      # Hand-authored bar-length road "chunks" tagged by energy/role
│   │   └── SongRoadGenerator.ts # BeatMap + seed -> chunk sequence -> RoadSegment[]
│   ├── audio/
│   │   ├── BeatMap.ts         # BeatMap types, JSON validation, bar/section helpers
│   │   ├── BeatClock.ts       # Deterministic BPM beat/bar calculator on the audio clock
│   │   ├── FunkAudioEngine.ts # Web Audio graph (Source -> BiquadFilter -> Gain -> Destination) + Dub Wash
│   │   ├── TrackAnalyzer.ts   # One-time offline BPM / first-beat / energy / section analysis
│   │   ├── analysis.worker.ts # DSP worker (receives decoded PCM; no AudioContext inside)
│   │   └── TrackLibrary.ts    # File import, content hashing, IndexedDB BeatMap cache, playlists
│   ├── entities/
│   │   ├── PlayerCar.ts       # Speed, X-offset, drift state, Groove meter math & car renderer
│   │   ├── Gearbox.ts         # 6-speed fake torque curve, RPM, beat-shift judgement, auto-shift assist
│   │   ├── MelonSoda.ts       # Jerk-driven liquid surface physics, spill events, canvas inset (Tofu Mode)
│   │   ├── Particles.ts       # Neon tire smoke, collision sparks, and soda droplets
│   │   └── TrafficAndProps.ts # Roadside obstacle collisions & AI kei trucks
│   ├── ui/
│   │   ├── hud/
│   │   │   ├── VfdDigidash.tsx       # 1980s VFD digital dashboard (speed, gear gate 1..6, RPM)
│   │   │   ├── CassetteTapeWidget.tsx # Pixel-art cassette Groove meter with rotating reels & tape slack
│   │   │   └── RhythmBezel.tsx       # Pulse bezel & timing judgements (PERFECT/GOOD/DOWNBEAT)
│   │   ├── CanvasStage.tsx    # Mounts 640x360 canvas and manages GameLoop lifecycle
│   │   ├── DebugPanel.tsx     # Live feel-tuning sliders (?debug / F2) & JSON export
│   │   ├── BeatMapInspector.tsx # Dev tool (?analyze): corpus analysis results vs ground truth
│   │   ├── TrackLoader.tsx    # Drag & drop / file picker, analysis progress, BPM ×2 / ÷2 / tap fix
│   │   ├── HUD.tsx            # Overlay root subscribing to TelemetryBridge
│   │   ├── MainMenu.tsx       # 1980s arcade attract menu, FM 88.4 radio marquee, cassette library
│   │   ├── PauseMenu.tsx      # Zero-scroll arcade pause menu & cockpit settings
│   │   ├── DriverManualModal.tsx # 1980s retro driver's manual (beat-shift, drift, melon soda, controls)
│   │   ├── QuickOptionsModal.tsx # Lightweight in-game settings modal
│   │   ├── RadioSelector.tsx  # Stage fork: pick next playlist track & title toast
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
6. **Deterministic Song Roads:** `SongRoadGenerator` output must be a pure function of `(BeatMap, seed)` where `seed` derives from the file's content hash. Use `SeededRandom` only — never `Math.random()` in generation code. Road length in bars must equal the song length in bars.
7. **Analysis Off the Hot Path:** `decodeAudioData` runs on the main thread (workers have no `AudioContext`); all DSP (onset envelope, tempo autocorrelation, energy, sections) runs in `analysis.worker.ts` on transferred `Float32Array` PCM. Analysis happens only at import time, never during a run.
8. **Beat Judgement Uses Event Timestamps:** Beat-quantized inputs (gear shifts) are judged from the keydown `event.timeStamp` mapped to the audio clock (`AudioContext.getOutputTimestamp()`), not from the fixed-step tick that polls them.
9. **Canvas-Owned Animated Insets:** Anything animated every frame (melon soda inset) is drawn by the engine on the canvas. React only renders static frames/labels around it.
10. **Branch Discipline & Release Gates:** Work on a single dedicated branch for each cohesive feature or batch of related features (e.g. `graphics-overhaul`). Multi-phase features remain together on that branch so they can be tested and balanced as a unified whole. Always branch off `develop` and open PRs to `develop`. Live static redeployment to GitHub Pages occurs exclusively upon merging `develop` into `main`.

---

## 5. Debugging & Performance Investigation Protocol (Mandatory Agent Workflow)

Every performance optimization or runtime bug investigation **must** follow an empirical measure-first loop. Speculative rewrites based solely on reading code are forbidden.

1. **Reproduce & Record a Full-Song Live Baseline Before Editing:**
   - Always run the game in a real browser (`npm run dev`, e.g. `?autostart&debug&autopilot&track=stellae` for real corpus tracks in `test-tracks/`).
   - Never rely solely on a short 2-second rolling window or the synthetic fallback loop. Capture session-wide and per-section/per-bar metrics across active gameplay via `window.__MAYONAKA_DIAG__.getFullReport()` or `DebugPanel` → `PERF PROFILER` → `DUMP BENCHMARK`: `sessionAvgFps`, `sessionMinFps`, `pct60Fps`, `p95FrameMs`, `maxFrameMs`, frame-time histogram (`60` / `45-59` / `30-44` / `<30` FPS), and the heaviest bars/sections (`intro`, `build`, `drop`, `breakdown`, `outro`).
2. **Understand Deferred Canvas 2D Rasterization vs. `compositorGapMs`:**
   - In Chromium/Blink (Accelerated 2D Canvas on Skia/Ganesh/Direct2D), `ctx.fill()`, `ctx.stroke()`, `ctx.clip()`, `ctx.fillRect()`, and `ctx.drawImage()` inside `Game.render()` record `PaintOp` commands into an in-memory command buffer (`~1–2.5 ms` JS CPU time). Actual GPU path tessellation, hardware stencil clipping (`ctx.clip()`), quadratic Bézier subdivision (`quadraticCurveTo`), and overdraw rasterization execute **after `requestAnimationFrame` returns**, which appears inside `compositorGapMs = frameTimeMs - simTimeMs - renderTimeMs`.
   - **Low JS `renderTimeMs` + high `compositorGapMs` does NOT exempt Canvas 2D draw calls.** Use `window.__MAYONAKA_DIAG__.setIsolation({ syncGpuProbe: true, ... })` (which forces synchronous GPU flushes between `Background`, `RoadRenderer`, and `Car/FX` and toggles `renderBg`, `renderRoad`, `renderProps`, `renderPylonWires`, `renderTraffic`, `renderCar`) alongside DOM/CSS isolation (`?nocrt`, `?nohud`, `?nobezel`) to separate deferred GPU Canvas rasterization from DOM/CSS compositor repaints (`CRTOverlay`, `RhythmBezel`, `box-shadow`, `backdrop-blur`).
3. **Never Use Node/Mock Tests as Proof of FPS:**
   - Vitest runs in `node` (`AgentBenchmark.test.ts`, `RoadRenderer.test.ts`, `RoadsideProps.test.ts` with `noop` mock contexts). Passing Node tests validates determinism and zero-GC logic only — never real Canvas 2D GPU rasterization, stencil clipping cost, texture upload cost, or CSS compositing performance.
4. **One Hypothesis at a Time & Canvas Draw-Op Complexity Rules:**
   - Apply one targeted change (or isolation toggle) per experiment and compare live browser telemetry (`sessionAvgFps`, `p95FrameMs`, `pct60Fps`) before and after.
   - Prefer eliminating GPU Canvas rasterization bottlenecks directly:
     - Avoid per-segment `ctx.save() + ctx.clip() + ctx.restore()` stencil thrashing (`RoadRenderer`) whenever opaque ground/road slices already occlude lower pixels.
     - Calibrate `ppu` LOD thresholds against actual projected values (`ppu = scale * width * 0.5`, which at `drawDistance = 200`, `640px` width stays `>= 0.0067`), culling non-essential distant Band C/D props and using compact `fillRect` silhouettes at far/mid distance.
     - Batch `ctx.beginPath()`/`ctx.stroke()` calls (catenary power lines) and group consecutive `fillRect` draws by `fillStyle`.
     - Treat offscreen `<canvas>` caches as **unproven until benchmarked**: single pre-baked repeating background strips (e.g. a static `640×64` skyline or clouds) can eliminate hundreds of per-frame rects, whereas per-prop scaled sprite atlases can increase GPU texture uploads and alpha-blending overdraw on Direct2D/Skia. Revert immediately if `p95FrameMs` / `pct60Fps` do not measurably improve.
5. **Zero-GC Instrumentation:**
   - All frame-timing buffers, rolling windows, and per-bar benchmark arrays in the engine must use pre-allocated scalars or `TypedArray` buffers (`§4.3`). Never invoke `performance.now()` hundreds of times per frame inside inner segment loops (`RoadRenderer`) during normal gameplay (subsystem loop timing runs only when `syncGpuProbe` is explicitly enabled).
6. **Mandatory Verification Gate & Honest Block Reporting:**
   - Before declaring any fix complete, run `npm run check` (`eslint .`, `vitest run`, `tsc --noEmit && vite build`) **and** re-verify live full-song 60 FPS telemetry (`sessionAvgFps >= 59`, `p95FrameMs <= 16.7 ms`, `pct60Fps >= 98%`) in the browser on a real corpus track (e.g. `Stellae`) after the final edit.
   - If the agent environment blocks running Node, builds, or the browser, stop immediately rather than shipping unverified optimizations, and report the exact commands the user needs to run locally.

