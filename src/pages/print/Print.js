import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useMapContext } from '../MapContext';
import { useUser } from '../../contexts/UserContext';
import './Print.css';
import { mapService } from '../../services/mapService';
import {
  saveMapPdfWithFooter,
  sanitizeMapExportBasename,
} from '../../utils/mapExportCapture';
import { buildPrintAgentMetaFromSources } from '../../utils/sharedMapAgentMeta';
import { normalizeAgentProfile } from '../../utils/agentProfile';
import { auth } from '../../firebase/firebaseConfig';
import { legends } from '../../assets/legends';
import { layerNameMappings } from '../../components/map/layerMappings';
import MapLoadingOverlay from '../../components/loading/MapLoadingOverlay';
import PrintDashboard from './PrintDashboard';
import ShareMapPanel from './ShareMapPanel';
import {
  mapHasShareableTour,
} from '../../utils/tourSettings';
import {
  fetchSavedMapsSummaries,
  invalidateSavedMapsCache,
} from '../../utils/savedMapsCache';
import { waitForMapRef } from '../../utils/waitForMapIdle';

export default function Print() {
  const { userProfile, user } = useUser();
  const {
    setIsPrinting,
    clearPrintElements,
    mapRef,
    layerStatus,
    layerOrder,
    layerLabels,
    paperSize,
    printElements,
    setPrintElements,
    agentProfile,
    setAgentProfile,
    setLayerStatus,
    setLayerOrder,
    setPaperSize: setPaperSizeContext,
    setSelectedFeatures,
    setPropertyMapWizardActive,
    setPropertyMapWizardIntent,
    printLayoutMode,
    setPrintLayoutMode,
    printLayoutRect,
    setPrintLayoutRect,
    currentBasemapId,
    setCurrentBasemapId,
    activeBasemapIdRef,
    pendingPrintBasemapRestoreRef,
    pendingCreateMapFromFeatureRef,
    pendingCreateMapBasemapIdRef,
    mobileMapsSearchQuery,
  } = useMapContext();

  const [viewMode, setViewMode] = useState(() =>
    pendingCreateMapFromFeatureRef?.current ? 'edit' : 'dashboard'
  );
  const [searchQuery, setSearchQuery] = useState('');
  const [savedMaps, setSavedMaps] = useState([]);
  const [currentMapId, setCurrentMapId] = useState(null);
  const [currentMap, setCurrentMap] = useState(null);
  const [mapTitle, setMapTitle] = useState('');
  const [mapDescription, setMapDescription] = useState('');
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [lastSavedNotice, setLastSavedNotice] = useState(null);
  const [sharePanel, setSharePanel] = useState(null);
  const [sharePanelTourMeta, setSharePanelTourMeta] = useState(null);
  const [newMapSetupOpen, setNewMapSetupOpen] = useState(false);
  const [draftMapTitle, setDraftMapTitle] = useState('');
  /** 'parcels' = property wizard; 'custom' = open canvas, no parcel step */
  const [draftMapKind, setDraftMapKind] = useState(null);
  const [printPaperSize, setPrintPaperSize] = useState('letter');
  const [printOrientation, setPrintOrientation] = useState('landscape');
  const [printDpi, setPrintDpi] = useState(300);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  /** While set, full-screen blocker hides stale map until load + basemap settle. */
  const [openingMapId, setOpeningMapId] = useState(null);
  const mapLoadGenerationRef = useRef(0);
  const [isMobileViewport, setIsMobileViewport] = useState(
    () => typeof window !== 'undefined' && window.innerWidth <= 768
  );

  const PAPER_INCHES = useMemo(
    () => ({
      letter: { w: 8.5, h: 11 },
      legal: { w: 8.5, h: 14 },
      tabloid: { w: 11, h: 17 },
      a4: { w: 8.27, h: 11.69 },
    }),
    []
  );

  useEffect(() => {
    const onResize = () => setIsMobileViewport(window.innerWidth <= 768);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // Load user's saved maps
  const loadSavedMaps = useCallback(
    async (force = false) => {
      if (!user) return;

      try {
        setIsLoading(true);
        const maps = await fetchSavedMapsSummaries(user, force);
        setSavedMaps(maps);
      } catch (error) {
        console.error('Error loading saved maps:', error);
        setSaveError('Failed to load saved maps');
      } finally {
        setIsLoading(false);
      }
    },
    [user]
  );

  // Filter maps by search query (mobile search lives in MobileTopBar)
  const mapsFilterQuery = isMobileViewport ? mobileMapsSearchQuery : searchQuery;
  const filteredMaps = savedMaps.filter((map) => {
    if (!mapsFilterQuery) return true;
    const query = mapsFilterQuery.toLowerCase();
    return (
      (map.title || '').toLowerCase().includes(query) ||
      (map.description || '').toLowerCase().includes(query)
    );
  });

  const sharePanelResolved = useMemo(() => {
    if (!sharePanel) return null;
    if (sharePanel.needsSave) {
      return {
        needsSave: true,
        mapTitle: (sharePanel.title || mapTitle || '').trim() || 'Untitled map',
        mapDescription: mapDescription || '',
        mapId: null,
        shareToken: null,
        isPublic: false,
      };
    }
    if (sharePanel.mapId) {
      const m = savedMaps.find((x) => x.id === sharePanel.mapId);
      return {
        needsSave: false,
        mapTitle: (m?.title || mapTitle || '').trim() || 'Untitled map',
        mapDescription: (m?.description ?? mapDescription ?? '').trim(),
        mapId: sharePanel.mapId,
        shareToken: m?.shareToken || null,
        isPublic: !!m?.isPublic,
      };
    }
    return null;
  }, [sharePanel, savedMaps, mapTitle, mapDescription]);

  const resolvedTourMeta = useMemo(() => {
    if (sharePanelTourMeta) {
      return {
        tourNearbyCache: sharePanelTourMeta.tourNearbyCache || null,
        tourSettings: sharePanelTourMeta.tourSettings || null,
        tourSlidePlan: sharePanelTourMeta.tourSlidePlan || null,
      };
    }
    if (viewMode === 'edit' && currentMap) {
      return {
        tourNearbyCache: currentMap.tourNearbyCache || null,
        tourSettings: currentMap.tourSettings || null,
        tourSlidePlan: currentMap.tourSlidePlan || null,
      };
    }
    return {
      tourNearbyCache: null,
      tourSettings: null,
      tourSlidePlan: null,
    };
  }, [viewMode, currentMap, sharePanelTourMeta]);

  const hasTourData = useMemo(
    () =>
      mapHasShareableTour({
        tourNearbyCache: resolvedTourMeta.tourNearbyCache,
        tourSettings: resolvedTourMeta.tourSettings,
        tourSlidePlan: resolvedTourMeta.tourSlidePlan,
      }),
    [resolvedTourMeta]
  );

  const handleTourGenerated = useCallback((result) => {
    setSharePanelTourMeta({
      tourNearbyCache: result?.tourNearbyCache || null,
      tourSettings: result?.tourSettings || null,
      tourSlidePlan: result?.tourSlidePlan || null,
    });
    if (viewMode === 'edit' && currentMapId) {
      setCurrentMap((prev) =>
        prev
          ? {
              ...prev,
              tourNearbyCache: result?.tourNearbyCache || prev.tourNearbyCache,
              tourSettings: result?.tourSettings || prev.tourSettings,
              tourSlidePlan: result?.tourSlidePlan || prev.tourSlidePlan,
            }
          : prev
      );
    }
  }, [viewMode, currentMapId]);

  useEffect(() => {
    const mapId = sharePanelResolved?.mapId;
    if (!mapId || !sharePanel) {
      if (!mapId) setSharePanelTourMeta(null);
      return;
    }
    let cancelled = false;
    mapService
      .getMapById(mapId)
      .then((map) => {
        if (cancelled) return;
        setSharePanelTourMeta({
          tourNearbyCache: map.tourNearbyCache || null,
          tourSettings: map.tourSettings || null,
          tourSlidePlan: map.tourSlidePlan || null,
        });
      })
      .catch(() => {
        if (!cancelled) setSharePanelTourMeta(null);
      });
    return () => {
      cancelled = true;
    };
  }, [sharePanelResolved?.mapId, sharePanel]);

  useEffect(() => {
    window.dispatchEvent(
      new CustomEvent('print-share-panel-visible', {
        detail: { visible: Boolean(sharePanelResolved) },
      })
    );
  }, [sharePanelResolved]);

  // Format date for display
  const formatDate = (timestamp) => {
    if (timestamp == null) return 'No date available';
    const date =
      typeof timestamp === 'number'
        ? new Date(timestamp)
        : typeof timestamp.toDate === 'function'
          ? timestamp.toDate()
          : null;
    if (!date || Number.isNaN(date.getTime())) return 'No date available';
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const enterEditMode = () => {
    setViewMode('edit');
    setIsPrinting(true);
  };

  const scheduleSavedBasemapApply = useCallback((savedBasemap, attempt = 0) => {
    const mapboxMap = mapRef?.current;
    const apply = typeof window.applyBasemapById === 'function' ? window.applyBasemapById : null;
    if (!apply || !mapboxMap) {
      if (attempt < 80) window.setTimeout(() => scheduleSavedBasemapApply(savedBasemap, attempt + 1), 50);
      return;
    }
    const run = () => {
      try {
        apply(savedBasemap);
      } catch (_) {
        /* ignore */
      }
    };
    if (mapboxMap.isStyleLoaded?.()) {
      run();
      return;
    }
    mapboxMap.once('idle', run);
  }, [mapRef]);

  const nudgeMapMakerBasemap = useCallback((basemapId) => {
    const next = String(basemapId || 'satellite-streets-v12').trim() || 'satellite-streets-v12';
    try {
      if (typeof window.nudgeBasemapById === 'function') {
        window.nudgeBasemapById(next);
      } else if (typeof window.applyBasemapById === 'function') {
        window.applyBasemapById(next);
      }
    } catch (_) {
      /* ignore */
    }
  }, []);

  /** Basemap for map maker flows — one apply + one late nudge (URL sync stays in Map.js). */
  const applyMapMakerBasemap = useCallback(
    (basemapId = 'satellite-streets-v12') => {
      const next = String(basemapId || 'satellite-streets-v12').trim() || 'satellite-streets-v12';
      setCurrentBasemapId(next);
      if (activeBasemapIdRef) activeBasemapIdRef.current = next;
      scheduleSavedBasemapApply(next);
      window.setTimeout(() => nudgeMapMakerBasemap(next), 450);
    },
    [activeBasemapIdRef, nudgeMapMakerBasemap, scheduleSavedBasemapApply, setCurrentBasemapId]
  );

  const applyMapMakerSatelliteBasemap = () => applyMapMakerBasemap('satellite-streets-v12');

  /** General map builder (no parcel wizard). */
  const startGeneralMapEditor = () => {
    setPropertyMapWizardIntent(null);
    setPropertyMapWizardActive(false);
    setCurrentMapId(null);
    setCurrentMap(null);
    clearPrintElements();
    setAgentProfile(normalizeAgentProfile(null));
    enterEditMode();
    applyMapMakerSatelliteBasemap();
  };

  /** Property map: pick parcel(s) on map, then merge into print canvas. */
  const startPropertyMapEditor = (intent) => {
    setPropertyMapWizardIntent(intent);
    setCurrentMapId(null);
    setCurrentMap(null);
    clearPrintElements();
    setAgentProfile(normalizeAgentProfile(null));
    setSelectedFeatures([]);
    setLayerStatus((prev) => ({ ...prev, ownership: false }));
    setPropertyMapWizardActive(true);
    enterEditMode();
    applyMapMakerSatelliteBasemap();
  };

  const openNewMapSetup = () => {
    if (isMobileViewport) return;
    setDraftMapTitle('');
    setDraftMapKind(null);
    setSaveError(null);
    setNewMapSetupOpen(true);
  };

  const handleNewMapSetupContinue = () => {
    const title = draftMapTitle.trim();
    if (!title) {
      setSaveError('Please enter a map title.');
      return;
    }
    if (!draftMapKind) {
      setSaveError('Choose Parcel / parcels or Custom / open above.');
      return;
    }
    setSaveError(null);
    setMapTitle(title);
    setMapDescription('');
    setNewMapSetupOpen(false);
    if (draftMapKind === 'custom') {
      startGeneralMapEditor();
    } else {
      startPropertyMapEditor('multi');
    }
  };

  // Exit edit mode - return to dashboard
  const exitEditMode = () => {
    mapLoadGenerationRef.current += 1;
    setOpeningMapId(null);
    setViewMode('dashboard');
    setIsPrinting(false);
    setPrintLayoutMode(false);
    setPropertyMapWizardActive(false);
    setPropertyMapWizardIntent(null);
    clearPrintElements();
    setAgentProfile(null);
    if (pendingPrintBasemapRestoreRef) pendingPrintBasemapRestoreRef.current = null;
  };

  useEffect(() => {
    if (!isMobileViewport) return;
    if (viewMode === 'edit') {
      exitEditMode();
    }
    if (newMapSetupOpen) {
      setNewMapSetupOpen(false);
    }
    if (pendingCreateMapFromFeatureRef?.current) {
      pendingCreateMapFromFeatureRef.current = null;
    }
  }, [isMobileViewport, viewMode, newMapSetupOpen, pendingCreateMapFromFeatureRef]);

  // Load a saved map (summary list + full document fetch on open)
  const handleLoadMap = async (mapId) => {
    if (isMobileViewport) return;
    const generation = mapLoadGenerationRef.current + 1;
    mapLoadGenerationRef.current = generation;

    const finishOpen = (map) => {
      if (mapLoadGenerationRef.current !== generation) return;
      setCurrentMapId(mapId);
      setCurrentMap(map);
      setMapTitle(map?.title || '');
      setMapDescription(map?.description || '');
      setOpeningMapId(null);
    };

    try {
      setSaveError(null);
      setPropertyMapWizardActive(false);
      setPropertyMapWizardIntent(null);

      if (!savedMaps.some((m) => m.id === mapId)) {
        setSaveError('Map not found');
        return;
      }

      setOpeningMapId(mapId);
      setCurrentMapId(mapId);
      setCurrentMap(null);
      setMapTitle('');
      setMapDescription('');
      clearPrintElements();
      setSelectedFeatures([]);
      setLayerStatus({});
      setLayerOrder([]);

      enterEditMode();

      const map = await mapService.getMapById(mapId);
      if (mapLoadGenerationRef.current !== generation) return;

      setAgentProfile(normalizeAgentProfile(map.agentProfile));

      const savedBasemap = String(map.basemap || '').trim() || 'satellite-streets-v12';
      if (process.env.NODE_ENV !== 'production') {
        console.log('[print] restore basemap from Firestore:', savedBasemap, map);
      }
      setCurrentBasemapId(savedBasemap);
      if (activeBasemapIdRef) activeBasemapIdRef.current = savedBasemap;
      try {
        const params = new URLSearchParams(window.location.search);
        if (params.get('basemap') !== savedBasemap) {
          params.set('basemap', savedBasemap);
          window.history.replaceState(
            window.history.state,
            '',
            `${window.location.pathname}?${params.toString()}`
          );
        }
      } catch (_) {
        // ignore URL sync failures
      }

      if (typeof window.setBasemapLayerSyncBlocked === 'function') {
        window.setBasemapLayerSyncBlocked(true);
      }

      mapService.loadMapState(
        map,
        {
          setLayerStatus,
          setLayerOrder,
          setPaperSize: setPaperSizeContext,
          setPrintElements,
          setCurrentBasemapId,
        },
        mapRef
      );

      await waitForMapRef(mapRef, 4000);
      scheduleSavedBasemapApply(savedBasemap);

      // Let React commit cleared canvas + new printElements before hiding the blocker.
      await new Promise((resolve) => {
        window.requestAnimationFrame(() => {
          window.requestAnimationFrame(resolve);
        });
      });

      finishOpen(map);
    } catch (error) {
      if (mapLoadGenerationRef.current !== generation) return;
      console.error('Error loading map:', error);
      setSaveError(error.message || 'Failed to load map');
      exitEditMode();
    } finally {
      if (mapLoadGenerationRef.current === generation) {
        setOpeningMapId(null);
      }
    }
  };

  const openingMapTitle = useMemo(() => {
    if (!openingMapId) return '';
    const row = savedMaps.find((m) => m.id === openingMapId);
    return (row?.title || '').trim() || 'Untitled Map';
  }, [openingMapId, savedMaps]);

  // Save map
  const handleSaveMap = async () => {
    if (!user) {
      setSaveError('You must be logged in to save maps');
      return;
    }

    if (!mapTitle.trim()) {
      setSaveError('Please enter a map title');
      return;
    }

    try {
      setIsSaving(true);
      setSaveError(null);

      const basemap =
        (activeBasemapIdRef?.current || currentBasemapId || 'satellite-streets-v12').trim() ||
        'satellite-streets-v12';
      const mapData = mapService.serializeMapState(
        {
          schemaVersion: 2,
          basemap,
          layerStatus,
          layerOrder,
          layerLabels,
          paperSize,
          printElements,
        },
        mapRef
      );

      const fullMapData = {
        title: mapTitle.trim(),
        description: mapDescription.trim(),
        ...mapData,
      };
      if (agentProfile) {
        fullMapData.agentProfile = normalizeAgentProfile(agentProfile);
      }

      let result;
      if (currentMapId) {
        await mapService.updateMap(currentMapId, fullMapData);
        result = { mapId: currentMapId };
    } else {
        result = await mapService.saveMap(fullMapData);
        setCurrentMapId(result.mapId);
      }

      invalidateSavedMapsCache();
      await loadSavedMaps(true);
      setShowSaveDialog(false);
      setLastSavedNotice(new Date().toLocaleString());
      setTimeout(() => setLastSavedNotice(null), 5000);
    } catch (error) {
      console.error('Error saving map:', error);
      setSaveError(error.message || 'Failed to save map');
    } finally {
      setIsSaving(false);
    }
  };

  // Delete a map
  const handleDeleteMap = async (mapId) => {
    try {
      await mapService.deleteMap(mapId);

      setSavedMaps((prev) => prev.filter((m) => m.id !== mapId));

      if (currentMapId === mapId) {
        setCurrentMapId(null);
        setCurrentMap(null);
        setMapTitle('');
        setMapDescription('');
        exitEditMode();
      }

      invalidateSavedMapsCache();
      await loadSavedMaps(true);
    } catch (error) {
      console.error('Error deleting map:', error);
      throw new Error(error?.message || 'Failed to delete map');
    }
  };

  const handleShareMap = (mapId) => {
    const map = savedMaps.find((m) => m.id === mapId);
    if (!map) return;
    setSharePanel({ mapId });
  };

  const handleShareCurrentMap = () => {
    if (!currentMapId) {
      setSharePanel({ needsSave: true, title: mapTitle });
      return;
    }
    setSharePanel({ mapId: currentMapId });
  };

  const startPrintLayoutFlow = useCallback(() => {
    setSharePanel(null);
    setPrintLayoutMode(true);
    if (!printLayoutRect) {
      setPrintLayoutRect(null);
    }
  }, [setPrintLayoutMode, printLayoutRect, setPrintLayoutRect]);

  const cancelPrintLayoutFlow = useCallback(() => {
    setPrintLayoutMode(false);
  }, [setPrintLayoutMode]);

  useEffect(() => {
    if (!printLayoutMode || !mapRef?.current) return;
    const canvasRect = mapRef.current.getCanvas().getBoundingClientRect();
    if (!canvasRect.width || !canvasRect.height) return;

    const paper = PAPER_INCHES[printPaperSize] || PAPER_INCHES.letter;
    const pageW = printOrientation === 'landscape' ? Math.max(paper.w, paper.h) : Math.min(paper.w, paper.h);
    const pageH = printOrientation === 'landscape' ? Math.min(paper.w, paper.h) : Math.max(paper.w, paper.h);
    const mapAreaAspect = pageW / Math.max(0.0001, pageH * 0.78); // keep in sync with footer split
    const screenInset = 18;
    // Keep the selection comfortably inside the map viewport so all handles stay visible.
    const maxW = Math.max(220, canvasRect.width * 0.72);
    const maxH = Math.max(160, canvasRect.height * 0.72);

    setPrintLayoutRect((prev) => {
      const prevCenterX = prev ? prev.x + prev.width / 2 : canvasRect.width / 2;
      const prevCenterY = prev ? prev.y + prev.height / 2 : canvasRect.height / 2;
      let nextW = prev?.width || Math.min(maxW, canvasRect.width * 0.58);
      let nextH = nextW / mapAreaAspect;

      if (nextH > maxH) {
        nextH = maxH;
        nextW = nextH * mapAreaAspect;
      }
      if (nextW > maxW) {
        nextW = maxW;
        nextH = nextW / mapAreaAspect;
      }
      nextW = Math.max(220, nextW);
      nextH = Math.max(160, nextH);

      const x = Math.min(
        Math.max(screenInset, prevCenterX - nextW / 2),
        canvasRect.width - nextW - screenInset
      );
      const y = Math.min(
        Math.max(screenInset, prevCenterY - nextH / 2),
        canvasRect.height - nextH - screenInset
      );
      return {
        x: Math.round(x),
        y: Math.round(y),
        width: Math.round(nextW),
        height: Math.round(nextH),
      };
    });
  }, [printLayoutMode, printPaperSize, printOrientation, mapRef, setPrintLayoutRect, PAPER_INCHES]);

  const getSanitizedExportBase = useCallback(() => {
    const raw = (sharePanelResolved?.mapTitle || mapTitle || 'map').trim();
    return sanitizeMapExportBasename(raw);
  }, [sharePanelResolved, mapTitle]);

  const handleExportPdf = useCallback(async (options = {}) => {
    const map = mapRef?.current;
    if (!map) {
      throw new Error('Map is not ready yet. Wait a moment and try again.');
    }
    const base = getSanitizedExportBase();
    setIsGeneratingPdf(true);
    try {
      const agentMeta = buildPrintAgentMetaFromSources(
        { ...(currentMap || {}), agentProfile: agentProfile || currentMap?.agentProfile || null },
        userProfile,
        user
      );
      await saveMapPdfWithFooter({
        map,
        baseName: base,
        mapTitle: mapTitle || sharePanelResolved?.mapTitle || 'Map',
        agentName: agentMeta.agentName,
        agentEmail: agentMeta.agentEmail,
        agentPhone: agentMeta.agentPhone,
        agentLogoUrl: agentMeta.agentLogo,
        agentPhotoUrl: agentMeta.agentPhoto,
        ownerUserId: user?.uid || auth.currentUser?.uid || '',
        paperSize: options.paperSize || 'letter',
        orientation: options.orientation || 'landscape',
        dpi: options.dpi || 300,
        printElements,
        layerStatus,
        layerNameMappings,
        layerLegends: legends,
        cropRectCss: options.cropRectCss || printLayoutRect || null,
        basemapId:
          currentBasemapId ||
          currentMap?.basemapId ||
          currentMap?.basemap ||
          '',
      });
      setSharePanel(null);
      setPrintLayoutMode(false);
    } finally {
      setIsGeneratingPdf(false);
    }
  }, [
    mapRef,
    getSanitizedExportBase,
    mapTitle,
    sharePanelResolved,
    currentMap,
    currentBasemapId,
    printElements,
    layerStatus,
    printLayoutRect,
    setPrintLayoutMode,
    userProfile,
    user,
    agentProfile,
  ]);

  useEffect(() => {
    if (user) {
      loadSavedMaps(false);
    } else {
      setSavedMaps([]);
      invalidateSavedMapsCache();
    }
  }, [user, loadSavedMaps]);

  // Safety cleanup: never leave print overlay mode stuck on route change/unmount.
  useEffect(() => {
    return () => {
      setIsPrinting(false);
      setPropertyMapWizardActive(false);
      setPropertyMapWizardIntent(null);
    };
  }, [setIsPrinting, setPropertyMapWizardActive, setPropertyMapWizardIntent]);

  /** Info panel “Create Map” → skip dashboard; open editor (boundary added in Map.js). */
  useLayoutEffect(() => {
    const pending = pendingCreateMapFromFeatureRef?.current;
    if (!pending) return;

    const props = pending.properties || {};
    const suggestedTitle = String(
      props.address || props.physical || props.owner || props.owner_name || ''
    ).trim();

    setPropertyMapWizardActive(false);
    setPropertyMapWizardIntent(null);
    setCurrentMapId(null);
    setCurrentMap(null);
    setMapTitle(suggestedTitle);
    setMapDescription('');
    clearPrintElements();
    enterEditMode();

    const basemapId =
      String(
        pendingCreateMapBasemapIdRef?.current ||
          activeBasemapIdRef?.current ||
          currentBasemapId ||
          'satellite-streets-v12'
      ).trim() || 'satellite-streets-v12';
    if (pendingCreateMapBasemapIdRef) pendingCreateMapBasemapIdRef.current = null;
    applyMapMakerBasemap(basemapId);
  }, [
    applyMapMakerBasemap,
    pendingCreateMapFromFeatureRef,
    pendingCreateMapBasemapIdRef,
    activeBasemapIdRef,
    currentBasemapId,
    clearPrintElements,
    setPropertyMapWizardActive,
    setPropertyMapWizardIntent,
  ]);

  useEffect(() => {
    const handleOpenSaveDialog = () => {
      if (viewMode !== 'edit') return;
      if (currentMap) {
        setMapTitle(currentMap.title || '');
        setMapDescription(currentMap.description || '');
      }
      setShowSaveDialog(true);
    };
    const handleExitEdit = () => {
      if (viewMode === 'edit') {
        exitEditMode();
      }
    };
    const handleShareEdit = () => {
      if (viewMode !== 'edit') return;
      handleShareCurrentMap();
    };
    window.addEventListener('print-open-save-dialog', handleOpenSaveDialog);
    window.addEventListener('print-exit-edit', handleExitEdit);
    window.addEventListener('print-share-map', handleShareEdit);
    return () => {
      window.removeEventListener('print-open-save-dialog', handleOpenSaveDialog);
      window.removeEventListener('print-exit-edit', handleExitEdit);
      window.removeEventListener('print-share-map', handleShareEdit);
    };
  }, [viewMode, currentMap, currentMapId, savedMaps, mapTitle]);

  if (viewMode === 'dashboard') {
    return (
      <>
        {sharePanelResolved && (
          <ShareMapPanel
            open
            onClose={() => setSharePanel(null)}
            mapTitle={sharePanelResolved.mapTitle}
            onMapTitleChange={setMapTitle}
            mapDescription={sharePanelResolved.mapDescription}
            onMapDescriptionChange={setMapDescription}
            mapId={sharePanelResolved.mapId}
            shareToken={sharePanelResolved.shareToken}
            isPublic={sharePanelResolved.isPublic}
            needsSave={sharePanelResolved.needsSave}
            onOpenSave={() => {
              setShowSaveDialog(true);
              setSharePanel(null);
            }}
            onMapsUpdated={loadSavedMaps}
            onOpenPrintMap={startPrintLayoutFlow}
            rasterExportDisabled
            rasterExportDisabledReason="Open a map with Edit map first — exports use the live map on screen."
            mobileShareFocus={isMobileViewport}
            hasTourData={hasTourData}
            onTourGenerated={handleTourGenerated}
          />
        )}
        {newMapSetupOpen && !isMobileViewport && (
          <div
            className="new-map-setup-overlay"
            onClick={() => {
              setNewMapSetupOpen(false);
              setSaveError(null);
            }}
            role="presentation"
          >
            <div
              className="new-map-setup-panel"
              onClick={(e) => e.stopPropagation()}
              role="dialog"
              aria-labelledby="new-map-setup-title"
            >
              <h1 id="new-map-setup-title" className="new-map-setup-title">
                Create a new map
              </h1>
              <p className="new-map-setup-lead">
                Name your map, then choose Parcel / parcels (select boundaries on the map) or Custom / open (blank
                canvas for layout and graphics).
              </p>

              <label className="new-map-setup-field-label" htmlFor="new-map-draft-title">
                Map title
              </label>
              <input
                id="new-map-draft-title"
                type="text"
                className="new-map-setup-title-input"
                value={draftMapTitle}
                onChange={(e) => setDraftMapTitle(e.target.value)}
                placeholder="e.g. Smith Ranch — irrigation map"
                autoFocus
              />

              <p className="new-map-setup-section-label">Map type</p>
              <div className="new-map-setup-scope-grid">
                <button
                  type="button"
                  className={`new-map-scope-card${draftMapKind === 'parcels' ? ' is-selected' : ''}`}
                  onClick={() => setDraftMapKind('parcels')}
                >
                  <span className="new-map-scope-card-title">Parcel / parcels</span>
                  <span className="new-map-scope-card-desc">
                    Click a parcel to start; hold Shift and click to add or remove more. Boundaries can merge into your
                    map.
                  </span>
                </button>
                <button
                  type="button"
                  className={`new-map-scope-card new-map-scope-card-muted${
                    draftMapKind === 'custom' ? ' is-selected' : ''
                  }`}
                  onClick={() => setDraftMapKind('custom')}
                >
                  <span className="new-map-scope-card-title">Custom / open</span>
                  <span className="new-map-scope-card-desc">
                    No parcel step — open layout with basemap, layers, and map elements only.
                  </span>
                </button>
              </div>

              {saveError && <div className="new-map-setup-error">{saveError}</div>}

              <div className="new-map-setup-actions">
                <button type="button" className="new-map-setup-btn ghost" onClick={() => setNewMapSetupOpen(false)}>
                  Cancel
                </button>
                <button
                  type="button"
                  className="new-map-setup-btn primary"
                  onClick={handleNewMapSetupContinue}
                  disabled={!draftMapTitle.trim() || !draftMapKind}
                >
                  Continue to map
                </button>
              </div>
            </div>
          </div>
        )}
        <PrintDashboard
          isLoading={isLoading}
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
          filteredMaps={filteredMaps}
          currentMapId={currentMapId}
          isMobile={isMobileViewport}
          onCreateNewMap={openNewMapSetup}
          onLoadMap={handleLoadMap}
          onShareMap={handleShareMap}
          onDeleteMap={handleDeleteMap}
          onMapsUpdated={() => loadSavedMaps(true)}
          formatDate={formatDate}
        />
      </>
    );
  }

  return (
    <>
      {openingMapId ? (
        <MapLoadingOverlay
          phraseSet="map"
          mapTitle={openingMapTitle || undefined}
          className="map-loading-overlay--print-open"
        />
      ) : null}
      {sharePanelResolved && (
        <ShareMapPanel
          open
          onClose={() => setSharePanel(null)}
          mapTitle={sharePanelResolved.mapTitle}
          onMapTitleChange={setMapTitle}
          mapDescription={sharePanelResolved.mapDescription}
          onMapDescriptionChange={setMapDescription}
          mapId={sharePanelResolved.mapId}
          shareToken={sharePanelResolved.shareToken}
          isPublic={sharePanelResolved.isPublic}
          needsSave={sharePanelResolved.needsSave}
          onOpenSave={() => {
            setShowSaveDialog(true);
            setSharePanel(null);
          }}
          onMapsUpdated={loadSavedMaps}
          onOpenPrintMap={startPrintLayoutFlow}
          hasTourData={hasTourData}
          onTourGenerated={handleTourGenerated}
        />
        )}
      {printLayoutMode && (
        <aside className="print-layout-options-panel" role="dialog" aria-label="Print options">
          <div className="print-layout-options-header">
            <h3>Print Options</h3>
            <button type="button" onClick={cancelPrintLayoutFlow} aria-label="Close print options">
              x
            </button>
          </div>

          <label className="print-layout-field">
            Paper size
            <select value={printPaperSize} onChange={(e) => setPrintPaperSize(e.target.value)}>
              <option value="letter">8.5 x 11 (Letter)</option>
              <option value="legal">8.5 x 14 (Legal)</option>
              <option value="tabloid">11 x 17 (Tabloid)</option>
              <option value="a4">A4</option>
            </select>
          </label>

          <label className="print-layout-field">
            Orientation
            <select value={printOrientation} onChange={(e) => setPrintOrientation(e.target.value)}>
              <option value="landscape">Landscape</option>
              <option value="portrait">Portrait</option>
            </select>
          </label>

          <label className="print-layout-field">
            DPI
            <select value={printDpi} onChange={(e) => setPrintDpi(Number(e.target.value) || 300)}>
              <option value={150}>150 (Fast)</option>
              <option value={300}>300 (Recommended)</option>
              <option value={450}>450 (High detail)</option>
            </select>
          </label>

          <p className="print-layout-help">
            Drag and resize the blue print area on the map. PDF includes a white footer with legend, scale bar, and
            north arrow.
          </p>

          <div className="print-layout-actions">
            <button type="button" className="ghost" onClick={cancelPrintLayoutFlow} disabled={isGeneratingPdf}>
              Cancel
            </button>
            <button
              type="button"
              className="primary"
              onClick={() =>
                handleExportPdf({
                  paperSize: printPaperSize,
                  orientation: printOrientation,
                  dpi: printDpi,
                  cropRectCss: printLayoutRect,
                })
              }
              disabled={isGeneratingPdf || !printLayoutRect}
            >
              {isGeneratingPdf ? 'Building PDF…' : 'Print to PDF'}
            </button>
          </div>
        </aside>
      )}
      {lastSavedNotice && (
        <div className="print-save-toast" role="status">
          Saved · {lastSavedNotice}
        </div>
      )}
      {showSaveDialog && (
        <div className="print-save-dialog-overlay" role="presentation">
          <div className="print-save-dialog-panel" role="dialog" aria-labelledby="print-save-dialog-title">
            <h3 id="print-save-dialog-title" className="print-save-dialog-heading">
              Save map
            </h3>
            <p className="print-save-dialog-lead">
              Name and describe this map. Everything on the canvas (layers, viewport, and map elements) is stored
              with your account.
            </p>
            <label className="print-save-dialog-field">
              Map title
              <input
                type="text"
                value={mapTitle}
                onChange={(e) => setMapTitle(e.target.value)}
                placeholder="e.g. Oak Creek listing map"
              />
            </label>
            <label className="print-save-dialog-field">
              Property description{' '}
              <span className="print-save-dialog-optional">(optional — shown on client share &amp; tour)</span>
              <textarea
                value={mapDescription}
                onChange={(e) => setMapDescription(e.target.value)}
                placeholder="Summarize the property for clients viewing the shared map or tour."
                rows={4}
              />
            </label>
            {saveError && <div className="print-save-dialog-error">{saveError}</div>}
            <div className="print-save-dialog-actions">
              <button
                type="button"
                className="print-save-dialog-btn print-save-dialog-btn--ghost"
                onClick={() => {
                  setShowSaveDialog(false);
                  setSaveError(null);
                }}
                disabled={isSaving}
              >
                Cancel
              </button>
              <button
                type="button"
                className="print-save-dialog-btn print-save-dialog-btn--primary"
                onClick={handleSaveMap}
                disabled={isSaving || !mapTitle.trim()}
              >
                {isSaving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
