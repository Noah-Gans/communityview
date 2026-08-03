import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import { Link, useLocation, useParams } from 'react-router-dom';
import { useMapContext } from '../MapContext';
import MapLoadingOverlay from '../../components/loading/MapLoadingOverlay';
import { mapService } from '../../services/mapService';
import { buildTourNearbyCacheForSave } from '../../utils/tourNearbyFirestore';
import { getTourNearbySearchCenter } from '../../utils/propertyTourSlides';
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
  updateTourEditRadiusGeometry,
} from '../../utils/tourBuilderMapLayers';
import {
  AMENITY_HOME_LOGO_URL,
  amenityBadgeImageId,
  amenityBadgeUrl,
  amenityHasBadge,
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
/** Amenity maps always use Satellite — matches share/print defaults and avoids a Discover flash. */
const AMENITY_BASEMAP_ID = 'satellite-streets-v12';

const SOURCE_ID = 'cv-amenity-map-source';
const POINT_LAYER_ID = 'cv-amenity-map-points';
const BADGE_LAYER_ID = 'cv-amenity-map-badges';
const LABEL_LAYER_ID = 'cv-amenity-map-labels';
const HOME_MARKER_SIZE_PX = 34;

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
    ['fire_station', 'San Francisco Fire Station 10', -122.4453, 37.7846, '655 Presidio Ave, San Francisco', '0.8 mi'],
    ['fire_station', 'San Francisco Fire Station 16', -122.431, 37.7995, '2251 Greenwich St, San Francisco', '1.0 mi'],
    ['police_station', 'Northern Police Station', -122.4274, 37.7802, '1125 Fillmore St, San Francisco', '1.4 mi'],
    ['police_station', 'Richmond Police Station', -122.4664, 37.7801, '461 6th Ave, San Francisco', '1.8 mi'],
    ['library', 'Presidio Branch Library', -122.4443, 37.7881, '3150 Sacramento St, San Francisco', '0.5 mi'],
    ['library', 'Marina Branch Library', -122.4351, 37.8002, '1890 Chestnut St, San Francisco', '0.8 mi'],
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

function amenityRating(properties) {
  const rating = Number(properties?.rating);
  if (!Number.isFinite(rating) || rating <= 0) return null;
  const count = Number(properties?.user_ratings_total ?? properties?.userRatingCount);
  return {
    rating: Math.min(5, rating),
    count: Number.isFinite(count) && count > 0 ? count : null,
  };
}

function AmenityRating({ properties }) {
  const value = amenityRating(properties);
  if (!value) return null;
  return (
    <span className="amenity-map-rating" aria-label={`${value.rating.toFixed(1)} out of 5 stars`}>
      <span aria-hidden>★</span>
      <strong>{value.rating.toFixed(1)}</strong>
      {value.count != null ? <small>({value.count.toLocaleString()})</small> : null}
    </span>
  );
}

function visibleFeature(feature) {
  const p = feature?.properties || {};
  return p.amenityMapHidden !== true && p.tourHidden !== true;
}

function setFeatureVisible(feature, visible) {
  return {
    ...feature,
    properties: {
      ...(feature?.properties || {}),
      amenityMapHidden: !visible,
      tourHidden: !visible,
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
 * Where the home badge sits. The amenity search center is only the camera the agent
 * happened to save, so prefer the property's own geometry: an explicit Main Home icon,
 * then the property boundary centroid (same rule the tour measures distances from).
 */
function getHomeMarkerPosition(data, map) {
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

function sourceFeature(feature, hoveredKey) {
  const properties = feature?.properties || {};
  const category = AMENITY_MAP_CATEGORY_BY_KEY[properties.amenityKey] || {};
  const key = amenityFeatureKey(feature);
  const hasBadge = amenityHasBadge(properties.amenityKey);
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
  const editMode = new URLSearchParams(location.search).get('edit') === '1';
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
    setCurrentBasemapId,
    setShareViewerReadOnly,
  } = useMapContext();

  const [mapData, setMapData] = useState(null);
  const [meta, setMeta] = useState({ title: 'Neighborhood amenities', description: '' });
  const [entries, setEntries] = useState({});
  const [enabledSearchKeys, setEnabledSearchKeys] = useState(
    () => new Set(editMode ? [] : AMENITY_MAP_CATEGORIES.map(({ key }) => key))
  );
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
  const [hoveredKey, setHoveredKey] = useState(null);
  const [activeFeature, setActiveFeature] = useState(null);
  const [activeEditorCategoryKey, setActiveEditorCategoryKey] = useState(null);
  const [choosingAmenity, setChoosingAmenity] = useState(false);
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
  const homeDragRef = useRef(null);
  const homeMarkerRef = useRef(null);
  const panelBodyRef = useRef(null);

  const allFeatures = useMemo(
    () =>
      AMENITY_MAP_CATEGORIES.flatMap(({ key }) =>
        Array.isArray(entries[key]?.features) ? entries[key].features : []
      ),
    [entries]
  );

  const savedFeatures = useMemo(
    () =>
      allFeatures.filter(
        (feature) =>
          visibleFeature(feature) &&
          (editMode ? enabledSearchKeys : visibleCategoryKeys).has(
            feature?.properties?.amenityKey
          )
      ),
    [allFeatures, editMode, enabledSearchKeys, visibleCategoryKeys]
  );

  const geojson = useMemo(
    () => ({
      type: 'FeatureCollection',
      features: savedFeatures.map((feature) => sourceFeature(feature, hoveredKey)),
    }),
    [savedFeatures, hoveredKey]
  );

  useEffect(() => {
    document.documentElement.classList.add('shared-public-map', 'amenity-map-mode');
    setShareViewerReadOnly(true);
    return () => {
      document.documentElement.classList.remove('shared-public-map', 'amenity-map-mode');
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
        const data =
          process.env.NODE_ENV === 'development' && shareToken === 'demo'
            ? buildDemoMapData()
            : await mapService.getSharedMapByToken(shareToken);
        if (cancelled) return;
        setMapData(data);
        setHomePosition(getHomeMarkerPosition(data, mapRef?.current));
        setMeta({
          title: data.title || 'Neighborhood amenities',
          description: data.description || '',
          ...buildSharedMapAgentMeta(data),
        });
        const loadedEntries = data.tourNearbyCache?.byAmenity || {};
        setEntries(loadedEntries);
        const populatedKeys = AMENITY_MAP_CATEGORIES.filter(
          ({ key }) => Array.isArray(loadedEntries[key]?.features) && loadedEntries[key].features.length
        ).map(({ key }) => key);
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

        setPrintElements(Array.isArray(data.printElements) ? data.printElements : []);
        setLayerStatus(data.layers?.status || {});
        setLayerOrder(data.layers?.order || []);
        setPaperSize(data.printSettings?.paperSize || 'full');
        setIsPrinting(true);
        setActivePrintTool('select');
        setSelectedPrintElement(null);
        setCurrentBasemapId(AMENITY_BASEMAP_ID);

        const map = await waitForMap(mapRef);
        if (!map || cancelled) return;
        mapService.loadMapState(
          data,
          { setLayerStatus, setLayerOrder, setPaperSize, setPrintElements, setCurrentBasemapId },
          mapRef
        );
        // Keep Satellite selected even if the saved map was streets/discover.
        setCurrentBasemapId(AMENITY_BASEMAP_ID);

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
                applyBasemap(AMENITY_BASEMAP_ID, finish);
              } catch (_) {
                finish();
              }
            };
            if (map.isStyleLoaded?.()) apply();
            else map.once('idle', apply);
            // Don't block forever if Mapbox never calls onReady.
            window.setTimeout(finish, 4000);
          });
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
  ]);

  useEffect(() => {
    const map = mapRef?.current;
    if (!map || loading || error) return undefined;
    amenityMapInstanceRef.current = map;
    let cancelled = false;
    let applying = false;

    const apply = async () => {
      if (cancelled || applying || !map.isStyleLoaded?.()) return;
      applying = true;
      try {
        await loadAmenityMapIcons(map);
        if (cancelled) return;
        ensureAmenityLayers(map, geojson);
        setMapRevealReady(true);
      } finally {
        applying = false;
      }
    };

    // Basemap swaps drop custom sources, so re-add them whenever the style settles.
    const onIdle = () => {
      if (map.getLayer(BADGE_LAYER_ID) && map.getSource(SOURCE_ID)) return;
      void apply();
    };

    void apply();
    map.on('idle', onIdle);
    return () => {
      cancelled = true;
      map.off('idle', onIdle);
    };
  }, [mapRef, geojson, loading, error]);

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
      if (rating) {
        const ratingNode = document.createElement('span');
        ratingNode.className = 'amenity-map-rating';
        ratingNode.setAttribute('aria-label', `${rating.rating.toFixed(1)} out of 5 stars`);
        ratingNode.textContent = `★ ${rating.rating.toFixed(1)}${
          rating.count != null ? ` (${rating.count.toLocaleString()})` : ''
        }`;
        node.append(ratingNode);
      }
      const address = featureAddress(feature);
      if (address) {
        const addressNode = document.createElement('small');
        addressNode.textContent = address;
        node.append(addressNode);
      }
      const clickNode = document.createElement('div');
      clickNode.className = 'amenity-map-hover-action';
      clickNode.textContent = 'Click for photo and details';
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
    const onClick = (event) => {
      const feature = event.features?.[0];
      if (!feature) return;
      const key = String(feature.properties?.amenityMapKey || '');
      const original = allFeatures.find((candidate) => amenityFeatureKey(candidate) === key);
      const selected = original || feature;
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

    const interactiveLayerIds = [POINT_LAYER_ID, BADGE_LAYER_ID];
    let bound = false;
    const bind = () => {
      if (bound || !interactiveLayerIds.every((id) => map.getLayer(id))) return;
      interactiveLayerIds.forEach((id) => {
        map.on('mouseenter', id, onEnter);
        map.on('mousemove', id, onMove);
        map.on('mouseleave', id, onLeave);
        map.on('click', id, onClick);
      });
      bound = true;
    };
    bind();
    if (!bound) map.on('idle', bind);
    return () => {
      map.off('idle', bind);
      if (bound) {
        interactiveLayerIds.forEach((id) => {
          map.off('mouseenter', id, onEnter);
          map.off('mousemove', id, onMove);
          map.off('mouseleave', id, onLeave);
          map.off('click', id, onClick);
        });
      }
    };
  }, [allFeatures, error, loading, mapRef]);

  const homeMarkerReady = Boolean(showHomeMarker && homeScreenPoint);

  // Editor-only: drag the HTML home pin so it can sit on the actual property.
  useEffect(() => {
    const map = mapRef?.current;
    const marker = homeMarkerRef.current;
    if (!map || !marker || !editMode || loading || error || !homeMarkerReady) return undefined;

    const finishDrag = (event) => {
      const drag = homeDragRef.current;
      if (!drag) return;
      homeDragRef.current = null;
      map.dragPan.enable();
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', finishDrag);
      window.removeEventListener('pointercancel', finishDrag);
      const clientX = event?.clientX ?? drag.screen?.x;
      const clientY = event?.clientY ?? drag.screen?.y;
      if (!Number.isFinite(clientX) || !Number.isFinite(clientY)) return;
      const canvas = map.getCanvas?.();
      const rect = canvas?.getBoundingClientRect?.();
      if (!rect) return;
      const lngLat = map.unproject([clientX - rect.left, clientY - rect.top]);
      if (!lngLat) return;
      setHomePosition({ lat: lngLat.lat, lng: lngLat.lng });
    };

    const onPointerMove = (event) => {
      const drag = homeDragRef.current;
      if (!drag) return;
      drag.screen = { x: event.clientX, y: event.clientY };
      setHomeScreenPoint(drag.screen);
    };

    const onPointerDown = (event) => {
      if (event.button != null && event.button !== 0) return;
      event.preventDefault();
      event.stopPropagation();
      homeDragRef.current = {
        screen: { x: event.clientX, y: event.clientY },
      };
      map.dragPan.disable();
      popupRef.current?.remove?.();
      popupRef.current = null;
      window.addEventListener('pointermove', onPointerMove);
      window.addEventListener('pointerup', finishDrag);
      window.addEventListener('pointercancel', finishDrag);
    };

    marker.addEventListener('pointerdown', onPointerDown);
    return () => {
      marker.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', finishDrag);
      window.removeEventListener('pointercancel', finishDrag);
      if (homeDragRef.current) {
        homeDragRef.current = null;
        map.dragPan.enable();
      }
    };
  }, [editMode, error, homeMarkerReady, loading, mapRef]);

  // Fit the shared map so home + amenities clear the left rail and top-right brand.
  useEffect(() => {
    const map = mapRef?.current;
    if (!map || didInitialFitRef.current || loading || error || !mapRevealReady) return;

    let cancelled = false;
    const run = () => {
      if (cancelled || didInitialFitRef.current) return;
      const bounds = new mapboxgl.LngLatBounds();
      savedFeatures.forEach((feature) => {
        const coords = feature?.geometry?.coordinates;
        if (Array.isArray(coords) && coords.length >= 2) bounds.extend(coords);
      });
      if (
        homePosition &&
        Number.isFinite(homePosition.lat) &&
        Number.isFinite(homePosition.lng)
      ) {
        bounds.extend([homePosition.lng, homePosition.lat]);
      }
      if (bounds.isEmpty()) return;

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
        // Bottom sheet only (no agent card) — leave the map above it fully usable.
        const railTop = railRect?.top;
        const railReady =
          Number.isFinite(railTop) &&
          railRect.height > 40 &&
          railTop < window.innerHeight - 24;
        if (!railReady) return;
        bottom = Math.max(
          edge + gap,
          Math.min(
            Math.round(window.innerHeight - railTop + gap),
            Math.round(window.innerHeight * 0.52)
          )
        );
        left = Math.max(left, 20);
        right = Math.max(right, 20);
        if (brandRect) {
          top = Math.max(top, Math.round(brandRect.bottom + gap));
        } else {
          top = Math.max(top, 56);
        }
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

      // Mapbox rejects fitBounds when padding eats the whole viewport.
      const padBudget = Math.min(window.innerWidth, window.innerHeight);
      if (left + right >= padBudget - 40) {
        left = Math.min(left, 24);
        right = Math.min(right, 24);
      }
      if (top + bottom >= padBudget - 40) {
        top = Math.min(top, 56);
        bottom = Math.min(bottom, Math.round(window.innerHeight * 0.42));
      }

      didInitialFitRef.current = true;
      try {
        map.fitBounds(bounds, {
          padding: { top, right, bottom, left },
          maxZoom: narrow ? 15.2 : 15.5,
          duration: 0,
        });
      } catch (_) {
        didInitialFitRef.current = false;
      }
    };

    // Wait for the bottom sheet / brand to finish layout before measuring padding.
    const frame = window.requestAnimationFrame(() => {
      window.requestAnimationFrame(run);
    });
    const retries = [120, 280, 600].map((ms) => window.setTimeout(run, ms));
    return () => {
      cancelled = true;
      window.cancelAnimationFrame(frame);
      retries.forEach((id) => window.clearTimeout(id));
    };
  }, [error, homePosition, loading, mapRef, mapRevealReady, savedFeatures]);

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
    return () => hideTourEditRadiusCircle(map);
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
      updateTourEditRadiusGeometry(map, center, radiusMeters);
    }
  }, [activeEditorCategoryKey, mapData, mapRef]);

  const openEditorCategory = useCallback((key) => {
    setEnabledSearchKeys((previous) => new Set([...previous, key]));
    setActiveEditorCategoryKey(key);
    setChoosingAmenity(false);
    setActiveFeature(null);
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
          preferBrowser: false,
        });
        const features = (result?.features || []).map((feature, index) =>
          setFeatureVisible(feature, index < autoSelect)
        );
        setEntries((previous) => ({
          ...previous,
          [key]: {
            type: 'FeatureCollection',
            features,
            fetched: true,
            searchRadiusMeters: radiusMeters,
          },
        }));
        setVisibleCategoryKeys((previous) => new Set([...previous, key]));
        setSearchState((previous) => ({
          ...previous,
          [key]: { status: 'success', error: '', count: features.length },
        }));
        return features;
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

  const saveMap = useCallback(async () => {
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
      const keys = AMENITY_MAP_CATEGORIES.map(({ key }) => key).filter(
        (key) => enabledSearchKeys.has(key) && entries[key]?.fetched
      );
      const maxRadius = Math.max(500, ...keys.map((key) => Number(radiusByKey[key]) || 0));
      const selectedEntries = Object.fromEntries(keys.map((key) => [key, entries[key]]));
      const payload = buildTourNearbyCacheForSave(center, selectedEntries, maxRadius, keys, {
        replace: true,
        allowEmpty: true,
        homeMarker: homePosition || center,
      });
      await mapService.saveTourNearbyCache(shareToken, payload);
      setSaveState('saved');
      window.setTimeout(() => setSaveState('idle'), 1800);
    } catch (err) {
      setSaveState('error');
      setSaveError(err?.message || 'Could not save this amenity map.');
    }
  }, [demoMode, enabledSearchKeys, entries, homePosition, mapData, mapRef, radiusByKey, shareToken]);

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

  if (loading || !mapRevealReady) {
    return (
      <MapLoadingOverlay
        phraseSet="amenities"
        mapTitle={meta.title}
        className="map-loading-overlay--opaque"
      />
    );
  }
  if (error) {
    return (
      <div className="amenity-map-loading amenity-map-loading--error">
        <h2>We couldn’t open this map</h2>
        <p>{error}</p>
      </div>
    );
  }

  const activeEditorCategory = activeEditorCategoryKey
    ? AMENITY_MAP_CATEGORY_BY_KEY[activeEditorCategoryKey]
    : null;
  const activeEditorEntry = activeEditorCategoryKey ? entries[activeEditorCategoryKey] : null;
  const activeEditorFeatures = Array.isArray(activeEditorEntry?.features)
    ? activeEditorEntry.features
    : [];
  const activeEditorSearchState = activeEditorCategoryKey
    ? searchState[activeEditorCategoryKey] || {}
    : {};
  const addedEditorCategories = AMENITY_MAP_CATEGORIES.filter(({ key }) =>
    enabledSearchKeys.has(key)
  );

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
      {showHomeMarker && homeScreenPoint ? (
        <button
          ref={homeMarkerRef}
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
        >
          <img src={AMENITY_HOME_LOGO_URL} alt="" aria-hidden />
        </button>
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

        <aside className={`amenity-map-panel${editMode ? '' : ' amenity-map-panel--viewer'}`}>
          <header className="amenity-map-panel-header">
            {editMode ? <span className="amenity-map-eyebrow">Amenity map editor</span> : null}
            <h1>{meta.title}</h1>
            {meta.description ? <p>{meta.description}</p> : null}
            {editMode ? (
              <div className="amenity-map-edit-actions">
                <button
                  type="button"
                  className="amenity-map-save"
                  onClick={saveMap}
                  disabled={demoMode || saveState === 'saving' || saveState === 'building'}
                >
                  {saveState === 'saving'
                    ? 'Saving…'
                    : saveState === 'saved'
                      ? 'Saved'
                      : 'Save map'}
                </button>
                <Link className="amenity-map-preview-link" to={`/amenities/${shareToken}`}>
                  View client map
                </Link>
              </div>
            ) : null}
            {saveError ? <p className="amenity-map-error">{saveError}</p> : null}
          </header>

          <div className="amenity-map-panel-body" ref={panelBodyRef}>
            {activeFeature ? (
              <AmenityDetail feature={activeFeature} onClose={() => setActiveFeature(null)} />
            ) : null}

            <div className="amenity-map-categories">
          {editMode && choosingAmenity ? (
            <div className="amenity-map-editor-step">
              <button
                type="button"
                className="amenity-map-step-back"
                onClick={() => setChoosingAmenity(false)}
              >
                ← Back
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
              <button
                type="button"
                className="amenity-map-step-back"
                onClick={() => {
                  setActiveEditorCategoryKey(null);
                  setActiveFeature(null);
                }}
              >
                ← All amenities
              </button>
              <div className="amenity-map-active-category-title">
                <AmenityIcon amenityKey={activeEditorCategory.key} />
                <h2>{activeEditorCategory.label}</h2>
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
                  : activeEditorFeatures.length
                    ? 'Search this radius again'
                    : `Search for ${activeEditorCategory.label}`}
              </button>
              {activeEditorSearchState.error ? (
                <p className="amenity-map-error">{activeEditorSearchState.error}</p>
              ) : null}
              {activeEditorFeatures.length ? (
                <>
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
                    >
                      Select all
                    </button>
                    <button
                      type="button"
                      onClick={() => setAllPlacesVisible(activeEditorCategory.key, false)}
                    >
                      Clear
                    </button>
                  </div>
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
                              <strong>{p.name}</strong>
                              <AmenityRating properties={p} />
                              <small>
                                {[p.distanceText, featureAddress(feature)]
                                  .filter(Boolean)
                                  .join(' · ')}
                              </small>
                            </span>
                          </label>
                          <button
                            type="button"
                            className="amenity-map-result-details"
                            onClick={() => setActiveFeature(feature)}
                            aria-label={`Details for ${p.name || 'this place'}`}
                          >
                            Details
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </>
              ) : (
                <p className="amenity-map-empty-results">
                  Choose a radius, then search to find nearby places.
                </p>
              )}
            </div>
          ) : editMode ? (
            <div className="amenity-map-editor-home">
              <button
                type="button"
                className="amenity-map-add-btn"
                onClick={() => setChoosingAmenity(true)}
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
