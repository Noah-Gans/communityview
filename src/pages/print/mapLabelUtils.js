/** Map-attached feature labels: transform + stats text (screen-space offsets in px). */

export const MAP_LABEL_FONT_OPTIONS = [
  { value: 'Inter, system-ui, sans-serif', label: 'Inter / system' },
  { value: 'ui-sans-serif, system-ui, sans-serif', label: 'System UI' },
  { value: 'Georgia, serif', label: 'Georgia' },
  { value: '"Times New Roman", Times, serif', label: 'Times New Roman' },
  { value: '"Courier New", Courier, monospace', label: 'Courier New' },
  { value: 'Arial, Helvetica, sans-serif', label: 'Arial' },
  { value: 'Verdana, Geneva, sans-serif', label: 'Verdana' },
  { value: '"Trebuchet MS", sans-serif', label: 'Trebuchet MS' },
];

export const DEFAULT_MAP_LABEL_PROPS = {
  labelOffsetX: 0,
  labelOffsetY: 0,
  /** When set (finite numbers), label drag is stored as Δlng/Δlat from the feature label anchor so zoom stays correct. */
  labelOffsetDLng: undefined,
  labelOffsetDLat: undefined,
  labelAlignH: 'center',
  labelAlignV: 'top',
  labelFontFamily: 'Inter, system-ui, sans-serif',
  labelFontSize: 11,
  labelColor: '#111827',
  labelBackgroundColor: '#ffffff',
  labelAttachStats: false,
};

export function buildMapLabelDisplayText(element) {
  const main = (element.label || '').trim();
  const statParts = [];
  if (element.labelAttachStats) {
    if (element.areaSqMeters != null) {
      statParts.push(`Area: ${(element.areaSqMeters / 4046.8564224).toFixed(3)} ac`);
    }
    if (element.perimeterMeters != null) {
      statParts.push(`Perim: ${(element.perimeterMeters * 3.28084).toFixed(0)} ft`);
    }
    if (element.lengthMeters != null) {
      statParts.push(`Length: ${(element.lengthMeters * 3.28084).toFixed(0)} ft`);
    }
  }
  if (statParts.length === 0) return main;
  const statsLine = statParts.join(' · ');
  return [main, statsLine].filter(Boolean).join('\n');
}

/**
 * CSS transform: pixel nudge first, then anchor relative to label box.
 * `left`/`top` on the element are set to anchor (x,y).
 */
/** True when label position nudge after drag is stored in geographic space (zoom-safe). */
export function labelUsesGeoOffset(element) {
  return (
    typeof element?.labelOffsetDLng === 'number' &&
    Number.isFinite(element.labelOffsetDLng) &&
    typeof element?.labelOffsetDLat === 'number' &&
    Number.isFinite(element.labelOffsetDLat)
  );
}

export function getMapLabelTransform(alignH, alignV, offsetX = 0, offsetY = 0) {
  const ox = Number(offsetX) || 0;
  const oy = Number(offsetY) || 0;
  const h = alignH === 'left' || alignH === 'center' || alignH === 'right' ? alignH : 'center';
  const v = alignV === 'top' || alignV === 'middle' || alignV === 'bottom' ? alignV : 'top';

  const nudge = `translate(${ox}px, ${oy}px)`;
  let anchor = '';
  if (v === 'top') {
    if (h === 'left') anchor = 'translate(0, calc(-100% - 6px))';
    else if (h === 'center') anchor = 'translate(-50%, calc(-100% - 6px))';
    else anchor = 'translate(-100%, calc(-100% - 6px))';
  } else if (v === 'middle') {
    if (h === 'left') anchor = 'translate(0, -50%)';
    else if (h === 'center') anchor = 'translate(-50%, -50%)';
    else anchor = 'translate(-100%, -50%)';
  } else {
    if (h === 'left') anchor = 'translate(0, 6px)';
    else if (h === 'center') anchor = 'translate(-50%, 6px)';
    else anchor = 'translate(-100%, 6px)';
  }
  return `${nudge} ${anchor}`;
}
