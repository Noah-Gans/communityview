import { mapService } from '../services/mapService';

let cachedSummaries = null;
let cachedUserId = null;
let inflight = null;

export function invalidateSavedMapsCache() {
  cachedSummaries = null;
  cachedUserId = null;
  inflight = null;
}

/**
 * Cached saved-map summaries for the dashboard (shared across routes).
 * @param {{ uid: string } | null} user
 * @param {boolean} [force]
 */
export async function fetchSavedMapsSummaries(user, force = false) {
  if (!user?.uid) {
    invalidateSavedMapsCache();
    return [];
  }

  if (!force && cachedSummaries && cachedUserId === user.uid) {
    return cachedSummaries;
  }

  if (!force && inflight && cachedUserId === user.uid) {
    return inflight;
  }

  cachedUserId = user.uid;
  inflight = mapService
    .getUserMaps()
    .then((maps) => {
      cachedSummaries = Array.isArray(maps) ? maps : [];
      return cachedSummaries;
    })
    .catch((err) => {
      if (cachedUserId === user.uid) {
        cachedSummaries = null;
      }
      throw err;
    })
    .finally(() => {
      inflight = null;
    });

  return inflight;
}
