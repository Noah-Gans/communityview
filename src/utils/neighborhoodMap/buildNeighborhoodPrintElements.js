/**
 * Build printElements for neighborhood maps: parcel boundary + home pin + numbered amenities.
 */
import * as turf from '@turf/turf';
import { getRegridParcelBoundaryCoordinates } from '../regridParcelBoundary';

/** Brighter category colors — easy to match pin ↔ legend. */
export const NEIGHBORHOOD_CATEGORY_COLORS = {
  dining: { fill: '#f97316', stroke: '#c2410c', rgb: [249, 115, 22] },
  coffee: { fill: '#a16207', stroke: '#854d0e', rgb: [161, 98, 7] },
  grocery: { fill: '#eab308', stroke: '#ca8a04', rgb: [234, 179, 8] },
  schools: { fill: '#2563eb', stroke: '#1d4ed8', rgb: [37, 99, 235] },
  fitness: { fill: '#f43f5e', stroke: '#e11d48', rgb: [244, 63, 94] },
  parks_rec: { fill: '#22c55e', stroke: '#16a34a', rgb: [34, 197, 94] },
  essentials: { fill: '#78716c', stroke: '#57534e', rgb: [120, 113, 108] },
};

function centroidOfSnapshot(snap) {
  if (!snap?.geometry) return null;
  try {
    const c = turf.centroid(turf.feature(snap.geometry));
    const [lng, lat] = c.geometry.coordinates;
    if (Number.isFinite(lat) && Number.isFinite(lng)) return { lng, lat };
  } catch (_) {
    /* fall through */
  }
  return null;
}

/**
 * Pin diameter in CSS px from map zoom — slightly larger when zoomed out
 * so neighborhood-scale views stay readable; grows a bit when zoomed in.
 */
export function amenityPinSizeForZoom(zoom, { forShare = false } = {}) {
  const z = Number(zoom);
  const baseZoom = Number.isFinite(z) ? z : 14.5;
  // At z14 ≈ 48px; zoom out → bigger screen footprint; zoom in → still bold.
  const raw = 48 + (15 - baseZoom) * 5;
  const size = Math.round(Math.max(40, Math.min(64, raw)));
  return forShare ? Math.max(42, size - 2) : size;
}

export function buildParcelBoundaryElements(snapshots) {
  const elements = [];
  (snapshots || []).forEach((snap, idx) => {
    const feature = { geometry: snap.geometry, properties: snap.seed || {} };
    let coords = getRegridParcelBoundaryCoordinates(feature);
    if (!coords && snap.geometry?.type === 'Polygon') {
      coords = (snap.geometry.coordinates?.[0] || [])
        .map((c) => ({ lng: c[0], lat: c[1] }))
        .slice(0, -1);
    }
    if (!coords || coords.length < 3) return;
    const ring = coords.map((c) => [c.lng, c.lat]);
    if (
      ring.length &&
      (ring[0][0] !== ring[ring.length - 1][0] || ring[0][1] !== ring[ring.length - 1][1])
    ) {
      ring.push([...ring[0]]);
    }
    elements.push({
      id: `nbhd_boundary_${idx}`,
      type: 'polygon',
      mapStyleVariant: 'boundary',
      label: '',
      showLabelOnMap: false,
      hiddenOnMap: false,
      geometry: { type: 'Polygon', coordinates: [ring] },
      fill: 'rgba(37, 99, 235, 0.12)',
      fillOpacity: 0.16,
      stroke: '#2563eb',
      strokeOpacity: 1,
      strokeWidth: 3.5,
    });
  });
  return elements;
}

/** Main home icon — dark disc + white house (matches amenity-map HTML pin). */
export function buildHomeMarkerElements(snapshots, { zoom, homePosition } = {}) {
  const amenitySize = amenityPinSizeForZoom(zoom);
  const size = Math.round(Math.max(amenitySize * 1.05, 44));

  const makeHome = (lng, lat, id, label = '') => ({
    id,
    type: 'shape',
    svgKey: 'houseChimney',
    label: label || '',
    showLabelOnMap: false,
    hiddenOnMap: false,
    geometry: { type: 'Point', coordinates: [lng, lat] },
    width: size,
    height: size,
    fill: '#111827',
    fillOpacity: 1,
    stroke: '#ffffff',
    strokeOpacity: 1,
    strokeWidth: 2.5,
    iconOpacity: 1,
    iconColor: '#ffffff',
    labelFontSize: 13,
    labelColor: '#0f172a',
    labelBackgroundColor: 'rgba(255,255,255,0.95)',
    labelAlignH: 'center',
    labelAlignV: 'top',
    labelFontFamily: 'Inter, system-ui, sans-serif',
  });

  const homeLat = Number(homePosition?.lat);
  const homeLng = Number(homePosition?.lng);
  if (Number.isFinite(homeLat) && Number.isFinite(homeLng)) {
    return [makeHome(homeLng, homeLat, 'nbhd_home')];
  }

  const elements = [];
  (snapshots || []).forEach((snap, idx) => {
    const c = centroidOfSnapshot(snap);
    if (!c) return;
    elements.push(makeHome(c.lng, c.lat, `nbhd_home_${idx}`, snap.address || ''));
  });
  return elements;
}

export function buildNumberedAmenityElements(amenities, { forShare = false, zoom } = {}) {
  const size = amenityPinSizeForZoom(zoom, { forShare });
  const labelSize = Math.max(12, Math.round(size * 0.28));
  return (amenities || [])
    .map((a) => {
      const lat = Number(a.lat);
      const lng = Number(a.lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
      const colors = NEIGHBORHOOD_CATEGORY_COLORS[a.amenityKey] || {
        fill: '#0f172a',
        stroke: '#020617',
      };
      const label = forShare ? `${a.number}. ${a.name}` : String(a.number);
      return {
        id: `nbhd_pin_${a.number}`,
        type: 'shape',
        svgKey: 'locationPinParking',
        label,
        showLabelOnMap: true,
        hiddenOnMap: false,
        geometry: { type: 'Point', coordinates: [lng, lat] },
        width: size,
        height: size,
        fill: colors.fill,
        fillOpacity: 1,
        stroke: '#ffffff',
        strokeOpacity: 1,
        strokeWidth: 3,
        iconOpacity: 0,
        labelFontSize: forShare ? Math.max(10, labelSize - 1) : labelSize,
        // Center white numerals on the pin disc (schools + all categories).
        labelColor: '#ffffff',
        labelBackgroundColor: 'rgba(255,255,255,0)',
        labelAlignH: 'center',
        labelAlignV: 'middle',
        labelFontFamily: 'Inter, system-ui, sans-serif',
      };
    })
    .filter(Boolean);
}

export function buildNeighborhoodPrintElements(snapshots, amenities, options = {}) {
  const zoom = options.zoom;
  // Draw order: boundary → amenity pins → home on top of parcel.
  return [
    ...buildParcelBoundaryElements(snapshots),
    ...buildNumberedAmenityElements(amenities, options),
    ...buildHomeMarkerElements(snapshots, {
      zoom,
      homePosition: options.homePosition || null,
    }),
  ];
}
