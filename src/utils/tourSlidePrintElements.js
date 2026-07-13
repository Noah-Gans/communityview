/**
 * Per-slide visibility for map print elements during property tour slides.
 * Missing / null entry = show all map elements (default).
 */

/** @param {unknown} raw */
export function normalizeSlidePrintElements(raw) {
  if (!raw || typeof raw !== 'object') return {};
  const out = {};
  for (const [slideId, ids] of Object.entries(raw)) {
    const key = String(slideId || '').trim();
    if (!key || !Array.isArray(ids)) continue;
    const cleaned = ids.map((id) => String(id || '').trim()).filter(Boolean);
    // Keep empty arrays — they mean "hide all map elements on this slide".
    out[key] = cleaned;
  }
  return out;
}

/** Prefer the richest slidePrintElements object from multiple persisted sources. */
export function pickSlidePrintElements(...sources) {
  let best = {};
  let bestKeyCount = -1;
  for (const src of sources) {
    if (src == null) continue;
    const norm = normalizeSlidePrintElements(src);
    const keyCount = Object.keys(norm).length;
    if (keyCount > bestKeyCount) {
      best = norm;
      bestKeyCount = keyCount;
    }
  }
  return bestKeyCount >= 0 ? best : {};
}

/**
 * @param {unknown[]} printElements
 * @returns {string[]}
 */
export function allTourPrintElementIds(printElements) {
  if (!Array.isArray(printElements)) return [];
  return printElements
    .filter((el) => el && el.id && !el.hiddenOnMap)
    .map((el) => String(el.id));
}

/**
 * Visible element ids for a slide (default = all).
 * @param {{ slidePrintElements?: Record<string, string[]> }|null|undefined} tourSettings
 * @param {string} slidePlanId
 * @param {unknown[]} printElements
 */
export function getSlidePrintElementIds(tourSettings, slidePlanId, printElements) {
  const all = allTourPrintElementIds(printElements);
  const slideId = String(slidePlanId || '').trim();
  const map = tourSettings?.slidePrintElements;
  if (!slideId || !map || !Object.prototype.hasOwnProperty.call(map, slideId)) return all;
  const custom = map[slideId];
  if (!Array.isArray(custom)) return all;
  if (!custom.length) return [];
  const allowed = new Set(custom);
  return all.filter((id) => allowed.has(id));
}

/** @param {string} slidePlanId @param {unknown[]} printElements */
export function isSlidePrintElementVisible(tourSettings, slidePlanId, printElements, elementId) {
  const id = String(elementId || '').trim();
  if (!id) return false;
  const visible = getSlidePrintElementIds(tourSettings, slidePlanId, printElements);
  return visible.includes(id);
}

/**
 * @param {Record<string, string[]>} slidePrintElements
 * @param {string} slidePlanId
 * @param {string} elementId
 * @param {unknown[]} printElements
 */
export function toggleSlidePrintElement(slidePrintElements, slidePlanId, elementId, printElements) {
  const slideId = String(slidePlanId || '').trim();
  const elId = String(elementId || '').trim();
  const all = allTourPrintElementIds(printElements);
  if (!slideId || !elId || !all.length) return slidePrintElements || {};

  const current = getSlidePrintElementIds({ slidePrintElements }, slideId, printElements);
  const set = new Set(current);
  if (set.has(elId)) set.delete(elId);
  else set.add(elId);

  const next = { ...(slidePrintElements || {}) };
  if (set.size >= all.length) {
    delete next[slideId];
    return next;
  }
  next[slideId] = all.filter((id) => set.has(id));
  return next;
}

/**
 * Resolve how Map.js should filter print overlays for the active tour slide.
 * @param {string|null|undefined} legacySlideId welcome|context|bird|perspective|vicinity
 * @param {{ slidePrintElements?: Record<string, string[]> }|null|undefined} tourSettings
 * @param {string|null|undefined} slidePlanId
 * @param {unknown[]} printElements
 */
export function resolveTourPrintFilterForSlide(legacySlideId, tourSettings, slidePlanId, printElements) {
  const planId = String(slidePlanId || '').trim();
  const map = tourSettings?.slidePrintElements;
  if (planId && map && Object.prototype.hasOwnProperty.call(map, planId)) {
    const custom = map[planId];
    if (!Array.isArray(custom)) {
      return { mode: 'all', elementIds: null };
    }
    return { mode: 'whitelist', elementIds: [...custom] };
  }
  return { mode: 'all', elementIds: null };
}
