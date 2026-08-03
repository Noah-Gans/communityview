/**
 * Routes that mount the main Mapbox map (MapPage).
 * Marketing, auth, and static pages are excluded.
 */
export function isMapBackedRoute(pathname = '') {
  if (!pathname) return false;
  if (pathname === '/map') return true;
  if (pathname === '/search') return true;
  if (pathname === '/print') return true;
  if (pathname === '/report') return true;
  if (pathname.startsWith('/view/')) return true;
  if (pathname.startsWith('/tour/')) return true;
  if (pathname.startsWith('/amenities/')) return true;
  return false;
}
