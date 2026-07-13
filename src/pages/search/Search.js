import React, { useState, useEffect, useCallback, useRef } from 'react';
import './Search.css';
import { useNavigate, useLocation } from 'react-router-dom';
import { useMapContext } from '../MapContext';
import { regridRestGet } from '../../services/regridService';
import {
  buildRegridParcelQueryParams,
} from '../../utils/regridParcelApi';
import { DEFAULT_PARCEL_SEARCH_LIMIT, searchParcels } from '../../utils/parcelSearch';
import { mapRegridToLegacy } from '../../utils/parcelSearchMapper';
import { useSearchCountyScope } from '../../hooks/useSearchCountyScope';
import CountySearchScopeControls from '../../components/search/CountySearchScopeControls';
import SaveDefaultCountyPrompt from '../../components/search/SaveDefaultCountyPrompt';
import { useUser } from '../../contexts/UserContext';

/** Max parcel records per Regrid search request (billing is per record returned). */
const SEARCH_RESULTS_LIMIT = DEFAULT_PARCEL_SEARCH_LIMIT;

const Search = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchTriggered, setIsSearchTriggered] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMoreResults, setHasMoreResults] = useState(false);
  const [nextOffsetId, setNextOffsetId] = useState(null);
  const [activeSearchRequest, setActiveSearchRequest] = useState(null);
  const countyBootstrapRef = useRef(false);

  const { focusFeatures, setFocusFeatures, searchResults, setSearchResults, setIsMapTriggeredFromSearch, setActiveTab, mapRef } = useMapContext();
  const { loading: userLoading, user } = useUser();

  const {
    mode: countyMode,
    setMode: setCountyMode,
    savedCounty,
    mapCounty,
    savedCountyLabel,
    hasProfileSavedCounty,
    countyCodes,
    bootstrapCountyScope,
    selectMapCenter,
    applyMapCountyFromParcelPath,
    saveDetectedAsDefault,
    pendingSavePromptCounty,
    dismissSavePrompt,
    isSavingDefaultCounty,
    isBootstrapping: isCountyBootstrapping,
    isRefreshing: isCountyRefreshing,
  } = useSearchCountyScope(mapRef);

  /** Bootstrap county scope when Search opens (0 Regrid calls if profile has saved county). */
  useEffect(() => {
    if (!location.pathname.includes('/search')) return undefined;
    if (userLoading) return undefined;
    if (countyBootstrapRef.current) return undefined;
    countyBootstrapRef.current = true;
    void bootstrapCountyScope();
    return undefined;
  }, [location.pathname, bootstrapCountyScope, userLoading]);

  const searchAPI = async (query, limit = SEARCH_RESULTS_LIMIT, scopeCountyCodes = [], options = {}) => {
    const { offsetId = null, append = false } = options;
    try {
      if (append) {
        setIsLoadingMore(true);
      } else {
        setIsLoading(true);
      }
      return await searchParcels(query, {
        limit,
        countyCodes: scopeCountyCodes,
        offsetId,
        maxLimit: SEARCH_RESULTS_LIMIT,
      });
    } catch (error) {
      console.error('❌ Regrid Search API error:', error);
      return { results: [], hasMore: false, nextOffsetId: null };
    } finally {
      if (append) {
        setIsLoadingMore(false);
      } else {
        setIsLoading(false);
      }
    }
  };

  const executeSearch = useCallback(async (rawQuery) => {
    const queryToRun = (rawQuery ?? '').trim();
    if (!queryToRun) {
      return;
    }

    setIsSearchTriggered(true);
    const request = {
      query: queryToRun,
      limit: SEARCH_RESULTS_LIMIT,
      countyCodes,
    };
    setActiveSearchRequest(request);
    const response = await searchAPI(queryToRun, SEARCH_RESULTS_LIMIT, countyCodes);
    const apiResults = response.results || [];
    setSearchResults(apiResults);
    setHasMoreResults(response.hasMore);
    setNextOffsetId(response.nextOffsetId);
  }, [countyCodes, setSearchResults]);

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
  }, [activeSearchRequest, hasMoreResults, isLoadingMore, isLoading, searchAPI, setSearchResults]);

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

  const handleMapClick = async (result) => {
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
    const parcelPath = featureToMap?.path || result?.path;
    if (parcelPath) {
      applyMapCountyFromParcelPath(parcelPath);
    }
    setFocusFeatures(features);

    setIsMapTriggeredFromSearch((prev) => !prev);

    setTimeout(() => {
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

  const countyBusy = isCountyBootstrapping || isCountyRefreshing;

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

              <div className="county-filter" data-tour="county-filter">
                <div className="county-filter-header">
                  <span className="county-filter-title">Search area</span>
                </div>
                <CountySearchScopeControls
                  mode={countyMode}
                  setMode={setCountyMode}
                  savedCounty={savedCounty}
                  mapCounty={mapCounty}
                  savedCountyLabel={savedCountyLabel}
                  hasProfileSavedCounty={hasProfileSavedCounty}
                  onSelectMapCenter={selectMapCenter}
                  onSaveMapCountyAsDefault={
                    user ? () => saveDetectedAsDefault(mapCounty) : undefined
                  }
                  isSavingDefaultCounty={isSavingDefaultCounty}
                  isRefreshing={isCountyRefreshing}
                  isBootstrapping={isCountyBootstrapping}
                  mapAvailable={Boolean(mapRef?.current)}
                />
                {countyMode !== 'nationwide' && countyCodes.length === 0 && !countyBusy ? (
                  <div className="county-filter-hint">
                    Choose a county scope above or switch to nationwide.
                  </div>
                ) : null}
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
            <div className="search-results-container">
              <ul className="search-results-list">
                {searchResults.map((result, index) => (
                  <li key={index} className={`search-result-item ${index % 2 === 0 ? 'even' : 'odd'}`}>
                    <div className="result-content result-content--inline">
                      <div className="result-body result-body--stacked">
                        <div className="result-body-main">
                          <div className="result-head-row">
                            <div className="result-owner-line">
                              {result.owner || result.owner_name || 'Unknown owner'}
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
                    </div>
                  </li>
                ))}
              </ul>

              {hasMoreResults ? (
                <div className="search-show-more-row">
                  <button
                    type="button"
                    className="search-show-more-button"
                    onClick={() => void loadMoreResults()}
                    disabled={isLoadingMore || isLoading}
                  >
                    {isLoadingMore ? 'Loading…' : `Show ${SEARCH_RESULTS_LIMIT} more`}
                  </button>
                </div>
              ) : null}
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

      {pendingSavePromptCounty ? (
        <SaveDefaultCountyPrompt
          county={pendingSavePromptCounty}
          onSave={() => saveDetectedAsDefault(pendingSavePromptCounty)}
          onDismiss={dismissSavePrompt}
          isSaving={isSavingDefaultCounty}
        />
      ) : null}
    </div>
  );
};

export default Search;
