/**
 * Mapbox resize is unsafe when the map was removed, the container is detached,
 * or the WebGL canvas is not initialized yet (e.g. right after route change).
 */
export function safeMapResize(map) {
  if (!map || typeof map.resize !== 'function') return;

  try {
    const container = typeof map.getContainer === 'function' ? map.getContainer() : null;
    if (!container?.isConnected) return;

    const canvas = typeof map.getCanvas === 'function' ? map.getCanvas() : null;
    if (!canvas) return;

    map.resize();
  } catch (_) {
    /* map torn down or not ready */
  }
}
