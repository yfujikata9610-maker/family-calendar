// 家族カレンダー：リマインド通知の送信（Supabase Edge Function）
// 1分ごとに pg_cron から呼ばれ、時刻が来た予定の通知を iPhone に送る。
//
// 必要なシークレット（Edge Functions → Secrets で設定）:
//   CRON_SECRET        … 呼び出し元の確認用の合言葉
//   VAPID_PUBLIC_KEY   … 通知の公開鍵（config.js と同じ値）
//   VAPID_PRIVATE_KEY  … 通知の秘密鍵（絶対に公開しない）
//   VAPID_SUBJECT      … アプリのURL（例: https://xxxx.github.io/futari-calendar/）
// SUPABASE_URL と SUPABASE_SERVICE_ROLE_KEY は自動で使えます。
// ※ この関数は「Verify JWT」をオフにしてデプロイし、代わりに CRON_SECRET で保護します。

import { createClient } from "npm:@supabase/supabase-js@2.45.4";
import webpush from "npm:web-push@3.6.7";

const STALE_MS = 60 * 60 * 1000; // 1時間以上前に過ぎたリマインドは送らない

Deno.serve(async (req) => {
  if (req.headers.get("x-cron-secret") !== Deno.env.get("CRON_SECRET")) {
    return new Response("forbidden", { status: 403 });
  }

  webpush.setVapidDetails(
    Deno.env.get("VAPID_SUBJECT")!,
    Deno.env.get("VAPID_PUBLIC_KEY")!,
    Deno.env.get("VAPID_PRIVATE_KEY")!,
  );
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const now = new Date();

  // 送る予定を「送信済み」にしながら取得（二重送信を防ぐ）
  const { data: due, error } = await sb
    .from("events")
    .update({ reminded: true })
    .eq("reminded", false)
    .lte("remind_at", now.toISOString())
    .select("id,title,date,all_day,start_time,who,remind_at");
  if (error) return json({ error: error.message }, 500);

  const fresh = (due ?? []).filter((e) => now.getTime() - new Date(e.remind_at).getTime() < STALE_MS);
  if (!fresh.length) return json({ sent: 0 });

  const [{ data: profiles }, { data: subs }] = await Promise.all([
    sb.from("profiles").select("id,color"),
    sb.from("push_subscriptions").select("*"),
  ]);

  let sent = 0;
  const gone: string[] = [];
  for (const e of fresh) {
    // 自分の予定は本人に、共通の予定は2人ともに通知
    const targets = (profiles ?? [])
      .filter((p) => e.who === "shared" || p.color === e.who)
      .map((p) => p.id);
    const [, m, d] = String(e.date).split("-").map(Number);
    const when = e.all_day ? "終日" : String(e.start_time).slice(0, 5) + "〜";
    const payload = JSON.stringify({
      title: "🔔 " + e.title,
      body: `${m}月${d}日 ${when}`,
      tag: "ev-" + e.id,
      url: "./",
    });
    for (const s of (subs ?? []).filter((s) => targets.includes(s.user_id))) {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload);
        sent++;
      } catch (err) {
        const code = (err as { statusCode?: number }).statusCode;
        if (code === 404 || code === 410) gone.push(s.id); // 無効になった端末
        else console.error("push failed", code, err);
      }
    }
  }
  if (gone.length) await sb.from("push_subscriptions").delete().in("id", gone);
  return json({ sent, events: fresh.length, removed: gone.length });
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}
