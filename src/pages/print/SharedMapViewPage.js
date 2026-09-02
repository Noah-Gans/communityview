import React, { useMemo, useEffect, useLayoutEffect, useState, useCallback, useRef } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import MapLoadingOverlay from '../../components/loading/MapLoadingOverlay';
import { useMapContext } from '../MapContext';
import { mapService } from '../../services/mapService';
import { svgMap } from '../../components/map/printShapes/svgMap';
import { legends } from '../../assets/legends';
import { layerNameMappings } from '../../components/map/layerMappings';
import { getPointIconCatalogLabel } from './printCatalog';
import { getBoundsFromPrintElements, getBoundsFromViewport } from '../../utils/sharedMapTourBounds';
import {
  applyPropertyTourSlide,
  applyTourMobileMapPadding,
  setMapPaddingIfChanged,
  applyTourVicinityNearbyGeoJson,
  fitTourVicinityCamera,
  clearPropertyTourOrbitSchedule,
  deactivateTourVicinityLayerStackGuard,
  ensureTourVicinityNearbyLayersOnTop,
  getNearbyPlaceHoverKey,
  getTourNearbySearchCenter,
  installTourVicinityLayerMaintainer,
  loadTourVicinityPrintLogoImages,
  PROPERTY_TOUR_SLIDES,
  rankPrintElementsWithPhotos,
  scheduleTourVicinityLayersOnTop,
  resolveTourVicinityFitPadding,
  resolveTourVicinityCameraPaddingOptions,
  setTourVicinityNearbyHoverHighlight,
  TOUR_NEARBY_AMENITY_ORDER,
  TOUR_ORBIT_PRINT_FILTER_ATTR,
  TOUR_ORBIT_PRINT_FILTER_VALUE,
  TOUR_VICINITY_ACTIVE_SLIDE_ATTR,
  TOUR_VICINITY_ACTIVE_SLIDE_VALUE,
} from '../../utils/propertyTourSlides';
import { TOUR_NEARBY_DATA_VERSION } from '../../utils/tourNearbyRanking';
import {
  buildTourNearbyCacheForSave,
} from '../../utils/tourNearbyFirestore';
import { amenityFeatureKey } from '../../utils/amenityMapCatalog';
import {
  amenityKeysWithSavedFeatures,
  getEnabledTourAmenityOrder,
  getAmenitySearchRadiusMeters,
  materializeTourSettingsSlidePlan,
  nearbyContextByAmenityForDisplay,
  normalizeTourSettings,
  resolveTourSettingsFromMap,
  hydrateTourBuilderAmenityState,
  mapHasCuratedTourData,
  mergePlaceVisibilityFromPrior,
  visibleTourNearbyFeatures,
} from '../../utils/tourSettings';
import {
  getSlidePrintElementIds,
  pickSlidePrintElements,
  resolveTourPrintFilterForSlide,
  toggleSlidePrintElement,
} from '../../utils/tourSlidePrintElements';
import {
  amenitySlideId,
  enabledAmenityKeysFromPlan,
  getActiveAmenityKeyFromPlan,
  getSlideMetaForPlanId,
  isLockedTourSlideIndex,
  isPlanIndexExpandedAgent,
  isPlanIndexVicinity,
  normalizeTourSlidePlan,
  parseSlideId,
  photoSlideId,
  reorderSlidePlan,
  resolveLegacyStepForSlideContent,
} from '../../utils/tourSlidePlan';
import {
  buildSharedMapAgentMeta,
  formatAgentWebsiteHref,
  formatAgentWebsiteLabel,
} from '../../utils/sharedMapAgentMeta';
import { getPhotoSrcListFromElement } from '../../utils/mapPhotoStorage';
import { waitForMapIdle, waitForMapRef } from '../../utils/waitForMapIdle';
import { autoGeneratePropertyTour } from '../../utils/tourAutoGenerate';
import { isShareCreateInFlight, runShareCreateOnce } from '../../utils/amenityMapAutoGenerate';
import {
  waitUntilTourBasemapReady,
  waitUntilTourImagery3DActive,
} from '../map/mapBasemapUtils';
import { TourEditSidePanel, TourEditSlideFooter } from './TourEditPanels';
import {
  fitTourEditRadiusForAmenitySlide,
  hideTourEditRadiusCircle,
  showTourEditRadiusCircle,
  updateTourEditRadiusGeometry,
} from '../../utils/tourBuilderMapLayers';
import './Print.css';

const TOUR_BASEMAP_QUERY = 'imagery-3d';

async function waitForTourBasemapApply(applyTourPropertyBasemapRef, maxMs = 15000) {
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    if (typeof applyTourPropertyBasemapRef?.current === 'function') {
      return applyTourPropertyBasemapRef.current;
    }
    if (typeof window.applyBasemapById === 'function') {
      return () =>
        new Promise((resolve) => {
          window.applyBasemapById('imagery-3d', resolve);
        });
    }
    await new Promise((r) => window.setTimeout(r, 50));
  }
  return null;
}

function sleepMs(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function stripSearchParam(name) {
  try {
    const params = new URLSearchParams(window.location.search);
    if (!params.has(name)) return;
    params.delete(name);
    const qs = params.toString();
    window.history.replaceState(
      window.history.state,
      '',
      qs ? `${window.location.pathname}?${qs}` : window.location.pathname
    );
  } catch (_) {
    /* ignore */
  }
}

async function raceWithTimeout(promise, timeoutMs) {
  let timer = null;
  try {
    return await Promise.race([
      promise,
      new Promise((resolve) => {
        timer = window.setTimeout(() => resolve('timeout'), timeoutMs);
      }),
    ]);
  } finally {
    if (timer != null) window.clearTimeout(timer);
  }
}

const SharedAgentCard = ({ meta, description }) => {
  const hasContact = meta?.agentEmail || meta?.agentPhone || meta?.agentWebsite;
  const websiteHref = formatAgentWebsiteHref(meta?.agentWebsite);
  const websiteLabel = formatAgentWebsiteLabel(meta?.agentWebsite);
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
          {meta?.agentTitle || meta?.agentBrokerage ? (
            <div className="shared-side-agent-subtitle">
              {[meta.agentTitle, meta.agentBrokerage].filter(Boolean).join(' · ')}
            </div>
          ) : null}
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
          {websiteHref ? (
            <a
              href={websiteHref}
              className="shared-side-agent-link"
              target="_blank"
              rel="noopener noreferrer"
            >
              {websiteLabel || websiteHref}
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

const COMMUNITY_VIEW_HOME = '/';

const COMMUNITY_VIEW_LOGO_SRC = '/logo.png';

/** Brand mark on shared client map + property tour — opens Community View home in a new tab. */
const CommunityViewLogoLink = ({ className = '', imageClassName = '' }) => (
  <a
    href={COMMUNITY_VIEW_HOME}
    target="_blank"
    rel="noopener noreferrer"
    className={['shared-cv-logo-link', className].filter(Boolean).join(' ')}
    aria-label="Community View home (opens in new tab)"
  >
    <img
      src={COMMUNITY_VIEW_LOGO_SRC}
      alt="Community View"
      className={['shared-cv-logo', imageClassName].filter(Boolean).join(' ')}
    />
  </a>
);

/** Session flag — "Click here to continue" on the tour next arrow. */
const TOUR_CONTINUE_HINT_SESSION_KEY = 'cv-tour-continue-hint-dismissed';
function TourMobileAgentCard({ meta, expanded = false }) {
  const hasContact = meta?.agentEmail || meta?.agentPhone || meta?.agentWebsite;
  const websiteHref = formatAgentWebsiteHref(meta?.agentWebsite);
  const websiteLabel = formatAgentWebsiteLabel(meta?.agentWebsite);
  const mapTitle = String(meta?.title || '').trim();
  const description = String(meta?.description || '').trim();
  const phaseClass = expanded
    ? 'shared-tour-mobile-agent-card--expanded'
    : 'shared-tour-mobile-agent-card--compact';

  return (
    <div className={`shared-tour-mobile-agent-card ${phaseClass}`}>
      {expanded && mapTitle ? (
        <div className="shared-tour-mobile-agent-map-title">{mapTitle}</div>
      ) : null}
      {expanded && description ? (
        <p className="shared-tour-mobile-agent-description">{description}</p>
      ) : null}
      <div className="shared-tour-mobile-agent-card-row">
        {meta?.agentPhoto ? (
          <img className="shared-tour-mobile-agent-photo" src={meta.agentPhoto} alt="" />
        ) : (
          <div className="shared-tour-mobile-agent-photo shared-tour-mobile-agent-photo--placeholder" aria-hidden />
        )}
        <div className="shared-tour-mobile-agent-details">
          <div className="shared-tour-mobile-agent-name">{meta?.agentName || 'Listing agent'}</div>
          {meta?.agentTitle || meta?.agentBrokerage ? (
            <div className="shared-tour-mobile-agent-subtitle">
              {[meta.agentTitle, meta.agentBrokerage].filter(Boolean).join(' · ')}
            </div>
          ) : null}
          <div className="shared-tour-mobile-agent-contact">
            {meta?.agentPhone ? (
              <a href={`tel:${meta.agentPhone}`} className="shared-tour-mobile-agent-link">
                {meta.agentPhone}
              </a>
            ) : null}
            {meta?.agentEmail ? (
              <a href={`mailto:${meta.agentEmail}`} className="shared-tour-mobile-agent-link">
                {meta.agentEmail}
              </a>
            ) : null}
            {websiteHref ? (
              <a
                href={websiteHref}
                className="shared-tour-mobile-agent-link"
                target="_blank"
                rel="noopener noreferrer"
              >
                {websiteLabel || websiteHref}
              </a>
            ) : null}
            {!hasContact ? (
              <span className="shared-tour-mobile-agent-muted">Contact details not provided.</span>
            ) : null}
          </div>
        </div>
      </div>
      {expanded && meta?.agentLogo ? (
        <img className="shared-tour-mobile-agent-logo" src={meta.agentLogo} alt="Firm logo" />
      ) : null}
    </div>
  );
}

/** Tour chrome: agent photo + contact only (no listing description or firm logo). */
const TourAgentContact = ({ meta }) => {
  const hasContact = meta?.agentEmail || meta?.agentPhone || meta?.agentWebsite;
  const websiteHref = formatAgentWebsiteHref(meta?.agentWebsite);
  const websiteLabel = formatAgentWebsiteLabel(meta?.agentWebsite);

  return (
    <div className="shared-tour-agent-contact">
      <div className="shared-tour-agent-contact-row">
        {meta?.agentPhoto ? (
          <img className="shared-tour-agent-contact-photo" src={meta.agentPhoto} alt="" />
        ) : null}
        <div className="shared-tour-agent-contact-details">
          <div className="shared-tour-agent-contact-name">{meta?.agentName || 'Listing agent'}</div>
          {meta?.agentTitle || meta?.agentBrokerage ? (
            <div className="shared-tour-agent-contact-subtitle">
              {[meta.agentTitle, meta.agentBrokerage].filter(Boolean).join(' · ')}
            </div>
          ) : null}
          {meta?.agentEmail ? (
            <a href={`mailto:${meta.agentEmail}`} className="shared-tour-agent-contact-link">
              {meta.agentEmail}
            </a>
          ) : null}
          {meta?.agentPhone ? (
            <a href={`tel:${meta.agentPhone}`} className="shared-tour-agent-contact-link">
              {meta.agentPhone}
            </a>
          ) : null}
          {websiteHref ? (
            <a
              href={websiteHref}
              className="shared-tour-agent-contact-link"
              target="_blank"
              rel="noopener noreferrer"
            >
              {websiteLabel || websiteHref}
            </a>
          ) : null}
          {!hasContact ? (
            <div className="shared-tour-agent-contact-muted">Contact details not provided.</div>
          ) : null}
        </div>
      </div>
    </div>
  );
};

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
  const [mapDocId, setMapDocId] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [mapRevealReady, setMapRevealReady] = useState(false);
  const [tourBootGenerate] = useState(
    () => new URLSearchParams(window.location.search).get('generate') === '1'
  );
  /** Tour only: basemap + idle finished so slide 0 camera can run without racing style load. */
  const [tourBasemapReady, setTourBasemapReady] = useState(false);
  const [activeTab, setActiveTab] = useState('info');
  const [panelOpen, setPanelOpen] = useState(() => {
    const embed = new URLSearchParams(window.location.search).get('embed') === '1';
    if (embed) return false;
    if (typeof window !== 'undefined' && window.innerWidth <= 768) return false;
    return true;
  });
  const [savedViewport, setSavedViewport] = useState(null);
  const tourSettingsRef = useRef(null);
  const slidePlanRef = useRef([]);
  const slidePlanSaveTimerRef = useRef(null);
  const slidePlanUserEditedRef = useRef(false);
  const tourEditLockSavedRef = useRef(false);
  const nearbyContextByAmenityRef = useRef({});
  const tourCuratedRef = useRef(false);
  const [nearbyContextGeoJson, setNearbyContextGeoJson] = useState(null);
  const [nearbyContextByAmenity, setNearbyContextByAmenity] = useState({});
  nearbyContextByAmenityRef.current = nearbyContextByAmenity;
  const [tourSettings, setTourSettings] = useState(() => normalizeTourSettings(null));
  tourSettingsRef.current = tourSettings;
  /** Authoritative slide order for tour playback + edit save (not re-derived every render). */
  const [slidePlan, setSlidePlan] = useState([]);
  const [nearbyFetchState, setNearbyFetchState] = useState('idle');
  const [nearbyFetchError, setNearbyFetchError] = useState('');
  const [nearbyFetchCount, setNearbyFetchCount] = useState(0);
  const [nearbyFetchNames, setNearbyFetchNames] = useState([]);
  const nearbyFetchStateRef = useRef('idle');
  nearbyFetchStateRef.current = nearbyFetchState;
  const [tourSlideIndex, setTourSlideIndex] = useState(0);
  const [hoveredPlaceKey, setHoveredPlaceKey] = useState(null);
  const [mobileAmenityPeekMinimized, setMobileAmenityPeekMinimized] = useState(false);
  const [editSaveState, setEditSaveState] = useState('idle');
  const [editSaveError, setEditSaveError] = useState('');
  const [isMobileViewport, setIsMobileViewport] = useState(
    () => typeof window !== 'undefined' && window.innerWidth <= 768
  );
  const [showTourContinueHint, setShowTourContinueHint] = useState(() => {
    try {
      return sessionStorage.getItem(TOUR_CONTINUE_HINT_SESSION_KEY) !== '1';
    } catch (_) {
      return true;
    }
  });
  const tourLayerBaselineRef = useRef(null);
  const tourLayerOrderBaselineRef = useRef(null);
  const tourBaselineCapturedRef = useRef(false);
  const tourStepTwoPrewarmedRef = useRef(false);
  const tourNavLockRef = useRef(false);
  const orbitFrameRef = useRef(null);
  /** Timeout before starting orbit on slide 2 (must clear with camera cancels). */
  const tourOrbitKickRef = useRef(null);
  const tourSlideIndexRef = useRef(0);
  const previousTourSlideIndexRef = useRef(0);
  const tourRunIdRef = useRef(0);
  /** Monotonic id so deferred context-slide camera work does not run after the user has advanced. */
  const tourApplySeqRef = useRef(0);
  const pendingSharedDataRef = useRef(null);
  /** Prevents duplicate all-amenity prefetch batches for the same search center. */
  const nearbyPrefetchInFlightRef = useRef(null);
  const tourNearbyCacheSaveRef = useRef(null);
  const vicinityFitSlideRef = useRef(-1);
  const tourFooterTabsRef = useRef(null);
  const tourFooterTabRefs = useRef([]);
  const tourFooterTabsDidInitialCenterRef = useRef(false);
  const vicinityFitFeatureCountRef = useRef(0);
  const editAmenityZoomedSlideRef = useRef(-1);
  const tourWelcomeRevealedRef = useRef(false);
  const tourMapLoadSeqRef = useRef(0);

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

  const tourEditMode = useMemo(
    () => tourRequested && new URLSearchParams(location.search).get('edit') === '1',
    [tourRequested, location.search]
  );

  const tourPreviewUrl = useMemo(() => {
    if (!shareToken) return '';
    const params = new URLSearchParams(location.search);
    params.delete('edit');
    const qs = params.toString();
    return `/tour/${shareToken}${qs ? `?${qs}` : ''}`;
  }, [shareToken, location.search]);

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
    const map = mapRef?.current;
    if (map) {
      clearPropertyTourOrbitSchedule(map, tourOrbitKickRef, orbitFrameRef);
    }
  }, [mapRef]);

  const tourBounds = useMemo(
    () => getBoundsFromPrintElements(printElements) || getBoundsFromViewport(savedViewport),
    [printElements, savedViewport]
  );

  const tourPhotoRanked = useMemo(
    () => rankPrintElementsWithPhotos(printElements).slice(0, 8),
    [printElements]
  );
  const nearbyAmenityOrder = useMemo(() => getEnabledTourAmenityOrder(tourSettings), [tourSettings]);
  const tourSearchRadiusMeters = useMemo(
    () => normalizeTourSettings(tourSettings).searchRadiusMeters,
    [tourSettings]
  );
  const currentSlidePlanId = slidePlan[tourSlideIndex] || null;
  const currentSlideParsed = useMemo(
    () => parseSlideId(currentSlidePlanId),
    [currentSlidePlanId]
  );
  const tourIntroEditSlide = tourEditMode && currentSlideParsed?.kind === 'intro';
  const introSlideVisibleElementIds = useMemo(
    () => getSlidePrintElementIds(tourSettings, currentSlidePlanId, printElements),
    [tourSettings, currentSlidePlanId, printElements]
  );
  const displayNearbyContextByAmenity = useMemo(
    () => nearbyContextByAmenityForDisplay(nearbyContextByAmenity),
    [nearbyContextByAmenity]
  );
  const tourNearbyPlaybackRef = useRef({
    nearbyContextByAmenity: {},
    nearbyContextGeoJson: null,
    nearbyAmenityOrder: [],
  });
  const nearbySearchCenterRef = useRef(null);
  const tourStepCount = slidePlan.length;

  const firstAmenityPlanIndex = useMemo(
    () => slidePlan.findIndex((id) => parseSlideId(id)?.kind === 'amenity'),
    [slidePlan]
  );
  const tourInVicinityStep = isPlanIndexVicinity(slidePlan, tourSlideIndex);
  const tourEditSidePanelMode = tourIntroEditSlide
    ? 'intro'
    : tourInVicinityStep
      ? 'amenity'
      : null;
  const tourAgentExpandedLayout = isPlanIndexExpandedAgent(slidePlan, tourSlideIndex);
  const activeAmenityKey = useMemo(
    () => getActiveAmenityKeyFromPlan(slidePlan, tourSlideIndex),
    [slidePlan, tourSlideIndex]
  );
  const activeAmenityRadiusMeters = useMemo(
    () => getAmenitySearchRadiusMeters(tourSettings, activeAmenityKey),
    [tourSettings, activeAmenityKey]
  );

  const goTourSlide = useCallback(
    (next) => {
      if (!mapRevealReady) return;
      if (tourNavLockRef.current) return;
      const max = Math.max(0, tourStepCount - 1);
      const clamped = Math.max(0, Math.min(max, next));
      setTourSlideIndex(clamped);
      tourNavLockRef.current = true;
      window.setTimeout(() => {
        tourNavLockRef.current = false;
      }, 900);
    },
    [mapRevealReady, setTourSlideIndex, tourStepCount]
  );

  const dismissTourContinueHint = useCallback(() => {
    setShowTourContinueHint(false);
    try {
      sessionStorage.setItem(TOUR_CONTINUE_HINT_SESSION_KEY, '1');
    } catch (_) {
      /* ignore */
    }
  }, []);

  const goTourNextSlide = useCallback(() => {
    dismissTourContinueHint();
    goTourSlide(tourSlideIndex + 1);
  }, [dismissTourContinueHint, goTourSlide, tourSlideIndex]);

  useEffect(() => {
    previousTourSlideIndexRef.current = tourSlideIndexRef.current;
    tourSlideIndexRef.current = tourSlideIndex;
  }, [tourSlideIndex]);

  useEffect(() => {
    setTourSlideIndex((i) => {
      const max = Math.max(0, tourStepCount - 1);
      return i > max ? max : i;
    });
  }, [tourStepCount]);

  useEffect(() => {
    tourMapLoadSeqRef.current += 1;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setMapRevealReady(false);
      setError(null);
      try {
        const wantGenerate =
          tourRequested && new URLSearchParams(window.location.search).get('generate') === '1';
        const createKey = shareToken ? `tour:${shareToken}` : '';
        let data;
        if (wantGenerate || isShareCreateInFlight(createKey)) {
          let lastErr;
          for (let attempt = 0; attempt < 8; attempt += 1) {
            try {
              data = await mapService.getSharedMapByToken(shareToken);
              lastErr = null;
              break;
            } catch (err) {
              lastErr = err;
              await sleepMs(350 + attempt * 200);
              if (cancelled) return;
            }
          }
          if (lastErr) throw lastErr;
          const result = await runShareCreateOnce(createKey, () =>
            autoGeneratePropertyTour({ shareToken, mapData: data })
          );
          if (cancelled) return;
          data = {
            ...data,
            tourNearbyCache: result.tourNearbyCache || data.tourNearbyCache,
            tourSettings: result.tourSettings || data.tourSettings,
            tourSlidePlan: result.tourSlidePlan || data.tourSlidePlan,
          };
          stripSearchParam('generate');
        } else {
          data = await mapService.getSharedMapByToken(shareToken);
        }
        if (cancelled) return;
        pendingSharedDataRef.current = data;
        setMapDocId(data.id || null);
        setMeta({
          title: data.title || 'Shared map',
          description: data.description || '',
          ...buildSharedMapAgentMeta(data),
        });
        setPrintElements(Array.isArray(data.printElements) ? data.printElements : []);
        const printEls = Array.isArray(data.printElements) ? data.printElements : [];
        const loadedTourSettings = materializeTourSettingsSlidePlan(
          resolveTourSettingsFromMap({
            tourSettings: data.tourSettings,
            tourNearbyCache: data.tourNearbyCache,
            tourSlidePlan: data.tourSlidePlan,
          }),
          printEls,
          { availableAmenityKeys: amenityKeysWithSavedFeatures(data.tourNearbyCache) }
        );
        setTourSettings(loadedTourSettings);
        tourSettingsRef.current = loadedTourSettings;
        const loadedPlan = Array.isArray(loadedTourSettings.slidePlan)
          ? [...loadedTourSettings.slidePlan]
          : [];
        slidePlanRef.current = loadedPlan;
        setSlidePlan(loadedPlan);
        slidePlanUserEditedRef.current = loadedTourSettings.slidePlanUserEdited === true;
        tourCuratedRef.current = mapHasCuratedTourData(data);

        const { nearbyContextByAmenity: hydratedNearby } = hydrateTourBuilderAmenityState(
          data.tourNearbyCache,
          loadedTourSettings
        );
        if (hydratedNearby && Object.keys(hydratedNearby).length) {
          setNearbyContextByAmenity(hydratedNearby);
        }
        const savedBasemap = String(
          tourRequested ? TOUR_LOCKED_BASEMAP_ID : data.basemap || 'satellite-streets-v12'
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

        const mapWaitMs = tourRequested ? 24 : 60;
        for (let i = 0; i < mapWaitMs; i++) {
          if (mapRef?.current) break;
          await new Promise((r) => setTimeout(r, 50));
        }
        setSavedViewport(data.viewport || null);
        if (!cancelled && mapRef?.current) {
          const mapDataForLoad = tourRequested
            ? {
                ...data,
                basemap: TOUR_LOCKED_BASEMAP_ID,
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
  }, [shareToken, tourRequested]);

  useEffect(() => {
    if (loading || error) return;
    const data = pendingSharedDataRef.current;
    if (!data) return;
    const loadSeq = tourMapLoadSeqRef.current;
    let cancelled = false;
    const run = async () => {
      const map = await waitForMapRef(mapRef, tourRequested ? 25000 : 15000);
      if (cancelled || loadSeq !== tourMapLoadSeqRef.current) return;

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
        if (tourRequested) {
          const applyTourBasemap = await waitForTourBasemapApply(applyTourPropertyBasemapRef);
          if (cancelled || loadSeq !== tourMapLoadSeqRef.current) return;
          if (applyTourBasemap) {
            await applyTourBasemap().catch(() => {
              /* soft-degrade below if 3D never sticks */
            });
          }
          if (cancelled || loadSeq !== tourMapLoadSeqRef.current) return;
          // Imagery-ready is enough to unlock slide work; keep a short parallel soften for 3D.
          await waitUntilTourBasemapReady(map, { timeoutMs: 6000, pollMs: 100 });
          if (cancelled || loadSeq !== tourMapLoadSeqRef.current) return;
          await Promise.all([
            waitUntilTourImagery3DActive(map, { timeoutMs: 1800, pollMs: 120 }),
            waitForMapIdle(map, 500),
          ]);
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
              /* fallback to saved viewport center if fit fails */
            }
          } else if (data.viewport?.center) {
            mapService.loadMapState(
              data,
              { setLayerStatus, setLayerOrder, setPaperSize, setPrintElements, setCurrentBasemapId },
              mapRef
            );
          }
          if (cancelled || loadSeq !== tourMapLoadSeqRef.current) return;
          await waitForMapIdle(map, 9000);
        }
      }

      if (cancelled || loadSeq !== tourMapLoadSeqRef.current) return;
      if (typeof window.setBasemapLayerSyncBlocked === 'function') {
        window.setBasemapLayerSyncBlocked(false);
      }
      if (tourRequested) {
        // Reveal only after welcome + nearby + badge prime (separate effect).
        setTourBasemapReady(true);
      } else {
        setMapRevealReady(true);
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [loading, error, tourRequested, mapRef, applyTourPropertyBasemapRef, location.pathname, location.search]);

  /** Tour cold-open failsafe — never leave the loading overlay up indefinitely. */
  useEffect(() => {
    if (!tourRequested || loading || error || mapRevealReady) return undefined;
    const timer = window.setTimeout(() => {
      setTourBasemapReady(true);
      setMapRevealReady(true);
    }, 12000);
    return () => window.clearTimeout(timer);
  }, [tourRequested, loading, error, mapRevealReady]);

  useEffect(() => {
    document.documentElement.classList.add('shared-public-map');
    return () => document.documentElement.classList.remove('shared-public-map');
  }, []);

  // Embed (?embed=1) or mobile: collapsed panel. Desktop: open by default.
  useEffect(() => {
    if (tourRequested) return;
    setPanelOpen(!embedRequested && !isMobileViewport);
  }, [shareToken, embedRequested, tourRequested, isMobileViewport]);

  useEffect(() => {
    if (!embedRequested || tourRequested) return undefined;
    document.documentElement.classList.add('shared-embed-mode');
    return () => document.documentElement.classList.remove('shared-embed-mode');
  }, [embedRequested, tourRequested]);

  useEffect(() => {
    const onResize = () => setIsMobileViewport(window.innerWidth <= 768);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // Desktop client map: open info panel once the map is ready.
  useEffect(() => {
    if (tourRequested || embedRequested || !mapRevealReady || isMobileViewport) return;
    setPanelOpen(true);
  }, [mapRevealReady, tourRequested, embedRequested, isMobileViewport]);

  // Client map: collapse expanded panel on pan/zoom (mobile footer + desktop dock).
  useEffect(() => {
    if (tourRequested || embedRequested) return undefined;
    const onMapInteraction = () => {
      if (!mapRevealReady) return;
      setPanelOpen(false);
    };
    window.addEventListener('map-user-interaction', onMapInteraction);
    return () => window.removeEventListener('map-user-interaction', onMapInteraction);
  }, [tourRequested, embedRequested, mapRevealReady]);

  useEffect(() => {
    setMobileAmenityPeekMinimized(false);
  }, [tourSlideIndex, activeAmenityKey, tourInVicinityStep]);

  /** Mobile amenity stage: collapse peek panel when the user pans or zooms the map. */
  useEffect(() => {
    if (!tourRequested || tourEditMode || !tourInVicinityStep || !isMobileViewport) return undefined;
    const map = mapRef?.current;
    if (!map || !tourBasemapReady) return undefined;

    const onUserMapGesture = (e) => {
      if (!e?.originalEvent) return;
      setMobileAmenityPeekMinimized(true);
      applyTourMobileMapPadding(map, {
        expandedLayout: tourAgentExpandedLayout,
        vicinityPeek: true,
        vicinityPeekMinimized: true,
      });
    };

    map.on('dragstart', onUserMapGesture);
    map.on('zoomstart', onUserMapGesture);
    map.on('rotatestart', onUserMapGesture);
    map.on('pitchstart', onUserMapGesture);

    return () => {
      map.off('dragstart', onUserMapGesture);
      map.off('zoomstart', onUserMapGesture);
      map.off('rotatestart', onUserMapGesture);
      map.off('pitchstart', onUserMapGesture);
    };
  }, [
    tourRequested,
    tourEditMode,
    tourInVicinityStep,
    isMobileViewport,
    mapRef,
    tourBasemapReady,
    tourAgentExpandedLayout,
  ]);

  useEffect(() => {
    if (!tourRequested) return undefined;
    document.documentElement.classList.add('shared-tour-mode');
    return () => document.documentElement.classList.remove('shared-tour-mode');
  }, [tourRequested]);

  useEffect(() => {
    if (!tourEditMode) return undefined;
    document.documentElement.classList.add('shared-tour-edit-mode');
    return () => document.documentElement.classList.remove('shared-tour-edit-mode');
  }, [tourEditMode]);

  /** Reserve map canvas space above the full-width edit footer (desktop). */
  useEffect(() => {
    if (!tourEditMode || isMobileViewport) return undefined;
    const map = mapRef?.current;
    if (!map || !tourBasemapReady) return undefined;
    const applyPadding = () => {
      const footerH =
        parseFloat(
          getComputedStyle(document.documentElement).getPropertyValue('--shared-tour-edit-footer-h')
        ) || 164;
      setMapPaddingIfChanged(map, { top: 0, bottom: footerH, left: 0, right: 0 });
    };
    applyPadding();
    window.addEventListener('resize', applyPadding);
    return () => {
      window.removeEventListener('resize', applyPadding);
      try {
        map.setPadding({ top: 0, bottom: 0, left: 0, right: 0 });
      } catch {
        /* ignore */
      }
    };
  }, [tourEditMode, isMobileViewport, tourBasemapReady, mapRef]);

  /** Tell Map.js which tour slide is active and how to filter print overlays. */
  useEffect(() => {
    if (!tourRequested) {
      document.documentElement.removeAttribute(TOUR_ORBIT_PRINT_FILTER_ATTR);
      document.documentElement.removeAttribute(TOUR_VICINITY_ACTIVE_SLIDE_ATTR);
      window.dispatchEvent(
        new CustomEvent('property-tour-slide', {
          detail: { slideId: null, printFilterMode: 'all', printElementIds: null },
        })
      );
      return undefined;
    }
    let slideId = null;
    const currentPlanId = slidePlan[tourSlideIndex];
    const parsed = parseSlideId(currentPlanId);
    if (parsed?.kind === 'amenity') {
      slideId = 'vicinity';
    } else if (parsed?.kind === 'photo') {
      slideId = 'perspective';
    } else if (parsed?.kind === 'intro') {
      slideId = parsed.introId;
    }
    const printFilter = resolveTourPrintFilterForSlide(
      slideId,
      tourSettings,
      currentPlanId,
      printElements
    );
    if (printFilter.mode === 'boundary-only') {
      document.documentElement.setAttribute(TOUR_ORBIT_PRINT_FILTER_ATTR, TOUR_ORBIT_PRINT_FILTER_VALUE);
    } else {
      document.documentElement.removeAttribute(TOUR_ORBIT_PRINT_FILTER_ATTR);
    }
    if (slideId === 'vicinity') {
      document.documentElement.setAttribute(TOUR_VICINITY_ACTIVE_SLIDE_ATTR, TOUR_VICINITY_ACTIVE_SLIDE_VALUE);
    } else {
      document.documentElement.removeAttribute(TOUR_VICINITY_ACTIVE_SLIDE_ATTR);
    }
    window.dispatchEvent(
      new CustomEvent('property-tour-slide', {
        detail: {
          slideId,
          printFilterMode: printFilter.mode,
          printElementIds: printFilter.elementIds,
        },
      })
    );
    return () => {
      document.documentElement.removeAttribute(TOUR_ORBIT_PRINT_FILTER_ATTR);
    };
  }, [tourRequested, tourSlideIndex, slidePlan, tourSettings, printElements]);

  useEffect(() => {
    return () => {
      tourRunIdRef.current += 1;
      clearTourPlayback();
    };
  }, [clearTourPlayback]);

  useEffect(() => {
    tourMapLoadSeqRef.current += 1;
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
    tourCuratedRef.current = false;
    slidePlanUserEditedRef.current = false;
    tourEditLockSavedRef.current = false;
    if (slidePlanSaveTimerRef.current) {
      clearTimeout(slidePlanSaveTimerRef.current);
      slidePlanSaveTimerRef.current = null;
    }
    tourWelcomeRevealedRef.current = false;
    vicinityFitSlideRef.current = '';
    vicinityFitFeatureCountRef.current = 0;
  }, [shareToken, clearTourPlayback]);

  const nearbySearchCenter = useMemo(
    () => getTourNearbySearchCenter(printElements, tourBounds, savedViewport),
    [printElements, tourBounds, savedViewport]
  );
  nearbySearchCenterRef.current = nearbySearchCenter;
  tourNearbyPlaybackRef.current = {
    nearbyContextByAmenity: displayNearbyContextByAmenity,
    nearbyContextGeoJson,
    nearbyAmenityOrder,
  };

  const applyNearbyGeojsonResult = useCallback((amenityKey, geojson, options = {}) => {
    const cacheAmenity = options.cacheAmenity !== false;
    const features = Array.isArray(geojson?.features) ? geojson.features : [];
    const visible = visibleTourNearbyFeatures(features);
    const names = visible
      .map((f) => String(f?.properties?.name || '').trim())
      .filter(Boolean);
    setNearbyContextGeoJson({ type: 'FeatureCollection', features: visible });
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
            searchRadiusMeters: getAmenitySearchRadiusMeters(tourSettingsRef.current, amenityKey),
            dataVersion: TOUR_NEARBY_DATA_VERSION,
            fetched: true,
          },
        };
      });
    }
    setNearbyFetchCount(visible.length);
    setNearbyFetchNames(names);
    setNearbyFetchError('');
    setNearbyFetchState('success');
  }, []);

  const isNearbyCacheFresh = useCallback((cached) => {
    if (!cached) return false;
    return Array.isArray(cached.features) && cached.features.length > 0;
  }, []);

  /**
   * Keep the share-tour loading overlay up until welcome framing, amenity cache,
   * and marker badge images are primed — then reveal as soon as those finish.
   */
  useEffect(() => {
    if (!tourRequested || tourEditMode || loading || error || !tourBasemapReady || mapRevealReady) {
      return undefined;
    }
    let cancelled = false;
    const loadSeq = tourMapLoadSeqRef.current;

    const waitForWelcomeFrame = async () => {
      const deadline = Date.now() + 2500;
      while (!cancelled && Date.now() < deadline) {
        if (tourWelcomeRevealedRef.current) return true;
        await sleepMs(40);
      }
      return tourWelcomeRevealedRef.current;
    };

    const waitForNearbyPrime = async () => {
      // Prefer hydrated/cached amenities, but don't hold the overlay for cold Places.
      const deadline = Date.now() + 2500;
      while (!cancelled && Date.now() < deadline) {
        if (!nearbySearchCenterRef.current) return true;
        const order = nearbyAmenityOrder;
        if (!order.length) return true;
        const byAmenity = nearbyContextByAmenityRef.current || {};
        const allFresh = order.every((key) => isNearbyCacheFresh(byAmenity?.[key], key));
        if (allFresh) return true;
        const fetchState = nearbyFetchStateRef.current;
        if (fetchState === 'success' || fetchState === 'error') return true;
        await sleepMs(80);
      }
      return true;
    };

    const run = async () => {
      const map = mapRef?.current;
      const badgesTask = map
        ? raceWithTimeout(loadTourVicinityPrintLogoImages(map).catch(() => {}), 2200)
        : Promise.resolve();

      await Promise.all([waitForWelcomeFrame(), waitForNearbyPrime(), badgesTask]);
      if (cancelled || loadSeq !== tourMapLoadSeqRef.current) return;
      setMapRevealReady(true);
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [
    tourRequested,
    tourEditMode,
    loading,
    error,
    tourBasemapReady,
    mapRevealReady,
    mapRef,
    nearbyAmenityOrder,
    isNearbyCacheFresh,
  ]);

  /** Vicinity: amenity editor is the source of truth. Tour does not fetch extra Places. */
  useEffect(() => {
    if (!tourRequested || loading || error || !tourBasemapReady) return;
    setNearbyFetchState((s) => (s === 'loading' ? 'success' : s));
  }, [tourRequested, loading, error, tourBasemapReady]);

  /** Active vicinity slide reads from prefetch cache (no extra Google calls on slide change). */
  useEffect(() => {
    if (!tourRequested || loading || error) return;
    if (!tourInVicinityStep || !activeAmenityKey) return;
    const amenityKey = activeAmenityKey;
    if (!amenityKey) return;

    if (tourEditMode) {
      const cached = nearbyContextByAmenity?.[amenityKey];
      const hasResults = cached?.fetched === true && Array.isArray(cached.features);
      if (hasResults) {
        applyNearbyGeojsonResult(amenityKey, cached, { cacheAmenity: false });
      } else {
        setNearbyContextGeoJson({ type: 'FeatureCollection', features: [] });
        setNearbyFetchCount(0);
        setNearbyFetchNames([]);
        const map = mapRef?.current;
        if (map && tourBasemapReady) {
          void applyTourVicinityNearbyGeoJson(map, { type: 'FeatureCollection', features: [] });
        }
      }
      return;
    }

    const cached = nearbyContextByAmenity?.[amenityKey];
    if (isNearbyCacheFresh(cached, amenityKey)) {
      applyNearbyGeojsonResult(amenityKey, cached, { cacheAmenity: false });
      return;
    }

    if (nearbyFetchState === 'loading') return;
    // Keep existing map markers while prefetch catches up — do not wipe GeoJSON state.
  }, [
    tourRequested,
    loading,
    error,
    tourSlideIndex,
    tourInVicinityStep,
    activeAmenityKey,
    nearbyContextByAmenity,
    nearbyFetchState,
    isNearbyCacheFresh,
    applyNearbyGeojsonResult,
    tourEditMode,
    tourBasemapReady,
    mapRef,
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
    const snapWelcomeCamera = tourSlideIndex === 0;
    const instantCamera = snapWelcomeCamera;
    const currentPlanId = slidePlan[tourSlideIndex];
    const fitSlideIndex = tourSlideIndex;
    const prevPlanIndex = previousTourSlideIndexRef.current;
    const prevPlanId = slidePlan[prevPlanIndex];
    const nearbyPlayback = tourNearbyPlaybackRef.current;
    if (tourEditMode) {
      const enteringParsed = parseSlideId(currentPlanId);
      if (enteringParsed?.kind !== 'amenity') {
        hideTourEditRadiusCircle(map);
        editAmenityZoomedSlideRef.current = -1;
      }
    }
    const previousTourStepIndex =
      Number.isFinite(prevPlanIndex) && prevPlanId
        ? resolveLegacyStepForSlideContent(prevPlanId, printElements, nearbyAmenityOrder)
        : previousTourSlideIndexRef.current;
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
            nearbyContextGeoJson: nearbyPlayback.nearbyContextGeoJson,
            nearbyContextByAmenity:
              nearbyContextByAmenityRef.current || nearbyPlayback.nearbyContextByAmenity,
            nearbyAmenityOrder: nearbyPlayback.nearbyAmenityOrder,
            previousTourStepIndex,
            instantCamera,
            expandedLayout: tourAgentExpandedLayout,
            vicinityPeek: tourInVicinityStep,
            vicinityPeekMinimized: mobileAmenityPeekMinimized,
            tourEditMode,
            tourSlideParsed: parseSlideId(currentPlanId),
            previousTourSlideParsed: parseSlideId(prevPlanId),
            onEditAmenityRadiusFit:
              tourEditMode && nearbySearchCenterRef.current
                ? (fitMap, amenityKey) => {
                    const radius = getAmenitySearchRadiusMeters(
                      tourSettingsRef.current,
                      amenityKey
                    );
                    const center = nearbySearchCenterRef.current;
                    if (editAmenityZoomedSlideRef.current === fitSlideIndex) {
                      showTourEditRadiusCircle(fitMap, center, radius);
                      return;
                    }
                    fitTourEditRadiusForAmenitySlide(fitMap, center, radius, {
                      shouldAbort: () => tourSlideIndexRef.current !== fitSlideIndex,
                      onFitted: () => {
                        if (tourSlideIndexRef.current === fitSlideIndex) {
                          editAmenityZoomedSlideRef.current = fitSlideIndex;
                        }
                      },
                    });
                  }
                : undefined,
          }
        );
        if (tourApplySeqRef.current === tourApplySeq && tourEditMode) {
          const parsed = parseSlideId(currentPlanId);
          if (parsed?.kind !== 'amenity') {
            hideTourEditRadiusCircle(map);
            editAmenityZoomedSlideRef.current = -1;
          }
        }
        if (snapWelcomeCamera) {
          tourWelcomeRevealedRef.current = true;
        }
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
    clearTourPlayback,
    applyTourPropertyBasemapRef,
    tourInVicinityStep,
    tourEditMode,
    slidePlan,
    tourAgentExpandedLayout,
    mobileAmenityPeekMinimized,
  ]);

  /** Refresh nearby markers when prefetch completes; refit camera once data arrives for the active slide. */
  useEffect(() => {
    if (tourEditMode) return undefined;
    if (!tourRequested || loading || error || !tourBasemapReady) return;
    if (!tourInVicinityStep || !activeAmenityKey) return;
    const map = mapRef?.current;
    if (!map) return;
    const amenityKey = activeAmenityKey;
    if (!amenityKey) return;
    const cached = nearbyContextByAmenity?.[amenityKey];
    const rawFeatures = Array.isArray(cached?.features) ? cached.features : [];
    const visibleFeatures = visibleTourNearbyFeatures(rawFeatures);
    const nearbyGeoJson = { type: 'FeatureCollection', features: visibleFeatures };
    const featureCount = visibleFeatures.length;

    if (!featureCount) return;

    const fitKey = `${tourSlideIndex}:${amenityKey}`;
    const slideOrAmenityChanged = vicinityFitSlideRef.current !== fitKey;
    const prevFeatureCount = vicinityFitFeatureCountRef.current;
    const dataJustArrived = featureCount > 0 && prevFeatureCount === 0;
    // Only mark the fit key after a successful apply+fit — never before, or a cancelled
    // React effect cleanup can permanently skip the first amenity zoom.
    const shouldFitCamera = slideOrAmenityChanged || dataJustArrived;
    vicinityFitFeatureCountRef.current = featureCount;

    let cancelled = false;
    void (async () => {
      try {
        await applyTourVicinityNearbyGeoJson(map, nearbyGeoJson);
        if (cancelled) return;
        ensureTourVicinityNearbyLayersOnTop(map);
        scheduleTourVicinityLayersOnTop(map);
        if (shouldFitCamera) {
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              if (cancelled) return;
              applyTourMobileMapPadding(map, {
                expandedLayout: tourAgentExpandedLayout,
                vicinityPeek: true,
                vicinityPeekMinimized: mobileAmenityPeekMinimized,
              });
              fitTourVicinityCamera(map, nearbyGeoJson, tourBounds, savedViewport, {
                animationDuration: slideOrAmenityChanged ? 1100 : 900,
                ...resolveTourVicinityCameraPaddingOptions({
                  vicinityPeek: true,
                  expandedLayout: tourAgentExpandedLayout,
                  vicinityPeekMinimized: mobileAmenityPeekMinimized,
                }),
              });
              vicinityFitSlideRef.current = fitKey;
            });
          });
        }
      } catch (_) {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    tourRequested,
    tourBasemapReady,
    tourSlideIndex,
    tourInVicinityStep,
    activeAmenityKey,
    tourEditMode,
    loading,
    error,
    mapRef,
    nearbyContextByAmenity,
    nearbyContextGeoJson,
    tourBounds,
    savedViewport,
    tourAgentExpandedLayout,
    mobileAmenityPeekMinimized,
  ]);

  /**
   * Prewarm Step 2 basemap while Step 1 is visible (3D imagery load only).
   * Layer patch for context stays on slide entry — applying it here turned GIS layers off
   * on the welcome slide (visible flicker) before the user advanced.
   */
  useEffect(() => {
    if (!tourRequested || loading || error) return;
    if (!tourBasemapReady) return;
    if (tourSlideIndex !== 0) return;
    if (!tourBaselineCapturedRef.current || !tourLayerBaselineRef.current) return;
    if (tourStepTwoPrewarmedRef.current) return;

    const stepTwo = PROPERTY_TOUR_SLIDES[1];
    if (!stepTwo || stepTwo.id !== 'context') {
      tourStepTwoPrewarmedRef.current = true;
      return;
    }

    tourStepTwoPrewarmedRef.current = true;

    // Background-warm 3D while welcome is visible. Do NOT re-apply welcome after —
    // that raced the 0→1 advance (map.stop + clear orbit killed the context fly).
    const prewarmBasemap = applyTourPropertyBasemapRef?.current;
    if (typeof prewarmBasemap === 'function') {
      void Promise.resolve(prewarmBasemap()).catch(() => {
        /* ignore prewarm failures; slide transition still works */
      });
    }
    return undefined;
  }, [
    tourRequested,
    tourBasemapReady,
    tourSlideIndex,
    loading,
    error,
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
    const planId = slidePlan[tourSlideIndex];
    const parsed = parseSlideId(planId);
    if (parsed?.kind === 'amenity') {
      const amenityMeta = TOUR_NEARBY_AMENITY_ORDER.find((x) => x.key === parsed.amenityKey);
      return {
        title: amenityMeta?.label || 'Nearby',
        subtitle:
          'Top nearby places by rating and reviews. Hover a row to emphasize its marker; click the row or Zoom to to focus.',
      };
    }
    if (parsed?.kind === 'intro') {
      const idx = { welcome: 0, context: 1, bird: 2 }[parsed.introId];
      const s = PROPERTY_TOUR_SLIDES[idx] || PROPERTY_TOUR_SLIDES[0];
      return { title: s.title, subtitle: s.subtitle };
    }
    if (parsed?.kind === 'photo') {
      const meta = getSlideMetaForPlanId(planId, { tourPhotoRanked });
      return {
        title: meta.label,
        subtitle:
          "Bird's-eye map focus and photo. You can pan and zoom the map anytime — use the tour arrows to move between locations.",
      };
    }
    const s = PROPERTY_TOUR_SLIDES[0];
    return { title: s.title, subtitle: s.subtitle };
  }, [tourSlideIndex, slidePlan, tourPhotoRanked]);

  const tourAtFirst = tourSlideIndex <= 0;
  const tourAtLast = tourSlideIndex >= tourStepCount - 1;
  const tourContinueHintVisible =
    showTourContinueHint &&
    !tourEditMode &&
    !loading &&
    !error &&
    !tourAtLast &&
    mapRevealReady;

  useEffect(() => {
    if (!tourRequested || tourEditMode) return undefined;
    const footer = document.querySelector('.shared-tour-view-footer');
    if (!footer) return undefined;

    const syncFooterHeight = () => {
      try {
        const h = Math.ceil(footer.getBoundingClientRect().height);
        if (h > 0) {
          document.documentElement.style.setProperty('--shared-tour-view-footer-h', `${h}px`);
        }
      } catch (_) {
        /* ignore */
      }
    };

    syncFooterHeight();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(syncFooterHeight) : null;
    ro?.observe(footer);
    window.addEventListener('resize', syncFooterHeight);

    return () => {
      ro?.disconnect();
      window.removeEventListener('resize', syncFooterHeight);
      document.documentElement.style.removeProperty('--shared-tour-view-footer-h');
    };
  }, [tourRequested, tourEditMode, tourSlideIndex, slidePlan.length]);

  const updateTourFooterEdgePadding = useCallback(() => {
    const track = tourFooterTabsRef.current;
    const tab = tourFooterTabRefs.current[tourSlideIndex];
    if (!track || !tab) return;
    const edge = Math.max(0, track.clientWidth / 2 - tab.offsetWidth / 2);
    track.style.setProperty('--tour-footer-edge', `${edge}px`);
  }, [tourSlideIndex]);

  const centerTourFooterTab = useCallback(
    (behavior = 'smooth') => {
      const track = tourFooterTabsRef.current;
      const tab = tourFooterTabRefs.current[tourSlideIndex];
      if (!track || !tab) return;
      updateTourFooterEdgePadding();
      const run = () => {
        const trackRect = track.getBoundingClientRect();
        const tabRect = tab.getBoundingClientRect();
        const delta = tabRect.left + tabRect.width / 2 - (trackRect.left + trackRect.width / 2);
        if (Math.abs(delta) > 0.5) {
          track.scrollBy({ left: delta, behavior });
        }
      };
      if (behavior === 'auto') {
        run();
        return;
      }
      requestAnimationFrame(() => requestAnimationFrame(run));
    },
    [tourSlideIndex, updateTourFooterEdgePadding]
  );

  useLayoutEffect(() => {
    if (!tourRequested || tourEditMode) return undefined;
    const behavior = tourFooterTabsDidInitialCenterRef.current ? 'smooth' : 'auto';
    tourFooterTabsDidInitialCenterRef.current = true;
    const id = requestAnimationFrame(() => {
      requestAnimationFrame(() => centerTourFooterTab(behavior));
    });
    return () => cancelAnimationFrame(id);
  }, [tourRequested, tourEditMode, tourSlideIndex, slidePlan.length, centerTourFooterTab]);

  useEffect(() => {
    if (!tourRequested || tourEditMode) return undefined;
    const track = tourFooterTabsRef.current;
    if (!track || typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(() => {
      updateTourFooterEdgePadding();
      centerTourFooterTab('auto');
    });
    ro.observe(track);
    return () => ro.disconnect();
  }, [tourRequested, tourEditMode, centerTourFooterTab, updateTourFooterEdgePadding]);

  useEffect(() => {
    if (!tourRequested || tourEditMode) return;
    tourFooterTabsDidInitialCenterRef.current = false;
    tourFooterTabRefs.current = [];
  }, [tourRequested, tourEditMode, shareToken, slidePlan.length]);

  // Tour view: keep map inset for footer (and mobile chrome) on resize.
  useEffect(() => {
    if (!tourRequested || !mapRef?.current || !tourBasemapReady || tourEditMode) return undefined;

    const map = mapRef.current;
    const currentPlanId = slidePlan[tourSlideIndex];
    const currentParsed = currentPlanId ? parseSlideId(currentPlanId) : null;
    const isBirdSlide =
      currentParsed?.kind === 'intro' && currentParsed.introId === 'bird';
    const isOrbitSlide =
      currentParsed?.kind === 'intro' && currentParsed.introId === 'context';

    const applyPadding = () =>
      applyTourMobileMapPadding(map, {
        expandedLayout: tourAgentExpandedLayout,
        vicinityPeek: tourInVicinityStep,
        vicinityPeekMinimized: mobileAmenityPeekMinimized,
      });

    let shrinkTimer = null;
    if (
      !isMobileViewport ||
      tourAgentExpandedLayout ||
      tourInVicinityStep ||
      isBirdSlide ||
      isOrbitSlide
    ) {
      // Vicinity peek panel must reserve bottom inset immediately — delayed padding
      // mid-camera-move was freezing the photo → first-amenity zoom transition.
      // Bird + orbit (context) slides apply padding before the camera move; a delayed
      // setPadding mid-orbit recenters the map and stutters the rotation.
      // Desktop always applies footer inset immediately.
      applyPadding();
    } else {
      shrinkTimer = window.setTimeout(() => {
        try {
          if (typeof map.isMoving === 'function' && map.isMoving()) return;
        } catch (_) {
          /* still apply */
        }
        applyPadding();
      }, 380);
    }

    const onResize = () => applyPadding();
    window.addEventListener('resize', onResize);

    return () => {
      window.removeEventListener('resize', onResize);
      if (shrinkTimer != null) window.clearTimeout(shrinkTimer);
    };
  }, [
    tourRequested,
    mapRef,
    tourBasemapReady,
    tourAgentExpandedLayout,
    tourInVicinityStep,
    slidePlan,
    tourSlideIndex,
    mobileAmenityPeekMinimized,
    isMobileViewport,
  ]);

  /** Desktop view: sync map bottom padding when the tour footer height changes. */
  useEffect(() => {
    if (
      !tourRequested ||
      tourEditMode ||
      isMobileViewport ||
      !tourBasemapReady ||
      !mapRef?.current
    ) {
      return undefined;
    }
    const footer = document.querySelector('.shared-tour-view-footer');
    if (!footer) return undefined;

    let raf = 0;
    const syncPadding = () => {
      const map = mapRef?.current;
      if (!map) return;
      applyTourMobileMapPadding(map, {
        expandedLayout: tourAgentExpandedLayout,
        vicinityPeek: tourInVicinityStep,
        vicinityPeekMinimized: mobileAmenityPeekMinimized,
      });
    };
    const scheduleSync = () => {
      if (raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(syncPadding);
    };

    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(scheduleSync) : null;
    ro?.observe(footer);
    scheduleSync();

    return () => {
      if (raf) cancelAnimationFrame(raf);
      ro?.disconnect();
    };
  }, [
    tourRequested,
    tourEditMode,
    isMobileViewport,
    tourBasemapReady,
    mapRef,
    tourAgentExpandedLayout,
    tourInVicinityStep,
    mobileAmenityPeekMinimized,
    tourSlideIndex,
  ]);

  const activeAmenityMeta = useMemo(() => {
    if (!tourInVicinityStep || !activeAmenityKey) return null;
    return TOUR_NEARBY_AMENITY_ORDER.find((x) => x.key === activeAmenityKey) || null;
  }, [tourInVicinityStep, activeAmenityKey]);
  const activeAmenityFeatures = useMemo(() => {
    if (!tourInVicinityStep || !activeAmenityMeta?.key) return [];
    const fc = nearbyContextByAmenity?.[activeAmenityMeta.key];
    return visibleTourNearbyFeatures(fc?.features);
  }, [tourInVicinityStep, activeAmenityMeta, nearbyContextByAmenity]);
  const activeAmenityAllFeatures = useMemo(() => {
    if (!tourInVicinityStep || !activeAmenityMeta?.key) return [];
    const fc = nearbyContextByAmenity?.[activeAmenityMeta.key];
    return Array.isArray(fc?.features) ? fc.features : [];
  }, [tourInVicinityStep, activeAmenityMeta, nearbyContextByAmenity]);

  /** Mobile view: keep map padding in sync when agent bar or amenity peek panel resizes. */
  useEffect(() => {
    if (!tourRequested || tourEditMode || !tourInVicinityStep || !tourBasemapReady || !isMobileViewport) {
      return undefined;
    }
    const peek = document.querySelector('.shared-tour-mobile-nearby-peek');
    const topChrome = document.querySelector('.shared-tour-mobile-agent-top');
    if (!peek && !topChrome) return undefined;

    let raf = 0;
    const syncPadding = () => {
      const map = mapRef?.current;
      if (!map) return;
      applyTourMobileMapPadding(map, {
        expandedLayout: tourAgentExpandedLayout,
        vicinityPeek: true,
        vicinityPeekMinimized: mobileAmenityPeekMinimized,
      });
    };
    const scheduleSync = () => {
      if (raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(syncPadding);
    };

    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(scheduleSync) : null;
    if (ro) {
      if (peek) ro.observe(peek);
      if (topChrome) ro.observe(topChrome);
    }
    scheduleSync();

    return () => {
      if (raf) cancelAnimationFrame(raf);
      ro?.disconnect();
    };
  }, [
    tourRequested,
    tourEditMode,
    tourInVicinityStep,
    tourBasemapReady,
    isMobileViewport,
    tourAgentExpandedLayout,
    mobileAmenityPeekMinimized,
    mapRef,
  ]);

  const getEditPlaceKey = useCallback((feature) => {
    const p = feature?.properties || {};
    return String(p.place_id || p.placeId || p.name || '').trim();
  }, []);

  const persistSlidePlanOrder = useCallback(
    async (plan) => {
      const rawPlan = Array.isArray(plan) ? plan.filter((id) => parseSlideId(id)) : [];
      if (!rawPlan.length) return;

      const amenityKeys = enabledAmenityKeysFromPlan(rawPlan);
      const settingsPatch = normalizeTourSettings({
        ...normalizeTourSettings(tourSettingsRef.current),
        slidePlan: rawPlan,
        slidePlanUserEdited: true,
        enabledAmenityKeys: amenityKeys.length
          ? amenityKeys
          : normalizeTourSettings(tourSettingsRef.current).enabledAmenityKeys,
      });

      if (mapDocId) {
        const result = await mapService.updateMap(mapDocId, {
          isPublic: true,
          tourSettings: settingsPatch,
          tourSlidePlan: rawPlan,
        });
        const readBack = result?.tourSlidePlan || result?.tourSettings?.slidePlan;
        if (!readBack?.length) {
          throw new Error(
            'Could not save slide order — cloud functions may need redeploying (updateMap).'
          );
        }
        return;
      }

      if (!shareToken) return;

      const center = getTourNearbySearchCenter(
        printElements,
        getBoundsFromPrintElements(printElements) || getBoundsFromViewport(savedViewport),
        savedViewport
      );
      const existingCache = buildTourNearbyCacheForSave(
        center,
        nearbyContextByAmenityRef.current,
        settingsPatch.searchRadiusMeters,
        settingsPatch.enabledAmenityKeys,
        { replace: false, allowEmpty: true, tourSettings: settingsPatch }
      );
      if (!existingCache) {
        throw new Error('Could not build tour settings to save slide order.');
      }
      await mapService.saveTourNearbyCache(shareToken, existingCache, settingsPatch);
    },
    [mapDocId, shareToken, printElements, savedViewport]
  );

  const queueSlidePlanSave = useCallback(
    (plan) => {
      if (slidePlanSaveTimerRef.current) {
        clearTimeout(slidePlanSaveTimerRef.current);
      }
      slidePlanSaveTimerRef.current = window.setTimeout(() => {
        slidePlanSaveTimerRef.current = null;
        void persistSlidePlanOrder(plan).catch((err) => {
          if (process.env.NODE_ENV === 'development') {
            console.warn('[tour-save] auto-save slide order failed', err);
          }
          setEditSaveError(err?.message || 'Could not save slide order');
          setEditSaveState('error');
        });
      }, 350);
    },
    [persistSlidePlanOrder]
  );

  useEffect(() => {
    if (!tourEditMode || loading || tourEditLockSavedRef.current) return;
    const plan = slidePlanRef.current.length
      ? slidePlanRef.current
      : Array.isArray(slidePlan)
        ? slidePlan
        : [];
    if (!plan.length) return;

    slidePlanUserEditedRef.current = true;
    const current = normalizeTourSettings(tourSettingsRef.current);
    if (current.slidePlanUserEdited === true) {
      tourEditLockSavedRef.current = true;
      return;
    }

    const next = normalizeTourSettings({
      ...current,
      slidePlan: plan,
      slidePlanUserEdited: true,
    });
    tourSettingsRef.current = next;
    setTourSettings(next);
    tourEditLockSavedRef.current = true;
    void persistSlidePlanOrder(plan).catch((err) => {
      tourEditLockSavedRef.current = false;
      if (process.env.NODE_ENV === 'development') {
        console.warn('[tour-save] could not lock tour after opening editor', err);
      }
    });
  }, [tourEditMode, loading, slidePlan, persistSlidePlanOrder]);

  const persistTourEdit = useCallback(async () => {
    if (!shareToken) throw new Error('Share link is missing — reload and try again.');
    if (!nearbySearchCenter) throw new Error('Could not determine a search center for this property.');

    const uiPlan =
      slidePlanRef.current.length > 0
        ? [...slidePlanRef.current]
        : Array.isArray(slidePlan) && slidePlan.length
          ? [...slidePlan]
          : [];
    if (!uiPlan.length) throw new Error('Tour has no slides to save.');

    const amenityKeys = enabledAmenityKeysFromPlan(uiPlan);
    const plan = uiPlan.filter((id) => parseSlideId(id));
    if (!plan.length) throw new Error('Tour has no valid slides to save.');
    const settingsForSave = normalizeTourSettings({
      ...normalizeTourSettings(tourSettingsRef.current),
      slidePlan: plan,
      slidePlanUserEdited: true,
      slidePrintElements: pickSlidePrintElements(tourSettingsRef.current?.slidePrintElements),
      enabledAmenityKeys: amenityKeys.length
        ? amenityKeys
        : normalizeTourSettings(tourSettingsRef.current).enabledAmenityKeys,
    });
    const currentByAmenity = nearbyContextByAmenityRef.current;
    const payload = buildTourNearbyCacheForSave(
      nearbySearchCenter,
      currentByAmenity,
      settingsForSave.searchRadiusMeters,
      settingsForSave.enabledAmenityKeys,
      { replace: false, allowEmpty: true, tourSettings: settingsForSave }
    );
    if (!payload) throw new Error('Could not build tour data to save.');
    if (!payload.tourSettings?.slidePlan?.length) {
      payload.tourSettings = { ...payload.tourSettings, slidePlan: [...plan] };
    }

    let savedSettings = settingsForSave;
    let savedViaOwnerUpdate = false;
    let saveError = '';
    let updateResult = null;

    if (mapDocId) {
      try {
        updateResult = await mapService.updateMap(mapDocId, {
          isPublic: true,
          tourSettings: settingsForSave,
          tourSlidePlan: plan,
          tourNearbyCache: payload,
        });
        savedViaOwnerUpdate = true;
      } catch (updateErr) {
        saveError = updateErr?.message || String(updateErr);
        console.warn('[SharedMapViewPage] updateMap during tour save failed.', updateErr);
      }
    }

    if (!savedViaOwnerUpdate) {
      const result = await mapService.saveTourNearbyCache(shareToken, payload, settingsForSave);
      if (!result?.success) {
        throw new Error(saveError || 'Could not save tour — map may not be public yet.');
      }
      updateResult = result;
      savedSettings = normalizeTourSettings({
        ...settingsForSave,
        ...(result?.tourSettings || {}),
        slidePlan: plan,
        slidePrintElements: pickSlidePrintElements(
          settingsForSave.slidePrintElements,
          result?.tourSettings?.slidePrintElements
        ),
      });
    }

    tourCuratedRef.current = true;
    const materialized = materializeTourSettingsSlidePlan(
      {
        ...savedSettings,
        slidePlan: plan,
        slidePlanUserEdited: settingsForSave.slidePlanUserEdited,
      },
      printElements
    );
    tourSettingsRef.current = materialized;
    const savedPlan = plan;
    slidePlanRef.current = savedPlan;
    setSlidePlan(savedPlan);
    setTourSettings({ ...materialized, slidePlan: savedPlan });

    try {
      let readBack =
        updateResult?.tourSlidePlan ||
        updateResult?.tourSettings?.slidePlan ||
        null;

      if (!readBack?.length && mapDocId) {
        await new Promise((r) => window.setTimeout(r, 400));
        const owned = await mapService.getMapById(mapDocId);
        readBack = owned?.tourSlidePlan || owned?.tourSettings?.slidePlan || null;
      }

      if (!readBack?.length) {
        await new Promise((r) => window.setTimeout(r, 400));
        const verify = await mapService.getSharedMapByToken(shareToken);
        readBack = verify?.tourSlidePlan || verify?.tourSettings?.slidePlan || null;
      }

      if (!readBack?.length) {
        throw new Error(
          'Slide order was not saved to the server. Redeploy cloud functions (updateMap, saveTourNearbyCache, getSharedMapByToken) and try again.'
        );
      }
      if (JSON.stringify(readBack) !== JSON.stringify(savedPlan)) {
        console.warn('[tour-save] slide plan mismatch after save', { savedPlan, readBack });
        throw new Error('Slide order did not persist correctly — refresh and try again.');
      }
    } catch (verifyErr) {
      if (verifyErr?.message?.includes('Slide order')) throw verifyErr;
      console.warn('[tour-save] could not verify saved slide plan', verifyErr);
    }

    setNearbyContextByAmenity((prev) => {
      const next = {};
      for (const key of materialized.enabledAmenityKeys) {
        if (prev[key]) next[key] = prev[key];
      }
      nearbyContextByAmenityRef.current = next;
      return next;
    });
  }, [shareToken, nearbySearchCenter, mapDocId, printElements, slidePlan]);

  const syncTourSettingsFromPlan = useCallback((nextPlan) => {
    const amenityKeys = enabledAmenityKeysFromPlan(nextPlan);
    const next = normalizeTourSettings({
      ...normalizeTourSettings(tourSettingsRef.current),
      slidePlan: [...nextPlan],
      enabledAmenityKeys: amenityKeys.length
        ? amenityKeys
        : normalizeTourSettings(tourSettingsRef.current).enabledAmenityKeys,
    });
    tourSettingsRef.current = next;
    const resolvedPlan = [...nextPlan];
    slidePlanRef.current = resolvedPlan;
    setSlidePlan(resolvedPlan);
    return next;
  }, []);

  const handleEditRemoveSlide = useCallback(
    (slideId, removeIndex) => {
      if (slidePlan.length <= 1) return;
      if (isLockedTourSlideIndex(slidePlan, removeIndex)) return;
      const nextPlan = slidePlan.filter((_, i) => i !== removeIndex);
      if (!nextPlan.length) return;
      const next = syncTourSettingsFromPlan(nextPlan);
      setTourSettings(next);
      queueSlidePlanSave(nextPlan);
      setTourSlideIndex((i) => {
        if (i > removeIndex) return i - 1;
        if (i === removeIndex) return Math.min(removeIndex, nextPlan.length - 1);
        return i;
      });
    },
    [slidePlan, syncTourSettingsFromPlan, queueSlidePlanSave]
  );

  const appendSlideToPlan = useCallback(
    (slideId) => {
      const id = String(slideId || '').trim();
      if (!id || !parseSlideId(id)) return;
      const currentPlan = normalizeTourSlidePlan(
        slidePlanRef.current.length ? slidePlanRef.current : slidePlan,
        printElements,
        normalizeTourSettings(tourSettingsRef.current).enabledAmenityKeys,
        // Explicit edit — validate the plan only, never auto-append here.
        { userEdited: true }
      );
      if (currentPlan.includes(id)) return;
      const nextPlan = [...currentPlan, id];
      const next = syncTourSettingsFromPlan(nextPlan);
      setTourSettings(next);
      queueSlidePlanSave(nextPlan);
      setTourSlideIndex(nextPlan.length - 1);
    },
    [slidePlan, printElements, syncTourSettingsFromPlan, queueSlidePlanSave]
  );

  const handleEditAddAmenity = useCallback(
    (amenityKey) => {
      appendSlideToPlan(amenitySlideId(amenityKey));
    },
    [appendSlideToPlan]
  );

  const handleEditAddPhoto = useCallback(
    (elementId) => {
      appendSlideToPlan(photoSlideId(elementId));
    },
    [appendSlideToPlan]
  );

  const tourAmenitiesAvailableToAdd = useMemo(() => {
    const inPlan = new Set(
      slidePlan
        .map((id) => parseSlideId(id))
        .filter((p) => p?.kind === 'amenity')
        .map((p) => p.amenityKey)
    );
    return TOUR_NEARBY_AMENITY_ORDER.filter((item) => !inPlan.has(item.key));
  }, [slidePlan]);

  const tourPhotosAvailableToAdd = useMemo(() => {
    const inPlan = new Set(
      slidePlan
        .map((id) => parseSlideId(id))
        .filter((p) => p?.kind === 'photo')
        .map((p) => p.elementId)
    );
    return tourPhotoRanked.filter((row) => row.element?.id && !inPlan.has(row.element.id));
  }, [slidePlan, tourPhotoRanked]);

  const handleEditReorderSlides = useCallback(
    (fromIndex, toIndex) => {
      if (fromIndex === toIndex) return;
      const prev = slidePlanRef.current.length ? slidePlanRef.current : slidePlan;
      const nextPlan = reorderSlidePlan(prev, fromIndex, toIndex);
      if (JSON.stringify(nextPlan) === JSON.stringify(prev)) return;
      const next = syncTourSettingsFromPlan(nextPlan);
      setTourSettings(next);
      queueSlidePlanSave(nextPlan);
      setTourSlideIndex((i) => {
        if (i === fromIndex) {
          const insertAt = toIndex > fromIndex ? toIndex - 1 : toIndex;
          return insertAt;
        }
        if (fromIndex < i && toIndex > i) return i - 1;
        if (fromIndex > i && toIndex <= i) return i + 1;
        if (fromIndex < i && toIndex <= i) return i - 1;
        return i;
      });
    },
    [slidePlan, syncTourSettingsFromPlan, queueSlidePlanSave]
  );

  const handleEditSearchAmenity = useCallback(async () => {
    const amenityKey = activeAmenityMeta?.key;
    if (!amenityKey || !nearbySearchCenter || !shareToken) return;
    setNearbyFetchState('loading');
    setNearbyFetchError('');
    try {
      if (mapDocId) await mapService.updateMap(mapDocId, { isPublic: true });
      const radiusMeters = getAmenitySearchRadiusMeters(tourSettingsRef.current, amenityKey);
      const geojson = await mapService.getNearbyGooglePlaces({
        lat: nearbySearchCenter.lat,
        lng: nearbySearchCenter.lng,
        radiusMeters,
        amenityKey,
        shareToken,
        forceRefresh: true,
        editorMode: true,
      });
      const searched = Array.isArray(geojson?.features) ? geojson.features : [];
      const previousFeatures = Array.isArray(nearbyContextByAmenityRef.current?.[amenityKey]?.features)
        ? nearbyContextByAmenityRef.current[amenityKey].features
        : [];
      const prevById = new Map(previousFeatures.map((f) => [getEditPlaceKey(f), f]));
      const features = searched.map((feature) => {
        const prior = prevById.get(getEditPlaceKey(feature));
        return prior ? mergePlaceVisibilityFromPrior(feature, prior) : feature;
      });
      setNearbyContextByAmenity((prev) => {
        const next = {
          ...prev,
          [amenityKey]: {
            type: 'FeatureCollection',
            features,
            fetched: true,
            searchRadiusMeters: radiusMeters,
            dataVersion: TOUR_NEARBY_DATA_VERSION,
          },
        };
        nearbyContextByAmenityRef.current = next;
        return next;
      });
      applyNearbyGeojsonResult(amenityKey, { type: 'FeatureCollection', features }, { cacheAmenity: false });
      setNearbyFetchState('success');
    } catch (err) {
      setNearbyFetchState('error');
      setNearbyFetchError(err?.message || 'Search failed');
    }
  }, [
    activeAmenityMeta?.key,
    nearbySearchCenter,
    shareToken,
    mapDocId,
    applyNearbyGeojsonResult,
    getEditPlaceKey,
  ]);

  const handleEditTogglePlace = useCallback(
    (feature) => {
      const amenityKey = activeAmenityMeta?.key;
      if (!amenityKey) return;
      const key = getEditPlaceKey(feature);
      setNearbyContextByAmenity((prev) => {
        const entry = prev[amenityKey];
        if (!entry?.features) return prev;
        const features = entry.features.map((f) => {
          if (getEditPlaceKey(f) !== key) return f;
          const props = { ...(f.properties || {}) };
          if (props.tourHidden) delete props.tourHidden;
          else props.tourHidden = true;
          return { ...f, properties: props };
        });
        const next = { ...prev, [amenityKey]: { ...entry, features } };
        nearbyContextByAmenityRef.current = next;

        const map = mapRef?.current;
        if (map) {
          const visible = visibleTourNearbyFeatures(features);
          void applyTourVicinityNearbyGeoJson(map, { type: 'FeatureCollection', features: visible });
        }
        return next;
      });
      setHoveredPlaceKey((prev) => (prev === key ? null : prev));
    },
    [activeAmenityMeta?.key, getEditPlaceKey, mapRef]
  );

  const handleEditRadiusChange = useCallback(
    (meters) => {
      if (!activeAmenityKey) return;
      setTourSettings((prev) => {
        const normalized = normalizeTourSettings(prev);
        const next = {
          ...normalized,
          amenityRadiusMeters: {
            ...(normalized.amenityRadiusMeters || {}),
            [activeAmenityKey]: meters,
          },
        };
        tourSettingsRef.current = next;
        return next;
      });
    },
    [activeAmenityKey]
  );

  const handleEditTogglePrintElement = useCallback(
    (elementId) => {
      if (!currentSlidePlanId) return;
      setTourSettings((prev) => {
        const normalized = normalizeTourSettings(prev);
        const nextPrint = toggleSlidePrintElement(
          normalized.slidePrintElements,
          currentSlidePlanId,
          elementId,
          printElements
        );
        const next = { ...normalized, slidePrintElements: nextPrint };
        tourSettingsRef.current = next;
        return next;
      });
    },
    [currentSlidePlanId, printElements]
  );

  const handleEditSave = useCallback(async () => {
    setEditSaveState('saving');
    setEditSaveError('');
    try {
      await persistTourEdit();
      setEditSaveState('saved');
      window.setTimeout(() => setEditSaveState('idle'), 2200);
    } catch (err) {
      setEditSaveState('error');
      setEditSaveError(err?.message || 'Could not save tour');
    }
  }, [persistTourEdit]);

  useEffect(() => {
    if (!tourEditMode) {
      hideTourEditRadiusCircle(mapRef?.current);
      editAmenityZoomedSlideRef.current = -1;
    }
  }, [tourEditMode, mapRef]);

  /** Allow a fresh radius zoom each time the footer slide changes. */
  useEffect(() => {
    editAmenityZoomedSlideRef.current = -1;
  }, [tourSlideIndex]);

  useEffect(() => {
    if (!tourEditMode) return;
    setTourSlideIndex((i) => Math.min(i, Math.max(0, tourStepCount - 1)));
  }, [tourEditMode, tourStepCount]);

  /** Amenity radius slider — geometry only, no camera. */
  useEffect(() => {
    if (!tourEditMode || !tourInVicinityStep || !nearbySearchCenter || !activeAmenityKey || !tourBasemapReady) {
      return undefined;
    }
    const map = mapRef?.current;
    if (!map) return undefined;
    updateTourEditRadiusGeometry(map, nearbySearchCenter, activeAmenityRadiusMeters);
    return undefined;
  }, [
    tourEditMode,
    tourInVicinityStep,
    nearbySearchCenter,
    activeAmenityKey,
    activeAmenityRadiusMeters,
    tourBasemapReady,
    mapRef,
  ]);

  /** Keep map markers in sync with visible places (hide/show in edit, saved tour in view). */
  useEffect(() => {
    if (!tourRequested || !tourInVicinityStep || !tourBasemapReady) return;
    const map = mapRef?.current;
    if (!map) return;
    void applyTourVicinityNearbyGeoJson(map, {
      type: 'FeatureCollection',
      features: activeAmenityFeatures,
    });
  }, [tourRequested, tourInVicinityStep, tourBasemapReady, activeAmenityFeatures, mapRef]);

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
        const padding = resolveTourVicinityFitPadding({
          ...resolveTourVicinityCameraPaddingOptions({
            vicinityPeek: true,
            expandedLayout: tourAgentExpandedLayout,
            vicinityPeekMinimized: mobileAmenityPeekMinimized,
          }),
        });

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
          scheduleTourVicinityLayersOnTop(map, duration);
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
        scheduleTourVicinityLayersOnTop(map, duration);
        window.dispatchEvent(new CustomEvent('map-user-interaction'));
      };

      requestAnimationFrame(() => {
        requestAnimationFrame(runFit);
      });
    },
    [mapRef, listingBoundsForNearbyZoom, tourAgentExpandedLayout, mobileAmenityPeekMinimized]
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
    if (!tourRequested || !tourInVicinityStep) {
      deactivateTourVicinityLayerStackGuard();
      return undefined;
    }
    const map = mapRef?.current;
    if (!map) return undefined;
    installTourVicinityLayerMaintainer(map);
    return () => {
      deactivateTourVicinityLayerStackGuard();
    };
  }, [tourRequested, tourInVicinityStep, mapRef, tourSlideIndex]);

  useEffect(() => {
    const map = mapRef?.current;
    if (!map) return;
    if (!tourInVicinityStep) {
      setTourVicinityNearbyHoverHighlight(map, null, null);
      return;
    }
    setTourVicinityNearbyHoverHighlight(map, hoveredPlaceKey || null, activeAmenityFeatures);
  }, [tourInVicinityStep, hoveredPlaceKey, activeAmenityFeatures, mapRef]);

  const renderClientMapPanelContent = () => (
    <>
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
          <p className="shared-side-description">All photos attached to visible photo points.</p>
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
    </>
  );

  const openClientMapTab = (tab) => {
    setActiveTab(tab);
    setPanelOpen(true);
  };

  const renderNearbyPlaceList = () => {
    if (activeAmenityFeatures.length > 0) {
      return (
        <ul className="shared-tour-nearby-card-list" onMouseLeave={() => setHoveredPlaceKey(null)}>
          {activeAmenityFeatures.map((f, i) => {
            const p = f?.properties || {};
            const name = String(p.name || '').trim() || `Place ${i + 1}`;
            const hKey = getNearbyPlaceHoverKey(f);
            const ratingNum = Number(p.rating);
            const showRating = Number.isFinite(ratingNum) && ratingNum > 0;
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
                    {showRating ? (
                      <span className="shared-tour-nearby-card-rating">
                        {ratingNum.toFixed(1)}
                        <span className="shared-tour-nearby-card-star" aria-hidden>
                          ★
                        </span>
                      </span>
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
      );
    }
    if (nearbyFetchNames.length > 0) {
      return (
        <ul className="shared-tour-nearby-card-list">
          {nearbyFetchNames.map((name, i) => (
            <li key={`${name}-${i}`}>
              <div className="shared-tour-nearby-card-row">
                <span className="shared-tour-nearby-card-name">{name}</span>
              </div>
            </li>
          ))}
        </ul>
      );
    }
    return null;
  };

  const renderTourNearbyPanelInner = () => (
    <div className="shared-tour-nearby-card-inner">
      <header className="shared-tour-nearby-card-header">
        <h3 className="shared-tour-nearby-card-title">
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
            <span>No thumbnail for the first results</span>
          </div>
        )}
      </div>
      {renderNearbyPlaceList()}
    </div>
  );

  /** Mobile tour: slim peek panel — amenity title + scrollable list + Zoom to. */
  const renderTourMobileNearbyPeek = () => (
    <div className="shared-tour-mobile-nearby-peek-inner">
      <div className="shared-tour-mobile-nearby-peek-handle" aria-hidden />
      <header className="shared-tour-mobile-nearby-peek-header">
        <h3 className="shared-tour-mobile-nearby-peek-title">
          {activeAmenityMeta?.label || 'Nearby'}
        </h3>
      </header>
      {nearbyFetchState === 'loading' ? (
        <p className="shared-tour-mobile-nearby-peek-status">Loading places…</p>
      ) : null}
      {nearbyFetchState === 'error' ? (
        <p className="shared-tour-mobile-nearby-peek-status shared-tour-mobile-nearby-peek-status--error">
          {nearbyFetchError || 'Request failed.'}
        </p>
      ) : null}
      <div className="shared-tour-mobile-nearby-peek-list-wrap">{renderNearbyPlaceList()}</div>
    </div>
  );

  return (
    <>
      {!mapRevealReady && !error ? (
        <MapLoadingOverlay
          phraseSet={tourRequested ? (tourBootGenerate ? 'createTour' : 'tour') : 'map'}
        />
      ) : null}
      {tourRequested ? (
        <div
          className={`shared-tour-shell${tourInVicinityStep ? ' shared-tour-shell--vicinity' : ''}${
            tourEditMode ? ' shared-tour-shell--edit' : ''
          }`}
          aria-live="polite"
        >
          <div className="shared-tour-shell-top-chrome">
            {tourEditMode ? (
              <div className="tour-edit-chrome shared-tour-desktop-only">
                <button
                  type="button"
                  className={`tour-edit-chrome-save${
                    editSaveState === 'saved' ? ' is-saved' : editSaveState === 'error' ? ' is-error' : ''
                  }`}
                  onClick={() => void handleEditSave()}
                  disabled={editSaveState === 'saving'}
                  title={editSaveError || undefined}
                >
                  {editSaveState === 'saving'
                    ? 'Saving…'
                    : editSaveState === 'saved'
                      ? 'Saved'
                      : editSaveState === 'error'
                        ? 'Save failed'
                        : 'Save tour'}
                </button>
                <button
                  type="button"
                  className="tour-edit-chrome-preview"
                  onClick={() => {
                    if (tourPreviewUrl) {
                      window.open(tourPreviewUrl, '_blank', 'noopener,noreferrer');
                    }
                  }}
                >
                  Preview tour
                </button>
                <Link className="tour-edit-chrome-exit" to={`/view/${shareToken}`}>
                  Exit
                </Link>
              </div>
            ) : null}

            {isMobileViewport ? (
              <aside
                className={`shared-tour-mobile-agent-top shared-tour-mobile-only${
                  tourAgentExpandedLayout ? ' shared-tour-mobile-agent-top--expanded' : ''
                }`}
                aria-label="Listing contact"
              >
                <TourMobileAgentCard meta={meta} expanded={tourAgentExpandedLayout} />
              </aside>
            ) : null}

            {!isMobileViewport && !tourEditMode ? (
              <div className="shared-tour-shell-left-rail shared-tour-desktop-only">
                {!tourInVicinityStep ? (
                  <aside
                    className="shared-tour-orbit-listing-card shared-tour-orbit-listing-card--full"
                    aria-label="Listing contact"
                  >
                    <SharedAgentCard meta={meta} description="" />
                  </aside>
                ) : (
                  <div className="shared-tour-vicinity-left">
                    <aside
                      className="shared-tour-orbit-listing-card shared-tour-orbit-listing-card--compact"
                      aria-label="Listing contact"
                    >
                      <TourAgentContact meta={meta} />
                    </aside>
                    <aside className="shared-tour-nearby-card cv-tour-nearby-panel" aria-live="polite">
                      {renderTourNearbyPanelInner()}
                    </aside>
                  </div>
                )}
              </div>
            ) : null}

            {!isMobileViewport && tourEditMode && tourEditSidePanelMode ? (
              <div className="shared-tour-shell-panel-row tour-edit-panel-row shared-tour-desktop-only">
                <aside
                  className="tour-edit-left-rail tour-edit-side-rail"
                  aria-label={
                    tourEditSidePanelMode === 'intro'
                      ? 'Slide map elements'
                      : 'Amenity map elements and search results'
                  }
                >
                  <TourEditSidePanel
                    mode={tourEditSidePanelMode}
                    slideTitle={getSlideMetaForPlanId(currentSlidePlanId, { tourPhotoRanked }).label}
                    printElements={printElements}
                    visibleElementIds={introSlideVisibleElementIds}
                    onToggleElement={handleEditTogglePrintElement}
                    getElementLabel={getLegendDisplayLabel}
                    amenityLabel={activeAmenityMeta?.label}
                    searchRadiusMeters={activeAmenityRadiusMeters}
                    onRadiusChange={handleEditRadiusChange}
                    onSearch={() => void handleEditSearchAmenity()}
                    fetchState={nearbyFetchState}
                    fetchError={nearbyFetchError}
                    features={activeAmenityAllFeatures}
                    onToggleVisibility={handleEditTogglePlace}
                    onFocusPlace={(f) => focusNearbyPlaceOnMap(f, { tight: true })}
                    onHoverPlace={setHoveredPlaceKey}
                  />
                </aside>
              </div>
            ) : null}
          </div>
          {tourInVicinityStep && isMobileViewport ? (
            <div className="shared-tour-mobile-vicinity shared-tour-mobile-only">
              <aside
                className={`shared-tour-mobile-nearby-panel shared-tour-mobile-nearby-peek cv-tour-nearby-panel${
                  activeAmenityFeatures.length <= 2 ? ' shared-tour-mobile-nearby-peek--few' : ''
                }${mobileAmenityPeekMinimized ? ' shared-tour-mobile-nearby-peek--minimized' : ''}`}
                aria-live="polite"
                aria-label={
                  mobileAmenityPeekMinimized
                    ? `${activeAmenityMeta?.label || 'Nearby'} — tap to show places`
                    : undefined
                }
                onClick={
                  mobileAmenityPeekMinimized
                    ? () => setMobileAmenityPeekMinimized(false)
                    : undefined
                }
                onKeyDown={
                  mobileAmenityPeekMinimized
                    ? (e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          setMobileAmenityPeekMinimized(false);
                        }
                      }
                    : undefined
                }
                role={mobileAmenityPeekMinimized ? 'button' : undefined}
                tabIndex={mobileAmenityPeekMinimized ? 0 : undefined}
              >
                {renderTourMobileNearbyPeek()}
              </aside>
            </div>
          ) : null}
          {tourEditMode && !isMobileViewport ? (
            <div className="shared-tour-deck-nav shared-tour-edit-footer shared-tour-desktop-only">
              <button
                type="button"
                className="shared-tour-arrow shared-tour-arrow--prev"
                aria-label="Previous slide"
                disabled={loading || !!error || tourAtFirst}
                onClick={() => goTourSlide(tourSlideIndex - 1)}
              >
                ‹
              </button>
              <TourEditSlideFooter
                slidePlan={slidePlan}
                activeIndex={tourSlideIndex}
                tourPhotoRanked={tourPhotoRanked}
                onSelectSlide={goTourSlide}
                onRemoveSlide={handleEditRemoveSlide}
                onReorderSlides={handleEditReorderSlides}
                availableAmenities={tourAmenitiesAvailableToAdd}
                availablePhotos={tourPhotosAvailableToAdd}
                onAddAmenity={handleEditAddAmenity}
                onAddPhoto={handleEditAddPhoto}
                disabled={loading || !!error}
              />
              <button
                type="button"
                className="shared-tour-arrow shared-tour-arrow--next"
                aria-label="Next slide"
                disabled={loading || !!error || tourAtLast}
                onClick={() => goTourSlide(tourSlideIndex + 1)}
              >
                ›
              </button>
            </div>
          ) : (
          <footer
            className="shared-tour-deck-nav shared-tour-view-footer"
            role="navigation"
            aria-label="Tour slides"
          >
            <aside className="shared-tour-cv-logo-card shared-tour-footer-brand" aria-label="Community View">
              <CommunityViewLogoLink
                className="shared-cv-logo-link--tour-card"
                imageClassName="shared-cv-logo--tour-card"
              />
            </aside>
            <div
              className="shared-tour-footer-center"
              role="region"
              aria-label={`${tourDeckMeta.title}. ${tourDeckMeta.subtitle}`}
            >
              <button
                type="button"
                className="shared-tour-arrow shared-tour-arrow--prev"
                aria-label="Previous slide"
                disabled={loading || !!error || tourAtFirst}
                onClick={() => goTourSlide(tourSlideIndex - 1)}
              >
                ‹
              </button>
              <div
                className="shared-tour-footer-tabs"
                ref={tourFooterTabsRef}
                role="tablist"
                aria-label="Tour sections"
              >
                <div className="shared-tour-footer-tabs-edge" aria-hidden="true" />
                {slidePlan.map((planId, stepIdx) => {
                  const tabMeta = getSlideMetaForPlanId(planId, { tourPhotoRanked });
                  const tabLabel = tabMeta.label;
                  return (
                    <button
                      key={`tour-footer-tab-${planId}-${stepIdx}`}
                      ref={(el) => {
                        tourFooterTabRefs.current[stepIdx] = el;
                      }}
                      type="button"
                      role="tab"
                      aria-selected={stepIdx === tourSlideIndex}
                      aria-label={`${tabMeta.label}, slide ${stepIdx + 1} of ${tourStepCount}`}
                      className={`shared-tour-footer-tab${
                        stepIdx === tourSlideIndex ? ' is-active' : ''
                      }`}
                      disabled={loading || !!error}
                      onClick={() => goTourSlide(stepIdx)}
                    >
                      {tabLabel}
                    </button>
                  );
                })}
                <div className="shared-tour-footer-tabs-edge" aria-hidden="true" />
              </div>
              <div className="shared-tour-next-wrap">
                {tourContinueHintVisible ? (
                  <div className="shared-tour-continue-hint" role="status" aria-live="polite">
                    Click here to continue
                  </div>
                ) : null}
                <button
                  type="button"
                  className="shared-tour-arrow shared-tour-arrow--next"
                  aria-label="Next slide"
                  disabled={loading || !!error || tourAtLast}
                  onClick={goTourNextSlide}
                >
                  ›
                </button>
              </div>
            </div>
            <Link className="shared-tour-footer-exit" to={`/view/${shareToken}`}>
              Exit to map
            </Link>
          </footer>
          )}
        </div>
      ) : (
    <>
      {mapRevealReady && !error ? (
        <aside className="shared-tour-cv-logo-card shared-client-map-logo" aria-label="Community View">
          <CommunityViewLogoLink
            className="shared-cv-logo-link--tour-card"
            imageClassName="shared-cv-logo--tour-card"
          />
        </aside>
      ) : null}
      <div className="shared-map-chrome shared-map-chrome--panel shared-map-chrome--desktop-dock" aria-live="polite">
        <aside className="shared-left-dock">
          <div className="shared-left-nav" role="tablist" aria-label="Shared map navigation">
            <div className="shared-left-nav-brand">
              <div className="shared-left-nav-brand-title">
                {meta?.title || (loading ? 'Loading map' : 'Shared map')}
              </div>
            </div>
            <button
              type="button"
              className={`shared-left-nav-item ${activeTab === 'info' ? 'is-active' : ''}`}
              onClick={() => openClientMapTab('info')}
            >
              Map Information
            </button>
            <button
              type="button"
              className={`shared-left-nav-item ${activeTab === 'legend' ? 'is-active' : ''}`}
              onClick={() => openClientMapTab('legend')}
            >
              Map Legend
            </button>
            <button
              type="button"
              className={`shared-left-nav-item ${activeTab === 'gallery' ? 'is-active' : ''}`}
              onClick={() => openClientMapTab('gallery')}
            >
              Photo Gallery
            </button>
            <button
              type="button"
              className={`shared-left-nav-item ${activeTab === 'layers' ? 'is-active' : ''}`}
              onClick={() => openClientMapTab('layers')}
            >
              Layers
            </button>
            <button
              type="button"
              className={`shared-left-nav-item ${activeTab === 'tutorial' ? 'is-active' : ''}`}
              onClick={() => openClientMapTab('tutorial')}
            >
              View Tutorial
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
            {renderClientMapPanelContent()}
          </div>
        </aside>
      </div>

      <div className="shared-map-chrome shared-map-chrome--footer shared-map-chrome--mobile-footer" aria-live="polite">
        <aside className="shared-client-footer">
          <div className={`shared-client-footer-panel${panelOpen ? ' is-open' : ''}`}>
            <div className="shared-client-footer-panel-inner">{renderClientMapPanelContent()}</div>
          </div>
          <nav className="shared-client-footer-bar" role="tablist" aria-label="Shared map sections">
            {[
              { id: 'info', label: 'Info' },
              { id: 'legend', label: 'Legend' },
              { id: 'gallery', label: 'Photos' },
              { id: 'layers', label: 'Layers' },
              { id: 'tutorial', label: 'Tutorial' },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={activeTab === tab.id && panelOpen}
                className={`shared-client-footer-tab${activeTab === tab.id && panelOpen ? ' is-active' : ''}`}
                onClick={() => {
                  if (activeTab === tab.id && panelOpen) {
                    setPanelOpen(false);
                  } else {
                    setActiveTab(tab.id);
                    setPanelOpen(true);
                  }
                }}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        </aside>
      </div>
    </>
      )}

      {error ? (
        <div className="shared-map-chrome-error" role="alert">
          {error}
        </div>
      ) : null}

    </>
  );
}
