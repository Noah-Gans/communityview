/** Shared marketing copy — single source of truth for landing pages */

export const hero = {
  catchphrase: ['Smarter Land Data', 'Better Decisions'],
  description:
    'Nationwide parcel search and interactive maps — plus shareable listing maps and property tours for every campaign.',
};

export const heroPeek = {
  title: 'County sites for lookup. Nothing for your listing.',
  subtitle:
    'Assessor portals are fine for a quick lookup — but they do not help you market a listing. Community View covers both.',
  scrollCue: 'See property tours',
  pillars: [
    {
      id: 'research',
      label: 'Research',
      title: 'Search & understand land',
      body: 'Nationwide search, map layers, and property details on one map.',
      scrollTarget: 'research',
    },
    {
      id: 'market',
      label: 'Market',
      title: 'Maps & tours you can send',
      body: 'Listing maps and property tours with one shareable link.',
      scrollTarget: 'tours',
    },
  ],
  navLinks: [
    { label: 'Parcel search', target: 'search' },
    { label: 'Ownership details', target: 'ownership' },
    { label: 'Listing maps', target: 'listing-maps' },
  ],
};

export const tourSection = {
  title: 'Property tours that win and close deals',
  subtitle:
    'A digital tour for every listing — orbit the land, highlight nearby amenities, and send one shareable link.',
};

export const propertyTourShowcase = {
  title: 'Property tours that win and close deals',
  subtitle:
    'Create shareable cinematic tours that show off your listing and help buyers understand the opportunity faster.',
  bullets: [],
  videoSrc: '/marketing/property-tour-overview.mp4',
  videoLabel: 'Property tour overview preview',
};

export const amenitiesTourShowcase = {
  title: 'Context buyers care about',
  subtitle:
    'Highlight schools, dining, grocery stores, and recreation nearby — so buyers see the full lifestyle around the property, not just the parcel.',
  bullets: [],
  videoSrc: '/marketing/property-tour-amenities.mp4',
  videoLabel: 'Property tour amenities preview',
};

export const searchBridge = {
  title: 'Search nationwide — or narrow to your county',
  subtitle:
    'Look up parcels anywhere in the country, then filter by county so you only see the results you want. Search by owner, address, or parcel ID without hopping between assessor sites.',
  imageSrc: '/new_search.png',
  imageAlt: 'Nationwide parcel search with county filters',
  links: [
    { label: 'Parcel search', to: '/use-cases/parcel-search' },
    { label: 'Find a property owner', to: '/use-cases/find-property-owner' },
  ],
};

export const ownershipDetails = {
  title: 'Nationwide ownership & property details',
  subtitle:
    'Click any parcel for owner, APN, mailing address, legal description, acreage, and assessed values — the same records you used to chase on county assessor sites, in one panel.',
  bullets: [
    'Owner & mailing address',
    'APN / parcel number',
    'Legal description',
    'Acreage & assessed values',
  ],
  imageSrc: '/slide_photos/property-info.png',
  imageAlt: 'Parcel ownership and property details panel on the Community View map',
  links: [
    { label: 'Ownership details', to: '/use-cases/ownership-details' },
    { label: 'Ownership map', to: '/use-cases/ownership-map' },
    { label: 'Public land map', to: '/use-cases/public-land-map' },
  ],
};

export const mapBuilder = {
  title: 'Listing maps buyers actually want to open',
  subtitle:
    'Draw property boundaries, drop icons for wells, barns, and outbuildings, attach photos, and share a polished map — no screenshot from a county PDF.',
  bullets: [
    'Property boundary with acreage and perimeter',
    'Custom points, lines, and shapes',
    'Photos pinned to map features',
    'Share link or export for your listing',
  ],
  imageSrc: '/map-builder.png',
  imageAlt: 'Community View map builder with property boundary and labeled features',
  links: [
    { label: 'Parcel maps', to: '/use-cases/parcel-maps' },
    { label: 'Listing maps', to: '/use-cases/listing-maps' },
  ],
};

export const howItWorks = {
  title: 'How it works',
  steps: [
    { title: 'Find the parcel', desc: 'Search nationwide and filter by county when you need to.' },
    { title: 'Build your map or tour', desc: 'Lay out the property, amenities, and branding.' },
    { title: 'Customize slides', desc: 'Highlight schools, trails, dining, and land context.' },
    { title: 'Share one link', desc: 'Send maps and tours to buyers from your phone or desktop.' },
  ],
};

export const nationwideTrust = {
  title: 'Nationwide parcel data',
  subtitle:
    'Powered by Regrid — accurate parcel boundaries and ownership records wherever you work, from one map.',
  points: ['Nationwide parcel search', 'Filter results by county', 'Accurate boundaries for maps and tours'],
};

export const finalCta = {
  title: 'Ready to research land and market your next listing?',
  subtitle: 'Start your free trial — search parcels nationwide, then share maps and property tours in minutes.',
};

export const featureStackHeading = 'Research the land. Market the listing.';

export const featureStackSubtitle =
  'Stack environmental and boundary layers on any parcel — then open ownership, assessed values, zoning, and flood data in one place.';

/** Set REACT_APP_SAMPLE_TOUR_PATH in .env (e.g. /tour/your-token) */
export const sampleTourPath = process.env.REACT_APP_SAMPLE_TOUR_PATH || '';
