import React, { useMemo, useEffect, useState, useCallback, useRef } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { useMapContext } from '../MapContext';
import { mapService } from '../../services/mapService';
import { svgMap } from '../../components/map/printShapes/svgMap';
import { legends } from '../../assets/legends';
import { layerNameMappings } from '../../components/map/layerMappings';
import { getPointIconCatalogLabel } from './printCatalog';
import { getBoundsFromPrintElements, getBoundsFromViewport } from '../../utils/sharedMapTourBounds';
import {
  applyPropertyTourSlide,
  buildTourOrbitLayerPatch,
  getNearbyPlaceHoverKey,
  getTourStepCount,
  getTourNearbySearchCenter,
  PROPERTY_TOUR_SLIDES,
  rankPrintElementsWithPhotos,
  setTourVicinityNearbyHoverHighlight,
  TOUR_NEARBY_AMENITY_ORDER,
  TOUR_ORBIT_PRINT_FILTER_ATTR,
  TOUR_ORBIT_PRINT_FILTER_VALUE,
  TOUR_NEARBY_SEARCH_RADIUS_METERS,
  TOUR_VICINITY_LEFT_PANEL_MAP_PAD,
} from '../../utils/propertyTourSlides';
import { TOUR_NEARBY_DATA_VERSION } from '../../utils/tourNearbyRanking';
import {
  buildTourNearbyCacheForSave,
  hydrateNearbyContextByAmenity,
} from '../../utils/tourNearbyFirestore';
import { buildSharedMapAgentMeta } from '../../utils/sharedMapAgentMeta';
import { getPhotoSrcListFromElement } from '../../utils/mapPhotoStorage';
import { waitForMapIdle, waitForMapRef } from '../../utils/waitForMapIdle';
import './Print.css';

const TOUR_BASEMAP_QUERY = 'imagery-3d';

function raceWithTimeout(promise, timeoutMs) {
  return Promise.race([
    promise,
    new Promise((resolve) => window.setTimeout(resolve, timeoutMs)),
  ]);
}

const SharedAgentCard = ({ meta, description }) => {
  const hasContact = meta?.agentEmail || meta?.agentPhone;
  const propertyDescription = String(description ?? meta?.description ?? '').trim();

  return (
    <div className="shared-side-agent-card">
      {propertyDescription ? (
        <p className="shared-side-agent-description">{propertyDescription}</p>
      ) : null}
      <div className="shared-side-agent-contact-row">
        {meta?.agentPhoto ? (
          <img className="shared-side-agent-photo" src={meta.agentPhoto} alt="" />
        ) : null}
        <div className="shared-side-agent-details">
          <div className="shared-side-agent-name">{meta?.agentName || 'Listing agent'}</div>
          {meta?.agentEmail ? (
            <a href={`mailto:${meta.agentEmail}`} className="shared-side-agent-link">
              {meta.agentEmail}
            </a>
          ) : null}
          {meta?.agentPhone ? (
            <a href={`tel:${meta.agentPhone}`} className="shared-side-agent-link">
              {meta.agentPhone}
            </a>
          ) : null}
          {!hasContact ? (
            <div className="shared-side-agent-muted">Contact details not provided.</div>
          ) : null}
        </div>
      </div>
      {meta?.agentLogo ? (
        <img className="shared-side-agent-logo" src={meta.agentLogo} alt="Firm logo" />
      ) : null}
    </div>
  );
};

/**
 * Left inset for map `fitBounds` / `cameraForBounds` so listing + markers stay clear of the
 * fixed tour nearby card (width + `left` offset vary with viewport).
 */
function measureTourNearbyPanelLeftPaddingPx() {
  if (typeof document === 'undefined') return TOUR_VICINITY_LEFT_PANEL_MAP_PAD;
  const panel = document.querySelector('.cv-tour-nearby-panel.shared-tour-nearby-card');
  if (!panel) return TOUR_VICINITY_LEFT_PANEL_MAP_PAD;
  try {
    const r = panel.getBoundingClientRect();
    const gutter = 24;
    const fromLeftEdge = Math.ceil(r.right + gutter);
    return Math.max(TOUR_VICINITY_LEFT_PANEL_MAP_PAD, fromLeftEdge);
  } catch (_) {
    return TOUR_VICINITY_LEFT_PANEL_MAP_PAD;
  }
}

/**
 * Public client view for a shared map (/view/:shareToken).
 * Loads map payload via Cloud Function and applies it to the global Map instance.
 */
export default function SharedMapViewPage() {
  const TOUR_LOCKED_BASEMAP_ID = TOUR_BASEMAP_QUERY;
  const { shareToken } = useParams();
  const location = useLocation();
  const {
    mapRef,
    applyTourPropertyBasemapRef,
    setPrintElements,
    layerStatus,
    setLayerStatus,
    layerOrder,
    setLayerOrder,
    setPaperSize,
    setIsPrinting,
    setActivePrintTool,
    setSelectedPrintElement,
    printElements,
    setCurrentBasemapId,
  } = useMapContext();

  const [meta, setMeta] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [mapRevealReady, setMapRevealReady] = useState(false);
  /** Tour only: basemap + idle finished so slide 0 camera can run without racing style load. */
  const [tourBasemapReady, setTourBasemapReady] = useState(false);
  const [activeTab, setActiveTab] = useState('info');
  const [panelOpen, setPanelOpen] = useState(
    () => new URLSearchParams(window.location.search).get('embed') !== '1'
  );
  const [savedViewport, setSavedViewport] = useState(null);
  const [nearbyContextGeoJson, setNearbyContextGeoJson] = useState(null);
  const [nearbyContextByAmenity, setNearbyContextByAmenity] = useState({});
  const [nearbyFetchState, setNearbyFetchState] = useState('idle');
  const [nearbyFetchError, setNearbyFetchError] = useState('');
  const [nearbyFetchCount, setNearbyFetchCount] = useState(0);
  const [nearbyFetchNames, setNearbyFetchNames] = useState([]);
  const [tourSlideIndex, setTourSlideIndex] = useState(0);
  const [hoveredPlaceKey, setHoveredPlaceKey] = useState(null);
  const tourLayerBaselineRef = useRef(null);
  const tourLayerOrderBaselineRef = useRef(null);
  const tourBaselineCapturedRef = useRef(false);
  const tourStepTwoPrewarmedRef = useRef(false);
  const tourNavLockRef = useRef(false);
  const orbitFrameRef = useRef(null);
  /** Timeout before starting orbit on slide 2 (must clear with camera cancels). */
  const tourOrbitKickRef = useRef(null);
  const tourRunIdRef = useRef(0);
  /** Monotonic id so deferred context-slide camera work does not run after the user has advanced. */
  const tourApplySeqRef = useRef(0);
  const pendingSharedDataRef = useRef(null);
  /** Prevents duplicate all-amenity prefetch batches for the same search center. */
  const nearbyPrefetchInFlightRef = useRef(null);
  const tourNearbyCacheSaveRef = useRef(null);

  const toTitleCase = (value) =>
    String(value || '')
      .replace(/[_-]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/\b\w/g, (m) => m.toUpperCase());

  const getElementDefaultName = useCallback((el) => {
    if (!el) return 'Feature';
    if (el.type === 'shape') {
      return getPointIconCatalogLabel(el.svgKey) || 'Point';
    }
    if (el.type === 'polygon') {
      if (el.mapStyleVariant) return toTitleCase(el.mapStyleVariant);
      return 'Area';
    }
    if (el.type === 'polyline') {
      if (el.mapStyleVariant) return toTitleCase(el.mapStyleVariant);
      return 'Line';
    }
    if (el.type === 'arrow') return 'Arrow';
    if (el.type === 'note') return 'Text';
    return toTitleCase(el.type || 'Feature');
  }, []);

  const getLegendDisplayLabel = useCallback(
    (el) => {
      const defaultName = getElementDefaultName(el);
      const title = String(el?.label || '').trim();
      if (!title || title.toLowerCase() === defaultName.toLowerCase()) return defaultName;
      return `${defaultName} (${title})`;
    },
    [getElementDefaultName]
  );

  const tourRequested = useMemo(() => {
    if (location.pathname.startsWith('/tour/')) return true;
    return new URLSearchParams(location.search).get('tour') === '1';
  }, [location.pathname, location.search]);

  /** Listing-site iframe: same map as /view but panel starts collapsed for a map-first layout. */
  const embedRequested = useMemo(
    () => new URLSearchParams(location.search).get('embed') === '1',
    [location.search]
  );

  const clearTourPlayback = useCallback(() => {
    if (orbitFrameRef.current) {
      cancelAnimationFrame(orbitFrameRef.current);
      orbitFrameRef.current = null;
    }
    if (tourOrbitKickRef.current != null) {
      clearTimeout(tourOrbitKickRef.current);
      tourOrbitKickRef.current = null;
    }
  }, []);

  const tourBounds = useMemo(
    () => getBoundsFromPrintElements(printElements) || getBoundsFromViewport(savedViewport),
    [printElements, savedViewport]
  );

  const tourPhotoRanked = useMemo(
    () => rankPrintElementsWithPhotos(printElements).slice(0, 8),
    [printElements]
  );
  const tourStepCount = useMemo(() => getTourStepCount(printElements), [printElements]);

  /** Must match {@link applyPropertyTourSlide} — first nearby index (then one per amenity). */
  const vicinitySlideStartIndex = useMemo(() => {
    const n = rankPrintElementsWithPhotos(printElements).slice(0, 8).length;
    const photoBlockLen = n > 0 ? n : 0;
    return 3 + photoBlockLen;
  }, [printElements]);
  const nearbyAmenityOrder = useMemo(
    () => TOUR_NEARBY_AMENITY_ORDER.map((x) => x.key),
    []
  );
  const vicinitySlideEndIndex = useMemo(
    () => vicinitySlideStartIndex + nearbyAmenityOrder.length - 1,
    [vicinitySlideStartIndex, nearbyAmenityOrder]
  );

  const goTourSlide = useCallback(
    (next) => {
      if (tourNavLockRef.current) return;
      const max = Math.max(0, tourStepCount - 1);
      const clamped = Math.max(0, Math.min(max, next));
      setTourSlideIndex(clamped);
      tourNavLockRef.current = true;
      window.setTimeout(() => {
        tourNavLockRef.current = false;
      }, 900);
    },
    [setTourSlideIndex, tourStepCount]
  );

  useEffect(() => {
    setTourSlideIndex((i) => {
      const max = Math.max(0, tourStepCount - 1);
      return i > max ? max : i;
    });
  }, [tourStepCount]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setMapRevealReady(false);
      setError(null);
      try {
        const data = await mapService.getSharedMapByToken(shareToken);
        if (cancelled) return;
        pendingSharedDataRef.current = data;
        setMeta({
          title: data.title || 'Shared map',
          description: data.description || '',
          ...buildSharedMapAgentMeta(data),
        });
        setPrintElements(Array.isArray(data.printElements) ? data.printElements : []);

        const searchCenterForCache = getTourNearbySearchCenter(
          Array.isArray(data.printElements) ? data.printElements : [],
          getBoundsFromPrintElements(data.printElements),
          data.viewport || null
        );
        const hydratedNearby = hydrateNearbyContextByAmenity(
          data.tourNearbyCache,
          searchCenterForCache
        );
        if (hydratedNearby) {
          setNearbyContextByAmenity(hydratedNearby);
        }
        const savedBasemap = String(
          tourRequested ? TOUR_LOCKED_BASEMAP_ID : data.basemap || 'high-def-3inch'
        ).trim();
        setCurrentBasemapId(savedBasemap);
        if (typeof window.setBasemapLayerSyncBlocked === 'function') {
          window.setBasemapLayerSyncBlocked(true);
        }
        const savedLayerStatus = data.layers?.status || {};
        const tourLayerStatus = tourRequested
          ? { ...savedLayerStatus, ownership: false }
          : savedLayerStatus;
        setLayerStatus(tourLayerStatus);
        setLayerOrder(data.layers?.order || []);
        setPaperSize(data.printSettings?.paperSize || 'full');
        setIsPrinting(true);
        setActivePrintTool('select');
        setSelectedPrintElement(null);

        for (let i = 0; i < 80; i++) {
          if (mapRef?.current) break;
          await new Promise((r) => setTimeout(r, 50));
        }
        setSavedViewport(data.viewport || null);
        if (!cancelled && mapRef?.current) {
          const mapDataForLoad = tourRequested
            ? {
                ...data,
                layers: {
                  ...data.layers,
                  status: tourLayerStatus,
                },
              }
            : data;
          mapService.loadMapState(
            mapDataForLoad,
            { setLayerStatus, setLayerOrder, setPaperSize, setPrintElements, setCurrentBasemapId },
            mapRef
          );
        }

        if (!tourRequested && !cancelled) {
          const scheduleSharedBasemapApply = (attempt = 0) => {
            const mapboxMap = mapRef?.current;
            const apply =
              typeof window.applyBasemapById === 'function' ? window.applyBasemapById : null;
            if (!apply || !mapboxMap) {
              if (attempt < 80) window.setTimeout(() => scheduleSharedBasemapApply(attempt + 1), 50);
              return;
            }
            const run = () => apply(savedBasemap);
            if (mapboxMap.isStyleLoaded?.()) {
              run();
              return;
            }
            mapboxMap.once('idle', run);
          };
          scheduleSharedBasemapApply();
        }
      } catch (e) {
        if (!cancelled) {
          setError(e?.message || 'Could not load this map.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    shareToken,
    tourRequested,
    mapRef,
    setPrintElements,
    setLayerStatus,
    setLayerOrder,
    setPaperSize,
    setIsPrinting,
    setActivePrintTool,
    setSelectedPrintElement,
    setCurrentBasemapId,
  ]);

  useEffect(() => {
    if (loading || error) return;
    const data = pendingSharedDataRef.current;
    if (!data) return;
    let cancelled = false;
    const run = async () => {
      const map = await waitForMapRef(mapRef, tourRequested ? 25000 : 15000);
      if (cancelled) return;

      const savedBasemap = String(data.basemap || '').trim();
      const desiredBasemap = tourRequested ? TOUR_LOCKED_BASEMAP_ID : savedBasemap;
      if (desiredBasemap) {
        const params = new URLSearchParams(location.search);
        if (params.get('basemap') !== desiredBasemap) {
          params.set('basemap', desiredBasemap);
          window.history.replaceState(
            window.history.state,
            '',
            `${location.pathname}?${params.toString()}`
          );
        }
      }

      if (map) {
        if (tourRequested && typeof applyTourPropertyBasemapRef?.current === 'function') {
          await raceWithTimeout(
            Promise.resolve(applyTourPropertyBasemapRef.current()).catch(() => {
              /* keep tour running even if basemap warmup fails */
            }),
            8000
          );
        }

        // Recenter / fit after style + sources settle. Tour framing is handled by slide 0 (welcome)
        // after tourBasemapReady — avoid racing the async basemap or using the wrong maxZoom here.
        if (!tourRequested) {
          const boundsFromElements = getBoundsFromPrintElements(data.printElements || []);
          const bounds = boundsFromElements || getBoundsFromViewport(data.viewport);
          if (bounds && Array.isArray(bounds[0]) && Array.isArray(bounds[1])) {
            try {
              map.fitBounds(bounds, { padding: 56, duration: 0, maxZoom: 17 });
            } catch (_) {
              // fallback to saved viewport center if fit fails
            }
          } else if (data.viewport?.center) {
            mapService.loadMapState(data, { setLayerStatus, setLayerOrder, setPaperSize, setPrintElements }, mapRef);
          }
        }

        await waitForMapIdle(map, tourRequested ? 5000 : 9000);
      }

      if (cancelled) return;
      if (tourRequested) setTourBasemapReady(true);
      setMapRevealReady(true);
      if (!tourRequested && typeof window.setBasemapLayerSyncBlocked === 'function') {
        window.setBasemapLayerSyncBlocked(false);
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [
    loading,
    error,
    tourRequested,
    applyTourPropertyBasemapRef,
    mapRef,
    location.pathname,
    location.search,
    setLayerOrder,
    setLayerStatus,
    setPaperSize,
    setPrintElements,
  ]);

  /** Tour cold-open failsafe — never leave the loading overlay up indefinitely. */
  useEffect(() => {
    if (!tourRequested || loading || error || mapRevealReady) return undefined;
    const timer = window.setTimeout(() => {
      setTourBasemapReady(true);
      setMapRevealReady(true);
    }, 22000);
    return () => window.clearTimeout(timer);
  }, [tourRequested, loading, error, mapRevealReady]);

  useEffect(() => {
    document.documentElement.classList.add('shared-public-map');
    return () => document.documentElement.classList.remove('shared-public-map');
  }, []);

  // Embed (?embed=1): keep side panel collapsed by default (map-first in iframes).
  useEffect(() => {
    if (tourRequested) return;
    setPanelOpen(!embedRequested);
  }, [shareToken, embedRequested, tourRequested]);

  useEffect(() => {
    if (!embedRequested || tourRequested) return undefined;
    document.documentElement.classList.add('shared-embed-mode');
    return () => document.documentElement.classList.remove('shared-embed-mode');
  }, [embedRequested, tourRequested]);

  // After the map is ready, show map details on regular share links; embed stays collapsed.
  useEffect(() => {
    if (tourRequested || embedRequested || !mapRevealReady) return;
    setPanelOpen(true);
  }, [mapRevealReady, tourRequested, embedRequested]);

  // Auto-collapse once the user pans/zooms — ignore programmatic camera moves during initial load.
  useEffect(() => {
    if (tourRequested || embedRequested) return undefined;
    const collapseOnMapInteraction = () => {
      if (!mapRevealReady) return;
      setPanelOpen(false);
    };
    window.addEventListener('map-user-interaction', collapseOnMapInteraction);
    return () => window.removeEventListener('map-user-interaction', collapseOnMapInteraction);
  }, [tourRequested, embedRequested, mapRevealReady]);

  useEffect(() => {
    if (!tourRequested) return undefined;
    document.documentElement.classList.add('shared-tour-mode');
    return () => document.documentElement.classList.remove('shared-tour-mode');
  }, [tourRequested]);

  /** Tell Map.js which tour slide is active (boundary-only print overlay on orbit + nearby). */
  useEffect(() => {
    if (!tourRequested) {
      document.documentElement.removeAttribute(TOUR_ORBIT_PRINT_FILTER_ATTR);
      window.dispatchEvent(new CustomEvent('property-tour-slide', { detail: { slideId: null } }));
      return undefined;
    }
    let slideId = null;
    if (tourSlideIndex >= vicinitySlideStartIndex && tourSlideIndex <= vicinitySlideEndIndex) {
      slideId = 'vicinity';
    } else if (tourSlideIndex >= 3 && tourSlideIndex < vicinitySlideStartIndex) {
      // Photo block: indices 3..(3+n-1) — not PROPERTY_TOUR_SLIDES[tourSlideIndex] (index 4 is vicinity template).
      slideId = 'perspective';
    } else {
      slideId = PROPERTY_TOUR_SLIDES[tourSlideIndex]?.id ?? null;
    }
    const boundaryOnly = slideId === 'context' || slideId === 'vicinity';
    if (boundaryOnly) {
      document.documentElement.setAttribute(TOUR_ORBIT_PRINT_FILTER_ATTR, TOUR_ORBIT_PRINT_FILTER_VALUE);
    } else {
      document.documentElement.removeAttribute(TOUR_ORBIT_PRINT_FILTER_ATTR);
    }
    window.dispatchEvent(new CustomEvent('property-tour-slide', { detail: { slideId } }));
    return () => {
      document.documentElement.removeAttribute(TOUR_ORBIT_PRINT_FILTER_ATTR);
      window.dispatchEvent(new CustomEvent('property-tour-slide', { detail: { slideId: null } }));
    };
  }, [tourRequested, tourSlideIndex, vicinitySlideStartIndex, vicinitySlideEndIndex]);

  useEffect(() => {
    return () => {
      tourRunIdRef.current += 1;
      clearTourPlayback();
    };
  }, [clearTourPlayback]);

  useEffect(() => {
    tourBaselineCapturedRef.current = false;
    tourLayerBaselineRef.current = null;
    tourLayerOrderBaselineRef.current = null;
    tourStepTwoPrewarmedRef.current = false;
    setTourSlideIndex(0);
    setSavedViewport(null);
    setNearbyContextGeoJson(null);
    setNearbyContextByAmenity({});
    setNearbyFetchState('idle');
    setNearbyFetchError('');
    setNearbyFetchCount(0);
    setNearbyFetchNames([]);
    tourRunIdRef.current += 1;
    tourApplySeqRef.current = 0;
    clearTourPlayback();
    setTourBasemapReady(false);
    setMapRevealReady(false);
    setHoveredPlaceKey(null);
    nearbyPrefetchInFlightRef.current = null;
    tourNearbyCacheSaveRef.current = null;
  }, [shareToken, clearTourPlayback]);

  const nearbySearchCenter = useMemo(
    () => getTourNearbySearchCenter(printElements, tourBounds, savedViewport),
    [printElements, tourBounds, savedViewport]
  );

  const applyNearbyGeojsonResult = useCallback((amenityKey, geojson, options = {}) => {
    const cacheAmenity = options.cacheAmenity !== false;
    const features = Array.isArray(geojson?.features) ? geojson.features : [];
    const names = features
      .map((f) => String(f?.properties?.name || '').trim())
      .filter(Boolean);
    setNearbyContextGeoJson({ type: 'FeatureCollection', features });
    if (cacheAmenity) {
      setNearbyContextByAmenity((prev) => {
        const existing = prev?.[amenityKey];
        if (
          existing &&
          Array.isArray(existing.features) &&
          existing.features.length === features.length
        ) {
          return prev;
        }
        return {
          ...prev,
          [amenityKey]: {
            type: 'FeatureCollection',
            features,
            searchRadiusMeters: TOUR_NEARBY_SEARCH_RADIUS_METERS,
            dataVersion: TOUR_NEARBY_DATA_VERSION,
            fetched: true,
          },
        };
      });
    }
    setNearbyFetchCount(features.length);
    setNearbyFetchNames(names);
    setNearbyFetchError('');
    setNearbyFetchState('success');
  }, []);

  const isNearbyCacheFresh = useCallback((cached) => {
    if (!cached) return false;
    if (Number(cached.searchRadiusMeters) !== TOUR_NEARBY_SEARCH_RADIUS_METERS) return false;
    if (Number(cached.dataVersion) !== TOUR_NEARBY_DATA_VERSION) return false;
    return cached.fetched === true || (Array.isArray(cached.features) && cached.features.length > 0);
  }, []);

  /** Vicinity: one Nearby Search per amenity — prefetch all categories when entering this section. */
  useEffect(() => {
    if (!tourRequested || loading || error || !tourBasemapReady) return;
    if (tourSlideIndex < vicinitySlideStartIndex) return;
    if (!nearbySearchCenter) return;

    const centerKey = `${nearbySearchCenter.lat},${nearbySearchCenter.lng}`;
    const keysToFetch = nearbyAmenityOrder.filter((key) => !isNearbyCacheFresh(nearbyContextByAmenity?.[key]));
    if (!keysToFetch.length) {
      setNearbyFetchState((s) => (s === 'loading' ? 'success' : s));
      return;
    }
    if (nearbyPrefetchInFlightRef.current === centerKey) return;

    let cancelled = false;
    nearbyPrefetchInFlightRef.current = centerKey;
    const radiusMeters = TOUR_NEARBY_SEARCH_RADIUS_METERS;
    setNearbyFetchState('loading');
    setNearbyFetchError('');

    Promise.all(
      keysToFetch.map((amenityKey) =>
        mapService
          .getNearbyGooglePlaces({
            lat: nearbySearchCenter.lat,
            lng: nearbySearchCenter.lng,
            radiusMeters,
            amenityKey,
            shareToken,
          })
          .then((geojson) => ({ amenityKey, geojson, error: null }))
          .catch((err) => ({
            amenityKey,
            geojson: { type: 'FeatureCollection', features: [] },
            error: err,
          }))
      )
    )
      .then((results) => {
        if (cancelled) return;
        let firstError = '';
        setNearbyContextByAmenity((prev) => {
          const next = { ...prev };
          for (const { amenityKey, geojson, error } of results) {
            const features = Array.isArray(geojson?.features) ? geojson.features : [];
            next[amenityKey] = {
              type: 'FeatureCollection',
              features,
              searchRadiusMeters: TOUR_NEARBY_SEARCH_RADIUS_METERS,
              dataVersion: TOUR_NEARBY_DATA_VERSION,
              fetched: true,
            };
            if (!firstError && error) firstError = error?.message || String(error);
          }

          const payload = buildTourNearbyCacheForSave(nearbySearchCenter, next);
          const saveKey = payload
            ? `${shareToken}|${nearbySearchCenter.lat},${nearbySearchCenter.lng}|${TOUR_NEARBY_DATA_VERSION}`
            : '';
          if (payload && shareToken && tourNearbyCacheSaveRef.current !== saveKey) {
            tourNearbyCacheSaveRef.current = saveKey;
            mapService.saveTourNearbyCache(shareToken, payload).catch((saveErr) => {
              if (process.env.NODE_ENV === 'development') {
                console.warn('[SharedMapViewPage] saveTourNearbyCache failed.', saveErr);
              }
            });
          }

          return next;
        });
        setNearbyFetchError(firstError);
        setNearbyFetchState(firstError ? 'error' : 'success');
      })
      .finally(() => {
        if (!cancelled && nearbyPrefetchInFlightRef.current === centerKey) {
          nearbyPrefetchInFlightRef.current = null;
        }
      });

    return () => {
      cancelled = true;
      if (nearbyPrefetchInFlightRef.current === centerKey) {
        nearbyPrefetchInFlightRef.current = null;
      }
    };
  }, [
    tourRequested,
    loading,
    error,
    tourBasemapReady,
    nearbySearchCenter,
    tourSlideIndex,
    vicinitySlideStartIndex,
    nearbyAmenityOrder,
    nearbyContextByAmenity,
    isNearbyCacheFresh,
    shareToken,
  ]);

  /** Active vicinity slide reads from prefetch cache (no extra Google calls on slide change). */
  useEffect(() => {
    if (!tourRequested || loading || error) return;
    if (tourSlideIndex < vicinitySlideStartIndex || tourSlideIndex > vicinitySlideEndIndex) return;
    const amenityIdx = tourSlideIndex - vicinitySlideStartIndex;
    const amenityKey = nearbyAmenityOrder[amenityIdx];
    if (!amenityKey) return;

    const cached = nearbyContextByAmenity?.[amenityKey];
    if (isNearbyCacheFresh(cached)) {
      applyNearbyGeojsonResult(amenityKey, cached, { cacheAmenity: false });
      return;
    }

    if (nearbyFetchState === 'loading') return;
    setNearbyContextGeoJson({ type: 'FeatureCollection', features: [] });
    setNearbyFetchCount(0);
    setNearbyFetchNames([]);
  }, [
    tourRequested,
    loading,
    error,
    tourSlideIndex,
    vicinitySlideStartIndex,
    vicinitySlideEndIndex,
    nearbyAmenityOrder,
    nearbyContextByAmenity,
    nearbyFetchState,
    isNearbyCacheFresh,
    applyNearbyGeojsonResult,
  ]);

  /** Freeze layer toggles and layer order from the saved map once; each slide merges patches onto this baseline. */
  useEffect(() => {
    if (!tourRequested || loading || error) return;
    if (tourBaselineCapturedRef.current) return;
    tourBaselineCapturedRef.current = true;
    tourLayerBaselineRef.current = { ...(layerStatus || {}), ownership: false };
    tourLayerOrderBaselineRef.current = Array.isArray(layerOrder) ? [...layerOrder] : [];
  }, [tourRequested, loading, error, layerStatus, layerOrder]);

  /** Apply the map + layer state for the current tour slide. */
  useEffect(() => {
    if (!tourRequested || loading || error) return;
    if (!tourBasemapReady) return;
    if (!tourBaselineCapturedRef.current || !tourLayerBaselineRef.current) return;
    const map = mapRef?.current;
    if (!map) return;
    clearTourPlayback();
    tourApplySeqRef.current += 1;
    const tourApplySeq = tourApplySeqRef.current;
    void (async () => {
      try {
        await applyPropertyTourSlide(
          map,
          tourBounds,
          savedViewport,
          tourLayerBaselineRef.current,
          setLayerStatus,
          tourSlideIndex,
          {
            orbitRafRef: orbitFrameRef,
            orbitKickRef: tourOrbitKickRef,
            applyTourPropertyBasemapRef,
            tourApplySeq,
            tourApplySeqRef,
            layerOrderBaseline: tourLayerOrderBaselineRef.current || [],
            setLayerOrder,
            printElements,
            nearbyContextGeoJson,
            nearbyContextByAmenity,
            nearbyAmenityOrder,
          }
        );
      } catch (_) {
        /* ignore */
      }
    })();
  }, [
    tourRequested,
    tourBasemapReady,
    tourSlideIndex,
    loading,
    error,
    tourBounds,
    savedViewport,
    mapRef,
    setLayerStatus,
    setLayerOrder,
    printElements,
    nearbyContextGeoJson,
    nearbyContextByAmenity,
    nearbyAmenityOrder,
    clearTourPlayback,
  ]);

  /**
   * Prewarm Step 2 while Step 1 is visible:
   * - apply 3D high-def basemap early
   * - enable the Step 2 layer patch now so Step 1->2 is camera-only (no layer/style churn)
   */
  useEffect(() => {
    if (!tourRequested || loading || error) return;
    if (!tourBasemapReady) return;
    if (tourSlideIndex !== 0) return;
    if (!tourBaselineCapturedRef.current || !tourLayerBaselineRef.current) return;
    if (tourStepTwoPrewarmedRef.current) return;
    let cancelled = false;

    const stepTwo = PROPERTY_TOUR_SLIDES[1];
    if (!stepTwo || stepTwo.id !== 'context') {
      tourStepTwoPrewarmedRef.current = true;
      return;
    }

    tourStepTwoPrewarmedRef.current = true;
    const merged = {
      ...tourLayerBaselineRef.current,
      ...buildTourOrbitLayerPatch(tourLayerBaselineRef.current),
    };
    setLayerStatus(merged);
    if (Array.isArray(tourLayerOrderBaselineRef.current)) {
      const on = Object.keys(merged).filter((k) => merged[k]);
      const nextOrder = tourLayerOrderBaselineRef.current.filter((k) => on.includes(k));
      for (const k of on) {
        if (!nextOrder.includes(k)) nextOrder.push(k);
      }
      setLayerOrder(nextOrder);
    }

    const prewarmBasemap = applyTourPropertyBasemapRef?.current;
    if (typeof prewarmBasemap === 'function') {
      void Promise.resolve(prewarmBasemap())
        .catch(() => {
          /* ignore prewarm failures; slide transition still works */
        })
        .finally(() => {
          if (cancelled) return;
          // Prewarm can finish after Step 1 camera was applied; enforce Step 1 framing again.
          if (tourSlideIndex !== 0) return;
          const map = mapRef?.current;
          if (!map || !tourLayerBaselineRef.current) return;
          void (async () => {
            try {
              await applyPropertyTourSlide(
                map,
                tourBounds,
                savedViewport,
                tourLayerBaselineRef.current,
                setLayerStatus,
                0,
                {
                  orbitRafRef: orbitFrameRef,
                  orbitKickRef: tourOrbitKickRef,
                  layerOrderBaseline: tourLayerOrderBaselineRef.current || [],
                  setLayerOrder,
                }
              );
            } catch (_) {
              /* ignore */
            }
          })();
        });
    }
    return () => {
      cancelled = true;
    };
  }, [
    tourRequested,
    tourBasemapReady,
    tourSlideIndex,
    loading,
    error,
    mapRef,
    tourBounds,
    savedViewport,
    setLayerStatus,
    setLayerOrder,
    applyTourPropertyBasemapRef,
  ]);

  useEffect(() => {
    if (!tourRequested || loading || error) return undefined;
    const onKeyDown = (e) => {
      if (e.defaultPrevented) return;
      const tag = (e.target && e.target.tagName) || '';
      if (tag === 'INPUT' || tag === 'TEXTAREA' || e.target?.isContentEditable) return;
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        goTourSlide(tourSlideIndex - 1);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        goTourSlide(tourSlideIndex + 1);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [tourRequested, loading, error, tourSlideIndex, goTourSlide]);

  const mapElementLegendRows = useMemo(() => {
    const list = (printElements || []).filter((el) => el && !el.hiddenOnMap);
    const seen = new Set();
    return list
      .map((el) => {
        const key = `${el.type}:${el.svgKey || ''}:${el.label || ''}`;
        if (seen.has(key)) return null;
        seen.add(key);
        return { key, label: getLegendDisplayLabel(el), element: el };
      })
      .filter(Boolean)
      .slice(0, 40);
  }, [printElements, getLegendDisplayLabel]);

  const photoGalleryRows = useMemo(() => {
    const rows = [];
    (printElements || []).forEach((el) => {
      if (!el || el.hiddenOnMap) return;
      const photos = getPhotoSrcListFromElement(el);
      if (!photos.length) return;
      const label = (el.label && String(el.label).trim()) || el.type || 'Photo point';
      photos.forEach((src, idx) => {
        rows.push({
          key: `${el.id}-${idx}`,
          elementId: el.id,
          src,
          label,
          photoIndex: idx + 1,
          photoCount: photos.length,
        });
      });
    });
    return rows;
  }, [printElements]);

  const activeLayerRows = useMemo(() => {
    const knownLayerKeys = Object.keys(layerNameMappings || {});
    const existingLayerKeys = Object.keys(layerStatus || {});
    const layerKeys = Array.from(new Set([...knownLayerKeys, ...existingLayerKeys]));
    return layerKeys
      .sort((a, b) => (layerNameMappings[a] || a).localeCompare(layerNameMappings[b] || b))
      .map((layerKey) => ({
        layerKey,
        label: layerNameMappings[layerKey] || layerKey,
        enabled: !!layerStatus?.[layerKey],
        legendItems: legends[layerKey] || [],
      }));
  }, [layerStatus]);

  const hasAnyLayerLegend = activeLayerRows.some(
    (row) => row.enabled && row.legendItems.some((item) => item?.label || item?.color)
  );

  const openFeaturePhotoFromGallery = useCallback(
    (row) => {
      const map = mapRef?.current;
      const element = (printElements || []).find((el) => el?.id === row?.elementId);
      if (!map || !element) return;
      const g = element.geometry;
      if (g?.type === 'Point' && Array.isArray(g.coordinates) && g.coordinates.length >= 2) {
        map.easeTo({
          center: [g.coordinates[0], g.coordinates[1]],
          zoom: Math.max(map.getZoom?.() || 0, 16),
          duration: 550,
        });
      } else if (g?.type === 'Polygon' && Array.isArray(g.coordinates?.[0]) && g.coordinates[0].length >= 3) {
        try {
          const ring = g.coordinates[0];
          let minLng = Infinity;
          let maxLng = -Infinity;
          let minLat = Infinity;
          let maxLat = -Infinity;
          ring.forEach(([lng, lat]) => {
            if (Number.isFinite(lng) && Number.isFinite(lat)) {
              minLng = Math.min(minLng, lng);
              maxLng = Math.max(maxLng, lng);
              minLat = Math.min(minLat, lat);
              maxLat = Math.max(maxLat, lat);
            }
          });
          if (Number.isFinite(minLng) && Number.isFinite(maxLng) && Number.isFinite(minLat) && Number.isFinite(maxLat)) {
            map.fitBounds(
              [
                [minLng, minLat],
                [maxLng, maxLat],
              ],
              { padding: 90, duration: 550, maxZoom: 17 }
            );
          }
        } catch (_) {
          // no-op
        }
      }

      window.dispatchEvent(
        new CustomEvent('shared-photo-open', {
          detail: {
            elementId: row.elementId,
            index: Math.max(0, Number(row.photoIndex || 1) - 1),
          },
        })
      );
    },
    [mapRef, printElements]
  );

  const tourDeckMeta = useMemo(() => {
    const i = tourSlideIndex;
    if (i >= vicinitySlideStartIndex && i <= vicinitySlideEndIndex) {
      const amenityIdx = i - vicinitySlideStartIndex;
      const amenityKey = nearbyAmenityOrder[amenityIdx];
      const amenityMeta = TOUR_NEARBY_AMENITY_ORDER.find((x) => x.key === amenityKey);
      const icon = amenityMeta?.icon ? `${amenityMeta.icon} ` : '';
      return {
        title: `${icon}${amenityMeta?.label || 'Nearby'}`.trim(),
        subtitle:
          'Top nearby places by rating and reviews. Hover a row to emphasize its marker; click the row or Zoom to to focus.',
      };
    }
    if (i < 3) {
      const s = PROPERTY_TOUR_SLIDES[i] || PROPERTY_TOUR_SLIDES[0];
      return { title: s.title, subtitle: s.subtitle };
    }
    if (tourPhotoRanked.length > 0) {
      const el = tourPhotoRanked[i - 3]?.element;
      const label =
        (el?.label && String(el.label).trim()) ||
        (el?.type === 'polygon' ? 'Area' : el?.type === 'shape' ? 'Point' : 'Place');
      return {
        title: label,
        subtitle:
          "Bird's-eye map focus and photo. You can pan and zoom the map anytime — use the tour arrows to move between locations.",
      };
    }
    const s = PROPERTY_TOUR_SLIDES[3];
    return { title: s.title, subtitle: s.subtitle };
  }, [tourSlideIndex, tourPhotoRanked, vicinitySlideStartIndex, vicinitySlideEndIndex, nearbyAmenityOrder]);

  const tourAtFirst = tourSlideIndex <= 0;
  const tourAtLast = tourSlideIndex >= tourStepCount - 1;
  const tourInVicinityStep =
    tourSlideIndex >= vicinitySlideStartIndex && tourSlideIndex <= vicinitySlideEndIndex;
  const activeAmenityMeta = useMemo(() => {
    if (!tourInVicinityStep) return null;
    const amenityKey = nearbyAmenityOrder[tourSlideIndex - vicinitySlideStartIndex];
    return TOUR_NEARBY_AMENITY_ORDER.find((x) => x.key === amenityKey) || null;
  }, [tourInVicinityStep, nearbyAmenityOrder, tourSlideIndex, vicinitySlideStartIndex]);
  const activeAmenityFeatures = useMemo(() => {
    if (!tourInVicinityStep || !activeAmenityMeta?.key) return [];
    const fc = nearbyContextByAmenity?.[activeAmenityMeta.key];
    return Array.isArray(fc?.features) ? fc.features : [];
  }, [tourInVicinityStep, activeAmenityMeta, nearbyContextByAmenity]);
  const activeAmenityFeaturedPhoto = useMemo(() => {
    for (const f of activeAmenityFeatures) {
      const url = String(f?.properties?.photoUrl || '').trim();
      if (url) return url;
    }
    return '';
  }, [activeAmenityFeatures]);
  const activeAmenityFeaturedPhotoAlt = useMemo(() => {
    for (const f of activeAmenityFeatures) {
      const url = String(f?.properties?.photoUrl || '').trim();
      if (!url) continue;
      const name = String(f?.properties?.name || '').trim();
      return name ? `${name} — Google photo` : 'Top nearby place';
    }
    return '';
  }, [activeAmenityFeatures]);

  /** Listing footprint for map zoom; falls back to viewport buffer when polygons are absent. */
  const listingBoundsForNearbyZoom = useMemo(
    () => tourBounds || getBoundsFromViewport(savedViewport),
    [tourBounds, savedViewport]
  );

  const focusNearbyPlaceOnMap = useCallback(
    (feature, opts = {}) => {
      const map = mapRef?.current;
      if (!map || feature?.geometry?.type !== 'Point') return;
      const clickedLng = Number(feature.geometry.coordinates?.[0]);
      const clickedLat = Number(feature.geometry.coordinates?.[1]);
      if (!Number.isFinite(clickedLng) || !Number.isFinite(clickedLat)) return;

      const amenityOnly = opts.tight === true;
      const duration = Number(opts.animationDuration) >= 0 ? Number(opts.animationDuration) : amenityOnly ? 700 : 900;

      const runFit = () => {
        const padLeft = measureTourNearbyPanelLeftPaddingPx();
        const padding = { top: 88, bottom: 168, left: padLeft, right: 64 };

        if (amenityOnly) {
          const edge = 0.00065;
          const boundsPair = [
            [clickedLng - edge, clickedLat - edge],
            [clickedLng + edge, clickedLat + edge],
          ];
          const maxZoom = 18.1;
          const fallbackZoom = 17.35;
          try {
            const cam = map.cameraForBounds(boundsPair, {
              padding,
              maxZoom,
              bearing: 0,
              pitch: 0,
            });
            const zoom =
              cam?.zoom && Number.isFinite(cam.zoom)
                ? Math.min(maxZoom, Math.max(16.9, cam.zoom))
                : fallbackZoom;
            const c = cam?.center;
            const centerLng =
              c && typeof c === 'object' && 'lng' in c
                ? Number(c.lng)
                : Array.isArray(c)
                  ? Number(c[0])
                  : clickedLng;
            const centerLat =
              c && typeof c === 'object' && 'lat' in c
                ? Number(c.lat)
                : Array.isArray(c)
                  ? Number(c[1])
                  : clickedLat;
            const center =
              Number.isFinite(centerLng) && Number.isFinite(centerLat)
                ? [centerLng, centerLat]
                : [clickedLng, clickedLat];
            map.easeTo({
              center,
              zoom,
              pitch: 0,
              bearing: 0,
              duration,
              essential: true,
            });
          } catch (_) {
            map.easeTo({
              center: [clickedLng, clickedLat],
              zoom: fallbackZoom,
              pitch: 0,
              bearing: 0,
              duration,
              essential: true,
            });
          }
          window.dispatchEvent(new CustomEvent('map-user-interaction'));
          return;
        }

        let minLng = Infinity;
        let maxLng = -Infinity;
        let minLat = Infinity;
        let maxLat = -Infinity;
        const grow = (lo, la) => {
          if (!Number.isFinite(lo) || !Number.isFinite(la)) return;
          minLng = Math.min(minLng, lo);
          maxLng = Math.max(maxLng, lo);
          minLat = Math.min(minLat, la);
          maxLat = Math.max(maxLat, la);
        };

        const lb = listingBoundsForNearbyZoom;
        if (lb) {
          const w = Number(lb[0]?.[0]);
          const s = Number(lb[0]?.[1]);
          const e = Number(lb[1]?.[0]);
          const n = Number(lb[1]?.[1]);
          if ([w, s, e, n].every(Number.isFinite)) {
            grow(w, s);
            grow(e, s);
            grow(e, n);
            grow(w, n);
          }
        }
        grow(clickedLng, clickedLat);

        const fallback = 0.005;
        if (![minLng, maxLng, minLat, maxLat].every(Number.isFinite)) {
          grow(clickedLng - fallback, clickedLat - fallback);
          grow(clickedLng + fallback, clickedLat + fallback);
        }

        const spanLng = maxLng - minLng;
        const spanLat = maxLat - minLat;
        const bufLng = Math.max(spanLng * 0.08, 0.0012);
        const bufLat = Math.max(spanLat * 0.08, 0.0012);
        const boundsPair = [
          [minLng - bufLng, minLat - bufLat],
          [maxLng + bufLng, maxLat + bufLat],
        ];

        const maxTargetZoom = 17.2;
        try {
          const cam = map.cameraForBounds(boundsPair, {
            padding,
            maxZoom: maxTargetZoom,
            bearing: 0,
            pitch: 0,
          });
          if (cam?.center && Number.isFinite(cam.zoom)) {
            map.easeTo({
              center: cam.center,
              zoom: Math.min(maxTargetZoom, Math.max(14.8, cam.zoom)),
              pitch: 0,
              bearing: 0,
              duration,
              essential: true,
            });
          } else {
            map.fitBounds(boundsPair, {
              padding,
              duration,
              maxZoom: maxTargetZoom,
              pitch: 0,
              bearing: 0,
              essential: true,
            });
          }
        } catch (_) {
          let z = 0;
          try {
            z = map.getZoom?.() || 0;
          } catch (_) {
            z = 0;
          }
          map.easeTo({
            center: [clickedLng, clickedLat],
            zoom: Math.max(z, 14.5),
            pitch: 0,
            bearing: 0,
            duration: Math.min(duration, 650),
          });
        }
        window.dispatchEvent(new CustomEvent('map-user-interaction'));
      };

      requestAnimationFrame(() => {
        requestAnimationFrame(runFit);
      });
    },
    [mapRef, listingBoundsForNearbyZoom]
  );

  const activeAmenityStats = useMemo(() => {
    const total = activeAmenityFeatures.length;
    let within10 = 0;
    for (const f of activeAmenityFeatures) {
      const mins = Number(f?.properties?.driveMinutesEst);
      if (Number.isFinite(mins) && mins <= 10) within10 += 1;
    }
    return { total, within10 };
  }, [activeAmenityFeatures]);

  useEffect(() => {
    setHoveredPlaceKey(null);
  }, [tourSlideIndex]);

  useEffect(() => {
    const map = mapRef?.current;
    if (!map) return;
    if (!tourInVicinityStep) {
      setTourVicinityNearbyHoverHighlight(map, null, null);
      return;
    }
    setTourVicinityNearbyHoverHighlight(map, hoveredPlaceKey || null, activeAmenityFeatures);
  }, [tourInVicinityStep, hoveredPlaceKey, activeAmenityFeatures, mapRef]);

  return (
    <>
      {!mapRevealReady && !error ? (
        <div className="shared-map-loading-blocker" role="status" aria-live="polite" aria-busy="true">
          <div className="shared-map-loading-card">
            <img
              src="/logo_transparent_no_background.png"
              alt="Community View"
              className="shared-map-loading-logo"
            />
            <div className="shared-map-loading-title">Loading shared map</div>
            <div className="shared-map-loading-subtitle">
              Preparing layers, basemap, and map elements...
            </div>
          </div>
        </div>
      ) : null}
      {tourRequested ? (
        <div className="shared-tour-shell" aria-live="polite">
          <header className="shared-tour-shell-topbar">
            <div className="shared-tour-shell-brand">
              <span className="shared-tour-shell-badge">Property tour</span>
              <span className="shared-tour-shell-title" title={meta?.title || ''}>
                {meta?.title || (loading ? 'Loading…' : 'Guided tour')}
              </span>
            </div>
            <nav className="shared-tour-shell-actions" aria-label="Tour actions">
              <span className="shared-tour-shell-counter" aria-hidden>
                Map state {tourSlideIndex + 1} of {tourStepCount}
              </span>
              <span className="shared-tour-shell-keyhint">← → keys</span>
              <Link className="shared-tour-shell-exit" to={`/view/${shareToken}`}>
                Exit to map
              </Link>
            </nav>
          </header>
          <aside className="shared-tour-orbit-listing-card" aria-label="Listing contact">
            <div className="shared-tour-orbit-agent-card">
              <SharedAgentCard meta={meta} description={meta?.description} />
            </div>
          </aside>
          <button
            type="button"
            className="shared-tour-arrow shared-tour-arrow--prev"
            aria-label="Previous map view"
            disabled={loading || !!error || tourAtFirst}
            onClick={() => goTourSlide(tourSlideIndex - 1)}
          >
            ‹
          </button>
          <button
            type="button"
            className="shared-tour-arrow shared-tour-arrow--next"
            aria-label="Next map view"
            disabled={loading || !!error || tourAtLast}
            onClick={() => goTourSlide(tourSlideIndex + 1)}
          >
            ›
          </button>
          <div
            className="shared-tour-deck"
            role="region"
            aria-roledescription="slide"
            aria-label={`${tourDeckMeta.title}. ${tourDeckMeta.subtitle}`}
          >
            <p className="shared-tour-deck-kicker">
              Map state {tourSlideIndex + 1} of {tourStepCount}
            </p>
            <h2 className="shared-tour-deck-title">{tourDeckMeta.title}</h2>
            <p className="shared-tour-deck-subtitle">{tourDeckMeta.subtitle}</p>
            <div className="shared-tour-deck-dots" role="tablist" aria-label="Tour map states">
              {Array.from({ length: tourStepCount }, (_, stepIdx) => {
                let dotLabel = `Map state ${stepIdx + 1}`;
                if (stepIdx >= vicinitySlideStartIndex && stepIdx <= vicinitySlideEndIndex) {
                  const amenityIdx = stepIdx - vicinitySlideStartIndex;
                  const amenityKey = nearbyAmenityOrder[amenityIdx];
                  const amenityMeta = TOUR_NEARBY_AMENITY_ORDER.find((x) => x.key === amenityKey);
                  dotLabel = `${amenityMeta?.label || 'Nearby'}, state ${stepIdx + 1}`;
                } else if (stepIdx < 3) {
                  dotLabel = `${PROPERTY_TOUR_SLIDES[stepIdx]?.title || 'Slide'}, state ${stepIdx + 1}`;
                } else if (tourPhotoRanked.length > 0) {
                  const el = tourPhotoRanked[stepIdx - 3]?.element;
                  const lbl =
                    (el?.label && String(el.label).trim()) ||
                    (el?.type === 'polygon' ? 'Area' : el?.type === 'shape' ? 'Point' : 'Place');
                  dotLabel = `${lbl}, state ${stepIdx + 1}`;
                } else {
                  const ak = nearbyAmenityOrder[0];
                  const am = TOUR_NEARBY_AMENITY_ORDER.find((x) => x.key === ak);
                  dotLabel = `${am?.label || PROPERTY_TOUR_SLIDES[3]?.title || 'Slide'}, state ${stepIdx + 1}`;
                }
                return (
                  <button
                    key={`tour-step-${stepIdx}`}
                    type="button"
                    role="tab"
                    aria-selected={stepIdx === tourSlideIndex}
                    aria-label={dotLabel}
                    className={`shared-tour-deck-dot${stepIdx === tourSlideIndex ? ' is-active' : ''}`}
                    disabled={loading || !!error}
                    onClick={() => goTourSlide(stepIdx)}
                  />
                );
              })}
            </div>
          </div>
          {tourInVicinityStep ? (
            <aside className="shared-tour-nearby-card cv-tour-nearby-panel" aria-live="polite">
              <div className="shared-tour-nearby-card-inner">
                <header className="shared-tour-nearby-card-header">
                  <h3 className="shared-tour-nearby-card-title">
                    {activeAmenityMeta?.icon ? (
                      <span className="shared-tour-nearby-card-heading-icon" aria-hidden>
                        {activeAmenityMeta.icon}{' '}
                      </span>
                    ) : null}
                    {activeAmenityMeta?.label || 'Nearby'}
                  </h3>
                  <p className="shared-tour-nearby-card-sub">Top nearby by rating &amp; reviews</p>
                </header>
                {nearbyFetchState === 'loading' ? (
                  <p className="shared-tour-nearby-card-lead">Loading results…</p>
                ) : nearbyFetchState === 'error' ? (
                  <p className="shared-tour-nearby-card-error shared-tour-nearby-card-lead">
                    {nearbyFetchError || 'Request failed.'}
                  </p>
                ) : (
                  <p className="shared-tour-nearby-card-lead">
                    {meta?.title || 'This property'} has {activeAmenityStats.total}{' '}
                    {activeAmenityMeta?.label?.toLowerCase() || 'places'} in this category
                    {activeAmenityStats.within10 > 0
                      ? ` (${activeAmenityStats.within10} within about 10 minutes).`
                      : '.'}{' '}
                    Hover a row to swell its marker on the map; click the row or Zoom to to focus there.
                  </p>
                )}
                <div className="shared-tour-nearby-card-media">
                  {activeAmenityFeaturedPhoto ? (
                    <img
                      src={activeAmenityFeaturedPhoto}
                      alt={activeAmenityFeaturedPhotoAlt}
                      className="shared-tour-nearby-card-photo"
                      loading="lazy"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <div className="shared-tour-nearby-card-media-placeholder" aria-hidden>
                      {activeAmenityMeta?.icon ? (
                        <span className="shared-tour-nearby-card-media-icon">{activeAmenityMeta.icon}</span>
                      ) : null}
                      <span>No thumbnail for the first results</span>
                    </div>
                  )}
                </div>
                {activeAmenityFeatures.length > 0 ? (
                  <ul
                    className="shared-tour-nearby-card-list"
                    onMouseLeave={() => setHoveredPlaceKey(null)}
                  >
                    {activeAmenityFeatures.map((f, i) => {
                      const p = f?.properties || {};
                      const name = String(p.name || '').trim() || `Place ${i + 1}`;
                      const hKey = getNearbyPlaceHoverKey(f);
                      const ratingNum = Number(p.rating);
                      const rating =
                        Number.isFinite(ratingNum) && ratingNum > 0
                          ? `${ratingNum.toFixed(1)}★`
                          : '';
                      const minsEst = Number(p.driveMinutesEst);
                      const timeTxt = Number.isFinite(minsEst) ? `~${minsEst} min` : '';
                      const dist = String(p.distanceText || '').trim();
                      const distanceLine = [dist, timeTxt].filter(Boolean).join(' · ');
                      return (
                        <li
                          key={hKey || `${name}-${i}`}
                          onMouseEnter={() => setHoveredPlaceKey(hKey)}
                          onClick={() => {
                            setHoveredPlaceKey(hKey);
                            focusNearbyPlaceOnMap(f, { tight: true });
                          }}
                        >
                          <div className="shared-tour-nearby-card-row">
                            <div className="shared-tour-nearby-card-row-text">
                              <span className="shared-tour-nearby-card-name">{name}</span>
                              {rating ? (
                                <span className="shared-tour-nearby-card-rating">{rating}</span>
                              ) : null}
                              {distanceLine ? (
                                <span className="shared-tour-nearby-card-distance">{distanceLine}</span>
                              ) : null}
                            </div>
                            <button
                              type="button"
                              className="shared-tour-nearby-map-btn"
                              title="Zoom to this place on the map"
                              onClick={(e) => {
                                e.stopPropagation();
                                setHoveredPlaceKey(hKey);
                                focusNearbyPlaceOnMap(f, { tight: true });
                              }}
                            >
                              Zoom to
                            </button>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                ) : nearbyFetchNames.length > 0 ? (
                  <ul className="shared-tour-nearby-card-list">
                    {nearbyFetchNames.map((name, i) => (
                      <li key={`${name}-${i}`}>
                        <div className="shared-tour-nearby-card-row">
                          <span className="shared-tour-nearby-card-name">{name}</span>
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            </aside>
          ) : null}
        </div>
      ) : (
    <div className="shared-map-chrome shared-map-chrome--panel" aria-live="polite">
      <aside className="shared-left-dock">
        <div className="shared-left-nav" role="tablist" aria-label="Shared map navigation">
          <div className="shared-left-nav-brand">
            <div className="shared-left-nav-brand-title">{meta?.title || (loading ? 'Loading map' : 'Shared map')}</div>
          </div>
          <button
            type="button"
            className={`shared-left-nav-item ${activeTab === 'info' ? 'is-active' : ''}`}
            onClick={() => {
              setActiveTab('info');
              setPanelOpen(true);
            }}
          >
            Map Information
          </button>
          <button
            type="button"
            className={`shared-left-nav-item ${activeTab === 'legend' ? 'is-active' : ''}`}
            onClick={() => {
              setActiveTab('legend');
              setPanelOpen(true);
            }}
          >
            Map Legend
          </button>
          <button
            type="button"
            className={`shared-left-nav-item ${activeTab === 'gallery' ? 'is-active' : ''}`}
            onClick={() => {
              setActiveTab('gallery');
              setPanelOpen(true);
            }}
          >
            Photo Gallery
          </button>
          <button
            type="button"
            className={`shared-left-nav-item ${activeTab === 'layers' ? 'is-active' : ''}`}
            onClick={() => {
              setActiveTab('layers');
              setPanelOpen(true);
            }}
          >
            Layers
          </button>
          <button
            type="button"
            className={`shared-left-nav-item ${activeTab === 'tutorial' ? 'is-active' : ''}`}
            onClick={() => {
              setActiveTab('tutorial');
              setPanelOpen(true);
            }}
          >
            View Tutorial
          </button>
          <button
            type="button"
            className={`shared-left-nav-item ${activeTab === 'tour' ? 'is-active' : ''}`}
            onClick={() => {
              setActiveTab('tour');
              setPanelOpen(true);
            }}
          >
            Property Tour
          </button>
          <button
            type="button"
            className="shared-left-nav-collapse"
            onClick={() => setPanelOpen((v) => !v)}
          >
            {panelOpen ? 'Hide Panel' : 'Show Panel'}
          </button>
        </div>
        <div className={`shared-left-panel ${panelOpen ? 'is-open' : 'is-closed'}`}>
          {activeTab === 'info' && (
            <section className="shared-side-section">
              <h2 className="shared-side-heading">{meta?.title || (loading ? 'Loading…' : 'Shared map')}</h2>
              <SharedAgentCard meta={meta} description={meta?.description} />
            </section>
          )}

          {activeTab === 'legend' && (
            <section className="shared-side-section">
              <h2 className="shared-side-heading">Legend</h2>
              <div className="shared-side-subheading">Map elements</div>
              {mapElementLegendRows.length === 0 ? (
                <p className="shared-side-empty">No map elements are visible.</p>
              ) : (
                <ul className="shared-side-legend-list">
                  {mapElementLegendRows.map((row) => {
                    const element = row.element;
                    const iconRenderer =
                      element?.type === 'shape' && element.svgKey ? svgMap[element.svgKey] : null;
                    return (
                      <li key={row.key} className="shared-side-legend-item">
                        <span className="shared-side-legend-icon">
                          {iconRenderer ? (
                            iconRenderer({
                              fill: element.fill ?? '#ffffff',
                              stroke: element.stroke ?? '#111827',
                              strokeWidth: element.strokeWidth ?? 2,
                              fillOpacity: element.fillOpacity ?? 1,
                              strokeOpacity: element.strokeOpacity ?? 1,
                              logoColor: element.logoColor,
                              iconOpacity: element.iconOpacity,
                              iconScale: element.iconScale,
                            })
                          ) : element?.type === 'polygon' ? (
                            <span
                              className="shared-side-swatch"
                              style={{
                                background: element.fill || '#10b981',
                                borderColor: element.stroke || '#0f5132',
                              }}
                            />
                          ) : (
                            <span
                              className="shared-side-line"
                              style={{
                                background:
                                  element.lineDasharray && element.lineDasharray !== 'none'
                                    ? 'transparent'
                                    : element.stroke || '#2563eb',
                                borderTop:
                                  element.lineDasharray && element.lineDasharray !== 'none'
                                    ? `3px dashed ${element.stroke || '#2563eb'}`
                                    : 'none',
                              }}
                            />
                          )}
                        </span>
                        <span>{row.label}</span>
                      </li>
                    );
                  })}
                </ul>
              )}

              <div className="shared-side-subheading">Layer symbology</div>
              {!hasAnyLayerLegend ? (
                <p className="shared-side-empty">No active layer legend items.</p>
              ) : (
                activeLayerRows
                  .filter((row) => row.enabled && row.legendItems.some((item) => item?.label || item?.color))
                  .map((row) => (
                    <div key={row.layerKey} className="shared-side-layer-legend-group">
                      <div className="shared-side-layer-legend-title">{row.label}</div>
                      <ul className="shared-side-layer-legend-list">
                        {row.legendItems
                          .filter((item) => item?.label || item?.color)
                          .map((item, idx) => (
                            <li key={`${row.layerKey}-${idx}`} className="shared-side-layer-legend-item">
                              <span
                                className="shared-side-layer-color"
                                style={{ background: item.color || '#94a3b8', opacity: item.opacity ?? 1 }}
                              />
                              <span>{item.label || 'Feature'}</span>
                            </li>
                          ))}
                      </ul>
                    </div>
                  ))
              )}
            </section>
          )}

          {activeTab === 'gallery' && (
            <section className="shared-side-section">
              <h2 className="shared-side-heading">Photo Gallery</h2>
              <p className="shared-side-description">
                All photos attached to visible photo points.
              </p>
              {photoGalleryRows.length === 0 ? (
                <p className="shared-side-empty">No photo points are currently visible.</p>
              ) : (
                <div className="shared-side-photo-grid">
                  {photoGalleryRows.map((row) => (
                    <button
                      key={`gallery-${row.key}`}
                      type="button"
                      className="shared-side-photo-card"
                      onClick={() => openFeaturePhotoFromGallery(row)}
                    >
                      <img src={row.src} alt={`${row.label} ${row.photoIndex}`} className="shared-side-photo-thumb" />
                      <span className="shared-side-photo-caption">
                        <span className="shared-side-photo-label">{row.label}</span>
                        <span className="shared-side-photo-meta">
                          {row.photoIndex} / {row.photoCount}
                        </span>
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </section>
          )}

          {activeTab === 'layers' && (
            <section className="shared-side-section">
              <h2 className="shared-side-heading">Layers</h2>
              <p className="shared-side-description">Turn map layers on and off.</p>
              <div className="shared-side-layer-toggle-list">
                {activeLayerRows.map((row) => (
                  <label key={row.layerKey} className="shared-side-layer-toggle">
                    <input
                      type="checkbox"
                      checked={row.enabled}
                      onChange={(e) =>
                        setLayerStatus((prev) => ({
                          ...(prev || {}),
                          [row.layerKey]: e.target.checked,
                        }))
                      }
                    />
                    <span>{row.label}</span>
                  </label>
                ))}
              </div>
            </section>
          )}

          {activeTab === 'tutorial' && (
            <section className="shared-side-section">
              <h2 className="shared-side-heading">Tutorial</h2>
              <p className="shared-side-description">
                Pan and zoom the map, toggle layers in the Layers tab, and click photo points to open image popups.
              </p>
              <ol className="shared-side-tutorial-list">
                <li>Use two-finger pinch or mouse wheel to zoom.</li>
                <li>Use the Layers tab to show/hide datasets.</li>
                <li>Click a photo point marker to view photos.</li>
              </ol>
            </section>
          )}

          {activeTab === 'tour' && (
            <section className="shared-side-section">
              <h2 className="shared-side-heading">Property Tour</h2>
              <p className="shared-side-description">
                The tour link opens a focused view where each slide is a different map state (camera and layers).
                In that view, use the ‹ › controls on the sides of the map or the ← → keys to change slides.
              </p>
              <p className="shared-side-empty">
                Open the tour URL from Share map — it uses <code>{'/tour/<token>'}</code>, not the regular client map
                at <code>{'/view/<token>'}</code>.
              </p>
            </section>
          )}
        </div>
      </aside>
        </div>
      )}

      {error ? (
        <div className="shared-map-chrome-error" role="alert">
          {error}
        </div>
      ) : null}

    </>
  );
}
