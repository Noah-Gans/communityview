/**
 * Persist tour nearby POIs on maps/{mapId}.tourNearbyCache (Firestore).
 * Keep in sync with `src/utils/tourNearbyFirestore.js`.
 */

const NEARBY_FETCH_RADIUS_METERS = 25000;
const NEARBY_TOUR_DATA_VERSION = 28;
const SEARCH_CENTER_MATCH_EPSILON_DEG = 0.008;

/** Keep in sync with `src/utils/tourNearbyFirestore.js`. */
const TOUR_NEARBY_AMENITY_KEYS = [
  "parks_rec",
  "grocery",
  "schools",
  "fitness",
  "trailheads",
  "essentials",
  "coffee",
  "transit",
  "airport",
  "dining",
];

/** Amenity-map-only categories (not tour slides). Keep in sync with client. */
const AMENITY_MAP_EXTRA_KEYS = ["fire_station", "police_station", "library"];

/** All keys allowed in `tourNearbyCache.byAmenity`. */
const PERSISTED_NEARBY_AMENITY_KEYS = [
  ...TOUR_NEARBY_AMENITY_KEYS,
  ...AMENITY_MAP_EXTRA_KEYS,
];

function finiteCoord(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function tourNearbySearchCentersMatch(a, b) {
  const latA = finiteCoord(a && a.lat);
  const lngA = finiteCoord(a && a.lng);
  const latB = finiteCoord(b && b.lat);
  const lngB = finiteCoord(b && b.lng);
  if (latA == null || lngA == null || latB == null || lngB == null) return false;
  return (
    Math.abs(latA - latB) <= SEARCH_CENTER_MATCH_EPSILON_DEG &&
    Math.abs(lngA - lngB) <= SEARCH_CENTER_MATCH_EPSILON_DEG
  );
}

function isRootCacheValid(cache, searchCenter, expectedRadiusMeters) {
  if (!cache || typeof cache !== "object") return false;
  if (Number(cache.dataVersion) !== NEARBY_TOUR_DATA_VERSION) return false;
  const expectedRadius = Number(expectedRadiusMeters) || NEARBY_FETCH_RADIUS_METERS;
  if (Number(cache.searchRadiusMeters) !== expectedRadius) return false;
  if (!cache.searchCenter || !searchCenter) return false;
  if (!tourNearbySearchCentersMatch(cache.searchCenter, searchCenter)) return false;
  const byAmenity = cache.byAmenity;
  return Boolean(byAmenity && typeof byAmenity === "object");
}

function sanitizeFeature(feature) {
  if (!feature || feature.type !== "Feature") return null;
  const coords = feature.geometry && feature.geometry.coordinates;
  if (!Array.isArray(coords) || coords.length < 2) return null;
  const lng = Number(coords[0]);
  const lat = Number(coords[1]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  const raw = feature.properties && typeof feature.properties === "object" ? feature.properties : {};
  const name = String(raw.name || "").trim();
  if (!name) return null;

  const props = {
    name,
    amenityKey: String(raw.amenityKey || raw.kind || "").trim(),
    place_id: String(raw.place_id || raw.placeId || "").trim(),
    placeId: String(raw.placeId || raw.place_id || "").trim(),
  };
  if (typeof raw.rating === "number" && Number.isFinite(raw.rating)) props.rating = raw.rating;
  if (typeof raw.user_ratings_total === "number" && Number.isFinite(raw.user_ratings_total)) {
    props.user_ratings_total = raw.user_ratings_total;
  }
  if (raw.distanceText != null) props.distanceText = String(raw.distanceText);
  if (raw.driveMinutesEst != null) props.driveMinutesEst = String(raw.driveMinutesEst);
  if (typeof raw.straightLineMiles === "number" && Number.isFinite(raw.straightLineMiles)) {
    props.straightLineMiles = raw.straightLineMiles;
  }
  if (raw.photoUrl != null && String(raw.photoUrl).trim()) props.photoUrl = String(raw.photoUrl).trim();
  if (Array.isArray(raw.googleTypes) && raw.googleTypes.length) {
    props.googleTypes = raw.googleTypes.map((t) => String(t));
  }
  if (raw.tourHidden === true) props.tourHidden = true;
  if (raw.amenityMapHidden === true) props.amenityMapHidden = true;
  if (raw.isCustom === true) props.isCustom = true;

  return {
    type: "Feature",
    geometry: { type: "Point", coordinates: [lng, lat] },
    properties: props,
  };
}

function sanitizeAmenityCollection(fc) {
  const features = Array.isArray(fc && fc.features)
    ? fc.features.map(sanitizeFeature).filter(Boolean)
    : [];
  return { type: "FeatureCollection", features, fetched: true };
}

function sanitizeHomeMarker(raw) {
  if (!raw || typeof raw !== "object") return null;
  const lat = finiteCoord(raw.lat);
  const lng = finiteCoord(raw.lng);
  if (lat == null || lng == null) return null;
  return { lat, lng };
}

function sanitizeAmenityMapBasemap(raw) {
  const id = String(raw || "").trim();
  if (
    id === "outdoors-v12" ||
    id === "imagery" ||
    id === "satellite-streets-v12" ||
    id === "streets-v11"
  ) {
    return id;
  }
  const aliases = {
    discover: "outdoors-v12",
    outdoors: "outdoors-v12",
    satellite: "satellite-streets-v12",
    streets: "streets-v11",
    "imagery-3d": "imagery",
  };
  return aliases[id.toLowerCase()] || null;
}

/**
 * Amenity map presentation (basemap + home pin + guest-edit access).
 * Stored on maps/{id}.amenityMapSettings so tourNearbyCache merges cannot wipe editor choices.
 */
function normalizeAmenityMapSettings(raw, opts) {
  if (!raw || typeof raw !== "object") return null;
  const allowAccessFlags = !!(opts && opts.allowAccessFlags);
  const out = {};
  const basemap = sanitizeAmenityMapBasemap(raw.basemap || raw.amenityMapBasemap);
  if (basemap) out.basemap = basemap;
  const homeMarker = sanitizeHomeMarker(raw.homeMarker);
  if (homeMarker) out.homeMarker = homeMarker;
  if (allowAccessFlags) {
    if (raw.guestEdit === true) out.guestEdit = true;
    if (raw.guestEdit === false) out.guestEdit = false;
    if (raw.guestEditExpiresAt == null || raw.guestEditExpiresAt === "") {
      if (Object.prototype.hasOwnProperty.call(raw, "guestEditExpiresAt")) {
        out.guestEditExpiresAt = null;
      }
    } else {
      const t = Date.parse(String(raw.guestEditExpiresAt));
      if (Number.isFinite(t)) out.guestEditExpiresAt = new Date(t).toISOString();
    }
  } else if (raw.guestEdit === true) {
    out.guestEdit = true;
    const t = Date.parse(String(raw.guestEditExpiresAt || ""));
    if (Number.isFinite(t)) out.guestEditExpiresAt = new Date(t).toISOString();
  }
  return Object.keys(out).length ? out : null;
}

function isGuestEditAllowed(settings) {
  const s = normalizeAmenityMapSettings(settings, { allowAccessFlags: true });
  if (!s || s.guestEdit !== true) return false;
  if (s.guestEditExpiresAt) {
    const t = Date.parse(s.guestEditExpiresAt);
    if (Number.isFinite(t) && Date.now() > t) return false;
  }
  return true;
}

function buildAmenityEditAccess(mapData, authUid) {
  const viewerIsOwner = !!(authUid && mapData && mapData.userId === authUid);
  const guestEdit = isGuestEditAllowed(mapData && mapData.amenityMapSettings);
  return {
    guestEdit,
    viewerIsOwner,
    canEdit: viewerIsOwner || guestEdit,
  };
}

function mergeAmenityMapSettings(existingRaw, incomingRaw, opts) {
  const allowAccessFlags = !!(opts && opts.allowAccessFlags);
  const existing =
    normalizeAmenityMapSettings(existingRaw, { allowAccessFlags: true }) || {};
  const incoming =
    normalizeAmenityMapSettings(incomingRaw, { allowAccessFlags }) || {};
  const merged = {
    ...existing,
    ...incoming,
  };
  if (merged.guestEdit === false) {
    delete merged.guestEdit;
  }
  if (merged.guestEditExpiresAt === null) {
    delete merged.guestEditExpiresAt;
  }
  // Guests must never flip access flags — keep existing when not allowed.
  if (!allowAccessFlags) {
    if (existing.guestEdit === true) merged.guestEdit = true;
    else delete merged.guestEdit;
    if (existing.guestEditExpiresAt) {
      merged.guestEditExpiresAt = existing.guestEditExpiresAt;
    } else {
      delete merged.guestEditExpiresAt;
    }
  }
  return Object.keys(merged).length ? merged : null;
}

function normalizeTourNearbyCache(raw) {
  if (!raw || typeof raw !== "object") return null;
  const lat = finiteCoord(raw.searchCenter && raw.searchCenter.lat);
  const lng = finiteCoord(raw.searchCenter && raw.searchCenter.lng);
  if (lat == null || lng == null) return null;

  const byAmenity = {};
  const src = raw.byAmenity && typeof raw.byAmenity === "object" ? raw.byAmenity : {};
  for (const key of PERSISTED_NEARBY_AMENITY_KEYS) {
    if (!src[key]) continue;
    byAmenity[key] = sanitizeAmenityCollection(src[key]);
  }

  const out = {
    dataVersion: Number(raw.dataVersion) || NEARBY_TOUR_DATA_VERSION,
    searchRadiusMeters: Number(raw.searchRadiusMeters) || NEARBY_FETCH_RADIUS_METERS,
    searchCenter: { lat, lng },
    byAmenity,
    tourSettings:
      raw.tourSettings && typeof raw.tourSettings === "object"
        ? normalizeTourSettings(raw.tourSettings)
        : null,
  };
  const homeMarker = sanitizeHomeMarker(raw.homeMarker);
  if (homeMarker) out.homeMarker = homeMarker;
  const amenityMapBasemap = sanitizeAmenityMapBasemap(raw.amenityMapBasemap);
  if (amenityMapBasemap) out.amenityMapBasemap = amenityMapBasemap;
  return out;
}

function readAmenityFromTourCache(mapData, amenityKey, searchCenter, expectedRadiusMeters) {
  const cache = normalizeTourNearbyCache(mapData && mapData.tourNearbyCache);
  const expectedRadius =
    Number(expectedRadiusMeters) ||
    Number(cache && cache.searchRadiusMeters) ||
    NEARBY_FETCH_RADIUS_METERS;
  if (!cache || !isRootCacheValid(cache, searchCenter, expectedRadius)) return null;
  const entry = cache.byAmenity && cache.byAmenity[amenityKey];
  if (!entry || entry.fetched !== true) return null;
  return {
    type: "FeatureCollection",
    features: Array.isArray(entry.features) ? entry.features : [],
    nearbyDataVersion: cache.dataVersion,
    fromTourNearbyCache: true,
  };
}

function mergeTourNearbyCachePayload(existingRaw, incomingRaw) {
  const replace = Boolean(incomingRaw && incomingRaw.replace === true);
  const existing = normalizeTourNearbyCache(existingRaw) || {
    dataVersion: NEARBY_TOUR_DATA_VERSION,
    searchRadiusMeters: NEARBY_FETCH_RADIUS_METERS,
    searchCenter: null,
    byAmenity: {},
  };
  const incoming = normalizeTourNearbyCache(incomingRaw);
  if (!incoming) return null;

  if (replace) {
    const merged = {
      dataVersion: NEARBY_TOUR_DATA_VERSION,
      searchRadiusMeters:
        Number(incoming.searchRadiusMeters) ||
        Number(existing.searchRadiusMeters) ||
        NEARBY_FETCH_RADIUS_METERS,
      searchCenter: incoming.searchCenter || existing.searchCenter,
      byAmenity: { ...incoming.byAmenity },
      tourSettings: null,
    };
    if (incomingRaw.tourSettings && typeof incomingRaw.tourSettings === "object") {
      merged.tourSettings = normalizeTourSettings(incomingRaw.tourSettings);
    } else if (existingRaw && existingRaw.tourSettings && typeof existingRaw.tourSettings === "object") {
      merged.tourSettings = normalizeTourSettings(existingRaw.tourSettings);
    }
    const homeMarker =
      sanitizeHomeMarker(incomingRaw && incomingRaw.homeMarker) ||
      sanitizeHomeMarker(incoming.homeMarker) ||
      sanitizeHomeMarker(existingRaw && existingRaw.homeMarker) ||
      sanitizeHomeMarker(existing.homeMarker);
    if (homeMarker) merged.homeMarker = homeMarker;
    const amenityMapBasemap =
      sanitizeAmenityMapBasemap(incomingRaw && incomingRaw.amenityMapBasemap) ||
      sanitizeAmenityMapBasemap(incoming.amenityMapBasemap) ||
      sanitizeAmenityMapBasemap(existingRaw && existingRaw.amenityMapBasemap) ||
      sanitizeAmenityMapBasemap(existing.amenityMapBasemap);
    if (amenityMapBasemap) merged.amenityMapBasemap = amenityMapBasemap;
    return merged;
  }

  const merged = {
    dataVersion: NEARBY_TOUR_DATA_VERSION,
    searchRadiusMeters:
      Number(incoming.searchRadiusMeters) ||
      Number(existing.searchRadiusMeters) ||
      NEARBY_FETCH_RADIUS_METERS,
    searchCenter: incoming.searchCenter || existing.searchCenter,
    byAmenity: { ...existing.byAmenity },
    tourSettings:
      incomingRaw.tourSettings && typeof incomingRaw.tourSettings === "object"
        ? normalizeTourSettings(incomingRaw.tourSettings)
        : existingRaw && existingRaw.tourSettings && typeof existingRaw.tourSettings === "object"
          ? normalizeTourSettings(existingRaw.tourSettings)
          : null,
  };

  for (const key of PERSISTED_NEARBY_AMENITY_KEYS) {
    if (incoming.byAmenity[key]) {
      merged.byAmenity[key] = incoming.byAmenity[key];
    }
  }

  const homeMarker =
    sanitizeHomeMarker(incomingRaw && incomingRaw.homeMarker) ||
    sanitizeHomeMarker(incoming.homeMarker) ||
    sanitizeHomeMarker(existingRaw && existingRaw.homeMarker) ||
    sanitizeHomeMarker(existing.homeMarker);
  if (homeMarker) merged.homeMarker = homeMarker;
  const amenityMapBasemap =
    sanitizeAmenityMapBasemap(incomingRaw && incomingRaw.amenityMapBasemap) ||
    sanitizeAmenityMapBasemap(incoming.amenityMapBasemap) ||
    sanitizeAmenityMapBasemap(existingRaw && existingRaw.amenityMapBasemap) ||
    sanitizeAmenityMapBasemap(existing.amenityMapBasemap);
  if (amenityMapBasemap) merged.amenityMapBasemap = amenityMapBasemap;

  return merged;
}

function clampTourSearchRadiusMeters(value) {
  return Math.min(50000, Math.max(500, Number(value) || NEARBY_FETCH_RADIUS_METERS));
}

function pickSlidePrintElements(...sources) {
  let best = null;
  let bestKeyCount = -1;
  for (const src of sources) {
    if (!src || typeof src !== "object") continue;
    const norm = {};
    for (const [slideId, ids] of Object.entries(src)) {
      const key = String(slideId || "").trim();
      if (!key || !Array.isArray(ids)) continue;
      norm[key] = ids.map((id) => String(id || "").trim()).filter(Boolean);
    }
    const keyCount = Object.keys(norm).length;
    if (keyCount > bestKeyCount) {
      best = norm;
      bestKeyCount = keyCount;
    }
  }
  return bestKeyCount >= 0 ? best : null;
}

/** Keep in sync with `src/utils/tourSettings.js`. */
function normalizeTourSettings(raw) {
  const src = raw && typeof raw === "object" ? raw : {};
  const enabledRaw = Array.isArray(src.enabledAmenityKeys)
    ? src.enabledAmenityKeys
    : TOUR_NEARBY_AMENITY_KEYS;
  const enabledAmenityKeys = [];
  for (const rawKey of enabledRaw) {
    const key = String(rawKey || "").trim();
    if (TOUR_NEARBY_AMENITY_KEYS.includes(key) && !enabledAmenityKeys.includes(key)) {
      enabledAmenityKeys.push(key);
    }
  }
  const slidePlan = Array.isArray(src.slidePlan)
    ? src.slidePlan.map((s) => String(s || "").trim()).filter(Boolean)
    : null;
  const planKeys = [];
  if (slidePlan && slidePlan.length) {
    for (const id of slidePlan) {
      if (!String(id).startsWith("amenity:")) continue;
      const key = String(id).slice(8).trim();
      if (TOUR_NEARBY_AMENITY_KEYS.includes(key) && !planKeys.includes(key)) {
        planKeys.push(key);
      }
    }
  }
  const resolvedAmenityKeys = planKeys.length
    ? planKeys
    : enabledAmenityKeys.length
      ? enabledAmenityKeys
      : [...TOUR_NEARBY_AMENITY_KEYS];
  return {
    searchRadiusMeters: clampTourSearchRadiusMeters(src.searchRadiusMeters),
    enabledAmenityKeys: resolvedAmenityKeys,
    slidePlan: slidePlan && slidePlan.length ? slidePlan : null,
    amenityRadiusMeters:
      src.amenityRadiusMeters && typeof src.amenityRadiusMeters === "object"
        ? src.amenityRadiusMeters
        : null,
    slidePrintElements:
      src.slidePrintElements && typeof src.slidePrintElements === "object"
        ? src.slidePrintElements
        : null,
  };
}

function resolveTourSettingsFromMapData(mapData) {
  const rawCache = mapData && mapData.tourNearbyCache;
  const fromDoc = mapData && mapData.tourSettings;
  const fromCacheEmbedded = rawCache && rawCache.tourSettings;

  const radius =
    (fromCacheEmbedded && fromCacheEmbedded.searchRadiusMeters != null
      ? fromCacheEmbedded.searchRadiusMeters
      : null) ??
    (rawCache && rawCache.searchRadiusMeters != null ? rawCache.searchRadiusMeters : null) ??
    (fromDoc && fromDoc.searchRadiusMeters != null ? fromDoc.searchRadiusMeters : null);

  const tourSlidePlanRoot =
    mapData && Array.isArray(mapData.tourSlidePlan)
      ? mapData.tourSlidePlan.map((s) => String(s || "").trim()).filter(Boolean)
      : null;

  const slidePlanFromCache =
    fromCacheEmbedded && Array.isArray(fromCacheEmbedded.slidePlan)
      ? fromCacheEmbedded.slidePlan
      : null;
  const slidePlanFromDoc =
    fromDoc && Array.isArray(fromDoc.slidePlan) ? fromDoc.slidePlan : null;
  const slidePlan =
    tourSlidePlanRoot && tourSlidePlanRoot.length
      ? tourSlidePlanRoot
      : slidePlanFromDoc && slidePlanFromDoc.length
        ? slidePlanFromDoc
        : slidePlanFromCache;

  if (slidePlan && slidePlan.length) {
    const enabledFromDoc =
      fromDoc && Array.isArray(fromDoc.enabledAmenityKeys) ? fromDoc.enabledAmenityKeys : null;
    const enabledFromCache =
      fromCacheEmbedded && Array.isArray(fromCacheEmbedded.enabledAmenityKeys)
        ? fromCacheEmbedded.enabledAmenityKeys
        : null;
    return normalizeTourSettings({
      slidePlan,
      searchRadiusMeters: radius,
      enabledAmenityKeys: enabledFromDoc?.length ? enabledFromDoc : enabledFromCache,
      amenityRadiusMeters:
        (fromDoc && fromDoc.amenityRadiusMeters) ||
        (fromCacheEmbedded && fromCacheEmbedded.amenityRadiusMeters) ||
        null,
      slidePrintElements: pickSlidePrintElements(
        fromDoc && fromDoc.slidePrintElements,
        fromCacheEmbedded && fromCacheEmbedded.slidePrintElements
      ),
    });
  }

  const enabledFromCache =
    fromCacheEmbedded && Array.isArray(fromCacheEmbedded.enabledAmenityKeys)
      ? fromCacheEmbedded.enabledAmenityKeys
      : null;
  const enabledFromDoc =
    fromDoc && Array.isArray(fromDoc.enabledAmenityKeys) ? fromDoc.enabledAmenityKeys : null;
  const enabledAmenityKeys = enabledFromCache && enabledFromCache.length
    ? enabledFromCache
    : enabledFromDoc && enabledFromDoc.length
      ? enabledFromDoc
      : null;

  if (enabledAmenityKeys && enabledAmenityKeys.length) {
    return normalizeTourSettings({
      enabledAmenityKeys,
      searchRadiusMeters: radius,
      slidePlan,
      amenityRadiusMeters:
        (fromDoc && fromDoc.amenityRadiusMeters) ||
        (fromCacheEmbedded && fromCacheEmbedded.amenityRadiusMeters) ||
        null,
      slidePrintElements: pickSlidePrintElements(
        fromDoc && fromDoc.slidePrintElements,
        fromCacheEmbedded && fromCacheEmbedded.slidePrintElements
      ),
    });
  }

  const root = normalizeTourNearbyCache(rawCache);
  if (root) {
    const embeddedKeys = root.tourSettings && root.tourSettings.enabledAmenityKeys;
    if (Array.isArray(embeddedKeys) && embeddedKeys.length) {
      return normalizeTourSettings({
        enabledAmenityKeys: embeddedKeys,
        searchRadiusMeters: root.searchRadiusMeters,
        slidePlan: root.tourSettings && root.tourSettings.slidePlan,
        amenityRadiusMeters: root.tourSettings && root.tourSettings.amenityRadiusMeters,
        slidePrintElements: pickSlidePrintElements(
          fromDoc && fromDoc.slidePrintElements,
          fromCacheEmbedded && fromCacheEmbedded.slidePrintElements,
          root.tourSettings && root.tourSettings.slidePrintElements
        ),
      });
    }
    const keys = TOUR_NEARBY_AMENITY_KEYS.filter((k) => {
      const features = root.byAmenity[k] && root.byAmenity[k].features;
      return Array.isArray(features) && features.length > 0;
    });
    if (keys.length) {
      return normalizeTourSettings({
        enabledAmenityKeys: keys,
        searchRadiusMeters: root.searchRadiusMeters,
        slidePrintElements: pickSlidePrintElements(
          fromDoc && fromDoc.slidePrintElements,
          fromCacheEmbedded && fromCacheEmbedded.slidePrintElements,
          root.tourSettings && root.tourSettings.slidePrintElements
        ),
      });
    }
  }

  if (fromDoc && typeof fromDoc === "object" && Object.keys(fromDoc).length) {
    return normalizeTourSettings(fromDoc);
  }

  return null;
}

function mapHasCuratedTourData(mapData) {
  if (!mapData) return false;
  if (Array.isArray(mapData.tourSlidePlan) && mapData.tourSlidePlan.length) {
    return true;
  }
  if (Array.isArray(mapData.tourSettings && mapData.tourSettings.slidePlan) && mapData.tourSettings.slidePlan.length) {
    return true;
  }
  const rawCache = mapData.tourNearbyCache;
  const root = normalizeTourNearbyCache(rawCache);
  if (!root) return false;
  if (Array.isArray(root.tourSettings && root.tourSettings.slidePlan) && root.tourSettings.slidePlan.length) {
    return true;
  }
  for (const fc of Object.values(root.byAmenity || {})) {
    if ((fc.features || []).some((f) => f.properties && f.properties.tourHidden === true)) return true;
  }
  return false;
}

function buildSingleAmenityCachePayload(searchCenter, amenityKey, featureCollection, searchRadiusMeters) {
  const lat = finiteCoord(searchCenter && searchCenter.lat);
  const lng = finiteCoord(searchCenter && searchCenter.lng);
  if (lat == null || lng == null || !amenityKey) return null;

  const radius = Math.min(
    50000,
    Math.max(500, Number(searchRadiusMeters) || NEARBY_FETCH_RADIUS_METERS)
  );

  return {
    dataVersion: NEARBY_TOUR_DATA_VERSION,
    searchRadiusMeters: radius,
    searchCenter: { lat, lng },
    byAmenity: {
      [amenityKey]: sanitizeAmenityCollection(featureCollection),
    },
  };
}

module.exports = {
  NEARBY_TOUR_DATA_VERSION,
  TOUR_NEARBY_AMENITY_KEYS,
  AMENITY_MAP_EXTRA_KEYS,
  PERSISTED_NEARBY_AMENITY_KEYS,
  isRootCacheValid,
  tourNearbySearchCentersMatch,
  normalizeTourNearbyCache,
  normalizeTourSettings,
  resolveTourSettingsFromMapData,
  mapHasCuratedTourData,
  readAmenityFromTourCache,
  mergeTourNearbyCachePayload,
  buildSingleAmenityCachePayload,
  sanitizeAmenityCollection,
  normalizeAmenityMapSettings,
  mergeAmenityMapSettings,
  isGuestEditAllowed,
  buildAmenityEditAccess,
};
