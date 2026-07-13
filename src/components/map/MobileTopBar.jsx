import React, { useState, useEffect } from 'react';
import './MobileTopBar.css';
import { useMapContext } from '../../pages/MapContext';
import { useLocation, useNavigate } from 'react-router-dom';
import { DEFAULT_PARCEL_SEARCH_LIMIT, searchParcels } from '../../utils/parcelSearch';
import { useSearchCountyScope } from '../../hooks/useSearchCountyScope';
import CountySearchScopeControls from '../search/CountySearchScopeControls';
import SaveDefaultCountyPrompt from '../search/SaveDefaultCountyPrompt';
import MobileAccountControls from '../account/MobileAccountControls';
import { useUser } from '../../contexts/UserContext';

const MOBILE_SEARCH_LIMIT = DEFAULT_PARCEL_SEARCH_LIMIT;

function MapViewIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M9 4 3 7v13l6-3 6 3 6-3V7l-6-3-6 3z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path d="M9 4v13M15 7v13" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}

function EditorViewIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="4" y="4" width="16" height="16" rx="2" stroke="currentColor" strokeWidth="1.8" />
      <path
        d="M8 15l6-6 3 3-6 6H8v-3z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function MobileTopBar() {
  const location = useLocation();
  const navigate = useNavigate();
  const isDiscover = location.pathname === '/map';
  const isMaps = location.pathname === '/print';

  const [parcelQuery, setParcelQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState([]);
  const [showResults, setShowResults] = useState(false);
  const [showCountyFilter, setShowCountyFilter] = useState(false);
  const [hasMoreResults, setHasMoreResults] = useState(false);
  const [nextOffsetId, setNextOffsetId] = useState(null);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [activeParcelQuery, setActiveParcelQuery] = useState('');
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== 'undefined' && window.innerWidth <= 768
  );

  const {
    setFocusFeatures,
    setIsMapTriggeredFromSearch,
    setActiveTab,
    setSearchResults: setGlobalSearchResults,
    mapRef,
    mobileMapsSearchQuery,
    setMobileMapsSearchQuery,
  } = useMapContext();

  const { user } = useUser();

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
    hydrateFromCache,
    applyMapCountyFromParcelPath,
    saveDetectedAsDefault,
    pendingSavePromptCounty,
    dismissSavePrompt,
    isSavingDefaultCounty,
    isBootstrapping: isCountyBootstrapping,
    isRefreshing: isCountyRefreshing,
  } = useSearchCountyScope(mapRef);

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth <= 768);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    if (!isMobile) return undefined;

    const handleClickOutside = (e) => {
      if (!e.target.closest('.mobile-top-bar-shell')) {
        if (showResults) setShowResults(false);
        if (showCountyFilter) setShowCountyFilter(false);
      }
    };

    if (showResults || showCountyFilter) {
      document.addEventListener('click', handleClickOutside);
      return () => document.removeEventListener('click', handleClickOutside);
    }
    return undefined;
  }, [showResults, showCountyFilter, isMobile]);

  useEffect(() => {
    if (!isMobile) return undefined;

    const handleMapInteraction = () => {
      setShowCountyFilter(false);
      setShowResults(false);
    };

    window.addEventListener('map-user-interaction', handleMapInteraction);
    document.addEventListener('map-user-interaction', handleMapInteraction);
    return () => {
      window.removeEventListener('map-user-interaction', handleMapInteraction);
      document.removeEventListener('map-user-interaction', handleMapInteraction);
    };
  }, [isMobile]);

  useEffect(() => {
    if (!isMaps) {
      setShowCountyFilter(false);
      setShowResults(false);
    }
  }, [isMaps]);

  const handleParcelSearchFocus = () => {
    setShowCountyFilter(true);
    setShowResults(false);
    hydrateFromCache();
    void bootstrapCountyScope();
  };

  const handleParcelSearch = async () => {
    const queryToRun = parcelQuery.trim();
    if (!queryToRun) return;

    setSearchResults([]);
    setShowResults(false);
    setShowCountyFilter(false);
    setHasMoreResults(false);
    setNextOffsetId(null);
    setActiveParcelQuery(queryToRun);
    setIsSearching(true);

    try {
      const response = await searchParcels(queryToRun, {
        limit: MOBILE_SEARCH_LIMIT,
        countyCodes,
        maxLimit: MOBILE_SEARCH_LIMIT,
      });
      const results = response.results || [];
      setSearchResults(results);
      setGlobalSearchResults(results);
      setHasMoreResults(response.hasMore);
      setNextOffsetId(response.nextOffsetId);
      setShowResults(true);
    } catch (error) {
      console.error('Mobile search failed:', error);
      setSearchResults([]);
      setHasMoreResults(false);
      setNextOffsetId(null);
      setShowResults(true);
    } finally {
      setIsSearching(false);
    }
  };

  const loadMoreMobileResults = async () => {
    if (!activeParcelQuery || !hasMoreResults || isLoadingMore || isSearching) return;
    if (nextOffsetId === null || nextOffsetId === undefined) return;

    setIsLoadingMore(true);
    try {
      const response = await searchParcels(activeParcelQuery, {
        limit: MOBILE_SEARCH_LIMIT,
        countyCodes,
        maxLimit: MOBILE_SEARCH_LIMIT,
        offsetId: nextOffsetId,
      });
      const moreResults = response.results || [];
      if (moreResults.length > 0) {
        setSearchResults((prev) => {
          const merged = [...prev, ...moreResults];
          setGlobalSearchResults(merged);
          return merged;
        });
      }
      setHasMoreResults(response.hasMore);
      setNextOffsetId(response.nextOffsetId);
    } catch (error) {
      console.error('Mobile load more failed:', error);
    } finally {
      setIsLoadingMore(false);
    }
  };

  const handleResultClick = (result) => {
    if (result?.path) {
      applyMapCountyFromParcelPath(result.path);
    }
    const features = Array.isArray(result) ? result.flat() : [result];
    setFocusFeatures(features);
    setIsMapTriggeredFromSearch((prev) => !prev);
    setTimeout(() => {
      setActiveTab('map');
      navigate('/map');
      setShowResults(false);
      setParcelQuery('');
    }, 200);
  };

  const goToDiscover = () => {
    setShowCountyFilter(false);
    setShowResults(false);
    setActiveTab('map');
    navigate({ pathname: '/map', search: location.search });
  };

  const goToMaps = () => {
    setShowCountyFilter(false);
    setShowResults(false);
    setActiveTab('print');
    navigate({ pathname: '/print', search: location.search });
  };

  if (!isMobile || (!isDiscover && !isMaps)) {
    return null;
  }

  return (
    <>
      <div className="mobile-top-bar-shell">
        <div className="mobile-top-bar">
        {isDiscover ? (
          <input
            type="search"
            className="mobile-top-bar-input"
            placeholder="Search parcels…"
            value={parcelQuery}
            onChange={(e) => setParcelQuery(e.target.value)}
            onFocus={handleParcelSearchFocus}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                handleParcelSearch();
              }
            }}
            aria-label="Search parcels"
          />
        ) : (
          <input
            type="search"
            className="mobile-top-bar-input"
            placeholder="Search maps…"
            value={mobileMapsSearchQuery}
            onChange={(e) => setMobileMapsSearchQuery(e.target.value)}
            aria-label="Search saved maps"
          />
        )}

        <button
          type="button"
          className="mobile-top-bar-view-btn"
          onClick={isDiscover ? goToMaps : goToDiscover}
          aria-label={isDiscover ? 'Open My Maps' : 'Open discover map'}
          title={isDiscover ? 'My Maps' : 'Discover map'}
        >
          {isDiscover ? <EditorViewIcon /> : <MapViewIcon />}
        </button>

        <MobileAccountControls className="mobile-top-bar-account" />
      </div>

      {isDiscover && showCountyFilter && (
        <div className="mobile-search-county-filter">
          <CountySearchScopeControls
            compact
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
        </div>
      )}

      {isDiscover && showResults && (
        <div className="mobile-search-results">
          <div className="mobile-search-results-header">
            <span>
              {searchResults.length > 0
                ? `${searchResults.length} results`
                : 'No results'}
            </span>
            <button
              type="button"
              className="mobile-search-close"
              onClick={() => setShowResults(false)}
            >
              ✕
            </button>
          </div>
          {searchResults.length > 0 && (
            <div className="mobile-search-results-list">
              {searchResults.map((result, index) => (
                <div
                  key={result.GFI || result.ll_uuid || index}
                  className="mobile-search-result-item"
                  onClick={() => handleResultClick(result)}
                >
                  <div className="mobile-search-result-owner">
                    {result.owner || result.owner_name || 'N/A'}
                  </div>
                  <div className="mobile-search-result-address">
                    {result.physical || result.physical_address || result.address || 'N/A'}
                  </div>
                  {result.county && (
                    <div className="mobile-search-result-county">{result.county}</div>
                  )}
                </div>
              ))}
            </div>
          )}
          {searchResults.length > 0 && hasMoreResults ? (
            <div className="mobile-search-show-more-row">
              <button
                type="button"
                className="mobile-search-show-more-button"
                onClick={() => void loadMoreMobileResults()}
                disabled={isLoadingMore || isSearching}
              >
                {isLoadingMore ? 'Loading…' : `Show ${MOBILE_SEARCH_LIMIT} more`}
              </button>
            </div>
          ) : null}
        </div>
      )}
      </div>

      {pendingSavePromptCounty ? (
        <SaveDefaultCountyPrompt
          county={pendingSavePromptCounty}
          onSave={() => saveDetectedAsDefault(pendingSavePromptCounty)}
          onDismiss={dismissSavePrompt}
          isSaving={isSavingDefaultCounty}
        />
      ) : null}
    </>
  );
}
