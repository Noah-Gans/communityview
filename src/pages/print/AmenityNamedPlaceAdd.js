import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { mapService } from '../../services/mapService';
import { namedAddBiasMeters } from '../../utils/tourPlacesApiNew';

function newSessionToken() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `cv-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function haversineMiles(aLat, aLng, bLat, bLng) {
  const toRad = (d) => (d * Math.PI) / 180;
  const R = 3958.7613;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(x)));
}

function milesLabel(miles) {
  if (!Number.isFinite(miles)) return '';
  return `${Math.round(miles * 10) / 10} mi away`;
}

function sortPlacesByDistance(places, center) {
  if (!center || !Number.isFinite(center.lat) || !Number.isFinite(center.lng)) return places;
  return [...places].sort((a, b) => {
    const da = haversineMiles(center.lat, center.lng, Number(a?.geometry?.location?.lat), Number(a?.geometry?.location?.lng));
    const db = haversineMiles(center.lat, center.lng, Number(b?.geometry?.location?.lat), Number(b?.geometry?.location?.lng));
    const aN = Number.isFinite(da) ? da : 999;
    const bN = Number.isFinite(db) ? db : 999;
    return aN - bN;
  });
}

/**
 * Named add: Autocomplete as you type, Text Search on Submit, both biased to the listing.
 */
export default function AmenityNamedPlaceAdd({
  category,
  center,
  radiusMeters,
  existingPlaceIds,
  onAddPlace,
}) {
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [searchHits, setSearchHits] = useState([]);
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState('');
  const [addedName, setAddedName] = useState('');
  const sessionRef = useRef(newSessionToken());
  const debounceRef = useRef(0);
  const boxRef = useRef(null);
  const requestSeq = useRef(0);

  const singular = category?.singular || 'place';
  const biasMiles = Math.round((namedAddBiasMeters(radiusMeters) / 1609.344) * 10) / 10;

  const resetSession = useCallback(() => {
    sessionRef.current = newSessionToken();
  }, []);

  useEffect(() => {
    setQuery('');
    setSuggestions([]);
    setSearchHits([]);
    setOpen(false);
    setError('');
    setAddedName('');
    setStatus('idle');
    resetSession();
  }, [category?.key, resetSession]);

  useEffect(() => {
    const onDoc = (event) => {
      if (!boxRef.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const runAutocomplete = useCallback(
    async (text) => {
      if (!center || text.trim().length < 2) {
        setSuggestions([]);
        return;
      }
      const seq = ++requestSeq.current;
      setStatus('suggesting');
      setError('');
      try {
        const data = await mapService.lookupNamedGooglePlace({
          mode: 'autocomplete',
          query: text,
          lat: center.lat,
          lng: center.lng,
          radiusMeters,
          sessionToken: sessionRef.current,
        });
        if (seq !== requestSeq.current) return;
        if (data?.apiError) {
          setError(data.apiError);
          setSuggestions([]);
        } else {
          setSuggestions(Array.isArray(data?.suggestions) ? data.suggestions : []);
          setSearchHits([]);
          setOpen(true);
        }
      } catch (err) {
        if (seq !== requestSeq.current) return;
        setError(err?.message || 'Could not look up places.');
        setSuggestions([]);
      } finally {
        if (seq === requestSeq.current) setStatus('idle');
      }
    },
    [center, radiusMeters]
  );

  const onQueryChange = useCallback(
    (value) => {
      setQuery(value);
      setAddedName('');
      window.clearTimeout(debounceRef.current);
      if (String(value || '').trim().length < 2) {
        setSuggestions([]);
        setSearchHits([]);
        setOpen(false);
        return;
      }
      debounceRef.current = window.setTimeout(() => {
        void runAutocomplete(value);
      }, 280);
    },
    [runAutocomplete]
  );

  const runTextSearch = useCallback(async () => {
    const text = String(query || '').trim();
    if (!center || text.length < 2) return;
    window.clearTimeout(debounceRef.current);
    const seq = ++requestSeq.current;
    setStatus('searching');
    setError('');
    setOpen(true);
    try {
      const data = await mapService.lookupNamedGooglePlace({
        mode: 'text',
        query: text,
        lat: center.lat,
        lng: center.lng,
        radiusMeters,
      });
      if (seq !== requestSeq.current) return;
      if (data?.apiError) {
        setError(data.apiError);
        setSearchHits([]);
      } else {
        const ranked = sortPlacesByDistance(data?.results || [], center);
        setSearchHits(ranked);
        setSuggestions([]);
        if (!ranked.length) setError(`No matches near this listing for “${text}”.`);
      }
    } catch (err) {
      if (seq !== requestSeq.current) return;
      setError(err?.message || 'Search failed.');
      setSearchHits([]);
    } finally {
      if (seq === requestSeq.current) setStatus('idle');
    }
  }, [center, query, radiusMeters]);

  const addGooglePlace = useCallback(
    (place) => {
      if (!place?.place_id || !onAddPlace) return;
      if (existingPlaceIds?.has(String(place.place_id))) {
        onAddPlace(place, { alreadyPresent: true });
        setAddedName(place.name);
        setQuery('');
        setSuggestions([]);
        setSearchHits([]);
        setOpen(false);
        resetSession();
        return;
      }
      onAddPlace(place, { alreadyPresent: false });
      setAddedName(place.name);
      setQuery('');
      setSuggestions([]);
      setSearchHits([]);
      setOpen(false);
      resetSession();
    },
    [existingPlaceIds, onAddPlace, resetSession]
  );

  const pickSuggestion = useCallback(
    async (suggestion) => {
      if (!suggestion?.placeId) return;
      setStatus('adding');
      setError('');
      try {
        const data = await mapService.lookupNamedGooglePlace({
          mode: 'details',
          placeId: suggestion.placeId,
          sessionToken: sessionRef.current,
        });
        if (data?.apiError || !data?.place) {
          setError(data?.apiError || 'Could not add that place.');
          return;
        }
        addGooglePlace(data.place);
      } catch (err) {
        setError(err?.message || 'Could not add that place.');
      } finally {
        setStatus('idle');
      }
    },
    [addGooglePlace]
  );

  const rows = useMemo(() => {
    if (searchHits.length) {
      return searchHits.map((place) => {
        const lat = Number(place?.geometry?.location?.lat);
        const lng = Number(place?.geometry?.location?.lng);
        const miles =
          center && Number.isFinite(lat) && Number.isFinite(lng)
            ? haversineMiles(center.lat, center.lng, lat, lng)
            : NaN;
        return {
          id: place.place_id,
          name: place.name,
          address: place.formattedAddress || '',
          miles,
          already: existingPlaceIds?.has(String(place.place_id)),
          onPick: () => addGooglePlace(place),
        };
      });
    }
    return suggestions.map((suggestion) => ({
      id: suggestion.placeId,
      name: suggestion.name,
      address: suggestion.address || '',
      miles: NaN,
      already: existingPlaceIds?.has(String(suggestion.placeId)),
      onPick: () => void pickSuggestion(suggestion),
    }));
  }, [addGooglePlace, center, existingPlaceIds, pickSuggestion, searchHits, suggestions]);

  const busy = status === 'suggesting' || status === 'searching' || status === 'adding';

  return (
    <div className="amenity-named-add" ref={boxRef}>
      <div className="amenity-named-add-heading">
        <strong>Add a place by name</strong>
        <span>
          Biased to ~{biasMiles} mi of this listing. Click a result — or Add — to drop it on this
          category.
        </span>
      </div>
      <form
        className="amenity-named-add-row"
        onSubmit={(event) => {
          event.preventDefault();
          void runTextSearch();
        }}
      >
        <input
          type="search"
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          onFocus={() => {
            if (rows.length) setOpen(true);
          }}
          placeholder={`e.g. Persephone, Cowboy Coffee`}
          aria-label={`Find a ${singular} by name`}
          autoComplete="off"
        />
        <button type="submit" disabled={busy || String(query).trim().length < 2}>
          {status === 'searching' ? 'Searching…' : 'Search'}
        </button>
      </form>
      {addedName ? (
        <p className="amenity-named-add-ok">Added {addedName} to this category.</p>
      ) : null}
      {error ? <p className="amenity-map-error">{error}</p> : null}
      {open && rows.length ? (
        <ul className="amenity-named-add-list" role="listbox">
          {rows.map((row) => (
            <li key={row.id}>
              <button
                type="button"
                onClick={row.onPick}
                disabled={busy}
              >
                <span className="amenity-named-add-copy">
                  <strong>{row.name}</strong>
                  <small>
                    {[milesLabel(row.miles), row.address].filter(Boolean).join(' · ')}
                  </small>
                </span>
                <span className={`amenity-named-add-action${row.already ? ' is-on-map' : ''}`}>
                  {row.already ? 'On map' : status === 'adding' ? 'Adding…' : 'Add'}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {open && status === 'suggesting' && !rows.length ? (
        <p className="amenity-named-add-hint">Looking nearby…</p>
      ) : null}
    </div>
  );
}
