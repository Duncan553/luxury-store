-- Kamili Store — full database schema
-- Run in: https://supabase.com/dashboard/project/llxeazcqroaojjhogpjx/sql/new

-- ── Products ──────────────────────────────────────────────────────────────────
create table if not exists products (
  id         uuid        primary key default gen_random_uuid(),
  name       text        not null,
  price      numeric     not null,
  category   text        not null,
  status     text        not null default 'Available',
  quantity   int         not null default 0,
  image_url  text,
  created_at timestamptz not null default now()
);

-- ── Categories ────────────────────────────────────────────────────────────────
create table if not exists categories (
  id         uuid        primary key default gen_random_uuid(),
  name       text        not null unique,
  slug       text        not null unique,
  cover_url  text,
  created_at timestamptz not null default now()
);

-- Seed default categories (safe to re-run)
insert into categories (name, slug) values
  ('Bags',    'bags'),
  ('Jewelry', 'jewelry'),
  ('Watches', 'watches')
on conflict (slug) do nothing;

-- ── Reviews ───────────────────────────────────────────────────────────────────
create table if not exists reviews (
  id         uuid        primary key default gen_random_uuid(),
  name       text,
  text       text        not null,
  rating     int         not null check (rating between 1 and 5),
  status     text        not null default 'pending',
  created_at timestamptz not null default now()
);

-- ── Payments (M-Pesa STK Push) ────────────────────────────────────────────────
create table if not exists payments (
  id                  uuid        primary key default gen_random_uuid(),
  checkout_request_id text        unique,
  phone               text,
  amount              numeric,
  order_id            text,
  address             text,
  county              text,
  city                text,
  notes               text,
  status              text        not null default 'pending',
  mpesa_ref           text,
  fail_reason         text,
  customer_name       text,
  mpesa_first_name    text,
  mpesa_middle_name   text,
  mpesa_last_name     text,
  created_at          timestamptz not null default now()
);

-- Migration (if table already exists, add missing columns):
alter table payments add column if not exists county            text;
alter table payments add column if not exists city              text;
alter table payments add column if not exists notes             text;
alter table payments add column if not exists customer_name     text;
alter table payments add column if not exists mpesa_first_name  text;
alter table payments add column if not exists mpesa_middle_name text;
alter table payments add column if not exists mpesa_last_name   text;
-- cart_items stores [{id, name, qty, price}] so stock can be decremented on payment success
alter table payments add column if not exists cart_items jsonb not null default '[]'::jsonb;

-- ── Row Level Security ────────────────────────────────────────────────────────
alter table products   enable row level security;
alter table categories enable row level security;
alter table reviews    enable row level security;
alter table payments   enable row level security;

-- Public read
create policy "public read products"
  on products for select using (true);

create policy "public read categories"
  on categories for select using (true);

create policy "public read approved reviews"
  on reviews for select using (status = 'approved');

create policy "public insert reviews"
  on reviews for insert with check (true);

-- Authenticated admin — full write access to products
create policy "admin insert products"
  on products for insert to authenticated with check (true);

create policy "admin update products"
  on products for update to authenticated using (true);

create policy "admin delete products"
  on products for delete to authenticated using (true);

-- Authenticated admin — full write access to categories
create policy "admin insert categories"
  on categories for insert to authenticated with check (true);

create policy "admin update categories"
  on categories for update to authenticated using (true);

create policy "admin delete categories"
  on categories for delete to authenticated using (true);

-- Authenticated admin — manage reviews
create policy "admin update reviews"
  on reviews for update to authenticated using (true);

create policy "admin delete reviews"
  on reviews for delete to authenticated using (true);

-- Authenticated admin — manage payments
create policy "admin manage payments"
  on payments for all to authenticated using (true);

-- ── Trigger: auto-correct product status when quantity changes ────────────────
-- Runs BEFORE UPDATE so we can mutate NEW before it lands in the row.
-- Only fires when quantity actually changes (DISTINCT FROM avoids null edge cases).
create or replace function fn_auto_product_status()
returns trigger
language plpgsql as $$
begin
  if new.quantity is distinct from old.quantity then
    -- Quantity hit zero and this isn't a pre-order → mark sold out
    if new.quantity <= 0 and new.status != 'Pre-Order' then
      new.status := 'Out of Stock';
    -- Quantity came back from zero → restore to Available
    -- (only if it was Out of Stock, to avoid overwriting Low Stock etc.)
    elsif new.quantity > 0 and old.status = 'Out of Stock' then
      new.status := 'Available';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_auto_product_status on products;
create trigger trg_auto_product_status
  before update on products
  for each row execute function fn_auto_product_status();

-- ── Trigger: decrement stock when a payment succeeds ─────────────────────────
-- Runs AFTER UPDATE on payments so NEW values are committed and readable.
-- Uses a single batched UPDATE (correlated subquery, not a loop) so all
-- products are adjusted in one round-trip to the DB.
-- security definer so the function runs with owner privileges regardless of
-- the RLS context of the session that updated the payment row.
create or replace function fn_decrement_stock_on_payment()
returns trigger
language plpgsql
security definer as $$
begin
  -- Guard: only fire when status transitions TO 'success'
  if new.status = 'success' and old.status is distinct from 'success' then
    -- Guard: nothing to do if cart_items is missing or empty
    if jsonb_array_length(coalesce(new.cart_items, '[]'::jsonb)) > 0 then

      -- Single batched UPDATE.
      -- The correlated subquery extracts the qty for each matching product
      -- from the JSONB array. greatest(0, ...) prevents negative stock.
      -- The trg_auto_product_status trigger fires on each updated row
      -- and will flip status to 'Out of Stock' if quantity reaches 0.
      update products
      set quantity = greatest(0, quantity - (
        select (ci->>'qty')::int
        from jsonb_array_elements(new.cart_items) as ci
        where (ci->>'id')::uuid = products.id
        limit 1
      ))
      where id in (
        select (ci->>'id')::uuid
        from jsonb_array_elements(new.cart_items) as ci
      );

    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_decrement_stock_on_payment on payments;
create trigger trg_decrement_stock_on_payment
  after update on payments
  for each row execute function fn_decrement_stock_on_payment();

-- ── Store Settings (single-row config) ───────────────────────────────────────
create table if not exists store_settings (
  id         text        primary key default 'singleton',
  whatsapp   text,
  phone      text,
  email      text,
  instagram  text,
  location   text,
  hours      text,
  tagline    text,
  updated_at timestamptz default now()
);

alter table store_settings enable row level security;

create policy "public read settings"
  on store_settings for select using (true);

create policy "admin manage settings"
  on store_settings for all to authenticated using (true);

-- ── Storage policies (run AFTER creating the 'images' bucket) ─────────────────
-- Authenticated admin can upload / update / delete
create policy "admin can upload images"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'images');

create policy "admin can update images"
  on storage.objects for update to authenticated
  using (bucket_id = 'images');

create policy "admin can delete images"
  on storage.objects for delete to authenticated
  using (bucket_id = 'images');

-- Public can view images
create policy "public can view images"
  on storage.objects for select
  using (bucket_id = 'images');

-- ═══════════════════════════════════════════════════════════════════════════════
-- PHASE 3 — AUTOMATIONS
-- Run this block AFTER the base schema above is already in place.
-- Every statement is idempotent (safe to re-run).
-- ═══════════════════════════════════════════════════════════════════════════════

-- ── Task 1: Auto thank-you WhatsApp tracking ──────────────────────────────────
-- Prevents re-triggering the thank-you message if the admin reloads the page.
alter table payments add column if not exists thankyou_sent boolean not null default false;

-- ── Task 2: Verified-buyer auto-approve reviews ───────────────────────────────

-- reviews gets a phone column so the insert can carry the reviewer's number.
alter table reviews add column if not exists phone text;

-- Admin-only RLS: read ALL reviews (including pending ones in the admin tab).
-- The existing "public read approved reviews" policy only exposes status=approved.
do $$ begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'reviews' and policyname = 'admin read all reviews'
  ) then
    execute 'create policy "admin read all reviews"
      on reviews for select to authenticated using (true)';
  end if;
end $$;

-- Normalised phone tail: strip non-digits, keep last 9 digits.
-- Stored generated column → computed once at write time, not on every read.
-- Used by the verified-buyer trigger below for an indexed O(1) lookup.
do $$ begin
  if not exists (
    select 1 from information_schema.columns
    where table_name = 'payments' and column_name = 'phone_normalized'
  ) then
    alter table payments
      add column phone_normalized text
        generated always as (
          right(regexp_replace(coalesce(phone, ''), '\D', '', 'g'), 9)
        ) stored;
  end if;
end $$;

-- Partial index: only indexes rows where status = 'success'.
-- Keeps the index small and the trigger lookup fast.
create index if not exists idx_payments_phone_norm
  on payments (phone_normalized)
  where status = 'success';

-- Trigger function: runs BEFORE INSERT on reviews.
-- If the reviewer's phone matches a successful payment → auto-approve.
-- security definer so it can read payments regardless of RLS.
create or replace function fn_auto_approve_verified_review()
returns trigger language plpgsql security definer as $$
declare
  tail text;
begin
  -- Nothing to check if no phone was supplied
  if new.phone is null or trim(new.phone) = '' then
    return new;
  end if;

  -- Normalise: strip non-digits, last 9 digits (matches KE 07xx and +254 7xx)
  tail := right(regexp_replace(new.phone, '\D', '', 'g'), 9);

  if exists (
    select 1 from payments
    where phone_normalized = tail
      and status = 'success'
    limit 1
  ) then
    new.status := 'approved';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_auto_approve_verified_review on reviews;
create trigger trg_auto_approve_verified_review
  before insert on reviews
  for each row execute function fn_auto_approve_verified_review();

-- ── Task 3: Stale payment cleanup (pg_cron) ───────────────────────────────────
-- Requires pg_cron extension — available on all Supabase plans (enable in
-- Database → Extensions → pg_cron if not already active).
-- Marks pending payments as 'failed' if they are older than 1 hour.
-- Runs every 15 minutes. Idempotent: only rows still 'pending' are touched.

create extension if not exists pg_cron;

select cron.schedule(
  'cleanup-stale-payments',    -- job name (must be unique)
  '*/15 * * * *',              -- every 15 minutes
  $$
    update payments
    set    status      = 'failed',
           fail_reason = 'timeout — no M-Pesa confirmation after 1 hour'
    where  status      = 'pending'
      and  created_at  < now() - interval '1 hour';
  $$
);

-- ── Task 4: Review-prompt tracking columns ────────────────────────────────────
-- dispatched_at: set by the admin when they click the dispatch WhatsApp button.
-- review_prompt_ready: set true by the daily pg_cron job below.
-- review_prompt_sent:  set true by the admin when they click "Send review prompt".

alter table payments add column if not exists dispatched_at       timestamptz;
alter table payments add column if not exists review_prompt_ready boolean not null default false;
alter table payments add column if not exists review_prompt_sent  boolean not null default false;

-- Daily job (2 am Nairobi = 23:00 UTC):
-- Marks orders that were dispatched ≥ 5 days ago AND haven't had a prompt sent yet.
-- The Action Center in AdminDashboard reads review_prompt_ready = true.
-- Idempotent: the review_prompt_ready = false guard prevents double-flagging.
select cron.schedule(
  'review-prompt-scheduler',
  '0 23 * * *',    -- 23:00 UTC = 02:00 Nairobi (UTC+3)
  $$
    update payments
    set    review_prompt_ready = true
    where  status              = 'success'
      and  dispatched_at       is not null
      and  dispatched_at       < now() - interval '5 days'
      and  review_prompt_sent  = false
      and  review_prompt_ready = false;
  $$
);

-- ── Task 6: Weekly backup (pg_cron kicks off the Edge Function) ───────────────
-- The Edge Function "weekly-backup" writes a JSON snapshot to Storage.
-- pg_net must be enabled (Database → Extensions → pg_net).
-- Replace PROJECT_REF and SERVICE_ROLE_KEY with your actual values before running.

/*  -- Uncomment after deploying the weekly-backup Edge Function:

create extension if not exists pg_net;

select cron.schedule(
  'weekly-backup',
  '0 23 * * 0',    -- 23:00 UTC Sunday = 02:00 Nairobi Monday
  $$
    select net.http_post(
      url     := 'https://PROJECT_REF.supabase.co/functions/v1/weekly-backup',
      headers := jsonb_build_object(
        'Authorization', 'Bearer SERVICE_ROLE_KEY',
        'Content-Type',  'application/json'
      ),
      body    := '{}'::jsonb
    );
  $$
);

*/

-- ── Task 6: Backups bucket policies ──────────────────────────────────────────
-- Run AFTER creating the 'backups' bucket in Supabase Storage with
-- "Public bucket" toggled OFF (private).

/*  -- Uncomment after creating the backups bucket:

create policy "service role can write backups"
  on storage.objects for insert
  with check (bucket_id = 'backups');

create policy "admin can read backups"
  on storage.objects for select to authenticated
  using (bucket_id = 'backups');

*/

-- ── Market Hardening additions ────────────────────────────────────────────────
-- These run unconditionally (no bucket required).

-- C1: dispatch photo URL — proof of dispatch for dispute resolution
alter table payments add column if not exists dispatch_photo_url text;

-- C2: vacation mode — store can accept pre-orders while closed
alter table store_settings add column if not exists vacation_mode    boolean not null default false;
alter table store_settings add column if not exists vacation_message text;

-- D1: admin reminders — monthly backup reminders surface here
create table if not exists admin_reminders (
  id         uuid        primary key default gen_random_uuid(),
  message    text        not null,
  read       boolean     not null default false,
  created_at timestamptz not null default now()
);
alter table admin_reminders enable row level security;
drop policy if exists "admin manage reminders" on admin_reminders;
create policy "admin manage reminders"
  on admin_reminders for all to authenticated using (true);

-- D3: renewal date tracking
alter table store_settings add column if not exists domain_renewal_date  date;
alter table store_settings add column if not exists hosting_renewal_date date;
alter table store_settings add column if not exists ssl_renewal_date     date;

-- D1: pg_cron monthly backup reminder (fires 1st of each month at 08:00 Nairobi = 05:00 UTC)
-- Uncomment after deploying the monthly-reminder Edge Function:
-- select cron.schedule(
--   'monthly-backup-reminder',
--   '0 5 1 * *',
--   $$
--     insert into admin_reminders (message) values (
--       'Time for monthly manual backup — download from Storage → backups bucket → save to Google Drive → test restore on a fresh Supabase project'
--     );
--   $$
-- );

-- ═══════════════════════════════════════════════════════════════════════════════
-- PHASE 4 — SECURITY HARDENING & BUG FIXES
-- Run this entire block in the Supabase SQL editor.
-- Every statement is idempotent (safe to re-run).
-- ═══════════════════════════════════════════════════════════════════════════════

-- ── FIX 1: Products RLS ───────────────────────────────────────────────────────
-- Old per-operation policies used `to authenticated` role targeting but did not
-- set auth.role() in the USING/WITH CHECK expressions, which can be bypassed
-- depending on how the JWT is presented. Replace with two explicit policies that
-- check auth.role() directly, covering all operations from a single policy.

alter table products enable row level security;

-- Drop both old names (from initial schema) and new consolidated names.
drop policy if exists "public read products"  on products;
drop policy if exists "admin insert products" on products;
drop policy if exists "admin update products" on products;
drop policy if exists "admin delete products" on products;
drop policy if exists "products_public_read"  on products;
drop policy if exists "products_admin_write"  on products;

create policy "products_public_read" on products
  for select using (true);

-- auth.role() = 'authenticated' in both USING and WITH CHECK blocks every
-- anonymous write attempt regardless of which operation is used.
create policy "products_admin_write" on products
  for all
  using      (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

-- ── FIX 2: Reviews RLS ───────────────────────────────────────────────────────
-- Old policies let anon DELETE (no explicit deny) and showed all statuses to
-- anon SELECT. Rebuild with explicit per-operation policies.

alter table reviews enable row level security;

drop policy if exists "public read approved reviews" on reviews;
drop policy if exists "public insert reviews"        on reviews;
drop policy if exists "admin update reviews"         on reviews;
drop policy if exists "admin delete reviews"         on reviews;
drop policy if exists "admin read all reviews"       on reviews;
drop policy if exists "reviews_public_read"          on reviews;
drop policy if exists "reviews_public_insert"        on reviews;
drop policy if exists "reviews_admin_update"         on reviews;
drop policy if exists "reviews_admin_delete"         on reviews;

-- Anon sees only approved; authenticated admin sees everything.
create policy "reviews_public_read" on reviews
  for select using (status = 'approved' or auth.role() = 'authenticated');

-- Anyone can submit a review (anon storefront insert).
create policy "reviews_public_insert" on reviews
  for insert with check (true);

-- Only authenticated admin can moderate or delete reviews.
create policy "reviews_admin_update" on reviews
  for update using (auth.role() = 'authenticated');

create policy "reviews_admin_delete" on reviews
  for delete using (auth.role() = 'authenticated');

-- ── FIX 3+4: Trigger hardening — idempotency + negative qty guard ─────────────
-- Bug 1: greatest(0, qty - (-5)) = qty+5 — negative qty in cart increased stock.
-- Bug 2: pending→success→pending→success replayed the decrement because
--        old.status was 'pending' on the second flip, bypassing the IS DISTINCT
--        FROM guard. stock_decremented blocks any replay regardless of path.
-- Fix: clamp qty at source (greatest(0, qty)), add stock_decremented flag, and
--      switch to BEFORE trigger so the flag is written to NEW without a second
--      UPDATE round-trip.

alter table payments
  add column if not exists stock_decremented bool not null default false;

create or replace function fn_decrement_stock_on_payment()
returns trigger language plpgsql security definer as $$
begin
  -- Only run on the transition to success, and only once ever per payment.
  -- old.stock_decremented guards against any replay of the same row update.
  if new.status = 'success'
     and old.status is distinct from 'success'
     and coalesce(old.stock_decremented, false) = false
  then
    if jsonb_array_length(coalesce(new.cart_items, '[]'::jsonb)) > 0 then
      -- Single batched UPDATE with FROM clause (faster than correlated subquery).
      -- greatest(0, qty) on the INPUT side prevents a malicious negative qty
      -- from increasing stock. greatest(0, p.quantity - qty) on the OUTPUT side
      -- prevents stock going negative due to overselling.
      update products p
      set quantity = greatest(0, p.quantity - ci.qty)
      from (
        select
          (item->>'id')::uuid as id,
          greatest(0, (item->>'qty')::int) as qty
        from jsonb_array_elements(new.cart_items) as item
      ) ci
      where p.id = ci.id;

      -- BEFORE trigger lets us mutate NEW directly — no second UPDATE needed.
      new.stock_decremented := true;
    end if;
  end if;
  return new;
end;
$$;

-- Switch from AFTER to BEFORE so we can write new.stock_decremented in-place.
drop trigger if exists trg_decrement_stock_on_payment on payments;
create trigger trg_decrement_stock_on_payment
  before update on payments
  for each row execute function fn_decrement_stock_on_payment();

-- ── FIX 5: Reload PostgREST schema cache ─────────────────────────────────────
-- store_settings was added after PostgREST last read the schema. This NOTIFY
-- tells PostgREST to re-introspect without a full service restart.
notify pgrst, 'reload schema';

-- ── Known Gap: Review insert rate-limit ──────────────────────────────────────
-- Rejects INSERT if the same phone has submitted ≥ 3 reviews in the last hour.
-- Guards against spam without requiring authentication.

create or replace function fn_review_rate_limit()
returns trigger language plpgsql as $$
declare recent_count int;
begin
  if new.phone is not null then
    select count(*) into recent_count from reviews
      where phone = new.phone
        and created_at > now() - interval '1 hour';
    if recent_count >= 3 then
      raise exception 'Rate limit: too many reviews from this phone';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_review_rate_limit on reviews;
create trigger trg_review_rate_limit
  before insert on reviews
  for each row execute function fn_review_rate_limit();

-- ── Updated kamili_check_setup() — now also checks stock_decremented column ──
-- Replaces the old version; safe to re-run.
create or replace function public.kamili_check_setup()
returns jsonb language plpgsql security definer
set search_path = public as $$
declare
  has_pg_cron      bool := false;
  has_cron_cleanup bool := false;
  has_cron_review  bool := false;
begin
  select exists(select 1 from pg_catalog.pg_extension where extname = 'pg_cron')
    into has_pg_cron;

  if has_pg_cron then
    execute 'select exists(select 1 from cron.job where jobname = $1)'
      into has_cron_cleanup using 'cleanup-stale-payments';
    execute 'select exists(select 1 from cron.job where jobname = $1)'
      into has_cron_review using 'review-prompt-scheduler';
  end if;

  return jsonb_build_object(
    'pg_cron',              has_pg_cron,
    'cron_cleanup',         has_cron_cleanup,
    'cron_review',          has_cron_review,
    'trg_stock',            (select exists(select 1 from information_schema.triggers
                               where trigger_name = 'trg_decrement_stock_on_payment'
                                 and event_object_table = 'payments')),
    'trg_auto_status',      (select exists(select 1 from information_schema.triggers
                               where trigger_name = 'trg_auto_product_status'
                                 and event_object_table = 'products')),
    'trg_auto_approve',     (select exists(select 1 from information_schema.triggers
                               where trigger_name = 'trg_auto_approve_verified_review'
                                 and event_object_table = 'reviews')),
    'stock_decremented_col',(select exists(select 1 from information_schema.columns
                               where table_name = 'payments'
                                 and column_name = 'stock_decremented'))
  );
end;
$$;
