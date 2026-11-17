/**
 * Asset preloader and registry for Mayonaka Cassette (AGENTS.md §5 M8).
 * Pure TypeScript core: ZERO React imports (enforced via ESLint).
 *
 * Pre-fetches sprite atlas assets, companion BeatMap JSONs, and warms up the Web Audio
 * procedural funk loop, reporting detailed progress and falling back gracefully to
 * procedural canvas greybox rendering (Design Pillar Rule 4) on any network or decode failure.
 */

import { BUNDLED_BEATMAPS, getOrSynthesizeFutureFunkLoopPcm } from '@src/audio/FunkAudioEngine';
import { PALETTE_NIGHT_FUNK } from '@src/road/palette';
import { RoadRenderer } from '@src/road/RoadRenderer';
import { drawProp } from '@src/road/RoadsideProps';
import { createPoint, type PropKind, type Track } from '@src/road/RoadSegment';

const DETECTED_HARDWARE_SAMPLE_RATE = 48000;
let bridgeRenderersWarmedUp = false;

export type AssetKind = 'image' | 'json' | 'synth';

export interface AssetDescriptor {
  readonly id: string;
  readonly kind: AssetKind;
  readonly url?: string;
  readonly critical?: boolean;
}

export interface PreloadProgress {
  loaded: number;
  total: number;
  percent: number;
  currentAssetId: string;
  failed: number;
}

export interface PreloadSummary {
  success: boolean;
  loadedCount: number;
  failedCount: number;
  totalTimeMs: number;
}

export function resolveAssetUrl(path: string): string {
  const base =
    typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.BASE_URL
      ? import.meta.env.BASE_URL
      : './';
  const cleanBase = base.endsWith('/') ? base : `${base}/`;
  const cleanPath = path.startsWith('/') ? path.slice(1) : path;
  return `${cleanBase}${cleanPath}`;
}

export const DEFAULT_ASSET_MANIFEST: readonly AssetDescriptor[] = [
  {
    id: 'sprite-atlas',
    kind: 'image',
    url: resolveAssetUrl('sprites/sprite-atlas.svg'),
    critical: false,
  },
  {
    id: 'beatmap-neon-horizon',
    kind: 'json',
    url: resolveAssetUrl('audio/neon-horizon.beatmap.json'),
    critical: false,
  },
  {
    id: 'beatmap-midnight-wangan',
    kind: 'json',
    url: resolveAssetUrl('audio/midnight-wangan.beatmap.json'),
    critical: false,
  },
  {
    id: 'beatmap-melon-soda-sunset',
    kind: 'json',
    url: resolveAssetUrl('audio/melon-soda-sunset.beatmap.json'),
    critical: false,
  },
  {
    id: 'synth-loop-warmup',
    kind: 'synth',
    critical: false,
  },
] as const;

export class AssetPreloader {
  private readonly images = new Map<string, HTMLImageElement>();
  private readonly jsonCache = new Map<string, unknown>();
  private readonly manifest: readonly AssetDescriptor[];

  private isReady = false;
  private currentProgressState: PreloadProgress = {
    loaded: 0,
    total: 0,
    percent: 0,
    currentAssetId: '',
    failed: 0,
  };

  constructor(manifest: readonly AssetDescriptor[] = DEFAULT_ASSET_MANIFEST) {
    this.manifest = manifest;
    this.currentProgressState.total = manifest.length;
  }

  get ready(): boolean {
    return this.isReady;
  }

  get progress(): Readonly<PreloadProgress> {
    return this.currentProgressState;
  }

  getImage(id: string): HTMLImageElement | null {
    return this.images.get(id) ?? null;
  }

  getJson<T = unknown>(id: string): T | null {
    return (this.jsonCache.get(id) as T) ?? null;
  }

  /**
   * Preloads all assets sequentially or in parallel batches with progress notification.
   * Guarantees resolution: failures log a warning and proceed so the game never hangs.
   */
  async preloadAll(onProgress?: (progress: PreloadProgress) => void): Promise<PreloadSummary> {
    const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now();
    let loaded = 0;
    let failed = 0;
    const total = this.manifest.length;

    this.currentProgressState = {
      loaded: 0,
      total,
      percent: 0,
      currentAssetId: total > 0 ? this.manifest[0]!.id : '',
      failed: 0,
    };
    onProgress?.({ ...this.currentProgressState });

    for (const item of this.manifest) {
      this.currentProgressState.currentAssetId = item.id;
      onProgress?.({ ...this.currentProgressState });

      try {
        if (item.kind === 'image' && item.url) {
          const img = await this.loadImage(item.url);
          if (img) this.images.set(item.id, img);
        } else if (item.kind === 'json' && item.url) {
          const data = await this.loadJson(item.url);
          if (data !== null) this.jsonCache.set(item.id, data);
        } else if (item.kind === 'synth') {
          // Warm-up check: simulate or trigger lightweight synth memory allocation
          await this.warmupSynth();
        }
        loaded++;
      } catch (err) {
        failed++;
        console.warn(`[AssetPreloader] Non-critical asset "${item.id}" failed to load, falling back to procedural greybox:`, err);
      }

      this.currentProgressState.loaded = loaded;
      this.currentProgressState.failed = failed;
      this.currentProgressState.percent = Math.round((loaded / Math.max(1, total)) * 100);
      onProgress?.({ ...this.currentProgressState });
    }

    this.isReady = true;
    const t1 = typeof performance !== 'undefined' ? performance.now() : Date.now();

    return {
      success: failed === 0,
      loadedCount: loaded,
      failedCount: failed,
      totalTimeMs: Math.round((t1 - t0) * 10) / 10,
    };
  }

  private loadImage(url: string): Promise<HTMLImageElement | null> {
    if (typeof window === 'undefined' || typeof Image === 'undefined') {
      return Promise.resolve(null);
    }

    return new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';

      const cleanup = () => {
        img.onload = null;
        img.onerror = null;
      };

      img.onload = () => {
        cleanup();
        resolve(img);
      };

      img.onerror = () => {
        cleanup();
        resolve(null);
      };

      img.src = url;

      // Handle already cached images
      if (img.complete && img.naturalWidth > 0) {
        cleanup();
        resolve(img);
      }
    });
  }

  private async loadJson(url: string): Promise<unknown | null> {
    if (typeof fetch === 'undefined') {
      return null;
    }
    try {
      const res = await fetch(url);
      if (!res.ok) return null;
      return await res.json();
    } catch {
      return null;
    }
  }

  private async warmupSynth(): Promise<void> {
    // 1. Warm up procedural synth loops in advance so in-game track starts and loops are 0ms.
    for (const bm of BUNDLED_BEATMAPS) {
      getOrSynthesizeFutureFunkLoopPcm(bm.bpm, DETECTED_HARDWARE_SAMPLE_RATE, 8);
      // Yield to the browser paint cycle between tracks
      await new Promise((resolve) => setTimeout(resolve, 0));
    }

    // 2. Warm up V8 JIT once for heavy procedural bridge & roadside prop renderers (suspension-tower,
    // overpass, gantry, bridge parapets) on an offscreen 640x360 canvas so approaching the first bridge
    // in-game never triggers a first-time JIT compilation stall.
    if (!bridgeRenderersWarmedUp) {
      bridgeRenderersWarmedUp = true;
      this.warmupBridgeRenderers();
    }
  }

  private warmupBridgeRenderers(): void {
    if (typeof document === 'undefined') return;
    try {
      const canvas = document.createElement('canvas');
      canvas.width = 640;
      canvas.height = 360;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const allKinds: readonly PropKind[] = [
        'suspension-tower',
        'overpass',
        'gantry',
        'vms',
        'building',
        'billboard',
        'palm',
        'tree',
        'street-tree',
        'pine',
        'lamp',
        'chevron',
        'jihanki',
        'phonebooth',
        'pylon',
        'shrub',
        'sign',
        'kiosk',
        'bench',
        'bus-stop',
        'canopy',
        'torii',
        'toro',
      ];
      const ppuScales = [0.004, 0.015, 0.035];
      const pulses = [0.1, 0.6];
      for (let i = 0; i < allKinds.length; i++) {
        const kind = allKinds[i]!;
        for (let v = 0; v < 3; v++) {
          for (let s = 0; s < ppuScales.length; s++) {
            const ppu = ppuScales[s]!;
            const pulse = pulses[(v + s) % 2]!;
            drawProp(ctx, kind, 320, 260, ppu, 1, v, pulse);
            drawProp(ctx, kind, 320, 260, ppu, -1, v, pulse);
          }
        }
      }

      // Warm up RoadRenderer bridge parapet, bay water fill (y1 > 180), & expansion joint (index % 8 === 0 && w1 >= 22)
      const renderer = new RoadRenderer();
      const segLen = 200;
      const segs = Array.from({ length: 24 }, (_, idx) => ({
        index: idx,
        p1: createPoint(0, idx * segLen),
        p2: createPoint(0, (idx + 1) * segLen),
        curve: 0,
        stripe: (Math.floor(idx / 3) % 2 === 0 ? 0 : 1) as 0 | 1,
        sprites:
          idx === 4
            ? [{ kind: 'suspension-tower' as const, offset: 0, variant: 0 }]
            : idx === 8
              ? [{ kind: 'suspension-tower' as const, offset: 0, variant: 1 }]
              : [],
        fog: 1,
        env: 'bridge' as const,
      }));
      const dummyBridgeTrack: Track = {
        segments: segs,
        segmentLength: segLen,
        length: segs.length * segLen,
      };
      renderer.render(
        ctx,
        dummyBridgeTrack,
        {
          position: 0,
          playerX: 0,
          cameraHeight: 1000,
          cameraDepth: 0.84,
          roadWidth: 2000,
          drawDistance: 20,
          fogDensity: 5,
          width: 640,
          height: 360,
          beatPulse: 0.5,
        },
        PALETTE_NIGHT_FUNK,
      );
    } catch {
      // Ignore in headless/non-canvas environments
    }
  }
}
