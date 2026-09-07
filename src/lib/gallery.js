// One place that answers "which photos does this product have, in order?"
//
// Two columns describe the same thing: `image_url` is the cover (every card,
// cart row, admin thumbnail and OG tag reads it) and `images` is the full
// ordered gallery with the cover first. A database trigger keeps them in
// step — see migration 20260907000000_product_images.sql.
//
// This helper exists for the gap that trigger cannot close: a browser holding
// a product row fetched BEFORE the column existed, or a cached response from
// a client that never selected it. Those rows have no `images` at all, so
// every reader would need the same defensive fallback. It lives here once.
export function galleryOf(product) {
  if (!product) return [];
  const list = Array.isArray(product.images) ? product.images.filter(Boolean) : [];
  if (list.length) return list;
  return product.image_url ? [product.image_url] : [];
}

// The cutout/white-stage treatment is decided per PHOTO, not per product: a
// gallery can mix a cutout hero with plain lifestyle shots, and each slide
// should be staged the way its own file wants. Detected from the storage
// path the uploader wrote (see uploadImage's isCutout).
export const isCutoutUrl = (url) => !!url?.includes('/products-cutout/');
