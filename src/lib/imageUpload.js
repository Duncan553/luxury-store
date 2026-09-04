// Shared image upload logic — used by ProductsTab and CategoriesTab.
// Extracted here so both tabs use identical validation, compression
// settings, and storage paths without duplicating code.
import imageCompression from 'browser-image-compression';
import { supabase } from './supabase';

export const ACCEPTED_TYPES = [
  'image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/heic', 'image/heif',
];
export const MAX_MB = 10;

export function friendlyStorageError(msg = '') {
  if (msg.includes('Bucket not found') || msg.includes('bucket'))
    return 'Storage bucket "images" not found. Go to Supabase → Storage → New bucket → name it "images" → toggle Public → Create.';
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

// The format to encode to. A cutout MUST keep its alpha channel — WebP
// has one, JPEG does not, so a cutout on a browser without WebP falls
// back to PNG rather than to a black-backgrounded JPEG.
function targetFormat(isCutout) {
  if (canWebp()) return { mime: 'image/webp', ext: 'webp' };
  return isCutout ? { mime: 'image/png', ext: 'png' } : { mime: 'image/jpeg', ext: 'jpg' };
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

async function put(path, blob, mime) {
  const { error } = await supabase.storage
    .from('images')
    .upload(path, blob, { upsert: false, contentType: mime });
  if (error) throw new Error(friendlyStorageError(error.message));
  return supabase.storage.from('images').getPublicUrl(path).data.publicUrl;
}

// Compress then upload to Supabase Storage bucket "images".
// onProgress(0-100) and onInfo(string) are optional callbacks for UI feedback.
// Returns the public CDN URL string. Throws on upload failure.
//
// isCutout: true when `file` is a background-removed transparent PNG.
// Two things change: the encode must keep an alpha channel (see
// targetFormat above), and the storage path goes under 'products-cutout/'
// rather than the plain folder — ProductCard reads that path to apply the
// white-stage + drop-shadow treatment, so this is what turns a processed
// photo into the "3D" look automatically, with no separate admin step.
export async function uploadImage(file, folder = 'products', { onProgress, onInfo, isCutout = false } = {}) {
  const originalMB = (file.size / 1024 / 1024).toFixed(1);
  const { mime, ext } = targetFormat(isCutout);

  // 0-60% of the progress bar is the encode; upload is the rest.
  onProgress?.(10);
  const compressed = await encode(file, 1600, mime);
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
  const { mime, ext } = targetFormat(false);
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
