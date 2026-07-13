import React, { useEffect, useRef } from 'react';

/**
 * Full-screen photo gallery overlay for shared map / property tour viewers.
 * Lifts above tour chrome via `html.shared-photo-fullscreen-open` (see Print.css).
 */
export default function SharedPhotoFullscreen({
  open,
  onClose,
  gallery = [],
  photoIndex = 0,
  onStepPhoto,
  alt = 'Photo',
}) {
  const touchStartXRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    document.documentElement.classList.add('shared-photo-fullscreen-open');
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.documentElement.classList.remove('shared-photo-fullscreen-open');
      document.body.style.overflow = prevOverflow;
    };
  }, [open]);

  if (!open || !Array.isArray(gallery) || gallery.length === 0) return null;

  const hasMultiple = gallery.length > 1;
  const safeIndex = Math.min(Math.max(0, photoIndex), gallery.length - 1);

  const onTouchStart = (e) => {
    touchStartXRef.current = e.changedTouches?.[0]?.clientX ?? null;
  };

  const onTouchEnd = (e) => {
    const startX = touchStartXRef.current;
    const endX = e.changedTouches?.[0]?.clientX ?? null;
    touchStartXRef.current = null;
    if (!Number.isFinite(startX) || !Number.isFinite(endX) || !hasMultiple) return;
    const delta = endX - startX;
    if (Math.abs(delta) < 40) return;
    onStepPhoto?.(delta < 0 ? 1 : -1);
  };

  return (
    <div
      className="shared-photo-fullscreen"
      role="dialog"
      aria-modal="true"
      aria-label="Photo gallery fullscreen"
    >
      <button
        type="button"
        className="shared-photo-fullscreen-backdrop"
        aria-label="Close fullscreen"
        onClick={onClose}
      />

      {hasMultiple ? (
        <div className="shared-photo-fullscreen-counter" aria-live="polite">
          {safeIndex + 1} / {gallery.length}
        </div>
      ) : null}

      <button
        type="button"
        className="shared-photo-fullscreen-close"
        aria-label="Close gallery"
        onClick={onClose}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
          <path
            d="M6 6l12 12M18 6L6 18"
            stroke="currentColor"
            strokeWidth="2.25"
            strokeLinecap="round"
          />
        </svg>
      </button>

      {hasMultiple ? (
        <button
          type="button"
          className="shared-photo-fullscreen-nav shared-photo-fullscreen-nav-prev"
          aria-label="Previous photo"
          onClick={() => onStepPhoto?.(-1)}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path
              d="M14 6l-6 6 6 6"
              stroke="currentColor"
              strokeWidth="2.25"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      ) : null}

      <div className="shared-photo-fullscreen-stage" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
        <img
          src={gallery[safeIndex]}
          alt={alt}
          className="shared-photo-fullscreen-image"
        />
      </div>

      {hasMultiple ? (
        <button
          type="button"
          className="shared-photo-fullscreen-nav shared-photo-fullscreen-nav-next"
          aria-label="Next photo"
          onClick={() => onStepPhoto?.(1)}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path
              d="M10 6l6 6-6 6"
              stroke="currentColor"
              strokeWidth="2.25"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      ) : null}
    </div>
  );
}
