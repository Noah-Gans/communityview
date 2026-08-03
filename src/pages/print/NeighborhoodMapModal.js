import React, { useEffect, useId, useRef } from 'react';
import './NeighborhoodMapModal.css';

export default function NeighborhoodMapModal({
  open,
  parcelCount = 0,
  title,
  onTitleChange,
  status = '',
  error = '',
  generating = false,
  result = null,
  onGenerate,
  onCancel,
}) {
  const titleId = useId();
  const inputRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const t = window.setTimeout(() => inputRef.current?.focus?.(), 50);
    const onKey = (e) => {
      if (e.key === 'Escape' && !generating) onCancel?.();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener('keydown', onKey);
    };
  }, [open, generating, onCancel]);

  if (!open) return null;

  return (
    <div className="nbhd-modal-overlay" role="presentation" onClick={() => !generating && onCancel?.()}>
      <div
        className="nbhd-modal-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id={titleId} className="nbhd-modal-title">
          Neighborhood map
        </h2>
        <p className="nbhd-modal-lead">
          Builds a streets map with numbered nearby amenities (close · highly rated · well reviewed),
          then downloads a PDF + PNG and saves a shareable map link with QR.
        </p>
        <p className="nbhd-modal-meta">
          Selected:{' '}
          <strong>
            {parcelCount} parcel{parcelCount === 1 ? '' : 's'}
          </strong>
        </p>

        <label className="nbhd-modal-field">
          Title <span className="nbhd-modal-optional">(optional)</span>
          <input
            ref={inputRef}
            type="text"
            value={title}
            disabled={generating}
            onChange={(e) => onTitleChange?.(e.target.value)}
            placeholder="Defaults to parcel address"
          />
        </label>

        {status && (
          <p className="nbhd-modal-status" role="status">
            {status}
          </p>
        )}
        {error && (
          <p className="nbhd-modal-error" role="alert">
            {error}
          </p>
        )}
        {result?.shareUrl && (
          <p className="nbhd-modal-result">
            Share link:{' '}
            <a href={result.shareUrl} target="_blank" rel="noreferrer">
              {result.shareUrl}
            </a>
          </p>
        )}

        <div className="nbhd-modal-actions">
          <button type="button" className="nbhd-modal-btn ghost" onClick={onCancel} disabled={generating}>
            {result ? 'Close' : 'Cancel'}
          </button>
          <button
            type="button"
            className="nbhd-modal-btn primary"
            onClick={onGenerate}
            disabled={generating || parcelCount < 1 || Boolean(result)}
          >
            {generating ? 'Generating…' : 'Generate map'}
          </button>
        </div>
      </div>
    </div>
  );
}
