const SDA_POST_URL = 'https://sdmdataaccess.sc.egov.usda.gov/Tabular/post.rest';

/** @type {Map<string, Promise<{ mukey: string, muname: string, musym: string } | null>>} */
const mapUnitCache = new Map();

function escapeMukey(mukey) {
  return String(mukey || '').trim().replace(/'/g, "''");
}

function parseSdaTableResponse(json) {
  const table = json?.Table;
  if (!Array.isArray(table) || table.length < 2) return null;
  const [headers, ...rows] = table;
  const col = (name) => headers.indexOf(name);
  const row = rows[0];
  if (!row) return null;
  return {
    mukey: String(row[col('mukey')] ?? '').trim(),
    muname: String(row[col('muname')] ?? '').trim(),
    musym: String(row[col('musym')] ?? '').trim(),
  };
}

/**
 * Resolve SSURGO map unit name from MUKEY (not present in hosted MVT tiles).
 * @param {string | number} mukey
 */
export async function fetchSoilMapUnitByMukey(mukey) {
  const key = String(mukey || '').trim();
  if (!key) return null;

  if (mapUnitCache.has(key)) {
    return mapUnitCache.get(key);
  }

  const request = (async () => {
    const response = await fetch(SDA_POST_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: `SELECT mukey, muname, musym FROM mapunit WHERE mukey = '${escapeMukey(key)}'`,
        format: 'JSON+COLUMNNAME',
      }),
    });
    if (!response.ok) {
      throw new Error(`Soil map unit lookup failed (${response.status})`);
    }
    const json = await response.json();
    const parsed = parseSdaTableResponse(json);
    if (!parsed?.muname) return null;
    return parsed;
  })();

  mapUnitCache.set(key, request);

  try {
    return await request;
  } catch (_) {
    mapUnitCache.delete(key);
    return null;
  }
}
