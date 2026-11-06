import { RUMBLE_LENGTH, SEGMENT_LENGTH } from '@src/config/constants';
import { easeIn, easeInOut } from './RoadProjection';
import { createPoint, type PropKind, type RoadSegment, type Track } from './RoadSegment';

/** Section lengths, in segments. */
export const LENGTH = { SHORT: 25, MEDIUM: 50, LONG: 100 } as const;
/** Hill heights, in segment-length units. */
export const HILL = { LOW: 20, MEDIUM: 40, HIGH: 60 } as const;
/** Per-segment curvature. */
export const CURVE = { EASY: 2, MEDIUM: 4, HARD: 6 } as const;

/**
 * Declarative track builder. Each section eases in, holds, and eases out both curvature and
 * elevation so the road never "kinks".
 */
export class TrackBuilder {
  private readonly segments: RoadSegment[] = [];

  constructor(private readonly segmentLength = SEGMENT_LENGTH) {}

  get count(): number {
    return this.segments.length;
  }

  private lastY(): number {
    const last = this.segments[this.segments.length - 1];
    return last ? last.p2.worldY : 0;
  }

  private addSegment(curve: number, y: number): void {
    const n = this.segments.length;
    this.segments.push({
      index: n,
      p1: createPoint(this.lastY(), n * this.segmentLength),
      p2: createPoint(y, (n + 1) * this.segmentLength),
      curve,
      stripe: Math.floor(n / RUMBLE_LENGTH) % 2 === 0 ? 0 : 1,
      sprites: [],
      fog: 1,
      env: 'standard',
    });
  }

  /** Generic section: `enter` + `hold` + `leave` segments, curving by `curve`, climbing `height`. */
  road(enter: number, hold: number, leave: number, curve: number, height = 0): this {
    const startY = this.lastY();
    const endY = startY + height * this.segmentLength;
    const total = enter + hold + leave;
    // `y` is the far edge (p2) of each segment, hence the +1: the last segment lands exactly on endY.
    for (let n = 0; n < enter; n++) {
      this.addSegment(easeIn(0, curve, n / enter), easeInOut(startY, endY, (n + 1) / total));
    }
    for (let n = 0; n < hold; n++) {
      this.addSegment(curve, easeInOut(startY, endY, (enter + n + 1) / total));
    }
    for (let n = 0; n < leave; n++) {
      this.addSegment(
        easeInOut(curve, 0, n / leave),
        easeInOut(startY, endY, (enter + hold + n + 1) / total),
      );
    }
    return this;
  }

  straight(length: number = LENGTH.MEDIUM): this {
    return this.road(length, length, length, 0, 0);
  }

  curve(length: number, curve: number, height = 0): this {
    return this.road(length, length, length, curve, height);
  }

  hill(length: number, height: number): this {
    return this.road(length, length, length, 0, height);
  }

  sCurves(): this {
    return this.road(LENGTH.MEDIUM, LENGTH.MEDIUM, LENGTH.MEDIUM, -CURVE.EASY, 0)
      .road(LENGTH.MEDIUM, LENGTH.MEDIUM, LENGTH.MEDIUM, CURVE.MEDIUM, HILL.MEDIUM)
      .road(LENGTH.MEDIUM, LENGTH.MEDIUM, LENGTH.MEDIUM, CURVE.EASY, -HILL.LOW)
      .road(LENGTH.MEDIUM, LENGTH.MEDIUM, LENGTH.MEDIUM, -CURVE.EASY, HILL.MEDIUM)
      .road(LENGTH.MEDIUM, LENGTH.MEDIUM, LENGTH.MEDIUM, -CURVE.MEDIUM, -HILL.MEDIUM);
  }

  rollingHills(height: number = HILL.LOW): this {
    const len = LENGTH.SHORT;
    return this.road(len, len, len, 0, height / 2)
      .road(len, len, len, 0, -height)
      .road(len, len, len, 0, height)
      .road(len, len, len, 0, 0)
      .road(len, len, len, 0, height / 2)
      .road(len, len, len, 0, 0);
  }

  /** Brings elevation back to 0 so the loop closes seamlessly. */
  downhillToEnd(length: number = LENGTH.LONG): this {
    return this.road(length, length, length, -CURVE.EASY, -this.lastY() / this.segmentLength);
  }

  /** Places a sprite on every `every`-th segment in [from, to). */
  sprites(
    kind: PropKind,
    offset: number | ((i: number) => number),
    every: number,
    from = 0,
    to = this.segments.length,
  ): this {
    for (let i = from; i < Math.min(to, this.segments.length); i += every) {
      const o = typeof offset === 'number' ? offset : offset(i);
      this.segments[i]!.sprites.push({ kind, offset: o, variant: i % 3 });
    }
    return this;
  }

  build(): Track {
    return {
      segments: this.segments,
      segmentLength: this.segmentLength,
      length: this.segments.length * this.segmentLength,
    };
  }
}

/** Greybox test loop for M1/M2: a bit of everything, including a long sweeper made for drifting. */
export function buildTestTrack(): Track {
  const b = new TrackBuilder()
    .straight(LENGTH.SHORT)
    .rollingHills(HILL.LOW)
    .curve(LENGTH.MEDIUM, CURVE.MEDIUM, HILL.LOW)
    .straight(LENGTH.SHORT)
    .curve(LENGTH.MEDIUM, -CURVE.EASY, 0)
    .hill(LENGTH.MEDIUM, HILL.HIGH)
    .sCurves()
    .curve(LENGTH.LONG, CURVE.HARD, -HILL.LOW)
    .straight(LENGTH.MEDIUM)
    .hill(LENGTH.MEDIUM, -HILL.MEDIUM)
    .curve(LENGTH.LONG, -CURVE.MEDIUM, HILL.MEDIUM)
    .rollingHills(HILL.MEDIUM)
    .downhillToEnd();

  const end = b.count;
  // Palms alternate sides every few segments; lamps line the road edge; billboards are rarer.
  b.sprites('palm', (i) => (i % 12 < 6 ? -1.7 : 1.7) * (1 + (i % 5) * 0.12), 6, 10, end);
  b.sprites('lamp', (i) => ((i / 24) % 2 < 1 ? -1.3 : 1.3), 24, 0, end);
  b.sprites('billboard', (i) => (i % 2 === 0 ? -2.6 : 2.6), 97, 40, end);
  return b.build();
}
