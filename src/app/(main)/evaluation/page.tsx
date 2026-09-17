import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { EvaluationCriterion, Profile, TaskWithEffectiveStatus } from "@/lib/types";
import { isAssignable, byDisplayOrder } from "@/lib/roles";
import EvaluationReport from "@/components/EvaluationReport";
import PrintButton from "@/components/PrintButton";
import PrintHeader from "@/components/PrintHeader";

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

  const [{ data: profiles }, { data: tasks }, { data: criteria }] = await Promise.all([
    supabase.from("profiles").select("*").order("sort_order"),
    supabase.from("v_tasks").select("*").order("created_at", { ascending: true }),
    supabase.from("evaluation_criteria").select("*").order("sort_order"),
  ]);

  const members = ((profiles ?? []) as Profile[]).filter(isAssignable).sort(byDisplayOrder);

  return (
    <div className="space-y-4">
      <PrintHeader
        title="고과평가 참고자료 — 팀원별 업무 실적"
        subtitle={`${me.team_name ?? ""} · 작성 ${me.name} · 업무 기록에서 자동 산출된 수치입니다`}
      />

      <div className="no-print flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-gray-900">고과평가</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            팀장만 볼 수 있는 화면입니다. 실적 수치는 업무 기록에서 자동으로 계산됩니다.
          </p>
        </div>
        <PrintButton />
      </div>

      <EvaluationReport
        members={members}
        tasks={(tasks ?? []) as TaskWithEffectiveStatus[]}
        criteria={(criteria ?? []) as EvaluationCriterion[]}
      />

      <div className="no-print bg-white rounded-xl border border-dashed border-gray-300 p-6">
        <p className="text-sm font-medium text-gray-600 mb-1">2차 개발 예정</p>
        <p className="text-sm text-gray-400 leading-relaxed">
          배점·가중치를 반영한 자동 점수 계산, 정성평가 항목, 평가이력 관리는 2차 개발에서
          붙입니다. 현재는 <strong>객관적 실적 수치</strong>와 <strong>기준 대비 충족 여부</strong>
          까지 나옵니다.
        </p>
      </div>
    </div>
  );
}
