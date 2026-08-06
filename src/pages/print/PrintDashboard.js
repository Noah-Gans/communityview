import React, { useEffect, useState } from 'react';
import '../MainHeader.css';
import './PrintDashboard.css';
import { copyMapShareLink, getMapShareUrls, openMapSharePreview } from '../../utils/mapShareLinks';

function SearchIcon() {
  return (
    <svg className="print-dashboard-search-icon" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
      <path d="M20 20L16.5 16.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function PreviewMapIcon() {
  return (
    <svg className="print-dashboard-action-icon" viewBox="0 0 24 24" fill="none" aria-hidden>
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

function PreviewTourIcon() {
  return (
    <svg className="print-dashboard-action-icon" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8" />
      <path d="M10 8.5v7l5.5-3.5L10 8.5z" fill="currentColor" stroke="none" />
    </svg>
  );
}

function ShareLinkIcon() {
  return (
    <svg className="print-dashboard-action-icon" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="9" y="9" width="11" height="13" rx="2" stroke="currentColor" strokeWidth="1.8" />
      <path
        d="M7 15H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v1"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

function CopiedIcon() {
  return (
    <svg className="print-dashboard-action-icon" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M5 13l4 4L19 7"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function PrintDashboard({
  isLoading,
  searchQuery,
  setSearchQuery,
  filteredMaps,
  currentMapId,
  isMobile = false,
  onCreateNewMap,
  onLoadMap,
  onShareMap,
  onDeleteMap,
  onMapsUpdated,
  formatDate,
}) {
  const [actionBusyId, setActionBusyId] = useState(null);
  const [actionError, setActionError] = useState(null);
  const [copiedActionKey, setCopiedActionKey] = useState(null);
  const [deleteConfirmMap, setDeleteConfirmMap] = useState(null);

  const deleteBusy = deleteConfirmMap && actionBusyId === deleteConfirmMap.id;

  useEffect(() => {
    if (!deleteConfirmMap) return undefined;

    const onKeyDown = (event) => {
      if (event.key === 'Escape' && !deleteBusy) {
        setDeleteConfirmMap(null);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [deleteConfirmMap, deleteBusy]);

  const runMapAction = async (mapId, action) => {
    setActionBusyId(mapId);
    setActionError(null);
    try {
      await action();
    } catch (error) {
      setActionError(error?.message || 'Something went wrong.');
    } finally {
      setActionBusyId(null);
    }
  };

  const closeDeleteConfirm = () => {
    if (!deleteBusy) setDeleteConfirmMap(null);
  };

  const confirmDeleteMap = async () => {
    if (!deleteConfirmMap || typeof onDeleteMap !== 'function') return;
    const mapId = deleteConfirmMap.id;
    await runMapAction(mapId, async () => {
      await onDeleteMap(mapId);
      setDeleteConfirmMap(null);
    });
  };

  const renderMobileShareActions = (map) => {
    const urls = getMapShareUrls(map.shareToken);
    const busy = actionBusyId === map.id;

    if (!map.shareToken) {
      return (
        <p className="print-dashboard-mobile-share-note">Save on desktop to enable sharing.</p>
      );
    }

    const mapCopied = copiedActionKey === `${map.id}-map`;
    const tourCopied = copiedActionKey === `${map.id}-tour`;

    const copyLink = async (kind, url) => {
      await copyMapShareLink({
        mapId: map.id,
        isPublic: map.isPublic,
        url,
        onMapsUpdated,
      });
      const key = `${map.id}-${kind}`;
      setCopiedActionKey(key);
      window.setTimeout(() => {
        setCopiedActionKey((current) => (current === key ? null : current));
      }, 2000);
    };

    return (
      <div className="print-dashboard-mobile-actions" role="group" aria-label="Map share actions">
        <button
          type="button"
          className="print-dashboard-mobile-action"
          disabled={busy}
          title="Preview map"
          aria-label="Preview map"
          onClick={() =>
            runMapAction(map.id, () =>
              openMapSharePreview(urls.client, {
                mapId: map.id,
                isPublic: map.isPublic,
                onMapsUpdated,
              })
            )
          }
        >
          <PreviewMapIcon />
          <span className="print-dashboard-mobile-action-label">Preview map</span>
        </button>
        <button
          type="button"
          className="print-dashboard-mobile-action"
          disabled={busy}
          title="Preview tour"
          aria-label="Preview tour"
          onClick={() =>
            runMapAction(map.id, () =>
              openMapSharePreview(urls.tour, {
                mapId: map.id,
                isPublic: map.isPublic,
                onMapsUpdated,
              })
            )
          }
        >
          <PreviewTourIcon />
          <span className="print-dashboard-mobile-action-label">Preview tour</span>
        </button>
        <button
          type="button"
          className={`print-dashboard-mobile-action${mapCopied ? ' is-copied' : ''}`}
          disabled={busy}
          title={mapCopied ? 'Map link copied' : 'Share map link'}
          aria-label={mapCopied ? 'Map link copied' : 'Share map link'}
          onClick={() => runMapAction(map.id, () => copyLink('map', urls.client))}
        >
          {mapCopied ? <CopiedIcon /> : <ShareLinkIcon />}
          <span className="print-dashboard-mobile-action-label">
            {mapCopied ? 'Copied' : 'Share map'}
          </span>
        </button>
        <button
          type="button"
          className={`print-dashboard-mobile-action${tourCopied ? ' is-copied' : ''}`}
          disabled={busy}
          title={tourCopied ? 'Tour link copied' : 'Share tour link'}
          aria-label={tourCopied ? 'Tour link copied' : 'Share tour link'}
          onClick={() => runMapAction(map.id, () => copyLink('tour', urls.tour))}
        >
          {tourCopied ? <CopiedIcon /> : <ShareLinkIcon />}
          <span className="print-dashboard-mobile-action-label">
            {tourCopied ? 'Copied' : 'Share tour'}
          </span>
        </button>
      </div>
    );
  };

  return (
    <div className="maps-dashboard">
      <div className="print-dashboard-inner">
        <div className="print-dashboard-heading">
          {!isMobile && <h1 className="print-dashboard-title">Listing content</h1>}
          {isMobile && (
            <p className="print-dashboard-mobile-lead">Edit maps on desktop. Share tours &amp; links here.</p>
          )}
        </div>

        {!isMobile && (
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
        )}

        {!isMobile && (
          <div className="print-dashboard-create-row">
            <button type="button" className="header-print-action-btn" onClick={onCreateNewMap}>
              + Create listing content
            </button>
          </div>
        )}

        {actionError && <p className="print-dashboard-mobile-action-error">{actionError}</p>}

        {!isLoading && filteredMaps.length > 0 && !isMobile && (
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
            {searchQuery
              ? 'No maps found matching your search.'
              : isMobile
                ? 'No listings yet. Create on desktop, then share here.'
                : 'No listings yet. Create your first listing content!'}
          </p>
        ) : (
          <ul className={`print-dashboard-list${isMobile ? ' print-dashboard-list--mobile' : ''}`}>
            {filteredMaps.map((map) => (
              <li key={map.id}>
                {isMobile ? (
                  <article
                    className={`print-dashboard-map-card${
                      currentMapId === map.id ? ' is-active' : ''
                    }`}
                  >
                    <header className="print-dashboard-map-card-header">
                      <h2 className="print-dashboard-map-card-title">
                        {map.title || 'Untitled Map'}
                      </h2>
                      <p className="print-dashboard-map-card-date">
                        Updated {formatDate(map.updatedAt)}
                      </p>
                      {map.description ? (
                        <p className="print-dashboard-map-card-desc">{map.description}</p>
                      ) : null}
                    </header>
                    {renderMobileShareActions(map)}
                  </article>
                ) : (
                  <div
                    className={`print-dashboard-row${currentMapId === map.id ? ' is-active' : ''}`}
                  >
                    <button
                      type="button"
                      className="print-dashboard-row-open"
                      onClick={() => onLoadMap(map.id)}
                    >
                      <span className="print-dashboard-row-main">
                        <span className="print-dashboard-row-title">{map.title || 'Untitled Map'}</span>
                        {map.description ? (
                          <span className="print-dashboard-row-desc" title={map.description}>
                            {map.description}
                          </span>
                        ) : null}
                      </span>
                      <span className="print-dashboard-row-date">{formatDate(map.updatedAt)}</span>
                    </button>
                    <div className="print-dashboard-row-actions" role="group" aria-label="Map actions">
                      <button
                        type="button"
                        className="print-dashboard-row-btn print-dashboard-row-btn--primary"
                        onClick={() => onLoadMap(map.id)}
                      >
                        Edit map
                      </button>
                      <button
                        type="button"
                        className="print-dashboard-row-btn print-dashboard-row-btn--share"
                        disabled={actionBusyId === map.id}
                        onClick={() =>
                          runMapAction(map.id, async () => {
                            if (typeof onShareMap === 'function') {
                              await onShareMap(map.id);
                            }
                          })
                        }
                      >
                        Share &amp; generate
                      </button>
                      <button
                        type="button"
                        className="print-dashboard-row-btn print-dashboard-row-btn--delete"
                        disabled={actionBusyId === map.id}
                        onClick={() => setDeleteConfirmMap(map)}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {deleteConfirmMap && (
        <div
          className="print-dashboard-confirm-overlay"
          role="presentation"
          onClick={closeDeleteConfirm}
        >
          <div
            className="print-dashboard-confirm-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="print-dashboard-delete-title"
            aria-describedby="print-dashboard-delete-desc"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="print-dashboard-delete-title" className="print-dashboard-confirm-title">
              Delete map?
            </h2>
            <p id="print-dashboard-delete-desc" className="print-dashboard-confirm-lead">
              <strong>{deleteConfirmMap.title || 'Untitled Map'}</strong> will be permanently
              deleted. Shared links for this map will stop working.
            </p>
            <div className="print-dashboard-confirm-actions">
              <button
                type="button"
                className="print-dashboard-confirm-btn print-dashboard-confirm-btn--ghost"
                onClick={closeDeleteConfirm}
                disabled={deleteBusy}
              >
                Cancel
              </button>
              <button
                type="button"
                className="print-dashboard-confirm-btn print-dashboard-confirm-btn--danger"
                onClick={confirmDeleteMap}
                disabled={deleteBusy}
              >
                {deleteBusy ? 'Deleting…' : 'Delete map'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
