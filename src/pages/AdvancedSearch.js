// src/pages/AdvancedSearch.js
import React, { useState, useEffect } from 'react';
import './AdvancedSearch.css';

const AdvancedSearch = ({ onSearch, isLoading, onToggleTab, searchResults, selectedFeatureIds, onToggleFeatureSelection, onMapClick, onToggleSelectAllFeatures, onMapSelectedClick, onClearSelection, onPropertyDetailsClick }) => {
  // Search query and configuration
  const [searchQuery, setSearchQuery] = useState('');
  const [searchFields, setSearchFields] = useState(['owner', 'physical_address']);
  const [filters, setFilters] = useState({
    county: [],
    has_physical_address: false,
    owner_type: ''
  });
  const [sortBy, setSortBy] = useState('score');
  const [sortOrder] = useState('desc');
  const [limit, setLimit] = useState(50);

  // Available options
  const AVAILABLE_COUNTIES = [
    { display: "Fremont County", code: "fremont_county_wy" },
    { display: "Teton County, WY", code: "teton_county_wy" },
    { display: "Teton County, ID", code: "teton_county_id" },
    { display: "Sublette County", code: "sublette_county_wy" },
    { display: "Lincoln County", code: "lincoln_county_wy" }
  ];

  const SEARCH_FIELDS = [
    { value: 'owner', label: 'Owner Name' },
    { value: 'physical_address', label: 'Physical Address' },
    { value: 'pidn', label: 'Parcel ID' },
    { value: 'mailing_address', label: 'Mailing Address' }
  ];

  const SORT_FIELDS = [
    { value: 'score', label: 'Relevance' },
    { value: 'owner', label: 'Owner Name' },
    { value: 'county', label: 'County' },
    { value: 'physical_address', label: 'Physical Address' },
    { value: 'pidn', label: 'Parcel ID' }
  ];

  const OWNER_TYPES = [
    { value: '', label: 'Any Type' },
    { value: 'individual', label: 'Individual' },
    { value: 'business', label: 'Business' },
    { value: 'trust', label: 'Trust' }
  ];

  // Handle field selection
  const toggleSearchField = (field) => {
    setSearchFields(prev => 
      prev.includes(field)
        ? prev.filter(f => f !== field)
        : [...prev, field]
    );
  };

  // Handle county filter
  const toggleCountyFilter = (countyCode) => {
    setFilters(prev => ({
      ...prev,
      county: Array.isArray(prev.county) 
        ? (prev.county.includes(countyCode)
            ? prev.county.filter(c => c !== countyCode)
            : [...prev.county, countyCode])
        : [countyCode] // Initialize as array if it's not already
    }));
  };

  // Handle filter changes
  const handleFilterChange = (key, value) => {
    setFilters(prev => ({
      ...prev,
      [key]: value
    }));
  };

  // Execute advanced search
  const handleAdvancedSearch = () => {
    if (!searchQuery.trim()) return;

    const searchParams = {
      q: searchQuery,
      is_advanced: true,
      search_fields: searchFields.join(','),
      filters: JSON.stringify(filters),
      sort_by: sortBy,
      sort_order: sortOrder,
      limit: limit
    };

    onSearch(searchParams);
  };

  // Reset all filters
  const resetFilters = () => {
    setSearchFields(['owner', 'physical_address']);
    setFilters({
      county: [],
      has_physical_address: false,
      owner_type: ''
    });
    setSortBy('score');
    setLimit(50);
  };

  // Add event listener for the "Enter" key to trigger the search
  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === 'Enter' && !isLoading) {
        handleAdvancedSearch();
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [searchQuery, filters, searchFields, sortBy, sortOrder, limit, isLoading]);

  return (
    <div className="advanced-search-container">
      {/* Two-column layout */}
      <div className="advanced-search-layout">
        
        {/* LEFT SIDE - Search and Filters */}
        <div className="advanced-search-left-panel">
          {/* GREEN HEADER STYLE - like standard search */}
          <div className="advanced-search-header">
            
            {/* Title */}
            <div className="advanced-search-title">Advanced Search Results</div>
            
            {/* Search Bar */}
            <div className="search-bar">
              <input
                type="text"
                autoFocus
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Enter search terms..."
                disabled={isLoading}
              />
              <div className="search-controls">
                <button 
                  onClick={handleAdvancedSearch} 
                  disabled={isLoading || !searchQuery.trim()}
                >
                  {isLoading ? 'Searching...' : 'Search'}
                </button>
                <select 
                  value={limit} 
                  onChange={(e) => setLimit(Number(e.target.value))}
                  disabled={isLoading}
                  className="search-limit-select"
                >
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                  <option value={200}>200</option>
                </select>
              </div>
            </div>

            {/* Action Buttons for Results - moved below search controls */}
            {searchResults && searchResults.length > 0 && (
              <div className="header-action-buttons">
                <button
                  className="action-button select-all-button"
                  onClick={onToggleSelectAllFeatures}
                  disabled={searchResults.length === 0 || isLoading}
                >
                  {selectedFeatureIds.length === searchResults.length
                    ? 'Deselect All Features'
                    : 'Select All Features'}
                </button>
                <button
                  className="action-button map-selected-button"
                  onClick={onMapSelectedClick}
                  disabled={selectedFeatureIds.length === 0 || isLoading}
                >
                  Map Selected Features
                </button>
                <button
                  className="action-button clear-selection-button"
                  onClick={onClearSelection}
                  disabled={selectedFeatureIds.length === 0 || isLoading}
                >
                  Clear Selection
                </button>
              </div>
            )}

            {/* County Filter */}
            <div className="county-filter">
              <label>Filter by Counties:</label>
              <div className="county-checkboxes">
                {AVAILABLE_COUNTIES.map(county => (
                  <label key={county.code} className="county-checkbox">
                    <input
                      type="checkbox"
                      checked={filters.county.includes(county.code)}
                      onChange={() => toggleCountyFilter(county.code)}
                      disabled={isLoading}
                    />
                    {county.display}
                  </label>
                ))}
              </div>
            </div>

            {/* Advanced Search Fields */}
            <div className="advanced-search-fields">
              <label className="advanced-label">Search Fields:</label>
              <div className="advanced-search-description">
                Select the fields you want to search within. Your search terms will be looked for in these selected fields only.
              </div>
              <div className="field-checkboxes">
                {SEARCH_FIELDS.map(field => (
                  <label key={field.value} className="field-checkbox">
                    <input
                      type="checkbox"
                      checked={searchFields.includes(field.value)}
                      onChange={() => toggleSearchField(field.value)}
                    />
                    {field.label}
                  </label>
                ))}
              </div>
            </div>

            {/* Additional Filters */}
            <div className="advanced-filters">
              <div className="filter-group">
                <label className="filter-label">
                  <input
                    type="checkbox"
                    checked={filters.has_physical_address}
                    onChange={(e) => handleFilterChange('has_physical_address', e.target.checked)}
                  />
                  Only properties with physical addresses
                </label>
              </div>

              <div className="filter-group">
                <label className="filter-label">Owner Type:</label>
                <select
                  value={filters.owner_type}
                  onChange={(e) => handleFilterChange('owner_type', e.target.value)}
                  className="filter-select"
                >
                  {OWNER_TYPES.map(type => (
                    <option key={type.value} value={type.value}>
                      {type.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="filter-group">
                <label className="filter-label">Sort by:</label>
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value)}
                  className="filter-select"
                >
                  {SORT_FIELDS.map(field => (
                    <option key={field.value} value={field.value}>
                      {field.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Action Buttons - moved below filters */}
            <div className="action-buttons">
              <button onClick={resetFilters} className="reset-button">
                Reset All Filters
              </button>
            </div>
          </div>
        </div>

        {/* RIGHT SIDE - Search Results */}
        <div className="advanced-search-right-panel">
          {/* Show loading and no results states */}
          {isLoading && (
            <div className="loading-indicator">Searching...</div>
          )}

          {searchResults && searchResults.length === 0 && !isLoading && (
            <div className="no-results">No results found.</div>
          )}

          {/* RESULTS DISPLAY - copy the exact structure from Search.js */}
          {searchResults && searchResults.length > 0 && (
            <div className="search-results-container">
              <ul className="search-results-list">
                {searchResults.map((result, index) => {
                  const isSelected = selectedFeatureIds.includes(result.GFI);
                  
                  return (
                    <li key={index} className={`search-result-item ${index % 2 === 0 ? 'even' : 'odd'}`}>
                      <div className="result-content">
                        <div className="result-checkbox">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => onToggleFeatureSelection(result)}
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
                              <button className="map-it-button" onClick={() => onMapClick(result)}>Map</button>
                              <button
                                className="property-details-button"
                                onClick={() => onPropertyDetailsClick(result)}
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
      </div>
    </div>
  );
};

export default AdvancedSearch;
