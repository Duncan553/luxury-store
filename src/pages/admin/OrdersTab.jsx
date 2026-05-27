// OrdersTab — unified orders list.
// A3: highlights possible duplicate payments (same phone, within 30 min).
// A5: phone search box — any format normalised to last-9-digits match.
// C1: dispatch photo upload — proof of dispatch saved to Supabase Storage.
import { useState, useMemo, Fragment, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import { fmt, fmtDate } from '../../lib/adminUtils';
import { uploadImage } from '../../lib/imageUpload';
import { useAuth } from '../../context/AuthContext';

const FILTERS = [
  { key: 'all',     label: 'All'     },
  { key: 'success', label: 'Paid'    },
  { key: 'pending', label: 'Pending' },
  { key: 'failed',  label: 'Failed'  },
];

// A5: normalise a phone string to its last 9 digits — same logic as the DB trigger.
function normPhone(raw) {
  return (raw || '').replace(/\D/g, '').slice(-9);
}

async function sendDispatchWhatsApp(p) {
  const clean = (p.phone || '').replace(/^0/, '254').replace(/\D/g, '');
  if (!clean) return;
  const name = p.customer_name ? `, ${p.customer_name.split(' ')[0]}` : '';
  const dest = [p.city, p.county].filter(Boolean).join(', ') || 'your location';
  const msg  = [
    `Hi${name}! 📦`, '',
    `Your Kamili order has been dispatched and is on its way to ${dest}.`, '',
    `*Order ref:* ${p.order_id || p.mpesa_ref || '—'}`,
    `*Amount paid:* Ksh ${Number(p.amount).toLocaleString('en-KE')}`, '',
    "We'll be in touch to confirm delivery. Thank you for choosing Kamili! 🛍️", '',
    '— Kamili Nairobi',
  ].join('\n');
  window.open(`https://wa.me/${clean}?text=${encodeURIComponent(msg)}`, '_blank', 'noopener,noreferrer');
  supabase.from('payments')
    .update({ dispatched_at: new Date().toISOString() })
    .eq('id', p.id)
    .then(({ error }) => { if (error) console.warn('[dispatch stamp]', error.message); });
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
  return (
    <div className="receipt-print">
      <div className="receipt-print__brand">KAMILI</div>
      <div className="receipt-print__tagline">Quiet Luxury · Nairobi</div>
      <hr className="receipt-print__divider" />
      <div className="receipt-print__row"><span>Receipt No.</span><strong>{p.mpesa_ref || '—'}</strong></div>
      <div className="receipt-print__row"><span>Date</span><strong>{full(p.created_at)}</strong></div>
      <div className="receipt-print__row"><span>Order ID</span><strong>{p.order_id || '—'}</strong></div>
      <hr className="receipt-print__divider" />
      <div className="receipt-print__row"><span>Customer</span><strong>{p.customer_name || '—'}</strong></div>
      <div className="receipt-print__row">
        <span>Phone</span>
        <strong>{p.phone ? p.phone.replace(/^254/, '0') : '—'}</strong>
      </div>
      <div className="receipt-print__row">
        <span>Location</span>
        <strong>{[p.city, p.county].filter(Boolean).join(', ') || '—'}</strong>
      </div>
      {p.address && <div className="receipt-print__row"><span>Address</span><strong>{p.address}</strong></div>}
      {p.notes   && <div className="receipt-print__row"><span>Notes</span><strong>{p.notes}</strong></div>}
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
        <span>Amount Paid</span><strong>{fmt(p.amount)}</strong>
      </div>
      <div className="receipt-print__row"><span>Method</span><strong>M-Pesa STK Push</strong></div>
      <div className="receipt-print__row">
        <span>Status</span><strong style={{ color: 'var(--gold)' }}>PAID ✓</strong>
      </div>
      <hr className="receipt-print__divider" />
      <div className="receipt-print__footer">Thank you for shopping at Kamili 🛍️</div>
    </div>
  );
}

// C1: dispatch photo uploader — per-row component to keep state isolated.
function DispatchPhotoCell({ payment, isReadOnly }) {
  const fileRef        = useRef(null);
  const [uploading,    setUploading]    = useState(false);
  const [photoUrl,     setPhotoUrl]     = useState(payment.dispatch_photo_url || null);
  const [uploadError,  setUploadError]  = useState('');

  async function handleFile(e) {
    const file = e.target.files[0];
    if (!file) return;
    setUploading(true);
    setUploadError('');
    try {
      // Reuse the existing uploadImage utility (compresses + uploads to 'images' bucket).
      // C1: dispatch photos live under images/dispatch/{orderId} for easy identification.
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

export default function OrdersTab({ payments, defaultFilter = 'all' }) {
  const { isReadOnly } = useAuth();
  const [filter,       setFilter]       = useState(defaultFilter);
  const [expanded,     setExpanded]     = useState(new Set());
  const [receiptModal, setReceiptModal] = useState(null);
  // A5: phone search — any format, normalised on the fly.
  const [phoneSearch,  setPhoneSearch]  = useState('');

  // A3: build a set of payment IDs that are possible duplicates.
  // Criteria: same phone + status=success + within 30 minutes of each other.
  const duplicateIds = useMemo(() => {
    const ids     = new Set();
    const success = payments.filter(p => p.status === 'success' && p.phone);
    for (let i = 0; i < success.length; i++) {
      for (let j = i + 1; j < success.length; j++) {
        const pi = success[i], pj = success[j];
        if (pi.phone === pj.phone &&
            Math.abs(new Date(pi.created_at) - new Date(pj.created_at)) < 30 * 60 * 1000) {
          ids.add(pi.id);
          ids.add(pj.id);
        }
      }
    }
    return ids;
  }, [payments]);

  // A5: filter by normalised phone — matches +254, 07, 254, and bare 9-digit formats.
  const visiblePayments = useMemo(() => {
    const q = normPhone(phoneSearch);
    let list = q.length >= 7
      ? payments.filter(p => normPhone(p.phone).endsWith(q) || q.endsWith(normPhone(p.phone)))
      : payments;
    return filter === 'all' ? list : list.filter(p => p.status === filter);
  }, [payments, filter, phoneSearch]);

  const counts = {
    all:     payments.length,
    success: payments.filter(p => p.status === 'success').length,
    pending: payments.filter(p => p.status === 'pending').length,
    failed:  payments.filter(p => p.status === 'failed').length,
  };

  function toggleExpand(id) {
    setExpanded(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  const pillClass = s =>
    `status-pill status-pill--${s === 'success' ? 'available' : s === 'pending' ? 'pre-order' : 'out-of-stock'}`;

  return (
    <div>
      {/* A5: phone search */}
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

      {/* Filter bar */}
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
          {phoneSearch ? 'No payments match that phone number.' : 'No orders match this filter.'}
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
                <th>Location</th>
                <th>Amount</th>
                <th>Ref</th>
                <th>Status</th>
                <th>Photo</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {visiblePayments.map(p => {
                const hasItems  = Array.isArray(p.cart_items) && p.cart_items.length > 0;
                const isExpanded = expanded.has(p.id);
                // A3: flag possible duplicates so I can investigate before re-dispatching.
                const isDuplicate = duplicateIds.has(p.id);

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
                        {/* A3: amber badge — same phone paid twice in 30 min — investigate before dispatching */}
                        {isDuplicate && (
                          <span className="duplicate-badge">POSSIBLE DUPLICATE</span>
                        )}
                      </td>
                      <td style={{ fontSize: 12 }}>
                        {p.phone ? p.phone.replace(/^254/, '0') : '—'}
                      </td>
                      <td style={{ fontSize: 12 }}>
                        {[p.city, p.county].filter(Boolean).join(', ') || '—'}
                      </td>
                      <td style={{ fontWeight: 500, color: 'var(--gold)' }}>{fmt(p.amount)}</td>
                      <td style={{ fontSize: 11, fontFamily: 'monospace', letterSpacing: '0.05em' }}>
                        {p.mpesa_ref || '—'}
                      </td>
                      <td>
                        <span className={pillClass(p.status)}>
                          {p.status === 'success' ? 'Paid' : p.status}
                        </span>
                      </td>
                      {/* C1: dispatch photo column */}
                      <td>
                        {p.status === 'success' && (
                          <DispatchPhotoCell payment={p} isReadOnly={isReadOnly} />
                        )}
                      </td>
                      <td>
                        {p.status === 'success' && (
                          <div className="tbl-actions">
                            {!isReadOnly && (
                              <button className="btn btn-whatsapp"
                                style={{ height: 30, padding: '0 10px', fontSize: 11 }}
                                onClick={() => sendDispatchWhatsApp(p)}
                                title="Notify customer their order is on the way">
                                <WaIcon />Sent
                              </button>
                            )}
                            <button className="btn btn-outline"
                              style={{ height: 30, padding: '0 10px', fontSize: 11 }}
                              onClick={() => setReceiptModal(p)}>
                              Receipt
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>

                    {isExpanded && hasItems && (
                      <tr className="cart-items-row">
                        <td colSpan={10}>
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
