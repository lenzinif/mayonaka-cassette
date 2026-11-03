import type { SectionRole } from '@src/audio/BeatMap';
import type { GrooveTier } from './PlayerCar';

export type PassengerMood = 'VIBING' | 'HYPED' | 'NERVOUS' | 'SHOCKED';

export interface PassengerUpdateInput {
  speedRatio: number;
  steer: number;
  isDrifting: boolean;
  driftDir: -1 | 0 | 1;
  isOffRoad: boolean;
  grooveTier: GrooveTier;
  sectionRole: SectionRole;
  beatPulse: number;
  downbeatPulse: number;
  tofuActive: boolean;
  sodaDanger: number;
}

/**
 * 90s Anime Co-Pilot Passenger Cam state machine & canvas inset renderer
 * (AGENTS.md §3, §4.3, §4.9 & §5 M7).
 *
 * Pure TypeScript module (zero React imports, zero GC allocations in `update` or `render`).
 * Everything animated every frame (head-bob on the beat, wind-swept hair, eye blinks,
 * starry-eyed drift hype, sweat-drop cup anxiety, and collision/spill shock) is drawn
 * directly on the `<canvas>` by the engine. React (`HUD.tsx`) renders only the static
 * outer label/telemetry badge around it.
 */
export class PassengerCam {
  mood: PassengerMood = 'VIBING';

  /** Vertical head-bob offset in pixels (interpolated at render time). */
  bobY = 0;
  prevBobY = 0;

  /** Lateral wind/cornering hair sway in pixels (interpolated at render time). */
  hairSway = 0;
  prevHairSway = 0;

  /** Continuous animation clock for hair flutter, notes, and blinks. */
  animPhase = 0;
  prevAnimPhase = 0;

  private shockTimer = 0;
  private hypeTimer = 0;
  private blinkTimer = 2.4;
  private blinkDuration = 0;

  /** Triggers an immediate `SHOCKED` anime reaction (e.g. on collision or Melon Soda spill). */
  triggerShock(durationSec = 1.35): void {
    this.shockTimer = Math.max(this.shockTimer, durationSec);
    this.mood = 'SHOCKED';
  }

  /** Triggers an excited `HYPED` anime reaction (e.g. on PERFECT beat-shift, drop sync, or drift exit). */
  triggerHype(durationSec = 1.8): void {
    this.hypeTimer = Math.max(this.hypeTimer, durationSec);
    if (this.shockTimer <= 0) {
      this.mood = 'HYPED';
    }
  }

  reset(): void {
    this.mood = 'VIBING';
    this.bobY = 0;
    this.prevBobY = 0;
    this.hairSway = 0;
    this.prevHairSway = 0;
    this.animPhase = 0;
    this.prevAnimPhase = 0;
    this.shockTimer = 0;
    this.hypeTimer = 0;
    this.blinkTimer = 2.4;
    this.blinkDuration = 0;
  }

  update(dt: number, input: PassengerUpdateInput): void {
    this.prevBobY = this.bobY;
    this.prevHairSway = this.hairSway;
    this.prevAnimPhase = this.animPhase;

    this.animPhase += dt * (2.5 + input.speedRatio * 4.5);

    if (this.shockTimer > 0) {
      this.shockTimer = Math.max(0, this.shockTimer - dt);
    }
    if (this.hypeTimer > 0) {
      this.hypeTimer = Math.max(0, this.hypeTimer - dt);
    }

    // Natural eye-blink cycle during calm/vibing cruise
    if (this.blinkDuration > 0) {
      this.blinkDuration = Math.max(0, this.blinkDuration - dt);
    } else {
      this.blinkTimer -= dt;
      if (this.blinkTimer <= 0) {
        this.blinkDuration = 0.13;
        this.blinkTimer = 2.2 + ((Math.floor(this.animPhase * 7) % 5) * 0.45);
      }
    }

    // Evaluate priority-ordered passenger mood: SHOCKED > NERVOUS > HYPED > VIBING
    if (this.shockTimer > 0) {
      this.mood = 'SHOCKED';
    } else if ((input.tofuActive && input.sodaDanger >= 0.7) || input.isOffRoad) {
      this.mood = 'NERVOUS';
    } else if (
      this.hypeTimer > 0 ||
      input.isDrifting ||
      input.grooveTier === 'HIGH' ||
      input.grooveTier === 'SSS' ||
      input.sectionRole === 'drop'
    ) {
      this.mood = 'HYPED';
    } else {
      this.mood = 'VIBING';
    }

    // Beat-synced head-bob + road vibration
    const beatBounce = (input.beatPulse * 2.8 + input.downbeatPulse * 1.6) * (0.4 + input.speedRatio * 0.6);
    const offRoadShake = input.isOffRoad ? Math.sin(this.animPhase * 11) * 1.8 : 0;
    const targetBob = beatBounce + offRoadShake;
    this.bobY += (targetBob - this.bobY) * (1 - Math.exp(-22 * dt));

    // Wind & cornering hair sway
    const targetSway =
      (input.driftDir !== 0 ? -input.driftDir * 4.2 : -input.steer * 2.8) +
      Math.sin(this.animPhase * 2.6) * (0.6 + input.speedRatio * 1.4);
    this.hairSway += (targetSway - this.hairSway) * (1 - Math.exp(-16 * dt));
  }

  get isBlinking(): boolean {
    return this.blinkDuration > 0 && this.mood === 'VIBING';
  }
}

/**
 * Renders the 110×70 px 90s Anime Passenger Cam inset on the `<canvas>` (AGENTS.md §4.9 & §5 M7).
 * Positioned at top-right (`x = canvasWidth - 124, y = 44`) below the top action bar.
 */
export function drawPassengerCamInset(
  ctx: CanvasRenderingContext2D,
  passenger: PassengerCam,
  canvasWidth: number,
  alpha = 1,
): void {
  const boxW = 110;
  const boxH = 70;
  const boxX = canvasWidth - boxW - 14;
  const boxY = 44;

  const bobY = Math.round(passenger.prevBobY + (passenger.bobY - passenger.prevBobY) * alpha);
  const sway = Math.round(
    passenger.prevHairSway + (passenger.hairSway - passenger.prevHairSway) * alpha,
  );
  const phase = passenger.prevAnimPhase + (passenger.animPhase - passenger.prevAnimPhase) * alpha;
  const mood = passenger.mood;

  const jitterX = mood === 'SHOCKED' ? Math.round(Math.sin(phase * 28) * 1.5) : 0;
  const jitterY = mood === 'SHOCKED' ? Math.round(Math.cos(phase * 34) * 1.5) : 0;

  ctx.save();
  ctx.translate(boxX + jitterX, boxY + jitterY);

  // 1. Inset backdrop & reactive neon border
  ctx.fillStyle =
    mood === 'SHOCKED'
      ? 'rgba(48, 6, 36, 0.94)'
      : mood === 'HYPED'
        ? 'rgba(22, 6, 46, 0.92)'
        : mood === 'NERVOUS'
          ? 'rgba(28, 12, 42, 0.92)'
          : 'rgba(13, 2, 33, 0.9)';
  ctx.fillRect(0, 0, boxW, boxH);

  const borderColor =
    mood === 'SHOCKED'
      ? '#ff2a6d'
      : mood === 'HYPED'
        ? '#ffd319'
        : mood === 'NERVOUS'
          ? '#00f59b'
          : '#05d9e8';
  ctx.strokeStyle = borderColor;
  ctx.lineWidth = mood === 'HYPED' || mood === 'SHOCKED' ? 1.5 : 1;
  ctx.strokeRect(0.5, 0.5, boxW - 1, boxH - 1);

  // Header strip (`CAM 02 // CO-PILOT`)
  ctx.fillStyle =
    mood === 'SHOCKED' ? '#ff2a6d' : mood === 'HYPED' ? '#4a154b' : '#1b0938';
  ctx.fillRect(1, 1, boxW - 2, 12);

  ctx.fillStyle =
    mood === 'SHOCKED'
      ? '#ffffff'
      : mood === 'HYPED'
        ? '#ffd319'
        : mood === 'NERVOUS'
          ? '#00f59b'
          : '#05d9e8';
  ctx.font = 'bold 8px monospace';
  const moodLabel =
    mood === 'SHOCKED'
      ? 'CAM // EEK!!'
      : mood === 'HYPED'
        ? 'CAM // HYPED! ★'
        : mood === 'NERVOUS'
          ? 'CAM // CAREFUL!'
          : 'CAM // VIBING ♪';
  ctx.fillText(moodLabel, 5, 9);

  // Recording indicator dot on right of header
  ctx.fillStyle = Math.floor(phase * 2) % 2 === 0 ? '#ff2a6d' : '#7a1c42';
  ctx.fillRect(boxW - 9, 4, 4, 4);

  // Clip portrait viewport inside `[2, 14, boxW - 4, boxH - 16]`
  ctx.save();
  ctx.beginPath();
  ctx.rect(2, 13, boxW - 4, boxH - 15);
  ctx.clip();

  // 2. Retro anime backdrop (convertible headrest + synthwave night sky / speedlines)
  ctx.fillStyle = '#16072e';
  ctx.fillRect(2, 13, boxW - 4, boxH - 15);

  // Diagonal anime speedlines when HYPED or radial shock bars when SHOCKED
  if (mood === 'HYPED') {
    ctx.fillStyle = 'rgba(5, 217, 232, 0.28)';
    for (let i = 0; i < 6; i++) {
      const lx = ((i * 22 + Math.floor(phase * 38)) % (boxW + 16)) - 8;
      ctx.fillRect(lx, 15 + (i % 3) * 16, 14, 2);
    }
    ctx.fillStyle = 'rgba(255, 211, 25, 0.32)';
    for (let i = 0; i < 4; i++) {
      const lx = ((i * 31 + Math.floor(phase * 52)) % (boxW + 16)) - 8;
      ctx.fillRect(lx, 22 + (i % 2) * 20, 10, 2);
    }
  } else if (mood === 'SHOCKED') {
    ctx.fillStyle = 'rgba(255, 42, 109, 0.38)';
    ctx.fillRect(4, 15, 6, boxH - 18);
    ctx.fillRect(boxW - 10, 15, 6, boxH - 18);
    ctx.fillStyle = '#ffd319';
    ctx.fillRect(8, 18, 2, 10);
    ctx.fillRect(boxW - 10, 18, 2, 10);
  }

  // Convertible leather seat headrest behind passenger
  const cx = Math.floor(boxW * 0.5);
  const headY = 40 + bobY;
  ctx.fillStyle = '#2b1347';
  ctx.fillRect(cx - 22, 46, 44, 24);
  ctx.fillStyle = '#ff2a6d';
  ctx.fillRect(cx - 20, 46, 40, 2);

  // 3. Pixel-art 90s anime co-pilot character
  // Back hair volume (flows sideways with wind `sway`)
  const flutter = Math.round(Math.sin(phase * 3.5) * 1.5);
  ctx.fillStyle = '#3b1766';
  ctx.fillRect(cx - 18 + sway, headY - 14, 36, 30);
  // Flowing wind-blown hair tails on the side
  ctx.fillStyle = '#5a2391';
  ctx.fillRect(cx - 22 + sway - flutter, headY - 6, 8, 20);
  ctx.fillRect(cx + 14 + sway + flutter, headY - 6, 8, 20);
  ctx.fillRect(cx + 18 + sway + flutter, headY + 2, 6, 12);

  // Retro neon city-pop jacket & collar
  ctx.fillStyle = '#05d9e8';
  ctx.fillRect(cx - 18, 54 + Math.round(bobY * 0.5), 36, 16);
  ctx.fillStyle = '#ff2a6d';
  ctx.fillRect(cx - 10, 54 + Math.round(bobY * 0.5), 20, 16);
  // White collar lapels
  ctx.fillStyle = '#f6e7ff';
  ctx.fillRect(cx - 12, 53 + Math.round(bobY * 0.5), 5, 6);
  ctx.fillRect(cx + 7, 53 + Math.round(bobY * 0.5), 5, 6);

  // Neck & face base (warm anime peach pixel block)
  ctx.fillStyle = '#ffcfb3';
  ctx.fillRect(cx - 4, headY + 10, 8, 6);
  ctx.fillStyle = '#ffe3d1';
  ctx.fillRect(cx - 13, headY - 10, 26, 21);
  // Chin taper
  ctx.fillRect(cx - 10, headY + 11, 20, 2);

  // Soft anime cheek blush pixels
  ctx.fillStyle = mood === 'HYPED' || mood === 'SHOCKED' ? '#ff5c93' : '#ff9ebb';
  ctx.fillRect(cx - 11, headY + 3, 4, 2);
  ctx.fillRect(cx + 7, headY + 3, 4, 2);

  // 4. Facial expression by mood (Eyes & Mouth)
  if (mood === 'SHOCKED') {
    // Classic 90s anime "><" shocked eyes
    ctx.fillStyle = '#1a0933';
    // Left ">"
    ctx.fillRect(cx - 10, headY - 3, 2, 2);
    ctx.fillRect(cx - 8, headY - 1, 2, 2);
    ctx.fillRect(cx - 10, headY + 1, 2, 2);
    // Right "<"
    ctx.fillRect(cx + 8, headY - 3, 2, 2);
    ctx.fillRect(cx + 6, headY - 1, 2, 2);
    ctx.fillRect(cx + 8, headY + 1, 2, 2);

    // Wide open gasp mouth
    ctx.fillStyle = '#ff2a6d';
    ctx.fillRect(cx - 4, headY + 5, 8, 5);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(cx - 3, headY + 5, 6, 1);

    // Hands up to cheeks in shock
    ctx.fillStyle = '#ffe3d1';
    ctx.fillRect(cx - 16, headY + 5, 4, 7);
    ctx.fillRect(cx + 12, headY + 5, 4, 7);
  } else if (mood === 'NERVOUS') {
    // Wide worried anime eyes glancing down-left toward the Melon Soda cup
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(cx - 10, headY - 3, 6, 5);
    ctx.fillRect(cx + 4, headY - 3, 6, 5);
    ctx.fillStyle = '#241138';
    ctx.fillRect(cx - 10, headY - 1, 4, 3);
    ctx.fillRect(cx + 4, headY - 1, 4, 3);
    ctx.fillStyle = '#05d9e8';
    ctx.fillRect(cx - 9, headY, 2, 2);
    ctx.fillRect(cx + 5, headY, 2, 2);
    // Worried angled eyebrows
    ctx.fillStyle = '#3b1766';
    ctx.fillRect(cx - 10, headY - 5, 5, 1);
    ctx.fillRect(cx + 5, headY - 5, 5, 1);

    // Wavy tense mouth
    ctx.fillStyle = '#b81d52';
    ctx.fillRect(cx - 4, headY + 6, 3, 1);
    ctx.fillRect(cx - 1, headY + 7, 3, 1);
    ctx.fillRect(cx + 2, headY + 6, 3, 1);

    // Animated anime sweat drop on temple
    const dropY = headY - 6 + Math.round((phase * 6) % 7);
    ctx.fillStyle = '#05d9e8';
    ctx.fillRect(cx + 11, dropY, 3, 4);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(cx + 11, dropY, 1, 2);
  } else if (mood === 'HYPED') {
    // Big sparkling starry anime eyes
    ctx.fillStyle = '#1a0933';
    ctx.fillRect(cx - 10, headY - 3, 6, 5);
    ctx.fillRect(cx + 4, headY - 3, 6, 5);
    // Golden star/sparkle highlights inside irises
    ctx.fillStyle = '#ffd319';
    ctx.fillRect(cx - 8, headY - 2, 3, 3);
    ctx.fillRect(cx + 6, headY - 2, 3, 3);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(cx - 9, headY - 3, 2, 2);
    ctx.fillRect(cx + 5, headY - 3, 2, 2);

    // Excited happy open grin
    ctx.fillStyle = '#ff2a6d';
    ctx.fillRect(cx - 4, headY + 5, 8, 4);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(cx - 3, headY + 5, 6, 1);
  } else {
    // VIBING: relaxed anime eyes (with periodic blink)
    if (passenger.isBlinking) {
      ctx.fillStyle = '#241138';
      ctx.fillRect(cx - 10, headY - 1, 6, 2);
      ctx.fillRect(cx + 4, headY - 1, 6, 2);
    } else {
      ctx.fillStyle = '#1a0933';
      ctx.fillRect(cx - 10, headY - 3, 6, 5);
      ctx.fillRect(cx + 4, headY - 3, 6, 5);
      ctx.fillStyle = '#ff4f9a';
      ctx.fillRect(cx - 8, headY - 1, 4, 3);
      ctx.fillRect(cx + 6, headY - 1, 4, 3);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(cx - 9, headY - 2, 2, 2);
      ctx.fillRect(cx + 5, headY - 2, 2, 2);
    }
    // Gentle content smile
    ctx.fillStyle = '#d91b5c';
    ctx.fillRect(cx - 3, headY + 6, 6, 2);
  }

  // 5. Front bangs, retro headphones, and perched neon sunglasses
  ctx.fillStyle = '#7b2cbf';
  ctx.fillRect(cx - 14 + Math.round(sway * 0.35), headY - 14, 28, 7);
  // Parted fringe spikes
  ctx.fillRect(cx - 13 + Math.round(sway * 0.4), headY - 7, 5, 4);
  ctx.fillRect(cx - 4 + Math.round(sway * 0.4), headY - 7, 6, 3);
  ctx.fillRect(cx + 8 + Math.round(sway * 0.4), headY - 7, 5, 4);
  // Hair highlight strip
  ctx.fillStyle = '#ff4f9a';
  ctx.fillRect(cx - 10 + Math.round(sway * 0.35), headY - 11, 20, 2);

  // Retro 80s Walkman headphones on ears
  ctx.fillStyle = '#05d9e8';
  ctx.fillRect(cx - 16, headY - 4, 4, 9);
  ctx.fillRect(cx + 12, headY - 4, 4, 9);
  ctx.fillStyle = '#ffd319';
  ctx.fillRect(cx - 15, headY - 2, 2, 5);
  ctx.fillRect(cx + 13, headY - 2, 2, 5);

  // Floating pixel musical note / star icon in upper corner of cam
  if (mood === 'VIBING' || mood === 'HYPED') {
    const noteY = 22 + Math.round(Math.sin(phase * 3) * 3);
    const noteX = 12;
    ctx.fillStyle = mood === 'HYPED' ? '#ffd319' : '#05d9e8';
    // Pixel eighth-note stem & head
    ctx.fillRect(noteX, noteY + 4, 4, 3);
    ctx.fillRect(noteX + 3, noteY - 2, 2, 7);
    ctx.fillRect(noteX + 3, noteY - 2, 4, 2);
    if (mood === 'HYPED') {
      const starX = boxW - 18;
      const starY = 21 + Math.round(Math.cos(phase * 4) * 3);
      ctx.fillStyle = '#ff4f9a';
      ctx.fillRect(starX + 2, starY, 2, 6);
      ctx.fillRect(starX, starY + 2, 6, 2);
    }
  }

  ctx.restore();
  ctx.restore();
}
