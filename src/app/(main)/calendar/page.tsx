"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { Profile, TaskWithEffectiveStatus } from "@/lib/types";
import { isManager, isAssignable } from "@/lib/roles";
import { cn } from "@/lib/utils";
import { dayKey, shiftMonth, todayKey } from "@/lib/calendar";
import {
  MonthView,
  TimelineView,
  DayPanel,
  CalendarLegend,
} from "@/components/CalendarViews";
import PrintButton from "@/components/PrintButton";
import PrintHeader from "@/components/PrintHeader";
import ViewAsBanner from "@/components/ViewAsBanner";
import TaskEditModal from "@/components/TaskEditModal";

/**
 * 달력 — 표로는 안 보이는 "언제"를 본다.
 *
 * 두 가지로 본다. 보는 목적이 다르다.
 *  - 월 달력: 이번 달에 무엇이 언제까지 끝나야 하는지 (완료계획일정 기준)
 *  - 타임라인: 누가 언제부터 언제까지 붙어 있는지 (진행일정 ~ 완료계획일정)
 *
 * 기준 날짜는 완료계획일정이다. 계획일이 없는 업무는 달력에 자리가 없으므로
 * 아래에 "날짜 없음"으로 따로 모아 보여준다 — 빠뜨리면 안 되니까.
 */

type Tab = "month" | "timeline";

export default function CalendarPage() {
  const [me, setMe] = useState<Profile | null>(null);
  const [tasks, setTasks] = useState<TaskWithEffectiveStatus[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("month");
  const [hideDone, setHideDone] = useState(false);
  const [openDay, setOpenDay] = useState<string | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);

  const today = todayKey();
  const [cursor, setCursor] = useState(() => ({
    year: Number(today.slice(0, 4)),
    month: Number(today.slice(5, 7)),
  }));

  // 팀장·실장이 특정 팀원 화면을 들여다보는 모드 (?as=<id>)
  const searchParams = useSearchParams();
  const asId = searchParams.get("as");

  async function load() {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    const [{ data: profile }, { data: allProfiles }, { data: allTasks }] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", user.id).single(),
      supabase.from("profiles").select("*").order("name"),
      supabase.from("v_tasks").select("*").order("due_date", { ascending: true }),
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
  const viewingAs = isLead && asId ? profiles.find((p) => p.id === asId) : undefined;

  /** 이 화면에서 볼 업무 */
  const scoped = useMemo(() => {
    const subject = viewingAs?.id ?? me?.id;
    const mine = (t: TaskWithEffectiveStatus) =>
      t.assignee_id === subject || (t.deputy_ids ?? []).includes(subject ?? "");

    let list = isLead && !viewingAs ? tasks : tasks.filter(mine);
    if (hideDone) list = list.filter((t) => t.effective_status !== "완료");
    return list;
  }, [tasks, me, isLead, viewingAs, hideDone]);

  /** 완료계획일정 기준으로 날짜별로 모은다 */
  const byDay = useMemo(() => {
    const map = new Map<string, TaskWithEffectiveStatus[]>();
    for (const t of scoped) {
      const k = dayKey(t.due_date);
      if (!k) continue;
      const arr = map.get(k);
      if (arr) arr.push(t);
      else map.set(k, [t]);
    }
    return map;
  }, [scoped]);

  /** 완료계획일정이 없어 달력에 못 올라가는 업무 — 빠뜨리지 않도록 따로 본다 */
  const noDate = useMemo(() => scoped.filter((t) => !dayKey(t.due_date)), [scoped]);

  const nameOf = (id: string | null) => profiles.find((p) => p.id === id)?.name ?? "미지정";

  const monthLabel = `${cursor.year}년 ${cursor.month}월`;

  if (loading) {
    return <p className="text-sm text-gray-400">불러오는 중...</p>;
  }

  return (
    <div className="space-y-4">
      <PrintHeader
        title={`업무 달력 — ${monthLabel}`}
        subtitle={
          viewingAs
            ? `${viewingAs.name} 님 / 기준: 완료계획일정`
            : isLead
              ? "팀 전체 / 기준: 완료계획일정"
              : `${me?.name ?? ""} / 기준: 완료계획일정`
        }
      />

      {viewingAs && (
        <ViewAsBanner
          current={viewingAs}
          members={profiles.filter(isAssignable)}
          unconfirmed={
            tasks.filter(
              (t) =>
                t.assignee_id === viewingAs.id &&
                !t.confirmed_at &&
                t.effective_status !== "완료"
            ).length
          }
          basePath="/calendar"
        />
      )}

      <div className="no-print flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-gray-900">업무 달력</h1>
          <p className="text-sm text-gray-500 mt-0.5 break-keep">
            완료계획일정을 기준으로 봅니다. 날짜를 누르면 그날 할 일이 모두 보입니다.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1.5 text-xs text-gray-500 cursor-pointer">
            <input
              type="checkbox"
              checked={hideDone}
              onChange={(e) => setHideDone(e.target.checked)}
              className="w-4 h-4"
            />
            완료 숨기기
          </label>
          <PrintButton />
        </div>
      </div>

      {/* 보기 전환 + 달 이동 */}
      <div className="no-print flex items-center justify-between gap-2 flex-wrap">
        <div className="inline-flex rounded-lg border border-gray-300 overflow-hidden">
          <button
            onClick={() => setTab("month")}
            className={cn(
              "px-3 py-1.5 text-sm font-medium",
              tab === "month" ? "bg-blue-600 text-white" : "bg-white text-gray-600 hover:bg-gray-50"
            )}
          >
            월 달력
          </button>
          <button
            onClick={() => setTab("timeline")}
            className={cn(
              "px-3 py-1.5 text-sm font-medium border-l border-gray-300",
              tab === "timeline"
                ? "bg-blue-600 text-white"
                : "bg-white text-gray-600 hover:bg-gray-50"
            )}
          >
            타임라인
          </button>
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={() => setCursor(shiftMonth(cursor.year, cursor.month, -1))}
            className="px-2.5 py-1.5 text-sm rounded border border-gray-300 text-gray-600 hover:bg-gray-50"
            title="지난 달"
          >
            ‹
          </button>
          <span className="px-2 text-sm font-semibold text-gray-800 min-w-[6.5rem] text-center">
            {monthLabel}
          </span>
          <button
            onClick={() => setCursor(shiftMonth(cursor.year, cursor.month, 1))}
            className="px-2.5 py-1.5 text-sm rounded border border-gray-300 text-gray-600 hover:bg-gray-50"
            title="다음 달"
          >
            ›
          </button>
          <button
            onClick={() =>
              setCursor({ year: Number(today.slice(0, 4)), month: Number(today.slice(5, 7)) })
            }
            className="ml-1 px-2.5 py-1.5 text-sm rounded border border-gray-300 text-gray-600 hover:bg-gray-50"
          >
            이번 달
          </button>
        </div>
      </div>

      {tab === "month" ? (
        <MonthView
          year={cursor.year}
          month={cursor.month}
          today={today}
          byDay={byDay}
          nameOf={nameOf}
          onPickDay={setOpenDay}
        />
      ) : (
        <TimelineView
          year={cursor.year}
          month={cursor.month}
          today={today}
          tasks={scoped}
          profiles={profiles}
          showEveryone={isLead && !viewingAs}
          subjectId={viewingAs?.id ?? me?.id ?? null}
          onPick={setDetailId}
        />
      )}

      <CalendarLegend />

      {/* 계획일이 없는 업무 — 달력에 자리가 없으니 여기서 챙긴다 */}
      {noDate.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
          <p className="text-sm font-semibold text-amber-800">
            완료계획일정이 없는 업무 {noDate.length}건
          </p>
          <p className="text-xs text-amber-700 mt-0.5 break-keep">
            날짜가 없어 달력에 올라가지 않습니다. 업무관리에서 완료계획일정을 넣어주세요.
          </p>
          <ul className="mt-2 space-y-1">
            {noDate.map((t) => (
              <li key={t.id}>
                <button
                  onClick={() => setDetailId(t.id)}
                  className="text-left text-sm text-amber-900 hover:underline break-keep"
                >
                  · {t.title}
                  <span className="text-amber-700"> ({nameOf(t.assignee_id)})</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* 날짜 하나를 눌렀을 때 — 그날 할 일 전부 */}
      {openDay && (
        <DayPanel
          day={openDay}
          list={byDay.get(openDay) ?? []}
          nameOf={nameOf}
          onClose={() => setOpenDay(null)}
          onPick={(id) => {
            setOpenDay(null);
            setDetailId(id);
          }}
        />
      )}

      {detailId && (
        <TaskEditModal
          taskId={detailId}
          onClose={() => setDetailId(null)}
          onChanged={load}
        />
      )}
    </div>
  );
}

