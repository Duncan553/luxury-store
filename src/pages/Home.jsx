import { useEffect, useState, useRef, useCallback } from 'react';
import { useCart } from '../context/CartContext';
import { Link } from 'react-router-dom';
import { motion, useScroll, useTransform, useInView } from 'framer-motion';
import Tilt from 'react-parallax-tilt';
import { supabase } from '../lib/supabase';
import ProductCard from '../components/ProductCard';
import Lightbox from '../components/Lightbox';
import HeroShowcase from '../components/HeroShowcase';
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

export default function Home() {
  const [categories,       setCategories]       = useState([]);
  const [preorders,        setPreorders]        = useState([]);
  const [loading,          setLoading]          = useState(true);
  const [lbIndex,          setLbIndex]          = useState(null);
  // Real, live count of what's actually in stock right now — shown in the
  // stats strip below instead of a hard-coded number. See the fetch below:
  // { count: 'exact', head: true } asks Postgres for a row count without
  // pulling any rows back, so this costs nothing extra to keep truthful.
  const [productCount,     setProductCount]     = useState(null);
  // C2: vacation mode — fetched via CartContext (already fetches store_settings on mount)
  const { vacationMode, vacationMessage } = useCart();

  const openLightbox  = useCallback((product) => {
    const idx = preorders.findIndex(p => p.id === product.id);
    setLbIndex(idx >= 0 ? idx : 0);
  }, [preorders]);
  const closeLightbox = useCallback(() => setLbIndex(null), []);
  const prevProduct   = useCallback(() => setLbIndex(i => Math.max(0, i - 1)), []);
  const nextProduct   = useCallback(() => setLbIndex(i => Math.min(preorders.length - 1, i + 1)), [preorders.length]);

  // Homepage head. Written for a person scanning a Google result, not a crawler:
  // what we sell, where we are, and how ordering works.
  useSeo({
    title: 'Luxury Bags, Jewellery & Watches in Nairobi',
    description: 'Quality bags, jewellery and watches, delivered across Kenya. Order on WhatsApp — we reply in minutes.',
    path: '/',
  });

  const { scrollY }  = useScroll();
  const heroY        = useTransform(scrollY, [0, 800], [0, 200]);
  const heroOp       = useTransform(scrollY, [0, 500], [1, 0]);
  const bgScale      = useTransform(scrollY, [0, 800], [1, 1.08]);

  useEffect(() => {
    supabase.from('categories').select('*').order('created_at')
      .then(({ data }) => { if (data) setCategories(data); });
    // New arrivals: products added in the last 30 days, max 5
    const since = new Date();
    since.setDate(since.getDate() - 30);
    supabase.from('products').select('*')
      .neq('status', 'Out of Stock')
      .gte('created_at', since.toISOString())
      .order('created_at', { ascending: false })
      .limit(5)
      .then(({ data }) => { if (data) setPreorders(data); setLoading(false); });
    // Live stock count for the stats strip — was previously a hard-coded
    // "500+" nobody could verify against the real catalogue.
    supabase.from('products').select('id', { count: 'exact', head: true })
      .neq('status', 'Out of Stock')
      .then(({ count }) => { if (typeof count === 'number') setProductCount(count); });
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
          <div className="hero__grid">
            <div className="hero__text">
              <motion.div className="hero__accent-line"
                initial={{ scaleX: 0 }} animate={{ scaleX: 1 }}
                transition={{ duration: 1.4, ease: [0.76, 0, 0.24, 1], delay: 0.3 }} />

              <motion.span className="hero__eyebrow"
                initial={{ opacity: 0, letterSpacing: '0.6em' }}
                animate={{ opacity: 1, letterSpacing: '0.3em' }}
                transition={{ duration: 1.1, ease, delay: 0.5 }}>
                Nairobi · Est. 2024
              </motion.span>

              <div className="hero__heading-wrap">
                <motion.h1 className="hero__heading"
                  initial={{ opacity: 0, y: 60, skewY: 3 }}
                  animate={{ opacity: 1, y: 0, skewY: 0 }}
                  transition={{ duration: 1.1, ease: [0.16, 1, 0.3, 1], delay: 0.7 }}>
                  Quiet<br /><em>Luxury.</em>
                </motion.h1>
                {/* Second line is part of the same visual headline, so it must not
                    be a second <h1> — styling comes from the class, not the tag. */}
                <motion.div className="hero__heading hero__heading--outline"
                  initial={{ opacity: 0, y: 60, skewY: 3 }}
                  animate={{ opacity: 1, y: 0, skewY: 0 }}
                  transition={{ duration: 1.1, ease: [0.16, 1, 0.3, 1], delay: 0.85 }}>
                  Undeniable<br />Presence.
                </motion.div>
              </div>

              <motion.p className="hero__sub"
                initial={{ opacity: 0, y: 24 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.9, ease, delay: 1.2 }}>
                Quality bags, jewelry &amp; watches<br />for those who need no introduction.
              </motion.p>

              {/* The hero art sells the feeling; this line sells the search term.
                  "Quiet Luxury" is not something anyone types into Google. */}
              <motion.h2 className="hero__seo-line"
                initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                transition={{ duration: 0.8, ease, delay: 0.6 }}>
                Designer bags, jewellery &amp; watches in Nairobi — delivered across Kenya
              </motion.h2>

              <motion.div className="hero__ctas"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.8, ease, delay: 1.45 }}>
                <MagBtn to={categories[0] ? `/category/${categories[0].slug}` : '/category/bags'}
                  className="btn hero__btn-primary">Shop Now</MagBtn>
                <MagBtn to="/about" className="btn btn-outline hero__btn-ghost">Our Story</MagBtn>
              </motion.div>
            </div>

            {/* Hidden on small screens (see Home.css) — the animated gradient
                stage is a nice-to-have on a spacious viewport, not something
                worth pushing the real CTAs further down a phone screen for. */}
            <motion.div className="hero__showcase-col"
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.9, ease, delay: 0.5 }}>
              <HeroShowcase />
            </motion.div>
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
        <div className="hero__corner hero__corner--tl" />
        <div className="hero__corner hero__corner--br" />
      </section>

      {/* ═══ CATEGORIES ═════════════════════════════════════════════════ */}
      {categories.length > 0 && (
        <section className="cat-section">
          <Reveal className="cat-section__header container">
            <span className="section-eyebrow">Collections</span>
            <h2 className="cat-section__title">Shop by Category</h2>
          </Reveal>

          <Stagger className="cat-grid container">
            {categories.map(({ id, name, slug, cover_url }, i) => (
              <motion.div key={id} variants={itemV}
                className={`cat-card${i === 0 ? ' cat-card--featured' : ''}`}>
                <Link to={`/category/${slug}`} className="cat-card__inner">
                  <div className="cat-card__img"
                    style={{ backgroundImage: `url(${cover_url || FALLBACK_IMGS[slug] || DEFAULT_IMG})` }} />
                  <div className="cat-card__overlay" />
                  <div className="cat-card__content">
                    <span className="cat-card__eyebrow">Discover</span>
                    <h3 className="cat-card__name">{name}</h3>
                    <div className="cat-card__arrow">
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1">
                        <path d="M5 12h14M12 5l7 7-7 7"/>
                      </svg>
                    </div>
                  </div>
                </Link>
              </motion.div>
            ))}
          </Stagger>
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
            <p className="editorial__body">
              Bags, jewelry and watches, sourced and sold from Nairobi.
              Message us on WhatsApp, we confirm what's available and
              arrange delivery — no account, no waiting on a courier
              you can't reach.
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
            <div className="editorial__img-wrap">
              <img src={FALLBACK_IMGS.jewelry} alt="Editorial" className="img-cover editorial__img" />
              <div className="editorial__img-badge">
                <span>New</span><br />Season
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ═══ PRODUCTS ═══════════════════════════════════════════════════ */}
      <section className="section">
        <div className="container">
          <Reveal className="section-header">
            <div>
              <span className="section-eyebrow">Exclusive Access</span>
              <h2 className="section-title">New Arrivals</h2>
            </div>
            {categories[0] && (
              <MagBtn to={`/category/${categories[0].slug}`} className="btn btn-outline">View All</MagBtn>
            )}
          </Reveal>

          {loading ? (
            <div className="products-grid">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="skeleton-card">
                  <div className="skeleton-img" /><div className="skeleton-text" />
                  <div className="skeleton-text skeleton-text--short" />
                </div>
              ))}
            </div>
          ) : preorders.length > 0 ? (
            <Stagger className="products-grid">
              {preorders.map(p => (
                <motion.div key={p.id} variants={itemV}>
                  <Tilt tiltMaxAngleDegrees={7} scale={1.02}
                    transitionSpeed={500} glareEnable
                    glareMaxOpacity={0.08} glareColor="rgba(220,20,60,0.5)"
                    tiltEasing="cubic-bezier(0.25,0.46,0.45,0.94)">
                    <ProductCard product={p} onOpen={openLightbox} />
                  </Tilt>
                </motion.div>
              ))}
            </Stagger>
          ) : (
            <p className="empty-state">No new arrivals this month. Check back soon.</p>
          )}
        </div>
      </section>

      {/* ═══ BENTO PROMISE ══════════════════════════════════════════════ */}
      <section className="bento-section section">
        <div className="container">
          <Reveal style={{ textAlign: 'center', marginBottom: 48 }}>
            <span className="section-eyebrow">Why Kamili</span>
            <h2 className="section-title">The Standard<br />We Hold Ourselves To</h2>
          </Reveal>

          <Stagger className="bento-grid">
            {/* Big card */}
            <motion.div variants={itemV} className="bento-card bento-card--big">
              <div className="bento-card__img"
                style={{ backgroundImage: `url(${FALLBACK_IMGS.bags})` }} />
              <div className="bento-card__overlay" />
              {/* No decorative glyph/number markers on these four cards.
                  They previously alternated ✦ / "01" / ◎ / "02" — numbering
                  only half the set, on content that isn't a sequence (these
                  are four parallel reasons to buy, not four ordered steps).
                  Structure should encode something true about the content;
                  that numbering encoded nothing, so it's gone and the
                  headings carry the cards. */}
              <div className="bento-card__body">
                <h3 className="bento-card__title">Real Photos, Real Stock</h3>
                <p className="bento-card__desc">What you see is what's actually available — no stock-photo swaps.</p>
              </div>
            </motion.div>

            {/* Small cards */}
            <motion.div variants={itemV} className="bento-card bento-card--sm bento-card--gold">
              <h3 className="bento-card__title">Order on WhatsApp</h3>
              <p className="bento-card__desc">Chat first, pay when you're sure. No card details, no forms.</p>
            </motion.div>

            <motion.div variants={itemV} className="bento-card bento-card--sm">
              <h3 className="bento-card__title">Nairobi-Based</h3>
              <p className="bento-card__desc">Delivery arranged across Kenya from a local WhatsApp number.</p>
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

      <Lightbox
        product={lbIndex !== null ? preorders[lbIndex] : null}
        onClose={closeLightbox}
        onPrev={prevProduct}
        onNext={nextProduct}
        hasPrev={lbIndex > 0}
        hasNext={lbIndex !== null && lbIndex < preorders.length - 1}
      />
    </div>
  );
}
