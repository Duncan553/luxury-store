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
