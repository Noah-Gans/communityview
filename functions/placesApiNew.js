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
  const includedPrimaryTypes = (options.includedPrimaryTypes || []).filter(Boolean);
  if (!types.length && !includedPrimaryTypes.length) return [];

  const excludedTypes = (options.excludedTypes || []).filter(Boolean);
  const body = {
    maxResultCount: 20,
    rankPreference: options.rankPreference || "DISTANCE",
    locationRestriction: {
      circle: {
        center: { latitude: lat, longitude: lng },
        radius: Math.min(50000, Math.max(1, radiusMeters)),
      },
    },
  };
  if (types.length) body.includedTypes = types;
  if (includedPrimaryTypes.length) body.includedPrimaryTypes = includedPrimaryTypes;
  if (excludedTypes.length) body.excludedTypes = excludedTypes;

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

const GROCERY_NEARBY_TYPES = ["supermarket", "grocery_store"];

/**
 * Do not exclude bakery/cafe/restaurant — full-service grocers carry those
 * extra types and Nearby Search drops any place with even one excluded type.
 */
async function fetchTourGroceryPlacesNew(lat, lng, radiusMeters, apiKey, options = {}) {
  return searchNearbyNew(lat, lng, radiusMeters, apiKey, [], {
    rankPreference: "DISTANCE",
    basicFields: options.basicFields === true,
    includedPrimaryTypes: GROCERY_NEARBY_TYPES,
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
    excludedTypes: options.excludedTypes,
    includedPrimaryTypes: options.includedPrimaryTypes,
  });
}

function namedAddBiasMeters(radiusMeters) {
  return Math.min(50000, Math.max(Number(radiusMeters) || 8000, 19312));
}

function locationBiasCircle(lat, lng, radiusMeters) {
  return {
    circle: {
      center: { latitude: lat, longitude: lng },
      radius: namedAddBiasMeters(radiusMeters),
    },
  };
}

async function autocompletePlacesNew(lat, lng, radiusMeters, apiKey, textQuery, options = {}) {
  const query = String(textQuery || "").trim();
  if (!query || !apiKey) return { suggestions: [], apiError: "" };

  const body = {
    input: query,
    includedRegionCodes: ["us"],
    locationBias: locationBiasCircle(lat, lng, radiusMeters),
  };
  const sessionToken = String(options.sessionToken || "").trim();
  if (sessionToken) body.sessionToken = sessionToken;

  const res = await fetch("https://places.googleapis.com/v1/places:autocomplete", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask": [
        "suggestions.placePrediction.placeId",
        "suggestions.placePrediction.text",
        "suggestions.placePrediction.structuredFormat",
      ].join(","),
    },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (!res.ok) return { suggestions: [], apiError: parsePlacesError(json, res.status) };

  const suggestions = (Array.isArray(json.suggestions) ? json.suggestions : [])
    .map((row) => {
      const pred = row && row.placePrediction;
      const placeId = String((pred && pred.placeId) || "").trim();
      if (!placeId) return null;
      const structured = pred && pred.structuredFormat;
      const main = String(
        (structured && structured.mainText && structured.mainText.text) ||
          (pred.text && pred.text.text) ||
          ""
      ).trim();
      const secondary = String(
        (structured && structured.secondaryText && structured.secondaryText.text) || ""
      ).trim();
      if (!main) return null;
      return { placeId, name: main, address: secondary };
    })
    .filter(Boolean);
  return { suggestions, apiError: "" };
}

async function fetchPlaceDetailsNew(placeId, apiKey, options = {}) {
  const id = String(placeId || "").trim();
  if (!id || !apiKey) return { place: null, apiError: "Missing place." };

  const params = new URLSearchParams();
  const sessionToken = String(options.sessionToken || "").trim();
  if (sessionToken) params.set("sessionToken", sessionToken);
  const qs = params.toString();
  const res = await fetch(
    `https://places.googleapis.com/v1/places/${encodeURIComponent(id)}${qs ? `?${qs}` : ""}`,
    {
      headers: {
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask":
          "id,displayName,location,types,primaryType,formattedAddress,rating,userRatingCount,businessStatus",
      },
    }
  );
  const json = await res.json();
  if (!res.ok) return { place: null, apiError: parsePlacesError(json, res.status) };
  const place = normalizeNewPlaceToLegacy(json, apiKey);
  if (!place.place_id || !place.name) {
    return { place: null, apiError: "Could not load that place." };
  }
  return { place, apiError: "" };
}

async function searchTextNew(lat, lng, radiusMeters, apiKey, textQuery, options = {}) {
  const query = String(textQuery || "").trim();
  if (!query) return { results: [], apiError: "" };

  const body = {
    textQuery: query,
    maxResultCount: Math.min(8, Math.max(1, Number(options.maxResultCount) || 8)),
    locationBias: locationBiasCircle(lat, lng, radiusMeters),
  };

  const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask": BASIC_FIELD_MASK,
    },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (!res.ok) return { results: [], apiError: parsePlacesError(json, res.status) };
  const places = Array.isArray(json.places) ? json.places : [];
  return {
    results: places
      .map((p) => normalizeNewPlaceToLegacy(p, apiKey))
      .filter((p) => p.place_id && p.name),
    apiError: "",
  };
}

module.exports = {
  searchNearbyNew,
  fetchTourNearbyPlacesNew,
  fetchTourGroceryPlacesNew,
  normalizeNewPlaceToLegacy,
  autocompletePlacesNew,
  fetchPlaceDetailsNew,
  searchTextNew,
  namedAddBiasMeters,
};
