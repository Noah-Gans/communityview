export const marketingFeatures = [
  {
    id: 'search',
    title: 'Nationwide Parcel Search',
    shortDesc: 'Search nationwide — or narrow to your county — by owner, address, or parcel ID.',
    fullDesc:
      'Look up parcels anywhere in the country, then filter by county so you only see the results you want. Jump straight to the map without hopping between assessor sites.',
    howItHelps:
      'When you need answers fast, skip the county portal maze and get to the listing in one search.',
    img: '/new_search.png',
    icon: '🔍',
    highlights: [
      'Nationwide parcel search',
      'Filter by one or multiple counties',
      'Owner, address, and parcel ID lookup',
      'Instant results on the map',
      'Works on desktop and mobile',
    ],
  },
  {
    id: 'ownership',
    title: 'Ownership & Property Details',
    shortDesc: 'Click any parcel for owner, APN, legal description, acreage, and assessed values.',
    fullDesc:
      'Open nationwide ownership and property records in one panel — owner and mailing address, APN, legal description, acreage, assessed land and improvement values, building details, and more.',
    howItHelps:
      'Stop chasing the same records across county assessor sites. Research the deal before you build a map or tour.',
    img: '/slide_photos/property-info.png',
    icon: '📋',
    highlights: [
      'Owner & mailing address',
      'APN / parcel number',
      'Legal description',
      'Parcel acreage',
      'Assessed values & building size',
      'Zoning, flood, and sale history when available',
    ],
  },
  {
    id: 'map',
    title: 'Interactive Map & Layers',
    shortDesc: 'Stack environmental, boundary, and hazard layers on any parcel nationwide.',
    fullDesc:
      'Explore detailed property context on a fast, modern map. Toggle ownership, public land, soil, wetlands, wildfire hazard, transmission lines, county boundaries, and more — then click parcels for full details.',
    howItHelps:
      'Understand land context before you pitch a listing — all in one place instead of five county tabs.',
    img: '/slide_photos/environmental-layers.png',
    icon: '📍',
    highlights: [
      'Ownership & parcel boundaries',
      'Public land, soil, and conservation easements',
      'Surface water, wetlands, and wildfire hazard',
      'County, place, and tribal boundary overlays',
      '3D terrain view',
      'Foundation for tours and listing maps',
    ],
  },
  {
    id: 'maps',
    title: 'Listing Maps',
    shortDesc: 'Draw boundaries, drop icons, attach photos, and share a polished map.',
    fullDesc:
      'Build presentation-ready listing maps in your browser. Draw property boundaries with acreage and perimeter, add points for wells and outbuildings, pin photos to features, and share a link or export for your campaign.',
    howItHelps:
      'Skip the screenshot from a county PDF. Send maps that match the quality of your brand.',
    img: '/map-builder.png',
    icon: '🗺️',
    highlights: [
      'Property boundary with acreage and perimeter',
      'Custom points, lines, and shapes',
      'Photos pinned to map features',
      'Annotations, arrows, and legends',
      'Share links and high-resolution export',
    ],
  },
  {
    id: 'tours',
    title: 'Property Tours',
    shortDesc: 'Shareable tours with orbit views, nearby amenities, and your branding.',
    fullDesc:
      'Turn any listing into a cinematic property tour. Showcase the parcel, highlight nearby schools, dining, trails, and recreation, then send one shareable link buyers can open on any device.',
    howItHelps:
      'Give out-of-town buyers context without another showing. Market the land and the lifestyle around it.',
    img: '/slide_photos/property-details.png',
    icon: '🎬',
    highlights: [
      'Shareable tour link for every listing',
      'Property orbit and map context',
      'Nearby amenity slides with drive times',
      'Mobile-friendly for buyers',
      'Your branding on the share page',
    ],
  },
];

/** Home stack order: research pillars first, listing maps, tours last (shown above) */
export const homeFeatureStack = ['search', 'map', 'maps', 'tours'].map((id) => {
  const feature = marketingFeatures.find((f) => f.id === id);
  return {
    title: feature.title,
    desc: feature.shortDesc,
    img: feature.img,
    href: '/signup',
  };
});

export const researchMapLayers = [
  'Ownership & parcel boundaries',
  'Owner names on map',
  'Public land',
  'Conservation easements',
  'Soil',
  'Surface water',
  'Wetlands',
  'Opportunity zones',
  'Principal aquifers',
  'Transmission lines',
  'Wildfire hazard',
  'US counties',
  'Congressional districts',
  'Places & urban areas',
  'Tribal lands',
];

export const researchPropertyDetails = [
  'APN / parcel number',
  'Owner & mailing address',
  'Situs address & county',
  'Legal description',
  'Parcel acreage',
  'Assessed land & improvement value',
  'Building square footage',
  'Year built & development type',
  'Zoning & land use',
  'FEMA flood zone & SFHA',
  'Sale history & tax data',
];

/** Research section cards — images from public/slide_photos */
export const homeResearchStack = [
  {
    title: 'Parcel & ownership',
    desc: 'Click any parcel for APN, owner, mailing address, and legal description — then zoom straight to the lot.',
    img: '/slide_photos/property-info.png',
    layers: ['Ownership & parcel boundaries', 'Owner names on map'],
    details: [
      'APN / parcel number',
      'Owner & mailing address',
      'Situs address & county',
      'Legal description',
    ],
  },
  {
    title: 'Environmental layers',
    desc: 'Toggle public land, conservation easements, soil, and aquifers to see what surrounds a listing before you pitch it.',
    img: '/slide_photos/environmental-layers.png',
    layers: [
      'Public land',
      'Conservation easements',
      'Soil',
      'Opportunity zones',
      'Principal aquifers',
    ],
    details: ['Parcel acreage', 'Zoning & land use'],
  },
  {
    title: 'Legal & city boundaries',
    desc: 'Overlay county lines, city and town limits, congressional districts, and tribal lands — see which jurisdiction a listing actually falls in.',
    img: '/slide_photos/water-hazard-layers.png',
    layers: [
      'US counties',
      'Places & urban areas',
      'Congressional districts',
      'Tribal lands',
    ],
    details: ['Situs address & county', 'Legal description', 'Zoning & land use'],
  },
  {
    title: 'Values & structures',
    desc: 'Assessed values, improvement breakdown, building size, and 3D terrain — so you know the numbers behind the dirt.',
    img: '/slide_photos/property-details.png',
    layers: ['Ownership & parcel boundaries'],
    details: [
      'Parcel acreage',
      'Assessed land & improvement value',
      'Building square footage',
      'Year built & development type',
      'Sale history & tax data',
    ],
  },
];

export const featuresPageHero = {
  badge: 'Research & listing tools',
  title: 'Research the land.',
  highlight: 'Market the listing.',
  subtitle:
    'Nationwide parcel search, map layers, ownership details, listing maps, and property tours — built for real estate agents marketing land and residential listings.',
};
