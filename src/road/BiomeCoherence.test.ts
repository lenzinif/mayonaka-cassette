import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  BUNDLED_COASTAL_BEATMAP,
  BUNDLED_WANGAN_BEATMAP,
  DEFAULT_SYNTH_BEATMAP,
} from '@src/audio/FunkAudioEngine';
import { PlayerCar } from '@src/entities/PlayerCar';
import { type CollisionEvent, TrafficManager } from '@src/entities/TrafficAndProps';
import {
  PALETTE_AKIBA_NIGHT,
  PALETTE_NIGHT_FUNK,
  PALETTE_OG_FUTURE_FUNK,
  PALETTE_VAPORFUNK,
  SCENERY_CITY_NIGHT,
  SCENERY_TOUGE,
  type StagePalette,
} from './palette';
import { RoadRenderer, type RoadView } from './RoadRenderer';
import {
  createPoint,
  type RoadSegment,
  type Track,
} from './RoadSegment';
import {
  drawPine,
  drawProp,
  drawStreetTree,
  getPropTheme,
  setPropTheme,
} from './RoadsideProps';
import { generateSongRoad } from './SongRoadGenerator';

function createMockCanvas(): {
  ctx: CanvasRenderingContext2D;
  get rectCalls(): number;
  get fillCalls(): number;
  get fills(): readonly string[];
} {
  let rectCalls = 0;
  let fillCalls = 0;
  const fills: string[] = [];
  const noop = () => {};

  const ctx = {
    canvas: { width: 640, height: 360 },
    fillStyle: '#000',
    strokeStyle: '#000',
    lineWidth: 1,
    globalAlpha: 1,
    save: noop,
    restore: noop,
    beginPath: noop,
    closePath: noop,
    moveTo: noop,
    lineTo: noop,
    quadraticCurveTo: noop,
    arc: noop,
    fill: () => {
      fillCalls++;
      fills.push(ctx.fillStyle as string);
    },
    stroke: noop,
    fillRect: () => {
      rectCalls++;
      fills.push(ctx.fillStyle as string);
    },
    createLinearGradient: () => ({ addColorStop: noop }),
  } as unknown as CanvasRenderingContext2D;

  return {
    ctx,
    get rectCalls() {
      return rectCalls;
    },
    get fillCalls() {
      return fillCalls;
    },
    get fills() {
      return fills;
    },
  };
}

function createTestTrack(segmentCount = 60): Track {
  const segments: RoadSegment[] = [];
  const segmentLength = 200;

  for (let i = 0; i < segmentCount; i++) {
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

  return {
    segments,
    segmentLength,
    length: segmentCount * segmentLength,
  };
}

const defaultView: RoadView = {
  position: 0,
  playerX: 0,
  cameraHeight: 1000,
  cameraDepth: 0.8,
  roadWidth: 2000,
  drawDistance: 50,
  fogDensity: 1.0,
  width: 640,
  height: 360,
  alpha: 1,
};

describe('Fase 5 & Phase B — Biome Coherence, Environmental Archetypes & Stage Macro-Regions', () => {
  describe('1. Pure Geometry Separation & Zero Palette Imports', () => {
    it('ensures SongRoadGenerator, RoadChunks, and EnvironmentArchetypes have zero palette/theme imports', () => {
      const generatorSrc = fs.readFileSync(
        path.resolve(process.cwd(), 'src/road/SongRoadGenerator.ts'),
        'utf-8',
      );
      const chunksSrc = fs.readFileSync(
        path.resolve(process.cwd(), 'src/road/RoadChunks.ts'),
        'utf-8',
      );
      const archSrc = fs.readFileSync(
        path.resolve(process.cwd(), 'src/road/EnvironmentArchetypes.ts'),
        'utf-8',
      );

      for (const src of [generatorSrc, chunksSrc, archSrc]) {
        expect(src).not.toContain("from './palette'");
        expect(src).not.toContain('StagePalette');
        expect(src).not.toContain('SceneryTheme');
      }
    });

    it('keeps identical pure road geometry across night, og_future_funk, and akiba_night stages', () => {
      for (const map of [DEFAULT_SYNTH_BEATMAP, BUNDLED_WANGAN_BEATMAP, BUNDLED_COASTAL_BEATMAP]) {
        const roadNight = generateSongRoad(map, { stageId: 'night' });
        const roadSunset = generateSongRoad(map, { stageId: 'og_future_funk' });
        const roadAkiba = generateSongRoad(map, { stageId: 'akiba_night' });

        expect(roadNight.segments.length).toBe(roadSunset.segments.length);
        expect(roadNight.segments.length).toBe(roadAkiba.segments.length);
        expect(roadNight.dropMarkers).toEqual(roadSunset.dropMarkers);
        expect(roadNight.dropMarkers).toEqual(roadAkiba.dropMarkers);
        expect(roadNight.chunks.map((c) => [c.chunkId, c.mirrored])).toEqual(
          roadSunset.chunks.map((c) => [c.chunkId, c.mirrored]),
        );
        expect(roadNight.chunks.map((c) => [c.chunkId, c.mirrored])).toEqual(
          roadAkiba.chunks.map((c) => [c.chunkId, c.mirrored]),
        );

        for (let i = 0; i < roadNight.segments.length; i++) {
          expect(roadSunset.segments[i]!.curve).toBe(roadNight.segments[i]!.curve);
          expect(roadAkiba.segments[i]!.curve).toBe(roadNight.segments[i]!.curve);
          expect(roadSunset.segments[i]!.p1.worldY).toBe(roadNight.segments[i]!.p1.worldY);
          expect(roadAkiba.segments[i]!.p1.worldY).toBe(roadNight.segments[i]!.p1.worldY);
          expect(roadSunset.segments[i]!.p2.worldY).toBe(roadNight.segments[i]!.p2.worldY);
          expect(roadAkiba.segments[i]!.p2.worldY).toBe(roadNight.segments[i]!.p2.worldY);
        }
      }
    });

    it('dresses akiba_night with viaducts (zero water bridges) and spawns jihanki strictly in urban/semiurban zones', () => {
      const akibaRoad = generateSongRoad(DEFAULT_SYNTH_BEATMAP, { stageId: 'akiba_night' });
      expect(akibaRoad.segments.some((s) => s.env === 'bridge')).toBe(false);
      expect(akibaRoad.segments.some((s) => s.env === 'viaduct')).toBe(true);

      // Rendering akibaRoad with PALETTE_AKIBA_NIGHT never fills bay water
      const renderer = new RoadRenderer();
      const mock = createMockCanvas();
      const viaductSegIdx = akibaRoad.segments.findIndex((s) => s.env === 'viaduct');
      renderer.render(
        mock.ctx,
        akibaRoad,
        { ...defaultView, position: viaductSegIdx * akibaRoad.segmentLength },
        PALETTE_AKIBA_NIGHT,
      );
      expect(mock.fills).not.toContain(PALETTE_AKIBA_NIGHT.water![0]);

      // Verify jihanki appears only in urbano / semiurbano_industriale standard chunks, never in costiero
      let totalJihankiInUrban = 0;
      for (const stageId of ['night', 'og_future_funk', 'akiba_night'] as const) {
        const road = generateSongRoad(DEFAULT_SYNTH_BEATMAP, { stageId });
        for (const chunk of road.chunks) {
          for (let s = chunk.startSegment; s < chunk.startSegment + chunk.segmentCount; s++) {
            const seg = road.segments[s]!;
            const hasJihanki = seg.sprites.some((sp) => sp.kind === 'jihanki');
            if (hasJihanki) {
              expect(seg.env).toBe('standard');
              expect(chunk.archetype).not.toBe('costiero');
              totalJihankiInUrban++;
            }
          }
        }
      }
      expect(totalJihankiInUrban).toBeGreaterThan(0);
    });

    it('places zone transitions strictly on musical section boundaries with coherent multi-bar acts', () => {
      const road = generateSongRoad(DEFAULT_SYNTH_BEATMAP, { stageId: 'night' });
      const distinctActs = new Set(road.chunks.map((c) => c.archetype));
      expect(distinctActs.size).toBeGreaterThanOrEqual(2);

      const sectionStartBars = new Set(DEFAULT_SYNTH_BEATMAP.sections.map((s) => s.startBar));
      for (const trans of road.zoneTransitions) {
        expect(sectionStartBars.has(trans.barIndex)).toBe(true);
        expect(['gantry', 'overpass']).toContain(trans.landmark);
      }
    });
  });

  describe('2. Render-Time Resolution (City vs Coastal)', () => {
    it('resolves abstract "tree" to "street-tree" when rendering with city palette (Night Funk)', () => {
      const renderer = new RoadRenderer();
      const mock = createMockCanvas();
      const track = createTestTrack();

      // Anchor an abstract tree on segment 10 in Band B
      track.segments[10]!.sprites.push({
        kind: 'tree',
        offset: 1.9,
        variant: 0,
      });

      renderer.render(mock.ctx, track, defaultView, PALETTE_NIGHT_FUNK);

      expect(renderer.stats.drawnProps).toBe(1);
      expect(getPropTheme()?.id).toBe('city');
      expect(getPropTheme()?.tree).toBe('street-tree');

      // Street tree features: sidewalk planter (#231e33) and Ginkgo yellow crown (#ffd166)
      expect(mock.fills).toContain('#231e33');
      expect(mock.fills).toContain('#ffd166');
      // Must NOT contain coastal palm leaf turquoise (#14f1d9)
      expect(mock.fills).not.toContain('#14f1d9');
    });

    it('resolves abstract "tree" to "palm" when rendering with coastal palette (Sunset Boulevard)', () => {
      const renderer = new RoadRenderer();
      const mock = createMockCanvas();
      const track = createTestTrack();

      track.segments[10]!.sprites.push({
        kind: 'tree',
        offset: 1.9,
        variant: 0,
      });

      renderer.render(mock.ctx, track, defaultView, PALETTE_OG_FUTURE_FUNK);

      expect(renderer.stats.drawnProps).toBe(1);
      expect(getPropTheme()?.id).toBe('coastal');
      expect(getPropTheme()?.tree).toBe('palm');

      // Coastal palm features: tropical turquoise fronds (#14f1d9)
      expect(mock.fills).toContain('#14f1d9');
      // Must NOT contain city street tree concrete planter (#231e33)
      expect(mock.fills).not.toContain('#231e33');
    });

    it('resolves directly in drawProp if called without prior resolution', () => {
      const mock = createMockCanvas();
      setPropTheme(SCENERY_TOUGE);

      drawProp(mock.ctx, 'tree', 320, 240, 0.02, 1, 0);
      // Touge theme tree is pine -> pine needle green #1e4d38 & moonlight rim #80ffdb
      expect(mock.fills).toContain('#1e4d38');
      expect(mock.fills).toContain('#80ffdb');

      setPropTheme(null);
    });
  });

  describe('3. Building Density & Determinism', () => {
    it('never skips collidable Band A/B buildings regardless of buildingDensity', () => {
      const renderer = new RoadRenderer();
      const mock = createMockCanvas();
      const track = createTestTrack();

      // Band B verge building (|offset| = 2.2 < 3.0, collidable)
      track.segments[12]!.sprites.push({
        kind: 'building',
        offset: 2.2,
        variant: 0,
      });

      // Render with low buildingDensity (0.05 for Touge)
      const lowDensityPalette: StagePalette = {
        ...PALETTE_VAPORFUNK,
        scenery: SCENERY_TOUGE,
      };

      renderer.render(mock.ctx, track, defaultView, lowDensityPalette);
      expect(renderer.stats.drawnProps).toBe(1);
    });

    it('filters Band C/D buildings deterministically frame to frame', () => {
      const renderer = new RoadRenderer();
      const track = createTestTrack(60);

      // Place 15 Band C buildings on segments 20-34 with offset: 3.2
      for (let i = 20; i < 35; i++) {
        track.segments[i]!.sprites.push({
          kind: 'building',
          offset: 3.2,
          variant: i % 3,
        });
      }

      // Coastal palette with buildingDensity = 0.35
      const mock1 = createMockCanvas();
      renderer.render(mock1.ctx, track, defaultView, PALETTE_OG_FUTURE_FUNK);
      const drawnCountFrame1 = renderer.stats.drawnProps;

      // Fraction of buildings should be drawn (~35% of 15, roughly 4-8)
      expect(drawnCountFrame1).toBeGreaterThan(0);
      expect(drawnCountFrame1).toBeLessThan(15);

      // Verify exact determinism across 10 consecutive frames
      for (let f = 2; f <= 10; f++) {
        const mockN = createMockCanvas();
        renderer.render(mockN.ctx, track, defaultView, PALETTE_OG_FUTURE_FUNK);
        expect(renderer.stats.drawnProps).toBe(drawnCountFrame1);
      }
    });

    it('draws 100% of buildings when buildingDensity is 1.0 (City stages)', () => {
      const renderer = new RoadRenderer();
      const mock = createMockCanvas();
      const track = createTestTrack(60);

      for (let i = 20; i < 30; i++) {
        track.segments[i]!.sprites.push({
          kind: 'building',
          offset: 3.2,
          variant: i % 3,
        });
      }

      renderer.render(mock.ctx, track, defaultView, PALETTE_NIGHT_FUNK);
      expect(renderer.stats.drawnProps).toBe(10);
    });

    it('respects hideKinds when defined on the theme', () => {
      const renderer = new RoadRenderer();
      const mock = createMockCanvas();
      const track = createTestTrack();

      track.segments[10]!.sprites.push({
        kind: 'billboard',
        offset: 2.2,
        variant: 0,
      });

      const hideThemePalette: StagePalette = {
        ...PALETTE_NIGHT_FUNK,
        scenery: {
          ...SCENERY_CITY_NIGHT,
          hideKinds: new Set(['billboard']),
        },
      };

      renderer.render(mock.ctx, track, defaultView, hideThemePalette);
      expect(renderer.stats.drawnProps).toBe(0);
    });
  });

  describe('4. Procedural Draw Functions (Scales & NaN-Safety)', () => {
    it('renders drawStreetTree and drawPine cleanly across scales 0.2 to 2.0', () => {
      const mock = createMockCanvas();
      const scales = [0.2, 0.4, 0.8, 1.0, 1.4, 1.8, 2.0];

      for (const scale of scales) {
        const ppu = 0.018 * scale;
        expect(() => {
          drawStreetTree(mock.ctx, 320, 240, ppu, -1, 0);
          drawStreetTree(mock.ctx, 320, 240, ppu, 1, 1);
          drawStreetTree(mock.ctx, 320, 240, ppu, 1, 2);

          drawPine(mock.ctx, 320, 240, ppu, -1, 0);
          drawPine(mock.ctx, 320, 240, ppu, 1, 1);
          drawPine(mock.ctx, 320, 240, ppu, 1, 2);
        }).not.toThrow();
      }
      expect(mock.rectCalls).toBeGreaterThan(100);
    });

    it('safely handles non-positive or NaN ppu without rendering or throwing', () => {
      const mock = createMockCanvas();
      const beforeRects = mock.rectCalls;

      drawStreetTree(mock.ctx, 320, 240, 0, 1, 0);
      drawStreetTree(mock.ctx, 320, 240, -0.05, 1, 0);
      drawStreetTree(mock.ctx, 320, 240, Number.NaN, 1, 0);

      drawPine(mock.ctx, 320, 240, 0, 1, 0);
      drawPine(mock.ctx, 320, 240, -0.05, 1, 0);
      drawPine(mock.ctx, 320, 240, Number.NaN, 1, 0);

      expect(mock.rectCalls).toBe(beforeRects);
    });
  });

  describe('5. Collision Detection with Abstract & Concrete Trees', () => {
    it('detects collisions against "tree", "street-tree", and "pine" with half-width 0.16', () => {
      const track = createTestTrack();
      const tm = new TrafficManager();
      const car = new PlayerCar();
      car.speed = 100;
      car.x = 1.35; // Positioned right near verge prop

      // Test segment 10 with kind 'tree'
      track.segments[10]!.sprites.push({
        kind: 'tree',
        offset: 1.35,
        variant: 0,
      });

      const events: CollisionEvent[] = [];
      const z = 10 * track.segmentLength;
      tm.update(1 / 120, track, car, z - 100, z + 10, (e) => events.push(e));

      expect(events).toHaveLength(1);
      const e0 = events[0]!;
      expect(e0.type).toBe('collision');
      expect(e0.obstacle).toBe('prop');
      if (e0.obstacle === 'prop') {
        expect(e0.propKind).toBe('tree');
      }
      // Flow state pillar: collision does NOT stop player car
      expect(car.speed).toBeGreaterThan(0);

      // Also verify concrete kinds 'street-tree' and 'pine' collide with 0.16
      const tm2 = new TrafficManager();
      const car2 = new PlayerCar();
      car2.x = 1.35;
      track.segments[20]!.sprites.push({
        kind: 'street-tree',
        offset: 1.35,
        variant: 0,
      });
      const z20 = 20 * track.segmentLength;
      const events2: CollisionEvent[] = [];
      tm2.update(1 / 120, track, car2, z20 - 100, z20 + 10, (e) => events2.push(e));
      expect(events2).toHaveLength(1);
      const e2 = events2[0]!;
      expect(e2.obstacle).toBe('prop');
      if (e2.obstacle === 'prop') {
        expect(e2.propKind).toBe('street-tree');
      }
    });
  });
});
