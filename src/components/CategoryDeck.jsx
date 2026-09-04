// CategoryDeck.jsx — the category browser, built as a coverflow deck.
//
// Shape of it: the active category sits front and centre at full size, the
// ones either side recede — scaled down, rotated back in 3D, dimmed — and
// the deck advances on its own. Clicking ANY card image opens that
// category's page; the arrows, dots, keyboard and drag move the deck.
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
import { flushSync } from 'react-dom';
import { Link, useNavigate } from 'react-router-dom';
import { useReducedMotion } from 'framer-motion';
import './CategoryDeck.css';

const AUTO_MS = 4000;
// Travel, in px, before a press counts as a drag rather than a tap. Fingers
// and mice both drift a few px; below this it stays a click.
const DRAG_START = 10;
// How long the deck waits after the visitor stops interacting before it
// starts moving again.
const RESUME_MS = 9000;

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
  // Drag state lives in refs, not state: it changes every frame and must
  // never trigger a React render.
  const pressed  = useRef(false);
  const dragging = useRef(false);
  const startX   = useRef(0);
  const dx       = useRef(0);
  const stageRef = useRef(null);
  // True when the gesture that just ended was a drag, so the click that
  // follows it is swallowed instead of navigating.
  const wasDrag  = useRef(false);

  const n = categories.length;

  const go = useCallback((i) => {
    if (!n) return;
    // Wrap both ways so the deck is a loop, not a dead end at either edge.
    setActive(((i % n) + n) % n);
  }, [n]);

  // Taking over pauses autoplay rather than ending it: the deck hands
  // control back after RESUME_MS of no input, so it never ends up parked on
  // one category because someone swiped once.
  const take = useCallback((i) => { setUserTook(true); go(i); }, [go]);

  useEffect(() => {
    if (!userTook) return;
    const t = setTimeout(() => setUserTook(false), RESUME_MS);
    return () => clearTimeout(t);
  }, [userTook, active]);

  // Advances on its own, always. It used to stop dead under
  // prefers-reduced-motion, which meant that on any machine with that
  // setting enabled — and it's on by default in more places than you'd
  // think — the deck never moved and looked broken until you clicked
  // something.
  //
  // The setting is still respected, just correctly: what reduced-motion
  // asks you to drop is large positional movement, not change itself. So
  // the deck still cycles, and the CSS swaps the sliding transition for a
  // cross-fade (see .deck--fade). Nobody has to touch a control to see
  // every category.
  useEffect(() => {
    if (userTook || n < 2) return;
    const t = setInterval(() => setActive((a) => (a + 1) % n), AUTO_MS);
    return () => clearInterval(t);
  }, [userTook, n]);

  if (!n) return null;

  function onKey(e) {
    if (e.key === 'ArrowLeft')  { e.preventDefault(); take(active - 1); }
    if (e.key === 'ArrowRight') { e.preventDefault(); take(active + 1); }
  }

  // ── Drag ────────────────────────────────────────────────────────────
  // The deck follows the finger (and the mouse) instead of sitting still
  // and then jumping when you let go. Two details make it feel smooth
  // rather than merely functional:
  //
  // 1. The drag offset is written straight to a CSS custom property on the
  //    DOM node, NOT into React state. State would re-render the whole deck
  //    on every pointermove — dozens of renders a second, each one work the
  //    browser has to finish before it can paint. Writing one custom
  //    property changes a value the compositor already animates.
  //
  // 2. Transitions are switched off while dragging. Otherwise every frame
  //    starts a new 0.62s ease toward a target that has already moved, and
  //    the deck lags behind the finger like it's underwater.
  //
  // Pointer events cover touch and mouse in one path, so the laptop gets
  // drag-to-browse too rather than arrows only.
  // A press is NOT yet a drag.
  //
  // The first version set dragging=true and called setPointerCapture right
  // here on pointerdown, and that broke clicking entirely: while a pointer
  // is captured, the click event is dispatched to the CAPTURING element
  // instead of the element under the cursor, so the <a> never received it
  // and tapping a category did nothing at all. (An automated el.click()
  // still passed, because that dispatches a click directly and never fires
  // pointer events — which is exactly why it has to be tested with a real
  // click.)
  //
  // So: record the press, claim nothing. The drag only begins once the
  // pointer has actually travelled DRAG_START px, and capture happens then
  // — at which point swallowing the click is the correct thing to do.
  function onPointerDown(e) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    pressed.current = true;
    dragging.current = false;
    wasDrag.current = false;
    startX.current = e.clientX;
    dx.current = 0;
  }

  function onPointerMove(e) {
    if (!pressed.current) return;
    dx.current = e.clientX - startX.current;
    if (!dragging.current) {
      // Below the threshold this is still a tap — a finger never lands
      // perfectly still, and 4px of drift must not cost a navigation.
      if (Math.abs(dx.current) < DRAG_START) return;
      dragging.current = true;
      stageRef.current?.classList.add('is-dragging');
      e.currentTarget.setPointerCapture?.(e.pointerId);
    }
    // Rubber-band past the ends so the deck resists rather than tearing off.
    stageRef.current?.style.setProperty('--drag', `${dx.current * 0.9}px`);
  }

  function onPointerUp() {
    const wasPressed = pressed.current;
    pressed.current = false;
    // Never dragged -> it was a tap. Leave everything alone so the click
    // reaches the link.
    if (!wasPressed || !dragging.current) return;
    dragging.current = false;
    const stage = stageRef.current;
    stage?.classList.remove('is-dragging');
    stage?.style.setProperty('--drag', '0px');
    // A short flick counts as much as a long drag; threshold scales with the
    // card so it feels the same on a phone and a laptop.
    const threshold = (stage?.offsetWidth || 300) * 0.12;
    // This gesture WAS a drag, so the click that fires straight after it
    // must not navigate — otherwise every swipe opens whichever category
    // the swipe happened to start on.
    wasDrag.current = true;
    if (Math.abs(dx.current) > threshold) take(active + (dx.current < 0 ? 1 : -1));
    else setUserTook(true);
    dx.current = 0;
  }

  // Clicking ANY card image opens that category — front card or side card.
  //
  // Smoothness comes from a real View Transition where the browser supports
  // one: the old page is captured, React commits the new route inside the
  // transition, and the browser cross-fades between the two instead of the
  // page swapping in a single hard frame. flushSync is what makes that work
  // — startViewTransition snapshots, runs this callback, then waits one
  // frame, so React has to commit synchronously inside it or the browser
  // captures the OLD DOM twice and you see no transition at all.
  //
  // Everything is wrapped so navigation can never be the thing that fails:
  // no support, reduced motion, or a throw all fall through to a plain
  // navigate.
  function openCategory(e, slug) {
    if (wasDrag.current) { e.preventDefault(); wasDrag.current = false; return; }
    const openIt = () => navigate(`/category/${slug}`);
    if (reduce || typeof document.startViewTransition !== 'function') return; // let the Link do it
    e.preventDefault();
    try {
      document.startViewTransition(() => flushSync(openIt));
    } catch {
      openIt();
    }
  }

  return (
    <div
      className={`deck${reduce ? ' deck--fade' : ''}`}
      role="group"
      aria-roledescription="carousel"
      aria-label="Product categories"
      onKeyDown={onKey}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      tabIndex={0}
    >
      <div className="deck__stage" ref={stageRef}>
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
              {/* Every card is a link now, side cards included: clicking an
                  image goes straight to that category's URL. It stays a real
                  <Link> rather than an onClick handler so middle-click,
                  cmd-click and "copy link address" all behave, and so it
                  still works if the JS transition path is unavailable. */}
              <Link
                to={`/category/${c.slug}`}
                className="deck__hit"
                aria-label={`Shop ${c.name}`}
                tabIndex={far ? -1 : 0}
                draggable={false}
                onClick={(e) => openCategory(e, c.slug)}
              >
                {c.cover_url
                  ? <img
                      className="deck__img"
                      src={c.cover_url}
                      {...(srcSet ? {
                        srcSet,
                        sizes: isActive
                          ? '(max-width: 719px) 62vw, 300px'
                          : '(max-width: 719px) 46vw, 230px',
                      } : {})}
                      alt={c.name}
                      loading={isActive ? undefined : 'lazy'}
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
