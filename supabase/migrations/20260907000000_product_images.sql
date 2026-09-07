-- Multiple photos per product (swipeable gallery on the storefront).
--
-- Shape: `images` is the COMPLETE ordered gallery, first entry = the cover.
-- `image_url` stays exactly as it was and keeps meaning "the cover", so every
-- query, card, cart row, admin thumbnail and SEO tag written before today
-- goes on working untouched.
--
-- The two are kept in step by a trigger rather than by the client. Sync rules
-- living in application code is how the two drift: one forgotten code path
-- and a product's card shows photo A while its gallery opens on photo B.
-- Postgres owns the invariant, so it holds for the admin app, a SQL fix-up,
-- or anything written later.
--
-- text[] rather than jsonb: this is an ordered list of URLs and nothing more.
-- Array ordering is the gallery order, which is the entire data model here.

alter table public.products
  add column if not exists images text[] not null default '{}';

comment on column public.products.images is
  'Ordered gallery; images[1] is the cover and is mirrored into image_url by trg_products_sync_cover. Empty = no photos.';

-- Backfill: every existing product becomes a one-photo gallery.
update public.products
   set images = array[image_url]
 where image_url is not null
   and coalesce(array_length(images, 1), 0) = 0;

-- Keep cover and gallery in step, in both directions.
create or replace function public.fn_products_sync_cover()
returns trigger
language plpgsql
set search_path = ''            -- never resolve names through the caller's path
as $$
begin
  if coalesce(array_length(new.images, 1), 0) > 0 then
    -- Gallery wins: the first photo IS the cover.
    new.image_url := new.images[1];
  elsif new.image_url is not null then
    -- Older client that only knows image_url — give it a one-photo gallery
    -- so the storefront never sees a product with a cover but no gallery.
    new.images := array[new.image_url];
  end if;
  return new;
end;
$$;

drop trigger if exists trg_products_sync_cover on public.products;
create trigger trg_products_sync_cover
  before insert or update of images, image_url on public.products
  for each row execute function public.fn_products_sync_cover();
