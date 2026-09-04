// CategoryDeck.jsx — the category browser.
//
// Rebuilt as a NATIVE SCROLLER with snap points, which is how Netflix and
// Spotify actually build these. The previous version moved the cards with
// JS transforms only, and that is why it never felt like theirs no matter
// how the easing was tuned: a JS-driven track cannot reproduce the
// operating system's own momentum. A flick on a phone should coast and
// decelerate exactly like every other scrollable thing on the device, and
// the only way to get that is to let the browser do the scrolling.
//
// The shape:
//   * the stage is overflow-x: auto with scroll-snap-type: x mandatory
//   * touch is NOT intercepted at all — native inertia handles it, which
//     is the whole point
//   * mouse drag is JS, with snapping switched off mid-drag so the track
//     follows the cursor freely and only snaps on release. Leaving snap on
//     while dragging is what causes the "slideshow" jerk
//   * the centred card is derived from scrollLeft and lifted, the way a
//     Spotify shelf raises the item you're on
//
// Autoplay uses scrollTo({behavior:'smooth'}) so even the automatic
// movement is the browser's own scrolling, not a second animation system
// running alongside it and fighting for the same pixels.
import { useEffect, useRef, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useReducedMotion } from 'framer-motion';
import './CategoryDeck.css';

const AUTO_MS   = 4200;
const RESUME_MS = 9000;

// Build a srcset from the stored cover URL. The uploader writes
// <slug>-cover.jpg alongside -380.jpg and -760.jpg, so the variants are
// derivable — but only when they exist, hence the guard: an older cover
// with no variants falls back to the single file rather than 404ing.
function coverSrcSet(url) {
  // Matches whatever extension the cover was stored with. This used to be
  // hardcoded to '.jpg', so the moment the covers became .webp it silently
  // returned null and every card fetched the full-size file instead of the
  // 380w one — a regression with no error to notice.
  const m = url && url.match(/^(.*-cover)\.(jpg|jpeg|webp|png)$/i);
  if (!m) return null;
  const [, base, ext] = m;
  return `${base}-380.${ext} 380w, ${base}-760.${ext} 760w`;
}

export default function CategoryDeck({ categories = [], counts = {} }) {
  const [active, setActive]     = useState(0);
  const [userTook, setUserTook] = useState(false);
  const reduce = useReducedMotion();
  const stage  = useRef(null);
  const cards  = useRef([]);
  const raf    = useRef(0);
  // Mouse-drag bookkeeping. Touch never reaches any of this.
  const drag   = useRef({ on: false, startX: 0, startScroll: 0, moved: false });

  const n = categories.length;

  // Which card is nearest the centre of the stage?
  const nearest = useCallback(() => {
    const box = stage.current;
    if (!box) return 0;
    const mid = box.scrollLeft + box.clientWidth / 2;
    let best = 0, bestD = Infinity;
    cards.current.forEach((el, i) => {
      if (!el) return;
      const d = Math.abs(el.offsetLeft + el.offsetWidth / 2 - mid);
      if (d < bestD) { bestD = d; best = i; }
    });
    return best;
  }, []);

  // Bring a card to the centre using the browser's own smooth scroll.
  const centreOn = useCallback((i, smooth = true) => {
    const el = cards.current[i];
    const box = stage.current;
    if (!el || !box) return;
    box.scrollTo({
      left: el.offsetLeft - (box.clientWidth - el.offsetWidth) / 2,
      behavior: smooth && !reduce ? 'smooth' : 'auto',
    });
  }, [reduce]);

  // Active state is READ from scroll position rather than tracked
  // separately, so a native flick, a mouse drag and autoplay all resolve
  // the same way and can't disagree.
  function onScroll() {
    // One measurement per frame. Scroll fires far more often than the
    // screen refreshes, and measuring every card on every event is how a
    // scroll handler ends up costing more than the scrolling does.
    cancelAnimationFrame(raf.current);
    raf.current = requestAnimationFrame(() => setActive(nearest()));
  }

  useEffect(() => () => cancelAnimationFrame(raf.current), []);

  // Autoplay, always on: it used to stop dead under reduced-motion, which
  // meant the deck looked broken on any machine with that setting. Motion
  // is respected by scrolling instantly rather than smoothly (see centreOn)
  // — the setting asks for less movement, not for nothing to happen.
  useEffect(() => {
    if (userTook || n < 2) return;
    const t = setInterval(() => {
      setActive((a) => {
        const next = (a + 1) % n;
        centreOn(next);
        return next;
      });
    }, AUTO_MS);
    return () => clearInterval(t);
  }, [userTook, n, centreOn]);

  // Taking over pauses autoplay rather than ending it, so the deck never
  // stays parked because someone swiped once.
  useEffect(() => {
    if (!userTook) return;
    const t = setTimeout(() => setUserTook(false), RESUME_MS);
    return () => clearTimeout(t);
  }, [userTook, active]);

  if (!n) return null;

  // ── Mouse drag ──────────────────────────────────────────────────────
  // Touch is deliberately excluded. Intercepting it would swap the OS's
  // momentum for a JS approximation, which is exactly the problem this
  // rewrite exists to fix.
  function onPointerDown(e) {
    if (e.pointerType === 'touch' || e.button !== 0) return;
    const box = stage.current;
    drag.current = { on: true, startX: e.clientX, startScroll: box.scrollLeft, moved: false };
  }

  function onPointerMove(e) {
    const d = drag.current;
    if (!d.on) return;
    const dx = e.clientX - d.startX;
    if (!d.moved) {
      // A few px of drift is still a click, not a drag.
      if (Math.abs(dx) < 6) return;
      d.moved = true;
      setUserTook(true);
      // Snap off, so the track follows the cursor instead of fighting it.
      stage.current.classList.add('is-dragging');
      stage.current.setPointerCapture?.(e.pointerId);
    }
    stage.current.scrollLeft = d.startScroll - dx;
  }

  function onPointerUp() {
    const d = drag.current;
    if (!d.on) return;
    d.on = false;
    const box = stage.current;
    box.classList.remove('is-dragging');
    // Snap is back on; land on whatever is nearest now.
    if (d.moved) requestAnimationFrame(() => centreOn(nearest()));
  }

  // The click that fires at the end of a drag must not navigate.
  function onClickCapture(e) {
    if (drag.current.moved) {
      e.preventDefault();
      e.stopPropagation();
      drag.current.moved = false;
    }
  }

  function onKey(e) {
    if (e.key === 'ArrowLeft')  { e.preventDefault(); setUserTook(true); centreOn(Math.max(0, active - 1)); }
    if (e.key === 'ArrowRight') { e.preventDefault(); setUserTook(true); centreOn(Math.min(n - 1, active + 1)); }
  }

  return (
    <div className="deck" role="group" aria-roledescription="carousel" aria-label="Product categories">
      <div
        className="deck__stage"
        ref={stage}
        onScroll={onScroll}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onClickCapture={onClickCapture}
        onKeyDown={onKey}
        tabIndex={0}
      >
        {categories.map((c, i) => {
          const isActive = i === active;
          const srcSet = coverSrcSet(c.cover_url);
          return (
            <div
              key={c.id ?? c.slug}
              ref={(el) => { cards.current[i] = el; }}
              className={`deck__card${isActive ? ' is-active' : ''}`}
            >
              {/* A real <Link>, so middle-click, cmd-click and "copy link
                  address" all behave as a customer expects. */}
              <Link
                to={`/category/${c.slug}`}
                className="deck__hit"
                aria-label={`Shop ${c.name}`}
                draggable={false}
              >
                {c.cover_url
                  ? <img
                      className="deck__img"
                      src={c.cover_url}
                      {...(srcSet ? { srcSet, sizes: '(max-width: 719px) 66vw, 300px' } : {})}
                      alt={c.name}
                      loading={i < 2 ? undefined : 'lazy'}
                      draggable={false}
                      width="760" height="1013"
                    />
                  : <div className="deck__ph" />}
              </Link>

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

      {/* Blurb and CTA sit outside the scroller so changing them can never
          resize a card or move the scroll position. */}
      <p className="deck__blurb" key={categories[active].slug}>
        {categories[active].blurb}
      </p>

      <Link to={`/category/${categories[active].slug}`} className="deck__cta">
        Shop {categories[active].name} <span aria-hidden="true">→</span>
      </Link>
    </div>
  );
}
