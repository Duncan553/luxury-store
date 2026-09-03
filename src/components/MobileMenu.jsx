// MobileMenu.jsx — full-screen mobile navigation overlay.
//
// Replaces the old accordion-style dropdown (a <div> that grew from
// max-height:0 inside the navbar itself). That pattern has real problems on
// a phone: no scroll lock, so the page behind it keeps scrolling while it's
// "open"; no reliable way to dismiss it short of tapping a link; a fixed
// max-height that clips if a link's text wraps; and no keyboard/
// screen-reader semantics at all — WCAG 2.2 expects a real dialog with
// aria-expanded on the trigger and Escape-to-close.
//
// A full-screen overlay (rather than a narrow slide-in drawer) fits Kamili
// specifically: there are only four destinations, so there's no long list to
// keep partially visible behind a drawer, and the brand's big serif display
// type reads as a moment on its own — the same treatment SSENSE, Net-a-Porter
// etc. use for exactly this reason on a small nav.
//
// Rendered via a PORTAL straight into <body>, not inline where Navbar uses
// it. Reason: Navbar's <header> gets backdrop-filter:blur() once the page
// scrolls (.navbar--scrolled). A backdrop-filter (like a transform or
// filter) on an ancestor creates a new CSS containing block for any
// position:fixed descendant — so without the portal, this "full-screen"
// overlay was actually fixed relative to the 68px header, not the
// viewport, and rendered squashed into a sliver the moment you'd scrolled
// before opening it. Portaling to <body> sidesteps the whole class of bug.
import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { NavLink } from 'react-router-dom';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import './MobileMenu.css';

const WA_ICON = (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413z"/>
  </svg>
);

const LINKS = [
  { label: 'Bags',    to: '/category/bags' },
  { label: 'Jewelry', to: '/category/jewelry' },
  { label: 'Watches', to: '/category/watches' },
  { label: 'About',   to: '/about' },
];

// Stagger the links in on open — each one 60ms behind the last.
const listV = { open: { transition: { staggerChildren: 0.06, delayChildren: 0.08 } }, closed: {} };
const linkV = {
  open:   { opacity: 1, y: 0 },
  closed: { opacity: 0, y: 18 },
};

export default function MobileMenu({ open, onClose }) {
  // WCAG 2.2 expects motion like this to back off when the OS says so —
  // framer-motion's own hook, so it needs no extra wiring.
  const reduce = useReducedMotion();
  const closeBtnRef = useRef(null);

  // Scroll lock + focus the close button, same pattern CartModal already
  // uses — keeps the two overlays behaving identically to a user.
  useEffect(() => {
    if (!open) return;
    document.body.style.overflow = 'hidden';
    closeBtnRef.current?.focus();
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          className="mmenu"
          id="mobile-menu"
          role="dialog"
          aria-modal="true"
          aria-label="Site menu"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: reduce ? 0.01 : 0.35 }}
        >
          <div className="mmenu__top">
            <span className="mmenu__logo">KAMILI</span>
            <button ref={closeBtnRef} className="mmenu__close" onClick={onClose} aria-label="Close menu">
              ✕
            </button>
          </div>

          <motion.nav
            className="mmenu__links"
            aria-label="Main navigation"
            initial="closed"
            animate="open"
            exit="closed"
            variants={reduce ? {} : listV}
          >
            {LINKS.map(({ label, to }) => (
              <motion.div key={to} variants={reduce ? {} : linkV}
                transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}>
                <NavLink to={to} className="mmenu__link" onClick={onClose}>
                  {label}
                </NavLink>
              </motion.div>
            ))}
          </motion.nav>

          <motion.div className="mmenu__bottom"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            transition={{ delay: reduce ? 0 : 0.3, duration: 0.5 }}>
            {/* Frequent task, kept one tap away rather than buried further —
                a shop selling through WhatsApp should never make "how do I
                order" harder to find than the catalogue itself. */}
            <a className="mmenu__wa" href="https://wa.me/254114256994" target="_blank" rel="noopener noreferrer">
              {WA_ICON} Chat on WhatsApp
            </a>
            <p className="mmenu__tag">Crafted for the discerning few.</p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
}
