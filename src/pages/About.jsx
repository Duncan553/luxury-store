import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useScrollReveal } from '../hooks/useScrollReveal';
import { useSeo, reviewJsonLd } from '../lib/seo';
import './About.css';

/* ── Star rating input ───────────────────────────────────────────── */
function StarInput({ value, onChange }) {
  const [hovered, setHovered] = useState(0);
  return (
    <div className="star-input" aria-label="Star rating">
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          className={`star-input__star ${(hovered || value) >= star ? 'filled' : ''}`}
          onMouseEnter={() => setHovered(star)}
          onMouseLeave={() => setHovered(0)}
          onClick={() => onChange(star)}
          aria-label={`${star} star`}
        >★</button>
      ))}
    </div>
  );
}

/* ── Review card ─────────────────────────────────────────────────── */
function ReviewCard({ review }) {
  const stars = '★'.repeat(review.rating) + '☆'.repeat(5 - review.rating);
  return (
    <div className="review-card card">
      <p className="review-card__stars">{stars}</p>
      <p className="review-card__text">"{review.text}"</p>
      <p className="review-card__author">— {review.name || 'Anonymous'}</p>
    </div>
  );
}

/* ── Stats ────────────────────────────────────────────────────────── */
const STATS = [
  { value: '$31B',  label: 'Africa\'s fashion industry value', sub: 'and rising' },
  { value: '3,000+', label: 'African designers', sub: 'gaining global recognition' },
  { value: '54',    label: 'Countries', sub: 'one design identity' },
  { value: '2050',  label: 'The decade Africa leads', sub: 'the global creative economy' },
];

/* ── Collection spotlights ─────────────────────────────────────────── */
const COLLECTIONS = [
  {
    label: 'Watches',
    headline: 'Time, elevated.',
    body: 'Each timepiece is chosen not for name alone, but for the story it keeps. Precise mechanisms. Understated dials. Wrists that speak before mouths do.',
    img: 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=900&q=80',
    tag: 'Horology · Precision',
    align: 'right',
  },
  {
    label: 'Accessories',
    headline: 'Details that define.',
    body: 'Scarves, belts, sunglasses — the small gestures that complete the silhouette. Nothing disposable. Nothing accidental. Everything intentional.',
    img: 'https://images.unsplash.com/photo-1553062407-98eeb64c6a62?w=900&q=80',
    tag: 'Accessories · Edit',
    align: 'left',
  },
  {
    label: 'Jewellery',
    headline: 'Adornment as identity.',
    body: 'Brass, gold plate, natural stone. Each piece draws from East African craft tradition and wears it into the modern world without apology.',
    img: 'https://images.unsplash.com/photo-1515562141207-7a88fb7ce338?w=900&q=80',
    tag: 'Jewellery · Craft',
    align: 'right',
  },
];

/* ── Brands ───────────────────────────────────────────────────────── */
const BRANDS = [
  {
    name: 'Maxhosa Africa',
    origin: 'Johannesburg, South Africa',
    note: 'Xhosa-inspired knitwear worn by Beyoncé and stocked at Selfridges. Redefining what luxury knitwear looks like.',
    tag: 'Knitwear · Heritage',
  },
  {
    name: 'Thebe Magugu',
    origin: 'South Africa',
    note: 'LVMH Prize 2019 winner. Garments that carry political memory and African femininity in equal measure.',
    tag: 'Womenswear · Award-Winning',
  },
  {
    name: 'Studio 189',
    origin: 'Accra, Ghana',
    note: 'Co-founded by Rosario Dawson. Handcrafted using traditional Ghanaian batik, adinkra, and kente techniques.',
    tag: 'Ethical · Handcraft',
  },
  {
    name: 'Adele Dejak',
    origin: 'Nairobi, Kenya',
    note: 'Our own. Bold East African statement jewelry using brass, bone, and natural materials. Stocked in 22 countries.',
    tag: 'Jewellery · East African',
  },
  {
    name: 'Christie Brown',
    origin: 'Accra, Ghana',
    note: 'Blending Ghanaian craftsmanship with contemporary silhouettes. A permanent fixture at Africa Fashion Week London.',
    tag: 'Ready-to-Wear · Accra',
  },
  {
    name: 'Rich Mnisi',
    origin: 'Johannesburg, South Africa',
    note: 'Storytelling through pattern. His work references Tsonga mythology and has appeared in Vogue, Time, and Forbes.',
    tag: 'Design · Storytelling',
  },
];

/* ── Main component ───────────────────────────────────────────────── */
export default function About() {
  const [reviews,  setReviews]  = useState([]);
  const [settings, setSettings] = useState(null);
  // phone is optional — when provided, the DB trigger checks it against successful
  // payments and auto-approves the review if a match is found (verified buyer).
  const [form, setForm]             = useState({ name: '', text: '', rating: 0, phone: '' });
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted]   = useState(false);
  const [error, setError]           = useState('');

  // The aggregate rating here is what can put review stars in Google results.
  useSeo({
    title: 'About Kamili — Curated Luxury from Nairobi',
    description: 'Kamili curates luxury bags, jewellery and watches in Nairobi. Read customer reviews, find our contact details and opening hours.',
    path: '/about',
    jsonLd: reviewJsonLd(reviews),
  });

  useScrollReveal();

  useEffect(() => {
    supabase
      .from('reviews')
      .select('*')
      .eq('status', 'approved')
      .order('created_at', { ascending: false })
      .then(({ data }) => { if (data) setReviews(data); });

    supabase
      .from('store_settings')
      .select('*')
      .eq('id', 'singleton')
      .single()
      .then(({ data }) => { if (data) setSettings(data); });
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (!form.rating)      { setError('Please select a star rating.'); return; }
    if (!form.text.trim()) { setError('Please write your review.');    return; }

    setSubmitting(true);
    try {
      const { error: err } = await supabase.from('reviews').insert({
        name:       form.name.trim() || null,
        text:       form.text.trim(),
        rating:     form.rating,
        phone:      form.phone.trim() || null, // triggers auto-approve if verified buyer
        status:     'pending',
        created_at: new Date().toISOString(),
      });
      if (err) {
        console.error('Review insert error:', err);
        if (err.code === '42P01') {
          setError('Reviews table not found. Please run the database schema in Supabase.');
        } else if (err.code === '42501' || err.message?.includes('RLS') || err.message?.includes('policy')) {
          setError('Permission denied. Please check Supabase RLS policies allow public inserts on reviews.');
        } else {
          setError(err.message || 'Something went wrong. Please try again.');
        }
        return;
      }
      setSubmitted(true);
      setForm({ name: '', text: '', rating: 0 });
    } catch (err) {
      console.error('Review submit error:', err);
      setError('Network error. Please check your connection and try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="about-page">

      {/* C2: vacation banner — shown when admin enables vacation mode */}
      {settings?.vacation_mode && (
        <div className="vacation-banner">
          {settings.vacation_message || 'We are currently on vacation. Orders will be processed when we return.'}
        </div>
      )}

      {/* ── Hero ──────────────────────────────────────────────────────── */}
      <div className="about-hero">
        <div className="container">
          <p className="section-eyebrow">Our Story</p>
          <h1 className="about-hero__title">Kamili</h1>
          <p className="about-hero__sub">Born in Nairobi. Worn by the World.</p>
        </div>
      </div>

      {/* ── Origin story ──────────────────────────────────────────────── */}
      <section className="section">
        <div className="container about-story">
          <div className="about-story__text reveal">
            <h2 className="about-story__heading">Crafted here.<br />Coveted everywhere.</h2>
            <p>
              Kamili was born from a quiet conviction: that African craftsmanship and vision belong
              at the very top of global luxury. Not as inspiration to be borrowed, but as the
              standard being set. We curate pieces with structured elegance — bags with presence,
              jewellery with intention, watches that measure more than time.
            </p>
            <p style={{ marginTop: 16 }}>
              Every order is fulfilled personally. Every piece is chosen deliberately.
              We don't follow trends — we document a movement.
            </p>
            <div className="about-origin-tag reveal reveal-delay-1">
              <span>✦</span> Nairobi, Kenya — Est. 2024
            </div>
          </div>
          <div className="about-story__image reveal reveal-delay-2">
            <img
              src="https://images.unsplash.com/photo-1705909237050-7a7625b47fac?auto=format&fit=crop&w=800&q=80"
              alt="Black leather bag — structured luxury"
              className="img-cover"
            />
          </div>
        </div>
      </section>

      <div className="divider container" />

      {/* ── Stat facts ────────────────────────────────────────────────── */}
      <section className="section-sm">
        <div className="container">
          <p className="section-eyebrow reveal">African Design, By the Numbers</p>
          <h2 className="section-title reveal" style={{ marginBottom: 48 }}>
            The Numbers Don't Lie
          </h2>
          <div className="about-stats reveal">
            {STATS.map((s) => (
              <div key={s.value} className="about-stat">
                <span className="about-stat__value">{s.value}</span>
                <span className="about-stat__label">{s.label}</span>
                <span className="about-stat__sub">{s.sub}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <div className="divider container" />

      {/* ── The Renaissance editorial ──────────────────────────────────── */}
      <section className="section about-renaissance">
        <div className="container">
          <div className="about-renaissance__inner">
            <div className="about-renaissance__img-col reveal">
              <div className="about-img-placeholder about-img-placeholder--tall">
                <img
                  src="https://plus.unsplash.com/premium_photo-1724862979245-71e659b98366?auto=format&fit=crop&w=800&q=80"
                  alt="Black handbag with gold hardware"
                  className="img-cover"
                />
              </div>
              <div className="about-img-placeholder about-img-placeholder--square reveal reveal-delay-1">
                <img
                  src="https://images.unsplash.com/photo-1708220040828-9ab1673681d3?auto=format&fit=crop&w=600&q=80"
                  alt="Gold earrings — handcrafted jewellery"
                  className="img-cover"
                />
              </div>
            </div>
            <div className="about-renaissance__text reveal reveal-delay-2">
              <p className="section-eyebrow">The Renaissance</p>
              <h2 className="about-renaissance__heading">
                African design is not the future.<br />
                It is the present.
              </h2>
              <p>
                For decades, global fashion houses extracted patterns, textiles, and silhouettes
                from the continent — and sold them back as "exotic inspiration." That era is ending.
              </p>
              <p>
                Today, designers from Lagos, Nairobi, Accra, and Johannesburg are being awarded the
                LVMH Prize, stocked at Selfridges, worn by global icons, and studied at fashion schools
                in Paris and New York. African luxury is no longer emerging. It has arrived.
              </p>
              <p>
                The continent that invented textile dyeing, beadwork as language, and pattern as
                identity is now writing the next chapter of global fashion — on its own terms.
              </p>
              <div className="about-renaissance__quote">
                "When Africa dresses itself, the world takes notes."
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="divider container" />

      {/* ── Brands we celebrate ───────────────────────────────────────── */}
      <section className="section">
        <div className="container">
          <p className="section-eyebrow reveal">The Vanguard</p>
          <h2 className="section-title reveal" style={{ marginBottom: 12 }}>
            Brands We Celebrate
          </h2>
          <p className="about-brands-intro reveal">
            These are the names reshaping what African luxury means — from Johannesburg studios
            to London runways to Nairobi storefronts.
          </p>
          <div className="about-brands-grid">
            {BRANDS.map((b) => (
              <div key={b.name} className="about-brand-card reveal">
                <div className="about-brand-card__tag">{b.tag}</div>
                <h3 className="about-brand-card__name">{b.name}</h3>
                <p className="about-brand-card__origin">{b.origin}</p>
                <p className="about-brand-card__note">{b.note}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <div className="divider container" />

      {/* ── Collection Spotlights ─────────────────────────────────────────── */}
      <section className="section about-collections">
        <div className="container">
          <p className="section-eyebrow reveal">What We Carry</p>
          <h2 className="section-title reveal" style={{ marginBottom: 56 }}>The Edit</h2>
          {COLLECTIONS.map((col, i) => (
            <div key={col.label} className={`about-coll reveal${col.align === 'right' ? ' about-coll--reverse' : ''}`}>
              <div className="about-coll__img-wrap">
                <img src={col.img} alt={col.label} className="img-cover about-coll__img" />
                <div className="about-coll__img-tag">{col.tag}</div>
              </div>
              <div className="about-coll__text">
                <span className="about-coll__num">0{i + 1}</span>
                <h3 className="about-coll__label">{col.label}</h3>
                <p className="about-coll__headline">{col.headline}</p>
                <p className="about-coll__body">{col.body}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <div className="divider container" />

      {/* ── The Future ────────────────────────────────────────────────── */}
      <section className="section about-future">
        <div className="container">
          <div className="about-future__inner">
            <div className="about-future__text reveal">
              <p className="section-eyebrow">Looking Forward</p>
              <h2 className="about-future__heading">The Next Chapter</h2>
              <p>
                By 2050, Africa will be home to 40% of the world's youth population. That is not
                a demographic statistic — it is a creative force. A generation raised between
                tradition and technology, fluent in both Swahili and streetwear, is already
                designing, building, and buying differently.
              </p>
              <p>
                African fashion weeks in Lagos, Nairobi, Kigali, and Cape Town are no longer
                regional showcases — they set global conversations. African designers are not
                waiting to be discovered. They are building their own distribution, their own
                platforms, their own standards of excellence.
              </p>
              <p>
                Kamili exists at that intersection. We are a window into what African luxury
                looks like when it refuses to compromise. Clean lines, intentional craft,
                cultural memory — and a quiet confidence that needs no validation.
              </p>
              <div className="about-future__pillars">
                {['Craft', 'Identity', 'Intention', 'Legacy'].map((p) => (
                  <div key={p} className="about-future__pill">{p}</div>
                ))}
              </div>
            </div>
            <div className="about-future__img-col reveal reveal-delay-2">
              <div className="about-img-placeholder about-img-placeholder--wide">
                <img
                  src="https://images.unsplash.com/photo-1559563458-527698bf5295?auto=format&fit=crop&w=800&q=80"
                  alt="Leather bag and watch — curated accessories"
                  className="img-cover"
                />
              </div>
              <div className="about-future__fact">
                <span className="about-future__fact-num">40%</span>
                <span className="about-future__fact-label">
                  of the world's youth will be African by 2050 — the largest creative generation in history
                </span>
              </div>
              <div className="about-future__fact about-future__fact--gold reveal reveal-delay-3">
                <span className="about-future__fact-num">9%</span>
                <span className="about-future__fact-label">
                  annual growth rate of the African luxury goods market — outpacing Europe and North America
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="divider container" />

      {/* ── Find Us / Store Details ────────────────────────────────────── */}
      {settings && (settings.whatsapp || settings.phone || settings.email || settings.instagram || settings.location || settings.hours) && (
        <section className="section-sm">
          <div className="container">
            <p className="section-eyebrow reveal">Get In Touch</p>
            <h2 className="section-title reveal" style={{ marginBottom: 40 }}>Find Us</h2>
            {settings.tagline && (
              <p className="about-settings__tagline reveal">{settings.tagline}</p>
            )}
            <div className="about-settings-grid reveal">
              {settings.whatsapp && (
                <a className="about-settings-card about-settings-card--wa"
                  href={`https://wa.me/${settings.whatsapp.replace(/^0/, '254').replace(/\D/g,'')}`}
                  target="_blank" rel="noopener noreferrer">
                  <svg className="about-settings-card__icon" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413z"/>
                  </svg>
                  <div>
                    <span className="about-settings-card__label">WhatsApp</span>
                    <span className="about-settings-card__value">{settings.whatsapp}</span>
                  </div>
                </a>
              )}
              {settings.phone && (
                <a className="about-settings-card" href={`tel:${settings.phone.replace(/\s/g,'')}`}>
                  <span className="about-settings-card__icon about-settings-card__icon--text">✆</span>
                  <div>
                    <span className="about-settings-card__label">Call Us</span>
                    <span className="about-settings-card__value">{settings.phone}</span>
                  </div>
                </a>
              )}
              {settings.email && (
                <a className="about-settings-card" href={`mailto:${settings.email}`}>
                  <span className="about-settings-card__icon about-settings-card__icon--text">✉</span>
                  <div>
                    <span className="about-settings-card__label">Email</span>
                    <span className="about-settings-card__value">{settings.email}</span>
                  </div>
                </a>
              )}
              {settings.instagram && (
                <a className="about-settings-card about-settings-card--ig"
                  href={`https://instagram.com/${settings.instagram.replace(/^@/,'')}`}
                  target="_blank" rel="noopener noreferrer">
                  <svg className="about-settings-card__icon" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
                  </svg>
                  <div>
                    <span className="about-settings-card__label">Instagram</span>
                    <span className="about-settings-card__value">{settings.instagram}</span>
                  </div>
                </a>
              )}
              {settings.location && (
                <div className="about-settings-card">
                  <span className="about-settings-card__icon about-settings-card__icon--text">⌖</span>
                  <div>
                    <span className="about-settings-card__label">Location</span>
                    <span className="about-settings-card__value">{settings.location}</span>
                  </div>
                </div>
              )}
              {settings.hours && (
                <div className="about-settings-card">
                  <span className="about-settings-card__icon about-settings-card__icon--text">◷</span>
                  <div>
                    <span className="about-settings-card__label">Hours</span>
                    <span className="about-settings-card__value">{settings.hours}</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>
      )}

      <div className="divider container" />

      {/* ── Pull quote ────────────────────────────────────────────────── */}
      <section className="section-sm about-pullquote reveal">
        <div className="container">
          <blockquote className="about-bq">
            <p>"The continent that gave the world its first art, its first music, its first language
            of adornment — is now giving it the next era of luxury."</p>
            <cite>— Kamili, Nairobi</cite>
          </blockquote>
        </div>
      </section>

      <div className="divider container" />

      {/* ── Reviews carousel ──────────────────────────────────────────── */}
      {reviews.length > 0 && (
        <section className="section-sm">
          <div className="container">
            <p className="section-eyebrow" style={{ marginBottom: 8 }}>What They Say</p>
            <h2 className="section-title" style={{ marginBottom: 32 }}>Client Stories</h2>
          </div>
          <div className="reviews-carousel">
            <div className="reviews-track">
              {[...reviews, ...reviews].map((r, i) => (
                <ReviewCard key={`${r.id}-${i}`} review={r} />
              ))}
            </div>
          </div>
        </section>
      )}

      <div className="divider container" />

      {/* ── Review form ───────────────────────────────────────────────── */}
      <section className="section">
        <div className="container about-review-form-wrap">
          <div>
            <p className="section-eyebrow">Share Your Experience</p>
            <h2 className="section-title" style={{ marginBottom: 8 }}>Leave a Review</h2>
            <p style={{ color: 'var(--muted)', fontSize: 14, marginBottom: 32 }}>
              Your review will appear after approval. We appreciate your honesty.
            </p>

            {submitted ? (
              <div className="review-success">
                <p>✦ Thank you! Your review has been submitted.</p>
                <p style={{ fontSize: 13, color: 'var(--muted)', marginTop: 6 }}>
                  Verified buyers are published instantly. Others appear after a quick approval.
                </p>
              </div>
            ) : (
              <form className="review-form" onSubmit={handleSubmit}>
                <div className="form-group">
                  <label className="form-label">Your Name (optional)</label>
                  <input
                    type="text"
                    value={form.name}
                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                    placeholder="e.g. Amina W."
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">
                    Phone Number
                    <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0, color: 'var(--muted2)', fontSize: 12, marginLeft: 6 }}>
                      optional — verified buyers are published instantly
                    </span>
                  </label>
                  <input
                    type="tel"
                    value={form.phone}
                    onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                    placeholder="e.g. 0712 345 678"
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Rating</label>
                  <StarInput value={form.rating} onChange={(v) => setForm((f) => ({ ...f, rating: v }))} />
                </div>
                <div className="form-group">
                  <label className="form-label">Your Review</label>
                  <textarea
                    rows={5}
                    value={form.text}
                    onChange={(e) => setForm((f) => ({ ...f, text: e.target.value }))}
                    placeholder="Tell us about your experience…"
                  />
                </div>
                {error && <p className="form-error">{error}</p>}
                <button type="submit" className="btn btn-gold" disabled={submitting}>
                  {submitting ? 'Submitting…' : 'Submit Review'}
                </button>
              </form>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
