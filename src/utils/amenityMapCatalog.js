const MILES_TO_METERS = 1609.344;

/**
 * Shared amenity set for the amenity map and property tour.
 * `badgeFile` is a pre-composited disc in `public/tour_nearby_badges`.
 */
export const AMENITY_MAP_CATEGORIES = [
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
    key: 'parks_rec',
    label: 'Parks',
    singular: 'park',
    color: '#2f855a',
    googleTypes: ['park'],
    defaultRadiusMiles: 2,
    badgeFile: 'parks-rec-badge.png',
  },
  {
    key: 'grocery',
    label: 'Grocery stores',
    singular: 'grocery store',
    color: '#2563eb',
    googleTypes: ['supermarket', 'grocery_store'],
    defaultRadiusMiles: 1.5,
    badgeFile: 'grocery-badge.png',
  },
  {
    key: 'schools',
    label: 'Schools',
    singular: 'school',
    color: '#b91c1c',
    googleTypes: ['primary_school', 'secondary_school'],
    defaultRadiusMiles: 3,
    badgeFile: 'school-badge.png',
  },
  {
    key: 'fitness',
    label: 'Fitness & gyms',
    singular: 'gym',
    color: '#7c3aed',
    googleTypes: ['gym'],
    defaultRadiusMiles: 2,
    badgeFile: 'fitness-badge.png',
  },
  {
    key: 'trailheads',
    label: 'Trailheads',
    singular: 'trailhead',
    color: '#3f6212',
    googleTypes: ['hiking_area'],
    defaultRadiusMiles: 7,
    logoFile: 'hiking.svg',
    recolorBadge: true,
  },
  {
    key: 'essentials',
    label: 'Essentials',
    singular: 'essential',
    color: '#eab308',
    googleTypes: ['pharmacy', 'drugstore', 'hardware_store', 'bank'],
    defaultRadiusMiles: 1.5,
    badgeFile: 'essentials-badge.png',
    logoFile: 'tools.svg',
    recolorBadge: true,
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
    key: 'airport',
    label: 'Airports',
    singular: 'airport',
    color: '#0369a1',
    googleTypes: ['airport'],
    defaultRadiusMiles: 15,
    badgeFile: 'airport-badge.png',
    logoFile: 'plane-alt.svg',
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

export function amenityCategoryHex(amenityKey) {
  return AMENITY_MAP_CATEGORY_BY_KEY[amenityKey]?.color || '#0f172a';
}

export function amenityCategoryRgb(amenityKey) {
  const hex = String(amenityCategoryHex(amenityKey)).replace('#', '');
  if (hex.length !== 6) return [15, 23, 42];
  return [
    parseInt(hex.slice(0, 2), 16),
    parseInt(hex.slice(2, 4), 16),
    parseInt(hex.slice(4, 6), 16),
  ];
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
