/**
 * Screen-space helpers for print polyline decorations (arrowheads, transmission ticks).
 */

/** Non-degenerate segment indices toward `tipIdx` along polyline (tipIdx is 0 or last). */
export function segmentIndexTowardTip(linePts, tipIdx) {
  if (!linePts || linePts.length < 2) return null;
  const last = linePts.length - 1;
  if (tipIdx === last) {
    let i2 = last;
    let i1 = last - 1;
    while (i1 >= 0) {
      const dx = linePts[i2][0] - linePts[i1][0];
      const dy = linePts[i2][1] - linePts[i1][1];
      if (dx * dx + dy * dy > 1e-4) return { ax1: linePts[i1][0], ay1: linePts[i1][1], ax2: linePts[i2][0], ay2: linePts[i2][1] };
      i1 -= 1;
    }
    return null;
  }
  if (tipIdx === 0) {
    let i0 = 0;
    let i1 = 1;
    while (i1 <= last) {
      const dx = linePts[i1][0] - linePts[i0][0];
      const dy = linePts[i1][1] - linePts[i0][1];
      if (dx * dx + dy * dy > 1e-4) return { ax1: linePts[i1][0], ay1: linePts[i1][1], ax2: linePts[i0][0], ay2: linePts[i0][1] };
      i1 += 1;
    }
    return null;
  }
  return null;
}

export function arrowHeadPolygon(ax1, ay1, ax2, ay2, strokeWidth) {
  const sw = strokeWidth ?? 3;
  const headLen = Math.min(20, 6 + sw * 2);
  const ang = Math.atan2(ay2 - ay1, ax2 - ax1);
  const lx = ax2 + Math.cos(ang + Math.PI * 0.82) * headLen;
  const ly = ay2 + Math.sin(ang + Math.PI * 0.82) * headLen;
  const rx = ax2 + Math.cos(ang - Math.PI * 0.82) * headLen;
  const ry = ay2 + Math.sin(ang - Math.PI * 0.82) * headLen;
  return `${ax2},${ay2} ${lx},${ly} ${rx},${ry}`;
}

/**
 * Short perpendicular ticks on one side of the polyline (screen px).
 * @param {number[][]} linePts — [[x,y], ...]
 * @param {number} spacing — px between tick bases along the path
 * @param {number} tickLen — px length of each tick
 */
export function transmissionTickSegments(linePts, spacing = 22, tickLen = 7) {
  if (!linePts || linePts.length < 2) return [];
  const ticks = [];
  let walked = 0;
  for (let i = 0; i < linePts.length - 1; i += 1) {
    const x0 = linePts[i][0];
    const y0 = linePts[i][1];
    const x1 = linePts[i + 1][0];
    const y1 = linePts[i + 1][1];
    const dx = x1 - x0;
    const dy = y1 - y0;
    const len = Math.hypot(dx, dy) || 1;
    const ux = dx / len;
    const uy = dy / len;
    const px = -uy;
    const py = ux;
    let first = spacing - (walked % spacing);
    if (first > len) {
      walked += len;
      continue;
    }
    for (let t = first; t <= len + 1e-6; t += spacing) {
      const bx = x0 + ux * t;
      const by = y0 + uy * t;
      ticks.push({
        x1: bx,
        y1: by,
        x2: bx + px * tickLen,
        y2: by + py * tickLen,
      });
    }
    walked += len;
  }
  return ticks;
}
