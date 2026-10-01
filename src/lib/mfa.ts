import { createClient } from "@/lib/supabase/client";

/**
 * 2단계 인증 (구글 OTP / Authenticator).
 *
 * 비밀번호만으로는 흘러나가면 끝이다. 휴대폰 앱에 있는 6자리 숫자를 같이 요구하면
 * 비밀번호를 알아도 그 사람 휴대폰이 없으면 못 들어온다.
 *
 * 인증 자체는 Supabase Auth 가 관리하고(TOTP 표준), 여기서는 그걸 부르기만 한다.
 * profiles.mfa_enabled 는 "이 사람이 OTP 를 켰다"는 표시로, 로그인 직후
 * 코드를 물어볼지 서버가 바로 판단하기 위한 것이다.
 */

export type EnrollStart = {
  factorId: string;
  /** QR 바코드 (이미지 주소) — 휴대폰 앱으로 찍는다 */
  qr: string;
  /** 카메라가 안 될 때 손으로 넣는 글자 */
  secret: string;
};

/** 이미 등록해 둔 (확인까지 끝난) OTP 가 있는지 */
export async function verifiedFactorId(): Promise<string | null> {
  const supabase = createClient();
  const { data } = await supabase.auth.mfa.listFactors();
  const f = data?.totp?.find((x) => x.status === "verified");
  return f?.id ?? null;
}

/** 등록 시작 — QR 을 받는다. 아직 켜진 것은 아니다(확인 전) */
export async function startEnroll(): Promise<{ data: EnrollStart | null; error: string | null }> {
  const supabase = createClient();

  // 확인하다 만 등록이 남아 있으면 치우고 새로 시작한다 (쌓이면 헷갈린다)
  const { data: list } = await supabase.auth.mfa.listFactors();
  for (const f of list?.all ?? []) {
    if (f.status === "unverified") await supabase.auth.mfa.unenroll({ factorId: f.id });
  }

  const { data, error } = await supabase.auth.mfa.enroll({
    factorType: "totp",
    friendlyName: `업무관리 ${new Date().toISOString().slice(0, 10)}`,
  });
  if (error || !data) return { data: null, error: error?.message ?? "등록을 시작하지 못했습니다." };

  return {
    data: { factorId: data.id, qr: data.totp.qr_code, secret: data.totp.secret },
    error: null,
  };
}

/** 앱에 뜬 6자리로 확인 — 여기까지 성공해야 켜진 것이다 */
export async function finishEnroll(factorId: string, code: string): Promise<string | null> {
  const supabase = createClient();
  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code: code.trim() });
  if (error) return readable(error.message);

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) await supabase.from("profiles").update({ mfa_enabled: true }).eq("id", user.id);
  return null;
}

/** 로그인 직후 코드 확인 */
export async function verifyAtLogin(code: string): Promise<string | null> {
  const supabase = createClient();
  const { data } = await supabase.auth.mfa.listFactors();
  const factor = data?.totp?.find((x) => x.status === "verified");
  if (!factor) return "등록된 OTP 가 없습니다.";

  const { error } = await supabase.auth.mfa.challengeAndVerify({
    factorId: factor.id,
    code: code.trim(),
  });
  return error ? readable(error.message) : null;
}

/** 해제 — 켠 사람 본인이 끈다 */
export async function disableMfa(): Promise<string | null> {
  const supabase = createClient();
  const { data } = await supabase.auth.mfa.listFactors();
  for (const f of data?.all ?? []) {
    const { error } = await supabase.auth.mfa.unenroll({ factorId: f.id });
    if (error) return error.message;
  }
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) await supabase.from("profiles").update({ mfa_enabled: false }).eq("id", user.id);
  return null;
}

/** 서버가 내려주는 영어 오류를 쓸 만한 말로 */
function readable(msg: string): string {
  const m = msg.toLowerCase();
  if (m.includes("invalid") || m.includes("incorrect"))
    return "코드가 맞지 않습니다. 앱에 지금 떠 있는 6자리를 다시 넣어주세요.";
  if (m.includes("expired")) return "코드가 만료됐습니다. 새로 뜬 숫자로 넣어주세요.";
  if (m.includes("rate") || m.includes("too many"))
    return "너무 여러 번 시도했습니다. 잠시 후 다시 해주세요.";
  return msg;
}
