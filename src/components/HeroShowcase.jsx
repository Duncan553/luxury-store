// HeroShowcase.jsx — the hero's right-hand panel: an animated gradient
// stage with a floating, background-removed product cutout, switchable
// between Bags / Jewelry / Watches.
//
// Technique note (researched before building, not guessed at): the
// animated background is a single oversized (300%) linear-gradient whose
// background-position is animated back and forth. That's deliberate —
// animating background-position is close to the cheapest thing you can
// animate in CSS (GPU-composited, no layout/paint per frame), versus
// animating gradient color stops or filters, which forces a much more
// expensive repaint on every frame. Matters here because this plays
// continuously for as long as the hero is on screen.
//
// The floating-product look reuses the exact same idea as ProductCard's
// cutout treatment — filter: drop-shadow() tracing the real alpha
// silhouette (not box-shadow, which would draw a shadow around the
// invisible rectangle of a transparent PNG) — just scaled up for hero
// prominence.
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import './HeroShowcase.css';

const ITEMS = [
  {
    key: 'bags',
    label: 'Bags',
    slug: 'bags',
    img: 'https://llxeazcqroaojjhogpjx.supabase.co/storage/v1/object/public/images/products-cutout/lui23-1788447766050.png',
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

export default function HeroShowcase() {
  const [active, setActive] = useState('bags');
  const reduce = useReducedMotion();
  const current = ITEMS.find(i => i.key === active);

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
        {ITEMS.map(item => (
          <button
            key={item.key}
            role="tab"
            aria-selected={active === item.key}
            className={`hshow__tab${active === item.key ? ' hshow__tab--active' : ''}`}
            onClick={() => setActive(item.key)}
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
