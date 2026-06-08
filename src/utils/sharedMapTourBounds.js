import * as turf from '@turf/turf';
import { labelUsesGeoOffset } from '../pages/print/mapLabelUtils';

function shiftLatByMeters(lat, meters) {
  // Approximate WGS84 conversion: 1 deg latitude ~= 111,320 meters.
  return lat + meters / 111320;
}

function getElementLabelAnchorLngLat(el) {
  const g = el?.geometry;
  if (!g) return null;
  if (g.type === 'Point' && Array.isArray(g.coordinates) && g.coordinates.length >= 2) {
    return [Number(g.coordinates[0]), Number(g.coordinates[1])];
  }
  if (g.type === 'LineString' && Array.isArray(g.coordinates) && g.coordinates.length >= 2) {
    const mid = g.coordinates[Math.floor(g.coordinates.length / 2)];
    if (Array.isArray(mid) && mid.length >= 2) return [Number(mid[0]), Number(mid[1])];
  }
  if (g.type === 'Polygon' && Array.isArray(g.coordinates?.[0]) && g.coordinates[0].length >= 3) {
    let minLng = Number.POSITIVE_INFINITY;
    let minLat = Number.POSITIVE_INFINITY;
    let maxLng = Number.NEGATIVE_INFINITY;
    let maxLat = Number.NEGATIVE_INFINITY;
    for (const c of g.coordinates[0]) {
      if (!Array.isArray(c) || c.length < 2) continue;
      const lng = Number(c[0]);
      const lat = Number(c[1]);
      if (!Number.isFinite(lng) || !Number.isFinite(lat)) continue;
      minLng = Math.min(minLng, lng);
      minLat = Math.min(minLat, lat);
      maxLng = Math.max(maxLng, lng);
      maxLat = Math.max(maxLat, lat);
    }
    if ([minLng, minLat, maxLng, maxLat].every(Number.isFinite)) {
      return [(minLng + maxLng) / 2, (minLat + maxLat) / 2];
    }
  }
  return null;
}

/**
 * LngLat bounds [[west, south], [east, north]] from visible print elements, or null.
 */
export function getBoundsFromPrintElements(printElements) {
  const features = [];
  for (const el of printElements || []) {
    if (!el || el.hiddenOnMap) continue;
    const g = el.geometry;
    if (!g) continue;
    try {
      if (g.type === 'Polygon' && g.coordinates?.[0]?.length >= 3) {
        features.push(turf.polygon(g.coordinates));
      } else if (g.type === 'LineString' && g.coordinates?.length >= 2) {
        features.push(turf.lineString(g.coordinates));
      } else if (g.type === 'Point' && Array.isArray(g.coordinates) && g.coordinates.length >= 2) {
        const [lng, lat] = g.coordinates;
        if (Number.isFinite(lng) && Number.isFinite(lat)) {
          features.push(turf.point([lng, lat]));
        }
      }

      // Include label center as a point (no footprint buffer).
      if (el.showLabelOnMap && String(el.label || '').trim() !== '') {
        const anchor = getElementLabelAnchorLngLat(el);
        if (Array.isArray(anchor) && anchor.length >= 2) {
          let lng = Number(anchor[0]);
          let lat = Number(anchor[1]);
          if (labelUsesGeoOffset(el)) {
            lng += Number(el.labelOffsetDLng) || 0;
            lat += Number(el.labelOffsetDLat) || 0;
          }
          if (Number.isFinite(lng) && Number.isFinite(lat)) {
            // Label anchors are often at the feature point while the rendered label sits above it.
            // Nudge toward label center so tour bounds better reflect visible label position.
            const alignV = el.labelAlignV || 'top';
            if (alignV === 'top') {
              lat = shiftLatByMeters(lat, 16);
            } else if (alignV === 'bottom') {
              lat = shiftLatByMeters(lat, -16);
            }
            features.push(turf.point([lng, lat]));
          }
        }
      }

    } catch (_) {
      /* skip invalid */
    }
  }
  if (!features.length) return null;
  const box = turf.bbox(turf.featureCollection(features));
  return [
    [box[0], box[1]],
    [box[2], box[3]],
  ];
}

/**
 * Approximate property bounds from saved viewport when no geometry is available.
 */
export function getBoundsFromViewport(viewport) {
  const c = viewport?.center;
  if (!c) return null;
  const lng = Number(c.lng);
  const lat = Number(c.lat);
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
  try {
    const pt = turf.point([lng, lat]);
    const buffered = turf.buffer(pt, 0.35, { units: 'kilometers' });
    const box = turf.bbox(buffered);
    return [
      [box[0], box[1]],
      [box[2], box[3]],
    ];
  } catch (_) {
    return null;
  }
}
