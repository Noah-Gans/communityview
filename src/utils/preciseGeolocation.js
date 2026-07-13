const GEO_OPTIONS = {
  enableHighAccuracy: true,
  maximumAge: 0,
  timeout: 10000,
};

/** On native, briefly keep listening if the first fix is still coarse. */
const NATIVE_REFINE_MS = 3000;
const NATIVE_REFINE_IF_WORSE_THAN_M = 35;

const USER_LOC_SOURCE = 'cv-user-location';
const USER_LOC_FILL = 'cv-user-location-accuracy-fill';
const USER_LOC_LINE = 'cv-user-location-accuracy-line';

let userLocationMarker = null;

function pickBetterPosition(next, prev) {
  if (!prev) return next;
  const nextAcc = next?.coords?.accuracy;
  const prevAcc = prev?.coords?.accuracy;
  if (!Number.isFinite(nextAcc)) return prev;
  if (!Number.isFinite(prevAcc)) return next;
  return nextAcc < prevAcc ? next : prev;
}

function getCurrentBrowserPosition(positionOptions) {
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(resolve, reject, positionOptions);
  });
}

function getCurrentCapacitorPosition(Geolocation, positionOptions) {
  return Geolocation.getCurrentPosition(positionOptions);
}

function refineBrowserPosition(positionOptions, initialPosition, maxMs) {
  return new Promise((resolve) => {
    let best = initialPosition;
    let watchId = null;
    let settled = false;

    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(deadline);
      if (watchId != null) {
        navigator.geolocation.clearWatch(watchId);
      }
      resolve(best);
    };

    const deadline = setTimeout(finish, maxMs);

    watchId = navigator.geolocation.watchPosition(
      (position) => {
        best = pickBetterPosition(position, best);
        const accuracy = position?.coords?.accuracy;
        if (Number.isFinite(accuracy) && accuracy <= 15) {
          finish();
        }
      },
      () => finish(),
      positionOptions
    );
  });
}

function refineCapacitorPosition(Geolocation, positionOptions, initialPosition, maxMs) {
  return new Promise((resolve) => {
    let best = initialPosition;
    let watchId = null;
    let settled = false;

    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(deadline);
      if (watchId) {
        Geolocation.clearWatch({ id: watchId }).catch(() => {});
      }
      resolve(best);
    };

    const deadline = setTimeout(finish, maxMs);

    Geolocation.watchPosition(positionOptions, (position, error) => {
      if (error) {
        finish();
        return;
      }
      if (!position?.coords) return;
      best = pickBetterPosition(position, best);
      const accuracy = position.coords.accuracy;
      if (Number.isFinite(accuracy) && accuracy <= 15) {
        finish();
      }
    })
      .then((id) => {
        watchId = id;
      })
      .catch(() => finish());
  });
}

async function readPositionOnce({ isNative, Geolocation }, positionOptions) {
  if (isNative && Geolocation?.requestPermissions && Geolocation?.getCurrentPosition) {
    const permissionStatus = await Geolocation.requestPermissions();
    if (permissionStatus.location !== 'granted') {
      const error = new Error('Location permission denied');
      error.code = 1;
      throw error;
    }

    try {
      return await getCurrentCapacitorPosition(Geolocation, positionOptions);
    } catch {
      // Fall through to browser geolocation.
    }
  }

  if (!navigator.geolocation) {
    throw new Error('Geolocation is not supported');
  }

  return getCurrentBrowserPosition(positionOptions);
}

async function maybeRefinePosition(ctx, positionOptions, initialPosition) {
  const initialAccuracy = initialPosition?.coords?.accuracy;
  if (!ctx.isNative || !Number.isFinite(initialAccuracy) || initialAccuracy <= NATIVE_REFINE_IF_WORSE_THAN_M) {
    return initialPosition;
  }

  if (ctx.isNative && ctx.Geolocation?.watchPosition) {
    return refineCapacitorPosition(ctx.Geolocation, positionOptions, initialPosition, NATIVE_REFINE_MS);
  }

  if (navigator.geolocation?.watchPosition) {
    return refineBrowserPosition(positionOptions, initialPosition, NATIVE_REFINE_MS);
  }

  return initialPosition;
}

export function extractGeolocationCoords(position) {
  const coords = position?.coords || position;
  return {
    latitude: coords?.latitude,
    longitude: coords?.longitude,
    accuracy: coords?.accuracy,
  };
}

/**
 * Fast high-accuracy fix: one immediate read, then a short native-only refinement
 * if the first GPS reading is still coarse.
 */
export async function getPreciseUserPosition(ctx) {
  const position = await readPositionOnce(ctx, GEO_OPTIONS);
  return maybeRefinePosition(ctx, GEO_OPTIONS, position);
}

export function clearUserLocationOverlay(map) {
  if (!map) return;

  if (userLocationMarker) {
    userLocationMarker.remove();
    userLocationMarker = null;
  }

  [USER_LOC_LINE, USER_LOC_FILL].forEach((layerId) => {
    if (map.getLayer(layerId)) map.removeLayer(layerId);
  });
  if (map.getSource(USER_LOC_SOURCE)) map.removeSource(USER_LOC_SOURCE);
}

/** Draw a dot plus accuracy ring so the reported uncertainty is visible on the map. */
export function showUserLocationOverlay(map, mapboxgl, turf, { longitude, latitude, accuracy }) {
  if (!map || !mapboxgl) return;

  clearUserLocationOverlay(map);

  const accuracyMeters = Number.isFinite(accuracy) && accuracy > 0 ? accuracy : 25;
  const feature = turf.circle([longitude, latitude], accuracyMeters / 1000, {
    steps: 64,
    units: 'kilometers',
  });

  map.addSource(USER_LOC_SOURCE, {
    type: 'geojson',
    data: feature,
  });

  map.addLayer({
    id: USER_LOC_FILL,
    type: 'fill',
    source: USER_LOC_SOURCE,
    paint: {
      'fill-color': '#1d784f',
      'fill-opacity': 0.15,
    },
  });

  map.addLayer({
    id: USER_LOC_LINE,
    type: 'line',
    source: USER_LOC_SOURCE,
    paint: {
      'line-color': '#1d784f',
      'line-width': 2,
      'line-opacity': 0.7,
    },
  });

  const dot = document.createElement('div');
  dot.className = 'user-location-dot';
  userLocationMarker = new mapboxgl.Marker({ element: dot, anchor: 'center' })
    .setLngLat([longitude, latitude])
    .addTo(map);
}
