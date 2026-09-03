import { useEffect } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { findFreeCountyMap } from '../data/freeCountyMaps';

/**
 * Entry point for a free, no-login county map — no visible UI of its own.
 * The county slug in the URL only matters for the initial landing: Map.js
 * reads lat/lng/zoom/layers from the URL once, on its own first mount (see
 * resolveInitialMapView), which centers the persistent <MapPage/> singleton
 * on this county. Crawlable text for this URL lives in the build-time static
 * shell (scripts/generateMarketingSeoShells.js), not here — it's stripped
 * from the DOM right after React mounts (src/index.js) so real visitors
 * never see it.
 *
 * Once the visitor actually touches the map (drag/wheel/touch), the URL
 * quietly drops back to plain /map — the county slug was just an entry
 * point, not meant to keep describing wherever they've since panned to.
 * Map.js's own moveend handler (syncMapUrlRef) keeps writing live lat/lng
 * into the query string regardless; we only swap the pathname.
 */
export default function FreeCountyMapPage() {
  const { state, countySlug } = useParams();
  const navigate = useNavigate();
  const county = findFreeCountyMap(state, countySlug);

  useEffect(() => {
    if (!county) return undefined;
    const mapEl = document.getElementById('map');
    if (!mapEl) return undefined;

    const dropCountyFromUrl = () => {
      navigate({ pathname: '/map', search: window.location.search }, { replace: true });
    };

    mapEl.addEventListener('mousedown', dropCountyFromUrl, { once: true });
    mapEl.addEventListener('touchstart', dropCountyFromUrl, { once: true, passive: true });
    mapEl.addEventListener('wheel', dropCountyFromUrl, { once: true, passive: true });

    return () => {
      mapEl.removeEventListener('mousedown', dropCountyFromUrl);
      mapEl.removeEventListener('touchstart', dropCountyFromUrl);
      mapEl.removeEventListener('wheel', dropCountyFromUrl);
    };
  }, [county, navigate]);

  if (!county) {
    return <Navigate to="/map" replace />;
  }

  return null;
}
