/**
 * Town of Jackson + Teton County LDR review links for a parcel zone code.
 *
 * Primary link is the official LDR PDF with a #page= anchor, verified against the
 * published document (Town LDR updated 7/18/18, Ord. 1199). Municode's SPA rejects
 * constructed ?nodeId= / ?searchRequest= deep links, so those are not used.
 */

const TOWN_LDR_PDF =
  'https://www.tetoncountywy.gov/DocumentCenter/View/1670/Town-of-Jackson-Land-Development-Regulations-PDF';
const TOWN_MUNICODE =
  'https://library.municode.com/wy/jackson/codes/land_development_regulations_';
const COUNTY_LDR_PDF =
  'https://jacksontetonplan.com/DocumentCenter/View/932/Teton-County-Land-Development-Regulations-PDF?bidId=';
const COUNTY_PLANNING = 'https://jacksontetonplan.com/31/Land-Development-Regulations';
const TETON_ZONING_MAP = 'http://maps.greenwoodmap.com/tetonwy/mapserver/';

/**
 * Town zone code → LDR section + absolute page in TOWN_LDR_PDF.
 * Pages read from the document itself, not inferred from the 2-xx print numbering.
 */
const TOWN_ZONE_SECTIONS = {
  'NL-1': { section: '2.2.2', name: 'Neighborhood Low Density-1', page: 34 },
  'NL-2': { section: '2.2.3', name: 'Neighborhood Low Density-2', page: 40 },
  'NL-3': { section: '2.2.4', name: 'Neighborhood Low Density-3', page: 46 },
  'NL-4': { section: '2.2.5', name: 'Neighborhood Low Density-4', page: 52 },
  'NL-5': { section: '2.2.6', name: 'Neighborhood Low Density-5', page: 58 },
  'NM-1': { section: '2.2.7', name: 'Neighborhood Medium Density-1', page: 64 },
  'NM-2': { section: '2.2.8', name: 'Neighborhood Medium Density-2', page: 70 },
  'NH-1': { section: '2.2.9', name: 'Neighborhood High Density-1', page: 76 },
  DC: { section: '2.2.10', name: 'Downtown Core', page: 82 },
  'DC-1': { section: '2.2.10', name: 'Downtown Core', page: 82 },
  'DC-2': { section: '2.2.10', name: 'Downtown Core', page: 82 },
  'CR-1': { section: '2.2.11', name: 'Commercial Residential-1', page: 90 },
  'CR-2': { section: '2.2.12', name: 'Commercial Residential-2', page: 98 },
  'CR-3': { section: '2.2.13', name: 'Commercial Residential-3', page: 106 },
  OR: { section: '2.2.14', name: 'Office Residential', page: 116 },
  TS: { section: '2.3.1', name: 'Town Square (legacy zone)', page: 123 },
  'TS-1': { section: '2.3.1', name: 'Town Square (legacy zone)', page: 123 },
  'TS-2': { section: '2.3.1', name: 'Town Square (legacy zone)', page: 123 },
  UC: { section: '2.3.2', name: 'Urban Commercial (legacy zone)', page: 130 },
  BP: { section: '2.3.10', name: 'Business Park-Town (legacy zone)', page: 139 },
  MHP: { section: '2.3.13', name: 'Mobile Home Park-Town (legacy zone)', page: 146 },
  R: { section: '3.3.1', name: 'Rural Residential-Town (legacy zone)', page: 153 },
  'P/SP': { section: '4.2.1', name: 'Public/Semi-Public - Town', page: 163 },
  PSP: { section: '4.2.1', name: 'Public/Semi-Public - Town', page: 163 },
  P: { section: '4.2.2', name: 'Park and Open Space - Town', page: 169 },
};

/**
 * Zone families unique to the Town LDR. Codes outside this set (R, P, BP, P/SP) also
 * exist in the County LDR, so they only resolve to a Town section when the parcel
 * record actually says Jackson.
 */
const TOWN_ONLY_PREFIX = /^(NL|NM|NH|CR|DC|OR|TS|UC|MHP)(-|$)/;
const OUTSIDE_TOWN = /wilson|alta|teton village|moran|kelly|hoback|moose/;

function normalizeZoneCode(raw) {
  if (raw == null) return '';
  const s = String(raw).trim().toUpperCase();
  if (!s) return '';
  if (s.startsWith('P/SP')) return 'P/SP';
  const m = s.match(/\b([A-Z]{1,4})-?(\d+[A-Z]?)\b/);
  if (m) return `${m[1]}-${m[2]}`;
  const bare = s.match(/\b([A-Z]{1,4})\b/);
  return bare ? bare[1] : s;
}

/** Exact code, then family base (TS-1 → TS) so numbered legacy zones still resolve. */
function lookupTownZone(zoneCode) {
  if (!zoneCode) return null;
  if (TOWN_ZONE_SECTIONS[zoneCode]) return TOWN_ZONE_SECTIONS[zoneCode];
  const base = zoneCode.split('-')[0];
  return TOWN_ZONE_SECTIONS[base] || null;
}

function pdfPageUrl(base, page) {
  if (!page) return base;
  return `${base}#page=${page}`;
}

function isTownOfJackson(props = {}, zoneCode = '') {
  const muni = String(props.municipality_name || props.scity || props.city || '').toLowerCase();
  if (OUTSIDE_TOWN.test(muni)) return false;
  if (muni.includes('jackson')) return true;
  // No usable municipality on the record — trust the zone code only if it's Town-only.
  return TOWN_ONLY_PREFIX.test(zoneCode || normalizeZoneCode(props.zoning || props.zoning_code));
}

/**
 * @returns {{
 *   zoneCode: string,
 *   section: string|null,
 *   sectionTitle: string|null,
 *   primary: { label: string, url: string }|null,
 *   links: { id: string, label: string, url: string }[]
 * }}
 */
export function getZoningOrdinanceReviewLinks(parcelProps = {}, rules = null) {
  const zoneCode = normalizeZoneCode(
    rules?.zoneCode || parcelProps.zoning || parcelProps.zoning_code || ''
  );
  const links = [];
  const seen = new Set();
  const push = (id, label, url) => {
    if (!url || seen.has(url)) return;
    seen.add(url);
    links.push({ id, label, url });
  };

  const town = isTownOfJackson(parcelProps, zoneCode);
  const townMeta = town ? lookupTownZone(zoneCode) : null;
  const section = townMeta?.section || rules?.ldrSection || null;
  const sectionTitle = townMeta?.name || rules?.zoneName || null;

  let primary = null;

  if (townMeta) {
    primary = {
      label: `Read §${townMeta.section} ${zoneCode} — ${townMeta.name}`,
      url: pdfPageUrl(TOWN_LDR_PDF, townMeta.page),
    };
    push('town-section-pdf', primary.label, primary.url);
    push('town-municode', 'Town of Jackson LDR on Municode (current text)', TOWN_MUNICODE);
    push('town-pdf', 'Town of Jackson LDR — full PDF', TOWN_LDR_PDF);
  } else if (town) {
    primary = {
      label: `Find ${zoneCode || 'this zone'} in the Town of Jackson LDR`,
      url: TOWN_LDR_PDF,
    };
    push('town-pdf', primary.label, primary.url);
    push('town-municode', 'Town of Jackson LDR on Municode (current text)', TOWN_MUNICODE);
  } else {
    primary = {
      label: `Find ${zoneCode || 'this zone'} in the Teton County LDRs`,
      url: COUNTY_LDR_PDF,
    };
    push('county-pdf', primary.label, primary.url);
    push('county-planning', 'Teton County planning — LDRs', COUNTY_PLANNING);
  }

  push('zoning-map', 'Official zoning map (Greenwood)', TETON_ZONING_MAP);

  const regridOrdinance = parcelProps.zoning_code_link || parcelProps.zoning_url || null;
  if (regridOrdinance && !/zoneomics\.com/i.test(String(regridOrdinance))) {
    push('regrid-ordinance', 'Ordinance link on parcel record', regridOrdinance);
  }

  return {
    zoneCode,
    section,
    sectionTitle,
    primary,
    links,
  };
}
