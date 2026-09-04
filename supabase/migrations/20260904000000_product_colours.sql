-- Colours a product is available in.
--
-- Stored as a text[] rather than a comma-separated string so the storefront
-- can count them ("3 colours") and render one swatch per entry without
-- parsing, and so a colour name containing a comma can't corrupt the list.
--
-- Nullable with no default on purpose: "no colours recorded" and "available
-- in no colours" are different things, and the UI must show nothing at all
-- rather than an empty swatch row for products the owner hasn't filled in.

alter table public.products
  add column if not exists colours text[];

comment on column public.products.colours is
  'Colour names this piece is available in, e.g. {Black,Tan,Cream}. NULL = not recorded; the storefront hides the colour row entirely in that case.';

-- Index only matters if we ever filter by colour; skipped deliberately —
-- this catalogue is dozens of rows, not thousands, and an unused index is
-- write cost for nothing.
