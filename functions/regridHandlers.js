const functions = require("firebase-functions");
const {
  REGRID_API_V2,
  REGRID_TILES,
  requireRegridToken,
  isAllowedRestGetRoute,
  isAllowedBatchPath,
  encodeRegridRoutePath,
  sanitizeTileJsonForClient,
} = require("./regridShared");

const BATCH_BASES = [
  `${REGRID_API_V2}/us/batch`,
  `${REGRID_API_V2}/batch`,
];

function getTileProxyBaseUrl() {
  const projectId =
    process.env.GCLOUD_PROJECT ||
    process.env.GCP_PROJECT ||
    (process.env.FIREBASE_CONFIG && JSON.parse(process.env.FIREBASE_CONFIG).projectId);
  const region = process.env.FUNCTION_REGION || "us-central1";
  if (!projectId) return null;
  return `https://${region}-${projectId}.cloudfunctions.net/regridTileProxy`;
}

function queryParamsFromObject(obj) {
  const params = new URLSearchParams();
  if (!obj || typeof obj !== "object") return params;
  Object.entries(obj).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") return;
    params.set(key, String(value));
  });
  return params;
}

async function readRegridError(response) {
  try {
    const text = await response.text();
    return text.length > 400 ? `${text.slice(0, 400)}...` : text;
  } catch (_) {
    return response.statusText || "Unknown error";
  }
}

exports.regridApi = functions.https.onCall(async (data, context) => {
  const token = requireRegridToken();
  const operation = data && data.operation ? String(data.operation) : "";

  const requiresAuth =
    operation === "batch" ||
    operation === "parcelTileJson" ||
    operation === "zoningTileJson";
  if (requiresAuth && !context.auth) {
    throw new functions.https.HttpsError(
      "unauthenticated",
      "Sign in required for this Regrid operation."
    );
  }

  if (operation === "restGet") {
    const route = String(data.route || "").replace(/^\/+/, "");
    if (!isAllowedRestGetRoute(route)) {
      throw new functions.https.HttpsError("invalid-argument", "Regrid route not allowed.");
    }
    const params = queryParamsFromObject(data.queryParams);
    params.set("token", token);
    const safeRoute = encodeRegridRoutePath(route);
    const url = `${REGRID_API_V2}/${safeRoute}?${params.toString()}`;
    const response = await fetch(url, {
      method: "GET",
      headers: { Accept: "application/json" },
    });
    if (!response.ok) {
      const details = await readRegridError(response);
      throw new functions.https.HttpsError(
        "internal",
        `Regrid API error (${response.status}): ${details}`
      );
    }
    return response.json();
  }

  if (operation === "parcelTileJson") {
    const url = `${REGRID_TILES}/api/v1/parcels?format=mvt&token=${encodeURIComponent(token)}`;
    const response = await fetch(url);
    if (!response.ok) {
      const details = await readRegridError(response);
      throw new functions.https.HttpsError(
        "internal",
        `Regrid parcel TileJSON failed (${response.status}): ${details}`
      );
    }
    const tileJson = await response.json();
    const proxyBase = getTileProxyBaseUrl();
    return sanitizeTileJsonForClient(tileJson, proxyBase);
  }

  if (operation === "zoningTileJson") {
    const url = `${REGRID_TILES}/api/v1/sources?format=mvt&token=${encodeURIComponent(token)}`;
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query: { zoning: true },
        fields: {
          zoning: ["zoning", "zoning_type", "zoning_subtype"],
        },
      }),
    });
    if (!response.ok) {
      const details = await readRegridError(response);
      throw new functions.https.HttpsError(
        "internal",
        `Regrid zoning TileJSON failed (${response.status}): ${details}`
      );
    }
    const tileJson = await response.json();
    const proxyBase = getTileProxyBaseUrl();
    return sanitizeTileJsonForClient(tileJson, proxyBase);
  }

  if (operation === "batch") {
    const method = String(data.method || "GET").toUpperCase();
    const path = data.path ? String(data.path) : "";
    if (!isAllowedBatchPath(path)) {
      throw new functions.https.HttpsError("invalid-argument", "Regrid batch path not allowed.");
    }
    const params = queryParamsFromObject(data.queryParams);
    params.set("token", token);
    const query = `?${params.toString()}`;
    const body = data.body != null ? JSON.stringify(data.body) : undefined;
    const headers = { Accept: "application/json" };
    if (body) headers["Content-Type"] = "application/json";

    let lastError = null;
    for (const base of BATCH_BASES) {
      const url = `${base}${path.startsWith("/") ? path : `/${path}`}${query}`;
      const response = await fetch(url, { method, headers, body });
      if (response.ok) {
        const contentType = response.headers.get("content-type") || "";
        if (contentType.includes("application/json")) {
          return { ok: true, json: await response.json() };
        }
        return { ok: true, text: await response.text() };
      }
      if (response.status === 401 || response.status === 404) {
        lastError = await readRegridError(response);
        continue;
      }
      const details = await readRegridError(response);
      throw new functions.https.HttpsError(
        "internal",
        `Regrid batch error (${response.status}): ${details}`
      );
    }
    throw new functions.https.HttpsError(
      "internal",
      lastError || "Regrid batch request failed on all endpoints."
    );
  }

  throw new functions.https.HttpsError("invalid-argument", "Unknown Regrid operation.");
});
