/**
 * Routes that mount the main Mapbox map (MapPage).
 * Marketing, auth, and static pages are excluded.
 */

/** Strip trailing slashes so `/map/` matches `/map` (Firebase / bookmarks often add them). */
export function normalizePathname(pathname = '') {
  if (!pathname) return '';
  if (pathname === '/') return '/';
  return pathname.replace(/\/+$/, '') || '/';
}

/** Public link document: /view, /tour, /amenities. Anyone with the URL; no account chrome. */
export function isPublicShareRoute(pathname = '') {
  const path = normalizePathname(pathname);
  if (!path) return false;
  return (
    path.startsWith('/view/') ||
    path.startsWith('/tour/') ||
    path.startsWith('/amenities/')
  );
}

export function isMapBackedRoute(pathname = '') {
  const path = normalizePathname(pathname);
  if (!path) return false;
  if (path === '/map') return true;
  if (path === '/search') return true;
  if (path === '/print') return true;
  if (path === '/report') return true;
  return isPublicShareRoute(path);
}
