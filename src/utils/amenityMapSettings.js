/**
 * Amenity map presentation settings on maps/{id}.amenityMapSettings.
 * Separate from tourNearbyCache so POI/tour merges cannot wipe basemap + home pin.
 *
 * Access:
 * - guestEdit: true → /amenities/:token?edit=1 works without login (sales / trial maps)
 * - otherwise edit requires the map owner signed in
 */

function finiteCoord(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function sanitizeHomeMarker(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const lat = finiteCoord(raw.lat);
  const lng = finiteCoord(raw.lng);
  if (lat == null || lng == null) return null;
  return { lat, lng };
}

function sanitizeAmenityMapBasemap(raw) {
  const id = String(raw || '').trim();
  if (
    id === 'outdoors-v12' ||
    id === 'imagery' ||
    id === 'satellite-streets-v12' ||
    id === 'streets-v11'
  ) {
    return id;
  }
  const aliases = {
    discover: 'outdoors-v12',
    outdoors: 'outdoors-v12',
    satellite: 'satellite-streets-v12',
    streets: 'streets-v11',
    'imagery-3d': 'imagery',
  };
  return aliases[id.toLowerCase()] || null;
}

function sanitizeGuestEditExpiresAt(raw) {
  if (raw == null || raw === '') return null;
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    return new Date(raw).toISOString();
  }
  const s = String(raw).trim();
  if (!s) return null;
  const t = Date.parse(s);
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
}

/**
 * @param {unknown} raw
 * @param {{ allowAccessFlags?: boolean }} [opts]
 * @returns {{
 *   basemap?: string,
 *   homeMarker?: { lat: number, lng: number },
 *   guestEdit?: boolean,
 *   guestEditExpiresAt?: string,
 * } | null}
 */
export function normalizeAmenityMapSettings(raw, opts = {}) {
  if (!raw || typeof raw !== 'object') return null;
  const allowAccessFlags = opts.allowAccessFlags === true;
  const out = {};
  const basemap = sanitizeAmenityMapBasemap(raw.basemap || raw.amenityMapBasemap);
  if (basemap) out.basemap = basemap;
  const homeMarker = sanitizeHomeMarker(raw.homeMarker);
  if (homeMarker) out.homeMarker = homeMarker;
  if (allowAccessFlags) {
    if (raw.guestEdit === true) out.guestEdit = true;
    if (raw.guestEdit === false) out.guestEdit = false;
    const expires = sanitizeGuestEditExpiresAt(raw.guestEditExpiresAt);
    if (expires) out.guestEditExpiresAt = expires;
    if (raw.guestEditExpiresAt === null || raw.guestEditExpiresAt === '') {
      out.guestEditExpiresAt = null;
    }
  } else if (raw.guestEdit === true) {
    // Safe to expose to clients so the amenity page knows guest edit is allowed.
    out.guestEdit = true;
    const expires = sanitizeGuestEditExpiresAt(raw.guestEditExpiresAt);
    if (expires) out.guestEditExpiresAt = expires;
  }
  return Object.keys(out).length ? out : null;
}

/** Whether amenity editor may be used without being the map owner. */
export function isGuestEditAllowed(settings) {
  const s = normalizeAmenityMapSettings(settings, { allowAccessFlags: true });
  if (!s || s.guestEdit !== true) return false;
  if (s.guestEditExpiresAt) {
    const t = Date.parse(s.guestEditExpiresAt);
    if (Number.isFinite(t) && Date.now() > t) return false;
  }
  return true;
}

/**
 * @param {{ guestEdit?: boolean, viewerIsOwner?: boolean }|null|undefined} access
 */
export function canEditAmenityMap(access) {
  if (!access || typeof access !== 'object') return false;
  return access.viewerIsOwner === true || access.guestEdit === true;
}

/**
 * Build the payload the amenity editor writes on Save.
 * @param {{
 *   basemap?: string,
 *   homeMarker?: { lat: number, lng: number }|null,
 *   guestEdit?: boolean,
 *   guestEditExpiresAt?: string|null,
 * }} opts
 * @param {{ allowAccessFlags?: boolean }} [flags]
 */
export function buildAmenityMapSettingsForSave(opts = {}, flags = {}) {
  return normalizeAmenityMapSettings(
    {
      basemap: opts.basemap,
      homeMarker: opts.homeMarker,
      guestEdit: opts.guestEdit,
      guestEditExpiresAt: opts.guestEditExpiresAt,
    },
    { allowAccessFlags: flags.allowAccessFlags === true }
  );
}
