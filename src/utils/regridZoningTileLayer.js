import { rewriteRegridTileUrlToProxy } from '../config/regridApi';
import { fetchRegridZoningTileJson } from '../services/regridService';

/** Standardized zoning MVT overlay (Regrid tile layer). */
export const REGRID_ZONING_TILE_FILL_COLOR = '#a855f7';

const ZONING_TILEJSON_CACHE_KEY = 'cv_regrid_zoning_tilejson_v1';

let cachedRegridZoningTileJson = null;
let ensureZoningTileJsonPromise = null;

function readZoningTileJsonFromStorage() {
  try {
    const raw = window.localStorage?.getItem(ZONING_TILEJSON_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

function writeZoningTileJsonToStorage(tileJson) {
  try {
    if (!tileJson) return;
    window.localStorage?.setItem(
      ZONING_TILEJSON_CACHE_KEY,
      JSON.stringify({
        id: tileJson.id,
        maxzoom: tileJson.maxzoom,
        vector: tileJson.vector,
        tiles: tileJson.tiles,
        vector_layers: tileJson.vector_layers,
      })
    );
  } catch {
    /* quota / private mode */
  }
}

/**
 * Create (once) or load cached TileJSON for Regrid Standardized Zoning MVT layer.
 * @see https://support.regrid.com/docs/standardized-zoning-on-tiles
 */
export async function ensureRegridZoningTileJson() {
  if (cachedRegridZoningTileJson) return cachedRegridZoningTileJson;

  const stored = readZoningTileJsonFromStorage();
  if (stored?.vector || stored?.tiles) {
    cachedRegridZoningTileJson = stored;
    return stored;
  }

  if (ensureZoningTileJsonPromise) return ensureZoningTileJsonPromise;

  ensureZoningTileJsonPromise = (async () => {
    const tileJson = await fetchRegridZoningTileJson();
    cachedRegridZoningTileJson = tileJson;
    writeZoningTileJsonToStorage(tileJson);
    return tileJson;
  })();

  try {
    return await ensureZoningTileJsonPromise;
  } finally {
    ensureZoningTileJsonPromise = null;
  }
}

export function getCachedRegridZoningTileJson() {
  return cachedRegridZoningTileJson || readZoningTileJsonFromStorage();
}

export function getRegridZoningTileUrls(tileJson) {
  if (!tileJson) return [];
  let raw = [];
  const v = tileJson.vector;
  if (typeof v === 'string' && v.length) raw = [v];
  else if (Array.isArray(v) && v.length) raw = v;
  else if (Array.isArray(tileJson.tiles) && tileJson.tiles.length) {
    raw = tileJson.tiles.filter((u) => typeof u === 'string' && /\.mvt/i.test(u));
  }
  return raw.map((u) => rewriteRegridTileUrlToProxy(u));
}

export function getRegridZoningSourceLayerId(tileJson) {
  if (!tileJson) return 'zoning';
  if (typeof tileJson.id === 'string' && tileJson.id.length) return tileJson.id;
  const vl = tileJson.vector_layers;
  if (Array.isArray(vl) && vl[0] && typeof vl[0].id === 'string' && vl[0].id.length) {
    return vl[0].id;
  }
  return 'zoning';
}
