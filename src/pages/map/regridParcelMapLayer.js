import { rewriteRegridTileUrlToProxy } from '../../config/regridApi';
import {
  REGRID_PARCEL_FILL_COLOR,
  applyRegridParcelOutlineForBasemap,
  getRegridParcelOutlineColorForBasemap,
} from '../../components/map/mapStyles';
import { getRegridVectorMinZoomForMap, REGRID_VECTOR_MIN_ZOOM_SPARSE } from '../../utils/regridParcelTileDensity';
import { DEFAULT_BASEMAP_ID } from './mapConstants';
import { getFirstSymbolLayerId, getVectorLayerInsertBeforeId } from './mapBasemapUtils';
import {
  forceVectorTileSourceRefresh,
  getHostedTileLayerUrl,
  reloadVectorSourceTileCaches,
  setTileLayerVisibility,
  tileLayerMapLayersPresent,
} from './mapHostedTileLayers';
import { isVectorPmtilesArchiveUrl } from './mapLayerShared';

/** Basemap id used for Regrid parcel outline paint (updated from MapPage on basemap change). */
export const regridStyleBasemapRef = { current: DEFAULT_BASEMAP_ID };

let cachedRegridTileJson = null;
let activeRegridVectorMinZoom = REGRID_VECTOR_MIN_ZOOM_SPARSE;

export function ensureRegridTileProxyUrl(templateUrl) {
  return rewriteRegridTileUrlToProxy(templateUrl);
}

export function removeRegridParcelLayersAndSource(map) {
  if (!map) return;
  try {
    // ownership-label-layer (and any other consumer) must be removed before the source,
    // or removeSource fails and we leave orphans: labels on, outline/fill gone.
    const styleLayers = map.getStyle?.()?.layers || [];
    styleLayers.forEach((layer) => {
      if (layer?.source === 'regrid-parcels' && map.getLayer(layer.id)) {
        try {
          map.removeLayer(layer.id);
        } catch (_) {
          /* ignore */
        }
      }
    });
    if (map.getSource('regrid-parcels')) map.removeSource('regrid-parcels');
  } catch (_) {
    /* style may be mid-swap */
  }
}

/** Full teardown — basemap style swap or ownership toggled off only. */
export function removeRegridParcelStack(map) {
  removeRegridParcelLayersAndSource(map);
}

/**
 * Regrid TileJSON often puts MVT templates on `vector` (not `tiles`). Prefer `vector` when present.
 * @see https://support.regrid.com/api/using-the-tileserver-api
 */
/** MVT tile templates from TileJSON (`vector` preferred). */
export function getRegridTileUrls(tileJson) {
  if (!tileJson) return [];
  let raw = [];
  const v = tileJson.vector;
  if (typeof v === 'string' && v.length) raw = [v];
  else if (Array.isArray(v) && v.length) raw = v;
  else if (Array.isArray(tileJson.tiles) && tileJson.tiles.length) {
    raw = tileJson.tiles.filter((u) => typeof u === 'string' && /\.mvt/i.test(u));
  }
  return raw.map((u) => ensureRegridTileProxyUrl(u));
}

/** MVT `source-layer`: Regrid's Mapbox example uses TileJSON top-level `id` (not `vector_layers[0]`). */
export function getRegridVectorSourceLayerId(tileJson) {
  if (!tileJson) return 'parcels';
  if (typeof tileJson.id === 'string' && tileJson.id.length) {
    return tileJson.id;
  }
  const vl = tileJson.vector_layers;
  if (Array.isArray(vl) && vl[0] && typeof vl[0].id === 'string' && vl[0].id.length) {
    return vl[0].id;
  }
  return 'parcels';
}

export const REGRID_PARCELS_SELECTION_FILL_ID = 'regrid-parcels-selection-fill';
export const REGRID_PARCELS_SELECTION_LINE_ID = 'regrid-parcels-selection-line';

const REGRID_SELECTION_NOMATCH_FILTER = ['==', ['get', 'll_uuid'], ''];

/** Map click / selection features that should use MVT filter highlight (not GeoJSON scan). */
export function isRegridParcelSelectionFeature(feature) {
  if (!feature) return false;
  const props = feature.properties || {};
  return (
    feature.layer?.id === 'regrid-parcels-layer' ||
    feature.layer?.id === 'regrid-parcels-outline' ||
    Boolean(props.ll_uuid || props.parcelnumb || props.global_parcel_uid || props.parcel_id)
  );
}

/** Mapbox filter matching selected parcel(s) by tile properties — no viewport feature scan. */
export function buildRegridParcelSelectionFilter(features) {
  if (!Array.isArray(features) || features.length === 0) return null;
  const clauses = [];
  const seen = new Set();
  for (const feature of features) {
    if (!isRegridParcelSelectionFeature(feature)) continue;
    const props = feature.properties || {};
    if (props.ll_uuid) {
      const key = `ll:${props.ll_uuid}`;
      if (!seen.has(key)) {
        seen.add(key);
        clauses.push(['==', ['get', 'll_uuid'], props.ll_uuid]);
      }
      continue;
    }
    if (props.parcelnumb) {
      const key = `pn:${props.parcelnumb}`;
      if (!seen.has(key)) {
        seen.add(key);
        clauses.push(['==', ['get', 'parcelnumb'], props.parcelnumb]);
      }
      continue;
    }
    if (props.global_parcel_uid) {
      const key = `gpu:${props.global_parcel_uid}`;
      if (!seen.has(key)) {
        seen.add(key);
        clauses.push(['==', ['get', 'global_parcel_uid'], props.global_parcel_uid]);
      }
      continue;
    }
    if (props.parcel_id) {
      const key = `pid:${props.parcel_id}`;
      if (!seen.has(key)) {
        seen.add(key);
        clauses.push(['==', ['get', 'parcel_id'], props.parcel_id]);
      }
    }
  }
  if (clauses.length === 0) return null;
  if (clauses.length === 1) return clauses[0];
  return ['any', ...clauses];
}

function addRegridParcelSelectionHighlightLayers(map, sourceLayerId, beforeId, vectorMinZoom, tileMaxZoom) {
  if (!map?.addLayer || map.getLayer(REGRID_PARCELS_SELECTION_FILL_ID)) return;

  map.addLayer(
    {
      id: REGRID_PARCELS_SELECTION_FILL_ID,
      type: 'fill',
      source: 'regrid-parcels',
      'source-layer': sourceLayerId,
      filter: REGRID_SELECTION_NOMATCH_FILTER,
      paint: {
        'fill-color': 'rgba(0, 0, 0, 0)',
        'fill-opacity': 0,
        'fill-outline-color': 'rgba(0, 0, 0, 0)',
      },
      layout: { visibility: 'none' },
      minzoom: vectorMinZoom,
      maxzoom: tileMaxZoom,
    },
    beforeId
  );

  map.addLayer(
    {
      id: REGRID_PARCELS_SELECTION_LINE_ID,
      type: 'line',
      source: 'regrid-parcels',
      'source-layer': sourceLayerId,
      filter: REGRID_SELECTION_NOMATCH_FILTER,
      paint: {
        'line-color': 'rgba(0, 0, 0, 0)',
        'line-width': 3,
      },
      layout: {
        visibility: 'none',
        'line-join': 'round',
        'line-cap': 'round',
      },
      minzoom: vectorMinZoom,
      maxzoom: tileMaxZoom,
    },
    beforeId
  );
}

/** Add MVT filter highlight layers when the Regrid source exists (idempotent). */
export function ensureRegridParcelSelectionHighlightLayers(map) {
  if (!map?.getSource?.('regrid-parcels') || !cachedRegridTileJson) return;
  if (map.getLayer(REGRID_PARCELS_SELECTION_FILL_ID)) return;
  const sourceLayerId = getRegridVectorSourceLayerId(cachedRegridTileJson);
  const beforeId = getFirstSymbolLayerId(map);
  const tileMaxZoom = cachedRegridTileJson.maxzoom || 21;
  addRegridParcelSelectionHighlightLayers(
    map,
    sourceLayerId,
    beforeId,
    activeRegridVectorMinZoom,
    tileMaxZoom
  );
}

export function applyRegridParcelSelectionHighlightPaint(map, settings = {}) {
  if (!map?.getLayer?.(REGRID_PARCELS_SELECTION_FILL_ID)) return;
  const fillPaint = {
    'fill-color': settings.fillColor ?? '#FF0000',
    'fill-outline-color': settings.fillOutlineColor ?? settings.fillColor ?? '#FF0000',
    'fill-opacity': settings.fillOpacity ?? 0.5,
  };
  const linePaint = {
    'line-color': settings.lineColor ?? '#FF0000',
    'line-width': settings.lineWidth ?? 3,
  };
  try {
    Object.entries(fillPaint).forEach(([key, val]) => {
      map.setPaintProperty(REGRID_PARCELS_SELECTION_FILL_ID, key, val);
    });
    Object.entries(linePaint).forEach(([key, val]) => {
      map.setPaintProperty(REGRID_PARCELS_SELECTION_LINE_ID, key, val);
    });
  } catch (_) {
    /* ignore */
  }
}

/** Highlight selected parcels via MVT layer filter — O(selection), not O(viewport parcels). */
export function setRegridParcelSelectionHighlight(map, features, settings = {}) {
  // Style *document* is enough; isStyleLoaded() goes false while tiles download after zoom.
  if (!map?.getStyle?.()?.layers) return false;
  ensureRegridParcelSelectionHighlightLayers(map);
  if (!map.getLayer(REGRID_PARCELS_SELECTION_FILL_ID)) return false;

  const filter = buildRegridParcelSelectionFilter(features);
  if (!filter) {
    clearRegridParcelSelectionHighlight(map);
    return false;
  }

  try {
    map.setFilter(REGRID_PARCELS_SELECTION_FILL_ID, filter);
    map.setFilter(REGRID_PARCELS_SELECTION_LINE_ID, filter);
    applyRegridParcelSelectionHighlightPaint(map, settings);
    map.setLayoutProperty(REGRID_PARCELS_SELECTION_FILL_ID, 'visibility', 'visible');
    map.setLayoutProperty(REGRID_PARCELS_SELECTION_LINE_ID, 'visibility', 'visible');
    return true;
  } catch (_) {
    return false;
  }
}

export function clearRegridParcelSelectionHighlight(map) {
  if (!map?.getStyle?.()) return;
  try {
    if (map.getLayer(REGRID_PARCELS_SELECTION_FILL_ID)) {
      map.setFilter(REGRID_PARCELS_SELECTION_FILL_ID, REGRID_SELECTION_NOMATCH_FILTER);
      map.setLayoutProperty(REGRID_PARCELS_SELECTION_FILL_ID, 'visibility', 'none');
    }
    if (map.getLayer(REGRID_PARCELS_SELECTION_LINE_ID)) {
      map.setFilter(REGRID_PARCELS_SELECTION_LINE_ID, REGRID_SELECTION_NOMATCH_FILTER);
      map.setLayoutProperty(REGRID_PARCELS_SELECTION_LINE_ID, 'visibility', 'none');
    }
  } catch (_) {
    /* ignore */
  }
}

/**
 * Add Regrid MVT source + layers when TileJSON is known — same synchronous moment as hosted
 * PMTiles layers in `updateLayers` (source exists before stack reorder / idle).
 */
export function addRegridParcelLayersFromTileJson(
  map,
  tileJson,
  vectorMinZoom = activeRegridVectorMinZoom
) {
  const tileUrls = getRegridTileUrls(tileJson);
  if (!map?.addSource || !tileUrls.length) return;
  if (map.getSource('regrid-parcels')) {
    const stackMissing =
      !map.getLayer('regrid-parcels-layer') || !map.getLayer('regrid-parcels-outline');
    if (stackMissing) {
      // Source survived a partial teardown (e.g. labels blocked removeSource) — full rebuild.
      removeRegridParcelLayersAndSource(map);
    } else {
      const mapZoom = typeof map.getZoom === 'function' ? map.getZoom() : activeRegridVectorMinZoom;
      if (mapZoom >= activeRegridVectorMinZoom) {
        forceRegridParcelsSourceRefresh(map, tileUrls);
      }
      ensureRegridParcelSelectionHighlightLayers(map);
      return;
    }
  }

  activeRegridVectorMinZoom = vectorMinZoom;
  const sourceLayerId = getRegridVectorSourceLayerId(tileJson);
  const insertBeforeId = getVectorLayerInsertBeforeId(map);
  const tileMaxZoom = tileJson.maxzoom || 21;

  map.addSource('regrid-parcels', {
    type: 'vector',
    tiles: tileUrls,
    minzoom: vectorMinZoom,
    maxzoom: tileMaxZoom,
  });

  map.addLayer({
    id: 'regrid-parcels-layer',
    type: 'fill',
    source: 'regrid-parcels',
    'source-layer': sourceLayerId,
    paint: {
      'fill-color': REGRID_PARCEL_FILL_COLOR,
      'fill-opacity': 0,
    },
    filter: [
      'all',
      [
        'case',
        ['<', ['zoom'], 14],
        [
          'all',
          [
            'case',
            ['has', 'll_gissqft'],
            [
              '>',
              ['*', ['get', 'll_gissqft'], 0.0000229568],
              [
                'interpolate',
                ['linear'],
                ['zoom'],
                10,
                2.0,
                11,
                1.0,
                12,
                0.5,
                13,
                0.25,
              ],
            ],
            [
              'case',
              ['has', 'll_gisacre'],
              [
                '>',
                ['get', 'll_gisacre'],
                ['interpolate', ['linear'], ['zoom'], 10, 2.0, 11, 1.0, 12, 0.5, 13, 0.25],
              ],
              true,
            ],
          ],
        ],
        true,
      ],
    ],
    layout: { visibility: 'visible' },
    minzoom: vectorMinZoom,
    maxzoom: tileMaxZoom,
  }, insertBeforeId);

  map.addLayer({
    id: 'regrid-parcels-outline',
    type: 'line',
    source: 'regrid-parcels',
    'source-layer': sourceLayerId,
    paint: {
      'line-color': getRegridParcelOutlineColorForBasemap(regridStyleBasemapRef.current),
      'line-width': ['interpolate', ['linear'], ['zoom'], 10, 0.4, 13, 0.7, 15, 1.0],
      'line-opacity': 1.0,
      'line-simplify': [
        'interpolate',
        ['linear'],
        ['zoom'],
        10,
        3.0,
        11,
        2.5,
        12,
        2.0,
        13,
        1.5,
        14,
        1.0,
        16,
        0.5,
        18,
        0.3,
        20,
        0.1,
        21,
        0.0,
      ],
    },
    filter: [
      'all',
      [
        'case',
        ['<', ['zoom'], 14],
        [
          'all',
          [
            'case',
            ['has', 'll_gissqft'],
            [
              '>',
              ['*', ['get', 'll_gissqft'], 0.0000229568],
              [
                'interpolate',
                ['linear'],
                ['zoom'],
                10,
                2.0,
                11,
                1.0,
                12,
                0.5,
                13,
                0.25,
              ],
            ],
            [
              'case',
              ['has', 'll_gisacre'],
              [
                '>',
                ['get', 'll_gisacre'],
                ['interpolate', ['linear'], ['zoom'], 10, 2.0, 11, 1.0, 12, 0.5, 13, 0.25],
              ],
              true,
            ],
          ],
        ],
        true,
      ],
    ],
    layout: {
      visibility: 'visible',
      'line-join': 'round',
      'line-cap': 'round',
    },
    minzoom: vectorMinZoom,
    maxzoom: tileMaxZoom,
  }, 'regrid-parcels-layer');

  ensureRegridParcelSelectionHighlightLayers(map);

  applyRegridParcelOutlineForBasemap(map, regridStyleBasemapRef.current);

  // Source/layer minzoom blocks fetch below threshold — skip reload until zoom is in range.
  const mapZoom = typeof map.getZoom === 'function' ? map.getZoom() : vectorMinZoom;
  if (mapZoom >= vectorMinZoom) {
    forceRegridParcelsSourceRefresh(map, tileUrls);
  }
}

/** Rebuild MVT stack when map center moves between sparse/dense geofences (source minzoom must change). */
export function rebuildRegridParcelStackForDensity(map, vectorMinZoom) {
  if (!map?.getStyle?.()?.layers || !cachedRegridTileJson) return;
  if (vectorMinZoom === activeRegridVectorMinZoom && map.getSource('regrid-parcels')) {
    // Still repair if draw layers were lost while source remained.
    if (map.getLayer('regrid-parcels-outline') && map.getLayer('regrid-parcels-layer')) return;
  }
  try {
    removeRegridParcelLayersAndSource(map);
  } catch (_) {
    /* ignore */
  }
  addRegridParcelLayersFromTileJson(map, cachedRegridTileJson, vectorMinZoom);
}

/**
 * Regrid is not in `tileLayerUrls`. Mirror `forceVectorTileSourceRefresh` by calling `setTiles` with
 * the TileJSON template list so the tile pyramid invalidates after `setStyle`.
 */
export function forceRegridParcelsSourceRefresh(map, tilesOverride) {
  if (!map) return;
  try {
    const src = map.getSource('regrid-parcels');
    if (!src) return;
    const tiles = tilesOverride || getRegridTileUrls(cachedRegridTileJson);
    // `setTiles` assigns URLs and calls `reload()` internally — same pattern as hosted MVT sources.
    if (tiles && Array.isArray(tiles) && tiles.length && typeof src.setTiles === 'function') {
      src.setTiles(tiles.slice());
    } else if (typeof src.reload === 'function') {
      src.reload();
    }
    reloadVectorSourceTileCaches(map, 'regrid-parcels');
  } catch (_) {
    /* source may be mid-style */
  }
}

/**
 * Keep Regrid parcel source + layers on the map whenever ownership is on.
 * Tile requests are gated by source/layer `minzoom` (11 sparse / 13 dense) — never remove or
 * hide layers based on current map zoom, so Mapbox can fetch MVT tiles as soon as zoom allows.
 */
export function syncRegridParcelLayersIntoMap(map, parcelMapVisibility) {
  if (!map?.getStyle?.()?.layers) return;
  if (!parcelMapVisibility?.showRegrid) return;

  const vectorMinZoom = getRegridVectorMinZoomForMap(map);
  if (!cachedRegridTileJson) return;

  if (!map.getSource('regrid-parcels')) {
    addRegridParcelLayersFromTileJson(map, cachedRegridTileJson, vectorMinZoom);
  } else if (vectorMinZoom !== activeRegridVectorMinZoom) {
    rebuildRegridParcelStackForDensity(map, vectorMinZoom);
  } else if (!map.getLayer('regrid-parcels-outline') || !map.getLayer('regrid-parcels-layer')) {
    // Repair orphaned source (lines removed, labels left behind).
    addRegridParcelLayersFromTileJson(map, cachedRegridTileJson, vectorMinZoom);
  } else {
    ensureRegridParcelSelectionHighlightLayers(map);
  }
}

/**
 * Ownership layer sync — same contract as hosted MVT toggles inside `updateLayers`.
 * @returns {boolean} true when the Regrid source was added this pass
 */
export function syncOwnershipTileLayer(map, parcelMapVisibility) {
  // Same as highlight: don't require isStyleLoaded() (false while data tiles load after zoom).
  if (!map?.getStyle?.()?.layers) return false;
  if (parcelMapVisibility?.showRegrid) {
    if (!cachedRegridTileJson) return false;
    const hadSource = Boolean(map.getSource('regrid-parcels'));
    const hadOutline = Boolean(map.getLayer('regrid-parcels-outline'));
    syncRegridParcelLayersIntoMap(map, parcelMapVisibility);
    applyParcelVisualizationVisibility(map, parcelMapVisibility);
    bringRegridParcelLayersBeforeSymbolLabels(map);
    return (!hadSource || !hadOutline) && Boolean(map.getSource('regrid-parcels'));
  }
  applyParcelVisualizationVisibility(map, { showRegrid: false });
  clearRegridParcelSelectionHighlight(map);
  return false;
}

/** Fired after Mapbox Draw (or others) add layers post–style.load so we can re-pin Regrid. */
export const CV_REGRID_RESTACK_EVENT = 'cv:regrid-restack';

export function fireRegridRestack(map) {
  try {
    if (map && typeof map.fire === 'function') {
      map.fire(CV_REGRID_RESTACK_EVENT);
    }
  } catch (_) {
    /* ignore */
  }
}

/** One restack after basemap — triple fire caused repeated hide/show + bumpZoom flicker. */
export function schedulePostBasemapRegridRestack(mapRef) {
  requestAnimationFrame(() => fireRegridRestack(mapRef?.current));
}

export { getFirstSymbolLayerId } from './mapBasemapUtils';

/**
 * Raise Regrid above hosted MVT fills but below Mapbox composite labels (and custom label layers).
 * Outline is moved last so ownership lines paint above semi-transparent data fills.
 */
export function bringRegridParcelLayersBeforeSymbolLabels(map) {
  if (!map) return;
  const beforeId = getFirstSymbolLayerId(map);
  [
    'regrid-zoning-tiles-fill',
    'regrid-parcels-layer',
    'regrid-zoning-tiles-outline',
    'regrid-parcels-outline',
    REGRID_PARCELS_SELECTION_FILL_ID,
    REGRID_PARCELS_SELECTION_LINE_ID,
  ].forEach((id) => {
    if (map.getLayer(id)) {
      try {
        map.moveLayer(id, beforeId);
      } catch (_) {
        /* layer may be mid-style */
      }
    }
  });
}

/** Regrid parcel tiles: show when ownership is on, or during property-map wizard (ownership off but parcels needed). */
export function setRegridParcelLayersVisibility(map, visible) {
  if (!map) return;
  const vis = visible ? 'visible' : 'none';
  [
    'regrid-parcels-layer',
    'regrid-parcels-outline',
    REGRID_PARCELS_SELECTION_FILL_ID,
    REGRID_PARCELS_SELECTION_LINE_ID,
  ].forEach((id) => {
    if (map.getLayer(id)) {
      try {
        map.setLayoutProperty(id, 'visibility', vis);
      } catch (_) {
        /* ignore */
      }
    }
  });
}

/** Ownership toggle only — layers stay on map when on; Mapbox `minzoom` on source/layers blocks tile fetch. */
export function applyParcelVisualizationVisibility(map, { showRegrid }) {
  if (!map) return;
  setRegridParcelLayersVisibility(map, Boolean(showRegrid));
  if (!showRegrid) {
    clearRegridParcelSelectionHighlight(map);
  }
}

export function flushMapRepaintAfterLayerChange(map) {
  if (!map) return;
  try {
    map.triggerRepaint?.();
  } catch (_) {
    /* ignore */
  }
  requestAnimationFrame(() => {
    try {
      map.triggerRepaint?.();
    } catch (_) {
      /* ignore */
    }
  });
}

/** Lighter than `forceRegridParcelsSourceRefresh` — enough for visibility-only toggles. */
export function nudgeVectorTileSource(map, sourceId) {
  if (!map || !sourceId) return;
  try {
    const src = map.getSource(sourceId);
    if (!src) return;
    if (typeof src.reload === 'function') src.reload();
    reloadVectorSourceTileCaches(map, sourceId);
  } catch (_) {
    /* ignore */
  }
}

/** Latest layer toggle state — deferred repaints read this so OFF toggles are not undone by stale rAF. */
export const layerStatusLiveRef = { current: {} };
export const parcelShowRegridLiveRef = { current: false };

/** Regrid MVT: sync visibility + nudge tile cache after ownership turns on (no full setTiles reload). */
export function repaintRegridParcelsAfterShow(map, attempt = 0) {
  if (!parcelShowRegridLiveRef.current) return;
  if (!map?.isStyleLoaded?.()) return;
  if (!map.getSource('regrid-parcels')) {
    if (attempt < 6) {
      requestAnimationFrame(() => repaintRegridParcelsAfterShow(map, attempt + 1));
    }
    return;
  }
  setRegridParcelLayersVisibility(map, true);
  nudgeVectorTileSource(map, 'regrid-parcels');
  flushMapRepaintAfterLayerChange(map);
  try {
    map.once('idle', () => {
      if (!parcelShowRegridLiveRef.current) return;
      reloadVectorSourceTileCaches(map, 'regrid-parcels');
      map.triggerRepaint?.();
    });
  } catch (_) {
    /* ignore */
  }
}

/**
 * Mapbox often skips fetching/redrawing MVT tiles after `visibility: none → visible` until pan/zoom.
 * Brief hide/show + source nudge matches the old “move the map” fix without a camera change.
 */
export function repaintTileLayerAfterTurnedOn(map, layerName) {
  if (!map?.isStyleLoaded?.()) return;
  if (layerName === 'ownership') {
    repaintRegridParcelsAfterShow(map);
    return;
  }
  if (!getHostedTileLayerUrl(layerName) || !map.getSource(layerName)) return;
  if (!tileLayerMapLayersPresent(map, layerName)) return;
  setTileLayerVisibility(map, layerName, 'none');
  requestAnimationFrame(() => {
    if (!layerStatusLiveRef.current?.[layerName]) return;
    setTileLayerVisibility(map, layerName, 'visible');
    nudgeVectorTileSource(map, layerName);
    flushMapRepaintAfterLayerChange(map);
  });
}

export function repaintLayersTurnedOn(map, layerStatus, turnedOnLayerNames, { regridFreshlyAdded = false } = {}) {
  if (!map?.isStyleLoaded?.()) return;
  const names = new Set(turnedOnLayerNames || []);
  if (regridFreshlyAdded) names.add('ownership');
  if (names.size === 0) return;
  names.forEach((layerName) => repaintTileLayerAfterTurnedOn(map, layerName));
}

export function reloadTileSources(map, sourceIds, includeRegridParcels) {
  if (!map || !sourceIds?.size) return;
  sourceIds.forEach((sourceId) => {
    forceVectorTileSourceRefresh(map, sourceId);
  });
  if (includeRegridParcels) {
    forceRegridParcelsSourceRefresh(map);
  }
}

/**
 * After style/layer churn, do a deferred source refresh once when the map settles.
 * Only pass sources that were added or had their tile URL changed — not on visibility-only toggles.
 */
export function scheduleDeferredTileRefresh(map, mutatedSourceIds, includeRegridParcels) {
  if (!map || !mutatedSourceIds?.size) return;
  let didFlush = false;
  const flush = () => {
    if (didFlush) return;
    didFlush = true;
    reloadTileSources(map, mutatedSourceIds, includeRegridParcels);
    try {
      if (typeof map.triggerRepaint === 'function') map.triggerRepaint();
    } catch (_) {
      /* ignore */
    }
  };
  try {
    map.once('idle', flush);
  } catch (_) {
    /* ignore */
  }
  // Fallback in case idle doesn't fire promptly.
  window.setTimeout(flush, 500);
}

export function getCachedRegridTileJson() {
  return cachedRegridTileJson;
}
export function setCachedRegridTileJson(tileJson) {
  cachedRegridTileJson = tileJson;
}
