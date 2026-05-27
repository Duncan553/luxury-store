// review-prompt-scheduler — Supabase Edge Function
// Called by pg_cron daily at 23:00 UTC (02:00 Nairobi).
//
// Finds payments where:
//   - status = 'success'
//   - dispatched_at is set and is >= 5 days ago
//   - review_prompt_sent = false  (prompt not yet sent)
//   - review_prompt_ready = false (not already flagged this cycle)
//
// Sets review_prompt_ready = true on matching rows.
// The AdminDashboard Action Center reads review_prompt_ready = true
// and surfaces "Send review request →" buttons for the admin.
//
// Deploy: supabase functions deploy review-prompt-scheduler
// Invoke test: supabase functions invoke review-prompt-scheduler

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, // service role bypasses RLS
);

Deno.serve(async (_req) => {
  const fiveDaysAgo = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString();

  const { error, count } = await supabase
    .from('payments')
    .update({ review_prompt_ready: true })
    .eq('status', 'success')
    .eq('review_prompt_sent', false)
    .eq('review_prompt_ready', false)
    .not('dispatched_at', 'is', null)
    .lt('dispatched_at', fiveDaysAgo)
    .select('id', { count: 'exact', head: true });

  if (error) {
    console.error('[review-prompt-scheduler]', error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  console.log(`[review-prompt-scheduler] flagged ${count ?? 0} payments`);
  return new Response(JSON.stringify({ flagged: count ?? 0 }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
});
