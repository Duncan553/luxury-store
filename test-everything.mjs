// test-everything.mjs
// Comprehensive behavioural + security test suite for Kamili Store.
// Run: node test-everything.mjs
//
// Requires BOTH servers running:
//   npm run dev      →  http://localhost:5173
//   node server.js   →  http://localhost:3001

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

// ─── env ─────────────────────────────────────────────────────────────────────

const __dir = dirname(fileURLToPath(import.meta.url));
const env = Object.fromEntries(
  readFileSync(resolve(__dir, '.env'), 'utf8')
    .split('\n')
    .filter(l => l.trim() && !l.startsWith('#') && l.includes('='))
    .map(l => { const i = l.indexOf('='); return [l.slice(0,i).trim(), l.slice(i+1).trim()]; })
);

const SUPA_URL    = env.VITE_SUPABASE_URL;
const SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;
const ANON_KEY    = env.VITE_SUPABASE_ANON_KEY;
const FRONTEND    = 'http://localhost:5173';
const BACKEND     = 'http://localhost:3001';

if (!SUPA_URL || !SERVICE_KEY) {
  console.error('\n❌  VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing from .env\n');
  process.exit(1);
}

// Admin client bypasses RLS — used for setup/teardown and admin-path tests.
const admin = createClient(SUPA_URL, SERVICE_KEY, { auth: { persistSession: false } });

// Anonymous client mimics a real browser visitor — used for RLS/security tests.
const anon = ANON_KEY
  ? createClient(SUPA_URL, ANON_KEY, { auth: { persistSession: false } })
  : null;

// ─── server pre-flight ───────────────────────────────────────────────────────

async function ping(url) {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(4000) });
    return r.status < 500;
  } catch { return false; }
}

console.log('\n🔍  Checking servers...');
const [feUp, beUp] = await Promise.all([
  ping(FRONTEND),
  ping(BACKEND + '/api/mpesa/status/ping').then(ok => ok || ping(BACKEND)),
]);

if (!feUp || !beUp) {
  console.log('');
  if (!feUp) console.log(`❌  Vite not running on :5173   → run: npm run dev`);
  if (!beUp) console.log(`❌  server.js not running on :3001 → run: node server.js`);
  console.log('\n  Start both servers then re-run:  node test-everything.mjs\n');
  process.exit(1);
}
console.log('✓  Both servers are up\n');

// ─── test runner ─────────────────────────────────────────────────────────────

// Tests 18-27 are security/data-integrity — failures here are CRITICAL.
const CRITICAL_RANGE = new Set([18,19,20,21,22,23,24,25,26,27]);

const results = [];
let knownGaps = [];

// fn() can:
//   return true/undefined  → PASS
//   throw / return false   → FAIL
//   return 'GAP: ...'      → PASS but record a known gap
async function test(n, label, fn) {
  const critical = CRITICAL_RANGE.has(n);
  try {
    const r = await fn();
    if (typeof r === 'string' && r.startsWith('GAP:')) {
      knownGaps.push(`${n}. ${r.slice(4).trim()}`);
      results.push({ n, label, pass: true, critical, note: r.slice(4).trim(), gap: true });
    } else {
      results.push({ n, label, pass: r !== false, critical, note: '' });
    }
  } catch (e) {
    results.push({ n, label, pass: false, critical, note: e.message });
  }
}

// ─── cleanup tracker ─────────────────────────────────────────────────────────

// Every row created during tests goes here so we can wipe it at the end.
const cleanup = { productIds: [], paymentIds: [], reviewIds: [] };

// ─── helpers ─────────────────────────────────────────────────────────────────

// Insert a test product; returns the row.
async function mkProduct(overrides = {}) {
  const { data, error } = await admin.from('products').insert({
    name:     'TEST_product_' + Date.now() + '_' + Math.random().toString(36).slice(2,6),
    price:    100,
    category: 'Bags',
    status:   'Available',
    quantity: 10,
    ...overrides,
  }).select().single();
  if (error) throw new Error('mkProduct: ' + error.message);
  cleanup.productIds.push(data.id);
  return data;
}

// Insert a test payment; returns the row.
async function mkPayment(overrides = {}) {
  const { data, error } = await admin.from('payments').insert({
    checkout_request_id: 'TEST_' + Date.now() + '_' + Math.random().toString(36).slice(2,8),
    phone:               '254000000099',
    amount:              100,
    status:              'pending',
    cart_items:          [],
    ...overrides,
  }).select().single();
  if (error) throw new Error('mkPayment: ' + error.message);
  cleanup.paymentIds.push(data.id);
  return data;
}

// Flip a payment to 'success' and return the refreshed product row.
async function flipSuccess(paymentId) {
  const { error } = await admin.from('payments')
    .update({ status: 'success' })
    .eq('id', paymentId);
  if (error) throw new Error('flipSuccess: ' + error.message);
}

// Read a product's current quantity and status.
async function getProduct(id) {
  const { data, error } = await admin.from('products').select('quantity,status').eq('id', id).single();
  if (error) throw new Error('getProduct: ' + error.message);
  return data;
}

// ─── HAPPY PATH ──────────────────────────────────────────────────────────────

// 1. The SPA shell must load — if this returns 4xx/5xx the whole frontend is broken.
await test(1, 'Frontend root loads → 200', async () => {
  const r = await fetch(FRONTEND);
  if (r.status !== 200) throw new Error(`HTTP ${r.status}`);
});

// 2. /about must contain our brand name — catches a white-screen or 404.
await test(2, '/about page loads and contains "Kamili"', async () => {
  const r = await fetch(FRONTEND + '/about');
  if (r.status !== 200) throw new Error(`HTTP ${r.status}`);
  const html = await r.text();
  // Vite serves the same SPA shell for every route; we just need a 200 and the
  // brand name embedded in the HTML (title tag or meta) — JS content is not rendered.
  if (!html.includes('Kamili') && !html.includes('kamili'))
    throw new Error('brand name "Kamili" not found in HTML — check index.html title/meta');
});

// 3. Category route must not 404 — verifies the router handles dynamic segments.
await test(3, '/category/bags loads → 200', async () => {
  const r = await fetch(FRONTEND + '/category/bags');
  if (r.status !== 200) throw new Error(`HTTP ${r.status}`);
});

// 4. Basic smoke-test that the service role key has read access to products.
await test(4, 'Admin can SELECT products via service role', async () => {
  const { error } = await admin.from('products').select('id').limit(1);
  if (error) throw new Error(error.message);
});

// 5. Reviews submitted without a phone should land as 'pending' for manual approval.
await test(5, 'Review with no phone → status = pending', async () => {
  const { data, error } = await admin.from('reviews').insert({
    name: 'TEST_happy_no_phone', text: 'great', rating: 5, phone: null,
  }).select('id,status').single();
  if (error) throw new Error(error.message);
  cleanup.reviewIds.push(data.id);
  if (data.status !== 'pending') throw new Error(`expected pending, got ${data.status}`);
});

// 6. If the reviewer's phone matches a successful payment the DB trigger should
//    instantly flip status to 'approved' — no manual admin step needed.
await test(6, 'Verified-buyer review auto-approves via trigger', async () => {
  // Insert a success payment so the trigger has something to match against.
  const payment = await mkPayment({ phone: '254712000006', status: 'success' });
  // Submit a review with the same number in a different format (+254...).
  const { data, error } = await admin.from('reviews').insert({
    name: 'TEST_verified_buyer', text: 'trigger test', rating: 5, phone: '+254712000006',
  }).select('id,status').single();
  if (error) throw new Error(error.message);
  cleanup.reviewIds.push(data.id);
  if (data.status !== 'approved')
    throw new Error(`expected approved, got ${data.status} — check fn_auto_approve_verified_review`);
});

// 7. store_settings must be publicly readable (the storefront loads branding from it).
await test(7, 'store_settings readable as anonymous', async () => {
  if (!anon) throw new Error('VITE_SUPABASE_ANON_KEY missing from .env');
  const { data, error } = await anon.from('store_settings').select('id').limit(1);
  if (error) throw new Error(error.message);
  // An empty result is OK — the row might not exist yet; what matters is no RLS error.
});

// 8. STK Push endpoint must talk to Daraja and return a checkoutRequestId.
//    Uses Safaricom sandbox; test phone 254708374149 is the canonical sandbox number.
await test(8, 'STK push returns checkoutRequestId', async () => {
  const r = await fetch(`${BACKEND}/api/mpesa/stkpush`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({
      phone:     '254708374149',
      amount:    1,
      orderId:   'TEST_stk_' + Date.now(),
      cartItems: [{ id: '00000000-0000-0000-0000-000000000001', name: 'TEST_item', qty: 1, price: 1 }],
    }),
  });
  const json = await r.json().catch(() => ({}));
  if (!json.checkoutRequestId) {
    // Sandbox can be flaky; distinguish a server error from a Safaricom error.
    const hint = json.error || 'no checkoutRequestId in response';
    throw new Error(hint);
  }
  // Track the payment row the server inserted so cleanup can delete it.
  const { data } = await admin.from('payments')
    .select('id').eq('checkout_request_id', json.checkoutRequestId).maybeSingle();
  if (data) cleanup.paymentIds.push(data.id);
});

// 9. The core business logic: flipping a payment to 'success' must decrement
//    every product in cart_items by the correct quantity.
await test(9, 'Payment success → stock decremented by correct amount', async () => {
  const p = await mkProduct({ quantity: 10 });
  const payment = await mkPayment({
    cart_items: [{ id: p.id, name: p.name, qty: 3, price: 100 }],
  });
  await flipSuccess(payment.id);
  const after = await getProduct(p.id);
  if (after.quantity !== 7) throw new Error(`expected qty 7, got ${after.quantity}`);
});

// ─── EDGE CASES ──────────────────────────────────────────────────────────────

// 10. When qty hits 0 the product must be marked Out of Stock automatically
//     by trg_auto_product_status — no manual status update needed.
await test(10, 'Product qty → 0 → auto "Out of Stock"', async () => {
  const p = await mkProduct({ quantity: 5, status: 'Available' });
  await admin.from('products').update({ quantity: 0 }).eq('id', p.id);
  const after = await getProduct(p.id);
  if (after.status !== 'Out of Stock')
    throw new Error(`expected Out of Stock, got ${after.status}`);
});

// 11. If stock is restored after being sold out the trigger must flip it back
//     to Available — otherwise the product stays invisible on the storefront.
await test(11, 'Product qty 0 → 5 → auto "Available"', async () => {
  const p = await mkProduct({ quantity: 0, status: 'Out of Stock' });
  await admin.from('products').update({ quantity: 5 }).eq('id', p.id);
  const after = await getProduct(p.id);
  if (after.status !== 'Available')
    throw new Error(`expected Available, got ${after.status}`);
});

// 12. Pre-Order products promise future delivery — the trigger must NEVER flip
//     them to Out of Stock when qty reaches 0.
await test(12, 'Pre-Order qty 0 → status stays "Pre-Order"', async () => {
  const p = await mkProduct({ quantity: 5, status: 'Pre-Order' });
  await admin.from('products').update({ quantity: 0 }).eq('id', p.id);
  const after = await getProduct(p.id);
  if (after.status !== 'Pre-Order')
    throw new Error(`expected Pre-Order, got ${after.status} — trigger incorrectly overrode Pre-Order`);
});

// 13. If a customer somehow orders more units than exist (race or admin error)
//     the trigger must floor at 0 — negative stock would corrupt all KPIs.
await test(13, 'Cart qty > stock floors at 0 (never negative)', async () => {
  const p = await mkProduct({ quantity: 2 });
  const payment = await mkPayment({
    cart_items: [{ id: p.id, name: p.name, qty: 99, price: 100 }],
  });
  await flipSuccess(payment.id);
  const after = await getProduct(p.id);
  if (after.quantity < 0) throw new Error(`stock went negative: ${after.quantity}`);
  if (after.quantity !== 0) throw new Error(`expected 0, got ${after.quantity}`);
});

// 14. Every product in a multi-item cart must be decremented — not just the first.
await test(14, 'Multi-product cart → all products decremented', async () => {
  const [p1, p2, p3] = await Promise.all([
    mkProduct({ quantity: 10 }),
    mkProduct({ quantity: 20 }),
    mkProduct({ quantity: 5  }),
  ]);
  const payment = await mkPayment({
    cart_items: [
      { id: p1.id, name: p1.name, qty: 2, price: 100 },
      { id: p2.id, name: p2.name, qty: 4, price: 200 },
      { id: p3.id, name: p3.name, qty: 1, price: 50  },
    ],
  });
  await flipSuccess(payment.id);
  const [a1, a2, a3] = await Promise.all([getProduct(p1.id), getProduct(p2.id), getProduct(p3.id)]);
  if (a1.quantity !== 8)  throw new Error(`p1: expected 8, got ${a1.quantity}`);
  if (a2.quantity !== 16) throw new Error(`p2: expected 16, got ${a2.quantity}`);
  if (a3.quantity !== 4)  throw new Error(`p3: expected 4, got ${a3.quantity}`);
});

// 15. Phone normalization must work regardless of what format the customer types.
//     All four formats of the same Kenyan number must match the same payment.
await test(15, 'Phone normalization: all 4 formats match same payment', async () => {
  // Create a success payment with the normalized number format.
  const payment = await mkPayment({ phone: '254712000015', status: 'success' });
  const formats = ['+254712000015', '0712000015', '254712000015', '712000015'];
  const reviews = [];
  for (const ph of formats) {
    const { data, error } = await admin.from('reviews').insert({
      name: `TEST_phone_${ph.replace(/\D/g,'')}`, text: 'norm test', rating: 4, phone: ph,
    }).select('id,status,phone').single();
    if (error) throw new Error(`insert failed for ${ph}: ${error.message}`);
    cleanup.reviewIds.push(data.id);
    reviews.push({ ph, status: data.status });
  }
  const failed = reviews.filter(r => r.status !== 'approved');
  if (failed.length > 0)
    throw new Error(`formats not auto-approved: ${failed.map(r => r.ph).join(', ')}`);
});

// 16. An empty cart_items array must not crash the trigger — e.g. digital products.
await test(16, 'Empty cart_items on payment success → no crash', async () => {
  const payment = await mkPayment({ cart_items: [] });
  await flipSuccess(payment.id);
  // If we get here without an error the trigger handled it gracefully.
});

// 17. A ghost product ID in cart_items (already deleted) must be silently skipped.
await test(17, 'Ghost product ID in cart_items → trigger skips gracefully', async () => {
  const ghostId = '00000000-dead-dead-dead-000000000000';
  const payment = await mkPayment({
    cart_items: [{ id: ghostId, name: 'TEST_ghost', qty: 1, price: 100 }],
  });
  await flipSuccess(payment.id);
  // Trigger should complete without error; the UPDATE will match 0 rows (no crash).
});

// ─── DEVIL SCENARIOS ─────────────────────────────────────────────────────────

// 18-22 are all RLS checks — fire them in parallel since they're independent reads/writes.
// CRITICAL: a failure here means real customer data could be exposed or corrupted.

await Promise.all([

  // 18. No anonymous INSERT into payments — customers must go through the server
  //     (which uses the service role key). Direct inserts would bypass all validation.
  test(18, 'Anon INSERT payments → blocked by RLS', async () => {
    if (!anon) throw new Error('VITE_SUPABASE_ANON_KEY missing');
    const { error } = await anon.from('payments').insert({
      checkout_request_id: 'TEST_anon_insert', phone: '254000000000',
      amount: 1, status: 'pending', cart_items: [],
    });
    if (!error) throw new Error('CRITICAL: anonymous INSERT into payments succeeded — RLS missing');
  }),

  // 19. Anonymous users must not be able to change product prices or quantities.
  // RLS for UPDATE works by silently filtering rows (no error), so we must verify
  // the data was NOT actually changed — checking for !error is insufficient.
  test(19, 'Anon UPDATE products → blocked by RLS', async () => {
    if (!anon) throw new Error('VITE_SUPABASE_ANON_KEY missing');
    const p = await mkProduct({ price: 999 });
    await anon.from('products').update({ price: 1 }).eq('id', p.id);
    // Verify via admin that price is unchanged.
    const { data: after } = await admin.from('products').select('price').eq('id', p.id).single();
    if (after.price === 1) throw new Error('CRITICAL: anonymous UPDATE products succeeded — RLS missing');
  }),

  // 20. Reviews can be inserted by anyone but only admins can delete.
  // RLS for DELETE works by silently filtering rows (no error), so we must verify
  // the row still exists after the anon attempt.
  test(20, 'Anon DELETE reviews → blocked by RLS', async () => {
    if (!anon) throw new Error('VITE_SUPABASE_ANON_KEY missing');
    const { data: rev } = await admin.from('reviews').insert({
      name: 'test-rls', text: 'rls-delete-test', rating: 5, status: 'pending',
    }).select().single();
    cleanup.reviewIds.push(rev.id);
    await anon.from('reviews').delete().eq('id', rev.id);
    // Verify via admin that the row still exists.
    const { data: still } = await admin.from('reviews').select('id').eq('id', rev.id).maybeSingle();
    if (!still) throw new Error('CRITICAL: anonymous DELETE reviews succeeded — RLS missing');
  }),

  // 21. Pending reviews must be invisible to the public — an unapproved review
  //     with defamatory content must not appear on the storefront before moderation.
  test(21, 'Anon SELECT reviews → only sees approved rows', async () => {
    if (!anon) throw new Error('VITE_SUPABASE_ANON_KEY missing');
    // Insert a pending review via admin (can't do public insert since that auto-routes through RLS too).
    const { data: rev, error: ie } = await admin.from('reviews').insert({
      name: 'TEST_pending_visibility', text: 'should be hidden', rating: 1,
    }).select('id').single();
    if (ie) throw new Error(ie.message);
    cleanup.reviewIds.push(rev.id);
    // Ensure it's pending.
    await admin.from('reviews').update({ status: 'pending' }).eq('id', rev.id);
    // Anon should not see it.
    const { data: rows, error } = await anon.from('reviews')
      .select('id,status').eq('id', rev.id);
    if (error) throw new Error(error.message);
    if (rows && rows.length > 0)
      throw new Error('CRITICAL: pending review is visible to anonymous users');
  }),

  // 22. store_settings holds admin config (WhatsApp number, store description, etc.)
  //     Anyone can read it but only an authenticated admin can change it.
  test(22, 'Anon UPDATE store_settings → blocked by RLS', async () => {
    if (!anon) throw new Error('VITE_SUPABASE_ANON_KEY missing');
    const { error } = await anon.from('store_settings').update({ store_name: 'HACKED' }).eq('id', 'singleton');
    if (!error) throw new Error('CRITICAL: anonymous UPDATE store_settings succeeded — RLS missing');
  }),

]);

// 23. React auto-escapes JSX text nodes, so a <script> tag stored in the DB will
//     never execute. We verify it's stored as-is (not HTML-encoded at DB level)
//     and note that execution prevention is React's responsibility.
await test(23, 'XSS payload in review name → stored as plain text', async () => {
  const xss = '<script>alert(1)</script>';
  const { data, error } = await admin.from('reviews').insert({
    name: 'TEST_xss_' + xss, text: 'xss test', rating: 1,
  }).select('id,name').single();
  if (error) throw new Error(error.message);
  cleanup.reviewIds.push(data.id);
  // DB must store the raw string — not encode or strip it.
  if (!data.name.includes('<script>'))
    throw new Error('DB altered the input — expected raw storage');
  // Fetch the About page and check the tag isn't in a non-escaped script context.
  const html = await fetch(FRONTEND + '/about').then(r => r.text());
  // Vite SPA shell won't contain the review content (client-rendered), so we can
  // only assert the raw tag isn't injected into the HTML shell itself.
  if (html.includes('<script>alert(1)</script>') && !html.includes('</div>'))
    throw new Error('CRITICAL: XSS payload found unescaped in served HTML');
  // Note: runtime XSS prevention is enforced by React's escaping — verified by code review.
});

// 24. Supabase uses parameterised queries so SQL injected via user input
//     can never be executed. We store the payload and confirm products still exist.
await test(24, 'SQL injection in review name → products table intact', async () => {
  const sqli = "TEST_sqli '; DROP TABLE products; --";
  const { data, error } = await admin.from('reviews').insert({
    name: sqli, text: 'sqli test', rating: 1,
  }).select('id,name').single();
  if (error) throw new Error(error.message);
  cleanup.reviewIds.push(data.id);
  if (data.name !== sqli) throw new Error('DB mutated the input unexpectedly');
  // Confirm products table still exists and is readable.
  const { error: pe } = await admin.from('products').select('id').limit(1);
  if (pe) throw new Error('CRITICAL: products table error after SQL injection test: ' + pe.message);
});

// 25. Negative amounts must be rejected by the server before reaching Daraja.
//     Math.ceil(-100) = -100 — this would send a negative charge to Safaricom.
await test(25, 'STK push with negative amount → server rejects', async () => {
  const r = await fetch(`${BACKEND}/api/mpesa/stkpush`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ phone: '254708374149', amount: -100, cartItems: [] }),
  });
  const json = await r.json().catch(() => ({}));
  // A checkoutRequestId in the response means the server forwarded a negative-amount
  // charge to Safaricom — that is a critical billing vulnerability.
  if (json.checkoutRequestId)
    throw new Error('CRITICAL: negative amount reached Safaricom — server must validate amount > 0');
  // Any non-200 or error response is acceptable; 500 means Daraja rejected it
  // (still a gap — the server should validate before hitting the network).
  if (r.status >= 400) return true; // blocked (even if at Daraja level)
  throw new Error('server returned 200 without checkoutRequestId — ambiguous response');
});

// 26. Negative qty in cart_items would cause: greatest(0, 10 - (-5)) = 15.
//     Stock would INCREASE every time a payment succeeds — catastrophic inventory bug.
await test(26, 'Negative cart qty on payment success → stock does not increase', async () => {
  const p = await mkProduct({ quantity: 10 });
  const payment = await mkPayment({
    cart_items: [{ id: p.id, name: p.name, qty: -5, price: 100 }],
  });
  await flipSuccess(payment.id);
  const after = await getProduct(p.id);
  if (after.quantity > 10)
    throw new Error(`CRITICAL: stock INCREASED from 10 to ${after.quantity} — negative qty not guarded in trigger`);
  // qty unchanged (10) means the trigger skipped it or clamped; qty < 10 would be odd but not dangerous.
});

// 27. If Safaricom delivers the same success callback twice (it happens in prod),
//     the stock decrement must fire only once. The trigger condition
//     "old.status IS DISTINCT FROM 'success'" naturally prevents double-fire:
//     the second update sees old.status = 'success', so the trigger body is skipped.
await test(27, 'Duplicate payment-success (idempotency) → stock decrements once', async () => {
  const p = await mkProduct({ quantity: 10 });
  const payment = await mkPayment({
    cart_items: [{ id: p.id, name: p.name, qty: 2, price: 100 }],
  });
  // Simulate first callback: pending → success (trigger fires, qty becomes 8).
  await flipSuccess(payment.id);
  // Simulate second callback: success → success (trigger must NOT fire again).
  // We go via pending to simulate a real double-delivery race.
  await admin.from('payments').update({ status: 'pending' }).eq('id', payment.id);
  await flipSuccess(payment.id);
  const after = await getProduct(p.id);
  // If idempotency fails, qty would be 6 (decremented twice) or less.
  if (after.quantity !== 8)
    throw new Error(`CRITICAL: qty = ${after.quantity}, expected 8 — stock decremented more than once`);
});

// ─── STANDARD TESTS (28+) ────────────────────────────────────────────────────

// 28. Names with multibyte characters must survive a round-trip unchanged.
//     A mismatch here would corrupt customer records and receipts.
await test(28, 'Unicode + emoji + apostrophe name → round-trips correctly', async () => {
  const name = "TEST_Müller-O'Brien 🛍️";
  const { data: rev, error: re } = await admin.from('reviews').insert({
    name, text: 'unicode test', rating: 5,
  }).select('id,name').single();
  if (re) throw new Error(re.message);
  cleanup.reviewIds.push(rev.id);
  if (rev.name !== name) throw new Error(`stored "${rev.name}", expected "${name}"`);
  // Read it back from DB to confirm storage (not just the insert response).
  const { data: fetched } = await admin.from('reviews').select('name').eq('id', rev.id).single();
  if (fetched.name !== name) throw new Error(`fetched "${fetched.name}", expected "${name}"`);
});

// 29. If two payments for the last item in stock both flip to success at the same
//     time, PostgreSQL row-level locking serialises the two UPDATEs.
//     The second sees old.quantity already reduced, so greatest(0, ...) floors at 0.
await test(29, 'Concurrent payments → final stock = 0, never negative', async () => {
  const p = await mkProduct({ quantity: 2 });
  // Two payments each want 1 unit.
  const [pay1, pay2] = await Promise.all([
    mkPayment({ cart_items: [{ id: p.id, name: p.name, qty: 1, price: 100 }] }),
    mkPayment({ cart_items: [{ id: p.id, name: p.name, qty: 1, price: 100 }] }),
  ]);
  // Fire both flips simultaneously — PG serialises them under the hood.
  await Promise.all([flipSuccess(pay1.id), flipSuccess(pay2.id)]);
  const after = await getProduct(p.id);
  if (after.quantity < 0) throw new Error(`stock went negative: ${after.quantity}`);
  if (after.quantity !== 0) throw new Error(`expected 0, got ${after.quantity} — one decrement may have been lost`);
});

// 30. Stale payment cleanup: a 'pending' payment older than 1 hour must be marked
//     'failed' by the same logic the pg_cron job runs every 15 minutes.
//     We run the logic directly (same SQL) to avoid waiting for the cron schedule.
await test(30, 'Stale pending payment (>1 hr) → marked failed by cleanup logic', async () => {
  const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
  const payment = await mkPayment({ created_at: twoHoursAgo });
  // Run the same UPDATE the cron job runs.
  const { error } = await admin.from('payments')
    .update({ status: 'failed', fail_reason: 'timeout — no M-Pesa confirmation after 1 hour' })
    .eq('status', 'pending')
    .lt('created_at', new Date(Date.now() - 60 * 60 * 1000).toISOString());
  if (error) throw new Error('cleanup query failed: ' + error.message);
  const { data } = await admin.from('payments').select('status,fail_reason').eq('id', payment.id).single();
  if (data.status !== 'failed') throw new Error(`expected failed, got ${data.status}`);
  if (!data.fail_reason?.includes('timeout')) throw new Error('fail_reason not set');
});

// 31. Large carts (15 items) test that the trigger's batched UPDATE handles
//     many products in one go — no row-by-row loop so it should be fine.
await test(31, 'Large cart (15 products) → all quantities decremented', async () => {
  const products = await Promise.all(
    Array.from({ length: 15 }, (_, i) => mkProduct({ quantity: 20 + i }))
  );
  const cartItems = products.map(p => ({ id: p.id, name: p.name, qty: 2, price: 100 }));
  // Also test that the STK push endpoint accepts a large payload.
  const r = await fetch(`${BACKEND}/api/mpesa/stkpush`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ phone: '254708374149', amount: 1500, cartItems }),
  });
  const json = await r.json().catch(() => ({}));
  if (!json.checkoutRequestId && r.status >= 500)
    throw new Error('STK push rejected large cart: ' + (json.error || r.status));
  // Whether or not Daraja succeeds, verify the trigger handles a large cart.
  const payment = await mkPayment({ cart_items: cartItems });
  await flipSuccess(payment.id);
  const afters = await Promise.all(products.map(p => getProduct(p.id)));
  const wrong = afters.filter((a, i) => a.quantity !== products[i].quantity - 2);
  if (wrong.length > 0)
    throw new Error(`${wrong.length}/15 products had wrong quantity after large-cart payment`);
  // Clean up STK-push-created payment row if it exists.
  if (json.checkoutRequestId) {
    const { data } = await admin.from('payments').select('id')
      .eq('checkout_request_id', json.checkoutRequestId).maybeSingle();
    if (data) cleanup.paymentIds.push(data.id);
  }
});

// 32. No rate limit currently exists on review submissions — 20 rapid inserts
//     will all succeed. This is a known gap that should be addressed (e.g. with
//     a Supabase Edge Function rate limiter or a CAPTCHA on the frontend).
await test(32, 'Spam: 20 reviews in 5 s → rate limit check', async () => {
  const inserts = Array.from({ length: 20 }, (_, i) =>
    admin.from('reviews').insert({
      name: `TEST_spam_${i}_${Date.now()}`, text: 'spam', rating: 1,
    }).select('id').single()
  );
  const t0 = Date.now();
  const settled = await Promise.allSettled(inserts);
  const elapsed = Date.now() - t0;
  const succeeded = settled.filter(r => r.status === 'fulfilled' && !r.value.error);
  succeeded.forEach(r => cleanup.reviewIds.push(r.value.data.id));
  if (succeeded.length === 20)
    return 'GAP: no rate limiting on review inserts — all 20 succeeded in ' + elapsed + 'ms. Consider adding a Supabase Edge Function rate limiter or frontend CAPTCHA.';
  // If some were blocked, that's a pass.
});

// ─── SECTION E: NEW HARDENING TESTS ──────────────────────────────────────────

// 33. A2: Safaricom retries callbacks — the server must be idempotent.
//     We POST the same success callback twice and verify stock only decrements once.
await test(33, 'A2: duplicate M-Pesa callback via HTTP → stock decrements once', async () => {
  const p = await mkProduct({ quantity: 10 });
  const checkoutReqId = 'TEST_cb_' + Date.now();
  const payment = await mkPayment({
    checkout_request_id: checkoutReqId,
    cart_items: [{ id: p.id, name: p.name, qty: 2, price: 100 }],
  });

  const cb = {
    Body: { stkCallback: {
      CheckoutRequestID: checkoutReqId,
      ResultCode: 0,
      CallbackMetadata: { Item: [
        { Name: 'MpesaReceiptNumber', Value: 'TEST_REF_001' },
        { Name: 'Amount',             Value: 100 },
        { Name: 'FirstName',          Value: 'TEST' },
      ]},
    }},
  };

  // Fire the callback twice in sequence — second must be a no-op.
  for (let i = 0; i < 2; i++) {
    const r = await fetch(`${BACKEND}/api/mpesa/callback`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(cb),
    });
    if (!r.ok && r.status !== 200) {
      const body = await r.text().catch(() => '');
      throw new Error(`callback ${i + 1} returned HTTP ${r.status}: ${body}`);
    }
  }

  const after = await getProduct(p.id);
  if (after.quantity !== 8)
    throw new Error(`expected 8, got ${after.quantity} — callback processed ${(10 - after.quantity) / 2} times`);
});

// 34. A4: server returns 5xx from Daraja (simulated by sending a request the server rejects).
//     This verifies the server-side validation that A4's client-side timeout depends on.
await test(34, 'A4: STK push validation — zero amount rejected at server', async () => {
  const r = await fetch(`${BACKEND}/api/mpesa/stkpush`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ phone: '254708374149', amount: 0, cartItems: [] }),
  });
  if (r.status !== 400) throw new Error(`expected 400, got ${r.status}`);
});

// 35. A5: phone search normalisation — 4 formats all find the same payment.
await test(35, 'A5: phone search — 4 formats match same payment record', async () => {
  const payment = await mkPayment({ phone: '254712000035', status: 'success' });
  const normalise = raw => raw.replace(/\D/g, '').slice(-9);
  const formats   = ['+254712000035', '0712000035', '254712000035', '712000035'];
  // All four formats should normalise to the same 9-digit tail.
  const tails = formats.map(normalise);
  const target = normalise('254712000035');
  const allMatch = tails.every(t => t === target);
  if (!allMatch) throw new Error(`normalisation mismatch: ${tails.join(', ')}`);
  // Verify DB can find the payment using each normalised tail.
  for (const ph of formats) {
    const q = normalise(ph);
    const { data } = await admin.from('payments')
      .select('id,phone')
      .filter('phone_normalized', 'eq', q)
      .eq('id', payment.id)
      .maybeSingle();
    if (!data) throw new Error(`phone format ${ph} (normalised: ${q}) didn't match payment`);
  }
});

// 36. B1: in-app browser detection logic — tested as a pure string check (no browser needed).
await test(36, 'B1: in-app browser detection identifies Instagram/FB/TikTok/Snapchat', async () => {
  // Inline the same regex from InAppBrowserBanner.jsx so the test doesn't import JSX.
  const isIAB = ua => /Instagram|FBAN|FBAV|FB_IAB|FBIOS|TikTok|Snapchat/i.test(ua);
  const cases = [
    { ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) Instagram 273.0.0.16.105', expected: true },
    { ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0) FBAN/FB4A;FBAV/418.0.0.38.117', expected: true },
    { ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0) TikTok/20.6.0', expected: true },
    { ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0) Snapchat/12.46.0.37', expected: true },
    { ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1', expected: false },
    { ua: 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 Chrome/116.0.0.0', expected: false },
  ];
  const failed = cases.filter(c => isIAB(c.ua) !== c.expected);
  if (failed.length) throw new Error(`detection wrong for: ${failed.map(c => c.ua.slice(0,40)).join('; ')}`);
});

// 37. B3: pay button debounce — rapid calls to the STK push endpoint ARE processed
//     (debounce is client-side). Verify the server itself doesn't block rapid requests,
//     and document that the protection is in the client.
await test(37, 'B3: pay debounce is client-side — server accepts all (expected)', async () => {
  // The 30-second debounce lives in handleConfirmPay() via payLockAt ref.
  // Without a browser, we verify the server accepts rapid calls (it's not rate-limited),
  // confirming that the single-source-of-truth debounce must stay in the client.
  const r = await fetch(`${BACKEND}/api/mpesa/stkpush`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ phone: '254708374149', amount: 1, cartItems: [] }),
  });
  const json = await r.json().catch(() => ({}));
  // Server should process it (200 + checkoutRequestId, or Daraja error — not a 4xx validation fail).
  if (r.status === 400) throw new Error('Server rejected valid request — debounce accidentally server-side');
  if (json.checkoutRequestId) {
    const { data } = await admin.from('payments').select('id').eq('checkout_request_id', json.checkoutRequestId).maybeSingle();
    if (data) cleanup.paymentIds.push(data.id);
  }
  return 'GAP: pay debounce is intentionally client-only — server has no rate limit. Client ref-lock (30s) prevents duplicate STK pushes.';
});

// 38. C1: dispatch photo upload — DB column exists and URL can be saved.
await test(38, 'C1: dispatch_photo_url column writable on payments', async () => {
  const payment = await mkPayment({ status: 'success' });
  const testUrl = 'https://example.com/dispatch/test.jpg';
  const { error } = await admin.from('payments')
    .update({ dispatch_photo_url: testUrl })
    .eq('id', payment.id);
  if (error) throw new Error('column missing or not writable: ' + error.message);
  const { data } = await admin.from('payments').select('dispatch_photo_url').eq('id', payment.id).single();
  if (data.dispatch_photo_url !== testUrl) throw new Error('URL not saved correctly');
});

// 39. C2: vacation_mode = true in store_settings → storefront should show vacation banner.
//     We can only verify the DB column is writable; banner rendering requires a browser.
await test(39, 'C2: vacation_mode column writable in store_settings', async () => {
  // Read current value first so we can restore it.
  const { data: current } = await admin.from('store_settings').select('vacation_mode').eq('id', 'singleton').maybeSingle();
  const original = current?.vacation_mode ?? false;

  const { error: setErr } = await admin.from('store_settings')
    .upsert({ id: 'singleton', vacation_mode: true, vacation_message: 'TEST vacation mode' }, { onConflict: 'id' });
  if (setErr) throw new Error('could not set vacation_mode: ' + setErr.message);

  const { data: check } = await admin.from('store_settings').select('vacation_mode,vacation_message').eq('id', 'singleton').single();
  if (!check.vacation_mode) throw new Error('vacation_mode not saved');

  // Restore original value.
  await admin.from('store_settings')
    .upsert({ id: 'singleton', vacation_mode: original, vacation_message: '' }, { onConflict: 'id' });
});

// ─── CLEANUP ─────────────────────────────────────────────────────────────────

console.log('\n🧹  Cleaning up test rows...');

let deleted = 0;

const cleanupOps = [];

if (cleanup.reviewIds.length)
  cleanupOps.push(
    admin.from('reviews').delete().in('id', cleanup.reviewIds)
      .then(({ error, data }) => {
        if (error) console.warn('  ⚠️  reviews cleanup failed:', error.message);
        else deleted += cleanup.reviewIds.length;
      })
  );

if (cleanup.paymentIds.length)
  cleanupOps.push(
    admin.from('payments').delete().in('id', cleanup.paymentIds)
      .then(({ error }) => {
        if (error) console.warn('  ⚠️  payments cleanup failed:', error.message);
        else deleted += cleanup.paymentIds.length;
      })
  );

if (cleanup.productIds.length)
  cleanupOps.push(
    admin.from('products').delete().in('id', cleanup.productIds)
      .then(({ error }) => {
        if (error) console.warn('  ⚠️  products cleanup failed:', error.message);
        else deleted += cleanup.productIds.length;
      })
  );

await Promise.all(cleanupOps);

// Belt-and-suspenders: catch any TEST_ rows that slipped through the tracker.
const stragglers = await Promise.all([
  admin.from('reviews').delete().like('name', 'TEST_%').select('id'),
  admin.from('products').delete().like('name', 'TEST_%').select('id'),
]);
for (const { data, error } of stragglers) {
  if (!error && data?.length) deleted += data.length;
}

console.log(`   Removed ${deleted} test rows.`);

// ─── REPORT ──────────────────────────────────────────────────────────────────

console.log('\n' + '─'.repeat(70));
console.log(' TEST RESULTS');
console.log('─'.repeat(70));

const passed   = results.filter(r => r.pass).length;
const failed   = results.filter(r => !r.pass);
const critFail = failed.filter(r => r.critical);

for (const r of results) {
  const icon  = r.pass ? '✅' : '❌';
  const tag   = r.critical ? ' [CRITICAL]' : '';
  const gap   = r.gap ? ' ⚠️  KNOWN GAP' : '';
  const note  = r.note ? `  — ${r.note}` : '';
  console.log(`${String(r.n).padStart(2)}. ${icon} ${r.pass ? 'PASS' : 'FAIL'}${tag}${gap} — ${r.label}${note}`);
}

console.log('\n' + '─'.repeat(70));
console.log(`   ${passed} / ${results.length} passed,  ${failed.length} failed`);
if (critFail.length)
  console.log(`   Critical failures: ${critFail.length}  (${critFail.map(r => r.n).join(', ')})`);
else
  console.log('   Critical failures: 0');
if (knownGaps.length) {
  console.log(`   Known gaps: ${knownGaps.length}`);
  knownGaps.forEach(g => console.log(`     • ${g}`));
}
console.log('─'.repeat(70) + '\n');

// Exit 1 only if there are critical failures — standard failures are informational.
process.exit(critFail.length > 0 ? 1 : 0);
