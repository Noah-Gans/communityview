/** Session storage for search county scope — at most one Regrid lookup until explicit refresh. */

export const SEARCH_COUNTY_SESSION_KEY = 'cv_search_map_county_v1';
export const SEARCH_COUNTY_MODE_KEY = 'cv_search_county_mode_v1';

/** @typedef {'nationwide' | 'saved' | 'map'} SearchCountyMode */

/**
 * @typedef {Object} SearchCountyRecord
 * @property {string} code
 * @property {string} display
 * @property {string} path
 */

/**
 * @returns {{ sessionCounty: SearchCountyRecord | null, mapCounty: SearchCountyRecord | null, fetchedAt?: number } | null}
 */
export function readSearchCountySessionState() {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(SEARCH_COUNTY_SESSION_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);

    const legacy = Array.isArray(data?.counties) ? data.counties[0] : null;
    const sessionCounty = normalizeCountyRecord(data?.sessionCounty || legacy);
    const mapCounty = normalizeCountyRecord(data?.mapCounty || sessionCounty);

    if (!sessionCounty && !mapCounty) return null;
    return { sessionCounty, mapCounty, fetchedAt: data?.fetchedAt };
  } catch {
    return null;
  }
}

/** @param {unknown} value */
export function normalizeCountyRecord(value) {
  if (!value || typeof value !== 'object') return null;
  const path = value.path || value.code;
  if (!path) return null;
  return {
    code: value.code || path,
    display: value.display || path,
    path,
  };
}

/**
 * @param {{ sessionCounty: SearchCountyRecord | null, mapCounty?: SearchCountyRecord | null }} payload
 */
export function writeSearchCountySessionState({ sessionCounty, mapCounty }) {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(
      SEARCH_COUNTY_SESSION_KEY,
      JSON.stringify({
        sessionCounty,
        mapCounty: mapCounty || sessionCounty,
        fetchedAt: Date.now(),
      })
    );
  } catch {
    /* quota / private mode */
  }
}

export function clearSearchCountySessionCache() {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.removeItem(SEARCH_COUNTY_SESSION_KEY);
    window.sessionStorage.removeItem(SEARCH_COUNTY_MODE_KEY);
  } catch {
    /* ignore */
  }
}

/** @returns {SearchCountyMode} */
export function readSearchCountyMode() {
  if (typeof window === 'undefined') return 'nationwide';
  try {
    const raw = window.sessionStorage.getItem(SEARCH_COUNTY_MODE_KEY);
    if (raw === 'saved' || raw === 'map' || raw === 'nationwide') return raw;
    if (raw === 'session') return 'saved';
  } catch {
    /* ignore */
  }
  return 'nationwide';
}

/** @param {SearchCountyMode} mode */
export function writeSearchCountyMode(mode) {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(SEARCH_COUNTY_MODE_KEY, mode);
  } catch {
    /* ignore */
  }
}
