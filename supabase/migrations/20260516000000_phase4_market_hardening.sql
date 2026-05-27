-- ── Market Hardening additions ────────────────────────────────────────────────
-- Self-contained: creates any missing base tables before altering them.

-- Backfill payments columns that may be absent if an older schema was run.
alter table payments add column if not exists county            text;
alter table payments add column if not exists city              text;
alter table payments add column if not exists notes             text;
alter table payments add column if not exists customer_name     text;
alter table payments add column if not exists mpesa_first_name  text;
alter table payments add column if not exists mpesa_middle_name text;
alter table payments add column if not exists mpesa_last_name   text;
alter table payments add column if not exists order_id          text;
alter table payments add column if not exists address           text;
alter table payments add column if not exists fail_reason       text;
alter table payments add column if not exists thankyou_sent     boolean not null default false;

-- Generated ALWAYS columns require a DO-block guard (no IF NOT EXISTS in ADD COLUMN).
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

create index if not exists idx_payments_phone_norm
  on payments (phone_normalized)
  where status = 'success';

-- C1: dispatch photo URL — proof of dispatch for dispute resolution
alter table payments add column if not exists dispatch_photo_url text;

-- Ensure store_settings exists (base row may not have been created yet).
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
drop policy if exists "public read settings"   on store_settings;
drop policy if exists "admin manage settings"  on store_settings;
create policy "public read settings"  on store_settings for select using (true);
create policy "admin manage settings" on store_settings for all to authenticated using (true);

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

create table if not exists reviews (
  id         uuid        primary key default gen_random_uuid(),
  name       text,
  text       text        not null,
  rating     int         not null check (rating between 1 and 5),
  status     text        not null default 'pending',
  created_at timestamptz not null default now()
);

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

-- Ensure cart_items exists — may be missing if the original schema predates it.
alter table payments add column if not exists cart_items jsonb not null default '[]'::jsonb;
alter table payments add column if not exists stock_decremented bool not null default false;

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
