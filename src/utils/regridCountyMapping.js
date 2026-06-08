/**
 * Maps county codes to Regrid path format (/us/state/county)
 * Regrid paths use lowercase state abbreviations and lowercase county names with underscores
 */

// Map from your county codes to Regrid paths
export const COUNTY_TO_REGRID_PATH = {
  'teton_county_id': '/us/id/teton',
  'fillmore_county_ne': '/us/ne/fillmore'
};

// Reverse mapping for display purposes
export const REGRID_PATH_TO_COUNTY = Object.fromEntries(
  Object.entries(COUNTY_TO_REGRID_PATH).map(([code, path]) => [path, code])
);

/**
 * Convert county code(s) to Regrid path(s)
 * @param {string|string[]} countyCodes - County code(s) to convert
 * @returns {string|string[]|null} - Regrid path(s) or null if not found
 */
export const countyCodeToRegridPath = (countyCodes) => {
  if (Array.isArray(countyCodes)) {
    return countyCodes
      .map(code => COUNTY_TO_REGRID_PATH[code])
      .filter(path => path !== undefined);
  }
  return COUNTY_TO_REGRID_PATH[countyCodes] || null;
};

/**
 * Get all available counties with their Regrid paths
 * @returns {Array} - Array of {display, code, path} objects
 */
export const getAvailableCountiesWithPaths = (availableCounties) => {
  return availableCounties.map(county => ({
    ...county,
    regridPath: COUNTY_TO_REGRID_PATH[county.code] || null
  }));
};
