# 真夜中Cassette (Mayonaka Cassette)

> **A retro-futuristic driving flow experience powered by Japanese Future Funk rhythms.**

[![Playable Alpha](https://img.shields.io/badge/status-playable%20alpha-f59e0b?style=for-the-badge&logo=retroarch&logoColor=white)](https://github.com/lenzinif/mayonaka-cassette)
[![Version](https://img.shields.io/badge/version-v0.2.1--alpha-ff007f?style=for-the-badge)](https://github.com/lenzinif/mayonaka-cassette)
[![Live Demo](https://img.shields.io/badge/demo-play%20online-00f0ff?style=for-the-badge&logo=googlechrome&logoColor=black)](https://lenzinif.github.io/mayonaka-cassette/)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg?style=for-the-badge)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Vite](https://img.shields.io/badge/Vite-8-646CFF?style=for-the-badge&logo=vite&logoColor=white)](https://vitejs.dev/)

---

## 🚦 Project Status: Playable Alpha (v0.2.2-alpha)

*Mayonaka Cassette* is currently in **Playable Alpha**:
- **Arcade core loop:** Custom pseudo-3D canvas rasterizer with 120 Hz fixed-step physics, 4-speed beat-shift gearbox, centrifugal curve pull, and tire-smoking drift handling.
- **Audio-reactive road generator:** Client-side Web Worker DSP analyzes uploaded songs (BPM, energy, sections) and generates a deterministic highway timed to your favorite drops and buildups.
- **Dashboard & atmosphere:** Dashboard Melon Soda spring-damper fluid simulation with Initial D-inspired Tofu Mode, evasive Kei truck traffic, dynamic Web Audio filter sweeps, and stage fork branching.
- **Next steps towards Beta:** More roadside pixel-art scenery, custom retro biomes, and CRT scanline magic.

---

## 🎮 Play Online

Jump straight into the driver's seat in your browser:  
👉 **[https://lenzinif.github.io/mayonaka-cassette/](https://lenzinif.github.io/mayonaka-cassette/)**

---

## 🌴 The Vision & Core Pillars

Inspired by Yu Suzuki's classic OutRun arcade ethos and the vibrant beat of Japanese Future Funk:

1. **Feel Over Simulation:** No rigid-body physics engines here. Centrifugal curve pull, tire slide, suspension hill cresting, and 4-speed torque curves are driven by tuned arcade formulas.
2. **Music Drives State, Driving Manipulates Music:** Clean drifts and high speeds open the Web Audio low-pass filter; speed drops and collisions muffle the soundscape and trigger tape pitch dips.
3. **Protect the Flow State:** Collisions with roadside obstacles or kei trucks never stop you dead. They deduct Groove, temporarily dip speed, muffle the audio, and keep you rolling forward.
4. **Your Music Is the Level:** Drop in your own local audio tracks to generate a deterministic, unique road tailored to the song's energy and structure.

---

## 🕹️ Controls

| Action | Keyboard | Gamepad |
| :--- | :--- | :--- |
| **Accelerate** | `ArrowUp` / `W` | `Right Trigger (R2)` / `A` |
| **Brake / Reverse** | `ArrowDown` / `S` | `Left Trigger (L2)` / `B` |
| **Steer Left / Right** | `ArrowLeft` / `A`, `ArrowRight` / `D` | `Left Stick` / `D-Pad` |
| **Shift Up (Beat-Shift)** | `E` / `Space` | `Right Bumper (RB)` |
| **Shift Down** | `Q` / `Shift` | `Left Bumper (LB)` |
| **Pause / Resume** | `Escape` / `P` | `Start / Menu` |
| **Feel Tuning Panel** | `F2` or `?debug` | — |

---

## ⚙️ Architecture & Tech Stack

- **Game Engine:** Pure TypeScript core rendering to an HTML5 2D canvas at 640×360 internal pixel resolution scaled with crisp nearest-neighbor raster.
- **HUD & Overlays:** React + Tailwind CSS layered above the canvas via a throttled telemetry bridge at 15 Hz (zero React imports in the engine render loop).
- **Audio & DSP:** Native Web Audio API (`AudioContext`, `BiquadFilterNode`, master beat clock) with client-side Web Worker DSP for offline track analysis.
- **Physics & Details:**
  - Spring-damper liquid simulation for the dashboard Melon Soda.
  - Evasive AI kei truck traffic with curve tilt.
  - Two-pass Painter's Algorithm pseudo-3D road rasterization with elevation curves and stage fork branching.

---

## 🚀 Development Setup

### Prerequisites
- Node.js 20+ (recommended Node 22+)
- npm 10+

### Installation & Run
```bash
# Clone the repository
git clone https://github.com/lenzinif/mayonaka-cassette.git
cd mayonaka-cassette

# Install dependencies
npm install

# Start local dev server
npm run dev
```

### Quality & Tests
```bash
# Run ESLint, 90+ Vitest unit tests, and Vite production build
npm run check
```

### Git & Branching Workflow
- **`develop` (Default Branch):** Active integration branch. Pushes and Pull Requests trigger verification CI (`ci.yml`: lint, test, build) without deploying.
- **Feature & Batch Branches:** Create a single branch per feature or cohesive batch of related features (e.g. `graphics-overhaul`). For multi-phase projects, keep all interdependent sub-phases on the same branch to verify and balance the full experience together before opening a PR to `develop`.
- **`main` (Production):** Strictly mirrors live production. Merging `develop` into `main` is the **only trigger** that redeploys the static game to [GitHub Pages](https://lenzinif.github.io/mayonaka-cassette/). Direct pushes to `main` are disallowed.

---

## 🗺️ Roadmap & Development Plan

Curious about what's coming down the road? Check out the full [Roadmap & Task List](docs/ROADMAP.md) detailing planned VFD digidash overhauls, roadside vending machines, Shuto expressway biomes, and tape-deck audio flair.

---

## 💬 Community & Player Feedback

Player feedback drives the evolution of *Mayonaka Cassette*! Join our [GitHub Discussions](https://github.com/lenzinif/mayonaka-cassette/discussions):

- 💡 **[Ideas & Feature Requests](https://github.com/lenzinif/mayonaka-cassette/discussions/new?category=ideas-feature-requests):** Suggest new biomes, roadside scenery, or arcade features.
- ⚖️ **[Gameplay & Balance](https://github.com/lenzinif/mayonaka-cassette/discussions/new?category=gameplay-balance):** Share thoughts on handling feel, beat-shift timing windows, or Melon Soda physics.
- 🎵 **[Music & Tracks](https://github.com/lenzinif/mayonaka-cassette/discussions/new?category=music-tracks):** Tell us which tracks generated great roads and share custom beatmaps.

Found a glitch or technical issue?
- 🐛 **[Bug Reports](https://github.com/lenzinif/mayonaka-cassette/issues/new?template=bug_report.yml):** File a ticket in our Issue Tracker with your browser, OS, and reproduction steps.

---

## 📄 License

This project is licensed under the [MIT License](LICENSE) © 2026 Mayonaka Cassette.
