import { REGRID_API_BASE_URL, REGRID_API_TOKEN } from '../config/regridApi';
import { regridRestGet } from '../services/regridService';
import { extractZoningFeaturesFromResponse } from './regridZoningDisplay';

const inflightByUuid = new Map();
const inflightDetailByUuid = new Map();

/** Premium schema FEMA columns (included on parcel record, not a paid add-on). */
export const FEMA_PARCEL_FIELD_KEYS = [
  'fema_flood_zone',
  'fema_flood_zone_subtype',
  'fema_flood_zone_raw',
  'fema_flood_zone_data_date',
  'fema_nri_risk_rating',
];

/** Session cache: do not re-call Regrid after a failed detail fetch for this key. */
const failedDetailByCacheKey = new Map();

function isRegridNonRetryableError(err) {
  const msg = String(err?.message || err || '');
  return /sign in|token|401|403|matched buildings|does not support|failed-precondition|not configured|invalid-argument/i.test(
    msg
  );
}

/**
 * Regrid GET /parcels/{ll_uuid} query presets (see Regrid API docs).
 * Premium parcel schema includes zoning, zoning_description, etc. on the record itself.
 * Set return_zoning=false — that flag is the separate Zoning API add-on, not parcel fields.
 */
export const REGRID_PARCEL_PRESETS = {
  /** Standard premium parcel + county custom fields (no paid add-ons). */
  premium: {
    return_geometry: 'false',
    return_custom: 'true',
    return_zoning: 'false',
    return_matched_buildings: 'false',
    return_matched_addresses: 'false',
    return_enhanced_ownership: 'false',
    return_field_labels: 'true',
    return_stacked: 'true',
  },
  /** Alias for property popup / report. */
  detail: null,
  /** Alias for side panel Property details expand. */
  sidePanel: null,
  /** Geometry only (map zoom / boundaries). */
  geometry: {
    return_geometry: 'true',
    return_custom: 'false',
    return_zoning: 'false',
    return_matched_buildings: 'false',
    return_matched_addresses: 'false',
    return_enhanced_ownership: 'false',
    return_stacked: 'true',
  },
};

REGRID_PARCEL_PRESETS.detail = REGRID_PARCEL_PRESETS.premium;
REGRID_PARCEL_PRESETS.sidePanel = REGRID_PARCEL_PRESETS.premium;

Object.assign(REGRID_PARCEL_PRESETS, {
  /** Fast list/search (minimal payload). */
  searchList: {
    return_geometry: 'false',
    return_custom: 'false',
    return_zoning: 'false',
    return_matched_buildings: 'false',
    return_matched_addresses: 'false',
    return_enhanced_ownership: 'false',
    return_field_labels: 'false',
    return_stacked: 'true',
  },
});

export function buildRegridParcelQueryParams(preset = 'premium', overrides = {}) {
  const base = REGRID_PARCEL_PRESETS[preset] || REGRID_PARCEL_PRESETS.premium;
  return new URLSearchParams({ ...base, ...overrides });
}

/** Apply lean Regrid flags for search / point lookups (no geometry, no county custom fields). */
export function applyRegridSearchListParams(params) {
  const flags = buildRegridParcelQueryParams('searchList');
  flags.forEach((value, key) => {
    params.set(key, value);
  });
  return params;
}

function isScalarValue(value) {
  if (value === null || value === undefined || value === '') return false;
  return typeof value !== 'object';
}

function formatAddonLabel(key) {
  return String(key)
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (l) => l.toUpperCase())
    .trim();
}

function formatAddonValue(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') return value.toLocaleString();
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  return String(value);
}

function appendEntriesToSection(sections, title, entries) {
  if (!entries || entries.length === 0) return;
  const existing = sections.find((section) => section.title === title);
  if (existing) {
    existing.entries = [...(existing.entries || []), ...entries];
    return;
  }
  sections.push({ title, entries });
}

/**
 * Flatten standard + county custom fields and scalar zoning fields onto one object
 * for buildDetailSections. Preserves raw Regrid properties for addon sections.
 */
export function mergeRegridParcelProperties(parcelFeature, seed = {}) {
  const props = parcelFeature?.properties || {};
  const fields = props.fields && typeof props.fields === 'object' && !Array.isArray(props.fields)
    ? props.fields
    : {};

  const merged = {
    ...seed,
    ...props,
    ...fields,
  };

  // Keep FEMA (and other seed values) when API leaves them empty but map tiles had them.
  FEMA_PARCEL_FIELD_KEYS.forEach((key) => {
    const fromApi = props[key] ?? fields[key];
    const fromSeed = seed[key];
    if (
      (fromApi === null || fromApi === undefined || fromApi === '') &&
      fromSeed !== null &&
      fromSeed !== undefined &&
      fromSeed !== ''
    ) {
      merged[key] = fromSeed;
    }
  });

  delete merged.fields;

  const context = props.context;
  if (context && typeof context === 'object') {
    if (!merged.county && context.name) merged.county = context.name;
    if (!merged.path && context.path) merged.path = context.path;
  }

  const zoning = props.zoning;
  if (zoning && typeof zoning === 'object' && !Array.isArray(zoning)) {
    Object.entries(zoning).forEach(([key, value]) => {
      if (!isScalarValue(value)) return;
      const flatKey = key.toLowerCase().startsWith('zoning') ? key : `zoning_${key}`;
      if (merged[flatKey] == null || merged[flatKey] === '') {
        merged[flatKey] = value;
      }
    });
  }

  if (props.field_labels && typeof props.field_labels === 'object') {
    merged.__regridFieldLabels = { ...props.field_labels };
  }

  merged.__regridParcelProperties = props;
  return merged;
}

function attachZoningToMerged(merged, apiResponse) {
  const zoningFeatures = extractZoningFeaturesFromResponse(apiResponse, merged);
  if (zoningFeatures.length > 0) {
    merged.__regridZoningFeatures = zoningFeatures;
  }
  return merged;
}

function mergeScalarsFromObject(target, source, { skipKeys = [] } = {}) {
  if (!source || typeof source !== 'object' || Array.isArray(source)) return;
  const skip = new Set(skipKeys.map((k) => k.toLowerCase()));
  Object.entries(source).forEach(([key, value]) => {
    if (skip.has(key.toLowerCase())) return;
    if (value === null || value === undefined || value === '') return;
    if (typeof value === 'object') return;
    if (target[key] == null || target[key] === '') {
      target[key] = value;
    }
  });
}

function hydrateMergedFromApiResponse(merged, apiResponse) {
  if (!apiResponse) return merged;

  merged.__regridApiResponse = apiResponse;
  attachZoningToMerged(merged, apiResponse);

  const parcelFeature = apiResponse?.parcels?.features?.[0];
  const props = parcelFeature?.properties;
  if (props) {
    mergeScalarsFromObject(merged, props, { skipKeys: ['fields', 'context', 'field_labels'] });
    if (props.fields) mergeScalarsFromObject(merged, props.fields);
    if (props.context) mergeScalarsFromObject(merged, props.context);
    if (props.field_labels) {
      merged.__regridFieldLabels = {
        ...(merged.__regridFieldLabels || {}),
        ...props.field_labels,
      };
    }
    if (!merged.__regridParcelProperties) {
      merged.__regridParcelProperties = props;
    }
  }

  return merged;
}

function packageParcelApiResult(data, feature, seed) {
  const merged = mergeRegridParcelProperties(feature, seed);
  hydrateMergedFromApiResponse(merged, data);
  const zoningFeatures = merged.__regridZoningFeatures || [];
  return {
    feature,
    merged,
    rawProperties: feature.properties || {},
    zoningFeatures,
    apiResponse: data,
  };
}

/**
 * Top-level Regrid collections (sibling to `parcels`) — buildings, etc.
 */
export function appendRegridApiCollectionSections(sections, apiResponse) {
  if (!apiResponse) return sections;

  const buildingFeatures = apiResponse?.buildings?.features;
  if (Array.isArray(buildingFeatures) && buildingFeatures.length > 0) {
    const entries = [];
    buildingFeatures.forEach((feature, index) => {
      const props = feature?.properties || {};
      Object.entries(props).forEach(([key, value]) => {
        let displayValue = formatAddonValue(value);
        let multiline = false;
        if (!displayValue && value != null) {
          if (Array.isArray(value)) {
            displayValue = value.map(String).join(', ');
          } else if (typeof value === 'object') {
            try {
              displayValue = JSON.stringify(value, null, 2);
              multiline = true;
            } catch {
              displayValue = String(value);
            }
          }
        }
        if (!displayValue) return;
        entries.push({
          label: `Building ${index + 1} — ${formatAddonLabel(key)}`,
          displayValue,
          key: `api_building_${index}_${key}`,
          multiline,
        });
      });
    });
    appendEntriesToSection(sections, 'Building', entries);
  }

  return sections;
}

/**
 * Add sections for matched buildings, secondary addresses, and enhanced ownership
 * (not covered by flat field keys alone).
 */
export function appendRegridAddonSections(sections, rawProperties) {
  if (!rawProperties || typeof rawProperties !== 'object') return sections;

  const buildings = rawProperties.matched_buildings;
  if (Array.isArray(buildings) && buildings.length > 0) {
    const entries = [];
    buildings.forEach((building, index) => {
      if (!building || typeof building !== 'object') return;
      Object.entries(building).forEach(([key, value]) => {
        const displayValue = formatAddonValue(value);
        if (!displayValue) return;
        entries.push({
          label: `Building ${index + 1} — ${formatAddonLabel(key)}`,
          displayValue,
          key: `matched_building_${index}_${key}`,
        });
      });
    });
    appendEntriesToSection(sections, 'Building', entries);
  }

  const addresses = rawProperties.matched_addresses ?? rawProperties.addresses;
  if (Array.isArray(addresses) && addresses.length > 0) {
    const entries = [];
    addresses.forEach((addr, index) => {
      if (!addr || typeof addr !== 'object') return;
      const parts = [
        addr.address,
        addr.mailing_address,
        [addr.city, addr.state, addr.zip].filter(Boolean).join(', '),
      ].filter(Boolean);
      const displayValue = parts.join(' · ') || formatAddonValue(addr.label);
      if (!displayValue) return;
      entries.push({
        label: `Address ${index + 1}`,
        displayValue,
        key: `matched_address_${index}`,
        multiline: displayValue.includes('\n'),
      });
    });
    appendEntriesToSection(sections, 'Matched addresses', entries);
  }

  const ownership = rawProperties.enhanced_ownership;
  if (Array.isArray(ownership) && ownership.length > 0) {
    const entries = [];
    ownership.forEach((record, index) => {
      if (!record || typeof record !== 'object') return;
      Object.entries(record).forEach(([key, value]) => {
        const displayValue = formatAddonValue(value);
        if (!displayValue) return;
        entries.push({
          label: `Owner record ${index + 1} — ${formatAddonLabel(key)}`,
          displayValue,
          key: `enhanced_ownership_${index}_${key}`,
        });
      });
    });
    appendEntriesToSection(sections, 'Enhanced ownership', entries);
  }

  return sections;
}

function parseParcelFeatureFromResponse(data) {
  return data?.parcels?.features?.[0] || null;
}

async function regridGetJson(route, queryParams) {
  if (REGRID_API_TOKEN) {
    const params = new URLSearchParams();
    Object.entries(queryParams || {}).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        params.set(key, String(value));
      }
    });
    params.set('token', REGRID_API_TOKEN);
    const url = `${REGRID_API_BASE_URL}/${route.replace(/^\/+/, '')}?${params.toString()}`;
    const response = await fetch(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      credentials: 'omit',
    });
    if (!response.ok) {
      throw new Error(`Regrid API error (${response.status})`);
    }
    return response.json();
  }
  return regridRestGet(route.replace(/^\/+/, ''), queryParams);
}

/**
 * Fetch one parcel by ll_uuid (primary) or path (fallback query).
 * Uses premium preset: parcel + county custom fields (zoning columns on record, no API add-ons).
 */
export async function fetchRegridParcelRecord({
  ll_uuid,
  path,
  preset = 'detail',
  seed = {},
} = {}) {
  const queryParams = Object.fromEntries(buildRegridParcelQueryParams(preset));
  let lastError = null;

  const tryParcelById = async (parcelId) => {
    if (!parcelId) return null;
    const data = await regridGetJson(`parcels/${String(parcelId).trim()}`, queryParams);
    const feature = parseParcelFeatureFromResponse(data);
    if (!feature) return null;
    return packageParcelApiResult(data, feature, seed);
  };

  const tryParcelByPath = async (parcelPath) => {
    if (!parcelPath) return null;
    const data = await regridGetJson('parcels/query', {
      ...queryParams,
      path: parcelPath,
      limit: '1',
    });
    const feature = parseParcelFeatureFromResponse(data);
    if (!feature) return null;
    return packageParcelApiResult(data, feature, seed);
  };

  const parcelPath = path || seed?.path || null;

  // At most two Regrid calls: by ll_uuid, then by path only if needed.
  if (ll_uuid) {
    try {
      const result = await tryParcelById(ll_uuid);
      if (result) return result;
    } catch (err) {
      if (isRegridNonRetryableError(err)) throw err;
      lastError = err;
    }
  }

  if (parcelPath && !ll_uuid) {
    try {
      const result = await tryParcelByPath(parcelPath);
      if (result) return result;
    } catch (err) {
      if (isRegridNonRetryableError(err)) throw err;
      lastError = err;
    }
  }

  if (lastError) {
    throw lastError;
  }

  throw new Error(
    ll_uuid || parcelPath
      ? 'No parcel record returned from Regrid for this parcel.'
      : 'No parcel id or path available for Regrid lookup'
  );
}

/** Cached detail fetch for side panel / report. */
export async function fetchRegridParcelDetailCached(parcelId, options = {}) {
  const { path, seed = {}, preset = 'detail' } = options;
  if (!parcelId && !path) return null;

  const cacheKey = `${parcelId || path}:${preset}`;
  if (failedDetailByCacheKey.has(cacheKey)) {
    throw failedDetailByCacheKey.get(cacheKey);
  }
  if (inflightDetailByUuid.has(cacheKey)) {
    return inflightDetailByUuid.get(cacheKey);
  }

  const promise = fetchRegridParcelRecord({
    ll_uuid: parcelId || undefined,
    path,
    preset,
    seed,
  })
    .then((result) => {
      failedDetailByCacheKey.delete(cacheKey);
      return result.merged;
    })
    .catch((err) => {
      failedDetailByCacheKey.set(cacheKey, err);
      throw err;
    })
    .finally(() => {
      inflightDetailByUuid.delete(cacheKey);
    });

  inflightDetailByUuid.set(cacheKey, promise);
  return promise;
}

/**
 * Fetches a single parcel record by ll_uuid (GET /api/v2/parcels/{ll_uuid}).
 * Returns a GeoJSON Feature with Polygon or MultiPolygon geometry, or null.
 */
export async function fetchParcelGeoJsonFeatureByLlUuid(ll_uuid) {
  if (!ll_uuid) return null;
  if (inflightByUuid.has(ll_uuid)) {
    return inflightByUuid.get(ll_uuid);
  }
  const promise = (async () => {
    try {
      const queryParams = Object.fromEntries(buildRegridParcelQueryParams('geometry'));
      const data = await regridGetJson(`parcels/${encodeURIComponent(ll_uuid)}`, queryParams);
      const raw = data?.parcels?.features?.[0];
      if (!raw?.geometry) return null;
      const t = raw.geometry.type;
      if (t !== 'Polygon' && t !== 'MultiPolygon') return null;
      return {
        type: 'Feature',
        geometry: raw.geometry,
        properties: raw.properties || {},
      };
    } catch (e) {
      console.warn('fetchParcelGeoJsonFeatureByLlUuid failed', ll_uuid, e);
      return null;
    } finally {
      inflightByUuid.delete(ll_uuid);
    }
  })();
  inflightByUuid.set(ll_uuid, promise);
  return promise;
}
