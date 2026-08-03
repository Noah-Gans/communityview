const MILES_TO_METERS = 1609.344;

/**
 * `badgeFile` reuses the property tour's pre-composited disc markers in
 * `public/tour_nearby_badges`. Categories without one fall back to a colored dot.
 */
export const AMENITY_MAP_CATEGORIES = [
  {
    key: 'parks_rec',
    label: 'Parks',
    singular: 'park',
    color: '#2f855a',
    googleTypes: ['park'],
    defaultRadiusMiles: 2,
    badgeFile: 'parks-rec-badge.png',
  },
  {
    key: 'schools',
    label: 'Schools',
    singular: 'school',
    color: '#2563eb',
    googleTypes: ['primary_school', 'secondary_school', 'school'],
    defaultRadiusMiles: 3,
    badgeFile: 'school-badge.png',
  },
  {
    key: 'coffee',
    label: 'Cafés',
    singular: 'café',
    color: '#a16207',
    googleTypes: ['cafe', 'coffee_shop', 'bakery'],
    defaultRadiusMiles: 1.5,
    badgeFile: 'coffee-badge.png',
  },
  {
    key: 'dining',
    label: 'Restaurants',
    singular: 'restaurant',
    color: '#ea580c',
    googleTypes: ['restaurant', 'pizza_restaurant', 'seafood_restaurant', 'meal_takeaway'],
    defaultRadiusMiles: 1.5,
    badgeFile: 'dining-badge.png',
    logoFile: 'restaurant.png',
  },
  {
    key: 'grocery',
    label: 'Grocery stores',
    singular: 'grocery store',
    color: '#ca8a04',
    googleTypes: ['supermarket', 'grocery_store', 'food_store'],
    defaultRadiusMiles: 1.5,
    badgeFile: 'grocery-badge.png',
  },
  {
    key: 'fitness',
    label: 'Fitness & gyms',
    singular: 'gym',
    color: '#e11d48',
    googleTypes: ['gym'],
    defaultRadiusMiles: 2,
    badgeFile: 'fitness-badge.png',
  },
  {
    key: 'transit',
    label: 'Transit',
    singular: 'transit stop',
    color: '#4f46e5',
    googleTypes: ['subway_station', 'train_station', 'bus_station', 'transit_station'],
    defaultRadiusMiles: 2,
    badgeFile: 'transit-badge.png',
  },
  {
    key: 'essentials',
    label: 'Essentials',
    singular: 'essential',
    color: '#57534e',
    googleTypes: ['pharmacy', 'drugstore', 'hardware_store', 'bank'],
    defaultRadiusMiles: 1.5,
    badgeFile: 'essentials-badge.png',
  },
  {
    key: 'fire_station',
    label: 'Fire stations',
    singular: 'fire station',
    color: '#dc2626',
    googleTypes: ['fire_station'],
    defaultRadiusMiles: 4,
    badgeFile: 'fire-station-badge.png',
    logoFile: 'fire-station.png',
  },
  {
    key: 'police_station',
    label: 'Police stations',
    singular: 'police station',
    color: '#334155',
    googleTypes: ['police'],
    defaultRadiusMiles: 4,
    badgeFile: 'police-station-badge.png',
    logoFile: 'police.png',
  },
  {
    key: 'library',
    label: 'Libraries',
    singular: 'library',
    color: '#7c3aed',
    googleTypes: ['library'],
    defaultRadiusMiles: 3,
    badgeFile: 'library-badge.png',
    logoFile: 'library.png',
  },
];

export const AMENITY_MAP_CATEGORY_KEYS = AMENITY_MAP_CATEGORIES.map(({ key }) => key);

export const AMENITY_MAP_CATEGORY_BY_KEY = Object.fromEntries(
  AMENITY_MAP_CATEGORIES.map((category) => [category.key, category])
);

export function amenityRadiusMilesToMeters(miles) {
  return Math.round(Math.max(0.5, Math.min(25, Number(miles) || 1)) * MILES_TO_METERS);
}

export function amenityRadiusMetersToMiles(meters) {
  return Math.round((Number(meters) / MILES_TO_METERS) * 10) / 10;
}

export function defaultAmenityRadiusMeters() {
  return Object.fromEntries(
    AMENITY_MAP_CATEGORIES.map((category) => [
      category.key,
      amenityRadiusMilesToMeters(category.defaultRadiusMiles),
    ])
  );
}

export function amenityFeatureKey(feature) {
  const properties = feature?.properties || {};
  return String(
    properties.placeId ||
      properties.place_id ||
      `${properties.amenityKey || 'place'}:${properties.name || ''}:${
        feature?.geometry?.coordinates?.join(',') || ''
      }`
  );
}
