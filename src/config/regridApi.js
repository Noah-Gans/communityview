/**
 * Regrid REST API — parcel JSON and tiles are proxied via Firebase Functions.
 * Set the secret on the server (not in the React bundle):
 *
 *   firebase functions:config:set regrid.token="YOUR_REGRID_JWT"
 *   firebase deploy --only functions:regridApi,functions:regridTileProxy
 *
 * Optional dev override (exposes token in browser — avoid in production):
 *   REACT_APP_REGRID_API_TOKEN=...
 */
import { getApp } from 'firebase/app';

export const REGRID_API_BASE_URL = 'https://app.regrid.com/api/v2';

/** @deprecated Client-side token is no longer used; kept for optional local override only. */
export const REGRID_API_TOKEN =
  (typeof process !== 'undefined' && process.env.REACT_APP_REGRID_API_TOKEN) || '';

function getFirebaseProjectId() {
  try {
    return getApp().options.projectId || 'tetoncountygis';
  } catch {
    return 'tetoncountygis';
  }
}

/** Public HTTP tile proxy (no token in URL). */
export const REGRID_TILE_PROXY_BASE =
  (typeof process !== 'undefined' && process.env.REACT_APP_REGRID_TILE_PROXY_URL) ||
  `https://us-central1-${getFirebaseProjectId()}.cloudfunctions.net/regridTileProxy`;

/**
 * Rewrite Regrid MVT template URLs to our tile proxy (strips any token query param).
 */
export function rewriteRegridTileUrlToProxy(templateUrl) {
  if (!templateUrl || typeof templateUrl !== 'string') return templateUrl;
  if (templateUrl.indexOf('tiles.regrid.com') === -1) return templateUrl;
  const stripped = templateUrl
    .replace(/([?&])token=[^&]*(&)?/gi, (_, sep, amp) => (amp ? sep : ''))
    .replace(/[?&]$/, '');
  const pathMatch = stripped.match(/https?:\/\/tiles\.regrid\.com(\/api\/v1\/[^?]+)/i);
  if (!pathMatch) return stripped;
  return `${REGRID_TILE_PROXY_BASE.replace(/\/$/, '')}${pathMatch[1]}`;
}
