import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

/**
 * 쌓인 알림을 푸시로 내보낸다. 1분마다 cron 이 부른다.
 *
 * - notifications 에서 아직 안 보낸 것(pushed_at null)을 집어
 * - 그 사람의 기기 구독(push_subscriptions)마다 보낸다
 * - 끊긴 구독(404/410)은 지운다
 * - 구독이 없는 사람 것도 "보낸 것"으로 표시한다 (화면 종으로는 이미 보인다)
 *
 * 키는 DB app_secrets 에 있다 (service_role 만 읽는다).
 */
Deno.serve(async (req: Request) => {
  const url = Deno.env.get("SUPABASE_URL")!;
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const db = createClient(url, service, { auth: { persistSession: false } });

  const { data: secrets } = await db.from("app_secrets").select("key,value");
  const S = Object.fromEntries((secrets ?? []).map((r: { key: string; value: string }) => [r.key, r.value]));

  const given = req.headers.get("x-dispatch-key") ?? new URL(req.url).searchParams.get("key");
  if (!S.dispatch_key || given !== S.dispatch_key) {
    return new Response("forbidden", { status: 403 });
  }
  if (!S.vapid_public || !S.vapid_private) {
    return new Response("vapid keys missing", { status: 500 });
  }
  webpush.setVapidDetails("mailto:sklee@hdi21.co.kr", S.vapid_public, S.vapid_private);

  const { data: pending } = await db
    .from("notifications")
    .select("id,user_id,kind,title,body,url,created_at")
    .is("pushed_at", null)
    .order("created_at", { ascending: true })
    .limit(300);
  if (!pending || pending.length === 0) {
    return Response.json({ sent: 0, pending: 0 });
  }

  const userIds = [...new Set(pending.map((n) => n.user_id))];
  const { data: subs } = await db
    .from("push_subscriptions")
    .select("id,user_id,endpoint,p256dh,auth")
    .in("user_id", userIds);
  const byUser = new Map<string, typeof subs>();
  for (const s of subs ?? []) {
    const arr = byUser.get(s.user_id) ?? [];
    arr.push(s);
    byUser.set(s.user_id, arr);
  }

  let sent = 0;
  const dead: string[] = [];
  const okSubs = new Set<string>();

  for (const n of pending) {
    for (const s of byUser.get(n.user_id) ?? []) {
      if (dead.includes(s.id)) continue;
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          JSON.stringify({ title: n.title, body: n.body ?? "", url: n.url ?? "/", kind: n.kind, id: n.id }),
          { TTL: 60 * 60 * 12, urgency: n.kind === "지시" || n.kind === "공지" ? "high" : "normal" }
        );
        sent++;
        okSubs.add(s.id);
      } catch (e) {
        const code = (e as { statusCode?: number }).statusCode;
        if (code === 404 || code === 410) dead.push(s.id);
        else console.error("push fail", s.id, code, (e as Error).message);
      }
    }
  }

  const now = new Date().toISOString();
  await db.from("notifications").update({ pushed_at: now }).in("id", pending.map((n) => n.id));
  if (okSubs.size > 0) await db.from("push_subscriptions").update({ last_ok_at: now }).in("id", [...okSubs]);
  if (dead.length > 0) await db.from("push_subscriptions").delete().in("id", dead);

  return Response.json({ sent, pending: pending.length, dead: dead.length });
});
