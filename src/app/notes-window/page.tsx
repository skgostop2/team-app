import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import NotesBoard from "@/components/NotesBoard";
import type { Profile } from "@/lib/types";

/**
 * 메모장 별도 창.
 *
 * 앱 메뉴(사이드바·아래 탭·메모 버튼) 바깥에 따로 있는 화면이다.
 * 업무 화면 옆에 나란히 띄워놓고 쓰라고 만든 것이라, 창 안에
 * 또 다른 메뉴가 들어 있으면 안 된다.
 */
export default async function NotesWindowPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();
  const me = profile as Profile | null;
  if (!me || me.status !== "승인") redirect("/login");

  return (
    <div className="h-dvh flex flex-col bg-white">
      <div className="px-3 py-2 border-b border-gray-200 shrink-0 flex items-baseline justify-between gap-2">
        <p className="text-sm font-bold text-gray-900">내 메모장</p>
        <p className="text-[11px] text-gray-400">{me.name} · 나만 볼 수 있습니다</p>
      </div>
      <div className="flex-1 min-h-0">
        <NotesBoard compact />
      </div>
    </div>
  );
}
