/**
 * Default badge (fill) + logo tint (logoColor) for print point tools (`shape_*` / svgMap keys).
 * Ring uses `stroke` (slightly darker than fill where helpful).
 */
const POINT_ICON_DEFAULTS = {
  bridgeWater: {
    fill: '#2563eb',
    logoColor: '#ffffff',
    stroke: '#1e40af',
    strokeWidth: 2.5,
  },
  cabin: {
    fill: '#92400e',
    logoColor: '#ffffff',
    stroke: '#78350f',
    strokeWidth: 2.5,
  },
  hiking: {
    fill: '#92400e',
    logoColor: '#ffffff',
    stroke: '#78350f',
    strokeWidth: 2.5,
  },
  houseChimney: {
    fill: '#f97316',
    logoColor: '#0f172a',
    stroke: '#c2410c',
    strokeWidth: 2.5,
  },
  locationPinParking: {
    fill: '#2563eb',
    logoColor: '#ffffff',
    stroke: '#1e40af',
    strokeWidth: 2.5,
  },
  garageCar: {
    fill: '#22c55e',
    logoColor: '#0f172a',
    stroke: '#15803d',
    strokeWidth: 2.5,
  },
  swimmer: {
    fill: '#0284c7',
    logoColor: '#ffffff',
    stroke: '#0369a1',
    strokeWidth: 2.5,
  },
  planeAlt: {
    fill: '#facc15',
    logoColor: '#0f172a',
    stroke: '#ca8a04',
    strokeWidth: 2.5,
  },
  tablePicnic: {
    fill: '#16a34a',
    logoColor: '#ffffff',
    stroke: '#14532d',
    strokeWidth: 2.5,
  },
};

/**
 * @param {string} svgKey — e.g. `bridgeWater`, `garageCar` (camelCase, not `shape_` prefix)
 * @returns {object | undefined} style fields to merge onto a print shape element
 */
export function getPointIconDefaultStyle(svgKey) {
  if (!svgKey || typeof svgKey !== 'string') return undefined;
  return POINT_ICON_DEFAULTS[svgKey];
}
