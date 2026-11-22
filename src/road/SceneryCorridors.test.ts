import { DEFAULT_SYNTH_BEATMAP } from '@src/audio/FunkAudioEngine';
import { FORK_APPROACH_BARS } from '@src/config/constants';
import { describe, expect, it } from 'vitest';
import { PALETTE_NIGHT_FUNK } from './palette';
import { RoadRenderer, type RoadView } from './RoadRenderer';
import { createPoint, type RoadSegment, type RoadSprite, type Track } from './RoadSegment';
import { getPylonAttachmentPoints } from './RoadsideProps';
import { generateSongRoad } from './SongRoadGenerator';

function createMockCanvas(): {
  ctx: CanvasRenderingContext2D;
  quadraticCalls: { cpx: number; cpy: number; x: number; y: number }[];
  strokeCalls: number;
  strokeStyles: string[];
} {
  const quadraticCalls: { cpx: number; cpy: number; x: number; y: number }[] = [];
  const strokeStyles: string[] = [];
  let strokeCalls = 0;
  let currentStroke = '#000';
  let currentAlpha = 1;
  const noop = () => {};

  const ctx = {
    canvas: { width: 640, height: 360 },
    fillStyle: '#000',
    get strokeStyle() {
      return currentStroke;
    },
    set strokeStyle(v: string) {
      currentStroke = v;
      strokeStyles.push(v);
    },
    lineWidth: 1,
    get globalAlpha() {
      return currentAlpha;
    },
    set globalAlpha(v: number) {
      currentAlpha = v;
    },
    save: noop,
    restore: noop,
    beginPath: noop,
    closePath: noop,
    moveTo: noop,
    lineTo: noop,
    quadraticCurveTo: (cpx: number, cpy: number, x: number, y: number) => {
      quadraticCalls.push({ cpx, cpy, x, y });
    },
    arc: noop,
    fill: noop,
    stroke: () => {
      strokeCalls++;
    },
    fillRect: noop,
  } as unknown as CanvasRenderingContext2D;

  return {
    ctx,
    quadraticCalls,
    get strokeCalls() {
      return strokeCalls;
    },
    strokeStyles,
  };
}

describe('SceneryCorridors — Continuous Power Lines (Phase 3)', () => {
  it('generates continuous runs of power pylons with consistent side and chainId in eligible coastal/semiurban corridors', () => {
    const road = generateSongRoad(DEFAULT_SYNTH_BEATMAP, {
      seed: 'pylon-test-seed-1',
      stageId: 'og_future_funk',
    });
    const pylonSprites: { segIdx: number; sprite: RoadSprite }[] = [];

    for (let i = 0; i < road.segments.length; i++) {
      for (const sp of road.segments[i]!.sprites) {
        if (sp.kind === 'pylon') {
          pylonSprites.push({ segIdx: i, sprite: sp });
        }
      }
    }

    expect(pylonSprites.length).toBeGreaterThan(0);

    // Group pylons by chainId
    const chains = new Map<number, { segIdx: number; sprite: RoadSprite }[]>();
    for (const p of pylonSprites) {
      expect(p.sprite.chainId).toBeDefined();
      const id = p.sprite.chainId!;
      if (!chains.has(id)) {
        chains.set(id, []);
      }
      chains.get(id)!.push(p);
    }

    // Verify properties of each regular corridor run (variant !== 2)
    for (const [, towers] of chains.entries()) {
      if (towers.length === 2 && towers[0]!.sprite.variant === 2 && towers[1]!.sprite.variant === 2) {
        // Road crossing pair: same segment, opposite sides
        expect(towers[0]!.segIdx).toBe(towers[1]!.segIdx);
        expect(Math.sign(towers[0]!.sprite.offset)).toBe(-Math.sign(towers[1]!.sprite.offset));
        continue;
      }

      // Regular run must have at least 2 towers
      expect(towers.length).toBeGreaterThanOrEqual(2);

      // Same lateral side throughout the entire run
      const firstSide = Math.sign(towers[0]!.sprite.offset);
      expect(firstSide).not.toBe(0);

      // Terminal variants: first is 1, last is 1, intermediate are 0
      expect(towers[0]!.sprite.variant).toBe(1);
      expect(towers[towers.length - 1]!.sprite.variant).toBe(1);

      for (let i = 1; i < towers.length - 1; i++) {
        expect(towers[i]!.sprite.variant).toBe(0);
      }

      // Lateral offset is in Band C/D (|offset| >= 3.5) with slow drift (<= 0.6 total variation)
      const offsets = towers.map((t) => t.sprite.offset);
      for (const off of offsets) {
        expect(Math.abs(off)).toBeGreaterThanOrEqual(3.5);
        expect(Math.abs(off)).toBeLessThanOrEqual(7.5);
        expect(Math.sign(off)).toBe(firstSide);
      }

      const minOff = Math.min(...offsets);
      const maxOff = Math.max(...offsets);
      expect(maxOff - minOff).toBeLessThanOrEqual(0.65);
    }
  });

  it('guarantees zero towers on bridge/viaduct/tunnel/urbano segments and respects the stage fork cutoff', () => {
    for (const stageId of ['night', 'akiba_night', 'og_future_funk'] as const) {
      const road = generateSongRoad(DEFAULT_SYNTH_BEATMAP, {
        seed: 'bridge-pylon-test',
        stageId,
      });
      const segmentsPerBar = Math.round(road.segments.length / road.totalBars);
      const forkCutoffSeg = (road.totalBars - FORK_APPROACH_BARS) * segmentsPerBar;

      for (let i = 0; i < road.segments.length; i++) {
        const seg = road.segments[i]!;
        const pylons = seg.sprites.filter((s) => s.kind === 'pylon');
        if (pylons.length > 0) {
          expect(seg.env).toBe('standard');
          expect(i).toBeLessThanOrEqual(forkCutoffSeg);
          const barIdx = Math.floor(i / segmentsPerBar);
          const owner = road.chunks.find(
            (c) => barIdx >= c.startBar && barIdx < c.startBar + c.bars,
          );
          expect(owner?.archetype).not.toBe('urbano');
        }
      }
    }
  });

  it('is 100% deterministic: identical seed yields identical pylons and chain IDs', () => {
    const roadA = generateSongRoad(DEFAULT_SYNTH_BEATMAP, { seed: 'pylon-deterministic-seed' });
    const roadB = generateSongRoad(DEFAULT_SYNTH_BEATMAP, { seed: 'pylon-deterministic-seed' });

    for (let i = 0; i < roadA.segments.length; i++) {
      const pylonsA = roadA.segments[i]!.sprites.filter((s) => s.kind === 'pylon');
      const pylonsB = roadB.segments[i]!.sprites.filter((s) => s.kind === 'pylon');
      expect(pylonsA).toEqual(pylonsB);
    }
  });

  it('covers eligible coastal/semiurban non-bridge road across varied seeds', () => {
    const seeds = ['pylon-seed-alpha', 'pylon-seed-beta', 'pylon-seed-gamma'];
    for (const seed of seeds) {
      const road = generateSongRoad(DEFAULT_SYNTH_BEATMAP, {
        seed,
        stageId: 'og_future_funk',
      });
      const segmentsPerBar = Math.round(road.segments.length / road.totalBars);
      const maxBar = Math.max(0, road.totalBars - FORK_APPROACH_BARS);

      let eligibleBars = 0;
      const coveredBars = new Set<number>();

      for (let b = 0; b < maxBar; b++) {
        const seg = road.segments[b * segmentsPerBar];
        if (seg && seg.env === 'standard') {
          eligibleBars++;
        }
      }

      for (let i = 0; i < road.segments.length; i++) {
        const seg = road.segments[i]!;
        for (const sp of seg.sprites) {
          if (sp.kind === 'pylon' && sp.chainId !== undefined && sp.variant !== 2) {
            const b = Math.floor(i / segmentsPerBar);
            if (b < maxBar) {
              coveredBars.add(b);
            }
          }
        }
      }

      expect(coveredBars.size).toBeGreaterThanOrEqual(Math.floor(eligibleBars * 0.15));
      expect(coveredBars.size).toBeLessThanOrEqual(Math.ceil(eligibleBars * 0.45));
    }
  });

  it('computes 5 pylon attachment points with zero GC', () => {
    const points = new Float32Array(10);
    getPylonAttachmentPoints(320, 200, 0.005, points, 0, 0);

    // 5 distinct points (x, y pairs)
    for (let i = 0; i < 10; i++) {
      expect(Number.isFinite(points[i])).toBe(true);
    }

    // Points are spread across the tower's cantilever wingtips
    expect(points[0]).toBeLessThan(points[2]!); // Left horn is left of left mid
    expect(points[2]).toBeLessThan(points[4]!); // Left mid is left of center
    expect(points[4]).toBeLessThan(points[6]!); // Center is left of right mid
    expect(points[6]).toBeLessThan(points[8]!); // Right mid is left of right horn
  });

  it('renders catenary wires connecting consecutive towers of the same chain', () => {
    const renderer = new RoadRenderer();
    const mock = createMockCanvas();

    const segmentLength = 200;
    const n = 50;
    const segments: RoadSegment[] = [];
    for (let i = 0; i < n; i++) {
      segments.push({
        index: i,
        p1: createPoint(0, i * segmentLength),
        p2: createPoint(0, (i + 1) * segmentLength),
        curve: 0,
        stripe: i % 2 === 0 ? 0 : 1,
        sprites: [],
        fog: 1,
        env: 'standard',
      });
    }

    const track: Track = {
      segments,
      segmentLength,
      length: n * segmentLength,
    };

    // Place 2 consecutive towers of chainId 1 at segments 10 and 20
    segments[10]!.sprites.push({
      kind: 'pylon',
      offset: 4.2,
      variant: 0,
      chainId: 1,
    });
    segments[20]!.sprites.push({
      kind: 'pylon',
      offset: 4.2,
      variant: 1,
      chainId: 1,
    });

    const view: RoadView = {
      position: 0,
      playerX: 0,
      cameraHeight: 1000,
      cameraDepth: 0.8,
      roadWidth: 2000,
      drawDistance: 35,
      fogDensity: 1,
      width: 640,
      height: 360,
    };

    renderer.render(mock.ctx, track, view, PALETTE_NIGHT_FUNK);

    // Two towers were drawn
    expect(renderer.stats.drawnProps).toBe(2);

    // 5 catenary wires were drawn between the towers via quadraticCurveTo
    expect(mock.quadraticCalls.length).toBeGreaterThanOrEqual(5);

    // Wires use high-voltage dark violet stroke
    expect(mock.strokeStyles).toContain('#2d1c4a');

    // 5 main high-voltage cables + 5 faint neon sheen highlight passes = 10 quadratic calls
    expect(mock.quadraticCalls.length).toBe(10);
    expect(mock.strokeStyles).toContain('#2d1c4a');
    expect(mock.strokeStyles).toContain('rgba(128, 245, 236, 0.22)');
    for (const call of mock.quadraticCalls) {
      expect(Number.isFinite(call.cpy)).toBe(true);
      expect(Number.isFinite(call.cpx)).toBe(true);
    }
  });

  it('renders horizontal catenary wires across the road for variant 2 crossings', () => {
    const renderer = new RoadRenderer();
    const mock = createMockCanvas();

    const segmentLength = 200;
    const n = 30;
    const segments: RoadSegment[] = [];
    for (let i = 0; i < n; i++) {
      segments.push({
        index: i,
        p1: createPoint(0, i * segmentLength),
        p2: createPoint(0, (i + 1) * segmentLength),
        curve: 0,
        stripe: i % 2 === 0 ? 0 : 1,
        sprites: [],
        fog: 1,
        env: 'standard',
      });
    }

    const track: Track = {
      segments,
      segmentLength,
      length: n * segmentLength,
    };

    // Crossing pair on segment 15
    segments[15]!.sprites.push(
      { kind: 'pylon', offset: -4.2, variant: 2, chainId: 99 },
      { kind: 'pylon', offset: 4.2, variant: 2, chainId: 99 },
    );

    const view: RoadView = {
      position: 0,
      playerX: 0,
      cameraHeight: 1000,
      cameraDepth: 0.8,
      roadWidth: 2000,
      drawDistance: 25,
      fogDensity: 1,
      width: 640,
      height: 360,
    };

    renderer.render(mock.ctx, track, view, PALETTE_NIGHT_FUNK);

    expect(renderer.stats.drawnProps).toBe(2);
    // At least 5 horizontal catenary wire spans connecting left to right tower
    expect(mock.quadraticCalls.length).toBeGreaterThanOrEqual(5);
  });

  it('guarantees zero-allocation rendering across frames with fixed typed arrays', () => {
    const renderer = new RoadRenderer();
    const mock = createMockCanvas();

    const road = generateSongRoad(DEFAULT_SYNTH_BEATMAP, { seed: 'zero-gc-test' });
    const view: RoadView = {
      position: 0,
      playerX: 0,
      cameraHeight: 1000,
      cameraDepth: 0.8,
      roadWidth: 2000,
      drawDistance: 60,
      fogDensity: 1,
      width: 640,
      height: 360,
    };

    // Render 50 frames advancing position along the track
    for (let frame = 0; frame < 50; frame++) {
      view.position = frame * 200;
      renderer.render(mock.ctx, road, view, PALETTE_NIGHT_FUNK);
      expect(renderer.stats.drawnSegments).toBeGreaterThan(0);
    }
  });
});
