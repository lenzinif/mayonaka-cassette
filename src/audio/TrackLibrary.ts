import { isBeatMap, parseTitleArtistFromFilename, type BeatMap } from './BeatMap';
import { DEFAULT_SYNTH_BEATMAP } from './FunkAudioEngine';
import { decodeAudioForAnalysis, hashAudioBytes, TrackAnalyzer } from './TrackAnalyzer';

const IDB_NAME = 'outrun-futurefunk-audio';
const IDB_VERSION = 1;
const BEATMAP_STORE = 'beatmaps';

export interface PlaylistItem {
  id: string;
  contentHash: string;
  beatMap: BeatMap;
  audioBuffer: AudioBuffer | null;
  isBundled: boolean;
}

export interface ImportProgress {
  completed: number;
  total: number;
  currentFile: string;
  fromCache: boolean;
}

/**
 * Client-side track library, IndexedDB BeatMap cache, and ordered stage playlist
 * (docs/DESIGN.md §2.1, AGENTS.md §2 & §3).
 *
 * Pure TypeScript module (zero React imports).
 */
export class TrackLibrary {
  private readonly memoryCache = new Map<string, BeatMap>();
  private readonly analyzer = new TrackAnalyzer();
  private readonly listeners = new Set<() => void>();

  private playlist: PlaylistItem[] = [
    {
      id: DEFAULT_SYNTH_BEATMAP.contentHash,
      contentHash: DEFAULT_SYNTH_BEATMAP.contentHash,
      beatMap: DEFAULT_SYNTH_BEATMAP,
      audioBuffer: null,
      isBundled: true,
    },
  ];
  private activeIndex = 0;

  get items(): readonly PlaylistItem[] {
    return this.playlist;
  }

  get activeItem(): PlaylistItem {
    return this.playlist[this.activeIndex] ?? this.playlist[0]!;
  }

  get currentIndex(): number {
    return this.activeIndex;
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  selectTrack(index: number): PlaylistItem {
    if (index >= 0 && index < this.playlist.length) {
      this.activeIndex = index;
      this.notify();
    }
    return this.activeItem;
  }

  selectByContentHash(contentHash: string): PlaylistItem {
    const idx = this.playlist.findIndex((it) => it.contentHash === contentHash);
    if (idx >= 0) {
      this.activeIndex = idx;
      this.notify();
    }
    return this.activeItem;
  }

  /**
   * Imports user-selected audio files:
   * 1. Hashes file bytes (`SHA-256`).
   * 2. Looks up cached `BeatMap` in IndexedDB.
   * 3. Decodes audio on the main thread; on cache miss, runs `TrackAnalyzer` in Web Worker.
   * 4. Appends to the playlist and selects the first newly imported track.
   */
  async importFiles(
    files: Iterable<File>,
    onProgress?: (progress: ImportProgress) => void,
  ): Promise<PlaylistItem[]> {
    const fileArray = Array.from(files);
    if (fileArray.length === 0) return [];

    const imported: PlaylistItem[] = [];
    let completed = 0;

    for (const file of fileArray) {
      const bytes = await file.arrayBuffer();
      const contentHash = await hashAudioBytes(bytes);
      const cachedBeatMap = await this.getCachedBeatMap(contentHash);
      const decoded = await decodeAudioForAnalysis(bytes);

      let beatMap: BeatMap;
      const fromCache = cachedBeatMap !== null;

      if (cachedBeatMap) {
        beatMap = cachedBeatMap;
      } else {
        const parsed = parseTitleArtistFromFilename(file.name);
        const res = await this.analyzer.analyzeMonoPcm(decoded.monoPcm, decoded.sampleRate, {
          contentHash,
          title: parsed.title,
          artist: parsed.artist,
          durationSec: decoded.durationSec,
        });
        beatMap = res.beatMap;
        await this.putCachedBeatMap(beatMap);
      }

      const item: PlaylistItem = {
        id: `${contentHash}:${Date.now()}:${completed}`,
        contentHash,
        beatMap,
        audioBuffer: decoded.audioBuffer,
        isBundled: false,
      };

      // Replace existing entry with same hash or append
      const existingIdx = this.playlist.findIndex((p) => p.contentHash === contentHash);
      if (existingIdx >= 0) {
        this.playlist = this.playlist.map((p, idx) => (idx === existingIdx ? item : p));
      } else {
        this.playlist = [...this.playlist, item];
      }

      imported.push(item);
      completed++;
      onProgress?.({
        completed,
        total: fileArray.length,
        currentFile: file.name,
        fromCache,
      });
      this.notify();
    }

    if (imported[0]) {
      this.selectByContentHash(imported[0].contentHash);
    }

    return imported;
  }

  /**
   * Persists a user-corrected `BeatMap` (`×2`, `÷2`, tap tempo, or downbeat nudge)
   * both in the active playlist and in IndexedDB.
   */
  async updateBeatMap(contentHash: string, updated: BeatMap): Promise<void> {
    this.playlist = this.playlist.map((it) =>
      it.contentHash === contentHash ? { ...it, beatMap: updated } : it,
    );
    await this.putCachedBeatMap(updated);
    this.notify();
  }

  async getCachedBeatMap(contentHash: string): Promise<BeatMap | null> {
    const mem = this.memoryCache.get(contentHash);
    if (mem) return mem;

    const db = await this.openDb();
    if (!db) return null;

    return new Promise<BeatMap | null>((resolve) => {
      try {
        const tx = db.transaction(BEATMAP_STORE, 'readonly');
        const store = tx.objectStore(BEATMAP_STORE);
        const req = store.get(contentHash);
        req.onsuccess = () => {
          const val = req.result as unknown;
          if (isBeatMap(val)) {
            this.memoryCache.set(contentHash, val);
            resolve(val);
          } else {
            resolve(null);
          }
        };
        req.onerror = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
  }

  async putCachedBeatMap(beatMap: BeatMap): Promise<void> {
    this.memoryCache.set(beatMap.contentHash, beatMap);
    const db = await this.openDb();
    if (!db) return;

    return new Promise<void>((resolve) => {
      try {
        const tx = db.transaction(BEATMAP_STORE, 'readwrite');
        const store = tx.objectStore(BEATMAP_STORE);
        store.put(beatMap);
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      } catch {
        resolve();
      }
    });
  }

  dispose(): void {
    this.analyzer.dispose();
    this.listeners.clear();
  }

  private notify(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }

  private openDb(): Promise<IDBDatabase | null> {
    if (typeof indexedDB === 'undefined') {
      return Promise.resolve(null);
    }
    return new Promise<IDBDatabase | null>((resolve) => {
      try {
        const req = indexedDB.open(IDB_NAME, IDB_VERSION);
        req.onupgradeneeded = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains(BEATMAP_STORE)) {
            db.createObjectStore(BEATMAP_STORE, { keyPath: 'contentHash' });
          }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
  }
}
