/**
 * Land-ID-style print builder: map elements catalog (tool id → placement + category).
 *
 * Tabs: All | Points | Lines | Shapes. “Shapes” = drawable polygons only; markers and
 * one-click primitives (rectangle, triangle, diamond, SVG icons) are Points.
 */

export const MAP_ELEMENT_CATEGORY = {
  ALL: 'all',
  POINT: 'point',
  LINE: 'line',
  SHAPE: 'shape',
};

export const MAP_ELEMENT_ITEMS = [
  // Points
  { id: 'note', tool: 'note', label: 'Text', category: 'point', icon: '📝' },
  // Lines (ranching / map markup)
  { id: 'arrow', tool: 'arrow', label: 'Arrow', category: 'line', icon: '→' },
  {
    id: 'polyline_distance',
    tool: 'polyline_distance',
    label: 'Both direction arrow',
    category: 'line',
    icon: '↔',
  },
  {
    id: 'polyline_fence',
    tool: 'polyline_fence',
    label: 'Fence',
    category: 'line',
    icon: '🚧',
  },
  {
    id: 'polyline_pipeline_dash',
    tool: 'polyline_pipeline_dash',
    label: 'Pipeline (dashed)',
    category: 'line',
    icon: '⎍',
  },
  {
    id: 'polyline_pipeline',
    tool: 'polyline_pipeline',
    label: 'Pipeline',
    category: 'line',
    icon: '┃',
  },
  {
    id: 'polyline_primary_road',
    tool: 'polyline_primary_road',
    label: 'Paved road',
    category: 'line',
    icon: '▬',
  },
  {
    id: 'polyline_river',
    tool: 'polyline_river',
    label: 'River / creek',
    category: 'line',
    icon: '≋',
  },
  {
    id: 'polyline_single_track',
    tool: 'polyline_single_track',
    label: 'Road',
    category: 'line',
    icon: '╱',
  },
  {
    id: 'polyline_dirt_road',
    tool: 'polyline_dirt_road',
    label: 'Dirt road',
    category: 'line',
    icon: '▭',
  },
  {
    id: 'polyline_stream',
    tool: 'polyline_stream',
    label: 'Stream',
    category: 'line',
    icon: '〰',
  },
  {
    id: 'polyline_transmission',
    tool: 'polyline_transmission',
    label: 'Transmission line',
    category: 'line',
    icon: '⊥',
  },
  {
    id: 'polyline_boundary',
    tool: 'polyline_boundary',
    label: 'Boundary (red dash)',
    category: 'line',
    icon: '⛓️',
  },
  // Drawn polygons (click vertices, double-click to close) — “Shapes” tab only
  {
    id: 'polygon_general',
    tool: 'polygon_general',
    label: 'Area (general)',
    category: 'shape',
    icon: '⬡',
  },
  {
    id: 'polygon_water',
    tool: 'polygon_water',
    label: 'Water',
    category: 'shape',
    icon: '💧',
  },
  {
    id: 'polygon_boundary',
    tool: 'polygon_boundary',
    label: 'Boundary (red)',
    category: 'shape',
    icon: '🔴',
  },
  {
    id: 'polygon_hazard',
    tool: 'polygon_hazard',
    label: 'Hazard',
    category: 'shape',
    icon: '⚠️',
  },
  {
    id: 'polygon_park',
    tool: 'polygon_park',
    label: 'Park / open space',
    category: 'shape',
    icon: '🌲',
  },
];

/** Point icon tools sourced from /public/logos_for_print. */
const SVG_ICON_KEYS = [
  'bridgeWater',
  'cabin',
  'camera',
  'farm',
  'garageCar',
  'hiking',
  'horseSaddle',
  'houseChimney',
  'locationPinParking',
  'planeAlt',
  'school',
  'skiing',
  'skiingNordic',
  'swimmer',
  'tablePicnic',
];

const ICON_LABELS = {
  bridgeWater: 'Bridge',
  cabin: 'Cabin',
  camera: 'Photo Point',
  farm: 'Barn/Shed',
  garageCar: 'Garage',
  hiking: 'Trail Head',
  horseSaddle: 'Stable',
  houseChimney: 'Main Home',
  locationPinParking: 'Parking',
  planeAlt: 'Airport',
  school: 'School',
  skiing: 'Skiing',
  skiingNordic: 'Skiing Nordic',
  swimmer: 'Pool',
  tablePicnic: 'Park',
};

/** Human-readable name for a point icon `svgKey` (e.g. `bridgeWater` → "Bridge"). */
export function getPointIconCatalogLabel(svgKey) {
  if (!svgKey || typeof svgKey !== 'string') return '';
  if (ICON_LABELS[svgKey]) return ICON_LABELS[svgKey];
  const spaced = svgKey.replace(/([A-Z])/g, ' $1').trim();
  if (!spaced) return '';
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

SVG_ICON_KEYS.forEach((key) => {
  MAP_ELEMENT_ITEMS.push({
    id: `shape_${key}`,
    tool: `shape_${key}`,
    label: ICON_LABELS[key] || key,
    category: 'point',
    icon: '✶',
  });
});

/** Point tools in the print palette: text note plus one-click `shape_*` logo markers. */
export const PRINT_POINT_ICON_CATALOG = [
  { tool: 'note', label: 'Text' },
  ...SVG_ICON_KEYS.map((key) => ({
    tool: `shape_${key}`,
    label: ICON_LABELS[key] || key,
  })),
];
