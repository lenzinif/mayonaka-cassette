# Future Funk OutRun — Architecture & Agent Rules

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

---

## 3. Canonical Directory Structure

```text
/
├── docs/
│   └── DESIGN.md              # Mechanic specs & design decisions (source of truth for gameplay)
├── public/
│   ├── audio/                 # Bundled .mp3 tracks + companion BeatMap .json
│   └── sprites/               # Sprite sheets (cars, roadside props, parallax layers)
├── test-tracks/               # GITIGNORED local analysis corpus (+ ground-truth.json). Never commit audio.
├── src/
│   ├── config/
│   │   ├── constants.ts       # Fixed resolution, fixed step (1/120s), segment length
│   │   └── tuning.ts          # Live-tunable feel parameters & DebugPanel metadata
│   ├── core/
│   │   ├── FixedStepper.ts    # Accumulator-based fixed-timestep stepper
│   │   ├── GameLoop.ts        # requestAnimationFrame loop with deltaTime clamping
│   │   ├── InputManager.ts    # Keyboard/Gamepad polling state + timestamped press edges
│   │   ├── SeededRandom.ts    # Deterministic PRNG (seeded from track content hash)
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
│   │   ├── TrackBuilder.ts    # Declarative builders for straight, hill, curve, fork
│   │   ├── RoadChunks.ts      # Hand-authored bar-length road "chunks" tagged by energy/role
│   │   └── SongRoadGenerator.ts # BeatMap + seed -> chunk sequence -> RoadSegment[]
│   ├── audio/
│   │   ├── BeatMap.ts         # BeatMap types, JSON validation, bar/section helpers
│   │   ├── BeatClock.ts       # Deterministic BPM beat/bar calculator on the audio clock
│   │   ├── FunkAudioEngine.ts # Web Audio graph (Source -> BiquadFilter -> Gain -> Destination)
│   │   ├── TrackAnalyzer.ts   # One-time offline BPM / first-beat / energy / section analysis
│   │   ├── analysis.worker.ts # DSP worker (receives decoded PCM; no AudioContext inside)
│   │   └── TrackLibrary.ts    # File import, content hashing, IndexedDB BeatMap cache, playlists
│   ├── entities/
│   │   ├── PlayerCar.ts       # Speed, X-offset, drift state, Groove meter math & car renderer
│   │   ├── Gearbox.ts         # 4-speed fake torque curve, RPM, beat-shift judgement, auto-shift assist
│   │   ├── MelonSoda.ts       # Jerk-driven liquid surface physics, spill events, canvas inset renderer
│   │   └── TrafficAndProps.ts # Roadside obstacle collisions & AI kei trucks
│   ├── ui/
│   │   ├── CanvasStage.tsx    # Mounts 640x360 canvas and manages GameLoop lifecycle
│   │   ├── DebugPanel.tsx     # Live feel-tuning sliders (?debug / F2) & JSON export
│   │   ├── BeatMapInspector.tsx # Dev tool (?analyze): corpus analysis results vs ground truth
│   │   ├── TrackLoader.tsx    # Drag & drop / file picker, analysis progress, BPM ×2 / ÷2 / tap fix
│   │   ├── HUD.tsx            # Speedometer, gear/RPM, Groove cassette bar
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

---

## 5. Phased Development Milestones

- **M0 (Foundations):** Vite + React + TS strict + Tailwind v4, ESLint layer boundaries, `FixedStepper`, `GameLoop`, `TelemetryBridge`, `CanvasStage`.
- **M1 (Pseudo-3D Road):** `RoadSegment`, `RoadProjection`, `TrackBuilder`, `RoadRenderer`, `RoadsideProps`, `Background`, looping test track.
- **M2 (Driving Feel):** `PlayerCar` (tapered acceleration, speed-dependent steering, centrifugal pull, drift with clean exit boost), `DebugPanel` live tuning sliders (`?debug` / `F2`).
- **M3 (Reactive Audio & Track Import):**
  - **M3a — Analysis spike (gate):** `BeatMap`, `TrackAnalyzer` + `analysis.worker.ts`, `BeatMapInspector` (`?analyze`) run against the local `test-tracks/` corpus. **Exit criteria** in `docs/DESIGN.md` §2.4. If unmet, fall back to tap-tempo-first import before continuing.
  - **M3b — Audio engine:** `FunkAudioEngine`, `BeatClock` (audio clock + latency compensation), `TrackLibrary` (hashing, IndexedDB cache, playlists), `TrackLoader` UI with BPM correction, synthesized fallback loop + bundled royalty-free track JSON, speed-linked low-pass sweep, turntable pitch dip, BPM road/sky pulse.
- **M4 (Song-Driven Road):** `SeededRandom`, `RoadChunks` vocabulary, section-aware `SongRoadGenerator` (build-ups → climbs cresting on the drop, drops → fast straights/sweepers, breakdowns → technical curves), road length = song length.
- **M5 (Groove & Rhythm Driving):** 4 Groove tiers (`LOW`, `MEDIUM`, `HIGH`, `SSS`) with hysteresis, `Gearbox` beat-shift (+ auto-shift assist), `MelonSoda` always-on liquid physics + Tofu Mode, roadside & kei-truck collisions (flow-preserving), cassette Groove HUD with gear/RPM, `CRTOverlay`.
- **M6 (Playlist Run & Forks):** Playlist = sequence of stages; forks choose the next playlist track via `RadioSelector`; 4-bar DJ crossfade; end-of-run grade screen; local per-song best scores keyed by content hash.
- **M7 (Art & Atmosphere):** Pixel-art sprites for car, props, traffic, melon soda glass, drift/collision particles.
- **M8 (Polish & Release):** Gamepad polling, asset preloader, tab-visibility pause, performance profiling, static deployment.
