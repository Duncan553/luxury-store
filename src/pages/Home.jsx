import { useEffect, useState, useRef, useCallback } from 'react';
import { useCart } from '../context/CartContext';
import { Link } from 'react-router-dom';
import CategoryDeck from '../components/CategoryDeck';
import { motion, useScroll, useTransform, useInView } from 'framer-motion';
import { supabase } from '../lib/supabase';
import { useSeo } from '../lib/seo';
import './Home.css';

const FALLBACK_IMGS = {
  bags:    'https://images.unsplash.com/photo-1548036328-c9fa89d128fa?w=900&q=80',
  jewelry: 'https://images.unsplash.com/photo-1515562141207-7a88fb7ce338?w=900&q=80',
  watches: 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=900&q=80',
};
const DEFAULT_IMG = 'https://images.unsplash.com/photo-1441986300917-64674bd600d8?w=900&q=80';
const ease = [0.25, 0.46, 0.45, 0.94];

/* ── Scroll-triggered fade ──────────────────────────────────────────── */
function Reveal({ children, delay = 0, y = 36, className = '' }) {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: '-70px' });
  return (
    <motion.div ref={ref} className={className}
      initial={{ opacity: 0, y }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.85, ease, delay }}>
      {children}
    </motion.div>
  );
}

/* ── Stagger container ──────────────────────────────────────────────── */
function Stagger({ children, className }) {
  const ref    = useRef(null);
  const inView = useInView(ref, { once: true, margin: '-50px' });
  return (
    <motion.div ref={ref} className={className}
      initial="hidden"
      animate={inView ? 'show' : 'hidden'}
      variants={{ hidden: {}, show: { transition: { staggerChildren: 0.09 } } }}>
      {children}
    </motion.div>
  );
}
const itemV = {
  hidden: { opacity: 0, y: 30 },
  show:   { opacity: 1, y: 0, transition: { duration: 0.7, ease } },
};

/* ── Magnetic button ────────────────────────────────────────────────── */
function MagBtn({ to, children, className }) {
  const ref = useRef(null);
  const onMove = useCallback((e) => {
    const el  = ref.current;
    const r   = el.getBoundingClientRect();
    const dx  = e.clientX - (r.left + r.width  / 2);
    const dy  = e.clientY - (r.top  + r.height / 2);
    el.style.transform  = `translate(${dx * 0.28}px, ${dy * 0.28}px)`;
    el.style.transition = 'transform 0.15s ease';
  }, []);
  const onLeave = useCallback(() => {
    ref.current.style.transform  = 'translate(0,0)';
    ref.current.style.transition = 'transform 0.55s cubic-bezier(0.34,1.56,0.64,1)';
  }, []);
  return (
    <div ref={ref} onMouseMove={onMove} onMouseLeave={onLeave} style={{ display: 'inline-block' }}>
      <Link to={to} className={className}>{children}</Link>
    </div>
  );
}

/* ── Floating particles (CSS-driven, no JS perf cost) ───────────────── */
const PARTICLES = Array.from({ length: 16 }, (_, i) => ({
  id: i, size: 1.5 + (i % 3) * 0.8,
  left: `${4 + (i * 6.1) % 92}%`, top: `${8 + (i * 11.3) % 84}%`,
  dur: 5 + (i % 7), delay: (i * 0.6) % 5,
}));

// Same copy the About deck uses. Duplicated deliberately rather than
// imported from a page module — pages shouldn't import from each other —
// and keyed by slug with a fallback so a new category still renders.
const CAT_BLURBS = {
  bags:       'Totes, satchels, crossbodies and backpacks — from an everyday work bag to something small for an evening out.',
  jewelry:    'Chains, rings, bangles and earrings — light enough to wear every day, or the piece people actually notice.',
  watches:    'Dress watches, chronographs and everyday steel — the one thing people read you by, and the only way to check the time without reaching for your phone.',
  sunglasses: 'Aviators, wayfarers, cat-eye and round frames. Nairobi sun is not gentle; these handle it without looking like safety gear.',
};

export default function Home() {
  const [categories,       setCategories]       = useState([]);
  const [loading,          setLoading]          = useState(true);
  // Real, live count of what's actually in stock right now — shown in the
  // stats strip below instead of a hard-coded number. See the fetch below:
  // { count: 'exact', head: true } asks Postgres for a row count without
  // pulling any rows back, so this costs nothing extra to keep truthful.
  const [productCount,     setProductCount]     = useState(null);
  // Per-category counts for the deck. One column fetched, counted client
  // side — cheaper than four count queries and small enough not to matter.
  const [catCounts,        setCatCounts]        = useState({});
  // C2: vacation mode — fetched via CartContext (already fetches store_settings on mount)
  const { vacationMode, vacationMessage } = useCart();


  // Homepage head. Written for a person scanning a Google result, not a crawler:
  // what we sell, where we are, and how ordering works.
  useSeo({
    title: 'Luxury Bags, Jewellery & Watches in Nairobi',
    description: 'Bags, jewellery and watches from Nairobi, shipped across Kenya and worldwide. Order on WhatsApp.',
    path: '/',
  });

  const { scrollY }  = useScroll();
  const heroY        = useTransform(scrollY, [0, 800], [0, 200]);
  const heroOp       = useTransform(scrollY, [0, 500], [1, 0]);
  const bgScale      = useTransform(scrollY, [0, 800], [1, 1.08]);

  useEffect(() => {
    supabase.from('categories').select('*').order('created_at')
      .then(({ data }) => { if (data) setCategories(data); });
    setLoading(false);
    // Live stock count for the stats strip — was previously a hard-coded
    // "500+" nobody could verify against the real catalogue.
    supabase.from('products').select('id', { count: 'exact', head: true })
      .neq('status', 'Out of Stock')
      .then(({ count }) => { if (typeof count === 'number') setProductCount(count); });
    supabase.from('products').select('category')
      .then(({ data }) => {
        if (!data) return;
        const by = {};
        data.forEach((p) => {
          const slug = (p.category || '').toLowerCase().replace(/\s+/g, '-');
          by[slug] = (by[slug] || 0) + 1;
        });
        setCatCounts(by);
      });
  }, []);

  return (
    <div className="home">
      {/* C2: vacation banner */}
      {vacationMode && (
        <div className="vacation-banner">
          {vacationMessage || 'We are currently on vacation. Orders will be processed when we return.'}
        </div>
      )}

      {/* ═══ HERO ═══════════════════════════════════════════════════════ */}
      <section className="hero">
        <motion.div className="hero__bg" style={{ scale: bgScale }} />
        <div className="hero__bg-glow" />
        <div className="hero__scanlines" />

        {/* Particles */}
        <div className="hero__particles" aria-hidden="true">
          {PARTICLES.map(p => (
            <span key={p.id} className="hero__particle"
              style={{
                width: p.size, height: p.size,
                left: p.left, top: p.top,
                animationDuration: `${p.dur}s`,
                animationDelay:    `${p.delay}s`,
              }} />
          ))}
        </div>

        <motion.div className="hero__content container" style={{ y: heroY, opacity: heroOp }}>
          {/* Magazine masthead composition. The headline spans the FULL width
              as row 1, then the copy and the contents column sit in a band
              beneath it as row 2.

              Why not the obvious two columns: "Quiet / Luxury." is only
              ~390px of type. Boxed into a half-width column beside the
              index it left roughly 600px of dead space in the middle of the
              page, and no font size closes that — the words are short. Run
              across the whole width the type becomes the image, which is
              what a cover actually does, and the space is used instead of
              being decorated. */}
          {/* MAGAZINE COVER COMPOSITION.

              The photograph is a layer in the middle of the type, not a
              panel beside it. "LUXURY" is set huge and passes BEHIND the
              image, so the photo eats the middle of the word — which is the
              move that makes a cover read as a cover rather than as a
              headline with a picture next to it.

              It works because the type and the image are in the same grid
              cell, stacked on the z-axis: word underneath, photo above it,
              second word above the photo. No cut-outs, no masks — the
              occlusion is just stacking order, which means it survives any
              screen width and costs nothing to render.

              The photo is black and white on purpose: a colour photograph
              here would compete with the type for attention, and mono lets
              the one red accent in the palette stay the only colour on the
              page. */}
          <div className="hero__grid">
            <motion.span className="hero__kicker"
              initial={{ opacity: 0, letterSpacing: '0.6em' }}
              animate={{ opacity: 1, letterSpacing: '0.3em' }}
              transition={{ duration: 1.1, ease, delay: 0.4 }}>
              Nairobi · Est. 2024
            </motion.span>

            <div className="hero__stack">
              {/* Layer 1 — behind the photo. */}
              <motion.h1 className="hero__word hero__word--back"
                initial={{ opacity: 0, y: 40 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 1.1, ease: [0.16, 1, 0.3, 1], delay: 0.55 }}>
                Quiet
              </motion.h1>

              {/* Layer 2 — the plate. */}
              <motion.figure className="hero__plate"
                initial={{ opacity: 0, y: 34 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1], delay: 0.75 }}>
                <img
                  src="https://llxeazcqroaojjhogpjx.supabase.co/storage/v1/object/public/images/hero/kamili-hero-1000.jpg"
                  srcSet="https://llxeazcqroaojjhogpjx.supabase.co/storage/v1/object/public/images/hero/kamili-hero-520.jpg 520w, https://llxeazcqroaojjhogpjx.supabase.co/storage/v1/object/public/images/hero/kamili-hero-1000.jpg 1000w"
                  sizes="(max-width: 767px) 74vw, 34vw"
                  alt="A black leather handbag held in both hands, with a gold watch on the wrist"
                  width="1000" height="1500"
                  fetchpriority="high"
                />
              </motion.figure>

              {/* Layer 3 — over the photo, so the word is cut in two. */}
              <motion.span className="hero__word hero__word--front" aria-hidden="true"
                initial={{ opacity: 0, y: 40 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 1.1, ease: [0.16, 1, 0.3, 1], delay: 0.65 }}>
                Luxury
              </motion.span>
            </div>

            <div className="hero__band">
              <motion.p className="hero__lede"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.9, ease, delay: 1.15 }}>
                Bags, jewellery and watches, sold out of Nairobi and shipped
                worldwide. Ordered on WhatsApp — we confirm what's in stock and
                what delivery costs before you pay.
              </motion.p>

              <motion.div className="hero__ctas"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.8, ease, delay: 1.35 }}>
                <MagBtn to={categories[0] ? `/category/${categories[0].slug}` : '/category/bags'}
                  className="btn hero__btn-primary">Shop Now</MagBtn>
                <MagBtn to="/about" className="btn btn-outline hero__btn-ghost">Our Story</MagBtn>
              </motion.div>

              {/* Carries the search terms the display type can't: nobody
                  types "Quiet Luxury" into Google. */}
              <motion.h2 className="hero__seo-line"
                initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                transition={{ duration: 0.8, ease, delay: 0.6 }}>
                Bags, jewellery &amp; watches from Nairobi — shipped across Kenya and worldwide
              </motion.h2>
            </div>
          </div>
        </motion.div>

        <motion.div className="hero__scroll-indicator"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }}
          transition={{ delay: 2, duration: 1 }}>
          <div className="hero__scroll-mouse">
            <span className="hero__scroll-wheel" />
          </div>
        </motion.div>

        {/* Corner decorations */}
        {/* Removed: two decorative corner brackets (top-left, bottom-right).
            Pure ornament — they framed the hero without marking anything
            real, and the top-left one sat right beside the logo where it
            read as a stray artefact. Both go rather than just the left one:
            half a frame looks like a rendering fault, not a choice. */}
      </section>

      {/* ═══ CATEGORIES ═════════════════════════════════════════════════ */}
      {categories.length > 0 && (
        <section className="cat-section">
          <Reveal className="cat-section__header container">
            <span className="section-eyebrow">Collections</span>
            <h2 className="cat-section__title">Shop by Category</h2>
          </Reveal>

          {/* Same coverflow deck as the About page — one component, so the
              two can't drift apart, and a category added in admin appears in
              both. Every card routes: the front card is a link straight to
              /category/<slug>, the side cards step forward first (tapping a
              rotated, half-occluded card to navigate is a mis-tap waiting to
              happen), and the CTA under the deck goes to whichever category
              is currently in front. */}
          <div className="container">
            <CategoryDeck
              categories={categories.map((c) => ({
                ...c,
                // NO image fallback. FALLBACK_IMGS is keyed by the original
                // slugs, so any category the owner adds later fell through to
                // DEFAULT_IMG — which is a handbag. A new "Perfume" category
                // would have advertised itself with a picture of a bag, the
                // same category/photo mismatch this catalogue already had to
                // be dug out of. Passing the real value through means a
                // cover-less category shows a neutral placeholder instead,
                // which reads as "needs a cover" rather than as a wrong one.
                cover_url: c.cover_url || null,
                blurb: CAT_BLURBS[c.slug] || 'Browse what we currently have in this category.',
              }))}
              counts={catCounts}
            />
          </div>
        </section>
      )}

      {/* ═══ EDITORIAL SPLIT ════════════════════════════════════════════ */}
      <section className="editorial section">
        <div className="container editorial__inner">
          <Reveal className="editorial__text" delay={0.1}>
            <span className="section-eyebrow">Why Kamili</span>
            <h2 className="editorial__heading">
              Real pieces,<br />sorted fast.
            </h2>
            {/* Two things were wrong here. "Sold from Nairobi" with no
                further scope read as Nairobi-only, when Kamili ships
                worldwide — understating your own reach is still telling the
                customer something untrue. And "no waiting on a courier you
                can't reach" was a swipe at couriers Kamili itself depends on
                to deliver: a promise the shop is not in a position to keep.
                Nairobi stays because it's where the shop is (and it's what
                local buyers search for); the scope is now stated plainly. */}
            <p className="editorial__body">
              Bags, jewelry and watches, sold out of Nairobi and shipped
              worldwide. Message us on WhatsApp and we'll confirm what's in
              stock and what delivery to your address costs, before you pay.
            </p>
            {/* Both numbers are live, not written-in: productCount comes from
                an exact DB count (see the fetch above), categories.length
                from the categories already loaded for the nav above. The
                old version hard-coded "500+ Pieces Curated" and "100%
                Personal Touch" — numbers nobody could check against the
                real catalogue. A stat that isn't true is worse than no
                stat: the first mismatch a visitor notices, they stop
                trusting the rest of the page too. */}
            <div className="editorial__stats">
              {[
                [productCount !== null ? productCount : '—', 'In Stock Now'],
                [categories.length || '—', categories.length === 1 ? 'Collection' : 'Collections'],
              ].map(([n, l]) => (
                <div key={l} className="editorial__stat">
                  <span className="editorial__stat-num">{n}</span>
                  <span className="editorial__stat-label">{l}</span>
                </div>
              ))}
            </div>
            <MagBtn to={categories[0] ? `/category/${categories[0].slug}` : '/category/bags'} className="btn btn-gold">Shop the Edit</MagBtn>
          </Reveal>

          <Reveal className="editorial__visual" delay={0.3}>
            <figure className="editorial__img-wrap">
              {/* Was a stock colour jewellery shot with alt="Editorial" — a
                  filler image labelled with the name of the section it sat
                  in. Replaced with a mono plate on the same grade as the
                  hero — a Black woman's hand holding the bag, no face in
                  frame. Alt text describes what's actually in the picture
                  rather than naming the section, which is what a screen
                  reader user needs. */}
              <img
                src="https://llxeazcqroaojjhogpjx.supabase.co/storage/v1/object/public/images/editorial/why-kamili-900.jpg"
                srcSet="https://llxeazcqroaojjhogpjx.supabase.co/storage/v1/object/public/images/editorial/why-kamili-450.jpg 450w, https://llxeazcqroaojjhogpjx.supabase.co/storage/v1/object/public/images/editorial/why-kamili-900.jpg 900w"
                sizes="(max-width: 859px) 92vw, 40vw"
                alt="A hand wearing bangles holding a striped leather handbag"
                width="900" height="1125"
                loading="lazy"
                className="img-cover editorial__img"
              />
              {/* Removed a "New / Season" sticker that sat on this photo.
                  It's a fashion-retail badge asserting something the site
                  can't back — there is no season, and the photo isn't new
                  stock. A magazine captions a plate; it doesn't sticker it. */}
              <figcaption className="editorial__cap">Nairobi · sold on WhatsApp</figcaption>
            </figure>
          </Reveal>
        </div>
      </section>

      {/* New Arrivals removed. It put a grid of colour product tiles in the
          middle of a black-and-white editorial page, which broke the look
          the rest of the page is now built on — and it duplicated the
          category deck directly above it as a route into the same items.
          Latest-first ordering lives where it belongs instead: each
          category page sorts by created_at descending, so the newest piece
          in a category is the first one you see. */}

      {/* ═══ BENTO PROMISE ══════════════════════════════════════════════ */}
      <section className="bento-section section">
        <div className="container">
          <Reveal style={{ textAlign: 'center', marginBottom: 48 }}>
            {/* Was "Why Kamili / The Standard We Hold Ourselves To" — a
                heading about Kamili's own character rather than about
                anything the customer needs. A shop that announces its
                standards invites the reader to weigh them; stating the
                facts and letting them stand does not. */}
            <span className="section-eyebrow">Good To Know</span>
            <h2 className="section-title">How ordering<br />works here</h2>
          </Reveal>

          <Stagger className="bento-grid">
            {/* Big card */}
            <motion.div variants={itemV} className="bento-card bento-card--big">
              {/* Same treatment: a mono plate, hands and a watch, no face. */}
              <div className="bento-card__img"
                style={{ backgroundImage: `url(https://llxeazcqroaojjhogpjx.supabase.co/storage/v1/object/public/images/editorial/good-to-know-900.jpg)` }} />
              <div className="bento-card__overlay" />
              {/* No decorative glyph/number markers on these four cards.
                  They previously alternated ✦ / "01" / ◎ / "02" — numbering
                  only half the set, on content that isn't a sequence (these
                  are four parallel reasons to buy, not four ordered steps).
                  Structure should encode something true about the content;
                  that numbering encoded nothing, so it's gone and the
                  headings carry the cards. */}
              <div className="bento-card__body">
                {/* Was "Real Photos, Real Stock — what you see is what's
                    actually available, no stock-photo swaps". That claim
                    became false the moment the catalogue was filled with
                    placeholder listings that use stock photography. A
                    promise the site itself breaks is worse than no promise,
                    so it's replaced with the fact a buyer most needs and
                    that the site can actually keep. */}
                <h3 className="bento-card__title">Delivery Quoted Before You Pay</h3>
                <p className="bento-card__desc">Prices here cover the item. We send you the delivery cost for your area on WhatsApp first.</p>
              </div>
            </motion.div>

            {/* Small cards */}
            <motion.div variants={itemV} className="bento-card bento-card--sm bento-card--gold">
              <h3 className="bento-card__title">Order on WhatsApp</h3>
              <p className="bento-card__desc">Chat first, pay when you're sure. No card details, no forms.</p>
            </motion.div>

            <motion.div variants={itemV} className="bento-card bento-card--sm">
              <h3 className="bento-card__title">Nairobi-Based, Ships Worldwide</h3>
              <p className="bento-card__desc">Based in Nairobi, shipping across Kenya and internationally. Cost quoted per address.</p>
            </motion.div>

            {/* Was "Personal Touch — every order fulfilled personally, with
                care and intention": the same overclaim stripped from the rest
                of the site, and it just restated the WhatsApp card. Replaced
                with something actually true and checkable — the cart now
                refuses to let anyone order more than the real stock count. */}
            <motion.div variants={itemV} className="bento-card bento-card--sm bento-card--dark">
              <h3 className="bento-card__title">Live Stock Counts</h3>
              <p className="bento-card__desc">You can't order what we don't have — the cart stops at what's on the shelf.</p>
            </motion.div>
          </Stagger>
        </div>
      </section>

    </div>
  );
}
