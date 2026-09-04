// CartModal.jsx — cart drawer + WhatsApp checkout.
//
// WhatsApp is the ONLY checkout. There is no M-Pesa step and no delivery-address
// step: the owner replies in the chat within minutes, so the address is a
// conversation, not a form. Every field we ask for before the chat opens is a
// place the customer can drop off, so we ask for two: name and phone.
import { useEffect, useRef, useState } from 'react';
import { useCart } from '../context/CartContext';
import './CartModal.css';

const WA_ICON = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413z"/>
  </svg>
);

export default function CartModal() {
  const {
    items, isOpen, setIsOpen, removeItem, updateQty, total,
    checkoutViaWhatsApp, checkoutView, setCheckoutView, clearCart,
  } = useCart();

  // view: 'cart' | 'whatsapp'
  const [view, setView] = useState('cart');

  const [waName,  setWaName]  = useState('');
  const [waError, setWaError] = useState('');
  const [waSent,  setWaSent]  = useState(false);
  const [sending, setSending] = useState(false);
  // Set when window.open was blocked — we then render a real <a> the customer
  // can tap, instead of claiming the order was sent when it wasn't.
  const [waFallbackUrl, setWaFallbackUrl] = useState('');
  const [orderRef, setOrderRef] = useState('');

  const overlayRef = useRef(null);

  useEffect(() => {
    document.body.style.overflow = isOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) {
      // Jump straight to the form when "Buy Now" was used from the lightbox
      if (checkoutView !== 'cart') { setView(checkoutView); setCheckoutView('cart'); }
    } else {
      setView('cart');
      setWaSent(false); setSending(false);
      setWaName(''); setWaError('');
      setWaFallbackUrl(''); setOrderRef('');
    }
  }, [isOpen, checkoutView]);

  if (!isOpen) return null;

  async function handleWhatsAppSend(e) {
    e.preventDefault();
    setWaError('');
    if (!waName.trim()) { setWaError('Please enter your name.'); return; }

    setSending(true);
    // No phone collected: opening the chat hands the owner the customer's
    // number automatically, so asking for it here was a redundant field
    // sitting directly in front of the one action that matters.
    const res = await checkoutViaWhatsApp({ name: waName.trim() });
    setSending(false);
    setOrderRef(res.orderId || '');

    // Only claim the order was sent if WhatsApp actually opened.
    // If the popup was blocked (common inside the Instagram browser) hand the
    // customer a tappable link — an <a> always works where window.open doesn't.
    if (res.opened) setWaSent(true);
    else            setWaFallbackUrl(res.waUrl);
  }

  return (
    <div className="cart-overlay" ref={overlayRef}
      onClick={(e) => { if (e.target === overlayRef.current) setIsOpen(false); }}>
      <aside className="cart-drawer">

        <div className="cart-drawer__header">
          {view !== 'cart'
            ? <button className="cart-drawer__back" onClick={() => {
                setView('cart'); setWaSent(false); setWaFallbackUrl('');
              }}>← Cart</button>
            : <h2 className="cart-drawer__title">Your Cart</h2>
          }
          <button className="cart-drawer__close" onClick={() => setIsOpen(false)}>✕</button>
        </div>

        {/* ── Order sent ───────────────────────────────────────────── */}
        {view === 'whatsapp' && waSent && (
          <div className="wa-success">
            <div className="wa-success__icon">✓</div>
            <h3>Order Sent to Kamili!</h3>
            <p className="wa-success__msg">
              We'll reply on WhatsApp in a few minutes to confirm delivery and payment.
            </p>
            {orderRef && <p className="wa-order-ref">Your ref: <strong>{orderRef}</strong></p>}
            <button className="btn btn-gold" style={{ marginTop: 8 }} onClick={clearCart}>Done</button>
          </div>
        )}

        {/* ── Popup blocked fallback ───────────────────────────────── */}
        {view === 'whatsapp' && !waSent && waFallbackUrl && (
          <div className="wa-success">
            <div className="wa-success__icon wa-success__icon--warn">!</div>
            <h3>One more tap</h3>
            <p className="wa-success__msg">
              Your browser blocked the WhatsApp window. Your order is saved — tap below to send it.
            </p>
            <a className="btn btn-whatsapp wa-submit" href={waFallbackUrl}
              target="_blank" rel="noopener noreferrer" onClick={() => setWaSent(true)}>
              {WA_ICON} Open WhatsApp
            </a>
          </div>
        )}

        {/* ── WhatsApp order form ──────────────────────────────────── */}
        {view === 'whatsapp' && !waSent && !waFallbackUrl && (
          <form className="wa-form-wrap" onSubmit={handleWhatsAppSend}>
            <div className="wa-form-scroll">
              <div className="wa-form__header">
                <span>{WA_ICON}</span>
                <span>Order via WhatsApp</span>
              </div>

              <div className="wa-form__total">
                Ksh {total.toLocaleString('en-KE')}
                <span> · {items.length} item{items.length !== 1 ? 's' : ''}</span>
                {/* Repeated here, not just in the cart: this is the last screen
                    before the order leaves, and it's the number the customer
                    will hold you to. */}
                <span className="wa-form__total-note">excludes delivery</span>
              </div>

              <div className="form-group">
                {/* No "*" — it only distinguishes required from optional, and
                    this is now the only field. */}
                <label className="form-label" htmlFor="wa-name">Your Name</label>
                <input id="wa-name" type="text" placeholder="e.g. Jane Wanjiku" autoComplete="name"
                  value={waName} onChange={e => setWaName(e.target.value)} required />
              </div>

              <p className="wa-reassure">
                No payment now. We'll confirm your delivery cost on WhatsApp before anything is paid.
              </p>
            </div>

            <div className="wa-form-footer">
              {waError && <p className="form-error" style={{ marginBottom: 10 }}>{waError}</p>}
              <button type="submit" className="btn btn-whatsapp wa-submit" disabled={sending}>
                {WA_ICON} {sending ? 'Sending…' : 'Send Order to Kamili'}
              </button>
              <p className="wa-note">Opens WhatsApp with your order details pre-filled</p>
            </div>
          </form>
        )}

        {/* ── Cart view ────────────────────────────────────────────── */}
        {view === 'cart' && (
          <>
            <div className="cart-drawer__body">
              {items.length === 0 ? (
                <div className="cart-empty">
                  <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1">
                    <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/>
                    <line x1="3" y1="6" x2="21" y2="6"/>
                    <path d="M16 10a4 4 0 0 1-8 0"/>
                  </svg>
                  <p>Your cart is empty.</p>
                </div>
              ) : (
                <ul className="cart-list">
                  {items.map((item) => (
                    <li key={item.id} className="cart-item">
                      <div className="cart-item__img">
                        {item.image_url
                          ? <img src={item.image_url} alt={item.name} className="img-cover" />
                          : <div className="cart-item__placeholder" />}
                      </div>
                      <div className="cart-item__info">
                        {item.status === 'Pre-Order' && <span className="cart-item__tag">Pre-Order</span>}
                        <p className="cart-item__name">{item.name}</p>
                        <p className="cart-item__price">Ksh {(item.price * item.qty).toLocaleString('en-KE')}</p>
                        <div className="cart-item__qty">
                          <button onClick={() => updateQty(item.id, -1)} aria-label="Reduce quantity">−</button>
                          <span>{item.qty}</span>
                          <button onClick={() => updateQty(item.id, +1)} aria-label="Increase quantity">+</button>
                        </div>
                      </div>
                      <button className="cart-item__remove" onClick={() => removeItem(item.id)}
                        aria-label={`Remove ${item.name}`}>✕</button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {items.length > 0 && (
              <div className="cart-drawer__footer">
                {/* Labelled "Items total", not "Total".
                    This is the whole drip-pricing fix in one word. Delivery is
                    charged separately here, so calling this number "Total" made
                    the site promise a final price it doesn't honour — the
                    customer then meets the delivery fee on WhatsApp, at the
                    moment they'd already committed. Baymard puts extra costs at
                    the top of the abandonment list (48%), and the damage comes
                    from the surprise, not the amount: people judge each price in
                    a sequence for fairness, so a fee that appears late reads as
                    a bait-and-switch even when it's reasonable.
                    One word, disclosed early, costs nothing. */}
                <div className="cart-total">
                  <span>Items total</span>
                  <span>Ksh {total.toLocaleString('en-KE')}</span>
                </div>
                <div className="cart-total cart-total--delivery">
                  <span>Delivery</span>
                  <span>Quoted by location</span>
                </div>
                {/* Single checkout path — the one that actually works. */}
                <button className="btn btn-whatsapp cart-cta" onClick={() => setView('whatsapp')}>
                  {WA_ICON} Order via WhatsApp
                </button>
                {/* Deliberately NOT a popup fired on the checkout click.
                    NN/g's finding on overlays is that they interrupt the
                    critical task and force an action before the user can
                    continue — and a modal at "Order via WhatsApp" would hit at
                    the single worst moment, the point of commitment. Same
                    information, placed inline and one step earlier, informs
                    without blocking. */}
                <p className="cart-reassure">
                  Delivery is charged separately — we quote it on WhatsApp once we know your area. Pay on confirmation.
                </p>
              </div>
            )}
          </>
        )}

      </aside>
    </div>
  );
}
