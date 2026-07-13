/** Map Regrid GeoJSON parcel features to legacy search result rows. */

function extractCountyFromPath(path) {
  if (!path) return '';
  const parts = path.split('/').filter(Boolean);
  const countySlug = parts.length >= 3 ? parts[2] : '';
  if (!countySlug) return '';
  return (
    countySlug
      .split('_')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ') + ' County'
  );
}

function extractStateFromPath(path) {
  if (!path) return '';
  const parts = path.split('/').filter(Boolean);
  const stateCode = parts.length >= 2 ? parts[1] : '';
  return stateCode ? stateCode.toUpperCase() : '';
}

export function mapRegridToLegacy(feature) {
  const props = feature.properties || {};
  const fields = props.fields || {};
  const context = props.context || {};
  const addresses = Array.isArray(props.addresses) ? props.addresses : [];
  const firstAddress = addresses[0] || {};
  const enhancedOwnership = Array.isArray(props.enhanced_ownership) ? props.enhanced_ownership : [];
  const firstOwnership = enhancedOwnership[0] || {};
  const ownerName =
    props.owner ||
    fields.owner ||
    firstOwnership.owner ||
    firstOwnership.owner_name ||
    '';
  const parcelNumber =
    props.parcelnumb ||
    fields.parcelnumb ||
    props.headline ||
    '';
  const propertyAddress =
    props.address ||
    fields.address ||
    firstAddress.address ||
    props.headline ||
    '';
  const mailingAddress =
    props.mailing_address ||
    fields.mailing_address ||
    firstAddress.mailing_address ||
    props.mailadd ||
    fields.mailadd ||
    '';
  const derivedCounty = extractCountyFromPath(props.path || context.path);
  const derivedState = extractStateFromPath(props.path || context.path);
  const latRaw = fields.lat ?? props.lat;
  const lonRaw = fields.lon ?? props.lon;
  const lat = latRaw != null && latRaw !== '' ? Number(latRaw) : NaN;
  const lon = lonRaw != null && lonRaw !== '' ? Number(lonRaw) : NaN;

  return {
    GFI: props.ll_uuid || props.global_parcel_uid || props.parcelnumb || '',
    global_parcel_uid: props.ll_uuid || props.global_parcel_uid || '',
    ll_uuid: props.ll_uuid || '',
    pidn: parcelNumber || props.pidn || props.fid || '',
    county_parcel_id: parcelNumber || props.pidn || props.fid || '',
    parcelnumb: parcelNumber || props.fid || '',
    owner: ownerName,
    owner_name: ownerName,
    physical: propertyAddress || props.physical_address || props.physical || '',
    physical_address: propertyAddress || props.physical_address || props.physical || '',
    address: propertyAddress,
    mail: mailingAddress || props.mail || '',
    mailing_address: mailingAddress || props.mail || '',
    county: props.county || fields.county || derivedCounty || '',
    state: props.state || fields.state2 || fields.state || derivedState || '',
    state2: props.state2 || props.state || fields.state2 || fields.state || derivedState || '',
    path: props.path || context.path || fields.path || '',
    lat: Number.isFinite(lat) ? lat : undefined,
    lon: Number.isFinite(lon) ? lon : undefined,
    geometry: feature.geometry || undefined,
    bbox: feature.bbox,
    property_details_key: props.property_details_key || fields.property_details_key || '',
    tax_details_key: props.tax_details_key || fields.tax_details_key || '',
    clerk_records_key: props.clerk_records_key || fields.clerk_records_key || '',
  };
}
