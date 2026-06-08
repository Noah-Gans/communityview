import { getFunctions, httpsCallable } from 'firebase/functions';
import app from '../firebase/firebaseConfig';
import {
  normalizePrintElementsFromFirestore,
  sanitizePrintElementsForFirestore,
} from '../utils/printElementsFirestore';
import { enrichNearbyTourFeatureCollection } from '../utils/tourNearbyFeatureEnrichment';
import { fetchNearbyTourAmenityGoogleMapsJs } from '../utils/tourNearbyGoogleClient';
import { TOUR_NEARBY_SEARCH_RADIUS_METERS } from '../utils/propertyTourSlides';
import { TOUR_NEARBY_DATA_VERSION } from '../utils/tourNearbyRanking';
import { normalizeTourNearbyCacheFromFirestore } from '../utils/tourNearbyFirestore';

function resolveTourNearbyFetchRadiusMeters(requested) {
  return Math.min(
    50000,
    Math.max(500, Number(requested) || TOUR_NEARBY_SEARCH_RADIUS_METERS)
  );
}

// Initialize functions with the app instance
const functions = getFunctions(app);

// Initialize callable functions
const saveMapFunction = httpsCallable(functions, 'saveMap');
const updateMapFunction = httpsCallable(functions, 'updateMap');
const getUserMapsFunction = httpsCallable(functions, 'getUserMaps');
const getMapByIdFunction = httpsCallable(functions, 'getMapById');
const deleteMapFunction = httpsCallable(functions, 'deleteMap');
const getSharedMapByTokenFunction = httpsCallable(functions, 'getSharedMapByToken');
const getNearbyGooglePlacesFunction = httpsCallable(functions, 'getNearbyGooglePlaces');
const saveTourNearbyCacheFunction = httpsCallable(functions, 'saveTourNearbyCache');

function getGoogleMapsBrowserKey() {
  try {
    return String(process.env.REACT_APP_GOOGLE_MAPS_API_KEY || '').trim();
  } catch (_) {
    return '';
  }
}

/** @param {unknown} err */
function formatCallableError(err) {
  if (!err || typeof err !== 'object') return String(err || 'Callable failed');
  const e = /** @type {{ code?: string, message?: string, details?: unknown }} */ (err);
  const parts = [];
  if (e.code) parts.push(String(e.code));
  if (e.message) parts.push(String(e.message));
  if (typeof e.details === 'string' && e.details.trim()) parts.push(e.details.trim());
  return parts.filter(Boolean).join(' — ') || 'Callable failed';
}

async function finalizeNearbyTourGeoJson(origin, featureCollection, amenityKey, options = {}) {
  return enrichNearbyTourFeatureCollection(origin, featureCollection, {
    amenityKey: amenityKey != null ? String(amenityKey) : '',
    skipCurate: Boolean(options.skipCurate),
  });
}

export const mapService = {
  /**
   * Save a new map
   * @param {Object} mapData - Map data to save
   * @returns {Promise<Object>} - Returns { mapId, shareToken }
   */
  async saveMap(mapData) {
    try {
      const result = await saveMapFunction({ mapData });
      return result.data;
    } catch (error) {
      console.error('Error saving map:', error);
      throw error;
    }
  },

  /**
   * Update an existing map
   * @param {string} mapId - ID of map to update
   * @param {Object} mapData - Updated map data
   * @returns {Promise<Object>} - Returns { success: true }
   */
  async updateMap(mapId, mapData) {
    try {
      const result = await updateMapFunction({ mapId, mapData });
      return result.data;
    } catch (error) {
      console.error('Error updating map:', error);
      throw error;
    }
  },

  /**
   * Get all maps for the current user
   * @returns {Promise<Array>} - Array of map objects
   */
  async getUserMaps() {
    try {
      const result = await getUserMapsFunction();
      return result.data;
    } catch (error) {
      console.error('Error getting user maps:', error);
      throw error;
    }
  },

  /**
   * Load full map state for one owned map (edit mode).
   * @param {string} mapId
   */
  async getMapById(mapId) {
    try {
      const result = await getMapByIdFunction({ mapId });
      const data = result.data;
      if (data && Array.isArray(data.printElements)) {
        return {
          ...data,
          printElements: normalizePrintElementsFromFirestore(data.printElements),
          tourNearbyCache: normalizeTourNearbyCacheFromFirestore(data.tourNearbyCache),
        };
      }
      return {
        ...data,
        tourNearbyCache: normalizeTourNearbyCacheFromFirestore(data?.tourNearbyCache),
      };
    } catch (error) {
      console.error('Error loading map by id:', error);
      throw error;
    }
  },

  /**
   * Delete a map
   * @param {string} mapId - ID of map to delete
   * @returns {Promise<Object>} - Returns { success: true }
   */
  async deleteMap(mapId) {
    try {
      const result = await deleteMapFunction({ mapId });
      return result.data;
    } catch (error) {
      console.error('Error deleting map:', error);
      throw error;
    }
  },

  /**
   * Load a publicly shared map by token (no auth). Used by /view/:shareToken.
   */
  async getSharedMapByToken(shareToken) {
    try {
      const result = await getSharedMapByTokenFunction({ shareToken });
      const data = result.data;
      if (data && Array.isArray(data.printElements)) {
        return {
          ...data,
          printElements: normalizePrintElementsFromFirestore(data.printElements),
          tourNearbyCache: normalizeTourNearbyCacheFromFirestore(data.tourNearbyCache),
        };
      }
      return {
        ...data,
        tourNearbyCache: normalizeTourNearbyCacheFromFirestore(data?.tourNearbyCache),
      };
    } catch (error) {
      console.error('Error loading shared map:', error);
      throw error;
    }
  },

  /**
   * Property tour “vicinity” slides: nearby POIs around a point.
   *
   * **No Firebase deploy required** for ratings when you set `REACT_APP_GOOGLE_MAPS_API_KEY`
   * (Maps JavaScript API + Places). Restrict the key by HTTP referrer.
   *
   * **Distances / drive times:** every result is enriched with straight-line miles from the
   * listing center. If `REACT_APP_MAPBOX_ACCESS_TOKEN` is set, Mapbox Driving Matrix overwrites
   * with road distance + duration when the API call succeeds.
   *
   * Fallback without browser Google key: Cloud Function `getNearbyGooglePlaces` (requires
   * `google.places_key`). Distance and ~drive time are added in the client (Mapbox when configured).
   *
   * @param {{ lat: number, lng: number, radiusMeters?: number, amenityKey: string, shareToken?: string }} params
   * @returns {Promise<{ type: 'FeatureCollection', features: unknown[] }>}
   */
  async getNearbyGooglePlaces(params) {
    const lat = Number(params?.lat);
    const lng = Number(params?.lng);
    const amenityKey = String(params?.amenityKey || '').trim();
    const shareToken = String(params?.shareToken || '').trim();
    const fetchRadiusMeters = resolveTourNearbyFetchRadiusMeters(params?.radiusMeters);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || !amenityKey) {
      return finalizeNearbyTourGeoJson({ lat, lng }, { type: 'FeatureCollection', features: [] }, amenityKey);
    }

    const origin = { lat, lng };
    const googleBrowserKey = getGoogleMapsBrowserKey();
    let rawFc = { type: 'FeatureCollection', features: [] };
    const hints = [];

    // 1) Firebase callable — uses `google.places_key` from functions config (where you set the backend key).
    try {
      const result = await getNearbyGooglePlacesFunction({
        lat,
        lng,
        radiusMeters: fetchRadiusMeters,
        amenityKey,
        ...(shareToken ? { shareToken } : {}),
      });
      const data = result?.data;
      const serverVersion = Number(data?.nearbyDataVersion);
      const serverFresh =
        !Number.isFinite(serverVersion) || serverVersion === TOUR_NEARBY_DATA_VERSION;
      if (data && data.type === 'FeatureCollection' && Array.isArray(data.features)) {
        const fromPersistedTourCache = data.fromTourNearbyCache === true;
        if (data.features.length || fromPersistedTourCache) {
          if (!serverFresh && process.env.NODE_ENV === 'development') {
            console.warn(
              `[mapService] Using Cloud Function nearby data v${serverVersion || '?'} (app expects v${TOUR_NEARBY_DATA_VERSION}). Redeploy getNearbyGooglePlaces to avoid stale filters.`
            );
          }
          return finalizeNearbyTourGeoJson(origin, data, amenityKey);
        }
      }
      if (!serverFresh) {
        hints.push(
          `Cloud Function is outdated (nearby v${serverVersion || '?'}; app expects v${TOUR_NEARBY_DATA_VERSION}). Redeploy functions:getNearbyGooglePlaces.`
        );
      } else {
        hints.push('Cloud Function returned no places for this location.');
      }
    } catch (err) {
      hints.push(`Cloud Function: ${formatCallableError(err)}`);
      if (process.env.NODE_ENV === 'development') {
        console.warn('[mapService] getNearbyGooglePlaces callable failed.', err);
      }
    }

    // 2) Browser REST — only when the callable did not return places (see early return above).
    if (typeof window !== 'undefined' && googleBrowserKey) {
      try {
        const fc = await fetchNearbyTourAmenityGoogleMapsJs({
          lat,
          lng,
          radiusMeters: fetchRadiusMeters,
          amenityKey,
          apiKey: googleBrowserKey,
        });
        if (fc?.features?.length) {
          return finalizeNearbyTourGeoJson(origin, fc, amenityKey);
        }
        if (fc?.apiError) hints.push(`Browser Places API: ${fc.apiError}`);
        else hints.push('Browser Places API returned no results.');
      } catch (err) {
        hints.push(`Browser Places: ${err?.message || String(err)}`);
      }
    } else {
      hints.push(
        'No browser key: uncomment REACT_APP_GOOGLE_MAPS_API_KEY=... in .env.development and restart npm start.'
      );
    }

    const finalized = await finalizeNearbyTourGeoJson(origin, rawFc, amenityKey);
    if (!finalized?.features?.length) {
      throw new Error(hints.filter(Boolean).join(' '));
    }
    return finalized;
  },

  /**
   * Persist tour nearby amenities on the shared map (Firestore `tourNearbyCache`).
   * @param {string} shareToken
   * @param {object} tourNearbyCache
   */
  async saveTourNearbyCache(shareToken, tourNearbyCache) {
    const token = String(shareToken || '').trim();
    if (!token || !tourNearbyCache) {
      return { success: false };
    }
    try {
      const result = await saveTourNearbyCacheFunction({
        shareToken: token,
        tourNearbyCache,
      });
      return result?.data || { success: true };
    } catch (error) {
      console.error('Error saving tour nearby cache:', error);
      throw error;
    }
  },

  /**
   * Serialize current map state into a format suitable for saving
   * @param {Object} mapContext - MapContext values
   * @param {Object} mapRef - Mapbox map reference
   * @returns {Object} - Serialized map state
   */
  serializeMapState(mapContext, mapRef) {
    if (!mapRef || !mapRef.current) {
      throw new Error('Map reference is not available');
    }

    const map = mapRef.current;
    const center = map.getCenter();
    const zoom = map.getZoom();
    const bearing = map.getBearing ? map.getBearing() : 0;
    const pitch = map.getPitch ? map.getPitch() : 0;

    return {
      viewport: {
        center: {
          lat: center.lat,
          lng: center.lng,
        },
        zoom: zoom,
        bearing: bearing,
        pitch: pitch,
      },
      basemap:
        mapContext.activeBasemapIdRef?.current ||
        mapContext.basemap ||
        mapContext.currentBasemapId ||
        'high-def-3inch',
      layers: {
        status: mapContext.layerStatus || {},
        order: mapContext.layerOrder || [],
        labels: mapContext.layerLabels || {},
      },
      printSettings: {
        paperSize: mapContext.paperSize || 'full',
        orientation: mapContext.paperSize || 'full',
      },
      printElements: sanitizePrintElementsForFirestore(
        Array.isArray(mapContext.printElements) ? mapContext.printElements : []
      ),
    };
  },

  /**
   * Load map state into the map and context
   * @param {Object} mapData - Map data to load
   * @param {Object} mapContext - MapContext with setters
   * @param {Object} mapRef - Mapbox map reference
   */
  loadMapState(mapData, mapContext, mapRef) {
    if (!mapRef || !mapRef.current) {
      console.warn('Map reference not available, cannot load viewport');
      return;
    }

    const map = mapRef.current;

    // Restore viewport
    if (mapData.viewport && mapData.viewport.center) {
      try {
        map.setCenter([mapData.viewport.center.lng, mapData.viewport.center.lat]);
        if (mapData.viewport.zoom !== undefined) {
          map.setZoom(mapData.viewport.zoom);
        }
        if (mapData.viewport.bearing !== undefined && typeof map.setBearing === 'function') {
          map.setBearing(mapData.viewport.bearing);
        }
        if (mapData.viewport.pitch !== undefined && typeof map.setPitch === 'function') {
          map.setPitch(mapData.viewport.pitch);
        }
      } catch (error) {
        console.error('Error restoring viewport:', error);
      }
    }

    if (mapData.basemap && typeof mapContext.setCurrentBasemapId === 'function') {
      const saved = String(mapData.basemap).trim();
      mapContext.setCurrentBasemapId(saved);
      if (mapContext.activeBasemapIdRef) mapContext.activeBasemapIdRef.current = saved;
    }

    // Restore layers
    if (mapData.layers) {
      if (mapData.layers.status && typeof mapContext.setLayerStatus === 'function') {
        mapContext.setLayerStatus(mapData.layers.status);
      }
      if (mapData.layers.order && typeof mapContext.setLayerOrder === 'function') {
        mapContext.setLayerOrder(mapData.layers.order);
      }
      // Note: Layer labels restoration skipped for now as there's no setter
      // We can add this later if needed
    }

    // Restore print settings
    if (mapData.printSettings) {
      if (mapData.printSettings.paperSize && typeof mapContext.setPaperSize === 'function') {
        mapContext.setPaperSize(mapData.printSettings.paperSize);
      }
    }

    if (Array.isArray(mapData.printElements) && typeof mapContext.setPrintElements === 'function') {
      mapContext.setPrintElements(normalizePrintElementsFromFirestore(mapData.printElements));
    }
  },
};

