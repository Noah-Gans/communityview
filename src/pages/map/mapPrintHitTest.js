export function pointToSegmentDistanceSq(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lenSq = dx * dx + dy * dy || 1;
  let t = ((px - x1) * dx + (py - y1) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  const nx = x1 + t * dx;
  const ny = y1 + t * dy;
  const ddx = px - nx;
  const ddy = py - ny;
  return ddx * ddx + ddy * ddy;
}

/** Minimum squared screen distance from (px,py) to a closed geo ring (WGS84). */
export function minSqDistanceToPolygonRingScreen(map, ring, px, py) {
  if (!map || !Array.isArray(ring) || ring.length < 2) return Infinity;
  let minSq = Infinity;
  const n = ring.length;
  for (let j = 0; j < n - 1; j++) {
    const a = map.project(ring[j]);
    const b = map.project(ring[j + 1]);
    if (!a || !b || !Number.isFinite(a.x) || !Number.isFinite(b.x)) continue;
    minSq = Math.min(minSq, pointToSegmentDistanceSq(px, py, a.x, a.y, b.x, b.y));
  }
  return minSq;
}

export function isPrintParcelBoundaryPolygon(el) {
  return (
    el?.type === 'polygon' &&
    (el?.mapStyleVariant === 'boundary' || el?.label === 'Property Boundary')
  );
}

/** Catalog point tools: follow cursor before click to place. */
export function isPrintShapeIconPlacingTool(tool) {
  return typeof tool === 'string' && (tool === 'note' || tool.startsWith('shape_'));
}

/** Scale on-screen print controls when zoomed out so they stay readable. */
export function getPrintPixelScale(map) {
  if (!map || typeof map.getZoom !== 'function') return 1;
  const z = map.getZoom();
  const t = Math.max(0, Math.min(1, (12.5 - z) / 10));
  return 0.48 + (1.38 - 0.48) * t;
}
