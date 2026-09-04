import { useEffect, useRef } from 'react';

export function useScrollReveal(selector = '.reveal') {
  const ref = useRef(null);
  useEffect(() => {
    const root = ref.current || document;
    const targets = root.querySelectorAll(selector);

    // ── Above-the-fold content is NOT faded in ──────────────────────────
    // Anything already on screen when this runs is marked visible
    // immediately, with transitions suppressed for one frame so it paints
    // at final opacity rather than animating up from zero.
    //
    // This is a measured performance fix, not a preference. Elements that
    // start at opacity:0 don't count toward Largest Contentful Paint until
    // they finish becoming visible, so gating the opening copy behind an
    // observer callback plus a 0.5s fade was pushing LCP to ~1.9s on a page
    // whose first paint was 316ms and whose DOM was interactive at 70ms.
    // The hero copy was, in effect, animating the page's own score down.
    //
    // It reads better too: text that is already in view has no reason to
    // fade in, and a visitor never sees the flash of invisible content that
    // a reveal produces if the observer is slow to fire.
    const vh = window.innerHeight || 0;
    const immediate = [];
    targets.forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.top < vh && r.bottom > 0) immediate.push(el);
    });
    immediate.forEach((el) => {
      el.classList.add('reveal-instant', 'visible');
    });
    // Drop the suppressor after a frame so later state changes on the same
    // element (a hover, a re-render) still animate normally.
    if (immediate.length) {
      requestAnimationFrame(() => requestAnimationFrame(() => {
        immediate.forEach((el) => el.classList.remove('reveal-instant'));
      }));
    }

    // Everything below the fold keeps the reveal.
    const io = new IntersectionObserver(
      (entries) => entries.forEach((e) => {
        if (e.isIntersecting) { e.target.classList.add('visible'); io.unobserve(e.target); }
      }),
      { threshold: 0.12 }
    );
    targets.forEach((el) => { if (!el.classList.contains('visible')) io.observe(el); });
    return () => io.disconnect();
  }, [selector]);

  return ref;
}
