// HeroShowcase.jsx — the hero's right-hand panel: an animated gradient
// stage with the product image auto-cycling through Bags / Jewelry /
// Watches on its own, so there's real, continuous, visible movement
// without needing a click. A manual tap on a tab jumps straight there and
// restarts the timer from that point, rather than fighting what the
// visitor just chose to look at.
//
// This replaces an earlier version that used Spline (spline.design) for a
// subtle animated 3D layer behind the image. Cut it: the effect was too
// faint to read as "moving" even when it loaded, and it added real weight
// (1MB+ gzip) for something that wasn't landing. This auto-cycle is what
// was actually asked for — the product image itself visibly changing —
// and it costs nothing extra: same images, same framer-motion crossfade
// that was already here, just on a timer instead of click-only.
//
// Technique note on the background: a single oversized (300%) linear-
// gradient with its background-position animated back and forth.
// Animating background-position is close to the cheapest thing you can
// animate in CSS (GPU-composited, no layout/paint per frame) — matters
// here because it plays continuously for as long as the hero is on screen.
import { useState, useEffect, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import './HeroShowcase.css';

const ITEMS = [
  {
    key: 'bags',
    label: 'Bags',
    slug: 'bags',
    img: 'https://llxeazcqroaojjhogpjx.supabase.co/storage/v1/object/public/images/products-cutout/driorvoyage-1788451857421.png',
  },
  {
    key: 'jewelry',
    label: 'Jewelry',
    slug: 'jewelry',
    img: 'https://llxeazcqroaojjhogpjx.supabase.co/storage/v1/object/public/images/products-cutout/nec-1788447763732.png',
  },
  {
    key: 'watches',
    label: 'Watches',
    slug: 'watches',
    // Category art, not a specific item for sale — same role the
    // Watches category card's Unsplash cover photo already plays
    // elsewhere on the site, just background-removed for this treatment.
    img: 'https://llxeazcqroaojjhogpjx.supabase.co/storage/v1/object/public/images/hero/watch-1788449548833.png',
  },
];

const CYCLE_MS = 3500;

export default function HeroShowcase() {
  const [activeIdx, setActiveIdx] = useState(0);
  const reduce = useReducedMotion();
  const current = ITEMS[activeIdx];
  const timerRef = useRef(null);

  const restartTimer = useCallback(() => {
    clearInterval(timerRef.current);
    // Reduced-motion visitors still get the switcher — they just don't get
    // images changing out from under them on a timer they didn't ask for.
    if (reduce) return;
    timerRef.current = setInterval(() => {
      setActiveIdx(i => (i + 1) % ITEMS.length);
    }, CYCLE_MS);
  }, [reduce]);

  useEffect(() => {
    restartTimer();
    return () => clearInterval(timerRef.current);
  }, [restartTimer]);

  function selectTab(idx) {
    setActiveIdx(idx);
    restartTimer();   // a manual pick shouldn't get overridden a second later
  }

  return (
    <div className="hshow">
      <div className="hshow__stage">
        <AnimatePresence mode="wait">
          <motion.img
            key={current.key}
            src={current.img}
            alt={`Kamili ${current.label.toLowerCase()}`}
            className="hshow__img"
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: 14, scale: 0.97 }}
            animate={reduce ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, y: -10, scale: 0.98 }}
            transition={{ duration: reduce ? 0.15 : 0.5, ease: [0.16, 1, 0.3, 1] }}
          />
        </AnimatePresence>
      </div>

      <div className="hshow__switcher" role="tablist" aria-label="Preview a category">
        {ITEMS.map((item, i) => (
          <button
            key={item.key}
            role="tab"
            aria-selected={activeIdx === i}
            className={`hshow__tab${activeIdx === i ? ' hshow__tab--active' : ''}`}
            onClick={() => selectTab(i)}
          >
            {item.label}
          </button>
        ))}
      </div>

      <Link to={`/category/${current.slug}`} className="hshow__cta">
        Shop {current.label} <span aria-hidden="true">→</span>
      </Link>
    </div>
  );
}
