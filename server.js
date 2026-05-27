// server.js — Kamili M-Pesa Daraja backend (Supabase edition)
// Run: node server.js  (or npm run server)
// Dev callback URL: npx ngrok http 3001  → set MPESA_CALLBACK_URL in .env

import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import axios from 'axios';
import { createClient } from '@supabase/supabase-js';

const app  = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// ── Admin WhatsApp notification (CallmeBot) ────────────────────────────────────
async function notifyAdmin(message) {
  const phone  = process.env.ADMIN_WHATSAPP;
  const apiKey = process.env.CALLMEBOT_API_KEY;
  if (!phone || !apiKey || apiKey === 'your_callmebot_api_key') return;
  try {
    const text = encodeURIComponent(message);
    await axios.get(`https://api.callmebot.com/whatsapp.php?phone=${phone}&text=${text}&apikey=${apiKey}`);
  } catch (err) {
    console.error('[Admin notify]', err.message);
  }
}

// ── Daraja helpers ─────────────────────────────────────────────────────────────

const DARAJA_BASE = process.env.MPESA_ENV === 'production'
  ? 'https://api.safaricom.co.ke'
  : 'https://sandbox.safaricom.co.ke';

async function getDarajaToken() {
  const credentials = Buffer.from(
    `${process.env.MPESA_CONSUMER_KEY}:${process.env.MPESA_CONSUMER_SECRET}`
  ).toString('base64');
  const { data } = await axios.get(
    `${DARAJA_BASE}/oauth/v1/generate?grant_type=client_credentials`,
    { headers: { Authorization: `Basic ${credentials}` } }
  );
  return data.access_token;
}

function getTimestamp() {
  return new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 14);
}

function buildPassword(timestamp) {
  const raw = `${process.env.MPESA_SHORTCODE}${process.env.MPESA_PASSKEY}${timestamp}`;
  return Buffer.from(raw).toString('base64');
}

// ── Routes ─────────────────────────────────────────────────────────────────────

// Initiate STK Push
app.post('/api/mpesa/stkpush', async (req, res) => {
  // cartItems shape: [{id: uuid, name: string, qty: number, price: number}]
  // Kept minimal — full product objects are NOT sent to reduce payload size.
  // The DB trigger fn_decrement_stock_on_payment uses id+qty to decrement stock.
  const { phone, amount, orderId, address, county, city, notes, cartItems } = req.body;
  if (!phone || !amount) return res.status(400).json({ error: 'phone and amount are required' });
  // A25: reject negative or zero amounts before they reach Daraja.
  // Math.ceil(-100) = -100 — Safaricom would receive a negative charge.
  if (Number(amount) <= 0) return res.status(400).json({ error: 'amount must be greater than 0' });
  // A26: reject cart items with negative qty — they would INCREASE stock via the trigger.
  if (Array.isArray(cartItems) && cartItems.some(i => Number(i.qty) <= 0))
    return res.status(400).json({ error: 'all cart item quantities must be positive' });

  const normalised = phone.replace(/^0/, '254').replace(/^\+/, '');

  try {
    const token     = await getDarajaToken();
    const timestamp = getTimestamp();
    const password  = buildPassword(timestamp);

    const { data } = await axios.post(
      `${DARAJA_BASE}/mpesa/stkpush/v1/processrequest`,
      {
        BusinessShortCode: process.env.MPESA_SHORTCODE,
        Password:          password,
        Timestamp:         timestamp,
        TransactionType:   'CustomerPayBillOnline',
        Amount:            Math.ceil(amount),
        PartyA:            normalised,
        PartyB:            process.env.MPESA_SHORTCODE,
        PhoneNumber:       normalised,
        CallBackURL:       process.env.MPESA_CALLBACK_URL,
        AccountReference:  orderId || 'KAMILI',
        TransactionDesc:   'Kamili Store Payment',
      },
      { headers: { Authorization: `Bearer ${token}` } }
    );

    const checkoutId = data.CheckoutRequestID;

    await supabase.from('payments').insert({
      checkout_request_id: checkoutId,
      phone:               normalised,
      amount:              Math.ceil(amount),
      order_id:            orderId || null,
      address:             address || null,
      county:              county  || null,
      city:                city    || null,
      notes:               notes   || null,
      status:              'pending',
      // Snapshot the cart at payment initiation time.
      // The DB trigger reads this when status flips to 'success' and
      // decrements products.quantity accordingly.
      cart_items:          Array.isArray(cartItems) ? cartItems : [],
    });

    return res.json({ checkoutRequestId: checkoutId });
  } catch (err) {
    console.error('[STK Push]', err.response?.data || err.message);
    return res.status(500).json({
      error: err.response?.data?.errorMessage || 'Failed to initiate payment',
    });
  }
});

// Safaricom callback — extracts customer name from M-Pesa response
app.post('/api/mpesa/callback', async (req, res) => {
  const body = req.body?.Body?.stkCallback;
  if (!body) return res.json({ ResultCode: 0, ResultDesc: 'Accepted' });

  const checkoutId = body.CheckoutRequestID;
  const resultCode = body.ResultCode;

  if (resultCode === 0) {
    const meta     = body.CallbackMetadata?.Item || [];
    const getValue = (name) => meta.find((i) => i.Name === name)?.Value ?? null;

    const firstName  = getValue('FirstName')  ? String(getValue('FirstName'))  : '';
    const middleName = getValue('MiddleName') ? String(getValue('MiddleName')) : '';
    const lastName   = getValue('LastName')   ? String(getValue('LastName'))   : '';
    const customerName = [firstName, middleName, lastName].filter(Boolean).join(' ').toUpperCase();
    const mpesaRef   = getValue('MpesaReceiptNumber');
    const amount     = getValue('Amount');

    // A2: Idempotency — Safaricom retries callbacks on network failure.
    // Use .eq('status','pending') so the UPDATE only lands once.
    // If the payment is already 'success', data will be [] and we skip the notification.
    const { data: updated, error: updateErr } = await supabase.from('payments').update({
      status:            'success',
      mpesa_ref:         mpesaRef,
      customer_name:     customerName || null,
      mpesa_first_name:  firstName  || null,
      mpesa_middle_name: middleName || null,
      mpesa_last_name:   lastName   || null,
    }).eq('checkout_request_id', checkoutId)
      .eq('status', 'pending') // only update if still pending — prevents double-fire
      .select('id');

    if (updateErr) {
      console.error('[callback] payment update error for', checkoutId, '—', updateErr.message, updateErr.code);
      return res.status(500).json({ ResultCode: 1, ResultDesc: 'Internal error' });
    }

    if (!updated || updated.length === 0) {
      // Already processed (duplicate callback) — acknowledge and exit cleanly.
      console.log('[callback] duplicate_callback for', checkoutId, '— skipped');
      return res.json({ ResultCode: 0, ResultDesc: 'Accepted' });
    }

    // Fetch the full payment record to get location details
    const { data: payment } = await supabase.from('payments')
      .select('phone, county, city, address, order_id')
      .eq('checkout_request_id', checkoutId)
      .single();

    const location = [payment?.city, payment?.county].filter(Boolean).join(', ') || payment?.address || 'Not provided';
    const phone    = payment?.phone ? String(payment.phone).replace(/^254/, '0') : '—';

    await notifyAdmin(
      `✅ NEW MPESA PAYMENT - KAMILI\n\n` +
      `Customer: ${customerName || 'Unknown'}\n` +
      `Phone: ${phone}\n` +
      `Location: ${location}\n` +
      `Amount: Ksh ${Number(amount).toLocaleString()}\n` +
      `Receipt: ${mpesaRef}\n` +
      `Order: ${payment?.order_id || '—'}\n\n` +
      `Please arrange delivery 🚚`
    );

  } else {
    await supabase.from('payments').update({
      status:      'failed',
      fail_reason: body.ResultDesc,
    }).eq('checkout_request_id', checkoutId);
  }

  return res.json({ ResultCode: 0, ResultDesc: 'Accepted' });
});

// Poll payment status — returns customer_name when available
app.get('/api/mpesa/status/:id', async (req, res) => {
  const { data, error } = await supabase
    .from('payments')
    .select('status, mpesa_ref, fail_reason, amount, phone, customer_name, county, city, address')
    .eq('checkout_request_id', req.params.id)
    .single();

  if (error || !data) return res.status(404).json({ error: 'Not found' });
  return res.json(data);
});

app.listen(PORT, () => {
  console.log(`Kamili API → http://localhost:${PORT}`);
  console.log(`M-Pesa env: ${process.env.MPESA_ENV || 'sandbox'}`);
});
