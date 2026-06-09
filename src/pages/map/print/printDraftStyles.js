import {
  POLYGON_VARIANT_STYLES,
  POLYLINE_VARIANT_STYLES,
  parsePrintPlacementTool,
} from '../../print/annotationModel';

/** Stroke/fill style for the in-progress polygon the user is placing. */
export function getPolygonDraftStyle(activePrintTool) {
  const parsed = parsePrintPlacementTool(activePrintTool);
  return POLYGON_VARIANT_STYLES[parsed.variant] || POLYGON_VARIANT_STYLES.general;
}

/** Stroke/arrow style for the in-progress line the user is placing. */
export function getPolylineDraftStyle(activePrintTool) {
  if (activePrintTool === 'arrow') {
    return {
      stroke: '#d97706',
      strokeWidth: 3.5,
      lineDasharray: null,
      arrowHead: 'end',
      transmissionTicks: false,
      strokeLinecap: 'round',
    };
  }
  const parsed = parsePrintPlacementTool(activePrintTool);
  const style = POLYLINE_VARIANT_STYLES[parsed.variant] || POLYLINE_VARIANT_STYLES.stream;
  return {
    stroke: style.stroke,
    strokeWidth: style.strokeWidth,
    strokeOpacity: style.strokeOpacity ?? 1,
    lineDasharray: style.lineDasharray ?? null,
    arrowHead: style.arrowHead || 'none',
    transmissionTicks: !!style.transmissionTicks,
    strokeLinecap: style.strokeLinecap || 'round',
    ...(style.roadMarkingStroke
      ? {
          roadMarkingStroke: style.roadMarkingStroke,
          roadMarkingWidth: style.roadMarkingWidth,
          roadMarkingDasharray: style.roadMarkingDasharray,
          roadMarkingLinecap: style.roadMarkingLinecap || 'round',
        }
      : {}),
    ...(style.fenceOutlineStroke
      ? {
          fenceOutlineStroke: style.fenceOutlineStroke,
          fenceOutlineWidth: style.fenceOutlineWidth,
          fenceOutlineOpacity: style.fenceOutlineOpacity,
        }
      : {}),
  };
}
