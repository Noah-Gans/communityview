/**
 * Helpers for pulling images out of a browser drag/drop or clipboard (paste)
 * payload. Shared by the map builder photo surfaces (image gallery upload and
 * the map-element popup editor) so both accept drag-and-drop and ⌘V / Ctrl+V.
 */

const IMAGE_URL_RE = /^https?:\/\/.+\.(jpe?g|png|webp|gif)(\?|#|$)/i;
const IMAGE_HOST_HINT =
  /imagereader|cdn|cloudfront|cloudinary|imgix|media|photo|listing|property|mls|gtsstatic|sotheby|zillow|redfin|realtor/i;

function looksLikeImageUrl(url) {
  const value = String(url || '').trim();
  if (!/^https?:\/\//i.test(value)) return false;
  if (IMAGE_URL_RE.test(value)) return true;
  try {
    const host = new URL(value).hostname;
    return IMAGE_HOST_HINT.test(host) || /[?&](w|width|q|quality|format)=/i.test(value);
  } catch (_) {
    return false;
  }
}

function pushUniqueUrl(out, seen, url) {
  const value = String(url || '').trim();
  if (!looksLikeImageUrl(value) || seen.has(value)) return;
  seen.add(value);
  out.push(value);
}

/** Collect image URLs from a browser drag/paste DataTransfer payload. */
export function extractImageUrlsFromDataTransfer(dataTransfer) {
  if (!dataTransfer) return [];
  const out = [];
  const seen = new Set();

  const uriList = String(dataTransfer.getData?.('text/uri-list') || '');
  uriList
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'))
    .forEach((url) => pushUniqueUrl(out, seen, url));

  const html = String(dataTransfer.getData?.('text/html') || '');
  const imgSrcMatches = html.matchAll(/<img[^>]+src=["']([^"']+)["']/gi);
  for (const match of imgSrcMatches) {
    pushUniqueUrl(out, seen, match[1]);
  }

  const plain = String(dataTransfer.getData?.('text/plain') || '');
  plain
    .split(/\s+/)
    .map((part) => part.trim())
    .forEach((url) => pushUniqueUrl(out, seen, url));

  return out;
}

/** Collect File objects from drag/paste (including image items without a filename). */
export function extractImageFilesFromDataTransfer(dataTransfer) {
  if (!dataTransfer) return [];
  const files = [];
  const seen = new Set();

  const pushFile = (file) => {
    if (!file || !String(file.type || '').startsWith('image/')) return;
    const key = `${file.name}:${file.size}:${file.lastModified}`;
    if (seen.has(key)) return;
    seen.add(key);
    files.push(file);
  };

  Array.from(dataTransfer.files || []).forEach(pushFile);

  const items = Array.from(dataTransfer.items || []);
  for (const item of items) {
    if (item.kind !== 'file') continue;
    const file = item.getAsFile?.();
    pushFile(file);
  }

  return files;
}

/**
 * Turn a remote image URL into a File when CORS allows.
 * Returns null when the host blocks browser fetch — caller can keep the raw URL.
 */
export async function fetchImageUrlAsFile(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      mode: 'cors',
      credentials: 'omit',
    });
    if (!response.ok) return null;
    const blob = await response.blob();
    if (!blob.type.startsWith('image/')) return null;
    const ext =
      blob.type === 'image/png' ? 'png' : blob.type === 'image/webp' ? 'webp' : 'jpg';
    return new File([blob], `dropped-photo.${ext}`, { type: blob.type });
  } catch (_) {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
