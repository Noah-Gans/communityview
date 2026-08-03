import React, { useEffect, useState, useRef, useMemo, useCallback } from 'react';
import mapboxgl from 'mapbox-gl';
import * as turf from '@turf/turf';
import area from '@turf/area';
import { flushSync } from 'react-dom';
import { Rnd } from 'react-rnd';
import 'mapbox-gl/dist/mapbox-gl.css';
import './Map.css';
import './print/Print.css';
import { useNavigate, useLocation } from 'react-router-dom'; // ✅ Import useLocation
import SidePanel from '../components/map/SidePanel';
import SharedPhotoFullscreen from '../components/map/SharedPhotoFullscreen';
import MapLoadingOverlay from '../components/loading/MapLoadingOverlay';
import ToolPanel from '../components/map/ToolPanel'; // Import ToolPanel
import { featureCollection } from '@turf/turf';
import {
  countyZoningColors,
  CONSERVATION_EASEMENTS_VECTOR_SOURCE_LAYER,
  getLayerStyle,
  getLabelLayerStyle,
  applyRegridParcelOutlineForBasemap,
  getSoilMapLayerId,
  getVectorSourceLayerForMapLayer,
  PUBLIC_LAND_VECTOR_SOURCE_LAYER,
  SOIL_FILL_PAINT,
  SOIL_STATE_CODES,
  soilMvtSourceLayerId,
  SURFACE_WATER_FLOWLINE_VECTOR_SOURCE_LAYER,
  SURFACE_WATER_VECTOR_SOURCE_LAYER,
  WETLANDS_VECTOR_SOURCE_LAYER,
} from '../components/map/mapStyles';
import { useMapContext } from './MapContext'; // Adjust path as needed
import { useUser } from "../contexts/UserContext";
import useMapboxDraw from "../hooks/useMapboxDraw";
import queryString from 'query-string';
import DraggableLegend from '../components/map/printShapes/DraggableLegend';
import DraggableNote from '../components/map/printShapes/DraggableNote';
import CompassElement from '../components/map/printShapes/CompassElement';
import RectangleElement from '../components/map/printShapes/RectangleElement';
import DiamondElement from '../components/map/printShapes/Diamond';
import TriangleElement from '../components/map/printShapes/Triangle';
import ShapeElement from '../components/map/printShapes/ShapeElement'
import { svgMap } from '../components/map/printShapes/svgMap';
import { getPointIconDefaultStyle } from './print/pointIconDefaultStyles';
import { legends } from '../assets/legends';
import { layerNameMappings } from '../components/map/layerMappings';
import MapReportBuilderBar from '../components/map/MapReportBuilderBar';
import { isNativeApp } from '../utils/platformDetection';
import {
  clearUserLocationOverlay,
  extractGeolocationCoords,
  getPreciseUserPosition,
  showUserLocationOverlay,
} from '../utils/preciseGeolocation';
import {
  getSavedMapLocation,
  getSavedRegionalFlyToOptions,
  markLocationPermissionDenied,
  resolveInitialMapView,
  saveMapLocationFromGeolocation,
  SAVED_LOCATION_ZOOM_NEAR,
  shouldFlyToSavedLocationOnRouteChange,
  computeRegionalZoom,
} from '../utils/savedMapLocation';
import { useTutorialWalkthrough } from '../contexts/TutorialWalkthroughContext';
import { Geolocation } from '@capacitor/geolocation';
import {
  POLYGON_VARIANT_STYLES,
  POLYLINE_VARIANT_STYLES,
  parsePrintPlacementTool,
} from './print/annotationModel';
import {
  segmentIndexTowardTip,
  arrowHeadPolygon,
  transmissionTickSegments,
} from './print/polylineDecorationUtils';
import PrintFeatureEditPanel from './print/PrintFeatureEditPanel';
import PrintMapLabel from '../components/map/printShapes/PrintMapLabel';
import { buildMapLabelDisplayText, labelUsesGeoOffset } from './print/mapLabelUtils';
import {
  getRegridParcelBoundaryCoordinates,
  mergeRegridParcelFeaturesPreferApi,
  isRegridParcelPolygonFeature,
} from '../utils/regridParcelBoundary';
import { fetchRegridParcelTileJson } from '../services/regridService';
import { fetchParcelGeoJsonFeatureByLlUuid } from '../utils/regridParcelApi';
import { getRegridVectorMinZoomForMap } from '../utils/regridParcelTileDensity';
import {
  featuresShareSelectionId,
  getHostedFeatureClickId,
  resolveHostedMapLayerFromFeature,
} from '../utils/hostedMapLayerConfig';
import {
  PRINT_GALLERY_DRAG_MIME,
  takePrintGalleryDragPayload,
} from '../utils/printGalleryDragBuffer';
import { getPhotoSrcListFromElement } from '../utils/mapPhotoStorage';
import { ensureTourEditRadiusLayersOnTop } from '../utils/tourBuilderMapLayers';
import {
  ensureTourVicinityNearbyLayersOnTop,
  focusPrintElementBirdEye,
  isPropertyBoundaryPrintElement,
  isPropertyTourVicinitySlideActive,
  isTourVicinityMapLayerId,
  rankPrintElementsWithPhotos,
} from '../utils/propertyTourSlides';
import { navigateToMarketingHome } from '../utils/marketingNavigation';
import { mapDebug } from '../utils/mapDebug';
import { safeMapResize } from '../utils/safeMapResize';
import { normalizePathname } from '../utils/mapBackedRoutes';

import {
  DEFAULT_BASEMAP_ID,
  getBasemapIdFromSearch,
  normalizeBasemapId,
  parseBasemapFromSearch,
  PERSISTENT_BASE_STYLE_ID,
  TUTORIAL_DEFAULT_VIEW,
} from './map/mapConstants';
import {
  applyCompositeLabelStyleForBasemap,
  ESRI_WORLD_IMAGERY_LAYER_ID,
  getFirstSymbolLayerId,
  getVectorLayerInsertBeforeId,
  hasVisibleManagedBasemapRaster,
  MANAGED_BASEMAP_RASTER_LAYER_IDS,
  needsBasemapOverlayMaintenance,
  restackDataLayersAboveBasemapOverlays,
  SATELLITE_STREETS_OVERLAY_LAYER_ID,
  SATELLITE_STREETS_OVERLAY_SOURCE_ID,
  stackRasterBasemapAboveBackground,
  STREETS_OVERLAY_LAYER_ID,
  STREETS_OVERLAY_SOURCE_ID,
  isTourImagery3DActive,
  verifyBasemapAppliedOnMap,
  waitUntilTourImagery3DActive,
} from './map/mapBasemapUtils';
import {
  featureBelongsToMapLayer,
  filterSelectionToVisibleLayers,
  getAllMapLayerToggleIds,
  getHostedTileLayerUrl,
  getMapLayerToggleIdForFeature,
  getQueryLayerIdsForTileLayer,
  DISABLED_TILE_LAYERS,
  isRasterHostedTileLayer,
  pickClickedFeature,
  rasterTileLayerZoom,
  reloadVectorSourceTileCaches,
  setTileLayerVisibility,
  tileLayerMapLayersPresent,
  vectorTileLayerZoom,
  addSoilStateLayers,
} from './map/mapHostedTileLayers';
import { isVectorPmtilesArchiveUrl } from './map/mapLayerShared';
import {
  getPrintPixelScale,
  isPrintParcelBoundaryPolygon,
  isPrintShapeIconPlacingTool,
  minSqDistanceToPolygonRingScreen,
  pointToSegmentDistanceSq,
} from './map/mapPrintHitTest';
import {
  addRegridParcelLayersFromTileJson,
  applyParcelVisualizationVisibility,
  applyRegridParcelSelectionHighlightPaint,
  bringRegridParcelLayersBeforeSymbolLabels,
  clearRegridParcelSelectionHighlight,
  CV_REGRID_RESTACK_EVENT,
  ensureRegridTileProxyUrl,
  fireRegridRestack,
  getCachedRegridTileJson,
  getRegridVectorSourceLayerId,
  isRegridParcelSelectionFeature,
  layerStatusLiveRef,
  parcelShowRegridLiveRef,
  rebuildRegridParcelStackForDensity,
  REGRID_PARCELS_SELECTION_FILL_ID,
  REGRID_PARCELS_SELECTION_LINE_ID,
  regridStyleBasemapRef,
  reloadTileSources,
  removeRegridParcelStack,
  repaintLayersTurnedOn,
  repaintRegridParcelsAfterShow,
  scheduleDeferredTileRefresh,
  schedulePostBasemapRegridRestack,
  setCachedRegridTileJson,
  setRegridParcelSelectionHighlight,
  syncOwnershipTileLayer,
  syncRegridParcelLayersIntoMap,
} from './map/regridParcelMapLayer';

mapboxgl.accessToken = String(process.env.REACT_APP_MAPBOX_ACCESS_TOKEN || '').trim();

// -----------------------------------------------------------------------------
// MapPage — standard layout:
//   1. Context & external hooks
//   2. Local state & refs
//   3. Derived values (useMemo)
//   4. Print / share callbacks
//   5. Regrid & layer effects
//   6. Map initialization
//   7. Layer sync (updateLayers)
//   8. Basemap handlers
//   9. Feature selection & highlight (click, hover)
//  10. Render
// -----------------------------------------------------------------------------

const MapPage = () => {

  // --- 1. Context & external hooks ---

  const {
    selectedFeature,
    setSelectedFeatures,
    layerStatus,
    setLayerStatus,
    GlobalActiveTab,
    setGlobalActiveTab,
    mapRef,
    applyTourPropertyBasemapRef,
    setMapRef,
    isGeoFilterActiveRef,
    isGeoFilterActive,
    setIsGeoFilterActive,
    isMapTriggeredFromSearch,
    setIsMapTriggeredFromSearch,
    focusFeatures,
    setFocusFeatures,
    hoveredFeatureId,
    layerOrder,
    setLayerOrder,
    isDrawingRef,
    suppressNextFeatureClickRef,
    drawRef,
    paperSize,
    isPrinting,
    showLegend,
    setShowLegend,
    updateNote,
    notes,
    deleteNote,
    activeTab,
    shapes,
    updateShape,
    deleteShape,
    printElements,
    updatePrintElement,
    deletePrintElement,
    layerLabels,
    toggleLayerLabels,
    clearLayerLabels,
    selectedPrintElement,
    setSelectedPrintElement,
    activePrintTool,
    setActivePrintTool,
    addPrintElementFromTool,
    setIsPrinting,
    propertyMapWizardActive,
    setPropertyMapWizardActive,
    propertyMapWizardIntent,
    setPropertyMapWizardIntent,
    clearPrintElements,
    shareViewerReadOnly,
    setShareViewerReadOnly,
    printLayoutMode,
    printLayoutRect,
    setPrintLayoutRect,
    currentBasemapId,
    setCurrentBasemapId,
    activeBasemapIdRef,
    pendingPrintBasemapRestoreRef,
    pendingCreateMapFromFeatureRef,
  } = useMapContext();
  const routerLocation = useLocation();
  const prevPathForShareRef = useRef(routerLocation.pathname);
  const { isActive: tourActive, currentStep: tourStep, stepIndex: tourStepIndex, mode: tourMode } =
    useTutorialWalkthrough();

  const isClientShareMapRoute =
    routerLocation.pathname.startsWith('/view/') ||
    routerLocation.pathname.startsWith('/tour/') ||
    routerLocation.pathname.startsWith('/amenities/');
  const isPropertyTourRoute = routerLocation.pathname.startsWith('/tour/');
  const isBasemapTutorialStep = tourActive && tourMode === 'map' && tourStep?.id === 'basemap-control';

  // --- 2. Local state & refs ---

  /** Synced from SharedMapViewPage (`property-tour-slide` event) for tour print overlay filtering. */
  const [propertyTourSlideId, setPropertyTourSlideId] = useState(null);
  const [propertyTourPrintFilterMode, setPropertyTourPrintFilterMode] = useState('all');
  const [propertyTourPrintElementIds, setPropertyTourPrintElementIds] = useState(null);
  const propertyTourSlideIdRef = useRef(null);

  /** On shared tour slides, filter which print elements render (all, whitelist, or boundary-only). */
  const shouldRenderPrintElementOnMap = useCallback(
    (element) => {
      if (!element || element.hiddenOnMap) return false;
      if (propertyTourPrintFilterMode === 'boundary-only') {
        return isPropertyBoundaryPrintElement(element);
      }
      if (propertyTourPrintFilterMode === 'whitelist' && Array.isArray(propertyTourPrintElementIds)) {
        return propertyTourPrintElementIds.includes(String(element.id));
      }
      return true;
    },
    [propertyTourPrintFilterMode, propertyTourPrintElementIds]
  );

  useEffect(() => {
    const onTourSlide = (e) => {
      const id = e.detail?.slideId ?? null;
      propertyTourSlideIdRef.current = id;
      setPropertyTourSlideId(id);
      setPropertyTourPrintFilterMode(e.detail?.printFilterMode || 'all');
      setPropertyTourPrintElementIds(
        Array.isArray(e.detail?.printElementIds) ? e.detail.printElementIds : null
      );
    };
    window.addEventListener('property-tour-slide', onTourSlide);
    return () => {
      window.removeEventListener('property-tour-slide', onTourSlide);
      propertyTourSlideIdRef.current = null;
      setPropertyTourSlideId(null);
      setPropertyTourPrintFilterMode('all');
      setPropertyTourPrintElementIds(null);
    };
  }, []);

  useEffect(() => {
    propertyTourSlideIdRef.current = propertyTourSlideId;
  }, [propertyTourSlideId]);

  useEffect(() => {
    const path = routerLocation.pathname || '';
    const shareLike =
      path.startsWith('/view/') ||
      path.startsWith('/tour/') ||
      path.startsWith('/amenities/');
    setShareViewerReadOnly(shareLike);
    const prev = prevPathForShareRef.current;
    const prevShareLike =
      prev.startsWith('/view/') ||
      prev.startsWith('/tour/') ||
      prev.startsWith('/amenities/');
    if (prevShareLike && !shareLike) {
      clearPrintElements();
      setSelectedPrintElement(null);
      setIsPrinting(false);
      setActivePrintTool('select');
    }
    prevPathForShareRef.current = path;
  }, [
    routerLocation.pathname,
    clearPrintElements,
    setSelectedPrintElement,
    setIsPrinting,
    setActivePrintTool,
    setShareViewerReadOnly,
  ]);
  const [isPanelOpen, setIsPanelOpen] = useState(true); // State for toggling the side panel
  const [printSharePanelVisible, setPrintSharePanelVisible] = useState(false);

  useEffect(() => {
    const onSharePanelVisible = (e) => {
      setPrintSharePanelVisible(!!e.detail?.visible);
    };
    window.addEventListener('print-share-panel-visible', onSharePanelVisible);
    return () => window.removeEventListener('print-share-panel-visible', onSharePanelVisible);
  }, []);

  /** Map maker: collapse side panel for parcel wizard, print share, or print layout options. */
  useEffect(() => {
    if (!isPrinting) {
      setIsPanelOpen(true);
      return;
    }
    if (printSharePanelVisible || printLayoutMode) {
      setIsPanelOpen(false);
      return;
    }
    setIsPanelOpen(!propertyMapWizardActive);
  }, [isPrinting, propertyMapWizardActive, printSharePanelVisible, printLayoutMode]);
  const [activeSidePanelTab, setActiveSidePanelTab] = useState('layers'); // Manage active tab state
  /** Print / map builder: hide Regrid parcel vectors without toggling Ownership in Layers. */
  const [printParcelsOverlayVisible, setPrintParcelsOverlayVisible] = useState(true);

  /** Click handler effect does not depend on isPrinting; use a ref for correct tab when selecting parcels. */
  const isPrintingRef = useRef(isPrinting);
  useEffect(() => {
    isPrintingRef.current = isPrinting;
  }, [isPrinting]);
  const propertyMapWizardActiveRef = useRef(propertyMapWizardActive);
  useEffect(() => {
    propertyMapWizardActiveRef.current = propertyMapWizardActive;
  }, [propertyMapWizardActive]);

  useEffect(() => {
    if (!tourActive || tourMode !== 'map' || !tourStep) return;
    const id = tourStep.id;
    if (id === 'side-info' || id === 'info-details') {
      setActiveSidePanelTab('info');
    }
    if (id === 'side-layers') {
      setActiveSidePanelTab('info');
    }
    if (id === 'public-land-layer') {
      setActiveSidePanelTab('layers');
    }
  }, [tourActive, tourMode, tourStep]);

  useEffect(() => {
    if (!tourActive || tourMode !== 'map' || tourStep?.id !== 'parcel-select') return;
    const selectedCount = Array.isArray(selectedFeature) ? selectedFeature.length : 0;
    if (selectedCount === 0) return;
    setIsPanelOpen(true);
    setActiveSidePanelTab('info');
  }, [tourActive, tourMode, tourStep, selectedFeature]);

  const [overlayRenderVersion, setOverlayRenderVersion] = useState(0);
  const forceOverlaySyncUntilRef = useRef(0);
  const tabHiddenAtRef = useRef(0);
  const shareViewerReadOnlyRef = useRef(shareViewerReadOnly);
  shareViewerReadOnlyRef.current = shareViewerReadOnly;
  const [polygonDraftPoints, setPolygonDraftPoints] = useState([]);
  const [polygonCursorPoint, setPolygonCursorPoint] = useState(null);
  const [polylineDraftPoints, setPolylineDraftPoints] = useState([]);
  const [polylineCursorPoint, setPolylineCursorPoint] = useState(null);
  const polygonDraftPointsRef = useRef([]);
  const polylineDraftPointsRef = useRef([]);
  const lastPlacementCommitRef = useRef({ tool: null, lng: null, lat: null, at: 0 });
  const [hoveredPrintElementId, setHoveredPrintElementId] = useState(null);
  const [sharePhotoPopupElementId, setSharePhotoPopupElementId] = useState(null);
  const [sharePhotoPopupFullscreen, setSharePhotoPopupFullscreen] = useState(false);
  const [sharePhotoPopupIndex, setSharePhotoPopupIndex] = useState(0);
  const [sharePhotoPopupAnchorTick, setSharePhotoPopupAnchorTick] = useState(0);
  /** Viewport (client) pixels for label preview while `showLabelOnMap` is off — fixed offset above cursor. */
  const [hoveredPrintCursorOverlayPx, setHoveredPrintCursorOverlayPx] = useState(null);
  /** Map-canvas px for ghost icon while placing a `shape_*` tool (matches click → unproject math). */
  const [printIconPlaceCursorPx, setPrintIconPlaceCursorPx] = useState(null);
  /** Declared early so print-overlay effects can depend on it (must be above any use of mapIsReady). */
  const [mapIsReady, setMapIsReady] = useState(false);
  const wasPrintingRef = useRef(false);

  /** True when the active print tool is a polygon variant (boundary, general, etc.). */
  const isPolygonPlacingTool = (t) => t && (t === 'polygon' || t.startsWith('polygon_'));

  /** True when the active print tool is a polyline variant or arrow. */
  const isPolylinePlacingTool = (t) => t && (t.startsWith('polyline_') || t === 'arrow');
  const overlayRenderRafRef = useRef(null);
  /** Pending `sourcedata` listeners while waiting to add owner name labels — cleared on toggle-off. */
  const labelSourceWaitHandlersRef = useRef(new Map());
  const layerLabelsRef = useRef(layerLabels);
  useEffect(() => {
    layerLabelsRef.current = layerLabels;
  }, [layerLabels]);

  useEffect(() => {
    polygonDraftPointsRef.current = polygonDraftPoints;
  }, [polygonDraftPoints]);

  useEffect(() => {
    polylineDraftPointsRef.current = polylineDraftPoints;
  }, [polylineDraftPoints]);

  // =============== Regrid Tileserver API Integration ===============
  useEffect(() => {
    // Only auto-switch once when entering print mode.
    if (isPrinting && !wasPrintingRef.current) {
      setActiveSidePanelTab('print');
    }
    // When leaving print mode, clear lingering print tab selection.
    if (!isPrinting && wasPrintingRef.current && activeSidePanelTab === 'print') {
      setActiveSidePanelTab('layers');
    }
    wasPrintingRef.current = isPrinting;
  }, [isPrinting, activeSidePanelTab]);

  /** Keep print “Parcels” toggle overlay flag aligned with ownership (except during parcel wizard). */
  useEffect(() => {
    if (!isPrinting || propertyMapWizardActive) return;
    setPrintParcelsOverlayVisible(Boolean(layerStatus.ownership));
  }, [isPrinting, layerStatus.ownership, propertyMapWizardActive]);

  useEffect(() => {
    if (!isPrinting || !mapIsReady || !mapRef?.current) return undefined;
    const map = mapRef.current;

    const shouldFlushOverlaySync = () =>
      shareViewerReadOnlyRef.current || Date.now() < forceOverlaySyncUntilRef.current;

    const bumpOverlayRender = () => {
      if (shouldFlushOverlaySync()) {
        flushSync(() => {
          setOverlayRenderVersion((prev) => prev + 1);
        });
        return;
      }
      setOverlayRenderVersion((prev) => prev + 1);
    };

    const handleOverlayRefreshRaf = () => {
      // Shared/tour: skip RAF coalescing — background tabs throttle rAF until gesture ends.
      if (shareViewerReadOnlyRef.current) {
        bumpOverlayRender();
        return;
      }
      if (overlayRenderRafRef.current) return;
      overlayRenderRafRef.current = window.requestAnimationFrame(() => {
        overlayRenderRafRef.current = null;
        bumpOverlayRender();
      });
    };

    const handleOverlayRefreshImmediate = () => bumpOverlayRender();

    const onMoveStart = () => {
      if (!tabHiddenAtRef.current) return;
      tabHiddenAtRef.current = 0;
      forceOverlaySyncUntilRef.current = Date.now() + 15000;
      bumpOverlayRender();
    };

    // "render" fires every map frame, which keeps geo overlays locked while
    // panning/zooming/rotating instead of jumping after interaction ends.
    map.on('render', handleOverlayRefreshRaf);
    map.on('movestart', onMoveStart);
    map.on('move', handleOverlayRefreshImmediate);
    map.on('zoom', handleOverlayRefreshImmediate);
    map.on('rotate', handleOverlayRefreshImmediate);
    map.on('pitch', handleOverlayRefreshImmediate);
    map.on('resize', handleOverlayRefreshImmediate);
    return () => {
      map.off('render', handleOverlayRefreshRaf);
      map.off('movestart', onMoveStart);
      map.off('move', handleOverlayRefreshImmediate);
      map.off('zoom', handleOverlayRefreshImmediate);
      map.off('rotate', handleOverlayRefreshImmediate);
      map.off('pitch', handleOverlayRefreshImmediate);
      map.off('resize', handleOverlayRefreshImmediate);
      if (overlayRenderRafRef.current) {
        window.cancelAnimationFrame(overlayRenderRafRef.current);
        overlayRenderRafRef.current = null;
      }
    };
  }, [isPrinting, mapIsReady, mapRef]);

  // Browser throttles RAF/timers while tab is hidden; force a quick resync on return.
  useEffect(() => {
    if (!isPrinting || !mapIsReady || !mapRef?.current) return undefined;
    const resumeTimeouts = [];
    const queue = (fn, ms) => {
      const id = window.setTimeout(fn, ms);
      resumeTimeouts.push(id);
    };

    const forceOverlayResync = () => {
      if (!mapRef?.current) return;
      tabHiddenAtRef.current = 0;
      forceOverlaySyncUntilRef.current = Date.now() + 30000;
      // Immediate sync first; delayed syncs catch post-visibility/layout settling.
      flushSync(() => {
        setOverlayRenderVersion((prev) => prev + 1);
      });
      safeMapResize(mapRef.current);
      try {
        if (typeof mapRef.current.triggerRepaint === 'function') {
          mapRef.current.triggerRepaint();
        }
      } catch (_) {
        /* ignore */
      }
      // Multi-pass bump handles cases where browser resumes timers/layout in phases.
      window.requestAnimationFrame(() => {
        setOverlayRenderVersion((prev) => prev + 1);
        window.requestAnimationFrame(() => {
          setOverlayRenderVersion((prev) => prev + 1);
        });
      });
      queue(() => {
        if (!mapRef?.current) return;
        safeMapResize(mapRef.current);
        mapRef.current.triggerRepaint?.();
        setOverlayRenderVersion((prev) => prev + 1);
      }, 80);
      queue(() => {
        if (!mapRef?.current) return;
        safeMapResize(mapRef.current);
        mapRef.current.triggerRepaint?.();
        setOverlayRenderVersion((prev) => prev + 1);
      }, 240);
      queue(() => {
        if (!mapRef?.current) return;
        mapRef.current.triggerRepaint?.();
        setOverlayRenderVersion((prev) => prev + 1);
      }, 600);
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        tabHiddenAtRef.current = Date.now();
        return;
      }
      forceOverlayResync();
    };
    const onWindowFocus = () => forceOverlayResync();
    const onPageShow = () => forceOverlayResync();

    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('focus', onWindowFocus);
    window.addEventListener('pageshow', onPageShow);
    return () => {
      resumeTimeouts.forEach((id) => window.clearTimeout(id));
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('focus', onWindowFocus);
      window.removeEventListener('pageshow', onPageShow);
    };
  }, [isPrinting, mapIsReady, mapRef]);

  useEffect(() => {
    if (!isPrinting) setPrintIconPlaceCursorPx(null);
  }, [isPrinting]);

  useEffect(() => {
    if (!isPrinting) return undefined;
    const onKeyDown = (event) => {
      if (!(event.key === 'Delete' || event.key === 'Backspace')) return;
      if (!selectedPrintElement?.id) return;
      const tag = document.activeElement?.tagName?.toLowerCase();
      const isTyping =
        tag === 'input' ||
        tag === 'textarea' ||
        document.activeElement?.isContentEditable;
      if (isTyping) return;
      event.preventDefault();
      deletePrintElement(selectedPrintElement.id);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isPrinting, selectedPrintElement, deletePrintElement]);

  useEffect(() => {
    if (!isPolygonPlacingTool(activePrintTool)) {
      setPolygonDraftPoints([]);
      setPolygonCursorPoint(null);
    }
    if (!isPolylinePlacingTool(activePrintTool)) {
      setPolylineDraftPoints([]);
      setPolylineCursorPoint(null);
    }
    if (!isPrintShapeIconPlacingTool(activePrintTool)) {
      setPrintIconPlaceCursorPx(null);
    }
  }, [activePrintTool]);

  useEffect(() => {
    if (!isPrinting || !mapRef.current) return undefined;
    if (!isPolygonPlacingTool(activePrintTool) && !isPolylinePlacingTool(activePrintTool)) return undefined;

    mapRef.current.doubleClickZoom.disable();
    return () => {
      if (mapRef.current) {
        mapRef.current.doubleClickZoom.enable();
      }
    };
  }, [isPrinting, activePrintTool, mapRef]);

  /** Project a GeoJSON point to map-canvas pixel coordinates. */
  const projectPoint = (geometry) => {
    if (!geometry || geometry.type !== 'Point' || !mapRef.current) return null;
    const [lng, lat] = geometry.coordinates;
    const p = mapRef.current.project([lng, lat]);
    return { x: p.x, y: p.y };
  };


  /** Attach screen x/y and projected rings for rendering a print element on the map overlay. */
  const withGeoProjectedFrame = (element) => {
    if (!element?.geometry || !mapRef.current) return element;
    if (element.geometry.type === 'Point') {
      const p = projectPoint(element.geometry);
      if (!p) return element;
      const s = getPrintPixelScale(mapRef.current);
      const w = element.width || 80;
      const h = element.height || 80;
      const sw = w * s;
      const sh = h * s;
      return {
        ...element,
        x: p.x - sw / 2,
        y: p.y - sh / 2,
        screenWidth: sw,
        screenHeight: sh,
        printZoomScale: s,
      };
    }
    if (element.geometry.type === 'LineString') {
      const coords = element.geometry.coordinates;
      if (!Array.isArray(coords) || coords.length < 2) return element;
      const projectedLinePoints = coords.map((c) => {
        const pt = mapRef.current.project(c);
        return [pt.x, pt.y];
      });
      return {
        ...element,
        projectedLinePoints,
      };
    }
    if (element.geometry.type === 'Polygon') {
      const ring = element.geometry.coordinates?.[0];
      if (!Array.isArray(ring) || ring.length < 3) return element;
      const points = ring.map((coord) => mapRef.current.project(coord));
      return {
        ...element,
        projectedPolygonPoints: points.map((p) => [p.x, p.y]),
      };
    }
    return element;
  };


  /** After dragging a point icon on the overlay, write the new lng/lat back into geometry. */
  const syncProjectedEditToGeo = (nextElement) => {
    if (!nextElement || !mapRef.current) return nextElement;

    if (nextElement.geometry?.type === 'Point') {
      const dw = nextElement.screenWidth ?? nextElement.width ?? 80;
      const dh = nextElement.screenHeight ?? nextElement.height ?? 80;
      const centerX = (nextElement.x || 0) + dw / 2;
      const centerY = (nextElement.y || 0) + dh / 2;
      const lngLat = mapRef.current.unproject([centerX, centerY]);
      return {
        ...nextElement,
        geometry: {
          type: 'Point',
          coordinates: [lngLat.lng, lngLat.lat],
        },
      };
    }

    return nextElement;
  };


  /** Stroke/fill style for the in-progress polygon the user is placing. */
  const getPolygonDraftStyle = () => {
    const parsed = parsePrintPlacementTool(activePrintTool);
    const style = POLYGON_VARIANT_STYLES[parsed.variant] || POLYGON_VARIANT_STYLES.general;
    return style;
  };


  /** Stroke/arrow style for the in-progress line the user is placing. */
  const getPolylineDraftStyle = () => {
    if (activePrintTool === 'arrow') {
      return {
        stroke: '#d97706',
        strokeWidth: 3.5,
        lineDasharray: null,
        arrowHead: 'end',
        transmissionTicks: false,
        strokeLinecap: 'round',
      };
    }
    const parsed = parsePrintPlacementTool(activePrintTool);
    const style = POLYLINE_VARIANT_STYLES[parsed.variant] || POLYLINE_VARIANT_STYLES.stream;
    return {
      stroke: style.stroke,
      strokeWidth: style.strokeWidth,
      strokeOpacity: style.strokeOpacity ?? 1,
      lineDasharray: style.lineDasharray ?? null,
      arrowHead: style.arrowHead || 'none',
      transmissionTicks: !!style.transmissionTicks,
      strokeLinecap: style.strokeLinecap || 'round',
      ...(style.roadMarkingStroke
        ? {
            roadMarkingStroke: style.roadMarkingStroke,
            roadMarkingWidth: style.roadMarkingWidth,
            roadMarkingDasharray: style.roadMarkingDasharray,
            roadMarkingLinecap: style.roadMarkingLinecap || 'round',
          }
        : {}),
      ...(style.fenceOutlineStroke
        ? {
            fenceOutlineStroke: style.fenceOutlineStroke,
            fenceOutlineWidth: style.fenceOutlineWidth,
            fenceOutlineOpacity: style.fenceOutlineOpacity,
          }
        : {}),
    };
  };


  /** Area (m²) and perimeter (m) for a closed polygon from lng/lat vertices. */
  const getMetricsForPolygonLngLat = (lngLatPoints) => {
    if (!Array.isArray(lngLatPoints) || lngLatPoints.length < 3) return null;
    const ring = lngLatPoints.map((p) => [p.lng, p.lat]);
    const closed = [...ring, ring[0]];
    const polygonFeature = turf.polygon([closed]);
    const areaSqMeters = turf.area(polygonFeature);
    const perimeterMeters = turf.length(turf.lineString(closed), { units: 'kilometers' }) * 1000;
    return { areaSqMeters, perimeterMeters };
  };


  /** Total length (m) for a line from lng/lat vertices. */
  const getMetricsForLineLngLat = (lngLatPoints) => {
    if (!Array.isArray(lngLatPoints) || lngLatPoints.length < 2) return null;
    const coords = lngLatPoints.map((p) => [p.lng, p.lat]);
    const lengthMeters = turf.length(turf.lineString(coords), { units: 'kilometers' }) * 1000;
    return { lengthMeters };
  };


  /** Clicked Regrid parcel → fetch boundary if needed → add a Property Boundary print polygon. */
  const handleCreateBoundaryFromRegridParcel = async (feature) => {
    let geomFeature = feature;
    const ll = feature?.properties?.ll_uuid;
    if (ll) {
      const apiFeat = await fetchParcelGeoJsonFeatureByLlUuid(ll);
      if (apiFeat?.geometry) {
        geomFeature = { ...feature, geometry: apiFeat.geometry };
      }
    }
    const coords = getRegridParcelBoundaryCoordinates(geomFeature);
    if (!coords || coords.length < 3) return;
    if (!isPrinting) setIsPrinting(true);
    const metrics = getMetricsForPolygonLngLat(coords);
    const center = {
      lng: coords.reduce((s, c) => s + c.lng, 0) / coords.length,
      lat: coords.reduce((s, c) => s + c.lat, 0) / coords.length,
    };
    addPrintElementFromTool(
      'polygon_boundary',
      {
        coordinates: coords,
        metrics,
        label: 'Property Boundary',
        style: { fill: 'rgba(0, 0, 0, 0)', fillOpacity: 0 },
      },
      center
    );
    setActivePrintTool('select');
    setActiveSidePanelTab('print');
  };

  const pendingCreateMapHandledRef = useRef(false);

  useEffect(() => {
    if (!isPrinting) {
      pendingCreateMapHandledRef.current = false;
      return undefined;
    }
    if (pendingCreateMapHandledRef.current) return undefined;
    const pending = pendingCreateMapFromFeatureRef?.current;
    if (!pending) return undefined;

    pendingCreateMapHandledRef.current = true;
    pendingCreateMapFromFeatureRef.current = null;
    void handleCreateBoundaryFromRegridParcel(pending);

    return undefined;
  }, [isPrinting, pendingCreateMapFromFeatureRef]);

  /** Feature-geometry anchor for map labels (WGS84), independent of current zoom. */
  const getElementAnchorLngLat = (element) => {
    if (!element?.geometry) return null;
    const g = element.geometry;
    if (g.type === 'Point') {
      const [lng, lat] = g.coordinates || [];
      if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
      return { lng, lat };
    }
    if (g.type === 'LineString') {
      const coords = g.coordinates || [];
      if (!coords.length) return null;
      const mid = coords[Math.floor(coords.length / 2)];
      const [lng, lat] = mid;
      if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
      return { lng, lat };
    }
    if (g.type === 'Polygon') {
      const ring = g.coordinates?.[0];
      if (!ring?.length || ring.length < 4) return null;
      try {
        const poly = turf.polygon([ring]);
        const c = turf.centerOfMass(poly);
        const [lng, lat] = c.geometry.coordinates;
        if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
        return { lng, lat };
      } catch (_) {
        /* fall through */
      }
      const closed =
        ring.length > 1 &&
        ring[0][0] === ring[ring.length - 1][0] &&
        ring[0][1] === ring[ring.length - 1][1];
      const open = closed ? ring.slice(0, -1) : ring;
      if (open.length < 3) return null;
      const centroid = open.reduce(
        (acc, [lng, lat]) => ({ lng: acc.lng + lng, lat: acc.lat + lat }),
        { lng: 0, lat: 0 }
      );
      const lng = centroid.lng / open.length;
      const lat = centroid.lat / open.length;
      if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
      return { lng, lat };
    }
    return null;
  };

  /** Mapbox `project` / `e.point` are pixels in the map canvas space; `#notes-overlay` sits in `.map-geo-print-stack` over `#map` and uses the same coordinates. */
  const getElementAnchorScreenPosition = (element) => {
    if (!mapRef.current) return null;
    const ll = getElementAnchorLngLat(element);
    if (!ll) return null;
    const local = mapRef.current.project([ll.lng, ll.lat]);
    if (!local || !Number.isFinite(local.x) || !Number.isFinite(local.y)) return null;
    return local;
  };


  /** Photo URLs attached to a print shape element. */
  const getElementPhotoGallery = useCallback((element) => getPhotoSrcListFromElement(element), []);


  /** True for a point shape that has at least one photo in its gallery. */
  const isPhotoPointElement = useCallback(
    (element) =>
      !!element &&
      element.type === 'shape' &&
      element.geometry?.type === 'Point' &&
      getElementPhotoGallery(element).length > 0,
    [getElementPhotoGallery]
  );

  const currentSharePhotoElement = useMemo(
    () => printElements.find((el) => el.id === sharePhotoPopupElementId) || null,
    [printElements, sharePhotoPopupElementId]
  );
  const currentSharePhotoGallery = useMemo(
    () => getElementPhotoGallery(currentSharePhotoElement),
    [currentSharePhotoElement, getElementPhotoGallery]
  );

  /** Same ranking as the step-4 tour: home → garage → … for prev/next “place” navigation. */
  const shareViewerPhotoRanked = useMemo(
    () => rankPrintElementsWithPhotos(printElements),
    [printElements]
  );

  const currentSharePhotoCardStyle = useMemo(() => {
    if (!shareViewerReadOnly || !currentSharePhotoElement || !mapRef.current) return undefined;
    const anchor = getElementAnchorScreenPosition(currentSharePhotoElement);
    if (!anchor) return undefined;
    const rect = mapRef.current.getContainer?.().getBoundingClientRect?.();
    if (!rect) return undefined;
    const viewportX = rect.left + anchor.x;
    const viewportY = rect.top + anchor.y;
    return {
      left: `${Math.round(viewportX)}px`,
      top: `${Math.round(viewportY - 18)}px`,
    };
  }, [shareViewerReadOnly, currentSharePhotoElement, mapRef, sharePhotoPopupAnchorTick]);

  useEffect(() => {
    if (!currentSharePhotoGallery.length) {
      setSharePhotoPopupElementId(null);
      setSharePhotoPopupFullscreen(false);
      setSharePhotoPopupIndex(0);
      return;
    }
    setSharePhotoPopupIndex((prev) =>
      Math.max(0, Math.min(prev, currentSharePhotoGallery.length - 1))
    );
  }, [currentSharePhotoGallery]);


  /** Close the floating photo card on shared/tour map views. */
  const closeSharePhotoPopup = useCallback(() => {
    setSharePhotoPopupFullscreen(false);
    setSharePhotoPopupElementId(null);
    setSharePhotoPopupIndex(0);
  }, []);


  /** Prev/next photo within the same print element's gallery. */
  const stepSharePhotoPopup = useCallback(
    (delta) => {
      if (!currentSharePhotoGallery.length) return;
      setSharePhotoPopupIndex((prev) => {
        const len = currentSharePhotoGallery.length;
        return (prev + delta + len) % len;
      });
    },
    [currentSharePhotoGallery.length]
  );


  /** Prev/next photo point across ranked tour stops; flies the map to each place. */
  const stepSharePhotoFeature = useCallback(
    (delta) => {
      if (!shareViewerPhotoRanked || shareViewerPhotoRanked.length <= 1) return;
      const ids = shareViewerPhotoRanked.map((r) => r.element?.id).filter(Boolean);
      if (!ids.length) return;
      let idx = ids.findIndex((id) => String(id) === String(sharePhotoPopupElementId));
      if (idx < 0) idx = 0;
      const nextIdx = (idx + delta + ids.length) % ids.length;
      const nextEl = shareViewerPhotoRanked[nextIdx]?.element;
      if (!nextEl?.id) return;
      setSharePhotoPopupElementId(String(nextEl.id));
      setSharePhotoPopupIndex(0);
      setSharePhotoPopupAnchorTick((v) => (v + 1) % 100000);
      const map = mapRef.current;
      if (map) focusPrintElementBirdEye(map, nextEl);
    },
    [shareViewerPhotoRanked, sharePhotoPopupElementId, mapRef]
  );

  useEffect(() => {
    if (!shareViewerReadOnly || !sharePhotoPopupElementId || !mapRef.current) return undefined;
    const map = mapRef.current;
    const bump = () => setSharePhotoPopupAnchorTick((v) => (v + 1) % 100000);
    map.on('move', bump);
    map.on('zoom', bump);
    map.on('rotate', bump);
    map.on('pitch', bump);
    return () => {
      map.off('move', bump);
      map.off('zoom', bump);
      map.off('rotate', bump);
      map.off('pitch', bump);
    };
  }, [shareViewerReadOnly, sharePhotoPopupElementId, mapRef]);

  useEffect(() => {
    if (!shareViewerReadOnly) return undefined;
    const onSharedPhotoOpen = (evt) => {
      const elementId = evt?.detail?.elementId;
      const index = Number(evt?.detail?.index ?? 0);
      if (!elementId) return;
      setSharePhotoPopupElementId(String(elementId));
      setSharePhotoPopupFullscreen(false);
      setSharePhotoPopupIndex(Number.isFinite(index) ? Math.max(0, index) : 0);
      setSharePhotoPopupAnchorTick((v) => (v + 1) % 100000);
    };
    const onSharedPhotoClose = () => {
      closeSharePhotoPopup();
    };
    window.addEventListener('shared-photo-open', onSharedPhotoOpen);
    window.addEventListener('shared-photo-close', onSharedPhotoClose);
    return () => {
      window.removeEventListener('shared-photo-open', onSharedPhotoOpen);
      window.removeEventListener('shared-photo-close', onSharedPhotoClose);
    };
  }, [shareViewerReadOnly, closeSharePhotoPopup]);

  // --- 4. Print / share callbacks ---

  /** Hit-test print elements at map-canvas pixels (topmost wins). Used for select tool. */
  const pickPrintElementAtScreen = useCallback(
    (px, py) => {
      if (!mapRef.current || !isPrinting) return null;
      const map = mapRef.current;
      const lngLat = map.unproject([px, py]);
      const clickPt = turf.point([lngLat.lng, lngLat.lat]);
      for (let i = printElements.length - 1; i >= 0; i--) {
        const el = printElements[i];
        if (el?.hiddenOnMap) continue;
        if (!el?.geometry) continue;
        const g = el.geometry;
        if (g.type === 'Point') {
          const pr = withGeoProjectedFrame(el);
          const w = pr.screenWidth ?? pr.width ?? 80;
          const h = pr.screenHeight ?? pr.height ?? 80;
          if (px >= pr.x && px <= pr.x + w && py >= pr.y && py <= pr.y + h) return el;
        }
        if (g.type === 'Polygon' && g.coordinates?.[0]?.length) {
          const ring = g.coordinates[0];
          if (ring.length < 4) continue;
          try {
            if (isPrintParcelBoundaryPolygon(el)) {
              const sw = el.strokeWidth ?? 6;
              const thresh = Math.max(16, sw * 2.25);
              const threshSq = thresh * thresh;
              if (minSqDistanceToPolygonRingScreen(map, ring, px, py) <= threshSq) return el;
            } else {
              const poly = turf.polygon([ring]);
              if (turf.booleanPointInPolygon(clickPt, poly)) return el;
            }
          } catch (_) {
            /* invalid ring */
          }
        }
        if (g.type === 'LineString' && Array.isArray(g.coordinates) && g.coordinates.length >= 2) {
          let minSq = Infinity;
          for (let j = 0; j < g.coordinates.length - 1; j++) {
            const a = map.project(g.coordinates[j]);
            const b = map.project(g.coordinates[j + 1]);
            minSq = Math.min(
              minSq,
              pointToSegmentDistanceSq(px, py, a.x, a.y, b.x, b.y)
            );
          }
          if (minSq <= 14 * 14) return el;
        }
      }
      return null;
    },
    [printElements, isPrinting]
  );


  /** Fit map bounds or fly to center for a print element's geometry. */
  const zoomToPrintElement = useCallback((element) => {
    const map = mapRef.current;
    if (!map || !element?.geometry) return;
    const g = element.geometry;
    try {
      if (g.type === 'Polygon' && g.coordinates?.[0]?.length >= 4) {
        const bbox = turf.bbox(turf.polygon(g.coordinates));
        map.fitBounds(
          [
            [bbox[0], bbox[1]],
            [bbox[2], bbox[3]],
          ],
          { padding: 80, duration: 700, maxZoom: 18 }
        );
        return;
      }
      if (g.type === 'LineString' && g.coordinates?.length >= 2) {
        const bbox = turf.bbox(turf.lineString(g.coordinates));
        map.fitBounds(
          [
            [bbox[0], bbox[1]],
            [bbox[2], bbox[3]],
          ],
          { padding: 80, duration: 700, maxZoom: 18 }
        );
        return;
      }
      if (g.type === 'Point' && g.coordinates) {
        const [lng, lat] = g.coordinates;
        if (Number.isFinite(lng) && Number.isFinite(lat)) {
          map.flyTo({
            center: [lng, lat],
            zoom: Math.max(map.getZoom(), 16),
            duration: 600,
          });
        }
      }
    } catch (_) {
      /* ignore invalid geometry */
    }
  }, []);


  /** Allow dropping a gallery photo onto the map while in print mode. */
  const handlePrintMapDragOver = useCallback(
    (e) => {
      if (!isPrinting) return;
      if (!e.dataTransfer?.types?.includes(PRINT_GALLERY_DRAG_MIME)) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
    },
    [isPrinting]
  );


  /** Drop a gallery photo onto the map → create a photo point print element. */
  const handlePrintMapDrop = useCallback(
    (e) => {
      if (!isPrinting || !mapRef.current) return;
      const id = e.dataTransfer?.getData(PRINT_GALLERY_DRAG_MIME);
      const photoEntry = takePrintGalleryDragPayload(id);
      if (!photoEntry?.url) return;
      e.preventDefault();
      const map = mapRef.current;
      const rect = map.getCanvas().getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const lngLat = map.unproject([x, y]);
      addPrintElementFromTool(
        'shape_camera',
        { photoGallery: [photoEntry], label: 'Photo point' },
        { lng: lngLat.lng, lat: lngLat.lat }
      );
      setActivePrintTool('select');
    },
    [isPrinting, addPrintElementFromTool, setActivePrintTool]
  );

  /**
   * Sets up Regrid parcel tiles using the tileserver API
   * Uses vector tiles (MVT format) for better performance and automatic viewport coverage
   */
  const setupRegridTiles = useCallback(async () => {
    const map = mapRef.current;
    if (!map) return;

    try {
      let tileJson = getCachedRegridTileJson();
      if (!tileJson) {
        tileJson = await fetchRegridParcelTileJson();
        setCachedRegridTileJson(tileJson);
      }

      const vectorMinZoom = getRegridVectorMinZoomForMap(map);
      addRegridParcelLayersFromTileJson(map, tileJson, vectorMinZoom);
      if (map.getSource('regrid-parcels')) {
      }
    } catch (error) {
      console.error('Error setting up Regrid tiles:', error);
    }
  }, [mapRef]);

  const [regridTileJsonVersion, setRegridTileJsonVersion] = useState(0);


  /** Whether Regrid parcel vectors should render (ownership on, print overlay, wizard). */
  const parcelMapVisibility = useMemo(() => {
    const printHidesParcels =
      isPrinting && !printParcelsOverlayVisible && !propertyMapWizardActive;
    const own = Boolean(layerStatus.ownership);
    const wiz = propertyMapWizardActive;
    return {
      showRegrid: (own || wiz) && !printHidesParcels,
    };
  }, [isPrinting, printParcelsOverlayVisible, propertyMapWizardActive, layerStatus.ownership]);

  /** Latest visibility for async `style.load` / `idle` basemap callbacks (avoids stale closures). */
  const parcelMapVisibilityRef = useRef(parcelMapVisibility);
  parcelMapVisibilityRef.current = parcelMapVisibility;
  const prevLayerStatusForRepaintRef = useRef(null);
  const layerStatusRef = useRef(layerStatus);
  layerStatusRef.current = layerStatus;
  layerStatusLiveRef.current = layerStatus;
  /** Wizard shows Regrid with ownership off in layerStatus — still allow parcel highlight/selection. */
  const resolveLayerStatusForSelection = (status) => {
    const base = status ?? layerStatusRef.current ?? {};
    if (propertyMapWizardActiveRef.current) {
      return { ...base, ownership: true };
    }
    return base;
  };
  parcelShowRegridLiveRef.current = Boolean(parcelMapVisibility.showRegrid);
  /**
   * Regrid restacks move layers relative to basemap rasters — repaired after ownership sync
   * (hosted layers use `getVectorLayerInsertBeforeId` inside `updateLayers` instead).
   */
  const maintainBasemapStackRef = useRef(() => {});
  const applyLabelLayersRef = useRef(() => {});
  const hideLabelLayerSafeRef = useRef(() => {});

  /** Prefetch TileJSON so `updateLayers` can add Regrid synchronously with hosted PMTiles layers. */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (getCachedRegridTileJson()) {
        if (!cancelled) setRegridTileJsonVersion((v) => v + 1);
        return;
      }
      try {
        const tileJson = await fetchRegridParcelTileJson();
        if (cancelled) return;
        setCachedRegridTileJson(tileJson);
        setRegridTileJsonVersion((v) => v + 1);
      } catch (e) {
        console.error('Regrid TileJSON prefetch failed:', e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  /** Rebuild parcel MVT when map center crosses sparse ↔ dense geofences (minzoom 11 vs 13). */
  useEffect(() => {
    if (!mapIsReady || !mapRef?.current) return undefined;
    const map = mapRef.current;
    let debounceId;
    const onViewSettled = () => {
      if (!parcelMapVisibilityRef.current?.showRegrid) return;
      window.clearTimeout(debounceId);
      debounceId = window.setTimeout(() => {
        enrichSelectionFromRenderedOwnershipTilesRef.current();
        reapplySelectionHighlightIfNeededRef.current();
      }, 350);
    };
    map.on('moveend', onViewSettled);
    map.on('zoomend', onViewSettled);
    return () => {
      window.clearTimeout(debounceId);
      try {
        map.off('moveend', onViewSettled);
        map.off('zoomend', onViewSettled);
      } catch (_) {
        /* ignore */
      }
    };
  }, [mapIsReady, regridTileJsonVersion]);

  /**
   * Mobile emulation / rotation changes layout without remounting the map — resize + restack
   * Regrid MVT (ownership lines) so tiles repaint and outlines stay above data fills.
   */
  useEffect(() => {
    if (!mapIsReady || !mapRef?.current) return undefined;
    let debounceId;
    const handleViewportChange = () => {
      const nextMobile = window.innerWidth <= 768;
      setIsMobileViewport((prev) => (prev === nextMobile ? prev : nextMobile));
      window.clearTimeout(debounceId);
      debounceId = window.setTimeout(() => {
        const map = mapRef.current;
        if (!map?.isStyleLoaded?.()) return;
        safeMapResize(map);
        if (!parcelMapVisibilityRef.current?.showRegrid) return;
        syncOwnershipTileLayer(map, parcelMapVisibilityRef.current);
        bringRegridParcelLayersBeforeSymbolLabels(map);
        fireRegridRestack(map);
        repaintRegridParcelsAfterShow(map);
      }, 120);
    };
    window.addEventListener('resize', handleViewportChange);
    return () => {
      window.clearTimeout(debounceId);
      window.removeEventListener('resize', handleViewportChange);
    };
  }, [mapIsReady, mapRef]);

  const navigate = useNavigate(); // Define navigate here
  const { subscriptionStatus, role, highlightSettings, user } = useUser(); // or subscriptionStatus & user
  
  // 🔍 DEBUG: Monitor highlightSettings changes
  useEffect(() => {
    
    // 🔍 Update the ref with current values
    highlightSettingsRef.current = highlightSettings;
  }, [highlightSettings]);
  
  const [topLayer, setTopLayer] = useState(null);
  const [isMapLoading, setIsMapLoading] = useState(true); // Map loading state
  const [isLocatingUser, setIsLocatingUser] = useState(false);
  const prevPathForSavedLocationRef = useRef(null);
  const highlightLayerId = 'highlight-layer'; // legacy dynamic ids — cleaned up on remove
  const SELECTION_HIGHLIGHT_SOURCE_ID = 'cv-map-selection-highlight';
  const SELECTION_HIGHLIGHT_FILL_ID = 'cv-map-selection-highlight-fill';
  const SELECTION_HIGHLIGHT_LINE_ID = 'cv-map-selection-highlight-line';
  const EMPTY_FEATURE_COLLECTION = { type: 'FeatureCollection', features: [] };
  const highlightRenderTimeoutRef = useRef(null);
  /** GeoJSON snapshot of the last successful highlight — survives pan/zoom re-query gaps. */
  const selectionHighlightSnapshotRef = useRef(null);
  const selectionHighlightSettleGenRef = useRef(0);
  const deferSelectionHighlightUntilSettledRef = useRef(() => {});
  const repaintSelectionHighlightRef = useRef(() => {});
  const selectedFeatureRef = useRef([]);
  selectedFeatureRef.current = selectedFeature;
  const highlightFeatureRef = useRef(() => {});
  const reapplySelectionHighlightIfNeededRef = useRef(() => {});
  const [selectedFilterPolygon, setSelectedFilterPolygon] = useState(null);
  const baseMapRef = useRef(DEFAULT_BASEMAP_ID);
  const currentStyleUrlRef = useRef(null);
  const [is3DEnabled, setIs3DEnabled] = useState(false);
  const is3DEnabledRef = useRef(false);
  const [isContoursEnabled, setIsContoursEnabled] = useState(false);

  // 🔍 Store current highlightSettings in a ref to access from callbacks
  const highlightSettingsRef = useRef(highlightSettings);
  const [basemap, setBasemap] = useState(DEFAULT_BASEMAP_ID);
  const readHighlightIdsFromLocation = useCallback((search) => {
    const params = queryString.parse(search || window.location.search || '');
    if (!params.highlights) return null;
    return String(params.highlights)
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean);
  }, []);

  const buildHighlightIdSet = useCallback((ids) => {
    const idSet = new Set();
    (ids || []).forEach((raw) => {
      const id = String(raw).trim();
      if (!id) return;
      idSet.add(id);
      idSet.add(id.replace(/^regrid:/i, ''));
    });
    return idSet;
  }, []);

  const LL_UUID_RE =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  const DEFAULT_HIGHLIGHT_SETTINGS = {
    fillColor: 'rgba(255, 0, 0, 0.25)',
    fillOpacity: 1,
    fillOutlineColor: '#FF0000',
    lineColor: '#FF0000',
    lineWidth: 3,
  };

  const highlightSettingsReadyForPaint = useCallback(() => {
    if (highlightSettingsRef.current || highlightSettings) return true;
    return !user;
  }, [highlightSettings, user]);

  const resolveHighlightSettingsForPaint = useCallback(() => {
    return highlightSettingsRef.current || highlightSettings || DEFAULT_HIGHLIGHT_SETTINGS;
  }, [highlightSettings]);

  const isRegridHighlightId = useCallback((id) => {
    const bare = String(id || '').replace(/^regrid:/i, '');
    return LL_UUID_RE.test(bare);
  }, []);

  const pendingHighlightsAreRegridOnly = useCallback(
    (ids) => (ids || []).length > 0 && ids.every((id) => isRegridHighlightId(id)),
    [isRegridHighlightId]
  );

  const clearPendingHighlightRestore = useCallback(() => {
    pendingHighlightIdsRef.current = null;
    setInitialHighlightIds(null);
  }, []);

  const canRestoreRegridHighlights = useCallback(() => {
    return Boolean(layerStatus.ownership) || propertyMapWizardActive;
  }, [layerStatus.ownership, propertyMapWizardActive]);

  const [initialHighlightIds, setInitialHighlightIds] = useState(() =>
    readHighlightIdsFromLocation(window.location.search)
  );
  const pendingHighlightIdsRef = useRef(readHighlightIdsFromLocation(window.location.search));
  const restoreHighlightsFromUrlRef = useRef(() => false);
  const upsertSelectionHighlightRef = useRef(() => {});
  /** Last basemap fully applied on the map (layers + ref), not just requested in context. */
  const lastAppliedBasemapRef = useRef(null);
  /** While applying a saved basemap, suppress URL writes that would write stale outdoors-v12. */
  const restoringPrintBasemapRef = useRef(false);
  /** Latest ensureImagery impl (map init effect mounts before function defs — use ref). */
  const ensureImageryBasemapRef = useRef(() => {});
  /** Lightweight overlay fix — no setStyle (avoids flipping to Discover on zoom/layer churn). */
  const repairBasemapOverlaysRef = useRef(() => false);
  /** One full applyBasemapById on first ready; after that only repair overlays. */
  const needsInitialBasemapApplyRef = useRef(true);
  /** Basemap id from URL at map init — authoritative until first verified apply. */
  const urlBasemapIdRef = useRef(null);
  /** False until the live map stack matches urlBasemapIdRef / activeBasemapIdRef. */
  const initialBasemapRestoreCompleteRef = useRef(false);
  /** Tracks last applied `?basemap=` for back/forward URL changes. */
  const prevUrlBasemapRef = useRef(null);
  /** One-shot guard: apply `?basemap=` from URL after mapIsReady (same path as saved print maps). */
  const initialUrlBasemapAppliedRef = useRef(false);
  const flushPendingLayerSyncRef = useRef(() => {});
  const runUpdateLayersRef = useRef(() => {});
  const restackDataAndParcelsOnceRef = useRef(() => {});
  /** Writes lat/lng/zoom/basemap to the address bar (assigned after helpers exist). */
  const syncMapUrlRef = useRef(() => {});
  /** Immediate `?basemap=` write on picker change (must not wait for pan or apply verify). */
  const writeBasemapToUrlRef = useRef(() => {});
  const mapUrlSyncThrottleRef = useRef(0);
  /** Retry overlay repair until the live map stack matches the URL basemap (no layers needed). */
  const scheduleBasemapUntilVerifiedRef = useRef(() => {});
  const basemapVerifyRetryTimerRef = useRef(null);

  useEffect(() => {
    is3DEnabledRef.current = is3DEnabled;
  }, [is3DEnabled]);


  /** Update basemap state/refs/UI and refresh Regrid parcel outline colors for the new basemap. */
  const publishBasemapSelection = useCallback(
    (id, { skipUrlWrite = false } = {}) => {
      const next = normalizeBasemapId(id);
      if (pendingPrintBasemapRestoreRef) pendingPrintBasemapRestoreRef.current = null;
      urlBasemapIdRef.current = next;
      baseMapRef.current = next;
      if (activeBasemapIdRef) activeBasemapIdRef.current = next;
      regridStyleBasemapRef.current = next;
      setBasemap(next);
      setCurrentBasemapId(next);
      applyRegridParcelOutlineForBasemap(mapRef.current, next);
      if (!skipUrlWrite) {
        writeBasemapToUrlRef.current(next);
      }
    },
    [setCurrentBasemapId, activeBasemapIdRef, pendingPrintBasemapRestoreRef]
  );
  /** Saved map / share load sets `currentBasemapId` in context first — mirror UI label only. */
  useEffect(() => {
    const wanted = String(currentBasemapId || '').trim();
    if (!wanted || wanted === basemap) return;
    setBasemap(wanted);
  }, [currentBasemapId, basemap]);

  /** Parcel outlines: white on imagery/satellite, black on light basemaps. */
  useEffect(() => {
    if (!mapIsReady || !mapRef.current?.isStyleLoaded?.()) return;
    const id = activeBasemapIdRef?.current || baseMapRef.current || basemap;
    regridStyleBasemapRef.current = id;
    applyRegridParcelOutlineForBasemap(mapRef.current, id);
  }, [basemap, currentBasemapId, mapIsReady]);

  useEffect(() => {
    if (!mapIsReady || !mapRef.current || !isPrinting) return undefined;
    const map = mapRef.current;
    const onMapClick = (e) => {
      if (activePrintTool && activePrintTool !== 'select') return;
      const { x, y } = e.point;
      const picked = pickPrintElementAtScreen(x, y);
      if (shareViewerReadOnly) {
        if (isPhotoPointElement(picked)) {
          setSharePhotoPopupElementId(picked.id);
          setSharePhotoPopupFullscreen(false);
          setSharePhotoPopupIndex(0);
        } else if (sharePhotoPopupElementId) {
          closeSharePhotoPopup();
        }
        return;
      }
      setSelectedPrintElement(picked);
    };
    map.on('click', onMapClick);
    return () => {
      map.off('click', onMapClick);
    };
  }, [
    mapIsReady,
    isPrinting,
    activePrintTool,
    pickPrintElementAtScreen,
    setSelectedPrintElement,
    shareViewerReadOnly,
    isPhotoPointElement,
    sharePhotoPopupElementId,
    closeSharePhotoPopup,
  ]);

  /**
   * Draw polygons/polylines using map events so the overlay can use pointer-events: none
   * and scroll/wheel zoom reaches the map canvas.
   */
  useEffect(() => {
    if (!mapIsReady || !mapRef.current || !isPrinting) return undefined;
    const map = mapRef.current;
    if (!activePrintTool || activePrintTool === 'select') return undefined;
    if (!isPolygonPlacingTool(activePrintTool) && !isPolylinePlacingTool(activePrintTool)) {
      return undefined;
    }

    const tool = activePrintTool;

    const onPlacementClick = (e) => {
      const oe = e.originalEvent;
      if (oe && oe.detail >= 2) return;
      const { lng, lat } = e.lngLat;
      if (isPolygonPlacingTool(tool)) {
        const next = [...polygonDraftPointsRef.current, { lng, lat }];
        polygonDraftPointsRef.current = next;
        setPolygonDraftPoints(next);
      } else {
        const next = [...polylineDraftPointsRef.current, { lng, lat }];
        polylineDraftPointsRef.current = next;
        setPolylineDraftPoints(next);
      }
    };

    const onPlacementDblClick = (e) => {
      e.preventDefault();
      const { lng, lat } = e.lngLat;
      const now = Date.now();
      const last = lastPlacementCommitRef.current;
      if (
        last.tool === tool &&
        Number.isFinite(last.lng) &&
        Number.isFinite(last.lat) &&
        now - last.at < 800 &&
        Math.abs(last.lng - lng) < 1e-7 &&
        Math.abs(last.lat - lat) < 1e-7
      ) {
        return;
      }
      if (isPolygonPlacingTool(tool)) {
        let coordinates = [...polygonDraftPointsRef.current];
        if (coordinates.length < 3) {
          coordinates = [...coordinates, { lng, lat }];
        }
        if (coordinates.length >= 3) {
          const metrics = getMetricsForPolygonLngLat(coordinates);
          addPrintElementFromTool(tool, { coordinates, metrics }, { lng, lat });
          lastPlacementCommitRef.current = { tool, lng, lat, at: now };
        }
        polygonDraftPointsRef.current = [];
        setPolygonDraftPoints([]);
        setPolygonCursorPoint(null);
        setActivePrintTool('select');
        return;
      }
      if (isPolylinePlacingTool(tool)) {
        let lngLatPoints = [...polylineDraftPointsRef.current];
        if (lngLatPoints.length < 2) {
          lngLatPoints = [...lngLatPoints, { lng, lat }];
        }
        if (lngLatPoints.length >= 2) {
          const metrics = getMetricsForLineLngLat(lngLatPoints);
          if (tool === 'arrow') {
            addPrintElementFromTool(
              'arrow',
              {
                coordinates: lngLatPoints.map((p) => [p.lng, p.lat]),
                metrics,
              },
              { lng, lat }
            );
          } else {
            addPrintElementFromTool(
              tool,
              { coordinates: lngLatPoints, metrics },
              { lng, lat }
            );
          }
          lastPlacementCommitRef.current = { tool, lng, lat, at: now };
        }
        polylineDraftPointsRef.current = [];
        setPolylineDraftPoints([]);
        setPolylineCursorPoint(null);
        setActivePrintTool('select');
      }
    };

    const onPlacementMouseMove = (e) => {
      const p = e.point;
      if (isPolygonPlacingTool(tool)) {
        setPolygonCursorPoint({ x: p.x, y: p.y });
      } else if (isPolylinePlacingTool(tool)) {
        setPolylineCursorPoint({ x: p.x, y: p.y });
      }
    };

    map.on('click', onPlacementClick);
    map.on('dblclick', onPlacementDblClick);
    map.on('mousemove', onPlacementMouseMove);

    return () => {
      map.off('click', onPlacementClick);
      map.off('dblclick', onPlacementDblClick);
      map.off('mousemove', onPlacementMouseMove);
    };
  }, [mapIsReady, isPrinting, activePrintTool, addPrintElementFromTool, setActivePrintTool]);

  /** Hover labels: map mousemove hit-tests features (SVG uses pointer-events:none when not selected). */
  useEffect(() => {
    if (!mapIsReady || !mapRef.current || !isPrinting) return undefined;
    const map = mapRef.current;
    let raf = null;
    const onMove = (e) => {
      if (raf != null) return;
      raf = requestAnimationFrame(() => {
        raf = null;
        const { x, y } = e.point;
        const picked = pickPrintElementAtScreen(x, y);
        setHoveredPrintElementId(picked?.id ?? null);
        setHoveredPrintCursorOverlayPx({ x, y });
      });
    };
    const onLeave = () => {
      setHoveredPrintElementId(null);
      setHoveredPrintCursorOverlayPx(null);
    };
    map.on('mousemove', onMove);
    const container = map.getContainer();
    container?.addEventListener('mouseleave', onLeave);
    return () => {
      map.off('mousemove', onMove);
      container?.removeEventListener('mouseleave', onLeave);
      if (raf != null) cancelAnimationFrame(raf);
    };
  }, [mapIsReady, isPrinting, pickPrintElementAtScreen]);

  /** Share viewer: arrow keys move between places or photos (non-tour). In property tour, ← → are reserved for tour steps. */
  useEffect(() => {
    if (!shareViewerReadOnly || !sharePhotoPopupElementId) return undefined;
    const onKeyDown = (e) => {
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        if (typeof document !== 'undefined' && document.documentElement.classList.contains('shared-tour-mode')) {
          return;
        }
      }
      if (e.key === 'Escape') {
        if (sharePhotoPopupFullscreen) setSharePhotoPopupFullscreen(false);
        else closeSharePhotoPopup();
        return;
      }
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        const delta = e.key === 'ArrowRight' ? 1 : -1;
        if (shareViewerPhotoRanked.length > 1) {
          e.preventDefault();
          stepSharePhotoFeature(delta);
        } else if (currentSharePhotoGallery.length > 1) {
          e.preventDefault();
          stepSharePhotoPopup(delta);
        }
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [
    shareViewerReadOnly,
    sharePhotoPopupElementId,
    sharePhotoPopupFullscreen,
    shareViewerPhotoRanked.length,
    currentSharePhotoGallery.length,
    closeSharePhotoPopup,
    stepSharePhotoFeature,
    stepSharePhotoPopup,
  ]);

  useEffect(() => {
    if (!printLayoutMode || !mapRef.current) return;
    if (printLayoutRect && printLayoutRect.width >= 20 && printLayoutRect.height >= 20) return;
    const rect = mapRef.current.getCanvas().getBoundingClientRect();
    const w = Math.max(260, Math.round(rect.width * 0.62));
    const h = Math.max(200, Math.round(rect.height * 0.62));
    setPrintLayoutRect({
      x: Math.max(10, Math.round((rect.width - w) / 2)),
      y: Math.max(10, Math.round((rect.height - h) / 2)),
      width: Math.min(w, rect.width - 20),
      height: Math.min(h, rect.height - 20),
    });
  }, [printLayoutMode, mapRef, printLayoutRect, setPrintLayoutRect]);

  const activeLayers = Object.keys(layerStatus).filter((layer) => layerStatus[layer]);
  const legendItems = activeLayers
  .map((layerName) => {
    const items = legends[layerName];
    if (!items) return null;
    
    const displayName = layerNameMappings[layerName] || layerName;
    
    // Filter out items with empty labels, but keep items that have colors (for layers like ownership)
    const validItems = items.filter(item => {
      // Keep items that have a label, OR items that have a color (for layers that just show a color)
      return (item.label && item.label.trim() !== '') || item.color;
    });
    
    // If no valid items, skip this layer
    if (validItems.length === 0) return null;
    
    return (
      <div key={layerName}>
        <strong style={{ color: '#000000', fontWeight: 'bold' }}>{displayName}</strong>
        <ul style={{ paddingLeft: '1em' }}>
          {validItems.map((item, idx) => (
            <li key={idx} style={{ display: 'flex', alignItems: 'center', color: '#000000' }}>
              <span
                style={{
                  display: 'inline-block',
                  width: '14px',
                  height: '14px',
                  marginRight: '6px',
                  border: '1px solid #000',
                  backgroundColor: item.color,
                  opacity: item.opacity ?? 1,
                }}
              />
              {item.label || ''}
            </li>
          ))}
        </ul>
      </div>
    );
  })
  .filter(Boolean);

  
  // --- 6. Map initialization ---

  useEffect(() => {
    if (!mapboxgl.accessToken) {
      console.error(
        'Mapbox access token missing. Set REACT_APP_MAPBOX_ACCESS_TOKEN in .env.production (or your shell) before running npm run build / npm run deploy.'
      );
      return undefined;
    }

    // Use live browser URL — same source of truth as refresh / paste-into-new-tab.
    const params = queryString.parse(window.location.search);
    const initView = resolveInitialMapView(window.location.search, window.location.pathname);
    const { id: effectiveBasemap, enable3D: urlEnable3D } = parseBasemapFromSearch(
      window.location.search
    );
    const publishedBasemap =
      urlEnable3D && effectiveBasemap === 'imagery' ? 'imagery-3d' : effectiveBasemap;
    mapDebug.trace('map init', { basemap: publishedBasemap, enable3D: urlEnable3D, params });
    urlBasemapIdRef.current = publishedBasemap;
    initialBasemapRestoreCompleteRef.current = false;
    needsInitialBasemapApplyRef.current = true;
    initialUrlBasemapAppliedRef.current = false;
    if (urlEnable3D) {
      is3DEnabledRef.current = true;
      setIs3DEnabled(true);
    }
    publishBasemapSelection(publishedBasemap, { skipUrlWrite: true });
    // All four supported basemaps share one Mapbox style; overlays are applied after load.
    const initialStyle = PERSISTENT_BASE_STYLE_ID;
    // Initialize the Mapbox map
    currentStyleUrlRef.current = `mapbox://styles/mapbox/${initialStyle}`;
    try {
      mapRef.current = new mapboxgl.Map({
        container: 'map',
        style: `mapbox://styles/mapbox/${initialStyle}`,
        center: initView.center,
        zoom: initView.zoom,
        minZoom: 3,
        maxZoom: 19,
        maxPitch: 85,
        preserveDrawingBuffer: true,
        transformRequest: (url, resourceType) => {
          try {
            const urlStr = typeof url === 'string' ? url : (url?.url || url?.toString() || String(url));
            if (resourceType === 'Tile' && urlStr && urlStr.includes('tiles.regrid.com')) {
              const proxyUrl = ensureRegridTileProxyUrl(urlStr);
              if (proxyUrl !== urlStr) {
                return { url: proxyUrl };
              }
            }
            return { url: urlStr };
          } catch (error) {
            console.error('Error in transformRequest:', error);
            const urlStr = typeof url === 'string' ? url : (url?.url || url?.toString() || String(url));
            return { url: urlStr };
          }
        },
      });
    } catch (error) {
      console.error('Failed to initialize Mapbox map:', error);
      return undefined;
    }
  
    mapRef.current.on('load', () => {
  
      if (!mapRef.current.hasImage('custom-pin')) {
        mapRef.current.loadImage('/pin_better.png', (error, image) => {
          if (error) {
            console.error("Error loading pin image:", error);
            return;
          }
          mapRef.current.addImage('custom-pin', image);
        });
      }

      setIsMapLoading(false);
      setMapRef(mapRef.current);
  
      let newLayerStatus = {}; 
      let layerList = [];
      
      window.mapRef = mapRef;
      window.updateExistingHighlights = updateExistingHighlights;
    });
  
    return () => {
      if (mapRef.current) {
        try {
          mapRef.current.remove();
        } catch (_) {
          /* ignore */
        }
        mapRef.current = null;
      }
    };
  }, []);

  const [isMobileViewport, setIsMobileViewport] = useState(
    () => typeof window !== 'undefined' && window.innerWidth <= 768
  );
  const [isBasemapSelectorOpen, setIsBasemapSelectorOpen] = useState(false);

  /** Dismiss mobile basemap sheet when the user pans/zooms the map (map stays interactive). */
  useEffect(() => {
    if (!isMobileViewport || !isBasemapSelectorOpen || !mapIsReady || !mapRef.current) {
      return undefined;
    }
    const map = mapRef.current;
    const closeBasemapSelector = () => setIsBasemapSelectorOpen(false);

    map.on('dragstart', closeBasemapSelector);
    map.on('zoomstart', closeBasemapSelector);
    map.on('rotatestart', closeBasemapSelector);
    map.on('pitchstart', closeBasemapSelector);
    map.on('click', closeBasemapSelector);

    return () => {
      map.off('dragstart', closeBasemapSelector);
      map.off('zoomstart', closeBasemapSelector);
      map.off('rotatestart', closeBasemapSelector);
      map.off('pitchstart', closeBasemapSelector);
      map.off('click', closeBasemapSelector);
    };
  }, [isBasemapSelectorOpen, isMobileViewport, mapIsReady]);

  /** Reopen on saved regional view when entering /map from marketing etc. (not Search/Print). */
  useEffect(() => {
    if (!mapIsReady || !mapRef.current) return;

    const pathname = routerLocation.pathname;
    const prev = prevPathForSavedLocationRef.current;
    prevPathForSavedLocationRef.current = pathname;

    if (prev === null) return;
    if (
      !shouldFlyToSavedLocationOnRouteChange(
        prev,
        pathname,
        routerLocation.search
      )
    ) {
      return;
    }

    const flyOpts = getSavedRegionalFlyToOptions(getSavedMapLocation());
    if (!flyOpts) return;

    mapRef.current.flyTo(flyOpts);
  }, [mapIsReady, routerLocation.pathname, routerLocation.search]);

  // Map is always full screen - no print cropping
  const containerStyle = useMemo(
    () => ({
      width: '100vw',
      height: isMobileViewport ? '100dvh' : '100vh',
      position: 'absolute',
    }),
    [isMobileViewport]
  );
  const computedWidth = '100vw';
  const computedHeight = isMobileViewport ? '100dvh' : '100vh';

  useEffect(() => {
  }, [notes]);

useEffect(() => {
}, [isPrinting]);

  /** WebGL map often prints blank until dimensions are synced with the print preview layout. */
  useEffect(() => {
    if (!mapIsReady || !mapRef.current) return undefined;
    const map = mapRef.current;
    const onBeforePrint = () => {
      safeMapResize(map);
      try {
        if (typeof map.triggerRepaint === 'function') map.triggerRepaint();
      } catch (_) {
        /* ignore */
      }
    };
    window.addEventListener('beforeprint', onBeforePrint);
    return () => window.removeEventListener('beforeprint', onBeforePrint);
  }, [mapIsReady, mapRef]);

  // =============== Regrid Parcel Tiles Setup ===============
  /** Prefetch TileJSON if missing; layer add/sync runs in `updateLayers` like other layers. */
  useEffect(() => {
    if (!mapRef.current || !mapIsReady) return undefined;

    const ensureTileJson = async () => {
      if (getCachedRegridTileJson()) return;
      try {
        await setupRegridTiles();
      } catch (_) {
        /* ignore */
      }
    };
    void ensureTileJson();

    window.updateRegridParcels = () => {
      updateLayers();
    };

    return () => {
      delete window.updateRegridParcels;
    };
  }, [mapRef, mapIsReady, setupRegridTiles]);


  /** Extract a stable id (GFI, pidn, ll_uuid, etc.) from a clicked map feature for highlight restore. */
  const getFeatureIdentifierFromFeature = useCallback((feature) => {
    if (!feature || !feature.properties) {
      return null;
    }

    const props = feature.properties;
    
    if (props.ll_uuid) {
      return props.ll_uuid;
    }
    if (props.parcelnumb) {
      return props.parcelnumb;
    }
    if (props.GFI) {
      return props.GFI;
    }
    if (props.pidn) {
      return props.pidn;
    }
    
    // For public_land features
    if (props.OBJECTID && !props.precinct && !props.FLD_AR_ID) {
      return props.OBJECTID;
    }
    
    // For precinct features
    if (props.precinct) {
      return props.precinct;
    }
    
    // For FEMA features
    if (props.FLD_AR_ID) {
      return props.FLD_AR_ID;
    }
    
    // For conservation easements and other features with Name
    if (props.Name) {
      return props.Name;
    }
    
    // Fallback to OBJECTID
    if (props.OBJECTID) {
      return props.OBJECTID;
    }
    
    return null;
  }, []);

  const featureMatchesHighlightIds = useCallback((feature, idSet) => {
    if (!feature || !idSet?.size) return false;
    const props = feature.properties || {};
    const fieldBag = props.fields && typeof props.fields === 'object' ? props.fields : {};
    const candidates = [
      props.ll_uuid,
      props.parcelnumb,
      props.parcel_id,
      props.global_parcel_uid,
      props.GFI,
      props.pidn,
      props.uuid,
      props.id,
      feature.id,
      fieldBag.ll_uuid,
      fieldBag.parcelnumb,
      props.Name,
      props.OBJECTID,
      props.FLD_AR_ID,
      props.precinct,
      getFeatureIdentifierFromFeature(feature),
    ]
      .filter(Boolean)
      .map((value) => String(value));
    return candidates.some((id) => {
      if (idSet.has(id)) return true;
      return idSet.has(id.replace(/^regrid:/i, ''));
    });
  }, [getFeatureIdentifierFromFeature]);

  const regridDisplayPropertyScore = useCallback((props) => {
    if (!props || typeof props !== 'object') return 0;
    const keys = ['owner', 'owner_name', 'address', 'physical', 'parcelnumb', 'mail', 'acre'];
    return keys.reduce(
      (score, key) => score + (props[key] != null && props[key] !== '' ? 1 : 0),
      0
    );
  }, []);

  const mergeHighlightCandidateFeatures = useCallback(
    (features) => {
      const byKey = new Map();
      for (const feature of features || []) {
        if (!feature?.geometry) continue;
        const key =
          getFeatureIdentifierFromFeature(feature) ||
          feature?.id ||
          JSON.stringify(feature.geometry);
        if (!key) continue;

        const prev = byKey.get(key);
        if (!prev) {
          byKey.set(key, feature);
          continue;
        }

        const mergedProps = { ...(prev.properties || {}) };
        for (const [propKey, value] of Object.entries(feature.properties || {})) {
          if (
            value != null &&
            value !== '' &&
            (mergedProps[propKey] == null || mergedProps[propKey] === '')
          ) {
            mergedProps[propKey] = value;
          }
        }

        const prevScore = regridDisplayPropertyScore(prev.properties);
        const nextScore = regridDisplayPropertyScore(feature.properties);
        byKey.set(key, {
          type: 'Feature',
          geometry: prev.geometry || feature.geometry,
          properties: mergedProps,
          layer:
            nextScore >= prevScore && feature.layer ? feature.layer : prev.layer || feature.layer,
        });
      }
      return Array.from(byKey.values());
    },
    [getFeatureIdentifierFromFeature, regridDisplayPropertyScore]
  );

  const getLayerNamesForHighlightRestore = useCallback(
    (map) => {
      const fromStatus = Object.keys(layerStatus).filter(
        (layerName) => layerStatus[layerName] && tileLayerMapLayersPresent(map, layerName)
      );
      if (fromStatus.length) return fromStatus;

      const params = queryString.parse(window.location.search || '');
      if (!params.layers) return [];
      return String(params.layers)
        .split(',')
        .map((layer) => layer.trim())
        .filter(Boolean)
        .filter((layerName) => layerStatus[layerName]);
    },
    [layerStatus]
  );

  const enrichSelectionFromRenderedOwnershipTilesRef = useRef(() => false);

  /** Replace sparse URL/API selection with MVT tile properties once ownership layers paint. */
  const enrichSelectionFromRenderedOwnershipTiles = useCallback(() => {
    const map = mapRef.current;
    const selection = selectedFeatureRef.current;
    if (!map?.isStyleLoaded?.() || !selection?.length || !layerStatus.ownership) {
      return false;
    }
    if (!map.getLayer('regrid-parcels-layer')) return false;

    let rendered = [];
    try {
      rendered = map.queryRenderedFeatures({
        layers: ['regrid-parcels-layer', 'regrid-parcels-outline'].filter((id) => map.getLayer(id)),
      });
    } catch (_) {
      return false;
    }
    if (!rendered.length) return false;

    let updated = false;
    const nextSelection = selection.map((selected) => {
      const props = selected?.properties || {};
      const isRegrid =
        isRegridParcelSelectionFeature(selected) || Boolean(props.ll_uuid);
      if (!isRegrid) return selected;

      const idSet = buildHighlightIdSet(
        [props.ll_uuid, props.parcelnumb, props.global_parcel_uid, getFeatureIdentifierFromFeature(selected)].filter(
          Boolean
        )
      );
      const tileMatch = rendered.find((feature) => featureMatchesHighlightIds(feature, idSet));
      if (!tileMatch) return selected;

      const prevScore = regridDisplayPropertyScore(props);
      const nextScore = regridDisplayPropertyScore(tileMatch.properties);
      if (nextScore <= prevScore) return selected;

      updated = true;
      return {
        type: 'Feature',
        geometry: tileMatch.geometry || selected.geometry,
        properties: { ...props, ...(tileMatch.properties || {}) },
        layer: tileMatch.layer || selected.layer,
      };
    });

    if (!updated) return false;

    selectedFeatureRef.current = nextSelection;
    setSelectedFeatures(nextSelection);
    if (highlightFeatureRef.current) {
      highlightFeatureRef.current(nextSelection, layerStatusRef.current);
    }
    return true;
  }, [
    buildHighlightIdSet,
    featureMatchesHighlightIds,
    getFeatureIdentifierFromFeature,
    layerStatus.ownership,
    regridDisplayPropertyScore,
    setSelectedFeatures,
  ]);

  enrichSelectionFromRenderedOwnershipTilesRef.current = enrichSelectionFromRenderedOwnershipTiles;

  const finalizeUrlHighlightRestore = useCallback(() => {
    pendingHighlightIdsRef.current = null;
    setInitialHighlightIds(null);
  }, []);

  const applyRestoredHighlightFeatures = useCallback(
    (rawFeatures, urlIds) => {
      if (!highlightSettingsReadyForPaint()) return false;

      const mergedFeatures = mergeHighlightCandidateFeatures(
        (rawFeatures || []).filter((f) => f?.geometry)
      );
      if (!mergedFeatures.length) return false;

      const settings = resolveHighlightSettingsForPaint();

      const featuresForHighlight = mergedFeatures.map((feature, index) => {
        const urlId = urlIds[index] || urlIds[0];
        const props = feature.properties || {};
        const llUuid =
          props.ll_uuid ||
          (LL_UUID_RE.test(String(urlId || '')) ? String(urlId) : null) ||
          props.parcelnumb ||
          props.global_parcel_uid;
        return {
          type: 'Feature',
          geometry: feature.geometry,
          properties: {
            ...props,
            ll_uuid: llUuid,
          },
          ...(feature.layer ? { layer: feature.layer } : {}),
        };
      });

      const idSet = buildHighlightIdSet(urlIds);
      const existingSelection = selectedFeatureRef.current || [];
      const existingMatchesUrl =
        existingSelection.length > 0 &&
        existingSelection.every((feature) => featureMatchesHighlightIds(feature, idSet));
      const existingScore = Math.max(
        0,
        ...existingSelection.map((feature) => regridDisplayPropertyScore(feature.properties))
      );
      const restoredScore = Math.max(
        0,
        ...featuresForHighlight.map((feature) => regridDisplayPropertyScore(feature.properties))
      );

      if (existingMatchesUrl && existingScore >= restoredScore && existingScore > 0) {
        if (!highlightFeatureRef.current) return false;
        highlightFeatureRef.current(existingSelection, layerStatus, settings);
        enrichSelectionFromRenderedOwnershipTilesRef.current();
        finalizeUrlHighlightRestore();
        return true;
      }

      setSelectedFeatures(featuresForHighlight);
      setActiveSidePanelTab('info');

      if (!highlightFeatureRef.current) return false;
      highlightFeatureRef.current(featuresForHighlight, layerStatus, settings);
      enrichSelectionFromRenderedOwnershipTilesRef.current();
      finalizeUrlHighlightRestore();

      return true;
    },
    [
      buildHighlightIdSet,
      featureMatchesHighlightIds,
      highlightSettingsReadyForPaint,
      layerStatus,
      mergeHighlightCandidateFeatures,
      regridDisplayPropertyScore,
      resolveHighlightSettingsForPaint,
      setSelectedFeatures,
      finalizeUrlHighlightRestore,
    ]
  );

  const restoreHighlightsFromUrl = useCallback(() => {
    const ids = pendingHighlightIdsRef.current;
    if (!ids?.length || !mapRef.current?.isStyleLoaded?.()) {
      return false;
    }

    if (!highlightSettingsReadyForPaint()) {
      return false;
    }

    const map = mapRef.current;
    const idSet = buildHighlightIdSet(ids);
    let matchedFeatures = [];
    const ownershipEnabled = canRestoreRegridHighlights();

    // Regrid ownership: match URL ids from MVT tiles only (same as other hosted layers).
    if (ownershipEnabled) {
      const regridLayerIds = ['regrid-parcels-layer', 'regrid-parcels-outline'].filter((layerId) =>
        map.getLayer(layerId)
      );
      if (regridLayerIds.length) {
        try {
          const rendered = map.queryRenderedFeatures({ layers: regridLayerIds });
          matchedFeatures.push(
            ...rendered.filter((feature) => featureMatchesHighlightIds(feature, idSet))
          );
        } catch (_) {
          /* ignore */
        }
      }
    }

    const activeLayerNames = getLayerNamesForHighlightRestore(map);
    activeLayerNames.forEach((layerName) => {
      try {
        const queryLayerIds = getQueryLayerIdsForTileLayer(layerName, map);
        if (!queryLayerIds.length) return;
        const renderedFeatures = map.queryRenderedFeatures({ layers: queryLayerIds });
        matchedFeatures.push(
          ...renderedFeatures.filter((feature) => featureMatchesHighlightIds(feature, idSet))
        );
      } catch (_) {
        /* layer may be mid-style */
      }
    });

    if (
      ownershipEnabled &&
      map.getSource('regrid-parcels') &&
      typeof map.querySourceFeatures === 'function'
    ) {
      try {
        const tileJson = getCachedRegridTileJson();
        const sourceLayer = getRegridVectorSourceLayerId(tileJson);
        const sourceFeatures = map.querySourceFeatures('regrid-parcels', { sourceLayer });
        matchedFeatures.push(
          ...sourceFeatures.filter((feature) => featureMatchesHighlightIds(feature, idSet))
        );
      } catch (_) {
        /* tiles may not be loaded yet */
      }
    }

    const uniqueFeatures = mergeHighlightCandidateFeatures(matchedFeatures);
    if (!uniqueFeatures.length) return false;
    return applyRestoredHighlightFeatures(uniqueFeatures, ids);
  }, [
    applyRestoredHighlightFeatures,
    buildHighlightIdSet,
    canRestoreRegridHighlights,
    clearPendingHighlightRestore,
    featureMatchesHighlightIds,
    getFeatureIdentifierFromFeature,
    getLayerNamesForHighlightRestore,
    highlightSettingsReadyForPaint,
    isRegridHighlightId,
    pendingHighlightsAreRegridOnly,
  ]);

  restoreHighlightsFromUrlRef.current = restoreHighlightsFromUrl;

  useEffect(() => {
    const ids = readHighlightIdsFromLocation(routerLocation.search);
    if (!ids?.length) return;

    if (pendingHighlightsAreRegridOnly(ids) && !canRestoreRegridHighlights()) {
      const params = queryString.parse(routerLocation.search || '');
      const ownershipInUrl = String(params.layers || '')
        .split(',')
        .map((layer) => layer.trim())
        .includes('ownership');
      if (!ownershipInUrl) {
        clearPendingHighlightRestore();
        return;
      }
    }

    const existingSelection = selectedFeatureRef.current || [];
    const selectionSatisfiesUrl =
      existingSelection.length > 0 &&
      ids.every((urlId) =>
        existingSelection.some((feature) =>
          featureMatchesHighlightIds(feature, buildHighlightIdSet([urlId]))
        )
      );

    if (selectionSatisfiesUrl) {
      enrichSelectionFromRenderedOwnershipTilesRef.current();
      pendingHighlightIdsRef.current = null;
      setInitialHighlightIds(null);
      return;
    }

    if (!pendingHighlightIdsRef.current?.length) {
      pendingHighlightIdsRef.current = ids;
      setInitialHighlightIds(ids);
    }
  }, [
    buildHighlightIdSet,
    canRestoreRegridHighlights,
    clearPendingHighlightRestore,
    featureMatchesHighlightIds,
    layerStatus.ownership,
    readHighlightIdsFromLocation,
    routerLocation.search,
  ]);

  const urlSearchEquivalent = (currentSearch, nextSearch) => {
    const norm = (s) => String(s || '').replace(/^\?/, '');
    const a = queryString.parse(norm(currentSearch));
    const b = queryString.parse(norm(nextSearch));
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    for (const k of keys) {
      if (String(a[k] ?? '') !== String(b[k] ?? '')) return false;
    }
    return true;
  };

  const safeMapUrlNavigate = (searchString) => {
    const nextSearch = searchString ? `?${searchString}` : '';
    if (urlSearchEquivalent(routerLocation.search, nextSearch)) return false;
    const now = Date.now();
    if (now - mapUrlSyncThrottleRef.current < 120) return false;
    mapUrlSyncThrottleRef.current = now;
    navigate({ pathname: routerLocation.pathname, search: searchString }, { replace: true });
    return true;
  };

  writeBasemapToUrlRef.current = (basemapId) => {
    try {
      const p = window.location?.pathname || '';
      if (
        p.startsWith('/view/') ||
        p.startsWith('/tour/') ||
        p.startsWith('/amenities/')
      ) return;
    } catch {
      return;
    }
    const next = normalizeBasemapId(basemapId);
    prevUrlBasemapRef.current = next;
    urlBasemapIdRef.current = next;
    const params = queryString.parse(routerLocation.search || '');
    params.basemap = next;
    safeMapUrlNavigate(queryString.stringify(params));
  };

  syncMapUrlRef.current = () => {
    if (!mapRef.current) return;
    try {
      const p = window.location?.pathname || '';
      if (
        p.startsWith('/view/') ||
        p.startsWith('/tour/') ||
        p.startsWith('/amenities/')
      ) return;
    } catch {
      /* ignore */
    }

    const center = mapRef.current.getCenter();
    const zoom = mapRef.current.getZoom();
    const urlParams = queryString.parse(routerLocation.search || '');
    const selectedHighlightIds = selectedFeature
      .map((feature) => getFeatureIdentifierFromFeature(feature))
      .filter(Boolean);
    const pendingIds = pendingHighlightIdsRef.current || [];
    const canPersistPendingRegrid =
      canRestoreRegridHighlights() ||
      !pendingHighlightsAreRegridOnly(pendingIds);
    const highlights =
      selectedHighlightIds.length > 0
        ? selectedHighlightIds.join(',')
        : pendingIds.length && canPersistPendingRegrid
          ? pendingIds.join(',')
          : '';

    const layersForUrl = layerOrder.filter((name) => Boolean(layerStatus[name])).join(',');

    const liveBasemap = normalizeBasemapId(
      activeBasemapIdRef?.current || baseMapRef.current || basemap || currentBasemapId
    );
    const pendingUrlBasemap = normalizeBasemapId(urlBasemapIdRef.current || '');
    const basemapForUrl =
      !initialBasemapRestoreCompleteRef.current &&
      pendingUrlBasemap &&
      pendingUrlBasemap !== liveBasemap
        ? pendingUrlBasemap
        : liveBasemap;

    const newParams = queryString.stringify({
      lat: center.lat.toFixed(5),
      lng: center.lng.toFixed(5),
      zoom: zoom,
      ...(highlights ? { highlights } : {}),
      ...(layersForUrl ? { layers: layersForUrl } : {}),
      basemap: basemapForUrl,
    });
    prevUrlBasemapRef.current = basemapForUrl;
    urlBasemapIdRef.current = basemapForUrl;
    safeMapUrlNavigate(newParams);
  };

  useEffect(() => {
    if (!mapRef.current) return undefined;
    const onMoveEnd = () => syncMapUrlRef.current();
    mapRef.current.on('moveend', onMoveEnd);
    syncMapUrlRef.current();
    return () => {
      mapRef.current?.off('moveend', onMoveEnd);
    };
  }, [
    layerOrder,
    layerStatus,
    selectedFeature,
    basemap,
    currentBasemapId,
    navigate,
    getFeatureIdentifierFromFeature,
    routerLocation.pathname,
  ]);
  


useEffect(() => {
  if (!mapRef.current) return undefined;

  const markReady = () => {
    if (!mapRef.current?.isStyleLoaded?.()) return;
    setMapIsReady(true);
  };

  if (mapRef.current.isStyleLoaded()) {
    markReady();
    return undefined;
  }

  const map = mapRef.current;
  map.once('style.load', markReady);
  map.once('idle', markReady);

  return () => {
    try {
      map.off('style.load', markReady);
      map.off('idle', markReady);
    } catch (_) {
      /* ignore */
    }
  };
}, []);

  // (B) Restore ?highlights= from URL — retry on idle/pan/zoom until tile features match (no Regrid API).
  useEffect(() => {
    if (!mapIsReady || !mapRef.current) return undefined;
    if (!pendingHighlightIdsRef.current?.length && !initialHighlightIds?.length) return undefined;
    if (!highlightSettingsReadyForPaint()) return undefined;

    let cancelled = false;
    let inFlight = false;

    const tryRestore = () => {
      if (cancelled || inFlight || !pendingHighlightIdsRef.current?.length) return;
      inFlight = true;
      try {
        restoreHighlightsFromUrlRef.current();
      } catch (_) {
        /* ignore */
      } finally {
        inFlight = false;
        enrichSelectionFromRenderedOwnershipTilesRef.current();
      }
    };

    const scheduleRestore = () => {
      window.setTimeout(tryRestore, 200);
    };

    const map = mapRef.current;
    map.on('idle', scheduleRestore);
    map.on('moveend', scheduleRestore);
    map.on('zoomend', scheduleRestore);
    tryRestore();

    return () => {
      cancelled = true;
      map.off('idle', scheduleRestore);
      map.off('moveend', scheduleRestore);
      map.off('zoomend', scheduleRestore);
    };
  }, [
    mapIsReady,
    initialHighlightIds,
    layerStatus,
    layerStatus.ownership,
    regridTileJsonVersion,
    restoreHighlightsFromUrl,
    highlightSettingsReadyForPaint,
    highlightSettings,
  ]);

  useEffect(() => {
    if (!mapRef.current) return;
  
    const map = mapRef.current;
    const logZoom = () => {
    };
  
    map.on('zoom', logZoom);
  
    // Optionally, log on move as well:
    // map.on('move', logZoom);
  
    // Cleanup
    return () => {
      map.off('zoom', logZoom);
      // map.off('move', logZoom);
    };
  }, [mapRef]);

  // Remove or comment out the effect that sets tile boundaries
  // useEffect(() => {
  //   if (!mapRef.current) return;
  //   mapRef.current.showTileBoundaries = true;
  // }, [mapRef]);
  /**
   * =============== Draw Hook ===============
   * Integrates with custom hook `useMapboxDraw` to enable polygon/line drawing.
   * The hook internally handles draw events like `draw.create`, mode changes, etc.
   */
  const { drawPolygon, drawLine, clearAllDrawings, deleteSelectedFeature} = useMapboxDraw({
    mapRef,
    onPolygonCreated: (polyFeature) => {
      // Possibly do area calc or passPolygonToReportBuilder
      // e.g. passPolygonToReportBuilder(polyFeature);
    },

    onPolygonFinalized: (finalPolyFeature) => {
    
      // Store the polygon for future reference
      setSelectedFilterPolygon(finalPolyFeature);
    
      // Zoom to polygon
      zoomToPolygon(finalPolyFeature);
    
      // Select parcels inside the polygon
      mapRef.current.once("moveend", () => {
        // Use ref to get current highlightSettings (always fresh)
        selectParcelsInsidePolygon(finalPolyFeature, highlightSettingsRef.current);
      });
    },
    
  }, [highlightSettings]);


  /** SW/NE bounds from a GeoJSON polygon outer ring. */
  function getBoundingBox(polygon) {
    const coords = polygon.coordinates[0]; // Outer ring
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

    coords.forEach(([lng, lat]) => {
      if (lng < minX) minX = lng;
      if (lat < minY) minY = lat;
      if (lng > maxX) maxX = lng;
      if (lat > maxY) maxY = lat;
    });

    return [[minX, minY], [maxX, maxY]]; // [Southwest, Northeast]
  }


  /** Animate map to fit a drawn filter polygon. */
  function zoomToPolygon(polygon) {
    const bounds = getBoundingBox(polygon);
    mapRef.current.fitBounds(bounds, {
      padding: 100, // Adjust padding for better visualization
      duration: 800, // Smooth animation
    });
  
  }


  /** Query Regrid parcels inside a drawn polygon and highlight/select them. */
  function selectParcelsInsidePolygon(polygon, currentHighlightSettings) {

    const candidateLayers = layerStatus.ownership
      ? ["regrid-parcels-layer", "regrid-parcels-outline"]
      : [];
    const availableLayers = candidateLayers.filter((layerId) => mapRef.current.getLayer(layerId));
    const queriedFeatures = availableLayers.length
      ? mapRef.current.queryRenderedFeatures({ layers: availableLayers })
      : [];

    if (!queriedFeatures.length) {
        return;
    }


    // Convert the drawn polygon to a Turf.js Polygon
    const selectionPolygon = turf.polygon(polygon.coordinates);

    const MOSTLY_INSIDE_THRESHOLD = 0.6;
    // Select parcel geometries that are mostly inside the drawn polygon.
    const selectedFeatures = queriedFeatures.filter((feature) => {
        if (!feature.geometry) return false;
        const featureGeometry = turf.feature(feature.geometry);
        try {
          if (turf.booleanContains(selectionPolygon, featureGeometry)) {
            return true;
          }
          if (!turf.booleanIntersects(selectionPolygon, featureGeometry)) {
            return false;
          }

          const parcelArea = turf.area(featureGeometry);
          if (!parcelArea || !Number.isFinite(parcelArea) || parcelArea <= 0) {
            return false;
          }

          const overlap = turf.intersect(selectionPolygon, featureGeometry);
          if (!overlap) return false;
          const overlapArea = turf.area(overlap);
          const overlapRatio = overlapArea / parcelArea;
          return overlapRatio >= MOSTLY_INSIDE_THRESHOLD;
        } catch (error) {
          return false;
        }
    });

    const normalizeToken = (value) => String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const extractParcelIdFromGfi = (gfi) => {
      if (!gfi) return '';
      const parts = String(gfi).split('_');
      return parts.length ? parts[parts.length - 1] : '';
    };
    const dedupeBy = (feature) => {
      const props = feature?.properties || {};
      const parcelNum = normalizeToken(props.parcelnumb || props.parcel_id || props.county_parcel_id);
      const gfiParcel = normalizeToken(extractParcelIdFromGfi(props.GFI));
      const uuid = normalizeToken(props.ll_uuid || props.id);
      return parcelNum || gfiParcel || uuid || `${feature?.source || "src"}:${feature?.id || "unknown"}`;
    };

    const seen = new Set();
    const uniqueSelectedFeatures = selectedFeatures.filter((feature) => {
      const key = dedupeBy(feature);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    
    // Highlight & Store Selected Features
    setSelectedFeatures(uniqueSelectedFeatures);
    
    // Use the passed highlightSettings to ensure we have current values
    highlightFeature(uniqueSelectedFeatures, { ownership: true }, currentHighlightSettings);
}





 
  // --- 7. Layer sync (updateLayers) ---

  const lastAppliedLayerOrderRef = useRef('');

  /** Add/remove/reorder hosted tile layers and Regrid parcels based on `layerStatus` and `layerOrder`. */
  const updateLayers = () => {
    mapDebug.trace('updateLayers', layerStatus);

    const syncBasemapOverlaysIfNeeded = () => {
      const map = mapRef.current;
      if (!map?.isStyleLoaded?.()) return;
      const wantedBasemap = normalizeBasemapId(
        activeBasemapIdRef?.current || baseMapRef.current || urlBasemapIdRef.current
      );
      if (!wantedBasemap) return;

      const basemapChanged =
        normalizeBasemapId(lastAppliedBasemapRef.current || '') !== wantedBasemap;
      const needsMaintenance = needsBasemapOverlayMaintenance(map, wantedBasemap);
      if (!basemapChanged && !needsMaintenance) return;

      try {
        repairBasemapOverlaysRef.current(wantedBasemap);
        applyCompositeLabelStyleForBasemap(map, wantedBasemap);
      } catch (_) {
        /* ignore */
      }

      if (
        verifyBasemapAppliedOnMap(map, wantedBasemap) &&
        !needsBasemapOverlayMaintenance(map, wantedBasemap)
      ) {
        lastAppliedBasemapRef.current = wantedBasemap;
        initialBasemapRestoreCompleteRef.current = true;
        needsInitialBasemapApplyRef.current = false;
      }
    };

    syncBasemapOverlaysIfNeeded();

  /** Tile URL/spec changed — needs reload. Fresh addSource already fetches tiles; reloading causes first-toggle flicker. */
    const sourcesNeedingTileReload = new Set();
    const sourcesAddedThisPass = new Set();
    const prevStatus = prevLayerStatusForRepaintRef.current;
    const turnedOnLayerNames =
      prevStatus == null
        ? Object.keys(layerStatus).filter((name) => layerStatus[name])
        : Object.keys(layerStatus).filter((name) => layerStatus[name] && !prevStatus[name]);

    const clearSelectionForLayer = (name) => {
      const current = selectedFeatureRef.current?.length
        ? selectedFeatureRef.current
        : selectedFeature || [];
      if (!current.length) return;
      const updatedSelectedFeatures = current.filter(
        (feature) => !featureBelongsToMapLayer(feature, name)
      );
      if (updatedSelectedFeatures.length === current.length) return;
      selectedFeatureRef.current = updatedSelectedFeatures;
      if (updatedSelectedFeatures.length > 0) {
        setSelectedFeatures(updatedSelectedFeatures);
        highlightFeature(updatedSelectedFeatures);
      } else {
        setSelectedFeatures([]);
        removeHighlight();
      }
    };

    // Empty `layerStatus` means hide every known layer on Mapbox (e.g. print map load clear).
    const layersToSync =
      Object.keys(layerStatus).length === 0
        ? getAllMapLayerToggleIds().map((name) => [name, false])
        : Object.entries(layerStatus);

    layersToSync.forEach(([layerName, isVisible]) => {

      if (DISABLED_TILE_LAYERS.has(layerName)) {
        if (tileLayerMapLayersPresent(mapRef.current, layerName)) {
          setTileLayerVisibility(mapRef.current, layerName, 'none');
          clearSelectionForLayer(layerName);
        }
        return;
      }

      if (layerName === 'ownership') {
        if (parcelMapVisibility.showRegrid) {
          if (syncOwnershipTileLayer(mapRef.current, parcelMapVisibility)) {
            sourcesAddedThisPass.add('ownership');
          }
          if (isVisible) setTopLayer('ownership');
        } else if (tileLayerMapLayersPresent(mapRef.current, 'ownership')) {
          setTileLayerVisibility(mapRef.current, 'ownership', 'none');
          hideLabelLayerSafeRef.current(mapRef.current, 'ownership-label-layer');
          clearSelectionForLayer('ownership');
          clearPendingHighlightRestore();
          syncMapUrlRef.current();
        }
        return;
      }

      if (!getHostedTileLayerUrl(layerName)) return;
      // Check if the source for the layer exists, if not add it
      if (!mapRef.current.getSource(layerName)) {
        const zt =
          vectorTileLayerZoom[layerName] ||
          rasterTileLayerZoom[layerName] ||
          { minzoom: 6, maxzoom: 14 };
        const tpl = getHostedTileLayerUrl(layerName);
        if (isVectorPmtilesArchiveUrl(tpl)) {
          mapRef.current.addSource(layerName, {
            type: isRasterHostedTileLayer(layerName) ? 'raster' : 'vector',
            url: tpl,
            minzoom: zt.minzoom,
            maxzoom: zt.maxzoom,
          });
        } else {
          mapRef.current.addSource(layerName, {
            type: 'vector',
            tiles: [tpl],
            minzoom: zt.minzoom,
            maxzoom: zt.maxzoom,
          });
        }
        sourcesAddedThisPass.add(layerName);
      } else {
        // If ``tileLayerUrls`` changed (e.g. MVT → PMTiles), sync the underlying vector source.
        try {
          const src = mapRef.current.getSource(layerName);
          const nextSpec = getHostedTileLayerUrl(layerName);
          if (!src || !nextSpec) return;
          const serialized =
            typeof src.serialize === 'function' ? src.serialize() || {} : {};
          if (isVectorPmtilesArchiveUrl(nextSpec)) {
            if (serialized.url !== nextSpec && typeof src.setUrl === 'function') {
              src.setUrl(nextSpec);
              reloadVectorSourceTileCaches(mapRef.current, layerName);
              sourcesNeedingTileReload.add(layerName);
            }
          } else if (typeof src.setTiles === 'function') {
            const currentTpl =
              Array.isArray(serialized.tiles) ? serialized.tiles[0] : src?.tiles?.[0] ?? null;
            if (currentTpl !== nextSpec) {
              src.setTiles([nextSpec]);
              reloadVectorSourceTileCaches(mapRef.current, layerName);
              sourcesNeedingTileReload.add(layerName);
            }
          }
        } catch (_) {
          /* ignore */
        }
      }

      // Add the layer if it is visible and not already added
      if (isVisible) {
        if (!tileLayerMapLayersPresent(mapRef.current, layerName)) {

          let beforeId = getVectorLayerInsertBeforeId(mapRef.current);
          const styleLayers = mapRef.current.getStyle().layers || [];
          const drawLayer = styleLayers.find((l) => l.id.startsWith('gl-draw-'));
          if (!beforeId && drawLayer) {
            beforeId = drawLayer.id;
          }

          let style;

          if (layerName === 'soil') {
            try {
              addSoilStateLayers(mapRef.current, beforeId);
            } catch (error) {
              console.error(`Error adding soil layers: ${error}`);
            }
          } else {
          style = getLayerStyle(layerName, null, baseMapRef);
          if (style) {
            try {
              mapRef.current.addLayer(style, beforeId);
              if (layerName === 'surface_water') {
                const flowlineStyle = getLayerStyle('surface_water_flowline', null, baseMapRef);
                if (flowlineStyle && !mapRef.current.getLayer('surface_water-flowline-layer')) {
                  mapRef.current.addLayer(
                    { ...flowlineStyle, source: 'surface_water' },
                    beforeId
                  );
                }
              }
              if (layerName === 'conservation_easements') {
                const outlineStyle = getLayerStyle('conservation_easements_outline', null, baseMapRef);
                if (
                  outlineStyle &&
                  !mapRef.current.getLayer('conservation_easements-outline-layer')
                ) {
                  mapRef.current.addLayer(
                    { ...outlineStyle, source: 'conservation_easements' },
                    beforeId
                  );
                }
              }
            } catch (error) {
              console.error(`Error adding layer: ${error}`);
            }
          } else {
          }
          }

        } else {
          // If the layer is already added, just make sure it's visible
          setTileLayerVisibility(mapRef.current, layerName, 'visible');
        }

        setTopLayer(layerName);
      } else {
        if (tileLayerMapLayersPresent(mapRef.current, layerName)) {
          setTileLayerVisibility(mapRef.current, layerName, 'none');
        }
        clearSelectionForLayer(layerName);
      }

    });

    // Reorder layers only when stack order actually changed (avoids repainting every toggle).
    const layerOrderKey = layerOrder.join('\0');
    const layerOrderChanged = layerOrderKey !== lastAppliedLayerOrderRef.current;
    if (layerOrderChanged) {
      const stackBeforeId = getFirstSymbolLayerId(mapRef.current);
      layerOrder.forEach((layerName) => {
        getQueryLayerIdsForTileLayer(layerName, mapRef.current).forEach((layerId) => {
          if (mapRef.current.getLayer(layerId)) {
            mapRef.current.moveLayer(layerId, stackBeforeId);
          }
        });
      });
      lastAppliedLayerOrderRef.current = layerOrderKey;
    }

    const finishLayerStack = () => {
      if (!mapRef.current) return;
      if (layerStatus.ownership) {
        safeMapResize(mapRef.current);
      }
      if (parcelMapVisibility.showRegrid) {
        bringRegridParcelLayersBeforeSymbolLabels(mapRef.current);
        applyParcelVisualizationVisibility(mapRef.current, parcelMapVisibility);
      }
      const layersNeedingTileRepaint = [
        ...new Set([...turnedOnLayerNames, ...sourcesAddedThisPass]),
      ];
      repaintLayersTurnedOn(mapRef.current, layerStatus, layersNeedingTileRepaint, {
        regridFreshlyAdded: sourcesAddedThisPass.has('ownership'),
      });
      prevLayerStatusForRepaintRef.current = { ...layerStatus };
      applyRegridParcelOutlineForBasemap(
        mapRef.current,
        activeBasemapIdRef?.current || baseMapRef.current
      );
      applyLabelLayersRef.current();
      enrichSelectionFromRenderedOwnershipTilesRef.current();
      if (pendingHighlightIdsRef.current?.length) {
        void restoreHighlightsFromUrlRef.current();
      }
      bringLabelsToTop();
      applyCompositeLabelStyleForBasemap(
        mapRef.current,
        activeBasemapIdRef?.current || baseMapRef.current
      );
      if (propertyTourSlideIdRef.current === 'vicinity' || isPropertyTourVicinitySlideActive()) {
        ensureTourVicinityNearbyLayersOnTop(mapRef.current);
      }
      const needsTileReload = sourcesNeedingTileReload.size > 0;

      try {
        if (mapRef.current.getLayer("settlement-label")) {
          mapRef.current.setPaintProperty("settlement-label", "text-color", "#000000");
          mapRef.current.setPaintProperty("settlement-label", "text-halo-color", "#FFFFFF");
          mapRef.current.setPaintProperty("settlement-label", "text-halo-width", 15);
          mapRef.current.setPaintProperty("settlement-label", "text-halo-blur", 20);
        }
      } catch (_) {}

      if (needsTileReload) {
        reloadTileSources(mapRef.current, sourcesNeedingTileReload, false);
        try {
          if (typeof mapRef.current.triggerRepaint === 'function') mapRef.current.triggerRepaint();
        } catch (_) {}
        scheduleDeferredTileRefresh(mapRef.current, sourcesNeedingTileReload, false);
        if (propertyTourSlideIdRef.current === 'vicinity' || isPropertyTourVicinitySlideActive()) {
          const bumpTourLayers = () => ensureTourVicinityNearbyLayersOnTop(mapRef.current);
          try {
            mapRef.current.once('idle', bumpTourLayers);
          } catch (_) {
            /* ignore */
          }
          window.setTimeout(bumpTourLayers, 550);
        }
      }

      try {
        restackDataAndParcelsOnceRef.current();
      } catch (_) {
        /* ignore */
      }
      const selectionAfterStack = selectedFeatureRef.current;
      if (selectionAfterStack?.length) {
        const visibleSelection = filterSelectionToVisibleLayers(
          selectionAfterStack,
          resolveLayerStatusForSelection(layerStatusRef.current)
        );
        if (visibleSelection.length !== selectionAfterStack.length) {
          selectedFeatureRef.current = visibleSelection;
          setSelectedFeatures(visibleSelection);
        }
        if (visibleSelection.length) {
          repaintSelectionHighlightRef.current(visibleSelection, { syncOwnership: false });
        } else {
          removeHighlight();
        }
      }
      const wantedBasemap = normalizeBasemapId(
        activeBasemapIdRef?.current || baseMapRef.current || urlBasemapIdRef.current
      );
      if (
        wantedBasemap &&
        mapRef.current &&
        verifyBasemapAppliedOnMap(mapRef.current, wantedBasemap) &&
        !needsBasemapOverlayMaintenance(mapRef.current, wantedBasemap)
      ) {
        lastAppliedBasemapRef.current = wantedBasemap;
        initialBasemapRestoreCompleteRef.current = true;
      }
    };

    const map = mapRef.current;
    if (!map?.loaded?.()) {
      finishLayerStack();
      return new Promise((resolve) => {
        const afterLoad = () => {
          if (parcelMapVisibility.showRegrid) {
            syncOwnershipTileLayer(mapRef.current, parcelMapVisibility);
          }
          finishLayerStack();
          resolve();
        };
        try {
          if (map.loaded()) {
            afterLoad();
            return;
          }
          map.once('load', afterLoad);
        } catch (_) {
          resolve();
        }
      }).then(() => undefined);
    }

    return new Promise((resolve) => {
      const runRegridWhenStyleReady = () => {
        if (!map.isStyleLoaded()) {
          map.once('style.load', runRegridWhenStyleReady);
          return;
        }
        syncOwnershipTileLayer(map, parcelMapVisibility);
        finishLayerStack();
        resolve();
      };
      runRegridWhenStyleReady();
    });
  };

  runUpdateLayersRef.current = () => Promise.resolve(updateLayers());

  flushPendingLayerSyncRef.current = () => {
    runUpdateLayersRef.current();
  };

  /** After basemap style swap: tear down and re-add the full Regrid MVT stack from TileJSON. */
  const reinitializeRegridParcelsAfterBasemapSwap = useCallback(async () => {
    const map = mapRef.current;
    if (!map?.isStyleLoaded?.()) return;
    if (!parcelMapVisibilityRef.current?.showRegrid) return;

    // Let glyphs/sprites settle after setStyle so the new stack isn’t built on a half-ready style.
    await new Promise((resolve) => {
      const m = mapRef.current;
      if (!m) {
        resolve();
        return;
      }
      let settled = false;
      const done = () => {
        if (settled) return;
        settled = true;
        try {
          m.off('idle', onIdle);
        } catch (_) {
          /* ignore */
        }
        window.clearTimeout(tid);
        resolve();
      };
      const onIdle = () => done();
      const tid = window.setTimeout(done, 600);
      try {
        m.once('idle', onIdle);
      } catch (_) {
        done();
      }
    });

    try {
      removeRegridParcelStack(map);
    } catch (_) {
      /* ignore */
    }

    await new Promise((r) => requestAnimationFrame(r));

    try {
      if (!getCachedRegridTileJson()) {
        await setupRegridTiles();
      } else {
        addRegridParcelLayersFromTileJson(
          map,
          getCachedRegridTileJson(),
          getRegridVectorMinZoomForMap(map)
        );
      }
    } catch (_) {
      /* ignore */
    }

    const m = mapRef.current;
    if (!m) return;
    try {
      bringRegridParcelLayersBeforeSymbolLabels(m);
      applyParcelVisualizationVisibility(m, parcelMapVisibilityRef.current);
    } catch (_) {
      /* ignore */
    }
    if (!m.getSource('regrid-parcels')) return;
    // Avoid aggressive post-style tile invalidation here — it can create visible flicker
    // during basemap transitions. Regrid is already re-added and restacked above.
    try {
      if (typeof m.triggerRepaint === 'function') m.triggerRepaint();
    } catch (_) {
      /* ignore */
    }
    fireRegridRestack(m);
  }, [setupRegridTiles]);

  /**=============== Handles On Click ===============
   * 
   */
  useEffect(() => {
    if (!mapRef.current) return;
  
    let isDragging = false; // Track if user is dragging
  
    /** 🟢 Detects dragging start */
    const handleTouchStart = () => {
      isDragging = false; // Reset dragging state
    };
  
    /** 🔴 Detects dragging movement */
    const handleTouchMove = () => {
      isDragging = true; // User is dragging, don't trigger click
    };
  
    /** ✅ Handles tap/clicks */
    const handleClick = (e) => {

      if (suppressNextFeatureClickRef?.current) {
        suppressNextFeatureClickRef.current = false;
        return;
      }
  
      if (isDragging) {
        return;
      }

      if (window.innerWidth <= 768) {
        const event = new CustomEvent('map-user-interaction');
        window.dispatchEvent(event);
        document.dispatchEvent(event);
      }
  
      if (isDrawingRef.current === true) {
        return;
      }
      const existingLayers = Object.keys(layerStatus).filter(
        (layerName) => layerStatus[layerName] && tileLayerMapLayersPresent(mapRef.current, layerName)
      );
      const clickableNonOwnershipLayers = [
        ...layerOrder.filter(
          (layerName) =>
            layerName !== 'ownership' &&
            layerStatus[layerName] &&
            tileLayerMapLayersPresent(mapRef.current, layerName)
        ),
        ...existingLayers.filter(
          (layerName) => layerName !== 'ownership' && !layerOrder.includes(layerName)
        ),
      ];

      let queryLayers = existingLayers.flatMap((layerName) =>
        getQueryLayerIdsForTileLayer(layerName, mapRef.current)
      );
      // Regrid: same rules as parcel overlay visibility (print toggle can hide vectors)
      if (parcelMapVisibility.showRegrid && mapRef.current.getLayer('regrid-parcels-layer')) {
        queryLayers.push('regrid-parcels-layer', 'regrid-parcels-outline');
      }
  
      if (queryLayers.length > 0) {
        const features = mapRef.current.queryRenderedFeatures(e.point, {
          layers: queryLayers,
        });
  
  
        if (features.length > 0) {
          mapRef.current.dragPan.disable(); // Temporarily disable dragPan
  
          const clickedFeature = pickClickedFeature(
            features,
            clickableNonOwnershipLayers,
            parcelMapVisibility.showRegrid
          );
          if (!clickedFeature) {
            setSelectedFeatures([]);
            removeHighlight();
            return;
          }
          // Print all attributes of the clicked parcel
          
          const featureForSelection = stampSelectionFeature(clickedFeature);

          const prevSelection = selectedFeatureRef.current || [];
          const isAlreadySelected = prevSelection.some((f) =>
            featuresShareSelectionId(f, featureForSelection)
          );
          let nextSelection;
          if (e.originalEvent.shiftKey) {
            nextSelection = isAlreadySelected
              ? prevSelection.filter((f) => !featuresShareSelectionId(f, featureForSelection))
              : [...prevSelection, featureForSelection];
          } else if (isAlreadySelected && prevSelection.length === 1) {
            nextSelection = [];
          } else {
            nextSelection = [featureForSelection];
          }

          selectedFeatureRef.current = nextSelection;
          setSelectedFeatures(nextSelection);
          if (!nextSelection.length) {
            removeHighlight();
          } else {
            deferSelectionHighlightUntilSettledRef.current(nextSelection);
          }

          const isRegridParcelClick =
            clickedFeature.layer?.id === 'regrid-parcels-layer' ||
            clickedFeature.layer?.id === 'regrid-parcels-outline' ||
            Boolean(clickedFeature.properties?.ll_uuid);
          if (isPrintingRef.current && isRegridParcelClick) {
            setActiveSidePanelTab('print');
          } else {
            setActiveSidePanelTab('info');
          }
          if (window.innerWidth <= 768 && typeof window.__openMobileInfoPeek === 'function') {
            window.__openMobileInfoPeek();
          }
        } else {
          setSelectedFeatures([]);
          removeHighlight();
          if (window.innerWidth <= 768 && typeof window.__collapseSidePanel === 'function') {
            window.__collapseSidePanel();
          }
        }
      }
  
      setTimeout(() => {
        mapRef.current.dragPan.enable(); // Re-enable dragging after a short delay
      }, 100);
    };
  
    // ✅ Attach event listeners
    mapRef.current.on('touchstart', handleTouchStart);
    mapRef.current.on('touchmove', handleTouchMove);
    mapRef.current.on('click', handleClick);
    mapRef.current.on('touchend', handleClick);
    return () => {
      // ✅ Cleanup event listeners
      if (mapRef.current) {
        mapRef.current.off('touchstart', handleTouchStart);
        mapRef.current.off('touchmove', handleTouchMove);
        mapRef.current.off('click', handleClick);
        mapRef.current.off('touchend', handleClick);
      }
    };
  }, [layerStatus, highlightSettings, propertyMapWizardActive, parcelMapVisibility]);
  

  /**=============== Side Panel Higlight ===============
   * useEffect: Monitors hover changes (hoveredFeatureId). If a feature is hovered,
   * we add a distinct highlight. If not hovered, we remove the highlight.
   */
  useEffect(() => {

    /**
     * Adds or removes a hover highlight for the specified feature ID in "regrid-parcels-layer".
     * 
     * @param {string|null} hoveredId - Parcel id (ll_uuid, parcelnumb, GFI, etc.) or null if no hover.
     */
    const parcelFeatureMatchesHoveredId = (feature, id) => {
      if (!id || !feature?.properties) return false;
      const hovered = String(id);
      const props = feature.properties;
      return [
        props.ll_uuid,
        props.parcelnumb,
        props.parcel_id,
        props.global_parcel_uid,
        props.GFI,
        props.pidn,
      ]
        .filter(Boolean)
        .some((value) => String(value) === hovered);
    };

    const highlightHoverFeature = (hoveredId) => {
      if (!mapRef.current || !mapRef.current.isStyleLoaded()) {
        return;
      }
  
      // Remove any existing hover highlights
      if (mapRef.current.getLayer('hover-highlight-layer')) {
        mapRef.current.removeLayer('hover-highlight-layer');
      }
      if (mapRef.current.getLayer('hover-highlight-outline-layer')) {
        mapRef.current.removeLayer('hover-highlight-outline-layer');
      }
      if (mapRef.current.getSource('hover-highlight-source')) {
        mapRef.current.removeSource('hover-highlight-source');
      }
  
      if (!hoveredId) {
        return; // Exit if no feature is hovered
      }
  
      // Query all rendered features in the relevant layer
      const queriedFeatures = mapRef.current.queryRenderedFeatures({
        layers: ['regrid-parcels-layer'], // Adjust layer name as needed
      });
  
      const matchingFeatures = queriedFeatures.filter((f) =>
        parcelFeatureMatchesHoveredId(f, hoveredId)
      );
  
      if (matchingFeatures.length === 0) {
        return;
      }
      
      // Since there will be at most one feature, use the first match directly
      let unifiedFeature; // Declare unifiedFeature outside the if-else block

      if (matchingFeatures.length > 1) {
        const featureCollection = turf.featureCollection(matchingFeatures);
        unifiedFeature = turf.union(featureCollection); // Assign the unioned feature
      } else {
        unifiedFeature = matchingFeatures[0]; // Use the single matching feature directly
      }
      

      // Add the hover highlight to the map
      try {
        mapRef.current.addSource('hover-highlight-source', {
          type: 'geojson',
          data: unifiedFeature,
        });
  
        mapRef.current.addLayer({
          id: 'hover-highlight-layer',
          type: 'fill',
          source: 'hover-highlight-source',
          paint: {
            'fill-color': 'rgba(255, 255, 0, 0.25)', // Yellow fill for hover
            'fill-outline-color': '#FFFF00', // Yellow outline for hover
            'fill-opacity': 0.5,
          },
        });
  
        mapRef.current.addLayer({
          id: 'hover-highlight-outline-layer',
          type: 'line',
          source: 'hover-highlight-source',
          paint: {
            'line-color': '#FFFF00', // Yellow outline
            'line-width': 2,
          },
        });
      } catch (error) {
        console.error("Error adding hover highlight layers:", error);
      }
    };
  
    // Call the highlightHoverFeature function when hoveredFeatureId changes
  
    // Cleanup on component unmount
    return () => {
      if (mapRef.current && mapRef.current.isStyleLoaded()) {
        if (mapRef.current.getLayer('hover-highlight-layer')) {
          mapRef.current.removeLayer('hover-highlight-layer');
        }
        if (mapRef.current.getLayer('hover-highlight-outline-layer')) {
          mapRef.current.removeLayer('hover-highlight-outline-layer');
        }
        if (mapRef.current.getSource('hover-highlight-source')) {
          mapRef.current.removeSource('hover-highlight-source');
        }
      }
    };
  }, [hoveredFeatureId, layerStatus]);
  
  /** Debug helper: show Mapbox tile boundaries on the map canvas. */
  const addTileBoundaries = () => {
    mapRef.current.showTileBoundaries = true;
  };


   /** =============== Layer sync (basemap overlays applied inside updateLayers) =============== */
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapIsReady) return undefined;

    const syncLayers = () => {
      if (!map.isStyleLoaded()) {
        const onStyleLoad = () => {
          runUpdateLayersRef.current();
        };
        map.once('style.load', onStyleLoad);
        return () => {
          map.off('style.load', onStyleLoad);
        };
      }
      runUpdateLayersRef.current();
      return undefined;
    };

    return syncLayers();
  }, [
    layerStatus,
    layerOrder,
    currentBasemapId,
    basemap,
    regridTileJsonVersion,
    propertyMapWizardActive,
    isPrinting,
    printParcelsOverlayVisible,
    mapIsReady,
  ]);

  // --- 8. Basemap overlay helpers (applied via repairBasemapOverlays inside updateLayers) ---

  const ESRI_WORLD_IMAGERY_SOURCE_ID = 'esri-world-imagery-source';

  const ESRI_WORLD_IMAGERY_TILES = [
    'https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
  ];


  /** True for app-owned layers (data, Regrid, draw, contours) vs native Mapbox style layers. */
  const isAppOverlayOrDataLayer = (layer) => {
    const id = layer?.id || '';
    if (!id) return false;
    if (MANAGED_BASEMAP_RASTER_LAYER_IDS.includes(id)) return true;
    if (
      id === ESRI_WORLD_IMAGERY_LAYER_ID ||
      id === SATELLITE_STREETS_OVERLAY_LAYER_ID ||
      id === STREETS_OVERLAY_LAYER_ID
    ) {
      return true;
    }
    if (id.startsWith('gl-draw-')) return true;
    if (id.includes('regrid')) return true;
    if (id.endsWith('-layer')) return true;
    if (id.startsWith('cv-')) return true;
    if (id.includes('contour') || id === 'terrain-colors' || id === 'sky') return true;
    return false;
  };

  /** Hide Mapbox outdoors landcover/hillshade so Esri imagery is visible (not buried under style fills). */
  const setPersistentBaseStyleUnderlayVisibility = (isVisible) => {
    const map = mapRef.current;
    if (!map || !map.getStyle) return;
    const visibility = isVisible ? 'visible' : 'none';
    const styleLayers = map.getStyle().layers || [];
    styleLayers.forEach((layer) => {
      if (isAppOverlayOrDataLayer(layer)) return;
      if (layer.type === 'symbol' && layer.source === 'composite') return;
      try {
        map.setLayoutProperty(layer.id, 'visibility', visibility);
      } catch (_) {
        /* ignore */
      }
    });
  };


  /**
   * Add or show the Esri World Imagery raster basemap.
   * @param {{ hideUnderlay?: boolean }} [options] When false, keep Discover fills visible while Esri tiles preload (avoids grey flash).
   */
  const addEsriWorldImageryRaster = (options = {}) => {
    const hideUnderlay = options.hideUnderlay !== false;
    if (!mapRef.current) return;
    const map = mapRef.current;
    if (!map.getSource(ESRI_WORLD_IMAGERY_SOURCE_ID)) {
      map.addSource(ESRI_WORLD_IMAGERY_SOURCE_ID, {
        type: 'raster',
        tiles: ESRI_WORLD_IMAGERY_TILES,
        tileSize: 256,
        minzoom: 0,
        maxzoom: 19,
      });
    }
    const styleLayers = map.getStyle().layers || [];
    const anchor = styleLayers.find((l) => l.id !== 'background' && l.type !== 'sky')?.id;
    if (!map.getLayer(ESRI_WORLD_IMAGERY_LAYER_ID)) {
      map.addLayer(
        {
          id: ESRI_WORLD_IMAGERY_LAYER_ID,
          type: 'raster',
          source: ESRI_WORLD_IMAGERY_SOURCE_ID,
          paint: {
            'raster-opacity': 1,
          },
        },
        anchor
      );
    } else {
      map.setLayoutProperty(ESRI_WORLD_IMAGERY_LAYER_ID, 'visibility', 'visible');
      stackRasterBasemapAboveBackground(map, ESRI_WORLD_IMAGERY_LAYER_ID);
    }
    if (hideUnderlay) {
      setPersistentBaseStyleUnderlayVisibility(false);
      setPersistentBaseLabelsVisibility(true);
      applyCompositeLabelStyleForBasemap(map, 'imagery');
    }
  };

  ensureImageryBasemapRef.current = (options = {}) => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded?.()) return false;
    try {
      addEsriWorldImageryRaster(options);
      return verifyBasemapAppliedOnMap(map, 'imagery');
    } catch (err) {
      console.error('ensureImageryBasemap failed:', err);
      return false;
    }
  };


  /** Raster tile URL template for a Mapbox-hosted style (satellite, streets, etc.). */
  const getMapboxStyleRasterTileUrl = (styleId) =>
    `https://api.mapbox.com/styles/v1/mapbox/${styleId}/tiles/256/{z}/{x}/{y}?access_token=${mapboxgl.accessToken}`;


  /** Add a Mapbox style as a raster overlay on top of the persistent outdoors base. */
  const addMapboxStyleRasterOverlay = (sourceId, layerId, styleId) => {
    if (!mapRef.current) return;
    if (!mapRef.current.getSource(sourceId)) {
      mapRef.current.addSource(sourceId, {
        type: 'raster',
        tiles: [getMapboxStyleRasterTileUrl(styleId)],
        tileSize: 256,
        minzoom: 0,
        maxzoom: 22,
      });
    }
    if (!mapRef.current.getLayer(layerId)) {
      mapRef.current.addLayer({
        id: layerId,
        type: 'raster',
        source: sourceId,
        paint: { 'raster-opacity': 1 },
      });
      stackRasterBasemapAboveBackground(mapRef.current, layerId);
    } else {
      mapRef.current.setLayoutProperty(layerId, 'visibility', 'visible');
      stackRasterBasemapAboveBackground(mapRef.current, layerId);
    }
  };


  /** Hide Esri / satellite / streets raster overlays (optionally keep Esri for imagery transitions). */
  const hideManagedBasemapOverlays = (keepEsriVisible = false) => {
    const map = mapRef.current;
    if (!map) return;
    [
      ...(keepEsriVisible ? [] : [ESRI_WORLD_IMAGERY_LAYER_ID]),
      SATELLITE_STREETS_OVERLAY_LAYER_ID,
      STREETS_OVERLAY_LAYER_ID,
    ].forEach((id) => {
      if (!map.getLayer(id)) return;
      try {
        map.setLayoutProperty(id, 'visibility', 'none');
      } catch (_) {
        /* ignore */
      }
    });
  };


  /** Show or hide Mapbox composite symbol (label) layers from the base outdoors style. */
  const setPersistentBaseLabelsVisibility = (isVisible) => {
    const map = mapRef.current;
    if (!map || !map.getStyle) return;
    const visibility = isVisible ? 'visible' : 'none';
    const styleLayers = map.getStyle().layers || [];
    styleLayers.forEach((layer) => {
      if (layer.type !== 'symbol') return;
      if (layer.source !== 'composite') return;
      try {
        map.setLayoutProperty(layer.id, 'visibility', visibility);
      } catch (_) {
        /* ignore */
      }
    });
  };

  repairBasemapOverlaysRef.current = (basemapId) => {
    const map = mapRef.current;
    if (!map?.isStyleLoaded?.()) return false;
    const id = String(basemapId || '').trim();
    try {
      if (id === 'imagery' || id === 'imagery-3d' || id === 'esri-world-imagery') {
        hideManagedBasemapOverlays();
        const repaired = Boolean(ensureImageryBasemapRef.current({ hideUnderlay: true }));
        if (repaired) restackDataLayersAboveBasemapOverlays(map);
        return (
          repaired &&
          verifyBasemapAppliedOnMap(map, id) &&
          !needsBasemapOverlayMaintenance(map, id)
        );
      }
      if (id === 'satellite-streets-v12') {
        hideManagedBasemapOverlays();
        setPersistentBaseStyleUnderlayVisibility(false);
        addMapboxStyleRasterOverlay(
          SATELLITE_STREETS_OVERLAY_SOURCE_ID,
          SATELLITE_STREETS_OVERLAY_LAYER_ID,
          'satellite-v9'
        );
        setPersistentBaseLabelsVisibility(true);
        applyCompositeLabelStyleForBasemap(map, id);
        restackDataLayersAboveBasemapOverlays(map);
        return (
          verifyBasemapAppliedOnMap(map, id) &&
          !needsBasemapOverlayMaintenance(map, id)
        );
      }
      if (id === 'streets-v11') {
        hideManagedBasemapOverlays();
        setPersistentBaseStyleUnderlayVisibility(false);
        addMapboxStyleRasterOverlay(STREETS_OVERLAY_SOURCE_ID, STREETS_OVERLAY_LAYER_ID, 'streets-v11');
        setPersistentBaseLabelsVisibility(false);
        restackDataLayersAboveBasemapOverlays(map);
        return (
          verifyBasemapAppliedOnMap(map, id) &&
          !needsBasemapOverlayMaintenance(map, id)
        );
      }
      if (id === 'outdoors-v12' || id === PERSISTENT_BASE_STYLE_ID) {
        hideManagedBasemapOverlays();
        setPersistentBaseStyleUnderlayVisibility(true);
        setPersistentBaseLabelsVisibility(true);
        return (
          verifyBasemapAppliedOnMap(map, id) &&
          !needsBasemapOverlayMaintenance(map, id)
        );
      }
    } catch (_) {
      /* ignore */
    }
    return false;
  };

  scheduleBasemapUntilVerifiedRef.current = (basemapId, attempt = 0) => {
    const map = mapRef.current;
    const id = normalizeBasemapId(
      basemapId || urlBasemapIdRef.current || activeBasemapIdRef?.current || baseMapRef.current
    );
    if (!map || !id) return;

    const basemapStackOk = () =>
      map.isStyleLoaded?.() &&
      verifyBasemapAppliedOnMap(map, id) &&
      !needsBasemapOverlayMaintenance(map, id);

    const markVerified = () => {
      window.clearTimeout(basemapVerifyRetryTimerRef.current);
      basemapVerifyRetryTimerRef.current = null;
      lastAppliedBasemapRef.current = id;
      needsInitialBasemapApplyRef.current = false;
      initialBasemapRestoreCompleteRef.current = true;
      try {
        syncMapUrlRef.current();
      } catch (_) {
        /* ignore */
      }
    };

    if (basemapStackOk()) {
      markVerified();
      return;
    }

    const MAX_ATTEMPTS = 14;
    if (attempt >= MAX_ATTEMPTS) {
      initialBasemapRestoreCompleteRef.current = true;
      return;
    }

    void runUpdateLayersRef.current().then(() => {
      if (basemapStackOk()) {
        markVerified();
        return;
      }
      window.clearTimeout(basemapVerifyRetryTimerRef.current);
      basemapVerifyRetryTimerRef.current = window.setTimeout(() => {
        scheduleBasemapUntilVerifiedRef.current(id, attempt + 1);
      }, 160 + attempt * 90);
    });
  };


  /** Move all symbol layers to the top of the Mapbox layer stack. */
  const bringLabelsToTop = useCallback(() => {
    const map = mapRef.current;
    if (!map?.getStyle) return;
    const styleLayers = map.getStyle().layers || [];
    styleLayers.forEach((layer) => {
      if (layer.type !== 'symbol') return;
      if (isTourVicinityMapLayerId(layer.id)) return;
      try {
        const live = map.getLayer(layer.id);
        if (!live?.layout) return;
        map.moveLayer(layer.id);
      } catch (_) {
        /* layer may be mid-removal */
      }
    });
    if (propertyTourSlideIdRef.current === 'vicinity' || isPropertyTourVicinitySlideActive()) {
      ensureTourVicinityNearbyLayersOnTop(map);
    }
    ensureTourEditRadiusLayersOnTop(map);
  }, [mapRef]);


  /** Detach pending `sourcedata` listeners used while waiting for label source readiness. */
  const clearLabelSourceWaitHandlers = useCallback((map) => {
    if (!map) return;
    labelSourceWaitHandlersRef.current.forEach((handler) => {
      try {
        map.off('sourcedata', handler);
      } catch (_) {
        /* ignore */
      }
    });
    labelSourceWaitHandlersRef.current.clear();
  }, []);

  /** Hide then remove on idle — avoids Mapbox `continuePlacement` / undefined layout crashes. */
  const hideLabelLayerSafe = useCallback((map, labelLayerId) => {
    if (!map?.getLayer(labelLayerId)) return;
    try {
      map.setLayoutProperty(labelLayerId, 'visibility', 'none');
    } catch (_) {
      /* ignore */
    }
    map.once('idle', () => {
      try {
        if (map.getStyle() && map.getLayer(labelLayerId)) {
          map.removeLayer(labelLayerId);
        }
      } catch (_) {
        /* ignore */
      }
    });
  }, []);

  /** Re-pin Regrid after Draw / highlights / labels mutate the layer stack (esp. after basemap setStyle). */
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapIsReady) return undefined;

    /** Layer order + visibility only — no tile reload (reload caused lag + restack feedback). */
    const restack = () => {
      if (!map.isStyleLoaded?.()) return;
      bringRegridParcelLayersBeforeSymbolLabels(map);
      applyParcelVisualizationVisibility(map, parcelMapVisibility);
      bringLabelsToTop();
      applyCompositeLabelStyleForBasemap(map, regridStyleBasemapRef.current);
      const wantedBasemap = String(
        activeBasemapIdRef?.current || regridStyleBasemapRef.current || ''
      ).trim();
      if (wantedBasemap && needsBasemapOverlayMaintenance(map, wantedBasemap)) {
        repairBasemapOverlaysRef.current(wantedBasemap);
      }
      const selection = selectedFeatureRef.current;
      if (selection?.length) {
        repaintSelectionHighlightRef.current(selection, { syncOwnership: false });
      }
      if (propertyTourSlideIdRef.current === 'vicinity' || isPropertyTourVicinitySlideActive()) {
        ensureTourVicinityNearbyLayersOnTop(map);
      }
      ensureTourEditRadiusLayersOnTop(map);
    };

    map.on(CV_REGRID_RESTACK_EVENT, restack);
    return () => {
      map.off(CV_REGRID_RESTACK_EVENT, restack);
    };
  }, [mapRef, mapIsReady, layerStatus, parcelMapVisibility, bringLabelsToTop, activeBasemapIdRef]);


  /** Add/show/hide per-layer name labels (ownership owner names, etc.) based on `layerLabels` toggles. */
  const applyLabelLayers = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;

    if (!map.isStyleLoaded()) {
      map.once('styledata', applyLabelLayers);
      return;
    }

    clearLabelSourceWaitHandlers(map);

    const syncLabelLayer = (layerName, shouldShowLabels) => {
      const labelLayerId =
        layerName === 'ownership' ? 'ownership-label-layer' : `${layerName}-label-layer`;
      const labelSourceId = layerName === 'ownership' ? 'regrid-parcels' : layerName;

      if (!shouldShowLabels) {
        hideLabelLayerSafe(map, labelLayerId);
        return;
      }

      if (!map.getSource(labelSourceId)) {
        return;
      }

      const addOrShowLabelLayer = () => {
        if (!map.getSource(labelSourceId)) return;
        if (map.getLayer(labelLayerId)) {
          try {
            map.setLayoutProperty(labelLayerId, 'visibility', 'visible');
          } catch (_) {
            /* ignore */
          }
          return;
        }
        try {
          const labelStyle =
            layerName === 'ownership'
              ? getLabelLayerStyle('ownership', {
                  regridVectorSourceLayer: getRegridVectorSourceLayerId(getCachedRegridTileJson()),
                })
              : getLabelLayerStyle(layerName);
          map.addLayer(labelStyle);
        } catch (error) {
          console.error(`Error adding label layer ${labelLayerId}:`, error);
        }
      };

      const source = map.getSource(labelSourceId);
      if (source?.loaded?.()) {
        addOrShowLabelLayer();
        return;
      }

      const prior = labelSourceWaitHandlersRef.current.get(layerName);
      if (prior) {
        try {
          map.off('sourcedata', prior);
        } catch (_) {
          /* ignore */
        }
      }

      const sourceDataHandler = (e) => {
        if (e.sourceId !== labelSourceId || !e.isSourceLoaded) return;
        const labelsStillWanted =
          Boolean(layerLabelsRef.current[layerName]) &&
          (layerName !== 'ownership' || Boolean(layerStatusRef.current?.ownership));
        if (!labelsStillWanted) {
          map.off('sourcedata', sourceDataHandler);
          labelSourceWaitHandlersRef.current.delete(layerName);
          hideLabelLayerSafe(map, labelLayerId);
          return;
        }
        addOrShowLabelLayer();
        map.off('sourcedata', sourceDataHandler);
        labelSourceWaitHandlersRef.current.delete(layerName);
      };
      labelSourceWaitHandlersRef.current.set(layerName, sourceDataHandler);
      map.on('sourcedata', sourceDataHandler);
    };

    Object.entries(layerLabels).forEach(([layerName, shouldShowLabels]) => {
      const showLabels =
        layerName === 'ownership'
          ? Boolean(shouldShowLabels) && Boolean(layerStatus.ownership)
          : Boolean(shouldShowLabels);
      syncLabelLayer(layerName, showLabels);
    });

    map.once('idle', () => {
      if (!mapRef.current || map !== mapRef.current) return;
      bringLabelsToTop();
      fireRegridRestack(map);
      if (propertyTourSlideIdRef.current === 'vicinity' || isPropertyTourVicinitySlideActive()) {
        ensureTourVicinityNearbyLayersOnTop(map);
      }
    });
  }, [
    layerLabels,
    layerStatus,
    mapRef,
    bringLabelsToTop,
    clearLabelSourceWaitHandlers,
    hideLabelLayerSafe,
  ]);

  applyLabelLayersRef.current = applyLabelLayers;
  hideLabelLayerSafeRef.current = hideLabelLayerSafe;

  useEffect(() => {
    applyLabelLayers();
    return () => {
      clearLabelSourceWaitHandlers(mapRef.current);
    };
  }, [applyLabelLayers, clearLabelSourceWaitHandlers]);


  /** Remove Mapbox terrain contour line and hillshade layers from the map. */
  const removeContourLayers = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;
    [
      'contour-labels-minor',
      'contour-labels-major',
      'contour-lines-minor',
      'contour-lines-major',
      'terrain-colors',
    ].forEach((id) => {
      try {
        if (map.getLayer(id)) map.removeLayer(id);
      } catch (_) {
        /* ignore */
      }
    });
  }, [mapRef]);

  const BUILDINGS_3D_LAYER_ID = 'cv-3d-buildings-layer';


  /** Add or show extruded 3D buildings from the Mapbox composite source. */
  const ensure3DBuildingsLayer = useCallback(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded?.()) return;
    if (!map.getSource('composite')) return;
    const styleLayers = map.getStyle().layers || [];
    const firstSymbolLayer = styleLayers.find((layer) => layer.type === 'symbol');
    const beforeId = firstSymbolLayer ? firstSymbolLayer.id : undefined;
    if (!map.getLayer(BUILDINGS_3D_LAYER_ID)) {
      map.addLayer(
        {
          id: BUILDINGS_3D_LAYER_ID,
          source: 'composite',
          'source-layer': 'building',
          filter: [
            'any',
            ['==', ['get', 'extrude'], 'true'],
            ['==', ['get', 'extrude'], true],
          ],
          type: 'fill-extrusion',
          minzoom: 14.5,
          paint: {
            'fill-extrusion-color': '#b3b3b3',
            'fill-extrusion-height': ['coalesce', ['get', 'height'], 0],
            'fill-extrusion-base': ['coalesce', ['get', 'min_height'], 0],
            'fill-extrusion-opacity': 0.65,
          },
        },
        beforeId
      );
    } else {
      map.setLayoutProperty(BUILDINGS_3D_LAYER_ID, 'visibility', 'visible');
      if (beforeId) {
        try {
          map.moveLayer(BUILDINGS_3D_LAYER_ID, beforeId);
        } catch (_) {
          /* ignore */
        }
      }
    }
  }, [mapRef]);


  /** Remove the 3D buildings extrusion layer. */
  const remove3DBuildingsLayer = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;
    try {
      if (map.getLayer(BUILDINGS_3D_LAYER_ID)) {
        map.removeLayer(BUILDINGS_3D_LAYER_ID);
      }
    } catch (_) {
      /* ignore */
    }
  }, [mapRef]);


  /** Add major/minor elevation contour lines from Mapbox terrain-v2. */
  const ensureContourLayers = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;
    if (!map.getSource('contour-lines-source')) {
      map.addSource('contour-lines-source', {
        type: 'vector',
        url: 'mapbox://mapbox.mapbox-terrain-v2',
      });
    }
    const styleLayers = map.getStyle().layers || [];
    const beforeLayer = styleLayers.find((layer) => layer.type === 'symbol' && layer.id.includes('label'));
    const beforeId = beforeLayer ? beforeLayer.id : undefined;
    if (!map.getLayer('contour-lines-major')) {
      map.addLayer({
        id: 'contour-lines-major',
        type: 'line',
        source: 'contour-lines-source',
        'source-layer': 'contour',
        filter: ['==', ['%', ['get', 'ele'], 100], 0],
        paint: { 'line-color': '#FF4500', 'line-width': 1.5, 'line-opacity': 0.9 },
      }, beforeId);
    }
    if (!map.getLayer('contour-lines-minor')) {
      map.addLayer({
        id: 'contour-lines-minor',
        type: 'line',
        source: 'contour-lines-source',
        'source-layer': 'contour',
        filter: ['!=', ['%', ['get', 'ele'], 100], 0],
        paint: { 'line-color': '#FF4500', 'line-width': 1.0, 'line-opacity': 0.6 },
      }, beforeId);
    }
  }, [mapRef]);


  /** Apply 3D terrain/buildings/sky and contour layers based on `is3DEnabled` / `isContoursEnabled`. */
  const applyBasemapEnhancements = useCallback(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded?.()) return;
    const use3D =
      is3DEnabled ||
      is3DEnabledRef.current ||
      baseMapRef.current === 'imagery-3d';
    if (use3D) {
      try {
        if (!map.getSource('mapbox-dem')) {
          map.addSource('mapbox-dem', {
            type: 'raster-dem',
            url: 'mapbox://mapbox.terrain-rgb',
            tileSize: 512,
            maxzoom: 14,
          });
        }
        map.setTerrain({ source: 'mapbox-dem', exaggeration: 1.5 });
        if (!map.getLayer('sky')) {
          map.addLayer({
            id: 'sky',
            type: 'sky',
            paint: {
              'sky-type': 'atmosphere',
              'sky-atmosphere-sun': [0.0, 0.0],
              'sky-atmosphere-sun-intensity': 15,
            },
          });
        }
        ensure3DBuildingsLayer();
      } catch (_) {
        /* ignore */
      }
    } else {
      try {
        map.setTerrain(null);
      } catch (_) {
        /* ignore */
      }
      try {
        if (map.getLayer('sky')) map.removeLayer('sky');
      } catch (_) {
        /* ignore */
      }
      remove3DBuildingsLayer();
    }
    if (isContoursEnabled) {
      try {
        ensureContourLayers();
      } catch (_) {
        /* ignore */
      }
    } else {
      removeContourLayers();
    }
    try {
      if (parcelMapVisibilityRef.current?.showRegrid) {
        bringRegridParcelLayersBeforeSymbolLabels(map);
        applyParcelVisualizationVisibility(map, parcelMapVisibilityRef.current);
      }
      bringLabelsToTop();
      applyCompositeLabelStyleForBasemap(map, regridStyleBasemapRef.current);
    } catch (_) {
      /* ignore */
    }
  }, [mapRef, is3DEnabled, isContoursEnabled, ensureContourLayers, removeContourLayers, ensure3DBuildingsLayer, remove3DBuildingsLayer, bringLabelsToTop]);

  /** Restack data + parcel layers above basemap rasters — no zoom nudge or staged reloads. */
  const restackDataAndParcelsOnce = useCallback(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded?.()) return;
    try {
      restackDataLayersAboveBasemapOverlays(map);
      syncRegridParcelLayersIntoMap(map, parcelMapVisibilityRef.current);
      bringRegridParcelLayersBeforeSymbolLabels(map);
      applyParcelVisualizationVisibility(map, parcelMapVisibilityRef.current);
      bringLabelsToTop();
      applyCompositeLabelStyleForBasemap(map, regridStyleBasemapRef.current);
      if (propertyTourSlideIdRef.current === 'vicinity' || isPropertyTourVicinitySlideActive()) {
        ensureTourVicinityNearbyLayersOnTop(map);
      }
      const wantedBasemap = String(
        activeBasemapIdRef?.current || regridStyleBasemapRef.current || ''
      ).trim();
      if (wantedBasemap && needsBasemapOverlayMaintenance(map, wantedBasemap)) {
        repairBasemapOverlaysRef.current(wantedBasemap);
        if (propertyTourSlideIdRef.current === 'vicinity' || isPropertyTourVicinitySlideActive()) {
          ensureTourVicinityNearbyLayersOnTop(map);
        }
      }
      fireRegridRestack(map);
      const selection = selectedFeatureRef.current;
      if (selection?.length) {
        repaintSelectionHighlightRef.current(selection, { syncOwnership: false });
      }
      if (typeof map.triggerRepaint === 'function') map.triggerRepaint();
    } catch (_) {
      /* ignore */
    }
  }, [mapRef, activeBasemapIdRef]);

  restackDataAndParcelsOnceRef.current = restackDataAndParcelsOnce;

  maintainBasemapStackRef.current = () => {
    const map = mapRef.current;
    if (!map?.isStyleLoaded?.()) return;
    const wanted = normalizeBasemapId(
      urlBasemapIdRef.current || activeBasemapIdRef?.current || baseMapRef.current
    );
    if (!wanted || !needsBasemapOverlayMaintenance(map, wanted)) return;
    repairBasemapOverlaysRef.current(wanted);
    try {
      restackDataLayersAboveBasemapOverlays(map);
      if (parcelMapVisibilityRef.current?.showRegrid) {
        bringRegridParcelLayersBeforeSymbolLabels(map);
        applyParcelVisualizationVisibility(map, parcelMapVisibilityRef.current);
      }
      bringLabelsToTop();
      applyCompositeLabelStyleForBasemap(map, wanted);
      if (propertyTourSlideIdRef.current === 'vicinity' || isPropertyTourVicinitySlideActive()) {
        ensureTourVicinityNearbyLayersOnTop(map);
      }
    } catch (_) {
      /* ignore */
    }
  };

  /** Repair raster overlays + restack data/Regrid after basemap or ownership layer order changes. */
  const finalizeBasemapVisualStackRef = useRef(() => {});
  finalizeBasemapVisualStackRef.current = () => {
    const map = mapRef.current;
    if (!map?.isStyleLoaded?.()) return;
    const wanted = normalizeBasemapId(
      activeBasemapIdRef?.current || baseMapRef.current || urlBasemapIdRef.current
    );
    if (wanted) {
      repairBasemapOverlaysRef.current(wanted);
    }
    restackDataAndParcelsOnce();
    try {
      applyParcelVisualizationVisibility(map, parcelMapVisibilityRef.current);
    } catch (_) {
      /* ignore */
    }
    syncMapUrlRef.current();
  };

  useEffect(() => {
    window.setBasemapLayerSyncBlocked = () => {
      // no-op: basemap overlays and data layers share the updateLayers pipeline
    };
    return () => {
      delete window.setBasemapLayerSyncBlocked;
    };
  }, []);

  useEffect(() => {
    if (!mapIsReady || !mapRef.current?.isStyleLoaded?.()) return;
    applyBasemapEnhancements();
  }, [mapIsReady, applyBasemapEnhancements]);

  /**
   * Debounced basemap verify on idle — runs updateLayers when overlays drift from selection.
   */
  useEffect(() => {
    const map = mapRef.current;
    if (!mapIsReady || !map) return undefined;

    const getWantedBasemapId = () =>
      normalizeBasemapId(
        urlBasemapIdRef.current ||
          activeBasemapIdRef?.current ||
          baseMapRef.current ||
          currentBasemapId ||
          getBasemapIdFromSearch(window.location.search)
      );

    const syncBasemapIfNeeded = () => {
      if (!mapRef.current?.isStyleLoaded?.()) return;
      const wanted = getWantedBasemapId();
      if (!wanted) return;

      const liveMap = mapRef.current;
      const overlaysOk =
        verifyBasemapAppliedOnMap(liveMap, wanted) &&
        !needsBasemapOverlayMaintenance(liveMap, wanted);

      if (overlaysOk) {
        lastAppliedBasemapRef.current = activeBasemapIdRef?.current || wanted;
        needsInitialBasemapApplyRef.current = false;
        initialBasemapRestoreCompleteRef.current = true;
        return;
      }

      lastAppliedBasemapRef.current = null;
      runUpdateLayersRef.current();
    };

    syncBasemapIfNeeded();
    map.once('style.load', syncBasemapIfNeeded);

    let debounceId;
    const onIdle = () => {
      window.clearTimeout(debounceId);
      debounceId = window.setTimeout(syncBasemapIfNeeded, 700);
    };
    map.on('idle', onIdle);

    return () => {
      window.clearTimeout(debounceId);
      try {
        map.off('style.load', syncBasemapIfNeeded);
        map.off('idle', onIdle);
      } catch (_) {
        /* ignore */
      }
    };
  }, [mapIsReady, currentBasemapId]);

  /** Re-apply when the URL `basemap` param changes after initial load (back/forward, edited address bar). */
  useEffect(() => {
    const { id: fromUrl, enable3D, raw } = parseBasemapFromSearch(window.location.search);
    const hadParam = queryString.parse(window.location.search).basemap != null;
    if (!hadParam && fromUrl === DEFAULT_BASEMAP_ID) {
      prevUrlBasemapRef.current = raw || fromUrl;
      return;
    }
    const urlKey = raw || fromUrl;
    if (urlKey === prevUrlBasemapRef.current) return;
    prevUrlBasemapRef.current = urlKey;

    if (!initialBasemapRestoreCompleteRef.current) return;

    const publishedId = enable3D && fromUrl === 'imagery' ? 'imagery-3d' : fromUrl;
    urlBasemapIdRef.current = publishedId;
    publishBasemapSelection(publishedId);

    if (!mapIsReady || !mapRef.current?.isStyleLoaded?.()) return;
    applyBasemapByIdRef.current(fromUrl, undefined, { enable3D });
  }, [routerLocation.search, mapIsReady, publishBasemapSelection]);

  if (applyTourPropertyBasemapRef) {
    applyTourPropertyBasemapRef.current = async () => {
      const map = mapRef.current;
      if (!map) return;

      is3DEnabledRef.current = true;
      setIs3DEnabled(true);

      if (isTourImagery3DActive(map)) {
        applyBasemapEnhancements();
        return;
      }

      const applyOnce = () =>
        new Promise((resolve) => {
          try {
            applyBasemapByIdRef.current('imagery', resolve, { enable3D: true });
          } catch (_) {
            resolve();
          }
        });

      const deadline = Date.now() + 22000;
      while (Date.now() < deadline) {
        await applyOnce();
        applyBasemapEnhancements();
        await waitUntilTourImagery3DActive(map, { timeoutMs: 3500, pollMs: 150 });
        if (isTourImagery3DActive(map)) return;
      }
      applyBasemapEnhancements();
    };
  }

  /** Same code path as the basemap picker — used when opening a saved print map or client share. */
  const applyBasemapByIdRef = useRef(() => {});
  applyBasemapByIdRef.current = (basemapId, onReady, options = {}) => {
    const raw = String(basemapId || '').trim().toLowerCase();
    const id = normalizeBasemapId(basemapId);
    const enable3D = options.enable3D === true || raw === 'imagery-3d';
    mapDebug.trace('applyBasemapById', id, { enable3D });
    if (pendingPrintBasemapRestoreRef) pendingPrintBasemapRestoreRef.current = null;

    if (enable3D) {
      is3DEnabledRef.current = true;
      setIs3DEnabled(true);
    }

    const publishedId = enable3D && id === 'imagery' ? 'imagery-3d' : id;
    publishBasemapSelection(publishedId);
    lastAppliedBasemapRef.current = null;
    restoringPrintBasemapRef.current = true;

    void runUpdateLayersRef.current().then(() => {
      restoringPrintBasemapRef.current = false;
      try {
        applyBasemapEnhancements();
        applyLabelLayers();
      } catch (_) {
        /* ignore */
      }
      const appliedId = normalizeBasemapId(activeBasemapIdRef?.current || publishedId);
      const map = mapRef.current;
      if (
        map &&
        verifyBasemapAppliedOnMap(map, appliedId) &&
        !needsBasemapOverlayMaintenance(map, appliedId)
      ) {
        lastAppliedBasemapRef.current = appliedId;
        initialBasemapRestoreCompleteRef.current = true;
        needsInitialBasemapApplyRef.current = false;
        try {
          syncMapUrlRef.current();
        } catch (_) {
          /* ignore */
        }
      } else {
        scheduleBasemapUntilVerifiedRef.current(appliedId);
      }
      try {
        onReady?.();
      } catch (_) {
        /* ignore */
      }
    });
  };

  /** Property tour: re-apply Esri + terrain if UI says 3D but the live map stack is still flat. */
  useEffect(() => {
    if (!mapIsReady || !mapRef.current) return undefined;
    const map = mapRef.current;
    const isTourMode = () =>
      typeof document !== 'undefined' &&
      document.documentElement.classList.contains('shared-tour-mode');

    const reconcileTourImagery3D = () => {
      if (!isTourMode()) return;
      try {
        // Don't fight an in-flight tour fly/orbit — that stalls zoom+orbit on first pass.
        if (typeof map.isMoving === 'function' && map.isMoving()) return;
      } catch (_) {
        /* ignore */
      }
      if (isTourImagery3DActive(map) && is3DEnabledRef.current) return;
      is3DEnabledRef.current = true;
      setIs3DEnabled(true);
      try {
        applyBasemapByIdRef.current('imagery', undefined, { enable3D: true });
        applyBasemapEnhancements();
      } catch (_) {
        /* ignore */
      }
    };

    if (isTourMode()) reconcileTourImagery3D();
    map.on('idle', reconcileTourImagery3D);
    return () => {
      try {
        map.off('idle', reconcileTourImagery3D);
      } catch (_) {
        /* ignore */
      }
    };
  }, [mapIsReady]);

  useEffect(() => {
    window.applyBasemapById = (basemapId, onReady) => {
      const raw = String(basemapId || '').trim().toLowerCase();
      applyBasemapByIdRef.current(basemapId, onReady, { enable3D: raw === 'imagery-3d' });
    };
    /** Light re-apply when overlays are stale (e.g. Create Map route change) without a full slow restore. */
    window.nudgeBasemapById = (basemapId) => {
      const id = normalizeBasemapId(
        basemapId || activeBasemapIdRef?.current || currentBasemapId || getBasemapIdFromSearch(window.location.search)
      );
      if (id && activeBasemapIdRef) activeBasemapIdRef.current = id;
      lastAppliedBasemapRef.current = null;
      runUpdateLayersRef.current();
    };
    return () => {
      delete window.applyBasemapById;
      delete window.nudgeBasemapById;
    };
  }, [currentBasemapId, activeBasemapIdRef]);

  /** After map is ready, apply `?basemap=` from URL (ownership stacks in `updateLayers` like other layers). */
  useEffect(() => {
    if (!mapIsReady || !mapRef.current) return undefined;

    const applyBasemapFromUrl = () => {
      const map = mapRef.current;
      if (!map?.isStyleLoaded?.()) return;
      if (initialUrlBasemapAppliedRef.current) return;
      initialUrlBasemapAppliedRef.current = true;

      const { id: basemapId, enable3D } = parseBasemapFromSearch(window.location.search);
      urlBasemapIdRef.current = enable3D && basemapId === 'imagery' ? 'imagery-3d' : basemapId;
      initialBasemapRestoreCompleteRef.current = false;
      needsInitialBasemapApplyRef.current = true;
      mapDebug.trace('applyBasemapById (url on mapIsReady)', basemapId, { enable3D });
      applyBasemapByIdRef.current(basemapId, undefined, { enable3D });
    };

    applyBasemapFromUrl();
    if (initialUrlBasemapAppliedRef.current) return undefined;

    const map = mapRef.current;
    map.once('style.load', applyBasemapFromUrl);
    map.once('idle', applyBasemapFromUrl);
    return () => {
      try {
        map.off('style.load', applyBasemapFromUrl);
        map.off('idle', applyBasemapFromUrl);
      } catch (_) {
        /* ignore */
      }
    };
  }, [mapIsReady]);


  /** UI basemap picker — same path as saved print maps and URL restore. */
  const selectBasemapById = (id) => {
    applyBasemapByIdRef.current(id);
  };

  // Basemap configuration with thumbnails — all options use selectBasemapById (single apply path).
  const basemapConfig = [
    { id: 'outdoors-v12', label: 'Discover', image: '/basemaps/outdoors-v12.png', fallback: '/logo192.png', onClick: () => selectBasemapById('outdoors-v12') },
    { id: 'imagery', label: 'Imagery', image: '/high_def.png', fallback: '/logo192.png', onClick: () => selectBasemapById('imagery') },
    { id: 'satellite-streets-v12', label: 'Satellite', image: '/basemaps/streets-v11-3d.png', fallback: '/basemaps/streets-v11.png', onClick: () => selectBasemapById('satellite-streets-v12') },
    { id: 'streets-v11', label: 'Streets', image: '/basemaps/streets-v11.png', fallback: '/logo192.png', onClick: () => selectBasemapById('streets-v11') },
  ];

  const printBasemapOptionList = basemapConfig.map(({ id, label, image, fallback }) => ({
    id,
    label,
    image,
    fallback,
  }));


  /** Print layout basemap dropdown — same apply path as the main map basemap picker. */
  const handlePrintBasemapSelect = (optionId) => {
    applyBasemapByIdRef.current(optionId);
  };


    /** =============== Zooms and Higlights when map it from search ===============
   * useEffect: Watches for changes in `isMapTriggeredFromSearch` plus `focusFeatures`.
   * If triggered, we zoom and highlight the search results via `handleFeatureZoomAndHighlight`.
   */
    useEffect(() => {
  
      if (isMapTriggeredFromSearch && focusFeatures.length > 0) {
          handleFeatureZoomAndHighlight(focusFeatures);
          
          setIsMapTriggeredFromSearch(false); // Reset trigger after execution
      } else {
      }
  }, [isMapTriggeredFromSearch, focusFeatures]);
  

  /** Search/navigation: fit bounds to features, query rendered parcels, then highlight matches. */
  const handleFeatureZoomAndHighlight = (features) => {
    if (!features || features.length === 0) {
      return;
    }
  
  
    // Remove existing highlights
    removeHighlight();
    
    // Build bbox list from either explicit bbox or feature geometry
    const featuresWithBbox = features
      .map((feature) => {
        if (Array.isArray(feature?.bbox) && feature.bbox.length === 4) {
          return { ...feature, bbox: feature.bbox };
        }

        if (feature?.geometry) {
          try {
            const geometryBbox = turf.bbox({
              type: 'Feature',
              geometry: feature.geometry,
              properties: {},
            });
            if (Array.isArray(geometryBbox) && geometryBbox.length === 4) {
              return { ...feature, bbox: geometryBbox };
            }
          } catch (error) {
          }
        }

        return null;
      })
      .filter(Boolean);
    
    if (featuresWithBbox.length > 0) {
      // Calculate combined bounds from feature bboxes
      const bounds = featuresWithBbox.reduce((acc, feature) => {
        const [minX, minY, maxX, maxY] = feature.bbox;
        acc = acc
          ? [
              Math.min(acc[0], minX),
              Math.min(acc[1], minY),
              Math.max(acc[2], maxX),
              Math.max(acc[3], maxY),
            ]
          : [minX, minY, maxX, maxY];
        return acc;
      }, null);
    
      const paddingValue = window.innerWidth < 768 ? 10 : 200; // 10px on mobile, 200px on desktop
      if (bounds && bounds.length === 4) {
        mapRef.current.fitBounds(bounds, {
          padding: paddingValue,
          duration: 1000, // Add smooth animation duration
        });
      } else {
      }
    } else {
      // Optionally zoom to a default area or just highlight without zooming
    }
  
    // Step 3: After zooming (or immediately if no bbox), highlight all features
    const highlightFeatures = () => {
  
      const searchableLayers = [
        'regrid-parcels-layer',
        ...(layerStatus.ownership ? ['regrid-parcels-layer', 'regrid-parcels-outline'] : []),
      ].filter((layerId) => mapRef.current.getLayer(layerId));
      const queriedFeatures = searchableLayers.length > 0
        ? mapRef.current.queryRenderedFeatures({ layers: searchableLayers })
        : [];

      // Match by multiple identifiers so both legacy and Regrid features can be focused.
      const inputIds = new Set(
        features.flatMap((feature, index) => {
          const ids = [
            feature?.GFI,
            feature?.global_parcel_uid,
            feature?.ll_uuid,
            feature?.parcelnumb,
            feature?.county_parcel_id,
            feature?.pidn,
            feature?.properties?.GFI,
            feature?.properties?.global_parcel_uid,
            feature?.properties?.ll_uuid,
            feature?.properties?.parcelnumb,
            feature?.properties?.pidn,
          ].filter(Boolean).map((value) => String(value));

          return ids;
        })
      );

      const matchingFeatures = queriedFeatures.filter((f) => {
        const candidateIds = [
          f?.properties?.GFI,
          f?.properties?.global_parcel_uid,
          f?.properties?.ll_uuid,
          f?.properties?.parcelnumb,
          f?.properties?.pidn,
          f?.properties?.fid,
          f?.properties?.ogc_fid,
        ].filter(Boolean).map((value) => String(value));

        return candidateIds.some((id) => inputIds.has(id));
      });
      
      if (matchingFeatures.length === 0) {
        setSelectedFeatures(features);
        highlightFeature(features);
        setActiveSidePanelTab('info');
        return;
      }
  
  
      // ✅ DEDUPLICATE: Remove duplicate features based on GFI
      const uniqueFeatures = matchingFeatures.filter((feature, index, self) => {
        const gfi = feature.properties?.GFI;
        return self.findIndex(f => f.properties?.GFI === gfi) === index;
      });
      
  
      setIsMapTriggeredFromSearch(false);
      setSelectedFeatures(uniqueFeatures); // Use deduplicated features
      // Highlight the matching features
      highlightFeature(uniqueFeatures); // Use deduplicated features
  
      // Switch to the info tab after highlighting
      setActiveSidePanelTab('info');
    };
    
    if (featuresWithBbox.length > 0) {
      // Wait for zoom to complete before highlighting
      mapRef.current.once('idle', highlightFeatures);
    } else {
      // Highlight immediately if no zoom needed
      highlightFeatures();
    }
    };

  /** Fly/fit map to one feature's bbox without changing the current selection highlight. */
  const zoomToIndividualFeature = async (feature) => {
    const parseBbox = (bboxValue) => {
      if (!bboxValue) return null;
      if (Array.isArray(bboxValue) && bboxValue.length === 4) return bboxValue;
      if (typeof bboxValue === 'string') {
        try {
          const parsed = JSON.parse(bboxValue);
          return Array.isArray(parsed) && parsed.length === 4 ? parsed : null;
        } catch (_) {
          return null;
        }
      }
      return null;
    };

    const zoomToBounds = (bboxArray) => {
      const [minX, minY, maxX, maxY] = bboxArray;
      const bounds = [minX, minY, maxX, maxY];
      const paddingValue = window.innerWidth < 768 ? 50 : 150;
      mapRef.current.fitBounds(bounds, {
        padding: paddingValue,
        duration: 1000,
      });
    };

    // 1) Use explicit bbox if present.
    const directBbox = parseBbox(feature?.properties?.bbox || feature?.bbox);
    if (directBbox) {
      zoomToBounds(directBbox);
      return;
    }

    // 2) Use feature geometry if present.
    if (feature?.geometry) {
      try {
        zoomToBounds(turf.bbox(turf.feature(feature.geometry)));
        return;
      } catch (error) {
      }
    }

    // 3) Resolve geometry from rendered Regrid parcels when we have a parcel id but no geometry.
    const parcelIds = [
      feature?.properties?.ll_uuid,
      feature?.properties?.parcelnumb,
      feature?.properties?.GFI,
      feature?.properties?.global_parcel_uid,
    ].filter(Boolean).map(String);
    if (parcelIds.length > 0 && mapRef.current.getLayer('regrid-parcels-layer')) {
      const renderedParcels = mapRef.current.queryRenderedFeatures({ layers: ['regrid-parcels-layer'] });
      const match = renderedParcels.find((f) => {
        if (!f?.geometry) return false;
        const props = f.properties || {};
        return parcelIds.some((id) =>
          [props.ll_uuid, props.parcelnumb, props.GFI, props.global_parcel_uid]
            .filter(Boolean)
            .some((value) => String(value) === id)
        );
      });
      if (match?.geometry) {
        try {
          zoomToBounds(turf.bbox(turf.feature(match.geometry)));
          return;
        } catch (error) {
        }
      }
    }

    // 4) Regrid fallback: fetch parcel by ll_uuid and zoom to returned geometry.
    const llUuid = feature?.properties?.ll_uuid;
    if (llUuid) {
      try {
        const apiFeat = await fetchParcelGeoJsonFeatureByLlUuid(llUuid);
        if (apiFeat?.geometry) {
          zoomToBounds(turf.bbox(turf.feature(apiFeat.geometry)));
          return;
        }
      } catch (error) {
      }
    }

  };

  /**=============== Re Higlight Selected when map Change ===============
   * Provides incremental re-highlighting whenever the selected feature changes
   * (due to map movement or user toggles).
   */
  useEffect(() => {
    if (!mapRef.current) return;
  
    // Function to handle the zoom or pan events
    const handleViewChange = () => {
      reapplySelectionHighlightIfNeededRef.current();
    };
  
    // Add event listeners for 'moveend' and 'zoomend'
    mapRef.current.on('moveend', handleViewChange);
    mapRef.current.on('zoomend', handleViewChange);
  
    // Clean up event listeners on unmount
    return () => {
      if (mapRef.current) {
        mapRef.current.off('moveend', handleViewChange);
        mapRef.current.off('zoomend', handleViewChange);
      }
    };
  }, [selectedFeature]);

    /**=============== Highlight Feature ===============
   * Consolidates an array of features into a single "highlight" layer on the map.
   * - Removes any existing highlight
   * - Groups them by `pidn`, merges geometry if multi-part
   * - Adds them back as a single fill + outline layer
   * 
   * @param {Array} inputFeatures - Array of Mapbox features to highlight
   */

  /**
   * Search and legacy callers sometimes pass flat objects (GFI, ll_uuid, etc. on the
   * feature root) instead of GeoJSON with a `properties` bag. Normalize before highlight logic.
   */
  const normalizeInputFeatureForHighlight = (feature) => {
    if (!feature) return null;
    if (feature.properties && typeof feature.properties === 'object') {
      return feature;
    }
    const metaKeys = new Set(['type', 'geometry', 'bbox', 'layer', 'id', 'source', 'sourceLayer']);
    const properties = {};
    for (const [key, value] of Object.entries(feature)) {
      if (!metaKeys.has(key)) {
        properties[key] = value;
      }
    }
    return {
      type: feature.type || 'Feature',
      geometry: feature.geometry,
      properties,
      ...(feature.bbox ? { bbox: feature.bbox } : {}),
      ...(feature.layer ? { layer: feature.layer } : {}),
      ...(feature.id != null ? { id: feature.id } : {}),
    };
  };

  /**
   * Gets the appropriate identifier property for a feature based on its layer
   * @param {Object} feature - The feature object
   * @param {string} layerName - The name of the layer
   * @returns {string|null} - The identifier value or null if not found
   */
  const getFeatureIdentifier = (feature, layerName) => {
    const props = feature?.properties ?? {};
    
    switch (layerName) {
      case 'ownership':
        return (
          props.ll_uuid ||
          props.parcelnumb ||
          props.parcel_id ||
          props.global_parcel_uid ||
          props.GFI ||
          props.pidn ||
          props.Name
        );
      case 'public_land':
        return props.OBJECTID || props.Name;
      case 'conservation_easements':
        return props.Name || props.OBJECTID;
      case 'soil':
        return props.MUKEY || props.MUSYM || props.OBJECTID;
      case 'surface_water':
        return props.name || props.OBJECTID;
      case 'wetlands':
        return props.WETLAND_TYPE || props.ATTRIBUTE || props.OBJECTID || props.Name;
      case 'boundaries_counties':
        return props.GEOID || props.NAMELSAD || props.NAME;
      case 'boundaries_congressional':
        return props.GEOID || props.NAMELSAD;
      case 'boundaries_places':
        return props.GEOID || props.NAME || props.NAMELSAD;
      case 'boundaries_urban_areas':
        return props.GEOID20 || props.NAME20 || props.NAMELSAD20;
      case 'boundaries_tribal_lands':
        return props.GEOID || props.NAME || props.NAMELSAD;
      case 'opportunity_zones':
        return props.GEOID10 || props.OBJECTID;
      case 'principal_aquifers':
        return props.OBJECTID ?? props.AQ_CODE ?? props.AQ_NAME;
      case 'transmission_lines':
        return props.GlobalID || props.ID || props.OBJECTID;
      default:
        return props.Name || props.OBJECTID || props.FLD_AR_ID || props.precinct;
    }
  };

  // --- 9. Feature selection & highlight ---

  /** `layerStatus` uses `ownership`; Regrid MVT is registered under the same key for queries. */
  const highlightDictLayerMatchesStatus = (dictLayer, statusLayerName) =>
    dictLayer === statusLayerName ||
    (statusLayerName === 'ownership' && dictLayer === 'regrid-parcels');

  /** Hide GeoJSON selection overlay (hosted / legacy layers). */
  const hideGeoJsonSelectionHighlight = (map) => {
    if (!map?.getStyle) return;
    try {
      if (map.getSource(SELECTION_HIGHLIGHT_SOURCE_ID)) {
        map.getSource(SELECTION_HIGHLIGHT_SOURCE_ID).setData(EMPTY_FEATURE_COLLECTION);
      }
      [SELECTION_HIGHLIGHT_FILL_ID, SELECTION_HIGHLIGHT_LINE_ID].forEach((id) => {
        if (map.getLayer(id)) {
          map.setLayoutProperty(id, 'visibility', 'none');
        }
      });
    } catch (_) {
      /* ignore */
    }
  };

  const stampSelectionFeature = (feature) => {
    if (!feature) return feature;
    const layerId =
      feature.properties?.cvMapLayer || resolveHostedMapLayerFromFeature(feature);
    if (!layerId) return feature;
    if (feature.properties?.cvMapLayer === layerId) return feature;
    return {
      ...feature,
      properties: {
        ...(feature.properties || {}),
        cvMapLayer: layerId,
      },
    };
  };

  /** Draw red highlight — Regrid via MVT filter; hosted/legacy via GeoJSON overlay. */
  const highlightFeature = (inputFeatures, overrideLayerStatus, overrideHighlightSettings) => {
    let effectiveHighlightSettings =
      overrideHighlightSettings || highlightSettingsRef.current || highlightSettings;
    
    // Safety check: if highlightSettings is null, use defaults
    if (!effectiveHighlightSettings) {
      effectiveHighlightSettings = DEFAULT_HIGHLIGHT_SETTINGS;
    }

    // Print / map maker: show parcel boundary via line only — avoid tinted fill over imagery.
    if (isPrinting) {
      effectiveHighlightSettings = {
        ...effectiveHighlightSettings,
        fillColor: 'rgba(0, 0, 0, 0)',
        fillOpacity: 0,
      };
    }
    
    
    const effectiveLayerStatus = resolveLayerStatusForSelection(
      overrideLayerStatus ?? layerStatus
    );

    if (!inputFeatures || inputFeatures.length === 0) {
      selectionHighlightSnapshotRef.current = null;
      removeHighlight();
      return;
    }

    const normalizedInputFeatures = inputFeatures
      .map(normalizeInputFeatureForHighlight)
      .filter(Boolean)
      .map(stampSelectionFeature);

    const visibleInputFeatures = filterSelectionToVisibleLayers(
      normalizedInputFeatures,
      effectiveLayerStatus
    );

    if (visibleInputFeatures.length === 0) {
      selectionHighlightSnapshotRef.current = null;
      removeHighlight();
      return;
    }

    const map = mapRef.current;
    const regridSelectionFeatures = visibleInputFeatures.filter(isRegridParcelSelectionFeature);
    let geoJsonInputFeatures = visibleInputFeatures.filter(
      (feature) => !isRegridParcelSelectionFeature(feature)
    );
    const isTileSourcedRegridFeature = (feature) =>
      feature.layer?.id === 'regrid-parcels-layer' ||
      feature.layer?.id === 'regrid-parcels-outline';

    if (regridSelectionFeatures.length) {
      const hasRegridMvt = Boolean(map?.getSource?.('regrid-parcels'));
      const tileSourced = regridSelectionFeatures.every(isTileSourcedRegridFeature);

      if (hasRegridMvt) {
        setRegridParcelSelectionHighlight(map, regridSelectionFeatures, effectiveHighlightSettings);
        bringRegridParcelLayersBeforeSymbolLabels(map);
      }

      if (tileSourced && hasRegridMvt) {
        hideGeoJsonSelectionHighlight(map);
      } else if (regridSelectionFeatures.some((feature) => feature?.geometry)) {
        geoJsonInputFeatures = [...geoJsonInputFeatures, ...regridSelectionFeatures];
      } else if (!hasRegridMvt) {
        clearRegridParcelSelectionHighlight(map);
      }
    } else {
      clearRegridParcelSelectionHighlight(map);
    }

    if (geoJsonInputFeatures.length === 0) {
      hideGeoJsonSelectionHighlight(map);
      selectionHighlightSnapshotRef.current = null;
      return;
    }

    // Create a mapping of feature identifiers to their features (hosted + legacy only)
    const featureDict = {};
    const layerToFeatureMap = {}; // Track which layer each feature came from
    const geometrySeenByIdentifier = {};
    const inputFeaturesByIdentifier = {};

    const registerHighlightIdentifier = (identifier, layerName, inputFeature) => {
      if (identifier == null || identifier === '') return;
      const idKey = String(identifier);
      featureDict[idKey] = [];
      layerToFeatureMap[idKey] = layerName;
      geometrySeenByIdentifier[idKey] = new Set();
      inputFeaturesByIdentifier[idKey] = inputFeature;
    };
    
    geoJsonInputFeatures.forEach((feature) => {
      const props = feature.properties || {};

      const hostedLayer = getMapLayerToggleIdForFeature(feature);
      if (hostedLayer && hostedLayer !== 'ownership') {
        const identifier = getHostedFeatureClickId(feature, hostedLayer);
        registerHighlightIdentifier(identifier, hostedLayer, feature);
        return;
      }
      
      // Legacy / non-MVT features
      const possibleIdentifiers = [
        props.GFI,
        props.Name,
        props.OBJECTID,
        props.precinct,
        props.FLD_AR_ID,
        props.pidn,
        props.global_parcel_uid,
      ].filter(Boolean);
      
      let sourceLayerName = null;
      const visibleLayers = Object.keys(effectiveLayerStatus).filter(
        (layerName) => effectiveLayerStatus[layerName] && layerName !== 'ownership'
      );
      
      for (const layerName of visibleLayers) {
        const queryLayerIds = getQueryLayerIdsForTileLayer(layerName, mapRef.current);
        if (queryLayerIds.length) {
          const queriedFeatures = mapRef.current.queryRenderedFeatures({ layers: queryLayerIds });
          const foundFeature = queriedFeatures.find((qf) => {
            const qfId = getFeatureIdentifier(qf, layerName);
            return possibleIdentifiers.includes(qfId);
          });
          
          if (foundFeature) {
            sourceLayerName = layerName;
            break;
          }
        }
      }
      
      if (sourceLayerName) {
        const identifier = getFeatureIdentifier(feature, sourceLayerName);
        if (identifier) {
          registerHighlightIdentifier(identifier, sourceLayerName, feature);
        }
      } else {
        const fallbackId =
          props.GFI || props.pidn || props.global_parcel_uid || props.ll_uuid || props.parcelnumb;
        if (fallbackId) {
          registerHighlightIdentifier(fallbackId, 'ownership', feature);
        }
      }
    });

    const visibleLayers = Object.keys(effectiveLayerStatus).filter(
      (layerName) => effectiveLayerStatus[layerName] && layerName !== 'ownership'
    );
    visibleLayers.forEach((layerName) => {
      const queryLayerIds = getQueryLayerIdsForTileLayer(layerName, mapRef.current);
      if (!queryLayerIds.length) return;
      const queriedFeatures = mapRef.current.queryRenderedFeatures({ layers: queryLayerIds });
      queriedFeatures.forEach((visibleFeature) => {
        const visibleIdentifier = String(getFeatureIdentifier(visibleFeature, layerName) ?? '');
        if (
          visibleIdentifier &&
          featureDict[visibleIdentifier] &&
          highlightDictLayerMatchesStatus(layerToFeatureMap[visibleIdentifier], layerName)
        ) {
          const geometryKey = JSON.stringify(visibleFeature.geometry || {});
          const seen = geometrySeenByIdentifier[visibleIdentifier];
          if (seen && !seen.has(geometryKey)) {
            seen.add(geometryKey);
            featureDict[visibleIdentifier].push(turf.feature(visibleFeature.geometry, visibleFeature.properties));
          }
        }
      });
    });

    // Search results may include geometry before tiles render in the viewport.
    Object.keys(featureDict).forEach((identifier) => {
      if (featureDict[identifier].length > 0) return;
      const inputFeature = inputFeaturesByIdentifier[identifier];
      if (!inputFeature?.geometry) return;
      const geometryKey = JSON.stringify(inputFeature.geometry);
      const seen = geometrySeenByIdentifier[identifier];
      if (seen && !seen.has(geometryKey)) {
        seen.add(geometryKey);
        featureDict[identifier].push(
          turf.feature(inputFeature.geometry, inputFeature.properties || {})
        );
      }
    });

    const unifiedFeatures = [];
    Object.keys(featureDict).forEach((identifier) => {
      const matchingParts = featureDict[identifier];
      if (matchingParts.length === 1) {
        unifiedFeatures.push(matchingParts[0]);
      } else if (matchingParts.length > 1) {
        try {
          const featureCollection = turf.featureCollection(matchingParts);
          const unifiedFeature = turf.union(featureCollection);
          unifiedFeatures.push(unifiedFeature);
        } catch (error) {
          console.error(`Error during union for identifier: ${identifier}`, error);
        }
      }
    });

    // Final safety dedupe to prevent stacked fill opacity from duplicate geometries.
    const dedupedUnifiedFeatures = [];
    const seenUnifiedGeometry = new Set();
    unifiedFeatures.forEach((feature) => {
      const geometryKey = JSON.stringify(feature?.geometry || {});
      if (!seenUnifiedGeometry.has(geometryKey)) {
        seenUnifiedGeometry.add(geometryKey);
        dedupedUnifiedFeatures.push(feature);
      }
    });

    if (
      dedupedUnifiedFeatures.length === 0 &&
      Array.isArray(selectionHighlightSnapshotRef.current) &&
      selectionHighlightSnapshotRef.current.length > 0
    ) {
      const visibleSnapshots = filterSelectionToVisibleLayers(
        selectionHighlightSnapshotRef.current,
        effectiveLayerStatus
      );
      if (visibleSnapshots.length > 0) {
        dedupedUnifiedFeatures.push(...visibleSnapshots);
      }
    }

    if (dedupedUnifiedFeatures.length === 0) {
      if (map && geoJsonInputFeatures.length) {
        const retry = () =>
          highlightFeatureRef.current(inputFeatures, overrideLayerStatus, overrideHighlightSettings);
        try {
          map.once('idle', retry);
        } catch (_) {
          /* ignore */
        }
        window.setTimeout(retry, 150);
        window.setTimeout(retry, 450);
        window.setTimeout(retry, 900);
        window.setTimeout(retry, 1500);
      }
      return;
    }

    upsertSelectionHighlight(dedupedUnifiedFeatures, effectiveHighlightSettings);
  };

  /** Persistent selection highlight — update GeoJSON in place (no remove/re-add on pan). */
  const upsertSelectionHighlight = (features, settings) => {
    const map = mapRef.current;
    if (!map || !features?.length) return;

    const paint = () => {
      if (!map.getStyle?.()) return;
      try {
        const data = JSON.parse(JSON.stringify(turf.featureCollection(features)));
        const beforeId = getFirstSymbolLayerId(map);
        const fillPaint = {
          'fill-color': settings.fillColor,
          'fill-outline-color': settings.fillOutlineColor,
          'fill-opacity': settings.fillOpacity ?? 1,
        };
        const linePaint = {
          'line-color': settings.lineColor,
          'line-width': settings.lineWidth ?? 3,
        };

        if (!map.getSource(SELECTION_HIGHLIGHT_SOURCE_ID)) {
          map.addSource(SELECTION_HIGHLIGHT_SOURCE_ID, { type: 'geojson', data });
        } else {
          map.getSource(SELECTION_HIGHLIGHT_SOURCE_ID).setData(data);
        }

        if (!map.getLayer(SELECTION_HIGHLIGHT_FILL_ID)) {
          map.addLayer(
            {
              id: SELECTION_HIGHLIGHT_FILL_ID,
              type: 'fill',
              source: SELECTION_HIGHLIGHT_SOURCE_ID,
              paint: fillPaint,
            },
            beforeId
          );
        } else {
          map.setLayoutProperty(SELECTION_HIGHLIGHT_FILL_ID, 'visibility', 'visible');
          Object.entries(fillPaint).forEach(([key, val]) => {
            map.setPaintProperty(SELECTION_HIGHLIGHT_FILL_ID, key, val);
          });
        }

        if (!map.getLayer(SELECTION_HIGHLIGHT_LINE_ID)) {
          map.addLayer(
            {
              id: SELECTION_HIGHLIGHT_LINE_ID,
              type: 'line',
              source: SELECTION_HIGHLIGHT_SOURCE_ID,
              paint: linePaint,
            },
            beforeId
          );
        } else {
          map.setLayoutProperty(SELECTION_HIGHLIGHT_LINE_ID, 'visibility', 'visible');
          Object.entries(linePaint).forEach(([key, val]) => {
            map.setPaintProperty(SELECTION_HIGHLIGHT_LINE_ID, key, val);
          });
        }

        selectionHighlightSnapshotRef.current = features.map((f) => JSON.parse(JSON.stringify(f)));
        bringHighlightLayersToTop(map);
      } catch (error) {
        console.error('Error upserting selection highlight:', error);
      }
    };

    if (!map.isStyleLoaded?.()) {
      try {
        map.once('idle', paint);
      } catch (_) {
        window.setTimeout(paint, 50);
      }
      return;
    }
    paint();
  };

  upsertSelectionHighlightRef.current = upsertSelectionHighlight;

  /** Raise selection highlight above parcel/MVT layers after ownership restack. */
  const bringHighlightLayersToTop = useCallback((map) => {
    if (!map?.getStyle) return;
    const beforeId = getFirstSymbolLayerId(map);
    [SELECTION_HIGHLIGHT_FILL_ID, SELECTION_HIGHLIGHT_LINE_ID].forEach((id) => {
      if (!map.getLayer(id)) return;
      try {
        map.moveLayer(id, beforeId);
      } catch (_) {
        /* ignore */
      }
    });
  }, []);

  const reapplySelectionHighlightIfNeeded = useCallback(() => {
    const selection = selectedFeatureRef.current;
    const map = mapRef.current;
    if (!selection?.length || !map?.getStyle) return;
    deferSelectionHighlightUntilSettledRef.current(selection);
  }, []);

  /** Sync ownership stack, then repaint selection (MVT filter for Regrid, GeoJSON for others). */
  const repaintSelectionHighlight = useCallback((features, { syncOwnership = false } = {}) => {
    const map = mapRef.current;
    if (!map?.getStyle?.() || !features?.length) return;
    if (syncOwnership && parcelMapVisibilityRef.current?.showRegrid) {
      syncOwnershipTileLayer(map, parcelMapVisibilityRef.current);
    }
    highlightFeatureRef.current(
      features,
      resolveLayerStatusForSelection(layerStatusRef.current)
    );
  }, []);

  const deferSelectionHighlightUntilSettled = useCallback((features) => {
    if (!features?.length) return;

    const map = mapRef.current;
    if (!map) return;

    selectionHighlightSettleGenRef.current += 1;
    const generation = selectionHighlightSettleGenRef.current;

    const settledReapply = () => {
      if (generation !== selectionHighlightSettleGenRef.current) return;
      repaintSelectionHighlight(features, { syncOwnership: true });
    };

    try {
      map.once('idle', settledReapply);
    } catch (_) {
      /* ignore */
    }

    let onRegridSourceData;
    try {
      onRegridSourceData = (e) => {
        if (e?.sourceId === 'regrid-parcels' && e.isSourceLoaded) {
          settledReapply();
        }
      };
      map.on('sourcedata', onRegridSourceData);
    } catch (_) {
      onRegridSourceData = null;
    }

    [0, 120, 350, 600, 1000, 1500].forEach((ms) => {
      window.setTimeout(() => {
        settledReapply();
        if (ms === 1500 && onRegridSourceData) {
          try {
            map.off('sourcedata', onRegridSourceData);
          } catch (_) {
            /* ignore */
          }
        }
      }, ms);
    });
  }, [repaintSelectionHighlight]);

  deferSelectionHighlightUntilSettledRef.current = deferSelectionHighlightUntilSettled;
  repaintSelectionHighlightRef.current = repaintSelectionHighlight;

  highlightFeatureRef.current = highlightFeature;
  reapplySelectionHighlightIfNeededRef.current = reapplySelectionHighlightIfNeeded;
  
    
  /** Clear selection highlight from the map (panel selection cleared separately). */
  const removeHighlight = () => {
    if (highlightRenderTimeoutRef.current) {
      clearTimeout(highlightRenderTimeoutRef.current);
      highlightRenderTimeoutRef.current = null;
    }
    selectionHighlightSnapshotRef.current = null;

    const map = mapRef.current;
    if (!map?.getStyle) return;

    clearRegridParcelSelectionHighlight(map);
    hideGeoJsonSelectionHighlight(map);

    // Legacy dynamic highlight-layer-* cleanup
    (map.getStyle().layers || []).forEach((layer) => {
      if (!layer.id.startsWith(highlightLayerId) || layer.id.startsWith('cv-map-selection')) return;
      try {
        if (map.getLayer(layer.id)) map.removeLayer(layer.id);
      } catch (_) {
        /* ignore */
      }
    });
    Object.keys(map.style?.sourceCaches || {}).forEach((sourceId) => {
      if (!sourceId.startsWith(highlightLayerId) || sourceId.startsWith('cv-map-selection')) return;
      try {
        if (map.getSource(sourceId)) map.removeSource(sourceId);
      } catch (_) {
        /* ignore */
      }
    });
  };

  /** Ownership parcel labels require the ownership layer; clear label state when layer is off. */
  useEffect(() => {
    if (!mapIsReady) return;
    if (!layerStatus.ownership && layerLabels.ownership) {
      clearLayerLabels('ownership');
    }
  }, [mapIsReady, layerStatus.ownership, layerLabels.ownership, clearLayerLabels]);

  /** Clear selection/highlight when a layer is toggled off (ownership/Regrid is skipped in `updateLayers`). */
  useEffect(() => {
    if (!mapIsReady || !selectedFeature?.length) return;
    // Parcel wizard turns ownership off in layerStatus but still shows/selects Regrid parcels.
    if (propertyMapWizardActive) return;

    const hiddenLayerNames = Object.keys(layerStatus).filter((name) => !layerStatus[name]);
    if (hiddenLayerNames.length === 0) return;

    const touchesHiddenLayer = selectedFeature.some((feature) =>
      hiddenLayerNames.some((layerName) => featureBelongsToMapLayer(feature, layerName))
    );
    if (!touchesHiddenLayer) return;

    const nextSelection = selectedFeature.filter(
      (feature) => !hiddenLayerNames.some((layerName) => featureBelongsToMapLayer(feature, layerName))
    );

    const clearedRegrid =
      !layerStatus.ownership && selectedFeature.some(isRegridParcelPolygonFeature);

    selectedFeatureRef.current = nextSelection;

    if (nextSelection.length === 0) {
      setSelectedFeatures([]);
      removeHighlight();
      if (clearedRegrid) {
        clearPendingHighlightRestore();
        syncMapUrlRef.current();
      }
    } else {
      setSelectedFeatures(nextSelection);
      highlightFeature(nextSelection);
    }

  }, [
    layerStatus,
    mapIsReady,
    selectedFeature,
    propertyMapWizardActive,
    highlightFeature,
    removeHighlight,
    setSelectedFeatures,
    clearPendingHighlightRestore,
  ]);


  /** Property wizard: turn merged parcel geometry into one or more boundary print polygons. */
  const addPolygonBoundariesFromMergedFeature = (merged) => {
    const g = merged?.geometry;
    if (!g) return;
    const addOne = (polyFeature) => {
      const coords = getRegridParcelBoundaryCoordinates(polyFeature);
      if (!coords || coords.length < 3) return;
      const metrics = getMetricsForPolygonLngLat(coords);
      const center = {
        lng: coords.reduce((s, c) => s + c.lng, 0) / coords.length,
        lat: coords.reduce((s, c) => s + c.lat, 0) / coords.length,
      };
      addPrintElementFromTool('polygon_boundary', { coordinates: coords, metrics }, center);
    };

    if (g.type === 'Polygon') {
      addOne(merged);
      return;
    }
    if (g.type === 'MultiPolygon') {
      for (const polyCoords of g.coordinates) {
        try {
          addOne(turf.polygon(polyCoords));
        } catch (_) {
          /* skip invalid ring */
        }
      }
    }
  };


  /** Finish parcel wizard — merge selected parcels into boundary print element(s) and exit wizard. */
  const handlePropertyMapWizardContinue = async () => {
    const parcels = (selectedFeature || []).filter(isRegridParcelPolygonFeature);
    if (parcels.length === 0) return;
    const merged = await mergeRegridParcelFeaturesPreferApi(parcels);
    if (!merged) return;
    addPolygonBoundariesFromMergedFeature(merged);
    setPropertyMapWizardActive(false);
    setPropertyMapWizardIntent(null);
    setSelectedFeatures([]);
    removeHighlight();
    setActivePrintTool('select');
    setActiveSidePanelTab('print');
  };


  /** Cancel parcel wizard — clear selection, highlight, and exit edit mode. */
  const handlePropertyMapWizardCancel = () => {
    setPropertyMapWizardActive(false);
    setPropertyMapWizardIntent(null);
    setSelectedFeatures([]);
    removeHighlight();
    window.dispatchEvent(new CustomEvent('print-exit-edit'));
  };

  const tutorialInitialResetDoneRef = useRef(false);

  useEffect(() => {
    if (!tourActive || tourMode !== 'map') {
      tutorialInitialResetDoneRef.current = false;
      return;
    }
    if (tourStepIndex !== 0) return;
    if (tutorialInitialResetDoneRef.current) return;
    tutorialInitialResetDoneRef.current = true;

    if (!mapRef.current) return;

    setSelectedFeatures([]);
    setFocusFeatures([]);
    setIsMapTriggeredFromSearch(false);
    setActiveSidePanelTab('layers');
    setIsPanelOpen(false);
    setIsGeoFilterActive(false);
    if (isGeoFilterActiveRef) isGeoFilterActiveRef.current = false;

    removeHighlight();
    clearAllDrawings();

    if (layerLabels.ownership) {
      toggleLayerLabels('ownership');
    }

    setLayerStatus({ ownership: true });
    setLayerOrder(['ownership']);
    publishBasemapSelection('outdoors-v12');
    lastAppliedBasemapRef.current = null;
    runUpdateLayersRef.current();

    try {
      mapRef.current.stop();
    } catch (_) {
      /* ignore */
    }

    try {
      mapRef.current.flyTo({
        center: TUTORIAL_DEFAULT_VIEW.center,
        zoom: TUTORIAL_DEFAULT_VIEW.zoom,
        duration: 1400,
        essential: true,
      });
    } catch (err) {
    }
  }, [
    tourActive,
    tourMode,
    tourStepIndex,
    setSelectedFeatures,
    setFocusFeatures,
    setIsMapTriggeredFromSearch,
    setIsGeoFilterActive,
    setLayerStatus,
    setLayerOrder,
    layerLabels.ownership,
    toggleLayerLabels,
    removeHighlight,
    clearAllDrawings,
    publishBasemapSelection,
  ]);

  /** Re-apply fill/line paint on existing highlight layers when highlight settings change. */
  const updateExistingHighlights = () => {
    if (!highlightSettings) {
      return;
    }
    
    if (!mapRef.current) {
      return;
    }
    
    const style = mapRef.current.getStyle();
    if (!style) {
      return;
    }

    if (mapRef.current.getLayer(SELECTION_HIGHLIGHT_FILL_ID)) {
      mapRef.current.setPaintProperty(SELECTION_HIGHLIGHT_FILL_ID, 'fill-color', highlightSettings.fillColor);
      mapRef.current.setPaintProperty(SELECTION_HIGHLIGHT_FILL_ID, 'fill-outline-color', highlightSettings.fillOutlineColor);
      mapRef.current.setPaintProperty(SELECTION_HIGHLIGHT_FILL_ID, 'fill-opacity', highlightSettings.fillOpacity ?? 1);
    }

    if (mapRef.current.getLayer(SELECTION_HIGHLIGHT_LINE_ID)) {
      mapRef.current.setPaintProperty(SELECTION_HIGHLIGHT_LINE_ID, 'line-color', highlightSettings.lineColor);
      mapRef.current.setPaintProperty(SELECTION_HIGHLIGHT_LINE_ID, 'line-width', highlightSettings.lineWidth ?? 3);
    }

    applyRegridParcelSelectionHighlightPaint(mapRef.current, highlightSettings);

    // 🎨 Force a repaint to ensure changes are visible immediately
    try {
      // Method 1: Try to trigger a repaint
      if (mapRef.current.triggerRepaint) {
        mapRef.current.triggerRepaint();
      }
      
      // Method 2: Force a resize to trigger redraw
      safeMapResize(mapRef.current);
      
      // Method 3: Force a style update
      if (mapRef.current.getStyle()) {
        mapRef.current.setPaintProperty('background', 'background-color', mapRef.current.getPaintProperty('background', 'background-color'));
      }
      
      // Method 4: Force persistent highlight layers to refresh by temporarily hiding/showing
      [
        SELECTION_HIGHLIGHT_FILL_ID,
        SELECTION_HIGHLIGHT_LINE_ID,
        REGRID_PARCELS_SELECTION_FILL_ID,
        REGRID_PARCELS_SELECTION_LINE_ID,
      ].forEach((layerId) => {
        if (mapRef.current.getLayer(layerId)) {
          mapRef.current.setLayoutProperty(layerId, 'visibility', 'none');
          setTimeout(() => {
            mapRef.current.setLayoutProperty(layerId, 'visibility', 'visible');
          }, 10);
        }
      });
      
    } catch (_) {
      /* ignore */
    }
  };
  

  useEffect(() => {
    if (activeTab !== 'map' || !mapIsReady || !mapRef?.current) return undefined;

    const map = mapRef.current;
    const timeoutId = window.setTimeout(() => {
      if (mapRef.current !== map) return;
      safeMapResize(map);
      if (isPrinting) {
        map.triggerRepaint?.();
        setOverlayRenderVersion((v) => v + 1);
        requestAnimationFrame(() => setOverlayRenderVersion((v) => v + 1));
      }
    }, 50);

    return () => window.clearTimeout(timeoutId);
  }, [activeTab, isPrinting, mapIsReady, mapRef]);

  useEffect(() => {
    if (!mapIsReady || !mapRef?.current?.isStyleLoaded?.()) return undefined;

    const map = mapRef.current;
    const timeoutId = window.setTimeout(() => {
      if (mapRef.current !== map) return;
      safeMapResize(map);
      if (isPrinting) {
        map.triggerRepaint?.();
        setOverlayRenderVersion((v) => v + 1);
      }
    }, 100);

    return () => window.clearTimeout(timeoutId);
  }, [paperSize, isPrinting, mapIsReady, mapRef]);
  
  useEffect(() => {
    if (!mapIsReady || !mapRef.current) return;
    const map = mapRef.current;

    const notifyInteraction = () => {
      if (typeof window !== 'undefined') {
        if (typeof window.__shrinkSidePanel === 'function') {
          window.__shrinkSidePanel();
        } else if (typeof window.__collapseSidePanel === 'function') {
          window.__collapseSidePanel();
        }
      }
      const event = new CustomEvent('map-user-interaction');
      window.dispatchEvent(event);
      document.dispatchEvent(event);
    };

    map.on('dragstart', notifyInteraction);
    map.on('movestart', notifyInteraction);
    map.on('zoomstart', notifyInteraction);
    map.on('rotatestart', notifyInteraction);
    map.on('pitchstart', notifyInteraction);

    return () => {
      map.off('dragstart', notifyInteraction);
      map.off('movestart', notifyInteraction);
      map.off('zoomstart', notifyInteraction);
      map.off('rotatestart', notifyInteraction);
      map.off('pitchstart', notifyInteraction);
    };
  }, [mapIsReady]);

  /** GPS fix → optional save, dot overlay, and fly (regional on first allow, tight on button). */
  const applyUserGeolocation = useCallback(
    async ({ zoomMode = 'near', save = true } = {}) => {
      const map = mapRef.current;
      if (!map) {
        throw new Error('Map not ready');
      }

      const isNative = isNativeApp();
      const position = await getPreciseUserPosition({ isNative, Geolocation });
      const { latitude, longitude, accuracy } = extractGeolocationCoords(position);

      if (!latitude || !longitude) {
        throw new Error('Invalid location coordinates');
      }

      let saved = null;
      if (save) {
        saved = saveMapLocationFromGeolocation({ latitude, longitude, accuracy });
      }

      showUserLocationOverlay(map, mapboxgl, turf, { longitude, latitude, accuracy });

      const zoom =
        zoomMode === 'region'
          ? saved?.regionZoom ?? computeRegionalZoom(accuracy)
          : SAVED_LOCATION_ZOOM_NEAR;

      map.flyTo({
        center: [longitude, latitude],
        zoom,
        duration: 1200,
        essential: true,
      });

      return { latitude, longitude, accuracy };
    },
    []
  );

  const handleZoomToLocation = async () => {
    if (!mapRef.current || isLocatingUser) return;

    setIsLocatingUser(true);

    const safetyTimeout = setTimeout(() => {
      setIsLocatingUser(false);
      alert('Location request timed out. Please try again.');
    }, 14000);

    const clearSafetyTimeout = () => {
      clearTimeout(safetyTimeout);
    };

    try {
      await applyUserGeolocation({ zoomMode: 'near', save: true });
      clearSafetyTimeout();
      setIsLocatingUser(false);
      if (tourActive && tourStep?.id === 'geolocate') {
        window.dispatchEvent(new CustomEvent('cv-tutorial-geolocate'));
      }
    } catch (error) {
      clearSafetyTimeout();
      console.error('Error getting user location:', error);
      setIsLocatingUser(false);

      let errorMessage = 'Unable to get your location.';
      const isNative = isNativeApp();
      if (error.code === 1 || (error.message && error.message.includes('permission'))) {
        markLocationPermissionDenied();
        errorMessage = isNative
          ? 'Location permission denied.\n\nPlease enable location services:\nSettings > Privacy > Location Services > Community View'
          : 'Location permission denied. Please enable location services in your browser settings.';
      } else if (error.code === 2 || (error.message && error.message.includes('unavailable'))) {
        errorMessage = isNative
          ? 'Location unavailable.\n\nIf using iOS Simulator:\nFeatures > Location > Custom Location\n\nOn device: Check location services are enabled.'
          : 'Location information is unavailable.';
      } else if (error.code === 3 || (error.message && error.message.includes('timeout'))) {
        errorMessage = isNative
          ? 'Location request timed out.\n\nIf using iOS Simulator:\nFeatures > Location > Custom Location\n\nOn device: Check location services.'
          : 'Location request timed out. Please try again.';
      } else {
        errorMessage = `Error: ${error.message || 'Unknown error occurred'}`;
      }

      alert(errorMessage);
    }
  };

  // --- 10. Render ---

  return (
    <div className="map-container">
      {isMapLoading ? <MapLoadingOverlay phraseSet="map" /> : null}
      {normalizePathname(routerLocation.pathname) === '/map' && <MapReportBuilderBar />}
      <div className="map-floating-controls-stack">
        <div
          className="map-floating-control-container map-floating-control-3d-container"
          data-tour="map-3d-toggle"
        >
          <button
            className={`map-floating-control-button ${is3DEnabled ? 'active' : ''}`}
            onClick={() => setIs3DEnabled((prev) => !prev)}
            title="Toggle 3D terrain"
          >
            <span className="map-floating-control-text">3D</span>
          </button>
        </div>
        <div
          className="map-floating-control-container map-floating-control-contours-container"
          data-tour="map-contours-toggle"
        >
          <button
            className={`map-floating-control-button ${isContoursEnabled ? 'active' : ''}`}
            onClick={() => setIsContoursEnabled((prev) => !prev)}
            title="Toggle contour lines"
          >
            <svg
              className="map-floating-control-icon"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path
                d="M2 6c2 0 2-2 4-2s2 2 4 2 2-2 4-2 2 2 4 2 2-2 4-2M2 12c2 0 2-2 4-2s2 2 4 2 2-2 4-2 2 2 4 2 2-2 4-2M2 18c2 0 2-2 4-2s2 2 4 2 2-2 4-2 2 2 4 2 2-2 4-2"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </div>
        {!shareViewerReadOnly && (
          <div className="location-zoom-button-container" data-tour="location-zoom">
            <button
              className={`location-zoom-button${isLocatingUser ? ' is-locating' : ''}`}
              onClick={handleZoomToLocation}
              disabled={isLocatingUser}
              title="Zoom to My Location"
            >
              {isLocatingUser ? (
                <span className="location-zoom-spinner" aria-hidden="true" />
              ) : (
                <img
                  src="/location-icon.svg"
                  alt="Zoom to Location"
                  className="location-icon"
                />
              )}
            </button>
          </div>
        )}
        <div
          className={[
            'layer-selector-container',
            isBasemapTutorialStep ? 'tutorial-force-open' : '',
            isBasemapSelectorOpen ? 'is-open' : '',
          ]
            .filter(Boolean)
            .join(' ')}
          data-tour="basemap-selector"
        >
          <button
            type="button"
            className={`layer-selector-button${isBasemapSelectorOpen ? ' active' : ''}`}
            data-tour="basemap-toggle-button"
            aria-expanded={isMobileViewport ? isBasemapSelectorOpen : undefined}
            onClick={() => {
              if (isMobileViewport) {
                setIsBasemapSelectorOpen((open) => !open);
              }
            }}
          >
            <img
              src="/basemap.png"
              alt="Layers"
              className="layer-icon"
            />
          </button>
          <div className="layer-selector-popup" data-tour="basemap-popup">
            <div className="basemap-sheet-header">
              <span className="basemap-sheet-grabber" aria-hidden="true" />
              <h3 className="basemap-sheet-title">Basemap</h3>
              {isMobileViewport && (
                <button
                  type="button"
                  className="basemap-sheet-close"
                  aria-label="Close basemap selector"
                  onClick={() => setIsBasemapSelectorOpen(false)}
                >
                  ×
                </button>
              )}
            </div>
            <div className="basemap-grid">
              {basemapConfig.map((basemapOption) => {
                const activeBasemapId =
                  String(currentBasemapId || activeBasemapIdRef?.current || baseMapRef.current || '').trim();
                const isActive =
                  basemapOption.id === 'imagery'
                    ? activeBasemapId === 'imagery' || activeBasemapId === 'imagery-3d'
                    : activeBasemapId === basemapOption.id;
                return (
                  <button
                    key={basemapOption.id}
                    className={`basemap-option ${isActive ? 'active' : ''}`}
                    data-tour={basemapOption.id === 'imagery' ? 'basemap-option-imagery' : undefined}
                    onClick={() => {
                      basemapOption.onClick();
                      if (isMobileViewport) {
                        setIsBasemapSelectorOpen(false);
                      }
                    }}
                    title={basemapOption.label}
                  >
                    <img
                      src={basemapOption.image}
                      alt={basemapOption.label}
                      className="basemap-thumbnail"
                      onError={(e) => {
                        e.target.src = basemapOption.fallback || '/logo192.png';
                      }}
                    />
                    <span className="basemap-label">{basemapOption.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
      {!isClientShareMapRoute && (
      <ToolPanel
        onZoomIn={() => mapRef.current.zoomIn()}
        onZoomOut={() => mapRef.current.zoomOut()}
        onDrawLine={drawLine}
        onDrawPolygon={drawPolygon}
        onDeleteSelectedFeature={deleteSelectedFeature}
        onClear={clearAllDrawings}
      />
      )}
      {!isClientShareMapRoute && (
      <SidePanel
        isOpen={isPanelOpen}
        togglePanel={() => setIsPanelOpen(!isPanelOpen)}
        layerStatus={layerStatus}
        setLayerStatus={(layerName) =>
          setLayerStatus((prevStatus) => ({
            ...prevStatus,
            [layerName]: !prevStatus[layerName],
          }))
        }
        activeSidePanelTab={activeSidePanelTab}
        setActiveSidePanelTab={setActiveSidePanelTab}
        selectedFeature={selectedFeature}
        topLayer={topLayer}
        layerOrder={layerOrder}
        setLayerOrder={setLayerOrder}
        onZoomToFeature={zoomToIndividualFeature}
        printBasemapOptions={printBasemapOptionList}
        currentBasemapId={currentBasemapId || basemap}
        onPrintBasemapSelect={handlePrintBasemapSelect}
        onOpenLayersTabForPrint={() => setActiveSidePanelTab('layers')}
        onCreateBoundaryFromRegridParcel={handleCreateBoundaryFromRegridParcel}
        onZoomToPrintElement={zoomToPrintElement}
      />
      )}
      
      {/* Map + print overlay share one coordinate system (map project / canvas px). */}
      <div
        className="map-geo-print-stack"
        onDragOver={handlePrintMapDragOver}
        onDrop={handlePrintMapDrop}
      >
        {/* Map container - full screen */}
        <div
          id="map"
          className={`map ${isPanelOpen ? 'with-panel' : ''}`}
          style={containerStyle}
          onMouseDown={() => {
            if (!isPrinting) return;
            if (activePrintTool && activePrintTool !== 'select') return;
            if (selectedPrintElement) {
              setSelectedPrintElement(null);
            }
          }}
        ></div>

      {isPrinting && printLayoutMode && (
        <div className="print-layout-overlay" aria-hidden>
          {printLayoutRect && (
            <Rnd
              bounds="parent"
              size={{ width: printLayoutRect.width, height: printLayoutRect.height }}
              position={{ x: printLayoutRect.x, y: printLayoutRect.y }}
              style={{ pointerEvents: 'auto', zIndex: 19 }}
              minWidth={220}
              minHeight={160}
              dragHandleClassName="print-layout-selection-box"
              onDragStop={(e, d) =>
                setPrintLayoutRect((prev) => ({
                  ...(prev || {}),
                  x: d.x,
                  y: d.y,
                  width: prev?.width || 300,
                  height: prev?.height || 220,
                }))
              }
              onResizeStop={(e, direction, ref, delta, position) =>
                setPrintLayoutRect({
                  x: position.x,
                  y: position.y,
                  width: parseFloat(ref.style.width),
                  height: parseFloat(ref.style.height),
                })
              }
            >
              <div className="print-layout-selection-box">
                <div className="print-layout-selection-label">Print area</div>
              </div>
            </Rnd>
          )}
        </div>
      )}

      {/* Notes overlay - full screen */}
      {isPrinting && (
        <div
          id="notes-overlay"
          data-render-version={overlayRenderVersion}
          onClick={(e) => {
            if (!mapRef.current) return;
            if (shareViewerReadOnly) return;
            if (!activePrintTool || activePrintTool === 'select') return;
            if (isPolygonPlacingTool(activePrintTool) || isPolylinePlacingTool(activePrintTool)) {
              return;
            }
            const map = mapRef.current;
            const rect = map.getCanvas().getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            const lngLat = map.unproject([x, y]);
            addPrintElementFromTool(activePrintTool, {}, { lng: lngLat.lng, lat: lngLat.lat });
            setActivePrintTool('select');
          }}
          onMouseMove={(e) => {
            if (!mapRef.current || !isPrintShapeIconPlacingTool(activePrintTool)) return;
            const rect = mapRef.current.getCanvas().getBoundingClientRect();
            setPrintIconPlaceCursorPx({
              x: e.clientX - rect.left,
              y: e.clientY - rect.top,
            });
          }}
          onMouseLeave={() => setPrintIconPlaceCursorPx(null)}
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            display: 'block',
            pointerEvents:
              activePrintTool &&
              activePrintTool !== 'select' &&
              !isPolygonPlacingTool(activePrintTool) &&
              !isPolylinePlacingTool(activePrintTool)
                ? 'auto'
                : 'none',
            zIndex: 6,
          }}
        >
              {isPrinting &&
                isPrintShapeIconPlacingTool(activePrintTool) &&
                printIconPlaceCursorPx &&
                mapRef.current &&
                (() => {
                  const parsed = parsePrintPlacementTool(activePrintTool);
                  const svgKey = parsed.shapeSvgKey;
                  if (!svgKey) return null;
                  const renderSvg = svgMap[svgKey];
                  if (!renderSvg) return null;
                  const iconDefaults = getPointIconDefaultStyle(svgKey) || {};
                  const s = getPrintPixelScale(mapRef.current);
                  const baseW = 70;
                  const baseH = 70;
                  const w = baseW * s;
                  const h = baseH * s;
                  return (
                    <div
                      key="print-shape-place-preview"
                      aria-hidden
                      style={{
                        position: 'absolute',
                        left: printIconPlaceCursorPx.x,
                        top: printIconPlaceCursorPx.y,
                        transform: 'translate(-50%, -50%)',
                        width: w,
                        height: h,
                        pointerEvents: 'none',
                        zIndex: 25,
                        opacity: 0.9,
                        filter: 'drop-shadow(0 2px 8px rgba(15, 23, 42, 0.35))',
                      }}
                    >
                      {renderSvg({
                        fill: iconDefaults.fill ?? '#ffffff',
                        stroke: iconDefaults.stroke ?? '#111827',
                        strokeWidth: iconDefaults.strokeWidth ?? 2.5,
                        fillOpacity: 1,
                        strokeOpacity: 1,
                        iconOpacity: 1,
                        iconScale: 0.64,
                        logoColor: iconDefaults.logoColor ?? '#111827',
                      })}
                    </div>
                  );
                })()}
              {isPolygonPlacingTool(activePrintTool) && polygonDraftPoints.length > 0 && (
                <svg
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: '100%',
                    pointerEvents: 'none',
                  }}
                >
                  <polyline
                    points={polygonDraftPoints
                      .map((point) => {
                        const p = mapRef.current.project([point.lng, point.lat]);
                        return `${p.x},${p.y}`;
                      })
                      .join(' ')}
                    fill="none"
                    stroke={getPolygonDraftStyle().stroke}
                    strokeWidth={getPolygonDraftStyle().strokeWidth || 2}
                    strokeDasharray="6 4"
                  />
                  {polygonCursorPoint && (() => {
                    const last = polygonDraftPoints[polygonDraftPoints.length - 1];
                    const first = polygonDraftPoints[0];
                    if (!last) return null;
                    const p = mapRef.current.project([last.lng, last.lat]);
                    const fp = mapRef.current.project([first.lng, first.lat]);
                    return (
                      <>
                        <line
                          x1={p.x}
                          y1={p.y}
                          x2={polygonCursorPoint.x}
                          y2={polygonCursorPoint.y}
                          stroke={getPolygonDraftStyle().stroke}
                          strokeWidth={getPolygonDraftStyle().strokeWidth || 2}
                          strokeDasharray="6 4"
                        />
                        <line
                          x1={polygonCursorPoint.x}
                          y1={polygonCursorPoint.y}
                          x2={fp.x}
                          y2={fp.y}
                          stroke={getPolygonDraftStyle().stroke}
                          strokeWidth={getPolygonDraftStyle().strokeWidth || 2}
                          strokeDasharray="3 3"
                          opacity={0.8}
                        />
                      </>
                    );
                  })()}
                </svg>
              )}
              {isPolylinePlacingTool(activePrintTool) && polylineDraftPoints.length > 0 && (() => {
                const ds = getPolylineDraftStyle();
                const dash =
                  ds.lineDasharray === null || ds.lineDasharray === undefined
                    ? undefined
                    : ds.lineDasharray;
                const headMode = activePrintTool === 'arrow' ? 'end' : ds.arrowHead || 'none';
                const screenPts = polylineDraftPoints.map((pt) => {
                  const p = mapRef.current.project([pt.lng, pt.lat]);
                  return [p.x, p.y];
                });
                const tickSegs =
                  ds.transmissionTicks && screenPts.length >= 2
                    ? transmissionTickSegments(screenPts, 20, 6)
                    : [];
                return (
                  <svg
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      width: '100%',
                      height: '100%',
                      pointerEvents: 'none',
                    }}
                  >
                    {ds.fenceOutlineStroke && (
                      <polyline
                        points={screenPts.map(([x, y]) => `${x},${y}`).join(' ')}
                        fill="none"
                        stroke={ds.fenceOutlineStroke}
                        strokeWidth={ds.fenceOutlineWidth ?? 5}
                        strokeOpacity={ds.fenceOutlineOpacity ?? 0.35}
                        strokeLinecap={ds.strokeLinecap || 'round'}
                        strokeLinejoin="round"
                      />
                    )}
                    <polyline
                      points={screenPts.map(([x, y]) => `${x},${y}`).join(' ')}
                      fill="none"
                      stroke={ds.stroke}
                      strokeWidth={ds.strokeWidth || 2}
                      strokeOpacity={ds.strokeOpacity ?? 1}
                      strokeDasharray={dash}
                      strokeLinecap={ds.strokeLinecap || 'round'}
                      strokeLinejoin="round"
                    />
                    {ds.roadMarkingStroke && (
                      <polyline
                        points={screenPts.map(([x, y]) => `${x},${y}`).join(' ')}
                        fill="none"
                        stroke={ds.roadMarkingStroke}
                        strokeWidth={ds.roadMarkingWidth ?? 2}
                        strokeOpacity={ds.strokeOpacity ?? 1}
                        strokeDasharray={ds.roadMarkingDasharray || undefined}
                        strokeLinecap={ds.roadMarkingLinecap || 'round'}
                        strokeLinejoin="round"
                      />
                    )}
                    {tickSegs.map((t, i) => (
                      <line
                        key={`dtk-${i}`}
                        x1={t.x1}
                        y1={t.y1}
                        x2={t.x2}
                        y2={t.y2}
                        stroke={ds.stroke}
                        strokeWidth={1.2}
                        strokeOpacity={0.9}
                      />
                    ))}
                    {polylineCursorPoint &&
                      (() => {
                        const last = polylineDraftPoints[polylineDraftPoints.length - 1];
                        if (!last) return null;
                        const p = mapRef.current.project([last.lng, last.lat]);
                        const draftStroke = ds.stroke || '#111827';
                        const draftSw = ds.strokeWidth || 2;
                        const x1 = p.x;
                        const y1 = p.y;
                        const x2 = polylineCursorPoint.x;
                        const y2 = polylineCursorPoint.y;
                        const rubberPts =
                          polylineDraftPoints.length >= 2
                            ? [...screenPts, [x2, y2]]
                            : [[x1, y1], [x2, y2]];
                        const rubberTicks =
                          ds.transmissionTicks && rubberPts.length >= 2
                            ? transmissionTickSegments(rubberPts, 20, 6)
                            : [];
                        return (
                          <>
                            <line
                              x1={x1}
                              y1={y1}
                              x2={x2}
                              y2={y2}
                              stroke={draftStroke}
                              strokeOpacity={ds.strokeOpacity ?? 1}
                              strokeWidth={draftSw}
                              strokeDasharray={dash}
                              strokeLinecap={ds.strokeLinecap || 'round'}
                            />
                            {rubberTicks.map((t, i) => (
                              <line
                                key={`dtkr-${i}`}
                                x1={t.x1}
                                y1={t.y1}
                                x2={t.x2}
                                y2={t.y2}
                                stroke={draftStroke}
                                strokeWidth={1.2}
                                strokeOpacity={0.9}
                              />
                            ))}
                            {(headMode === 'end' || headMode === 'both') && (
                              <polygon
                                points={arrowHeadPolygon(x1, y1, x2, y2, draftSw)}
                                fill={draftStroke}
                                fillOpacity={ds.strokeOpacity ?? 1}
                              />
                            )}
                            {headMode === 'both' && polylineDraftPoints.length >= 1 && (() => {
                              const fp = mapRef.current.project([
                                polylineDraftPoints[0].lng,
                                polylineDraftPoints[0].lat,
                              ]);
                              const sec =
                                polylineDraftPoints.length >= 2
                                  ? mapRef.current.project([
                                      polylineDraftPoints[1].lng,
                                      polylineDraftPoints[1].lat,
                                    ])
                                  : { x: x2, y: y2 };
                              return (
                                <polygon
                                  points={arrowHeadPolygon(sec.x, sec.y, fp.x, fp.y, draftSw)}
                                  fill={draftStroke}
                                  fillOpacity={ds.strokeOpacity ?? 1}
                                />
                              );
                            })()}
                          </>
                        );
                      })()}
                  </svg>
                );
              })()}
              {isPolygonPlacingTool(activePrintTool) && polygonDraftPoints.length >= 2 && (() => {
                const metrics = getMetricsForPolygonLngLat(
                  polygonCursorPoint
                    ? [...polygonDraftPoints, mapRef.current.unproject([polygonCursorPoint.x, polygonCursorPoint.y])]
                    : polygonDraftPoints
                );
                if (!metrics || !polygonCursorPoint) return null;
                return (
                  <div
                    style={{
                      position: 'absolute',
                      top: polygonCursorPoint.y + 12,
                      left: polygonCursorPoint.x + 12,
                      background: 'rgba(15, 23, 42, 0.88)',
                      color: '#fff',
                      padding: '8px 10px',
                      borderRadius: 6,
                      fontSize: 12,
                      zIndex: 20,
                      pointerEvents: 'none',
                    }}
                  >
                    <div>Area: {(metrics.areaSqMeters / 4046.8564224).toFixed(2)} ac</div>
                    <div>Perim: {(metrics.perimeterMeters * 3.28084).toFixed(0)} ft</div>
                  </div>
                );
              })()}
              {isPolylinePlacingTool(activePrintTool) && polylineDraftPoints.length >= 1 && (() => {
                if (!polylineCursorPoint) return null;
                const metrics = getMetricsForLineLngLat([
                  ...polylineDraftPoints,
                  mapRef.current.unproject([polylineCursorPoint.x, polylineCursorPoint.y]),
                ]);
                if (!metrics) return null;
                return (
                  <div
                    style={{
                      position: 'absolute',
                      top: polylineCursorPoint.y + 12,
                      left: polylineCursorPoint.x + 12,
                      background: 'rgba(15, 23, 42, 0.88)',
                      color: '#fff',
                      padding: '8px 10px',
                      borderRadius: 6,
                      fontSize: 12,
                      zIndex: 20,
                      pointerEvents: 'none',
                    }}
                  >
                    <div>Length: {(metrics.lengthMeters * 3.28084).toFixed(0)} ft</div>
                  </div>
                );
              })()}
              {isPrinting &&
                printElements.map((element) => {
                  if (!shouldRenderPrintElementOnMap(element)) return null;
                  const projected = withGeoProjectedFrame(element);
                  const placingTool = activePrintTool && activePrintTool !== 'select';
                  const featurePtr =
                    placingTool || (activePrintTool === 'select' && selectedPrintElement?.id !== element.id)
                      ? 'none'
                      : 'auto';
                  switch (element.type) {
                    case 'polygon': {
                      const polygonPoints = projected.projectedPolygonPoints || [];
                      const isSelected = selectedPrintElement?.id === element.id;
                      const isParcelBoundary = isPrintParcelBoundaryPolygon(element);
                      const polygonPointer =
                        isParcelBoundary && featurePtr === 'auto' ? 'stroke' : featurePtr;
                      const centroid = polygonPoints.length
                        ? polygonPoints.reduce(
                            (acc, [x, y]) => ({ x: acc.x + x, y: acc.y + y }),
                            { x: 0, y: 0 }
                          )
                        : { x: 0, y: 0 };
                      const centerX = polygonPoints.length ? centroid.x / polygonPoints.length : 0;
                      const centerY = polygonPoints.length ? centroid.y / polygonPoints.length : 0;
                      return (
                        <svg
                          key={`${element.id}-${selectedPrintElement?.id ?? 'none'}`}
                          style={{
                            position: 'absolute',
                            top: 0,
                            left: 0,
                            width: '100%',
                            height: '100%',
                            pointerEvents: 'none',
                            overflow: 'visible',
                            zIndex: 2,
                          }}
                        >
                          <polygon
                            points={polygonPoints
                              .map(([x, y]) => `${x},${y}`)
                              .join(' ')}
                            fill={element.fill || '#10b981'}
                            fillOpacity={element.fillOpacity ?? 0.25}
                            stroke={element.stroke || '#0f5132'}
                            strokeWidth={element.strokeWidth ?? 2}
                            strokeOpacity={element.strokeOpacity ?? 1}
                            strokeDasharray={element.lineDasharray ?? undefined}
                            style={{
                              pointerEvents: polygonPointer,
                              cursor: 'pointer',
                            }}
                            onClick={(evt) => {
                              evt.stopPropagation();
                              setSelectedPrintElement(element);
                            }}
                          />
                          {isSelected && (
                            <g
                              onClick={(evt) => {
                                evt.stopPropagation();
                                deletePrintElement(element.id);
                              }}
                              style={{ cursor: 'pointer', pointerEvents: 'auto' }}
                            >
                              <circle cx={centerX} cy={centerY} r={12} fill="#b91c1c" />
                              <text
                                x={centerX}
                                y={centerY + 4}
                                textAnchor="middle"
                                fill="#ffffff"
                                fontSize="14"
                                fontWeight="700"
                              >
                                x
                              </text>
                            </g>
                          )}
                        </svg>
                      );
                    }
                    case 'polyline':
                    case 'arrow': {
                      const linePts = projected.projectedLinePoints || [];
                      if (linePts.length < 2) return null;
                      const headMode = element.type === 'arrow' ? 'end' : element.arrowHead || 'none';
                      const showEndHead = headMode === 'end' || headMode === 'both';
                      const showStartHead = headMode === 'both';
                      const ptsStr = linePts.map(([x, y]) => `${x},${y}`).join(' ');
                      const isSelected = selectedPrintElement?.id === element.id;
                      const bbox = linePts.reduce(
                        (acc, [x, y]) => ({
                          minX: Math.min(acc.minX, x),
                          maxX: Math.max(acc.maxX, x),
                          minY: Math.min(acc.minY, y),
                          maxY: Math.max(acc.maxY, y),
                        }),
                        { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity }
                      );
                      const centerX =
                        linePts.length && Number.isFinite(bbox.minX)
                          ? (bbox.minX + bbox.maxX) / 2
                          : 0;
                      const centerY =
                        linePts.length && Number.isFinite(bbox.minY)
                          ? (bbox.minY + bbox.maxY) / 2
                          : 0;
                      const dash = element.lineDasharray;
                      const strokeCol = element.stroke || (element.type === 'arrow' ? '#d97706' : '#2563eb');
                      const sw = element.strokeWidth ?? 3;
                      const cap = element.strokeLinecap || 'round';
                      const join = element.strokeLinejoin || 'round';
                      const endSeg = showEndHead
                        ? segmentIndexTowardTip(linePts, linePts.length - 1)
                        : null;
                      const startSeg = showStartHead
                        ? segmentIndexTowardTip(linePts, 0)
                        : null;
                      const tickSegs = element.transmissionTicks
                        ? transmissionTickSegments(linePts, 20, 7)
                        : [];
                      return (
                        <svg
                          key={`${element.id}-${selectedPrintElement?.id ?? 'none'}`}
                          style={{
                            position: 'absolute',
                            top: 0,
                            left: 0,
                            width: '100%',
                            height: '100%',
                            pointerEvents: 'none',
                            overflow: 'visible',
                            zIndex: 2,
                          }}
                        >
                          <polyline
                            points={ptsStr}
                            fill="none"
                            stroke="transparent"
                            strokeWidth={14}
                            strokeLinecap={cap}
                            strokeLinejoin={join}
                            style={{ pointerEvents: featurePtr, cursor: 'pointer' }}
                            onClick={(evt) => {
                              evt.stopPropagation();
                              setSelectedPrintElement(element);
                            }}
                          />
                          {element.fenceOutlineStroke && (
                            <polyline
                              points={ptsStr}
                              fill="none"
                              stroke={element.fenceOutlineStroke}
                              strokeWidth={element.fenceOutlineWidth ?? 5}
                              strokeOpacity={element.fenceOutlineOpacity ?? 0.35}
                              strokeLinecap={cap}
                              strokeLinejoin={join}
                              style={{ pointerEvents: 'none' }}
                            />
                          )}
                          <polyline
                            points={ptsStr}
                            fill="none"
                            stroke={strokeCol}
                            strokeWidth={sw}
                            strokeOpacity={element.strokeOpacity ?? 1}
                            strokeLinecap={cap}
                            strokeLinejoin={join}
                            strokeDasharray={dash || undefined}
                            style={{ pointerEvents: 'none' }}
                          />
                          {element.roadMarkingStroke && (
                            <polyline
                              points={ptsStr}
                              fill="none"
                              stroke={element.roadMarkingStroke}
                              strokeWidth={element.roadMarkingWidth ?? 2}
                              strokeOpacity={element.strokeOpacity ?? 1}
                              strokeLinecap={element.roadMarkingLinecap || 'round'}
                              strokeLinejoin={join}
                              strokeDasharray={element.roadMarkingDasharray || undefined}
                              style={{ pointerEvents: 'none' }}
                            />
                          )}
                          {tickSegs.map((t, i) => (
                            <line
                              key={`tx-${element.id}-${i}`}
                              x1={t.x1}
                              y1={t.y1}
                              x2={t.x2}
                              y2={t.y2}
                              stroke={strokeCol}
                              strokeOpacity={element.strokeOpacity ?? 1}
                              strokeWidth={1.25}
                              style={{ pointerEvents: 'none' }}
                            />
                          ))}
                          {endSeg && (
                            <polygon
                              points={arrowHeadPolygon(endSeg.ax1, endSeg.ay1, endSeg.ax2, endSeg.ay2, sw)}
                              fill={strokeCol}
                              fillOpacity={element.strokeOpacity ?? 1}
                              style={{ pointerEvents: 'none' }}
                            />
                          )}
                          {startSeg && (
                            <polygon
                              points={arrowHeadPolygon(
                                startSeg.ax1,
                                startSeg.ay1,
                                startSeg.ax2,
                                startSeg.ay2,
                                sw
                              )}
                              fill={strokeCol}
                              fillOpacity={element.strokeOpacity ?? 1}
                              style={{ pointerEvents: 'none' }}
                            />
                          )}
                          {isSelected && (
                            <g
                              onClick={(evt) => {
                                evt.stopPropagation();
                                deletePrintElement(element.id);
                              }}
                              style={{ cursor: 'pointer', pointerEvents: 'auto' }}
                            >
                              <circle cx={centerX} cy={centerY} r={12} fill="#b91c1c" />
                              <text
                                x={centerX}
                                y={centerY + 4}
                                textAnchor="middle"
                                fill="#ffffff"
                                fontSize="14"
                                fontWeight="700"
                              >
                                x
                              </text>
                            </g>
                          )}
                        </svg>
                      );
                    }
                    case 'note':
                      return (
                        <DraggableNote
                          key={`${element.id}-${selectedPrintElement?.id ?? 'none'}`}
                          note={projected}
                          onNoteChange={(updated) => updatePrintElement(syncProjectedEditToGeo(updated))}
                          onDelete={deletePrintElement}
                          bounds="#notes-overlay"
                          featurePointerEvents={featurePtr}
                        />
                      );
                    case 'legend':
                      return (
                        <DraggableLegend
                          key={element.id}
                          element={projected}
                          onPositionChange={(updated) =>
                            updatePrintElement(syncProjectedEditToGeo(updated))
                          }
                          onDelete={() => deletePrintElement(element.id)}
                          featurePointerEvents={featurePtr}
                        >
                          <h4 style={{ color: 'black' }}>Legend</h4>
                          {legendItems}
                        </DraggableLegend>
                      );
                    case 'compass':
                      return (
                        <CompassElement
                          key={element.id}
                          element={projected}
                          onDelete={deletePrintElement}
                          featurePointerEvents={featurePtr}
                        />
                      );
                    case 'shape':
                      return (
                        <ShapeElement
                          key={`${element.id}`}
                          shape={projected}
                          onDelete={deletePrintElement}
                          onChange={(updated) => updatePrintElement(syncProjectedEditToGeo(updated))}
                          featurePointerEvents={featurePtr}
                        />
                      );
                    case 'rectangle':
                      return (
                        <RectangleElement
                          key={`${element.id}`}
                          shape={projected}
                          onChange={(updated) => updatePrintElement(syncProjectedEditToGeo(updated))}
                          onDelete={deletePrintElement}
                          featurePointerEvents={featurePtr}
                        />
                      );
                    case 'diamond':
                      return (
                        <DiamondElement
                          key={`${element.id}-${selectedPrintElement?.id ?? 'none'}`}
                          shape={projected}
                          onChange={(updated) => updatePrintElement(syncProjectedEditToGeo(updated))}
                          onDelete={deletePrintElement}
                          featurePointerEvents={featurePtr}
                        />
                      );
                    case 'triangle':
                      return (
                        <TriangleElement
                          key={`${element.id}`}
                          shape={projected}
                          onChange={(updated) => updatePrintElement(syncProjectedEditToGeo(updated))}
                          onDelete={deletePrintElement}
                          featurePointerEvents={featurePtr}
                        />
                      );
                    default:
                      return null;
                  }
                })}
              {isPrinting &&
                printElements.map((element) => {
                  if (!shouldRenderPrintElementOnMap(element)) return null;
                  const passiveHover =
                    hoveredPrintElementId === element.id && !element.showLabelOnMap;
                  const baseLngLat = getElementAnchorLngLat(element);
                  let geoAnchor = getElementAnchorScreenPosition(element);
                  if (
                    !passiveHover &&
                    labelUsesGeoOffset(element) &&
                    baseLngLat &&
                    mapRef.current
                  ) {
                    geoAnchor = mapRef.current.project([
                      baseLngLat.lng + element.labelOffsetDLng,
                      baseLngLat.lat + element.labelOffsetDLat,
                    ]);
                  }
                  const anchor =
                    passiveHover && hoveredPrintCursorOverlayPx
                      ? hoveredPrintCursorOverlayPx
                      : geoAnchor;
                  const labelText = buildMapLabelDisplayText(element);
                  const shouldShow =
                    labelText.trim().length > 0 &&
                    (element.showLabelOnMap || hoveredPrintElementId === element.id);
                  if (!shouldShow || !anchor) return null;
                  const labelSelectable =
                    !shareViewerReadOnly &&
                    (!activePrintTool || activePrintTool === 'select');
                  return (
                    <PrintMapLabel
                      key={`lbl-${element.id}`}
                      element={element}
                      anchor={anchor}
                      mapRef={mapRef}
                      labelBaseLngLat={baseLngLat}
                      passiveHover={passiveHover}
                      selected={selectedPrintElement?.id === element.id}
                      selectable={labelSelectable}
                      onSelect={() => setSelectedPrintElement(element)}
                      updatePrintElement={updatePrintElement}
                    />
                  );
                })}
        </div>
      )}
      </div>

      {shareViewerReadOnly &&
        currentSharePhotoElement &&
        currentSharePhotoGallery.length > 0 &&
        !sharePhotoPopupFullscreen && (
        <div
          className="shared-photo-card-wrap"
          style={currentSharePhotoCardStyle}
          onMouseEnter={() => setHoveredPrintElementId(null)}
        >
          <article className="shared-photo-card" role="dialog" aria-label="Photo point">
            <header className="shared-photo-card-header">
              <h3 className="shared-photo-card-title">
                {(currentSharePhotoElement.label && String(currentSharePhotoElement.label).trim()) ||
                  'Photo Point'}
              </h3>
              <button
                type="button"
                className="shared-photo-card-close"
                aria-label="Close"
                onClick={closeSharePhotoPopup}
              >
                x
              </button>
            </header>
            <div className="shared-photo-card-image-shell">
              {currentSharePhotoGallery.length > 1 && (
                <>
                  <button
                    type="button"
                    className="shared-photo-card-photo-nav shared-photo-card-photo-nav-prev"
                    aria-label="Previous photo"
                    onClick={() => stepSharePhotoPopup(-1)}
                  >
                    ‹
                  </button>
                  <button
                    type="button"
                    className="shared-photo-card-photo-nav shared-photo-card-photo-nav-next"
                    aria-label="Next photo"
                    onClick={() => stepSharePhotoPopup(1)}
                  >
                    ›
                  </button>
                  <span className="shared-photo-card-photo-index" aria-live="polite">
                    {sharePhotoPopupIndex + 1} / {currentSharePhotoGallery.length}
                  </span>
                </>
              )}
              <img
                src={currentSharePhotoGallery[Math.min(sharePhotoPopupIndex, currentSharePhotoGallery.length - 1)]}
                alt={currentSharePhotoElement.label || 'Photo point'}
                className="shared-photo-card-image"
              />
              <button
                type="button"
                className="shared-photo-card-expand"
                aria-label="Open fullscreen gallery"
                onClick={() => setSharePhotoPopupFullscreen(true)}
              >
                ⤢
              </button>
            </div>
          </article>
        </div>
      )}
      {shareViewerReadOnly && currentSharePhotoElement && (
        <SharedPhotoFullscreen
          open={sharePhotoPopupFullscreen && currentSharePhotoGallery.length > 0}
          onClose={() => setSharePhotoPopupFullscreen(false)}
          gallery={currentSharePhotoGallery}
          photoIndex={sharePhotoPopupIndex}
          onStepPhoto={stepSharePhotoPopup}
          alt={currentSharePhotoElement.label || 'Photo point'}
        />
      )}

      {isPrinting && !isPropertyTourRoute && (
        <div
          className={`print-map-top-toolbar${
            shareViewerReadOnly ? ' print-map-top-toolbar--share' : ''
          }`}
        >
          <label
            className={`print-parcels-toggle${
              propertyMapWizardActive ? ' print-parcels-toggle-disabled' : ''
            }`}
            title={
              propertyMapWizardActive
                ? 'Parcels stay on while you select boundaries'
                : 'Show or hide parcel outlines (synced with Layers → Ownership)'
            }
          >
            <input
              type="checkbox"
              checked={propertyMapWizardActive || Boolean(layerStatus.ownership)}
              disabled={propertyMapWizardActive}
              onChange={(e) => {
                if (propertyMapWizardActive) return;
                const next = e.target.checked;
                setPrintParcelsOverlayVisible(next);
                setLayerStatus((prev) => ({
                  ...(prev || {}),
                  ownership: next,
                }));
              }}
            />
            <span>Parcels</span>
          </label>
        </div>
      )}

      {isPrinting && propertyMapWizardActive && (
        <div className="property-map-wizard-bar">
          <div className="property-map-wizard-bar-inner">
            <p className="property-map-wizard-title">Select parcel boundaries</p>
            <p className="property-map-wizard-help">
              {propertyMapWizardIntent === 'single' ? (
                <>
                  Click a parcel on the map to select it. When it looks right, press{' '}
                  <strong>Continue with selected parcels</strong> below.
                </>
              ) : (
                <>
                  Click a parcel to select the first one. To add or remove more parcels, hold{' '}
                  <kbd className="property-map-wizard-kbd">Shift</kbd> and click each parcel.
                </>
              )}
            </p>
            <p className="property-map-wizard-help property-map-wizard-help-secondary">
              {propertyMapWizardIntent === 'single'
                ? 'You can change the selection by clicking a different parcel before you continue.'
                : 'When you are ready, continue — multiple parcels merge into one outline when they touch, or separate outlines when they do not.'}
            </p>
            <p className="property-map-wizard-count">
              Selected:{' '}
              <strong>{(selectedFeature || []).filter(isRegridParcelPolygonFeature).length}</strong> parcel
              {(selectedFeature || []).filter(isRegridParcelPolygonFeature).length === 1 ? '' : 's'}
            </p>
            <div className="property-map-wizard-actions">
              <button
                type="button"
                className="property-map-wizard-btn property-map-wizard-btn-secondary"
                onClick={handlePropertyMapWizardCancel}
              >
                Cancel
              </button>
              <button
                type="button"
                className="property-map-wizard-btn property-map-wizard-btn-primary"
                onClick={handlePropertyMapWizardContinue}
                disabled={(selectedFeature || []).filter(isRegridParcelPolygonFeature).length === 0}
              >
                Continue with selected parcels
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Print feature editor: fixed below Save / Back (Print.js ~72px toolbar) */}
      {isPrinting && selectedPrintElement && !shareViewerReadOnly && (
        <div
          className="print-map-feature-edit-wrap"
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
          onMouseEnter={() => setHoveredPrintElementId(null)}
        >
          <PrintFeatureEditPanel
            selectedPrintElement={selectedPrintElement}
            updatePrintElement={updatePrintElement}
            deletePrintElement={deletePrintElement}
            onRequestClose={() => setSelectedPrintElement(null)}
          />
        </div>
      )}

      {(subscriptionStatus !== "active" && subscriptionStatus !== "plus" && subscriptionStatus !== "regular") &&
        role !== "demo" &&
        !isClientShareMapRoute && (
        <div className="map-overlay">
          <h2 className="overlay-title">
            {user ? "Subscription required" : "Login to Access the Map"}
          </h2>
          <p className="overlay-text">
            {user
              ? "Choose a plan and start your free trial to interact with the data."
              : "You must have an active subscription to interact with the data."}
          </p>
          <button
            className="overlay-button"
            onClick={() => {
              navigate(user ? "/signup" : "/login");
            }}
          >
            {user ? "Choose a plan" : "Sign In"}
          </button>
          {user && (
            <button
              type="button"
              className="overlay-button overlay-button--secondary"
              onClick={() => navigateToMarketingHome(navigate)}
            >
              Return home
            </button>
          )}
        </div>
      )}
    </div>
  );
};

export default MapPage;
