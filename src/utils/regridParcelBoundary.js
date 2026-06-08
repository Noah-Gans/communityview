import * as turf from '@turf/turf';
import { fetchParcelGeoJsonFeatureByLlUuid } from './regridParcelApi';

/** True if the map feature is a parcel polygon usable for boundaries (Regrid vector tiles). */
export function isRegridParcelPolygonFeature(f) {
  if (!f?.geometry) return false;
  const t = f.geometry.type;
  if (t !== 'Polygon' && t !== 'MultiPolygon') return false;
  return (
    f.layer?.id === 'regrid-parcels-layer' ||
    f.layer?.id === 'regrid-parcels-outline' ||
    Boolean(f.properties?.ll_uuid)
  );
}

/**
 * Union multiple Regrid parcel features into one Feature (Polygon or MultiPolygon).
 * Returns null if none valid or union fails.
 */
export function mergeRegridParcelFeatures(features) {
  const valid = (features || []).filter(isRegridParcelPolygonFeature);
  if (valid.length === 0) return null;
  const polys = valid.map((f) => turf.feature(f.geometry));
  if (polys.length === 1) return polys[0];
  try {
    return turf.union(turf.featureCollection(polys));
  } catch (e) {
    console.warn('mergeRegridParcelFeatures union failed', e);
    return null;
  }
}

/**
 * Like {@link mergeRegridParcelFeatures}, but for each parcel with `ll_uuid` loads full geometry
 * from the Regrid JSON API (tiles are often simplified/clipped). Falls back to tile geometry per
 * parcel when the request fails or there is no token / uuid.
 */
export async function mergeRegridParcelFeaturesPreferApi(features) {
  const valid = (features || []).filter(isRegridParcelPolygonFeature);
  if (valid.length === 0) return null;

  const resolved = await Promise.all(
    valid.map(async (f) => {
      const id = f.properties?.ll_uuid;
      if (id) {
        const apiFeat = await fetchParcelGeoJsonFeatureByLlUuid(id);
        if (apiFeat?.geometry) {
          return turf.feature(apiFeat.geometry);
        }
      }
      return turf.feature(f.geometry);
    })
  );

  const polys = resolved.filter((g) => g?.geometry);
  if (polys.length === 0) return null;
  if (polys.length === 1) return polys[0];
  try {
    return turf.union(turf.featureCollection(polys));
  } catch (e) {
    console.warn('mergeRegridParcelFeaturesPreferApi union failed, using tile merge', e);
    return mergeRegridParcelFeatures(features);
  }
}

/**
 * Exterior ring as { lng, lat }[] for a Regrid-style map feature (Polygon / MultiPolygon).
 * For MultiPolygon, uses the polygon with the largest planar area.
 * Returns an open ring (first point not repeated at end); print tools close the ring when saving.
 */
export function getRegridParcelBoundaryCoordinates(feature) {
  const geom = feature?.geometry;
  if (!geom) return null;

  const ringToLngLatCoords = (ring) => {
    if (!Array.isArray(ring) || ring.length < 4) return null;
    const closed =
      ring.length > 1 &&
      ring[0][0] === ring[ring.length - 1][0] &&
      ring[0][1] === ring[ring.length - 1][1];
    const open = closed ? ring.slice(0, -1) : ring;
    if (open.length < 3) return null;
    return open.map(([lng, lat]) => ({ lng, lat }));
  };

  if (geom.type === 'Polygon') {
    return ringToLngLatCoords(geom.coordinates[0]);
  }

  if (geom.type === 'MultiPolygon') {
    let best = null;
    let bestArea = -1;
    for (const polyCoords of geom.coordinates) {
      const shell = polyCoords?.[0];
      if (!shell) continue;
      try {
        const poly = turf.polygon(polyCoords);
        const a = turf.area(poly);
        if (a > bestArea) {
          bestArea = a;
          best = ringToLngLatCoords(shell);
        }
      } catch (_) {
        /* skip invalid polygon */
      }
    }
    return best;
  }

  return null;
}
