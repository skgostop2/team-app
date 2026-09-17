"use client";

import { useMemo, useState } from "react";
import type { EvaluationCriterion, Profile, TaskWithEffectiveStatus } from "@/lib/types";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";

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
  criteria: initialCriteria,
}: {
  members: Profile[];
  tasks: TaskWithEffectiveStatus[];
  criteria: EvaluationCriterion[];
}) {
  const [criteria, setCriteria] = useState<EvaluationCriterion[]>(initialCriteria);
  const [showCriteria, setShowCriteria] = useState(false);
  const [months, setMonths] = useState<number>(3);
  const [draftFor, setDraftFor] = useState<string | null>(null);

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

  // 팀 평균 — 개인 수치를 팀과 견주어 보기 위한 기준값
  const teamAvg = useMemo(() => {
    const withRate = rows.filter((r) => r.onTimeRate != null);
    const withElapsed = rows.filter((r) => r.avgElapsed != null);
    return {
      onTimeRate: withRate.length
        ? Math.round(withRate.reduce((s, r) => s + (r.onTimeRate ?? 0), 0) / withRate.length)
        : null,
      elapsed: withElapsed.length
        ? Math.round((withElapsed.reduce((s, r) => s + (r.avgElapsed ?? 0), 0) / withElapsed.length) * 10) / 10
        : null,
      completionRate: rows.length
        ? Math.round(rows.reduce((s, r) => s + r.completionRate, 0) / rows.length)
        : 0,
    };
  }, [rows]);

  const label = months === 0 ? "전체 기간" : `최근 ${months}개월`;
  const periodText = (() => {
    if (!from) return "전체 기간";
    const f = from;
    const t = new Date();
    const fmt = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    return `${fmt(f)} ~ ${fmt(t)}`;
  })();

  const activeCriteria = criteria
    .filter((c) => c.enabled && c.metric_key && c.target != null && c.comparator)
    .sort((a, b) => a.sort_order - b.sort_order);

  async function saveTarget(id: string, target: number) {
    setCriteria((prev) => prev.map((c) => (c.id === id ? { ...c, target } : c)));
    const supabase = createClient();
    await supabase
      .from("evaluation_criteria")
      .update({ target, updated_at: new Date().toISOString() })
      .eq("id", id);
  }

  const draftRow = rows.find((r) => r.profile.id === draftFor);

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

      <div className="px-4 py-2 border-b border-gray-100 bg-gray-50 flex items-center justify-between gap-3 flex-wrap">
        <p className="text-xs text-gray-600">
          <strong>평가 기준</strong>{" "}
          {activeCriteria.map((c) => (
            <span key={c.id} className="mr-2 whitespace-nowrap">
              {c.name} {c.comparator === "gte" ? "≥" : "≤"} {c.target}
              {c.unit}
            </span>
          ))}
        </p>
        <button
          onClick={() => setShowCriteria((v) => !v)}
          className="text-xs px-2.5 py-1.5 rounded-lg border border-gray-300 text-gray-600 hover:bg-white"
        >
          {showCriteria ? "닫기" : "기준 고치기"}
        </button>
      </div>

      {showCriteria && (
        <div className="px-4 py-3 border-b border-gray-100 bg-white space-y-2">
          <p className="text-xs text-gray-500">
            기준값을 바꾸면 아래 충족/미달 판정이 바로 다시 계산됩니다.
          </p>
          {activeCriteria.map((c) => (
            <div key={c.id} className="flex items-center gap-2 flex-wrap">
              <span className="text-sm text-gray-700 w-32">{c.name}</span>
              <span className="text-sm text-gray-400">
                {c.comparator === "gte" ? "이상이면 충족" : "이하면 충족"}
              </span>
              <input
                type="number"
                value={c.target ?? 0}
                onChange={(e) => saveTarget(c.id, Number(e.target.value))}
                className="w-24 rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
              />
              <span className="text-sm text-gray-500">{c.unit}</span>
              {c.description && (
                <span className="text-xs text-gray-400 break-keep">{c.description}</span>
              )}
            </div>
          ))}
        </div>
      )}

      <p className="px-4 py-2 text-xs text-gray-500 border-b border-gray-100 bg-gray-50">
        {label} · 소요일은 <strong>지시일부터 완료까지</strong>, 일정 준수는{" "}
        <strong>완료계획일 기준</strong>으로 계산합니다. 완료계획일이 없는 업무는 준수 판정에서
        제외됩니다.
      </p>

      <div className="overflow-x-auto print-table">
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
              <Th className="w-28 text-center">기준 충족</Th>
              <Th className="w-24 text-center">보고서</Th>
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

                <Td className="text-center">
                  <CriteriaResult row={r} criteria={activeCriteria} />
                </Td>

                <Td className="text-center">
                  <button
                    onClick={() => setDraftFor(r.profile.id)}
                    className="text-xs px-2.5 py-1.5 rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50 whitespace-nowrap"
                  >
                    초안 보기
                  </button>
                </Td>
              </tr>
            ))}

            {rows.length === 0 && (
              <tr>
                <td colSpan={11} className="px-4 py-10 text-center text-gray-400">
                  등록된 팀원이 없습니다.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {draftRow && (
        <DraftModal
          row={draftRow}
          teamAvg={teamAvg}
          criteria={activeCriteria}
          periodLabel={label}
          periodText={periodText}
          onClose={() => setDraftFor(null)}
        />
      )}
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


/** 지표 키에 해당하는 실제 값을 꺼낸다. 산출할 수 없으면 null. */
function metricValue(r: Row, key: string): number | null {
  switch (key) {
    case "completion_rate":
      return r.total ? r.completionRate : null;
    case "on_time_rate":
      return r.onTimeRate;
    case "avg_overdue":
      return r.judged ? r.avgOverdue : null;
    case "delayed_now":
      return r.delayedNow;
    default:
      return null;
  }
}

type Judged = {
  criterion: EvaluationCriterion;
  value: number | null;
  met: boolean | null;
};

/** 기준 대비 충족 여부. 사람에 대한 판단이 아니라 정해둔 기준에 닿았는지만 본다. */
function judge(r: Row, criteria: EvaluationCriterion[]): Judged[] {
  return criteria.map((c) => {
    const value = metricValue(r, c.metric_key!);
    if (value == null || c.target == null) return { criterion: c, value, met: null };
    const met = c.comparator === "gte" ? value >= c.target : value <= c.target;
    return { criterion: c, value, met };
  });
}

function CriteriaResult({ row, criteria }: { row: Row; criteria: EvaluationCriterion[] }) {
  const results = judge(row, criteria);
  const judgedOnes = results.filter((x) => x.met !== null);
  if (judgedOnes.length === 0) return <span className="text-gray-300">—</span>;
  const met = judgedOnes.filter((x) => x.met).length;
  const all = judgedOnes.length;

  return (
    <div>
      <span
        className={cn(
          "font-semibold",
          met === all ? "text-emerald-600" : met >= all / 2 ? "text-amber-600" : "text-red-600"
        )}
      >
        {met}/{all} 충족
      </span>
      <span className="block text-[11px] text-gray-400 break-keep">
        {judgedOnes
          .filter((x) => !x.met)
          .map((x) => x.criterion.name)
          .join(", ") || "전 항목 충족"}
      </span>
    </div>
  );
}

type Row = {
  profile: Profile;
  total: number;
  done: number;
  open: number;
  completionRate: number;
  avgElapsed: number | null;
  judged: number;
  onTime: number;
  onTimeRate: number | null;
  lateCount: number;
  avgOverdue: number;
  delayedNow: number;
  maxOverdueNow: number;
};

type TeamAvg = {
  onTimeRate: number | null;
  elapsed: number | null;
  completionRate: number;
};

/**
 * 평가 참고자료 초안을 만든다.
 *
 * 의도적으로 "사실"만 적는다. 성실/미흡 같은 사람에 대한 판단 문구는 넣지 않는다.
 * 고과는 사람의 급여와 승진이 걸린 일이라, 판단은 팀장이 직접 내려야 한다.
 */
function buildDraft(
  r: Row,
  team: TeamAvg,
  criteria: EvaluationCriterion[],
  periodLabel: string,
  periodText: string
): string {
  const name = `${r.profile.name}${r.profile.position ? ` ${r.profile.position}` : ""}`;
  const L: string[] = [];

  L.push(`고과평가 참고자료 — ${name}`);
  L.push(`평가기간: ${periodLabel} (${periodText})`);
  L.push(`작성일: ${new Date().toLocaleDateString("ko-KR")}`);
  L.push("");
  L.push("1. 업무 수행량");
  if (r.total === 0) {
    L.push("   해당 기간에 배정된 업무가 없습니다.");
    L.push("");
    L.push("※ 아래 종합의견은 팀장이 직접 작성하십시오.");
    L.push("");
    L.push("종합의견:");
    L.push("");
    return L.join("\n");
  }

  L.push(`   배정 ${r.total}건, 완료 ${r.done}건, 진행 중 ${r.open}건 (완료율 ${r.completionRate}%)`);
  const cmpDone = r.completionRate - team.completionRate;
  L.push(
    `   팀 평균 완료율 ${team.completionRate}% 대비 ${
      cmpDone === 0 ? "동일" : cmpDone > 0 ? `${cmpDone}%p 높음` : `${-cmpDone}%p 낮음`
    }`
  );
  L.push("");

  L.push("2. 일정 준수");
  if (r.onTimeRate == null) {
    L.push("   완료계획일이 지정된 완료 업무가 없어 준수율을 산출하지 않았습니다.");
  } else {
    L.push(
      `   완료계획일이 있는 ${r.judged}건 중 ${r.onTime}건을 기한 내 완료 (${r.onTimeRate}%)`
    );
    if (team.onTimeRate != null) {
      const cmp = r.onTimeRate - team.onTimeRate;
      L.push(
        `   팀 평균 ${team.onTimeRate}% 대비 ${
          cmp === 0 ? "동일" : cmp > 0 ? `${cmp}%p 높음` : `${-cmp}%p 낮음`
        }`
      );
    }
    if (r.lateCount > 0) {
      L.push(`   기한 초과 ${r.lateCount}건, 평균 ${r.avgOverdue}일 초과`);
    } else {
      L.push("   기한을 넘긴 건 없음");
    }
  }
  L.push("");

  L.push("3. 소요 기간");
  if (r.avgElapsed == null) {
    L.push("   완료한 업무가 없어 산출하지 않았습니다.");
  } else {
    L.push(`   완료 업무 평균 소요 ${r.avgElapsed}일 (지시일부터 완료일까지)`);
    if (team.elapsed != null) {
      const diff = Math.round((r.avgElapsed - team.elapsed) * 10) / 10;
      L.push(
        `   팀 평균 ${team.elapsed}일 대비 ${
          diff === 0 ? "동일" : diff > 0 ? `${diff}일 김` : `${-diff}일 짧음`
        }`
      );
    }
  }
  L.push("");

  L.push("4. 현재 상태");
  if (r.delayedNow > 0) {
    L.push(`   진행 중 ${r.open}건 중 ${r.delayedNow}건이 완료계획일을 넘긴 상태`);
    L.push(`   가장 오래 넘긴 건은 ${r.maxOverdueNow}일 초과`);
  } else {
    L.push(`   진행 중 ${r.open}건, 완료계획일을 넘긴 건 없음`);
  }
  L.push("");

  // 5. 평가기준 대비 결과 — 정해둔 기준에 닿았는지만 표시한다
  const results = judge(r, criteria).filter((x) => x.met !== null);
  if (results.length > 0) {
    L.push("5. 평가기준 대비 결과");
    for (const x of results) {
      const c = x.criterion;
      const sign = c.comparator === "gte" ? "이상" : "이하";
      L.push(
        `   ${c.name}: 기준 ${c.target}${c.unit} ${sign} / 실적 ${x.value}${c.unit} → ${
          x.met ? "충족" : "미달"
        }`
      );
    }
    const met = results.filter((x) => x.met).length;
    L.push(`   충족 ${met}/${results.length}항목`);
    L.push("");
  }

  L.push("※ 위 수치는 업무관리 시스템 기록에서 자동 산출한 것입니다.");
  L.push("   업무의 난이도, 중요도, 돌발업무 대응, 협업 기여 등은 수치에 담기지 않습니다.");
  L.push("   종합의견은 팀장이 직접 작성하십시오.");
  L.push("");
  L.push("종합의견:");
  L.push("");

  return L.join("\n");
}

function DraftModal({
  row,
  teamAvg,
  criteria,
  periodLabel,
  periodText,
  onClose,
}: {
  row: Row;
  teamAvg: TeamAvg;
  criteria: EvaluationCriterion[];
  periodLabel: string;
  periodText: string;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const text = useMemo(
    () => buildDraft(row, teamAvg, criteria, periodLabel, periodText),
    [row, teamAvg, criteria, periodLabel, periodText]
  );

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="no-print fixed inset-0 z-40 bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-2xl rounded-2xl p-6 max-h-[90dvh] flex flex-col">
        <div className="flex items-start justify-between gap-3 mb-1">
          <h2 className="text-lg font-bold text-gray-900">
            {row.profile.name}
            {row.profile.position ? ` ${row.profile.position}` : ""} — 평가 참고자료
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-xl leading-none">
            ×
          </button>
        </div>
        <p className="text-xs text-gray-500 mb-3">
          수치는 자동으로 뽑았습니다. <strong>종합의견은 직접 쓰십시오</strong> — 난이도·돌발업무·협업
          기여는 수치에 안 잡힙니다.
        </p>

        <textarea
          readOnly
          value={text}
          className="flex-1 min-h-[320px] w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm font-mono leading-relaxed bg-gray-50"
        />

        <div className="flex gap-2 pt-3">
          <button
            onClick={onClose}
            className="flex-1 rounded-lg border border-gray-300 py-2.5 font-medium text-gray-600 hover:bg-gray-50"
          >
            닫기
          </button>
          <button
            onClick={copy}
            className="flex-1 rounded-lg bg-blue-600 text-white py-2.5 font-medium hover:bg-blue-700"
          >
            {copied ? "복사했습니다" : "복사하기"}
          </button>
        </div>
      </div>
    </div>
  );
}
