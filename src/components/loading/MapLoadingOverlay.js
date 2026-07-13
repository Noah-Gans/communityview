import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import './MapLoadingOverlay.css';

export const LOADING_PHRASE_SETS = {
  map: [
    'Your map is being built…',
    'Loading basemap and layers…',
    'Placing map elements…',
    'Tuning the view…',
    'Almost ready…',
  ],
  tour: [
    'Your tour is loading…',
    'Setting camera angles…',
    'Preparing property views…',
    'Lining up nearby amenities…',
    'Almost ready…',
  ],
  createTour: [
    'Building your property tour…',
    'Setting camera angles…',
    'Finding nearby amenities…',
    'Curating tour slides…',
    'Saving your tour…',
  ],
  site: [
    'Loading Community View…',
    'Checking your account…',
    'Preparing your workspace…',
    'Warming up the map…',
    'Almost ready…',
  ],
};

const LOGO_SRC = '/logo_transparent_no_background.png';

export default function MapLoadingOverlay({
  phraseSet = 'map',
  phrases,
  mapTitle = '',
  className = '',
  usePortal = true,
}) {
  const phraseList = phrases || LOADING_PHRASE_SETS[phraseSet] || LOADING_PHRASE_SETS.map;
  const [phraseIndex, setPhraseIndex] = useState(0);

  useEffect(() => {
    setPhraseIndex(0);
  }, [phraseSet, phrases]);

  useEffect(() => {
    if (phraseList.length <= 1) return undefined;
    const id = window.setInterval(() => {
      setPhraseIndex((prev) => (prev + 1) % phraseList.length);
    }, 2800);
    return () => window.clearInterval(id);
  }, [phraseList]);

  const activePhrase = phraseList[phraseIndex] || phraseList[0] || 'Loading…';

  const overlay = (
    <div
      className={['map-loading-overlay', className].filter(Boolean).join(' ')}
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <div className="map-loading-overlay-content">
        <img src={LOGO_SRC} alt="Community View" className="map-loading-overlay-logo" />
        <div className="map-loading-overlay-spinner" aria-hidden="true" />
        <p key={phraseIndex} className="map-loading-overlay-phrase">
          {activePhrase}
        </p>
        {mapTitle ? (
          <p className="map-loading-overlay-map-title">{mapTitle}</p>
        ) : null}
      </div>
    </div>
  );

  if (!usePortal) return overlay;
  if (typeof document === 'undefined') return overlay;
  return createPortal(overlay, document.body);
}
