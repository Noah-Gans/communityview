import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import './MapQuickSearch.css';

const MapQuickSearch = () => {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');

  const submitSearch = () => {
    const trimmed = query.trim();
    if (!trimmed) return;
    navigate(`/search?q=${encodeURIComponent(trimmed)}`);
  };

  return (
    <div className="map-quick-search-container">
      <div className="map-quick-search-bar">
        <input
          type="text"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') submitSearch();
          }}
          placeholder="Search owner, address, or APN"
          className="map-quick-search-input"
        />
        <button
          type="button"
          className="map-quick-search-button"
          onClick={submitSearch}
          disabled={!query.trim()}
        >
          Search
        </button>
      </div>
    </div>
  );
};

export default MapQuickSearch;
