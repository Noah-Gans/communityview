import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useMapContext } from '../MapContext';
import { useUser } from '../../contexts/UserContext';
import './Print.css';
import { mapService } from '../../services/mapService';
import {
  saveMapPdfWithFooter,
  sanitizeMapExportBasename,
} from '../../utils/mapExportCapture';
import { legends } from '../../assets/legends';
import { layerNameMappings } from '../../components/map/layerMappings';
import PrintDashboard from './PrintDashboard';
import ShareMapPanel from './ShareMapPanel';
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
  } = useMapContext();

  const [viewMode, setViewMode] = useState('dashboard');
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

  const PAPER_INCHES = useMemo(
    () => ({
      letter: { w: 8.5, h: 11 },
      legal: { w: 8.5, h: 14 },
      tabloid: { w: 11, h: 17 },
      a4: { w: 8.27, h: 11.69 },
    }),
    []
  );

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

  // Filter maps by search query
  const filteredMaps = savedMaps.filter((map) => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
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

  /** Satellite-style basemap (Mapbox satellite + county high-def raster) for map maker flows. */
  const applyMapMakerSatelliteBasemap = () => {
    queueMicrotask(() => {
      try {
        if (typeof window.handleSetHighDefBasemap === 'function') {
          window.handleSetHighDefBasemap(false);
        }
      } catch (_) {
        /* map may not be mounted yet */
      }
    });
  };

  /** General map builder (no parcel wizard). */
  const startGeneralMapEditor = () => {
    setPropertyMapWizardIntent(null);
    setPropertyMapWizardActive(false);
    setCurrentMapId(null);
    setCurrentMap(null);
    clearPrintElements();
    enterEditMode();
    applyMapMakerSatelliteBasemap();
  };

  /** Property map: pick parcel(s) on map, then merge into print canvas. */
  const startPropertyMapEditor = (intent) => {
    setPropertyMapWizardIntent(intent);
    setCurrentMapId(null);
    setCurrentMap(null);
    clearPrintElements();
    setSelectedFeatures([]);
    setLayerStatus((prev) => ({ ...prev, ownership: false }));
    setPropertyMapWizardActive(true);
    enterEditMode();
    applyMapMakerSatelliteBasemap();
  };

  const openNewMapSetup = () => {
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
    if (pendingPrintBasemapRestoreRef) pendingPrintBasemapRestoreRef.current = null;
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

  // Load a saved map (summary list + full document fetch on open)
  const handleLoadMap = async (mapId) => {
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

      const savedBasemap = String(map.basemap || '').trim() || 'high-def-3inch';
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
        (activeBasemapIdRef?.current || currentBasemapId || 'high-def-3inch').trim() ||
        'high-def-3inch';
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
  const handleDeleteMap = async (mapId, e) => {
    e.stopPropagation();
    
    if (!window.confirm('Are you sure you want to delete this map?')) {
      return;
    }

    try {
      await mapService.deleteMap(mapId);
      
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
      alert('Failed to delete map');
    }
  };

  const handleShareMap = (mapId, e) => {
    e.stopPropagation();
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
      await saveMapPdfWithFooter({
        map,
        baseName: base,
        mapTitle: mapTitle || sharePanelResolved?.mapTitle || 'Map',
        agentName:
          currentMap?.agentName ||
          currentMap?.listingAgent?.name ||
          currentMap?.contact?.name ||
          [userProfile?.firstName, userProfile?.lastName].filter(Boolean).join(' ') ||
          '',
        agentEmail:
          currentMap?.agentEmail ||
          currentMap?.listingAgent?.email ||
          currentMap?.contact?.email ||
          userProfile?.contactEmail ||
          user?.email ||
          '',
        agentPhone:
          currentMap?.agentPhone ||
          currentMap?.listingAgent?.phone ||
          currentMap?.contact?.phone ||
          userProfile?.contactPhone ||
          '',
        agentLogoUrl:
          currentMap?.agentLogoUrl ||
          currentMap?.brandLogoUrl ||
          currentMap?.listingAgent?.logoUrl ||
          userProfile?.firmLogoUrl ||
          '',
        paperSize: options.paperSize || 'letter',
        orientation: options.orientation || 'landscape',
        dpi: options.dpi || 300,
        printElements,
        layerStatus,
        layerNameMappings,
        layerLegends: legends,
        cropRectCss: options.cropRectCss || printLayoutRect || null,
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
    printElements,
    layerStatus,
    printLayoutRect,
    setPrintLayoutMode,
    userProfile,
    user,
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
          />
        )}
        {newMapSetupOpen && (
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
          onCreateNewMap={openNewMapSetup}
          onLoadMap={handleLoadMap}
          onShareMap={handleShareMap}
          onDeleteMap={handleDeleteMap}
          formatDate={formatDate}
        />
      </>
    );
  }

  return (
    <>
      {openingMapId && (
        <div
          className="shared-map-loading-blocker print-map-open-blocker"
          role="status"
          aria-live="polite"
          aria-busy="true"
        >
          <div className="shared-map-loading-card">
            <img
              src="/logo_transparent_no_background.png"
              alt="Community View"
              className="shared-map-loading-logo"
            />
            <div className="shared-map-loading-title">Loading map</div>
            <div className="shared-map-loading-subtitle">
              {openingMapTitle ? (
                <>
                  Preparing <strong>{openingMapTitle}</strong> — basemap, layers, and map elements…
                </>
              ) : (
                'Preparing basemap, layers, and map elements…'
              )}
            </div>
          </div>
        </div>
      )}
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
