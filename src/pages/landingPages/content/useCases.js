/**
 * Use-case landing pages — EDIT THIS FILE for copy.
 *
 * SEO set (locked):
 * 1. Parcel search
 * 2. Ownership & property details  (separate from search)
 * 3. Listing maps
 * 4. Property tours
 * 5. Map layers / land context
 * 6. Embedded maps
 *
 * Starter drafts from product messaging — rewrite in your voice.
 */

export const useCasesHub = {
  path: '/use-cases',
  seoTitle: 'Use Cases — Parcel Search, Maps & Property Tours | CommunityView',
  seoDescription:
    'How real estate agents use CommunityView for parcel search, ownership details, map layers, listing maps, property tours, and embeddable maps.',
  h1: 'What agents use CommunityView for',
  lede: 'Six jobs on one map platform — from finding the parcel to putting the map on your listing site.',
};

export const useCases = [
  {
    slug: 'parcel-search',
    navLabel: 'Parcel search',
    cardTitle: 'Nationwide parcel search',
    cardBlurb:
      'Fast parcel search by owner, address, or county ID — filter by county or go nationwide, then map it.',
    seoTitle: 'Nationwide Parcel Search for Real Estate Agents | CommunityView',
    seoDescription:
      'Search parcels nationwide by owner name, address, or APN. Filter by county and open results on an interactive map built for real estate agents.',
    h1: 'Nationwide parcel search for real estate agents',
    lede:
      'Sometimes county search is slow or inaccurate. Community View gives agents fast parcel search by owner name, address, and county ID — on computer and phone, across counties.',
    image: '/new_search.png',
    imageAlt: 'CommunityView nationwide parcel search showing results on the map',
    sections: [
      {
        heading: 'Search by owner, address, or parcel ID',
        body:
          'Searching for properties is essential in real estate. Knowing who owns what, getting their property details and mailing address all have value in real estate. Whether you\'ve got a new listing and want to find the property quickly for property details, or are just curious about who owns what around your property, Community View gives you the tool to quickly search by a property owner, address, or the county ID number.',
      },
      {
        heading: 'Filter by county, search nationwide',
        body:
          'Generally real estate agents work by county or their local counties, because land records are stored and managed by the county. A downside of some competitors like Land id is that they only give you the ability to search by the entire nation without the ability to filter by county. This can return results that are across the country and irrelevant to your search criteria. Community View gives you the ability to do both. You can search the entire nation, or search the county your map is centered on. Once you choose this center map, it\'s selected as your default "home" county for search. This can easily be changed to a new county with a single click in the search page.',
      },
      {
        heading: 'Open results on the map',
        body:
          'Our search results allow you to see all the likely candidates in an intuitive clean list, and each of them can be navigated to via a Map It button. This will immediately take you to the property, center it, highlight it, and open its property information.',
      },
    ],
    bullets: [
      'Search by owner, address, or county ID',
      'Filter by county or search nationwide',
      'Works on computer and phone',
      'Map It to center, highlight, and open details',
    ],
    ctaLabel: 'Try parcel search',
  },
  {
    slug: 'ownership-details',
    navLabel: 'Ownership details',
    cardTitle: 'Ownership & property details',
    cardBlurb:
      'Click any parcel for owner, mailing address, APN, acreage, assessed values, and more when available.',
    seoTitle: 'Property Ownership Details & Parcel Records | CommunityView',
    seoDescription:
      'See property ownership and parcel details on the map — owner, mailing address, APN, legal description, acreage, and assessed values for real estate research.',
    h1: 'Ownership and property details on every parcel',
    lede:
      'Research the deal before you list or price it. Click a parcel and get the assessor-style records agents actually need.',
    image: '/slide_photos/property-info.png',
    imageAlt: 'CommunityView ownership and property details panel',
    sections: [
      {
        heading: 'What you see on click',
        body:
          'Owner and mailing address, APN, legal description, acreage, assessed land and improvement values, building size, and related fields when the source county has them.',
      },
      {
        heading: 'Different from search',
        body:
          'Search finds the parcel. Ownership details answer what you need once you are on it — the records behind the boundary.',
      },
      {
        heading: 'Why it matters for listings',
        body:
          'Confirm who owns it, how big it is, and what the record says before you build a map, tour, or buyer package.',
      },
    ],
    bullets: [
      'Owner & mailing address',
      'APN / parcel number',
      'Acreage & assessed values',
      'Zoning and flood when available',
    ],
    ctaLabel: 'Explore ownership details',
  },
  {
    slug: 'listing-maps',
    navLabel: 'Listing maps',
    cardTitle: 'Listing maps buyers open',
    cardBlurb:
      'Draw boundaries, add pins and photos, measure acreage, and share a polished map for the listing.',
    seoTitle: 'Listing Map Software for Real Estate Agents | CommunityView',
    seoDescription:
      'Create shareable listing maps for real estate marketing. Draw boundaries, add pins and photos, measure acreage, and send buyers a link.',
    h1: 'Listing maps for real estate marketing',
    lede:
      'County sites are for lookup. Listing maps are for marketing — a map your buyers will actually open.',
    image: '/map-builder.png',
    imageAlt: 'CommunityView listing map builder with boundaries and annotations',
    sections: [
      {
        heading: 'Build around the property',
        body:
          'Draw boundaries with acreage and perimeter, drop points for wells and outbuildings, pin photos, and add the notes that matter for this listing.',
      },
      {
        heading: 'Share or export',
        body:
          'Send a link buyers can open without an account, or export when you need a static deliverable for a package.',
      },
      {
        heading: 'Measure as you design',
        body:
          'Use draw and measure tools while you build — so the map is accurate enough for listing conversations, without jumping into CAD.',
      },
    ],
    bullets: [
      'Boundaries with acreage',
      'Pins, photos, annotations',
      'Shareable buyer link',
      'Export when you need it',
    ],
    ctaLabel: 'Build a listing map',
  },
  {
    slug: 'property-tours',
    navLabel: 'Property tours',
    cardTitle: 'Digital property tours',
    cardBlurb:
      'A shareable tour for every listing — orbit the land, highlight nearby amenities, send one link.',
    seoTitle: 'Digital Property Tours for Real Estate Listings | CommunityView',
    seoDescription:
      'Create digital property tours for listings. Show the parcel, nearby amenities, and send buyers one shareable link on any device.',
    h1: 'Digital property tours for every listing',
    lede:
      'Give buyers the land and the lifestyle in one link — without a custom website for each listing.',
    image: '/slide_photos/property-details.png',
    imageAlt: 'CommunityView property tour with map context',
    sections: [
      {
        heading: 'Show the land, not just the flyer',
        body:
          'Start from the parcel, move through orbit and amenity slides, and keep your branding on the experience buyers open.',
      },
      {
        heading: 'Nearby context that sells location',
        body:
          'Highlight schools, dining, grocery, recreation, and essentials so out-of-town buyers get the neighborhood story fast.',
      },
      {
        heading: 'One link to send',
        body:
          'Share from email, text, or listing materials. Buyers do not need a CommunityView account to view the tour.',
      },
    ],
    bullets: [
      'Slide-based listing tours',
      'Parcel + amenity context',
      'Agent branding',
      'Works on mobile',
    ],
    ctaLabel: 'Create a property tour',
  },
  {
    slug: 'map-layers',
    navLabel: 'Map layers',
    cardTitle: 'Map layers & land context',
    cardBlurb:
      'Stack ownership, soils, wetlands, wildfire, public land, and boundaries to understand the land before you list.',
    seoTitle: 'Real Estate Map Layers — Soil, Wetlands, Wildfire & More | CommunityView',
    seoDescription:
      'Toggle real estate map layers for land context: ownership boundaries, soil, wetlands, wildfire hazard, public land, and more on one interactive map.',
    h1: 'Map layers for land context',
    lede:
      'Ownership tells you who. Layers tell you what is on the ground — so you price and pitch with better context.',
    image: '/slide_photos/environmental-layers.png',
    imageAlt: 'CommunityView map with environmental and boundary layers',
    sections: [
      {
        heading: 'What you can toggle',
        body:
          'Ownership and parcel boundaries, public land, conservation easements, soil, surface water, wetlands, wildfire hazard, transmission lines, and US boundary layers including counties and places.',
      },
      {
        heading: 'Why agents use layers',
        body:
          'Spot constraints and talking points before the listing goes live — without opening five separate county or GIS tabs.',
      },
      {
        heading: 'Pairs with search and maps',
        body:
          'Find the parcel, read ownership, stack layers for context, then build a listing map or tour from the same workspace.',
      },
    ],
    bullets: [
      'Ownership & boundaries',
      'Soil, water, wetlands',
      'Wildfire and public land',
      'County and place overlays',
    ],
    ctaLabel: 'Explore map layers',
  },
  {
    slug: 'embedded-maps',
    navLabel: 'Embedded maps',
    cardTitle: 'Embed maps on your site',
    cardBlurb:
      'Drop a listing map into your website or landing page with an iframe — buyers explore without leaving your brand.',
    seoTitle: 'Embed Listing Maps on Your Website | CommunityView',
    seoDescription:
      'Embed interactive listing maps on your real estate website. Copy an iframe snippet and let buyers explore the property map on your site.',
    h1: 'Embed listing maps on your website',
    lede:
      'You built the map. Put it where listings already live — your site, a landing page, or a campaign page.',
    image: '/map-builder.png',
    imageAlt: 'CommunityView shareable listing map ready to embed',
    sections: [
      {
        heading: 'How embed works',
        body:
          'Share a map, copy the iframe snippet with embed mode turned on, and paste it into your site. Buyers get a map-first layout inside your page.',
      },
      {
        heading: 'Different from a share link',
        body:
          'A link sends people to CommunityView. An embed keeps them on your site while still giving them the interactive map.',
      },
      {
        heading: 'Built for agent marketing sites',
        body:
          'Use it on listing pages, brokerage sites, or one-off campaign pages when you want the map inside your brand, not as a separate tab.',
      },
    ],
    bullets: [
      'iframe embed snippet',
      'Map-first embed layout',
      'Works with shared listing maps',
      'Stays on your website',
    ],
    ctaLabel: 'Start embedding maps',
  },
];

export function getUseCaseBySlug(slug) {
  return useCases.find((item) => item.slug === slug) || null;
}
