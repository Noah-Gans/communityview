const functions = require("firebase-functions");

const REGRID_API_V2 = "https://app.regrid.com/api/v2";
const REGRID_TILES = "https://tiles.regrid.com";

function getRegridToken() {
  return (
    (functions.config().regrid && functions.config().regrid.token) ||
    process.env.REGRID_API_TOKEN ||
    ""
  );
}

function requireRegridToken() {
  const token = getRegridToken();
  if (!token) {
    throw new functions.https.HttpsError(
      "failed-precondition",
      "Regrid API token is not configured. " +
        "Run: firebase functions:config:set regrid.token=\"YOUR_TOKEN\" " +
        "then redeploy functions."
    );
  }
  return token;
}

/** @param {string} route e.g. parcels/query, parcels/{uuid} */
function isAllowedRestGetRoute(route) {
  if (!route || typeof route !== "string") return false;
  const normalized = route.replace(/^\/+/, "");
  if (normalized === "parcels/point") return true;
  if (normalized === "parcels/query") return true;
  if (normalized === "parcels/typeahead") return true;
  const parcelMatch = normalized.match(/^parcels\/([^/?#]+)$/);
  if (parcelMatch) {
    const id = decodeURIComponent(parcelMatch[1]);
    if (id.length > 0 && id.length <= 128 && /^[\w.-]+$/.test(id)) return true;
  }
  return false;
}

/** Encode a single path segment for Regrid REST URLs. */
function encodeRegridRoutePath(route) {
  const parts = String(route || "").replace(/^\/+/, "").split("/");
  return parts
    .map((segment, index) => {
      if (index === 0) return segment;
      return encodeURIComponent(decodeURIComponent(segment));
    })
    .join("/");
}

/** Batch paths under /api/v2/us/batch or /api/v2/batch */
function isAllowedBatchPath(path) {
  if (!path || typeof path !== "string") return false;
  const p = path.startsWith("/") ? path : `/${path}`;
  if (p === "/points" || p === "/jobs") return true;
  if (/^\/[0-9a-f-]{36}$/i.test(p)) return true;
  if (/^\/[0-9a-f-]{36}\/download$/i.test(p)) return true;
  if (/^\/[0-9a-f-]{36}\/status$/i.test(p)) return true;
  if (/^\/status\/[0-9a-f-]{36}$/i.test(p)) return true;
  return false;
}

function stripTokenFromTileUrl(url) {
  if (!url || typeof url !== "string") return url;
  return url
    .replace(/([?&])token=[^&]*(&)?/gi, (_, sep, amp) => (amp ? sep : ""))
    .replace(/[?&]$/, "");
}

/**
 * Rewrite Regrid MVT template URLs to our HTTP tile proxy (no token in browser).
 * @param {object} tileJson
 * @param {string} proxyBase e.g. https://us-central1-PROJECT.cloudfunctions.net/regridTileProxy
 */
function sanitizeTileJsonForClient(tileJson, proxyBase) {
  if (!tileJson || typeof tileJson !== "object" || !proxyBase) return tileJson;
  const out = { ...tileJson };
  const rewrite = (url) => {
    if (typeof url !== "string" || url.indexOf("tiles.regrid.com") === -1) {
      return url;
    }
    const stripped = stripTokenFromTileUrl(url);
    const pathMatch = stripped.match(/https?:\/\/tiles\.regrid\.com(\/api\/v1\/[^?]+)/i);
    if (!pathMatch) return stripped;
    return `${proxyBase.replace(/\/$/, "")}${pathMatch[1]}`;
  };

  if (typeof out.vector === "string") out.vector = rewrite(out.vector);
  else if (Array.isArray(out.vector)) out.vector = out.vector.map(rewrite);
  if (Array.isArray(out.tiles)) out.tiles = out.tiles.map(rewrite);
  return out;
}

module.exports = {
  REGRID_API_V2,
  REGRID_TILES,
  getRegridToken,
  requireRegridToken,
  isAllowedRestGetRoute,
  isAllowedBatchPath,
  encodeRegridRoutePath,
  stripTokenFromTileUrl,
  sanitizeTileJsonForClient,
};
