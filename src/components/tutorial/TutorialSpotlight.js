import React, { useLayoutEffect, useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useLocation } from 'react-router-dom';
import './TutorialSpotlight.css';
import { useTutorialWalkthrough } from '../../contexts/TutorialWalkthroughContext';
import { useMapContext } from '../../pages/MapContext';
import { isPropertyBoundaryElement } from '../../utils/printPropertyBoundary';

const PADDING = 8;
const Z_OVERLAY = 25000;
const CARD_W_MAX = 380;
const CARD_H_EST = 260;

/** Renders step body with optional **bold** markers. */
function TutorialBodyText({ text }) {
  const parts = String(text || '').split(/(\*\*[^*]+\*\*)/g);
  return (
    <p className="cv-tutorial-body">
      {parts.map((part, index) => {
        if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
          return <strong key={index}>{part.slice(2, -2)}</strong>;
        }
        return <React.Fragment key={index}>{part}</React.Fragment>;
      })}
    </p>
  );
}

function intersectRects(a, b) {
  const top = Math.max(a.top, b.top);
  const left = Math.max(a.left, b.left);
  const right = Math.min(a.left + a.width, b.left + b.width);
  const bottom = Math.min(a.top + a.height, b.top + b.height);
  const width = right - left;
  const height = bottom - top;
  if (width <= 1 || height <= 1) return null;
  return { top, left, width, height };
}

function overflows(style) {
  const ox = style.overflowX;
  const oy = style.overflowY;
  return (
    ox === 'auto' ||
    ox === 'scroll' ||
    ox === 'hidden' ||
    oy === 'auto' ||
    oy === 'scroll' ||
    oy === 'hidden'
  );
}

/** Clip rect from overflow ancestors + the viewport. */
function getOverflowClipRect(el) {
  let box = null;
  let node = el.parentElement;
  while (node && node !== document.documentElement) {
    if (overflows(window.getComputedStyle(node))) {
      const cr = node.getBoundingClientRect();
      const next = { top: cr.top, left: cr.left, width: cr.width, height: cr.height };
      box = box ? intersectRects(box, next) : next;
      if (!box) return null;
    }
    node = node.parentElement;
  }
  const viewport = {
    top: 0,
    left: 0,
    width: window.innerWidth || 0,
    height: window.innerHeight || 0,
  };
  return box ? intersectRects(box, viewport) : viewport;
}

/** Visible viewport for an element, clipped by overflow ancestors (side panel scroll, etc.). */
function getClippedClientRect(el) {
  const r = el.getBoundingClientRect();
  const raw = { top: r.top, left: r.left, width: r.width, height: r.height };
  const clip = getOverflowClipRect(el);
  return clip ? intersectRects(raw, clip) : null;
}

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
    const clipped = getClippedClientRect(el);
    if (!clipped) {
      setRect(null);
      return;
    }
    const clip = getOverflowClipRect(el);
    const padded = {
      top: clipped.top - PADDING,
      left: clipped.left - PADDING,
      width: clipped.width + PADDING * 2,
      height: clipped.height + PADDING * 2,
    };
    // Keep padding from spilling outside the scrollport (e.g. above the side panel).
    setRect(clip ? intersectRects(padded, clip) || clipped : padded);
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
        let node = el.parentElement;
        while (node && node !== document.body) {
          if (overflows(window.getComputedStyle(node))) {
            ro.observe(node);
          }
          node = node.parentElement;
        }
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
  const {
    selectedFeature,
    searchResults,
    layerLabels,
    currentBasemapId,
    selectedPrintElement,
    setSelectedPrintElement,
  } = useMapContext();

  const stepId = currentStep?.id;
  const [geolocateDone, setGeolocateDone] = useState(false);
  const [publicLandLegendOpen, setPublicLandLegendOpen] = useState(false);
  const [basemapOpened, setBasemapOpened] = useState(false);
  const [basemapStartId, setBasemapStartId] = useState(null);
  const [toolsClearDone, setToolsClearDone] = useState(false);
  const [countyScopeReady, setCountyScopeReady] = useState(false);
  const [threeDEnabled, setThreeDEnabled] = useState(false);
  const [hasSearchResults, setHasSearchResults] = useState(false);
  const [printSaveDialogOpen, setPrintSaveDialogOpen] = useState(false);
  const [printMapSaved, setPrintMapSaved] = useState(false);
  const [printShareClicked, setPrintShareClicked] = useState(false);
  const [printShareOpen, setPrintShareOpen] = useState(false);
  const clearedBoundarySelectionRef = useRef(false);

  const overlayMode = currentStep?.overlayMode || 'spotlight';
  const holeSelector = useMemo(() => {
    if (!isActive || !currentStep || currentStep.center) return null;
    if (overlayMode === 'blocks-only') return null;
    return currentStep.targetSelector || null;
  }, [isActive, currentStep, overlayMode]);

  const [rect, measure] = useRect(holeSelector, isActive);

  const selectedCount = Array.isArray(selectedFeature) ? selectedFeature.length : 0;
  const needsGeolocate = stepId === 'geolocate' && !geolocateDone;
  const needsParcel = stepId === 'parcel-select' && selectedCount === 0;
  const needsSearchRoute = stepId === 'search-nav' && location.pathname !== '/search';
  const requiresLayersClick = stepId === 'side-layers';
  const requiresLayerToggles = stepId === 'public-land-layer';
  const needsLayersExplore =
    stepId === 'layers-explore' && (!publicLandLegendOpen || !layerLabels?.ownership);
  const needsBasemapOpen = stepId === 'basemap-open' && !basemapOpened;
  const needsBasemapChange =
    stepId === 'basemap-select' &&
    (basemapStartId == null || String(currentBasemapId || '') === String(basemapStartId || ''));
  const needsToolsClear = stepId === 'tools-clear' && !toolsClearDone;
  const needsThreeD = stepId === 'basemap-3d' && !threeDEnabled;
  const needsCountyScope = stepId === 'search-county' && !countyScopeReady;
  const needsSearchResults = stepId === 'search-run' && !hasSearchResults;
  const needsBoundarySelect =
    stepId === 'print-select-boundary' && !isPropertyBoundaryElement(selectedPrintElement);
  const needsFeatureEditor =
    stepId === 'print-feature-editor' && !isPropertyBoundaryElement(selectedPrintElement);
  const needsPrintSave = stepId === 'print-save' && !printSaveDialogOpen;
  const needsPrintSaveDialog = stepId === 'print-save-dialog' && !printMapSaved;
  const needsPrintShareClick = stepId === 'print-share-click' && !printShareClicked;
  const needsPrintShare = stepId === 'print-share' && !printShareOpen;

  useEffect(() => {
    if (!isActive || stepId !== 'geolocate') {
      setGeolocateDone(false);
      return undefined;
    }
    const onGeolocate = () => setGeolocateDone(true);
    window.addEventListener('cv-tutorial-geolocate', onGeolocate);
    return () => window.removeEventListener('cv-tutorial-geolocate', onGeolocate);
  }, [isActive, stepId]);

  useEffect(() => {
    if (!isActive || stepId !== 'layers-explore') {
      setPublicLandLegendOpen(false);
      return undefined;
    }
    const check = () => {
      const el = document.querySelector('[data-tour="public-land-legend-toggle"]');
      setPublicLandLegendOpen(el?.getAttribute('aria-expanded') === 'true');
    };
    check();
    const id = window.setInterval(check, 250);
    return () => window.clearInterval(id);
  }, [isActive, stepId]);

  useEffect(() => {
    if (!isActive || stepId !== 'basemap-select') {
      setBasemapStartId(null);
      return undefined;
    }
    setBasemapStartId(currentBasemapId || null);
    return undefined;
    // Snapshot only when entering the select step.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isActive, stepId]);

  useEffect(() => {
    if (!isActive || stepId !== 'basemap-open') {
      if (stepId !== 'basemap-select') {
        setBasemapOpened(false);
      }
      return undefined;
    }
    setBasemapOpened(false);
    const check = () => {
      const open = Boolean(
        document.querySelector(
          '[data-tour="basemap-selector"].tutorial-force-open, [data-tour="basemap-selector"].is-open'
        )
      );
      setBasemapOpened(open);
    };
    check();
    const id = window.setInterval(check, 200);
    return () => window.clearInterval(id);
  }, [isActive, stepId]);

  useLayoutEffect(() => {
    if (!isActive || stepId !== 'basemap-open' || !basemapOpened) return undefined;
    const id = window.setTimeout(() => {
      next();
    }, 250);
    return () => window.clearTimeout(id);
  }, [isActive, stepId, basemapOpened, next]);

  useEffect(() => {
    if (!isActive || stepId !== 'tools-clear') {
      setToolsClearDone(false);
      return undefined;
    }
    const onClear = () => setToolsClearDone(true);
    window.addEventListener('cv-tutorial-tools-clear', onClear);

    // Tool panel is display:none under 768px — don't soft-lock Next on mobile.
    const unlockIfClearUnavailable = () => {
      const clearBtn = document.querySelector('[data-tour="tool-clear-all"]');
      if (!clearBtn) {
        setToolsClearDone(true);
        return;
      }
      let node = clearBtn;
      while (node) {
        if (node.nodeType === 1) {
          const style = window.getComputedStyle(node);
          if (style.display === 'none' || style.visibility === 'hidden') {
            setToolsClearDone(true);
            return;
          }
        }
        node = node.parentElement;
      }
    };
    unlockIfClearUnavailable();
    const id = window.setInterval(unlockIfClearUnavailable, 400);

    return () => {
      window.removeEventListener('cv-tutorial-tools-clear', onClear);
      window.clearInterval(id);
    };
  }, [isActive, stepId]);

  useEffect(() => {
    if (!isActive || stepId !== 'basemap-3d') {
      setThreeDEnabled(false);
      return undefined;
    }
    const check = () => {
      const btn = document.querySelector('[data-tour="map-3d-toggle"] .map-floating-control-button');
      setThreeDEnabled(Boolean(btn?.classList?.contains('active')));
    };
    check();
    const id = window.setInterval(check, 250);
    return () => window.clearInterval(id);
  }, [isActive, stepId]);

  useEffect(() => {
    if (!isActive || stepId !== 'search-county') {
      setCountyScopeReady(false);
      return undefined;
    }
    const check = () => {
      const el = document.querySelector('[data-tour="county-scope-map-center"][aria-checked="true"]');
      setCountyScopeReady(Boolean(el));
    };
    check();
    const id = window.setInterval(check, 250);
    return () => window.clearInterval(id);
  }, [isActive, stepId]);

  useEffect(() => {
    if (!isActive || stepId !== 'search-run') {
      setHasSearchResults(false);
      return undefined;
    }
    const check = () => {
      const fromContext = Array.isArray(searchResults) && searchResults.length > 0;
      const fromDom = Boolean(document.querySelector('.search-results-list .search-result-item'));
      setHasSearchResults(fromContext || fromDom);
    };
    check();
    const id = window.setInterval(check, 200);
    return () => window.clearInterval(id);
  }, [isActive, stepId, searchResults]);

  useEffect(() => {
    if (!isActive || stepId !== 'search-run') return undefined;
    const input = document.querySelector('[data-tour="search-standard-input"]');
    if (input && typeof input.focus === 'function') {
      input.focus();
    }
    return undefined;
  }, [isActive, stepId]);

  useEffect(() => {
    if (!isActive || stepId !== 'search-run' || !currentStep?.emphasizeTarget) {
      document.querySelector('[data-tour="search-bar-controls"]')?.classList.remove('cv-tutorial-target-pulse');
      return undefined;
    }
    const el = document.querySelector('[data-tour="search-bar-controls"]');
    el?.classList.add('cv-tutorial-target-pulse');
    return () => {
      el?.classList.remove('cv-tutorial-target-pulse');
    };
  }, [isActive, stepId, currentStep?.emphasizeTarget]);

  useEffect(() => {
    if (!isActive || stepId !== 'tools-draw-line') {
      document.querySelector('[data-tour="tool-draw-line"]')?.classList.remove('cv-tutorial-target-pulse');
      return undefined;
    }
    const el = document.querySelector('[data-tour="tool-draw-line"]');
    el?.classList.add('cv-tutorial-target-pulse');
    return () => {
      el?.classList.remove('cv-tutorial-target-pulse');
    };
  }, [isActive, stepId]);

  useEffect(() => {
    if (!isActive || stepId !== 'print-select-boundary') {
      clearedBoundarySelectionRef.current = false;
      return undefined;
    }
    if (!clearedBoundarySelectionRef.current) {
      clearedBoundarySelectionRef.current = true;
      setSelectedPrintElement(null);
    }
    return undefined;
  }, [isActive, stepId, setSelectedPrintElement]);

  useLayoutEffect(() => {
    if (!isActive || stepId !== 'print-select-boundary') return undefined;
    if (!isPropertyBoundaryElement(selectedPrintElement)) return undefined;
    const id = window.setTimeout(() => next(), 350);
    return () => window.clearTimeout(id);
  }, [isActive, stepId, selectedPrintElement, next]);

  useEffect(() => {
    if (!isActive || stepId !== 'print-save') {
      setPrintSaveDialogOpen(false);
      return undefined;
    }
    const onOpen = () => setPrintSaveDialogOpen(true);
    if (document.querySelector('[data-tour="print-save-dialog"]')) {
      setPrintSaveDialogOpen(true);
    }
    window.addEventListener('print-open-save-dialog', onOpen);
    return () => window.removeEventListener('print-open-save-dialog', onOpen);
  }, [isActive, stepId]);

  useLayoutEffect(() => {
    if (!isActive || stepId !== 'print-save' || !printSaveDialogOpen) return undefined;
    const id = window.setTimeout(() => next(), 280);
    return () => window.clearTimeout(id);
  }, [isActive, stepId, printSaveDialogOpen, next]);

  useEffect(() => {
    if (!isActive || stepId !== 'print-save-dialog') {
      setPrintMapSaved(false);
      return undefined;
    }
    const onSaved = () => setPrintMapSaved(true);
    window.addEventListener('cv-tutorial-print-saved', onSaved);
    return () => window.removeEventListener('cv-tutorial-print-saved', onSaved);
  }, [isActive, stepId]);

  useLayoutEffect(() => {
    if (!isActive || stepId !== 'print-save-dialog' || !printMapSaved) return undefined;
    const id = window.setTimeout(() => next(), 320);
    return () => window.clearTimeout(id);
  }, [isActive, stepId, printMapSaved, next]);

  useEffect(() => {
    if (!isActive || stepId !== 'print-share-click') {
      setPrintShareClicked(false);
      return undefined;
    }
    const check = () => {
      setPrintShareClicked(Boolean(document.querySelector('[data-tour="print-share-panel"]')));
    };
    check();
    const id = window.setInterval(check, 250);
    return () => window.clearInterval(id);
  }, [isActive, stepId]);

  useLayoutEffect(() => {
    if (!isActive || stepId !== 'print-share-click' || !printShareClicked) return undefined;
    const id = window.setTimeout(() => next(), 320);
    return () => window.clearTimeout(id);
  }, [isActive, stepId, printShareClicked, next]);

  useEffect(() => {
    if (!isActive || stepId !== 'print-share') {
      setPrintShareOpen(false);
      return undefined;
    }
    const check = () => {
      const open = Boolean(document.querySelector('[data-tour="print-share-panel"]'));
      setPrintShareOpen(open);
      if (!open) {
        window.dispatchEvent(new CustomEvent('print-share-map'));
      }
    };
    check();
    const id = window.setInterval(check, 250);
    return () => window.clearInterval(id);
  }, [isActive, stepId]);

  useLayoutEffect(() => {
    if (!isActive || stepId !== 'print-feature-editor') return undefined;
    measure();
    return undefined;
  }, [isActive, stepId, selectedPrintElement, measure]);

  useLayoutEffect(() => {
    if (!isActive || stepId !== 'print-save-dialog') return undefined;
    measure();
    const id = window.setInterval(measure, 200);
    return () => window.clearInterval(id);
  }, [isActive, stepId, measure]);

  useLayoutEffect(() => {
    if (!isActive || stepId !== 'print-share' || !printShareOpen) return undefined;
    measure();
    return undefined;
  }, [isActive, stepId, printShareOpen, measure]);

  useLayoutEffect(() => {
    if (!isActive || stepId !== 'geolocate' || !geolocateDone) return undefined;
    const id = window.setTimeout(() => {
      next();
    }, 450);
    return () => window.clearTimeout(id);
  }, [isActive, stepId, geolocateDone, next]);

  useLayoutEffect(() => {
    if (!isActive || stepId !== 'parcel-select' || selectedCount === 0) return undefined;
    const id = window.setTimeout(() => {
      next();
    }, 450);
    return () => window.clearTimeout(id);
  }, [isActive, stepId, selectedCount, next]);

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

  useLayoutEffect(() => {
    if (!isActive || stepId !== 'basemap-select') return undefined;
    measure();
    return undefined;
  }, [isActive, stepId, measure]);

  if (!isActive || !currentStep) {
    return null;
  }

  const showHole =
    overlayMode !== 'blocks-only' &&
    rect &&
    rect.width > 0 &&
    rect.height > 0 &&
    !currentStep.center;
  const emphasizePad = currentStep.emphasizeTarget ? 12 : 0;
  const holeStyle = showHole
    ? {
        top: rect.top - emphasizePad,
        left: rect.left - emphasizePad,
        width: rect.width + emphasizePad * 2,
        height: rect.height + emphasizePad * 2,
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

    if (tp === 'basemap-button-left') {
      const bm = document.querySelector('[data-tour="basemap-toggle-button"]');
      if (bm) {
        const r = bm.getBoundingClientRect();
        const top = Math.max(16, Math.min(r.top - 24, vh - CARD_H_EST - 16));
        const left = Math.max(16, Math.min(r.left - cardW - 16, vw - cardW - 16));
        return {
          top,
          left,
          width: cardW,
          transform: 'none',
        };
      }
    }

    if (tp === 'basemap-away' || tp === 'basemap-left') {
      // Keep clear of the bottom-right basemap popup (~360px).
      return {
        top: Math.max(72, Math.min(vh * 0.28, vh - CARD_H_EST - 24)),
        left: 24,
        width: cardW,
        transform: 'none',
      };
    }

    if (tp === 'screen-center') {
      return { top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: cardW };
    }

    if (tp === 'search-card') {
      // Keep clear of the search controls/results on the left-center of the page.
      return {
        top: Math.max(72, Math.min(120, vh - CARD_H_EST - 24)),
        left: Math.max(16, vw - cardW - 24),
        width: cardW,
        transform: 'none',
      };
    }

    if (tp === 'tools-left') {
      const tg =
        stepId === 'geolocate'
          ? document.querySelector('[data-tour="location-zoom"]')
          : stepId === 'basemap-3d'
            ? document.querySelector('[data-tour="map-3d-toggle"]')
            : stepId === 'tools-draw-line'
              ? document.querySelector('[data-tour="tool-draw-line"]')
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
    requiresLayersClick ||
    requiresLayerToggles ||
    needsLayersExplore ||
    needsBasemapOpen ||
    needsBasemapChange ||
    needsThreeD ||
    needsToolsClear ||
    needsCountyScope ||
    needsSearchResults ||
    needsBoundarySelect ||
    needsFeatureEditor ||
    needsPrintSave ||
    needsPrintSaveDialog ||
    needsPrintShareClick ||
    needsPrintShare;

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
              className={`cv-tutorial-hole-border${currentStep.emphasizeTarget ? ' cv-tutorial-hole-border--emphasis' : ''}`}
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
          <TutorialBodyText text={currentStep.body} />
          {currentStep.responsiveNote && typeof window !== 'undefined' && window.innerWidth <= 768 && (
            <p className="cv-tutorial-note">{currentStep.responsiveNote}</p>
          )}
          {stepId === 'geolocate' && (
            <p className="cv-tutorial-note">
              Allow location access if your browser asks. The tour continues after you click the crosshair.
            </p>
          )}
          {stepId === 'parcel-select' && (
            <p className="cv-tutorial-note">
              Pick any visible parcel polygon on the map — the tour continues once one is selected.
            </p>
          )}
          {stepId === 'layers-explore' && needsLayersExplore && (
            <p className="cv-tutorial-note">
              Expand the Public Land legend and turn on Owner name to unlock Next.
            </p>
          )}
          {stepId === 'basemap-open' && (
            <p className="cv-tutorial-note">Click the basemap button — the tour continues when it opens.</p>
          )}
          {stepId === 'basemap-select' && needsBasemapChange && (
            <p className="cv-tutorial-note">Pick a different basemap to unlock Next.</p>
          )}
          {stepId === 'basemap-3d' && needsThreeD && (
            <p className="cv-tutorial-note">Turn on 3D first, then tilt the map and click Next.</p>
          )}
          {stepId === 'tools-clear' && needsToolsClear && (
            <p className="cv-tutorial-note">Click the X clear button to continue.</p>
          )}
          {stepId === 'search-county' && needsCountyScope && (
            <p className="cv-tutorial-note">Select Map center to continue.</p>
          )}
          {stepId === 'search-run' && needsSearchResults && (
            <p className="cv-tutorial-note">
              Type a name or address, then press Enter or click Search — Next unlocks when results appear.
            </p>
          )}
          {stepId === 'print-select-boundary' && needsBoundarySelect && (
            <p className="cv-tutorial-note">Click the property boundary outline on the map to continue.</p>
          )}
          {stepId === 'print-save' && needsPrintSave && (
            <p className="cv-tutorial-note">Click Save Map in the header to continue.</p>
          )}
          {stepId === 'print-save-dialog' && needsPrintSaveDialog && (
            <p className="cv-tutorial-note">Enter a title, then click Save in this popup to continue.</p>
          )}
          {stepId === 'print-share-click' && needsPrintShareClick && (
            <p className="cv-tutorial-note">Click Share &amp; generate in the header to continue.</p>
          )}
          {stepId === 'print-share' && needsPrintShare && (
            <p className="cv-tutorial-note">Opening the share kit…</p>
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
                      : needsLayersExplore
                        ? 'Expand Public Land legend and turn on Owner name'
                        : needsBasemapOpen
                          ? 'Open the basemap picker first'
                          : needsBasemapChange
                            ? 'Change the basemap once first'
                            : needsThreeD
                              ? 'Turn on 3D first'
                              : needsToolsClear
                                ? 'Click clear all first'
                                : needsCountyScope
                                  ? 'Select Map center first'
                                  : needsSearchResults
                                    ? 'Run a search and wait for results'
                                    : needsBoundarySelect
                                      ? 'Click the property boundary on the map first'
                                      : needsFeatureEditor
                                        ? 'Select the property boundary first'
                                        : needsPrintSave
                                          ? 'Click Save Map first'
                                          : needsPrintSaveDialog
                                            ? 'Save the map in the popup first'
                                            : needsPrintShareClick
                                              ? 'Click Share & generate first'
                                              : needsPrintShare
                                                ? 'Wait for the share kit to open'
                                                : needsSearchRoute
                                                  ? 'Open Search from the header first'
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
