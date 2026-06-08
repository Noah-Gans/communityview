import React, { useState, useEffect, useCallback, useRef } from 'react';
import './Search.css';
import { useNavigate, useLocation } from 'react-router-dom';
import { useMapContext } from '../MapContext';
import { countyCodeToRegridPath } from '../../utils/regridCountyMapping';
import { regridRestGet } from '../../services/regridService';
import {
  applyRegridSearchListParams,
  buildRegridParcelQueryParams,
} from '../../utils/regridParcelApi';
import { discoverCountiesFromMap } from '../../utils/searchCountyDetection';

/** Max parcel records per Regrid search request (billing is per record returned). */
const SEARCH_RESULTS_LIMIT = 10;

const Search = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchTriggered, setIsSearchTriggered] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedCountyCodes, setSelectedCountyCodes] = useState([]);
  const navigate = useNavigate();
  const location = useLocation();
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMoreResults, setHasMoreResults] = useState(false);
  const [nextOffsetId, setNextOffsetId] = useState(null);
  const [activeSearchRequest, setActiveSearchRequest] = useState(null);
  const resultsContainerRef = useRef(null);
  
  const { focusFeatures, setFocusFeatures, searchResults, setSearchResults, setIsMapTriggeredFromSearch, setActiveTab, mapRef } = useMapContext();
  
  // State for location-based county detection
  const [nearbyCounties, setNearbyCounties] = useState([]);
  const [useCurrentLocation, setUseCurrentLocation] = useState(false);
  
  console.log('🔍 Search component render - searchResults length:', searchResults?.length || 0);
  console.log('🔍 Search component render - loading state:', isLoading);
  
  // Map Regrid API response to legacy format for compatibility
  const mapRegridToLegacy = (feature) => {
    const props = feature.properties || {};
    const fields = props.fields || {};
    const context = props.context || {};
    const addresses = Array.isArray(props.addresses) ? props.addresses : [];
    const firstAddress = addresses[0] || {};
    const enhancedOwnership = Array.isArray(props.enhanced_ownership) ? props.enhanced_ownership : [];
    const firstOwnership = enhancedOwnership[0] || {};
    const ownerName =
      props.owner ||
      fields.owner ||
      firstOwnership.owner ||
      firstOwnership.owner_name ||
      '';
    const parcelNumber =
      props.parcelnumb ||
      fields.parcelnumb ||
      props.headline ||
      '';
    const propertyAddress =
      props.address ||
      fields.address ||
      firstAddress.address ||
      props.headline ||
      '';
    const mailingAddress =
      props.mailing_address ||
      fields.mailing_address ||
      firstAddress.mailing_address ||
      props.mailadd ||
      fields.mailadd ||
      '';
    const derivedCounty = extractCountyFromPath(props.path || context.path);
    const derivedState = extractStateFromPath(props.path || context.path);
    const latRaw = fields.lat ?? props.lat;
    const lonRaw = fields.lon ?? props.lon;
    const lat = latRaw != null && latRaw !== '' ? Number(latRaw) : NaN;
    const lon = lonRaw != null && lonRaw !== '' ? Number(lonRaw) : NaN;

    return {
      GFI: props.ll_uuid || props.global_parcel_uid || props.parcelnumb || '',
      global_parcel_uid: props.ll_uuid || props.global_parcel_uid || '',
      ll_uuid: props.ll_uuid || '',
      pidn: parcelNumber || props.pidn || props.fid || '',
      county_parcel_id: parcelNumber || props.pidn || props.fid || '',
      parcelnumb: parcelNumber || props.fid || '',
      owner: ownerName,
      owner_name: ownerName,
      physical: propertyAddress || props.physical_address || props.physical || '',
      physical_address: propertyAddress || props.physical_address || props.physical || '',
      address: propertyAddress,
      mail: mailingAddress || props.mail || '',
      mailing_address: mailingAddress || props.mail || '',
      county: props.county || fields.county || derivedCounty || '',
      state: props.state || fields.state2 || fields.state || derivedState || '',
      state2: props.state2 || props.state || fields.state2 || fields.state || derivedState || '',
      path: props.path || context.path || fields.path || '',
      lat: Number.isFinite(lat) ? lat : undefined,
      lon: Number.isFinite(lon) ? lon : undefined,
      geometry: feature.geometry || undefined,
      bbox: feature.bbox,
      property_details_key: props.property_details_key || fields.property_details_key || '',
      tax_details_key: props.tax_details_key || fields.tax_details_key || '',
      clerk_records_key: props.clerk_records_key || fields.clerk_records_key || '',
    };
  };

  const extractCountyFromPath = (path) => {
    if (!path) return '';
    const parts = path.split('/').filter(Boolean);
    const countySlug = parts.length >= 3 ? parts[2] : '';
    if (!countySlug) return '';
    return countySlug
      .split('_')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ') + ' County';
  };

  const extractStateFromPath = (path) => {
    if (!path) return '';
    const parts = path.split('/').filter(Boolean);
    const stateCode = parts.length >= 2 ? parts[1] : '';
    return stateCode ? stateCode.toUpperCase() : '';
  };

  const detectMapCounties = useCallback(async () => {
    if (!mapRef?.current) {
      return [];
    }

    try {
      const counties = await discoverCountiesFromMap(mapRef.current, {
        regridRestGet,
        applyRegridSearchListParams,
      });
      console.log(
        `📍 Counties from map: ${counties.length} (${counties.filter((c) => c.isCenter).length} current)`
      );
      return counties;
    } catch (error) {
      console.error('❌ Error detecting counties from map:', error);
      return [];
    }
  }, [mapRef]);

  // Handle county filter changes
  const handleCountyFilterChange = (countyCode) => {
    setSelectedCountyCodes(prev => 
      prev.includes(countyCode) 
        ? prev.filter(c => c !== countyCode)
        : [...prev, countyCode]
    );
  };

  const countyOptionsToShow = nearbyCounties;

  const refreshMapCounties = useCallback(async () => {
    const detected = await detectMapCounties();
    setNearbyCounties(detected);
    return detected;
  }, [detectMapCounties]);

  const handleUseCurrentLocationChange = useCallback(
    async (checked) => {
      setUseCurrentLocation(checked);

      if (checked) {
        const detected = await refreshMapCounties();
        if (detected.length > 0) {
          setSelectedCountyCodes(detected.map((county) => county.path || county.code));
        }
        return;
      }

      setSelectedCountyCodes([]);
    },
    [refreshMapCounties]
  );

  useEffect(() => {
    let isMounted = true;

    const initializeCountiesFromMap = async () => {
      const detected = await detectMapCounties();
      if (!isMounted || detected.length === 0) return;

      setUseCurrentLocation(true);
      setNearbyCounties(detected);
      setSelectedCountyCodes(detected.map((county) => county.path || county.code));
    };

    initializeCountiesFromMap();

    return () => {
      isMounted = false;
    };
  }, [detectMapCounties]);

  // Regrid API search function - uses field-based queries
  const searchAPI = async (query, limit = SEARCH_RESULTS_LIMIT, countyCodes = [], options = {}) => {
    try {
      const { offsetId = null, append = false } = options;
      if (append) {
        setIsLoadingMore(true);
      } else {
        setIsLoading(true);
      }
      console.log('🔍 Starting Regrid API search with:', { query, limit, countyCodes, offsetId, append });
      
      // Build Regrid query parameters
      const params = new URLSearchParams();
      const trimmedQuery = query.trim();

      const detectSearchIntent = (input) => {
        const value = (input || '').trim();
        if (!value) return 'owner';
        const digitsOnly = value.replace(/\D/g, '');
        const apnLikeDelimited = /^(?=.*\d)[A-Za-z0-9\-./ ]{5,}$/.test(value) && /[\d]/.test(value) && /[-./]/.test(value);
        const apnLikeNumeric = /^\d{8,}$/.test(value) || digitsOnly.length >= 8;
        const apnLike = apnLikeDelimited || apnLikeNumeric;
        const addressLike = /^\d+\s+[A-Za-z]/.test(value);
        if (apnLike) return 'apn';
        if (addressLike) return 'address';
        return 'owner';
      };
      const searchIntent = detectSearchIntent(trimmedQuery);
      console.log('🎯 Search intent detected:', searchIntent);
      const normalizedApn = trimmedQuery.replace(/[^A-Za-z0-9]/g, '');
      
      // Build query endpoint fallback by intent
      if (trimmedQuery) {
        if (searchIntent === 'apn') {
          params.append('fields[parcelnumb][ilike]', trimmedQuery);
          console.log('🔍 Query fallback configured for APN field');
        } else if (searchIntent === 'address') {
          params.append('fields[address][ilike]', trimmedQuery);
          console.log('🔍 Query fallback configured for address field');
        } else {
          params.append('fields[owner][ilike]', trimmedQuery);
          console.log('🔍 Query fallback configured for owner field');
        }
      }
      
      const effectiveLimit = Math.min(limit, SEARCH_RESULTS_LIMIT);
      params.append('limit', effectiveLimit.toString());
      if (offsetId !== null && offsetId !== undefined) {
        params.append('offset_id', String(offsetId));
      }

      applyRegridSearchListParams(params);
      
      // Helper function to parse Regrid response
      const parseRegridResponse = (data) => {
        console.log('✅ Regrid API Response:', data);
        console.log('📊 Response structure:', {
          hasParcels: !!data.parcels,
          parcelsType: typeof data.parcels,
          parcelsIsArray: Array.isArray(data.parcels),
          parcelsKeys: data.parcels ? Object.keys(data.parcels) : [],
          hasFeatures: !!data.features,
          featuresType: typeof data.features,
          featuresIsArray: Array.isArray(data.features),
          topLevelKeys: Object.keys(data)
        });
        
        // Regrid returns GeoJSON FeatureCollection - check multiple possible structures
        let features = [];
        if (data.parcels) {
          if (Array.isArray(data.parcels)) {
            features = data.parcels;
          } else if (data.parcels.features && Array.isArray(data.parcels.features)) {
            features = data.parcels.features;
          } else if (data.parcels.type === 'FeatureCollection' && Array.isArray(data.parcels.features)) {
            features = data.parcels.features;
          } else {
            // Log the actual structure to debug
            console.log('🔍 data.parcels structure:', JSON.stringify(data.parcels, null, 2).substring(0, 500));
          }
        } else if (data.features && Array.isArray(data.features)) {
          features = data.features;
        } else if (Array.isArray(data)) {
          features = data;
        }
        
        console.log(`📦 Found ${features.length} parcels from Regrid`);
        if (features.length > 0) {
          console.log('📋 Sample feature:', features[0]);
        } else {
          console.log('⚠️ No features found. Full response:', JSON.stringify(data, null, 2).substring(0, 1000));
          console.log('💡 Possible reasons:');
          console.log('   1. No parcels match the search query');
          console.log('   2. API token or county scope restrictions');
          console.log('   3. Query format might need adjustment (try exact match or wildcards)');
          console.log('   4. Owner name might be stored differently in Regrid database');
        }
        
        return features;
      };
      
      // Helper function to make API request
      const makeRegridRequest = async (requestParams, endpoint = 'query') => {
        applyRegridSearchListParams(requestParams);
        console.log('📡 Regrid API (proxied):', `parcels/${endpoint}`);
        const data = await regridRestGet(`parcels/${endpoint}`, Object.fromEntries(requestParams));
        return parseRegridResponse(data);
      };
      
      // Handle multiple counties by making separate requests and combining results.
      // countyCodes can include dynamic values that are already Regrid paths.
      const rawCountyValues = Array.isArray(countyCodes) ? countyCodes : [];
      const directPaths = rawCountyValues.filter((value) => typeof value === 'string' && value.startsWith('/us/'));
      const mappedPaths = countyCodeToRegridPath(rawCountyValues.filter((value) => !directPaths.includes(value)));
      const regridPaths = [...directPaths, ...mappedPaths];
      
      const canUseOwnerEndpoint = trimmedQuery.length >= 4 && searchIntent === 'owner';
      const canUseAddressEndpoint = trimmedQuery.length >= 4 && searchIntent === 'address';
      const canUseApnEndpoint = trimmedQuery.length >= 3 && searchIntent === 'apn';

      if (regridPaths.length === 0) {
        // No county filter - search nationwide
        if (canUseApnEndpoint) {
          const apnParams = new URLSearchParams();
          apnParams.append('parcelnumb', normalizedApn);
          apnParams.append('limit', effectiveLimit.toString());
          apnParams.append('return_geometry', 'false');
          apnParams.append('return_zoning', 'false');
          apnParams.append('return_matched_buildings', 'false');
          apnParams.append('return_matched_addresses', 'false');
          apnParams.append('return_enhanced_ownership', 'false');
          const apnFeatures = await makeRegridRequest(apnParams, 'apn');
          if (apnFeatures.length > 0) {
            const mapped = apnFeatures.map(mapRegridToLegacy);
            const newNextOffsetId = apnFeatures[apnFeatures.length - 1]?.id ?? null;
            return {
              results: mapped,
              hasMore: apnFeatures.length === effectiveLimit && newNextOffsetId !== null,
              nextOffsetId: newNextOffsetId
            };
          }
        }

        if (canUseAddressEndpoint) {
          const addressParams = new URLSearchParams();
          addressParams.append('query', trimmedQuery);
          addressParams.append('limit', effectiveLimit.toString());
          addressParams.append('return_geometry', 'false');
          addressParams.append('return_zoning', 'false');
          addressParams.append('return_matched_buildings', 'false');
          addressParams.append('return_matched_addresses', 'false');
          addressParams.append('return_enhanced_ownership', 'false');
          const addressFeatures = await makeRegridRequest(addressParams, 'address');
          if (addressFeatures.length > 0) {
            const mapped = addressFeatures.map(mapRegridToLegacy);
            const newNextOffsetId = addressFeatures[addressFeatures.length - 1]?.id ?? null;
            return {
              results: mapped,
              hasMore: addressFeatures.length === effectiveLimit && newNextOffsetId !== null,
              nextOffsetId: newNextOffsetId
            };
          }
        }

        if (canUseOwnerEndpoint) {
          const ownerParams = new URLSearchParams();
          ownerParams.append('owner', trimmedQuery);
          ownerParams.append('limit', effectiveLimit.toString());
          ownerParams.append('return_geometry', 'false');
          ownerParams.append('return_zoning', 'false');
          ownerParams.append('return_matched_buildings', 'false');
          ownerParams.append('return_matched_addresses', 'false');
          ownerParams.append('return_enhanced_ownership', 'false');
          if (offsetId !== null && offsetId !== undefined) {
            ownerParams.append('offset_id', String(offsetId));
          }

          const ownerFeatures = await makeRegridRequest(ownerParams, 'owner');
          if (ownerFeatures.length > 0) {
            const mapped = ownerFeatures.map(mapRegridToLegacy);
            const newNextOffsetId = ownerFeatures[ownerFeatures.length - 1]?.id ?? null;
            return {
              results: mapped,
              hasMore: ownerFeatures.length === effectiveLimit && newNextOffsetId !== null,
              nextOffsetId: newNextOffsetId
            };
          }
        }

        const features = await makeRegridRequest(params, 'query');
        const mapped = features.map(mapRegridToLegacy);
        const newNextOffsetId = features[features.length - 1]?.id ?? null;
        return {
          results: mapped,
          hasMore: features.length === effectiveLimit && newNextOffsetId !== null,
          nextOffsetId: newNextOffsetId
        };
      } else if (regridPaths.length === 1) {
        // Single county - use path parameter
        params.append('path', regridPaths[0]);
        console.log('📍 Using Regrid path:', regridPaths[0]);

        if (canUseApnEndpoint) {
          const apnParams = new URLSearchParams();
          apnParams.append('parcelnumb', normalizedApn);
          apnParams.append('path', regridPaths[0]);
          apnParams.append('limit', effectiveLimit.toString());
          apnParams.append('return_geometry', 'false');
          apnParams.append('return_zoning', 'false');
          apnParams.append('return_matched_buildings', 'false');
          apnParams.append('return_matched_addresses', 'false');
          apnParams.append('return_enhanced_ownership', 'false');
          const apnFeatures = await makeRegridRequest(apnParams, 'apn');
          if (apnFeatures.length > 0) {
            const mapped = apnFeatures.map(mapRegridToLegacy);
            const newNextOffsetId = apnFeatures[apnFeatures.length - 1]?.id ?? null;
            return {
              results: mapped,
              hasMore: apnFeatures.length === effectiveLimit && newNextOffsetId !== null,
              nextOffsetId: newNextOffsetId
            };
          }
          // Fallback: if county-scoped APN returns none, retry without path
          const broadApnParams = new URLSearchParams();
          broadApnParams.append('parcelnumb', normalizedApn);
          broadApnParams.append('limit', effectiveLimit.toString());
          broadApnParams.append('return_geometry', 'false');
          broadApnParams.append('return_zoning', 'false');
          broadApnParams.append('return_matched_buildings', 'false');
          broadApnParams.append('return_matched_addresses', 'false');
          broadApnParams.append('return_enhanced_ownership', 'false');
          const broadApnFeatures = await makeRegridRequest(broadApnParams, 'apn');
          if (broadApnFeatures.length > 0) {
            const mapped = broadApnFeatures.map(mapRegridToLegacy);
            const newNextOffsetId = broadApnFeatures[broadApnFeatures.length - 1]?.id ?? null;
            return {
              results: mapped,
              hasMore: broadApnFeatures.length === effectiveLimit && newNextOffsetId !== null,
              nextOffsetId: newNextOffsetId
            };
          }
        }

        if (canUseAddressEndpoint) {
          const addressParams = new URLSearchParams();
          addressParams.append('query', trimmedQuery);
          addressParams.append('path', regridPaths[0]);
          addressParams.append('limit', effectiveLimit.toString());
          addressParams.append('return_geometry', 'false');
          addressParams.append('return_zoning', 'false');
          addressParams.append('return_matched_buildings', 'false');
          addressParams.append('return_matched_addresses', 'false');
          addressParams.append('return_enhanced_ownership', 'false');
          const addressFeatures = await makeRegridRequest(addressParams, 'address');
          if (addressFeatures.length > 0) {
            const mapped = addressFeatures.map(mapRegridToLegacy);
            const newNextOffsetId = addressFeatures[addressFeatures.length - 1]?.id ?? null;
            return {
              results: mapped,
              hasMore: addressFeatures.length === effectiveLimit && newNextOffsetId !== null,
              nextOffsetId: newNextOffsetId
            };
          }
          // Fallback: if county-scoped address returns none, retry without path
          const broadAddressParams = new URLSearchParams();
          broadAddressParams.append('query', trimmedQuery);
          broadAddressParams.append('limit', effectiveLimit.toString());
          broadAddressParams.append('return_geometry', 'false');
          broadAddressParams.append('return_zoning', 'false');
          broadAddressParams.append('return_matched_buildings', 'false');
          broadAddressParams.append('return_matched_addresses', 'false');
          broadAddressParams.append('return_enhanced_ownership', 'false');
          const broadAddressFeatures = await makeRegridRequest(broadAddressParams, 'address');
          if (broadAddressFeatures.length > 0) {
            const mapped = broadAddressFeatures.map(mapRegridToLegacy);
            const newNextOffsetId = broadAddressFeatures[broadAddressFeatures.length - 1]?.id ?? null;
            return {
              results: mapped,
              hasMore: broadAddressFeatures.length === effectiveLimit && newNextOffsetId !== null,
              nextOffsetId: newNextOffsetId
            };
          }
        }

        if (canUseOwnerEndpoint) {
          const ownerParams = new URLSearchParams();
          ownerParams.append('owner', trimmedQuery);
          ownerParams.append('path', regridPaths[0]);
          ownerParams.append('limit', effectiveLimit.toString());
          ownerParams.append('return_geometry', 'false');
          ownerParams.append('return_zoning', 'false');
          ownerParams.append('return_matched_buildings', 'false');
          ownerParams.append('return_matched_addresses', 'false');
          ownerParams.append('return_enhanced_ownership', 'false');
          if (offsetId !== null && offsetId !== undefined) {
            ownerParams.append('offset_id', String(offsetId));
          }

          const ownerFeatures = await makeRegridRequest(ownerParams, 'owner');
          if (ownerFeatures.length > 0) {
            const mapped = ownerFeatures.map(mapRegridToLegacy);
            const newNextOffsetId = ownerFeatures[ownerFeatures.length - 1]?.id ?? null;
            return {
              results: mapped,
              hasMore: ownerFeatures.length === effectiveLimit && newNextOffsetId !== null,
              nextOffsetId: newNextOffsetId
            };
          }
        }

        const features = await makeRegridRequest(params, 'query');
        const mapped = features.map(mapRegridToLegacy);
        const newNextOffsetId = features[features.length - 1]?.id ?? null;
        return {
          results: mapped,
          hasMore: features.length === effectiveLimit && newNextOffsetId !== null,
          nextOffsetId: newNextOffsetId
        };
      } else {
        // Multiple counties - make separate requests and combine
        console.log(`📍 Searching ${regridPaths.length} counties separately and combining results`);
        const allFeatures = [];
        const limitPerCounty = Math.ceil(effectiveLimit / regridPaths.length);
        
        for (const path of regridPaths) {
          const countyParams = new URLSearchParams(params);
          countyParams.set('path', path);
          countyParams.set('limit', limitPerCounty.toString());
          
          try {
            let features = [];
            if (canUseApnEndpoint) {
              const apnParams = new URLSearchParams();
              apnParams.append('parcelnumb', normalizedApn);
              apnParams.append('path', path);
              apnParams.append('limit', limitPerCounty.toString());
              apnParams.append('return_geometry', 'false');
              apnParams.append('return_zoning', 'false');
              apnParams.append('return_matched_buildings', 'false');
              apnParams.append('return_matched_addresses', 'false');
              apnParams.append('return_enhanced_ownership', 'false');
              features = await makeRegridRequest(apnParams, 'apn');
            }

            if (features.length === 0 && canUseAddressEndpoint) {
              const addressParams = new URLSearchParams();
              addressParams.append('query', trimmedQuery);
              addressParams.append('path', path);
              addressParams.append('limit', limitPerCounty.toString());
              addressParams.append('return_geometry', 'false');
              addressParams.append('return_zoning', 'false');
              addressParams.append('return_matched_buildings', 'false');
              addressParams.append('return_matched_addresses', 'false');
              addressParams.append('return_enhanced_ownership', 'false');
              features = await makeRegridRequest(addressParams, 'address');
            }

            if (features.length === 0 && canUseOwnerEndpoint) {
              const ownerParams = new URLSearchParams();
              ownerParams.append('owner', trimmedQuery);
              ownerParams.append('path', path);
              ownerParams.append('limit', limitPerCounty.toString());
              ownerParams.append('return_geometry', 'false');
              ownerParams.append('return_zoning', 'false');
              ownerParams.append('return_matched_buildings', 'false');
              ownerParams.append('return_matched_addresses', 'false');
              ownerParams.append('return_enhanced_ownership', 'false');
              features = await makeRegridRequest(ownerParams, 'owner');
            }

            if (features.length === 0) {
              features = await makeRegridRequest(countyParams, 'query');
            }
            allFeatures.push(...features);
          } catch (error) {
            console.error(`❌ Error fetching county ${path}:`, error);
            // Continue with other counties
          }
        }
        
        // Fallback for address/APN: retry once nationwide when all county-scoped calls return none.
        if (allFeatures.length === 0 && canUseAddressEndpoint) {
          const broadAddressParams = new URLSearchParams();
          broadAddressParams.append('query', trimmedQuery);
          broadAddressParams.append('limit', effectiveLimit.toString());
          broadAddressParams.append('return_geometry', 'false');
          broadAddressParams.append('return_zoning', 'false');
          broadAddressParams.append('return_matched_buildings', 'false');
          broadAddressParams.append('return_matched_addresses', 'false');
          broadAddressParams.append('return_enhanced_ownership', 'false');
          const broadAddressFeatures = await makeRegridRequest(broadAddressParams, 'address');
          if (broadAddressFeatures.length > 0) {
            return {
              results: broadAddressFeatures.slice(0, effectiveLimit).map(mapRegridToLegacy),
              hasMore: broadAddressFeatures.length === effectiveLimit,
              nextOffsetId: broadAddressFeatures[broadAddressFeatures.length - 1]?.id ?? null
            };
          }
        }

        if (allFeatures.length === 0 && canUseApnEndpoint) {
          const broadApnParams = new URLSearchParams();
          broadApnParams.append('parcelnumb', normalizedApn);
          broadApnParams.append('limit', effectiveLimit.toString());
          broadApnParams.append('return_geometry', 'false');
          broadApnParams.append('return_zoning', 'false');
          broadApnParams.append('return_matched_buildings', 'false');
          broadApnParams.append('return_matched_addresses', 'false');
          broadApnParams.append('return_enhanced_ownership', 'false');
          const broadApnFeatures = await makeRegridRequest(broadApnParams, 'apn');
          if (broadApnFeatures.length > 0) {
            return {
              results: broadApnFeatures.slice(0, effectiveLimit).map(mapRegridToLegacy),
              hasMore: broadApnFeatures.length === effectiveLimit,
              nextOffsetId: broadApnFeatures[broadApnFeatures.length - 1]?.id ?? null
            };
          }
        }

        // Limit total results and map to legacy format
        return {
          results: allFeatures.slice(0, effectiveLimit).map(mapRegridToLegacy),
          hasMore: false,
          nextOffsetId: null
        };
      }
      
    } catch (error) {
      console.error('❌ Regrid Search API error:', error);
      console.error('❌ Error name:', error?.name);
      console.error('❌ Error message:', error?.message);
      
      if (error?.message?.includes('Failed to fetch') || error?.message?.includes('NetworkError')) {
        console.error('🌐 Network error - unable to reach Regrid API');
        console.error('💡 Check: 1) Internet connection, 2) API token is valid, 3) CORS settings');
      }
      
      return { results: [], hasMore: false, nextOffsetId: null };
    } finally {
      if (options.append) {
        setIsLoadingMore(false);
      } else {
        setIsLoading(false);
      }
    }
  };

  const executeSearch = useCallback(async (rawQuery) => {
    const queryToRun = (rawQuery ?? '').trim();
    if (!queryToRun) {
      console.log('⚠️ Empty search query');
      return;
    }

    console.log('🔍 Search triggered with query:', queryToRun);
    console.log('🏷️ Selected counties:', selectedCountyCodes);
    console.log('📊 Search limit:', SEARCH_RESULTS_LIMIT);

    setIsSearchTriggered(true);
    const request = {
      query: queryToRun,
      limit: SEARCH_RESULTS_LIMIT,
      countyCodes: selectedCountyCodes,
    };
    setActiveSearchRequest(request);
    const response = await searchAPI(queryToRun, SEARCH_RESULTS_LIMIT, selectedCountyCodes);
    const apiResults = response.results || [];
    setSearchResults(apiResults);
    setHasMoreResults(response.hasMore);
    setNextOffsetId(response.nextOffsetId);

    console.log(`✅ Search results for query "${queryToRun}":`);
    console.log(`📊 Total results found: ${apiResults.length}`);
  }, [searchAPI, selectedCountyCodes, setSearchResults]);

  const handleSearch = async () => {
    await executeSearch(searchQuery);
  };

  const loadMoreResults = useCallback(async () => {
    if (!activeSearchRequest || !hasMoreResults || isLoadingMore || isLoading) return;
    if (nextOffsetId === null || nextOffsetId === undefined) return;

    const response = await searchAPI(
      activeSearchRequest.query,
      activeSearchRequest.limit,
      activeSearchRequest.countyCodes,
      { offsetId: nextOffsetId, append: true }
    );

    const moreResults = response.results || [];
    if (moreResults.length > 0) {
      setSearchResults((prev) => [...prev, ...moreResults]);
    }
    setHasMoreResults(response.hasMore);
    setNextOffsetId(response.nextOffsetId);
  }, [activeSearchRequest, hasMoreResults, isLoadingMore, isLoading, nextOffsetId, searchAPI, setSearchResults]);

  const handleResultsScroll = useCallback(() => {
    const el = resultsContainerRef.current;
    if (!el || isLoadingMore || isLoading || !hasMoreResults) return;
    const threshold = 120;
    const nearBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - threshold;
    if (nearBottom) {
      loadMoreResults();
    }
  }, [hasMoreResults, isLoading, isLoadingMore, loadMoreResults]);

  const bboxFromLatLon = (lat, lon, bufferDeg = 0.002) => {
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
    return [lon - bufferDeg, lat - bufferDeg, lon + bufferDeg, lat + bufferDeg];
  };

  const fetchParcelGeometryForMap = async (result) => {
    const llUuid = result.ll_uuid || result.global_parcel_uid || result.GFI;
    const path = result.path;

    const baseParams = buildRegridParcelQueryParams('geometry');

    const parseSingleFeature = (data) => {
      const features = data?.parcels?.features || data?.features || [];
      return Array.isArray(features) && features.length > 0 ? features[0] : null;
    };

    // First try direct ll_uuid endpoint (fast and precise)
    if (llUuid) {
      try {
        const byIdData = await regridRestGet(
          `parcels/${encodeURIComponent(llUuid)}`,
          Object.fromEntries(baseParams)
        );
        const feature = parseSingleFeature(byIdData);
        if (feature?.geometry) {
          return mapRegridToLegacy(feature);
        }
      } catch (_) {
        /* try path fallback */
      }
    }

    // Fallback: query by full path when available
    if (path) {
      const pathParams = new URLSearchParams(baseParams);
      pathParams.append('path', path);
      pathParams.append('limit', '1');
      try {
        const byPathData = await regridRestGet('parcels/query', Object.fromEntries(pathParams));
        const feature = parseSingleFeature(byPathData);
        if (feature?.geometry) {
          return mapRegridToLegacy(feature);
        }
      } catch (_) {
        /* no geometry */
      }
    }

    return result;
  };

  // Handle "Map It" button click
  const handleMapClick = async (result) => {
    console.log('🗺️ Map It clicked for result:', result);
    console.log('📊 Result structure:', {
      hasBbox: !!result.bbox,
      hasGlobalParcelUid: !!result.global_parcel_uid,
      bbox: result.bbox,
      global_parcel_uid: result.global_parcel_uid
    });

    const hasGeometry =
      result?.geometry &&
      (result.geometry.type === 'Polygon' ||
        result.geometry.type === 'MultiPolygon' ||
        result.geometry.type === 'Point');

    let featureToMap = result;
    if (!hasGeometry) {
      const bbox = bboxFromLatLon(Number(result.lat), Number(result.lon));
      if (bbox) {
        featureToMap = { ...result, bbox };
      } else {
        try {
          featureToMap = await fetchParcelGeometryForMap(result);
        } catch (error) {
          console.warn('⚠️ Failed to fetch on-demand geometry for Map It, using list result:', error);
        }
      }
    }

    const features = Array.isArray(featureToMap) ? featureToMap.flat() : [featureToMap];
    console.log('📊 Features being set to focusFeatures:', features);
    console.log('📋 Sample feature structure:', features[0]);

    console.log("Before setting focusFeatures:", focusFeatures);
    setFocusFeatures(features);

    setIsMapTriggeredFromSearch((prev) => {
        console.log("Previous map trigger state:", prev);
        return !prev; // Toggle value to force update
    });

    setTimeout(() => {
        console.log("Navigating to map...");
        setActiveTab('map');
        navigate('/map');
    }, 200);
  };

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === 'Enter' && !isLoading) {
        handleSearch();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleSearch, isLoading]);

  useEffect(() => {
    const params = new URLSearchParams(location.search || '');
    const incomingQuery = (params.get('q') || '').trim();
    if (!incomingQuery) return;

    setSearchQuery(incomingQuery);
    executeSearch(incomingQuery);
  }, [location.search, executeSearch]);

  return (
    <div className="search-container">
      <div className="search-content">
        <div className="search-tab-panel" data-tour="search-standard-panel">
          <div className="search-bar-and-actions-container">
            <div className="search-controls-card">
              <div className="search-type-label">Owner, address, or APN</div>
              <div className="search-bar" data-tour="search-bar-controls">
                <input
                  type="text"
                  autoFocus
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search by owner, address, PIDN..."
                  disabled={isLoading}
                  data-tour="search-standard-input"
                />
                <button
                  type="button"
                  onClick={handleSearch}
                  disabled={isLoading || !searchQuery.trim()}
                  data-tour="search-submit-button"
                >
                  {isLoading ? 'Searching...' : 'Search'}
                </button>
              </div>

              <div className="county-filter county-filter-desktop" data-tour="county-filter">
                <div className="county-filter-header">
                  <span className="county-filter-title">Counties</span>
                  <label className="county-location-toggle">
                    <input
                      type="checkbox"
                      checked={useCurrentLocation}
                      onChange={(e) => handleUseCurrentLocationChange(e.target.checked)}
                      disabled={isLoading || !mapRef?.current}
                    />
                    Use map counties
                  </label>
                  <button
                    type="button"
                    className="county-refresh-button"
                    onClick={() => handleUseCurrentLocationChange(true)}
                    disabled={isLoading || !mapRef?.current}
                    title="Refresh counties from current map view"
                  >
                    Refresh
                  </button>
                </div>
                {countyOptionsToShow.length === 0 ? (
                  <div className="county-filter-hint">
                    Open the map first and pan to your area, then return here—or enable{' '}
                    <strong>Use map counties</strong> after the map has loaded.
                  </div>
                ) : (
                  <div className="county-checkboxes">
                    {countyOptionsToShow.map((county) => {
                      const countyValue = county.path || county.code;
                      const isSelected = selectedCountyCodes.includes(countyValue);

                      return (
                        <label
                          key={countyValue}
                          className={`county-checkbox${isSelected ? ' county-checkbox--selected' : ''}`}
                        >
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => handleCountyFilterChange(countyValue)}
                            disabled={isLoading}
                          />
                          {county.display}
                          {county.isCenter ? (
                            <span className="county-nearby-badge county-nearby-badge--current">
                              current
                            </span>
                          ) : (
                            <span className="county-nearby-badge">adjacent</span>
                          )}
                        </label>
                      );
                    })}
                  </div>
                )}
                {countyOptionsToShow.length > 0 && selectedCountyCodes.length === 0 && (
                  <div className="county-filter-hint">
                    No counties selected—the search will run nationwide (slower and may return
                    fewer relevant matches).
                  </div>
                )}
              </div>

              <div className="filter-row-mobile">
                <select
                  value={selectedCountyCodes.length === 1 ? selectedCountyCodes[0] : 'all'}
                  onChange={(e) => {
                    const value = e.target.value;
                    if (value === 'all') {
                      setSelectedCountyCodes([]);
                    } else {
                      setSelectedCountyCodes([value]);
                    }
                  }}
                  disabled={isLoading}
                  className="county-dropdown-select"
                >
                  <option value="all">All Counties</option>
                  {countyOptionsToShow.map((county) => {
                    const countyValue = county.path || county.code;
                    return (
                      <option key={countyValue} value={countyValue}>
                        {county.display}
                      </option>
                    );
                  })}
                </select>
              </div>
            </div>
          </div>

          {isSearchTriggered && searchResults.length === 0 && !isLoading && (
            <div className="no-results">No results found.</div>
          )}

          {isLoading && (
            <div className="loading-indicator">Searching...</div>
          )}

          {searchResults.length > 0 && (
            <div
              className="search-results-container"
              ref={resultsContainerRef}
              onScroll={handleResultsScroll}
            >
              <ul className="search-results-list">
                {searchResults.map((result, index) => (
                  <li key={index} className={`search-result-item ${index % 2 === 0 ? 'even' : 'odd'}`}>
                    <div className="result-content result-content--inline">
                      <div className="result-body result-body--stacked">
                        <div className="result-head-row">
                          <div className="result-owner-line">
                            {result.owner || result.owner_name || 'Unknown owner'}
                          </div>
                          <div className="result-inline-actions">
                            <button
                              type="button"
                              className="map-it-button"
                              onClick={() => handleMapClick(result)}
                            >
                              Map
                            </button>
                          </div>
                        </div>
                        <div className="result-meta">
                          <div>
                            <span className="result-meta-label">Parcel ID</span>{' '}
                            {result.county_parcel_id || result.parcelnumb || '—'}
                          </div>
                          <div>
                            <span className="result-meta-label">Location</span>{' '}
                            {[result.county, result.state].filter(Boolean).join(', ') || '—'}
                          </div>
                          <div>
                            <span className="result-meta-label">Address</span>{' '}
                            {result.physical || result.physical_address || result.address || '—'}
                          </div>
                        </div>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>

              {isLoadingMore && (
                <div className="loading-indicator" style={{ padding: '10px 0' }}>Loading more...</div>
              )}
            </div>
          )}

          <div data-tour="search-result-actions-demo" className="tutorial-search-footer">
            <p>
              {searchResults.length > 0
                ? 'Use Map to focus the parcel on the map.'
                : 'Search by owner, address, or APN, then use Map on each row.'}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Search;
