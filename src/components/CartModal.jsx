import { useEffect, useRef, useState } from 'react';
import { useCart } from '../context/CartContext';
import { useDeliveryLocation } from '../hooks/useLocation';
import MpesaCheckout from './MpesaCheckout';
import './CartModal.css';

const COUNTIES = [
  'Baringo','Bomet','Bungoma','Busia','Elgeyo-Marakwet','Embu','Garissa',
  'Homa Bay','Isiolo','Kajiado','Kakamega','Kericho','Kiambu','Kilifi',
  'Kirinyaga','Kisii','Kisumu','Kitui','Kwale','Laikipia','Lamu','Machakos',
  'Makueni','Mandera','Marsabit','Meru','Migori','Mombasa',"Murang'a",
  'Nairobi','Nakuru','Nandi','Narok','Nyamira','Nyandarua','Nyeri',
  'Samburu','Siaya','Taita-Taveta','Tana River','Tharaka-Nithi',
  'Trans-Nzoia','Turkana','Uasin Gishu','Vihiga','Wajir','West Pokot',
];

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
  const { getLocation, loading: locLoading } = useDeliveryLocation();

  // view: 'cart' | 'whatsapp' | 'mpesa'
  const [view, setView] = useState('cart');

  // WhatsApp form fields
  const [waName,    setWaName]    = useState('');
  const [waPhone,   setWaPhone]   = useState('');
  const [waCounty,  setWaCounty]  = useState('');
  const [waCity,    setWaCity]    = useState('');
  const [waAddress, setWaAddress] = useState('');
  const [waNotes,   setWaNotes]   = useState('');
  const [waError,   setWaError]   = useState('');
  const [waSent,    setWaSent]    = useState(false);

  const overlayRef = useRef(null);

  useEffect(() => {
    document.body.style.overflow = isOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) {
      // Jump to payment view if triggered via "Buy Now" from a product card
      if (checkoutView !== 'cart') { setView(checkoutView); setCheckoutView('cart'); }
    } else {
      setView('cart');
      setWaSent(false);
      setWaName(''); setWaPhone(''); setWaCounty('');
      setWaCity(''); setWaAddress(''); setWaNotes(''); setWaError('');
    }
  }, [isOpen, checkoutView]);

  if (!isOpen) return null;

  function handleShareLocation() {
    getLocation(({ fullAddress }) => setWaAddress(fullAddress));
  }

  function handleWhatsAppSend(e) {
    e.preventDefault();
    setWaError('');
    if (!waName.trim())    { setWaError('Please enter your name.');           return; }
    if (!waCounty)         { setWaError('Please select your county.');         return; }
    if (!waCity.trim())    { setWaError('Please enter your city or town.');    return; }
    if (!waAddress.trim()) { setWaError('Please enter your delivery address.'); return; }

    checkoutViaWhatsApp({
      name: waName.trim(), phone: waPhone.trim(),
      county: waCounty, city: waCity.trim(),
      address: waAddress.trim(), notes: waNotes.trim(),
    });
    setWaSent(true);
  }

  function sendWaReceiptToCustomer() {
    const clean = waPhone.trim().replace(/^0/, '254').replace(/^\+/, '');
    const lines = items.map(i =>
      `  • ${i.name} x${i.qty} — Ksh ${(i.price * i.qty).toLocaleString('en-KE')}`
    );
    const msg = [
      '🧾 ORDER RECEIPT — Kamili',
      '',
      `Customer: ${waName.trim()}`,
      `Delivering to: ${[waCity.trim(), waCounty].filter(Boolean).join(', ')}`,
      '',
      '📦 Items:',
      ...lines,
      '',
      `💰 Total: Ksh ${total.toLocaleString('en-KE')}`,
      '',
      'We will contact you to confirm delivery. Thank you for shopping at Kamili! 🛍️',
    ].join('\n');
    window.open(`https://wa.me/${clean}?text=${encodeURIComponent(msg)}`, '_blank', 'noopener,noreferrer');
  }

  const backLabel = view === 'cart' ? null : view === 'whatsapp' ? '← Cart' : '← Cart';

  return (
    <div className="cart-overlay" ref={overlayRef}
      onClick={(e) => { if (e.target === overlayRef.current) setIsOpen(false); }}>
      <aside className="cart-drawer">

        <div className="cart-drawer__header">
          {view !== 'cart'
            ? <button className="cart-drawer__back" onClick={() => { setView('cart'); setWaSent(false); }}>{backLabel}</button>
            : <h2 className="cart-drawer__title">Your Cart</h2>
          }
          <button className="cart-drawer__close" onClick={() => setIsOpen(false)}>✕</button>
        </div>

        {/* ── M-Pesa flow ──────────────────────────────────────────── */}
        {view === 'mpesa' && <MpesaCheckout onBack={() => setView('cart')} />}

        {/* ── WhatsApp order form ──────────────────────────────────── */}
        {view === 'whatsapp' && waSent && (
          <div className="wa-success">
            <div className="wa-success__icon">✓</div>
            <h3>Order Sent to Kamili!</h3>
            <p className="wa-success__msg">We'll contact you shortly to confirm delivery.</p>
            {waPhone.trim() && (
              <button className="btn btn-whatsapp wa-submit" onClick={sendWaReceiptToCustomer}>
                {WA_ICON} Send receipt to my WhatsApp
              </button>
            )}
            <button className="btn btn-gold" style={{ marginTop: 8 }} onClick={clearCart}>Done</button>
          </div>
        )}

        {view === 'whatsapp' && !waSent && (
          <form className="wa-form-wrap" onSubmit={handleWhatsAppSend}>
            <div className="wa-form-scroll">
              <div className="wa-form__header">
                <span>{WA_ICON}</span>
                <span>Order via WhatsApp</span>
              </div>

              <div className="wa-form__total">
                Ksh {total.toLocaleString('en-KE')}
                <span> · {items.length} item{items.length !== 1 ? 's' : ''}</span>
              </div>

              {/* Name */}
              <div className="form-group">
                <label className="form-label">Your Name *</label>
                <input type="text" placeholder="e.g. Jane Wanjiku"
                  value={waName} onChange={e => setWaName(e.target.value)} required />
              </div>

              {/* Phone */}
              <div className="form-group">
                <label className="form-label">Phone <span className="wa-optional">(for delivery updates)</span></label>
                <input type="tel" placeholder="0712 345 678" inputMode="numeric"
                  value={waPhone} onChange={e => setWaPhone(e.target.value)} />
              </div>

              {/* County + City */}
              <div className="wa-row">
                <div className="form-group">
                  <label className="form-label">County *</label>
                  <select value={waCounty} onChange={e => setWaCounty(e.target.value)} required>
                    <option value="">Select</option>
                    {COUNTIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">City / Town *</label>
                  <input type="text" placeholder="e.g. Westlands"
                    value={waCity} onChange={e => setWaCity(e.target.value)} required />
                </div>
              </div>

              {/* Address */}
              <div className="form-group">
                <div className="wa-addr-header">
                  <label className="form-label">Delivery Address *</label>
                  <button type="button" className="mpesa-loc-btn" onClick={handleShareLocation} disabled={locLoading}>
                    {locLoading ? '…' : '📍 My location'}
                  </button>
                </div>
                <textarea rows={2}
                  placeholder="Street, building, apartment…"
                  value={waAddress} onChange={e => setWaAddress(e.target.value)} required />
              </div>

              {/* Notes */}
              <div className="form-group">
                <label className="form-label">Notes <span className="wa-optional">(optional)</span></label>
                <textarea rows={2} placeholder="Gate colour, landmark, preferred time…"
                  value={waNotes} onChange={e => setWaNotes(e.target.value)} />
              </div>
            </div>

            <div className="wa-form-footer">
              {waError && <p className="form-error" style={{ marginBottom: 10 }}>{waError}</p>}
              <button type="submit" className="btn btn-whatsapp wa-submit">
                {WA_ICON} Send Order to Kamili
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
                          <button onClick={() => updateQty(item.id, -1)}>−</button>
                          <span>{item.qty}</span>
                          <button onClick={() => updateQty(item.id, +1)}>+</button>
                        </div>
                      </div>
                      <button className="cart-item__remove" onClick={() => removeItem(item.id)}>✕</button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {items.length > 0 && (
              <div className="cart-drawer__footer">
                <div className="cart-total">
                  <span>Total</span>
                  <span>Ksh {total.toLocaleString('en-KE')}</span>
                </div>
                <button className="btn btn-gold cart-cta" onClick={() => setView('mpesa')}>
                  Pay with M-Pesa
                </button>
                <button className="btn btn-whatsapp cart-cta" onClick={() => setView('whatsapp')}>
                  {WA_ICON} Order via WhatsApp
                </button>
              </div>
            )}
          </>
        )}

      </aside>
    </div>
  );
}
