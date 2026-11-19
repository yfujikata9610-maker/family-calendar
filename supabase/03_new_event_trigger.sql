-- 家族カレンダー：予定が追加されたら、追加した人以外に通知する
-- Edge Function「send-reminders」を新しいコードで再デプロイした後に、SQL Editor で実行してください。
-- 下の2か所を置き換えてから実行します（02_cron.sql と同じ値）:
--   YOUR_PROJECT_REF … Supabase プロジェクトのID
--   YOUR_CRON_SECRET … Edge Function のシークレット CRON_SECRET と同じ値

create extension if not exists pg_net;

create or replace function public.notify_new_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.created_by is not null then
    -- 非同期の送信なので、予定の保存は待たされない
    perform net.http_post(
      url := 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/send-reminders',
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', 'YOUR_CRON_SECRET'),
      body := jsonb_build_object('type', 'new_event', 'id', new.id)
    );
  end if;
  return new;
end;
$$;

-- アプリから直接呼べないようにする（トリガー専用）
revoke all on function public.notify_new_event() from public, anon, authenticated;

drop trigger if exists events_notify_new on public.events;
create trigger events_notify_new
  after insert on public.events
  for each row execute function public.notify_new_event();
