/**
 * Discover Regrid county paths from the map viewport (center + adjacent counties).
 */

export function countyLevelPath(path) {
  if (!path || typeof path !== 'string') return null;
  const parts = path.split('/').filter(Boolean);
  if (parts.length < 3 || parts[0] !== 'us') return null;
  return `/${parts.slice(0, 3).join('/')}`;
}

export function toCountyCodeFromPath(path) {
  const countyPath = countyLevelPath(path);
  if (!countyPath) return null;
  const parts = countyPath.split('/').filter(Boolean);
  const state = parts[1];
  const county = parts[2];
  if (!state || !county) return null;
  return `${county}_county_${state}`;
}

export function toCountyDisplayFromPath(path) {
  const countyPath = countyLevelPath(path);
  if (!countyPath) return 'Unknown County';
  const parts = countyPath.split('/').filter(Boolean);
  const state = (parts[1] || '').toUpperCase();
  const countySlug = parts[2] || '';
  const countyName = countySlug
    .split('_')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
  return `${countyName} County, ${state}`;
}

export function buildMapCountySamplePoints(map) {
  const center = map.getCenter();
  const bounds = map.getBounds();
  const north = bounds.getNorth();
  const south = bounds.getSouth();
  const east = bounds.getEast();
  const west = bounds.getWest();
  const latMid = (north + south) / 2;
  const lngMid = (east + west) / 2;
  const latSpan = Math.max(Math.abs(north - south), 0.05);
  const lngSpan = Math.max(Math.abs(east - west), 0.05);
  const latRing = Math.min(Math.max(latSpan * 0.55, 0.15), 1.2);
  const lngRing = Math.min(Math.max(lngSpan * 0.55, 0.15), 1.2);

  return [
    { lat: center.lat, lon: center.lng, role: 'center' },
    { lat: center.lat + latRing, lon: center.lng },
    { lat: center.lat - latRing, lon: center.lng },
    { lat: center.lat, lon: center.lng + lngRing },
    { lat: center.lat, lon: center.lng - lngRing },
    { lat: center.lat + latRing, lon: center.lng + lngRing },
    { lat: center.lat + latRing, lon: center.lng - lngRing },
    { lat: center.lat - latRing, lon: center.lng + lngRing },
    { lat: center.lat - latRing, lon: center.lng - lngRing },
    { lat: north, lon: lngMid },
    { lat: south, lon: lngMid },
    { lat: latMid, lon: east },
    { lat: latMid, lon: west },
  ];
}

async function lookupCountyAt(lat, lon, radiusMeters, regridRestGet, applyRegridSearchListParams) {
  const params = new URLSearchParams({
    lat: String(lat),
    lon: String(lon),
    radius: String(radiusMeters),
    limit: '1',
  });
  applyRegridSearchListParams(params);

  try {
    const data = await regridRestGet('parcels/point', Object.fromEntries(params));
    const feature = data?.parcels?.features?.[0];
    const rawPath = feature?.properties?.context?.path || feature?.properties?.path || '';
    const path = countyLevelPath(rawPath);
    if (!path) return null;
    return {
      code: toCountyCodeFromPath(path),
      display: toCountyDisplayFromPath(path),
      path,
    };
  } catch {
    return null;
  }
}

/**
 * @returns {Promise<Array<{ code, display, path, isCenter?: boolean }>>}
 */
export async function discoverCountiesFromMap(map, { regridRestGet, applyRegridSearchListParams }) {
  if (!map?.getCenter) return [];

  const samplePoints = buildMapCountySamplePoints(map);
  const byPath = new Map();
  let centerPath = null;

  const results = await Promise.all(
    samplePoints.map(async (point) => {
      const radius = point.role === 'center' ? 0 : 50;
      const county = await lookupCountyAt(
        point.lat,
        point.lon,
        radius,
        regridRestGet,
        applyRegridSearchListParams
      );
      return { county, role: point.role };
    })
  );

  results.forEach(({ county, role }) => {
    if (!county?.path) return;
    if (!byPath.has(county.path)) {
      byPath.set(county.path, { ...county, isCenter: role === 'center' });
    }
    if (role === 'center') centerPath = county.path;
  });

  const list = Array.from(byPath.values());
  if (centerPath) {
    list.forEach((entry) => {
      entry.isCenter = entry.path === centerPath;
    });
  }

  list.sort((a, b) => {
    if (Boolean(a.isCenter) !== Boolean(b.isCenter)) {
      return a.isCenter ? -1 : 1;
    }
    return a.display.localeCompare(b.display);
  });

  return list;
}
