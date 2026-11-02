/**
 * Deterministic Pseudo-Random Number Generator (AGENTS.md §4.6).
 *
 * Uses FNV-1a / Murmur-style avalanche hashing to derive a 32-bit state from any string seed
 * (such as `BeatMap.contentHash` `"sha256:..."`) and steps state via SplitMix32 / Mulberry32.
 *
 * Never use `Math.random()` in road or level generation code.
 */
export class SeededRandom {
  private state: number;

  constructor(seed: string | number) {
    this.state = typeof seed === 'number' ? seed | 0 : hashStringToUint32(seed);
    if (this.state === 0) {
      this.state = 0x6d2b79f5;
    }
  }

  /** Returns a deterministic float in `[0, 1)`. */
  next(): number {
    this.state = (this.state + 0x6d2b79f5) | 0;
    let t = Math.imul(this.state ^ (this.state >>> 15), 1 | this.state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Returns a deterministic float in `[min, max)`. */
  range(min: number, max: number): number {
    return min + this.next() * (max - min);
  }

  /** Returns a deterministic integer in `[min, max]` (inclusive). */
  rangeInt(min: number, max: number): number {
    const lo = Math.ceil(Math.min(min, max));
    const hi = Math.floor(Math.max(min, max));
    return lo + Math.floor(this.next() * (hi - lo + 1));
  }

  /** Returns `true` with probability `probability` (default `0.5`). */
  bool(probability = 0.5): boolean {
    return this.next() < probability;
  }

  /** Returns `-1` or `+1` with equal probability. */
  sign(): -1 | 1 {
    return this.next() < 0.5 ? -1 : 1;
  }

  /** Picks a deterministic element from a non-empty readonly array. */
  pick<T>(items: readonly T[]): T {
    if (items.length === 0) {
      throw new Error('SeededRandom.pick called with empty array');
    }
    const idx = Math.floor(this.next() * items.length);
    return items[idx]!;
  }

  /** Picks a deterministic element weighted by `getWeight(item)`. */
  pickWeighted<T>(items: readonly T[], getWeight: (item: T) => number): T {
    if (items.length === 0) {
      throw new Error('SeededRandom.pickWeighted called with empty array');
    }
    let total = 0;
    for (const item of items) {
      total += Math.max(0, getWeight(item));
    }
    if (total <= 0) {
      return this.pick(items);
    }
    let threshold = this.next() * total;
    for (const item of items) {
      const w = Math.max(0, getWeight(item));
      if (threshold < w) {
        return item;
      }
      threshold -= w;
    }
    return items[items.length - 1]!;
  }

  /** Forks a child PRNG deterministically salted with `label`. */
  fork(label: string): SeededRandom {
    const childSeed = (this.nextUint32() ^ hashStringToUint32(label)) >>> 0;
    return new SeededRandom(childSeed);
  }

  /** Returns a deterministic unsigned 32-bit integer. */
  nextUint32(): number {
    return Math.floor(this.next() * 4294967296) >>> 0;
  }
}

/**
 * Hashes an arbitrary string (e.g. `"sha256:..."`) into an unsigned 32-bit integer
 * using FNV-1a followed by MurmurHash3 finalizer avalanche mixing.
 */
export function hashStringToUint32(str: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}
