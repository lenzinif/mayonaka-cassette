## 🌴 Summary of Changes

<!-- Provide a concise overview of what this pull request introduces or fixes. -->

## 🌿 Target Branch Checklist

- [ ] **Feature / Bugfix / Refactor:** Targeting `develop` (our primary development and integration branch).
- [ ] **Production Release:** Targeting `main` from `develop` (this will trigger automatic redeployment to GitHub Pages).

## 🧩 Cohesive Batch / Multi-Phase Feature

<!-- If this PR is part of a multi-phase or connected feature (e.g. graphics overhaul, sound system revamp),
     confirm all related phases are included in this branch so they are verified and tested together. -->
- [ ] All interdependent sub-phases of this feature/overhaul are consolidated in this branch for holistic testing.

## ✅ Verification & Quality Gate

- [ ] `npm run check` passes cleanly (ESLint + Vitest unit tests + Vite build).
- [ ] Core game engine (`@src/engine`, `@src/road`, `@src/audio`, `@src/entities`) contains **zero React imports**.
- [ ] Tested locally in browser at 640×360 internal canvas resolution.
