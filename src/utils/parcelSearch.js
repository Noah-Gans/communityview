import { countyCodeToRegridPath } from './regridCountyMapping';
import { regridRestGet } from '../services/regridService';
import { applyRegridSearchListParams } from './regridParcelApi';
import { mapRegridToLegacy } from './parcelSearchMapper';

export const DEFAULT_PARCEL_SEARCH_LIMIT = 5;
/** Soft cap so nationwide / awkward address queries cannot hang the UI forever. */
export const PARCEL_SEARCH_TIMEOUT_MS = 15000;
export const PARCEL_SEARCH_REQUEST_TIMEOUT_MS = 10000;

function withTimeout(promise, ms, label = 'request') {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error(`${label} timed out after ${ms}ms`));
    }, ms);
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

/**
 * Strip trailing state + ZIP (or ZIP alone) so nationwide address search stays fast.
 * e.g. "23636 Ten Barr Trail Bend, OR 97701" → "23636 Ten Barr Trail Bend"
 */
export function stripTrailingPostalSuffix(query) {
  return String(query || '')
    .trim()
    .replace(/,?\s*[A-Za-z]{2}\.?\s+\d{5}(?:-\d{4})?\s*$/i, '')
    .replace(/\s+\d{5}(?:-\d{4})?\s*$/, '')
    .replace(/,\s*$/, '')
    .trim();
}

function detectSearchIntent(input) {
  const value = (input || '').trim();
  if (!value) return 'owner';
  const digitsOnly = value.replace(/\D/g, '');
  const apnLikeDelimited = /^(?=.*\d)[A-Za-z0-9\-./ ]{5,}$/.test(value) && /[\d]/.test(value) && /[-./]/.test(value);
  const apnLikeNumeric = /^\d{8,}$/.test(value) || digitsOnly.length >= 8;
  const apnLike = apnLikeDelimited || apnLikeNumeric;
  const addressLike = /^\d+\s+[A-Za-z]/.test(value);
  if (apnLike) return 'apn';
  if (addressLike) return 'address';
  return 'owner';
}

function parseRegridResponse(data) {
  let features = [];
  if (data.parcels) {
    if (Array.isArray(data.parcels)) features = data.parcels;
    else if (data.parcels.features && Array.isArray(data.parcels.features)) features = data.parcels.features;
    else if (data.parcels.type === 'FeatureCollection' && Array.isArray(data.parcels.features)) features = data.parcels.features;
  } else if (data.features && Array.isArray(data.features)) {
    features = data.features;
  } else if (Array.isArray(data)) {
    features = data;
  }
  return features;
}

function appendNoGeometryFlags(params) {
  params.append('return_geometry', 'false');
  params.append('return_zoning', 'false');
  params.append('return_matched_buildings', 'false');
  params.append('return_matched_addresses', 'false');
  params.append('return_enhanced_ownership', 'false');
}

function packFeatures(features, effectiveLimit) {
  const mapped = features.map(mapRegridToLegacy);
  const newNextOffsetId = features[features.length - 1]?.id ?? null;
  return {
    results: mapped,
    hasMore: features.length === effectiveLimit && newNextOffsetId !== null,
    nextOffsetId: newNextOffsetId,
  };
}

async function searchParcelsInner(query, options = {}) {
  const {
    limit = DEFAULT_PARCEL_SEARCH_LIMIT,
    countyCodes = [],
    offsetId = null,
    maxLimit = DEFAULT_PARCEL_SEARCH_LIMIT,
    requestTimeoutMs = PARCEL_SEARCH_REQUEST_TIMEOUT_MS,
  } = options;

  const trimmedQuery = String(query || '').trim();
  if (!trimmedQuery) {
    return { results: [], hasMore: false, nextOffsetId: null };
  }

  const params = new URLSearchParams();
  const searchIntent = detectSearchIntent(trimmedQuery);
  const normalizedApn = trimmedQuery.replace(/[^A-Za-z0-9]/g, '');
  // Address endpoint often stalls nationwide when city/state/ZIP are appended.
  const addressQuery =
    searchIntent === 'address'
      ? stripTrailingPostalSuffix(trimmedQuery) || trimmedQuery
      : trimmedQuery;

  if (searchIntent === 'apn') params.append('fields[parcelnumb][ilike]', trimmedQuery);
  else if (searchIntent === 'address') params.append('fields[address][ilike]', addressQuery);
  else params.append('fields[owner][ilike]', trimmedQuery);

  const effectiveLimit = Math.min(limit, maxLimit);
  params.append('limit', effectiveLimit.toString());
  if (offsetId !== null && offsetId !== undefined) {
    params.append('offset_id', String(offsetId));
  }
  applyRegridSearchListParams(params);

  const makeRegridRequest = async (requestParams, endpoint = 'query') => {
    applyRegridSearchListParams(requestParams);
    try {
      const data = await withTimeout(
        regridRestGet(`parcels/${endpoint}`, Object.fromEntries(requestParams)),
        requestTimeoutMs,
        `Regrid ${endpoint}`
      );
      return parseRegridResponse(data);
    } catch (error) {
      console.warn(`Regrid parcel search ${endpoint} failed/timed out:`, error?.message || error);
      return [];
    }
  };

  const rawCountyValues = Array.isArray(countyCodes) ? countyCodes : [];
  const directPaths = rawCountyValues.filter((value) => typeof value === 'string' && value.startsWith('/us/'));
  const mappedPaths = countyCodeToRegridPath(rawCountyValues.filter((value) => !directPaths.includes(value)));
  const regridPaths = [...directPaths, ...mappedPaths];

  const canUseOwnerEndpoint = trimmedQuery.length >= 4 && searchIntent === 'owner';
  const canUseAddressEndpoint = addressQuery.length >= 4 && searchIntent === 'address';
  const canUseApnEndpoint = trimmedQuery.length >= 3 && searchIntent === 'apn';

  const tryEndpoint = async (buildParams, endpoint) => {
    const p = buildParams();
    appendNoGeometryFlags(p);
    const features = await makeRegridRequest(p, endpoint);
    if (features.length > 0) return packFeatures(features, effectiveLimit);
    return null;
  };

  if (regridPaths.length === 0) {
    if (canUseApnEndpoint) {
      const hit = await tryEndpoint(() => {
        const p = new URLSearchParams();
        p.append('parcelnumb', normalizedApn);
        p.append('limit', effectiveLimit.toString());
        return p;
      }, 'apn');
      if (hit) return hit;
    }
    if (canUseAddressEndpoint) {
      const hit = await tryEndpoint(() => {
        const p = new URLSearchParams();
        p.append('query', addressQuery);
        p.append('limit', effectiveLimit.toString());
        return p;
      }, 'address');
      if (hit) return hit;
    }
    if (canUseOwnerEndpoint) {
      const hit = await tryEndpoint(() => {
        const p = new URLSearchParams();
        p.append('owner', trimmedQuery);
        p.append('limit', effectiveLimit.toString());
        if (offsetId !== null && offsetId !== undefined) p.append('offset_id', String(offsetId));
        return p;
      }, 'owner');
      if (hit) return hit;
    }
    const features = await makeRegridRequest(params, 'query');
    return packFeatures(features, effectiveLimit);
  }

  if (regridPaths.length === 1) {
    const path = regridPaths[0];
    params.append('path', path);
    if (canUseApnEndpoint) {
      let hit = await tryEndpoint(() => {
        const p = new URLSearchParams();
        p.append('parcelnumb', normalizedApn);
        p.append('path', path);
        p.append('limit', effectiveLimit.toString());
        return p;
      }, 'apn');
      if (!hit) {
        hit = await tryEndpoint(() => {
          const p = new URLSearchParams();
          p.append('parcelnumb', normalizedApn);
          p.append('limit', effectiveLimit.toString());
          return p;
        }, 'apn');
      }
      if (hit) return hit;
    }
    if (canUseAddressEndpoint) {
      let hit = await tryEndpoint(() => {
        const p = new URLSearchParams();
        p.append('query', addressQuery);
        p.append('path', path);
        p.append('limit', effectiveLimit.toString());
        return p;
      }, 'address');
      if (!hit) {
        hit = await tryEndpoint(() => {
          const p = new URLSearchParams();
          p.append('query', addressQuery);
          p.append('limit', effectiveLimit.toString());
          return p;
        }, 'address');
      }
      if (hit) return hit;
    }
    if (canUseOwnerEndpoint) {
      const hit = await tryEndpoint(() => {
        const p = new URLSearchParams();
        p.append('owner', trimmedQuery);
        p.append('path', path);
        p.append('limit', effectiveLimit.toString());
        if (offsetId !== null && offsetId !== undefined) p.append('offset_id', String(offsetId));
        return p;
      }, 'owner');
      if (hit) return hit;
    }
    const features = await makeRegridRequest(params, 'query');
    return packFeatures(features, effectiveLimit);
  }

  const allFeatures = [];
  const limitPerCounty = Math.ceil(effectiveLimit / regridPaths.length);
  for (const path of regridPaths) {
    const countyParams = new URLSearchParams(params);
    countyParams.set('path', path);
    countyParams.set('limit', limitPerCounty.toString());
    try {
      let features = [];
      if (canUseApnEndpoint) {
        const p = new URLSearchParams();
        p.append('parcelnumb', normalizedApn);
        p.append('path', path);
        p.append('limit', limitPerCounty.toString());
        appendNoGeometryFlags(p);
        features = await makeRegridRequest(p, 'apn');
      }
      if (features.length === 0 && canUseAddressEndpoint) {
        const p = new URLSearchParams();
        p.append('query', addressQuery);
        p.append('path', path);
        p.append('limit', limitPerCounty.toString());
        appendNoGeometryFlags(p);
        features = await makeRegridRequest(p, 'address');
      }
      if (features.length === 0 && canUseOwnerEndpoint) {
        const p = new URLSearchParams();
        p.append('owner', trimmedQuery);
        p.append('path', path);
        p.append('limit', limitPerCounty.toString());
        appendNoGeometryFlags(p);
        features = await makeRegridRequest(p, 'owner');
      }
      if (features.length === 0) {
        features = await makeRegridRequest(countyParams, 'query');
      }
      allFeatures.push(...features);
    } catch (error) {
      console.error(`Error fetching county ${path}:`, error);
    }
  }

  if (allFeatures.length === 0 && canUseAddressEndpoint) {
    const hit = await tryEndpoint(() => {
      const p = new URLSearchParams();
      p.append('query', addressQuery);
      p.append('limit', effectiveLimit.toString());
      return p;
    }, 'address');
    if (hit) return hit;
  }
  if (allFeatures.length === 0 && canUseApnEndpoint) {
    const hit = await tryEndpoint(() => {
      const p = new URLSearchParams();
      p.append('parcelnumb', normalizedApn);
      p.append('limit', effectiveLimit.toString());
      return p;
    }, 'apn');
    if (hit) return hit;
  }

  return {
    results: allFeatures.slice(0, effectiveLimit).map(mapRegridToLegacy),
    hasMore: false,
    nextOffsetId: null,
  };
}

/**
 * Regrid parcel search (owner / address / APN) with optional county scope.
 * Hard-stops after {@link PARCEL_SEARCH_TIMEOUT_MS} so the UI never hangs on a stuck Regrid call.
 * @param {string} query
 * @param {{ limit?: number, countyCodes?: string[], offsetId?: string|number|null, maxLimit?: number, timeoutMs?: number, requestTimeoutMs?: number }} options
 */
export async function searchParcels(query, options = {}) {
  const timeoutMs = options.timeoutMs ?? PARCEL_SEARCH_TIMEOUT_MS;
  try {
    return await withTimeout(
      searchParcelsInner(query, options),
      timeoutMs,
      'Parcel search'
    );
  } catch (error) {
    console.error('Regrid parcel search failed/timed out:', error?.message || error);
    return { results: [], hasMore: false, nextOffsetId: null };
  }
}
