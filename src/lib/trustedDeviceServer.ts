import { createHash } from "crypto";
import { cookies } from "next/headers";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * 서버에서 "이 기기를 기억해 둔 기기인지" 확인한다.
 *
 * 화면을 그리기 전에 판단해야 해서 쿠키로 받는다.
 * 쿠키의 열쇠를 해시해서 DB 와 맞춰보고, 기한이 지났으면 안 쳐준다.
 */
/** 쿠키 이름은 사람마다 다르다 (공용 PC 에서 서로 덮어쓰지 않도록) */
function cookieName(userId: string): string {
  return `td_${userId.slice(0, 8)}`;
}

export async function isTrustedDevice(
  supabase: SupabaseClient,
  userId: string
): Promise<boolean> {
  const jar = await cookies();
  const token = jar.get(cookieName(userId))?.value;
  if (!token) return false;

  const hash = createHash("sha256").update(token).digest("hex");

  const { data } = await supabase
    .from("trusted_devices")
    .select("id, expires_at, last_used_at")
    .eq("user_id", userId)
    .eq("token_hash", hash)
    .maybeSingle();

  const row = data as { id: string; expires_at: string; last_used_at: string } | null;
  if (!row) return false;
  if (new Date(row.expires_at).getTime() < Date.now()) return false;

  // 마지막 사용 시각은 하루에 한 번만 갱신한다.
  // 화면을 넘길 때마다 쓰면 느린 회선에서 클릭마다 기다리게 된다.
  const aDay = 24 * 60 * 60 * 1000;
  if (Date.now() - new Date(row.last_used_at).getTime() > aDay) {
    await supabase
      .from("trusted_devices")
      .update({ last_used_at: new Date().toISOString() })
      .eq("id", row.id);
  }

  return true;
}
