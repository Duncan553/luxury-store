// components/Footer.jsx — the closing spread.
//
// Rebuilt from a three-column block into an editorial sign-off, for two
// reasons beyond looks.
//
// 1. THE LINKS WERE HARDCODED. Bags / Jewelry / Watches / About, written
//    into the markup — the same bug the navbar had. "Sunglasses" existed
//    for days and never appeared down here, and any category the owner adds
//    would be missing again. The list now comes from the categories table,
//    like the navbar and the category deck.
//
// 2. EVERY SOCIAL LINK WAS FAKE. Five icons pointing at instagram.com,
//    tiktok.com, x.com, facebook.com and threads.net — the platforms'
//    own homepages, not Kamili's accounts. Tapping "Instagram" took a
//    customer to Instagram's login page. A dead link that looks alive is
//    worse than an absent one, so they're gone; the Instagram handle
//    renders only when the owner has actually filled it in under
//    admin → Settings, and the same for phone and email.
//
// What's left is what footer research says people come down here for:
// where you are, how to reach you, and a way back into the catalogue.
import { Link } from 'react-router-dom';
import { useCart } from '../context/CartContext';
import { useScrollReveal } from '../hooks/useScrollReveal';
import './Footer.css';

const WA_ICON = (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413z"/>
  </svg>
);

export default function Footer() {
  // Both already fetched once in CartContext — no extra query down here.
  const { categories, waNumber, settings } = useCart();
  const ref = useScrollReveal();
  const year = new Date().getFullYear();

  return (
    <footer className="footer" ref={ref}>
      <div className="footer__inner container">

        {/* Column 1 — the catalogue, straight from the database. */}
        <div className="footer__col reveal reveal-stagger">
          <span className="ed-kicker">Shop</span>
          <ul className="footer__list">
            {categories.map((c) => (
              <li key={c.id ?? c.slug}>
                <Link to={`/category/${c.slug}`} className="footer__link">
                  <span>{c.name}</span>
                  {/* The rule grows across on hover — the only motion here
                      that isn't a fade, and it's a hairline, so it costs
                      one composited transform. */}
                  <i className="footer__link-rule" aria-hidden="true" />
                </Link>
              </li>
            ))}
            <li>
              <Link to="/about" className="footer__link">
                <span>About</span>
                <i className="footer__link-rule" aria-hidden="true" />
              </Link>
            </li>
          </ul>
        </div>

        {/* Column 2 — how to actually reach the shop. Each row renders
            only if that field is filled in, so the footer never shows an
            empty label or a link to nothing. */}
        <div className="footer__col reveal reveal-delay-1 reveal-stagger">
          <span className="ed-kicker">Reach us</span>
          <ul className="footer__list">
            {waNumber && (
              <li>
                <a
                  className="footer__link footer__link--wa"
                  href={`https://wa.me/${waNumber}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <span>{WA_ICON} WhatsApp</span>
                  <i className="footer__link-rule" aria-hidden="true" />
                </a>
              </li>
            )}
            {settings?.phone && (
              <li>
                <a className="footer__link" href={`tel:${settings.phone.replace(/\s/g, '')}`}>
                  <span>{settings.phone}</span>
                  <i className="footer__link-rule" aria-hidden="true" />
                </a>
              </li>
            )}
            {settings?.email && (
              <li>
                <a className="footer__link" href={`mailto:${settings.email}`}>
                  <span>{settings.email}</span>
                  <i className="footer__link-rule" aria-hidden="true" />
                </a>
              </li>
            )}
            {settings?.instagram && (
              <li>
                <a
                  className="footer__link"
                  href={`https://instagram.com/${settings.instagram.replace(/^@/, '')}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <span>{settings.instagram}</span>
                  <i className="footer__link-rule" aria-hidden="true" />
                </a>
              </li>
            )}
          </ul>
        </div>

        {/* Column 3 — where the shop is, when it's open. Same rule: only
            what's been filled in. */}
        <div className="footer__col reveal reveal-delay-2 reveal-stagger">
          <span className="ed-kicker">Nairobi</span>
          <p className="footer__note">
            Ordered on WhatsApp. We confirm stock and the delivery cost for
            your area before anything is paid.
          </p>
          {settings?.location && <p className="footer__meta">{settings.location}</p>}
          {settings?.hours && <p className="footer__meta">{settings.hours}</p>}
        </div>
      </div>

      {/* The wordmark as the closing image, which is what luxury brands do
          with a footer — the name at a scale it never gets anywhere else,
          bleeding to the page's edges. Aria-hidden because it's the logo
          repeated, not new information for a screen reader. */}
      <div className="footer__wordmark reveal" aria-hidden="true">Kamili</div>

      <div className="footer__bottom container">
        <p>© {year} Kamili. All rights reserved.</p>
        <p className="footer__admin-link">
          <Link to="/admin/login">Admin</Link>
        </p>
      </div>
    </footer>
  );
}
