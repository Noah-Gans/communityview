import React, { useState, useEffect, useCallback, useRef, memo, useMemo } from 'react';
import './SidePanel.css';
import { legends } from '../assets/legends';
import { layerNameMappings } from './layerMappings'; // Import layer mappings
import { useMapContext } from '../pages/MapContext';
import { useNavigate } from 'react-router-dom';
import * as turf from '@turf/turf';
import { getParcelLinks } from '../utils/parcelLinks';
import { parseGFI, getCountyCodeFromFeature, getCountyParcelIdFromFeature } from '../utils/parseGFI';

const MOBILE_SHEET = {
  HIDDEN: 'hidden',
  PEEK: 'peek',
  FULL: 'full',
};

const SidePanel = memo(({
  isOpen,
  togglePanel,
  layerStatus,
  setLayerStatus, // Function to update the layer status
  selectedFeature = [], // Feature information from the map
  activeSidePanelTab,
  setActiveSidePanelTab,
  onFeatureHover,
  onZoomToFeature, // Function to zoom to a specific feature
  showPropertyDetailsPopup, // Add this prop
  setShowPropertyDetailsPopup, // Add this prop
  selectedPropertyFeature, // Add this prop
  setSelectedPropertyFeature, // Add this prop
}) => {
  console.log("SideTab is: ", activeSidePanelTab)
  // States to manage expanded/collapsed sections
  const { activeTab, setActiveTab } = useMapContext();

  const getIsMobile = () => (typeof window !== 'undefined' ? window.innerWidth <= 768 : false);
  const [isMobile, setIsMobile] = useState(getIsMobile);
  const [mobileSheetState, setMobileSheetState] = useState(MOBILE_SHEET.HIDDEN);
  const [isPlanningOpen, setIsPlanningOpen] = useState(false); // Minimized by default
  const [isOwnershipOpen, setIsOwnershipOpen] = useState(true); // Ownership expanded by default
  const [isPublicLandOpen, setIsPublicLandOpen] = useState(false);
  const [isPLSSOpen, setIsPLSSOpen] = useState(false);
  const [isRoadsOpen, setIsRoadsOpen] = useState(false);
  const [isPrecinctsOpen, setIsPrecinctsOpen] = useState(false);
  const [isControlPointsOpen, setIsControlPointsOpen] = useState(false);
  const [isAnimalHabitatOpen, setIsAnimalHabitatOpen] = useState(false);
  const [isNaturalHazardsOpen, setIsNaturalHazardsOpen] = useState(false);
  const {setHoveredFeatureId, setGlobalActiveTab, setIsFilterTriggered, layerOrder, setLayerOrder, layerLabels, toggleLayerLabels } = useMapContext();
  const collapsedByInteractionRef = useRef(false);
  const lastSelectedFeatureRef = useRef(null);
  const prevIsOpenRef = useRef(isOpen);
  const infoContentRef = useRef(null);
  const layersContentRef = useRef(null);
  const sidePanelRef = useRef(null);
  const activeScrollContainerRef = useRef(null);
  const navigate = useNavigate();

  // State to manage legend visibility for each layer
  const [isLegendOpen, setIsLegendOpen] = useState({});
  
  // State for property details data (mobile only)
  const [propertyDetailsData, setPropertyDetailsData] = useState(null);
  const [propertyDetailsLoading, setPropertyDetailsLoading] = useState(false);

  const calculateFeatureArea = (feature) => {
    if (!feature || !feature.geometry) return 'N/A';

    try {
        // Convert feature geometry into a Turf.js polygon/multi-polygon
        const featurePolygon = turf.feature(feature.geometry);

        // Calculate area in square meters
        const areaSqMeters = turf.area(featurePolygon);

        // Convert to acres (1 square meter = 0.000247105 acres)
        const areaAcres = (areaSqMeters * 0.000247105).toFixed(2);

        return `${areaAcres} acres`;
    } catch (error) {
        console.error("Error calculating area:", error);
        return 'N/A';
    }
};

  const formatCurrency = (value) => {
    if (value === null || value === undefined || value === '') return 'N/A';
    const num = parseFloat(value);
    if (isNaN(num)) return 'N/A';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(num);
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    try {
      return new Date(dateString).toLocaleDateString();
    } catch {
      return dateString;
    }
};

  const handleLayerSelection = (layerName) => {
    // Toggle the layer visibility using setLayerStatus
    setLayerStatus(layerName);
    console.log("Oh Noooo!")
    // Update the layer order based on the new status of the layer
    setLayerOrder((prevOrder) => {
      // Determine if the layer is being toggled on or off
      const isLayerCurrentlyOn = layerStatus[layerName];

      let newOrder;

      if (!isLayerCurrentlyOn) {
        // If the layer is being toggled on, add it to the end of the order
        newOrder = [...prevOrder.filter((name) => name !== layerName), layerName];
      } else {
        // If the layer is being toggled off, remove it from the order
        newOrder = prevOrder.filter((name) => name !== layerName);
      }

      //console.log('Updated layerOrder:', newOrder);
      return newOrder;
    });
  };

  const toggleSection = (section) => {
    switch (section) {
      case 'Planning':
        setIsPlanningOpen(!isPlanningOpen);
        break;
      case 'Ownership':
        setIsOwnershipOpen(!isOwnershipOpen);
        break;
      case 'PublicLand':
        setIsPublicLandOpen(!isPublicLandOpen);
        break;
      case 'PLSS':
        setIsPLSSOpen(!isPLSSOpen);
        break;
      case 'Roads':
        setIsRoadsOpen(!isRoadsOpen);
        break;
      case 'Precincts':
        setIsPrecinctsOpen(!isPrecinctsOpen);
        break;
      case 'ControlPoints':
        setIsControlPointsOpen(!isControlPointsOpen);
        break;
      case 'CriticalAnimalHabitat':
        setIsAnimalHabitatOpen(!isAnimalHabitatOpen);
        break;
      case 'NaturalHazards':
        setIsNaturalHazardsOpen(!isNaturalHazardsOpen);
        break;
      default:
        break;
    }
  };
  const parseDescription = (htmlString) => {
    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlString, 'text/html');
    const rows = doc.querySelectorAll('tr');
  
    const properties = {};
    rows.forEach((row) => {
      const cells = row.querySelectorAll('th, td');
      if (cells.length === 2) {
        const key = cells[0].textContent.trim().toLowerCase().replace(/ /g, '_');
        const value = cells[1].textContent.trim();
        properties[key] = value;
      }
    });
  
    return properties;
  };

  // Helper function to get feature identifier for deduplication
  const getFeatureIdentifier = (feature) => {
    if (!feature || !feature.properties) return null;
    const props = feature.properties;
    if (props.GFI) return props.GFI;
    if (props.pidn) return props.pidn;
    if (props.OBJECTID && !props.precinct && !props.FLD_AR_ID) return props.OBJECTID;
    if (props.precinct) return props.precinct;
    if (props.FLD_AR_ID) return props.FLD_AR_ID;
    if (props.Name) return props.Name;
    if (props.OBJECTID) return props.OBJECTID;
    return null;
  };

  // Deduplicate selectedFeature to prevent duplicates in the side panel
  const uniqueSelectedFeatures = useMemo(() => {
    if (!Array.isArray(selectedFeature) || selectedFeature.length === 0) {
      return selectedFeature;
    }
    
    const seen = new Set();
    const seenObjects = new WeakSet(); // Track feature objects themselves
    const deduplicated = selectedFeature.filter((feature) => {
      // First check if we've seen this exact object (handles same reference duplicates)
      if (seenObjects.has(feature)) {
        return false;
      }
      
      const identifier = getFeatureIdentifier(feature);
      if (!identifier) {
        // If no identifier, still track the object to prevent exact duplicates
        seenObjects.add(feature);
        return true;
      }
      
      // Check if we've seen this identifier before
      if (seen.has(identifier)) {
        return false; // Duplicate identifier, filter it out
      }
      
      seen.add(identifier);
      seenObjects.add(feature);
      return true; // First occurrence, keep it
    });
    
    // Debug logging
    if (selectedFeature.length !== deduplicated.length) {
      console.log(`🛡️ SidePanel: Removed ${selectedFeature.length - deduplicated.length} duplicate features`);
      const originalIds = selectedFeature.map(f => getFeatureIdentifier(f));
      const uniqueIds = deduplicated.map(f => getFeatureIdentifier(f));
      console.log(`   Original IDs:`, originalIds);
      console.log(`   Unique IDs:`, uniqueIds);
    }
    
    return deduplicated;
  }, [selectedFeature]);
  
  const renderFeatureDetails = (feature, index) => {
    // Parse the description HTML if it exists to extract the attributes
    const parsedDescription = feature.properties.description ? parseDescription(feature.properties.description) : {};

    // Parse GFI to get county and county_parcel_id
    const parsedGFI = feature.properties.GFI ? parseGFI(feature.properties.GFI) : null;
    const countyCode = getCountyCodeFromFeature(feature);
    const countyParcelId = getCountyParcelIdFromFeature(feature);
    
    // Format county name for display
    const displayCounty = parsedGFI?.county 
      ? parsedGFI.county
          .replace(/_/g, ' ')
          .replace(/\s+\w\w\s*$/i, '')
          .split(' ')
          .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
          .join(' ')
          .trim()
      : (feature.properties.county ?
          feature.properties.county
            .replace(/_/g, ' ')
            .replace(/\s+\w\w\s*$/i, '')
            .split(' ')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
            .join(' ')
            .trim() : 'N/A');
    
    // Extract state from county code
    const state = parsedGFI?.county 
      ? parsedGFI.county.slice(-2).toUpperCase()
      : (feature.properties.county ? feature.properties.county.slice(-2).toUpperCase() : 'N/A');

    const links = getParcelLinks(feature.properties, countyCode);

    // Determine feature type based on available properties
    const isOwnershipFeature = feature.properties.GFI && (feature.properties.owner || feature.properties.owner_name);
    const isOwnershipAddress = parsedDescription.msag_zip || parsedDescription.st_name;
    const isPublicLandFeature = feature.properties.SURFACE || parsedDescription.holdagency || parsedDescription.sma_id;
    const isPrecinct = feature.properties.objectid || feature.pollingpla
    const isFEMA = feature.properties.FLD_AR_ID || feature.properties.FLD_ZONE
    const featureId = parsedDescription.pidn || feature.properties.pidn; // Use the unique ID from the feature
    console.log(isPublicLandFeature)
    console.log(feature.properties)
    return (
      <div key={index} className="feature-details" onMouseEnter={() => setHoveredFeatureId(feature.properties.GFI)} onMouseLeave={() => setHoveredFeatureId(null)}>
        {!isMobile && <h3 className="feature-title">Feature {index + 1}</h3>}
        
        {isOwnershipFeature ? (
          <>
            {!isMobile && <div><strong>Owner Name:</strong> {feature.properties.owner || feature.properties.owner_name || 'N/A'}</div>}
            <div><strong>Physical Address:</strong> {feature.properties.physical || 'N/A'}</div>
            <div><strong>Property Value:</strong> {(() => {
              const value = feature.properties.property_value;
              if (!value || value === 'N/A') return 'N/A';
              const num = parseFloat(value);
              if (isNaN(num)) return value;
              return new Intl.NumberFormat('en-US', {
                style: 'currency',
                currency: 'USD',
                minimumFractionDigits: 0,
                maximumFractionDigits: 0
              }).format(num);
            })()}</div>
            <div><strong>County:</strong> {displayCounty}</div>
            <div><strong>State:</strong> {state}</div>
            <div><strong>County Parcel ID:</strong> {countyParcelId || 'N/A'}</div>
            <div><strong>Mailing Address:</strong> {feature.properties.mail || 'N/A'}</div>
            {(!isMobile || mobileSheetState !== MOBILE_SHEET.PEEK) && (
              <>
                <div><strong>Acreage:</strong> {feature.properties.acre ? `${parseFloat(feature.properties.acre).toFixed(2)} acres` : 'N/A'}</div>
              </>
            )}
            {(!isMobile || mobileSheetState !== MOBILE_SHEET.PEEK) && (
            <div className="action-buttons-stack">
              {onZoomToFeature && (
                <div className="sp-map-button-container">
                  <button
                    className="sp-map-button"
                    onClick={() => onZoomToFeature(feature)}
                    title="Zoom to this feature on the map"
                  >
                    Map It
                  </button>
                </div>
              )}
                {!isMobile && (
              <div className="sp-property-button-container">
                <button 
                  className="sp-property-button"
                  onClick={() => {
                    setSelectedPropertyFeature(feature);
                    setShowPropertyDetailsPopup(true);
                  }}
                >
                  Property Details & Tax
                </button>
              </div>
                )}
            </div>
            )}
            {/* Removed clerk records link since it's now in the PropertyDetailsPopup */}
          </>
        ) : isOwnershipAddress ? (
          <>
            <div><strong>Street Address:</strong> {parsedDescription.st_address || 'N/A'}</div>
            <div><strong>City:</strong> {parsedDescription.msag_city || 'N/A'}</div>
            <div><strong>State:</strong> {parsedDescription.state || 'N/A'}</div>
            <div><strong>ZIP Code:</strong> {parsedDescription.msag_zip || 'N/A'}</div>
            <div><strong>PIDN:</strong> {parsedDescription.pidn || 'N/A'}</div>
          </>
        ) : isPublicLandFeature ? (
          <>
            <div><strong>Managing Agency:</strong> {feature.properties.SURFACE || 'N/A'}</div>
            <div><strong>Area:</strong> {feature ? calculateFeatureArea(feature) : 'N/A'}</div>
            
  
            {/* Description */}
            {parsedDescription.descript && (
              <div>
                <strong>Description:</strong> {parsedDescription.descript}
              </div>
            )}
          </>
        ) : isPrecinct ? (
          <>
            <div><strong>House:</strong> {feature.properties.house || 'N/A'}</div>
            <div><strong>Polling Place:</strong> {feature.properties.pollingpla || 'N/A'}</div>
            <div><strong>Precinct:</strong> {feature.properties.precinct || 'N/A'}</div>
            <div><strong>Senate</strong> {feature.properties.senate || 'N/A'}</div>

  
            {/* Description */}
            {parsedDescription.descript && (
              <div>
                <strong>Description:</strong> {parsedDescription.descript}
              </div>
            )}
          </>
        ) : isFEMA ? (
          <>
            <div><strong>Flood Zone Code:</strong> {feature.properties.FLD_ZONE || 'N/A'}</div>
            {/* Description */}
            {parsedDescription.descript && (
              <div>
                <strong>Description:</strong> {parsedDescription.descript}
              </div>
            )}
          </>
        ): (
          <>
            {/* Render generic attributes if the feature does not match a known type */}
            {Object.keys(parsedDescription).length > 0 ? (
              Object.entries(parsedDescription).slice(0, 5).map(([key, value]) => (
                <div key={key}>
                  <strong>{key.replace(/_/g, ' ')}:</strong> {value || 'N/A'}
                </div>
              ))
            ) : (
              <p>No detailed information available.</p>
            )}
          </>
        )}
        {!isOwnershipFeature && onZoomToFeature && (
          <div className="action-buttons-stack">
            <div className="sp-map-button-container">
              <button
                className="sp-map-button"
                onClick={() => onZoomToFeature(feature)}
                title="Zoom to this feature on the map"
              >
                Map It
              </button>
            </div>
          </div>
        )}
        <hr className="feature-separator" />
      </div>
    );
  };
  
  const onReportBuilderClick = () => {
    console.log("Clicked")
    setIsFilterTriggered(true)
    setActiveTab('report');
    navigate('/report');
  }
  
  const toggleLegend = (layerName) => {
    setIsLegendOpen((prev) => ({
      ...prev,
      [layerName]: !prev[layerName],
    }));
  };

  const getLayerType = (layerName) => {
    const lineLayers = ['roads', "roads_easements", 'rivers', 'railways', "zoning_toj_corp_limit"]; // Example line layers
    const pointLayers = ['precincts_polling_centers', 'control_points_controls']; // Example point layers
    const adressLayer = []
    console.log("Layer Name is ", layerName, " and bool is ", layerName == 'ownership_address')
    if (lineLayers.includes(layerName)) return 'line';
    if (pointLayers.includes(layerName)) return 'point';
    if (layerName == 'ownership_address') return 'symbol'
    return 'fill'; // Default to polygons
  };
  

  const renderLegend = (layerName, layerType) => {
    const legendItems = legends[layerName];
    const legendStyle = {
      display: 'inline-block',
      marginLeft: '8px',
      border: '1px solid #000', // Black outline for visibility
    };
    
    if (layerType === 'symbol') {
      // **Symbol Layer (Ownership Address) → Pin Icon**
      return (
        <img
          src="/pin_better.png"  // Path to your custom pin icon
          alt="Pin Symbol"
          style={{
            width: '16px',  // Adjust for small size
            height: '16px',
          }}
        />
      );
    }
    if ((!legendItems || legendItems.length === 0)) {
      console.warn(`No legend found for layer: ${layerName}`);
      return null; // Don't render anything if there's no legend
    }
    
    if (legendItems.length === 1) {
      const item = legendItems[0];
  
      if (layerType === 'fill') {
        // **Polygon Layer → Colored Square**
        return (
          <span
            style={{
              ...legendStyle,
              width: '14px',
              height: '14px',
              backgroundColor: item.color,
              opacity: item.opacity !== undefined ? item.opacity : 1,
            }}
          />
        );
      } else if (layerType === 'line') {
        // **Line Layer → Horizontal Line**
        return (
          <span
            style={{
              ...legendStyle,
              width: '24px',
              height: '3px',
              backgroundColor: item.color,
              display: 'inline-block',
            }}
          />
        );
      } else if (layerType === 'point') {
        // **Point Layer → Circle (or Icon if available)**
        return (
          <span
            style={{
              ...legendStyle,
              width: '10px',
              height: '10px',
              backgroundColor: item.color,
              borderRadius: '50%',
              display: 'inline-block',
            }}
          />
        );
      } 
    }
  
    return (
      <div className="legend-container">
        <button onClick={() => toggleLegend(layerName)} className="legend-toggle">
          {isLegendOpen[layerName] ? '-' : '+'} Legend
        </button>
        {isLegendOpen[layerName] && (
          <ul className="legend">
            {legendItems.map((item, index) => (
              <li key={index} className="legend-item">
                <span
                  className="legend-color"
                  style={{
                    backgroundColor: item.color,
                    opacity: item.opacity !== undefined ? item.opacity : 1,
                  }}
                />
                {item.label}
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  };

  const getTopLayer = () => {
    //console.log("Top Layer called and is:")
    //console.log(layerOrder.length > 0 ? layerOrder[layerOrder.length - 1] : null)

    return layerOrder.length > 0 ? layerOrder[layerOrder.length - 1] : null;
  };

  const topLayer = getTopLayer();

  const setSheetState = useCallback(
    (nextState, { suppressToggle } = {}) => {
      if (!isMobile) return;

      if (nextState !== MOBILE_SHEET.HIDDEN && !isOpen && !suppressToggle) {
        togglePanel();
      }

      setMobileSheetState(nextState);
    },
    [isMobile, isOpen, togglePanel]
  );

  const cycleSheetState = useCallback(() => {
    if (!isMobile) {
      togglePanel();
      return;
    }

    collapsedByInteractionRef.current = false;
    if (mobileSheetState === MOBILE_SHEET.HIDDEN) {
      setSheetState(MOBILE_SHEET.PEEK);
    } else if (mobileSheetState === MOBILE_SHEET.PEEK) {
      setSheetState(MOBILE_SHEET.FULL);
    } else {
      setSheetState(MOBILE_SHEET.PEEK);
    }
  }, [isMobile, mobileSheetState, setSheetState, togglePanel]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return undefined;
    }
    const handleResize = () => {
      setIsMobile(window.innerWidth <= 768);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    if (!isMobile) {
      setMobileSheetState(MOBILE_SHEET.HIDDEN);
      document.body.classList.remove('sheet-hidden', 'sheet-peek', 'sheet-full');
      return;
    }

    document.body.classList.remove('sheet-hidden', 'sheet-peek', 'sheet-full');
    document.body.classList.add(`sheet-${mobileSheetState}`);

    return () => {
      document.body.classList.remove('sheet-hidden', 'sheet-peek', 'sheet-full');
    };
  }, [isMobile, mobileSheetState]);

  useEffect(() => {
    if (!isMobile) {
      prevIsOpenRef.current = isOpen;
      return;
    }

    if (!isOpen) {
      collapsedByInteractionRef.current = false;
      setMobileSheetState(MOBILE_SHEET.HIDDEN);
    } else if (!prevIsOpenRef.current && mobileSheetState === MOBILE_SHEET.HIDDEN && !collapsedByInteractionRef.current) {
      setMobileSheetState(MOBILE_SHEET.PEEK);
    }

    prevIsOpenRef.current = isOpen;
  }, [isMobile, isOpen, mobileSheetState]);

  useEffect(() => {
    if (!isMobile) return;

    if (uniqueSelectedFeatures.length === 0) {
      lastSelectedFeatureRef.current = null;
      return;
    }

    const primaryFeature = uniqueSelectedFeatures[0];
    const featureKey =
      primaryFeature?.properties?.GFI ??
      primaryFeature?.id ??
      JSON.stringify(primaryFeature?.properties ?? {});

    const isNewSelection = featureKey !== lastSelectedFeatureRef.current;
    
    if (!isNewSelection) {
      return;
    }

    lastSelectedFeatureRef.current = featureKey;

    if (!isOpen) {
      togglePanel();
    }

    setActiveSidePanelTab('info');
    setSheetState(MOBILE_SHEET.PEEK);
    collapsedByInteractionRef.current = false;
  }, [
    isMobile,
    isOpen,
    uniqueSelectedFeatures,
    togglePanel,
    setActiveSidePanelTab,
    setSheetState,
  ]);

  // Reset scroll position when entering peek mode
  useEffect(() => {
    if (!isMobile || mobileSheetState !== MOBILE_SHEET.PEEK) return;

    // Reset scroll position immediately
    const resetScroll = () => {
      if (infoContentRef.current) {
        infoContentRef.current.scrollTop = 0;
      }
      if (layersContentRef.current) {
        layersContentRef.current.scrollTop = 0;
      }
    };

    resetScroll();
    
    // Also reset after a small delay to ensure DOM has updated
    const timeoutId = setTimeout(resetScroll, 50);
    
    return () => clearTimeout(timeoutId);
  }, [isMobile, mobileSheetState]);

  useEffect(() => {
    if (!isMobile) return;
    if (!isOpen) {
      setMobileSheetState(MOBILE_SHEET.HIDDEN);
    }
  }, [isMobile, isOpen]);

  useEffect(() => {
    if (!isMobile) {
      if (typeof window !== 'undefined') {
        delete window.__collapseSidePanel;
      }
      return;
    }

    if (typeof window !== 'undefined') {
      window.__collapseSidePanel = () => {
        collapsedByInteractionRef.current = true;
        setSheetState(MOBILE_SHEET.HIDDEN, { suppressToggle: true });
      };
    }

    return () => {
      if (typeof window !== 'undefined') {
        delete window.__collapseSidePanel;
      }
    };
  }, [isMobile, setSheetState]);

  // Panel-wide swipe detection for state changes
  useEffect(() => {
    if (!isMobile || !sidePanelRef.current) {
      return;
    }

    let touchStartY = 0;
    let touchStartTime = 0;
    let hasTriggeredStateChange = false;
    const SWIPE_THRESHOLD = 30; // Minimum distance for a swipe
    const SWIPE_VELOCITY_THRESHOLD = 0.3; // Minimum velocity (px/ms)

    const getScrollableAncestor = (target) => {
      if (!target || typeof target.closest !== 'function') {
        return null;
      }
      return target.closest('.info-content, .layers-tab');
    };

    const handleTouchStart = (e) => {
      touchStartY = e.touches[0].clientY;
      touchStartTime = Date.now();
      hasTriggeredStateChange = false;
      activeScrollContainerRef.current = getScrollableAncestor(e.target);
    };

    const handleTouchMove = (e) => {
      if (hasTriggeredStateChange) return;
      
      const touchY = e.touches[0].clientY;
      const touchDelta = touchY - touchStartY;
      const touchDuration = Date.now() - touchStartTime;
      const swipeVelocity = touchDuration > 0 ? Math.abs(touchDelta) / touchDuration : 0;

      // Check if it's a significant swipe (either by distance or velocity)
      const isSignificantSwipe = Math.abs(touchDelta) > SWIPE_THRESHOLD && 
                                 (swipeVelocity > SWIPE_VELOCITY_THRESHOLD || touchDuration < 100);

      if (isSignificantSwipe) {
        hasTriggeredStateChange = true;
        
        if (touchDelta < 0) {
          // Swiping up - expand
          if (mobileSheetState === MOBILE_SHEET.HIDDEN) {
            setSheetState(MOBILE_SHEET.PEEK);
          } else if (mobileSheetState === MOBILE_SHEET.PEEK) {
            setSheetState(MOBILE_SHEET.FULL);
          }
        } else {
          // Swiping down - collapse
          const activeScrollable = activeScrollContainerRef.current;
          const isScrollableAtTop =
            !activeScrollable || activeScrollable.scrollTop <= 0;
          if (mobileSheetState === MOBILE_SHEET.FULL && !isScrollableAtTop) {
            hasTriggeredStateChange = false;
            return;
          }
          if (mobileSheetState === MOBILE_SHEET.FULL) {
            setSheetState(MOBILE_SHEET.PEEK);
          } else if (mobileSheetState === MOBILE_SHEET.PEEK) {
            setSheetState(MOBILE_SHEET.HIDDEN);
          }
        }
      }
    };

    const panelElement = sidePanelRef.current;
    panelElement.addEventListener('touchstart', handleTouchStart, { passive: true });
    panelElement.addEventListener('touchmove', handleTouchMove, { passive: true });

    return () => {
      panelElement.removeEventListener('touchstart', handleTouchStart);
      panelElement.removeEventListener('touchmove', handleTouchMove);
    };
  }, [isMobile, mobileSheetState, setSheetState]);

  // Scroll detection for info content in peek mode - expand to full when scrolling
  useEffect(() => {
    if (!isMobile || !infoContentRef.current || mobileSheetState !== MOBILE_SHEET.PEEK) {
      return;
    }

    let touchStartY = 0;
    let hasExpanded = false;

    const handleTouchStart = (e) => {
      touchStartY = e.touches[0].clientY;
      hasExpanded = false;
    };

    const handleTouchMove = (e) => {
      if (hasExpanded) {
        e.preventDefault();
        return;
      }
      
      const touchY = e.touches[0].clientY;
      const touchDelta = touchY - touchStartY;
      
      // If scrolling up (negative delta) and significant movement, expand to full
      if (touchDelta < -20) {
        hasExpanded = true;
        setSheetState(MOBILE_SHEET.FULL);
        e.preventDefault();
      } else if (touchDelta > 0) {
        // Prevent downward scrolling in peek mode
        e.preventDefault();
      }
    };

    const handleWheel = (e) => {
      e.preventDefault();
      // If scrolling up, expand to full
      if (e.deltaY < 0) {
        setSheetState(MOBILE_SHEET.FULL);
      }
    };

    const contentElement = infoContentRef.current;
    contentElement.addEventListener('touchstart', handleTouchStart, { passive: true });
    contentElement.addEventListener('touchmove', handleTouchMove, { passive: false });
    contentElement.addEventListener('wheel', handleWheel, { passive: false });

    return () => {
      contentElement.removeEventListener('touchstart', handleTouchStart);
      contentElement.removeEventListener('touchmove', handleTouchMove);
      contentElement.removeEventListener('wheel', handleWheel);
    };
  }, [isMobile, mobileSheetState, setSheetState]);

  // Scroll detection for layers content in peek mode - expand to full when scrolling
  useEffect(() => {
    if (!isMobile || !layersContentRef.current || mobileSheetState !== MOBILE_SHEET.PEEK) {
      return;
    }

    let touchStartY = 0;
    let hasExpanded = false;

    const handleTouchStart = (e) => {
      touchStartY = e.touches[0].clientY;
      hasExpanded = false;
    };

    const handleTouchMove = (e) => {
      if (hasExpanded) {
        e.preventDefault();
        return;
      }
      
      const touchY = e.touches[0].clientY;
      const touchDelta = touchY - touchStartY;
      
      // If scrolling up (negative delta) and significant movement, expand to full
      if (touchDelta < -20) {
        hasExpanded = true;
        setSheetState(MOBILE_SHEET.FULL);
        e.preventDefault();
      } else if (touchDelta > 0) {
        // Prevent downward scrolling in peek mode
        e.preventDefault();
      }
    };

    const handleWheel = (e) => {
      e.preventDefault();
      // If scrolling up, expand to full
      if (e.deltaY < 0) {
        setSheetState(MOBILE_SHEET.FULL);
      }
    };

    const contentElement = layersContentRef.current;
    contentElement.addEventListener('touchstart', handleTouchStart, { passive: true });
    contentElement.addEventListener('touchmove', handleTouchMove, { passive: false });
    contentElement.addEventListener('wheel', handleWheel, { passive: false });

    return () => {
      contentElement.removeEventListener('touchstart', handleTouchStart);
      contentElement.removeEventListener('touchmove', handleTouchMove);
      contentElement.removeEventListener('wheel', handleWheel);
    };
  }, [isMobile, mobileSheetState, setSheetState]);

  // Fetch property details for mobile when feature is selected
  useEffect(() => {
    if (!isMobile || uniqueSelectedFeatures.length === 0) {
      setPropertyDetailsData(null);
      return;
    }

    const primaryFeature = uniqueSelectedFeatures[0];
    const isOwnershipFeature = primaryFeature?.properties?.GFI && 
      (primaryFeature.properties.owner || primaryFeature.properties.owner_name);
    
    if (!isOwnershipFeature) {
      setPropertyDetailsData(null);
      return;
    }

    setPropertyDetailsLoading(true);
    setPropertyDetailsData(null);

    const countyCode = getCountyCodeFromFeature(primaryFeature);
    const parcelId = getCountyParcelIdFromFeature(primaryFeature);
    
    let taxField = primaryFeature.properties.tax_details_key || '';
    if (countyCode === 'lincoln_county_wy' && taxField && !taxField.startsWith('00')) {
      taxField = '00' + taxField;
    }
    
    const requestBody = {
      county: countyCode,
      county_parcel_id: parcelId,
      fields: {
        tax_field: taxField,
        property_details_field: primaryFeature.properties.property_details_key || '',
        clerk_field: primaryFeature.properties.clerk_records_key || ''
      }
    };

    fetch('https://34.10.19.103.nip.io/property/scrape-stream', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody)
    })
    .then(response => {
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      const processStream = ({ done, value }) => {
        if (done) {
          setPropertyDetailsLoading(false);
          return;
        }

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const jsonStr = line.slice(6);
            
            try {
              const jsonData = JSON.parse(jsonStr);
              
              if (jsonData.status === 'cached' || jsonData.status === 'fresh') {
                setPropertyDetailsData(jsonData);
                if (jsonData.status === 'fresh') {
                  setPropertyDetailsLoading(false);
                }
              } else if (jsonData.status === 'complete') {
                setPropertyDetailsLoading(false);
                return;
              }
            } catch (err) {
              console.error('❌ Error parsing SSE event:', err);
            }
          }
        }

        return reader.read().then(processStream);
      };

      return reader.read().then(processStream);
    })
    .catch(err => {
      console.error('❌ Error fetching property details:', err);
      setPropertyDetailsLoading(false);
    });
  }, [isMobile, uniqueSelectedFeatures]);

  const sidePanelClassNames = ['side-panel'];
  if (isMobile) {
    sidePanelClassNames.push('mobile');
    sidePanelClassNames.push(`mobile-${mobileSheetState}`);
  } else {
    sidePanelClassNames.push(isOpen ? 'open' : 'closed');
  }

  const sheetHeights = {
    [MOBILE_SHEET.HIDDEN]: '110px',
    [MOBILE_SHEET.PEEK]: '35vh',
    [MOBILE_SHEET.FULL]: '75vh',
  };

  const panelStyle = isMobile
    ? {
        height: sheetHeights[mobileSheetState],
        maxHeight: '85vh',
        paddingBottom: 'calc(env(safe-area-inset-bottom) + 16px)',
      }
    : undefined;

  const shouldRenderContent = isOpen;

  return (
    <>
      <div ref={sidePanelRef} className={sidePanelClassNames.join(' ')} style={panelStyle}>
        {!isMobile && (
      <button className="toggle-btn" onClick={togglePanel}>
        {isOpen ? '<<' : '>>'}
      </button>
        )}
        {isMobile && (
          <div className="mobile-sheet-header">
            <div
              className="mobile-sheet-grabber"
              onClick={cycleSheetState}
              role="button"
              tabIndex={0}
            >
              <span className="mobile-sheet-grabber-bar" />
            </div>
            <div className="mobile-owner-name-preview">
              {(() => {
                if (uniqueSelectedFeatures.length > 0) {
                  const primaryFeature = uniqueSelectedFeatures[0];
                  const isOwnershipFeature = primaryFeature?.properties?.GFI && 
                    (primaryFeature.properties.owner || primaryFeature.properties.owner_name);
                  if (isOwnershipFeature) {
                    const ownerName = primaryFeature.properties.owner || primaryFeature.properties.owner_name;
                    return ownerName || 'Select Parcel';
                  }
                }
                return 'Select Parcel';
              })()}
            </div>
          </div>
        )}
        {shouldRenderContent && (
        <div className="content">
          <div className="tab-buttons">
            <button
              className={activeSidePanelTab === 'layers' ? 'active' : ''}
              onClick={() => setActiveSidePanelTab('layers')}
            >
              Layers
            </button>
            <button
              className={activeSidePanelTab === 'info' ? 'active' : ''}
              onClick={() => setActiveSidePanelTab('info')}
            >
              Info
            </button>
          </div>
          <div className="tab-content">
            {activeSidePanelTab === 'layers' && (
              <div className="layers-tab" ref={layersContentRef}>
                <h2>Layers</h2>

                {/* Planning Layers */}
                <div className="layer-category">
                  <button onClick={() => toggleSection('Planning')}>
                    {isPlanningOpen ? '-' : '+'} Planning
                  </button>
                  {isPlanningOpen && (
                    <ul>
                      {[
                        'zoning',
                        'zoning_toj_zoning',
                        'zoning_toj_zoning_overlay',
                        'zoning_zoverlay',
                        'zoning_toj_corp_limit',
                      ].map((layerName) => (
                        <li key={layerName}>
                          <div className="layer-item-container">
                            <label className="layer-checkbox-label">
                              <input
                                type="checkbox"
                                checked={layerStatus[layerName] || false}
                                onChange={() => handleLayerSelection(layerName)}
                              />
                              <span
                                style={{
                                  textDecoration: topLayer === layerName ? 'underline' : 'none',
                                }}
                              >
                                {layerNameMappings[layerName] || layerName}
                              </span>
                            </label>
                            {layerStatus[layerName] && layerName === 'ownership' && (
                              <button
                                className={`label-toggle-btn ${layerLabels[layerName] ? 'active' : ''}`}
                                onClick={() => toggleLayerLabels(layerName)}
                                title="Toggle labels"
                              >
                                A
                              </button>
                            )}
                          </div>
                          {renderLegend(layerName, getLayerType(layerName))}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                {/* Ownership Layers */}
                <div className="layer-category">
                  <button onClick={() => toggleSection('Ownership')}>
                    {isOwnershipOpen ? '-' : '+'} Ownership
                  </button>
                  {isOwnershipOpen && (
                    <ul>
                      {['ownership'].map((layerName) => (
                        <li key={layerName}>
                          <div className="layer-item-container">
                            <label className="layer-checkbox-label">
                              <input
                                type="checkbox"
                                checked={layerStatus[layerName] || false}
                                onChange={() => handleLayerSelection(layerName)}
                              />
                              <span
                                style={{
                                  textDecoration: topLayer === layerName ? 'underline' : 'none',
                                }}
                              >
                                {layerNameMappings[layerName] || layerName}
                              </span>
                            </label>
                            {layerStatus[layerName] && (
                              <button
                                className={`label-toggle-btn ${layerLabels[layerName] ? 'active' : ''}`}
                                onClick={() => toggleLayerLabels(layerName)}
                                title="Toggle labels"
                              >
                                A
                              </button>
                            )}
                          </div>
                          {renderLegend(layerName, getLayerType(layerName))}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                {/* Public Land Layers */}
                <div className="layer-category">
                  <button onClick={() => toggleSection('PublicLand')}>
                    {isPublicLandOpen ? '-' : '+'} Public Land
                  </button>
                  {isPublicLandOpen && (
                    <ul>
                      {[
                        'conservation_easements',
                        'public_land'
                      
                      ].map((layerName) => (
                        <li key={layerName}>
                          <div className="layer-item-container">
                            <label className="layer-checkbox-label">
                              <input
                                type="checkbox"
                                checked={layerStatus[layerName] || false}
                                onChange={() => handleLayerSelection(layerName)}
                              />
                              <span
                                style={{
                                  textDecoration: topLayer === layerName ? 'underline' : 'none',
                                }}
                              >
                                {layerNameMappings[layerName] || layerName}
                              </span>
                            </label>
                            {layerStatus[layerName] && layerName === 'ownership' && (
                              <button
                                className={`label-toggle-btn ${layerLabels[layerName] ? 'active' : ''}`}
                                onClick={() => toggleLayerLabels(layerName)}
                                title="Toggle labels"
                              >
                                A
                              </button>
                            )}
                          </div>
                          {renderLegend(layerName, getLayerType(layerName))}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                {/* PLSS Layers */}
                <div className="layer-category">
                  <button onClick={() => toggleSection('PLSS')}>
                    {isPLSSOpen ? '-' : '+'} PLSS
                  </button>
                  {isPLSSOpen && (
                    <ul>
                      {[
                        'plss_plss_intersected',
                        'plss_plss_sections',
                        'plss_plss_townships',
                      ].map((layerName) => (
                        <li key={layerName}>
                          <div className="layer-item-container">
                            <label className="layer-checkbox-label">
                              <input
                                type="checkbox"
                                checked={layerStatus[layerName] || false}
                                onChange={() => handleLayerSelection(layerName)}
                              />
                              <span
                                style={{
                                  textDecoration: topLayer === layerName ? 'underline' : 'none',
                                }}
                              >
                                {layerNameMappings[layerName] || layerName}
                              </span>
                            </label>
                            {layerStatus[layerName] && layerName === 'ownership' && (
                              <button
                                className={`label-toggle-btn ${layerLabels[layerName] ? 'active' : ''}`}
                                onClick={() => toggleLayerLabels(layerName)}
                                title="Toggle labels"
                              >
                                A
                              </button>
                            )}
                          </div>
                          {renderLegend(layerName, getLayerType(layerName))}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                {/* Road Layers */}
                <div className="layer-category">
                  <button onClick={() => toggleSection('Roads')}>
                    {isRoadsOpen ? '-' : '+'} Roads
                  </button>
                  {isRoadsOpen && (
                    <ul>
                      {['roads', 'roads_easements'].map((layerName) => (
                        <li key={layerName}>
                          <div className="layer-item-container">
                            <label className="layer-checkbox-label">
                              <input
                                type="checkbox"
                                checked={layerStatus[layerName] || false}
                                onChange={() => handleLayerSelection(layerName)}
                              />
                              <span
                                style={{
                                  textDecoration: topLayer === layerName ? 'underline' : 'none',
                                }}
                              >
                                {layerNameMappings[layerName] || layerName}
                              </span>
                            </label>
                            {layerStatus[layerName] && layerName === 'ownership' && (
                              <button
                                className={`label-toggle-btn ${layerLabels[layerName] ? 'active' : ''}`}
                                onClick={() => toggleLayerLabels(layerName)}
                                title="Toggle labels"
                              >
                                A
                              </button>
                            )}
                          </div>
                          {renderLegend(layerName, getLayerType(layerName))}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                {/* Precincts Layers */}
                <div className="layer-category">
                  <button onClick={() => toggleSection('Precincts')}>
                    {isPrecinctsOpen ? '-' : '+'} Precincts
                  </button>
                  {isPrecinctsOpen && (
                    <ul>
                      {['precincts_polling_centers', 'precincts' ].map((layerName) => (
                        <li key={layerName}>
                          <div className="layer-item-container">
                            <label className="layer-checkbox-label">
                              <input
                                type="checkbox"
                                checked={layerStatus[layerName] || false}
                                onChange={() => handleLayerSelection(layerName)}
                              />
                              <span
                                style={{
                                  textDecoration: topLayer === layerName ? 'underline' : 'none',
                                }}
                              >
                                {layerNameMappings[layerName] || layerName}
                              </span>
                            </label>
                            {layerStatus[layerName] && layerName === 'ownership' && (
                              <button
                                className={`label-toggle-btn ${layerLabels[layerName] ? 'active' : ''}`}
                                onClick={() => toggleLayerLabels(layerName)}
                                title="Toggle labels"
                              >
                                A
                              </button>
                            )}
                          </div>
                          {renderLegend(layerName, getLayerType(layerName))}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                {/* Control Points Layers */}
                <div className="layer-category">
                  <button onClick={() => toggleSection('ControlPoints')}>
                    {isControlPointsOpen ? '-' : '+'} Control Points
                  </button>
                  {isControlPointsOpen && (
                    <ul>
                      {['control_points_controls'].map((layerName) => (
                        <li key={layerName}>
                          <div className="layer-item-container">
                            <label className="layer-checkbox-label">
                              <input
                                type="checkbox"
                                checked={layerStatus[layerName] || false}
                                onChange={() => handleLayerSelection(layerName)}
                              />
                              <span
                                style={{
                                  textDecoration: topLayer === layerName ? 'underline' : 'none',
                                }}
                              >
                                {layerNameMappings[layerName] || layerName}
                              </span>
                            </label>
                            {layerStatus[layerName] && layerName === 'ownership' && (
                              <button
                                className={`label-toggle-btn ${layerLabels[layerName] ? 'active' : ''}`}
                                onClick={() => toggleLayerLabels(layerName)}
                                title="Toggle labels"
                              >
                                A
                              </button>
                            )}
                          </div>
                          {renderLegend(layerName, getLayerType(layerName))}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <div className="layer-category">
                  <button onClick={() => toggleSection('CriticalAnimalHabitat')}>
                    {isAnimalHabitatOpen ? '-' : '+'} Critical Animal Habitat
                  </button>
                  {isAnimalHabitatOpen && (
                    <ul>
                      {['mooose_reprojected', 'reporjected_elk', 'bigHorn_reporjected', 'mule_deer_reporjected'].map((layerName) => (
                        <li key={layerName}>
                          <div className="layer-item-container">
                            <label className="layer-checkbox-label">
                              <input
                                type="checkbox"
                                checked={layerStatus[layerName] || false}
                                onChange={() => handleLayerSelection(layerName)}
                              />
                              <span
                                style={{
                                  textDecoration: topLayer === layerName ? 'underline' : 'none',
                                }}
                              >
                                {layerNameMappings[layerName] || layerName}
                              </span>
                            </label>
                            {layerStatus[layerName] && layerName === 'ownership' && (
                              <button
                                className={`label-toggle-btn ${layerLabels[layerName] ? 'active' : ''}`}
                                onClick={() => toggleLayerLabels(layerName)}
                                title="Toggle labels"
                              >
                                A
                              </button>
                            )}
                          </div>
                          {renderLegend(layerName, getLayerType(layerName))}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                {/* Natural Hazards Layers */}
                <div className="layer-category">
                  <button onClick={() => toggleSection('NaturalHazards')}>
                    {isNaturalHazardsOpen ? '-' : '+'} Natural Hazards
                  </button>
                  {isNaturalHazardsOpen && (
                    <ul>
                      {['FEMA_updated'].map((layerName) => (
                        <li key={layerName}>
                          <div className="layer-item-container">
                            <label className="layer-checkbox-label">
                              <input
                                type="checkbox"
                                checked={layerStatus[layerName] || false}
                                onChange={() => handleLayerSelection(layerName)}
                              />
                              <span
                                style={{
                                  textDecoration: topLayer === layerName ? 'underline' : 'none',
                                }}
                              >
                                {layerNameMappings[layerName] || layerName}
                              </span>
                            </label>
                            {layerStatus[layerName] && layerName === 'ownership' && (
                              <button
                                className={`label-toggle-btn ${layerLabels[layerName] ? 'active' : ''}`}
                                onClick={() => toggleLayerLabels(layerName)}
                                title="Toggle labels"
                              >
                                A
                              </button>
                            )}
                          </div>
                          {renderLegend(layerName, getLayerType(layerName))}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>


              </div>
            )}

            {activeSidePanelTab === 'info' && (
              <div className="info-tab">
              {/* Fixed header for button */}
              <div className="info-header">
                <div className="sp-report-builder-container">
                  <button
                    className="sp-report-builder-button"
                    onClick={() => onReportBuilderClick(selectedFeature)}
                  >
                    See Features in Report Builder
                  </button>
                </div>
              </div>
              {/* Scrollable content */}
              <div className="info-content" ref={infoContentRef}>
                {uniqueSelectedFeatures.length > 0 ? (
                  <>
                    {uniqueSelectedFeatures.map(renderFeatureDetails)}
                    {/* Property Details - only show in full mode on mobile */}
                    {isMobile && mobileSheetState === MOBILE_SHEET.FULL && (
                      <div className="mobile-property-details">
                        <div className="mobile-property-details-header">
                          <h3>Property Details</h3>
                        </div>
                        
                        {propertyDetailsLoading && (
                          <div className="mobile-property-details-loading">
                            <div className="loading-spinner"></div>
                            <p>Loading additional property details...</p>
                          </div>
                        )}
                        
                        {propertyDetailsData?.data && (
                          <>
                            {/* Property Details Tab Content */}
                            {propertyDetailsData.data.property_details && propertyDetailsData.data.property_details.status !== 'error' && (
                              <div className="mobile-property-details-content">
                                {/* Value Breakdown */}
                                {(propertyDetailsData.data.property_details.data?.total_property_value || 
                                  propertyDetailsData.data.property_details.data?.land_value || 
                                  propertyDetailsData.data.property_details.data?.developments_value) && (
                                  <div className="mobile-value-breakdown">
                                    <h4>📊 Property Values</h4>
                                    <div className="mobile-value-grid">
                                      {propertyDetailsData.data.property_details.data?.total_property_value && (
                                        <div className="mobile-value-item">
                                          <strong>Total Property Value</strong>
                                          <span>{formatCurrency(propertyDetailsData.data.property_details.data.total_property_value)}</span>
                                        </div>
                                      )}
                                      {propertyDetailsData.data.property_details.data?.land_value && (
                                        <div className="mobile-value-item">
                                          <strong>Land Value</strong>
                                          <span>{formatCurrency(propertyDetailsData.data.property_details.data.land_value)}</span>
                                        </div>
                                      )}
                                      {propertyDetailsData.data.property_details.data?.developments_value && (
                                        <div className="mobile-value-item">
                                          <strong>Developments Value</strong>
                                          <span>{formatCurrency(propertyDetailsData.data.property_details.data.developments_value)}</span>
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                )}

                                {/* Acreage Breakdown */}
                                {(propertyDetailsData.data.property_details.data?.total_acreage || 
                                  propertyDetailsData.data.property_details.data?.acreage_breakdown) && (
                                  <div className="mobile-acreage-breakdown">
                                    <h4>📏 Acreage Information</h4>
                                    <div className="mobile-acreage-grid">
                                      {propertyDetailsData.data.property_details.data?.total_acreage && (
                                        <div className="mobile-acreage-item">
                                          <strong>Total Acreage</strong>
                                          <span>{propertyDetailsData.data.property_details.data.total_acreage} acres</span>
                                        </div>
                                      )}
                                      {propertyDetailsData.data.property_details.data?.acreage_breakdown && (
                                        <>
                                          {propertyDetailsData.data.property_details.data.acreage_breakdown.residential && 
                                           parseFloat(propertyDetailsData.data.property_details.data.acreage_breakdown.residential) > 0 && (
                                            <div className="mobile-acreage-item">
                                              <strong>Residential</strong>
                                              <span>{propertyDetailsData.data.property_details.data.acreage_breakdown.residential} acres</span>
                                            </div>
                                          )}
                                          {propertyDetailsData.data.property_details.data.acreage_breakdown.agricultural && 
                                           parseFloat(propertyDetailsData.data.property_details.data.acreage_breakdown.agricultural) > 0 && (
                                            <div className="mobile-acreage-item">
                                              <strong>Agricultural</strong>
                                              <span>{propertyDetailsData.data.property_details.data.acreage_breakdown.agricultural} acres</span>
                                            </div>
                                          )}
                                          {propertyDetailsData.data.property_details.data.acreage_breakdown.commercial && 
                                           parseFloat(propertyDetailsData.data.property_details.data.acreage_breakdown.commercial) > 0 && (
                                            <div className="mobile-acreage-item">
                                              <strong>Commercial</strong>
                                              <span>{propertyDetailsData.data.property_details.data.acreage_breakdown.commercial} acres</span>
                                            </div>
                                          )}
                                          {propertyDetailsData.data.property_details.data.acreage_breakdown.industrial && 
                                           parseFloat(propertyDetailsData.data.property_details.data.acreage_breakdown.industrial) > 0 && (
                                            <div className="mobile-acreage-item">
                                              <strong>Industrial</strong>
                                              <span>{propertyDetailsData.data.property_details.data.acreage_breakdown.industrial} acres</span>
                                            </div>
                                          )}
                                          {propertyDetailsData.data.property_details.data.acreage_breakdown.other && 
                                           parseFloat(propertyDetailsData.data.property_details.data.acreage_breakdown.other) > 0 && (
                                            <div className="mobile-acreage-item">
                                              <strong>Other</strong>
                                              <span>{propertyDetailsData.data.property_details.data.acreage_breakdown.other} acres</span>
                                            </div>
                                          )}
                                        </>
                                      )}
                                    </div>
                                  </div>
                                )}

                                {/* Legal Description */}
                                {propertyDetailsData.data.property_details.data?.legal_description && (
                                  <div className="mobile-property-info-section">
                                    <h4>Property Information</h4>
                                    <div className="mobile-property-info-item">
                                      <strong>Legal Description:</strong>
                                      <p>{propertyDetailsData.data.property_details.data.legal_description}</p>
                                    </div>
                                  </div>
                                )}
                            
                                {/* Developments */}
                                {propertyDetailsData.data.property_details.data?.developments && propertyDetailsData.data.property_details.data.developments.length > 0 && (
                                  <div className="mobile-developments-section">
                                    <h4>🏗️ Buildings & Developments ({propertyDetailsData.data.property_details.data.num_developments || propertyDetailsData.data.property_details.data.developments.length})</h4>
                                    {propertyDetailsData.data.property_details.data.developments.map((dev, idx) => (
                                      <div key={idx} className="mobile-development-card">
                                        <div className="mobile-development-header">
                                          <strong>Development {dev.id || idx + 1}</strong>
                                        </div>
                                        <div className="mobile-development-details">
                                          {dev.description && <div><strong>Description:</strong> {dev.description}</div>}
                                          {dev.stories && <div><strong>Stories:</strong> {dev.stories}</div>}
                                          {dev.sq_ft && <div><strong>Square Feet:</strong> {dev.sq_ft.toLocaleString()}</div>}
                                          {dev.exterior && <div><strong>Exterior:</strong> {dev.exterior}</div>}
                                          {dev.year_built && <div><strong>Year Built:</strong> {dev.year_built}</div>}
                                          {dev.bedrooms && <div><strong>Bedrooms:</strong> {dev.bedrooms}</div>}
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            )}
                        
                        {/* Tax Details Tab Content */}
                        {propertyDetailsData?.data?.tax && propertyDetailsData.data.tax.status !== 'error' && propertyDetailsData.data.tax.data && (
                          <div className="mobile-tax-section">
                            <h4>💰 Tax Information</h4>
                            <div className="mobile-tax-grid">
                              {propertyDetailsData.data.tax.data.tax_district && (
                                <div className="mobile-tax-item">
                                  <strong>Tax District:</strong>
                                  <span>{propertyDetailsData.data.tax.data.tax_district}</span>
                                </div>
                              )}
                              {propertyDetailsData.data.tax.data.mill_levy && (
                                <div className="mobile-tax-item">
                                  <strong>Mill Levy:</strong>
                                  <span>{propertyDetailsData.data.tax.data.mill_levy}</span>
                                </div>
                              )}
                              {propertyDetailsData.data.tax.data.status && (
                                <div className="mobile-tax-item">
                                  <strong>Status:</strong>
                                  <span className={`mobile-tax-status ${propertyDetailsData.data.tax.data.status.toLowerCase() === 'paid' ? 'paid' : 'unpaid'}`}>
                                    {propertyDetailsData.data.tax.data.status.toUpperCase()}
                                  </span>
                                </div>
                              )}
                              {propertyDetailsData.data.tax.data.amount_due && (
                                <div className="mobile-tax-item">
                                  <strong>Amount Due:</strong>
                                  <span>{formatCurrency(propertyDetailsData.data.tax.data.amount_due)}</span>
                                </div>
                              )}
                              {propertyDetailsData.data.tax.data.total_tax_levied && (
                                <div className="mobile-tax-item">
                                  <strong>Total Tax Levied:</strong>
                                  <span>{formatCurrency(propertyDetailsData.data.tax.data.total_tax_levied)}</span>
                                </div>
                              )}
                              {propertyDetailsData.data.tax.data.tax_received && (
                                <div className="mobile-tax-item">
                                  <strong>Tax Received:</strong>
                                  <span>{formatCurrency(propertyDetailsData.data.tax.data.tax_received)}</span>
                                </div>
                              )}
                            </div>
                            
                            {/* Tax Breakdown */}
                            {propertyDetailsData.data.tax.data.first_half && propertyDetailsData.data.tax.data.second_half && (
                              <div className="mobile-tax-breakdown">
                                <h5>Current Year Breakdown</h5>
                                <div className="mobile-tax-breakdown-grid">
                                  <div className="mobile-tax-half">
                                    <strong>First Half</strong>
                                    {propertyDetailsData.data.tax.data.first_half_due_date && (
                                      <div><strong>Due Date:</strong> {formatDate(propertyDetailsData.data.tax.data.first_half_due_date)}</div>
                                    )}
                                    {propertyDetailsData.data.tax.data.first_half?.levied && (
                                      <div><strong>Levied:</strong> {formatCurrency(propertyDetailsData.data.tax.data.first_half.levied)}</div>
                                    )}
                                    {propertyDetailsData.data.tax.data.first_half?.paid && (
                                      <div><strong>Paid:</strong> {formatCurrency(propertyDetailsData.data.tax.data.first_half.paid)}</div>
                                    )}
                                    {propertyDetailsData.data.tax.data.first_half?.balance && (
                                      <div><strong>Balance:</strong> {formatCurrency(propertyDetailsData.data.tax.data.first_half.balance)}</div>
                                    )}
                                  </div>
                                  <div className="mobile-tax-half">
                                    <strong>Second Half</strong>
                                    {propertyDetailsData.data.tax.data.second_half_due_date && (
                                      <div><strong>Due Date:</strong> {formatDate(propertyDetailsData.data.tax.data.second_half_due_date)}</div>
                                    )}
                                    {propertyDetailsData.data.tax.data.second_half?.levied && (
                                      <div><strong>Levied:</strong> {formatCurrency(propertyDetailsData.data.tax.data.second_half.levied)}</div>
                                    )}
                                    {propertyDetailsData.data.tax.data.second_half?.paid && (
                                      <div><strong>Paid:</strong> {formatCurrency(propertyDetailsData.data.tax.data.second_half.paid)}</div>
                                    )}
                                    {propertyDetailsData.data.tax.data.second_half?.balance && (
                                      <div><strong>Balance:</strong> {formatCurrency(propertyDetailsData.data.tax.data.second_half.balance)}</div>
                                    )}
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                          </>
                        )}
                      </div>
                    )}
                  </>
                ) : (
                  <p>No features selected. Click on features to see their details.</p>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    )}
  </div>
    </>
);
});

export default SidePanel;
