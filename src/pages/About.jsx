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

/* ── Collection spotlights ─────────────────────────────────────────── */
// Matches the real categories in the products table (Bags, Jewelry,
// Watches) — an earlier version had a fourth "Accessories" card
// (scarves/belts/sunglasses) describing a product line that was never
// actually in the catalogue. Removed rather than reworded, same as the
// craftsmanship-narrative copy below: don't describe what isn't real.
const COLLECTIONS = [
  {
    label: 'Watches',
    headline: 'Time, on your wrist.',
    body: 'Sourced pieces, checked before they ship. Message us on WhatsApp for photos of the specific unit before you commit.',
    img: 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=900&q=80',
    tag: 'Watches',
    align: 'right',
  },
  {
    label: 'Jewellery',
    headline: 'Pieces worth wearing daily.',
    body: 'Rings, bangles, pendants — bought in, sold on. We tell you what we know about each piece; we don\'t pretend to have made it.',
    img: 'https://images.unsplash.com/photo-1515562141207-7a88fb7ce338?w=900&q=80',
    tag: 'Jewellery',
    align: 'left',
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
    title: 'About Kamili — Bags, Jewellery & Watches from Nairobi',
    description: 'Kamili sells bags, jewellery and watches from Nairobi. Read customer reviews, find our contact details and opening hours.',
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
          <p className="about-hero__sub">Bags, jewellery &amp; watches — ordered on WhatsApp, delivered across Kenya.</p>
        </div>
      </div>

      {/* ── Origin story ──────────────────────────────────────────────── */}
      <section className="section">
        <div className="container about-story">
          <div className="about-story__text reveal">
            <h2 className="about-story__heading">Sourced smart.<br />Sold straight.</h2>
            <p>
              Kamili sells bags, jewellery and watches out of Nairobi. We don't make
              what we sell, and we don't pretend to — the value is in sourcing real
              pieces and being straightforward about what you're buying, before you
              buy it.
            </p>
            <p style={{ marginTop: 16 }}>
              Every order goes through a real person on WhatsApp, not a form. Ask
              questions before you pay — that's the whole model.
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

      {/* Cut: three sections that stood here — "African Design, By the
          Numbers" ($31B / 3,000+ / 54 / 2050 with no source), "The
          Renaissance" (an unattributed pull-quote styled as if it were a
          real, citable statement), and "Brands We Celebrate" (Maxhosa
          Africa, Thebe Magugu, Christie Brown, Rich Mnisi etc., with
          specific claims — LVMH Prize, stocked at Selfridges, worn by
          Beyoncé — presented as Kamili's own assortment). None of it was
          verifiable, the named brands don't match what's actually in the
          products table, and a business claiming things it can't back up
          is a liability, not a trust signal. Replace only with real
          content — designers Kamili actually stocks, sourced from the
          catalogue — never with another invented paragraph. */}

      <div className="divider container" />

      {/* ── Collection Spotlights ─────────────────────────────────────────── */}
      <section className="section about-collections">
        <div className="container">
          <p className="section-eyebrow reveal">What We Carry</p>
          <h2 className="section-title reveal" style={{ marginBottom: 56 }}>The Edit</h2>
          {COLLECTIONS.map((col) => (
            <div key={col.label} className={`about-coll reveal${col.align === 'right' ? ' about-coll--reverse' : ''}`}>
              <div className="about-coll__img-wrap">
                <img src={col.img} alt={col.label} className="img-cover about-coll__img" />
                <div className="about-coll__img-tag">{col.tag}</div>
              </div>
              {/* No "01 / 02" marker here either — these are product
                  categories, not an ordered sequence, so numbering them
                  encoded nothing. */}
              <div className="about-coll__text">
                <h3 className="about-coll__label">{col.label}</h3>
                <p className="about-coll__headline">{col.headline}</p>
                <p className="about-coll__body">{col.body}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Cut: "The Next Chapter" — built entirely on unsourced numbers
          (40% of world youth by 2050, 9% market growth rate) presented as
          fact with no citation. Same call as the sections above. */}

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

      {/* Cut: a self-attributed pull-quote ("— Kamili, Nairobi") making the
          same kind of sweeping, unsourced claim as the sections above,
          styled with <blockquote>/<cite> to read as if it carried outside
          authority. If Kamili wants a real quote here later, it should be
          an actual quote — from a review, a press mention, the owner
          speaking in their own voice — not one written to sound like one. */}

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
