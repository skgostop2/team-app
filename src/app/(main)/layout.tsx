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
