/**
 * First research-backed batch of free, no-login county map pages (see
 * FREE_COUNTY_MAP_BRIEF.md open question #4). Picked for small-to-mid
 * population, high-value/recreational-land real estate markets with a
 * winnable competitive field (same handful of parcel-data aggregators show
 * up everywhere; none of them embed a live interactive map) rather than
 * large urban counties where general residential search already dominates.
 */
export const FREE_COUNTY_MAP_ZOOM = 11;

export const FREE_COUNTY_MAPS = [
  {
    state: 'wy',
    stateName: 'Wyoming',
    slug: 'teton-county',
    name: 'Teton County',
    lat: 43.9345,
    lng: -110.5891,
  },
  {
    state: 'ut',
    stateName: 'Utah',
    slug: 'summit-county',
    name: 'Summit County',
    lat: 40.6461,
    lng: -111.4980,
  },
  {
    state: 'ut',
    stateName: 'Utah',
    slug: 'wasatch-county',
    name: 'Wasatch County',
    lat: 40.5063,
    lng: -111.4133,
  },
  {
    state: 'co',
    stateName: 'Colorado',
    slug: 'summit-county',
    name: 'Summit County',
    lat: 39.4817,
    lng: -106.0384,
  },
  {
    state: 'co',
    stateName: 'Colorado',
    slug: 'eagle-county',
    name: 'Eagle County',
    lat: 39.6403,
    lng: -106.3742,
  },
  {
    state: 'id',
    stateName: 'Idaho',
    slug: 'blaine-county',
    name: 'Blaine County',
    lat: 43.6788,
    lng: -114.3632,
  },
  {
    state: 'mt',
    stateName: 'Montana',
    slug: 'gallatin-county',
    name: 'Gallatin County',
    lat: 45.6770,
    lng: -111.0429,
  },
  {
    state: 'mt',
    stateName: 'Montana',
    slug: 'flathead-county',
    name: 'Flathead County',
    lat: 48.4111,
    lng: -114.3376,
  },
  {
    state: 'or',
    stateName: 'Oregon',
    slug: 'hood-river-county',
    name: 'Hood River County',
    lat: 45.7054,
    lng: -121.5215,
  },
  {
    state: 'tx',
    stateName: 'Texas',
    slug: 'gillespie-county',
    name: 'Gillespie County',
    lat: 30.2752,
    lng: -98.8719,
  },
];

export function findFreeCountyMap(state, slug) {
  const stateNorm = String(state || '').toLowerCase();
  const slugNorm = String(slug || '').toLowerCase();
  return (
    FREE_COUNTY_MAPS.find(
      (county) => county.state === stateNorm && county.slug === slugNorm
    ) || null
  );
}

/** Bare canonical path for a county (matches site's trailing-slash convention). */
export function freeCountyMapPath(county) {
  return `/map/${county.state}/${county.slug}/`;
}

/**
 * Shareable/indexable link for a county — carries the map view directly.
 * Use a plain <a href> (not client-side <Link>) when linking to this from
 * elsewhere in the app: Map.js only reads lat/lng/zoom from the URL once,
 * on its own first mount, so the view only centers correctly on a real
 * page load — same as a click-through from a Google search result.
 */
export function buildFreeCountyMapUrl(county) {
  const params = new URLSearchParams({
    lat: String(county.lat),
    lng: String(county.lng),
    zoom: String(FREE_COUNTY_MAP_ZOOM),
    layers: 'ownership',
  });
  return `${freeCountyMapPath(county)}?${params.toString()}`;
}
