/**
 * Use-case landing pages — EDIT THIS FILE for copy.
 *
 * SEO set:
 * 1. Parcel search
 * 2. Find property owner
 * 3. Ownership & property details
 * 4. Parcel maps
 * 5. Listing maps
 * 6. Property tours
 * 7. Map layers / land context
 * 8. Embedded maps
 */

export const useCasesHub = {
  path: '/use-cases',
  seoTitle: 'Use Cases — Parcel Search, Ownership & Parcel Maps | Community View',
  seoDescription:
    'How real estate agents use Community View for parcel search, finding property owners, ownership details, parcel maps, listing maps, property tours, and embeds.',
  h1: 'What agents use Community View for',
  lede:
    'From finding who owns a parcel to sending a buyer-ready map — jobs agents actually do on one platform.',
};

export const useCases = [
  {
    slug: 'parcel-search',
    navLabel: 'Parcel search',
    cardTitle: 'Nationwide parcel search',
    cardBlurb:
      'Fast parcel search by owner, address, or county ID — filter by county or go nationwide, then map it.',
    seoTitle: 'Nationwide Parcel Search for Real Estate Agents | Community View',
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
      {
        heading: 'From search to ownership and maps',
        body:
          'Once you Map It, open ownership details on the parcel, then build a listing map or property tour from the same workspace — without hopping back to a county assessor site.',
      },
    ],
    bullets: [
      'Search by owner, address, or county ID',
      'Filter by county or search nationwide',
      'Works on computer and phone',
      'Map It to center, highlight, and open details',
    ],
    faqs: [
      {
        question: 'Can I search parcels by owner name?',
        answer:
          'Yes. Search nationwide or filter by county, then look up parcels by owner name, street address, or parcel / county ID. Map It opens the parcel with property details.',
      },
      {
        question: 'Does parcel search work outside my home county?',
        answer:
          'Yes. Search the entire country, or narrow results to the county your map is centered on. Change your home county anytime from search.',
      },
      {
        question: 'Is there a free trial for parcel search?',
        answer:
          'Yes. Paid plans include a 14-day free trial so you can run nationwide parcel search before you commit.',
      },
    ],
    ctaLabel: 'Try parcel search',
  },
  {
    slug: 'find-property-owner',
    navLabel: 'Find property owner',
    cardTitle: 'Find a property owner',
    cardBlurb:
      'Look up who owns a property by address, owner name, or parcel ID — then open the record on the map.',
    seoTitle: 'Find Property Owner by Address or Name | Community View',
    seoDescription:
      'Find a property owner nationwide for real estate research. Search by address, owner name, or APN, then open ownership details and mailing address on an interactive map.',
    h1: 'Find a property owner — by address, name, or parcel ID',
    lede:
      'Stop bouncing between county assessor sites. Search, map the parcel, and see who owns it — built for agents who need answers before they list or call.',
    image: '/new_search.png',
    imageAlt: 'Finding a property owner with Community View parcel search',
    sections: [
      {
        heading: 'Start with what you know',
        body:
          'Have a street address? An owner name from a neighbor? A county parcel ID from a listing packet? Search any of those, filter by county when you want tighter results, and scan the list of matches.',
      },
      {
        heading: 'Confirm the right parcel on the map',
        body:
          'Map It centers and highlights the parcel so you are not guessing from a text-only assessor row. See the boundary in context before you trust the owner record.',
      },
      {
        heading: 'Open ownership and mailing details',
        body:
          'Click the parcel for owner name, mailing address, APN, acreage, and assessed values when the source county has them — the same records you used to chase across portals, in one panel.',
      },
      {
        heading: 'Built for agent workflows',
        body:
          'Use it before you price a listing, prospect nearby owners, or double-check who to contact. Then turn the same parcel into a listing map or property tour without starting over.',
      },
    ],
    bullets: [
      'Search by address, owner, or APN',
      'County filter or nationwide',
      'Owner & mailing address on click',
      'Continue into maps and tours',
    ],
    faqs: [
      {
        question: 'How do I find who owns a property?',
        answer:
          'In Community View, search by street address, owner name, or parcel ID. Open a result with Map It, then click the parcel for ownership and mailing details when available.',
      },
      {
        question: 'Can I look up property owners outside my county?',
        answer:
          'Yes. Search nationwide, or filter to one or more counties so you only see local matches.',
      },
      {
        question: 'Is this the same as county assessor lookup?',
        answer:
          'You get assessor-style ownership and parcel details on the map when the source data includes them — without hopping between separate county websites for every market you work.',
      },
    ],
    ctaLabel: 'Find a property owner',
  },
  {
    slug: 'ownership-details',
    navLabel: 'Ownership details',
    cardTitle: 'Ownership & property details',
    cardBlurb:
      'Click any parcel for owner, mailing address, APN, acreage, assessed values, and more when available.',
    seoTitle: 'Property Ownership Details & Parcel Records | Community View',
    seoDescription:
      'See property ownership and parcel details on the map — owner, mailing address, APN, legal description, acreage, and assessed values for real estate research.',
    h1: 'Ownership and property details on every parcel',
    lede:
      'Research the deal before you list or price it. Click a parcel and get the assessor-style records agents actually need — without leaving the map.',
    image: '/slide_photos/property-info.png',
    imageAlt: 'CommunityView ownership and property details panel',
    sections: [
      {
        heading: 'What you see on click',
        body:
          'Owner and mailing address, APN, legal description, acreage, assessed land and improvement values, building size, and related fields when the source county has them. One panel instead of three browser tabs.',
      },
      {
        heading: 'Confirm before you list or price',
        body:
          'Verify who owns the land, how large the parcel is, and what the record says before you commit to a listing price, farm a neighborhood, or send a buyer package. Catch mismatches early.',
      },
      {
        heading: 'Different from search',
        body:
          'Search finds the parcel. Ownership details answer what you need once you are on it — the records behind the boundary. Use find-property-owner search when you start from a name or address; use ownership details when you are already looking at the map.',
      },
      {
        heading: 'From records to a deliverable',
        body:
          'After you confirm the parcel, build a listing map or property tour from the same workspace so marketing matches the record you just reviewed.',
      },
    ],
    bullets: [
      'Owner & mailing address',
      'APN / parcel number',
      'Acreage & assessed values',
      'Zoning and flood when available',
    ],
    faqs: [
      {
        question: 'What ownership details can I see on a parcel?',
        answer:
          'When available from the source county: owner and mailing address, APN, legal description, acreage, assessed land and improvement values, building size, and related assessor-style fields.',
      },
      {
        question: 'Do I need a separate assessor login?',
        answer:
          'No. Community View surfaces parcel ownership and property details on the interactive map for agents researching listings and land.',
      },
      {
        question: 'How is this different from finding a property owner by search?',
        answer:
          'Finding an owner starts with search by name, address, or ID. Ownership details is the on-map panel once you have the parcel selected — the full record view agents use to confirm the deal.',
      },
    ],
    ctaLabel: 'Explore ownership details',
  },
  {
    slug: 'parcel-maps',
    navLabel: 'Parcel maps',
    cardTitle: 'Interactive parcel maps',
    cardBlurb:
      'Explore parcel boundaries on a modern map, then turn the same view into a shareable listing map buyers open.',
    seoTitle: 'Parcel Map Software for Real Estate Agents | Community View',
    seoDescription:
      'Interactive parcel map software for real estate agents. View parcel boundaries nationwide, check ownership, and create shareable listing maps buyers actually open.',
    h1: 'Parcel map software built for real estate agents',
    lede:
      'County GIS is for lookup. Community View is parcel maps you can research on — and marketing maps you can send — in one workflow.',
    image: '/map-builder.png',
    imageAlt: 'Interactive parcel map and listing map tools in Community View',
    sections: [
      {
        heading: 'See the parcel, not just a pin',
        body:
          'Open nationwide parcel boundaries on a fast interactive map. Click a parcel for ownership and property details, toggle land layers for context, and understand the land before you list.',
      },
      {
        heading: 'Turn research into a listing map',
        body:
          'Draw boundaries with acreage, drop pins and photos, and annotate the story of the property. The same workspace that helps you research becomes the map buyers open.',
      },
      {
        heading: 'Share without friction',
        body:
          'Send a link buyers can open without an account, embed the map on your site, or export when a static deliverable belongs in the package.',
      },
      {
        heading: 'Why agents switch from assessor-only maps',
        body:
          'Assessor portals rarely help you market a listing. Parcel map software for agents should cover research and the sendable deliverable — Community View is built for both.',
      },
    ],
    bullets: [
      'Nationwide parcel boundaries',
      'Ownership on click',
      'Listing maps buyers open',
      'Share link or website embed',
    ],
    faqs: [
      {
        question: 'What is parcel map software for real estate agents?',
        answer:
          'It is software that shows parcel boundaries and property context on a map, and helps agents create shareable listing maps — not just a one-off county GIS lookup.',
      },
      {
        question: 'Can I create a parcel map for a listing?',
        answer:
          'Yes. Research the parcel on the map, then build a listing map with boundaries, pins, photos, and notes. Share a link buyers can open without signing up.',
      },
      {
        question: 'Does Community View show parcels nationwide?',
        answer:
          'Yes. Explore parcels and ownership context nationwide, then filter search by county when you want a tighter market focus.',
      },
    ],
    ctaLabel: 'Open parcel maps',
  },
  {
    slug: 'listing-maps',
    navLabel: 'Listing maps',
    cardTitle: 'Listing maps buyers open',
    cardBlurb:
      'Draw boundaries, add pins and photos, measure acreage, and share a polished map for the listing.',
    seoTitle: 'Listing Map Software for Real Estate Agents | Community View',
    seoDescription:
      'Create shareable listing maps and parcel maps for real estate marketing. Draw boundaries, add pins and photos, measure acreage, and send buyers a link.',
    h1: 'Listing maps for real estate marketing',
    lede:
      'County sites are for lookup. Listing maps are for marketing — a parcel map your buyers will actually open.',
    image: '/map-builder.png',
    imageAlt: 'CommunityView listing map builder with boundaries and annotations',
    sections: [
      {
        heading: 'Build around the property',
        body:
          'Draw boundaries with acreage and perimeter, drop points for wells and outbuildings, pin photos, and add the notes that matter for this listing. Start from the parcel you already researched.',
      },
      {
        heading: 'Share or export',
        body:
          'Send a link buyers can open without an account, or export when you need a static deliverable for a package. Pair with a property tour when you want the full lifestyle story.',
      },
      {
        heading: 'Measure as you design',
        body:
          'Use draw and measure tools while you build — so the map is accurate enough for listing conversations, without jumping into CAD.',
      },
      {
        heading: 'From parcel map to listing asset',
        body:
          'Interactive parcel maps help you understand the land. Listing maps package that understanding for buyers — the conversion step most assessor sites never offer.',
      },
    ],
    bullets: [
      'Boundaries with acreage',
      'Pins, photos, annotations',
      'Shareable buyer link',
      'Export when you need it',
    ],
    faqs: [
      {
        question: 'What is a listing map?',
        answer:
          'A listing map is a custom map you build for a property — boundaries, labeled points, photos, and notes — that you share with buyers as a link or export.',
      },
      {
        question: 'Can buyers open the map without an account?',
        answer:
          'Yes. Share a link and buyers view the listing map without creating a Community View account.',
      },
      {
        question: 'How is a listing map different from a parcel map lookup?',
        answer:
          'Parcel lookup shows boundaries and records for research. A listing map is the marketing deliverable you design and send — annotations, photos, and a polished share experience.',
      },
    ],
    ctaLabel: 'Build a listing map',
  },
  {
    slug: 'property-tours',
    navLabel: 'Property tours',
    cardTitle: 'Digital property tours',
    cardBlurb:
      'A shareable tour for every listing — orbit the land, highlight nearby amenities, send one link.',
    seoTitle: 'Digital Property Tours & Property Views for Listings | Community View',
    seoDescription:
      'Create digital property tours and interactive property views for listings. Show the parcel, nearby amenities, and send buyers one shareable link on any device.',
    h1: 'Digital property tours for every listing',
    lede:
      'Give buyers a clear property view of the land and lifestyle in one link — without a custom website for each listing.',
    image: '/slide_photos/property-details.png',
    imageAlt: 'CommunityView property tour with map context',
    sections: [
      {
        heading: 'Show the land, not just the flyer',
        body:
          'Start from the parcel, move through orbit and amenity slides, and keep your branding on the property view buyers open.',
      },
      {
        heading: 'Nearby context that sells location',
        body:
          'Highlight schools, dining, grocery, recreation, and essentials so out-of-town buyers get the neighborhood story fast.',
      },
      {
        heading: 'One link to send',
        body:
          'Share from email, text, or listing materials. Buyers do not need a Community View account to view the tour.',
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
    seoTitle: 'Real Estate Map Layers — Soil, Wetlands, Wildfire & More | Community View',
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
    seoTitle: 'Embed Listing Maps on Your Website | Community View',
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
          'A link sends people to Community View. An embed keeps them on your site while still giving them the interactive map.',
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
