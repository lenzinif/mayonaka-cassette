const VISOR_DB_NAME = 'mayonaka-cassette-cockpit';
const VISOR_DB_VERSION = 1;
const VISOR_STORE_NAME = 'visor-photo';
const VISOR_PRIMARY_KEY = 'primary';

const MAX_VISOR_WIDTH = 512;
const MAX_VISOR_HEIGHT = 384;
const IMAGE_EXT_REGEX = /\.(png|jpe?g|webp|gif|bmp|avif)$/i;

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

async function putVisorDataUrl(dataUrl: string): Promise<void> {
  const db = await openVisorDb();
  if (!db) return;
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(VISOR_STORE_NAME, 'readwrite');
      const store = tx.objectStore(VISOR_STORE_NAME);
      const req = store.put(dataUrl, VISOR_PRIMARY_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? req.error ?? new Error('IndexedDB write failed'));
      tx.onabort = () => reject(tx.error ?? new Error('IndexedDB write aborted'));
    });
  } finally {
    db.close();
  }
}

export async function loadVisorPhotoDataUrl(): Promise<string | null> {
  const db = await openVisorDb();
  if (!db) return null;
  try {
    return await new Promise<string | null>((resolve) => {
      const tx = db.transaction(VISOR_STORE_NAME, 'readonly');
      const store = tx.objectStore(VISOR_STORE_NAME);
      const req = store.get(VISOR_PRIMARY_KEY);
      req.onsuccess = () => {
        resolve(typeof req.result === 'string' ? req.result : null);
      };
      req.onerror = () => resolve(null);
      tx.onabort = () => resolve(null);
    });
  } catch {
    return null;
  } finally {
    db.close();
  }
}

export async function clearVisorPhoto(): Promise<void> {
  const db = await openVisorDb();
  if (!db) return;
  try {
    await new Promise<void>((resolve) => {
      const tx = db.transaction(VISOR_STORE_NAME, 'readwrite');
      const store = tx.objectStore(VISOR_STORE_NAME);
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
  // Fill dark backdrop before JPEG encoding so transparent PNGs do not composite onto black
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

/**
 * Validates, resizes client-side (`<= 512x384`), and persists a local photo
 * into IndexedDB (`mayonaka-cassette-cockpit`) for the Sun Visor slot.
 */
export async function saveVisorPhotoFile(file: File): Promise<string> {
  if (!isSupportedVisorImageFile(file)) {
    throw new Error('Selected file is not a supported image');
  }

  let dataUrl: string;
  if (typeof document !== 'undefined' && typeof Image !== 'undefined') {
    if (typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function') {
      const objectUrl = URL.createObjectURL(file);
      try {
        const img = await loadImageElement(objectUrl);
        dataUrl = encodeResizedImage(img);
      } finally {
        URL.revokeObjectURL(objectUrl);
      }
    } else {
      const rawUrl = await readFileAsDataUrl(file);
      const img = await loadImageElement(rawUrl);
      dataUrl = encodeResizedImage(img);
    }
  } else {
    dataUrl = await readFileAsDataUrl(file);
  }

  await putVisorDataUrl(dataUrl);
  return dataUrl;
}
