import * as turf from '@turf/turf';
import { curateNearbyTourFeatures } from './tourNearbyRanking';

const MI_PER_KM = 0.621371;

/** Typical local driving heuristic when Matrix is unavailable (not traffic-aware). */
const ROAD_FACTOR = 1.35;
const ASSUMED_AVG_KMH = 42;

function getMapboxToken() {
  try {
    return String(process.env.REACT_APP_MAPBOX_ACCESS_TOKEN || '').trim();
  } catch (_) {
    return '';
  }
}

/**
 * @param {number} miles
 * @returns {string}
 */
export function formatStraightLineMiles(miles) {
  if (!Number.isFinite(miles) || miles < 0) return '';
  if (miles < 0.15) return `${Math.max(100, Math.round(miles * 5280))} ft`;
  if (miles < 10) return `${miles.toFixed(1)} mi`;
  return `${Math.round(miles)} mi`;
}

/**
 * @param {number} meters
 * @returns {string}
 */
function formatDrivingMilesFromMeters(meters) {
  if (!Number.isFinite(meters) || meters < 0) return '';
  const mi = meters * 0.000621371;
  if (mi < 0.15) return `${Math.max(100, Math.round(mi * 5280))} ft drive`;
  if (mi < 10) return `${mi.toFixed(1)} mi drive`;
  return `${Math.round(mi)} mi drive`;
}

/**
 * @param {{ lat: number, lng: number }} origin
 * @param {{ type?: string, features?: unknown[] }} featureCollection
 * @param {{ mapboxToken?: string, amenityKey?: string, skipCurate?: boolean }} [options]
 * @returns {Promise<{ type: 'FeatureCollection', features: unknown[] }>}
 */
export async function enrichNearbyTourFeatureCollection(origin, featureCollection, options = {}) {
  const amenityKey = options.amenityKey != null ? String(options.amenityKey) : '';
  const lat0 = Number(origin?.lat);
  const lng0 = Number(origin?.lng);
  if (!Number.isFinite(lat0) || !Number.isFinite(lng0)) {
    return featureCollection && featureCollection.type === 'FeatureCollection'
      ? featureCollection
      : { type: 'FeatureCollection', features: [] };
  }

  const originPt = turf.point([lng0, lat0]);
  const raw = Array.isArray(featureCollection?.features) ? featureCollection.features : [];
  const features = raw.map((f) => {
    if (!f || f.geometry?.type !== 'Point') return f;
    const coords = f.geometry.coordinates;
    const lng = Number(coords?.[0]);
    const lat = Number(coords?.[1]);
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) return f;
    const distKm = turf.distance(originPt, turf.point([lng, lat]), { units: 'kilometers' });
    const distMi = distKm * MI_PER_KM;
    const roughMin = Math.round(((distKm * ROAD_FACTOR) / ASSUMED_AVG_KMH) * 60);
    const driveMinutesEst = Math.min(120, Math.max(1, roughMin));
    const pk = { ...(f.properties || {}) };
    pk.driveMinutesEst = driveMinutesEst;
    pk.distanceText = `${formatStraightLineMiles(distMi)} away`;
    pk.straightLineMiles = distMi;
    return { ...f, properties: pk };
  });

  if (options.skipCurate) {
    return { type: 'FeatureCollection', features };
  }

  const token = String(options.mapboxToken || '').trim() || getMapboxToken();
  if (!token) {
    const curated = curateNearbyTourFeatures(features, { amenityKey });
    return { type: 'FeatureCollection', features: curated };
  }

  const pointFeatures = features
    .map((f, idx) => ({ f, idx }))
    .filter((x) => x.f?.geometry?.type === 'Point');
  if (!pointFeatures.length) return { type: 'FeatureCollection', features };

  const dests = pointFeatures.map(({ f }) => {
    const c = f.geometry.coordinates;
    return { lng: Number(c[0]), lat: Number(c[1]) };
  });

  const BATCH = 24;
  const durationsByIdx = {};
  const distancesByIdx = {};

  for (let off = 0; off < dests.length; off += BATCH) {
    const slice = dests.slice(off, off + BATCH);
    const sliceLen = slice.length;
    const coordStr = [`${lng0},${lat0}`, ...slice.map((p) => `${p.lng},${p.lat}`)].join(';');
    const destIndices = slice.map((_, j) => j + 1).join(';');
    const url = `https://api.mapbox.com/directions-matrix/v1/mapbox/driving/${coordStr}?sources=0&destinations=${destIndices}&annotations=duration,distance&access_token=${encodeURIComponent(
      token
    )}`;

    let data;
    try {
      const res = await fetch(url);
      data = await res.json();
    } catch (_) {
      continue;
    }
    if (!data || data.code || !Array.isArray(data.durations) || !Array.isArray(data.durations[0])) continue;
    const row = data.durations[0];
    const distRow = Array.isArray(data.distances?.[0]) ? data.distances[0] : null;
    for (let j = 0; j < sliceLen; j += 1) {
      const sec = Number(row[j]);
      const meters = distRow ? Number(distRow[j]) : NaN;
      const pf = pointFeatures[off + j];
      const origIdx = pf?.idx;
      if (!Number.isFinite(origIdx)) continue;
      if (Number.isFinite(sec) && sec > 0) {
        durationsByIdx[origIdx] = Math.max(1, Math.round(sec / 60));
      }
      if (Number.isFinite(meters) && meters > 0) {
        distancesByIdx[origIdx] = meters;
      }
    }
  }

  const merged = features.map((f, idx) => {
    if (f?.geometry?.type !== 'Point') return f;
    const pk = { ...(f.properties || {}) };
    if (Number.isFinite(durationsByIdx[idx])) {
      pk.driveMinutesEst = durationsByIdx[idx];
    }
    if (Number.isFinite(distancesByIdx[idx])) {
      pk.distanceText = formatDrivingMilesFromMeters(distancesByIdx[idx]);
      pk.driveDistanceMeters = Math.round(distancesByIdx[idx]);
    }
    return { ...f, properties: pk };
  });

  const curated = curateNearbyTourFeatures(merged, { amenityKey });
  return { type: 'FeatureCollection', features: curated };
}
