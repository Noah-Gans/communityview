import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';

import {
  getPrintPixelScale,
  isPrintShapeIconPlacingTool,
} from './printHitTest';
import {
  getMetricsForLineLngLat,
  getMetricsForPolygonLngLat,
  isPolygonPlacingTool,
  isPolylinePlacingTool,
} from './printToolUtils';
import { getPolygonDraftStyle, getPolylineDraftStyle } from './printDraftStyles';
import {
  getElementAnchorLngLat,
  getElementAnchorScreenPosition,
  syncProjectedEditToGeo,
  withGeoProjectedFrame,
} from './printProjection';
import { pickPrintElementAtScreen as pickPrintElementAtScreenUtil } from './printPickAtScreen';
import {
  getRegridParcelBoundaryCoordinates,
  isRegridParcelPolygonFeature,
  mergeRegridParcelFeaturesPreferApi,
} from '../../../utils/regridParcelBoundary';
import { fetchParcelGeoJsonFeatureByLlUuid } from '../../../utils/regridParcelApi';
import {
  PRINT_GALLERY_DRAG_MIME,
  takePrintGalleryDragPayload,
} from '../../../utils/printGalleryDragBuffer';
import { getPhotoSrcListFromElement } from '../../../utils/mapPhotoStorage';
import {
  focusPrintElementBirdEye,
  isPropertyBoundaryPrintElement,
  rankPrintElementsWithPhotos,
} from '../../../utils/propertyTourSlides';

export default function useMapPrintOnMap(deps) {
  const {
    mapRef,
    mapIsReady,
    routerLocation,
    isClientShareMapRoute,
    isPropertyTourRoute,
    shareViewerReadOnly,
    isPrinting,
    setIsPrinting,
    printElements,
    printLayoutMode,
    printLayoutRect,
    setPrintLayoutRect,
    propertyMapWizardActive,
    setPropertyMapWizardActive,
    propertyMapWizardIntent,
    setPropertyMapWizardIntent,
    layerStatus,
    setLayerStatus,
    selectedFeature,
    setSelectedFeatures,
    selectedPrintElement,
    setSelectedPrintElement,
    activePrintTool,
    setActivePrintTool,
    addPrintElementFromTool,
    updatePrintElement,
    deletePrintElement,
    clearPrintElements,
    setShareViewerReadOnly,
    setIsPanelOpen,
    removeHighlight,
    activeSidePanelTab,
    setActiveSidePanelTab,
    paperSize,
    activeTab,
  } = deps;

  const prevPathForShareRef = useRef(routerLocation?.pathname || '');

  const [propertyTourSlideId, setPropertyTourSlideId] = useState(null);
  const [printSharePanelVisible, setPrintSharePanelVisible] = useState(false);
  const [printParcelsOverlayVisible, setPrintParcelsOverlayVisible] = useState(true);
  const [overlayRenderVersion, setOverlayRenderVersion] = useState(0);

  const [polygonDraftPoints, setPolygonDraftPoints] = useState([]);
  const [polygonCursorPoint, setPolygonCursorPoint] = useState(null);
  const [polylineDraftPoints, setPolylineDraftPoints] = useState([]);
  const [polylineCursorPoint, setPolylineCursorPoint] = useState(null);
  const [hoveredPrintElementId, setHoveredPrintElementId] = useState(null);
  const [hoveredPrintCursorOverlayPx, setHoveredPrintCursorOverlayPx] = useState(null);
  const [printIconPlaceCursorPx, setPrintIconPlaceCursorPx] = useState(null);

  const [sharePhotoPopupElementId, setSharePhotoPopupElementId] = useState(null);
  const [sharePhotoPopupFullscreen, setSharePhotoPopupFullscreen] = useState(false);
  const [sharePhotoPopupIndex, setSharePhotoPopupIndex] = useState(0);
  const [sharePhotoPopupAnchorTick, setSharePhotoPopupAnchorTick] = useState(0);

  const tourBoundaryOnlyPrint =
    isClientShareMapRoute &&
    (propertyTourSlideId === 'context' || propertyTourSlideId === 'vicinity');

  const shouldRenderPrintElementOnMap = useCallback(
    (element) => {
      if (!element || element.hiddenOnMap) return false;
      if (!tourBoundaryOnlyPrint) return true;
      return isPropertyBoundaryPrintElement(element);
    },
    [tourBoundaryOnlyPrint]
  );

  const isPrintingRef = useRef(isPrinting);
  const wasPrintingRef = useRef(false);
  const shareViewerReadOnlyRef = useRef(shareViewerReadOnly);
  const overlayRenderRafRef = useRef(null);
  const forceOverlaySyncUntilRef = useRef(0);
  const tabHiddenAtRef = useRef(0);
  const polygonDraftPointsRef = useRef([]);
  const polylineDraftPointsRef = useRef([]);
  const lastPlacementCommitRef = useRef({ tool: null, lng: null, lat: null, at: 0 });
  const parcelMapVisibility = useMemo(() => {
    const printHidesParcels =
      isPrinting && !printParcelsOverlayVisible && !propertyMapWizardActive;
    const own = Boolean(layerStatus?.ownership);
    const wiz = propertyMapWizardActive;
    return {
      showRegrid: (own || wiz) && !printHidesParcels,
    };
  }, [isPrinting, printParcelsOverlayVisible, propertyMapWizardActive, layerStatus?.ownership]);

  const getElementPhotoGallery = useCallback((element) => getPhotoSrcListFromElement(element), []);

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

  const shareViewerPhotoRanked = useMemo(
    () => rankPrintElementsWithPhotos(printElements),
    [printElements]
  );

  const currentSharePhotoCardStyle = useMemo(() => {
    if (!shareViewerReadOnly || !currentSharePhotoElement || !mapRef.current) return undefined;
    const anchor = getElementAnchorScreenPosition(mapRef.current, currentSharePhotoElement);
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
    isPrintingRef.current = isPrinting;
  }, [isPrinting]);

  useEffect(() => {
    shareViewerReadOnlyRef.current = shareViewerReadOnly;
  }, [shareViewerReadOnly]);

  useEffect(() => {
    polygonDraftPointsRef.current = polygonDraftPoints;
  }, [polygonDraftPoints]);

  useEffect(() => {
    polylineDraftPointsRef.current = polylineDraftPoints;
  }, [polylineDraftPoints]);

  useEffect(() => {
    const onTourSlide = (e) => {
      setPropertyTourSlideId(e.detail?.slideId ?? null);
    };
    window.addEventListener('property-tour-slide', onTourSlide);
    return () => {
      window.removeEventListener('property-tour-slide', onTourSlide);
      setPropertyTourSlideId(null);
    };
  }, []);

  useEffect(() => {
    const path = routerLocation?.pathname || '';
    const shareLike = path.startsWith('/view/') || path.startsWith('/tour/');
    setShareViewerReadOnly(shareLike);
    const prev = prevPathForShareRef.current;
    const prevShareLike = prev.startsWith('/view/') || prev.startsWith('/tour/');
    if (prevShareLike && !shareLike) {
      clearPrintElements();
      setSelectedPrintElement(null);
      setIsPrinting(false);
      setActivePrintTool('select');
    }
    prevPathForShareRef.current = path;
  }, [
    routerLocation?.pathname,
    clearPrintElements,
    setSelectedPrintElement,
    setIsPrinting,
    setActivePrintTool,
    setShareViewerReadOnly,
  ]);

  useEffect(() => {
    const onSharePanelVisible = (e) => {
      setPrintSharePanelVisible(!!e.detail?.visible);
    };
    window.addEventListener('print-share-panel-visible', onSharePanelVisible);
    return () => window.removeEventListener('print-share-panel-visible', onSharePanelVisible);
  }, []);

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
  }, [isPrinting, propertyMapWizardActive, printSharePanelVisible, printLayoutMode, setIsPanelOpen]);

  useEffect(() => {
    if (isPrinting && !wasPrintingRef.current) {
      setActiveSidePanelTab('print');
    }
    if (!isPrinting && wasPrintingRef.current && activeSidePanelTab === 'print') {
      setActiveSidePanelTab('layers');
    }
    wasPrintingRef.current = isPrinting;
  }, [isPrinting, activeSidePanelTab, setActiveSidePanelTab]);

  useEffect(() => {
    if (!isPrinting || propertyMapWizardActive) return;
    setPrintParcelsOverlayVisible(Boolean(layerStatus?.ownership));
  }, [isPrinting, layerStatus?.ownership, propertyMapWizardActive]);

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
      flushSync(() => {
        setOverlayRenderVersion((prev) => prev + 1);
      });
      try {
        mapRef.current.resize();
        if (typeof mapRef.current.triggerRepaint === 'function') {
          mapRef.current.triggerRepaint();
        }
      } catch (_) {}
      window.requestAnimationFrame(() => {
        setOverlayRenderVersion((prev) => prev + 1);
        window.requestAnimationFrame(() => {
          setOverlayRenderVersion((prev) => prev + 1);
        });
      });
      queue(() => {
        if (!mapRef?.current) return;
        mapRef.current.resize();
        mapRef.current.triggerRepaint?.();
        setOverlayRenderVersion((prev) => prev + 1);
      }, 80);
      queue(() => {
        if (!mapRef?.current) return;
        mapRef.current.resize();
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

  const pickPrintElementAtScreen = useCallback(
    (px, py) =>
      pickPrintElementAtScreenUtil(mapRef.current, printElements, isPrinting, px, py),
    [mapRef, printElements, isPrinting]
  );

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
  ]);

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
  }, [mapIsReady, isPrinting, activePrintTool, addPrintElementFromTool, setActivePrintTool, mapRef]);

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

  const closeSharePhotoPopup = useCallback(() => {
    setSharePhotoPopupFullscreen(false);
    setSharePhotoPopupElementId(null);
    setSharePhotoPopupIndex(0);
  }, []);

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

  useEffect(() => {
    if (activeTab === 'map') {
      setTimeout(() => {
        if (mapRef.current) {
          mapRef.current.resize();
          if (isPrinting) {
            mapRef.current.triggerRepaint?.();
            setOverlayRenderVersion((v) => v + 1);
            requestAnimationFrame(() => setOverlayRenderVersion((v) => v + 1));
          }
        }
      }, 50);
    }
  }, [activeTab, isPrinting, mapRef]);

  useEffect(() => {
    if (mapRef.current && mapRef.current.isStyleLoaded()) {
      setTimeout(() => {
        mapRef.current.resize();
        if (isPrinting) {
          mapRef.current.triggerRepaint?.();
          setOverlayRenderVersion((v) => v + 1);
        }
      }, 100);
    }
  }, [paperSize, isPrinting, mapRef]);

  const handleCreateBoundaryFromRegridParcel = useCallback(
    async (feature) => {
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
    },
    [isPrinting, setIsPrinting, addPrintElementFromTool, setActivePrintTool, setActiveSidePanelTab]
  );

  const zoomToPrintElement = useCallback(
    (element) => {
      const map = mapRef.current;
      if (!map || !element?.geometry) return;
      const g = element.geometry;
      try {
        if (g.type === 'Polygon' && g.coordinates?.[0]?.length >= 4) {
          const xs = g.coordinates[0].map((c) => c[0]);
          const ys = g.coordinates[0].map((c) => c[1]);
          const minX = Math.min(...xs);
          const minY = Math.min(...ys);
          const maxX = Math.max(...xs);
          const maxY = Math.max(...ys);
          map.fitBounds(
            [
              [minX, minY],
              [maxX, maxY],
            ],
            { padding: 80, duration: 700, maxZoom: 18 }
          );
          return;
        }
        if (g.type === 'LineString' && g.coordinates?.length >= 2) {
          const xs = g.coordinates.map((c) => c[0]);
          const ys = g.coordinates.map((c) => c[1]);
          const minX = Math.min(...xs);
          const minY = Math.min(...ys);
          const maxX = Math.max(...xs);
          const maxY = Math.max(...ys);
          map.fitBounds(
            [
              [minX, minY],
              [maxX, maxY],
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
      } catch (_) {}
    },
    [mapRef]
  );

  const handlePrintMapDragOver = useCallback(
    (e) => {
      if (!isPrinting) return;
      if (!e.dataTransfer?.types?.includes(PRINT_GALLERY_DRAG_MIME)) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
    },
    [isPrinting]
  );

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
    [isPrinting, mapRef, addPrintElementFromTool, setActivePrintTool]
  );

  const addPolygonBoundariesFromMergedFeature = useCallback(
    (merged) => {
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
            const poly = { type: 'Feature', geometry: { type: 'Polygon', coordinates: polyCoords }, properties: {} };
            addOne(poly);
          } catch (_) {}
        }
      }
    },
    [addPrintElementFromTool]
  );

  const handlePropertyMapWizardContinue = useCallback(async () => {
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
  }, [
    selectedFeature,
    addPolygonBoundariesFromMergedFeature,
    setPropertyMapWizardActive,
    setPropertyMapWizardIntent,
    setSelectedFeatures,
    removeHighlight,
    setActivePrintTool,
    setActiveSidePanelTab,
  ]);

  const handlePropertyMapWizardCancel = useCallback(() => {
    setPropertyMapWizardActive(false);
    setPropertyMapWizardIntent(null);
    setSelectedFeatures([]);
    removeHighlight();
    window.dispatchEvent(new CustomEvent('print-exit-edit'));
  }, [setPropertyMapWizardActive, setPropertyMapWizardIntent, setSelectedFeatures, removeHighlight]);

  return {
    printParcelsOverlayVisible,
    setPrintParcelsOverlayVisible,
    parcelMapVisibility,
    isPrintingRef,
    overlayRenderVersion,
    polygonDraftPoints,
    polygonCursorPoint,
    polylineDraftPoints,
    polylineCursorPoint,
    printIconPlaceCursorPx,
    setPrintIconPlaceCursorPx,
    hoveredPrintElementId,
    setHoveredPrintElementId,
    hoveredPrintCursorOverlayPx,
    sharePhotoPopupElementId,
    setSharePhotoPopupElementId,
    sharePhotoPopupFullscreen,
    setSharePhotoPopupFullscreen,
    sharePhotoPopupIndex,
    setSharePhotoPopupIndex,
    currentSharePhotoElement,
    currentSharePhotoGallery,
    currentSharePhotoCardStyle,
    closeSharePhotoPopup,
    stepSharePhotoPopup,
    stepSharePhotoFeature,
    shouldRenderPrintElementOnMap,
    handleCreateBoundaryFromRegridParcel,
    zoomToPrintElement,
    handlePrintMapDragOver,
    handlePrintMapDrop,
    handlePropertyMapWizardContinue,
    handlePropertyMapWizardCancel,
    getPolygonDraftStyle: () => getPolygonDraftStyle(activePrintTool),
    getPolylineDraftStyle: () => getPolylineDraftStyle(activePrintTool),
    withGeoProjectedFrame: (el) => withGeoProjectedFrame(mapRef.current, el),
    syncProjectedEditToGeo: (el) => syncProjectedEditToGeo(mapRef.current, el),
    getElementAnchorLngLat,
    getElementAnchorScreenPosition: (el) => getElementAnchorScreenPosition(mapRef.current, el),
    isPolygonPlacingTool,
    isPolylinePlacingTool,
    activePrintTool,
    isPropertyTourRoute,
    isPrintShapeIconPlacingTool,
    getPrintPixelScale,
    printElements,
    selectedPrintElement,
    setSelectedPrintElement,
    updatePrintElement,
    deletePrintElement,
    shareViewerReadOnly,
    addPrintElementFromTool,
    propertyMapWizardActive,
    propertyMapWizardIntent,
    selectedFeature,
    isRegridParcelPolygonFeature,
  };
}
