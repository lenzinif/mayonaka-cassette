import { describe, expect, it } from 'vitest';
import type { BeatMap } from '@src/audio/BeatMap';
import { SeededRandom } from '@src/core/SeededRandom';
import { createPoint, type PropKind, type RoadSegment } from './RoadSegment';
import { drawProp } from './RoadsideProps';
import { generateSongRoad } from './SongRoadGenerator';
import {
  isConflictingVignetteProp,
  placeVignette,
  VIGNETTE_PREFABS,
  type VignetteId,
} from './Vignettes';

function createMockSegments(count: number): RoadSegment[] {
  const segments: RoadSegment[] = [];
  for (let i = 0; i < count; i++) {
    segments.push({
      index: i,
      p1: createPoint(0, i * 200),
      p2: createPoint(0, (i + 1) * 200),
      curve: 0,
      stripe: i % 2 === 0 ? 0 : 1,
      sprites: [],
      fog: 1,
      env: 'standard',
    });
  }
  return segments;
}

function createMockContext(): CanvasRenderingContext2D {
  const noop = () => {};
  return {
    canvas: { width: 640, height: 360 },
    fillStyle: '#000',
    fillRect: noop,
    beginPath: noop,
    closePath: noop,
    moveTo: noop,
    lineTo: noop,
    fill: noop,
    stroke: noop,
  } as unknown as CanvasRenderingContext2D;
}

const mockBeatMap: BeatMap = {
  version: 1,
  title: 'Test Vignette Run',
  artist: 'Mayonaka',
  contentHash: 'vignette-hash-12345',
  durationSec: 120,
  bpm: 120,
  firstBeatOffsetSec: 0.1,
  beatsPerBar: 4,
  sections: [
    { startBar: 0, bars: 12, role: 'intro' },
    { startBar: 12, bars: 16, role: 'build' },
    { startBar: 28, bars: 16, role: 'drop' },
    { startBar: 44, bars: 16, role: 'outro' },
  ],
  barEnergy: new Array(60).fill(0.6),
  confidence: { tempo: 0.95, downbeat: 0.9, tempoStable: true },
  source: 'manual',
};

describe('Composite Vignettes (Vignettes.ts)', () => {
  const vignetteIds: readonly VignetteId[] = [
    'jihanki-corner',
    'bus-stop',
    'parking-area',
    'shrine-gate',
  ];

  it('defines all 4 required canonical prefabs with valid members', () => {
    for (const id of vignetteIds) {
      const prefab = VIGNETTE_PREFABS[id];
      expect(prefab).toBeDefined();
      expect(prefab.id).toBe(id);
      expect(prefab.members.length).toBeGreaterThanOrEqual(4);
      expect(prefab.baseOffset).toBeGreaterThanOrEqual(1.8);
    }
  });

  it('places vignettes deterministically for the same seed', () => {
    const segsA = createMockSegments(30);
    const segsB = createMockSegments(30);

    const prefab = VIGNETTE_PREFABS['jihanki-corner'];
    placeVignette(segsA, 10, 'right', prefab.baseOffset, prefab, new SeededRandom('fixed-seed'));
    placeVignette(segsB, 10, 'right', prefab.baseOffset, prefab, new SeededRandom('fixed-seed'));

    expect(segsA[10]!.sprites.length).toBe(segsB[10]!.sprites.length);
    for (let i = 0; i < 30; i++) {
      expect(segsA[i]!.sprites).toEqual(segsB[i]!.sprites);
    }
  });

  it('mirrors offsets correctly by side (outward positive)', () => {
    const segsRight = createMockSegments(30);
    const segsLeft = createMockSegments(30);

    const prefab = VIGNETTE_PREFABS['bus-stop'];
    placeVignette(segsRight, 10, 'right', 2.0, prefab, new SeededRandom('seed-1'));
    placeVignette(segsLeft, 10, 'left', 2.0, prefab, new SeededRandom('seed-1'));

    for (let i = 0; i < 30; i++) {
      const spR = segsRight[i]!.sprites;
      const spL = segsLeft[i]!.sprites;
      expect(spR.length).toBe(spL.length);
      for (let j = 0; j < spR.length; j++) {
        expect(spR[j]!.kind).toBe(spL[j]!.kind);
        expect(spR[j]!.offset).toBeGreaterThan(0);
        expect(spL[j]!.offset).toBeLessThan(0);
        expect(Math.abs(spR[j]!.offset)).toBeCloseTo(Math.abs(spL[j]!.offset), 5);
      }
    }
  });

  it('ensures every jihanki in prefabs has another vignette member within ±6 segments on the same side', () => {
    for (const id of vignetteIds) {
      const prefab = VIGNETTE_PREFABS[id];
      const jihankiMembers = prefab.members.filter((m) => m.kind === 'jihanki');
      if (jihankiMembers.length === 0) continue;

      for (const jm of jihankiMembers) {
        const neighbors = prefab.members.filter(
          (m) => m !== jm && Math.abs(m.dSeg - jm.dSeg) <= 6,
        );
        expect(neighbors.length).toBeGreaterThanOrEqual(1);
      }
    }
  });

  it('clears conflicting non-rhythmic B/C sprites on the same side within the vignette window, preserving infrastructure', () => {
    const segs = createMockSegments(25);
    // Add conflicting sprites
    segs[10]!.sprites.push({ kind: 'shrub', offset: 2.2, variant: 0 });
    segs[11]!.sprites.push({ kind: 'billboard', offset: 2.4, variant: 1 });
    segs[10]!.sprites.push({ kind: 'shrub', offset: -2.2, variant: 0 }); // opposite side

    // Add infrastructure that must be preserved
    segs[9]!.sprites.push({ kind: 'lamp', offset: 1.25, variant: 0 });
    segs[12]!.sprites.push({ kind: 'pylon', offset: 4.5, variant: 0 });
    segs[11]!.sprites.push({ kind: 'chevron', offset: 1.3, variant: 0 });

    const prefab = VIGNETTE_PREFABS['jihanki-corner'];
    placeVignette(segs, 10, 'right', prefab.baseOffset, prefab, new SeededRandom('clean-test'));

    // Check segment 10: right-side shrub removed, opposite-side shrub preserved
    const oppShrub = segs[10]!.sprites.find((s) => s.kind === 'shrub' && s.offset < 0);
    expect(oppShrub).toBeDefined();
    const sameShrub = segs[10]!.sprites.find((s) => s.kind === 'shrub' && s.offset > 0);
    expect(sameShrub).toBeUndefined();

    // Check infrastructure preserved
    const lamp = segs[9]!.sprites.find((s) => s.kind === 'lamp');
    expect(lamp).toBeDefined();
    const chevron = segs[11]!.sprites.find((s) => s.kind === 'chevron');
    expect(chevron).toBeDefined();
    const pylon = segs[12]!.sprites.find((s) => s.kind === 'pylon');
    expect(pylon).toBeDefined();
  });

  it('isConflictingVignetteProp distinguishes non-rhythmic greenery/buildings from infrastructure', () => {
    expect(isConflictingVignetteProp({ kind: 'shrub', offset: 2.0, variant: 0 }, 1)).toBe(true);
    expect(isConflictingVignetteProp({ kind: 'palm', offset: 2.5, variant: 0 }, 1)).toBe(true);
    expect(isConflictingVignetteProp({ kind: 'building', offset: 4.0, variant: 0 }, 1)).toBe(true);
    expect(isConflictingVignetteProp({ kind: 'billboard', offset: 2.2, variant: 0 }, 1)).toBe(true);

    // Opposite side: not conflicting
    expect(isConflictingVignetteProp({ kind: 'shrub', offset: -2.0, variant: 0 }, 1)).toBe(false);

    // Infrastructure: never conflicting
    expect(isConflictingVignetteProp({ kind: 'lamp', offset: 1.25, variant: 0 }, 1)).toBe(false);
    expect(isConflictingVignetteProp({ kind: 'chevron', offset: 1.3, variant: 0 }, 1)).toBe(false);
    expect(isConflictingVignetteProp({ kind: 'pylon', offset: 4.5, variant: 0 }, 1)).toBe(false);
    expect(isConflictingVignetteProp({ kind: 'gantry', offset: 0, variant: 0 }, 1)).toBe(false);
  });

  it('renders all 6 new prop kinds cleanly across scales 0.2 to 2.0 without throwing', () => {
    const ctx = createMockContext();
    const newKinds: readonly PropKind[] = [
      'kiosk',
      'bench',
      'bus-stop',
      'canopy',
      'torii',
      'toro',
    ];

    const testScales = [0.2, 0.5, 1.0, 1.5, 2.0];
    const testPpus = [0.002, 0.008, 0.015, 0.035];

    for (const kind of newKinds) {
      for (const scale of testScales) {
        for (const ppu of testPpus) {
          expect(() => {
            drawProp(ctx, kind, 320, 240, ppu * scale, 1, 0);
            drawProp(ctx, kind, 320, 240, ppu * scale, -1, 1);
          }).not.toThrow();
        }
      }
    }
  });

  describe('SongRoadGenerator Integration', () => {
    it('generates road deterministically with composite vignettes', () => {
      const road1 = generateSongRoad(mockBeatMap, { seed: 'vignette-seed-42' });
      const road2 = generateSongRoad(mockBeatMap, { seed: 'vignette-seed-42' });

      expect(road1.segments.length).toBe(road2.segments.length);

      let vignettePropCount1 = 0;
      let vignettePropCount2 = 0;

      for (let i = 0; i < road1.segments.length; i++) {
        const s1 = road1.segments[i]!;
        const s2 = road2.segments[i]!;

        for (const sp of s1.sprites) {
          if (
            sp.kind === 'kiosk' ||
            sp.kind === 'bench' ||
            sp.kind === 'bus-stop' ||
            sp.kind === 'canopy' ||
            sp.kind === 'torii' ||
            sp.kind === 'toro'
          ) {
            vignettePropCount1++;
          }
        }
        for (const sp of s2.sprites) {
          if (
            sp.kind === 'kiosk' ||
            sp.kind === 'bench' ||
            sp.kind === 'bus-stop' ||
            sp.kind === 'canopy' ||
            sp.kind === 'torii' ||
            sp.kind === 'toro'
          ) {
            vignettePropCount2++;
          }
        }

        expect(s1.sprites).toEqual(s2.sprites);
      }

      expect(vignettePropCount1).toBeGreaterThan(0);
      expect(vignettePropCount1).toBe(vignettePropCount2);
    });

    it('ensures jihanki only appear inside vignettes (never isolated: within ±6 segments of another member on the same side)', () => {
      const seeds = ['test-seed-a', 'test-seed-b', 'test-seed-c', 'wangan-seed-99'];

      for (const seed of seeds) {
        const road = generateSongRoad(mockBeatMap, { seed });

        for (let i = 0; i < road.segments.length; i++) {
          const seg = road.segments[i]!;
          for (const sp of seg.sprites) {
            if (sp.kind !== 'jihanki') continue;

            const spSideSign = sp.offset > 0 ? 1 : -1;
            // Find another vignette member within ±6 segments on the same side
            let foundCompanion = false;
            const startS = Math.max(0, i - 6);
            const endS = Math.min(road.segments.length - 1, i + 6);

            for (let s = startS; s <= endS; s++) {
              for (const other of road.segments[s]!.sprites) {
                if (s === i && other === sp) continue;
                if (other.offset * spSideSign <= 0) continue; // must be on same side
                // Vignette member kinds that companion a jihanki
                if (
                  other.kind === 'jihanki' ||
                  other.kind === 'kiosk' ||
                  other.kind === 'bench' ||
                  other.kind === 'phonebooth' ||
                  other.kind === 'bus-stop' ||
                  other.kind === 'canopy' ||
                  other.kind === 'lamp' ||
                  other.kind === 'shrub'
                ) {
                  foundCompanion = true;
                  break;
                }
              }
              if (foundCompanion) break;
            }

            expect(foundCompanion).toBe(true);
          }
        }
      }
    });

    it('never places vignettes on bridge chunks or bridge segments', () => {
      const seeds = ['bridge-test-1', 'bridge-test-2', 'bridge-test-3'];

      for (const seed of seeds) {
        const road = generateSongRoad(mockBeatMap, { seed });

        for (const seg of road.segments) {
          if (seg.env !== 'bridge') continue;

          for (const sp of seg.sprites) {
            expect(sp.kind).not.toBe('kiosk');
            expect(sp.kind).not.toBe('bench');
            expect(sp.kind).not.toBe('bus-stop');
            expect(sp.kind).not.toBe('canopy');
            expect(sp.kind).not.toBe('torii');
            expect(sp.kind).not.toBe('toro');
            expect(sp.kind).not.toBe('jihanki');
          }
        }
      }
    });

    it('obeys spacing rules: no two consecutive chunks contain vignettes', () => {
      const road = generateSongRoad(mockBeatMap, { seed: 'spacing-seed-77' });
      const segsPerBar = Math.round(road.segments.length / mockBeatMap.barEnergy.length);

      // Track bars where distinct vignette anchor props (kiosk, bus-stop, canopy, torii) appear
      const vignetteBars: number[] = [];
      for (let i = 0; i < road.segments.length; i++) {
        const seg = road.segments[i]!;
        for (const sp of seg.sprites) {
          if (
            sp.kind === 'kiosk' ||
            sp.kind === 'bus-stop' ||
            sp.kind === 'canopy' ||
            sp.kind === 'torii'
          ) {
            const bar = Math.floor(i / segsPerBar);
            if (!vignetteBars.includes(bar)) {
              vignetteBars.push(bar);
            }
          }
        }
      }

      // Check distance between consecutive vignette bars (at least 8 bars)
      for (let i = 1; i < vignetteBars.length; i++) {
        const diff = vignetteBars[i]! - vignetteBars[i - 1]!;
        expect(diff).toBeGreaterThanOrEqual(8);
      }
    });

    it('never places vignettes where a pylon sits within ±2 segments on the same side', () => {
      const seeds = ['pylon-check-1', 'pylon-check-2', 'pylon-check-3'];

      for (const seed of seeds) {
        const road = generateSongRoad(mockBeatMap, { seed });

        for (let i = 0; i < road.segments.length; i++) {
          const seg = road.segments[i]!;
          for (const sp of seg.sprites) {
            if (
              sp.kind !== 'kiosk' &&
              sp.kind !== 'bus-stop' &&
              sp.kind !== 'canopy' &&
              sp.kind !== 'torii'
            ) {
              continue;
            }

            const vignetteSide = sp.offset > 0 ? 1 : -1;
            const startS = Math.max(0, i - 2);
            const endS = Math.min(road.segments.length - 1, i + 2);

            for (let s = startS; s <= endS; s++) {
              for (const checkSp of road.segments[s]!.sprites) {
                if (checkSp.kind === 'pylon') {
                  const pylonSide = checkSp.offset > 0 ? 1 : -1;
                  expect(pylonSide).not.toBe(vignetteSide);
                }
              }
            }
          }
        }
      }
    });
  });
});
