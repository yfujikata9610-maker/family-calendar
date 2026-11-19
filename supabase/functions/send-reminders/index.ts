// 家族カレンダー：通知の送信（Supabase Edge Function）
// ・1分ごとに pg_cron から呼ばれ、時刻が来た予定のリマインドを iPhone に送る
// ・予定が追加されるとデータベースのトリガーから呼ばれ、追加した人以外に通知する（アイコンのバッジ付き）
//
// 必要なシークレット（Edge Functions → Secrets で設定）:
//   CRON_SECRET        … 呼び出し元の確認用の合言葉
//   VAPID_PUBLIC_KEY   … 通知の公開鍵（config.js と同じ値）
//   VAPID_PRIVATE_KEY  … 通知の秘密鍵（絶対に公開しない）
//   VAPID_SUBJECT      … 連絡先URL（https://yfujikata9610-maker.github.io/）
// SUPABASE_URL と SUPABASE_SERVICE_ROLE_KEY は自動で使えます。
// ※ この関数は「Verify JWT」をオフにしてデプロイし、代わりに CRON_SECRET で保護します。

import { createClient, SupabaseClient } from "npm:@supabase/supabase-js@2.45.4";
import webpush from "npm:web-push@3.6.7";

const STALE_MS = 60 * 60 * 1000; // 1時間以上前に過ぎたリマインドは送らない

type Ev = { id: string; title: string; date: string; all_day: boolean; start_time: string | null; who: string; remind_at?: string; created_by?: string | null };
type Sub = { id: string; user_id: string; endpoint: string; p256dh: string; auth: string };

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
  const body = await req.json().catch(() => ({}));

  if (body && body.type === "new_event" && body.id) return await notifyNewEvent(sb, String(body.id));
  return await sendReminders(sb);
});

// ---- リマインド ----
async function sendReminders(sb: SupabaseClient) {
  const now = new Date();
  // 送る予定を「送信済み」にしながら取得（二重送信を防ぐ）
  const { data: due, error } = await sb
    .from("events")
    .update({ reminded: true })
    .eq("reminded", false)
    .lte("remind_at", now.toISOString())
    .select("id,title,date,all_day,start_time,who,remind_at");
  if (error) return json({ error: error.message }, 500);

  const fresh = ((due ?? []) as Ev[]).filter((e) => now.getTime() - new Date(e.remind_at!).getTime() < STALE_MS);
  if (!fresh.length) return json({ sent: 0 });

  const { profiles, subs } = await loadTargets(sb);
  let sent = 0;
  const gone: string[] = [];
  for (const e of fresh) {
    // 自分の予定は本人に、共通の予定は2人ともに通知
    const targets = profiles.filter((p) => e.who === "shared" || p.color === e.who).map((p) => p.id);
    const r = await sendTo(subs, targets, {
      title: "🔔 " + e.title,
      body: whenText(e),
      tag: "ev-" + e.id,
      url: "./",
    });
    sent += r.sent;
    gone.push(...r.gone);
  }
  if (gone.length) await sb.from("push_subscriptions").delete().in("id", gone);
  return json({ sent, events: fresh.length, removed: gone.length });
}

// ---- 相手が予定を追加したときの通知 ----
async function notifyNewEvent(sb: SupabaseClient, id: string) {
  const { data: e, error } = await sb
    .from("events")
    .select("id,title,date,all_day,start_time,who,created_by")
    .eq("id", id)
    .maybeSingle();
  if (error) return json({ error: error.message }, 500);
  if (!e || !e.created_by) return json({ sent: 0 });

  const { profiles, subs } = await loadTargets(sb);
  const creator = profiles.find((p) => p.id === e.created_by);
  const targets = profiles.filter((p) => p.id !== e.created_by).map((p) => p.id);
  const r = await sendTo(subs, targets, {
    title: `📅 ${creator ? creator.name : "家族"}が予定を追加しました`,
    body: `${e.title}（${whenText(e as Ev)}）`,
    tag: "new-" + e.id,
    url: "./",
    badge: true,
  });
  if (r.gone.length) await sb.from("push_subscriptions").delete().in("id", r.gone);
  return json({ sent: r.sent, removed: r.gone.length });
}

// ---- 共通処理 ----
async function loadTargets(sb: SupabaseClient) {
  const [{ data: profiles }, { data: subs }] = await Promise.all([
    sb.from("profiles").select("id,name,color"),
    sb.from("push_subscriptions").select("*"),
  ]);
  return { profiles: (profiles ?? []) as { id: string; name: string; color: string }[], subs: (subs ?? []) as Sub[] };
}

async function sendTo(subs: Sub[], userIds: string[], payload: Record<string, unknown>) {
  let sent = 0;
  const gone: string[] = [];
  const msg = JSON.stringify(payload);
  for (const s of subs.filter((s) => userIds.includes(s.user_id))) {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, msg);
      sent++;
    } catch (err) {
      const code = (err as { statusCode?: number }).statusCode;
      if (code === 404 || code === 410) gone.push(s.id); // 無効になった端末
      else console.error("push failed", code, err);
    }
  }
  return { sent, gone };
}

function whenText(e: Ev) {
  const [, m, d] = String(e.date).split("-").map(Number);
  return `${m}月${d}日 ${e.all_day ? "終日" : String(e.start_time).slice(0, 5) + "〜"}`;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}
