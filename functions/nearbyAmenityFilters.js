const GROCERY_NAME_BLOCK_RE = new RegExp(
  "\\b(7-?eleven|circle\\s*k|wawa|speedway|quiktrip|shell|chevron|exxon|" +
    "mobil|marathon|bp\\b|fuel|gas station|petro|sunoco|valero|ampm|am\\/pm)\\b",
  "i"
);

const TRAILHEAD_NAME_RE = /\btrail\s*heads?\b|\btrailhead\b/i;

const SCHOOL_NAME_BLOCK_RE = new RegExp(
  "\\b(university|college|community college|rock climbing|instructor|tutor|" +
    "driving school|music school|dance school|martial arts|daycare|day care|" +
    "preschool|pre-school|montessori|seminary|trade school|vocational)\\b",
  "i"
);

const LODGING_TYPES = new Set([
  "lodging",
  "hotel",
  "motel",
  "guest_house",
  "bed_and_breakfast",
  "hostel",
  "resort_hotel",
  "extended_stay_hotel",
]);

const FITNESS_GYM_TYPES = new Set([
  "gym",
  "fitness_center",
  "sports_complex",
  "sports_club",
  "yoga_studio",
  "pilates_studio",
  "martial_arts_school",
]);

const GROCERY_STORE_TYPES = new Set(["supermarket", "grocery_store", "grocery_or_supermarket"]);

const SCHOOL_BLOCK_TYPES = new Set([
  "university",
  "college",
  "preschool",
  "child_care",
  "sports_coaching",
  "gym",
  "fitness_center",
  "sports_complex",
  "sports_club",
]);

const ESSENTIALS_TYPES = new Set(["pharmacy", "drugstore", "hardware_store", "bank"]);

const COFFEE_TYPES = new Set(["cafe", "coffee_shop"]);

const HOTEL_NAME_HINT_RE = new RegExp(
  "\\b(holiday inn|marriott|hilton|hyatt|sheraton|westin|hampton inn|" +
    "courtyard|fairfield|residence inn|doubletree|embassy suites|motel 6|" +
    "super 8|days inn|comfort inn|best western|la quinta|red roof|" +
    "extended stay|inn & suites|hotel\\b|motel\\b|lodging)\\b",
  "i"
);

const NON_GROCERY_FOOD_TYPES = new Set([
  "sandwich_shop",
  "meal_takeaway",
  "meal_delivery",
  "restaurant",
  "cafe",
  "coffee_shop",
  "bakery",
  "deli",
  "fast_food_restaurant",
]);

function placeTypes(placeOrProps) {
  const raw = placeOrProps?.types || placeOrProps?.googleTypes;
  return Array.isArray(raw) ? raw.map((t) => String(t)) : [];
}

function placeName(placeOrProps, nameOverride) {
  if (nameOverride != null) return String(nameOverride).toLowerCase();
  const n = placeOrProps?.name;
  return String(n || "").toLowerCase();
}

function hasGroceryStoreType(types) {
  return types.some((t) => GROCERY_STORE_TYPES.has(t));
}

function isNonSupermarketFoodRetail(types) {
  return (
    (types.includes("bakery") ||
      types.includes("cafe") ||
      types.includes("coffee_shop") ||
      types.includes("meal_takeaway")) &&
    !types.includes("supermarket") &&
    !types.includes("grocery_store")
  );
}

function isAllowedGroceryPlace(placeOrProps, nameOverride) {
  const types = placeTypes(placeOrProps);
  const name = placeName(placeOrProps, nameOverride);

  if (!hasGroceryStoreType(types)) return false;
  if (types.includes("gas_station") || types.includes("convenience_store")) return false;
  if (types.includes("liquor_store") && !hasGroceryStoreType(types)) return false;
  if (isNonSupermarketFoodRetail(types)) return false;
  if (types.some((t) => NON_GROCERY_FOOD_TYPES.has(t)) && !hasGroceryStoreType(types)) {
    return false;
  }
  if (GROCERY_NAME_BLOCK_RE.test(name)) return false;
  return true;
}

function isBlockedNonGrocery(placeOrProps, nameOverride) {
  return !isAllowedGroceryPlace(placeOrProps, nameOverride);
}

function isGroceryFetchCandidate(placeOrProps, nameOverride) {
  return isAllowedGroceryPlace(placeOrProps, nameOverride);
}

function isAllowedSchoolPlace(placeOrProps, nameOverride) {
  const types = placeTypes(placeOrProps);
  const name = placeName(placeOrProps, nameOverride);

  if (types.some((t) => SCHOOL_BLOCK_TYPES.has(t))) return false;
  if (SCHOOL_NAME_BLOCK_RE.test(name)) return false;
  if (/\b(pool|natatorium|aquatic center)\b/i.test(name)) return false;

  const hasPrimary = types.includes("primary_school");
  const hasSecondary = types.includes("secondary_school");
  if (hasPrimary || hasSecondary) return true;

  if (types.includes("school")) {
    if (
      /\b(elementary|middle|high|junior|senior|grade|public school|charter|k-12|k12|school district)\b/i.test(
        name
      )
    ) {
      return true;
    }
    if (/\b(school|academy)\b/i.test(name) && !/\b(rock|climb|instructor|tutor|driving|music|dance)\b/i.test(name)) {
      return true;
    }
    return false;
  }

  return false;
}

function isTrailheadPlace(placeOrProps, nameOverride) {
  const types = placeTypes(placeOrProps);
  const name = placeName(placeOrProps, nameOverride);
  if (TRAILHEAD_NAME_RE.test(name)) return true;
  if (types.includes("hiking_area")) return true;
  return false;
}

function isAllowedFitnessPlace(placeOrProps, nameOverride) {
  const types = placeTypes(placeOrProps);
  const name = placeName(placeOrProps, nameOverride);

  if (isTrailheadPlace(placeOrProps, nameOverride)) return false;
  if (types.some((t) => LODGING_TYPES.has(t))) return false;
  if (HOTEL_NAME_HINT_RE.test(name)) return false;

  const hasGymType = types.some((t) => FITNESS_GYM_TYPES.has(t));
  if (!hasGymType) return false;

  return true;
}

function isAllowedTrailheadPlace(placeOrProps, nameOverride) {
  if (!isTrailheadPlace(placeOrProps, nameOverride)) return false;
  const types = placeTypes(placeOrProps);
  const name = placeName(placeOrProps, nameOverride);
  if (/\brestaurant\b|\bcafe\b|\bbar\b|\bgrill\b/i.test(name)) return false;
  if (types.some((t) => LODGING_TYPES.has(t))) return false;
  if (HOTEL_NAME_HINT_RE.test(name)) return false;
  return true;
}

function isAllowedEssentialsPlace(placeOrProps, nameOverride) {
  const types = placeTypes(placeOrProps);
  return types.some((t) => ESSENTIALS_TYPES.has(t));
}

function isAllowedCoffeePlace(placeOrProps, nameOverride) {
  const types = placeTypes(placeOrProps);
  return types.some((t) => COFFEE_TYPES.has(t));
}

function isAllowedParkPlace(placeOrProps, nameOverride) {
  const types = placeTypes(placeOrProps);
  const name = placeName(placeOrProps, nameOverride);

  if (types.includes("cemetery")) return false;
  if (types.includes("parking") || types.includes("parking_lot")) return false;
  if (types.includes("rv_park") && !/\bcity\b|\bstate\b|\bcounty\b/i.test(name)) return false;
  if (types.includes("golf_course") && !/\bpark\b/i.test(name)) return false;

  const parkTypes = [
    "park",
    "playground",
    "national_park",
    "state_park",
    "dog_park",
    "picnic_ground",
    "campground",
    "natural_feature",
  ];
  if (parkTypes.some((t) => types.includes(t))) return true;
  if (/\b(park|playground|recreation|trail|nature reserve|open space)\b/i.test(name)) {
    return true;
  }
  if (
    types.includes("tourist_attraction") ||
    types.includes("point_of_interest") ||
    types.includes("establishment")
  ) {
    if (/\b(park|playground|garden|trail)\b/i.test(name)) return true;
  }

  return false;
}

const AMENITIES_WITH_LENIENT_FALLBACK = new Set([
  "grocery",
  "schools",
  "coffee",
  "essentials",
]);

function isLenientGroceryPlace(placeOrProps, nameOverride) {
  if (isAllowedGroceryPlace(placeOrProps, nameOverride)) return true;
  const types = placeTypes(placeOrProps);
  const name = placeName(placeOrProps, nameOverride);

  if (types.includes("gas_station") || types.includes("convenience_store")) return false;
  if (types.includes("liquor_store") && !hasGroceryStoreType(types)) return false;
  if (isNonSupermarketFoodRetail(types)) return false;
  if (GROCERY_NAME_BLOCK_RE.test(name)) return false;
  if (hasGroceryStoreType(types)) return true;
  if (
    /\b(grocery|supermarket|super foods|food mart|food center|food centre|grocers|foods)\b/i.test(
      name
    )
  ) {
    return true;
  }
  if (/\bfood\b/i.test(name) && /\b(center|centre|mart|store|foods)\b/i.test(name)) {
    return true;
  }
  if (/\b(market|mart)\b/i.test(name) && !/\b(farmer|flea|night|stock)\b/i.test(name)) {
    return true;
  }
  return false;
}

function isLenientSchoolPlace(placeOrProps, nameOverride) {
  if (isAllowedSchoolPlace(placeOrProps, nameOverride)) return true;
  const types = placeTypes(placeOrProps);
  const name = placeName(placeOrProps, nameOverride);

  if (types.some((t) => SCHOOL_BLOCK_TYPES.has(t))) return false;
  if (SCHOOL_NAME_BLOCK_RE.test(name)) return false;
  if (/\b(pool|natatorium|aquatic center)\b/i.test(name)) return false;

  return (
    types.includes("primary_school") ||
    types.includes("secondary_school") ||
    types.includes("school")
  );
}

function isLenientCoffeePlace(placeOrProps, nameOverride) {
  if (isAllowedCoffeePlace(placeOrProps, nameOverride)) return true;
  const name = placeName(placeOrProps, nameOverride);
  return /\b(coffee|espresso|café|cafe)\b/i.test(name);
}

function isLenientEssentialsPlace(placeOrProps, nameOverride) {
  if (isAllowedEssentialsPlace(placeOrProps, nameOverride)) return true;
  const types = placeTypes(placeOrProps);
  const name = placeName(placeOrProps, nameOverride);
  if (types.some((t) => ESSENTIALS_TYPES.has(t))) return true;
  return /\b(pharmacy|drug\s*store|hardware|true value|ace\b|bank|credit union)\b/i.test(name);
}

function isLenientGooglePlaceForAmenity(placeOrProps, amenityKey, nameOverride) {
  const key = String(amenityKey || "").trim();
  if (key === "grocery") return isLenientGroceryPlace(placeOrProps, nameOverride);
  if (key === "schools") return isLenientSchoolPlace(placeOrProps, nameOverride);
  if (key === "coffee") return isLenientCoffeePlace(placeOrProps, nameOverride);
  if (key === "essentials") return isLenientEssentialsPlace(placeOrProps, nameOverride);
  if (key === "fitness") return isAllowedFitnessPlace(placeOrProps, nameOverride);
  if (key === "trailheads") return isAllowedTrailheadPlace(placeOrProps, nameOverride);
  if (key === "parks_rec") return isAllowedParkPlace(placeOrProps, nameOverride);
  return true;
}

function isAllowedGooglePlaceForAmenity(placeOrProps, amenityKey, nameOverride, options = {}) {
  const lenient = options.lenient === true;
  const key = String(amenityKey || "").trim();
  if (lenient) return isLenientGooglePlaceForAmenity(placeOrProps, key, nameOverride);
  if (key === "grocery") return isAllowedGroceryPlace(placeOrProps, nameOverride);
  if (key === "schools") return isAllowedSchoolPlace(placeOrProps, nameOverride);
  if (key === "fitness") return isAllowedFitnessPlace(placeOrProps, nameOverride);
  if (key === "trailheads") return isAllowedTrailheadPlace(placeOrProps, nameOverride);
  if (key === "parks_rec") return isAllowedParkPlace(placeOrProps, nameOverride);
  if (key === "essentials") return isAllowedEssentialsPlace(placeOrProps, nameOverride);
  if (key === "coffee") return isAllowedCoffeePlace(placeOrProps, nameOverride);
  return true;
}

function isAllowedNearbyFeatureProperties(properties, amenityKey, options = {}) {
  const key = String(amenityKey || "").trim();
  if (
    key !== "grocery" &&
    key !== "schools" &&
    key !== "fitness" &&
    key !== "trailheads" &&
    key !== "parks_rec" &&
    key !== "essentials" &&
    key !== "coffee"
  ) {
    return true;
  }

  const types = properties?.googleTypes;
  if (Array.isArray(types) && types.length) {
    return isAllowedGooglePlaceForAmenity(
      { types, name: properties?.name },
      amenityKey,
      properties?.name,
      options
    );
  }

  const pid = String(properties?.place_id || properties?.placeId || "").trim();
  return pid.length > 0;
}

module.exports = {
  AMENITIES_WITH_LENIENT_FALLBACK,
  isBlockedNonGrocery,
  isGroceryFetchCandidate,
  isAllowedGroceryPlace,
  isLenientGroceryPlace,
  isAllowedSchoolPlace,
  isLenientSchoolPlace,
  isTrailheadPlace,
  isAllowedFitnessPlace,
  isAllowedTrailheadPlace,
  isAllowedEssentialsPlace,
  isLenientEssentialsPlace,
  isAllowedCoffeePlace,
  isLenientCoffeePlace,
  isAllowedParkPlace,
  isLenientGooglePlaceForAmenity,
  isAllowedGooglePlaceForAmenity,
  isAllowedNearbyFeatureProperties,
};
