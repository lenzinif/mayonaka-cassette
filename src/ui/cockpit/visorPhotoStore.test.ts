import { describe, expect, it } from 'vitest';
import {
  clearVisorPhoto,
  isSupportedVisorImageFile,
  loadVisorPhotoDataUrl,
  saveVisorPhotoFile,
} from './visorPhotoStore';

describe('visorPhotoStore', () => {
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

  it('gracefully falls back to null/no-op when IndexedDB is unavailable', async () => {
    await expect(loadVisorPhotoDataUrl()).resolves.toBeNull();
    await expect(clearVisorPhoto()).resolves.toBeUndefined();
  });

  it('rejects non-image files in saveVisorPhotoFile', async () => {
    const badFile = new File(['hello'], 'readme.txt', { type: 'text/plain' });
    await expect(saveVisorPhotoFile(badFile)).rejects.toThrow(/supported image/i);
  });
});
