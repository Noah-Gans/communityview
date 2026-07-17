import React, { useState, useEffect, useCallback, useRef, memo, useMemo } from 'react';
import './SidePanel.css';
import { legends, LEGEND_CLICK_FOR_DETAILS_LAYERS, LEGEND_AUTO_EXPAND_MAX_ITEMS } from '../../assets/legends';
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
import { uploadMapPhoto, deleteMapPhoto } from '../../utils/mapPhotoUpload';
import {
  galleryItemToSrc,
  getPhotosFromElement,
  validateMapPhotoFile,
} from '../../utils/mapPhotoStorage';
import {
  extractImageFilesFromDataTransfer,
  extractImageUrlsFromDataTransfer,
  fetchImageUrlAsFile,
} from '../../utils/listingPhotoDrop';
import { accountAgentDefaults } from '../../utils/agentProfile';
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
  const {
    activeTab,
    setActiveTab,
    pendingCreateMapFromFeatureRef,
    pendingCreateMapBasemapIdRef,
    activeBasemapIdRef,
    currentBasemapId: contextCurrentBasemapId,
  } = useMapContext();

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
    agentProfile,
    setAgentProfile,
  } = useMapContext();
  const { user, userProfile } = useUser();
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

  // Paste (⌘V) or drag image files/URLs straight into the gallery — this is what
  // the "Save to CommunityView" bookmarklet's "Copy photos" button feeds.
  const handlePrintGalleryTransfer = useCallback(
    async (dataTransfer) => {
      if (!dataTransfer) return;
      const directFiles = extractImageFilesFromDataTransfer(dataTransfer);
      const urls = extractImageUrlsFromDataTransfer(dataTransfer, {
        lenient: true,
      }).slice(0, 200);
      if (!directFiles.length && !urls.length) return;
      if (!user?.uid) {
        window.alert('Sign in to add images.');
        return;
      }
      setPrintGalleryUploading(true);
      try {
        const fetched = await Promise.all(urls.map((u) => fetchImageUrlAsFile(u)));
        const files = [...directFiles, ...fetched.filter(Boolean)].filter(
          (f) => f && f.type?.startsWith('image/') && !validateMapPhotoFile(f)
        );
        const items = [];
        for (const file of files) {
          const { url, storagePath } = await uploadMapPhoto(user.uid, file, {
            mapId: printMapId,
          });
          items.push({
            id: `gal_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
            name: file.name || 'Image',
            url,
            storagePath,
          });
        }
        // CDN-blocked URLs can't be fetched to re-host — keep them as external refs.
        urls.forEach((u, i) => {
          if (!fetched[i]) {
            items.push({
              id: `gal_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
              name: 'Image',
              url: u,
              storagePath: null,
            });
          }
        });
        if (items.length) setPrintGalleryItems((prev) => [...prev, ...items]);
      } catch (err) {
        console.error('Gallery paste/drop failed:', err);
        window.alert(err?.message || 'Failed to add images.');
      } finally {
        setPrintGalleryUploading(false);
      }
    },
    [user, printMapId]
  );

  // Remove an uploaded/pasted gallery photo (collector items only — photos that
  // belong to a placed map feature are managed from that feature's editor).
  const handleRemovePrintGalleryItem = useCallback((item) => {
    if (!item || typeof item.id !== 'string' || !item.id.startsWith('gal_')) return;
    setPrintGalleryItems((prev) => prev.filter((g) => g.id !== item.id));
    if (item.storagePath) {
      deleteMapPhoto(item.storagePath).catch(() => {});
    }
  }, []);

  // Account profile defaults the per-map agent card falls back to.
  const agentAccountDefaults = useMemo(
    () => accountAgentDefaults(userProfile, user),
    [userProfile, user]
  );

  // Upload a headshot / firm logo for the per-map agent card and return its
  // hosted URL + storage path (reused from the gallery upload plumbing).
  const handleUploadAgentImage = useCallback(
    async (file) => {
      if (!file) throw new Error('No file provided.');
      if (!user?.uid) throw new Error('Sign in to upload images.');
      const err = validateMapPhotoFile(file);
      if (err) throw new Error(err);
      return uploadMapPhoto(user.uid, file, { mapId: printMapId });
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
      autoAdvancedLayersTabRef.current = false;
      autoAdvancedPublicLandRef.current = false;
      return;
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
      {layerStatus[layerName] && renderLegend(layerName, getLayerType(layerName))}
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

  /** URL restore / geometry-only API features lack MVT fields — prefetch detail for the header. */
  useEffect(() => {
    uniqueSelectedFeatures.forEach((feature) => {
      const llUuid = feature.properties?.ll_uuid;
      if (!llUuid) return;

      const hasTileSummary =
        feature.properties?.owner ||
        feature.properties?.owner_name ||
        feature.properties?.address ||
        feature.properties?.physical;
      if (hasTileSummary) return;

      const cacheKey =
        llUuid ||
        feature.properties?.path ||
        feature.properties?.global_parcel_uid ||
        feature.properties?.parcelnumb;
      if (
        !cacheKey ||
        regridDetailedData[cacheKey] ||
        regridLoadingStates[cacheKey] ||
        regridDetailFailed[cacheKey]
      ) {
        return;
      }

      fetchRegridParcelDetails(llUuid, feature.properties || {});
    });
  }, [
    uniqueSelectedFeatures,
    regridDetailedData,
    regridLoadingStates,
    regridDetailFailed,
    fetchRegridParcelDetails,
  ]);
  
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
            mobileSheetState={mobileSheetState}
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
    if (!featureForMap) return;
    if (pendingCreateMapFromFeatureRef) {
      pendingCreateMapFromFeatureRef.current = featureForMap;
    }
    if (pendingCreateMapBasemapIdRef) {
      const basemapSnapshot = String(activeBasemapIdRef?.current || contextCurrentBasemapId || '').trim();
      pendingCreateMapBasemapIdRef.current = basemapSnapshot || null;
    }
    if (onZoomToFeature) {
      onZoomToFeature(featureForMap);
    }
    setActiveTab('print');
    navigate('/print');
  }, [
    navigate,
    onZoomToFeature,
    setActiveTab,
    pendingCreateMapFromFeatureRef,
    pendingCreateMapBasemapIdRef,
    activeBasemapIdRef,
    contextCurrentBasemapId,
  ]);
  
  const toggleLegend = (layerName) => {
    setIsLegendOpen((prev) => {
      const legendItems = legends[layerName];
      const defaultExpanded =
        Array.isArray(legendItems) && legendItems.length <= LEGEND_AUTO_EXPAND_MAX_ITEMS;
      const currentlyExpanded = prev[layerName] ?? defaultExpanded;
      return {
        ...prev,
        [layerName]: !currentlyExpanded,
      };
    });
  };

  const getLayerType = (layerName) => {
    if (layerName === 'transmission_lines') return 'line';
    return 'fill';
  };
  

  const getLegendSwatchStyle = (item, layerType) => {
    const opacity = item.opacity !== undefined ? item.opacity : 1;
    if (layerType === 'line') {
      return {
        width: '24px',
        height: '3px',
        backgroundColor: item.color,
        opacity,
      };
    }
    if (layerType === 'point') {
      return {
        width: '10px',
        height: '10px',
        backgroundColor: item.color,
        borderRadius: '50%',
        opacity,
      };
    }
    return {
      width: '14px',
      height: '14px',
      backgroundColor: item.color,
      opacity,
    };
  };

  const renderLegendSwatch = (item, layerType, className = 'legend-swatch') => (
    <span
      className={className}
      style={getLegendSwatchStyle(item, layerType)}
      aria-hidden="true"
    />
  );

  const renderLegend = (layerName, layerType) => {
    if (LEGEND_CLICK_FOR_DETAILS_LAYERS.has(layerName)) {
      return (
        <div className="legend-hint" role="note">
          <span className="legend-hint-icon" aria-hidden="true">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="9" />
              <circle cx="12" cy="12" r="2.5" fill="currentColor" stroke="none" />
            </svg>
          </span>
          <span className="legend-hint-text">Click a feature on the map for details</span>
        </div>
      );
    }

    const legendItems = legends[layerName];

    if (layerType === 'symbol') {
      return (
        <div className="legend-inline">
          <img
            src="/pin_better.png"
            alt=""
            className="legend-symbol-icon"
            aria-hidden="true"
          />
          <span className="legend-inline-label">Address pin</span>
        </div>
      );
    }

    if (!legendItems || legendItems.length === 0) {
      return null;
    }

    if (legendItems.length === 1) {
      const item = legendItems[0];
      if (!item.label) {
        return (
          <div className="legend-inline">
            {renderLegendSwatch(item, layerType)}
            <span className="legend-inline-label">Parcel fill</span>
          </div>
        );
      }
      return (
        <div className="legend-inline">
          {renderLegendSwatch(item, layerType)}
          <span className="legend-inline-label">{item.label}</span>
        </div>
      );
    }

    const defaultExpanded = legendItems.length <= LEGEND_AUTO_EXPAND_MAX_ITEMS;
    const isExpanded = isLegendOpen[layerName] ?? defaultExpanded;
    const toggleId = `legend-toggle-${layerName}`;

    return (
      <div className="legend-panel">
        <button
          type="button"
          id={toggleId}
          onClick={() => toggleLegend(layerName)}
          className="legend-toggle"
          aria-expanded={isExpanded}
          aria-controls={`legend-list-${layerName}`}
        >
          <span className="legend-toggle-chevron" aria-hidden="true">
            {isExpanded ? '▾' : '▸'}
          </span>
          <span className="legend-toggle-label">
            Legend
            <span className="legend-toggle-count">{legendItems.length}</span>
          </span>
        </button>
        {isExpanded && (
          <ul className="legend" id={`legend-list-${layerName}`} aria-labelledby={toggleId}>
            {legendItems.map((item, index) => (
              <li key={`${layerName}-${index}`} className="legend-item">
                {renderLegendSwatch(item, layerType, 'legend-color')}
                <span className="legend-item-label">{item.label}</span>
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
      if (isMobile) {
        setMobileSheetState(MOBILE_SHEET.HIDDEN);
      }
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
      collapsedByInteractionRef.current = false;
      setMobileSheetState(MOBILE_SHEET.PEEK);
    }
  }, [
    isMobile,
    isOpen,
    uniqueSelectedFeatures,
    togglePanel,
    setActiveSidePanelTab,
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
        delete window.__shrinkSidePanel;
        delete window.__collapseSidePanel;
        delete window.__openMobileInfoPeek;
      }
      return;
    }

    if (typeof window !== 'undefined') {
      window.__shrinkSidePanel = () => {
        collapsedByInteractionRef.current = true;
        setMobileSheetState((current) => {
          if (current === MOBILE_SHEET.FULL) {
            return MOBILE_SHEET.PEEK;
          }
          return MOBILE_SHEET.HIDDEN;
        });
      };
      window.__collapseSidePanel = () => {
        collapsedByInteractionRef.current = true;
        setSheetState(MOBILE_SHEET.HIDDEN, { suppressToggle: true });
      };
      window.__openMobileInfoPeek = () => {
        collapsedByInteractionRef.current = false;
        setActiveSidePanelTab('info');
        if (!isOpen) {
          togglePanel();
        }
        setMobileSheetState(MOBILE_SHEET.PEEK);
      };
    }

    return () => {
      if (typeof window !== 'undefined') {
        delete window.__shrinkSidePanel;
        delete window.__collapseSidePanel;
        delete window.__openMobileInfoPeek;
      }
    };
  }, [isMobile, isOpen, setSheetState, setActiveSidePanelTab, togglePanel]);

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
              <span className="mobile-sheet-grabber-label">Parcel details</span>
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
                  onPrintGalleryTransfer={handlePrintGalleryTransfer}
                  onRemovePrintGalleryItem={handleRemovePrintGalleryItem}
                  printGalleryUploading={printGalleryUploading}
                  agentProfile={agentProfile}
                  onAgentProfileChange={setAgentProfile}
                  agentAccountDefaults={agentAccountDefaults}
                  onUploadAgentImage={handleUploadAgentImage}
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
