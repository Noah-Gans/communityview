/**
 * Print point icons — single registry for files in /public/logos_for_print.
 *
 * To add a new point icon:
 * 1. Drop `your-icon.png` (or `.svg`) into `public/logos_for_print/`
 * 2. Add an entry below (camelCase key → file name + label)
 * 3. Restart dev server if the file was added while running
 */

/** @typedef {{ file: string, label: string, defaults?: { fill?: string, logoColor?: string, stroke?: string, strokeWidth?: number, fillOpacity?: number } }} PointIconDef */

/** @type {Record<string, PointIconDef>} */
export const POINT_ICON_REGISTRY = {
  bridgeWater: {
    file: 'bridge-water.svg',
    label: 'Bridge',
    defaults: { fill: '#2563eb', logoColor: '#ffffff', stroke: '#1e40af', strokeWidth: 2.5 },
  },
  cabin: {
    file: 'cabin.svg',
    label: 'Cabin',
    defaults: { fill: '#92400e', logoColor: '#ffffff', stroke: '#78350f', strokeWidth: 2.5 },
  },
  camera: {
    file: 'camera.svg',
    label: 'Photo Point',
    defaults: { fill: '#ffffff', logoColor: '#111827', stroke: '#111827', strokeWidth: 2.5 },
  },
  farm: {
    file: 'farm.svg',
    label: 'Barn/Shed',
    defaults: { fill: '#ffffff', logoColor: '#111827', stroke: '#111827', strokeWidth: 2.5 },
  },
  garageCar: {
    file: 'garage-car.svg',
    label: 'Garage',
    defaults: { fill: '#22c55e', logoColor: '#0f172a', stroke: '#15803d', strokeWidth: 2.5 },
  },
  hiking: {
    file: 'hiking.svg',
    label: 'Trail Head',
    defaults: { fill: '#92400e', logoColor: '#ffffff', stroke: '#78350f', strokeWidth: 2.5 },
  },
  horseSaddle: {
    file: 'horse-saddle.svg',
    label: 'Stable',
    defaults: { fill: '#ffffff', logoColor: '#111827', stroke: '#111827', strokeWidth: 2.5 },
  },
  houseChimney: {
    file: 'house-chimney.svg',
    label: 'Main Home',
    defaults: { fill: '#f97316', logoColor: '#0f172a', stroke: '#c2410c', strokeWidth: 2.5 },
  },
  locationPinParking: {
    file: 'location-pin-parking.svg',
    label: 'Parking',
    defaults: { fill: '#2563eb', logoColor: '#ffffff', stroke: '#1e40af', strokeWidth: 2.5 },
  },
  planeAlt: {
    file: 'plane-alt.svg',
    label: 'Airport',
    defaults: { fill: '#facc15', logoColor: '#0f172a', stroke: '#ca8a04', strokeWidth: 2.5 },
  },
  school: {
    file: 'school.svg',
    label: 'School',
    defaults: { fill: '#ffffff', logoColor: '#111827', stroke: '#111827', strokeWidth: 2.5 },
  },
  skiing: {
    file: 'skiing.svg',
    label: 'Skiing',
    defaults: { fill: '#ffffff', logoColor: '#111827', stroke: '#111827', strokeWidth: 2.5 },
  },
  skiingNordic: {
    file: 'skiing-nordic.svg',
    label: 'Skiing Nordic',
    defaults: { fill: '#ffffff', logoColor: '#111827', stroke: '#111827', strokeWidth: 2.5 },
  },
  swimmer: {
    file: 'swimmer.svg',
    label: 'Pool',
    defaults: { fill: '#2563eb', logoColor: '#ffffff', stroke: '#1e40af', strokeWidth: 2.5 },
  },
  tablePicnic: {
    file: 'table-picnic.svg',
    label: 'Park',
    defaults: { fill: '#16a34a', logoColor: '#ffffff', stroke: '#14532d', strokeWidth: 2.5 },
  },
  waterWell: {
    file: 'water-well.png',
    label: 'Water Well',
    defaults: { fill: '#2563eb', logoColor: '#ffffff', stroke: '#1e40af', strokeWidth: 2.5 },
  },
  standingWater: {
    file: 'water.svg',
    label: 'Standing Water',
    defaults: { fill: '#2563eb', logoColor: '#ffffff', stroke: '#1e40af', strokeWidth: 2.5 },
  },
  generalWater: {
    file: 'raindrops.svg',
    label: 'General Water',
    defaults: { fill: '#2563eb', logoColor: '#ffffff', stroke: '#1e40af', strokeWidth: 2.5 },
  },
  utility: {
    file: 'utility-pole.svg',
    label: 'Utility',
    defaults: { fill: '#78716c', logoColor: '#ffffff', stroke: '#44403c', strokeWidth: 2.5 },
  },
  electricity: {
    file: 'bolt.svg',
    label: 'Electricity General',
    defaults: { fill: '#eab308', logoColor: '#422006', stroke: '#ca8a04', strokeWidth: 2.5 },
  },
  waypoint: {
    file: 'marker.svg',
    label: 'Waypoint',
    defaults: { fill: '#ffffff', logoColor: '#111827', stroke: '#111827', strokeWidth: 2.5 },
  },
};

export const POINT_ICON_KEYS = Object.keys(POINT_ICON_REGISTRY);

/** @param {string} svgKey camelCase key (no `shape_` prefix) */
export function getPointIconDef(svgKey) {
  if (!svgKey || typeof svgKey !== 'string') return null;
  return POINT_ICON_REGISTRY[svgKey] || null;
}

/** Human-readable name for a point icon `svgKey` (e.g. `bridgeWater` → "Bridge"). */
export function getPointIconCatalogLabel(svgKey) {
  const def = getPointIconDef(svgKey);
  if (def?.label) return def.label;
  const spaced = String(svgKey).replace(/([A-Z])/g, ' $1').trim();
  if (!spaced) return '';
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/** Default badge + logo tint for map placement. */
export function getPointIconDefaultStyle(svgKey) {
  return getPointIconDef(svgKey)?.defaults;
}
