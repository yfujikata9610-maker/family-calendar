-- ふたりカレンダー：1分ごとにリマインドを確認する定期実行
-- Edge Function「send-reminders」をデプロイした後に、SQL Editor で実行してください。
-- 下の2か所を置き換えてから実行します:
--   YOUR_PROJECT_REF … Supabase プロジェクトのID（URLの https://○○○.supabase.co の ○○○）
--   YOUR_CRON_SECRET … Edge Function のシークレットに設定した CRON_SECRET と同じ値

create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule(
  'send-reminders',
  '* * * * *',
  $$
  select net.http_post(
    url := 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/send-reminders',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', 'YOUR_CRON_SECRET'),
    body := '{}'::jsonb
  )
  -- 送る予定があるときだけ関数を呼ぶ（無料枠の節約）
  where exists (
    select 1 from public.events where reminded = false and remind_at <= now()
  );
  $$
);
