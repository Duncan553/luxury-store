import { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { supabase } from '../lib/supabase';

const CartContext = createContext(null);

// Fallback only. The live number comes from store_settings.whatsapp (admin
// → Settings), fetched below. Before this, the Settings field only changed
// the About page's contact card while checkout stayed pinned to this
// constant — so changing the WhatsApp number in the admin would have sent
// every order to the old line while the site advertised the new one.
const WHATSAPP_FALLBACK = '254114256994';
const STORAGE_KEY       = 'kamili_cart';

// ── Shop-data cache ─────────────────────────────────────────────────────
// Categories and settings change rarely — a category is added now and then,
// a phone number even less often — but they were fetched fresh on every page
// load, and measured from a Kenyan connection a Supabase round trip costs
// 370-680ms. That is time a returning visitor spent waiting to be told the
// same four categories as last time.
//
// So they're cached, and the cached copy renders IMMEDIATELY on load while a
// fresh fetch runs in the background and replaces it if anything changed.
// A repeat visit paints its nav and category deck with no network wait at
// all; a stale name for a few hundred milliseconds is a fair trade for that,
// and the TTL caps how wrong it can ever be.
//
// Wrapped in try/catch throughout: localStorage throws outright in some
// private-browsing modes and in the Instagram in-app browser, which is where
// a lot of this traffic arrives from.
const CACHE_KEY = 'kamili_shop_v1';
const CACHE_TTL = 1000 * 60 * 30;   // 30 minutes

function readCache() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const { at, categories, settings } = JSON.parse(raw);
    if (!at || Date.now() - at > CACHE_TTL) return null;
    return { categories, settings };
  } catch { return null; }
}

function writeCache(categories, settings) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), categories, settings }));
  } catch { /* storage unavailable — the app just fetches every time */ }
}

// 0712345678 / +254 712 345 678 / 254712345678 all -> 254712345678
export function normaliseWaNumber(raw) {
  const digits = (raw || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('254')) return digits;
  return '254' + digits.replace(/^0+/, '');
}

// B2: Try localStorage first, fall back to sessionStorage.
// Instagram/Facebook in-app browsers sometimes wipe localStorage between page
// loads but preserve sessionStorage for the duration of the session.
function loadSavedCart() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY) || sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveCart(items) {
  const serialized = items.length ? JSON.stringify(items) : null;
  // Always write to both — whichever survives an IAB page reload wins on restore.
  try {
    if (serialized) localStorage.setItem(STORAGE_KEY, serialized);
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // localStorage blocked (private mode or IAB restriction) — fall through to sessionStorage
  }
  try {
    if (serialized) sessionStorage.setItem(STORAGE_KEY, serialized);
    else sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // sessionStorage also blocked — nothing we can do; cart is in-memory only
  }
}

export function CartProvider({ children }) {
  const [items,        setItems]        = useState(() => loadSavedCart());
  const [isOpen,       setIsOpen]       = useState(false);
  const [checkoutView, setCheckoutView] = useState('cart');
  // C2: vacation_mode — fetched once from store_settings on mount.
  // Propagated here so ProductCard reads it without a per-card Supabase query.
  const [vacationMode,    setVacationMode]    = useState(false);
  const [vacationMessage, setVacationMessage] = useState('');
  // Live WhatsApp number from admin → Settings; falls back to the constant
  // above only if the field is empty.
  const [waNumber,        setWaNumber]        = useState(WHATSAPP_FALLBACK);
  // The whole settings row, exposed so the footer can show real contact
  // details without a second query — this fetch already happens.
  const [settings,        setSettings]        = useState(() => readCache()?.settings ?? null);
  // Nav categories. Fetched here rather than in Navbar because BOTH Navbar and
  // MobileMenu need the same list — one fetch, one source of truth, no
  // duplicate query when the burger opens.
  // Seeded from cache so the very first render already has them.
  const [categories,      setCategories]      = useState(() => readCache()?.categories ?? []);

  // Persist to both storage layers on every cart change.
  useEffect(() => {
    saveCart(items);
  }, [items]);

  // Both shop-wide fetches live in ONE effect so the cache is written once,
  // when both have landed, rather than each overwriting the other's half.
  //
  // The nav used to be a hardcoded array of Bags/Jewelry/Watches, which made
  // admin -> Categories a half-feature: the owner could create a category and
  // assign products to it, /category/<slug> rendered fine, and no customer
  // could ever reach it. Now the nav IS the categories table.
  useEffect(() => {
    let alive = true;

    const settingsP = supabase
      .from('store_settings').select('*').eq('id', 'singleton').single()
      .then(({ data }) => data || null);

    // `id` and `cover_url` are needed as well as name/slug: the category deck
    // keys on id and renders cover_url. This selected only name and slug, so
    // the moment the home page stopped fetching categories for itself and
    // started reading them from here, every cover would have silently
    // disappeared.
    const catsP = supabase
      .from('categories').select('id, name, slug, cover_url').order('created_at')
      .then(({ data }) => data || null);

    Promise.all([settingsP, catsP]).then(([st, cats]) => {
      if (!alive) return;
      if (st) {
        setSettings(st);
        setVacationMode(!!st.vacation_mode);
        setVacationMessage(st.vacation_message || '');
        const n = normaliseWaNumber(st.whatsapp);
        if (n) setWaNumber(n);
      }
      if (cats) setCategories(cats);
      if (st || cats) writeCache(cats ?? readCache()?.categories ?? [], st ?? readCache()?.settings ?? null);
    });

    return () => { alive = false; };
  }, []);

  // Real bug, not just a described one: the cart never checked stock. A
  // customer could add more of an item than actually exists — 50 units of
  // a one-of-one bag — and the site would let them, right up until the
  // owner has to apologise after the fact. cartMax() is the one place that
  // decides the ceiling; both addItem and updateQty go through it.
  //
  // Pre-Order items have no real ceiling (that's the point of pre-order),
  // so they fall back to a high number rather than 0/undefined blocking
  // them entirely. A product with quantity ?? undefined (legacy rows with
  // no stock count set) is treated the same way — never silently blocks
  // a sale over data that was never filled in.
  const cartMax = (item) =>
    item.status === 'Pre-Order' || item.quantity == null ? 999 : item.quantity;

  const addItem = useCallback((product) => {
    setItems((prev) => {
      const existing = prev.find((i) => i.id === product.id);
      if (existing) {
        const max = cartMax(existing);
        return prev.map((i) => i.id === product.id ? { ...i, qty: Math.min(max, i.qty + 1) } : i);
      }
      return [...prev, { ...product, qty: 1 }];
    });
    setIsOpen(true);
  }, []);

  const removeItem = useCallback((id) => setItems((prev) => prev.filter((i) => i.id !== id)), []);

  const updateQty = useCallback((id, delta) => {
    setItems((prev) =>
      prev.map((i) => {
        if (i.id !== id) return i;
        const max = cartMax(i);
        return { ...i, qty: Math.min(max, i.qty + delta) };
      }).filter((i) => i.qty > 0)
    );
  }, []);

  const clearCart = useCallback(() => {
    setItems([]);
    setIsOpen(false);
    setCheckoutView('cart');
    // Wipe both storage layers immediately — don't wait for the useEffect flush —
    // so a fast refresh after checkout doesn't restore a paid-for cart.
    try { localStorage.removeItem(STORAGE_KEY); } catch {}
    try { sessionStorage.removeItem(STORAGE_KEY); } catch {}
  }, []);

  const openCheckout = useCallback((view = 'whatsapp') => {
    setCheckoutView(view);
    setIsOpen(true);
  }, []);

  const itemCount = items.reduce((s, i) => s + i.qty, 0);
  const total     = items.reduce((s, i) => s + i.price * i.qty, 0);

  // Saves the order to the DB FIRST, then opens WhatsApp.
  //
  // Why the order matters: WhatsApp is now the only checkout, and wa.me is a
  // fire-and-forget link — if we don't write the row before opening it, an order
  // that never reaches the chat leaves no trace at all. The DB row is the record;
  // the chat is the conversation.
  //
  // Returns { saved, opened, orderId, waUrl } so the UI can tell the truth:
  //   saved  = the row reached Supabase
  //   opened = window.open actually returned a window (popup NOT blocked)
  const checkoutViaWhatsApp = useCallback(async ({ name = '', phone = '' } = {}) => {
    if (!items.length) return { saved: false, opened: false };

    // Short human-readable ref the owner can quote in the chat: KML-M4X7K2P
    const orderId = `KML-${Date.now().toString(36).toUpperCase()}`;

    // cart_items is the snapshot the stock trigger reads when the order is
    // marked paid, so the price/qty are frozen at order time — not looked up later.
    const { error } = await supabase.from('payments').insert({
      order_id:      orderId,
      channel:       'whatsapp',
      status:        'new',
      customer_name: name  || null,
      phone:         phone || null,
      amount:        total,
      cart_items:    items.map(i => ({ id: i.id, name: i.name, qty: i.qty, price: i.price })),
    });

    // A failed insert must never block the sale — the chat is the real order
    // channel. Log it, report it upward, and still open WhatsApp.
    if (error) console.error('[order insert]', error.message);

    const lines = items.map((i) =>
      `  \u2022 ${i.status === 'Pre-Order' ? '[PRE-ORDER] ' : ''}${i.name} x${i.qty} \u2014 Ksh ${(i.price * i.qty).toLocaleString('en-KE')}`
    );
    const message = [
      `\ud83d\uded2 NEW ORDER ${orderId} \u2014 Kamili`,
      '',
      name  ? `\ud83d\udc64 Customer: ${name}` : '',
      phone ? `\ud83d\udcde Phone: ${phone}`   : '',
      '',
      '\ud83d\udce6 Items:',
      ...lines,
      '',
      `\ud83d\udcb0 Total: Ksh ${total.toLocaleString('en-KE')}`,
      '',
      'Hi! I would like to order these. Where can you deliver?',
    ].filter(l => l !== '').join('\n');

    const waUrl = `https://wa.me/${waNumber}?text=${encodeURIComponent(message)}`;

    // win === null means the popup was blocked. Extremely common inside the
    // Instagram / Facebook in-app browsers, which is where most traffic arrives.
    const win = window.open(waUrl, '_blank', 'noopener,noreferrer');

    return { saved: !error, opened: !!win, orderId, waUrl };
  }, [items, total, waNumber]);

  return (
    <CartContext.Provider value={{
      items, itemCount, total,
      isOpen, setIsOpen,
      checkoutView, setCheckoutView,
      openCheckout,
      addItem, removeItem, updateQty,
      clearCart, checkoutViaWhatsApp,
      vacationMode, vacationMessage, waNumber, categories, settings,
    }}>
      {children}
    </CartContext.Provider>
  );
}

export function useCart() { return useContext(CartContext); }
