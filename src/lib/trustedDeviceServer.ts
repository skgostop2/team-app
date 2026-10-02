import { createHash } from "crypto";
import { cookies } from "next/headers";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * 서버에서 "이 기기를 기억해 둔 기기인지" 확인한다.
 *
 * 화면을 그리기 전에 판단해야 해서 쿠키로 받는다.
 * 쿠키의 열쇠를 해시해서 DB 와 맞춰보고, 기한이 지났으면 안 쳐준다.
 */
export const TRUST_COOKIE = "td";

export async function isTrustedDevice(
  supabase: SupabaseClient,
  userId: string
): Promise<boolean> {
  const jar = await cookies();
  const token = jar.get(TRUST_COOKIE)?.value;
  if (!token) return false;

  const hash = createHash("sha256").update(token).digest("hex");

  const { data } = await supabase
    .from("trusted_devices")
    .select("id, expires_at")
    .eq("user_id", userId)
    .eq("token_hash", hash)
    .maybeSingle();

  const row = data as { id: string; expires_at: string } | null;
  if (!row) return false;
  if (new Date(row.expires_at).getTime() < Date.now()) return false;

  // 마지막 사용 시각만 갱신 (실패해도 들어가는 데는 지장 없다)
  await supabase
    .from("trusted_devices")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", row.id);

  return true;
}
