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

// Compress then upload to Supabase Storage bucket "images".
// onProgress(0-100) and onInfo(string) are optional callbacks for UI feedback.
// Returns the public CDN URL string. Throws on upload failure.
//
// isCutout: true when `file` is a background-removed transparent PNG.
// Two things change: compression must NOT re-encode to JPEG (JPEG has no
// alpha channel — a cutout saved as JPEG comes back with a solid black
// background, silently destroying the whole point of removing it), and the
// storage path goes under 'products-cutout/' rather than the plain folder
// — ProductCard reads that path to apply the white-stage + drop-shadow
// treatment, so this is what turns a processed photo into the "3D" look
// automatically, with no separate admin step.
export async function uploadImage(file, folder = 'products', { onProgress, onInfo, isCutout = false } = {}) {
  const originalMB = (file.size / 1024 / 1024).toFixed(1);

  let compressed = file;
  try {
    compressed = await imageCompression(file, {
      maxSizeMB:        1,
      maxWidthOrHeight: 1600,
      useWebWorker:     true,
      // 0-60% of progress bar = compression phase
      onProgress:       pct => onProgress?.(Math.round(pct * 0.6)),
      fileType:         isCutout ? 'image/png' : 'image/jpeg',
    });
    const compMB = (compressed.size / 1024 / 1024).toFixed(1);
    onInfo?.(`${originalMB} MB → ${compMB} MB ✓`);
  } catch {
    // Compression failed — fall through and try uploading original
  }

  onProgress?.(65);
  const ext  = isCutout ? 'png' : 'jpg';
  const dir  = isCutout ? `${folder}-cutout` : folder;
  const path = `${dir}/${Date.now()}.${ext}`;

  const { error } = await supabase.storage
    .from('images')
    .upload(path, compressed, { upsert: false, contentType: isCutout ? 'image/png' : 'image/jpeg' });

  onProgress?.(95);
  if (error) throw new Error(friendlyStorageError(error.message));

  const { data } = supabase.storage.from('images').getPublicUrl(path);
  onProgress?.(100);
  return data.publicUrl;
}
