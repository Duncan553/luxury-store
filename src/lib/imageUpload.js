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

// Compress then upload to Supabase Storage bucket "images".
// onProgress(0-100) and onInfo(string) are optional callbacks for UI feedback.
// Returns the public CDN URL string. Throws on upload failure.
export async function uploadImage(file, folder = 'products', { onProgress, onInfo } = {}) {
  const originalMB = (file.size / 1024 / 1024).toFixed(1);

  let compressed = file;
  try {
    compressed = await imageCompression(file, {
      maxSizeMB:        1,
      maxWidthOrHeight: 1600,
      useWebWorker:     true,
      // 0-60% of progress bar = compression phase
      onProgress:       pct => onProgress?.(Math.round(pct * 0.6)),
      fileType:         'image/jpeg',
    });
    const compMB = (compressed.size / 1024 / 1024).toFixed(1);
    onInfo?.(`${originalMB} MB → ${compMB} MB ✓`);
  } catch {
    // Compression failed — fall through and try uploading original
  }

  onProgress?.(65);
  const path = `${folder}/${Date.now()}.jpg`;

  const { error } = await supabase.storage
    .from('images')
    .upload(path, compressed, { upsert: false, contentType: 'image/jpeg' });

  onProgress?.(95);
  if (error) throw new Error(friendlyStorageError(error.message));

  const { data } = supabase.storage.from('images').getPublicUrl(path);
  onProgress?.(100);
  return data.publicUrl;
}
