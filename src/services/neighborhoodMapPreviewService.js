/**
 * Headless neighborhood map PNG for marketing agents (no browser login).
 *
 * Prefer HTTP + API key from your agent / script:
 *   POST https://us-central1-tetoncountygis.cloudfunctions.net/generateNeighborhoodMapHttp
 *   X-Api-Key: <marketing.neighborhood_map_key>
 *   { "address": "..." }
 *
 * Browser helpers below still exist for ad-hoc testing while signed in.
 */
import { getFunctions, httpsCallable } from 'firebase/functions';
import app from '../firebase/firebaseConfig';

const DEFAULT_HTTP_URL =
  'https://us-central1-tetoncountygis.cloudfunctions.net/generateNeighborhoodMapHttp';

/**
 * Headless: call from Node / marketing agent with API key (no Firebase Auth).
 */
export async function generateNeighborhoodMapHttp({
  address,
  title,
  lat,
  lng,
  radiusMeters,
  includeBase64 = false,
  apiKey = process.env.REACT_APP_NEIGHBORHOOD_MAP_API_KEY ||
    process.env.MARKETING_NEIGHBORHOOD_MAP_KEY,
  endpoint = process.env.REACT_APP_NEIGHBORHOOD_MAP_HTTP_URL || DEFAULT_HTTP_URL,
} = {}) {
  const key = String(apiKey || '').trim();
  if (!key) {
    throw new Error(
      'Pass apiKey or set MARKETING_NEIGHBORHOOD_MAP_KEY / REACT_APP_NEIGHBORHOOD_MAP_API_KEY'
    );
  }
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Api-Key': key,
    },
    body: JSON.stringify({
      address,
      title,
      lat,
      lng,
      radiusMeters,
      includeBase64,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `HTTP ${res.status}`);
  }
  return data;
}

/** Signed-in Firebase callable (browser). Prefer generateNeighborhoodMapHttp for agents. */
export async function generateNeighborhoodMapPreview({
  address,
  title,
  radiusMeters,
  lat,
  lng,
  includeBase64,
} = {}) {
  const fn = httpsCallable(getFunctions(app), 'generateNeighborhoodMapPreview');
  const result = await fn({
    address,
    title,
    radiusMeters,
    lat,
    lng,
    includeBase64,
  });
  return result?.data || {};
}

export async function generateNeighborhoodMapPreviewBatch(
  listings,
  { concurrency = 2, onProgress, apiKey, endpoint } = {}
) {
  const items = Array.isArray(listings) ? listings : [];
  const results = new Array(items.length);
  let next = 0;

  async function worker() {
    while (next < items.length) {
      const i = next;
      next += 1;
      const item = items[i] || {};
      const address = typeof item === 'string' ? item : item.address;
      try {
        const data = await generateNeighborhoodMapHttp({
          address,
          title: item.title || address,
          lat: item.lat,
          lng: item.lng,
          radiusMeters: item.radiusMeters,
          apiKey,
          endpoint,
        });
        results[i] = data;
      } catch (err) {
        results[i] = {
          address: String(address || '').trim(),
          error: err?.message || String(err),
        };
      }
      if (typeof onProgress === 'function') {
        onProgress({
          done: results.filter(Boolean).length,
          total: items.length,
          index: i,
          result: results[i],
        });
      }
    }
  }

  const n = Math.max(1, Math.min(Number(concurrency) || 2, 5));
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, () => worker()));
  return results;
}
