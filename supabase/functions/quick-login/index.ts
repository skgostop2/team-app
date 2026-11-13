import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

/**
 * 발표용 번호 로그인 — 팀장님 발표(11/16~11/17) 동안만 쓰는 임시 기능.
 *
 * - 번호(2395)는 DB quick_login 에 해시로만 있다 (service_role 만 읽는다).
 * - 열려 있는 기간(from_at ~ until) 밖이면 아무것도 안 한다. 로그인 화면의 칸도 숨는다.
 * - 5번 틀리면 15분 잠근다.
 * - 맞으면 팀장(이성구) 또는 샘플 팀원(테스트팀원)의 일회용 로그인 토큰을 돌려준다.
 *   (메일은 보내지 않는다. 브라우저가 이 토큰으로 바로 로그인한다)
 *
 * 다른 실제 팀원 계정은 이 번호로 열리지 않는다.
 */

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "not allowed" }, 405);

  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });

  let body: { action?: string; pin?: string; who?: string } = {};
  try {
    body = await req.json();
  } catch {
    // 빈 요청은 상태 확인으로 본다
  }

  const { data: cfg } = await db.from("quick_login").select("*").eq("id", 1).maybeSingle();
  const now = Date.now();
  const open =
    !!cfg && cfg.enabled && now >= new Date(cfg.from_at).getTime() && now <= new Date(cfg.until).getTime();

  // 로그인 화면이 칸을 보여줄지 묻는다 — 번호나 사람은 알려주지 않는다
  if (body.action !== "login") return json({ open });

  if (!open) return json({ error: "발표용 번호는 지금 쓸 수 없습니다." }, 403);

  if (cfg.locked_until && new Date(cfg.locked_until).getTime() > now) {
    const min = Math.ceil((new Date(cfg.locked_until).getTime() - now) / 60000);
    return json({ error: `번호를 여러 번 틀려 잠겼습니다. ${min}분 뒤에 다시 해 주세요.` }, 429);
  }

  const pin = String(body.pin ?? "").trim();
  if ((await sha256Hex(cfg.salt + pin)) !== cfg.pin_hash) {
    const fails = (cfg.fail_count ?? 0) + 1;
    await db
      .from("quick_login")
      .update(
        fails >= 5
          ? { fail_count: 0, locked_until: new Date(now + 15 * 60000).toISOString(), updated_at: new Date().toISOString() }
          : { fail_count: fails, updated_at: new Date().toISOString() }
      )
      .eq("id", 1);
    return json(
      { error: fails >= 5 ? "번호를 5번 틀려 15분 잠겼습니다." : `번호가 맞지 않습니다. (${5 - fails}번 남음)` },
      401
    );
  }
  if (cfg.fail_count) {
    await db.from("quick_login").update({ fail_count: 0 }).eq("id", 1);
  }

  const userId = body.who === "member" ? cfg.member_id : cfg.lead_id;
  if (!userId) return json({ error: "샘플 팀원이 지정돼 있지 않습니다." }, 400);

  const { data: u, error: ue } = await db.auth.admin.getUserById(userId);
  if (ue || !u?.user?.email) return json({ error: "계정을 찾지 못했습니다." }, 500);

  const { data: link, error: le } = await db.auth.admin.generateLink({ type: "magiclink", email: u.user.email });
  if (le || !link?.properties?.hashed_token) return json({ error: "로그인 토큰을 만들지 못했습니다." }, 500);

  return json({ token_hash: link.properties.hashed_token, user_id: userId, until: cfg.until });
});
