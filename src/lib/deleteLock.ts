import { createClient } from "@/lib/supabase/client";

/**
 * 삭제 잠금 비밀번호.
 *
 * 비밀번호는 저장하지 않고 sha256 해시만 DB 에 둔다.
 * 이 잠금은 "손이 미끄러져 지우는 일"을 막는 용도다.
 * 진짜 방어는 삭제 권한이며, 그것은 서버에서 팀장 계정만 통과한다.
 */
export async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** 지금 설정된 해시를 읽는다 (팀장만 읽힌다) */
export async function loadLockHash(): Promise<string | null> {
  const supabase = createClient();
  const { data } = await supabase.from("delete_lock").select("password_sha256").maybeSingle();
  return (data as { password_sha256: string } | null)?.password_sha256 ?? null;
}

/**
 * 비밀번호 확인.
 *
 * "틀렸다"와 "설정을 못 읽었다"는 다른 일이다. 둘을 뭉뚱그리면
 * 권한 문제인데 비번만 계속 다시 넣는 일이 생긴다.
 */
export async function checkPassword(
  input: string
): Promise<{ ok: boolean; reason?: string }> {
  const stored = await loadLockHash();
  if (!stored) {
    return { ok: false, reason: "삭제 비밀번호 설정을 읽지 못했습니다. 팀장 계정인지 확인해주세요." };
  }
  if ((await sha256Hex(input)) !== stored) {
    return { ok: false, reason: "비밀번호가 맞지 않습니다." };
  }
  return { ok: true };
}

/**
 * 비밀번호를 바꾼다. 현재 비번을 먼저 확인한다.
 * 성공하면 null, 실패하면 사람이 읽을 이유를 돌려준다.
 */
export async function changePassword(
  current: string,
  next: string,
  userId: string
): Promise<string | null> {
  if (next.length < 4) return "새 비밀번호는 4자리 이상이어야 합니다.";
  const cur = await checkPassword(current);
  if (!cur.ok) return cur.reason ?? "현재 비밀번호가 맞지 않습니다.";

  const supabase = createClient();
  const { error } = await supabase
    .from("delete_lock")
    .update({
      password_sha256: await sha256Hex(next),
      updated_by: userId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", true);
  if (error) return `바꾸지 못했습니다: ${error.message}`;

  // RLS 는 조건에 안 맞으면 0줄을 고치고도 조용히 성공한다. 정말 바뀌었는지 확인한다.
  if (!(await checkPassword(next)).ok) return "바뀌지 않았습니다. 팀장만 바꿀 수 있습니다.";
  return null;
}
