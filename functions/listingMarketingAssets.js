/**
 * Marketing loop API (v1): address → parcel → amenity set → neighborhood map PNG.
 *
 * Tour generation will plug into the same amenity set later.
 *
 * POST generateListingMarketingAssets
 * Header: X-Api-Key: <marketing.neighborhood_map_key>
 * Body: {
 *   address,
 *   title?,
 *   countyPath?,
 *   products?: ["neighborhood_map", "tour"],
 *   mapFormat?: "png",
 *   radiusMeters?,
 *   includeBase64?,
 *   brand?: { name, email, phone, photoUrl, logoUrl }
 * }
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
  readCuratedAmenityGridCache,
  writeCuratedAmenityGridCache,
  gridCellKey,
  JACKSON_CELL_STEP_DEG,
} = require("./amenityGridCache");
const { enrichNearbyTourFeatureCollection } = require("./nearbyTourEnrichment");
const { resolveListingParcel } = require("./resolveListingParcel");
const {
  curateNeighborhoodAmenityIds,
} = require("./neighborhoodAmenityCurate");
const {
  createMarketingTourFromAmenities,
} = require("./createMarketingTour");
const JACKSON_FAVORITES = require("./jacksonAmenityFavorites.json");

const NEARBY_TOUR_DATA_VERSION = 29;
const DEFAULT_RADIUS_M = 8000;
/** Marketing density — multiple per category, Baker-ST style coverage. */
const MARKETING_MAX_AMENITIES = 24;
const MARKETING_MIN_SEP_FEET = 200;
/** Jackson Hole / Wilson / Teton Village envelope. */
const JACKSON_BOUNDS = {
  minLat: 43.35,
  maxLat: 43.65,
  minLng: -110.95,
  maxLng: -110.65,
};

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
    label: "Coffee & Bakeries",
    max: 4,
    min: 2,
    types: ["cafe", "coffee_shop"],
    color: "0xA16207",
  },
  {
    key: "grocery",
    label: "Groceries & Essentials",
    max: 3,
    min: 1,
    types: ["supermarket", "grocery_store", "food_store"],
    color: "0xEAB308",
  },
  {
    key: "schools",
    label: "Schools",
    max: 4,
    min: 1,
    types: ["primary_school", "secondary_school", "school"],
    color: "0x2563EB",
  },
  {
    key: "fitness",
    label: "Fitness & Wellness",
    max: 4,
    min: 2,
    types: ["gym"],
    color: "0xF43F5E",
  },
  {
    key: "parks_rec",
    label: "Parks & Recreation",
    max: 5,
    min: 2,
    types: ["park"],
    color: "0x22C55E",
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

/** Jackson physical map — no essentials; schools included. */
const JACKSON_CATEGORY_KEYS = [
  "dining",
  "coffee",
  "grocery",
  "schools",
  "fitness",
  "parks_rec",
];

function isJacksonHole(lat, lng) {
  const a = Number(lat);
  const b = Number(lng);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
  return (
    a >= JACKSON_BOUNDS.minLat &&
    a <= JACKSON_BOUNDS.maxLat &&
    b >= JACKSON_BOUNDS.minLng &&
    b <= JACKSON_BOUNDS.maxLng
  );
}

function categoriesForLocation(lat, lng) {
  if (!isJacksonHole(lat, lng)) return CATEGORIES;
  return CATEGORIES.filter((c) => JACKSON_CATEGORY_KEYS.includes(c.key));
}

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

function extractApiKey(req) {
  return str(req.get("x-api-key") || req.query.key || "");
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

async function fetchCategoryFeatures(lat, lng, cat, radiusMeters, apiKey, options = {}) {
  const cellOpts = options.cellStep ? { cellStep: options.cellStep } : {};
  const cached = await readAmenityGridCache(
    lat,
    lng,
    cat.key,
    radiusMeters,
    cellOpts
  );
  if (cached && Array.isArray(cached.features) && cached.features.length) {
    return { features: cached.features, fromCache: true };
  }

  let all = [];
  if (cat.key === "grocery") {
    all = await fetchTourGroceryPlacesNew(lat, lng, radiusMeters, apiKey);
  } else {
    all = await fetchTourNearbyPlacesNew(
      lat,
      lng,
      radiusMeters,
      apiKey,
      cat.types
    );
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
          typeof r.user_ratings_total === "number"
            ? r.user_ratings_total
            : undefined,
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
    NEARBY_TOUR_DATA_VERSION,
    cellOpts
  );

  return { features: enriched.features || [], fromCache: false };
}

function curateFromByAmenity(byAmenity, homeLat, homeLng, options = {}) {
  const maxTotal = Number(options.maxTotal) || MARKETING_MAX_AMENITIES;
  const minSepMiles = (Number(options.minSepFeet) || MARKETING_MIN_SEP_FEET) / 5280;
  const categories =
    Array.isArray(options.categories) && options.categories.length
      ? options.categories
      : CATEGORIES;
  const picked = [];
  const seen = new Set();

  const tryAdd = (row, force = false) => {
    if (!row || seen.has(row.placeId)) return false;
    if (
      !force &&
      picked.some(
        (p) => haversineMiles(row.lat, row.lng, p.lat, p.lng) < minSepMiles
      )
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
        const props = { ...p, straightLineMiles: miles };
        return {
          placeId,
          id: placeId,
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

  // Build full candidate pool (for AI), then sparse pick.
  const allCandidates = [];
  for (const cat of categories) {
    allCandidates.push(...ranked(cat).slice(0, 12));
  }

  const placeIds = Array.isArray(options.placeIds) ? options.placeIds : [];
  const byId = new Map(allCandidates.map((c) => [c.placeId, c]));

  for (const id of placeIds) {
    if (picked.length >= maxTotal) break;
    tryAdd(byId.get(str(id)));
  }

  // Guarantee category mins when available
  for (const cat of categories) {
    if (picked.length >= maxTotal) break;
    const need = Math.max(0, (cat.min || 1));
    let have = picked.filter((p) => p.amenityKey === cat.key).length;
    const list = ranked(cat);
    for (const row of list) {
      if (have >= need || picked.length >= maxTotal) break;
      if (tryAdd(row)) have += 1;
    }
    while (have < need && list.length) {
      const row = list.find((r) => !seen.has(r.placeId));
      if (!row) break;
      if (tryAdd(row, true)) have += 1;
      else break;
    }
  }

  // Fill remaining up to per-category max
  const rest = [
    ...placeIds.map((id) => byId.get(str(id))).filter(Boolean),
    ...allCandidates.sort((a, b) => b.score - a.score),
  ];
  for (const row of rest) {
    if (picked.length >= maxTotal) break;
    const catMax = categories.find((c) => c.key === row.amenityKey)?.max || 4;
    const have = picked.filter((p) => p.amenityKey === row.amenityKey).length;
    if (have >= catMax) continue;
    tryAdd(row);
  }

  return {
    amenities: picked.map((row, idx) => ({ number: idx + 1, ...row })),
    candidates: allCandidates,
  };
}

function favoriteRowsForCategory(catKey, homeLat, homeLng) {
  const maxMi =
    Number(JACKSON_FAVORITES.maxMilesByCategory?.[catKey]) || 6;
  const list = JACKSON_FAVORITES.byCategory?.[catKey] || [];
  return list
    .map((f) => {
      const miles = haversineMiles(homeLat, homeLng, f.lat, f.lng);
      const row = {
        placeId: str(f.placeId),
        name: str(f.name),
        amenityKey: catKey,
        categoryLabel:
          CATEGORIES.find((c) => c.key === catKey)?.label || catKey,
        lat: Number(f.lat),
        lng: Number(f.lng),
        miles: Math.round(miles * 10) / 10,
        score: 1000 - miles,
        isFavorite: true,
      };
      if (f.rating != null && Number.isFinite(Number(f.rating))) {
        row.rating = Number(f.rating);
      }
      if (f.reviews != null && Number.isFinite(Number(f.reviews))) {
        row.reviews = Number(f.reviews);
      }
      return row;
    })
    .filter((r) => r.placeId && Number.isFinite(r.lat) && Number.isFinite(r.lng))
    .filter((r) => r.miles <= maxMi)
    .sort((a, b) => a.miles - b.miles);
}

/**
 * Jackson: prefer Noah's shortlist by proximity; allow a clearly nearer
 * non-favorite as dynamic fallback. No Places cost for favorites themselves.
 */
function curateJacksonFromFavorites(byAmenity, homeLat, homeLng, categories) {
  const picked = [];
  const seen = new Set();
  const minSepMiles = MARKETING_MIN_SEP_FEET / 5280;

  const tryAdd = (row) => {
    if (!row || !row.placeId || seen.has(row.placeId)) return false;
    if (
      picked.some(
        (p) => haversineMiles(row.lat, row.lng, p.lat, p.lng) < minSepMiles
      )
    ) {
      return false;
    }
    seen.add(row.placeId);
    picked.push(row);
    return true;
  };

  const nearbyForCat = (cat) =>
    (byAmenity[cat.key] || [])
      .map((f) => {
        const p = f.properties || {};
        const name = str(p.name);
        const lng = Number(f.geometry?.coordinates?.[0]);
        const lat = Number(f.geometry?.coordinates?.[1]);
        const placeId = str(p.placeId || p.place_id);
        if (!name || !placeId || !Number.isFinite(lat) || !Number.isFinite(lng)) {
          return null;
        }
        const miles = haversineMiles(homeLat, homeLng, lat, lng);
        return {
          placeId,
          name,
          amenityKey: cat.key,
          categoryLabel: cat.label,
          lat,
          lng,
          miles: Math.round(miles * 10) / 10,
          rating: typeof p.rating === "number" ? p.rating : undefined,
          reviews:
            typeof p.user_ratings_total === "number"
              ? p.user_ratings_total
              : undefined,
          score: scorePlace({
            straightLineMiles: miles,
            rating: p.rating,
            user_ratings_total: p.user_ratings_total,
          }),
          isFavorite: false,
        };
      })
      .filter(Boolean)
      .filter((r) => r.miles <= (Number(JACKSON_FAVORITES.maxMilesByCategory?.[cat.key]) || 8))
      .sort((a, b) => a.miles - b.miles || b.score - a.score);

  for (const cat of categories) {
    const favs = favoriteRowsForCategory(cat.key, homeLat, homeLng);
    const nearby = nearbyForCat(cat);
    const bestFav = favs[0] || null;
    const bestNear = nearby[0] || null;

    // Primary: closest favorite. Dynamic: nearer non-fav if clearly closer.
    if (bestFav && bestNear && !favs.some((f) => f.placeId === bestNear.placeId)) {
      const clearlyNearer =
        bestNear.miles + 0.75 < bestFav.miles ||
        (bestNear.miles <= 1.25 && bestFav.miles >= 3);
      if (clearlyNearer) tryAdd(bestNear);
    }
    if (bestFav) tryAdd(bestFav);

    // Fill toward category max (Jackson print maps need denser coverage).
    const catMax = cat.max || 4;
    const pool = [
      ...favs,
      ...nearby.filter((n) => !favs.some((f) => f.placeId === n.placeId)),
    ];
    for (const row of pool) {
      const have = picked.filter((p) => p.amenityKey === cat.key).length;
      if (have >= catMax) break;
      tryAdd(row);
    }
  }

  return picked.map((row, idx) => ({ number: idx + 1, ...row }));
}

async function buildAmenitySet(lat, lng, radiusMeters, meta = {}) {
  const jackson = isJacksonHole(lat, lng);
  const categories = categoriesForLocation(lat, lng);
  const cellStep = jackson ? JACKSON_CELL_STEP_DEG : undefined;
  const cellOpts = cellStep ? { cellStep } : {};
  const cell = gridCellKey(lat, lng, cellStep);

  const curatedHit = await readCuratedAmenityGridCache(
    lat,
    lng,
    radiusMeters,
    cellOpts
  );
  if (curatedHit?.amenities?.length) {
    const amenities = curatedHit.amenities.map((a, idx) => {
      const miles = haversineMiles(lat, lng, a.lat, a.lng);
      return {
        ...a,
        miles: Math.round(miles * 10) / 10,
        number: idx + 1,
      };
    });
    return {
      amenities,
      cacheHits: { curated: true },
      gridCell: curatedHit.gridCell || cell,
      curateSource: `${curatedHit.curateSource || "cache"}+grid`,
      fromCuratedCache: true,
    };
  }

  const apiKey = getGoogleKey();
  if (!apiKey) {
    const err = new Error(
      "Google Places key not configured (google.places_key)."
    );
    err.code = "failed-precondition";
    throw err;
  }

  const byAmenity = {};
  const cacheHits = {};
  await Promise.all(
    categories.map(async (cat) => {
      const { features, fromCache } = await fetchCategoryFeatures(
        lat,
        lng,
        cat,
        radiusMeters,
        apiKey,
        cellOpts
      );
      byAmenity[cat.key] = features;
      cacheHits[cat.key] = fromCache;
    })
  );

  let amenities;
  let curateSource;

  if (jackson) {
    amenities = curateJacksonFromFavorites(byAmenity, lat, lng, categories);
    curateSource = "jackson_favorites";
    // If favorites+nearby still thin, pad with heuristic (relaxed distance).
    if (amenities.length < 6) {
      const draft = curateFromByAmenity(byAmenity, lat, lng, {
        maxTotal: MARKETING_MAX_AMENITIES,
        minSepFeet: MARKETING_MIN_SEP_FEET,
        placeIds: amenities.map((a) => a.placeId),
        categories,
      });
      const seen = new Set(amenities.map((a) => a.placeId));
      for (const row of draft.amenities) {
        if (amenities.length >= 14) break;
        if (seen.has(row.placeId)) continue;
        seen.add(row.placeId);
        amenities.push({ ...row, number: amenities.length + 1 });
      }
      curateSource = "jackson_favorites+heuristic";
    }
  } else {
    const draft = curateFromByAmenity(byAmenity, lat, lng, {
      maxTotal: 40,
      minSepFeet: 80,
      placeIds: [],
      categories,
    });

    let placeIds = [];
    curateSource = "heuristic";
    try {
      const ai = await curateNeighborhoodAmenityIds({
        address: meta.address || "",
        placeLabel: meta.placeLabel || "",
        density: "default",
        candidates: draft.candidates.slice(0, 50).map((c) => ({
          id: c.placeId,
          name: c.name,
          category: c.categoryLabel,
          amenityKey: c.amenityKey,
          miles: c.miles,
          rating: c.rating,
          reviews: c.reviews,
        })),
      });
      if (ai?.placeIds?.length) {
        placeIds = ai.placeIds;
        curateSource = ai.source || "gemini";
      }
    } catch (err) {
      console.warn(
        "AI amenity curate failed:",
        err?.message || err,
        "| candidates:",
        draft.candidates?.length || 0
      );
    }

    ({ amenities } = curateFromByAmenity(byAmenity, lat, lng, {
      maxTotal: MARKETING_MAX_AMENITIES,
      minSepFeet: MARKETING_MIN_SEP_FEET,
      placeIds,
      categories,
    }));

    // Tight distance caps only for dense Bay-style maps; mountain towns need more reach.
    const bayArea =
      lat >= 36.8 && lat <= 38.5 && lng >= -123.2 && lng <= -121.5;
    if (bayArea) {
      const distMi = (a) => haversineMiles(lat, lng, a.lat, a.lng);
      amenities = amenities
        .filter((a) => {
          const m = distMi(a);
          if (a.amenityKey === "parks_rec") return m <= 1.2;
          return m <= 1.0;
        })
        .slice(0, MARKETING_MAX_AMENITIES)
        .map((a, idx) => ({ ...a, number: idx + 1 }));
    } else {
      amenities = amenities
        .slice(0, MARKETING_MAX_AMENITIES)
        .map((a, idx) => ({ ...a, number: idx + 1 }));
    }
  }

  amenities = amenities
    .filter((a) => a.amenityKey !== "transit")
    .map((a, idx) => ({ ...a, number: idx + 1 }));

  await writeCuratedAmenityGridCache(
    lat,
    lng,
    radiusMeters,
    amenities,
    curateSource,
    cellOpts
  );

  return {
    amenities,
    cacheHits,
    gridCell: cell,
    curateSource,
    fromCuratedCache: false,
  };
}

async function uploadPng(buffer, path) {
  const crypto = require("crypto");
  const bucket = admin.storage().bucket();
  const file = bucket.file(path);
  const token = crypto.randomUUID();
  await file.save(buffer, {
    contentType: "image/png",
    resumable: false,
    metadata: {
      cacheControl: "public,max-age=86400",
      metadata: {
        firebaseStorageDownloadTokens: token,
      },
    },
  });
  // Download-token URL — no service-account signBlob permission required.
  const pngUrl =
    `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/` +
    `${encodeURIComponent(path)}?alt=media&token=${token}`;
  return { pngUrl, pngPath: path };
}

function httpStatusForCode(code) {
  if (code === "invalid-argument") return 400;
  if (code === "unauthenticated") return 401;
  if (code === "failed-precondition") return 503;
  if (code === "not-found") return 404;
  return 500;
}

/**
 * Core pipeline — neighborhood map only for now.
 * Tour will attach here later using the same amenity set.
 */
async function runListingMarketingAssets(input) {
  const address = str(input?.address);
  if (!address) {
    const err = new Error("address is required");
    err.code = "invalid-argument";
    throw err;
  }

  const products = Array.isArray(input?.products) && input.products.length
    ? input.products.map(String)
    : ["neighborhood_map"];
  const wantMap = products.includes("neighborhood_map");
  const wantTour = products.includes("tour");

  const title = str(input?.title) || address;
  const radiusMeters = Math.min(
    50000,
    Math.max(500, Number(input?.radiusMeters) || DEFAULT_RADIUS_M)
  );
  const includeBase64 = Boolean(input?.includeBase64);

  const parcel = await resolveListingParcel(address, {
    countyPath: str(input?.countyPath),
    lat: Number(input?.lat),
    lng: Number(input?.lng),
  });

  const { amenities, cacheHits, gridCell, curateSource, fromCuratedCache } =
    await buildAmenitySet(parcel.lat, parcel.lng, radiusMeters, {
      address: parcel.address || address,
      placeLabel: title,
    });
  if (!amenities.length) {
    const err = new Error("No amenities found near this listing.");
    err.code = "not-found";
    throw err;
  }

  const placesEntries = Object.entries(cacheHits || {}).filter(
    ([k]) => k !== "curated"
  );
  const placesHit = placesEntries.filter(([, v]) => v === true).length;
  const placesTotal = placesEntries.length;
  const cache = {
    status: fromCuratedCache ? "hit" : "miss",
    curated: Boolean(fromCuratedCache),
    curateSource: curateSource || null,
    places: {
      hit: placesHit,
      total: placesTotal,
      byCategory: cacheHits || {},
    },
    gridCell: gridCell || null,
  };

  const result = {
    address: parcel.address || address,
    title,
    parcel: {
      ll_uuid: parcel.ll_uuid || null,
      apn: parcel.apn || null,
      address: parcel.address || address,
      owner: parcel.owner || null,
      path: parcel.path || null,
      lat: parcel.lat,
      lng: parcel.lng,
      source: parcel.source,
      hasGeometry: Boolean(parcel.geometry),
      geometry: parcel.geometry || null,
    },
    amenities: amenities.map((a) => {
      const row = {
        number: a.number,
        name: a.name,
        category: a.categoryLabel || a.category,
        amenityKey: a.amenityKey,
        miles: a.miles,
        lat: a.lat,
        lng: a.lng,
      };
      if (a.rating != null && Number.isFinite(Number(a.rating))) {
        row.rating = Number(a.rating);
      }
      return row;
    }),
    amenityCount: amenities.length,
    gridCell,
    cacheHits,
    cache,
    curateSource,
    fromCuratedCache: Boolean(fromCuratedCache),
    tour: null,
    neighborhoodMap: null,
  };

  if (wantMap) {
    try {
      const { renderNeighborhoodMapPng } = require("./renderNeighborhoodMapPng");
      const buffer = await renderNeighborhoodMapPng({
        title,
        placeLabel: parcel.address || address,
        lat: parcel.lat,
        lng: parcel.lng,
        amenities,
        geometry: parcel.geometry,
        brand: {
          name:
            str(input?.brand?.name) ||
            str(input?.brandName) ||
            "Listing agent",
          email: str(input?.brand?.email) || str(input?.brandEmail),
          phone: str(input?.brand?.phone) || str(input?.brandPhone),
          photoUrl:
            str(input?.brand?.photoUrl) ||
            str(input?.brandPhotoUrl) ||
            str(input?.agentPhotoUrl),
          photoBase64:
            str(input?.brand?.photoBase64) || str(input?.brandPhotoBase64),
          logoUrl:
            str(input?.brand?.logoUrl) ||
            str(input?.brandLogoUrl) ||
            str(input?.agentLogoUrl),
          logoBase64:
            str(input?.brand?.logoBase64) || str(input?.brandLogoBase64),
        },
      });
      const safe =
        title
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-|-$/g, "")
          .slice(0, 60) || "neighborhood-map";
      const path = `neighborhoodMaps/marketing/${Date.now()}_${safe}.png`;
      const { pngUrl, pngPath } = await uploadPng(buffer, path);
      result.neighborhoodMap = {
        format: "png",
        pngUrl,
        pngPath,
        source: "mapbox_basemap_plus_canvas_page",
      };
      if (includeBase64) {
        result.neighborhoodMap.pngBase64 = buffer.toString("base64");
        result.neighborhoodMap.mimeType = "image/png";
      }
    } catch (pngErr) {
      console.warn(
        "neighborhood map PNG failed (continuing with tour):",
        pngErr?.message || pngErr
      );
      result.neighborhoodMap = {
        format: "png",
        error: String(pngErr?.message || pngErr).slice(0, 300),
      };
    }
  }

  if (wantTour) {
    const brand = {
      name:
        str(input?.brand?.name) ||
        str(input?.brandName) ||
        "Listing agent",
      email: str(input?.brand?.email) || str(input?.brandEmail),
      phone: str(input?.brand?.phone) || str(input?.brandPhone),
      photoUrl:
        str(input?.brand?.photoUrl) ||
        str(input?.brandPhotoUrl) ||
        str(input?.agentPhotoUrl),
      logoUrl:
        str(input?.brand?.logoUrl) ||
        str(input?.brandLogoUrl) ||
        str(input?.agentLogoUrl),
    };
    result.tour = await createMarketingTourFromAmenities({
      title,
      address: parcel.address || address,
      parcel,
      amenities,
      brand,
    });
  }

  try {
    await admin.firestore().collection("marketingGenerations").add({
      type: "listing_marketing_assets",
      address: result.address,
      parcelUuid: parcel.ll_uuid || null,
      gridCell,
      amenityCount: amenities.length,
      cacheHits,
      cache,
      fromCuratedCache: Boolean(fromCuratedCache),
      curateSource: curateSource || null,
      pngPath: result.neighborhoodMap?.pngPath || null,
      tourMapId: result.tour?.mapId || null,
      tourShareToken: result.tour?.shareToken || null,
      products,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  } catch (_) {
    /* non-fatal */
  }

  return result;
}

exports.generateListingMarketingAssets = functions
  .runWith({ timeoutSeconds: 180, memory: "1GB" })
  .https.onRequest(async (req, res) => {
    res.set("Access-Control-Allow-Origin", "*");
    res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.set("Access-Control-Allow-Headers", "Content-Type, X-Api-Key");
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
    if (!timingSafeEqualString(extractApiKey(req), expected)) {
      res.status(401).json({ error: "Invalid or missing API key" });
      return;
    }

    try {
      const body = req.body && typeof req.body === "object" ? req.body : {};
      const result = await runListingMarketingAssets(body);
      res.status(200).json(result);
    } catch (err) {
      const code = err?.code || "internal";
      console.error("generateListingMarketingAssets:", err?.message || err);
      res.status(httpStatusForCode(code)).json({
        error: err?.message || "Generation failed",
        code,
      });
    }
  });

exports.runListingMarketingAssets = runListingMarketingAssets;
