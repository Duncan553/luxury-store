import { useState, useEffect } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { useCart } from '../context/CartContext';
import MobileMenu from './MobileMenu';
import { navLinks } from '../lib/nav';
import './Navbar.css';

export default function Navbar() {
  const { itemCount, isOpen: cartOpen, setIsOpen: setCartOpen, categories } = useCart();
  const [scrolled,  setScrolled]  = useState(false);
  const [menuOpen,  setMenuOpen]  = useState(false);
  const location = useLocation();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 60);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => setMenuOpen(false), [location]);

  // Only one full-screen overlay makes sense open at a time — opening either
  // the menu or the cart closes the other, so they never stack.
  function openMenu() { setCartOpen(false); setMenuOpen(true); }
  function openCart()  { setMenuOpen(false); setCartOpen(true); }

  return (
    <header className={`navbar${scrolled ? ' navbar--scrolled' : ''}`}>
      <div className="navbar__inner container">
        <Link to="/" className="navbar__logo">KAMILI</Link>

        <nav className="navbar__links" aria-label="Main navigation">
          {navLinks(categories).map(({ label, to }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) => `navbar__link${isActive ? ' navbar__link--active' : ''}`}
            >
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="navbar__actions">
          <button className="navbar__cart" onClick={openCart} aria-label={`Cart (${itemCount} items)`}>
            <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/>
              <line x1="3" y1="6" x2="21" y2="6"/>
              <path d="M16 10a4 4 0 0 1-8 0"/>
            </svg>
            {itemCount > 0 && <span className="navbar__badge">{itemCount}</span>}
          </button>

          {/* Real dialog-trigger semantics: a screen reader announces
              "Menu, button, collapsed/expanded" per WCAG 2.2, not just a
              silently-toggling icon. */}
          <button
            className={`navbar__burger${menuOpen ? ' open' : ''}`}
            onClick={() => (menuOpen ? setMenuOpen(false) : openMenu())}
            aria-label={menuOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={menuOpen}
            aria-controls="mobile-menu"
          >
            <span /><span /><span />
          </button>
        </div>
      </div>

      <MobileMenu open={menuOpen} onClose={() => setMenuOpen(false)} />
    </header>
  );
}
