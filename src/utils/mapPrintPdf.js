/**
 * Browser print / Save as PDF for Mapbox GL maps.
 * WebGL canvases often need a resize + repaint after layout changes (e.g. closing a modal)
 * and once more right before the print pipeline runs.
 *
 * @param {import('mapbox-gl').Map | null | undefined} map
 * @param {{ settleMs?: number }} [opts] - wait before print so React can remove overlays (e.g. 80)
 */
export function printWithMap(map, opts = {}) {
  const settleMs = typeof opts.settleMs === 'number' ? opts.settleMs : 0;

  const repaintAndPrint = () => {
    try {
      if (map && typeof map.resize === 'function') map.resize();
      if (map && typeof map.triggerRepaint === 'function') map.triggerRepaint();
    } catch (_) {
      /* ignore */
    }
    window.print();
  };

  if (settleMs > 0) {
    window.setTimeout(repaintAndPrint, settleMs);
    return;
  }
  requestAnimationFrame(() => {
    requestAnimationFrame(repaintAndPrint);
  });
}
