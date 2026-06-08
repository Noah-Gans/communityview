const { curateNearbyTourFeatures } = require("./nearbyTourRanking");

/** Straight-line distance + drive-time estimate for tour nearby POIs (matches client enrichment). */

const MI_PER_KM = 0.621371;
const ROAD_FACTOR = 1.35;
const ASSUMED_AVG_KMH = 42;

function haversineKm(lat1, lng1, lat2, lng2) {
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function formatStraightLineMiles(miles) {
  if (!Number.isFinite(miles) || miles < 0) return "";
  if (miles < 0.15) return `${Math.max(100, Math.round(miles * 5280))} ft`;
  if (miles < 10) return `${miles.toFixed(1)} mi`;
  return `${Math.round(miles)} mi`;
}

/**
 * @param {{ lat: number, lng: number }} origin
 * @param {{ type?: string, features?: unknown[] }} featureCollection
 */
function enrichNearbyTourFeatureCollection(origin, featureCollection, amenityKey = "", options = {}) {
  const lat0 = Number(origin?.lat);
  const lng0 = Number(origin?.lng);
  if (!Number.isFinite(lat0) || !Number.isFinite(lng0)) {
    return featureCollection && featureCollection.type === "FeatureCollection"
      ? featureCollection
      : { type: "FeatureCollection", features: [] };
  }

  const raw = Array.isArray(featureCollection?.features) ? featureCollection.features : [];
  const features = raw.map((f) => {
    if (!f || f.geometry?.type !== "Point") return f;
    const coords = f.geometry.coordinates;
    const lng = Number(coords?.[0]);
    const lat = Number(coords?.[1]);
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) return f;
    const distKm = haversineKm(lat0, lng0, lat, lng);
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
    return { type: "FeatureCollection", features };
  }

  const curated = curateNearbyTourFeatures(features, { amenityKey });
  return { type: "FeatureCollection", features: curated };
}

module.exports = { enrichNearbyTourFeatureCollection };
