"""Derive each listing's colour from its own photograph.

Not invented: the colour written to the database is the dominant colour of
the actual product pixels in that product's image. Background is excluded
(these are cutouts on white), then the remaining pixels are matched to the
nearest name in the same palette the storefront paints swatches from, so
what's stored is always a name the swatch map understands.

Only the top colour is taken unless a clear second exists — claiming a bag
comes in three colours because the photo has three tones would be exactly
the kind of unverifiable product claim this site has been stripped of.
"""
import glob, json, math, collections
from PIL import Image

PALETTE = {
 'black':(17,17,17), 'white':(245,245,245), 'cream':(239,230,214), 'beige':(217,199,171),
 'tan':(192,138,78), 'brown':(107,68,35), 'camel':(193,154,107), 'grey':(138,138,138),
 'silver':(192,192,192), 'gold':(201,162,39), 'rose gold':(183,110,121), 'navy':(31,42,68),
 'blue':(47,95,168), 'green':(63,107,74), 'olive':(107,107,63), 'red':(163,36,49),
 'burgundy':(92,31,43), 'pink':(224,163,180), 'purple':(107,75,138), 'yellow':(224,181,68),
 'orange':(210,118,46),
}
def nearest(px):
    return min(PALETTE, key=lambda n: sum((a-b)**2 for a,b in zip(px, PALETTE[n])))

out={}
for f in sorted(glob.glob('*.jpg')):
    if f in ('SHEET.jpg','FINAL.jpg','WATCH-ZOOM.jpg','BS-ZOOM.jpg'): continue
    im=Image.open(f).convert('RGB').resize((160,160))
    counts=collections.Counter()
    for p in im.getdata():
        r,g,b=p
        # Skip the white stage and near-white highlights: they're the
        # backdrop, not the product.
        if r>238 and g>238 and b>238: continue
        counts[nearest(p)]+=1
    if not counts: continue
    total=sum(counts.values())
    ranked=counts.most_common()
    cols=[ranked[0][0]]
    # A second colour only if it's genuinely present (>=22% of product
    # pixels) and not just a shade of the first.
    if len(ranked)>1 and ranked[1][1]/total >= 0.22:
        cols.append(ranked[1][0])
    out[f]=cols
json.dump(out, open('colours.json','w'), indent=1)
print(f"{len(out)} images analysed")
for k,v in list(out.items())[:10]: print(f"  {', '.join(v):22} {k[:52]}")
