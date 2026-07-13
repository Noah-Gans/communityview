/**
 * County for search scope from map center (single Regrid parcels/point lookup).
 */

import {
  readSearchCountySessionState,
  writeSearchCountySessionState,
} from './searchCountyCache';

export function countyLevelPath(path) {
  if (!path || typeof path !== 'string') return null;
  const parts = path.split('/').filter(Boolean);
  if (parts.length < 3 || parts[0] !== 'us') return null;
  return `/${parts.slice(0, 3).join('/')}`;
}

export function toCountyCodeFromPath(path) {
  const countyPath = countyLevelPath(path);
  if (!countyPath) return null;
  const parts = countyPath.split('/').filter(Boolean);
  const state = parts[1];
  const county = parts[2];
  if (!state || !county) return null;
  return `${county}_county_${state}`;
}

export function toCountyDisplayFromPath(path) {
  const countyPath = countyLevelPath(path);
  if (!countyPath) return 'Unknown County';
  const parts = countyPath.split('/').filter(Boolean);
  const state = (parts[1] || '').toUpperCase();
  const countySlug = parts[2] || '';
  const countyName = countySlug
    .split('_')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
  return `${countyName} County, ${state}`;
}

async function lookupCountyAt(lat, lon, radiusMeters, regridRestGet, applyRegridSearchListParams) {
  const params = new URLSearchParams({
    lat: String(lat),
    lon: String(lon),
    radius: String(radiusMeters),
    limit: '1',
  });
  applyRegridSearchListParams(params);

  try {
    const data = await regridRestGet('parcels/point', Object.fromEntries(params));
    const feature = data?.parcels?.features?.[0];
    const rawPath = feature?.properties?.context?.path || feature?.properties?.path || '';
    const path = countyLevelPath(rawPath);
    if (!path) return null;
    return {
      code: toCountyCodeFromPath(path),
      display: toCountyDisplayFromPath(path),
      path,
    };
  } catch {
    return null;
  }
}

/**
 * One parcels/point at map center — bills 1 parcel record.
 * @returns {Promise<{ code, display, path } | null>}
 */
export async function discoverCountyAtMapCenter(map, { regridRestGet, applyRegridSearchListParams }) {
  if (!map?.getCenter) return null;

  const center = map.getCenter();
  return lookupCountyAt(center.lat, center.lng, 0, regridRestGet, applyRegridSearchListParams);
}

/** Dedupe concurrent ensure calls (e.g. React StrictMode double mount). */
let inflightEnsureSessionCounty = null;

/**
 * First search open in a tab session: one map-center lookup, stored as session + map county.
 * Later opens read sessionStorage only (0 Regrid calls).
 */
export async function ensureSessionCountyFromMap(map, { regridRestGet, applyRegridSearchListParams }) {
  const existing = readSearchCountySessionState();
  if (existing?.sessionCounty) {
    return {
      sessionCounty: existing.sessionCounty,
      mapCounty: existing.mapCounty || existing.sessionCounty,
      fromCache: true,
    };
  }

  if (!map?.getCenter) {
    return { sessionCounty: null, mapCounty: null, fromCache: false };
  }

  if (!inflightEnsureSessionCounty) {
    inflightEnsureSessionCounty = discoverCountyAtMapCenter(map, {
      regridRestGet,
      applyRegridSearchListParams,
    }).finally(() => {
      inflightEnsureSessionCounty = null;
    });
  }

  const county = await inflightEnsureSessionCounty;
  if (!county) {
    return { sessionCounty: null, mapCounty: null, fromCache: false };
  }

  writeSearchCountySessionState({ sessionCounty: county, mapCounty: county });
  return { sessionCounty: county, mapCounty: county, fromCache: false };
}

/**
 * Explicit “Update from map” — 1 Regrid call; updates map county only (session county unchanged).
 */
export async function refreshMapCenterCounty(map, { regridRestGet, applyRegridSearchListParams }) {
  if (!map?.getCenter) return null;

  const county = await discoverCountyAtMapCenter(map, { regridRestGet, applyRegridSearchListParams });
  if (!county) return null;

  const existing = readSearchCountySessionState();
  writeSearchCountySessionState({
    sessionCounty: existing?.sessionCounty || county,
    mapCounty: county,
  });
  return county;
}

/** Build a county scope record from a parcel path (no API). */
export function countyRecordFromParcelPath(path) {
  const countyPath = countyLevelPath(path);
  if (!countyPath) return null;
  return {
    code: toCountyCodeFromPath(countyPath),
    display: toCountyDisplayFromPath(countyPath),
    path: countyPath,
  };
}
