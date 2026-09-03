// OrdersTab — the order book for a WhatsApp shop.
//
// M-Pesa is gone, so there is no gateway to tell us an order was paid. The owner
// IS the payment system now, which means the lifecycle has to be driven by hand:
//
//   new  →  confirmed  →  paid  →  dispatched
//     └──────────────────────────→  cancelled
//
//   new        an order arrived from the site; nobody has replied yet
//   confirmed  owner replied on WhatsApp, customer committed
//   paid       money received  → this is what fires the stock decrement
//   dispatched on its way      → stamps dispatched_at, arms the review prompt
//   cancelled  fell through
//
// Marking an order 'paid' also records HOW they paid, because without that
// "Today's Revenue" is a number nobody can trust.
import { useState, useMemo, Fragment, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import { fmt, fmtDate } from '../../lib/adminUtils';
import { uploadImage } from '../../lib/imageUpload';
import { useAuth } from '../../context/AuthContext';

const FILTERS = [
  { key: 'all',        label: 'All'        },
  { key: 'new',        label: 'New'        },
  { key: 'confirmed',  label: 'Confirmed'  },
  { key: 'paid',       label: 'Paid'       },
  { key: 'dispatched', label: 'Dispatched' },
  { key: 'cancelled',  label: 'Cancelled'  },
];

// How the money actually arrived. Shown in the "Mark as paid" prompt.
const PAY_METHODS = [
  { key: 'cash',       label: 'Cash on delivery' },
  { key: 'mpesa-till', label: 'M-Pesa Till / Paybill' },
  { key: 'send-money', label: 'M-Pesa Send Money' },
  { key: 'bank',       label: 'Bank transfer' },
];

// Normalise a phone string to its last 9 digits — same logic as the DB trigger,
// so search matches +254…, 0…, 254… and bare 9-digit formats alike.
function normPhone(raw) {
  return (raw || '').replace(/\D/g, '').slice(-9);
}

// Which statuses count as money in the bank.
const PAID_STATES = ['paid', 'dispatched'];

async function sendDispatchWhatsApp(p) {
  const clean = (p.phone || '').replace(/^0/, '254').replace(/\D/g, '');
  if (!clean) return;
  const name = p.customer_name ? `, ${p.customer_name.split(' ')[0]}` : '';
  const msg  = [
    `Hi${name}! 📦`, '',
    'Your Kamili order has been dispatched and is on its way.', '',
    `*Order ref:* ${p.order_id || '—'}`,
    `*Amount:* Ksh ${Number(p.amount).toLocaleString('en-KE')}`, '',
    "We'll be in touch to confirm delivery. Thank you for choosing Kamili! 🛍️", '',
    '— Kamili Nairobi',
  ].join('\n');
  window.open(`https://wa.me/${clean}?text=${encodeURIComponent(msg)}`, '_blank', 'noopener,noreferrer');
  // dispatched_at is what the review-prompt scheduler reads 5 days later.
  await supabase.from('payments')
    .update({ status: 'dispatched', dispatched_at: new Date().toISOString() })
    .eq('id', p.id);
}

const WaIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" style={{ marginRight: 4 }}>
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413z"/>
  </svg>
);

function ReceiptContent({ p }) {
  const full = ts => ts ? new Date(ts).toLocaleString('en-KE', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  }) : '—';
  const method = PAY_METHODS.find(m => m.key === p.paid_method)?.label
    || p.paid_method || '—';

  return (
    <div className="receipt-print">
      <div className="receipt-print__brand">KAMILI</div>
      <div className="receipt-print__tagline">Quiet Luxury · Nairobi</div>
      <hr className="receipt-print__divider" />
      <div className="receipt-print__row"><span>Order Ref</span><strong>{p.order_id || '—'}</strong></div>
      <div className="receipt-print__row"><span>Ordered</span><strong>{full(p.created_at)}</strong></div>
      {p.paid_at && <div className="receipt-print__row"><span>Paid</span><strong>{full(p.paid_at)}</strong></div>}
      <hr className="receipt-print__divider" />
      <div className="receipt-print__row"><span>Customer</span><strong>{p.customer_name || '—'}</strong></div>
      <div className="receipt-print__row">
        <span>Phone</span>
        <strong>{p.phone ? p.phone.replace(/^254/, '0') : '—'}</strong>
      </div>
      <hr className="receipt-print__divider" />
      {Array.isArray(p.cart_items) && p.cart_items.length > 0 && (
        <>
          {p.cart_items.map((ci, i) => (
            <div key={i} className="receipt-print__row">
              <span>{ci.name} ×{ci.qty}</span>
              <strong>{fmt(ci.price * ci.qty)}</strong>
            </div>
          ))}
          <hr className="receipt-print__divider" />
        </>
      )}
      <div className="receipt-print__row receipt-print__row--total">
        <span>Total</span><strong>{fmt(p.amount)}</strong>
      </div>
      <div className="receipt-print__row"><span>Paid by</span><strong>{method}</strong></div>
      <div className="receipt-print__row">
        <span>Status</span>
        <strong style={{ color: 'var(--gold)' }}>
          {PAID_STATES.includes(p.status) ? 'PAID ✓' : p.status.toUpperCase()}
        </strong>
      </div>
      <hr className="receipt-print__divider" />
      <div className="receipt-print__footer">Thank you for shopping at Kamili 🛍️</div>
    </div>
  );
}

// Dispatch photo uploader — per-row component so upload state stays isolated.
function DispatchPhotoCell({ payment, isReadOnly }) {
  const fileRef = useRef(null);
  const [uploading,   setUploading]   = useState(false);
  const [photoUrl,    setPhotoUrl]    = useState(payment.dispatch_photo_url || null);
  const [uploadError, setUploadError] = useState('');

  async function handleFile(e) {
    const file = e.target.files[0];
    if (!file) return;
    setUploading(true);
    setUploadError('');
    try {
      const folder = `dispatch/${payment.order_id || payment.id}`;
      const url    = await uploadImage(file, folder);
      const { error } = await supabase.from('payments')
        .update({ dispatch_photo_url: url })
        .eq('id', payment.id);
      if (error) throw error;
      setPhotoUrl(url);
    } catch (err) {
      setUploadError(err.message);
    } finally {
      setUploading(false);
    }
  }

  if (isReadOnly) return photoUrl
    ? <a href={photoUrl} target="_blank" rel="noopener noreferrer" className="dispatch-thumb-link">
        <img src={photoUrl} alt="dispatch" className="dispatch-thumb" />
      </a>
    : null;

  return (
    <div className="dispatch-photo-cell">
      <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleFile} />
      {photoUrl ? (
        <a href={photoUrl} target="_blank" rel="noopener noreferrer" className="dispatch-thumb-link">
          <img src={photoUrl} alt="dispatch proof" className="dispatch-thumb" title="Click to view full size" />
        </a>
      ) : (
        <button className="ac-btn ac-btn--link" style={{ fontSize: 10 }}
          onClick={() => fileRef.current?.click()} disabled={uploading}>
          {uploading ? 'Uploading…' : '📷 Photo'}
        </button>
      )}
      {uploadError && <span style={{ color: '#ef4444', fontSize: 10 }}>{uploadError}</span>}
    </div>
  );
}

// The "how did they pay?" step. Recording the method is what makes the revenue
// KPI mean anything, so marking paid always goes through here.
function PaidModal({ payment, onClose }) {
  const [method, setMethod] = useState('cash');
  const [saving, setSaving] = useState(false);

  async function confirm() {
    setSaving(true);
    // Setting status='paid' is what fires fn_decrement_stock_on_payment.
    await supabase.from('payments')
      .update({ status: 'paid', paid_method: method, paid_at: new Date().toISOString() })
      .eq('id', payment.id);
    setSaving(false);
    onClose();
  }

  return (
    <div className="receipt-modal-overlay" onClick={onClose}>
      <div className="receipt-modal" style={{ maxWidth: 380 }} onClick={e => e.stopPropagation()}>
        <div className="receipt-modal__header">
          <h3>Mark as paid</h3>
          <button onClick={onClose}>✕</button>
        </div>
        <div className="receipt-modal__body">
          <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 14 }}>
            {payment.customer_name || 'Customer'} · <strong style={{ color: 'var(--gold)' }}>{fmt(payment.amount)}</strong>
            <br />This also removes the items from stock.
          </p>
          <div className="form-group">
            <label className="form-label">How did they pay?</label>
            <select value={method} onChange={e => setMethod(e.target.value)}>
              {PAY_METHODS.map(m => <option key={m.key} value={m.key}>{m.label}</option>)}
            </select>
          </div>
        </div>
        <div className="receipt-modal__actions">
          <button className="btn btn-gold" onClick={confirm} disabled={saving}>
            {saving ? 'Saving…' : 'Confirm payment'}
          </button>
          <button className="btn btn-outline" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

export default function OrdersTab({ payments, defaultFilter = 'all' }) {
  const { isReadOnly } = useAuth();
  const [filter,       setFilter]       = useState(defaultFilter);
  const [expanded,     setExpanded]     = useState(new Set());
  const [receiptModal, setReceiptModal] = useState(null);
  const [paidModal,    setPaidModal]    = useState(null);
  const [phoneSearch,  setPhoneSearch]  = useState('');

  // Possible duplicates: same phone, both paid, within 30 minutes.
  // Worth flagging before you dispatch two of the same thing.
  const duplicateIds = useMemo(() => {
    const ids  = new Set();
    const paid = payments.filter(p => PAID_STATES.includes(p.status) && p.phone);
    for (let i = 0; i < paid.length; i++) {
      for (let j = i + 1; j < paid.length; j++) {
        const pi = paid[i], pj = paid[j];
        if (pi.phone === pj.phone &&
            Math.abs(new Date(pi.created_at) - new Date(pj.created_at)) < 30 * 60 * 1000) {
          ids.add(pi.id); ids.add(pj.id);
        }
      }
    }
    return ids;
  }, [payments]);

  const visiblePayments = useMemo(() => {
    const q = normPhone(phoneSearch);
    const list = q.length >= 7
      ? payments.filter(p => normPhone(p.phone).endsWith(q) || q.endsWith(normPhone(p.phone)))
      : payments;
    return filter === 'all' ? list : list.filter(p => p.status === filter);
  }, [payments, filter, phoneSearch]);

  const counts = useMemo(() => {
    const c = { all: payments.length };
    for (const f of FILTERS) {
      if (f.key !== 'all') c[f.key] = payments.filter(p => p.status === f.key).length;
    }
    return c;
  }, [payments]);

  function toggleExpand(id) {
    setExpanded(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  async function setStatus(p, status) {
    await supabase.from('payments').update({ status }).eq('id', p.id);
  }

  // Reuse the existing status-pill colours: green = money in, amber = in
  // progress, red = dead.
  const pillClass = s => `status-pill status-pill--${
    PAID_STATES.includes(s) ? 'available' :
    s === 'cancelled'       ? 'out-of-stock' : 'pre-order'
  }`;

  return (
    <div>
      <div style={{ marginBottom: 12 }}>
        <input
          type="tel"
          className="orders-phone-search"
          placeholder="Search by phone: +254712…, 0712…, 712…"
          value={phoneSearch}
          onChange={e => setPhoneSearch(e.target.value)}
          inputMode="numeric"
        />
      </div>

      <div className="tab-filter-bar">
        {FILTERS.map(f => (
          <button key={f.key}
            className={`tab-filter-btn${filter === f.key ? ' active' : ''}`}
            onClick={() => setFilter(f.key)}>
            {f.label} <span className="tab-filter-count">{counts[f.key]}</span>
          </button>
        ))}
      </div>

      {visiblePayments.length === 0 ? (
        <p className="admin-empty">
          {phoneSearch ? 'No orders match that phone number.' : 'No orders match this filter.'}
        </p>
      ) : (
        <div className="tbl-wrap">
          <table className="admin-tbl">
            <thead>
              <tr>
                <th style={{ width: 28 }}></th>
                <th>Date</th>
                <th>Customer</th>
                <th>Phone</th>
                <th>Amount</th>
                <th>Ref</th>
                <th>Status</th>
                <th>Photo</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {visiblePayments.map(p => {
                const hasItems    = Array.isArray(p.cart_items) && p.cart_items.length > 0;
                const isExpanded  = expanded.has(p.id);
                const isDuplicate = duplicateIds.has(p.id);
                const isPaid      = PAID_STATES.includes(p.status);

                return (
                  <Fragment key={p.id}>
                    <tr style={isDuplicate ? { background: 'rgba(251,191,36,0.07)' } : {}}>
                      <td>
                        {hasItems && (
                          <button className="expand-btn" onClick={() => toggleExpand(p.id)}
                            title={isExpanded ? 'Collapse' : 'Show items'}>
                            {isExpanded ? '▾' : '▸'}
                          </button>
                        )}
                      </td>
                      <td style={{ fontSize: 11, color: 'var(--muted)', whiteSpace: 'nowrap' }}>
                        {fmtDate(p.created_at)}
                      </td>
                      <td>
                        {p.customer_name
                          ? <span className="sale-name">{p.customer_name}</span>
                          : <span style={{ color: 'var(--muted2)', fontSize: 11 }}>—</span>}
                        {isDuplicate && <span className="duplicate-badge">POSSIBLE DUPLICATE</span>}
                      </td>
                      <td style={{ fontSize: 12 }}>
                        {/* Tap-to-chat: the owner works out of WhatsApp, so the
                            phone number should open the conversation directly. */}
                        {p.phone
                          ? <a href={`https://wa.me/${p.phone.replace(/^0/, '254').replace(/\D/g, '')}`}
                               target="_blank" rel="noopener noreferrer"
                               style={{ color: 'var(--green)' }}>
                              {p.phone.replace(/^254/, '0')}
                            </a>
                          : '—'}
                      </td>
                      <td style={{ fontWeight: 500, color: 'var(--gold)' }}>{fmt(p.amount)}</td>
                      <td style={{ fontSize: 11, fontFamily: 'monospace', letterSpacing: '0.05em' }}>
                        {p.order_id || '—'}
                      </td>
                      <td><span className={pillClass(p.status)}>{p.status}</span></td>
                      <td>{isPaid && <DispatchPhotoCell payment={p} isReadOnly={isReadOnly} />}</td>
                      <td>
                        <div className="tbl-actions">
                          {!isReadOnly && p.status === 'new' && (
                            <>
                              <button className="btn btn-outline" style={{ height: 30, padding: '0 10px', fontSize: 11 }}
                                onClick={() => setStatus(p, 'confirmed')}>Confirm</button>
                              <button className="ac-btn ac-btn--link" style={{ fontSize: 10 }}
                                onClick={() => setStatus(p, 'cancelled')}>Cancel</button>
                            </>
                          )}
                          {!isReadOnly && p.status === 'confirmed' && (
                            <>
                              <button className="btn btn-gold" style={{ height: 30, padding: '0 10px', fontSize: 11 }}
                                onClick={() => setPaidModal(p)}>Mark paid</button>
                              <button className="ac-btn ac-btn--link" style={{ fontSize: 10 }}
                                onClick={() => setStatus(p, 'cancelled')}>Cancel</button>
                            </>
                          )}
                          {!isReadOnly && p.status === 'paid' && (
                            <button className="btn btn-whatsapp" style={{ height: 30, padding: '0 10px', fontSize: 11 }}
                              onClick={() => sendDispatchWhatsApp(p)}
                              title="Tell the customer it's on the way">
                              <WaIcon />Dispatch
                            </button>
                          )}
                          {isPaid && (
                            <button className="btn btn-outline" style={{ height: 30, padding: '0 10px', fontSize: 11 }}
                              onClick={() => setReceiptModal(p)}>Receipt</button>
                          )}
                        </div>
                      </td>
                    </tr>

                    {isExpanded && hasItems && (
                      <tr className="cart-items-row">
                        <td colSpan={9}>
                          <div className="cart-items-expand">
                            <span className="cart-items-expand__label">Items ordered:</span>
                            <div className="cart-items-expand__list">
                              {p.cart_items.map((ci, i) => (
                                <div key={i} className="cart-items-expand__item">
                                  <span className="cart-items-expand__name">{ci.name}</span>
                                  <span className="cart-items-expand__qty">×{ci.qty}</span>
                                  <span className="cart-items-expand__price">
                                    {fmt(Number(ci.price) * ci.qty)}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {paidModal && <PaidModal payment={paidModal} onClose={() => setPaidModal(null)} />}

      {receiptModal && (
        <div className="receipt-modal-overlay" onClick={() => setReceiptModal(null)}>
          <div className="receipt-modal" onClick={e => e.stopPropagation()}>
            <div className="receipt-modal__header">
              <h3>Receipt</h3>
              <button onClick={() => setReceiptModal(null)}>✕</button>
            </div>
            <div className="receipt-modal__body">
              <ReceiptContent p={receiptModal} />
            </div>
            <div className="receipt-modal__actions">
              <button className="btn btn-gold" onClick={() => window.print()}>Print Receipt</button>
              <button className="btn btn-outline" onClick={() => setReceiptModal(null)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
