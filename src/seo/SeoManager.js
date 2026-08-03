import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { absoluteUrl, DEFAULT_OG_IMAGE, getPageSeo, SITE_ORIGIN } from './pageMeta';

function upsertMeta(attr, key, content) {
  if (content == null || content === '') return;
  let el = document.head.querySelector(`meta[${attr}="${key}"]`);
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
}

function upsertLink(rel, href) {
  let el = document.head.querySelector(`link[rel="${rel}"]`);
  if (!el) {
    el = document.createElement('link');
    el.setAttribute('rel', rel);
    document.head.appendChild(el);
  }
  el.setAttribute('href', href);
}

function upsertJsonLd(id, data) {
  let el = document.getElementById(id);
  if (!data) {
    if (el) el.remove();
    return;
  }
  if (!el) {
    el = document.createElement('script');
    el.type = 'application/ld+json';
    el.id = id;
    document.head.appendChild(el);
  }
  el.textContent = JSON.stringify(data);
}

/**
 * Sets document title + meta/canonical for the current route.
 * Pass `jsonLd` for page-specific structured data (e.g. FAQPage).
 */
export function applyPageSeo({ title, description, path, noindex, image, jsonLd } = {}) {
  const url = absoluteUrl(path || '/');
  const ogImage = image || DEFAULT_OG_IMAGE;

  if (title) document.title = title;
  upsertMeta('name', 'description', description);
  upsertMeta('name', 'robots', noindex ? 'noindex,nofollow' : 'index,follow');

  upsertMeta('property', 'og:type', 'website');
  upsertMeta('property', 'og:site_name', 'CommunityView');
  upsertMeta('property', 'og:title', title);
  upsertMeta('property', 'og:description', description);
  upsertMeta('property', 'og:url', url);
  upsertMeta('property', 'og:image', ogImage);

  upsertMeta('name', 'twitter:card', 'summary_large_image');
  upsertMeta('name', 'twitter:title', title);
  upsertMeta('name', 'twitter:description', description);
  upsertMeta('name', 'twitter:url', url);
  upsertMeta('name', 'twitter:image', ogImage);

  upsertLink('canonical', url);
  upsertJsonLd('cv-page-jsonld', jsonLd || null);
}

/** Route-driven SEO for SPA navigation. */
export default function SeoManager({ jsonLdByPath } = {}) {
  const { pathname } = useLocation();

  useEffect(() => {
    const seo = getPageSeo(pathname);
    const jsonLd = jsonLdByPath?.[pathname] || null;
    applyPageSeo({ ...seo, jsonLd });
  }, [pathname, jsonLdByPath]);

  useEffect(() => {
    // Soft hint only — permanent www→apex redirect should be DNS/hosting 301.
    if (typeof window !== 'undefined' && window.location.hostname === 'www.communityview.ai') {
      const { pathname: p, search, hash } = window.location;
      window.location.replace(`${SITE_ORIGIN}${p}${search}${hash}`);
    }
  }, []);

  return null;
}
