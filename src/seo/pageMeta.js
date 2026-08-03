import { getUseCaseBySlug, useCasesHub } from '../pages/landingPages/content/useCases';
import { landIdCompare } from '../pages/landingPages/content/compare';

/** Canonical site origin — always apex (no www). */
export const SITE_ORIGIN = 'https://communityview.ai';
export const DEFAULT_OG_IMAGE = `${SITE_ORIGIN}/logo_only.png`;
/**
 * Marketing / public page SEO. Keep paths in sync with App routes + sitemap.
 * @typedef {{ title: string, description: string, path: string, noindex?: boolean }} PageSeo
 */

/** @type {Record<string, PageSeo>} */
export const PAGE_SEO = {
  '/': {
    path: '/',
    title: 'CommunityView — Parcel Maps & Property Tours for Agents',
    description:
      'Nationwide parcel search, listing maps, and digital property tours for real estate agents. Build shareable maps and tours buyers actually open.',
  },
  '/features': {
    path: '/features',
    title: 'Features — Parcel Search, Listing Maps & Property Tours | CommunityView',
    description:
      'Explore CommunityView features: nationwide parcel search, ownership details, map layers, listing maps, and shareable property tours for agents.',
  },
  '/pricing': {
    path: '/pricing',
    title: 'Pricing — Plans for Real Estate Agents | CommunityView',
    description:
      'Simple pricing for agents. Start with a 14-day free trial. Regular and Plus plans for parcel search, listing maps, and property tours.',
  },
  '/faq': {
    path: '/faq',
    title: 'FAQ — Parcel Research, Maps & Tours | CommunityView',
    description:
      'Answers about nationwide parcel research, listing maps, property tours, sharing with buyers, trials, and billing on CommunityView.',
  },
  '/tutorial': {
    path: '/tutorial',
    title: 'Tutorial — How to Use CommunityView',
    description:
      'Learn how to explore parcels, map layers, listing maps, and property tours in CommunityView.',
  },
  '/map': {
    path: '/map',
    title: 'Interactive Parcel Map | CommunityView',
    description:
      'Open the CommunityView map to explore parcels, ownership, and land layers nationwide.',
  },
  '/login': {
    path: '/login',
    title: 'Log In | CommunityView',
    description: 'Log in to CommunityView to access parcel search, listing maps, and property tours.',
    noindex: true,
  },
  '/signup': {
    path: '/signup',
    title: 'Sign Up | CommunityView',
    description: 'Create a CommunityView account and start your 14-day free trial.',
    noindex: true,
  },
};

export function absoluteUrl(path = '/') {
  if (!path || path === '/') return `${SITE_ORIGIN}/`;
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return `${SITE_ORIGIN}${normalized}`;
}

export function getPageSeo(pathname) {
  const exact = PAGE_SEO[pathname];
  if (exact) return exact;

  if (pathname === '/use-cases') {
    return {
      path: useCasesHub.path,
      title: useCasesHub.seoTitle,
      description: useCasesHub.seoDescription,
    };
  }

  if (pathname.startsWith('/use-cases/')) {
    const slug = pathname.replace('/use-cases/', '').replace(/\/$/, '');
    const useCase = getUseCaseBySlug(slug);
    if (useCase) {
      return {
        path: `/use-cases/${useCase.slug}`,
        title: useCase.seoTitle,
        description: useCase.seoDescription,
      };
    }
  }

  if (pathname === landIdCompare.path || pathname === '/compare/landid') {
    return {
      path: landIdCompare.path,
      title: landIdCompare.seoTitle,
      description: landIdCompare.seoDescription,
    };
  }

  // Tokenized share URLs — leave indexing decisions to the page; default soft meta
  if (pathname.startsWith('/tour/') || pathname.startsWith('/view/')) {
    return {
      path: pathname,
      title: 'Shared Map | CommunityView',
      description: 'View a shared CommunityView listing map or property tour.',
      noindex: true,
    };
  }
  return PAGE_SEO['/'];
}
