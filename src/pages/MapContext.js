import React, { createContext, useState, useRef, useContext } from 'react';
import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import queryString from 'query-string';
// Create the context
const MapContext = createContext();

// Provider component
export const MapProvider = ({ children }) => {
  console.log("REMOUNT!!!!")
  const location = useLocation(); 
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
  const layerStatusRef = useRef({});
  const layerOrderRef = useRef([]);
  const [layerStatus, setLayerStatus] = useState({});
  const [layerOrder, setLayerOrder] = useState([]); 
  const [layerLabels, setLayerLabels] = useState({}); // Track which layers have labels enabled 

  //================ Print Vars ==================
  const [paperSize, setPaperSize] = useState('full'); // default to "full" screen
  const [isPrinting, setIsPrinting] = useState(false);
  
  const [printElements, setPrintElements] = useState([]);
  const [selectedPrintElement, setSelectedPrintElement] = useState(['cow']);
  console.log(layerStatus)

  const pendingSelectionRef = useRef(null);
  const [isMapTriggeredFromSearch, setIsMapTriggeredFromSearch] = useState(false);
  const [selectedColumns, setSelectedColumns] = useState(() => {
    // Load saved columns from localStorage on mount
  const savedColumns = localStorage.getItem('selectedColumns');
    return savedColumns ? JSON.parse(savedColumns) : [];
  });
  const mapRef = useRef(null);
  const drawRef = useRef(null); // Store MapboxDraw instance

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

  // ------------------- Initialize Layer State from URL -------------------
  useEffect(() => {
    console.log("Updating Layerss")
    // Parse ?layers=... from location.search
    const params = queryString.parse(location.search);
    if (params.layers) {
      const fromUrl = params.layers.split(',');
      // Build { ownership: true, zoning: true, etc. }
      const newLayerStatus = {};
      fromUrl.forEach((layer) => {
        newLayerStatus[layer] = true;
      });
      setLayerStatus(newLayerStatus);
      setLayerOrder(fromUrl);
    } else {
      // If no layers param, pick defaults
      setLayerStatus({ ownership: true });
      setLayerOrder(['ownership']);
    }
  // Empty array so it only runs **once** on mount
  }, []);

  
  
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
  
  // 🔵 Add a note
    const addNote = () => {
      const newNote = {
        id: Date.now(),
        type: 'note',
        x: 50,
        y: 50,
        width: 200,
        height: 100,
        text: 'New Note',
        style: {
          backgroundColor: '#000000',
          fontColor: '#000000',
          fontSize: 14,
        },
      };
      setPrintElements((prev) => [...prev, newNote]);
      setSelectedPrintElement(newNote);
    };

    const addLegend = () => {
      const newLegend = {
        id: Date.now(),
        type: 'legend',
        x: 50,
        y: 50,
        width: 300,
        height: 150,
      };
      setPrintElements((prev) => [...prev, newLegend]);
      setSelectedPrintElement(newLegend);
    };

    const addPin = () => {
      const newPin = {
        id: Date.now(),
        type: 'pin',
        x: 120,
        y: 120,
        width: 40,
        height: 60,
        fill: '#ff0000',
        stroke: '#000000',
        strokeWidth: 2,
        fillOpacity: 1,
        strokeOpacity: 1,
        rotation: 0
      };
      setPrintElements((prev) => [...prev, newPin]);
      setSelectedPrintElement(newPin);
    };
    const addShape = (svgKey) => {
      const newShape = {
        id: Date.now(),
        type: 'shape',
        svgKey,
        x: 100,
        y: 100,
        width: 60,
        height: 60,
        fill: '#ffffff',
        stroke: '#000000',
        strokeWidth: 1,
        fillOpacity: 1,
        strokeOpacity: 1,
        rotation: 0
      };
      setPrintElements(prev => [...prev, newShape]);
      setSelectedPrintElement(newShape);
    };
    
    
    const addArrowShape = () => {
      const newArrow = {
        id: Date.now(),
        type: 'arrow',
        x: 100,
        y: 100,
        width: 100,
        height: 40,
        rotation: 0,
      };
      setPrintElements((prev) => [...prev, newArrow]);
      setSelectedPrintElement(newArrow);
    };

    const addCompass = () => {
      const newCompass = {
        id: Date.now(),
        type: 'compass',
        x: 40,
        y: 40,
      };
      setPrintElements((prev) => [...prev, newCompass]);
      setSelectedPrintElement(newCompass);
    };



    const addRectangle = () => {
      const newRect = {
        id: Date.now(),
        type: 'rectangle',
        x: 150,
        y: 150,
        width: 120,
        height: 80,
      };
      setPrintElements((prev) => [...prev, newRect]);
      setSelectedPrintElement(newRect);
    };

    const addTriangle = () => {
      const newTriangle = {
        id: Date.now(),
        type: 'triangle',
        x: 100,
        y: 100,
        width: 100,
        height: 100,
      };
      setPrintElements((prev) => [...prev, newTriangle]);
      setSelectedPrintElement(newTriangle);
    };

    const addDiamond = () => {
      const newDiamond = {
        id: Date.now(),
        type: 'diamond',
        x: 100,
        y: 100,
        width: 100,
        height: 100,
      };
      setPrintElements((prev) => [...prev, newDiamond]);
      setSelectedPrintElement(newDiamond);
    };



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
    hoveredFeatureId,
    setHoveredFeatureId,
    drawRef, // Expose drawRef to allow access in Mapy.js
    isDrawing,
    setIsDrawing,
    isDrawingRef,
    paperSize,
    setPaperSize,
    setIsPrinting,
    isPrinting,
     // ✅ Add these missing ones:
    addNote,
    addLegend,    
    addArrowShape,
    addCompass,
    addPin,
    addRectangle,
    addTriangle,
    addDiamond,

    printElements,
    setSelectedPrintElement,
    updatePrintElement,
    deletePrintElement,
    clearPrintElements,
    selectedPrintElement,
    setSelectedPrintElement,
    addShape,
    layerLabels,
    toggleLayerLabels
    
  };

  return <MapContext.Provider value={value}>{children}</MapContext.Provider>;
};

// Custom hook for using the context
export const useMapContext = () => {
  return useContext(MapContext);
};
