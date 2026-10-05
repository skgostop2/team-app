import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AppShell from "@/components/AppShell";
import { isTrustedDevice } from "@/lib/trustedDeviceServer";
import type { Profile } from "@/lib/types";

export default async function MainLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  if (!profile) {
    redirect("/login");
  }

  const p = profile as Profile;

  // 순서가 중요하다.
  //
  // OTP 를 이미 켠 사람은 "6자리 확인"을 무엇보다 먼저 통과해야 한다.
  // 이걸 뒤로 미루면 처음 비밀번호(1234)를 아는 사람이 남의 계정으로 들어와
  // 비밀번호 변경 화면까지 가버린다 — OTP 를 켠 의미가 없어진다.
  if (p.mfa_enabled) {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (session && assuranceLevel(session.access_token) !== "aal2") {
      // 기억해 둔 기기면 다시 묻지 않는다
      const trusted = await isTrustedDevice(supabase, p.id);
      if (!trusted) redirect("/mfa");
    }
  }

  // 그다음에 첫 로그인 절차(OTP 등록 → 비밀번호 변경)가 남았는지 본다.
  if (p.status === "승인") {
    const { data: setting } = await supabase
      .from("team_settings")
      .select("value")
      .eq("key", "require_mfa")
      .maybeSingle();
    const requireMfa = (setting as { value: boolean } | null)?.value !== false;

    if ((requireMfa && !p.mfa_enabled) || !p.password_changed) {
      redirect("/onboarding");
    }
  }

  if (p.status !== "승인") {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-gray-50 px-4">
        <div className="w-full max-w-sm text-center bg-white rounded-xl shadow-sm border border-gray-200 p-8">
          <h1 className="text-lg font-bold text-gray-900 mb-2">사용할 수 없는 계정입니다</h1>
          <p className="text-sm text-gray-500 mb-6">팀장에게 문의해주세요.</p>
          <SignOutButton />
        </div>
      </div>
    );
  }

  return <AppShell profile={p}>{children}</AppShell>;
}

/** 토큰 안의 aal 값을 읽는다 (서명 검증은 Supabase 가 이미 했다) */
function assuranceLevel(accessToken: string): string | null {
  try {
    const body = accessToken.split(".")[1];
    const json = JSON.parse(Buffer.from(body, "base64").toString("utf8"));
    return typeof json.aal === "string" ? json.aal : null;
  } catch {
    return null;
  }
}

function SignOutButton() {
  return (
    <a
      href="/logout"
      className="inline-block text-sm text-blue-600 hover:underline"
    >
      로그아웃
    </a>
  );
}
