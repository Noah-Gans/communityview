/**
 * Map photo references stored on print elements (Firestore) — bytes live in Firebase Storage.
 *
 * New shape: { url: string, storagePath?: string }
 * Legacy: bare data: or https string in photoGallery / photoDataUrl
 */

export const MAX_MAP_PHOTO_BYTES = 10 * 1024 * 1024;

const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

export function validateMapPhotoFile(file) {
  if (!file) return 'No file selected.';
  if (!ALLOWED_TYPES.has(file.type)) return 'Use a JPG, PNG, or WebP image.';
  if (file.size > MAX_MAP_PHOTO_BYTES) return 'Image must be 10 MB or smaller.';
  return null;
}

/** @param {unknown} entry */
export function normalizePhotoEntry(entry) {
  if (entry == null) return null;
  if (typeof entry === 'string') {
    const url = entry.trim();
    if (!url) return null;
    return { url, storagePath: null };
  }
  if (typeof entry === 'object') {
    const o = /** @type {{ url?: string, storagePath?: string }} */ (entry);
    const url = String(o.url || '').trim();
    if (!url) return null;
    return {
      url,
      storagePath: o.storagePath ? String(o.storagePath) : null,
    };
  }
  return null;
}

/** @param {unknown} entry */
export function photoEntryToSrc(entry) {
  return normalizePhotoEntry(entry)?.url || '';
}

/** @param {unknown} gallery */
export function normalizePhotoGallery(gallery) {
  if (!Array.isArray(gallery)) return [];
  return gallery.map(normalizePhotoEntry).filter(Boolean);
}

/** @param {object | null | undefined} el */
export function getPhotosFromElement(el) {
  if (!el || typeof el !== 'object') return [];
  const fromGallery = normalizePhotoGallery(el.photoGallery);
  if (fromGallery.length) return fromGallery;
  const legacy = normalizePhotoEntry(el.photoDataUrl);
  return legacy ? [legacy] : [];
}

/** @param {object | null | undefined} el */
export function getPhotoSrcListFromElement(el) {
  return getPhotosFromElement(el).map((p) => p.url);
}

/** Gallery sidebar item or feature row with url / legacy dataUrl */
export function galleryItemToSrc(item) {
  if (!item) return '';
  if (typeof item.url === 'string' && item.url.trim()) return item.url.trim();
  if (typeof item.dataUrl === 'string' && item.dataUrl.trim()) return item.dataUrl.trim();
  return '';
}

/** Persist only URL + storagePath (never embed new base64 in Firestore). */
export function sanitizePhotoGalleryForFirestore(gallery) {
  return normalizePhotoGallery(gallery).map(({ url, storagePath }) => {
    const row = { url };
    if (storagePath) row.storagePath = storagePath;
    return row;
  });
}
