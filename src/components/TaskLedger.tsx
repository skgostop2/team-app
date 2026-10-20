"use client";

import Link from "next/link";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { useColumnWidths } from "@/lib/useColumnWidths";
import type { Profile, QuestionCount, TaskWithEffectiveStatus } from "@/lib/types";
import { formatShortDate, formatIsoDate, cn } from "@/lib/utils";
import { isAssignable, byDisplayOrder } from "@/lib/roles";
import { checkDue, checkStart, checkDone, ODD_DIFF_DAYS } from "@/lib/dateCheck";
import { createClient } from "@/lib/supabase/client";
import StatusBadge from "@/components/StatusBadge";
import FieldPopup from "@/components/FieldPopup";
import TaskEditModal from "@/components/TaskEditModal";
import ProgressLogModal from "@/components/ProgressLogModal";
import DeleteLock from "@/components/DeleteLock";
import QuestionModal from "@/components/QuestionModal";
import TaskItemsModal from "@/components/TaskItemsModal";
import type { ItemCount } from "@/lib/items";

/**
 * 업무 진행 현황 — 메모 프로그램과 같은 대장(臺帳) 양식.
 * 한 건에 한 줄씩, 번호를 붙여 위에서 아래로 계속 쌓인다.
 *
 * NO. | 작성일 | 업무내용 | 진행일정 | 완료계획일정 | 완료여부 | 소요일 | 일정대비 | 담당자 | 지시자 | 진행률 | 진행기록 | 상태 | 비고 | 이력
 *
 * 고치는 방법: 칸을 누르면 그 칸만 고치는 작은 창이 표 위에 뜬다.
 * 화면을 옮기지 않으므로 표에서 보던 자리를 잃지 않는다.
 * 변경 이력과 삭제는 줄 끝 "이력" 버튼에 모아둔다.
 */

/** 정렬 기준 — 고른 것은 그 브라우저에 기억된다 */
const SORTS = ["등록순", "마감순", "진행률순", "지연먼저"] as const;
type SortKey = (typeof SORTS)[number];

/** 지금 열려 있는 수정 창 */
type EditTarget = {
  task: TaskWithEffectiveStatus;
  field:
    | "title"
    | "description"
    | "start_date"
    | "due_date"
    | "completed_at"
    | "progress"
    | "instructor"
    | "note";
};

/**
 * PC 표의 칸 폭(px).
 *
 * 업무내용은 여기에 없다 — 남는 폭을 전부 받는 칸이라서다.
 * 칸을 늘리거나 줄일 때는 여기만 고치면 표 최소 폭도 같이 따라간다.
 */
const COL = {
  star: 30,
  no: 36,
  date: 100,
  /** 진행일정 — 착수일 */
  start: 68,
  /** 완료계획 — 목표 완료일 (소요일·일정대비 계산 기준) */
  due: 72,
  /** 완료여부 — 완료 O + 실제 완료일 */
  done: 84,
  days: 64,
  diff: 84,
  assignee: 104,
  instructor: 64,
  progress: 140,
  log: 96,
  ask: 44,
  status: 76,
  note: 80,
  hist: 64,
  /** 업무내용이 이 폭보다 좁아지면 글자가 한 자씩 끊긴다.
      나머지 칸을 줄여 이 칸에 몰아준다 — 표에서 실제로 읽는 것은 여기다. */
  titleMin: 340,
} as const;

/** 끌어서 조절할 수 있는 칸들 (업무내용은 남는 폭을 받으므로 제외) */
const RESIZABLE: Record<string, number> = {
  star: COL.star,
  /** 업무내용 — 0 이면 "남는 폭을 전부" (끌어서 정하면 그 폭으로 고정된다) */
  title: 0,
  no: COL.no,
  date: COL.date,
  start: COL.start,
  due: COL.due,
  done: COL.done,
  days: COL.days,
  diff: COL.diff,
  assignee: COL.assignee,
  instructor: COL.instructor,
  progress: COL.progress,
  log: COL.log,
  ask: COL.ask,
  status: COL.status,
  note: COL.note,
  hist: COL.hist,
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
  canDelete = false,
  questions,
  canAnswer = false,
  stars,
  onToggleStar,
  itemCounts,
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
  /** 표에서 바로 지울 수 있게 할지 (팀장만 — 서버에서도 팀장만 지워진다) */
  canDelete?: boolean;
  /** 업무별 질문 개수 (노란 ? 표시에 쓴다) */
  questions?: Map<string, QuestionCount>;
  /** 질문에 답할 수 있는 사람인지 (팀장·실장·그룹장) */
  canAnswer?: boolean;
  /** 내가 별표를 단 업무들 (별표는 사람마다 따로다) */
  stars?: Set<string>;
  onToggleStar?: (taskId: string, next: boolean) => void;
  /** 업무별 세부 항목 수 (진행률이 체크로 계산되는 업무) */
  itemCounts?: Map<string, ItemCount>;
}) {
  const [edit, setEdit] = useState<EditTarget | null>(null);

  // 나머지 칸 합 + 업무내용 최소 폭 = 표 최소 폭


  /**
   * 칸을 줄여서 보기.
   *
   * 각자 PC 해상도가 달라 어떤 사람은 표가 다 들어가고 어떤 사람은 잘린다.
   * 평소 잘 안 보는 칸(작성일·소요일·일정대비·지시자·비고)을 접으면
   * 가로로 밀 일이 없어진다. 선택은 그 브라우저에만 저장된다.
   */
  const [compact, setCompact] = useState(false);
  useEffect(() => {
    try {
      setCompact(localStorage.getItem("task-ledger-compact") === "1");
    } catch {
      // 저장소를 막아둔 브라우저면 그냥 전체 보기로 둔다
    }
  }, []);
  function toggleCompact() {
    setCompact((v) => {
      const next = !v;
      try {
        localStorage.setItem("task-ledger-compact", next ? "1" : "0");
      } catch {}
      return next;
    });
  }

  /** 질문 창을 열어 둔 업무 */
  const [askTask, setAskTask] = useState<TaskWithEffectiveStatus | null>(null);
  /** 진행률·세부 항목 창을 열어 둔 업무 */
  const [itemTask, setItemTask] = useState<TaskWithEffectiveStatus | null>(null);

  /**
   * 정렬.
   *
   * 내 별표는 늘 맨 위로 올린다 — 각자 "오늘 챙길 것"을 올려두는 자리라서다.
   * 그 다음이 팀장이 단 긴급, 그 다음이 고른 기준이다.
   */
  const [sortKey, setSortKey] = useState<SortKey>("등록순");
  useEffect(() => {
    try {
      const v = localStorage.getItem("task-ledger-sort");
      if (v && SORTS.includes(v as SortKey)) setSortKey(v as SortKey);
    } catch {}
  }, []);
  function pickSort(k: SortKey) {
    setSortKey(k);
    try {
      localStorage.setItem("task-ledger-sort", k);
    } catch {}
  }

  const [detailId, setDetailId] = useState<string | null>(null);
  const [logTask, setLogTask] = useState<TaskWithEffectiveStatus | null>(null);
  const [doneBusy, setDoneBusy] = useState<string | null>(null);
  /** 긴급 표시를 바꾸는 중인 업무 */
  const [urgentBusy, setUrgentBusy] = useState<string | null>(null);
  /** 지우려고 비밀번호를 묻고 있는 업무 */
  const [askDelete, setAskDelete] = useState<TaskWithEffectiveStatus | null>(null);

  /**
   * 받은 일과 스스로 챙기는 일은 성격이 다르다. 섞여 있으면 머리가 복잡하므로
   * 같은 표 안에서 띠로 나눈다 — 위가 지시, 아래가 직접 등록.
   * 한쪽만 있으면 띠를 띄우지 않는다 (쓸데없이 줄만 는다).
   */
  const ordered = useMemo(() => {
    const starred = (t: TaskWithEffectiveStatus) => (stars?.has(t.id) ? 0 : 1);
    const urgent = (t: TaskWithEffectiveStatus) => (t.urgent ? 0 : 1);
    const by: Record<SortKey, (a: TaskWithEffectiveStatus, b: TaskWithEffectiveStatus) => number> = {
      등록순: (a, b) => a.created_at.localeCompare(b.created_at),
      마감순: (a, b) => (a.due_date ?? "9999").localeCompare(b.due_date ?? "9999"),
      진행률순: (a, b) => (a.progress ?? 0) - (b.progress ?? 0),
      지연먼저: (a, b) =>
        (b.effective_status === "지연" ? 1 : 0) - (a.effective_status === "지연" ? 1 : 0),
    };
    return [...tasks].sort(
      (a, b) =>
        starred(a) - starred(b) || urgent(a) - urgent(b) || by[sortKey](a, b)
    );
  }, [tasks, stars, sortKey]);

  const sections = useMemo(() => {
    const directed = ordered.filter((t) => t.source !== "팀원추가");
    const own = ordered.filter((t) => t.source === "팀원추가");
    const out: { key: string; label: string; items: TaskWithEffectiveStatus[] }[] = [];
    if (directed.length) {
      out.push({ key: "directed", label: canAssign ? "지시 업무" : "지시받은 업무", items: directed });
    }
    if (own.length) {
      out.push({
        key: "own",
        label: canAssign ? "팀원이 등록한 업무" : "내가 등록한 업무",
        items: own,
      });
    }
    return out;
  }, [ordered, canAssign]);

  /** 띠를 띄울지 (한 묶음뿐이면 굳이 안 띄운다) */
  const banded = sections.length > 1;

  /**
   * 이 업무를 지울 수 있는가.
   * 팀장은 전부, 그 외에는 자기가 담당이거나 자기가 올린 것만.
   * 서버(RLS)도 같은 규칙으로 막으니 화면만 뚫어도 저장이 안 된다.
   */
  function mayDelete(t: TaskWithEffectiveStatus): boolean {
    if (canDelete) return true;
    if (!canEdit || !viewerId) return false;
    // 지시받은 업무는 지울 수 없다 — 지시는 지시한 사람의 기록이다.
    // 맡기 어려운 업무는 지우는 게 아니라 담당 변경이나 취소로 처리한다.
    return t.source === "팀원추가" && t.created_by === viewerId;
  }

  /** 팀장만 비밀번호를 묻는다 (팀원은 그 비밀번호를 모른다) */
  const askPassword = canDelete;

  /** 지울 수 없는 줄에는 왜 못 지우는지 적어 둔다 (버튼이 있다 없다 하면 고장처럼 보인다) */
  function noDeleteWhy(t: TaskWithEffectiveStatus): string {
    if (!canEdit) return "보기 전용 화면입니다";
    if (t.source !== "팀원추가") return "지시받은 업무는 팀장만 지울 수 있습니다";
    return "직접 등록한 업무만 지울 수 있습니다";
  }

  /** 진행률을 바로 저장한다 — 100%면 완료, 0%면 대기 (팝업과 같은 규칙) */
  function saveProgress(id: string, v: number): Promise<string | null> {
    const n = Math.max(0, Math.min(100, Math.round(v)));
    const status = n >= 100 ? "완료" : n > 0 ? "진행중" : "대기";
    return patch(id, { progress: n, status });
  }

  // 칸 폭은 쓰는 사람이 끌어서 정한다 (이 브라우저에만 저장된다)
  const { widths: W, startDrag, reset: resetWidths, changed: widthsChanged } = useColumnWidths(
    "task-ledger-widths",
    RESIZABLE
  );

  /** 지금 화면에 세울 칸 (간단히 보기면 몇 칸을 접는다) */
  const col = {
    date: !compact,
    days: !compact,
    diff: !compact,
    instructor: !compact,
    note: !compact,
    assignee: showAssignee,
  };

  /** 띠(구분줄)가 표 전체를 가로지르게 하려면 지금 세워진 칸 수가 필요하다 */
  const colCount =
    11 + [col.date, col.days, col.diff, col.instructor, col.note, col.assignee].filter(Boolean).length;

  // 나머지 칸 합 + 업무내용 최소 폭 = 표 최소 폭
  const tableMinWidth =
    W.star +
    W.no +
    (col.date ? W.date : 0) +
    W.start +
    W.due +
    W.done +
    (col.days ? W.days : 0) +
    (col.diff ? W.diff : 0) +
    (col.assignee ? W.assignee : 0) +
    (col.instructor ? W.instructor : 0) +
    W.progress +
    W.log +
    W.ask +
    W.status +
    (col.note ? W.note : 0) +
    W.hist +
    (W.title > 0 ? W.title : COL.titleMin);

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

  /**
   * 오늘 날짜로 바로 완료 처리.
   *
   * 끝낸 날이 오늘이 아니면 완료여부 칸을 눌러 날짜를 고치면 된다.
   * 대부분은 "오늘 끝냈다"라서 버튼 하나로 끝나게 둔다.
   */
  async function completeNow(id: string) {
    const iso = noon(today);
    if (!iso) return;
    setDoneBusy(id);
    const err = await patch(id, { status: "완료", progress: 100, completed_at: iso });
    setDoneBusy(null);
    if (err) window.alert(`완료 처리하지 못했습니다: ${err}`);
  }

  /** 긴급 표시 켜고 끄기 — 팀장·실장·그룹장만 (서버에서도 같은 규칙으로 막힌다) */
  async function toggleUrgent(t: TaskWithEffectiveStatus) {
    setUrgentBusy(t.id);
    const err = await patch(t.id, { urgent: !t.urgent });
    setUrgentBusy(null);
    if (err) window.alert(`긴급 표시를 바꾸지 못했습니다: ${err}`);
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
          <select
            value={sortKey}
            onChange={(e) => pickSort(e.target.value as SortKey)}
            title="보는 순서 — 내 별표와 긴급은 늘 맨 위입니다"
            className="no-print mr-2 px-2 py-1 rounded border border-gray-300 text-gray-600 bg-white"
          >
            {SORTS.map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </select>
          <button
            onClick={toggleCompact}
            className="no-print hidden md:inline-block mr-2 px-2 py-1 rounded border border-gray-300 text-gray-600 hover:bg-gray-50"
            title={
              compact
                ? "작성일·소요일·일정대비·지시자·비고 칸을 다시 펼칩니다"
                : "평소 잘 안 보는 칸을 접어 표를 화면 안에 넣습니다"
            }
          >
            {compact ? "모든 칸 보기" : "간단히 보기"}
          </button>
          {widthsChanged && (
            <button
              onClick={resetWidths}
              className="no-print mr-2 underline hover:text-gray-600"
              title="칸 폭을 처음 상태로"
            >
              칸 폭 초기화
            </button>
          )}
          출력일: {today} &nbsp;|&nbsp; 총 {tasks.length}건
          {canAssign && unassigned > 0 && (
            <span className="text-amber-600 font-medium"> · 담당자 미지정 {unassigned}건</span>
          )}
          {canEdit && (
            <span className="block text-gray-400">
              고칠 칸을 누르면 그 자리에서 수정 창이 뜹니다
            </span>
          )}
          <span className="no-print hidden md:block text-gray-400">
            표가 화면보다 넓으면 <b className="font-medium">Shift + 마우스 휠</b> 로 좌우로 밉니다
          </span>
        </p>
      </div>

      {edit && (
        <EditPopup
          target={edit}
          onClose={() => setEdit(null)}
          patch={patch}
          noon={noon}
          today={today}
          canUrgent={canEdit && canAssign}
          onItems={(task) => {
            setEdit(null);
            setItemTask(task);
          }}
        />
      )}

      {logTask && (
        <ProgressLogModal
          task={logTask}
          profiles={profiles}
          canWrite={
            canEdit &&
            (canAssign ||
              (!!viewerId &&
                (logTask.assignee_id === viewerId ||
                  (logTask.deputy_ids ?? []).includes(viewerId))))
          }
          onClose={() => setLogTask(null)}
          onChanged={() => onChanged?.()}
        />
      )}

      {itemTask && (
        <TaskItemsModal
          task={itemTask}
          canEdit={
            canEdit &&
            (canAssign ||
              (!!viewerId &&
                (itemTask.assignee_id === viewerId ||
                  (itemTask.deputy_ids ?? []).includes(viewerId) ||
                  itemTask.created_by === viewerId)))
          }
          onClose={() => setItemTask(null)}
          onChanged={() => onChanged?.()}
        />
      )}

      {askTask && (
        <QuestionModal
          task={askTask}
          profiles={profiles}
          canAsk={
            canEdit &&
            (canAnswer ||
              (!!viewerId &&
                (askTask.assignee_id === viewerId ||
                  (askTask.deputy_ids ?? []).includes(viewerId))))
          }
          canAnswer={canAnswer}
          onClose={() => setAskTask(null)}
          onChanged={() => onChanged?.()}
        />
      )}

      {detailId && (
        <TaskEditModal
          taskId={detailId}
          onClose={() => setDetailId(null)}
          onChanged={() => onChanged?.()}
        />
      )}

      {askDelete && (
        <DeleteLock
          requirePassword={askPassword}
          title={askDelete.title}
          onClose={() => setAskDelete(null)}
          onConfirm={async () => {
            const supabase = createClient();
            const id = askDelete.id;
            const { error } = await supabase.from("tasks").delete().eq("id", id);
            if (error) return `삭제하지 못했습니다: ${error.message}`;

            // 권한이 없으면 오류 없이 0건만 지워진다 — 정말 사라졌는지 다시 본다
            const { data: still } = await supabase
              .from("tasks")
              .select("id")
              .eq("id", id)
              .maybeSingle();
            if (still) return "삭제 권한이 없습니다. 팀장만 지울 수 있습니다.";

            onChanged?.();
            return null;
          }}
        />
      )}

      {/* 폰 — 표는 칸이 좁아 못 쓰므로 한 건씩 위아래로 펼쳐서 보여준다 */}
      <div className="md:hidden print-hide divide-y divide-gray-200">
        {sections.map((sec) => (
        <Fragment key={sec.key}>
        {banded && (
          <div className="px-3 py-1.5 bg-gray-50 text-xs font-semibold text-gray-500">
            {sec.label} <span className="font-normal text-gray-400">{sec.items.length}건</span>
          </div>
        )}
        {sec.items.map((t, i) => {
          const assignee = profiles.find((p) => p.id === t.assignee_id);
          const deputies = (t.deputy_ids ?? [])
            .map((id) => profiles.find((p) => p.id === id))
            .filter(Boolean) as Profile[];
          const canTouch =
            canEdit &&
            (canAssign ||
              (!!viewerId &&
                (t.assignee_id === viewerId || (t.deputy_ids ?? []).includes(viewerId))));
          // 업무 내용은 담당자·참여자도 고친다 (구두 지시를 담당이 직접 적고 고치는 현장에 맞춘다).
          // 고친 내용은 모두 이력에 남는다.
          const canDirect = canTouch;
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
                <UrgentChip
                  on={!!t.urgent}
                  canSet={canEdit && canAssign}
                  busy={urgentBusy === t.id}
                  onToggle={() => toggleUrgent(t)}
                />
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
                <ProgressControl
                  big
                  value={t.progress}
                  enabled={canTouch}
                  count={itemCounts?.get(t.id)}
                  onCommit={(v) => saveProgress(t.id, v)}
                  onOpen={() => setItemTask(t)}
                />
              </div>

              <dl className="mt-2.5 grid grid-cols-2 gap-x-3 gap-y-1.5 text-sm">
                <Row label="진행일정">
                  <Cell
                    enabled={canDirect}
                    onClick={() => setEdit({ task: t, field: "start_date" })}
                    title="눌러서 진행일정 수정 (착수일)"
                  >
                    {formatShortDate(t.start_date) || <span className="text-gray-300">—</span>}
                  </Cell>
                </Row>

                <Row label="완료계획일정">
                  <Cell
                    enabled={canDirect}
                    onClick={() => setEdit({ task: t, field: "due_date" })}
                    title="눌러서 완료계획일정 수정"
                    className={t.effective_status === "지연" ? "text-red-600 font-medium" : ""}
                  >
                    {formatShortDate(t.due_date) || <span className="text-gray-300">—</span>}
                  </Cell>
                </Row>

                <Row label="완료여부">
                  <div className="flex items-center gap-2">
                    <Cell
                      enabled={canTouch}
                      onClick={() => setEdit({ task: t, field: "completed_at" })}
                      title="눌러서 완료 처리 / 완료일 수정"
                    >
                      {t.completed_at ? (
                        <span className="text-emerald-700 font-medium">
                          완료 {formatShortDate(t.completed_at)}
                        </span>
                      ) : (
                        <span className="text-gray-400">미완료</span>
                      )}
                    </Cell>
                    {!t.completed_at && canTouch && (
                      <button
                        type="button"
                        onClick={() => completeNow(t.id)}
                        disabled={doneBusy === t.id}
                        className="shrink-0 text-xs leading-none px-2.5 py-1.5 rounded border border-emerald-400 text-emerald-700 hover:bg-emerald-50 disabled:opacity-50 whitespace-nowrap"
                      >
                        {doneBusy === t.id ? "처리 중" : "완료 처리"}
                      </button>
                    )}
                  </div>
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
                      {canTouch ? (
                        <AssigneePicker
                          taskId={t.id}
                          current={t.assignee_id}
                          deputies={t.deputy_ids ?? []}
                          options={assignables}
                          fallback={assignee}
                          onDone={onAssigned}
                          linkNames={canAssign}
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

              <div className="mt-2.5">
                <dt className="text-xs text-gray-400">
                  진행기록 {t.update_count ? `(${t.update_count})` : ""}
                </dt>
                <button
                  type="button"
                  onClick={() => setLogTask(t)}
                  className="w-full text-left rounded px-1 -mx-1 hover:bg-blue-50 mt-0.5"
                >
                  {t.last_update_text ? (
                    <>
                      <span className="block text-sm text-gray-700 break-keep line-clamp-2">
                        {t.last_update_text}
                      </span>
                      <span className="block text-[11px] text-gray-400">
                        {formatShortDate(t.last_update_at)} {t.last_update_by}
                      </span>
                    </>
                  ) : (
                    <span className="text-sm text-gray-300">＋ 기록 추가</span>
                  )}
                </button>
              </div>

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

              <div className="mt-3 flex gap-2 items-center">
                <StarButton
                  big
                  on={!!stars?.has(t.id)}
                  onClick={() => onToggleStar?.(t.id, !stars?.has(t.id))}
                  disabled={!onToggleStar}
                />
                <AskButton big count={questions?.get(t.id)} onClick={() => setAskTask(t)} />
                <button
                  onClick={() => setDetailId(t.id)}
                  className="flex-1 text-xs px-3 py-2 rounded-lg border border-gray-300 text-gray-600"
                >
                  변경 이력 보기
                </button>
                <button
                  onClick={() => setAskDelete(t)}
                  disabled={!mayDelete(t)}
                  title={mayDelete(t) ? "이 업무 삭제" : noDeleteWhy(t)}
                  className={cn(
                    "shrink-0 text-xs px-3 py-2 rounded-lg border",
                    mayDelete(t)
                      ? "border-red-200 text-red-600"
                      : "border-gray-200 text-gray-300"
                  )}
                >
                  삭제
                </button>
              </div>
            </div>
          );
        })}
        </Fragment>
        ))}

        {tasks.length === 0 && (
          <p className="px-4 py-10 text-center text-gray-400 text-sm">{emptyText}</p>
        )}
      </div>

      {/* PC — 메모 양식 그대로의 표 */}
      <div className="hidden md:block print-show print-table overflow-auto max-h-[calc(100dvh-13rem)] print:max-h-none print:overflow-visible">
        {/*
          칸 폭은 colgroup 한 곳에서만 정한다.
          업무내용만 폭을 비워 남는 폭을 전부 받게 하고, 표의 최소 폭은
          "나머지 칸 합 + 업무내용 최소 폭"으로 잡는다. 이 계산을 빼먹으면
          업무내용 칸이 0으로 짜부라져 글자가 세로로 한 줄씩 떨어진다.
        */}
        {/*
          업무내용 폭을 직접 정하면 표 폭을 칸 합과 똑같이 고정한다.
          그렇게 하지 않으면 브라우저가 남는 공간을 칸마다 제멋대로 나눠 주어
          끌어서 맞춘 폭이 그대로 유지되지 않는다.
        */}
        <table
          className="text-sm border-collapse table-fixed"
          style={{
            minWidth: tableMinWidth,
            width: W.title > 0 ? tableMinWidth : "100%",
          }}
        >
          <colgroup>
            <col style={{ width: W.star }} />
            <col style={{ width: W.no }} />
            {col.date && <col style={{ width: W.date }} />}
            {/* 업무내용 — 끌어서 정한 폭이 있으면 그 폭, 없으면 남는 폭 전부 */}
            {W.title > 0 ? <col style={{ width: W.title }} /> : <col />}
            <col style={{ width: W.start }} />
            <col style={{ width: W.due }} />
            <col style={{ width: W.done }} />
            {col.days && <col style={{ width: W.days }} />}
            {col.diff && <col style={{ width: W.diff }} />}
            {col.assignee && <col style={{ width: W.assignee }} />}
            {col.instructor && <col style={{ width: W.instructor }} />}
            <col style={{ width: W.progress }} />
            <col style={{ width: W.log }} />
            <col style={{ width: W.ask }} />
            <col style={{ width: W.status }} />
            {col.note && <col style={{ width: W.note }} />}
            <col style={{ width: W.hist }} />
          </colgroup>
          <thead>
            {/* 머리줄은 따라 내려온다 — 스크롤해도 어느 칸인지 보인다 */}
            <tr className="bg-blue-50 text-gray-700 text-xs">
              <Th stick className="px-0" >
                <span title="내가 별표를 단 업무가 맨 위로 올라옵니다">★</span>
              </Th>
              <Th grip="no" onGrip={startDrag} stick>NO.</Th>
              {col.date && (
                <Th grip="date" onGrip={startDrag} stick>작성일</Th>
              )}
              <Th grip="title" onGrip={startDrag} stick>업무내용</Th>
              <Th grip="start" onGrip={startDrag} stick>진행일정</Th>
              <Th grip="due" onGrip={startDrag} stick>완료계획</Th>
              <Th grip="done" onGrip={startDrag} stick>완료여부</Th>
              {col.days && (
                <Th grip="days" onGrip={startDrag} stick>소요일</Th>
              )}
              {col.diff && (
                <Th grip="diff" onGrip={startDrag} stick>일정대비</Th>
              )}
              {col.assignee && (
                <Th grip="assignee" onGrip={startDrag} stick>
                  담당자
                </Th>
              )}
              {col.instructor && (
                <Th grip="instructor" onGrip={startDrag} stick>지시자</Th>
              )}
              <Th grip="progress" onGrip={startDrag} stick>진행률</Th>
              <Th grip="log" onGrip={startDrag} stick>진행기록</Th>
              <Th grip="ask" onGrip={startDrag} stick>질문</Th>
              <Th grip="status" onGrip={startDrag} stick>상태</Th>
              {col.note && (
                <Th grip="note" onGrip={startDrag} stick>비고</Th>
              )}
              <Th grip="hist" onGrip={startDrag} stick>이력</Th>
            </tr>
          </thead>
          <tbody>
            {sections.map((sec) => (
            <Fragment key={sec.key}>
            {banded && (
              <tr className="bg-gray-50">
                <td
                  colSpan={colCount}
                  className="px-3 py-1.5 text-xs font-semibold text-gray-500 border-y border-gray-200"
                >
                  {sec.label}{" "}
                  <span className="font-normal text-gray-400">{sec.items.length}건</span>
                </td>
              </tr>
            )}
            {sec.items.map((t, i) => {
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
              // 업무 내용(제목·상세·일정)은 담당자·참여자도 고친다.
              // 구두 지시가 오가는 현장에서는 담당이 직접 적고 고쳐야 표가 현실과 맞는다.
              // 누가 무엇을 고쳤는지는 이력(task_history)에 전부 남는다.
              const canDirect = canTouch;

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
                    "group border-b border-gray-200 last:border-0 hover:bg-gray-50",
                    handedOver && "bg-gray-50/60"
                  )}
                >
                  <Td className="text-center px-0">
                    <StarButton
                      on={!!stars?.has(t.id)}
                      onClick={() => onToggleStar?.(t.id, !stars?.has(t.id))}
                      disabled={!onToggleStar}
                    />
                  </Td>
                  <Td className="text-center text-gray-500">{i + 1}</Td>
                  {col.date && (
                    <Td className="text-gray-600 whitespace-nowrap">{formatIsoDate(t.created_at)}</Td>
                  )}

                  {/* 업무내용 — 제목과 상세내용이 각각 자기 창으로 열린다 */}
                  <Td>
                    <Cell
                      enabled={canDirect}
                      onClick={() => setEdit({ task: t, field: "title" })}
                      title="눌러서 제목 수정"
                      className="font-medium text-gray-900 break-keep"
                    >
                      {t.is_new && (
                        <span className="inline-block w-1.5 h-1.5 rounded-full bg-blue-500 mr-1.5 align-middle" />
                      )}
                      <UrgentChip
                        on={!!t.urgent}
                        canSet={canEdit && canAssign}
                        busy={urgentBusy === t.id}
                        onToggle={() => toggleUrgent(t)}
                      />
                      {t.title}
                      {t.source === "팀원추가" && (
                        <span className="ml-1.5 text-[11px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 font-normal align-middle whitespace-nowrap">
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

                  {/* 진행일정 — 언제부터 하는지 (착수일) */}
                  <Td className="text-center text-gray-600 whitespace-nowrap">
                    <Cell
                      enabled={canDirect}
                      onClick={() => setEdit({ task: t, field: "start_date" })}
                      title="눌러서 진행일정 수정 (착수일)"
                      align="center"
                    >
                      {formatShortDate(t.start_date) || <span className="text-gray-300">—</span>}
                    </Cell>
                  </Td>

                  {/* 완료계획일정 — 목표 완료일 (지연 판정과 고과 수치의 기준) */}
                  <Td
                    className={cn(
                      "text-center whitespace-nowrap",
                      overdue ? "text-red-600 font-medium" : "text-gray-600"
                    )}
                  >
                    <Cell
                      enabled={canDirect}
                      onClick={() => setEdit({ task: t, field: "due_date" })}
                      title="눌러서 완료계획일정 수정"
                      align="center"
                    >
                      {formatShortDate(t.due_date) || <span className="text-gray-300">—</span>}
                    </Cell>
                  </Td>

                  {/* 완료여부 — 끝났는지, 언제 끝냈는지 */}
                  <Td className="text-center whitespace-nowrap">
                    <Cell
                      enabled={canTouch}
                      onClick={() => setEdit({ task: t, field: "completed_at" })}
                      title="눌러서 완료 처리 / 완료일 수정"
                      align="center"
                    >
                      {t.completed_at ? (
                        <>
                          <span className="block text-emerald-700 font-medium">완료</span>
                          <span className="block text-[11px] text-gray-500">
                            {formatShortDate(t.completed_at)}
                          </span>
                        </>
                      ) : (
                        <span className="text-gray-400">미완료</span>
                      )}
                    </Cell>

                    {/* 오늘 끝냈으면 버튼 하나로. 칸을 넓혀도 버튼은 커지지 않는다 */}
                    {!t.completed_at && canTouch && (
                      <div className="mt-0.5 flex justify-center">
                        <button
                          type="button"
                          onClick={() => completeNow(t.id)}
                          disabled={doneBusy === t.id}
                          title="오늘 날짜로 완료 처리"
                          className="text-[11px] leading-none px-2 py-1 rounded border border-emerald-400 text-emerald-700 hover:bg-emerald-50 disabled:opacity-50 whitespace-nowrap"
                        >
                          {doneBusy === t.id ? "처리중" : "완료 처리"}
                        </button>
                      </div>
                    )}
                  </Td>

                  {/* 지시일부터 걸린 일수 */}
                  {col.days && (
                    <Td className="text-center text-gray-600 whitespace-nowrap">
                      {t.elapsed_days != null
                        ? t.effective_status === "완료"
                          ? `${t.elapsed_days}일`
                          : `${t.elapsed_days}일째`
                        : ""}
                    </Td>
                  )}

                  {/* 완료계획일 대비 */}
                  {col.diff && (
                    <Td className="text-center whitespace-nowrap">
                      <ScheduleDiff task={t} />
                    </Td>
                  )}

                  {col.assignee && (
                    <Td className="text-gray-600">
                      {canTouch ? (
                        <AssigneePicker
                          taskId={t.id}
                          current={t.assignee_id}
                          deputies={t.deputy_ids ?? []}
                          options={assignables}
                          fallback={assignee}
                          onDone={onAssigned}
                          linkNames={canAssign}
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
                  {col.instructor && (
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
                  )}

                  {/* 진행률 — 항목이 있으면 체크로 계산되고, 없으면 끌어서 맞춘다 */}
                  <Td>
                    <ProgressControl
                      value={t.progress}
                      enabled={canTouch}
                      count={itemCounts?.get(t.id)}
                      onCommit={(v) => saveProgress(t.id, v)}
                      onOpen={() => setItemTask(t)}
                    />
                  </Td>

                  {/* 진행기록 — 마지막 기록이 보이고, 누르면 전체가 뜬다 */}
                  <Td className="text-xs">
                    <button
                      type="button"
                      onClick={() => setLogTask(t)}
                      title="진행기록 보기 / 추가"
                      className="w-full text-left rounded px-1 -mx-1 hover:bg-blue-50 hover:ring-1 hover:ring-blue-200"
                    >
                      {t.last_update_text ? (
                        <>
                          <span className="block text-gray-700 line-clamp-2 break-keep">
                            {t.last_update_text}
                          </span>
                          <span className="block text-[11px] text-gray-400 mt-0.5">
                            {formatShortDate(t.last_update_at)} {t.last_update_by} · 총{" "}
                            {t.update_count ?? 0}건
                          </span>
                        </>
                      ) : (
                        <span className="text-gray-300">＋ 기록</span>
                      )}
                    </button>
                  </Td>

                  <Td className="text-center">
                    <AskButton count={questions?.get(t.id)} onClick={() => setAskTask(t)} />
                  </Td>

                  <Td className="text-center">
                    <StatusBadge status={t.effective_status} />
                  </Td>

                  {/* 비고 */}
                  {col.note && (
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
                  )}

                  {/* 이력 — 변경 이력 보기와 삭제 */}
                  <Td className="text-center">
                    <div className="flex flex-col items-center gap-1">
                      <button
                        onClick={() => setDetailId(t.id)}
                        title="변경 이력과 전체 내용 보기"
                        className="text-xs px-2 py-1 rounded border border-gray-300 text-gray-500 hover:bg-gray-50"
                      >
                        보기
                      </button>
                      <button
                        onClick={() => setAskDelete(t)}
                        disabled={!mayDelete(t)}
                        title={
                          !mayDelete(t)
                            ? noDeleteWhy(t)
                            : askPassword
                              ? "이 업무 삭제 (비밀번호를 묻습니다)"
                              : "이 업무 삭제"
                        }
                        className={cn(
                          "no-print text-[11px] leading-none px-2 py-1 rounded border",
                          mayDelete(t)
                            ? "border-red-200 text-red-600 hover:bg-red-50"
                            : "border-gray-200 text-gray-300 cursor-not-allowed"
                        )}
                      >
                        삭제
                      </button>
                    </div>
                  </Td>
                </tr>
              );
            })}
            </Fragment>
            ))}

            {tasks.length === 0 && (
              <tr>
                <td
                  colSpan={colCount}
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

/**
 * 진행률 — 표에서 바로 끌어서 맞춘다.
 *
 * 손을 떼는 순간 한 번만 저장한다. 끄는 동안 계속 저장하면 이력이
 * 수십 줄로 지저분해지고 화면도 느려진다.
 *
 * 100% 까지 밀면 완료로 바뀐다 — 창에서 고치던 것과 같은 규칙이다.
 * 숫자를 누르면 예전처럼 창이 떠서 0·25·50·75·100 으로도 찍을 수 있다.
 */
function ProgressControl({
  value,
  enabled,
  onCommit,
  onOpen,
  count,
  big = false,
}: {
  value: number;
  enabled: boolean;
  onCommit: (v: number) => Promise<string | null>;
  onOpen: () => void;
  /** 세부 항목이 있으면 진행률은 체크로 계산된다 — 끌지 못하게 막는다 */
  count?: ItemCount;
  /** 폰 화면 — 손가락으로 잡을 수 있게 굵게 */
  big?: boolean;
}) {
  const [draft, setDraft] = useState(value);
  const [busy, setBusy] = useState(false);
  /** 밖에서 값이 바뀐 것과 내가 끌고 있는 것을 구분한다 */
  const seen = useRef(value);
  /** 같은 값을 두 번 보내지 않는다 (손 뗄 때와 칸을 벗어날 때가 겹친다) */
  const sent = useRef(value);

  useEffect(() => {
    if (value !== seen.current) {
      seen.current = value;
      sent.current = value;
      setDraft(value);
    }
  }, [value]);

  async function commit(v: number) {
    if (v === sent.current) return;
    sent.current = v;
    setBusy(true);
    const err = await onCommit(v);
    setBusy(false);
    if (err) {
      sent.current = value;
      setDraft(value);
      window.alert(`진행률을 저장하지 못했습니다: ${err}`);
    }
  }

  // 세부 항목이 있는 업무는 체크 수가 곧 진행률이다. 끌어서 바꾸면 두 숫자가 따로 논다.
  if (count && count.total > 0) {
    return (
      <button
        type="button"
        onClick={onOpen}
        title={`세부 항목 ${count.done}/${count.total} — 눌러서 체크하세요`}
        className="w-full flex items-center gap-2 rounded hover:bg-blue-50 px-1 -mx-1"
      >
        <div
          className={cn(
            "flex-1 rounded-full bg-gray-100 overflow-hidden min-w-[36px]",
            big ? "h-2" : "h-1.5"
          )}
        >
          <div className="h-full bg-blue-500" style={{ width: `${value}%` }} />
        </div>
        <span
          className={cn(
            "shrink-0 text-right whitespace-nowrap",
            big ? "text-sm font-medium text-gray-700" : "text-xs text-gray-500"
          )}
        >
          {value}%
          <span className="block text-[11px] text-gray-400 leading-tight">
            {count.done}/{count.total}
          </span>
        </span>
      </button>
    );
  }

  if (!enabled) {
    return (
      <div className="flex items-center gap-2">
        <div
          className={cn(
            "flex-1 rounded-full bg-gray-100 overflow-hidden min-w-[40px]",
            big ? "h-2" : "h-1.5"
          )}
        >
          <div className="h-full bg-blue-500" style={{ width: `${value}%` }} />
        </div>
        <span
          className={cn(
            "shrink-0 text-right whitespace-nowrap w-10",
            big ? "text-sm font-medium text-gray-700" : "text-xs text-gray-500"
          )}
        >
          {value}%
        </span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1.5">
      <input
        type="range"
        min={0}
        max={100}
        step={5}
        value={draft}
        disabled={busy}
        onChange={(e) => setDraft(Number(e.target.value))}
        onPointerUp={() => commit(draft)}
        onKeyUp={() => commit(draft)}
        onBlur={() => commit(draft)}
        title="끌어서 진행률 조절 — 손을 떼면 저장됩니다"
        aria-label="진행률"
        className={cn(
          "no-print flex-1 min-w-[44px] accent-blue-600 cursor-pointer disabled:opacity-50",
          big ? "h-5" : "h-4"
        )}
      />
      {/* 인쇄할 때는 막대가 안 나오므로 칸이 비지 않게 띠를 하나 더 둔다 */}
      <div className="hidden print:block flex-1 h-1.5 rounded-full bg-gray-100 overflow-hidden">
        <div className="h-full bg-blue-500" style={{ width: `${draft}%` }} />
      </div>
      <span
        className={cn(
          "shrink-0 text-right whitespace-nowrap w-9",
          big ? "text-sm font-medium text-gray-700" : "text-xs text-gray-500",
          busy && "opacity-40"
        )}
      >
        {draft}%
      </span>
      {/* 세부 항목으로 나누러 들어가는 문 — 막대만 보이면 여기가 있는 줄 모른다 */}
      <button
        type="button"
        onClick={onOpen}
        title="세부 항목으로 나누기 / 숫자로 입력"
        className={cn(
          "no-print shrink-0 rounded border border-gray-300 text-gray-500 hover:bg-blue-50 hover:border-blue-300 hover:text-blue-700 whitespace-nowrap",
          big ? "px-2.5 py-1.5 text-sm" : "px-1.5 py-0.5 text-[11px]"
        )}
      >
        항목
      </button>
    </div>
  );
}

/**
 * 별표 — 사람마다 따로다.
 *
 * 팀장이 "이거 중요하다"고 찍는 표시가 아니라, 보는 사람이 자기 기준으로
 * 오늘 챙길 것을 올려두는 자리다. 그래서 남의 화면에는 보이지 않고,
 * 켜 두면 표 맨 위로 올라온다.
 */
function StarButton({
  on,
  onClick,
  disabled,
  big = false,
}: {
  on: boolean;
  onClick: () => void;
  disabled?: boolean;
  big?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={on ? "별표 지우기 (나에게만 보입니다)" : "별표 달기 — 맨 위로 올라옵니다"}
      aria-label="별표"
      className={cn(
        "no-print leading-none disabled:opacity-40",
        big ? "text-xl" : "text-base",
        on ? "text-amber-400" : "text-gray-300 hover:text-amber-300"
      )}
    >
      {on ? "★" : "☆"}
    </button>
  );
}

/** 팀장·그룹장이 업무를 줄 때 다는 긴급 표시 */
function UrgentChip({
  on,
  canSet,
  busy,
  onToggle,
}: {
  on: boolean;
  canSet: boolean;
  busy?: boolean;
  onToggle: () => void;
}) {
  // 꺼져 있을 때는 아예 자리를 차지하지 않는다 — 모든 줄에 「긴급」이 떠 있으면 뜻이 없어진다.
  // 켜는 것은 제목 수정 창에서 한다.
  if (!on) return null;
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={!canSet || busy}
      title={
        canSet
          ? on
            ? "긴급 표시 끄기"
            : "긴급으로 표시 (받는 사람 화면에서 위로 올라갑니다)"
          : "팀장이 긴급으로 표시한 업무입니다"
      }
      className={cn(
        "no-print mr-1.5 align-middle text-[11px] px-1.5 py-0.5 rounded font-bold whitespace-nowrap",
        "bg-red-600 text-white",
        canSet ? "hover:bg-red-700" : "cursor-default"
      )}
    >
      긴급
    </button>
  );
}

/**
 * 노란 물음표 — 이 업무에 대해 묻는 자리.
 *
 * 모르면 물어보고 가야 하는데 그동안 길이 없었다. 줄마다 눈에 띄는 자리에 둔다.
 * 답을 기다리는 질문이 있으면 노랗게 차오르고, 다 답이 달렸으면 조용한 회색이 된다.
 */
function AskButton({
  count,
  onClick,
  big = false,
}: {
  count?: QuestionCount;
  onClick: () => void;
  big?: boolean;
}) {
  const open = count?.open ?? 0;
  const total = count?.total ?? 0;
  const title =
    open > 0
      ? `답변을 기다리는 질문 ${open}건`
      : total > 0
        ? `질문 ${total}건 (답변 완료)`
        : "이 업무가 이해되지 않으면 여기서 물어보세요";

  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={title}
      className={cn(
        "no-print inline-flex items-center justify-center gap-0.5 rounded-full border font-bold whitespace-nowrap",
        big ? "px-3 py-2 text-sm" : "w-7 h-7 text-sm",
        open > 0
          ? "bg-amber-400 border-amber-500 text-white hover:bg-amber-500"
          : total > 0
            ? "bg-amber-50 border-amber-300 text-amber-700 hover:bg-amber-100"
            : "border-gray-300 text-gray-400 hover:bg-amber-50 hover:text-amber-600 hover:border-amber-300"
      )}
    >
      ?{open > 0 && <span className="text-[11px] font-semibold">{open}</span>}
      {big && <span className="font-medium">질문</span>}
    </button>
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
/**
 * 눌러서 고치는 칸.
 *
 * 정렬은 className 이 아니라 align 으로 받는다.
 * cn() 은 클래스를 그냥 이어붙이기만 해서 "text-left"와 "text-center"를 같이 주면
 * 둘이 싸우고 CSS 순서로 승부가 난다 (가운데 정렬이 안 먹는 사고가 있었다).
 */
function Cell({
  enabled,
  onClick,
  title,
  className,
  align = "left",
  children,
}: {
  enabled: boolean;
  onClick: () => void;
  title: string;
  className?: string;
  align?: "left" | "center";
  children: React.ReactNode;
}) {
  const alignClass = align === "center" ? "text-center" : "text-left";
  if (!enabled)
    return <span className={cn("block", alignClass, className)}>{children}</span>;
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={cn(
        "block w-full rounded px-1 -mx-1 hover:bg-blue-50 hover:ring-1 hover:ring-blue-200",
        alignClass,
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
  canUrgent = false,
  onItems,
}: {
  target: EditTarget;
  onClose: () => void;
  patch: (id: string, fields: Record<string, unknown>) => Promise<string | null>;
  noon: (s: string) => string | null;
  today: string;
  /** 긴급 표시를 달 수 있는 사람인지 (팀장·실장·그룹장) */
  canUrgent?: boolean;
  /** 상세내용을 저장한 뒤 세부 항목 창을 열어주는 길 */
  onItems?: (t: TaskWithEffectiveStatus) => void;
}) {
  const { task: t, field } = target;
  const createdDay = t.created_at.slice(0, 10);

  if (field === "title") {
    return (
      <FieldPopup
        label="제목"
        hint={t.urgent ? "지금 긴급으로 표시되어 있습니다." : undefined}
        kind="text"
        value={t.title}
        placeholder="업무 제목"
        extraAction={
          canUrgent
            ? {
                label: t.urgent ? "긴급 표시 끄기" : "긴급으로 표시",
                danger: !t.urgent,
                run: () => patch(t.id, { urgent: !t.urgent }),
              }
            : undefined
        }
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
        hint="줄을 나눠서 1) 2) 3) 으로 적으면, 아래 버튼으로 체크 항목이 됩니다. 체크한 만큼 진행률이 자동으로 계산됩니다."
        kind="textarea"
        value={t.description ?? ""}
        placeholder="세부 지시사항, 확인할 점 등"
        onSave={(next) => patch(t.id, { description: next.trim() || null })}
        extraAction={{
          label: "저장하고 세부 항목으로 나누기",
          run: async (draft) => {
            const err = await patch(t.id, { description: draft.trim() || null });
            if (err) return err;
            onItems?.(t);
            return null;
          },
        }}
        onClose={onClose}
      />
    );
  }

  if (field === "start_date") {
    return (
      <FieldPopup
        label="진행일정"
        hint="이 업무를 언제부터 하는지(착수일)입니다. 비워두면 지시일부터 본 것으로 봅니다."
        kind="date"
        value={t.start_date ?? ""}
        check={(v) => checkStart(v, t.due_date)}
        onSave={(next) => patch(t.id, { start_date: next || null })}
        onClose={onClose}
      />
    );
  }

  if (field === "due_date") {
    return (
      <FieldPopup
        label="완료계획일정"
        hint="언제까지 끝내기로 한 날입니다. 이 날짜가 지나면 지연으로 표시되고, 소요일·일정대비·고과평가 수치가 모두 이 날을 기준으로 계산됩니다."
        kind="date"
        value={t.due_date ?? ""}
        min={createdDay}
        check={(v) => checkDue(v, t.start_date)}
        onSave={(next) => patch(t.id, { due_date: next || null })}
        onClose={onClose}
      />
    );
  }

  if (field === "completed_at") {
    const done = t.effective_status === "완료";
    return (
      <FieldPopup
        label="완료여부"
        hint={
          done
            ? "실제로 끝낸 날입니다. 고치면 소요일과 일정 준수 수치에 바로 반영됩니다."
            : "끝냈으면 끝낸 날짜를 넣고 저장하세요. 완료로 바뀝니다. 며칠 전에 끝낸 일이면 그 날짜를 넣으시면 됩니다."
        }
        kind="date"
        value={t.completed_at ? t.completed_at.slice(0, 10) : today}
        min={createdDay}
        max={today}
        check={(v) => checkDone(v)}
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

  /*
    백 일 넘게 벌어졌으면 일정이 아니라 날짜를 잘못 적었을 가능성이 크다
    (연도를 2025로 친 것 같은). 눈에 띄게 ⚠ 를 붙여 찾아보게 한다.
  */
  const odd = Math.abs(d) > ODD_DIFF_DAYS;
  const mark = odd ? (
    <span
      className="block text-[11px] font-normal text-amber-600"
      title="날짜가 너무 많이 벌어졌습니다. 완료계획일의 연도를 확인해보세요."
    >
      ⚠ 날짜 확인
    </span>
  ) : null;

  if (d > 0) {
    return (
      <span className="text-red-600 font-semibold">
        {d}일 초과
        {!done && !odd && <span className="block text-[11px] font-normal">진행중</span>}
        {mark}
      </span>
    );
  }
  if (d === 0) {
    return <span className="text-gray-600">{done ? "계획대로" : "오늘 마감"}</span>;
  }
  return done ? (
    <span className="text-emerald-600 font-semibold">
      {-d}일 단축
      {mark}
    </span>
  ) : (
    <span className="text-gray-500">
      D-{-d}
      {mark}
    </span>
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
  linkNames = false,
}: {
  taskId: string;
  current: string | null;
  deputies: string[];
  options: Profile[];
  fallback?: Profile;
  onDone?: () => void;
  /** 이름을 누르면 그 팀원 화면으로 간다 (팀장·실장만) */
  linkNames?: boolean;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const fromProps = [current, ...deputies].filter(Boolean) as string[];

  /**
   * 화면에 보이는 체크 상태는 따로 들고 있는다.
   *
   * 예전에는 props 에서 매번 다시 계산했다. 그래서 한 명을 체크하고
   * 화면이 새로 불러오기 전에 두 번째 사람을 체크하면 첫 번째가 조용히 풀렸다.
   * (연달아 두 명 넣을 때 한 명만 들어가던 사고)
   */
  const [local, setLocal] = useState<string[] | null>(null);
  const checked = local ?? fromProps;

  // 목록에는 지금 담당으로 걸려 있는 사람도 반드시 넣는다.
  // 퇴사·대기 상태라 고를 수 없는 사람이 담당이면, 목록에 없어서 체크를 풀 수가 없었다.
  const list =
    fallback && !options.some((o) => o.id === fallback.id) ? [...options, fallback] : options;

  async function toggle(id: string) {
    const next = checked.includes(id) ? checked.filter((c) => c !== id) : [...checked, id];
    setLocal(next); // 누른 즉시 화면에 반영 — 연달아 눌러도 앞의 선택이 안 사라진다
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
      setLocal(null); // 저장이 안 됐으면 화면도 원래대로 되돌린다
      setError("저장 실패");
      return;
    }
    onDone?.();
  }

  const checkedPeople = checked
    .map((id) => list.find((p) => p.id === id))
    .filter(Boolean) as Profile[];

  const checkedNames = checkedPeople.map((p) => p.name).join(", ");

  return (
    <div className="space-y-1">
      {linkNames && checkedPeople.length > 0 ? (
        /* 이름을 누르면 그 팀원 화면으로, 연필을 누르면 담당자 바꾸기 */
        <div className="flex items-start gap-1">
          <div className="min-w-0 flex-1 flex flex-wrap gap-x-1 gap-y-0.5">
            {checkedPeople.map((p) => (
              <Link
                key={p.id}
                href={`/tasks?as=${p.id}`}
                title={`${p.name} 님 업무 화면 보기`}
                className="text-sm text-blue-700 hover:underline break-keep"
              >
                {p.name}
              </Link>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            disabled={saving}
            title="담당자 바꾸기"
            className="shrink-0 text-xs px-1.5 py-0.5 rounded border border-gray-300 text-gray-500 hover:bg-gray-50 disabled:opacity-50"
          >
            ✎
          </button>
        </div>
      ) : (
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
      )}

      {open && (
        <div className="rounded-md border border-gray-200 bg-white p-2 space-y-1 max-h-44 overflow-y-auto">
          <p className="text-[11px] text-gray-400 break-keep pb-0.5">
            맨 위에 체크한 사람이 담당, 나머지는 참여입니다.
          </p>
          {list.map((p) => {
            const at = checked.indexOf(p.id);
            return (
              <label key={p.id} className="flex items-center gap-2 text-xs cursor-pointer py-0.5">
                <input
                  type="checkbox"
                  checked={at >= 0}
                  disabled={saving}
                  onChange={() => toggle(p.id)}
                  className="w-4 h-4"
                />
                <span className="break-keep">
                  {p.name}
                  {p.position ? ` ${p.position}` : ""}
                  {at === 0 && <span className="text-blue-600"> (담당)</span>}
                  {at > 0 && <span className="text-gray-400"> (참여)</span>}
                  {p.status === "가입대기" && <span className="text-amber-600"> (가입대기)</span>}
                </span>
              </label>
            );
          })}
          {/* 담당을 풀면 다음 사람이 담당이 된다 — 모르고 바꾸는 일이 없게 미리 알려준다 */}
          {checked.length > 1 && (
            <p className="text-[11px] text-amber-700 break-keep pt-0.5 border-t border-gray-100">
              담당({checkedPeople[0]?.name})을 체크 해제하면 {checkedPeople[1]?.name} 님이 담당이
              되고, 확인 여부는 다시 받습니다.
            </p>
          )}
          {list.length === 0 && (
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

function Th({
  className,
  children,
  grip,
  onGrip,
  stick = false,
}: {
  className?: string;
  children: React.ReactNode;
  /** 이 칸의 폭 이름 — 주면 오른쪽 경계를 끌어 폭을 조절할 수 있다 */
  grip?: string;
  onGrip?: (key: string, e: React.PointerEvent) => void;
  /** 표를 내려도 머리줄이 따라오게 할지 (배경을 칠해야 줄이 비쳐 보이지 않는다) */
  stick?: boolean;
}) {
  return (
    <th
      className={cn(
        "relative px-2 py-2.5 font-medium text-center border-b border-gray-300 border-r border-gray-200 last:border-r-0 overflow-hidden",
        stick && "sticky top-0 z-30 ledger-head print:static print:bg-transparent",
        className
      )}
    >
      {children}
      {grip && onGrip && (
        <span
          onPointerDown={(e) => onGrip(grip, e)}
          title="끌어서 칸 폭 조절"
          className="absolute top-0 right-0 h-full w-2 cursor-col-resize hover:bg-blue-300/60"
        />
      )}
    </th>
  );
}

function Td({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    // overflow-hidden: 칸보다 긴 글자가 옆 칸을 덮지 않도록 막는다.
    // (작성일 "2026-09-15" 가 좁은 칸에서 업무내용 위로 넘쳐 들어간 적이 있다)
    <td
      className={cn(
        "px-2 py-2.5 align-top border-r border-gray-100 last:border-r-0 overflow-hidden",
        className
      )}
    >
      {children}
    </td>
  );
}
