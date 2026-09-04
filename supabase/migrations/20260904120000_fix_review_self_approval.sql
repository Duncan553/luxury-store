-- Close a review self-approval hole, and fix a status mismatch the
-- WhatsApp-orders migration introduced.
--
-- HOLE: reviews_public_insert has `with check (true)` — literally "allow
-- anything". The auto-approve trigger below returns early when no phone is
-- supplied, so whatever `status` the client sent survives. An anonymous
-- POST with status='approved' therefore lands straight on the About page
-- with no moderation: fake five-star reviews, or abusive text, published
-- instantly. Verified by probe before this fix.
--
-- Why the fix is in the TRIGGER and not the policy: the trigger is BEFORE
-- INSERT and legitimately promotes verified buyers to 'approved'. RLS
-- WITH CHECK is evaluated AFTER before-triggers, so a policy of
-- `status = 'pending'` would reject exactly the rows the trigger just
-- approved — it would close the hole by breaking the feature. Forcing the
-- value inside the trigger ignores whatever the client sent while leaving
-- the trigger's own decision intact.
--
-- SECOND BUG: this function looked for payments with status = 'success'.
-- The WhatsApp-orders migration retired that vocabulary in favour of
-- 'paid', so verified-buyer approval had silently stopped matching
-- anything. Both values are accepted now, so historical rows still count.

create or replace function fn_auto_approve_verified_review()
returns trigger language plpgsql security definer as $$
declare
  tail text;
begin
  -- The client does not get a say in this. Whatever status arrived on the
  -- request is discarded; the only way out of 'pending' is the check below
  -- or an admin acting as an authenticated user.
  new.status := 'pending';

  if new.phone is null or trim(new.phone) = '' then
    return new;
  end if;

  -- Normalise: strip non-digits, last 9 digits (matches KE 07xx and +254 7xx)
  tail := right(regexp_replace(new.phone, '\D', '', 'g'), 9);

  if exists (
    select 1 from payments
    where phone_normalized = tail
      -- 'paid' is the current vocabulary; 'success' is kept so historical
      -- M-Pesa rows still verify a buyer.
      and status in ('paid', 'success')
    limit 1
  ) then
    new.status := 'approved';
  end if;

  return new;
end;
$$;

-- Trigger definition unchanged; recreated so the order is explicit.
drop trigger if exists trg_auto_approve_verified_review on reviews;
create trigger trg_auto_approve_verified_review
  before insert on reviews
  for each row execute function fn_auto_approve_verified_review();

-- Admins keep full control through the authenticated policies that already
-- exist (reviews_admin_update / reviews_admin_delete), so approving a
-- review from the dashboard is unaffected.
