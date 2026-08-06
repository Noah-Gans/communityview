import { DEFAULT_MAP_LABEL_PROPS } from './mapLabelUtils';
import { getPointIconDefaultStyle } from './pointIconDefaultStyles';
import { getPointIconCatalogLabel } from './printCatalog';

const DEFAULT_STYLE = {
  fill: '#ffffff',
  stroke: '#000000',
  strokeWidth: 2,
  fillOpacity: 1,
  strokeOpacity: 1,
};

/** Presets for polygon_* tools (filled areas). */
export const POLYGON_VARIANT_STYLES = {
  general: {
    fill: '#9ca3af',
    stroke: '#ffffff',
    fillOpacity: 0.42,
    strokeOpacity: 1,
    strokeWidth: 2.5,
  },
  water: {
    fill: '#3b82f6',
    stroke: '#1e3a8a',
    fillOpacity: 0.35,
    strokeOpacity: 1,
    strokeWidth: 2,
  },
  boundary: {
    fill: 'rgba(0, 0, 0, 0)',
    stroke: '#ff2222',
    fillOpacity: 0,
    strokeOpacity: 1,
    strokeWidth: 6,
    lineDasharray: null,
  },
  hazard: {
    fill: '#f97316',
    stroke: '#9a3412',
    fillOpacity: 0.28,
    strokeOpacity: 1,
    strokeWidth: 2,
  },
  park: {
    fill: '#22c55e',
    stroke: '#14532d',
    fillOpacity: 0.22,
    strokeOpacity: 1,
    strokeWidth: 2,
  },
};

/** Presets for polyline_* tools (open lines). */
export const POLYLINE_VARIANT_STYLES = {
  stream: {
    stroke: '#1d4ed8',
    strokeWidth: 4.5,
    strokeOpacity: 1,
    lineDasharray: '2 5',
  },
  fence: {
    stroke: '#ffffff',
    strokeWidth: 3.2,
    strokeOpacity: 1,
    lineDasharray: '2 5',
    strokeLinecap: 'round',
    fenceOutlineStroke: '#0f172a',
    fenceOutlineWidth: 5,
    fenceOutlineOpacity: 0.38,
  },
  /** Legacy saved maps */
  trail: {
    stroke: '#57534e',
    strokeWidth: 2,
    strokeOpacity: 1,
    lineDasharray: '4 4',
  },
  boundary: {
    stroke: '#b91c1c',
    strokeWidth: 2,
    strokeOpacity: 1,
    lineDasharray: '10 5',
  },
  distance: {
    stroke: '#ca8a04',
    strokeWidth: 3,
    strokeOpacity: 1,
    lineDasharray: null,
    arrowHead: 'both',
  },
  pipeline: {
    stroke: '#6d28d9',
    strokeWidth: 3,
    strokeOpacity: 1,
    lineDasharray: null,
  },
  pipeline_dash: {
    stroke: '#7c3aed',
    strokeWidth: 2.5,
    strokeOpacity: 1,
    lineDasharray: '7 6',
  },
  primary_road: {
    stroke: '#0f172a',
    strokeWidth: 6.5,
    strokeOpacity: 1,
    lineDasharray: null,
    strokeLinecap: 'round',
    roadMarkingStroke: '#facc15',
    roadMarkingWidth: 3,
    roadMarkingDasharray: '2 14',
    roadMarkingLinecap: 'round',
  },
  river: {
    stroke: '#0369a1',
    strokeWidth: 3.5,
    strokeOpacity: 1,
    lineDasharray: null,
  },
  single_track: {
    stroke: '#6b7280',
    strokeWidth: 4.8,
    strokeOpacity: 1,
    lineDasharray: null,
    strokeLinecap: 'round',
  },
  dirt_road: {
    stroke: '#8b5a2b',
    strokeWidth: 6.2,
    strokeOpacity: 1,
    lineDasharray: null,
    strokeLinecap: 'round',
    roadMarkingStroke: '#ffffff',
    roadMarkingWidth: 2.6,
    roadMarkingDasharray: null,
    roadMarkingLinecap: 'round',
  },
  transmission: {
    stroke: '#0f172a',
    strokeWidth: 2,
    strokeOpacity: 1,
    lineDasharray: null,
    transmissionTicks: true,
  },
};

const nextId = () =>
  `ann_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

const defaultLabelForTool = (tool, variant) => {
  if (tool === 'polygon' && variant === 'boundary') return 'Property Boundary';
  if (tool === 'polygon') return `${variant || 'general'} area`;
  if (tool === 'polyline') return `${variant || 'line'} line`;
  if (tool === 'shape') return getPointIconCatalogLabel(variant) || 'Point';
  if (tool === 'note') return 'text';
  return tool || 'feature';
};

/**
 * Placement flow: polygon_* / polyline_* are drawn on map; others single-click place.
 */
export function parsePrintPlacementTool(tool) {
  if (!tool || tool === 'select') return { mode: 'none' };
  if (tool === 'polygon' || tool.startsWith('polygon_')) {
    const variant = tool === 'polygon' ? 'general' : tool.slice('polygon_'.length);
    return { mode: 'polygon', variant };
  }
  if (tool.startsWith('polyline_')) {
    const variant = tool.slice('polyline_'.length);
    return { mode: 'polyline', variant };
  }
  if (tool.startsWith('shape_')) {
    return { mode: 'single', tool: 'shape', shapeSvgKey: tool.slice('shape_'.length) };
  }
  return { mode: 'single', tool };
}

export const annotationCapabilities = {
  note: {
    supportsFill: true,
    supportsStroke: true,
    supportsText: true,
    supportsRotation: false,
  },
  arrow: {
    supportsFill: false,
    supportsStroke: true,
    supportsText: false,
    supportsRotation: false,
  },
  polyline: {
    supportsFill: false,
    supportsStroke: true,
    supportsText: false,
    supportsRotation: false,
  },
  legend: {
    supportsFill: false,
    supportsStroke: false,
    supportsText: false,
    supportsRotation: false,
  },
  compass: {
    supportsFill: false,
    supportsStroke: false,
    supportsText: false,
    supportsRotation: false,
  },
  shape: {
    supportsFill: true,
    supportsStroke: true,
    supportsText: false,
    supportsRotation: true,
  },
  rectangle: {
    supportsFill: true,
    supportsStroke: true,
    supportsText: false,
    supportsRotation: true,
  },
  diamond: {
    supportsFill: true,
    supportsStroke: true,
    supportsText: false,
    supportsRotation: true,
  },
  triangle: {
    supportsFill: true,
    supportsStroke: true,
    supportsText: false,
    supportsRotation: true,
  },
  pin: {
    supportsFill: true,
    supportsStroke: true,
    supportsText: false,
    supportsRotation: true,
  },
  polygon: {
    supportsFill: true,
    supportsStroke: true,
    supportsText: false,
    supportsRotation: false,
  },
};

export const getTypeFromTool = (tool) => {
  const parsed = parsePrintPlacementTool(tool);
  if (parsed.mode === 'polygon') return 'polygon';
  if (parsed.mode === 'polyline') return 'polyline';
  if (parsed.tool === 'shape' && parsed.shapeSvgKey) return 'shape';
  return parsed.tool || tool;
};

export function createAnnotationFromTool(tool, lngLat, options = {}) {
  if (!lngLat) return null;

  const placement = parsePrintPlacementTool(tool);

  if (placement.mode === 'polygon') {
    const coords = Array.isArray(options.coordinates)
      ? options.coordinates.map((p) => (Array.isArray(p) ? p : [p.lng, p.lat]))
      : [];
    if (coords.length < 3) return null;
    const ring = [...coords, coords[0]];
    const style = POLYGON_VARIANT_STYLES[placement.variant] || POLYGON_VARIANT_STYLES.general;
    return {
      id: nextId(),
      type: 'polygon',
      schemaVersion: 2,
      placementMode: 'geo',
      mapStyleVariant: placement.variant,
      geometry: {
        type: 'Polygon',
        coordinates: [ring],
      },
      width: 0,
      height: 0,
      rotation: 0,
      ...DEFAULT_STYLE,
      ...style,
      ...(options.style || {}),
      label: options.label || defaultLabelForTool('polygon', placement.variant),
      description: options.description || '',
      showLabelOnMap: false,
      areaSqMeters: options.metrics?.areaSqMeters ?? null,
      perimeterMeters: options.metrics?.perimeterMeters ?? null,
      zIndex: 0,
      // Parcel identity for report / amenity generation from saved maps
      ...(options.parcelProperties
        ? { parcelProperties: options.parcelProperties }
        : {}),
      ...(options.ll_uuid ? { ll_uuid: options.ll_uuid } : {}),
      ...(options.path ? { path: options.path } : {}),
      ...DEFAULT_MAP_LABEL_PROPS,
    };
  }

  if (placement.mode === 'polyline') {
    const coords = Array.isArray(options.coordinates)
      ? options.coordinates.map((p) => (Array.isArray(p) ? p : [p.lng, p.lat]))
      : [];
    if (coords.length < 2) return null;
    const style = POLYLINE_VARIANT_STYLES[placement.variant] || POLYLINE_VARIANT_STYLES.stream;
    const extraLineStyle = {
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
    return {
      id: nextId(),
      type: 'polyline',
      schemaVersion: 2,
      placementMode: 'geo',
      mapStyleVariant: placement.variant,
      geometry: {
        type: 'LineString',
        coordinates: coords,
      },
      width: 0,
      height: 0,
      rotation: 0,
      fill: 'transparent',
      fillOpacity: 0,
      stroke: style.stroke,
      strokeWidth: style.strokeWidth,
      strokeOpacity: style.strokeOpacity ?? 1,
      lineDasharray: style.lineDasharray || null,
      strokeLinecap: style.strokeLinecap || 'round',
      strokeLinejoin: style.strokeLinejoin || 'round',
      arrowHead: style.arrowHead || 'none',
      transmissionTicks: !!style.transmissionTicks,
      ...extraLineStyle,
      ...(options.style || {}),
      label: options.label || defaultLabelForTool('polyline', placement.variant),
      description: options.description || '',
      showLabelOnMap: false,
      lengthMeters: options.metrics?.lengthMeters ?? null,
      zIndex: 0,
      ...DEFAULT_MAP_LABEL_PROPS,
    };
  }

  const type = placement.tool;
  if (!type) return null;

  const shapeSvgKey = placement.shapeSvgKey;

  const base = {
    id: nextId(),
    type,
    schemaVersion: 2,
    placementMode: 'geo',
    geometry: {
      type: 'Point',
      coordinates: [lngLat.lng, lngLat.lat],
    },
    width: 120,
    height: 80,
    rotation: 0,
    ...DEFAULT_STYLE,
    zIndex: 0,
    label:
      options.label ||
      defaultLabelForTool(type, type === 'shape' ? options.svgKey || shapeSvgKey : placement.variant),
    description: options.description || '',
    showLabelOnMap: false,
    ...DEFAULT_MAP_LABEL_PROPS,
  };

  if (type === 'note') {
    return {
      ...base,
      width: 220,
      height: 120,
      text: options.text || 'Type something…',
      fontColor: '#111827',
      fontSize: 14,
      fontFamily: 'Inter, system-ui, sans-serif',
      textAlign: 'left',
      textVerticalAlign: 'top',
      fill: '#ffffff',
      fillOpacity: 1,
      stroke: '#111827',
      strokeWidth: 1,
      strokeOpacity: 0.15,
    };
  }

  if (type === 'arrow') {
    const provided = Array.isArray(options.coordinates) ? options.coordinates : null;
    const normalized =
      provided && provided.length >= 2
        ? provided.map((p) => (Array.isArray(p) ? p : [p.lng, p.lat]))
        : null;
    return {
      ...base,
      geometry: {
        type: 'LineString',
        coordinates:
          normalized ||
          [
            [lngLat.lng - 0.002, lngLat.lat - 0.001],
            [lngLat.lng + 0.002, lngLat.lat + 0.001],
          ],
      },
      stroke: '#d97706',
      strokeWidth: 3,
      strokeOpacity: 1,
      lineDasharray: null,
      lengthMeters: options.metrics?.lengthMeters ?? null,
      ...DEFAULT_MAP_LABEL_PROPS,
    };
  }

  if (type === 'legend') {
    return {
      ...base,
      width: 260,
      height: 160,
    };
  }

  if (type === 'compass') {
    return {
      ...base,
      width: 60,
      height: 60,
    };
  }

  if (type === 'shape') {
    const gallery =
      Array.isArray(options.photoGallery) && options.photoGallery.length
        ? options.photoGallery.filter(Boolean)
        : null;
    const svgKey = options.svgKey || shapeSvgKey || 'triangle';
    const iconDefaults = getPointIconDefaultStyle(svgKey);
    return {
      ...base,
      width: 70,
      height: 70,
      svgKey,
      ...(gallery?.length ? { photoGallery: gallery } : {}),
      ...(iconDefaults || {}),
    };
  }

  return {
    ...base,
    width: 100,
    height: 100,
  };
}
