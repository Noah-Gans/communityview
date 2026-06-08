/** Parcel-level keys covered by standardized zoning (avoid duplicate rows). */
export const ZONING_PARCEL_KEYS = [
  'zoning',
  'zoning_code',
  'zoning_type',
  'zoning_subtype',
  'zoning_description',
  'zoning_desc',
  'zoning_id',
  'zoning_link',
  'zoning_url',
  'zoning_map_link',
  'zoning_data_date',
  'zoning_objective',
  'zoning_code_link',
];

const ZONING_SCALAR_FIELDS = [
  { key: 'zoning', label: 'District code' },
  { key: 'zoning_description', label: 'District name' },
  { key: 'zoning_type', label: 'Zoning type' },
  { key: 'zoning_subtype', label: 'Zoning subtype' },
  { key: 'zoning_objective', label: 'Zoning guide', multiline: true },
  { key: 'municipality_name', label: 'Municipality' },
  { key: 'geoid', label: 'County FIPS (GEOID)' },
  { key: 'zoning_data_date', label: 'Zoning data date' },
  { key: 'permitted_land_uses_as_of_right', label: 'Permitted as of right' },
  { key: 'permitted_land_uses_conditional', label: 'Permitted conditional' },
  { key: 'min_lot_area_sq_ft', label: 'Minimum lot area' },
  { key: 'min_lot_width_ft', label: 'Minimum lot width' },
  { key: 'max_building_height_ft', label: 'Maximum building height' },
  { key: 'max_far', label: 'Maximum FAR' },
  { key: 'min_front_setback_ft', label: 'Minimum front setback' },
  { key: 'min_rear_setback_ft', label: 'Minimum rear setback' },
  { key: 'min_side_setback_ft', label: 'Minimum side setback' },
  { key: 'max_coverage_pct', label: 'Maximum lot coverage' },
  { key: 'max_impervious_coverage_pct', label: 'Maximum impervious coverage' },
  { key: 'min_landscaped_space_pct', label: 'Minimum landscaped space' },
  { key: 'min_open_space_pct', label: 'Minimum open space' },
  { key: 'max_density_du_per_acre', label: 'Maximum density' },
];

function formatZoningNumeric(key, value) {
  const num = Number(value);
  if (Number.isNaN(num)) return null;
  if (num === -5555) return 'Varies — see zoning ordinance';
  if (num === -9999) return 'Not applicable';
  if (key.includes('pct')) return `${num}%`;
  if (key.includes('sq_ft')) return `${num.toLocaleString()} sq ft`;
  if (key.includes('_ft')) return `${num.toLocaleString()} ft`;
  if (key === 'max_far') return String(num);
  if (key.includes('density')) return `${num.toLocaleString()} du/acre`;
  return num.toLocaleString();
}

function formatZoningScalar(key, value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') return formatZoningNumeric(key, value);
  if (typeof value === 'string') return value.trim() || null;
  return String(value);
}

function markZoningKeysConsumed(consumed, keys = ZONING_PARCEL_KEYS) {
  keys.forEach((key) => {
    consumed.add(key);
    consumed.add(key.toLowerCase());
  });
}

/**
 * Top-level `zoning` FeatureCollection from Regrid parcel API responses.
 */
export function extractZoningFeaturesFromResponse(data, parcelMerged = {}) {
  const features = data?.zoning?.features;
  if (!Array.isArray(features) || features.length === 0) return [];

  const propsList = features
    .map((feature) => feature?.properties)
    .filter((props) => props && typeof props === 'object');

  if (propsList.length <= 1) return propsList;

  const parcelZoningId = parcelMerged?.zoning_id;
  if (parcelZoningId != null && parcelZoningId !== '') {
    const matched = propsList.filter((props) => String(props.zoning_id) === String(parcelZoningId));
    if (matched.length > 0) return matched;
  }

  return propsList;
}

/** County / parcel URL fields shown as links under the Zoning section (premium custom fields). */
export const COUNTY_PLANNING_LINK_SPECS = [
  { key: 'ldr_plan', label: 'Land development regulations' },
  { key: 'zoning_code_link', label: 'Zoning ordinance' },
  { key: 'zoning_link', label: 'Zoning map' },
  { key: 'zoning_url', label: 'Zoning info' },
  { key: 'zoning_map_link', label: 'Zoning map' },
  { key: 'map_no', label: 'Plat map' },
  { key: 'clerk_rec', label: 'Clerk records' },
  { key: 'deed_no', label: 'Deed' },
  { key: 'tax_info', label: 'Tax info' },
  { key: 'smart_gov', label: 'Planning & building records' },
  { key: 'sourceurl', label: 'County parcel GIS' },
];

function isHttpUrl(value) {
  return typeof value === 'string' && /^https?:\/\//i.test(value.trim());
}

export function buildCountyPlanningResourceLinks(data) {
  if (!data || typeof data !== 'object') return [];
  const links = [];
  const seen = new Set();

  COUNTY_PLANNING_LINK_SPECS.forEach(({ key, label }) => {
    const url = data[key];
    if (!isHttpUrl(url)) return;
    const normalized = url.trim();
    if (seen.has(normalized)) return;
    seen.add(normalized);
    links.push({ id: `planning_${key}`, label, url: normalized });
  });

  return links;
}

export function buildEntriesForZoningProperties(zoningProps, { labelPrefix = '' } = {}) {
  const entries = [];
  if (!zoningProps) return entries;

  ZONING_SCALAR_FIELDS.forEach(({ key, label, multiline }) => {
    const formatted = formatZoningScalar(key, zoningProps[key]);
    if (!formatted) return;
    entries.push({
      label: `${labelPrefix}${label}`,
      displayValue: formatted,
      key: `sz_${key}`,
      multiline: Boolean(multiline),
    });
  });

  const backup = zoningProps.ll_zoning_backup;
  const primary = zoningProps.zoning || zoningProps.zoning_code;
  if (backup && String(backup).trim() && String(backup).trim() !== String(primary || '').trim()) {
    entries.push({
      label: `${labelPrefix}County zoning (backup)`,
      displayValue: String(backup).trim(),
      key: 'll_zoning_backup',
    });
  }

  const ordinanceUrl = zoningProps.zoning_code_link;
  if (ordinanceUrl && typeof ordinanceUrl === 'string') {
    entries.push({
      label: `${labelPrefix}Zoning ordinance`,
      displayValue: 'View ordinance',
      key: 'sz_zoning_code_link',
      linkUrl: ordinanceUrl,
    });
  }

  return entries;
}

/**
 * Build zoning section rows from Regrid Standardized Zoning add-on (full schema).
 */
export function buildStandardizedZoningSection(zoningFeatureList, dataSource, locationMeta, consumed) {
  const entries = [];

  zoningFeatureList.forEach((zoningProps, index) => {
    const prefix =
      zoningFeatureList.length > 1 ? `Zone ${index + 1} — ` : '';
    entries.push(...buildEntriesForZoningProperties(zoningProps, { labelPrefix: prefix }));
  });

  markZoningKeysConsumed(consumed);
  return { entries, resourceLinks: [] };
}
