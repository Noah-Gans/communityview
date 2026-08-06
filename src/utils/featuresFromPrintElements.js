/**
 * Build GeoJSON-like features from a saved map's print boundary elements
 * (and related listing parcel sources) for amenity / neighborhood generation.
 */
import { isRegridParcelPolygonFeature } from './regridParcelBoundary';

function str(v) {
  return String(v == null ? '' : v).trim();
}

function isBoundaryElement(el) {
  if (!el || el.type !== 'polygon') return false;
  if (el.mapStyleVariant === 'boundary') return true;
  if (String(el.tool || '').includes('boundary')) return true;
  if (String(el.id || '').startsWith('docgen_boundary_')) return true;
  const stroke = String(el.stroke || '').toLowerCase();
  return stroke === '#ff2222' || stroke === '#ef4444' || stroke === '#dc2626';
}

/**
 * Prefer explicit parcelProperties stored when the boundary was created;
 * fall back to any ll_uuid / apn on the element.
 */
function propsFromElement(el) {
  const seed = el?.parcelProperties || el?.properties || {};
  return {
    ...seed,
    ll_uuid: str(el?.ll_uuid || seed.ll_uuid),
    path: str(el?.path || seed.path),
    owner: str(seed.owner || seed.owner2 || el?.owner),
    address: str(seed.address || seed.situs_address || seed.physaddr || el?.label),
    parcelnumb: str(seed.parcelnumb || seed.county_parcel_id || seed.apn || el?.apn),
    apn: str(seed.apn || seed.parcelnumb || seed.county_parcel_id),
    zip: str(seed.zip || seed.situs_zip || seed.mail_zip),
  };
}

/**
 * @param {unknown[]} printElements
 * @returns {object[]}
 */
export function featuresFromPrintElements(printElements) {
  const out = [];
  const seen = new Set();

  (printElements || []).forEach((el) => {
    if (!isBoundaryElement(el)) return;
    const geometry = el.geometry;
    if (!geometry || (geometry.type !== 'Polygon' && geometry.type !== 'MultiPolygon')) return;

    const properties = propsFromElement(el);
    const feature = {
      type: 'Feature',
      geometry,
      properties,
      layer: { id: 'regrid-parcels-layer' },
    };

    const key =
      properties.ll_uuid ||
      properties.path ||
      properties.apn ||
      properties.parcelnumb ||
      JSON.stringify(geometry?.coordinates?.[0]?.[0]);
    if (seen.has(key)) return;
    seen.add(key);
    out.push(feature);
  });

  return out;
}

/**
 * Merge listing parcel refs, live selection, and saved print boundaries.
 */
export function featuresForListingParcels({
  listingParcelRefs,
  selectedFeatures,
  printElements,
} = {}) {
  const fromRefs = (listingParcelRefs || []).filter((f) => f?.geometry);
  if (fromRefs.length) return fromRefs;

  const selected = (selectedFeatures || []).filter(isRegridParcelPolygonFeature);
  if (selected.length) return selected;

  return featuresFromPrintElements(printElements);
}
