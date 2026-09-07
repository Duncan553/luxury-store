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

- `20260907000000_product_images.sql`
  Applied **2026-09-07** with `npx supabase db push` (not by hand), and
  verified immediately against the live `kamili` project:
  - `products.images` exists; all **44** rows backfilled from `image_url`,
    none left empty.
  - `images[0] === image_url` on every row, so the
    `trg_products_sync_cover` trigger holds the invariant it was written for.
  - Trigger re-checked live: writing a 3-photo array to one product set
    `image_url` to the first entry on its own. That product was restored to
    its original single photo straight after.

  **History drift fixed in the same session.** `20260903000000`,
  `20260904000000` and `20260904120000` were applied by hand in the SQL
  editor and so were missing from Supabase's `schema_migrations` table.
  `supabase db push` would have RE-RUN all three — and
  `20260903000000` ends with
  `update payments set status='cancelled' where status in ('pending','failed')`,
  which can rewrite live order rows. They were marked applied with
  `npx supabase migration repair --status applied <version>` (metadata only,
  no SQL executed) before pushing, so only the new migration ran.
  **Apply migrations with `db push` from now on** — applying by hand is what
  created this trap, and the next person to push would have sprung it.
