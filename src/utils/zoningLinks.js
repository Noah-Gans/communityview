/**
 * County-specific zoning resource links for the property details panel.
 * Used when Regrid does not supply zoning_link / zoning_url fields.
 */

const TETON_COUNTY_WY_LINKS = [
  {
    id: 'official-map',
    label: 'Official zoning map',
    url: 'http://maps.greenwoodmap.com/tetonwy/mapserver/',
  },
  {
    id: 'ldr',
    label: 'Land Development Regulations',
    url: 'https://jacksontetonplan.com/DocumentCenter/View/932/Teton-County-Land-Development-Regulations-PDF?bidId=',
  },
  {
    id: 'planning-portal',
    label: 'Planning portal',
    url: 'https://jacksontetonplan.com/',
  },
];

function normalizeCountySlug(value) {
  if (!value || typeof value !== 'string') return '';
  return value
    .toLowerCase()
    .replace(/_/g, '-')
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .trim();
}

function parsePathLocation(path) {
  if (!path || typeof path !== 'string') return { state: null, countySlug: null };
  const parts = path.split('/').filter(Boolean);
  if (parts.length >= 3 && parts[0] === 'us') {
    return {
      state: parts[1]?.toUpperCase() || null,
      countySlug: normalizeCountySlug(parts[2]),
    };
  }
  return { state: null, countySlug: null };
}

function isTetonCountyWy({ state, countySlug, countyName }) {
  const stateUpper = (state || '').toUpperCase();
  if (stateUpper && stateUpper !== 'WY') return false;

  const slug = countySlug || normalizeCountySlug(countyName);
  return slug.includes('teton');
}

function appendUniqueLink(links, seen, link) {
  if (!link?.url || seen.has(link.url)) return;
  seen.add(link.url);
  links.push(link);
}

/**
 * @param {object} options
 * @param {string} [options.path] Regrid parcel path (e.g. us/wy/teton-county)
 * @param {string} [options.state]
 * @param {string} [options.county]
 * @param {string} [options.zoningCode]
 * @param {string} [options.regridZoningUrl] URL from Regrid fields when present
 * @returns {{ id: string, label: string, url: string }[]}
 */
export function getZoningResourceLinks({
  path,
  state,
  county,
  zoningCode,
  regridZoningUrl,
} = {}) {
  const pathLoc = parsePathLocation(path);
  const resolvedState = (state || pathLoc.state || '').toUpperCase();
  const countySlug = pathLoc.countySlug || normalizeCountySlug(county);
  const links = [];
  const seen = new Set();

  if (regridZoningUrl) {
    appendUniqueLink(links, seen, {
      id: 'regrid-zoning',
      label: 'Zoning reference',
      url: String(regridZoningUrl),
    });
  }

  if (!isTetonCountyWy({ state: resolvedState, countySlug, countyName: county })) {
    return links;
  }

  TETON_COUNTY_WY_LINKS.forEach((link) => appendUniqueLink(links, seen, link));

  const code = zoningCode != null ? String(zoningCode).trim() : '';
  if (code) {
    appendUniqueLink(links, seen, {
      id: 'ldr-search',
      label: `Search “${code}” in LDRs`,
      url: `https://jacksontetonplan.com/Search?searchTerm=${encodeURIComponent(code)}`,
    });
  }

  return links;
}
