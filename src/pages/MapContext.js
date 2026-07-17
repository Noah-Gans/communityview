import React, { createContext, useState, useRef, useContext } from 'react';
import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import queryString from 'query-string';
import { createAnnotationFromTool } from './print/annotationModel';
import { getBasemapIdFromSearch } from './map/mapConstants';
// Create the context
const MapContext = createContext();

function parseLayerStateFromSearch(search) {
  const params = queryString.parse(search || '');
  if (!params.layers) {
    return { layerStatus: {}, layerOrder: [] };
  }
  const layerOrder = String(params.layers)
    .split(',')
    .map((layer) => layer.trim())
    .filter(Boolean);
  const layerStatus = {};
  layerOrder.forEach((layer) => {
    layerStatus[layer] = true;
  });
  return { layerStatus, layerOrder };
}

// Provider component
export const MapProvider = ({ children }) => {
  console.log("REMOUNT!!!!")
  const location = useLocation();
  const initialBasemapId = getBasemapIdFromSearch(location.search);
  const [activeTab, setActiveTab] = useState('intro'); // Manage tab state here
  const [isDrawing, setIsDrawing] = useState(false); // Add this state
  const isDrawingRef = useRef(false); // Reference for immediate access
  const [isGeoFilterActive, setIsGeoFilterActive] = useState(false);
  const isGeoFilterActiveRef = useRef(false);
  const [selectedFeature, setSelectedFeatures] = useState([]); // State for selected feature
  const [isFilterTriggered, setIsFilterTriggered] = useState(false);
  const [polygonData, setPolygonData] = useState(null); // Store the polygon data
  const [searchResults, setSearchResults] = useState([]); // State for selected feature
  const [focusFeatures, setFocusFeatures] = useState([])
  const [hoveredFeatureId, setHoveredFeatureId] = useState(null); // State to track hovered feature
  // ✅ PERSIST layer status & order using useRef
  const initialLayerState = parseLayerStateFromSearch(
    typeof window !== 'undefined' ? window.location.search : location.search
  );
  const layerStatusRef = useRef(initialLayerState.layerStatus);
  const layerOrderRef = useRef(initialLayerState.layerOrder);
  const initialSearch =
    typeof window !== 'undefined' ? window.location.search : location.search;
  const initialUrlParams = queryString.parse(initialSearch || '');
  /** Pan/zoom URL updates change lat/lng only — do not re-apply stale ?layers= on every search change. */
  const lastSyncedLayersParamRef = useRef(
    initialUrlParams.layers != null ? String(initialUrlParams.layers) : ''
  );
  const [layerStatus, setLayerStatus] = useState(initialLayerState.layerStatus);
  const [layerOrder, setLayerOrder] = useState(initialLayerState.layerOrder); 
  const [layerLabels, setLayerLabels] = useState({}); // Track which layers have labels enabled 
  /** Current selected basemap id (set by Map.js) so save/share persists actual map style choice. */
  const [currentBasemapId, setCurrentBasemapId] = useState(initialBasemapId);
  /** Ground-truth basemap for save/URL — updated synchronously when the user picks a basemap. */
  const activeBasemapIdRef = useRef(initialBasemapId);
  /** Set by Print when opening a saved map — forces a full basemap + layer restack in Map.js. */
  const pendingPrintBasemapRestoreRef = useRef(null);
  /** Set from Info panel “Create Map” — Print enters editor; Map.js adds a property boundary. */
  const pendingCreateMapFromFeatureRef = useRef(null);
  /** Basemap id at click time — reapplied before the editor is revealed. */
  const pendingCreateMapBasemapIdRef = useRef(null);

  //================ Print Vars ==================
  const [paperSize, setPaperSize] = useState('full'); // default to "full" screen
  const [isPrinting, setIsPrinting] = useState(false);
  /** "Create new map" → property-focused flow: select parcel(s), merge boundary, then full print UI. */
  const [propertyMapWizardActive, setPropertyMapWizardActive] = useState(false);
  /** Set when starting property wizard from Print: single parcel vs multi (copy + UX). */
  const [propertyMapWizardIntent, setPropertyMapWizardIntent] = useState(null);

  const [printElements, setPrintElements] = useState([]);
  /** Per-map agent/contact-card override (null = not loaded). See utils/agentProfile.js. */
  const [agentProfile, setAgentProfile] = useState(null);
  const [selectedPrintElement, setSelectedPrintElement] = useState(null);
  const [activePrintTool, setActivePrintTool] = useState('select');
  /** True on /view/:token or /tour/:token — disable editing chrome and drag on print features. */
  const [shareViewerReadOnly, setShareViewerReadOnly] = useState(false);
  /** Mobile top bar search on /print dashboard (My Maps). */
  const [mobileMapsSearchQuery, setMobileMapsSearchQuery] = useState('');
  /** Print layout mode for PDF crop box workflow. */
  const [printLayoutMode, setPrintLayoutMode] = useState(false);
  /** Crop box in CSS px relative to #map canvas: {x,y,width,height}. */
  const [printLayoutRect, setPrintLayoutRect] = useState(null);
  console.log(layerStatus)

  const pendingSelectionRef = useRef(null);
  const [isMapTriggeredFromSearch, setIsMapTriggeredFromSearch] = useState(false);
  const [selectedColumns, setSelectedColumns] = useState(() => {
    // Load saved columns from localStorage on mount
  const savedColumns = localStorage.getItem('selectedColumns');
    return savedColumns ? JSON.parse(savedColumns) : [];
  });
  const mapRef = useRef(null);
  /** Map.js assigns an async fn so the property tour can await 3D satellite + ortho before zooming. */
  const applyTourPropertyBasemapRef = useRef(null);
  const drawRef = useRef(null); // Store MapboxDraw instance
  const suppressNextFeatureClickRef = useRef(false);

  useEffect(() => {
    console.log("✅ MapProvider mounted ONCE");
  }, []);
  

  useEffect(() => {
    console.log("isPrinting updated in map context", isPrinting);
  }, [isPrinting]);
  
  useEffect(() => {
    console.log("🔄 printElements:", printElements.map(el => `${el.type}:${el.id}`));
    console.log("🎯 selectedPrintElement:", selectedPrintElement?.id || "None");
  }, [printElements, selectedPrintElement]);

  // ------------------- Sync layer state when URL ?layers= changes -------------------
  useEffect(() => {
    const params = queryString.parse(location.search || '');
    // Absent ?layers= means “not specified” (e.g. /print dashboard) — keep in-memory toggles.
    if (params.layers == null) return;

    const layersParam = String(params.layers);
    if (layersParam === lastSyncedLayersParamRef.current) return;
    lastSyncedLayersParamRef.current = layersParam;

    const next = parseLayerStateFromSearch(location.search);
    layerStatusRef.current = next.layerStatus;
    layerOrderRef.current = next.layerOrder;
    setLayerStatus(next.layerStatus);
    setLayerOrder(next.layerOrder);
  }, [location.search]);

  useEffect(() => {
    layerStatusRef.current = layerStatus;
    layerOrderRef.current = layerOrder;
  }, [layerStatus, layerOrder]);

  
  
  const setMapRef = (mapInstance) => {
    console.log('Setting mapRef...');
    mapRef.current = mapInstance;
    console.log('MapRef set to:', mapRef.current);
  };


  
  useEffect(() => {
    if (hoveredFeatureId !== null) {
      console.log("Hovered Feature ID:", hoveredFeatureId); // Log when a feature is hovered
      // Add additional logic here for handling feature hover (e.g., updating map highlights)
    } else {
      console.log("No feature hovered"); // Log when no feature is hovered
      // Add logic here for clearing highlights, if necessary
    }
  }, [hoveredFeatureId]);

  const toggleColumn = (column) => {
    console.log(column)
    setSelectedColumns((prev) => {
      const updatedColumns = prev.includes(column)
        ? prev.filter((col) => col !== column) // Remove column
        : [...prev, column]; // Add column
  
      // Save updated columns to localStorage
      localStorage.setItem('selectedColumns', JSON.stringify(updatedColumns));
      console.log(selectedColumns)
      return updatedColumns;
    });
  };

  // Function to activate GeoFilter drawing mode
  

  const toggleLayerVisibility = (layerName) => {
    console.log(`Toggling visibility for layer: ${layerName}`);
    setLayerStatus((prev) => ({
      ...prev,
      [layerName]: !prev[layerName],
    }));
  };

  const toggleLayerLabels = (layerName) => {
    console.log(`Toggling labels for layer: ${layerName}`);
    setLayerLabels((prev) => ({
      ...prev,
      [layerName]: !prev[layerName],
    }));
  };

  /** Turn off label toggle state without flipping (e.g. ownership layer hidden). */
  const clearLayerLabels = (layerName) => {
    setLayerLabels((prev) => {
      if (!prev[layerName]) return prev;
      return { ...prev, [layerName]: false };
    });
  };

  // =============== Print Element FUNCTIONS ===============
    
  useEffect(() => {
    if (printElements.length === 0) return;
  
    const pendingId = pendingSelectionRef.current;
    if (!pendingId) return;
  
    const match = printElements.find((el) => el.id === pendingId);
    if (match) {
      setSelectedPrintElement(match);
      console.log("✅ Auto-selected:", match);
      pendingSelectionRef.current = null; // ✅ clear it
    }
  }, [printElements]);
  
  useEffect(() => {
    if (selectedPrintElement) {
      console.log("🎯 selectedPrintElement now:", selectedPrintElement.id);
    }
  }, [selectedPrintElement]);
  
  const getMapCenterLngLat = () => {
    if (mapRef?.current && typeof mapRef.current.getCenter === 'function') {
      const center = mapRef.current.getCenter();
      return { lng: center.lng, lat: center.lat };
    }
    return { lng: -110.75, lat: 43.5 };
  };

  const addPrintElementFromTool = (tool, options = {}, lngLatOverride) => {
    const lngLat = lngLatOverride || getMapCenterLngLat();
    const created = createAnnotationFromTool(tool, lngLat, options);
    if (!created) return null;

    setPrintElements((prev) => [...prev, created]);
    setSelectedPrintElement(created);
    return created;
  };

  // Legacy convenience wrappers used by existing UI
  const addNote = () => addPrintElementFromTool('note');
  const addLegend = () => addPrintElementFromTool('legend');
  const addPin = () => addPrintElementFromTool('shape', { svgKey: 'pin' });
  const addShape = (svgKey) => addPrintElementFromTool('shape', { svgKey });
  const addArrowShape = () => addPrintElementFromTool('arrow');
  const addCompass = () => addPrintElementFromTool('compass');
  const addRectangle = () => addPrintElementFromTool('rectangle');
  const addTriangle = () => addPrintElementFromTool('triangle');
  const addDiamond = () => addPrintElementFromTool('diamond');



    const updatePrintElement = (updated) => {
      setPrintElements((prev) =>
        prev.map((el) => (el.id === updated.id ? updated : el))
      );
      if (selectedPrintElement?.id === updated.id) {
        setSelectedPrintElement(updated);
      }
    };
    

  // ❌ Delete element
  const deletePrintElement = (id) => {
    setPrintElements((prev) => prev.filter((el) => el.id !== id));
    if (selectedPrintElement?.id === id) setSelectedPrintElement(null);
  };

  // 🚮 Clear everything
  const clearPrintElements = () => {
    setPrintElements([]);
    setSelectedPrintElement(null);
  };

  const value = {
    activeTab,
    setActiveTab,
    layerStatus,
    setLayerStatus,
    mapRef,
    applyTourPropertyBasemapRef,
    selectedColumns,
    toggleColumn,
    setMapRef, // Provide setMapRef here
    toggleLayerVisibility,
    polygonData,
    selectedFeature, // Add selectedFeatures here
    setSelectedFeatures, // Add setSelectedFeatures here
    isMapTriggeredFromSearch,
    setIsMapTriggeredFromSearch,
    isFilterTriggered,
    setIsFilterTriggered,
    layerOrder,
    setLayerOrder,
    searchResults, 
    setSearchResults,
    focusFeatures,
    setFocusFeatures,
    isGeoFilterActive,
    setIsGeoFilterActive,
    isGeoFilterActiveRef,
    hoveredFeatureId,
    setHoveredFeatureId,
    drawRef, // Expose drawRef to allow access in Map.js
    suppressNextFeatureClickRef,
    isDrawing,
    setIsDrawing,
    isDrawingRef,
    paperSize,
    setPaperSize,
    setIsPrinting,
    isPrinting,
    propertyMapWizardActive,
    setPropertyMapWizardActive,
    propertyMapWizardIntent,
    setPropertyMapWizardIntent,
     // ✅ Add these missing ones:
    addNote,
    addLegend,    
    addArrowShape,
    addCompass,
    addPin,
    addRectangle,
    addTriangle,
    addDiamond,
    activePrintTool,
    setActivePrintTool,
    addPrintElementFromTool,

    printElements,
    setPrintElements,
    agentProfile,
    setAgentProfile,
    updatePrintElement,
    deletePrintElement,
    clearPrintElements,
    selectedPrintElement,
    setSelectedPrintElement,
    addShape,
    layerLabels,
    toggleLayerLabels,
    clearLayerLabels,
    currentBasemapId,
    setCurrentBasemapId,
    activeBasemapIdRef,
    pendingPrintBasemapRestoreRef,
    pendingCreateMapFromFeatureRef,
    pendingCreateMapBasemapIdRef,
    shareViewerReadOnly,
    setShareViewerReadOnly,
    mobileMapsSearchQuery,
    setMobileMapsSearchQuery,
    printLayoutMode,
    setPrintLayoutMode,
    printLayoutRect,
    setPrintLayoutRect,
  };

  return <MapContext.Provider value={value}>{children}</MapContext.Provider>;
};

// Custom hook for using the context
export const useMapContext = () => {
  return useContext(MapContext);
};
