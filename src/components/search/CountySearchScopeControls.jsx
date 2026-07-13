import React from 'react';
import './CountySearchScopeControls.css';

/**
 * @param {{
 *   mode: 'nationwide' | 'saved' | 'map',
 *   setMode: (mode: 'nationwide' | 'saved' | 'map') => void,
 *   savedCounty: { display?: string } | null,
 *   mapCounty: { display?: string } | null,
 *   savedCountyLabel?: string,
 *   hasProfileSavedCounty?: boolean,
 *   onSelectMapCenter: () => void,
 *   onSaveMapCountyAsDefault?: () => void,
 *   isSavingDefaultCounty?: boolean,
 *   isRefreshing?: boolean,
 *   isBootstrapping?: boolean,
 *   mapAvailable?: boolean,
 *   compact?: boolean,
 * }} props
 */
export default function CountySearchScopeControls({
  mode,
  setMode,
  savedCounty,
  mapCounty,
  savedCountyLabel = 'Saved',
  hasProfileSavedCounty = false,
  onSelectMapCenter,
  onSaveMapCountyAsDefault,
  isSavingDefaultCounty = false,
  isRefreshing = false,
  isBootstrapping = false,
  mapAvailable = true,
  compact = false,
}) {
  const busy = isRefreshing || isBootstrapping || isSavingDefaultCounty;
  const savedLabel = savedCounty?.display || savedCountyLabel;
  const mapLabel = mapCounty?.display || 'Map center county';
  const countiesDiffer =
    Boolean(mapCounty) &&
    Boolean(savedCounty) &&
    mapCounty?.path !== savedCounty?.path;
  const showSavedSplit =
    countiesDiffer && Boolean(onSaveMapCountyAsDefault) && Boolean(savedCounty);

  const savedButtonBody = (
    <>
      <span className="county-scope-option-label">{savedCountyLabel}</span>
      {savedCounty ? (
        <span className="county-scope-option-sub">{savedCounty.display}</span>
      ) : null}
    </>
  );

  return (
    <div className={`county-scope-controls${compact ? ' county-scope-controls--compact' : ''}`}>
      <div className="county-scope-toggle" role="radiogroup" aria-label="Search area">
        <button
          type="button"
          role="radio"
          aria-checked={mode === 'nationwide'}
          className={`county-scope-option${mode === 'nationwide' ? ' county-scope-option--active' : ''}`}
          onClick={() => setMode('nationwide')}
          disabled={busy}
        >
          Nationwide
        </button>

        {showSavedSplit ? (
          <div
            className={`county-scope-option-split${
              mode === 'saved' ? ' county-scope-option-split--saved-active' : ''
            }`}
          >
            <button
              type="button"
              role="radio"
              aria-checked={mode === 'saved'}
              className={`county-scope-option county-scope-option--split-main${
                mode === 'saved' ? ' county-scope-option--active' : ''
              }`}
              onClick={() => setMode('saved')}
              disabled={busy || !savedCounty}
              title={savedLabel}
            >
              {savedButtonBody}
            </button>
            <button
              type="button"
              className="county-scope-option county-scope-option--split-action"
              onClick={() => void onSaveMapCountyAsDefault()}
              disabled={busy}
              title={`Make ${mapCounty?.display || 'map center county'} your default search area`}
            >
              <span className="county-scope-option-label">Make default</span>
              <span className="county-scope-option-sub">{mapCounty?.display}</span>
            </button>
          </div>
        ) : (
          <button
            type="button"
            role="radio"
            aria-checked={mode === 'saved'}
            className={`county-scope-option${mode === 'saved' ? ' county-scope-option--active' : ''}`}
            onClick={() => setMode('saved')}
            disabled={busy || !savedCounty}
            title={
              savedCounty
                ? savedLabel
                : hasProfileSavedCounty
                  ? 'Set a default county in your profile'
                  : 'Save a default county or open search once'
            }
          >
            {savedButtonBody}
          </button>
        )}

        <button
          type="button"
          role="radio"
          aria-checked={mode === 'map'}
          className={`county-scope-option${mode === 'map' ? ' county-scope-option--active' : ''}${
            isRefreshing ? ' county-scope-option--loading' : ''
          }`}
          onClick={() => void onSelectMapCenter()}
          disabled={busy || !mapAvailable}
          title={
            isRefreshing
              ? 'Looking up county at map center'
              : mapCounty
                ? `${mapLabel} — tap to refresh from map`
                : 'Look up county at current map center'
          }
        >
          <span className="county-scope-option-label">Map center</span>
          <span className="county-scope-option-sub">
            {isRefreshing ? 'Updating…' : 'Search current county'}
          </span>
        </button>
      </div>

      {mode !== 'nationwide' && !savedCounty && !mapCounty && !busy ? (
        <p className="county-scope-hint">
          Tap <strong>Map center</strong> to search where the map is pointed, or save a default
          county when prompted.
        </p>
      ) : null}
      {showSavedSplit ? (
        <p className="county-scope-hint county-scope-hint--muted">
          Map center differs from your saved county — search either scope, or make the map county
          your default.
        </p>
      ) : null}
    </div>
  );
}
