/**
 * Resolve a listing address to a Regrid parcel (geometry + centroid when possible).
 * Falls back to Places text-search geocode if Regrid misses.
 */
const functions = require("firebase-functions");
const { REGRID_API_V2, getRegridToken } = require("./regridShared");

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

function parseFeatures(data) {
  if (!data) return [];
  if (Array.isArray(data.parcels)) return data.parcels;
  if (Array.isArray(data.parcels?.features)) return data.parcels.features;
  if (Array.isArray(data.features)) return data.features;
  if (Array.isArray(data)) return data;
  return [];
}

function centroidFromGeometry(geometry) {
  if (!geometry) return null;
  let ring = null;
  if (geometry.type === "Point") {
    const [lng, lat] = geometry.coordinates || [];
    if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng };
    return null;
  }
  if (geometry.type === "Polygon") ring = geometry.coordinates?.[0];
  else if (geometry.type === "MultiPolygon") ring = geometry.coordinates?.[0]?.[0];
  if (!Array.isArray(ring) || ring.length < 3) return null;
  let sx = 0;
  let sy = 0;
  let n = 0;
  for (const c of ring) {
    if (!Array.isArray(c) || c.length < 2) continue;
    const lng = Number(c[0]);
    const lat = Number(c[1]);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    sx += lng;
    sy += lat;
    n += 1;
  }
  if (!n) return null;
  return { lng: sx / n, lat: sy / n };
}

function mapFeature(feature) {
  if (!feature) return null;
  const props = feature.properties || {};
  const fields = props.fields || {};
  const context = props.context || {};
  const addresses = Array.isArray(props.addresses) ? props.addresses : [];
  const firstAddress = addresses[0] || {};
  const latRaw = fields.lat ?? props.lat;
  const lonRaw = fields.lon ?? props.lon;
  let lat = Number(latRaw);
  let lng = Number(lonRaw);
  const geometry = feature.geometry || null;
  const centroid = centroidFromGeometry(geometry);
  if ((!Number.isFinite(lat) || !Number.isFinite(lng)) && centroid) {
    lat = centroid.lat;
    lng = centroid.lng;
  }
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  const address =
    str(props.address) ||
    str(fields.address) ||
    str(firstAddress.address) ||
    str(props.headline);

  return {
    ll_uuid: str(props.ll_uuid || props.global_parcel_uid),
    apn: str(props.parcelnumb || fields.parcelnumb),
    address,
    owner: str(props.owner || fields.owner),
    path: str(props.path || context.path || fields.path),
    lat,
    lng,
    geometry,
    source: "regrid",
  };
}

async function regridGet(route, query) {
  const token = getRegridToken();
  if (!token) {
    const err = new Error("Regrid token not configured (regrid.token).");
    err.code = "failed-precondition";
    throw err;
  }
  const params = new URLSearchParams();
  Object.entries(query || {}).forEach(([k, v]) => {
    if (v === undefined || v === null || v === "") return;
    params.set(k, String(v));
  });
  params.set("token", token);
  const url = `${REGRID_API_V2}/${route}?${params.toString()}`;
  const res = await fetch(url, {
    method: "GET",
    headers: { Accept: "application/json" },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    const err = new Error(`Regrid ${route} failed (${res.status}): ${body.slice(0, 160)}`);
    err.code = "internal";
    throw err;
  }
  return res.json();
}

async function fetchParcelGeometry(llUuid) {
  if (!llUuid) return null;
  try {
    const data = await regridGet(`parcels/${encodeURIComponent(llUuid)}`, {
      return_geometry: "true",
      return_custom: "false",
      return_zoning: "false",
      return_matched_buildings: "false",
      return_matched_addresses: "false",
      return_enhanced_ownership: "false",
      return_stacked: "true",
    });
    const features = parseFeatures(data);
    return features[0]?.geometry || null;
  } catch (_) {
    return null;
  }
}

async function geocodeWithPlaces(address) {
  const apiKey = getGoogleKey();
  if (!apiKey) return null;
  const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask":
        "places.formattedAddress,places.location,places.displayName",
    },
    body: JSON.stringify({ textQuery: address, maxResultCount: 1 }),
  });
  if (!res.ok) return null;
  const json = await res.json();
  const place = Array.isArray(json?.places) ? json.places[0] : null;
  const lat = Number(place?.location?.latitude);
  const lng = Number(place?.location?.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return {
    lat,
    lng,
    address: str(place.formattedAddress) || address,
  };
}

/**
 * @param {string} address
 * @param {{ countyPath?: string, lat?: number, lng?: number }} [opts]
 */
async function resolveListingParcel(address, opts = {}) {
  const query = str(address);
  const optLat = Number(opts.lat);
  const optLng = Number(opts.lng);
  const hasCoords = Number.isFinite(optLat) && Number.isFinite(optLng);

  if (!query && !hasCoords) {
    const err = new Error("address is required");
    err.code = "invalid-argument";
    throw err;
  }

  const countyPath = str(opts.countyPath);

  // Preferred: caller-supplied coordinates (avoid ambiguous street matches).
  if (hasCoords) {
    try {
      const pointQuery = {
        lat: String(optLat),
        lon: String(optLng),
        limit: "1",
        return_geometry: "true",
        return_custom: "false",
        return_zoning: "false",
        return_matched_buildings: "false",
        return_matched_addresses: "false",
        return_enhanced_ownership: "false",
      };
      if (countyPath) pointQuery.path = countyPath;
      const data = await regridGet("parcels/point", pointQuery);
      const hit = mapFeature(parseFeatures(data)[0]);
      if (hit) {
        if (!hit.address) hit.address = query || `${optLat},${optLng}`;
        hit.source = hit.source || "regrid_point";
        return hit;
      }
    } catch (_) {
      /* fall through to coordinate-only parcel */
    }
    return {
      ll_uuid: "",
      apn: "",
      address: query || `${optLat},${optLng}`,
      owner: "",
      path: "",
      lat: optLat,
      lng: optLng,
      geometry: null,
      source: "coords",
    };
  }

  let parcel = null;

  try {
    const addressQuery = {
      query,
      limit: "1",
      return_geometry: "true",
      return_custom: "false",
      return_zoning: "false",
      return_matched_buildings: "false",
      return_matched_addresses: "false",
      return_enhanced_ownership: "false",
    };
    if (countyPath) addressQuery.path = countyPath;
    const data = await regridGet("parcels/address", addressQuery);
    parcel = mapFeature(parseFeatures(data)[0]);
  } catch (_) {
    parcel = null;
  }

  if (!parcel) {
    try {
      const q = {
        "fields[address][ilike]": query,
        limit: "1",
        return_geometry: "true",
        return_custom: "false",
        return_zoning: "false",
        return_matched_buildings: "false",
        return_matched_addresses: "false",
        return_enhanced_ownership: "false",
      };
      if (countyPath) q.path = countyPath;
      const data = await regridGet("parcels/query", q);
      parcel = mapFeature(parseFeatures(data)[0]);
    } catch (_) {
      parcel = null;
    }
  }

  if (parcel?.ll_uuid && !parcel.geometry) {
    parcel.geometry = await fetchParcelGeometry(parcel.ll_uuid);
    const c = centroidFromGeometry(parcel.geometry);
    if (c) {
      parcel.lat = c.lat;
      parcel.lng = c.lng;
    }
  }

  if (parcel) return parcel;

  // Fallback: geocode, then optional point parcel lookup
  const geo = await geocodeWithPlaces(query);
  if (!geo) {
    const err = new Error(`Could not resolve parcel/location for: ${query}`);
    err.code = "not-found";
    throw err;
  }

  try {
    const pointQuery = {
      lat: String(geo.lat),
      lon: String(geo.lng),
      limit: "1",
      return_geometry: "true",
      return_custom: "false",
      return_zoning: "false",
      return_matched_buildings: "false",
      return_matched_addresses: "false",
      return_enhanced_ownership: "false",
    };
    if (countyPath) pointQuery.path = countyPath;
    const data = await regridGet("parcels/point", pointQuery);
    const hit = mapFeature(parseFeatures(data)[0]);
    if (hit) {
      if (!hit.address) hit.address = geo.address;
      return hit;
    }
  } catch (_) {
    /* fall through */
  }

  return {
    ll_uuid: "",
    apn: "",
    address: geo.address,
    owner: "",
    path: "",
    lat: geo.lat,
    lng: geo.lng,
    geometry: null,
    source: "geocode",
  };
}

module.exports = {
  resolveListingParcel,
  centroidFromGeometry,
};
