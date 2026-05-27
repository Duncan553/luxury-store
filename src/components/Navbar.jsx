import { useState, useEffect } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { useCart } from '../context/CartContext';
import './Navbar.css';

const NAV_LINKS = [
  { label: 'Bags',    to: '/category/bags' },
  { label: 'Jewelry', to: '/category/jewelry' },
  { label: 'Watches', to: '/category/watches' },
  { label: 'About',   to: '/about' },
];

export default function Navbar() {
  const { itemCount, setIsOpen } = useCart();
  const [scrolled,  setScrolled]  = useState(false);
  const [menuOpen,  setMenuOpen]  = useState(false);
  const location = useLocation();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 60);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => setMenuOpen(false), [location]);

  return (
    <header className={`navbar${scrolled ? ' navbar--scrolled' : ''}`}>
      <div className="navbar__inner container">
        <Link to="/" className="navbar__logo">KAMILI</Link>

        <nav className="navbar__links" aria-label="Main navigation">
          {NAV_LINKS.map(({ label, to }) => (
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
          <button className="navbar__cart" onClick={() => setIsOpen(true)} aria-label={`Cart (${itemCount} items)`}>
            <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/>
              <line x1="3" y1="6" x2="21" y2="6"/>
              <path d="M16 10a4 4 0 0 1-8 0"/>
            </svg>
            {itemCount > 0 && <span className="navbar__badge">{itemCount}</span>}
          </button>

          <button
            className={`navbar__burger${menuOpen ? ' open' : ''}`}
            onClick={() => setMenuOpen((v) => !v)}
            aria-label="Toggle menu"
            aria-expanded={menuOpen}
          >
            <span /><span /><span />
          </button>
        </div>
      </div>

      {/* Mobile drawer */}
      <div className={`navbar__drawer${menuOpen ? ' navbar__drawer--open' : ''}`} aria-hidden={!menuOpen}>
        {NAV_LINKS.map(({ label, to }) => (
          <NavLink key={to} to={to} className="navbar__drawer-link">{label}</NavLink>
        ))}
      </div>
    </header>
  );
}
