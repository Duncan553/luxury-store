// CategoryDeck.jsx — the category browser, built as a coverflow deck.
//
// Shape of it: the active category sits front and centre at full size, the
// ones either side recede — scaled down, rotated back in 3D, dimmed — and
// the deck advances on its own. Clicking a side card brings it forward;
// clicking the front card opens that category.
//
// Two things this has to get right that a plain grid didn't:
//
// 1. IT MOVES ON ITS OWN. The deck advances every AUTO_MS so a visitor who
//    touches nothing still sees every category. It stops permanently the
//    moment the visitor takes over (click, swipe, arrow key) — an autoplay
//    that fights the person using it is worse than no autoplay — and never
//    starts at all under prefers-reduced-motion.
//
// 2. IT COSTS ALMOST NOTHING ON A PHONE. Covers ship at two widths and the
//    browser downloads exactly one: ~13-27KB at 380w for a phone, the 760w
//    file only where the card is actually rendered that big. `sizes` tells
//    it which before layout, so there's no double fetch.
//
// One honest tradeoff worth knowing: research on carousels is that content
// past the first slide gets seen far less than content in a grid. That's
// mitigated here — the dots show how many categories there are, the deck
// moves by itself, and the side cards are visible rather than hidden — but
// the full list also still lives in the nav and on the homepage, which is
// what stops this being the only route in.
import { useEffect, useRef, useState, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useReducedMotion } from 'framer-motion';
import './CategoryDeck.css';

const AUTO_MS = 4000;

// Build a srcset from the stored cover URL. The uploader writes
// <slug>-cover.jpg alongside <slug>-cover-380.jpg and -760.jpg, so the
// variants are derivable — but only when they actually exist, hence the
// guard: an older cover with no variants falls back to the single file
// rather than requesting URLs that 404.
function coverSrcSet(url) {
  if (!url || !url.includes('-cover.jpg')) return null;
  const base = url.replace('-cover.jpg', '-cover');
  return `${base}-380.jpg 380w, ${base}-760.jpg 760w`;
}

export default function CategoryDeck({ categories = [], counts = {} }) {
  const [active, setActive] = useState(0);
  // Once the visitor drives, autoplay is done for the session.
  const [userTook, setUserTook] = useState(false);
  const reduce = useReducedMotion();
  const navigate = useNavigate();
  const touchX = useRef(null);

  const n = categories.length;

  const go = useCallback((i) => {
    if (!n) return;
    // Wrap both ways so the deck is a loop, not a dead end at either edge.
    setActive(((i % n) + n) % n);
  }, [n]);

  const take = useCallback((i) => { setUserTook(true); go(i); }, [go]);

  useEffect(() => {
    if (reduce || userTook || n < 2) return;
    const t = setInterval(() => setActive((a) => (a + 1) % n), AUTO_MS);
    return () => clearInterval(t);
  }, [reduce, userTook, n]);

  if (!n) return null;

  function onKey(e) {
    if (e.key === 'ArrowLeft')  { e.preventDefault(); take(active - 1); }
    if (e.key === 'ArrowRight') { e.preventDefault(); take(active + 1); }
  }

  // Swipe: the only way this is usable one-handed on a phone.
  function onTouchStart(e) { touchX.current = e.touches[0].clientX; }
  function onTouchEnd(e) {
    if (touchX.current == null) return;
    const dx = e.changedTouches[0].clientX - touchX.current;
    if (Math.abs(dx) > 40) take(active + (dx < 0 ? 1 : -1));
    touchX.current = null;
  }

  return (
    <div
      className="deck"
      role="group"
      aria-roledescription="carousel"
      aria-label="Product categories"
      onKeyDown={onKey}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
      tabIndex={0}
    >
      <div className="deck__stage">
        {categories.map((c, i) => {
          // Signed distance from the active card, wrapped so the deck looks
          // continuous rather than snapping when it passes the last item.
          let d = i - active;
          if (d >  n / 2) d -= n;
          if (d < -n / 2) d += n;
          const far = Math.abs(d) > 2;          // beyond the visible fan
          const isActive = d === 0;
          const srcSet = coverSrcSet(c.cover_url);

          return (
            <div
              key={c.id ?? c.slug}
              className={`deck__card${isActive ? ' is-active' : ''}`}
              // One custom property drives translate, rotate, scale, dim and
              // z-index in CSS, so the whole fan is described by distance
              // alone and no per-card style branching is needed here.
              style={{ '--d': d, zIndex: 20 - Math.abs(d), pointerEvents: far ? 'none' : 'auto' }}
              aria-hidden={far ? 'true' : undefined}
            >
              {isActive ? (
                // The front card is a real link — it's the one you can open.
                <Link to={`/category/${c.slug}`} className="deck__hit" aria-label={`Shop ${c.name}`}>
                  {c.cover_url
                    ? <img
                        className="deck__img"
                        src={c.cover_url}
                        {...(srcSet ? { srcSet, sizes: '(max-width: 719px) 62vw, 300px' } : {})}
                        alt={c.name}
                        width="760" height="1013"
                      />
                    : <div className="deck__ph" />}
                </Link>
              ) : (
                // Side cards bring themselves forward instead of navigating:
                // tapping a half-hidden, rotated card to buy something is a
                // mis-tap waiting to happen.
                <button
                  type="button"
                  className="deck__hit"
                  onClick={() => take(i)}
                  aria-label={`Show ${c.name}`}
                >
                  {c.cover_url
                    ? <img
                        className="deck__img"
                        src={c.cover_url}
                        {...(srcSet ? { srcSet, sizes: '(max-width: 719px) 46vw, 230px' } : {})}
                        alt=""
                        loading="lazy"
                        width="760" height="1013"
                      />
                    : <div className="deck__ph" />}
                </button>
              )}

              <div className="deck__meta">
                <span className="deck__name">{c.name}</span>
                <span className="deck__count">
                  {counts[c.slug] ?? 0} {counts[c.slug] === 1 ? 'piece' : 'pieces'}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      <div className="deck__controls">
        <button type="button" className="deck__arrow" onClick={() => take(active - 1)} aria-label="Previous category">‹</button>

        {/* Dots double as the answer to "how many categories are there" —
            the thing a carousel otherwise hides. */}
        <div className="deck__dots">
          {categories.map((c, i) => (
            <button
              key={c.id ?? c.slug}
              type="button"
              className={`deck__dot${i === active ? ' is-on' : ''}`}
              onClick={() => take(i)}
              aria-label={c.name}
              aria-current={i === active ? 'true' : undefined}
            />
          ))}
        </div>

        <button type="button" className="deck__arrow" onClick={() => take(active + 1)} aria-label="Next category">›</button>
      </div>

      {/* The blurb sits outside the stage so changing it can't resize a card
          — the bug the grid version had, where a longer line squashed its
          own image. */}
      <p className="deck__blurb" key={categories[active].slug}>
        {categories[active].blurb}
      </p>

      <Link to={`/category/${categories[active].slug}`} className="deck__cta">
        Shop {categories[active].name} <span aria-hidden="true">→</span>
      </Link>
    </div>
  );
}
