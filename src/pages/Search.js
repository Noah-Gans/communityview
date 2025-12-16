import React, { useState, useEffect } from 'react';
import './Search.css';
import AdvancedSearch from './AdvancedSearch';
import { useNavigate } from 'react-router-dom';
import { useMapContext } from './MapContext';
import { useUser } from '../contexts/UserContext';
import FeatureGate from '../components/FeatureGate';
import PropertyDetailsPopup from '../components/PropertyDetailsPopup';

// Available counties for the filter dropdown - using exact backend county codes
const AVAILABLE_COUNTIES = [
  { display: "Fremont County", code: "fremont_county_wy" },
  { display: "Teton County, WY", code: "teton_county_wy" },
  { display: "Teton County, ID", code: "teton_county_id" },
  { display: "Sublette County", code: "sublette_county_wy" },
  { display: "Lincoln County", code: "lincoln_county_wy" }
];

const Search = () => {
  const [activeSearchTab, setActiveSearchTab] = useState('standard');
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchTriggered, setIsSearchTriggered] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedCountyCodes, setSelectedCountyCodes] = useState([]);
  const [searchLimit, setSearchLimit] = useState(50);
  const navigate = useNavigate();
  const [selectedFeatureIds, setSelectedFeatureIds] = useState([]);
  const [showPropertyDetailsPopup, setShowPropertyDetailsPopup] = useState(false);
  const [selectedPropertyFeature, setSelectedPropertyFeature] = useState(null);
  
  const { focusFeatures, setFocusFeatures, searchResults, setSearchResults, setSelectedFeatures, isMapTriggeredFromSearch, setIsMapTriggeredFromSearch, setActiveTab} = useMapContext();
  
  console.log('🔍 Search component render - searchResults length:', searchResults?.length || 0);
  console.log('🔍 Search component render - loading state:', isLoading);
  
  // Add this mapping function at the top-level of the component
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

  // Handle county filter changes
  const handleCountyFilterChange = (countyCode) => {
    setSelectedCountyCodes(prev => 
      prev.includes(countyCode) 
        ? prev.filter(c => c !== countyCode)
        : [...prev, countyCode]
    );
  };

  // API search function with new backend parameters
  const searchAPI = async (query, limit = 50, countyCodes = []) => {
    try {
      setIsLoading(true);
      console.log('🔍 Starting API search with:', { query, limit, countyCodes });
      console.log('🌐 Current hostname:', window.location.hostname);
      console.log('🌐 User agent:', navigator.userAgent);
      
      const params = new URLSearchParams({
        q: query,
        limit: limit.toString()
      });
      
      // Only add counties parameter if specific counties are selected
      if (countyCodes.length > 0) {
        params.append('counties', countyCodes.join(','));
      }
      
      console.log('🔍 Counties:', params);
      console.log('🔍 Full params object:', params.toString());
      const url = `https://34.10.19.103.nip.io/search/search?${params}`;
      console.log('📡 API URL:', url);
      console.log('📡 Full URL being called:', url);
      console.log('🌐 Current origin:', window.location.origin);
      console.log('🌐 Current hostname:', window.location.hostname);
      
      // Try fetch with different configurations
      let response;
      try {
        console.log('📡 Attempting fetch...');
        response = await fetch(url, {
          method: 'GET',
          headers: {
            'Accept': 'application/json',
          },
          // Try without explicit CORS mode first (defaults to 'cors' but might work better)
          credentials: 'omit'
        });
        console.log('📡 Fetch completed, response received');
      } catch (fetchError) {
        console.error('❌ Fetch failed immediately:', fetchError);
        console.error('❌ Fetch error name:', fetchError?.name);
        console.error('❌ Fetch error message:', fetchError?.message);
        throw fetchError;
      }
      
      console.log('📡 Response status:', response.status);
      console.log('📡 Response ok:', response.ok);
      console.log('📡 Response type:', response.type);
      
      try {
        const headers = {};
        response.headers.forEach((value, key) => {
          headers[key] = value;
        });
        console.log('📡 Response headers:', headers);
      } catch (e) {
        console.log('📡 Could not read headers:', e);
      }
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ HTTP error response:', errorText);
        throw new Error(`HTTP error! status: ${response.status}, message: ${errorText}`);
      }
      
      const data = await response.json();
      console.log('✅ API Response:', data);
      
      return data.results || [];
    } catch (error) {
      console.error('❌ Search API error:', error);
      console.error('❌ Error type:', typeof error);
      console.error('❌ Error name:', error?.name);
      console.error('❌ Error message:', error?.message);
      console.error('❌ Error stack:', error?.stack);
      console.error('❌ Full error object:', JSON.stringify(error, Object.getOwnPropertyNames(error)));
      
      // Check for specific error types
      if (error?.name === 'TypeError' && error?.message?.includes('fetch')) {
        console.error('🌐 Network/Fetch error - phone may not be able to reach the server');
        console.error('💡 This usually means:');
        console.error('   1) Phone and Mac not on same WiFi network');
        console.error('   2) Server is not accessible from phone');
        console.error('   3) CORS issue - server blocking requests');
        console.error('   4) SSL certificate issue');
      } else if (error?.message?.includes('Failed to fetch') || error?.message?.includes('NetworkError')) {
        console.error('🌐 Network error - phone may not be able to reach the server');
        console.error('💡 Check: 1) Phone and Mac on same WiFi, 2) Server is accessible, 3) No firewall blocking');
      } else if (!error || Object.keys(error).length === 0) {
        console.error('⚠️ Empty error object - this usually indicates a network failure or CORS issue');
        console.error('💡 Try: 1) Check if server is running, 2) Test URL in Safari on phone, 3) Check CORS headers');
      }
      
      return [];
    } finally {
      setIsLoading(false);
    }
  };

  // Handle feature selection toggle
  const toggleFeatureSelection = (feature) => {
    const featureId = feature.GFI; // Use new unique identifier
    setSelectedFeatureIds((prevSelected) =>
      prevSelected.includes(featureId)
        ? prevSelected.filter((id) => id !== featureId)
        : [...prevSelected, featureId]
    );
  };

  // Handle "Select All Features" toggle
  const toggleSelectAllFeatures = () => {
    if (selectedFeatureIds.length === searchResults.length) {
      // Deselect all
      setSelectedFeatureIds([]);
    } else {
      // Select all valid features
      const allFeatureIds = searchResults.map((result) => result.GFI).filter(Boolean);
      setSelectedFeatureIds(allFeatureIds);
    }
  };

  const handleMapSelectedClick = () => {
    const selectedFeatures = searchResults.filter((feature) =>
      selectedFeatureIds.includes(feature.GFI)
    );
    setFocusFeatures(selectedFeatures);
    setIsMapTriggeredFromSearch(true);
    setActiveTab('map');
    navigate('/map');
  };
  
  // Handle search input
  const handleSearch = async () => {
    if (!searchQuery.trim()) {
      console.log('⚠️ Empty search query');
      return;
    }
    
    console.log('🔍 Search triggered with query:', searchQuery);
    console.log('🏷️ Selected counties:', selectedCountyCodes);
    console.log('📊 Search limit:', searchLimit);
    
    setIsSearchTriggered(true);
    const apiResults = await searchAPI(searchQuery, searchLimit, selectedCountyCodes);
    const results = apiResults.map(mapLegacyFields);
    setSearchResults(results);
    
    console.log(`✅ Search results for query "${searchQuery}":`);
    console.log(`📊 Total results found: ${results.length}`);
    results.slice(0, 3).forEach((result, index) => {
      console.log(`Result ${index + 1}:`, result);
    });
    if (results.length > 3) {
      console.log(`... and ${results.length - 3} more results`);
    }
    setSelectedFeatureIds([]); // Reset selected features on new search
  };

  // Handle "Map It" button click
  const handleMapClick = (result) => {
    console.log('🗺️ Map It clicked for result:', result);
    console.log('📊 Result structure:', {
      hasBbox: !!result.bbox,
      hasGlobalParcelUid: !!result.global_parcel_uid,
      bbox: result.bbox,
      global_parcel_uid: result.global_parcel_uid
    });
    
    const features = Array.isArray(result) ? result.flat() : [result];
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

  // Handle Property Details button click
  const handlePropertyDetailsClick = (result) => {
    // Convert search result to feature-like object for PropertyDetailsPopup
    const feature = {
      properties: {
        GFI: result.GFI,
        county_parcel_id: result.county_parcel_id,
        owner: result.owner || result.owner_name,
        owner_name: result.owner || result.owner_name,
        physical: result.physical || result.physical_address,
        physical_address: result.physical || result.physical_address,
        mail: result.mail || result.mailing_address,
        mailing_address: result.mail || result.mailing_address,
        county: result.county,
        county_code: result.county_code,
        state: result.state,
        property_details_key: result.property_details_key,
        tax_details_key: result.tax_details_key,
        clerk_records_key: result.clerk_records_key,
      }
    };
    
    setSelectedPropertyFeature(feature);
    setShowPropertyDetailsPopup(true);
  };
  
  // Add event listener for the "Enter" key to trigger the search
  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === 'Enter' && !isLoading) {
        if (activeSearchTab === 'standard') {
          handleSearch();
        }
        // Note: Advanced search handles Enter key internally
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [searchQuery, selectedCountyCodes, searchLimit, isLoading, activeSearchTab]);

  // ✅ Updated Advanced Search function to match your API structure
  const handleAdvancedSearch = async (searchParams) => {
    try {
      setIsLoading(true);
      console.log('🔍 Starting Advanced API search with:', searchParams);
      
      const params = new URLSearchParams({
        q: searchParams.q,
        is_advanced: 'true',
        search_fields: searchParams.search_fields
      });
      
      // ✅ For advanced search, send the filters JSON as-is
      if (searchParams.filters) {
        params.append('filters', searchParams.filters);
      }
      
      // ✅ Add sorting and limit
      if (searchParams.sort_by) {
        params.append('sort_by', searchParams.sort_by);
      }
      
      if (searchParams.sort_order) {
        params.append('sort_order', searchParams.sort_order);
      }
      
      if (searchParams.limit) {
        params.append('limit', searchParams.limit.toString());
      }
      
      const url = `https://34.10.19.103.nip.io/search/search?${params}`;
      console.log('📡 Advanced Search API URL:', url);
      console.log('🌐 Current hostname:', window.location.hostname);
      
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
        },
        mode: 'cors',
        credentials: 'omit'
      });
      
      console.log('📡 Advanced Search Response status:', response.status);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ Advanced Search HTTP error response:', errorText);
        throw new Error(`HTTP error! status: ${response.status}, message: ${errorText}`);
      }
      
      const data = await response.json();
      console.log('✅ Advanced Search API Response:', data);
      
      const results = (data.results || []).map(mapLegacyFields);
      console.log('🔄 Mapped results:', results);
      
      setSearchResults(results);
      setSelectedFeatureIds([]); // Reset selected features
      setIsSearchTriggered(true); // ✅ Set search as triggered
      
    } catch (error) {
      console.error('❌ Advanced Search API error:', error);
      console.error('❌ Error name:', error.name);
      console.error('❌ Error message:', error.message);
      console.error('❌ Error stack:', error.stack);
      
      if (error.message.includes('Failed to fetch') || error.message.includes('NetworkError')) {
        console.error('🌐 Network error - phone may not be able to reach the server');
        console.error('💡 Check: 1) Phone and Mac on same WiFi, 2) Server is accessible, 3) No firewall blocking');
      }
      
      setSearchResults([]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="search-container">
      <div className="search-content">
        {/* Tab Toggle Buttons */}
        <div className="search-tabs">
          <button
            className={`search-tab-button ${activeSearchTab === 'standard' ? 'search-tab-active' : 'search-tab-inactive'}`}
            onClick={() => setActiveSearchTab('standard')}
          >
            Standard Search
          </button>
          <button
            className={`search-tab-button ${activeSearchTab === 'advanced' ? 'search-tab-active' : 'search-tab-inactive'}`}
            onClick={() => setActiveSearchTab('advanced')}
          >
            Advanced Search
          </button>
        </div>

        {/* Standard Search Tab */}
        {activeSearchTab === 'standard' && (
          <div className="search-tab-panel">
            <div className="search-bar-and-actions-container">
              {/* Search Bar */}
              <div className="search-bar">
                <input
                  type="text"
                  autoFocus
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search by owner, address, PIDN..."
                  disabled={isLoading}
                />
                <button onClick={handleSearch} disabled={isLoading || !searchQuery.trim()}>
                  {isLoading ? 'Searching...' : 'Search'}
                </button>
              </div>

              {/* County Filter (Desktop - checkboxes) */}
              <div className="county-filter county-filter-desktop">
                <label>Filter by Counties:</label>
                <div className="county-checkboxes">
                  {AVAILABLE_COUNTIES.map(county => (
                    <label key={county.code} className="county-checkbox">
                      <input
                        type="checkbox"
                        checked={selectedCountyCodes.includes(county.code)}
                        onChange={() => handleCountyFilterChange(county.code)}
                        disabled={isLoading}
                      />
                      {county.display}
                    </label>
                  ))}
                </div>
              </div>

              {/* County Filter + Results Limit Row (Mobile - dropdowns) */}
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
                  {AVAILABLE_COUNTIES.map(county => (
                    <option key={county.code} value={county.code}>
                      {county.display}
                    </option>
                  ))}
                </select>
                <select 
                  value={searchLimit} 
                  onChange={(e) => setSearchLimit(Number(e.target.value))}
                  disabled={isLoading}
                  className="search-limit-select"
                >
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                  <option value={200}>200</option>
                </select>
              </div>

              {/* Action Buttons - moved to header */}
              {searchResults.length > 0 && (
                <div className="header-action-buttons">
                  <button
                    className="action-button select-all-button"
                    onClick={toggleSelectAllFeatures}
                    disabled={searchResults.length === 0 || isLoading}
                  >
                    {selectedFeatureIds.length === searchResults.length
                      ? 'Deselect All Features'
                      : 'Select All Features'}
                  </button>
                  <button
                    className="action-button map-selected-button"
                    onClick={handleMapSelectedClick}
                    disabled={selectedFeatureIds.length === 0 || isLoading}
                  >
                    Map Selected Features
                  </button>
                  <button
                    className="action-button clear-selection-button"
                    onClick={() => setSelectedFeatureIds([])}
                    disabled={selectedFeatureIds.length === 0 || isLoading}
                  >
                    Clear Selection
                  </button>
                </div>
              )}
            </div>
            
            {/* ✅ Results for STANDARD search only */}
            {isSearchTriggered && searchResults.length === 0 && !isLoading && (
              <div className="no-results">No results found.</div>
            )}

            {isLoading && (
              <div className="loading-indicator">Searching...</div>
            )}

            {/* ✅ Show search results for BOTH search types */}
            {searchResults.length > 0 && (
              <div className="search-results-container">
                <ul className="search-results-list">
                  {searchResults.map((result, index) => {
                    // Use new field names
                    const isSelected = selectedFeatureIds.includes(result.GFI);

                    return (
                      <li key={index} className={`search-result-item ${index % 2 === 0 ? 'even' : 'odd'}`}>
                        <div className="result-content">
                          <div className="result-checkbox">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => toggleFeatureSelection(result)}
                            />
                          </div>

                          <div className="result-body">
                            <div className="result-details">
                              <strong>Owner:</strong> {result.owner || result.owner_name || 'N/A'}<br />
                              <strong>Parcel ID:</strong> {result.county_parcel_id || 'N/A'}<br />
                              <strong>County, State:</strong> {result.county || 'N/A'}, {result.state || 'N/A'}<br />
                              <strong>Mail Addr:</strong> {result.mail || 'N/A'}<br />
                              <strong>Physical Addr:</strong> {result.physical || 'N/A'}<br />
                            </div>

                            <div className="result-buttons">
                              <div className="result-buttons-grid">
                                <button className="map-it-button" onClick={() => handleMapClick(result)}>Map</button>
                                <button
                                  className="property-details-button"
                                  onClick={() => handlePropertyDetailsClick(result)}
                                >
                                  Property Details
                                </button>
                              </div>
                            </div>
                          </div>
                        </div>
                        <hr />
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </div>
        )}

        {/* Advanced Search Tab */}
        {activeSearchTab === 'advanced' && (
          <FeatureGate featureName="advanced_search">
            <AdvancedSearch
              onSearch={handleAdvancedSearch}
              isLoading={isLoading}
              onToggleTab={setActiveSearchTab}
              searchResults={searchResults}
              selectedFeatureIds={selectedFeatureIds}
              onToggleFeatureSelection={toggleFeatureSelection}
              onMapClick={handleMapClick}
              onToggleSelectAllFeatures={toggleSelectAllFeatures}
              onMapSelectedClick={handleMapSelectedClick}
              onClearSelection={() => setSelectedFeatureIds([])}
              onPropertyDetailsClick={handlePropertyDetailsClick}
            />
          </FeatureGate>
        )}
      </div>
      
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

export default Search;
