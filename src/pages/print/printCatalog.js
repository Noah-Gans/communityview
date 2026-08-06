/**
 * Land-ID-style print builder: map elements catalog (tool id → placement + category).
 *
 * Tabs: All | Points | Lines | Shapes. “Shapes” = drawable polygons only; markers and
 * one-click primitives (rectangle, triangle, diamond, SVG icons) are Points.
 */

import {
  POINT_ICON_KEYS,
  POINT_ICON_REGISTRY,
  getPointIconCatalogLabel,
} from './pointIconRegistry';

export { getPointIconCatalogLabel };

export const MAP_ELEMENT_CATEGORY = {
  ALL: 'all',
  POINT: 'point',
  LINE: 'line',
  SHAPE: 'shape',
};

export const MAP_ELEMENT_ITEMS = [
  // Points
  { id: 'note', tool: 'note', label: 'Text', category: 'point' },
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

POINT_ICON_KEYS.forEach((key) => {
  MAP_ELEMENT_ITEMS.push({
    id: `shape_${key}`,
    tool: `shape_${key}`,
    label: POINT_ICON_REGISTRY[key].label,
    category: 'point',
    icon: '✶',
  });
});

/** Point tools in the print palette: text note plus one-click `shape_*` logo markers. */
export const PRINT_POINT_ICON_CATALOG = [
  { tool: 'note', label: 'Text' },
  ...POINT_ICON_KEYS.map((key) => ({
    tool: `shape_${key}`,
    label: POINT_ICON_REGISTRY[key].label,
  })),
];
