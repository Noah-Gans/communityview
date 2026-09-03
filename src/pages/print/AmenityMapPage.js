import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import { useLocation, useParams } from 'react-router-dom';
import { useMapContext } from '../MapContext';
import { useUser } from '../../contexts/UserContext';
import MapLoadingOverlay from '../../components/loading/MapLoadingOverlay';
import { mapService } from '../../services/mapService';
import {
  autoGenerateAmenityMap,
  isShareCreateInFlight,
  runShareCreateOnce,
} from '../../utils/amenityMapAutoGenerate';
import { GUEST_EDIT_TOGGLE_ENABLED } from '../../config/featureFlags';
import {
  buildTourNearbyCacheForSave,
  normalizeTourNearbyCacheFromFirestore,
} from '../../utils/tourNearbyFirestore';
import {
  amenityKeysWithSavedFeatures,
  materializeTourSettingsSlidePlan,
  mergePlaceVisibilityFromPrior,
  resolveTourSettingsFromMap,
} from '../../utils/tourSettings';
import {
  buildAmenityMapSettingsForSave,
  canEditAmenityMap,
  isGuestEditAllowed,
} from '../../utils/amenityMapSettings';
import {
  DEFAULT_BASEMAP_ID,
  normalizeBasemapId,
} from '../map/mapConstants';
import {
  getTourNearbySearchCenter,
  TOUR_NEARBY_SEARCH_RADIUS_METERS,
  TOUR_ORBIT_PRINT_FILTER_ATTR,
  TOUR_ORBIT_PRINT_FILTER_VALUE,
} from '../../utils/propertyTourSlides';
import AmenityNamedPlaceAdd from './AmenityNamedPlaceAdd';
import { nearbyQualityTier } from '../../utils/tourNearbyRanking';
import { runNeighborhoodMapFromAmenityEditor } from '../../utils/neighborhoodMap/runNeighborhoodMapFromAmenityEditor';
import {
  AMENITY_MAP_CATEGORIES,
  AMENITY_MAP_CATEGORY_BY_KEY,
  amenityFeatureKey,
  amenityRadiusMetersToMiles,
  amenityRadiusMilesToMeters,
  defaultAmenityRadiusMeters,
} from '../../utils/amenityMapCatalog';
import {
  fitTourBuilderRadiusBounds,
  hideTourEditRadiusCircle,
  showTourEditRadiusCircle,
  ensureTourEditRadiusLayersOnTop,
} from '../../utils/tourBuilderMapLayers';
import { googlePlaceResultToFeature } from '../../utils/tourNearbyGoogleClient';
import {
  AMENITY_HOME_LOGO_URL,
  amenityBadgeImageId,
  amenityBadgeUrl,
  amenityHasBadge,
  ensureAmenityMapLayersOnTop,
  loadAmenityMapIcons,
} from '../../utils/amenityMapIcons';
import {
  buildSharedMapAgentMeta,
  formatAgentWebsiteHref,
  formatAgentWebsiteLabel,
} from '../../utils/sharedMapAgentMeta';
import './AmenityMapPage.css';

const COMMUNITY_VIEW_HOME = '/';
const COMMUNITY_VIEW_LOGO_SRC = '/logo.png';
/** Default amenity map / neighborhood PDF basemap — Discover (outdoors). */
const AMENITY_BASEMAP_ID = DEFAULT_BASEMAP_ID;

const SOURCE_ID = 'cv-amenity-map-source';
const POINT_LAYER_ID = 'cv-amenity-map-points';
const BADGE_LAYER_ID = 'cv-amenity-map-badges';
const LABEL_LAYER_ID = 'cv-amenity-map-labels';
const HOME_MARKER_SIZE_PX = 34;

function stripSearchParam(name) {
  try {
    const params = new URLSearchParams(window.location.search);
    if (!params.has(name)) return;
    params.delete(name);
    const qs = params.toString();
    window.history.replaceState(
      window.history.state,
      '',
      qs ? `${window.location.pathname}?${qs}` : window.location.pathname
    );
  } catch (_) {
    /* ignore */
  }
}

function demoFeature(amenityKey, name, lng, lat, address, distanceText) {
  const placeId = `demo-${amenityKey}-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
  return {
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [lng, lat] },
    properties: {
      amenityKey,
      name,
      placeId,
      place_id: placeId,
      formattedAddress: address,
      distanceText,
      rating: 4.2 + ((name.length % 7) / 10),
      user_ratings_total: 24 + name.length * 9,
    },
  };
}

function buildDemoMapData() {
  const rows = [
    ['parks_rec', 'Alta Plaza Park', -122.4375, 37.7911, 'Steiner St & Clay St, San Francisco', '0.4 mi'],
    ['parks_rec', 'Presidio of San Francisco', -122.455, 37.7989, 'San Francisco, CA', '1.1 mi'],
    ['schools', 'Drew School', -122.4461, 37.7892, '2901 California St, San Francisco', '0.5 mi'],
    ['schools', 'University High School', -122.4432, 37.788, '3065 Jackson St, San Francisco', '0.4 mi'],
    ['coffee', 'Wrecking Ball Coffee Roasters', -122.4369, 37.8004, '2271 Union St, San Francisco', '0.7 mi'],
    ['coffee', 'Jane on Fillmore', -122.4348, 37.7878, '2123 Fillmore St, San Francisco', '0.7 mi'],
    ['dining', 'Spruce', -122.452, 37.7876, '3640 Sacramento St, San Francisco', '0.6 mi'],
    ['dining', 'The Tailor’s Son', -122.4336, 37.7892, '2049 Fillmore St, San Francisco', '0.8 mi'],
    ['grocery', 'Mollie Stone’s Markets', -122.4403, 37.7897, '2435 California St, San Francisco', '0.5 mi'],
    ['grocery', 'Trader Joe’s', -122.4316, 37.7907, '3 Masonic Ave, San Francisco', '1.0 mi'],
    ['fitness', 'Equinox Sports Club', -122.4318, 37.7872, '747 Market St, San Francisco', '1.2 mi'],
    ['fitness', 'Barry’s Fillmore', -122.4332, 37.7864, '2298 Fillmore St, San Francisco', '0.9 mi'],
    ['trailheads', 'Presidio Bay Area Ridge Trail', -122.4565, 37.7982, 'Presidio of San Francisco', '1.2 mi'],
    ['trailheads', 'Lands End Trail', -122.5097, 37.7878, 'Lands End Lookout, San Francisco', '3.1 mi'],
    ['essentials', 'Walgreens', -122.4346, 37.7869, '2145 California St, San Francisco', '0.6 mi'],
    ['essentials', 'Wells Fargo', -122.4341, 37.7888, '2055 Fillmore St, San Francisco', '0.7 mi'],
    ['airport', 'San Francisco International Airport', -122.379, 37.6213, 'San Francisco, CA 94128', '11.4 mi'],
  ];
  const byAmenity = {};
  rows.forEach((row) => {
    const feature = demoFeature(...row);
    const key = feature.properties.amenityKey;
    if (!byAmenity[key]) {
      byAmenity[key] = {
        type: 'FeatureCollection',
        features: [],
        fetched: true,
        searchRadiusMeters: defaultAmenityRadiusMeters()[key],
      };
    }
    byAmenity[key].features.push(feature);
  });
  return {
    id: 'amenity-map-demo',
    title: '1457 Baker Street Neighborhood',
    description: 'A calm, interactive guide to everyday places near the property.',
    agentName: 'Dana Whitfield',
    agentTitle: 'Listing Agent',
    agentBrokerage: 'Presidio Heights Realty',
    agentEmail: 'dana@presidioheights.com',
    agentPhone: '(415) 555-0148',
    viewport: { center: { lat: 37.7916, lng: -122.443 }, zoom: 13.7, bearing: 0, pitch: 0 },
    basemap: 'satellite-streets-v12',
    layers: { status: {}, order: [], labels: {} },
    printSettings: { paperSize: 'full', orientation: 'full' },
    printElements: [
      {
        id: 'demo_boundary',
        type: 'polygon',
        mapStyleVariant: 'boundary',
        label: 'Property Boundary',
        geometry: {
          type: 'Polygon',
          coordinates: [
            [
              [-122.44283, 37.79185],
              [-122.44255, 37.79185],
              [-122.44255, 37.79215],
              [-122.44283, 37.79215],
              [-122.44283, 37.79185],
            ],
          ],
        },
      },
    ],
    tourNearbyCache: {
      searchCenter: { lat: 37.7916, lng: -122.443 },
      searchRadiusMeters: 6437,
      byAmenity,
    },
  };
}

function featureAddress(feature) {
  const p = feature?.properties || {};
  return String(p.formattedAddress || p.vicinity || '').trim();
}

function haversineMiles(aLat, aLng, bLat, bLng) {
  const toRad = (d) => (d * Math.PI) / 180;
  const R = 3958.7613;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(x)));
}

function buildCustomAmenityFeature({
  categoryKey,
  name,
  address,
  lat,
  lng,
  homePosition,
}) {
  const placeId = `custom-${categoryKey}-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 7)}`;
  const props = {
    name: String(name || '').trim(),
    amenityKey: categoryKey,
    placeId,
    place_id: placeId,
    isCustom: true,
    amenityMapHidden: false,
    tourHidden: false,
  };
  const addr = String(address || '').trim();
  if (addr) {
    props.formattedAddress = addr;
    props.vicinity = addr;
  }
  if (
    homePosition &&
    Number.isFinite(Number(homePosition.lat)) &&
    Number.isFinite(Number(homePosition.lng))
  ) {
    const miles = haversineMiles(homePosition.lat, homePosition.lng, lat, lng);
    if (Number.isFinite(miles)) {
      props.straightLineMiles = Math.round(miles * 10) / 10;
      props.distanceText = `${props.straightLineMiles} mi`;
    }
  }
  return {
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [lng, lat] },
    properties: props,
  };
}

function amenityRating(properties) {
  const rating = Number(properties?.rating);
  if (!Number.isFinite(rating) || rating <= 0) return null;
  const count = Number(properties?.user_ratings_total ?? properties?.userRatingCount);
  return {
    rating: Math.min(5, rating),
    count: Number.isFinite(count) && count > 0 ? count : null,
  };
}

function AmenityRating({ properties, amenityKey }) {
  const value = amenityRating(properties);
  const key = amenityKey || properties?.amenityKey;
  const tier = key ? nearbyQualityTier(properties, key) : null;
  if (!value && !tier) return null;
  return (
    <span className="amenity-map-rating-row">
      {value ? (
        <span className="amenity-map-rating" aria-label={`${value.rating.toFixed(1)} out of 5 stars`}>
          <span aria-hidden>★</span>
          <strong>{value.rating.toFixed(1)}</strong>
          {value.count != null ? <small>({value.count.toLocaleString()})</small> : null}
        </span>
      ) : null}
      {tier ? (
        <span className={`amenity-map-quality-tier is-${tier}`} title="Ranking bucket used to pick tour/PDF amenities">
          {tier}
        </span>
      ) : null}
    </span>
  );
}

function visibleFeature(feature) {
  return feature?.properties?.amenityMapHidden !== true;
}

function setFeatureVisible(feature, visible) {
  return {
    ...feature,
    properties: {
      ...(feature?.properties || {}),
      amenityMapHidden: !visible,
    },
  };
}

function getSearchCenter(data, map) {
  const cached = data?.tourNearbyCache?.searchCenter;
  const lat = Number(cached?.lat ?? data?.viewport?.center?.lat);
  const lng = Number(cached?.lng ?? data?.viewport?.center?.lng);
  if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng };
  const mapCenter = map?.getCenter?.();
  if (Number.isFinite(mapCenter?.lat) && Number.isFinite(mapCenter?.lng)) {
    return { lat: mapCenter.lat, lng: mapCenter.lng };
  }
  return null;
}

function persistableAmenityEntries(entries) {
  const selected = {};
  for (const { key } of AMENITY_MAP_CATEGORIES) {
    const entry = entries?.[key];
    if (!entry) continue;
    const hasFeatures = Array.isArray(entry.features) && entry.features.length > 0;
    if (!hasFeatures) continue;
    selected[key] = { ...entry, fetched: true };
  }
  return selected;
}

function rootRadiusForAmenitySave(mapData, selectedEntries) {
  const existing = Number(mapData?.tourNearbyCache?.searchRadiusMeters);
  if (Number.isFinite(existing) && existing >= 500) return existing;
  const fromEntries = Object.values(selectedEntries || {}).map((entry) =>
    Number(entry?.searchRadiusMeters)
  );
  const maxEntry = Math.max(0, ...fromEntries.filter((n) => Number.isFinite(n)));
  return maxEntry >= 500 ? maxEntry : TOUR_NEARBY_SEARCH_RADIUS_METERS;
}

function pointFrom(lat, lng) {
  const nextLat = Number(lat);
  const nextLng = Number(lng);
  return Number.isFinite(nextLat) && Number.isFinite(nextLng)
    ? { lat: nextLat, lng: nextLng }
    : null;
}

/** The agent's placed Main Home icon is the most precise property point we have. */
function getMainHomeElementPosition(printElements) {
  const el = (printElements || []).find(
    (candidate) =>
      candidate?.type === 'shape' &&
      candidate?.svgKey === 'houseChimney' &&
      candidate?.geometry?.type === 'Point'
  );
  const coords = el?.geometry?.coordinates;
  if (!Array.isArray(coords) || coords.length < 2) return null;
  return pointFrom(coords[1], coords[0]);
}

/**
 * Where the home badge sits. Prefer amenityMapSettings (dedicated presentation field),
 * then legacy tourNearbyCache.homeMarker, then print geometry fallbacks.
 */
function getHomeMarkerPosition(data, map) {
  const fromSettings = pointFrom(
    data?.amenityMapSettings?.homeMarker?.lat,
    data?.amenityMapSettings?.homeMarker?.lng
  );
  if (fromSettings) return fromSettings;

  const saved = pointFrom(data?.tourNearbyCache?.homeMarker?.lat, data?.tourNearbyCache?.homeMarker?.lng);
  if (saved) return saved;

  const printElements = Array.isArray(data?.printElements) ? data.printElements : [];
  const mainHome = getMainHomeElementPosition(printElements);
  if (mainHome) return mainHome;

  const boundaryCenter = getTourNearbySearchCenter(printElements, null, null);
  const fromBoundary = pointFrom(boundaryCenter?.lat, boundaryCenter?.lng);
  if (fromBoundary) return fromBoundary;

  return getSearchCenter(data, map);
}

function getAmenityPreferredBasemap(data) {
  return (
    normalizeBasemapId(data?.amenityMapSettings?.basemap) ||
    normalizeBasemapId(data?.tourNearbyCache?.amenityMapBasemap) ||
    AMENITY_BASEMAP_ID
  );
}

async function loadSharedAmenityMap(shareToken) {
  let lastErr;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    try {
      return await mapService.getSharedMapByToken(shareToken);
    } catch (err) {
      lastErr = err;
      await new Promise((resolve) => window.setTimeout(resolve, 350 + attempt * 200));
    }
  }
  throw lastErr;
}

function waitForMap(mapRef, timeoutMs = 12000) {
  return new Promise((resolve) => {
    const started = Date.now();
    const tick = () => {
      if (mapRef?.current) {
        resolve(mapRef.current);
        return;
      }
      if (Date.now() - started >= timeoutMs) {
        resolve(null);
        return;
      }
      window.setTimeout(tick, 50);
    };
    tick();
  });
}

const HOME_FOCUS_ZOOM = 16.4;
const AMENITY_FOCUS_ZOOM = 15.6;

/**
 * Eases to a place without diving all the way in, keeping the target clear of the
 * left rail (or the bottom sheet on narrow screens).
 */
function focusMapOnPoint(map, position, zoom) {
  if (!map || !position) return;
  const lat = Number(position.lat);
  const lng = Number(position.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
  const narrow = window.innerWidth <= 760;
  try {
    map.easeTo({
      center: [lng, lat],
      zoom,
      // One-shot nudge so the pin lands beside the panel instead of behind it.
      offset: narrow ? [0, -Math.round(window.innerHeight * 0.18)] : [190, 0],
      duration: 700,
    });
  } catch (_) {
    // A style swap can interrupt the camera; the marker stays where it is.
  }
}

function amenityFitStorageKey(shareToken) {
  return `cv-amenity-fit:${String(shareToken || '').trim()}`;
}

function notifyAmenityClientFit(shareToken) {
  const token = String(shareToken || '').trim();
  if (!token || typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(amenityFitStorageKey(token), String(Date.now()));
  } catch (_) {
    /* ignore quota / private mode */
  }
}

function amenityMapFitPadding() {
  const gap = 10;
  const edge = 12;
  const narrow = window.innerWidth <= 760;
  const railEl = document.querySelector('.amenity-map-rail');
  const brandEl = document.querySelector('.amenity-map-brand');
  const railRect = railEl?.getBoundingClientRect?.();
  const brandRect = brandEl?.getBoundingClientRect?.();

  let left = edge + gap;
  let right = edge + gap;
  let top = edge + gap;
  let bottom = edge + gap;

  if (narrow) {
    const railTop = railRect?.top;
    const railReady =
      Number.isFinite(railTop) && railRect.height > 40 && railTop < window.innerHeight - 24;
    if (!railReady) return null;
    bottom = Math.max(
      edge + gap,
      Math.min(
        Math.round(window.innerHeight - railTop + gap),
        Math.round(window.innerHeight * 0.52)
      )
    );
    left = Math.max(left, 20);
    right = Math.max(right, 20);
    top = brandRect ? Math.max(top, Math.round(brandRect.bottom + gap)) : Math.max(top, 56);
  } else {
    left = railRect
      ? Math.max(left, Math.round(railRect.right + gap))
      : Math.round(Math.min(380, window.innerWidth * 0.42 - 24) + edge + gap);
    if (brandRect) {
      top = Math.max(top, Math.round(brandRect.bottom + gap));
      right = Math.max(right, Math.round(window.innerWidth - brandRect.left + gap));
    } else {
      top = Math.max(top, 88);
      right = Math.max(right, 200);
    }
    bottom = Math.max(bottom, 48);
  }

  const padBudget = Math.min(window.innerWidth, window.innerHeight);
  if (left + right >= padBudget - 40) {
    left = Math.min(left, 24);
    right = Math.min(right, 24);
  }
  if (top + bottom >= padBudget - 40) {
    top = Math.min(top, 56);
    bottom = Math.min(bottom, Math.round(window.innerHeight * 0.42));
  }
  return { top, right, bottom, left };
}

function fitAmenityMapToPlaces(map, features, homePosition, { duration = 0 } = {}) {
  if (!map) return false;
  const bounds = new mapboxgl.LngLatBounds();
  (features || []).forEach((feature) => {
    const coords = feature?.geometry?.coordinates;
    if (Array.isArray(coords) && coords.length >= 2) bounds.extend(coords);
  });
  if (homePosition && Number.isFinite(homePosition.lat) && Number.isFinite(homePosition.lng)) {
    bounds.extend([homePosition.lng, homePosition.lat]);
  }
  if (bounds.isEmpty()) return false;
  const padding = amenityMapFitPadding();
  if (!padding) return false;
  const narrow = window.innerWidth <= 760;
  try {
    map.fitBounds(bounds, {
      padding,
      maxZoom: narrow ? 15.2 : 15.5,
      duration,
    });
    return true;
  } catch (_) {
    return false;
  }
}

/** Screen position for the HTML home marker (above print boundary overlays). */
function projectHomeScreenPoint(map, position) {
  if (!map || !position) return null;
  const lat = Number(position.lat);
  const lng = Number(position.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  try {
    const point = map.project([lng, lat]);
    const canvas = map.getCanvas?.();
    const rect = canvas?.getBoundingClientRect?.();
    if (!point || !rect) return null;
    return {
      x: rect.left + point.x,
      y: rect.top + point.y,
    };
  } catch (_) {
    return null;
  }
}

function applyLoadedBadges(geojson, loadedKeys) {
  const keys = loadedKeys instanceof Set ? loadedKeys : new Set();
  return {
    ...geojson,
    features: (geojson.features || []).map((feature) => {
      const amenityKey = feature?.properties?.amenityKey;
      const hasBadge = amenityHasBadge(amenityKey) && keys.has(amenityKey);
      return {
        ...feature,
        properties: {
          ...(feature?.properties || {}),
          hasBadge,
          badgeImage: hasBadge ? amenityBadgeImageId(amenityKey) : '',
        },
      };
    }),
  };
}

function sourceFeature(feature, hoveredKey, loadedBadgeKeys) {
  const properties = feature?.properties || {};
  const category = AMENITY_MAP_CATEGORY_BY_KEY[properties.amenityKey] || {};
  const key = amenityFeatureKey(feature);
  const catalogHasBadge = amenityHasBadge(properties.amenityKey);
  const hasBadge =
    catalogHasBadge &&
    (loadedBadgeKeys == null || loadedBadgeKeys.has(properties.amenityKey));
  return {
    ...feature,
    properties: {
      ...properties,
      amenityMapKey: key,
      categoryColor: category.color || '#334155',
      categoryLabel: category.label || 'Place',
      hasBadge,
      badgeImage: hasBadge ? amenityBadgeImageId(properties.amenityKey) : '',
      isHovered: key === hoveredKey,
    },
  };
}

function badgeIconSizeExpression() {
  const hoverScale = ['case', ['boolean', ['get', 'isHovered'], false], 1.18, 1];
  const step = (base) => ['*', hoverScale, base];
  return [
    'interpolate',
    ['linear'],
    ['zoom'],
    9,
    step(0.11),
    13,
    step(0.15),
    17,
    step(0.19),
  ];
}

function ensureAmenityLayers(map, geojson) {
  if (!map || !map.isStyleLoaded?.()) return false;

  // Home is now an HTML overlay above print boundaries; drop any leftover Mapbox home symbol.
  ['cv-amenity-map-home', 'cv-amenity-map-home-source'].forEach((id) => {
    try {
      if (map.getLayer?.(id)) map.removeLayer(id);
    } catch (_) {
      /* ignore */
    }
  });
  try {
    if (map.getSource?.('cv-amenity-map-home-source')) {
      map.removeSource('cv-amenity-map-home-source');
    }
  } catch (_) {
    /* ignore */
  }

  const source = map.getSource(SOURCE_ID);
  if (source) {
    source.setData(geojson);
  } else {
    map.addSource(SOURCE_ID, { type: 'geojson', data: geojson });
  }

  if (!map.getLayer(POINT_LAYER_ID)) {
    map.addLayer({
      id: POINT_LAYER_ID,
      type: 'circle',
      source: SOURCE_ID,
      filter: ['!', ['boolean', ['get', 'hasBadge'], false]],
      paint: {
        'circle-radius': ['case', ['boolean', ['get', 'isHovered'], false], 11, 8],
        'circle-color': ['get', 'categoryColor'],
        'circle-stroke-color': '#ffffff',
        'circle-stroke-width': ['case', ['boolean', ['get', 'isHovered'], false], 3, 2],
        'circle-opacity': 0.96,
      },
    });
  }

  if (!map.getLayer(BADGE_LAYER_ID)) {
    map.addLayer({
      id: BADGE_LAYER_ID,
      type: 'symbol',
      source: SOURCE_ID,
      filter: ['boolean', ['get', 'hasBadge'], false],
      layout: {
        'icon-image': ['get', 'badgeImage'],
        'icon-size': badgeIconSizeExpression(),
        'icon-anchor': 'center',
        'icon-allow-overlap': true,
        'icon-ignore-placement': true,
        'icon-pitch-alignment': 'viewport',
        'icon-rotation-alignment': 'viewport',
      },
    });
  }

  if (!map.getLayer(LABEL_LAYER_ID)) {
    map.addLayer({
      id: LABEL_LAYER_ID,
      type: 'symbol',
      source: SOURCE_ID,
      minzoom: 14,
      layout: {
        'text-field': ['get', 'name'],
        'text-size': 11,
        'text-offset': [0, 1.6],
        'text-anchor': 'top',
        'text-optional': true,
        'text-max-width': 12,
      },
      paint: {
        'text-color': '#172033',
        'text-halo-color': 'rgba(255,255,255,0.96)',
        'text-halo-width': 1.5,
      },
    });
  }

  try {
    [POINT_LAYER_ID, BADGE_LAYER_ID, LABEL_LAYER_ID].forEach((id) => map.moveLayer(id));
  } catch (_) {
    // The base style may still be finishing its own layer order.
  }
  ensureAmenityMapLayersOnTop(map);
  return true;
}

function removeAmenityLayers(map) {
  if (!map) return;
  [LABEL_LAYER_ID, BADGE_LAYER_ID, POINT_LAYER_ID].forEach((id) => {
    try {
      if (map.getLayer(id)) map.removeLayer(id);
    } catch (_) {
      // Style may already have been replaced.
    }
  });
  try {
    if (map.getSource(SOURCE_ID)) map.removeSource(SOURCE_ID);
  } catch (_) {
    // Style may already have been replaced.
  }
}

function AmenityIcon({ amenityKey, className = '' }) {
  const category = AMENITY_MAP_CATEGORY_BY_KEY[amenityKey];
  if (category?.recolorBadge && category.logoFile) {
    return (
      <span
        className={`amenity-map-icon amenity-map-icon--composited ${className}`.trim()}
        style={{ backgroundColor: category.color || '#eab308' }}
        aria-hidden
      >
        <img src={`/logos_for_print/${category.logoFile}`} alt="" />
      </span>
    );
  }
  const badgeUrl = amenityBadgeUrl(amenityKey);
  if (badgeUrl) {
    return (
      <img
        className={`amenity-map-icon ${className}`.trim()}
        src={badgeUrl}
        alt=""
        aria-hidden
      />
    );
  }
  return (
    <span
      className={`amenity-map-icon amenity-map-icon--dot ${className}`.trim()}
      style={{ backgroundColor: category?.color || '#334155' }}
      aria-hidden
    />
  );
}

/** iOS-style switch, matching the owner-name toggle in the regular map side panel. */
function AmenitySwitch({ checked, onChange, label }) {
  return (
    <label className="amenity-map-switch">
      <input
        type="checkbox"
        className="amenity-map-switch-input"
        checked={checked}
        onChange={onChange}
        aria-label={label}
      />
      <span className="amenity-map-switch-track" aria-hidden />
    </label>
  );
}

function hasAgentDetails(meta) {
  return Boolean(
    meta?.agentName ||
      meta?.agentPhoto ||
      meta?.agentEmail ||
      meta?.agentPhone ||
      meta?.agentWebsite ||
      meta?.agentLogo
  );
}

/** Listing contact block, same fields the shared map and tour viewers show. */
function AmenityAgentCard({ meta, compact = false }) {
  const websiteHref = formatAgentWebsiteHref(meta?.agentWebsite);
  const websiteLabel = formatAgentWebsiteLabel(meta?.agentWebsite);
  const subtitle = [meta?.agentTitle, meta?.agentBrokerage].filter(Boolean).join(' · ');
  return (
    <aside
      className={`amenity-map-agent-card${compact ? ' is-compact' : ''}`}
      aria-label="Listing contact"
    >
      <div className="amenity-map-agent-row">
        {meta?.agentPhoto ? (
          <img className="amenity-map-agent-photo" src={meta.agentPhoto} alt="" />
        ) : null}
        <div className="amenity-map-agent-details">
          <div className="amenity-map-agent-name">{meta?.agentName || 'Listing agent'}</div>
          {subtitle ? <div className="amenity-map-agent-subtitle">{subtitle}</div> : null}
          {meta?.agentPhone ? (
            <a className="amenity-map-agent-link" href={`tel:${meta.agentPhone}`}>
              {meta.agentPhone}
            </a>
          ) : null}
          {meta?.agentEmail ? (
            <a className="amenity-map-agent-link" href={`mailto:${meta.agentEmail}`}>
              {meta.agentEmail}
            </a>
          ) : null}
          {websiteHref ? (
            <a
              className="amenity-map-agent-link amenity-map-agent-link--site"
              href={websiteHref}
              target="_blank"
              rel="noopener noreferrer"
            >
              {websiteLabel || websiteHref}
            </a>
          ) : null}
        </div>
      </div>
    </aside>
  );
}

function AmenityDetail({ feature, onClose }) {
  if (!feature) return null;
  const p = feature.properties || {};
  const category = AMENITY_MAP_CATEGORY_BY_KEY[p.amenityKey];
  const address = featureAddress(feature);
  const distance = String(p.distanceText || '').trim();
  return (
    <article className="amenity-map-detail">
      <button type="button" className="amenity-map-detail-close" onClick={onClose} aria-label="Close">
        ×
      </button>
      {p.photoUrl ? (
        <img
          className="amenity-map-detail-photo"
          src={p.photoUrl}
          alt=""
          loading="lazy"
          referrerPolicy="no-referrer"
        />
      ) : null}
      <div className="amenity-map-detail-body">
        <span className="amenity-map-detail-category">{category?.label || 'Place'}</span>
        <h3>{p.name || 'Nearby place'}</h3>
        <AmenityRating properties={p} />
        {address ? <p>{address}</p> : null}
        {distance ? <p className="amenity-map-detail-distance">{distance} from the property</p> : null}
      </div>
    </article>
  );
}

export default function AmenityMapPage() {
  const { shareToken } = useParams();
  const location = useLocation();
  const wantEdit = new URLSearchParams(location.search).get('edit') === '1';
  const fromNeighborhood =
    new URLSearchParams(location.search).get('from') === 'neighborhood';
  const demoMode = process.env.NODE_ENV === 'development' && shareToken === 'demo';
  const {
    mapRef,
    setPrintElements,
    setLayerStatus,
    setLayerOrder,
    setPaperSize,
    setIsPrinting,
    setActivePrintTool,
    setSelectedPrintElement,
    currentBasemapId,
    setCurrentBasemapId,
    activeBasemapIdRef,
    setShareViewerReadOnly,
  } = useMapContext();
  const { user, userProfile } = useUser();

  const [mapData, setMapData] = useState(null);
  const [amenityEditAccess, setAmenityEditAccess] = useState(null);
  const [guestEditEnabled, setGuestEditEnabled] = useState(false);
  const canEdit = demoMode || canEditAmenityMap(amenityEditAccess);
  const editMode = Boolean(wantEdit && canEdit);
  const editLocked = Boolean(wantEdit && !demoMode && amenityEditAccess && !canEdit);
  const [meta, setMeta] = useState({ title: 'Neighborhood amenities', description: '' });
  const [entries, setEntries] = useState({});
  const [enabledSearchKeys, setEnabledSearchKeys] = useState(
    () => new Set(wantEdit ? [] : AMENITY_MAP_CATEGORIES.map(({ key }) => key))
  );
  const entriesRef = useRef(entries);
  const enabledSearchKeysRef = useRef(enabledSearchKeys);
  const saveEntriesNowRef = useRef(async () => {});
  entriesRef.current = entries;
  enabledSearchKeysRef.current = enabledSearchKeys;
  const [visibleCategoryKeys, setVisibleCategoryKeys] = useState(
    () => new Set(AMENITY_MAP_CATEGORIES.map(({ key }) => key))
  );
  const [radiusByKey, setRadiusByKey] = useState(defaultAmenityRadiusMeters);
  const [loading, setLoading] = useState(true);
  const [mapRevealReady, setMapRevealReady] = useState(false);
  const [error, setError] = useState('');
  const [searchState, setSearchState] = useState({});
  const [saveState, setSaveState] = useState('idle');
  const [saveError, setSaveError] = useState('');
  const [pdfFramingMode, setPdfFramingMode] = useState('auto');
  const [pdfBusy, setPdfBusy] = useState(false);
  const [pdfStatus, setPdfStatus] = useState('');
  const [pdfError, setPdfError] = useState('');
  const [pdfAssets, setPdfAssets] = useState(null);
  const [pdfPanelOpen, setPdfPanelOpen] = useState(() => fromNeighborhood);
  const [hoveredKey, setHoveredKey] = useState(null);
  const [activeFeature, setActiveFeature] = useState(null);
  const [mapPickFeature, setMapPickFeature] = useState(null);
  const [mapPickScreen, setMapPickScreen] = useState(null);
  const [activeEditorCategoryKey, setActiveEditorCategoryKey] = useState(null);
  const [choosingAmenity, setChoosingAmenity] = useState(false);
  const [addingCustom, setAddingCustom] = useState(false);
  const [customDraft, setCustomDraft] = useState({
    name: '',
    address: '',
    placeId: '',
    categoryKey: '',
  });
  const [customError, setCustomError] = useState('');
  const [placingCustom, setPlacingCustom] = useState(false);
  const [placeGhost, setPlaceGhost] = useState(null);
  const [customScreenPoints, setCustomScreenPoints] = useState({});
  const customDragRef = useRef(null);
  const [showHomeMarker, setShowHomeMarker] = useState(true);
  const [homePosition, setHomePosition] = useState(null);
  const [homeScreenPoint, setHomeScreenPoint] = useState(null);
  const [expandedCategoryKeys, setExpandedCategoryKeys] = useState(() => new Set());
  const [isNarrowViewport, setIsNarrowViewport] = useState(
    () => typeof window !== 'undefined' && window.innerWidth <= 760
  );
  const popupRef = useRef(null);
  const amenityMapInstanceRef = useRef(null);
  const didInitialFitRef = useRef(false);
  const lastFitSignatureRef = useRef('');
  const homeDragRef = useRef(null);
  const panelBodyRef = useRef(null);
  const [loadedBadgeKeys, setLoadedBadgeKeys] = useState(() => new Set());
  const loadedBadgeKeysRef = useRef(loadedBadgeKeys);
  loadedBadgeKeysRef.current = loadedBadgeKeys;

  const allFeatures = useMemo(
    () =>
      AMENITY_MAP_CATEGORIES.flatMap(({ key }) =>
        (Array.isArray(entries[key]?.features) ? entries[key].features : []).map((feature) => ({
          ...feature,
          properties: {
            ...(feature?.properties || {}),
            amenityKey: String(feature?.properties?.amenityKey || key).trim() || key,
          },
        }))
      ),
    [entries]
  );

  const editorVisibleKeys = useMemo(() => {
    const keys = new Set(enabledSearchKeys);
    AMENITY_MAP_CATEGORIES.forEach(({ key }) => {
      if (Array.isArray(entries[key]?.features) && entries[key].features.length) {
        keys.add(key);
      }
    });
    return keys;
  }, [enabledSearchKeys, entries]);

  const savedFeatures = useMemo(
    () =>
      allFeatures.filter(
        (feature) =>
          visibleFeature(feature) &&
          (editMode ? editorVisibleKeys : visibleCategoryKeys).has(
            feature?.properties?.amenityKey
          )
      ),
    [allFeatures, editMode, editorVisibleKeys, visibleCategoryKeys]
  );

  const geojson = useMemo(
    () => ({
      type: 'FeatureCollection',
      features: savedFeatures
        .filter((feature) => !(editMode && feature?.properties?.isCustom === true))
        .map((feature) => sourceFeature(feature, hoveredKey, loadedBadgeKeys)),
    }),
    [savedFeatures, hoveredKey, editMode, loadedBadgeKeys]
  );

  useEffect(() => {
    document.documentElement.classList.add('shared-public-map', 'amenity-map-mode');
    // Reuse tour orbit filter so Map.js only draws the property boundary (no pins/notes/photos).
    document.documentElement.setAttribute(TOUR_ORBIT_PRINT_FILTER_ATTR, TOUR_ORBIT_PRINT_FILTER_VALUE);
    setShareViewerReadOnly(true);
    const applyBoundaryOnlyFilter = () => {
      window.dispatchEvent(
        new CustomEvent('property-tour-slide', {
          detail: {
            slideId: 'amenity-map',
            printFilterMode: 'boundary-only',
            printElementIds: null,
          },
        })
      );
    };
    applyBoundaryOnlyFilter();
    return () => {
      document.documentElement.classList.remove('shared-public-map', 'amenity-map-mode');
      document.documentElement.removeAttribute(TOUR_ORBIT_PRINT_FILTER_ATTR);
      window.dispatchEvent(
        new CustomEvent('property-tour-slide', {
          detail: { slideId: null, printFilterMode: 'all', printElementIds: null },
        })
      );
      setShareViewerReadOnly(false);
      popupRef.current?.remove?.();
      popupRef.current = null;
      removeAmenityLayers(amenityMapInstanceRef.current);
    };
  }, [mapRef, setShareViewerReadOnly]);

  useEffect(() => {
    const syncViewport = () => setIsNarrowViewport(window.innerWidth <= 760);
    syncViewport();
    window.addEventListener('resize', syncViewport);
    return () => window.removeEventListener('resize', syncViewport);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setMapRevealReady(false);
      setError('');
      try {
        const loaded =
          process.env.NODE_ENV === 'development' && shareToken === 'demo'
            ? buildDemoMapData()
            : await loadSharedAmenityMap(shareToken);
        if (cancelled) return;
        let data = loaded;
        const wantGenerate =
          !demoMode && new URLSearchParams(window.location.search).get('generate') === '1';
        const createKey = shareToken ? `amenity:${shareToken}` : '';
        if (!demoMode && shareToken && (wantGenerate || isShareCreateInFlight(createKey))) {
          const result = await runShareCreateOnce(createKey, () =>
            autoGenerateAmenityMap({ shareToken, mapData: data })
          );
          if (cancelled) return;
          data = {
            ...data,
            tourNearbyCache: result.tourNearbyCache || data.tourNearbyCache,
          };
          stripSearchParam('generate');
        }
        if (cancelled) return;
        const access =
          data?.amenityEditAccess && typeof data.amenityEditAccess === 'object'
            ? data.amenityEditAccess
            : {
                guestEdit: isGuestEditAllowed(data?.amenityMapSettings),
                viewerIsOwner: false,
                canEdit: isGuestEditAllowed(data?.amenityMapSettings),
              };
        const mapDoc = data;
        if (cancelled) return;
        setMapData(mapDoc);
        if (demoMode) {
          setAmenityEditAccess({ guestEdit: true, viewerIsOwner: true, canEdit: true });
          setGuestEditEnabled(true);
        } else {
          setAmenityEditAccess(access);
          setGuestEditEnabled(access.guestEdit === true);
        }
        setHomePosition(getHomeMarkerPosition(mapDoc, mapRef?.current));
        if (mapDoc?.neighborhoodMapAssets?.pdfUrl || mapDoc?.neighborhoodMapAssets?.pngUrl) {
          setPdfAssets(mapDoc.neighborhoodMapAssets);
        }
        setMeta({
          title: mapDoc.title || 'Neighborhood amenities',
          description: mapDoc.description || '',
          ...buildSharedMapAgentMeta(mapDoc),
        });
        const normalized = normalizeTourNearbyCacheFromFirestore(mapDoc.tourNearbyCache);
        const loadedEntries = normalized?.byAmenity || mapDoc.tourNearbyCache?.byAmenity || {};
        setEntries(loadedEntries);
        const populatedKeys = AMENITY_MAP_CATEGORIES.filter(({ key }) => {
          const features = loadedEntries[key]?.features;
          return Array.isArray(features) && features.some((f) => String(f?.properties?.name || '').trim());
        }).map(({ key }) => key);
        if (populatedKeys.length) {
          setVisibleCategoryKeys(new Set(populatedKeys));
          setEnabledSearchKeys(new Set(populatedKeys));
        }
        setRadiusByKey((previous) => {
          const next = { ...previous };
          AMENITY_MAP_CATEGORIES.forEach(({ key }) => {
            const stored = Number(loadedEntries[key]?.searchRadiusMeters);
            if (Number.isFinite(stored)) next[key] = stored;
          });
          return next;
        });

        setPrintElements(Array.isArray(mapDoc.printElements) ? mapDoc.printElements : []);
        // Amenity map: basemap + boundary + home pin only — strip every GIS overlay.
        setLayerStatus({});
        setLayerOrder([]);
        setPaperSize(mapDoc.printSettings?.paperSize || 'full');
        setIsPrinting(true);
        setActivePrintTool('select');
        setSelectedPrintElement(null);
        const preferredBasemap = getAmenityPreferredBasemap(mapDoc);
        // Do not let loadMapState apply the listing `basemap` — that races and overwrites
        // the amenity-specific style on the client view.
        setCurrentBasemapId(preferredBasemap);
        if (activeBasemapIdRef) activeBasemapIdRef.current = preferredBasemap;
        try {
          const params = new URLSearchParams(window.location.search);
          if (params.get('basemap') !== preferredBasemap) {
            params.set('basemap', preferredBasemap);
            const qs = params.toString();
            window.history.replaceState(
              window.history.state,
              '',
              qs ? `${window.location.pathname}?${qs}` : window.location.pathname
            );
          }
        } catch (_) {
          /* ignore */
        }

        const map = await waitForMap(mapRef);
        if (cancelled) return;
        if (!map) {
          setError('The map failed to load. Refresh the page and try again.');
          return;
        }
        mapService.loadMapState(
          mapDoc,
          { setLayerStatus, setLayerOrder, setPaperSize, setPrintElements },
          mapRef
        );
        // loadMapState restores listing layers — clear them again for this view.
        setLayerStatus({});
        setLayerOrder([]);
        // Prefer saved amenity basemap, else Discover — never force satellite.
        setCurrentBasemapId(preferredBasemap);
        if (activeBasemapIdRef) activeBasemapIdRef.current = preferredBasemap;
        window.dispatchEvent(
          new CustomEvent('property-tour-slide', {
            detail: {
              slideId: 'amenity-map',
              printFilterMode: 'boundary-only',
              printElementIds: null,
            },
          })
        );

        const applyBasemap =
          typeof window.applyBasemapById === 'function' ? window.applyBasemapById : null;
        if (applyBasemap) {
          await new Promise((resolve) => {
            let settled = false;
            const finish = () => {
              if (settled) return;
              settled = true;
              resolve();
            };
            const apply = () => {
              try {
                applyBasemap(preferredBasemap, finish);
              } catch (_) {
                finish();
              }
            };
            if (map.isStyleLoaded?.()) apply();
            else map.once('idle', apply);
            // Don't block forever if Mapbox never calls onReady.
            window.setTimeout(finish, 4000);
          });
          // Late nudge — Map.js URL/idle restore can finish after the first apply.
          window.setTimeout(() => {
            if (cancelled) return;
            try {
              if (typeof window.nudgeBasemapById === 'function') {
                window.nudgeBasemapById(preferredBasemap);
              } else if (typeof window.applyBasemapById === 'function') {
                window.applyBasemapById(preferredBasemap);
              }
            } catch (_) {
              /* ignore */
            }
          }, 450);
        }
        if (cancelled) return;
      } catch (err) {
        if (!cancelled) setError(err?.message || 'Could not load this amenity map.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    activeBasemapIdRef,
    demoMode,
    mapRef,
    setActivePrintTool,
    setCurrentBasemapId,
    setIsPrinting,
    setLayerOrder,
    setLayerStatus,
    setPaperSize,
    setPrintElements,
    setSelectedPrintElement,
    shareToken,
    wantEdit,
    // Intentionally omit map context setters / mapRef. Reloading on those
    // identities wipes restaurants the agent just added, then Save writes the
    // empty list.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ]);

  useEffect(() => {
    const map = mapRef?.current;
    if (!map || loading || error) return undefined;
    amenityMapInstanceRef.current = map;
    let cancelled = false;
    let applying = false;

    const dataForMap = (badgeKeys) =>
      applyLoadedBadges(geojson, badgeKeys || loadedBadgeKeysRef.current);

    const pushSource = (badgeKeys) => {
      const source = map.getSource?.(SOURCE_ID);
      if (!source || typeof source.setData !== 'function') return false;
      source.setData(dataForMap(badgeKeys));
      ensureAmenityMapLayersOnTop(map);
      return true;
    };

    const apply = async () => {
      if (cancelled || applying || !map.isStyleLoaded?.()) return;
      applying = true;
      try {
        const loaded = await loadAmenityMapIcons(map);
        if (cancelled) return;
        ensureAmenityLayers(map, dataForMap(loaded));
        setMapRevealReady(true);
        setLoadedBadgeKeys(loaded);
      } finally {
        applying = false;
      }
    };

    // Named-add / checkbox changes must write the GeoJSON source immediately.
    // Idle used to restack only, so a newly added place never got a pin.
    if (pushSource()) {
      setMapRevealReady(true);
    } else {
      void apply();
    }

    const onIdle = () => {
      if (cancelled) return;
      if (pushSource()) {
        setMapRevealReady(true);
        return;
      }
      void apply();
    };

    map.on('idle', onIdle);
    return () => {
      cancelled = true;
      map.off('idle', onIdle);
    };
  }, [mapRef, geojson, loading, error]);

  // Keep radius circle above amenity layers when style/idle restacks.
  useEffect(() => {
    const map = mapRef?.current;
    if (!map || !editMode || !activeEditorCategoryKey || loading || error) return undefined;
    const bump = () => ensureTourEditRadiusLayersOnTop(map);
    bump();
    map.on('idle', bump);
    map.on('moveend', bump);
    map.on('zoomend', bump);
    return () => {
      map.off('idle', bump);
      map.off('moveend', bump);
      map.off('zoomend', bump);
    };
  }, [activeEditorCategoryKey, editMode, error, loading, mapRef, geojson]);

  // Keep the HTML home pin projected above print boundary overlays.
  useEffect(() => {
    const map = mapRef?.current;
    if (!map || loading || error || !showHomeMarker || !homePosition) {
      setHomeScreenPoint(null);
      return undefined;
    }

    const sync = () => {
      if (homeDragRef.current?.screen) {
        setHomeScreenPoint(homeDragRef.current.screen);
        return;
      }
      setHomeScreenPoint(projectHomeScreenPoint(map, homePosition));
    };

    sync();
    map.on('move', sync);
    map.on('zoom', sync);
    map.on('resize', sync);
    window.addEventListener('resize', sync);
    return () => {
      map.off('move', sync);
      map.off('zoom', sync);
      map.off('resize', sync);
      window.removeEventListener('resize', sync);
    };
  }, [error, homePosition, loading, mapRef, showHomeMarker]);

  useEffect(() => {
    const map = mapRef?.current;
    if (!map || loading || error) return undefined;

    const showPopup = (feature, lngLat) => {
      if (!feature) return;
      const p = feature.properties || {};
      const category = AMENITY_MAP_CATEGORY_BY_KEY[p.amenityKey];
      const node = document.createElement('div');
      node.className = 'amenity-map-hover-card';
      const categoryNode = document.createElement('span');
      categoryNode.textContent = category?.label || 'Place';
      const title = document.createElement('strong');
      title.textContent = p.name || 'Nearby place';
      node.append(categoryNode, title);
      const distance = String(p.distanceText || '').trim();
      if (distance) {
        const distanceNode = document.createElement('div');
        distanceNode.className = 'amenity-map-hover-distance';
        distanceNode.textContent = `${distance} from the property`;
        node.append(distanceNode);
      }
      const rating = amenityRating(p);
      const tier = p.amenityKey ? nearbyQualityTier(p, p.amenityKey) : null;
      if (rating || tier) {
        const row = document.createElement('span');
        row.className = 'amenity-map-rating-row';
        if (rating) {
          const ratingNode = document.createElement('span');
          ratingNode.className = 'amenity-map-rating';
          ratingNode.setAttribute('aria-label', `${rating.rating.toFixed(1)} out of 5 stars`);
          ratingNode.textContent = `★ ${rating.rating.toFixed(1)}${
            rating.count != null ? ` (${rating.count.toLocaleString()})` : ''
          }`;
          row.append(ratingNode);
        }
        if (tier) {
          const tierNode = document.createElement('span');
          tierNode.className = `amenity-map-quality-tier is-${tier}`;
          tierNode.textContent = tier;
          row.append(tierNode);
        }
        node.append(row);
      }
      const address = featureAddress(feature);
      if (address) {
        const addressNode = document.createElement('small');
        addressNode.textContent = address;
        node.append(addressNode);
      }
      const clickNode = document.createElement('div');
      clickNode.className = 'amenity-map-hover-action';
      clickNode.textContent = editMode ? 'Click to remove from the map' : 'Click for photo and details';
      node.append(clickNode);
      popupRef.current?.remove?.();
      popupRef.current = new mapboxgl.Popup({
        closeButton: false,
        closeOnClick: false,
        offset: 14,
        maxWidth: '280px',
      })
        .setLngLat(lngLat)
        .setDOMContent(node)
        .addTo(map);
    };

    const onEnter = () => {
      map.getCanvas().style.cursor = 'pointer';
    };
    const onMove = (event) => {
      const feature = event.features?.[0];
      if (!feature) return;
      setHoveredKey(String(feature.properties?.amenityMapKey || ''));
      showPopup(feature, event.lngLat);
    };
    const onLeave = () => {
      map.getCanvas().style.cursor = '';
      setHoveredKey(null);
      popupRef.current?.remove?.();
      popupRef.current = null;
    };
    const interactiveLayerIds = [POINT_LAYER_ID, BADGE_LAYER_ID];
    const onClick = (event) => {
      const feature = event.features?.[0];
      if (!feature) return;
      const key = String(feature.properties?.amenityMapKey || '');
      const original = allFeatures.find((candidate) => amenityFeatureKey(candidate) === key);
      const selected = original || feature;
      if (editMode) {
        setActiveFeature(null);
        setMapPickFeature(selected);
        return;
      }
      setActiveFeature(selected);
      panelBodyRef.current?.scrollTo?.({ top: 0, behavior: 'smooth' });
      const coords = selected?.geometry?.coordinates;
      if (Array.isArray(coords) && coords.length >= 2) {
        focusMapOnPoint(
          map,
          { lng: coords[0], lat: coords[1] },
          AMENITY_FOCUS_ZOOM
        );
      }
    };
    const onBackgroundClick = (event) => {
      if (!editMode) return;
      const layers = interactiveLayerIds.filter((id) => map.getLayer(id));
      const hits = layers.length ? map.queryRenderedFeatures(event.point, { layers }) : [];
      if (!hits.length) setMapPickFeature(null);
    };

    let boundLayerIds = '';
    const unbind = () => {
      interactiveLayerIds.forEach((id) => {
        map.off('mouseenter', id, onEnter);
        map.off('mousemove', id, onMove);
        map.off('mouseleave', id, onLeave);
        map.off('click', id, onClick);
      });
      boundLayerIds = '';
    };
    const bind = () => {
      const readyIds = interactiveLayerIds.filter((id) => map.getLayer(id)).join(',');
      if (!readyIds) {
        if (boundLayerIds) unbind();
        return;
      }
      if (readyIds === boundLayerIds) return;
      unbind();
      readyIds.split(',').forEach((id) => {
        map.on('mouseenter', id, onEnter);
        map.on('mousemove', id, onMove);
        map.on('mouseleave', id, onLeave);
        map.on('click', id, onClick);
      });
      boundLayerIds = readyIds;
    };
    bind();
    if (editMode) map.on('click', onBackgroundClick);
    map.on('idle', bind);
    return () => {
      map.off('idle', bind);
      map.off('click', onBackgroundClick);
      unbind();
    };
  }, [allFeatures, editMode, error, loading, mapRef]);

  // Project custom amenity pins (HTML overlays) and keep them in sync with the map.
  useEffect(() => {
    const map = mapRef?.current;
    if (!map || loading || error || !editMode) {
      setCustomScreenPoints({});
      return undefined;
    }

    const project = () => {
      const canvas = map.getCanvas?.();
      const rect = canvas?.getBoundingClientRect?.();
      if (!rect) return;
      const next = {};
      (allFeatures || []).forEach((feature) => {
        if (feature?.properties?.isCustom !== true || !visibleFeature(feature)) return;
        const coords = feature?.geometry?.coordinates;
        if (!Array.isArray(coords) || coords.length < 2) return;
        try {
          const point = map.project([coords[0], coords[1]]);
          const id = String(feature.properties.placeId || amenityFeatureKey(feature));
          next[id] = {
            x: rect.left + point.x,
            y: rect.top + point.y,
            categoryKey: feature.properties.amenityKey,
            name: feature.properties.name || 'Custom place',
          };
        } catch (_) {
          /* ignore */
        }
      });
      setCustomScreenPoints(next);
    };

    project();
    map.on('move', project);
    map.on('resize', project);
    return () => {
      map.off('move', project);
      map.off('resize', project);
    };
  }, [allFeatures, editMode, error, loading, mapRef]);

  useEffect(() => {
    const map = mapRef?.current;
    if (!map || loading || error || !editMode || !mapPickFeature) {
      setMapPickScreen(null);
      return undefined;
    }
    const coords = mapPickFeature?.geometry?.coordinates;
    if (!Array.isArray(coords) || coords.length < 2) {
      setMapPickScreen(null);
      return undefined;
    }
    const project = () => {
      const canvas = map.getCanvas?.();
      const rect = canvas?.getBoundingClientRect?.();
      if (!rect) return;
      try {
        const point = map.project([coords[0], coords[1]]);
        setMapPickScreen({
          x: rect.left + point.x,
          y: rect.top + point.y,
          name: mapPickFeature?.properties?.name || 'Place',
        });
      } catch (_) {
        setMapPickScreen(null);
      }
    };
    project();
    map.on('move', project);
    map.on('resize', project);
    return () => {
      map.off('move', project);
      map.off('resize', project);
    };
  }, [editMode, error, loading, mapPickFeature, mapRef]);

  useEffect(() => {
    didInitialFitRef.current = false;
    lastFitSignatureRef.current = '';
    setMapRevealReady(false);
    setLoadedBadgeKeys(new Set());
  }, [shareToken]);

  const amenityFitSignature = useMemo(() => {
    const keys = savedFeatures
      .map((feature) => amenityFeatureKey(feature))
      .filter(Boolean)
      .sort();
    const home =
      homePosition && Number.isFinite(homePosition.lat) && Number.isFinite(homePosition.lng)
        ? `${Number(homePosition.lng).toFixed(5)},${Number(homePosition.lat).toFixed(5)}`
        : '';
    return `${keys.join('|')}::${home}`;
  }, [homePosition, savedFeatures]);

  // Client map: refit whenever published places change so a new amenity stays in frame.
  // Editor: one opening fit only — later refits happen on Save.
  useEffect(() => {
    const map = mapRef?.current;
    if (!map || loading || error || !mapRevealReady) return;
    if (editMode && didInitialFitRef.current) return;
    if (!editMode && lastFitSignatureRef.current === amenityFitSignature) return;

    let cancelled = false;
    const run = () => {
      if (cancelled) return;
      if (editMode && didInitialFitRef.current) return;
      if (!editMode && lastFitSignatureRef.current === amenityFitSignature) return;
      const ok = fitAmenityMapToPlaces(map, savedFeatures, homePosition, {
        duration: didInitialFitRef.current ? 700 : 0,
      });
      if (!ok) return;
      didInitialFitRef.current = true;
      lastFitSignatureRef.current = amenityFitSignature;
    };

    const frame = window.requestAnimationFrame(() => {
      window.requestAnimationFrame(run);
    });
    const retries = [120, 280, 600, 1200, 2200].map((ms) => window.setTimeout(run, ms));
    const railEl = typeof document !== 'undefined' ? document.querySelector('.amenity-map-rail') : null;
    const observer =
      typeof ResizeObserver !== 'undefined' && railEl
        ? new ResizeObserver(() => run())
        : null;
    if (observer && railEl) observer.observe(railEl);
    return () => {
      cancelled = true;
      window.cancelAnimationFrame(frame);
      retries.forEach((id) => window.clearTimeout(id));
      observer?.disconnect();
    };
  }, [
    amenityFitSignature,
    editMode,
    error,
    homePosition,
    loading,
    mapRef,
    mapRevealReady,
    savedFeatures,
  ]);

  useEffect(() => {
    if (editMode || !shareToken) return undefined;
    const key = amenityFitStorageKey(shareToken);
    const refitFromOtherTab = () => {
      const map = mapRef?.current;
      if (!map || loading || error || !mapRevealReady) return;
      lastFitSignatureRef.current = '';
      if (fitAmenityMapToPlaces(map, savedFeatures, homePosition, { duration: 700 })) {
        lastFitSignatureRef.current = amenityFitSignature;
        didInitialFitRef.current = true;
      }
    };
    const onStorage = (event) => {
      if (event.key === key) refitFromOtherTab();
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [
    amenityFitSignature,
    editMode,
    error,
    homePosition,
    loading,
    mapRef,
    mapRevealReady,
    savedFeatures,
    shareToken,
  ]);

  useEffect(() => {
    const map = mapRef?.current;
    if (!editMode || !map || !activeEditorCategoryKey) {
      hideTourEditRadiusCircle(map);
      return undefined;
    }
    const center = getSearchCenter(mapData, map);
    const radiusMeters = radiusByKey[activeEditorCategoryKey];
    if (!center || !radiusMeters) return undefined;
    showTourEditRadiusCircle(map, center, radiusMeters);
    fitTourBuilderRadiusBounds(map, center, radiusMeters, { force: true, duration: 500 });
    const keepOnTop = () => ensureTourEditRadiusLayersOnTop(map);
    map.on('idle', keepOnTop);
    return () => {
      map.off('idle', keepOnTop);
      hideTourEditRadiusCircle(map);
    };
    // Radius changes update geometry directly so the slider does not repeatedly move the camera.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeEditorCategoryKey, editMode, mapData, mapRef]);

  const updateRadius = useCallback((key, miles) => {
    const radiusMeters = amenityRadiusMilesToMeters(miles);
    setRadiusByKey((previous) => ({
      ...previous,
      [key]: radiusMeters,
    }));
    const map = mapRef?.current;
    const center = getSearchCenter(mapData, map);
    if (map && center && activeEditorCategoryKey === key) {
      // Prefer show over update so a restacked/cleared overlay always comes back.
      showTourEditRadiusCircle(map, center, radiusMeters);
      ensureTourEditRadiusLayersOnTop(map);
    }
  }, [activeEditorCategoryKey, mapData, mapRef]);

  const openEditorCategory = useCallback((key) => {
    setPdfPanelOpen(false);
    setEnabledSearchKeys((previous) => new Set([...previous, key]));
    setActiveEditorCategoryKey(key);
    setChoosingAmenity(false);
    setActiveFeature(null);
    setAddingCustom(false);
    setPlacingCustom(false);
    setPlaceGhost(null);
    setCustomError('');
    setCustomDraft({ name: '', address: '', placeId: '', categoryKey: '' });
  }, []);

  const runCategorySearch = useCallback(
    async (key, { autoSelect = 5 } = {}) => {
      const category = AMENITY_MAP_CATEGORY_BY_KEY[key];
      const map = mapRef?.current;
      const center = getSearchCenter(mapData, map);
      if (!category || !center) {
        setSearchState((previous) => ({
          ...previous,
          [key]: { status: 'error', error: 'Could not determine the property location.' },
        }));
        return null;
      }

      setSearchState((previous) => ({ ...previous, [key]: { status: 'loading', error: '' } }));
      try {
        const radiusMeters = radiusByKey[key];
        const result = await mapService.getNearbyGooglePlaces({
          ...center,
          radiusMeters,
          amenityKey: key,
          shareToken,
          editorMode: true,
          basicFields: true,
          gridCache: true,
          preferBrowser: true,
        });

        let merged = [];
        setEntries((previous) => {
          const previousFeatures = Array.isArray(previous[key]?.features)
            ? previous[key].features
            : [];
          const prevById = new Map(
            previousFeatures.map((feature) => [amenityFeatureKey(feature), feature])
          );
          const customKept = previousFeatures.filter(
            (feature) => feature?.properties?.isCustom === true
          );
          const hadPriorSearch = previousFeatures.some(
            (feature) => feature?.properties?.isCustom !== true
          );

          const searched = (result?.features || []).map((feature, index) => {
            const id = amenityFeatureKey(feature);
            const prior = prevById.get(id);
            if (prior) {
              return mergePlaceVisibilityFromPrior(
                setFeatureVisible(feature, visibleFeature(prior)),
                prior
              );
            }
            // First search: auto-select a few. Re-search: leave new finds off so picks aren’t reset.
            return setFeatureVisible(feature, !hadPriorSearch && index < autoSelect);
          });

          const searchedIds = new Set(searched.map((feature) => amenityFeatureKey(feature)));
          const customs = customKept.filter(
            (feature) => !searchedIds.has(amenityFeatureKey(feature))
          );
          merged = [...customs, ...searched];
          return {
            ...previous,
            [key]: {
              type: 'FeatureCollection',
              features: merged,
              fetched: true,
              searchRadiusMeters: radiusMeters,
            },
          };
        });
        setVisibleCategoryKeys((previous) => new Set([...previous, key]));
        setSearchState((previous) => ({
          ...previous,
          [key]: { status: 'success', error: '', count: merged.length },
        }));
        return merged;
      } catch (err) {
        setSearchState((previous) => ({
          ...previous,
          [key]: { status: 'error', error: err?.message || `Could not find ${category.label}.` },
        }));
        return null;
      }
    },
    [mapData, mapRef, radiusByKey, shareToken]
  );

  const addNamedGooglePlace = useCallback(
    (place, { alreadyPresent } = {}) => {
      const categoryKey = activeEditorCategoryKey;
      if (!categoryKey || !place) return;
      const raw = googlePlaceResultToFeature(place, categoryKey);
      if (!raw) {
        setSearchState((previous) => ({
          ...previous,
          [categoryKey]: {
            status: 'error',
            error: 'That place has no map location. Try Search, then pick it from the list.',
          },
        }));
        return;
      }
      const map = mapRef?.current;
      const origin = getSearchCenter(mapData, map) || homePosition;
      const lng = Number(raw.geometry?.coordinates?.[0]);
      const lat = Number(raw.geometry?.coordinates?.[1]);
      const feature = {
        ...raw,
        properties: {
          ...(raw.properties || {}),
          amenityMapHidden: false,
        },
      };
      if (origin && Number.isFinite(lat) && Number.isFinite(lng)) {
        const miles = haversineMiles(origin.lat, origin.lng, lat, lng);
        if (Number.isFinite(miles)) {
          feature.properties.straightLineMiles = Math.round(miles * 10) / 10;
          feature.properties.distanceText = `${feature.properties.straightLineMiles} mi`;
        }
      }
      const id = amenityFeatureKey(feature);
      const previous = entriesRef.current || {};
      const entry = previous[categoryKey];
      const existing = Array.isArray(entry?.features) ? entry.features : [];
      const nextFeatures = alreadyPresent
        ? existing.map((row) =>
            amenityFeatureKey(row) === id ? setFeatureVisible(row, true) : row
          )
        : [feature, ...existing.filter((row) => amenityFeatureKey(row) !== id)];
      const nextEntries = {
        ...previous,
        [categoryKey]: {
          type: 'FeatureCollection',
          features: nextFeatures,
          fetched: true,
          searchRadiusMeters: entry?.searchRadiusMeters || radiusByKey[categoryKey],
        },
      };
      const nextEnabled = new Set([...(enabledSearchKeysRef.current || []), categoryKey]);
      entriesRef.current = nextEntries;
      enabledSearchKeysRef.current = nextEnabled;
      setEntries(nextEntries);
      setEnabledSearchKeys(nextEnabled);
      setVisibleCategoryKeys((previous) => new Set([...previous, categoryKey]));
      setActiveFeature(null);
      setMapPickFeature(feature);
      if (map && Number.isFinite(lng) && Number.isFinite(lat)) {
        map.easeTo?.({
          center: [lng, lat],
          zoom: Math.max(Number(map.getZoom?.()) || 12, 13),
          duration: 600,
        });
      }
      void saveEntriesNowRef.current(nextEntries, nextEnabled);
    },
    [activeEditorCategoryKey, homePosition, mapData, mapRef, radiusByKey]
  );

  const autoBuild = useCallback(async () => {
    setSaveState('building');
    setSaveError('');
    const keys = AMENITY_MAP_CATEGORIES.map(({ key }) => key);
    const results = await Promise.all(keys.map((key) => runCategorySearch(key, { autoSelect: 5 })));
    if (results.some(Boolean)) setEnabledSearchKeys(new Set(keys));
    setSaveState('idle');
  }, [runCategorySearch]);

  const togglePlace = useCallback((categoryKey, featureKey) => {
    setEntries((previous) => {
      const entry = previous[categoryKey];
      if (!entry) return previous;
      return {
        ...previous,
        [categoryKey]: {
          ...entry,
          features: (entry.features || []).map((feature) =>
            amenityFeatureKey(feature) === featureKey
              ? setFeatureVisible(feature, !visibleFeature(feature))
              : feature
          ),
        },
      };
    });
  }, []);

  const setAllPlacesVisible = useCallback((categoryKey, visible) => {
    setEntries((previous) => {
      const entry = previous[categoryKey];
      if (!entry) return previous;
      return {
        ...previous,
        [categoryKey]: {
          ...entry,
          features: (entry.features || []).map((feature) => setFeatureVisible(feature, visible)),
        },
      };
    });
  }, []);

  const placeCustomAtLngLat = useCallback(
    (lng, lat) => {
      const categoryKey = activeEditorCategoryKey;
      if (!categoryKey || !Number.isFinite(lat) || !Number.isFinite(lng)) return;
      const feature = buildCustomAmenityFeature({
        categoryKey,
        name: 'Custom place',
        address: '',
        lat,
        lng,
        homePosition,
      });
      const placeId = feature.properties.placeId;
      setEntries((previous) => {
        const entry = previous[categoryKey];
        const existing = Array.isArray(entry?.features) ? entry.features : [];
        return {
          ...previous,
          [categoryKey]: {
            type: 'FeatureCollection',
            features: [feature, ...existing],
            fetched: true,
            searchRadiusMeters: entry?.searchRadiusMeters || radiusByKey[categoryKey],
          },
        };
      });
      setEnabledSearchKeys((previous) => new Set([...previous, categoryKey]));
      setVisibleCategoryKeys((previous) => new Set([...previous, categoryKey]));
      setCustomDraft({
        name: 'Custom place',
        address: '',
        placeId,
        categoryKey,
      });
      setAddingCustom(true);
      setCustomError('');
      setActiveFeature(feature);
    },
    [activeEditorCategoryKey, homePosition, radiusByKey]
  );

  const moveCustomPlace = useCallback((placeId, lat, lng, categoryKey) => {
    if (!placeId || !categoryKey || !Number.isFinite(lat) || !Number.isFinite(lng)) return;
    setEntries((previous) => {
      const entry = previous[categoryKey];
      if (!entry) return previous;
      return {
        ...previous,
        [categoryKey]: {
          ...entry,
          features: (entry.features || []).map((feature) => {
            if (amenityFeatureKey(feature) !== placeId && feature?.properties?.placeId !== placeId) {
              return feature;
            }
            const nextProps = { ...(feature.properties || {}) };
            if (
              homePosition &&
              Number.isFinite(Number(homePosition.lat)) &&
              Number.isFinite(Number(homePosition.lng))
            ) {
              const miles = haversineMiles(homePosition.lat, homePosition.lng, lat, lng);
              if (Number.isFinite(miles)) {
                nextProps.straightLineMiles = Math.round(miles * 10) / 10;
                nextProps.distanceText = `${nextProps.straightLineMiles} mi`;
              }
            }
            return {
              ...feature,
              geometry: { type: 'Point', coordinates: [lng, lat] },
              properties: nextProps,
            };
          }),
        },
      };
    });
  }, [homePosition]);

  const saveCustomDraft = useCallback(() => {
    const placeId = String(customDraft.placeId || '').trim();
    const categoryKey =
      String(customDraft.categoryKey || '').trim() ||
      String(activeEditorCategoryKey || '').trim();
    const name = String(customDraft.name || '').trim();
    if (!placeId || !categoryKey) return;
    if (!name) {
      setCustomError('Enter a place name.');
      return;
    }
    setEntries((previous) => {
      const entry = previous[categoryKey];
      if (!entry) return previous;
      return {
        ...previous,
        [categoryKey]: {
          ...entry,
          features: (entry.features || []).map((feature) => {
            if (String(feature?.properties?.placeId || '') !== placeId) return feature;
            const addr = String(customDraft.address || '').trim();
            return {
              ...feature,
              properties: {
                ...(feature.properties || {}),
                name,
                formattedAddress: addr || undefined,
                vicinity: addr || undefined,
              },
            };
          }),
        },
      };
    });
    setCustomError('');
    setAddingCustom(false);
    setCustomDraft({ name: '', address: '', placeId: '', categoryKey: '' });
  }, [activeEditorCategoryKey, customDraft]);

  const openCustomEditor = useCallback((feature) => {
    if (!feature?.properties?.isCustom) return;
    const categoryKey = String(feature.properties.amenityKey || '').trim();
    setPdfPanelOpen(false);
    if (categoryKey) {
      setChoosingAmenity(false);
      setActiveEditorCategoryKey(categoryKey);
    }
    setCustomDraft({
      name: String(feature.properties.name || ''),
      address: featureAddress(feature),
      placeId: String(feature.properties.placeId || amenityFeatureKey(feature)),
      categoryKey,
    });
    setAddingCustom(true);
    setCustomError('');
    setActiveFeature(feature);
  }, []);

  const deleteCustomPlace = useCallback(
    (placeId, categoryKey) => {
      const id = String(placeId || '').trim();
      const key = String(categoryKey || '').trim();
      if (!id || !key) return;
      setEntries((previous) => {
        const entry = previous[key];
        if (!entry) return previous;
        return {
          ...previous,
          [key]: {
            ...entry,
            features: (entry.features || []).filter(
              (feature) => String(feature?.properties?.placeId || '') !== id
            ),
          },
        };
      });
      setCustomScreenPoints((previous) => {
        if (!previous[id]) return previous;
        const next = { ...previous };
        delete next[id];
        return next;
      });
      if (String(customDraft.placeId || '') === id) {
        setAddingCustom(false);
        setCustomDraft({ name: '', address: '', placeId: '', categoryKey: '' });
      }
      setActiveFeature((previous) =>
        String(previous?.properties?.placeId || '') === id ? null : previous
      );
      setMapPickFeature((previous) =>
        String(previous?.properties?.placeId || '') === id ? null : previous
      );
    },
    [customDraft.placeId]
  );

  const removePickedFromMap = useCallback(() => {
    const feature = mapPickFeature;
    if (!feature) return;
    const categoryKey = String(feature?.properties?.amenityKey || '').trim();
    const featureKey = amenityFeatureKey(feature);
    if (feature?.properties?.isCustom === true) {
      deleteCustomPlace(String(feature.properties.placeId || featureKey), categoryKey);
    } else if (categoryKey && featureKey) {
      setEntries((previous) => {
        const entry = previous[categoryKey];
        if (!entry) return previous;
        return {
          ...previous,
          [categoryKey]: {
            ...entry,
            features: (entry.features || []).map((row) =>
              amenityFeatureKey(row) === featureKey ? setFeatureVisible(row, false) : row
            ),
          },
        };
      });
    }
    setMapPickFeature(null);
    setActiveFeature((previous) =>
      previous && amenityFeatureKey(previous) === featureKey ? null : previous
    );
  }, [deleteCustomPlace, mapPickFeature]);

  const startPlacingCustom = useCallback(
    (event) => {
      if (!editMode || !activeEditorCategoryKey) return;
      event?.preventDefault?.();
      event?.stopPropagation?.();
      setPlacingCustom(true);
      setAddingCustom(false);
      setCustomError('');
      const x = Number(event?.clientX);
      const y = Number(event?.clientY);
      setPlaceGhost({
        x: Number.isFinite(x) ? x : window.innerWidth / 2,
        y: Number.isFinite(y) ? y : window.innerHeight / 2,
      });
    },
    [activeEditorCategoryKey, editMode]
  );

  const cancelPlacingCustom = useCallback(() => {
    setPlacingCustom(false);
    setPlaceGhost(null);
  }, []);

  // Click-to-place custom amenities — place only on a discrete click, never after a drag/pan.
  useEffect(() => {
    if (!placingCustom) return undefined;
    const map = mapRef?.current;
    const DRAG_THRESHOLD_PX = 6;
    let pointerOrigin = null;
    let pointerMoved = false;

    const onMove = (e) => {
      setPlaceGhost({ x: e.clientX, y: e.clientY });
      if (!pointerOrigin) return;
      const dx = e.clientX - pointerOrigin.x;
      const dy = e.clientY - pointerOrigin.y;
      if (dx * dx + dy * dy > DRAG_THRESHOLD_PX * DRAG_THRESHOLD_PX) {
        pointerMoved = true;
      }
    };

    const onPointerDown = (e) => {
      if (e.button != null && e.button !== 0) return;
      pointerOrigin = { x: e.clientX, y: e.clientY };
      pointerMoved = false;
    };

    const onKeyDown = (e) => {
      if (e.key === 'Escape') cancelPlacingCustom();
    };

    // Mapbox `click` does not fire after a pan/drag — preferred place path.
    const onMapClick = (e) => {
      if (pointerMoved) return;
      const original = e.originalEvent;
      if (original?.target?.closest?.('.amenity-map-add-custom-btn')) return;
      e.preventDefault?.();
      const { lng, lat } = e.lngLat || {};
      if (!Number.isFinite(lng) || !Number.isFinite(lat)) return;
      cancelPlacingCustom();
      placeCustomAtLngLat(lng, lat);
    };

    // Outside-map clicks cancel; ignore drag-mouseup that browsers still emit as click.
    const onWindowClick = (e) => {
      if (e.button != null && e.button !== 0) return;
      if (e.target?.closest?.('.amenity-map-add-custom-btn')) return;
      if (pointerMoved) {
        pointerOrigin = null;
        pointerMoved = false;
        return;
      }
      const canvas = map?.getCanvas?.();
      const rect = canvas?.getBoundingClientRect?.();
      if (map && rect) {
        const { clientX, clientY } = e;
        if (
          clientX >= rect.left &&
          clientX <= rect.right &&
          clientY >= rect.top &&
          clientY <= rect.bottom
        ) {
          // Map placement handled by map click; skip duplicate window place.
          return;
        }
      }
      cancelPlacingCustom();
    };

    const timer = window.setTimeout(() => {
      window.addEventListener('click', onWindowClick, true);
      map?.on?.('click', onMapClick);
    }, 0);
    window.addEventListener('pointerdown', onPointerDown, true);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('keydown', onKeyDown);

    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('click', onWindowClick, true);
      window.removeEventListener('pointerdown', onPointerDown, true);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('keydown', onKeyDown);
      map?.off?.('click', onMapClick);
    };
  }, [cancelPlacingCustom, mapRef, placeCustomAtLngLat, placingCustom]);

  const beginHomeMarkerDrag = useCallback(
    (event) => {
      if (!editMode) return;
      if (event.button != null && event.button !== 0) return;
      event.preventDefault();
      event.stopPropagation();
      const map = mapRef?.current;
      const target = event.currentTarget;
      try {
        target?.setPointerCapture?.(event.pointerId);
      } catch (_) {
        /* ignore */
      }
      homeDragRef.current = { screen: { x: event.clientX, y: event.clientY } };
      map?.dragPan?.disable?.();
      popupRef.current?.remove?.();
      popupRef.current = null;

      const onMove = (e) => {
        if (!homeDragRef.current) return;
        homeDragRef.current.screen = { x: e.clientX, y: e.clientY };
        setHomeScreenPoint({ x: e.clientX, y: e.clientY });
      };
      const onUp = (e) => {
        const drag = homeDragRef.current;
        homeDragRef.current = null;
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        window.removeEventListener('pointercancel', onUp);
        try {
          target?.releasePointerCapture?.(e.pointerId);
        } catch (_) {
          /* ignore */
        }
        map?.dragPan?.enable?.();
        if (!drag || !map) return;
        const clientX = e?.clientX ?? drag.screen?.x;
        const clientY = e?.clientY ?? drag.screen?.y;
        if (!Number.isFinite(clientX) || !Number.isFinite(clientY)) return;
        const canvas = map.getCanvas?.();
        const rect = canvas?.getBoundingClientRect?.();
        if (!rect) return;
        const lngLat = map.unproject([clientX - rect.left, clientY - rect.top]);
        if (!lngLat) return;
        setHomePosition({ lat: lngLat.lat, lng: lngLat.lng });
      };
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
      window.addEventListener('pointercancel', onUp);
    },
    [editMode, mapRef]
  );

  const beginCustomMarkerDrag = useCallback(
    (event, placeId, categoryKey) => {
      if (!editMode || !placeId || !categoryKey) return;
      if (event.button != null && event.button !== 0) return;
      event.preventDefault();
      event.stopPropagation();
      const map = mapRef?.current;
      let moved = false;
      customDragRef.current = { placeId, categoryKey };
      map?.dragPan?.disable?.();
      popupRef.current?.remove?.();
      popupRef.current = null;

      const onMove = (e) => {
        if (!customDragRef.current) return;
        moved = true;
        setCustomScreenPoints((previous) => ({
          ...previous,
          [placeId]: {
            ...(previous[placeId] || {}),
            x: e.clientX,
            y: e.clientY,
            categoryKey,
          },
        }));
      };
      const onUp = (e) => {
        const drag = customDragRef.current;
        customDragRef.current = null;
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        window.removeEventListener('pointercancel', onUp);
        map?.dragPan?.enable?.();
        if (!drag || !map) return;
        if (!moved) {
          const feature = allFeatures.find(
            (candidate) => String(candidate?.properties?.placeId || '') === placeId
          );
          if (feature) openCustomEditor(feature);
          return;
        }
        const canvas = map.getCanvas?.();
        const rect = canvas?.getBoundingClientRect?.();
        if (!rect) return;
        const lngLat = map.unproject([e.clientX - rect.left, e.clientY - rect.top]);
        if (!lngLat) return;
        moveCustomPlace(drag.placeId, lngLat.lat, lngLat.lng, drag.categoryKey);
      };
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
      window.addEventListener('pointercancel', onUp);
    },
    [allFeatures, editMode, mapRef, moveCustomPlace, openCustomEditor]
  );

  const saveEntriesNow = useCallback(async (nextEntries, nextEnabledKeys) => {
    if (demoMode) {
      setSaveError('Demo mode previews the editor but does not write to a saved map.');
      return;
    }
    const center = getSearchCenter(mapData, mapRef?.current);
    if (!center) {
      setSaveError('Could not determine the property location.');
      return;
    }
    setSaveState('saving');
    setSaveError('');
    try {
      const selectedEntries = persistableAmenityEntries(nextEntries || entriesRef.current);
      const keys = Object.keys(selectedEntries);
      const rootRadius = rootRadiusForAmenitySave(mapData, selectedEntries);
      const basemapToSave =
        normalizeBasemapId(activeBasemapIdRef?.current || currentBasemapId) ||
        AMENITY_BASEMAP_ID;
      const homeToSave = homePosition || center;
      const amenityMapSettings = buildAmenityMapSettingsForSave(
        {
          basemap: basemapToSave,
          homeMarker: homeToSave,
          guestEdit: amenityEditAccess?.viewerIsOwner ? guestEditEnabled : undefined,
        },
        { allowAccessFlags: amenityEditAccess?.viewerIsOwner === true }
      );
      const payload = buildTourNearbyCacheForSave(center, selectedEntries, rootRadius, keys, {
        allowEmpty: true,
        homeMarker: homeToSave,
        amenityMapBasemap: basemapToSave,
      });
      if (!payload) {
        throw new Error('Could not build amenity map data to save.');
      }
      let tourSettingsToSave;
      let settingsSource = mapData;
      let latestSettingsOk = false;
      try {
        const latest = await mapService.getSharedMapByToken(shareToken);
        if (latest) {
          settingsSource = latest;
          latestSettingsOk = true;
        }
      } catch (_) {
        /* If we cannot read live tour settings, do not rewrite the slide plan. */
      }
      const existingSettings = resolveTourSettingsFromMap(settingsSource);
      if (latestSettingsOk && existingSettings.slidePlanUserEdited !== true) {
        const mergedForPlan = {
          byAmenity: {
            ...(settingsSource?.tourNearbyCache?.byAmenity || {}),
            ...payload.byAmenity,
          },
        };
        tourSettingsToSave = materializeTourSettingsSlidePlan(
          existingSettings,
          settingsSource?.printElements || mapData?.printElements || [],
          { availableAmenityKeys: amenityKeysWithSavedFeatures(mergedForPlan) }
        );
      }
      const result = await mapService.saveTourNearbyCache(
        shareToken,
        payload,
        tourSettingsToSave,
        amenityMapSettings,
        { amenityEditor: true }
      );
      if (result?.success === false) {
        throw new Error('Tour save was rejected by the server.');
      }
      if (result?.amenityEditAccess) {
        setAmenityEditAccess(result.amenityEditAccess);
        setGuestEditEnabled(result.amenityEditAccess.guestEdit === true);
      }
      setMapData((previous) =>
        previous
          ? {
              ...previous,
              amenityMapSettings:
                result?.amenityMapSettings ||
                amenityMapSettings ||
                previous.amenityMapSettings ||
                null,
              amenityEditAccess: result?.amenityEditAccess || previous.amenityEditAccess,
              tourSettings: result?.tourSettings || tourSettingsToSave || previous.tourSettings,
              tourSlidePlan:
                result?.tourSlidePlan ||
                tourSettingsToSave?.slidePlan ||
                previous.tourSlidePlan ||
                null,
              tourNearbyCache: {
                ...(previous.tourNearbyCache || {}),
                ...(result?.tourNearbyCache || payload || {}),
                byAmenity: {
                  ...(previous.tourNearbyCache?.byAmenity || {}),
                  ...(result?.tourNearbyCache?.byAmenity || payload?.byAmenity || {}),
                },
                homeMarker: homeToSave,
                amenityMapBasemap: basemapToSave,
              },
            }
          : previous
      );
      notifyAmenityClientFit(shareToken);
      const map = mapRef?.current;
      if (map) {
        const visibleNow = AMENITY_MAP_CATEGORIES.flatMap(({ key }) => {
          const features = Array.isArray(selectedEntries[key]?.features)
            ? selectedEntries[key].features
            : [];
          return features
            .filter(visibleFeature)
            .map((feature) => ({
              ...feature,
              properties: {
                ...(feature?.properties || {}),
                amenityKey: String(feature?.properties?.amenityKey || key).trim() || key,
              },
            }));
        });
        if (fitAmenityMapToPlaces(map, visibleNow, homeToSave, { duration: 800 })) {
          lastFitSignatureRef.current = `${visibleNow
            .map((feature) => amenityFeatureKey(feature))
            .filter(Boolean)
            .sort()
            .join('|')}::${
            Number.isFinite(homeToSave?.lng) && Number.isFinite(homeToSave?.lat)
              ? `${Number(homeToSave.lng).toFixed(5)},${Number(homeToSave.lat).toFixed(5)}`
              : ''
          }`;
          didInitialFitRef.current = true;
        }
      }
      setSaveState('saved');
      window.setTimeout(() => setSaveState('idle'), 1800);
    } catch (err) {
      setSaveState('error');
      setSaveError(err?.message || 'Could not save this amenity map.');
    }
  }, [
    activeBasemapIdRef,
    amenityEditAccess,
    demoMode,
    guestEditEnabled,
    homePosition,
    mapData,
    mapRef,
    shareToken,
    currentBasemapId,
  ]);

  saveEntriesNowRef.current = saveEntriesNow;

  const saveMap = useCallback(() => {
    return saveEntriesNow(entriesRef.current, enabledSearchKeysRef.current);
  }, [saveEntriesNow]);

  const generateNeighborhoodPdf = useCallback(async () => {
    if (demoMode) {
      setPdfError('Demo mode cannot generate a neighborhood PDF.');
      return;
    }
    if (!user) {
      setPdfError('Sign in to generate the neighborhood PDF.');
      return;
    }
    const map = mapRef?.current;
    if (!map) {
      setPdfError('Map is still loading — try again in a moment.');
      return;
    }
    const visible = (savedFeatures || []).filter(visibleFeature);
    if (!visible.length) {
      setPdfError('Select at least one amenity place, then generate.');
      return;
    }

    setPdfBusy(true);
    setPdfError('');
    setPdfStatus('Saving amenities…');
    try {
      await saveMap();
      const selectedEntries = persistableAmenityEntries(entries);
      const result = await runNeighborhoodMapFromAmenityEditor({
        map,
        mapRef,
        mapData,
        visibleFeatures: visible,
        byAmenityEntries: selectedEntries,
        homePosition,
        title: meta.title,
        user,
        userProfile,
        framingMode: pdfFramingMode,
        download: true,
        persistAssets: true,
        onStatus: setPdfStatus,
        basemapId:
          normalizeBasemapId(activeBasemapIdRef?.current || currentBasemapId) ||
          AMENITY_BASEMAP_ID,
        restoreBasemapId:
          normalizeBasemapId(activeBasemapIdRef?.current || currentBasemapId) ||
          AMENITY_BASEMAP_ID,
      });
      if (result?.neighborhoodMapAssets) {
        setPdfAssets(result.neighborhoodMapAssets);
      } else if (result?.pdfDataUrl) {
        setPdfAssets({
          pdfUrl: result.pdfDataUrl,
          pngUrl: result.pngDataUrl,
          title: result.title,
          generatedAt: Date.now(),
        });
      }
      setPdfStatus('PDF ready');
      window.setTimeout(() => setPdfStatus(''), 4000);
    } catch (err) {
      console.error('Neighborhood PDF from amenity editor failed:', err);
      setPdfError(err?.message || 'Could not generate neighborhood PDF.');
      setPdfStatus('');
    } finally {
      setPdfBusy(false);
    }
  }, [
    demoMode,
    user,
    userProfile,
    mapRef,
    savedFeatures,
    saveMap,
    enabledSearchKeys,
    entries,
    mapData,
    homePosition,
    meta.title,
    pdfFramingMode,
    activeBasemapIdRef,
    currentBasemapId,
  ]);

  /** Opens the detail card (with photo) and eases the map onto the place. */
  const showFeatureDetail = useCallback(
    (feature) => {
      setActiveFeature(feature);
      // The card renders above the category list, so bring it into view.
      panelBodyRef.current?.scrollTo?.({ top: 0, behavior: 'smooth' });
      const coords = feature?.geometry?.coordinates;
      if (!Array.isArray(coords) || coords.length < 2) return;
      focusMapOnPoint(
        mapRef?.current,
        { lng: coords[0], lat: coords[1] },
        AMENITY_FOCUS_ZOOM
      );
    },
    [mapRef]
  );

  const toggleSetKey = (setter, key) => {
    setter((previous) => {
      const next = new Set(previous);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  if (error) {
    return (
      <div className="amenity-map-loading amenity-map-loading--error">
        <h2>We couldn’t open this map</h2>
        <p>{error}</p>
      </div>
    );
  }
  if (loading || !mapRevealReady) {
    return (
      <MapLoadingOverlay
        phraseSet="amenities"
        mapTitle={meta.title}
        className="map-loading-overlay--opaque"
      />
    );
  }

  const activeEditorCategory = activeEditorCategoryKey
    ? AMENITY_MAP_CATEGORY_BY_KEY[activeEditorCategoryKey]
    : null;
  const activeEditorEntry = activeEditorCategoryKey ? entries[activeEditorCategoryKey] : null;
  const activeEditorFeatures = Array.isArray(activeEditorEntry?.features)
    ? activeEditorEntry.features
    : [];
  const namedAddPlaceIds = new Set(
    activeEditorFeatures
      .map((feature) => String(feature?.properties?.placeId || feature?.properties?.place_id || ''))
      .filter(Boolean)
  );
  const namedAddCenter = getSearchCenter(mapData, mapRef?.current) || homePosition;
  const activeEditorSearchState = activeEditorCategoryKey
    ? searchState[activeEditorCategoryKey] || {}
    : {};
  const addedEditorCategories = AMENITY_MAP_CATEGORIES.filter(({ key }) => {
    if (enabledSearchKeys.has(key)) return true;
    const features = entries[key]?.features;
    return Array.isArray(features) && features.length > 0;
  });

  /** Viewer only lists categories the agent actually published places for. */
  const viewerCategories = AMENITY_MAP_CATEGORIES.map((category) => {
    const features = (
      Array.isArray(entries[category.key]?.features) ? entries[category.key].features : []
    ).filter(visibleFeature);
    return { category, features, selectedCount: features.length };
  }).filter(({ features }) => features.length > 0);

  const homeToggle = (
    <div className="amenity-map-layer-group">
      <div className="amenity-map-layer-row">
        <button
          type="button"
          className="amenity-map-layer-head is-focusable"
          onClick={() => focusMapOnPoint(mapRef?.current, homePosition, HOME_FOCUS_ZOOM)}
          disabled={!homePosition}
        >
          <img className="amenity-map-icon" src={AMENITY_HOME_LOGO_URL} alt="" aria-hidden />
          <span className="amenity-map-layer-name">The property</span>
        </button>
        <AmenitySwitch
          checked={showHomeMarker}
          onChange={() => setShowHomeMarker((shown) => !shown)}
          label="Show the property"
        />
      </div>
    </div>
  );

  const showAgentCard = !isNarrowViewport && hasAgentDetails(meta);

  return (
    <div
      className={`amenity-map-shell${editMode ? ' is-editing' : ' is-viewing'}${
        isNarrowViewport ? ' is-narrow' : ''
      }`}
    >
      {pdfBusy ? (
        <MapLoadingOverlay
          phraseSet="map"
          mapTitle={pdfStatus || 'Generating neighborhood PDF'}
          className="map-loading-overlay--share-create"
        />
      ) : null}
      {showHomeMarker && homeScreenPoint ? (
        <button
          type="button"
          className={`amenity-map-home-marker${editMode ? ' is-draggable' : ''}`}
          style={{
            width: HOME_MARKER_SIZE_PX,
            height: HOME_MARKER_SIZE_PX,
            left: homeScreenPoint.x,
            top: homeScreenPoint.y,
          }}
          aria-label={editMode ? 'Home — drag to reposition' : 'Home'}
          title={editMode ? 'Drag to reposition' : 'Home'}
          onPointerDownCapture={editMode ? beginHomeMarkerDrag : undefined}
          onClick={editMode ? (event) => event.preventDefault() : undefined}
        >
          <img src={AMENITY_HOME_LOGO_URL} alt="" aria-hidden draggable={false} />
        </button>
      ) : null}

      {editMode
        ? Object.entries(customScreenPoints).map(([placeId, point]) => (
            <button
              key={placeId}
              type="button"
              className="amenity-map-custom-marker is-draggable"
              style={{ left: point.x, top: point.y }}
              title={`${point.name || 'Custom place'} — drag to move`}
              aria-label={`${point.name || 'Custom place'} — drag to reposition`}
              onPointerDown={(event) => {
                const feature = allFeatures.find(
                  (candidate) =>
                    String(candidate?.properties?.placeId || amenityFeatureKey(candidate)) ===
                    placeId
                );
                if (feature) {
                  setActiveFeature(null);
                  setMapPickFeature(feature);
                }
                beginCustomMarkerDrag(event, placeId, point.categoryKey);
              }}
            >
              <AmenityIcon amenityKey={point.categoryKey} />
            </button>
          ))
        : null}

      {editMode && mapPickScreen ? (
        <button
          type="button"
          className="amenity-map-pin-remove"
          style={{ left: mapPickScreen.x, top: mapPickScreen.y }}
          onClick={removePickedFromMap}
          aria-label={`Remove ${mapPickScreen.name} from the map`}
          title="Remove from map"
        >
          ×
        </button>
      ) : null}

      {placingCustom && placeGhost ? (
        <div
          className="amenity-map-place-ghost"
          style={{ left: placeGhost.x, top: placeGhost.y }}
          aria-hidden
        >
          <span className="amenity-map-place-ghost-tip">Click to place</span>
          <span className="amenity-map-place-ghost-pin">
            <AmenityIcon amenityKey={activeEditorCategoryKey} />
          </span>
        </div>
      ) : null}

      <a
        className="amenity-map-brand"
        href={COMMUNITY_VIEW_HOME}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Community View home (opens in new tab)"
      >
        <img src={COMMUNITY_VIEW_LOGO_SRC} alt="Community View" />
      </a>

      <div className="amenity-map-rail">
        {showAgentCard ? <AmenityAgentCard meta={meta} compact={editMode} /> : null}

        <aside
          ref={panelBodyRef}
          className={`amenity-map-panel${editMode ? '' : ' amenity-map-panel--viewer'}`}
        >
          <header className="amenity-map-panel-header">
            {editMode ? (
              <span className="amenity-map-eyebrow">
                {fromNeighborhood ? 'Shared amenities · neighborhood map' : 'Amenity map editor'}
              </span>
            ) : null}
            <h1>{meta.title}</h1>
            {meta.description ? <p>{meta.description}</p> : null}
            {editLocked ? (
              <div className="amenity-map-edit-lock" role="status">
                <p>
                  {user
                    ? 'Only the map owner can edit this amenity map.'
                    : 'Sign in as the map owner to edit amenities.'}
                </p>
                {!user ? (
                  <a
                    className="amenity-map-save"
                    href={`/login?returnTo=${encodeURIComponent(
                      `${location.pathname}${location.search}`
                    )}`}
                  >
                    Sign in to edit
                  </a>
                ) : (
                  <a className="amenity-map-preview-link" href={`/amenities/${shareToken}`}>
                    View amenity map
                  </a>
                )}
              </div>
            ) : null}
            {editMode ? (
              <div className="amenity-map-edit-actions amenity-map-edit-actions--stack">
                <button
                  type="button"
                  className="amenity-map-save"
                  onClick={saveMap}
                  disabled={demoMode || saveState === 'saving' || saveState === 'building' || pdfBusy}
                >
                  {saveState === 'saving'
                    ? 'Saving…'
                    : saveState === 'saved'
                      ? 'Saved'
                      : 'Save map'}
                </button>
                {GUEST_EDIT_TOGGLE_ENABLED && amenityEditAccess?.viewerIsOwner ? (
                  <label className="amenity-map-guest-edit">
                    <input
                      type="checkbox"
                      checked={guestEditEnabled}
                      onChange={(e) => setGuestEditEnabled(e.target.checked)}
                    />
                    <span>
                      Allow editing without signing in
                      <small>For sales / try-it links. Save to apply.</small>
                    </span>
                  </label>
                ) : guestEditEnabled ? (
                  <p className="amenity-map-guest-edit-note">Guest editing is on for this map.</p>
                ) : null}
                <a
                  className="amenity-map-preview-link"
                  href={`/amenities/${shareToken}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  View client map
                </a>
                <button
                  type="button"
                  className={`amenity-map-pdf-toggle${pdfPanelOpen ? ' is-open' : ''}`}
                  onClick={() => setPdfPanelOpen((open) => !open)}
                  aria-expanded={pdfPanelOpen}
                  disabled={pdfBusy}
                >
                  {pdfPanelOpen ? 'Hide neighborhood PDF' : 'Generate as neighborhood PDF'}
                </button>
              </div>
            ) : null}
            {editMode && pdfPanelOpen ? (
              <div className="amenity-map-pdf-block">
                <p className="amenity-map-pdf-title">Neighborhood PDF</p>
                <div className="amenity-map-framing" role="group" aria-label="Map framing">
                  <button
                    type="button"
                    className={`amenity-map-framing-btn${pdfFramingMode === 'auto' ? ' is-active' : ''}`}
                    onClick={() => setPdfFramingMode('auto')}
                    disabled={pdfBusy}
                  >
                    Auto frame
                  </button>
                  <button
                    type="button"
                    className={`amenity-map-framing-btn${pdfFramingMode === 'custom' ? ' is-active' : ''}`}
                    onClick={() => setPdfFramingMode('custom')}
                    disabled={pdfBusy}
                  >
                    Custom frame
                  </button>
                </div>
                <p className="amenity-map-pdf-help">
                  {pdfFramingMode === 'custom'
                    ? 'Pan and zoom the map to the frame you want, then generate.'
                    : 'Fits the home pin and selected amenities automatically.'}
                </p>
                <button
                  type="button"
                  className="amenity-map-pdf-generate"
                  onClick={() => void generateNeighborhoodPdf()}
                  disabled={demoMode || pdfBusy || saveState === 'saving'}
                >
                  {pdfBusy ? 'Generating PDF…' : 'Generate PDF'}
                </button>
                {pdfStatus ? <p className="amenity-map-pdf-status">{pdfStatus}</p> : null}
                {pdfError ? <p className="amenity-map-error">{pdfError}</p> : null}
                {pdfAssets?.pdfUrl ? (
                  <div className="amenity-map-pdf-ready">
                    <button
                      type="button"
                      className="amenity-map-preview-link amenity-map-pdf-link"
                      onClick={() => window.open(pdfAssets.pdfUrl, '_blank', 'noopener,noreferrer')}
                    >
                      Open PDF
                    </button>
                    {pdfAssets.pngUrl ? (
                      <button
                        type="button"
                        className="amenity-map-preview-link amenity-map-pdf-link"
                        onClick={() => window.open(pdfAssets.pngUrl, '_blank', 'noopener,noreferrer')}
                      >
                        Open PNG
                      </button>
                    ) : null}
                  </div>
                ) : null}
              </div>
            ) : null}
            {saveError ? <p className="amenity-map-error">{saveError}</p> : null}
          </header>

          <div className="amenity-map-panel-body">
            {!editMode && activeFeature ? (
              <AmenityDetail feature={activeFeature} onClose={() => setActiveFeature(null)} />
            ) : null}

            <div className="amenity-map-categories">
          {editMode && choosingAmenity ? (
            <div className="amenity-map-editor-step">
              <button
                type="button"
                className="amenity-map-step-back amenity-map-step-back--strong"
                onClick={() => setChoosingAmenity(false)}
              >
                <span aria-hidden>←</span>
                Back
              </button>
              <h2>Choose an amenity</h2>
              <p className="amenity-map-help">Add one category at a time to this map.</p>
              <div className="amenity-map-category-picker">
                {AMENITY_MAP_CATEGORIES.map((category) => (
                  <button
                    type="button"
                    key={category.key}
                    onClick={() => openEditorCategory(category.key)}
                  >
                    <AmenityIcon amenityKey={category.key} />
                    <span className="amenity-map-picker-text">
                      <strong>{category.label}</strong>
                      <small>{enabledSearchKeys.has(category.key) ? 'Edit' : 'Add'}</small>
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ) : editMode && activeEditorCategory ? (
            <div className="amenity-map-editor-step">
              <div className="amenity-map-active-category-row">
                <button
                  type="button"
                  className="amenity-map-step-back amenity-map-step-back--inline"
                  onClick={() => {
                    setActiveEditorCategoryKey(null);
                    setActiveFeature(null);
                    setAddingCustom(false);
                    setPlacingCustom(false);
                    setPlaceGhost(null);
                    setCustomError('');
                  }}
                  aria-label="Back to all amenities"
                  title="All amenities"
                >
                  ←
                </button>
                <div className="amenity-map-active-category-title">
                  <AmenityIcon amenityKey={activeEditorCategory.key} />
                  <h2>{activeEditorCategory.label}</h2>
                </div>
              </div>
              <div className="amenity-map-radius-control">
                <div className="amenity-map-radius-heading">
                  <label htmlFor={`amenity-radius-${activeEditorCategory.key}`}>
                    Choose your radius
                  </label>
                  <strong>
                    {amenityRadiusMetersToMiles(radiusByKey[activeEditorCategory.key])} mi
                  </strong>
                </div>
                <input
                  id={`amenity-radius-${activeEditorCategory.key}`}
                  type="range"
                  min="0.5"
                  max="25"
                  step="0.5"
                  value={amenityRadiusMetersToMiles(radiusByKey[activeEditorCategory.key])}
                  onChange={(event) =>
                    updateRadius(activeEditorCategory.key, event.target.value)
                  }
                />
                <div className="amenity-map-radius-scale" aria-hidden>
                  <span>0.5 mi</span>
                  <span>25 mi</span>
                </div>
              </div>
              <button
                type="button"
                className="amenity-map-search-btn"
                onClick={() =>
                  runCategorySearch(activeEditorCategory.key, { autoSelect: 5 })
                }
                disabled={activeEditorSearchState.status === 'loading'}
              >
                {activeEditorSearchState.status === 'loading'
                  ? `Searching for ${activeEditorCategory.label.toLowerCase()}…`
                  : activeEditorFeatures.some((f) => f?.properties?.isCustom !== true)
                    ? 'Search this radius again'
                    : `Search for ${activeEditorCategory.label}`}
              </button>
              <p className="amenity-map-search-note">
                Searching again refreshes Google results for this radius. Custom places you added
                stay, and places you already selected stay selected when they still appear. New
                finds start unchecked.
              </p>
              <AmenityNamedPlaceAdd
                key={activeEditorCategory.key}
                category={activeEditorCategory}
                center={namedAddCenter}
                radiusMeters={radiusByKey[activeEditorCategory.key]}
                existingPlaceIds={namedAddPlaceIds}
                onAddPlace={addNamedGooglePlace}
              />
              {activeEditorSearchState.error ? (
                <p className="amenity-map-error">{activeEditorSearchState.error}</p>
              ) : null}

              <div className="amenity-map-results-heading">
                <h3>Choose places to show</h3>
                <span>
                  {activeEditorFeatures.filter(visibleFeature).length} of{' '}
                  {activeEditorFeatures.length}
                </span>
              </div>
              <div className="amenity-map-results-actions">
                <button
                  type="button"
                  onClick={() => setAllPlacesVisible(activeEditorCategory.key, true)}
                  disabled={!activeEditorFeatures.length}
                >
                  Select all
                </button>
                <button
                  type="button"
                  onClick={() => setAllPlacesVisible(activeEditorCategory.key, false)}
                  disabled={!activeEditorFeatures.length}
                >
                  Clear
                </button>
                <button
                  type="button"
                  className={`amenity-map-add-custom-btn${placingCustom ? ' is-open' : ''}`}
                  onClick={placingCustom ? cancelPlacingCustom : startPlacingCustom}
                  title={
                    placingCustom
                      ? 'Cancel placing'
                      : 'Click, then click the map to place a custom amenity'
                  }
                >
                  {placingCustom ? 'Cancel' : 'Add custom'}
                </button>
              </div>
              {placingCustom ? (
                <p className="amenity-map-search-note">
                  Move the cursor, then click the map to place. Press Esc or Cancel to stop.
                </p>
              ) : null}

              {addingCustom ? (
                <div className="amenity-map-custom-form">
                  <p className="amenity-map-custom-lead">
                    Edit this custom place. Drag its pin on the map to move it.
                  </p>
                  <label className="amenity-map-custom-field">
                    Name
                    <input
                      type="text"
                      value={customDraft.name}
                      onChange={(e) =>
                        setCustomDraft((d) => ({ ...d, name: e.target.value }))
                      }
                      placeholder="e.g. Riverside Trailhead"
                      autoFocus
                    />
                  </label>
                  <label className="amenity-map-custom-field">
                    Address <span>(optional)</span>
                    <input
                      type="text"
                      value={customDraft.address}
                      onChange={(e) =>
                        setCustomDraft((d) => ({ ...d, address: e.target.value }))
                      }
                      placeholder="Street or short note"
                    />
                  </label>
                  {customError ? <p className="amenity-map-error">{customError}</p> : null}
                  <div className="amenity-map-custom-actions">
                    <button
                      type="button"
                      className="amenity-map-custom-save"
                      onClick={saveCustomDraft}
                    >
                      Save place
                    </button>
                    <button
                      type="button"
                      className="amenity-map-custom-cancel"
                      onClick={() => {
                        setAddingCustom(false);
                        setCustomError('');
                      }}
                    >
                      Done
                    </button>
                    {customDraft.placeId ? (
                      <button
                        type="button"
                        className="amenity-map-custom-delete"
                        onClick={() =>
                          deleteCustomPlace(
                            customDraft.placeId,
                            customDraft.categoryKey || activeEditorCategory.key
                          )
                        }
                      >
                        Delete
                      </button>
                    ) : null}
                  </div>
                </div>
              ) : null}

              {activeEditorFeatures.length ? (
                <ul className="amenity-map-result-list">
                  {activeEditorFeatures.map((feature) => {
                    const p = feature.properties || {};
                    const key = amenityFeatureKey(feature);
                    const selected = visibleFeature(feature);
                    return (
                      <li
                        key={key}
                        className={selected ? 'is-selected' : ''}
                        onMouseEnter={() => setHoveredKey(key)}
                        onMouseLeave={() => setHoveredKey(null)}
                      >
                        <label>
                          <input
                            type="checkbox"
                            checked={selected}
                            onChange={() => togglePlace(activeEditorCategory.key, key)}
                          />
                          <AmenityIcon amenityKey={activeEditorCategory.key} />
                          <span className="amenity-map-result-text">
                            <strong>
                              {p.name}
                              {p.isCustom ? (
                                <span className="amenity-map-custom-badge">Custom</span>
                              ) : null}
                            </strong>
                            <AmenityRating properties={p} />
                            <small>
                              {[p.distanceText, featureAddress(feature)]
                                .filter(Boolean)
                                .join(' · ')}
                            </small>
                          </span>
                        </label>
                        {p.isCustom ? (
                          <button
                            type="button"
                            className="amenity-map-result-delete"
                            onClick={() =>
                              deleteCustomPlace(
                                String(p.placeId || key),
                                String(p.amenityKey || activeEditorCategory.key)
                              )
                            }
                            aria-label={`Delete ${p.name || 'custom place'}`}
                            title="Delete"
                          >
                            ×
                          </button>
                        ) : null}
                        <button
                          type="button"
                          className="amenity-map-result-details"
                          onClick={() =>
                            p.isCustom
                              ? openCustomEditor(feature)
                              : setMapPickFeature(feature)
                          }
                          aria-label={`${p.isCustom ? 'Edit' : 'Select'} ${p.name || 'this place'}`}
                        >
                          {p.isCustom ? 'Edit' : 'Select'}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="amenity-map-empty-results">
                  Search for nearby places, or click Add custom and click the map to place one.
                </p>
              )}
            </div>
          ) : editMode ? (
            <div className="amenity-map-editor-home">
              <button
                type="button"
                className="amenity-map-add-btn"
                onClick={() => {
                  setPdfPanelOpen(false);
                  setChoosingAmenity(true);
                }}
              >
                <span aria-hidden>＋</span>
                Add Amenity
              </button>
              <p className="amenity-map-help">
                Add a category, choose its search radius, then select the places you want to show.
              </p>
              {addedEditorCategories.length ? (
                <div className="amenity-map-added-categories">
                  <h2>Your amenities</h2>
                  {addedEditorCategories.map((category) => {
                    const features = Array.isArray(entries[category.key]?.features)
                      ? entries[category.key].features
                      : [];
                    return (
                      <button
                        type="button"
                        key={category.key}
                        onClick={() => openEditorCategory(category.key)}
                      >
                        <AmenityIcon amenityKey={category.key} />
                        <span className="amenity-map-added-text">
                          <strong>{category.label}</strong>
                          <small>
                            {features.length
                              ? `${features.filter(visibleFeature).length} selected`
                              : 'Choose radius and search'}
                          </small>
                        </span>
                        <span className="amenity-map-added-chevron" aria-hidden>
                          ›
                        </span>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="amenity-map-empty-state">
                  <strong>No amenities added yet</strong>
                  <span>Your categories will appear here.</span>
                </div>
              )}
              <div className="amenity-map-toggle-list amenity-map-toggle-list--editor">
                {homeToggle}
                <p className="amenity-map-home-drag-hint">
                  The pin sits on the property boundary. Drag it if you want to fine-tune the spot,
                  then save.
                </p>
              </div>
              <button
                type="button"
                className="amenity-map-auto-build-btn"
                onClick={autoBuild}
                disabled={saveState === 'building'}
              >
                {saveState === 'building' ? 'Building all amenities…' : 'Or auto-build · 5 each'}
              </button>
            </div>
          ) : (
            <div className="amenity-map-layer-list">
              {homeToggle}
              {viewerCategories.map(({ category, features, selectedCount }) => {
                const expanded = expandedCategoryKeys.has(category.key);
                return (
                  <div className="amenity-map-layer-group" key={category.key}>
                    <div className="amenity-map-layer-row">
                      <button
                        type="button"
                        className="amenity-map-layer-head"
                        aria-expanded={expanded}
                        onClick={() => toggleSetKey(setExpandedCategoryKeys, category.key)}
                      >
                        <span className="amenity-map-layer-caret" aria-hidden>
                          {expanded ? '−' : '+'}
                        </span>
                        <AmenityIcon amenityKey={category.key} />
                        <span className="amenity-map-layer-name">{category.label}</span>
                        <span className="amenity-map-layer-count">{selectedCount}</span>
                      </button>
                      <AmenitySwitch
                        checked={visibleCategoryKeys.has(category.key)}
                        onChange={() => toggleSetKey(setVisibleCategoryKeys, category.key)}
                        label={`Show ${category.label}`}
                      />
                    </div>
                    {expanded ? (
                      <ul className="amenity-map-result-list is-viewer">
                        {features.map((feature) => {
                          const p = feature.properties || {};
                          const key = amenityFeatureKey(feature);
                          return (
                            <li
                              key={key}
                              onMouseEnter={() => setHoveredKey(key)}
                              onMouseLeave={() => setHoveredKey(null)}
                            >
                              <button
                                type="button"
                                onClick={() => showFeatureDetail(feature)}
                              >
                                <span className="amenity-map-result-text">
                                  <strong>{p.name}</strong>
                                  <AmenityRating properties={p} />
                                  <small>{p.distanceText || featureAddress(feature)}</small>
                                </span>
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
