const store = new Map();
let seq = 0;
const MAX_BUFFERED = 16;

const MIME = 'application/x-communityview-print-gallery';

export { MIME as PRINT_GALLERY_DRAG_MIME };

function serializePayload(photo) {
  const normalized =
    typeof photo === 'string'
      ? { url: photo, storagePath: null }
      : photo && typeof photo === 'object'
        ? {
            url: String(photo.url || '').trim(),
            storagePath: photo.storagePath ? String(photo.storagePath) : null,
          }
        : null;
  if (!normalized?.url) return null;
  return JSON.stringify(normalized);
}

/** @param {string | { url: string, storagePath?: string | null }} photo */
export function registerPrintGalleryDragPayload(photo) {
  const payload = serializePayload(photo);
  if (!payload) return '';
  while (store.size >= MAX_BUFFERED) {
    const k = store.keys().next().value;
    if (!k) break;
    store.delete(k);
  }
  const id = `cvpg_${++seq}_${Date.now().toString(36)}`;
  store.set(id, payload);
  return id;
}

/** @returns {{ url: string, storagePath: string | null } | null} */
export function takePrintGalleryDragPayload(id) {
  if (!id || typeof id !== 'string') return null;
  const raw = store.get(id);
  store.delete(id);
  if (!raw) return null;
  if (raw.startsWith('{')) {
    try {
      const parsed = JSON.parse(raw);
      const url = String(parsed?.url || '').trim();
      if (!url) return null;
      return {
        url,
        storagePath: parsed.storagePath ? String(parsed.storagePath) : null,
      };
    } catch (_) {
      return null;
    }
  }
  return { url: raw, storagePath: null };
}
