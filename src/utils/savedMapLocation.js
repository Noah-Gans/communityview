import queryString from 'query-string';
import { DEFAULT_MAP_VIEW } from '../pages/map/mapConstants';

const STORAGE_KEY = 'cv_saved_map_location';

/** Zoom for “near me” (location button). */
export const SAVED_LOCATION_ZOOM_NEAR = 18;

/** Default regional zoom when reopening the map on a saved location. */
export const SAVED_LOCATION_REGION_ZOOM_DEFAULT = 10;

function readRaw() {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

function writeRaw(data) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    /* ignore quota / private mode */
  }
}

export function computeRegionalZoom(accuracyMeters) {
  if (!Number.isFinite(accuracyMeters) || accuracyMeters <= 0) {
    return SAVED_LOCATION_REGION_ZOOM_DEFAULT;
  }
  if (accuracyMeters <= 30) return 11;
  if (accuracyMeters <= 100) return 10;
  if (accuracyMeters <= 500) return 9;
  return 8;
}

export function hasExplicitMapLocationInUrl(search) {
  const params = queryString.parse(search || '');
  const lat = params.lat != null ? parseFloat(String(params.lat)) : NaN;
  const lng = params.lng != null ? parseFloat(String(params.lng)) : NaN;
  return Number.isFinite(lat) && Number.isFinite(lng);
}

const PRODUCT_MAP_SESSION_ROUTES = new Set(['/search', '/print', '/report']);

export function isSharedOrTourMapRoute(pathname) {
  const p = String(pathname || '');
  return p.startsWith('/view/') || p.startsWith('/tour/');
}

export function isMainMapRoute(pathname) {
  const p = String(pathname || '');
  return p === '/map' || p.startsWith('/map/');
}

/** True when saved location may be used instead of the continental default. */
export function shouldUseSavedMapLocation(search, pathname) {
  if (isSharedOrTourMapRoute(pathname)) return false;
  if (hasExplicitMapLocationInUrl(search)) return false;
  if (!isMainMapRoute(pathname)) return false;
  return true;
}

/**
 * Fly to saved home only when entering /map from outside the product shell.
 * Search / Print / Report keep the map mounted — preserve the current camera.
 */
export function shouldFlyToSavedLocationOnRouteChange(prevPathname, nextPathname, search) {
  if (nextPathname !== '/map') return false;
  if (!shouldUseSavedMapLocation(search, nextPathname)) return false;
  const prev = String(prevPathname || '');
  if (!prev || prev === '/map') return false;
  if (PRODUCT_MAP_SESSION_ROUTES.has(prev)) return false;
  return Boolean(getSavedMapLocation());
}

/**
 * @returns {{
 *   lat: number,
 *   lng: number,
 *   zoomNear: number,
 *   regionZoom: number,
 *   accuracy?: number,
 *   savedAt: number,
 *   source: 'geolocation' | 'manual',
 *   permission: 'granted' | 'denied' | 'prompt',
 *   rememberEnabled: boolean,
 *   promptSeen: boolean,
 * }|null}
 */
export function getSavedMapLocation() {
  const raw = readRaw();
  if (!raw) return null;
  const lat = Number(raw.lat);
  const lng = Number(raw.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    if (raw.promptSeen) return raw;
    return null;
  }
  return {
    lat,
    lng,
    zoomNear: Number.isFinite(Number(raw.zoomNear)) ? Number(raw.zoomNear) : SAVED_LOCATION_ZOOM_NEAR,
    regionZoom: Number.isFinite(Number(raw.regionZoom))
      ? Number(raw.regionZoom)
      : computeRegionalZoom(Number(raw.accuracy)),
    accuracy: Number.isFinite(Number(raw.accuracy)) ? Number(raw.accuracy) : undefined,
    savedAt: Number(raw.savedAt) || Date.now(),
    source: raw.source === 'manual' ? 'manual' : 'geolocation',
    permission: raw.permission === 'denied' ? 'denied' : raw.permission === 'granted' ? 'granted' : 'prompt',
    rememberEnabled: raw.rememberEnabled !== false,
    promptSeen: Boolean(raw.promptSeen),
  };
}

export function saveMapLocationFromGeolocation({ latitude, longitude, accuracy, source = 'geolocation' }) {
  const lat = Number(latitude);
  const lng = Number(longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  const acc = Number.isFinite(Number(accuracy)) ? Number(accuracy) : undefined;
  const payload = {
    lat,
    lng,
    zoomNear: SAVED_LOCATION_ZOOM_NEAR,
    regionZoom: computeRegionalZoom(acc),
    accuracy: acc,
    savedAt: Date.now(),
    source: source === 'manual' ? 'manual' : 'geolocation',
    permission: 'granted',
    rememberEnabled: true,
  };
  writeRaw(payload);
  return payload;
}

export function markLocationPermissionDenied() {
  const existing = readRaw() || {};
  writeRaw({
    ...existing,
    permission: 'denied',
    rememberEnabled: false,
    savedAt: existing.savedAt || Date.now(),
  });
}

/**
 * Map init / reopen view: URL → saved regional view → continental US default.
 * @returns {{ center: [number, number], zoom: number, source: 'url' | 'saved' | 'default' }}
 */
export function resolveInitialMapView(search, pathname) {
  if (hasExplicitMapLocationInUrl(search)) {
    const params = queryString.parse(search || '');
    return {
      center: [parseFloat(String(params.lng)), parseFloat(String(params.lat))],
      zoom: params.zoom != null ? parseFloat(String(params.zoom)) : DEFAULT_MAP_VIEW.zoom,
      source: 'url',
    };
  }

  if (shouldUseSavedMapLocation(search, pathname)) {
    const saved = getSavedMapLocation();
    if (
      saved &&
      saved.rememberEnabled !== false &&
      saved.permission === 'granted' &&
      Number.isFinite(saved.lat) &&
      Number.isFinite(saved.lng)
    ) {
      return {
        center: [saved.lng, saved.lat],
        zoom: saved.regionZoom ?? computeRegionalZoom(saved.accuracy),
        source: 'saved',
      };
    }
  }

  return {
    center: DEFAULT_MAP_VIEW.center,
    zoom: DEFAULT_MAP_VIEW.zoom,
    source: 'default',
  };
}

export function getSavedRegionalFlyToOptions(saved) {
  if (!saved || !Number.isFinite(saved.lat) || !Number.isFinite(saved.lng)) return null;
  return {
    center: [saved.lng, saved.lat],
    zoom: saved.regionZoom ?? computeRegionalZoom(saved.accuracy),
    duration: 1200,
    essential: true,
  };
}
