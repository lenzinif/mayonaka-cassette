import * as fs from 'node:fs';
import * as path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { isBeatMap, type BeatMap } from './BeatMap';
import {
  DEFAULT_SYNTH_BEATMAP,
  BUNDLED_WANGAN_BEATMAP,
  BUNDLED_COASTAL_BEATMAP,
} from './FunkAudioEngine';
import { TrackLibrary } from './TrackLibrary';

describe('TrackLibrary — Playlist Track Management & Removal', () => {
  beforeEach(() => {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.clear();
    }
  });

  it('initializes with bundled tracks and canRemoveTrack = true', () => {
    const lib = new TrackLibrary();
    expect(lib.items.length).toBe(3);
    expect(lib.canRemoveTrack).toBe(true);
    expect(lib.currentIndex).toBe(0);
    expect(lib.activeItem.contentHash).toBe(DEFAULT_SYNTH_BEATMAP.contentHash);
  });

  it('removes a track after activeIndex without changing activeIndex or activeItem', () => {
    const lib = new TrackLibrary();
    const listener = vi.fn();
    lib.subscribe(listener);

    // activeIndex is 0 (Plastic Love Night)
    const removed = lib.removeTrack(2);
    expect(removed).not.toBeNull();
    expect(removed?.contentHash).toBe(BUNDLED_COASTAL_BEATMAP.contentHash);
    expect(lib.items.length).toBe(2);
    expect(lib.currentIndex).toBe(0);
    expect(lib.activeItem.contentHash).toBe(DEFAULT_SYNTH_BEATMAP.contentHash);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('removes a track before activeIndex and shifts activeIndex down by 1', () => {
    const lib = new TrackLibrary();
    lib.selectTrack(2); // active is BUNDLED_COASTAL_BEATMAP
    expect(lib.currentIndex).toBe(2);
    expect(lib.activeItem.contentHash).toBe(BUNDLED_COASTAL_BEATMAP.contentHash);

    const removed = lib.removeTrack(0);
    expect(removed?.contentHash).toBe(DEFAULT_SYNTH_BEATMAP.contentHash);
    expect(lib.items.length).toBe(2);
    // activeIndex should have shifted from 2 to 1 so activeItem stays BUNDLED_COASTAL_BEATMAP
    expect(lib.currentIndex).toBe(1);
    expect(lib.activeItem.contentHash).toBe(BUNDLED_COASTAL_BEATMAP.contentHash);
  });

  it('removes the currently active track and selects the next or previous valid track', () => {
    const lib = new TrackLibrary();
    // Remove active track at index 0
    const removed0 = lib.removeTrack(0);
    expect(removed0?.contentHash).toBe(DEFAULT_SYNTH_BEATMAP.contentHash);
    expect(lib.items.length).toBe(2);
    expect(lib.currentIndex).toBe(0);
    // New active track is Wangan Midnight
    expect(lib.activeItem.contentHash).toBe(BUNDLED_WANGAN_BEATMAP.contentHash);

    // Now select the last track (index 1) and remove it
    lib.selectTrack(1);
    expect(lib.currentIndex).toBe(1);
    expect(lib.activeItem.contentHash).toBe(BUNDLED_COASTAL_BEATMAP.contentHash);

    const removedLast = lib.removeTrack(1);
    expect(removedLast?.contentHash).toBe(BUNDLED_COASTAL_BEATMAP.contentHash);
    expect(lib.items.length).toBe(1);
    // activeIndex clamps to 0
    expect(lib.currentIndex).toBe(0);
    expect(lib.activeItem.contentHash).toBe(BUNDLED_WANGAN_BEATMAP.contentHash);
  });

  it('refuses to remove the last remaining track so the playlist is never empty', () => {
    const lib = new TrackLibrary();
    lib.removeTrack(0); // 2 left
    lib.removeTrack(0); // 1 left
    expect(lib.items.length).toBe(1);
    expect(lib.canRemoveTrack).toBe(false);

    // Attempting to remove the last track returns null and keeps the item
    const fail = lib.removeTrack(0);
    expect(fail).toBeNull();
    expect(lib.items.length).toBe(1);
    expect(lib.activeItem).toBeDefined();
  });

  it('returns null on out of bounds indices', () => {
    const lib = new TrackLibrary();
    expect(lib.removeTrack(-1)).toBeNull();
    expect(lib.removeTrack(99)).toBeNull();
    expect(lib.items.length).toBe(3);
  });

  it('removes track by ID and by contentHash', () => {
    const lib = new TrackLibrary();
    const item1 = lib.items[1]!;

    const removedByHash = lib.removeTrackByContentHash(item1.contentHash);
    expect(removedByHash?.contentHash).toBe(item1.contentHash);
    expect(lib.items.length).toBe(2);

    const itemLast = lib.items[1]!;
    const removedById = lib.removeTrackById(itemLast.id);
    expect(removedById?.id).toBe(itemLast.id);
    expect(lib.items.length).toBe(1);

    expect(lib.removeTrackByContentHash('unknown-hash')).toBeNull();
    expect(lib.removeTrackById('unknown-id')).toBeNull();
  });

  it('restores default playlist when restoreDefaultPlaylist is called', () => {
    const lib = new TrackLibrary();
    lib.removeTrack(0);
    lib.removeTrack(0);
    expect(lib.items.length).toBe(1);

    lib.restoreDefaultPlaylist();
    expect(lib.items.length).toBe(3);
    expect(lib.currentIndex).toBe(0);
    expect(lib.items[0]?.contentHash).toBe(DEFAULT_SYNTH_BEATMAP.contentHash);
    expect(lib.items[1]?.contentHash).toBe(BUNDLED_WANGAN_BEATMAP.contentHash);
    expect(lib.items[2]?.contentHash).toBe(BUNDLED_COASTAL_BEATMAP.contentHash);
  });

  it('S3: public/audio/*.beatmap.json pass isBeatMap() and include matching barEnergy & barBrightness', () => {
    const audioDir = path.resolve(process.cwd(), 'public', 'audio');
    const files: Array<{ file: string; expected: BeatMap }> = [
      { file: 'neon-horizon.beatmap.json', expected: DEFAULT_SYNTH_BEATMAP },
      { file: 'midnight-wangan.beatmap.json', expected: BUNDLED_WANGAN_BEATMAP },
      { file: 'melon-soda-sunset.beatmap.json', expected: BUNDLED_COASTAL_BEATMAP },
    ];

    for (const { file, expected } of files) {
      const parsed: unknown = JSON.parse(fs.readFileSync(path.join(audioDir, file), 'utf8'));
      expect(isBeatMap(parsed)).toBe(true);
      if (isBeatMap(parsed)) {
        expect(parsed.barEnergy).toEqual(expected.barEnergy);
        expect(parsed.barBrightness).toEqual(expected.barBrightness);
        expect(parsed.sections).toEqual(expected.sections);
      }
    }
  });

  it('M1: IndexedDB v6 upgrade preserves source="manual" BeatMaps while purging cached source="analysis" entries for orthogonal spectral reanalysis', async () => {
    const manualMap: BeatMap = {
      ...DEFAULT_SYNTH_BEATMAP,
      contentHash: 'sha256:user-manual-bpm',
      source: 'manual',
    };
    delete manualMap.barBrightness;

    const legacyAnalysisMap: BeatMap = {
      ...DEFAULT_SYNTH_BEATMAP,
      contentHash: 'sha256:legacy-analysis-no-bright',
      source: 'analysis',
    };
    delete legacyAnalysisMap.barBrightness;

    const v4AnalysisMap: BeatMap = {
      ...DEFAULT_SYNTH_BEATMAP,
      contentHash: 'sha256:v4-analysis-with-bright',
      source: 'analysis',
    };

    const bundledMap: BeatMap = {
      ...DEFAULT_SYNTH_BEATMAP,
      contentHash: 'sha256:bundled-entry',
      source: 'bundled',
    };

    const records = new Map<string, BeatMap>([
      [manualMap.contentHash, manualMap],
      [legacyAnalysisMap.contentHash, legacyAnalysisMap],
      [v4AnalysisMap.contentHash, v4AnalysisMap],
      [bundledMap.contentHash, bundledMap],
    ]);

    const mockStore = {
      openCursor: vi.fn(() => {
        const keys = Array.from(records.keys());
        let idx = 0;
        const cursorReq = {
          result: null as null | { value: BeatMap; delete: () => void; continue: () => void },
          onsuccess: null as null | (() => void),
        };
        const advance = () => {
          if (idx < keys.length) {
            const key = keys[idx++]!;
            cursorReq.result = {
              value: records.get(key)!,
              delete: () => {
                records.delete(key);
              },
              continue: () => {
                queueMicrotask(advance);
              },
            };
          } else {
            cursorReq.result = null;
          }
          cursorReq.onsuccess?.();
        };
        queueMicrotask(advance);
        return cursorReq;
      }),
    };

    const g = globalThis as unknown as { indexedDB?: unknown };
    const prevIdb = g.indexedDB;
    let upgradeFromVersion = 5;
    let triggerBlocked = false;
    g.indexedDB = {
      open: vi.fn(() => {
        const fakeDb = {
          objectStoreNames: { contains: () => upgradeFromVersion > 0 },
          createObjectStore: vi.fn(),
          close: vi.fn(),
          onversionchange: null as null | (() => void),
        };
        const req = {
          result: fakeDb,
          transaction: { objectStore: () => mockStore },
          onupgradeneeded: null as null | ((e: { oldVersion: number }) => void),
          onsuccess: null as null | (() => void),
          onerror: null as null | (() => void),
          onblocked: null as null | (() => void),
        };
        queueMicrotask(() => {
          if (triggerBlocked) {
            req.onblocked?.();
            return;
          }
          req.onupgradeneeded?.({ oldVersion: upgradeFromVersion });
          req.onsuccess?.();
        });
        return req;
      }),
    };

    try {
      const lib = new TrackLibrary();
      await (lib as unknown as { openDb: () => Promise<unknown> }).openDb();
      // Give cursor microtasks a turn to complete
      await new Promise((r) => setTimeout(r, 10));

      expect(records.has(manualMap.contentHash)).toBe(true); // Manual correction preserved!
      expect(records.has(bundledMap.contentHash)).toBe(true); // Bundled map preserved!
      expect(records.has(v4AnalysisMap.contentHash)).toBe(false); // Old v4 analysis entry purged for updated barBrightness!
      expect(records.has(legacyAnalysisMap.contentHash)).toBe(false); // Legacy analysis entry purged!

      // Upgrade from oldVersion=3 -> v5 also purges stale analysis records
      records.set(v4AnalysisMap.contentHash, v4AnalysisMap);
      upgradeFromVersion = 3;
      await (lib as unknown as { openDb: () => Promise<unknown> }).openDb();
      await new Promise((r) => setTimeout(r, 10));
      expect(records.has(v4AnalysisMap.contentHash)).toBe(false);

      // Fresh DB install (oldVersion=0) skips cursor scan; blocked upgrade resolves cleanly to null
      mockStore.openCursor.mockClear();
      upgradeFromVersion = 0;
      const freshDb = await (lib as unknown as { openDb: () => Promise<unknown> }).openDb();
      expect(freshDb).not.toBeNull();
      expect(mockStore.openCursor).not.toHaveBeenCalled();

      triggerBlocked = true;
      const blockedDb = await (lib as unknown as { openDb: () => Promise<unknown> }).openDb();
      expect(blockedDb).toBeNull();
    } finally {
      g.indexedDB = prevIdb;
    }
  });
});
