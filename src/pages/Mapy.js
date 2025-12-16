import React, { useEffect, useState, useRef } from 'react';
import mapboxgl from 'mapbox-gl';
import * as turf from '@turf/turf';
import area from '@turf/area';
import 'mapbox-gl/dist/mapbox-gl.css';
import './Map.css';
import { useNavigate, useLocation } from 'react-router-dom'; // ✅ Import useLocation
import SidePanel from '../components/SidePanel';
import Spinner from '../components/spinner'; // Import spinner
import ToolPanel from '../components/ToolPanel'; // Import ToolPanel
import { featureCollection } from '@turf/turf';
import { countyZoningColors, getLayerStyle, getLabelLayerStyle } from '../components/mapStyles';
import { useMapContext } from './MapContext'; // Adjust path as needed
import { useUser } from "../contexts/UserContext";
import useMapboxDraw from "../hooks/useMapboxDraw";
import queryString from 'query-string';
import DraggableLegend from '../components/printShapes/DraggableLegend';
import DraggableNote from '../components/printShapes/DraggableNote';
import ArrowShape from '../components/printShapes/ArrowShape';
import CompassElement from '../components/printShapes/CompassElement';
import PinElement from '../components/printShapes/PinElement';
import RectangleElement from '../components/printShapes/RectangleElement';
import DiamondElement from '../components/printShapes/Diamond';
import TriangleElement from '../components/printShapes/Triangle';
import ShapeElement from '../components/printShapes/ShapeElement'
import { legends } from '../assets/legends';
import { layerNameMappings } from '../components/layerMappings';
import { useCallback } from "react";
import PropertyDetailsPopup from '../components/PropertyDetailsPopup'; // Add this import
import MobileSearch from '../components/MobileSearch';
import { isNativeApp } from '../utils/platformDetection';
import { Geolocation } from '@capacitor/geolocation';
// Mapbox Access Token
mapboxgl.accessToken = 'pk.eyJ1Ijoibm9haC1nYW5zIiwiYSI6ImNsb255ajJteDB5Z2gya3BpdXU5M29oY3YifQ.VbPKEHZ91PNoSAH-raskhw';

// Helper function to get Martin server URL based on environment
// On device/simulator connecting via network, use Mac's IP address; on desktop browser, use localhost
const getMartinServerUrl = () => {
  // Always use HTTPS through nginx proxy (no port needed - HTTPS default is 443)
  return 'https://34.10.19.103.nip.io';
};

// URLs for vector tile layers (Martin tile server + GCS)
const tileLayerUrls = {
  ownership: `${getMartinServerUrl()}/combined_ownership/{z}/{x}/{y}`,
  zoning: 'https://storage.googleapis.com/first_bucket_store/test_tiles_v3/zoning/{z}/{x}/{y}.pbf',
  conservation_easements: 'https://storage.googleapis.com/first_bucket_store/test_tiles_v3/conservation_easements/{z}/{x}/{y}.pbf',
  control_points_controls: 'https://storage.googleapis.com/first_bucket_store/test_tiles_v3/control_points_controls/{z}/{x}/{y}.pbf',
  ownership_address: 'https://storage.googleapis.com/first_bucket_store/test_tiles_v3/ownership_address/{z}/{x}/{y}.pbf',
  plss_plss_intersected: 'https://storage.googleapis.com/first_bucket_store/test_tiles_v3/plss_plss_intersected/{z}/{x}/{y}.pbf',
  plss_plss_labels: 'https://storage.googleapis.com/first_bucket_store/test_tiles_v3/plss_plss_labels/{z}/{x}/{y}.pbf',
  plss_plss_sections: 'https://storage.googleapis.com/first_bucket_store/test_tiles/plss_plss_sections/{z}/{x}/{y}.pbf',
  plss_plss_townships: 'https://storage.googleapis.com/first_bucket_store/test_tiles_v3/plss_plss_townships/{z}/{x}/{y}.pbf',
  precincts_polling_centers: 'https://storage.googleapis.com/first_bucket_store/tiles_v2/precincts_polling_centers/{z}/{x}/{y}.pbf',
  roads_easements: 'https://storage.googleapis.com/first_bucket_store/test_tiles_v3/roads_easements/{z}/{x}/{y}.pbf',
  roads: 'https://storage.googleapis.com/first_bucket_store/test_tiles_v3/roads/{z}/{x}/{y}.pbf',
  zoning_toj_corp_limit: 'https://storage.googleapis.com/first_bucket_store/test_tiles_v3/zoning_toj_corp_limit/{z}/{x}/{y}.pbf',
  zoning_toj_zoning_overlay: 'https://storage.googleapis.com/first_bucket_store/test_tiles_v3/zoning_toj_zoning_overlay/{z}/{x}/{y}.pbf',
  zoning_toj_zoning: 'https://storage.googleapis.com/first_bucket_store/test_tiles_v3/zoning_toj_zoning/{z}/{x}/{y}.pbf',
  zoning_zoverlay: 'https://storage.googleapis.com/first_bucket_store/test_tiles_v3/zoning_zoverlay/{z}/{x}/{y}.pbf',
  public_land : 'https://storage.googleapis.com/first_bucket_store/tiles_v2/public_land/{z}/{x}/{y}.pbf',
  mooose_reprojected: 'https://storage.googleapis.com/first_bucket_store/tiles_v2/mooose_reprojected/{z}/{x}/{y}.pbf',
  reporjected_elk: 'https://storage.googleapis.com/first_bucket_store/tiles_v2/reporjected_elk/{z}/{x}/{y}.pbf',
  bigHorn_reporjected: 'https://storage.googleapis.com/first_bucket_store/tiles_v2/bigHorn_reporjected/{z}/{x}/{y}.pbf',
  mule_deer_reporjected: 'https://storage.googleapis.com/first_bucket_store/tiles_v2/mule_deer_reporjected/{z}/{x}/{y}.pbf',
  precincts: 'https://storage.googleapis.com/first_bucket_store/tiles_v2/precincts/precincts_tiles/{z}/{x}/{y}.pbf',
  FEMA_updated: 'https://storage.googleapis.com/first_bucket_store/tiles_v2/FEMA_updated/{z}/{x}/{y}.pbf',
};



const Map = () => {


  // =============== Constants and Component Def ===============

  const {
    selectedFeature,
    setSelectedFeatures,
    layerStatus,
    setLayerStatus,
    GlobalActiveTab,
    setGlobalActiveTab,
    mapRef,
    setMapRef,
    isGeoFilterActiveRef,
    isGeoFilterActive,
    setIsGeoFilterActive,
    isMapTriggeredFromSearch,
    setIsMapTriggeredFromSearch,
    focusFeatures,
    hoveredFeatureId,
    layerOrder,
    setLayerOrder,
    isDrawingRef,
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
    selectedPrintElement,
    
    
  } = useMapContext();
  const [isPanelOpen, setIsPanelOpen] = useState(true); // State for toggling the side panel
  const [activeSidePanelTab, setActiveSidePanelTab] = useState('layers'); // Manage active tab state
  // Add state for property details popup
  const [showPropertyDetailsPopup, setShowPropertyDetailsPopup] = useState(false);
  const [selectedPropertyFeature, setSelectedPropertyFeature] = useState(null);

  const navigate = useNavigate(); // Define navigate here
  const { subscriptionStatus, role, highlightSettings } = useUser(); // or subscriptionStatus & user
  
  // 🔍 DEBUG: Monitor highlightSettings changes
  useEffect(() => {
    console.log('🔍 highlightSettings changed in Mapy.js:', highlightSettings);
    console.log('🔍 highlightSettings.fillColor:', highlightSettings?.fillColor);
    console.log('🔍 highlightSettings.fillOpacity:', highlightSettings?.fillOpacity);
    console.log('🔍 highlightSettings.lineColor:', highlightSettings?.lineColor);
    
    // 🔍 Update the ref with current values
    highlightSettingsRef.current = highlightSettings;
  }, [highlightSettings]);
  
  const [topLayer, setTopLayer] = useState(null);
  const [isMapLoading, setIsMapLoading] = useState(true); // Map loading state
  const highlightLayerId = 'highlight-layer'; // ID for the highlight layer
  const [selectedFilterPolygon, setSelectedFilterPolygon] = useState(null);
  const baseMapRef = useRef("streets-v11"); // Default basemap
  
  // 🔍 Store current highlightSettings in a ref to access from callbacks
  const highlightSettingsRef = useRef(highlightSettings);
  const [basemap, setBasemap] = useState('streets-v11');
  const [initialHighlightIds, setInitialHighlightIds] = useState(null);
  const [mapIsReady, setMapIsReady] = useState(false);
  const routerLocation = useLocation();  // <--- rename
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

  
  /**
   *  =============== Map Initialization ===============
   *
   * Creates Mapbox map and and then after it's done loading sets loading bool
   * to false, setsMapRef in parent. Calls updateLayers which adds ownership becase
   * of it's hard coded True in parent layerStatus
   * @param {number} a - The first number.
   * @param {number} b - The second number.
   * @returns {number} The result of adding a and b.
   */
  useEffect(() => {
    console.log('Initializing Mapbox map...');
    const params = queryString.parse(routerLocation.search);
    console.log("Parsed URL Params:", params);
    if (params.basemap) {
      console.log("Setting basemap from URL:", params.basemap);
      setBasemap(params.basemap);
      baseMapRef.current = params.basemap; // Track the selected basemap


    }
    const enable3D = params.basemap?.includes('3d');
    const useTetonOrtho = params.basemap === 'teton-ortho-2024';
    const useHighDef = params.basemap === 'high-def-3inch' || params.basemap === 'high-def-3inch-3d' || 
                       params.basemap === 'high-def-3inch-topo' || params.basemap === 'high-def-3inch-topo-3d';
    const useHighDef3D = params.basemap === 'high-def-3inch-3d' || params.basemap === 'high-def-3inch-topo-3d';
    const useHighDefTopo = params.basemap === 'high-def-3inch-topo' || params.basemap === 'high-def-3inch-topo-3d';
    console.log('📋 URL params parsed:', { basemap: params.basemap, useHighDef, useHighDef3D, useHighDefTopo });
    const useTestBasemap = params.basemap === 'test';
    const initialStyle = useTetonOrtho || useHighDef
      ? 'satellite-streets-v12'
      : useTestBasemap
      ? 'light-v10'
      : params.basemap === 'blank'
      ? 'basic-v9'
      : (params.basemap || 'streets-v11').replace('-3d', '');
    // Initialize the Mapbox map
    mapRef.current = new mapboxgl.Map({
      container: 'map',
      style: `mapbox://styles/mapbox/${initialStyle}`,
      center: params.lat && params.lng ? [parseFloat(params.lng), parseFloat(params.lat)] : [-110.76, 43.48],
      zoom: params.zoom ? parseFloat(params.zoom) : 10,
      minZoom: 6,
      maxZoom: 19,
      preserveDrawingBuffer: true,
      // Set up transformRequest globally to handle TMS coordinate conversion for high-def tiles
      transformRequest: (url, resourceType) => {
        try {
          // Convert URL to string if it's an object
          const urlStr = typeof url === 'string' ? url : (url?.url || url?.toString() || String(url));
          
          // Only transform Tile requests for our high-def tiles
          if (resourceType === 'Tile' && urlStr && urlStr.includes('teton_high_def_V2/tiles_all_3inch')) {
            // Extract z, x, y from URL pattern: .../{z}/{x}/{y}.png
            const urlMatch = urlStr.match(/tiles_all_3inch\/(\d+)\/(\d+)\/(\d+)\.png/);
            if (urlMatch) {
              const z = parseInt(urlMatch[1], 10);
              const x = parseInt(urlMatch[2], 10);
              const y_xyz = parseInt(urlMatch[3], 10); // This is XYZ Y from Mapbox
              
              // Convert XYZ Y to TMS Y (tiles stored in TMS format in GCS)
              const tmsY = Math.pow(2, z) - 1 - y_xyz;
              
              // Reconstruct URL with TMS Y coordinate
              const newUrl = urlStr.replace(
                `tiles_all_3inch/${z}/${x}/${y_xyz}.png`,
                `tiles_all_3inch/${z}/${x}/${tmsY}.png`
              );
              
              // Log all conversions, especially around the cutoff point
              if (z === 13 && y_xyz >= 2995) {
                console.log(`🔄 Tile conversion (zoom 13, near cutoff): z=${z}, x=${x}, XYZ Y=${y_xyz} -> TMS Y=${tmsY}`);
                console.log(`🔄 Original: ${urlStr}`);
                console.log(`🔄 Converted: ${newUrl}`);
              } else {
                console.log(`🔄 Tile conversion: z=${z}, x=${x}, XYZ Y=${y_xyz} -> TMS Y=${tmsY}`);
              }
              
              return { url: newUrl };
            } else {
              console.warn('⚠️ High-def tile URL did not match pattern:', urlStr);
            }
          }
          
          // For all other requests, return as-is
          return { url: urlStr };
          
        } catch (error) {
          console.error('❌ Error in transformRequest:', error);
          const urlStr = typeof url === 'string' ? url : (url?.url || url?.toString() || String(url));
          return { url: urlStr };
        }
      }
    });
  
    mapRef.current.on('load', () => {
      console.log('✅ Map loaded successfully.');
  
      if (!mapRef.current.hasImage('custom-pin')) {
        mapRef.current.loadImage('/pin_better.png', (error, image) => {
          if (error) {
            console.error("Error loading pin image:", error);
            return;
          }
          mapRef.current.addImage('custom-pin', image);
          console.log('✅ Custom pin added to map.');
        });
      }

        // ✅ ADD THIS BLOCK HERE for 3D terrain
      if (enable3D) {
        mapRef.current.addSource('mapbox-dem', {
          type: 'raster-dem',
          url: 'mapbox://mapbox.terrain-rgb',
          tileSize: 512,
          maxzoom: 14
        });

        mapRef.current.setTerrain({ source: 'mapbox-dem', exaggeration: 1.5 });

        mapRef.current.addLayer({
          id: 'sky',
          type: 'sky',
          paint: {
            'sky-type': 'atmosphere',
            'sky-atmosphere-sun': [0.0, 0.0],
            'sky-atmosphere-sun-intensity': 15
          }
        });
      }
  
      setIsMapLoading(false);
      setMapRef(mapRef.current);
  
      let newLayerStatus = {}; 
      let layerList = [];
      
      // Use once('idle') instead of on('load') to ensure style is fully loaded
      mapRef.current.once('idle', () => {
        console.log('✅ Map is idle, checking for basemap initialization...');
        // If URL requested the Teton Ortho basemap, add it now
        if (useTetonOrtho) {
          console.log('🗺️ Adding Teton Ortho basemap from URL...');
          try {
            addTetonOrthoRaster();
            baseMapRef.current = 'teton-ortho-2024';
            setBasemap('teton-ortho-2024');
          } catch (e) {
            console.error('Failed adding Teton Ortho raster from URL param:', e);
          }
        }
        // If URL requested the High Def basemap, add it now
        console.log('🔍 Checking high-def basemap:', { useHighDef, useHighDef3D, useHighDefTopo });
        if (useHighDef) {
          console.log('✅ High-def basemap requested, adding now...');
          try {
            // Enable 3D terrain if requested
            if (useHighDef3D) {
              console.log('🌄 Setting up 3D terrain...');
              if (!mapRef.current.getSource('mapbox-dem')) {
                mapRef.current.addSource('mapbox-dem', {
                  type: 'raster-dem',
                  url: 'mapbox://mapbox.terrain-rgb',
                  tileSize: 512,
                  maxzoom: 14,
                });
              }
              mapRef.current.setTerrain({ source: 'mapbox-dem', exaggeration: 1.5 });
              if (!mapRef.current.getLayer('sky')) {
                mapRef.current.addLayer({
                  id: 'sky',
                  type: 'sky',
                  paint: {
                    'sky-type': 'atmosphere',
                    'sky-atmosphere-sun': [0.0, 0.0],
                    'sky-atmosphere-sun-intensity': 15,
                  },
                });
              }
              mapRef.current.setPitch(60);
              mapRef.current.setBearing(-60);
            }
            // Add the high-def raster layer
            console.log('🖼️ Calling addHighDefRaster()...');
            addHighDefRaster();
            console.log('✅ addHighDefRaster() called');
            baseMapRef.current = useHighDef3D ? 'high-def-3inch-3d' : (useHighDefTopo ? (useHighDef3D ? 'high-def-3inch-topo-3d' : 'high-def-3inch-topo') : 'high-def-3inch');
            setBasemap(useHighDef3D ? 'high-def-3inch-3d' : (useHighDefTopo ? (useHighDef3D ? 'high-def-3inch-topo-3d' : 'high-def-3inch-topo') : 'high-def-3inch'));
            
            // If it's the topo variant, add contour lines after a short delay
            if (useHighDefTopo) {
              setTimeout(() => {
                if (!mapRef.current.getSource('contour-lines-source')) {
                  mapRef.current.addSource('contour-lines-source', {
                    type: 'vector',
                    url: 'mapbox://mapbox.mapbox-terrain-v2'
                  });
                }
                
                const styleLayers = mapRef.current.getStyle().layers || [];
                const beforeLayer = styleLayers.find(layer => 
                  layer.type === 'symbol' && layer.id.includes('label')
                );
                const beforeId = beforeLayer ? beforeLayer.id : undefined;
                
                try {
                  // Add major contour lines
                  if (!mapRef.current.getLayer('contour-lines-major')) {
                    mapRef.current.addLayer({
                      id: 'contour-lines-major',
                      type: 'line',
                      source: 'contour-lines-source',
                      'source-layer': 'contour',
                      filter: ['==', ['%', ['get', 'ele'], 100], 0],
                      paint: {
                        'line-color': '#FF4500',
                        'line-width': 1.5,
                        'line-opacity': 0.9
                      }
                    }, beforeId);
                  }
                  
                  // Add minor contour lines
                  if (!mapRef.current.getLayer('contour-lines-minor')) {
                    mapRef.current.addLayer({
                      id: 'contour-lines-minor',
                      type: 'line',
                      source: 'contour-lines-source',
                      'source-layer': 'contour',
                      filter: ['!=', ['%', ['get', 'ele'], 100], 0],
                      paint: {
                        'line-color': '#FF4500',
                        'line-width': 1.0,
                        'line-opacity': 0.6
                      }
                    }, beforeId);
                  }
                  
                  // Add elevation labels
                  if (!mapRef.current.getLayer('contour-labels-major')) {
                    mapRef.current.addLayer({
                      id: 'contour-labels-major',
                      type: 'symbol',
                      source: 'contour-lines-source',
                      'source-layer': 'contour',
                      filter: ['==', ['%', ['get', 'ele'], 100], 0],
                      layout: {
                        'symbol-placement': 'line',
                        'text-field': [
                          'concat',
                          ['to-string', ['round', ['*', ['get', 'ele'], 3.28084]]],
                          ' ft'
                        ],
                        'text-font': ['Open Sans Regular', 'Arial Unicode MS Regular'],
                        'text-size': 11,
                        'text-rotation-alignment': 'map',
                        'text-pitch-alignment': 'viewport'
                      },
                      paint: {
                        'text-color': '#333333',
                        'text-halo-color': '#ffffff',
                        'text-halo-width': 2,
                        'text-halo-blur': 1
                      }
                    }, beforeId);
                  }
                } catch (err) {
                  console.log('Note: Contour lines may not be available', err);
                }
              }, 500);
            }
          } catch (e) {
            console.error('Failed adding High Def raster from URL param:', e);
          }
        }
        // If URL requested the test basemap, add it now
        if (useTestBasemap) {
          try {
            addTestRaster();
            baseMapRef.current = 'test';
            setBasemap('test');
          } catch (e) {
            console.error('Failed adding test raster from URL param:', e);
          }
        }
      });
      window.mapRef = mapRef;
      window.updateExistingHighlights = updateExistingHighlights;
      // ✅ Step 2: Ensure Layers Are Loaded Before Querying Features
      const params = queryString.parse(routerLocation.search);
      if (params.highlights) {
        console.log("Set inital Higlights")
        setInitialHighlightIds(params.highlights.split(","));
      }
    });
  
    return () => {
      if (mapRef.current) {
        console.log('Cleaning up map and draw control...');
        mapRef.current.remove();
      }
    };
  }, []);

let containerStyle = {};
let computedWidth = '';
let computedHeight = '';

if (paperSize === 'portrait') {
  computedWidth = 'calc(8.1in - 10px)';   // subtract border width (2×5px)
  computedHeight = 'calc(10.6in - 10px)';
  containerStyle = {
    boxSizing: 'border-box', // include border in total dimensions
    width: computedWidth,
    height: computedHeight,
    position: 'absolute',
    top: 0,
    left: 0,
    transformOrigin: 'top left',
    overflow: '',
  };
} else if (paperSize === 'landscape') {
  computedWidth = 'calc(10.6in - 10px)';   // for landscape, swap dimensions
  computedHeight = 'calc(8.1in - 10px)';
  containerStyle = {
    boxSizing: 'border-box',
    width: computedWidth,
    height: computedHeight,
    position: 'absolute',
    top: 0,
    left: 0,
    transformOrigin: 'top left',
    overflow: '',
  };
} else {
  console.log("Coming here to the else")
  console.log(paperSize)

  containerStyle = { width: '100vw', height: '100vh', position: 'absolute' };
}

useEffect(() => {
  console.log("notes updated", notes);
}, [notes]);

useEffect(() => {
  console.log("isPrinting updated", isPrinting);
}, [isPrinting]);

  
  /**
   * Helper function to get the appropriate identifier for a feature
   * by determining which layer it belongs to and extracting the correct identifier
   */
  const getFeatureIdentifierFromFeature = useCallback((feature) => {
    if (!feature || !feature.properties) {
      return null;
    }

    const props = feature.properties;
    
    // Determine which layer this feature belongs to by checking GFI first (ownership)
    if (props.GFI) {
      return props.GFI;
    }
    
    // For ownership features with pidn
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

  useEffect(() => {  
    const updateUrl = () => {
      console.log("Updating URL");
      if (!mapRef.current) return; // Prevent errors if mapRef is not set
  
      const center = mapRef.current.getCenter();
      const zoom = mapRef.current.getZoom();
      
      // Get identifiers for all selected features
      const highlights = selectedFeature
        .map((feature) => getFeatureIdentifierFromFeature(feature))
        .filter(Boolean) // Removes null/undefined values
        .join(',');
        
      const newParams = queryString.stringify({
        lat: center.lat.toFixed(5),
        lng: center.lng.toFixed(5),
        zoom: zoom,
        highlights,
        layers: layerOrder.join(','), // ✅ Track layer order
        basemap: baseMapRef.current
      });
  
      navigate(`?${newParams}`, { replace: true });
    };
  
    // Attach updateUrl to map movement
    mapRef.current.on('moveend', updateUrl);
  
    // ✅ Also call `updateUrl` immediately when `selectedFeature` or `layerOrder` changes
    updateUrl();
  
    return () => {
      mapRef.current.off('moveend', updateUrl);
    };
  }, [ layerOrder, basemap, selectedFeature, navigate, getFeatureIdentifierFromFeature]);
  


useEffect(() => {
  if (!mapRef.current) return;
  
  // If the style is *already* loaded
  if (mapRef.current.isStyleLoaded()) {
    setMapIsReady(true);
    return;
  }

  // Otherwise, wait for style.load or idle
  const handleStyle = () => {
    setMapIsReady(true);
  };

  mapRef.current.once('styledata', handleStyle);
  mapRef.current.once('idle', handleStyle);

  return () => {
    mapRef.current.off('styledata', handleStyle);
    mapRef.current.off('idle', handleStyle);
  };
}, []);

  // (B) Once map + layers are ready, do the highlight
  useEffect(() => {
    if (!mapIsReady) return; // Wait for map
    if (!initialHighlightIds || initialHighlightIds.length === 0) return; // No highlights to restore
    if (!mapRef.current) return;
    
    console.log("🎯 Attempting to restore highlights:", initialHighlightIds);
    console.log("📊 Current layerStatus:", layerStatus);

    const existingLayers = Object.keys(layerStatus).filter(
      (layerName) => layerStatus[layerName] && mapRef.current.getLayer(`${layerName}-layer`)
    );
    
    if (!existingLayers.length) {
      console.warn("⚠️ No active layers yet, waiting...");
      return;
    }

    let hasRestored = false; // Prevent multiple restores
    
    const restoreHighlights = () => {
      if (hasRestored) return; // Already restored
      console.log("🗺️ Restoring highlights...");
      console.log("🔍 Active layers:", existingLayers);
      console.log("🔍 Highlight IDs to find:", initialHighlightIds);
      console.log("🔍 Map center:", mapRef.current.getCenter());
      console.log("🔍 Map zoom:", mapRef.current.getZoom());
      
      let allQueriedFeatures = [];
      existingLayers.forEach((layerName) => {
        try {
          const renderedFeatures = mapRef.current.queryRenderedFeatures({
            layers: [`${layerName}-layer`],
          });
          
          console.log(`📍 Found ${renderedFeatures.length} rendered features in ${layerName}-layer`);
          
          // Debug: show some GFIs from rendered features
          if (renderedFeatures.length > 0 && layerName === 'ownership') {
            const sampleGFIs = renderedFeatures.slice(0, 3).map(f => getFeatureIdentifierFromFeature(f));
            console.log("📋 Sample GFIs in viewport:", sampleGFIs);
          }
          
          const matchedFeatures = renderedFeatures.filter((feature) => {
            const featureId = getFeatureIdentifierFromFeature(feature);
            return featureId && initialHighlightIds.includes(featureId);
          });
          
          if (matchedFeatures.length > 0) {
            console.log(`✅ Matched ${matchedFeatures.length} features in ${layerName}`);
          }
          
          allQueriedFeatures.push(...matchedFeatures);
        } catch (error) {
          console.warn(`⚠️ Error querying ${layerName}:`, error);
        }
      });

      if (allQueriedFeatures.length > 0) {
        console.log(`✅ Restored ${allQueriedFeatures.length} highlighted features`);
        hasRestored = true;
        setSelectedFeatures(allQueriedFeatures);
        
        // Use highlightSettings if available, otherwise it will use defaults in highlightFeature
        if (highlightSettings) {
          highlightFeature(allQueriedFeatures);
        } else {
          console.warn("⚠️ highlightSettings not ready, but restoring with defaults");
          // Still highlight with defaults
          highlightFeature(allQueriedFeatures, null, {
            fillColor: '#FF0000',
            fillOpacity: 0.5,
            fillOutlineColor: '#FF0000',
            lineColor: '#FF0000',
            lineWidth: 3
          });
        }
      } else {
        console.warn("⚠️ No features matched. Possible reasons:");
        console.warn("   - Map needs to load more tiles at this zoom level");
        console.warn("   - Features not in current viewport");
        console.warn("   - Ownership layer not loaded yet");
      }
    };

    // Wait for map to be idle (tiles loaded) before querying
    // The 'idle' event fires when the map has finished loading and rendering
    const handleIdle = () => {
      // Small delay to ensure tiles are actually rendered
      setTimeout(restoreHighlights, 200);
    };
    
    mapRef.current.once('idle', handleIdle);
    
    // Also try after a short delay if the map seems ready
    setTimeout(() => {
      if (mapRef.current && mapRef.current.loaded()) {
        restoreHighlights();
      }
    }, 500);
    
    return () => {
      // Cleanup
      if (mapRef.current) {
        mapRef.current.off('idle', handleIdle);
      }
    };
    
  }, [mapRef, mapIsReady, initialHighlightIds, layerStatus, getFeatureIdentifierFromFeature, highlightSettings]);

  useEffect(() => {
    if (!mapRef.current) return;
  
    const map = mapRef.current;
    const logZoom = () => {
      console.log("Current zoom level:", map.getZoom());
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
  const { drawPolygon, drawLine, selectParcelsWithPolygon, clearAllDrawings, deleteSelectedFeature} = useMapboxDraw({
    mapRef,
    onPolygonCreated: (polyFeature) => {
      console.log("Polygon created:", polyFeature);
      // Possibly do area calc or passPolygonToReportBuilder
      // e.g. passPolygonToReportBuilder(polyFeature);
    },

    onPolygonFinalized: (finalPolyFeature) => {
      console.log("🚀🚀🚀🚀🚀🚀🚀🚀 Finalized Polygon for Parcel Selection:", finalPolyFeature);
    
      // Store the polygon for future reference
      setSelectedFilterPolygon(finalPolyFeature);
    
      // Zoom to polygon
      zoomToPolygon(finalPolyFeature);
    
      // Select parcels inside the polygon
      mapRef.current.once("moveend", () => {
        console.log("📌 Move complete, now selecting parcels.");
        // Use ref to get current highlightSettings (always fresh)
        selectParcelsInsidePolygon(finalPolyFeature, highlightSettingsRef.current);
      });
    },
    
  }, [highlightSettings]);


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

  function zoomToPolygon(polygon) {
    const bounds = getBoundingBox(polygon);
    mapRef.current.fitBounds(bounds, {
      padding: 100, // Adjust padding for better visualization
      duration: 800, // Smooth animation
    });
  
    console.log("📍 Map zoomed to polygon bounds:", bounds);
  }

  function selectParcelsInsidePolygon(polygon, currentHighlightSettings) {
    console.log("🔍 Querying features within selection polygon...");
    console.log("🔍 selectParcelsInsidePolygon - currentHighlightSettings:", currentHighlightSettings);
    console.log("🔍 selectParcelsInsidePolygon - currentHighlightSettings.fillColor:", currentHighlightSettings?.fillColor);

    // Get all visible ownership features
    const queriedFeatures = mapRef.current.queryRenderedFeatures({
        layers: ["ownership-layer"], // Adjust to match your ownership layer ID
    });

    if (!queriedFeatures.length) {
        console.warn("❌ No features found in ownership layer.");
        return;
    }

    console.log(`🗺️ Queried ${queriedFeatures.length} features from ownership layer.`);

    // Convert the drawn polygon to a Turf.js Polygon
    const selectionPolygon = turf.polygon(polygon.coordinates);

    // Filter features that are **fully enclosed** by the selection polygon and have a valid global_parcel_uid
    const selectedFeatures = queriedFeatures.filter((feature) => {
        if (!feature.geometry) return false;
        if (!feature.properties.GFI) return false;
        let featureGeometry = turf.feature(feature.geometry);
        // 🛑 Handle MultiPolygons
        if (feature.geometry.type === "MultiPolygon") {
            return feature.geometry.coordinates.every((polyCoords) => {
                let individualPolygon = turf.polygon(polyCoords);
                return turf.booleanContains(selectionPolygon, individualPolygon);
            });
        }
        // ✅ For regular Polygons, apply normal check
        return turf.booleanContains(selectionPolygon, featureGeometry);
    });

    console.log(`✅ ${selectedFeatures.length} features fully enclosed inside the polygon.`);
    
    // Highlight & Store Selected Features
    setSelectedFeatures(selectedFeatures);
    
    // Use the passed highlightSettings to ensure we have current values
    if (currentHighlightSettings) {
      highlightFeature(selectedFeatures, { ownership: true }, currentHighlightSettings);
    } else {
      console.warn("⚠️ highlightSettings not available, skipping highlight");
    }
}





 
  /**=============== Adds layers to the map depending on layer status ===============
   * Dynamically adds or removes map layers based on `layerStatus`.
   * For each visible layer, we add a vector source and the corresponding map layer.
   * We also move it "on top" if toggled last.
   */
  const updateLayers = () => {
    console.log('Updating layers with current layerStatus:', layerStatus);


    // Update map layers based on layerStatus changes
    Object.keys(layerStatus).forEach((layerName) => {
      const isVisible = layerStatus[layerName];
      console.log(`Processing layer "${layerName}" - Visibility: ${isVisible}`);
      console.log(!mapRef.current.getSource(layerName))
      // Check if the source for the layer exists, if not add it
      if (!mapRef.current.getSource(layerName)) {
        console.log(`Adding source for layer "${layerName}"`);
        mapRef.current.addSource(layerName, {
          type: 'vector',
          tiles: [tileLayerUrls[layerName]],
          minzoom: 6,
          maxzoom: 14,
        });
      }

      // Add the layer if it is visible and not already added
      if (isVisible) {
        if (!mapRef.current.getLayer(`${layerName}-layer`)) {
          console.log(`Adding layer "${layerName}-layer" to the map`);

          // Get the default layer style
          let style = getLayerStyle(layerName, null, baseMapRef);
          if (style) {
            try {
              // ✅ Position layer correctly relative to high-def layer
              // If high-def layer exists, add data layers after it (so they appear above it)
              let beforeId = undefined;
              if (mapRef.current.getLayer(HIGH_DEF_LAYER_ID) || mapRef.current.getLayer(TETON_ORTHO_LAYER_ID)) {
                // Find Mapbox Draw layers to ensure we're below them
                const styleLayers = mapRef.current.getStyle().layers || [];
                const drawLayer = styleLayers.find(l => l.id.startsWith('gl-draw-'));
                if (drawLayer) {
                  beforeId = drawLayer.id;
                } else {
                  // Add after high-def layer (so data layers appear above high-def)
                  // We'll add it at the end, which will put it above high-def
                  beforeId = undefined; // undefined means add at end (top)
                }
              }
              mapRef.current.addLayer(style, beforeId);
              console.log(`Added layer "${layerName}-layer" with default styles.`);
              
              // ✅ If this is the ownership fill layer, ensure border is positioned after it
              if (layerName === "ownership") {
                // Use requestAnimationFrame to ensure the layer is fully added before positioning border
                requestAnimationFrame(() => {
                  if (mapRef.current.getLayer("ownership-layer") && mapRef.current.getLayer("ownership_outer_borders")) {
                    const styleLayers = mapRef.current.getStyle().layers || [];
                    const ownershipLayerIndex = styleLayers.findIndex(l => l.id === "ownership-layer");
                    if (ownershipLayerIndex !== -1) {
                      // Find the next layer after ownership-layer
                      let borderBeforeId = undefined;
                      for (let i = ownershipLayerIndex + 1; i < styleLayers.length; i++) {
                        const nextLayer = styleLayers[i];
                        if (!nextLayer.id.includes("ownership") && !nextLayer.id.includes("border")) {
                          if (nextLayer.id.startsWith('gl-draw-')) {
                            borderBeforeId = nextLayer.id;
                            break;
                          }
                          borderBeforeId = nextLayer.id;
                          break;
                        }
                      }
                      try {
                        mapRef.current.moveLayer("ownership_outer_borders", borderBeforeId);
                        console.log("✅ Repositioned ownership_outer_borders after ownership fill layer (post-add)");
                      } catch (error) {
                        console.warn("Could not reposition ownership_outer_borders after ownership fill:", error);
                      }
                    }
                  }
                });
              }
            } catch (error) {
              console.error(`Error adding layer: ${error}`);
            }
          } else {
            console.warn(`No style found for layer: ${layerName}`);
          }

          // Add a listener to wait until the source is loaded to update styles dynamically if it's a zoning layer
          mapRef.current.on('sourcedata', (e) => {
            if (e.sourceId === layerName && e.isSourceLoaded) {
              console.log(`Source loaded for layer "${layerName}"`);
              if (layerName === "ownership") {
                console.log(`⏭️ Skipping sourcedata logic for "${layerName}"`);
                return;
              }
              // Check if the layer exists before updating the style
              if (!mapRef.current.getLayer(`${layerName}-layer`)) {
                console.warn(`Layer "${layerName}-layer" does not exist when attempting to apply styles.`);
                return;
              }

              // Query features to use for dynamic styles
              const features = mapRef.current.querySourceFeatures(layerName, { sourceLayer: layerName });
              if (features.length === 0) {
                console.warn(`No features found in the ${layerName} layer's source.`);
              } else {
                console.log(`${layerName} features found:`, features.map((f) => f.properties));

                // Get the updated style based on features
                style = getLayerStyle(layerName, features, baseMapRef);
                if (style) {
                  const paint = style.paint;
                  if (paint) {
                    try {
                      if (mapRef.current.getLayer(`${layerName}-layer`)) {
                        // Set properties based on the layer type
                        if (style.type === 'fill') {
                          // Fill type layer
                          if (paint['fill-color']) {
                            mapRef.current.setPaintProperty(`${layerName}-layer`, 'fill-color', paint['fill-color']);
                          }
                          if (paint['fill-opacity']) {
                            mapRef.current.setPaintProperty(`${layerName}-layer`, 'fill-opacity', paint['fill-opacity']);
                          }
                          if (paint['fill-outline-color']) {
                            mapRef.current.setPaintProperty(`${layerName}-layer`, 'fill-outline-color', paint['fill-outline-color']);
                          }
                        } else if (style.type === 'line') {
                          // Line type layer
                          if (paint['line-color']) {
                            mapRef.current.setPaintProperty(`${layerName}-layer`, 'line-color', paint['line-color']);
                          }
                          if (paint['line-width']) {
                            mapRef.current.setPaintProperty(`${layerName}-layer`, 'line-width', paint['line-width']);
                          }
                        } else if (style.type === 'circle') {
                          // Circle type layer (e.g., points)
                          if (paint['circle-radius']) {
                            mapRef.current.setPaintProperty(`${layerName}-layer`, 'circle-radius', paint['circle-radius']);
                          }
                          if (paint['circle-color']) {
                            mapRef.current.setPaintProperty(`${layerName}-layer`, 'circle-color', paint['circle-color']);
                          }
                          if (paint['circle-stroke-width']) {
                            mapRef.current.setPaintProperty(`${layerName}-layer`, 'circle-stroke-width', paint['circle-stroke-width']);
                          }
                          if (paint['circle-stroke-color']) {
                            mapRef.current.setPaintProperty(`${layerName}-layer`, 'circle-stroke-color', paint['circle-stroke-color']);
                          }
                        }
                      }
                    } catch (error) {
                      console.error(`Error updating layer paint properties: ${error}`);
                    }
                  }
                }
              }
            }
          });
        } else {
          // If the layer is already added, just make sure it's visible
          console.log(`Setting visibility of "${layerName}-layer" to "visible"`);
          mapRef.current.setLayoutProperty(`${layerName}-layer`, 'visibility', 'visible');
          if (layerName === "ownership") {
            console.log("🔄 Ensuring correct ownership style after basemap change.");
            if (!mapRef.current.getLayer("ownership-layer")) {
              console.warn("⚠️ Ownership layer is missing when trying to style it.");
              return;
            }
            try {
              const updatedStyle = getLayerStyle("ownership", null, baseMapRef);
              
              // ✅ Ensure style exists before updating
              if (!updatedStyle) {
                console.error(`🚨 Ownership layer style is undefined! Skipping update.`);
                return;
              }
              
              const paint = updatedStyle.paint;
              if (paint) {
                if (mapRef.current.getLayer("ownership-layer")) {
                  if (paint["fill-color"]) {
                    mapRef.current.setPaintProperty("ownership-layer", "fill-color", paint["fill-color"]);
                  }
                  if (paint["fill-opacity"]) {
                    mapRef.current.setPaintProperty("ownership-layer", "fill-opacity", paint["fill-opacity"]);
                  }
                  if (paint["fill-outline-color"]) {
                    mapRef.current.setPaintProperty("ownership-layer", "fill-outline-color", paint["fill-outline-color"]);
                  }
                } else {
                  console.warn(`⚠️ Ownership layer not found when applying styles.`);
                }
              }
            } catch (error) {
              console.error(`🚨 Error updating ownership layer style:`, error);
            }
        }
        }
        // ✅ ADD BORDER WHEN OWNERSHIP IS TOGGLED ON
        // Update ownership borders when the basemap changes
        if (layerName === "ownership") {
          console.log("🔄 Updating ownership boundary styles...");
          
          // ✅ Ensure ownership fill layer exists before adding borders
          // If it doesn't exist yet, wait for it (this can happen on initial load)
          if (!mapRef.current.getLayer("ownership-layer")) {
            console.log("⏳ Ownership fill layer not found yet, waiting for it...");
            // Wait a bit for the ownership fill layer to be added (it should be added in the same updateLayers call)
            setTimeout(() => {
              if (mapRef.current.getLayer("ownership-layer")) {
                console.log("✅ Ownership fill layer found, proceeding with border setup...");
                // Re-run the border setup logic
                const outerBorderStyle = getLayerStyle("ownership_outer_borders", null, baseMapRef);
                const innerBorderStyle = getLayerStyle("ownership_inner_borders", null, baseMapRef);
                setupOwnershipBorders(outerBorderStyle, innerBorderStyle);
              } else {
                console.warn("⚠️ Ownership fill layer still not found after delay");
              }
            }, 100);
            return; // Exit early, will be handled in setTimeout
          }
          
          let outerBorderStyle = getLayerStyle("ownership_outer_borders", null, baseMapRef);
          let innerBorderStyle = getLayerStyle("ownership_inner_borders", null, baseMapRef);

          // Helper function to set up ownership borders
          const setupOwnershipBorders = (outerStyle, innerStyle) => {

          // ✅ Position border layer AFTER ownership fill layer (so it appears on top)
          // Find the correct position: after ownership-layer, but below drawings
          
            // Helper function to find where to position border (after ownership-layer)
            const getBorderBeforeId = () => {
            // Refresh style layers array to get current layer order
            const styleLayers = mapRef.current.getStyle().layers || [];
            const drawLayer = styleLayers.find(l => l.id.startsWith('gl-draw-'));
            
            // If ownership-layer exists, position border right after it
            if (mapRef.current.getLayer("ownership-layer")) {
              const ownershipLayerIndex = styleLayers.findIndex(l => l.id === "ownership-layer");
              if (ownershipLayerIndex !== -1) {
                // Find the next layer after ownership-layer that's not a border layer
                for (let i = ownershipLayerIndex + 1; i < styleLayers.length; i++) {
                  const nextLayer = styleLayers[i];
                  // Skip other ownership border layers
                  if (!nextLayer.id.includes("ownership") && !nextLayer.id.includes("border")) {
                    // If we found a draw layer, use it (so border is below drawings)
                    if (nextLayer.id.startsWith('gl-draw-')) {
                      return nextLayer.id;
                    }
                    // Otherwise, position before this layer (so border is right after ownership-layer)
                    return nextLayer.id;
                  }
                }
                // If no suitable layer found after ownership-layer, check for draw layers
                if (drawLayer) {
                  return drawLayer.id;
                }
                // Otherwise add at end (after ownership-layer)
                return undefined;
              }
            }
            // Ownership layer doesn't exist yet, position relative to high-def
            if (mapRef.current.getLayer(HIGH_DEF_LAYER_ID) || mapRef.current.getLayer(TETON_ORTHO_LAYER_ID)) {
              return drawLayer ? drawLayer.id : undefined;
            }
            return undefined;
          };
          
          const borderBeforeId = getBorderBeforeId();

          // ✅ Border layers - red border for debugging (3px thick)
          if (mapRef.current.getLayer("ownership_outer_borders")) {
            console.log("🎨 Updating outer ownership boundary...");
            Object.entries(outerStyle.paint || {}).forEach(([prop, val]) => {
              mapRef.current.setPaintProperty("ownership_outer_borders", prop, val);
            });
            Object.entries(outerStyle.layout || {}).forEach(([prop, val]) => {
              mapRef.current.setLayoutProperty("ownership_outer_borders", prop, val);
            });
            // ✅ Reposition border layer AFTER ownership fill layer to ensure it's on top
            try {
              const updatedBorderBeforeId = getBorderBeforeId();
              mapRef.current.moveLayer("ownership_outer_borders", updatedBorderBeforeId);
              console.log("✅ Moved ownership_outer_borders to position after ownership fill layer");
            } catch (error) {
              console.warn("Could not reposition ownership_outer_borders:", error);
            }
          } else {
            console.log("🆕 Adding outer ownership boundary for the first time.");
            mapRef.current.addLayer(outerStyle, borderBeforeId);
            console.log("✅ Added ownership_outer_borders after ownership fill layer");
            
            // ✅ Ensure border is positioned correctly after ownership fill layer (if it exists)
            // Use requestAnimationFrame to ensure layers are in the map before repositioning
            requestAnimationFrame(() => {
              if (mapRef.current.getLayer("ownership-layer") && mapRef.current.getLayer("ownership_outer_borders")) {
                const styleLayers = mapRef.current.getStyle().layers || [];
                const ownershipLayerIndex = styleLayers.findIndex(l => l.id === "ownership-layer");
                if (ownershipLayerIndex !== -1) {
                  // Find the next layer after ownership-layer
                  let updatedBorderBeforeId = undefined;
                  for (let i = ownershipLayerIndex + 1; i < styleLayers.length; i++) {
                    const nextLayer = styleLayers[i];
                    if (!nextLayer.id.includes("ownership") && !nextLayer.id.includes("border")) {
                      if (nextLayer.id.startsWith('gl-draw-')) {
                        updatedBorderBeforeId = nextLayer.id;
                        break;
                      }
                      updatedBorderBeforeId = nextLayer.id;
                      break;
                    }
                  }
                  try {
                    mapRef.current.moveLayer("ownership_outer_borders", updatedBorderBeforeId);
                    console.log("✅ Repositioned ownership_outer_borders after ownership fill layer (post-add-first-time)");
                  } catch (error) {
                    console.warn("Could not reposition ownership_outer_borders after ownership fill (first time):", error);
                  }
                }
              }
            });
          }

          // ✅ Inner border is already hidden, just ensure it stays hidden
          if (mapRef.current.getLayer("ownership_inner_borders")) {
            console.log("🎨 Ensuring inner ownership boundary is hidden...");
            mapRef.current.setLayoutProperty("ownership_inner_borders", "visibility", "none");
            mapRef.current.setPaintProperty("ownership_inner_borders", "line-width", 0);
            mapRef.current.setPaintProperty("ownership_inner_borders", "line-opacity", 0);
          } else {
            console.log("🆕 Adding inner ownership boundary (hidden)...");
            mapRef.current.addLayer(innerStyle, borderBeforeId);
            // Immediately hide it
            mapRef.current.setLayoutProperty("ownership_inner_borders", "visibility", "none");
            mapRef.current.setPaintProperty("ownership_inner_borders", "line-width", 0);
            mapRef.current.setPaintProperty("ownership_inner_borders", "line-opacity", 0);
          }
          };
          
          // Call the setup function
          setupOwnershipBorders(outerBorderStyle, innerBorderStyle);
        }

        

        // Don't move layer to top if high-def layer exists - keep proper ordering
        // Only update top layer state for tracking, but don't actually move layers
        if (!mapRef.current.getLayer(HIGH_DEF_LAYER_ID) && !mapRef.current.getLayer(TETON_ORTHO_LAYER_ID)) {
        setTopLayer(layerName);
        console.log('Top layer updated:', layerName);
        } else {
          // If high-def exists, ensure the layer stays in correct position (above high-def, below drawings)
          try {
            const styleLayers = mapRef.current.getStyle().layers || [];
            const drawLayer = styleLayers.find(l => l.id.startsWith('gl-draw-'));
            const layerId = `${layerName}-layer`;
            if (mapRef.current.getLayer(layerId) && drawLayer) {
              // Move layer to be below drawings but above high-def
              mapRef.current.moveLayer(layerId, drawLayer.id);
              console.log(`Moved ${layerId} to correct position (above high-def, below drawings)`);
            }
          } catch (error) {
            console.error('Error repositioning layer:', error);
          }
        }
      } else {
        // If the layer is supposed to be hidden, set its visibility to "none"
        if (mapRef.current.getLayer(`${layerName}-layer`)) {
          console.log(`Setting visibility of "${layerName}-layer" to "none"`);
          mapRef.current.setLayoutProperty(`${layerName}-layer`, 'visibility', 'none');

          // Check if the highlighted feature is in the deselected layer and remove the highlight if so
          if (selectedFeature && selectedFeature.length > 0) {
            // Subtract featuresToRemove from selectedFeatures
            const updatedSelectedFeatures = selectedFeature.filter(
              (feature) => feature.sourceLayer !== layerName
            );
            


            if (updatedSelectedFeatures.length > 0) {
              console.log(`Removing highlights for features in the hidden layer: "${layerName}"`);
              setSelectedFeatures(updatedSelectedFeatures); // Update selectedFeatures state
              highlightFeature(updatedSelectedFeatures); // Reapply highlights
            }
          }
        } else {
          console.log(`Layer "${layerName}-layer" is not present on the map, no action needed`);
        }
        // ✅ REMOVE BORDER WHEN OWNERSHIP IS TOGGLED OFF
        if (layerName === "ownership") {
          // ✅ Fix: Use underscores to match the layer IDs used when adding
          if (mapRef.current.getLayer("ownership_inner_borders")) {
              console.log("Removing ownership boundary layer.");
              mapRef.current.removeLayer("ownership_inner_borders");
          }
          if (mapRef.current.getLayer("ownership_outer_borders")) {
            console.log("Removing ownership boundary layer.");
            mapRef.current.removeLayer("ownership_outer_borders");
        }
       }
      }

    });

    // Reorder layers based on the `layerOrder`
    layerOrder.forEach((layerName) => {
      if (mapRef.current.getLayer(`${layerName}-layer`)) {
        mapRef.current.moveLayer(`${layerName}-layer`);
      }
    });
    console.log("Layer Order:")
    console.log(layerOrder)
    console.log(layerStatus)

    
    // Ensure labels are on top, and guard label style tweaks
    bringLabelsToTop();
    try {
      if (mapRef.current.getLayer("settlement-label")) {
        mapRef.current.setPaintProperty("settlement-label", "text-color", "#000000");
        mapRef.current.setPaintProperty("settlement-label", "text-halo-color", "#FFFFFF");
        mapRef.current.setPaintProperty("settlement-label", "text-halo-width", 15);
        mapRef.current.setPaintProperty("settlement-label", "text-halo-blur", 20);
      }
    } catch (_) {}




    const allLayers = mapRef.current.getStyle().layers; // array of { id: <string>, ... }
    console.log(
      "Final mapbox layer stack (bottom -> top):", 
      allLayers.map((layer) => layer.id)
    );
    
    
  };

  /**=============== Handles On Click ===============
   * 
   */
  useEffect(() => {
    console.log("CA")
    console.log(layerStatus)
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
      console.log("Feature Click Activated");
      console.log(layerStatus)
  
      if (isDragging) {
        console.log("🚫 Ignoring click - user was dragging");
        return;
      }
  
      if (isDrawingRef.current === true) {
        console.log("🎨 User is drawing, ignoring feature click.");
        return;
      }
      console.log(layerStatus)
      const existingLayers = Object.keys(layerStatus).filter(
        (layerName) => layerStatus[layerName] && mapRef.current.getLayer(`${layerName}-layer`)
      );
  
      if (existingLayers.length > 0) {
        const features = mapRef.current.queryRenderedFeatures(e.point, {
          layers: existingLayers.map((layerName) => `${layerName}-layer`),
        });
  
        console.log("Queried features at click:", features);
  
        if (features.length > 0) {
          mapRef.current.dragPan.disable(); // Temporarily disable dragPan
  
          const clickedFeature = features[0];
          // Print all attributes of the clicked parcel
          console.log('All attributes of clicked parcel:', clickedFeature);
          // Look for any of the possible identifier properties
          const clickedGFI = clickedFeature.properties.GFI;
          console.log("Clicked GFI:", clickedGFI);
          setSelectedFeatures((prevFeatures) => {
            const isAlreadySelected = prevFeatures.some(
              (f) => f.properties.GFI === clickedGFI
            );
            console.log("Is already selected:", isAlreadySelected)
            if (e.originalEvent.shiftKey) {
              console.log("Shift key is held down.");
              if (isAlreadySelected) {
                console.log("Feature is already selected. Removing it from selection.");
                console.log("Prev Features:", prevFeatures)
                console.log("Clicked Feature:", clickedFeature)
                const updatedSelection = prevFeatures.filter(
                  (f) => f.properties.GFI !== clickedGFI
                );
                highlightFeature(updatedSelection);
                return updatedSelection;
              } else {
                console.log("Adding feature to selection.");
                const updatedSelection = [...prevFeatures, clickedFeature];
                highlightFeature(updatedSelection);
                return updatedSelection;
              }
            } else {
              console.log("Shift key not held. Resetting selection.");
              if (isAlreadySelected && prevFeatures.length === 1) {
                console.log("Clicked feature is the only one selected. Clearing selection.");
                removeHighlight();
                return [];
              } else {
                console.log("Selecting only the clicked feature.");
                highlightFeature([clickedFeature]);
                return [clickedFeature];
              }
            }
          });
  
          setActiveSidePanelTab('info'); 
        } else {
          console.log("No features clicked. Clearing selection.");
          setSelectedFeatures([]);
          removeHighlight();
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
    console.log("========== ", selectedFeature)
    return () => {
      // ✅ Cleanup event listeners
      if (mapRef.current) {
        mapRef.current.off('touchstart', handleTouchStart);
        mapRef.current.off('touchmove', handleTouchMove);
        mapRef.current.off('click', handleClick);
        mapRef.current.off('touchend', handleClick);
      }
    };
  }, [layerStatus, highlightSettings]);
  

  /**=============== Side Panel Higlight ===============
   * useEffect: Monitors hover changes (hoveredFeatureId). If a feature is hovered,
   * we add a distinct highlight. If not hovered, we remove the highlight.
   */
  useEffect(() => {

    /**
     * Adds or removes a hover highlight for the specified feature ID in "ownership-layer".
     * 
     * @param {string|null} hoveredId - The ID of the hovered feature's pidn or null if no hover.
     */
    const highlightHoverFeature = (hoveredId) => {
      if (!mapRef.current || !mapRef.current.isStyleLoaded()) {
        console.warn("Map style is not loaded yet. Cannot highlight features.");
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
        console.log("No feature is hovered. Hover highlight cleared.");
        return; // Exit if no feature is hovered
      }
  
      // Query all rendered features in the relevant layer
      const queriedFeatures = mapRef.current.queryRenderedFeatures({
        layers: ['ownership-layer'], // Adjust layer name as needed
      });
  
      // Find the feature(s) that match the hovered ID
      const matchingFeatures = queriedFeatures.filter((f) => {
        const queriedPidn = f.properties?.pidn || parsePidnFromDescription(f.properties?.description);
        return queriedPidn === hoveredId;
      });
  
      if (matchingFeatures.length === 0) {
        console.warn('No matching features found for the hovered feature in the ownership layer.');
        return;
      }
      
      console.log('Matching feature for hovered ID:', matchingFeatures);
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
  
  /**
   * Utility function to add tile boundaries to the map.
   * 
   * @param {string} description - The HTML description from a vector tile property
   * @returns {string|null} The extracted PIDN value or null if not found
   */
  const addTileBoundaries = () => {
    console.log('Adding tile boundaries layer for debugging...');
    mapRef.current.showTileBoundaries = true;
  };

  /**
   * =============== Parse PIDN ===============
   * Utility function to parse the `pidn` out of an HTML-based `description` property.
   * 
   * @param {string} description - The HTML description from a vector tile property
   * @returns {string|null} The extracted PIDN value or null if not found
   */
  const parsePidnFromDescription = (description) => {
    if (!description) {
      return null;
    }
  
    const parser = new DOMParser();
    const doc = parser.parseFromString(description, 'text/html');
    const rows = doc.querySelectorAll('tr');
  
    for (const row of rows) {
      const th = row.querySelector('th')?.textContent?.trim().toLowerCase();
      const td = row.querySelector('td')?.textContent?.trim();
      if (th === 'pidn') {
        return td;
      }
    }
  
    return null; // Return null if pidn not found
  };
  
   /** =============== Add Layers After Basemap Change ===============
   * useEffect: If the map style reloads (due to changing base layers),
   * we re-run `updateLayers` to ensure our data layers are re-added/visible.
   */
  useEffect(() => {
    console.log("Updating Layers becase layerStatus was updated.")
    console.log("=========", layerStatus, "=========")
    if (!mapRef.current.isStyleLoaded()) {
      mapRef.current.on('style.load', () => {
        console.log('Map style loaded. Updating layers...');
        updateLayers();
      });
    } else {
      //console.log('Map style already loaded. Updating layers...');
      updateLayers();
    }
  }, [layerStatus]);

  /** =============== Handle Label Layer Changes ===============
   * useEffect: When layerLabels changes, add or remove label layers
   */
  useEffect(() => {
    if (!mapRef.current || !mapRef.current.isStyleLoaded()) {
      console.log('Map not ready for label layers');
      return;
    }

    console.log('🏷️ Updating label layers:', layerLabels);

    Object.keys(layerLabels).forEach((layerName) => {
      const shouldShowLabels = layerLabels[layerName];
      const labelLayerId = `${layerName}-label-layer`;

      console.log(`Processing ${layerName}: shouldShowLabels=${shouldShowLabels}`);

      if (shouldShowLabels) {
        // Make sure the source exists
        const sourceExists = mapRef.current.getSource(layerName);
        console.log(`Source "${layerName}" exists:`, !!sourceExists);
        
        if (!sourceExists) {
          console.warn(`⚠️ Source ${layerName} doesn't exist yet, skipping label layer`);
          return;
        }

        // Function to add the label layer
        const addLabelLayer = () => {
          if (mapRef.current.getLayer(labelLayerId)) {
            console.log(`Label layer ${labelLayerId} already exists`);
            return;
          }

          // Get the correct source-layer name
          let sourceLayer = layerName;
          if (layerName === 'ownership') {
            sourceLayer = 'combined_ownership';
          }

          // Debug: Check what features are available
          try {
            const features = mapRef.current.querySourceFeatures(layerName, {
              sourceLayer: sourceLayer
            });
            console.log(`Features in ${layerName} (${sourceLayer}):`, features.length);
            if (features.length > 0) {
              console.log('Sample feature properties:', features[0].properties);
              console.log('Available properties:', Object.keys(features[0].properties));
            }
          } catch (e) {
            console.log('Could not query features:', e.message);
          }

          try {
            const labelStyle = getLabelLayerStyle(layerName);
            console.log('Label style:', labelStyle);
            mapRef.current.addLayer(labelStyle);
            console.log(`✅ Successfully added label layer: ${labelLayerId}`);
          } catch (error) {
            console.error(`❌ Error adding label layer ${labelLayerId}:`, error);
          }
        };

        // Check if source is loaded, if not wait for it
        const source = mapRef.current.getSource(layerName);
        if (source && source.loaded && source.loaded()) {
          console.log(`Source ${layerName} is already loaded, adding label layer now`);
          addLabelLayer();
        } else {
          console.log(`Waiting for source ${layerName} to load...`);
          // Wait for source to load
          const sourceDataHandler = (e) => {
            if (e.sourceId === layerName && e.isSourceLoaded) {
              console.log(`✅ Source ${layerName} loaded, adding label layer`);
              addLabelLayer();
              mapRef.current.off('sourcedata', sourceDataHandler);
            }
          };
          mapRef.current.on('sourcedata', sourceDataHandler);
        }
      } else {
        // Hide or remove label layer
        if (mapRef.current.getLayer(labelLayerId)) {
          console.log(`🗑️ Removing label layer for: ${layerName}`);
          mapRef.current.removeLayer(labelLayerId);
        }
      }
    });
  }, [layerLabels]);

  /**=============== Basemap Change ===============
   * Switches the Mapbox style to one of (Streets, Light, Satellite).
   * Once the style is changed, we re-run `updateLayers` to preserve
   * our custom data layers and re-apply any highlights.
   * 
   * @param {string} styleId - The mapbox style ID (e.g., 'streets-v11')
   */
  const handleBasemapChange = (styleId, enable3D = false) => {
    if (!mapRef.current) return;
  
    baseMapRef.current = styleId;
    setBasemap(styleId);
  
    // Handle blank basemap - use basic style which is minimal
    const mapboxStyleId = styleId === 'blank' ? 'basic-v9' : styleId;
  
    // ✅ Always reload the style
    mapRef.current.setStyle(`mapbox://styles/mapbox/${mapboxStyleId}`);
  
    // ✅ Wait for full idle, not just style.load
    mapRef.current.once('idle', () => {
      console.log('✅ Map is idle and fully ready for new layers and terrain');
  
      // ✅ Re-add toggleable layers
      updateLayers();
      applyLabelLayers();
      console.log("3D")
      console.log(enable3D)
      if (enable3D) {
        try {
          if (!mapRef.current.getSource('mapbox-dem')) {
            mapRef.current.addSource('mapbox-dem', {
              type: 'raster-dem',
              url: 'mapbox://mapbox.terrain-rgb',
              tileSize: 512,
              maxzoom: 14,
            });
          }
  
          mapRef.current.setTerrain({ source: 'mapbox-dem', exaggeration: 1.5 });
  
          if (!mapRef.current.getLayer('sky')) {
            mapRef.current.addLayer({
              id: 'sky',
              type: 'sky',
              paint: {
                'sky-type': 'atmosphere',
                'sky-atmosphere-sun': [0.0, 0.0],
                'sky-atmosphere-sun-intensity': 15,
              },
            });
          }
  
          mapRef.current.setPitch(60);
          mapRef.current.setBearing(-60);
        } catch (err) {
          console.error("🔥 Error enabling 3D terrain:", err);
        }
      } else {
        // 🧼 Flatten view
        mapRef.current.setTerrain(null);
        mapRef.current.setPitch(0);
        mapRef.current.setBearing(0);
      }
  
      // ✅ Restore highlights
      if (selectedFeature?.length > 0) {
        highlightFeature(selectedFeature);
      }
    });
  };

  // =============== Custom Raster Basemap: Teton Ortho 2024 ===============
  const TETON_ORTHO_SOURCE_ID = 'teton-ortho-2024-source';
  const TETON_ORTHO_LAYER_ID = 'teton-ortho-2024-layer';
  
  // =============== Custom Raster Basemap: High Def 3 Inch ===============
  const HIGH_DEF_SOURCE_ID = 'high-def-3inch-source';
  const HIGH_DEF_LAYER_ID = 'high-def-3inch-layer';
  const TETON_ORTHO_TILES = [
    'https://gis.tetoncountywy.gov/server/rest/services/OrthosAndRasters/TetonAerial2024sixinch_z21/MapServer/tile/{z}/{y}/{x}?blankTile=false'
  ];

  const addTetonOrthoRaster = () => {
    if (!mapRef.current) return;
    // Add raster source if missing
    if (!mapRef.current.getSource(TETON_ORTHO_SOURCE_ID)) {
      mapRef.current.addSource(TETON_ORTHO_SOURCE_ID, {
        type: 'raster',
        tiles: TETON_ORTHO_TILES,
        tileSize: 512, // fewer requests vs 256
        minzoom: 6,
        maxzoom: 21,
        bounds: [-111.27, 43.44, -110.52, 43.98]
      });
    }
    // Insert raster layer below labels if possible
    const styleLayers = mapRef.current.getStyle().layers || [];
    const beforeLabel = styleLayers.find(l => l.type === 'symbol' && l.id.includes('label'));
    const beforeId = beforeLabel ? beforeLabel.id : undefined;
    if (!mapRef.current.getLayer(TETON_ORTHO_LAYER_ID)) {
      mapRef.current.addLayer({
        id: TETON_ORTHO_LAYER_ID,
        type: 'raster',
        source: TETON_ORTHO_SOURCE_ID,
        paint: {
          'raster-opacity': 1
        }
      }, beforeId);
    }
  };

  // Bring all symbol (label) layers to the very top of the stack
  const bringLabelsToTop = useCallback(() => {
    if (!mapRef.current) return;
    const styleLayers = mapRef.current.getStyle().layers || [];
    styleLayers.forEach((layer) => {
      if (layer.type === 'symbol') {
        try {
          mapRef.current.moveLayer(layer.id);
        } catch (_) {}
      }
    });
  }, [mapRef]);

  const applyLabelLayers = useCallback(() => {
    if (!mapRef.current) return;

    if (!mapRef.current.isStyleLoaded()) {
      mapRef.current.once('styledata', () => {
        applyLabelLayers();
      });
      return;
    }

    console.log('🏷️ Applying label layers:', layerLabels);

    Object.keys(layerLabels).forEach((layerName) => {
      const shouldShowLabels = layerLabels[layerName];
      const labelLayerId = `${layerName}-label-layer`;

      if (shouldShowLabels) {
        const sourceExists = mapRef.current.getSource(layerName);

        if (!sourceExists) {
          console.warn(`⚠️ Source ${layerName} doesn't exist yet, skipping label layer`);
          return;
        }

        const addLabelLayer = () => {
          if (mapRef.current.getLayer(labelLayerId)) {
            return;
          }

          try {
            const labelStyle = getLabelLayerStyle(layerName);
            mapRef.current.addLayer(labelStyle);
            console.log(`✅ Added label layer: ${labelLayerId}`);
          } catch (error) {
            console.error(`❌ Error adding label layer ${labelLayerId}:`, error);
          }
        };

        const source = mapRef.current.getSource(layerName);
        if (source && source.loaded && source.loaded()) {
          addLabelLayer();
        } else {
          mapRef.current.once('sourcedata', (e) => {
            if (e.sourceId === layerName && e.isSourceLoaded) {
              addLabelLayer();
            }
          });
        }
      } else if (mapRef.current.getLayer(labelLayerId)) {
        console.log(`🗑️ Removing label layer for: ${layerName}`);
        mapRef.current.removeLayer(labelLayerId);
      }
    });

    bringLabelsToTop();
  }, [layerLabels, mapRef, bringLabelsToTop]);

  useEffect(() => {
    applyLabelLayers();
  }, [applyLabelLayers]);

  const handleSetTetonOrthoBasemap = () => {
    if (!mapRef.current) return;
    baseMapRef.current = 'teton-ortho-2024';
    setBasemap('teton-ortho-2024');
    // Use satellite streets, then overlay raster
    mapRef.current.setStyle('mapbox://styles/mapbox/satellite-streets-v12');
    mapRef.current.once('idle', () => {
      try {
        addTetonOrthoRaster();
      } catch (e) {
        console.error('Failed to add Teton Ortho raster:', e);
      }
      // Re-add our data layers on top
      updateLayers();
      // Ensure labels float above everything
      bringLabelsToTop();
      if (selectedFeature?.length > 0) {
        highlightFeature(selectedFeature);
      }
    });
  };

  // =============== Custom Raster Basemap: High Def 3 Inch ===============
  const HIGH_DEF_TILES = [
    'https://storage.googleapis.com/teton-county-gis-bucket/teton_high_def_V2/tiles_all_3inch/{z}/{x}/{y}.png'
  ];

  const addHighDefRaster = () => {
    if (!mapRef.current) {
      console.error('❌ addHighDefRaster: mapRef.current is null!');
      return;
    }
    console.log('🖼️ Adding High Def 3 Inch raster layer...');
    console.log('🖼️ Map style loaded?', mapRef.current.isStyleLoaded());
    console.log('🖼️ Map loaded?', mapRef.current.loaded());
    
    // Remove existing layer and source if they exist (to ensure fresh config without bounds)
    if (mapRef.current.getLayer(HIGH_DEF_LAYER_ID)) {
      console.log('🗑️ Removing existing High Def layer...');
      mapRef.current.removeLayer(HIGH_DEF_LAYER_ID);
    }
    if (mapRef.current.getSource(HIGH_DEF_SOURCE_ID)) {
      console.log('🗑️ Removing existing High Def source...');
      mapRef.current.removeSource(HIGH_DEF_SOURCE_ID);
    }
    
    // Add raster source (always recreate to ensure latest config)
    console.log('📦 Creating High Def source with tiles:', HIGH_DEF_TILES);
    // Note: transformRequest is set globally at map initialization, so TMS conversion will happen automatically
    
    try {
      mapRef.current.addSource(HIGH_DEF_SOURCE_ID, {
        type: 'raster',
        tiles: HIGH_DEF_TILES,
        tileSize: 256,
        minzoom: 6,
        maxzoom: 19, // Match the Leaflet example maxZoom
        // Remove scheme: 'tms' since we're handling conversion manually via transformRequest
        // Removed bounds to allow all tiles to load (bounds were cutting off bottom tiles)
      });
      console.log('✅ High Def source added successfully');
    } catch (error) {
      console.error('❌ Error adding High Def source:', error);
      return;
    }
      
      // Listen for tile loading events
      mapRef.current.on('sourcedata', (e) => {
        if (e.sourceId === HIGH_DEF_SOURCE_ID) {
          if (e.isSourceLoaded) {
            console.log('✅ High Def source loaded successfully');
          } else if (e.tile) {
            if (e.tile.state === 'errored') {
              console.error('❌ High Def tile error:', e.tile.url);
            } else if (e.tile.state === 'loaded') {
              console.log('✅ High Def tile loaded:', e.tile.url);
            }
          }
        }
      });
    // Insert raster layer right after base map layers, but below all data layers and drawing layers
    // Layer order (bottom to top): Base map -> High-def raster -> Data layers -> Drawing layers
    const styleLayers = mapRef.current.getStyle().layers || [];
    console.log('📋 Style layers count:', styleLayers.length);
    
    // Find where to insert: right after base map, but before any data layers
    // We want high-def to be below data layers (like ownership) but above base map
    let beforeId = undefined;
    
    // First, try to find data layers (end with -layer) - we want high-def BELOW these
    const firstDataLayer = styleLayers.find(l => 
      l.id.endsWith('-layer') && 
      !l.id.startsWith('gl-draw-') &&
      l.id !== 'measurement-labels-layer' &&
      l.id !== HIGH_DEF_LAYER_ID
    );
    if (firstDataLayer) {
      beforeId = firstDataLayer.id;
      console.log('📍 Adding High Def layer before data layer (will be below data layers):', beforeId);
    } else {
      // Look for Mapbox Draw layers - we want high-def BELOW these too
      const drawLayer = styleLayers.find(l => l.id.startsWith('gl-draw-'));
      if (drawLayer) {
        beforeId = drawLayer.id;
        console.log('📍 Adding High Def layer before Mapbox Draw layer (will be below drawings):', beforeId);
      } else {
        // Look for measurement labels layer - we want high-def BELOW this
        const measurementLayer = styleLayers.find(l => l.id === 'measurement-labels-layer');
        if (measurementLayer) {
          beforeId = measurementLayer.id;
          console.log('📍 Adding High Def layer before measurement labels (will be below measurements):', beforeId);
        } else {
          // Look for symbol layers (labels) but skip Mapbox Draw and measurement labels
          const firstLabelLayer = styleLayers.find(l => 
            l.type === 'symbol' && 
            l.id.includes('label') && 
            !l.id.startsWith('gl-draw-') &&
            l.id !== 'measurement-labels-layer'
          );
          if (firstLabelLayer) {
            beforeId = firstLabelLayer.id;
            console.log('📍 Adding High Def layer before label layer:', beforeId);
          } else {
            // Add at the very bottom (right after base map layers)
            // No beforeId means it goes to the bottom of the stack
            console.log('📍 Adding High Def layer at the bottom (after base map)');
          }
        }
      }
    }
    
    if (!mapRef.current.getLayer(HIGH_DEF_LAYER_ID)) {
      try {
        mapRef.current.addLayer({
          id: HIGH_DEF_LAYER_ID,
          type: 'raster',
          source: HIGH_DEF_SOURCE_ID,
          paint: {
            'raster-opacity': 1
          }
        }, beforeId);
        console.log('✅ High Def layer added successfully');
      } catch (error) {
        console.error('❌ Error adding High Def layer:', error);
      }
    } else {
      console.log('ℹ️ High Def layer already exists, moving to correct position');
      // If layer exists, move it to the correct position (below drawings)
      try {
        if (beforeId) {
          mapRef.current.moveLayer(HIGH_DEF_LAYER_ID, beforeId);
        } else {
          // Move to bottom if no beforeId
          const allLayers = mapRef.current.getStyle().layers || [];
          if (allLayers.length > 0) {
            mapRef.current.moveLayer(HIGH_DEF_LAYER_ID, allLayers[0].id);
          }
        }
        console.log('✅ High Def layer moved to correct position (below drawings)');
      } catch (error) {
        console.error('❌ Error moving High Def layer:', error);
      }
    }
  };

  const handleSetHighDefBasemap = (enable3D = false) => {
    if (!mapRef.current) return;
    baseMapRef.current = enable3D ? 'high-def-3inch-3d' : 'high-def-3inch';
    setBasemap(enable3D ? 'high-def-3inch-3d' : 'high-def-3inch');
    // Use satellite streets, then overlay raster
    mapRef.current.setStyle('mapbox://styles/mapbox/satellite-streets-v12');
    mapRef.current.once('idle', () => {
      try {
        // Enable 3D terrain if requested
        if (enable3D) {
          try {
            if (!mapRef.current.getSource('mapbox-dem')) {
              mapRef.current.addSource('mapbox-dem', {
                type: 'raster-dem',
                url: 'mapbox://mapbox.terrain-rgb',
                tileSize: 512,
                maxzoom: 14,
              });
            }
            
            mapRef.current.setTerrain({ source: 'mapbox-dem', exaggeration: 1.5 });
            
            if (!mapRef.current.getLayer('sky')) {
              mapRef.current.addLayer({
                id: 'sky',
                type: 'sky',
                paint: {
                  'sky-type': 'atmosphere',
                  'sky-atmosphere-sun': [0.0, 0.0],
                  'sky-atmosphere-sun-intensity': 15,
                },
              });
            }
            
            // Set a nice 3D viewing angle
            mapRef.current.setPitch(60);
            mapRef.current.setBearing(-60);
            console.log('✅ 3D terrain enabled for High Def basemap');
          } catch (err) {
            console.error("🔥 Error enabling 3D terrain:", err);
          }
        } else {
          // Flatten view if 3D was previously enabled
          mapRef.current.setTerrain(null);
          mapRef.current.setPitch(0);
          mapRef.current.setBearing(0);
        }
        
        // Add the high-def raster layer (it will drape over the terrain in 3D mode)
        addHighDefRaster();
      } catch (e) {
        console.error('Failed to add High Def raster:', e);
      }
      // Re-add our data layers on top
      updateLayers();
      applyLabelLayers();
      // Ensure labels float above everything
      bringLabelsToTop();
      if (selectedFeature?.length > 0) {
        highlightFeature(selectedFeature);
      }
    });
  };
  
  // Expose handler to window for URL parameter initialization
  window.handleSetHighDefBasemap = handleSetHighDefBasemap;

  /**=============== High Def with Topo Lines ===============
   * Combines high-def imagery with contour lines (topo lines)
   * 
   * @param {boolean} enable3D - Whether to enable 3D terrain
   */
  const handleSetHighDefWithTopo = (enable3D = false) => {
    if (!mapRef.current) return;
    baseMapRef.current = enable3D ? 'high-def-3inch-topo-3d' : 'high-def-3inch-topo';
    setBasemap(enable3D ? 'high-def-3inch-topo-3d' : 'high-def-3inch-topo');
    
    // Use satellite streets as base style
    mapRef.current.setStyle('mapbox://styles/mapbox/satellite-streets-v12');
    
    mapRef.current.once('idle', () => {
      console.log('✅ Map is idle and ready for High Def + Topo');
      
      try {
        // Enable 3D terrain if requested
        if (enable3D) {
          if (!mapRef.current.getSource('mapbox-dem')) {
            mapRef.current.addSource('mapbox-dem', {
              type: 'raster-dem',
              url: 'mapbox://mapbox.terrain-rgb',
              tileSize: 512,
              maxzoom: 14,
            });
          }
          mapRef.current.setTerrain({ source: 'mapbox-dem', exaggeration: 1.5 });
          if (!mapRef.current.getLayer('sky')) {
            mapRef.current.addLayer({
              id: 'sky',
              type: 'sky',
              paint: {
                'sky-type': 'atmosphere',
                'sky-atmosphere-sun': [0.0, 0.0],
                'sky-atmosphere-sun-intensity': 15,
              },
            });
          }
          mapRef.current.setPitch(60);
          mapRef.current.setBearing(-60);
        } else {
          mapRef.current.setTerrain(null);
          mapRef.current.setPitch(0);
          mapRef.current.setBearing(0);
        }
        
        // Add high-def raster layer
        addHighDefRaster();
        
        // Remove existing contour layers if they exist
        if (mapRef.current.getLayer('terrain-colors')) {
          mapRef.current.removeLayer('terrain-colors');
        }
        if (mapRef.current.getLayer('contour-lines-major')) {
          mapRef.current.removeLayer('contour-lines-major');
        }
        if (mapRef.current.getLayer('contour-lines-minor')) {
          mapRef.current.removeLayer('contour-lines-minor');
        }
        if (mapRef.current.getLayer('contour-labels-major')) {
          mapRef.current.removeLayer('contour-labels-major');
        }
        if (mapRef.current.getLayer('contour-labels-minor')) {
          mapRef.current.removeLayer('contour-labels-minor');
        }
        
        // Find a good place to insert the layers (before labels, after high-def)
        const styleLayers = mapRef.current.getStyle().layers || [];
        const beforeLayer = styleLayers.find(layer => 
          layer.type === 'symbol' && layer.id.includes('label')
        );
        const beforeId = beforeLayer ? beforeLayer.id : undefined;
        
        // Add hillshade for terrain visualization (optional, can be removed if too dark)
        try {
          if (!mapRef.current.getLayer('terrain-colors')) {
            if (!mapRef.current.getSource('terrain-hillshade')) {
              mapRef.current.addSource('terrain-hillshade', {
                type: 'raster-dem',
                url: 'mapbox://mapbox.terrain-rgb',
                tileSize: 512,
                maxzoom: 14
              });
            }
            
            mapRef.current.addLayer({
              id: 'terrain-colors',
              type: 'hillshade',
              source: 'terrain-hillshade',
              paint: {
                'hillshade-exaggeration': 0.5, // Lower exaggeration so it doesn't darken the high-def imagery too much
                'hillshade-illumination-direction': 315,
                'hillshade-illumination-anchor': 'viewport'
              }
            }, beforeId);
          }
        } catch (error) {
          console.error('Error adding hillshade:', error);
        }
        
        // Add contour lines source
        if (!mapRef.current.getSource('contour-lines-source')) {
          mapRef.current.addSource('contour-lines-source', {
            type: 'vector',
            url: 'mapbox://mapbox.mapbox-terrain-v2'
          });
        }
        
        // Wait for contour source to load
        const addContourLayers = () => {
          if (!mapRef.current.getSource('contour-lines-source')) return;
          
          const beforeLayer = mapRef.current.getStyle().layers.find(layer => 
            layer.type === 'symbol' && layer.id.includes('label')
          );
          const beforeId = beforeLayer ? beforeLayer.id : undefined;
          
          try {
            // Add major contour lines
            mapRef.current.addLayer({
              id: 'contour-lines-major',
              type: 'line',
              source: 'contour-lines-source',
              'source-layer': 'contour',
              filter: ['==', ['%', ['get', 'ele'], 100], 0],
              paint: {
                'line-color': '#FF4500',
                'line-width': 1.5,
                'line-opacity': 0.9
              }
            }, beforeId);
            
            // Add minor contour lines
            mapRef.current.addLayer({
              id: 'contour-lines-minor',
              type: 'line',
              source: 'contour-lines-source',
              'source-layer': 'contour',
              filter: ['!=', ['%', ['get', 'ele'], 100], 0],
              paint: {
                'line-color': '#FF4500',
                'line-width': 1.0,
                'line-opacity': 0.6
              }
            }, beforeId);
            
            // Add elevation labels
            mapRef.current.addLayer({
              id: 'contour-labels-major',
              type: 'symbol',
              source: 'contour-lines-source',
              'source-layer': 'contour',
              filter: ['==', ['%', ['get', 'ele'], 100], 0],
              layout: {
                'symbol-placement': 'line',
                'text-field': [
                  'concat',
                  ['to-string', ['round', ['*', ['get', 'ele'], 3.28084]]],
                  ' ft'
                ],
                'text-font': ['Open Sans Regular', 'Arial Unicode MS Regular'],
                'text-size': 11,
                'text-rotation-alignment': 'map',
                'text-pitch-alignment': 'viewport'
              },
              paint: {
                'text-color': '#333333',
                'text-halo-color': '#ffffff',
                'text-halo-width': 2,
                'text-halo-blur': 1
              }
            }, beforeId);
          } catch (err) {
            console.log('Note: Contour lines may not be available', err);
          }
        };
        
        // Wait for contour source to load
        mapRef.current.once('sourcedata', (e) => {
          if (e.sourceId === 'contour-lines-source' && e.isSourceLoaded) {
            addContourLayers();
          }
        });
        
        // Try to add immediately if source is already loaded
        setTimeout(addContourLayers, 100);
        
      } catch (err) {
        console.error("🔥 Error adding High Def + Topo:", err);
      }
      
      // Re-add toggleable layers
      updateLayers();
      applyLabelLayers();
      // Ensure labels float above everything
      bringLabelsToTop();
      
      // Restore highlights
      if (selectedFeature?.length > 0) {
        highlightFeature(selectedFeature);
      }
    });
  };
  
  // Expose handler to window for URL parameter initialization
  window.handleSetHighDefWithTopo = handleSetHighDefWithTopo;

  // =============== Custom Raster Basemap: Test ===============
  const TEST_SOURCE_ID = 'test-source';
  const TEST_LAYER_ID = 'test-layer';
  const TEST_TILES = [
    'http://localhost:8004/{z}/{x}/{y}.png'
  ];

  const addTestRaster = () => {
    if (!mapRef.current) return;
    console.log('🖼️ Adding test raster layer...');
    
    // Add raster source if missing
    if (!mapRef.current.getSource(TEST_SOURCE_ID)) {
      console.log('📦 Creating test source with tiles:', TEST_TILES);
      mapRef.current.addSource(TEST_SOURCE_ID, {
        type: 'raster',
        tiles: TEST_TILES,
        tileSize: 256,
        minzoom: 0,
        maxzoom: 22,
        scheme: 'tms'  // Use TMS tile scheme (Y coordinate flipped)
      });
      
      // Listen for tile loading events
      mapRef.current.on('sourcedata', (e) => {
        if (e.sourceId === TEST_SOURCE_ID) {
          if (e.isSourceLoaded) {
            console.log('✅ Test source loaded successfully');
          } else if (e.tile) {
            if (e.tile.state === 'errored') {
              console.error('❌ Tile error:', e.tile.url);
            } else if (e.tile.state === 'loaded') {
              console.log('✅ Tile loaded:', e.tile.url);
            }
          }
        }
      });
    }
    
    // Add test raster layer at the very bottom
    if (!mapRef.current.getLayer(TEST_LAYER_ID)) {
      console.log('🎨 Adding test raster layer to map');
      mapRef.current.addLayer({
        id: TEST_LAYER_ID,
        type: 'raster',
        source: TEST_SOURCE_ID,
        paint: {
          'raster-opacity': 1
        }
      });
      console.log('✅ Test layer added:', TEST_LAYER_ID);
      
      // Move it to the bottom of the layer stack
      const styleLayers = mapRef.current.getStyle().layers || [];
      if (styleLayers.length > 1) {
        try {
          mapRef.current.moveLayer(TEST_LAYER_ID, styleLayers[0].id);
          console.log('📐 Moved test layer to bottom');
        } catch (e) {
          console.warn('⚠️ Could not move test layer:', e);
        }
      }
    } else {
      console.log('ℹ️ Test layer already exists');
    }
    
    // Hide all default style layers (background, fill, line, symbol, etc.) except our data layers
    const styleLayers = mapRef.current.getStyle().layers || [];
    styleLayers.forEach(layer => {
      // Keep: test layer, our data layers (those ending in -layer), and labels we might add
      if (layer.id === TEST_LAYER_ID || 
          layer.id.includes('-layer') || 
          layer.id.includes('-label')) {
        return; // Skip hiding these
      }
      // Hide everything else (background, roads, buildings, etc.)
      try {
        mapRef.current.setLayoutProperty(layer.id, 'visibility', 'none');
      } catch (e) {
        // Some layers might not support visibility or already removed
      }
    });
  };

  const handleSetTestBasemap = () => {
    if (!mapRef.current) return;
    console.log('🔄 Switching to test basemap...');
    baseMapRef.current = 'test';
    setBasemap('test');
    // Use light style as base (minimal layers), then hide everything and show only test raster
    mapRef.current.setStyle('mapbox://styles/mapbox/light-v10');
    mapRef.current.once('idle', () => {
      console.log('✅ Map style loaded, adding test raster...');
      try {
        addTestRaster();
        // Verify layer is visible
        setTimeout(() => {
          const layer = mapRef.current.getLayer(TEST_LAYER_ID);
          if (layer) {
            console.log('✅ Test layer exists on map');
            const visibility = mapRef.current.getLayoutProperty(TEST_LAYER_ID, 'visibility');
            console.log('👁️ Test layer visibility:', visibility);
            const opacity = mapRef.current.getPaintProperty(TEST_LAYER_ID, 'raster-opacity');
            console.log('🎨 Test layer opacity:', opacity);
          } else {
            console.error('❌ Test layer not found on map!');
          }
        }, 500);
      } catch (e) {
        console.error('❌ Failed to add test raster:', e);
      }
      // Re-add our data layers on top
      updateLayers();
      applyLabelLayers();
      // Ensure labels float above everything
      bringLabelsToTop();
      if (selectedFeature?.length > 0) {
        highlightFeature(selectedFeature);
      }
    });
  };

  // Basemap configuration with thumbnails - defined after all handler functions
  // Basemap configuration with thumbnails
  // Note: 3D and Topo Lines variants need manual screenshots since Mapbox Static API can't show them
  // To generate base thumbnails: Run scripts/generate-basemap-thumbnails.js
  // For 3D/Topo variants: Take screenshots and save to public/basemaps/
  const basemapConfig = [
    { id: 'streets-v11', label: 'Streets', image: '/basemaps/streets-v11.png', fallback: '/logo192.png', onClick: () => handleBasemapChange('streets-v11') },
    { id: 'light-v10', label: 'Light', image: '/basemaps/light-v10.png', fallback: '/logo192.png', onClick: () => handleBasemapChange('light-v10') },
    { id: 'outdoors-v12', label: 'Outdoor', image: '/basemaps/outdoors-v12.png', fallback: '/logo192.png', onClick: () => handleBasemapChange('outdoors-v12') },
    { id: 'streets-v11-3d', label: '3D Streets', image: '/basemaps/streets-v11-3d.png', fallback: '/basemaps/streets-v11.png', onClick: () => handleBasemapChange('streets-v11', true) },
    { id: 'streets-v11-terrain', label: 'Streets + Topo Lines', image: '/streets_topo.png', fallback: '/basemaps/streets-v11.png', onClick: () => handleBasemapChangeWithTerrain('streets-v11') },
    { id: 'streets-v11-terrain-3d', label: '3D Streets + Topo Lines', image: '/basemaps/streets-v11-terrain-3d.png', fallback: '/basemaps/streets-v11.png', onClick: () => handleBasemapChangeWithTerrain3D('streets-v11') },
    { id: 'light-v10-terrain', label: 'Light + Topo Lines', image: '/basemaps/light-v10-terrain.png', fallback: '/basemaps/light-v10.png', onClick: () => handleBasemapChangeWithTerrain('light-v10') },
    { id: 'high-def-3inch', label: 'High Def 3 Inch', image: '/high_def.png', fallback: '/logo192.png', onClick: () => handleSetHighDefBasemap(false) },
    { id: 'high-def-3inch-3d', label: 'High Def 3D', image: '/high_def_3d.png', fallback: '/high_def.png', onClick: () => handleSetHighDefBasemap(true) },
    { id: 'high-def-3inch-topo', label: 'High Def + Topo', image: '/high_def.png', fallback: '/logo192.png', onClick: () => handleSetHighDefWithTopo(false) },
    { id: 'high-def-3inch-topo-3d', label: 'High Def + Topo 3D', image: '/high_def_3d.png', fallback: '/high_def.png', onClick: () => handleSetHighDefWithTopo(true) },
    { id: 'blank', label: 'Low Detail', image: '/low_detail.png', fallback: '/logo192.png', onClick: () => handleBasemapChange('blank') },
  ];
  
  /**=============== Basemap Change with Contours (USGS-style) ===============
   * Switches the Mapbox style and adds contour lines for USGS-style topo maps
   * 
   * @param {string} styleId - The mapbox style ID (e.g., 'streets-v11')
   */
  const handleBasemapChangeWithTerrain = (styleId) => {
    if (!mapRef.current) return;
  
    const variantId = `${styleId}-terrain`;
    baseMapRef.current = variantId;
    setBasemap(variantId);
  
    // Always reload the style
    mapRef.current.setStyle(`mapbox://styles/mapbox/${styleId}`);
  
    // Wait for full idle, not just style.load
    mapRef.current.once('idle', () => {
      console.log('✅ Map is idle and ready for contour lines');
  
      try {
        // Remove existing layers if they exist
        if (mapRef.current.getLayer('terrain-colors')) {
          mapRef.current.removeLayer('terrain-colors');
        }
        if (mapRef.current.getLayer('contour-lines-major')) {
          mapRef.current.removeLayer('contour-lines-major');
        }
        if (mapRef.current.getLayer('contour-lines-minor')) {
          mapRef.current.removeLayer('contour-lines-minor');
        }
        if (mapRef.current.getLayer('contour-labels-major')) {
          mapRef.current.removeLayer('contour-labels-major');
        }
        if (mapRef.current.getLayer('contour-labels-minor')) {
          mapRef.current.removeLayer('contour-labels-minor');
        }
        
        // Find a good place to insert the layers (before labels)
        const beforeLayer = mapRef.current.getStyle().layers.find(layer => 
          layer.type === 'symbol' && layer.id.includes('label')
        );
        const beforeId = beforeLayer ? beforeLayer.id : undefined;
        
        // Add hillshade for terrain visualization
        try {
          if (!mapRef.current.getLayer('terrain-colors')) {
            // Add terrain-rgb as DEM source for hillshade
            if (!mapRef.current.getSource('terrain-hillshade')) {
              mapRef.current.addSource('terrain-hillshade', {
                type: 'raster-dem',
                url: 'mapbox://mapbox.terrain-rgb',
                tileSize: 512,
                maxzoom: 14
              });
            }
            
            // Add hillshade layer for terrain relief
            mapRef.current.addLayer({
              id: 'terrain-colors',
              type: 'hillshade',
              source: 'terrain-hillshade',
              paint: {
                'hillshade-exaggeration': 1.5,
                'hillshade-illumination-direction': 315,
                'hillshade-illumination-anchor': 'viewport'
              }
            }, beforeId);
            
            console.log('✅ Hillshade layer added - shows terrain relief with lighting');
          }
        } catch (error) {
          console.error('Error adding hillshade:', error);
        }
        
        // Add contour lines source from Mapbox terrain-v2
        if (!mapRef.current.getSource('contour-lines-source')) {
          mapRef.current.addSource('contour-lines-source', {
            type: 'vector',
            url: 'mapbox://mapbox.mapbox-terrain-v2'
          });
        }
        
        // Wait for contour source to load
        const addContourLayers = () => {
          if (!mapRef.current.getSource('contour-lines-source')) return;
          
          // Find a good place to insert the layers (before labels)
          const beforeLayer = mapRef.current.getStyle().layers.find(layer => 
            layer.type === 'symbol' && layer.id.includes('label')
          );
          const beforeId = beforeLayer ? beforeLayer.id : undefined;
          
          try {
            // Add major contour lines (every 100m) - thicker, orange-red
            mapRef.current.addLayer({
              id: 'contour-lines-major',
              type: 'line',
              source: 'contour-lines-source',
              'source-layer': 'contour',
              filter: ['==', ['%', ['get', 'ele'], 100], 0], // Multiple of 100
              paint: {
                'line-color': '#FF4500',  // Orange-red color
                'line-width': 1.5,
                'line-opacity': 0.9
              }
            }, beforeId);
            
            // Add minor contour lines (every 50m) - bolder now
            mapRef.current.addLayer({
              id: 'contour-lines-minor',
              type: 'line',
              source: 'contour-lines-source',
              'source-layer': 'contour',
              filter: ['!=', ['%', ['get', 'ele'], 100], 0], // Not a multiple of 100
              paint: {
                'line-color': '#FF4500',  // Orange-red color
                'line-width': 1.0,        // Increased from 0.7 to 1.0 for better visibility
                'line-opacity': 0.6       // Increased from 0.5 to 0.6 for better visibility
              }
            }, beforeId);
            
            // Add elevation labels for major contours (in feet)
            mapRef.current.addLayer({
              id: 'contour-labels-major',
              type: 'symbol',
              source: 'contour-lines-source',
              'source-layer': 'contour',
              filter: ['==', ['%', ['get', 'ele'], 100], 0], // Multiple of 100
              layout: {
                'symbol-placement': 'line',
                'text-field': [
                  'concat',
                  ['to-string', ['round', ['*', ['get', 'ele'], 3.28084]]],
                  ' ft'
                ],
                'text-font': ['Open Sans Regular', 'Arial Unicode MS Regular'],
                'text-size': 11,
                'text-rotation-alignment': 'map',
                'text-pitch-alignment': 'viewport'
              },
              paint: {
                'text-color': '#333333',
                'text-halo-color': '#ffffff',
                'text-halo-width': 2,
                'text-halo-blur': 1
              }
            }, beforeId);
            
            // Add elevation labels for minor contours (in feet, less frequent)
            mapRef.current.addLayer({
              id: 'contour-labels-minor',
              type: 'symbol',
              source: 'contour-lines-source',
              'source-layer': 'contour',
              filter: ['!=', ['%', ['get', 'ele'], 100], 0], // Not a multiple of 100
              layout: {
                'symbol-placement': 'line',
                'text-field': [
                  'concat',
                  ['to-string', ['round', ['*', ['get', 'ele'], 3.28084]]],
                  ' ft'
                ],
                'text-font': ['Open Sans Regular', 'Arial Unicode MS Regular'],
                'text-size': 9,
                'text-rotation-alignment': 'map',
                'text-pitch-alignment': 'viewport',
                'symbol-spacing': 400  // Less frequent labels for minor contours
              },
              paint: {
                'text-color': '#666666',
                'text-halo-color': '#ffffff',
                'text-halo-width': 1.5,
                'text-halo-blur': 1
              }
            }, beforeId);
            
            console.log('✅ Contour lines and labels added successfully');
          } catch (err) {
            console.log('Note: Contour lines may not be available in your region', err);
          }
        };
        
        // Wait for contour source to load
        mapRef.current.once('sourcedata', (e) => {
          if (e.sourceId === 'contour-lines-source' && e.isSourceLoaded) {
            addContourLayers();
          }
        });
        
        // Try to add immediately if source is already loaded
        setTimeout(addContourLayers, 100);
        
        console.log('✅ Colored elevation visualization added (yellow to red gradient)');
        
      } catch (err) {
        console.error("🔥 Error adding contour lines:", err);
      }
  
      // Re-add toggleable layers
      updateLayers();
  
      // Restore highlights
      if (selectedFeature?.length > 0) {
        highlightFeature(selectedFeature);
      }
    });
  };
  
  /**=============== Basemap Change with Terrain + 3D ===============
   * Switches the Mapbox style and adds contour lines with 3D terrain
   * 
   * @param {string} styleId - The mapbox style ID (e.g., 'streets-v11')
   */
  const handleBasemapChangeWithTerrain3D = (styleId) => {
    if (!mapRef.current) return;
  
    const variantId = `${styleId}-terrain-3d`;
    baseMapRef.current = variantId;
    setBasemap(variantId);
  
    // Always reload the style
    mapRef.current.setStyle(`mapbox://styles/mapbox/${styleId}`);
  
    // Wait for full idle, not just style.load
    mapRef.current.once('idle', () => {
      console.log('✅ Map is idle and ready for 3D terrain + contour lines');
  
      try {
        // Enable 3D terrain first
        if (!mapRef.current.getSource('mapbox-dem')) {
          mapRef.current.addSource('mapbox-dem', {
            type: 'raster-dem',
            url: 'mapbox://mapbox.terrain-rgb',
            tileSize: 512,
            maxzoom: 14,
          });
        }
  
        mapRef.current.setTerrain({ source: 'mapbox-dem', exaggeration: 1.5 });
  
        if (!mapRef.current.getLayer('sky')) {
          mapRef.current.addLayer({
            id: 'sky',
            type: 'sky',
            paint: {
              'sky-type': 'atmosphere',
              'sky-atmosphere-sun': [0.0, 0.0],
              'sky-atmosphere-sun-intensity': 15,
            },
          });
        }
  
        mapRef.current.setPitch(60);
        mapRef.current.setBearing(-60);

        // Remove existing layers if they exist
        if (mapRef.current.getLayer('terrain-colors')) {
          mapRef.current.removeLayer('terrain-colors');
        }
        if (mapRef.current.getLayer('contour-lines-major')) {
          mapRef.current.removeLayer('contour-lines-major');
        }
        if (mapRef.current.getLayer('contour-lines-minor')) {
          mapRef.current.removeLayer('contour-lines-minor');
        }
        if (mapRef.current.getLayer('contour-labels-major')) {
          mapRef.current.removeLayer('contour-labels-major');
        }
        if (mapRef.current.getLayer('contour-labels-minor')) {
          mapRef.current.removeLayer('contour-labels-minor');
        }
        
        // Find a good place to insert the layers (before labels)
        const beforeLayer = mapRef.current.getStyle().layers.find(layer => 
          layer.type === 'symbol' && layer.id.includes('label')
        );
        const beforeId = beforeLayer ? beforeLayer.id : undefined;
        
        // Add hillshade for terrain visualization
        try {
          if (!mapRef.current.getLayer('terrain-colors')) {
            // Add terrain-rgb as DEM source for hillshade (reuse existing source)
            if (!mapRef.current.getSource('terrain-hillshade')) {
              mapRef.current.addSource('terrain-hillshade', {
                type: 'raster-dem',
                url: 'mapbox://mapbox.terrain-rgb',
                tileSize: 512,
                maxzoom: 14
              });
            }
            
            // Add hillshade layer for terrain relief
            mapRef.current.addLayer({
              id: 'terrain-colors',
              type: 'hillshade',
              source: 'terrain-hillshade',
              paint: {
                'hillshade-exaggeration': 1.5,
                'hillshade-illumination-direction': 315,
                'hillshade-illumination-anchor': 'viewport'
              }
            }, beforeId);
            
            console.log('✅ Hillshade layer added - shows terrain relief with lighting');
          }
        } catch (error) {
          console.error('Error adding hillshade:', error);
        }
        
        // Add contour lines source from Mapbox terrain-v2
        if (!mapRef.current.getSource('contour-lines-source')) {
          mapRef.current.addSource('contour-lines-source', {
            type: 'vector',
            url: 'mapbox://mapbox.mapbox-terrain-v2'
          });
        }
        
        // Wait for contour source to load
        const addContourLayers = () => {
          if (!mapRef.current.getSource('contour-lines-source')) return;
          
          // Find a good place to insert the layers (before labels)
          const beforeLayer = mapRef.current.getStyle().layers.find(layer => 
            layer.type === 'symbol' && layer.id.includes('label')
          );
          const beforeId = beforeLayer ? beforeLayer.id : undefined;
          
          try {
            // Add major contour lines (every 100m) - thicker, orange-red
            mapRef.current.addLayer({
              id: 'contour-lines-major',
              type: 'line',
              source: 'contour-lines-source',
              'source-layer': 'contour',
              filter: ['==', ['%', ['get', 'ele'], 100], 0], // Multiple of 100
              paint: {
                'line-color': '#FF4500',  // Orange-red color
                'line-width': 1.5,
                'line-opacity': 0.9
              }
            }, beforeId);
            
            // Add minor contour lines (every 50m) - bolder now
            mapRef.current.addLayer({
              id: 'contour-lines-minor',
              type: 'line',
              source: 'contour-lines-source',
              'source-layer': 'contour',
              filter: ['!=', ['%', ['get', 'ele'], 100], 0], // Not a multiple of 100
              paint: {
                'line-color': '#FF4500',  // Orange-red color
                'line-width': 1.0,        // Increased from 0.7 to 1.0 for better visibility
                'line-opacity': 0.6       // Increased from 0.5 to 0.6 for better visibility
              }
            }, beforeId);
            
            // Add elevation labels for major contours (in feet)
            mapRef.current.addLayer({
              id: 'contour-labels-major',
              type: 'symbol',
              source: 'contour-lines-source',
              'source-layer': 'contour',
              filter: ['==', ['%', ['get', 'ele'], 100], 0], // Multiple of 100
              layout: {
                'symbol-placement': 'line',
                'text-field': [
                  'concat',
                  ['to-string', ['round', ['*', ['get', 'ele'], 3.28084]]],
                  ' ft'
                ],
                'text-font': ['Open Sans Regular', 'Arial Unicode MS Regular'],
                'text-size': 11,
                'text-rotation-alignment': 'map',
                'text-pitch-alignment': 'viewport'
              },
              paint: {
                'text-color': '#333333',
                'text-halo-color': '#ffffff',
                'text-halo-width': 2,
                'text-halo-blur': 1
              }
            }, beforeId);
            
            // Add elevation labels for minor contours (in feet, less frequent)
            mapRef.current.addLayer({
              id: 'contour-labels-minor',
              type: 'symbol',
              source: 'contour-lines-source',
              'source-layer': 'contour',
              filter: ['!=', ['%', ['get', 'ele'], 100], 0], // Not a multiple of 100
              layout: {
                'symbol-placement': 'line',
                'text-field': [
                  'concat',
                  ['to-string', ['round', ['*', ['get', 'ele'], 3.28084]]],
                  ' ft'
                ],
                'text-font': ['Open Sans Regular', 'Arial Unicode MS Regular'],
                'text-size': 9,
                'text-rotation-alignment': 'map',
                'text-pitch-alignment': 'viewport',
                'symbol-spacing': 400  // Less frequent labels for minor contours
              },
              paint: {
                'text-color': '#666666',
                'text-halo-color': '#ffffff',
                'text-halo-width': 1.5,
                'text-halo-blur': 1
              }
            }, beforeId);
            
            console.log('✅ Contour lines and elevation labels added successfully');
          } catch (err) {
            console.log('Note: Contour lines may not be available in your region', err);
          }
        };
        
        // Wait for contour source to load
        mapRef.current.once('sourcedata', (e) => {
          if (e.sourceId === 'contour-lines-source' && e.isSourceLoaded) {
            addContourLayers();
          }
        });
        
        // Try to add immediately if source is already loaded
        setTimeout(addContourLayers, 100);
        
        console.log('✅ 3D terrain + contour lines added');
        
      } catch (err) {
        console.error("🔥 Error adding 3D terrain + contour lines:", err);
      }
  
      // Re-add toggleable layers
      updateLayers();
  
      // Restore highlights
      if (selectedFeature?.length > 0) {
        highlightFeature(selectedFeature);
      }
    });
  };
  
  
  
  

    /** =============== Zooms and Higlights when map it from search ===============
   * useEffect: Watches for changes in `isMapTriggeredFromSearch` plus `focusFeatures`.
   * If triggered, we zoom and highlight the search results via `handleFeatureZoomAndHighlight`.
   */
    useEffect(() => {
      console.log("🔄 useEffect triggered!");
      console.log("isMapTriggeredFromSearch:", isMapTriggeredFromSearch);
      console.log("focusFeatures:", focusFeatures);
  
      if (isMapTriggeredFromSearch && focusFeatures.length > 0) {
          console.log('✅ Valid focusFeatures detected. Zooming to and highlighting features...');
          handleFeatureZoomAndHighlight(focusFeatures);
          
          setIsMapTriggeredFromSearch(false); // Reset trigger after execution
      } else {
          console.warn("⛔ Effect skipped: No map trigger or empty focusFeatures list.");
      }
  }, [isMapTriggeredFromSearch, focusFeatures]);
  

  /**=============== Zooms and Higligts Features ===============
   * Zooms and highlights a group of features—commonly used for search results.
   * 1) Removes old highlight
   * 2) Fits bounds to the combined bounding box
   * 3) Once zoomed, queries the map to find matching features and calls `highlightFeature`.
   * 
   * @param {Array} features - The array of GeoJSON features with optional `bbox` property.
   */
  const handleFeatureZoomAndHighlight = (features) => {
    if (!features || features.length === 0) {
      console.warn('No features provided to zoom and highlight.');
      return;
    }
  
    console.log('Handling zoom and highlight for features:', features);
  
    // Remove existing highlights
    removeHighlight();
    
    // Check if features have bbox for zooming
    const featuresWithBbox = features.filter(f => f.bbox && f.bbox.length === 4);
    console.log('Features with bbox:', featuresWithBbox.length, 'out of', features.length);
    
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
        console.log('Map zoomed to feature bounds:', bounds);
      } else {
        console.warn('Invalid feature bounds:', bounds);
      }
    } else {
      console.log('No bbox found in features, skipping zoom step');
      // Optionally zoom to a default area or just highlight without zooming
    }
  
    // Step 3: After zooming (or immediately if no bbox), highlight all features
    const highlightFeatures = () => {
      console.log('Map idle event triggered. Querying matching features...');
  
      // Query all rendered features in the ownership layer
      const queriedFeatures = mapRef.current.queryRenderedFeatures({
        layers: ['ownership-layer'],
      });
  
      console.log('All queried features from ownership-layer:', queriedFeatures);
  
      // Extract the GFI of the input features (not global_parcel_uid!)
      const inputGFIs = features
        .map((feature, index) => {
          // Use GFI directly since that's what the search results have
          const gfi = feature.GFI;
          console.log(`Feature at index ${index}:`, feature);
          console.log(`Extracted GFI for feature at index ${index}:`, gfi);
          return gfi;
        })
        .filter(Boolean);

      console.log('Input GFI to match:', inputGFIs);

      // Filter the queried features to find matches based on GFI
      const matchingFeatures = queriedFeatures.filter((f) => {
        const queriedGFI = f.properties?.GFI;
        return inputGFIs.includes(queriedGFI);
      });
      
      if (matchingFeatures.length === 0) {
        console.warn('No matching features found in the ownership layer.');
        console.log('Available GFIs in layer:', queriedFeatures.map(f => f.properties?.GFI).slice(0, 5));
        return;
      }
  
      console.log('Matching features from the ownership layer:', matchingFeatures);
  
      // ✅ DEDUPLICATE: Remove duplicate features based on GFI
      const uniqueFeatures = matchingFeatures.filter((feature, index, self) => {
        const gfi = feature.properties?.GFI;
        return self.findIndex(f => f.properties?.GFI === gfi) === index;
      });
      
      console.log('Deduplicated features:', uniqueFeatures);
  
      setIsMapTriggeredFromSearch(false);
      setSelectedFeatures(uniqueFeatures); // Use deduplicated features
      // Highlight the matching features
      console.log('Highlighting features with layerStatus:', layerStatus);
      highlightFeature(uniqueFeatures); // Use deduplicated features
  
      // Switch to the info tab after highlighting
      setActiveSidePanelTab('info');
      console.log('Switched to info tab.');
    };
    
    if (featuresWithBbox.length > 0) {
      // Wait for zoom to complete before highlighting
      mapRef.current.once('idle', highlightFeatures);
    } else {
      // Highlight immediately if no zoom needed
      highlightFeatures();
    }
    };

  /**=============== Zoom to Individual Feature ===============
   * Zooms to a specific feature using its bbox property.
   * Only zooms to the feature location without changing highlights.
   * 
   * @param {Object} feature - The feature object with bbox property
   */
  const zoomToIndividualFeature = (feature) => {
    // Check for bbox in properties (vector tile features store data in properties)
    const bbox = feature.properties?.bbox || feature.bbox;
    
    if (!bbox) {
      console.warn('Feature missing bbox property:', feature);
      console.log('Feature properties:', feature.properties);
      return;
    }

    // Handle bbox as either array or string
    let bboxArray;
    if (Array.isArray(bbox)) {
      bboxArray = bbox;
    } else if (typeof bbox === 'string') {
      try {
        bboxArray = JSON.parse(bbox);
      } catch (error) {
        console.warn('Failed to parse bbox string:', bbox, error);
        return;
      }
    } else {
      console.warn('Invalid bbox format:', bbox);
      return;
    }

    if (!Array.isArray(bboxArray) || bboxArray.length !== 4) {
      console.warn('Invalid bbox array:', bboxArray);
      return;
    }

    console.log('Zooming to individual feature:', feature);
    console.log('Parsed bbox:', bboxArray);
    
    // Zoom to the feature's bbox
    const [minX, minY, maxX, maxY] = bboxArray;
    const bounds = [minX, minY, maxX, maxY];
    
    const paddingValue = window.innerWidth < 768 ? 50 : 150;
    mapRef.current.fitBounds(bounds, {
      padding: paddingValue,
      duration: 1000,
    });
    
    console.log('Map zoomed to feature bounds:', bounds);
  };

  /**=============== Re Higlight Selected when map Change ===============
   * Provides incremental re-highlighting whenever the selected feature changes
   * (due to map movement or user toggles).
   */
  useEffect(() => {
    if (!mapRef.current) return;
  
    // Function to handle the zoom or pan events
    const handleViewChange = () => {
      if (selectedFeature) {
        //console.log('Map view changed, readjusting highlight...');
        highlightFeature(selectedFeature); // Re-call highlightFeature to update the highlighted geometry
      }
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
  console.log('🔍 BEFORE highlightFeature definition - highlightSettings:', highlightSettings);
  console.log('🔍 BEFORE highlightFeature definition - highlightSettings.fillColor:', highlightSettings?.fillColor);
  console.log('🔍 highlight Function instance ID:', Math.random());

  /**
   * Gets the appropriate identifier property for a feature based on its layer
   * @param {Object} feature - The feature object
   * @param {string} layerName - The name of the layer
   * @returns {string|null} - The identifier value or null if not found
   */
  const getFeatureIdentifier = (feature, layerName) => {
    const props = feature.properties;
    
    switch (layerName) {
      case 'ownership':
        return props.GFI || props.pidn || props.Name;
      case 'public_land':
        return props.OBJECTID || props.Name;
      case 'precincts':
        return props.precinct || props.OBJECTID || props.Name;
      case 'FEMA_updated':
        return props.FLD_AR_ID || props.OBJECTID || props.Name;
      case 'conservation_easements':
        return props.Name || props.OBJECTID;
      case 'roads':
      case 'zoning':
      case 'zoning_toj_zoning_overlay':
      case 'zoning_zoverlay':
      default:
        return props.Name || props.OBJECTID || props.FLD_AR_ID || props.precinct;
    }
  };

  const highlightFeature = (inputFeatures, overrideLayerStatus, overrideHighlightSettings) => {
    // Use passed highlightSettings if available, otherwise fall back to global
    let effectiveHighlightSettings = overrideHighlightSettings || highlightSettings;
    
    // Safety check: if highlightSettings is null, use defaults
    if (!effectiveHighlightSettings) {
      console.warn('⚠️ highlightSettings is null, using defaults');
      effectiveHighlightSettings = {
        fillColor: '#FF0000',
        fillOpacity: 0.5,
        fillOutlineColor: '#FF0000',
        lineColor: '#FF0000',
        lineWidth: 3
      };
    }
    
    console.log('🔍 highlightFeature ENTRY - effectiveHighlightSettings:', effectiveHighlightSettings);
    console.log('🔍 highlightFeature ENTRY - effectiveHighlightSettings.fillColor:', effectiveHighlightSettings?.fillColor);
    
    const effectiveLayerStatus = overrideLayerStatus ?? layerStatus;
    console.log("Removing existing highlights...");
    removeHighlight();

    if (!inputFeatures || inputFeatures.length === 0) {
      console.warn("No input features provided for highlighting.");
      return;
    }

    console.log("Input features for highlighting:", inputFeatures);

    // Create a mapping of feature identifiers to their features
    const featureDict = {};
    const layerToFeatureMap = {}; // Track which layer each feature came from
    
    inputFeatures.forEach((feature) => {
      // Determine which layer this feature belongs to by checking which layer it was clicked from
      // We need to find the layer name that this feature came from
      const possibleIdentifiers = [
        feature.properties.GFI,
        feature.properties.Name,
        feature.properties.OBJECTID,
        feature.properties.precinct,
        feature.properties.FLD_AR_ID
      ].filter(Boolean);
      
      // Find the layer that contains this feature
      let sourceLayerName = null;
      const visibleLayers = Object.keys(effectiveLayerStatus).filter((layerName) => effectiveLayerStatus[layerName]);
      
      for (const layerName of visibleLayers) {
        if (mapRef.current.getLayer(`${layerName}-layer`)) {
          const queriedFeatures = mapRef.current.queryRenderedFeatures({ layers: [`${layerName}-layer`] });
          const foundFeature = queriedFeatures.find(qf => {
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
          featureDict[identifier] = [];
          layerToFeatureMap[identifier] = sourceLayerName;
        } else {
          console.warn("Feature has no valid identifier:", feature);
        }
      } else {
        console.warn("Could not determine source layer for feature:", feature);
      }
    });

    // Query features from all visible layers and match them
    const visibleLayers = Object.keys(effectiveLayerStatus).filter((layerName) => effectiveLayerStatus[layerName]);
    visibleLayers.forEach((layerName) => {
      const queriedFeatures = mapRef.current.queryRenderedFeatures({ layers: [`${layerName}-layer`] });
      queriedFeatures.forEach((visibleFeature) => {
        const visibleIdentifier = getFeatureIdentifier(visibleFeature, layerName);
        if (featureDict[visibleIdentifier] && layerToFeatureMap[visibleIdentifier] === layerName) {
          featureDict[visibleIdentifier].push(turf.feature(visibleFeature.geometry, visibleFeature.properties));
        }
      });
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

    if (unifiedFeatures.length > 0) {
      try {
        const featureCollection = JSON.parse(JSON.stringify(turf.featureCollection(unifiedFeatures)));
        const dynamicHighlightId = `${highlightLayerId}-${Date.now()}`;

        // Clean up all previous highlight layers and sources
        const existingLayers = mapRef.current.getStyle().layers || [];
        existingLayers.forEach((layer) => {
          if (layer.id.startsWith(highlightLayerId)) {
            mapRef.current.removeLayer(layer.id);
          }
        });
        Object.keys(mapRef.current.style.sourceCaches || {}).forEach((sourceId) => {
          if (sourceId.startsWith(highlightLayerId)) {
            mapRef.current.removeSource(sourceId);
          }
        });

        mapRef.current.addSource(dynamicHighlightId, {
          type: "geojson",
          data: featureCollection,
        });
        console.log('🎨 ===== HIGHLIGHT DEBUG =====');
        console.log('🎨 effectiveHighlightSettings object:', effectiveHighlightSettings);
        console.log('🎨 fillColor being used:', effectiveHighlightSettings.fillColor);
        console.log('🎨 fillOpacity being used:', effectiveHighlightSettings.fillOpacity);
        console.log('🎨 ===========================');

        setTimeout(() => {
          mapRef.current.addLayer({
            id: dynamicHighlightId,
            type: "fill",
            source: dynamicHighlightId,
            paint: {
              "fill-color": effectiveHighlightSettings.fillColor,
              "fill-outline-color": effectiveHighlightSettings.fillOutlineColor,
              "fill-opacity": effectiveHighlightSettings.fillOpacity ?? 1,
            },
          });

          mapRef.current.addLayer({
            id: `${dynamicHighlightId}-outline`,
            type: "line",
            source: dynamicHighlightId,
            paint: {
              "line-color": effectiveHighlightSettings.lineColor,
              "line-width": effectiveHighlightSettings.lineWidth ?? 3,
            },
          });
        }, 10);

      } catch (error) {
        console.error("Error during map layer creation for highlighted features:", error);
      }
    } else {
      console.warn("No features to highlight.");
    }
  };
  
    
  /**=============== Remove Highlight ===============
   * Removes the highlight fill + outline layers, along with their data source.
   * @param {Array} [featuresToRemove=[]] Optional array of features if needed
   */
  const removeHighlight = () => {
    const style = mapRef.current.getStyle();
    if (!style) return;

    // Remove all highlight layers
    (style.layers || []).forEach((layer) => {
      if (layer.id.startsWith(highlightLayerId)) {
        if (mapRef.current.getLayer(layer.id)) {
          mapRef.current.removeLayer(layer.id);
        }
      }
    });

    // Remove all highlight sources
    Object.keys(mapRef.current.style.sourceCaches || {}).forEach((sourceId) => {
      if (sourceId.startsWith(highlightLayerId)) {
        if (mapRef.current.getSource(sourceId)) {
          mapRef.current.removeSource(sourceId);
        }
      }
    });
  };

  /**=============== Update Existing Highlights ===============
   * Updates the paint properties of existing highlight layers with new settings.
   * This ensures highlight settings changes apply immediately to visible highlights.
   */
  const updateExistingHighlights = () => {
    console.log('🔍 updateExistingHighlights called');
    console.log('🔍 mapRef.current exists:', !!mapRef.current);
    
    // 🔍 Check if highlightSettings are available
    if (!highlightSettings) {
      console.warn('❌ highlightSettings is null, skipping update');
      return;
    }
    
    if (!mapRef.current) {
      console.warn('❌ mapRef.current is null');
      return;
    }
    
    const style = mapRef.current.getStyle();
    console.log('🔍 map style exists:', !!style);
    if (!style) {
      console.warn('❌ map style is null');
      return;
    }

    const allLayers = style.layers || [];
    console.log('🔍 Total layers on map:', allLayers.length);
    console.log('🔍 All layer IDs:', allLayers.map(l => l.id));

    // Find all existing highlight layers
    const highlightLayers = allLayers.filter((layer) => 
      layer.id.startsWith(highlightLayerId) && !layer.id.endsWith('-outline')
    );
    
    console.log('🔍 Found highlight layers:', highlightLayers.length);
    console.log('🔍 Highlight layer IDs:', highlightLayers.map(l => l.id));
    console.log('🔍 highlightLayerId constant:', highlightLayerId);

    if (highlightLayers.length === 0) {
      console.warn('⚠️ No highlight layers found to update');
      return;
    }

    highlightLayers.forEach((layer) => {
      const layerId = layer.id;
      const outlineLayerId = `${layerId}-outline`;
      
      console.log(`🔍 Updating layer: ${layerId}`);
      console.log(`🔍 Looking for outline layer: ${outlineLayerId}`);
      
      // Update fill layer properties
      if (mapRef.current.getLayer(layerId)) {
        console.log(`✅ Updating fill layer ${layerId} with:`, {
          'fill-color': highlightSettings.fillColor,
          'fill-outline-color': highlightSettings.fillOutlineColor,
          'fill-opacity': highlightSettings.fillOpacity ?? 1
        });
        
        mapRef.current.setPaintProperty(layerId, 'fill-color', highlightSettings.fillColor);
        mapRef.current.setPaintProperty(layerId, 'fill-outline-color', highlightSettings.fillOutlineColor);
        mapRef.current.setPaintProperty(layerId, 'fill-opacity', highlightSettings.fillOpacity ?? 1);
      } else {
        console.warn(`❌ Fill layer ${layerId} not found on map`);
      }
      
      // Update outline layer properties
      if (mapRef.current.getLayer(outlineLayerId)) {
        console.log(`✅ Updating outline layer ${outlineLayerId} with:`, {
          'line-color': highlightSettings.lineColor,
          'line-width': highlightSettings.lineWidth ?? 3
        });
        
        mapRef.current.setPaintProperty(outlineLayerId, 'line-color', highlightSettings.lineColor);
        mapRef.current.setPaintProperty(outlineLayerId, 'line-width', highlightSettings.lineWidth ?? 3);
      } else {
        console.warn(`❌ Outline layer ${outlineLayerId} not found on map`);
      }
    });

    // 🎨 Force a repaint to ensure changes are visible immediately
    console.log('🎨 Forcing map repaint...');
    try {
      // Method 1: Try to trigger a repaint
      if (mapRef.current.triggerRepaint) {
        mapRef.current.triggerRepaint();
        console.log('✅ Used triggerRepaint()');
      }
      
      // Method 2: Force a resize to trigger redraw
      mapRef.current.resize();
      console.log('✅ Used resize()');
      
      // Method 3: Force a style update
      if (mapRef.current.getStyle()) {
        mapRef.current.setPaintProperty('background', 'background-color', mapRef.current.getPaintProperty('background', 'background-color'));
        console.log('✅ Used setPaintProperty trick');
      }
      
      // Method 4: Force highlight layers to refresh by temporarily hiding/showing
      highlightLayers.forEach((layer) => {
        const layerId = layer.id;
        const outlineLayerId = `${layerId}-outline`;
        
        if (mapRef.current.getLayer(layerId)) {
          // Temporarily hide and show to force refresh
          mapRef.current.setLayoutProperty(layerId, 'visibility', 'none');
          setTimeout(() => {
            mapRef.current.setLayoutProperty(layerId, 'visibility', 'visible');
          }, 10);
        }
        
        if (mapRef.current.getLayer(outlineLayerId)) {
          // Temporarily hide and show to force refresh
          mapRef.current.setLayoutProperty(outlineLayerId, 'visibility', 'none');
          setTimeout(() => {
            mapRef.current.setLayoutProperty(outlineLayerId, 'visibility', 'visible');
          }, 10);
        }
      });
      console.log('✅ Used visibility toggle trick');
      
    } catch (error) {
      console.warn('⚠️ Error forcing repaint:', error);
    }

    // 🔍 DEBUG: Check what the layers actually have after our updates
    console.log('🔍 DEBUG: Checking layer properties after updates...');
    setTimeout(() => {
      highlightLayers.forEach((layer) => {
        const layerId = layer.id;
        const outlineLayerId = `${layerId}-outline`;
        
        if (mapRef.current.getLayer(layerId)) {
          const actualFillColor = mapRef.current.getPaintProperty(layerId, 'fill-color');
          const actualFillOpacity = mapRef.current.getPaintProperty(layerId, 'fill-opacity');
          const actualOutlineColor = mapRef.current.getPaintProperty(layerId, 'fill-outline-color');
          
          console.log(`🔍 ${layerId} actual properties:`, {
            'fill-color': actualFillColor,
            'fill-opacity': actualFillOpacity,
            'fill-outline-color': actualOutlineColor
          });
          
          // Check if they match our intended settings
          const expectedFillColor = highlightSettings.fillColor;
          const expectedFillOpacity = highlightSettings.fillOpacity ?? 1;
          const expectedOutlineColor = highlightSettings.fillOutlineColor;
          
          if (actualFillColor !== expectedFillColor) {
            console.warn(`⚠️ ${layerId} fill-color mismatch: expected ${expectedFillColor}, got ${actualFillColor}`);
          }
          if (actualFillOpacity !== expectedFillOpacity) {
            console.warn(`⚠️ ${layerId} fill-opacity mismatch: expected ${expectedFillOpacity}, got ${actualFillOpacity}`);
          }
          if (actualOutlineColor !== expectedOutlineColor) {
            console.warn(`⚠️ ${layerId} fill-outline-color mismatch: expected ${expectedOutlineColor}, got ${actualOutlineColor}`);
          }
        }
      });
    }, 100); // Check after 100ms to see if something overrode our changes

    console.log('✅ Finished updating existing highlights');
  };
  

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        console.log('Tab became visible. Forcing map resize...');
        if (mapRef.current) mapRef.current.resize();
      }
    };
  
    const handleWindowFocus = () => {
      console.log('Window focused. Forcing map resize...');
      if (mapRef.current) mapRef.current.resize();
    };
  
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleWindowFocus);
  
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleWindowFocus);
    };
  }, []);

  useEffect(() => {
    if (activeTab === 'map') {
      console.log('Active tab is "map", resizing...');
      setTimeout(() => {
        if (mapRef.current) {
          mapRef.current.resize();
        }
      }, 50); // Slight delay ensures layout is fully applied
    }
  }, [activeTab]);

  useEffect(() => {
    if (mapRef.current && mapRef.current.isStyleLoaded()) {
      console.log('Forcing map resize due to paperSize change:', paperSize);
      setTimeout(() => {
        mapRef.current.resize();
      }, 100); // Allow slight delay for DOM to apply new dimensions
    }
  }, [paperSize]);
  
  useEffect(() => {
    if (!mapIsReady || !mapRef.current) return;
    const map = mapRef.current;

    const notifyInteraction = () => {
      if (typeof window !== 'undefined' && window.__collapseSidePanel) {
        window.__collapseSidePanel();
      }
      const event = new CustomEvent('map-user-interaction');
      window.dispatchEvent(event);
      document.dispatchEvent(event);
    };

    map.on('movestart', notifyInteraction);
    map.on('zoomstart', notifyInteraction);
    map.on('rotatestart', notifyInteraction);
    map.on('pitchstart', notifyInteraction);
    map.on('click', notifyInteraction);
    map.on('touchstart', notifyInteraction);

    return () => {
      map.off('movestart', notifyInteraction);
      map.off('zoomstart', notifyInteraction);
      map.off('rotatestart', notifyInteraction);
      map.off('pitchstart', notifyInteraction);
      map.off('click', notifyInteraction);
      map.off('touchstart', notifyInteraction);
    };
  }, [mapIsReady]);
  
  // Add this MVP Tegola layer on map load for debugging
  

  /**
   * =============== Zoom to User's Location ===============
   * Uses Capacitor Geolocation plugin for native apps, or browser geolocation API for web.
   * 
   * Note: iOS Simulator requires a simulated location to be set in Xcode:
   * Features > Location > Custom Location (or choose a preset)
   */
  const handleZoomToLocation = async () => {
    if (!mapRef.current) return;
    
    const isNative = isNativeApp();

    // Show loading indicator
    setIsMapLoading(true);

    // Safety timeout to ensure loading state doesn't get stuck
    const timeoutDuration = isNative ? 15000 : 15000;
    const safetyTimeout = setTimeout(() => {
      console.warn('Geolocation request timed out (safety timeout)');
      setIsMapLoading(false);
      alert('Location request timed out. Please try again.');
    }, timeoutDuration);

    const clearSafetyTimeout = () => {
      clearTimeout(safetyTimeout);
    };

    try {
      let position;

      if (isNative) {
        // Try Capacitor Geolocation plugin first, fallback to browser API if not available
        console.log('Attempting to use Capacitor Geolocation plugin...');
        
        // Check if Capacitor Geolocation is available
        let useCapacitorPlugin = typeof Geolocation !== 'undefined' && 
                                 Geolocation.requestPermissions && 
                                 Geolocation.getCurrentPosition;
        
        if (useCapacitorPlugin) {
          try {
            // Request permissions first
            const permissionStatus = await Geolocation.requestPermissions();
            console.log('Permission status:', permissionStatus);
            
            if (permissionStatus.location !== 'granted') {
              clearSafetyTimeout();
              setIsMapLoading(false);
              alert('Location permission denied.\n\nPlease enable location services:\nSettings > Privacy > Location Services > Teton County GIS');
              return;
            }

            // Get current position
            position = await Geolocation.getCurrentPosition({
              enableHighAccuracy: false,
              timeout: 10000,
              maximumAge: 300000 // Accept cached location up to 5 minutes old
            });
            
            console.log('Capacitor geolocation result:', position);
          } catch (error) {
            console.warn('Capacitor Geolocation failed, falling back to browser API:', error);
            // Fall through to browser geolocation
            useCapacitorPlugin = false;
            position = null;
          }
        }
        
        // Fallback to browser geolocation if Capacitor plugin not available or failed
        if (!useCapacitorPlugin || !position) {
          console.log('Using browser geolocation API as fallback...');
    
    if (!navigator.geolocation) {
            clearSafetyTimeout();
            setIsMapLoading(false);
            alert('Geolocation is not supported. Please enable location services.');
            return;
          }
          
          // Use browser geolocation with settings optimized for native WebView
          position = await new Promise((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(
              (pos) => resolve(pos),
              (err) => reject(err),
              {
                enableHighAccuracy: false, // Less aggressive for WebView
                timeout: 12000,
                maximumAge: 300000 // Accept cached location up to 5 minutes old
              }
            );
          });
        }
      } else {
        // Use browser geolocation API for web
        if (!navigator.geolocation) {
          clearSafetyTimeout();
          setIsMapLoading(false);
      alert('Geolocation is not supported by your browser');
      return;
    }

        console.log('Using browser geolocation API...');

        // Wrap browser geolocation in a promise
        position = await new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
            (pos) => resolve(pos),
            (err) => reject(err),
            {
              enableHighAccuracy: true,
              timeout: 12000,
              maximumAge: 60000
            }
          );
        });
      }

      clearSafetyTimeout();
      
      // Extract coordinates (Capacitor uses different structure)
      const latitude = position.coords?.latitude || position.latitude;
      const longitude = position.coords?.longitude || position.longitude;
      
        console.log('User location:', latitude, longitude);
      
      if (!latitude || !longitude) {
        throw new Error('Invalid location coordinates');
      }
        
        // Zoom to user's location
        mapRef.current.flyTo({
          center: [longitude, latitude],
          zoom: 15,
          duration: 1500
        });

        setIsMapLoading(false);
    } catch (error) {
      clearSafetyTimeout();
        console.error('Error getting user location:', error);
        setIsMapLoading(false);
      
      let errorMessage = 'Unable to get your location.';
      if (error.code === error.PERMISSION_DENIED || (error.message && error.message.includes('permission'))) {
        errorMessage = isNative 
          ? 'Location permission denied.\n\nPlease enable location services:\nSettings > Privacy > Location Services > Teton County GIS'
          : 'Location permission denied. Please enable location services in your browser settings.';
      } else if (error.code === error.POSITION_UNAVAILABLE || (error.message && error.message.includes('unavailable'))) {
        errorMessage = isNative
          ? 'Location unavailable.\n\nIf using iOS Simulator:\nFeatures > Location > Custom Location\n\nOn device: Check location services are enabled.'
          : 'Location information is unavailable.';
      } else if (error.code === error.TIMEOUT || (error.message && error.message.includes('timeout'))) {
        errorMessage = isNative
          ? 'Location request timed out.\n\nIf using iOS Simulator:\nFeatures > Location > Custom Location\n\nOn device: Check location services.'
          : 'Location request timed out. Please try again.';
      } else {
        errorMessage = `Error: ${error.message || 'Unknown error occurred'}`;
      }
      
      alert(errorMessage);
    }
  };

  return (
    <div className="map-container">
      {isMapLoading && <Spinner />}
      <MobileSearch />
      <div className="location-zoom-button-container">
        <button 
          className="location-zoom-button" 
          onClick={handleZoomToLocation}
          title="Zoom to My Location"
        >
          <img
            src="/location-icon.svg"
            alt="Zoom to Location"
            className="location-icon"
          />
        </button>
      </div>
      <div className="layer-selector-container">
        <button className="layer-selector-button">
          <img
            src="/basemap.png"
            alt="Layers"
            className="layer-icon"
          />
        </button>
        <div className="layer-selector-popup">
          <div className="basemap-grid">
            {basemapConfig.map((basemapOption) => {
              // ✅ Check if this basemap is currently active
              const isActive = baseMapRef.current === basemapOption.id || basemap === basemapOption.id;
              return (
                <button
                  key={basemapOption.id}
                  className={`basemap-option ${isActive ? 'active' : ''}`}
                  onClick={basemapOption.onClick}
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
      <ToolPanel
        onZoomIn={() => mapRef.current.zoomIn()}
        onZoomOut={() => mapRef.current.zoomOut()}
        onDrawLine={drawLine}
        onDrawPolygon={drawPolygon}
        onSelectParcels={selectParcelsWithPolygon}
        onDeleteSelectedFeature={deleteSelectedFeature}
        onClear={clearAllDrawings}
      />
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
        showPropertyDetailsPopup={showPropertyDetailsPopup}
        setShowPropertyDetailsPopup={setShowPropertyDetailsPopup}
        selectedPropertyFeature={selectedPropertyFeature}
        setSelectedPropertyFeature={setSelectedPropertyFeature}
      />
      
      {/* ✅ ADD BACK THE PRINT WRAPPER STRUCTURE */}
      <div className="print-center-wrapper">
        <div 
          className="print-scroll-wrapper"
          style={{
            position: 'relative',
            width: computedWidth,
            height: computedHeight,
          }}
        >
          <div
            className="print-map-wrapper"
            style={{
              position: 'relative',
              width: computedWidth,
              height: computedHeight,
            }}
          >
            <div
              id="map"
              className={`map ${isPanelOpen ? 'with-panel' : ''}`}
              style={{
                ...containerStyle,
                position: 'absolute',
                top: 0,
                left: 0,
              }}
            ></div>

            {/* ✅ ADD BACK THE NOTES OVERLAY */}
            <div
              id="notes-overlay"
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: computedWidth,
                height: computedHeight,
                display: 'block',
                pointerEvents: 'none',
                zIndex: 10,
              }}
            >
              {isPrinting &&
                printElements.map((element) => {
                  switch (element.type) {
                    case 'note':
                      return (
                        <DraggableNote
                          key={`${element.id}-${selectedPrintElement?.id ?? 'none'}`}
                          note={element}
                          onNoteChange={updatePrintElement}
                          onDelete={deletePrintElement}
                          bounds="#notes-overlay"
                        />
                      );
                    case 'arrow':
                      return (
                        <ArrowShape
                          key={`${element.id}-${selectedPrintElement?.id ?? 'none'}`}
                          shape={element}
                          onChange={updatePrintElement}
                          onDelete={deletePrintElement}
                          isPrinting={isPrinting}
                        />
                      );
                    case 'legend':
                      return (
                        <DraggableLegend
                          key={element.id}
                          onDelete={() => deletePrintElement(element.id)}
                        >
                          <h4 style={{ color: 'black' }}>Legend</h4>
                          {legendItems}
                        </DraggableLegend>
                      );
                    case 'compass':
                      return (
                        <CompassElement
                          key={element.id}
                          element={element}
                          onDelete={deletePrintElement}
                        />
                      );
                    case 'shape':
                      return (
                        <ShapeElement
                          key={element.id}
                          shape={element}
                          onDelete={deletePrintElement}
                          onChange={updatePrintElement}
                        />
                      );
                    case 'rectangle':
                      return (
                        <RectangleElement
                          key={element.id}
                          shape={element}
                          onChange={updatePrintElement}
                          onDelete={deletePrintElement}
                        />
                      );
                    case 'diamond':
                      return (
                        <DiamondElement
                          key={`${element.id}-${selectedPrintElement?.id ?? 'none'}`}
                          shape={element}
                          onChange={updatePrintElement}
                          onDelete={deletePrintElement}
                        />
                      );
                    case 'triangle':
                      return (
                        <TriangleElement
                          key={element.id}
                          shape={element}
                          onChange={updatePrintElement}
                          onDelete={deletePrintElement}
                        />
                      );
                    default:
                      return null;
                  }
                })}
            </div>
          </div>
        </div>
      </div>

      {(subscriptionStatus !== "active" && subscriptionStatus !== "plus" && subscriptionStatus !== "regular") && role !== "demo" && (
        <div className="map-overlay">
          <h2 className="overlay-title">Login to Access the Map</h2>
          <p className="overlay-text">
            You must have an active subscription to interact with the data.
          </p>
          <button
            className="overlay-button"
            onClick={() => {
              navigate("/login");
            }}
          >
            Sign In
          </button>
        </div>
      )}
      
      {/* Property Details Popup */}
      {showPropertyDetailsPopup && selectedPropertyFeature && (
        <PropertyDetailsPopup
          feature={selectedPropertyFeature}
          onClose={() => {
            setShowPropertyDetailsPopup(false);
            setSelectedPropertyFeature(null);
          }}
        />
      )}
    </div>
  );
};

export default Map;
