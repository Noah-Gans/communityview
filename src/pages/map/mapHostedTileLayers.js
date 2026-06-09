import {
  getSoilMapLayerId,
  SOIL_FILL_PAINT,
  SOIL_STATE_CODES,
  soilMvtSourceLayerId,
} from '../../components/map/mapStyles';
import { isRegridParcelPolygonFeature } from '../../utils/regridParcelBoundary';
import { isVectorPmtilesArchiveUrl } from './mapLayerShared';

/** Hosted PMTiles archive for Public Land (Mapbox GL ≥3.21 uses HTTPS + ``.pmtiles`` extension). */
export const PUBLIC_LAND_PMTILES_ARCHIVE_URL =
  (typeof process !== 'undefined' &&
    String(process.env.REACT_APP_PUBLIC_LAND_PMTILES_ARCHIVE_URL || '').trim()) ||
  'https://storage.googleapis.com/community_view_layers/tiles/padus_fee_z7_z14.pmtiles';

// URLs for hosted vector tile layers (GCS PMTiles archives)
/** Per-layer zoom limits for vector archives (otherwise defaults apply in `updateLayers`). */
export const vectorTileLayerZoom = {
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

export const tileLayerUrls = {
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
export const rasterTileLayerUrls = {
  wildfire_hazard:
    'https://storage.googleapis.com/community_view_layers/tiles/wildfire_hazard_whp2023_cls_conus_z7_z14.pmtiles',
};

export const rasterTileLayerZoom = {
  wildfire_hazard: { minzoom: 7, maxzoom: 14 },
};

export function getHostedTileLayerUrl(layerName) {
  return tileLayerUrls[layerName] ?? rasterTileLayerUrls[layerName] ?? null;
}

export function isRasterHostedTileLayer(layerName) {
  return Boolean(rasterTileLayerUrls[layerName]);
}

export function tileLayerMapLayersPresent(map, layerName) {
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

export function addSoilStateLayers(map, beforeId) {
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

export function setTileLayerVisibility(map, layerName, visibility) {
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

export function getQueryLayerIdsForTileLayer(layerName, map) {
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
  if (layerName === 'ownership') {
    return ['regrid-parcels-layer', 'regrid-parcels-outline'].filter((id) => map.getLayer(id));
  }
  const single = `${layerName}-layer`;
  return map.getLayer(single) ? [single] : [];
}

/** Whether a clicked/rendered feature belongs to a map layer toggle id (e.g. `ownership`, `public_land`). */
export function featureBelongsToMapLayer(feature, layerName) {
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
export function pickClickedFeature(features, prioritizedLayerNames, includeOwnershipFallback = false) {
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

export function reloadVectorSourceTileCaches(map, sourceId) {
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
export function forceVectorTileSourceRefresh(map, sourceId) {
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

