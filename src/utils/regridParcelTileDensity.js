/** MVT tile fetch minzoom when map center is outside dense regions. */
export const REGRID_VECTOR_MIN_ZOOM_SPARSE = 11;

/** MVT tile fetch minzoom when map center is inside a dense region below. */
export const REGRID_VECTOR_MIN_ZOOM_DENSE = 13;

/**
 * Metro bounding boxes [west, south, east, north]. Map center inside → use `minZoom` (default dense).
 * Add regions here as you find slow parcel tile loads.
 */
export const REGRID_DENSE_PARCEL_REGIONS = [
  { id: 'new_york_city', bbox: [-74.35, 40.48, -73.65, 40.95] },
  { id: 'los_angeles', bbox: [-118.65, 33.7, -117.9, 34.15] },
  { id: 'chicago', bbox: [-87.95, 41.64, -87.52, 42.02] },
  { id: 'houston', bbox: [-95.85, 29.55, -95.05, 30.15] },
  { id: 'phoenix', bbox: [-112.35, 33.25, -111.55, 33.75] },
  { id: 'philadelphia', bbox: [-75.35, 39.85, -74.95, 40.15] },
  { id: 'san_francisco', bbox: [-122.55, 37.7, -122.35, 37.85] },
  { id: 'east_bay', bbox: [-122.42, 37.48, -121.72, 38.02] },
  { id: 'boston', bbox: [-71.2, 42.25, -70.95, 42.45] },
  { id: 'miami', bbox: [-80.35, 25.7, -80.1, 25.9] },
  { id: 'seattle', bbox: [-122.45, 47.5, -122.2, 47.75] },
  { id: 'denver', bbox: [-105.15, 39.65, -104.75, 39.85] },
  { id: 'dallas_fort_worth', bbox: [-97.15, 32.55, -96.55, 33.05] },
  { id: 'atlanta', bbox: [-84.55, 33.6, -84.25, 33.9] },
  { id: 'washington_dc', bbox: [-77.2, 38.78, -76.9, 39.05] },
];

export function getRegridVectorMinZoomForCenter(lng, lat) {
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) {
    return REGRID_VECTOR_MIN_ZOOM_SPARSE;
  }
  for (const region of REGRID_DENSE_PARCEL_REGIONS) {
    const [w, s, e, n] = region.bbox;
    if (lng >= w && lng <= e && lat >= s && lat <= n) {
      return region.minZoom ?? REGRID_VECTOR_MIN_ZOOM_DENSE;
    }
  }
  return REGRID_VECTOR_MIN_ZOOM_SPARSE;
}

export function getRegridVectorMinZoomForMap(map) {
  if (!map?.getCenter) return REGRID_VECTOR_MIN_ZOOM_SPARSE;
  const center = map.getCenter();
  return getRegridVectorMinZoomForCenter(center.lng, center.lat);
}
