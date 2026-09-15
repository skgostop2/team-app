"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Profile, TaskWithEffectiveStatus } from "@/lib/types";
import { isManager, isAssignable } from "@/lib/roles";
import TaskLedger from "@/components/TaskLedger";
import NewTaskModal from "@/components/NewTaskModal";

export default function TasksPage() {
  const [me, setMe] = useState<Profile | null>(null);
  const [tasks, setTasks] = useState<TaskWithEffectiveStatus[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [showAll, setShowAll] = useState(false);
  const [hideDone, setHideDone] = useState(false);
  const [showNewModal, setShowNewModal] = useState(false);
  const [loading, setLoading] = useState(true);

  async function load() {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    const [{ data: profile }, { data: allProfiles }, { data: allTasks }] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", user.id).single(),
      // 삭제된 팀원도 포함 (지난 업무의 담당자 이름 표시용). 담당자 지정 목록은 아래에서 따로 추림
      supabase.from("profiles").select("*").order("name"),
      // 메모 양식처럼 오래된 것이 위, 새 업무가 아래로 쌓이도록 오름차순
      supabase.from("v_tasks").select("*").order("created_at", { ascending: true }),
    ]);

    setMe(profile as Profile);
    setProfiles((allProfiles ?? []) as Profile[]);
    setTasks((allTasks ?? []) as TaskWithEffectiveStatus[]);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  const isLead = isManager(me);

  const visibleTasks = useMemo(() => {
    let list = isLead && showAll ? tasks : tasks.filter((t) => t.assignee_id === me?.id);
    if (hideDone) list = list.filter((t) => t.effective_status !== "완료");
    return list;
  }, [tasks, isLead, showAll, hideDone, me?.id]);

  if (loading) return <p className="text-sm text-gray-400">불러오는 중...</p>;

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-gray-900">
            {isLead && showAll ? "전체 업무" : "내 업무"}
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
          {isLead && (
            <button
              onClick={() => setShowAll((v) => !v)}
              className="text-xs px-3 py-2 rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50 bg-white"
            >
              {showAll ? "내 업무만" : "전체 보기"}
            </button>
          )}
          {isLead && (
            <button
              onClick={() => setShowNewModal(true)}
              className="text-xs px-3 py-2 rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700"
            >
              + 새 업무 지시
            </button>
          )}
        </div>
      </div>

      <TaskLedger
        tasks={visibleTasks}
        profiles={profiles}
        title={isLead && showAll ? "업무 진행 현황 (전체)" : "업무 진행 현황 (내 업무)"}
        showAssignee={isLead && showAll}
        emptyText="표시할 업무가 없습니다."
      />

      {showNewModal && (
        <NewTaskModal
          profiles={profiles.filter(isAssignable)}
          defaultInstructor={me?.name ?? ""}
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
