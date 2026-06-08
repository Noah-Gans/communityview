import React, { useEffect, useState, useRef, useMemo, useCallback } from 'react';
import mapboxgl from 'mapbox-gl';
import * as turf from '@turf/turf';
import area from '@turf/area';
import { flushSync } from 'react-dom';
import { Rnd } from 'react-rnd';
import 'mapbox-gl/dist/mapbox-gl.css';
import './Map.css';
import './print/Print.css';
import { useNavigate, useLocation } from 'react-router-dom'; // ✅ Import useLocation
import SidePanel from '../components/map/SidePanel';
import Spinner from '../components/map/spinner'; // Import spinner
import ToolPanel from '../components/map/ToolPanel'; // Import ToolPanel
import { featureCollection } from '@turf/turf';
import {
  countyZoningColors,
  CONSERVATION_EASEMENTS_VECTOR_SOURCE_LAYER,
  getLayerStyle,
  getLabelLayerStyle,
  REGRID_PARCEL_FILL_COLOR,
  applyRegridParcelOutlineForBasemap,
  getRegridParcelOutlineColorForBasemap,
  getSoilMapLayerId,
  getVectorSourceLayerForMapLayer,
  PUBLIC_LAND_VECTOR_SOURCE_LAYER,
  SOIL_FILL_PAINT,
  SOIL_STATE_CODES,
  soilMvtSourceLayerId,
  SURFACE_WATER_FLOWLINE_VECTOR_SOURCE_LAYER,
  SURFACE_WATER_VECTOR_SOURCE_LAYER,
  WETLANDS_VECTOR_SOURCE_LAYER,
} from '../components/map/mapStyles';
import { useMapContext } from './MapContext'; // Adjust path as needed
import { useUser } from "../contexts/UserContext";
import useMapboxDraw from "../hooks/useMapboxDraw";
import queryString from 'query-string';
import DraggableLegend from '../components/map/printShapes/DraggableLegend';
import DraggableNote from '../components/map/printShapes/DraggableNote';
import CompassElement from '../components/map/printShapes/CompassElement';
import RectangleElement from '../components/map/printShapes/RectangleElement';
import DiamondElement from '../components/map/printShapes/Diamond';
import TriangleElement from '../components/map/printShapes/Triangle';
import ShapeElement from '../components/map/printShapes/ShapeElement'
import { svgMap } from '../components/map/printShapes/svgMap';
import { getPointIconDefaultStyle } from './print/pointIconDefaultStyles';
import { legends } from '../assets/legends';
import { layerNameMappings } from '../components/map/layerMappings';
import MobileSearch from '../components/map/MobileSearch';
import MapReportBuilderBar from '../components/map/MapReportBuilderBar';
import { isNativeApp } from '../utils/platformDetection';
import { useTutorialWalkthrough } from '../contexts/TutorialWalkthroughContext';
import { Geolocation } from '@capacitor/geolocation';
import {
  POLYGON_VARIANT_STYLES,
  POLYLINE_VARIANT_STYLES,
  parsePrintPlacementTool,
} from './print/annotationModel';
import {
  segmentIndexTowardTip,
  arrowHeadPolygon,
  transmissionTickSegments,
} from './print/polylineDecorationUtils';
import PrintFeatureEditPanel from './print/PrintFeatureEditPanel';
import PrintMapLabel from '../components/map/printShapes/PrintMapLabel';
import { buildMapLabelDisplayText, labelUsesGeoOffset } from './print/mapLabelUtils';
import {
  getRegridParcelBoundaryCoordinates,
  mergeRegridParcelFeaturesPreferApi,
  isRegridParcelPolygonFeature,
} from '../utils/regridParcelBoundary';
import { rewriteRegridTileUrlToProxy } from '../config/regridApi';
import { fetchRegridParcelTileJson } from '../services/regridService';
import { fetchParcelGeoJsonFeatureByLlUuid } from '../utils/regridParcelApi';
import {
  getRegridVectorMinZoomForMap,
  REGRID_VECTOR_MIN_ZOOM_SPARSE,
} from '../utils/regridParcelTileDensity';
import {
  ensureRegridZoningTileJson,
  getCachedRegridZoningTileJson,
  getRegridZoningSourceLayerId,
  getRegridZoningTileUrls,
  REGRID_ZONING_TILE_FILL_COLOR,
} from '../utils/regridZoningTileLayer';
import {
  featuresShareSelectionId,
  getHostedFeatureClickId,
  resolveHostedMapLayerFromFeature,
} from '../utils/hostedMapLayerConfig';
import {
  PRINT_GALLERY_DRAG_MIME,
  takePrintGalleryDragPayload,
} from '../utils/printGalleryDragBuffer';
import { getPhotoSrcListFromElement } from '../utils/mapPhotoStorage';
import {
  focusPrintElementBirdEye,
  isPropertyBoundaryPrintElement,
  rankPrintElementsWithPhotos,
} from '../utils/propertyTourSlides';

/** Route Regrid MVT requests through our Cloud Function tile proxy (no client token). */
function ensureRegridTileProxyUrl(templateUrl) {
  return rewriteRegridTileUrlToProxy(templateUrl);
}
mapboxgl.accessToken = String(process.env.REACT_APP_MAPBOX_ACCESS_TOKEN || '').trim();

/** Hosted PMTiles archive for Public Land (Mapbox GL ≥3.21 uses HTTPS + ``.pmtiles`` extension). */
const PUBLIC_LAND_PMTILES_ARCHIVE_URL =
  (typeof process !== 'undefined' &&
    String(process.env.REACT_APP_PUBLIC_LAND_PMTILES_ARCHIVE_URL || '').trim()) ||
  'https://storage.googleapis.com/community_view_layers/tiles/padus_fee_z7_z14.pmtiles';

function isVectorPmtilesArchiveUrl(template) {
  return (
    typeof template === 'string' &&
    /^https:\/\/.+\.pmtiles(\?|#|$)/i.test(template)
  );
}

// Helper function to get Martin server URL based on environment
// On device/simulator connecting via network, use Mac's IP address; on desktop browser, use localhost
const getMartinServerUrl = () => {
  // Always use HTTPS through nginx proxy (no port needed - HTTPS default is 443)
  return 'https://34.10.19.103.nip.io';
};

function pointToSegmentDistanceSq(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lenSq = dx * dx + dy * dy || 1;
  let t = ((px - x1) * dx + (py - y1) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  const nx = x1 + t * dx;
  const ny = y1 + t * dy;
  const ddx = px - nx;
  const ddy = py - ny;
  return ddx * ddx + ddy * ddy;
}

/** Minimum squared screen distance from (px,py) to a closed geo ring (WGS84). */
function minSqDistanceToPolygonRingScreen(map, ring, px, py) {
  if (!map || !Array.isArray(ring) || ring.length < 2) return Infinity;
  let minSq = Infinity;
  const n = ring.length;
  for (let j = 0; j < n - 1; j++) {
    const a = map.project(ring[j]);
    const b = map.project(ring[j + 1]);
    if (!a || !b || !Number.isFinite(a.x) || !Number.isFinite(b.x)) continue;
    minSq = Math.min(minSq, pointToSegmentDistanceSq(px, py, a.x, a.y, b.x, b.y));
  }
  return minSq;
}

function isPrintParcelBoundaryPolygon(el) {
  return (
    el?.type === 'polygon' &&
    (el?.mapStyleVariant === 'boundary' || el?.label === 'Property Boundary')
  );
}

/** Catalog point tools: follow cursor before click to place. */
function isPrintShapeIconPlacingTool(tool) {
  return typeof tool === 'string' && tool.startsWith('shape_');
}

/** Scale on-screen print controls when zoomed out so they stay readable. */
function getPrintPixelScale(map) {
  if (!map || typeof map.getZoom !== 'function') return 1;
  const z = map.getZoom();
  const t = Math.max(0, Math.min(1, (12.5 - z) / 10));
  return 0.48 + (1.38 - 0.48) * t;
}

// URLs for vector tile layers (Martin tile server + GCS)
/** Per-layer zoom limits for vector archives (otherwise defaults apply in `updateLayers`). */
const vectorTileLayerZoom = {
  conservation_easements: { minzoom: 7, maxzoom: 14 },
  public_land: { minzoom: 7, maxzoom: 14 },
  soil: { minzoom: 12, maxzoom: 14 },
  surface_water: { minzoom: 12, maxzoom: 14 },
  wetlands: { minzoom: 12, maxzoom: 14 },
  boundaries_counties: { minzoom: 7, maxzoom: 14 },
  boundaries_congressional: { minzoom: 7, maxzoom: 14 },
  boundaries_places: { minzoom: 7, maxzoom: 14 },
  boundaries_urban_areas: { minzoom: 7, maxzoom: 14 },
  boundaries_tribal_lands: { minzoom: 7, maxzoom: 14 },
  opportunity_zones: { minzoom: 7, maxzoom: 14 },
  principal_aquifers: { minzoom: 7, maxzoom: 14 },
  transmission_lines: { minzoom: 7, maxzoom: 14 },
};

const tileLayerUrls = {
  conservation_easements:
    'https://storage.googleapis.com/community_view_layers/tiles/nced_z7_z14.pmtiles',
  public_land: PUBLIC_LAND_PMTILES_ARCHIVE_URL,
  soil: 'https://storage.googleapis.com/community_view_layers/tiles/soil_v20260501_113041_z12_z14.pmtiles',
  surface_water:
    'https://storage.googleapis.com/community_view_layers/tiles/surface_water_v20260501_113041_z12_z14.pmtiles',
  wetlands:
    'https://storage.googleapis.com/community_view_layers/tiles/wetlands_us49_z12_z14.pmtiles',
  boundaries_counties:
    'https://storage.googleapis.com/community_view_layers/tiles/boundaries_us_counties_z7_z14.pmtiles',
  boundaries_congressional:
    'https://storage.googleapis.com/community_view_layers/tiles/boundaries_us_congressional_z7_z14.pmtiles',
  boundaries_places:
    'https://storage.googleapis.com/community_view_layers/tiles/boundaries_us_places_z7_z14.pmtiles',
  boundaries_urban_areas:
    'https://storage.googleapis.com/community_view_layers/tiles/boundaries_us_urban_areas_z7_z14.pmtiles',
  boundaries_tribal_lands:
    'https://storage.googleapis.com/community_view_layers/tiles/boundaries_us_tribal_lands_z7_z14.pmtiles',
  opportunity_zones:
    'https://storage.googleapis.com/community_view_layers/tiles/opportunity_zones_us_z7_z14.pmtiles',
  principal_aquifers:
    'https://storage.googleapis.com/community_view_layers/tiles/principal_aquifers_us_z7_z14.pmtiles',
  transmission_lines:
    'https://storage.googleapis.com/community_view_layers/tiles/transmission_lines_hifld_us_z7_z14.pmtiles',
};

/** Raster PMTiles overlays (PNG/WebP tiles — not queryable MVT). */
const rasterTileLayerUrls = {
  wildfire_hazard:
    'https://storage.googleapis.com/community_view_layers/tiles/wildfire_hazard_whp2023_cls_conus_z7_z14.pmtiles',
};

const rasterTileLayerZoom = {
  wildfire_hazard: { minzoom: 7, maxzoom: 14 },
};

function getHostedTileLayerUrl(layerName) {
  return tileLayerUrls[layerName] ?? rasterTileLayerUrls[layerName] ?? null;
}

function isRasterHostedTileLayer(layerName) {
  return Boolean(rasterTileLayerUrls[layerName]);
}

function tileLayerMapLayersPresent(map, layerName) {
  if (!map) return false;
  if (layerName === 'soil') {
    return SOIL_STATE_CODES.some((code) => map.getLayer(getSoilMapLayerId(code)));
  }
  if (layerName === 'surface_water') {
    return Boolean(
      map.getLayer('surface_water-layer') || map.getLayer('surface_water-flowline-layer')
    );
  }
  if (layerName === 'conservation_easements') {
    return Boolean(
      map.getLayer('conservation_easements-layer') ||
        map.getLayer('conservation_easements-outline-layer')
    );
  }
  return Boolean(map.getLayer(`${layerName}-layer`));
}

function addSoilStateLayers(map, beforeId) {
  SOIL_STATE_CODES.forEach((code) => {
    const layerId = getSoilMapLayerId(code);
    if (map.getLayer(layerId)) return;
    map.addLayer(
      {
        id: layerId,
        type: 'fill',
        source: 'soil',
        'source-layer': soilMvtSourceLayerId(code),
        paint: SOIL_FILL_PAINT,
        layout: { visibility: 'visible' },
      },
      beforeId
    );
  });
}

function setTileLayerVisibility(map, layerName, visibility) {
  if (layerName === 'soil') {
    SOIL_STATE_CODES.forEach((code) => {
      const layerId = getSoilMapLayerId(code);
      if (map.getLayer(layerId)) {
        map.setLayoutProperty(layerId, 'visibility', visibility);
      }
    });
    return;
  }
  if (layerName === 'surface_water') {
    ['surface_water-layer', 'surface_water-flowline-layer'].forEach((layerId) => {
      if (map.getLayer(layerId)) {
        map.setLayoutProperty(layerId, 'visibility', visibility);
      }
    });
    return;
  }
  if (layerName === 'conservation_easements') {
    ['conservation_easements-layer', 'conservation_easements-outline-layer'].forEach((layerId) => {
      if (map.getLayer(layerId)) {
        map.setLayoutProperty(layerId, 'visibility', visibility);
      }
    });
    return;
  }
  const layerId = `${layerName}-layer`;
  if (map.getLayer(layerId)) {
    map.setLayoutProperty(layerId, 'visibility', visibility);
  }
}

function getQueryLayerIdsForTileLayer(layerName, map) {
  if (layerName === 'soil') {
    return SOIL_STATE_CODES.map(getSoilMapLayerId).filter((id) => map.getLayer(id));
  }
  if (layerName === 'surface_water') {
    return ['surface_water-layer', 'surface_water-flowline-layer'].filter((id) => map.getLayer(id));
  }
  if (layerName === 'conservation_easements') {
    return ['conservation_easements-layer', 'conservation_easements-outline-layer'].filter((id) =>
      map.getLayer(id)
    );
  }
  const single = `${layerName}-layer`;
  return map.getLayer(single) ? [single] : [];
}

/** Whether a clicked/rendered feature belongs to a map layer toggle id (e.g. `ownership`, `public_land`). */
function featureBelongsToMapLayer(feature, layerName) {
  if (!feature || !layerName) return false;
  if (layerName === 'ownership') {
    return isRegridParcelPolygonFeature(feature);
  }
  if (layerName === 'soil') {
    const lid = feature.layer?.id;
    return typeof lid === 'string' && lid.startsWith('soil-');
  }
  if (layerName === 'surface_water') {
    const lid = feature.layer?.id;
    return lid === 'surface_water-layer' || lid === 'surface_water-flowline-layer';
  }
  if (layerName === 'conservation_easements') {
    const lid = feature.layer?.id;
    return lid === 'conservation_easements-layer' || lid === 'conservation_easements-outline-layer';
  }
  const lid = feature.layer?.id;
  if (lid === `${layerName}-layer`) return true;
  if (feature.source === layerName) return true;
  return false;
}

/** Prefer the most recently toggled visible non-ownership layer when multiple features overlap. */
function pickClickedFeature(features, prioritizedLayerNames, includeOwnershipFallback = false) {
  if (!Array.isArray(features) || features.length === 0) return null;

  const orderedLayers = Array.isArray(prioritizedLayerNames)
    ? [...new Set(prioritizedLayerNames.filter(Boolean))].reverse()
    : [];

  for (const layerName of orderedLayers) {
    const match = features.find((feature) => featureBelongsToMapLayer(feature, layerName));
    if (match) return match;
  }

  if (includeOwnershipFallback) {
    const ownershipFeature = features.find((feature) => featureBelongsToMapLayer(feature, 'ownership'));
    if (ownershipFeature) return ownershipFeature;
  }

  return features[0] || null;
}

/** Same layer ids as custom imagery / ortho rasters — module scope for layer stack helpers. */
const REGRID_OVERLAY_RASTER_LAYER_IDS = ['high-def-3inch-layer', 'teton-ortho-2024-layer', 'esri-world-imagery-layer'];

const SATELLITE_STREETS_OVERLAY_SOURCE_ID = 'satellite-streets-overlay-source';
const SATELLITE_STREETS_OVERLAY_LAYER_ID = 'satellite-streets-overlay-layer';
const STREETS_OVERLAY_SOURCE_ID = 'streets-overlay-source';
const STREETS_OVERLAY_LAYER_ID = 'streets-overlay-layer';
const ESRI_WORLD_IMAGERY_LAYER_ID = 'esri-world-imagery-layer';

/** Basemap rasters that must sit below hosted data + parcel layers. */
const MANAGED_BASEMAP_RASTER_LAYER_IDS = [
  ...REGRID_OVERLAY_RASTER_LAYER_IDS,
  ESRI_WORLD_IMAGERY_LAYER_ID,
  SATELLITE_STREETS_OVERLAY_LAYER_ID,
  STREETS_OVERLAY_LAYER_ID,
];

function hasVisibleManagedBasemapRaster(map) {
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

function isRasterLayerVisible(map, layerId) {
  if (!map?.getLayer?.(layerId)) return false;
  try {
    return map.getLayoutProperty(layerId, 'visibility') !== 'none';
  } catch (_) {
    return false;
  }
}

/** Outdoors landcover/hillshade still visible on top of Esri imagery when apply failed. */
function hasVisibleMapboxStyleUnderlay(map) {
  if (!map?.getStyle) return false;
  try {
    return (map.getStyle().layers || []).some((layer) => {
      const id = layer?.id || '';
      if (!id || id === 'background' || layer.type === 'symbol') return false;
      if (REGRID_OVERLAY_RASTER_LAYER_IDS.includes(id)) return false;
      if (
        id === ESRI_WORLD_IMAGERY_LAYER_ID ||
        id === SATELLITE_STREETS_OVERLAY_LAYER_ID ||
        id === STREETS_OVERLAY_LAYER_ID
      ) {
        return false;
      }
      if (id.startsWith('gl-draw-') || id.includes('regrid') || id.endsWith('-layer')) return false;
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
function verifyBasemapAppliedOnMap(map, basemapId) {
  if (!map?.isStyleLoaded?.()) return false;
  const id = String(basemapId || '').trim();
  if (!id) return false;

  if (id === 'imagery' || id === 'imagery-3d' || id === 'esri-world-imagery') {
    // Esri raster visible is enough — underlay check false-negatives during zoom/layer churn.
    return isRasterLayerVisible(map, ESRI_WORLD_IMAGERY_LAYER_ID);
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

/**
 * True when overlay rasters or outdoors underlay no longer match the selected basemap
 * (e.g. Discover landcover visible on top of Imagery after zoom / ownership restack).
 */
function needsBasemapOverlayMaintenance(map, basemapId) {
  if (!map?.isStyleLoaded?.()) return false;
  const id = String(basemapId || '').trim();
  if (!id) return false;

  if (id === 'imagery' || id === 'imagery-3d' || id === 'esri-world-imagery') {
    return (
      !isRasterLayerVisible(map, ESRI_WORLD_IMAGERY_LAYER_ID) ||
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

function stackRasterBasemapAboveBackground(map, layerId) {
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

function isDarkImageryBasemap(basemapId) {
  const id = String(basemapId || '')
    .trim()
    .toLowerCase();
  if (!id) return false;
  if (id.includes('imagery') || id.includes('satellite') || id.includes('ortho')) return true;
  if (id.startsWith('high-def')) return true;
  if (id === 'esri-world-imagery') return true;
  return false;
}

/** Tune Mapbox composite labels for light vs dark basemaps (Satellite / Imagery / Discover). */
function applyCompositeLabelStyleForBasemap(map, basemapId) {
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

/**
 * Match `updateLayers` MVT placement: Mapbox GL v3 composite/slot styles can leave vector tiles
 * stale until a zoom change if layers are only appended with no `beforeId`. Public land uses this.
 */
function getVectorLayerInsertBeforeId(map) {
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
function restackDataLayersAboveBasemapOverlays(map) {
  if (!map?.getStyle || !hasVisibleManagedBasemapRaster(map)) return;
  const ids = (map.getStyle().layers || [])
    .map((layer) => layer.id)
    .filter((id) => {
      if (MANAGED_BASEMAP_RASTER_LAYER_IDS.includes(id)) return false;
      if (id.includes('regrid')) return false;
      if (id.endsWith('-layer') || id.startsWith('soil-')) return true;
      return id.startsWith('gl-draw-');
    });
  ids.forEach((id) => {
    try {
      map.moveLayer(id);
    } catch (_) {
      /* ignore */
    }
  });
}

/** Default map view when URL has no lat/lng/zoom (Nebraska — Regrid-focused area). */
const DEFAULT_MAP_VIEW = {
  center: [-97.60393, 40.52867],
  zoom: 13.935488214211315,
};

/** Default basemap when URL has no `basemap` param — outdoors, labeled "Discover" in UI. */
const DEFAULT_BASEMAP_ID = 'outdoors-v12';
const PERSISTENT_BASE_STYLE_ID = 'outdoors-v12';

/** The four basemap options exposed in the UI. */
const SUPPORTED_BASEMAP_IDS = new Set([
  'outdoors-v12',
  'imagery',
  'satellite-streets-v12',
  'streets-v11',
]);

/** Map legacy / alias URL values to a supported basemap id. */
const BASEMAP_ID_ALIASES = {
  discover: 'outdoors-v12',
  outdoors: 'outdoors-v12',
  satellite: 'satellite-streets-v12',
  streets: 'streets-v11',
  'imagery-3d': 'imagery',
  'esri-world-imagery': 'imagery',
};

function normalizeBasemapId(raw) {
  const id = String(raw || '').trim().toLowerCase();
  if (!id) return DEFAULT_BASEMAP_ID;
  if (BASEMAP_ID_ALIASES[id]) return BASEMAP_ID_ALIASES[id];
  if (SUPPORTED_BASEMAP_IDS.has(id)) return id;
  return DEFAULT_BASEMAP_ID;
}

/** Read `basemap` from the live browser URL (authoritative on refresh / new tab). */
function getBasemapIdFromSearch(search) {
  const params = queryString.parse(search || '');
  const fromUrl = params.basemap != null ? String(params.basemap).trim() : '';
  return normalizeBasemapId(fromUrl);
}

/** Module-level basemap id for Regrid paint helpers (updated from Map component). */
const regridStyleBasemapRef = { current: DEFAULT_BASEMAP_ID };

/** TileJSON from Regrid — cached so basemap/style swaps do not re-fetch over the network. */
let cachedRegridTileJson = null;

/** Active MVT source/layer minzoom — sparse (10) vs dense metro (13). See regridParcelTileDensity.js. */
let activeRegridVectorMinZoom = REGRID_VECTOR_MIN_ZOOM_SPARSE;

function removeRegridParcelLayersAndSource(map) {
  if (!map) return;
  try {
    ['regrid-parcels-outline', 'regrid-parcels-layer'].forEach((id) => {
      if (map.getLayer(id)) map.removeLayer(id);
    });
    if (map.getSource('regrid-parcels')) map.removeSource('regrid-parcels');
  } catch (_) {
    /* style may be mid-swap */
  }
}

/** Full teardown — basemap style swap or ownership toggled off only. */
function removeRegridParcelStack(map) {
  removeRegridParcelLayersAndSource(map);
}

/**
 * Regrid TileJSON often puts MVT templates on `vector` (not `tiles`). Prefer `vector` when present.
 * @see https://support.regrid.com/api/using-the-tileserver-api
 */
/** MVT tile templates from TileJSON (`vector` preferred). */
function getRegridTileUrls(tileJson) {
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
function getRegridVectorSourceLayerId(tileJson) {
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

/**
 * Add Regrid MVT source + layers when TileJSON is known — same synchronous moment as Martin
 * layers in `updateLayers` (mirrors public_land: source exists before stack reorder / idle).
 */
function addRegridParcelLayersFromTileJson(
  map,
  tileJson,
  vectorMinZoom = activeRegridVectorMinZoom
) {
  const tileUrls = getRegridTileUrls(tileJson);
  if (!map?.addSource || !tileUrls.length) return;
  if (map.getSource('regrid-parcels')) {
    const mapZoom = typeof map.getZoom === 'function' ? map.getZoom() : activeRegridVectorMinZoom;
    if (mapZoom >= activeRegridVectorMinZoom) {
      forceRegridParcelsSourceRefresh(map, tileUrls);
    }
    return;
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

  applyRegridParcelOutlineForBasemap(map, regridStyleBasemapRef.current);

  // Source/layer minzoom blocks fetch below threshold — skip reload until zoom is in range.
  const mapZoom = typeof map.getZoom === 'function' ? map.getZoom() : vectorMinZoom;
  if (mapZoom >= vectorMinZoom) {
    forceRegridParcelsSourceRefresh(map, tileUrls);
  }
}

/** Rebuild MVT stack when map center moves between sparse/dense geofences (source minzoom must change). */
function rebuildRegridParcelStackForDensity(map, vectorMinZoom) {
  if (!map?.isStyleLoaded?.() || !cachedRegridTileJson) return;
  if (vectorMinZoom === activeRegridVectorMinZoom && map.getSource('regrid-parcels')) return;
  try {
    removeRegridParcelLayersAndSource(map);
  } catch (_) {
    /* ignore */
  }
  addRegridParcelLayersFromTileJson(map, cachedRegridTileJson, vectorMinZoom);
}

function removeRegridZoningTileStack(map) {
  if (!map) return;
  try {
    ['regrid-zoning-tiles-outline', 'regrid-zoning-tiles-fill'].forEach((id) => {
      if (map.getLayer(id)) map.removeLayer(id);
    });
    if (map.getSource('regrid-zoning-tiles')) map.removeSource('regrid-zoning-tiles');
  } catch (_) {
    /* style may be mid-swap */
  }
}

function getRegridZoningInsertBeforeId(map) {
  if (map?.getLayer?.('regrid-parcels-layer')) return 'regrid-parcels-layer';
  return getVectorLayerInsertBeforeId(map);
}

function addRegridZoningLayersFromTileJson(map, tileJson, vectorMinZoom = activeRegridVectorMinZoom) {
  const tileUrls = getRegridZoningTileUrls(tileJson);
  if (!map?.addSource || !tileUrls.length) return;
  if (map.getSource('regrid-zoning-tiles')) return;

  activeRegridVectorMinZoom = vectorMinZoom;
  const sourceLayerId = getRegridZoningSourceLayerId(tileJson);
  const insertBeforeId = getRegridZoningInsertBeforeId(map);
  const tileMaxZoom = tileJson.maxzoom || 21;

  map.addSource('regrid-zoning-tiles', {
    type: 'vector',
    tiles: tileUrls,
    minzoom: vectorMinZoom,
    maxzoom: tileMaxZoom,
  });

  map.addLayer(
    {
      id: 'regrid-zoning-tiles-fill',
      type: 'fill',
      source: 'regrid-zoning-tiles',
      'source-layer': sourceLayerId,
      paint: {
        'fill-color': REGRID_ZONING_TILE_FILL_COLOR,
        'fill-opacity': 0.42,
        'fill-outline-color': REGRID_ZONING_TILE_FILL_COLOR,
      },
      layout: { visibility: 'visible' },
      minzoom: vectorMinZoom,
      maxzoom: tileMaxZoom,
    },
    insertBeforeId
  );

  map.addLayer(
    {
      id: 'regrid-zoning-tiles-outline',
      type: 'line',
      source: 'regrid-zoning-tiles',
      'source-layer': sourceLayerId,
      paint: {
        'line-color': REGRID_ZONING_TILE_FILL_COLOR,
        'line-width': ['interpolate', ['linear'], ['zoom'], 10, 0.25, 14, 0.6, 17, 1.0],
        'line-opacity': 0.85,
      },
      layout: { visibility: 'visible', 'line-join': 'round', 'line-cap': 'round' },
      minzoom: vectorMinZoom,
      maxzoom: tileMaxZoom,
    },
    'regrid-zoning-tiles-fill'
  );
}

function rebuildRegridZoningStackForDensity(map, vectorMinZoom) {
  const tileJson = getCachedRegridZoningTileJson();
  if (!map?.isStyleLoaded?.() || !tileJson || !map.getSource('regrid-zoning-tiles')) return;
  try {
    removeRegridZoningTileStack(map);
  } catch (_) {
    /* ignore */
  }
  addRegridZoningLayersFromTileJson(map, tileJson, vectorMinZoom);
}

function syncRegridZoningLayersIntoMap(map, enabled) {
  if (!map?.isStyleLoaded?.()) return;
  if (!enabled) {
    removeRegridZoningTileStack(map);
    return;
  }
  const vectorMinZoom = getRegridVectorMinZoomForMap(map);
  const tileJson = getCachedRegridZoningTileJson();
  if (!tileJson) return;
  if (map.getSource('regrid-zoning-tiles')) {
    if (vectorMinZoom !== activeRegridVectorMinZoom) {
      rebuildRegridZoningStackForDensity(map, vectorMinZoom);
    }
    return;
  }
  addRegridZoningLayersFromTileJson(map, tileJson, vectorMinZoom);
}

function setRegridZoningLayersVisibility(map, visible) {
  if (!map) return;
  const vis = visible ? 'visible' : 'none';
  ['regrid-zoning-tiles-fill', 'regrid-zoning-tiles-outline'].forEach((id) => {
    if (map.getLayer(id)) {
      try {
        map.setLayoutProperty(id, 'visibility', vis);
      } catch (_) {
        /* ignore */
      }
    }
  });
}

/**
 * Regrid is not in `tileLayerUrls`. Mirror `forceVectorTileSourceRefresh` by calling `setTiles` with
 * the TileJSON template list so the tile pyramid invalidates after `setStyle`.
 */
function forceRegridParcelsSourceRefresh(map, tilesOverride) {
  if (!map) return;
  try {
    const src = map.getSource('regrid-parcels');
    if (!src) return;
    const tiles = tilesOverride || getRegridTileUrls(cachedRegridTileJson);
    // `setTiles` assigns URLs and calls `reload()` internally — same pattern as Martin MVT.
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
 * Tile requests are gated by source/layer `minzoom` (10 sparse / 13 dense) — never remove or
 * hide layers based on current map zoom, so Mapbox can fetch MVT tiles as soon as zoom allows.
 */
function syncRegridParcelLayersIntoMap(map, parcelMapVisibility) {
  if (!map?.isStyleLoaded?.()) return;
  if (!parcelMapVisibility?.showRegrid) return;

  const vectorMinZoom = getRegridVectorMinZoomForMap(map);
  if (!cachedRegridTileJson) return;

  if (!map.getSource('regrid-parcels')) {
    addRegridParcelLayersFromTileJson(map, cachedRegridTileJson, vectorMinZoom);
  } else if (vectorMinZoom !== activeRegridVectorMinZoom) {
    rebuildRegridParcelStackForDensity(map, vectorMinZoom);
  }
}

/** Fired after Mapbox Draw (or others) add layers post–style.load so we can re-pin Regrid. */
const CV_REGRID_RESTACK_EVENT = 'cv:regrid-restack';

function fireRegridRestack(map) {
  try {
    if (map && typeof map.fire === 'function') {
      map.fire(CV_REGRID_RESTACK_EVENT);
    }
  } catch (_) {
    /* ignore */
  }
}

/** One restack after basemap — triple fire caused repeated hide/show + bumpZoom flicker. */
function schedulePostBasemapRegridRestack(mapRef) {
  requestAnimationFrame(() => fireRegridRestack(mapRef?.current));
}

/** First composite/style symbol layer — Regrid sits directly below this, then `bringLabelsToTop` pins all labels above data. */
function getFirstSymbolLayerId(map) {
  if (!map?.getStyle) return undefined;
  try {
    const firstSym = (map.getStyle().layers || []).find((layer) => layer.type === 'symbol');
    return firstSym ? firstSym.id : undefined;
  } catch (_) {
    return undefined;
  }
}

/**
 * Raise Regrid above hosted MVT fills but below Mapbox composite labels (and custom label layers).
 * Must not use bare `moveLayer(id)` — that hoists parcels above basemap symbols until the user pans.
 */
function bringRegridParcelLayersBeforeSymbolLabels(map) {
  if (!map) return;
  const beforeId = getFirstSymbolLayerId(map);
  [
    'regrid-zoning-tiles-fill',
    'regrid-zoning-tiles-outline',
    'regrid-parcels-layer',
    'regrid-parcels-outline',
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
function setRegridParcelLayersVisibility(map, visible) {
  if (!map) return;
  const vis = visible ? 'visible' : 'none';
  ['regrid-parcels-layer', 'regrid-parcels-outline'].forEach((id) => {
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
function applyParcelVisualizationVisibility(map, { showRegrid }) {
  if (!map) return;
  setRegridParcelLayersVisibility(map, Boolean(showRegrid));
}

function flushMapRepaintAfterLayerChange(map) {
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
function nudgeVectorTileSource(map, sourceId) {
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
const layerStatusLiveRef = { current: {} };
const parcelShowRegridLiveRef = { current: false };

/** Regrid MVT: sync visibility + nudge tile cache after ownership turns on (no full setTiles reload). */
function repaintRegridParcelsAfterShow(map, attempt = 0) {
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
function repaintTileLayerAfterTurnedOn(map, layerName) {
  if (!map?.isStyleLoaded?.()) return;
  if (layerName === 'ownership') {
    repaintRegridParcelsAfterShow(map);
    return;
  }
  if (layerName === 'regrid_zoning') {
    if (!map.getSource('regrid-zoning-tiles')) return;
    setRegridZoningLayersVisibility(map, false);
    requestAnimationFrame(() => {
      if (!layerStatusLiveRef.current?.regrid_zoning) return;
      setRegridZoningLayersVisibility(map, true);
      nudgeVectorTileSource(map, 'regrid-zoning-tiles');
      flushMapRepaintAfterLayerChange(map);
    });
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

function repaintLayersTurnedOn(map, layerStatus, turnedOnLayerNames, { regridFreshlyAdded = false } = {}) {
  if (!map?.isStyleLoaded?.()) return;
  const names = new Set(turnedOnLayerNames || []);
  if (regridFreshlyAdded) names.add('ownership');
  if (names.size === 0) return;
  names.forEach((layerName) => repaintTileLayerAfterTurnedOn(map, layerName));
}

/**
 * Reloads the internal tile pyramid for a source (separate from `VectorTileSource#reload()`).
 * Needed after `setStyle` when tiles still do not repopulate until a user zoom.
 */
function reloadVectorSourceTileCaches(map, sourceId) {
  if (!map || !sourceId) return;
  try {
    const st = map.style;
    if (!st || typeof st.getSourceCache !== 'function') return;
    const cache = st.getSourceCache(sourceId);
    if (cache && typeof cache.reload === 'function') {
      cache.reload();
    }
    if (typeof st.updateSourceCaches === 'function') {
      st.updateSourceCaches();
    }
  } catch (_) {
    /* style may be mid-swap */
  }
}

/** `reload()` + `setTiles(same)` + tile-cache reload — some style swaps need all three. */
function forceVectorTileSourceRefresh(map, sourceId) {
  if (!map || !sourceId) return;
  try {
    const src = map.getSource(sourceId);
    if (!src) return;
    if (typeof src.reload === 'function') {
      src.reload();
    }
    const spec = getHostedTileLayerUrl(sourceId);
    if (spec && isVectorPmtilesArchiveUrl(spec) && typeof src.setUrl === 'function') {
      src.setUrl(spec);
    } else if (spec && typeof src.setTiles === 'function') {
      src.setTiles([spec]);
    }
    reloadVectorSourceTileCaches(map, sourceId);
  } catch (_) {
    /* source may be mid-style */
  }
}

function reloadTileSources(map, sourceIds, includeRegridParcels) {
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
function scheduleDeferredTileRefresh(map, mutatedSourceIds, includeRegridParcels) {
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

/**
 * Verbose diagnostics (sourcedata + finishLayerStack snapshots).
 * Any of: localStorage / sessionStorage `cv_debug_ownership_tiles` = `1`
 * or URL contains `debugOwnershipTiles` (e.g. `?debugOwnershipTiles=1` or `&debugOwnershipTiles`).
 */
function isCvOwnershipTileDebugEnabled() {
  try {
    if (typeof window === 'undefined') return false;
    if (window.localStorage?.getItem('cv_debug_ownership_tiles') === '1') return true;
    if (window.sessionStorage?.getItem('cv_debug_ownership_tiles') === '1') return true;
    const href = String(window.location?.href || '');
    if (/[?&#]debugOwnershipTiles\b/i.test(href)) return true;
  } catch (_) {
    return false;
  }
  return false;
}

/** Short line, always logged — filter console with `[cv:ownership-tiles]`. */
function ownershipTilesTrace(phase, detail) {
  try {
    console.log('[cv:ownership-tiles]', phase, detail === undefined ? '' : detail);
  } catch (_) {
    /* ignore */
  }
}

function traceMapboxStyleSwap(context, styleUrl) {
  ownershipTilesTrace('basemap calling setStyle', { context, url: styleUrl });
}

/**
 * Legacy ownership diagnostics (kept for backward-compatible logs while migrating to Regrid-only parcels).
 */
function summarizeOwnershipTileState(map, phase, extra = {}, opts = {}) {
  const { always = false } = opts;
  if (!map) return;
  if (!always && !isCvOwnershipTileDebugEnabled()) return;
  const src = map.getSource?.('ownership');
  const hasLayer = Boolean(map.getLayer?.('regrid-parcels-layer'));
  let sourceFeatures = null;
  let renderedCount = null;
  try {
    if (src && map.querySourceFeatures) {
      sourceFeatures = map.querySourceFeatures('ownership')?.length ?? 0;
    }
  } catch (e) {
    sourceFeatures = `error: ${e?.message || e}`;
  }
  try {
    if (hasLayer && map.queryRenderedFeatures) {
      renderedCount = map.queryRenderedFeatures({ layers: ['regrid-parcels-layer'] })?.length ?? 0;
    }
  } catch (e) {
    renderedCount = `error: ${e?.message || e}`;
  }
  let srcLoaded;
  try {
    srcLoaded = src && typeof src.loaded === 'function' ? src.loaded() : undefined;
  } catch (_) {
    srcLoaded = undefined;
  }
  ownershipTilesTrace(phase, {
    zoom: typeof map.getZoom === 'function' ? map.getZoom() : undefined,
    mapLoaded: typeof map.loaded === 'function' ? map.loaded() : undefined,
    styleLoaded: typeof map.isStyleLoaded === 'function' ? map.isStyleLoaded() : undefined,
    hasSource: Boolean(src),
    hasOwnershipLayer: hasLayer,
    sourceLoaded: srcLoaded,
    querySourceFeatureCount: sourceFeatures,
    queryRenderedFeatureCount: renderedCount,
    ...extra,
  });
}

/** Default view when starting the interactive tour (matches map init when no URL params). */
const TUTORIAL_DEFAULT_VIEW = { center: DEFAULT_MAP_VIEW.center, zoom: DEFAULT_MAP_VIEW.zoom };
/** Fillmore County, NE — parcel-dense area for tour step “parcel-practice” (matches shareable map URL). */
const TUTORIAL_PARCEL_PRACTICE_VIEW = {
  center: [-97.61354, 40.5307],
  zoom: 16.147533670128382,
};

const MapPage = () => {

  // =============== Constants and Component Def ===============

  const {
    selectedFeature,
    setSelectedFeatures,
    layerStatus,
    setLayerStatus,
    GlobalActiveTab,
    setGlobalActiveTab,
    mapRef,
    applyTourPropertyBasemapRef,
    setMapRef,
    isGeoFilterActiveRef,
    isGeoFilterActive,
    setIsGeoFilterActive,
    isMapTriggeredFromSearch,
    setIsMapTriggeredFromSearch,
    focusFeatures,
    setFocusFeatures,
    hoveredFeatureId,
    layerOrder,
    setLayerOrder,
    isDrawingRef,
    suppressNextFeatureClickRef,
    drawRef,
    paperSize,
    isPrinting,
    showLegend,
    setShowLegend,
    updateNote,
    notes,
    deleteNote,
    activeTab,
    shapes,
    updateShape,
    deleteShape,
    printElements,
    updatePrintElement,
    deletePrintElement,
    layerLabels,
    toggleLayerLabels,
    clearLayerLabels,
    selectedPrintElement,
    setSelectedPrintElement,
    activePrintTool,
    setActivePrintTool,
    addPrintElementFromTool,
    setIsPrinting,
    propertyMapWizardActive,
    setPropertyMapWizardActive,
    propertyMapWizardIntent,
    setPropertyMapWizardIntent,
    clearPrintElements,
    shareViewerReadOnly,
    setShareViewerReadOnly,
    printLayoutMode,
    printLayoutRect,
    setPrintLayoutRect,
    currentBasemapId,
    setCurrentBasemapId,
    activeBasemapIdRef,
    pendingPrintBasemapRestoreRef,
  } = useMapContext();
  const routerLocation = useLocation();
  const prevPathForShareRef = useRef(routerLocation.pathname);
  const { isActive: tourActive, currentStep: tourStep, stepIndex: tourStepIndex, mode: tourMode } =
    useTutorialWalkthrough();

  const isClientShareMapRoute =
    routerLocation.pathname.startsWith('/view/') || routerLocation.pathname.startsWith('/tour/');
  const isPropertyTourRoute = routerLocation.pathname.startsWith('/tour/');
  const isBasemapTutorialStep = tourActive && tourMode === 'map' && tourStep?.id === 'basemap-control';

  /** Synced from SharedMapViewPage (`property-tour-slide` event) for orbit boundary-only overlay. */
  const [propertyTourSlideId, setPropertyTourSlideId] = useState(null);
  const tourBoundaryOnlyPrint =
    isClientShareMapRoute &&
    (propertyTourSlideId === 'context' || propertyTourSlideId === 'vicinity');

  const shouldRenderPrintElementOnMap = useCallback(
    (element) => {
      if (!element || element.hiddenOnMap) return false;
      if (!tourBoundaryOnlyPrint) return true;
      return isPropertyBoundaryPrintElement(element);
    },
    [tourBoundaryOnlyPrint]
  );

  useEffect(() => {
    const onTourSlide = (e) => {
      setPropertyTourSlideId(e.detail?.slideId ?? null);
    };
    window.addEventListener('property-tour-slide', onTourSlide);
    return () => {
      window.removeEventListener('property-tour-slide', onTourSlide);
      setPropertyTourSlideId(null);
    };
  }, []);

  useEffect(() => {
    const path = routerLocation.pathname || '';
    const shareLike = path.startsWith('/view/') || path.startsWith('/tour/');
    setShareViewerReadOnly(shareLike);
    const prev = prevPathForShareRef.current;
    const prevShareLike = prev.startsWith('/view/') || prev.startsWith('/tour/');
    if (prevShareLike && !shareLike) {
      clearPrintElements();
      setSelectedPrintElement(null);
      setIsPrinting(false);
      setActivePrintTool('select');
    }
    prevPathForShareRef.current = path;
  }, [
    routerLocation.pathname,
    clearPrintElements,
    setSelectedPrintElement,
    setIsPrinting,
    setActivePrintTool,
    setShareViewerReadOnly,
  ]);
  const [isPanelOpen, setIsPanelOpen] = useState(true); // State for toggling the side panel
  const [printSharePanelVisible, setPrintSharePanelVisible] = useState(false);

  useEffect(() => {
    const onSharePanelVisible = (e) => {
      setPrintSharePanelVisible(!!e.detail?.visible);
    };
    window.addEventListener('print-share-panel-visible', onSharePanelVisible);
    return () => window.removeEventListener('print-share-panel-visible', onSharePanelVisible);
  }, []);

  /** Map maker: collapse side panel for parcel wizard, print share, or print layout options. */
  useEffect(() => {
    if (!isPrinting) {
      setIsPanelOpen(true);
      return;
    }
    if (printSharePanelVisible || printLayoutMode) {
      setIsPanelOpen(false);
      return;
    }
    setIsPanelOpen(!propertyMapWizardActive);
  }, [isPrinting, propertyMapWizardActive, printSharePanelVisible, printLayoutMode]);
  const [activeSidePanelTab, setActiveSidePanelTab] = useState('layers'); // Manage active tab state
  /** Print / map builder: hide Regrid parcel vectors without toggling Ownership in Layers. */
  const [printParcelsOverlayVisible, setPrintParcelsOverlayVisible] = useState(true);

  /** Click handler effect does not depend on isPrinting; use a ref for correct tab when selecting parcels. */
  const isPrintingRef = useRef(isPrinting);
  useEffect(() => {
    isPrintingRef.current = isPrinting;
  }, [isPrinting]);

  useEffect(() => {
    if (!tourActive || tourMode !== 'map' || !tourStep) return;
    const id = tourStep.id;
    if (id === 'side-info' || id === 'info-details') {
      setActiveSidePanelTab('info');
    }
    if (id === 'side-layers') {
      setActiveSidePanelTab('info');
    }
    if (id === 'public-land-layer') {
      setActiveSidePanelTab('layers');
    }
  }, [tourActive, tourMode, tourStep]);
  const tutorialParcelPracticeCenteredRef = useRef(false);

  useEffect(() => {
    if (!tourActive || !tourStep) {
      tutorialParcelPracticeCenteredRef.current = false;
      return;
    }
    if (tourStep.id !== 'parcel-practice') {
      tutorialParcelPracticeCenteredRef.current = false;
      return;
    }
    if (tutorialParcelPracticeCenteredRef.current || !mapRef.current) return;

    const map = mapRef.current;
    const fly = () => {
      if (tutorialParcelPracticeCenteredRef.current) return;
      tutorialParcelPracticeCenteredRef.current = true;
      try {
        map.flyTo({
          center: TUTORIAL_PARCEL_PRACTICE_VIEW.center,
          zoom: TUTORIAL_PARCEL_PRACTICE_VIEW.zoom,
          duration: 1300,
          essential: true,
        });
      } catch (err) {
        console.warn('Tutorial parcel practice view:', err);
      }
    };

    if (typeof map.isStyleLoaded === 'function' && map.isStyleLoaded()) {
      fly();
      return;
    }
    map.once('style.load', fly);
  }, [tourActive, tourStep, mapRef]);

  const [overlayRenderVersion, setOverlayRenderVersion] = useState(0);
  const forceOverlaySyncUntilRef = useRef(0);
  const tabHiddenAtRef = useRef(0);
  const shareViewerReadOnlyRef = useRef(shareViewerReadOnly);
  shareViewerReadOnlyRef.current = shareViewerReadOnly;
  const [polygonDraftPoints, setPolygonDraftPoints] = useState([]);
  const [polygonCursorPoint, setPolygonCursorPoint] = useState(null);
  const [polylineDraftPoints, setPolylineDraftPoints] = useState([]);
  const [polylineCursorPoint, setPolylineCursorPoint] = useState(null);
  const polygonDraftPointsRef = useRef([]);
  const polylineDraftPointsRef = useRef([]);
  const lastPlacementCommitRef = useRef({ tool: null, lng: null, lat: null, at: 0 });
  const [hoveredPrintElementId, setHoveredPrintElementId] = useState(null);
  const [sharePhotoPopupElementId, setSharePhotoPopupElementId] = useState(null);
  const [sharePhotoPopupFullscreen, setSharePhotoPopupFullscreen] = useState(false);
  const [sharePhotoPopupIndex, setSharePhotoPopupIndex] = useState(0);
  const [sharePhotoPopupAnchorTick, setSharePhotoPopupAnchorTick] = useState(0);
  const [isAutoFillMapLoading, setIsAutoFillMapLoading] = useState(false);
  /** Viewport (client) pixels for label preview while `showLabelOnMap` is off — fixed offset above cursor. */
  const [hoveredPrintCursorOverlayPx, setHoveredPrintCursorOverlayPx] = useState(null);
  /** Map-canvas px for ghost icon while placing a `shape_*` tool (matches click → unproject math). */
  const [printIconPlaceCursorPx, setPrintIconPlaceCursorPx] = useState(null);
  /** Declared early so print-overlay effects can depend on it (must be above any use of mapIsReady). */
  const [mapIsReady, setMapIsReady] = useState(false);
  const wasPrintingRef = useRef(false);

  const isPolygonPlacingTool = (t) => t && (t === 'polygon' || t.startsWith('polygon_'));
  const isPolylinePlacingTool = (t) => t && (t.startsWith('polyline_') || t === 'arrow');
  const overlayRenderRafRef = useRef(null);
  const sharePhotoTouchStartXRef = useRef(null);
  /** Pending `sourcedata` listeners while waiting to add owner name labels — cleared on toggle-off. */
  const labelSourceWaitHandlersRef = useRef(new Map());
  const layerLabelsRef = useRef(layerLabels);
  useEffect(() => {
    layerLabelsRef.current = layerLabels;
  }, [layerLabels]);

  useEffect(() => {
    polygonDraftPointsRef.current = polygonDraftPoints;
  }, [polygonDraftPoints]);

  useEffect(() => {
    polylineDraftPointsRef.current = polylineDraftPoints;
  }, [polylineDraftPoints]);

  // =============== Regrid Tileserver API Integration ===============
  useEffect(() => {
    // Only auto-switch once when entering print mode.
    if (isPrinting && !wasPrintingRef.current) {
      setActiveSidePanelTab('print');
    }
    // When leaving print mode, clear lingering print tab selection.
    if (!isPrinting && wasPrintingRef.current && activeSidePanelTab === 'print') {
      setActiveSidePanelTab('layers');
    }
    wasPrintingRef.current = isPrinting;
  }, [isPrinting, activeSidePanelTab]);

  /** Keep print “Parcels” toggle aligned with the Layers ownership switch (except during parcel wizard). */
  useEffect(() => {
    if (!isPrinting || propertyMapWizardActive) return;
    setPrintParcelsOverlayVisible(Boolean(layerStatus.ownership));
  }, [isPrinting, layerStatus.ownership, propertyMapWizardActive]);

  useEffect(() => {
    if (!isPrinting || !mapIsReady || !mapRef?.current) return undefined;
    const map = mapRef.current;

    const shouldFlushOverlaySync = () =>
      shareViewerReadOnlyRef.current || Date.now() < forceOverlaySyncUntilRef.current;

    const bumpOverlayRender = () => {
      if (shouldFlushOverlaySync()) {
        flushSync(() => {
          setOverlayRenderVersion((prev) => prev + 1);
        });
        return;
      }
      setOverlayRenderVersion((prev) => prev + 1);
    };

    const handleOverlayRefreshRaf = () => {
      // Shared/tour: skip RAF coalescing — background tabs throttle rAF until gesture ends.
      if (shareViewerReadOnlyRef.current) {
        bumpOverlayRender();
        return;
      }
      if (overlayRenderRafRef.current) return;
      overlayRenderRafRef.current = window.requestAnimationFrame(() => {
        overlayRenderRafRef.current = null;
        bumpOverlayRender();
      });
    };

    const handleOverlayRefreshImmediate = () => bumpOverlayRender();

    const onMoveStart = () => {
      if (!tabHiddenAtRef.current) return;
      tabHiddenAtRef.current = 0;
      forceOverlaySyncUntilRef.current = Date.now() + 15000;
      bumpOverlayRender();
    };

    // "render" fires every map frame, which keeps geo overlays locked while
    // panning/zooming/rotating instead of jumping after interaction ends.
    map.on('render', handleOverlayRefreshRaf);
    map.on('movestart', onMoveStart);
    map.on('move', handleOverlayRefreshImmediate);
    map.on('zoom', handleOverlayRefreshImmediate);
    map.on('rotate', handleOverlayRefreshImmediate);
    map.on('pitch', handleOverlayRefreshImmediate);
    map.on('resize', handleOverlayRefreshImmediate);
    return () => {
      map.off('render', handleOverlayRefreshRaf);
      map.off('movestart', onMoveStart);
      map.off('move', handleOverlayRefreshImmediate);
      map.off('zoom', handleOverlayRefreshImmediate);
      map.off('rotate', handleOverlayRefreshImmediate);
      map.off('pitch', handleOverlayRefreshImmediate);
      map.off('resize', handleOverlayRefreshImmediate);
      if (overlayRenderRafRef.current) {
        window.cancelAnimationFrame(overlayRenderRafRef.current);
        overlayRenderRafRef.current = null;
      }
    };
  }, [isPrinting, mapIsReady, mapRef]);

  // Browser throttles RAF/timers while tab is hidden; force a quick resync on return.
  useEffect(() => {
    if (!isPrinting || !mapIsReady || !mapRef?.current) return undefined;
    const resumeTimeouts = [];
    const queue = (fn, ms) => {
      const id = window.setTimeout(fn, ms);
      resumeTimeouts.push(id);
    };

    const forceOverlayResync = () => {
      if (!mapRef?.current) return;
      tabHiddenAtRef.current = 0;
      forceOverlaySyncUntilRef.current = Date.now() + 30000;
      // Immediate sync first; delayed syncs catch post-visibility/layout settling.
      flushSync(() => {
        setOverlayRenderVersion((prev) => prev + 1);
      });
      try {
        mapRef.current.resize();
        if (typeof mapRef.current.triggerRepaint === 'function') {
          mapRef.current.triggerRepaint();
        }
      } catch (_) {
        /* ignore */
      }
      // Multi-pass bump handles cases where browser resumes timers/layout in phases.
      window.requestAnimationFrame(() => {
        setOverlayRenderVersion((prev) => prev + 1);
        window.requestAnimationFrame(() => {
          setOverlayRenderVersion((prev) => prev + 1);
        });
      });
      queue(() => {
        if (!mapRef?.current) return;
        mapRef.current.resize();
        mapRef.current.triggerRepaint?.();
        setOverlayRenderVersion((prev) => prev + 1);
      }, 80);
      queue(() => {
        if (!mapRef?.current) return;
        mapRef.current.resize();
        mapRef.current.triggerRepaint?.();
        setOverlayRenderVersion((prev) => prev + 1);
      }, 240);
      queue(() => {
        if (!mapRef?.current) return;
        mapRef.current.triggerRepaint?.();
        setOverlayRenderVersion((prev) => prev + 1);
      }, 600);
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        tabHiddenAtRef.current = Date.now();
        return;
      }
      forceOverlayResync();
    };
    const onWindowFocus = () => forceOverlayResync();
    const onPageShow = () => forceOverlayResync();

    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('focus', onWindowFocus);
    window.addEventListener('pageshow', onPageShow);
    return () => {
      resumeTimeouts.forEach((id) => window.clearTimeout(id));
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('focus', onWindowFocus);
      window.removeEventListener('pageshow', onPageShow);
    };
  }, [isPrinting, mapIsReady, mapRef]);

  useEffect(() => {
    if (!isPrinting) setPrintIconPlaceCursorPx(null);
  }, [isPrinting]);

  useEffect(() => {
    if (!isPrinting) return undefined;
    const onKeyDown = (event) => {
      if (!(event.key === 'Delete' || event.key === 'Backspace')) return;
      if (!selectedPrintElement?.id) return;
      const tag = document.activeElement?.tagName?.toLowerCase();
      const isTyping =
        tag === 'input' ||
        tag === 'textarea' ||
        document.activeElement?.isContentEditable;
      if (isTyping) return;
      event.preventDefault();
      deletePrintElement(selectedPrintElement.id);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isPrinting, selectedPrintElement, deletePrintElement]);

  useEffect(() => {
    if (!isPolygonPlacingTool(activePrintTool)) {
      setPolygonDraftPoints([]);
      setPolygonCursorPoint(null);
    }
    if (!isPolylinePlacingTool(activePrintTool)) {
      setPolylineDraftPoints([]);
      setPolylineCursorPoint(null);
    }
    if (!isPrintShapeIconPlacingTool(activePrintTool)) {
      setPrintIconPlaceCursorPx(null);
    }
  }, [activePrintTool]);

  useEffect(() => {
    if (!isPrinting || !mapRef.current) return undefined;
    if (!isPolygonPlacingTool(activePrintTool) && !isPolylinePlacingTool(activePrintTool)) return undefined;

    mapRef.current.doubleClickZoom.disable();
    return () => {
      if (mapRef.current) {
        mapRef.current.doubleClickZoom.enable();
      }
    };
  }, [isPrinting, activePrintTool, mapRef]);

  const projectPoint = (geometry) => {
    if (!geometry || geometry.type !== 'Point' || !mapRef.current) return null;
    const [lng, lat] = geometry.coordinates;
    const p = mapRef.current.project([lng, lat]);
    return { x: p.x, y: p.y };
  };

  const withGeoProjectedFrame = (element) => {
    if (!element?.geometry || !mapRef.current) return element;
    if (element.geometry.type === 'Point') {
      const p = projectPoint(element.geometry);
      if (!p) return element;
      const s = getPrintPixelScale(mapRef.current);
      const w = element.width || 80;
      const h = element.height || 80;
      const sw = w * s;
      const sh = h * s;
      return {
        ...element,
        x: p.x - sw / 2,
        y: p.y - sh / 2,
        screenWidth: sw,
        screenHeight: sh,
        printZoomScale: s,
      };
    }
    if (element.geometry.type === 'LineString') {
      const coords = element.geometry.coordinates;
      if (!Array.isArray(coords) || coords.length < 2) return element;
      const projectedLinePoints = coords.map((c) => {
        const pt = mapRef.current.project(c);
        return [pt.x, pt.y];
      });
      return {
        ...element,
        projectedLinePoints,
      };
    }
    if (element.geometry.type === 'Polygon') {
      const ring = element.geometry.coordinates?.[0];
      if (!Array.isArray(ring) || ring.length < 3) return element;
      const points = ring.map((coord) => mapRef.current.project(coord));
      return {
        ...element,
        projectedPolygonPoints: points.map((p) => [p.x, p.y]),
      };
    }
    return element;
  };

  const syncProjectedEditToGeo = (nextElement) => {
    if (!nextElement || !mapRef.current) return nextElement;

    if (nextElement.geometry?.type === 'Point') {
      const dw = nextElement.screenWidth ?? nextElement.width ?? 80;
      const dh = nextElement.screenHeight ?? nextElement.height ?? 80;
      const centerX = (nextElement.x || 0) + dw / 2;
      const centerY = (nextElement.y || 0) + dh / 2;
      const lngLat = mapRef.current.unproject([centerX, centerY]);
      return {
        ...nextElement,
        geometry: {
          type: 'Point',
          coordinates: [lngLat.lng, lngLat.lat],
        },
      };
    }

    return nextElement;
  };

  const getPolygonDraftStyle = () => {
    const parsed = parsePrintPlacementTool(activePrintTool);
    const style = POLYGON_VARIANT_STYLES[parsed.variant] || POLYGON_VARIANT_STYLES.general;
    return style;
  };

  const getPolylineDraftStyle = () => {
    if (activePrintTool === 'arrow') {
      return {
        stroke: '#d97706',
        strokeWidth: 3.5,
        lineDasharray: null,
        arrowHead: 'end',
        transmissionTicks: false,
        strokeLinecap: 'round',
      };
    }
    const parsed = parsePrintPlacementTool(activePrintTool);
    const style = POLYLINE_VARIANT_STYLES[parsed.variant] || POLYLINE_VARIANT_STYLES.stream;
    return {
      stroke: style.stroke,
      strokeWidth: style.strokeWidth,
      strokeOpacity: style.strokeOpacity ?? 1,
      lineDasharray: style.lineDasharray ?? null,
      arrowHead: style.arrowHead || 'none',
      transmissionTicks: !!style.transmissionTicks,
      strokeLinecap: style.strokeLinecap || 'round',
      ...(style.roadMarkingStroke
        ? {
            roadMarkingStroke: style.roadMarkingStroke,
            roadMarkingWidth: style.roadMarkingWidth,
            roadMarkingDasharray: style.roadMarkingDasharray,
            roadMarkingLinecap: style.roadMarkingLinecap || 'round',
          }
        : {}),
      ...(style.fenceOutlineStroke
        ? {
            fenceOutlineStroke: style.fenceOutlineStroke,
            fenceOutlineWidth: style.fenceOutlineWidth,
            fenceOutlineOpacity: style.fenceOutlineOpacity,
          }
        : {}),
    };
  };

  const getMetricsForPolygonLngLat = (lngLatPoints) => {
    if (!Array.isArray(lngLatPoints) || lngLatPoints.length < 3) return null;
    const ring = lngLatPoints.map((p) => [p.lng, p.lat]);
    const closed = [...ring, ring[0]];
    const polygonFeature = turf.polygon([closed]);
    const areaSqMeters = turf.area(polygonFeature);
    const perimeterMeters = turf.length(turf.lineString(closed), { units: 'kilometers' }) * 1000;
    return { areaSqMeters, perimeterMeters };
  };

  const getMetricsForLineLngLat = (lngLatPoints) => {
    if (!Array.isArray(lngLatPoints) || lngLatPoints.length < 2) return null;
    const coords = lngLatPoints.map((p) => [p.lng, p.lat]);
    const lengthMeters = turf.length(turf.lineString(coords), { units: 'kilometers' }) * 1000;
    return { lengthMeters };
  };

  const handleCreateBoundaryFromRegridParcel = async (feature) => {
    let geomFeature = feature;
    const ll = feature?.properties?.ll_uuid;
    if (ll) {
      const apiFeat = await fetchParcelGeoJsonFeatureByLlUuid(ll);
      if (apiFeat?.geometry) {
        geomFeature = { ...feature, geometry: apiFeat.geometry };
      }
    }
    const coords = getRegridParcelBoundaryCoordinates(geomFeature);
    if (!coords || coords.length < 3) return;
    if (!isPrinting) setIsPrinting(true);
    const metrics = getMetricsForPolygonLngLat(coords);
    const center = {
      lng: coords.reduce((s, c) => s + c.lng, 0) / coords.length,
      lat: coords.reduce((s, c) => s + c.lat, 0) / coords.length,
    };
    addPrintElementFromTool(
      'polygon_boundary',
      {
        coordinates: coords,
        metrics,
        label: 'Property Boundary',
        style: { fill: 'rgba(0, 0, 0, 0)', fillOpacity: 0 },
      },
      center
    );
    setActivePrintTool('select');
    setActiveSidePanelTab('print');
  };

  const handleAutoFillMapFromBoundary = async () => {
    if (isAutoFillMapLoading) return;
    const boundary = [...(printElements || [])]
      .reverse()
      .find((el) => el?.type === 'polygon' && (el?.mapStyleVariant === 'boundary' || el?.label === 'Property Boundary'));
    const ring = boundary?.geometry?.coordinates?.[0];
    if (!ring || ring.length < 4) {
      console.warn('Auto Fill Map: no boundary polygon found.');
      return;
    }

    let boundaryPolygon = null;
    try {
      boundaryPolygon = turf.polygon([ring]);
    } catch (_) {
      console.warn('Auto Fill Map: invalid boundary geometry.');
      return;
    }

    const safeIntersectPolygon = (polyA, polyB) => {
      if (!polyA || !polyB) return null;
      try {
        // Turf versions differ: some accept (a, b), others expect a FeatureCollection.
        const direct = turf.intersect(polyA, polyB);
        if (direct) return direct;
      } catch (_) {
        /* fall through */
      }
      try {
        return turf.intersect(turf.featureCollection([polyA, polyB]));
      } catch (_) {
        return null;
      }
    };

    const clipLineToBoundary = (line, polygon) => {
      if (!line || !polygon) return [];
      try {
        const boundaryLine = turf.polygonToLine(polygon);
        const split = turf.lineSplit(line, boundaryLine);
        const candidates = split?.features?.length ? split.features : [line];
        return candidates.filter((seg) => {
          const lenKm = turf.length(seg, { units: 'kilometers' });
          if (!Number.isFinite(lenKm) || lenKm <= 0) return false;
          const mid = turf.along(seg, lenKm / 2, { units: 'kilometers' });
          return turf.booleanPointInPolygon(mid, polygon);
        });
      } catch (_) {
        return [];
      }
    };

    const polygonPiecesFromGeometry = (geom) => {
      if (!geom) return [];
      if (geom.type === 'Polygon') return [geom.coordinates];
      if (geom.type === 'MultiPolygon') return geom.coordinates;
      return [];
    };

    /** Auto Fill roads default to the neutral gray road style. */
    const autoFillRoadToolAndLabel = () => ({
      tool: 'polyline_single_track',
      label: 'Road',
    });

    setIsAutoFillMapLoading(true);
    try {
      const latLngPairs = ring
        .slice(0, -1)
        .map((c) => `${Number(c[1]).toFixed(6)} ${Number(c[0]).toFixed(6)}`)
        .join(' ');
      if (!latLngPairs) return;

      const query = `
[out:json][timeout:25];
(
  way["highway"](poly:"${latLngPairs}");
  way["waterway"](poly:"${latLngPairs}");
  way["building"](poly:"${latLngPairs}");
  way["natural"="water"](poly:"${latLngPairs}");
);
out geom;
      `.trim();

      const response = await fetch('https://overpass-api.de/api/interpreter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
        body: `data=${encodeURIComponent(query)}`,
      });
      if (!response.ok) throw new Error(`Overpass error: ${response.status}`);
      const data = await response.json();
      const ways = (data?.elements || []).filter((e) => e?.type === 'way' && Array.isArray(e?.geometry));

      let added = 0;
      const MAX_FEATURES = 60;
      const pendingFeatures = [];
      let boundaryCenter = null;
      try {
        boundaryCenter = turf.centerOfMass(boundaryPolygon);
      } catch (_) {
        boundaryCenter = null;
      }
      for (const way of ways) {
        const coords = way.geometry.map((g) => ({ lng: g.lon, lat: g.lat }));
        if (coords.length < 2) continue;
        const first = coords[0];
        const last = coords[coords.length - 1];
        const isClosed =
          Math.abs(first.lng - last.lng) < 1e-8 && Math.abs(first.lat - last.lat) < 1e-8;

        const tags = way.tags || {};
        if (isClosed && coords.length >= 4) {
          const ringCoords = coords.map((c) => [c.lng, c.lat]);
          const normalizedRing =
            Math.abs(ringCoords[0][0] - ringCoords[ringCoords.length - 1][0]) < 1e-8 &&
            Math.abs(ringCoords[0][1] - ringCoords[ringCoords.length - 1][1]) < 1e-8
              ? ringCoords
              : [...ringCoords, ringCoords[0]];
          let rawPolygon;
          try {
            rawPolygon = turf.polygon([normalizedRing]);
          } catch (_) {
            continue;
          }
          const clipped = safeIntersectPolygon(rawPolygon, boundaryPolygon);
          const pieces = polygonPiecesFromGeometry(clipped?.geometry);
          if (!pieces.length) continue;

          const isBuilding = Boolean(tags.building);
          const isWater = tags.natural === 'water';
          for (const polyCoords of pieces) {
            const outer = Array.isArray(polyCoords?.[0]) ? polyCoords[0] : null;
            if (!outer || outer.length < 4) continue;
            const lngLat = outer.slice(0, -1).map(([lng, lat]) => ({ lng, lat }));
            if (lngLat.length < 3) continue;
            const metrics = getMetricsForPolygonLngLat(lngLat);
            const center = {
              lng: lngLat.reduce((s, c) => s + c.lng, 0) / lngLat.length,
              lat: lngLat.reduce((s, c) => s + c.lat, 0) / lngLat.length,
            };
            let buildingMeta = null;
            if (isBuilding) {
              const area = Number(metrics?.areaSqMeters || 0);
              let centroid = null;
              try {
                const poly = turf.polygon([outer]);
                centroid = turf.centerOfMass(poly);
              } catch (_) {
                centroid = null;
              }
              let distMeters = 999999;
              if (centroid && boundaryCenter) {
                try {
                  distMeters =
                    turf.distance(centroid, boundaryCenter, { units: 'kilometers' }) * 1000;
                } catch (_) {
                  distMeters = 999999;
                }
              }
              const buildingTag = String(tags.building || '').toLowerCase();
              const dwellingBoost =
                buildingTag === 'house' ||
                buildingTag === 'residential' ||
                buildingTag === 'detached' ||
                buildingTag === 'yes'
                  ? 1.25
                  : 1.0;
              // Prefer larger buildings nearer parcel center; slight boost for home-like tags.
              const homeScore = (Math.sqrt(Math.max(area, 1)) / (1 + distMeters * 0.01)) * dwellingBoost;
              buildingMeta = { homeScore };
            }

            pendingFeatures.push({
              tool: isWater ? 'polygon_water' : 'polygon_general',
              options: {
                coordinates: lngLat,
                metrics,
                label: isBuilding ? 'Barn/Shed' : isWater ? 'Water' : 'Area',
                style: isBuilding
                  ? { fill: '#d1d5db', fillOpacity: 0.25, stroke: '#6b7280', strokeWidth: 1.5 }
                  : undefined,
              },
              center,
              isBuilding,
              buildingMeta,
            });
          }
        } else {
          const line = turf.lineString(coords.map((c) => [c.lng, c.lat]));
          const clippedSegments = clipLineToBoundary(line, boundaryPolygon);
          const isRoad = Boolean(tags.highway);
          const roadSpec = isRoad ? autoFillRoadToolAndLabel() : null;
          for (const seg of clippedSegments) {
            const segCoords = (seg.geometry?.coordinates || []).map(([lng, lat]) => ({ lng, lat }));
            if (segCoords.length < 2) continue;
            const metrics = getMetricsForLineLngLat(segCoords);
            const center = segCoords[Math.floor(segCoords.length / 2)];
            pendingFeatures.push({
              tool: isRoad ? roadSpec.tool : 'polyline_stream',
              options: {
                coordinates: segCoords,
                metrics,
                label: isRoad ? roadSpec.label : 'Stream',
              },
              center,
              isBuilding: false,
              buildingMeta: null,
            });
          }
        }
      }

      // Pick one likely primary dwelling and relabel as Main Home.
      const buildingCandidates = pendingFeatures
        .map((f, idx) => ({ idx, ...f }))
        .filter((f) => f.isBuilding && Number.isFinite(f.buildingMeta?.homeScore));
      if (buildingCandidates.length > 0) {
        buildingCandidates.sort((a, b) => (b.buildingMeta.homeScore || 0) - (a.buildingMeta.homeScore || 0));
        const winnerIdx = buildingCandidates[0].idx;
        pendingFeatures[winnerIdx] = {
          ...pendingFeatures[winnerIdx],
          options: {
            ...pendingFeatures[winnerIdx].options,
            label: 'Barn/Shed',
            style: {
              ...(pendingFeatures[winnerIdx].options.style || {}),
              stroke: '#111827',
              strokeWidth: Math.max(2, Number(pendingFeatures[winnerIdx].options?.style?.strokeWidth || 1.5)),
            },
          },
        };

        // Add a dedicated point marker for the inferred primary dwelling.
        const homeCenter = pendingFeatures[winnerIdx].center;
        if (homeCenter && Number.isFinite(homeCenter.lng) && Number.isFinite(homeCenter.lat)) {
          pendingFeatures.push({
            tool: 'shape_houseChimney',
            options: {
              label: 'Main Home',
              fill: '#ffffff',
              stroke: '#111827',
              strokeWidth: 3,
              fillOpacity: 1,
              iconOpacity: 1,
              iconScale: 0.64,
              logoColor: '#111827',
            },
            center: homeCenter,
            isBuilding: false,
            buildingMeta: null,
          });
        }
      }

      for (const item of pendingFeatures) {
        if (added >= MAX_FEATURES) break;
        addPrintElementFromTool(item.tool, item.options, item.center);
        added += 1;
      }
      console.log(`Auto Fill Map: added ${added} features`);
    } catch (err) {
      console.error('Auto Fill Map failed:', err);
    } finally {
      setIsAutoFillMapLoading(false);
      setActivePrintTool('select');
      setActiveSidePanelTab('print');
    }
  };

  const hasBoundaryForAutoFill = useMemo(
    () =>
      (printElements || []).some(
        (el) =>
          el?.type === 'polygon' &&
          (el?.mapStyleVariant === 'boundary' || el?.label === 'Property Boundary') &&
          Array.isArray(el?.geometry?.coordinates?.[0]) &&
          el.geometry.coordinates[0].length >= 4
      ),
    [printElements]
  );

  /** Feature-geometry anchor for map labels (WGS84), independent of current zoom. */
  const getElementAnchorLngLat = (element) => {
    if (!element?.geometry) return null;
    const g = element.geometry;
    if (g.type === 'Point') {
      const [lng, lat] = g.coordinates || [];
      if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
      return { lng, lat };
    }
    if (g.type === 'LineString') {
      const coords = g.coordinates || [];
      if (!coords.length) return null;
      const mid = coords[Math.floor(coords.length / 2)];
      const [lng, lat] = mid;
      if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
      return { lng, lat };
    }
    if (g.type === 'Polygon') {
      const ring = g.coordinates?.[0];
      if (!ring?.length || ring.length < 4) return null;
      try {
        const poly = turf.polygon([ring]);
        const c = turf.centerOfMass(poly);
        const [lng, lat] = c.geometry.coordinates;
        if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
        return { lng, lat };
      } catch (_) {
        /* fall through */
      }
      const closed =
        ring.length > 1 &&
        ring[0][0] === ring[ring.length - 1][0] &&
        ring[0][1] === ring[ring.length - 1][1];
      const open = closed ? ring.slice(0, -1) : ring;
      if (open.length < 3) return null;
      const centroid = open.reduce(
        (acc, [lng, lat]) => ({ lng: acc.lng + lng, lat: acc.lat + lat }),
        { lng: 0, lat: 0 }
      );
      const lng = centroid.lng / open.length;
      const lat = centroid.lat / open.length;
      if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
      return { lng, lat };
    }
    return null;
  };

  /** Mapbox `project` / `e.point` are pixels in the map canvas space; `#notes-overlay` sits in `.map-geo-print-stack` over `#map` and uses the same coordinates. */
  const getElementAnchorScreenPosition = (element) => {
    if (!mapRef.current) return null;
    const ll = getElementAnchorLngLat(element);
    if (!ll) return null;
    const local = mapRef.current.project([ll.lng, ll.lat]);
    if (!local || !Number.isFinite(local.x) || !Number.isFinite(local.y)) return null;
    return local;
  };

  const getElementPhotoGallery = useCallback((element) => getPhotoSrcListFromElement(element), []);

  const isPhotoPointElement = useCallback(
    (element) =>
      !!element &&
      element.type === 'shape' &&
      element.geometry?.type === 'Point' &&
      getElementPhotoGallery(element).length > 0,
    [getElementPhotoGallery]
  );

  const currentSharePhotoElement = useMemo(
    () => printElements.find((el) => el.id === sharePhotoPopupElementId) || null,
    [printElements, sharePhotoPopupElementId]
  );
  const currentSharePhotoGallery = useMemo(
    () => getElementPhotoGallery(currentSharePhotoElement),
    [currentSharePhotoElement, getElementPhotoGallery]
  );

  /** Same ranking as the step-4 tour: home → garage → … for prev/next “place” navigation. */
  const shareViewerPhotoRanked = useMemo(
    () => rankPrintElementsWithPhotos(printElements),
    [printElements]
  );

  const currentSharePhotoCardStyle = useMemo(() => {
    if (!shareViewerReadOnly || !currentSharePhotoElement || !mapRef.current) return undefined;
    const anchor = getElementAnchorScreenPosition(currentSharePhotoElement);
    if (!anchor) return undefined;
    const rect = mapRef.current.getContainer?.().getBoundingClientRect?.();
    if (!rect) return undefined;
    const viewportX = rect.left + anchor.x;
    const viewportY = rect.top + anchor.y;
    return {
      left: `${Math.round(viewportX)}px`,
      top: `${Math.round(viewportY - 18)}px`,
    };
  }, [shareViewerReadOnly, currentSharePhotoElement, mapRef, sharePhotoPopupAnchorTick]);

  useEffect(() => {
    if (!currentSharePhotoGallery.length) {
      setSharePhotoPopupElementId(null);
      setSharePhotoPopupFullscreen(false);
      setSharePhotoPopupIndex(0);
      return;
    }
    setSharePhotoPopupIndex((prev) =>
      Math.max(0, Math.min(prev, currentSharePhotoGallery.length - 1))
    );
  }, [currentSharePhotoGallery]);

  const closeSharePhotoPopup = useCallback(() => {
    setSharePhotoPopupFullscreen(false);
    setSharePhotoPopupElementId(null);
    setSharePhotoPopupIndex(0);
  }, []);

  const stepSharePhotoPopup = useCallback(
    (delta) => {
      if (!currentSharePhotoGallery.length) return;
      setSharePhotoPopupIndex((prev) => {
        const len = currentSharePhotoGallery.length;
        return (prev + delta + len) % len;
      });
    },
    [currentSharePhotoGallery.length]
  );

  const stepSharePhotoFeature = useCallback(
    (delta) => {
      if (!shareViewerPhotoRanked || shareViewerPhotoRanked.length <= 1) return;
      const ids = shareViewerPhotoRanked.map((r) => r.element?.id).filter(Boolean);
      if (!ids.length) return;
      let idx = ids.findIndex((id) => String(id) === String(sharePhotoPopupElementId));
      if (idx < 0) idx = 0;
      const nextIdx = (idx + delta + ids.length) % ids.length;
      const nextEl = shareViewerPhotoRanked[nextIdx]?.element;
      if (!nextEl?.id) return;
      setSharePhotoPopupElementId(String(nextEl.id));
      setSharePhotoPopupIndex(0);
      setSharePhotoPopupAnchorTick((v) => (v + 1) % 100000);
      const map = mapRef.current;
      if (map) focusPrintElementBirdEye(map, nextEl);
    },
    [shareViewerPhotoRanked, sharePhotoPopupElementId, mapRef]
  );

  useEffect(() => {
    if (!shareViewerReadOnly || !sharePhotoPopupElementId || !mapRef.current) return undefined;
    const map = mapRef.current;
    const bump = () => setSharePhotoPopupAnchorTick((v) => (v + 1) % 100000);
    map.on('move', bump);
    map.on('zoom', bump);
    map.on('rotate', bump);
    map.on('pitch', bump);
    return () => {
      map.off('move', bump);
      map.off('zoom', bump);
      map.off('rotate', bump);
      map.off('pitch', bump);
    };
  }, [shareViewerReadOnly, sharePhotoPopupElementId, mapRef]);

  useEffect(() => {
    if (!shareViewerReadOnly) return undefined;
    const onSharedPhotoOpen = (evt) => {
      const elementId = evt?.detail?.elementId;
      const index = Number(evt?.detail?.index ?? 0);
      if (!elementId) return;
      setSharePhotoPopupElementId(String(elementId));
      setSharePhotoPopupFullscreen(false);
      setSharePhotoPopupIndex(Number.isFinite(index) ? Math.max(0, index) : 0);
      setSharePhotoPopupAnchorTick((v) => (v + 1) % 100000);
    };
    const onSharedPhotoClose = () => {
      closeSharePhotoPopup();
    };
    window.addEventListener('shared-photo-open', onSharedPhotoOpen);
    window.addEventListener('shared-photo-close', onSharedPhotoClose);
    return () => {
      window.removeEventListener('shared-photo-open', onSharedPhotoOpen);
      window.removeEventListener('shared-photo-close', onSharedPhotoClose);
    };
  }, [shareViewerReadOnly, closeSharePhotoPopup]);

  const pickPrintElementAtScreen = useCallback(
    (px, py) => {
      if (!mapRef.current || !isPrinting) return null;
      const map = mapRef.current;
      const lngLat = map.unproject([px, py]);
      const clickPt = turf.point([lngLat.lng, lngLat.lat]);
      for (let i = printElements.length - 1; i >= 0; i--) {
        const el = printElements[i];
        if (el?.hiddenOnMap) continue;
        if (!el?.geometry) continue;
        const g = el.geometry;
        if (g.type === 'Point') {
          const pr = withGeoProjectedFrame(el);
          const w = pr.screenWidth ?? pr.width ?? 80;
          const h = pr.screenHeight ?? pr.height ?? 80;
          if (px >= pr.x && px <= pr.x + w && py >= pr.y && py <= pr.y + h) return el;
        }
        if (g.type === 'Polygon' && g.coordinates?.[0]?.length) {
          const ring = g.coordinates[0];
          if (ring.length < 4) continue;
          try {
            if (isPrintParcelBoundaryPolygon(el)) {
              const sw = el.strokeWidth ?? 6;
              const thresh = Math.max(16, sw * 2.25);
              const threshSq = thresh * thresh;
              if (minSqDistanceToPolygonRingScreen(map, ring, px, py) <= threshSq) return el;
            } else {
              const poly = turf.polygon([ring]);
              if (turf.booleanPointInPolygon(clickPt, poly)) return el;
            }
          } catch (_) {
            /* invalid ring */
          }
        }
        if (g.type === 'LineString' && Array.isArray(g.coordinates) && g.coordinates.length >= 2) {
          let minSq = Infinity;
          for (let j = 0; j < g.coordinates.length - 1; j++) {
            const a = map.project(g.coordinates[j]);
            const b = map.project(g.coordinates[j + 1]);
            minSq = Math.min(
              minSq,
              pointToSegmentDistanceSq(px, py, a.x, a.y, b.x, b.y)
            );
          }
          if (minSq <= 14 * 14) return el;
        }
      }
      return null;
    },
    [printElements, isPrinting]
  );

  const zoomToPrintElement = useCallback((element) => {
    const map = mapRef.current;
    if (!map || !element?.geometry) return;
    const g = element.geometry;
    try {
      if (g.type === 'Polygon' && g.coordinates?.[0]?.length >= 4) {
        const bbox = turf.bbox(turf.polygon(g.coordinates));
        map.fitBounds(
          [
            [bbox[0], bbox[1]],
            [bbox[2], bbox[3]],
          ],
          { padding: 80, duration: 700, maxZoom: 18 }
        );
        return;
      }
      if (g.type === 'LineString' && g.coordinates?.length >= 2) {
        const bbox = turf.bbox(turf.lineString(g.coordinates));
        map.fitBounds(
          [
            [bbox[0], bbox[1]],
            [bbox[2], bbox[3]],
          ],
          { padding: 80, duration: 700, maxZoom: 18 }
        );
        return;
      }
      if (g.type === 'Point' && g.coordinates) {
        const [lng, lat] = g.coordinates;
        if (Number.isFinite(lng) && Number.isFinite(lat)) {
          map.flyTo({
            center: [lng, lat],
            zoom: Math.max(map.getZoom(), 16),
            duration: 600,
          });
        }
      }
    } catch (_) {
      /* ignore invalid geometry */
    }
  }, []);

  const handlePrintMapDragOver = useCallback(
    (e) => {
      if (!isPrinting) return;
      if (!e.dataTransfer?.types?.includes(PRINT_GALLERY_DRAG_MIME)) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
    },
    [isPrinting]
  );

  const handlePrintMapDrop = useCallback(
    (e) => {
      if (!isPrinting || !mapRef.current) return;
      const id = e.dataTransfer?.getData(PRINT_GALLERY_DRAG_MIME);
      const photoEntry = takePrintGalleryDragPayload(id);
      if (!photoEntry?.url) return;
      e.preventDefault();
      const map = mapRef.current;
      const rect = map.getCanvas().getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const lngLat = map.unproject([x, y]);
      addPrintElementFromTool(
        'shape_camera',
        { photoGallery: [photoEntry], label: 'Photo point' },
        { lng: lngLat.lng, lat: lngLat.lat }
      );
      setActivePrintTool('select');
    },
    [isPrinting, addPrintElementFromTool, setActivePrintTool]
  );

  /**
   * Sets up Regrid parcel tiles using the tileserver API
   * Uses vector tiles (MVT format) for better performance and automatic viewport coverage
   */
  const setupRegridTiles = useCallback(async () => {
    const map = mapRef.current;
    if (!map) return;

    try {
      let tileJson = cachedRegridTileJson;
      if (!tileJson) {
        tileJson = await fetchRegridParcelTileJson();
        cachedRegridTileJson = tileJson;
        console.log('✅ Got Regrid TileJSON (cached for later style reloads):', tileJson);
      }

      const vectorMinZoom = getRegridVectorMinZoomForMap(map);
      addRegridParcelLayersFromTileJson(map, tileJson, vectorMinZoom);
      if (map.getSource('regrid-parcels')) {
        console.log(`✅ Regrid MVT (min zoom ${vectorMinZoom} for current area)`);
      }
    } catch (error) {
      console.error('Error setting up Regrid tiles:', error);
    }
  }, [mapRef]);

  const [regridTileJsonVersion, setRegridTileJsonVersion] = useState(0);
  const [regridZoningTileJsonVersion, setRegridZoningTileJsonVersion] = useState(0);

  const parcelMapVisibility = useMemo(() => {
    const printHidesParcels =
      isPrinting && !printParcelsOverlayVisible && !propertyMapWizardActive;
    const own = Boolean(layerStatus.ownership);
    const wiz = propertyMapWizardActive;
    return {
      showRegrid: (own || wiz) && !printHidesParcels,
    };
  }, [isPrinting, printParcelsOverlayVisible, propertyMapWizardActive, layerStatus.ownership]);

  /** Latest visibility for async `style.load` / `idle` basemap callbacks (avoids stale closures). */
  const parcelMapVisibilityRef = useRef(parcelMapVisibility);
  parcelMapVisibilityRef.current = parcelMapVisibility;
  const prevParcelShowRegridRef = useRef(null);
  const prevLayerStatusForRepaintRef = useRef(null);
  const layerStatusRef = useRef(layerStatus);
  layerStatusRef.current = layerStatus;
  layerStatusLiveRef.current = layerStatus;
  parcelShowRegridLiveRef.current = Boolean(parcelMapVisibility.showRegrid);

  /** Prefetch TileJSON so `updateLayers` can add Regrid synchronously like Martin layers. */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (cachedRegridTileJson) {
        if (!cancelled) setRegridTileJsonVersion((v) => v + 1);
        return;
      }
      try {
        const tileJson = await fetchRegridParcelTileJson();
        if (cancelled) return;
        cachedRegridTileJson = tileJson;
        setRegridTileJsonVersion((v) => v + 1);
      } catch (e) {
        console.error('Regrid TileJSON prefetch failed:', e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  /** Prefetch Standardized Zoning custom MVT layer (POST /api/v1/sources). */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (getCachedRegridZoningTileJson()) {
        if (!cancelled) setRegridZoningTileJsonVersion((v) => v + 1);
        return;
      }
      try {
        await ensureRegridZoningTileJson();
        if (!cancelled) setRegridZoningTileJsonVersion((v) => v + 1);
      } catch (e) {
        console.error('Regrid zoning TileJSON prefetch failed:', e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (basemapRestoreBlockingLayersRef.current || basemapApplyInProgressRef.current) return;
    if (!mapIsReady || !mapRef?.current?.isStyleLoaded?.()) return;
    const map = mapRef.current;
    const showRegrid = Boolean(parcelMapVisibility.showRegrid);
    const regridShown = showRegrid && prevParcelShowRegridRef.current !== true;
    prevParcelShowRegridRef.current = showRegrid;
    syncRegridParcelLayersIntoMap(map, parcelMapVisibility);
    applyParcelVisualizationVisibility(map, parcelMapVisibility);
    if (showRegrid) {
      bringRegridParcelLayersBeforeSymbolLabels(map);
      fireRegridRestack(map);
    }
    if (regridShown) {
      requestAnimationFrame(() => {
        const m = mapRef.current;
        if (!m?.isStyleLoaded?.() || !parcelMapVisibilityRef.current?.showRegrid) return;
        syncRegridParcelLayersIntoMap(m, parcelMapVisibilityRef.current);
        applyParcelVisualizationVisibility(m, parcelMapVisibilityRef.current);
        repaintRegridParcelsAfterShow(m);
      });
    }
  }, [mapIsReady, propertyMapWizardActive, parcelMapVisibility, mapRef, regridTileJsonVersion]);

  const showRegridZoning = Boolean(layerStatus.regrid_zoning);

  useEffect(() => {
    if (basemapRestoreBlockingLayersRef.current || basemapApplyInProgressRef.current) return;
    if (!mapIsReady || !mapRef?.current?.isStyleLoaded?.()) return;
    const map = mapRef.current;

    if (!showRegridZoning) {
      removeRegridZoningTileStack(map);
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        if (!getCachedRegridZoningTileJson()) {
          await ensureRegridZoningTileJson();
        }
        if (cancelled || !mapRef.current) return;
        syncRegridZoningLayersIntoMap(mapRef.current, true);
        setRegridZoningLayersVisibility(mapRef.current, true);
        bringRegridParcelLayersBeforeSymbolLabels(mapRef.current);
      } catch (e) {
        console.error('Regrid zoning tiles setup failed:', e);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [mapIsReady, showRegridZoning, regridZoningTileJsonVersion, regridTileJsonVersion]);

  /** Rebuild parcel/zoning MVT when map center crosses sparse ↔ dense geofences (minzoom 10 vs 13). */
  useEffect(() => {
    if (!mapIsReady || !mapRef?.current) return undefined;
    const map = mapRef.current;
    let debounceId;
    const onMoveEnd = () => {
      if (!parcelMapVisibilityRef.current?.showRegrid) return;
      window.clearTimeout(debounceId);
      debounceId = window.setTimeout(() => {
        const m = mapRef.current;
        if (!m?.isStyleLoaded?.()) return;
        syncRegridParcelLayersIntoMap(m, parcelMapVisibilityRef.current);
        applyParcelVisualizationVisibility(m, parcelMapVisibilityRef.current);
        if (layerStatusRef.current?.regrid_zoning) {
          syncRegridZoningLayersIntoMap(m, true);
          setRegridZoningLayersVisibility(m, true);
        }
      }, 350);
    };
    map.on('moveend', onMoveEnd);
    return () => {
      window.clearTimeout(debounceId);
      try {
        map.off('moveend', onMoveEnd);
      } catch (_) {
        /* ignore */
      }
    };
  }, [mapIsReady, regridTileJsonVersion]);

  const navigate = useNavigate(); // Define navigate here
  const { subscriptionStatus, role, highlightSettings } = useUser(); // or subscriptionStatus & user
  
  // 🔍 DEBUG: Monitor highlightSettings changes
  useEffect(() => {
    console.log('🔍 highlightSettings changed in Map.js:', highlightSettings);
    console.log('🔍 highlightSettings.fillColor:', highlightSettings?.fillColor);
    console.log('🔍 highlightSettings.fillOpacity:', highlightSettings?.fillOpacity);
    console.log('🔍 highlightSettings.lineColor:', highlightSettings?.lineColor);
    
    // 🔍 Update the ref with current values
    highlightSettingsRef.current = highlightSettings;
  }, [highlightSettings]);
  
  const [topLayer, setTopLayer] = useState(null);
  const [isMapLoading, setIsMapLoading] = useState(true); // Map loading state
  const highlightLayerId = 'highlight-layer'; // ID for the highlight layer
  const highlightRenderTimeoutRef = useRef(null);
  const [selectedFilterPolygon, setSelectedFilterPolygon] = useState(null);
  const baseMapRef = useRef(DEFAULT_BASEMAP_ID);
  const currentStyleUrlRef = useRef(null);
  const [is3DEnabled, setIs3DEnabled] = useState(false);
  const is3DEnabledRef = useRef(false);
  const [isContoursEnabled, setIsContoursEnabled] = useState(false);

  // 🔍 Store current highlightSettings in a ref to access from callbacks
  const highlightSettingsRef = useRef(highlightSettings);
  const [basemap, setBasemap] = useState(DEFAULT_BASEMAP_ID);
  const [initialHighlightIds, setInitialHighlightIds] = useState(null);
  /** Last basemap fully applied on the map (layers + ref), not just requested in context. */
  const lastAppliedBasemapRef = useRef(null);
  /** While applying a saved basemap, block URL updates that would write stale outdoors-v12. */
  const restoringPrintBasemapRef = useRef(false);
  /** True while handleSetImageryBasemap / style swap is in flight (prevents duplicate apply effect). */
  const basemapApplyInProgressRef = useRef(false);
  /** Bumped when a new basemap is chosen so stale async imagery callbacks are ignored. */
  const basemapApplyGenerationRef = useRef(0);
  /** Latest ensureImagery impl (map init effect mounts before function defs — use ref). */
  const ensureImageryBasemapRef = useRef(() => {});
  /** Lightweight overlay fix — no setStyle (avoids flipping to Discover on zoom/layer churn). */
  const repairBasemapOverlaysRef = useRef(() => false);
  /** One full applyBasemapById on first ready; after that only repair overlays. */
  const needsInitialBasemapApplyRef = useRef(true);
  /** Basemap id from URL at map init — authoritative until first verified apply. */
  const urlBasemapIdRef = useRef(null);
  /** False until the live map stack matches urlBasemapIdRef / activeBasemapIdRef. */
  const initialBasemapRestoreCompleteRef = useRef(false);
  /** Tracks last applied `?basemap=` for back/forward URL changes. */
  const prevUrlBasemapRef = useRef(null);
  /** While restoring a saved print map, defer layerStatus→updateLayers until basemap finishes. */
  const basemapRestoreBlockingLayersRef = useRef(false);

  useEffect(() => {
    is3DEnabledRef.current = is3DEnabled;
  }, [is3DEnabled]);

  const publishBasemapSelection = useCallback(
    (id) => {
      const next = String(id || '').trim() || DEFAULT_BASEMAP_ID;
      if (pendingPrintBasemapRestoreRef) pendingPrintBasemapRestoreRef.current = null;
      baseMapRef.current = next;
      if (activeBasemapIdRef) activeBasemapIdRef.current = next;
      regridStyleBasemapRef.current = next;
      setBasemap(next);
      setCurrentBasemapId(next);
      applyRegridParcelOutlineForBasemap(mapRef.current, next);
    },
    [setCurrentBasemapId, activeBasemapIdRef, pendingPrintBasemapRestoreRef]
  );
  /** Saved map / share load sets `currentBasemapId` in context first — mirror UI label only. */
  useEffect(() => {
    const wanted = String(currentBasemapId || '').trim();
    if (!wanted || wanted === basemap) return;
    setBasemap(wanted);
  }, [currentBasemapId, basemap]);

  /** Parcel outlines: white on imagery/satellite, black on light basemaps. */
  useEffect(() => {
    if (!mapIsReady || !mapRef.current?.isStyleLoaded?.()) return;
    const id = activeBasemapIdRef?.current || baseMapRef.current || basemap;
    regridStyleBasemapRef.current = id;
    applyRegridParcelOutlineForBasemap(mapRef.current, id);
  }, [basemap, currentBasemapId, mapIsReady]);

  useEffect(() => {
    if (!mapIsReady || !mapRef.current || !isPrinting) return undefined;
    const map = mapRef.current;
    const onMapClick = (e) => {
      if (activePrintTool && activePrintTool !== 'select') return;
      const { x, y } = e.point;
      const picked = pickPrintElementAtScreen(x, y);
      if (shareViewerReadOnly) {
        if (isPhotoPointElement(picked)) {
          setSharePhotoPopupElementId(picked.id);
          setSharePhotoPopupFullscreen(false);
          setSharePhotoPopupIndex(0);
        } else if (sharePhotoPopupElementId) {
          closeSharePhotoPopup();
        }
        return;
      }
      setSelectedPrintElement(picked);
    };
    map.on('click', onMapClick);
    return () => {
      map.off('click', onMapClick);
    };
  }, [
    mapIsReady,
    isPrinting,
    activePrintTool,
    pickPrintElementAtScreen,
    setSelectedPrintElement,
    shareViewerReadOnly,
    isPhotoPointElement,
    sharePhotoPopupElementId,
    closeSharePhotoPopup,
  ]);

  /**
   * Draw polygons/polylines using map events so the overlay can use pointer-events: none
   * and scroll/wheel zoom reaches the map canvas.
   */
  useEffect(() => {
    if (!mapIsReady || !mapRef.current || !isPrinting) return undefined;
    const map = mapRef.current;
    if (!activePrintTool || activePrintTool === 'select') return undefined;
    if (!isPolygonPlacingTool(activePrintTool) && !isPolylinePlacingTool(activePrintTool)) {
      return undefined;
    }

    const tool = activePrintTool;

    const onPlacementClick = (e) => {
      const oe = e.originalEvent;
      if (oe && oe.detail >= 2) return;
      const { lng, lat } = e.lngLat;
      if (isPolygonPlacingTool(tool)) {
        const next = [...polygonDraftPointsRef.current, { lng, lat }];
        polygonDraftPointsRef.current = next;
        setPolygonDraftPoints(next);
      } else {
        const next = [...polylineDraftPointsRef.current, { lng, lat }];
        polylineDraftPointsRef.current = next;
        setPolylineDraftPoints(next);
      }
    };

    const onPlacementDblClick = (e) => {
      e.preventDefault();
      const { lng, lat } = e.lngLat;
      const now = Date.now();
      const last = lastPlacementCommitRef.current;
      if (
        last.tool === tool &&
        Number.isFinite(last.lng) &&
        Number.isFinite(last.lat) &&
        now - last.at < 800 &&
        Math.abs(last.lng - lng) < 1e-7 &&
        Math.abs(last.lat - lat) < 1e-7
      ) {
        return;
      }
      if (isPolygonPlacingTool(tool)) {
        let coordinates = [...polygonDraftPointsRef.current];
        if (coordinates.length < 3) {
          coordinates = [...coordinates, { lng, lat }];
        }
        if (coordinates.length >= 3) {
          const metrics = getMetricsForPolygonLngLat(coordinates);
          addPrintElementFromTool(tool, { coordinates, metrics }, { lng, lat });
          lastPlacementCommitRef.current = { tool, lng, lat, at: now };
        }
        polygonDraftPointsRef.current = [];
        setPolygonDraftPoints([]);
        setPolygonCursorPoint(null);
        setActivePrintTool('select');
        return;
      }
      if (isPolylinePlacingTool(tool)) {
        let lngLatPoints = [...polylineDraftPointsRef.current];
        if (lngLatPoints.length < 2) {
          lngLatPoints = [...lngLatPoints, { lng, lat }];
        }
        if (lngLatPoints.length >= 2) {
          const metrics = getMetricsForLineLngLat(lngLatPoints);
          if (tool === 'arrow') {
            addPrintElementFromTool(
              'arrow',
              {
                coordinates: lngLatPoints.map((p) => [p.lng, p.lat]),
                metrics,
              },
              { lng, lat }
            );
          } else {
            addPrintElementFromTool(
              tool,
              { coordinates: lngLatPoints, metrics },
              { lng, lat }
            );
          }
          lastPlacementCommitRef.current = { tool, lng, lat, at: now };
        }
        polylineDraftPointsRef.current = [];
        setPolylineDraftPoints([]);
        setPolylineCursorPoint(null);
        setActivePrintTool('select');
      }
    };

    const onPlacementMouseMove = (e) => {
      const p = e.point;
      if (isPolygonPlacingTool(tool)) {
        setPolygonCursorPoint({ x: p.x, y: p.y });
      } else if (isPolylinePlacingTool(tool)) {
        setPolylineCursorPoint({ x: p.x, y: p.y });
      }
    };

    map.on('click', onPlacementClick);
    map.on('dblclick', onPlacementDblClick);
    map.on('mousemove', onPlacementMouseMove);

    return () => {
      map.off('click', onPlacementClick);
      map.off('dblclick', onPlacementDblClick);
      map.off('mousemove', onPlacementMouseMove);
    };
  }, [mapIsReady, isPrinting, activePrintTool, addPrintElementFromTool, setActivePrintTool]);

  /** Hover labels: map mousemove hit-tests features (SVG uses pointer-events:none when not selected). */
  useEffect(() => {
    if (!mapIsReady || !mapRef.current || !isPrinting) return undefined;
    const map = mapRef.current;
    let raf = null;
    const onMove = (e) => {
      if (raf != null) return;
      raf = requestAnimationFrame(() => {
        raf = null;
        const { x, y } = e.point;
        const picked = pickPrintElementAtScreen(x, y);
        setHoveredPrintElementId(picked?.id ?? null);
        setHoveredPrintCursorOverlayPx({ x, y });
      });
    };
    const onLeave = () => {
      setHoveredPrintElementId(null);
      setHoveredPrintCursorOverlayPx(null);
    };
    map.on('mousemove', onMove);
    const container = map.getContainer();
    container?.addEventListener('mouseleave', onLeave);
    return () => {
      map.off('mousemove', onMove);
      container?.removeEventListener('mouseleave', onLeave);
      if (raf != null) cancelAnimationFrame(raf);
    };
  }, [mapIsReady, isPrinting, pickPrintElementAtScreen]);

  useEffect(() => {
    if (!sharePhotoPopupFullscreen) return undefined;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [sharePhotoPopupFullscreen]);

  /** Share viewer: arrow keys move between places or photos (non-tour). In property tour, ← → are reserved for tour steps. */
  useEffect(() => {
    if (!shareViewerReadOnly || !sharePhotoPopupElementId) return undefined;
    const onKeyDown = (e) => {
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        if (typeof document !== 'undefined' && document.documentElement.classList.contains('shared-tour-mode')) {
          return;
        }
      }
      if (e.key === 'Escape') {
        if (sharePhotoPopupFullscreen) setSharePhotoPopupFullscreen(false);
        else closeSharePhotoPopup();
        return;
      }
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        const delta = e.key === 'ArrowRight' ? 1 : -1;
        if (shareViewerPhotoRanked.length > 1) {
          e.preventDefault();
          stepSharePhotoFeature(delta);
        } else if (currentSharePhotoGallery.length > 1) {
          e.preventDefault();
          stepSharePhotoPopup(delta);
        }
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [
    shareViewerReadOnly,
    sharePhotoPopupElementId,
    sharePhotoPopupFullscreen,
    shareViewerPhotoRanked.length,
    currentSharePhotoGallery.length,
    closeSharePhotoPopup,
    stepSharePhotoFeature,
    stepSharePhotoPopup,
  ]);

  useEffect(() => {
    if (!printLayoutMode || !mapRef.current) return;
    if (printLayoutRect && printLayoutRect.width >= 20 && printLayoutRect.height >= 20) return;
    const rect = mapRef.current.getCanvas().getBoundingClientRect();
    const w = Math.max(260, Math.round(rect.width * 0.62));
    const h = Math.max(200, Math.round(rect.height * 0.62));
    setPrintLayoutRect({
      x: Math.max(10, Math.round((rect.width - w) / 2)),
      y: Math.max(10, Math.round((rect.height - h) / 2)),
      width: Math.min(w, rect.width - 20),
      height: Math.min(h, rect.height - 20),
    });
  }, [printLayoutMode, mapRef, printLayoutRect, setPrintLayoutRect]);

  const activeLayers = Object.keys(layerStatus).filter((layer) => layerStatus[layer]);
  const legendItems = activeLayers
  .map((layerName) => {
    const items = legends[layerName];
    if (!items) return null;
    
    const displayName = layerNameMappings[layerName] || layerName;
    
    // Filter out items with empty labels, but keep items that have colors (for layers like ownership)
    const validItems = items.filter(item => {
      // Keep items that have a label, OR items that have a color (for layers that just show a color)
      return (item.label && item.label.trim() !== '') || item.color;
    });
    
    // If no valid items, skip this layer
    if (validItems.length === 0) return null;
    
    return (
      <div key={layerName}>
        <strong style={{ color: '#000000', fontWeight: 'bold' }}>{displayName}</strong>
        <ul style={{ paddingLeft: '1em' }}>
          {validItems.map((item, idx) => (
            <li key={idx} style={{ display: 'flex', alignItems: 'center', color: '#000000' }}>
              <span
                style={{
                  display: 'inline-block',
                  width: '14px',
                  height: '14px',
                  marginRight: '6px',
                  border: '1px solid #000',
                  backgroundColor: item.color,
                  opacity: item.opacity ?? 1,
                }}
              />
              {item.label || ''}
            </li>
          ))}
        </ul>
      </div>
    );
  })
  .filter(Boolean);

  
  /**
   *  =============== Map Initialization ===============
   *
   * Creates Mapbox map and and then after it's done loading sets loading bool
   * to false, setsMapRef in parent. Calls updateLayers which adds ownership becase
   * of it's hard coded True in parent layerStatus
   * @param {number} a - The first number.
   * @param {number} b - The second number.
   * @returns {number} The result of adding a and b.
   */
  useEffect(() => {
    console.log('Initializing Mapbox map...');
    // Use live browser URL — same source of truth as refresh / paste-into-new-tab.
    const params = queryString.parse(window.location.search);
    const effectiveBasemap = getBasemapIdFromSearch(window.location.search);
    console.log('Parsed URL Params:', params, 'effectiveBasemap:', effectiveBasemap);
    urlBasemapIdRef.current = effectiveBasemap;
    initialBasemapRestoreCompleteRef.current = false;
    needsInitialBasemapApplyRef.current = true;
    console.log('Setting basemap from URL:', effectiveBasemap);
    publishBasemapSelection(effectiveBasemap);
    // All four supported basemaps share one Mapbox style; overlays are applied after load.
    const initialStyle = PERSISTENT_BASE_STYLE_ID;
    // Initialize the Mapbox map
    currentStyleUrlRef.current = `mapbox://styles/mapbox/${initialStyle}`;
    mapRef.current = new mapboxgl.Map({
      container: 'map',
      style: `mapbox://styles/mapbox/${initialStyle}`,
      center:
        params.lat && params.lng
          ? [parseFloat(params.lng), parseFloat(params.lat)]
          : DEFAULT_MAP_VIEW.center,
      zoom: params.zoom ? parseFloat(params.zoom) : DEFAULT_MAP_VIEW.zoom,
      minZoom: 6,
      maxZoom: 19,
      maxPitch: 85,
      preserveDrawingBuffer: true,
      // Set up transformRequest globally to handle TMS coordinate conversion for high-def tiles
      transformRequest: (url, resourceType) => {
        try {
          // Convert URL to string if it's an object
          const urlStr = typeof url === 'string' ? url : (url?.url || url?.toString() || String(url));
          
          // Only transform Tile requests for our high-def tiles
          if (resourceType === 'Tile' && urlStr && urlStr.includes('tiles.regrid.com')) {
            const proxyUrl = ensureRegridTileProxyUrl(urlStr);
            if (proxyUrl !== urlStr) {
              return { url: proxyUrl };
            }
          }

          if (resourceType === 'Tile' && urlStr && urlStr.includes('teton_high_def_V2/tiles_all_3inch')) {
            // Extract z, x, y from URL pattern: .../{z}/{x}/{y}.png
            const urlMatch = urlStr.match(/tiles_all_3inch\/(\d+)\/(\d+)\/(\d+)\.png/);
            if (urlMatch) {
              const z = parseInt(urlMatch[1], 10);
              const x = parseInt(urlMatch[2], 10);
              const y_xyz = parseInt(urlMatch[3], 10); // This is XYZ Y from Mapbox
              
              // Convert XYZ Y to TMS Y (tiles stored in TMS format in GCS)
              const tmsY = Math.pow(2, z) - 1 - y_xyz;
              
              // Reconstruct URL with TMS Y coordinate
              const newUrl = urlStr.replace(
                `tiles_all_3inch/${z}/${x}/${y_xyz}.png`,
                `tiles_all_3inch/${z}/${x}/${tmsY}.png`
              );
              
              // Log all conversions, especially around the cutoff point
              if (z === 13 && y_xyz >= 2995) {
                console.log(`🔄 Tile conversion (zoom 13, near cutoff): z=${z}, x=${x}, XYZ Y=${y_xyz} -> TMS Y=${tmsY}`);
                console.log(`🔄 Original: ${urlStr}`);
                console.log(`🔄 Converted: ${newUrl}`);
              } else {
                console.log(`🔄 Tile conversion: z=${z}, x=${x}, XYZ Y=${y_xyz} -> TMS Y=${tmsY}`);
              }
              
              return { url: newUrl };
            } else {
              console.warn('⚠️ High-def tile URL did not match pattern:', urlStr);
            }
          }
          
          // For all other requests, return as-is
          return { url: urlStr };
          
        } catch (error) {
          console.error('❌ Error in transformRequest:', error);
          const urlStr = typeof url === 'string' ? url : (url?.url || url?.toString() || String(url));
          return { url: urlStr };
        }
      }
    });
  
    mapRef.current.on('load', () => {
      console.log('✅ Map loaded successfully.');
  
      if (!mapRef.current.hasImage('custom-pin')) {
        mapRef.current.loadImage('/pin_better.png', (error, image) => {
          if (error) {
            console.error("Error loading pin image:", error);
            return;
          }
          mapRef.current.addImage('custom-pin', image);
          console.log('✅ Custom pin added to map.');
        });
      }

      setIsMapLoading(false);
      setMapRef(mapRef.current);
  
      let newLayerStatus = {}; 
      let layerList = [];
      
      // Apply ?basemap= from URL once the style is ready (refresh / new tab / paste link).
      mapRef.current.once('idle', () => {
        const basemapId = getBasemapIdFromSearch(window.location.search);
        console.log('✅ Map idle — applying URL basemap:', basemapId);
        urlBasemapIdRef.current = basemapId;
        publishBasemapSelection(basemapId);

        const map = mapRef.current;
        if (!map?.isStyleLoaded?.()) return;

        const overlaysOk =
          verifyBasemapAppliedOnMap(map, basemapId) &&
          !needsBasemapOverlayMaintenance(map, basemapId);

        if (overlaysOk) {
          lastAppliedBasemapRef.current = basemapId;
          initialBasemapRestoreCompleteRef.current = true;
          needsInitialBasemapApplyRef.current = false;
          return;
        }

        initialBasemapRestoreCompleteRef.current = false;
        needsInitialBasemapApplyRef.current = true;
        applyBasemapByIdRef.current(basemapId);
      });
      window.mapRef = mapRef;
      window.updateExistingHighlights = updateExistingHighlights;
      // ✅ Step 2: Ensure Layers Are Loaded Before Querying Features
      const params = queryString.parse(routerLocation.search);
      if (params.highlights) {
        console.log("Set inital Higlights")
        setInitialHighlightIds(params.highlights.split(","));
      }
    });
  
    return () => {
      if (mapRef.current) {
        console.log('Cleaning up map and draw control...');
        mapRef.current.remove();
      }
    };
  }, []);

// Map is always full screen - no print cropping
const containerStyle = { width: '100vw', height: '100vh', position: 'absolute' };
const computedWidth = '100vw';
const computedHeight = '100vh';

  useEffect(() => {
    console.log("notes updated", notes);
  }, [notes]);

useEffect(() => {
  console.log("isPrinting updated", isPrinting);
}, [isPrinting]);

  /** WebGL map often prints blank until dimensions are synced with the print preview layout. */
  useEffect(() => {
    if (!mapIsReady || !mapRef.current) return undefined;
    const map = mapRef.current;
    const onBeforePrint = () => {
      try {
        map.resize();
        if (typeof map.triggerRepaint === 'function') map.triggerRepaint();
      } catch (_) {
        /* ignore */
      }
    };
    window.addEventListener('beforeprint', onBeforePrint);
    return () => window.removeEventListener('beforeprint', onBeforePrint);
  }, [mapIsReady, mapRef]);

  // =============== Regrid Parcel Tiles Setup ===============
  /**
   * Regrid MVT layers are removed on style reload; `updateLayers` + sync re-add with Martin layers.
   * Stack stays on map at all zoom levels when ownership is on — source/layer minzoom gates tile fetch.
   */
  useEffect(() => {
    if (!mapRef.current || !mapIsReady) return;

    const map = mapRef.current;

    const runEnsure = async () => {
      if (basemapRestoreBlockingLayersRef.current || basemapApplyInProgressRef.current) return;
      if (!mapRef.current) return;
      const m = mapRef.current;
      if (!m.loaded() || !m.isStyleLoaded()) return;

      const vis = parcelMapVisibilityRef.current ?? parcelMapVisibility;
      if (
        vis.showRegrid &&
        !m.getSource('regrid-parcels') &&
        !cachedRegridTileJson
      ) {
        await setupRegridTiles();
      }
      syncRegridParcelLayersIntoMap(m, vis);
      applyParcelVisualizationVisibility(m, vis);

      if (!mapRef.current) return;
      bringRegridParcelLayersBeforeSymbolLabels(mapRef.current);
      applyParcelVisualizationVisibility(mapRef.current, vis);
      fireRegridRestack(mapRef.current);
    };

    if (map.loaded() && map.isStyleLoaded()) {
      runEnsure();
    } else {
      map.once('idle', runEnsure);
    }

    window.updateRegridParcels = runEnsure;

    return () => {
      delete window.updateRegridParcels;
    };
  }, [mapRef, mapIsReady, setupRegridTiles, parcelMapVisibility]);

  
  /**
   * Helper function to get the appropriate identifier for a feature
   * by determining which layer it belongs to and extracting the correct identifier
   */
  const getFeatureIdentifierFromFeature = useCallback((feature) => {
    if (!feature || !feature.properties) {
      return null;
    }

    const props = feature.properties;
    
    // Determine which layer this feature belongs to by checking GFI first (ownership)
    if (props.GFI) {
      return props.GFI;
    }
    
    // For ownership features with pidn
    if (props.pidn) {
      return props.pidn;
    }
    
    // For public_land features
    if (props.OBJECTID && !props.precinct && !props.FLD_AR_ID) {
      return props.OBJECTID;
    }
    
    // For precinct features
    if (props.precinct) {
      return props.precinct;
    }
    
    // For FEMA features
    if (props.FLD_AR_ID) {
      return props.FLD_AR_ID;
    }
    
    // For conservation easements and other features with Name
    if (props.Name) {
      return props.Name;
    }
    
    // Fallback to OBJECTID
    if (props.OBJECTID) {
      return props.OBJECTID;
    }
    
    return null;
  }, []);

  useEffect(() => {  
    const updateUrl = () => {
      console.log("Updating URL");
      if (restoringPrintBasemapRef.current) return;
      if (!mapRef.current) return; // Prevent errors if mapRef is not set
      // Public client routes use their own URLs; never replace ?tour=1 or /tour/:token with map ?lat=&lng=…
      try {
        const p = window.location?.pathname || '';
        if (p.startsWith('/view/') || p.startsWith('/tour/')) return;
      } catch {
        /* ignore */
      }

      const center = mapRef.current.getCenter();
      const zoom = mapRef.current.getZoom();
      
      // Get identifiers for all selected features
      const highlights = selectedFeature
        .map((feature) => getFeatureIdentifierFromFeature(feature))
        .filter(Boolean) // Removes null/undefined values
        .join(',');
        
      const newParams = queryString.stringify({
        lat: center.lat.toFixed(5),
        lng: center.lng.toFixed(5),
        zoom: zoom,
        highlights,
        layers: layerOrder.join(','), // ✅ Track layer order
        basemap: normalizeBasemapId(activeBasemapIdRef?.current || baseMapRef.current)
      });
      if (routerLocation.search === `?${newParams}`) return;
      navigate({ pathname: routerLocation.pathname, search: newParams }, { replace: true });
    };
  
    // Attach updateUrl to map movement
    mapRef.current.on('moveend', updateUrl);
  
    // ✅ Also call `updateUrl` immediately when `selectedFeature` or `layerOrder` changes
    updateUrl();
  
    return () => {
      mapRef.current.off('moveend', updateUrl);
    };
  }, [layerOrder, selectedFeature, navigate, getFeatureIdentifierFromFeature, routerLocation.search]);
  


useEffect(() => {
  if (!mapRef.current) return;
  
  // If the style is *already* loaded
  if (mapRef.current.isStyleLoaded()) {
    setMapIsReady(true);
    return;
  }

  // Otherwise, wait for style.load or idle
  const handleStyle = () => {
    setMapIsReady(true);
  };

  mapRef.current.once('styledata', handleStyle);
  mapRef.current.once('idle', handleStyle);

  return () => {
    mapRef.current.off('styledata', handleStyle);
    mapRef.current.off('idle', handleStyle);
  };
}, []);

  // (B) Once map + layers are ready, do the highlight
  useEffect(() => {
    if (!mapIsReady) return; // Wait for map
    if (!initialHighlightIds || initialHighlightIds.length === 0) return; // No highlights to restore
    if (!mapRef.current) return;
    
    console.log("🎯 Attempting to restore highlights:", initialHighlightIds);
    console.log("📊 Current layerStatus:", layerStatus);

    const existingLayers = Object.keys(layerStatus).filter(
      (layerName) => layerStatus[layerName] && tileLayerMapLayersPresent(mapRef.current, layerName)
    );

    if (!existingLayers.length) {
      console.warn("⚠️ No active layers yet, waiting...");
      return;
    }

    let hasRestored = false; // Prevent multiple restores
    
    const restoreHighlights = () => {
      if (hasRestored) return; // Already restored
      console.log("🗺️ Restoring highlights...");
      console.log("🔍 Active layers:", existingLayers);
      console.log("🔍 Highlight IDs to find:", initialHighlightIds);
      console.log("🔍 Map center:", mapRef.current.getCenter());
      console.log("🔍 Map zoom:", mapRef.current.getZoom());
      
      let allQueriedFeatures = [];
      existingLayers.forEach((layerName) => {
        try {
          const queryLayerIds = getQueryLayerIdsForTileLayer(layerName, mapRef.current);
          if (!queryLayerIds.length) return;
          const renderedFeatures = mapRef.current.queryRenderedFeatures({
            layers: queryLayerIds,
          });

          console.log(`📍 Found ${renderedFeatures.length} rendered features in ${layerName}`);
          
          // Debug: show some GFIs from rendered features
          if (renderedFeatures.length > 0 && layerName === 'ownership') {
            const sampleGFIs = renderedFeatures.slice(0, 3).map(f => getFeatureIdentifierFromFeature(f));
            console.log("📋 Sample GFIs in viewport:", sampleGFIs);
          }
          
          const matchedFeatures = renderedFeatures.filter((feature) => {
            const featureId = getFeatureIdentifierFromFeature(feature);
            return featureId && initialHighlightIds.includes(featureId);
          });
          
          if (matchedFeatures.length > 0) {
            console.log(`✅ Matched ${matchedFeatures.length} features in ${layerName}`);
          }
          
          allQueriedFeatures.push(...matchedFeatures);
        } catch (error) {
          console.warn(`⚠️ Error querying ${layerName}:`, error);
        }
      });

      if (allQueriedFeatures.length > 0) {
        console.log(`✅ Restored ${allQueriedFeatures.length} highlighted features`);
        hasRestored = true;
        setSelectedFeatures(allQueriedFeatures);
        
        // Use highlightSettings if available, otherwise it will use defaults in highlightFeature
        if (highlightSettings) {
          highlightFeature(allQueriedFeatures);
        } else {
          console.warn("⚠️ highlightSettings not ready, but restoring with defaults");
          // Still highlight with defaults
          highlightFeature(allQueriedFeatures, null, {
            fillColor: '#FF0000',
            fillOpacity: 0.5,
            fillOutlineColor: '#FF0000',
            lineColor: '#FF0000',
            lineWidth: 3
          });
        }
      } else {
        console.warn("⚠️ No features matched. Possible reasons:");
        console.warn("   - Map needs to load more tiles at this zoom level");
        console.warn("   - Features not in current viewport");
        console.warn("   - Ownership layer not loaded yet");
      }
    };

    // Wait for map to be idle (tiles loaded) before querying
    // The 'idle' event fires when the map has finished loading and rendering
    const handleIdle = () => {
      // Small delay to ensure tiles are actually rendered
      setTimeout(restoreHighlights, 200);
    };
    
    mapRef.current.once('idle', handleIdle);
    
    // Also try after a short delay if the map seems ready
    setTimeout(() => {
      if (mapRef.current && mapRef.current.loaded()) {
        restoreHighlights();
      }
    }, 500);
    
    return () => {
      // Cleanup
      if (mapRef.current) {
        mapRef.current.off('idle', handleIdle);
      }
    };
    
  }, [mapRef, mapIsReady, initialHighlightIds, layerStatus, getFeatureIdentifierFromFeature, highlightSettings]);

  useEffect(() => {
    if (!mapRef.current) return;
  
    const map = mapRef.current;
    const logZoom = () => {
      console.log("Current zoom level:", map.getZoom());
    };
  
    map.on('zoom', logZoom);
  
    // Optionally, log on move as well:
    // map.on('move', logZoom);
  
    // Cleanup
    return () => {
      map.off('zoom', logZoom);
      // map.off('move', logZoom);
    };
  }, [mapRef]);

  // Remove or comment out the effect that sets tile boundaries
  // useEffect(() => {
  //   if (!mapRef.current) return;
  //   mapRef.current.showTileBoundaries = true;
  // }, [mapRef]);
  /**
   * =============== Draw Hook ===============
   * Integrates with custom hook `useMapboxDraw` to enable polygon/line drawing.
   * The hook internally handles draw events like `draw.create`, mode changes, etc.
   */
  const { drawPolygon, drawLine, selectParcelsWithPolygon, clearAllDrawings, deleteSelectedFeature} = useMapboxDraw({
    mapRef,
    onPolygonCreated: (polyFeature) => {
      console.log("Polygon created:", polyFeature);
      // Possibly do area calc or passPolygonToReportBuilder
      // e.g. passPolygonToReportBuilder(polyFeature);
    },

    onPolygonFinalized: (finalPolyFeature) => {
      console.log("🚀🚀🚀🚀🚀🚀🚀🚀 Finalized Polygon for Parcel Selection:", finalPolyFeature);
    
      // Store the polygon for future reference
      setSelectedFilterPolygon(finalPolyFeature);
    
      // Zoom to polygon
      zoomToPolygon(finalPolyFeature);
    
      // Select parcels inside the polygon
      mapRef.current.once("moveend", () => {
        console.log("📌 Move complete, now selecting parcels.");
        // Use ref to get current highlightSettings (always fresh)
        selectParcelsInsidePolygon(finalPolyFeature, highlightSettingsRef.current);
      });
    },
    
  }, [highlightSettings]);


  function getBoundingBox(polygon) {
    const coords = polygon.coordinates[0]; // Outer ring
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

    coords.forEach(([lng, lat]) => {
      if (lng < minX) minX = lng;
      if (lat < minY) minY = lat;
      if (lng > maxX) maxX = lng;
      if (lat > maxY) maxY = lat;
    });

    return [[minX, minY], [maxX, maxY]]; // [Southwest, Northeast]
  }

  function zoomToPolygon(polygon) {
    const bounds = getBoundingBox(polygon);
    mapRef.current.fitBounds(bounds, {
      padding: 100, // Adjust padding for better visualization
      duration: 800, // Smooth animation
    });
  
    console.log("📍 Map zoomed to polygon bounds:", bounds);
  }

  function selectParcelsInsidePolygon(polygon, currentHighlightSettings) {
    console.log("🔍 Querying features within selection polygon...");
    console.log("🔍 selectParcelsInsidePolygon - currentHighlightSettings:", currentHighlightSettings);
    console.log("🔍 selectParcelsInsidePolygon - currentHighlightSettings.fillColor:", currentHighlightSettings?.fillColor);

    const candidateLayers = layerStatus.ownership
      ? ["regrid-parcels-layer", "regrid-parcels-outline"]
      : [];
    const availableLayers = candidateLayers.filter((layerId) => mapRef.current.getLayer(layerId));
    const queriedFeatures = availableLayers.length
      ? mapRef.current.queryRenderedFeatures({ layers: availableLayers })
      : [];

    if (!queriedFeatures.length) {
        console.warn("❌ No parcel features found in selectable layers.");
        return;
    }

    console.log(`🗺️ Queried ${queriedFeatures.length} features from parcel layers.`);

    // Convert the drawn polygon to a Turf.js Polygon
    const selectionPolygon = turf.polygon(polygon.coordinates);

    const MOSTLY_INSIDE_THRESHOLD = 0.6;
    // Select parcel geometries that are mostly inside the drawn polygon.
    const selectedFeatures = queriedFeatures.filter((feature) => {
        if (!feature.geometry) return false;
        const featureGeometry = turf.feature(feature.geometry);
        try {
          if (turf.booleanContains(selectionPolygon, featureGeometry)) {
            return true;
          }
          if (!turf.booleanIntersects(selectionPolygon, featureGeometry)) {
            return false;
          }

          const parcelArea = turf.area(featureGeometry);
          if (!parcelArea || !Number.isFinite(parcelArea) || parcelArea <= 0) {
            return false;
          }

          const overlap = turf.intersect(selectionPolygon, featureGeometry);
          if (!overlap) return false;
          const overlapArea = turf.area(overlap);
          const overlapRatio = overlapArea / parcelArea;
          return overlapRatio >= MOSTLY_INSIDE_THRESHOLD;
        } catch (error) {
          console.warn("Skipping feature with invalid geometry during polygon selection.", error);
          return false;
        }
    });

    const normalizeToken = (value) => String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const extractParcelIdFromGfi = (gfi) => {
      if (!gfi) return '';
      const parts = String(gfi).split('_');
      return parts.length ? parts[parts.length - 1] : '';
    };
    const dedupeBy = (feature) => {
      const props = feature?.properties || {};
      const parcelNum = normalizeToken(props.parcelnumb || props.parcel_id || props.county_parcel_id);
      const gfiParcel = normalizeToken(extractParcelIdFromGfi(props.GFI));
      const uuid = normalizeToken(props.ll_uuid || props.id);
      return parcelNum || gfiParcel || uuid || `${feature?.source || "src"}:${feature?.id || "unknown"}`;
    };

    const seen = new Set();
    const uniqueSelectedFeatures = selectedFeatures.filter((feature) => {
      const key = dedupeBy(feature);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    console.log(`✅ ${uniqueSelectedFeatures.length} parcel features mostly inside selection polygon.`);
    
    // Highlight & Store Selected Features
    setSelectedFeatures(uniqueSelectedFeatures);
    
    // Use the passed highlightSettings to ensure we have current values
    highlightFeature(uniqueSelectedFeatures, { ownership: true }, currentHighlightSettings);
}





 
  /**=============== Adds layers to the map depending on layer status ===============
   * Dynamically adds or removes map layers based on `layerStatus`.
   * For each visible layer, we add a vector source and the corresponding map layer.
   * We also move it "on top" if toggled last.
   */
  const lastAppliedLayerOrderRef = useRef('');

  const updateLayers = () => {
    console.log('Updating layers with current layerStatus:', layerStatus);

  /** Tile URL/spec changed — needs reload. Fresh addSource already fetches tiles; reloading causes first-toggle flicker. */
    const sourcesNeedingTileReload = new Set();
    const hadRegridBefore = Boolean(mapRef.current?.getSource?.('regrid-parcels'));
    const prevStatus = prevLayerStatusForRepaintRef.current;
    const turnedOnLayerNames =
      prevStatus == null
        ? []
        : Object.keys(layerStatus).filter((name) => layerStatus[name] && !prevStatus[name]);

    // Update map layers based on layerStatus changes
    Object.keys(layerStatus).forEach((layerName) => {
      const isVisible = layerStatus[layerName];
      // Legacy Martin ownership stack was removed; ownership toggle now controls Regrid visibility.
      if (layerName === 'ownership' || layerName === 'regrid_zoning') return;
      if (!getHostedTileLayerUrl(layerName)) return;
      console.log(`Processing layer "${layerName}" - Visibility: ${isVisible}`);
      console.log(!mapRef.current.getSource(layerName))
      // Check if the source for the layer exists, if not add it
      if (!mapRef.current.getSource(layerName)) {
        console.log(`Adding source for layer "${layerName}"`);
        const zt =
          vectorTileLayerZoom[layerName] ||
          rasterTileLayerZoom[layerName] ||
          { minzoom: 6, maxzoom: 14 };
        const tpl = getHostedTileLayerUrl(layerName);
        if (isVectorPmtilesArchiveUrl(tpl)) {
          mapRef.current.addSource(layerName, {
            type: isRasterHostedTileLayer(layerName) ? 'raster' : 'vector',
            url: tpl,
            minzoom: zt.minzoom,
            maxzoom: zt.maxzoom,
          });
        } else {
          mapRef.current.addSource(layerName, {
            type: 'vector',
            tiles: [tpl],
            minzoom: zt.minzoom,
            maxzoom: zt.maxzoom,
          });
        }
      } else {
        // If ``tileLayerUrls`` changed (e.g. MVT → PMTiles), sync the underlying vector source.
        try {
          const src = mapRef.current.getSource(layerName);
          const nextSpec = getHostedTileLayerUrl(layerName);
          if (!src || !nextSpec) return;
          const serialized =
            typeof src.serialize === 'function' ? src.serialize() || {} : {};
          if (isVectorPmtilesArchiveUrl(nextSpec)) {
            if (serialized.url !== nextSpec && typeof src.setUrl === 'function') {
              src.setUrl(nextSpec);
              reloadVectorSourceTileCaches(mapRef.current, layerName);
              sourcesNeedingTileReload.add(layerName);
            }
          } else if (typeof src.setTiles === 'function') {
            const currentTpl =
              Array.isArray(serialized.tiles) ? serialized.tiles[0] : src?.tiles?.[0] ?? null;
            if (currentTpl !== nextSpec) {
              src.setTiles([nextSpec]);
              reloadVectorSourceTileCaches(mapRef.current, layerName);
              sourcesNeedingTileReload.add(layerName);
            }
          }
        } catch (_) {
          /* ignore */
        }
      }

      // Add the layer if it is visible and not already added
      if (isVisible) {
        if (!tileLayerMapLayersPresent(mapRef.current, layerName)) {
          console.log(`Adding layer "${layerName}" to the map`);

          let beforeId = getVectorLayerInsertBeforeId(mapRef.current);
          const styleLayers = mapRef.current.getStyle().layers || [];
          const drawLayer = styleLayers.find((l) => l.id.startsWith('gl-draw-'));
          if (!beforeId && drawLayer) {
            beforeId = drawLayer.id;
          }

          let style;

          if (layerName === 'soil') {
            try {
              addSoilStateLayers(mapRef.current, beforeId);
              console.log('Added soil state sub-layers.');
            } catch (error) {
              console.error(`Error adding soil layers: ${error}`);
            }
          } else {
          style = getLayerStyle(layerName, null, baseMapRef);
          if (style) {
            try {
              mapRef.current.addLayer(style, beforeId);
              console.log(`Added layer "${layerName}-layer" with default styles.`);
              if (layerName === 'surface_water') {
                const flowlineStyle = getLayerStyle('surface_water_flowline', null, baseMapRef);
                if (flowlineStyle && !mapRef.current.getLayer('surface_water-flowline-layer')) {
                  mapRef.current.addLayer(
                    { ...flowlineStyle, source: 'surface_water' },
                    beforeId
                  );
                }
              }
              if (layerName === 'conservation_easements') {
                const outlineStyle = getLayerStyle('conservation_easements_outline', null, baseMapRef);
                if (
                  outlineStyle &&
                  !mapRef.current.getLayer('conservation_easements-outline-layer')
                ) {
                  mapRef.current.addLayer(
                    { ...outlineStyle, source: 'conservation_easements' },
                    beforeId
                  );
                }
              }
              
              // ✅ If this is the ownership fill layer, ensure border is positioned after it
              if (layerName === "ownership") {
                // Use requestAnimationFrame to ensure the layer is fully added before positioning border
                requestAnimationFrame(() => {
                  if (mapRef.current.getLayer("regrid-parcels-layer") && mapRef.current.getLayer("regrid-parcels-outline")) {
                    const styleLayers = mapRef.current.getStyle().layers || [];
                    const ownershipLayerIndex = styleLayers.findIndex(l => l.id === "regrid-parcels-layer");
                    if (ownershipLayerIndex !== -1) {
                      // Find the next layer after regrid-parcels-layer
                      let borderBeforeId = undefined;
                      for (let i = ownershipLayerIndex + 1; i < styleLayers.length; i++) {
                        const nextLayer = styleLayers[i];
                        if (!nextLayer.id.includes("ownership") && !nextLayer.id.includes("border")) {
                          if (nextLayer.id.startsWith('gl-draw-')) {
                            borderBeforeId = nextLayer.id;
                            break;
                          }
                          borderBeforeId = nextLayer.id;
                          break;
                        }
                      }
                      try {
                        mapRef.current.moveLayer("regrid-parcels-outline", borderBeforeId);
                        console.log("✅ Repositioned regrid-parcels-outline after ownership fill layer (post-add)");
                      } catch (error) {
                        console.warn("Could not reposition regrid-parcels-outline after ownership fill:", error);
                      }
                    }
                  }
                });
              }
            } catch (error) {
              console.error(`Error adding layer: ${error}`);
            }
          } else {
            console.warn(`No style found for layer: ${layerName}`);
          }
          }

        } else {
          // If the layer is already added, just make sure it's visible
          console.log(`Setting visibility of "${layerName}" to "visible"`);
          setTileLayerVisibility(mapRef.current, layerName, 'visible');
          if (layerName === "ownership") {
            console.log("🔄 Ensuring correct ownership style after basemap change.");
            if (!mapRef.current.getLayer("regrid-parcels-layer")) {
              console.warn("⚠️ Ownership layer is missing when trying to style it.");
              return;
            }
            try {
              const updatedStyle = getLayerStyle("ownership", null, baseMapRef);
              
              // ✅ Ensure style exists before updating
              if (!updatedStyle) {
                console.error(`🚨 Ownership layer style is undefined! Skipping update.`);
                return;
              }
              
              const paint = updatedStyle.paint;
              if (paint) {
                if (mapRef.current.getLayer("regrid-parcels-layer")) {
                  if (Object.prototype.hasOwnProperty.call(paint, 'fill-color')) {
                    mapRef.current.setPaintProperty("regrid-parcels-layer", "fill-color", paint["fill-color"]);
                  }
                  if (Object.prototype.hasOwnProperty.call(paint, 'fill-opacity')) {
                    mapRef.current.setPaintProperty("regrid-parcels-layer", "fill-opacity", paint["fill-opacity"]);
                  }
                  if (Object.prototype.hasOwnProperty.call(paint, 'fill-outline-color')) {
                    mapRef.current.setPaintProperty("regrid-parcels-layer", "fill-outline-color", paint["fill-outline-color"]);
                  }
                } else {
                  console.warn(`⚠️ Ownership layer not found when applying styles.`);
                }
              }
            } catch (error) {
              console.error(`🚨 Error updating ownership layer style:`, error);
            }
        }
        }
        // ✅ ADD BORDER WHEN OWNERSHIP IS TOGGLED ON
        // Update ownership borders when the basemap changes
        if (layerName === "ownership") {
          console.log("🔄 Updating ownership boundary styles...");
          
          // ✅ Ensure ownership fill layer exists before adding borders
          // If it doesn't exist yet, wait for it (this can happen on initial load)
          if (!mapRef.current.getLayer("regrid-parcels-layer")) {
            console.log("⏳ Ownership fill layer not found yet, waiting for it...");
            // Wait a bit for the ownership fill layer to be added (it should be added in the same updateLayers call)
            setTimeout(() => {
              if (mapRef.current.getLayer("regrid-parcels-layer")) {
                console.log("✅ Ownership fill layer found, proceeding with border setup...");
                // Re-run the border setup logic
                const outerBorderStyle = getLayerStyle("regrid-parcels-outline", null, baseMapRef);
                const innerBorderStyle = getLayerStyle("regrid-parcels-outline", null, baseMapRef);
                setupOwnershipBorders(outerBorderStyle, innerBorderStyle);
              } else {
                console.warn("⚠️ Ownership fill layer still not found after delay");
              }
            }, 100);
            return; // Exit early, will be handled in setTimeout
          }
          
          let outerBorderStyle = getLayerStyle("regrid-parcels-outline", null, baseMapRef);
          let innerBorderStyle = getLayerStyle("regrid-parcels-outline", null, baseMapRef);

          // Helper function to set up ownership borders
          const setupOwnershipBorders = (outerStyle, innerStyle) => {

          // ✅ Position border layer AFTER ownership fill layer (so it appears on top)
          // Find the correct position: after regrid-parcels-layer, but below drawings
          
            // Helper function to find where to position border (after regrid-parcels-layer)
            const getBorderBeforeId = () => {
            // Refresh style layers array to get current layer order
            const styleLayers = mapRef.current.getStyle().layers || [];
            const drawLayer = styleLayers.find(l => l.id.startsWith('gl-draw-'));
            
            // If regrid-parcels-layer exists, position border right after it
            if (mapRef.current.getLayer("regrid-parcels-layer")) {
              const ownershipLayerIndex = styleLayers.findIndex(l => l.id === "regrid-parcels-layer");
              if (ownershipLayerIndex !== -1) {
                // Find the next layer after regrid-parcels-layer that's not a border layer
                for (let i = ownershipLayerIndex + 1; i < styleLayers.length; i++) {
                  const nextLayer = styleLayers[i];
                  // Skip other ownership border layers
                  if (!nextLayer.id.includes("ownership") && !nextLayer.id.includes("border")) {
                    // If we found a draw layer, use it (so border is below drawings)
                    if (nextLayer.id.startsWith('gl-draw-')) {
                      return nextLayer.id;
                    }
                    // Otherwise, position before this layer (so border is right after regrid-parcels-layer)
                    return nextLayer.id;
                  }
                }
                // If no suitable layer found after regrid-parcels-layer, check for draw layers
                if (drawLayer) {
                  return drawLayer.id;
                }
                // Otherwise add at end (after regrid-parcels-layer)
                return undefined;
              }
            }
            // Ownership layer doesn't exist yet, position relative to high-def
            if (mapRef.current.getLayer(HIGH_DEF_LAYER_ID) || mapRef.current.getLayer(TETON_ORTHO_LAYER_ID)) {
              return drawLayer ? drawLayer.id : undefined;
            }
            return undefined;
          };
          
          const borderBeforeId = getBorderBeforeId();

          // ✅ Border layers - red border for debugging (3px thick)
          if (mapRef.current.getLayer("regrid-parcels-outline")) {
            console.log("🎨 Updating outer ownership boundary...");
            Object.entries(outerStyle.paint || {}).forEach(([prop, val]) => {
              if (prop === 'line-color') return;
              mapRef.current.setPaintProperty("regrid-parcels-outline", prop, val);
            });
            applyRegridParcelOutlineForBasemap(
              mapRef.current,
              activeBasemapIdRef?.current || baseMapRef.current
            );
            Object.entries(outerStyle.layout || {}).forEach(([prop, val]) => {
              mapRef.current.setLayoutProperty("regrid-parcels-outline", prop, val);
            });
            // ✅ Reposition border layer AFTER ownership fill layer to ensure it's on top
            try {
              const updatedBorderBeforeId = getBorderBeforeId();
              mapRef.current.moveLayer("regrid-parcels-outline", updatedBorderBeforeId);
              console.log("✅ Moved regrid-parcels-outline to position after ownership fill layer");
            } catch (error) {
              console.warn("Could not reposition regrid-parcels-outline:", error);
            }
          } else {
            console.log("🆕 Adding outer ownership boundary for the first time.");
            mapRef.current.addLayer(outerStyle, borderBeforeId);
            applyRegridParcelOutlineForBasemap(
              mapRef.current,
              activeBasemapIdRef?.current || baseMapRef.current
            );
            console.log("✅ Added regrid-parcels-outline after ownership fill layer");
            
            // ✅ Ensure border is positioned correctly after ownership fill layer (if it exists)
            // Use requestAnimationFrame to ensure layers are in the map before repositioning
            requestAnimationFrame(() => {
              if (mapRef.current.getLayer("regrid-parcels-layer") && mapRef.current.getLayer("regrid-parcels-outline")) {
                const styleLayers = mapRef.current.getStyle().layers || [];
                const ownershipLayerIndex = styleLayers.findIndex(l => l.id === "regrid-parcels-layer");
                if (ownershipLayerIndex !== -1) {
                  // Find the next layer after regrid-parcels-layer
                  let updatedBorderBeforeId = undefined;
                  for (let i = ownershipLayerIndex + 1; i < styleLayers.length; i++) {
                    const nextLayer = styleLayers[i];
                    if (!nextLayer.id.includes("ownership") && !nextLayer.id.includes("border")) {
                      if (nextLayer.id.startsWith('gl-draw-')) {
                        updatedBorderBeforeId = nextLayer.id;
                        break;
                      }
                      updatedBorderBeforeId = nextLayer.id;
                      break;
                    }
                  }
                  try {
                    mapRef.current.moveLayer("regrid-parcels-outline", updatedBorderBeforeId);
                    console.log("✅ Repositioned regrid-parcels-outline after ownership fill layer (post-add-first-time)");
                  } catch (error) {
                    console.warn("Could not reposition regrid-parcels-outline after ownership fill (first time):", error);
                  }
                }
              }
            });
          }

          // ✅ Inner border is already hidden, just ensure it stays hidden
          if (mapRef.current.getLayer("regrid-parcels-outline")) {
            console.log("🎨 Ensuring inner ownership boundary is hidden...");
            mapRef.current.setLayoutProperty("regrid-parcels-outline", "visibility", "none");
            mapRef.current.setPaintProperty("regrid-parcels-outline", "line-width", 0);
            mapRef.current.setPaintProperty("regrid-parcels-outline", "line-opacity", 0);
          } else {
            console.log("🆕 Adding inner ownership boundary (hidden)...");
            mapRef.current.addLayer(innerStyle, borderBeforeId);
            // Immediately hide it
            mapRef.current.setLayoutProperty("regrid-parcels-outline", "visibility", "none");
            mapRef.current.setPaintProperty("regrid-parcels-outline", "line-width", 0);
            mapRef.current.setPaintProperty("regrid-parcels-outline", "line-opacity", 0);
          }
          };
          
          // Call the setup function
          setupOwnershipBorders(outerBorderStyle, innerBorderStyle);
        }

        

        // Don't move layer to top if high-def layer exists - keep proper ordering
        // Only update top layer state for tracking, but don't actually move layers
        if (!mapRef.current.getLayer(HIGH_DEF_LAYER_ID) && !mapRef.current.getLayer(TETON_ORTHO_LAYER_ID)) {
        setTopLayer(layerName);
        console.log('Top layer updated:', layerName);
        } else {
          // If high-def exists, ensure the layer stays in correct position (above high-def, below drawings)
          try {
            const styleLayers = mapRef.current.getStyle().layers || [];
            const drawLayer = styleLayers.find(l => l.id.startsWith('gl-draw-'));
            getQueryLayerIdsForTileLayer(layerName, mapRef.current).forEach((layerId) => {
            if (mapRef.current.getLayer(layerId) && drawLayer) {
              mapRef.current.moveLayer(layerId, drawLayer.id);
              console.log(`Moved ${layerId} to correct position (above high-def, below drawings)`);
            }
            });
          } catch (error) {
            console.error('Error repositioning layer:', error);
          }
        }
      } else {
        // If the layer is supposed to be hidden, set its visibility to "none"
        if (tileLayerMapLayersPresent(mapRef.current, layerName)) {
          console.log(`Setting visibility of "${layerName}" to "none"`);
          setTileLayerVisibility(mapRef.current, layerName, 'none');

          if (selectedFeature?.length > 0) {
            const updatedSelectedFeatures = selectedFeature.filter(
              (feature) => !featureBelongsToMapLayer(feature, layerName)
            );
            if (updatedSelectedFeatures.length !== selectedFeature.length) {
              console.log(`Clearing selection for hidden layer: "${layerName}"`);
              if (updatedSelectedFeatures.length > 0) {
                setSelectedFeatures(updatedSelectedFeatures);
                highlightFeature(updatedSelectedFeatures);
              } else {
                setSelectedFeatures([]);
                removeHighlight();
              }
            }
          }
        } else {
          console.log(`Layer "${layerName}-layer" is not present on the map, no action needed`);
        }
        // ✅ REMOVE BORDER WHEN OWNERSHIP IS TOGGLED OFF
        if (layerName === "ownership") {
          // ✅ Fix: Use underscores to match the layer IDs used when adding
          if (mapRef.current.getLayer("regrid-parcels-outline")) {
              console.log("Removing ownership boundary layer.");
              mapRef.current.removeLayer("regrid-parcels-outline");
          }
          if (mapRef.current.getLayer("regrid-parcels-outline")) {
            console.log("Removing ownership boundary layer.");
            mapRef.current.removeLayer("regrid-parcels-outline");
        }
       }
      }

    });

    syncRegridParcelLayersIntoMap(mapRef.current, parcelMapVisibility);
    const regridStackAdded =
      !hadRegridBefore && Boolean(mapRef.current?.getSource?.('regrid-parcels'));

    // Reorder layers only when stack order actually changed (avoids repainting every toggle).
    const layerOrderKey = layerOrder.join('\0');
    const layerOrderChanged = layerOrderKey !== lastAppliedLayerOrderRef.current;
    if (layerOrderChanged) {
      layerOrder.forEach((layerName) => {
        getQueryLayerIdsForTileLayer(layerName, mapRef.current).forEach((layerId) => {
          if (mapRef.current.getLayer(layerId)) {
            mapRef.current.moveLayer(layerId);
          }
        });
      });
      lastAppliedLayerOrderRef.current = layerOrderKey;
    }
    console.log("Layer Order:")
    console.log(layerOrder)
    console.log(layerStatus)

    const finishLayerStack = () => {
      if (!mapRef.current) return;
      if (layerStatus.ownership) {
        try {
          mapRef.current.resize();
        } catch (_) {
          /* ignore */
        }
      }
      const enforceRegridOnTop = () => {
        if (!mapRef.current) return;
        bringRegridParcelLayersBeforeSymbolLabels(mapRef.current);
        applyParcelVisualizationVisibility(mapRef.current, parcelMapVisibility);
      };

      enforceRegridOnTop();
      const needsRegridRepaint =
        turnedOnLayerNames.includes('ownership') ||
        (regridStackAdded && parcelMapVisibility.showRegrid);
      repaintLayersTurnedOn(mapRef.current, layerStatus, turnedOnLayerNames, {
        regridFreshlyAdded: false,
      });
      if (needsRegridRepaint) {
        requestAnimationFrame(() => {
          const m = mapRef.current;
          if (!m?.isStyleLoaded?.() || !parcelMapVisibility.showRegrid) return;
          syncRegridParcelLayersIntoMap(m, parcelMapVisibility);
          applyParcelVisualizationVisibility(m, parcelMapVisibility);
          repaintRegridParcelsAfterShow(m);
        });
      }
      prevLayerStatusForRepaintRef.current = { ...layerStatus };
      applyRegridParcelOutlineForBasemap(
        mapRef.current,
        activeBasemapIdRef?.current || baseMapRef.current
      );
      bringLabelsToTop();
      applyCompositeLabelStyleForBasemap(
        mapRef.current,
        activeBasemapIdRef?.current || baseMapRef.current
      );
      const wantedBasemap = String(
        activeBasemapIdRef?.current || baseMapRef.current || ''
      ).trim();
      if (
        wantedBasemap &&
        needsBasemapOverlayMaintenance(mapRef.current, wantedBasemap)
      ) {
        repairBasemapOverlaysRef.current(wantedBasemap);
      }
      const needsTileReload = sourcesNeedingTileReload.size > 0;

      try {
        if (mapRef.current.getLayer("settlement-label")) {
          mapRef.current.setPaintProperty("settlement-label", "text-color", "#000000");
          mapRef.current.setPaintProperty("settlement-label", "text-halo-color", "#FFFFFF");
          mapRef.current.setPaintProperty("settlement-label", "text-halo-width", 15);
          mapRef.current.setPaintProperty("settlement-label", "text-halo-blur", 20);
        }
      } catch (_) {}

      if (needsTileReload) {
        reloadTileSources(mapRef.current, sourcesNeedingTileReload, false);
        try {
          if (typeof mapRef.current.triggerRepaint === 'function') mapRef.current.triggerRepaint();
        } catch (_) {}
        scheduleDeferredTileRefresh(mapRef.current, sourcesNeedingTileReload, false);
      }

      summarizeOwnershipTileState(mapRef.current, 'finishLayerStack');

      const allLayers = mapRef.current.getStyle().layers;
      console.log(
        "Final mapbox layer stack (bottom -> top):",
        allLayers.map((layer) => layer.id)
      );
    };

    const map = mapRef.current;
    if (!map?.loaded?.()) {
      finishLayerStack();
      return new Promise((resolve) => {
        const afterLoad = () => {
          syncRegridParcelLayersIntoMap(mapRef.current, parcelMapVisibility);
          finishLayerStack();
          resolve();
        };
        try {
          map.once('load', afterLoad);
        } catch (_) {
          resolve();
        }
      });
    }

    return new Promise((resolve) => {
      const runRegridWhenStyleReady = () => {
        if (!map.isStyleLoaded()) {
          map.once('style.load', runRegridWhenStyleReady);
          return;
        }
        syncRegridParcelLayersIntoMap(map, parcelMapVisibility);
        finishLayerStack();
        resolve();
      };
      runRegridWhenStyleReady();
    });
  };

  /**
   * Same idea as `cycleOwnershipLayerLikeToggle`: after `setStyle`, drop the Regrid source + layers
   * and add them again from TileJSON. Visibility-only retoggles were not enough; this matches how
   * Martin layers recover (full re-add). Tile URLs are routed through the Regrid tile proxy.
   */
  const reinitializeRegridParcelsAfterBasemapSwap = useCallback(async () => {
    const map = mapRef.current;
    if (!map?.isStyleLoaded?.()) return;
    if (!parcelMapVisibilityRef.current?.showRegrid) return;

    // Let glyphs/sprites settle after setStyle so the new stack isn’t built on a half-ready style.
    await new Promise((resolve) => {
      const m = mapRef.current;
      if (!m) {
        resolve();
        return;
      }
      let settled = false;
      const done = () => {
        if (settled) return;
        settled = true;
        try {
          m.off('idle', onIdle);
        } catch (_) {
          /* ignore */
        }
        window.clearTimeout(tid);
        resolve();
      };
      const onIdle = () => done();
      const tid = window.setTimeout(done, 600);
      try {
        m.once('idle', onIdle);
      } catch (_) {
        done();
      }
    });

    try {
      removeRegridParcelStack(map);
      removeRegridZoningTileStack(map);
    } catch (_) {
      /* ignore */
    }

    await new Promise((r) => requestAnimationFrame(r));

    try {
      if (!cachedRegridTileJson) {
        await setupRegridTiles();
      } else {
        addRegridParcelLayersFromTileJson(
          map,
          cachedRegridTileJson,
          getRegridVectorMinZoomForMap(map)
        );
      }
    } catch (_) {
      /* ignore */
    }

    if (layerStatusRef.current?.regrid_zoning) {
      try {
        if (!getCachedRegridZoningTileJson()) {
          await ensureRegridZoningTileJson();
        }
        syncRegridZoningLayersIntoMap(map, true);
      } catch (e) {
        console.error('Regrid zoning tiles reinit after basemap failed:', e);
      }
    }

    const m = mapRef.current;
    if (!m) return;
    try {
      bringRegridParcelLayersBeforeSymbolLabels(m);
      applyParcelVisualizationVisibility(m, parcelMapVisibilityRef.current);
      setRegridZoningLayersVisibility(m, Boolean(layerStatusRef.current?.regrid_zoning));
    } catch (_) {
      /* ignore */
    }
    if (!m.getSource('regrid-parcels') && !m.getSource('regrid-zoning-tiles')) return;
    // Avoid aggressive post-style tile invalidation here — it can create visible flicker
    // during basemap transitions. Regrid is already re-added and restacked above.
    try {
      if (typeof m.triggerRepaint === 'function') m.triggerRepaint();
    } catch (_) {
      /* ignore */
    }
    fireRegridRestack(m);
  }, [setupRegridTiles]);

  /** Ownership MVT: `sourcedata` / `error` when `?debugOwnershipTiles=1` or localStorage cv_debug_ownership_tiles=1 */
  useEffect(() => {
    if (!mapIsReady || !mapRef?.current || !isCvOwnershipTileDebugEnabled()) return undefined;
    const map = mapRef.current;
    const onSourceData = (e) => {
      if (e.sourceId !== 'ownership') return;
      ownershipTilesTrace('map.sourcedata', {
        isSourceLoaded: e.isSourceLoaded,
        dataType: e.dataType,
        sourceDataType: e.sourceDataType,
        tile: e.tile?.tileID
          ? {
              overscaledZ: e.tile.tileID.overscaledZ,
              wrap: e.tile.tileID.wrap,
              canonical: e.tile.tileID.canonical,
            }
          : undefined,
      });
    };
    const onError = (e) => {
      const sid = e?.sourceId;
      if (sid && sid !== 'ownership') return;
      ownershipTilesTrace('map.error', { message: e?.error?.message || String(e?.error), sourceId: sid });
    };
    map.on('sourcedata', onSourceData);
    map.on('error', onError);
    return () => {
      map.off('sourcedata', onSourceData);
      map.off('error', onError);
    };
  }, [mapIsReady, mapRef]);

  /**=============== Handles On Click ===============
   * 
   */
  useEffect(() => {
    console.log("CA")
    console.log(layerStatus)
    if (!mapRef.current) return;
  
    let isDragging = false; // Track if user is dragging
  
    /** 🟢 Detects dragging start */
    const handleTouchStart = () => {
      isDragging = false; // Reset dragging state
    };
  
    /** 🔴 Detects dragging movement */
    const handleTouchMove = () => {
      isDragging = true; // User is dragging, don't trigger click
    };
  
    /** ✅ Handles tap/clicks */
    const handleClick = (e) => {
      console.log("Feature Click Activated");
      console.log(layerStatus)

      if (suppressNextFeatureClickRef?.current) {
        console.log("🛑 Suppressing one map click after polygon finalize.");
        suppressNextFeatureClickRef.current = false;
        return;
      }
  
      if (isDragging) {
        console.log("🚫 Ignoring click - user was dragging");
        return;
      }
  
      if (isDrawingRef.current === true) {
        console.log("🎨 User is drawing, ignoring feature click.");
        return;
      }
      console.log(layerStatus)
      const existingLayers = Object.keys(layerStatus).filter(
        (layerName) => layerStatus[layerName] && tileLayerMapLayersPresent(mapRef.current, layerName)
      );
      const clickableNonOwnershipLayers = [
        ...layerOrder.filter(
          (layerName) =>
            layerName !== 'ownership' &&
            layerStatus[layerName] &&
            tileLayerMapLayersPresent(mapRef.current, layerName)
        ),
        ...existingLayers.filter(
          (layerName) => layerName !== 'ownership' && !layerOrder.includes(layerName)
        ),
      ];

      let queryLayers = existingLayers.flatMap((layerName) =>
        getQueryLayerIdsForTileLayer(layerName, mapRef.current)
      );
      // Regrid: same rules as parcel overlay visibility (print toggle can hide vectors)
      if (parcelMapVisibility.showRegrid && mapRef.current.getLayer('regrid-parcels-layer')) {
        queryLayers.push('regrid-parcels-layer', 'regrid-parcels-outline');
      }
  
      if (queryLayers.length > 0) {
        const features = mapRef.current.queryRenderedFeatures(e.point, {
          layers: queryLayers,
        });
  
        console.log("Queried features at click:", features);
  
        if (features.length > 0) {
          mapRef.current.dragPan.disable(); // Temporarily disable dragPan
  
          const clickedFeature = pickClickedFeature(
            features,
            clickableNonOwnershipLayers,
            parcelMapVisibility.showRegrid
          );
          if (!clickedFeature) {
            setSelectedFeatures([]);
            removeHighlight();
            return;
          }
          // Print all attributes of the clicked parcel
          console.log('All attributes of clicked parcel:', clickedFeature);
          console.log('Parcel properties:', clickedFeature.properties);
          
          const hostedLayer = resolveHostedMapLayerFromFeature(clickedFeature);
          if (hostedLayer) {
            console.log(`Clicked hosted layer "${hostedLayer}":`, clickedFeature.properties);
          }

          setSelectedFeatures((prevFeatures) => {
            const isAlreadySelected = prevFeatures.some((f) =>
              featuresShareSelectionId(f, clickedFeature)
            );
            console.log("Is already selected:", isAlreadySelected);
            if (e.originalEvent.shiftKey) {
              if (isAlreadySelected) {
                const updatedSelection = prevFeatures.filter(
                  (f) => !featuresShareSelectionId(f, clickedFeature)
                );
                highlightFeature(updatedSelection);
                return updatedSelection;
              }
              const updatedSelection = [...prevFeatures, clickedFeature];
              highlightFeature(updatedSelection);
              return updatedSelection;
            }
            if (isAlreadySelected && prevFeatures.length === 1) {
              removeHighlight();
              return [];
            }
            highlightFeature([clickedFeature]);
            return [clickedFeature];
          });

          const isRegridParcelClick =
            clickedFeature.layer?.id === 'regrid-parcels-layer' ||
            clickedFeature.layer?.id === 'regrid-parcels-outline' ||
            Boolean(clickedFeature.properties?.ll_uuid);
          if (isPrintingRef.current && isRegridParcelClick) {
            setActiveSidePanelTab('print');
          } else {
            setActiveSidePanelTab('info');
          }
        } else {
          console.log("No features clicked. Clearing selection.");
          setSelectedFeatures([]);
          removeHighlight();
        }
      }
  
      setTimeout(() => {
        mapRef.current.dragPan.enable(); // Re-enable dragging after a short delay
      }, 100);
    };
  
    // ✅ Attach event listeners
    mapRef.current.on('touchstart', handleTouchStart);
    mapRef.current.on('touchmove', handleTouchMove);
    mapRef.current.on('click', handleClick);
    mapRef.current.on('touchend', handleClick);
    console.log("========== ", selectedFeature)
    return () => {
      // ✅ Cleanup event listeners
      if (mapRef.current) {
        mapRef.current.off('touchstart', handleTouchStart);
        mapRef.current.off('touchmove', handleTouchMove);
        mapRef.current.off('click', handleClick);
        mapRef.current.off('touchend', handleClick);
      }
    };
  }, [layerStatus, highlightSettings, propertyMapWizardActive, parcelMapVisibility]);
  

  /**=============== Side Panel Higlight ===============
   * useEffect: Monitors hover changes (hoveredFeatureId). If a feature is hovered,
   * we add a distinct highlight. If not hovered, we remove the highlight.
   */
  useEffect(() => {

    /**
     * Adds or removes a hover highlight for the specified feature ID in "regrid-parcels-layer".
     * 
     * @param {string|null} hoveredId - The ID of the hovered feature's pidn or null if no hover.
     */
    const highlightHoverFeature = (hoveredId) => {
      if (!mapRef.current || !mapRef.current.isStyleLoaded()) {
        console.warn("Map style is not loaded yet. Cannot highlight features.");
        return;
      }
  
      // Remove any existing hover highlights
      if (mapRef.current.getLayer('hover-highlight-layer')) {
        mapRef.current.removeLayer('hover-highlight-layer');
      }
      if (mapRef.current.getLayer('hover-highlight-outline-layer')) {
        mapRef.current.removeLayer('hover-highlight-outline-layer');
      }
      if (mapRef.current.getSource('hover-highlight-source')) {
        mapRef.current.removeSource('hover-highlight-source');
      }
  
      if (!hoveredId) {
        console.log("No feature is hovered. Hover highlight cleared.");
        return; // Exit if no feature is hovered
      }
  
      // Query all rendered features in the relevant layer
      const queriedFeatures = mapRef.current.queryRenderedFeatures({
        layers: ['regrid-parcels-layer'], // Adjust layer name as needed
      });
  
      // Find the feature(s) that match the hovered ID
      const matchingFeatures = queriedFeatures.filter((f) => {
        const queriedPidn = f.properties?.pidn || parsePidnFromDescription(f.properties?.description);
        return queriedPidn === hoveredId;
      });
  
      if (matchingFeatures.length === 0) {
        console.warn('No matching features found for the hovered feature in the ownership layer.');
        return;
      }
      
      console.log('Matching feature for hovered ID:', matchingFeatures);
      // Since there will be at most one feature, use the first match directly
      let unifiedFeature; // Declare unifiedFeature outside the if-else block

      if (matchingFeatures.length > 1) {
        const featureCollection = turf.featureCollection(matchingFeatures);
        unifiedFeature = turf.union(featureCollection); // Assign the unioned feature
      } else {
        unifiedFeature = matchingFeatures[0]; // Use the single matching feature directly
      }
      

      // Add the hover highlight to the map
      try {
        mapRef.current.addSource('hover-highlight-source', {
          type: 'geojson',
          data: unifiedFeature,
        });
  
        mapRef.current.addLayer({
          id: 'hover-highlight-layer',
          type: 'fill',
          source: 'hover-highlight-source',
          paint: {
            'fill-color': 'rgba(255, 255, 0, 0.25)', // Yellow fill for hover
            'fill-outline-color': '#FFFF00', // Yellow outline for hover
            'fill-opacity': 0.5,
          },
        });
  
        mapRef.current.addLayer({
          id: 'hover-highlight-outline-layer',
          type: 'line',
          source: 'hover-highlight-source',
          paint: {
            'line-color': '#FFFF00', // Yellow outline
            'line-width': 2,
          },
        });
      } catch (error) {
        console.error("Error adding hover highlight layers:", error);
      }
    };
  
    // Call the highlightHoverFeature function when hoveredFeatureId changes
  
    // Cleanup on component unmount
    return () => {
      if (mapRef.current && mapRef.current.isStyleLoaded()) {
        if (mapRef.current.getLayer('hover-highlight-layer')) {
          mapRef.current.removeLayer('hover-highlight-layer');
        }
        if (mapRef.current.getLayer('hover-highlight-outline-layer')) {
          mapRef.current.removeLayer('hover-highlight-outline-layer');
        }
        if (mapRef.current.getSource('hover-highlight-source')) {
          mapRef.current.removeSource('hover-highlight-source');
        }
      }
    };
  }, [hoveredFeatureId, layerStatus]);
  
  /**
   * Utility function to add tile boundaries to the map.
   * 
   * @param {string} description - The HTML description from a vector tile property
   * @returns {string|null} The extracted PIDN value or null if not found
   */
  const addTileBoundaries = () => {
    console.log('Adding tile boundaries layer for debugging...');
    mapRef.current.showTileBoundaries = true;
  };

  /**
   * =============== Parse PIDN ===============
   * Utility function to parse the `pidn` out of an HTML-based `description` property.
   * 
   * @param {string} description - The HTML description from a vector tile property
   * @returns {string|null} The extracted PIDN value or null if not found
   */
  const parsePidnFromDescription = (description) => {
    if (!description) {
      return null;
    }
  
    const parser = new DOMParser();
    const doc = parser.parseFromString(description, 'text/html');
    const rows = doc.querySelectorAll('tr');
  
    for (const row of rows) {
      const th = row.querySelector('th')?.textContent?.trim().toLowerCase();
      const td = row.querySelector('td')?.textContent?.trim();
      if (th === 'pidn') {
        return td;
      }
    }
  
    return null; // Return null if pidn not found
  };
  
   /** =============== Add Layers After Basemap Change ===============
   * useEffect: If the map style reloads (due to changing base layers),
   * we re-run `updateLayers` to ensure our data layers are re-added/visible.
   */
  useEffect(() => {
    if (basemapRestoreBlockingLayersRef.current || basemapApplyInProgressRef.current) {
      return undefined;
    }
    console.log("Updating Layers becase layerStatus was updated.")
    console.log("=========", layerStatus, "=========")
    const map = mapRef.current;
    if (!map) return undefined;
    if (!map.isStyleLoaded()) {
      const onStyleLoad = () => {
        if (basemapRestoreBlockingLayersRef.current || basemapApplyInProgressRef.current) return;
        console.log('Map style loaded. Updating layers...');
        updateLayers();
      };
      map.once('style.load', onStyleLoad);
      return () => {
        map.off('style.load', onStyleLoad);
      };
    }
    updateLayers();
    return undefined;
  }, [layerStatus]);

  /**=============== Basemap Change ===============
   * Persistent basemap model:
   * - Keep one style (`outdoors-v12`) loaded.
   * - Toggle managed raster overlays for Satellite/Streets/Imagery.
   * - Keep ownership/Regrid stack above basemap overlays.
   *
   * @param {string} styleId - Basemap variant id (e.g., 'streets-v11')
   */
  const handleBasemapChange = (styleId, enable3D = false, onReady) => {
    if (!mapRef.current) return;
    if (styleId === 'imagery' || styleId === 'imagery-3d') {
      handleSetImageryBasemap(styleId === 'imagery-3d', onReady);
      return;
    }

    basemapApplyGenerationRef.current += 1;
    if (enable3D) setIs3DEnabled(true);

    const runAfterOverlayReady = () => {
      ownershipTilesTrace('basemap overlay applied', { context: 'handleBasemapChange', styleId });
      void updateLayers().then(() => {
        try {
          mapRef.current.resize();
        } catch (_) {
          /* ignore */
        }
        applyLabelLayers();
        applyBasemapEnhancements();
        if (selectedFeature?.length > 0) {
          highlightFeature(selectedFeature);
        }
        restackDataAndParcelsOnce();
        applyCompositeLabelStyleForBasemap(mapRef.current, styleId);
        if (verifyBasemapAppliedOnMap(mapRef.current, styleId)) {
          lastAppliedBasemapRef.current = styleId;
        }
        try {
          onReady?.();
        } catch (_) {
          /* ignore */
        }
      });
    };

    withPersistentOutdoorsBase(() => {
      publishBasemapSelection(styleId);
      hideManagedBasemapOverlays();
      try {
        if (styleId === 'satellite-streets-v12') {
          setPersistentBaseStyleUnderlayVisibility(false);
          addMapboxStyleRasterOverlay(
            SATELLITE_STREETS_OVERLAY_SOURCE_ID,
            SATELLITE_STREETS_OVERLAY_LAYER_ID,
            'satellite-v9'
          );
          setPersistentBaseLabelsVisibility(true);
        } else if (styleId === 'streets-v11') {
          setPersistentBaseStyleUnderlayVisibility(false);
          addMapboxStyleRasterOverlay(STREETS_OVERLAY_SOURCE_ID, STREETS_OVERLAY_LAYER_ID, 'streets-v11');
          setPersistentBaseLabelsVisibility(false);
        } else {
          // Discover/default: no basemap overlay and keep native labels visible.
          setPersistentBaseStyleUnderlayVisibility(true);
          setPersistentBaseLabelsVisibility(true);
        }
      } catch (e) {
        console.error('Failed applying persistent basemap overlay:', styleId, e);
      }
      runAfterOverlayReady();
    });
  };

  // =============== Custom Raster Basemap: Teton Ortho 2024 ===============
  const TETON_ORTHO_SOURCE_ID = 'teton-ortho-2024-source';
  const TETON_ORTHO_LAYER_ID = 'teton-ortho-2024-layer';
  const ESRI_WORLD_IMAGERY_SOURCE_ID = 'esri-world-imagery-source';
  
  // =============== Custom Raster Basemap: High Def 3 Inch ===============
  const HIGH_DEF_SOURCE_ID = 'high-def-3inch-source';
  const HIGH_DEF_LAYER_ID = 'high-def-3inch-layer';
  const TETON_ORTHO_TILES = [
    'https://gis.tetoncountywy.gov/server/rest/services/OrthosAndRasters/TetonAerial2024sixinch_z21/MapServer/tile/{z}/{y}/{x}?blankTile=false'
  ];

  const addTetonOrthoRaster = () => {
    if (!mapRef.current) return;
    // Add raster source if missing
    if (!mapRef.current.getSource(TETON_ORTHO_SOURCE_ID)) {
      mapRef.current.addSource(TETON_ORTHO_SOURCE_ID, {
        type: 'raster',
        tiles: TETON_ORTHO_TILES,
        tileSize: 512, // fewer requests vs 256
        minzoom: 6,
        maxzoom: 21,
        bounds: [-111.27, 43.44, -110.52, 43.98]
      });
    }
    // Insert raster layer below labels if possible
    const styleLayers = mapRef.current.getStyle().layers || [];
    const beforeLabel = styleLayers.find(l => l.type === 'symbol' && l.id.includes('label'));
    const beforeId = beforeLabel ? beforeLabel.id : undefined;
    if (!mapRef.current.getLayer(TETON_ORTHO_LAYER_ID)) {
      mapRef.current.addLayer({
        id: TETON_ORTHO_LAYER_ID,
        type: 'raster',
        source: TETON_ORTHO_SOURCE_ID,
        paint: {
          'raster-opacity': 1
        }
      }, beforeId);
    }
  };

  const ESRI_WORLD_IMAGERY_TILES = [
    'https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
  ];

  const isAppOverlayOrDataLayer = (layer) => {
    const id = layer?.id || '';
    if (!id) return false;
    if (REGRID_OVERLAY_RASTER_LAYER_IDS.includes(id)) return true;
    if (
      id === ESRI_WORLD_IMAGERY_LAYER_ID ||
      id === SATELLITE_STREETS_OVERLAY_LAYER_ID ||
      id === STREETS_OVERLAY_LAYER_ID
    ) {
      return true;
    }
    if (id.startsWith('gl-draw-')) return true;
    if (id.includes('regrid')) return true;
    if (id.endsWith('-layer')) return true;
    if (id.startsWith('cv-')) return true;
    if (id.includes('contour') || id === 'terrain-colors' || id === 'sky') return true;
    return false;
  };

  /** Hide Mapbox outdoors landcover/hillshade so Esri imagery is visible (not buried under style fills). */
  const setPersistentBaseStyleUnderlayVisibility = (isVisible) => {
    const map = mapRef.current;
    if (!map || !map.getStyle) return;
    const visibility = isVisible ? 'visible' : 'none';
    const styleLayers = map.getStyle().layers || [];
    styleLayers.forEach((layer) => {
      if (isAppOverlayOrDataLayer(layer)) return;
      if (layer.type === 'symbol' && layer.source === 'composite') return;
      try {
        map.setLayoutProperty(layer.id, 'visibility', visibility);
      } catch (_) {
        /* ignore */
      }
    });
  };

  const addEsriWorldImageryRaster = () => {
    if (!mapRef.current) return;
    const map = mapRef.current;
    if (!map.getSource(ESRI_WORLD_IMAGERY_SOURCE_ID)) {
      map.addSource(ESRI_WORLD_IMAGERY_SOURCE_ID, {
        type: 'raster',
        tiles: ESRI_WORLD_IMAGERY_TILES,
        tileSize: 256,
        minzoom: 0,
        maxzoom: 19,
      });
    }
    const styleLayers = map.getStyle().layers || [];
    const anchor = styleLayers.find((l) => l.id !== 'background' && l.type !== 'sky')?.id;
    if (!map.getLayer(ESRI_WORLD_IMAGERY_LAYER_ID)) {
      map.addLayer(
        {
          id: ESRI_WORLD_IMAGERY_LAYER_ID,
          type: 'raster',
          source: ESRI_WORLD_IMAGERY_SOURCE_ID,
          paint: {
            'raster-opacity': 1,
          },
        },
        anchor
      );
    } else {
      map.setLayoutProperty(ESRI_WORLD_IMAGERY_LAYER_ID, 'visibility', 'visible');
      stackRasterBasemapAboveBackground(map, ESRI_WORLD_IMAGERY_LAYER_ID);
    }
    setPersistentBaseStyleUnderlayVisibility(false);
    setPersistentBaseLabelsVisibility(true);
    applyCompositeLabelStyleForBasemap(map, 'imagery');
  };

  const hasVisiblePersistentStyleUnderlay = (map) => {
    if (!map?.getStyle) return false;
    try {
      const styleLayers = map.getStyle().layers || [];
      return styleLayers.some((layer) => {
        if (isAppOverlayOrDataLayer(layer)) return false;
        if (layer.type === 'symbol') return false;
        if (layer.id === 'background') return false;
        return map.getLayoutProperty(layer.id, 'visibility') !== 'none';
      });
    } catch (_) {
      return false;
    }
  };

  const isImageryBasemapFullyApplied = (map) => {
    if (!map?.getLayer?.(ESRI_WORLD_IMAGERY_LAYER_ID)) return false;
    try {
      if (map.getLayoutProperty(ESRI_WORLD_IMAGERY_LAYER_ID, 'visibility') === 'none') return false;
    } catch (_) {
      return false;
    }
    return !hasVisiblePersistentStyleUnderlay(map);
  };

  ensureImageryBasemapRef.current = () => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded?.()) return false;
    try {
      addEsriWorldImageryRaster();
      return verifyBasemapAppliedOnMap(map, 'imagery');
    } catch (err) {
      console.error('ensureImageryBasemap failed:', err);
      return false;
    }
  };

  const getMapboxStyleRasterTileUrl = (styleId) =>
    `https://api.mapbox.com/styles/v1/mapbox/${styleId}/tiles/256/{z}/{x}/{y}?access_token=${mapboxgl.accessToken}`;

  const addMapboxStyleRasterOverlay = (sourceId, layerId, styleId) => {
    if (!mapRef.current) return;
    if (!mapRef.current.getSource(sourceId)) {
      mapRef.current.addSource(sourceId, {
        type: 'raster',
        tiles: [getMapboxStyleRasterTileUrl(styleId)],
        tileSize: 256,
        minzoom: 0,
        maxzoom: 22,
      });
    }
    if (!mapRef.current.getLayer(layerId)) {
      mapRef.current.addLayer({
        id: layerId,
        type: 'raster',
        source: sourceId,
        paint: { 'raster-opacity': 1 },
      });
      stackRasterBasemapAboveBackground(mapRef.current, layerId);
    } else {
      mapRef.current.setLayoutProperty(layerId, 'visibility', 'visible');
      stackRasterBasemapAboveBackground(mapRef.current, layerId);
    }
  };

  const hideManagedBasemapOverlays = (keepEsriVisible = false) => {
    const map = mapRef.current;
    if (!map) return;
    [
      TETON_ORTHO_LAYER_ID,
      ...(keepEsriVisible ? [] : [ESRI_WORLD_IMAGERY_LAYER_ID]),
      HIGH_DEF_LAYER_ID,
      SATELLITE_STREETS_OVERLAY_LAYER_ID,
      STREETS_OVERLAY_LAYER_ID,
    ].forEach((id) => {
      if (!map.getLayer(id)) return;
      try {
        map.setLayoutProperty(id, 'visibility', 'none');
      } catch (_) {
        /* ignore */
      }
    });
  };

  const setPersistentBaseLabelsVisibility = (isVisible) => {
    const map = mapRef.current;
    if (!map || !map.getStyle) return;
    const visibility = isVisible ? 'visible' : 'none';
    const styleLayers = map.getStyle().layers || [];
    styleLayers.forEach((layer) => {
      if (layer.type !== 'symbol') return;
      if (layer.source !== 'composite') return;
      try {
        map.setLayoutProperty(layer.id, 'visibility', visibility);
      } catch (_) {
        /* ignore */
      }
    });
  };

  repairBasemapOverlaysRef.current = (basemapId) => {
    const map = mapRef.current;
    if (!map?.isStyleLoaded?.()) return false;
    const id = String(basemapId || '').trim();
    try {
      if (id === 'imagery' || id === 'imagery-3d' || id === 'esri-world-imagery') {
        const repaired = Boolean(ensureImageryBasemapRef.current());
        if (repaired) restackDataLayersAboveBasemapOverlays(map);
        return (
          repaired &&
          verifyBasemapAppliedOnMap(map, id) &&
          !needsBasemapOverlayMaintenance(map, id)
        );
      }
      if (id === 'satellite-streets-v12') {
        hideManagedBasemapOverlays();
        setPersistentBaseStyleUnderlayVisibility(false);
        addMapboxStyleRasterOverlay(
          SATELLITE_STREETS_OVERLAY_SOURCE_ID,
          SATELLITE_STREETS_OVERLAY_LAYER_ID,
          'satellite-v9'
        );
        setPersistentBaseLabelsVisibility(true);
        applyCompositeLabelStyleForBasemap(map, id);
        restackDataLayersAboveBasemapOverlays(map);
        return (
          verifyBasemapAppliedOnMap(map, id) &&
          !needsBasemapOverlayMaintenance(map, id)
        );
      }
      if (id === 'streets-v11') {
        hideManagedBasemapOverlays();
        setPersistentBaseStyleUnderlayVisibility(false);
        addMapboxStyleRasterOverlay(STREETS_OVERLAY_SOURCE_ID, STREETS_OVERLAY_LAYER_ID, 'streets-v11');
        setPersistentBaseLabelsVisibility(false);
        restackDataLayersAboveBasemapOverlays(map);
        return (
          verifyBasemapAppliedOnMap(map, id) &&
          !needsBasemapOverlayMaintenance(map, id)
        );
      }
      if (id === 'outdoors-v12' || id === PERSISTENT_BASE_STYLE_ID) {
        hideManagedBasemapOverlays();
        setPersistentBaseStyleUnderlayVisibility(true);
        setPersistentBaseLabelsVisibility(true);
        return (
          verifyBasemapAppliedOnMap(map, id) &&
          !needsBasemapOverlayMaintenance(map, id)
        );
      }
    } catch (_) {
      /* ignore */
    }
    return false;
  };

  const withPersistentOutdoorsBase = (work) => {
    const map = mapRef.current;
    if (!map || typeof work !== 'function') return;
    const nextStyleUrl = `mapbox://styles/mapbox/${PERSISTENT_BASE_STYLE_ID}`;
    if (currentStyleUrlRef.current === nextStyleUrl && map.isStyleLoaded?.()) {
      work();
      return;
    }
    currentStyleUrlRef.current = nextStyleUrl;
    traceMapboxStyleSwap('persistent-base', nextStyleUrl);
    map.setStyle(nextStyleUrl);
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      try {
        map.off('style.load', finish);
      } catch (_) {
        /* ignore */
      }
      work();
    };
    map.once('style.load', finish);
    window.setTimeout(finish, 10000);
  };

  // Bring all symbol (label) layers to the very top of the stack
  const bringLabelsToTop = useCallback(() => {
    const map = mapRef.current;
    if (!map?.getStyle) return;
    const styleLayers = map.getStyle().layers || [];
    styleLayers.forEach((layer) => {
      if (layer.type !== 'symbol') return;
      try {
        const live = map.getLayer(layer.id);
        if (!live?.layout) return;
        map.moveLayer(layer.id);
      } catch (_) {
        /* layer may be mid-removal */
      }
    });
  }, [mapRef]);

  const clearLabelSourceWaitHandlers = useCallback((map) => {
    if (!map) return;
    labelSourceWaitHandlersRef.current.forEach((handler) => {
      try {
        map.off('sourcedata', handler);
      } catch (_) {
        /* ignore */
      }
    });
    labelSourceWaitHandlersRef.current.clear();
  }, []);

  /** Hide then remove on idle — avoids Mapbox `continuePlacement` / undefined layout crashes. */
  const hideLabelLayerSafe = useCallback((map, labelLayerId) => {
    if (!map?.getLayer(labelLayerId)) return;
    try {
      map.setLayoutProperty(labelLayerId, 'visibility', 'none');
    } catch (_) {
      /* ignore */
    }
    map.once('idle', () => {
      try {
        if (map.getStyle() && map.getLayer(labelLayerId)) {
          map.removeLayer(labelLayerId);
        }
      } catch (_) {
        /* ignore */
      }
    });
  }, []);

  /** Re-pin Regrid after Draw / highlights / labels mutate the layer stack (esp. after basemap setStyle). */
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapIsReady) return undefined;

    /** Layer order + visibility only — no tile reload (reload caused lag + restack feedback). */
    const restack = () => {
      if (!map.isStyleLoaded?.()) return;
      bringRegridParcelLayersBeforeSymbolLabels(map);
      applyParcelVisualizationVisibility(map, parcelMapVisibility);
      setRegridZoningLayersVisibility(map, Boolean(layerStatusRef.current?.regrid_zoning));
      bringLabelsToTop();
      applyCompositeLabelStyleForBasemap(map, regridStyleBasemapRef.current);
      const wantedBasemap = String(
        activeBasemapIdRef?.current || regridStyleBasemapRef.current || ''
      ).trim();
      if (wantedBasemap && needsBasemapOverlayMaintenance(map, wantedBasemap)) {
        repairBasemapOverlaysRef.current(wantedBasemap);
      }
    };

    map.on(CV_REGRID_RESTACK_EVENT, restack);
    return () => {
      map.off(CV_REGRID_RESTACK_EVENT, restack);
    };
  }, [mapRef, mapIsReady, layerStatus, parcelMapVisibility, bringLabelsToTop, activeBasemapIdRef]);

  const applyLabelLayers = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;

    if (!map.isStyleLoaded()) {
      map.once('styledata', applyLabelLayers);
      return;
    }

    clearLabelSourceWaitHandlers(map);

    const syncLabelLayer = (layerName, shouldShowLabels) => {
      const labelLayerId =
        layerName === 'ownership' ? 'ownership-label-layer' : `${layerName}-label-layer`;
      const labelSourceId = layerName === 'ownership' ? 'regrid-parcels' : layerName;

      if (!shouldShowLabels) {
        hideLabelLayerSafe(map, labelLayerId);
        return;
      }

      if (!map.getSource(labelSourceId)) {
        return;
      }

      const addOrShowLabelLayer = () => {
        if (!map.getSource(labelSourceId)) return;
        if (map.getLayer(labelLayerId)) {
          try {
            map.setLayoutProperty(labelLayerId, 'visibility', 'visible');
          } catch (_) {
            /* ignore */
          }
          return;
        }
        try {
          const labelStyle =
            layerName === 'ownership'
              ? getLabelLayerStyle('ownership', {
                  regridVectorSourceLayer: getRegridVectorSourceLayerId(cachedRegridTileJson),
                })
              : getLabelLayerStyle(layerName);
          map.addLayer(labelStyle);
        } catch (error) {
          console.error(`Error adding label layer ${labelLayerId}:`, error);
        }
      };

      const source = map.getSource(labelSourceId);
      if (source?.loaded?.()) {
        addOrShowLabelLayer();
        return;
      }

      const prior = labelSourceWaitHandlersRef.current.get(layerName);
      if (prior) {
        try {
          map.off('sourcedata', prior);
        } catch (_) {
          /* ignore */
        }
      }

      const sourceDataHandler = (e) => {
        if (e.sourceId !== labelSourceId || !e.isSourceLoaded) return;
        if (!layerLabelsRef.current[layerName]) {
          map.off('sourcedata', sourceDataHandler);
          labelSourceWaitHandlersRef.current.delete(layerName);
          return;
        }
        addOrShowLabelLayer();
        map.off('sourcedata', sourceDataHandler);
        labelSourceWaitHandlersRef.current.delete(layerName);
      };
      labelSourceWaitHandlersRef.current.set(layerName, sourceDataHandler);
      map.on('sourcedata', sourceDataHandler);
    };

    Object.entries(layerLabels).forEach(([layerName, shouldShowLabels]) => {
      const showLabels =
        layerName === 'ownership'
          ? Boolean(shouldShowLabels) && Boolean(layerStatus.ownership)
          : Boolean(shouldShowLabels);
      syncLabelLayer(layerName, showLabels);
    });

    map.once('idle', () => {
      if (!mapRef.current || map !== mapRef.current) return;
      bringLabelsToTop();
      fireRegridRestack(map);
    });
  }, [
    layerLabels,
    layerStatus,
    mapRef,
    bringLabelsToTop,
    clearLabelSourceWaitHandlers,
    hideLabelLayerSafe,
  ]);

  useEffect(() => {
    applyLabelLayers();
    return () => {
      clearLabelSourceWaitHandlers(mapRef.current);
    };
  }, [applyLabelLayers, clearLabelSourceWaitHandlers]);

  const handleSetTetonOrthoBasemap = (onReady) => {
    if (!mapRef.current) return;
    baseMapRef.current = 'teton-ortho-2024';
    setBasemap('teton-ortho-2024');
    const nextStyleUrl = 'mapbox://styles/mapbox/outdoors-v12';
    // Use satellite streets, then overlay raster
    traceMapboxStyleSwap('teton-ortho', nextStyleUrl);
    const onStyleReady = () => {
      ownershipTilesTrace('basemap style.load fired', { context: 'teton-ortho' });
      try {
        addTetonOrthoRaster();
      } catch (e) {
        console.error('Failed to add Teton Ortho raster:', e);
      }
      void updateLayers().then(() => {
        bringLabelsToTop();
        if (selectedFeature?.length > 0) {
          highlightFeature(selectedFeature);
        }
        restackDataAndParcelsOnce();
        try {
          onReady?.();
        } catch (_) {
          /* ignore */
        }
      });
    };
    if (currentStyleUrlRef.current === nextStyleUrl && mapRef.current.isStyleLoaded?.()) {
      onStyleReady();
      return;
    }
    currentStyleUrlRef.current = nextStyleUrl;
    mapRef.current.setStyle(nextStyleUrl);
    mapRef.current.once('style.load', onStyleReady);
  };

  const handleSetEsriWorldImageryBasemap = () => {
    if (!mapRef.current) return;
    handleSetImageryBasemap(false);
  };

  const handleSetImageryBasemap = (enable3D = false, onReady) => {
    if (!mapRef.current) {
      basemapApplyInProgressRef.current = false;
      restoringPrintBasemapRef.current = false;
      try {
        onReady?.();
      } catch (_) {
        /* ignore */
      }
      return;
    }

    // Preserve the 3D toggle across basemap switches — only force-on for explicit `imagery-3d` ids.
    if (enable3D) setIs3DEnabled(true);
    const basemapId =
      enable3D || is3DEnabledRef.current ? 'imagery-3d' : 'imagery';
    basemapApplyGenerationRef.current += 1;
    basemapApplyInProgressRef.current = true;
    const applyGeneration = basemapApplyGenerationRef.current;
    publishBasemapSelection(basemapId);

    const runImageryBasemapBody = () => {
      let done = false;
      const finishReady = () => {
        if (done) return;
        if (applyGeneration !== basemapApplyGenerationRef.current) return;
        const map = mapRef.current;
        let applied =
          map &&
          verifyBasemapAppliedOnMap(map, basemapId) &&
          !needsBasemapOverlayMaintenance(map, basemapId);
        if (!applied) {
          try {
            repairBasemapOverlaysRef.current(basemapId);
          } catch (_) {
            /* ignore */
          }
          applied =
            map &&
            verifyBasemapAppliedOnMap(map, basemapId) &&
            !needsBasemapOverlayMaintenance(map, basemapId);
        }
        if (!applied) return;
        done = true;
        lastAppliedBasemapRef.current = basemapId;
        needsInitialBasemapApplyRef.current = false;
        initialBasemapRestoreCompleteRef.current = true;
        basemapApplyInProgressRef.current = false;
        restoringPrintBasemapRef.current = false;
        basemapRestoreBlockingLayersRef.current = false;
        try {
          onReady?.();
        } catch (_) {
          /* ignore */
        }
      };

      ownershipTilesTrace('basemap overlay applied', {
        context: enable3D ? 'imagery-3d' : 'imagery',
      });
      try {
        ensureImageryBasemapRef.current();
      } catch (e) {
        console.error('Failed to add Imagery overlay:', e);
      }

      const applyPostLayerEnhancements = () => {
        applyBasemapEnhancements();
        bringLabelsToTop();
        if (selectedFeature?.length > 0) {
          highlightFeature(selectedFeature);
        }
        restackDataAndParcelsOnce();
      };

      const runLayerSync = () => {
        basemapRestoreBlockingLayersRef.current = false;
        try {
          const maybePromise = updateLayers();
          return Promise.resolve(maybePromise)
            .then(() => {
              applyPostLayerEnhancements();
              finishReady();
            })
            .catch(() => {
              applyPostLayerEnhancements();
              finishReady();
            });
        } catch (_) {
          applyPostLayerEnhancements();
          finishReady();
          return Promise.resolve();
        }
      };

      runLayerSync();
      // Unblock reconcile retries if overlay never becomes visible (do not mark lastApplied).
      window.setTimeout(() => {
        if (done) return;
        basemapApplyInProgressRef.current = false;
        restoringPrintBasemapRef.current = false;
        basemapRestoreBlockingLayersRef.current = false;
      }, 2000);
    };

    const map = mapRef.current;
    let styleReady = false;
    try {
      styleReady = typeof map.isStyleLoaded === 'function' && map.isStyleLoaded();
    } catch (_) {
      styleReady = false;
    }

    /**
     * Same style URL as flat Imagery; avoid setStyle (often no style.load) when upgrading to 3D only.
     */
    if (enable3D && baseMapRef.current === 'imagery' && styleReady) {
      publishBasemapSelection('imagery-3d');
      traceMapboxStyleSwap('imagery-in-place-3d', 'no setStyle (persistent outdoors-v12)');
      runImageryBasemapBody();
      return;
    }

    withPersistentOutdoorsBase(() => {
      hideManagedBasemapOverlays(true);
      runImageryBasemapBody();
    });
  };

  // =============== Custom Raster Basemap: High Def 3 Inch ===============
  const HIGH_DEF_TILES = [
    'https://storage.googleapis.com/teton-county-gis-bucket/teton_high_def_V2/tiles_all_3inch/{z}/{x}/{y}.png'
  ];

  const addHighDefRaster = () => {
    if (!mapRef.current) {
      console.error('❌ addHighDefRaster: mapRef.current is null!');
      return;
    }
    console.log('img️ Adding High Def 3 Inch raster layer...');
    console.log('img️ Map style loaded?', mapRef.current.isStyleLoaded());
    console.log('img️ Map loaded?', mapRef.current.loaded());
    
    // Remove existing layer and source if they exist (to ensure fresh config without bounds)
    if (mapRef.current.getLayer(HIGH_DEF_LAYER_ID)) {
      console.log('🗑️ Removing existing High Def layer...');
      mapRef.current.removeLayer(HIGH_DEF_LAYER_ID);
    }
    if (mapRef.current.getSource(HIGH_DEF_SOURCE_ID)) {
      console.log('🗑️ Removing existing High Def source...');
      mapRef.current.removeSource(HIGH_DEF_SOURCE_ID);
    }
    
    // Add raster source (always recreate to ensure latest config)
    console.log('📦 Creating High Def source with tiles:', HIGH_DEF_TILES);
    // Note: transformRequest is set globally at map initialization, so TMS conversion will happen automatically
    
    try {
      mapRef.current.addSource(HIGH_DEF_SOURCE_ID, {
        type: 'raster',
        tiles: HIGH_DEF_TILES,
        tileSize: 256,
        minzoom: 6,
        maxzoom: 19, // Match the Leaflet example maxZoom
        // Remove scheme: 'tms' since we're handling conversion manually via transformRequest
        // Removed bounds to allow all tiles to load (bounds were cutting off bottom tiles)
      });
      console.log('✅ High Def source added successfully');
    } catch (error) {
      console.error('❌ Error adding High Def source:', error);
      return;
    }
      
      // Listen for tile loading events
      mapRef.current.on('sourcedata', (e) => {
        if (e.sourceId === HIGH_DEF_SOURCE_ID) {
          if (e.isSourceLoaded) {
            console.log('✅ High Def source loaded successfully');
          } else if (e.tile) {
            if (e.tile.state === 'errored') {
              console.error('❌ High Def tile error:', e.tile.url);
            } else if (e.tile.state === 'loaded') {
              console.log('✅ High Def tile loaded:', e.tile.url);
            }
          }
        }
      });
    // Insert raster layer right after base map layers, but below all data layers and drawing layers
    // Layer order (bottom to top): Base map -> High-def raster -> Data layers -> Drawing layers
    const styleLayers = mapRef.current.getStyle().layers || [];
    console.log('📋 Style layers count:', styleLayers.length);
    
    // Find where to insert: right after base map, but before any data layers
    // We want high-def to be below data layers (like ownership) but above base map
    let beforeId = undefined;
    
    // First, try to find data layers (end with -layer) - we want high-def BELOW these
    const firstDataLayer = styleLayers.find(l => 
      l.id.endsWith('-layer') && 
      !l.id.startsWith('gl-draw-') &&
      l.id !== 'measurement-labels-layer' &&
      l.id !== HIGH_DEF_LAYER_ID
    );
    if (firstDataLayer) {
      beforeId = firstDataLayer.id;
      console.log('📍 Adding High Def layer before data layer (will be below data layers):', beforeId);
    } else {
      // Look for Mapbox Draw layers - we want high-def BELOW these too
      const drawLayer = styleLayers.find(l => l.id.startsWith('gl-draw-'));
      if (drawLayer) {
        beforeId = drawLayer.id;
        console.log('📍 Adding High Def layer before Mapbox Draw layer (will be below drawings):', beforeId);
      } else {
        // Look for measurement labels layer - we want high-def BELOW this
        const measurementLayer = styleLayers.find(l => l.id === 'measurement-labels-layer');
        if (measurementLayer) {
          beforeId = measurementLayer.id;
          console.log('📍 Adding High Def layer before measurement labels (will be below measurements):', beforeId);
        } else {
          // Look for symbol layers (labels) but skip Mapbox Draw and measurement labels
          const firstLabelLayer = styleLayers.find(l => 
            l.type === 'symbol' && 
            l.id.includes('label') && 
            !l.id.startsWith('gl-draw-') &&
            l.id !== 'measurement-labels-layer'
          );
          if (firstLabelLayer) {
            beforeId = firstLabelLayer.id;
            console.log('📍 Adding High Def layer before label layer:', beforeId);
          } else {
            // Add at the very bottom (right after base map layers)
            // No beforeId means it goes to the bottom of the stack
            console.log('📍 Adding High Def layer at the bottom (after base map)');
          }
        }
      }
    }
    
    if (!mapRef.current.getLayer(HIGH_DEF_LAYER_ID)) {
      try {
        mapRef.current.addLayer({
          id: HIGH_DEF_LAYER_ID,
          type: 'raster',
          source: HIGH_DEF_SOURCE_ID,
          paint: {
            'raster-opacity': 1
          }
        }, beforeId);
        console.log('✅ High Def layer added successfully');
      } catch (error) {
        console.error('❌ Error adding High Def layer:', error);
      }
    } else {
      console.log('ℹ️ High Def layer already exists, moving to correct position');
      // If layer exists, move it to the correct position (below drawings)
      try {
        if (beforeId) {
          mapRef.current.moveLayer(HIGH_DEF_LAYER_ID, beforeId);
        } else {
          // Move to bottom if no beforeId
          const allLayers = mapRef.current.getStyle().layers || [];
          if (allLayers.length > 0) {
            mapRef.current.moveLayer(HIGH_DEF_LAYER_ID, allLayers[0].id);
          }
        }
        console.log('✅ High Def layer moved to correct position (below drawings)');
      } catch (error) {
        console.error('❌ Error moving High Def layer:', error);
      }
    }
  };

  const removeContourLayers = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;
    [
      'contour-labels-minor',
      'contour-labels-major',
      'contour-lines-minor',
      'contour-lines-major',
      'terrain-colors',
    ].forEach((id) => {
      try {
        if (map.getLayer(id)) map.removeLayer(id);
      } catch (_) {
        /* ignore */
      }
    });
  }, [mapRef]);

  const BUILDINGS_3D_LAYER_ID = 'cv-3d-buildings-layer';

  const ensure3DBuildingsLayer = useCallback(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded?.()) return;
    if (!map.getSource('composite')) return;
    const styleLayers = map.getStyle().layers || [];
    const firstSymbolLayer = styleLayers.find((layer) => layer.type === 'symbol');
    const beforeId = firstSymbolLayer ? firstSymbolLayer.id : undefined;
    if (!map.getLayer(BUILDINGS_3D_LAYER_ID)) {
      map.addLayer(
        {
          id: BUILDINGS_3D_LAYER_ID,
          source: 'composite',
          'source-layer': 'building',
          filter: [
            'any',
            ['==', ['get', 'extrude'], 'true'],
            ['==', ['get', 'extrude'], true],
          ],
          type: 'fill-extrusion',
          minzoom: 14.5,
          paint: {
            'fill-extrusion-color': '#b3b3b3',
            'fill-extrusion-height': ['coalesce', ['get', 'height'], 0],
            'fill-extrusion-base': ['coalesce', ['get', 'min_height'], 0],
            'fill-extrusion-opacity': 0.65,
          },
        },
        beforeId
      );
    } else {
      map.setLayoutProperty(BUILDINGS_3D_LAYER_ID, 'visibility', 'visible');
      if (beforeId) {
        try {
          map.moveLayer(BUILDINGS_3D_LAYER_ID, beforeId);
        } catch (_) {
          /* ignore */
        }
      }
    }
  }, [mapRef]);

  const remove3DBuildingsLayer = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;
    try {
      if (map.getLayer(BUILDINGS_3D_LAYER_ID)) {
        map.removeLayer(BUILDINGS_3D_LAYER_ID);
      }
    } catch (_) {
      /* ignore */
    }
  }, [mapRef]);

  const ensureContourLayers = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;
    if (!map.getSource('contour-lines-source')) {
      map.addSource('contour-lines-source', {
        type: 'vector',
        url: 'mapbox://mapbox.mapbox-terrain-v2',
      });
    }
    const styleLayers = map.getStyle().layers || [];
    const beforeLayer = styleLayers.find((layer) => layer.type === 'symbol' && layer.id.includes('label'));
    const beforeId = beforeLayer ? beforeLayer.id : undefined;
    if (!map.getLayer('contour-lines-major')) {
      map.addLayer({
        id: 'contour-lines-major',
        type: 'line',
        source: 'contour-lines-source',
        'source-layer': 'contour',
        filter: ['==', ['%', ['get', 'ele'], 100], 0],
        paint: { 'line-color': '#FF4500', 'line-width': 1.5, 'line-opacity': 0.9 },
      }, beforeId);
    }
    if (!map.getLayer('contour-lines-minor')) {
      map.addLayer({
        id: 'contour-lines-minor',
        type: 'line',
        source: 'contour-lines-source',
        'source-layer': 'contour',
        filter: ['!=', ['%', ['get', 'ele'], 100], 0],
        paint: { 'line-color': '#FF4500', 'line-width': 1.0, 'line-opacity': 0.6 },
      }, beforeId);
    }
  }, [mapRef]);

  const applyBasemapEnhancements = useCallback(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded?.()) return;
    if (is3DEnabled) {
      try {
        if (!map.getSource('mapbox-dem')) {
          map.addSource('mapbox-dem', {
            type: 'raster-dem',
            url: 'mapbox://mapbox.terrain-rgb',
            tileSize: 512,
            maxzoom: 14,
          });
        }
        map.setTerrain({ source: 'mapbox-dem', exaggeration: 1.5 });
        if (!map.getLayer('sky')) {
          map.addLayer({
            id: 'sky',
            type: 'sky',
            paint: {
              'sky-type': 'atmosphere',
              'sky-atmosphere-sun': [0.0, 0.0],
              'sky-atmosphere-sun-intensity': 15,
            },
          });
        }
        ensure3DBuildingsLayer();
      } catch (_) {
        /* ignore */
      }
    } else {
      try {
        map.setTerrain(null);
      } catch (_) {
        /* ignore */
      }
      try {
        if (map.getLayer('sky')) map.removeLayer('sky');
      } catch (_) {
        /* ignore */
      }
      remove3DBuildingsLayer();
    }
    if (isContoursEnabled) {
      try {
        ensureContourLayers();
      } catch (_) {
        /* ignore */
      }
    } else {
      removeContourLayers();
    }
    try {
      if (parcelMapVisibilityRef.current?.showRegrid) {
        bringRegridParcelLayersBeforeSymbolLabels(map);
        applyParcelVisualizationVisibility(map, parcelMapVisibilityRef.current);
      }
      bringLabelsToTop();
      applyCompositeLabelStyleForBasemap(map, regridStyleBasemapRef.current);
    } catch (_) {
      /* ignore */
    }
  }, [mapRef, is3DEnabled, isContoursEnabled, ensureContourLayers, removeContourLayers, ensure3DBuildingsLayer, remove3DBuildingsLayer, bringLabelsToTop]);

  /** Restack data + parcel layers above basemap rasters — no zoom nudge or staged reloads. */
  const restackDataAndParcelsOnce = useCallback(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded?.()) return;
    try {
      restackDataLayersAboveBasemapOverlays(map);
      syncRegridParcelLayersIntoMap(map, parcelMapVisibilityRef.current);
      bringRegridParcelLayersBeforeSymbolLabels(map);
      applyParcelVisualizationVisibility(map, parcelMapVisibilityRef.current);
      bringLabelsToTop();
      applyCompositeLabelStyleForBasemap(map, regridStyleBasemapRef.current);
      const wantedBasemap = String(
        activeBasemapIdRef?.current || regridStyleBasemapRef.current || ''
      ).trim();
      if (wantedBasemap && needsBasemapOverlayMaintenance(map, wantedBasemap)) {
        repairBasemapOverlaysRef.current(wantedBasemap);
      }
      fireRegridRestack(map);
      if (typeof map.triggerRepaint === 'function') map.triggerRepaint();
    } catch (_) {
      /* ignore */
    }
  }, [mapRef, activeBasemapIdRef]);

  /** @deprecated Use restackDataAndParcelsOnce — updateLayers already reloads tile sources. */
  const refreshOwnershipAfterBasemapSwap = restackDataAndParcelsOnce;

  /** Unblock layerStatus effect and run one final stack sync (saved print map open / basemap restore). */
  const finishBasemapApplyRef = useRef(() => {});
  finishBasemapApplyRef.current = ({ layersAlreadySynced = false } = {}) => {
    basemapRestoreBlockingLayersRef.current = false;
    restoringPrintBasemapRef.current = false;
    basemapApplyInProgressRef.current = false;
    const map = mapRef.current;
    if (!map) return;

    const run = () => {
      if (!layersAlreadySynced) {
        void Promise.resolve(updateLayers()).then(() => {
          try {
            applyLabelLayers();
          } catch (_) {
            /* ignore */
          }
          restackDataAndParcelsOnce();
        });
        return;
      }
      restackDataAndParcelsOnce();
      try {
        applyParcelVisualizationVisibility(map, parcelMapVisibilityRef.current);
      } catch (_) {
        /* ignore */
      }
    };

    if (map.isStyleLoaded?.()) {
      run();
      return;
    }
    map.once('idle', run);
  };

  useEffect(() => {
    window.setBasemapLayerSyncBlocked = (blocked) => {
      const on = Boolean(blocked);
      basemapRestoreBlockingLayersRef.current = on;
      if (on) {
        restoringPrintBasemapRef.current = true;
        basemapApplyInProgressRef.current = true;
        const map = mapRef.current;
        if (map?.isStyleLoaded?.()) {
          try {
            applyParcelVisualizationVisibility(map, { showRegrid: false });
          } catch (_) {
            /* ignore */
          }
        }
      }
    };
    return () => {
      delete window.setBasemapLayerSyncBlocked;
    };
  }, []);

  useEffect(() => {
    if (!mapIsReady || !mapRef.current?.isStyleLoaded?.()) return;
    applyBasemapEnhancements();
  }, [mapIsReady, applyBasemapEnhancements]);

  /**
   * First map ready: one full applyBasemapById for URL/context basemap.
   * After that: debounced overlay repair only — never re-run setStyle on zoom/ownership churn.
   */
  useEffect(() => {
    const map = mapRef.current;
    if (!mapIsReady || !map?.isStyleLoaded?.()) return undefined;

    const getWantedBasemapId = () => {
      const params = queryString.parse(window.location.search);
      const fromUrl =
        params.basemap != null && String(params.basemap).trim() !== ''
          ? String(params.basemap).trim()
          : '';
      return String(
        fromUrl ||
          activeBasemapIdRef?.current ||
          urlBasemapIdRef.current ||
          currentBasemapId ||
          baseMapRef.current ||
          DEFAULT_BASEMAP_ID
      ).trim();
    };

    const syncBasemapIfNeeded = () => {
      if (basemapRestoreBlockingLayersRef.current || basemapApplyInProgressRef.current) return;
      // Init `once('idle')` owns the first URL → basemap apply; reconcile only repairs after that.
      if (!initialBasemapRestoreCompleteRef.current) return;

      const wanted = getWantedBasemapId();
      if (!wanted) return;

      const map = mapRef.current;
      const overlaysOk =
        verifyBasemapAppliedOnMap(map, wanted) &&
        !needsBasemapOverlayMaintenance(map, wanted);

      if (overlaysOk) {
        lastAppliedBasemapRef.current = activeBasemapIdRef?.current || wanted;
        needsInitialBasemapApplyRef.current = false;
        initialBasemapRestoreCompleteRef.current = true;
        return;
      }

      // Lightweight overlay repair only — never setStyle on zoom / layer churn.
      if (repairBasemapOverlaysRef.current(wanted)) {
        lastAppliedBasemapRef.current = activeBasemapIdRef?.current || wanted;
      }
    };

    syncBasemapIfNeeded();

    let debounceId;
    const onIdle = () => {
      window.clearTimeout(debounceId);
      debounceId = window.setTimeout(syncBasemapIfNeeded, 700);
    };
    map.on('idle', onIdle);

    return () => {
      window.clearTimeout(debounceId);
      try {
        map.off('idle', onIdle);
      } catch (_) {
        /* ignore */
      }
    };
  }, [mapIsReady, currentBasemapId]);

  /** Re-apply when the URL `basemap` param changes after initial load (back/forward, edited address bar). */
  useEffect(() => {
    const fromUrl = getBasemapIdFromSearch(window.location.search);
    const hadParam = queryString.parse(window.location.search).basemap != null;
    if (!hadParam && fromUrl === DEFAULT_BASEMAP_ID) {
      prevUrlBasemapRef.current = fromUrl;
      return;
    }
    if (fromUrl === prevUrlBasemapRef.current) return;
    prevUrlBasemapRef.current = fromUrl;

    if (!initialBasemapRestoreCompleteRef.current) return;

    urlBasemapIdRef.current = fromUrl;
    publishBasemapSelection(fromUrl);

    if (!mapIsReady || !mapRef.current?.isStyleLoaded?.()) return;
    applyBasemapByIdRef.current(fromUrl);
  }, [routerLocation.search, mapIsReady, publishBasemapSelection]);

  const handleSetHighDefBasemap = (enable3D = false, onReady) => {
    if (!mapRef.current) {
      try {
        onReady?.();
      } catch (_) {
        /* ignore */
      }
      return;
    }
    setIs3DEnabled(enable3D);

    /** Shared finish path after style is ready (or already satellite-streets with high-def flat). */
    const runHighDefBasemapBody = () => {
      let done = false;
      const finishReady = () => {
        if (done) return;
        done = true;
        try {
          onReady?.();
        } catch (_) {
          /* ignore */
        }
      };
      ownershipTilesTrace('basemap style.load fired', { context: 'high-def-3inch' });
      try {
        if (enable3D) {
          try {
            if (!mapRef.current.getSource('mapbox-dem')) {
              mapRef.current.addSource('mapbox-dem', {
                type: 'raster-dem',
                url: 'mapbox://mapbox.terrain-rgb',
                tileSize: 512,
                maxzoom: 14,
              });
            }

            mapRef.current.setTerrain({ source: 'mapbox-dem', exaggeration: 1.5 });

            if (!mapRef.current.getLayer('sky')) {
              mapRef.current.addLayer({
                id: 'sky',
                type: 'sky',
                paint: {
                  'sky-type': 'atmosphere',
                  'sky-atmosphere-sun': [0.0, 0.0],
                  'sky-atmosphere-sun-intensity': 15,
                },
              });
            }

            mapRef.current.setPitch(60);
            mapRef.current.setBearing(-60);
            console.log('✅ 3D terrain enabled for High Def basemap');
          } catch (err) {
            console.error('🔥 Error enabling 3D terrain:', err);
          }
        } else {
          mapRef.current.setTerrain(null);
          mapRef.current.setPitch(0);
          mapRef.current.setBearing(0);
        }

        addHighDefRaster();
      } catch (e) {
        console.error('Failed to add High Def raster:', e);
      }
      /** Some basemap/style races can leave updateLayers unresolved on first tour load. */
      const applyPostLayerEnhancements = () => {
        applyLabelLayers();
        bringLabelsToTop();
        if (selectedFeature?.length > 0) {
          highlightFeature(selectedFeature);
        }
        schedulePostBasemapRegridRestack(mapRef);
        refreshOwnershipAfterBasemapSwap();
      };
      try {
        const maybePromise = updateLayers();
        Promise.resolve(maybePromise)
          .then(() => {
            applyPostLayerEnhancements();
            finishReady();
          })
          .catch(() => {
            applyPostLayerEnhancements();
            finishReady();
          });
      } catch (_) {
        applyPostLayerEnhancements();
        finishReady();
      }
      // Failsafe: unblock tour camera even if Mapbox/style callbacks hang.
      window.setTimeout(() => {
        finishReady();
      }, 1200);
    };

    /**
     * Default client view is already `satellite-streets-v12` under high-def flat. Calling setStyle with
     * the same URL often never fires `style.load`, so tour 3D upgrade would hang. Upgrade in place.
     */
    const map = mapRef.current;
    let styleReady = false;
    try {
      styleReady = typeof map.isStyleLoaded === 'function' && map.isStyleLoaded();
    } catch (_) {
      styleReady = false;
    }
    if (enable3D && baseMapRef.current === 'high-def-3inch' && styleReady) {
      baseMapRef.current = 'high-def-3inch-3d';
      setBasemap('high-def-3inch-3d');
      traceMapboxStyleSwap('high-def-3inch-in-place-3d', 'no setStyle (already satellite-streets)');
      runHighDefBasemapBody();
      return;
    }

    baseMapRef.current = enable3D ? 'high-def-3inch-3d' : 'high-def-3inch';
    setBasemap(enable3D ? 'high-def-3inch-3d' : 'high-def-3inch');
    traceMapboxStyleSwap('high-def-3inch', 'mapbox://styles/mapbox/satellite-streets-v12');
    map.setStyle('mapbox://styles/mapbox/satellite-streets-v12');
    map.once('style.load', runHighDefBasemapBody);
  };

  if (applyTourPropertyBasemapRef) {
    applyTourPropertyBasemapRef.current = async () => {
      if (!mapRef.current) return;
      try {
        if (baseMapRef.current === 'imagery-3d') return;
      } catch (_) {
        /* ignore */
      }
      await Promise.race([
        new Promise((resolve) => {
          try {
            handleSetImageryBasemap(true, () => resolve());
          } catch (_) {
            resolve();
          }
        }),
        new Promise((resolve) => window.setTimeout(resolve, 8000)),
      ]);
    };
  }
  
  // Expose handler to window for URL parameter initialization
  window.handleSetHighDefBasemap = handleSetHighDefBasemap;

  /**=============== High Def with Topo Lines ===============
   * Combines high-def imagery with contour lines (topo lines)
   * 
   * @param {boolean} enable3D - Whether to enable 3D terrain
   */
  const handleSetHighDefWithTopo = (enable3D = false, onReady) => {
    if (!mapRef.current) return;
    setIs3DEnabled(enable3D);
    setIsContoursEnabled(true);
    baseMapRef.current = enable3D ? 'high-def-3inch-topo-3d' : 'high-def-3inch-topo';
    setBasemap(enable3D ? 'high-def-3inch-topo-3d' : 'high-def-3inch-topo');
    
    // Use satellite streets as base style
    traceMapboxStyleSwap('high-def-topo', 'mapbox://styles/mapbox/satellite-streets-v12');
    mapRef.current.setStyle('mapbox://styles/mapbox/satellite-streets-v12');
    
    mapRef.current.once('style.load', () => {
      ownershipTilesTrace('basemap style.load fired', { context: 'high-def-topo' });
      console.log('✅ Map style loaded; applying High Def + Topo');
      
      try {
        // Enable 3D terrain if requested
        if (enable3D) {
          if (!mapRef.current.getSource('mapbox-dem')) {
            mapRef.current.addSource('mapbox-dem', {
              type: 'raster-dem',
              url: 'mapbox://mapbox.terrain-rgb',
              tileSize: 512,
              maxzoom: 14,
            });
          }
          mapRef.current.setTerrain({ source: 'mapbox-dem', exaggeration: 1.5 });
          if (!mapRef.current.getLayer('sky')) {
            mapRef.current.addLayer({
              id: 'sky',
              type: 'sky',
              paint: {
                'sky-type': 'atmosphere',
                'sky-atmosphere-sun': [0.0, 0.0],
                'sky-atmosphere-sun-intensity': 15,
              },
            });
          }
          mapRef.current.setPitch(60);
          mapRef.current.setBearing(-60);
        } else {
          mapRef.current.setTerrain(null);
          mapRef.current.setPitch(0);
          mapRef.current.setBearing(0);
        }
        
        // Add high-def raster layer
        addHighDefRaster();
        
        // Remove existing contour layers if they exist
        if (mapRef.current.getLayer('terrain-colors')) {
          mapRef.current.removeLayer('terrain-colors');
        }
        if (mapRef.current.getLayer('contour-lines-major')) {
          mapRef.current.removeLayer('contour-lines-major');
        }
        if (mapRef.current.getLayer('contour-lines-minor')) {
          mapRef.current.removeLayer('contour-lines-minor');
        }
        if (mapRef.current.getLayer('contour-labels-major')) {
          mapRef.current.removeLayer('contour-labels-major');
        }
        if (mapRef.current.getLayer('contour-labels-minor')) {
          mapRef.current.removeLayer('contour-labels-minor');
        }
        
        // Find a good place to insert the layers (before labels, after high-def)
        const styleLayers = mapRef.current.getStyle().layers || [];
        const beforeLayer = styleLayers.find(layer => 
          layer.type === 'symbol' && layer.id.includes('label')
        );
        const beforeId = beforeLayer ? beforeLayer.id : undefined;
        
        // Add hillshade for terrain visualization (optional, can be removed if too dark)
        try {
          if (!mapRef.current.getLayer('terrain-colors')) {
            if (!mapRef.current.getSource('terrain-hillshade')) {
              mapRef.current.addSource('terrain-hillshade', {
                type: 'raster-dem',
                url: 'mapbox://mapbox.terrain-rgb',
                tileSize: 512,
                maxzoom: 14
              });
            }
            
            mapRef.current.addLayer({
              id: 'terrain-colors',
              type: 'hillshade',
              source: 'terrain-hillshade',
              paint: {
                'hillshade-exaggeration': 0.5, // Lower exaggeration so it doesn't darken the high-def imagery too much
                'hillshade-illumination-direction': 315,
                'hillshade-illumination-anchor': 'viewport'
              }
            }, beforeId);
          }
        } catch (error) {
          console.error('Error adding hillshade:', error);
        }
        
        // Add contour lines source
        if (!mapRef.current.getSource('contour-lines-source')) {
          mapRef.current.addSource('contour-lines-source', {
            type: 'vector',
            url: 'mapbox://mapbox.mapbox-terrain-v2'
          });
        }
        
        // Wait for contour source to load
        const addContourLayers = () => {
          if (!mapRef.current.getSource('contour-lines-source')) return;
          
          const beforeLayer = mapRef.current.getStyle().layers.find(layer => 
            layer.type === 'symbol' && layer.id.includes('label')
          );
          const beforeId = beforeLayer ? beforeLayer.id : undefined;
          
          try {
            // Add major contour lines
            mapRef.current.addLayer({
              id: 'contour-lines-major',
              type: 'line',
              source: 'contour-lines-source',
              'source-layer': 'contour',
              filter: ['==', ['%', ['get', 'ele'], 100], 0],
              paint: {
                'line-color': '#FF4500',
                'line-width': 1.5,
                'line-opacity': 0.9
              }
            }, beforeId);
            
            // Add minor contour lines
            mapRef.current.addLayer({
              id: 'contour-lines-minor',
              type: 'line',
              source: 'contour-lines-source',
              'source-layer': 'contour',
              filter: ['!=', ['%', ['get', 'ele'], 100], 0],
              paint: {
                'line-color': '#FF4500',
                'line-width': 1.0,
                'line-opacity': 0.6
              }
            }, beforeId);
            
            // Add elevation labels
            mapRef.current.addLayer({
              id: 'contour-labels-major',
              type: 'symbol',
              source: 'contour-lines-source',
              'source-layer': 'contour',
              filter: ['==', ['%', ['get', 'ele'], 100], 0],
              layout: {
                'symbol-placement': 'line',
                'text-field': [
                  'concat',
                  ['to-string', ['round', ['*', ['get', 'ele'], 3.28084]]],
                  ' ft'
                ],
                'text-font': ['Open Sans Regular', 'Arial Unicode MS Regular'],
                'text-size': 11,
                'text-rotation-alignment': 'map',
                'text-pitch-alignment': 'viewport'
              },
              paint: {
                'text-color': '#333333',
                'text-halo-color': '#ffffff',
                'text-halo-width': 2,
                'text-halo-blur': 1
              }
            }, beforeId);
          } catch (err) {
            console.log('Note: Contour lines may not be available', err);
          }
        };
        
        // Wait for contour source to load
        mapRef.current.once('sourcedata', (e) => {
          if (e.sourceId === 'contour-lines-source' && e.isSourceLoaded) {
            addContourLayers();
          }
        });
        
        // Try to add immediately if source is already loaded
        setTimeout(addContourLayers, 100);
        
      } catch (err) {
        console.error("🔥 Error adding High Def + Topo:", err);
      }
      
      void updateLayers().then(() => {
        applyLabelLayers();
        bringLabelsToTop();
        if (selectedFeature?.length > 0) {
          highlightFeature(selectedFeature);
        }
        schedulePostBasemapRegridRestack(mapRef);
        refreshOwnershipAfterBasemapSwap();
        try {
          onReady?.();
        } catch (_) {
          /* ignore */
        }
      });
    });
  };
  
  // Expose handler to window for URL parameter initialization
  window.handleSetHighDefWithTopo = handleSetHighDefWithTopo;

  // =============== Custom Raster Basemap: Test ===============
  const TEST_SOURCE_ID = 'test-source';
  const TEST_LAYER_ID = 'test-layer';
  const TEST_TILES = [
    'http://localhost:8004/{z}/{x}/{y}.png'
  ];

  const addTestRaster = () => {
    if (!mapRef.current) return;
    console.log('img️ Adding test raster layer...');
    
    // Add raster source if missing
    if (!mapRef.current.getSource(TEST_SOURCE_ID)) {
      console.log('📦 Creating test source with tiles:', TEST_TILES);
      mapRef.current.addSource(TEST_SOURCE_ID, {
        type: 'raster',
        tiles: TEST_TILES,
        tileSize: 256,
        minzoom: 0,
        maxzoom: 22,
        scheme: 'tms'  // Use TMS tile scheme (Y coordinate flipped)
      });
      
      // Listen for tile loading events
      mapRef.current.on('sourcedata', (e) => {
        if (e.sourceId === TEST_SOURCE_ID) {
          if (e.isSourceLoaded) {
            console.log('✅ Test source loaded successfully');
          } else if (e.tile) {
            if (e.tile.state === 'errored') {
              console.error('❌ Tile error:', e.tile.url);
            } else if (e.tile.state === 'loaded') {
              console.log('✅ Tile loaded:', e.tile.url);
            }
          }
        }
      });
    }
    
    // Add test raster layer at the very bottom
    if (!mapRef.current.getLayer(TEST_LAYER_ID)) {
      console.log('🎨 Adding test raster layer to map');
      mapRef.current.addLayer({
        id: TEST_LAYER_ID,
        type: 'raster',
        source: TEST_SOURCE_ID,
        paint: {
          'raster-opacity': 1
        }
      });
      console.log('✅ Test layer added:', TEST_LAYER_ID);
      
      // Move it to the bottom of the layer stack
      const styleLayers = mapRef.current.getStyle().layers || [];
      if (styleLayers.length > 1) {
        try {
          mapRef.current.moveLayer(TEST_LAYER_ID, styleLayers[0].id);
          console.log('📐 Moved test layer to bottom');
        } catch (e) {
          console.warn('⚠️ Could not move test layer:', e);
        }
      }
    } else {
      console.log('ℹ️ Test layer already exists');
    }
    
    // Hide all default style layers (background, fill, line, symbol, etc.) except our data layers
    const styleLayers = mapRef.current.getStyle().layers || [];
    styleLayers.forEach(layer => {
      // Keep: test layer, our data layers (those ending in -layer), and labels we might add
      if (layer.id === TEST_LAYER_ID || 
          layer.id.includes('-layer') || 
          layer.id.includes('-label')) {
        return; // Skip hiding these
      }
      // Hide everything else (background, roads, buildings, etc.)
      try {
        mapRef.current.setLayoutProperty(layer.id, 'visibility', 'none');
      } catch (e) {
        // Some layers might not support visibility or already removed
      }
    });
  };

  const handleSetTestBasemap = () => {
    if (!mapRef.current) return;
    console.log('🔄 Switching to test basemap...');
    baseMapRef.current = 'test';
    setBasemap('test');
    // Use light style as base (minimal layers), then hide everything and show only test raster
    traceMapboxStyleSwap('test-basemap', 'mapbox://styles/mapbox/light-v10');
    mapRef.current.setStyle('mapbox://styles/mapbox/light-v10');
    mapRef.current.once('style.load', () => {
      ownershipTilesTrace('basemap style.load fired', { context: 'test-basemap' });
      console.log('✅ Map style loaded, adding test raster...');
      try {
        addTestRaster();
        // Verify layer is visible
        setTimeout(() => {
          const layer = mapRef.current.getLayer(TEST_LAYER_ID);
          if (layer) {
            console.log('✅ Test layer exists on map');
            const visibility = mapRef.current.getLayoutProperty(TEST_LAYER_ID, 'visibility');
            console.log('👁️ Test layer visibility:', visibility);
            const opacity = mapRef.current.getPaintProperty(TEST_LAYER_ID, 'raster-opacity');
            console.log('🎨 Test layer opacity:', opacity);
          } else {
            console.error('❌ Test layer not found on map!');
          }
        }, 500);
      } catch (e) {
        console.error('❌ Failed to add test raster:', e);
      }
      void updateLayers().then(() => {
        applyLabelLayers();
        bringLabelsToTop();
        if (selectedFeature?.length > 0) {
          highlightFeature(selectedFeature);
        }
        schedulePostBasemapRegridRestack(mapRef);
        refreshOwnershipAfterBasemapSwap();
      });
    });
  };

  /** Same code path as the basemap picker — used when opening a saved print map or client share. */
  const applyBasemapByIdRef = useRef(() => {});
  applyBasemapByIdRef.current = (basemapId) => {
    const id = normalizeBasemapId(basemapId);
    basemapApplyGenerationRef.current += 1;
    basemapApplyInProgressRef.current = true;
    basemapRestoreBlockingLayersRef.current = true;
    restoringPrintBasemapRef.current = true;
    lastAppliedBasemapRef.current = null;
    if (pendingPrintBasemapRestoreRef) pendingPrintBasemapRestoreRef.current = null;

    const onDone = ({ layersAlreadySynced = false } = {}) => {
      const appliedId = String(activeBasemapIdRef?.current || id).trim();
      const map = mapRef.current;
      const verified =
        map &&
        verifyBasemapAppliedOnMap(map, appliedId) &&
        !needsBasemapOverlayMaintenance(map, appliedId);
      if (verified) {
        lastAppliedBasemapRef.current = appliedId;
        needsInitialBasemapApplyRef.current = false;
        initialBasemapRestoreCompleteRef.current = true;
      }
      if (activeBasemapIdRef) activeBasemapIdRef.current = appliedId;
      finishBasemapApplyRef.current({ layersAlreadySynced });
    };

    publishBasemapSelection(id);

    if (id === 'imagery') {
      handleSetImageryBasemap(false, () => onDone({ layersAlreadySynced: true }));
      return;
    }
    if (id === 'outdoors-v12' || id === 'satellite-streets-v12' || id === 'streets-v11') {
      handleBasemapChange(id, false, () => onDone({ layersAlreadySynced: true }));
      return;
    }
    if (id.includes('high-def-3inch-topo')) {
      handleSetHighDefWithTopo(id.includes('3d'), () => onDone({ layersAlreadySynced: true }));
      return;
    }
    if (id.startsWith('high-def-3inch')) {
      handleSetHighDefBasemap(id.includes('3d'), () => onDone({ layersAlreadySynced: true }));
      return;
    }
    if (id === 'teton-ortho-2024') {
      handleSetTetonOrthoBasemap(() => onDone({ layersAlreadySynced: true }));
      return;
    }

    handleBasemapChange(id, false, () => onDone({ layersAlreadySynced: true }));
  };

  useEffect(() => {
    window.applyBasemapById = (basemapId) => applyBasemapByIdRef.current(basemapId);
    return () => {
      delete window.applyBasemapById;
    };
  }, []);

  const selectBasemapById = (id) => {
    urlBasemapIdRef.current = String(id || '').trim() || DEFAULT_BASEMAP_ID;
    needsInitialBasemapApplyRef.current = false;
    initialBasemapRestoreCompleteRef.current = true;
    applyBasemapByIdRef.current(id);
  };

  // Basemap configuration with thumbnails — all options use selectBasemapById (single apply path).
  const basemapConfig = [
    { id: 'outdoors-v12', label: 'Discover', image: '/basemaps/outdoors-v12.png', fallback: '/logo192.png', onClick: () => selectBasemapById('outdoors-v12') },
    { id: 'imagery', label: 'Imagery', image: '/high_def.png', fallback: '/logo192.png', onClick: () => selectBasemapById('imagery') },
    { id: 'satellite-streets-v12', label: 'Satellite', image: '/basemaps/streets-v11-3d.png', fallback: '/basemaps/streets-v11.png', onClick: () => selectBasemapById('satellite-streets-v12') },
    { id: 'streets-v11', label: 'Streets', image: '/basemaps/streets-v11.png', fallback: '/logo192.png', onClick: () => selectBasemapById('streets-v11') },
  ];

  const printBasemapOptionList = basemapConfig.map(({ id, label, image, fallback }) => ({
    id,
    label,
    image,
    fallback,
  }));

  const handlePrintBasemapSelect = (optionId) => {
    applyBasemapByIdRef.current(optionId);
  };

  /**=============== Basemap Change with Contours (USGS-style) ===============
   * Switches the Mapbox style and adds contour lines for USGS-style topo maps
   * 
   * @param {string} styleId - The mapbox style ID (e.g., 'streets-v11')
   */
  const handleBasemapChangeWithTerrain = (styleId) => {
    if (!mapRef.current) return;
    setIs3DEnabled(false);
    setIsContoursEnabled(true);
  
    const variantId = `${styleId}-terrain`;
    baseMapRef.current = variantId;
    setBasemap(variantId);
  
    // Always reload the style
    traceMapboxStyleSwap('terrain', `mapbox://styles/mapbox/${styleId}`);
    mapRef.current.setStyle(`mapbox://styles/mapbox/${styleId}`);
  
    mapRef.current.once('style.load', () => {
      ownershipTilesTrace('basemap style.load fired', { context: 'terrain', styleId });
      console.log('✅ Map style loaded; adding contour lines');
  
      try {
        // Remove existing layers if they exist
        if (mapRef.current.getLayer('terrain-colors')) {
          mapRef.current.removeLayer('terrain-colors');
        }
        if (mapRef.current.getLayer('contour-lines-major')) {
          mapRef.current.removeLayer('contour-lines-major');
        }
        if (mapRef.current.getLayer('contour-lines-minor')) {
          mapRef.current.removeLayer('contour-lines-minor');
        }
        if (mapRef.current.getLayer('contour-labels-major')) {
          mapRef.current.removeLayer('contour-labels-major');
        }
        if (mapRef.current.getLayer('contour-labels-minor')) {
          mapRef.current.removeLayer('contour-labels-minor');
        }
        
        // Find a good place to insert the layers (before labels)
        const beforeLayer = mapRef.current.getStyle().layers.find(layer => 
          layer.type === 'symbol' && layer.id.includes('label')
        );
        const beforeId = beforeLayer ? beforeLayer.id : undefined;
        
        // Add hillshade for terrain visualization
        try {
          if (!mapRef.current.getLayer('terrain-colors')) {
            // Add terrain-rgb as DEM source for hillshade
            if (!mapRef.current.getSource('terrain-hillshade')) {
              mapRef.current.addSource('terrain-hillshade', {
                type: 'raster-dem',
                url: 'mapbox://mapbox.terrain-rgb',
                tileSize: 512,
                maxzoom: 14
              });
            }
            
            // Add hillshade layer for terrain relief
            mapRef.current.addLayer({
              id: 'terrain-colors',
              type: 'hillshade',
              source: 'terrain-hillshade',
              paint: {
                'hillshade-exaggeration': 1.5,
                'hillshade-illumination-direction': 315,
                'hillshade-illumination-anchor': 'viewport'
              }
            }, beforeId);
            
            console.log('✅ Hillshade layer added - shows terrain relief with lighting');
          }
        } catch (error) {
          console.error('Error adding hillshade:', error);
        }
        
        // Add contour lines source from Mapbox terrain-v2
        if (!mapRef.current.getSource('contour-lines-source')) {
          mapRef.current.addSource('contour-lines-source', {
            type: 'vector',
            url: 'mapbox://mapbox.mapbox-terrain-v2'
          });
        }
        
        // Wait for contour source to load
        const addContourLayers = () => {
          if (!mapRef.current.getSource('contour-lines-source')) return;
          
          // Find a good place to insert the layers (before labels)
          const beforeLayer = mapRef.current.getStyle().layers.find(layer => 
            layer.type === 'symbol' && layer.id.includes('label')
          );
          const beforeId = beforeLayer ? beforeLayer.id : undefined;
          
          try {
            // Add major contour lines (every 100m) - thicker, orange-red
            mapRef.current.addLayer({
              id: 'contour-lines-major',
              type: 'line',
              source: 'contour-lines-source',
              'source-layer': 'contour',
              filter: ['==', ['%', ['get', 'ele'], 100], 0], // Multiple of 100
              paint: {
                'line-color': '#FF4500',  // Orange-red color
                'line-width': 1.5,
                'line-opacity': 0.9
              }
            }, beforeId);
            
            // Add minor contour lines (every 50m) - bolder now
            mapRef.current.addLayer({
              id: 'contour-lines-minor',
              type: 'line',
              source: 'contour-lines-source',
              'source-layer': 'contour',
              filter: ['!=', ['%', ['get', 'ele'], 100], 0], // Not a multiple of 100
              paint: {
                'line-color': '#FF4500',  // Orange-red color
                'line-width': 1.0,        // Increased from 0.7 to 1.0 for better visibility
                'line-opacity': 0.6       // Increased from 0.5 to 0.6 for better visibility
              }
            }, beforeId);
            
            // Add elevation labels for major contours (in feet)
            mapRef.current.addLayer({
              id: 'contour-labels-major',
              type: 'symbol',
              source: 'contour-lines-source',
              'source-layer': 'contour',
              filter: ['==', ['%', ['get', 'ele'], 100], 0], // Multiple of 100
              layout: {
                'symbol-placement': 'line',
                'text-field': [
                  'concat',
                  ['to-string', ['round', ['*', ['get', 'ele'], 3.28084]]],
                  ' ft'
                ],
                'text-font': ['Open Sans Regular', 'Arial Unicode MS Regular'],
                'text-size': 11,
                'text-rotation-alignment': 'map',
                'text-pitch-alignment': 'viewport'
              },
              paint: {
                'text-color': '#333333',
                'text-halo-color': '#ffffff',
                'text-halo-width': 2,
                'text-halo-blur': 1
              }
            }, beforeId);
            
            // Add elevation labels for minor contours (in feet, less frequent)
            mapRef.current.addLayer({
              id: 'contour-labels-minor',
              type: 'symbol',
              source: 'contour-lines-source',
              'source-layer': 'contour',
              filter: ['!=', ['%', ['get', 'ele'], 100], 0], // Not a multiple of 100
              layout: {
                'symbol-placement': 'line',
                'text-field': [
                  'concat',
                  ['to-string', ['round', ['*', ['get', 'ele'], 3.28084]]],
                  ' ft'
                ],
                'text-font': ['Open Sans Regular', 'Arial Unicode MS Regular'],
                'text-size': 9,
                'text-rotation-alignment': 'map',
                'text-pitch-alignment': 'viewport',
                'symbol-spacing': 400  // Less frequent labels for minor contours
              },
              paint: {
                'text-color': '#666666',
                'text-halo-color': '#ffffff',
                'text-halo-width': 1.5,
                'text-halo-blur': 1
              }
            }, beforeId);
            
            console.log('✅ Contour lines and labels added successfully');
          } catch (err) {
            console.log('Note: Contour lines may not be available in your region', err);
          }
        };
        
        // Wait for contour source to load
        mapRef.current.once('sourcedata', (e) => {
          if (e.sourceId === 'contour-lines-source' && e.isSourceLoaded) {
            addContourLayers();
          }
        });
        
        // Try to add immediately if source is already loaded
        setTimeout(addContourLayers, 100);
        
        console.log('✅ Colored elevation visualization added (yellow to red gradient)');
        
      } catch (err) {
        console.error("🔥 Error adding contour lines:", err);
      }
  
      void updateLayers().then(() => {
        if (selectedFeature?.length > 0) {
          highlightFeature(selectedFeature);
        }
        schedulePostBasemapRegridRestack(mapRef);
        refreshOwnershipAfterBasemapSwap();
      });
    });
  };
  
  /**=============== Basemap Change with Terrain + 3D ===============
   * Switches the Mapbox style and adds contour lines with 3D terrain
   * 
   * @param {string} styleId - The mapbox style ID (e.g., 'streets-v11')
   */
  const handleBasemapChangeWithTerrain3D = (styleId) => {
    if (!mapRef.current) return;
    setIs3DEnabled(true);
    setIsContoursEnabled(true);
  
    const variantId = `${styleId}-terrain-3d`;
    baseMapRef.current = variantId;
    setBasemap(variantId);
  
    // Always reload the style
    traceMapboxStyleSwap('terrain-3d', `mapbox://styles/mapbox/${styleId}`);
    mapRef.current.setStyle(`mapbox://styles/mapbox/${styleId}`);
  
    mapRef.current.once('style.load', () => {
      ownershipTilesTrace('basemap style.load fired', { context: 'terrain-3d', styleId });
      console.log('✅ Map style loaded; adding 3D terrain + contour lines');
  
      try {
        // Enable 3D terrain first
        if (!mapRef.current.getSource('mapbox-dem')) {
          mapRef.current.addSource('mapbox-dem', {
            type: 'raster-dem',
            url: 'mapbox://mapbox.terrain-rgb',
            tileSize: 512,
            maxzoom: 14,
          });
        }
  
        mapRef.current.setTerrain({ source: 'mapbox-dem', exaggeration: 1.5 });
  
        if (!mapRef.current.getLayer('sky')) {
          mapRef.current.addLayer({
            id: 'sky',
            type: 'sky',
            paint: {
              'sky-type': 'atmosphere',
              'sky-atmosphere-sun': [0.0, 0.0],
              'sky-atmosphere-sun-intensity': 15,
            },
          });
        }
  
        mapRef.current.setPitch(60);
        mapRef.current.setBearing(-60);

        // Remove existing layers if they exist
        if (mapRef.current.getLayer('terrain-colors')) {
          mapRef.current.removeLayer('terrain-colors');
        }
        if (mapRef.current.getLayer('contour-lines-major')) {
          mapRef.current.removeLayer('contour-lines-major');
        }
        if (mapRef.current.getLayer('contour-lines-minor')) {
          mapRef.current.removeLayer('contour-lines-minor');
        }
        if (mapRef.current.getLayer('contour-labels-major')) {
          mapRef.current.removeLayer('contour-labels-major');
        }
        if (mapRef.current.getLayer('contour-labels-minor')) {
          mapRef.current.removeLayer('contour-labels-minor');
        }
        
        // Find a good place to insert the layers (before labels)
        const beforeLayer = mapRef.current.getStyle().layers.find(layer => 
          layer.type === 'symbol' && layer.id.includes('label')
        );
        const beforeId = beforeLayer ? beforeLayer.id : undefined;
        
        // Add hillshade for terrain visualization
        try {
          if (!mapRef.current.getLayer('terrain-colors')) {
            // Add terrain-rgb as DEM source for hillshade (reuse existing source)
            if (!mapRef.current.getSource('terrain-hillshade')) {
              mapRef.current.addSource('terrain-hillshade', {
                type: 'raster-dem',
                url: 'mapbox://mapbox.terrain-rgb',
                tileSize: 512,
                maxzoom: 14
              });
            }
            
            // Add hillshade layer for terrain relief
            mapRef.current.addLayer({
              id: 'terrain-colors',
              type: 'hillshade',
              source: 'terrain-hillshade',
              paint: {
                'hillshade-exaggeration': 1.5,
                'hillshade-illumination-direction': 315,
                'hillshade-illumination-anchor': 'viewport'
              }
            }, beforeId);
            
            console.log('✅ Hillshade layer added - shows terrain relief with lighting');
          }
        } catch (error) {
          console.error('Error adding hillshade:', error);
        }
        
        // Add contour lines source from Mapbox terrain-v2
        if (!mapRef.current.getSource('contour-lines-source')) {
          mapRef.current.addSource('contour-lines-source', {
            type: 'vector',
            url: 'mapbox://mapbox.mapbox-terrain-v2'
          });
        }
        
        // Wait for contour source to load
        const addContourLayers = () => {
          if (!mapRef.current.getSource('contour-lines-source')) return;
          
          // Find a good place to insert the layers (before labels)
          const beforeLayer = mapRef.current.getStyle().layers.find(layer => 
            layer.type === 'symbol' && layer.id.includes('label')
          );
          const beforeId = beforeLayer ? beforeLayer.id : undefined;
          
          try {
            // Add major contour lines (every 100m) - thicker, orange-red
            mapRef.current.addLayer({
              id: 'contour-lines-major',
              type: 'line',
              source: 'contour-lines-source',
              'source-layer': 'contour',
              filter: ['==', ['%', ['get', 'ele'], 100], 0], // Multiple of 100
              paint: {
                'line-color': '#FF4500',  // Orange-red color
                'line-width': 1.5,
                'line-opacity': 0.9
              }
            }, beforeId);
            
            // Add minor contour lines (every 50m) - bolder now
            mapRef.current.addLayer({
              id: 'contour-lines-minor',
              type: 'line',
              source: 'contour-lines-source',
              'source-layer': 'contour',
              filter: ['!=', ['%', ['get', 'ele'], 100], 0], // Not a multiple of 100
              paint: {
                'line-color': '#FF4500',  // Orange-red color
                'line-width': 1.0,        // Increased from 0.7 to 1.0 for better visibility
                'line-opacity': 0.6       // Increased from 0.5 to 0.6 for better visibility
              }
            }, beforeId);
            
            // Add elevation labels for major contours (in feet)
            mapRef.current.addLayer({
              id: 'contour-labels-major',
              type: 'symbol',
              source: 'contour-lines-source',
              'source-layer': 'contour',
              filter: ['==', ['%', ['get', 'ele'], 100], 0], // Multiple of 100
              layout: {
                'symbol-placement': 'line',
                'text-field': [
                  'concat',
                  ['to-string', ['round', ['*', ['get', 'ele'], 3.28084]]],
                  ' ft'
                ],
                'text-font': ['Open Sans Regular', 'Arial Unicode MS Regular'],
                'text-size': 11,
                'text-rotation-alignment': 'map',
                'text-pitch-alignment': 'viewport'
              },
              paint: {
                'text-color': '#333333',
                'text-halo-color': '#ffffff',
                'text-halo-width': 2,
                'text-halo-blur': 1
              }
            }, beforeId);
            
            // Add elevation labels for minor contours (in feet, less frequent)
            mapRef.current.addLayer({
              id: 'contour-labels-minor',
              type: 'symbol',
              source: 'contour-lines-source',
              'source-layer': 'contour',
              filter: ['!=', ['%', ['get', 'ele'], 100], 0], // Not a multiple of 100
              layout: {
                'symbol-placement': 'line',
                'text-field': [
                  'concat',
                  ['to-string', ['round', ['*', ['get', 'ele'], 3.28084]]],
                  ' ft'
                ],
                'text-font': ['Open Sans Regular', 'Arial Unicode MS Regular'],
                'text-size': 9,
                'text-rotation-alignment': 'map',
                'text-pitch-alignment': 'viewport',
                'symbol-spacing': 400  // Less frequent labels for minor contours
              },
              paint: {
                'text-color': '#666666',
                'text-halo-color': '#ffffff',
                'text-halo-width': 1.5,
                'text-halo-blur': 1
              }
            }, beforeId);
            
            console.log('✅ Contour lines and elevation labels added successfully');
          } catch (err) {
            console.log('Note: Contour lines may not be available in your region', err);
          }
        };
        
        // Wait for contour source to load
        mapRef.current.once('sourcedata', (e) => {
          if (e.sourceId === 'contour-lines-source' && e.isSourceLoaded) {
            addContourLayers();
          }
        });
        
        // Try to add immediately if source is already loaded
        setTimeout(addContourLayers, 100);
        
        console.log('✅ 3D terrain + contour lines added');
        
      } catch (err) {
        console.error("🔥 Error adding 3D terrain + contour lines:", err);
      }
  
      void updateLayers().then(() => {
        if (selectedFeature?.length > 0) {
          highlightFeature(selectedFeature);
        }
        schedulePostBasemapRegridRestack(mapRef);
        refreshOwnershipAfterBasemapSwap();
      });
    });
  };
  
  
  
  

    /** =============== Zooms and Higlights when map it from search ===============
   * useEffect: Watches for changes in `isMapTriggeredFromSearch` plus `focusFeatures`.
   * If triggered, we zoom and highlight the search results via `handleFeatureZoomAndHighlight`.
   */
    useEffect(() => {
      console.log("🔄 useEffect triggered!");
      console.log("isMapTriggeredFromSearch:", isMapTriggeredFromSearch);
      console.log("focusFeatures:", focusFeatures);
  
      if (isMapTriggeredFromSearch && focusFeatures.length > 0) {
          console.log('✅ Valid focusFeatures detected. Zooming to and highlighting features...');
          handleFeatureZoomAndHighlight(focusFeatures);
          
          setIsMapTriggeredFromSearch(false); // Reset trigger after execution
      } else {
          console.warn("⛔ Effect skipped: No map trigger or empty focusFeatures list.");
      }
  }, [isMapTriggeredFromSearch, focusFeatures]);
  

  /**=============== Zooms and Higligts Features ===============
   * Zooms and highlights a group of features—commonly used for search results.
   * 1) Removes old highlight
   * 2) Fits bounds to the combined bounding box
   * 3) Once zoomed, queries the map to find matching features and calls `highlightFeature`.
   * 
   * @param {Array} features - The array of GeoJSON features with optional `bbox` property.
   */
  const handleFeatureZoomAndHighlight = (features) => {
    if (!features || features.length === 0) {
      console.warn('No features provided to zoom and highlight.');
      return;
    }
  
    console.log('Handling zoom and highlight for features:', features);
  
    // Remove existing highlights
    removeHighlight();
    
    // Build bbox list from either explicit bbox or feature geometry
    const featuresWithBbox = features
      .map((feature) => {
        if (Array.isArray(feature?.bbox) && feature.bbox.length === 4) {
          return { ...feature, bbox: feature.bbox };
        }

        if (feature?.geometry) {
          try {
            const geometryBbox = turf.bbox({
              type: 'Feature',
              geometry: feature.geometry,
              properties: {},
            });
            if (Array.isArray(geometryBbox) && geometryBbox.length === 4) {
              return { ...feature, bbox: geometryBbox };
            }
          } catch (error) {
            console.warn('Could not derive bbox from feature geometry:', error);
          }
        }

        return null;
      })
      .filter(Boolean);
    console.log('Features with bbox:', featuresWithBbox.length, 'out of', features.length);
    
    if (featuresWithBbox.length > 0) {
      // Calculate combined bounds from feature bboxes
      const bounds = featuresWithBbox.reduce((acc, feature) => {
        const [minX, minY, maxX, maxY] = feature.bbox;
        acc = acc
          ? [
              Math.min(acc[0], minX),
              Math.min(acc[1], minY),
              Math.max(acc[2], maxX),
              Math.max(acc[3], maxY),
            ]
          : [minX, minY, maxX, maxY];
        return acc;
      }, null);
    
      const paddingValue = window.innerWidth < 768 ? 10 : 200; // 10px on mobile, 200px on desktop
      if (bounds && bounds.length === 4) {
        mapRef.current.fitBounds(bounds, {
          padding: paddingValue,
          duration: 1000, // Add smooth animation duration
        });
        console.log('Map zoomed to feature bounds:', bounds);
      } else {
        console.warn('Invalid feature bounds:', bounds);
      }
    } else {
      console.log('No bbox found in features, skipping zoom step');
      // Optionally zoom to a default area or just highlight without zooming
    }
  
    // Step 3: After zooming (or immediately if no bbox), highlight all features
    const highlightFeatures = () => {
      console.log('Map idle event triggered. Querying matching features...');
  
      const searchableLayers = [
        'regrid-parcels-layer',
        ...(layerStatus.ownership ? ['regrid-parcels-layer', 'regrid-parcels-outline'] : []),
      ].filter((layerId) => mapRef.current.getLayer(layerId));
      const queriedFeatures = searchableLayers.length > 0
        ? mapRef.current.queryRenderedFeatures({ layers: searchableLayers })
        : [];
      console.log('All queried features from searchable layers:', queriedFeatures.length);

      // Match by multiple identifiers so both legacy and Regrid features can be focused.
      const inputIds = new Set(
        features.flatMap((feature, index) => {
          const ids = [
            feature?.GFI,
            feature?.global_parcel_uid,
            feature?.ll_uuid,
            feature?.parcelnumb,
            feature?.county_parcel_id,
            feature?.pidn,
            feature?.properties?.GFI,
            feature?.properties?.global_parcel_uid,
            feature?.properties?.ll_uuid,
            feature?.properties?.parcelnumb,
            feature?.properties?.pidn,
          ].filter(Boolean).map((value) => String(value));

          console.log(`Feature at index ${index}:`, feature);
          console.log(`Identifiers for feature at index ${index}:`, ids);
          return ids;
        })
      );

      const matchingFeatures = queriedFeatures.filter((f) => {
        const candidateIds = [
          f?.properties?.GFI,
          f?.properties?.global_parcel_uid,
          f?.properties?.ll_uuid,
          f?.properties?.parcelnumb,
          f?.properties?.pidn,
          f?.properties?.fid,
          f?.properties?.ogc_fid,
        ].filter(Boolean).map((value) => String(value));

        return candidateIds.some((id) => inputIds.has(id));
      });
      
      if (matchingFeatures.length === 0) {
        console.warn('No matching rendered features found. Falling back to input features.');
        setSelectedFeatures(features);
        highlightFeature(features);
        setActiveSidePanelTab('info');
        return;
      }
  
      console.log('Matching features from rendered layers:', matchingFeatures);
  
      // ✅ DEDUPLICATE: Remove duplicate features based on GFI
      const uniqueFeatures = matchingFeatures.filter((feature, index, self) => {
        const gfi = feature.properties?.GFI;
        return self.findIndex(f => f.properties?.GFI === gfi) === index;
      });
      
      console.log('Deduplicated features:', uniqueFeatures);
  
      setIsMapTriggeredFromSearch(false);
      setSelectedFeatures(uniqueFeatures); // Use deduplicated features
      // Highlight the matching features
      console.log('Highlighting features with layerStatus:', layerStatus);
      highlightFeature(uniqueFeatures); // Use deduplicated features
  
      // Switch to the info tab after highlighting
      setActiveSidePanelTab('info');
      console.log('Switched to info tab.');
    };
    
    if (featuresWithBbox.length > 0) {
      // Wait for zoom to complete before highlighting
      mapRef.current.once('idle', highlightFeatures);
    } else {
      // Highlight immediately if no zoom needed
      highlightFeatures();
    }
    };

  /**=============== Zoom to Individual Feature ===============
   * Zooms to a specific feature using its bbox property.
   * Only zooms to the feature location without changing highlights.
   * 
   * @param {Object} feature - The feature object with bbox property
   */
  const zoomToIndividualFeature = async (feature) => {
    const parseBbox = (bboxValue) => {
      if (!bboxValue) return null;
      if (Array.isArray(bboxValue) && bboxValue.length === 4) return bboxValue;
      if (typeof bboxValue === 'string') {
        try {
          const parsed = JSON.parse(bboxValue);
          return Array.isArray(parsed) && parsed.length === 4 ? parsed : null;
        } catch (_) {
          return null;
        }
      }
      return null;
    };

    const zoomToBounds = (bboxArray) => {
      const [minX, minY, maxX, maxY] = bboxArray;
      const bounds = [minX, minY, maxX, maxY];
      const paddingValue = window.innerWidth < 768 ? 50 : 150;
      mapRef.current.fitBounds(bounds, {
        padding: paddingValue,
        duration: 1000,
      });
      console.log('Map zoomed to feature bounds:', bounds);
    };

    // 1) Use explicit bbox if present.
    const directBbox = parseBbox(feature?.properties?.bbox || feature?.bbox);
    if (directBbox) {
      zoomToBounds(directBbox);
      return;
    }

    // 2) Use feature geometry if present.
    if (feature?.geometry) {
      try {
        zoomToBounds(turf.bbox(turf.feature(feature.geometry)));
        return;
      } catch (error) {
        console.warn('Could not compute bbox from feature geometry:', error);
      }
    }

    // 3) If this is an ownership parcel, resolve geometry from rendered ownership layer via GFI.
    const gfi = feature?.properties?.GFI;
    if (gfi && mapRef.current.getLayer('regrid-parcels-layer')) {
      const renderedOwnership = mapRef.current.queryRenderedFeatures({ layers: ['regrid-parcels-layer'] });
      const match = renderedOwnership.find((f) => f?.properties?.GFI === gfi && f?.geometry);
      if (match?.geometry) {
        try {
          zoomToBounds(turf.bbox(turf.feature(match.geometry)));
          return;
        } catch (error) {
          console.warn('Could not compute bbox from matched ownership geometry:', error);
        }
      }
    }

    // 4) Regrid fallback: fetch parcel by ll_uuid and zoom to returned geometry.
    const llUuid = feature?.properties?.ll_uuid;
    if (llUuid) {
      try {
        const apiFeat = await fetchParcelGeoJsonFeatureByLlUuid(llUuid);
        if (apiFeat?.geometry) {
          zoomToBounds(turf.bbox(turf.feature(apiFeat.geometry)));
          return;
        }
      } catch (error) {
        console.warn('Failed to fetch Regrid parcel geometry for zoom:', error);
      }
    }

    console.warn('Unable to zoom: no bbox/geometry available for feature.', feature);
  };

  /**=============== Re Higlight Selected when map Change ===============
   * Provides incremental re-highlighting whenever the selected feature changes
   * (due to map movement or user toggles).
   */
  useEffect(() => {
    if (!mapRef.current) return;
  
    // Function to handle the zoom or pan events
    const handleViewChange = () => {
      if (selectedFeature) {
        //console.log('Map view changed, readjusting highlight...');
        highlightFeature(selectedFeature); // Re-call highlightFeature to update the highlighted geometry
      }
    };
  
    // Add event listeners for 'moveend' and 'zoomend'
    mapRef.current.on('moveend', handleViewChange);
    mapRef.current.on('zoomend', handleViewChange);
  
    // Clean up event listeners on unmount
    return () => {
      if (mapRef.current) {
        mapRef.current.off('moveend', handleViewChange);
        mapRef.current.off('zoomend', handleViewChange);
      }
    };
  }, [selectedFeature]);

    /**=============== Highlight Feature ===============
   * Consolidates an array of features into a single "highlight" layer on the map.
   * - Removes any existing highlight
   * - Groups them by `pidn`, merges geometry if multi-part
   * - Adds them back as a single fill + outline layer
   * 
   * @param {Array} inputFeatures - Array of Mapbox features to highlight
   */
  console.log('🔍 BEFORE highlightFeature definition - highlightSettings:', highlightSettings);
  console.log('🔍 BEFORE highlightFeature definition - highlightSettings.fillColor:', highlightSettings?.fillColor);
  console.log('🔍 highlight Function instance ID:', Math.random());

  /**
   * Search and legacy callers sometimes pass flat objects (GFI, ll_uuid, etc. on the
   * feature root) instead of GeoJSON with a `properties` bag. Normalize before highlight logic.
   */
  const normalizeInputFeatureForHighlight = (feature) => {
    if (!feature) return null;
    if (feature.properties && typeof feature.properties === 'object') {
      return feature;
    }
    const metaKeys = new Set(['type', 'geometry', 'bbox', 'layer', 'id', 'source', 'sourceLayer']);
    const properties = {};
    for (const [key, value] of Object.entries(feature)) {
      if (!metaKeys.has(key)) {
        properties[key] = value;
      }
    }
    return {
      type: feature.type || 'Feature',
      geometry: feature.geometry,
      properties,
      ...(feature.bbox ? { bbox: feature.bbox } : {}),
      ...(feature.layer ? { layer: feature.layer } : {}),
      ...(feature.id != null ? { id: feature.id } : {}),
    };
  };

  /**
   * Gets the appropriate identifier property for a feature based on its layer
   * @param {Object} feature - The feature object
   * @param {string} layerName - The name of the layer
   * @returns {string|null} - The identifier value or null if not found
   */
  const getFeatureIdentifier = (feature, layerName) => {
    const props = feature?.properties ?? {};
    
    switch (layerName) {
      case 'ownership':
        return props.GFI || props.pidn || props.Name;
      case 'public_land':
        return props.OBJECTID || props.Name;
      case 'conservation_easements':
        return props.Name || props.OBJECTID;
      case 'soil':
        return props.MUKEY || props.MUSYM || props.OBJECTID;
      case 'surface_water':
        return props.name || props.OBJECTID;
      case 'wetlands':
        return props.WETLAND_TYPE || props.ATTRIBUTE || props.OBJECTID || props.Name;
      case 'boundaries_counties':
        return props.GEOID || props.NAMELSAD || props.NAME;
      case 'boundaries_congressional':
        return props.GEOID || props.NAMELSAD;
      case 'boundaries_places':
        return props.GEOID || props.NAME || props.NAMELSAD;
      case 'boundaries_urban_areas':
        return props.GEOID20 || props.NAME20 || props.NAMELSAD20;
      case 'boundaries_tribal_lands':
        return props.GEOID || props.NAME || props.NAMELSAD;
      case 'opportunity_zones':
        return props.GEOID10 || props.OBJECTID;
      case 'principal_aquifers':
        return props.OBJECTID ?? props.AQ_CODE ?? props.AQ_NAME;
      case 'transmission_lines':
        return props.GlobalID || props.ID || props.OBJECTID;
      default:
        return props.Name || props.OBJECTID || props.FLD_AR_ID || props.precinct;
    }
  };

  const highlightFeature = (inputFeatures, overrideLayerStatus, overrideHighlightSettings) => {
    // Use passed highlightSettings if available, otherwise fall back to global
    let effectiveHighlightSettings = overrideHighlightSettings || highlightSettings;
    
    // Safety check: if highlightSettings is null, use defaults
    if (!effectiveHighlightSettings) {
      console.warn('⚠️ highlightSettings is null, using defaults');
      effectiveHighlightSettings = {
        fillColor: '#FF0000',
        fillOpacity: 0.5,
        fillOutlineColor: '#FF0000',
        lineColor: '#FF0000',
        lineWidth: 3
      };
    }

    // Print / map maker: show parcel boundary via line only — avoid tinted fill over imagery.
    if (isPrinting) {
      effectiveHighlightSettings = {
        ...effectiveHighlightSettings,
        fillColor: 'rgba(0, 0, 0, 0)',
        fillOpacity: 0,
      };
    }
    
    console.log('🔍 highlightFeature ENTRY - effectiveHighlightSettings:', effectiveHighlightSettings);
    console.log('🔍 highlightFeature ENTRY - effectiveHighlightSettings.fillColor:', effectiveHighlightSettings?.fillColor);
    
    const effectiveLayerStatus = overrideLayerStatus ?? layerStatus;
    console.log("Removing existing highlights...");
    removeHighlight();

    if (!inputFeatures || inputFeatures.length === 0) {
      console.warn("No input features provided for highlighting.");
      return;
    }

    const normalizedInputFeatures = inputFeatures
      .map(normalizeInputFeatureForHighlight)
      .filter(Boolean);
    console.log("Input features for highlighting:", normalizedInputFeatures);

    // Create a mapping of feature identifiers to their features
    const featureDict = {};
    const layerToFeatureMap = {}; // Track which layer each feature came from
    const geometrySeenByIdentifier = {};
    const inputFeaturesByIdentifier = {};

    const registerHighlightIdentifier = (identifier, layerName, inputFeature) => {
      if (identifier == null || identifier === '') return;
      const idKey = String(identifier);
      featureDict[idKey] = [];
      layerToFeatureMap[idKey] = layerName;
      geometrySeenByIdentifier[idKey] = new Set();
      inputFeaturesByIdentifier[idKey] = inputFeature;
    };
    
    normalizedInputFeatures.forEach((feature) => {
      const props = feature.properties || {};

      // Check if this is a Regrid parcel first
      const isRegridParcel = feature.layer?.id === 'regrid-parcels-layer' || 
                            feature.layer?.id === 'regrid-parcels-outline' ||
                            Boolean(props.ll_uuid || props.parcelnumb || props.global_parcel_uid);
      
      if (isRegridParcel) {
        const identifier = props.ll_uuid || 
                          props.parcelnumb || 
                          props.parcel_id ||
                          props.global_parcel_uid ||
                          props.id ||
                          feature.id;
        registerHighlightIdentifier(identifier, 'regrid-parcels', feature);
        return;
      }

      const hostedLayer = resolveHostedMapLayerFromFeature(feature);
      if (hostedLayer) {
        const identifier = getHostedFeatureClickId(feature, hostedLayer);
        registerHighlightIdentifier(identifier, hostedLayer, feature);
        return;
      }
      
      // Legacy / non-MVT features
      // We need to find the layer name that this feature came from
      const possibleIdentifiers = [
        props.GFI,
        props.Name,
        props.OBJECTID,
        props.precinct,
        props.FLD_AR_ID,
        props.pidn,
        props.global_parcel_uid,
      ].filter(Boolean);
      
      // Find the layer that contains this feature
      let sourceLayerName = null;
      const visibleLayers = Object.keys(effectiveLayerStatus).filter((layerName) => effectiveLayerStatus[layerName]);
      
      for (const layerName of visibleLayers) {
        const queryLayerIds = getQueryLayerIdsForTileLayer(layerName, mapRef.current);
        if (queryLayerIds.length) {
          const queriedFeatures = mapRef.current.queryRenderedFeatures({ layers: queryLayerIds });
          const foundFeature = queriedFeatures.find(qf => {
            const qfId = getFeatureIdentifier(qf, layerName);
            return possibleIdentifiers.includes(qfId);
          });
          
          if (foundFeature) {
            sourceLayerName = layerName;
            break;
          }
        }
      }
      
      if (sourceLayerName) {
        const identifier = getFeatureIdentifier(feature, sourceLayerName);
        if (identifier) {
          registerHighlightIdentifier(identifier, sourceLayerName, feature);
        } else {
          console.warn("Feature has no valid identifier:", feature);
        }
      } else {
        const fallbackId =
          props.GFI || props.pidn || props.global_parcel_uid || props.ll_uuid || props.parcelnumb;
        if (fallbackId) {
          const fallbackLayer = props.ll_uuid || props.parcelnumb || props.global_parcel_uid
            ? 'regrid-parcels'
            : 'ownership';
          registerHighlightIdentifier(fallbackId, fallbackLayer, feature);
        } else {
          console.warn("Could not determine source layer for feature:", feature);
        }
      }
    });

    // Query features from all visible layers and match them
    const visibleLayers = Object.keys(effectiveLayerStatus).filter((layerName) => effectiveLayerStatus[layerName]);
    visibleLayers.forEach((layerName) => {
      const queryLayerIds = getQueryLayerIdsForTileLayer(layerName, mapRef.current);
      if (!queryLayerIds.length) return;
      const queriedFeatures = mapRef.current.queryRenderedFeatures({ layers: queryLayerIds });
      queriedFeatures.forEach((visibleFeature) => {
        const visibleIdentifier = getFeatureIdentifier(visibleFeature, layerName);
        if (featureDict[visibleIdentifier] && layerToFeatureMap[visibleIdentifier] === layerName) {
          const geometryKey = JSON.stringify(visibleFeature.geometry || {});
          const seen = geometrySeenByIdentifier[visibleIdentifier];
          if (seen && !seen.has(geometryKey)) {
            seen.add(geometryKey);
            featureDict[visibleIdentifier].push(turf.feature(visibleFeature.geometry, visibleFeature.properties));
          }
        }
      });
    });
    
    // Also query Regrid parcels if any Regrid features are being highlighted
    const hasRegridFeatures = Object.values(layerToFeatureMap).some(layer => layer === 'regrid-parcels');
    if (hasRegridFeatures && mapRef.current.getLayer('regrid-parcels-layer')) {
      // Query only from fill layer to avoid duplicate geometries from outline + fill.
      const regridFeatures = mapRef.current.queryRenderedFeatures({ layers: ['regrid-parcels-layer'] });
      regridFeatures.forEach((regridFeature) => {
        const regridIdentifier = regridFeature.properties.ll_uuid || 
                                 regridFeature.properties.parcelnumb || 
                                 regridFeature.properties.parcel_id ||
                                 regridFeature.properties.id ||
                                 regridFeature.id;
        if (featureDict[regridIdentifier] && layerToFeatureMap[regridIdentifier] === 'regrid-parcels') {
          const geometryKey = JSON.stringify(regridFeature.geometry || {});
          const seen = geometrySeenByIdentifier[regridIdentifier];
          if (seen && !seen.has(geometryKey)) {
            seen.add(geometryKey);
            featureDict[regridIdentifier].push(turf.feature(regridFeature.geometry, regridFeature.properties));
          }
        }
      });
    }

    // Search results may include geometry before parcel tiles render in the viewport.
    Object.keys(featureDict).forEach((identifier) => {
      if (featureDict[identifier].length > 0) return;
      const inputFeature = inputFeaturesByIdentifier[identifier];
      if (!inputFeature?.geometry) return;
      const geometryKey = JSON.stringify(inputFeature.geometry);
      const seen = geometrySeenByIdentifier[identifier];
      if (seen && !seen.has(geometryKey)) {
        seen.add(geometryKey);
        featureDict[identifier].push(
          turf.feature(inputFeature.geometry, inputFeature.properties || {})
        );
      }
    });

    const unifiedFeatures = [];
    Object.keys(featureDict).forEach((identifier) => {
      const matchingParts = featureDict[identifier];
      if (matchingParts.length === 1) {
        unifiedFeatures.push(matchingParts[0]);
      } else if (matchingParts.length > 1) {
        try {
          const featureCollection = turf.featureCollection(matchingParts);
          const unifiedFeature = turf.union(featureCollection);
          unifiedFeatures.push(unifiedFeature);
        } catch (error) {
          console.error(`Error during union for identifier: ${identifier}`, error);
        }
      }
    });

    // Final safety dedupe to prevent stacked fill opacity from duplicate geometries.
    const dedupedUnifiedFeatures = [];
    const seenUnifiedGeometry = new Set();
    unifiedFeatures.forEach((feature) => {
      const geometryKey = JSON.stringify(feature?.geometry || {});
      if (!seenUnifiedGeometry.has(geometryKey)) {
        seenUnifiedGeometry.add(geometryKey);
        dedupedUnifiedFeatures.push(feature);
      }
    });

    if (dedupedUnifiedFeatures.length > 0) {
      try {
        const featureCollection = JSON.parse(JSON.stringify(turf.featureCollection(dedupedUnifiedFeatures)));
        const dynamicHighlightId = `${highlightLayerId}-${Date.now()}`;

        // Clean up all previous highlight layers and sources
        const existingLayers = mapRef.current.getStyle().layers || [];
        existingLayers.forEach((layer) => {
          if (layer.id.startsWith(highlightLayerId)) {
            mapRef.current.removeLayer(layer.id);
          }
        });
        Object.keys(mapRef.current.style.sourceCaches || {}).forEach((sourceId) => {
          if (sourceId.startsWith(highlightLayerId)) {
            mapRef.current.removeSource(sourceId);
          }
        });

        mapRef.current.addSource(dynamicHighlightId, {
          type: "geojson",
          data: featureCollection,
        });
        console.log('🎨 ===== HIGHLIGHT DEBUG =====');
        console.log('🎨 effectiveHighlightSettings object:', effectiveHighlightSettings);
        console.log('🎨 fillColor being used:', effectiveHighlightSettings.fillColor);
        console.log('🎨 fillOpacity being used:', effectiveHighlightSettings.fillOpacity);
        console.log('🎨 ===========================');

        if (highlightRenderTimeoutRef.current) {
          clearTimeout(highlightRenderTimeoutRef.current);
        }
        highlightRenderTimeoutRef.current = setTimeout(() => {
          if (!mapRef.current || !mapRef.current.getSource(dynamicHighlightId)) {
            return;
          }
          mapRef.current.addLayer({
            id: dynamicHighlightId,
            type: "fill",
            source: dynamicHighlightId,
            paint: {
              "fill-color": effectiveHighlightSettings.fillColor,
              "fill-outline-color": effectiveHighlightSettings.fillOutlineColor,
              "fill-opacity": effectiveHighlightSettings.fillOpacity ?? 1,
            },
          });

          mapRef.current.addLayer({
            id: `${dynamicHighlightId}-outline`,
            type: "line",
            source: dynamicHighlightId,
            paint: {
              "line-color": effectiveHighlightSettings.lineColor,
              "line-width": effectiveHighlightSettings.lineWidth ?? 3,
            },
          });
          highlightRenderTimeoutRef.current = null;
          fireRegridRestack(mapRef.current);
        }, 10);

      } catch (error) {
        console.error("Error during map layer creation for highlighted features:", error);
      }
    } else {
      console.warn("No features to highlight.");
    }
  };
  
    
  /**=============== Remove Highlight ===============
   * Removes the highlight fill + outline layers, along with their data source.
   * @param {Array} [featuresToRemove=[]] Optional array of features if needed
   */
  const removeHighlight = () => {
    if (highlightRenderTimeoutRef.current) {
      clearTimeout(highlightRenderTimeoutRef.current);
      highlightRenderTimeoutRef.current = null;
    }

    const style = mapRef.current.getStyle();
    if (!style) return;

    // Remove all highlight layers
    (style.layers || []).forEach((layer) => {
      if (layer.id.startsWith(highlightLayerId)) {
        if (mapRef.current.getLayer(layer.id)) {
          mapRef.current.removeLayer(layer.id);
        }
      }
    });

    // Remove all highlight sources
    Object.keys(mapRef.current.style.sourceCaches || {}).forEach((sourceId) => {
      if (sourceId.startsWith(highlightLayerId)) {
        if (mapRef.current.getSource(sourceId)) {
          mapRef.current.removeSource(sourceId);
        }
      }
    });
  };

  /** Ownership parcel labels require the ownership layer; clear label state when layer is off. */
  useEffect(() => {
    if (!mapIsReady) return;
    if (!layerStatus.ownership && layerLabels.ownership) {
      clearLayerLabels('ownership');
    }
  }, [mapIsReady, layerStatus.ownership, layerLabels.ownership, clearLayerLabels]);

  /** Clear selection/highlight when a layer is toggled off (ownership/Regrid is skipped in `updateLayers`). */
  useEffect(() => {
    if (!mapIsReady || !selectedFeature?.length) return;

    const hiddenLayerNames = Object.keys(layerStatus).filter((name) => !layerStatus[name]);
    if (hiddenLayerNames.length === 0) return;

    const touchesHiddenLayer = selectedFeature.some((feature) =>
      hiddenLayerNames.some((layerName) => featureBelongsToMapLayer(feature, layerName))
    );
    if (!touchesHiddenLayer) return;

    const nextSelection = selectedFeature.filter(
      (feature) => !hiddenLayerNames.some((layerName) => featureBelongsToMapLayer(feature, layerName))
    );

    const clearedRegrid =
      !layerStatus.ownership && selectedFeature.some(isRegridParcelPolygonFeature);

    if (nextSelection.length === 0) {
      setSelectedFeatures([]);
      removeHighlight();
    } else {
      setSelectedFeatures(nextSelection);
      highlightFeature(nextSelection);
    }

  }, [layerStatus, mapIsReady, selectedFeature, highlightFeature, removeHighlight, setSelectedFeatures]);

  const addPolygonBoundariesFromMergedFeature = (merged) => {
    const g = merged?.geometry;
    if (!g) return;
    const addOne = (polyFeature) => {
      const coords = getRegridParcelBoundaryCoordinates(polyFeature);
      if (!coords || coords.length < 3) return;
      const metrics = getMetricsForPolygonLngLat(coords);
      const center = {
        lng: coords.reduce((s, c) => s + c.lng, 0) / coords.length,
        lat: coords.reduce((s, c) => s + c.lat, 0) / coords.length,
      };
      addPrintElementFromTool('polygon_boundary', { coordinates: coords, metrics }, center);
    };

    if (g.type === 'Polygon') {
      addOne(merged);
      return;
    }
    if (g.type === 'MultiPolygon') {
      for (const polyCoords of g.coordinates) {
        try {
          addOne(turf.polygon(polyCoords));
        } catch (_) {
          /* skip invalid ring */
        }
      }
    }
  };

  const handlePropertyMapWizardContinue = async () => {
    const parcels = (selectedFeature || []).filter(isRegridParcelPolygonFeature);
    if (parcels.length === 0) return;
    const merged = await mergeRegridParcelFeaturesPreferApi(parcels);
    if (!merged) return;
    addPolygonBoundariesFromMergedFeature(merged);
    setPropertyMapWizardActive(false);
    setPropertyMapWizardIntent(null);
    setSelectedFeatures([]);
    removeHighlight();
    setActivePrintTool('select');
    setActiveSidePanelTab('print');
  };

  const handlePropertyMapWizardCancel = () => {
    setPropertyMapWizardActive(false);
    setPropertyMapWizardIntent(null);
    setSelectedFeatures([]);
    removeHighlight();
    window.dispatchEvent(new CustomEvent('print-exit-edit'));
  };

  const tutorialInitialResetDoneRef = useRef(false);

  useEffect(() => {
    if (!tourActive || tourMode !== 'map') {
      tutorialInitialResetDoneRef.current = false;
      return;
    }
    if (tourStepIndex !== 0) return;
    if (tutorialInitialResetDoneRef.current) return;
    tutorialInitialResetDoneRef.current = true;

    if (!mapRef.current) return;

    setSelectedFeatures([]);
    setFocusFeatures([]);
    setIsMapTriggeredFromSearch(false);
    setActiveSidePanelTab('layers');
    setIsPanelOpen(false);
    setIsGeoFilterActive(false);
    if (isGeoFilterActiveRef) isGeoFilterActiveRef.current = false;

    removeHighlight();
    clearAllDrawings();

    if (layerLabels.ownership) {
      toggleLayerLabels('ownership');
    }

    setLayerStatus({ ownership: true });
    setLayerOrder(['ownership']);
    handleBasemapChange('outdoors-v12', false);

    try {
      mapRef.current.stop();
    } catch (_) {
      /* ignore */
    }

    try {
      mapRef.current.flyTo({
        center: TUTORIAL_DEFAULT_VIEW.center,
        zoom: TUTORIAL_DEFAULT_VIEW.zoom,
        duration: 1400,
        essential: true,
      });
    } catch (err) {
      console.warn('Tutorial default view:', err);
    }
  }, [
    tourActive,
    tourMode,
    tourStepIndex,
    setSelectedFeatures,
    setFocusFeatures,
    setIsMapTriggeredFromSearch,
    setIsGeoFilterActive,
    setLayerStatus,
    setLayerOrder,
    layerLabels.ownership,
    toggleLayerLabels,
    removeHighlight,
    clearAllDrawings,
    handleBasemapChange,
  ]);

  /**=============== Update Existing Highlights ===============
   * Updates the paint properties of existing highlight layers with new settings.
   * This ensures highlight settings changes apply immediately to visible highlights.
   */
  const updateExistingHighlights = () => {
    console.log('🔍 updateExistingHighlights called');
    console.log('🔍 mapRef.current exists:', !!mapRef.current);
    
    // 🔍 Check if highlightSettings are available
    if (!highlightSettings) {
      console.warn('❌ highlightSettings is null, skipping update');
      return;
    }
    
    if (!mapRef.current) {
      console.warn('❌ mapRef.current is null');
      return;
    }
    
    const style = mapRef.current.getStyle();
    console.log('🔍 map style exists:', !!style);
    if (!style) {
      console.warn('❌ map style is null');
      return;
    }

    const allLayers = style.layers || [];
    console.log('🔍 Total layers on map:', allLayers.length);
    console.log('🔍 All layer IDs:', allLayers.map(l => l.id));

    // Find all existing highlight layers
    const highlightLayers = allLayers.filter((layer) => 
      layer.id.startsWith(highlightLayerId) && !layer.id.endsWith('-outline')
    );
    
    console.log('🔍 Found highlight layers:', highlightLayers.length);
    console.log('🔍 Highlight layer IDs:', highlightLayers.map(l => l.id));
    console.log('🔍 highlightLayerId constant:', highlightLayerId);

    if (highlightLayers.length === 0) {
      console.warn('⚠️ No highlight layers found to update');
      return;
    }

    highlightLayers.forEach((layer) => {
      const layerId = layer.id;
      const outlineLayerId = `${layerId}-outline`;
      
      console.log(`🔍 Updating layer: ${layerId}`);
      console.log(`🔍 Looking for outline layer: ${outlineLayerId}`);
      
      // Update fill layer properties
      if (mapRef.current.getLayer(layerId)) {
        console.log(`✅ Updating fill layer ${layerId} with:`, {
          'fill-color': highlightSettings.fillColor,
          'fill-outline-color': highlightSettings.fillOutlineColor,
          'fill-opacity': highlightSettings.fillOpacity ?? 1
        });
        
        mapRef.current.setPaintProperty(layerId, 'fill-color', highlightSettings.fillColor);
        mapRef.current.setPaintProperty(layerId, 'fill-outline-color', highlightSettings.fillOutlineColor);
        mapRef.current.setPaintProperty(layerId, 'fill-opacity', highlightSettings.fillOpacity ?? 1);
      } else {
        console.warn(`❌ Fill layer ${layerId} not found on map`);
      }
      
      // Update outline layer properties
      if (mapRef.current.getLayer(outlineLayerId)) {
        console.log(`✅ Updating outline layer ${outlineLayerId} with:`, {
          'line-color': highlightSettings.lineColor,
          'line-width': highlightSettings.lineWidth ?? 3
        });
        
        mapRef.current.setPaintProperty(outlineLayerId, 'line-color', highlightSettings.lineColor);
        mapRef.current.setPaintProperty(outlineLayerId, 'line-width', highlightSettings.lineWidth ?? 3);
      } else {
        console.warn(`❌ Outline layer ${outlineLayerId} not found on map`);
      }
    });

    // 🎨 Force a repaint to ensure changes are visible immediately
    console.log('🎨 Forcing map repaint...');
    try {
      // Method 1: Try to trigger a repaint
      if (mapRef.current.triggerRepaint) {
        mapRef.current.triggerRepaint();
        console.log('✅ Used triggerRepaint()');
      }
      
      // Method 2: Force a resize to trigger redraw
      mapRef.current.resize();
      console.log('✅ Used resize()');
      
      // Method 3: Force a style update
      if (mapRef.current.getStyle()) {
        mapRef.current.setPaintProperty('background', 'background-color', mapRef.current.getPaintProperty('background', 'background-color'));
        console.log('✅ Used setPaintProperty trick');
      }
      
      // Method 4: Force highlight layers to refresh by temporarily hiding/showing
      highlightLayers.forEach((layer) => {
        const layerId = layer.id;
        const outlineLayerId = `${layerId}-outline`;
        
        if (mapRef.current.getLayer(layerId)) {
          // Temporarily hide and show to force refresh
          mapRef.current.setLayoutProperty(layerId, 'visibility', 'none');
          setTimeout(() => {
            mapRef.current.setLayoutProperty(layerId, 'visibility', 'visible');
          }, 10);
        }
        
        if (mapRef.current.getLayer(outlineLayerId)) {
          // Temporarily hide and show to force refresh
          mapRef.current.setLayoutProperty(outlineLayerId, 'visibility', 'none');
          setTimeout(() => {
            mapRef.current.setLayoutProperty(outlineLayerId, 'visibility', 'visible');
          }, 10);
        }
      });
      console.log('✅ Used visibility toggle trick');
      
    } catch (error) {
      console.warn('⚠️ Error forcing repaint:', error);
    }

    // 🔍 DEBUG: Check what the layers actually have after our updates
    console.log('🔍 DEBUG: Checking layer properties after updates...');
    setTimeout(() => {
      highlightLayers.forEach((layer) => {
        const layerId = layer.id;
        const outlineLayerId = `${layerId}-outline`;
        
        if (mapRef.current.getLayer(layerId)) {
          const actualFillColor = mapRef.current.getPaintProperty(layerId, 'fill-color');
          const actualFillOpacity = mapRef.current.getPaintProperty(layerId, 'fill-opacity');
          const actualOutlineColor = mapRef.current.getPaintProperty(layerId, 'fill-outline-color');
          
          console.log(`🔍 ${layerId} actual properties:`, {
            'fill-color': actualFillColor,
            'fill-opacity': actualFillOpacity,
            'fill-outline-color': actualOutlineColor
          });
          
          // Check if they match our intended settings
          const expectedFillColor = highlightSettings.fillColor;
          const expectedFillOpacity = highlightSettings.fillOpacity ?? 1;
          const expectedOutlineColor = highlightSettings.fillOutlineColor;
          
          if (actualFillColor !== expectedFillColor) {
            console.warn(`⚠️ ${layerId} fill-color mismatch: expected ${expectedFillColor}, got ${actualFillColor}`);
          }
          if (actualFillOpacity !== expectedFillOpacity) {
            console.warn(`⚠️ ${layerId} fill-opacity mismatch: expected ${expectedFillOpacity}, got ${actualFillOpacity}`);
          }
          if (actualOutlineColor !== expectedOutlineColor) {
            console.warn(`⚠️ ${layerId} fill-outline-color mismatch: expected ${expectedOutlineColor}, got ${actualOutlineColor}`);
          }
        }
      });
    }, 100); // Check after 100ms to see if something overrode our changes

    console.log('✅ Finished updating existing highlights');
  };
  

  useEffect(() => {
    if (activeTab === 'map') {
      console.log('Active tab is "map", resizing...');
      setTimeout(() => {
        if (mapRef.current) {
          mapRef.current.resize();
          if (isPrinting) {
            mapRef.current.triggerRepaint?.();
            setOverlayRenderVersion((v) => v + 1);
            requestAnimationFrame(() => setOverlayRenderVersion((v) => v + 1));
          }
        }
      }, 50); // Slight delay ensures layout is fully applied
    }
  }, [activeTab, isPrinting]);

  useEffect(() => {
    if (mapRef.current && mapRef.current.isStyleLoaded()) {
      console.log('Forcing map resize due to paperSize change:', paperSize);
      setTimeout(() => {
        mapRef.current.resize();
        if (isPrinting) {
          mapRef.current.triggerRepaint?.();
          setOverlayRenderVersion((v) => v + 1);
        }
      }, 100); // Allow slight delay for DOM to apply new dimensions
    }
  }, [paperSize, isPrinting]);
  
  useEffect(() => {
    if (!mapIsReady || !mapRef.current) return;
    const map = mapRef.current;

    const notifyInteraction = () => {
      if (typeof window !== 'undefined' && window.__collapseSidePanel) {
        window.__collapseSidePanel();
      }
      const event = new CustomEvent('map-user-interaction');
      window.dispatchEvent(event);
      document.dispatchEvent(event);
    };

    map.on('movestart', notifyInteraction);
    map.on('zoomstart', notifyInteraction);
    map.on('rotatestart', notifyInteraction);
    map.on('pitchstart', notifyInteraction);
    map.on('click', notifyInteraction);
    map.on('touchstart', notifyInteraction);

    return () => {
      map.off('movestart', notifyInteraction);
      map.off('zoomstart', notifyInteraction);
      map.off('rotatestart', notifyInteraction);
      map.off('pitchstart', notifyInteraction);
      map.off('click', notifyInteraction);
      map.off('touchstart', notifyInteraction);
    };
  }, [mapIsReady]);
  
  // Add this MVP Tegola layer on map load for debugging
  

  /**
   * =============== Zoom to User's Location ===============
   * Uses Capacitor Geolocation plugin for native apps, or browser geolocation API for web.
   * 
   * Note: iOS Simulator requires a simulated location to be set in Xcode:
   * Features > Location > Custom Location (or choose a preset)
   */
  const handleZoomToLocation = async () => {
    if (!mapRef.current) return;
    
    const isNative = isNativeApp();

    // Show loading indicator
    setIsMapLoading(true);

    // Safety timeout to ensure loading state doesn't get stuck
    const timeoutDuration = isNative ? 15000 : 15000;
    const safetyTimeout = setTimeout(() => {
      console.warn('Geolocation request timed out (safety timeout)');
      setIsMapLoading(false);
      alert('Location request timed out. Please try again.');
    }, timeoutDuration);

    const clearSafetyTimeout = () => {
      clearTimeout(safetyTimeout);
    };

    try {
      let position;

      if (isNative) {
        // Try Capacitor Geolocation plugin first, fallback to browser API if not available
        console.log('Attempting to use Capacitor Geolocation plugin...');
        
        // Check if Capacitor Geolocation is available
        let useCapacitorPlugin = typeof Geolocation !== 'undefined' && 
                                 Geolocation.requestPermissions && 
                                 Geolocation.getCurrentPosition;
        
        if (useCapacitorPlugin) {
          try {
            // Request permissions first
            const permissionStatus = await Geolocation.requestPermissions();
            console.log('Permission status:', permissionStatus);
            
            if (permissionStatus.location !== 'granted') {
              clearSafetyTimeout();
              setIsMapLoading(false);
              alert('Location permission denied.\n\nPlease enable location services:\nSettings > Privacy > Location Services > Teton County GIS');
              return;
            }

            // Get current position
            position = await Geolocation.getCurrentPosition({
              enableHighAccuracy: false,
              timeout: 10000,
              maximumAge: 300000 // Accept cached location up to 5 minutes old
            });
            
            console.log('Capacitor geolocation result:', position);
          } catch (error) {
            console.warn('Capacitor Geolocation failed, falling back to browser API:', error);
            // Fall through to browser geolocation
            useCapacitorPlugin = false;
            position = null;
          }
        }
        
        // Fallback to browser geolocation if Capacitor plugin not available or failed
        if (!useCapacitorPlugin || !position) {
          console.log('Using browser geolocation API as fallback...');
    
    if (!navigator.geolocation) {
            clearSafetyTimeout();
            setIsMapLoading(false);
            alert('Geolocation is not supported. Please enable location services.');
            return;
          }
          
          // Use browser geolocation with settings optimized for native WebView
          position = await new Promise((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(
              (pos) => resolve(pos),
              (err) => reject(err),
              {
                enableHighAccuracy: false, // Less aggressive for WebView
                timeout: 12000,
                maximumAge: 300000 // Accept cached location up to 5 minutes old
              }
            );
          });
        }
      } else {
        // Use browser geolocation API for web
        if (!navigator.geolocation) {
          clearSafetyTimeout();
          setIsMapLoading(false);
      alert('Geolocation is not supported by your browser');
      return;
    }

        console.log('Using browser geolocation API...');

        // Wrap browser geolocation in a promise
        position = await new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
            (pos) => resolve(pos),
            (err) => reject(err),
            {
              enableHighAccuracy: true,
              timeout: 12000,
              maximumAge: 60000
            }
          );
        });
      }

      clearSafetyTimeout();
      
      // Extract coordinates (Capacitor uses different structure)
      const latitude = position.coords?.latitude || position.latitude;
      const longitude = position.coords?.longitude || position.longitude;
      
        console.log('User location:', latitude, longitude);
      
      if (!latitude || !longitude) {
        throw new Error('Invalid location coordinates');
      }
        
      // Zoom tighter so the "zoom to me" action is parcel-level, not broad area.
        mapRef.current.flyTo({
          center: [longitude, latitude],
        zoom: 18,
          duration: 1500
        });

        setIsMapLoading(false);
    } catch (error) {
      clearSafetyTimeout();
        console.error('Error getting user location:', error);
        setIsMapLoading(false);
      
      let errorMessage = 'Unable to get your location.';
      if (error.code === error.PERMISSION_DENIED || (error.message && error.message.includes('permission'))) {
        errorMessage = isNative 
          ? 'Location permission denied.\n\nPlease enable location services:\nSettings > Privacy > Location Services > Teton County GIS'
          : 'Location permission denied. Please enable location services in your browser settings.';
      } else if (error.code === error.POSITION_UNAVAILABLE || (error.message && error.message.includes('unavailable'))) {
        errorMessage = isNative
          ? 'Location unavailable.\n\nIf using iOS Simulator:\nFeatures > Location > Custom Location\n\nOn device: Check location services are enabled.'
          : 'Location information is unavailable.';
      } else if (error.code === error.TIMEOUT || (error.message && error.message.includes('timeout'))) {
        errorMessage = isNative
          ? 'Location request timed out.\n\nIf using iOS Simulator:\nFeatures > Location > Custom Location\n\nOn device: Check location services.'
          : 'Location request timed out. Please try again.';
      } else {
        errorMessage = `Error: ${error.message || 'Unknown error occurred'}`;
      }
      
      alert(errorMessage);
    }
  };

  return (
    <div className="map-container">
      {isMapLoading && <Spinner />}
      <MobileSearch />
      {routerLocation.pathname === '/map' && <MapReportBuilderBar />}
      <div className="location-zoom-button-container" data-tour="location-zoom">
        <button 
          className="location-zoom-button" 
          onClick={handleZoomToLocation}
          title="Zoom to My Location"
        >
          <img
            src="/location-icon.svg"
            alt="Zoom to Location"
            className="location-icon"
          />
        </button>
      </div>
      <div
        className={`layer-selector-container${isBasemapTutorialStep ? ' tutorial-force-open' : ''}`}
        data-tour="basemap-selector"
      >
        <button className="layer-selector-button" data-tour="basemap-toggle-button">
          <img
            src="/basemap.png"
            alt="Layers"
            className="layer-icon"
          />
        </button>
        <div className="layer-selector-popup" data-tour="basemap-popup">
          <div className="basemap-grid">
            {basemapConfig.map((basemapOption) => {
              const activeBasemapId =
                String(currentBasemapId || activeBasemapIdRef?.current || baseMapRef.current || '').trim();
              const isActive =
                basemapOption.id === 'imagery'
                  ? activeBasemapId === 'imagery' || activeBasemapId === 'imagery-3d'
                  : activeBasemapId === basemapOption.id;
              return (
                <button
                  key={basemapOption.id}
                  className={`basemap-option ${isActive ? 'active' : ''}`}
                  data-tour={basemapOption.id === 'imagery' ? 'basemap-option-imagery' : undefined}
                  onClick={basemapOption.onClick}
                  title={basemapOption.label}
                >
                  <img
                    src={basemapOption.image}
                    alt={basemapOption.label}
                    className="basemap-thumbnail"
                    onError={(e) => {
                      e.target.src = basemapOption.fallback || '/logo192.png';
                    }}
                  />
                  <span className="basemap-label">{basemapOption.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
      <div
        className="map-floating-control-container map-floating-control-3d-container"
        data-tour="map-3d-toggle"
      >
        <button
          className={`map-floating-control-button ${is3DEnabled ? 'active' : ''}`}
          onClick={() => setIs3DEnabled((prev) => !prev)}
          title="Toggle 3D terrain"
        >
          <span className="map-floating-control-text">3D</span>
        </button>
      </div>
      <div
        className="map-floating-control-container map-floating-control-contours-container"
        data-tour="map-contours-toggle"
      >
        <button
          className={`map-floating-control-button ${isContoursEnabled ? 'active' : ''}`}
          onClick={() => setIsContoursEnabled((prev) => !prev)}
          title="Toggle contour lines"
        >
          <svg
            className="map-floating-control-icon"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path
              d="M2 6c2 0 2-2 4-2s2 2 4 2 2-2 4-2 2 2 4 2 2-2 4-2M2 12c2 0 2-2 4-2s2 2 4 2 2-2 4-2 2 2 4 2 2-2 4-2M2 18c2 0 2-2 4-2s2 2 4 2 2-2 4-2 2 2 4 2 2-2 4-2"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </div>
      {!isClientShareMapRoute && (
      <ToolPanel
        onZoomIn={() => mapRef.current.zoomIn()}
        onZoomOut={() => mapRef.current.zoomOut()}
        onDrawLine={drawLine}
        onDrawPolygon={drawPolygon}
        onSelectParcels={selectParcelsWithPolygon}
        onDeleteSelectedFeature={deleteSelectedFeature}
        onClear={clearAllDrawings}
      />
      )}
      {!isClientShareMapRoute && (
      <SidePanel
        isOpen={isPanelOpen}
        togglePanel={() => setIsPanelOpen(!isPanelOpen)}
        layerStatus={layerStatus}
        setLayerStatus={(layerName) =>
          setLayerStatus((prevStatus) => ({
            ...prevStatus,
            [layerName]: !prevStatus[layerName],
          }))
        }
        activeSidePanelTab={activeSidePanelTab}
        setActiveSidePanelTab={setActiveSidePanelTab}
        selectedFeature={selectedFeature}
        topLayer={topLayer}
        layerOrder={layerOrder}
        setLayerOrder={setLayerOrder}
        onZoomToFeature={zoomToIndividualFeature}
        printBasemapOptions={printBasemapOptionList}
        currentBasemapId={currentBasemapId || basemap}
        onPrintBasemapSelect={handlePrintBasemapSelect}
        onOpenLayersTabForPrint={() => setActiveSidePanelTab('layers')}
        onCreateBoundaryFromRegridParcel={handleCreateBoundaryFromRegridParcel}
        onAutoFillMapFromBoundary={handleAutoFillMapFromBoundary}
        isAutoFillMapLoading={isAutoFillMapLoading}
        hasBoundaryForAutoFill={hasBoundaryForAutoFill}
        onZoomToPrintElement={zoomToPrintElement}
      />
      )}
      
      {/* Map + print overlay share one coordinate system (map project / canvas px). */}
      <div
        className="map-geo-print-stack"
        onDragOver={handlePrintMapDragOver}
        onDrop={handlePrintMapDrop}
      >
        {/* Map container - full screen */}
        <div
          id="map"
          className={`map ${isPanelOpen ? 'with-panel' : ''}`}
          style={containerStyle}
          onMouseDown={() => {
            if (!isPrinting) return;
            if (activePrintTool && activePrintTool !== 'select') return;
            if (selectedPrintElement) {
              setSelectedPrintElement(null);
            }
          }}
        ></div>

      {isPrinting && printLayoutMode && (
        <div className="print-layout-overlay" aria-hidden>
          {printLayoutRect && (
            <Rnd
              bounds="parent"
              size={{ width: printLayoutRect.width, height: printLayoutRect.height }}
              position={{ x: printLayoutRect.x, y: printLayoutRect.y }}
              style={{ pointerEvents: 'auto', zIndex: 19 }}
              minWidth={220}
              minHeight={160}
              dragHandleClassName="print-layout-selection-box"
              onDragStop={(e, d) =>
                setPrintLayoutRect((prev) => ({
                  ...(prev || {}),
                  x: d.x,
                  y: d.y,
                  width: prev?.width || 300,
                  height: prev?.height || 220,
                }))
              }
              onResizeStop={(e, direction, ref, delta, position) =>
                setPrintLayoutRect({
                  x: position.x,
                  y: position.y,
                  width: parseFloat(ref.style.width),
                  height: parseFloat(ref.style.height),
                })
              }
            >
              <div className="print-layout-selection-box">
                <div className="print-layout-selection-label">Print area</div>
              </div>
            </Rnd>
          )}
        </div>
      )}

      {/* Notes overlay - full screen */}
      {isPrinting && (
        <div
          id="notes-overlay"
          data-render-version={overlayRenderVersion}
          onClick={(e) => {
            if (!mapRef.current) return;
            if (shareViewerReadOnly) return;
            if (!activePrintTool || activePrintTool === 'select') return;
            if (isPolygonPlacingTool(activePrintTool) || isPolylinePlacingTool(activePrintTool)) {
              return;
            }
            const map = mapRef.current;
            const rect = map.getCanvas().getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            const lngLat = map.unproject([x, y]);
            addPrintElementFromTool(activePrintTool, {}, { lng: lngLat.lng, lat: lngLat.lat });
            setActivePrintTool('select');
          }}
          onMouseMove={(e) => {
            if (!mapRef.current || !isPrintShapeIconPlacingTool(activePrintTool)) return;
            const rect = mapRef.current.getCanvas().getBoundingClientRect();
            setPrintIconPlaceCursorPx({
              x: e.clientX - rect.left,
              y: e.clientY - rect.top,
            });
          }}
          onMouseLeave={() => setPrintIconPlaceCursorPx(null)}
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            display: 'block',
            pointerEvents:
              activePrintTool &&
              activePrintTool !== 'select' &&
              !isPolygonPlacingTool(activePrintTool) &&
              !isPolylinePlacingTool(activePrintTool)
                ? 'auto'
                : 'none',
            zIndex: 6,
          }}
        >
              {isPrinting &&
                isPrintShapeIconPlacingTool(activePrintTool) &&
                printIconPlaceCursorPx &&
                mapRef.current &&
                (() => {
                  const parsed = parsePrintPlacementTool(activePrintTool);
                  const svgKey = parsed.shapeSvgKey;
                  if (!svgKey) return null;
                  const renderSvg = svgMap[svgKey];
                  if (!renderSvg) return null;
                  const iconDefaults = getPointIconDefaultStyle(svgKey) || {};
                  const s = getPrintPixelScale(mapRef.current);
                  const baseW = 70;
                  const baseH = 70;
                  const w = baseW * s;
                  const h = baseH * s;
                  return (
                    <div
                      key="print-shape-place-preview"
                      aria-hidden
                      style={{
                        position: 'absolute',
                        left: printIconPlaceCursorPx.x,
                        top: printIconPlaceCursorPx.y,
                        transform: 'translate(-50%, -50%)',
                        width: w,
                        height: h,
                        pointerEvents: 'none',
                        zIndex: 25,
                        opacity: 0.9,
                        filter: 'drop-shadow(0 2px 8px rgba(15, 23, 42, 0.35))',
                      }}
                    >
                      {renderSvg({
                        fill: iconDefaults.fill ?? '#ffffff',
                        stroke: iconDefaults.stroke ?? '#111827',
                        strokeWidth: iconDefaults.strokeWidth ?? 2.5,
                        fillOpacity: 1,
                        strokeOpacity: 1,
                        iconOpacity: 1,
                        iconScale: 0.64,
                        logoColor: iconDefaults.logoColor ?? '#111827',
                      })}
                    </div>
                  );
                })()}
              {isPolygonPlacingTool(activePrintTool) && polygonDraftPoints.length > 0 && (
                <svg
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: '100%',
                    pointerEvents: 'none',
                  }}
                >
                  <polyline
                    points={polygonDraftPoints
                      .map((point) => {
                        const p = mapRef.current.project([point.lng, point.lat]);
                        return `${p.x},${p.y}`;
                      })
                      .join(' ')}
                    fill="none"
                    stroke={getPolygonDraftStyle().stroke}
                    strokeWidth={getPolygonDraftStyle().strokeWidth || 2}
                    strokeDasharray="6 4"
                  />
                  {polygonCursorPoint && (() => {
                    const last = polygonDraftPoints[polygonDraftPoints.length - 1];
                    const first = polygonDraftPoints[0];
                    if (!last) return null;
                    const p = mapRef.current.project([last.lng, last.lat]);
                    const fp = mapRef.current.project([first.lng, first.lat]);
                    return (
                      <>
                        <line
                          x1={p.x}
                          y1={p.y}
                          x2={polygonCursorPoint.x}
                          y2={polygonCursorPoint.y}
                          stroke={getPolygonDraftStyle().stroke}
                          strokeWidth={getPolygonDraftStyle().strokeWidth || 2}
                          strokeDasharray="6 4"
                        />
                        <line
                          x1={polygonCursorPoint.x}
                          y1={polygonCursorPoint.y}
                          x2={fp.x}
                          y2={fp.y}
                          stroke={getPolygonDraftStyle().stroke}
                          strokeWidth={getPolygonDraftStyle().strokeWidth || 2}
                          strokeDasharray="3 3"
                          opacity={0.8}
                        />
                      </>
                    );
                  })()}
                </svg>
              )}
              {isPolylinePlacingTool(activePrintTool) && polylineDraftPoints.length > 0 && (() => {
                const ds = getPolylineDraftStyle();
                const dash =
                  ds.lineDasharray === null || ds.lineDasharray === undefined
                    ? undefined
                    : ds.lineDasharray;
                const headMode = activePrintTool === 'arrow' ? 'end' : ds.arrowHead || 'none';
                const screenPts = polylineDraftPoints.map((pt) => {
                  const p = mapRef.current.project([pt.lng, pt.lat]);
                  return [p.x, p.y];
                });
                const tickSegs =
                  ds.transmissionTicks && screenPts.length >= 2
                    ? transmissionTickSegments(screenPts, 20, 6)
                    : [];
                return (
                  <svg
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      width: '100%',
                      height: '100%',
                      pointerEvents: 'none',
                    }}
                  >
                    {ds.fenceOutlineStroke && (
                      <polyline
                        points={screenPts.map(([x, y]) => `${x},${y}`).join(' ')}
                        fill="none"
                        stroke={ds.fenceOutlineStroke}
                        strokeWidth={ds.fenceOutlineWidth ?? 5}
                        strokeOpacity={ds.fenceOutlineOpacity ?? 0.35}
                        strokeLinecap={ds.strokeLinecap || 'round'}
                        strokeLinejoin="round"
                      />
                    )}
                    <polyline
                      points={screenPts.map(([x, y]) => `${x},${y}`).join(' ')}
                      fill="none"
                      stroke={ds.stroke}
                      strokeWidth={ds.strokeWidth || 2}
                      strokeOpacity={ds.strokeOpacity ?? 1}
                      strokeDasharray={dash}
                      strokeLinecap={ds.strokeLinecap || 'round'}
                      strokeLinejoin="round"
                    />
                    {ds.roadMarkingStroke && (
                      <polyline
                        points={screenPts.map(([x, y]) => `${x},${y}`).join(' ')}
                        fill="none"
                        stroke={ds.roadMarkingStroke}
                        strokeWidth={ds.roadMarkingWidth ?? 2}
                        strokeOpacity={ds.strokeOpacity ?? 1}
                        strokeDasharray={ds.roadMarkingDasharray || undefined}
                        strokeLinecap={ds.roadMarkingLinecap || 'round'}
                        strokeLinejoin="round"
                      />
                    )}
                    {tickSegs.map((t, i) => (
                      <line
                        key={`dtk-${i}`}
                        x1={t.x1}
                        y1={t.y1}
                        x2={t.x2}
                        y2={t.y2}
                        stroke={ds.stroke}
                        strokeWidth={1.2}
                        strokeOpacity={0.9}
                      />
                    ))}
                    {polylineCursorPoint &&
                      (() => {
                        const last = polylineDraftPoints[polylineDraftPoints.length - 1];
                        if (!last) return null;
                        const p = mapRef.current.project([last.lng, last.lat]);
                        const draftStroke = ds.stroke || '#111827';
                        const draftSw = ds.strokeWidth || 2;
                        const x1 = p.x;
                        const y1 = p.y;
                        const x2 = polylineCursorPoint.x;
                        const y2 = polylineCursorPoint.y;
                        const rubberPts =
                          polylineDraftPoints.length >= 2
                            ? [...screenPts, [x2, y2]]
                            : [[x1, y1], [x2, y2]];
                        const rubberTicks =
                          ds.transmissionTicks && rubberPts.length >= 2
                            ? transmissionTickSegments(rubberPts, 20, 6)
                            : [];
                        return (
                          <>
                            <line
                              x1={x1}
                              y1={y1}
                              x2={x2}
                              y2={y2}
                              stroke={draftStroke}
                              strokeOpacity={ds.strokeOpacity ?? 1}
                              strokeWidth={draftSw}
                              strokeDasharray={dash}
                              strokeLinecap={ds.strokeLinecap || 'round'}
                            />
                            {rubberTicks.map((t, i) => (
                              <line
                                key={`dtkr-${i}`}
                                x1={t.x1}
                                y1={t.y1}
                                x2={t.x2}
                                y2={t.y2}
                                stroke={draftStroke}
                                strokeWidth={1.2}
                                strokeOpacity={0.9}
                              />
                            ))}
                            {(headMode === 'end' || headMode === 'both') && (
                              <polygon
                                points={arrowHeadPolygon(x1, y1, x2, y2, draftSw)}
                                fill={draftStroke}
                                fillOpacity={ds.strokeOpacity ?? 1}
                              />
                            )}
                            {headMode === 'both' && polylineDraftPoints.length >= 1 && (() => {
                              const fp = mapRef.current.project([
                                polylineDraftPoints[0].lng,
                                polylineDraftPoints[0].lat,
                              ]);
                              const sec =
                                polylineDraftPoints.length >= 2
                                  ? mapRef.current.project([
                                      polylineDraftPoints[1].lng,
                                      polylineDraftPoints[1].lat,
                                    ])
                                  : { x: x2, y: y2 };
                              return (
                                <polygon
                                  points={arrowHeadPolygon(sec.x, sec.y, fp.x, fp.y, draftSw)}
                                  fill={draftStroke}
                                  fillOpacity={ds.strokeOpacity ?? 1}
                                />
                              );
                            })()}
                          </>
                        );
                      })()}
                  </svg>
                );
              })()}
              {isPolygonPlacingTool(activePrintTool) && polygonDraftPoints.length >= 2 && (() => {
                const metrics = getMetricsForPolygonLngLat(
                  polygonCursorPoint
                    ? [...polygonDraftPoints, mapRef.current.unproject([polygonCursorPoint.x, polygonCursorPoint.y])]
                    : polygonDraftPoints
                );
                if (!metrics || !polygonCursorPoint) return null;
                return (
                  <div
                    style={{
                      position: 'absolute',
                      top: polygonCursorPoint.y + 12,
                      left: polygonCursorPoint.x + 12,
                      background: 'rgba(15, 23, 42, 0.88)',
                      color: '#fff',
                      padding: '8px 10px',
                      borderRadius: 6,
                      fontSize: 12,
                      zIndex: 20,
                      pointerEvents: 'none',
                    }}
                  >
                    <div>Area: {(metrics.areaSqMeters / 4046.8564224).toFixed(2)} ac</div>
                    <div>Perim: {(metrics.perimeterMeters * 3.28084).toFixed(0)} ft</div>
                  </div>
                );
              })()}
              {isPolylinePlacingTool(activePrintTool) && polylineDraftPoints.length >= 1 && (() => {
                if (!polylineCursorPoint) return null;
                const metrics = getMetricsForLineLngLat([
                  ...polylineDraftPoints,
                  mapRef.current.unproject([polylineCursorPoint.x, polylineCursorPoint.y]),
                ]);
                if (!metrics) return null;
                return (
                  <div
                    style={{
                      position: 'absolute',
                      top: polylineCursorPoint.y + 12,
                      left: polylineCursorPoint.x + 12,
                      background: 'rgba(15, 23, 42, 0.88)',
                      color: '#fff',
                      padding: '8px 10px',
                      borderRadius: 6,
                      fontSize: 12,
                      zIndex: 20,
                      pointerEvents: 'none',
                    }}
                  >
                    <div>Length: {(metrics.lengthMeters * 3.28084).toFixed(0)} ft</div>
                  </div>
                );
              })()}
              {isPrinting &&
                printElements.map((element) => {
                  if (!shouldRenderPrintElementOnMap(element)) return null;
                  const projected = withGeoProjectedFrame(element);
                  const placingTool = activePrintTool && activePrintTool !== 'select';
                  const featurePtr =
                    placingTool || (activePrintTool === 'select' && selectedPrintElement?.id !== element.id)
                      ? 'none'
                      : 'auto';
                  switch (element.type) {
                    case 'polygon': {
                      const polygonPoints = projected.projectedPolygonPoints || [];
                      const isSelected = selectedPrintElement?.id === element.id;
                      const isParcelBoundary = isPrintParcelBoundaryPolygon(element);
                      const polygonPointer =
                        isParcelBoundary && featurePtr === 'auto' ? 'stroke' : featurePtr;
                      const centroid = polygonPoints.length
                        ? polygonPoints.reduce(
                            (acc, [x, y]) => ({ x: acc.x + x, y: acc.y + y }),
                            { x: 0, y: 0 }
                          )
                        : { x: 0, y: 0 };
                      const centerX = polygonPoints.length ? centroid.x / polygonPoints.length : 0;
                      const centerY = polygonPoints.length ? centroid.y / polygonPoints.length : 0;
                      return (
                        <svg
                          key={`${element.id}-${selectedPrintElement?.id ?? 'none'}`}
                          style={{
                            position: 'absolute',
                            top: 0,
                            left: 0,
                            width: '100%',
                            height: '100%',
                            pointerEvents: 'none',
                            overflow: 'visible',
                            zIndex: 2,
                          }}
                        >
                          <polygon
                            points={polygonPoints
                              .map(([x, y]) => `${x},${y}`)
                              .join(' ')}
                            fill={element.fill || '#10b981'}
                            fillOpacity={element.fillOpacity ?? 0.25}
                            stroke={element.stroke || '#0f5132'}
                            strokeWidth={element.strokeWidth ?? 2}
                            strokeOpacity={element.strokeOpacity ?? 1}
                            strokeDasharray={element.lineDasharray ?? undefined}
                            style={{
                              pointerEvents: polygonPointer,
                              cursor: 'pointer',
                            }}
                            onClick={(evt) => {
                              evt.stopPropagation();
                              setSelectedPrintElement(element);
                            }}
                          />
                          {isSelected && (
                            <g
                              onClick={(evt) => {
                                evt.stopPropagation();
                                deletePrintElement(element.id);
                              }}
                              style={{ cursor: 'pointer', pointerEvents: 'auto' }}
                            >
                              <circle cx={centerX} cy={centerY} r={12} fill="#b91c1c" />
                              <text
                                x={centerX}
                                y={centerY + 4}
                                textAnchor="middle"
                                fill="#ffffff"
                                fontSize="14"
                                fontWeight="700"
                              >
                                x
                              </text>
                            </g>
                          )}
                        </svg>
                      );
                    }
                    case 'polyline':
                    case 'arrow': {
                      const linePts = projected.projectedLinePoints || [];
                      if (linePts.length < 2) return null;
                      const headMode = element.type === 'arrow' ? 'end' : element.arrowHead || 'none';
                      const showEndHead = headMode === 'end' || headMode === 'both';
                      const showStartHead = headMode === 'both';
                      const ptsStr = linePts.map(([x, y]) => `${x},${y}`).join(' ');
                      const isSelected = selectedPrintElement?.id === element.id;
                      const bbox = linePts.reduce(
                        (acc, [x, y]) => ({
                          minX: Math.min(acc.minX, x),
                          maxX: Math.max(acc.maxX, x),
                          minY: Math.min(acc.minY, y),
                          maxY: Math.max(acc.maxY, y),
                        }),
                        { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity }
                      );
                      const centerX =
                        linePts.length && Number.isFinite(bbox.minX)
                          ? (bbox.minX + bbox.maxX) / 2
                          : 0;
                      const centerY =
                        linePts.length && Number.isFinite(bbox.minY)
                          ? (bbox.minY + bbox.maxY) / 2
                          : 0;
                      const dash = element.lineDasharray;
                      const strokeCol = element.stroke || (element.type === 'arrow' ? '#d97706' : '#2563eb');
                      const sw = element.strokeWidth ?? 3;
                      const cap = element.strokeLinecap || 'round';
                      const join = element.strokeLinejoin || 'round';
                      const endSeg = showEndHead
                        ? segmentIndexTowardTip(linePts, linePts.length - 1)
                        : null;
                      const startSeg = showStartHead
                        ? segmentIndexTowardTip(linePts, 0)
                        : null;
                      const tickSegs = element.transmissionTicks
                        ? transmissionTickSegments(linePts, 20, 7)
                        : [];
                      return (
                        <svg
                          key={`${element.id}-${selectedPrintElement?.id ?? 'none'}`}
                          style={{
                            position: 'absolute',
                            top: 0,
                            left: 0,
                            width: '100%',
                            height: '100%',
                            pointerEvents: 'none',
                            overflow: 'visible',
                            zIndex: 2,
                          }}
                        >
                          <polyline
                            points={ptsStr}
                            fill="none"
                            stroke="transparent"
                            strokeWidth={14}
                            strokeLinecap={cap}
                            strokeLinejoin={join}
                            style={{ pointerEvents: featurePtr, cursor: 'pointer' }}
                            onClick={(evt) => {
                              evt.stopPropagation();
                              setSelectedPrintElement(element);
                            }}
                          />
                          {element.fenceOutlineStroke && (
                            <polyline
                              points={ptsStr}
                              fill="none"
                              stroke={element.fenceOutlineStroke}
                              strokeWidth={element.fenceOutlineWidth ?? 5}
                              strokeOpacity={element.fenceOutlineOpacity ?? 0.35}
                              strokeLinecap={cap}
                              strokeLinejoin={join}
                              style={{ pointerEvents: 'none' }}
                            />
                          )}
                          <polyline
                            points={ptsStr}
                            fill="none"
                            stroke={strokeCol}
                            strokeWidth={sw}
                            strokeOpacity={element.strokeOpacity ?? 1}
                            strokeLinecap={cap}
                            strokeLinejoin={join}
                            strokeDasharray={dash || undefined}
                            style={{ pointerEvents: 'none' }}
                          />
                          {element.roadMarkingStroke && (
                            <polyline
                              points={ptsStr}
                              fill="none"
                              stroke={element.roadMarkingStroke}
                              strokeWidth={element.roadMarkingWidth ?? 2}
                              strokeOpacity={element.strokeOpacity ?? 1}
                              strokeLinecap={element.roadMarkingLinecap || 'round'}
                              strokeLinejoin={join}
                              strokeDasharray={element.roadMarkingDasharray || undefined}
                              style={{ pointerEvents: 'none' }}
                            />
                          )}
                          {tickSegs.map((t, i) => (
                            <line
                              key={`tx-${element.id}-${i}`}
                              x1={t.x1}
                              y1={t.y1}
                              x2={t.x2}
                              y2={t.y2}
                              stroke={strokeCol}
                              strokeOpacity={element.strokeOpacity ?? 1}
                              strokeWidth={1.25}
                              style={{ pointerEvents: 'none' }}
                            />
                          ))}
                          {endSeg && (
                            <polygon
                              points={arrowHeadPolygon(endSeg.ax1, endSeg.ay1, endSeg.ax2, endSeg.ay2, sw)}
                              fill={strokeCol}
                              fillOpacity={element.strokeOpacity ?? 1}
                              style={{ pointerEvents: 'none' }}
                            />
                          )}
                          {startSeg && (
                            <polygon
                              points={arrowHeadPolygon(
                                startSeg.ax1,
                                startSeg.ay1,
                                startSeg.ax2,
                                startSeg.ay2,
                                sw
                              )}
                              fill={strokeCol}
                              fillOpacity={element.strokeOpacity ?? 1}
                              style={{ pointerEvents: 'none' }}
                            />
                          )}
                          {isSelected && (
                            <g
                              onClick={(evt) => {
                                evt.stopPropagation();
                                deletePrintElement(element.id);
                              }}
                              style={{ cursor: 'pointer', pointerEvents: 'auto' }}
                            >
                              <circle cx={centerX} cy={centerY} r={12} fill="#b91c1c" />
                              <text
                                x={centerX}
                                y={centerY + 4}
                                textAnchor="middle"
                                fill="#ffffff"
                                fontSize="14"
                                fontWeight="700"
                              >
                                x
                              </text>
                            </g>
                          )}
                        </svg>
                      );
                    }
                    case 'note':
                      return (
                        <DraggableNote
                          key={`${element.id}-${selectedPrintElement?.id ?? 'none'}`}
                          note={projected}
                          onNoteChange={(updated) => updatePrintElement(syncProjectedEditToGeo(updated))}
                          onDelete={deletePrintElement}
                          bounds="#notes-overlay"
                          featurePointerEvents={featurePtr}
                        />
                      );
                    case 'legend':
                      return (
                        <DraggableLegend
                          key={element.id}
                          element={projected}
                          onPositionChange={(updated) =>
                            updatePrintElement(syncProjectedEditToGeo(updated))
                          }
                          onDelete={() => deletePrintElement(element.id)}
                          featurePointerEvents={featurePtr}
                        >
                          <h4 style={{ color: 'black' }}>Legend</h4>
                          {legendItems}
                        </DraggableLegend>
                      );
                    case 'compass':
                      return (
                        <CompassElement
                          key={element.id}
                          element={projected}
                          onDelete={deletePrintElement}
                          featurePointerEvents={featurePtr}
                        />
                      );
                    case 'shape':
                      return (
                        <ShapeElement
                          key={`${element.id}`}
                          shape={projected}
                          onDelete={deletePrintElement}
                          onChange={(updated) => updatePrintElement(syncProjectedEditToGeo(updated))}
                          featurePointerEvents={featurePtr}
                        />
                      );
                    case 'rectangle':
                      return (
                        <RectangleElement
                          key={`${element.id}`}
                          shape={projected}
                          onChange={(updated) => updatePrintElement(syncProjectedEditToGeo(updated))}
                          onDelete={deletePrintElement}
                          featurePointerEvents={featurePtr}
                        />
                      );
                    case 'diamond':
                      return (
                        <DiamondElement
                          key={`${element.id}-${selectedPrintElement?.id ?? 'none'}`}
                          shape={projected}
                          onChange={(updated) => updatePrintElement(syncProjectedEditToGeo(updated))}
                          onDelete={deletePrintElement}
                          featurePointerEvents={featurePtr}
                        />
                      );
                    case 'triangle':
                      return (
                        <TriangleElement
                          key={`${element.id}`}
                          shape={projected}
                          onChange={(updated) => updatePrintElement(syncProjectedEditToGeo(updated))}
                          onDelete={deletePrintElement}
                          featurePointerEvents={featurePtr}
                        />
                      );
                    default:
                      return null;
                  }
                })}
              {isPrinting &&
                printElements.map((element) => {
                  if (!shouldRenderPrintElementOnMap(element)) return null;
                  const passiveHover =
                    hoveredPrintElementId === element.id && !element.showLabelOnMap;
                  const baseLngLat = getElementAnchorLngLat(element);
                  let geoAnchor = getElementAnchorScreenPosition(element);
                  if (
                    !passiveHover &&
                    labelUsesGeoOffset(element) &&
                    baseLngLat &&
                    mapRef.current
                  ) {
                    geoAnchor = mapRef.current.project([
                      baseLngLat.lng + element.labelOffsetDLng,
                      baseLngLat.lat + element.labelOffsetDLat,
                    ]);
                  }
                  const anchor =
                    passiveHover && hoveredPrintCursorOverlayPx
                      ? hoveredPrintCursorOverlayPx
                      : geoAnchor;
                  const labelText = buildMapLabelDisplayText(element);
                  const shouldShow =
                    labelText.trim().length > 0 &&
                    (element.showLabelOnMap || hoveredPrintElementId === element.id);
                  if (!shouldShow || !anchor) return null;
                  const labelSelectable =
                    !shareViewerReadOnly &&
                    (!activePrintTool || activePrintTool === 'select');
                  return (
                    <PrintMapLabel
                      key={`lbl-${element.id}`}
                      element={element}
                      anchor={anchor}
                      mapRef={mapRef}
                      labelBaseLngLat={baseLngLat}
                      passiveHover={passiveHover}
                      selected={selectedPrintElement?.id === element.id}
                      selectable={labelSelectable}
                      onSelect={() => setSelectedPrintElement(element)}
                      updatePrintElement={updatePrintElement}
                    />
                  );
                })}
        </div>
      )}
      </div>

      {shareViewerReadOnly && currentSharePhotoElement && currentSharePhotoGallery.length > 0 && (
        <div
          className="shared-photo-card-wrap"
          style={currentSharePhotoCardStyle}
          onMouseEnter={() => setHoveredPrintElementId(null)}
        >
          <article className="shared-photo-card" role="dialog" aria-label="Photo point">
            <header className="shared-photo-card-header">
              <h3 className="shared-photo-card-title">
                {(currentSharePhotoElement.label && String(currentSharePhotoElement.label).trim()) ||
                  'Photo Point'}
              </h3>
              <button
                type="button"
                className="shared-photo-card-close"
                aria-label="Close"
                onClick={closeSharePhotoPopup}
              >
                x
              </button>
            </header>
            <div className="shared-photo-card-image-shell">
              {currentSharePhotoGallery.length > 1 && (
                <>
                  <button
                    type="button"
                    className="shared-photo-card-photo-nav shared-photo-card-photo-nav-prev"
                    aria-label="Previous photo"
                    onClick={() => stepSharePhotoPopup(-1)}
                  >
                    ‹
                  </button>
                  <button
                    type="button"
                    className="shared-photo-card-photo-nav shared-photo-card-photo-nav-next"
                    aria-label="Next photo"
                    onClick={() => stepSharePhotoPopup(1)}
                  >
                    ›
                  </button>
                  <span className="shared-photo-card-photo-index" aria-live="polite">
                    {sharePhotoPopupIndex + 1} / {currentSharePhotoGallery.length}
                  </span>
                </>
              )}
              <img
                src={currentSharePhotoGallery[Math.min(sharePhotoPopupIndex, currentSharePhotoGallery.length - 1)]}
                alt={currentSharePhotoElement.label || 'Photo point'}
                className="shared-photo-card-image"
              />
              <button
                type="button"
                className="shared-photo-card-expand"
                aria-label="Open fullscreen gallery"
                onClick={() => setSharePhotoPopupFullscreen(true)}
              >
                ⤢
              </button>
            </div>
          </article>
        </div>
      )}
      {shareViewerReadOnly &&
        sharePhotoPopupFullscreen &&
        currentSharePhotoElement &&
        currentSharePhotoGallery.length > 0 && (
          <div className="shared-photo-fullscreen" role="dialog" aria-label="Photo gallery fullscreen">
            <button
              type="button"
              className="shared-photo-fullscreen-backdrop"
              aria-label="Close fullscreen"
              onClick={() => setSharePhotoPopupFullscreen(false)}
            />
            <div
              className="shared-photo-fullscreen-stage"
              onTouchStart={(e) => {
                sharePhotoTouchStartXRef.current = e.changedTouches?.[0]?.clientX ?? null;
              }}
              onTouchEnd={(e) => {
                const startX = sharePhotoTouchStartXRef.current;
                const endX = e.changedTouches?.[0]?.clientX ?? null;
                sharePhotoTouchStartXRef.current = null;
                if (!Number.isFinite(startX) || !Number.isFinite(endX)) return;
                const delta = endX - startX;
                if (Math.abs(delta) < 40) return;
                stepSharePhotoPopup(delta < 0 ? 1 : -1);
              }}
            >
              <button
                type="button"
                className="shared-photo-fullscreen-close"
                onClick={() => setSharePhotoPopupFullscreen(false)}
              >
                x
              </button>
              {currentSharePhotoGallery.length > 1 && (
                <span className="shared-photo-fullscreen-count">
                  Photo {sharePhotoPopupIndex + 1} of {currentSharePhotoGallery.length}
                </span>
              )}
              {currentSharePhotoGallery.length > 1 && (
                <button
                  type="button"
                  className="shared-photo-fullscreen-nav shared-photo-fullscreen-nav-prev"
                  aria-label="Previous photo"
                  onClick={() => stepSharePhotoPopup(-1)}
                >
                  {'<'}
                </button>
              )}
              <img
                src={currentSharePhotoGallery[Math.min(sharePhotoPopupIndex, currentSharePhotoGallery.length - 1)]}
                alt={currentSharePhotoElement.label || 'Photo point'}
                className="shared-photo-fullscreen-image"
              />
              {currentSharePhotoGallery.length > 1 && (
                <button
                  type="button"
                  className="shared-photo-fullscreen-nav shared-photo-fullscreen-nav-next"
                  aria-label="Next photo"
                  onClick={() => stepSharePhotoPopup(1)}
                >
                  {'>'}
                </button>
              )}
            </div>
          </div>
        )}

      {isPrinting && !isPropertyTourRoute && (
        <div
          className={`print-map-top-toolbar${
            shareViewerReadOnly ? ' print-map-top-toolbar--share' : ''
          }`}
        >
          <label
            className={`print-parcels-toggle${
              propertyMapWizardActive ||
              (!shareViewerReadOnly && !layerStatus.ownership)
                ? ' print-parcels-toggle-disabled'
                : ''
            }`}
            title={
              propertyMapWizardActive
                ? 'Parcels stay on while you select boundaries'
                : shareViewerReadOnly
                  ? 'Show or hide parcel outlines (synced with Layers tab)'
                  : !layerStatus.ownership
                    ? 'Turn on Ownership in the Layers tab to show parcels'
                    : 'Show or hide parcel outlines on the map'
            }
          >
            <input
              type="checkbox"
              checked={
                shareViewerReadOnly
                  ? Boolean(layerStatus.ownership)
                  : propertyMapWizardActive ||
                    (Boolean(layerStatus.ownership) && printParcelsOverlayVisible)
              }
              disabled={propertyMapWizardActive || (!shareViewerReadOnly && !layerStatus.ownership)}
              onChange={(e) => {
                if (propertyMapWizardActive) return;
                if (shareViewerReadOnly) {
                  setLayerStatus((prev) => ({
                    ...(prev || {}),
                    ownership: e.target.checked,
                  }));
                  return;
                }
                if (!layerStatus.ownership) return;
                setPrintParcelsOverlayVisible(e.target.checked);
              }}
            />
            <span>Parcels</span>
          </label>
        </div>
      )}

      {isPrinting && propertyMapWizardActive && (
        <div className="property-map-wizard-bar">
          <div className="property-map-wizard-bar-inner">
            <p className="property-map-wizard-title">Select parcel boundaries</p>
            <p className="property-map-wizard-help">
              {propertyMapWizardIntent === 'single' ? (
                <>
                  Click a parcel on the map to select it. When it looks right, press{' '}
                  <strong>Continue with selected parcels</strong> below.
                </>
              ) : (
                <>
                  Click a parcel to select the first one. To add or remove more parcels, hold{' '}
                  <kbd className="property-map-wizard-kbd">Shift</kbd> and click each parcel.
                </>
              )}
            </p>
            <p className="property-map-wizard-help property-map-wizard-help-secondary">
              {propertyMapWizardIntent === 'single'
                ? 'You can change the selection by clicking a different parcel before you continue.'
                : 'When you are ready, continue — multiple parcels merge into one outline when they touch, or separate outlines when they do not.'}
            </p>
            <p className="property-map-wizard-count">
              Selected:{' '}
              <strong>{(selectedFeature || []).filter(isRegridParcelPolygonFeature).length}</strong> parcel
              {(selectedFeature || []).filter(isRegridParcelPolygonFeature).length === 1 ? '' : 's'}
            </p>
            <div className="property-map-wizard-actions">
              <button
                type="button"
                className="property-map-wizard-btn property-map-wizard-btn-secondary"
                onClick={handlePropertyMapWizardCancel}
              >
                Cancel
              </button>
              <button
                type="button"
                className="property-map-wizard-btn property-map-wizard-btn-primary"
                onClick={handlePropertyMapWizardContinue}
                disabled={(selectedFeature || []).filter(isRegridParcelPolygonFeature).length === 0}
              >
                Continue with selected parcels
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Print feature editor: fixed below Save / Back (Print.js ~72px toolbar) */}
      {isPrinting && selectedPrintElement && !shareViewerReadOnly && (
        <div
          className="print-map-feature-edit-wrap"
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
          onMouseEnter={() => setHoveredPrintElementId(null)}
        >
          <PrintFeatureEditPanel
            selectedPrintElement={selectedPrintElement}
            updatePrintElement={updatePrintElement}
            deletePrintElement={deletePrintElement}
            onRequestClose={() => setSelectedPrintElement(null)}
          />
        </div>
      )}

      {(subscriptionStatus !== "active" && subscriptionStatus !== "plus" && subscriptionStatus !== "regular") &&
        role !== "demo" &&
        !isClientShareMapRoute && (
        <div className="map-overlay">
          <h2 className="overlay-title">Login to Access the Map</h2>
          <p className="overlay-text">
            You must have an active subscription to interact with the data.
          </p>
          <button
            className="overlay-button"
            onClick={() => {
              navigate("/login");
            }}
          >
            Sign In
          </button>
        </div>
      )}
    </div>
  );
};

export default MapPage;
