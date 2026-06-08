import { getCountyCodeFromFeature, getCountyParcelIdFromFeature } from './parseGFI';

/**
 * Human-readable rows for Report Builder preview (before batch download).
 */
export function buildReportSelectionPreviewItems(features) {
  if (!Array.isArray(features) || features.length === 0) return [];

  const seen = new Set();
  const items = [];

  features.forEach((feature, index) => {
    const props = feature?.properties || {};
    const fields =
      props.fields && typeof props.fields === 'object' && !Array.isArray(props.fields)
        ? props.fields
        : {};

    const owner =
      props.owner ||
      fields.owner ||
      props.owner_name ||
      fields.owner_name ||
      props.headline ||
      'Unknown owner';
    const address =
      props.address ||
      fields.address ||
      props.physical_address ||
      fields.physical_address ||
      props.physical ||
      '';
    const parcelId =
      props.parcelnumb ||
      fields.parcelnumb ||
      getCountyParcelIdFromFeature(feature) ||
      props.pidn ||
      props.GFI ||
      props.ll_uuid ||
      `Parcel ${index + 1}`;
    const county = props.county || fields.county || '';
    const state = props.state2 || props.state || fields.state2 || fields.state || '';

    const dedupeKey =
      props.ll_uuid ||
      props.GFI ||
      (getCountyCodeFromFeature(feature) &&
      getCountyParcelIdFromFeature(feature)
        ? `${getCountyCodeFromFeature(feature)}|${getCountyParcelIdFromFeature(feature)}`
        : null) ||
      `row-${index}`;

    if (seen.has(dedupeKey)) return;
    seen.add(dedupeKey);

    items.push({
      key: String(dedupeKey),
      owner: String(owner).trim() || 'Unknown owner',
      address: String(address).trim(),
      parcelId: String(parcelId).trim(),
      location: [county, state].filter(Boolean).join(', '),
    });
  });

  return items;
}
