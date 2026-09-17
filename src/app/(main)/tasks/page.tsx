"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { Profile, TaskAssigneeLog, TaskWithEffectiveStatus } from "@/lib/types";
import { isManager, isAssignable } from "@/lib/roles";
import TaskLedger from "@/components/TaskLedger";
import ViewAsBanner from "@/components/ViewAsBanner";
import NewTaskModal from "@/components/NewTaskModal";

export default function TasksPage() {
  const [me, setMe] = useState<Profile | null>(null);
  const [tasks, setTasks] = useState<TaskWithEffectiveStatus[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [showAll, setShowAll] = useState(false);
  const [hideDone, setHideDone] = useState(false);
  const [onlyMemberAdded, setOnlyMemberAdded] = useState(false);
  const [showNewModal, setShowNewModal] = useState(false);
  const [loading, setLoading] = useState(true);
  const [handedOverIds, setHandedOverIds] = useState<Set<string>>(new Set());

  // 팀장·실장이 특정 팀원의 화면을 그대로 들여다보는 모드 (?as=<id>)
  const searchParams = useSearchParams();
  const asId = searchParams.get("as");

  async function load() {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    const [{ data: profile }, { data: allProfiles }, { data: allTasks }, { data: logs }] =
      await Promise.all([
      supabase.from("profiles").select("*").eq("id", user.id).single(),
      // 삭제된 팀원도 포함 (지난 업무의 담당자 이름 표시용). 담당자 지정 목록은 아래에서 따로 추림
      supabase.from("profiles").select("*").order("name"),
      // 메모 양식처럼 오래된 것이 위, 새 업무가 아래로 쌓이도록 오름차순
      supabase.from("v_tasks").select("*").order("created_at", { ascending: true }),
      // 내가 예전에 담당했다가 넘긴 업무 (기록은 사라지지 않는다)
      supabase.from("task_assignee_log").select("*").eq("prev_assignee_id", user.id),
    ]);

    setMe(profile as Profile);
    setProfiles((allProfiles ?? []) as Profile[]);
    setTasks((allTasks ?? []) as TaskWithEffectiveStatus[]);
    setHandedOverIds(new Set(((logs ?? []) as TaskAssigneeLog[]).map((l) => l.task_id)));
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  const isLead = isManager(me);
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
      : // RLS 가 이미 "내 업무 + 참여 + 인계한 업무"만 내려주므로 그대로 보여준다
        tasks;
    if (hideDone) list = list.filter((t) => t.effective_status !== "완료");
    if (onlyMemberAdded) list = list.filter((t) => t.source === "팀원추가");
    return list;
  }, [tasks, isLead, showAll, hideDone, onlyMemberAdded, me?.id, viewingAs]);

  // 팀원이 스스로 올린 업무가 몇 건인지 (팀장이 바로 알아볼 수 있게)
  const memberAddedCount = useMemo(
    () => tasks.filter((t) => t.source === "팀원추가").length,
    [tasks]
  );

  if (loading) return <p className="text-sm text-gray-400">불러오는 중...</p>;

  const unconfirmed = visibleTasks.filter((t) => t.is_new).length;

  return (
    <div className="space-y-4">
      {viewingAs && (
        <ViewAsBanner
          current={viewingAs}
          members={profiles.filter(isAssignable)}
          unconfirmed={unconfirmed}
          basePath="/tasks"
        />
      )}

      <div className="flex items-start justify-between gap-3 flex-wrap">
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
              onClick={() => setShowAll((v) => !v)}
              className="text-xs px-3 py-2 rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50 bg-white"
            >
              {showAll ? "내 업무만" : "전체 보기"}
            </button>
          )}
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
        onChanged={load}
        emptyText="표시할 업무가 없습니다."
      />

      {showNewModal && (
        <NewTaskModal
          profiles={profiles.filter(isAssignable)}
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
