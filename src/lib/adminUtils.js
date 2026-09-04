// Shared constants and helpers for admin tab components.
// Centralised here so every tab formats numbers and dates identically.

export const STATUSES = ['Available', 'Low Stock', 'Pre-Order', 'Out of Stock'];

export const BLANK_PRODUCT = {
  name: '', price: '', category: '', status: 'Available', quantity: '',
};

export const BLANK_SETTINGS = {
  whatsapp: '', phone: '', email: '', instagram: '',
  location: '', hours: '', tagline: '',
  // C2: vacation mode
  vacation_mode: false, vacation_message: '',
  // D3: renewal date tracking
  domain_renewal_date: '', hosting_renewal_date: '', ssl_renewal_date: '',
};

// Derive a status label from a quantity number.
// Pre-Order is never set automatically — only by explicit admin choice.
//
// Was returning 'Pre-Order' for qty<=0, directly contradicting the comment
// above it (and its own name — this computes status FROM a quantity, it
// has no idea whether the admin actually wants pre-orders). A customer
// checking a sold-out item would see "Pre-Order" — implying they can still
// order and it'll arrive later — when the truth was just "we don't have
// this and there's no restock plan". Out of Stock and Pre-Order are
// different promises to a customer; this shouldn't guess between them.
//
// This is the one place that maps a raw quantity to a status — callers
// that need to keep an item explicitly marked Pre-Order regardless of its
// count (see ProductsTab.jsx, AdminDashboard.jsx) check that first and
// only fall through to this for everything else.
export function statusFromQty(qty) {
  const n = Number(qty);
  if (isNaN(n) || n <= 0) return 'Out of Stock';
  if (n <= 10)             return 'Low Stock';
  return 'Available';
}

export const fmt = n =>
  `Ksh ${Number(n).toLocaleString('en-KE')}`;

export function fmtDate(ts) {
  if (!ts) return '—';
  return new Date(ts).toLocaleString('en-KE', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
  });
}
