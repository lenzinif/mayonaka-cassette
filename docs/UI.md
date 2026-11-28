# 真夜中Cassette (Mayonaka Cassette) — UI & UX Specification

> **Immutable Working Document for Agents.**
> This file is the authoritative, binding source of truth for all **menus, flows, diegetic hardware chrome, animations, HUD layout, and copywriting** in *真夜中Cassette*.
> Gameplay mechanics live in [`docs/DESIGN.md`](./DESIGN.md); engine, audio, and React boundary guardrails live in [`AGENTS.md`](../AGENTS.md).
> Every future UI implementation or refactor **MUST** obey every invariant in this document without exception.

---

## 1. Scope, Core Invariants & Configuration Lock

### 1.1 Architectural & Performance Guardrails
- **Strict Layer Boundary (`AGENTS.md §2`):** All React UI lives under `src/ui/` (`z-index: 2`). Zero React imports are allowed in `@src/config/`, `@src/core/`, `@src/engine/`, `@src/road/`, `@src/audio/`, or `@src/entities/`.
- **Throttled Telemetry (`TELEMETRY_HZ = 15`):** Active-driving HUD components subscribe via `TelemetryBridge` / `useSyncExternalStore` at `15 Hz` max (plus discrete events). **Never** trigger React state updates on every `requestAnimationFrame` tick.
- **Canvas-Owned Animated Insets (`AGENTS.md §4.9`):** The Tofu Mode cup (`MelonSoda`) renders directly on the `640×360` HTML5 `<canvas>` with **zero GC allocations** inside `render()`.
- **60 FPS Compositing Budget (`AGENTS.md §5`):**
  - **Zero `backdrop-filter: blur()`** on gameplay or pause overlays (use flat/alpha dark fills instead).
  - **Zero animated fullscreen `box-shadow` passes** on HUD containers.
  - All UI animations (cassette insertion, 3D hardware back-flip, button press) MUST animate GPU-composited properties only (`transform`, `opacity`) and provide an explicit `@media (prefers-reduced-motion: reduce)` fallback.

### 1.2 Configuration Lock Invariant (CRITICAL)
Driving configuration (`gearbox` manual/auto, `tofuMode`, `sodaSkin`, `crt`, HUD clutter modules, Sun Visor photo stack, and playlist/cassettes) is editable **strictly** in two places:
1. The **Title Screen** (before starting a drive).
2. The **Walkman Pause Menu** (while paused).

**Once active driving starts, ZERO configuration settings may be modified during live gameplay:**
- **Removed Gameplay Hotkeys:** Remove all direct live configuration hotkeys during driving (`G` auto-shift, `T` tofu mode, `V` cup skin, `H` minimal HUD, `C` cassette widget toggle, `M` track loader).
- **Removed HUD Interactive Controls:** Remove all clickable configuration buttons from the active driving HUD (`AUTO/MAN` in `VfdDigidash`, `HUD H` / `PAUSE` top-right controls, `⏏` hide button on `CassetteTapeWidget`, `PIN PHOTO` / `✕` on `SunVisorPhoto`, `PREV`/`NEXT`/`LIST`/`[M]` on `RadioConsole`).
- **Strict `pointer-events-none`:** Every active-driving HUD container MUST be `pointer-events-none`.
- **Sole Player Entry Point During Driving:** `[P]`, `[ESC]`, or Gamepad `Start` opens the Walkman Pause Menu.
- **Developer Tools Exception:** Diagnostic hotkeys (`F2` DebugPanel, `F3` Perf Ribbon, `F4` Autopilot) remain developer-only tools and are not player configuration controls.

---

## 2. Global Copywriting ("LESS IS MORE"), Brand Policy & Visual Language

### 2.1 Zero AI-Slop Copy & Zero Real-World Brands Policy (Global Rule)
All screens, hardware faceplates, modals, and HUD widgets MUST strip redundant badges, obvious explanatory subtitles, faux-hardware marketing jargon, and any real-world commercial trademarks.

**Zero Real-World Brands / Trademarks Invariant (CRITICAL):**
- No existing real-world commercial brand names, product names, or trademarks (e.g., `SONY`, `WALKMAN`, `TDK`, `MAXELL`, `POCARI SWEAT`, `BOSS COFFEE`, `AE86`, `TOYOTA`, etc.) may EVER appear in visible UI text, hardware faceplates/silkscreens, cassette shells, drink labels, or option menus.
- Use original in-universe branding (`真夜中`, `MAYONAKA`) or clean generic descriptors only.

**Explicitly Forbidden Visible Copy (Purge Everywhere):**
- **Real-world brands / trademarks:** `SONY`, `WALKMAN`, `TDK`, `MAXELL`, `POCARI`, `POCARI SWEAT`, `BOSS`, `BOSS COFFEE`
- `DIGITAL COCKPIT`, `GT-APEX · VFD`, `SHIFT BEAT`
- `WM-86 · STEREO CASSETTE`, `88.4 FM · DIN TUNER`, `SINGLE CASSETTE`, `SERVICE BUS`
- `WM-86 TAPE HOLD`, `WM-86 DIP SWITCHES`, `WM-86 OWNER'S MANUAL`, `WM-86 CASSETTE DECK`
- `SUN VISOR`, `TOKYO 86`, `CUSTOM CLIP`, `PIN PHOTO`
- `SODA // x2`, `TOFU CUP // x2`, `POCARI // x2`, `BOSS CAN // x2`, `TOFU ×2`
- Verbose explainer lines such as:
  - *"Your music generates the road · Stays private on your device"*
  - *"Drop audio files to make a new road"*
  - *"DOUBLE-CLICK TO DRIVE"*

**Copy Budgets:**
- **Menu keys & option labels:** 1–3 uppercase words maximum (e.g., `PLAY`, `TAPES`, `OPTIONS`, `GUIDE`, `GEARBOX`, `TOFU CUP`, `DRINK`, `CRT`).
- **Active Driving HUD:** Bare numeric readouts + minimal tokens (`184 KM/H`, `4`, `GROOVE`, track title, track index). Zero sentences.
- **Tofu Mode Cup:** **Strictly 0 characters of text.**

### 2.2 Typography Hierarchy
- **Title Lockup (Vaporwave / Synth):** High-contrast, crisp 1980s metallic chrome-bevel display (`真夜中 CASSETTE`) with a clean cyan edge highlight and a neon-pink 80s brush-script accent (`MIDNIGHT DRIVE`), positioned in the open sky above the cassette deck. Must remain immediately legible at all 16:9 viewport sizes.
- **Hardware & Telemetry UI:** Tabular monospace (`JetBrains Mono`, `font-variant-numeric: tabular-nums`) paired with geometric sans (`Space Grotesk`, `Noto Sans JP`).
- **Handwritten Funky Guide (Back of Deck & Walkman):** Expressive hand-lettered marker headings with dark ink and pastel highlighter strokes on cream paper stock — energetic, legible, zero dense paragraphs.

### 2.3 Monochrome Theme-Driven Accent System (Ban on Tri-Color Rainbow Bars)
- **Forbidden:** Hardcoded multi-color pink/amber/mint gradients (`.wm-accent-strip`, `.ff-obi-h`, and multi-stop rainbow progress/speed bars) MUST NOT appear on HUD track/road progress bars or Stage Fork bars.
- **Required:** Track/road progress bars are **strictly monochrome**, dynamically inheriting a single accent color from the active `StagePalette.id` (`src/road/palette.ts`), surfaced to React via `TelemetrySnapshot` (`stagePaletteId` / `stageAccentColor`):

| `StagePalette.id` | Stage Name | Monochrome Accent Hex |
| :--- | :--- | :--- |
| `night` | `MAYONAKA BAY` | `#00f0b5` |
| `og_future_funk` | `SUNSET BOULEVARD` | `#ff7b25` |
| `akiba_night` | `AKIBA NIGHT RUSH` | `#ff007f` |
| `vaporfunk` | `PASTEL MIRAGE` | `#c77dff` |
| `akiba_noon` | `AKIBA NOON RUSH` | `#ffda6b` |

*(Transition smoothly via `lerpHexColor` or discrete palette swap when a stage crossfades.)*

---

## 3. Title Screen — Front-Loading Stereo Cassette Tape Deck

### 3.1 Spatial Layout
- **Background:** The live 16-bit midnight Tokyo Bay highway attract scene runs unobstructed behind the foreground UI (sky, striped moon, water reflection, coastal skyline, road, and cruising coupe remain clearly framed).
- **Upper Zone (Above the Player):**
  - Centered Vaporwave/Synth title lockup (`真夜中 CASSETTE` + `MIDNIGHT DRIVE` script accent).
  - **One minimal synth readout line** below the title showing the active tape summary: `<TRACK TITLE> · <BPM> BPM · <N> TRACKS`.
  - Only when `audioUnlocked === false`, show a compact `SOUND` unlock pill so Web Audio unlocks cleanly on user gesture (`AGENTS.md §4.5`).
- **Lower-Center Hero Object (Stereo Cassette Tape Deck):**
  - Brushed-silver and dark-charcoal 1980s front-loading horizontal hi-fi stereo cassette deck:
    - **Left-center bay:** Smoked-acrylic hinged cassette door displaying the active cassette (paper `SIDE A` label + dual reels).
    - **Right faceplate:** Mechanical 3-digit counter (`000`–`999`) + twin warm-amber backlit analog VU meters.
    - **Bottom piano-key bank (Deck Buttons ARE the Menu Items):** 4 chunky mechanical piano keys with crisp silkscreened labels directly above each key:
      1. `▶ PLAY` *(coral/red primary key)* — Starts the drive immediately with the configured playlist and options (`Loading (XX%)` until `preloader` is ready).
      2. `⏏ TAPES` — Opens the Cassette Loader & Playlist drawer anchored to the deck.
      3. `≡ OPTIONS` — Opens the Shared Configuration Panel (`§4.3`).
      4. `↻ GUIDE` — Flips the entire cassette deck 180° to show the back-side Driver's Guide (`§3.5`).
- **Input Parity:** Full support for Keyboard (`←/→` or `↑/↓`, `Enter`/`Space`, `1`–`4`), Mouse hover/click, and Gamepad (`D-Pad` + `A`).

### 3.2 Fluid Cassette Insertion Animation (`⏏ TAPES`)
Whenever the user imports new audio files (drag-and-drop or file picker) or selects a different track from the playlist, the deck's front-loading cassette bay plays a **3-phase physical insertion animation**:
1. **`eject` (160 ms, when replacing an existing tape):** Hinged acrylic door tilts open (`rotateX`), current cassette slides up and out (`translateY` + `opacity`).
2. **`insert` (280 ms, `cubic-bezier(0.22, 1, 0.36, 1)`):** New cassette glides down smoothly into the open smoked-acrylic slot.
3. **`latch` (140 ms):** Acrylic door snaps shut flush, cassette seats onto the drive hubs, and the reels perform a brief mechanical engage tick.
- **`prefers-reduced-motion: reduce`:** Replace translation/rotation with a crisp `120 ms` opacity crossfade on the cassette label/reels.

### 3.3 Non-Autoplay Preview Contract (CRITICAL)
- Audio preview MUST **NEVER** auto-start when:
  - Opening `TAPES` from Title Screen or Pause Menu.
  - Importing audio files.
  - Selecting/clicking a track row in the playlist.
- Audio preview starts **ONLY** when the user explicitly presses `▶ PREVIEW` (or `Space` while the tape drawer is active).

### 3.4 Optional Mixing & Preview Coordination (`MIX` Toggle)
Tempo and downbeat calibration are **optional advanced features**, NOT default clutter:
- **Collapsed by Default:** `÷2 BPM`, `×2 BPM`, `TAP TEMPO`, `BEAT -1`, `BEAT +1`, `BEAT CLICK`, `SKIP TO DROP`, and the interactive section scrubber are **hidden by default** behind an explicit `MIX` toggle button inside `TAPES`.
- **Unstable Tempo Indicator:** If `beatMap.confidence.tempoStable === false`, display only a compact amber warning dot/tag on the `MIX` toggle button — do **not** auto-expand `MIX` and do **not** auto-start audio preview.
- **Mixing ↔ Preview Coordination Contract:**
  - **If preview IS playing:** Applying `÷2 BPM`, `×2 BPM`, `TAP TEMPO`, `BEAT -1`, `BEAT +1`, toggling `BEAT CLICK`, or dragging the scrubber MUST update the `BeatMap` and **re-sync the active `FunkAudioEngine` preview clock & metronome seamlessly in place** (no restart from `0:00`, no audio stutter).
  - **If preview is STOPPED/PAUSED:** Mixing changes update and persist the `BeatMap` **silently** without triggering audio playback. Toggling `BEAT CLICK` only arms/disarms the metronome state until the user explicitly starts preview.

### 3.5 Driver's Guide — Back of the Player (`↻ GUIDE`)
- Selecting `↻ GUIDE` triggers a smooth **3D flip animation** (`perspective: 1200px`, `transform: rotateY(180deg)`, `480 ms cubic-bezier(0.22, 1, 0.36, 1)`, `backface-visibility: hidden`) rotating the cassette deck to expose its **rear metal chassis** (corner screws, ventilation slots, rear RCA/jack rim).
  - *Reduced motion:* `150 ms` crossfade between front and rear views.
- Taped onto the rear metal plate with angled pastel masking/washi tape strips at the corners is a cream paper sheet (`DRIVER'S GUIDE`) styled like a retro 1980s Japanese cassette insert / fanzine:
  - **Funky handwritten marker headings** + pastel highlighter streaks (`pink`, `mint`, `amber`).
  - **4 compact visual callouts:**
    1. `BEAT-SHIFT`: `[SPACE]` up / `[SHIFT]` down on beats `1-2-3-4`.
    2. `DRIFT`: `[S] / [↓] + STEER` (or `[LCTRL]`) with a curved slide arrow sketch.
    3. `TOFU CUP`: tilting glass sketch + `"NO SPILL!"`.
    4. `CONTROLS`: clean key diagrams for `WASD` + `ARROWS`, `[P] / [ESC]` Pause, and Gamepad mapping.
  - **Anime Margin Doodles:** Pen-and-ink 1980s manga/anime doodles along the left & right margins (chibi sunglasses driver, melon cream soda glass, drifting 80s JDM coupe with speed lines, floating cassettes, sparkle stars), implemented via lightweight inline SVGs (zero heavy external image assets).
  - **Return Action:** `↺ BACK [ESC]` pill button flips the deck back to the front.

---

## 4. Pause Menu — Right-Edge Portable Cassette Player

### 4.1 Hardware Identity & Spatial Anchor
- **Visual Silhouette:** Vertical 1980s portable cassette player with a metallic cobalt-blue anodized body, brushed-silver left mechanical control rail, orange top accent button, vertical smoked cassette door showing the active track title, top headphone plug & curved cord.
- **Branding:** Silkscreened exclusively with original in-universe branding (**`MAYONAKA`** or **`真夜中`**) — **never** display real-world trademarks (`SONY`, `WALKMAN`, etc.) anywhere on the chassis or UI.
- **Positioning:** Anchored cleanly on the **right side of the screen** over a dimmed pause backdrop (`rgba(7, 9, 17, 0.78)` — zero `backdrop-filter: blur`).

### 4.2 Five Mechanical Side Keys & Navigation
Along the Walkman's left silver rail sit **5 physical mechanical side buttons**, stacked vertically top-to-bottom. Directly adjacent to the **left** of each button sits a crisp uppercase label connected by a horizontal hairline tick:
1. `RESUME`
2. `RESTART`
3. `OPTIONS`
4. `GUIDE` *(with small `↻` flip indicator)*
5. `EXIT TO TITLE`

- **Keyboard / Gamepad Navigation (`↑ / ↓`, `W / S`, D-Pad):**
  - Moving selection highlights the active label (cyan/mint glow + `▸` cursor), lights the adjacent LED dot, and physically depresses the corresponding mechanical side button (`translateX(2px)` / pressed bevel).
  - `Enter` / `Space` / `A` activates the selected item.
  - `[P]` / `[ESC]` / `Start`: if a sub-panel (`OPTIONS`, `TAPES`, `GUIDE`) is open, returns to the root Walkman menu first; from root Pause, resumes driving.

### 4.3 Shared `OPTIONS` Panel (Docked Left of the Walkman)
- Selecting `OPTIONS` keeps the Walkman **fixed on the right side** (zero hardware layout jump) and opens the **exact same Shared Configuration Component** used on the Title Screen, docked cleanly to the **left of the Walkman** (center-left half of the viewport).
- **Controls in the Shared Configuration Panel:**
  - `GEARBOX`: `MANUAL` | `AUTO`
  - `TOFU CUP`: `ON` | `OFF`
  - `DRINK`: cycle `MELON SODA` | `WATER CUP` | `ION DRINK` | `CANNED COFFEE` *(brand-free display labels mapped to internal `SodaSkin` IDs in `MelonSoda.ts`)*
  - `CRT`: `ON` | `OFF`
  - `HUD`: presets (`CLEAN` / `CLUTTER`) + individual module toggles:
    - `DASH` *(Bottom-Left Speedometer & Tachometer)*
    - `TAPE + LIST` *(Top-Left Cassette + Adjacent Playlist)*
    - `VISOR` *(`ON`/`OFF` + Sun Visor Photo Stack manager `0..5`: `+ ADD`, per-photo `✕`, `CLEAR`)*
  - `+ LOAD CASSETTE` *(displayed in Pause `OPTIONS` to open the tape loader/playlist drawer; on Title Screen, `⏏ TAPES` provides this directly).*

### 4.4 Cassette Loading & Insertion Animation in the Walkman
- **Entry Points (keeping strictly 5 side keys):**
  1. `+ LOAD CASSETTE` inside `OPTIONS`.
  2. Clicking directly on the **Walkman's vertical cassette door/window** (with a subtle hover/focus highlight).
- **Walkman Insertion Animation:** Importing or switching a track in Pause triggers a **fluid vertical cassette insertion animation directly inside the Walkman's window** (vertical door hinges open → cassette glides smoothly into the vertical bay → door closes flush).
- Uses the exact same **non-autoplay preview** (`§3.3`) and **optional `MIX` toggle / preview coordination** (`§3.4`) rules as the Title Screen.

### 4.5 Walkman Back-Flip (`GUIDE`) & Dev Tools
- **Back of Walkman (`GUIDE`):** Smoothly centers and flips the Walkman (`rotateY(180deg)`, `480 ms` or `150 ms` reduced-motion crossfade) to reveal the **rear casing of the Walkman** with the same funky handwritten zine guide & anime margin doodles taped to the back + `↺ BACK [ESC]`.
- **Developer Service Tools:** `[F2]` Tuning, `[F3]` Perf Ribbon, `[F4]` Autopilot, and BeatMap Lab remain accessible via hotkeys and/or a subtle unobtrusive dev-only trigger in the bottom-left corner of Pause — **never** added as extra Walkman side keys.

---

## 5. In-Game HUD — Modular "Luxurious / Negligent Clutter" Cockpit

### 5.1 Design Philosophy: Additive Clutter Under User Control
- Every HUD module is individually toggleable from Title or Pause `OPTIONS`.
- With minimal modules enabled, the player sees an ultra-clean midnight highway. As the user enables more modules (Instruments, Cassette + Playlist, Tofu Cup, and 1–5 stacked Sun Visor photos), the cabin progressively fills with tactile, slightly negligent 1980s JDM luxury clutter while leaving the central road corridor and horizon line unobstructed.
- **All 4 quadrants are strictly `pointer-events-none` during driving.**

### 5.2 Four-Quadrant Spatial Map

```text
┌───────────────────────────────────────────────────────────────────────┐
│ TOP-LEFT                              TOP-RIGHT                       │
│ [ Cassette Window ] [ Playlist 01.. ] [      OVERSIZED SUN VISOR    ] │
│ [ ████████░░░░░░░ ] (Monochrome Theme)    [Photo 1] (clipped)         │
│                                            [Photo 2] (taped)          │
│                  CLEAR CENTRAL ROAD         [Photo 3] (clipped)       │
│                  & HORIZON CORRIDOR          [Photo 4] (taped)        │
│                                               [Photo 5] (overflows ↓) │
│ BOTTOM-LEFT                           BOTTOM-RIGHT                    │
│ [ RPM / 184 KM/H / GEAR 4 / GROOVE ]         [ Tofu Cup on Dash ]     │
│                                              (ZERO TEXT)              │
└───────────────────────────────────────────────────────────────────────┘
```

#### 1. Top-Left — Cassette + Adjacent Playlist + Monochrome Theme Progress Bar
- **Cassette Window:** Compact dark-anodized cassette housing with spinning reels (reacting to playback speed and collision/spill tape slack) and clean track title (`NEON HORIZON`).
- **Adjacent Playlist:** Positioned immediately to the right of the cassette (replacing the legacy bottom-left `RadioConsole` DIN box). Displays a compact, read-only track list (`01 NEON HORIZON ◀`, `02 MIDNIGHT WANGAN`, `03 MELON SUNSET`) with the active track highlighted in the stage accent color.
- **Progress Bar:** Placed cleanly beneath the cassette window. **Strictly monochrome** — uses the active `StagePalette` accent color (`§2.3`), never the legacy 3-color rainbow gradient.

#### 2. Bottom-Left — Speedometer & Tachometer (`VfdDigidash`)
- **Relocated from bottom-right to bottom-left.**
- Displays only crisp VFD telemetry:
  - Digital Speed (`184` + `KM/H`)
  - Active Gear (`1`–`6`)
  - Segmented / curved `RPM` tachometer (with subtle sweet-spot and redline color cues)
  - Slim `GROOVE` bar + tier indicator
- **Removed:** `DIGITAL COCKPIT`, `GT-APEX · VFD`, `SHIFT BEAT`, and clickable `AUTO/MAN` button.

#### 3. Bottom-Right — Tofu Mode Cup (`MelonSoda` Canvas Inset)
- **Relocated from bottom-left to bottom-right** (`drawMelonSodaInset(ctx, soda, canvasWidth, canvasHeight, alpha)` in `src/entities/MelonSoda.ts`).
- **Strictly 0 Characters of Text:** Remove the fascia nameplate (`SODA // x2`, `TOFU CUP // x2`, `POCARI // x2`, `BOSS CAN // x2`), LED danger bar, and numeric spill pips.
- Renders only the physical sculpted leather/woodgrain cup-holder ledge, rubber/brass coaster, spilled puddle accumulation, and animated drink container (melon cream soda float, plain white paper water cup, blue-and-white sports ion drink can, gold-and-navy canned coffee — zero commercial brand logos or text) with multi-mode liquid slosh, ice cubes, scoop, cherry, straw, and splash droplets.

#### 4. Top-Right — Oversized Sun Visor with Cascading Photo Chain (`SunVisorPhoto`)
- **Relocated to top-right and enlarged** (`~1.35×` larger visor flap and photo frames than the legacy center-right widget).
- **Maximum Limit:** **`MAX_VISOR_PHOTOS = 5`**.
- **Cascading Attachment Mechanics:**
  - Photo `#1` is clipped directly onto the folded dark-leather sun visor flap.
  - Each subsequent photo (`#2` through `#5`) hangs **clipped or taped onto the bottom edge of the photo above it**, forming a slightly crooked, layered vertical chain down the right windshield edge.
  - Connectors alternate deterministically between **metallic silver paperclips** and **angled translucent masking/washi tape strips**, with subtle organic rotation angles (e.g., `-3.5°`, `+3°`, `-2°`, `+4°`, `-2.5°`) and slight horizontal offsets.
  - **Comedic Vertical Overflow Behavior:**
    - `0` photos: shows the default retro Tokyo night postcard clipped to the visor.
    - `1–2` photos: clean, stylish JDM cockpit accent.
    - `3` photos: noticeably eccentric vertical stack hanging along the right edge.
    - `4` photos: bottom photo reaches down beside the bottom-right Tofu cup shelf.
    - `5` photos: bottom photo **extends comically past the bottom edge of the viewport** (naturally clipped by `overflow-hidden`), visually amplifying the negligent luxury vibe.
- **No HUD Chrome/Text:** Zero `SUN VISOR` / `TOKYO 86` / `CUSTOM CLIP` text labels and zero HUD upload buttons. Photo uploads/removals (`0..5`) happen exclusively inside the Shared `OPTIONS` Panel (`visorPhotoStore.ts` upgraded to store an ordered `VisorPhotoItem[]` array in IndexedDB, auto-migrating any legacy single `primary` photo).

---

## 6. Secondary Overlays (`RadioSelector` Stage Fork & End-of-Run)

- **`RadioSelector` (Stage Fork Banner & End-of-Run Summary):**
  - Must follow the global `"LESS IS MORE"` copy policy (strip redundant hardware model tags like `WM-86 TAPE LOG`).
  - Replace `.wm-accent-strip` rainbow progress bars with the **monochrome stage-accent bar (`§2.3`)**.

---

## 7. Codebase Mapping & Refactoring Blueprint for Agents

| File | Required Target State |
| :--- | :--- |
| [`src/ui/MainMenu.tsx`](../src/ui/MainMenu.tsx) | Front-loading Stereo Cassette Tape Deck hero UI; vaporwave/synth title lockup + 1-line readout above; 4 piano keys (`PLAY`, `TAPES`, `OPTIONS`, `GUIDE`); 3D back-flip to `BackGuideSheet`. |
| [`src/ui/PauseMenu.tsx`](../src/ui/PauseMenu.tsx) | Right-edge `MAYONAKA` portable cassette player (zero real-world brands); 5 side keys with left-adjacent labels (`RESUME`, `RESTART`, `OPTIONS`, `GUIDE`, `EXIT TO TITLE`); left-docked shared `OptionsPanel`; cassette-door click + vertical insertion animation; 3D back-flip to `BackGuideSheet`. |
| [`src/ui/TrackLoader.tsx`](../src/ui/TrackLoader.tsx) | Cassette loader & playlist panel reusable from Title Deck & Pause Walkman; **no auto-preview**; `MIX` toggle collapsed by default; live mixing ↔ preview clock sync; triggers cassette insertion animation. |
| [`src/ui/DriverManualModal.tsx`](../src/ui/DriverManualModal.tsx) | Refactor into shared `BackGuideSheet` (cream paper zine, funky handwritten headings, 4 visual callouts incl. `WASD` + `ARROWS`, lightweight inline SVG anime margin doodles, `↺ BACK [ESC]`). |
| [`src/ui/QuickOptionsModal.tsx`](../src/ui/QuickOptionsModal.tsx) & [`src/ui/cockpit/CockpitOptionsSection.tsx`](../src/ui/cockpit/CockpitOptionsSection.tsx) | Consolidate into one shared `OptionsPanel` reused identically by Title Screen and Pause Menu, including multi-photo Sun Visor stack manager (`0..5`). |
| [`src/ui/HUD.tsx`](../src/ui/HUD.tsx) | Strictly `pointer-events-none` 4-quadrant layout; remove `KeyH`/`KeyC` gameplay hotkeys and all clickable top-right HUD buttons (`HUD H`, `PAUSE`). |
| [`src/ui/hud/CassetteTapeWidget.tsx`](../src/ui/hud/CassetteTapeWidget.tsx) & [`src/ui/cockpit/RadioConsole.tsx`](../src/ui/cockpit/RadioConsole.tsx) | Unify into Top-Left Cassette + adjacent read-only Playlist strip; monochrome stage-accent progress bar; remove all interactive buttons and copy slop. |
| [`src/ui/hud/VfdDigidash.tsx`](../src/ui/hud/VfdDigidash.tsx) | Relocate to bottom-left; remove `DIGITAL COCKPIT`, `GT-APEX · VFD`, `SHIFT BEAT`, and clickable `AUTO/MAN` toggle. |
| [`src/entities/MelonSoda.ts`](../src/entities/MelonSoda.ts) | Relocate `drawMelonSodaInset` to bottom-right (`canvasWidth`); strip **100%** of fascia text, nameplates, LED danger bar, spill pips, and any brand marks; map `SODA_SKIN_LABELS` to brand-free display labels (`MELON SODA`, `WATER CUP`, `ION DRINK`, `CANNED COFFEE`). |
| [`src/ui/cockpit/SunVisorPhoto.tsx`](../src/ui/cockpit/SunVisorPhoto.tsx) & [`src/ui/cockpit/visorPhotoStore.ts`](../src/ui/cockpit/visorPhotoStore.ts) | Relocate to top-right, enlarge (`~1.35×`), render 1..5 cascading paperclipped/taped photos reaching past bottom edge; remove HUD text/buttons; upgrade IndexedDB store to ordered `VisorPhotoItem[]` (max 5, migrating legacy `primary`). |
| [`src/road/palette.ts`](../src/road/palette.ts), [`src/engine/Game.ts`](../src/engine/Game.ts), [`src/App.tsx`](../src/App.tsx) | Expose stage monochrome accent hex on `TelemetrySnapshot`; pass `width` to `drawMelonSodaInset`; lock live config actions (`tofuMode`, `cycleSodaSkin`, `autoShift`, `KeyM`) during active driving; remove automatic `audio.startPreview` inside `openTrackLoader`. |
| [`src/ui/RadioSelector.tsx`](../src/ui/RadioSelector.tsx) | Purge redundant copy; replace rainbow `.wm-accent-strip` with monochrome stage-accent bar. |

---

## 8. Mandatory Verification Checklist for Future UI Implementations

Before marking any UI PR built against this specification as complete, verify every item:
1. **`npm run check` passes:** `eslint .`, `vitest run`, and `tsc --noEmit && vite build` all pass cleanly.
2. **60 FPS Live Check (`AGENTS.md §5`):** No `backdrop-filter: blur()` or per-rAF React updates; full-song browser run sustains 60 FPS with all clutter modules enabled.
3. **Configuration Lock Verified:** Pressing `G`, `T`, `V`, `H`, `C`, `M` during active driving changes nothing; clicking anywhere on the driving HUD triggers nothing; all settings change only in Title or Pause.
4. **Non-Autoplay Preview & Optional Mixing Verified:** Opening `TAPES`, importing files, or selecting tracks produces zero audio until `▶ PREVIEW` / `Space`; `MIX` starts collapsed; toggling `MIX` adjustments syncs cleanly if preview is playing and stays silent if paused.
5. **Diegetic Animations Verified:** Cassette insertion animates smoothly on both Title Deck and Pause Walkman; `GUIDE` performs a smooth 3D back-flip on both units; `prefers-reduced-motion` falls back to crossfades.
6. **Monochrome Theme Accent Verified:** Top-left progress bar changes single solid color per stage theme (`#00f0b5` / `#ff7b25` / `#ff007f` / `#c77dff` / `#ffda6b`) with zero rainbow gradient strips.
7. **Tofu Cup & Sun Visor Clutter Verified:** Bottom-right Tofu cup has zero text; top-right Sun Visor supports 1–5 stacked clipped/taped photos with photo #5 extending past the bottom edge.
8. **Zero Real-World Brands / Trademarks Verified:** Confirm no commercial brand names (`SONY`, `WALKMAN`, `TDK`, `MAXELL`, `POCARI`, `BOSS`, etc.) appear in any rendered UI text, SVG silkscreen, canvas cup art, or option label.
