import { getUseCaseBySlug, useCasesHub } from '../pages/landingPages/content/useCases';
import { landIdCompare } from '../pages/landingPages/content/compare';

/** Canonical site origin — always apex (no www). */
export const SITE_ORIGIN = 'https://communityview.ai';
export const DEFAULT_OG_IMAGE = `${SITE_ORIGIN}/logo_only.png`;
/**
 * Marketing / public page SEO. Keep paths in sync with App routes + sitemap.
 * Canonicals use trailing slashes to match GitHub Pages directory shells.
 * @typedef {{ title: string, description: string, path: string, noindex?: boolean }} PageSeo
 */

/** Paths that should not force a trailing slash in canonicals. */
function isTokenOrAuthPath(pathname) {
  return (
    pathname.startsWith('/tour/') ||
    pathname.startsWith('/view/') ||
    pathname.startsWith('/amenities/') ||
    pathname === '/login' ||
    pathname === '/signup' ||
    pathname === '/signup-success' ||
    pathname === '/reset-password' ||
    pathname === '/create-account' ||
    pathname === '/manage-subscription'
  );
}

/** Strip trailing slash for route lookup (keep "/" as "/"). */
export function normalizePathname(pathname = '/') {
  if (!pathname || pathname === '/') return '/';
  return pathname.replace(/\/+$/, '') || '/';
}

/** @type {Record<string, PageSeo>} */
export const PAGE_SEO = {
  '/': {
    path: '/',
    title: 'Community View — Parcel Maps & Property Tours for Agents',
    description:
      'Community View (communityview.ai) is parcel map software for real estate agents: nationwide parcel search, listing maps, and digital property tours buyers actually open.',
  },
  '/features': {
    path: '/features',
    title: 'Features — Parcel Search, Listing Maps & Property Tours | Community View',
    description:
      'Explore Community View features: nationwide parcel search, ownership details, map layers, listing maps, and shareable property tours for agents.',
  },
  '/pricing': {
    path: '/pricing',
    title: 'Pricing — Plans for Real Estate Agents | Community View',
    description:
      'Simple pricing for agents. Start with a 14-day free trial. Regular and Plus plans for parcel search, listing maps, and property tours.',
  },
  '/faq': {
    path: '/faq',
    title: 'FAQ — Parcel Research, Maps & Tours | Community View',
    description:
      'Answers about Community View nationwide parcel research, listing maps, property tours, sharing with buyers, trials, and billing.',
  },
  '/map': {
    path: '/map',
    title: 'Interactive Parcel Map | Community View',
    description:
      'Open the Community View map to explore parcels, ownership, and land layers nationwide.',
  },
  '/login': {
    path: '/login',
    title: 'Log In | Community View',
    description: 'Log in to Community View to access parcel search, listing maps, and property tours.',
    noindex: true,
  },
  '/signup': {
    path: '/signup',
    title: 'Sign Up | Community View',
    description: 'Create a Community View account and start your 14-day free trial.',
    noindex: true,
  },
};

/**
 * Absolute canonical URL. Marketing pages use a trailing slash so sitemap,
 * shells, and GitHub Pages directory URLs agree (avoids "Page with redirect").
 */
export function absoluteUrl(path = '/') {
  if (!path || path === '/') return `${SITE_ORIGIN}/`;
  const normalized = normalizePathname(path.startsWith('/') ? path : `/${path}`);
  if (isTokenOrAuthPath(normalized)) {
    return `${SITE_ORIGIN}${normalized}`;
  }
  return `${SITE_ORIGIN}${normalized}/`;
}

export function buildFaqJsonLd(faqs) {
  if (!faqs?.length) return null;
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map((item) => ({
      '@type': 'Question',
      name: item.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: item.answer,
      },
    })),
  };
}

export function getPageSeo(pathname) {
  const clean = normalizePathname(pathname);
  const exact = PAGE_SEO[clean];
  if (exact) return exact;

  if (clean === '/use-cases') {
    return {
      path: useCasesHub.path,
      title: useCasesHub.seoTitle,
      description: useCasesHub.seoDescription,
    };
  }

  if (clean.startsWith('/use-cases/')) {
    const slug = clean.replace('/use-cases/', '');
    const useCase = getUseCaseBySlug(slug);
    if (useCase) {
      return {
        path: `/use-cases/${useCase.slug}`,
        title: useCase.seoTitle,
        description: useCase.seoDescription,
        faqs: useCase.faqs || null,
      };
    }
  }

  if (clean === landIdCompare.path || clean === '/compare/landid') {
    return {
      path: landIdCompare.path,
      title: landIdCompare.seoTitle,
      description: landIdCompare.seoDescription,
    };
  }

  if (clean.startsWith('/tour/') || clean.startsWith('/view/')) {
    return {
      path: clean,
      title: 'Shared Map | Community View',
      description: 'View a shared Community View listing map or property tour.',
      noindex: true,
    };
  }
  return PAGE_SEO['/'];
}
