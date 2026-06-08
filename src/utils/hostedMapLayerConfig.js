import { isRegridParcelPolygonFeature } from './regridParcelBoundary';

/** Mapbox layer id → toggle id in `layerStatus` / SidePanel. */
export const MAP_LAYER_ID_TO_TOGGLE = {
  'public_land-layer': 'public_land',
  'conservation_easements-layer': 'conservation_easements',
  'conservation_easements-outline-layer': 'conservation_easements',
  'surface_water-layer': 'surface_water',
  'surface_water-flowline-layer': 'surface_water',
  'wetlands-layer': 'wetlands',
  'boundaries_counties-layer': 'boundaries_counties',
  'boundaries_congressional-layer': 'boundaries_congressional',
  'boundaries_places-layer': 'boundaries_places',
  'boundaries_urban_areas-layer': 'boundaries_urban_areas',
  'boundaries_tribal_lands-layer': 'boundaries_tribal_lands',
  'opportunity_zones-layer': 'opportunity_zones',
  'principal_aquifers-layer': 'principal_aquifers',
  'transmission_lines-layer': 'transmission_lines',
  'wildfire_hazard-layer': 'wildfire_hazard',
};

/** Side panel + info fields per hosted layer (MVT attributes). */
export const HOSTED_LAYER_INFO_FIELDS = {
  public_land: [
    { label: 'Owner', keys: ['Own_Name', 'own_name', 'SURFACE', 'surface'] },
    { label: 'Unit', keys: ['Unit_Nm', 'unit_nm'] },
    { label: 'Access', keys: ['Pub_Access', 'pub_access'] },
    { label: 'Area ID', keys: ['OBJECTID', 'objectid'] },
  ],
  conservation_easements: [
    { label: 'Organization', keys: ['org_name', 'ORG_NAME'] },
    { label: 'Name', keys: ['Name', 'name'] },
    { label: 'Area ID', keys: ['OBJECTID', 'objectid'] },
  ],
  soil: [
    { label: 'Map unit symbol', keys: ['MUSYM', 'musym'] },
    { label: 'Map unit key', keys: ['MUKEY', 'mukey'] },
    { label: 'Survey area', keys: ['AREASYMBOL', 'areasymbol'] },
  ],
  surface_water: [
    { label: 'Name', keys: ['GNIS_Name', 'gnis_name', 'name', 'NAME'] },
    { label: 'Feature type', keys: ['FType', 'FCode', 'ftype'], format: 'nhdFtype' },
    { label: 'Reach code', keys: ['ReachCode', 'reachcode'] },
  ],
  wetlands: [
    { label: 'Wetland type', keys: ['WETLAND_TYPE', 'wetland_type'] },
    { label: 'Attribute', keys: ['ATTRIBUTE', 'attribute'] },
    { label: 'Class', keys: ['CLASS', 'class'] },
    { label: 'Area ID', keys: ['OBJECTID', 'objectid'] },
  ],
  boundaries_counties: [
    { label: 'Name', keys: ['NAMELSAD', 'NAME', 'name'] },
    { label: 'GEOID', keys: ['GEOID', 'geoid'] },
  ],
  boundaries_congressional: [
    { label: 'District', keys: ['NAMELSAD', 'NAME', 'name'] },
    { label: 'GEOID', keys: ['GEOID', 'geoid'] },
  ],
  boundaries_places: [
    { label: 'Place', keys: ['NAME', 'name', 'NAMELSAD'] },
    { label: 'GEOID', keys: ['GEOID', 'geoid'] },
  ],
  boundaries_urban_areas: [
    { label: 'Urban area', keys: ['NAME20', 'name', 'NAMELSAD20'] },
    { label: 'GEOID', keys: ['GEOID20', 'GEOID', 'geoid'] },
  ],
  boundaries_tribal_lands: [
    { label: 'Tribal land', keys: ['NAME', 'name', 'NAMELSAD'] },
    { label: 'GEOID', keys: ['GEOID', 'geoid'] },
  ],
  opportunity_zones: [
    { label: 'State', keys: ['STATE_NAME', 'state_name', 'STUSAB'] },
    { label: 'Census tract', keys: ['GEOID10', 'geoid10'] },
    { label: 'Rural tract', keys: ['Rural', 'rural'] },
  ],
  principal_aquifers: [
    { label: 'Aquifer', keys: ['AQ_NAME', 'aq_name'] },
    { label: 'Rock type', keys: ['ROCK_NAME', 'rock_name'] },
    { label: 'Aquifer code', keys: ['AQ_CODE', 'aq_code'] },
  ],
  transmission_lines: [
    { label: 'Owner', keys: ['OWNER', 'owner'] },
    { label: 'Voltage class', keys: ['VOLT_CLASS', 'volt_class'] },
    { label: 'Voltage (kV)', keys: ['VOLTAGE', 'voltage'] },
    { label: 'Status', keys: ['STATUS', 'status'] },
    { label: 'Type', keys: ['TYPE', 'type'] },
  ],
};

/** NWI wetland types present in hosted tiles — grouped into a small readable palette. */
export const WETLAND_TYPE_COLORS = {
  'Freshwater Emergent Wetland': '#52b788',
  'Freshwater Forested/Shrub Wetland': '#40916c',
  'Freshwater Pond': '#3b82f6',
  Lake: '#3b82f6',
  Lacustrine: '#60a5fa',
  Riverine: '#38bdf8',
  'Estuarine and Marine Wetland': '#0f766e',
  'Estuarine and Marine Deepwater': '#115e59',
  Other: '#94a3b8',
  default: '#52b788',
};

export const WETLAND_LEGEND = [
  { label: 'Freshwater wetland', color: '#52b788' },
  { label: 'Pond, lake & lacustrine', color: '#3b82f6' },
  { label: 'Riverine', color: '#38bdf8' },
  { label: 'Coastal / estuarine', color: '#0f766e' },
  { label: 'Other', color: '#94a3b8' },
];

/** USFS WHP 2023 classified CONUS — matches pre-rendered raster tile symbology. */
export const WILDFIRE_HAZARD_LEGEND = [
  { label: 'Very low', color: '#fff7ad' },
  { label: 'Low', color: '#fcdc8b' },
  { label: 'Moderate', color: '#f5a040' },
  { label: 'High', color: '#e86141' },
  { label: 'Very high', color: '#a80000' },
  { label: 'Non-burnable / water', color: '#c8c8c8' },
];

/** HIFLD transmission lines — colored by `VOLT_CLASS`. */
export const TRANSMISSION_VOLT_CLASS_COLORS = {
  '100-161': '#64748b',
  '220-287': '#eab308',
  '345': '#f97316',
  '500': '#ef4444',
  '735 AND ABOVE': '#b91c1c',
  DC: '#7c3aed',
  default: '#475569',
};

/** USGS principal aquifers — colored by `AQ_NAME`. */
export const PRINCIPAL_AQUIFER_COLORS = {
  'Basin and Range basin-fill aquifers': '#7ec8e3',
  'Basin and Range carbonate-rock aquifers': '#4a90d9',
  'California Coastal Basin aquifers': '#5ba3e8',
  'Central Valley aquifer system': '#2563eb',
  'Colorado Plateaus aquifers': '#d97706',
  'Columbia Plateau basaltic-rock aquifers': '#6b7280',
  'Columbia Plateau basin-fill aquifers': '#94a3b8',
  'Northern Rocky Mountains Intermontane Basins aquifer system': '#0d9488',
  'Other rocks': '#a8a29e',
  'Pacific Northwest basaltic-rock aquifers': '#57534e',
  'Pacific Northwest basin-fill aquifers': '#78716c',
  'Rio Grande aquifer system': '#ca8a04',
  'Snake River Plain basaltic-rock aquifers': '#44403c',
  'Snake River Plain basin-fill aquifers': '#a16207',
  'Southern Nevada volcanic-rock aquifers': '#c2410c',
  'Upper Tertiary aquifers': '#84cc16',
  'Willamette Lowland basin-fill aquifers': '#22c55e',
  default: '#64748b',
};

/** NHD `FType` on hosted surface-water tiles (not `name`). */
export const SURFACE_WATER_FTYPE_MATCH_KEY = [
  'to-string',
  ['coalesce', ['get', 'FType'], ['get', 'FCode'], ''],
];

/** Polygon water bodies — lakes, swamps, canals. */
export const SURFACE_WATER_BODY_FTYPE_COLORS = {
  390: '#2563eb',
  493: '#2563eb',
  378: '#60a5fa',
  436: '#0d9488',
  361: '#64748b',
  466: '#3b82f6',
  default: '#3b82f6',
};

/** Linear flowlines — streams, canals, connectors. */
export const SURFACE_WATER_FLOWLINE_FTYPE_COLORS = {
  420: '#1e40af',
  460: '#1e40af',
  468: '#1e40af',
  334: '#2563eb',
  558: '#1e40af',
  566: '#1e40af',
  336: '#64748b',
  428: '#94a3b8',
  default: '#1e40af',
};

export const SURFACE_WATER_LEGEND = [
  { label: 'Lake, pond & reservoir', color: '#2563eb' },
  { label: 'Swamp / marsh', color: '#0d9488' },
  { label: 'Canal / ditch', color: '#64748b' },
  { label: 'Streams & rivers', color: '#1e40af' },
];

export const NHD_FTYPE_LABELS = {
  361: 'Canal / ditch',
  378: 'Glacier',
  390: 'Lake / pond',
  436: 'Swamp / marsh',
  466: 'Stream waterbody',
  493: 'Reservoir',
  334: 'Connector',
  336: 'Canal / ditch',
  420: 'Stream / river',
  428: 'Pipeline',
  460: 'Stream / river',
  468: 'Stream / river',
  558: 'Stream / river',
  566: 'Stream / river',
};

export function getNhdFtypeLabel(ftype) {
  const n = Number(ftype);
  if (Number.isFinite(n) && NHD_FTYPE_LABELS[n]) return NHD_FTYPE_LABELS[n];
  if (ftype != null && String(ftype).trim() !== '') return String(ftype).trim();
  return null;
}

/** @param {import('mapbox-gl').MapboxGeoJSONFeature | { layer?: { id?: string } }} feature */
export function resolveHostedMapLayerFromFeature(feature) {
  const lid = feature?.layer?.id;
  if (!lid) return null;
  if (lid.startsWith('soil-') && lid.endsWith('-layer')) return 'soil';
  return MAP_LAYER_ID_TO_TOGGLE[lid] || null;
}

export function getProp(feature, keys) {
  const props = feature?.properties || {};
  for (const key of keys) {
    const v = props[key];
    if (v !== undefined && v !== null && String(v).trim() !== '') return String(v).trim();
  }
  return null;
}

/** Stable id for selection / highlight within a hosted layer. */
export function getHostedFeatureClickId(feature, layerName) {
  const props = feature?.properties || {};
  switch (layerName) {
    case 'public_land':
      return (
        props.OBJECTID ??
        props.objectid ??
        (props.Own_Name ? `owner:${props.Own_Name}` : null) ??
        (props.SURFACE ? `surface:${props.SURFACE}` : null)
      );
    case 'conservation_easements':
      return props.OBJECTID ?? props.objectid ?? props.org_name ?? props.Name;
    case 'soil':
      return props.MUKEY ?? props.mukey ?? props.MUSYM ?? props.musym ?? props.OBJECTID;
    case 'surface_water':
      return (
        props.ReachCode ??
        props.reachcode ??
        props.OBJECTID ??
        props.objectid ??
        feature?.id
      );
    case 'wetlands':
      return (
        props.OBJECTID ??
        props.objectid ??
        (props.WETLAND_TYPE ? `wetland:${props.WETLAND_TYPE}` : props.ATTRIBUTE)
      );
    case 'boundaries_counties':
    case 'boundaries_congressional':
      return props.GEOID ?? props.geoid ?? props.OBJECTID ?? props.NAMELSAD;
    case 'boundaries_places':
      return props.GEOID ?? props.geoid ?? props.NAME ?? props.name;
    case 'boundaries_urban_areas':
      return props.GEOID20 ?? props.GEOID ?? props.NAME20 ?? props.name;
    case 'boundaries_tribal_lands':
      return props.GEOID ?? props.geoid ?? props.NAME ?? props.name;
    case 'opportunity_zones':
      return props.GEOID10 ?? props.geoid10 ?? props.OBJECTID ?? props.objectid;
    case 'principal_aquifers':
      return props.OBJECTID ?? props.objectid ?? props.AQ_CODE ?? props.AQ_NAME;
    case 'transmission_lines':
      return props.GlobalID ?? props.globalid ?? props.ID ?? props.OBJECTID;
    default:
      return props.OBJECTID ?? props.objectid ?? props.Name ?? props.name ?? null;
  }
}

/** Globally unique selection id (avoids OBJECTID collisions across layers). */
export function getFeatureSelectionId(feature) {
  if (!feature) return null;
  if (isRegridParcelPolygonFeature(feature)) {
    const p = feature.properties || {};
    const id =
      p.ll_uuid ?? p.parcelnumb ?? p.parcel_id ?? p.id ?? feature.id;
    return id ? `regrid:${id}` : null;
  }
  const layer = resolveHostedMapLayerFromFeature(feature);
  if (layer) {
    const id = getHostedFeatureClickId(feature, layer);
    return id != null ? `${layer}:${id}` : null;
  }
  const p = feature.properties || {};
  if (p.GFI) return `gfi:${p.GFI}`;
  if (p.pidn) return `pidn:${p.pidn}`;
  if (p.FLD_AR_ID) return `fema:${p.FLD_AR_ID}`;
  if (p.precinct) return `precinct:${p.precinct}`;
  if (p.OBJECTID != null) return `object:${p.OBJECTID}`;
  if (p.Name) return `name:${p.Name}`;
  return null;
}

export function featuresShareSelectionId(a, b) {
  const idA = getFeatureSelectionId(a);
  const idB = getFeatureSelectionId(b);
  return idA != null && idA === idB;
}

export function getHostedLayerFieldValue(feature, field) {
  const raw = getProp(feature, field.keys);
  if (!raw) return null;
  if (field.format === 'nhdFtype') return getNhdFtypeLabel(raw);
  return raw;
}

export function getHostedLayerDisplayTitle(feature, layerName, options = {}) {
  if (layerName === 'soil') {
    const mukey = getProp(feature, ['MUKEY', 'mukey']);
    const details = mukey ? options.soilByMukey?.[mukey] : null;
    if (details?.muname) return details.muname;
    const musym = getProp(feature, ['MUSYM', 'musym']);
    if (musym) return `Map unit ${musym}`;
  }
  if (layerName === 'surface_water') {
    const name = getProp(feature, ['GNIS_Name', 'gnis_name', 'name', 'NAME']);
    if (name) return name;
    const ftypeLabel = getNhdFtypeLabel(getProp(feature, ['FType', 'FCode', 'ftype']));
    if (ftypeLabel) return ftypeLabel;
  }
  if (layerName === 'wetlands') {
    const wetlandType = getProp(feature, ['WETLAND_TYPE', 'wetland_type']);
    if (wetlandType) return wetlandType;
  }
  const fields = HOSTED_LAYER_INFO_FIELDS[layerName];
  if (fields?.length) {
    const primary = getProp(feature, fields[0].keys);
    if (primary) return primary;
  }
  return layerName.replace(/_/g, ' ');
}
