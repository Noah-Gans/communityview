import React from 'react';
import '../MainHeader.css';
import './PrintDashboard.css';

function SearchIcon() {
  return (
    <svg className="print-dashboard-search-icon" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
      <path d="M20 20L16.5 16.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export default function PrintDashboard({
  isLoading,
  searchQuery,
  setSearchQuery,
  filteredMaps,
  currentMapId,
  onCreateNewMap,
  onLoadMap,
  onShareMap,
  onDeleteMap,
  formatDate,
}) {
  return (
    <div className="maps-dashboard">
      <div className="print-dashboard-inner">
        <div className="print-dashboard-heading">
          <h1 className="print-dashboard-title">Saved Maps</h1>
        </div>

        <div className="print-dashboard-search-section">
          <div className="print-dashboard-search-wrap">
            <SearchIcon />
            <input
              type="search"
              className="print-dashboard-search-input"
              placeholder="Search by map name"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              aria-label="Search saved maps"
            />
          </div>
        </div>

        <div className="print-dashboard-create-row">
          <button type="button" className="header-print-action-btn" onClick={onCreateNewMap}>
            + Create New Map
          </button>
        </div>

        {!isLoading && filteredMaps.length > 0 && (
          <div className="print-dashboard-table-head">
            <span>Map Name</span>
            <span>Last Updated</span>
            <span />
          </div>
        )}

        {isLoading ? (
          <p className="print-dashboard-empty">Loading maps...</p>
        ) : filteredMaps.length === 0 ? (
          <p className="print-dashboard-empty">
            {searchQuery ? 'No maps found matching your search.' : 'No saved maps yet. Create your first map!'}
          </p>
        ) : (
          <ul className="print-dashboard-list">
            {filteredMaps.map((map) => (
              <li key={map.id}>
                  <div
                    className={`print-dashboard-row${currentMapId === map.id ? ' is-active' : ''}`}
                    onClick={() => onLoadMap(map.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      onLoadMap(map.id);
                    }
                  }}
                  role="button"
                  tabIndex={0}
                >
                    <div className="print-dashboard-row-main">
                      <div className="print-dashboard-row-title">{map.title || 'Untitled Map'}</div>
                    {map.description ? (
                      <div className="print-dashboard-row-desc" title={map.description}>
                        {map.description}
                      </div>
                    ) : null}
                  </div>
                  <div className="print-dashboard-row-date">{formatDate(map.updatedAt)}</div>
                  <div
                    className="print-dashboard-row-actions"
                    onClick={(e) => e.stopPropagation()}
                    role="group"
                    aria-label="Map actions"
                  >
                    <button
                      type="button"
                      className="print-dashboard-row-btn print-dashboard-row-btn--primary"
                      onClick={(e) => {
                        e.stopPropagation();
                        onLoadMap(map.id);
                      }}
                    >
                      Edit map
                    </button>
                    <button
                      type="button"
                      className="print-dashboard-row-btn print-dashboard-row-btn--share"
                      onClick={(e) => onShareMap(map.id, e)}
                    >
                      Share Map
                    </button>
                    <button
                      type="button"
                      className="print-dashboard-row-btn print-dashboard-row-btn--delete"
                      onClick={(e) => onDeleteMap(map.id, e)}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
