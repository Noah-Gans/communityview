import * as turf from '@turf/turf';

export const TOUR_BUILDER_RADIUS_SOURCE_ID = 'tour-builder-radius-source';
export const TOUR_BUILDER_RADIUS_FILL_LAYER_ID = 'tour-builder-radius-fill';
export const TOUR_BUILDER_RADIUS_LINE_LAYER_ID = 'tour-builder-radius-line';

let pendingAmenityFitTimer = null;
let pendingAmenityFitRaf = 0;
let lastRadiusFitSignature = '';
let lastRadiusFitAt = 0;

function radiusFitSignature(center, radiusMeters) {
  return `${Number(center?.lat).toFixed(6)},${Number(center?.lng).toFixed(6)},${Number(radiusMeters)}`;
}

/** @type {{ center: { lat: number, lng: number }, radiusMeters: number } | null} */
let activeRadiusState = null;
let fitDebounceTimer = null;
let layerMaintainerStop = null;
let layerMaintainerMap = null;
/** Bumped on hide so async style/idle callbacks cannot resurrect a removed overlay. */
let radiusOverlayEpoch = 0;

function buildRadiusCircleGeoJson(center, radiusMeters) {
  const lat = Number(center?.lat);
  const lng = Number(center?.lng);
  const radiusKm = Number(radiusMeters) / 1000;
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || !Number.isFinite(radiusKm) || radiusKm <= 0) {
    return { type: 'FeatureCollection', features: [] };
  }
  try {
    const circle = turf.circle([lng, lat], radiusKm, { steps: 72, units: 'kilometers' });
    return { type: 'FeatureCollection', features: [circle] };
  } catch (_) {
    return { type: 'FeatureCollection', features: [] };
  }
}

/** Padding so the full search-radius circle fits inside the visible map canvas in tour edit mode. */
export function measureTourEditRadiusFitPadding(options = {}) {
  const footerViaMapPadding = options.footerViaMapPadding === true;
  if (typeof document === 'undefined') {
    return { top: 56, bottom: footerViaMapPadding ? 28 : 120, left: 56, right: 56 };
  }
  const root = document.documentElement;
  const footerH =
    parseFloat(getComputedStyle(root).getPropertyValue('--shared-tour-edit-footer-h')) || 164;
  let left = 56;
  let right = 56;
  let top = 56;
  try {
    const topbar = document.querySelector('.shared-tour-shell-topbar');
    const editChrome = document.querySelector('.tour-edit-chrome');
    if (editChrome) {
      top = Math.max(top, Math.ceil(editChrome.getBoundingClientRect().bottom + 16));
    } else if (topbar) {
      top = Math.max(top, Math.ceil(topbar.getBoundingClientRect().bottom + 16));
    }
    if (options.amenitySlideEntry !== true) {
      const editPanel = document.querySelector(
        '.tour-edit-side-panel, .tour-edit-amenity-panel, .amenity-map-panel.is-open'
      );
      if (editPanel) {
        left = Math.max(left, Math.ceil(editPanel.getBoundingClientRect().right + 28));
      }
    }
  } catch (_) {
    /* ignore measure errors */
  }
  return {
    top,
    bottom: footerViaMapPadding ? 28 : Math.max(56, footerH + 28),
    left,
    right,
  };
}

function moveRadiusLayersToTop(map) {
  if (!map) return;
  for (const layerId of [TOUR_BUILDER_RADIUS_FILL_LAYER_ID, TOUR_BUILDER_RADIUS_LINE_LAYER_ID]) {
    try {
      if (map.getLayer(layerId)) map.moveLayer(layerId);
    } catch (_) {
      /* ignore */
    }
  }
}

function applyRadiusLayers(map, geojson) {
  const existing = map.getSource(TOUR_BUILDER_RADIUS_SOURCE_ID);
  if (existing) {
    existing.setData(geojson);
  } else {
    map.addSource(TOUR_BUILDER_RADIUS_SOURCE_ID, { type: 'geojson', data: geojson });
  }

  if (!map.getLayer(TOUR_BUILDER_RADIUS_FILL_LAYER_ID)) {
    map.addLayer({
      id: TOUR_BUILDER_RADIUS_FILL_LAYER_ID,
      type: 'fill',
      source: TOUR_BUILDER_RADIUS_SOURCE_ID,
      paint: {
        'fill-color': '#2563eb',
        'fill-opacity': 0.16,
      },
    });
  }

  if (!map.getLayer(TOUR_BUILDER_RADIUS_LINE_LAYER_ID)) {
    map.addLayer({
      id: TOUR_BUILDER_RADIUS_LINE_LAYER_ID,
      type: 'line',
      source: TOUR_BUILDER_RADIUS_SOURCE_ID,
      paint: {
        'line-color': '#1d4ed8',
        'line-width': 3,
        'line-opacity': 0.95,
        'line-dasharray': [3, 2],
      },
    });
  }

  moveRadiusLayersToTop(map);
}

function stopLayerMaintainer() {
  if (typeof layerMaintainerStop === 'function') {
    try {
      layerMaintainerStop();
    } catch (_) {
      /* ignore */
    }
  }
  layerMaintainerStop = null;
  layerMaintainerMap = null;
}

function whenMapReady(map, fn, epoch = radiusOverlayEpoch) {
  if (!map) return;
  const run = () => {
    if (epoch !== radiusOverlayEpoch) return;
    try {
      if (typeof map.isStyleLoaded === 'function' && !map.isStyleLoaded()) return;
      fn();
    } catch (err) {
      if (process.env.NODE_ENV === 'development') {
        console.warn('[tour-radius]', err);
      }
    }
  };
  try {
    if (typeof map.isStyleLoaded === 'function' && map.isStyleLoaded()) {
      run();
      return;
    }
  } catch (_) {
    /* ignore */
  }
  map.once('style.load', run);
  map.once('load', run);
  map.once('idle', run);
}

function isTourEditRadiusActive() {
  // activeRadiusState is set only while an editor has shown the overlay; hide() clears it.
  // Do not require shared-tour-edit-mode — Amenity Map edit uses amenity-map-mode instead,
  // and without this check pan/zoom restacks never re-pin the circle after basemap labels.
  return Boolean(activeRadiusState);
}

function isRadiusEpochCurrent(epoch) {
  return epoch === radiusOverlayEpoch && Boolean(activeRadiusState);
}

function redrawFromActiveState(map, epoch = radiusOverlayEpoch) {
  if (!map || !activeRadiusState || !isRadiusEpochCurrent(epoch)) return;
  const geojson = buildRadiusCircleGeoJson(
    activeRadiusState.center,
    activeRadiusState.radiusMeters
  );
  if (!geojson.features.length) return;
  whenMapReady(map, () => {
    if (!isRadiusEpochCurrent(epoch)) return;
    applyRadiusLayers(map, geojson);
    moveRadiusLayersToTop(map);
  }, epoch);
}

function installLayerMaintainer(map) {
  if (layerMaintainerStop && layerMaintainerMap === map) return;
  stopLayerMaintainer();
  if (!map || !activeRadiusState) return;

  layerMaintainerMap = map;
  let rafPending = 0;
  const bumpNow = () => {
    if (!isTourEditRadiusActive()) return;
    if (!map.getLayer?.(TOUR_BUILDER_RADIUS_LINE_LAYER_ID)) {
      redrawFromActiveState(map);
      return;
    }
    try {
      const geojson = buildRadiusCircleGeoJson(
        activeRadiusState.center,
        activeRadiusState.radiusMeters
      );
      const src = map.getSource(TOUR_BUILDER_RADIUS_SOURCE_ID);
      if (src && geojson.features.length) src.setData(geojson);
    } catch (_) {
      /* ignore */
    }
    moveRadiusLayersToTop(map);
  };
  const bump = () => {
    if (rafPending) return;
    rafPending = window.requestAnimationFrame(() => {
      rafPending = 0;
      bumpNow();
    });
  };

  bump();
  // Include move/zoom so basemap label restacks during pan don't bury the circle until idle.
  const events = ['idle', 'move', 'zoom', 'moveend', 'zoomend', 'sourcedata', 'styledata', 'style.load'];
  for (const eventName of events) {
    map.on(eventName, bump);
  }
  try {
    map.on('cv:regrid-restack', bump);
  } catch (_) {
    /* ignore */
  }
  const intervalId = window.setInterval(bump, 250);

  layerMaintainerStop = () => {
    if (rafPending) window.cancelAnimationFrame(rafPending);
    rafPending = 0;
    window.clearInterval(intervalId);
    for (const eventName of events) {
      try {
        map.off(eventName, bump);
      } catch (_) {
        /* ignore */
      }
    }
    try {
      map.off('cv:regrid-restack', bump);
    } catch (_) {
      /* ignore */
    }
  };
}

/** Re-pin radius overlay after other map subsystems restack layers (edit mode only). */
export function ensureTourEditRadiusLayersOnTop(map) {
  if (!map || !isTourEditRadiusActive()) return;
  if (!map.getLayer?.(TOUR_BUILDER_RADIUS_LINE_LAYER_ID)) {
    redrawFromActiveState(map);
    return;
  }
  moveRadiusLayersToTop(map);
}

function clampTourSearchRadiusMeters(value) {
  return Math.min(50000, Math.max(500, Number(value) || 5000));
}

/**
 * Draw or update the amenity search-radius circle (no camera move).
 * @param {import('mapbox-gl').Map|null|undefined} map
 * @param {{ lat: number, lng: number }|null|undefined} center
 * @param {number} radiusMeters
 */
export function showTourEditRadiusCircle(map, center, radiusMeters) {
  if (!map || !center || !radiusMeters) return;

  const epoch = radiusOverlayEpoch;
  activeRadiusState = {
    center: { lat: Number(center.lat), lng: Number(center.lng) },
    radiusMeters: clampTourSearchRadiusMeters(radiusMeters),
  };

  const geojson = buildRadiusCircleGeoJson(center, activeRadiusState.radiusMeters);
  if (!geojson.features.length) {
    hideTourEditRadiusCircle(map);
    return;
  }

  const apply = () => {
    if (!isRadiusEpochCurrent(epoch)) return;
    applyRadiusLayers(map, geojson);
    installLayerMaintainer(map);
    moveRadiusLayersToTop(map);
  };

  try {
    if (typeof map.isStyleLoaded === 'function' && map.isStyleLoaded()) {
      apply();
      return;
    }
  } catch (_) {
    /* ignore */
  }
  whenMapReady(map, apply, epoch);
}

/**
 * Update circle size/position without touching the camera (amenity radius slider).
 * Recovers if the overlay was cleared or restacked away.
 * @param {import('mapbox-gl').Map|null|undefined} map
 * @param {{ lat: number, lng: number }|null|undefined} center
 * @param {number} radiusMeters
 */
export function updateTourEditRadiusGeometry(map, center, radiusMeters) {
  if (!map || !center || !radiusMeters) return;
  if (!activeRadiusState) {
    showTourEditRadiusCircle(map, center, radiusMeters);
    return;
  }
  activeRadiusState = {
    center: { lat: Number(center.lat), lng: Number(center.lng) },
    radiusMeters: clampTourSearchRadiusMeters(radiusMeters),
  };
  const geojson = buildRadiusCircleGeoJson(center, activeRadiusState.radiusMeters);
  if (!geojson.features.length) return;
  try {
    const src = map.getSource(TOUR_BUILDER_RADIUS_SOURCE_ID);
    if (src) {
      src.setData(geojson);
      moveRadiusLayersToTop(map);
      return;
    }
  } catch (_) {
    /* ignore */
  }
  showTourEditRadiusCircle(map, center, radiusMeters);
}

/**
 * Zoom the map so the entire search-radius circle is visible on screen.
 * @param {import('mapbox-gl').Map|null|undefined} map
 * @param {{ lat: number, lng: number }|null|undefined} center
 * @param {number} radiusMeters
 */
export function fitTourBuilderRadiusBounds(map, center, radiusMeters, options = {}) {
  if (!map || !center || !radiusMeters) return;
  const geojson = buildRadiusCircleGeoJson(center, radiusMeters);
  if (!geojson.features.length) return;

  const sig = radiusFitSignature(center, radiusMeters);
  const now = Date.now();
  if (!options.force && sig === lastRadiusFitSignature && now - lastRadiusFitAt < 1200) {
    return;
  }

  const editMode =
    typeof document !== 'undefined' &&
    document.documentElement.classList.contains('shared-tour-edit-mode');

  try {
    const bbox = turf.bbox(geojson);
    const radiusKm = Number(radiusMeters) / 1000;
    const maxZoom =
      radiusKm > 24 ? 9 : radiusKm > 16 ? 10 : radiusKm > 10 ? 11 : radiusKm > 5 ? 12 : 14;
    lastRadiusFitSignature = sig;
    lastRadiusFitAt = now;
    map.fitBounds(
      [
        [bbox[0], bbox[1]],
        [bbox[2], bbox[3]],
      ],
      {
        padding: measureTourEditRadiusFitPadding({
          footerViaMapPadding: editMode,
          amenitySlideEntry: options.amenitySlideEntry === true,
        }),
        duration: options.duration ?? 900,
        maxZoom,
        essential: true,
        easing: (t) => 1 - (1 - t) ** 3,
      }
    );
  } catch (_) {
    /* ignore fit errors */
  }
}

/**
 * Show the radius circle and zoom to fit once when entering an amenity slide in edit mode.
 * @param {import('mapbox-gl').Map} map
 * @param {{ lat: number, lng: number }} center
 * @param {number} radiusMeters
 * @param {{ shouldAbort?: () => boolean, onFitted?: () => void }} [options]
 */
export function fitTourEditRadiusForAmenitySlide(map, center, radiusMeters, options = {}) {
  if (!map || !center || !radiusMeters) return;
  const shouldAbort =
    typeof options.shouldAbort === 'function' ? options.shouldAbort : () => false;
  const onFitted = typeof options.onFitted === 'function' ? options.onFitted : () => {};

  if (pendingAmenityFitTimer) {
    clearTimeout(pendingAmenityFitTimer);
    pendingAmenityFitTimer = null;
  }
  pendingAmenityFitRaf += 1;
  const fitRafId = pendingAmenityFitRaf;

  showTourEditRadiusCircle(map, center, radiusMeters);

  const runFit = () => {
    if (fitRafId !== pendingAmenityFitRaf) return;
    if (shouldAbort()) return;
    fitTourBuilderRadiusBounds(map, center, radiusMeters, {
      duration: 0,
      amenitySlideEntry: true,
    });
    onFitted();
  };

  requestAnimationFrame(() => {
    if (fitRafId !== pendingAmenityFitRaf) return;
    requestAnimationFrame(runFit);
  });
}

/**
 * Fit map to the radius circle immediately (no debounce). Use when entering an amenity slide.
 * @param {import('mapbox-gl').Map|null|undefined} map
 * @param {{ lat: number, lng: number }|null|undefined} center
 * @param {number} radiusMeters
 */
export function fitTourEditRadiusCircleNow(map, center, radiusMeters) {
  if (!map || !center || !radiusMeters) return;
  const epoch = radiusOverlayEpoch;
  if (fitDebounceTimer) {
    clearTimeout(fitDebounceTimer);
    fitDebounceTimer = null;
  }
  showTourEditRadiusCircle(map, center, radiusMeters);
  const runFit = () => {
    if (epoch !== radiusOverlayEpoch) return;
    fitTourBuilderRadiusBounds(map, center, radiusMeters);
    redrawFromActiveState(map, epoch);
  };
  try {
    if (typeof map.isStyleLoaded === 'function' && map.isStyleLoaded()) {
      runFit();
      return;
    }
  } catch (_) {
    /* ignore */
  }
  whenMapReady(map, runFit, epoch);
}

/**
 * Fit map to the radius circle (debounced). Always refreshes circle geometry first.
 * @param {import('mapbox-gl').Map|null|undefined} map
 * @param {{ lat: number, lng: number }|null|undefined} center
 * @param {number} radiusMeters
 * @param {{ debounceMs?: number }} [options]
 */
export function fitTourEditRadiusCircle(map, center, radiusMeters, options = {}) {
  if (!map || !center || !radiusMeters) return;
  const debounceMs = Number.isFinite(options.debounceMs) ? options.debounceMs : 200;

  if (fitDebounceTimer) {
    clearTimeout(fitDebounceTimer);
    fitDebounceTimer = null;
  }

  showTourEditRadiusCircle(map, center, radiusMeters);

  fitDebounceTimer = window.setTimeout(() => {
    fitDebounceTimer = null;
    showTourEditRadiusCircle(map, center, radiusMeters);
    whenMapReady(map, () => {
      fitTourBuilderRadiusBounds(map, center, radiusMeters);
      redrawFromActiveState(map);
    });
  }, debounceMs);
}

/** Remove radius overlay and cancel pending camera fits. */
export function hideTourEditRadiusCircle(map) {
  radiusOverlayEpoch += 1;
  pendingAmenityFitRaf += 1;
  if (pendingAmenityFitTimer) {
    clearTimeout(pendingAmenityFitTimer);
    pendingAmenityFitTimer = null;
  }
  if (fitDebounceTimer) {
    clearTimeout(fitDebounceTimer);
    fitDebounceTimer = null;
  }
  activeRadiusState = null;
  stopLayerMaintainer();
  if (!map) return;
  for (const layerId of [TOUR_BUILDER_RADIUS_LINE_LAYER_ID, TOUR_BUILDER_RADIUS_FILL_LAYER_ID]) {
    try {
      if (map.getLayer(layerId)) map.removeLayer(layerId);
    } catch (_) {
      /* ignore */
    }
  }
  try {
    if (map.getSource(TOUR_BUILDER_RADIUS_SOURCE_ID)) map.removeSource(TOUR_BUILDER_RADIUS_SOURCE_ID);
  } catch (_) {
    /* ignore */
  }
}

/** @deprecated Use hideTourEditRadiusCircle */
export function clearTourEditRadius(map) {
  hideTourEditRadiusCircle(map);
}

/** @deprecated Use showTourEditRadiusCircle + fitTourEditRadiusCircle */
export function updateTourEditRadius(map, center, radiusMeters, options = {}) {
  showTourEditRadiusCircle(map, center, radiusMeters);
  if (options.fitCamera === true) {
    fitTourEditRadiusCircle(map, center, radiusMeters, {
      debounceMs: Number.isFinite(options.debounceMs) ? options.debounceMs : 200,
    });
  }
}

/** @deprecated Use fitTourEditRadiusCircle */
export function scheduleTourEditRadiusFit(map, center, radiusMeters) {
  fitTourEditRadiusCircle(map, center, radiusMeters, { debounceMs: 80 });
}

/** @deprecated Use hideTourEditRadiusCircle */
export function removeTourBuilderRadiusOverlay(map) {
  hideTourEditRadiusCircle(map);
}

/** @deprecated Use showTourEditRadiusCircle */
export function syncTourBuilderRadiusOverlay(map, center, radiusMeters, options = {}) {
  showTourEditRadiusCircle(map, center, radiusMeters);
  if (options.fitCamera === true) {
    fitTourEditRadiusCircle(map, center, radiusMeters, { debounceMs: 80 });
  }
}

/** @deprecated Use showTourEditRadiusCircle */
export function refreshTourEditRadiusOverlay(map) {
  redrawFromActiveState(map);
  ensureTourEditRadiusLayersOnTop(map);
}
