// weekly-backup — Supabase Edge Function
// Called by pg_cron every Sunday at 23:00 UTC (02:00 Nairobi Monday).
//
// Exports a JSON snapshot of: products, payments, reviews, categories,
// store_settings. Uploads to the private 'backups' bucket in Supabase Storage.
// Keeps the last 12 backups and deletes older ones.
//
// Prerequisites:
//   1. Create a private bucket named 'backups' in Supabase → Storage.
//   2. Add storage policies for this bucket (see schema.sql, Task 6 block).
//   3. Deploy: supabase functions deploy weekly-backup
//   4. Set up pg_cron schedule (see schema.sql, Task 6 block — uncomment and fill in values).
//
// Invoke test: supabase functions invoke weekly-backup

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, // service role bypasses RLS
);

const BUCKET        = 'backups';
const MAX_BACKUPS   = 12;

Deno.serve(async (_req) => {
  try {
    // ── 1. Collect all table data ─────────────────────────────────────
    const [products, payments, reviews, categories, settings] = await Promise.all([
      supabase.from('products').select('*').order('created_at'),
      supabase.from('payments').select('*').order('created_at', { ascending: false }).limit(5000),
      supabase.from('reviews').select('*').order('created_at'),
      supabase.from('categories').select('*').order('created_at'),
      supabase.from('store_settings').select('*'),
    ]);

    // Log any errors but continue — a partial backup is better than none.
    for (const [name, res] of Object.entries({ products, payments, reviews, categories, settings })) {
      if (res.error) console.warn(`[weekly-backup] ${name}:`, res.error.message);
    }

    const snapshot = {
      exported_at:   new Date().toISOString(),
      products:      products.data  ?? [],
      payments:      payments.data  ?? [],
      reviews:       reviews.data   ?? [],
      categories:    categories.data ?? [],
      store_settings: settings.data  ?? [],
    };

    // ── 2. Upload to Storage ─────────────────────────────────────────
    const date     = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    const filename = `${date}.json`;
    const body     = new TextEncoder().encode(JSON.stringify(snapshot, null, 2));

    const { error: uploadErr } = await supabase.storage
      .from(BUCKET)
      .upload(filename, body, {
        contentType: 'application/json',
        upsert:      true, // overwrite if same date is re-run
      });

    if (uploadErr) throw new Error(`Upload failed: ${uploadErr.message}`);

    // ── 3. Prune old backups (keep last MAX_BACKUPS) ──────────────────
    const { data: files, error: listErr } = await supabase.storage
      .from(BUCKET)
      .list('', { sortBy: { column: 'name', order: 'asc' } });

    if (!listErr && files && files.length > MAX_BACKUPS) {
      // Sorted ascending by name (YYYY-MM-DD) → oldest first
      const toDelete = files
        .slice(0, files.length - MAX_BACKUPS)
        .map(f => f.name);

      const { error: deleteErr } = await supabase.storage
        .from(BUCKET)
        .remove(toDelete);

      if (deleteErr) console.warn('[weekly-backup] prune failed:', deleteErr.message);
      else console.log(`[weekly-backup] pruned ${toDelete.length} old backups`);
    }

    const stats = {
      file:      filename,
      products:  snapshot.products.length,
      payments:  snapshot.payments.length,
      reviews:   snapshot.reviews.length,
      categories: snapshot.categories.length,
    };

    console.log('[weekly-backup] done', stats);
    return new Response(JSON.stringify(stats), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (err) {
    console.error('[weekly-backup] fatal:', err.message);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});
