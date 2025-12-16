import React, { useState, useEffect } from 'react';
import './MobileSearch.css';
import { useMapContext } from '../pages/MapContext';
import { useNavigate } from 'react-router-dom';

const AVAILABLE_COUNTIES = [
  { display: "Fremont County", code: "fremont_county_wy" },
  { display: "Teton County, WY", code: "teton_county_wy" },
  { display: "Teton County, ID", code: "teton_county_id" },
  { display: "Sublette County", code: "sublette_county_wy" },
  { display: "Lincoln County", code: "lincoln_county_wy" }
];

const MobileSearch = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState([]);
  const [showResults, setShowResults] = useState(false);
  const [selectedCountyCodes, setSelectedCountyCodes] = useState([]);
  const [showCountyFilter, setShowCountyFilter] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);
  const { setFocusFeatures, setIsMapTriggeredFromSearch, setActiveTab, setSearchResults: setGlobalSearchResults } = useMapContext();
  const navigate = useNavigate();

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth <= 768);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Close results and county filter when clicking outside
  useEffect(() => {
    if (!isMobile) return;
    
    const handleClickOutside = (e) => {
      if (!e.target.closest('.mobile-search-container')) {
        if (showResults) {
          setShowResults(false);
        }
        if (showCountyFilter) {
          setShowCountyFilter(false);
        }
      }
    };

    if (showResults || showCountyFilter) {
      document.addEventListener('click', handleClickOutside);
      return () => document.removeEventListener('click', handleClickOutside);
    }
  }, [showResults, showCountyFilter, isMobile]);

  // Close filter dropdown when user interacts with map
  useEffect(() => {
    if (!isMobile) return;

    const handleMapInteraction = () => {
      if (showCountyFilter) {
        setShowCountyFilter(false);
      }
    };

    // Listen on both window and document in case the event is dispatched on either
    window.addEventListener('map-user-interaction', handleMapInteraction);
    document.addEventListener('map-user-interaction', handleMapInteraction);
    
    return () => {
      window.removeEventListener('map-user-interaction', handleMapInteraction);
      document.removeEventListener('map-user-interaction', handleMapInteraction);
    };
  }, [isMobile, showCountyFilter]);

  // Map legacy fields function
  const mapLegacyFields = (result) => ({
    ...result,
    GFI: result.global_parcel_uid || result.GFI || result.pidn || '',
    mail: result.mailing_address || result.mail || '',
    physical: result.physical_address || result.physical || '',
    county_parcel_id: result.pidn || result.county_parcel_id || '',
    property_details_key: result.property_det || result.property_details_key || '',
    tax_details_key: result.tax_info || result.tax_details_key || '',
    clerk_records_key: result.clerk_rec || result.clerk_records_key || '',
  });

  // API search function
  const searchAPI = async (query, limit = 50, countyCodes = []) => {
    try {
      setIsSearching(true);
      console.log('🔍 MobileSearch: Starting API search with:', { query, limit, countyCodes });
      
      const params = new URLSearchParams({
        q: query,
        limit: limit.toString()
      });
      
      if (countyCodes.length > 0) {
        params.append('counties', countyCodes.join(','));
      }
      
      // Use the correct production API URL (same as Search.js)
      const url = `https://34.10.19.103.nip.io/search/search?${params}`;
      console.log('📡 MobileSearch: API URL:', url);
      console.log('🌐 MobileSearch: Current origin:', window.location.origin);
      console.log('🌐 MobileSearch: Current hostname:', window.location.hostname);
      
      console.log('📡 MobileSearch: Attempting fetch...');
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
        },
        credentials: 'omit'
      });
      
      console.log('📡 MobileSearch: Fetch completed, response received');
      console.log('📡 MobileSearch: Response status:', response.status);
      console.log('📡 MobileSearch: Response ok:', response.ok);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ MobileSearch: HTTP error response:', errorText);
        throw new Error(`HTTP error! status: ${response.status}, message: ${errorText}`);
      }
      
      const data = await response.json();
      console.log('✅ MobileSearch: API Response:', data);
      
      return data.results || [];
    } catch (error) {
      console.error('❌ MobileSearch: Search API error:', error);
      console.error('❌ MobileSearch: Error type:', typeof error);
      console.error('❌ MobileSearch: Error name:', error?.name);
      console.error('❌ MobileSearch: Error message:', error?.message);
      console.error('❌ MobileSearch: Error stack:', error?.stack);
      
      if (error?.name === 'TypeError' && error?.message?.includes('fetch')) {
        console.error('🌐 MobileSearch: Network/Fetch error - phone may not be able to reach the server');
      } else if (!error || Object.keys(error).length === 0) {
        console.error('⚠️ MobileSearch: Empty error object - network failure or CORS issue');
      }
      
      return [];
    } finally {
      setIsSearching(false);
    }
  };

  // Handle county filter toggle
  const toggleCountyFilter = (countyCode) => {
    setSelectedCountyCodes(prev => 
      prev.includes(countyCode) 
        ? prev.filter(c => c !== countyCode)
        : [...prev, countyCode]
    );
  };

  // Handle search button click
  const handleSearch = async () => {
    if (!searchQuery.trim()) {
      return;
    }
    
    // Clear old results immediately when starting a new search
    setSearchResults([]);
    setShowResults(false);
    setShowCountyFilter(false);
    
    const apiResults = await searchAPI(searchQuery, 50, selectedCountyCodes);
    const results = apiResults.map(mapLegacyFields);
    setSearchResults(results);
    setGlobalSearchResults(results);
    setShowResults(true);
  };

  // Handle result click - navigate to map with feature focused
  const handleResultClick = (result) => {
    const features = Array.isArray(result) ? result.flat() : [result];
    
    setFocusFeatures(features);
    setIsMapTriggeredFromSearch((prev) => !prev); // Toggle to force update
    
    setTimeout(() => {
      setActiveTab('map');
      navigate('/map');
      setShowResults(false);
      setSearchQuery('');
    }, 200);
  };

  if (!isMobile) {
    return null;
  }

  return (
    <div className="mobile-search-container">
      <div className="mobile-search-bar">
        <input
          type="text"
          className="mobile-search-input"
          placeholder="Search parcels..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          onFocus={() => {
            // Close filter panel when user clicks back to search input
            if (showCountyFilter) {
              setShowCountyFilter(false);
            }
          }}
          onKeyPress={(e) => {
            if (e.key === 'Enter') {
              handleSearch();
            }
          }}
        />
        <button
          className={`mobile-search-filter-button ${selectedCountyCodes.length > 0 ? 'active' : ''}`}
          onClick={() => setShowCountyFilter(!showCountyFilter)}
          title="Filter by county"
        >
          Filter
          {selectedCountyCodes.length > 0 && (
            <span className="filter-badge">{selectedCountyCodes.length}</span>
          )}
        </button>
      </div>
      
      {showCountyFilter && (
        <div className="mobile-search-county-filter">
          <div className="mobile-search-county-filter-header">
            <span>Filter by County</span>
            {selectedCountyCodes.length > 0 && (
              <button
                className="mobile-search-clear-filter"
                onClick={() => setSelectedCountyCodes([])}
              >
                Clear
              </button>
            )}
          </div>
          <div className="mobile-search-county-chips">
            {AVAILABLE_COUNTIES.map((county) => (
              <button
                key={county.code}
                className={`mobile-search-county-chip ${selectedCountyCodes.includes(county.code) ? 'selected' : ''}`}
                onClick={() => toggleCountyFilter(county.code)}
              >
                {county.display}
              </button>
            ))}
          </div>
        </div>
      )}
      
      {showResults && searchResults.length > 0 && (
        <div className="mobile-search-results">
          <div className="mobile-search-results-header">
            <span>{searchResults.length} results</span>
            <button
              className="mobile-search-close"
              onClick={() => setShowResults(false)}
            >
              ✕
            </button>
          </div>
          <div className="mobile-search-results-list">
            {searchResults.map((result, index) => (
              <div
                key={result.GFI || index}
                className="mobile-search-result-item"
                onClick={() => handleResultClick(result)}
              >
                <div className="mobile-search-result-owner">
                  {result.owner || result.owner_name || 'N/A'}
                </div>
                <div className="mobile-search-result-address">
                  {result.physical || result.physical_address || 'N/A'}
                </div>
                {result.county && (
                  <div className="mobile-search-result-county">
                    {result.county}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default MobileSearch;

