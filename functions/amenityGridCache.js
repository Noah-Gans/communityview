/**
 * Region grid cache for Places Nearby results.
 * Dense areas (e.g. SF) reuse the same cell so repeat neighborhood maps stay cheap.
 *
 * Default cell ~0.005° ≈ 550m (SF). Jackson Hole uses ~0.072° ≈ 5 mi via cellStep.
 */
const admin = require("firebase-admin");

const COLLECTION = "amenityGridCache";
const CURATED_COLLECTION = "amenityCuratedGridCache";
/** ~500m class cells for urban mass-gen. */
const CELL_STEP_DEG = 0.005;
/** ~5 mi N–S at Jackson Hole latitude. */
const JACKSON_CELL_STEP_DEG = 0.072;
/** 30 days */
const TTL_MS = 1000 * 60 * 60 * 24 * 30;
/** Bump when curated pick rules / density change. */
const CURATED_CACHE_VERSION = "v3";

function gridCellKey(lat, lng, step = CELL_STEP_DEG) {
  const s = Number(step) || CELL_STEP_DEG;
  const round = (v) => {
    const n = Math.round(Number(v) / s) * s;
    // Stable string key (avoid 37.7700000001)
    return n.toFixed(3);
  };
  return `${round(lat)}_${round(lng)}`;
}

function docId(cell, amenityKey, radiusMeters) {
  const key = String(amenityKey || "").trim();
  const radius = Math.round(Number(radiusMeters) || 0);
  return `${cell}__${key}__${radius}`;
}

function curatedDocId(cell, radiusMeters, version = CURATED_CACHE_VERSION) {
  const radius = Math.round(Number(radiusMeters) || 0);
  return `${cell}__r${radius}__${version}`;
}

function resolveCellStep(options) {
  const step = Number(options && options.cellStep);
  return Number.isFinite(step) && step > 0 ? step : CELL_STEP_DEG;
}

async function readAmenityGridCache(lat, lng, amenityKey, radiusMeters, options = {}) {
  try {
    const cellStep = resolveCellStep(options);
    const cell = gridCellKey(lat, lng, cellStep);
    const id = docId(cell, amenityKey, radiusMeters);
    const snap = await admin.firestore().collection(COLLECTION).doc(id).get();
    if (!snap.exists) return null;
    const data = snap.data() || {};
    const savedAt = data.savedAt && data.savedAt.toMillis ? data.savedAt.toMillis() : 0;
    if (!savedAt || Date.now() - savedAt > TTL_MS) return null;
    if (!data.featureCollection || !Array.isArray(data.featureCollection.features)) return null;
    return {
      ...data.featureCollection,
      fromAmenityGridCache: true,
      nearbyDataVersion: data.nearbyDataVersion || null,
      gridCell: cell,
    };
  } catch (err) {
    console.warn("readAmenityGridCache failed:", err?.message || err);
    return null;
  }
}

async function writeAmenityGridCache(
  lat,
  lng,
  amenityKey,
  radiusMeters,
  featureCollection,
  nearbyDataVersion,
  options = {}
) {
  try {
    const cellStep = resolveCellStep(options);
    const cell = gridCellKey(lat, lng, cellStep);
    const id = docId(cell, amenityKey, radiusMeters);
    const features = Array.isArray(featureCollection?.features)
      ? featureCollection.features.slice(0, 40)
      : [];
    await admin.firestore().collection(COLLECTION).doc(id).set(
      {
        cell,
        amenityKey: String(amenityKey || "").trim(),
        searchRadiusMeters: Math.round(Number(radiusMeters) || 0),
        nearbyDataVersion: nearbyDataVersion || null,
        featureCollection: {
          type: "FeatureCollection",
          features,
        },
        searchCenter: { lat: Number(lat), lng: Number(lng) },
        savedAt: admin.firestore.FieldValue.serverTimestamp(),
        cellStepDeg: cellStep,
      },
      { merge: true }
    );
    return true;
  } catch (err) {
    console.warn("writeAmenityGridCache failed:", err?.message || err);
    return false;
  }
}

async function readCuratedAmenityGridCache(lat, lng, radiusMeters, options = {}) {
  try {
    const cellStep = resolveCellStep(options);
    const cell = gridCellKey(lat, lng, cellStep);
    const id = curatedDocId(cell, radiusMeters);
    const snap = await admin.firestore().collection(CURATED_COLLECTION).doc(id).get();
    if (!snap.exists) return null;
    const data = snap.data() || {};
    const savedAt = data.savedAt && data.savedAt.toMillis ? data.savedAt.toMillis() : 0;
    if (!savedAt || Date.now() - savedAt > TTL_MS) return null;
    if (!Array.isArray(data.amenities) || !data.amenities.length) return null;
    return {
      amenities: data.amenities,
      curateSource: data.curateSource || "cache",
      gridCell: cell,
      fromCuratedCache: true,
    };
  } catch (err) {
    console.warn("readCuratedAmenityGridCache failed:", err?.message || err);
    return null;
  }
}

async function writeCuratedAmenityGridCache(
  lat,
  lng,
  radiusMeters,
  amenities,
  curateSource,
  options = {}
) {
  try {
    const cellStep = resolveCellStep(options);
    const cell = gridCellKey(lat, lng, cellStep);
    const id = curatedDocId(cell, radiusMeters);
    const list = (Array.isArray(amenities) ? amenities.slice(0, 40) : []).map((a) => {
      const out = {};
      if (!a || typeof a !== "object") return out;
      for (const [k, v] of Object.entries(a)) {
        if (v !== undefined) out[k] = v;
      }
      return out;
    });
    await admin.firestore().collection(CURATED_COLLECTION).doc(id).set(
      {
        cell,
        searchRadiusMeters: Math.round(Number(radiusMeters) || 0),
        curatedCacheVersion: CURATED_CACHE_VERSION,
        curateSource: String(curateSource || "heuristic"),
        amenities: list,
        searchCenter: { lat: Number(lat), lng: Number(lng) },
        savedAt: admin.firestore.FieldValue.serverTimestamp(),
        cellStepDeg: cellStep,
      },
      { merge: true }
    );
    return true;
  } catch (err) {
    console.warn("writeCuratedAmenityGridCache failed:", err?.message || err);
    return false;
  }
}

module.exports = {
  CELL_STEP_DEG,
  JACKSON_CELL_STEP_DEG,
  CURATED_CACHE_VERSION,
  gridCellKey,
  readAmenityGridCache,
  writeAmenityGridCache,
  readCuratedAmenityGridCache,
  writeCuratedAmenityGridCache,
};
