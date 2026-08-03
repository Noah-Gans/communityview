/**
 * Google Places API (New) — one Nearby Search per tour amenity category.
 */

const FIELD_MASK = [
  "places.id",
  "places.displayName",
  "places.location",
  "places.types",
  "places.primaryType",
  "places.formattedAddress",
  "places.rating",
  "places.userRatingCount",
  "places.businessStatus",
  "places.photos",
].join(",");

const BASIC_FIELD_MASK = [
  "places.id",
  "places.displayName",
  "places.location",
  "places.types",
  "places.primaryType",
  "places.formattedAddress",
  "places.rating",
  "places.userRatingCount",
  "places.businessStatus",
].join(",");

function placeIdFromNewPlace(place) {
  if (place?.id) return String(place.id);
  const name = String(place?.name || "");
  if (name.startsWith("places/")) return name.slice("places/".length);
  return name;
}

function buildPlacePhotoMediaUrl(place, apiKey) {
  const photos = place?.photos;
  if (!apiKey || !Array.isArray(photos) || !photos.length) return "";
  const photoName = String(photos[0]?.name || "").trim();
  if (!photoName) return "";
  return (
    `https://places.googleapis.com/v1/${photoName}/media` +
    `?maxHeightPx=400&maxWidthPx=560&key=${encodeURIComponent(apiKey)}`
  );
}

function normalizeNewPlaceToLegacy(place, apiKey = "") {
  const placeId = placeIdFromNewPlace(place);
  const lat = Number(place?.location?.latitude);
  const lng = Number(place?.location?.longitude);
  const displayName = String(place?.displayName?.text || "").trim();
  const types = Array.isArray(place?.types) ? place.types.map((t) => String(t)) : [];
  const primary = place?.primaryType ? String(place.primaryType) : "";
  if (primary && !types.includes(primary)) types.push(primary);

  let businessStatus;
  const bs = String(place?.businessStatus || "").toUpperCase();
  if (bs === "CLOSED_PERMANENTLY") businessStatus = "CLOSED_PERMANENTLY";

  const out = {
    place_id: placeId,
    name: displayName,
    types,
    geometry: {
      location: { lat, lng },
    },
  };
  if (place && place.formattedAddress) out.formattedAddress = String(place.formattedAddress);
  if (typeof place?.rating === "number" && Number.isFinite(place.rating)) {
    out.rating = place.rating;
  }
  if (typeof place?.userRatingCount === "number" && Number.isFinite(place.userRatingCount)) {
    out.user_ratings_total = place.userRatingCount;
  }
  if (businessStatus) out.business_status = businessStatus;
  const photoUrl = buildPlacePhotoMediaUrl(place, apiKey);
  if (photoUrl) out.photoUrl = photoUrl;
  return out;
}

function parsePlacesError(json, status) {
  const msg =
    json?.error?.message ||
    json?.error?.status ||
    (Array.isArray(json?.error?.details) && json.error.details[0]?.message) ||
    `HTTP ${status}`;
  return String(msg);
}

async function searchNearbyNew(lat, lng, radiusMeters, apiKey, includedTypes, options = {}) {
  const types = (includedTypes || []).filter(Boolean);
  if (!types.length) return [];

  const body = {
    includedTypes: types,
    maxResultCount: 20,
    rankPreference: options.rankPreference || "DISTANCE",
    locationRestriction: {
      circle: {
        center: { latitude: lat, longitude: lng },
        radius: Math.min(50000, Math.max(1, radiusMeters)),
      },
    },
  };

  const res = await fetch("https://places.googleapis.com/v1/places:searchNearby", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask": options.basicFields ? BASIC_FIELD_MASK : FIELD_MASK,
    },
    body: JSON.stringify(body),
  });

  const json = await res.json();
  if (!res.ok) {
    const err = new Error(parsePlacesError(json, res.status));
    err.placesApiStatus = json?.error?.status;
    throw err;
  }

  const places = Array.isArray(json?.places) ? json.places : [];
  return places
    .map((p) => normalizeNewPlaceToLegacy(p, apiKey))
    .filter((p) => p.place_id && p.name);
}

const GROCERY_NEARBY_TYPES = ["supermarket", "grocery_store", "food_store"];

async function fetchTourGroceryPlacesNew(lat, lng, radiusMeters, apiKey, options = {}) {
  return searchNearbyNew(lat, lng, radiusMeters, apiKey, GROCERY_NEARBY_TYPES, {
    rankPreference: "DISTANCE",
    basicFields: options.basicFields === true,
  });
}

/** One Nearby Search per amenity — all Google types in a single request. */
async function fetchTourNearbyPlacesNew(
  lat,
  lng,
  radiusMeters,
  apiKey,
  includedTypes,
  options = {}
) {
  return searchNearbyNew(lat, lng, radiusMeters, apiKey, includedTypes, {
    rankPreference: "DISTANCE",
    basicFields: options.basicFields === true,
  });
}

module.exports = {
  searchNearbyNew,
  fetchTourNearbyPlacesNew,
  fetchTourGroceryPlacesNew,
  normalizeNewPlaceToLegacy,
};
