const titleCase = (s) =>
  String(s)
    .replace(/_/g, ' ')
    .replace(/\./g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());

/** Preferred Regrid fields → report column labels (shown first). */
const PRIORITY_FIELD_MAP = {
  owner: 'General: Owner',
  owner_name: 'General: Owner',
  parcelnumb: 'General: Parcel Number',
  county_parcel_id: 'General: County Parcel Id',
  address: 'General: Address',
  physical_address: 'General: Physical Address',
  mailing_address: 'General: Mailing Address',
  mailadd: 'General: Mailing Address',
  city: 'General: City',
  state: 'General: State',
  zip: 'General: Zip',
  county: 'General: County',
  usedesc: 'Property: Use Description',
  usedesc_code: 'Property: Use Code',
  landval: 'Tax: Land Value',
  improvval: 'Tax: Improvement Value',
  parval: 'Tax: Total Value',
  taxamt: 'Tax: Tax Amount',
  yearbuilt: 'Property: Year Built',
  sqft: 'Property: Sq Ft',
  acres: 'Property: Acres',
};

const DEFAULT_VISIBLE_COLUMNS = [
  'PIDN',
  'General: Owner',
  'General: Parcel Number',
  'General: Address',
  'General: County',
];

function parcelIdFromFeature(feature, index) {
  const props = feature?.properties || {};
  const fields = props.fields || {};
  return (
    props.county_parcel_id ||
    fields.county_parcel_id ||
    props.parcelnumb ||
    fields.parcelnumb ||
    props.custom_id ||
    `result_${index}`
  );
}

function isEmptyBatchFeature(feature) {
  if (!feature) return true;
  const keys = Object.keys(feature);
  if (keys.length === 0) return true;
  if (keys.length === 1 && keys[0] === 'type' && !feature.geometry && !feature.properties) {
    return true;
  }
  const props = feature.properties || {};
  const fields = props.fields || {};
  return Object.keys(props).length === 0 && Object.keys(fields).length === 0;
}

/**
 * Map newline-delimited GeoJSON batch features to report table rows and column groups.
 */
export function mapBatchFeaturesToReportData(features) {
  if (!Array.isArray(features) || features.length === 0) {
    return { rows: [], groups: [], suggestedColumns: [] };
  }

  const allColumnKeys = new Set(['PIDN']);
  const rows = features.map((feature, index) => {
    if (isEmptyBatchFeature(feature)) {
      const customId = feature?.properties?.custom_id;
      const row = {
        PIDN: customId || `no_match_${index}`,
        'General: Match Status': 'No parcel found',
      };
      allColumnKeys.add('General: Match Status');
      return row;
    }

    const props = feature.properties || {};
    const fields = props.fields || {};
    const merged = { ...fields, ...props };
    delete merged.fields;
    delete merged.geometry;

    const row = { PIDN: parcelIdFromFeature(feature, index) };
    const usedLabels = new Set(['PIDN']);

    Object.entries(PRIORITY_FIELD_MAP).forEach(([rawKey, label]) => {
      const value = merged[rawKey];
      if (value === undefined || value === null || value === '') return;
      if (usedLabels.has(label)) return;
      row[label] = value;
      allColumnKeys.add(label);
      usedLabels.add(label);
    });

    if (props.custom_id && !row['General: Custom Id']) {
      row['General: Custom Id'] = props.custom_id;
      allColumnKeys.add('General: Custom Id');
    }

    Object.entries(merged).forEach(([rawKey, value]) => {
      if (PRIORITY_FIELD_MAP[rawKey]) return;
      if (value === null || value === undefined) return;
      if (typeof value === 'object') return;

      const label = `Parcel: ${titleCase(rawKey)}`;
      if (usedLabels.has(label)) return;
      row[label] = value;
      allColumnKeys.add(label);
      usedLabels.add(label);
    });

    return row;
  });

  const generalFields = [];
  const propertyFields = [];
  const taxFields = [];
  const parcelFields = [];

  Array.from(allColumnKeys)
    .filter((k) => k !== 'PIDN')
    .sort()
    .forEach((key) => {
      const field = { key };
      if (key.startsWith('General:')) generalFields.push(field);
      else if (key.startsWith('Property:')) propertyFields.push(field);
      else if (key.startsWith('Tax:')) taxFields.push(field);
      else parcelFields.push(field);
    });

  const groups = [{ id: 'identifier', label: 'Identifier', fields: [{ key: 'PIDN' }] }];
  if (generalFields.length) groups.push({ id: 'general_info', label: 'General Info', fields: generalFields });
  if (propertyFields.length) groups.push({ id: 'property_data', label: 'Property Data', fields: propertyFields });
  if (taxFields.length) groups.push({ id: 'tax_data', label: 'Tax Data', fields: taxFields });
  if (parcelFields.length) groups.push({ id: 'parcel_fields', label: 'Additional Parcel Fields', fields: parcelFields });

  const suggestedColumns = DEFAULT_VISIBLE_COLUMNS.filter((col) => allColumnKeys.has(col));

  return { rows, groups, suggestedColumns };
}

export function batchFeaturesToCsv(features) {
  const { rows } = mapBatchFeaturesToReportData(features);
  if (!rows.length) return '';

  const headerSet = new Set();
  rows.forEach((row) => Object.keys(row).forEach((k) => headerSet.add(k)));
  const headers = Array.from(headerSet);
  const escapeCsv = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;
  return [
    headers.map(escapeCsv).join(','),
    ...rows.map((row) => headers.map((h) => escapeCsv(row[h] ?? '')).join(',')),
  ].join('\n');
}
