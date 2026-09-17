"use client";

import { useState } from "react";
import type { Profile, TaskWithEffectiveStatus } from "@/lib/types";
import { formatShortDate, formatIsoDate, cn } from "@/lib/utils";
import { isAssignable, byDisplayOrder } from "@/lib/roles";
import { createClient } from "@/lib/supabase/client";
import StatusBadge from "@/components/StatusBadge";
import FieldPopup from "@/components/FieldPopup";
import TaskEditModal from "@/components/TaskEditModal";

/**
 * 업무 진행 현황 — 메모 프로그램과 같은 대장(臺帳) 양식.
 * 한 건에 한 줄씩, 번호를 붙여 위에서 아래로 계속 쌓인다.
 *
 * NO. | 작성일 | 업무내용 | 진행일정 | 완료일 | 소요일 | 일정대비 | 담당자 | 지시자 | 진행률 | 상태 | 비고 | 이력
 *
 * 고치는 방법: 칸을 누르면 그 칸만 고치는 작은 창이 표 위에 뜬다.
 * 화면을 옮기지 않으므로 표에서 보던 자리를 잃지 않는다.
 * 변경 이력과 삭제는 줄 끝 "이력" 버튼에 모아둔다.
 */

/** 지금 열려 있는 수정 창 */
type EditTarget = {
  task: TaskWithEffectiveStatus;
  field:
    | "title"
    | "description"
    | "due_date"
    | "completed_at"
    | "progress"
    | "instructor"
    | "note";
};

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
  onChanged,
  canEdit = false,
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
  /** 값을 고친 뒤 다시 불러오기 */
  onChanged?: () => void;
  /** 칸을 눌러 고칠 수 있게 할지 (false 면 읽기 전용) */
  canEdit?: boolean;
}) {
  const [edit, setEdit] = useState<EditTarget | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);

  const assignables = profiles.filter(isAssignable).sort(byDisplayOrder);
  const unassigned = tasks.filter((t) => !t.assignee_id).length;
  const today = formatIsoDate(new Date().toISOString());

  /** 고친 값을 저장한다. 실패하면 사람이 읽을 수 있는 이유를 돌려준다. */
  async function patch(id: string, fields: Record<string, unknown>): Promise<string | null> {
    const supabase = createClient();
    const { error } = await supabase.from("tasks").update(fields).eq("id", id);
    if (error) return error.message;
    onChanged?.();
    return null;
  }

  /** 날짜만 받아 그 날 정오로 저장한다 (시간대 때문에 하루 밀리는 것 방지) */
  function noon(dateStr: string): string | null {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return null;
    const d = new Date(`${dateStr}T12:00:00`);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200">
      <div className="flex items-baseline justify-between gap-3 px-4 py-3 border-b border-gray-200 flex-wrap">
        <h2 className="text-base font-bold text-gray-900">{title}</h2>
        <p className="text-xs text-gray-400">
          출력일: {today} &nbsp;|&nbsp; 총 {tasks.length}건
          {canAssign && unassigned > 0 && (
            <span className="text-amber-600 font-medium"> · 담당자 미지정 {unassigned}건</span>
          )}
          {canEdit && (
            <span className="block text-gray-400">
              고칠 칸을 누르면 그 자리에서 수정 창이 뜹니다
            </span>
          )}
        </p>
      </div>

      {edit && (
        <EditPopup
          target={edit}
          onClose={() => setEdit(null)}
          patch={patch}
          noon={noon}
          today={today}
        />
      )}

      {detailId && (
        <TaskEditModal
          taskId={detailId}
          onClose={() => setDetailId(null)}
          onChanged={() => onChanged?.()}
        />
      )}

      {/* 폰 — 표는 칸이 좁아 못 쓰므로 한 건씩 위아래로 펼쳐서 보여준다 */}
      <div className="md:hidden divide-y divide-gray-200">
        {tasks.map((t, i) => {
          const assignee = profiles.find((p) => p.id === t.assignee_id);
          const deputies = (t.deputy_ids ?? [])
            .map((id) => profiles.find((p) => p.id === id))
            .filter(Boolean) as Profile[];
          const canTouch =
            canEdit &&
            (canAssign ||
              (!!viewerId &&
                (t.assignee_id === viewerId || (t.deputy_ids ?? []).includes(viewerId))));
          const canDirect =
            canEdit &&
            (canAssign ||
              (t.source === "팀원추가" && !!viewerId && t.created_by === viewerId));
          const handedOver =
            !!viewerId &&
            !!handedOverIds?.has(t.id) &&
            t.assignee_id !== viewerId &&
            !(t.deputy_ids ?? []).includes(viewerId);

          return (
            <div key={t.id} className={cn("p-3", handedOver && "bg-gray-50")}>
              <div className="flex items-start justify-between gap-2 mb-1.5">
                <span className="text-xs text-gray-400 shrink-0">
                  {i + 1} · {formatIsoDate(t.created_at)}
                </span>
                <StatusBadge status={t.effective_status} />
              </div>

              <Cell
                enabled={canDirect}
                onClick={() => setEdit({ task: t, field: "title" })}
                title="눌러서 제목 수정"
                className="text-base font-semibold text-gray-900 break-keep leading-snug"
              >
                {t.is_new && (
                  <span className="inline-block w-2 h-2 rounded-full bg-blue-500 mr-1.5 align-middle" />
                )}
                {t.title}
                {t.source === "팀원추가" && (
                        <span className="ml-2 text-[11px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 font-normal align-middle whitespace-nowrap">
                          팀원추가
                        </span>
                      )}
              </Cell>

              {(t.description || canDirect) && (
                <Cell
                  enabled={canDirect}
                  onClick={() => setEdit({ task: t, field: "description" })}
                  title="눌러서 상세내용 수정"
                  className="block text-sm text-gray-500 mt-1 whitespace-pre-wrap break-keep"
                >
                  {t.description || <span className="text-gray-300">＋ 상세내용</span>}
                </Cell>
              )}

              {handedOver && (
                <p className="text-xs text-gray-500 mt-1">
                  → {assignee?.name ?? "미지정"} 님에게 인계됨 (기록은 남아 있습니다)
                </p>
              )}

              <div className="mt-2.5">
                <Cell
                  enabled={canTouch}
                  onClick={() => setEdit({ task: t, field: "progress" })}
                  title="눌러서 진행률 수정"
                >
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-2 rounded-full bg-gray-100 overflow-hidden">
                      <div className="h-full bg-blue-500" style={{ width: `${t.progress}%` }} />
                    </div>
                    <span className="text-sm font-medium text-gray-700 w-10 text-right">
                      {t.progress}%
                    </span>
                  </div>
                </Cell>
              </div>

              <dl className="mt-2.5 grid grid-cols-2 gap-x-3 gap-y-1.5 text-sm">
                <Row label="진행일정">
                  <Cell
                    enabled={canDirect}
                    onClick={() => setEdit({ task: t, field: "due_date" })}
                    title="눌러서 진행일정 수정"
                    className={t.effective_status === "지연" ? "text-red-600 font-medium" : ""}
                  >
                    {formatShortDate(t.due_date) || <span className="text-gray-300">—</span>}
                  </Cell>
                </Row>

                <Row label="완료일">
                  <Cell
                    enabled={canTouch}
                    onClick={() => setEdit({ task: t, field: "completed_at" })}
                    title="눌러서 완료일 수정"
                  >
                    {formatShortDate(t.completed_at) || <span className="text-gray-300">—</span>}
                  </Cell>
                </Row>

                <Row label="소요일">
                  <span className="text-gray-700">
                    {t.effective_status === "완료"
                      ? `${t.elapsed_days}일`
                      : `${t.elapsed_days}일째`}
                  </span>
                </Row>

                <Row label="일정대비">
                  <ScheduleDiff task={t} />
                </Row>

                {showAssignee && (
                  <div className="col-span-2">
                    <dt className="text-xs text-gray-400">담당자</dt>
                    <dd className="mt-0.5">
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
                        <span className="text-gray-700 break-keep">
                          {[assignee, ...deputies]
                            .filter(Boolean)
                            .map((p) => (p as Profile).name)
                            .join(", ") || <span className="text-amber-600">미지정</span>}
                        </span>
                      )}
                    </dd>
                  </div>
                )}

                <Row label="지시자">
                  <Cell
                    enabled={canEdit && canAssign}
                    onClick={() => setEdit({ task: t, field: "instructor" })}
                    title="눌러서 지시자 수정"
                  >
                    {t.instructor ||
                      (canEdit && canAssign ? <span className="text-gray-300">＋</span> : "—")}
                  </Cell>
                </Row>
              </dl>

              <div className="mt-2">
                <dt className="text-xs text-gray-400">비고</dt>
                <Cell
                  enabled={canTouch}
                  onClick={() => setEdit({ task: t, field: "note" })}
                  title="눌러서 비고 수정"
                  className="block text-sm text-gray-600 whitespace-pre-wrap break-keep mt-0.5"
                >
                  {t.note || (canTouch ? <span className="text-gray-300">＋ 메모</span> : "—")}
                </Cell>
              </div>

              <button
                onClick={() => setDetailId(t.id)}
                className="mt-3 w-full text-xs px-3 py-2 rounded-lg border border-gray-300 text-gray-600"
              >
                변경 이력 보기
              </button>
            </div>
          );
        })}

        {tasks.length === 0 && (
          <p className="px-4 py-10 text-center text-gray-400 text-sm">{emptyText}</p>
        )}
      </div>

      {/* PC — 메모 양식 그대로의 표 */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full text-sm border-collapse min-w-[1100px] table-fixed">
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
              <Th className="w-16 text-center">이력</Th>
            </tr>
          </thead>
          <tbody>
            {tasks.map((t, i) => {
              const assignee = profiles.find((p) => p.id === t.assignee_id);
              const deputies = (t.deputy_ids ?? [])
                .map((id) => profiles.find((p) => p.id === id))
                .filter(Boolean) as Profile[];
              const overdue = t.effective_status === "지연";

              // 내가 손댈 수 있는 업무인가 (담당·참여자거나 관리자)
              const canTouch =
                canEdit &&
                (canAssign ||
                  (!!viewerId &&
                    (t.assignee_id === viewerId || (t.deputy_ids ?? []).includes(viewerId))));
              // 지시 내용(제목·상세·일정)은 관리자만.
              // 단, 본인이 스스로 추가한 업무는 본인도 고칠 수 있다.
              const canDirect =
                canEdit &&
                (canAssign ||
                  (t.source === "팀원추가" && !!viewerId && t.created_by === viewerId));

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

                  {/* 업무내용 — 제목과 상세내용이 각각 자기 창으로 열린다 */}
                  <Td className="min-w-[300px]">
                    <Cell
                      enabled={canDirect}
                      onClick={() => setEdit({ task: t, field: "title" })}
                      title="눌러서 제목 수정"
                      className="font-medium text-gray-900 break-keep"
                    >
                      {t.is_new && (
                        <span className="inline-block w-1.5 h-1.5 rounded-full bg-blue-500 mr-1.5 align-middle" />
                      )}
                      {t.title}
                      {t.source === "팀원추가" && (
                        <span className="ml-1.5 text-[10px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 font-normal align-middle whitespace-nowrap">
                          팀원추가
                        </span>
                      )}
                    </Cell>

                    {(t.description || canDirect) && (
                      <Cell
                        enabled={canDirect}
                        onClick={() => setEdit({ task: t, field: "description" })}
                        title="눌러서 상세내용 수정"
                        className="block text-xs text-gray-400 mt-0.5 line-clamp-2 break-keep"
                      >
                        {t.description || <span className="text-gray-300">＋ 상세내용</span>}
                      </Cell>
                    )}

                    {handedOver && (
                      <span className="block text-[11px] text-gray-500 mt-1">
                        → {assignee?.name ?? "미지정"} 님에게 인계됨 (기록은 남아 있습니다)
                      </span>
                    )}
                  </Td>

                  {/* 진행일정 (완료계획일) */}
                  <Td
                    className={cn(
                      "text-center whitespace-nowrap",
                      overdue ? "text-red-600 font-medium" : "text-gray-600"
                    )}
                  >
                    <Cell
                      enabled={canDirect}
                      onClick={() => setEdit({ task: t, field: "due_date" })}
                      title="눌러서 진행일정 수정"
                      className="text-center"
                    >
                      {formatShortDate(t.due_date) || <span className="text-gray-300">—</span>}
                    </Cell>
                  </Td>

                  {/* 완료일 */}
                  <Td className="text-center text-gray-600 whitespace-nowrap">
                    <Cell
                      enabled={canTouch}
                      onClick={() => setEdit({ task: t, field: "completed_at" })}
                      title="눌러서 완료일 수정 (실제로 끝낸 날)"
                      className="text-center"
                    >
                      {formatShortDate(t.completed_at) || <span className="text-gray-300">—</span>}
                    </Cell>
                  </Td>

                  {/* 지시일부터 걸린 일수 */}
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

                  {/* 지시자 */}
                  <Td className="text-gray-600">
                    <Cell
                      enabled={canEdit && canAssign}
                      onClick={() => setEdit({ task: t, field: "instructor" })}
                      title="눌러서 지시자 수정"
                    >
                      {t.instructor ||
                      (canEdit && canAssign ? <span className="text-gray-300">＋</span> : "")}
                    </Cell>
                  </Td>

                  {/* 진행률 */}
                  <Td>
                    <Cell
                      enabled={canTouch}
                      onClick={() => setEdit({ task: t, field: "progress" })}
                      title="눌러서 진행률 수정"
                    >
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-1.5 rounded-full bg-gray-100 overflow-hidden min-w-[40px]">
                          <div className="h-full bg-blue-500" style={{ width: `${t.progress}%` }} />
                        </div>
                        <span className="text-xs text-gray-500 w-8 text-right">{t.progress}%</span>
                      </div>
                    </Cell>
                  </Td>

                  <Td className="text-center">
                    <StatusBadge status={t.effective_status} />
                  </Td>

                  {/* 비고 */}
                  <Td className="text-gray-500 text-xs">
                    <Cell
                      enabled={canTouch}
                      onClick={() => setEdit({ task: t, field: "note" })}
                      title="눌러서 비고 수정"
                      className="block whitespace-pre-wrap line-clamp-3 break-keep"
                    >
                      {t.note || (canTouch ? <span className="text-gray-300">＋ 메모</span> : "")}
                    </Cell>
                  </Td>

                  {/* 이력 — 변경 이력과 삭제는 여기 */}
                  <Td className="text-center">
                    <button
                      onClick={() => setDetailId(t.id)}
                      title="변경 이력과 전체 내용 보기"
                      className="text-xs px-2 py-1 rounded border border-gray-300 text-gray-500 hover:bg-gray-50"
                    >
                      보기
                    </button>
                  </Td>
                </tr>
              );
            })}

            {tasks.length === 0 && (
              <tr>
                <td
                  colSpan={showAssignee ? 13 : 12}
                  className="px-4 py-10 text-center text-gray-400"
                >
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

/** 폰 화면에서 쓰는 항목 한 줄 (제목 + 값) */
function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-gray-400">{label}</dt>
      <dd className="mt-0.5">{children}</dd>
    </div>
  );
}

/** 누르면 수정 창이 뜨는 칸. 권한이 없으면 그냥 글자로 보인다. */
function Cell({
  enabled,
  onClick,
  title,
  className,
  children,
}: {
  enabled: boolean;
  onClick: () => void;
  title: string;
  className?: string;
  children: React.ReactNode;
}) {
  if (!enabled) return <span className={className}>{children}</span>;
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={cn(
        "w-full text-left rounded px-1 -mx-1 hover:bg-blue-50 hover:ring-1 hover:ring-blue-200",
        className
      )}
    >
      {children}
    </button>
  );
}

/** 칸별 수정 창 — 어떤 칸을 눌렀는지에 따라 알맞은 입력 방식으로 띄운다 */
function EditPopup({
  target,
  onClose,
  patch,
  noon,
  today,
}: {
  target: EditTarget;
  onClose: () => void;
  patch: (id: string, fields: Record<string, unknown>) => Promise<string | null>;
  noon: (s: string) => string | null;
  today: string;
}) {
  const { task: t, field } = target;
  const createdDay = t.created_at.slice(0, 10);

  if (field === "title") {
    return (
      <FieldPopup
        label="제목"
        kind="text"
        value={t.title}
        placeholder="업무 제목"
        onSave={async (next) => {
          if (!next.trim()) return "제목은 비워둘 수 없습니다.";
          return patch(t.id, { title: next.trim() });
        }}
        onClose={onClose}
      />
    );
  }

  if (field === "description") {
    return (
      <FieldPopup
        label="상세내용"
        hint="줄을 나눠서 여러 항목을 적어도 됩니다."
        kind="textarea"
        value={t.description ?? ""}
        placeholder="세부 지시사항, 확인할 점 등"
        onSave={(next) => patch(t.id, { description: next.trim() || null })}
        onClose={onClose}
      />
    );
  }

  if (field === "due_date") {
    return (
      <FieldPopup
        label="진행일정 (완료계획일)"
        hint="이 날짜가 지나면 지연으로 표시되고, 고과평가의 기한 준수 판정 기준이 됩니다."
        kind="date"
        value={t.due_date ?? ""}
        min={createdDay}
        onSave={(next) => patch(t.id, { due_date: next || null })}
        onClose={onClose}
      />
    );
  }

  if (field === "completed_at") {
    const done = t.effective_status === "완료";
    return (
      <FieldPopup
        label="완료일"
        hint={
          done
            ? "실제로 끝낸 날로 고치면 소요일과 일정 준수 수치에 바로 반영됩니다."
            : "며칠 전에 끝낸 일이면 그 날짜를 넣으세요. 저장하면 완료 처리됩니다."
        }
        kind="date"
        value={t.completed_at ? t.completed_at.slice(0, 10) : today}
        min={createdDay}
        max={today}
        onSave={async (next) => {
          if (!next) return patch(t.id, { status: "진행중", completed_at: null });
          const iso = noon(next);
          if (!iso) return "날짜를 올바르게 입력해주세요.";
          if (iso < t.created_at) return "완료일이 지시일보다 앞설 수 없습니다.";
          return patch(t.id, { status: "완료", progress: 100, completed_at: iso });
        }}
        onClose={onClose}
        extraAction={
          done
            ? {
                label: "완료 취소 (진행중으로)",
                run: () => patch(t.id, { status: "진행중", progress: 90, completed_at: null }),
              }
            : undefined
        }
      />
    );
  }

  if (field === "progress") {
    return (
      <FieldPopup
        label="진행률"
        hint="100% 로 하면 완료 처리되고 오늘 날짜로 완료일이 찍힙니다. 실제 끝낸 날이 다르면 완료일 칸에서 고치세요."
        kind="progress"
        value={String(t.progress)}
        onSave={(next) => {
          const v = Math.max(0, Math.min(100, Number(next) || 0));
          const status = v >= 100 ? "완료" : v > 0 ? "진행중" : "대기";
          return patch(t.id, { progress: v, status });
        }}
        onClose={onClose}
      />
    );
  }

  if (field === "instructor") {
    return (
      <FieldPopup
        label="지시자"
        hint="공장장·대표처럼 시스템에 계정이 없는 분도 그대로 적으시면 됩니다."
        kind="text"
        value={t.instructor ?? ""}
        placeholder="예: 공장장, 대표"
        onSave={(next) => patch(t.id, { instructor: next.trim() || null })}
        onClose={onClose}
      />
    );
  }

  // note
  return (
    <FieldPopup
      label="비고"
      hint="진행하면서 남기는 메모입니다. 담당자 본인도 적을 수 있습니다."
      kind="textarea"
      value={t.note ?? ""}
      placeholder="예: 업체 회신 대기, 6/17 재확인"
      onSave={(next) => patch(t.id, { note: next.trim() || null })}
      onClose={onClose}
    />
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
