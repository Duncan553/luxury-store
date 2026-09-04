import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import CategoryDeck from '../components/CategoryDeck';
// Imported, not fetched — see the note in Home.jsx.
import aboutSm    from '../assets/editorial/about-440.jpg';
import aboutLg    from '../assets/editorial/about-800.jpg';
import plateSm    from '../assets/editorial/bag-watch-520.jpg';
import plateLg    from '../assets/editorial/bag-watch-1040.jpg';
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

/* ── Category blurbs ───────────────────────────────────────────────
   Keyed by slug, with a fallback, because the category list itself comes
   from the database — the owner can add a category in admin and it has to
   appear here without a code change. An unknown slug gets the fallback
   rather than nothing, so a new category never renders a broken card.

   Written as what-it-is plus what-it's-for, not pure atmosphere. The
   research on this is that benefit-only copy is its own failure mode: it
   reads as marketing noise and starves the shopper who is trying to
   compare. So each line names the actual shapes stocked AND the reason
   you'd reach for one. */
const BLURBS = {
  bags:       'Totes, satchels, crossbodies and backpacks — from an everyday work bag to something small for an evening out.',
  jewelry:    'Chains, rings, bangles and earrings — light enough to wear every day, or the piece people actually notice.',
  watches:    'Dress watches, chronographs and everyday steel — the one thing people read you by, and the only way to check the time without reaching for your phone.',
  sunglasses: 'Aviators, wayfarers, cat-eye and round frames. Nairobi sun is not gentle; these handle it without looking like safety gear.',
};
const FALLBACK_BLURB = 'Browse what we currently have in this category.';

/* ── Main component ───────────────────────────────────────────────── */
export default function About() {
  const [reviews,  setReviews]  = useState([]);
  // Categories drive the grid below, so a category added in admin shows up
  // here on its own. Counts are fetched alongside for the live piece count.
  const [categories, setCategories] = useState([]);
  const [counts,     setCounts]     = useState({});
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

    supabase
      .from('categories')
      .select('id, name, slug, cover_url')
      .order('created_at')
      .then(({ data }) => { if (data) setCategories(data); });

    // Only the category column comes back — enough to count, small enough
    // not to matter on a phone connection.
    supabase
      .from('products')
      .select('category')
      .then(({ data }) => {
        if (!data) return;
        const byCat = {};
        data.forEach((p) => {
          const slug = (p.category || '').toLowerCase().replace(/\s+/g, '-');
          byCat[slug] = (byCat[slug] || 0) + 1;
        });
        setCounts(byCat);
      });
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
      {/* Cover head, not a page banner. A print cover carries three things
          in this order: the section it belongs to, the masthead at a scale
          nothing else on the page gets, and a standfirst. It was a small
          eyebrow, an italic 96px word and an uppercase line — the parts were
          right, the hierarchy wasn't. */}
      <div className="about-hero">
        <div className="container about-hero__inner reveal-stagger visible">
          <span className="ed-kicker">Our story</span>
          <h1 className="about-hero__title">Kamili</h1>
          <p className="about-hero__sub">
            Bags, jewellery &amp; watches — ordered on WhatsApp.
          </p>
        </div>
      </div>

      {/* ── Origin story ──────────────────────────────────────────────── */}
      <section className="section">
        {/* Editorial layout, built on how a magazine spread actually works:
            an ASYMMETRIC grid rather than two equal halves (the 50/50 split
            gave both the text and the photo the same weight, so neither led);
            a controlled MEASURE so lines stay near 65 characters instead of
            running the full column; a DROP CAP to mark the entry point; and
            white space used as structure rather than as leftover padding.

            The photo is deliberately narrower than the text column and
            offset downward — in a spread the image supports the copy, it
            doesn't mirror it. On a phone this all collapses to one column
            with the image first, because a 390px screen has no room for
            asymmetry and the picture is the better opening. */}
        <div className="container aed">
          {/* No layered word over this figure. The layered-type device is
              carried by the wide plate further down (and by the hero on the
              landing page); repeating it here put a second oversized word
              directly above the headline, which left the opening with two
              things competing to be read first. */}
          <figure className="aed__fig reveal reveal-delay-2">
            {/* Served from our own storage, already graded to the same mono
                as the hero plate and the category covers, rather than a
                colour file greyscaled in the browser — one grade, one
                publication. Two widths so a phone fetches 13KB, not 38. */}
            <img
              src={aboutLg}
              srcSet={`${aboutSm} 440w, ${aboutLg} 800w`}
              sizes="(max-width: 859px) 92vw, 38vw"
              alt="A black leather tote held by its handles"
              width="800" height="1000"
              loading="lazy"
            />
            <figcaption className="aed__cap">Nairobi, Kenya — est. 2024</figcaption>
          </figure>

          {/* Opens the way a print feature opens: kicker over a hairline
              rule, headline, a standfirst carrying the story in two lines,
              then the body in columns with a drop cap marking where to
              start. reveal-stagger brings the parts in one after another
              instead of the block landing all at once. */}
          <div className="aed__col reveal reveal-stagger">
            <span className="ed-kicker">Who we are</span>
            <h2 className="aed__h">Bags, jewellery<br />&amp; watches.</h2>
            <p className="ed-standfirst">
              A shop in Nairobi selling bags, jewellery and watches. We buy
              stock in and sell it on — we're not the manufacturer.
            </p>
            <div className="ed-columns">
              <p className="ed-dropcap">
                Orders happen on WhatsApp. Send us what you want and we'll
                reply with the delivery cost for your area before you pay
                anything. If you want more photos of a piece first, just ask.
              </p>
              <p>
                We deliver from Nairobi to anywhere in Kenya. Wherever you are
                in the country, the cost of getting it to you is quoted before
                you pay — never after.
              </p>
            </div>
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

      {/* A second plate, landscape, breaking the column — a magazine drops a
          full-width image between sections to reset the eye rather than
          running text unbroken down the page.

          It's a different crop of the same shoot as the hero, so it reads
          as the next plate in one story instead of a new stock photo: bag,
          watch and hands in one frame, black and white, and no face. */}
      <section className="section-sm">
        <div className="container">
          <figure className="about-plate reveal">
            {/* Solid word over the plate, crossing it — the counterpart to
                the outlined one behind the figure above. */}
            <span className="about-plate__word" aria-hidden="true">Kamili</span>
            <img
              src={plateLg}
              srcSet={`${plateSm} 520w, ${plateLg} 1040w`}
              sizes="(max-width: 900px) 94vw, 1040px"
              alt="A hand resting on a black leather handbag, wearing a steel watch"
              width="1040" height="780"
              loading="lazy"
            />
            <figcaption className="about-plate__cap">
              Bags, watches and jewellery — one order, one conversation.
            </figcaption>
          </figure>
        </div>
      </section>

      <div className="divider container" />

      {/* ── How ordering actually works ─────────────────────────────────
          Three real operational facts, in the order a customer meets them.
          This replaces nothing — it fills a gap: the site sold pieces but
          never explained the process, and "how does this work / how much is
          delivery / can I get more than one" are the questions that stop a
          first-time buyer.

          Written as process, not persuasion, on purpose. Consumers run a
          background audit on anything that reads as a sales pitch
          (Friestad & Wright's persuasion-knowledge model) and discount it —
          the more a page pushes, the less each claim is worth. Answering
          the question is what earns trust; "we're the best" spends it.

          Numbered 01/02/03 because this genuinely IS a sequence — you
          browse, then you message, then it's delivered. Numbering anything
          that isn't ordered would be decoration. */}
      <section className="section-sm">
        <div className="container">
          <span className="ed-kicker reveal">Before you order</span>
          <h2 className="section-title reveal ed-display" style={{ marginBottom: 44 }}>How It Works</h2>
          <div className="about-how reveal reveal-stagger">
            {[
              {
                n: '01',
                h: 'Pick, then ask',
                b: 'Add what you want to the cart and send it to us on WhatsApp. Nothing is charged yet. Ask for more photos of the exact piece if you want them.',
              },
              {
                n: '02',
                h: 'Delivery costs extra',
                b: 'Prices on this site cover the item only. Delivery is added on top and depends on your area — we send you the exact amount on WhatsApp before you pay.',
              },
              {
                n: '03',
                h: 'Anywhere in Kenya',
                b: 'Nairobi deliveries are arranged directly. Everywhere else in the country goes by courier, with tracking details once it ships. Tell us your address and we\'ll quote it.',
              },
            ].map((step) => (
              <div key={step.n} className="about-how__item">
                {/* The numeral sits BEHIND the heading as an outlined folio
                    figure rather than beside it as a small label — print
                    uses the number as texture marking the sequence, not as
                    a caption competing with the heading. */}
                <span className="ed-numeral" aria-hidden="true">{step.n}</span>
                <h3 className="about-how__h">{step.h}</h3>
                <p className="about-how__b">{step.b}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <div className="divider container" />

      {/* ── Bulk & resale orders ────────────────────────────────────────
          A shop that sells through WhatsApp is already set up for the one
          conversation retail sites handle worst: "I want twelve of these."
          Nothing on the site told a reseller, a gifting buyer or an event
          organiser that this was even possible, so those orders simply
          didn't get asked for.

          No price list and no "save up to X%" — the owner sets bulk pricing
          per deal, and inventing a discount figure here would either
          undercut them or become a promise they have to break. The link
          pre-fills the enquiry instead: the customer's side of a bulk
          conversation is the hard part, so the message writes itself. */}
      <section className="section-sm">
        <div className="container">
          <div className="about-bulk reveal">
            <div className="about-bulk__text reveal-stagger visible">
              <span className="ed-kicker">Buying more than one</span>
              <h2 className="about-bulk__title ed-display">Bulk &amp; resale orders</h2>
              <p className="about-bulk__body">
                Stocking a shop, buying for a group, or sorting gifts for an
                event? Tell us the pieces and the quantity and we'll quote you
                directly — bulk pricing depends on the item and how many you
                need, so it's a conversation rather than a fixed list.
              </p>
              <ul className="about-bulk__list">
                <li>Mixed orders are fine — bags, watches and jewellery on one invoice.</li>
                <li>We'll confirm what's in stock and what needs to be sourced, with a realistic date.</li>
                <li>Delivery anywhere in Kenya, quoted per order.</li>
              </ul>
              {settings?.whatsapp && (
                <a
                  className="btn btn-whatsapp about-bulk__cta"
                  href={`https://wa.me/${settings.whatsapp.replace(/^0/, '254').replace(/\D/g, '')}?text=${encodeURIComponent(
                    "Hi Kamili — I'd like a bulk quote.\n\nItems:\nQuantity:\nDelivery area:"
                  )}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Ask for a bulk quote
                </a>
              )}
            </div>
          </div>
        </div>
      </section>

      <div className="divider container" />

      {/* ── Categories ────────────────────────────────────────────────
          Was two enormous alternating image/text blocks — half-width
          images at 4:5, so roughly 570x710px each on desktop, covering
          only 2 of the 4 categories and leaving Bags and Sunglasses out
          entirely. Nothing about it was arranged: the two images were
          different subjects at different crops, and the section grew a
          hole every time a category was added.

          Now: one card per category, every card identical — same poster
          ratio, same crop, same label position — driven by the categories
          table, so adding a category in admin adds a card here with no
          code change.

          Mobile first, because that's where nearly all of this traffic
          lands: two columns on a phone (Baymard's finding is that a
          desktop tile grid should reflow to two on mobile, and that a
          category image has to be recognisable at thumbnail size), four
          across from tablet up. */}
      <section className="section about-cats">
        <div className="container">
          <span className="ed-kicker reveal">What we carry</span>
          <h2 className="section-title reveal ed-display" style={{ marginBottom: 40 }}>Categories</h2>
          {/* Coverflow deck rather than a static grid: the active category
              is front and centre, the others fan back in 3D, and it moves
              on its own. Blurbs are attached to each category here so the
              deck stays a presentation component with no knowledge of
              Kamili's copy. */}
          <CategoryDeck
            categories={categories.map((c) => ({ ...c, blurb: BLURBS[c.slug] || FALLBACK_BLURB }))}
            counts={counts}
          />
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
