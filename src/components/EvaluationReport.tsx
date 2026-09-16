"use client";

import { useMemo, useState } from "react";
import type { Profile, TaskWithEffectiveStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * 고과평가용 실적 집계.
 *
 * 업무 기록에서 자동으로 뽑는 객관적 수치만 다룬다.
 * - 소요일: 지시일(작성일)부터 완료까지 며칠 걸렸나
 * - 일정 준수: 완료계획일 안에 끝냈나, 넘겼다면 며칠 넘겼나
 */
export default function EvaluationReport({
  members,
  tasks,
}: {
  members: Profile[];
  tasks: TaskWithEffectiveStatus[];
}) {
  const [months, setMonths] = useState<number>(3);

  const from = useMemo(() => {
    if (months === 0) return null;
    const d = new Date();
    d.setMonth(d.getMonth() - months);
    return d;
  }, [months]);

  const rows = useMemo(() => {
    const inRange = from
      ? tasks.filter((t) => new Date(t.created_at) >= from)
      : tasks;

    return members.map((p) => {
      const mine = inRange.filter(
        (t) => t.assignee_id === p.id || (t.deputy_ids ?? []).includes(p.id)
      );
      const done = mine.filter((t) => t.effective_status === "완료");
      const open = mine.filter((t) => t.effective_status !== "완료");

      // 완료한 업무의 실제 소요일수 평균
      const avgElapsed = done.length
        ? Math.round((done.reduce((s, t) => s + (t.elapsed_days ?? 0), 0) / done.length) * 10) / 10
        : null;

      // 완료계획일이 있는 완료 업무만 일정 준수 판정에 쓴다
      const judged = done.filter((t) => t.on_time !== null);
      const onTime = judged.filter((t) => t.on_time === true).length;
      const onTimeRate = judged.length ? Math.round((onTime / judged.length) * 100) : null;

      // 넘긴 건들의 평균 초과일수
      const late = judged.filter((t) => (t.overdue_days ?? 0) > 0);
      const avgOverdue = late.length
        ? Math.round((late.reduce((s, t) => s + (t.overdue_days ?? 0), 0) / late.length) * 10) / 10
        : 0;

      // 지금 기한을 넘긴 채 진행 중인 건
      const delayedNow = open.filter((t) => t.effective_status === "지연");
      const maxOverdueNow = delayedNow.length
        ? Math.max(...delayedNow.map((t) => t.overdue_days ?? 0))
        : 0;

      return {
        profile: p,
        total: mine.length,
        done: done.length,
        open: open.length,
        completionRate: mine.length ? Math.round((done.length / mine.length) * 100) : 0,
        avgElapsed,
        judged: judged.length,
        onTime,
        onTimeRate,
        lateCount: late.length,
        avgOverdue,
        delayedNow: delayedNow.length,
        maxOverdueNow,
      };
    });
  }, [members, tasks, from]);

  const label = months === 0 ? "전체 기간" : `최근 ${months}개월`;

  return (
    <div className="bg-white rounded-xl border border-gray-200">
      <div className="flex items-baseline justify-between gap-3 px-4 py-3 border-b border-gray-200 flex-wrap">
        <h2 className="text-base font-bold text-gray-900">팀원별 업무 실적</h2>
        <div className="flex items-center gap-1">
          {[1, 3, 6, 12, 0].map((m) => (
            <button
              key={m}
              onClick={() => setMonths(m)}
              className={cn(
                "text-xs px-2.5 py-1.5 rounded-lg border",
                months === m
                  ? "bg-gray-900 text-white border-gray-900"
                  : "border-gray-300 text-gray-600 hover:bg-gray-50"
              )}
            >
              {m === 0 ? "전체" : `${m}개월`}
            </button>
          ))}
        </div>
      </div>

      <p className="px-4 py-2 text-xs text-gray-500 border-b border-gray-100 bg-gray-50">
        {label} · 소요일은 <strong>지시일부터 완료까지</strong>, 일정 준수는{" "}
        <strong>완료계획일 기준</strong>으로 계산합니다. 완료계획일이 없는 업무는 준수 판정에서
        제외됩니다.
      </p>

      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse min-w-[940px] table-fixed">
          <thead>
            <tr className="bg-blue-50 text-gray-700 text-xs">
              <Th className="w-36">이름</Th>
              <Th className="w-16 text-center">전체</Th>
              <Th className="w-16 text-center">완료</Th>
              <Th className="w-20 text-center">완료율</Th>
              <Th className="w-24 text-center">평균 소요일</Th>
              <Th className="w-28 text-center">기한 내 완료</Th>
              <Th className="w-20 text-center">초과 건수</Th>
              <Th className="w-24 text-center">평균 초과일</Th>
              <Th className="w-28 text-center">현재 지연</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.profile.id} className="border-b border-gray-200 last:border-0 hover:bg-gray-50">
                <Td>
                  <span className="font-medium text-gray-900 break-keep">{r.profile.name}</span>
                  {r.profile.position && (
                    <span className="text-xs text-gray-400"> {r.profile.position}</span>
                  )}
                </Td>
                <Td className="text-center text-gray-600">{r.total}</Td>
                <Td className="text-center text-gray-600">{r.done}</Td>
                <Td className="text-center font-semibold text-emerald-600">{r.completionRate}%</Td>

                <Td className="text-center text-gray-700">
                  {r.avgElapsed != null ? `${r.avgElapsed}일` : <span className="text-gray-300">—</span>}
                </Td>

                <Td className="text-center">
                  {r.onTimeRate != null ? (
                    <>
                      <span
                        className={cn(
                          "font-semibold",
                          r.onTimeRate >= 90
                            ? "text-emerald-600"
                            : r.onTimeRate >= 70
                              ? "text-amber-600"
                              : "text-red-600"
                        )}
                      >
                        {r.onTimeRate}%
                      </span>
                      <span className="block text-[11px] text-gray-400">
                        {r.onTime}/{r.judged}건
                      </span>
                    </>
                  ) : (
                    <span className="text-gray-300">—</span>
                  )}
                </Td>

                <Td className={cn("text-center", r.lateCount > 0 ? "text-red-600 font-semibold" : "text-gray-400")}>
                  {r.lateCount}
                </Td>

                <Td className={cn("text-center", r.avgOverdue > 0 ? "text-red-600" : "text-gray-400")}>
                  {r.avgOverdue > 0 ? `${r.avgOverdue}일` : "—"}
                </Td>

                <Td className="text-center">
                  {r.delayedNow > 0 ? (
                    <>
                      <span className="text-red-600 font-semibold">{r.delayedNow}건</span>
                      <span className="block text-[11px] text-red-500">
                        최대 {r.maxOverdueNow}일 초과
                      </span>
                    </>
                  ) : (
                    <span className="text-gray-400">없음</span>
                  )}
                </Td>
              </tr>
            ))}

            {rows.length === 0 && (
              <tr>
                <td colSpan={9} className="px-4 py-10 text-center text-gray-400">
                  등록된 팀원이 없습니다.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Th({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <th
      className={cn(
        "px-3 py-2.5 font-medium text-left border-b border-gray-300 border-r border-gray-200 last:border-r-0",
        className
      )}
    >
      {children}
    </th>
  );
}

function Td({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <td className={cn("px-3 py-2.5 align-top border-r border-gray-100 last:border-r-0", className)}>
      {children}
    </td>
  );
}
