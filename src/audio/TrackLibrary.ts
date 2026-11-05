import { isBeatMap, parseTitleArtistFromFilename, type BeatMap } from './BeatMap';
import { BUNDLED_BEATMAPS } from './FunkAudioEngine';
import { decodeAudioForAnalysis, hashAudioBytes, TrackAnalyzer } from './TrackAnalyzer';

const IDB_NAME = 'mayonaka-cassette-audio';
const IDB_VERSION = 2;
const BEATMAP_STORE = 'beatmaps';
const SCORE_STORE = 'scores';
const LS_SCORES_KEY = 'mayonaka-cassette-best-scores-v1';
const LEGACY_LS_SCORES_KEY = 'outrun-futurefunk-best-scores-v1';

export type RunGrade = 'SSS' | 'S' | 'A' | 'B' | 'C';

const GRADE_RANK: Readonly<Record<RunGrade, number>> = {
  C: 1,
  B: 2,
  A: 3,
  S: 4,
  SSS: 5,
};

export interface StageScoreSummary {
  stageNumber: number;
  contentHash: string;
  title: string;
  artist: string;
  bpm: number;
  score: number;
  grade: RunGrade;
  avgGroove: number;
  maxGroove: number;
  perfectShifts: number;
  goodShifts: number;
  dropSyncs: number;
  collisions: number;
  sodaSpills: number;
  tofuModeUsed: boolean;
  durationSec: number;
  isNewRecord?: boolean;
}

export interface SongBestScore {
  contentHash: string;
  title: string;
  artist: string;
  bestScore: number;
  bestGrade: RunGrade;
  maxGroove: number;
  perfectShifts: number;
  dropSyncs: number;
  bestTimeSec: number;
  updatedAt: number;
}

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
 * Computes a stage/song letter grade from driving performance metrics (M6).
 */
export function computeStageGrade(
  score: number,
  avgGroove: number,
  sodaSpills: number,
  collisions: number,
): RunGrade {
  if (avgGroove >= 82 && score >= 9000 && sodaSpills === 0 && collisions <= 1) {
    return 'SSS';
  }
  if (avgGroove >= 65 || score >= 7000) {
    return 'S';
  }
  if (avgGroove >= 45 || score >= 4500) {
    return 'A';
  }
  if (avgGroove >= 28 || score >= 2500) {
    return 'B';
  }
  return 'C';
}

/**
 * Computes the overall run grade across all completed stages in a playlist run.
 */
export function computeOverallRunGrade(stages: readonly StageScoreSummary[]): RunGrade {
  if (stages.length === 0) return 'C';
  let sumRank = 0;
  for (const s of stages) {
    sumRank += GRADE_RANK[s.grade];
  }
  const avgRank = sumRank / stages.length;
  if (avgRank >= 4.6) return 'SSS';
  if (avgRank >= 3.7) return 'S';
  if (avgRank >= 2.7) return 'A';
  if (avgRank >= 1.7) return 'B';
  return 'C';
}

/**
 * Client-side track library, IndexedDB BeatMap cache, ordered stage playlist,
 * and local per-song best scores keyed by content hash
 * (docs/DESIGN.md §2.1, AGENTS.md §2, §3 & §5 M6).
 *
 * Pure TypeScript module (zero React imports).
 */
export class TrackLibrary {
  private readonly memoryCache = new Map<string, BeatMap>();
  private readonly bestScores = new Map<string, SongBestScore>();
  private readonly analyzer = new TrackAnalyzer();
  private readonly listeners = new Set<() => void>();

  private playlist: PlaylistItem[] = BUNDLED_BEATMAPS.map((beatMap) => ({
    id: beatMap.contentHash,
    contentHash: beatMap.contentHash,
    beatMap,
    audioBuffer: null,
    isBundled: true,
  }));
  private activeIndex = 0;

  constructor() {
    this.loadBestScoresFromLocalStorage();
    void this.loadBestScoresFromIdb();
  }

  get items(): readonly PlaylistItem[] {
    return this.playlist;
  }

  get activeItem(): PlaylistItem {
    return this.playlist[this.activeIndex] ?? this.playlist[0]!;
  }

  get currentIndex(): number {
    return this.activeIndex;
  }

  /** True when the playlist has more than 1 track so stage forks can advance through songs. */
  get hasMultipleTracks(): boolean {
    return this.playlist.length > 1;
  }

  /** True when tracks can be safely removed (playlist must keep at least 1 track). */
  get canRemoveTrack(): boolean {
    return this.playlist.length > 1;
  }

  /** True when there is another track after `activeIndex` in the playlist. */
  get hasNextTrack(): boolean {
    return this.activeIndex + 1 < this.playlist.length;
  }

  /** Returns the next track in the playlist if available, or `null` if on the final track. */
  get nextTrackItem(): PlaylistItem | null {
    return this.playlist[this.activeIndex + 1] ?? null;
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

  /** Advances to the next track in the playlist if one exists, returning the newly active item. */
  advanceToNextTrack(): PlaylistItem | null {
    if (!this.hasNextTrack) return null;
    this.activeIndex += 1;
    this.notify();
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
   * Removes a track from the playlist by zero-based index.
   * Maintains at least one track in the playlist so driving and road generation always remain valid.
   * Adjusts activeIndex if needed and notifies subscribers.
   *
   * @param index Index of the track to remove.
   * @returns The removed PlaylistItem, or `null` if removal is disallowed or index is invalid.
   */
  removeTrack(index: number): PlaylistItem | null {
    if (this.playlist.length <= 1) return null;
    if (index < 0 || index >= this.playlist.length) return null;

    const [removed] = this.playlist.splice(index, 1);
    if (!removed) return null;

    if (index < this.activeIndex) {
      this.activeIndex = Math.max(0, this.activeIndex - 1);
    } else if (index === this.activeIndex) {
      this.activeIndex = Math.min(this.activeIndex, this.playlist.length - 1);
    }

    this.notify();
    return removed;
  }

  /**
   * Removes a track from the playlist by its unique item `id`.
   */
  removeTrackById(id: string): PlaylistItem | null {
    const idx = this.playlist.findIndex((p) => p.id === id);
    if (idx < 0) return null;
    return this.removeTrack(idx);
  }

  /**
   * Removes a track from the playlist by its `contentHash`.
   */
  removeTrackByContentHash(contentHash: string): PlaylistItem | null {
    const idx = this.playlist.findIndex((p) => p.contentHash === contentHash);
    if (idx < 0) return null;
    return this.removeTrack(idx);
  }

  /**
   * Restores the default 3-stage Future Funk playlist from bundled BeatMaps.
   */
  restoreDefaultPlaylist(): void {
    this.playlist = BUNDLED_BEATMAPS.map((beatMap) => ({
      id: beatMap.contentHash,
      contentHash: beatMap.contentHash,
      beatMap,
      audioBuffer: null,
      isBundled: true,
    }));
    this.activeIndex = 0;
    this.notify();
  }

  /**
   * Returns the saved local best score for `contentHash`, or `null` if never completed.
   */
  getBestScore(contentHash: string): SongBestScore | null {
    return this.bestScores.get(contentHash) ?? null;
  }

  /**
   * Returns all saved per-song best scores keyed by `contentHash`.
   */
  getAllBestScores(): ReadonlyMap<string, SongBestScore> {
    return this.bestScores;
  }

  /**
   * Records a completed stage's score and updates the local per-song best score if beaten.
   */
  recordStageResult(summary: StageScoreSummary): { best: SongBestScore; isNewRecord: boolean } {
    const existing = this.bestScores.get(summary.contentHash);
    const isNewRecord = !existing || summary.score > existing.bestScore;

    const updated: SongBestScore = existing
      ? {
          contentHash: summary.contentHash,
          title: summary.title,
          artist: summary.artist,
          bestScore: Math.max(existing.bestScore, summary.score),
          bestGrade:
            GRADE_RANK[summary.grade] >= GRADE_RANK[existing.bestGrade]
              ? summary.grade
              : existing.bestGrade,
          maxGroove: Math.max(existing.maxGroove, summary.maxGroove),
          perfectShifts: Math.max(existing.perfectShifts, summary.perfectShifts),
          dropSyncs: Math.max(existing.dropSyncs, summary.dropSyncs),
          bestTimeSec:
            existing.bestTimeSec > 0
              ? Math.min(existing.bestTimeSec, summary.durationSec)
              : summary.durationSec,
          updatedAt: Date.now(),
        }
      : {
          contentHash: summary.contentHash,
          title: summary.title,
          artist: summary.artist,
          bestScore: summary.score,
          bestGrade: summary.grade,
          maxGroove: summary.maxGroove,
          perfectShifts: summary.perfectShifts,
          dropSyncs: summary.dropSyncs,
          bestTimeSec: summary.durationSec,
          updatedAt: Date.now(),
        };

    this.bestScores.set(summary.contentHash, updated);
    if (typeof queueMicrotask === 'function') {
      queueMicrotask(() => this.saveBestScoresToLocalStorage());
    } else {
      this.saveBestScoresToLocalStorage();
    }
    void this.putBestScoreInIdb(updated);
    this.notify();

    return { best: updated, isNewRecord };
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

  private loadBestScoresFromLocalStorage(): void {
    if (typeof window === 'undefined' || !window.localStorage) return;
    try {
      const raw =
        window.localStorage.getItem(LS_SCORES_KEY) ??
        window.localStorage.getItem(LEGACY_LS_SCORES_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed)) {
        for (const item of parsed) {
          if (isSongBestScore(item)) {
            this.bestScores.set(item.contentHash, item);
          }
        }
      }
    } catch {
      // Ignore storage errors
    }
  }

  private saveBestScoresToLocalStorage(): void {
    if (typeof window === 'undefined' || !window.localStorage) return;
    try {
      const list = Array.from(this.bestScores.values());
      window.localStorage.setItem(LS_SCORES_KEY, JSON.stringify(list));
    } catch {
      // Ignore storage errors
    }
  }

  private async loadBestScoresFromIdb(): Promise<void> {
    const db = await this.openDb();
    if (!db || !db.objectStoreNames.contains(SCORE_STORE)) return;

    return new Promise<void>((resolve) => {
      try {
        const tx = db.transaction(SCORE_STORE, 'readonly');
        const store = tx.objectStore(SCORE_STORE);
        const req = store.getAll();
        req.onsuccess = () => {
          const rows = req.result as unknown[];
          let changed = false;
          if (Array.isArray(rows)) {
            for (const row of rows) {
              if (isSongBestScore(row)) {
                const cur = this.bestScores.get(row.contentHash);
                if (!cur || row.bestScore > cur.bestScore) {
                  this.bestScores.set(row.contentHash, row);
                  changed = true;
                }
              }
            }
          }
          if (changed) {
            this.saveBestScoresToLocalStorage();
            this.notify();
          }
          resolve();
        };
        req.onerror = () => resolve();
      } catch {
        resolve();
      }
    });
  }

  private async putBestScoreInIdb(score: SongBestScore): Promise<void> {
    const db = await this.openDb();
    if (!db || !db.objectStoreNames.contains(SCORE_STORE)) return;

    return new Promise<void>((resolve) => {
      try {
        const tx = db.transaction(SCORE_STORE, 'readwrite');
        const store = tx.objectStore(SCORE_STORE);
        store.put(score);
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      } catch {
        resolve();
      }
    });
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
          if (!db.objectStoreNames.contains(SCORE_STORE)) {
            db.createObjectStore(SCORE_STORE, { keyPath: 'contentHash' });
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

function isSongBestScore(val: unknown): val is SongBestScore {
  if (!val || typeof val !== 'object') return false;
  const rec = val as Record<string, unknown>;
  return (
    typeof rec.contentHash === 'string' &&
    typeof rec.bestScore === 'number' &&
    typeof rec.bestGrade === 'string' &&
    rec.bestGrade in GRADE_RANK
  );
}
