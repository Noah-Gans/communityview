import React, { useMemo } from 'react';
import {
  POLYLINE_VARIANT_STYLES,
  POLYGON_VARIANT_STYLES,
  parsePrintPlacementTool,
} from './annotationModel';
import {
  arrowHeadPolygon,
  segmentIndexTowardTip,
  transmissionTickSegments,
} from './polylineDecorationUtils';

function seedFromId(id) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (Math.imul(31, h) + id.charCodeAt(i)) | 0;
  return Math.abs(h) + 1;
}

function frac(seed, i) {
  const x = Math.sin(seed * 12.9898 + i * 78.233) * 43758.5453;
  return x - Math.floor(x);
}

const PREVIEW_W = 64;
const PREVIEW_H = 34;

/** Zig-zag polyline styled like the map line preset (larger tile preview). */
export function PrintLineTilePreview({ tool }) {
  const style = useMemo(() => {
    if (tool === 'arrow') {
      return {
        stroke: '#d97706',
        strokeWidth: 3.5,
        strokeOpacity: 1,
        lineDasharray: null,
        strokeLinecap: 'round',
        arrowHead: 'end',
        transmissionTicks: false,
      };
    }
    const parsed = parsePrintPlacementTool(tool);
    const variant = parsed.variant || 'stream';
    const s = POLYLINE_VARIANT_STYLES[variant] || POLYLINE_VARIANT_STYLES.stream;
    return {
      stroke: s.stroke,
      strokeWidth: s.strokeWidth,
      strokeOpacity: s.strokeOpacity ?? 1,
      lineDasharray: s.lineDasharray,
      strokeLinecap: s.strokeLinecap || 'round',
      arrowHead: s.arrowHead || 'none',
      transmissionTicks: !!s.transmissionTicks,
      roadMarkingStroke: s.roadMarkingStroke,
      roadMarkingWidth: s.roadMarkingWidth,
      roadMarkingDasharray: s.roadMarkingDasharray,
      roadMarkingLinecap: s.roadMarkingLinecap || 'round',
      fenceOutlineStroke: s.fenceOutlineStroke,
      fenceOutlineWidth: s.fenceOutlineWidth,
      fenceOutlineOpacity: s.fenceOutlineOpacity,
    };
  }, [tool]);

  const linePts = useMemo(() => {
    const seed = seedFromId(tool);
    const pts = [];
    const steps = 3;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const x = 6 + t * (PREVIEW_W - 12);
      const base = PREVIEW_H / 2;
      const amp = 7 + frac(seed, i) * 4;
      const y = base + (i % 2 === 0 ? -amp : amp) * (0.88 + 0.12 * frac(seed, i + 50));
      pts.push([x, y]);
    }
    return pts;
  }, [tool]);

  const ptsStr = useMemo(() => linePts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' '), [linePts]);

  const {
    stroke,
    strokeWidth,
    strokeOpacity,
    lineDasharray,
    strokeLinecap,
    arrowHead,
    transmissionTicks,
    roadMarkingStroke,
    roadMarkingWidth,
    roadMarkingDasharray,
    roadMarkingLinecap,
    fenceOutlineStroke,
    fenceOutlineWidth,
    fenceOutlineOpacity,
  } = style;

  const sw = Math.min(8, Math.max(2.4, (strokeWidth || 2) * 0.62));
  const dash =
    lineDasharray == null || lineDasharray === ''
      ? undefined
      : String(lineDasharray)
          .trim()
          .split(/\s+/)
          .map((n) => Math.max(0.55, parseFloat(n) * 0.52))
          .join(' ');

  const roadDash =
    roadMarkingDasharray == null || roadMarkingDasharray === ''
      ? undefined
      : String(roadMarkingDasharray)
          .trim()
          .split(/\s+/)
          .map((n) => Math.max(0.5, parseFloat(n) * 0.52))
          .join(' ');

  const tickSegs = useMemo(() => {
    if (!transmissionTicks || linePts.length < 2) return [];
    return transmissionTickSegments(linePts, 18, 6);
  }, [transmissionTicks, linePts]);

  const endSeg =
    (arrowHead === 'end' || arrowHead === 'both') && linePts.length >= 2
      ? segmentIndexTowardTip(linePts, linePts.length - 1)
      : null;
  const startSeg =
    arrowHead === 'both' && linePts.length >= 2
      ? segmentIndexTowardTip(linePts, 0)
      : null;

  const isFencePreview = Boolean(fenceOutlineStroke);

  return (
    <svg
      viewBox={`0 0 ${PREVIEW_W} ${PREVIEW_H}`}
      width="48"
      height="26"
      aria-hidden
      className="print-catalog-line-preview"
    >
      {isFencePreview && (
        <rect
          x="0"
          y="0"
          width={PREVIEW_W}
          height={PREVIEW_H}
          rx="6"
          fill="#1e293b"
          opacity={0.92}
        />
      )}
      {fenceOutlineStroke && (
        <polyline
          points={ptsStr}
          fill="none"
          stroke={fenceOutlineStroke}
          strokeWidth={fenceOutlineWidth ?? 5}
          strokeOpacity={fenceOutlineOpacity ?? 0.35}
          strokeLinecap={strokeLinecap || 'round'}
          strokeLinejoin="round"
        />
      )}
      <polyline
        points={ptsStr}
        fill="none"
        stroke={stroke}
        strokeWidth={sw}
        strokeOpacity={strokeOpacity ?? 1}
        strokeLinecap={strokeLinecap || 'round'}
        strokeLinejoin="round"
        strokeDasharray={dash}
      />
      {roadMarkingStroke && (
        <polyline
          points={ptsStr}
          fill="none"
          stroke={roadMarkingStroke}
          strokeWidth={Math.min(6, roadMarkingWidth ?? 2) * 0.62}
          strokeOpacity={strokeOpacity ?? 1}
          strokeLinecap={roadMarkingLinecap || 'round'}
          strokeLinejoin="round"
          strokeDasharray={roadDash}
        />
      )}
      {tickSegs.map((t, i) => (
        <line
          key={`tx-${i}`}
          x1={t.x1}
          y1={t.y1}
          x2={t.x2}
          y2={t.y2}
          stroke={stroke}
          strokeOpacity={(strokeOpacity ?? 1) * 0.88}
          strokeWidth={1.35}
        />
      ))}
      {endSeg && (
        <polygon
          points={arrowHeadPolygon(endSeg.ax1, endSeg.ay1, endSeg.ax2, endSeg.ay2, sw)}
          fill={stroke}
          fillOpacity={strokeOpacity ?? 1}
        />
      )}
      {startSeg && (
        <polygon
          points={arrowHeadPolygon(startSeg.ax1, startSeg.ay1, startSeg.ax2, startSeg.ay2, sw)}
          fill={stroke}
          fillOpacity={strokeOpacity ?? 1}
        />
      )}
    </svg>
  );
}

/** Irregular polygon fill/stroke like the map polygon preset. */
export function PrintPolygonTilePreview({ tool }) {
  const { fill, stroke, fillOpacity, strokeOpacity, strokeWidth, lineDasharray } = useMemo(() => {
    const parsed = parsePrintPlacementTool(tool);
    const variant = parsed.variant || 'general';
    return POLYGON_VARIANT_STYLES[variant] || POLYGON_VARIANT_STYLES.general;
  }, [tool]);

  const points = useMemo(() => {
    const seed = seedFromId(tool);
    const cx = 22;
    const cy = 22;
    const n = 5 + (seed % 3);
    const parts = [];
    for (let i = 0; i < n; i++) {
      const baseAng = (i / n) * Math.PI * 2 - Math.PI / 2;
      const jitter = (frac(seed, i) - 0.5) * 0.55;
      const ang = baseAng + jitter;
      const r = 9 + frac(seed, i + 33) * 11;
      parts.push(`${(cx + r * Math.cos(ang)).toFixed(1)},${(cy + r * Math.sin(ang)).toFixed(1)}`);
    }
    return parts.join(' ');
  }, [tool]);

  const sw = Math.max(0.9, (strokeWidth || 2) * 0.38);
  const dash =
    lineDasharray == null || lineDasharray === ''
      ? undefined
      : String(lineDasharray)
          .trim()
          .split(/\s+/)
          .map((n) => Math.max(0.35, parseFloat(n) * 0.22))
          .join(' ');

  return (
    <svg
      viewBox="0 0 44 44"
      width="24"
      height="24"
      aria-hidden
      className="print-catalog-polygon-preview"
    >
      <polygon
        points={points}
        fill={fill}
        fillOpacity={fillOpacity ?? 1}
        stroke={stroke}
        strokeWidth={sw}
        strokeOpacity={strokeOpacity ?? 1}
        strokeDasharray={dash}
        strokeLinejoin="round"
      />
    </svg>
  );
}
