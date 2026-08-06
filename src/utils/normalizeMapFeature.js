/**
 * Search and legacy callers sometimes pass flat objects (GFI, ll_uuid, etc. on the
 * feature root) instead of GeoJSON with a `properties` bag. Normalize before
 * selection / highlight / SidePanel so `feature.properties` is always defined.
 */
export function normalizeToGeoJsonFeature(feature) {
  if (!feature || typeof feature !== 'object') return null;
  if (feature.properties && typeof feature.properties === 'object') {
    return feature;
  }
  const metaKeys = new Set(['type', 'geometry', 'bbox', 'layer', 'id', 'source', 'sourceLayer']);
  const properties = {};
  for (const [key, value] of Object.entries(feature)) {
    if (!metaKeys.has(key)) {
      properties[key] = value;
    }
  }
  return {
    type: feature.type || 'Feature',
    geometry: feature.geometry,
    properties,
    ...(feature.bbox ? { bbox: feature.bbox } : {}),
    ...(feature.layer ? { layer: feature.layer } : {}),
    ...(feature.id != null ? { id: feature.id } : {}),
  };
}

export function normalizeToGeoJsonFeatures(features) {
  if (!Array.isArray(features)) return [];
  return features.map(normalizeToGeoJsonFeature).filter(Boolean);
}
