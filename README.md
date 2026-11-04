# 真夜中Cassette (Mayonaka Cassette)

> **A retro-futuristic driving flow experience powered by Japanese Future Funk rhythms.**

[![Playable Alpha](https://img.shields.io/badge/status-playable%20alpha-f59e0b?style=for-the-badge&logo=retroarch&logoColor=white)](https://github.com/lenzinif/mayonaka-cassette)
[![Version](https://img.shields.io/badge/version-v0.1.0--alpha-ff007f?style=for-the-badge)](https://github.com/lenzinif/mayonaka-cassette)
[![Live Demo](https://img.shields.io/badge/demo-play%20online-00f0ff?style=for-the-badge&logo=googlechrome&logoColor=black)](https://lenzinif.github.io/mayonaka-cassette/)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg?style=for-the-badge)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Vite](https://img.shields.io/badge/Vite-8-646CFF?style=for-the-badge&logo=vite&logoColor=white)](https://vitejs.dev/)

---

## 🚦 Project Status: Playable Alpha (v0.1.0-alpha)

*Mayonaka Cassette* is currently in **Playable Alpha**:
- **Fully playable core loop:** Deterministic pseudo-3D custom canvas rasterizer, 120 Hz fixed-step physics, 4-speed beat-shift gearbox, arcade centrifugal pull and drift mechanics.
- **Audio-reactive level generation:** Client-side Web Worker DSP analyzes uploaded songs (BPM, energy, sections) and generates a deterministic road synchronized with drops and buildups.
- **Atmosphere & mechanics:** Dashboard Melon Soda spring-damper fluid simulation with Tofu Mode, evasive Kei truck traffic, dynamic Web Audio filter sweeps, and stage fork transitions.
- **Next steps towards Beta:** Further pixel-art sprite expansions, enhanced CRT scanline shaders, and additional polish.

---

## 🎮 Play Online

Experience the game directly in your browser:  
👉 **[https://lenzinif.github.io/mayonaka-cassette/](https://lenzinif.github.io/mayonaka-cassette/)**

---

## 🌴 The Vision & Core Pillars

*Mayonaka Cassette* is a **driving flow state experience**, inspired by Yu Suzuki's classic arcade ethos and the vibrant aesthetic of Japanese Future Funk:

1. **Feel Over Simulation:** No rigid-body physics engines. Centrifugal pull, tire slide, suspension hill cresting, and 4-speed torque curves are driven by tuned arcade formulas.
2. **Music Drives State, Driving Manipulates Music:** Clean drifts and high speeds open the Web Audio low-pass filter; speed drops and collisions muffle the soundscape and trigger tape pitch dips.
3. **Protect the Flow State:** Collisions with roadside obstacles or kei trucks never stop the car dead. They deduct Groove, temporarily drop speed, muffle audio, and keep you rolling forward.
4. **Your Music Is the Level:** Load local audio tracks to generate a deterministic, unique road track tailored to the song's energy and structure.

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
| **Debug Tuning Panel** | `F2` or `?debug` | — |

---

## ⚙️ Architecture & Tech Stack

- **Game Engine:** Pure TypeScript core (`CanvasRenderingContext2D`, 640×360 internal pixel resolution scaled with crisp nearest-neighbor raster).
- **HUD & Overlays:** React + Tailwind CSS layered over the canvas via a throttled telemetry bridge (zero React imports in the engine render loop).
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
# Run ESLint, 70+ Vitest unit tests, and Vite production build
npm run check
```

---

## 🗺️ Roadmap & Development Plan

Looking to see what's planned next? Check out the full [Project Roadmap & TODO List](docs/ROADMAP.md) detailing planned HUD overhauls, new roadside assets, environments, feedback pipelines, performance tuning, and audiovisual "funkier" enhancements.

---

## 💬 Community & Player Feedback

Player feedback drives the evolution of *Mayonaka Cassette*! Join our [GitHub Discussions](https://github.com/lenzinif/mayonaka-cassette/discussions):

- 💡 **[Ideas & Feature Requests](https://github.com/lenzinif/mayonaka-cassette/discussions/new?category=ideas):** Suggest new biomes, roadside scenery, or arcade features.
- ⚖️ **[Gameplay & Balance Tuning](https://github.com/lenzinif/mayonaka-cassette/discussions/new?category=gameplay-balance):** Share thoughts on handling feel, beat-shift timing windows, or Melon Soda physics.
- 🎵 **[Music & Road Generation](https://github.com/lenzinif/mayonaka-cassette/discussions/new?category=music-and-tracks):** Tell us which tracks generated epic roads and share custom beatmaps.
- 🐛 **[Bug Reports](https://github.com/lenzinif/mayonaka-cassette/issues/new?template=bug_report.yml):** Report glitches or browser compatibility issues.

---

## 📄 License

This project is licensed under the [MIT License](LICENSE) © 2026 Francesco Lenzini (lenzinif).
