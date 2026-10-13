"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Group, Profile, TaskUpdate, TaskWithEffectiveStatus } from "@/lib/types";
import { canDirect } from "@/lib/roles";
import { cn } from "@/lib/utils";
import { shiftWeek, thisWeek, type Week } from "@/lib/week";
import { buildWeekly, totals, type WeeklyPerson } from "@/lib/weekly";
import PrintButton from "@/components/PrintButton";
import PrintHeader from "@/components/PrintHeader";
import TaskEditModal from "@/components/TaskEditModal";
import WeeklyBoard from "@/components/WeeklyBoard";
import MeetingMode from "@/components/MeetingMode";

/**
 * 금주 계획 대비 실적.
 *
 * 계획은 업무관리에서 자동으로 끌어온다 — 다시 적게 하지 않는다.
 * 실적은 평소 쓰는 진행기록을 그대로 쓴다.
 * 달성도를 숫자 하나로 요약하지 않는다 (완료·진행중·지연 세 칸으로 둔다).
 *
 * "회의 모드"를 누르면 같은 내용이 큰 글씨로, 한 사람씩 넘어간다.
 */
export default function WeeklyPage() {
  const [me, setMe] = useState<Profile | null>(null);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [tasks, setTasks] = useState<TaskWithEffectiveStatus[]>([]);
  const [updates, setUpdates] = useState<TaskUpdate[]>([]);
  const [loading, setLoading] = useState(true);
  const [week, setWeek] = useState<Week>(() => thisWeek());
  const [detailId, setDetailId] = useState<string | null>(null);
  const [meeting, setMeeting] = useState(false);

  const load = useCallback(async () => {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    const [{ data: profile }, { data: all }, { data: gs }, { data: ts }, { data: us }] =
      await Promise.all([
        supabase.from("profiles").select("*").eq("id", user.id).single(),
        supabase.from("profiles").select("*").order("sort_order"),
        supabase.from("groups").select("*").order("sort_order"),
        supabase.from("v_tasks").select("*"),
        supabase.from("task_updates").select("*").order("created_at"),
      ]);

    setMe(profile as Profile);
    setProfiles((all ?? []) as Profile[]);
    setGroups((gs ?? []) as Group[]);
    setTasks((ts ?? []) as TaskWithEffectiveStatus[]);
    setUpdates((us ?? []) as TaskUpdate[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const next = useMemo(() => shiftWeek(week, 1), [week]);

  const people: WeeklyPerson[] = useMemo(() => {
    if (!me) return [];
    const nameOfGroup = (id: string | null) => groups.find((g) => g.id === id)?.name ?? null;
    return buildWeekly({ profiles, tasks, updates, week, next, groupNameOf: nameOfGroup });
  }, [me, profiles, groups, tasks, updates, week, next]);

  /** 기한이 없어 어느 주에도 안 잡히는 업무 — 조용히 사라지면 안 된다 */
  const undated = useMemo(
    () => tasks.filter((t) => !t.due_date && !t.start_date && t.effective_status !== "완료"),
    [tasks]
  );

  if (loading) return <p className="text-sm text-gray-400">불러오는 중...</p>;

  const sum = totals(people);
  const canEdit = canDirect(me);

  if (meeting) {
    return (
      <MeetingMode
        people={people}
        week={week}
        profiles={profiles}
        canEdit={canEdit}
        onClose={() => setMeeting(false)}
        onChanged={load}
      />
    );
  }

  return (
    <div className="space-y-4">
      <PrintHeader
        title={`금주 계획 대비 실적 — ${week.title}`}
        subtitle={`${week.label} · 완료 ${sum.done} · 진행중 ${sum.running} · 지연 ${sum.late}`}
      />

      <div className="no-print flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-gray-900">금주 계획 대비 실적</h1>
          <p className="text-sm text-gray-500 mt-0.5 break-keep">
            업무관리에 등록된 일에서 이번 주에 걸린 것을 모았습니다. 따로 적을 것은 없습니다.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <PrintButton />
          <button
            onClick={() => setMeeting(true)}
            className="text-xs px-3 py-2 rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700"
          >
            회의 모드
          </button>
        </div>
      </div>

      {/* 주 이동 */}
      <div className="no-print flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-1">
          <button
            onClick={() => setWeek(shiftWeek(week, -1))}
            className="px-2.5 py-1.5 text-sm rounded border border-gray-300 text-gray-600 hover:bg-gray-50"
            title="지난 주"
          >
            ‹
          </button>
          <span className="px-2 text-sm font-semibold text-gray-800">
            {week.title}
            <span className="ml-2 text-xs font-normal text-gray-400">{week.label}</span>
          </span>
          <button
            onClick={() => setWeek(shiftWeek(week, 1))}
            className="px-2.5 py-1.5 text-sm rounded border border-gray-300 text-gray-600 hover:bg-gray-50"
            title="다음 주"
          >
            ›
          </button>
          <button
            onClick={() => setWeek(thisWeek())}
            className="ml-1 px-2.5 py-1.5 text-sm rounded border border-gray-300 text-gray-600 hover:bg-gray-50"
          >
            이번 주
          </button>
        </div>

        <div className="flex items-center gap-3 text-sm">
          <Count label="완료" n={sum.done} className="text-emerald-700" />
          <Count label="진행중" n={sum.running} className="text-blue-700" />
          <Count label="지연" n={sum.late} className="text-amber-700" />
        </div>
      </div>

      <WeeklyBoard
        people={people}
        week={week}
        onPick={setDetailId}
        emptyText="이번 주에 걸린 업무가 없습니다."
      />

      {/* 기한이 없어 어느 주에도 안 잡히는 업무 */}
      {undated.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 print-block">
          <p className="text-sm font-semibold text-amber-800">
            기한 미정 {undated.length}건 — 주간표에 잡히지 않습니다
          </p>
          <p className="text-xs text-amber-700 mt-0.5 break-keep">
            진행일정이나 완료계획일정을 넣으면 그 주 계획으로 올라옵니다.
          </p>
          <ul className="mt-2 space-y-0.5">
            {undated.map((t) => (
              <li key={t.id}>
                <button
                  onClick={() => setDetailId(t.id)}
                  className="text-left text-sm text-amber-900 hover:underline break-keep"
                >
                  · {t.title}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {detailId && (
        <TaskEditModal taskId={detailId} onClose={() => setDetailId(null)} onChanged={load} />
      )}
    </div>
  );
}

function Count({ label, n, className }: { label: string; n: number; className?: string }) {
  return (
    <span className={cn("font-medium", className)}>
      {label} <span className="font-bold">{n}</span>
    </span>
  );
}
