/**
 * Marketing-agent API: address → neighborhood map PNG (loop-friendly).
 *
 * Headless HTTP (no browser login):
 *   POST generateNeighborhoodMapHttp
 *   Header: X-Api-Key: <marketing.neighborhood_map_key>
 *   (Prefer X-Api-Key — Authorization: Bearer can be intercepted by Google IAM.)
 *   Body: { address, title?, radiusMeters?, includeBase64? }
 *
 * Optional callable (signed-in app): generateNeighborhoodMapPreview
 *
 * Uses Places (+ grid cache) + Google Static Maps → Storage PNG URL.
 */
const functions = require("firebase-functions");
const admin = require("firebase-admin");
const {
  fetchTourNearbyPlacesNew,
  fetchTourGroceryPlacesNew,
} = require("./placesApiNew");
const {
  readAmenityGridCache,
  writeAmenityGridCache,
  gridCellKey,
} = require("./amenityGridCache");
const { enrichNearbyTourFeatureCollection } = require("./nearbyTourEnrichment");

const NEARBY_TOUR_DATA_VERSION = 29;
const DEFAULT_RADIUS_M = 8000;

const CATEGORIES = [
  {
    key: "dining",
    label: "Dining",
    max: 5,
    min: 2,
    types: ["restaurant", "pizza_restaurant", "seafood_restaurant", "meal_takeaway"],
    color: "0xF97316",
  },
  {
    key: "coffee",
    label: "Coffee",
    max: 4,
    min: 1,
    types: ["cafe", "coffee_shop"],
    color: "0xA16207",
  },
  {
    key: "grocery",
    label: "Grocery",
    max: 3,
    min: 1,
    types: ["supermarket", "grocery_store", "food_store"],
    color: "0xEAB308",
  },
  {
    key: "fitness",
    label: "Fitness",
    max: 4,
    min: 1,
    types: ["gym"],
    color: "0xF43F5E",
  },
  {
    key: "parks_rec",
    label: "Parks",
    max: 5,
    min: 2,
    types: ["park"],
    color: "0x22C55E",
  },
  {
    key: "transit",
    label: "Transit",
    max: 3,
    min: 1,
    types: ["subway_station", "train_station", "bus_station", "transit_station"],
    color: "0x6366F1",
  },
  {
    key: "essentials",
    label: "Essentials",
    max: 3,
    min: 1,
    types: ["pharmacy", "drugstore", "hardware_store", "bank"],
    color: "0x78716C",
  },
];

function str(v) {
  return String(v == null ? "" : v).trim();
}

function getGoogleKey() {
  let cfg = {};
  try {
    cfg = functions.config() || {};
  } catch (_) {
    cfg = {};
  }
  return str(
    (cfg.google && cfg.google.places_key) || process.env.GOOGLE_PLACES_KEY || ""
  );
}

function haversineMiles(aLat, aLng, bLat, bLng) {
  const toRad = (d) => (d * Math.PI) / 180;
  const R = 3958.8;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(x)));
}

function scorePlace(p) {
  const miles = Number(p.straightLineMiles);
  const dist = Number.isFinite(miles) ? miles : 99;
  const rating = Number(p.rating);
  const stars = Number.isFinite(rating) ? rating : 0;
  const reviews = Number(p.user_ratings_total) || 0;
  return stars * 3.2 + Math.log10(reviews + 1) * 1.35 - dist * 1.8;
}

async function geocodeAddress(address, apiKey) {
  // Prefer Places API (New) text search — Geocoding API may not be enabled on this key.
  const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask":
        "places.formattedAddress,places.location,places.displayName",
    },
    body: JSON.stringify({
      textQuery: address,
      maxResultCount: 1,
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Geocode HTTP ${res.status}: ${body.slice(0, 160)}`);
  }
  const json = await res.json();
  const place = Array.isArray(json?.places) ? json.places[0] : null;
  const lat = Number(place?.location?.latitude);
  const lng = Number(place?.location?.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    const err = new Error(`Could not geocode address: ${address}`);
    err.code = "not-found";
    throw err;
  }
  return {
    lat,
    lng,
    formattedAddress: str(place.formattedAddress) || address,
  };
}

async function fetchCategoryFeatures(lat, lng, cat, radiusMeters, apiKey) {
  const cached = await readAmenityGridCache(lat, lng, cat.key, radiusMeters);
  if (cached && Array.isArray(cached.features) && cached.features.length) {
    return { features: cached.features, fromCache: true };
  }

  let all = [];
  if (cat.key === "grocery") {
    all = await fetchTourGroceryPlacesNew(lat, lng, radiusMeters, apiKey);
  } else {
    all = await fetchTourNearbyPlacesNew(lat, lng, radiusMeters, apiKey, cat.types);
  }

  const rawFeatures = [];
  const seen = new Set();
  for (const r of all || []) {
    const placeId = str(r.place_id);
    if (!placeId || seen.has(placeId)) continue;
    if (r.business_status === "CLOSED_PERMANENTLY") continue;
    const plat = Number(r.geometry?.location?.lat);
    const plng = Number(r.geometry?.location?.lng);
    if (!Number.isFinite(plat) || !Number.isFinite(plng)) continue;
    const name = str(r.name);
    if (!name) continue;
    seen.add(placeId);
    rawFeatures.push({
      type: "Feature",
      geometry: { type: "Point", coordinates: [plng, plat] },
      properties: {
        name,
        amenityKey: cat.key,
        place_id: placeId,
        placeId,
        rating: typeof r.rating === "number" ? r.rating : undefined,
        user_ratings_total:
          typeof r.user_ratings_total === "number" ? r.user_ratings_total : undefined,
        googleTypes: Array.isArray(r.types) ? r.types.map(String) : [],
      },
    });
  }

  const enriched = enrichNearbyTourFeatureCollection(
    { lat, lng },
    { type: "FeatureCollection", features: rawFeatures },
    cat.key,
    { searchRadiusMeters: radiusMeters }
  );

  await writeAmenityGridCache(
    lat,
    lng,
    cat.key,
    radiusMeters,
    enriched,
    NEARBY_TOUR_DATA_VERSION
  );

  return { features: enriched.features || [], fromCache: false };
}

function curateFromByAmenity(byAmenity, homeLat, homeLng) {
  const maxTotal = 26;
  const picked = [];
  const seen = new Set();
  const minSepMiles = 200 / 5280;

  const tryAdd = (row, force = false) => {
    if (!row || seen.has(row.placeId)) return false;
    if (
      !force &&
      picked.some((p) => haversineMiles(row.lat, row.lng, p.lat, p.lng) < minSepMiles)
    ) {
      return false;
    }
    seen.add(row.placeId);
    picked.push(row);
    return true;
  };

  const ranked = (cat) =>
    (byAmenity[cat.key] || [])
      .map((f) => {
        const p = f.properties || {};
        const name = str(p.name);
        const lng = Number(f.geometry?.coordinates?.[0]);
        const lat = Number(f.geometry?.coordinates?.[1]);
        if (!name || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;
        const placeId = str(p.placeId || p.place_id);
        const miles = haversineMiles(homeLat, homeLng, lat, lng);
        const props = {
          ...p,
          straightLineMiles: miles,
        };
        return {
          placeId,
          name,
          amenityKey: cat.key,
          categoryLabel: cat.label,
          color: cat.color,
          lat,
          lng,
          miles: Math.round(miles * 10) / 10,
          rating: Number.isFinite(Number(p.rating)) ? Number(p.rating) : null,
          reviews: Number(p.user_ratings_total) || 0,
          score: scorePlace(props),
        };
      })
      .filter(Boolean)
      .sort((a, b) => b.score - a.score);

  for (const cat of CATEGORIES) {
    const list = ranked(cat);
    let taken = 0;
    const need = cat.min || 1;
    for (const row of list) {
      if (taken >= need || picked.length >= maxTotal) break;
      if (tryAdd(row)) taken += 1;
    }
    if (taken < need) {
      for (const row of list) {
        if (taken >= need || picked.length >= maxTotal) break;
        if (tryAdd(row, true)) taken += 1;
      }
    }
  }

  for (const cat of CATEGORIES) {
    const list = ranked(cat);
    let taken = picked.filter((p) => p.amenityKey === cat.key).length;
    for (const row of list) {
      if (taken >= (cat.max || 4) || picked.length >= maxTotal) break;
      if (tryAdd(row)) taken += 1;
    }
  }

  return picked.map((row, idx) => ({ number: idx + 1, ...row }));
}

function buildStaticMapUrl(homeLat, homeLng, amenities, apiKey) {
  const params = new URLSearchParams();
  params.set("size", "800x1000");
  params.set("scale", "2");
  params.set("maptype", "roadmap");
  params.set("key", apiKey);

  // Home — bright red, large via marker style
  params.append(
    "markers",
    `color:0xEF4444|size:mid|label:H|${homeLat},${homeLng}`
  );

  // Amenity pins (cap markers to keep URL short; labels are single chars)
  const top = (amenities || []).slice(0, 22);
  for (const a of top) {
    const n = Number(a.number) || 0;
    const label =
      n >= 1 && n <= 9
        ? String(n)
        : n >= 10
          ? String.fromCharCode(65 + ((n - 10) % 26))
          : "•";
    const color = a.color || "0x2563EB";
    params.append(
      "markers",
      `color:${color}|size:small|label:${label}|${a.lat},${a.lng}`
    );
  }

  // Fit visible region: visible path via markers is enough; add tiny path for padding
  params.append(
    "visible",
    `${homeLat},${homeLng}`
  );

  return `https://maps.googleapis.com/maps/api/staticmap?${params.toString()}`;
}

async function uploadPng(buffer, path) {
  const bucket = admin.storage().bucket();
  const file = bucket.file(path);
  await file.save(buffer, {
    contentType: "image/png",
    resumable: false,
    metadata: {
      cacheControl: "public,max-age=86400",
    },
  });
  const [url] = await file.getSignedUrl({
    action: "read",
    expires: Date.now() + 1000 * 60 * 60 * 24 * 14, // 14 days
  });
  return { pngUrl: url, pngPath: path };
}

function getMarketingMapKey() {
  let cfg = {};
  try {
    cfg = functions.config() || {};
  } catch (_) {
    cfg = {};
  }
  return str(
    (cfg.marketing && cfg.marketing.neighborhood_map_key) ||
      process.env.MARKETING_NEIGHBORHOOD_MAP_KEY ||
      ""
  );
}

function timingSafeEqualString(a, b) {
  const crypto = require("crypto");
  const left = Buffer.from(String(a || ""));
  const right = Buffer.from(String(b || ""));
  if (!left.length || left.length !== right.length) return false;
  try {
    return crypto.timingSafeEqual(left, right);
  } catch (_) {
    return false;
  }
}

function extractBearerOrApiKey(req) {
  const auth = str(req.get("authorization") || req.get("Authorization"));
  if (/^bearer\s+/i.test(auth)) {
    return auth.replace(/^bearer\s+/i, "").trim();
  }
  return str(req.get("x-api-key") || req.query.key || "");
}

/**
 * Core: address (or lat/lng) → curated amenities → Static Map PNG → Storage.
 * @param {object} input
 * @param {{ ownerFolder?: string }} [opts]
 */
async function runNeighborhoodMapPreview(input, opts = {}) {
  const address = str(input?.address);
  const latIn = Number(input?.lat);
  const lngIn = Number(input?.lng);
  const hasCoords = Number.isFinite(latIn) && Number.isFinite(lngIn);
  if (!address && !hasCoords) {
    const err = new Error("address (or lat+lng) is required");
    err.code = "invalid-argument";
    throw err;
  }

  const googleKey = getGoogleKey();
  if (!googleKey) {
    const err = new Error(
      "Google Places/Maps key is not configured (google.places_key)."
    );
    err.code = "failed-precondition";
    throw err;
  }

  const title = str(input?.title) || address || "Neighborhood map";
  const radiusMeters = Math.min(
    50000,
    Math.max(500, Number(input?.radiusMeters) || DEFAULT_RADIUS_M)
  );
  const includeBase64 = Boolean(input?.includeBase64);

  let lat = latIn;
  let lng = lngIn;
  let formattedAddress = address;
  if (!hasCoords) {
    const geo = await geocodeAddress(address, googleKey);
    lat = geo.lat;
    lng = geo.lng;
    formattedAddress = geo.formattedAddress;
  } else if (!formattedAddress) {
    formattedAddress = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
  }

  const cell = gridCellKey(lat, lng);
  const byAmenity = {};
  const cacheHits = {};
  await Promise.all(
    CATEGORIES.map(async (cat) => {
      const { features, fromCache } = await fetchCategoryFeatures(
        lat,
        lng,
        cat,
        radiusMeters,
        googleKey
      );
      byAmenity[cat.key] = features;
      cacheHits[cat.key] = fromCache;
    })
  );

  const amenities = curateFromByAmenity(byAmenity, lat, lng);
  if (!amenities.length) {
    const err = new Error("No amenities found near this address.");
    err.code = "not-found";
    throw err;
  }

  const staticUrl = buildStaticMapUrl(lat, lng, amenities, googleKey);
  const imgRes = await fetch(staticUrl);
  if (!imgRes.ok) {
    const body = await imgRes.text().catch(() => "");
    const err = new Error(
      `Static map failed (${imgRes.status}): ${body.slice(0, 180)}`
    );
    err.code = "internal";
    throw err;
  }
  const buffer = Buffer.from(await imgRes.arrayBuffer());

  const safe =
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 60) || "neighborhood-map";
  const ownerFolder = str(opts.ownerFolder) || "marketing";
  const path = `neighborhoodMaps/${ownerFolder}/${Date.now()}_${safe}.png`;
  const { pngUrl, pngPath } = await uploadPng(buffer, path);

  try {
    await admin.firestore().collection("marketingGenerations").add({
      uid: opts.uid || null,
      source: opts.source || "http",
      type: "neighborhood_map_preview",
      address: formattedAddress,
      gridCell: cell,
      amenityCount: amenities.length,
      cacheHits,
      pngPath,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  } catch (_) {
    /* non-fatal */
  }

  const out = {
    address: formattedAddress,
    title,
    lat,
    lng,
    gridCell: cell,
    pngUrl,
    pngPath,
    amenityCount: amenities.length,
    amenities: amenities.map((a) => ({
      number: a.number,
      name: a.name,
      category: a.categoryLabel,
      amenityKey: a.amenityKey,
      miles: a.miles,
      rating: a.rating,
    })),
    cacheHits,
    source: "static_maps",
  };
  if (includeBase64) {
    out.pngBase64 = buffer.toString("base64");
    out.mimeType = "image/png";
  }
  return out;
}

function httpStatusForCode(code) {
  if (code === "invalid-argument") return 400;
  if (code === "unauthenticated") return 401;
  if (code === "failed-precondition") return 503;
  if (code === "not-found") return 404;
  return 500;
}

/** Headless marketing loop — no Firebase Auth / browser. */
exports.generateNeighborhoodMapHttp = functions
  .runWith({ timeoutSeconds: 120, memory: "512MB" })
  .https.onRequest(async (req, res) => {
    res.set("Access-Control-Allow-Origin", "*");
    res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.set(
      "Access-Control-Allow-Headers",
      "Content-Type, Authorization, X-Api-Key"
    );
    if (req.method === "OPTIONS") {
      res.status(204).send("");
      return;
    }
    if (req.method !== "POST") {
      res.status(405).json({ error: "POST required" });
      return;
    }

    const expected = getMarketingMapKey();
    if (!expected) {
      res.status(503).json({
        error:
          "Set marketing.neighborhood_map_key via firebase functions:config:set",
      });
      return;
    }
    const provided = extractBearerOrApiKey(req);
    if (!timingSafeEqualString(provided, expected)) {
      res.status(401).json({ error: "Invalid or missing API key" });
      return;
    }

    try {
      const body = req.body && typeof req.body === "object" ? req.body : {};
      const result = await runNeighborhoodMapPreview(body, {
        ownerFolder: "marketing",
        source: "http",
      });
      res.status(200).json(result);
    } catch (err) {
      const code = err?.code || "internal";
      console.error("generateNeighborhoodMapHttp:", err?.message || err);
      res.status(httpStatusForCode(code)).json({
        error: err?.message || "Generation failed",
        code,
      });
    }
  });

/** Optional: same generator for signed-in app callers. */
exports.generateNeighborhoodMapPreview = functions
  .runWith({ timeoutSeconds: 120, memory: "512MB" })
  .https.onCall(async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError(
        "unauthenticated",
        "Sign in, or use generateNeighborhoodMapHttp with an API key."
      );
    }
    try {
      return await runNeighborhoodMapPreview(data || {}, {
        ownerFolder: context.auth.uid,
        uid: context.auth.uid,
        source: "callable",
      });
    } catch (err) {
      const code = err?.code || "internal";
      throw new functions.https.HttpsError(
        code === "internal" ? "internal" : code,
        err?.message || "Generation failed"
      );
    }
  });
