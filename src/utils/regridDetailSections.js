import { appendRegridAddonSections } from './regridParcelApi';
import { FEMA_PARCEL_FIELD_KEYS } from './regridParcelApi';
import {
  buildCountyPlanningResourceLinks,
  buildEntriesForZoningProperties,
  buildStandardizedZoningSection,
  COUNTY_PLANNING_LINK_SPECS,
  ZONING_PARCEL_KEYS,
} from './regridZoningDisplay';


const excludeFields = new Set([
  'll_uuid',
  'parcelnumb',
  'owner',
  'address',
  'fid',
  'ogc_fid',
  'path',
  'id',
  'geometry',
  'geom',
  'wkb_geometry',
  'shape',
  'centroid',
  '__regridparcelproperties',
]);

const MAIL_FIELD_KEYS = [
  'mail_addno',
  'mail_addpref',
  'mail_addstr',
  'mail_addsttyp',
  'mail_addstsuf',
  'mail_unit',
  'mail_city',
  'mail_state',
  'mail_state2',
  'mail_zip',
  'mail_country',
  'mail_address2',
  'careof',
  'mailing_address',
  'mailadd',
  'mail_address',
  'original_mailing_address',
];

const NOISE_DETAIL_PATTERNS = [
  /^fields$/i,
  /^context$/i,
  /^headline$/i,
  /^field_labels$/i,
  /^enhanced_ownership$/i,
  /^addresses$/i,
  /^matched_/i,
  /^geometry/i,
  /^geom$/i,
  /^wkb_/i,
  /^shape$/i,
  /^centroid$/i,
  /^ogc_fid$/i,
  /^fid$/i,
  /^id$/i,
  /^ll_uuid$/i,
];

const FLOOD_FIELD_SPECS = [
  { label: 'FEMA flood zone', keys: ['fema_flood_zone', 'flood_zone', 'fld_zone', 'fema_zone'] },
  { label: 'FEMA flood zone subtype', keys: ['fema_flood_zone_subtype'] },
  { label: 'FEMA flood zone data date', keys: ['fema_flood_zone_data_date'] },
  { label: 'FEMA NRI risk rating', keys: ['fema_nri_risk_rating'] },
  { label: 'SFHA', keys: ['sfha', 'fema_sfha'] },
  { label: 'Floodway', keys: ['floodway', 'fema_floodway'] },
  { label: 'FIRM panel', keys: ['firm_panel', 'firm_id'] },
  { label: 'Base flood elevation', keys: ['bfe', 'base_flood_elevation', 'fema_bfe'] },
];

const FLOOD_SECTION_PATTERNS = [
  /flood/i,
  /fema/i,
  /sfha/i,
  /firm/i,
  /bfe/i,
  /floodway/i,
  /nri/i,
  /risk/i,
  /hazard/i,
];

const detailSectionSpecs = {
  building: {
    title: 'Building',
    patterns: [
      /year\s*built/i,
      /yearbuilt/i,
      /struct/i,
      /bldg/i,
      /building/i,
      /stories/i,
      /units/i,
      /bed/i,
      /bath/i,
      /sqft/i,
      /sq_ft/i,
      /gissqft/i,
      /living_area/i,
      /improv/i,
      /condition/i,
      /quality/i,
      /grade/i,
      /construction/i,
      /frame/i,
      /style/i,
      /roof/i,
      /foundation/i,
      /exterior/i,
      /heating/i,
      /cooling/i,
      /garage/i,
      /improvement/i,
      /improvements/i,
      /effective/i,
      /remodel/i,
      /renovat/i,
      /occup/i,
      /dwelling/i,
      /residential_unit/i,
      /unit_count/i,
    ],
  },
  financial: {
    title: 'Financial',
    patterns: [
      /sale/i,
      /price/i,
      /tax/i,
      /assess/i,
      /value/i,
      /val$/i,
      /deed/i,
      /transaction/i,
      /seller/i,
      /buyer/i,
      /mortgage/i,
      /loan/i,
      /account/i,
    ],
  },
  land: {
    title: 'Land',
    patterns: [
      /acre/i,
      /acreage/i,
      /gisacre/i,
      /landuse/i,
      /usecode/i,
      /use_code/i,
      /lot/i,
      /frontage/i,
      /depth/i,
      /topography/i,
      /soil/i,
      /crop/i,
      /wood/i,
      /range/i,
      /section/i,
      /township/i,
    ],
  },
};

const ZONING_FLOOD_PATTERNS = [
  /zoning/i,
  /flood/i,
  /fema/i,
  /sfha/i,
  /firm/i,
  /bfe/i,
  /floodway/i,
];

function formatValue(key, value) {
  if (value === null || value === undefined || value === '') return null;

  if (typeof value === 'number') {
    const lowerKey = key.toLowerCase();
    if (lowerKey.includes('price') || lowerKey.includes('value') || lowerKey.includes('val')) {
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
      }).format(value);
    }
    if (lowerKey.includes('acre') || lowerKey.includes('acreage') || lowerKey.includes('gisacre')) {
      return `${parseFloat(value).toFixed(2)} acres`;
    }
    if (
      lowerKey.includes('sqft') ||
      lowerKey.includes('sq_ft') ||
      lowerKey.includes('gissqft') ||
      lowerKey.includes('living_area')
    ) {
      return `${parseInt(value, 10).toLocaleString()} sq ft`;
    }
    if (lowerKey.includes('year')) {
      return value.toString();
    }
    return value.toLocaleString();
  }

  if (typeof value === 'string' && (key.includes('date') || key.includes('sale_date'))) {
    if (value.match(/^\d{4}/)) {
      return value;
    }
  }

  return value.toString();
}

function formatLabel(key) {
  return key
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (l) => l.toUpperCase())
    .replace(/ll\s+/gi, '')
    .replace(/gis\s+/gi, '')
    .trim();
}

function normalizeDetailValue(value) {
  if (value === null || value === undefined || value === '') return null;
  if (Array.isArray(value)) {
    if (value.length === 0) return null;
    return value
      .map((item) => (typeof item === 'object' ? JSON.stringify(item) : String(item)))
      .join(', ');
  }
  if (typeof value === 'object') {
    const entries = Object.entries(value)
      .filter(([, v]) => v !== null && v !== undefined && v !== '')
      .slice(0, 6);
    if (entries.length === 0) return null;
    return entries.map(([k, v]) => `${formatLabel(k)}: ${String(v)}`).join(' | ');
  }
  return String(value);
}

function hasRenderableDetailValue(value) {
  if (value === null || value === undefined || value === '') return false;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'object') return Object.keys(value).length > 0;
  return true;
}

function isScalarDetailValue(value) {
  if (value === null || value === undefined || value === '') return false;
  if (typeof value === 'object') return false;
  return true;
}

function isNoiseDetailKey(key) {
  const lower = key.toLowerCase();
  if (lower.startsWith('__regrid')) return true;
  if (excludeFields.has(lower)) return true;
  return NOISE_DETAIL_PATTERNS.some((pattern) =>
    typeof pattern === 'string' ? lower === pattern.toLowerCase() : pattern.test(key)
  );
}

function getFieldCI(data, key) {
  if (!data || !key) return undefined;
  if (Object.prototype.hasOwnProperty.call(data, key)) return data[key];
  const lower = key.toLowerCase();
  const match = Object.keys(data).find((k) => k.toLowerCase() === lower);
  return match ? data[match] : undefined;
}

function getFieldLabelCI(data, key) {
  const labels = data?.__regridFieldLabels;
  if (!labels || !key) return null;
  if (Object.prototype.hasOwnProperty.call(labels, key)) return labels[key];
  const lower = key.toLowerCase();
  const match = Object.keys(labels).find((labelKey) => labelKey.toLowerCase() === lower);
  return match ? labels[match] : null;
}

function markKeyConsumed(consumed, key) {
  if (!key) return;
  consumed.add(key);
  consumed.add(key.toLowerCase());
}

function firstNonEmpty(...values) {
  for (const value of values) {
    if (value === null || value === undefined) continue;
    if (typeof value === 'string' && value.trim() === '') continue;
    return value;
  }
  return null;
}

function parseJsonObject(value) {
  if (!value) return null;
  if (typeof value === 'object' && !Array.isArray(value)) return value;
  if (typeof value !== 'string') return null;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function parseJsonArray(value) {
  if (!value) return null;
  if (Array.isArray(value)) return value;
  if (typeof value !== 'string') return null;
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function formatFloodParcelPercent(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return null;
  const normalized = num <= 1 ? num * 100 : num;
  const rounded =
    Math.abs(normalized - Math.round(normalized)) < 0.05
      ? Math.round(normalized).toString()
      : normalized.toFixed(1);
  return `${rounded}%`;
}

function keyMatchesAnyPattern(key, patterns) {
  const lower = key.toLowerCase();
  return patterns.some((pattern) => {
    if (pattern instanceof RegExp) return pattern.test(key) || pattern.test(lower);
    if (typeof pattern === 'string') return lower.includes(pattern.toLowerCase());
    return false;
  });
}

function trimMailPart(part) {
  if (part === null || part === undefined) return '';
  return String(part).trim();
}

function formatOriginalMailingAddressValue(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = parseJsonObject(value);
  if (parsed) return buildMailingAddressLine(parsed);
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed || null;
  }
  return null;
}

/**
 * Regrid standard mailing fields: mailadd + mail_state2 (not mail_state), optional split parts.
 * Some counties (e.g. Teton WY) put the state code in mail_city; use mailadd when split street is empty.
 */
function buildMailingAddressLine(data) {
  if (!data) return null;

  const mailObj = parseJsonObject(getFieldCI(data, 'mail')) || {};
  const merged = { ...data, ...mailObj };

  const mailadd = firstNonEmpty(
    getFieldCI(merged, 'mailadd'),
    getFieldCI(merged, 'mail_address')
  );
  const careof = getFieldCI(merged, 'careof');
  const mailAddress2 = getFieldCI(merged, 'mail_address2');

  const streetFromParts = [
    merged.mail_addno,
    merged.mail_addpref,
    merged.mail_addstr,
    merged.mail_addsttyp,
    merged.mail_addstsuf,
    merged.mail_unit,
  ]
    .map(trimMailPart)
    .filter(Boolean)
    .join(' ')
    .trim();

  const mailState = firstNonEmpty(
    getFieldCI(merged, 'mail_state2'),
    getFieldCI(merged, 'mail_state')
  );

  let mailCity = trimMailPart(merged.mail_city);
  const mailZip = trimMailPart(merged.mail_zip);
  if (
    mailCity &&
    mailState &&
    mailCity.toUpperCase() === String(mailState).toUpperCase() &&
    mailCity.length <= 2
  ) {
    mailCity = '';
  }

  const streetLines = [];
  const careofTrimmed = trimMailPart(careof);
  if (careofTrimmed) streetLines.push(careofTrimmed);
  if (streetFromParts) {
    streetLines.push(streetFromParts);
  } else if (mailadd) {
    streetLines.push(String(mailadd).trim());
  }
  const mailAddress2Trimmed = trimMailPart(mailAddress2);
  if (mailAddress2Trimmed) streetLines.push(mailAddress2Trimmed);

  const cityLine = [mailCity, mailState, mailZip].filter(Boolean).join(', ').trim();
  const country = trimMailPart(merged.mail_country);

  const lines = [...streetLines, cityLine, country].filter(Boolean);
  if (lines.length > 0) return lines.join('\n');

  const original = formatOriginalMailingAddressValue(getFieldCI(data, 'original_mailing_address'));
  if (original) return original;

  const mailField = getFieldCI(data, 'mail');
  if (typeof mailField === 'string' && mailField.trim()) {
    return mailField.trim();
  }

  return firstNonEmpty(
    getFieldCI(data, 'mailing_address'),
    getFieldCI(data, 'mailadd'),
    getFieldCI(data, 'mail_address')
  );
}

function buildRegridMailingLegalSection(data, consumed) {
  const entries = [];
  const mailing = buildMailingAddressLine(data || {});
  if (mailing) {
    MAIL_FIELD_KEYS.forEach((key) => markKeyConsumed(consumed, key));
    markKeyConsumed(consumed, 'mail');
    markKeyConsumed(consumed, 'mailing_address');
    markKeyConsumed(consumed, 'original_mailing_address');
    entries.push({
      label: 'Mailing address:',
      rawValue: mailing,
      displayValue: mailing,
    });
  }

  const legalRaw = firstNonEmpty(
    getFieldCI(data, 'legaldesc'),
    getFieldCI(data, 'legal_desc'),
    getFieldCI(data, 'legal_description')
  );
  if (legalRaw) {
    ['legaldesc', 'legal_desc', 'legal_description'].forEach((key) => markKeyConsumed(consumed, key));
    const displayValue = normalizeDetailValue(formatValue('legaldesc', legalRaw));
    entries.push({
      label: 'Legal description:',
      rawValue: legalRaw,
      displayValue,
    });
  }

  return entries;
}

function buildFemaFieldEntry(data, key, labelOverride, consumed) {
  const raw = getFieldCI(data, key);
  if (!hasRenderableDetailValue(raw)) return null;
  let displayValue;
  if (typeof raw === 'object') {
    displayValue = normalizeDetailValue(raw);
  } else {
    displayValue = normalizeDetailValue(formatValue(key, raw));
  }
  if (!displayValue) return null;
  markKeyConsumed(consumed, key);
  return {
    label: labelOverride || getFieldLabelCI(data, key) || formatLabel(key),
    displayValue,
    key,
    multiline:
      typeof displayValue === 'string' &&
      (displayValue.includes('\n') || displayValue.length > 120),
  };
}

function buildRegridFloodSection(data, consumed) {
  const entries = [];
  if (!data) return entries;

  FEMA_PARCEL_FIELD_KEYS.forEach((key) => {
    const spec = FLOOD_FIELD_SPECS.find((s) => s.keys.includes(key));
    const label = spec?.label || formatLabel(key);
    const entry = buildFemaFieldEntry(data, key, label, consumed);
    if (entry) entries.push(entry);
  });

  FLOOD_FIELD_SPECS.forEach(({ label, keys }) => {
    for (const key of keys) {
      const raw = getFieldCI(data, key);
      if (!isScalarDetailValue(raw)) continue;
      const displayValue = normalizeDetailValue(formatValue(key, raw));
      if (!displayValue) continue;
      markKeyConsumed(consumed, key);
      entries.push({ label, displayValue, key });
      break;
    }
  });

  const floodRaw = firstNonEmpty(getFieldCI(data, 'fema_flood_zone_raw'));
  if (floodRaw != null && floodRaw !== '') {
    markKeyConsumed(consumed, 'fema_flood_zone_raw');
  }
  const floodRawRows = parseJsonArray(floodRaw);
  if (Array.isArray(floodRawRows) && floodRawRows.length > 0) {
    floodRawRows.forEach((row, index) => {
      if (!row || typeof row !== 'object') return;
      const zone = row.zone ? String(row.zone).trim() : null;
      const percent = formatFloodParcelPercent(row.percent);
      if (!zone || !percent) return;
      entries.push({
        label: `Percent of Parcel in ${zone} Flood Zone`,
        displayValue: percent,
        key: `fema_flood_zone_raw_percent_${index}`,
      });
    });
  }

  Object.keys(data)
    .filter((key) => !consumed.has(key) && !consumed.has(key.toLowerCase()))
    .filter((key) => keyMatchesAnyPattern(key, FLOOD_SECTION_PATTERNS))
    .sort((a, b) => a.localeCompare(b))
    .forEach((key) => {
      const raw = data[key];
      if (!hasRenderableDetailValue(raw)) return;
      const formattedSource =
        raw && typeof raw === 'object' ? raw : formatValue(key, raw);
      const displayValue = normalizeDetailValue(formattedSource);
      if (!displayValue) return;
      markKeyConsumed(consumed, key);
      entries.push({
        label: getFieldLabelCI(data, key) || formatLabel(key),
        displayValue,
        key,
        multiline:
          typeof displayValue === 'string' &&
          (displayValue.includes('\n') || displayValue.length > 120),
      });
    });

  return entries;
}

function buildRegridZoningSection(data, consumed, locationMeta = {}) {
  if (!data) {
    return { entries: [], resourceLinks: [] };
  }

  // Premium parcel record: zoning, zoning_type, zoning_subtype, zoning_code_link, etc.
  const entries = buildEntriesForZoningProperties(data, { labelPrefix: '' });
  ZONING_PARCEL_KEYS.forEach((key) => markKeyConsumed(consumed, key));

  if (entries.length > 0) {
    return { entries, resourceLinks: [] };
  }

  return { entries: [], resourceLinks: [] };
}

function collectSectionEntries(data, spec, consumed) {
  const entries = [];
  if (!data) return entries;

  Object.keys(data)
    .filter((key) => !isNoiseDetailKey(key) && !excludeFields.has(key))
    .filter((key) => !consumed.has(key) && !consumed.has(key.toLowerCase()))
    .filter((key) => keyMatchesAnyPattern(key, spec.patterns))
    .filter((key) => !keyMatchesAnyPattern(key, ZONING_FLOOD_PATTERNS))
    .sort((a, b) => a.localeCompare(b))
    .forEach((key) => {
      const raw = data[key];
      if (!isScalarDetailValue(raw)) return;
      const displayValue = normalizeDetailValue(formatValue(key, raw));
      if (!displayValue) return;
      markKeyConsumed(consumed, key);
      entries.push({
        label: getFieldLabelCI(data, key) || formatLabel(key),
        displayValue,
        key,
        multiline: typeof displayValue === 'string' && displayValue.includes('\n'),
      });
    });

  return entries;
}

function collectUncategorizedEntries(data, consumed) {
  const entries = [];
  if (!data) return entries;

  Object.keys(data)
    .filter((key) => !isNoiseDetailKey(key) && !excludeFields.has(key))
    .filter((key) => !consumed.has(key) && !consumed.has(key.toLowerCase()))
    .filter((key) => !keyMatchesAnyPattern(key, ZONING_FLOOD_PATTERNS))
    .sort((a, b) => a.localeCompare(b))
    .forEach((key) => {
      const raw = data[key];
      if (!isScalarDetailValue(raw)) return;
      const displayValue = normalizeDetailValue(formatValue(key, raw));
      if (!displayValue) return;
      markKeyConsumed(consumed, key);
      entries.push({
        label: getFieldLabelCI(data, key) || formatLabel(key),
        displayValue,
        key,
        multiline:
          typeof displayValue === 'string' &&
          (displayValue.includes('\n') || displayValue.length > 120),
      });
    });

  return entries;
}

function buildDetailSections(dataSource, locationMeta = {}) {
  const consumed = new Set();
  const mailingLegal = buildRegridMailingLegalSection(dataSource, consumed);
  const sections = [];

  const buildingEntries = collectSectionEntries(dataSource, detailSectionSpecs.building, consumed);
  if (buildingEntries.length > 0) {
    sections.push({ title: detailSectionSpecs.building.title, entries: buildingEntries });
  }

  const floodEntries = buildRegridFloodSection(dataSource, consumed);
  if (floodEntries.length > 0) {
    sections.push({ title: 'Flood zone', entries: floodEntries });
  }

  const standardizedZoning = dataSource?.__regridZoningFeatures;
  const zoningSection =
    Array.isArray(standardizedZoning) && standardizedZoning.length > 0
      ? buildStandardizedZoningSection(standardizedZoning, dataSource, locationMeta, consumed)
      : buildRegridZoningSection(dataSource, consumed, locationMeta);

  const { entries: zoningEntries, resourceLinks: zoningResourceLinks } = zoningSection;
  if (zoningEntries.length > 0 || (zoningResourceLinks && zoningResourceLinks.length > 0)) {
    sections.push({
      title: 'Zoning',
      entries: zoningEntries,
      resourceLinks: zoningResourceLinks || [],
    });
  }

  const financialEntries = collectSectionEntries(dataSource, detailSectionSpecs.financial, consumed);
  if (financialEntries.length > 0) {
    sections.push({ title: detailSectionSpecs.financial.title, entries: financialEntries });
  }

  const landEntries = collectSectionEntries(dataSource, detailSectionSpecs.land, consumed);
  if (landEntries.length > 0) {
    sections.push({ title: detailSectionSpecs.land.title, entries: landEntries });
  }

  const otherEntries = collectUncategorizedEntries(dataSource, consumed);
  if (otherEntries.length > 0) {
    sections.push({ title: 'Other details', entries: otherEntries });
  }

  const rawProperties = dataSource?.__regridParcelProperties;
  if (rawProperties) {
    appendRegridAddonSections(sections, rawProperties);
  }

  return { mailingLegal, sections, consumed };
}

/**
 * After layout passes, ensure premium FEMA columns appear in Flood zone when present on data.
 */
export function ensureFloodSectionHasFemaFields(sections, data, consumed) {
  if (!data) return;
  const existingKeys = new Set();
  const floodSection = sections.find((section) => section.title === 'Flood zone');
  (floodSection?.entries || []).forEach((entry) => {
    if (entry?.key) existingKeys.add(String(entry.key).toLowerCase());
  });

  const added = [];
  FEMA_PARCEL_FIELD_KEYS.forEach((key) => {
    if (existingKeys.has(key.toLowerCase())) return;
    if (consumed.has(key) || consumed.has(key.toLowerCase())) return;
    const spec = FLOOD_FIELD_SPECS.find((s) => s.keys.includes(key));
    const entry = buildFemaFieldEntry(data, key, spec?.label, consumed);
    if (entry) added.push(entry);
  });

  if (!added.length) return;
  if (floodSection) {
    floodSection.entries = [...(floodSection.entries || []), ...added];
  } else {
    sections.push({ title: 'Flood zone', entries: added });
  }
}

function parseRegridLocation(path, detailedData, feature) {
  let county = null;
  let state = null;

  const pathValue = path || detailedData?.path || feature?.properties?.path;
  if (pathValue) {
    const pathParts = pathValue.split('/').filter((part) => part.length > 0);
    if (pathParts.length >= 3 && pathParts[0] === 'us') {
      state = pathParts[1]?.toUpperCase() || null;
      if (pathParts[2]) {
        county = pathParts[2]
          .split('-')
          .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
          .join(' ');
      }
    }
  }

  if (!county) county = detailedData?.county || feature?.properties?.county || null;
  if (!state) state = detailedData?.state || feature?.properties?.state || null;

  if (county && state) return `${county}, ${state}`;
  return county || state || 'N/A';
}

export { buildDetailSections, parseRegridLocation };
