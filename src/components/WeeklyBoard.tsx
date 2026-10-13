"use client";

import type { WeeklyPerson, WeeklyRow } from "@/lib/weekly";
import type { Week } from "@/lib/week";
import { cn, formatShortDate } from "@/lib/utils";

/**
 * 주간 표 — 사람별로 묶어 한 줄에 한 업무.
 *
 * 숫자 하나로 달성률을 찍지 않는다. 완료·진행중·지연 세 칸으로 둔다.
 * 지연을 빨갛게 크게 띄우지 않는다 — 옆에 그 주 진행기록이 같이 붙어서,
 * 숫자보다 "무슨 일이 있었나"가 먼저 읽히게 한다.
 */
export default function WeeklyBoard({
  people,
  week,
  onPick,
  emptyText,
  big = false,
}: {
  people: WeeklyPerson[];
  week: Week;
  onPick?: (taskId: string) => void;
  emptyText?: string;
  /** 회의 모드 — 글자를 키운다 */
  big?: boolean;
}) {
  if (people.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-gray-300 px-4 py-10 text-center text-sm text-gray-400">
        {emptyText ?? "표시할 내용이 없습니다."}
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {people.map((p) => (
        <PersonBlock key={p.profile.id} person={p} week={week} onPick={onPick} big={big} />
      ))}
    </div>
  );
}

export function PersonBlock({
  person,
  week,
  onPick,
  big = false,
}: {
  person: WeeklyPerson;
  week: Week;
  onPick?: (taskId: string) => void;
  big?: boolean;
}) {
  const p = person.profile;

  return (
    <section
      className={cn(
        "rounded-xl border border-gray-200 bg-white overflow-hidden print-block",
        big && "rounded-2xl"
      )}
    >
      <header
        className={cn(
          "flex items-baseline gap-2 flex-wrap border-b border-gray-100 bg-gray-50",
          big ? "px-6 py-4" : "px-4 py-2.5"
        )}
      >
        {person.groupName && (
          <span className={cn("text-gray-400", big ? "text-xl" : "text-xs")}>
            {person.groupName}
          </span>
        )}
        <span className={cn("font-bold text-gray-900", big ? "text-4xl" : "text-base")}>
          {p.name}
        </span>
        <span className={cn("text-gray-400", big ? "text-xl" : "text-xs")}>
          {[p.position, p.role === "그룹장" || p.role === "팀장" || p.role === "실장" ? p.role : null]
            .filter(Boolean)
            .join(" · ")}
        </span>
        <span className="flex-1" />
        <span className={cn("flex items-center gap-3", big ? "text-2xl" : "text-xs")}>
          <Tally label="완료" n={person.done} className="text-emerald-700" big={big} />
          <Tally label="진행중" n={person.running} className="text-blue-700" big={big} />
          <Tally label="지연" n={person.late} className="text-amber-700" big={big} />
        </span>
      </header>

      <ul className="divide-y divide-gray-100">
        {person.rows.map((r) => (
          <TaskRow key={r.task.id} row={r} onPick={onPick} big={big} />
        ))}
        {person.rows.length === 0 && (
          <li className={cn("text-gray-400", big ? "px-6 py-6 text-2xl" : "px-4 py-4 text-sm")}>
            이번 주에 걸린 업무가 없습니다.
          </li>
        )}
      </ul>

      {person.next.length > 0 && (
        <div
          className={cn(
            "border-t border-gray-100 bg-gray-50/60",
            big ? "px-6 py-4" : "px-4 py-2.5"
          )}
        >
          <p className={cn("text-gray-400 mb-1", big ? "text-xl" : "text-xs")}>차주</p>
          <ul className={cn("space-y-0.5", big ? "text-2xl" : "text-sm")}>
            {person.next.map((t) => (
              <li key={t.id} className="text-gray-600 break-keep">
                · {t.title}
                {t.due_date && (
                  <span className="text-gray-400"> ({formatShortDate(t.due_date)})</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

function TaskRow({
  row,
  onPick,
  big,
}: {
  row: WeeklyRow;
  onPick?: (taskId: string) => void;
  big: boolean;
}) {
  const t = row.task;
  const status = t.effective_status;

  return (
    <li className={cn(big ? "px-6 py-4" : "px-4 py-2.5")}>
      <div className="flex items-start gap-3 flex-wrap">
        <button
          type="button"
          onClick={() => onPick?.(t.id)}
          disabled={!onPick}
          className={cn(
            "min-w-0 flex-1 text-left break-keep",
            onPick && "hover:text-blue-700",
            big ? "text-3xl leading-snug" : "text-sm",
            status === "완료" ? "text-gray-400" : "text-gray-900"
          )}
        >
          {t.title}
          {row.carried && (
            <span className={cn("text-gray-400 ml-2", big ? "text-xl" : "text-xs")}>이월</span>
          )}
        </button>

        <span
          className={cn(
            "shrink-0 whitespace-nowrap",
            big ? "text-2xl" : "text-xs",
            status === "완료"
              ? "text-emerald-700"
              : status === "지연"
                ? "text-amber-700"
                : "text-gray-500"
          )}
        >
          {status === "완료"
            ? `완료 ${formatShortDate(t.completed_at)}`
            : status === "지연"
              ? `지연 ${t.overdue_days}일`
              : `진행 ${t.progress}%`}
          {t.due_date && status !== "완료" && (
            <span className="text-gray-400"> · 기한 {formatShortDate(t.due_date)}</span>
          )}
        </span>
      </div>

      {/* 그 주에 쓴 진행기록 — 숫자보다 이게 먼저 읽혀야 한다 */}
      {row.notes.length > 0 && (
        <ul className={cn("mt-1 space-y-0.5", big ? "text-2xl" : "text-xs")}>
          {row.notes.map((n) => (
            <li key={n.id} className="text-gray-500 break-keep whitespace-pre-wrap">
              — {n.content}
            </li>
          ))}
        </ul>
      )}
      {row.notes.length === 0 && status !== "완료" && (
        <p className={cn("mt-1 text-gray-300", big ? "text-xl" : "text-xs")}>
          이번 주 진행기록 없음
        </p>
      )}
    </li>
  );
}

function Tally({
  label,
  n,
  className,
  big,
}: {
  label: string;
  n: number;
  className?: string;
  big: boolean;
}) {
  return (
    <span className={cn(n === 0 ? "text-gray-300" : className)}>
      {label} <span className={cn("font-bold", big && "text-3xl")}>{n}</span>
    </span>
  );
}
