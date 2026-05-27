import { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { supabase } from '../lib/supabase';

const CartContext = createContext(null);

const WHATSAPP_NUMBER = '254114256994';
const STORAGE_KEY     = 'kamili_cart';

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

  // Persist to both storage layers on every cart change.
  useEffect(() => {
    saveCart(items);
  }, [items]);

  // C2: fetch vacation status once on mount; realtime update not needed
  // (admin toggles it rarely; storefront customers will see it on next page load).
  useEffect(() => {
    supabase
      .from('store_settings')
      .select('vacation_mode, vacation_message')
      .eq('id', 'singleton')
      .single()
      .then(({ data }) => {
        if (data) {
          setVacationMode(!!data.vacation_mode);
          setVacationMessage(data.vacation_message || '');
        }
      });
  }, []);

  const addItem = useCallback((product) => {
    setItems((prev) => {
      const existing = prev.find((i) => i.id === product.id);
      if (existing) return prev.map((i) => i.id === product.id ? { ...i, qty: i.qty + 1 } : i);
      return [...prev, { ...product, qty: 1 }];
    });
    setIsOpen(true);
  }, []);

  const removeItem = useCallback((id) => setItems((prev) => prev.filter((i) => i.id !== id)), []);

  const updateQty = useCallback((id, delta) => {
    setItems((prev) =>
      prev.map((i) => i.id === id ? { ...i, qty: i.qty + delta } : i).filter((i) => i.qty > 0)
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

  const checkoutViaWhatsApp = useCallback(({ name = '', phone = '', county = '', city = '', address = '', notes = '' } = {}) => {
    if (!items.length) return;
    const lines = items.map((i) =>
      `  • ${i.status === 'Pre-Order' ? '[PRE-ORDER] ' : ''}${i.name} x${i.qty} — Ksh ${(i.price * i.qty).toLocaleString('en-KE')}`
    );
    const location = [city, county].filter(Boolean).join(', ');
    const message = [
      '🛍️ NEW ORDER — Kamili',
      '',
      name    ? `👤 Customer: ${name}`    : '',
      phone   ? `📞 Phone: ${phone}`      : '',
      location? `📍 Location: ${location}`: '',
      address ? `🏠 Address: ${address}`  : '',
      notes   ? `📝 Notes: ${notes}`      : '',
      '',
      '📦 Items:',
      ...lines,
      '',
      `💰 Total: Ksh ${total.toLocaleString('en-KE')}`,
      '',
      'Please confirm and arrange delivery. Thank you!',
    ].filter(l => l !== null && l !== undefined).join('\n').replace(/\n{3,}/g, '\n\n');
    window.open(`https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`, '_blank', 'noopener,noreferrer');
  }, [items, total]);

  return (
    <CartContext.Provider value={{
      items, itemCount, total,
      isOpen, setIsOpen,
      checkoutView, setCheckoutView,
      openCheckout,
      addItem, removeItem, updateQty,
      clearCart, checkoutViaWhatsApp,
      vacationMode, vacationMessage,
    }}>
      {children}
    </CartContext.Provider>
  );
}

export function useCart() { return useContext(CartContext); }
