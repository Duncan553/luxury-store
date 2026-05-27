// monthly-reminder — Supabase Edge Function
// Called by pg_cron on the 1st of each month at 05:00 UTC (08:00 Nairobi).
// Inserts a row into admin_reminders so the dashboard shows a backup prompt.
// The admin dismisses it by clicking ✕ — which marks it read=true in the DB.
//
// Deploy: supabase functions deploy monthly-reminder
// Invoke test: supabase functions invoke monthly-reminder
// pg_cron schedule (add to schema.sql after deploying):
//   select cron.schedule(
//     'monthly-backup-reminder', '0 5 1 * *',
//     $$ insert into admin_reminders (message) values (
//       'Time for monthly manual backup — download from Storage → backups bucket → save to Google Drive → test restore on a fresh Supabase project'
//     ); $$
//   );

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

Deno.serve(async (_req) => {
  const { error } = await supabase.from('admin_reminders').insert({
    message: 'Time for monthly manual backup — download from Storage → backups bucket → save to Google Drive → test restore on a fresh Supabase project',
  });

  if (error) {
    console.error('[monthly-reminder]', error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }

  console.log('[monthly-reminder] reminder inserted');
  return new Response(JSON.stringify({ ok: true }), {
    status: 200, headers: { 'Content-Type': 'application/json' },
  });
});
