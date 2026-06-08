/**
 * Single frontend organizer for Regrid parcel data (report + side panel).
 * Fetch everything via regridParcelApi, then call buildRegridPropertyLayout.
 */
import {
  buildDetailSections,
  ensureFloodSectionHasFemaFields,
  parseRegridLocation,
} from './regridDetailSections';
import { appendRegridApiCollectionSections } from './regridParcelApi';

const INTERNAL_KEY_PATTERN = /^__regrid/i;
const BUILDING_TECHNICAL_PATTERNS = [
  /— Ed Bld Uuid$/i,
  /— Ed Geoid$/i,
  /— Ed Lat$/i,
  /— Ed Lon$/i,
  /— Ll Uuids$/i,
  /— Ed Largest$/i,
  /— Ed Source Date$/i,
  /— Ed Source$/i,
  /— Ed Str Uuid$/i,
];
const LAND_LABEL_PATTERNS = [
  /^Agricultural /i,
  /^Land Value$/i,
  /^Total Parcel Value$/i,
  /^Assessed Values Year$/i,
  /^Parcel Value$/i,
];
const LAND_ENTRY_ORDER = [
  'Acreage',
  'Total Acreage',
  'Lot Size',
  'Lot Square Feet',
  'Parcel Elevation',
  'Distance to Transmission Line',
  'Total Parcel Value',
  'Land Value',
  'Agricultural Value',
  'Agricultural Land Information Unit Value',
  'Assessed Values Year',
];
const BUILDING_AND_LAND_ORDER = [
  'Parcel Acreage',
  'Assessed Values Year',
  'Assessed Total Value',
  'Assessed Land Value',
  'Assessed Improvement Value',
  'Parcel Use',
  'Development Type',
];
const CONTEXT_ENTRY_ORDER = [
  'Unified School District',
  'InSite Score',
  'Housing Affordability Index',
  'Median Household Income',
  'Median Household Income Growth (CAGR) Next 5 Years',
  'Housing Units Growth (CAGR) Past 5 Years',
  'Housing Units Growth (CAGR) Next 5 Years',
  'Population Density',
  'Population Growth (CAGR) Past 5 Years',
  'Population Growth (CAGR) Next 5 Years',
  'Qualified Opportunity Zone',
  'Roughness Rating',
];
const FINANCIAL_LABEL_ORDER = [
  'Tax District',
  'Annual Tax Bill',
  'Tax Year',
  'Yearly Tax Information Levy',
];
const BUILDING_REGRID_SUMMARY_ORDER = [
  'Satellite Calculated Buildings',
  'Satellite Calculated Building Footprint Square Feet',
];
const LAND_PINNED_LABELS = new Set(['parcel elevation', 'distance to transmission line']);

function formatLabel(key) {
  return String(key)
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (l) => l.toUpperCase())
    .replace(/ll\s+/gi, '')
    .replace(/gis\s+/gi, '')
    .trim();
}

function formatScalarForDisplay(key, value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'number') {
    const lower = key.toLowerCase();
    if (lower.includes('price') || lower.includes('value') || lower.includes('val')) {
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        maximumFractionDigits: 0,
      }).format(value);
    }
    return value.toLocaleString();
  }
  return String(value).trim() || null;
}

function formatAnyValue(key, value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value !== 'object') return formatScalarForDisplay(key, value);
  if (Array.isArray(value)) {
    if (value.length === 0) return null;
    if (value.every((item) => typeof item !== 'object')) {
      return value.map(String).join(', ');
    }
    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return String(value);
    }
  }
  try {
    const json = JSON.stringify(value, null, 2);
    return json.length > 4000 ? `${json.slice(0, 4000)}…` : json;
  } catch {
    return String(value);
  }
}

function resolveFieldLabel(data, key) {
  const labels = data?.__regridFieldLabels;
  if (labels && labels[key]) return labels[key];
  const lower = key.toLowerCase();
  const match = labels && Object.keys(labels).find((k) => k.toLowerCase() === lower);
  if (match && labels[match]) return labels[match];
  return formatLabel(key);
}

function collectConsumedKeysFromSections(sections) {
  const consumed = new Set();
  sections.forEach((section) => {
    section.entries?.forEach((entry) => {
      if (entry.key) {
        consumed.add(entry.key);
        consumed.add(String(entry.key).toLowerCase());
      }
    });
  });
  return consumed;
}

function isUrl(value) {
  return typeof value === 'string' && /^https?:\/\//i.test(value.trim());
}

function getLabelOrderIndex(order, label) {
  const index = order.findIndex((candidate) => candidate.toLowerCase() === String(label).toLowerCase());
  return index === -1 ? Number.MAX_SAFE_INTEGER : index;
}

function parseBuildingEntryLabel(label) {
  const match = /^Building\s+(\d+)\s+—\s+(.+)$/i.exec(String(label || ''));
  if (!match) return null;
  return {
    buildingNumber: Number(match[1]),
    fieldLabel: match[2].trim(),
  };
}

function formatRoundedSquareFeet(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return String(value ?? '').trim() || null;
  return `${Math.round(numeric).toLocaleString()} sq ft`;
}

function normalizeBuildingEntry(entry) {
  const label = String(entry?.label || '');

  if (/^Building Area$/i.test(label)) {
    return {
      ...entry,
      label: 'Building Square Footage',
      displayValue: formatRoundedSquareFeet(entry.displayValue),
    };
  }

  if (/^Area Building Definition$/i.test(label)) {
    return {
      ...entry,
      label: 'Building Definition',
    };
  }

  if (/^Land Use Code Description: Structure$/i.test(label)) {
    return {
      ...entry,
      label: 'Structure Type',
    };
  }

  return entry;
}

function normalizeCombinedEntry(entry) {
  const normalized = normalizeBuildingEntry(entry);
  const label = String(normalized?.label || '');

  if (/^(County-Provided Acres|Regrid Calculated Parcel Acres|Acreage|Total Acreage)$/i.test(label)) {
    return {
      ...normalized,
      label: 'Parcel Acreage',
    };
  }

  if (/^Total Parcel Value$/i.test(label)) {
    return {
      ...normalized,
      label: 'Assessed Total Value',
    };
  }

  if (/^Land Value$/i.test(label)) {
    return {
      ...normalized,
      label: 'Assessed Land Value',
    };
  }

  if (/^Improvement Value$/i.test(label)) {
    return {
      ...normalized,
      label: 'Assessed Improvement Value',
    };
  }

  if (/^Structure Type$/i.test(label)) {
    return {
      ...normalized,
      label: 'Development Type',
    };
  }

  if (/^Parcel Use Description$/i.test(label)) {
    return {
      ...normalized,
      label: 'Parcel Use',
    };
  }

  return normalized;
}

function refineBuildingSection(sections) {
  const buildingSection = sections.find((section) => section.title === 'Building');
  if (!buildingSection?.entries?.length) return;

  const assessorEntries = [];
  const regridSummaryEntries = [];
  const buildingFootprintEntries = [];

  buildingSection.entries.forEach((entry) => {
    const label = String(entry.label || '');

    if (/^Building\s+\d+\s+—/i.test(label)) {
      if (BUILDING_TECHNICAL_PATTERNS.some((pattern) => pattern.test(label))) {
        return;
      }
      const buildingMeta = parseBuildingEntryLabel(label);
      if (!buildingMeta || buildingMeta.fieldLabel.toLowerCase() !== 'ed bldg footprint sqft') {
        return;
      }
      buildingFootprintEntries.push({
        ...entry,
        label: `Building ${buildingMeta.buildingNumber} Sq Ft`,
        displayValue: formatRoundedSquareFeet(entry.displayValue),
      });
      return;
    }

    if (/^Regrid Calculated /i.test(label)) {
      if (/Parcel Square Feet$/i.test(label)) {
        return;
      }
      regridSummaryEntries.push(entry);
      return;
    }

    assessorEntries.push(normalizeBuildingEntry(entry));
  });

  regridSummaryEntries.sort((a, b) => {
    const normalizedALabel =
      /^Regrid Calculated Building Count$/i.test(String(a.label || ''))
        ? 'Satellite Calculated Buildings'
        : /^Regrid Calculated Building Footprint Square Feet$/i.test(String(a.label || ''))
          ? 'Satellite Calculated Building Footprint Square Feet'
          : a.label;
    const normalizedBLabel =
      /^Regrid Calculated Building Count$/i.test(String(b.label || ''))
        ? 'Satellite Calculated Buildings'
        : /^Regrid Calculated Building Footprint Square Feet$/i.test(String(b.label || ''))
          ? 'Satellite Calculated Building Footprint Square Feet'
          : b.label;
    const aIndex = getLabelOrderIndex(BUILDING_REGRID_SUMMARY_ORDER, normalizedALabel);
    const bIndex = getLabelOrderIndex(BUILDING_REGRID_SUMMARY_ORDER, normalizedBLabel);
    if (aIndex !== bIndex) return aIndex - bIndex;
    return String(normalizedALabel || '').localeCompare(String(normalizedBLabel || ''));
  });

  regridSummaryEntries.forEach((entry) => {
    if (/^Regrid Calculated Building Count$/i.test(String(entry.label || ''))) {
      entry.label = 'Satellite Calculated Buildings';
    }
    if (/^Regrid Calculated Building Footprint Square Feet$/i.test(String(entry.label || ''))) {
      entry.label = 'Satellite Calculated Building Footprint Square Feet';
    }
  });

  buildingFootprintEntries.sort((a, b) => {
    const aMatch = /^Building\s+(\d+)\s+Sq Ft$/i.exec(String(a.label || ''));
    const bMatch = /^Building\s+(\d+)\s+Sq Ft$/i.exec(String(b.label || ''));
    const aNum = aMatch ? Number(aMatch[1]) : Number.MAX_SAFE_INTEGER;
    const bNum = bMatch ? Number(bMatch[1]) : Number.MAX_SAFE_INTEGER;
    return aNum - bNum;
  });

  const regridBuildingCountEntry = regridSummaryEntries.find((entry) =>
    /^Satellite Calculated Buildings$/i.test(String(entry.label || ''))
  );
  const regridBuildingTotalEntry = regridSummaryEntries.find((entry) =>
    /^Satellite Calculated Building Footprint Square Feet$/i.test(String(entry.label || ''))
  );

  buildingSection.entries = [
    ...assessorEntries,
    ...(regridBuildingCountEntry ? [regridBuildingCountEntry] : []),
    ...buildingFootprintEntries,
    ...(regridBuildingTotalEntry ? [regridBuildingTotalEntry] : []),
  ];
}

function moveStructureUseCodeToZoning(sections) {
  const buildingSection = sections.find((section) => section.title === 'Building');
  if (!buildingSection?.entries?.length) return;

  const zoningSection = ensureSection(sections, 'Zoning');
  const remainingBuildingEntries = [];

  buildingSection.entries.forEach((entry) => {
    const label = String(entry.label || '');
    if (/^Land Use Code: Structure$/i.test(label)) {
      zoningSection.entries = [
        {
          ...entry,
          label: 'Structure Use Code',
        },
        ...(zoningSection.entries || []),
      ];
      return;
    }
    remainingBuildingEntries.push(entry);
  });

  buildingSection.entries = remainingBuildingEntries;
}

function ensureSection(sections, title) {
  let section = sections.find((item) => item.title === title);
  if (!section) {
    section = { title, entries: [] };
    sections.push(section);
  }
  return section;
}

function sortEntriesByLabelOrder(entries, order) {
  entries.sort((a, b) => {
    const aIndex = getLabelOrderIndex(order, a.label);
    const bIndex = getLabelOrderIndex(order, b.label);
    if (aIndex !== bIndex) return aIndex - bIndex;
    return String(a.label || '').localeCompare(String(b.label || ''));
  });
}

function sortSectionsByPriority(sections) {
  const sectionPriority = ['General', 'Building', 'Land', 'Financial', 'Flood zone', 'Area & Market', 'Zoning'];
  sections.sort((a, b) => {
    const aIndex = getLabelOrderIndex(sectionPriority, a.title);
    const bIndex = getLabelOrderIndex(sectionPriority, b.title);
    if (aIndex !== bIndex) return aIndex - bIndex;
    return String(a.title || '').localeCompare(String(b.title || ''));
  });
}

function normalizeLandEntry(entry) {
  const label = String(entry?.label || '');
  if (/^Highest Parcel Elevation$/i.test(label)) {
    return { ...entry, label: 'Parcel Elevation' };
  }
  if (/^Distance to Transmission line$/i.test(label)) {
    return { ...entry, label: 'Distance to Transmission Line' };
  }
  return entry;
}

function isLandEntryLabel(label) {
  const normalizedLabel = String(label || '').toLowerCase();
  return LAND_PINNED_LABELS.has(normalizedLabel) || LAND_LABEL_PATTERNS.some((pattern) => pattern.test(label));
}

function refineLandAndFinancialSections(sections) {
  const landSection = ensureSection(sections, 'Land');
  const financialSection = ensureSection(sections, 'Financial');
  const movedToLand = [...(landSection.entries || []).map(normalizeLandEntry)];

  sections.forEach((section) => {
    if (section === landSection || section.title === 'General') return;

    const remainingEntries = [];
    (section.entries || []).forEach((entry) => {
      const normalizedEntry = normalizeLandEntry(entry);
      const label = String(normalizedEntry.label || '');
      if (isLandEntryLabel(label)) {
        movedToLand.push(normalizedEntry);
        return;
      }
      remainingEntries.push(entry);
    });

    section.entries = remainingEntries;
  });

  landSection.entries = movedToLand;

  sortEntriesByLabelOrder(landSection.entries, LAND_ENTRY_ORDER);
  sortEntriesByLabelOrder(financialSection.entries, FINANCIAL_LABEL_ORDER);

  sortSectionsByPriority(sections);
}

function mergeBuildingAndLandSections(sections) {
  const buildingIndex = sections.findIndex((section) => section.title === 'Building');
  const landIndex = sections.findIndex((section) => section.title === 'Land');
  if (buildingIndex === -1 || landIndex === -1) return;

  const buildingSection = sections[buildingIndex];
  const landSection = sections[landIndex];
  const buildingEntries = buildingSection.entries || [];
  const landEntries = landSection.entries || [];

  if (buildingEntries.length === 0 && landEntries.length === 0) return;
  const selectedCombinedEntries = [];
  const isCombinedBuildingLandLabel = (label) =>
    BUILDING_AND_LAND_ORDER.some((candidate) => candidate.toLowerCase() === label.toLowerCase());

  const takeMatchingEntries = (entries) => {
    const remaining = [];
    entries.forEach((entry) => {
      const normalizedEntry = normalizeCombinedEntry(entry);
      const label = String(normalizedEntry.label || '');
      if (isCombinedBuildingLandLabel(label)) {
        selectedCombinedEntries.push(normalizedEntry);
        return;
      }
      remaining.push(entry);
    });
    return remaining;
  };

  buildingSection.entries = takeMatchingEntries(buildingEntries);
  landSection.entries = takeMatchingEntries(landEntries);

  if (selectedCombinedEntries.length === 0) return;

  selectedCombinedEntries.sort((a, b) => {
    const aLabel = String(a.label || '');
    const bLabel = String(b.label || '');
    const aIndex = getLabelOrderIndex(BUILDING_AND_LAND_ORDER, aLabel);
    const bIndex = getLabelOrderIndex(BUILDING_AND_LAND_ORDER, bLabel);
    if (aIndex !== bIndex) return aIndex - bIndex;
    return aLabel.localeCompare(bLabel);
  });

  const combinedSection = {
    title: 'General',
    entries: selectedCombinedEntries,
  };

  sections.unshift(combinedSection);

  if (buildingSection.entries.length === 0) {
    sections.splice(sections.indexOf(buildingSection), 1);
  }
  if (landSection.entries.length === 0) {
    sections.splice(sections.indexOf(landSection), 1);
  }
}

function normalizeContextEntry(entry) {
  const label = String(entry?.label || '');

  if (/^Census Provided Unified School District$/i.test(label)) {
    return { ...entry, label: 'Unified School District' };
  }
  if (/^Highest Parcel Elevation$/i.test(label)) {
    return { ...entry, label: 'Parcel Elevation' };
  }
  if (/^Median Household Income \(current year\)$/i.test(label)) {
    return { ...entry, label: 'Median Household Income' };
  }
  if (/^Federal Qualified Opportunity Zone$/i.test(label)) {
    return { ...entry, label: 'Qualified Opportunity Zone' };
  }
  if (/^Distance to Transmission line$/i.test(label)) {
    return { ...entry, label: 'Distance to Transmission Line' };
  }

  return entry;
}

function promoteContextSection(sections) {
  const contextSection = { title: 'Area & Market', entries: [] };
  const contextLabels = new Set(CONTEXT_ENTRY_ORDER.map((label) => label.toLowerCase()));

  sections.forEach((section) => {
    if (section.title === 'General' || section.title === 'Area & Market') return;
    const remainingEntries = [];

    (section.entries || []).forEach((entry) => {
      const normalizedEntry = normalizeContextEntry(entry);
      const normalizedLabel = String(normalizedEntry.label || '').toLowerCase();
      if (contextLabels.has(normalizedLabel)) {
        contextSection.entries.push(normalizedEntry);
        return;
      }
      remainingEntries.push(entry);
    });

    section.entries = remainingEntries;
  });

  if (contextSection.entries.length === 0) return;

  sortEntriesByLabelOrder(contextSection.entries, CONTEXT_ENTRY_ORDER);

  const generalIndex = sections.findIndex((section) => section.title === 'General');
  if (generalIndex === -1) {
    sections.unshift(contextSection);
  } else {
    sections.splice(generalIndex + 1, 0, contextSection);
  }
}

function pruneSections(sections) {
  for (let i = sections.length - 1; i >= 0; i -= 1) {
    const section = sections[i];
    if (
      section.title === 'Enhanced ownership' ||
      section.title === 'Additional parcel fields' ||
      section.title === 'Other details'
    ) {
      sections.splice(i, 1);
      continue;
    }
    if (!section.entries?.length && !section.resourceLinks?.length) {
      sections.splice(i, 1);
    }
  }
}

/**
 * Append every parcel field not already shown in a prior section.
 */
export function appendExhaustiveRemainingFields(sections, data, layoutConsumed = null) {
  if (!data || typeof data !== 'object') return sections;

  const consumed = layoutConsumed || collectConsumedKeysFromSections(sections);
  const entries = [];

  Object.keys(data)
    .filter((key) => !INTERNAL_KEY_PATTERN.test(key))
    .sort((a, b) => a.localeCompare(b))
    .forEach((key) => {
      if (consumed.has(key) || consumed.has(key.toLowerCase())) return;

      const raw = data[key];
      const displayValue = formatAnyValue(key, raw);
      if (!displayValue) return;

      entries.push({
        label: resolveFieldLabel(data, key),
        displayValue,
        key: `exhaustive_${key}`,
        multiline: displayValue.includes('\n') || displayValue.length > 120,
        linkUrl: isUrl(raw) ? raw.trim() : undefined,
      });
      consumed.add(key);
      consumed.add(key.toLowerCase());
    });

  if (entries.length > 0) {
    const existing = sections.find((s) => s.title === 'Additional parcel fields');
    if (existing) {
      existing.entries.push(...entries);
    } else {
      sections.push({ title: 'Additional parcel fields', entries });
    }
  }

  return sections;
}

export function buildOverviewFields(data, mailingLegal, locationDisplay) {
  const overview = [
    { label: 'Parcel number', value: data?.parcelnumb },
    { label: 'Owner', value: data?.owner },
    { label: 'Address', value: data?.address },
    { label: 'Location', value: locationDisplay },
    ...(data?.headline ? [{ label: 'Headline', value: data.headline }] : []),
    ...(mailingLegal || []).map((entry) => ({
      label: entry.label.replace(/:$/, ''),
      value: entry.displayValue,
      multiline: true,
    })),
  ].filter((row) => row.value != null && row.value !== '');

  return overview;
}

/**
 * Organize full Regrid parcel record for UI (report + side panel expand).
 */
export function buildRegridPropertyLayout(dataSource, locationMeta = {}, feature = null) {
  const { mailingLegal, sections, consumed } = buildDetailSections(dataSource, locationMeta);
  ensureFloodSectionHasFemaFields(sections, dataSource, consumed);

  if (dataSource?.__regridApiResponse) {
    appendRegridApiCollectionSections(sections, dataSource.__regridApiResponse);
  }

  refineBuildingSection(sections);
  moveStructureUseCodeToZoning(sections);
  refineLandAndFinancialSections(sections);
  mergeBuildingAndLandSections(sections);
  promoteContextSection(sections);
  pruneSections(sections);
  sortSectionsByPriority(sections);

  const locationDisplay = parseRegridLocation(
    dataSource?.path,
    dataSource,
    feature || { properties: dataSource }
  );

  return {
    mailingLegal,
    sections,
    overviewFields: buildOverviewFields(dataSource, mailingLegal, locationDisplay),
    locationDisplay,
  };
}

export { parseRegridLocation };
