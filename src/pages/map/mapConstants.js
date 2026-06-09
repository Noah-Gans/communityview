import queryString from 'query-string';

/** Default map view when URL has no lat/lng/zoom (Nebraska — Regrid-focused area). */
export const DEFAULT_MAP_VIEW = {
  center: [-97.60393, 40.52867],
  zoom: 13.935488214211315,
};

/** Default basemap when URL has no `basemap` param — outdoors, labeled "Discover" in UI. */
export const DEFAULT_BASEMAP_ID = 'outdoors-v12';
export const PERSISTENT_BASE_STYLE_ID = 'outdoors-v12';

/** The four basemap options exposed in the UI. */
export const SUPPORTED_BASEMAP_IDS = new Set([
  'outdoors-v12',
  'imagery',
  'satellite-streets-v12',
  'streets-v11',
]);

/** Map legacy / alias URL values to a supported basemap id. */
export const BASEMAP_ID_ALIASES = {
  discover: 'outdoors-v12',
  outdoors: 'outdoors-v12',
  satellite: 'satellite-streets-v12',
  streets: 'streets-v11',
  'imagery-3d': 'imagery',
  'esri-world-imagery': 'imagery',
  'high-def-3inch': 'satellite-streets-v12',
  'high-def-3inch-3d': 'satellite-streets-v12',
  'high-def-3inch-topo': 'satellite-streets-v12',
  'high-def-3inch-topo-3d': 'satellite-streets-v12',
  'teton-ortho-2024': 'imagery',
  test: 'outdoors-v12',
};

export function normalizeBasemapId(raw) {
  const id = String(raw || '').trim().toLowerCase();
  if (!id) return DEFAULT_BASEMAP_ID;
  if (BASEMAP_ID_ALIASES[id]) return BASEMAP_ID_ALIASES[id];
  if (SUPPORTED_BASEMAP_IDS.has(id)) return id;
  return DEFAULT_BASEMAP_ID;
}

/** Read `basemap` from the live browser URL (authoritative on refresh / new tab). */
export function getBasemapIdFromSearch(search) {
  const params = queryString.parse(search || '');
  const fromUrl = params.basemap != null ? String(params.basemap).trim() : '';
  return normalizeBasemapId(fromUrl);
}

/** Parse `?layers=ownership,…` into a layerStatus-shaped object (for load sequencing). */
export function getLayerStatusFromSearch(search) {
  const params = queryString.parse(search || '');
  const raw = params.layers != null ? String(params.layers) : '';
  if (!raw.trim()) return {};
  const status = {};
  raw.split(',').forEach((name) => {
    const key = String(name || '').trim();
    if (key) status[key] = true;
  });
  return status;
}

/** Default view when starting the interactive tour (matches map init when no URL params). */
export const TUTORIAL_DEFAULT_VIEW = { center: DEFAULT_MAP_VIEW.center, zoom: DEFAULT_MAP_VIEW.zoom };

/** Fillmore County, NE — parcel-dense area for tour step “parcel-practice”. */
export const TUTORIAL_PARCEL_PRACTICE_VIEW = {
  center: [-97.61354, 40.5307],
  zoom: 16.147533670128382,
};
