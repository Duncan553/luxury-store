#!/usr/bin/env python3
"""Write each product's colours, derived from its own photograph.

RUN THIS AFTER applying supabase/migrations/20260904000000_product_colours.sql
(the products table needs the `colours` column first; without it every write
fails with PGRST204 "Could not find the 'colours' column").

Usage:
    cd luxury-store
    set -a; source .env; set +a
    python3 scripts/set_product_colours.py <path-to-colours.json>

colours.json is produced by scripts/derive_colours.py, which reads the
product images and records the dominant colour of the actual product pixels
(white background excluded). Nothing here is guessed: a listing's colour is
whatever its photograph is actually made of, matched to the same palette the
storefront paints its swatches from.
"""
import json, os, sys, urllib.request, urllib.error

URL = os.environ['VITE_SUPABASE_URL'].strip()
SRK = os.environ['SUPABASE_SERVICE_ROLE_KEY'].strip()
H = {'apikey': SRK, 'Authorization': f'Bearer {SRK}', 'Content-Type': 'application/json'}


def req(method, path, body=None, extra=None):
    r = urllib.request.Request(f"{URL}{path}", method=method,
                               data=json.dumps(body).encode() if body is not None else None)
    for k, v in {**H, **(extra or {})}.items():
        r.add_header(k, v)
    with urllib.request.urlopen(r) as resp:
        d = resp.read()
        return json.loads(d) if d else None


def main():
    src = sys.argv[1] if len(sys.argv) > 1 else 'colours.json'
    cols = json.load(open(src))
    # storage filename stem -> colour list
    by_key = {f.split('__')[-1].replace('.jpg', ''): c for f, c in cols.items()}

    prods = req('GET', '/rest/v1/products?select=id,name,image_url&limit=500')
    matched = []
    for p in prods:
        url = p['image_url'] or ''
        for key, c in by_key.items():
            if key in url:
                matched.append((p, c))
                break
    print(f"{len(matched)}/{len(prods)} products matched to an analysed photo")

    try:
        for p, c in matched:
            req('PATCH', f"/rest/v1/products?id=eq.{p['id']}",
                {'colours': c}, {'Prefer': 'return=minimal'})
    except urllib.error.HTTPError as e:
        print(f"FAILED ({e.code}): {e.read().decode()[:300]}")
        print("Has migration 20260904000000_product_colours.sql been applied?")
        sys.exit(1)

    done = req('GET', '/rest/v1/products?select=name,colours&limit=500')
    with_c = [p for p in done if p.get('colours')]
    print(f"colours set on {len(with_c)} products")
    for p in with_c[:10]:
        print(f"  {p['name']:24} {', '.join(p['colours'])}")


if __name__ == '__main__':
    main()
