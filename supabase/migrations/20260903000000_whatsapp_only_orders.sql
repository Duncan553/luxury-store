-- ─────────────────────────────────────────────────────────────────────────────
-- WhatsApp-only orders. M-Pesa / Daraja is removed from the app.
--
-- The big idea: `payments` was never really a payments table — it is the ORDERS
-- table, and until now the ONLY thing that ever inserted into it was the M-Pesa
-- callback. With M-Pesa gone, the storefront itself must write the order row,
-- so every sale is recorded even though money changes hands in a chat.
--
-- Run this in Supabase → SQL Editor (or `supabase db push`).
-- Safe to re-run: every statement is idempotent.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. New columns ──────────────────────────────────────────────────────────
-- channel: where the order came from. 'mpesa' is the default so existing rows
--          keep their meaning; the storefront now writes 'whatsapp'.
alter table payments add column if not exists channel     text not null default 'mpesa';

-- paid_method: how the customer actually paid. With no payment gateway, the
--              owner is the payment system, so this has to be recorded by hand:
--              'cash' | 'mpesa-till' | 'send-money' | 'bank'
alter table payments add column if not exists paid_method text;

-- paid_at: when the owner marked it paid. Revenue reporting should use this,
--          not created_at — an order created Monday and paid Thursday is
--          Thursday's money.
alter table payments add column if not exists paid_at     timestamptz;


-- ── 2. Let the storefront create an order ───────────────────────────────────
-- Previously the only policy on payments was "admin manage payments" for
-- authenticated users, so an anonymous browser could not insert at all.
--
-- This policy is INSERT-only and tightly pinned:
--   * channel must be 'whatsapp'  → nobody can forge an M-Pesa order
--   * status must be 'new'        → nobody can self-declare an order paid
-- There is deliberately NO select/update/delete policy for anon, so a customer
-- can create their own order and can never read, alter or delete anyone's.
drop policy if exists "public insert whatsapp orders" on payments;
create policy "public insert whatsapp orders"
  on payments for insert to anon
  with check (channel = 'whatsapp' and status = 'new');


-- ── 3. Stock decrement: key off OUR status, not Daraja's ────────────────────
-- The old trigger fired only on status → 'success', which was M-Pesa's word and
-- will now never happen. It fires on 'paid' too, so the admin's "Mark as paid"
-- action is what moves stock. 'success' is kept so historical M-Pesa rows and
-- any in-flight row still behave.
--
-- stock_decremented is the replay guard (added in the Phase 4 migration): a
-- status that bounces paid → new → paid can never decrement twice.
create or replace function fn_decrement_stock_on_payment()
returns trigger
language plpgsql
security definer as $$
begin
  if new.status in ('paid', 'success')
     and old.status is distinct from new.status
     and not coalesce(old.stock_decremented, false)
     and jsonb_array_length(coalesce(new.cart_items, '[]'::jsonb)) > 0
  then
    -- One batched UPDATE, not a loop. The correlated subquery pulls each
    -- product's qty out of the cart_items JSONB; greatest(0, …) prevents
    -- negative stock. trg_auto_product_status then flips any product that
    -- hits 0 to 'Out of Stock' on its own.
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

    -- Claim it, so no later status change can replay the decrement.
    update payments set stock_decremented = true where id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_decrement_stock_on_payment on payments;
create trigger trg_decrement_stock_on_payment
  after update on payments
  for each row execute function fn_decrement_stock_on_payment();


-- ── 4. Retire the M-Pesa stale-push cleanup job ─────────────────────────────
-- This cron marked 'pending' STK pushes as 'failed' after 15 minutes. With no
-- STK push there is nothing to time out, and leaving it running would silently
-- fail brand-new WhatsApp orders that are simply waiting for a reply.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule('cleanup-stale-payments');
  end if;
exception when others then
  -- Job didn't exist under that name — nothing to unschedule.
  null;
end $$;


-- ── 5. Indexes for the new order lifecycle ──────────────────────────────────
-- The admin's default view is "new orders, newest first". Without this the
-- dashboard table-scans payments on every load.
create index if not exists payments_status_created_idx
  on payments (status, created_at desc);

create index if not exists payments_channel_idx
  on payments (channel);


-- ── 6. Backfill: give historical M-Pesa rows the new vocabulary ─────────────
-- 'success' meant paid. Map it across so the admin's Paid filter shows history
-- as well as new orders, and revenue totals stay correct.
update payments
set status      = 'paid',
    paid_method = coalesce(paid_method, 'mpesa-stk'),
    paid_at     = coalesce(paid_at, created_at)
where status = 'success';

-- 'pending' was an STK push nobody completed. Those are dead, not new orders —
-- don't let them show up in the owner's "New" queue forever.
update payments
set status = 'cancelled'
where status in ('pending', 'failed');


-- NOTE ON DROPPING COLUMNS
-- mpesa_ref, mpesa_first_name, mpesa_middle_name, mpesa_last_name and
-- checkout_request_id are now write-only-never. They are deliberately LEFT IN
-- PLACE: historical rows still carry real data in them, and dropping a column
-- is the one migration you cannot undo. Revisit in a month once you're sure.
