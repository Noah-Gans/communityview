/**
 * Map photo references stored on print elements (Firestore) — bytes live in Firebase Storage.
 *
 * New shape: { url: string, storagePath?: string }
 * Legacy: bare data: or https string in photoGallery / photoDataUrl
 */

export const MAX_MAP_PHOTO_BYTES = 10 * 1024 * 1024;
export const MAX_MAP_PHOTO_SOURCE_BYTES = 40 * 1024 * 1024;
export const MAP_PHOTO_MAX_EDGE_PX = 2048;
export const MAP_PHOTO_JPEG_QUALITY = 0.85;

const ALLOWED_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
]);

function fileNameLooksHeic(file) {
  const name = String(file?.name || '').toLowerCase();
  return name.endsWith('.heic') || name.endsWith('.heif');
}

function isAcceptedMapPhotoInput(file) {
  const type = String(file?.type || '').toLowerCase();
  if (ALLOWED_TYPES.has(type)) return true;
  if (fileNameLooksHeic(file)) return true;
  return false;
}

export function validateMapPhotoFile(file) {
  if (!file) return 'No file selected.';
  if (!isAcceptedMapPhotoInput(file)) return 'Use a JPG, PNG, WebP, or iPhone photo (HEIC).';
  if (file.size > MAX_MAP_PHOTO_SOURCE_BYTES) return 'Image is too large to process. Use a file under 40 MB.';
  return null;
}

function loadHtmlImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Could not read that image.'));
    img.src = url;
  });
}

async function decodeMapPhoto(file) {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(file);
    } catch (_) {
      /* fall through to <img> */
    }
  }
  const objectUrl = URL.createObjectURL(file);
  try {
    return await loadHtmlImage(objectUrl);
  } catch (err) {
    if (fileNameLooksHeic(file) || String(file?.type || '').includes('heic') || String(file?.type || '').includes('heif')) {
      throw new Error(
        'This iPhone photo could not be read in this browser. Try Safari, or export it as JPG.'
      );
    }
    throw err instanceof Error ? err : new Error('Could not read that image.');
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function fitWithinMaxEdge(width, height, maxEdge) {
  const w = Number(width) || 0;
  const h = Number(height) || 0;
  if (w <= 0 || h <= 0) return { width: 1, height: 1 };
  const longest = Math.max(w, h);
  if (longest <= maxEdge) return { width: Math.round(w), height: Math.round(h) };
  const scale = maxEdge / longest;
  return {
    width: Math.max(1, Math.round(w * scale)),
    height: Math.max(1, Math.round(h * scale)),
  };
}

function canvasToJpegBlob(canvas, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) reject(new Error('Could not encode that image.'));
        else resolve(blob);
      },
      'image/jpeg',
      quality
    );
  });
}

/**
 * Downscale and JPEG-encode oversized map photos so they fit Storage (10 MB)
 * and look sharp on tour slides. Small JPG/PNG/WebP files pass through.
 */
export async function prepareMapPhotoForUpload(file) {
  const validationError = validateMapPhotoFile(file);
  if (validationError) throw new Error(validationError);

  const decoded = await decodeMapPhoto(file);
  const srcW = decoded.width || decoded.naturalWidth;
  const srcH = decoded.height || decoded.naturalHeight;
  const type = String(file.type || '').toLowerCase();
  const alreadyWebSafe = type === 'image/jpeg' || type === 'image/png' || type === 'image/webp';
  const smallEnough =
    file.size <= MAX_MAP_PHOTO_BYTES &&
    Math.max(srcW, srcH) <= MAP_PHOTO_MAX_EDGE_PX;

  if (alreadyWebSafe && smallEnough) {
    if (typeof decoded.close === 'function') decoded.close();
    return file;
  }

  try {
    const { width, height } = fitWithinMaxEdge(srcW, srcH, MAP_PHOTO_MAX_EDGE_PX);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('Could not shrink that image.');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(decoded, 0, 0, width, height);

    let quality = MAP_PHOTO_JPEG_QUALITY;
    let blob = await canvasToJpegBlob(canvas, quality);
    while (blob.size > MAX_MAP_PHOTO_BYTES && quality > 0.55) {
      quality = Math.round((quality - 0.1) * 10) / 10;
      blob = await canvasToJpegBlob(canvas, quality);
    }
    if (blob.size > MAX_MAP_PHOTO_BYTES) {
      throw new Error('Could not shrink this image enough to upload.');
    }
    const base = String(file.name || 'photo').replace(/\.[^.]+$/, '') || 'photo';
    return new File([blob], `${base}.jpg`, { type: 'image/jpeg', lastModified: Date.now() });
  } finally {
    if (typeof decoded.close === 'function') decoded.close();
  }
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
