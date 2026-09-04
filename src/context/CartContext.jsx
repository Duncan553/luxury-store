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
  // Nav categories. Fetched here rather than in Navbar because BOTH Navbar and
  // MobileMenu need the same list — one fetch, one source of truth, no
  // duplicate query when the burger opens.
  const [categories,      setCategories]      = useState([]);

  // Persist to both storage layers on every cart change.
  useEffect(() => {
    saveCart(items);
  }, [items]);

  // C2: fetch vacation status once on mount; realtime update not needed
  // (admin toggles it rarely; storefront customers will see it on next page load).
  useEffect(() => {
    supabase
      .from('store_settings')
      .select('vacation_mode, vacation_message, whatsapp')
      .eq('id', 'singleton')
      .single()
      .then(({ data }) => {
        if (data) {
          setVacationMode(!!data.vacation_mode);
          setVacationMessage(data.vacation_message || '');
          const n = normaliseWaNumber(data.whatsapp);
          if (n) setWaNumber(n);
        }
      });
  }, []);

  // The nav used to be a hardcoded array of Bags/Jewelry/Watches. That made
  // admin -> Categories a half-working feature: the owner could create a
  // category, products could be assigned to it, its page rendered fine at
  // /category/<slug> — and no customer could ever reach it, because nothing
  // linked there. Found it the moment "Sunglasses" was added for real.
  // Now the nav IS the categories table; adding a category adds a nav link.
  useEffect(() => {
    supabase
      .from('categories')
      .select('name, slug')
      .order('created_at')
      .then(({ data }) => { if (data) setCategories(data); });
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
      vacationMode, vacationMessage, waNumber, categories,
    }}>
      {children}
    </CartContext.Provider>
  );
}

export function useCart() { return useContext(CartContext); }
