import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { mapService } from '../../services/mapService';

/**
 * Floating right panel: shareable client link, raster PNG/PDF export, optional browser print.
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
  /** When true, PNG/PDF export is unavailable (e.g. dashboard before opening the map in the editor). */
  rasterExportDisabled = false,
  rasterExportDisabledReason = 'Open this map in the editor to export the live map image.',
}) {
  const [copied, setCopied] = useState(false);
  const [tourCopied, setTourCopied] = useState(false);
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

  useEffect(() => {
    const nextTitle = (mapTitle || '').trim() || 'Untitled map';
    setTitleDraft(nextTitle);
    lastSavedTitleRef.current = nextTitle;
    setTitleSaveState('idle');
  }, [mapTitle, mapId, open]);

  useEffect(() => {
    const next = mapDescription || '';
    setDescriptionDraft(next);
    lastSavedDescriptionRef.current = next.trim();
    setDescSaveState('idle');
  }, [mapDescription, mapId, open]);

  const persistTitle = useCallback(async () => {
    const trimmed = titleDraft.trim();
    if (!trimmed) {
      setTitleDraft(lastSavedTitleRef.current);
      setTitleSaveState('error');
      setErr('Map title cannot be empty.');
      return;
    }

    onMapTitleChange?.(trimmed);
    if (needsSave || !mapId) return;
    if (trimmed === lastSavedTitleRef.current) return;

    setTitleSaveState('saving');
    setErr(null);
    try {
      await mapService.updateMap(mapId, { title: trimmed });
      lastSavedTitleRef.current = trimmed;
      setTitleSaveState('saved');
      await onMapsUpdated?.();
      window.setTimeout(() => setTitleSaveState('idle'), 2000);
    } catch (e) {
      setTitleSaveState('error');
      setErr(e?.message || 'Could not save map title');
    }
  }, [titleDraft, mapId, needsSave, onMapTitleChange, onMapsUpdated]);

  const persistDescription = useCallback(async () => {
    const trimmed = descriptionDraft.trim();
    onMapDescriptionChange?.(trimmed);
    if (needsSave || !mapId) return;
    if (trimmed === lastSavedDescriptionRef.current) return;

    setDescSaveState('saving');
    try {
      await mapService.updateMap(mapId, { description: trimmed });
      lastSavedDescriptionRef.current = trimmed;
      setDescSaveState('saved');
      await onMapsUpdated?.();
      window.setTimeout(() => setDescSaveState('idle'), 2000);
    } catch (e) {
      setDescSaveState('error');
      setErr(e?.message || 'Could not save property description');
    }
  }, [descriptionDraft, mapId, needsSave, onMapDescriptionChange, onMapsUpdated]);

  const shareUrl = shareToken ? `${window.location.origin}/view/${shareToken}` : '';
  const embedUrl = shareToken ? `${window.location.origin}/view/${shareToken}?embed=1` : '';
  /** Dedicated path + locked basemap so cold opens do not race map style init. */
  const tourUrl = shareToken
    ? `${window.location.origin}/tour/${shareToken}?basemap=imagery-3d`
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
    try {
      await ensureMapIsPublic();
      window.open(tourUrl, '_blank', 'noopener,noreferrer');
    } catch (e) {
      setErr(e?.message || 'Could not open tour');
    } finally {
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
    try {
      await ensureMapIsPublic();
      window.open(embedUrl, '_blank', 'noopener,noreferrer');
    } catch (e) {
      setErr(e?.message || 'Could not open preview');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="print-share-panel-overlay" onClick={onClose} role="presentation">
      <aside
        className="print-share-panel"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-labelledby="print-share-panel-title"
      >
        <div className="print-share-panel-header">
          <h2 id="print-share-panel-title" className="print-share-panel-title">
            Share map
          </h2>
          <button type="button" className="print-share-panel-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        <section className="print-share-title-section" aria-labelledby="print-share-map-title-label">
          <label id="print-share-map-title-label" className="print-share-property-label" htmlFor="print-share-map-title">
            Map title
          </label>
          <p className="print-share-property-hint">
            Shown on share links, the property tour, and your saved maps list.
          </p>
          <input
            id="print-share-map-title"
            className="print-share-title-input"
            type="text"
            value={titleDraft}
            onChange={(e) => {
              setTitleDraft(e.target.value);
              onMapTitleChange?.(e.target.value);
              if (titleSaveState === 'saved') setTitleSaveState('idle');
            }}
            onBlur={() => {
              void persistTitle();
            }}
            placeholder="e.g. 1200 Elk Ridge — 640 acres"
          />
          {needsSave ? (
            <p className="print-share-property-note">
              Save this map to publish the title on share and tour links.
            </p>
          ) : (
            <p className="print-share-property-status" aria-live="polite">
              {titleSaveState === 'saving'
                ? 'Saving title…'
                : titleSaveState === 'saved'
                  ? 'Title saved.'
                  : titleSaveState === 'error'
                    ? 'Could not save title. Try again.'
                    : 'Edits save automatically when you leave this field.'}
            </p>
          )}
        </section>

        <section className="print-share-property-section" aria-labelledby="print-share-property-desc-label">
          <label id="print-share-property-desc-label" className="print-share-property-label" htmlFor="print-share-property-desc">
            Property description
          </label>
          <p className="print-share-property-hint">
            Shown at the top of the client share map and property tour (above agent photo and logo).
          </p>
          <textarea
            id="print-share-property-desc"
            className="print-share-property-textarea"
            value={descriptionDraft}
            onChange={(e) => {
              setDescriptionDraft(e.target.value);
              onMapDescriptionChange?.(e.target.value);
              if (descSaveState === 'saved') setDescSaveState('idle');
            }}
            onBlur={() => {
              void persistDescription();
            }}
            rows={5}
            placeholder="Summarize the property, acreage, water rights, improvements, or other highlights for clients…"
          />
          {needsSave ? (
            <p className="print-share-property-note">
              Save this map to publish the description on share and tour links.
            </p>
          ) : (
            <p className="print-share-property-status" aria-live="polite">
              {descSaveState === 'saving'
                ? 'Saving…'
                : descSaveState === 'saved'
                  ? 'Saved — clients will see this on share and tour.'
                  : descSaveState === 'error'
                    ? 'Could not save. Try again or save the map from the editor.'
                    : 'Edits save automatically when you leave this field.'}
            </p>
          )}
        </section>

        {err && <div className="print-share-panel-error">{err}</div>}

        <section className="print-share-option">
          <h3 className="print-share-option-title">Client map (link)</h3>
          <p className="print-share-option-desc">
            A lightweight view for your client: pan and zoom, see map graphics and labels. No editing tools.
          </p>
          {needsSave ? (
            <p className="print-share-option-note">Save this map first to create a share link.</p>
          ) : !shareToken ? (
            <p className="print-share-option-note">This map has no share token yet. Save again from the editor.</p>
          ) : (
            <>
              <label className="print-share-url-label" htmlFor="print-share-url-input">
                Link
              </label>
              <div className="print-share-url-row">
                <input
                  id="print-share-url-input"
                  type="text"
                  readOnly
                  value={shareUrl}
                  className="print-share-url-input"
                />
                <button
                  type="button"
                  className="print-share-primary-btn"
                  onClick={handleCopyLink}
                  disabled={busy}
                >
                  {copied ? 'Copied' : busy ? '…' : 'Copy link'}
                </button>
              </div>
              {!isPublic && (
                <p className="print-share-option-hint">
                  First copy turns on <strong>public access</strong> for this link so anyone with the URL can view
                  it.
                </p>
              )}
            </>
          )}
          {needsSave && (
            <button type="button" className="print-share-secondary-btn" onClick={onOpenSave}>
              Open save
            </button>
          )}
        </section>

        <section className="print-share-option">
          <h3 className="print-share-option-title">Embed on listing</h3>
          <p className="print-share-option-desc">
            Paste this HTML into your MLS or website “custom HTML” block. It’s the same client map, with the side panel
            tucked away until visitors open it — better for narrow layouts.
          </p>
          {needsSave ? (
            <p className="print-share-option-note">Save this map first to create embed code.</p>
          ) : !shareToken ? (
            <p className="print-share-option-note">This map has no share token yet. Save again from the editor.</p>
          ) : (
            <>
              <label className="print-share-url-label" htmlFor="print-embed-height">
                Iframe height
              </label>
              <div className="print-share-embed-height-row">
                <select
                  id="print-embed-height"
                  className="print-share-embed-height-select"
                  value={embedHeight}
                  onChange={(e) => setEmbedHeight(Number(e.target.value) || 500)}
                >
                  <option value={400}>400 px</option>
                  <option value={500}>500 px</option>
                  <option value={600}>600 px</option>
                  <option value={720}>720 px</option>
                </select>
              </div>
              <label className="print-share-url-label" htmlFor="print-embed-snippet">
                Embed code
              </label>
              <textarea
                id="print-embed-snippet"
                readOnly
                className="print-share-embed-snippet"
                value={embedSnippet}
                rows={6}
                spellCheck={false}
              />
              <div className="print-share-url-row print-share-embed-actions">
                <button
                  type="button"
                  className="print-share-primary-btn"
                  onClick={handleCopyEmbed}
                  disabled={busy}
                >
                  {embedCopied ? 'Copied' : busy ? '…' : 'Copy embed code'}
                </button>
                <button
                  type="button"
                  className="print-share-secondary-btn print-share-embed-preview-btn"
                  onClick={handleOpenEmbedPreview}
                  disabled={busy}
                >
                  Preview embed
                </button>
              </div>
              {!isPublic && (
                <p className="print-share-option-hint">
                  First copy or preview turns on <strong>public access</strong> so the embedded map can load for site
                  visitors.
                </p>
              )}
            </>
          )}
          {needsSave && (
            <button type="button" className="print-share-secondary-btn" onClick={onOpenSave}>
              Open save
            </button>
          )}
        </section>

        <section className="print-share-option">
          <h3 className="print-share-option-title">Print</h3>
          <p className="print-share-option-desc">
            Open print mode to choose page layout and define the print area directly on the map, then generate a PDF.
          </p>
          {rasterExportDisabled ? <p className="print-share-option-note">{rasterExportDisabledReason}</p> : null}
          <button
            type="button"
            className="print-share-primary-btn"
            disabled={rasterExportDisabled}
            onClick={onOpenPrintMap}
          >
            Print Map
          </button>
        </section>

        <section className="print-share-option">
          <h3 className="print-share-option-title">Digital property tour</h3>
          <p className="print-share-option-desc">
            Tour link opens a focused view: each slide is a different map state (camera and layers). Recipients use
            the on-screen arrows or keyboard to move between slides.
          </p>
          {needsSave ? (
            <p className="print-share-option-note">Save this map first to create a tour link.</p>
          ) : !shareToken ? (
            <p className="print-share-option-note">This map has no share token yet. Save again from the editor.</p>
          ) : (
            <>
              <label className="print-share-url-label" htmlFor="print-tour-url-input">
                Tour link
              </label>
              <div className="print-share-url-row">
                <input
                  id="print-tour-url-input"
                  type="text"
                  readOnly
                  value={tourUrl}
                  className="print-share-url-input"
                />
                <button
                  type="button"
                  className="print-share-primary-btn"
                  onClick={handleCopyTourLink}
                  disabled={busy}
                >
                  {tourCopied ? 'Copied' : busy ? '…' : 'Copy tour'}
                </button>
              </div>
              <button type="button" className="print-share-secondary-btn" onClick={handleOpenTour} disabled={busy}>
                Open tour
              </button>
            </>
          )}
          {needsSave && (
            <button type="button" className="print-share-secondary-btn" onClick={onOpenSave}>
              Open save
            </button>
          )}
        </section>
      </aside>
    </div>
  );
}
