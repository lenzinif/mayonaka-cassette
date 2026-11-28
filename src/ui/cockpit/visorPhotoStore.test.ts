import { describe, expect, it } from 'vitest';
import {
  addVisorPhotoFile,
  addVisorPhotoFiles,
  clearVisorPhotos,
  isSupportedVisorImageFile,
  loadVisorPhotos,
  MAX_VISOR_PHOTOS,
  removeVisorPhoto,
} from './visorPhotoStore';

describe('visorPhotoStore (Multi-Photo Stack up to 5)', () => {
  it('validates supported image MIME types and extension fallbacks', () => {
    expect(isSupportedVisorImageFile(new File(['a'], 'rei.png', { type: 'image/png' }))).toBe(true);
    expect(isSupportedVisorImageFile(new File(['a'], 'asuka.webp', { type: 'image/webp' }))).toBe(
      true,
    );
    expect(isSupportedVisorImageFile(new File(['a'], 'misato.jpg', { type: '' }))).toBe(true);
    expect(isSupportedVisorImageFile(new File(['a'], 'notes.txt', { type: '' }))).toBe(false);
    expect(isSupportedVisorImageFile(new File(['a'], 'track.mp3', { type: 'audio/mpeg' }))).toBe(
      false,
    );
  });

  it('gracefully falls back to empty array / no-op when IndexedDB is unavailable', async () => {
    await expect(loadVisorPhotos()).resolves.toEqual([]);
    await expect(clearVisorPhotos()).resolves.toBeUndefined();
    const afterRemove = await removeVisorPhoto('a', [
      { id: 'a', dataUrl: 'x' },
      { id: 'b', dataUrl: 'y' },
    ]);
    expect(afterRemove).toEqual([{ id: 'b', dataUrl: 'y' }]);
  });

  it('enforces MAX_VISOR_PHOTOS = 5 and rejects non-image files', async () => {
    expect(MAX_VISOR_PHOTOS).toBe(5);
    const badFile = new File(['hello'], 'readme.txt', { type: 'text/plain' });
    await expect(addVisorPhotoFile(badFile, [])).rejects.toThrow(/supported image/i);

    const existing = Array.from({ length: 5 }, (_, i) => ({
      id: `existing-${i}`,
      dataUrl: `data:image/png;base64,EX${i}`,
    }));
    const capped = await addVisorPhotoFiles(
      [new File(['img'], 'extra.png', { type: 'image/png' })],
      existing,
    );
    expect(capped).toHaveLength(5);

    const prevFileReader = globalThis.FileReader;
    class FakeFileReader {
      result: string | null = null;
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      readAsDataURL(file: File): void {
        this.result = `data:${file.type || 'image/png'};base64,FAKE_${file.name}`;
        this.onload?.();
      }
    }
    globalThis.FileReader = FakeFileReader as unknown as typeof FileReader;
    try {
      const batch = await addVisorPhotoFiles(
        [
          new File(['1'], 'a.png', { type: 'image/png' }),
          badFile,
          new File(['2'], 'b.jpg', { type: 'image/jpeg' }),
          new File(['3'], 'c.webp', { type: 'image/webp' }),
          new File(['4'], 'd.png', { type: 'image/png' }),
          new File(['5'], 'e.png', { type: 'image/png' }),
          new File(['6'], 'f.png', { type: 'image/png' }),
        ],
        [],
      );
      expect(batch).toHaveLength(5);
      expect(batch.some((p) => p.dataUrl.includes('FAKE_f.png'))).toBe(false);
    } finally {
      globalThis.FileReader = prevFileReader;
    }
  });
});
