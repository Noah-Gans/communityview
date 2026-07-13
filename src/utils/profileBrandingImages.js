import html2canvas from 'html2canvas';
import { httpsCallable } from 'firebase/functions';
import { ref, getBlob, getBytes, getDownloadURL, getStorage } from 'firebase/storage';
import { auth, functions, storage } from '../firebase/firebaseConfig';

const PROFILE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp'];
const STORAGE_GET_TIMEOUT_MS = 8000;
const FETCH_TIMEOUT_MS = 8000;

const brandingCache = new Map();

function cacheKey(uid, photoUrl, logoUrl) {
  return `${uid || ''}|${photoUrl || ''}|${logoUrl || ''}`;
}

function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      window.setTimeout(() => reject(new Error('timeout')), ms);
    }),
  ]);
}

function mimeFromStoragePath(path) {
  const lower = String(path || '').toLowerCase();
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.webp')) return 'image/webp';
  return 'image/jpeg';
}

/** Extract Storage object path from a Firebase download URL. */
export function firebaseStoragePathFromUrl(url) {
  const raw = String(url || '').trim();
  if (!raw.includes('firebasestorage.googleapis.com') && !raw.includes('storage.googleapis.com')) {
    return null;
  }
  try {
    const u = new URL(raw);
    const pathMatch = u.pathname.match(/\/o\/(.+)$/);
    if (!pathMatch) return null;
    return decodeURIComponent(pathMatch[1]);
  } catch (_) {
    return null;
  }
}

function firebaseBucketFromUrl(url) {
  const raw = String(url || '').trim();
  const match = raw.match(/\/b\/([^/]+)\/o\//);
  return match ? decodeURIComponent(match[1]) : null;
}

function storageRefForPath(path, downloadUrl = '') {
  const clean = String(path || '').trim();
  if (!clean) return null;
  const bucket = firebaseBucketFromUrl(downloadUrl);
  const defaultBucket = storage.app?.options?.storageBucket || '';
  if (!bucket || bucket === defaultBucket) {
    return ref(storage, clean);
  }
  return ref(getStorage(storage.app, `gs://${bucket}`), clean);
}

async function getBytesFromStoragePath(path, downloadUrl = '', timeoutMs = STORAGE_GET_TIMEOUT_MS, debugSteps = null) {
  const clean = String(path || '').trim();
  if (!clean) return null;
  const storageRef = storageRefForPath(clean, downloadUrl);
  if (!storageRef) return null;
  try {
    if (typeof auth.authStateReady === 'function') {
      await auth.authStateReady();
    }
    const bytes = await withTimeout(getBytes(storageRef), timeoutMs);
    if (bytes && bytes.byteLength > 0) {
      return new Blob([bytes], { type: mimeFromStoragePath(clean) });
    }
    debugSteps?.push(`Storage getBytes zero-length: ${clean}`);
  } catch (err) {
    debugSteps?.push(`Storage getBytes error (${clean}): ${err?.code || err?.message || err}`);
  }
  return null;
}

async function getBlobFromStoragePath(path, downloadUrl = '', timeoutMs = STORAGE_GET_TIMEOUT_MS, debugSteps = null) {
  const clean = String(path || '').trim();
  if (!clean) return null;
  const storageRef = storageRefForPath(clean, downloadUrl);
  if (!storageRef) return null;
  try {
    if (typeof auth.authStateReady === 'function') {
      await auth.authStateReady();
    }
    const blob = await withTimeout(getBlob(storageRef), timeoutMs);
    if (blob && blob.size > 0) return blob;
    debugSteps?.push(`Storage getBlob zero-length: ${clean}`);
  } catch (err) {
    debugSteps?.push(`Storage getBlob error (${clean}): ${err?.code || err?.message || err}`);
  }
  return null;
}

async function fetchBlobWithTimeout(url, timeoutMs = FETCH_TIMEOUT_MS) {
  const raw = String(url || '').trim();
  if (!raw || (!raw.startsWith('http') && !raw.startsWith('data:'))) return null;
  try {
    const res = await withTimeout(fetch(raw, { mode: 'cors', cache: 'force-cache' }), timeoutMs);
    if (!res.ok) return null;
    const blob = await res.blob();
    if (blob && blob.size > 0) return blob;
  } catch (_) {
    // ignore
  }

  try {
    const blob = await withTimeout(
      new Promise((resolve) => {
        const xhr = new XMLHttpRequest();
        xhr.open('GET', raw, true);
        xhr.responseType = 'blob';
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300 && xhr.response?.size) resolve(xhr.response);
          else resolve(null);
        };
        xhr.onerror = () => resolve(null);
        xhr.send();
      }),
      timeoutMs
    );
    if (blob && blob.size > 0) return blob;
  } catch (_) {
    // ignore
  }
  return null;
}

async function firstSuccessfulBlob(tasks) {
  if (!tasks.length) return null;
  const results = await Promise.allSettled(tasks.map((task) => Promise.resolve().then(task)));
  for (const result of results) {
    if (result.status === 'fulfilled' && result.value && result.value.size > 0) {
      return result.value;
    }
  }
  return null;
}

function profileStoragePaths(uid, kind) {
  const uidSafe = String(uid || '').trim();
  if (!uidSafe) return [];
  const stem = kind === 'photo' ? 'photo' : 'firm-logo';
  return PROFILE_EXTENSIONS.map((ext) => `users/${uidSafe}/profile/${stem}.${ext}`);
}

/**
 * Load profile photo or firm logo blob from Storage / download URL.
 */
export async function loadProfileBrandingBlob(uid, kind, downloadUrl = '') {
  const url = String(downloadUrl || '').trim();
  const path = firebaseStoragePathFromUrl(url);
  const tasks = [];

  if (path) {
    tasks.push(() => getBytesFromStoragePath(path, url));
    tasks.push(() => getBlobFromStoragePath(path, url));
  }
  if (url) {
    tasks.push(() => fetchBlobWithTimeout(url));
  }
  for (const guessPath of profileStoragePaths(uid, kind)) {
    tasks.push(() => getBytesFromStoragePath(guessPath, url));
    tasks.push(() => getBlobFromStoragePath(guessPath, url));
  }

  return firstSuccessfulBlob(tasks);
}

export function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
    reader.onerror = () => reject(reader.error || new Error('Could not read image blob.'));
    reader.readAsDataURL(blob);
  });
}

/** Canvas-safe drawable from a blob (flatten onto white canvas — avoids PNG decode glitches). */
export async function drawableFromBlob(blob) {
  if (!blob || blob.size === 0) return null;

  const objectUrl = URL.createObjectURL(blob);
  try {
    const img = await new Promise((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('image load failed'));
      el.src = objectUrl;
    });
    if (!img.naturalWidth || !img.naturalHeight) return null;

    const w = img.naturalWidth;
    const h = img.naturalHeight;
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);

    return {
      source: canvas,
      width: w,
      height: h,
      release: () => URL.revokeObjectURL(objectUrl),
    };
  } catch (_) {
    URL.revokeObjectURL(objectUrl);
    return null;
  }
}

export function dataUrlToImage(dataUrl) {
  return new Promise((resolve) => {
    const raw = String(dataUrl || '').trim();
    if (!raw) {
      resolve(null);
      return;
    }
    const img = new Image();
    img.onload = () => {
      if (img.naturalWidth > 0 && img.naturalHeight > 0) resolve(img);
      else resolve(null);
    };
    img.onerror = () => resolve(null);
    img.src = raw;
  });
}

async function blobToObjectUrl(blob) {
  if (!blob || blob.size === 0) return '';
  return URL.createObjectURL(blob);
}

export function waitForImageLoaded(img, timeoutMs = 12000) {
  if (!img) return Promise.resolve(false);
  if (img.complete && img.naturalWidth > 0 && img.naturalHeight > 0) {
    return Promise.resolve(true);
  }
  return new Promise((resolve) => {
    const timer = window.setTimeout(() => resolve(false), timeoutMs);
    const finish = (ok) => {
      window.clearTimeout(timer);
      resolve(ok);
    };
    img.onload = () => finish(img.naturalWidth > 0 && img.naturalHeight > 0);
    img.onerror = () => finish(false);
  });
}

async function ensureImageDecoded(img) {
  if (!img) return false;
  if (typeof img.decode === 'function') {
    try {
      await img.decode();
    } catch (_) {
      // decode() can reject on broken images; fall back to onload wait.
    }
  }
  return waitForImageLoaded(img);
}

/** html2canvas copy of an already-loaded <img> (works without CORS, same as shared map). */
async function rasterizeLoadedImageElement(img) {
  if (!img || !img.naturalWidth || !img.naturalHeight) return null;

  const wrap = document.createElement('div');
  wrap.style.cssText = 'position:fixed;left:0;top:0;opacity:0.001;pointer-events:none;z-index:-1;overflow:hidden;';
  const shotImg = document.createElement('img');
  shotImg.src = img.currentSrc || img.src;
  shotImg.width = img.naturalWidth;
  shotImg.height = img.naturalHeight;
  shotImg.style.cssText = `display:block;width:${img.naturalWidth}px;height:${img.naturalHeight}px;`;
  wrap.appendChild(shotImg);
  document.body.appendChild(wrap);

  await ensureImageDecoded(shotImg);

  let canvas = null;
  try {
    canvas = await html2canvas(wrap, {
      backgroundColor: null,
      scale: 1,
      useCORS: true,
      allowTaint: true,
      logging: false,
    });
  } catch (_) {
    canvas = null;
  }
  wrap.remove();

  if (canvas && canvas.width > 0 && canvas.height > 0) {
    return {
      source: canvas,
      width: canvas.width,
      height: canvas.height,
    };
  }
  return null;
}

async function loadBrandingBlobViaCloudFunction(kind, downloadUrl = '', debugSteps = null) {
  if (!functions) {
    debugSteps?.push('Cloud function: Firebase Functions not initialized');
    return null;
  }
  const brandingKind = kind === 'photo' ? 'photo' : 'firm-logo';
  try {
    if (typeof auth.authStateReady === 'function') {
      await auth.authStateReady();
    }
    if (!auth.currentUser) {
      debugSteps?.push('Cloud function: not signed in');
      return null;
    }
    const fn = httpsCallable(functions, 'getProfileBrandingBytes');
    const { data } = await fn({
      kind: brandingKind,
      downloadUrl: String(downloadUrl || '').trim(),
    });
    const base64 = String(data?.base64 || '').trim();
    if (!base64) {
      debugSteps?.push('Cloud function: empty base64 response');
      return null;
    }
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    debugSteps?.push(
      `Cloud function OK (${brandingKind}): ${bytes.length} bytes (${data?.path || 'unknown path'})`
    );
    return new Blob([bytes], { type: data?.mimeType || 'image/png' });
  } catch (err) {
    debugSteps?.push(`Cloud function error (${brandingKind}): ${err?.code || err?.message || err}`);
    return null;
  }
}

async function loadProfileBrandingBlobAggressive(uid, kind, downloadUrl = '', debugSteps = null) {
  const url = String(downloadUrl || '').trim();

  const fromCloud = await loadBrandingBlobViaCloudFunction(kind, url, debugSteps);
  if (fromCloud?.size) return fromCloud;

  const paths = [];
  const parsed = firebaseStoragePathFromUrl(url);
  if (parsed) paths.push(parsed);
  for (const guess of profileStoragePaths(uid, kind)) {
    if (!paths.includes(guess)) paths.push(guess);
  }

  if (!paths.length && !url) {
    debugSteps?.push('Storage: no path or URL to try');
    return null;
  }

  for (const path of paths) {
    const blob = await getBytesFromStoragePath(path, url, STORAGE_GET_TIMEOUT_MS, debugSteps);
    if (blob?.size) return blob;

    const blob2 = await getBlobFromStoragePath(path, url, STORAGE_GET_TIMEOUT_MS, debugSteps);
    if (blob2?.size) return blob2;

    try {
      const freshUrl = await getDownloadURL(ref(storage, path));
      const fetched = await fetchBlobWithTimeout(freshUrl);
      if (fetched?.size) return fetched;
    } catch (_) {
      // try next path
    }
  }

  if (url) {
    const fetched = await fetchBlobWithTimeout(url);
    if (fetched?.size) return fetched;
  }
  return null;
}

/**
 * Load profile photo for PDF footer via Cloud Function / Storage bytes.
 */
export async function loadProfilePhotoDrawableForPdf({ uid, photoUrl = '' } = {}) {
  const url = String(photoUrl || '').trim();
  if (!url && !uid) return null;
  const blob = await loadProfileBrandingBlobAggressive(uid, 'photo', url);
  if (!blob) return null;
  return drawableFromBlob(blob);
}

/**
 * Load firm logo for PDF footer via Cloud Function / Storage bytes.
 */
export async function loadFirmLogoDrawableForPdf({ uid, logoUrl = '' } = {}) {
  const url = String(logoUrl || '').trim();
  if (!url && !uid) return null;
  const blob = await loadProfileBrandingBlobAggressive(uid, 'firm-logo', url);
  if (!blob) return null;
  return drawableFromBlob(blob);
}

/**
 * Load photo + logo as canvas-ready drawables for PDF export.
 */
export async function resolveBrandingDrawablesForPdf({ uid, photoUrl = '', logoUrl = '' } = {}) {
  const [photoBlob, logoBlob] = await Promise.all([
    photoUrl || uid ? loadProfileBrandingBlob(uid, 'photo', photoUrl) : Promise.resolve(null),
    logoUrl || uid ? loadProfileBrandingBlob(uid, 'firm-logo', logoUrl) : Promise.resolve(null),
  ]);

  const [photoDrawable, logoDrawable] = await Promise.all([
    photoBlob ? drawableFromBlob(photoBlob) : Promise.resolve(null),
    logoBlob ? drawableFromBlob(logoBlob) : Promise.resolve(null),
  ]);

  return { photoDrawable, logoDrawable, photoBlob, logoBlob };
}

/**
 * Rasterize an agent/contact card like the shared map sidebar (html2canvas output is canvas-safe).
 */
export async function captureAgentCardCanvasForPdf({
  uid = '',
  photoUrl = '',
  logoUrl = '',
  photoBlob = null,
  logoBlob = null,
  agentName = '',
  agentEmail = '',
  agentPhone = '',
  widthPx = 280,
} = {}) {
  const photo = String(photoUrl || '').trim();
  const logo = String(logoUrl || '').trim();
  if (!photo && !logo && !photoBlob && !logoBlob) return null;

  const [resolvedPhotoBlob, resolvedLogoBlob] = await Promise.all([
    photoBlob || (photo || uid ? loadProfileBrandingBlob(uid, 'photo', photo) : null),
    logoBlob || (logo || uid ? loadProfileBrandingBlob(uid, 'firm-logo', logo) : null),
  ]);

  const [photoSrc, logoSrc] = await Promise.all([
    resolvedPhotoBlob ? blobToObjectUrl(resolvedPhotoBlob) : Promise.resolve(''),
    resolvedLogoBlob ? blobToObjectUrl(resolvedLogoBlob) : Promise.resolve(''),
  ]);

  const objectUrls = [photoSrc, logoSrc].filter(Boolean);

  const holder = document.createElement('div');
  holder.style.cssText = [
    'position:fixed',
    'left:-14000px',
    'top:0',
    `width:${Math.max(200, Math.round(widthPx))}px`,
    'background:#f8fafc',
    'padding:12px',
    'box-sizing:border-box',
    'font-family:Inter,system-ui,sans-serif',
  ].join(';');

  const images = [];
  const hasContactText = Boolean(agentName || agentEmail || agentPhone);

  if (photoSrc || hasContactText) {
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;flex-direction:row;align-items:center;gap:12px;';

    if (photoSrc) {
      const img = document.createElement('img');
      img.src = photoSrc;
      img.alt = '';
      img.style.cssText =
        'width:72px;height:72px;border-radius:50%;object-fit:cover;border:2px solid #e2e8f0;flex-shrink:0;background:#fff;';
      row.appendChild(img);
      images.push(img);
    }

    if (hasContactText) {
      const details = document.createElement('div');
      details.style.cssText = 'flex:1;min-width:0;text-align:left;';
      const nameEl = document.createElement('div');
      nameEl.style.cssText = 'font-weight:700;font-size:14px;color:#0f172a;margin-bottom:3px;';
      nameEl.textContent = agentName || 'Listing Agent';
      details.appendChild(nameEl);
      if (agentEmail) {
        const emailEl = document.createElement('div');
        emailEl.style.cssText = 'font-size:12px;color:#334155;margin-bottom:2px;word-break:break-all;';
        emailEl.textContent = agentEmail;
        details.appendChild(emailEl);
      }
      if (agentPhone) {
        const phoneEl = document.createElement('div');
        phoneEl.style.cssText = 'font-size:12px;color:#334155;';
        phoneEl.textContent = agentPhone;
        details.appendChild(phoneEl);
      }
      row.appendChild(details);
    }

    holder.appendChild(row);
  }

  if (logoSrc) {
    const logoImg = document.createElement('img');
    logoImg.src = logoSrc;
    logoImg.alt = 'Firm logo';
    logoImg.style.cssText =
      'display:block;width:100%;max-height:96px;object-fit:contain;margin-top:10px;padding:10px 14px;border:1px solid #e2e8f0;border-radius:8px;background:#fff;box-sizing:border-box;';
    holder.appendChild(logoImg);
    images.push(logoImg);
  }

  document.body.appendChild(holder);

  const loaded = await Promise.all(images.map((img) => waitForImageLoaded(img)));
  const hasRenderableImage = loaded.some(Boolean);
  if (!hasRenderableImage && !hasContactText) {
    holder.remove();
    objectUrls.forEach((url) => URL.revokeObjectURL(url));
    return null;
  }

  await new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(resolve));
  });

  let shot = null;
  try {
    shot = await html2canvas(holder, {
      backgroundColor: '#f8fafc',
      scale: 2,
      useCORS: false,
      allowTaint: false,
      logging: false,
    });
  } catch (_) {
    shot = null;
  }

  holder.remove();
  objectUrls.forEach((url) => URL.revokeObjectURL(url));
  return shot;
}

/**
 * Preload account branding for PDF export (canvas-safe drawables + data URLs).
 */
export async function preloadBrandingForPdfExport({ uid, photoUrl = '', logoUrl = '' } = {}) {
  const key = cacheKey(uid, photoUrl, logoUrl);
  const cached = brandingCache.get(key);
  if (cached) return cached;

  const task = (async () => {
    const { photoDrawable, logoDrawable, photoBlob, logoBlob } = await resolveBrandingDrawablesForPdf({
      uid,
      photoUrl,
      logoUrl,
    });

    let photoDataUrl = '';
    let logoDataUrl = '';
    if (photoBlob) {
      try {
        photoDataUrl = await blobToDataUrl(photoBlob);
      } catch (_) {
        // ignore
      }
    }
    if (logoBlob) {
      try {
        logoDataUrl = await blobToDataUrl(logoBlob);
      } catch (_) {
        // ignore
      }
    }

    return { photoDataUrl, logoDataUrl, photoDrawable, logoDrawable, photoBlob, logoBlob };
  })();

  return task;
}
