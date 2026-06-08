/**
 * Resolve after Mapbox map fires idle (or timeout). Used before revealing loaded map state.
 * @param {import('mapbox-gl').Map | null | undefined} map
 * @param {number} [timeoutMs]
 */
export function waitForMapIdle(map, timeoutMs = 8000) {
  if (!map) return Promise.resolve();
  return new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      map.off('idle', onIdle);
      map.off('error', onErr);
      resolve();
    };
    const onIdle = () => finish();
    const onErr = () => finish();
    map.on('idle', onIdle);
    map.on('error', onErr);
    window.setTimeout(finish, timeoutMs);
    if (typeof map.loaded === 'function' && map.loaded()) {
      window.setTimeout(finish, 120);
    }
  });
}

/**
 * @param {React.RefObject<import('mapbox-gl').Map | null>} mapRef
 * @param {number} [maxMs]
 */
export async function waitForMapRef(mapRef, maxMs = 4000) {
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    if (mapRef?.current) return mapRef.current;
    await new Promise((r) => setTimeout(r, 50));
  }
  return mapRef?.current || null;
}
