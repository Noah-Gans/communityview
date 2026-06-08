import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  buildMapLabelDisplayText,
  getMapLabelTransform,
  labelUsesGeoOffset,
} from '../../../pages/print/mapLabelUtils';

/** Gap between cursor and bottom edge of hover label (viewport px). */
const LABEL_HOVER_ABOVE_CURSOR_PX = 18;

/**
 * Floating map label for print features: positioned at anchor + offset, draggable when selected.
 */
export default function PrintMapLabel({
  element,
  anchor,
  mapRef,
  labelBaseLngLat,
  passiveHover,
  selected,
  selectable = false,
  onSelect,
  updatePrintElement,
}) {
  const [drag, setDrag] = useState(null);
  const lastDragRef = useRef(null);

  useEffect(() => {
    setDrag(null);
    lastDragRef.current = null;
  }, [element.id]);

  const geoOffset = labelUsesGeoOffset(element);
  const ox = drag ? drag.ox : geoOffset ? 0 : element.labelOffsetX ?? 0;
  const oy = drag ? drag.oy : geoOffset ? 0 : element.labelOffsetY ?? 0;
  const alignH = element.labelAlignH || 'center';
  const alignV = element.labelAlignV || 'top';
  const text = buildMapLabelDisplayText(element);
  /** Hover preview: anchor is cursor in map canvas px (same space as `map.project`); keep label a fixed distance above the pointer. */
  const transform = passiveHover
    ? `translate(-50%, calc(-100% - ${LABEL_HOVER_ABOVE_CURSOR_PX}px))`
    : getMapLabelTransform(alignH, alignV, ox, oy);
  const fs = element.labelFontSize ?? 11;
  const ff = element.labelFontFamily || 'Inter, system-ui, sans-serif';
  const color = element.labelColor || '#111827';
  const bg = element.labelBackgroundColor || '#ffffff';

  const onLabelClick = useCallback(
    (e) => {
      if (passiveHover || selected || !selectable) return;
      e.stopPropagation();
      onSelect?.();
    },
    [passiveHover, selected, selectable, onSelect]
  );

  const onPointerDown = useCallback(
    (e) => {
      if (!selected) return;
      if (e.button !== 0) return;
      e.stopPropagation();
      e.preventDefault();
      const startX = e.clientX;
      const startY = e.clientY;
      /** Map / overlay px for `left`/`top` — same space as `map.project` / drag `translate(ox, oy)`. */
      const anchorPxAtDown = { x: anchor.x, y: anchor.y };
      const startGeo = labelUsesGeoOffset(element);
      const startOx = startGeo ? 0 : element.labelOffsetX ?? 0;
      const startOy = startGeo ? 0 : element.labelOffsetY ?? 0;
      const onMove = (ev) => {
        const dx = ev.clientX - startX;
        const dy = ev.clientY - startY;
        const next = { ox: startOx + dx, oy: startOy + dy };
        lastDragRef.current = next;
        setDrag(next);
      };
      const onUp = () => {
        document.removeEventListener('pointermove', onMove);
        document.removeEventListener('pointerup', onUp);
        document.removeEventListener('pointercancel', onUp);
        const d = lastDragRef.current;
        lastDragRef.current = null;
        setDrag(null);
        if (!d) return;
        const map = mapRef?.current;
        if (map && labelBaseLngLat && !passiveHover) {
          // Match drag preview: `left`/`top` stay at anchorPxAtDown while `translate(ox, oy)` moves
          // the label by (d.ox - startOx, d.oy - startOy) px in map space — not the bbox center
          // (which misaligns with %-based anchor transforms and caused a post-drag jump).
          const newPx = {
            x: anchorPxAtDown.x + (d.ox - startOx),
            y: anchorPxAtDown.y + (d.oy - startOy),
          };
          if (Number.isFinite(newPx.x) && Number.isFinite(newPx.y)) {
            try {
              const pt = map.unproject([newPx.x, newPx.y]);
              if (Number.isFinite(pt.lng) && Number.isFinite(pt.lat)) {
                updatePrintElement({
                  ...element,
                  labelOffsetDLng: pt.lng - labelBaseLngLat.lng,
                  labelOffsetDLat: pt.lat - labelBaseLngLat.lat,
                  labelOffsetX: 0,
                  labelOffsetY: 0,
                });
                return;
              }
            } catch (_) {
              /* fall through to px */
            }
          }
        }
        updatePrintElement({
          ...element,
          labelOffsetX: d.ox,
          labelOffsetY: d.oy,
        });
      };
      document.addEventListener('pointermove', onMove);
      document.addEventListener('pointerup', onUp);
      document.addEventListener('pointercancel', onUp);
    },
    [selected, element, anchor, updatePrintElement, mapRef, labelBaseLngLat, passiveHover]
  );

  return (
    <div
      className="print-map-feature-label"
      style={{
        position: 'absolute',
        top: anchor.y,
        left: anchor.x,
        transform,
        background: bg,
        color,
        fontSize: fs,
        fontFamily: ff,
        fontWeight: passiveHover ? 500 : 600,
        opacity: passiveHover ? 0.94 : 1,
        borderRadius: 4,
        border: '1px solid #e5e7eb',
        padding: '4px 8px',
        pointerEvents: passiveHover ? 'none' : selectable || selected ? 'auto' : 'none',
        zIndex: 12000,
        whiteSpace: 'pre-line',
        textAlign: alignH === 'left' ? 'left' : alignH === 'right' ? 'right' : 'center',
        boxShadow: '0 1px 2px rgba(0,0,0,0.08)',
        cursor: selected ? 'grab' : selectable ? 'pointer' : 'default',
        maxWidth: 280,
        lineHeight: 1.25,
        touchAction: 'none',
      }}
      onClick={onLabelClick}
      onPointerDown={onPointerDown}
    >
      {text}
    </div>
  );
}
