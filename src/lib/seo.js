// seo.js — per-page <head> management for a single-page app.
//
// Why not react-helmet: this is ~50 lines and no dependency. A SPA has ONE
// index.html, so without something like this every page shares the homepage's
// title and description — which is why Google and WhatsApp currently see one
// page for the whole store.
//
// What this fixes:
//   * a real title + description per route (search results, browser tabs)
//   * og: tags per route, so a link pasted into WhatsApp or an IG bio shows a
//     picture and a price instead of a bare URL. For a shop that sells in DMs
//     this is the highest-value markup on the site.
//   * canonical URL, so /category/bags doesn't compete with itself
//   * JSON-LD, so Google can show structured product/store info
import { useEffect } from 'react';

const SITE = 'https://kamili.co.ke';   // ← change when the domain is live
const BRAND = 'Kamili';
const DEFAULT_IMG = `${SITE}/og-cover.jpg`;

// Create-or-update a <meta> tag. `attr` is 'name' for standard meta and
// 'property' for Open Graph, which is a different attribute — getting this
// wrong is why og: tags silently don't work.
function setMeta(attr, key, content) {
  if (!content) return;
  let el = document.head.querySelector(`meta[${attr}="${key}"]`);
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
}

function setLink(rel, href) {
  let el = document.head.querySelector(`link[rel="${rel}"]`);
  if (!el) {
    el = document.createElement('link');
    el.setAttribute('rel', rel);
    document.head.appendChild(el);
  }
  el.setAttribute('href', href);
}

// JSON-LD goes in its own tagged <script> so each route replaces only its own,
// and never the LocalBusiness block that lives in index.html.
function setJsonLd(data) {
  const ID = 'route-jsonld';
  document.getElementById(ID)?.remove();
  if (!data) return;
  const el = document.createElement('script');
  el.type = 'application/ld+json';
  el.id   = ID;
  el.textContent = JSON.stringify(data);
  document.head.appendChild(el);
}

/**
 * useSeo — set the document head for the current route.
 *
 * @param {string} title       page title WITHOUT the brand (appended for you)
 * @param {string} description 150-160 chars, written for a human, not a crawler
 * @param {string} path        route path, e.g. '/category/bags'
 * @param {string} image       absolute URL for the social preview image
 * @param {object} jsonLd      optional schema.org object for this route
 */
export function useSeo({ title, description, path = '', image, jsonLd } = {}) {
  useEffect(() => {
    const fullTitle = title ? `${title} | ${BRAND}` : BRAND;
    const url       = `${SITE}${path}`;
    const img       = image || DEFAULT_IMG;

    document.title = fullTitle;
    setMeta('name',     'description',    description);
    setLink('canonical', url);

    // Open Graph — WhatsApp, Instagram, Facebook, LinkedIn all read these.
    setMeta('property', 'og:title',       fullTitle);
    setMeta('property', 'og:description', description);
    setMeta('property', 'og:url',         url);
    setMeta('property', 'og:image',       img);
    setMeta('property', 'og:type',        'website');

    // Twitter/X reads its own namespace and ignores og: for the card type.
    setMeta('name', 'twitter:card',        'summary_large_image');
    setMeta('name', 'twitter:title',       fullTitle);
    setMeta('name', 'twitter:description', description);
    setMeta('name', 'twitter:image',       img);

    setJsonLd(jsonLd);
  }, [title, description, path, image, JSON.stringify(jsonLd)]);
}

/**
 * Build a schema.org ItemList of products for a category page.
 * Gives Google the names and prices on the page, which is what lets a category
 * show up for "designer handbags nairobi price" style searches.
 */
export function productListJsonLd(products, categoryLabel) {
  if (!products?.length) return null;
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: `${categoryLabel} — ${BRAND} Nairobi`,
    numberOfItems: products.length,
    itemListElement: products.slice(0, 24).map((p, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      item: {
        '@type': 'Product',
        name: p.name,
        image: p.image_url || undefined,
        category: p.category,
        offers: {
          '@type': 'Offer',
          price: Number(p.price),
          priceCurrency: 'KES',
          availability: p.status === 'Out of Stock'
            ? 'https://schema.org/OutOfStock'
            : 'https://schema.org/InStock',
        },
      },
    })),
  };
}

/** Aggregate review rating for the store, for the About page. */
export function reviewJsonLd(reviews) {
  if (!reviews?.length) return null;
  const avg = reviews.reduce((s, r) => s + r.rating, 0) / reviews.length;
  return {
    '@context': 'https://schema.org',
    '@type': 'Store',
    name: BRAND,
    url: SITE,
    aggregateRating: {
      '@type': 'AggregateRating',
      ratingValue: avg.toFixed(1),
      reviewCount: reviews.length,
      bestRating: 5,
    },
  };
}
