import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AppShell from "@/components/AppShell";
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

  // 첫 로그인 절차가 안 끝났으면 들여보내지 않는다 (OTP 등록 → 비밀번호 변경).
  // 처음 비밀번호가 1234 로 모두 같으므로 이것이 실질적인 첫 관문이다.
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

  // 2단계 인증을 켠 사람은 6자리 확인까지 끝나야 들어올 수 있다.
  // 토큰의 aal 이 aal2 면 확인을 마친 것이다.
  if (p.mfa_enabled) {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (session && assuranceLevel(session.access_token) !== "aal2") {
      redirect("/mfa");
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
