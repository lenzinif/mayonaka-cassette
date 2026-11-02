import { tuning } from '@src/config/tuning';
import type { StagePalette } from '@src/road/palette';

const MOUNTAIN_POINTS = 64;
const MOUNTAIN_SPAN = 960;

/**
 * Procedural synthwave skybox: vertical gradient sky, striped retro sun, and scrolling
 * neon-rimmed mountain silhouette. Precomputes ridge heights once (zero per-frame allocations).
 */
export class Background {
  private readonly ridgeHeights = new Float32Array(MOUNTAIN_POINTS);
  private scrollX = 0;
  private sunOffset = 0;

  constructor() {
    for (let i = 0; i < MOUNTAIN_POINTS; i++) {
      const t = (i / MOUNTAIN_POINTS) * Math.PI * 2;
      const h = Math.sin(t * 2) * 16 + Math.sin(t * 5 + 1.1) * 10 + Math.cos(t * 11 + 0.4) * 5 + 24;
      this.ridgeHeights[i] = Math.max(6, h);
    }
  }

  update(dt: number, segmentCurve: number, speedRatio: number): void {
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

    // 1. Sky gradient
    const skyGrad = ctx.createLinearGradient(0, 0, 0, horizonY);
    skyGrad.addColorStop(0, palette.skyTop);
    skyGrad.addColorStop(0.62, palette.skyMid);
    skyGrad.addColorStop(1, palette.skyHorizon);
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, width, horizonY + 2);

    // Subtle horizon beat glow on kick/downbeat
    if (pulse > 0.05) {
      ctx.globalAlpha = Math.min(0.45, pulse * 0.22 + downPulse * 0.15);
      ctx.fillStyle = palette.sunBottom;
      ctx.fillRect(0, horizonY - 14, width, 16);
      ctx.globalAlpha = 1;
    }

    // Fallback ground fill below horizon in case a steep downhill exposes a sliver
    ctx.fillStyle = palette.grass[1];
    ctx.fillRect(0, horizonY, width, height - horizonY);

    // 2. Retro striped synthwave sun (pulses with BPM)
    const sunX = width * 0.5 - this.sunOffset;
    const sunY = horizonY - 18;
    const sunR = 58 + pulse * 4.5 + downPulse * 2.5;
    const sunGrad = ctx.createLinearGradient(0, sunY - sunR, 0, sunY + sunR);
    sunGrad.addColorStop(0, palette.sunTop);
    sunGrad.addColorStop(1, palette.sunBottom);

    ctx.save();
    ctx.beginPath();
    ctx.arc(sunX, sunY, sunR, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = sunGrad;
    ctx.fillRect(sunX - sunR, sunY - sunR, sunR * 2, sunR * 2);

    // Horizontal scanline cutouts across the lower half of the sun
    ctx.fillStyle = palette.skyMid;
    for (let i = 0; i < 6; i++) {
      const bandY = sunY + 4 + i * 9;
      const bandH = 1.5 + i * 0.9;
      ctx.fillRect(sunX - sunR, bandY, sunR * 2, bandH);
    }
    ctx.restore();

    // 3. Parallax mountain silhouette + neon cyan rim
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
  }
}
