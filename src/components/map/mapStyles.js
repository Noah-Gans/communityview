// src/mapStyles.js

import {
  PRINCIPAL_AQUIFER_COLORS,
  SURFACE_WATER_BODY_FTYPE_COLORS,
  SURFACE_WATER_FLOWLINE_FTYPE_COLORS,
  SURFACE_WATER_FTYPE_MATCH_KEY,
  TRANSMISSION_VOLT_CLASS_COLORS,
  WETLAND_TYPE_COLORS,
} from '../../utils/hostedMapLayerConfig';

/** MVT `source-layer` ids inside hosted PMTiles archives (≠ map source id). */
export const PUBLIC_LAND_VECTOR_SOURCE_LAYER = 'public_lands';
export const CONSERVATION_EASEMENTS_VECTOR_SOURCE_LAYER = 'nced_easements';
/** Primary fill layer; archive also has `hu4_flowline` (lines). */
export const SURFACE_WATER_VECTOR_SOURCE_LAYER = 'hu4_waterbody';
export const SURFACE_WATER_FLOWLINE_VECTOR_SOURCE_LAYER = 'hu4_flowline';
export const WETLANDS_VECTOR_SOURCE_LAYER = 'wetlands';
export const BOUNDARIES_COUNTIES_VECTOR_SOURCE_LAYER = 'counties';
export const BOUNDARIES_CONGRESSIONAL_VECTOR_SOURCE_LAYER = 'congressional';
export const BOUNDARIES_PLACES_VECTOR_SOURCE_LAYER = 'places';
export const BOUNDARIES_URBAN_AREAS_VECTOR_SOURCE_LAYER = 'urban_areas';
export const BOUNDARIES_TRIBAL_LANDS_VECTOR_SOURCE_LAYER = 'tribal_lands';
export const OPPORTUNITY_ZONES_VECTOR_SOURCE_LAYER = 'opportunity_zones';
export const PRINCIPAL_AQUIFERS_VECTOR_SOURCE_LAYER = 'principal_aquifers';
export const TRANSMISSION_LINES_VECTOR_SOURCE_LAYER = 'transmission_lines';

/** Map layer id → MVT `source-layer` inside boundary PMTiles archives. */
export const BOUNDARY_MAP_LAYER_SOURCE_LAYERS = {
  boundaries_counties: BOUNDARIES_COUNTIES_VECTOR_SOURCE_LAYER,
  boundaries_congressional: BOUNDARIES_CONGRESSIONAL_VECTOR_SOURCE_LAYER,
  boundaries_places: BOUNDARIES_PLACES_VECTOR_SOURCE_LAYER,
  boundaries_urban_areas: BOUNDARIES_URBAN_AREAS_VECTOR_SOURCE_LAYER,
  boundaries_tribal_lands: BOUNDARIES_TRIBAL_LANDS_VECTOR_SOURCE_LAYER,
};

export function getVectorSourceLayerForMapLayer(layerName) {
  if (BOUNDARY_MAP_LAYER_SOURCE_LAYERS[layerName]) {
    return BOUNDARY_MAP_LAYER_SOURCE_LAYERS[layerName];
  }
  if (layerName === 'public_land') return PUBLIC_LAND_VECTOR_SOURCE_LAYER;
  if (layerName === 'conservation_easements') return CONSERVATION_EASEMENTS_VECTOR_SOURCE_LAYER;
  if (layerName === 'surface_water') return SURFACE_WATER_VECTOR_SOURCE_LAYER;
  if (layerName === 'wetlands') return WETLANDS_VECTOR_SOURCE_LAYER;
  if (layerName === 'opportunity_zones') return OPPORTUNITY_ZONES_VECTOR_SOURCE_LAYER;
  if (layerName === 'principal_aquifers') return PRINCIPAL_AQUIFERS_VECTOR_SOURCE_LAYER;
  if (layerName === 'transmission_lines') return TRANSMISSION_LINES_VECTOR_SOURCE_LAYER;
  return layerName;
}

/** National SSURGO archive uses one MVT layer per state (`soil_mupolygon_xx`). */
export const SOIL_STATE_CODES = [
  'ak', 'al', 'ar', 'az', 'ca', 'co', 'ct', 'de', 'fl', 'ga', 'hi', 'ia', 'id', 'il', 'in',
  'ks', 'ky', 'la', 'ma', 'md', 'me', 'mi', 'mn', 'mo', 'ms', 'mt', 'nc', 'nd', 'ne', 'nh',
  'nj', 'nm', 'nv', 'ny', 'oh', 'ok', 'or', 'pa', 'ri', 'sc', 'sd', 'tn', 'tx', 'ut', 'va',
  'vt', 'wa', 'wi', 'wv', 'wy',
];

export const soilMvtSourceLayerId = (stateCode) => `soil_mupolygon_${stateCode}`;

export const getSoilMapLayerId = (stateCode) => `soil-${stateCode}-layer`;

/** Regrid parcel stack (ownership toggle) — fill is transparent; outlines carry the visible style. */
export const REGRID_PARCEL_FILL_COLOR = '#000000';
/** Default parcel outlines on light / vector basemaps. */
export const REGRID_PARCEL_OUTLINE_COLOR = '#000000';
export const REGRID_PARCEL_OUTLINE_COLOR_LIGHT = '#ffffff';

/** True for aerial / satellite basemaps where dark parcel lines are hard to see. */
export function isImageryOrSatelliteBasemap(basemapId) {
  const id = String(basemapId || '')
    .trim()
    .toLowerCase();
  if (!id) return false;
  if (id.includes('imagery')) return true;
  if (id.includes('satellite')) return true;
  if (id.includes('ortho')) return true;
  if (id === 'esri-world-imagery') return true;
  return false;
}

export function getRegridParcelOutlineColorForBasemap(basemapId) {
  return isImageryOrSatelliteBasemap(basemapId)
    ? REGRID_PARCEL_OUTLINE_COLOR_LIGHT
    : REGRID_PARCEL_OUTLINE_COLOR;
}

/** Sync `regrid-parcels-outline` line color after basemap or layer stack changes. */
export function applyRegridParcelOutlineForBasemap(map, basemapId) {
  if (!map) return;
  try {
    if (typeof map.isStyleLoaded === 'function' && !map.isStyleLoaded()) return;
    if (!map.getStyle?.()) return;
    if (!map.getLayer('regrid-parcels-outline')) return;
    map.setPaintProperty(
      'regrid-parcels-outline',
      'line-color',
      getRegridParcelOutlineColorForBasemap(basemapId)
    );
  } catch (_) {
    /* layer or style may be mid-swap */
  }
}

/** NCED conservation easements — semi-transparent grey fill + white borders (line layer). */
export const CONSERVATION_EASEMENTS_GREY = '#9ca3af';
export const CONSERVATION_EASEMENTS_FILL_PAINT = {
  'fill-color': CONSERVATION_EASEMENTS_GREY,
  'fill-opacity': 0.42,
};
export const CONSERVATION_EASEMENTS_OUTLINE_PAINT = {
  'line-color': '#ffffff',
  'line-width': ['interpolate', ['linear'], ['zoom'], 7, 0.6, 11, 1, 14, 1.5],
  'line-opacity': 1,
};

/** Earth-tone fill by MUKEY — distinct units, readable on imagery and vector basemaps. */
export const SOIL_FILL_PAINT = {
  'fill-color': [
    'hsl',
    ['+', 22, ['%', ['to-number', ['coalesce', ['get', 'MUKEY'], 0]], 31], 18],
    ['+', 38, ['%', ['+', ['*', ['to-number', ['coalesce', ['get', 'MUKEY'], 0]], 19], 11], 38]],
    ['+', 46, ['%', ['+', ['*', ['to-number', ['coalesce', ['get', 'MUKEY'], 0]], 23], 17], 26]],
  ],
  'fill-opacity': 0.72,
  'fill-outline-color': '#5c4033',
};

/** PADUS `Own_Name` with legacy `SURFACE` fallback for older GeoJSON tiles. */
export const PUBLIC_LAND_OWNER_MATCH_KEY = [
  'coalesce',
  ['get', 'Own_Name'],
  ['get', 'own_name'],
  ['get', 'SURFACE'],
  ['get', 'surface'],
  '',
];

function resolveMatchKey(propertyOrExpr) {
  return Array.isArray(propertyOrExpr) ? propertyOrExpr : ['get', propertyOrExpr];
}

function buildMatchLinePaint(propertyOrExpr, colorMap, defaultColor) {
  const matchKey = resolveMatchKey(propertyOrExpr);
  const colorExpression = ['match', matchKey];
  Object.entries(colorMap).forEach(([value, color]) => {
    if (value === 'default') return;
    colorExpression.push(value, color);
  });
  colorExpression.push(defaultColor);
  return {
    'line-color': colorExpression,
    'line-width': ['interpolate', ['linear'], ['zoom'], 7, 0.6, 10, 1.2, 14, 2.5],
    'line-opacity': 0.9,
  };
}

function buildMatchFillPaint(propertyOrExpr, colorMap, defaultColor, defaultOpacity = 0.5, zeroOpacityValues = new Set()) {
  const matchKey = resolveMatchKey(propertyOrExpr);
  const colorExpression = ['match', matchKey];
  const opacityExpression = ['match', matchKey];
  Object.entries(colorMap).forEach(([value, color]) => {
    if (value === 'default') return;
    colorExpression.push(value, color);
    opacityExpression.push(value, zeroOpacityValues.has(value) ? 0 : defaultOpacity);
  });
  colorExpression.push(defaultColor);
  opacityExpression.push(defaultOpacity);
  return {
    'fill-color': colorExpression,
    'fill-opacity': opacityExpression,
  };
}

/** Per-feature hue from numeric GEOID (counties, districts, etc.). */
export function getGeoidHueFillPaint({ fillOpacity = 0.14 } = {}) {
  const geoNum = ['to-number', ['coalesce', ['get', 'GEOID'], ['get', 'GEOID20'], 0]];
  const hue = [
    'rgb',
    ['%', ['+', ['*', geoNum, 17], 70], 256],
    ['%', ['+', ['*', geoNum, 31], 90], 256],
    ['%', ['+', ['*', geoNum, 47], 110], 256],
  ];
  return {
    'fill-color': hue,
    'fill-opacity': fillOpacity,
    'fill-outline-color': '#334155',
  };
}

// Function to get the appropriate label field for each layer
export const getLabelFieldForLayer = (layerName) => {
  const labelMappings = {
    ownership: 'owner_name',
    public_land: 'Own_Name',
    conservation_easements: 'org_name',
    soil: 'MUSYM',
    surface_water: [
      'coalesce',
      ['get', 'GNIS_Name'],
      ['get', 'gnis_name'],
      ['get', 'name'],
      ['get', 'NAME'],
      '',
    ],
    wetlands: 'WETLAND_TYPE',
    boundaries_counties: 'NAMELSAD',
    boundaries_congressional: 'NAMELSAD',
    boundaries_places: 'NAME',
    boundaries_urban_areas: 'NAME20',
    boundaries_tribal_lands: 'NAME',
    opportunity_zones: 'STATE_NAME',
    principal_aquifers: 'AQ_NAME',
    transmission_lines: 'OWNER',
  };

  return labelMappings[layerName] || 'name';
};

// Define static color map for zoning codes
const zoningColorMaps = {
 toj: {
    "P/SP": "#FF69B4",
    "CR-2": "#FF8C00",
    "OR": "#8A2BE2",
    "CR-1": "#7FFF00",
    "PUD-NL-5": "#6495ED",
    "NL-5": "#FF4500",
    "PUD-NL-3": "#DC143C",
    "NL-2": "#00CED1",
    "PUD-NH-1": "#ADFF2F",
    "NH-1": "#4B0082",
    "NM-2": "#FFD700",
    "PR-SK": "#FF6347",
    "NL-3": "#40E0D0",
    "R": "#FF00FF",
    "NM-1": "#20B2AA",
    "MHP": "#8B0000",
    "NL-1": "#4682B4",
    "BP": "#FFDEAD",
    "CR-3": "#DA70D6",
    "PUD-UR": "#FF1493",
    "P": "#00BFFF",
    "CR-2": "#B22222",
    "DC-2": "#FFD700",
    "DC-1": "#228B22",
    "TS-1": "#D2691E",
    "TS-2": "#FF4500",
    "PUD-NL-3": "#2E8B57",
    "PUD-NM-2": "#9932CC",
    "PUD-NL-2": "#8B4513",
    "PR": "#00FA9A",
    "PUD-NM-2": "#C71585"
  },
  county: {
    'R1': '#1E90FF',        // Blue
    'R2': '#FF7F50',        // Coral
    'R3': '#32CD32',        // Lime Green
    'PUD R1': '#DAA520',    // Goldenrod
    'PUD R2': '#8A2BE2',    // Blue Violet
    'PUD R3': '#D2691E',    // Chocolate
    'PUD - NC': '#FFB6C1',  // Light Pink
    'P': '#FFD700',         // Gold
    'P/SP': '#FF4500',      // Orange Red
    'S': '#A52A2A',         // Brown
    'WC': '#00CED1',        // Dark Turquoise
    'WHB': '#9400D3',       // Dark Violet
    'NC': '#FF69B4',        // Hot Pink
    'NR-1': '#FF6347',      // Tomato
    'AR': '#ADFF2F',        // Green Yellow
    'BP': '#7FFF00',        // Chartreuse
    'PR': '#FF1493',        // Bright Pink
    'R': '#2E8B57'          // Sea Green
  },
    townOverlayColors: {
    'LDG': '#FFA07A',     // Light Salmon
    'DDO-2': '#87CEFA',   // Light Sky Blue
    'DDO-1': '#4682B4',   // Steel Blue
    'NRO': '#3CB371',     // Medium Sea Green
    'OUP': '#FFD700',     // Gold
    'SRO': '#FF6347'      // Tomato
  },
    countyOverlayColors: {
    'LDG 6': '#FF7F50',    // Coral
    'SRO': '#FF6347',      // Tomato
    'LDG 3': '#FFA07A',    // Light Salmon
    'LDG 2': '#FA8072',    // Salmon
    'NRO': '#3CB371',      // Medium Sea Green
    'SRO 3': '#FF4500',    // Orange Red
    'NRO 3': '#2E8B57',    // Sea Green
    'NRO 4': '#8FBC8F',    // Dark Sea Green
    'NRO 2': '#66CDAA',    // Medium Aquamarine
  },
    roadColors: {
    'US': '#FF0000',   // Bright Red for type US Highway
    'WY': '#0000FF',   // Bright Blue Wy Highway/Road
    'CO': '#FFA500',   // Bright Orange for County
    'CM': '#FFA500',   // Bright Orange for County
    'NP': '#FFFF00',   // Bright Yellow for type NP
    'np': '#FFFF00',   // Bright Yellow for type np (same as NP)
    'FS': '#32CD32',   // Bright Magenta for type FS
    'ID': '#FF69B4',   // Bright Red for type ID (Other State)
    'MT': '#FF69B4',   // Bright Pink for type MT (Other State)
    'JA': '#9c8f59',   // Bright Pink for type MT (Other State)
    // Bright Gold for type WY
  },
  publicLandColors: {
    // PADUS `Own_Name` (national fee layer)
    BLM: '#F4C430',
    FWS: '#FFA07A',
    USFS: '#77DD77',
    NPS: '#a670db',
    NRCS: '#4169E1',
    DOD: '#708090',
    DOE: '#9370DB',
    USACE: '#5F9EA0',
    USBR: '#4682B4',
    TVA: '#20B2AA',
    OTHF: '#A9A9A9',
    // Legacy `SURFACE` / Teton-style labels
    'Bureau of Land Management': '#F4C430',
    'Fish & Wildlife Service': '#FFA07A',
    'Forest Service': '#77DD77',
    'Local Government': '#DB35E0',
    'National Park Service': '#a670db',
    'Private': '#A9A9A9',
    'State': '#4169E1',
    'State (Wyoming Game & Fish)': '#4169E1',
    'Water': '#87CEEB',
    default: '#A9A9A9',
  },
  conservation_easements: {
    'Jackson Hole Land': '#006400', // Dark Green (unchanged - represents dense forests)
    'Teton County Scenic Preserve Trust': '#8B4513', // Saddle Brown (for preserved lands with trees and open spaces)
    'The Nature Conservancy': '#4682B4', // Steel Blue (introducing blue for environmental conservation & water-related areas)
    'Wyoming Game & Fish': '#D2691E', // Chocolate (to represent mixed wildlife and habitat)
    'Teton Regional Land Trust': '#FFD700', // Gold (to add variety and highlight regional uniqueness)
    'USFS': '#708090', // Slate Gray (unchanged, representing federal land)
  },
  
  precinctColorMap:{
    '01-01': '#00BFFF', // Red-Orange
    '01-02': '#33FF57', // Green
    '01-03': '#3357FF', // Blue
    '01-04': '#FF33A1', // Pink
    '01-05': '#A133FF', // Purple
    '01-06': '#FF8C00', // Dark Orange
    '01-07': '#FF5733', // Deep Sky Blue
    '01-08': '#FFD700', // Gold
    '01-09': '#32CD32', // Lime Green
    '01-10': '#FF1493', // Deep Pink
    '01-11': '#8A2BE2', // Blue Violet
    '02-01': '#DC143C', // Crimson
    '03-01': '#00CED1', // Dark Turquoise
    '04-01': '#FF4500', // Orange Red
    '04-02': '#2E8B57', // Sea Green
    '04-03': '#DA70D6', // Orchid
    '04-04': '#8FBC8F', // Dark Sea Green
    '05-01': '#6495ED', // Cornflower Blue
},
femaColorMap: {
  "AE": "#FF4500",  // Orange-Red (high-risk)
  "AO": "#FFA500",  // Orange (moderate risk)
  "AH": "#FFD700",  // Gold/Yellow (lower risk)
  "A": "#FF6347",   // Tomato (general high-risk zone)
}

};


export const loadCustomIcons = (map) => {
  if (!map) {
    console.error('Map instance not available');
    return;
  }

  map.on('load', () => {
    map.loadImage(
      'src/assets/images/icon/map-marker.jpg', // Path to your marker file
      (error, image) => {
        if (error) {
          console.error('Error loading custom marker icon:', error);
        } else {
          // Add the custom image to the map
          map.addImage('custom-home-marker', image);
        }
      }
    );
  });
};
  // src/mapStyles.js

// Define static color maps for different zoning codes

  
  // Function to get the color map for a specific zoning layer
  const getColorMapForLayer = (layerName) => {
    
    if (layerName === "zoning") {
      return zoningColorMaps.county;
    } else if (layerName == "zoning_toj_zoning") {
      return zoningColorMaps.toj;
    } else if (layerName === "zoning_toj_zoning_overlay") {
      return zoningColorMaps.townOverlayColors;
    }else if (layerName === "zoning_zoverlay") {
        return zoningColorMaps.countyOverlayColors;
    }else if (layerName === "roads") {
        return zoningColorMaps.roadColors;
    }else if (layerName == "public_land"){
      return zoningColorMaps.publicLandColors;
    }else if (layerName == "conservation_easements"){
      return zoningColorMaps.conservation_easements;
    }else if (layerName == "precincts"){
      return zoningColorMaps.precinctColorMap;
    }else if (layerName == "FEMA_updated"){
      return zoningColorMaps.femaColorMap;
    }

  
    return {}; // Default empty object if no color map is found
  };
  
  // Function to parse the description and extract zoning code and objectid
  const parseDescription = (htmlString) => {
    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlString, 'text/html');
    const rows = doc.querySelectorAll('tr');
  
    const properties = {};
    rows.forEach((row) => {
      const cells = row.querySelectorAll('th, td');
      if (cells.length === 2) {
        const key = cells[0].textContent.trim().toLowerCase().replace(/ /g, '_');
        const value = cells[1].textContent.trim();
        properties[key] = value;
      }
    });
  
    return properties;
  };
  
  // General function to get color based on zoning code from the provided color map
  const getZoningColor = (zoningCode, colorMap) => {
    return colorMap[zoningCode] || '#808080'; // Default to gray if zoning code is not mapped
  };
  
  // General function to get the zoning paint style based on features and the zoning layer name
  // General function to get the zoning paint style based on features and the zoning layer name
  export const getDynamicStyle = (features, layerName) => {
    if (!features || features.length === 0) {
      console.warn(`No features found to parse for layer: ${layerName}.`);
      return {
        'fill-color': '#808080', // Default color
        'fill-opacity': 0.5,
      };
    }
  
    // Get the color map for the given layer
    const colorMap = getColorMapForLayer(layerName);
  
    // Determine the property key based on the layer name
    let propertyKey;
    switch (layerName) {
      case 'roads':
        propertyKey = 'type';
        break;
      case 'zoning_toj_zoning_overlay':
      case 'zoning_zoverlay':
        propertyKey = 'overlay';
        break;
      case 'public_land':
        propertyKey = 'Own_Name';
        break;
      case 'conservation_easements':
        propertyKey = 'org_name'; // Use org_name for conservation easements
        break;
      default:
        propertyKey = 'zoning'; // Default to zoning
    }
  
    // Create a mapping of "Name" (e.g., "kml_249") to colors
    const featureColorMapping = {};
    features.forEach((feature) => {
      if (feature.properties) {
        let colorKey;
        let keyForMapping; // Key to use for featureColorMapping
        const { FLD_AR_ID, precinct, OBJECTID, Name, description } = feature.properties;
  
        if (layerName === 'public_land') {
          keyForMapping = OBJECTID;
          colorKey = (
            feature.properties.Own_Name ||
            feature.properties.own_name ||
            feature.properties.SURFACE
          )?.trim();
        } else if (layerName === 'conservation_easements' && description) {
          // Parse description to extract org_name
          const parsedProperties = parseDescription(description);
          keyForMapping = Name; // Use Name as the mapping key
          colorKey = parsedProperties[propertyKey]?.trim(); // Extract org_name
        } else if (layerName === 'FEMA_updated') {
          // Parse description to extract org_name
          
          keyForMapping = FLD_AR_ID;
          colorKey = feature.properties.FLD_ZONE; // Extract org_nameelse if (layerName === 'precincts') {
          // Parse description to extract org_name
          
        } else if (description) {
          // Parse description for other layers
          const parsedProperties = parseDescription(description);
          keyForMapping = Name; // Default key for non-public_land layers
          colorKey = parsedProperties[propertyKey]?.trim();
        }
        if (colorKey && keyForMapping) {
          console.log("Came here")
          const color = colorMap[colorKey] || '#808080'; // Default color if no match
          featureColorMapping[keyForMapping] = color;
        }
      }
    });
  
    // Create an expression for data-driven styling
    const matchKey = layerName === 'public_land' ? 'OBJECTID' 
              : layerName === 'precincts' ? 'precinct' 
              : layerName === 'FEMA_updated' ? 'FLD_AR_ID' 
              : 'Name';
    const colorExpression = ['match', ['get', matchKey]];
    const opacityExpression = ['match', ['get', layerName === 'public_land' ? 'OBJECTID' : 'Name']];
    Object.keys(featureColorMapping).forEach((key) => {
      // Convert key to number for Mapbox match expression
      const numericKey = layerName === 'public_land' ? parseInt(key, 10) : key;
      colorExpression.push(numericKey);
      colorExpression.push(featureColorMapping[key]);
  
      // Set opacity to 0 for "Private" and "Water," otherwise 0.5
      const isTransparent = 
        featureColorMapping[key] === zoningColorMaps.publicLandColors['Private'] || 
        featureColorMapping[key] === zoningColorMaps.publicLandColors['Water'];
      
      opacityExpression.push(numericKey); // Use numericKey here
      opacityExpression.push(isTransparent ? 0 : 0.5); // Fully transparent for Private and Water
    });
  
    colorExpression.push('#9c8f59'); // Default color if no match is found
    opacityExpression.push(0.5); // Default opacity if no match is found
  
    // Return style based on layer type
    if (layerName === 'roads') {
      return {
        'line-color': colorExpression,
        'line-width': 2,
      };
    } else {
      return {
        'fill-color': colorExpression,
        'fill-opacity': opacityExpression, // Use dynamic opacity expression
      };
    }
  };

export function getSurfaceWaterBodyFillPaint() {
  return {
    ...buildMatchFillPaint(
      SURFACE_WATER_FTYPE_MATCH_KEY,
      SURFACE_WATER_BODY_FTYPE_COLORS,
      SURFACE_WATER_BODY_FTYPE_COLORS.default,
      0.58
    ),
    'fill-outline-color': '#1e3a8a',
  };
}

export function getSurfaceWaterFlowlinePaint() {
  return buildMatchLinePaint(
    SURFACE_WATER_FTYPE_MATCH_KEY,
    SURFACE_WATER_FLOWLINE_FTYPE_COLORS,
    SURFACE_WATER_FLOWLINE_FTYPE_COLORS.default
  );
}

/** MVT layers styled from tile attributes — avoids empty paint → sourcedata repaint flicker on first toggle. */
const MVT_DATA_DRIVEN_FILL_LAYERS = {
  public_land: {
    property: PUBLIC_LAND_OWNER_MATCH_KEY,
    colorMap: zoningColorMaps.publicLandColors,
    zeroOpacityValues: new Set(['Private', 'Water']),
    defaultColor: '#9c8f59',
    defaultOpacity: 0.5,
  },
  wetlands: {
    property: 'WETLAND_TYPE',
    colorMap: WETLAND_TYPE_COLORS,
    zeroOpacityValues: new Set(),
    defaultColor: WETLAND_TYPE_COLORS.default,
    defaultOpacity: 0.52,
  },
  principal_aquifers: {
    property: 'AQ_NAME',
    colorMap: PRINCIPAL_AQUIFER_COLORS,
    zeroOpacityValues: new Set(),
    defaultColor: PRINCIPAL_AQUIFER_COLORS.default,
    defaultOpacity: 0.5,
  },
};

const MVT_DATA_DRIVEN_LINE_LAYERS = {
  transmission_lines: {
    property: 'VOLT_CLASS',
    colorMap: TRANSMISSION_VOLT_CLASS_COLORS,
    defaultColor: TRANSMISSION_VOLT_CLASS_COLORS.default,
  },
};

export function getDataDrivenFillPaintForLayer(layerName) {
  if (layerName === 'surface_water') return getSurfaceWaterBodyFillPaint();
  const spec = MVT_DATA_DRIVEN_FILL_LAYERS[layerName];
  if (spec) {
    return buildMatchFillPaint(
      spec.property,
      spec.colorMap,
      spec.defaultColor,
      spec.defaultOpacity,
      spec.zeroOpacityValues
    );
  }
  if (layerName === 'boundaries_counties') {
    return getGeoidHueFillPaint({ fillOpacity: 0.1 });
  }
  if (layerName === 'boundaries_congressional') {
    return getGeoidHueFillPaint({ fillOpacity: 0.14 });
  }
  if (layerName === 'boundaries_places') {
    return getGeoidHueFillPaint({ fillOpacity: 0.16 });
  }
  if (layerName === 'boundaries_urban_areas') {
    return getGeoidHueFillPaint({ fillOpacity: 0.2 });
  }
  if (layerName === 'boundaries_tribal_lands') {
    return getGeoidHueFillPaint({ fillOpacity: 0.18 });
  }
  return null;
}

export function getDataDrivenLinePaintForLayer(layerName) {
  const spec = MVT_DATA_DRIVEN_LINE_LAYERS[layerName];
  if (!spec) return null;
  return buildMatchLinePaint(spec.property, spec.colorMap, spec.defaultColor);
}

export const HOSTED_LAYER_DATA_DRIVEN_PAINT = new Set([
  ...Object.keys(MVT_DATA_DRIVEN_FILL_LAYERS),
  ...Object.keys(MVT_DATA_DRIVEN_LINE_LAYERS),
  'surface_water',
  'boundaries_counties',
  'boundaries_congressional',
  'boundaries_places',
  'boundaries_urban_areas',
  'boundaries_tribal_lands',
]);

  
  // Define styles for hosted vector tile layers
  export const layerStyles = {
    public_land: {
      id: 'public_land-layer',
      type: 'fill',
      'source-layer': PUBLIC_LAND_VECTOR_SOURCE_LAYER,
      paint: getDataDrivenFillPaintForLayer('public_land') || {},
      layout: {
        visibility: 'visible',
      },
    },
    conservation_easements: {
      id: 'conservation_easements-layer',
      type: 'fill',
      'source-layer': CONSERVATION_EASEMENTS_VECTOR_SOURCE_LAYER,
      paint: CONSERVATION_EASEMENTS_FILL_PAINT,
      layout: {
        visibility: 'visible',
      },
    },
    conservation_easements_outline: {
      id: 'conservation_easements-outline-layer',
      type: 'line',
      'source-layer': CONSERVATION_EASEMENTS_VECTOR_SOURCE_LAYER,
      paint: CONSERVATION_EASEMENTS_OUTLINE_PAINT,
      layout: { visibility: 'visible' },
    },
    soil: {
      id: 'soil-layer',
      type: 'fill',
      paint: SOIL_FILL_PAINT,
      layout: {
        visibility: 'visible',
      },
    },
    surface_water: {
      id: 'surface_water-layer',
      type: 'fill',
      'source-layer': SURFACE_WATER_VECTOR_SOURCE_LAYER,
      paint: getSurfaceWaterBodyFillPaint(),
      layout: {
        visibility: 'visible',
      },
    },
    surface_water_flowline: {
      id: 'surface_water-flowline-layer',
      type: 'line',
      'source-layer': SURFACE_WATER_FLOWLINE_VECTOR_SOURCE_LAYER,
      paint: getSurfaceWaterFlowlinePaint(),
      layout: {
        visibility: 'visible',
      },
    },
    wetlands: {
      id: 'wetlands-layer',
      type: 'fill',
      'source-layer': WETLANDS_VECTOR_SOURCE_LAYER,
      paint: {
        ...(getDataDrivenFillPaintForLayer('wetlands') || {
          'fill-color': '#52b788',
          'fill-opacity': 0.52,
        }),
        'fill-outline-color': '#14532d',
      },
      layout: {
        visibility: 'visible',
      },
    },
    boundaries_counties: {
      id: 'boundaries_counties-layer',
      type: 'fill',
      'source-layer': BOUNDARIES_COUNTIES_VECTOR_SOURCE_LAYER,
      paint: getDataDrivenFillPaintForLayer('boundaries_counties'),
      layout: { visibility: 'visible' },
    },
    boundaries_congressional: {
      id: 'boundaries_congressional-layer',
      type: 'fill',
      'source-layer': BOUNDARIES_CONGRESSIONAL_VECTOR_SOURCE_LAYER,
      paint: getDataDrivenFillPaintForLayer('boundaries_congressional'),
      layout: { visibility: 'visible' },
    },
    boundaries_places: {
      id: 'boundaries_places-layer',
      type: 'fill',
      'source-layer': BOUNDARIES_PLACES_VECTOR_SOURCE_LAYER,
      paint: getDataDrivenFillPaintForLayer('boundaries_places'),
      layout: { visibility: 'visible' },
    },
    boundaries_urban_areas: {
      id: 'boundaries_urban_areas-layer',
      type: 'fill',
      'source-layer': BOUNDARIES_URBAN_AREAS_VECTOR_SOURCE_LAYER,
      paint: getDataDrivenFillPaintForLayer('boundaries_urban_areas'),
      layout: { visibility: 'visible' },
    },
    boundaries_tribal_lands: {
      id: 'boundaries_tribal_lands-layer',
      type: 'fill',
      'source-layer': BOUNDARIES_TRIBAL_LANDS_VECTOR_SOURCE_LAYER,
      paint: getGeoidHueFillPaint({ fillOpacity: 0.18 }),
      layout: { visibility: 'visible' },
    },
    opportunity_zones: {
      id: 'opportunity_zones-layer',
      type: 'fill',
      'source-layer': OPPORTUNITY_ZONES_VECTOR_SOURCE_LAYER,
      paint: {
        'fill-color': '#f59e0b',
        'fill-opacity': 0.38,
        'fill-outline-color': '#b45309',
      },
      layout: { visibility: 'visible' },
    },
    principal_aquifers: {
      id: 'principal_aquifers-layer',
      type: 'fill',
      'source-layer': PRINCIPAL_AQUIFERS_VECTOR_SOURCE_LAYER,
      paint: getDataDrivenFillPaintForLayer('principal_aquifers') || {
        'fill-color': '#4a90d9',
        'fill-opacity': 0.5,
      },
      layout: { visibility: 'visible' },
    },
    transmission_lines: {
      id: 'transmission_lines-layer',
      type: 'line',
      'source-layer': TRANSMISSION_LINES_VECTOR_SOURCE_LAYER,
      paint: getDataDrivenLinePaintForLayer('transmission_lines') || {
        'line-color': '#475569',
        'line-width': 1.5,
        'line-opacity': 0.9,
      },
      layout: { visibility: 'visible' },
    },
    wildfire_hazard: {
      id: 'wildfire_hazard-layer',
      type: 'raster',
      paint: {
        'raster-opacity': 0.68,
        'raster-fade-duration': 0,
      },
      layout: { visibility: 'visible' },
    },
  };
  
  // Updated `getLayerStyle` function
  export const getLayerStyle = (layerName, features, baseMap) => {
    console.log('Getting style for layer:', layerName);
    console.log(baseMap)
    // Get the base style from layerStyles
    let style = layerStyles[layerName];
    console.log('Layer Name:', layerName);
  
    const featureScannedPaintLayers = ['public_land'];
    const mvtAttributePaintLayers = [
      'wetlands',
      'surface_water',
      'principal_aquifers',
      'transmission_lines',
      'boundaries_counties',
      'boundaries_congressional',
      'boundaries_places',
      'boundaries_urban_areas',
      'boundaries_tribal_lands',
      ...featureScannedPaintLayers,
    ];
    console.log(mvtAttributePaintLayers.includes(layerName))
    console.log(style)
    console.log(layerName.toLowerCase().includes('plss'))
    if (style) {
        if (mvtAttributePaintLayers.includes(layerName)) {
            console.log("Applying dynamic style for layer: ", layerName );
            const paint =
              featureScannedPaintLayers.includes(layerName) && features?.length > 0
                ? getDynamicStyle(features, layerName)
                : style?.type === 'line'
                  ? getDataDrivenLinePaintForLayer(layerName)
                  : getDataDrivenFillPaintForLayer(layerName);
            console.log('Generated Paint:', paint);
            style = {
                ...style,
                paint:
                  paint ||
                  (style?.type === 'line'
                    ? getDataDrivenLinePaintForLayer(layerName)
                    : getDataDrivenFillPaintForLayer(layerName)),
                source: layerName,
            };
        }
         else {
            console.log("came here edditing layers =============================================")
            style = {
                ...style,
                source: layerName, // Set the source to match the layer name
            };
            console.log(layerName)
            console.log(baseMap.current)
            console.log("Will return this style: ", style);
        }
      return style;
    }
    if (layerName.toLowerCase().includes('plss')) {
        // Special styling for layers that have "plss" in their name
        console.log("Applying special styling for PLSS layer");
        return {
            id: `${layerName}-layer`,
            type: 'fill', // Polygon fill type for clickability
            source: layerName,
            'source-layer': layerName,
            paint: {
                'fill-color': 'rgba(0, 0, 0, 0)', // Fully transparent fill
                'fill-outline-color': '#000000', // Black outline
                'fill-opacity': 1, // No opacity
            },
            layout: {
                visibility: 'visible',
            },
        };
    }

    // If no style is found for the given layer, return a default style for testing purposes
    console.warn(`No style found for layer: ${layerName}. Using default style.`);
    let defaultPaint;
    let defaultLayout = {}; // Initialize defaultLayout
    let layerType;
    console.log(layerName);

    switch (layerName) {
      case 'control_points_controls': // For points
        layerType = 'circle';
        defaultPaint = {
          'circle-radius': 6,
          'circle-color': '#FF0000', // Red for testing visibility
          'circle-stroke-width': 1,
          'circle-stroke-color': '#000000', // Black outline for points
        };
        break;

      case 'precincts_polling_centers': // For points (NO CLUSTERING)
      layerType = 'circle';
      defaultPaint = {
        'circle-radius': 6,
        'circle-color': '#FF0000', // Red for testing visibility
        'circle-stroke-width': 1,
        'circle-stroke-color': '#000000', // Black outline for points
      };
      style = {
        id: 'precincts-polling-centers-layer',
        type: layerType,
        source: {
          type: 'geojson',
          data: 'src/assets/data/precincts_polling_centers.geojson',
          cluster: false, // Enable clustering // Ensure correct path

          // No clustering properties included here
        },
        paint: defaultPaint,
        layout: defaultLayout,
      };
      break;
      

      case 'plss_plss_labels': // For point labels
        layerType = 'symbol'; // Use symbol type for labels
        defaultPaint = {
          'text-color': '#000000', // Black text
          'text-halo-color': '#FFFFFF', // White halo for better readability
          'text-halo-width': 1,
        };
        defaultLayout = {
          'text-field': ['get', 'label'], // Ensure the "label" property exists in the features
          'text-size': 14, // Adjust text size
          'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold'], // Specify font
          'text-anchor': 'center', // Center the label
          visibility: 'visible',
        };
        break;

      case 'roads_easements': // Example for lines
        layerType = 'line';
        defaultPaint = {
          'line-color': '#896B3D', // Blue for roads
          'line-width': 1.25,
        };
        break;

      default: // Polygons (default)
        layerType = 'fill';
        defaultPaint = {
          'fill-color': '#FF00FF', // Magenta for testing visibility
          'fill-opacity': 0.5,
          'fill-outline-color': '#000000', // Black border for polygons
        };
        break;
    }

    return {
      id: `${layerName}-layer`,
      type: layerType,
      source: layerName,
      'source-layer': layerName,
      paint: defaultPaint,
      layout: {
        ...defaultLayout, // Include layout properties
        visibility: 'visible',
      },
    };
}

// Function to create label layer style for a given layer
/** @param {string} layerName */
/** @param {{ regridVectorSourceLayer?: string }} [options] — for `ownership`, MVT source-layer id from Regrid TileJSON */
export const getLabelLayerStyle = (layerName, options = {}) => {
  const { regridVectorSourceLayer } = options;

  // Ownership UI toggles labels on the same parcel geometries as Regrid outlines (centroid labels).
  if (layerName === 'ownership') {
    const sourceLayer = regridVectorSourceLayer || 'parcels';
    return {
      id: 'ownership-label-layer',
      type: 'symbol',
      source: 'regrid-parcels',
      'source-layer': sourceLayer,
      layout: {
        'symbol-placement': 'point',
        'text-field': ['coalesce', ['get', 'owner'], ['get', 'owner_name']],
        'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold'],
        'text-size': 11,
        'text-anchor': 'center',
        'text-justify': 'center',
        'text-offset': [0, 0],
        'text-allow-overlap': false,
        'text-ignore-placement': false,
        visibility: 'visible',
      },
      paint: {
        'text-color': '#0f172a',
        'text-halo-color': '#ffffff',
        'text-halo-width': 2,
        'text-halo-blur': 0.5,
      },
      minzoom: 14,
      maxzoom: 21,
    };
  }

  const labelField = getLabelFieldForLayer(layerName);
  const sourceLayer = getVectorSourceLayerForMapLayer(layerName);
  const textField =
    layerName === 'public_land'
      ? PUBLIC_LAND_OWNER_MATCH_KEY
      : Array.isArray(labelField)
        ? labelField
        : ['get', labelField];

  console.log(`Creating label layer for ${layerName}:`, {
    labelField,
    sourceLayer,
    source: layerName,
  });

  return {
    id: `${layerName}-label-layer`,
    type: 'symbol',
    source: layerName,
    'source-layer': sourceLayer,
    layout: {
      'text-field': textField,
      'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold'],
      'text-size': 12,
      'text-anchor': 'center',
      'text-offset': [0, 0],
      'text-allow-overlap': false,
      'text-ignore-placement': false,
      visibility: 'visible',
    },
    paint: {
      'text-color': '#000000',
      'text-halo-color': '#FFFFFF',
      'text-halo-width': 2,
      'text-halo-blur': 1,
    },
  };
};
  
  
  
  
  
  