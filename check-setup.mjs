// check-setup.mjs — run with: node check-setup.mjs
//
// Prerequisites: run the PHASE 4 block at the bottom of supabase/schema.sql
// in the Supabase SQL editor. That block creates/replaces kamili_check_setup()
// (which this script calls) and adds all Phase 4 columns and triggers.

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dir = dirname(fileURLToPath(import.meta.url));
const env = Object.fromEntries(
  readFileSync(resolve(__dir, '.env'), 'utf8')
    .split('\n')
    .filter(l => l.trim() && !l.startsWith('#') && l.includes('='))
    .map(l => { const i = l.indexOf('='); return [l.slice(0,i).trim(), l.slice(i+1).trim()]; })
);

const URL = env.VITE_SUPABASE_URL;
const KEY = env.SUPABASE_SERVICE_ROLE_KEY;

if (!URL || !KEY) {
  console.error('\n❌  VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing from .env\n');
  process.exit(1);
}

const db = createClient(URL, KEY, { auth: { persistSession: false } });

const missing = [];
const ok      = [];

// Column check via PostgREST — error code 42703 means column missing.
async function checkColumn(table, col) {
  const { error } = await db.from(table).select(col).limit(1);
  if (!error)                                    return true;
  if (error.code === '42703')                    return false;
  if (error.message?.includes('does not exist')) return false;
  throw new Error(error.message);
}

async function check(label, fn) {
  try {
    const passed = await fn();
    passed ? ok.push(label) : missing.push(label);
  } catch (e) {
    missing.push(`${label}  (error: ${e.message})`);
  }
}

// 1. payments columns
for (const col of [
  'cart_items','thankyou_sent','dispatched_at',
  'review_prompt_ready','review_prompt_sent','phone_normalized',
  'stock_decremented',  // idempotency flag added in Phase 4 trigger hardening
]) {
  await check(`payments.${col}`, () => checkColumn('payments', col));
}

// 2. reviews.phone
await check('reviews.phone', () => checkColumn('reviews', 'phone'));

// 3–8. System checks via SECURITY DEFINER function (accesses pg_catalog, cron, information_schema).
//      Create the function first using the SQL block at the top of this file.
const { data: sys, error: sysErr } = await db.rpc('kamili_check_setup');

if (sysErr) {
  // Function doesn't exist yet — tell the user what to do.
  if (sysErr.code === 'PGRST202' || sysErr.message?.includes('Could not find')) {
    console.log('\n⚠️   kamili_check_setup() function not found in your database.');
    console.log('    Run the PHASE 4 block at the bottom of supabase/schema.sql in the Supabase SQL editor,');
    console.log('    then re-run: node check-setup.mjs\n');
    console.log(`   ${ok.length} / ${ok.length + missing.length + 7} column checks completed so far:`);
    ok.forEach(m => console.log(`   ✓ ${m}`));
    missing.forEach(m => console.log(`   • ${m}`));
    process.exit(0);
  }
  missing.push(`system checks  (error: ${sysErr.message})`);
} else {
  const labels = {
    pg_cron:              'pg_cron extension',
    cron_cleanup:         'cron job: cleanup-stale-payments',
    cron_review:          'cron job: review-prompt-scheduler',
    trg_stock:            'auto-decrement-stock trigger',
    trg_auto_status:      'auto-out-of-stock trigger',
    trg_auto_approve:     'verified-buyer auto-approve trigger',
    stock_decremented_col:'payments.stock_decremented column (idempotency)',
  };
  for (const [key, label] of Object.entries(labels)) {
    sys[key] ? ok.push(label) : missing.push(label);
  }
}

// Print result
console.log('');
if (missing.length === 0) {
  console.log('✅  YES — all good. Every column, trigger, extension and cron job is in place.\n');
} else {
  console.log('❌  NO — missing:\n');
  missing.forEach(m => console.log(`   • ${m}`));
  console.log('');
  console.log(`   ${ok.length} / ${ok.length + missing.length} checks passed.`);
  console.log('   Run the relevant SQL from supabase/schema.sql in the Supabase SQL editor to fix.\n');
}
