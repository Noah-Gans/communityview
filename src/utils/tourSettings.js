import { AMENITY_MAP_CATEGORY_KEYS } from './amenityMapCatalog';
import { TOUR_NEARBY_SEARCH_RADIUS_METERS, TOUR_NEARBY_AMENITY_ORDER } from './propertyTourSlides';
import {
  normalizeTourNearbyCacheFromFirestore,
  TOUR_NEARBY_AMENITY_KEYS,
} from './tourNearbyFirestore';
import { enabledAmenityKeysFromPlan, normalizeTourSlidePlan } from './tourSlidePlan';
import { normalizeSlidePrintElements, pickSlidePrintElements } from './tourSlidePrintElements';
import { TOUR_NEARBY_DATA_VERSION } from './tourNearbyRanking';

const METERS_PER_MILE = 1609.344;

export const TOUR_RADIUS_PRESET_MILES = [5, 10, 15, 20, 30];

export const DEFAULT_TOUR_SEARCH_RADIUS_METERS = TOUR_NEARBY_SEARCH_RADIUS_METERS;

export function clampTourSearchRadiusMeters(value) {
  return Math.min(50000, Math.max(500, Number(value) || DEFAULT_TOUR_SEARCH_RADIUS_METERS));
}

export function milesToTourRadiusMeters(miles) {
  return clampTourSearchRadiusMeters(Number(miles) * METERS_PER_MILE);
}

export function tourRadiusMetersToMiles(meters) {
  const m = clampTourSearchRadiusMeters(meters);
  return Math.round((m / METERS_PER_MILE) * 10) / 10;
}

/** @param {unknown} raw */
function normalizeAmenityRadiusMeters(raw) {
  if (!raw || typeof raw !== 'object') return {};
  const out = {};
  for (const [key, value] of Object.entries(raw)) {
    const k = String(key || '').trim();
    if (!TOUR_NEARBY_AMENITY_KEYS.includes(k)) continue;
    out[k] = clampTourSearchRadiusMeters(value);
  }
  return out;
}

/**
 * Search radius for a specific amenity (falls back to global default).
 * @param {unknown} tourSettings
 * @param {string|null|undefined} amenityKey
 */
export function getAmenitySearchRadiusMeters(tourSettings, amenityKey) {
  const settings = normalizeTourSettings(tourSettings);
  const key = String(amenityKey || '').trim();
  if (key && settings.amenityRadiusMeters?.[key] != null) {
    return settings.amenityRadiusMeters[key];
  }
  return settings.searchRadiusMeters;
}

/** @param {unknown} raw */
export function normalizeTourSettings(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const enabledRaw = Array.isArray(src.enabledAmenityKeys) ? src.enabledAmenityKeys : TOUR_NEARBY_AMENITY_KEYS;
  const enabledAmenityKeys = [];
  for (const rawKey of enabledRaw) {
    const key = String(rawKey || '').trim();
    if (TOUR_NEARBY_AMENITY_KEYS.includes(key) && !enabledAmenityKeys.includes(key)) {
      enabledAmenityKeys.push(key);
    }
  }
  const slidePlan = Array.isArray(src.slidePlan)
    ? src.slidePlan.map((s) => String(s || '').trim()).filter(Boolean)
    : null;
  const planKeys = enabledAmenityKeysFromPlan(slidePlan);
  const resolvedAmenityKeys = planKeys.length
    ? planKeys
    : enabledAmenityKeys.length
      ? enabledAmenityKeys
      : [...TOUR_NEARBY_AMENITY_KEYS];
  return {
    searchRadiusMeters: clampTourSearchRadiusMeters(src.searchRadiusMeters),
    enabledAmenityKeys: resolvedAmenityKeys,
    slidePlan: slidePlan?.length ? slidePlan : null,
    slidePlanUserEdited: src.slidePlanUserEdited === true,
    amenityRadiusMeters: normalizeAmenityRadiusMeters(src.amenityRadiusMeters),
    slidePrintElements: normalizeSlidePrintElements(src.slidePrintElements),
  };
}

export function getEnabledTourAmenityOrder(tourSettings) {
  const settings = normalizeTourSettings(tourSettings);
  const fromPlan = enabledAmenityKeysFromPlan(settings.slidePlan);
  if (fromPlan.length) return fromPlan;
  return settings.enabledAmenityKeys;
}

/**
 * Tour-supported amenity keys that actually have saved places. Used to decide what
 * an un-edited slide plan should pick up from the amenity map.
 * @param {unknown} tourNearbyCache
 */
export function amenityKeysWithSavedFeatures(tourNearbyCache) {
  const byAmenity =
    tourNearbyCache && typeof tourNearbyCache === 'object' ? tourNearbyCache.byAmenity : null;
  if (!byAmenity || typeof byAmenity !== 'object') return [];
  return TOUR_NEARBY_AMENITY_KEYS.filter((key) => {
    const features = byAmenity[key]?.features;
    return Array.isArray(features) && features.some((f) => String(f?.properties?.name || '').trim());
  });
}

/**
 * Ensure `slidePlan` is always a concrete ordered list (never null in UI state).
 * @param {unknown} rawSettings
 * @param {unknown[]} printElements
 * @param {{ availableAmenityKeys?: string[] }} [options]
 */
export function materializeTourSettingsSlidePlan(rawSettings, printElements, options = {}) {
  const settings = normalizeTourSettings(rawSettings);
  const plan = normalizeTourSlidePlan(
    settings.slidePlan,
    printElements,
    settings.enabledAmenityKeys,
    {
      userEdited: settings.slidePlanUserEdited,
      availableAmenityKeys: options.availableAmenityKeys,
    }
  );
  return normalizeTourSettings({ ...settings, slidePlan: plan });
}

/**
 * Resolve tour settings from map doc fields and/or embedded cache metadata.
 * @param {{ tourSettings?: unknown, tourNearbyCache?: unknown, tourSlidePlan?: unknown }|null|undefined} mapData
 */
export function resolveTourSettingsFromMap(mapData) {
  const rawCache = mapData?.tourNearbyCache;
  const fromDoc = mapData?.tourSettings;
  const fromCacheEmbedded = rawCache?.tourSettings;

  const radius =
    fromCacheEmbedded?.searchRadiusMeters ??
    rawCache?.searchRadiusMeters ??
    fromDoc?.searchRadiusMeters;

  const tourSlidePlanRoot = Array.isArray(mapData?.tourSlidePlan)
    ? mapData.tourSlidePlan.map((s) => String(s || '').trim()).filter(Boolean)
    : null;

  const slidePlanFromCache = Array.isArray(fromCacheEmbedded?.slidePlan)
    ? fromCacheEmbedded.slidePlan
    : null;
  const slidePlanFromDoc = Array.isArray(fromDoc?.slidePlan) ? fromDoc.slidePlan : null;
  const slidePlan =
    tourSlidePlanRoot?.length
      ? tourSlidePlanRoot
      : slidePlanFromDoc?.length
        ? slidePlanFromDoc
        : slidePlanFromCache;

  const slidePlanUserEdited =
    fromDoc?.slidePlanUserEdited === true || fromCacheEmbedded?.slidePlanUserEdited === true;

  if (slidePlan?.length) {
    return normalizeTourSettings({
      slidePlan,
      slidePlanUserEdited,
      searchRadiusMeters: radius,
      enabledAmenityKeys: fromDoc?.enabledAmenityKeys ?? fromCacheEmbedded?.enabledAmenityKeys,
      amenityRadiusMeters: fromDoc?.amenityRadiusMeters ?? fromCacheEmbedded?.amenityRadiusMeters,
      slidePrintElements: pickSlidePrintElements(
        fromDoc?.slidePrintElements,
        fromCacheEmbedded?.slidePrintElements
      ),
    });
  }

  const enabledFromCache = Array.isArray(fromCacheEmbedded?.enabledAmenityKeys)
    ? fromCacheEmbedded.enabledAmenityKeys
    : null;
  const enabledFromDoc = Array.isArray(fromDoc?.enabledAmenityKeys) ? fromDoc.enabledAmenityKeys : null;
  const enabledAmenityKeys = enabledFromCache?.length
    ? enabledFromCache
    : enabledFromDoc?.length
      ? enabledFromDoc
      : null;

  if (enabledAmenityKeys?.length) {
    return normalizeTourSettings({
      enabledAmenityKeys,
      searchRadiusMeters: radius,
      slidePlan,
      slidePlanUserEdited,
      amenityRadiusMeters: fromDoc?.amenityRadiusMeters ?? fromCacheEmbedded?.amenityRadiusMeters,
      slidePrintElements: pickSlidePrintElements(
        fromDoc?.slidePrintElements,
        fromCacheEmbedded?.slidePrintElements
      ),
    });
  }

  const root = normalizeTourNearbyCacheFromFirestore(rawCache);
  if (root) {
    const embeddedKeys = root.tourSettings?.enabledAmenityKeys;
    if (Array.isArray(embeddedKeys) && embeddedKeys.length) {
      return normalizeTourSettings({
        enabledAmenityKeys: embeddedKeys,
        searchRadiusMeters: root.searchRadiusMeters,
        slidePlan: root.tourSettings?.slidePlan,
        slidePlanUserEdited,
        amenityRadiusMeters: root.tourSettings?.amenityRadiusMeters,
        slidePrintElements: pickSlidePrintElements(
          fromDoc?.slidePrintElements,
          fromCacheEmbedded?.slidePrintElements,
          root.tourSettings?.slidePrintElements
        ),
      });
    }
    const keys = TOUR_NEARBY_AMENITY_KEYS.filter((k) => {
      const features = root.byAmenity?.[k]?.features;
      return Array.isArray(features) && features.length > 0;
    });
    if (keys.length) {
      return normalizeTourSettings({
        enabledAmenityKeys: keys,
        searchRadiusMeters: root.searchRadiusMeters,
        slidePlan,
        slidePlanUserEdited,
        slidePrintElements: pickSlidePrintElements(
          fromDoc?.slidePrintElements,
          fromCacheEmbedded?.slidePrintElements,
          root.tourSettings?.slidePrintElements
        ),
      });
    }
  }

  if (fromDoc && typeof fromDoc === 'object' && Object.keys(fromDoc).length) {
    return normalizeTourSettings(fromDoc);
  }

  return normalizeTourSettings(null);
}

/** True when the map has an explicitly curated tour (saved slide plan, hidden places, etc.). */
export function mapHasCuratedTourData(mapData) {
  if (!mapData) return false;
  if (Array.isArray(mapData.tourSlidePlan) && mapData.tourSlidePlan.length) {
    return true;
  }
  if (Array.isArray(mapData.tourSettings?.slidePlan) && mapData.tourSettings.slidePlan.length) {
    return true;
  }
  const rawSettings = mapData.tourSettings;
  if (rawSettings && typeof rawSettings === 'object') {
    const slidePrint = normalizeSlidePrintElements(rawSettings.slidePrintElements);
    if (Object.keys(slidePrint).length) return true;
  }
  const rawCache = mapData.tourNearbyCache;
  const root = normalizeTourNearbyCacheFromFirestore(rawCache);
  if (!root) return false;
  if (Array.isArray(root.tourSettings?.slidePlan) && root.tourSettings.slidePlan.length) {
    return true;
  }
  for (const fc of Object.values(root.byAmenity || {})) {
    if ((fc.features || []).some((f) => f?.properties?.tourHidden === true)) return true;
  }
  return false;
}

/** Loose check for share panel — any persisted amenity results count as “tour built”. */
export function mapHasTourNearbyData(tourNearbyCache) {
  const root = normalizeTourNearbyCacheFromFirestore(tourNearbyCache);
  if (!root?.byAmenity) return false;
  return Object.values(root.byAmenity).some(
    (fc) => Array.isArray(fc?.features) && fc.features.some((f) => String(f?.properties?.name || '').trim())
  );
}

function amenityMapCategoryIsCovered(entry) {
  if (!entry) return false;
  const features = Array.isArray(entry.features) ? entry.features : [];
  return features.some((f) => String(f?.properties?.name || '').trim());
}

/**
 * True when every amenity-map category has been fetched (including empty).
 * Used to skip Places auto-generate, not for the share-kit Ready state.
 */
export function mapHasAmenityMapData(tourNearbyCache) {
  const root = normalizeTourNearbyCacheFromFirestore(tourNearbyCache);
  if (!root?.byAmenity) return false;
  return AMENITY_MAP_CATEGORY_KEYS.every((key) => amenityMapCategoryIsCovered(root.byAmenity[key]));
}

/**
 * Amenity-map share card is ready when nearby places exist. Tour and amenity
 * map share that cache and start from the same category list.
 */
export function mapAmenityShareCardReady(tourNearbyCache) {
  return mapHasTourNearbyData(tourNearbyCache);
}

/** Amenity-map categories that still need a Places fetch. */
export function amenityMapCategoriesNeedingFetch(tourNearbyCache) {
  const root = normalizeTourNearbyCacheFromFirestore(tourNearbyCache);
  const byAmenity = root?.byAmenity || {};
  return AMENITY_MAP_CATEGORY_KEYS.filter((key) => !amenityMapCategoryIsCovered(byAmenity[key]));
}

/** True when the agent has toggled place visibility (amenity map or tour). */
export function tourNearbyCacheLooksCurated(tourNearbyCache) {
  const root = normalizeTourNearbyCacheFromFirestore(tourNearbyCache);
  if (!root?.byAmenity) return false;
  return Object.values(root.byAmenity).some((fc) =>
    (fc?.features || []).some(
      (f) => f?.properties?.amenityMapHidden === true || f?.properties?.tourHidden === true
    )
  );
}

export function featureVisibleOnAmenityMap(feature) {
  return feature?.properties?.amenityMapHidden !== true;
}

export function featureVisibleOnTour(feature) {
  return feature?.properties?.tourHidden !== true;
}

/**
 * Keep the other product's hide flag when one editor re-searches a category.
 * Amenity map and tour share place records; each has its own `*Hidden` field.
 */
export function mergePlaceVisibilityFromPrior(nextFeature, priorFeature) {
  if (!nextFeature || !priorFeature) return nextFeature;
  const nextProps = nextFeature.properties || {};
  const priorProps = priorFeature.properties || {};
  const props = { ...nextProps };
  if (priorProps.amenityMapHidden === true) props.amenityMapHidden = true;
  if (priorProps.tourHidden === true) props.tourHidden = true;
  return { ...nextFeature, properties: props };
}

function filterByAmenity(byAmenity, keepFeature) {
  const out = {};
  for (const [key, entry] of Object.entries(byAmenity || {})) {
    const features = Array.isArray(entry?.features) ? entry.features.filter(keepFeature) : [];
    out[key] = { ...entry, features };
  }
  return out;
}

/** Amenity map + neighborhood PDF: ignore tour hide / removed tour slides. */
export function byAmenityVisibleForAmenityMap(byAmenity) {
  return filterByAmenity(byAmenity, featureVisibleOnAmenityMap);
}

/**
 * @deprecated Use {@link byAmenityVisibleForAmenityMap} — neighborhood PDF follows the amenity map.
 */
export function byAmenityVisibleForListing(byAmenity) {
  return byAmenityVisibleForAmenityMap(byAmenity);
}

/**
 * Share panel: map already has a tour worth sharing (not a fresh map).
 * Pass raw Firestore fields only — never normalized {@link normalizeTourSettings} output.
 */
export function mapHasShareableTour(mapData) {
  if (!mapData) return false;
  if (mapHasCuratedTourData(mapData)) return true;
  return mapHasTourNearbyData(mapData.tourNearbyCache);
}

/** @param {unknown[]} features */
export function visibleTourNearbyFeatures(features) {
  if (!Array.isArray(features)) return [];
  return features.filter((f) => !f?.properties?.tourHidden);
}

/** @param {{ features?: unknown[] }|null|undefined} entry */
export function amenityCollectionForDisplay(entry) {
  const features = visibleTourNearbyFeatures(entry?.features);
  return { type: 'FeatureCollection', features };
}

/** @param {Record<string, { features?: unknown[] }>|null|undefined} byAmenity */
export function nearbyContextByAmenityForDisplay(byAmenity) {
  const out = {};
  for (const [key, entry] of Object.entries(byAmenity || {})) {
    out[key] = amenityCollectionForDisplay(entry);
  }
  return out;
}

/** Hydrate builder state from Firestore cache + settings. */
export function hydrateTourBuilderAmenityState(tourNearbyCache, tourSettings) {
  const root = normalizeTourNearbyCacheFromFirestore(tourNearbyCache);
  const settings = normalizeTourSettings(tourSettings);
  const radius =
    root?.searchRadiusMeters != null
      ? clampTourSearchRadiusMeters(root.searchRadiusMeters)
      : settings.searchRadiusMeters;
  const dataVersion = root?.dataVersion || TOUR_NEARBY_DATA_VERSION;
  const out = {};
  const keysToHydrate = new Set(settings.enabledAmenityKeys);
  for (const key of Object.keys(root?.byAmenity || {})) {
    if (TOUR_NEARBY_AMENITY_KEYS.includes(key)) keysToHydrate.add(key);
  }
  for (const key of keysToHydrate) {
    const fc = root?.byAmenity?.[key];
    if (fc && Array.isArray(fc.features)) {
      out[key] = {
        type: 'FeatureCollection',
        features: fc.features,
        fetched: true,
        searchRadiusMeters: getAmenitySearchRadiusMeters(settings, key),
        dataVersion,
      };
    }
  }
  return { nearbyContextByAmenity: out, searchRadiusMeters: radius, tourSettings: settings };
}
