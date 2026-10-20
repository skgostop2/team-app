"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type {
  Profile,
  QuestionCount,
  TaskAssigneeLog,
  TaskWithEffectiveStatus,
} from "@/lib/types";
import { isManager, isTeamLead, canDirect, assignableBy } from "@/lib/roles";
import TaskLedger from "@/components/TaskLedger";
import DeletedTasks from "@/components/DeletedTasks";
import ViewAsBanner from "@/components/ViewAsBanner";
import NewTaskModal from "@/components/NewTaskModal";
import ImportTasksModal from "@/components/ImportTasksModal";
import QuickAddModal from "@/components/QuickAddModal";
import PrintButton from "@/components/PrintButton";
import PrintHeader from "@/components/PrintHeader";

export default function TasksPage() {
  const [me, setMe] = useState<Profile | null>(null);
  const [tasks, setTasks] = useState<TaskWithEffectiveStatus[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [showAll, setShowAll] = useState(false);
  const [hideDone, setHideDone] = useState(false);
  const [onlyMemberAdded, setOnlyMemberAdded] = useState(false);
  const [showNewModal, setShowNewModal] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [showQuick, setShowQuick] = useState(false);
  const [importMsg, setImportMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [handedOverIds, setHandedOverIds] = useState<Set<string>>(new Set());
  /** 업무별 질문 수 (노란 ?) */
  const [questions, setQuestions] = useState<Map<string, QuestionCount>>(new Map());
  const [onlyQuestions, setOnlyQuestions] = useState(false);
  /** 내가 별표를 단 업무 (사람마다 따로) */
  const [stars, setStars] = useState<Set<string>>(new Set());
  const [onlyStars, setOnlyStars] = useState(false);

  // 팀장·실장이 특정 팀원의 화면을 그대로 들여다보는 모드 (?as=<id>)
  const searchParams = useSearchParams();
  const asId = searchParams.get("as");

  async function load() {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    const [
      { data: profile },
      { data: allProfiles },
      { data: allTasks },
      { data: logs },
      { data: qa },
      { data: starRows },
    ] =
      await Promise.all([
      supabase.from("profiles").select("*").eq("id", user.id).single(),
      // 삭제된 팀원도 포함 (지난 업무의 담당자 이름 표시용). 담당자 지정 목록은 아래에서 따로 추림
      supabase.from("profiles").select("*").order("name"),
      // 메모 양식처럼 오래된 것이 위, 새 업무가 아래로 쌓이도록 오름차순
      supabase.from("v_tasks").select("*").order("created_at", { ascending: true }),
      // 내가 예전에 담당했다가 넘긴 업무 (기록은 사라지지 않는다)
      supabase.from("task_assignee_log").select("*").eq("prev_assignee_id", user.id),
      // 질문과 답변 (노란 ? 표시용). 볼 수 있는 업무의 것만 내려온다.
      supabase.from("task_updates").select("id, task_id, kind, reply_to").in("kind", ["질문", "답변"]),
      // 내 별표
      supabase.from("task_stars").select("task_id").eq("user_id", user.id),
    ]);

    setMe(profile as Profile);
    setProfiles((allProfiles ?? []) as Profile[]);
    setTasks((allTasks ?? []) as TaskWithEffectiveStatus[]);
    setHandedOverIds(new Set(((logs ?? []) as TaskAssigneeLog[]).map((l) => l.task_id)));
    setQuestions(countQuestions(qa ?? []));
    setStars(new Set(((starRows ?? []) as { task_id: string }[]).map((r) => r.task_id)));
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  // 팀장·실장은 팀 전체, 그룹장은 자기 그룹.
  // 어느 쪽이든 "남의 업무를 보고 맡기는 사람"이라 화면 구성이 같다.
  // 실제로 보이는 범위는 서버(RLS)가 정한다.
  const isLead = canDirect(me);
  const viewingAs = isLead && asId ? profiles.find((p) => p.id === asId) : undefined;

  const visibleTasks = useMemo(() => {
    if (viewingAs) {
      // 그 사람 화면 그대로: 본인이 체크된 업무만
      let list = tasks.filter(
        (t) => t.assignee_id === viewingAs.id || (t.deputy_ids ?? []).includes(viewingAs.id)
      );
      if (hideDone) list = list.filter((t) => t.effective_status !== "완료");
      return list;
    }

    // 팀원 화면에는 내가 담당인 업무 + 내가 참여자인 업무 + 내가 넘긴(인계한) 업무가 모두 보인다.
    // 담당이 바뀌어도 업무가 그냥 사라지지 않게 하기 위함이다.
    const mine = (t: TaskWithEffectiveStatus) =>
      t.assignee_id === me?.id || (t.deputy_ids ?? []).includes(me?.id ?? "");
    let list = isLead
      ? showAll
        ? tasks
        : // 내 업무 + 미지정 + 팀원이 스스로 올린 업무 (팀장이 놓치지 않게)
          tasks.filter((t) => mine(t) || !t.assignee_id || t.source === "팀원추가")
      : // 팀원 화면.
        // 평소에는 RLS 가 "내 업무 + 참여 + 인계한 업무"만 내려준다.
        // 팀장이 「팀 현황 공개」를 켜면 같은 그룹 사람 업무까지 내려오므로,
        // 기본은 내 것만 보여주고 전체는 버튼으로 본다 (내 표가 남의 일로 덮이지 않게).
        showAll
        ? tasks
        : tasks.filter((t) => mine(t) || handedOverIds.has(t.id));
    if (hideDone) list = list.filter((t) => t.effective_status !== "완료");
    if (onlyMemberAdded) list = list.filter((t) => t.source === "팀원추가");
    if (onlyQuestions) list = list.filter((t) => (questions.get(t.id)?.open ?? 0) > 0);
    if (onlyStars) list = list.filter((t) => stars.has(t.id));
    return list;
  }, [
    tasks,
    isLead,
    showAll,
    hideDone,
    onlyMemberAdded,
    onlyQuestions,
    onlyStars,
    stars,
    questions,
    me?.id,
    viewingAs,
    handedOverIds,
  ]);

  /** 별표 켜고 끄기 — 내 화면에만 보이는 표시다 */
  async function toggleStar(taskId: string, next: boolean) {
    setStars((prev) => {
      const s = new Set(prev);
      if (next) s.add(taskId);
      else s.delete(taskId);
      return s;
    });
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    if (next) await supabase.from("task_stars").insert({ task_id: taskId, user_id: user.id });
    else
      await supabase
        .from("task_stars")
        .delete()
        .eq("task_id", taskId)
        .eq("user_id", user.id);
  }

  /** 답변을 기다리는 질문이 몇 건인가 */
  const openQuestions = useMemo(() => {
    let n = 0;
    for (const t of tasks) n += questions.get(t.id)?.open ?? 0;
    return n;
  }, [tasks, questions]);

  /** 팀원 화면에 남의 업무가 내려와 있는가 (팀장이 공개를 켜 둔 경우) */
  const othersVisible = useMemo(
    () =>
      !isLead &&
      tasks.some(
        (t) =>
          t.assignee_id !== me?.id &&
          !(t.deputy_ids ?? []).includes(me?.id ?? "") &&
          !handedOverIds.has(t.id)
      ),
    [tasks, isLead, me?.id, handedOverIds]
  );

  /**
   * 내 업무 요약 — 팀원에게는 이 화면이 유일한 자기 화면이라
   * 예전 「내 현황」에 있던 숫자 네 개를 여기 맨 위로 옮겼다.
   * 보고 있는 표가 아니라 "내가 맡은 업무 전체"를 센다 (필터에 흔들리지 않게).
   */
  const mySummary = useMemo(() => {
    const mine = tasks.filter(
      (t) => t.assignee_id === me?.id || (t.deputy_ids ?? []).includes(me?.id ?? "")
    );
    const done = mine.filter((t) => t.effective_status === "완료").length;
    return {
      total: mine.length,
      inProgress: mine.filter((t) => t.effective_status === "진행중").length,
      delayed: mine.filter((t) => t.effective_status === "지연").length,
      rate: mine.length ? Math.round((done / mine.length) * 100) : 0,
    };
  }, [tasks, me?.id]);

  // 팀원이 스스로 올린 업무가 몇 건인지 (팀장이 바로 알아볼 수 있게)
  const memberAddedCount = useMemo(
    () => tasks.filter((t) => t.source === "팀원추가").length,
    [tasks]
  );

  if (loading) return <p className="text-sm text-gray-400">불러오는 중...</p>;

  const unconfirmed = visibleTasks.filter((t) => t.is_new).length;

  return (
    <div className="space-y-4">
      {!isLead && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 print-block">
          <Stat label="내 업무" value={mySummary.total} />
          <Stat label="진행중" value={mySummary.inProgress} accent="text-blue-600" />
          <Stat label="지연" value={mySummary.delayed} accent="text-red-600" />
          <Stat label="내 달성율" value={`${mySummary.rate}%`} accent="text-emerald-600" />
        </div>
      )}

      {openQuestions > 0 && !viewingAs && (
        <button
          onClick={() => setOnlyQuestions((v) => !v)}
          className="no-print w-full flex items-center gap-2 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-left hover:bg-amber-100"
        >
          <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-amber-400 text-white font-bold">
            ?
          </span>
          <span className="text-sm font-medium text-amber-900 break-keep">
            {isLead ? "답변을 기다리는 질문" : "내가 올린 질문 중 답변 대기"} {openQuestions}건
          </span>
          <span className="flex-1" />
          <span className="text-xs text-amber-700 whitespace-nowrap">
            {onlyQuestions ? "전체 보기" : "질문만 보기"}
          </span>
        </button>
      )}

      {viewingAs && (
        <ViewAsBanner
          current={viewingAs}
          members={assignableBy(me, profiles)}
          unconfirmed={unconfirmed}
          basePath="/tasks"
        />
      )}

      <PrintHeader
        title={
          viewingAs
            ? `업무 진행 현황 — ${viewingAs.name}`
            : isLead && showAll
              ? "업무 진행 현황 (전체)"
              : "업무 진행 현황"
        }
        subtitle={`${me?.team_name ?? ""} ${hideDone ? "· 완료 제외" : ""} · 총 ${visibleTasks.length}건`}
      />

      <div className="no-print flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-gray-900">
            {viewingAs
              ? `${viewingAs.name} 님의 업무`
              : isLead && showAll
                ? "전체 업무"
                : "내 업무"}
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            업무를 누르면 상세 화면에서 진행률과 비고를 고칠 수 있습니다.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {!viewingAs && stars.size > 0 && (
            <label className="flex items-center gap-1.5 text-xs text-amber-800 border border-amber-300 bg-amber-50 rounded-lg px-3 py-2 cursor-pointer">
              <input
                type="checkbox"
                checked={onlyStars}
                onChange={(e) => setOnlyStars(e.target.checked)}
                className="w-3.5 h-3.5"
              />
              ★ 내 별표만 ({stars.size})
            </label>
          )}
          <label className="flex items-center gap-1.5 text-xs text-gray-600 border border-gray-300 rounded-lg px-3 py-2 cursor-pointer bg-white">
            <input
              type="checkbox"
              checked={hideDone}
              onChange={(e) => setHideDone(e.target.checked)}
              className="w-3.5 h-3.5"
            />
            완료 숨기기
          </label>
          {isLead && !viewingAs && memberAddedCount > 0 && (
            <label className="flex items-center gap-1.5 text-xs text-blue-700 border border-blue-300 bg-blue-50 rounded-lg px-3 py-2 cursor-pointer">
              <input
                type="checkbox"
                checked={onlyMemberAdded}
                onChange={(e) => setOnlyMemberAdded(e.target.checked)}
                className="w-3.5 h-3.5"
              />
              팀원추가분만 ({memberAddedCount})
            </label>
          )}
          {isLead && !viewingAs && (
            <button
              onClick={() => setShowQuick(true)}
              className="text-xs px-3 py-2 rounded-lg border border-blue-300 text-blue-700 bg-blue-50 hover:bg-blue-100 font-medium"
            >
              빠른 등록
            </button>
          )}
          {isLead && !viewingAs && (
            <button
              onClick={() => setShowImport(true)}
              className="text-xs px-3 py-2 rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50 bg-white"
            >
              엑셀 가져오기
            </button>
          )}
          {(isLead || othersVisible) && !viewingAs && (
            <button
              onClick={() => setShowAll((v) => !v)}
              className="text-xs px-3 py-2 rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50 bg-white"
            >
              {showAll ? "내 업무만" : "전체 보기"}
            </button>
          )}
          <PrintButton />
          {!viewingAs && (
            <button
              onClick={() => setShowNewModal(true)}
              className="text-xs px-3 py-2 rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700"
            >
              {isLead ? "+ 새 업무 지시" : "+ 내 업무 추가"}
            </button>
          )}
        </div>
      </div>

      <TaskLedger
        tasks={visibleTasks}
        profiles={profiles}
        title={
          viewingAs
            ? `업무 진행 현황 (${viewingAs.name} 님)`
            : isLead && showAll
              ? "업무 진행 현황 (전체)"
              : "업무 진행 현황 (내 업무)"
        }
        showAssignee={isLead}
        canAssign={isLead && !viewingAs}
        onAssigned={load}
        viewerId={viewingAs ? viewingAs.id : me?.id}
        handedOverIds={viewingAs ? undefined : handedOverIds}
        canEdit={!viewingAs}
        canDelete={isTeamLead(me)}
        questions={questions}
        canAnswer={isLead && !viewingAs}
        stars={stars}
        onToggleStar={viewingAs ? undefined : toggleStar}
        onChanged={load}
        emptyText="표시할 업무가 없습니다."
      />

      {/* 지워진 업무 — 팀원이 지시받은 업무를 지워도 여기 남는다 */}
      {isManager(me) && !viewingAs && <DeletedTasks profiles={profiles} />}

      {importMsg && (
        <div className="rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-3 text-sm text-emerald-700">
          {importMsg}
        </div>
      )}

      {showQuick && me && (
        <QuickAddModal
          members={assignableBy(me, profiles)}
          createdBy={me.id}
          instructorDefault={me.name}
          onClose={() => setShowQuick(false)}
          onDone={(n) => {
            setShowQuick(false);
            setImportMsg(`${n}건을 등록했습니다.`);
            load();
          }}
        />
      )}

      {showImport && me && (
        <ImportTasksModal
          members={assignableBy(me, profiles)}
          createdBy={me.id}
          onClose={() => setShowImport(false)}
          onDone={async (count) => {
            setShowImport(false);
            setImportMsg(`엑셀에서 ${count}건을 등록했습니다. 담당자가 미지정인 건은 담당자 칸에서 체크해 주십시오.`);
            await load();
          }}
        />
      )}

      {showNewModal && (
        <NewTaskModal
          profiles={assignableBy(me, profiles)}
          defaultInstructor={me?.name ?? ""}
          selfMode={!isLead}
          selfId={me?.id}
          onClose={() => setShowNewModal(false)}
          onCreated={() => {
            setShowNewModal(false);
            load();
          }}
        />
      )}
    </div>
  );
}

/** 화면 맨 위 숫자 한 칸 */
function Stat({
  label,
  value,
  accent = "text-gray-900",
}: {
  label: string;
  value: number | string;
  accent?: string;
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white px-4 py-3">
      <p className="text-xs text-gray-500">{label}</p>
      <p className={`text-2xl font-bold mt-0.5 ${accent}`}>{value}</p>
    </div>
  );
}

/** 질문·답변 행을 업무별 개수로 바꾼다 */
function countQuestions(
  rows: { id: string; task_id: string; kind: string | null; reply_to: string | null }[]
): Map<string, QuestionCount> {
  const answered = new Set(
    rows.filter((r) => r.kind === "답변" && r.reply_to).map((r) => r.reply_to as string)
  );
  const map = new Map<string, QuestionCount>();
  for (const q of rows.filter((r) => r.kind === "질문")) {
    const cur = map.get(q.task_id) ?? { open: 0, total: 0 };
    cur.total += 1;
    if (!answered.has(q.id)) cur.open += 1;
    map.set(q.task_id, cur);
  }
  return map;
}
