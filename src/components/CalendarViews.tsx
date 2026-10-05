"use client";

import { useMemo } from "react";
import Link from "next/link";
import type { Profile, TaskWithEffectiveStatus } from "@/lib/types";
import { isAssignable, byDisplayOrder } from "@/lib/roles";
import { cn, formatShortDate } from "@/lib/utils";
import {
  WEEKDAY_LABELS,
  dayKey,
  dayNumber,
  inMonth,
  isWeekend,
  monthDays,
  monthGrid,
  weekdayColor,
} from "@/lib/calendar";
import StatusBadge from "@/components/StatusBadge";

/**
 * 달력 그림 세 가지 — 월 격자, 사람×날짜 막대, 날짜를 누르면 뜨는 목록.
 *
 * 화면 데이터와 떼어 두었다. 칸이 겹치거나 글자가 잘리는 일이 잦아서
 * 샘플 데이터만 넣고 따로 그려 눈으로 확인할 수 있어야 했다.
 */

/** 상태별 색 (StatusBadge 와 같은 계열로 맞춘다) */
const DOT: Record<string, string> = {
  대기: "bg-gray-300",
  진행중: "bg-blue-500",
  완료: "bg-emerald-500",
  지연: "bg-red-500",
};
const BAR: Record<string, string> = {
  대기: "bg-gray-300 text-gray-700",
  진행중: "bg-blue-500 text-white",
  완료: "bg-emerald-500 text-white",
  지연: "bg-red-500 text-white",
};

/** 색이 무슨 뜻인지 — 달력 밑에 붙인다 */
export function CalendarLegend() {
  return (
    <div className="flex items-center gap-3 flex-wrap text-xs text-gray-500">
      {(["대기", "진행중", "완료", "지연"] as const).map((s) => (
        <span key={s} className="inline-flex items-center gap-1.5">
          <span className={cn("w-2.5 h-2.5 rounded-full", DOT[s])} />
          {s}
        </span>
      ))}
      <span className="text-gray-400">· 날짜를 누르면 그날 할 일이 모두 보입니다</span>
    </div>
  );
}

/** 월 달력 격자 */
export function MonthView({
  year,
  month,
  today,
  byDay,
  nameOf,
  onPickDay,
}: {
  year: number;
  month: number;
  today: string;
  byDay: Map<string, TaskWithEffectiveStatus[]>;
  nameOf: (id: string | null) => string;
  onPickDay: (day: string) => void;
}) {
  const cells = monthGrid(year, month);

  // 한 칸에 다 못 넣으므로 세 건까지 보이고 나머지는 "+n건"
  const SHOWN = 3;

  return (
    <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
      <div className="grid grid-cols-7 border-b border-gray-200 bg-gray-50">
        {WEEKDAY_LABELS.map((w, i) => (
          <div
            key={w}
            className={cn(
              "px-2 py-1.5 text-center text-xs font-semibold",
              i === 0 ? "text-red-500" : i === 6 ? "text-blue-500" : "text-gray-500"
            )}
          >
            {w}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7">
        {cells.map((key, i) => {
          const here = inMonth(key, year, month);
          const list = byDay.get(key) ?? [];
          const isToday = key === today;

          return (
            <button
              key={key + i}
              onClick={() => list.length > 0 && onPickDay(key)}
              className={cn(
                "min-h-[5.5rem] border-b border-r border-gray-100 p-1.5 text-left align-top",
                i % 7 === 6 && "border-r-0",
                !here && "bg-gray-50/70",
                list.length > 0 && "hover:bg-blue-50/60 cursor-pointer",
                list.length === 0 && "cursor-default"
              )}
            >
              <div className="flex items-center justify-between">
                <span
                  className={cn(
                    "text-xs font-semibold",
                    !here
                      ? "text-gray-300"
                      : isToday
                        ? "inline-flex items-center justify-center w-5 h-5 rounded-full bg-blue-600 text-white"
                        : weekdayColor(key, true)
                  )}
                >
                  {dayNumber(key)}
                </span>
                {list.length > SHOWN && (
                  <span className="text-[10px] text-gray-400">{list.length}건</span>
                )}
              </div>

              <div className="mt-1 space-y-0.5">
                {list.slice(0, SHOWN).map((t) => (
                  <div
                    key={t.id}
                    title={`${t.title} — ${nameOf(t.assignee_id)} (${t.effective_status})`}
                    className="flex items-center gap-1"
                  >
                    <span
                      className={cn(
                        "shrink-0 w-1.5 h-1.5 rounded-full",
                        DOT[t.effective_status] ?? "bg-gray-300"
                      )}
                    />
                    <span
                      className={cn(
                        "min-w-0 flex-1 truncate text-[11px]",
                        t.effective_status === "완료"
                          ? "text-gray-400 line-through"
                          : t.effective_status === "지연"
                            ? "text-red-700"
                            : "text-gray-700"
                      )}
                    >
                      {t.title}
                    </span>
                  </div>
                ))}
                {list.length > SHOWN && (
                  <span className="block text-[10px] text-blue-600">
                    +{list.length - SHOWN}건 더
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** 사람 × 날짜 막대 — 진행일정부터 완료계획일정까지 */
export function TimelineView({
  year,
  month,
  today,
  tasks,
  profiles,
  showEveryone,
  subjectId,
  onPick,
}: {
  year: number;
  month: number;
  today: string;
  tasks: TaskWithEffectiveStatus[];
  profiles: Profile[];
  showEveryone: boolean;
  subjectId: string | null;
  onPick: (id: string) => void;
}) {
  const days = monthDays(year, month);
  const first = days[0];
  const last = days[days.length - 1];

  /** 줄로 세울 사람 */
  const people = useMemo(() => {
    if (!showEveryone) {
      const only = profiles.find((p) => p.id === subjectId);
      return only ? [only] : [];
    }
    return profiles.filter(isAssignable).sort(byDisplayOrder);
  }, [profiles, showEveryone, subjectId]);

  /**
   * 막대 위치. 시작은 진행일정, 끝은 완료계획일정.
   * 둘 중 하나만 있으면 그 하루만 칠한다 (없는 쪽을 추측하지 않는다).
   */
  function span(t: TaskWithEffectiveStatus): { from: string; to: string } | null {
    const s = dayKey(t.start_date);
    const e = dayKey(t.due_date);
    if (!s && !e) return null;
    const from = s ?? e!;
    const to = e ?? s!;
    if (to < first || from > last) return null; // 이 달과 안 겹친다
    return { from: from < first ? first : from, to: to > last ? last : to };
  }

  const colWidth = 28; // 하루 폭(px)

  return (
    <div className="rounded-xl border border-gray-200 bg-white overflow-x-auto">
      <div style={{ minWidth: 120 + days.length * colWidth }}>
        {/* 가로축 날짜 */}
        <div className="flex border-b border-gray-200 bg-gray-50 sticky top-0">
          <div className="shrink-0 w-[120px] px-2 py-1.5 text-xs font-semibold text-gray-500 border-r border-gray-200">
            담당자
          </div>
          {days.map((d) => (
            <div
              key={d}
              style={{ width: colWidth }}
              className={cn(
                "shrink-0 text-center text-[10px] py-1.5 border-r border-gray-100",
                d === today
                  ? "bg-blue-100 font-bold text-blue-700"
                  : cn(weekdayColor(d, true), isWeekend(d) && "bg-gray-50")
              )}
            >
              {dayNumber(d)}
            </div>
          ))}
        </div>

        {people.map((p) => {
          const mine = tasks.filter(
            (t) => t.assignee_id === p.id || (t.deputy_ids ?? []).includes(p.id)
          );
          const bars = mine
            .map((t) => ({ t, s: span(t) }))
            .filter((x) => x.s !== null) as {
            t: TaskWithEffectiveStatus;
            s: { from: string; to: string };
          }[];

          return (
            <div key={p.id} className="flex border-b border-gray-100 last:border-b-0">
              <div className="shrink-0 w-[120px] px-2 py-2 border-r border-gray-200">
                <span className="text-sm font-medium text-gray-800 break-keep">{p.name}</span>
                {p.position && <span className="text-xs text-gray-400"> {p.position}</span>}
                <span className="block text-[10px] text-gray-400">{bars.length}건</span>
              </div>

              <div className="relative flex-1 py-1.5">
                {/* 주말·오늘 세로줄 */}
                <div className="absolute inset-0 flex pointer-events-none">
                  {days.map((d) => (
                    <div
                      key={d}
                      style={{ width: colWidth }}
                      className={cn(
                        "shrink-0 border-r border-gray-100",
                        d === today ? "bg-blue-50" : isWeekend(d) ? "bg-gray-50/70" : ""
                      )}
                    />
                  ))}
                </div>

                <div className="relative space-y-0.5">
                  {bars.map(({ t, s }) => {
                    const i0 = days.indexOf(s.from);
                    const i1 = days.indexOf(s.to);
                    return (
                      <button
                        key={t.id}
                        onClick={() => onPick(t.id)}
                        title={`${t.title} — ${formatShortDate(t.start_date)} ~ ${formatShortDate(
                          t.due_date
                        )} (${t.effective_status})`}
                        style={{
                          marginLeft: i0 * colWidth,
                          width: Math.max(colWidth, (i1 - i0 + 1) * colWidth) - 2,
                        }}
                        className={cn(
                          "block h-5 rounded px-1.5 text-[10px] leading-5 truncate text-left",
                          BAR[t.effective_status] ?? "bg-gray-300 text-gray-700"
                        )}
                      >
                        {t.title}
                      </button>
                    );
                  })}
                  {bars.length === 0 && (
                    <span className="block h-5 pl-2 text-[11px] leading-5 text-gray-300">
                      이 달 일정 없음
                    </span>
                  )}
                </div>
              </div>
            </div>
          );
        })}

        {people.length === 0 && (
          <p className="px-4 py-10 text-center text-sm text-gray-400">표시할 담당자가 없습니다.</p>
        )}
      </div>
    </div>
  );
}

/** 날짜 하나를 눌렀을 때 뜨는 그날 할 일 */
export function DayPanel({
  day,
  list,
  nameOf,
  onClose,
  onPick,
}: {
  day: string;
  list: TaskWithEffectiveStatus[];
  nameOf: (id: string | null) => string;
  onClose: () => void;
  onPick: (id: string) => void;
}) {
  return (
    <div className="no-print fixed inset-0 z-50 bg-black/40 flex items-end md:items-center justify-center p-0 md:p-4">
      <div className="bg-white w-full md:max-w-lg rounded-t-2xl md:rounded-2xl p-5 max-h-[85dvh] overflow-y-auto">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h3 className="text-base font-bold text-gray-900">{formatShortDate(day)} 완료계획</h3>
            <p className="text-xs text-gray-500 mt-0.5">{list.length}건</p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-700 text-2xl leading-none px-1"
            title="닫기"
          >
            ×
          </button>
        </div>

        <ul className="mt-3 divide-y divide-gray-100">
          {list.map((t) => (
            <li key={t.id} className="py-2.5">
              <button onClick={() => onPick(t.id)} className="w-full text-left group">
                <div className="flex items-start justify-between gap-2">
                  <span className="text-sm font-medium text-gray-900 break-keep group-hover:text-blue-700">
                    {t.title}
                  </span>
                  <StatusBadge status={t.effective_status} />
                </div>
                <p className="text-xs text-gray-500 mt-0.5">
                  {nameOf(t.assignee_id)}
                  {t.progress != null && ` · 진행 ${t.progress}%`}
                  {t.effective_status === "지연" &&
                    t.overdue_days > 0 &&
                    ` · ${t.overdue_days}일 지남`}
                </p>
              </button>
            </li>
          ))}
        </ul>

        <Link
          href="/tasks"
          className="block mt-3 w-full rounded-lg border border-gray-300 py-2.5 text-center text-sm font-medium text-gray-600 hover:bg-gray-50"
        >
          업무관리에서 보기
        </Link>
      </div>
    </div>
  );
}
