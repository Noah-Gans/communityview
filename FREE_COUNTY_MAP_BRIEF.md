# Brief: Free county map pages (growth/SEO experiment)

You're picking this up fresh with no memory of how it was decided — this file is
the full context. Read it before writing any code.

## What this branch is for

This worktree (`communityview-free-map`, branch `feature/free-county-map`) is
for building a **free, no-signup, per-county map page** as a growth/backlink
lever, separate from the ongoing SEO cleanup happening on `seo/technical-fixes`.
Keep this branch scoped to this feature — SEO copy/meta/sitemap work belongs on
the other branch, not here.

## The idea, in one paragraph

Community View (communityview.ai) is parcel-map software for real estate
agents — nationwide parcel search, ownership details, listing maps, and
property tours, normally behind a paid signup (see `src/pages/landingPages/content/pricingPlans.js`
for current plans: Regular $18/mo, Plus $24/mo, Enterprise custom). The
proposal: give away a **limited, read-only map view per county** — direct link,
no login — with parcel boundaries and the ownership layer turned on by default,
but **no ability to click a parcel for its full detail panel** (owner mailing
address, APN, assessed values, etc. — the paid product's core value). Each
county gets its own real URL (e.g. `/map/wy/teton-county` or similar — routing
scheme not yet decided) that's actually indexable and linkable, not just an
in-app feature buried behind navigation.

## Why this over more SEO content pages

We already tried and are still improving pure-content programmatic SEO (see
`seo/technical-fixes`: per-use-case landing pages, FAQ schema, richer static
copy). The problem with scaling that further is Google's "scaled content
abuse" policy — hundreds of near-identical templated text pages on a young,
low-authority domain is a real risk, not just wasted effort. A genuinely
working, embeddable map per county is different: it's real standalone utility
a local real estate blog, county resource page, or Facebook group would
actually want to link to. That's a stronger backlink asset than templated text,
*and* it doubles as a top-of-funnel conversion path (someone using the free
county map hits the "click for details" wall and converts to a trial).

## Why "no detail click" specifically — align free tier with real cost

The map tile rendering (parcel boundaries, ownership layer) is closer to
flat-cost infrastructure. The expensive part is almost certainly the per-parcel
detail lookup — `src/utils/regridParcelApi.js` calls Regrid's API
(`https://app.regrid.com/api/v2`, proxied through Firebase Functions per
`src/config/regridApi.js`) which is very likely metered/billed per call. **This
assumption needs to be confirmed with real Regrid pricing numbers before
committing to the free/paid boundary** — don't assume "nearly costless" without
checking. If tile-serving costs turn out to be non-trivial too, the free tier
needs a different limit (rate limiting, a usage cap, or a smaller free area).

## Open questions to resolve before building anything

1. **Exact scope of "free"**: boundaries + ownership layer only, or does owner
   *name* show without the full detail panel? Showing an owner's name for free
   might already give away enough that people don't need the paid click-through
   — define the line carefully.
2. **Abuse/scraping risk**: an unauthenticated endpoint serving real ownership
   data is exactly the kind of thing that gets scraped at volume. Does it need
   rate limiting, a CAPTCHA-style gate after N views, or IP throttling? Check
   with whoever owns the Regrid contract whether bulk scraping through this
   free surface would violate Regrid's terms or blow through a cost cap.
3. **How does this interact with existing gating code?** Look at
   `src/components/auth/FeatureGate.js`, `src/components/auth/TierGate.js`,
   `src/utils/subscriptionAccess.js`, and `src/components/auth/AuthGuard.js` —
   there's already a tiered-access pattern in this app (Regular/Plus/Enterprise
   feature gates). This free-county-map mode is a *new*, more permissive tier
   below all of those (no account at all), so figure out whether it reuses that
   gating machinery or needs its own lightweight mode.
4. **Which counties first?** Do not build this for all US counties on day one.
   Pick a small first batch (10–30) — ideally counties where there's already
   customer/agent interest, or where Search Console shows real query volume —
   validate that the pages actually get indexed and used, then decide whether
   to scale up. Ask the user which counties if it's not obvious from existing
   data.
5. **SEO shell requirement**: whatever page wraps this map still needs real,
   crawlable HTML in the initial response — the exact problem just fixed on
   `seo/technical-fixes` (see that branch's commit "Fix crawlable-shell bug...").
   An embedded interactive map with no real text around it is invisible to
   non-JS crawlers just like the use-case pages were. Each county page needs
   real per-county text (county name, what's on the map, a CTA to the paid
   product) in the static shell, not just an iframe/map component.

## Relevant existing code to read first

- `src/pages/Map.js`, `src/pages/MapContext.js` — the main map page/state.
- `src/utils/regridParcelApi.js`, `src/config/regridApi.js` — parcel detail
  fetching and where the cost/metering likely lives.
- `src/utils/regridCountyMapping.js` — an existing (currently tiny, only 2
  entries) county-code-to-Regrid-path mapping; probably needs to grow or be
  rethought for this.
- `src/components/auth/FeatureGate.js`, `TierGate.js`, `AuthGuard.js`,
  `src/utils/subscriptionAccess.js` — existing paid-tier gating patterns.
- `scripts/generateMarketingSeoShells.js` (on `seo/technical-fixes`, will need
  to be merged to `main` and pulled into this branch) — the pattern for
  generating a real crawlable static HTML shell per route; county pages will
  need something similar, likely generated dynamically rather than hand-listed
  since there could eventually be many.

## What "done" looks like for a first version

A working map page for a small, agreed-upon list of counties, reachable by a
direct real URL with no login, showing parcel boundaries and ownership with no
detail click-through, wrapped in a real crawlable HTML page (title, meta, real
visible text about that county) — plus a clear answer to the cost and
abuse-risk questions above before it goes live to real traffic.

Ask the user (Noah) before making any decision on the open questions above —
this brief captures the idea and the constraints discussed so far, not final
answers.
