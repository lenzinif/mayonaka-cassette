import { beforeEach, describe, expect, it, vi } from 'vitest';
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
});
