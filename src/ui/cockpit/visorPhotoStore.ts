const VISOR_DB_NAME = 'mayonaka-cassette-cockpit';
const VISOR_DB_VERSION = 1;
const VISOR_STORE_NAME = 'visor-photo';
const VISOR_PRIMARY_KEY = 'primary';
const VISOR_STACK_KEY = 'stack';

export const MAX_VISOR_PHOTOS = 5;

const MAX_VISOR_WIDTH = 512;
const MAX_VISOR_HEIGHT = 384;
const IMAGE_EXT_REGEX = /\.(png|jpe?g|webp|gif|bmp|avif)$/i;

export interface VisorPhotoItem {
  id: string;
  dataUrl: string;
}

export function isSupportedVisorImageFile(file: File): boolean {
  if (file.type.startsWith('image/')) return true;
  return file.type === '' && IMAGE_EXT_REGEX.test(file.name);
}

function openVisorDb(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    if (typeof indexedDB === 'undefined') {
      resolve(null);
      return;
    }
    try {
      const req = indexedDB.open(VISOR_DB_NAME, VISOR_DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(VISOR_STORE_NAME)) {
          db.createObjectStore(VISOR_STORE_NAME);
        }
      };
      req.onsuccess = () => {
        const db = req.result;
        db.onversionchange = () => db.close();
        resolve(db);
      };
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

function sanitizeVisorPhotoStack(raw: unknown): VisorPhotoItem[] {
  if (!Array.isArray(raw)) return [];
  const items: VisorPhotoItem[] = [];
  for (let i = 0; i < raw.length && items.length < MAX_VISOR_PHOTOS; i++) {
    const entry = raw[i] as Partial<VisorPhotoItem> | null;
    if (
      entry &&
      typeof entry === 'object' &&
      typeof entry.id === 'string' &&
      entry.id.length > 0 &&
      typeof entry.dataUrl === 'string' &&
      entry.dataUrl.length > 0
    ) {
      items.push({ id: entry.id, dataUrl: entry.dataUrl });
    }
  }
  return items;
}

async function putVisorPhotoStack(items: readonly VisorPhotoItem[]): Promise<void> {
  const db = await openVisorDb();
  if (!db) return;
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(VISOR_STORE_NAME, 'readwrite');
      const store = tx.objectStore(VISOR_STORE_NAME);
      const req = store.put(items.slice(0, MAX_VISOR_PHOTOS), VISOR_STACK_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? req.error ?? new Error('IndexedDB write failed'));
      tx.onabort = () => reject(tx.error ?? new Error('IndexedDB write aborted'));
    });
  } finally {
    db.close();
  }
}

/**
 * Loads the ordered Sun Visor photo stack (up to `MAX_VISOR_PHOTOS = 5`),
 * automatically migrating any legacy single `'primary'` photo to index `0`.
 */
export async function loadVisorPhotos(): Promise<VisorPhotoItem[]> {
  const db = await openVisorDb();
  if (!db) return [];
  try {
    return await new Promise<VisorPhotoItem[]>((resolve) => {
      const tx = db.transaction(VISOR_STORE_NAME, 'readonly');
      const store = tx.objectStore(VISOR_STORE_NAME);
      const stackReq = store.get(VISOR_STACK_KEY);
      stackReq.onsuccess = () => {
        const parsed = sanitizeVisorPhotoStack(stackReq.result);
        if (parsed.length > 0 || Array.isArray(stackReq.result)) {
          resolve(parsed);
          return;
        }
        const legacyReq = store.get(VISOR_PRIMARY_KEY);
        legacyReq.onsuccess = () => {
          if (typeof legacyReq.result === 'string' && legacyReq.result.length > 0) {
            resolve([{ id: 'legacy-1', dataUrl: legacyReq.result }]);
          } else {
            resolve([]);
          }
        };
        legacyReq.onerror = () => resolve([]);
      };
      stackReq.onerror = () => resolve([]);
      tx.onabort = () => resolve([]);
    });
  } catch {
    return [];
  } finally {
    db.close();
  }
}

export async function clearVisorPhotos(): Promise<void> {
  const db = await openVisorDb();
  if (!db) return;
  try {
    await new Promise<void>((resolve) => {
      const tx = db.transaction(VISOR_STORE_NAME, 'readwrite');
      const store = tx.objectStore(VISOR_STORE_NAME);
      store.delete(VISOR_STACK_KEY);
      store.delete(VISOR_PRIMARY_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
      tx.onabort = () => resolve();
    });
  } catch {
    // Ignore IDB clear failure
  } finally {
    db.close();
  }
}

function encodeResizedImage(img: HTMLImageElement): string {
  const srcW = Math.max(1, img.naturalWidth || img.width);
  const srcH = Math.max(1, img.naturalHeight || img.height);
  const scale = Math.min(1, MAX_VISOR_WIDTH / srcW, MAX_VISOR_HEIGHT / srcH);
  const dstW = Math.max(1, Math.round(srcW * scale));
  const dstH = Math.max(1, Math.round(srcH * scale));

  const canvas = document.createElement('canvas');
  canvas.width = dstW;
  canvas.height = dstH;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Unable to acquire 2D context for visor image resize');
  }
  ctx.drawImage(img, 0, 0, dstW, dstH);

  const webp = canvas.toDataURL('image/webp', 0.86);
  if (webp.startsWith('data:image/webp')) {
    return webp;
  }
  ctx.fillStyle = '#110c19';
  ctx.fillRect(0, 0, dstW, dstH);
  ctx.drawImage(img, 0, 0, dstW, dstH);
  return canvas.toDataURL('image/jpeg', 0.86);
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
      } else {
        reject(new Error('Invalid FileReader output'));
      }
    };
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read image file'));
    reader.readAsDataURL(file);
  });
}

function loadImageElement(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to decode image'));
    img.src = src;
  });
}

async function decodeAndResizeVisorFile(file: File): Promise<string> {
  if (!isSupportedVisorImageFile(file)) {
    throw new Error('Selected file is not a supported image');
  }

  if (typeof document !== 'undefined' && typeof Image !== 'undefined') {
    if (typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function') {
      const objectUrl = URL.createObjectURL(file);
      try {
        const img = await loadImageElement(objectUrl);
        return encodeResizedImage(img);
      } finally {
        URL.revokeObjectURL(objectUrl);
      }
    }
    const rawUrl = await readFileAsDataUrl(file);
    const img = await loadImageElement(rawUrl);
    return encodeResizedImage(img);
  }
  return readFileAsDataUrl(file);
}

export async function addVisorPhotoFiles(
  files: readonly File[],
  current?: readonly VisorPhotoItem[],
): Promise<VisorPhotoItem[]> {
  const next = current ? [...current] : await loadVisorPhotos();
  if (next.length >= MAX_VISOR_PHOTOS || files.length === 0) {
    return next.slice(0, MAX_VISOR_PHOTOS);
  }
  let changed = false;
  for (let i = 0; i < files.length && next.length < MAX_VISOR_PHOTOS; i++) {
    const file = files[i];
    if (!file) continue;
    try {
      const dataUrl = await decodeAndResizeVisorFile(file);
      const id = `visor-${Date.now().toString(36)}-${i}-${Math.random().toString(36).slice(2, 7)}`;
      next.push({ id, dataUrl });
      changed = true;
    } catch {
      // Skip individual unreadable or unsupported files in multi-selection
    }
  }
  if (changed) {
    await putVisorPhotoStack(next);
  }
  return next.slice(0, MAX_VISOR_PHOTOS);
}

/**
 * Validates, resizes (`<= 512x384`), and appends a photo to the persisted Sun Visor stack
 * (capped at `MAX_VISOR_PHOTOS = 5`).
 */
export async function addVisorPhotoFile(
  file: File,
  current?: readonly VisorPhotoItem[],
): Promise<VisorPhotoItem[]> {
  const dataUrl = await decodeAndResizeVisorFile(file);
  const existing = current ? [...current] : await loadVisorPhotos();
  if (existing.length >= MAX_VISOR_PHOTOS) {
    return existing.slice(0, MAX_VISOR_PHOTOS);
  }
  const id = `visor-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  const next = [...existing, { id, dataUrl }];
  await putVisorPhotoStack(next);
  return next;
}

/**
 * Removes a single Sun Visor photo by ID and persists the updated stack.
 */
export async function removeVisorPhoto(
  id: string,
  current?: readonly VisorPhotoItem[],
): Promise<VisorPhotoItem[]> {
  const existing = current ? [...current] : await loadVisorPhotos();
  const next = existing.filter((item) => item.id !== id);
  await putVisorPhotoStack(next);
  return next;
}

/** Legacy compatibility helpers */
export async function loadVisorPhotoDataUrl(): Promise<string | null> {
  const items = await loadVisorPhotos();
  return items[0]?.dataUrl ?? null;
}

export async function saveVisorPhotoFile(file: File): Promise<string> {
  const next = await addVisorPhotoFile(file, []);
  return next[0]?.dataUrl ?? '';
}

export async function clearVisorPhoto(): Promise<void> {
  await clearVisorPhotos();
}
