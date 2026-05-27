// MpesaCheckout.jsx — STK Push with confirmation step, Daraja fallback, and debounce.
import { useState, useEffect, useRef } from 'react';
import { useCart } from '../context/CartContext';
import { useDeliveryLocation } from '../hooks/useLocation';
import './MpesaCheckout.css';

const POLL_INTERVAL = 3000;
const POLL_TIMEOUT  = 90000;
// A4: abort STK push after 15s — Daraja can hang indefinitely during outages.
const STK_TIMEOUT   = 15000;
// B3: block re-taps for 30s after first click — prevents 4× STK pushes on bad network.
const PAY_DEBOUNCE  = 30000;

const COUNTIES = [
  'Baringo','Bomet','Bungoma','Busia','Elgeyo-Marakwet','Embu','Garissa',
  'Homa Bay','Isiolo','Kajiado','Kakamega','Kericho','Kiambu','Kilifi',
  'Kirinyaga','Kisii','Kisumu','Kitui','Kwale','Laikipia','Lamu','Machakos',
  'Makueni','Mandera','Marsabit','Meru','Migori','Mombasa',"Murang'a",
  'Nairobi','Nakuru','Nandi','Narok','Nyamira','Nyandarua','Nyeri',
  'Samburu','Siaya','Taita-Taveta','Tana River','Tharaka-Nithi',
  'Trans-Nzoia','Turkana','Uasin Gishu','Vihiga','Wajir','West Pokot',
];

// A1: mask middle 3 digits so the customer can confirm without seeing the full number.
// 0712345678 → 0712***678.  Prevents revealing the number to a shoulder-surfer.
function maskPhone(raw) {
  const clean = raw.replace(/\s/g, '').replace(/^(\+?254)/, '0');
  if (clean.length >= 10) return clean.slice(0, 4) + '***' + clean.slice(7);
  return raw; // unexpected format — show as-is rather than corrupt it
}

export default function MpesaCheckout({ onBack }) {
  // A4: setCheckoutView lets us switch to WhatsApp checkout if Daraja is down.
  const { total, items, clearCart, setCheckoutView } = useCart();

  const cartSnapshot = items.map(i => ({ id: i.id, name: i.name, qty: i.qty, price: i.price }));
  const { getLocation, loading: locLoading, error: locError } = useDeliveryLocation();

  const [phone,   setPhone]   = useState('');
  const [county,  setCounty]  = useState('');
  const [city,    setCity]    = useState('');
  const [address, setAddress] = useState('');
  const [notes,   setNotes]   = useState('');
  const [mapsLink, setMapsLink] = useState('');
  // form | confirm | waiting | success | failed | daraja_down
  const [step,  setStep]  = useState('form');
  const [error, setError] = useState('');
  const [mpesaRef,     setMpesaRef]     = useState('');
  const [customerName, setCustomerName] = useState('');

  const pollRef    = useRef(null);
  const timeoutRef = useRef(null);
  const checkoutId = useRef(null);
  // B3: timestamp of last Pay click — blocks re-clicks within PAY_DEBOUNCE window.
  const payLockAt  = useRef(0);

  useEffect(() => () => { clearPoll(); }, []);

  function clearPoll() {
    clearInterval(pollRef.current);
    clearTimeout(timeoutRef.current);
  }

  function startPolling() {
    pollRef.current = setInterval(async () => {
      try {
        const res  = await fetch(`/api/mpesa/status/${checkoutId.current}`);
        const data = await res.json();
        if (data.status === 'success') {
          clearPoll();
          setMpesaRef(data.mpesa_ref || '');
          setCustomerName(data.customer_name || '');
          setStep('success');
        } else if (data.status === 'failed') {
          clearPoll();
          setError(data.fail_reason || 'Payment failed. Please try again.');
          setStep('failed');
        }
      } catch (_) {}
    }, POLL_INTERVAL);

    timeoutRef.current = setTimeout(() => {
      clearPoll();
      setError('Payment timed out. Check your M-Pesa messages or try again.');
      setStep('failed');
    }, POLL_TIMEOUT);
  }

  function handleShareLocation() {
    getLocation(({ fullAddress, mapsLink: link }) => {
      setAddress(fullAddress);
      setMapsLink(link);
    });
  }

  // A1: validate form → go to confirmation screen rather than firing STK push immediately.
  function handleFormSubmit(e) {
    e.preventDefault();
    setError('');
    const clean = phone.replace(/\s/g, '');
    if (!/^(07|01|254)\d{8,9}$/.test(clean)) {
      setError('Enter a valid Safaricom number e.g. 0712 345 678'); return;
    }
    if (!county)         { setError('Please select your county.');          return; }
    if (!city.trim())    { setError('Please enter your city or town.');      return; }
    if (!address.trim()) { setError('Please enter your delivery address.'); return; }
    setStep('confirm');
  }

  // A1 + A4 + B3: fires only after customer explicitly confirms on the confirmation screen.
  async function handleConfirmPay() {
    // B3: hard debounce — if the button is tapped again within 30 seconds, do nothing.
    if (Date.now() - payLockAt.current < PAY_DEBOUNCE) return;
    payLockAt.current = Date.now();

    setStep('waiting');
    const clean = phone.replace(/\s/g, '');

    // A4: AbortController gives us a hard 15-second ceiling on the STK push request.
    // Daraja sometimes accepts the connection but never responds — this prevents an
    // infinite spinner and surfaces the WhatsApp fallback.
    const controller = new AbortController();
    const stkTimer   = setTimeout(() => controller.abort(), STK_TIMEOUT);

    try {
      const orderId = `ORD-${Date.now()}`;
      const res = await fetch('/api/mpesa/stkpush', {
        method:  'POST',
        signal:  controller.signal,
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ phone: clean, amount: total, orderId, address, county, city, notes, cartItems: cartSnapshot }),
      });
      clearTimeout(stkTimer);
      const data = await res.json();
      if (!res.ok) {
        // A4: 5xx = Daraja-side outage → show the WhatsApp fallback.
        if (res.status >= 500) { setStep('daraja_down'); return; }
        setError(data.error || 'Failed to initiate payment.');
        setStep('failed');
        return;
      }
      checkoutId.current = data.checkoutRequestId;
      startPolling();
    } catch (err) {
      clearTimeout(stkTimer);
      // A4: AbortError means our 15-second timer fired — Daraja is unreachable.
      if (err.name === 'AbortError') { setStep('daraja_down'); return; }
      setError('Network error. Check your connection.');
      setStep('failed');
    }
  }

  // ── Success ───────────────────────────────────────────────────────────────────
  // B4: this screen is intentionally < 50KB: no external images, no tracking pixels,
  // inline SVG only. Customer on 3G must see their confirmation even if assets fail.
  if (step === 'success') return (
    <div className="mpesa-state mpesa-state--success" data-lightweight="true">
      <div className="mpesa-state__icon">✓</div>
      <h3>Payment Confirmed!</h3>
      {customerName && (
        <div className="mpesa-customer">
          <span className="mpesa-customer__label">M-Pesa Name</span>
          <span className="mpesa-customer__name">{customerName}</span>
        </div>
      )}
      <div className="mpesa-receipt">
        <div className="mpesa-receipt__row"><span>Receipt</span><strong>{mpesaRef}</strong></div>
        <div className="mpesa-receipt__row"><span>Phone</span><strong>{phone}</strong></div>
        <div className="mpesa-receipt__row">
          <span>Delivering to</span>
          <strong>{[city, county].filter(Boolean).join(', ')}</strong>
        </div>
        <div className="mpesa-receipt__row mpesa-receipt__row--total">
          <span>Amount Paid</span><strong>Ksh {total.toLocaleString('en-KE')}</strong>
        </div>
      </div>
      <p className="mpesa-state__msg">Your order is confirmed. We'll contact you to arrange delivery.</p>
      <button className="btn btn-whatsapp" style={{ marginBottom: 8 }} onClick={() => {
        const clean = phone.replace(/^0/, '254').replace(/^\+/, '');
        const msg = [
          '🧾 PAYMENT RECEIPT — Kamili', '',
          customerName ? `Customer: ${customerName}` : '',
          `Phone: ${phone}`,
          `Delivering to: ${[city, county].filter(Boolean).join(', ')}`, '',
          `Receipt No: ${mpesaRef}`,
          `Amount Paid: Ksh ${total.toLocaleString('en-KE')}`, '',
          'Thank you for shopping at Kamili! 🛍️',
        ].filter(l => l !== null && l !== undefined).join('\n').replace(/\n{3,}/g, '\n\n');
        window.open(`https://wa.me/${clean}?text=${encodeURIComponent(msg)}`, '_blank', 'noopener,noreferrer');
      }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" style={{ marginRight: 6 }}>
          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413z"/>
        </svg>
        Send receipt to my WhatsApp
      </button>
      <button className="btn btn-gold" onClick={clearCart}>Done</button>
    </div>
  );

  // ── Failed ────────────────────────────────────────────────────────────────────
  if (step === 'failed') return (
    <div className="mpesa-state mpesa-state--failed">
      <div className="mpesa-state__icon">✕</div>
      <h3>Payment Failed</h3>
      <p className="mpesa-state__msg">{error}</p>
      <div className="mpesa-state__actions">
        <button className="btn btn-gold" onClick={() => { payLockAt.current = 0; setStep('form'); setError(''); }}>Try Again</button>
        <button className="btn btn-outline" onClick={onBack}>Back</button>
      </div>
    </div>
  );

  // ── Waiting ───────────────────────────────────────────────────────────────────
  if (step === 'waiting') return (
    <div className="mpesa-state">
      <div className="mpesa-spinner" />
      <h3>Check Your Phone</h3>
      <p className="mpesa-state__msg">
        A prompt was sent to <strong>{phone}</strong>.<br />
        Enter your M-Pesa PIN to pay <strong>Ksh {total.toLocaleString('en-KE')}</strong>.
      </p>
      <p className="mpesa-state__hint">Do not close this page.</p>
    </div>
  );

  // ── A4: Daraja outage fallback ────────────────────────────────────────────────
  if (step === 'daraja_down') return (
    <div className="mpesa-state mpesa-state--warn">
      <div className="mpesa-state__icon" style={{ fontSize: 24 }}>!</div>
      <h3>M-Pesa Is Acting Up</h3>
      <p className="mpesa-state__msg">
        M-Pesa is acting up. Pay via WhatsApp instead? Your cart is safe.
      </p>
      <div className="mpesa-state__actions">
        {/* setCheckoutView('whatsapp') switches the CartModal view without clearing items */}
        <button className="btn btn-whatsapp" onClick={() => setCheckoutView('whatsapp')}>
          Pay via WhatsApp instead
        </button>
        <button className="btn btn-outline" onClick={() => { payLockAt.current = 0; setStep('confirm'); }}>
          Try M-Pesa Again
        </button>
      </div>
    </div>
  );

  // ── A1: Confirmation screen ───────────────────────────────────────────────────
  if (step === 'confirm') return (
    <div className="mpesa-state">
      <h3>Confirm Payment</h3>
      <p className="mpesa-state__msg">
        We'll send the M-Pesa prompt to <strong>{maskPhone(phone)}</strong> — correct?
      </p>
      <p className="mpesa-state__msg" style={{ marginTop: 4 }}>
        Amount: <strong>Ksh {total.toLocaleString('en-KE')}</strong>
      </p>
      <div className="mpesa-state__actions" style={{ marginTop: 20 }}>
        <button className="btn btn-gold" onClick={handleConfirmPay}>Confirm &amp; Pay</button>
        <button className="btn btn-outline" onClick={() => setStep('form')}>Edit</button>
      </div>
    </div>
  );

  // ── Form ──────────────────────────────────────────────────────────────────────
  return (
    <form className="mpesa-form" onSubmit={handleFormSubmit}>
      <div className="mpesa-form-scroll">
        <div className="mpesa-form__header">
          <button type="button" className="mpesa-back" onClick={onBack}>←</button>
          <span>Pay with M-Pesa</span>
        </div>

        <div className="mpesa-total">
          Ksh {total.toLocaleString('en-KE')}
          <span className="mpesa-items"> · {items.length} item{items.length > 1 ? 's' : ''}</span>
        </div>

        <div className="form-group">
          <label className="form-label">Safaricom Number *</label>
          <input type="tel" placeholder="0712 345 678" value={phone}
            onChange={(e) => setPhone(e.target.value)} inputMode="numeric" required />
          <span className="mpesa-hint">Your M-Pesa name will be auto-filled from payment</span>
        </div>

        <div className="mpesa-location-row">
          <div className="form-group">
            <label className="form-label">County *</label>
            <select value={county} onChange={(e) => setCounty(e.target.value)} required>
              <option value="">Select county</option>
              {COUNTIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">City / Town *</label>
            <input type="text" placeholder="e.g. Westlands"
              value={city} onChange={(e) => setCity(e.target.value)} required />
          </div>
        </div>

        <div className="form-group">
          <div className="mpesa-addr-header">
            <label className="form-label">Detailed Address *</label>
            <button type="button" className="mpesa-loc-btn" onClick={handleShareLocation} disabled={locLoading}>
              {locLoading
                ? '…'
                : <><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="3"/>
                    <path d="M12 2v2m0 16v2M2 12h2m16 0h2"/>
                  </svg> Use my location</>
              }
            </button>
          </div>
          <textarea rows={2}
            placeholder="Street, building, apartment, floor…"
            value={address} onChange={(e) => setAddress(e.target.value)} required />
          {mapsLink && (
            <a className="mpesa-maps-link" href={mapsLink} target="_blank" rel="noopener noreferrer">
              ↗ View on Google Maps
            </a>
          )}
          {locError && <p className="form-error">{locError}</p>}
        </div>

        <div className="form-group">
          <label className="form-label">Delivery Notes <span style={{ color: 'var(--muted2)' }}>(optional)</span></label>
          <textarea rows={2}
            placeholder="Gate colour, landmark, preferred time…"
            value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
      </div>

      <div className="mpesa-form-footer">
        {error && <p className="form-error" style={{ marginBottom: 10 }}>{error}</p>}
        {/* B3: type="submit" naturally prevents double-submit in most browsers;
            payLockAt ref blocks the confirm handler if tapped again within 30s */}
        <button type="submit" className="btn btn-gold mpesa-submit">
          Pay Ksh {total.toLocaleString('en-KE')} with M-Pesa
        </button>
      </div>
    </form>
  );
}
