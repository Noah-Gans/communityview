import React, { useLayoutEffect, useState, useCallback, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useLocation } from 'react-router-dom';
import './TutorialSpotlight.css';
import { useTutorialWalkthrough } from '../../contexts/TutorialWalkthroughContext';
import { useMapContext } from '../../pages/MapContext';

const PADDING = 8;
const Z_OVERLAY = 25000;
const CARD_W_MAX = 380;
const CARD_H_EST = 260;

function useRect(selector, isActive) {
  const [rect, setRect] = useState(null);

  const measure = useCallback(() => {
    if (!isActive || !selector) {
      setRect(null);
      return;
    }
    const el = document.querySelector(selector);
    if (!el) {
      setRect(null);
      return;
    }
    const r = el.getBoundingClientRect();
    setRect({
      top: r.top - PADDING,
      left: r.left - PADDING,
      width: r.width + PADDING * 2,
      height: r.height + PADDING * 2,
    });
  }, [isActive, selector]);

  useLayoutEffect(() => {
    measure();
    const onResize = () => measure();
    window.addEventListener('resize', onResize);
    window.addEventListener('scroll', onResize, true);
    const id = window.requestAnimationFrame(() => measure());
    const t = window.setTimeout(measure, 120);

    // Sections like Layers > Public Land grow when expanded; remeasure the hole so
    // shades do not cover the checkboxes (stale rect made them look grayed / unclickable).
    let ro;
    if (selector && typeof ResizeObserver !== 'undefined') {
      const el = document.querySelector(selector);
      if (el) {
        ro = new ResizeObserver(() => measure());
        ro.observe(el);
      }
    }

    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('scroll', onResize, true);
      window.cancelAnimationFrame(id);
      window.clearTimeout(t);
      ro?.disconnect();
    };
  }, [measure, selector]);

  return [rect, measure];
}

function TutorialBlockers({ selectors, isActive }) {
  const [rects, setRects] = useState([]);

  useLayoutEffect(() => {
    if (!isActive || !selectors?.length) {
      setRects([]);
      return undefined;
    }
    const measure = () => {
      const next = selectors
        .map((sel) => {
          const el = document.querySelector(sel);
          if (!el) return null;
          const r = el.getBoundingClientRect();
          return { key: sel, top: r.top, left: r.left, width: r.width, height: r.height };
        })
        .filter(Boolean);
      setRects(next);
    };
    measure();
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    const id = setInterval(measure, 400);
    return () => {
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
      clearInterval(id);
    };
  }, [isActive, selectors]);

  if (!isActive || !rects.length) return null;

  return (
    <>
      {rects.map((r) => (
        <div
          key={r.key}
          className="cv-tutorial-block"
          style={{
            position: 'fixed',
            top: r.top,
            left: r.left,
            width: r.width,
            height: r.height,
            zIndex: 25001,
          }}
          aria-hidden="true"
        />
      ))}
    </>
  );
}

export default function TutorialSpotlight() {
  const location = useLocation();
  const { isActive, stepIndex, currentStep, isLastStep, next, back, stop, totalSteps } =
    useTutorialWalkthrough();
  const { selectedFeature, searchResults } = useMapContext();

  const overlayMode = currentStep?.overlayMode || 'spotlight';
  const holeSelector = useMemo(() => {
    if (!isActive || !currentStep || currentStep.center) return null;
    if (overlayMode === 'blocks-only') return null;
    return currentStep.targetSelector || null;
  }, [isActive, currentStep, overlayMode]);

  const [rect, measure] = useRect(holeSelector, isActive);

  const selectedCount = Array.isArray(selectedFeature) ? selectedFeature.length : 0;
  const stepId = currentStep?.id;
  const [geolocateDone, setGeolocateDone] = useState(false);
  const needsGeolocate = stepId === 'geolocate' && !geolocateDone;
  const needsParcel = stepId === 'parcel-select' && selectedCount === 0;
  const needsSearchRoute = stepId === 'search-nav' && location.pathname !== '/search';
  const needsSearchResults =
    stepId === 'search-type' && (!Array.isArray(searchResults) || searchResults.length === 0);
  const detailsExpanded =
    typeof document !== 'undefined' &&
    !!document.querySelector('[data-tour="info-details-expanded"].is-open');
  const requiresPropertyDetails = stepId === 'info-details' && !detailsExpanded;
  const requiresLayersClick = stepId === 'side-layers';
  const requiresLayerToggles = stepId === 'public-land-layer';

  useEffect(() => {
    if (!isActive || stepId !== 'geolocate') {
      setGeolocateDone(false);
      return undefined;
    }
    const onGeolocate = () => setGeolocateDone(true);
    window.addEventListener('cv-tutorial-geolocate', onGeolocate);
    return () => window.removeEventListener('cv-tutorial-geolocate', onGeolocate);
  }, [isActive, stepId]);

  useLayoutEffect(() => {
    if (!isActive || stepId !== 'parcel-select' || selectedCount === 0) return undefined;
    const id = window.setTimeout(() => {
      next();
    }, 450);
    return () => window.clearTimeout(id);
  }, [isActive, stepId, selectedCount, next]);

  useLayoutEffect(() => {
    if (!isActive || stepId !== 'info-details' || !detailsExpanded) return undefined;
    const id = window.setTimeout(() => {
      next();
    }, 60);
    return () => window.clearTimeout(id);
  }, [isActive, stepId, detailsExpanded, next]);

  useLayoutEffect(() => {
    if (!isActive || stepId !== 'search-nav' || location.pathname !== '/search') return undefined;
    const id = window.setTimeout(() => {
      next();
    }, 60);
    return () => window.clearTimeout(id);
  }, [isActive, stepId, location.pathname, next]);

  useLayoutEffect(() => {
    if (!isActive) return undefined;
    document.body.classList.add('cv-tutorial-active');
    if (currentStep?.blurMap) {
      document.body.classList.add('cv-tutorial-blur-map');
    } else {
      document.body.classList.remove('cv-tutorial-blur-map');
    }
    return () => {
      document.body.classList.remove('cv-tutorial-active');
      document.body.classList.remove('cv-tutorial-blur-map');
    };
  }, [isActive, currentStep?.blurMap]);

  useLayoutEffect(() => {
    if (!isActive) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') stop(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isActive, stop]);

  if (!isActive || !currentStep) {
    return null;
  }

  const showHole =
    overlayMode !== 'blocks-only' &&
    rect &&
    rect.width > 0 &&
    rect.height > 0 &&
    !currentStep.center;
  const holeStyle = showHole
    ? {
        top: rect.top,
        left: rect.left,
        width: rect.width,
        height: rect.height,
      }
    : null;

  const tooltipPosition = () => {
    const vw = typeof window !== 'undefined' ? window.innerWidth : 1024;
    const vh = typeof window !== 'undefined' ? window.innerHeight : 768;
    const cardW = Math.min(CARD_W_MAX, vw - 32);

    if (currentStep.center) {
      return { top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: cardW };
    }

    const tp = currentStep.tooltipPlacement || currentStep.placement || 'bottom';

    if (tp === 'sidepanel-right') {
      const sp = document.querySelector('[data-tour="side-panel-shell"]');
      if (sp) {
        const r = sp.getBoundingClientRect();
        return {
          top: Math.max(16, Math.min(r.top + r.height / 2 - CARD_H_EST / 2, vh - CARD_H_EST - 16)),
          left: Math.min(r.right + 14, vw - cardW - 16),
          width: cardW,
          transform: 'none',
        };
      }
    }

    if (tp === 'basemap-left') {
      const bm = document.querySelector('[data-tour="basemap-selector"]');
      if (bm) {
        const r = bm.getBoundingClientRect();
        return {
          top: Math.max(16, r.bottom - CARD_H_EST - 8),
          left: Math.max(16, r.left - cardW - 14),
          width: cardW,
          transform: 'none',
        };
      }
    }

    if (tp === 'screen-center') {
      return { top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: cardW };
    }

    if (tp === 'tools-left') {
      const tg =
        stepId === 'geolocate'
          ? document.querySelector('[data-tour="location-zoom"]')
          : document.querySelector('[data-tour="tool-panel"]');
      if (tg) {
        const r = tg.getBoundingClientRect();
        return {
          top: Math.max(16, Math.min(r.top + r.height / 2 - CARD_H_EST / 2, vh - CARD_H_EST - 16)),
          left: Math.max(16, r.left - cardW - 14),
          width: cardW,
          transform: 'none',
        };
      }
    }

    if (overlayMode === 'blocks-only' && currentStep.tooltipAnchorSelector) {
      const el = document.querySelector(currentStep.tooltipAnchorSelector);
      if (el) {
        const ar = el.getBoundingClientRect();
        return {
          top: ar.bottom + 12,
          left: Math.max(16, Math.min(ar.left + ar.width / 2 - cardW / 2, vw - cardW - 16)),
          width: cardW,
          transform: 'none',
        };
      }
    }

    if (stepId === 'geolocate' && currentStep.tooltipAnchorSelector) {
      const el = document.querySelector(currentStep.tooltipAnchorSelector);
      if (el) {
        const ar = el.getBoundingClientRect();
        return {
          top: ar.bottom + 12,
          left: Math.max(16, Math.min(ar.left + ar.width / 2 - cardW / 2, vw - cardW - 16)),
          width: cardW,
          transform: 'none',
        };
      }
    }

    if (!holeStyle) {
      return { top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: cardW };
    }

    const margin = 16;
    const cardH = CARD_H_EST;
    let top = holeStyle.top + holeStyle.height + margin;
    let left = holeStyle.left;
    const place = currentStep.placement || 'bottom';

    if (place === 'top') {
      top = holeStyle.top - cardH - margin;
      left = holeStyle.left + holeStyle.width / 2 - cardW / 2;
    } else if (place === 'left') {
      left = holeStyle.left - cardW - margin;
      top = holeStyle.top + holeStyle.height / 2 - cardH / 2;
    } else if (place === 'right') {
      left = holeStyle.left + holeStyle.width + margin;
      top = holeStyle.top + holeStyle.height / 2 - cardH / 2;
    } else if (place === 'bottom') {
      top = holeStyle.top + holeStyle.height + margin;
      left = holeStyle.left + holeStyle.width / 2 - cardW / 2;
    } else if (place === 'center') {
      top = holeStyle.top + holeStyle.height / 2 - cardH / 2;
      left = holeStyle.left + holeStyle.width / 2 - cardW / 2;
    }

    left = Math.max(margin, Math.min(left, vw - cardW - margin));
    top = Math.max(margin, Math.min(top, vh - cardH - margin));

    return { top, left, width: cardW, transform: 'none' };
  };

  const tipStyle = tooltipPosition();

  const blockList = currentStep.blockSelectors;

  const nextDisabled =
    needsGeolocate ||
    needsParcel ||
    needsSearchRoute ||
    needsSearchResults ||
    requiresPropertyDetails ||
    requiresLayersClick ||
    requiresLayerToggles;

  const overlay = (
    <div className="cv-tutorial-root" style={{ zIndex: Z_OVERLAY }} aria-live="polite">
      <TutorialBlockers selectors={blockList} isActive={isActive && overlayMode === 'blocks-only'} />

      <div className="cv-tutorial-backdrop" role="presentation">
        {showHole && holeStyle ? (
          <>
            <div className="cv-tutorial-shade" style={{ top: 0, left: 0, right: 0, height: holeStyle.top }} />
            <div
              className="cv-tutorial-shade"
              style={{
                top: holeStyle.top,
                left: 0,
                width: holeStyle.left,
                height: holeStyle.height,
              }}
            />
            <div
              className="cv-tutorial-shade"
              style={{
                top: holeStyle.top,
                left: holeStyle.left + holeStyle.width,
                right: 0,
                height: holeStyle.height,
              }}
            />
            <div
              className="cv-tutorial-shade"
              style={{
                top: holeStyle.top + holeStyle.height,
                left: 0,
                right: 0,
                bottom: 0,
              }}
            />
            <div
              className="cv-tutorial-hole-border"
              style={{
                top: holeStyle.top,
                left: holeStyle.left,
                width: holeStyle.width,
                height: holeStyle.height,
              }}
            />
          </>
        ) : overlayMode !== 'blocks-only' ? (
          <div className="cv-tutorial-shade cv-tutorial-shade-full" />
        ) : null}
      </div>

      <div
        className="cv-tutorial-card"
        style={tipStyle}
        role="dialog"
        aria-modal="true"
        aria-labelledby="cv-tutorial-title"
      >
        <div className="cv-tutorial-card-inner">
          <p className="cv-tutorial-step-count">
            Step {stepIndex + 1} of {totalSteps}
          </p>
          <h2 id="cv-tutorial-title">{currentStep.title}</h2>
          <p className="cv-tutorial-body">{currentStep.body}</p>
          {currentStep.responsiveNote && typeof window !== 'undefined' && window.innerWidth <= 768 && (
            <p className="cv-tutorial-note">{currentStep.responsiveNote}</p>
          )}
          {stepId === 'geolocate' && (
            <p className="cv-tutorial-note">
              Allow location access if your browser asks. Use Next when you are ready to continue.
            </p>
          )}
          {stepId === 'parcel-select' && (
            <p className="cv-tutorial-note">
              Pick any visible parcel polygon on the map — the tour continues once one is selected.
            </p>
          )}
          {stepId === 'search-type' && (
            <p className="cv-tutorial-note">
              Standard Search tab — enter a query, then press Enter or click Search.
            </p>
          )}
          <div className="cv-tutorial-actions">
            <button type="button" className="cv-tutorial-btn cv-tutorial-btn-ghost" onClick={() => stop(false)}>
              Exit tour
            </button>
            <div className="cv-tutorial-actions-main">
              <button
                type="button"
                className="cv-tutorial-btn cv-tutorial-btn-secondary"
                onClick={back}
                disabled={stepIndex === 0}
              >
                Back
              </button>
              <button
                type="button"
                className="cv-tutorial-btn cv-tutorial-btn-primary"
                onClick={next}
                disabled={nextDisabled}
                title={
                  needsGeolocate
                    ? 'Click the location button on the map first'
                    : needsParcel
                      ? 'Select a parcel on the map first'
                      : needsSearchRoute
                      ? 'Open Search from the header first'
                      : needsSearchResults
                        ? 'Run search and wait for results'
                        : requiresPropertyDetails
                          ? 'Expand Property details first'
                        : undefined
                }
              >
                {isLastStep ? 'Finish' : 'Next'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(overlay, document.body);
}
