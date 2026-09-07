// Shared image upload logic — used by ProductsTab and CategoriesTab.
// Extracted here so both tabs use identical validation, compression
// settings, and storage paths without duplicating code.
import imageCompression from 'browser-image-compression';
import { supabase } from './supabase';

const ACCEPTED_TYPES = [
  'image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/heic', 'image/heif',
];
const MAX_MB = 10;

// Does this storage error mean "your login is no longer valid" rather than
// "your database is misconfigured"? Storage answers an expired or rejected
// token with 401/Unauthorized/JWT wording, which is NOT a policy problem —
// telling an admin to go run SQL when their session simply lapsed sends
// them to fix a database that was never broken.
function isAuthError(msg = '') {
  return /jwt|401|unauthorized|invalid claim|missing sub|token/i.test(msg);
}

function friendlyStorageError(msg = '') {
  if (msg.includes('Bucket not found') || msg.includes('bucket'))
    return 'Storage bucket "images" not found. Go to Supabase → Storage → New bucket → name it "images" → toggle Public → Create.';
  // Checked BEFORE the policy branch below, which matches on 'Unauthorized'
  // and '403' and would otherwise swallow every expired-session upload.
  if (isAuthError(msg))
    return 'Your session expired. Sign out, sign back in, and upload again — nothing is wrong with the photo.';
  if (msg.includes('row-level security') || msg.includes('security') || msg.includes('policy') || msg.includes('403') || msg.includes('Unauthorized'))
    return 'Upload blocked by storage policy. Run the storage SQL in Supabase (see schema.sql).';
  if (msg.includes('exceeded') || msg.includes('size'))
    return 'File too large even after compression. Try a smaller image.';
  if (msg.includes('network') || msg.includes('fetch') || msg.includes('Failed to fetch'))
    return 'Network error — check your internet connection and try again.';
  return `Upload failed: ${msg || 'Unknown error'}`;
}

// Validate a file input change and call result callbacks.
// Never throws — all errors go through onError callback.
export function handleImgSelect(e, { onFile, onPreview, onInfo, onError }) {
  const file = e.target.files[0];
  if (!file) return;
  if (!ACCEPTED_TYPES.includes(file.type.toLowerCase())) {
    onError?.(`"${file.name}" is not supported. Use JPG, PNG or WebP.`);
    return;
  }
  const sizeMB = file.size / 1024 / 1024;
  if (sizeMB > MAX_MB) {
    onError?.(`File is ${sizeMB.toFixed(1)} MB — max is ${MAX_MB} MB.`);
    return;
  }
  onError?.('');
  onFile?.(file);
  onPreview?.(URL.createObjectURL(file));
  onInfo?.(`${sizeMB.toFixed(1)} MB`);
}

// ── Background inspection ─────────────────────────────────────────────────
// Answers one question BEFORE any heavy work happens: is this photo already
// on a clean backdrop? Two cases count — a transparent PNG (already a
// cutout) and a photo shot on white (a studio/flat-lay shot, which the
// white-stage card renders identically to a cutout). In either case there
// is nothing to remove, so running the ~40-80MB WASM model would cost the
// admin a long wait and risk the model chewing a white part of the product,
// for a result that looks the same.
//
// How: draw the image small, then look ONLY at the outer 5% frame — the
// band a background occupies and a centred product almost never does.
// Returns 'transparent' | 'white' | 'photo'. Never throws: anything it
// cannot read (HEIC, a canvas that refuses) comes back as 'photo', which is
// exactly the behaviour that existed before this function.
export async function detectBackground(file) {
  try {
    const bmp = await createImageBitmap(file);
    const W = 120;                                    // sample width, not display width
    const H = Math.max(1, Math.round((W * bmp.height) / bmp.width));
    const canvas = document.createElement('canvas');
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(bmp, 0, 0, W, H);                   // downscale once
    bmp.close?.();                                    // free the decoded bitmap
    const { data } = ctx.getImageData(0, 0, W, H);    // flat RGBA, 4 bytes per pixel

    const band = Math.max(2, Math.round(W * 0.05));   // frame thickness, in sample px
    let edge = 0, clear = 0, white = 0;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        // Skip the middle — that is where the product is; only judge the frame.
        if (x >= band && y >= band && x < W - band && y < H - band) continue;
        const i = (y * W + x) * 4;                    // index of this pixel's red byte
        edge++;
        if (data[i + 3] < 16) clear++;                                            // see-through
        else if (data[i] > 235 && data[i + 1] > 235 && data[i + 2] > 235) white++; // near-white
      }
    }
    if (!edge) return 'photo';
    // 0.9 rather than 1.0: JPEG noise, a soft shadow, or a product that runs
    // off the edge should not flip a genuinely white backdrop back to 'photo'.
    if (clear / edge > 0.9) return 'transparent';
    if ((white + clear) / edge > 0.9) return 'white';
    return 'photo';
  } catch {
    return 'photo';
  }
}

// ── Speck removal ──────────────────────────────────────
// Keeps only the largest connected shape in a cutout and erases the rest.
//
// The background model does not return one clean object: it returns whatever
// it judged to be foreground, which routinely includes a leaf, a price tag,
// a bit of shelf — left floating in space once the backdrop is gone. On a
// dark card those go unnoticed; on the white stage they read as smudges
// beside the product, which is worse than not cutting the photo at all.
//
// A product photo has one subject, so the largest connected region IS the
// product and anything disconnected from it is debris. Measured on a
// downscaled alpha mask (a flood fill across 12 megapixels in JS is the
// same mistake the first trim made), then the mask is scaled back up and
// used to erase at full resolution.
//
// Returns the file untouched on any doubt — including when the leftovers
// are a large share of the subject, which is the signature of a photo with
// two genuine objects rather than one and some rubbish.
export async function removeSpecks(file) {
  try {
    const bmp = await createImageBitmap(file);
    const W = Math.min(320, bmp.width);
    const H = Math.max(1, Math.round((W * bmp.height) / bmp.width));
    const small = document.createElement('canvas');
    small.width = W; small.height = H;
    const sctx = small.getContext('2d', { willReadFrequently: true });
    sctx.drawImage(bmp, 0, 0, W, H);
    const { data } = sctx.getImageData(0, 0, W, H);

    // Label connected opaque regions (4-neighbour flood fill).
    const label = new Int32Array(W * H).fill(-1);
    const sizes = [];
    const stack = [];
    const solid = (idx) => data[idx * 4 + 3] >= 40;
    for (let i = 0; i < W * H; i++) {
      if (label[i] !== -1 || !solid(i)) continue;
      const id = sizes.length; let n = 0;
      stack.push(i); label[i] = id;
      while (stack.length) {
        const c = stack.pop(); n++;
        const x = c % W, y = (c / W) | 0;
        if (x > 0     && label[c - 1] === -1 && solid(c - 1)) { label[c - 1] = id; stack.push(c - 1); }
        if (x < W - 1 && label[c + 1] === -1 && solid(c + 1)) { label[c + 1] = id; stack.push(c + 1); }
        if (y > 0     && label[c - W] === -1 && solid(c - W)) { label[c - W] = id; stack.push(c - W); }
        if (y < H - 1 && label[c + W] === -1 && solid(c + W)) { label[c + W] = id; stack.push(c + W); }
      }
      sizes.push(n);
    }
    if (sizes.length < 2) { bmp.close?.(); return file; }        // nothing to clean

    const main = sizes.indexOf(Math.max(...sizes));
    const debris = sizes.reduce((t, n, i) => (i === main ? t : t + n), 0);
    // Big leftovers mean this is probably a photo with more than one real
    // object — leave it alone rather than delete half the product.
    if (!debris || debris / sizes[main] > 0.35) { bmp.close?.(); return file; }

    const out = document.createElement('canvas');
    out.width = bmp.width; out.height = bmp.height;
    const octx = out.getContext('2d');
    octx.drawImage(bmp, 0, 0);
    bmp.close?.();
    const sx = out.width / W, sy = out.height / H;
    octx.globalCompositeOperation = 'destination-out';          // punch holes in alpha
    octx.fillStyle = '#000';
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const l = label[y * W + x];
        // +1px of slop each way, so the erase covers the speck's soft edge.
        if (l !== -1 && l !== main) octx.fillRect(x * sx - 1, y * sy - 1, sx + 2, sy + 2);
      }
    }
    const blob = await new Promise(r => out.toBlob(r, 'image/png'));
    return blob ? new File([blob], file.name, { type: 'image/png' }) : file;
  } catch {
    return file;
  }
}


// ── Trim ─────────────────────────────────────────────────────────────────
// Finds the dead border on a photo that sits on a clean backdrop, and
// returns it as a crop box — { x, y, w, h } in the file's own pixels, or
// null when there is nothing worth cutting.
//
// Why this exists: two products photographed at the same 1000x1000 still
// render at different sizes on the shop if one has a 30% white margin baked
// into the file. No CSS fixes that — the margin IS pixels. Cutting it off is
// what makes a grid of products actually look uniform.
//
// It returns a BOX rather than a cropped file on purpose. The first version
// decoded all 12 megapixels of a phone photo and scanned every one in JS:
// 1.8 seconds, three times the cost of the encode, then re-encoded a
// throwaway JPEG that the real encode immediately threw away again. The box
// is measured on a 400px-wide copy instead (~60x fewer pixels) and handed to
// uploadImage, which applies it inside the resize it was already doing — so
// the crop now costs one draw call instead of a whole decode/encode round.
// Precision lost by measuring small is absorbed by the 4% margin below.
//
// Only meaningful for 'white' / 'transparent' photos, where the border is
// genuinely empty. Returns null on any doubt — a wrong crop eats the product.
export async function findTrimBox(file, kind) {
  if (kind !== 'white' && kind !== 'transparent') return null;
  try {
    const bmp = await createImageBitmap(file);
    const FW = Math.min(400, bmp.width);                 // scan width
    const FH = Math.max(1, Math.round((FW * bmp.height) / bmp.width));
    const canvas = document.createElement('canvas');
    canvas.width = FW; canvas.height = FH;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(bmp, 0, 0, FW, FH);
    const { width: OW, height: OH } = bmp;
    bmp.close?.();
    const { data } = ctx.getImageData(0, 0, FW, FH);

    const isBg = (i) =>
      data[i + 3] < 16 ||                                                    // see-through
      (kind === 'white' && data[i] > 235 && data[i + 1] > 235 && data[i + 2] > 235);

    // A line counts as empty at 99.5%, not 100%: one speck of JPEG noise or a
    // dust mark in the margin would otherwise stop the trim dead.
    const lineIsBg = (fixed, len, index) => {
      let solid = 0;
      const allow = Math.max(1, Math.floor(len * 0.005));
      for (let k = 0; k < len; k++) {
        if (!isBg(index(fixed, k) * 4) && ++solid > allow) return false;
      }
      return true;
    };
    const rowAt = (y, x) => y * FW + x;
    const colAt = (x, y) => y * FW + x;

    let top = 0, bottom = FH - 1, left = 0, right = FW - 1;
    while (top    < bottom && lineIsBg(top,    FW, rowAt)) top++;
    while (bottom > top    && lineIsBg(bottom, FW, rowAt)) bottom--;
    while (left   < right  && lineIsBg(left,   FH, colAt)) left++;
    while (right  > left   && lineIsBg(right,  FH, colAt)) right--;

    let w = right - left + 1, h = bottom - top + 1;
    if (w < 8 || h < 8) return null;                     // suspiciously small — bail
    if ((w * h) / (FW * FH) > 0.92) return null;         // barely a margin; not worth it

    // Give the product a little air back so it isn't jammed against the edge.
    const pad = Math.max(w, h) * 0.04;
    left = Math.max(0, left - pad); top = Math.max(0, top - pad);
    w = Math.min(FW - left, w + pad * 2); h = Math.min(FH - top, h + pad * 2);

    const sx = OW / FW, sy = OH / FH;                    // scan px -> file px
    return {
      x: Math.round(left * sx), y: Math.round(top * sy),
      w: Math.round(w * sx),    h: Math.round(h * sy),
    };
  } catch {
    return null;
  }
}

// ── Background removal ────────────────────────────────────────────────────
// Runs entirely in the admin's browser (nothing is sent to a third-party
// service) — a WASM model (~40-80MB) downloads on first use and is cached
// by the browser after that. Dynamically imported so the ~2MB JS library
// itself never loads for a customer, or even for the admin until this
// function actually runs.
//
// Returns a new File: a transparent PNG. Never throws for a "no background
// found" case — imgly still returns *something* — but network/model-load
// failures do throw, so callers should let the customer/admin fall back to
// the original photo rather than block the whole upload on this.
export async function removeBackground(file, onProgress) {
  const mod = await import('@imgly/background-removal');
  // Export shape varies by how the bundler interops this package's build —
  // fall back through every shape actually seen rather than assuming one.
  const imglyRemoveBackground = mod.default ?? mod.removeBackground ?? mod;
  if (typeof imglyRemoveBackground !== 'function') {
    throw new Error('Could not load the background-removal library (unexpected module shape).');
  }
  const blob = await imglyRemoveBackground(file, {
    model: 'medium',
    output: { format: 'image/png', quality: 1 },
    progress: (key, current, total) => {
      // imgly reports progress per internal step (model fetch, then
      // inference) rather than one 0-100 stream — collapse it to a single
      // percent so the UI has one number to show.
      if (total > 0) onProgress?.(Math.round((current / total) * 100));
    },
  });
  const name = file.name.replace(/\.\w+$/, '') + '-cutout.png';
  return new File([blob], name, { type: 'image/png' });
}


// Everything that happens to ONE product photo, in one place: read its
// backdrop, cut the background only if a human asked, trim the dead margin,
// and store it where the card will stage it correctly. Both screens that
// upload photos (Add Product, and the Photos manager) call this — the rules
// are subtle enough that two copies would drift, and a photo would then be
// staged one way when added and another way when appended later.
//
// removeBg is the admin's checkbox, never inferred.
export async function uploadProductPhoto(file, { removeBg = false, onStatus } = {}) {
  const kind = await detectBackground(file);

  if (removeBg) {
    try {
      onStatus?.('Removing background… 0%');
      const cutout = await removeBackground(file, pct => onStatus?.(`Removing background… ${pct}%`));
      onStatus?.('Background removed ✓ tidying…');
      // The model leaves stray background objects floating beside the
      // product once the backdrop is gone; drop anything not connected to it.
      const cleaned = await removeSpecks(cutout);
      onStatus?.('Background removed ✓ uploading…');
      // Trim the cutout too. Removing a background leaves a transparent
      // margin wherever the product did not reach the edge of the original
      // frame, so two photos of the same bag come out different sizes on the
      // white stage — the exact raggedness the trim exists to prevent. The
      // box is measured on the cutout, where 'transparent' is the backdrop.
      const cutCrop = await findTrimBox(cleaned, 'transparent');
      return await uploadImage(cleaned, 'products', {
        isCutout: true, hasAlpha: true, crop: cutCrop,
      });
    } catch (err) {
      // A failed cut must never cost the admin the upload: a plain photo
      // beats no product at all. Fall through to the untouched path.
      console.warn('[background removal]', err.message);
      onStatus?.('Background removal failed — uploading the original photo.');
    }
  }

  // A photo already on a clean backdrop still goes to the cutout folder,
  // because that folder is what makes the card show it on the white stage
  // uncropped — the same look without paying for the model. Only a truly
  // transparent file needs its alpha channel kept in the encode.
  const clean = kind === 'white' || kind === 'transparent';
  const crop  = await findTrimBox(file, kind);
  return uploadImage(file, 'products', {
    isCutout: clean, hasAlpha: kind === 'transparent', crop,
  });
}

// ── Encoding ─────────────────────────────────────────────────────────
// Everything the site serves is WebP. That was a one-off conversion done
// over the existing files, which left a hole: the admin uploader still
// wrote JPEG and PNG, so the very next photo the owner added would land
// roughly twice the size of everything around it and quietly undo the
// saving, one upload at a time. It encodes WebP now, so a new image is
// optimised the same way without anyone remembering to do anything.
//
// WebP is checked rather than assumed. It has been supported everywhere
// since Safari 14 (2020), but this shop's traffic arrives through phone
// browsers and the Instagram in-app webview, and an unreadable product
// photo is a far worse outcome than a larger one — so an old browser
// falls back to the format that always worked.
let webpOK = null;
function canWebp() {
  if (webpOK !== null) return webpOK;
  try {
    const c = document.createElement('canvas');
    c.width = c.height = 1;
    webpOK = c.toDataURL('image/webp').startsWith('data:image/webp');
  } catch {
    webpOK = false;
  }
  return webpOK;
}

// The format to encode to. A transparent image MUST keep its alpha channel
// — WebP has one, JPEG does not, so it falls back to PNG on a browser
// without WebP rather than to a black-backgrounded JPEG. This asks about
// ALPHA, not about the cutout folder: a photo already shot on white gets
// the cutout treatment without carrying any transparency, and should not
// be forced into a heavy PNG for nothing.
function targetFormat(hasAlpha) {
  if (canWebp()) return { mime: 'image/webp', ext: 'webp' };
  return hasAlpha ? { mime: 'image/png', ext: 'png' } : { mime: 'image/jpeg', ext: 'jpg' };
}

// Re-encode at a given max edge. Returns null rather than throwing, so a
// caller can decide that a missing variant is survivable.
async function encode(file, maxEdge, mime) {
  try {
    return await imageCompression(file, {
      maxSizeMB: 1,
      maxWidthOrHeight: maxEdge,
      useWebWorker: true,
      fileType: mime,
      initialQuality: 0.82,
    });
  } catch {
    return null;
  }
}

// One pass: crop, resize and encode together. Used when findTrimBox found a
// margin — the crop rides along with the resize the upload had to do anyway,
// so trimming costs one extra draw call rather than its own decode+encode.
// createImageBitmap does the cropping during decode, so the dead margin is
// never even fully decoded. Returns null on failure; the caller falls back
// to the plain (untrimmed) encode, which is a worse picture, not a broken one.
async function encodeCropped(file, maxEdge, mime, crop) {
  try {
    const bmp = await createImageBitmap(file, crop.x, crop.y, crop.w, crop.h);
    const scale = Math.min(1, maxEdge / Math.max(crop.w, crop.h));   // never upscale
    const w = Math.max(1, Math.round(crop.w * scale));
    const h = Math.max(1, Math.round(crop.h * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    canvas.getContext('2d').drawImage(bmp, 0, 0, w, h);
    bmp.close?.();
    const blob = await new Promise(r => canvas.toBlob(r, mime, 0.82));
    return blob ? new File([blob], file.name, { type: mime }) : null;
  } catch {
    return null;
  }
}

// One upload attempt. Split out so put() can run it twice.
async function putOnce(path, blob, mime) {
  return supabase.storage
    .from('images')
    .upload(path, blob, { upsert: false, contentType: mime });
}

async function put(path, blob, mime) {
  let { error } = await putOnce(path, blob, mime);

  // An admin who sat on the dashboard filling in a product can reach this
  // line with a dead access token: the form is still on screen, the app
  // still thinks it is signed in, and only the write fails. That is why
  // uploading used to start working again after a logout + reload — the
  // reload is what fetched a fresh token.
  //
  // So do the reload's job here instead: force one refresh and retry. If
  // the refresh works the admin never notices; if it doesn't, the message
  // below tells them to sign in again rather than blaming storage policy.
  if (error && isAuthError(error.message)) {
    const { error: refreshErr } = await supabase.auth.refreshSession();
    if (!refreshErr) ({ error } = await putOnce(path, blob, mime));
  }

  if (error) throw new Error(friendlyStorageError(error.message));
  return supabase.storage.from('images').getPublicUrl(path).data.publicUrl;
}

// Compress then upload to Supabase Storage bucket "images".
// onProgress(0-100) and onInfo(string) are optional callbacks for UI feedback.
// Returns the public CDN URL string. Throws on upload failure.
//
// isCutout: store under 'products-cutout/' rather than the plain folder.
// ProductCard reads that path to render the photo on the white stage,
// uncropped — so this flag, not a DB column, is what gives a photo the
// treatment. It is set for a background-removed PNG AND for a photo that
// already arrived on a white backdrop, since both look right there.
// hasAlpha: whether the file genuinely carries transparency, which is a
// separate question — it decides the encoding only (see targetFormat).
// It defaults to isCutout, so old callers behave exactly as before.
export async function uploadImage(
  file,
  folder = 'products',
  { onProgress, onInfo, isCutout = false, hasAlpha = isCutout, crop = null } = {},
) {
  const originalMB = (file.size / 1024 / 1024).toFixed(1);
  const { mime, ext } = targetFormat(hasAlpha);

  // 0-60% of the progress bar is the encode; upload is the rest.
  onProgress?.(10);
  // crop is a box from findTrimBox — the empty margin around the product.
  // Falls back to the plain encode if the one-pass version fails, so a bad
  // crop box can never cost the admin the upload.
  const compressed = (crop && await encodeCropped(file, 1600, mime, crop))
    || await encode(file, 1600, mime);
  onProgress?.(60);

  // If the encode failed, upload the ORIGINAL under its OWN type and
  // extension. Falling back to the original while still labelling it
  // image/webp would store a JPEG that storage and the CDN are told is a
  // WebP — browsers sniff the bytes and render it anyway, so nothing
  // looks broken, and the file stays misnamed forever.
  const body    = compressed || file;
  const outMime = compressed ? mime : (file.type || 'image/jpeg');
  const outExt  = compressed ? ext  : (outMime.split('/')[1] || 'jpg').replace('jpeg', 'jpg');
  if (compressed) {
    onInfo?.(`${originalMB} MB → ${(compressed.size / 1024 / 1024).toFixed(1)} MB ✓`);
  }

  onProgress?.(65);
  const dir = isCutout ? `${folder}-cutout` : folder;
  const url = await put(`${dir}/${Date.now()}.${outExt}`, body, outMime);
  onProgress?.(100);
  return url;
}

// ── Category covers: match the set ───────────────────────────────────────
// The four covers already on the shop are 760x1013 — exactly 3:4 — and pure
// black and white (measured: colourfulness 0.000). A cover uploaded through
// admin got none of that: it kept its own colours and its own shape, and the
// deck's object-fit: cover then CROPPED it to the card. So one new category
// arrived in colour, cut off at the edges, and sized unlike its neighbours —
// the whole row stopped reading as a set.
//
// This normalises an upload to the set instead of hoping the owner supplies
// a matching file:
//   * greyscale, because the deck is editorial framing. The site's own rule
//     (Home.css) is that the editorial frame is mono and the MERCHANDISE is
//     not — a buyer choosing between a tan bag and a black one has to see
//     the difference. Category art is frame, so it is mono; product photos
//     stay in colour and this never touches them.
//   * fitted into a 3:4 frame rather than cropped to it, so nothing is cut
//     off, and every cover is the same shape and therefore the same size on
//     the card.
//   * whatever the 3:4 frame does not cover is filled with a blurred, dimmed
//     copy of the same picture. Plain empty bands were the first attempt and
//     a wide photo left 66% of the card empty — technically uncropped, and
//     it looked broken. The blur reads as depth of field, so the card is
//     full-bleed like its neighbours while the actual photo is still whole.
function normaliseCover(bitmap) {
  const TARGET = 3 / 4;
  const w = 1200, h = Math.round(w / TARGET);       // 1200x1600, same shape as the set
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');

  // 1. Backdrop: the same picture scaled to COVER the frame, blurred and
  //    dimmed. It is allowed to crop, because nobody reads it as the photo.
  const fill = Math.max(w / bitmap.width, h / bitmap.height);
  const fw = bitmap.width * fill, fh = bitmap.height * fill;
  ctx.filter = 'grayscale(1) blur(30px) brightness(0.5)';
  ctx.drawImage(bitmap, (w - fw) / 2, (h - fh) / 2, fw, fh);

  // 2. The picture itself: contained, centred, nothing cut off.
  const scale = Math.min(w / bitmap.width, h / bitmap.height);
  const dw = Math.round(bitmap.width * scale), dh = Math.round(bitmap.height * scale);
  ctx.filter = 'grayscale(1) contrast(1.06)';       // same treatment as .editorial__img
  ctx.drawImage(bitmap, Math.round((w - dw) / 2), Math.round((h - dh) / 2), dw, dh);
  return canvas;
}

// Category covers, which need more than the plain upload above.
//
// The category deck derives a srcset from the cover's filename: a cover
// stored as <something>-cover.webp is assumed to have -380.webp and
// -760.webp beside it, so a phone downloads a 380px-wide file instead of
// the full-size one. Covers uploaded through admin never had those
// variants, so every new category would have silently served phones the
// large file — the saving would apply to the four covers converted by
// hand and to nothing added afterwards.
//
// The ordering here is deliberate: the variants go up FIRST, and the
// '-cover' name is only used if both landed. If a variant fails, the file
// is stored under a plain name instead, so no srcset is ever derived and
// the deck falls back to the single full-size image. A slightly heavy
// cover is a bad day; a cover whose srcset 404s on every phone is a
// broken shop.
export async function uploadCover(file, slug, { onProgress, onInfo } = {}) {
  const originalMB = (file.size / 1024 / 1024).toFixed(1);
  // The normalised cover is fully opaque (the blurred backdrop fills the
  // frame), so no alpha channel is needed and the JPEG fallback is safe.
  const { mime, ext } = targetFormat(false);

  // Normalise first; everything below then resizes an image that is already
  // the right shape and tone. Falls back to the original file if the canvas
  // step fails, which is a cover that looks out of place rather than no
  // cover at all.
  let source = file;
  try {
    const bmp = await createImageBitmap(file);
    const canvas = normaliseCover(bmp);
    bmp.close?.();
    const blob = await new Promise(r => canvas.toBlob(r, mime, 0.9));
    if (blob) source = new File([blob], file.name, { type: mime });
  } catch (err) {
    console.warn('[cover normalise]', err.message);
  }
  file = source;
  // A folder per upload, so replacing a cover never has to overwrite a
  // file — an overwrite keeps the same URL, and the CDN would go on
  // serving the old picture from cache.
  const dir = `categories/${Date.now()}`;
  const safe = (slug || 'cover').replace(/[^a-z0-9-]/gi, '') || 'cover';

  onProgress?.(10);
  const full = await encode(file, 1600, mime);
  onProgress?.(35);
  const [w380, w760] = await Promise.all([encode(file, 380, mime), encode(file, 760, mime)]);
  onProgress?.(55);

  if (!full || !w380 || !w760) {
    // No variants — store under a name the deck won't build a srcset from,
    // so it falls back to this one file instead of requesting two that were
    // never written. Same original-file fallback as uploadImage above.
    const body = full || file;
    const m = full ? mime : (file.type || 'image/jpeg');
    const e = full ? ext  : (m.split('/')[1] || 'jpg').replace('jpeg', 'jpg');
    const url = await put(`${dir}/${safe}.${e}`, body, m);
    onProgress?.(100);
    onInfo?.(`${originalMB} MB → ${(body.size / 1024 / 1024).toFixed(1)} MB ✓`);
    return url;
  }

  await put(`${dir}/${safe}-cover-380.${ext}`, w380, mime);
  onProgress?.(72);
  await put(`${dir}/${safe}-cover-760.${ext}`, w760, mime);
  onProgress?.(86);
  const url = await put(`${dir}/${safe}-cover.${ext}`, full, mime);

  onProgress?.(100);
  const kb = (b) => Math.round(b.size / 1024);
  onInfo?.(`${originalMB} MB → ${kb(full)} KB, with ${kb(w380)} KB and ${kb(w760)} KB for phones ✓`);
  return url;
}
