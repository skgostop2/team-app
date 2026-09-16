import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Profile, TaskWithEffectiveStatus } from "@/lib/types";
import { isAssignable, byDisplayOrder } from "@/lib/roles";
import EvaluationReport from "@/components/EvaluationReport";

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

  // 팀장 전용 화면: 팀원·실장이 주소로 직접 접근해도 대시보드로 되돌린다
  if (!me || me.role !== "팀장" || me.status !== "승인") {
    redirect("/dashboard");
  }

  const [{ data: profiles }, { data: tasks }] = await Promise.all([
    supabase.from("profiles").select("*").order("sort_order"),
    supabase.from("v_tasks").select("*").order("created_at", { ascending: true }),
  ]);

  const members = ((profiles ?? []) as Profile[]).filter(isAssignable).sort(byDisplayOrder);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-gray-900">고과평가</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          팀장만 볼 수 있는 화면입니다. 실적 수치는 업무 기록에서 자동으로 계산됩니다.
        </p>
      </div>

      <EvaluationReport
        members={members}
        tasks={(tasks ?? []) as TaskWithEffectiveStatus[]}
      />

      <div className="bg-white rounded-xl border border-dashed border-gray-300 p-6">
        <p className="text-sm font-medium text-gray-600 mb-1">2차 개발 예정</p>
        <p className="text-sm text-gray-400 leading-relaxed">
          위 실적 수치를 바탕으로 한 평가기준표, 배점·가중치, 자동 평가점수 계산, 정성평가,
          평가이력 관리는 2차 개발에서 붙입니다. 현재는 평가에 쓸 <strong>객관적 실적 수치</strong>를
          먼저 뽑아 두는 단계입니다.
        </p>
      </div>
    </div>
  );
}
