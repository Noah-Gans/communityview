import { PERSISTENT_BASE_STYLE_ID } from './mapConstants';

export const SATELLITE_STREETS_OVERLAY_SOURCE_ID = 'satellite-streets-overlay-source';
export const SATELLITE_STREETS_OVERLAY_LAYER_ID = 'satellite-streets-overlay-layer';
export const STREETS_OVERLAY_SOURCE_ID = 'streets-overlay-source';
export const STREETS_OVERLAY_LAYER_ID = 'streets-overlay-layer';
export const ESRI_WORLD_IMAGERY_LAYER_ID = 'esri-world-imagery-layer';

/** Basemap rasters that must sit below hosted data + parcel layers. */
export const MANAGED_BASEMAP_RASTER_LAYER_IDS = [
  ESRI_WORLD_IMAGERY_LAYER_ID,
  SATELLITE_STREETS_OVERLAY_LAYER_ID,
  STREETS_OVERLAY_LAYER_ID,
];

export function hasVisibleManagedBasemapRaster(map) {
  if (!map?.getLayer) return false;
  return MANAGED_BASEMAP_RASTER_LAYER_IDS.some((id) => {
    if (!map.getLayer(id)) return false;
    try {
      return map.getLayoutProperty(id, 'visibility') !== 'none';
    } catch (_) {
      return false;
    }
  });
}

export function isRasterLayerVisible(map, layerId) {
  if (!map?.getLayer?.(layerId)) return false;
  try {
    return map.getLayoutProperty(layerId, 'visibility') !== 'none';
  } catch (_) {
    return false;
  }
}

/** Outdoors landcover/hillshade still visible on top of Esri imagery when apply failed. */
export function hasVisibleMapboxStyleUnderlay(map) {
  if (!map?.getStyle) return false;
  try {
    return (map.getStyle().layers || []).some((layer) => {
      const id = layer?.id || '';
      if (!id || id === 'background' || layer.type === 'symbol') return false;
      if (MANAGED_BASEMAP_RASTER_LAYER_IDS.includes(id)) return false;
      if (
        id === ESRI_WORLD_IMAGERY_LAYER_ID ||
        id === SATELLITE_STREETS_OVERLAY_LAYER_ID ||
        id === STREETS_OVERLAY_LAYER_ID
      ) {
        return false;
      }
      if (id.startsWith('gl-draw-') || id.includes('regrid') || id.endsWith('-layer')) return false;
      if (id.startsWith('tour-vicinity-') || id.startsWith('tour-builder-')) return false;
      if (id.startsWith('cv-') || id.includes('contour') || id === 'terrain-colors' || id === 'sky') {
        return false;
      }
      return map.getLayoutProperty(layer.id, 'visibility') !== 'none';
    });
  } catch (_) {
    return false;
  }
}

/** True when the live map stack matches the requested basemap (not just React/URL state). */
export function verifyBasemapAppliedOnMap(map, basemapId) {
  // Style *document* present is enough — isStyleLoaded() goes false while tiles download.
  if (!map?.getStyle?.()?.layers) return false;
  const id = String(basemapId || '').trim();
  if (!id) return false;

  if (id === 'imagery' || id === 'imagery-3d' || id === 'esri-world-imagery') {
    return (
      isRasterLayerVisible(map, ESRI_WORLD_IMAGERY_LAYER_ID) &&
      !isRasterLayerVisible(map, SATELLITE_STREETS_OVERLAY_LAYER_ID) &&
      !isRasterLayerVisible(map, STREETS_OVERLAY_LAYER_ID)
    );
  }
  if (id === 'satellite-streets-v12') {
    return isRasterLayerVisible(map, SATELLITE_STREETS_OVERLAY_LAYER_ID);
  }
  if (id === 'streets-v11') {
    return isRasterLayerVisible(map, STREETS_OVERLAY_LAYER_ID);
  }
  if (id === 'outdoors-v12' || id === PERSISTENT_BASE_STYLE_ID) {
    return (
      !isRasterLayerVisible(map, ESRI_WORLD_IMAGERY_LAYER_ID) &&
      !isRasterLayerVisible(map, SATELLITE_STREETS_OVERLAY_LAYER_ID) &&
      !isRasterLayerVisible(map, STREETS_OVERLAY_LAYER_ID)
    );
  }
  return true;
}

/** Tour requires Esri imagery plus Mapbox terrain (DEM). */
export function isTourImagery3DActive(map) {
  if (!map?.getStyle?.()?.layers) return false;
  let terrainOk = false;
  try {
    terrainOk = Boolean(map.getTerrain?.()?.source);
  } catch (_) {
    /* ignore */
  }
  return verifyBasemapAppliedOnMap(map, 'imagery') && terrainOk;
}

/**
 * Poll until tour 3D imagery is active or timeout.
 * @param {import('mapbox-gl').Map} map
 * @param {{ timeoutMs?: number, pollMs?: number }} [options]
 */
export async function waitUntilTourImagery3DActive(map, options = {}) {
  const timeoutMs = options.timeoutMs ?? 22000;
  const pollMs = options.pollMs ?? 200;
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (isTourImagery3DActive(map)) return true;
    await new Promise((resolve) => {
      window.setTimeout(resolve, pollMs);
    });
  }
  return isTourImagery3DActive(map);
}

/**
 * Tour cold-open: proceed once Esri imagery is visible (fast), without blocking on full 3D terrain.
 * @param {import('mapbox-gl').Map} map
 * @param {{ timeoutMs?: number, pollMs?: number }} [options]
 * @returns {Promise<'3d'|'imagery'|null>}
 */
export async function waitUntilTourBasemapReady(map, options = {}) {
  const timeoutMs = options.timeoutMs ?? 10000;
  const pollMs = options.pollMs ?? 120;
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (isTourImagery3DActive(map)) return '3d';
    if (verifyBasemapAppliedOnMap(map, 'imagery')) return 'imagery';
    await new Promise((resolve) => {
      window.setTimeout(resolve, pollMs);
    });
  }
  if (isTourImagery3DActive(map)) return '3d';
  if (verifyBasemapAppliedOnMap(map, 'imagery')) return 'imagery';
  return null;
}

/**
 * True when overlay rasters or outdoors underlay no longer match the selected basemap
 * (e.g. Discover landcover visible on top of Imagery after zoom / ownership restack).
 */
export function needsBasemapOverlayMaintenance(map, basemapId) {
  if (!map?.getStyle?.()?.layers) return false;
  const id = String(basemapId || '').trim();
  if (!id) return false;

  if (id === 'imagery' || id === 'imagery-3d' || id === 'esri-world-imagery') {
    return (
      !isRasterLayerVisible(map, ESRI_WORLD_IMAGERY_LAYER_ID) ||
      isRasterLayerVisible(map, SATELLITE_STREETS_OVERLAY_LAYER_ID) ||
      isRasterLayerVisible(map, STREETS_OVERLAY_LAYER_ID) ||
      hasVisibleMapboxStyleUnderlay(map)
    );
  }
  if (id === 'satellite-streets-v12') {
    return (
      !isRasterLayerVisible(map, SATELLITE_STREETS_OVERLAY_LAYER_ID) ||
      hasVisibleMapboxStyleUnderlay(map)
    );
  }
  if (id === 'streets-v11') {
    return (
      !isRasterLayerVisible(map, STREETS_OVERLAY_LAYER_ID) ||
      hasVisibleMapboxStyleUnderlay(map)
    );
  }
  if (id === 'outdoors-v12' || id === PERSISTENT_BASE_STYLE_ID) {
    return (
      isRasterLayerVisible(map, ESRI_WORLD_IMAGERY_LAYER_ID) ||
      isRasterLayerVisible(map, SATELLITE_STREETS_OVERLAY_LAYER_ID) ||
      isRasterLayerVisible(map, STREETS_OVERLAY_LAYER_ID)
    );
  }
  return false;
}

export function stackRasterBasemapAboveBackground(map, layerId) {
  if (!map?.getLayer?.(layerId)) return;
  const styleLayers = map.getStyle()?.layers || [];
  const anchor = styleLayers.find((l) => l.id !== 'background' && l.type !== 'sky')?.id;
  if (!anchor) return;
  try {
    map.moveLayer(layerId, anchor);
  } catch (_) {
    /* ignore */
  }
}

export function isDarkImageryBasemap(basemapId) {
  const id = String(basemapId || '')
    .trim()
    .toLowerCase();
  if (!id) return false;
  if (id.includes('imagery') || id.includes('satellite') || id.includes('ortho')) return true;
  if (id === 'esri-world-imagery') return true;
  return false;
}

/** Tune Mapbox composite labels for light vs dark basemaps (Satellite / Imagery / Discover). */
export function applyCompositeLabelStyleForBasemap(map, basemapId) {
  if (!map?.getStyle) return;
  const dark = isDarkImageryBasemap(basemapId);
  const styleLayers = map.getStyle().layers || [];
  styleLayers.forEach((layer) => {
    if (layer.type !== 'symbol' || layer.source !== 'composite') return;
    if (!map.getLayer(layer.id)) return;
    try {
      if (map.getLayoutProperty(layer.id, 'visibility') === 'none') return;
      map.setPaintProperty(layer.id, 'text-color', dark ? '#f8fafc' : '#0f172a');
      map.setPaintProperty(layer.id, 'text-halo-color', dark ? 'rgba(15, 23, 42, 0.88)' : '#ffffff');
      map.setPaintProperty(layer.id, 'text-halo-width', dark ? 1.35 : 1.15);
      map.setPaintProperty(layer.id, 'text-halo-blur', 0.35);
    } catch (_) {
      /* layer may be mid-style */
    }
  });
}

/** First composite/style symbol layer — data + parcel vectors sit directly below labels. */
export function getFirstSymbolLayerId(map) {
  if (!map?.getStyle) return undefined;
  try {
    const firstSym = (map.getStyle().layers || []).find((layer) => layer.type === 'symbol');
    return firstSym ? firstSym.id : undefined;
  } catch (_) {
    return undefined;
  }
}

/**
 * Match `updateLayers` MVT placement: Mapbox GL v3 composite/slot styles can leave vector tiles
 * stale until a zoom change if layers are only appended with no `beforeId`. Public land uses this.
 */
export function getVectorLayerInsertBeforeId(map) {
  if (!map?.getStyle) return undefined;
  try {
    const styleLayers = map.getStyle().layers || [];
    const drawLayer = styleLayers.find((l) => l.id.startsWith('gl-draw-'));
    if (hasVisibleManagedBasemapRaster(map)) {
      if (drawLayer) return drawLayer.id;
      const firstSym = styleLayers.find((l) => l.type === 'symbol');
      return firstSym ? firstSym.id : undefined;
    }
    const firstSym = styleLayers.find((l) => l.type === 'symbol');
    return firstSym ? firstSym.id : undefined;
  } catch (_) {
    return undefined;
  }
}

/** Raise hosted MVT / draw layers above basemap raster overlays (Esri, Satellite, Streets, etc.). */
export function restackDataLayersAboveBasemapOverlays(map) {
  if (!map?.getStyle) return;
  const beforeId = getFirstSymbolLayerId(map);
  const ids = (map.getStyle().layers || [])
    .map((layer) => layer.id)
    .filter((id) => {
      if (MANAGED_BASEMAP_RASTER_LAYER_IDS.includes(id)) return false;
      if (id.includes('regrid')) return false;
      if (id === 'cv-3d-buildings-layer' || id.startsWith('contour-lines-')) return false;
      if (id.endsWith('-layer') || id.startsWith('soil-')) return true;
      return id.startsWith('gl-draw-');
    });
  ids.forEach((id) => {
    try {
      map.moveLayer(id, beforeId);
    } catch (_) {
      /* ignore */
    }
  });
}
