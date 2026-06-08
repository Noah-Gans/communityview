import * as turf from '@turf/turf';
import { getPointIconDefaultStyle } from '../pages/print/pointIconDefaultStyles';
import { getPhotoSrcListFromElement } from './mapPhotoStorage';

/**
 * Property tour: each slide is a distinct map state (camera + optional layer patch).
 * Layer patches merge onto a frozen baseline captured when the tour loads.
 */

export const PROPERTY_TOUR_SLIDES = [
  {
    id: 'welcome',
    title: 'Welcome',
    subtitle: 'Saved map view — start here before moving through the story.',
    /** Keep saved GIS layers but parcels stay off for the whole tour. */
    layerPatch: { ownership: false },
  },
  {
    id: 'context',
    title: 'Around the property',
    subtitle:
      'Esri Imagery in 3D — a slow orbit around the property boundary (other map labels hidden).',
    /** Applied in `applyPropertyTourSlide` via {@link buildTourOrbitLayerPatch} (all GIS layers off). */
    layerPatch: null,
  },
  {
    id: 'bird',
    title: 'Property from above',
    subtitle: 'Top-down framing of the listing area.',
    layerPatch: { ownership: false },
  },
  {
    id: 'perspective',
    title: 'Places & photos',
    subtitle:
      "Bird's-eye: where photos exist we pan from feature to feature and open each picture — main home first, then outbuildings and other spots. You can pan and zoom the map at any time.",
    layerPatch: { ownership: false },
  },
  {
    id: 'vicinity',
    title: "What's nearby",
    subtitle:
      'Each category shows the closest named places (typically within ~8 mi). Markers use the print icon set on a white disc. Click a row in the panel (or Zoom to) to focus the map on a place.',
    /** Applied in `applyPropertyTourSlide` via {@link buildTourOrbitLayerPatch} (boundary + nearby markers only). */
    layerPatch: null,
  },
];

/** Tour slides that show only the property boundary print polygon (not other drawn features). */
export const TOUR_BOUNDARY_ONLY_SLIDE_IDS = new Set(['context', 'vicinity']);

/** Map fit padding (px) — large left value keeps markers clear of the fixed-left amenity panel. */
export const TOUR_VICINITY_LEFT_PANEL_MAP_PAD = 520;

/**
 * Google Places search radius for tour nearby slides (meters).
 * Wide circle — category, quality, and max-distance rules run after results return.
 */
export const TOUR_NEARBY_SEARCH_RADIUS_METERS = 25000;

/** `document.documentElement` attribute while the orbit slide is active (Map.js print overlay). */
export const TOUR_ORBIT_PRINT_FILTER_ATTR = 'data-property-tour-print-filter';
export const TOUR_ORBIT_PRINT_FILTER_VALUE = 'boundary-only';

/** Saved-map polygon with `mapStyleVariant: 'boundary'` or label “Property Boundary”. */
export function isPropertyBoundaryPrintElement(el) {
  return (
    el?.type === 'polygon' &&
    (el?.mapStyleVariant === 'boundary' || el?.label === 'Property Boundary')
  );
}

/**
 * Orbit / nearby slides: turn off parcel/GIS layers so only imagery + the drawn boundary show.
 * @param {Record<string, boolean>} layerBaseline
 */
export function buildTourOrbitLayerPatch(layerBaseline) {
  const patch = {};
  for (const k of Object.keys(layerBaseline || {})) {
    patch[k] = false;
  }
  patch.ownership = false;
  return patch;
}

/**
 * Bounds for orbit camera — property boundary ring only, else full tour bounds.
 * @param {unknown[]} printElements
 * @param {[[number,number],[number,number]]|null|undefined} fallbackBounds
 */
export function getPropertyBoundaryBoundsFromPrintElements(printElements, fallbackBounds) {
  const el = (printElements || []).find(isPropertyBoundaryPrintElement);
  const ring = el?.geometry?.coordinates?.[0];
  if (!Array.isArray(ring) || ring.length < 3) return fallbackBounds ?? null;
  let minLng = Infinity;
  let maxLng = -Infinity;
  let minLat = Infinity;
  let maxLat = -Infinity;
  for (const c of ring) {
    if (!Array.isArray(c) || c.length < 2) continue;
    const lng = Number(c[0]);
    const lat = Number(c[1]);
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) continue;
    minLng = Math.min(minLng, lng);
    maxLng = Math.max(maxLng, lng);
    minLat = Math.min(minLat, lat);
    maxLat = Math.max(maxLat, lat);
  }
  if (![minLng, maxLng, minLat, maxLat].every(Number.isFinite)) return fallbackBounds ?? null;
  return [
    [minLng, minLat],
    [maxLng, maxLat],
  ];
}

/**
 * Point to measure “nearby” distance from — property boundary centroid when available.
 * @param {unknown[]} printElements
 * @param {[[number,number],[number,number]]|null|undefined} tourBounds
 * @param {{ center?: { lat?: number, lng?: number } }|null|undefined} savedViewport
 */
export function getTourNearbySearchCenter(printElements, tourBounds, savedViewport) {
  const boundary = (printElements || []).find(isPropertyBoundaryPrintElement);
  const ring = boundary?.geometry?.coordinates?.[0];
  if (Array.isArray(ring) && ring.length >= 3) {
    try {
      const c = turf.centroid(turf.polygon(boundary.geometry.coordinates));
      const lng = Number(c?.geometry?.coordinates?.[0]);
      const lat = Number(c?.geometry?.coordinates?.[1]);
      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        return { lat, lng };
      }
    } catch (_) {
      /* fall through */
    }
  }

  const west = Number(tourBounds?.[0]?.[0]);
  const south = Number(tourBounds?.[0]?.[1]);
  const east = Number(tourBounds?.[1]?.[0]);
  const north = Number(tourBounds?.[1]?.[1]);
  if ([west, south, east, north].every(Number.isFinite)) {
    return { lat: (south + north) / 2, lng: (west + east) / 2 };
  }

  const c = savedViewport?.center;
  const lat = Number(c?.lat);
  const lng = Number(c?.lng);
  if (Number.isFinite(lat) && Number.isFinite(lng)) {
    return { lat, lng };
  }
  return null;
}

export const TOUR_NEARBY_AMENITY_ORDER = [
  { key: 'parks_rec', label: 'Parks & recreation', icon: '🌲' },
  { key: 'grocery', label: 'Grocery stores', icon: '🛒' },
  { key: 'schools', label: 'Schools', icon: '🎓' },
  { key: 'fitness', label: 'Fitness & gyms', icon: '💪' },
  { key: 'trailheads', label: 'Trailheads', icon: '🥾' },
  { key: 'essentials', label: 'Essentials', icon: '🧰' },
  { key: 'coffee', label: 'Coffee', icon: '☕' },
  { key: 'transit', label: 'Transit', icon: '🚉' },
  { key: 'airport', label: 'Airports', icon: '✈️' },
];

/** Pre-composited PNG markers (whole disc + stroke + glyph) under `/public/tour_nearby_badges/`. */
const TOUR_VICINITY_FULL_BADGE_BASE = '/tour_nearby_badges/';
const TOUR_VICINITY_FULL_BADGE_FILES = {
  parks_rec: 'parks-rec-badge.png',
  grocery: 'grocery-badge.png',
  schools: 'school-badge.png',
  fitness: 'fitness-badge.png',
  essentials: 'essentials-badge.png',
  coffee: 'coffee-badge.png',
  transit: 'transit-badge.png',
  airport: 'airport-badge.png',
};

/**
 * Runtime-composited disc markers (print-catalog SVG + point-icon default colors).
 * @type {Record<string, { logoFile: string, styleKey: string }>}
 */
const TOUR_VICINITY_COMPOSITED_BADGE_AMENITIES = {
  trailheads: { logoFile: 'hiking.svg', styleKey: 'hiking' },
};

/** GeoJSON may use `amenityKey` or legacy `kind` for the tour category id. */
function tourVicinityNearbyAmenityKeyExpr() {
  return ['coalesce', ['get', 'amenityKey'], ['get', 'kind'], ''];
}

function tourVicinityUsesFullBadge(amenityKey) {
  return Boolean(TOUR_VICINITY_FULL_BADGE_FILES[amenityKey]);
}

function tourVicinityUsesCompositedBadge(amenityKey) {
  return Boolean(TOUR_VICINITY_COMPOSITED_BADGE_AMENITIES[amenityKey]);
}

/** Amenities that ship a single map image (no separate white circle layer). */
function tourVicinityNearbyMarkerKeysWithoutCircle() {
  return [
    ...Object.keys(TOUR_VICINITY_FULL_BADGE_FILES),
    ...Object.keys(TOUR_VICINITY_COMPOSITED_BADGE_AMENITIES),
  ];
}

function tourVicinityFullBadgeImageId(amenityKey) {
  return `tour-vicinity-full-badge-${String(amenityKey || '').trim() || 'unknown'}`;
}

async function ensureTourVicinityFullBadgeImage(map, amenityKey) {
  if (!map || typeof map.addImage !== 'function') return false;
  const file = TOUR_VICINITY_FULL_BADGE_FILES[amenityKey];
  if (!file) return false;
  const imageId = tourVicinityFullBadgeImageId(amenityKey);
  if (typeof map.hasImage === 'function' && map.hasImage(imageId)) return true;
  const url = `${TOUR_VICINITY_FULL_BADGE_BASE}${file}`;
  let img;
  try {
    img = await loadImageElement(url);
  } catch (_) {
    return false;
  }
  try {
    if (typeof map.hasImage === 'function' && map.hasImage(imageId)) return true;
    map.addImage(imageId, img, { pixelRatio: 1 });
  } catch (_) {
    return false;
  }
  return true;
}

/** Circle layer is only for legacy glyph-only markers (full/composited badges skip it). */
function tourVicinityNearbyCircleLayerFilter() {
  const keys = tourVicinityNearbyMarkerKeysWithoutCircle();
  if (!keys.length) return ['==', ['geometry-type'], 'Point'];
  const k = tourVicinityNearbyAmenityKeyExpr();
  let guard = ['!=', k, keys[0]];
  for (let i = 1; i < keys.length; i += 1) {
    guard = ['all', guard, ['!=', k, keys[i]]];
  }
  return ['all', ['==', ['geometry-type'], 'Point'], guard];
}

/** Match pre-made `/tour_nearby_badges/*-badge.png` assets (256×256). */
const TOUR_VICINITY_COMPOSITED_BADGE_PX = 256;

/**
 * Brown disc + white ring + white-tinted print logo (matches map-maker `shape_hiking` defaults).
 * @param {string} logoFile — under `/public/logos_for_print`
 * @param {{ fill?: string, stroke?: string, strokeWidth?: number, logoColor?: string }} style
 */
async function buildTourVicinityCompositedBadgeImage(logoFile, style = {}) {
  const fill = style.fill || '#92400e';
  const stroke = style.stroke || '#ffffff';
  const logoColor = style.logoColor || '#ffffff';
  const strokeWidth = Math.max(2, Number(style.strokeWidth) || 3);

  const logoUrl = `${TOUR_VICINITY_PRINT_LOGO_BASE_PATH}/${logoFile}`;
  const logoImg = await loadImageElement(logoUrl);

  const size = TOUR_VICINITY_COMPOSITED_BADGE_PX;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2d unavailable');

  const cx = size / 2;
  const cy = size / 2;
  const outerR = size * 0.46;
  const ringR = Math.max(6, outerR - strokeWidth / 2);

  ctx.beginPath();
  ctx.arc(cx, cy, outerR, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();

  ctx.beginPath();
  ctx.arc(cx, cy, ringR, 0, Math.PI * 2);
  ctx.strokeStyle = stroke;
  ctx.lineWidth = strokeWidth;
  ctx.stroke();

  const iconScale = 0.64;
  const iconSize = size * iconScale;
  const iconX = (size - iconSize) / 2;
  const iconY = (size - iconSize) / 2;

  const tint = document.createElement('canvas');
  tint.width = iconSize;
  tint.height = iconSize;
  const tctx = tint.getContext('2d');
  if (!tctx) throw new Error('Canvas 2d unavailable');
  tctx.drawImage(logoImg, 0, 0, iconSize, iconSize);
  tctx.globalCompositeOperation = 'source-in';
  tctx.fillStyle = logoColor;
  tctx.fillRect(0, 0, iconSize, iconSize);
  ctx.drawImage(tint, iconX, iconY, iconSize, iconSize);

  return loadImageElement(canvas.toDataURL('image/png'));
}

async function ensureTourVicinityCompositedBadgeImage(map, amenityKey) {
  if (!map || typeof map.addImage !== 'function') return false;
  const spec = TOUR_VICINITY_COMPOSITED_BADGE_AMENITIES[amenityKey];
  if (!spec) return false;

  const imageId = tourVicinityLogoImageId(amenityKey);
  if (typeof map.hasImage === 'function' && map.hasImage(imageId)) return true;

  const defaults = getPointIconDefaultStyle(spec.styleKey) || {};
  const style = {
    ...defaults,
    stroke: '#ffffff',
    logoColor: defaults.logoColor || '#ffffff',
  };

  let img;
  try {
    img = await buildTourVicinityCompositedBadgeImage(spec.logoFile, style);
  } catch (_) {
    return false;
  }

  try {
    if (typeof map.hasImage === 'function' && map.hasImage(imageId)) return true;
    map.addImage(imageId, img, { pixelRatio: 1 });
  } catch (_) {
    return false;
  }
  return true;
}

/** Same `/public/logos_for_print` assets used in the print point catalog — filenames only. */
const TOUR_VICINITY_PRINT_LOGO_BASE_PATH = '/logos_for_print';

/** Map each tour amenity key to a print-logo SVG (see `public/logos_for_print`). */
const TOUR_VICINITY_AMENITY_LOGO_FILES = {
  parks_rec: 'table-picnic.svg',
  grocery: 'shopping-cart.png',
  schools: 'school.svg',
  fitness: 'gym.svg',
  trailheads: 'hiking.svg',
  essentials: 'tools.svg',
  coffee: 'mug-hot-alt.svg',
  transit: 'subway.svg',
  airport: 'plane-alt.svg',
};

const TOUR_VICINITY_ICON_FALLBACK_FILE = 'location-pin-parking.svg';
const TOUR_VICINITY_LOGO_IMAGE_ID_FALLBACK = 'tour-vicinity-logo-fallback';
const TOUR_VICINITY_LOGO_IMAGE_PREFIX = 'tour-vicinity-logo-';

/** Same asset as map-maker Main Home (`shape_houseChimney` / `svgMap.houseChimney`). */
const TOUR_VICINITY_MAP_MAKER_MAIN_HOME_FILE = 'house-chimney.svg';
/** Map image id when forcing Main Home for every nearby marker (see {@link tourVicinityNearbyUseMainHomeIconForAll}). */
const TOUR_VICINITY_NEARBY_MAIN_HOME_OVERRIDE_IMAGE_ID = 'tour-vicinity-logo-mapmaker-main-home';

/**
 * When true, every nearby marker except full-badge categories (parks, grocery, schools, fitness, essentials, coffee, transit, airport) uses the Main Home glyph (`house-chimney.svg`).
 * Those categories always use their pre-made full-badge PNGs.
 * Enable with `REACT_APP_TOUR_NEARBY_MAIN_HOME_TEST=1` in `.env`.
 */
function tourVicinityNearbyUseMainHomeIconForAll() {
  try {
    return String(process.env.REACT_APP_TOUR_NEARBY_MAIN_HOME_TEST || '').trim() === '1';
  } catch (_) {
    return false;
  }
}

function tourVicinityLogoImageId(amenityKey) {
  return `${TOUR_VICINITY_LOGO_IMAGE_PREFIX}${String(amenityKey || '').trim() || 'unknown'}`;
}

function loadImageElement(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Image load failed: ${url}`));
    img.src = url;
  });
}

/**
 * Register one raw print logo per amenity (glyph only — white disc is a separate circle layer).
 * Uses `HTMLImageElement` + `addImage`, same assets as the print catalog (`/logos_for_print`).
 */
async function ensureTourVicinityLogoImage(map, amenityKey, filename, imageIdOverride) {
  if (!map || typeof map.addImage !== 'function') return false;
  const imageId = imageIdOverride || tourVicinityLogoImageId(amenityKey);
  if (typeof map.hasImage === 'function' && map.hasImage(imageId)) return true;
  const url = `${TOUR_VICINITY_PRINT_LOGO_BASE_PATH}/${filename}`;
  let img;
  try {
    img = await loadImageElement(url);
  } catch (_) {
    return false;
  }
  try {
    if (typeof map.hasImage === 'function' && map.hasImage(imageId)) return true;
    map.addImage(imageId, img, { pixelRatio: 2 });
  } catch (_) {
    return false;
  }
  return true;
}

/**
 * Registers `/public/logos_for_print` glyphs for the nearby tour symbol layer.
 * @param {import('mapbox-gl').Map|import('maplibre-gl').Map|null|undefined} map
 * @returns {Promise<void>}
 */
export async function loadTourVicinityPrintLogoImages(map) {
  if (!map) return;
  if (tourVicinityNearbyUseMainHomeIconForAll()) {
    await ensureTourVicinityFullBadgeImage(map, 'parks_rec');
    await ensureTourVicinityFullBadgeImage(map, 'grocery');
    await ensureTourVicinityFullBadgeImage(map, 'schools');
    await ensureTourVicinityFullBadgeImage(map, 'fitness');
    await ensureTourVicinityFullBadgeImage(map, 'essentials');
    await ensureTourVicinityFullBadgeImage(map, 'coffee');
    await ensureTourVicinityFullBadgeImage(map, 'transit');
    await ensureTourVicinityFullBadgeImage(map, 'airport');
    let ok = await ensureTourVicinityLogoImage(
      map,
      'mainHome',
      TOUR_VICINITY_MAP_MAKER_MAIN_HOME_FILE,
      TOUR_VICINITY_NEARBY_MAIN_HOME_OVERRIDE_IMAGE_ID
    );
    if (!ok) {
      await ensureTourVicinityLogoImage(
        map,
        'fallback',
        TOUR_VICINITY_ICON_FALLBACK_FILE,
        TOUR_VICINITY_NEARBY_MAIN_HOME_OVERRIDE_IMAGE_ID
      );
    }
    return;
  }
  await Promise.all(
    Object.entries(TOUR_VICINITY_AMENITY_LOGO_FILES).map(([amenityKey, file]) => {
      if (tourVicinityUsesFullBadge(amenityKey)) return Promise.resolve();
      if (tourVicinityUsesCompositedBadge(amenityKey)) {
        return ensureTourVicinityCompositedBadgeImage(map, amenityKey);
      }
      return ensureTourVicinityLogoImage(map, amenityKey, file);
    })
  );
  await Promise.all(
    Object.keys(TOUR_VICINITY_FULL_BADGE_FILES).map((amenityKey) => ensureTourVicinityFullBadgeImage(map, amenityKey))
  );
  if (!(typeof map.hasImage === 'function' && map.hasImage(TOUR_VICINITY_LOGO_IMAGE_ID_FALLBACK))) {
    await ensureTourVicinityLogoImage(
      map,
      'fallback',
      TOUR_VICINITY_ICON_FALLBACK_FILE,
      TOUR_VICINITY_LOGO_IMAGE_ID_FALLBACK
    );
  }
}

/** Layout `icon-image`: optional main-home test, else `match` on amenity key (full-badge PNGs where defined). */
function tourVicinityNearbyIconImageLayout() {
  const k = tourVicinityNearbyAmenityKeyExpr();
  if (tourVicinityNearbyUseMainHomeIconForAll()) {
    return [
      'match',
      k,
      'parks_rec',
      tourVicinityFullBadgeImageId('parks_rec'),
      'grocery',
      tourVicinityFullBadgeImageId('grocery'),
      'schools',
      tourVicinityFullBadgeImageId('schools'),
      'fitness',
      tourVicinityFullBadgeImageId('fitness'),
      'essentials',
      tourVicinityFullBadgeImageId('essentials'),
      'coffee',
      tourVicinityFullBadgeImageId('coffee'),
      'transit',
      tourVicinityFullBadgeImageId('transit'),
      'airport',
      tourVicinityFullBadgeImageId('airport'),
      'trailheads',
      tourVicinityLogoImageId('trailheads'),
      TOUR_VICINITY_NEARBY_MAIN_HOME_OVERRIDE_IMAGE_ID,
    ];
  }
  return [
    'match',
    k,
    'parks_rec',
    tourVicinityFullBadgeImageId('parks_rec'),
    'grocery',
    tourVicinityFullBadgeImageId('grocery'),
    'schools',
    tourVicinityFullBadgeImageId('schools'),
    'fitness',
    tourVicinityFullBadgeImageId('fitness'),
    'essentials',
    tourVicinityFullBadgeImageId('essentials'),
    'coffee',
    tourVicinityFullBadgeImageId('coffee'),
    'transit',
    tourVicinityFullBadgeImageId('transit'),
    'airport',
    tourVicinityFullBadgeImageId('airport'),
    'trailheads',
    tourVicinityLogoImageId('trailheads'),
    TOUR_VICINITY_LOGO_IMAGE_ID_FALLBACK,
  ];
}

/** Global scale for nearby tour marker `icon-size` / circle (glyph + full-badge). */
const TOUR_VICINITY_NEARBY_ICON_SIZE_GLOBAL_MULT = 4 * 0.75;

/** Full-badge / composited-disc PNGs; bump on map so they match white-disc glyph markers. */
const TOUR_VICINITY_FULL_BADGE_ICON_SIZE_MULT = 1.42;

/** Amenity keys that use a single pre-sized disc image (not circle layer + raw glyph). */
const TOUR_VICINITY_DISC_BADGE_AMENITY_KEYS = [
  ...Object.keys(TOUR_VICINITY_FULL_BADGE_FILES),
  ...Object.keys(TOUR_VICINITY_COMPOSITED_BADGE_AMENITIES),
];

function tourVicinityNearbyUsesDiscBadgeExpr(amenityKeyExpr) {
  if (!TOUR_VICINITY_DISC_BADGE_AMENITY_KEYS.length) return ['literal', false];
  let clause = ['==', amenityKeyExpr, TOUR_VICINITY_DISC_BADGE_AMENITY_KEYS[0]];
  for (let i = 1; i < TOUR_VICINITY_DISC_BADGE_AMENITY_KEYS.length; i += 1) {
    clause = ['any', clause, ['==', amenityKeyExpr, TOUR_VICINITY_DISC_BADGE_AMENITY_KEYS[i]]];
  }
  return clause;
}

function tourVicinityNearbyIconSizeZoomExpr() {
  const k = tourVicinityNearbyAmenityKeyExpr();
  const mult = [
    'case',
    tourVicinityNearbyUsesDiscBadgeExpr(k),
    TOUR_VICINITY_FULL_BADGE_ICON_SIZE_MULT,
    1,
  ];
  const s = ['coalesce', ['get', 'iconScale'], 1];
  const g = TOUR_VICINITY_NEARBY_ICON_SIZE_GLOBAL_MULT;
  const st = (base) => ['*', s, ['*', mult, base * g]];
  return [
    'interpolate',
    ['linear'],
    ['zoom'],
    9,
    st(0.029),
    11,
    st(0.035),
    13,
    st(0.041),
    15,
    st(0.048),
    17,
    st(0.054),
  ];
}

/**
 * Pixel nudge for nearby labels: negative y moves text up; positive moves down.
 * Tuned so names sit just under large icons without sitting too high.
 */
function tourVicinityNearbyLabelTextTranslateExpr() {
  return [
    'interpolate',
    ['linear'],
    ['zoom'],
    9,
    ['literal', [0, -16]],
    10,
    ['literal', [0, -11]],
    11,
    ['literal', [0, -7]],
    12.5,
    ['literal', [0, -2]],
    14,
    ['literal', [0, 4]],
    16,
    ['literal', [0, 10]],
    17,
    ['literal', [0, 14]],
  ];
}

/** After async work, skip mutating the map if the tour slide apply was superseded. */
function tourVicinitySlideApplyStillCurrent(cancel) {
  if (!cancel?.tourApplySeqRef || cancel.tourApplySeq == null) return true;
  return cancel.tourApplySeqRef.current === cancel.tourApplySeq;
}

/** Historical orbit segment (slide 2) used to calibrate duration: keep full-360 orbit same wall-clock length. */
const LEGACY_ORBIT_SPEED_DEG_PER_SEC = 8.5;
const LEGACY_ORBIT_ROTATION_DEG = 130;
const TOUR_VICINITY_LISTING_SOURCE_ID = 'tour-vicinity-listing-source';
const TOUR_VICINITY_LISTING_FILL_LAYER_ID = 'tour-vicinity-listing-fill';
const TOUR_VICINITY_LISTING_LINE_LAYER_ID = 'tour-vicinity-listing-line';
const TOUR_VICINITY_NEARBY_SOURCE_ID = 'tour-vicinity-nearby-source';
const TOUR_VICINITY_NEARBY_POLYGON_LAYER_ID = 'tour-vicinity-nearby-polygon';
const TOUR_VICINITY_NEARBY_LINE_LAYER_ID = 'tour-vicinity-nearby-line';
const TOUR_VICINITY_NEARBY_POINT_LAYER_ID = 'tour-vicinity-nearby-point';
const TOUR_VICINITY_NEARBY_ICON_LAYER_ID = 'tour-vicinity-nearby-icon';
const TOUR_VICINITY_NEARBY_LABEL_LAYER_ID = 'tour-vicinity-nearby-label';

/** Panel hover key — merged into GeoJSON on `setData` (feature-state was unreliable here). */
let tourVicinityLastHoverPanelKey = null;

function removeTourVicinityListingOverlay(map) {
  if (!map) return;
  try {
    if (map.getLayer(TOUR_VICINITY_LISTING_LINE_LAYER_ID)) {
      map.removeLayer(TOUR_VICINITY_LISTING_LINE_LAYER_ID);
    }
  } catch (_) {
    /* ignore */
  }
  try {
    if (map.getLayer(TOUR_VICINITY_LISTING_FILL_LAYER_ID)) {
      map.removeLayer(TOUR_VICINITY_LISTING_FILL_LAYER_ID);
    }
  } catch (_) {
    /* ignore */
  }
  try {
    if (map.getSource(TOUR_VICINITY_LISTING_SOURCE_ID)) {
      map.removeSource(TOUR_VICINITY_LISTING_SOURCE_ID);
    }
  } catch (_) {
    /* ignore */
  }
}

function removeTourVicinityNearbyOverlay(map) {
  if (!map) return;
  tourVicinityLastHoverPanelKey = null;
  try {
    if (map.getLayer(TOUR_VICINITY_NEARBY_ICON_LAYER_ID)) {
      map.removeLayer(TOUR_VICINITY_NEARBY_ICON_LAYER_ID);
    }
  } catch (_) {
    /* ignore */
  }
  try {
    if (map.getLayer(TOUR_VICINITY_NEARBY_LABEL_LAYER_ID)) {
      map.removeLayer(TOUR_VICINITY_NEARBY_LABEL_LAYER_ID);
    }
  } catch (_) {
    /* ignore */
  }
  try {
    if (map.getLayer(TOUR_VICINITY_NEARBY_POINT_LAYER_ID)) {
      map.removeLayer(TOUR_VICINITY_NEARBY_POINT_LAYER_ID);
    }
  } catch (_) {
    /* ignore */
  }
  try {
    if (map.getLayer(TOUR_VICINITY_NEARBY_LINE_LAYER_ID)) {
      map.removeLayer(TOUR_VICINITY_NEARBY_LINE_LAYER_ID);
    }
  } catch (_) {
    /* ignore */
  }
  try {
    if (map.getLayer(TOUR_VICINITY_NEARBY_POLYGON_LAYER_ID)) {
      map.removeLayer(TOUR_VICINITY_NEARBY_POLYGON_LAYER_ID);
    }
  } catch (_) {
    /* ignore */
  }
  try {
    if (map.getSource(TOUR_VICINITY_NEARBY_SOURCE_ID)) {
      map.removeSource(TOUR_VICINITY_NEARBY_SOURCE_ID);
    }
  } catch (_) {
    /* ignore */
  }
}

/**
 * ~Consistent real-world context: buffer the listing footprint in km, then fit the map to that box
 * (viewport-based zoom — avoids a single hardcoded zoom level).
 * @param {[[number,number],[number,number]]} bounds
 */
function getNeighborhoodContextBounds(bounds, bufferKm = 1.15) {
  if (!bounds || !Array.isArray(bounds[0]) || !Array.isArray(bounds[1])) return null;
  try {
    const west = Number(bounds[0][0]);
    const south = Number(bounds[0][1]);
    const east = Number(bounds[1][0]);
    const north = Number(bounds[1][1]);
    if (![west, south, east, north].every(Number.isFinite)) return null;
    const poly = turf.bboxPolygon([west, south, east, north]);
    const buffered = turf.buffer(poly, bufferKm, { units: 'kilometers' });
    const box = turf.bbox(buffered);
    return [
      [box[0], box[1]],
      [box[2], box[3]],
    ];
  } catch (_) {
    return expandBoundsNeighborhood(bounds);
  }
}

/** Fallback if Turf buffer fails: scale bounds from center. */
function expandBoundsNeighborhood(bounds, factor = 3.25) {
  if (!bounds || !Array.isArray(bounds[0]) || !Array.isArray(bounds[1])) return null;
  const west = Number(bounds[0][0]);
  const south = Number(bounds[0][1]);
  const east = Number(bounds[1][0]);
  const north = Number(bounds[1][1]);
  if (![west, south, east, north].every(Number.isFinite)) return null;
  const cx = (west + east) / 2;
  const cy = (south + north) / 2;
  const spanLng = Math.max(east - west, 1e-9);
  const spanLat = Math.max(north - south, 1e-9);
  let halfLng = (spanLng * factor) / 2;
  let halfLat = (spanLat * factor) / 2;
  const minHalfDeg = 0.004;
  halfLng = Math.max(halfLng, minHalfDeg);
  halfLat = Math.max(halfLat, minHalfDeg);
  return [
    [cx - halfLng, cy - halfLat],
    [cx + halfLng, cy + halfLat],
  ];
}

/** Parcel/vector layers may sync after `setLayerStatus`; keep tour grocery markers above fills. */
function moveTourVicinityNearbyLayersToTop(map) {
  if (!map) return;
  const ids = [
    TOUR_VICINITY_NEARBY_POINT_LAYER_ID,
    TOUR_VICINITY_NEARBY_ICON_LAYER_ID,
    TOUR_VICINITY_NEARBY_LABEL_LAYER_ID,
  ];
  ids.forEach((id) => {
    try {
      if (map.getLayer(id)) map.moveLayer(id);
    } catch (_) {
      /* ignore */
    }
  });
}

/** Stable key for matching a list row to a GeoJSON feature (panel hover ring). */
export function getNearbyPlaceHoverKey(feature) {
  if (!feature?.geometry || feature.geometry.type !== 'Point') return '';
  const p = feature.properties || {};
  const id = String(p.placeId || p.place_id || '').trim();
  if (id) return id;
  const c = feature.geometry.coordinates || [];
  const lng = Number(c[0]);
  const lat = Number(c[1]);
  const nm = String(p.name || '').trim();
  if (Number.isFinite(lng) && Number.isFinite(lat)) {
    return `${lng.toFixed(5)}|${lat.toFixed(5)}|${nm}`;
  }
  return nm || 'place';
}

/** Adds draw order + hover scale (`iconScale` / `circleBoost` swell disc + glyph together). */
export function augmentTourVicinityNearbyGeoJson(nearbyGeoJson) {
  const feats = Array.isArray(nearbyGeoJson?.features) ? nearbyGeoJson.features : [];
  const features = feats.map((f, i) => ({
    ...f,
    properties: {
      ...(f.properties || {}),
      tourStackOrder: i,
      iconScale: 1,
      circleBoost: 1,
    },
  }));
  return { type: 'FeatureCollection', features };
}

/** Applies list-hover swell by mutating per-feature `iconScale`, `circleBoost`, `tourStackOrder`. */
function mergeTourVicinityDataWithHover(augmentedCollection, hoverKey) {
  const hk = typeof hoverKey === 'string' && hoverKey.trim() ? hoverKey.trim() : null;
  if (!hk || !augmentedCollection?.features?.length) return augmentedCollection;
  return {
    type: 'FeatureCollection',
    features: augmentedCollection.features.map((f, i) => {
      if (getNearbyPlaceHoverKey(f) !== hk) return f;
      return {
        ...f,
        properties: {
          ...(f.properties || {}),
          iconScale: 1.22,
          circleBoost: 1.22,
          tourStackOrder: 2000 + i,
        },
      };
    }),
  };
}

/**
 * Panel list hover: swell disc + icon by rewriting nearby GeoJSON (`iconScale`, `circleBoost`).
 * @param {import('mapbox-gl').Map|null|undefined} map
 * @param {string|null|undefined} hoverPanelKey from {@link getNearbyPlaceHoverKey}
 * @param {unknown[]|null|undefined} nearbyFeatures same order as map data (e.g. `activeAmenityFeatures`)
 */
export function setTourVicinityNearbyHoverHighlight(map, hoverPanelKey, nearbyFeatures) {
  const nextKey =
    typeof hoverPanelKey === 'string' && hoverPanelKey.trim() ? hoverPanelKey.trim() : null;
  tourVicinityLastHoverPanelKey = nextKey;

  const src = map?.getSource?.(TOUR_VICINITY_NEARBY_SOURCE_ID);
  if (!src || typeof src.setData !== 'function') return;

  const augmented = augmentTourVicinityNearbyGeoJson({
    type: 'FeatureCollection',
    features: Array.isArray(nearbyFeatures) ? nearbyFeatures : [],
  });
  try {
    src.setData(mergeTourVicinityDataWithHover(augmented, tourVicinityLastHoverPanelKey));
    moveTourVicinityNearbyLayersToTop(map);
  } catch (_) {
    /* ignore */
  }
}

async function showTourVicinityNearbyOverlay(map, nearbyGeoJson, cancel) {
  if (!map || !nearbyGeoJson?.features?.length) return;
  await loadTourVicinityPrintLogoImages(map);
  if (!tourVicinitySlideApplyStillCurrent(cancel)) return;
  removeTourVicinityNearbyOverlay(map);
  const data = augmentTourVicinityNearbyGeoJson(nearbyGeoJson);
  const dataForMap = mergeTourVicinityDataWithHover(data, tourVicinityLastHoverPanelKey);
  const g = TOUR_VICINITY_NEARBY_ICON_SIZE_GLOBAL_MULT;
  const circleRadiusZoom = [
    'interpolate',
    ['linear'],
    ['zoom'],
    9,
    ['*', ['coalesce', ['get', 'circleBoost'], 1], 11 * g],
    11,
    ['*', ['coalesce', ['get', 'circleBoost'], 1], 14 * g],
    13,
    ['*', ['coalesce', ['get', 'circleBoost'], 1], 18 * g],
    15,
    ['*', ['coalesce', ['get', 'circleBoost'], 1], 22 * g],
    17,
    ['*', ['coalesce', ['get', 'circleBoost'], 1], 26 * g],
  ];
  const iconSizeZoom = tourVicinityNearbyIconSizeZoomExpr();
  try {
    map.addSource(TOUR_VICINITY_NEARBY_SOURCE_ID, {
      type: 'geojson',
      data: dataForMap,
    });
    map.addLayer({
      id: TOUR_VICINITY_NEARBY_POINT_LAYER_ID,
      type: 'circle',
      source: TOUR_VICINITY_NEARBY_SOURCE_ID,
      filter: tourVicinityNearbyCircleLayerFilter(),
      paint: {
        'circle-radius': circleRadiusZoom,
        'circle-sort-key': ['to-number', ['get', 'tourStackOrder']],
        'circle-color': '#ffffff',
        'circle-opacity': 1,
        /** Slightly thick stroke so stacked white discs stay readable when circles/icons interleave. */
        'circle-stroke-width': ['*', ['coalesce', ['get', 'circleBoost'], 1], 1.65 * g],
        'circle-stroke-color': '#0a0a0a',
        'circle-stroke-opacity': 1,
      },
    });
    map.addLayer({
      id: TOUR_VICINITY_NEARBY_ICON_LAYER_ID,
      type: 'symbol',
      source: TOUR_VICINITY_NEARBY_SOURCE_ID,
      filter: ['==', ['geometry-type'], 'Point'],
      layout: {
        'icon-image': tourVicinityNearbyIconImageLayout(),
        'icon-size': iconSizeZoom,
        'symbol-sort-key': ['to-number', ['get', 'tourStackOrder']],
        'icon-anchor': 'center',
        'icon-allow-overlap': true,
        'icon-ignore-placement': true,
        'icon-padding': 0,
        'icon-pitch-alignment': 'viewport',
      },
      paint: {
        'icon-opacity': 1,
      },
    });
    map.addLayer({
      id: TOUR_VICINITY_NEARBY_LABEL_LAYER_ID,
      type: 'symbol',
      source: TOUR_VICINITY_NEARBY_SOURCE_ID,
      filter: ['any', ['has', 'label'], ['has', 'name']],
      layout: {
        'text-field': ['coalesce', ['get', 'label'], ['get', 'name']],
        'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold'],
        'text-size': 13,
        'text-max-width': 8,
        /** Small em gap; do not tie to {@link TOUR_VICINITY_NEARBY_ICON_SIZE_GLOBAL_MULT} (that blew gaps up 4×). */
        'text-offset': ['literal', [0, 0.62]],
        'text-anchor': 'top',
        'symbol-placement': 'point',
        'symbol-sort-key': ['to-number', ['get', 'tourStackOrder']],
        'text-allow-overlap': true,
        'text-ignore-placement': true,
      },
      paint: {
        'text-color': '#ffffff',
        'text-halo-color': '#831843',
        'text-halo-width': 2,
        'text-opacity': 0.98,
        'text-translate': tourVicinityNearbyLabelTextTranslateExpr(),
      },
    });
    const bumpZ = () => moveTourVicinityNearbyLayersToTop(map);
    bumpZ();
    map.once('idle', bumpZ);
    window.setTimeout(bumpZ, 400);
  } catch (_) {
    /* ignore */
  }
}

/**
 * Update or create the tour nearby GeoJSON layer. Empty collections remove markers.
 * @param {import('mapbox-gl').Map} map
 * @param {{ type?: string, features?: unknown[] }|null|undefined} nearbyGeoJson
 */
export async function applyTourVicinityNearbyGeoJson(map, nearbyGeoJson, cancel) {
  if (!map) return;
  const features = Array.isArray(nearbyGeoJson?.features) ? nearbyGeoJson.features : [];
  const data = { type: 'FeatureCollection', features };
  const augmented = augmentTourVicinityNearbyGeoJson(data);
  try {
    const src = map.getSource(TOUR_VICINITY_NEARBY_SOURCE_ID);
    if (src && typeof src.setData === 'function') {
      if (!features.length) {
        tourVicinityLastHoverPanelKey = null;
        src.setData({ type: 'FeatureCollection', features: [] });
        moveTourVicinityNearbyLayersToTop(map);
        window.setTimeout(() => moveTourVicinityNearbyLayersToTop(map), 120);
        return;
      }
      await loadTourVicinityPrintLogoImages(map);
      if (!tourVicinitySlideApplyStillCurrent(cancel)) return;
      src.setData(mergeTourVicinityDataWithHover(augmented, tourVicinityLastHoverPanelKey));
      moveTourVicinityNearbyLayersToTop(map);
      window.setTimeout(() => moveTourVicinityNearbyLayersToTop(map), 120);
      return;
    }
  } catch (_) {
    /* ignore */
  }
  if (features.length) {
    await showTourVicinityNearbyOverlay(map, augmented, cancel);
  } else {
    removeTourVicinityNearbyOverlay(map);
  }
}

/**
 * Fit the map to nearby place points (or neighborhood fallback) with tour padding.
 * @param {import('mapbox-gl').Map} map
 * @param {{ features?: unknown[] }|null|undefined} nearbyGeoJson
 * @param {[[number,number],[number,number]]|null} bounds listing bounds
 * @param {{ center?: { lng: number, lat: number }, zoom?: number }|null|undefined} savedViewport
 * @param {{ animationDuration?: number, panelLeftPad?: number }} [options]
 */
export function fitTourVicinityCamera(map, nearbyGeoJson, bounds, savedViewport, options = {}) {
  if (!map) return;
  const panelLeftPad = Number(options.panelLeftPad) || TOUR_VICINITY_LEFT_PANEL_MAP_PAD;
  const duration =
    Number.isFinite(Number(options.animationDuration)) && Number(options.animationDuration) >= 0
      ? Number(options.animationDuration)
      : 1400;

  const centerFromViewport = () => {
    const c = savedViewport?.center;
    if (c && Number.isFinite(c.lng) && Number.isFinite(c.lat)) {
      return [c.lng, c.lat];
    }
    try {
      const mc = map.getCenter();
      return [mc.lng, mc.lat];
    } catch (_) {
      return [0, 0];
    }
  };

  const pts = Array.isArray(nearbyGeoJson?.features)
    ? nearbyGeoJson.features.filter((f) => f?.geometry?.type === 'Point')
    : [];
  if (pts.length >= 1) {
    let minLng = Infinity;
    let maxLng = -Infinity;
    let minLat = Infinity;
    let maxLat = -Infinity;
    for (const f of pts) {
      const [x, y] = f?.geometry?.coordinates || [];
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      minLng = Math.min(minLng, x);
      maxLng = Math.max(maxLng, x);
      minLat = Math.min(minLat, y);
      maxLat = Math.max(maxLat, y);
    }
    if (bounds) {
      const w = Number(bounds?.[0]?.[0]);
      const s = Number(bounds?.[0]?.[1]);
      const e = Number(bounds?.[1]?.[0]);
      const n = Number(bounds?.[1]?.[1]);
      if ([w, s, e, n].every(Number.isFinite)) {
        minLng = Math.min(minLng, w, e);
        maxLng = Math.max(maxLng, w, e);
        minLat = Math.min(minLat, s, n);
        maxLat = Math.max(maxLat, s, n);
      }
    }
    if ([minLng, maxLng, minLat, maxLat].every(Number.isFinite)) {
      const spanLng = maxLng - minLng;
      const spanLat = maxLat - minLat;
      const bufLng = Math.max(spanLng * 0.08, 0.0015);
      const bufLat = Math.max(spanLat * 0.08, 0.0015);
      minLng -= bufLng;
      maxLng += bufLng;
      minLat -= bufLat;
      maxLat += bufLat;
    }
    if ([minLng, maxLng, minLat, maxLat].every(Number.isFinite)) {
      try {
        map.fitBounds(
          [
            [minLng, minLat],
            [maxLng, maxLat],
          ],
          {
            padding: { top: 88, bottom: 168, left: panelLeftPad, right: 64 },
            duration,
            maxZoom: 16.4,
            pitch: 0,
            bearing: 0,
            essential: true,
          }
        );
        return;
      } catch (_) {
        /* ignore */
      }
    }
  }

  if (bounds) {
    const wide = getNeighborhoodContextBounds(bounds);
    if (wide) {
      const vicinityPadding = { top: 52, bottom: 120, left: panelLeftPad, right: 52 };
      const vicinityZoomLoosen = 0.35;
      const viewport = {
        width: Number(map?.getContainer?.()?.clientWidth || 0),
        height: Number(map?.getContainer?.()?.clientHeight || 0),
      };
      const z = computeMaxContainedZoom(wide, viewport, vicinityPadding, 17, 4);
      const cam = map.cameraForBounds(wide, {
        padding: vicinityPadding,
        maxZoom: 17,
        bearing: 0,
        pitch: 0,
      });
      if (cam?.center && Number.isFinite(z)) {
        map.flyTo({
          center: cam.center,
          zoom: Math.max(4, z - vicinityZoomLoosen),
          pitch: 0,
          bearing: 0,
          duration,
          essential: true,
        });
        return;
      }
      try {
        map.fitBounds(wide, {
          duration,
          padding: vicinityPadding,
          maxZoom: 17,
          pitch: 0,
          bearing: 0,
          essential: true,
        });
        return;
      } catch (_) {
        /* ignore */
      }
    }
  }

  const [lng, lat] = centerFromViewport();
  if (Number.isFinite(lng) && Number.isFinite(lat)) {
    map.flyTo({
      center: [lng, lat],
      zoom: 13,
      pitch: 0,
      bearing: 0,
      duration,
      essential: true,
    });
  }
}

function smoothstep01(t) {
  const x = Math.min(1, Math.max(0, t));
  return x * x * (3 - 2 * x);
}

function clampLatForMercator(lat) {
  return Math.max(-85.05112878, Math.min(85.05112878, lat));
}

function lngToMercatorX(lng) {
  return (lng + 180) / 360;
}

function latToMercatorY(lat) {
  const clamped = clampLatForMercator(lat);
  const rad = (clamped * Math.PI) / 180;
  return (1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2;
}

/**
 * Compute max zoom that still contains the provided bounds in the viewport.
 * Uses WebMercator math directly to avoid extra fitBounds conservatism.
 */
function computeMaxContainedZoom(bounds, viewport, padding, maxZoom = 19, minZoom = 6) {
  const west = Number(bounds?.[0]?.[0]);
  const south = Number(bounds?.[0]?.[1]);
  const east = Number(bounds?.[1]?.[0]);
  const north = Number(bounds?.[1]?.[1]);
  const widthPx = Number(viewport?.width || 0);
  const heightPx = Number(viewport?.height || 0);
  if (![west, south, east, north, widthPx, heightPx].every(Number.isFinite)) return null;

  const padLeft = Number(padding?.left || 0);
  const padRight = Number(padding?.right || 0);
  const padTop = Number(padding?.top || 0);
  const padBottom = Number(padding?.bottom || 0);
  const availW = Math.max(1, widthPx - padLeft - padRight);
  const availH = Math.max(1, heightPx - padTop - padBottom);

  const x1 = lngToMercatorX(west);
  const x2 = lngToMercatorX(east);
  const y1 = latToMercatorY(south);
  const y2 = latToMercatorY(north);

  const dxRaw = Math.abs(x2 - x1);
  // Support crossing antimeridian by choosing shorter world span.
  const dx = Math.min(dxRaw, 1 - dxRaw);
  const dy = Math.abs(y2 - y1);

  const WORLD = 512; // Mapbox GL world size at z0
  const zx = dx > 1e-12 ? Math.log2(availW / (WORLD * dx)) : Number.POSITIVE_INFINITY;
  const zy = dy > 1e-12 ? Math.log2(availH / (WORLD * dy)) : Number.POSITIVE_INFINITY;
  const z = Math.min(zx, zy);

  if (!Number.isFinite(z)) return maxZoom;
  return Math.max(minZoom, Math.min(z, maxZoom));
}

/**
 * Continuous bearing orbit around the current center. Writes rAF id to `rafRef.current`.
 * Parent should cancel via cancelAnimationFrame and clear the ref when changing slides.
 *
 * @param {import('mapbox-gl').Map} map
 * @param {{ current: number | null }} rafRef
 * @param {{
 *   speedDegPerSec?: number,
 *   maxRotationDeg?: number,
 *   pitchFrom?: number,
 *   pitchTo?: number,
 *   pitchWaveMin?: number,
 *   pitchWaveMax?: number,
 *   pitchWaveCycles?: number,
 *   pitchWaveInitial?: number,
 *   pitchOrbit?: number,
 *   pitchEnd?: number,
 *   zoomDelta?: number,
 *   endBlendFraction?: number,
 * }} [options]
 * - **Pitch wave:** `pitchWaveInitial` — fly-in end pitch; orbit starts there, then oscillates between min/max.
 * - **Legacy:** `pitchFrom` / `pitchTo` — linear pitch vs rotation (used when end-blend mode is off).
 * - **End blend:** `pitchOrbit`, `pitchEnd`, `zoomDelta`, `endBlendFraction` — for the last segment of the
 *   rotation only: zoom in by `zoomDelta` and ease pitch toward `pitchEnd` (more overhead). Requires
 *   `zoomDelta` & `endBlendFraction` & both pitches.
 */
export function startPropertyTourOrbit(map, rafRef, options = {}) {
  if (!map || !rafRef) return;
  const speedDegPerSec = options.speedDegPerSec ?? 9;
  const maxRotationDeg = options.maxRotationDeg ?? 125;
  const pitchFrom = options.pitchFrom;
  const pitchTo = options.pitchTo;
  const pitchWaveMin = options.pitchWaveMin;
  const pitchWaveMax = options.pitchWaveMax;
  const pitchWaveCycles = Number(options.pitchWaveCycles ?? 1);
  const pitchWaveInitialOption = options.pitchWaveInitial;
  const endBlendFraction = Number(options.endBlendFraction);
  const zoomDelta = Number(options.zoomDelta);
  const pitchOrbit = options.pitchOrbit;
  const pitchEndOption = options.pitchEnd;

  const usePitchWave =
    Number.isFinite(pitchWaveMin) &&
    Number.isFinite(pitchWaveMax) &&
    pitchWaveMax > pitchWaveMin &&
    Number.isFinite(pitchWaveCycles) &&
    pitchWaveCycles > 0;

  const useEndBlend =
    !usePitchWave &&
    Number.isFinite(endBlendFraction) &&
    endBlendFraction > 0 &&
    endBlendFraction < 1 &&
    Number.isFinite(zoomDelta) &&
    zoomDelta !== 0 &&
    Number.isFinite(pitchOrbit) &&
    Number.isFinite(pitchEndOption);

  const varyPitchLinear =
    !usePitchWave &&
    !useEndBlend &&
    Number.isFinite(pitchFrom) &&
    Number.isFinite(pitchTo);

  if (rafRef.current != null) {
    cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
  }
  let startBearing = 0;
  try {
    startBearing = map.getBearing();
  } catch (_) {
    startBearing = 0;
  }

  let zoomStart = 16;
  try {
    zoomStart = map.getZoom();
  } catch (_) {
    /* ignore */
  }

  let accumulated = 0;
  let last = typeof performance !== 'undefined' ? performance.now() : Date.now();

  let pitchWavePhase = 0;
  let pitchWaveCenter = 0;
  let pitchWaveAmplitude = 0;
  const pitchAtWaveProgress = (progress) => {
    const radians = progress * Math.PI * 2 * pitchWaveCycles + pitchWavePhase;
    return pitchWaveCenter - pitchWaveAmplitude * Math.cos(radians);
  };

  if (usePitchWave) {
    pitchWaveAmplitude = (pitchWaveMax - pitchWaveMin) / 2;
    pitchWaveCenter = pitchWaveMin + pitchWaveAmplitude;
    let pitch0 = null;
    try {
      const livePitch = map.getPitch();
      if (Number.isFinite(livePitch)) pitch0 = livePitch;
    } catch (_) {
      /* ignore */
    }
    if (!Number.isFinite(pitch0) && Number.isFinite(pitchWaveInitialOption)) {
      pitch0 = pitchWaveInitialOption;
    }
    if (!Number.isFinite(pitch0)) {
      pitch0 = pitchWaveCenter;
    }
    pitch0 = Math.max(pitchWaveMin, Math.min(pitchWaveMax, pitch0));
    const cosArg = (pitchWaveCenter - pitch0) / Math.max(pitchWaveAmplitude, 1e-6);
    pitchWavePhase = Math.acos(Math.max(-1, Math.min(1, cosArg)));
  }

  if (useEndBlend) {
    try {
      if (typeof map.setMaxPitch === 'function') {
        map.setMaxPitch(85);
      }
      map.setPitch(pitchOrbit);
    } catch (_) {
      /* ignore */
    }
  } else if (varyPitchLinear) {
    try {
      map.setPitch(pitchFrom);
    } catch (_) {
      /* ignore */
    }
  }

  const blendStartProgress = useEndBlend ? 1 - endBlendFraction : 1;
  const pitchHigh = useEndBlend ? pitchOrbit : 0;
  const pitchEnd = useEndBlend ? pitchEndOption : pitchTo;

  const step = (now) => {
    const t = typeof now === 'number' ? now : typeof performance !== 'undefined' ? performance.now() : Date.now();
    const dt = Math.min(0.064, Math.max(0, (t - last) / 1000));
    last = t;
    accumulated += speedDegPerSec * dt;
    if (accumulated >= maxRotationDeg) {
      try {
        if (useEndBlend) {
          map.setPitch(pitchEnd);
          let zFin = zoomStart + zoomDelta;
          try {
            const cap = typeof map.getMaxZoom === 'function' ? map.getMaxZoom() : 19;
            zFin = Math.min(zFin, cap);
          } catch (_) {
            /* ignore */
          }
          map.setZoom(zFin);
        } else if (usePitchWave) {
          map.setPitch(pitchAtWaveProgress(1));
        } else if (varyPitchLinear) {
          map.setPitch(pitchTo);
        }
        map.rotateTo(startBearing + maxRotationDeg, { duration: 0, essential: true });
      } catch (_) {
        /* ignore */
      }
      rafRef.current = null;
      return;
    }
    const progress = accumulated / maxRotationDeg;
    try {
      if (useEndBlend) {
        let pitch = pitchHigh;
        let zoom = zoomStart;
        if (progress >= blendStartProgress - 1e-9) {
          const span = Math.max(1e-9, endBlendFraction);
          const local = Math.min(1, Math.max(0, (progress - blendStartProgress) / span));
          const s = smoothstep01(local);
          pitch = pitchHigh + (pitchEnd - pitchHigh) * s;
          let nextZoom = zoomStart + zoomDelta * s;
          try {
            const cap = typeof map.getMaxZoom === 'function' ? map.getMaxZoom() : 19;
            nextZoom = Math.min(nextZoom, cap);
          } catch (_) {
            /* ignore */
          }
          zoom = nextZoom;
        }
        map.setPitch(pitch);
        map.setZoom(zoom);
      } else if (usePitchWave) {
        map.setPitch(pitchAtWaveProgress(progress));
      } else if (varyPitchLinear) {
        const p = pitchFrom + (pitchTo - pitchFrom) * progress;
        map.setPitch(p);
      }
      map.rotateTo(startBearing + accumulated, { duration: 0, essential: true });
    } catch (_) {
      rafRef.current = null;
      return;
    }
    rafRef.current = requestAnimationFrame(step);
  };
  rafRef.current = requestAnimationFrame(step);
}

/**
 * Lower score = earlier in the perspective photo pass (main structures before accessory lines).
 * @param {{ label?: string, mapStyleVariant?: string, type?: string, zIndex?: number }} el
 */
export function scorePhotoTourPerspectiveRank(el) {
  const label = String(el?.label || '').toLowerCase();
  const variant = String(el?.mapStyleVariant || '').toLowerCase();
  if (/property\s*boundary|boundary|parcel\s*line|lot\s*line/.test(label) || variant === 'boundary') {
    return 950;
  }
  const rules = [
    [/^main\s*home\b|main home/i, 10],
    [/\bprimary\s*residence\b|\bmain\s+house\b/i, 15],
    [/^home\b|\bresidence\b|\bdwelling\b/i, 20],
    [/\bhouse\b/i, 25],
    [/\bgarage\b|\bcar\s*port\b|\bcarport\b/i, 35],
    [/\bbarn\b|\bstable\b|\bshop\b|\bshed\b/i, 45],
    [/\bpool\b|\bdeck\b|\bpatio\b|\bcourtyard\b/i, 55],
    [/\bgarden\b|\blawn\b|\byard\b/i, 65],
    [/\bwater\b|\bpond\b|\bcreek\b|\bstream\b/i, 75],
    [/\bdriveway\b|\broad\b|\bpath\b|\btrail\b/i, 85],
    [/\bfence\b|\bgate\b/i, 90],
  ];
  for (const [re, score] of rules) {
    if (re.test(label)) return score;
  }
  const typeOrder = { polygon: 100, shape: 110, polyline: 120, arrow: 130, note: 140 };
  return (typeOrder[el?.type] ?? 200) + (Number(el?.zIndex) || 0) * 0.001;
}

/**
 * @param {unknown[]} printElements
 * @returns {{ element: Record<string, unknown>, photoCount: number }[]}
 */
export function rankPrintElementsWithPhotos(printElements) {
  const out = [];
  for (const el of printElements || []) {
    if (!el || typeof el !== 'object' || el?.hiddenOnMap) continue;
    const photos = getPhotoSrcListFromElement(el);
    if (!photos.length) continue;
    out.push({ element: el, photoCount: photos.length });
  }
  out.sort((a, b) => {
    const da = scorePhotoTourPerspectiveRank(a.element);
    const db = scorePhotoTourPerspectiveRank(b.element);
    if (da !== db) return da - db;
    return String(a.element.label || '').localeCompare(String(b.element.label || ''));
  });
  return out;
}

/**
 * Bird's-eye framing for a print element (pitch/bearing 0, capped zoom).
 * Shared by the property tour and the share-viewer photo carousel.
 * @param {import('mapbox-gl').Map} map
 */
export function focusPrintElementBirdEye(map, element) {
  if (!map || !element) return;
  try {
    map.stop?.();
    map.setPitch(0);
    map.setBearing(0);
  } catch (_) {
    /* ignore */
  }
  const g = element.geometry;
  if (g?.type === 'Point' && Array.isArray(g.coordinates) && g.coordinates.length >= 2) {
    const lng = g.coordinates[0];
    const lat = g.coordinates[1];
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) return;
    let z = 15;
    try {
      z = map.getZoom();
    } catch (_) {
      /* ignore */
    }
    const targetZoom = Math.min(Math.max(z + 0.18, 14.5), 16.15);
    map.easeTo({
      center: [lng, lat],
      zoom: targetZoom,
      pitch: 0,
      bearing: 0,
      duration: 1600,
      essential: true,
    });
    return;
  }
  if (g?.type === 'LineString' && Array.isArray(g.coordinates) && g.coordinates.length >= 2) {
    const mid = Math.floor(g.coordinates.length / 2);
    const [lng, lat] = g.coordinates[mid];
    if (Number.isFinite(lng) && Number.isFinite(lat)) {
      let z = 15;
      try {
        z = map.getZoom();
      } catch (_) {
        /* ignore */
      }
      const targetZoom = Math.min(Math.max(z + 0.15, 14.4), 16.0);
      map.easeTo({
        center: [lng, lat],
        zoom: targetZoom,
        pitch: 0,
        bearing: 0,
        duration: 1500,
        essential: true,
      });
    }
    return;
  }
  if (g?.type === 'Polygon' && Array.isArray(g.coordinates?.[0]) && g.coordinates[0].length >= 3) {
    try {
      const ring = g.coordinates[0];
      let minLng = Infinity;
      let maxLng = -Infinity;
      let minLat = Infinity;
      let maxLat = -Infinity;
      ring.forEach(([x, y]) => {
        if (Number.isFinite(x) && Number.isFinite(y)) {
          minLng = Math.min(minLng, x);
          maxLng = Math.max(maxLng, x);
          minLat = Math.min(minLat, y);
          maxLat = Math.max(maxLat, y);
        }
      });
      if (
        Number.isFinite(minLng) &&
        Number.isFinite(maxLng) &&
        Number.isFinite(minLat) &&
        Number.isFinite(maxLat)
      ) {
        map.fitBounds(
          [
            [minLng, minLat],
            [maxLng, maxLat],
          ],
          {
            padding: { top: 96, bottom: 140, left: 96, right: 96 },
            duration: 1600,
            maxZoom: 15.9,
            pitch: 0,
            bearing: 0,
            essential: true,
          }
        );
      }
    } catch (_) {
      /* ignore */
    }
  }
}

/**
 * Steps 0–2: welcome, context, bird. Then one step per ranked photo (none if there are no print photos).
 * Last segment is one slide per nearby amenity category.
 * @param {unknown[]} printElements
 */
export function getTourStepCount(printElements) {
  const n = rankPrintElementsWithPhotos(printElements).slice(0, 8).length;
  const photoBlockLen = n > 0 ? n : 0;
  return 3 + photoBlockLen + TOUR_NEARBY_AMENITY_ORDER.length;
}

/**
 * @param {import('mapbox-gl').Map} map
 * @param {[[number,number],[number,number]]|null} bounds
 * @param {{ center?: { lng: number, lat: number }, zoom?: number }|null} savedViewport
 * @param {Record<string, boolean>} layerBaseline
 * @param {React.Dispatch<React.SetStateAction<Record<string, boolean>>>} setLayerStatus
 * @param {number} tourStepIndex See {@link getTourStepCount}: 0–2 base, 3+ photo block, last index = vicinity.
 * @param {{
 *   orbitRafRef?: { current: number | null },
 *   orbitKickRef?: { current: ReturnType<typeof setTimeout> | null },
 *   applyTourPropertyBasemapRef?: { current: (() => void | Promise<void>) | null },
 *   tourApplySeq?: number,
 *   tourApplySeqRef?: { current: number },
 *   layerOrderBaseline?: string[],
 *   setLayerOrder?: (order: string[] | ((prev: string[]) => string[])) => void,
 *   printElements?: unknown[],
 *   nearbyContextGeoJson?: { type: 'FeatureCollection', features: unknown[] } | null,
 * }} [tourPlayback]
 */
export async function applyPropertyTourSlide(
  map,
  bounds,
  savedViewport,
  layerBaseline,
  setLayerStatus,
  tourStepIndex,
  tourPlayback
) {
  if (!map) return;

  const orbitRafRef = tourPlayback?.orbitRafRef;
  const orbitKickRef = tourPlayback?.orbitKickRef;
  const applyTourPropertyBasemapRef = tourPlayback?.applyTourPropertyBasemapRef;
  const layerOrderBaseline = tourPlayback?.layerOrderBaseline ?? [];
  const setLayerOrder = tourPlayback?.setLayerOrder;

  const clearOrbitKick = () => {
    if (orbitKickRef?.current != null) {
      clearTimeout(orbitKickRef.current);
      orbitKickRef.current = null;
    }
  };

  const scheduleOrbitAfterZoom = (zoomMs, orbitOptions) => {
    clearOrbitKick();
    if (!orbitRafRef || !orbitKickRef) return;
    const delay = Math.max(0, zoomMs) + 180;
    orbitKickRef.current = setTimeout(() => {
      orbitKickRef.current = null;
      startPropertyTourOrbit(map, orbitRafRef, orbitOptions);
    }, delay);
  };

  const centerFromViewport = () => {
    const c = savedViewport?.center;
    if (c && Number.isFinite(c.lng) && Number.isFinite(c.lat)) {
      return [c.lng, c.lat];
    }
    const mc = map.getCenter();
    return [mc.lng, mc.lat];
  };

  const applyLayers = (patch) => {
    if (patch == null) {
      setLayerStatus({ ...layerBaseline });
      if (typeof setLayerOrder === 'function') {
        setLayerOrder(Array.isArray(layerOrderBaseline) ? [...layerOrderBaseline] : []);
      }
      return;
    }
    const merged = { ...layerBaseline, ...patch };
    setLayerStatus(merged);
    if (typeof setLayerOrder === 'function' && Array.isArray(layerOrderBaseline)) {
      const on = Object.keys(merged).filter((k) => merged[k]);
      const fromBase = layerOrderBaseline.filter((k) => on.includes(k));
      const next = [...fromBase];
      for (const k of on) {
        if (!next.includes(k)) next.push(k);
      }
      setLayerOrder(next);
    }
  };

  map.stop?.();
  clearOrbitKick();
  removeTourVicinityListingOverlay(map);
  removeTourVicinityNearbyOverlay(map);
  if (orbitRafRef?.current != null) {
    cancelAnimationFrame(orbitRafRef.current);
    orbitRafRef.current = null;
  }

  const ranked = rankPrintElementsWithPhotos(tourPlayback?.printElements).slice(0, 8);
  const photoBlockLen = ranked.length > 0 ? ranked.length : 0;
  const vicinityIndex = 3 + photoBlockLen;
  const nearbyOrder = Array.isArray(tourPlayback?.nearbyAmenityOrder) && tourPlayback.nearbyAmenityOrder.length
    ? tourPlayback.nearbyAmenityOrder
    : TOUR_NEARBY_AMENITY_ORDER.map((x) => x.key);
  const nearbyEndIndex = vicinityIndex + nearbyOrder.length - 1;

  if (tourStepIndex >= vicinityIndex && tourStepIndex <= nearbyEndIndex) {
    window.dispatchEvent(new CustomEvent('shared-photo-close'));
    const vicinitySlide = PROPERTY_TOUR_SLIDES[4];
    const amenityIdx = tourStepIndex - vicinityIndex;
    const amenityKey = nearbyOrder[amenityIdx];
    const nearbyByAmenity = tourPlayback?.nearbyContextByAmenity || {};
    const nearbyGeoJson = nearbyByAmenity?.[amenityKey] || tourPlayback?.nearbyContextGeoJson || null;
    applyLayers(buildTourOrbitLayerPatch(layerBaseline));
    const vicinityApplySeq = tourPlayback?.tourApplySeq;
    const vicinitySeqRef = tourPlayback?.tourApplySeqRef;
    const vicinityCancel =
      vicinitySeqRef && vicinityApplySeq != null
        ? { tourApplySeq: vicinityApplySeq, tourApplySeqRef: vicinitySeqRef }
        : undefined;
    await applyTourVicinityNearbyGeoJson(
      map,
      nearbyGeoJson && Array.isArray(nearbyGeoJson.features)
        ? nearbyGeoJson
        : { type: 'FeatureCollection', features: [] },
      vicinityCancel
    );
    if (vicinitySeqRef && vicinityApplySeq != null && vicinitySeqRef.current !== vicinityApplySeq) {
      return;
    }
    fitTourVicinityCamera(
      map,
      nearbyGeoJson && Array.isArray(nearbyGeoJson.features)
        ? nearbyGeoJson
        : { type: 'FeatureCollection', features: [] },
      bounds,
      savedViewport,
      { animationDuration: 1400 }
    );
    return;
  }

  if (tourStepIndex >= 3) {
    const perspectiveSlide = PROPERTY_TOUR_SLIDES[3];
    applyLayers(perspectiveSlide?.layerPatch ?? { ownership: false });

    if (ranked.length > 0) {
      const k = tourStepIndex - 3;
      const safeK = Math.max(0, Math.min(k, ranked.length - 1));
      const el = ranked[safeK]?.element;
      if (el?.id) {
        focusPrintElementBirdEye(map, el);
        window.dispatchEvent(
          new CustomEvent('shared-photo-open', {
            detail: { elementId: el.id, index: 0 },
          })
        );
      }
      return;
    }

    if (bounds) {
      map.fitBounds(bounds, {
        duration: 0,
        padding: { top: 40, bottom: 140, left: 40, right: 40 },
        maxZoom: 18,
        pitch: 0,
        bearing: 0,
      });
    }
    const c = map.getCenter();
    const z = map.getZoom();
    map.flyTo({
      center: [c.lng, c.lat],
      zoom: Math.min(z + 0.35, 18.2),
      pitch: 0,
      bearing: 0,
      duration: 2200,
      essential: true,
    });
    return;
  }

  const slide = PROPERTY_TOUR_SLIDES[tourStepIndex];
  if (!slide) return;

  switch (slide.id) {
    case 'welcome': {
      applyLayers(slide.layerPatch ?? { ownership: false });
      if (bounds) {
        map.fitBounds(bounds, {
          duration: 1400,
          padding: { top: 80, bottom: 140, left: 80, right: 80 },
          maxZoom: 8,
          pitch: 0,
          bearing: 0,
          essential: true,
        });
      } else {
        const [lng, lat] = centerFromViewport();
        map.flyTo({
          center: [lng, lat],
          zoom: Math.min(savedViewport?.zoom ?? 12, 12),
          pitch: 0,
          bearing: 0,
          duration: 1400,
          essential: true,
        });
      }
      break;
    }
    case 'context': {
      applyLayers(buildTourOrbitLayerPatch(layerBaseline));
      const orbitBounds =
        getPropertyBoundaryBoundsFromPrintElements(tourPlayback?.printElements, bounds) || bounds;
      const zoomMs = 2400;
      /**
       * Fly-in: same framing as before, but pitch eases from overhead into a lower (more oblique) orbit
       * so terrain reads during the zoom. Mapbox pitch above 60 needs `maxPitch` on the map (85 in Map.js).
       */
      const pitchZoomStart = 36;
      const pitchOrbitHigh = 62;
      /** Degrees of bearing change baked into the fly-in (Mapbox interpolates start → end over zoomMs). */
      const zoomOrbitBearingDelta = 28;
      const legacyOrbitDurationSec = LEGACY_ORBIT_ROTATION_DEG / LEGACY_ORBIT_SPEED_DEG_PER_SEC;
      const speedFull360 = 360 / legacyOrbitDurationSec;
      const runCamera = () => {
        try {
          if (typeof map.setMaxPitch === 'function') {
            map.setMaxPitch(85);
          }
        } catch (_) {
          /* ignore */
        }
        let bearingStart = -38;
        try {
          bearingStart = map.getBearing();
        } catch (_) {
          /* keep default */
        }
        const bearingAfterZoom = bearingStart + zoomOrbitBearingDelta;
        try {
          map.setPitch(pitchZoomStart);
        } catch (_) {
          /* ignore */
        }
        const orbitPitchWave = {
          pitchWaveMin: 54,
          pitchWaveMax: 70,
          pitchWaveCycles: 2,
          pitchWaveInitial: pitchOrbitHigh,
        };
        if (orbitBounds) {
          map.fitBounds(orbitBounds, {
            duration: zoomMs,
            padding: { top: 62, bottom: 172, left: 62, right: 62 },
            maxZoom: 15.9,
            pitch: pitchOrbitHigh,
            bearing: bearingAfterZoom,
            essential: true,
          });
          scheduleOrbitAfterZoom(zoomMs, {
            speedDegPerSec: speedFull360,
            maxRotationDeg: 360,
            ...orbitPitchWave,
          });
        } else {
          const [lng, lat] = centerFromViewport();
          map.flyTo({
            center: [lng, lat],
            zoom: 15.35,
            pitch: pitchOrbitHigh,
            bearing: bearingAfterZoom,
            duration: zoomMs,
            essential: true,
          });
          scheduleOrbitAfterZoom(zoomMs, {
            speedDegPerSec: speedFull360,
            maxRotationDeg: 360,
            ...orbitPitchWave,
          });
        }
      };

      const basemapFn = applyTourPropertyBasemapRef?.current;
      const contextApplySeq = tourPlayback?.tourApplySeq;
      const contextSeqRef = tourPlayback?.tourApplySeqRef;
      const runIfCurrentSlide = () => {
        if (contextSeqRef && contextApplySeq != null && contextSeqRef.current !== contextApplySeq) {
          return;
        }
        runCamera();
      };
      if (typeof basemapFn === 'function') {
        void Promise.resolve(basemapFn())
          .then(runIfCurrentSlide)
          .catch(runIfCurrentSlide);
      } else {
        runIfCurrentSlide();
      }
      break;
    }
    case 'bird': {
      applyLayers(slide.layerPatch);
      try {
        map.setPitch(0);
        map.setBearing(0);
      } catch (_) {
        /* ignore */
      }
      if (bounds) {
        const birdPadding = { top: 16, bottom: 16, left: 16, right: 16 };
        const birdZoomOutOffset = 0.75;
        const viewport = {
          width: Number(map?.getContainer?.()?.clientWidth || 0),
          height: Number(map?.getContainer?.()?.clientHeight || 0),
        };
        const z = computeMaxContainedZoom(bounds, viewport, birdPadding, 19, 6);
        const c = map.cameraForBounds(bounds, {
          padding: birdPadding,
          maxZoom: 19,
          bearing: 0,
          pitch: 0,
        });
        if (c?.center && Number.isFinite(z)) {
          map.flyTo({
            center: c.center,
            zoom: Math.max(6, z - birdZoomOutOffset),
            pitch: 0,
            bearing: 0,
            duration: 1800,
            essential: true,
          });
        } else {
          map.fitBounds(bounds, {
            duration: 1800,
            padding: birdPadding,
            maxZoom: 19,
            pitch: 0,
            bearing: 0,
            essential: true,
          });
        }
      } else {
        const [lng, lat] = centerFromViewport();
        map.flyTo({
          center: [lng, lat],
          zoom: 16.8,
          pitch: 0,
          bearing: 0,
          duration: 1800,
          essential: true,
        });
      }
      break;
    }
    default:
      break;
  }
}
