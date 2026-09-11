"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { formatDate } from "@/lib/utils";
import type { Profile, TaskWithEffectiveStatus } from "@/lib/types";
import StatusBadge from "@/components/StatusBadge";
import NewTaskModal from "@/components/NewTaskModal";

export default function TasksPage() {
  const [me, setMe] = useState<Profile | null>(null);
  const [tasks, setTasks] = useState<TaskWithEffectiveStatus[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [showAll, setShowAll] = useState(false);
  const [showNewModal, setShowNewModal] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function load() {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    const [{ data: profile }, { data: allProfiles }, { data: allTasks }] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", user.id).single(),
      supabase.from("profiles").select("*").eq("status", "승인").order("name"),
      supabase.from("v_tasks").select("*").order("created_at", { ascending: false }),
    ]);

    setMe(profile as Profile);
    setProfiles((allProfiles ?? []) as Profile[]);
    setTasks((allTasks ?? []) as TaskWithEffectiveStatus[]);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  const isLead = me?.role === "팀장";
  const visibleTasks = isLead && showAll ? tasks : tasks.filter((t) => t.assignee_id === me?.id);

  async function confirmNew(taskId: string) {
    setBusyId(taskId);
    const supabase = createClient();
    await supabase.from("tasks").update({ confirmed_at: new Date().toISOString() }).eq("id", taskId);
    await load();
    setBusyId(null);
  }

  async function updateProgress(taskId: string, progress: number) {
    setBusyId(taskId);
    const supabase = createClient();
    const status = progress >= 100 ? "완료" : progress > 0 ? "진행중" : "대기";
    await supabase.from("tasks").update({ progress, status }).eq("id", taskId);
    await load();
    setBusyId(null);
  }

  if (loading) return <p className="text-sm text-gray-400">불러오는 중...</p>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">{isLead && showAll ? "전체 업무" : "내 업무"}</h1>
          <p className="text-sm text-gray-500 mt-0.5">진행률을 변경하거나 새 업무를 확인하세요.</p>
        </div>
        <div className="flex items-center gap-2">
          {isLead && (
            <button
              onClick={() => setShowAll((v) => !v)}
              className="text-xs px-3 py-2 rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50"
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

      <div className="space-y-3">
        {visibleTasks.map((t) => {
          const assignee = profiles.find((p) => p.id === t.assignee_id);
          return (
            <div
              key={t.id}
              className={`bg-white rounded-xl border p-4 ${
                t.is_new ? "border-blue-300 ring-1 ring-blue-100" : "border-gray-200"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    {t.is_new && (
                      <span className="text-[10px] font-bold text-white bg-blue-500 px-1.5 py-0.5 rounded">
                        신규
                      </span>
                    )}
                    <Link href={`/tasks/${t.id}`} className="font-semibold text-gray-900 hover:text-blue-600">
                      {t.title}
                    </Link>
                    <StatusBadge status={t.effective_status} />
                  </div>
                  {showAll && (
                    <p className="text-xs text-gray-400 mt-1">담당자: {assignee?.name ?? "-"}</p>
                  )}
                  {t.description && (
                    <p className="text-sm text-gray-500 mt-1 line-clamp-2">{t.description}</p>
                  )}
                  <p className="text-xs text-gray-400 mt-1">마감일: {formatDate(t.due_date)}</p>
                </div>
              </div>

              <div className="mt-3 flex items-center gap-3">
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={5}
                  value={t.progress}
                  disabled={busyId === t.id || (t.assignee_id !== me?.id && !isLead)}
                  onChange={(e) => updateProgress(t.id, Number(e.target.value))}
                  className="flex-1"
                />
                <span className="text-sm font-medium text-gray-700 w-10 text-right">{t.progress}%</span>
              </div>

              {t.is_new && t.assignee_id === me?.id && (
                <button
                  onClick={() => confirmNew(t.id)}
                  disabled={busyId === t.id}
                  className="mt-3 w-full sm:w-auto text-sm px-4 py-2 rounded-lg bg-gray-900 text-white font-medium hover:bg-black disabled:opacity-50"
                >
                  확인했습니다
                </button>
              )}
            </div>
          );
        })}

        {visibleTasks.length === 0 && (
          <div className="text-center py-16 text-gray-400 text-sm bg-white rounded-xl border border-gray-200">
            표시할 업무가 없습니다.
          </div>
        )}
      </div>

      {showNewModal && (
        <NewTaskModal
          profiles={profiles}
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
