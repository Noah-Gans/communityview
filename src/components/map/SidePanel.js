import React, { useState, useEffect, useCallback, useRef, memo, useMemo } from 'react';
import './SidePanel.css';
import { legends } from '../../assets/legends';
import { layerNameMappings } from './layerMappings'; // Import layer mappings
import {
  getFeatureSelectionId,
  getHostedLayerDisplayTitle,
  getHostedLayerFieldValue,
  getProp,
  HOSTED_LAYER_INFO_FIELDS,
  resolveHostedMapLayerFromFeature,
} from '../../utils/hostedMapLayerConfig';
import { useMapContext } from '../../pages/MapContext';
import { useTutorialWalkthrough } from '../../contexts/TutorialWalkthroughContext';
import { useNavigate, useLocation } from 'react-router-dom';
import * as turf from '@turf/turf';
import { getParcelLinks } from '../../utils/parcelLinks';
import { parseGFI, getCountyCodeFromFeature, getCountyParcelIdFromFeature } from '../../utils/parseGFI';
import PrintEditorContent from '../../pages/print/PrintEditorContent';
import { useUser } from '../../contexts/UserContext';
import { uploadMapPhoto } from '../../utils/mapPhotoUpload';
import {
  galleryItemToSrc,
  getPhotosFromElement,
  validateMapPhotoFile,
} from '../../utils/mapPhotoStorage';
import { fetchRegridParcelDetailCached } from '../../utils/regridParcelApi';
import { fetchSoilMapUnitByMukey } from '../../utils/soilMapUnitApi';
import RegridParcelFeatureDetails from './RegridParcelFeatureDetails';
import { REGRID_BATCH_REPORTS_ENABLED } from '../../config/featureFlags';

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
  printBasemapOptions = [],
  currentBasemapId = '',
  onPrintBasemapSelect,
  onOpenLayersTabForPrint,
  onCreateBoundaryFromRegridParcel,
  onZoomToPrintElement = () => {},
}) => {
  console.log("SideTab is: ", activeSidePanelTab)
  // States to manage expanded/collapsed sections
  const { activeTab, setActiveTab } = useMapContext();

  const getIsMobile = () => (typeof window !== 'undefined' ? window.innerWidth <= 768 : false);
  const [isMobile, setIsMobile] = useState(getIsMobile);
  const [mobileSheetState, setMobileSheetState] = useState(MOBILE_SHEET.HIDDEN);
  const [isOwnershipOpen, setIsOwnershipOpen] = useState(true);
  const [isEnvironmentOpen, setIsEnvironmentOpen] = useState(true);
  const [isBoundariesOpen, setIsBoundariesOpen] = useState(false);
  const [copiedFieldId, setCopiedFieldId] = useState(null); // Track which field was copied
  const [regridDetailedData, setRegridDetailedData] = useState({}); // Store detailed parcel data by ll_uuid
  const [regridLoadingStates, setRegridLoadingStates] = useState({}); // Track loading state by ll_uuid
  const [regridDetailErrors, setRegridDetailErrors] = useState({}); // Fetch errors by parcel id
  const [regridDetailFailed, setRegridDetailFailed] = useState({}); // Stop retrying after first failure
  const [soilMapUnitDetails, setSoilMapUnitDetails] = useState({});
  const [soilMapUnitLoading, setSoilMapUnitLoading] = useState({});
  const soilMapUnitFetchStartedRef = useRef(new Set());
  const [collapsedCategories, setCollapsedCategories] = useState({}); // Track collapsed state for detail categories
  const {setHoveredFeatureId, setGlobalActiveTab, setIsFilterTriggered, layerOrder, setLayerOrder, layerLabels, toggleLayerLabels } = useMapContext();
  const { isActive: tutorialActive, currentStep: tutorialStep, next: goToNextTutorialStep } = useTutorialWalkthrough();
  const collapsedByInteractionRef = useRef(false);
  const lastSelectedFeatureRef = useRef(null);
  const prevIsOpenRef = useRef(isOpen);
  const infoContentRef = useRef(null);
  const layersContentRef = useRef(null);
  const sidePanelRef = useRef(null);
  const activeScrollContainerRef = useRef(null);
  const autoAdvancedPanelOpenRef = useRef(false);
  const autoAdvancedLayersTabRef = useRef(false);
  const autoAdvancedPublicLandRef = useRef(false);
  const navigate = useNavigate();
  const location = useLocation();
  const {
    isPrinting,
    activePrintTool,
    setActivePrintTool,
    printElements,
    updatePrintElement,
    setSelectedPrintElement,
    deletePrintElement,
    printMapId,
  } = useMapContext();
  const { user } = useUser();
  const [printGalleryItems, setPrintGalleryItems] = useState([]);
  const [printGalleryUploading, setPrintGalleryUploading] = useState(false);
  const printGalleryItemsWithFeaturePhotos = useMemo(() => {
    const fromFeatures = [];
    (printElements || []).forEach((el) => {
      if (!el || el.hiddenOnMap) return;
      getPhotosFromElement(el).forEach((photo, idx) => {
        fromFeatures.push({
          id: `feat_${el.id}_${idx}`,
          name: `${(el.label && String(el.label).trim()) || el.type || 'Feature'} ${idx + 1}`,
          url: photo.url,
          storagePath: photo.storagePath,
        });
      });
    });
    const merged = [...fromFeatures, ...(printGalleryItems || [])];
    const seen = new Set();
    return merged.filter((item) => {
      const key = galleryItemToSrc(item);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [printElements, printGalleryItems]);

  const handlePrintGalleryUpload = useCallback(
    async (event) => {
      const files = Array.from(event.target.files || []);
      event.target.value = '';
      if (!files.length) return;
      if (!user?.uid) {
        window.alert('Sign in to upload images.');
        return;
      }
      const imageFiles = files.filter((f) => f.type?.startsWith('image/'));
      if (!imageFiles.length) {
        window.alert('Please select image files.');
        return;
      }
      for (const file of imageFiles) {
        const err = validateMapPhotoFile(file);
        if (err) {
          window.alert(err);
          return;
        }
      }
      setPrintGalleryUploading(true);
      try {
        const uploaded = [];
        for (const file of imageFiles) {
          const { url, storagePath } = await uploadMapPhoto(user.uid, file, { mapId: printMapId });
          uploaded.push({
            id: `gal_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
            name: file.name || 'Image',
            url,
            storagePath,
          });
        }
        setPrintGalleryItems((prev) => [...prev, ...uploaded]);
      } catch (err) {
        console.error('Gallery upload failed:', err);
        window.alert(err?.message || 'Failed to upload image.');
      } finally {
        setPrintGalleryUploading(false);
      }
    },
    [user, printMapId]
  );

  /**
   * True when the full map (same Map instance) is the focus — includes /print (Maps / map builder),
   * not only /map. Otherwise parcel actions stay hidden on /print.
   */
  const isMapAppView =
    location.pathname === '/map' ||
    location.pathname === '/' ||
    location.pathname === '/print' ||
    activeTab === 'map' ||
    activeTab === 'print';

  const showPrintTab = isPrinting;

  useEffect(() => {
    if (!tutorialActive || !tutorialStep) {
      autoAdvancedPanelOpenRef.current = false;
      autoAdvancedLayersTabRef.current = false;
      autoAdvancedPublicLandRef.current = false;
      return;
    }

    if (tutorialStep.id !== 'open-side-panel') {
      autoAdvancedPanelOpenRef.current = false;
    } else if (isOpen && !autoAdvancedPanelOpenRef.current) {
      autoAdvancedPanelOpenRef.current = true;
      window.setTimeout(() => {
        goToNextTutorialStep();
      }, 260);
    }

    if (tutorialStep.id !== 'side-layers') {
      autoAdvancedLayersTabRef.current = false;
    } else if (activeSidePanelTab === 'layers' && !autoAdvancedLayersTabRef.current) {
      autoAdvancedLayersTabRef.current = true;
      goToNextTutorialStep();
    }

    if (tutorialStep.id !== 'public-land-layer') {
      autoAdvancedPublicLandRef.current = false;
    } else {
      if (!isOwnershipOpen) setIsOwnershipOpen(true);
      if (!isEnvironmentOpen) setIsEnvironmentOpen(true);
      if (
        !!layerStatus.public_land &&
        !!layerLabels.ownership &&
        !autoAdvancedPublicLandRef.current
      ) {
        autoAdvancedPublicLandRef.current = true;
        goToNextTutorialStep();
      }
    }
  }, [
    tutorialActive,
    tutorialStep,
    isOpen,
    activeSidePanelTab,
    isOwnershipOpen,
    isEnvironmentOpen,
    layerStatus.public_land,
    layerLabels.ownership,
    goToNextTutorialStep,
  ]);

  // State to manage legend visibility for each layer
  const [isLegendOpen, setIsLegendOpen] = useState({});
  
  // State for property details data (mobile only)
  const [propertyDetailsData, setPropertyDetailsData] = useState(null);
  const [propertyDetailsLoading, setPropertyDetailsLoading] = useState(false);

  // Fetch detailed Regrid parcel data from API
  const fetchRegridParcelDetails = useCallback(async (parcelId, parcelSeed = {}) => {
    if (!parcelId && !parcelSeed?.path) {
      console.error('No parcel id or path provided for Regrid parcel details');
      return;
    }

    const cacheKey = parcelId || parcelSeed.path;

    if (regridDetailedData[cacheKey] || regridDetailFailed[cacheKey]) {
      return;
    }

    setRegridLoadingStates((prev) => ({ ...prev, [cacheKey]: true }));
    setRegridDetailErrors((prev) => {
      const next = { ...prev };
      delete next[cacheKey];
      return next;
    });

    try {
      const finalProperties = await fetchRegridParcelDetailCached(parcelId, {
        preset: 'sidePanel',
        path: parcelSeed.path,
        seed: parcelSeed,
      });

      if (finalProperties) {
        setRegridDetailedData((prev) => ({
          ...prev,
          [cacheKey]: finalProperties,
        }));
        setRegridDetailFailed((prev) => {
          const next = { ...prev };
          delete next[cacheKey];
          return next;
        });
      } else {
        const msg = 'No parcel data returned from Regrid. Try again or check your Regrid API access.';
        setRegridDetailErrors((prev) => ({ ...prev, [cacheKey]: msg }));
        setRegridDetailFailed((prev) => ({ ...prev, [cacheKey]: true }));
      }
    } catch (error) {
      console.error('Error fetching Regrid parcel details:', error);
      setRegridDetailErrors((prev) => ({
        ...prev,
        [cacheKey]: error?.message || 'Failed to load property details.',
      }));
      setRegridDetailFailed((prev) => ({ ...prev, [cacheKey]: true }));
    } finally {
      setRegridLoadingStates((prev) => ({ ...prev, [cacheKey]: false }));
    }
  }, [regridDetailedData, regridDetailFailed]);

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
    if (section === 'Ownership') {
      setIsOwnershipOpen(!isOwnershipOpen);
    } else if (section === 'Environment') {
      setIsEnvironmentOpen(!isEnvironmentOpen);
    } else if (section === 'Boundaries') {
      setIsBoundariesOpen(!isBoundariesOpen);
    }
  };

  const renderLayerCheckbox = (layerName, tourAttrs = {}) => (
    <li key={layerName}>
      <div className="layer-item-container">
        <label className="layer-checkbox-label">
          <input
            type="checkbox"
            checked={layerStatus[layerName] || false}
            onChange={() => handleLayerSelection(layerName)}
            {...tourAttrs}
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
          <label
            className="owner-name-toggle"
            title="Show owner names on parcels"
            data-tour="ownership-label-toggle"
          >
            <span className="owner-name-toggle__text">Owner name</span>
            <span className="ios-switch">
              <input
                type="checkbox"
                className="ios-switch__input"
                checked={Boolean(layerLabels[layerName])}
                onChange={() => toggleLayerLabels(layerName)}
                aria-label="Owner name"
              />
              <span className="ios-switch__track" aria-hidden="true" />
            </span>
          </label>
        )}
      </div>
      {renderLegend(layerName, getLayerType(layerName))}
    </li>
  );
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

  const getFeatureIdentifier = (feature) => getFeatureSelectionId(feature);

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

  /** First selected Regrid parcel with polygon geometry — used for “Create boundary” in map maker (Print tab). */
  const regridParcelForPrintBoundary = useMemo(() => {
    for (const f of uniqueSelectedFeatures) {
      const isRegridVectorParcel =
        f.layer?.id === 'regrid-parcels-outline' || f.layer?.id === 'regrid-parcels-layer';
      const ok =
        f.geometry &&
        (f.geometry.type === 'Polygon' || f.geometry.type === 'MultiPolygon') &&
        (isRegridVectorParcel || Boolean(f.properties?.ll_uuid));
      if (ok) return f;
    }
    return null;
  }, [uniqueSelectedFeatures]);

  /** SSURGO map unit names (MUNAME) are not in MVT tiles — resolve from USDA SDA by MUKEY. */
  useEffect(() => {
    uniqueSelectedFeatures.forEach((feature) => {
      if (resolveHostedMapLayerFromFeature(feature) !== 'soil') return;
      const mukey = getProp(feature, ['MUKEY', 'mukey']);
      if (!mukey || soilMapUnitFetchStartedRef.current.has(mukey)) return;
      soilMapUnitFetchStartedRef.current.add(mukey);
      setSoilMapUnitLoading((prev) => ({ ...prev, [mukey]: true }));
      fetchSoilMapUnitByMukey(mukey)
        .then((details) => {
          if (details) {
            setSoilMapUnitDetails((prev) => ({ ...prev, [mukey]: details }));
          }
        })
        .finally(() => {
          setSoilMapUnitLoading((prev) => {
            const next = { ...prev };
            delete next[mukey];
            return next;
          });
        });
    });
  }, [uniqueSelectedFeatures]);
  
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
    const isRegridParcel = feature.layer?.id === 'regrid-parcels-outline' ||
                          feature.properties.ll_uuid || 
                          feature.properties.parcelnumb ||
                          feature.properties.fid;
    const isOwnershipFeature = feature.properties.GFI && (feature.properties.owner || feature.properties.owner_name);
    const isOwnershipAddress = parsedDescription.msag_zip || parsedDescription.st_name;
    const hostedMapLayer = resolveHostedMapLayerFromFeature(feature);
    const isPublicLandFeature =
      !hostedMapLayer &&
      (feature.properties.Own_Name ||
        feature.properties.own_name ||
        feature.properties.SURFACE ||
        parsedDescription.holdagency ||
        parsedDescription.sma_id);
    const isPrecinct = feature.properties.objectid || feature.pollingpla
    const isFEMA = feature.properties.FLD_AR_ID || feature.properties.FLD_ZONE
    const featureId = parsedDescription.pidn || feature.properties.pidn || feature.properties.parcelnumb || feature.properties.ll_uuid; // Use the unique ID from the feature
    const soilMukey =
      hostedMapLayer === 'soil' ? getProp(feature, ['MUKEY', 'mukey']) : null;
    const soilDetails = soilMukey ? soilMapUnitDetails[soilMukey] : null;
    const soilLoading = soilMukey ? Boolean(soilMapUnitLoading[soilMukey]) : false;
    console.log(isPublicLandFeature)
    console.log(feature.properties)
    
    // Helper function to copy value to clipboard
    const copyToClipboard = async (text, fieldId) => {
      try {
        await navigator.clipboard.writeText(text);
        setCopiedFieldId(fieldId);
        // Reset after 2 seconds
        setTimeout(() => {
          setCopiedFieldId(null);
        }, 2000);
      } catch (err) {
        console.error('Failed to copy: ', err);
      }
    };
    
    // Helper function to render a field with copy button
    const renderField = (label, rawValue, displayValue = null, fieldOptions = {}) => {
      const valueToCopy = rawValue || 'N/A';
      const valueToDisplay = displayValue !== null ? displayValue : valueToCopy;
      const fieldId = `${feature.properties.GFI || featureId || index}-${label}`;
      const isCopied = copiedFieldId === fieldId;
      const multiline = Boolean(fieldOptions.multiline);
      const Icon = fieldOptions.icon || null;

      return (
        <div className={`feature-field-row${multiline ? ' feature-field-row--multiline' : ''}`}>
          <div className="feature-field-label">
            {Icon && (
              <span className="feature-field-icon" aria-hidden="true">
                <Icon />
              </span>
            )}
            <strong>{label}</strong>
          </div>
          <span className={`field-value${multiline ? ' field-value--multiline' : ''}`}>{valueToDisplay}</span>
          <div className="copy-button-wrapper">
            <button
              className="copy-field-button"
              onClick={() => copyToClipboard(valueToCopy, fieldId)}
              aria-label={`Copy ${label} to clipboard`}
            >
              📋
            </button>
            <span className={`copy-tooltip ${isCopied ? 'copied' : ''}`}>
              {isCopied ? 'Copied!' : 'Copy to clipboard'}
            </span>
          </div>
        </div>
      );
    };
    
    return (
      <div
        key={index}
        className="feature-details"
        data-tour={index === 0 ? 'info-feature-card' : undefined}
        onMouseEnter={() =>
          setHoveredFeatureId(
            getFeatureSelectionId(feature) ||
              feature.properties.GFI ||
              feature.properties.ll_uuid ||
              feature.properties.parcelnumb
          )
        }
        onMouseLeave={() => setHoveredFeatureId(null)}
      >
        {hostedMapLayer ? (
          <>
            <div className="feature-header">
              <h3 className="feature-owner-name">
                {hostedMapLayer === 'soil'
                  ? soilDetails?.muname ||
                    (soilLoading
                      ? 'Loading map unit…'
                      : getHostedLayerDisplayTitle(feature, hostedMapLayer, {
                          soilByMukey: soilMapUnitDetails,
                        }))
                  : layerNameMappings[hostedMapLayer] || hostedMapLayer}
              </h3>
              <div className="feature-address">
                {hostedMapLayer === 'soil'
                  ? [
                      getProp(feature, ['MUSYM', 'musym']) &&
                        `Symbol ${getProp(feature, ['MUSYM', 'musym'])}`,
                      soilMukey && `MUKEY ${soilMukey}`,
                      getProp(feature, ['AREASYMBOL', 'areasymbol']),
                    ]
                      .filter(Boolean)
                      .join(' · ')
                  : getHostedLayerDisplayTitle(feature, hostedMapLayer, {
                      soilByMukey: soilMapUnitDetails,
                    })}
              </div>
            </div>
            {onZoomToFeature && (
              <div className="action-buttons-row">
                <button
                  type="button"
                  className="sp-map-button sp-button-half"
                  onClick={() => onZoomToFeature(feature)}
                  title="Zoom to this feature on the map"
                >
                  Zoom to
                </button>
              </div>
            )}
            {(HOSTED_LAYER_INFO_FIELDS[hostedMapLayer] || []).map(({ label, keys, format }) => {
              const value = getHostedLayerFieldValue(feature, { label, keys, format });
              if (!value) return null;
              return renderField(`${label}:`, value);
            })}
            {hostedMapLayer === 'public_land' &&
              renderField('Area:', calculateFeatureArea(feature))}
            {hostedMapLayer === 'soil' &&
              getProp(feature, ['drainagecl', 'DRAINAGECL']) &&
              renderField('Drainage class:', getProp(feature, ['drainagecl', 'DRAINAGECL']))}
          </>
        ) : isRegridParcel ? (
          (() => {
            const regridLlUuid = feature.properties.ll_uuid || null;
            const regridCacheKey =
              regridLlUuid ||
              feature.properties.path ||
              feature.properties.global_parcel_uid ||
              feature.properties.parcelnumb ||
              null;
            return (
          <RegridParcelFeatureDetails
            feature={feature}
            index={index}
            ll_uuid={regridLlUuid}
            parcelCacheKey={regridCacheKey}
            detailedData={regridCacheKey ? regridDetailedData[regridCacheKey] : null}
            detailError={regridCacheKey ? regridDetailErrors[regridCacheKey] : null}
            detailFetchFailed={regridCacheKey ? !!regridDetailFailed[regridCacheKey] : false}
            isLoading={regridCacheKey ? !!regridLoadingStates[regridCacheKey] : false}
            hasDetailedData={regridCacheKey ? !!regridDetailedData[regridCacheKey] : false}
            collapsedCategories={collapsedCategories}
            setCollapsedCategories={setCollapsedCategories}
            fetchRegridParcelDetails={fetchRegridParcelDetails}
            renderField={renderField}
            onZoomToFeature={onZoomToFeature}
            handleCreateMap={handleCreateMap}
            isMobile={isMobile}
            isMapAppView={isMapAppView}
          />
            );
          })()
        ) : isOwnershipFeature ? (
          <>
            {!isMobile && (
              <>
                <div className="feature-header">
                  <h3 className="feature-owner-name">{feature.properties.owner || feature.properties.owner_name || 'N/A'}</h3>
                  <div className="feature-address">{feature.properties.physical || 'N/A'}</div>
                </div>
                <div className="action-buttons-row">
                  {onZoomToFeature && (
                    <button
                      className="sp-map-button sp-button-half"
                      onClick={() => onZoomToFeature(feature)}
                      title="Zoom to this feature on the map"
                    >
                      Zoom to
                    </button>
                  )}
                  <button 
                    className="sp-property-button sp-button-half"
                    onClick={() => handleCreateMap(feature)}
                    title="Create a map from this parcel"
                  >
                    Create Map
                  </button>
                </div>
              </>
            )}
            {renderField('Mailing Address:', feature.properties.mail || 'N/A')}
            {renderField('Property Value:', feature.properties.property_value || 'N/A', (() => {
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
            })())}
            {renderField('County Parcel ID:', countyParcelId || 'N/A')}
            {(!isMobile || mobileSheetState !== MOBILE_SHEET.PEEK) && (
              <>
                {renderField('Acreage:', feature.properties.acre ? feature.properties.acre : 'N/A', feature.properties.acre ? `${parseFloat(feature.properties.acre).toFixed(2)} acres` : 'N/A')}
              </>
            )}
            {/* Removed clerk records link since it's now in the PropertyDetailsPopup */}
          </>
        ) : isOwnershipAddress ? (
          <>
            {renderField('Street Address:', parsedDescription.st_address || 'N/A')}
            {renderField('City:', parsedDescription.msag_city || 'N/A')}
            {renderField('State:', parsedDescription.state || 'N/A')}
            {renderField('ZIP Code:', parsedDescription.msag_zip || 'N/A')}
            {renderField('PIDN:', parsedDescription.pidn || 'N/A')}
          </>
        ) : isPublicLandFeature ? (
          <>
            {renderField(
              'Owner:',
              feature.properties.Own_Name ||
                feature.properties.own_name ||
                feature.properties.SURFACE ||
                'N/A'
            )}
            {renderField('Area:', feature ? calculateFeatureArea(feature) : 'N/A')}
            
  
            {/* Description */}
            {parsedDescription.descript && (
              renderField('Description:', parsedDescription.descript)
            )}
          </>
        ) : isPrecinct ? (
          <>
            {renderField('House:', feature.properties.house || 'N/A')}
            {renderField('Polling Place:', feature.properties.pollingpla || 'N/A')}
            {renderField('Precinct:', feature.properties.precinct || 'N/A')}
            {renderField('Senate:', feature.properties.senate || 'N/A')}

  
            {/* Description */}
            {parsedDescription.descript && (
              renderField('Description:', parsedDescription.descript)
            )}
          </>
        ) : isFEMA ? (
          <>
            {renderField('Flood Zone Code:', feature.properties.FLD_ZONE || 'N/A')}
            {/* Description */}
            {parsedDescription.descript && (
              renderField('Description:', parsedDescription.descript)
            )}
          </>
        ): (
          <>
            {/* Render generic attributes if the feature does not match a known type */}
            {Object.keys(parsedDescription).length > 0 ? (
              Object.entries(parsedDescription).slice(0, 5).map(([key, value]) => (
                renderField(key.replace(/_/g, ' ') + ':', value || 'N/A')
              ))
            ) : (
              <p>No detailed information available.</p>
            )}
          </>
        )}
        <hr className="feature-separator" />
      </div>
    );
  };
  
  const onReportBuilderClick = () => {
    setIsFilterTriggered(false);
    setActiveTab('report');
    navigate('/report');
  };

  const handleCreateMap = useCallback((featureForMap) => {
    if (onZoomToFeature && featureForMap) {
      onZoomToFeature(featureForMap);
    }
    setActiveTab('print');
    navigate('/print');
  }, [navigate, onZoomToFeature, setActiveTab]);
  
  const toggleLegend = (layerName) => {
    setIsLegendOpen((prev) => ({
      ...prev,
      [layerName]: !prev[layerName],
    }));
  };

  const getLayerType = (layerName) => {
    if (layerName === 'surface_water') return 'fill';
    return 'fill';
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
        const stripeLegend =
          item.pattern === 'lavender-stripes'
            ? {
                backgroundColor: 'transparent',
                backgroundImage: `repeating-linear-gradient(-45deg, ${item.color} 0, ${item.color} 2px, transparent 2px, transparent 6px)`,
              }
            : item.pattern === 'white-lavender-stripes' || item.pattern === 'white-green-stripes'
              ? {
                  backgroundColor: '#ffffff',
                  backgroundImage: `repeating-linear-gradient(-45deg, ${item.color} 0, ${item.color} 2px, #ffffff 2px, #ffffff 6px)`,
                }
              : { backgroundColor: item.color };
        return (
          <span
            style={{
              ...legendStyle,
              width: '14px',
              height: '14px',
              ...stripeLegend,
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

  /** Open the panel and show Info when the user selects a map feature (desktop + mobile). */
  useEffect(() => {
    if (uniqueSelectedFeatures.length === 0) {
      lastSelectedFeatureRef.current = null;
      return;
    }

    const primaryFeature = uniqueSelectedFeatures[0];
    const featureKey =
      getFeatureSelectionId(primaryFeature) ??
      primaryFeature?.properties?.GFI ??
      primaryFeature?.id ??
      JSON.stringify(primaryFeature?.properties ?? {});

    if (featureKey === lastSelectedFeatureRef.current) {
      return;
    }

    lastSelectedFeatureRef.current = featureKey;

    if (!isOpen) {
      togglePanel();
    }

    if (isMobile) {
      setActiveSidePanelTab('info');
      setSheetState(MOBILE_SHEET.PEEK);
      collapsedByInteractionRef.current = false;
    }
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
      return target.closest('.info-tab, .layers-tab');
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
  if (isPrinting) {
    sidePanelClassNames.push('map-maker');
  }
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
      <div
        ref={sidePanelRef}
        className={sidePanelClassNames.join(' ')}
        style={panelStyle}
        data-tour="side-panel-shell"
      >
        {!isMobile && (
      <button className="toggle-btn" onClick={togglePanel} data-tour="side-panel-toggle">
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
        <div className={`content ${activeSidePanelTab === 'print' && showPrintTab ? 'print-content-with-footer' : ''}`}>
          <div
            className={`tab-buttons${showPrintTab ? ' tab-buttons--map-maker' : ''}`}
            data-tour="side-panel-tabs"
          >
            {showPrintTab ? (
              <>
                <button
                  type="button"
                  className={activeSidePanelTab === 'layers' ? 'active' : ''}
                  onClick={() => setActiveSidePanelTab('layers')}
                >
                  Layers
                </button>
                <button
                  type="button"
                  className={activeSidePanelTab === 'info' ? 'active' : ''}
                  onClick={() => setActiveSidePanelTab('info')}
                >
                  Info
                </button>
                <button
                  type="button"
                  className={activeSidePanelTab === 'print' ? 'active' : ''}
                  onClick={() => setActiveSidePanelTab('print')}
                >
                  Editor
                </button>
              </>
            ) : (
              <>
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
              </>
            )}
          </div>
          <div className="tab-content">
            {activeSidePanelTab === 'print' && showPrintTab && (
              <div className="layers-tab" ref={layersContentRef}>
                {isPrinting &&
                  isMapAppView &&
                  regridParcelForPrintBoundary &&
                  onCreateBoundaryFromRegridParcel && (
                    <div className="print-mapmaker-parcel-strip">
                      <div className="print-mapmaker-parcel-strip-text">
                        <strong>Selected parcel</strong>
                        <span>
                          {regridParcelForPrintBoundary.properties?.address ||
                            regridParcelForPrintBoundary.properties?.parcelnumb ||
                            regridParcelForPrintBoundary.properties?.ll_uuid ||
                            'Parcel'}
                        </span>
                      </div>
                      <button
                        type="button"
                        className="sp-map-button print-mapmaker-boundary-btn"
                        onClick={() =>
                          onCreateBoundaryFromRegridParcel(regridParcelForPrintBoundary)
                        }
                        title="Add the clicked parcel outline as a boundary on the map"
                      >
                        Create boundary
                      </button>
                    </div>
                  )}
                <PrintEditorContent
                  currentMapId={null}
                  activePrintTool={activePrintTool}
                  setActivePrintTool={setActivePrintTool}
                  printBasemapOptions={printBasemapOptions}
                  currentBasemapId={currentBasemapId}
                  onPrintBasemapSelect={onPrintBasemapSelect}
                  onOpenLayersTabForPrint={
                    onOpenLayersTabForPrint || (() => setActiveSidePanelTab('layers'))
                  }
                  includePrintTabExtras
                  printElements={printElements}
                  updatePrintElement={updatePrintElement}
                  setSelectedPrintElement={setSelectedPrintElement}
                  onZoomToPrintElement={onZoomToPrintElement}
                  deletePrintElement={deletePrintElement}
                  printGalleryItems={printGalleryItemsWithFeaturePhotos}
                  onPrintGalleryUpload={handlePrintGalleryUpload}
                  printGalleryUploading={printGalleryUploading}
                />
              </div>
            )}
            {activeSidePanelTab === 'layers' && (
              <div className="layers-tab" ref={layersContentRef}>
                <h2>Layers</h2>

                {/* Ownership */}
                <div className="layer-category" data-tour="ownership-category">
                  <button onClick={() => toggleSection('Ownership')}>
                    {isOwnershipOpen ? '-' : '+'} Ownership
                  </button>
                  {isOwnershipOpen && (
                    <ul>
                      {renderLayerCheckbox('ownership', { 'data-tour': 'ownership-checkbox' })}
                    </ul>
                  )}
                </div>

                {/* Environment & land cover */}
                <div className="layer-category" data-tour="public-land-category">
                  <button data-tour="public-land-toggle" onClick={() => toggleSection('Environment')}>
                    {isEnvironmentOpen ? '-' : '+'} Environment
                  </button>
                  {isEnvironmentOpen && (
                    <ul>
                      {renderLayerCheckbox('public_land', {
                        'data-tour': 'public-land-checkbox',
                      })}
                      {renderLayerCheckbox('conservation_easements')}
                      {renderLayerCheckbox('soil')}
                      {renderLayerCheckbox('surface_water')}
                      {renderLayerCheckbox('wetlands')}
                      {renderLayerCheckbox('opportunity_zones')}
                      {renderLayerCheckbox('principal_aquifers')}
                      {renderLayerCheckbox('transmission_lines')}
                      {renderLayerCheckbox('wildfire_hazard')}
                    </ul>
                  )}
                </div>

                <div className="layer-category">
                  <button onClick={() => toggleSection('Boundaries')}>
                    {isBoundariesOpen ? '-' : '+'} Boundaries
                  </button>
                  {isBoundariesOpen && (
                    <ul>
                      {renderLayerCheckbox('boundaries_counties')}
                      {renderLayerCheckbox('boundaries_congressional')}
                      {renderLayerCheckbox('boundaries_places')}
                      {renderLayerCheckbox('boundaries_urban_areas')}
                      {renderLayerCheckbox('boundaries_tribal_lands')}
                    </ul>
                  )}
                </div>

              </div>
            )}

            {activeSidePanelTab === 'info' && (
              <div className="info-tab" ref={infoContentRef} data-tour="info-tab-scroll">
              {/* Fixed header for button */}
              {REGRID_BATCH_REPORTS_ENABLED && uniqueSelectedFeatures.length > 1 && (
                <div className="info-header">
                  <div className="sp-report-builder-container">
                    <button
                      type="button"
                      className="sp-report-builder-button"
                      onClick={onReportBuilderClick}
                    >
                      See features in Report Builder
                    </button>
                  </div>
                </div>
              )}
              {/* Scrollable content */}
              <div className="info-content">
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
