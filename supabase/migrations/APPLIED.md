# Applied migrations

Both of these were run against the live `kamili` project (Supabase SQL
editor) on 2026-09-04 and verified afterwards:

- `20260903000000_whatsapp_only_orders.sql`
  Verified: `payments.channel`, `paid_method`, `paid_at` all present; an
  anonymous insert of a `channel='whatsapp'`, `status='new'` order
  SUCCEEDS, so storefront orders persist. RLS holds — anon cannot read
  orders back and cannot insert one with `status='paid'`.

  Note for future debugging: an anon insert with
  `Prefer: return=representation` fails with "new row violates row-level
  security policy". That is CORRECT and not a bug — returning the row
  needs a SELECT policy, which anon deliberately does not have.
  supabase-js `.insert()` without `.select()` sends `return=minimal`,
  which is the path the storefront uses.

- `20260904000000_product_colours.sql`
  Verified: `products.colours` present. Populated on 36 listings via
  `scripts/set_product_colours.py`, from colours measured out of each
  product's own photograph.

- `20260904120000_fix_review_self_approval.sql`
  Verified applied **2026-09-06** by querying the live `kamili` project
  directly (Supabase SQL editor, `main` PRODUCTION):
  - `position('new.status := ' in prosrc) > 0` → **true**, so
    `fn_auto_approve_verified_review` forces `status := 'pending'` and
    discards whatever the client sent. The anonymous
    `status='approved'` self-approval hole is closed.
  - `position('paid' in prosrc) > 0` → **true**, so verified-buyer
    approval matches the current `paid` vocabulary, not just the retired
    `success`.
  - `trg_auto_approve_verified_review` present on `reviews` (1 row in
    `pg_trigger`).
  - Bonus re-check of the earlier migration: the
    `public insert whatsapp orders` policy is still on `payments`.

  It was applied on 2026-09-04 (same session as commit 480f599, "Security:
  close review self-approval") but never written down here — which made it
  look unapplied for two days. **If you apply a migration, add it to this
  file in the same session.** An unrecorded migration reads exactly like a
  forgotten one.
