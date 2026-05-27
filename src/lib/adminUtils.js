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
export function statusFromQty(qty) {
  const n = Number(qty);
  if (isNaN(n) || n <= 0) return 'Pre-Order';
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
