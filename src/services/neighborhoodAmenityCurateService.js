import { getFunctions, httpsCallable } from 'firebase/functions';
import app from '../firebase/firebaseConfig';

/**
 * Ask Gemini to curate neighborhood amenity candidates.
 * Falls back to empty placeIds (caller uses heuristic) if unavailable.
 */
export async function curateNeighborhoodAmenitiesWithAi({
  address,
  placeLabel,
  candidates,
} = {}) {
  const list = Array.isArray(candidates) ? candidates : [];
  if (!list.length) return { placeIds: [], source: 'empty', notes: '' };

  try {
    const fn = httpsCallable(getFunctions(app), 'curateNeighborhoodAmenities');
    const result = await fn({
      address: address || '',
      placeLabel: placeLabel || '',
      candidates: list.map((c) => ({
        id: c.id || c.placeId,
        name: c.name,
        category: c.category || c.categoryLabel || c.amenityKey,
        amenityKey: c.amenityKey,
        miles: c.miles,
        rating: c.rating,
        reviews: c.reviews,
      })),
    });
    const data = result?.data || {};
    return {
      placeIds: Array.isArray(data.placeIds) ? data.placeIds : [],
      source: data.source || 'gemini',
      notes: data.notes || '',
      model: data.model || '',
    };
  } catch (err) {
    console.warn('curateNeighborhoodAmenities failed:', err?.message || err);
    return { placeIds: [], source: 'error', notes: err?.message || '' };
  }
}
