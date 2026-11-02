import { describe, expect, it } from 'vitest';
import { hashStringToUint32, SeededRandom } from './SeededRandom';

describe('SeededRandom', () => {
  it('produces identical sequences for the same string or numeric seed', () => {
    const a = new SeededRandom('sha256:9f86d081884c7d659a2feaa0c55ad015');
    const b = new SeededRandom('sha256:9f86d081884c7d659a2feaa0c55ad015');

    for (let i = 0; i < 50; i++) {
      expect(a.next()).toBe(b.next());
    }
  });

  it('produces distinct sequences for different seeds', () => {
    const a = new SeededRandom('sha256:track-a');
    const b = new SeededRandom('sha256:track-b');

    const seqA = Array.from({ length: 8 }, () => a.next());
    const seqB = Array.from({ length: 8 }, () => b.next());
    expect(seqA).not.toEqual(seqB);
    expect(hashStringToUint32('sha256:track-a')).not.toBe(hashStringToUint32('sha256:track-b'));
  });

  it('respects bounds in range, rangeInt, pick, and pickWeighted', () => {
    const rng = new SeededRandom(42);
    for (let i = 0; i < 100; i++) {
      const f = rng.range(-5, 10);
      expect(f).toBeGreaterThanOrEqual(-5);
      expect(f).toBeLessThan(10);

      const n = rng.rangeInt(3, 7);
      expect(Number.isInteger(n)).toBe(true);
      expect(n).toBeGreaterThanOrEqual(3);
      expect(n).toBeLessThanOrEqual(7);
    }

    const items = ['alpha', 'beta', 'gamma'] as const;
    for (let i = 0; i < 20; i++) {
      expect(items).toContain(rng.pick(items));
    }

    const weighted = [
      { id: 'never', weight: 0 },
      { id: 'always', weight: 10 },
    ] as const;
    for (let i = 0; i < 20; i++) {
      expect(rng.pickWeighted(weighted, (x) => x.weight).id).toBe('always');
    }
  });

  it('forks independent deterministic child generators', () => {
    const root1 = new SeededRandom('sha256:root');
    const root2 = new SeededRandom('sha256:root');

    const child1A = root1.fork('props');
    const child1B = root1.fork('curves');
    const child2A = root2.fork('props');

    expect(child1A.next()).toBe(child2A.next());
    expect(child1A.next()).not.toBe(child1B.next());
  });
});
