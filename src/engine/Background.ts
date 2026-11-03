import { tuning } from '@src/config/tuning';
import type { StagePalette } from '@src/road/palette';

const MOUNTAIN_POINTS = 64;
const MOUNTAIN_SPAN = 960;
const STAR_COUNT = 36;
const CITY_TOWERS = 24;

/**
 * Procedural synthwave skybox: vertical gradient sky, twinkling pixel-art starfield,
 * striped retro sun, scrolling neon-rimmed mountain silhouette, and parallax pixel city skyline
 * (AGENTS.md §3, §4.3, §4.4 & §5 M7).
 *
 * Precomputes ridge heights, star coordinates, and city tower heights once at construction
 * (zero per-frame allocations).
 */
export class Background {
  private readonly ridgeHeights = new Float32Array(MOUNTAIN_POINTS);
  private readonly starX = new Float32Array(STAR_COUNT);
  private readonly starY = new Float32Array(STAR_COUNT);
  private readonly starPhase = new Float32Array(STAR_COUNT);
  private readonly towerWidths = new Uint8Array(CITY_TOWERS);
  private readonly towerHeights = new Uint8Array(CITY_TOWERS);
  private scrollX = 0;
  private sunOffset = 0;
  private skyTime = 0;
  private cachedSkyCtx: CanvasRenderingContext2D | null = null;
  private cachedSkyHorizonY = -1;
  private cachedSkyPalette: StagePalette | null = null;
  private cachedSkyGrad: CanvasGradient | null = null;

  constructor() {
    for (let i = 0; i < MOUNTAIN_POINTS; i++) {
      const t = (i / MOUNTAIN_POINTS) * Math.PI * 2;
      const h =
        Math.sin(t * 2) * 16 + Math.sin(t * 5 + 1.1) * 10 + Math.cos(t * 11 + 0.4) * 5 + 24;
      this.ridgeHeights[i] = Math.max(6, h);
    }

    // Deterministic pixel-art starfield in upper sky
    for (let i = 0; i < STAR_COUNT; i++) {
      this.starX[i] = ((i * 73 + 19) % 100) / 100;
      this.starY[i] = ((i * 41 + 11) % 68) / 100;
      this.starPhase[i] = (i * 1.37) % (Math.PI * 2);
    }

    // Deterministic pixel-art distant skyline towers
    for (let i = 0; i < CITY_TOWERS; i++) {
      this.towerWidths[i] = 10 + ((i * 7 + 3) % 10);
      this.towerHeights[i] = 6 + ((i * 13 + 5) % 16);
    }
  }

  update(dt: number, segmentCurve: number, speedRatio: number): void {
    this.skyTime += dt;
    this.scrollX = (this.scrollX + segmentCurve * speedRatio * 90 * dt) % MOUNTAIN_SPAN;
    if (this.scrollX < 0) this.scrollX += MOUNTAIN_SPAN;

    this.sunOffset += segmentCurve * speedRatio * 22 * dt;
    // Gently recenter the sun on straights so it stays in frame over a full run.
    this.sunOffset *= Math.exp(-0.6 * dt);
    this.sunOffset = Math.max(-140, Math.min(140, this.sunOffset));
  }

  render(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    palette: StagePalette,
    beatPulse = 0,
    downbeatPulse = 0,
  ): void {
    const horizonY = Math.floor(height * 0.5);
    const pulse = beatPulse * tuning.bpmPulseStrength;
    const downPulse = downbeatPulse * tuning.bpmPulseStrength;

    // 1. Sky gradient (cached across frames unless palette or height changes)
    if (
      this.cachedSkyCtx !== ctx ||
      this.cachedSkyHorizonY !== horizonY ||
      this.cachedSkyPalette !== palette ||
      !this.cachedSkyGrad
    ) {
      const grad = ctx.createLinearGradient(0, 0, 0, horizonY);
      grad.addColorStop(0, palette.skyTop);
      grad.addColorStop(0.62, palette.skyMid);
      grad.addColorStop(1, palette.skyHorizon);
      this.cachedSkyCtx = ctx;
      this.cachedSkyHorizonY = horizonY;
      this.cachedSkyPalette = palette;
      this.cachedSkyGrad = grad;
    }
    ctx.fillStyle = this.cachedSkyGrad;
    ctx.fillRect(0, 0, width, horizonY + 2);

    // 1b. Twinkling pixel-art stars in upper sky
    const starScroll = this.scrollX * 0.25;
    for (let i = 0; i < STAR_COUNT; i++) {
      const sx = Math.round((this.starX[i]! * width - starScroll + width * 2) % width);
      const sy = Math.round(this.starY[i]! * (horizonY - 38)) + 4;
      const twinkle = Math.sin(this.skyTime * 3.2 + this.starPhase[i]!);
      if (twinkle > -0.25) {
        ctx.fillStyle = i % 3 === 0 ? palette.mountainRim : '#fff3b0';
        const size = twinkle > 0.65 || pulse > 0.6 ? 2 : 1;
        ctx.fillRect(sx, sy, size, size);
      }
    }

    // 2. Retro striped synthwave sun (pulses with BPM)
    // Drawn without stencil-clip masks; chord-bounded scanlines + ground fill below horizonY occlude cleanly.
    const sunX = width * 0.5 - this.sunOffset;
    const sunY = horizonY - 18;
    const sunR = 58 + pulse * 4.5 + downPulse * 2.5;
    const sunGrad = ctx.createLinearGradient(0, sunY - sunR, 0, sunY + sunR);
    sunGrad.addColorStop(0, palette.sunTop);
    sunGrad.addColorStop(1, palette.sunBottom);

    ctx.beginPath();
    ctx.arc(sunX, sunY, sunR, 0, Math.PI * 2);
    ctx.fillStyle = sunGrad;
    ctx.fill();

    // Horizontal scanline cutouts across the lower half of the sun (chord-clipped analytically)
    ctx.fillStyle = palette.skyMid;
    const sunRSq = sunR * sunR;
    for (let i = 0; i < 6; i++) {
      const bandY = sunY + 4 + i * 9;
      if (bandY >= horizonY) break;
      const bandH = Math.min(1.5 + i * 0.9, horizonY - bandY);
      const dy = bandY + bandH * 0.5 - sunY;
      const dySq = dy * dy;
      if (dySq < sunRSq) {
        const halfChord = Math.sqrt(sunRSq - dySq);
        ctx.fillRect(sunX - halfChord - 0.5, bandY, halfChord * 2 + 1, bandH);
      }
    }

    // Subtle horizon beat glow on kick/downbeat (kept in the sky above horizonY)
    if (pulse > 0.05) {
      ctx.globalAlpha = Math.min(0.45, pulse * 0.22 + downPulse * 0.15);
      ctx.fillStyle = palette.sunBottom;
      ctx.fillRect(0, horizonY - 14, width, 14);
      ctx.globalAlpha = 1;
    }

    // 3. Fallback ground fill below horizon in case a steep downhill exposes a sliver
    // Rendered AFTER the sun so ground terrain always occludes the celestial body.
    ctx.fillStyle = palette.grass[1];
    ctx.fillRect(0, horizonY, width, height - horizonY);

    // 4. Parallax mountain silhouette + neon cyan rim
    const step = MOUNTAIN_SPAN / MOUNTAIN_POINTS;
    const startIdx = Math.floor(this.scrollX / step);
    const frac = (this.scrollX % step) / step;
    const pointsNeeded = Math.ceil(width / step) + 2;

    ctx.beginPath();
    ctx.moveTo(0, horizonY + 2);
    for (let i = 0; i <= pointsNeeded; i++) {
      const idx = (startIdx + i) % MOUNTAIN_POINTS;
      const x = (i - frac) * step;
      const y = horizonY - this.ridgeHeights[idx]!;
      ctx.lineTo(x, y);
    }
    ctx.lineTo(width, horizonY + 2);
    ctx.closePath();
    ctx.fillStyle = palette.mountain;
    ctx.fill();

    ctx.beginPath();
    for (let i = 0; i <= pointsNeeded; i++) {
      const idx = (startIdx + i) % MOUNTAIN_POINTS;
      const x = (i - frac) * step;
      const y = horizonY - this.ridgeHeights[idx]!;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = palette.mountainRim;
    ctx.lineWidth = 1.2 + pulse * 1.1;
    ctx.stroke();

    // 5. Pixel-art distant city skyline silhouettes & glowing windows along horizon base
    const citySpan = 480;
    const cityScroll = (this.scrollX * 0.65) % citySpan;
    const towerSpacing = citySpan / CITY_TOWERS;
    for (let pass = -1; pass <= Math.ceil(width / citySpan); pass++) {
      const baseOffset = pass * citySpan - cityScroll;
      for (let t = 0; t < CITY_TOWERS; t++) {
        const tx = Math.round(baseOffset + t * towerSpacing);
        const tw = this.towerWidths[t]!;
        if (tx + tw < 0 || tx > width) continue;
        const th = this.towerHeights[t]!;
        const ty = horizonY - th;
        ctx.fillStyle = '#0d0221';
        ctx.fillRect(tx, ty, tw, th + 1);
        // Tiny neon pixel window lights pulsing on the beat
        if (th >= 10) {
          ctx.fillStyle = t % 2 === 0 ? palette.mountainRim : palette.sunTop;
          ctx.fillRect(tx + 2, ty + 2, 2, 2);
          if (tw >= 14) {
            ctx.fillRect(tx + tw - 4, ty + 4, 2, 2);
          }
        }
      }
    }
  }
}
