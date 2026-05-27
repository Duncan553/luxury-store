-- Backfill payments columns that may be absent if an older schema was used.
-- Every statement is idempotent (safe to re-run).

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
alter table payments add column if not exists mpesa_ref         text;

-- Generated ALWAYS columns require a DO-block guard.
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

-- Reload PostgREST schema cache to pick up all new columns.
notify pgrst, 'reload schema';
