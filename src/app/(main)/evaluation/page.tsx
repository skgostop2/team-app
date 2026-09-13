import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/types";

export default async function EvaluationPage() {
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

  const me = profile as Profile | null;

  // 팀장 전용 화면: 팀원이 주소로 직접 접근해도 대시보드로 되돌린다
  if (!me || me.role !== "팀장" || me.status !== "승인") {
    redirect("/dashboard");
  }

  return (
    <div className="max-w-2xl">
      <h1 className="text-xl font-bold text-gray-900 mb-2">고과평가</h1>
      <p className="text-sm text-gray-500 mb-4">팀장만 접근할 수 있는 화면입니다.</p>
      <div className="bg-white rounded-xl border border-dashed border-gray-300 p-10 text-center">
        <p className="text-gray-500 font-medium mb-2">2차 개발 예정 기능입니다</p>
        <p className="text-sm text-gray-400 leading-relaxed">
          평가기준표, 배점/가중치, 자동 평가점수 계산, 업무 실적 연동, 정성평가, 이력관리 등은
          2차 개발에서 반영됩니다. 현재는 관련 데이터 구조(평가기간·평가항목·평가점수)만
          미리 준비되어 있습니다.
        </p>
      </div>
    </div>
  );
}
