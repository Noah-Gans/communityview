import { getMapShareUrls } from '../../utils/mapShareLinks';
import { mapService } from '../../services/mapService';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

function KitCard({
  id,
  title,
  description,
  previewClass,
  previewLabel,
  previewSrc,
  previewFit = 'cover',
  previewContent = null,
  status,
  children,
  accent = 'default',
}) {
  return (
    <article className={`content-kit-card content-kit-card--${accent}`} data-kit-card={id}>
      <div
        className={`content-kit-card-preview ${previewClass}${previewSrc && !previewContent ? ' content-kit-card-preview--photo' : ''}${
          previewFit === 'contain' ? ' content-kit-card-preview--contain' : ''
        }${previewContent ? ' content-kit-card-preview--custom' : ''}`}
      >
        {previewContent ? (
          previewContent
        ) : (
          <>
            {previewSrc ? (
              <img
                className="content-kit-card-preview-img"
                src={previewSrc}
                alt=""
                draggable={false}
              />
            ) : null}
            {previewLabel ? <span className="content-kit-card-preview-label">{previewLabel}</span> : null}
          </>
        )}
      </div>
      <div className="content-kit-card-body">
        <div className="content-kit-card-top">
          <h3 className="content-kit-card-title">{title}</h3>
          {status ? <span className={`content-kit-status content-kit-status--${status.tone}`}>{status.label}</span> : null}
        </div>
        <p className="content-kit-card-desc">{description}</p>
        <div className="content-kit-card-actions">{children}</div>
      </div>
    </article>
  );
}

const CONTENT_KIT_PREVIEWS = {
  print: '/content-kit/print-map.jpg',
  clientMap: '/content-kit/client-map.jpg',
  amenities: '/content-kit/amenity-map.jpg',
  tour: '/content-kit/property-tour.jpg',
  neighborhood: '/content-kit/amenity-map.jpg',
  embed: '/content-kit/embed-listing.jpg',
};

function copyTextBestEffort(text) {
  const value = String(text || '');
  if (!value) return Promise.resolve(false);
  return navigator.clipboard.writeText(value).then(
    () => true,
    () => false
  );
}

function amenityWindowName(shareToken) {
  return shareToken ? `cv-amenity-${shareToken}` : 'cv-amenity-map';
}

function openAmenityWindow(url, shareToken) {
  if (!url) return null;
  // Reuse one tab per map. `_blank` + noopener boots a new Firebase Auth on
  // every click and can briefly sign the print tab out.
  return window.open(url, amenityWindowName(shareToken));
}

function withSearchParam(url, key, value) {
  try {
    const parsed = new URL(url, window.location.origin);
    parsed.searchParams.set(key, value);
    if (parsed.origin === window.location.origin) {
      return `${parsed.pathname}${parsed.search}${parsed.hash}`;
    }
    return parsed.toString();
  } catch {
    const join = String(url || '').includes('?') ? '&' : '?';
    return `${url}${join}${encodeURIComponent(key)}=${encodeURIComponent(value)}`;
  }
}

/**
 * Full-panel Content kit: shareable outputs for one listing map.
 */
export default function ShareMapPanel({
  open,
  onClose,
  mapTitle,
  onMapTitleChange,
  mapDescription = '',
  onMapDescriptionChange,
  mapId,
  shareToken,
  isPublic,
  needsSave,
  onOpenSave,
  onMapsUpdated,
  onOpenPrintMap,
  onExportPng: _onExportPng,
  onExportPdf: _onExportPdf,
  rasterExportDisabled = false,
  rasterExportDisabledReason = 'Open this map in the editor to export the live map image.',
  mobileShareFocus = false,
  hasTourData = false,
  hasAmenityData = false,
  hasNeighborhoodMap = false,
  neighborhoodMapAssets = null,
  onTourGenerated: _onTourGenerated,
  onAmenityGenerated: _onAmenityGenerated,
}) {
  const [copied, setCopied] = useState(false);
  const [tourCopied, setTourCopied] = useState(false);
  const [amenityCopied, setAmenityCopied] = useState(false);
  const [amenityOpened, setAmenityOpened] = useState(false);
  const [tourOpened, setTourOpened] = useState(false);
  const [embedCopied, setEmbedCopied] = useState(false);
  const [embedHeight, setEmbedHeight] = useState(500);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [titleDraft, setTitleDraft] = useState(mapTitle || '');
  const [titleSaveState, setTitleSaveState] = useState('idle');
  const lastSavedTitleRef = useRef((mapTitle || '').trim() || 'Untitled map');

  const [descriptionDraft, setDescriptionDraft] = useState(mapDescription || '');
  const [descSaveState, setDescSaveState] = useState('idle');
  const lastSavedDescriptionRef = useRef((mapDescription || '').trim());
  const openingCreateRef = useRef({ tour: false, amenity: false });

  useEffect(() => {
    if (!open) return;
    const nextTitle = (mapTitle || '').trim() || 'Untitled map';
    setTitleDraft(nextTitle);
    lastSavedTitleRef.current = nextTitle;
    setTitleSaveState('idle');
    // Intentionally not depending on mapTitle — live onChange would mark drafts as "saved"
    // and skip the blur persist. Reset only when opening / switching maps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapId, open]);

  useEffect(() => {
    if (!open) return;
    const next = mapDescription || '';
    setDescriptionDraft(next);
    lastSavedDescriptionRef.current = next.trim();
    setDescSaveState('idle');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapId, open]);

  useEffect(() => {
    setAmenityOpened(false);
    setTourOpened(false);
  }, [mapId, shareToken]);

  const persistTitle = useCallback(async () => {
    const trimmed = titleDraft.trim();
    if (!trimmed) {
      setTitleDraft(lastSavedTitleRef.current || 'Untitled map');
      setTitleSaveState('error');
      setErr('Map title cannot be empty.');
      return;
    }

    onMapTitleChange?.(trimmed);
    if (needsSave || !mapId) {
      lastSavedTitleRef.current = trimmed;
      return;
    }
    if (trimmed === lastSavedTitleRef.current) {
      setTitleSaveState('idle');
      return;
    }

    setTitleSaveState('saving');
    setErr(null);
    try {
      await mapService.updateMap(mapId, { title: trimmed });
      lastSavedTitleRef.current = trimmed;
      setTitleSaveState('saved');
      await onMapsUpdated?.();
      window.setTimeout(() => setTitleSaveState((s) => (s === 'saved' ? 'idle' : s)), 2000);
    } catch (e) {
      setTitleSaveState('error');
      setErr(e?.message || 'Could not save map title');
    }
  }, [titleDraft, mapId, needsSave, onMapTitleChange, onMapsUpdated]);

  const persistDescription = useCallback(async () => {
    const trimmed = descriptionDraft.trim();
    onMapDescriptionChange?.(trimmed);
    if (needsSave || !mapId) {
      lastSavedDescriptionRef.current = trimmed;
      return;
    }
    if (trimmed === lastSavedDescriptionRef.current) {
      setDescSaveState('idle');
      return;
    }

    setDescSaveState('saving');
    setErr(null);
    try {
      await mapService.updateMap(mapId, { description: trimmed });
      lastSavedDescriptionRef.current = trimmed;
      setDescSaveState('saved');
      await onMapsUpdated?.();
      window.setTimeout(() => setDescSaveState((s) => (s === 'saved' ? 'idle' : s)), 2000);
    } catch (e) {
      setDescSaveState('error');
      setErr(e?.message || 'Could not save property description');
    }
  }, [descriptionDraft, mapId, needsSave, onMapDescriptionChange, onMapsUpdated]);

  const shareUrls = getMapShareUrls(shareToken);
  const shareUrl = shareUrls?.client || '';
  const embedUrl = shareToken ? `${shareUrl}?embed=1` : '';
  const tourUrl = shareToken
    ? `${window.location.origin}/tour/${shareToken}?basemap=imagery-3d`
    : '';
  const amenityMapUrl = shareUrls?.amenities || '';
  const amenityMapEditUrl = shareUrls?.amenitiesEdit || '';
  const neighborhoodAmenityEditUrl = amenityMapEditUrl
    ? `${amenityMapEditUrl}${amenityMapEditUrl.includes('?') ? '&' : '?'}from=neighborhood`
    : '';

  const embedSnippet = useMemo(() => {
    if (!embedUrl) return '';
    return `<iframe
  title="Community View map"
  src="${embedUrl}"
  width="100%"
  height="${embedHeight}"
  style="border:0;"
  loading="lazy"
  allowfullscreen
></iframe>`;
  }, [embedUrl, embedHeight]);

  if (!open) return null;

  const ensureMapIsPublic = async () => {
    if (mapId && !isPublic) {
      setBusy(true);
      await mapService.updateMap(mapId, { isPublic: true });
      await onMapsUpdated?.();
    }
  };

  const handleCopyLink = async () => {
    if (!shareUrl) return;
    setErr(null);
    try {
      await ensureMapIsPublic();
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
    } catch (e) {
      setErr(e?.message || 'Could not copy link');
    } finally {
      setBusy(false);
    }
  };

  const handleCopyTourLink = async () => {
    if (!tourUrl) return;
    setErr(null);
    try {
      await ensureMapIsPublic();
      await navigator.clipboard.writeText(tourUrl);
      setTourCopied(true);
      setTimeout(() => setTourCopied(false), 2200);
    } catch (e) {
      setErr(e?.message || 'Could not copy tour link');
    } finally {
      setBusy(false);
    }
  };

  const handleOpenTour = async () => {
    if (!tourUrl) return;
    setErr(null);
    const tab = window.open(tourUrl, '_blank', 'noopener,noreferrer');
    try {
      await ensureMapIsPublic();
      if (!tab) setErr('Allow pop-ups for this site to open the tour.');
    } catch (e) {
      setErr(e?.message || 'Could not open tour');
    } finally {
      setBusy(false);
    }
  };

  const handleOpenTourEditor = async () => {
    if (!tourUrl) return;
    setErr(null);
    const editUrl = tourUrl.includes('?') ? `${tourUrl}&edit=1` : `${tourUrl}?edit=1`;
    const tab = window.open(editUrl, '_blank', 'noopener,noreferrer');
    try {
      await ensureMapIsPublic();
      setTourOpened(true);
      setAmenityOpened(true);
      if (!tab) setErr('Allow pop-ups for this site to open the tour editor.');
    } catch (e) {
      setErr(e?.message || 'Could not open tour editor');
    } finally {
      setBusy(false);
    }
  };

  const handleOpenAmenityEditor = async ({ fromNeighborhood = false } = {}) => {
    const url = fromNeighborhood ? neighborhoodAmenityEditUrl : amenityMapEditUrl;
    if (!url) return;
    setErr(null);
    const tab = openAmenityWindow(url, shareToken);
    try {
      await ensureMapIsPublic();
      setAmenityOpened(true);
      if (!tab) setErr('Allow pop-ups for this site to open the amenity map.');
    } catch (e) {
      setErr(e?.message || 'Could not open amenity map editor');
    } finally {
      setBusy(false);
    }
  };

  const handleCopyAmenityLink = async () => {
    if (!amenityMapUrl) return;
    setErr(null);
    try {
      await ensureMapIsPublic();
      await navigator.clipboard.writeText(amenityMapUrl);
      setAmenityCopied(true);
      window.setTimeout(() => setAmenityCopied(false), 2200);
    } catch (e) {
      setErr(e?.message || 'Could not copy amenity map link');
    } finally {
      setBusy(false);
    }
  };

  const handleOpenAmenityMap = async () => {
    if (!amenityMapUrl) return;
    setErr(null);
    const tab = openAmenityWindow(amenityMapUrl, shareToken);
    try {
      await ensureMapIsPublic();
      setAmenityOpened(true);
      if (!tab) setErr('Allow pop-ups for this site to open the amenity map.');
    } catch (e) {
      setErr(e?.message || 'Could not open amenity map');
    } finally {
      setBusy(false);
    }
  };

  const handleGenerateTour = async () => {
    if (!tourUrl || !mapId || openingCreateRef.current.tour) return;
    openingCreateRef.current.tour = true;
    setErr(null);
    const editUrl = tourUrl.includes('?') ? `${tourUrl}&edit=1` : `${tourUrl}?edit=1`;
    const createUrl = withSearchParam(editUrl, 'generate', '1');
    const tourTab = window.open(createUrl, '_blank', 'noopener,noreferrer');
    setTourOpened(true);
    setAmenityOpened(true);
    void copyTextBestEffort(tourUrl).then((copied) => {
      if (!copied) return;
      setTourCopied(true);
      window.setTimeout(() => setTourCopied(false), 2200);
    });
    try {
      await ensureMapIsPublic();
      if (!tourTab) setErr('Allow pop-ups for this site so the tour can open in a new tab.');
    } catch (e) {
      setErr(e?.message || 'Could not create tour');
    } finally {
      openingCreateRef.current.tour = false;
      setBusy(false);
    }
  };

  const handleGenerateAmenityMap = async () => {
    if (!amenityMapUrl || !mapId || openingCreateRef.current.amenity) return;
    openingCreateRef.current.amenity = true;
    setErr(null);
    const createUrl = withSearchParam(amenityMapUrl, 'generate', '1');
    const amenityTab = openAmenityWindow(createUrl, shareToken);
    setAmenityOpened(true);
    setTourOpened(true);
    void copyTextBestEffort(amenityMapUrl).then((copied) => {
      if (!copied) return;
      setAmenityCopied(true);
      window.setTimeout(() => setAmenityCopied(false), 2200);
    });
    try {
      await ensureMapIsPublic();
      if (!amenityTab) setErr('Allow pop-ups for this site so the amenity map can open in a new tab.');
    } catch (e) {
      setErr(e?.message || 'Could not create amenity map');
    } finally {
      openingCreateRef.current.amenity = false;
      setBusy(false);
    }
  };

  const handleCopyEmbed = async () => {
    if (!embedSnippet) return;
    setErr(null);
    try {
      await ensureMapIsPublic();
      await navigator.clipboard.writeText(embedSnippet);
      setEmbedCopied(true);
      setTimeout(() => setEmbedCopied(false), 2200);
    } catch (e) {
      setErr(e?.message || 'Could not copy embed code');
    } finally {
      setBusy(false);
    }
  };

  const handleOpenEmbedPreview = async () => {
    if (!embedUrl) return;
    setErr(null);
    const tab = window.open(embedUrl, '_blank', 'noopener,noreferrer');
    try {
      await ensureMapIsPublic();
      if (!tab) setErr('Allow pop-ups for this site to open the preview.');
    } catch (e) {
      setErr(e?.message || 'Could not open preview');
    } finally {
      setBusy(false);
    }
  };

  const readyStatus = { tone: 'ready', label: 'Ready' };
  const generateStatus = { tone: 'new', label: 'Generate' };
  const needsSaveStatus = { tone: 'warn', label: 'Save first' };
  const lockedStatus = needsSave ? needsSaveStatus : shareToken ? readyStatus : { tone: 'warn', label: 'No share link' };
  // Amenity map and tour share tourNearbyCache. Creating either one is enough
  // to show Edit / Preview / Copy on both cards — do not wait for a panel reopen.
  const placesReady =
    Boolean(hasAmenityData) || Boolean(hasTourData) || amenityOpened || tourOpened;
  const amenityReady = placesReady;
  const tourReady = placesReady;
  const neighborhoodReady = Boolean(hasNeighborhoodMap);
  const neighborhoodPreviewSrc =
    neighborhoodMapAssets?.pngUrl || CONTENT_KIT_PREVIEWS.neighborhood;

  return (
    <>
      <div
        className={`print-share-panel-overlay print-share-panel-overlay--kit${
          mobileShareFocus ? ' print-share-panel-overlay--mobile' : ''
        }`}
        onClick={onClose}
        role="presentation"
      >
        <aside
          className={`print-share-panel print-share-panel--kit${
            mobileShareFocus ? ' print-share-panel--mobile' : ''
          }`}
          data-tour="print-share-panel"
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-labelledby="print-share-panel-title"
        >
          <div className="print-share-panel-header content-kit-header">
            {mobileShareFocus && <span className="print-share-panel-grabber" aria-hidden="true" />}
            <div className="content-kit-header-text">
              <p className="content-kit-eyebrow">Listing content kit</p>
              <h2 id="print-share-panel-title" className="print-share-panel-title">
                Share &amp; generate
              </h2>
              <p className="content-kit-lead">
                One listing map unlocks client links, amenity maps, tours, print, and a printable neighborhood map.
              </p>
            </div>
            <button type="button" className="print-share-panel-close" onClick={onClose} aria-label="Close">
              ×
            </button>
          </div>

          <div className="print-share-panel-body">
          {!mobileShareFocus && (
            <div className="content-kit-meta">
              <section className="print-share-title-section" aria-labelledby="print-share-map-title-label">
                <label
                  id="print-share-map-title-label"
                  className="print-share-property-label"
                  htmlFor="print-share-map-title"
                >
                  Listing title
                </label>
                <input
                  id="print-share-map-title"
                  className="print-share-title-input"
                  type="text"
                  value={titleDraft}
                  onChange={(e) => {
                    setTitleDraft(e.target.value);
                    if (titleSaveState === 'saved' || titleSaveState === 'error') {
                      setTitleSaveState('idle');
                    }
                  }}
                  onBlur={() => {
                    void persistTitle();
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      e.currentTarget.blur();
                    }
                  }}
                  placeholder="e.g. 1200 Elk Ridge — 640 acres"
                />
                {needsSave ? (
                  <p className="print-share-property-note">Save this listing to publish the title on share links.</p>
                ) : (
                  <p className="print-share-property-status" aria-live="polite">
                    {titleSaveState === 'saving'
                      ? 'Saving title…'
                      : titleSaveState === 'saved'
                        ? 'Title saved.'
                        : titleSaveState === 'error'
                          ? 'Could not save title. Try again.'
                          : 'Edits save when you leave this field.'}
                  </p>
                )}
              </section>

              <section className="print-share-property-section" aria-labelledby="print-share-property-desc-label">
                <label
                  id="print-share-property-desc-label"
                  className="print-share-property-label"
                  htmlFor="print-share-property-desc"
                >
                  Property description
                </label>
                <textarea
                  id="print-share-property-desc"
                  className="print-share-property-textarea"
                  value={descriptionDraft}
                  onChange={(e) => {
                    setDescriptionDraft(e.target.value);
                    if (descSaveState === 'saved' || descSaveState === 'error') {
                      setDescSaveState('idle');
                    }
                  }}
                  onBlur={() => {
                    void persistDescription();
                  }}
                  rows={3}
                  placeholder="Highlights for clients on the share map and tour…"
                />
                {needsSave ? (
                  <p className="print-share-property-note">Save to publish this description.</p>
                ) : (
                  <p className="print-share-property-status" aria-live="polite">
                    {descSaveState === 'saving'
                      ? 'Saving…'
                      : descSaveState === 'saved'
                        ? 'Description saved.'
                        : descSaveState === 'error'
                          ? 'Could not save. Try again.'
                          : 'Edits save when you leave this field.'}
                  </p>
                )}
              </section>
            </div>
          )}

          {err && <div className="print-share-panel-error">{err}</div>}
          {needsSave && (
            <div className="content-kit-save-banner">
              <p>Save this listing once to unlock share links, tours, amenity maps, and neighborhood maps.</p>
              <button type="button" className="print-share-primary-btn" onClick={onOpenSave}>
                Save listing
              </button>
            </div>
          )}

          <div className={`content-kit-grid${mobileShareFocus ? ' content-kit-grid--mobile' : ''}`}>
            {!mobileShareFocus && (
              <KitCard
                id="print"
                title="Print map"
                description="Just a regular map with legend, compass and the map you've made. Will make a PDF for printing or sharing."
                previewClass="content-kit-preview--print"
                previewLabel="Print"
                previewSrc={CONTENT_KIT_PREVIEWS.print}
                previewFit="contain"
                status={rasterExportDisabled ? { tone: 'warn', label: 'Open in editor' } : readyStatus}
                accent="print"
              >
                {rasterExportDisabled ? (
                  <p className="print-share-option-note">{rasterExportDisabledReason}</p>
                ) : null}
                <div className="content-kit-card-action-row">
                  <button
                    type="button"
                    className="print-share-primary-btn"
                    disabled={rasterExportDisabled}
                    onClick={onOpenPrintMap}
                  >
                    Print map
                  </button>
                </div>
              </KitCard>
            )}

            <KitCard
              id="client-map"
              title="Client map"
              description="A digital map of the property that can be shared via a link. It will have the added photos, and it can be explored by the recipient."
              previewClass="content-kit-preview--map"
              previewLabel="Map link"
              previewSrc={CONTENT_KIT_PREVIEWS.clientMap}
              status={lockedStatus}
              accent="map"
            >
              {needsSave || !shareToken ? (
                <p className="print-share-option-note">Save to create the client link.</p>
              ) : (
                <>
                  <div className="print-share-url-row">
                    <input type="text" readOnly value={shareUrl} className="print-share-url-input" aria-label="Client map link" />
                  </div>
                  <div className="content-kit-card-action-row">
                    <button type="button" className="print-share-primary-btn" onClick={handleCopyLink} disabled={busy}>
                      {copied ? 'Copied' : 'Copy link'}
                    </button>
                    <button
                      type="button"
                      className="print-share-secondary-btn"
                      disabled={busy}
                      onClick={async () => {
                        setErr(null);
                        const tab = window.open(shareUrl, '_blank', 'noopener,noreferrer');
                        try {
                          await ensureMapIsPublic();
                          if (!tab) setErr('Allow pop-ups for this site to open the preview.');
                        } catch (e) {
                          setErr(e?.message || 'Could not open preview');
                        } finally {
                          setBusy(false);
                        }
                      }}
                    >
                      Preview
                    </button>
                  </div>
                </>
              )}
            </KitCard>

            {!mobileShareFocus && (
              <KitCard
                id="amenities"
                title="Amenity map"
                description="Interactive neighborhood map of parks, schools, cafés, and more. Same nearby places as the tour; what you show here is what prints on the neighborhood PDF."
                previewClass="content-kit-preview--amenities"
                previewLabel="Amenities"
                previewSrc={CONTENT_KIT_PREVIEWS.amenities}
                status={
                  needsSave || !shareToken
                    ? lockedStatus
                    : amenityReady
                      ? readyStatus
                      : generateStatus
                }
                accent="amenities"
              >
                {needsSave || !shareToken ? (
                  <p className="print-share-option-note">Save to build or share an amenity map.</p>
                ) : amenityReady ? (
                  <>
                    <div className="print-share-url-row">
                      <input
                        type="text"
                        readOnly
                        value={amenityMapUrl}
                        className="print-share-url-input"
                        aria-label="Amenity map link"
                      />
                    </div>
                    <div className="content-kit-card-action-row">
                      <button
                        type="button"
                        className="print-share-primary-btn"
                        onClick={() => void handleCopyAmenityLink()}
                        disabled={busy}
                      >
                        {amenityCopied ? 'Copied' : 'Copy link'}
                      </button>
                      <button
                        type="button"
                        className="print-share-secondary-btn"
                        onClick={() => void handleOpenAmenityMap()}
                        disabled={busy}
                      >
                        Preview
                      </button>
                      <button
                        type="button"
                        className="print-share-secondary-btn"
                        onClick={() => void handleOpenAmenityEditor()}
                        disabled={busy}
                      >
                        Edit
                      </button>
                    </div>
                  </>
                ) : (
                  <div className="content-kit-card-action-row content-kit-card-action-row--stack">
                    <button
                      type="button"
                      className="print-share-primary-btn"
                      onClick={() => void handleGenerateAmenityMap()}
                      disabled={busy}
                    >
                      {amenityCopied ? 'Link copied' : 'Create Immediately'}
                    </button>
                    <button
                      type="button"
                      className="print-share-secondary-btn"
                      onClick={() => void handleOpenAmenityEditor()}
                      disabled={busy}
                    >
                      Customize amenities
                    </button>
                  </div>
                )}
              </KitCard>
            )}

            <KitCard
              id="tour"
              title="Property tour"
              description="Cinematic walkthrough of the property and amenities nearby. Shares the amenity list with the amenity and neighborhood maps."
              previewClass="content-kit-preview--tour"
              previewLabel="Tour"
              previewSrc={CONTENT_KIT_PREVIEWS.tour}
              status={
                needsSave || !shareToken
                  ? lockedStatus
                  : tourReady
                    ? readyStatus
                    : generateStatus
              }
              accent="tour"
            >
              {needsSave || !shareToken ? (
                <p className="print-share-option-note">Save to build or share a tour.</p>
              ) : tourReady ? (
                <>
                  <div className="print-share-url-row">
                    <input type="text" readOnly value={tourUrl} className="print-share-url-input" aria-label="Tour link" />
                  </div>
                  <div className="content-kit-card-action-row">
                    <button type="button" className="print-share-primary-btn" onClick={handleCopyTourLink} disabled={busy}>
                      {tourCopied ? 'Copied' : 'Copy link'}
                    </button>
                    <button type="button" className="print-share-secondary-btn" onClick={handleOpenTour} disabled={busy}>
                      Preview
                    </button>
                    <button
                      type="button"
                      className="print-share-secondary-btn"
                      onClick={() => void handleOpenTourEditor()}
                      disabled={busy}
                    >
                      Edit
                    </button>
                  </div>
                </>
              ) : (
                <div className="content-kit-card-action-row content-kit-card-action-row--stack">
                  <button
                    type="button"
                    className="print-share-primary-btn"
                    onClick={() => void handleGenerateTour()}
                    disabled={busy}
                  >
                    {tourCopied ? 'Tour link copied' : 'Create Immediately'}
                  </button>
                  <button
                    type="button"
                    className="print-share-secondary-btn"
                    onClick={() => void handleOpenTourEditor()}
                    disabled={busy}
                  >
                    Customize tour
                  </button>
                </div>
              )}
            </KitCard>

            {!mobileShareFocus && (
              <KitCard
                id="neighborhood"
                title="Neighborhood map"
                description="Printable PDF of nearby places. Uses the same amenities as the amenity map and tour."
                previewClass="content-kit-preview--neighborhood"
                previewLabel="PDF"
                previewSrc={neighborhoodPreviewSrc}
                previewFit="contain"
                status={
                  needsSave || !shareToken
                    ? lockedStatus
                    : neighborhoodReady
                      ? readyStatus
                      : generateStatus
                }
                accent="neighborhood"
              >
                {needsSave || !shareToken ? (
                  <p className="print-share-option-note">Save to build a neighborhood map.</p>
                ) : neighborhoodReady ? (
                  <div className="content-kit-card-action-row">
                    <button
                      type="button"
                      className="print-share-primary-btn"
                      onClick={() => {
                        if (neighborhoodMapAssets?.pdfUrl) {
                          window.open(neighborhoodMapAssets.pdfUrl, '_blank', 'noopener,noreferrer');
                        }
                      }}
                      disabled={busy || !neighborhoodMapAssets?.pdfUrl}
                    >
                      Download PDF
                    </button>
                    <button
                      type="button"
                      className="print-share-secondary-btn"
                      onClick={() => {
                        if (neighborhoodMapAssets?.pngUrl) {
                          window.open(neighborhoodMapAssets.pngUrl, '_blank', 'noopener,noreferrer');
                        }
                      }}
                      disabled={busy || !neighborhoodMapAssets?.pngUrl}
                    >
                      Preview
                    </button>
                    <button
                      type="button"
                      className="print-share-secondary-btn"
                      onClick={() => void handleOpenAmenityEditor({ fromNeighborhood: true })}
                      disabled={busy}
                    >
                      Edit &amp; regenerate
                    </button>
                  </div>
                ) : (
                  <div className="content-kit-card-action-row content-kit-card-action-row--stack">
                    <button
                      type="button"
                      className="print-share-primary-btn"
                      onClick={() => void handleOpenAmenityEditor({ fromNeighborhood: true })}
                      disabled={busy}
                    >
                      Open map to generate
                    </button>
                    <p className="print-share-option-note">
                      Opens the amenity map in its own window so you can choose what appears,
                      then build the PDF there.
                    </p>
                  </div>
                )}
              </KitCard>
            )}

            {!mobileShareFocus && (
              <KitCard
                id="embed"
                title="Embed on listing"
                description="Iframe for MLS or website custom HTML. Same as the client map, compact chrome."
                previewClass="content-kit-preview--embed"
                previewLabel="Embed"
                previewSrc={CONTENT_KIT_PREVIEWS.embed}
                status={lockedStatus}
                accent="embed"
                previewContent={
                  needsSave || !shareToken ? (
                    <div className="content-kit-embed-preview">
                      <img
                        className="content-kit-card-preview-img"
                        src={CONTENT_KIT_PREVIEWS.embed}
                        alt=""
                        draggable={false}
                      />
                      <span className="content-kit-card-preview-label">Embed</span>
                    </div>
                  ) : (
                    <div className="content-kit-embed-preview">
                      <div className="content-kit-embed-preview-toolbar">
                        <label className="content-kit-embed-height-label" htmlFor="print-embed-height">
                          Height
                        </label>
                        <select
                          id="print-embed-height"
                          className="content-kit-embed-height-select"
                          value={embedHeight}
                          onChange={(e) => setEmbedHeight(Number(e.target.value) || 500)}
                        >
                          <option value={400}>400 px</option>
                          <option value={500}>500 px</option>
                          <option value={600}>600 px</option>
                          <option value={720}>720 px</option>
                        </select>
                      </div>
                      <textarea
                        readOnly
                        className="content-kit-embed-snippet"
                        value={embedSnippet}
                        spellCheck={false}
                        aria-label="Embed code"
                      />
                    </div>
                  )
                }
              >
                {needsSave || !shareToken ? (
                  <p className="print-share-option-note">Save to create embed code.</p>
                ) : (
                  <div className="content-kit-card-action-row">
                    <button type="button" className="print-share-primary-btn" onClick={handleCopyEmbed} disabled={busy}>
                      {embedCopied ? 'Copied' : 'Copy embed'}
                    </button>
                    <button
                      type="button"
                      className="print-share-secondary-btn"
                      onClick={handleOpenEmbedPreview}
                      disabled={busy}
                    >
                      Preview
                    </button>
                  </div>
                )}
              </KitCard>
            )}
          </div>
          </div>
        </aside>
      </div>
    </>
  );
}
