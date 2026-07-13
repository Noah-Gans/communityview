import {
  TOUR_NEARBY_AMENITY_ORDER,
  rankPrintElementsWithPhotos,
  PROPERTY_TOUR_SLIDES,
} from './propertyTourSlides';
import { TOUR_NEARBY_AMENITY_KEYS } from './tourNearbyFirestore';

export function introSlideId(introId) {
  return `intro:${introId}`;
}

export function photoSlideId(elementId) {
  return `photo:${String(elementId || '').trim()}`;
}

export function amenitySlideId(amenityKey) {
  return `amenity:${String(amenityKey || '').trim()}`;
}

/** First three intro slides — fixed order, not removable or draggable. */
export const TOUR_LOCKED_INTRO_SLIDE_IDS = [
  introSlideId('welcome'),
  introSlideId('context'),
  introSlideId('bird'),
];

export const TOUR_LOCKED_INTRO_COUNT = TOUR_LOCKED_INTRO_SLIDE_IDS.length;

/** @param {string[]} plan @param {number} index */
export function isLockedTourSlideIndex(plan, index) {
  if (!Array.isArray(plan) || index < 0 || index >= plan.length) return false;
  return TOUR_LOCKED_INTRO_SLIDE_IDS.includes(String(plan[index] || '').trim());
}

/** @param {string} slideId */
export function parseSlideId(slideId) {
  const s = String(slideId || '').trim();
  if (s.startsWith('intro:')) {
    return { kind: 'intro', introId: s.slice(6) };
  }
  if (s.startsWith('photo:')) {
    return { kind: 'photo', elementId: s.slice(6) };
  }
  if (s.startsWith('amenity:')) {
    return { kind: 'amenity', amenityKey: s.slice(8) };
  }
  return null;
}

/**
 * Default contiguous slide order (legacy layout).
 * @param {unknown[]} printElements
 * @param {string[]} [enabledAmenityKeys]
 */
export function buildDefaultTourSlidePlan(printElements, enabledAmenityKeys) {
  const plan = [introSlideId('welcome'), introSlideId('context'), introSlideId('bird')];
  const ranked = rankPrintElementsWithPhotos(printElements).slice(0, 8);
  for (const { element } of ranked) {
    if (element?.id) plan.push(photoSlideId(element.id));
  }
  const keys =
    Array.isArray(enabledAmenityKeys) && enabledAmenityKeys.length
      ? enabledAmenityKeys
      : TOUR_NEARBY_AMENITY_ORDER.map((x) => x.key);
  for (const key of keys) {
    if (TOUR_NEARBY_AMENITY_KEYS.includes(key)) plan.push(amenitySlideId(key));
  }
  return plan;
}

/**
 * Validate and normalize a persisted slide plan.
 * @param {unknown} rawPlan
 * @param {unknown[]} printElements
 * @param {string[]} enabledAmenityKeys
 */
export function normalizeTourSlidePlan(rawPlan, printElements, enabledAmenityKeys) {
  const fallback = buildDefaultTourSlidePlan(printElements, enabledAmenityKeys);
  if (!Array.isArray(rawPlan) || !rawPlan.length) return fallback;

  const photoIds = new Set(
    rankPrintElementsWithPhotos(printElements)
      .slice(0, 8)
      .map((r) => r.element?.id)
      .filter(Boolean)
  );
  const introIds = new Set(['welcome', 'context', 'bird']);
  const seen = new Set();
  const out = [];

  for (const raw of rawPlan) {
    const id = String(raw || '').trim();
    if (!id || seen.has(id)) continue;
    const parsed = parseSlideId(id);
    if (!parsed) continue;
    if (parsed.kind === 'intro' && introIds.has(parsed.introId)) {
      seen.add(id);
      out.push(id);
    } else if (parsed.kind === 'photo' && photoIds.has(parsed.elementId)) {
      seen.add(id);
      out.push(id);
    } else if (parsed.kind === 'amenity' && TOUR_NEARBY_AMENITY_KEYS.includes(parsed.amenityKey)) {
      seen.add(id);
      out.push(id);
    }
  }

  return out.length ? out : fallback;
}

/**
 * Reorder slides (drag-and-drop). Adjusts target index when moving down the list.
 * @param {string[]} plan
 * @param {number} fromIndex
 * @param {number} toIndex
 */
export function reorderSlidePlan(plan, fromIndex, toIndex) {
  if (!Array.isArray(plan) || fromIndex === toIndex) return plan;
  if (fromIndex < 0 || fromIndex >= plan.length || toIndex < 0 || toIndex >= plan.length) {
    return plan;
  }
  if (isLockedTourSlideIndex(plan, fromIndex)) return plan;
  if (toIndex < TOUR_LOCKED_INTRO_COUNT) return plan;
  const next = [...plan];
  const [moved] = next.splice(fromIndex, 1);
  const insertAt = toIndex > fromIndex ? toIndex - 1 : toIndex;
  next.splice(insertAt, 0, moved);
  return next;
}

/** @param {string[]} slidePlan */
export function enabledAmenityKeysFromPlan(slidePlan) {
  const keys = [];
  for (const id of slidePlan || []) {
    const p = parseSlideId(id);
    if (p?.kind === 'amenity' && !keys.includes(p.amenityKey)) keys.push(p.amenityKey);
  }
  return keys;
}

/**
 * Map slide content to legacy step index for camera/layer code paths.
 * @param {string} slideId
 * @param {unknown[]} printElements
 * @param {string[]} nearbyAmenityOrder
 */
export function resolveLegacyStepForSlideContent(slideId, printElements, nearbyAmenityOrder) {
  const parsed = parseSlideId(slideId);
  if (!parsed) return 0;
  if (parsed.kind === 'intro') {
    const idx = { welcome: 0, context: 1, bird: 2 }[parsed.introId];
    return Number.isFinite(idx) ? idx : 0;
  }
  if (parsed.kind === 'photo') {
    const ranked = rankPrintElementsWithPhotos(printElements).slice(0, 8);
    const k = ranked.findIndex((r) => r.element?.id === parsed.elementId);
    return k >= 0 ? 3 + k : 3;
  }
  if (parsed.kind === 'amenity') {
    const ranked = rankPrintElementsWithPhotos(printElements).slice(0, 8);
    const photoLen = ranked.length;
    const order =
      Array.isArray(nearbyAmenityOrder) && nearbyAmenityOrder.length
        ? nearbyAmenityOrder
        : TOUR_NEARBY_AMENITY_ORDER.map((x) => x.key);
    const amenityIdx = order.indexOf(parsed.amenityKey);
    return amenityIdx >= 0 ? 3 + photoLen + amenityIdx : 3 + photoLen;
  }
  return 0;
}

/** @param {string[]} slidePlan */
export function getActiveAmenityKeyFromPlan(slidePlan, planIndex) {
  const parsed = parseSlideId(slidePlan?.[planIndex]);
  return parsed?.kind === 'amenity' ? parsed.amenityKey : null;
}

/** @param {string[]} slidePlan */
export function isPlanIndexVicinity(slidePlan, planIndex) {
  return parseSlideId(slidePlan?.[planIndex])?.kind === 'amenity';
}

/** @param {string[]} slidePlan */
export function isPlanIndexExpandedAgent(slidePlan, planIndex) {
  const parsed = parseSlideId(slidePlan?.[planIndex]);
  return parsed?.kind === 'intro' && (parsed.introId === 'welcome' || parsed.introId === 'context');
}

/**
 * @param {string} slideId
 * @param {{
 *   tourPhotoRanked?: { element?: { id?: string, label?: string, type?: string } }[],
 * }} ctx
 */
export function getSlideMetaForPlanId(slideId, ctx = {}) {
  const parsed = parseSlideId(slideId);
  if (!parsed) return { label: 'Slide', kind: 'base', icon: '' };
  if (parsed.kind === 'intro') {
    const idx = { welcome: 0, context: 1, bird: 2 }[parsed.introId];
    const s = PROPERTY_TOUR_SLIDES[idx];
    return { label: s?.title || parsed.introId, kind: 'intro', icon: '' };
  }
  if (parsed.kind === 'photo') {
    const el = ctx.tourPhotoRanked?.find((r) => r.element?.id === parsed.elementId)?.element;
    const label =
      (el?.label && String(el.label).trim()) ||
      (el?.type === 'polygon' ? 'Area' : el?.type === 'shape' ? 'Point' : 'Photo');
    return { label, kind: 'photo', icon: '' };
  }
  if (parsed.kind === 'amenity') {
    const meta = TOUR_NEARBY_AMENITY_ORDER.find((x) => x.key === parsed.amenityKey);
    return { label: meta?.label || 'Nearby', kind: 'amenity', icon: '' };
  }
  return { label: 'Slide', kind: 'base', icon: '' };
}
