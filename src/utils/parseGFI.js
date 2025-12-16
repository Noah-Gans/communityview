/**
 * Parse GFI (Global Feature Identifier) to extract county and county_parcel_id
 * 
 * GFI format: {county}_{county_parcel_id}
 * Example: "teton_county_wy_22-41-16-29-3-00-012"
 * 
 * @param {string} gfi - The GFI string to parse
 * @returns {object} - Object with county and county_parcel_id, or null if parsing fails
 */
export function parseGFI(gfi) {
  if (!gfi || typeof gfi !== 'string') {
    return null;
  }

  // Split by underscore to separate county from parcel ID
  const parts = gfi.split('_');
  
  // The parcel ID is the last part (everything after the last underscore)
  // The county is everything before the last underscore
  if (parts.length < 2) {
    return null;
  }

  const countyParcelId = parts[parts.length - 1];
  const county = parts.slice(0, -1).join('_');

  return {
    county,
    county_parcel_id: countyParcelId,
    original: gfi
  };
}

/**
 * Get county code from feature properties, falling back to GFI parsing
 * 
 * @param {object} feature - Feature object with properties
 * @returns {string} - County code (e.g., 'teton_county_wy')
 */
export function getCountyCodeFromFeature(feature) {
  // First try to get from properties directly (for backward compatibility)
  if (feature?.properties?.county_code) {
    return feature.properties.county_code;
  }
  
  if (feature?.properties?.county) {
    const county = feature.properties.county.toLowerCase();
    // Handle different county formats
    if (county.includes('teton') && county.includes('wy')) return 'teton_county_wy';
    if (county.includes('teton') && county.includes('id')) return 'teton_county_id';
    if (county.includes('lincoln')) return 'lincoln_county_wy';
    if (county.includes('sublette')) return 'sublette_county_wy';
    if (county.includes('fremont')) return 'fremont_county_wy';
  }

  // Fall back to parsing GFI if available
  if (feature?.properties?.GFI) {
    const parsed = parseGFI(feature.properties.GFI);
    if (parsed?.county) {
      return parsed.county;
    }
  }

  // Default fallback
  return 'teton_county_wy';
}

/**
 * Get county parcel ID from feature properties, falling back to GFI parsing
 * 
 * @param {object} feature - Feature object with properties
 * @returns {string} - County parcel ID or empty string
 */
export function getCountyParcelIdFromFeature(feature) {
  // First try to get from properties directly (for backward compatibility)
  if (feature?.properties?.county_parcel_id) {
    return feature.properties.county_parcel_id;
  }

  if (feature?.properties?.parcel_id) {
    return feature.properties.parcel_id;
  }

  // Fall back to parsing GFI if available
  if (feature?.properties?.GFI) {
    const parsed = parseGFI(feature.properties.GFI);
    if (parsed?.county_parcel_id) {
      return parsed.county_parcel_id;
    }
  }

  return '';
}








