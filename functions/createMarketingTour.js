/**
 * Create a public property tour from a marketing neighborhood amenity set.
 * One amenity slide per neighborhood-map category that has places.
 */
const admin = require("firebase-admin");
const crypto = require("crypto");
const {
  NEARBY_TOUR_DATA_VERSION,
  TOUR_NEARBY_AMENITY_KEYS,
  mergeTourNearbyCachePayload,
} = require("./tourNearbyCache");

/** Same order / keys as neighborhood map marketing categories. */
const NEIGHBORHOOD_TOUR_CATEGORY_KEYS = [
  "dining",
  "coffee",
  "grocery",
  "schools",
  "fitness",
  "parks_rec",
  "essentials",
];

function str(v) {
  return String(v == null ? "" : v).trim();
}

function generateShareToken() {
  return crypto.randomBytes(12).toString("base64url");
}

function getAppOrigin() {
  let cfg = {};
  try {
    const functions = require("firebase-functions");
    cfg = functions.config() || {};
  } catch (_) {
    cfg = {};
  }
  return (
    str((cfg.marketing && cfg.marketing.app_origin) || process.env.MARKETING_APP_ORIGIN) ||
    "https://communityview.ai"
  );
}

function amenityToFeature(a) {
  const lng = Number(a.lng);
  const lat = Number(a.lat);
  const name = str(a.name);
  if (!name || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const placeId = str(a.placeId || a.id || a.place_id);
  const miles = Number(a.miles);
  const props = {
    name,
    amenityKey: str(a.amenityKey),
    place_id: placeId,
    placeId,
  };
  if (Number.isFinite(Number(a.rating))) props.rating = Number(a.rating);
  if (Number.isFinite(Number(a.reviews))) props.user_ratings_total = Number(a.reviews);
  if (Number.isFinite(miles)) {
    props.straightLineMiles = miles;
    props.distanceText = `${miles} mi`;
  }
  return {
    type: "Feature",
    geometry: { type: "Point", coordinates: [lng, lat] },
    properties: props,
  };
}

function buildByAmenityFromMarketingAmenities(amenities) {
  const byAmenity = {};
  for (const key of NEIGHBORHOOD_TOUR_CATEGORY_KEYS) {
    byAmenity[key] = { type: "FeatureCollection", features: [], fetched: true };
  }
  for (const a of amenities || []) {
    const key = str(a.amenityKey);
    if (!byAmenity[key]) continue;
    const feature = amenityToFeature(a);
    if (feature) byAmenity[key].features.push(feature);
  }
  // Drop empty categories so slide plan only includes populated ones.
  const populated = {};
  for (const key of NEIGHBORHOOD_TOUR_CATEGORY_KEYS) {
    if (byAmenity[key].features.length) populated[key] = byAmenity[key];
  }
  return populated;
}

function buildNeighborhoodTourSlidePlan(byAmenity) {
  const plan = ["intro:welcome", "intro:context", "intro:bird"];
  for (const key of NEIGHBORHOOD_TOUR_CATEGORY_KEYS) {
    if (byAmenity[key]?.features?.length) plan.push(`amenity:${key}`);
  }
  return plan;
}

function ringToFirestorePolygonCoordinates(ringPairs) {
  const pts = (ringPairs || [])
    .map((c) => {
      const lng = Number(c[0]);
      const lat = Number(c[1]);
      if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
      return { lng, lat };
    })
    .filter(Boolean);
  if (pts.length < 3) return null;
  const first = pts[0];
  const last = pts[pts.length - 1];
  if (first.lng !== last.lng || first.lat !== last.lat) {
    pts.push({ lng: first.lng, lat: first.lat });
  }
  // Firestore forbids nested arrays — store rings as { points: [{lng,lat}, ...] }.
  return [{ points: pts }];
}

function buildPrintElements(parcel) {
  const elements = [];
  const geom = parcel.geometry;

  let ring = null;
  if (geom && geom.type === "Polygon" && Array.isArray(geom.coordinates?.[0])) {
    ring = geom.coordinates[0];
  } else if (geom && geom.type === "MultiPolygon") {
    ring = geom.coordinates?.[0]?.[0] || null;
  }
  const firestoreRings = ringToFirestorePolygonCoordinates(ring);
  if (firestoreRings) {
    elements.push({
      id: "marketing_boundary_0",
      type: "polygon",
      mapStyleVariant: "boundary",
      label: "",
      showLabelOnMap: false,
      hiddenOnMap: false,
      geometry: { type: "Polygon", coordinates: firestoreRings },
      fill: "rgba(0, 0, 0, 0)",
      fillOpacity: 0,
      stroke: "#ff2222",
      strokeOpacity: 1,
      strokeWidth: 6,
    });
  }

  return elements;
}

function stripUndefined(value) {
  if (Array.isArray(value)) {
    return value.map(stripUndefined).filter((v) => v !== undefined);
  }
  if (value && typeof value === "object") {
    // Preserve Firestore sentinels / dates.
    if (value instanceof Date) return value;
    if (
      typeof value.isEqual === "function" &&
      value.constructor &&
      /FieldValue|Timestamp/.test(value.constructor.name)
    ) {
      return value;
    }
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      if (v === undefined || v === null) continue;
      out[k] = stripUndefined(v);
    }
    return out;
  }
  return value;
}

/**
 * @param {{
 *   title: string,
 *   address: string,
 *   parcel: object,
 *   amenities: object[],
 *   brand?: object,
 * }} params
 */
async function createMarketingTourFromAmenities({
  title,
  address,
  parcel,
  amenities,
  brand = {},
}) {
  const lat = Number(parcel.lat);
  const lng = Number(parcel.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    const err = new Error("Parcel coordinates required to create a tour.");
    err.code = "failed-precondition";
    throw err;
  }

  const byAmenity = buildByAmenityFromMarketingAmenities(amenities);
  const enabledKeys = NEIGHBORHOOD_TOUR_CATEGORY_KEYS.filter(
    (k) => byAmenity[k]?.features?.length
  );
  if (!enabledKeys.length) {
    const err = new Error("No amenity categories available for tour slides.");
    err.code = "not-found";
    throw err;
  }

  // Ensure dining is accepted by tourNearbyCache sanitizer (added to shared keys).
  for (const key of enabledKeys) {
    if (!TOUR_NEARBY_AMENITY_KEYS.includes(key)) {
      const err = new Error(
        `Tour amenity key "${key}" is not enabled in tourNearbyCache keys.`
      );
      err.code = "failed-precondition";
      throw err;
    }
  }

  const slidePlan = buildNeighborhoodTourSlidePlan(byAmenity);
  const searchRadiusMeters = 25000;
  const searchCenter = { lat, lng };
  const tourSettings = {
    searchRadiusMeters,
    enabledAmenityKeys: enabledKeys,
    slidePlan,
  };

  let tourNearbyCache = mergeTourNearbyCachePayload(null, {
    replace: true,
    dataVersion: NEARBY_TOUR_DATA_VERSION,
    searchRadiusMeters,
    searchCenter,
    byAmenity,
    tourSettings,
  });
  tourNearbyCache = stripUndefined(tourNearbyCache);
  if (tourNearbyCache) {
    tourNearbyCache.tourSettings = tourSettings;
  }

  const printElements = buildPrintElements(parcel);
  const shareToken = generateShareToken();
  const origin = getAppOrigin().replace(/\/$/, "");

  const photoUrl = str(brand.photoUrl);
  const logoUrl = str(brand.logoUrl);
  const mapDoc = stripUndefined({
    userId: "marketing-pipeline",
    title: str(title) || str(address) || "Neighborhood tour",
    description: `Marketing tour for ${str(address) || "listing"}`,
    schemaVersion: 2,
    viewport: {
      center: { lat, lng },
      zoom: 14.2,
      bearing: 0,
      pitch: 0,
    },
    basemap: "satellite-streets-v12",
    layers: { status: { ownership: false }, order: [], labels: {} },
    printSettings: { paperSize: "full", orientation: "full" },
    printElements,
    isPublic: true,
    shareToken,
    tourNearbyCache,
    tourSettings,
    tourSlidePlan: slidePlan,
    listingAgent: {
      name: str(brand.name),
      email: str(brand.email),
      phone: str(brand.phone),
      photoUrl: /^https?:\/\//i.test(photoUrl) ? photoUrl : "",
      logoUrl: /^https?:\/\//i.test(logoUrl) ? logoUrl : "",
    },
    source: "generateListingMarketingAssets",
  });
  mapDoc.createdAt = admin.firestore.FieldValue.serverTimestamp();
  mapDoc.updatedAt = admin.firestore.FieldValue.serverTimestamp();

  const docRef = await admin.firestore().collection("maps").add(mapDoc);

  return {
    mapId: docRef.id,
    shareToken,
    slidePlan,
    enabledAmenityKeys: enabledKeys,
    amenitySlideCount: enabledKeys.length,
    viewUrl: `${origin}/view/${shareToken}`,
    tourUrl: `${origin}/tour/${shareToken}?basemap=imagery-3d`,
    amenityMapUrl: `${origin}/amenities/${shareToken}`,
    amenityMapEditUrl: `${origin}/amenities/${shareToken}?edit=1`,
  };
}

module.exports = {
  NEIGHBORHOOD_TOUR_CATEGORY_KEYS,
  createMarketingTourFromAmenities,
};
