import { describe, expect, it } from 'vitest';
import { AssetPreloader, type AssetDescriptor } from './AssetPreloader';

describe('AssetPreloader (M8)', () => {
  it('initializes with manifest and reports initial progress', () => {
    const customManifest: AssetDescriptor[] = [
      { id: 'test-1', kind: 'synth' },
      { id: 'test-2', kind: 'synth' },
    ];
    const preloader = new AssetPreloader(customManifest);
    expect(preloader.ready).toBe(false);
    expect(preloader.progress.total).toBe(2);
    expect(preloader.progress.loaded).toBe(0);
    expect(preloader.progress.percent).toBe(0);
  });

  it('runs preloadAll and updates progress sequentially to 100%', async () => {
    const manifest: AssetDescriptor[] = [
      { id: 'synth-a', kind: 'synth' },
      { id: 'synth-b', kind: 'synth' },
    ];
    const preloader = new AssetPreloader(manifest);
    const progressLog: number[] = [];

    const summary = await preloader.preloadAll((p) => {
      progressLog.push(p.percent);
    });

    expect(summary.success).toBe(true);
    expect(summary.loadedCount).toBe(2);
    expect(summary.failedCount).toBe(0);
    expect(preloader.ready).toBe(true);
    expect(preloader.progress.percent).toBe(100);
    expect(progressLog).toContain(100);
  });

  it('tolerates missing network assets gracefully with procedural fallback', async () => {
    const manifest: AssetDescriptor[] = [
      { id: 'missing-img', kind: 'image', url: '/sprites/does-not-exist.png' },
      { id: 'missing-json', kind: 'json', url: '/audio/does-not-exist.json' },
      { id: 'synth-ok', kind: 'synth' },
    ];
    const preloader = new AssetPreloader(manifest);

    const summary = await preloader.preloadAll();
    expect(preloader.ready).toBe(true);
    expect(preloader.getImage('missing-img')).toBeNull();
    expect(preloader.getJson('missing-json')).toBeNull();
    expect(summary.totalTimeMs).toBeGreaterThanOrEqual(0);
  });
});
