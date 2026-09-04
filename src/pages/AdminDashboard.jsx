// AdminDashboard.jsx — shell only.
// Layout (top → bottom):
//   1. Topbar
//   2. KPI strip  (always visible, useMemo-recomputed from fetched data)
//   3. Action Center (only when there is something to fix)
//   4. Tab bar     (Orders | Products | Categories | Reviews | Settings)
//   5. Active tab  (React.lazy — only the current tab is mounted)
//
// Realtime strategy:
//   - payments, products, reviews: always subscribed (KPI + their tabs need them)
//   - categories: only subscribed when the Categories tab is active
import { useEffect, useState, useMemo, useRef, lazy, Suspense } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { fmt, BLANK_SETTINGS, statusFromQty } from '../lib/adminUtils';
import './AdminDashboard.css';

// ── Lazy-loaded tabs ──────────────────────────────────────────────────────────
const OrdersTab     = lazy(() => import('./admin/OrdersTab'));
const ProductsTab   = lazy(() => import('./admin/ProductsTab'));
const CategoriesTab = lazy(() => import('./admin/CategoriesTab'));
const ReviewsTab    = lazy(() => import('./admin/ReviewsTab'));
const SettingsTab   = lazy(() => import('./admin/SettingsTab'));

// ── Nairobi timezone helpers (UTC+3, no DST) ──────────────────────────────────
const KE_OFFSET_MS = 3 * 60 * 60 * 1000;

function startOfTodayKE() {
  // Shift current UTC time into Nairobi "space", zero out time component,
  // then shift back to get the real UTC ms of Nairobi midnight.
  const inKE = new Date(Date.now() + KE_OFFSET_MS);
  const midnight = Date.UTC(inKE.getUTCFullYear(), inKE.getUTCMonth(), inKE.getUTCDate());
  return midnight - KE_OFFSET_MS;
}

function startOfWeekKE() {
  const todayUTC  = startOfTodayKE();
  const dow       = new Date(Date.now() + KE_OFFSET_MS).getUTCDay(); // 0=Sun
  const daysBack  = dow === 0 ? 6 : dow - 1; // Mon=0 offset
  return todayUTC - daysBack * 86_400_000;
}

// D3: days until a date string; null if blank or already passed.
function daysUntil(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (isNaN(d)) return null;
  const diff = Math.ceil((d - Date.now()) / 86_400_000);
  return diff;
}

// ── Main component ────────────────────────────────────────────────────────────
export default function AdminDashboard() {
  const { user, logout, isReadOnly } = useAuth();
  const navigate                     = useNavigate();

  // ── Data state ──────────────────────────────────────────────────────────────
  const [products,   setProducts]   = useState([]);
  const [categories, setCategories] = useState([]);
  const [reviews,    setReviews]    = useState([]);
  const [payments,   setPayments]   = useState([]);
  const [settings,   setSettings]   = useState(BLANK_SETTINGS);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [settingsMsg,    setSettingsMsg]    = useState('');
  const [acToast,    setAcToast]    = useState('');
  const acToastTimer = useRef(null);
  // D1: unread admin reminders (monthly backup prompts, etc.)
  const [reminders,  setReminders]  = useState([]);
  // D3: renewal date warnings computed from settings (re-evaluated when settings load)
  const [expiryWarnings, setExpiryWarnings] = useState([]);
  function showAcToast(msg) {
    clearTimeout(acToastTimer.current);
    setAcToast(msg);
    acToastTimer.current = setTimeout(() => setAcToast(''), 3500);
  }

  // ── Tab / navigation state ──────────────────────────────────────────────────
  const [activeTab,            setActiveTab]            = useState('orders');
  // ordersKey increments on every jumpToTab('orders', filter) call so
  // OrdersTab remounts with the new defaultFilter even if filter didn't change.
  const [ordersKey,            setOrdersKey]            = useState(0);
  const [ordersDefaultFilter,  setOrdersDefaultFilter]  = useState('all');

  function jumpToTab(tab, filter = null) {
    setActiveTab(tab);
    if (tab === 'orders' && filter) {
      setOrdersDefaultFilter(filter);
      setOrdersKey(k => k + 1);
    }
  }

  // ── Fetch helpers ───────────────────────────────────────────────────────────
  async function fetchProducts() {
    const { data } = await supabase.from('products').select('*').order('created_at', { ascending: false });
    if (data) setProducts(data);
  }
  async function fetchCategories() {
    const { data } = await supabase.from('categories').select('*').order('created_at');
    if (data) setCategories(data);
  }
  async function fetchReviews() {
    const { data } = await supabase.from('reviews').select('*')
      .eq('status', 'pending').order('created_at', { ascending: false });
    if (data) setReviews(data);
  }
  async function fetchPayments() {
    const { data } = await supabase.from('payments').select('*')
      .order('created_at', { ascending: false }).limit(200);
    if (data) setPayments(data);
  }
  async function fetchSettings() {
    const { data } = await supabase.from('store_settings').select('*').eq('id', 'singleton').single();
    if (data) {
      setSettings({ ...BLANK_SETTINGS, ...data });
      // D3: compute expiry warnings from renewal dates
      const warnings = [];
      const checks = [
        { key: 'domain_renewal_date',  label: 'Domain' },
        { key: 'hosting_renewal_date', label: 'Hosting' },
        { key: 'ssl_renewal_date',     label: 'SSL cert' },
      ];
      for (const { key, label } of checks) {
        const days = daysUntil(data[key]);
        if (days !== null && days <= 30)
          warnings.push(`${label} expires in ${days} day${days === 1 ? '' : 's'}`);
      }
      setExpiryWarnings(warnings);
    }
  }

  async function fetchReminders() {
    // D1: load unread admin reminders (inserted monthly by pg_cron)
    const { data } = await supabase.from('admin_reminders')
      .select('*').eq('read', false).order('created_at', { ascending: false });
    if (data) setReminders(data);
  }

  async function dismissReminder(id) {
    await supabase.from('admin_reminders').update({ read: true }).eq('id', id);
    setReminders(prev => prev.filter(r => r.id !== id));
  }

  // ── WhatsApp helpers ────────────────────────────────────────────────────────
  // Shared phone normalisation: strip non-digits, replace leading 0 with 254.
  function normalisePhone(raw) {
    return (raw || '').replace(/^0/, '254').replace(/\D/g, '');
  }

  // Auto thank-you, sent when an order flips to status='paid'.
  // Opens wa.me in a new tab and marks thankyou_sent=true so a reload
  // or a second realtime event doesn't re-trigger it.
  function sendThankYouWhatsApp(p) {
    const clean = normalisePhone(p.phone);
    if (!clean) return;
    const firstName = (p.customer_name || '').split(' ')[0] || '';
    const greeting  = firstName ? `Hi ${firstName}` : 'Hi';
    const msg = [
      `${greeting}! 🎉`,
      '',
      `Thanks for your order — we've received your payment of Ksh ${Number(p.amount).toLocaleString('en-KE')} and we're preparing your items now.`,
      '',
      `We'll send a dispatch confirmation once your order is on its way. 🛍️`,
      '',
      '— Kamili Nairobi',
    ].join('\n');
    window.open(`https://wa.me/${clean}?text=${encodeURIComponent(msg)}`, '_blank', 'noopener,noreferrer');
  }

  // Task 4: review-prompt message sent by admin from the Action Center.
  async function sendReviewPromptWA(p) {
    const clean = normalisePhone(p.phone);
    if (!clean) return;
    const firstName = (p.customer_name || '').split(' ')[0] || '';
    const greeting  = firstName ? `Hi ${firstName}` : 'Hi';
    const msg = [
      `${greeting}! We hope you're loving your Kamili purchase 🛍️`,
      '',
      "We'd love to hear your thoughts — a quick review helps other customers and means a lot to us.",
      '',
      'You can leave a review on our website or simply reply here.',
      '',
      'Thank you! — Kamili Nairobi',
    ].join('\n');
    window.open(`https://wa.me/${clean}?text=${encodeURIComponent(msg)}`, '_blank', 'noopener,noreferrer');
    // Optimistic update + DB write
    setPayments(prev => prev.map(pay =>
      pay.id === p.id ? { ...pay, review_prompt_sent: true, review_prompt_ready: false } : pay
    ));
    await supabase.from('payments')
      .update({ review_prompt_sent: true, review_prompt_ready: false })
      .eq('id', p.id);
  }

  // ── Always-on subscriptions: payments, products, reviews ───────────────────
  useEffect(() => {
    fetchProducts();
    fetchReviews();
    fetchPayments();
    fetchSettings();
    fetchReminders();

    const prodCh = supabase.channel('adm-products')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'products' }, fetchProducts)
      .subscribe();
    const revCh = supabase.channel('adm-reviews')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'reviews' }, fetchReviews)
      .subscribe();

    // Payments: INSERT just refreshes the list.
    // UPDATE: also check for a new 'paid' event → send auto thank-you.
    const payCh = supabase.channel('adm-payments')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'payments' },
        fetchPayments)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'payments' },
        (payload) => {
          fetchPayments();
          const p = payload.new;
          // Guard: only fire on the transition to 'paid', and only if the
          // thank-you hasn't already been sent (prevents re-trigger on reload).
          // The .eq('thankyou_sent', false) acts as an optimistic lock —
          // only one tab wins the DB write; the other gets data=[] and skips.
          if (p.status === 'paid' && !p.thankyou_sent && p.phone) {
            supabase.from('payments')
              .update({ thankyou_sent: true })
              .eq('id', p.id)
              .eq('thankyou_sent', false) // only update if not already claimed
              .select('id')
              .then(({ data }) => {
                if (data && data.length > 0) sendThankYouWhatsApp(p);
                // If data is empty another tab already claimed it — skip silently.
              });
          }
        })
      .subscribe();

    return () => {
      supabase.removeChannel(prodCh);
      supabase.removeChannel(revCh);
      supabase.removeChannel(payCh);
    };
  }, []);

  // ── Per-tab subscription: categories (only when that tab is active) ─────────
  useEffect(() => {
    fetchCategories(); // always re-fetch when tab activates

    if (activeTab !== 'categories') return; // no sub needed outside that tab

    const catCh = supabase.channel('adm-categories')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'categories' }, fetchCategories)
      .subscribe();
    return () => supabase.removeChannel(catCh);
  }, [activeTab]);

  // ── KPI calculations (recompute only when underlying data changes) ──────────
  const kpi = useMemo(() => {
    const todayUTC = startOfTodayKE();
    const weekUTC  = startOfWeekKE();
    // 'paid' and 'dispatched' are both money in the bank. Revenue is dated by
    // paid_at when we have it — an order placed Monday and paid Thursday is
    // Thursday's money — falling back to created_at for legacy rows.
    const PAID = ['paid', 'dispatched'];
    const paid = payments.filter(p => PAID.includes(p.status));
    const paidTime = p => new Date(p.paid_at || p.created_at).getTime();

    const todayRevenue = paid
      .filter(p => paidTime(p) >= todayUTC)
      .reduce((s, p) => s + Number(p.amount || 0), 0);

    const weekRevenue = paid
      .filter(p => paidTime(p) >= weekUTC)
      .reduce((s, p) => s + Number(p.amount || 0), 0);

    // Orders still needing the owner to act: replied-to or not.
    const pendingCount  = payments.filter(p => ['new', 'confirmed'].includes(p.status)).length;
    const lowStockCount = products.filter(p => p.status !== 'Pre-Order' && (p.quantity ?? 0) <= 5 && (p.quantity ?? 0) > 0).length;
    const reviewCount   = reviews.length;
    // Unanswered orders. In a WhatsApp shop this is the number that costs money
    // if it isn't zero — every one is a customer waiting for a reply.
    const reconcileCount = payments.filter(p => p.status === 'new').length;

    return { todayRevenue, weekRevenue, pendingCount, lowStockCount, reviewCount, reconcileCount };
  }, [payments, products, reviews]);

  // ── Action Center data ──────────────────────────────────────────────────────
  // Low stock: qty 1-5, not Pre-Order
  const acLowStock = useMemo(() =>
    products.filter(p => p.status !== 'Pre-Order' && (p.quantity ?? 0) > 0 && (p.quantity ?? 0) <= 5),
  [products]);

  // Unanswered orders: sitting at 'new' for more than 15 minutes. The whole
  // promise of this shop is "the owner replies immediately", so this list is
  // the single most urgent thing on the dashboard.
  const FIFTEEN_MIN = 15 * 60 * 1000;
  const acStalePayments = useMemo(() =>
    payments.filter(p =>
      p.status === 'new' &&
      Date.now() - new Date(p.created_at).getTime() > FIFTEEN_MIN
    ),
  [payments]);

  // Task 4: review prompts the daily cron has flagged as ready to send
  const acReviewPrompts = useMemo(() =>
    payments.filter(p => p.review_prompt_ready === true),
  [payments]);

  const hasActionItems = (
    acLowStock.length > 0 ||
    reviews.length > 0 ||
    acStalePayments.length > 0 ||
    acReviewPrompts.length > 0
  );

  // ── Action Center inline handlers ───────────────────────────────────────────
  async function acAddStock(product) {
    const newQty = (product.quantity ?? 0) + 1;
    // Was its own hand-copied ladder here — now calls the one shared,
    // correct version (adminUtils.js) instead of a second copy that could
    // drift out of sync with it again.
    const newStatus = product.status === 'Pre-Order' ? 'Pre-Order' : statusFromQty(newQty);

    const snap = products;
    setProducts(prev => prev.map(p =>
      p.id === product.id ? { ...p, quantity: newQty, status: newStatus } : p
    ));
    const { error } = await supabase.from('products')
      .update({ quantity: newQty, status: newStatus }).eq('id', product.id);
    if (error) {
      setProducts(snap); // rollback
      showAcToast(`Failed to update stock for "${product.name}" — reverted.`);
    }
  }

  async function acApproveReview(id) {
    await supabase.from('reviews').update({ status: 'approved' }).eq('id', id);
    fetchReviews();
  }

  async function acDeleteReview(id) {
    if (!window.confirm('Delete this review?')) return;
    await supabase.from('reviews').delete().eq('id', id);
    fetchReviews();
  }

  async function handleLogout() { await logout(); navigate('/admin/login'); }

  // ── Tab definitions (badges use live data) ──────────────────────────────────
  const TABS = [
    // Every badge now carries a title saying WHAT it counts. Without one
    // "Products 12" read as "12 products" when there are 42 — the number is
    // the low-stock count. A bare number next to a noun is always read as a
    // count of that noun.
    { key: 'orders',     label: 'Orders',     badge: kpi.reconcileCount || null,
      badgeTitle: 'orders needing attention' },
    { key: 'products',   label: 'Products',   badge: kpi.lowStockCount || null,
      badgeTitle: 'products low on stock' },
    { key: 'categories', label: 'Categories', badge: null                      },
    { key: 'reviews',    label: 'Reviews',    badge: kpi.reviewCount   || null,
      badgeTitle: 'reviews awaiting approval' },
    { key: 'settings',   label: 'Settings',   badge: null                      },
  ];

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="admin-page">

      {/* 1. Topbar ─────────────────────────────────────────────────────── */}
      <header className="admin-topbar">
        <span className="admin-logo">Kamili Admin</span>
        <div className="admin-topbar__right">
          <span className="admin-email">{user?.email}</span>
          {/* Height lives in .admin-logout, not in an inline style: an
              inline value can't be overridden by a media query, so the
              button was stuck at 36px on phones. */}
          <button className="btn btn-outline admin-logout"
            onClick={handleLogout}>
            Log out
          </button>
        </div>
      </header>

      {/* AC toast */}
      {acToast && <div className="admin-toast admin-toast--error">{acToast}</div>}

      {/* D3: expiry warnings */}
      {expiryWarnings.length > 0 && (
        <div className="container" style={{ paddingTop: 16 }}>
          {expiryWarnings.map(w => (
            <div key={w} className="expiry-banner">⚠️ {w} — renew in Settings tab to dismiss</div>
          ))}
        </div>
      )}

      {/* D1: unread admin reminders (monthly backup prompts) */}
      {reminders.length > 0 && (
        <div className="container" style={{ paddingTop: expiryWarnings.length ? 0 : 16 }}>
          {reminders.map(r => (
            <div key={r.id} className="reminder-banner">
              <span>📋 {r.message}</span>
              <button className="reminder-banner__dismiss"
                onClick={() => dismissReminder(r.id)} title="Mark as read">✕</button>
            </div>
          ))}
        </div>
      )}

      {/* 2. KPI Strip ──────────────────────────────────────────────────── */}
      <div className="kpi-strip">
        <div className="container kpi-strip__inner">

          <button className="kpi-card kpi-card--gold" onClick={() => jumpToTab('orders', 'paid')}>
            <span className="kpi-card__label">Today's Revenue</span>
            <span className="kpi-card__value">{fmt(kpi.todayRevenue)}</span>
            <span className="kpi-card__sub">Kenya time</span>
          </button>

          <button className="kpi-card kpi-card--gold" onClick={() => jumpToTab('orders', 'paid')}>
            <span className="kpi-card__label">This Week</span>
            <span className="kpi-card__value">{fmt(kpi.weekRevenue)}</span>
            <span className="kpi-card__sub">Mon – today</span>
          </button>

          <button className="kpi-card"
            style={kpi.pendingCount > 0 ? { borderColor: 'rgba(251,191,36,0.35)' } : {}}
            onClick={() => jumpToTab('orders', 'new')}>
            <span className="kpi-card__label">Open Orders</span>
            <span className="kpi-card__value"
              style={{ color: kpi.pendingCount > 0 ? '#fbbf24' : 'var(--gold)' }}>
              {kpi.pendingCount}
            </span>
            <span className="kpi-card__sub">to confirm or collect</span>
          </button>

          <button className="kpi-card"
            style={kpi.lowStockCount > 0 ? { borderColor: 'rgba(239,68,68,0.35)' } : {}}
            onClick={() => jumpToTab('products')}>
            <span className="kpi-card__label">Low Stock</span>
            <span className="kpi-card__value"
              style={{ color: kpi.lowStockCount > 0 ? '#f87171' : 'var(--gold)' }}>
              {kpi.lowStockCount}
            </span>
            <span className="kpi-card__sub">≤ 5 units left</span>
          </button>

          <button className="kpi-card"
            style={kpi.reviewCount > 0 ? { borderColor: 'rgba(220,20,60,0.35)' } : {}}
            onClick={() => jumpToTab('reviews')}>
            <span className="kpi-card__label">Pending Reviews</span>
            <span className="kpi-card__value">{kpi.reviewCount}</span>
            <span className="kpi-card__sub">need approval</span>
          </button>

          {/* Unanswered orders — click to filter Orders to the 'new' queue */}
          <button className="kpi-card kpi-card--reconcile"
            style={kpi.reconcileCount > 0 ? { borderColor: 'rgba(251,191,36,0.4)' } : {}}
            onClick={() => jumpToTab('orders', 'new')}>
            <span className="kpi-card__label">Unanswered</span>
            <span className="kpi-card__value"
              style={{ color: kpi.reconcileCount > 0 ? '#fbbf24' : 'var(--gold)' }}>
              {kpi.reconcileCount}
            </span>
            <span className="kpi-card__sub">no reply sent yet</span>
          </button>

        </div>
      </div>

      {/* 3. Action Center — only renders when something needs attention ── */}
      {hasActionItems && (
        <div className="action-center">
          <div className="container">

            {/* Low stock: one row per product, inline +1 button */}
            {acLowStock.length > 0 && (
              <div className="ac-section">
                <span className="ac-section__label">Low Stock</span>
                {acLowStock.map(p => (
                  <div key={p.id} className="ac-row">
                    <span className="ac-row__name">{p.name}</span>
                    <span className="ac-row__qty ac-row__qty--warn">{p.quantity} left</span>
                    <button className="ac-btn ac-btn--stock"
                      onClick={() => acAddStock(p)}
                      title="Add 1 unit to stock">
                      +1 stock
                    </button>
                    <button className="ac-btn ac-btn--link"
                      onClick={() => jumpToTab('products')}>
                      View all →
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Pending reviews: inline approve / delete */}
            {reviews.length > 0 && (
              <div className="ac-section">
                <span className="ac-section__label">Pending Reviews</span>
                {reviews.map(r => (
                  <div key={r.id} className="ac-row">
                    <span className="ac-row__stars">{'★'.repeat(r.rating)}</span>
                    <span className="ac-row__name">{r.name || 'Anonymous'}</span>
                    <span className="ac-row__snippet">"{r.text?.slice(0, 60)}{r.text?.length > 60 ? '…' : ''}"</span>
                    <button className="ac-btn ac-btn--approve"
                      onClick={() => acApproveReview(r.id)}>
                      ✓ Approve
                    </button>
                    <button className="ac-btn ac-btn--delete"
                      onClick={() => acDeleteReview(r.id)}>
                      Delete
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Stale payments: just surfaced, no one-click action */}
            {acStalePayments.length > 0 && (
              <div className="ac-section">
                <span className="ac-section__label">Waiting For Your Reply</span>
                {acStalePayments.map(p => (
                  <div key={p.id} className="ac-row">
                    <span className={`ac-status-dot ac-status-dot--${p.status}`} />
                    <span className="ac-row__name">{p.customer_name || 'Unknown'}</span>
                    <span className="ac-row__amount">{fmt(p.amount)}</span>
                    <span className="ac-row__qty ac-row__qty--warn">
                      waiting {Math.round((Date.now() - new Date(p.created_at).getTime()) / 60000)} min
                    </span>
                    <button className="ac-btn ac-btn--link"
                      onClick={() => jumpToTab('orders', 'new')}>
                      View →
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Task 4: review prompts flagged by the daily cron */}
            {acReviewPrompts.length > 0 && (
              <div className="ac-section">
                <span className="ac-section__label">Review Prompts</span>
                {acReviewPrompts.map(p => (
                  <div key={p.id} className="ac-row">
                    <span className="ac-row__name">{p.customer_name || 'Customer'}</span>
                    <span className="ac-row__qty" style={{ color: 'var(--muted)' }}>
                      dispatched {Math.round((Date.now() - new Date(p.dispatched_at).getTime()) / 86400000)}d ago
                    </span>
                    <span className="ac-row__amount">{fmt(p.amount)}</span>
                    <button className="ac-btn ac-btn--approve"
                      onClick={() => sendReviewPromptWA(p)}>
                      Send review request →
                    </button>
                  </div>
                ))}
              </div>
            )}

          </div>
        </div>
      )}

      {/* 4. Tab Bar ────────────────────────────────────────────────────── */}
      <div className="admin-tabs-bar">
        <div className="container admin-tabs-bar__inner">
          {TABS.map(t => (
            <button key={t.key}
              className={`admin-tab-btn${activeTab === t.key ? ' active' : ''}`}
              onClick={() => setActiveTab(t.key)}>
              {t.label}
              {t.badge
                ? <span className="admin-tab-badge"
                    title={`${t.badge} ${t.badgeTitle}`}
                    aria-label={`${t.badge} ${t.badgeTitle}`}>{t.badge}</span>
                : null}
            </button>
          ))}
        </div>
      </div>

      {/* 5. Active tab content ─────────────────────────────────────────── */}
      <div className="admin-body container">
        <Suspense fallback={<div className="tab-loading">Loading…</div>}>

          {activeTab === 'orders' && (
            <OrdersTab
              key={ordersKey}
              payments={payments}
              defaultFilter={ordersDefaultFilter}
              isReadOnly={isReadOnly}
            />
          )}

          {activeTab === 'products' && (
            <ProductsTab
              products={products}
              categories={categories}
              setProducts={setProducts}
            />
          )}

          {activeTab === 'categories' && (
            <CategoriesTab
              categories={categories}
              products={products}
              refetch={fetchCategories}
            />
          )}

          {activeTab === 'reviews' && (
            <ReviewsTab
              reviews={reviews}
              refetch={fetchReviews}
            />
          )}

          {activeTab === 'settings' && (
            <SettingsTab
              settings={settings}
              setSettings={setSettings}
              saving={settingsSaving}
              setSaving={setSettingsSaving}
              msg={settingsMsg}
              setMsg={setSettingsMsg}
              user={user}
              onLogout={handleLogout}
            />
          )}

        </Suspense>
      </div>

    </div>
  );
}
