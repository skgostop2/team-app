"use client";

import { useState } from "react";
import Link from "next/link";
import type { Profile, TaskWithEffectiveStatus } from "@/lib/types";
import { formatShortDate, formatIsoDate, cn } from "@/lib/utils";
import { isAssignable, byDisplayOrder } from "@/lib/roles";
import { createClient } from "@/lib/supabase/client";
import StatusBadge from "@/components/StatusBadge";

/**
 * 업무 진행 현황 — 메모 프로그램과 같은 대장(臺帳) 양식.
 * 한 건에 한 줄씩, 번호를 붙여 위에서 아래로 계속 쌓인다.
 *
 * NO. | 작성일 | 업무내용 | 진행일정 | 완료일 | 소요일 | 일정대비 | 담당자 | 지시자 | 진행률 | 상태 | 비고
 *
 * 담당자는 체크로 고른다. 여러 명 체크할 수 있다.
 */
export default function TaskLedger({
  tasks,
  profiles,
  title = "업무 진행 현황",
  showAssignee = true,
  emptyText = "등록된 업무가 없습니다.",
  canAssign = false,
  onAssigned,
  viewerId,
  handedOverIds,
}: {
  tasks: TaskWithEffectiveStatus[];
  profiles: Profile[];
  title?: string;
  showAssignee?: boolean;
  emptyText?: string;
  /** 팀장·실장이면 담당자 칸에서 바로 사람을 고를 수 있다 */
  canAssign?: boolean;
  onAssigned?: () => void;
  /** 보고 있는 사람 */
  viewerId?: string;
  /** 보고 있는 사람이 예전에 담당했다가 넘긴 업무 id 들 */
  handedOverIds?: Set<string>;
}) {
  const assignables = profiles.filter(isAssignable).sort(byDisplayOrder);

  const unassigned = tasks.filter((t) => !t.assignee_id).length;

  return (
    <div className="bg-white rounded-xl border border-gray-200">
      <div className="flex items-baseline justify-between gap-3 px-4 py-3 border-b border-gray-200 flex-wrap">
        <h2 className="text-base font-bold text-gray-900">{title}</h2>
        <p className="text-xs text-gray-400">
          출력일: {formatIsoDate(new Date().toISOString())} &nbsp;|&nbsp; 총 {tasks.length}건
          {canAssign && unassigned > 0 && (
            <span className="text-amber-600 font-medium"> · 담당자 미지정 {unassigned}건</span>
          )}
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse min-w-[1020px] table-fixed">
          <thead>
            <tr className="bg-blue-50 text-gray-700 text-xs">
              <Th className="w-14 text-center">NO.</Th>
              <Th className="w-28">작성일</Th>
              <Th className="w-auto min-w-[300px]">업무내용</Th>
              <Th className="w-24 text-center">진행일정</Th>
              <Th className="w-24 text-center">완료일</Th>
              <Th className="w-20 text-center">소요일</Th>
              <Th className="w-24 text-center">일정대비</Th>
              {showAssignee && <Th className="w-44">담당자</Th>}
              <Th className="w-24">지시자</Th>
              <Th className="w-28 text-center">진행률</Th>
              <Th className="w-20 text-center">상태</Th>
              <Th className="w-32">비고</Th>
            </tr>
          </thead>
          <tbody>
            {tasks.map((t, i) => {
              const assignee = profiles.find((p) => p.id === t.assignee_id);
              const deputies = (t.deputy_ids ?? [])
                .map((id) => profiles.find((p) => p.id === id))
                .filter(Boolean) as Profile[];
              const overdue = t.effective_status === "지연";
              // 내가 하던 업무인데 지금은 남이 담당 → 넘긴 업무 (실제 인계 기록이 있을 때만)
              const handedOver =
                !!viewerId &&
                !!handedOverIds?.has(t.id) &&
                t.assignee_id !== viewerId &&
                !(t.deputy_ids ?? []).includes(viewerId);
              return (
                <tr
                  key={t.id}
                  className={cn(
                    "border-b border-gray-200 last:border-0 hover:bg-gray-50",
                    handedOver && "bg-gray-50/60"
                  )}
                >
                  <Td className="text-center text-gray-500">{i + 1}</Td>
                  <Td className="text-gray-600 whitespace-nowrap">{formatIsoDate(t.created_at)}</Td>
                  <Td className="min-w-[300px]">
                    <Link
                      href={`/tasks/${t.id}`}
                      className="font-medium text-gray-900 hover:text-blue-600 break-keep"
                    >
                      {t.is_new && (
                        <span className="inline-block w-1.5 h-1.5 rounded-full bg-blue-500 mr-1.5 align-middle" />
                      )}
                      {t.title}
                    </Link>
                    {t.description && (
                      <span className="block text-xs text-gray-400 mt-0.5 line-clamp-1 break-keep">
                        {t.description}
                      </span>
                    )}
                    {handedOver && (
                      <span className="block text-[11px] text-gray-500 mt-1">
                        → {assignee?.name ?? "미지정"} 님에게 인계됨 (기록은 남아 있습니다)
                      </span>
                    )}
                  </Td>
                  <Td className={cn("text-center whitespace-nowrap", overdue ? "text-red-600 font-medium" : "text-gray-600")}>
                    {formatShortDate(t.due_date)}
                  </Td>
                  <Td className="text-center text-gray-600 whitespace-nowrap">
                    {formatShortDate(t.completed_at)}
                  </Td>

                  {/* 지시일로부터 걸린 일수 */}
                  <Td className="text-center text-gray-600 whitespace-nowrap">
                    {t.elapsed_days != null
                      ? t.effective_status === "완료"
                        ? `${t.elapsed_days}일`
                        : `${t.elapsed_days}일째`
                      : ""}
                  </Td>

                  {/* 완료계획일 대비 */}
                  <Td className="text-center whitespace-nowrap">
                    <ScheduleDiff task={t} />
                  </Td>
                  {showAssignee && (
                    <Td className="text-gray-600">
                      {canAssign ? (
                        <AssigneePicker
                          taskId={t.id}
                          current={t.assignee_id}
                          deputies={t.deputy_ids ?? []}
                          options={assignables}
                          fallback={assignee}
                          onDone={onAssigned}
                        />
                      ) : (
                        <>
                          {assignee || deputies.length > 0 ? (
                            <span className="block break-keep">
                              {[assignee, ...deputies]
                                .filter(Boolean)
                                .map((p) => (p as Profile).name)
                                .join(", ")}
                            </span>
                          ) : (
                            <span className="text-amber-600">미지정</span>
                          )}
                          {assignee?.status === "삭제" && (
                            <span className="block text-[11px] text-gray-400">(삭제된 계정)</span>
                          )}
                          {assignee?.status === "가입대기" && (
                            <span className="block text-[11px] text-amber-600">(가입대기)</span>
                          )}
                        </>
                      )}
                    </Td>
                  )}
                  <Td className="text-gray-600">{t.instructor ?? ""}</Td>
                  <Td>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-1.5 rounded-full bg-gray-100 overflow-hidden min-w-[40px]">
                        <div className="h-full bg-blue-500" style={{ width: `${t.progress}%` }} />
                      </div>
                      <span className="text-xs text-gray-500 w-8 text-right">{t.progress}%</span>
                    </div>
                  </Td>
                  <Td className="text-center">
                    <StatusBadge status={t.effective_status} />
                  </Td>
                  <Td className="text-gray-500 text-xs whitespace-pre-wrap">{t.note ?? ""}</Td>
                </tr>
              );
            })}

            {tasks.length === 0 && (
              <tr>
                <td colSpan={showAssignee ? 12 : 11} className="px-4 py-10 text-center text-gray-400">
                  {emptyText}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/**
 * 완료계획일 대비 며칠인가.
 * 완료된 업무는 실제 결과, 진행 중인 업무는 오늘 기준 전망을 보여준다.
 */
function ScheduleDiff({ task }: { task: TaskWithEffectiveStatus }) {
  const d = task.schedule_diff_days;
  if (d == null) return <span className="text-gray-300">—</span>;

  const done = task.effective_status === "완료";

  if (d > 0) {
    return (
      <span className="text-red-600 font-semibold">
        {d}일 초과
        {!done && <span className="block text-[10px] font-normal">진행중</span>}
      </span>
    );
  }
  if (d === 0) {
    return <span className="text-gray-600">{done ? "계획대로" : "오늘 마감"}</span>;
  }
  // d < 0
  return done ? (
    <span className="text-emerald-600 font-semibold">{-d}일 단축</span>
  ) : (
    <span className="text-gray-500">D-{-d}</span>
  );
}

/**
 * 목록에서 바로 담당자를 체크한다. 여러 명 체크할 수 있다.
 * 담당이 바뀌어도 이전 담당자 화면에서 업무가 사라지지 않는다 (인계 기록이 남는다).
 */
function AssigneePicker({
  taskId,
  current,
  deputies,
  options,
  fallback,
  onDone,
}: {
  taskId: string;
  current: string | null;
  deputies: string[];
  options: Profile[];
  fallback?: Profile;
  onDone?: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  // 체크된 사람들 = 담당 1명 + 나머지. 화면에서는 구분 없이 한 줄로 보여준다.
  const checked = [current, ...deputies].filter(Boolean) as string[];

  const list =
    fallback && !options.some((o) => o.id === fallback.id) ? [...options, fallback] : options;

  const checkedNames = checked
    .map((id) => list.find((p) => p.id === id)?.name)
    .filter(Boolean)
    .join(", ");

  async function toggle(id: string) {
    const next = checked.includes(id) ? checked.filter((c) => c !== id) : [...checked, id];
    setSaving(true);
    setError(null);

    const supabase = createClient();
    const patch: Record<string, unknown> = {
      assignee_id: next[0] ?? null,
      deputy_ids: next.slice(1),
    };
    // 담당이 바뀌면 새 담당자가 "확인했습니다"를 다시 눌러야 한다
    if ((next[0] ?? null) !== current) patch.confirmed_at = null;

    const { error: err } = await supabase.from("tasks").update(patch).eq("id", taskId);
    setSaving(false);
    if (err) {
      setError("저장 실패");
      return;
    }
    onDone?.();
  }

  return (
    <div className="space-y-1">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={saving}
        className={cn(
          "w-full text-left rounded-md border px-2 py-1.5 text-sm bg-white disabled:opacity-50 break-keep",
          checked.length ? "border-gray-300 text-gray-800" : "border-amber-300 text-amber-700"
        )}
      >
        {checkedNames || "미지정 — 눌러서 체크"}
      </button>

      {open && (
        <div className="rounded-md border border-gray-200 bg-white p-2 space-y-1 max-h-44 overflow-y-auto">
          {options.map((p) => (
            <label key={p.id} className="flex items-center gap-2 text-xs cursor-pointer py-0.5">
              <input
                type="checkbox"
                checked={checked.includes(p.id)}
                disabled={saving}
                onChange={() => toggle(p.id)}
                className="w-4 h-4"
              />
              <span className="break-keep">
                {p.name}
                {p.position ? ` ${p.position}` : ""}
                {p.status === "가입대기" && <span className="text-amber-600"> (가입대기)</span>}
              </span>
            </label>
          ))}
          {options.length === 0 && (
            <p className="text-[11px] text-gray-400">
              등록된 인원이 없습니다. 팀원관리에서 먼저 등록하세요.
            </p>
          )}
        </div>
      )}

      {error && <span className="block text-[11px] text-red-600">{error}</span>}
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
